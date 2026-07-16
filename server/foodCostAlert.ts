/**
 * foodCostAlert.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Called after any raw-material price update.
 * Calculates the Food Cost % change for every recipe that uses the updated
 * material — either directly as a raw ingredient, or indirectly through a
 * semi-finished material whose recipe contains the updated raw material.
 * If the change exceeds 1 percentage point, sends a WhatsApp notification
 * via triggerEventSubscriptions.
 */

import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { triggerEventSubscriptions } from "./whatsappScheduler";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Convert recipe quantity units (g→kg, ml→l) */
function convertQty(qty: number, unit: string, matUnit: string): number {
  const u = unit.toLowerCase();
  const m = matUnit.toLowerCase();
  if ((u === "g" || u === "gram") && (m === "kg" || m === "kilogram")) {
    return qty / 1000;
  }
  if ((u === "ml" || u === "milliliter") && (m === "l" || m === "liter" || m === "litre")) {
    return qty / 1000;
  }
  return qty;
}

/**
 * Compute the per-unit cost of a semi-finished material given a price override
 * map for raw materials.
 * Returns the total cost per 1 unit of the semi-finished material.
 */
async function calcSemiFinishedCost(
  conn: mysql.Connection,
  semiFinishedId: number,
  priceOverrides: Map<number, number>
): Promise<number> {
  const [rows] = await conn.execute(
    `SELECT sfr.ingredientId, sfr.quantity, sfr.unit,
            ing.lastPurchasePrice, ing.unit AS ingUnit
     FROM semi_finished_recipes sfr
     JOIN raw_materials ing ON ing.id = sfr.ingredientId
     WHERE sfr.materialId = ?`,
    [semiFinishedId]
  );

  let total = 0;
  for (const row of rows as any[]) {
    const qty = parseFloat(row.quantity || "0");
    const converted = convertQty(qty, row.unit || "", row.ingUnit || "");
    const price =
      priceOverrides.get(row.ingredientId) ??
      parseFloat(row.lastPurchasePrice || "0");
    total += converted * price;
  }
  return total;
}

/**
 * Compute the per-unit recipe cost for a product given a price override map.
 * priceOverrides: materialId → new price (raw material price overrides).
 *
 * For semi-finished ingredients, the cost is computed dynamically from their
 * own recipe (semi_finished_recipes), applying the same price overrides.
 */
async function calcRecipeCost(
  conn: mysql.Connection,
  productId: number,
  priceOverrides: Map<number, number>
): Promise<number> {
  const [rows] = await conn.execute(
    `SELECT ri.materialId, ri.quantity, ri.unit,
            rm.lastPurchasePrice, rm.unit AS matUnit, rm.materialType
     FROM recipe_items ri
     JOIN raw_materials rm ON rm.id = ri.materialId
     WHERE ri.productId = ?`,
    [productId]
  );

  let total = 0;
  for (const row of rows as any[]) {
    const qty = parseFloat(row.quantity || "0");
    const converted = convertQty(qty, row.unit || "", row.matUnit || "");

    let unitPrice: number;
    if (row.materialType === "semi_finished") {
      // Compute the semi-finished cost dynamically from its recipe
      unitPrice = await calcSemiFinishedCost(conn, row.materialId, priceOverrides);
    } else {
      // Raw material: use override or stored price
      unitPrice =
        priceOverrides.get(row.materialId) ??
        parseFloat(row.lastPurchasePrice || "0");
    }

    total += converted * unitPrice;
  }
  return total;
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * checkFoodCostImpact
 *
 * @param materialId   The raw material whose price changed
 * @param oldPrice     Price before the change
 * @param newPrice     Price after the change
 */
export async function checkFoodCostImpact(
  materialId: number,
  oldPrice: number,
  newPrice: number
): Promise<void> {
  if (oldPrice === newPrice) return;

  const conn = await getConn();
  try {
    // ── 1. Find products affected DIRECTLY (recipe_items → raw material) ────
    const [directRows] = await conn.execute(
      `SELECT DISTINCT p.id, p.nameAr, p.name, p.price
       FROM recipe_items ri
       JOIN products p ON p.id = ri.productId
       JOIN raw_materials rm ON rm.id = ri.materialId
       WHERE ri.materialId = ? AND rm.materialType = 'raw'`,
      [materialId]
    );

    // ── 2. Find semi-finished materials that contain this raw material ───────
    const [sfRows] = await conn.execute(
      `SELECT DISTINCT sfr.materialId AS sfId, sf.name AS sfName, sf.nameAr AS sfNameAr
       FROM semi_finished_recipes sfr
       JOIN raw_materials sf ON sf.id = sfr.materialId
       WHERE sfr.ingredientId = ?`,
      [materialId]
    );
    const semiFinishedIds = (sfRows as any[]).map((r) => r.sfId);

    // ── 3. Find products affected INDIRECTLY (recipe_items → semi-finished) ─
    let indirectRows: any[] = [];
    if (semiFinishedIds.length > 0) {
      const placeholders = semiFinishedIds.map(() => "?").join(", ");
      const [iRows] = await conn.execute(
        `SELECT DISTINCT p.id, p.nameAr, p.name, p.price
         FROM recipe_items ri
         JOIN products p ON p.id = ri.productId
         WHERE ri.materialId IN (${placeholders})`,
        semiFinishedIds
      );
      indirectRows = iRows as any[];
    }

    // ── 4. Merge direct + indirect (deduplicate by product id) ───────────────
    const productMap = new Map<number, any>();
    for (const p of [...(directRows as any[]), ...indirectRows]) {
      productMap.set(p.id, p);
    }
    const products = Array.from(productMap.values());
    if (!products.length) return;

    // ── 5. Get material name for the notification message ────────────────────
    const [matRows] = await conn.execute(
      "SELECT name, nameAr FROM raw_materials WHERE id = ?",
      [materialId]
    );
    const mat = (matRows as any[])[0];
    const matName = mat?.nameAr || mat?.name || `مادة #${materialId}`;

    // ── 6. For each product, compute old and new Food Cost % ─────────────────
    const oldOverride = new Map([[materialId, oldPrice]]);
    const newOverride = new Map([[materialId, newPrice]]);

    const affected: Array<{
      productName: string;
      oldPct: number;
      newPct: number;
      diff: number;
      indirect: boolean;
    }> = [];

    for (const product of products) {
      const sellingPrice = parseFloat(product.price || "0");
      if (sellingPrice <= 0) continue;

      const oldCost = await calcRecipeCost(conn, product.id, oldOverride);
      const newCost = await calcRecipeCost(conn, product.id, newOverride);

      const oldPct = (oldCost / sellingPrice) * 100;
      const newPct = (newCost / sellingPrice) * 100;
      const diff = Math.abs(newPct - oldPct);

      if (diff >= 1) {
        // Check if this product is affected indirectly (via semi-finished)
        const isIndirect = indirectRows.some((r) => r.id === product.id);
        affected.push({
          productName: product.nameAr || product.name,
          oldPct: parseFloat(oldPct.toFixed(1)),
          newPct: parseFloat(newPct.toFixed(1)),
          diff: parseFloat(diff.toFixed(1)),
          indirect: isIndirect,
        });
      }
    }

    if (!affected.length) return;

    // ── 7. Build the {{affected_recipes}} variable ───────────────────────────
    const arrow = newPrice > oldPrice ? "📈" : "📉";
    const priceChange = `${arrow} *${matName}*: ${oldPrice.toFixed(3)} ← ${newPrice.toFixed(3)} د.إ`;

    // List semi-finished materials affected (for context)
    let sfContext = "";
    if (semiFinishedIds.length > 0 && indirectRows.length > 0) {
      const sfNames = (sfRows as any[])
        .map((r) => r.sfNameAr || r.sfName)
        .join("، ");
      sfContext = `\n🔗 عبر المواد المصنّعة: ${sfNames}`;
    }

    const recipeLines = affected
      .map((r) => {
        const tag = r.indirect ? " 🔗" : "";
        return `• *${r.productName}*${tag}\n  Food Cost: ${r.oldPct}% ← ${r.newPct}% (${r.diff > 0 ? "+" : ""}${(r.newPct - r.oldPct).toFixed(1)}%)`;
      })
      .join("\n");

    const affectedText = `${priceChange}${sfContext}\n\n📋 الوصفات المتأثرة (${affected.length}):\n${recipeLines}`;

    const now = new Date();
    const dateStr = now.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // ── 8. Trigger WhatsApp notification ─────────────────────────────────────
    await triggerEventSubscriptions("food_cost_alert", {
      date: dateStr,
      material_name: matName,
      old_price: oldPrice.toFixed(3),
      new_price: newPrice.toFixed(3),
      affected_count: String(affected.length),
      affected_recipes: affectedText,
    });
  } catch (err) {
    console.error("[foodCostAlert] Error:", err);
  } finally {
    await conn.release();
  }
}
