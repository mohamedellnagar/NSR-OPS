/**
 * check-schema-drift.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Compares the database pointed to by DATABASE_URL against the schema the code
 * expects, and prints the exact ALTER statements needed to close the gap.
 *
 * This exists because the app has silently broken twice on columns that were in
 * drizzle/schema.ts but missing from the actual database — `carryForwardEditReason`
 * (broke the daily accounts page) and ten columns on `monthly_stock_snapshots`
 * (broke the financial KPI with a 500). Neither failure was obvious from the UI.
 *
 *   node check-schema-drift.mjs          # report only
 *   node check-schema-drift.mjs --fix    # also APPLY the missing columns
 *
 * Reads drizzle/expected-schema.json, generated from drizzle/schema.ts. Only
 * ADDITIVE differences are reported: columns the code needs that the database
 * lacks. Extra columns in the database are listed separately and never dropped.
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import "dotenv/config";

const APPLY = process.argv.includes("--fix");

function loadExpected() {
  try {
    return JSON.parse(readFileSync(new URL("./drizzle/expected-schema.json", import.meta.url), "utf8"));
  } catch (err) {
    throw new Error(
      "تعذّر قراءة drizzle/expected-schema.json — تأكد أنك تشغّل الأمر من جذر المشروع"
    );
  }
}

/** A column the code requires but the DB lacks must be addable — i.e. nullable
 *  or with a default. NOT NULL without a default would fail on a non-empty table. */
function buildAddColumnSql(table, col) {
  const nullable = col.notNull && !col.hasDefault ? " NULL" : col.notNull ? " NOT NULL" : " NULL";
  return `ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.sqlType}${nullable};`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const expected = loadExpected();
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const dbName = conn.config.database;
    console.log(`قاعدة البيانات: ${dbName}`);
    console.log(`المتوقع: ${Object.keys(expected).length} جدول\n`);

    const [rows] = await conn.query(
      `SELECT table_name AS t, column_name AS c
         FROM information_schema.columns WHERE table_schema = ?`,
      [dbName]
    );
    const live = new Map();
    for (const r of rows) {
      const t = String(r.t ?? r.TABLE_NAME);
      const c = String(r.c ?? r.COLUMN_NAME);
      if (!live.has(t)) live.set(t, new Set());
      live.get(t).add(c);
    }

    const missingTables = [];
    const missingColumns = [];

    for (const [table, cols] of Object.entries(expected)) {
      const liveCols = live.get(table);
      if (!liveCols) { missingTables.push(table); continue; }
      for (const col of cols) {
        if (!liveCols.has(col.name)) missingColumns.push({ table, col });
      }
    }

    if (missingTables.length === 0 && missingColumns.length === 0) {
      console.log("✅ قاعدة البيانات مطابقة تمامًا — لا يوجد أي نقص.");
      return;
    }

    if (missingTables.length > 0) {
      console.log(`⚠️  جداول ناقصة تمامًا (${missingTables.length}):`);
      for (const t of missingTables) console.log(`   - ${t}`);
      console.log("   هذه تحتاج migration كامل، ولا يعالجها --fix.\n");
    }

    if (missingColumns.length > 0) {
      console.log(`⚠️  أعمدة ناقصة (${missingColumns.length}):\n`);
      const byTable = new Map();
      for (const m of missingColumns) {
        if (!byTable.has(m.table)) byTable.set(m.table, []);
        byTable.get(m.table).push(m.col);
      }
      for (const [table, cols] of byTable) {
        console.log(`   ${table}: ${cols.map((c) => c.name).join(", ")}`);
      }

      console.log("\n── الأوامر المطلوبة ──");
      for (const { table, col } of missingColumns) console.log(buildAddColumnSql(table, col));

      if (APPLY) {
        console.log("\n── التطبيق ──");
        let ok = 0, failed = 0;
        for (const { table, col } of missingColumns) {
          const sql = buildAddColumnSql(table, col);
          try {
            await conn.query(sql);
            console.log(`   ✅ ${table}.${col.name}`);
            ok++;
          } catch (err) {
            console.log(`   ❌ ${table}.${col.name} — ${err.message}`);
            failed++;
          }
        }
        console.log(`\nتم: ${ok} عمود${failed ? ` | فشل: ${failed}` : ""}`);
      } else {
        console.log("\nشغّل الأمر مع --fix لتطبيقها تلقائيًا.");
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("فشل الفحص:", err.message);
  process.exit(1);
});
