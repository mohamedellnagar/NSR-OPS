/**
 * sync-import.ts
 * Imports data from a JSON file exported by sync-export.ts.
 * Called by the Settings page after the user uploads the JSON.
 */
import { getDb } from "./db";

const BATCH = 200;

async function getLocalCols(db: any, table: string): Promise<string[]> {
  const [rows] = await db.execute(
    "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION",
    [table]
  );
  return (rows as any[]).map((r: any) => r.COLUMN_NAME);
}

async function replaceTable(db: any, table: string, rows: any[]): Promise<number> {
  if (!rows?.length) {
    await db.execute(`DELETE FROM \`${table}\``);
    return 0;
  }

  const localCols = await getLocalCols(db, table);
  const allCols   = Object.keys(rows[0]);
  const cols      = allCols.filter(c => localCols.includes(c));
  if (!cols.length) return 0;

  await db.execute(`DELETE FROM \`${table}\``);

  const colList = cols.map((c: string) => `\`${c}\``).join(", ");
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map((row: any) => cols.map((c: string) => {
      const v = row[c];
      if (v === null || v === undefined) return null;
      if (typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
      return v;
    }));
    await db.execute(`INSERT IGNORE INTO \`${table}\` (${colList}) VALUES ?`, [values]);
    inserted += batch.length;
  }
  return inserted;
}

export interface ImportResult {
  tables: { table: string; strategy: string; rows: number }[];
  durationMs: number;
}

export async function importSyncData(payload: any): Promise<ImportResult> {
  const start = Date.now();
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  if (payload.version !== 1) throw new Error("صيغة الملف غير مدعومة");

  const t = payload.tables;
  const results: { table: string; strategy: string; rows: number }[] = [];

  await db.execute("SET FOREIGN_KEY_CHECKS = 0");

  try {
    // 1. Invoices — replace
    for (const [tbl, data] of [
      ["invoices",                  t.invoices],
      ["invoice_items",             t.invoice_items],
      ["invoice_payment_history",   t.invoice_payment_history],
      ["kitchen_daily_production",  t.kitchen_daily_production],
      ["kitchen_production_materials", t.kitchen_production_materials],
      ["daily_accounts",            t.daily_accounts],
    ] as [string, any[]][]) {
      const rows = await replaceTable(db, tbl, data ?? []);
      results.push({ table: tbl, strategy: "replace", rows });
    }

    // 2. Raw materials — UPDATE qty + prices only
    const matRows: any[] = t.raw_materials_update ?? [];
    let updated = 0;
    for (const row of matRows) {
      const setCols = ["currentQuantity", "lastPurchasePrice", "averageCost", "minimumQuantity"]
        .filter(c => row[c] !== undefined && row[c] !== null);
      if (!setCols.length) continue;
      const setClause = setCols.map(c => `\`${c}\` = ?`).join(", ");
      const vals = setCols.map(c => row[c]);
      await (db as any).execute(`UPDATE raw_materials SET ${setClause} WHERE id = ?`, [...vals, row.id]);
      updated++;
    }
    results.push({ table: "raw_materials", strategy: "update_qty_price", rows: updated });

  } finally {
    await db.execute("SET FOREIGN_KEY_CHECKS = 1");
  }

  return { tables: results, durationMs: Date.now() - start };
}
