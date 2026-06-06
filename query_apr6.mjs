import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './drizzle/schema.js';
import { and, gte, lte, eq, isNotNull } from 'drizzle-orm';

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(connection, { schema, mode: 'default' });

// يوم 6 أبريل 2026 - بداية ونهاية اليوم بتوقيت UTC
const startOfDay = new Date('2026-04-06T00:00:00.000Z').getTime();
const endOfDay = new Date('2026-04-06T23:59:59.999Z').getTime();

console.log('=== مسحوبات يوم 6 أبريل 2026 ===\n');

// جلب جميع مسحوبات اليوم مع بيانات المادة
const pulls = await db.query.kitchenDailyPulls.findMany({
  where: and(
    gte(schema.kitchenDailyPulls.pullDate, startOfDay),
    lte(schema.kitchenDailyPulls.pullDate, endOfDay)
  ),
  with: {
    rawMaterial: true,
    semiFinished: true,
  },
  orderBy: (pulls, { asc }) => [asc(pulls.pullDate)],
});

console.log(`عدد السجلات: ${pulls.length}\n`);

let totalUsedValue = 0;
let rawMaterialsData = [];
let semiFinishedData = [];

for (const pull of pulls) {
  const isCarried = pull.isCarriedForward;
  const isSemi = pull.itemType === 'semi_finished';
  const name = isSemi ? pull.semiFinished?.nameAr : pull.rawMaterial?.nameAr;
  const unit = isSemi ? pull.semiFinished?.unit : pull.rawMaterial?.unit;
  const unitCost = isSemi ? (pull.semiFinished?.lastPrice || 0) : (pull.rawMaterial?.lastPrice || 0);
  
  // الكمية المستخدمة = closingCount
  const usedQty = pull.closingCount || 0;
  const usedValue = usedQty * unitCost;
  totalUsedValue += usedValue;

  const row = {
    id: pull.id,
    name: name || 'غير معروف',
    unit: unit || 'kg',
    type: isSemi ? 'مصنّع' : 'خام',
    isCarried: isCarried ? 'مرحّل' : 'جديد',
    status: pull.status,
    pulledQty: isSemi ? (pull.actualYield || 0) : (pull.pulledQuantity || 0),
    usedQty,
    unitCost,
    usedValue,
    pullDate: new Date(pull.pullDate).toISOString(),
  };

  if (isSemi) semiFinishedData.push(row);
  else rawMaterialsData.push(row);
}

// عرض المواد الخام
console.log('--- المواد الخام ---');
let rawTotal = 0;
for (const r of rawMaterialsData) {
  console.log(`${r.name} [${r.isCarried}] | مسحوب: ${r.pulledQty.toFixed(3)} ${r.unit} | مستخدم: ${r.usedQty.toFixed(3)} ${r.unit} | قيمة: ${r.usedValue.toFixed(2)} | الحالة: ${r.status}`);
  rawTotal += r.usedValue;
}
console.log(`\nإجمالي قيمة المواد الخام المستخدمة: ${rawTotal.toFixed(2)}`);

// عرض المواد المصنّعة
console.log('\n--- المواد المصنّعة ---');
let semiTotal = 0;
for (const r of semiFinishedData) {
  console.log(`${r.name} [${r.isCarried}] | مسحوب: ${r.pulledQty.toFixed(3)} ${r.unit} | مستخدم: ${r.usedQty.toFixed(3)} ${r.unit} | قيمة: ${r.usedValue.toFixed(2)} | الحالة: ${r.status}`);
  semiTotal += r.usedValue;
}
console.log(`\nإجمالي قيمة المواد المصنّعة المستخدمة: ${semiTotal.toFixed(2)}`);

console.log('\n=== الإجمالي الكلي ===');
console.log(`إجمالي عدد المواد المستخدمة: ${pulls.filter(p => (p.closingCount || 0) > 0).length}`);
console.log(`إجمالي قيمة المستخدم: ${totalUsedValue.toFixed(2)}`);

await connection.end();
