/**
 * Consumption Calculator DB helpers
 * Given a list of { productId, qty }, returns the raw materials consumed
 * (semi-finished materials are recursively expanded to their raw components)
 */
import { getDb } from "./db";
import { recipeItems, rawMaterials, semiFinishedRecipes, products } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

type ConsumptionMap = Map<number, {
  materialId: number;
  materialName: string;
  unit: string;
  totalQty: number;
  unitCost: number;
  totalCost: number;
}>;

async function accumulateRaw(
  d: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  materialId: number,
  materialName: string,
  materialType: string,
  unit: string,
  averageCost: string | null,
  lastPurchasePrice: string | null,
  qty: number,
  map: ConsumptionMap,
  depth = 0
) {
  if (depth > 5) return;

  if (materialType === "semi_finished") {
    // Expand semi-finished to its raw components
    const components = await d.select({
      ingredientId: semiFinishedRecipes.ingredientId,
      quantity: semiFinishedRecipes.quantity,
      unit: semiFinishedRecipes.unit,
      ingName: rawMaterials.name,
      ingType: rawMaterials.materialType,
      ingAvgCost: rawMaterials.averageCost,
      ingLastPrice: rawMaterials.lastPurchasePrice,
    }).from(semiFinishedRecipes)
      .innerJoin(rawMaterials, eq(semiFinishedRecipes.ingredientId, rawMaterials.id))
      .where(eq(semiFinishedRecipes.materialId, materialId));

    for (const comp of components) {
      const compQty = parseFloat(String(comp.quantity)) * qty;
      await accumulateRaw(
        d, comp.ingredientId, comp.ingName, comp.ingType,
        comp.unit, comp.ingAvgCost, comp.ingLastPrice,
        compQty, map, depth + 1
      );
    }
  } else {
    // Pure raw material
    const unitCost = parseFloat(String(averageCost || lastPurchasePrice || "0"));
    const existing = map.get(materialId);
    if (existing) {
      existing.totalQty += qty;
      existing.totalCost += qty * unitCost;
    } else {
      map.set(materialId, {
        materialId, materialName, unit,
        totalQty: qty, unitCost,
        totalCost: qty * unitCost,
      });
    }
  }
}

export interface ConsumptionInput {
  productId: number;
  qty: number;
}

export interface ConsumptionResult {
  /** Aggregated raw materials (no semi-finished) */
  rawMaterials: Array<{
    materialId: number;
    materialName: string;
    unit: string;
    totalQty: number;
    unitCost: number;
    totalCost: number;
  }>;
  /** Per-product breakdown showing each product's recipe items */
  productBreakdown: Array<{
    productId: number;
    productName: string;
    sku: string | null;
    soldQty: number;
    ingredients: Array<{
      materialId: number;
      materialName: string;
      materialType: string;
      unit: string;
      qtyPerUnit: number;
      totalQty: number;
      unitCost: number;
      totalCost: number;
    }>;
  }>;
  /** Products that have no recipe */
  noRecipe: Array<{ productId: number; productName: string; qty: number }>;
  /** Grand total cost */
  totalCost: number;
}

export async function calculateConsumption(items: ConsumptionInput[]): Promise<ConsumptionResult> {
  const d = await getDb();
  if (!d) throw new Error("DB not available");

  const map: ConsumptionMap = new Map();
  const productBreakdown: ConsumptionResult["productBreakdown"] = [];
  const noRecipe: ConsumptionResult["noRecipe"] = [];

  // Fetch product names for all productIds
  const productIds = items.map((i) => i.productId);
  const productRows = productIds.length > 0
    ? await d.select({ id: products.id, name: products.name, sku: products.sku })
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const productMap = new Map(productRows.map((p) => [p.id, p]));

  for (const item of items) {
    if (item.qty <= 0) continue;

    const recipe = await d.select({
      materialId: recipeItems.materialId,
      quantity: recipeItems.quantity,
      unit: recipeItems.unit,
      materialName: rawMaterials.name,
      materialType: rawMaterials.materialType,
      averageCost: rawMaterials.averageCost,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    }).from(recipeItems)
      .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
      .where(eq(recipeItems.productId, item.productId));

    const prod = productMap.get(item.productId);
    const productName = prod?.name ?? `Product #${item.productId}`;
    const sku = prod?.sku ?? null;

    if (recipe.length === 0) {
      noRecipe.push({ productId: item.productId, productName, qty: item.qty });
      continue;
    }

    // Per-product breakdown (shows recipe as-is including semi-finished)
    productBreakdown.push({
      productId: item.productId,
      productName,
      sku,
      soldQty: item.qty,
      ingredients: recipe.map((r) => {
        const qtyPerUnit = parseFloat(String(r.quantity));
        const totalQty = parseFloat((qtyPerUnit * item.qty).toFixed(4));
        const unitCost = parseFloat(String(r.averageCost || r.lastPurchasePrice || "0"));
        return {
          materialId: r.materialId,
          materialName: r.materialName,
          materialType: r.materialType,
          unit: r.unit,
          qtyPerUnit,
          totalQty,
          unitCost,
          totalCost: parseFloat((totalQty * unitCost).toFixed(3)),
        };
      }),
    });

    // Aggregate raw materials only (expand semi-finished)
    for (const r of recipe) {
      const qtyPerUnit = parseFloat(String(r.quantity));
      const totalQty = qtyPerUnit * item.qty;
      await accumulateRaw(
        d, r.materialId, r.materialName, r.materialType,
        r.unit, r.averageCost, r.lastPurchasePrice,
        totalQty, map
      );
    }
  }

  const rawMaterialsList = Array.from(map.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .map((c) => ({
      ...c,
      totalQty: parseFloat(c.totalQty.toFixed(4)),
      totalCost: parseFloat(c.totalCost.toFixed(3)),
    }));

  const totalCost = parseFloat(rawMaterialsList.reduce((s, r) => s + r.totalCost, 0).toFixed(3));

  return { rawMaterials: rawMaterialsList, productBreakdown, noRecipe, totalCost };
}
