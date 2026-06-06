import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT k.materialId, k.materialName, k.materialType, k.pulledQuantity, k.actualYield, 
         k.isCarriedForward, k.carriedRawQty, k.status, k.closingCount,
         COALESCE(r.lastPurchasePrice, r.averageCost, 0) as rawPrice
  FROM kitchen_daily_pulls k
  LEFT JOIN raw_materials r ON r.id = k.materialId
  WHERE DATE(CONVERT_TZ(k.pullDate, '+00:00', '+04:00')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+04:00'))
`);

const [recipeRows] = await conn.execute(`
  SELECT sfr.materialId as semiId, SUM(sfr.quantity * COALESCE(rm.lastPurchasePrice, rm.averageCost, 0)) as cost
  FROM semi_finished_recipes sfr
  LEFT JOIN raw_materials rm ON rm.id = sfr.ingredientId
  GROUP BY sfr.materialId
`);
const recipeMap = {};
for (const r of recipeRows) recipeMap[r.semiId] = parseFloat(r.cost || 0);

let openVal = 0, countedVal = 0;
for (const row of rows) {
  const isSemi = row.materialType === 'semi_finished';
  const isCarried = !!(row.isCarriedForward);
  const pulled = parseFloat(row.pulledQuantity || 0);
  const carried = row.carriedRawQty ? parseFloat(row.carriedRawQty) : null;
  const effectivePulled = (isSemi && isCarried && carried !== null && carried > 0) ? carried : pulled;
  const actualYield = row.actualYield ? parseFloat(row.actualYield) : null;
  const effectiveYield = (actualYield !== null && actualYield > 0) ? actualYield : effectivePulled;
  const closing = parseFloat(row.closingCount || 0);
  const usedRawEquiv = (isSemi && effectiveYield > 0) ? closing * (effectivePulled / effectiveYield) : closing;
  const unitCost = isSemi ? (recipeMap[row.materialId] || 0) : parseFloat(row.rawPrice || 0);
  const openCost = effectivePulled * unitCost;
  const countedCost = usedRawEquiv * unitCost;
  if (row.status === 'open') openVal += openCost;
  else countedVal += countedCost;
}

console.log('openValue (مفتوحة):', openVal.toFixed(2));
console.log('countedValue (تم جردها):', countedVal.toFixed(2));
console.log('total:', (openVal + countedVal).toFixed(2));

await conn.end();
