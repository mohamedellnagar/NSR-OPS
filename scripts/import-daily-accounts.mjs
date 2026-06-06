import 'dotenv/config';
import mysql from 'mysql2/promise';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

// قراءة ملف Excel
const fileBuffer = readFileSync('/home/ubuntu/upload/حسابات_يومية_2026-04.xlsx');
const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('Headers:', rows[0]);
console.log('Data rows:', rows.length - 1);

// الأعمدة: التاريخ، نقدي، بطاقة، كيتا، طلبات، كريم، ديلفروا، نون، إجمالي، المبلغ المرحّل
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// جلب أول مستخدم (owner) لتعيينه كـ createdBy
const [users] = await conn.execute('SELECT id FROM users LIMIT 1');
const createdBy = users[0]?.id ?? 1;

let inserted = 0;
let skipped = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || !row[0]) continue;

  // تحويل التاريخ
  let dateStr;
  const rawDate = row[0];
  if (rawDate instanceof Date) {
    dateStr = rawDate.toISOString().split('T')[0];
  } else if (typeof rawDate === 'string') {
    // تنسيق DD/MM/YYYY
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      dateStr = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    } else {
      dateStr = rawDate;
    }
  } else {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(rawDate);
    dateStr = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }

  const salesCash      = parseFloat(row[1]) || 0;
  const salesCard      = parseFloat(row[2]) || 0;
  const salesKita      = parseFloat(row[3]) || 0;
  const salesOrders    = parseFloat(row[4]) || 0;
  const salesCareem    = parseFloat(row[5]) || 0;
  const salesDeliveroo = parseFloat(row[6]) || 0;
  const salesNoon      = parseFloat(row[7]) || 0;
  // col 8 = إجمالي المبيعات (محسوب)
  // col 9 = المبلغ المرحّل

  // التحقق من عدم وجود اليوم مسبقاً
  const [existing] = await conn.execute(
    'SELECT id FROM daily_accounts WHERE accountDate = ?',
    [dateStr]
  );

  if (existing.length > 0) {
    console.log(`⚠️  ${dateStr} موجود بالفعل - تخطي`);
    skipped++;
    continue;
  }

  await conn.execute(
    `INSERT INTO daily_accounts 
     (accountDate, salesCash, salesCard, salesKita, salesOrders, salesCareem, salesDeliveroo, salesNoon, 
      expensesFixed, supplyToRestaurant, supplyToManagement, supplyExtra, notes, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'مستورد من Excel', ?)`,
    [dateStr, salesCash, salesCard, salesKita, salesOrders, salesCareem, salesDeliveroo, salesNoon, createdBy]
  );

  console.log(`✓ ${dateStr} | نقدي: ${salesCash} | بطاقة: ${salesCard} | كيتا: ${salesKita} | طلبات: ${salesOrders} | كريم: ${salesCareem} | ديلفروا: ${salesDeliveroo} | نون: ${salesNoon}`);
  inserted++;
}

console.log(`\nتم إدراج ${inserted} يوم، تخطي ${skipped} يوم`);
await conn.end();
