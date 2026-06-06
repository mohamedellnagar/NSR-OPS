import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// جلب كل الفواتير الحرة مرتبة بالتاريخ ثم الـ ID
const [rows] = await conn.execute(
  'SELECT id, supplierName, totalAmount, date, invoiceNumber FROM free_invoices ORDER BY date, id'
);

console.log('إجمالي الفواتير الحرة:', rows.length);

// الفواتير التي ليس لها رقم
const noNum = rows.filter(r => !r.invoiceNumber);
console.log('بدون رقم فاتورة:', noNum.length);

if (noNum.length === 0) {
  console.log('✓ جميع الفواتير لها أرقام بالفعل');
  await conn.end();
  process.exit(0);
}

// نجمع الفواتير حسب التاريخ لإنشاء أرقام متسلسلة لكل يوم
const byDate = {};
for (const r of noNum) {
  const d = new Date(r.date).toISOString().slice(0, 10).replace(/-/g, '');
  if (!byDate[d]) byDate[d] = [];
  byDate[d].push(r);
}

let updated = 0;
for (const [dateStr, invoices] of Object.entries(byDate)) {
  const prefix = `FREE-${dateStr}-`;
  
  // نفحص أعلى رقم موجود لهذا اليوم في قاعدة البيانات
  const [existing] = await conn.execute(
    `SELECT invoiceNumber FROM free_invoices WHERE invoiceNumber LIKE ? ORDER BY invoiceNumber DESC LIMIT 1`,
    [`${prefix}%`]
  );
  
  let seq = existing.length > 0
    ? parseInt(existing[0].invoiceNumber.slice(prefix.length)) + 1
    : 1;
  
  for (const inv of invoices) {
    const newNum = `${prefix}${String(seq).padStart(4, '0')}`;
    await conn.execute(
      'UPDATE free_invoices SET invoiceNumber = ? WHERE id = ?',
      [newNum, inv.id]
    );
    console.log(`✓ ID ${inv.id} (${inv.supplierName}) → ${newNum}`);
    seq++;
    updated++;
  }
}

console.log(`\nتم تحديث ${updated} فاتورة بنجاح`);
await conn.end();
