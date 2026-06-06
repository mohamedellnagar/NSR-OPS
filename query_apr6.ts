import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { kitchenDailyPulls, rawMaterials, kitchenProducts } from './drizzle/schema';
import { and, gte, lte } from 'drizzle-orm';

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  // يوم 6 أبريل 2026 - بداية ونهاية اليوم
  // pullDate is stored as timestamp (not bigint), so use Date objects
  const startOfDay = new Date('2026-04-06T00:00:00.000Z');
  const endOfDay = new Date('2026-04-06T23:59:59.999Z');

  console.log('=== مسحوبات يوم 6 أبريل 2026 ===\n');

  // جلب جميع مسحوبات اليوم
  const pulls = await db.select().from(kitchenDailyPulls)
    .where(and(
      gte(kitchenDailyPulls.pullDate, startOfDay),
      lte(kitchenDailyPulls.pullDate, endOfDay)
    ))
    .orderBy(kitchenDailyPulls.pullDate);

  console.log(`عدد السجلات: ${pulls.length}\n`);

  // جلب المواد الخام
  const rawMats = await db.select().from(rawMaterials);
  const rawMap = new Map(rawMats.map(r => [r.id, r]));

  // جلب المواد المصنّعة (kitchenProducts)
  const kitchenProds = await db.select().from(kitchenProducts);
  const kitchenMap = new Map(kitchenProds.map(k => [k.id, k]));

  let totalUsedValue = 0;
  const rawMaterialsData: any[] = [];
  const semiFinishedData: any[] = [];

  for (const pull of pulls) {
    const isSemi = pull.materialType === 'semi_finished';
    let name = pull.materialNameAr || pull.materialName || 'غير معروف';
    let unit = pull.unit || 'kg';
    let unitCost = 0;

    if (!isSemi) {
      const raw = rawMap.get(pull.materialId);
      if (raw) {
        unitCost = Number(raw.lastPrice || 0);
      }
    } else {
      // For semi_finished, materialId references kitchenProducts
      const kp = kitchenMap.get(pull.materialId);
      if (kp) {
        unitCost = Number((kp as any).lastPrice || (kp as any).costPerUnit || 0);
      }
    }
    
    const usedQty = Number(pull.closingCount || 0);
    const usedValue = usedQty * unitCost;
    totalUsedValue += usedValue;

    const row = {
      name,
      unit,
      type: isSemi ? 'مصنّع' : 'خام',
      isCarried: pull.isCarriedForward ? 'مرحّل' : 'جديد',
      status: pull.status,
      pulledQty: isSemi ? Number(pull.actualYield || 0) : Number(pull.pulledQuantity || 0),
      usedQty,
      unitCost,
      usedValue,
    };

    if (isSemi) semiFinishedData.push(row);
    else rawMaterialsData.push(row);
  }

  // عرض المواد الخام
  console.log('--- المواد الخام ---');
  let rawTotal = 0;
  for (const r of rawMaterialsData) {
    const mark = r.usedQty > 0 ? '✓' : ' ';
    console.log(`${mark} ${r.name} [${r.isCarried}] | مسحوب: ${r.pulledQty.toFixed(3)} ${r.unit} | مستخدم: ${r.usedQty.toFixed(3)} ${r.unit} | سعر: ${r.unitCost.toFixed(2)} | قيمة: ${r.usedValue.toFixed(2)} | ${r.status}`);
    rawTotal += r.usedValue;
  }
  console.log(`\nإجمالي قيمة المواد الخام المستخدمة: ${rawTotal.toFixed(2)}`);

  // عرض المواد المصنّعة
  console.log('\n--- المواد المصنّعة ---');
  let semiTotal = 0;
  for (const r of semiFinishedData) {
    const mark = r.usedQty > 0 ? '✓' : ' ';
    console.log(`${mark} ${r.name} [${r.isCarried}] | مسحوب: ${r.pulledQty.toFixed(3)} ${r.unit} | مستخدم: ${r.usedQty.toFixed(3)} ${r.unit} | سعر: ${r.unitCost.toFixed(2)} | قيمة: ${r.usedValue.toFixed(2)} | ${r.status}`);
    semiTotal += r.usedValue;
  }
  console.log(`\nإجمالي قيمة المواد المصنّعة المستخدمة: ${semiTotal.toFixed(2)}`);

  console.log('\n=== الإجمالي الكلي ===');
  const countedPulls = pulls.filter(p => (p.closingCount || 0) > 0);
  console.log(`عدد المواد التي تم جردها: ${countedPulls.length} من أصل ${pulls.length}`);
  console.log(`إجمالي قيمة المستخدم: ${totalUsedValue.toFixed(2)}`);

  await connection.end();
}

main().catch(console.error);
