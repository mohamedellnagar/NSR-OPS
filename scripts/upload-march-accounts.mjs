import mysql from 'mysql2/promise';

const data = [
  { date: '2026-03-01', cash: 1305.5, card: 953, kita: 65, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 1134, mainEx: 0, fixed: 1300, supRest: 15, supMgmt: 0, supExtra: 10, carry: 1355.5 },
  { date: '2026-03-02', cash: 1471, card: 1414, kita: 45, orders: 0, careem: 0, deliveroo: 0, noon: 30, opEx: 1643, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 1183.5 },
  { date: '2026-03-03', cash: 1115.5, card: 1177.5, kita: 105, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 1133, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: -42.5, carry: 1123.5 },
  { date: '2026-03-04', cash: 852, card: 1308.5, kita: 45, orders: 0, careem: 0, deliveroo: 0, noon: 17, opEx: 858.75, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 1116.75 },
  { date: '2026-03-05', cash: 687, card: 1047, kita: 227, orders: 0, careem: 0, deliveroo: 155, noon: 0, opEx: 743.75, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 1060 },
  { date: '2026-03-06', cash: 1424, card: 1813, kita: 172, orders: 0, careem: 35, deliveroo: 0, noon: 0, opEx: 5409.5, mainEx: 0, fixed: 1300, supRest: 5000, supMgmt: 0, supExtra: 3, carry: 2077.5 },
  { date: '2026-03-07', cash: 728, card: 2229.5, kita: 155, orders: 0, careem: 0, deliveroo: 0, noon: 35, opEx: 1669, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 5, carry: 1141.5 },
  { date: '2026-03-08', cash: 1006, card: 1535.5, kita: 130, orders: 0, careem: 0, deliveroo: 0, noon: 45, opEx: 1966, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 181.5 },
  { date: '2026-03-09', cash: 1334, card: 954, kita: 269, orders: 0, careem: 0, deliveroo: 0, noon: 92, opEx: 664, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 851.5 },
  { date: '2026-03-10', cash: 4839.5, card: 1880, kita: 85, orders: 0, careem: 0, deliveroo: 0, noon: 17, opEx: 2091.5, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 3599.5 },
  { date: '2026-03-11', cash: 1139.5, card: 1099.5, kita: 65, orders: 0, careem: 0, deliveroo: 0, noon: 35, opEx: 4552, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 187 },
  { date: '2026-03-12', cash: 909.25, card: 1625.5, kita: 207, orders: 0, careem: 0, deliveroo: 0, noon: 37, opEx: 660, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 436.25 },
  { date: '2026-03-13', cash: 1490, card: 1399, kita: 206, orders: 0, careem: 0, deliveroo: 0, noon: 40, opEx: 1235, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 691.25 },
  { date: '2026-03-14', cash: 1212, card: 1265, kita: 100, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 1421.25, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 482 },
  { date: '2026-03-15', cash: 876, card: 1448, kita: 115, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 736.5, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 621.5 },
  { date: '2026-03-16', cash: 1243, card: 904.5, kita: 142, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 1643, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0.5, carry: 222 },
  { date: '2026-03-17', cash: 599, card: 1074, kita: 92, orders: 0, careem: 0, deliveroo: 0, noon: 35, opEx: 5035.75, mainEx: 0, fixed: 1300, supRest: 5000, supMgmt: 0, supExtra: 0, carry: 785.25 },
  { date: '2026-03-18', cash: 1717, card: 1670.5, kita: 18, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 1739.5, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 762.75 },
  { date: '2026-03-19', cash: 908.5, card: 1365, kita: 153, orders: 0, careem: 0, deliveroo: 0, noon: 30, opEx: 1434, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 7.5, carry: 244.75 },
  { date: '2026-03-20', cash: 940, card: 1297.5, kita: 162, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 978, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 206.75 },
  { date: '2026-03-21', cash: 1325.5, card: 982.5, kita: 99, orders: 0, careem: 0, deliveroo: 0, noon: 30, opEx: 607, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 925.25 },
  { date: '2026-03-22', cash: 806, card: 923.5, kita: 104, orders: 0, careem: 0, deliveroo: 0, noon: 42, opEx: 1152.75, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 100, carry: 678.5 },
  { date: '2026-03-23', cash: 564, card: 968, kita: 75, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 660, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 582.5 },
  { date: '2026-03-24', cash: 946, card: 1056.5, kita: 139, orders: 0, careem: 0, deliveroo: 0, noon: 30, opEx: 1232.5, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 296 },
  { date: '2026-03-25', cash: 887, card: 1613.25, kita: 45, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 622.25, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 560.75 },
  { date: '2026-03-26', cash: 883.5, card: 575, kita: 83, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 798.5, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 645.75 },
  { date: '2026-03-27', cash: 842, card: 685.5, kita: 340, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 346.5, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 1141.25 },
  { date: '2026-03-28', cash: 871, card: 1174, kita: 190, orders: 0, careem: 40, deliveroo: 0, noon: 0, opEx: 1561.5, mainEx: 180.5, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 270.25 },
  { date: '2026-03-29', cash: 868.5, card: 1353, kita: 128, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 779.75, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 359 },
  { date: '2026-03-30', cash: 1163.5, card: 1221, kita: 155, orders: 0, careem: 0, deliveroo: 0, noon: 0, opEx: 896.5, mainEx: 387, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 239 },
  { date: '2026-03-31', cash: 575.5, card: 978.5, kita: 30, orders: 0, careem: 0, deliveroo: 0, noon: 25, opEx: 593.25, mainEx: 0, fixed: 1300, supRest: 0, supMgmt: 0, supExtra: 0, carry: 221.25 },
];

const conn = await mysql.createConnection(process.env.DATABASE_URL);
let inserted = 0, updated = 0;

for (const d of data) {
  const totalSales = d.cash + d.card + d.kita + d.orders + d.careem + d.deliveroo + d.noon;

  // Check if exists
  const [existing] = await conn.execute(
    'SELECT id FROM daily_accounts WHERE accountDate = ?', [d.date]
  );

  if (existing.length > 0) {
    await conn.execute(`
      UPDATE daily_accounts SET
        salesCash=?, salesCard=?, salesKita=?, salesOrders=?, salesCareem=?, salesDeliveroo=?, salesNoon=?,
        expensesOperational=?, expensesMaintenance=?, expensesFixed=?,
        supplyToRestaurant=?, supplyToManagement=?, supplyExtra=?,
        carryForwardToNext=?
      WHERE accountDate=?
    `, [d.cash, d.card, d.kita, d.orders, d.careem, d.deliveroo, d.noon,
        d.opEx, d.mainEx, d.fixed,
        d.supRest, d.supMgmt, d.supExtra,
        d.carry, d.date]);
    updated++;
  } else {
    await conn.execute(`
      INSERT INTO daily_accounts
        (accountDate, salesCash, salesCard, salesKita, salesOrders, salesCareem, salesDeliveroo, salesNoon,
         expensesOperational, expensesMaintenance, expensesFixed,
         supplyToRestaurant, supplyToManagement, supplyExtra,
         carryForwardToNext, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [d.date, d.cash, d.card, d.kita, d.orders, d.careem, d.deliveroo, d.noon,
        d.opEx, d.mainEx, d.fixed,
        d.supRest, d.supMgmt, d.supExtra,
        d.carry]);
    inserted++;
  }
}

await conn.end();
console.log(`✅ Done: ${inserted} inserted, ${updated} updated`);

// Verify
const conn2 = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn2.execute(
  `SELECT accountDate,
    salesCash+salesCard+salesKita+salesOrders+salesCareem+salesDeliveroo+salesNoon AS totalSales,
    expensesOperational, expensesMaintenance, expensesFixed,
    supplyToRestaurant, supplyExtra, carryForwardToNext
   FROM daily_accounts WHERE accountDate BETWEEN '2026-03-01' AND '2026-03-31' ORDER BY accountDate`
);
console.log('\n=== Verification ===');
rows.forEach(r => {
  const totalExp = parseFloat(r.expensesOperational||0) + parseFloat(r.expensesMaintenance||0) + parseFloat(r.expensesFixed||0);
  console.log(`${r.accountDate} | Sales: ${parseFloat(r.totalSales).toFixed(2)} | Exp: ${totalExp.toFixed(2)} | Carry: ${parseFloat(r.carryForwardToNext||0).toFixed(2)}`);
});
await conn2.end();
