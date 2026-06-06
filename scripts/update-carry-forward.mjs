import 'dotenv/config';
import mysql from 'mysql2/promise';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';

const fileBuffer = readFileSync('/home/ubuntu/upload/حسابات_يومية_2026-04.xlsx');
const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// الأعمدة: 0=التاريخ، 1=نقدي، 2=بطاقة، 3=كيتا، 4=طلبات، 5=كريم، 6=ديلفروا، 7=نون، 8=إجمالي، 9=المبلغ المرحّل
const conn = await mysql.createConnection(process.env.DATABASE_URL);

let updated = 0;

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || !row[0]) continue;

  // تحويل التاريخ
  let dateStr;
  const rawDate = row[0];
  if (rawDate instanceof Date) {
    dateStr = rawDate.toISOString().split('T')[0];
  } else if (typeof rawDate === 'string') {
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      dateStr = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    } else {
      dateStr = rawDate;
    }
  } else {
    const d = XLSX.SSF.parse_date_code(rawDate);
    dateStr = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }

  const carryForward = parseFloat(row[9]) || 0; // عمود "المبلغ المرحّل"

  const [result] = await conn.execute(
    'UPDATE daily_accounts SET carryForwardToNext = ? WHERE accountDate = ?',
    [carryForward, dateStr]
  );

  if (result.affectedRows > 0) {
    console.log(`✓ ${dateStr} → المبلغ المرحّل: ${carryForward} د.إ`);
    updated++;
  } else {
    console.log(`⚠️  ${dateStr} لم يُعثر عليه في قاعدة البيانات`);
  }
}

console.log(`\nتم تحديث ${updated} يوم`);
await conn.end();
