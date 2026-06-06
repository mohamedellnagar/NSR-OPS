/**
 * Sales Reports DB helpers
 * Handles CSV parsing, saving, and consumption analysis
 */
import { getDb, calcSemiFinishedCost, getBusinessDayTzOffset } from "./db";
import { salesReports, saleItems, products, recipeItems, rawMaterials, kitchenDailyPulls, kitchenDailyProduction, semiFinishedRecipes, inventoryTransactions, kitchenProductionMaterials } from "../drizzle/schema";
import { eq, desc, and, sql, inArray, sum } from "drizzle-orm";

// Helper to get db or throw
async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedSaleRow {
  branchName: string;
  branchRef: string;
  productName: string;
  sku: string;
  totalSales: number;
  netSalesWithTax: number;
  tax: number;
  discount: number;
  netSales: number;
  qty: number;
  cost: number;
  returnAmount: number;
  returnQty: number;
  cancelAmount: number;
  cancelQty: number;
  profit: number;
}

// ─── Parse CSV text ───────────────────────────────────────────────────────────

export function parseSalesCsv(csvText: string): ParsedSaleRow[] {
  const lines = csvText.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
  const delimiter = lines[0].includes("\t") ? "\t" : ",";

  const rows: ParsedSaleRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 13) continue;

    const productName = cols[2] || "";
    if (!productName) continue;

    const parseNum = (v: string) => {
      const cleaned = (v || "").replace(/[^\d.-]/g, "");
      return parseFloat(cleaned) || 0;
    };

    rows.push({
      branchName: cols[0] || "",
      branchRef: cols[1] || "",
      productName,
      sku: cols[3] || "",
      totalSales: parseNum(cols[4]),
      netSalesWithTax: parseNum(cols[6]),
      tax: parseNum(cols[7]),
      discount: parseNum(cols[8]),
      netSales: parseNum(cols[10]),
      qty: Math.round(parseNum(cols[12])),
      cost: parseNum(cols[13]),
      returnAmount: parseNum(cols[14]),
      returnQty: Math.round(parseNum(cols[15])),
      cancelAmount: parseNum(cols[16]),
      cancelQty: Math.round(parseNum(cols[17])),
      profit: parseNum(cols[18]),
    });
  }
  return rows;
}

// ─── Save Sales Report ────────────────────────────────────────────────────────

export async function saveSalesReport(params: {
  csvText: string;
  reportDateFrom: Date;
  reportDateTo: Date;
  fileName: string;
  notes?: string;
  userId: number;
}) {
  const d = await db();
  const rows = parseSalesCsv(params.csvText);
  if (rows.length === 0) throw new Error("لا توجد بيانات صالحة في الملف");

  // Calculate totals
  const totalSales = rows.reduce((s, r) => s + r.totalSales, 0);
  const totalNetSales = rows.reduce((s, r) => s + r.netSales, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);

  // Get branch info from first row
  const branchName = rows[0]?.branchName || null;
  const branchRef = rows[0]?.branchRef || null;

  // Match SKUs to products table
  const skuSet = new Set(rows.map((r) => r.sku).filter(Boolean));
  const skuList = Array.from(skuSet);
  let skuToProductId = new Map<string, number>();
  if (skuList.length > 0) {
    const menuProducts = await d.select({ id: products.id, sku: products.sku })
      .from(products)
      .where(sql`${products.sku} IN (${sql.join(skuList.map((s) => sql`${s}`), sql`, `)})`);
    skuToProductId = new Map(menuProducts.map((p) => [p.sku, p.id]));
  }

  // Insert report header
  const [result] = await d.insert(salesReports).values({
    reportDateFrom: params.reportDateFrom,
    reportDateTo: params.reportDateTo,
    branchName,
    branchRef,
    totalSales: totalSales.toFixed(3),
    totalNetSales: totalNetSales.toFixed(3),
    totalQty,
    totalCost: totalCost.toFixed(3),
    totalProfit: totalProfit.toFixed(3),
    fileName: params.fileName,
    notes: params.notes || null,
    createdBy: params.userId,
  });

  const reportId = (result as { insertId: number }).insertId;

  // Insert line items in batches of 100
  const itemValues = rows.map((r) => ({
    reportId,
    productName: r.productName,
    sku: r.sku || null,
    branchName: r.branchName || null,
    branchRef: r.branchRef || null,
    totalSales: r.totalSales.toFixed(3),
    netSalesWithTax: r.netSalesWithTax.toFixed(3),
    tax: r.tax.toFixed(3),
    discount: r.discount.toFixed(3),
    netSales: r.netSales.toFixed(3),
    qty: r.qty,
    cost: r.cost.toFixed(3),
    returnAmount: r.returnAmount.toFixed(3),
    returnQty: r.returnQty,
    cancelAmount: r.cancelAmount.toFixed(3),
    cancelQty: r.cancelQty,
    profit: r.profit.toFixed(3),
    productId: r.sku ? (skuToProductId.get(r.sku) ?? null) : null,
  }));

  if (itemValues.length > 0) {
    for (let i = 0; i < itemValues.length; i += 100) {
      await d.insert(saleItems).values(itemValues.slice(i, i + 100));
    }
  }

  const matchedCount = itemValues.filter((i) => i.productId !== null).length;
  return { reportId, rowCount: rows.length, matchedCount };
}

// ─── List Reports ─────────────────────────────────────────────────────────────

export async function listSalesReports() {
  const d = await db();
  return d.select().from(salesReports).orderBy(desc(salesReports.reportDateFrom));
}

// ─── Get Report with Items ────────────────────────────────────────────────────

export async function getSalesReportById(id: number) {
  const d = await db();
  const [report] = await d.select().from(salesReports).where(eq(salesReports.id, id));
  if (!report) return null;

  const items = await d.select().from(saleItems)
    .where(eq(saleItems.reportId, id))
    .orderBy(desc(saleItems.totalSales));

  return { ...report, items };
}

// ─── Delete Report ────────────────────────────────────────────────────────────

export async function deleteSalesReport(id: number) {
  const d = await db();
  await d.delete(saleItems).where(eq(saleItems.reportId, id));
  await d.delete(salesReports).where(eq(salesReports.id, id));
}

// ─── Consumption Analysis ─────────────────────────────────────────────────────
// For each sold item that has a recipe, calculate theoretical raw material consumption.
// Semi-finished materials in recipes are expanded to their raw material components.

/**
 * Helper: accumulate a raw material into the consumption map.
 * If the material is semi_finished, recursively expand its semiFinishedRecipes.
 */
async function accumulateRawMaterial(
  d: Awaited<ReturnType<typeof db>>,
  materialId: number,
  materialName: string,
  materialType: string,
  unit: string,
  averageCost: string | null,
  lastPurchasePrice: string | null,
  qty: number,
  consumptionMap: Map<number, { materialId: number; materialName: string; unit: string; totalQty: number; unitCost: number; totalCost: number }>,
  depth = 0
) {
  if (depth > 5) return; // guard against circular recipes

  if (materialType === "semi_finished") {
    // Expand: get the semi-finished recipe components
    const sfComponents = await d.select({
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

    for (const comp of sfComponents) {
      const compQtyPerUnit = parseFloat(String(comp.quantity));
      const compTotalQty = compQtyPerUnit * qty;
      await accumulateRawMaterial(
        d,
        comp.ingredientId,
        comp.ingName,
        comp.ingType,
        comp.unit,
        comp.ingAvgCost,
        comp.ingLastPrice,
        compTotalQty,
        consumptionMap,
        depth + 1
      );
    }
  } else {
    // Pure raw material — add directly
    const unitCost = parseFloat(String(averageCost || lastPurchasePrice || "0"));
    const existing = consumptionMap.get(materialId);
    if (existing) {
      existing.totalQty += qty;
      existing.totalCost += qty * unitCost;
    } else {
      consumptionMap.set(materialId, {
        materialId,
        materialName,
        unit,
        totalQty: qty,
        unitCost,
        totalCost: qty * unitCost,
      });
    }
  }
}

export async function getSalesConsumptionAnalysis(reportId: number) {
  const d = await db();

  // Get all sale items for this report
  const allItems = await d.select({
    saleItemId: saleItems.id,
    productName: saleItems.productName,
    sku: saleItems.sku,
    qty: saleItems.qty,
    productId: saleItems.productId,
  }).from(saleItems).where(eq(saleItems.reportId, reportId));

  const linked = allItems.filter((i) => i.productId !== null);
  const unlinked = allItems
    .filter((i) => i.productId === null)
    .map((i) => ({ productName: i.productName, sku: i.sku, qty: i.qty }));

  // Aggregated raw-materials-only consumption map
  const consumptionMap = new Map<number, {
    materialId: number;
    materialName: string;
    unit: string;
    totalQty: number;
    unitCost: number;
    totalCost: number;
  }>();

  for (const item of linked) {
    if (!item.productId) continue;

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

    for (const r of recipe) {
      const qtyPerUnit = parseFloat(String(r.quantity));
      const totalQty = qtyPerUnit * item.qty;
      await accumulateRawMaterial(
        d,
        r.materialId,
        r.materialName,
        r.materialType,
        r.unit,
        r.averageCost,
        r.lastPurchasePrice,
        totalQty,
        consumptionMap
      );
    }
  }

  const consumption = Array.from(consumptionMap.values())
    .sort((a, b) => b.totalQty - a.totalQty)
    .map((c) => ({
      ...c,
      totalQty: parseFloat(c.totalQty.toFixed(4)),
      totalCost: parseFloat(c.totalCost.toFixed(3)),
    }));

  // ── Per-product breakdown (shows recipe as-is, with materialType label) ──
  const productBreakdown: Array<{
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
  }> = [];

  for (const item of linked) {
    if (!item.productId) continue;
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

    if (recipe.length === 0) continue;

    productBreakdown.push({
      productName: item.productName,
      sku: item.sku,
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
  }

  return {
    linkedItems: linked.length,
    unlinkedItems: unlinked.length,
    consumption,
    unlinked,
    productBreakdown,
  };
}

// ─── Sales By Date ─────────────────────────────────────────────────────────────
// Get all sale items across all reports that fall within a specific date
export async function getSalesByDate(date: string) {
  const d = await db();

  // Find all reports whose date range includes the given date
  const matchingReports = await d.select({
    id: salesReports.id,
    reportDateFrom: salesReports.reportDateFrom,
    reportDateTo: salesReports.reportDateTo,
    branchName: salesReports.branchName,
    fileName: salesReports.fileName,
    totalSales: salesReports.totalSales,
    totalQty: salesReports.totalQty,
  }).from(salesReports)
    .where(
      sql`DATE(${salesReports.reportDateFrom}) <= ${date} AND DATE(${salesReports.reportDateTo}) >= ${date}`
    );

  if (matchingReports.length === 0) {
    return { reports: [], items: [], totalSales: 0, totalQty: 0 };
  }

  const reportIds = matchingReports.map((r) => r.id);

  // Get all sale items for these reports
  const items = await d.select({
    id: saleItems.id,
    reportId: saleItems.reportId,
    productName: saleItems.productName,
    sku: saleItems.sku,
    branchName: saleItems.branchName,
    qty: saleItems.qty,
    totalSales: saleItems.totalSales,
    netSales: saleItems.netSales,
    cost: saleItems.cost,
    discount: saleItems.discount,
    tax: saleItems.tax,
    productId: saleItems.productId,
  }).from(saleItems)
    .where(sql`${saleItems.reportId} IN (${sql.join(reportIds.map((id) => sql`${id}`), sql`, `)})`);

  // Aggregate totals
  const totalSales = items.reduce((s, i) => s + parseFloat(String(i.totalSales || 0)), 0);
  const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);

  // Fetch product prices for all linked productIds
  const linkedProductIds = Array.from(new Set(items.map(i => i.productId).filter(Boolean))) as number[];
  const productPriceMap = new Map<number, number>();
  if (linkedProductIds.length > 0) {
    const priceRows = await d.select({ id: products.id, price: products.price })
      .from(products)
      .where(inArray(products.id, linkedProductIds));
    for (const p of priceRows) {
      if (p.price !== null) productPriceMap.set(p.id, parseFloat(String(p.price)));
    }
  }

  // Group by product name + sku for summary
  const summaryMap = new Map<string, {
    productName: string;
    sku: string | null;
    productId: number | null;
    unitPrice: number | null;
    qty: number;
    totalSales: number;
    netSales: number;
    cost: number;
    branches: string[];
  }>();

  for (const item of items) {
    const key = item.sku || item.productName;
    const existing = summaryMap.get(key);
    const branch = item.branchName || "";
    const unitPrice = item.productId ? (productPriceMap.get(item.productId) ?? null) : null;
    if (existing) {
      existing.qty += item.qty || 0;
      existing.totalSales += parseFloat(String(item.totalSales || 0));
      existing.netSales += parseFloat(String(item.netSales || 0));
      existing.cost += parseFloat(String(item.cost || 0));
      if (branch && !existing.branches.includes(branch)) existing.branches.push(branch);
      // keep productId and unitPrice if not already set
      if (!existing.productId && item.productId) existing.productId = item.productId;
      if (existing.unitPrice === null && unitPrice !== null) existing.unitPrice = unitPrice;
    } else {
      summaryMap.set(key, {
        productName: item.productName,
        sku: item.sku || null,
        productId: item.productId || null,
        unitPrice,
        qty: item.qty || 0,
        totalSales: parseFloat(String(item.totalSales || 0)),
        netSales: parseFloat(String(item.netSales || 0)),
        cost: parseFloat(String(item.cost || 0)),
        branches: branch ? [branch] : [],
      });
    }
  }

  const totalNetSales = items.reduce((s, i) => s + parseFloat(String(i.netSales || 0)), 0);

  const summary = Array.from(summaryMap.values())
    .sort((a, b) => b.qty - a.qty);

  return {
    reports: matchingReports,
    items: summary,
    totalSales: parseFloat(totalSales.toFixed(3)),
    totalNetSales: parseFloat(totalNetSales.toFixed(3)),
    totalQty,
  };
}

// ─── Product Ingredients (Recipe Components) ──────────────────────────────────
// Get recipe components for a product (by productId) multiplied by sold qty
export async function getProductIngredients(productId: number, soldQty: number) {
  const d = await db();

  const items = await d
    .select({
      materialId: recipeItems.materialId,
      recipeQty: recipeItems.quantity,
      unit: recipeItems.unit,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      materialUnit: rawMaterials.unit,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      materialType: rawMaterials.materialType,
    })
    .from(recipeItems)
    .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
    .where(eq(recipeItems.productId, productId));

  // For semi_finished materials with no lastPurchasePrice:
  // 1. Try kitchen_daily_production actualUnitCost
  // 2. Fallback: calculate from semi_finished_recipes (sum of ingredient qty * lastPurchasePrice)
  const semiFinishedNoPrice = items.filter(
    (i) => i.materialType === "semi_finished" && !i.lastPurchasePrice
  );

  const semiPriceMap = new Map<number, number>();
  if (semiFinishedNoPrice.length > 0) {
    for (const item of semiFinishedNoPrice) {
      // Step 1: Try kitchen_daily_production
      const shortName = (item.materialNameAr || item.materialName).replace(/^انتاج\s*-\s*/, "").trim();
      const [kdpRow] = await d
        .select({ actualUnitCost: kitchenDailyProduction.actualUnitCost })
        .from(kitchenDailyProduction)
        .where(
          and(
            sql`${kitchenDailyProduction.productName} LIKE ${`%${shortName}%`}`,
            sql`${kitchenDailyProduction.actualUnitCost} IS NOT NULL`
          )
        )
        .orderBy(desc(kitchenDailyProduction.productionDate))
        .limit(1);

      if (kdpRow?.actualUnitCost) {
        semiPriceMap.set(item.materialId, parseFloat(String(kdpRow.actualUnitCost)));
        continue;
      }

      // Step 2: Calculate from semi_finished_recipes
      // Join semiFinishedRecipes with rawMaterials to get ingredient prices
      const alias = rawMaterials;
      const sfIngredients = await d
        .select({
          quantity: semiFinishedRecipes.quantity,
          unit: semiFinishedRecipes.unit,
          ingredientPrice: alias.lastPurchasePrice,
          ingredientUnit: alias.unit,
        })
        .from(semiFinishedRecipes)
        .innerJoin(alias, eq(semiFinishedRecipes.ingredientId, alias.id))
        .where(eq(semiFinishedRecipes.materialId, item.materialId));

      // Sum up: convert units (g->kg, mL->L) then multiply by price
      let totalRecipeCost = 0;
      for (const ing of sfIngredients) {
        const qty = parseFloat(String(ing.quantity || 0));
        const price = parseFloat(String(ing.ingredientPrice || 0));
        const unit = (ing.unit || "").toLowerCase();
        const ingUnit = (ing.ingredientUnit || "").toLowerCase();
        // Convert recipe unit to ingredient unit for price calculation
        let convertedQty = qty;
        if ((unit === "g" || unit === "gram") && (ingUnit === "kg" || ingUnit === "kilogram")) {
          convertedQty = qty / 1000;
        } else if ((unit === "ml" || unit === "milliliter") && (ingUnit === "l" || ingUnit === "liter" || ingUnit === "litre")) {
          convertedQty = qty / 1000;
        }
        totalRecipeCost += convertedQty * price;
      }

      if (totalRecipeCost > 0) {
        semiPriceMap.set(item.materialId, parseFloat(totalRecipeCost.toFixed(4)));
      }
    }
  }

  return items.map((item) => {
    const recipeQty = parseFloat(String(item.recipeQty || 0));
    const totalQty = recipeQty * soldQty;
    // Use lastPurchasePrice if available, otherwise use actualUnitCost from production
    const price = item.lastPurchasePrice
      ? parseFloat(String(item.lastPurchasePrice))
      : (semiPriceMap.get(item.materialId) ?? 0);
    return {
      materialId: item.materialId,
      materialName: item.materialNameAr || item.materialName,
      unit: item.unit || item.materialUnit,
      materialType: item.materialType,
      recipeQty,
      totalQty: parseFloat(totalQty.toFixed(4)),
      lastPurchasePrice: price,
      totalCost: parseFloat((totalQty * price).toFixed(3)),
    };
  });
}

// ─── Batch Ingredient Costs ────────────────────────────────────────────────────
// Calculate total ingredient cost for multiple products at once
// Returns a map of productId -> totalIngredientCost (per unit)
export async function getBatchIngredientCosts(
  productQtys: Array<{ productId: number; soldQty: number }>
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (productQtys.length === 0) return result;

  for (const { productId, soldQty } of productQtys) {
    const ingredients = await getProductIngredients(productId, soldQty);
    const totalCost = ingredients.reduce((sum, ing) => sum + ing.totalCost, 0);
    result.set(productId, parseFloat(totalCost.toFixed(3)));
  }

  return result;
}

// ─── Kitchen Production Cost by Date ─────────────────────────────────────────

/**
 * Returns total kitchen cost from kitchen_daily_pulls for a given date.
 * Uses the same business-day timezone logic as KitchenProductionPage.
 * تكلفة الاستهلاك = نفس منطق totalUsedValue في صفحة الإنتاج اليومي:
 * - للمصنّعة: closingCount × (pulledQuantity ÷ actualYield) × unitCost
 * - للخام:    closingCount × unitCost
 * - العناصر المفتوحة (open) لا تُحتسب
 */
export async function getKitchenProductionCostByDate(date: string): Promise<{
  totalProductionCost: number;
  itemCount: number;
  items: { productName: string; producedQty: number; unitCost: number; totalCost: number; unit: string }[];
}> {
  const d = await db();
  const tzOffset = await getBusinessDayTzOffset();

  const rows = await d
    .select({
      id: kitchenDailyPulls.id,
      materialId: kitchenDailyPulls.materialId,
      materialName: kitchenDailyPulls.materialName,
      materialType: kitchenDailyPulls.materialType,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      actualYield: kitchenDailyPulls.actualYield,
      closingCount: kitchenDailyPulls.closingCount,
      status: kitchenDailyPulls.status,
      unitCost: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}`);

  // Enrich semi-finished materials with recipe cost
  const enriched = await Promise.all(
    rows.map(async (row) => {
      if (row.materialType === "semi_finished" && (!row.unitCost || parseFloat(String(row.unitCost)) === 0)) {
        const recipeCost = await calcSemiFinishedCost(row.materialId);
        return { ...row, unitCost: recipeCost > 0 ? String(recipeCost.toFixed(3)) : null };
      }
      return row;
    })
  );

  let totalProductionCost = 0;
  const items = enriched
    .filter((r) => r.status !== 'open' && r.closingCount !== null) // العناصر المفتوحة لا تُحتسب
    .map((r) => {
      const usedQty = parseFloat(String(r.closingCount ?? 0));
      const pulled = parseFloat(String(r.pulledQuantity ?? 0));
      const actualYield = r.actualYield ? parseFloat(String(r.actualYield)) : null;
      const unitCost = parseFloat(String(r.unitCost ?? 0));
      const isSemi = r.materialType === 'semi_finished';
      // نفس منطق تكلفة الاستهلاك في KitchenProductionPage:
      // للمصنّعة: usedQty × (pulled ÷ actualYield) × unitCost
      // للخام:    usedQty × unitCost
      const consumptionPerUnit = isSemi && actualYield !== null && actualYield > 0
        ? pulled / actualYield
        : null;
      const totalCost = consumptionPerUnit !== null
        ? usedQty * consumptionPerUnit * unitCost
        : usedQty * unitCost;
      totalProductionCost += totalCost;
      return {
        productName: r.materialName ?? "",
        producedQty: usedQty,
        unitCost,
        totalCost,
        unit: r.unit ?? "",
      };
    });

  return {
    totalProductionCost: parseFloat(totalProductionCost.toFixed(3)),
    itemCount: rows.length,
    items,
  };
}

// ─── Raw Materials Value by Date ──────────────────────────────────────────────

/**
 * Returns total value of RAW materials used on a given date from kitchen_daily_pulls.
 * For raw-type pulls: closingCount × lastPurchasePrice
 * For semi_finished pulls: sum of recipe ingredients cost × closingCount
 *   (i.e., the raw ingredient cost breakdown, not the semi-finished unit cost)
 */
export async function getRawMaterialsValueByDate(date: string): Promise<{
  totalValue: number;
  itemCount: number;
}> {
  const d = await db();
  const tzOffset = await getBusinessDayTzOffset();

  const rows = await d
    .select({
      materialId: kitchenDailyPulls.materialId,
      materialType: kitchenDailyPulls.materialType,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      status: kitchenDailyPulls.status,
      unitCost: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}`);

  let totalValue = 0;
  let itemCount = 0;

  for (const row of rows) {
    const usedQty = row.closingCount !== null ? parseFloat(String(row.closingCount)) : parseFloat(String(row.pulledQuantity ?? 0));
    if (usedQty <= 0) continue;

    if (row.materialType === "raw") {
      // Direct raw material: use lastPurchasePrice
      const unitCost = parseFloat(String(row.unitCost ?? 0));
      totalValue += usedQty * unitCost;
      itemCount++;
    } else if (row.materialType === "semi_finished") {
      // Semi-finished: get recipe ingredients and compute raw ingredient cost
      const recipeCost = await calcSemiFinishedCost(row.materialId);
      totalValue += usedQty * recipeCost;
      itemCount++;
    }
  }

  return {
    totalValue: parseFloat(totalValue.toFixed(3)),
    itemCount,
  };
}

// ─── Semi-Finished Materials Value by Date ────────────────────────────────────

/**
 * Returns total value of SEMI-FINISHED materials used on a given date.
 * Value = closingCount × recipe cost per unit
 */
export async function getSemiFinishedValueByDate(date: string): Promise<{
  totalValue: number;
  itemCount: number;
}> {
  const d = await db();
  const tzOffset = await getBusinessDayTzOffset();

  const rows = await d
    .select({
      materialId: kitchenDailyPulls.materialId,
      materialType: kitchenDailyPulls.materialType,
      materialName: kitchenDailyPulls.materialName,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      status: kitchenDailyPulls.status,
      unitCost: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date} AND ${kitchenDailyPulls.materialType} = 'semi_finished'`
    );

  let totalValue = 0;
  let itemCount = 0;

  for (const row of rows) {
    const usedQty = row.closingCount !== null ? parseFloat(String(row.closingCount)) : parseFloat(String(row.pulledQuantity ?? 0));
    if (usedQty <= 0) continue;

    let unitCost = parseFloat(String(row.unitCost ?? 0));
    if (unitCost === 0) {
      unitCost = await calcSemiFinishedCost(row.materialId);
    }
    totalValue += usedQty * unitCost;
    itemCount++;
  }

  return {
    totalValue: parseFloat(totalValue.toFixed(3)),
    itemCount,
  };
}

// ─── Chicken Quantity by Date ─────────────────────────────────────────────────

/**
 * Returns total quantity of chicken-related materials used on a given date.
 * Matches materials with "دجاج" or "chicken" in their name.
 */
export async function getChickenQtyByDate(date: string): Promise<{
  totalQty: number;
  unit: string;
  items: { name: string; qty: number; unit: string }[];
}> {
  const d = await db();
  const tzOffset = await getBusinessDayTzOffset();

  const rows = await d
    .select({
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      status: kitchenDailyPulls.status,
    })
    .from(kitchenDailyPulls)
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}
        AND (${kitchenDailyPulls.materialName} LIKE '%دجاج%'
          OR ${kitchenDailyPulls.materialName} LIKE '%chicken%'
          OR ${kitchenDailyPulls.materialNameAr} LIKE '%دجاج%'
          OR ${kitchenDailyPulls.materialNameAr} LIKE '%chicken%')`
    );

  let totalQty = 0;
  const items: { name: string; qty: number; unit: string }[] = [];

  for (const row of rows) {
    const usedQty = row.closingCount !== null ? parseFloat(String(row.closingCount)) : parseFloat(String(row.pulledQuantity ?? 0));
    totalQty += usedQty;
    items.push({
      name: row.materialName ?? "",
      qty: usedQty,
      unit: row.unit ?? "pcs",
    });
  }

  return {
    totalQty: parseFloat(totalQty.toFixed(3)),
    unit: rows[0]?.unit ?? "pcs",
    items,
  };
}

// ─── Sales vs Kitchen Production Comparison ───────────────────────────────────

/**
 * Compare required recipe components (from sales) vs available kitchen production
 * for a given date range.
 *
 * Steps:
 * 1. Get all sale items from reports whose date range overlaps [from, to]
 * 2. For each linked product, expand recipe components × sold qty
 * 3. Aggregate required qty per raw material component
 * 4. Get total kitchen production (closingCount or pulledQuantity) per material in same period
 * 5. Compare required vs available → remaining / shortage
 */
export async function getSalesVsKitchenProduction(from: string, to: string): Promise<Array<{
  materialId: number;
  componentName: string;
  unit: string;
  requiredQty: number;
  availableQty: number;
  remainingQty: number;
  shortageQty: number;
  status: "ok" | "shortage" | "exact";
}>> {
  const d = await db();

  // 1. Find all reports whose date range overlaps [from, to]
  const matchingReports = await d
    .select({ id: salesReports.id })
    .from(salesReports)
    .where(
      sql`DATE(${salesReports.reportDateFrom}) <= ${to} AND DATE(${salesReports.reportDateTo}) >= ${from}`
    );

  if (matchingReports.length === 0) return [];

  const reportIds = matchingReports.map((r) => r.id);

  // 2. Get all sale items with productId for these reports
  const soldItems = await d
    .select({
      qty: saleItems.qty,
      productId: saleItems.productId,
    })
    .from(saleItems)
    .where(
      sql`${saleItems.reportId} IN (${sql.join(reportIds.map((id) => sql`${id}`), sql`, `)}) AND ${saleItems.productId} IS NOT NULL`
    );

  if (soldItems.length === 0) return [];

  // 3. Aggregate sold qty per productId
  const soldQtyMap = new Map<number, number>();
  for (const item of soldItems) {
    if (!item.productId) continue;
    soldQtyMap.set(item.productId, (soldQtyMap.get(item.productId) ?? 0) + (item.qty || 0));
  }

  // 4. Get all recipe items for all sold products in one batch query
  const productIds = Array.from(soldQtyMap.keys());
  const allRecipeRows = await d
    .select({
      productId: recipeItems.productId,
      materialId: recipeItems.materialId,
      quantity: recipeItems.quantity,
      unit: recipeItems.unit,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      materialUnit: rawMaterials.unit,
    })
    .from(recipeItems)
    .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
    .where(inArray(recipeItems.productId, productIds));

  // 5. Aggregate required qty per materialId
  const requiredMap = new Map<number, {
    materialId: number;
    componentName: string;
    unit: string;
    requiredQty: number;
  }>();

  for (const row of allRecipeRows) {
    const soldQty = soldQtyMap.get(row.productId) ?? 0;
    const recipeQty = parseFloat(String(row.quantity || 0));
    const totalRequired = recipeQty * soldQty;

    const existing = requiredMap.get(row.materialId);
    if (existing) {
      existing.requiredQty += totalRequired;
    } else {
      requiredMap.set(row.materialId, {
        materialId: row.materialId,
        componentName: row.materialNameAr || row.materialName,
        unit: row.unit || row.materialUnit,
        requiredQty: totalRequired,
      });
    }
  }

  if (requiredMap.size === 0) return [];

  // 6. Get kitchen production (closingCount or pulledQuantity) per material in [from, to]
  const tzOffset = await (await import("./db")).getBusinessDayTzOffset();
  const materialIds = Array.from(requiredMap.keys());

  const kitchenRows = await d
    .select({
      materialId: kitchenDailyPulls.materialId,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      actualYield: kitchenDailyPulls.actualYield,
      status: kitchenDailyPulls.status,
    })
    .from(kitchenDailyPulls)
    .where(
      sql`${kitchenDailyPulls.materialId} IN (${sql.join(materialIds.map((id) => sql`${id}`), sql`, `)})
        AND (
          (${kitchenDailyPulls.status} = 'open' AND DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) BETWEEN ${from} AND ${to})
          OR
          (${kitchenDailyPulls.status} IN ('counted','closed') AND DATE(DATE_SUB(CONVERT_TZ(${kitchenDailyPulls.updatedAt}, '+00:00', ${tzOffset}), INTERVAL 6 HOUR)) BETWEEN ${from} AND ${to})
        )`
    );

  // Aggregate available qty per materialId
  // Available = sum of (actualYield if exists, else closingCount if counted/closed, else pulledQuantity)
  const availableMap = new Map<number, number>();
  for (const row of kitchenRows) {
    const materialId = row.materialId;
    let qty = 0;
    if (row.actualYield !== null && parseFloat(String(row.actualYield)) > 0) {
      qty = parseFloat(String(row.actualYield));
    } else if (row.closingCount !== null) {
      qty = parseFloat(String(row.closingCount));
    } else {
      qty = parseFloat(String(row.pulledQuantity ?? 0));
    }
    availableMap.set(materialId, (availableMap.get(materialId) ?? 0) + qty);
  }

  // 7. Build comparison result
  const result = Array.from(requiredMap.values()).map((item) => {
    const required = parseFloat(item.requiredQty.toFixed(4));
    const available = parseFloat((availableMap.get(item.materialId) ?? 0).toFixed(4));
    const diff = parseFloat((available - required).toFixed(4));
    const remaining = diff > 0 ? diff : 0;
    const shortage = diff < 0 ? Math.abs(diff) : 0;
    let status: "ok" | "shortage" | "exact" = "ok";
    if (diff < 0) status = "shortage";
    else if (diff === 0) status = "exact";

    return {
      materialId: item.materialId,
      componentName: item.componentName,
      unit: item.unit,
      requiredQty: required,
      availableQty: available,
      remainingQty: remaining,
      shortageQty: shortage,
      status,
    };
  });

  // Sort: shortages first, then by required qty desc
  return result.sort((a, b) => {
    if (a.status === "shortage" && b.status !== "shortage") return -1;
    if (b.status === "shortage" && a.status !== "shortage") return 1;
    return b.requiredQty - a.requiredQty;
  });
}

// ─── Daily Kitchen KPIs ────────────────────────────────────────────────────────

export async function getDailyKitchenKPIs(date: string): Promise<{
  energyUsage: { charcoal: { qty: number; unit: string }; gas: { qty: number; unit: string }; items: { name: string; qty: number; unit: string; type: string }[] };
  chickenForCharcoal: { qty: number; unit: string; items: { name: string; qty: number; unit: string }[] };
  riceAndSides: { qty: number; unit: string; items: { name: string; qty: number; unit: string }[] };
  allMaterialsUsed: { totalCost: number; raw: { name: string; qty: number; unit: string; cost: number }[]; semi: { name: string; qty: number; unit: string; cost: number }[] };
}> {
  const d = await db();
  const tzOffset = "+03:00";

  // ─── 1. Energy: Charcoal + Gas ────────────────────────────────────────────
  // Charcoal from pulls
  const charcoalPullRows = await d
    .select({
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
    })
    .from(kitchenDailyPulls)
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}
        AND (${kitchenDailyPulls.materialName} LIKE '%فحم%'
          OR ${kitchenDailyPulls.materialName} LIKE '%charcoal%'
          OR ${kitchenDailyPulls.materialNameAr} LIKE '%فحم%')`
    );
  const charcoalItems = charcoalPullRows.map(r => ({
    name: r.materialNameAr || r.materialName || "",
    qty: parseFloat(String(r.pulledQuantity ?? 0)),
    unit: r.unit ?? "kg",
    type: "charcoal" as const,
  }));
  const charcoalTotal = charcoalItems.reduce((s, i) => s + i.qty, 0);

  // Gas from pulls
  const gasPullRows = await d
    .select({
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
    })
    .from(kitchenDailyPulls)
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}
        AND (${kitchenDailyPulls.materialName} LIKE '%غاز%'
          OR ${kitchenDailyPulls.materialName} LIKE '%gas%'
          OR ${kitchenDailyPulls.materialNameAr} LIKE '%غاز%')`
    );
  const gasItems = gasPullRows.map(r => ({
    name: r.materialNameAr || r.materialName || "",
    qty: parseFloat(String(r.pulledQuantity ?? 0)),
    unit: r.unit ?? "kg",
    type: "gas" as const,
  }));
  const gasTotal = gasItems.reduce((s, i) => s + i.qty, 0);

  // ─── 2. Chicken used in charcoal production ───────────────────────────────
  const chickenRows = await d
    .select({
      materialName: kitchenProductionMaterials.materialName,
      unit: kitchenProductionMaterials.unit,
      consumedQuantity: kitchenProductionMaterials.consumedQuantity,
    })
    .from(kitchenProductionMaterials)
    .innerJoin(kitchenDailyProduction, eq(kitchenProductionMaterials.productionId, kitchenDailyProduction.id))
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyProduction.productionDate}, '+00:00', ${tzOffset})) = ${date}
        AND (${kitchenDailyProduction.productName} LIKE '%فحم%'
          OR ${kitchenDailyProduction.productName} LIKE '%charcoal%'
          OR ${kitchenDailyProduction.productNameAr} LIKE '%فحم%')
        AND (${kitchenProductionMaterials.materialName} LIKE '%دجاج%'
          OR ${kitchenProductionMaterials.materialName} LIKE '%chicken%')`
    );
  const chickenItems = chickenRows.map(r => ({
    name: r.materialName || "",
    qty: parseFloat(String(r.consumedQuantity ?? 0)),
    unit: r.unit ?? "kg",
  }));
  const chickenTotal = chickenItems.reduce((s, i) => s + i.qty, 0);

  // ─── 3. Rice and sides ────────────────────────────────────────────────────
  const riceRows = await d
    .select({
      productName: kitchenDailyProduction.productName,
      productNameAr: kitchenDailyProduction.productNameAr,
      unit: kitchenDailyProduction.unit,
      producedQuantity: kitchenDailyProduction.producedQuantity,
    })
    .from(kitchenDailyProduction)
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyProduction.productionDate}, '+00:00', ${tzOffset})) = ${date}
        AND (${kitchenDailyProduction.productName} LIKE '%أرز%'
          OR ${kitchenDailyProduction.productName} LIKE '%rice%'
          OR ${kitchenDailyProduction.productName} LIKE '%حواشي%'
          OR ${kitchenDailyProduction.productName} LIKE '%حاشية%'
          OR ${kitchenDailyProduction.productNameAr} LIKE '%أرز%'
          OR ${kitchenDailyProduction.productNameAr} LIKE '%حواشي%'
          OR ${kitchenDailyProduction.productNameAr} LIKE '%حاشية%')`
    );
  const ricePullRows = await d
    .select({
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      actualYield: kitchenDailyPulls.actualYield,
    })
    .from(kitchenDailyPulls)
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}
        AND (${kitchenDailyPulls.materialName} LIKE '%أرز%'
          OR ${kitchenDailyPulls.materialName} LIKE '%rice%'
          OR ${kitchenDailyPulls.materialName} LIKE '%حواشي%'
          OR ${kitchenDailyPulls.materialName} LIKE '%حاشية%'
          OR ${kitchenDailyPulls.materialNameAr} LIKE '%أرز%'
          OR ${kitchenDailyPulls.materialNameAr} LIKE '%حواشي%')`
    );
  const riceItems: { name: string; qty: number; unit: string }[] = [
    ...riceRows.map(r => ({
      name: r.productNameAr || r.productName || "",
      qty: parseFloat(String(r.producedQuantity ?? 0)),
      unit: r.unit ?? "portion",
    })),
    ...ricePullRows.map(r => ({
      name: r.materialNameAr || r.materialName || "",
      qty: parseFloat(String(r.actualYield ?? r.closingCount ?? r.pulledQuantity ?? 0)),
      unit: r.unit ?? "kg",
    })),
  ];
  const riceTotal = riceItems.reduce((s, i) => s + i.qty, 0);

  // ─── 4. ALL materials used today (raw + semi-finished) ───────────────────
  // Raw materials from production recipes
  const rawMatsFromProduction = await d
    .select({
      materialName: kitchenProductionMaterials.materialName,
      unit: kitchenProductionMaterials.unit,
      consumedQuantity: kitchenProductionMaterials.consumedQuantity,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenProductionMaterials)
    .innerJoin(kitchenDailyProduction, eq(kitchenProductionMaterials.productionId, kitchenDailyProduction.id))
    .leftJoin(rawMaterials, eq(kitchenProductionMaterials.rawMaterialId, rawMaterials.id))
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyProduction.productionDate}, '+00:00', ${tzOffset})) = ${date}`
    );

  // Raw materials directly pulled
  const rawMatsFromPulls = await d
    .select({
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}
        AND ${kitchenDailyPulls.materialType} = 'raw'`
    );

  // Semi-finished materials pulled
  const semiMatsFromPulls = await d
    .select({
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}
        AND ${kitchenDailyPulls.materialType} = 'semi_finished'`
    );

  // Build raw map
  const rawMap = new Map<string, { name: string; qty: number; unit: string; cost: number }>();
  for (const r of rawMatsFromProduction) {
    const name = r.materialName || "";
    const qty = parseFloat(String(r.consumedQuantity ?? 0));
    const price = parseFloat(String(r.lastPurchasePrice ?? 0));
    const existing = rawMap.get(name);
    if (existing) { existing.qty += qty; existing.cost += qty * price; }
    else rawMap.set(name, { name, qty, unit: r.unit ?? "kg", cost: qty * price });
  }
  for (const r of rawMatsFromPulls) {
    const name = r.materialNameAr || r.materialName || "";
    const qty = parseFloat(String(r.closingCount ?? r.pulledQuantity ?? 0));
    const price = parseFloat(String(r.lastPurchasePrice ?? 0));
    const existing = rawMap.get(name);
    if (existing) { existing.qty += qty; existing.cost += qty * price; }
    else rawMap.set(name, { name, qty, unit: r.unit ?? "kg", cost: qty * price });
  }

  // Build semi map
  const semiMap = new Map<string, { name: string; qty: number; unit: string; cost: number }>();
  for (const r of semiMatsFromPulls) {
    const name = r.materialNameAr || r.materialName || "";
    const qty = parseFloat(String(r.closingCount ?? r.pulledQuantity ?? 0));
    const price = parseFloat(String(r.lastPurchasePrice ?? 0));
    const existing = semiMap.get(name);
    if (existing) { existing.qty += qty; existing.cost += qty * price; }
    else semiMap.set(name, { name, qty, unit: r.unit ?? "kg", cost: qty * price });
  }

  const rawItems = Array.from(rawMap.values()).filter(i => i.qty > 0).sort((a, b) => b.cost - a.cost);
  const semiItems = Array.from(semiMap.values()).filter(i => i.qty > 0).sort((a, b) => b.cost - a.cost);
  const totalCost = [...rawItems, ...semiItems].reduce((s, i) => s + i.cost, 0);

  return {
    energyUsage: {
      charcoal: { qty: parseFloat(charcoalTotal.toFixed(3)), unit: charcoalItems[0]?.unit ?? "kg" },
      gas: { qty: parseFloat(gasTotal.toFixed(3)), unit: gasItems[0]?.unit ?? "kg" },
      items: [...charcoalItems, ...gasItems],
    },
    chickenForCharcoal: { qty: parseFloat(chickenTotal.toFixed(3)), unit: chickenItems[0]?.unit ?? "kg", items: chickenItems },
    riceAndSides: { qty: parseFloat(riceTotal.toFixed(3)), unit: riceItems[0]?.unit ?? "portion", items: riceItems },
    allMaterialsUsed: { totalCost: parseFloat(totalCost.toFixed(2)), raw: rawItems, semi: semiItems },
  };
}

// ─── Daily Vegetables & Ingredients Used ──────────────────────────────────────────────
// Logic:
//   Raw materials (materialType='raw'):
//     usedQty = closingCount  (= actual consumed, entered during end-of-day count)
//     If not yet counted (open): estimate = pulledQuantity - carriedForward
//   Semi-finished (materialType='semi_finished'):
//     usedQty = pulledQuantity - carriedForward  (how much of the product was actually used)
//     Then expand via recipe: usedQty × recipeIngredientQty = raw ingredient consumed
//     closingCount for semi-finished = number of portions sold, NOT kg consumed → do NOT use it
export async function getDailyVegetablesUsed(date: string): Promise<{
  items: { name: string; qty: number; unit: string; cost: number }[];
  totalCost: number;
}> {
  const d = await db();
  const tzOffset = "+03:00";

  const map = new Map<string, { name: string; qty: number; unit: string; cost: number }>();

  const addToMap = (name: string, qty: number, unit: string, price: number) => {
    if (!name || qty <= 0) return;
    const existing = map.get(name);
    if (existing) { existing.qty += qty; existing.cost += qty * price; }
    else map.set(name, { name, qty, unit: unit || "kg", cost: qty * price });
  };

  // Unit conversion helper: recipe unit → ingredient inventory unit
  const toBaseUnit = (qty: number, fromUnit: string, toUnit: string): number => {
    const norm = (u: string) => {
      const s = (u || "").toLowerCase().trim();
      if (["gram", "grams", "جرام", "جرم"].includes(s) || s === "g") return "g";
      if (["kilogram", "kilograms", "kilo", "كيلو", "كيلوجرام"].includes(s) || s === "kg") return "kg";
      if (["milligram", "milligrams"].includes(s) || s === "mg") return "mg";
      if (["milliliter", "milliliters", "millilitre", "مل", "مليلتر"].includes(s) || s === "ml") return "ml";
      if (["liter", "liters", "litre", "litres", "لتر"].includes(s) || s === "l") return "l";
      return s;
    };
    const f = norm(fromUnit);
    const t = norm(toUnit);
    if (f === t) return qty;
    if (t === "kg") {
      if (f === "g") return qty / 1000;
      if (f === "mg") return qty / 1_000_000;
    }
    if (t === "l") {
      if (f === "ml") return qty / 1000;
    }
    return qty;
  };

  // ─── Fetch all pulls for the day ────────────────────────────────────────────
  const allPulls = await d
    .select({
      materialId: kitchenDailyPulls.materialId,
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      materialType: kitchenDailyPulls.materialType,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      carriedForward: kitchenDailyPulls.carriedForward,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      rawUnit: rawMaterials.unit,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}`
    );

  for (const pull of allPulls) {
    const pulled = parseFloat(String(pull.pulledQuantity ?? 0));
    const carried = parseFloat(String(pull.carriedForward ?? 0));

    if (pull.materialType === "raw") {
      // ─── Raw material: closingCount = actual consumed (entered at end-of-day count) ───
      // If not yet counted (open): estimate = pulled - carriedForward
      const usedQty = pull.closingCount !== null && pull.closingCount !== undefined
        ? parseFloat(String(pull.closingCount))
        : Math.max(0, pulled - carried);

      if (usedQty <= 0) continue;
      const name = pull.materialNameAr || pull.materialName || "";
      const price = parseFloat(String(pull.lastPurchasePrice ?? 0));
      addToMap(name, usedQty, pull.unit ?? "kg", price);

    } else {
      // ─── Semi-finished: usedQty = pulled - carriedForward ─────────────────────────────
      // closingCount for semi-finished = portions sold (NOT kg consumed) → ignore it
      const usedQty = Math.max(0, pulled - carried);
      if (usedQty <= 0) continue;

      // Expand to raw ingredient components via recipe
      const recipeComponents = await d
        .select({
          quantity: semiFinishedRecipes.quantity,
          recipeUnit: semiFinishedRecipes.unit,
          ingName: rawMaterials.name,
          ingNameAr: rawMaterials.nameAr,
          ingUnit: rawMaterials.unit,
          ingLastPrice: rawMaterials.lastPurchasePrice,
        })
        .from(semiFinishedRecipes)
        .leftJoin(rawMaterials, eq(semiFinishedRecipes.ingredientId, rawMaterials.id))
        .where(eq(semiFinishedRecipes.materialId, pull.materialId));

      if (recipeComponents.length === 0) {
        // No recipe: show the semi-finished item itself
        const name = pull.materialNameAr || pull.materialName || "";
        const price = parseFloat(String(pull.lastPurchasePrice ?? 0));
        addToMap(name, usedQty, pull.unit ?? "pcs", price);
      } else {
        for (const comp of recipeComponents) {
          const scaledInRecipeUnit = parseFloat(String(comp.quantity ?? 0)) * usedQty;
          const ingBaseUnit = comp.ingUnit ?? "kg";
          const convertedQty = toBaseUnit(scaledInRecipeUnit, comp.recipeUnit ?? ingBaseUnit, ingBaseUnit);
          const compName = comp.ingNameAr || comp.ingName || "";
          const compPrice = parseFloat(String(comp.ingLastPrice ?? 0));
          addToMap(compName, convertedQty, ingBaseUnit, compPrice);
        }
      }
    }
  }

  const items = Array.from(map.values())
    .filter(i => i.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  const totalCost = items.reduce((s, i) => s + i.cost, 0);

  return {
    items,
    totalCost: parseFloat(totalCost.toFixed(2)),
  };
}

// ─── Daily Sales Consumption Comparison ──────────────────────────────────────
/**
 * For a given date:
 * 1. Find all sales reports that cover that date
 * 2. Compute theoretical (expected) raw material consumption from recipes × sold qty
 *    (semi-finished ingredients are expanded to raw components)
 * 3. Get actual consumption from kitchen_daily_pulls for that date
 * 4. Return per-material comparison: expected vs actual, variance, cost impact
 */
export interface DailyConsumptionRow {
  materialId: number;
  materialName: string;
  unit: string;
  expectedQty: number;   // from recipes × sold qty
  actualQty: number;     // from kitchen_daily_pulls
  variance: number;      // actual - expected
  variancePct: number | null;
  lastPurchasePrice: number | null;
  expectedCost: number | null;
  actualCost: number | null;
  /** 'over' = used more than expected, 'under' = used less, 'ok' = within ±5% */
  status: "over" | "under" | "ok";
}

export async function getDailySalesConsumptionComparison(date: string): Promise<{
  date: string;
  salesReportsUsed: number;
  totalSoldItems: number;
  matchedItems: number;
  unmatchedItems: { productName: string; sku: string | null; qty: number }[];
  rows: DailyConsumptionRow[];
  totalExpectedCost: number;
  totalActualCost: number;
  totalVarianceCost: number;
}> {
  const d = await db();
  const tzOffset = await getBusinessDayTzOffset();

  // 1. Find all sales reports covering this date
  const matchingReports = await d
    .select({ id: salesReports.id })
    .from(salesReports)
    .where(sql`DATE(${salesReports.reportDateFrom}) <= ${date} AND DATE(${salesReports.reportDateTo}) >= ${date}`);

  if (matchingReports.length === 0) {
    return {
      date,
      salesReportsUsed: 0,
      totalSoldItems: 0,
      matchedItems: 0,
      unmatchedItems: [],
      rows: [],
      totalExpectedCost: 0,
      totalActualCost: 0,
      totalVarianceCost: 0,
    };
  }

  const reportIds = matchingReports.map((r) => r.id);

  // 2. Get all sale items for these reports
  const allItems = await d
    .select({
      productName: saleItems.productName,
      sku: saleItems.sku,
      qty: saleItems.qty,
      productId: saleItems.productId,
    })
    .from(saleItems)
    .where(sql`${saleItems.reportId} IN (${sql.join(reportIds.map((id) => sql`${id}`), sql`, `)})`);

  const linked = allItems.filter((i) => i.productId !== null);
  const unmatched = allItems
    .filter((i) => i.productId === null)
    .map((i) => ({ productName: i.productName, sku: i.sku, qty: i.qty || 0 }));

  // 3. Aggregate sold qty per productId
  const soldQtyMap = new Map<number, number>();
  for (const item of linked) {
    if (!item.productId) continue;
    soldQtyMap.set(item.productId, (soldQtyMap.get(item.productId) ?? 0) + (item.qty || 0));
  }

  // 4. Compute expected consumption (expand semi-finished to raw)
  const expectedMap = new Map<number, {
    materialId: number;
    materialName: string;
    unit: string;
    qty: number;
    lastPurchasePrice: number | null;
  }>();

  if (soldQtyMap.size > 0) {
    const productIds = Array.from(soldQtyMap.keys());
    const allRecipeRows = await d
      .select({
        productId: recipeItems.productId,
        materialId: recipeItems.materialId,
        quantity: recipeItems.quantity,
        unit: recipeItems.unit,
        materialName: rawMaterials.name,
        materialNameAr: rawMaterials.nameAr,
        materialUnit: rawMaterials.unit,
        materialType: rawMaterials.materialType,
        lastPurchasePrice: rawMaterials.lastPurchasePrice,
        averageCost: rawMaterials.averageCost,
      })
      .from(recipeItems)
      .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
      .where(inArray(recipeItems.productId, productIds));

    for (const row of allRecipeRows) {
      const soldQty = soldQtyMap.get(row.productId) ?? 0;
      const recipeQty = parseFloat(String(row.quantity || 0));
      const totalQty = recipeQty * soldQty;

      // Expand semi-finished to raw components, or accumulate raw directly
      if (row.materialType === "semi_finished") {
        // Expand semi-finished to raw components
        const sfComponents = await d
          .select({
            ingredientId: semiFinishedRecipes.ingredientId,
            quantity: semiFinishedRecipes.quantity,
            unit: semiFinishedRecipes.unit,
            ingName: rawMaterials.name,
            ingNameAr: rawMaterials.nameAr,
            ingUnit: rawMaterials.unit,
            ingAvgCost: rawMaterials.averageCost,
            ingLastPrice: rawMaterials.lastPurchasePrice,
          })
          .from(semiFinishedRecipes)
          .innerJoin(rawMaterials, eq(semiFinishedRecipes.ingredientId, rawMaterials.id))
          .where(eq(semiFinishedRecipes.materialId, row.materialId));

        for (const comp of sfComponents) {
          const compQty = parseFloat(String(comp.quantity || 0)) * totalQty;
          const existing = expectedMap.get(comp.ingredientId);
          const price = comp.ingLastPrice ? parseFloat(String(comp.ingLastPrice)) : (comp.ingAvgCost ? parseFloat(String(comp.ingAvgCost)) : null);
          if (existing) {
            existing.qty += compQty;
          } else {
            expectedMap.set(comp.ingredientId, {
              materialId: comp.ingredientId,
              materialName: comp.ingNameAr || comp.ingName,
              unit: comp.ingUnit,
              qty: compQty,
              lastPurchasePrice: price,
            });
          }
        }
      } else {
        // Raw material
        const existing = expectedMap.get(row.materialId);
        const price = row.lastPurchasePrice ? parseFloat(String(row.lastPurchasePrice)) : (row.averageCost ? parseFloat(String(row.averageCost)) : null);
        if (existing) {
          existing.qty += totalQty;
        } else {
          expectedMap.set(row.materialId, {
            materialId: row.materialId,
            materialName: row.materialNameAr || row.materialName,
            unit: row.unit || row.materialUnit,
            qty: totalQty,
            lastPurchasePrice: price,
          });
        }
      }
    }
  }

  // 5. Get actual consumption from kitchen_daily_pulls for this date
  const actualPulls = await d
    .select({
      materialId: kitchenDailyPulls.materialId,
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      unit: kitchenDailyPulls.unit,
      materialType: kitchenDailyPulls.materialType,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      closingCount: kitchenDailyPulls.closingCount,
      status: kitchenDailyPulls.status,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}`);

  // Aggregate actual per materialId - expand semi-finished to raw components
  const actualMap = new Map<number, { materialId: number; qty: number; name: string; unit: string; lastPurchasePrice: number | null }>();

  for (const pull of actualPulls) {
    const usedQty = pull.closingCount !== null
      ? parseFloat(String(pull.closingCount))
      : parseFloat(String(pull.pulledQuantity ?? 0));
    if (usedQty <= 0) continue;

    if (pull.materialType === "semi_finished") {
      // Expand to raw components
      const sfComponents = await d
        .select({
          ingredientId: semiFinishedRecipes.ingredientId,
          quantity: semiFinishedRecipes.quantity,
          unit: semiFinishedRecipes.unit,
          ingName: rawMaterials.name,
          ingNameAr: rawMaterials.nameAr,
          ingUnit: rawMaterials.unit,
          ingLastPrice: rawMaterials.lastPurchasePrice,
        })
        .from(semiFinishedRecipes)
        .innerJoin(rawMaterials, eq(semiFinishedRecipes.ingredientId, rawMaterials.id))
        .where(eq(semiFinishedRecipes.materialId, pull.materialId));

      for (const comp of sfComponents) {
        const compQty = parseFloat(String(comp.quantity || 0)) * usedQty;
        const existing = actualMap.get(comp.ingredientId);
        const price = comp.ingLastPrice ? parseFloat(String(comp.ingLastPrice)) : null;
        if (existing) {
          existing.qty += compQty;
        } else {
          actualMap.set(comp.ingredientId, {
            materialId: comp.ingredientId,
            qty: compQty,
            name: comp.ingNameAr || comp.ingName,
            unit: comp.ingUnit,
            lastPurchasePrice: price,
          });
        }
      }
    } else {
      const existing = actualMap.get(pull.materialId);
      const price = pull.lastPurchasePrice ? parseFloat(String(pull.lastPurchasePrice)) : null;
      if (existing) {
        existing.qty += usedQty;
      } else {
        actualMap.set(pull.materialId, {
          materialId: pull.materialId,
          qty: usedQty,
          name: pull.materialNameAr || pull.materialName || "",
          unit: pull.unit || "",
          lastPurchasePrice: price,
        });
      }
    }
  }

  // 6. Build comparison rows - merge both maps
  const allMatIds = new Set<number>([...Array.from(expectedMap.keys()), ...Array.from(actualMap.keys())]);
  const rows: DailyConsumptionRow[] = [];

  for (const matId of Array.from(allMatIds)) {
    const exp = expectedMap.get(matId);
    const act = actualMap.get(matId);

    const expectedQty = parseFloat((exp?.qty ?? 0).toFixed(4));
    const actualQty = parseFloat((act?.qty ?? 0).toFixed(4));
    const variance = parseFloat((actualQty - expectedQty).toFixed(4));
    const variancePct = expectedQty > 0 ? parseFloat(((variance / expectedQty) * 100).toFixed(1)) : null;
    const price = exp?.lastPurchasePrice ?? act?.lastPurchasePrice ?? null;

    let status: "over" | "under" | "ok" = "ok";
    if (variancePct !== null) {
      if (variancePct > 5) status = "over";
      else if (variancePct < -5) status = "under";
    } else if (variance > 0) {
      status = "over";
    } else if (variance < 0) {
      status = "under";
    }

    rows.push({
      materialId: matId,
      materialName: exp?.materialName ?? act?.name ?? `مادة #${matId}`,
      unit: exp?.unit ?? act?.unit ?? "",
      expectedQty,
      actualQty,
      variance,
      variancePct,
      lastPurchasePrice: price,
      expectedCost: price !== null ? parseFloat((expectedQty * price).toFixed(3)) : null,
      actualCost: price !== null ? parseFloat((actualQty * price).toFixed(3)) : null,
      status,
    });
  }

  // Sort: largest absolute variance first
  rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const totalExpectedCost = rows.reduce((s, r) => s + (r.expectedCost ?? 0), 0);
  const totalActualCost = rows.reduce((s, r) => s + (r.actualCost ?? 0), 0);

  return {
    date,
    salesReportsUsed: matchingReports.length,
    totalSoldItems: allItems.length,
    matchedItems: linked.length,
    unmatchedItems: unmatched,
    rows,
    totalExpectedCost: parseFloat(totalExpectedCost.toFixed(3)),
    totalActualCost: parseFloat(totalActualCost.toFixed(3)),
    totalVarianceCost: parseFloat((totalActualCost - totalExpectedCost).toFixed(3)),
  };
}
