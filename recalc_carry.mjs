import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/matjari/.env' });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// جلب كل الأيام مرتبة تصاعدياً
const [days] = await conn.query('SELECT * FROM daily_accounts ORDER BY accountDate ASC');

console.log(`Found ${days.length} days to recalculate`);

let prevCarry = 0;

for (const day of days) {
  const date = day.accountDate;
  
  // جلب المصروفات الفعلية من invoice_payment_history مع JOIN لتجنّب orphan records
  const [suppRows] = await conn.query(
    `SELECT COALESCE(SUM(h.paidAmount),0) as total
     FROM invoice_payment_history h
     INNER JOIN invoices i ON h.invoiceId = i.id
     WHERE h.invoiceType = 'supplier'
     AND DATE(CONVERT_TZ(h.paymentDate, '+00:00', '+04:00') - INTERVAL 6 HOUR) = ?`,
    [date]
  );
  const expensesSupplier = Number(suppRows[0]?.total || 0);

  const [freeRows] = await conn.query(
    `SELECT COALESCE(SUM(h.paidAmount),0) as total
     FROM invoice_payment_history h
     INNER JOIN free_invoices fi ON h.invoiceId = fi.id
     WHERE h.invoiceType = 'free'
     AND DATE(CONVERT_TZ(h.paymentDate, '+00:00', '+04:00') - INTERVAL 6 HOUR) = ?`,
    [date]
  );
  const expensesFree = Number(freeRows[0]?.total || 0);

  const totalExpenses = expensesSupplier + expensesFree + parseFloat(day.expensesFixed || '0');
  
  const newCarry = (
    prevCarry +
    parseFloat(day.salesCash || '0') +
    parseFloat(day.supplyToRestaurant || '0') +
    parseFloat(day.supplyExtra || '0') -
    totalExpenses -
    parseFloat(day.supplyToManagement || '0')
  );

  const oldCarry = parseFloat(day.carryForwardToNext || '0');
  
  if (Math.abs(newCarry - oldCarry) > 0.01) {
    console.log(`${date}: OLD=${oldCarry.toFixed(3)} → NEW=${newCarry.toFixed(3)} (expenses: supplier=${expensesSupplier}, free=${expensesFree}, fixed=${day.expensesFixed})`);
    await conn.query('UPDATE daily_accounts SET carryForwardToNext = ? WHERE id = ?', [newCarry, day.id]);
  } else {
    console.log(`${date}: OK (${newCarry.toFixed(3)})`);
  }
  
  prevCarry = newCarry;
}

await conn.end();
console.log('\nDone! All carry-forward values recalculated.');
