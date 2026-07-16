/**
 * menu-engineering-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Menu Engineering Analysis (Boston Matrix / Menu Matrix)
 *
 * Classification:
 *   Stars    ⭐  — High popularity + High profit  → PROMOTE
 *   Plowhorses 🐴 — High popularity + Low profit   → KEEP, optimize cost
 *   Puzzles  🔮  — Low popularity  + High profit  → IMPROVE visibility
 *   Dogs     🐕  — Low popularity  + Low profit   → REMOVE or reprice
 *
 * Metrics:
 *   popularity = totalQtySold vs avg qty sold across all items
 *   profitability = contribution margin % (selling price - recipe cost) / selling price
 */

import mysql from "mysql2/promise";

import { getConn } from "./pool";
function unitConvFactor(recipeUnit: string, matUnit: string): number {
  const ru = (recipeUnit || "").toLowerCase().trim();
  const mu = (matUnit || "").toLowerCase().trim();
  if ((ru === "g" || ru === "gram") && (mu === "kg" || mu === "كيلو")) return 1 / 1000;
  if ((ru === "ml" || ru === "مل") && (mu === "l" || mu === "liter" || mu === "لتر")) return 1 / 1000;
  return 1;
}

export type MenuCategory = "star" | "plowhorse" | "puzzle" | "dog" | "uncategorized";

export interface MenuEngineeringRow {
  productId: number;
  productName: string;
  productNameAr: string | null;
  categoryReference: string | null;
  sellingPrice: number;
  recipeCost: number;
  contributionMargin: number;        // sellingPrice - recipeCost
  contributionMarginPct: number;     // (margin / sellingPrice) * 100
  foodCostPct: number;               // (recipeCost / sellingPrice) * 100
  totalQtySold: number;
  totalRevenue: number;
  totalProfit: number;
  category: MenuCategory;
  suggestion: string;                // actionable advice in Arabic
}

export interface MenuEngineeringSummary {
  fromDate: string;
  toDate: string;
  rows: MenuEngineeringRow[];
  avgQtySold: number;
  avgFoodCostPct: number;
  starCount: number;
  plowhorseCount: number;
  puzzleCount: number;
  dogCount: number;
  totalRevenue: number;
  totalProfit: number;
}

const SUGGESTIONS: Record<MenuCategory, string> = {
  star: "⭐ منتج رابح ومشهور — اعرضه في الواجهة وفي العروض",
  plowhorse: "🐴 مبيعات عالية لكن هامش ضعيف — راجع تكلفة الوصفة أو ارفع السعر قليلاً",
  puzzle: "🔮 هامش جيد لكن مبيعات منخفضة — سوّق له أكثر أو حسّن طريقة عرضه",
  dog: "🐕 مبيعات ضعيفة وهامش ضعيف — فكر في إزالته أو رفع سعره بشكل كبير",
  uncategorized: "لا توجد وصفة أو بيانات مبيعات كافية",
};

export async function getMenuEngineeringAnalysis(
  fromDate: string, // YYYY-MM-DD
  toDate: string    // YYYY-MM-DD
): Promise<MenuEngineeringSummary> {
  const conn = await getConn();
  try {
    // Step 1: Fetch sales in date range grouped by productId
    const [salesRows] = await conn.execute(
      `SELECT si.productId, SUM(si.qty) AS totalQty, SUM(si.netSales) AS totalRevenue
       FROM sale_items si
       JOIN sales_reports sr ON sr.id = si.reportId
       WHERE sr.reportDateFrom >= ? AND sr.reportDateTo <= ?
         AND si.productId IS NOT NULL
       GROUP BY si.productId`,
      [fromDate, toDate]
    ) as [any[], any];

    if (!salesRows.length) {
      return {
        fromDate, toDate, rows: [],
        avgQtySold: 0, avgFoodCostPct: 0,
        starCount: 0, plowhorseCount: 0, puzzleCount: 0, dogCount: 0,
        totalRevenue: 0, totalProfit: 0,
      };
    }

    const salesMap = new Map(
      salesRows.map((r: any) => [r.productId, {
        totalQty: parseFloat(r.totalQty || "0"),
        totalRevenue: parseFloat(r.totalRevenue || "0"),
      }])
    );

    // Step 2: Fetch product details + selling prices
    const productIds = Array.from(salesMap.keys());
    const ph = productIds.map(() => "?").join(",");
    const [productRows] = await conn.execute(
      `SELECT id, name, nameAr, categoryReference, price FROM products WHERE id IN (${ph})`,
      productIds
    ) as [any[], any];
    const productMap = new Map(productRows.map((p: any) => [p.id, p]));

    // Step 3: Fetch recipe costs (expand semi-finished one level)
    const [allMaterials] = await conn.execute(
      `SELECT id, lastPurchasePrice, unit FROM raw_materials`
    ) as [any[], any];
    const matPriceMap = new Map(allMaterials.map((m: any) => [m.id, {
      price: parseFloat(m.lastPurchasePrice || "0"),
      unit: m.unit,
    }]));

    const [allRecipes] = await conn.execute(
      `SELECT ri.productId, ri.materialId, ri.quantity, ri.unit,
              rm.materialType, rm.unit AS matUnit
       FROM recipe_items ri
       JOIN raw_materials rm ON rm.id = ri.materialId
       WHERE ri.productId IN (${ph})`,
      productIds
    ) as [any[], any];

    // Semi-finished ingredient lookup
    const [sfRecipes] = await conn.execute(
      `SELECT sfr.materialId AS sfId, sfr.ingredientId, sfr.quantity, sfr.unit,
              rm.unit AS matUnit
       FROM semi_finished_recipes sfr
       JOIN raw_materials rm ON rm.id = sfr.ingredientId`
    ) as [any[], any];
    const sfMap = new Map<number, any[]>();
    for (const sf of sfRecipes) {
      if (!sfMap.has(sf.sfId)) sfMap.set(sf.sfId, []);
      sfMap.get(sf.sfId)!.push(sf);
    }

    // Calculate recipe cost per product
    const recipeCostMap = new Map<number, number>(); // productId → cost per 1 portion
    for (const r of allRecipes) {
      const qty = parseFloat(r.quantity || "0");
      const matUnit = r.matUnit || "";

      let unitCost = 0;
      if (r.materialType === "semi_finished") {
        // Expand SF cost
        const sfIngredients = sfMap.get(r.materialId) || [];
        for (const sf of sfIngredients) {
          const sfQty = parseFloat(sf.quantity || "0");
          const sfConv = sfQty * unitConvFactor(sf.unit, sf.matUnit);
          const sfPrice = matPriceMap.get(sf.ingredientId)?.price ?? 0;
          unitCost += sfConv * sfPrice;
        }
      } else {
        const price = matPriceMap.get(r.materialId)?.price ?? 0;
        unitCost = price;
      }

      const converted = qty * unitConvFactor(r.unit, matUnit);
      const lineCost = converted * unitCost;
      recipeCostMap.set(r.productId, (recipeCostMap.get(r.productId) ?? 0) + lineCost);
    }

    // Step 4: Build rows
    const rows: MenuEngineeringRow[] = [];

    for (const [productId, sales] of salesMap.entries()) {
      const product = productMap.get(productId);
      if (!product) continue;

      const sellingPrice = parseFloat(product.price || "0");
      const recipeCost = recipeCostMap.get(productId) ?? 0;
      const margin = sellingPrice > 0 ? sellingPrice - recipeCost : 0;
      const marginPct = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;
      const fcPct = sellingPrice > 0 ? (recipeCost / sellingPrice) * 100 : 0;

      rows.push({
        productId,
        productName: product.name,
        productNameAr: product.nameAr,
        categoryReference: product.categoryReference,
        sellingPrice,
        recipeCost: parseFloat(recipeCost.toFixed(3)),
        contributionMargin: parseFloat(margin.toFixed(3)),
        contributionMarginPct: parseFloat(marginPct.toFixed(1)),
        foodCostPct: parseFloat(fcPct.toFixed(1)),
        totalQtySold: sales.totalQty,
        totalRevenue: parseFloat(sales.totalRevenue.toFixed(2)),
        totalProfit: parseFloat((sales.totalQty * margin).toFixed(2)),
        category: "uncategorized",
        suggestion: SUGGESTIONS.uncategorized,
      });
    }

    // Step 5: Classify using averages
    const avgQty = rows.reduce((s, r) => s + r.totalQtySold, 0) / rows.length;
    const avgFcPct = rows.filter(r => r.sellingPrice > 0).reduce((s, r) => s + r.foodCostPct, 0) /
                     Math.max(1, rows.filter(r => r.sellingPrice > 0).length);

    let starCount = 0, plowhorseCount = 0, puzzleCount = 0, dogCount = 0;

    for (const row of rows) {
      if (row.sellingPrice <= 0) {
        row.category = "uncategorized";
        row.suggestion = SUGGESTIONS.uncategorized;
        continue;
      }

      const highPop = row.totalQtySold >= avgQty;
      const highProfit = row.foodCostPct < avgFcPct; // lower FC% = higher profit margin

      if (highPop && highProfit)       { row.category = "star";       starCount++; }
      else if (highPop && !highProfit) { row.category = "plowhorse";  plowhorseCount++; }
      else if (!highPop && highProfit) { row.category = "puzzle";     puzzleCount++; }
      else                             { row.category = "dog";        dogCount++; }

      row.suggestion = SUGGESTIONS[row.category];
    }

    // Sort: stars first
    const catOrder: Record<MenuCategory, number> = { star: 0, puzzle: 1, plowhorse: 2, dog: 3, uncategorized: 4 };
    rows.sort((a, b) => catOrder[a.category] - catOrder[b.category] || b.totalQtySold - a.totalQtySold);

    const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
    const totalProfit = rows.reduce((s, r) => s + r.totalProfit, 0);

    return {
      fromDate, toDate, rows,
      avgQtySold: parseFloat(avgQty.toFixed(1)),
      avgFoodCostPct: parseFloat(avgFcPct.toFixed(1)),
      starCount, plowhorseCount, puzzleCount, dogCount,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
    };
  } finally {
    await conn.release();
  }
}
