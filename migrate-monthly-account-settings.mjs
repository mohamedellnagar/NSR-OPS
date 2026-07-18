/**
 * Idempotent runner for drizzle/0063_monthly_account_settings.sql.
 *
 *   node migrate-monthly-account-settings.mjs
 */
import mysql from "mysql2/promise";
import "dotenv/config";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [tables] = await conn.query(`SHOW TABLES LIKE 'monthly_account_settings'`);
    if (tables.length > 0) {
      console.log("  = monthly_account_settings already exists");
    } else {
      await conn.execute(`
        CREATE TABLE \`monthly_account_settings\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`year\` INT NOT NULL,
          \`month\` INT NOT NULL,
          \`openingInventory\` DECIMAL(14,3) NOT NULL DEFAULT '0',
          \`closingInventory\` DECIMAL(14,3) NOT NULL DEFAULT '0',
          \`discounts\` DECIMAL(14,3) NOT NULL DEFAULT '0',
          \`notes\` TEXT NULL,
          \`createdBy\` INT NULL,
          \`updatedBy\` INT NULL,
          \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_mas_year_month\` (\`year\`, \`month\`)
        )
      `);
      console.log("  + monthly_account_settings created");
    }

    const [idx] = await conn.query(
      `SHOW INDEX FROM \`monthly_account_settings\` WHERE Key_name='uq_mas_year_month'`
    );
    console.log(
      idx.length > 0
        ? "  = unique (year, month) in place"
        : "  ! WARNING: unique index uq_mas_year_month is missing"
    );

    const [[count]] = await conn.query(`SELECT COUNT(*) AS n FROM \`monthly_account_settings\``);
    console.log(`  ~ ${count.n} month(s) configured`);
    console.log("\nDone.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
