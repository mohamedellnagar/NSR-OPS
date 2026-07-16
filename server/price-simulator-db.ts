/**
 * Price Impact Simulator
 * "What if the price of ingredient X increases by Y%?"
 * Shows impact on every recipe that uses it, sorted by highest impact.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

import { getConn } from "./pool";
export interface RecipeImpact {
  productId: number;
  productName: string;
  productNameAr: string | null;
  sellingPrice: number;
  currentRecipeCost: number;
  newRecipeCost: number;
  costDelta: number;             // AED difference
  costDeltaPct: number;          // % change in recipe cost
  currentFoodCostPct: number;    // current food cost %
  newFoodCostPct: number;        // new food cost %
  fcDeltaPct: number;            // how much food cost % changes
  impact: "high" | "medium" | "low"; // high > 2pp, medium > 0.5pp, low otherwise
  currentMargin: number;
  newMargin: number;
}

export interface SimulationResult {
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  currentPrice: number;
  simulatedPrice: number;
  priceChangePct: number;
  affectedRecipes: RecipeImpact[];
  totalRecipesAffected: number;
  highImpactCount: number;
  avgFoodCostDelta: number;
}

export interface PriceHistoryPoint {
  date: string;
  price: number;
  supplierId: number | null;
  supplierName: string | null;
  qty: number;
}

// Convert recipe units to material base unit for cost calculation
function convertQtyToBaseUnit(qty: number, recipeUnit: string, materialUnit: string): number {
  if (recipeUnit === materialUnit) return qty;
  const key = `${recipeUnit}->${materialUnit}`;
  const conversionMap: Record<string, number> = {
    "g->kg": 0.001, "kg->g": 1000,
    "ml->l": 0.001, "l->ml": 1000,
    "g->g": 1, "kg->kg": 1, "ml->ml": 1, "l->l": 1,
  };
  return qty * (conversionMap[key] ?? 1);
}

export async function simulatePriceChange(
  materialId: number,
  simulatedPrice: number
): Promise<SimulationResult> {
  const conn = await getConn();
  try {
    // Get material info
    const [matRows] = await conn.query<any[]>(
      `SELECT id, name, nameAr, unit, lastPurchasePrice FROM raw_materials WHERE id = ?`,
      [materialId]
    );
    const material = (matRows as any[])[0];
    if (!material) throw new Error(`Material ${materialId} not found`);

    const currentPrice = parseFloat(material.lastPurchasePrice) || 0;

    // Get all recipes that contain this material
    const [recipeRows] = await conn.query<any[]>(`
      SELECT
        ri.productId,
        ri.quantity,
        ri.unit AS recipeUnit,
        p.name AS productName,
        p.nameAr AS productNameAr,
        p.price AS sellingPrice
      FROM recipe_items ri
      JOIN products p ON p.id = ri.productId
      WHERE ri.materialId = ?
    `, [materialId]);

    if ((recipeRows as any[]).length === 0) {
      return {
        materialId,
        materialName: material.name,
        materialNameAr: material.nameAr,
        unit: material.unit,
        currentPrice,
        simulatedPrice,
        priceChangePct: currentPrice > 0 ? ((simulatedPrice - currentPrice) / currentPrice) * 100 : 0,
        affectedRecipes: [],
        totalRecipesAffected: 0,
        highImpactCount: 0,
        avgFoodCostDelta: 0,
      };
    }

    // For each affected product, get ALL its recipe items to calculate total recipe cost
    const productIds = [...new Set((recipeRows as any[]).map((r: any) => r.productId))];

    // Get full recipe for each product (all ingredients + prices)
    const [allItems] = await conn.query<any[]>(`
      SELECT
        ri.productId,
        ri.materialId,
        ri.quantity,
        ri.unit AS recipeUnit,
        rm.unit AS materialUnit,
        rm.lastPurchasePrice,
        rm.materialType
      FROM recipe_items ri
      JOIN raw_materials rm ON rm.id = ri.materialId
      WHERE ri.productId IN (${productIds.map(() => "?").join(",")})
    `, productIds);

    // Group by product
    const recipeByProduct: Record<number, any[]> = {};
    for (const row of allItems as any[]) {
      if (!recipeByProduct[row.productId]) recipeByProduct[row.productId] = [];
      recipeByProduct[row.productId].push(row);
    }

    // Build impacts
    const impacts: RecipeImpact[] = [];
    for (const recipeRow of recipeRows as any[]) {
      const pid = recipeRow.productId;
      const items = recipeByProduct[pid] ?? [];
      const sellingPrice = parseFloat(recipeRow.sellingPrice) || 0;

      let currentRecipeCost = 0;
      let newRecipeCost = 0;

      for (const item of items) {
        const qty = convertQtyToBaseUnit(parseFloat(item.quantity) || 0, item.recipeUnit, item.materialUnit);
        const itemCurrentPrice = item.materialId === materialId ? currentPrice : (parseFloat(item.lastPurchasePrice) || 0);
        const itemNewPrice = item.materialId === materialId ? simulatedPrice : itemCurrentPrice;
        currentRecipeCost += qty * itemCurrentPrice;
        newRecipeCost += qty * itemNewPrice;
      }

      const costDelta = newRecipeCost - currentRecipeCost;
      const costDeltaPct = currentRecipeCost > 0 ? (costDelta / currentRecipeCost) * 100 : 0;
      const currentFoodCostPct = sellingPrice > 0 ? (currentRecipeCost / sellingPrice) * 100 : 0;
      const newFoodCostPct = sellingPrice > 0 ? (newRecipeCost / sellingPrice) * 100 : 0;
      const fcDeltaPct = newFoodCostPct - currentFoodCostPct;

      let impact: RecipeImpact["impact"] = "low";
      if (Math.abs(fcDeltaPct) > 2) impact = "high";
      else if (Math.abs(fcDeltaPct) > 0.5) impact = "medium";

      impacts.push({
        productId: pid,
        productName: recipeRow.productName,
        productNameAr: recipeRow.productNameAr,
        sellingPrice,
        currentRecipeCost: Math.round(currentRecipeCost * 1000) / 1000,
        newRecipeCost: Math.round(newRecipeCost * 1000) / 1000,
        costDelta: Math.round(costDelta * 1000) / 1000,
        costDeltaPct: Math.round(costDeltaPct * 10) / 10,
        currentFoodCostPct: Math.round(currentFoodCostPct * 10) / 10,
        newFoodCostPct: Math.round(newFoodCostPct * 10) / 10,
        fcDeltaPct: Math.round(fcDeltaPct * 10) / 10,
        impact,
        currentMargin: Math.round((sellingPrice - currentRecipeCost) * 100) / 100,
        newMargin: Math.round((sellingPrice - newRecipeCost) * 100) / 100,
      });
    }

    // Sort by absolute fc delta descending
    impacts.sort((a, b) => Math.abs(b.fcDeltaPct) - Math.abs(a.fcDeltaPct));

    const highImpactCount = impacts.filter(i => i.impact === "high").length;
    const avgFoodCostDelta = impacts.length > 0
      ? impacts.reduce((s, i) => s + i.fcDeltaPct, 0) / impacts.length
      : 0;

    return {
      materialId,
      materialName: material.name,
      materialNameAr: material.nameAr,
      unit: material.unit,
      currentPrice,
      simulatedPrice,
      priceChangePct: currentPrice > 0 ? Math.round(((simulatedPrice - currentPrice) / currentPrice) * 1000) / 10 : 0,
      affectedRecipes: impacts,
      totalRecipesAffected: impacts.length,
      highImpactCount,
      avgFoodCostDelta: Math.round(avgFoodCostDelta * 10) / 10,
    };
  } finally {
    await conn.end();
  }
}

export async function getMaterialPriceHistory(materialId: number): Promise<PriceHistoryPoint[]> {
  const conn = await getConn();
  try {
    const [rows] = await conn.query<any[]>(`
      SELECT
        DATE(t.transactionDate) AS date,
        t.unitPrice AS price,
        t.supplierId,
        s.name AS supplierName,
        t.quantity AS qty
      FROM inventory_transactions t
      LEFT JOIN suppliers s ON s.id = t.supplierId
      WHERE t.materialId = ?
        AND t.transactionType = 'IN'
        AND t.unitPrice IS NOT NULL
        AND t.unitPrice > 0
      ORDER BY t.transactionDate DESC
      LIMIT 60
    `, [materialId]);
    return (rows as any[]).map((r: any) => ({
      date: String(r.date).split("T")[0],
      price: parseFloat(r.price),
      supplierId: r.supplierId ? parseInt(r.supplierId) : null,
      supplierName: r.supplierName || null,
      qty: parseFloat(r.qty),
    }));
  } finally {
    await conn.end();
  }
}

export async function getTopVolatileMaterials(limit = 10): Promise<any[]> {
  const conn = await getConn();
  try {
    // Materials with most price variance in last 90 days
    const [rows] = await conn.query<any[]>(`
      SELECT
        m.id, m.name, m.nameAr, m.unit,
        m.lastPurchasePrice,
        COUNT(t.id) AS purchaseCount,
        MIN(t.unitPrice) AS minPrice,
        MAX(t.unitPrice) AS maxPrice,
        AVG(t.unitPrice) AS avgPrice,
        STDDEV(t.unitPrice) AS priceStdDev,
        (MAX(t.unitPrice) - MIN(t.unitPrice)) / NULLIF(AVG(t.unitPrice), 0) * 100 AS volatilityPct
      FROM raw_materials m
      JOIN inventory_transactions t ON t.materialId = m.id
      WHERE t.transactionType = 'IN'
        AND t.unitPrice > 0
        AND t.transactionDate >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        AND m.isActive = 1
      GROUP BY m.id
      HAVING purchaseCount >= 2
      ORDER BY volatilityPct DESC
      LIMIT ?
    `, [limit]);
    return (rows as any[]).map((r: any) => ({
      materialId: r.id,
      materialName: r.name,
      materialNameAr: r.nameAr,
      unit: r.unit,
      currentPrice: parseFloat(r.lastPurchasePrice) || 0,
      minPrice: parseFloat(r.minPrice),
      maxPrice: parseFloat(r.maxPrice),
      avgPrice: parseFloat(r.avgPrice),
      volatilityPct: Math.round(parseFloat(r.volatilityPct) * 10) / 10,
      purchaseCount: parseInt(r.purchaseCount),
    }));
  } finally {
    await conn.end();
  }
}
