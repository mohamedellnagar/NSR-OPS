import { getConn } from "./pool";
/**
 * variance-analysis-db.ts
 * Kitchen Consumption Control & Variance Analysis
 *
 * Core logic:
 *  Expected Consumption = Σ (soldQty × recipeQty per ingredient)
 *  Actual Consumption   = openingQty + purchasesIn + productionIn - closingQty ± adjustments
 *  Variance Qty         = Actual - Expected
 *  Variance %           = (Variance / Expected) × 100
 *
 * Status thresholds (configurable via app_settings):
 *  0–3%   → normal
 *  3–8%   → warning
 *  >8%    → critical
 */

export interface VarianceRow {
  materialId: number;
  materialCode: string;
  materialName: string;
  materialType: "raw" | "semi_finished";
  unit: string;
  categoryName: string | null;

  // Stock movements
  openingQty: number;
  purchasesQty: number;    // IN from invoices / inventory transactions
  productionQty: number;   // produced (semi-finished)
  transferIn: number;
  transferOut: number;
  adjustment: number;
  closingQty: number;

  // Consumption
  actualConsumption: number;
  expectedConsumption: number;
  varianceQty: number;
  variancePct: number | null;

  // Cost
  avgCost: number;
  actualConsumptionCost: number;
  expectedConsumptionCost: number;
  varianceCost: number;

  // Status & flags
  status: "normal" | "warning" | "critical" | "unknown";
  flags: string[];
}

export interface VarianceSummary {
  fromDate: string;
  toDate: string;
  totalActualCost: number;
  totalExpectedCost: number;
  totalVarianceCost: number;
  totalVariancePct: number | null;
  itemCount: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  top10Variance: VarianceRow[];
  rows: VarianceRow[];
  // Thresholds used
  warnThreshold: number;
  criticalThreshold: number;
}

export async function getVarianceAnalysis(
  fromDate: string,
  toDate: string,
  categoryId?: number | null,
  materialType?: "raw" | "semi_finished" | null,
  warnThreshold = 3,
  criticalThreshold = 8
): Promise<VarianceSummary> {
  const conn = await getConn();
  try {
    // ── 1. Get all active raw materials ──────────────────────────────────────
    let matFilter = "";
    const matParams: any[] = [];
    if (categoryId && categoryId > 0) {
      matFilter += " AND rm.categoryId = ?";
      matParams.push(categoryId);
    }
    if (materialType) {
      matFilter += " AND rm.materialType = ?";
      matParams.push(materialType);
    }

    const [matRows] = await conn.execute<any[]>(`
      SELECT
        rm.id,
        rm.code,
        rm.name,
        rm.materialType,
        rm.unit,
        rm.averageCost,
        rm.lastPurchasePrice,
        mc.name AS categoryName
      FROM raw_materials rm
      LEFT JOIN material_categories mc ON rm.categoryId = mc.id
      WHERE rm.isActive = 1
      ${matFilter}
      ORDER BY rm.name
    `, matParams);

    if (matRows.length === 0) {
      return emptyResult(fromDate, toDate, warnThreshold, criticalThreshold);
    }

    const matIds = matRows.map((r: any) => r.id);
    const inClause = matIds.map(() => "?").join(",");

    // ── 2. Purchases IN (from invoice_items) ─────────────────────────────────
    const [purchaseRows] = await conn.execute<any[]>(`
      SELECT
        ii.materialId,
        SUM(CAST(ii.quantity AS DECIMAL(14,4))) AS qty
      FROM invoice_items ii
      JOIN invoices i ON ii.invoiceId = i.id
      WHERE DATE(i.invoiceDate) >= ? AND DATE(i.invoiceDate) <= ?
        AND ii.materialId IN (${inClause})
      GROUP BY ii.materialId
    `, [fromDate, toDate, ...matIds]);

    const purchaseMap = new Map<number, number>();
    for (const r of purchaseRows) {
      purchaseMap.set(Number(r.materialId), Number(r.qty ?? 0));
    }

    // ── 3. Inventory transactions (IN/OUT/ADJUSTMENT) ─────────────────────────
    const [txRows] = await conn.execute<any[]>(`
      SELECT
        materialId,
        transactionType,
        reason,
        SUM(CAST(quantity AS DECIMAL(14,4))) AS qty
      FROM inventory_transactions
      WHERE DATE(transactionDate) >= ? AND DATE(transactionDate) <= ?
        AND materialId IN (${inClause})
      GROUP BY materialId, transactionType, reason
    `, [fromDate, toDate, ...matIds]);

    const txInMap = new Map<number, number>();
    const txOutMap = new Map<number, number>();
    const txAdjMap = new Map<number, number>();
    const txTransferInMap = new Map<number, number>();
    const txTransferOutMap = new Map<number, number>();

    for (const r of txRows) {
      const id = Number(r.materialId);
      const qty = Number(r.qty ?? 0);
      if (r.transactionType === "IN") {
        if (r.reason === "transfer") {
          txTransferInMap.set(id, (txTransferInMap.get(id) ?? 0) + qty);
        } else {
          txInMap.set(id, (txInMap.get(id) ?? 0) + qty);
        }
      } else if (r.transactionType === "OUT") {
        if (r.reason === "transfer") {
          txTransferOutMap.set(id, (txTransferOutMap.get(id) ?? 0) + qty);
        } else {
          txOutMap.set(id, (txOutMap.get(id) ?? 0) + qty);
        }
      } else if (r.transactionType === "ADJUSTMENT") {
        txAdjMap.set(id, (txAdjMap.get(id) ?? 0) + qty);
      }
    }

    // ── 4. Kitchen daily pulls (production pulls) ─────────────────────────────
    const [pullRows] = await conn.execute<any[]>(`
      SELECT
        materialId,
        SUM(CAST(pulledQuantity AS DECIMAL(14,4))) AS pulledQty,
        SUM(CAST(COALESCE(actualYield, 0) AS DECIMAL(14,4))) AS yieldQty
      FROM kitchen_daily_pulls
      WHERE DATE(pullDate) >= ? AND DATE(pullDate) <= ?
        AND materialId IN (${inClause})
      GROUP BY materialId
    `, [fromDate, toDate, ...matIds]);

    const pullMap = new Map<number, { pulled: number; yield: number }>();
    for (const r of pullRows) {
      pullMap.set(Number(r.materialId), {
        pulled: Number(r.pulledQty ?? 0),
        yield: Number(r.yieldQty ?? 0),
      });
    }

    // ── 5. Kitchen inventory counts (opening / closing) ───────────────────────
    // Opening = earliest count in period or day before
    const [openRows] = await conn.execute<any[]>(`
      SELECT kic.materialId, kic.openingQty
      FROM kitchen_inventory_counts kic
      INNER JOIN (
        SELECT materialId, MIN(countDate) AS minDate
        FROM kitchen_inventory_counts
        WHERE countDate >= ? AND countDate <= ?
          AND materialId IN (${inClause})
        GROUP BY materialId
      ) first ON kic.materialId = first.materialId AND kic.countDate = first.minDate
    `, [fromDate, toDate, ...matIds]);

    const openingMap = new Map<number, number>();
    for (const r of openRows) {
      openingMap.set(Number(r.materialId), Number(r.openingQty ?? 0));
    }

    // Closing = latest count in period
    const [closeRows] = await conn.execute<any[]>(`
      SELECT kic.materialId, kic.closingQty
      FROM kitchen_inventory_counts kic
      INNER JOIN (
        SELECT materialId, MAX(countDate) AS maxDate
        FROM kitchen_inventory_counts
        WHERE countDate >= ? AND countDate <= ?
          AND materialId IN (${inClause})
          AND closingQty IS NOT NULL
        GROUP BY materialId
      ) last ON kic.materialId = last.materialId AND kic.countDate = last.maxDate
    `, [fromDate, toDate, ...matIds]);

    const closingMap = new Map<number, number>();
    for (const r of closeRows) {
      if (r.closingQty !== null && r.closingQty !== undefined) {
        closingMap.set(Number(r.materialId), Number(r.closingQty));
      }
    }

    // ── 6. Expected consumption from sales × recipes ─────────────────────────
    // Step 6a: Get sold quantities per product in date range
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
      if (r.productId) {
        soldQtyMap.set(Number(r.productId), Math.max(0, Number(r.netQty ?? 0)));
      }
    }

    // Step 6b: Get recipe items for sold products
    const soldProductIds = Array.from(soldQtyMap.keys());
    const expectedMap = new Map<number, number>(); // materialId → expected qty

    if (soldProductIds.length > 0) {
      const prodInClause = soldProductIds.map(() => "?").join(",");
      const [recipeRows] = await conn.execute<any[]>(`
        SELECT
          ri.productId,
          ri.materialId,
          CAST(ri.quantity AS DECIMAL(14,4)) AS qty,
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

        // Unit conversion: if recipe is in grams and material is in kg → /1000
        let convFactor = 1;
        const recipeUnit = (r.recipeUnit || "").toLowerCase();
        const matUnit = (r.materialUnit || "").toLowerCase();
        if ((recipeUnit === "g" || recipeUnit === "gram" || recipeUnit === "غرام") &&
            (matUnit === "kg" || matUnit === "كيلو" || matUnit === "كجم")) {
          convFactor = 1 / 1000;
        } else if ((recipeUnit === "ml" || recipeUnit === "مل") &&
                   (matUnit === "l" || matUnit === "liter" || matUnit === "لتر")) {
          convFactor = 1 / 1000;
        }

        const contribution = soldQty * recipeQty * convFactor;
        expectedMap.set(matId, (expectedMap.get(matId) ?? 0) + contribution);
      }

      // Step 6c: Expand semi-finished materials in recipes to their raw ingredients
      const semiMatIds = Array.from(expectedMap.keys()).filter(id => {
        const mat = matRows.find((r: any) => r.id === id);
        return mat?.materialType === "semi_finished";
      });

      if (semiMatIds.length > 0) {
        const semiInClause = semiMatIds.map(() => "?").join(",");
        const [semiRecipeRows] = await conn.execute<any[]>(`
          SELECT
            sfr.materialId AS semiId,
            sfr.ingredientId,
            CAST(sfr.quantity AS DECIMAL(14,4)) AS qty,
            sfr.unit AS recipeUnit,
            rm.unit AS materialUnit
          FROM semi_finished_recipes sfr
          JOIN raw_materials rm ON sfr.ingredientId = rm.id
          WHERE sfr.materialId IN (${semiInClause})
        `, semiMatIds);

        for (const r of semiRecipeRows) {
          const semiExpected = expectedMap.get(Number(r.semiId)) ?? 0;
          const ingredientQty = Number(r.qty ?? 0);
          const ingId = Number(r.ingredientId);

          let convFactor = 1;
          const recipeUnit = (r.recipeUnit || "").toLowerCase();
          const matUnit = (r.materialUnit || "").toLowerCase();
          if ((recipeUnit === "g" || recipeUnit === "gram") &&
              (matUnit === "kg" || matUnit === "كيلو")) {
            convFactor = 1 / 1000;
          } else if ((recipeUnit === "ml") && (matUnit === "l" || matUnit === "liter")) {
            convFactor = 1 / 1000;
          }

          const contribution = semiExpected * ingredientQty * convFactor;
          expectedMap.set(ingId, (expectedMap.get(ingId) ?? 0) + contribution);
        }

        // Remove semi-finished from expected (they're now expanded)
        for (const id of semiMatIds) {
          expectedMap.delete(id);
        }
      }
    }

    // ── 7. Waste logs ─────────────────────────────────────────────────────────
    const [wasteRows] = await conn.execute<any[]>(`
      SELECT
        materialId,
        SUM(CAST(wasteQty AS DECIMAL(14,4))) AS qty
      FROM waste_logs
      WHERE DATE(wasteDate) >= ? AND DATE(wasteDate) <= ?
        AND materialId IN (${inClause})
      GROUP BY materialId
    `, [fromDate, toDate, ...matIds]);

    const wasteMap = new Map<number, number>();
    for (const r of wasteRows) {
      wasteMap.set(Number(r.materialId), Number(r.qty ?? 0));
    }

    // ── 8. Check which products have no recipe ────────────────────────────────
    const noRecipeProductIds = new Set<number>();
    if (soldProductIds.length > 0) {
      const prodInClause = soldProductIds.map(() => "?").join(",");
      const [recipeCheckRows] = await conn.execute<any[]>(`
        SELECT DISTINCT productId FROM recipe_items
        WHERE productId IN (${prodInClause})
      `, soldProductIds);
      const withRecipe = new Set(recipeCheckRows.map((r: any) => Number(r.productId)));
      for (const id of soldProductIds) {
        if (!withRecipe.has(id)) noRecipeProductIds.add(id);
      }
    }

    // ── 9. Build variance rows ────────────────────────────────────────────────
    const rows: VarianceRow[] = [];

    for (const mat of matRows) {
      const id = Number(mat.id);
      const avgCost = Number(mat.averageCost ?? mat.lastPurchasePrice ?? 0);

      const openingQty = openingMap.get(id) ?? 0;
      const purchasesQty = (purchaseMap.get(id) ?? 0) + (txInMap.get(id) ?? 0);
      const transferIn = txTransferInMap.get(id) ?? 0;
      const transferOut = txTransferOutMap.get(id) ?? 0;
      const adjustment = txAdjMap.get(id) ?? 0;
      const productionQty = pullMap.get(id)?.yield ?? 0;
      const closingQty = closingMap.has(id) ? closingMap.get(id)! : -1; // -1 = no count

      // Actual consumption
      let actualConsumption: number;
      const hasInventoryCount = closingMap.has(id);

      if (hasInventoryCount) {
        // Use physical count formula
        actualConsumption = openingQty + purchasesQty + transferIn + productionQty
          - (closingMap.get(id) ?? 0) - transferOut + adjustment;
      } else {
        // Fallback: use kitchen pulls as proxy for actual consumption
        actualConsumption = pullMap.get(id)?.pulled ?? 0;
        // Also add OUT transactions (production usage)
        actualConsumption += txOutMap.get(id) ?? 0;
      }

      actualConsumption = Math.max(0, actualConsumption);

      const expectedConsumption = expectedMap.get(id) ?? 0;
      const varianceQty = actualConsumption - expectedConsumption;
      const variancePct = expectedConsumption > 0
        ? (varianceQty / expectedConsumption) * 100
        : null;

      const actualConsumptionCost = actualConsumption * avgCost;
      const expectedConsumptionCost = expectedConsumption * avgCost;
      const varianceCost = varianceQty * avgCost;

      // Determine status
      let status: VarianceRow["status"] = "unknown";
      if (variancePct !== null) {
        const absPct = Math.abs(variancePct);
        if (absPct <= warnThreshold) status = "normal";
        else if (absPct <= criticalThreshold) status = "warning";
        else status = "critical";
      } else if (actualConsumption > 0 && expectedConsumption === 0) {
        status = "critical"; // unexplained consumption
      }

      // Build flags
      const flags: string[] = [];
      if (expectedConsumption === 0 && actualConsumption > 0) {
        flags.push("unexplained_consumption");
      }
      if (variancePct !== null && variancePct > criticalThreshold) {
        flags.push("possible_waste");
        if (variancePct > criticalThreshold * 2) flags.push("possible_theft");
      }
      if (variancePct !== null && variancePct < -criticalThreshold) {
        flags.push("recipe_review_needed");
      }
      if (!hasInventoryCount && actualConsumption > 0) {
        flags.push("no_physical_count");
      }
      if (actualConsumption < 0) {
        flags.push("negative_consumption");
      }
      if (closingQty < 0 && hasInventoryCount) {
        flags.push("negative_stock");
      }

      rows.push({
        materialId: id,
        materialCode: String(mat.code ?? ""),
        materialName: String(mat.name ?? ""),
        materialType: mat.materialType === "semi_finished" ? "semi_finished" : "raw",
        unit: String(mat.unit ?? ""),
        categoryName: mat.categoryName ? String(mat.categoryName) : null,
        openingQty,
        purchasesQty,
        productionQty,
        transferIn,
        transferOut,
        adjustment,
        closingQty: hasInventoryCount ? (closingMap.get(id) ?? 0) : 0,
        actualConsumption,
        expectedConsumption,
        varianceQty,
        variancePct,
        avgCost,
        actualConsumptionCost,
        expectedConsumptionCost,
        varianceCost,
        status,
        flags,
      });
    }

    // ── 10. Build summary ─────────────────────────────────────────────────────
    const totalActualCost = rows.reduce((s, r) => s + r.actualConsumptionCost, 0);
    const totalExpectedCost = rows.reduce((s, r) => s + r.expectedConsumptionCost, 0);
    const totalVarianceCost = rows.reduce((s, r) => s + r.varianceCost, 0);
    const totalVariancePct = totalExpectedCost > 0
      ? (totalVarianceCost / totalExpectedCost) * 100
      : null;

    const top10Variance = [...rows]
      .filter(r => r.varianceCost !== 0)
      .sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost))
      .slice(0, 10);

    return {
      fromDate,
      toDate,
      totalActualCost,
      totalExpectedCost,
      totalVarianceCost,
      totalVariancePct,
      itemCount: rows.length,
      normalCount: rows.filter(r => r.status === "normal").length,
      warningCount: rows.filter(r => r.status === "warning").length,
      criticalCount: rows.filter(r => r.status === "critical").length,
      top10Variance,
      rows,
      warnThreshold,
      criticalThreshold,
    };
  } finally {
    await conn.end();
  }
}

function emptyResult(
  fromDate: string,
  toDate: string,
  warnThreshold: number,
  criticalThreshold: number
): VarianceSummary {
  return {
    fromDate,
    toDate,
    totalActualCost: 0,
    totalExpectedCost: 0,
    totalVarianceCost: 0,
    totalVariancePct: null,
    itemCount: 0,
    normalCount: 0,
    warningCount: 0,
    criticalCount: 0,
    top10Variance: [],
    rows: [],
    warnThreshold,
    criticalThreshold,
  };
}
