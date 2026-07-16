/**
 * production-planning-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Production Planning Calculator
 *
 * Given a list of desired products + quantities, calculates:
 * - Total raw material requirements (direct + via semi-finished expansion)
 * - Available stock vs required
 * - Shortfall per material
 * - Maximum producible units before stockout (bottleneck detection)
 */

import mysql from "mysql2/promise";

import { getConn } from "./pool";
/** Unit conversion: recipe unit → material unit */
function unitConvFactor(recipeUnit: string, matUnit: string): number {
  const ru = (recipeUnit || "").toLowerCase().trim();
  const mu = (matUnit || "").toLowerCase().trim();
  if ((ru === "g" || ru === "gram" || ru === "غرام") && (mu === "kg" || mu === "كيلو" || mu === "كجم")) return 1 / 1000;
  if ((ru === "ml" || ru === "مل") && (mu === "l" || mu === "liter" || mu === "لتر")) return 1 / 1000;
  if ((ru === "kg" || ru === "كيلو") && (mu === "g" || mu === "gram" || mu === "غرام")) return 1000;
  return 1;
}

export interface MaterialRequirement {
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  requiredQty: number;       // total needed for all desired products
  availableQty: number;      // current stock
  shortfallQty: number;      // max(0, required - available)
  status: "ok" | "low" | "missing";  // ok = enough stock, low = partial, missing = none
  lastPurchasePrice: number | null;
  shortfallCost: number;     // shortfallQty × lastPurchasePrice
}

export interface ProductFeasibility {
  productId: number;
  productName: string;
  productNameAr: string | null;
  desiredQty: number;
  maxProducible: number;     // max units before any ingredient runs out
  bottleneckMaterial: string | null; // which material limits production
  canFullyProduce: boolean;
}

export interface ProductionPlan {
  items: ProductFeasibility[];
  materials: MaterialRequirement[];
  totalShortfallCost: number;
  allFeasible: boolean;
}

/**
 * For a given productId, get all raw material requirements (1 unit of production).
 * Expands semi-finished ingredients one level deep.
 */
async function getRawRequirements(
  conn: mysql.Connection,
  productId: number
): Promise<Array<{ materialId: number; qtyPer1Unit: number; unit: string; matUnit: string }>> {
  // Level 1: direct recipe items
  const [rows] = await conn.execute(
    `SELECT ri.materialId, ri.quantity, ri.unit,
            rm.unit AS matUnit, rm.materialType
     FROM recipe_items ri
     JOIN raw_materials rm ON rm.id = ri.materialId
     WHERE ri.productId = ?`,
    [productId]
  ) as [any[], any];

  const result: Array<{ materialId: number; qtyPer1Unit: number; unit: string; matUnit: string }> = [];

  for (const row of rows) {
    const qty = parseFloat(row.quantity || "0");
    const converted = qty * unitConvFactor(row.unit, row.matUnit);

    if (row.materialType === "semi_finished") {
      // Level 2: expand semi-finished recipe
      const [sfRows] = await conn.execute(
        `SELECT sfr.ingredientId AS materialId, sfr.quantity, sfr.unit,
                rm2.unit AS matUnit
         FROM semi_finished_recipes sfr
         JOIN raw_materials rm2 ON rm2.id = sfr.ingredientId
         WHERE sfr.materialId = ?`,
        [row.materialId]
      ) as [any[], any];

      for (const sfRow of sfRows) {
        const sfQty = parseFloat(sfRow.quantity || "0");
        const sfConverted = sfQty * unitConvFactor(sfRow.unit, sfRow.matUnit);
        // Multiply by how much of the semi-finished we need per 1 product unit
        result.push({
          materialId: sfRow.materialId,
          qtyPer1Unit: sfConverted * converted,
          unit: sfRow.matUnit,
          matUnit: sfRow.matUnit,
        });
      }
    } else {
      result.push({
        materialId: row.materialId,
        qtyPer1Unit: converted,
        unit: row.matUnit,
        matUnit: row.matUnit,
      });
    }
  }

  return result;
}

export async function calcProductionRequirements(
  items: Array<{ productId: number; desiredQty: number }>
): Promise<ProductionPlan> {
  if (!items.length) return { items: [], materials: [], totalShortfallCost: 0, allFeasible: true };

  const conn = await getConn();
  try {
    // Step 1: Fetch product names
    const productIds = items.map((i) => i.productId);
    const placeholders = productIds.map(() => "?").join(",");
    const [productRows] = await conn.execute(
      `SELECT id, name, nameAr FROM products WHERE id IN (${placeholders})`,
      productIds
    ) as [any[], any];
    const productMap = new Map(productRows.map((p: any) => [p.id, p]));

    // Step 2: Fetch current stock for all materials
    const [stockRows] = await conn.execute(
      `SELECT id, name, nameAr, unit, currentQuantity, lastPurchasePrice FROM raw_materials WHERE isActive = 1`
    ) as [any[], any];
    const stockMap = new Map(
      stockRows.map((r: any) => [
        r.id,
        {
          name: r.name,
          nameAr: r.nameAr,
          unit: r.unit,
          currentQty: parseFloat(r.currentQuantity || "0"),
          lastPurchasePrice: r.lastPurchasePrice ? parseFloat(r.lastPurchasePrice) : null,
        },
      ])
    );

    // Step 3: Aggregate required quantities per raw material across all desired items
    const requiredMap = new Map<number, number>(); // materialId → totalRequired

    const feasibilityList: ProductFeasibility[] = [];

    for (const item of items) {
      const reqs = await getRawRequirements(conn, item.productId);

      // Calculate max producible for this product
      let maxProducible = Infinity;
      let bottleneckMaterial: string | null = null;

      for (const req of reqs) {
        const stock = stockMap.get(req.materialId);
        const available = stock?.currentQty ?? 0;
        const qtyNeeded = req.qtyPer1Unit;
        if (qtyNeeded > 0) {
          const canMake = Math.floor(available / qtyNeeded);
          if (canMake < maxProducible) {
            maxProducible = canMake;
            bottleneckMaterial = stock?.nameAr || stock?.name || `#${req.materialId}`;
          }
        }

        // Accumulate total required
        const prev = requiredMap.get(req.materialId) ?? 0;
        requiredMap.set(req.materialId, prev + req.qtyPer1Unit * item.desiredQty);
      }

      if (maxProducible === Infinity) maxProducible = item.desiredQty; // no recipe

      const product = productMap.get(item.productId);
      feasibilityList.push({
        productId: item.productId,
        productName: product?.name || `Product #${item.productId}`,
        productNameAr: product?.nameAr || null,
        desiredQty: item.desiredQty,
        maxProducible: Math.min(maxProducible, item.desiredQty),
        bottleneckMaterial,
        canFullyProduce: maxProducible >= item.desiredQty,
      });
    }

    // Step 4: Build material requirements list
    const materialList: MaterialRequirement[] = [];
    let totalShortfallCost = 0;

    for (const [materialId, requiredQty] of requiredMap.entries()) {
      const stock = stockMap.get(materialId);
      if (!stock) continue;

      const available = stock.currentQty;
      const shortfall = Math.max(0, requiredQty - available);
      const price = stock.lastPurchasePrice ?? 0;
      const shortfallCost = shortfall * price;
      totalShortfallCost += shortfallCost;

      let status: "ok" | "low" | "missing";
      if (shortfall === 0) status = "ok";
      else if (available > 0) status = "low";
      else status = "missing";

      materialList.push({
        materialId,
        materialName: stock.name,
        materialNameAr: stock.nameAr,
        unit: stock.unit,
        requiredQty: parseFloat(requiredQty.toFixed(3)),
        availableQty: parseFloat(available.toFixed(3)),
        shortfallQty: parseFloat(shortfall.toFixed(3)),
        status,
        lastPurchasePrice: stock.lastPurchasePrice,
        shortfallCost: parseFloat(shortfallCost.toFixed(3)),
      });
    }

    // Sort: missing first → low → ok
    materialList.sort((a, b) => {
      const order = { missing: 0, low: 1, ok: 2 };
      return order[a.status] - order[b.status];
    });

    return {
      items: feasibilityList,
      materials: materialList,
      totalShortfallCost: parseFloat(totalShortfallCost.toFixed(3)),
      allFeasible: feasibilityList.every((f) => f.canFullyProduce),
    };
  } finally {
    await conn.end();
  }
}

/** Quick single-product feasibility check */
export async function checkSingleProductFeasibility(
  productId: number,
  qty: number
): Promise<{ canProduce: boolean; maxProducible: number; bottleneck: string | null }> {
  const plan = await calcProductionRequirements([{ productId, desiredQty: qty }]);
  const item = plan.items[0];
  return {
    canProduce: item?.canFullyProduce ?? false,
    maxProducible: item?.maxProducible ?? 0,
    bottleneck: item?.bottleneckMaterial ?? null,
  };
}
