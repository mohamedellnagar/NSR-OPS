import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

// The user says: 3 free invoices paid today: 60 + 500 + 60 = 620
// But UI shows only 60. Let's find out why.

console.log('\n=== STEP 1: ALL paid free invoices (no date filter) ===');
const [allPaid] = await conn.query(
  "SELECT id, supplierName, date, paidAt, totalAmount, paymentStatus, expenseCategory FROM free_invoices WHERE paymentStatus='paid' ORDER BY date DESC LIMIT 20"
);
console.log(JSON.stringify(allPaid, null, 2));

console.log('\n=== STEP 2: Today paid free invoices (April 9, 2026) ===');
const [todayPaid] = await conn.query(
  "SELECT id, supplierName, date, paidAt, totalAmount, paymentStatus, expenseCategory FROM free_invoices WHERE paymentStatus='paid' AND (DATE(date) = '2026-04-09' OR DATE(paidAt) = '2026-04-09') ORDER BY date"
);
console.log(JSON.stringify(todayPaid, null, 2));

console.log('\n=== STEP 3: Check the 500 AED invoice specifically ===');
const [fiveHundred] = await conn.query(
  "SELECT id, supplierName, date, paidAt, totalAmount, paymentStatus, expenseCategory FROM free_invoices WHERE totalAmount = 500 OR totalAmount BETWEEN 490 AND 510"
);
console.log(JSON.stringify(fiveHundred, null, 2));

console.log('\n=== STEP 4: Run the exact getMonthExpenses SQL for April 2026 ===');
const [groupedFree] = await conn.query(
  `SELECT
    DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') AS dateKey,
    expenseCategory,
    SUM(totalAmount) AS totalAmount,
    COUNT(*) as cnt
   FROM free_invoices
   WHERE paymentStatus = 'paid'
     AND DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') >= '2026-04-01'
     AND DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') <= '2026-04-30'
   GROUP BY dateKey, expenseCategory
   ORDER BY dateKey`
);
console.log('Grouped free invoices:', JSON.stringify(groupedFree, null, 2));

console.log('\n=== STEP 5: Check if 500 AED invoice has different date/category ===');
const [allFree] = await conn.query(
  "SELECT id, supplierName, date, paidAt, totalAmount, paymentStatus, expenseCategory, DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') as localDate FROM free_invoices ORDER BY date DESC LIMIT 30"
);
console.log(JSON.stringify(allFree, null, 2));

console.log('\n=== STEP 6: Check daily_accounts for April 9 ===');
const [dailyAcc] = await conn.query(
  "SELECT * FROM daily_accounts WHERE accountDate = '2026-04-09'"
);
console.log(JSON.stringify(dailyAcc, null, 2));

await conn.end();
