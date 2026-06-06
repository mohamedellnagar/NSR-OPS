import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

console.log('\n=== STEP 1: Raw DB values for free_invoices (paid, April 2026) ===');
const [rawRows] = await conn.query(
  "SELECT id, supplierName, date, paidAt, totalAmount, paymentStatus, expenseCategory FROM free_invoices WHERE paymentStatus='paid' AND date >= '2026-04-01' ORDER BY date LIMIT 10"
);
console.log(JSON.stringify(rawRows, null, 2));

console.log('\n=== STEP 2: Test CONVERT_TZ(date, +00:00, +04:00) ===');
const [convRows] = await conn.query(
  "SELECT id, date, CONVERT_TZ(date, '+00:00', '+04:00') as localDate, DATE(CONVERT_TZ(date, '+00:00', '+04:00')) as dateOnly, DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') as dateStr FROM free_invoices WHERE paymentStatus='paid' AND date >= '2026-04-01' LIMIT 5"
);
console.log(JSON.stringify(convRows, null, 2));

console.log('\n=== STEP 3: Grouped query using CONVERT_TZ correctly ===');
const [groupRows] = await conn.query(
  "SELECT DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') as dateKey, expenseCategory, SUM(totalAmount) as total, COUNT(*) as cnt FROM free_invoices WHERE paymentStatus='paid' AND DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') >= '2026-04-01' AND DATE_FORMAT(CONVERT_TZ(date, '+00:00', '+04:00'), '%Y-%m-%d') <= '2026-04-30' GROUP BY dateKey, expenseCategory ORDER BY dateKey"
);
console.log(JSON.stringify(groupRows, null, 2));

console.log('\n=== STEP 4: Check daily_accounts accountDate format ===');
const [accRows] = await conn.query("SELECT accountDate FROM daily_accounts WHERE accountDate >= '2026-04-01' ORDER BY accountDate LIMIT 5");
console.log(JSON.stringify(accRows, null, 2));

console.log('\n=== STEP 5: Check CONVERT_TZ availability in MySQL ===');
try {
  const [tzTest] = await conn.query("SELECT CONVERT_TZ('2026-04-01 00:00:00', '+00:00', '+04:00') as test");
  console.log('CONVERT_TZ works:', JSON.stringify(tzTest));
} catch(e) {
  console.error('CONVERT_TZ FAILED:', e.message);
}

console.log('\n=== STEP 6: Check if timezone tables are loaded ===');
try {
  const [tzCount] = await conn.query("SELECT COUNT(*) as cnt FROM mysql.time_zone");
  console.log('Timezone table rows:', JSON.stringify(tzCount));
} catch(e) {
  console.log('Cannot access mysql.time_zone:', e.message);
}

await conn.end();
