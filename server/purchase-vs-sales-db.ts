import { getConn } from "./pool";
/**
 * Purchase vs Expected Consumption Analysis
 * Compares: what was PURCHASED (invoice_items) vs what was EXPECTED to be consumed (sale_items × recipe_items)
 *
 * TWO-LEVEL recipe expansion:
 *   Level 1: sale_items × recipe_items  → if recipe ingredient is semi_finished → expand via semi_finished_recipes
 *   Level 2: semi_finished_recipes      → raw material consumption per unit of semi_finished
 *
 * Example:
 *   Sold 10 "نص دجاج فحم"
 *   → recipe: 0.5 "انتاج - دجاج فحم" per unit  → 5 units needed
 *   → semi_finished recipe for "انتاج - دجاج فحم": 1 "دجاج كاملة" per unit
 *   → Expected consumption of "دجاج كاملة" = 5 × 1 = 5 pcs
 */

async function getConnection() {
  return getConn();
}

export interface PurchaseVsSalesRow {
  materialId: number;
  materialName: string;
  unit: string;
  lastPurchasePrice: number;
  materialType: string;
  // Purchases from supplier invoices
  purchasedQty: number;
  purchasedCost: number;
  // Expected consumption from sales × recipes (2-level)
  expectedQty: number;
  expectedCost: number;
  // Difference
  diffQty: number;       // purchasedQty - expectedQty
  diffCost: number;      // purchasedCost - expectedCost
  diffPct: number | null; // diffQty / expectedQty * 100 (null if expectedQty=0)
}

export interface PurchaseVsSalesSummary {
  totalPurchasedCost: number;
  totalExpectedCost: number;
  totalDiffCost: number;
  rows: PurchaseVsSalesRow[];
}

/** Convert recipe unit → material unit factor */
function unitConvFactor(recipeUnit: string, matUnit: string): number {
  const ru = (recipeUnit || "").toLowerCase().trim();
  const mu = (matUnit || "").toLowerCase().trim();
  if ((ru === "g" || ru === "gram" || ru === "غرام") &&
      (mu === "kg" || mu === "كيلو" || mu === "كجم")) return 1 / 1000;
  if ((ru === "ml" || ru === "مل") &&
      (mu === "l" || mu === "liter" || mu === "لتر")) return 1 / 1000;
  return 1;
}

export async function getPurchaseVsSalesAnalysis(
  fromDate: string,   // YYYY-MM-DD
  toDate: string,     // YYYY-MM-DD
  search?: string
): Promise<PurchaseVsSalesSummary> {
  const conn = await getConnection();

  try {
    // ── 1. Purchases from supplier invoices ─────────────────────────────────
    const [purchRows] = await conn.execute<any[]>(`
      SELECT
        ii.materialId,
        rm.name       AS materialName,
        rm.unit,
        rm.materialType,
        CAST(COALESCE(rm.lastPurchasePrice, 0) AS DECIMAL(14,4)) AS lastPurchasePrice,
        SUM(CAST(ii.quantity   AS DECIMAL(14,4))) AS purchasedQty,
        SUM(CAST(ii.totalPrice AS DECIMAL(14,4))) AS purchasedCost
      FROM invoice_items ii
      JOIN invoices i ON ii.invoiceId = i.id
      JOIN raw_materials rm ON ii.materialId = rm.id
      WHERE DATE(i.invoiceDate) >= ? AND DATE(i.invoiceDate) <= ?
      GROUP BY ii.materialId, rm.name, rm.unit, rm.materialType, rm.lastPurchasePrice
    `, [fromDate, toDate]);

    const purchMap = new Map<number, {
      materialName: string; unit: string;
      lastPurchasePrice: number; materialType: string;
      purchasedQty: number; purchasedCost: number;
    }>();
    for (const r of purchRows) {
      purchMap.set(Number(r.materialId), {
        materialName: r.materialName,
        unit: r.unit,
        lastPurchasePrice: Number(r.lastPurchasePrice ?? 0),
        materialType: r.materialType ?? "raw",
        purchasedQty: Number(r.purchasedQty ?? 0),
        purchasedCost: Number(r.purchasedCost ?? 0),
      });
    }

    // ── 2. Sales: net qty per product ────────────────────────────────────────
    const [saleRows] = await conn.execute<any[]>(`
      SELECT
        si.productId,
        SUM(si.qty - COALESCE(si.returnQty, 0) - COALESCE(si.cancelQty, 0)) AS netQty
      FROM sale_items si
      JOIN sales_reports sr ON si.reportId = sr.id
      WHERE DATE(sr.reportDateFrom) >= ? AND DATE(sr.reportDateFrom) <= ?
        AND si.productId IS NOT NULL
      GROUP BY si.productId
    `, [fromDate, toDate]);

    const soldQtyMap = new Map<number, number>();
    for (const r of saleRows) {
      if (r.productId) soldQtyMap.set(Number(r.productId), Math.max(0, Number(r.netQty ?? 0)));
    }

    // ── 3. Level-1 recipes: product → ingredients ───────────────────────────
    const soldProductIds = Array.from(soldQtyMap.keys());
    // expectedMap: materialId → expected qty (raw materials only after expansion)
    const expectedMap = new Map<number, number>();
    // semiFinishedNeeded: semi_finished materialId → needed qty (before expansion)
    const semiFinishedNeeded = new Map<number, number>();

    if (soldProductIds.length > 0) {
      const prodInClause = soldProductIds.map(() => "?").join(",");
      const [recipeRows] = await conn.execute<any[]>(`
        SELECT
          ri.productId,
          ri.materialId,
          CAST(ri.quantity AS DECIMAL(14,6)) AS qty,
          ri.unit AS recipeUnit,
          rm.unit AS materialUnit,
          rm.materialType
        FROM recipe_items ri
        JOIN raw_materials rm ON ri.materialId = rm.id
        WHERE ri.productId IN (${prodInClause})
      `, soldProductIds);

      for (const r of recipeRows) {
        const soldQty = soldQtyMap.get(Number(r.productId)) ?? 0;
        const recipeQty = Number(r.qty ?? 0);
        const matId = Number(r.materialId);
        const conv = unitConvFactor(r.recipeUnit, r.materialUnit);
        const contribution = soldQty * recipeQty * conv;

        if (r.materialType === "semi_finished") {
          // Accumulate semi-finished needed for Level-2 expansion
          semiFinishedNeeded.set(matId, (semiFinishedNeeded.get(matId) ?? 0) + contribution);
        } else {
          // Raw material: add directly
          expectedMap.set(matId, (expectedMap.get(matId) ?? 0) + contribution);
        }
      }
    }

    // ── 4. Level-2 expansion: semi_finished → raw ingredients ───────────────
    // semi_finished_recipes: materialId = the semi_finished, ingredientId = raw ingredient
    if (semiFinishedNeeded.size > 0) {
      const sfIds = Array.from(semiFinishedNeeded.keys());
      const sfInClause = sfIds.map(() => "?").join(",");
      const [sfRecipeRows] = await conn.execute<any[]>(`
        SELECT
          sfr.materialId   AS sfId,
          sfr.ingredientId AS rawId,
          CAST(sfr.quantity AS DECIMAL(14,6)) AS qty,
          sfr.unit         AS recipeUnit,
          rm.unit          AS materialUnit,
          rm.materialType  AS rawType
        FROM semi_finished_recipes sfr
        JOIN raw_materials rm ON sfr.ingredientId = rm.id
        WHERE sfr.materialId IN (${sfInClause})
      `, sfIds);

      for (const r of sfRecipeRows) {
        const sfNeeded = semiFinishedNeeded.get(Number(r.sfId)) ?? 0;
        const ingredientQty = Number(r.qty ?? 0);
        const rawId = Number(r.rawId);
        const conv = unitConvFactor(r.recipeUnit, r.materialUnit);
        const contribution = sfNeeded * ingredientQty * conv;

        if (r.rawType === "semi_finished") {
          // 3rd level: accumulate again (rare but possible)
          semiFinishedNeeded.set(rawId, (semiFinishedNeeded.get(rawId) ?? 0) + contribution);
        } else {
          expectedMap.set(rawId, (expectedMap.get(rawId) ?? 0) + contribution);
        }
      }

      // 3rd level (if any new semi_finished were added above)
      const newSfIds = Array.from(semiFinishedNeeded.keys()).filter(id => !sfIds.includes(id));
      if (newSfIds.length > 0) {
        const newSfClause = newSfIds.map(() => "?").join(",");
        const [sfRecipeRows3] = await conn.execute<any[]>(`
          SELECT
            sfr.materialId   AS sfId,
            sfr.ingredientId AS rawId,
            CAST(sfr.quantity AS DECIMAL(14,6)) AS qty,
            sfr.unit         AS recipeUnit,
            rm.unit          AS materialUnit
          FROM semi_finished_recipes sfr
          JOIN raw_materials rm ON sfr.ingredientId = rm.id
          WHERE sfr.materialId IN (${newSfClause})
        `, newSfIds);

        for (const r of sfRecipeRows3) {
          const sfNeeded = semiFinishedNeeded.get(Number(r.sfId)) ?? 0;
          const ingredientQty = Number(r.qty ?? 0);
          const rawId = Number(r.rawId);
          const conv = unitConvFactor(r.recipeUnit, r.materialUnit);
          expectedMap.set(rawId, (expectedMap.get(rawId) ?? 0) + sfNeeded * ingredientQty * conv);
        }
      }
    }

    // ── 5. Get material info for materials in expectedMap but not purchMap ───
    const expectedOnlyIds = Array.from(expectedMap.keys()).filter(id => !purchMap.has(id));
    const extraInfoMap = new Map<number, { name: string; unit: string; price: number; type: string }>();

    if (expectedOnlyIds.length > 0) {
      const inClause = expectedOnlyIds.map(() => "?").join(",");
      const [extraRows] = await conn.execute<any[]>(`
        SELECT id, name, unit, materialType, COALESCE(lastPurchasePrice, 0) AS lastPurchasePrice
        FROM raw_materials
        WHERE id IN (${inClause})
      `, expectedOnlyIds);
      for (const r of extraRows) {
        extraInfoMap.set(Number(r.id), {
          name: r.name, unit: r.unit,
          price: Number(r.lastPurchasePrice ?? 0),
          type: r.materialType ?? "raw",
        });
      }
    }

    // ── 6. Merge into final rows ─────────────────────────────────────────────
    const allMaterialIds = new Set<number>([
      ...Array.from(purchMap.keys()),
      ...Array.from(expectedMap.keys()),
    ]);

    const rows: PurchaseVsSalesRow[] = [];

    for (const matId of Array.from(allMaterialIds)) {
      const purch = purchMap.get(matId);
      const expectedQty = expectedMap.get(matId) ?? 0;

      let materialName: string;
      let unit: string;
      let lastPurchasePrice: number;
      let materialType: string;
      let purchasedQty: number;
      let purchasedCost: number;

      if (purch) {
        materialName = purch.materialName;
        unit = purch.unit;
        lastPurchasePrice = purch.lastPurchasePrice;
        materialType = purch.materialType;
        purchasedQty = purch.purchasedQty;
        purchasedCost = purch.purchasedCost;
      } else {
        const extra = extraInfoMap.get(matId);
        if (!extra) continue;
        materialName = extra.name;
        unit = extra.unit;
        lastPurchasePrice = extra.price;
        materialType = extra.type;
        purchasedQty = 0;
        purchasedCost = 0;
      }

      // Skip semi_finished in final output (they are intermediate, not raw purchases)
      if (materialType === "semi_finished" && purchasedQty === 0) continue;

      const expectedCost = expectedQty * lastPurchasePrice;
      const diffQty = purchasedQty - expectedQty;
      const diffCost = purchasedCost - expectedCost;
      const diffPct = expectedQty > 0 ? (diffQty / expectedQty) * 100 : null;

      // Apply search filter
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        if (!materialName.toLowerCase().includes(q)) continue;
      }

      rows.push({
        materialId: matId,
        materialName,
        unit,
        lastPurchasePrice,
        materialType,
        purchasedQty,
        purchasedCost,
        expectedQty,
        expectedCost,
        diffQty,
        diffCost,
        diffPct,
      });
    }

    // Sort by absolute diffCost descending
    rows.sort((a, b) => Math.abs(b.diffCost) - Math.abs(a.diffCost));

    // ── 7. Summary ───────────────────────────────────────────────────────────
    const totalPurchasedCost = rows.reduce((s, r) => s + r.purchasedCost, 0);
    const totalExpectedCost = rows.reduce((s, r) => s + r.expectedCost, 0);
    const totalDiffCost = totalPurchasedCost - totalExpectedCost;

    return { totalPurchasedCost, totalExpectedCost, totalDiffCost, rows };
  } finally {
    conn.release();
  }
}
