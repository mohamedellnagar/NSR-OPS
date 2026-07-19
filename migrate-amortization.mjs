/**
 * migrate-amortization.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds `amortizeMonths` to invoices and free_invoices.
 *
 * 1  = charge the whole amount to the invoice's own month (existing behaviour,
 *      so nothing changes for data already entered).
 * N  = spread it evenly over N months starting from the invoice month.
 *
 * One mechanism covers two accounting rules the system was breaking:
 *   - matching: a rent or licence payment covering several months should be
 *     charged to those months, not entirely to the one it was paid in.
 *   - depreciation: equipment is consumed over its useful life; amortizeMonths
 *     = 36 spreads it over three years instead of wiping out one month.
 *
 *   node migrate-amortization.mjs
 */
import mysql from "mysql2/promise";
import "dotenv/config";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    for (const table of ["invoices", "free_invoices"]) {
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'amortizeMonths'`);
      if (cols.length > 0) { console.log(`  = ${table}.amortizeMonths already exists`); continue; }
      await conn.execute(
        `ALTER TABLE \`${table}\` ADD COLUMN \`amortizeMonths\` SMALLINT NOT NULL DEFAULT 1`
      );
      console.log(`  + ${table}.amortizeMonths added (default 1 — no behaviour change)`);
    }
    for (const table of ["invoices", "free_invoices"]) {
      const [[n]] = await conn.query(
        `SELECT COUNT(*) AS n FROM \`${table}\` WHERE amortizeMonths > 1`
      );
      console.log(`  ~ ${table}: ${n.n} invoice(s) currently spread over more than one month`);
    }
    console.log("\nDone.");
  } finally {
    await conn.end();
  }
}
main().catch((e) => { console.error("Migration failed:", e.message); process.exit(1); });
