/**
 * سكريبت رفع بيانات الحسابات اليومية من الإكسل (1-12 أبريل 2026)
 * 
 * منطق المصروفات في الإكسل:
 * - تشغيلية: تأتي من الفواتير الحرة (expenseCategory=operational) + فواتير الموردين
 * - صيانة ومعدات: تأتي من الفواتير الحرة (expenseCategory=maintenance)
 * - ثابتة: رقم ثابت يومي = 1300 درهم (يُخزن في expensesFixed)
 * 
 * ملاحظة: التشغيلية والصيانة تُجلب تلقائياً من الفواتير، لا تُخزن في daily_accounts
 * الثابتة فقط هي التي تُخزن يدوياً في expensesFixed
 */

import mysql from 'mysql2/promise';

// بيانات الإكسل الكاملة (1-12 أبريل 2026)
const excelData = [
  {
    accountDate: '2026-04-01',
    salesCash: 719,
    salesCard: 1408,
    salesKita: 50,
    salesOrders: 0,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 30,
    expensesFixed: 1300,      // ثابتة
    supplyToRestaurant: 10000, // توريد للمطعم
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 1073,
  },
  {
    accountDate: '2026-04-02',
    salesCash: 788.5,
    salesCard: 1414,
    salesKita: 30,
    salesOrders: 14,
    salesCareem: 25,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 146,
  },
  {
    accountDate: '2026-04-03',
    salesCash: 1137,
    salesCard: 1051.5,
    salesKita: 110,
    salesOrders: 0,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 1.75,
    carryForwardToNext: 191.25,
  },
  {
    accountDate: '2026-04-04',
    salesCash: 847,
    salesCard: 1059,
    salesKita: 104,
    salesOrders: 83,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 433.25,
  },
  {
    accountDate: '2026-04-05',
    salesCash: 690,
    salesCard: 1284,
    salesKita: 30,
    salesOrders: 142,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 584.25,
  },
  {
    accountDate: '2026-04-06',
    salesCash: 954,
    salesCard: 923.5,
    salesKita: 154,
    salesOrders: 144,
    salesCareem: 30,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 811.25,
  },
  {
    accountDate: '2026-04-07',
    salesCash: 1061,
    salesCard: 951,
    salesKita: 85,
    salesOrders: 189,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 644.25,
  },
  {
    accountDate: '2026-04-08',
    salesCash: 1170,
    salesCard: 1067,
    salesKita: 55,
    salesOrders: 193,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 78,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 572.75,
  },
  {
    accountDate: '2026-04-09',
    salesCash: 876.5,
    salesCard: 1253,
    salesKita: 167,
    salesOrders: 96,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 957.25,
  },
  {
    accountDate: '2026-04-10',
    salesCash: 1013.75,
    salesCard: 858.5,
    salesKita: 0,
    salesOrders: 80,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 0,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 604,
  },
  {
    accountDate: '2026-04-11',
    salesCash: 721.5,
    salesCard: 1387.5,
    salesKita: 0,
    salesOrders: 97,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 65,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 498.5,
  },
  {
    accountDate: '2026-04-12',
    salesCash: 819,
    salesCard: 902,
    salesKita: 45,
    salesOrders: 170,
    salesCareem: 0,
    salesDeliveroo: 0,
    salesNoon: 60,
    expensesFixed: 1300,
    supplyToRestaurant: 0,
    supplyToManagement: 0,
    supplyExtra: 0,
    carryForwardToNext: 97,
  },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  console.log('بدء رفع بيانات الحسابات اليومية...\n');
  
  for (const row of excelData) {
    // تحقق إذا كان اليوم موجود
    const [existing] = await conn.execute(
      'SELECT id FROM daily_accounts WHERE accountDate = ?',
      [row.accountDate]
    );
    
    if (existing.length > 0) {
      // تحديث السجل الموجود
      await conn.execute(`
        UPDATE daily_accounts SET
          salesCash = ?,
          salesCard = ?,
          salesKita = ?,
          salesOrders = ?,
          salesCareem = ?,
          salesDeliveroo = ?,
          salesNoon = ?,
          expensesFixed = ?,
          supplyToRestaurant = ?,
          supplyToManagement = ?,
          supplyExtra = ?,
          carryForwardToNext = ?,
          updatedAt = NOW()
        WHERE accountDate = ?
      `, [
        row.salesCash, row.salesCard, row.salesKita, row.salesOrders,
        row.salesCareem, row.salesDeliveroo, row.salesNoon,
        row.expensesFixed,
        row.supplyToRestaurant, row.supplyToManagement, row.supplyExtra,
        row.carryForwardToNext,
        row.accountDate
      ]);
      console.log(`✅ تحديث: ${row.accountDate}`);
    } else {
      // إدراج سجل جديد
      await conn.execute(`
        INSERT INTO daily_accounts (
          accountDate, salesCash, salesCard, salesKita, salesOrders,
          salesCareem, salesDeliveroo, salesNoon,
          expensesFixed, supplyToRestaurant, supplyToManagement, supplyExtra,
          carryForwardToNext, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [
        row.accountDate,
        row.salesCash, row.salesCard, row.salesKita, row.salesOrders,
        row.salesCareem, row.salesDeliveroo, row.salesNoon,
        row.expensesFixed,
        row.supplyToRestaurant, row.supplyToManagement, row.supplyExtra,
        row.carryForwardToNext
      ]);
      console.log(`➕ إضافة: ${row.accountDate}`);
    }
  }
  
  // تحقق نهائي
  console.log('\n=== التحقق النهائي ===');
  const [results] = await conn.execute(`
    SELECT accountDate, salesCash, salesCard, salesKita, salesOrders, salesCareem, salesNoon,
           expensesFixed, supplyToRestaurant, supplyExtra, carryForwardToNext
    FROM daily_accounts
    WHERE accountDate BETWEEN '2026-04-01' AND '2026-04-12'
    ORDER BY accountDate
  `);
  
  results.forEach(r => {
    const d = r.accountDate;
    const totalSales = +r.salesCash + +r.salesCard + +r.salesKita + +r.salesOrders + +r.salesCareem + +r.salesNoon;
    console.log(`${d} | مبيعات: ${totalSales.toFixed(2)} | ثابتة: ${r.expensesFixed} | توريد: ${r.supplyToRestaurant} | مرحّل: ${r.carryForwardToNext}`);
  });
  
  await conn.end();
  console.log('\n✅ تم رفع جميع البيانات بنجاح!');
}

main().catch(e => {
  console.error('خطأ:', e.message);
  process.exit(1);
});
