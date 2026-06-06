import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// جلب كل المواد اليوم
const [rows] = await conn.execute(`
  SELECT k.id, k.materialId, k.materialName, k.materialType, 
         k.pulledQuantity, k.actualYield, k.isCarriedForward, k.carriedRawQty, k.status,
         COALESCE(r.lastPurchasePrice, r.averageCost, 0) as rawPrice
  FROM kitchen_daily_pulls k
  LEFT JOIN raw_materials r ON r.id = k.materialId
  WHERE DATE(k.pullDate) = CURDATE()
`);

// تكلفة الوصفة للمصنّعة
const [recipeRows] = await conn.execute(`
  SELECT sfr.materialId as semiFinishedId, SUM(sfr.quantity * COALESCE(rm.lastPurchasePrice, rm.averageCost, 0)) as recipeCost
  FROM semi_finished_recipes sfr
  LEFT JOIN raw_materials rm ON rm.id = sfr.ingredientId
  GROUP BY sfr.materialId
`);
const recipeCostMap = {};
for (const r of recipeRows) recipeCostMap[r.semiFinishedId] = parseFloat(r.recipeCost || 0);

let totalPageCost = 0, totalDashCost = 0;
for (const row of rows) {
  const isSemi = row.materialType === 'semi_finished';
  const isCarried = !!(row.isCarriedForward);
  const pulledRaw = parseFloat(row.pulledQuantity || 0);
  const carriedRaw = row.carriedRawQty ? parseFloat(row.carriedRawQty) : null;
  const effectivePulled = (isSemi && isCarried && carriedRaw !== null && carriedRaw > 0) ? carriedRaw : pulledRaw;
  
  // طريقة صفحة الإنتاج: effectivePulled × unitCost (recipeCost للمصنّعة، rawPrice للخام)
  const unitCostPage = isSemi ? (recipeCostMap[row.materialId] || 0) : parseFloat(row.rawPrice || 0);
  const pageCost = effectivePulled * unitCostPage;
  
  // طريقة لوحة التحكم (calcKitchenPullRawCost): نفس المنطق
  const unitCostDash = isSemi ? (recipeCostMap[row.materialId] || 0) : parseFloat(row.rawPrice || 0);
  const dashCost = effectivePulled * unitCostDash;
  
  totalPageCost += pageCost;
  totalDashCost += dashCost;
  
  console.log(`${row.materialName} | type:${row.materialType} | effectivePulled:${effectivePulled} | unitCost:${unitCostPage.toFixed(3)} | cost:${pageCost.toFixed(2)}`);
}

console.log('\n=== TOTALS ===');
console.log('Page total:', totalPageCost.toFixed(2));
console.log('Dash total:', totalDashCost.toFixed(2));

await conn.end();
