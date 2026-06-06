import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import { config } from 'dotenv';

config();

const MENU_FILE = '/home/ubuntu/upload/المنيو.xlsx';

async function importMenu() {
  // قراءة ملف المنيو
  const wb = XLSX.readFile(MENU_FILE);
  const ws = wb.Sheets['in'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // الصف الأول هو الهيدر
  const headers = rows[0];
  console.log('Headers:', headers);

  // تحويل الصفوف إلى كائنات
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue; // تجاهل الصفوف الفارغة

    const name = String(row[0] || '').trim();
    const sku = String(row[1] || '').trim();
    const price = parseFloat(row[2]) || 0;
    const description = row[3] ? String(row[3]).trim() : null;
    const nameAr = row[4] ? String(row[4]).trim() : null;
    const descriptionAr = row[5] ? String(row[5]).trim() : null;

    if (!name) continue;

    items.push({ name, sku, price, description, nameAr, descriptionAr });
  }

  console.log(`\nإجمالي الأصناف المُقرَأة: ${items.length}`);

  // الاتصال بقاعدة البيانات
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        // استخدام nameAr كـ nameAr إذا كان موجوداً، وإلا استخدام name
        const productName = item.nameAr || item.name;
        const productNameEn = item.nameAr ? item.name : null;

        await conn.execute(
          `INSERT INTO products (name, nameAr, sku, price, description, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
          [
            productName,           // name (عربي إذا متاح)
            productNameEn,         // nameAr (إنجليزي إذا متاح)
            item.sku || null,
            item.price,
            item.description || item.descriptionAr || null,
          ]
        );
        inserted++;
        console.log(`  ✅ [${inserted}] ${productName} (${item.sku}) - ${item.price} ج.م`);
      } catch (err) {
        console.error(`  ❌ خطأ في: ${item.name} - ${err.message}`);
        skipped++;
      }
    }

    console.log(`\n✅ تم الاستيراد بنجاح:`);
    console.log(`   - مُضاف: ${inserted}`);
    console.log(`   - مُتجاهَل: ${skipped}`);

    // التحقق من العدد النهائي
    const [count] = await conn.execute('SELECT COUNT(*) as c FROM products');
    console.log(`   - إجمالي في قاعدة البيانات: ${count[0].c}`);

  } finally {
    await conn.end();
  }
}

importMenu().catch(console.error);
