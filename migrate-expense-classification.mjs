/**
 * Idempotent migration runner for drizzle/0062_expense_classification.sql.
 *
 * Adds expenseType / expenseCategoryCode / paymentMethod to `invoices` and
 * `free_invoices`, then backfills them from the legacy `expenseCategory`.
 * Safe to run repeatedly — every step checks current state first.
 *
 *   node migrate-expense-classification.mjs
 */
import mysql from "mysql2/promise";
import "dotenv/config";

const CATEGORY_ENUM = `ENUM('FOOD_PURCHASES','SALARIES','RENT','UTILITIES','GAS','PACKAGING','CLEANING','MAINTENANCE','DELIVERY','APP_COMMISSIONS','MARKETING','BANK_FEES','EQUIPMENT_ASSETS','OWNER_DRAW','TAXES','LICENSES','CHARCOAL','BUTCHERY','OTHER')`;

const NEW_COLUMNS = [
  { name: "expenseType", ddl: "ENUM('OPERATIONAL','NON_OPERATIONAL') NULL", after: "expenseCategory" },
  { name: "expenseCategoryCode", ddl: `${CATEGORY_ENUM} NULL`, after: "expenseType" },
  { name: "paymentMethod", ddl: "ENUM('CASH','BANK_TRANSFER','CARD','CHEQUE','OTHER') NULL", after: "expenseCategoryCode" },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    // Each table's backfill: [legacy source column, value(s), expenseType, expenseCategoryCode]
    const BACKFILLS = {
      invoices: [
        ["expenseCategory IN ('operational','fixed')", "OPERATIONAL", "OTHER"],
        ["expenseCategory='maintenance'", "OPERATIONAL", "MAINTENANCE"],
        ["expenseCategory='other'", null, "OTHER"],
      ],
      free_invoices: [
        ["expenseCategory IN ('operational','fixed')", "OPERATIONAL", "OTHER"],
        ["expenseCategory='maintenance'", "OPERATIONAL", "MAINTENANCE"],
        ["expenseCategory='other'", null, "OTHER"],
      ],
      monthly_payments: [
        ["category='salaries'", "OPERATIONAL", "SALARIES"],
        ["category='rent'", "OPERATIONAL", "RENT"],
        ["category='utilities'", "OPERATIONAL", "UTILITIES"],
        ["category='other'", null, "OTHER"],
      ],
    };

    for (const [table, rules] of Object.entries(BACKFILLS)) {
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
      const existing = new Set(cols.map((c) => c.Field));
      // monthly_payments has no expenseCategory column; anchor after `notes`.
      const anchor = existing.has("expenseCategory") ? "expenseCategory" : "notes";

      for (const col of NEW_COLUMNS) {
        if (existing.has(col.name)) {
          console.log(`  = ${table}.${col.name} already exists`);
          continue;
        }
        const afterCol = col.after === "expenseCategory" ? anchor : col.after;
        const after = existing.has(afterCol) ? ` AFTER \`${afterCol}\`` : "";
        await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${col.name}\` ${col.ddl}${after}`);
        existing.add(col.name);
        console.log(`  + ${table}.${col.name} added`);
      }

      // ── Backfill from the legacy category (only untouched rows) ──
      for (const [where, type, code] of rules) {
        const sets = type
          ? `expenseType='${type}', expenseCategoryCode='${code}'`
          : `expenseCategoryCode='${code}'`;
        const guard = type
          ? "expenseType IS NULL AND expenseCategoryCode IS NULL"
          : "expenseCategoryCode IS NULL";
        const [r] = await conn.execute(`UPDATE \`${table}\` SET ${sets} WHERE ${where} AND ${guard}`);
        if (r.affectedRows > 0) console.log(`  ~ ${table}: ${where} -> ${r.affectedRows} row(s)`);
      }

      const [[pending]] = await conn.query(
        `SELECT COUNT(*) AS n FROM \`${table}\` WHERE expenseType IS NULL OR expenseCategoryCode IS NULL`
      );
      console.log(`  ! ${table}: ${pending.n} row(s) still need classification by the user`);
    }

    // Index used by the monthly-accounts month filter.
    const [idx] = await conn.query(`SHOW INDEX FROM \`free_invoices\` WHERE Key_name='idx_fi_date'`);
    if (idx.length === 0) {
      await conn.execute("CREATE INDEX `idx_fi_date` ON `free_invoices` (`date`)");
      console.log("  + free_invoices.idx_fi_date created");
    } else {
      console.log("  = free_invoices.idx_fi_date already exists");
    }

    console.log("\nDone.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
