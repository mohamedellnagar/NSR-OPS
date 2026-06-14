/**
 * cloud-sync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls a full copy of all tables (schema + data) from the cloud (TiDB) DB
 * into the local DB pointed to by DATABASE_URL. The cloud DB is read-only here;
 * only the target (local) DB is modified.
 *
 * Usage:
 *   - Programmatic: await syncFromCloud()  (called by the Settings page button)
 *   - CLI: `node --env-file=.env --experimental-strip-types server/cloud-sync.ts`
 *
 * Requires env vars:
 *   - DATABASE_URL          → target (the one the app uses)
 *   - CLOUD_DATABASE_URL    → source (TiDB cloud)
 */
import mysql from "mysql2/promise";

export interface SyncProgress {
  table: string;
  rowsCopied: number;
}

export interface SyncResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tablesCopied: number;
  totalRows: number;
  tables: SyncProgress[];
}

const BATCH = 500;

async function getCloudConnection() {
  const url = process.env.CLOUD_DATABASE_URL;
  if (!url) throw new Error("CLOUD_DATABASE_URL غير مُعد في ملف .env");
  try {
    const conn = await mysql.createConnection(url);
    return conn;
  } catch (e: any) {
    if (e.code === "ETIMEDOUT" || e.code === "ECONNREFUSED" || e.code === "ECONNRESET") {
      throw new Error(
        "تعذّر الاتصال بقاعدة البيانات السحابية (ETIMEDOUT). " +
        "الأسباب المحتملة:\n" +
        "1. الـ cluster متوقف (Paused) — افتح tidbcloud.com واضغط Resume\n" +
        "2. IP جهازك غير مصرح به — أضف IP في IP Access List"
      );
    }
    throw e;
  }
}

async function getLocalConnection() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return mysql.createConnection({ uri: url, multipleStatements: true });
}

export async function syncFromCloud(
  onProgress?: (p: SyncProgress) => void
): Promise<SyncResult> {
  const startedAt = new Date();
  const cloud = await getCloudConnection();
  const local = await getLocalConnection();

  const results: SyncProgress[] = [];
  let totalRows = 0;

  try {
    // Disable FK checks on target so we can drop/recreate freely.
    await local.query("SET FOREIGN_KEY_CHECKS = 0");
    await local.query("SET UNIQUE_CHECKS = 0");
    await local.query("SET SQL_MODE = ''");

    // List all base tables in the cloud DB.
    const [tablesRows] = await cloud.query(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
    );
    const tableNames = (tablesRows as any[]).map((r) => r.TABLE_NAME || r.table_name);

    // Drop ALL existing tables on local first so we don't keep stale ones.
    const [localTables] = await local.query(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
    );
    for (const t of localTables as any[]) {
      const name = t.TABLE_NAME || t.table_name;
      await local.query(`DROP TABLE IF EXISTS \`${name}\``);
    }

    for (const tableName of tableNames) {
      // 1. Get CREATE TABLE statement from cloud (best-effort; TiDB-specific clauses removed).
      const [createRows] = await cloud.query(`SHOW CREATE TABLE \`${tableName}\``);
      let createSql: string = ((createRows as any[])[0]?.["Create Table"] || "") as string;
      if (!createSql) continue;

      // Strip TiDB-only / cloud-only clauses that vanilla MySQL doesn't accept.
      createSql = createSql
        .replace(/\/\*T!\d+ .*?\*\//g, "") // /*T![12345] ... */ TiDB hints
        .replace(/\/\*T!\[.*?\] .*?\*\//g, "") // /*T![clustered_index] */ etc
        .replace(/\bSHARD_ROW_ID_BITS\s*=\s*\d+/gi, "")
        .replace(/\bPRE_SPLIT_REGIONS\s*=\s*\d+/gi, "")
        .replace(/\bAUTO_RANDOM_BASE\s*=\s*\d+/gi, "")
        .replace(/\s+CLUSTERED\b/gi, "")
        .replace(/\s+NONCLUSTERED\b/gi, "");

      // FK constraint names must be globally unique in MySQL, and MySQL caps
      // identifiers at 64 chars. Replace each FK name with a short, deterministic,
      // table-scoped name `{table}_fk{N}` (truncated to 60 chars to stay safe).
      let fkCounter = 0;
      const shortTable = tableName.length > 40 ? tableName.slice(0, 40) : tableName;
      createSql = createSql.replace(
        /CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY/gi,
        () => {
          fkCounter += 1;
          return `CONSTRAINT \`${shortTable}_fk${fkCounter}\` FOREIGN KEY`;
        }
      );

      await local.query(createSql);

      // 2. Stream rows from cloud and bulk-insert into local.
      const [countRow] = (await cloud.query(`SELECT COUNT(*) AS c FROM \`${tableName}\``)) as any[];
      const totalForTable = Number((countRow as any[])[0]?.c || 0);

      let copied = 0;
      let offset = 0;

      // Get column list once (we'll use INSERT with explicit columns).
      const [cols] = await cloud.query(
        "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION",
        [tableName]
      );
      const colNames = (cols as any[]).map((c) => c.COLUMN_NAME || c.column_name);
      const colList = colNames.map((c) => `\`${c}\``).join(", ");

      while (offset < totalForTable) {
        const [batchRows] = await cloud.query(
          `SELECT ${colList} FROM \`${tableName}\` LIMIT ${BATCH} OFFSET ${offset}`
        );
        const rows = batchRows as any[];
        if (rows.length === 0) break;

        // Normalize values so mysql2 doesn't mangle JSON columns: arrays/objects
        // get JSON.stringify'd; Buffers and Dates stay as-is (mysql2 handles them).
        const values = rows.map((row) =>
          colNames.map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return null;
            if (v instanceof Date) return v;
            if (Buffer.isBuffer(v)) return v;
            if (typeof v === "object") return JSON.stringify(v);
            return v;
          })
        );
        await local.query(
          `INSERT INTO \`${tableName}\` (${colList}) VALUES ?`,
          [values]
        );

        copied += rows.length;
        offset += rows.length;
        if (rows.length < BATCH) break;
      }

      const progress = { table: tableName, rowsCopied: copied };
      results.push(progress);
      totalRows += copied;
      onProgress?.(progress);
    }

    await local.query("SET FOREIGN_KEY_CHECKS = 1");
    await local.query("SET UNIQUE_CHECKS = 1");

    const finishedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      tablesCopied: results.length,
      totalRows,
      tables: results,
    };
  } finally {
    await cloud.end().catch(() => {});
    await local.end().catch(() => {});
  }
}

// ─── Smart Partial Sync ───────────────────────────────────────────────────────
// Syncs only specific tables with table-specific strategies:
//  - invoices / invoice_items    → truncate + re-insert from cloud
//  - raw_materials               → UPDATE qty + prices only (no name/code changes)
//  - kitchen_daily_production    → truncate + re-insert
//  - kitchen_production_materials→ truncate + re-insert
//  - daily_accounts              → truncate + re-insert
// Missing columns in local are skipped safely.

export interface SmartSyncResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tables: { table: string; strategy: string; rows: number; cloudRows?: number; note?: string }[];
}

async function getCloudCols(cloud: mysql.Connection, table: string): Promise<string[]> {
  const [rows] = await cloud.query(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION",
    [table]
  ) as any[];
  return (rows as any[]).map((r: any) => r.COLUMN_NAME || r.column_name);
}

async function getLocalCols(local: mysql.Connection, table: string): Promise<string[]> {
  try {
    const [rows] = await local.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION",
      [table]
    ) as any[];
    return (rows as any[]).map((r: any) => r.COLUMN_NAME || r.column_name);
  } catch {
    return [];
  }
}

async function tableExists(local: mysql.Connection, table: string): Promise<boolean> {
  const [rows] = await local.query(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [table]
  ) as any[];
  return Number((rows as any[])[0]?.c || 0) > 0;
}

// Truncate + re-insert all rows (only columns that exist locally)
async function syncReplaceTable(
  cloud: mysql.Connection,
  local: mysql.Connection,
  table: string
): Promise<{ rows: number; cloudRows: number; note: string }> {
  if (!(await tableExists(local, table)))
    return { rows: 0, cloudRows: 0, note: "الجدول غير موجود محلياً" };

  const cloudCols = await getCloudCols(cloud, table);
  if (cloudCols.length === 0)
    return { rows: 0, cloudRows: 0, note: "الجدول غير موجود في السحابة" };

  const localCols = await getLocalCols(local, table);
  const cols = cloudCols.filter(c => localCols.includes(c));
  if (cols.length === 0)
    return { rows: 0, cloudRows: 0, note: `لا أعمدة مشتركة (سحابة: ${cloudCols.join(",")})` };

  const [countRow] = await cloud.query(`SELECT COUNT(*) AS c FROM \`${table}\``) as any[];
  const total = Number((countRow as any[])[0]?.c || 0);

  await local.query(`DELETE FROM \`${table}\``);

  if (total === 0)
    return { rows: 0, cloudRows: 0, note: "الجدول فارغ في السحابة" };

  const colList = cols.map(c => `\`${c}\``).join(", ");
  let copied = 0;
  let offset = 0;

  while (offset < total) {
    const [rows] = await cloud.query(
      `SELECT ${colList} FROM \`${table}\` LIMIT ${BATCH} OFFSET ${offset}`
    ) as any[];
    const batch = rows as any[];
    if (batch.length === 0) break;

    const values = batch.map(row => cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v;
      if (Buffer.isBuffer(v)) return v;
      if (typeof v === "object") return JSON.stringify(v);
      return v;
    }));

    try {
      await local.query(`INSERT IGNORE INTO \`${table}\` (${colList}) VALUES ?`, [values]);
    } catch (e: any) {
      return { rows: copied, cloudRows: total, note: `خطأ في الإدراج: ${e.message?.slice(0,80)}` };
    }
    copied += batch.length;
    offset += batch.length;
    if (batch.length < BATCH) break;
  }
  return { rows: copied, cloudRows: total, note: `✓ ${copied}/${total}` };
}

// Full replace: drop local table, recreate from cloud schema, copy all rows
// Same approach as syncFromCloud — guarantees schema match
async function fullReplaceTable(
  cloud: mysql.Connection,
  local: mysql.Connection,
  table: string
): Promise<{ rows: number; cloudRows: number; note: string }> {
  // Get CREATE TABLE from cloud
  const [createRows] = await cloud.query(`SHOW CREATE TABLE \`${table}\``) as any[];
  let createSql: string = ((createRows as any[])[0]?.["Create Table"] || "") as string;
  if (!createSql) return { rows: 0, cloudRows: 0, note: "الجدول غير موجود في السحابة" };

  // Strip TiDB-specific clauses
  createSql = createSql
    .replace(/\/\*T!\d+ .*?\*\//g, "")
    .replace(/\/\*T!\[.*?\] .*?\*\//g, "")
    .replace(/\bSHARD_ROW_ID_BITS\s*=\s*\d+/gi, "")
    .replace(/\bPRE_SPLIT_REGIONS\s*=\s*\d+/gi, "")
    .replace(/\bAUTO_RANDOM_BASE\s*=\s*\d+/gi, "")
    .replace(/\s+CLUSTERED\b/gi, "")
    .replace(/\s+NONCLUSTERED\b/gi, "");

  // Rename FK constraints to avoid conflicts
  let fkCounter = 0;
  const shortTable = table.length > 40 ? table.slice(0, 40) : table;
  createSql = createSql.replace(
    /CONSTRAINT\s+`[^`]+`\s+FOREIGN\s+KEY/gi,
    () => `CONSTRAINT \`${shortTable}_fk${++fkCounter}\` FOREIGN KEY`
  );

  // ── 1. Check cloud FIRST before touching local data ──
  const [countRow] = await cloud.query(`SELECT COUNT(*) AS c FROM \`${table}\``) as any[];
  const total = Number((countRow as any[])[0]?.c || 0);
  if (total === 0) return { rows: 0, cloudRows: 0, note: "الجدول فارغ في السحابة — البيانات المحلية محفوظة" };

  // ── 2. Find common columns ──
  const [cloudColsRows] = await cloud.query(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ORDINAL_POSITION",
    [table]
  ) as any[];
  const cloudCols2 = (cloudColsRows as any[]).map((c: any) => c.COLUMN_NAME || c.column_name);
  const localCols2 = await getLocalCols(local, table);
  const colNames = cloudCols2.filter((c: string) => localCols2.includes(c));
  if (colNames.length === 0)
    return { rows: 0, cloudRows: total, note: `لا أعمدة مشتركة — السحابة: [${cloudCols2.join(",")}] — المحلي: [${localCols2.join(",")}]` };
  const colList = colNames.map((c: string) => `\`${c}\``).join(", ");

  // ── 3. Only now delete local — cloud has data ──
  await local.query(`DELETE FROM \`${table}\``);

  let copied = 0, offset = 0;
  while (offset < total) {
    const [batchRows] = await cloud.query(`SELECT ${colList} FROM \`${table}\` LIMIT ${BATCH} OFFSET ${offset}`) as any[];
    const rows = batchRows as any[];
    if (rows.length === 0) break;
    const values = rows.map((row: any) => colNames.map((c: string) => {
      const v = row[c];
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v;
      if (Buffer.isBuffer(v)) return v;
      if (typeof v === "object") return JSON.stringify(v);
      return v;
    }));
    try {
      await local.query(`INSERT INTO \`${table}\` (${colList}) VALUES ?`, [values]);
    } catch (e: any) {
      return { rows: copied, cloudRows: total, note: `خطأ في الإدراج: ${e.message?.slice(0, 80)}` };
    }
    copied += rows.length;
    offset += rows.length;
    if (rows.length < BATCH) break;
  }
  return { rows: copied, cloudRows: total, note: `✓ ${copied}/${total}` };
}

export async function smartSyncFromCloud(
  onProgress?: (msg: string) => void
): Promise<SmartSyncResult> {
  const startedAt = new Date();
  const cloud = await getCloudConnection();
  const local = await getLocalConnection();
  const results: { table: string; strategy: string; rows: number; cloudRows?: number; note?: string }[] = [];

  try {
    await local.query("SET FOREIGN_KEY_CHECKS = 0");

    // ── 1. Invoices ──────────────────────────────────────────────────────────
    for (const t of ["invoices", "invoice_items", "invoice_payment_history", "invoice_audit_log"]) {
      onProgress?.(`مزامنة ${t}...`);
      const r = await syncReplaceTable(cloud, local, t);
      results.push({ table: t, strategy: "replace", ...r });
    }

    // ── 2. Raw materials (incl. semi-finished items, materialType='semi_finished'):
    //      UPDATE qty/prices for existing rows (no name/code overwrite), AND
    //      INSERT any new materials that exist in the cloud but not locally —
    //      this covers both new raw materials and new semi-finished materials,
    //      since both live in the same `raw_materials` table.
    onProgress?.("تحديث ومزامنة المواد الخام والمواد المصنّعة...");
    {
      const cloudCols = await getCloudCols(cloud, "raw_materials");
      const localCols = await getLocalCols(local, "raw_materials");
      const sharedCols = cloudCols.filter(c => localCols.includes(c));
      const updateCols = ["currentQuantity", "lastPurchasePrice", "averageCost", "minimumQuantity", "materialType"]
        .filter(c => localCols.includes(c));

      const [cloudRows] = await cloud.query(
        `SELECT ${sharedCols.map(c => `\`${c}\``).join(", ")} FROM raw_materials`
      ) as any[];
      const [localIdRows] = await local.query(`SELECT id FROM raw_materials`) as any[];
      const localIds = new Set((localIdRows as any[]).map(r => r.id));

      let updated = 0;
      let inserted = 0;
      const colList = sharedCols.map(c => `\`${c}\``).join(", ");
      for (const row of cloudRows as any[]) {
        if (localIds.has(row.id)) {
          // Existing material — update qty/price fields only (preserve local name/code edits)
          const setClauses = updateCols
            .filter(c => row[c] !== undefined && row[c] !== null)
            .map(c => `\`${c}\` = ?`).join(", ");
          if (!setClauses) continue;
          const vals = updateCols.filter(c => row[c] !== undefined && row[c] !== null).map(c => row[c]);
          await local.query(`UPDATE raw_materials SET ${setClauses} WHERE id = ?`, [...vals, row.id]);
          updated++;
        } else {
          // New material (raw or semi-finished) — insert full row from cloud
          const vals = sharedCols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return null;
            if (v instanceof Date) return v;
            if (Buffer.isBuffer(v)) return v;
            if (typeof v === "object") return JSON.stringify(v);
            return v;
          });
          try {
            await local.query(`INSERT IGNORE INTO raw_materials (${colList}) VALUES (${sharedCols.map(() => "?").join(", ")})`, vals);
            inserted++;
          } catch { /* skip rows that fail to insert (e.g. FK to missing category) */ }
        }
      }
      results.push({
        table: "raw_materials",
        strategy: "update_and_insert",
        rows: updated + inserted,
        cloudRows: (cloudRows as any[]).length,
        note: `✓ تحديث ${updated} — إضافة ${inserted} مادة جديدة`,
      });
    }

    // ── 3. Kitchen tables — FULL REPLACE (حذف القديم وإضافة الجديد) لكل بيانات
    //      المطبخ: الإنتاج، الجرد، الاستهلاك، التكلفة، المتبقي، والهدر.
    for (const t of [
      "kitchen_daily_pulls",          // الإنتاج اليومي الرئيسي
      "kitchen_production_counts",    // عدّادات الإنتاج
      "kitchen_daily_production",     // بيانات الإنتاج وتكلفة الوحدة (actualUnitCost)
      "kitchen_production_materials", // المواد المستهلكة في الإنتاج (تكلفة المطبخ)
      "kitchen_item_production",      // الإنتاج اليومي للأصناف والمتبقي
      "kitchen_inventory_counts",     // الجرد وتكلفة الاستهلاك (consumptionCost)
      "waste_logs",                   // الهدر وتكلفته (totalCost)
    ]) {
      onProgress?.(`مزامنة كاملة لبيانات المطبخ — ${t}...`);
      const r = await syncReplaceTable(cloud, local, t);
      results.push({ table: t, strategy: "replace", ...r });
    }

    // ── 4. Daily accounts ────────────────────────────────────────────────────
    onProgress?.("مزامنة الحسابات اليومية...");
    {
      const r = await syncReplaceTable(cloud, local, "daily_accounts");
      results.push({ table: "daily_accounts", strategy: "replace", ...r });
    }

    // ── 6. Everything else — full replace for any remaining table that exists
    //      in both cloud and local. Skips tables already handled above and a
    //      safety blacklist of local/environment-specific tables that must not
    //      be overwritten from the cloud (auth, app config, WhatsApp instance
    //      credentials, internal migration bookkeeping).
    const SAFETY_BLACKLIST = new Set([
      "users",               // local admin accounts / password hashes — overwriting could lock everyone out
      "app_settings",        // local app configuration
      "__drizzle_migrations",// internal migration bookkeeping
      "kv_store",            // local-only runtime key/value store
      "whatsapp_instances",  // local WhatsApp instance connection config/tokens
      "whatsapp_settings",
      "evolution_settings",
      "restaurant_wa_numbers",
    ]);
    const alreadyHandled = new Set(results.map((r) => r.table));
    alreadyHandled.add("raw_materials");

    const [cloudTableRows] = await cloud.query(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE'"
    ) as any[];
    const cloudTableNames: string[] = (cloudTableRows as any[]).map((r) => r.TABLE_NAME || r.table_name);

    for (const t of cloudTableNames) {
      if (alreadyHandled.has(t) || SAFETY_BLACKLIST.has(t)) continue;
      if (!(await tableExists(local, t))) continue;
      onProgress?.(`مزامنة كاملة لـ ${t}...`);
      const r = await syncReplaceTable(cloud, local, t);
      results.push({ table: t, strategy: "replace", ...r });
    }

    await local.query("SET FOREIGN_KEY_CHECKS = 1");

    const finishedAt = new Date();
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      tables: results,
    };
  } finally {
    await cloud.end().catch(() => {});
    await local.end().catch(() => {});
  }
}

// CLI entry: when run directly, do a one-shot sync and print result.
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("cloud-sync.ts") || process.argv[1].endsWith("cloud-sync.js"));

if (isMain) {
  syncFromCloud((p) => console.log(`[sync] ${p.table}: ${p.rowsCopied} rows`))
    .then((r) => {
      console.log("\n✅ Sync complete");
      console.log(`Tables: ${r.tablesCopied}, Rows: ${r.totalRows}, Duration: ${(r.durationMs / 1000).toFixed(1)}s`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("❌ Sync failed:", e);
      process.exit(1);
    });
}
