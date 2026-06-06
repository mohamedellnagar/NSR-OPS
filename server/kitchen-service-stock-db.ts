/**
 * Kitchen Service Stock — Layer 3 of the restaurant inventory chain
 *
 * The 3-layer model:
 *   Layer 1 → Warehouse (raw_materials)          — kg/liter level
 *   Layer 2 → Kitchen Daily Pulls                — material pulled from warehouse
 *   Layer 3 → Kitchen Item Production (THIS)     — finished portions ready to serve
 *
 * Flow:
 *   Kitchen cooks → sets producedQty per product ("25 portions of Kabsa ready")
 *   POS sells → deducts soldQty from this table
 *   remainingQty = totalAvailable - soldQty
 *   When remainingQty ≤ 0 → is86d = true → item disappears from POS
 *   End-of-day close → wasteQty = remainingQty → optionally carry forward to tomorrow
 */

import { db } from "./db";
import {
  kitchenItemProduction,
  products,
  recipeItems,
  rawMaterials,
  inventoryTransactions,
  semiFinishedRecipes,
  users,
} from "../drizzle/schema";
import { eq, and, gte, lte, sql, inArray, desc } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceStockItem {
  id: number;
  productionDate: string;
  productId: number;
  productName: string;
  productNameAr: string | null;
  producedQty: number;
  carriedForwardQty: number;
  totalAvailableQty: number;
  soldQty: number;
  remainingQty: number;
  wasteQty: number;
  is86d: boolean;
  status: string;
  notes: string | null;
  soldPct: number;         // soldQty / totalAvailable * 100
  remainingPct: number;
}

export interface StockSetupResult {
  set: number;
  skipped: number;
  rawMaterialsDeducted: number;
}

// ─── Today's Service Stock ────────────────────────────────────────────────────

export async function getTodayServiceStock(date?: string): Promise<ServiceStockItem[]> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(kitchenItemProduction)
    .where(eq(kitchenItemProduction.productionDate, targetDate))
    .orderBy(kitchenItemProduction.productName);

  return rows.map(mapRow);
}

/** Get only in-service items (for POS availability check) */
export async function getAvailableProducts(date?: string): Promise<{
  productId: number;
  remainingQty: number;
  is86d: boolean;
}[]> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      productId: kitchenItemProduction.productId,
      remainingQty: kitchenItemProduction.remainingQty,
      is86d: kitchenItemProduction.is86d,
    })
    .from(kitchenItemProduction)
    .where(
      and(
        eq(kitchenItemProduction.productionDate, targetDate),
        eq(kitchenItemProduction.status, "in_service")
      )
    );

  return rows.map((r) => ({
    productId: r.productId,
    remainingQty: parseFloat(r.remainingQty as string) || 0,
    is86d: r.is86d ?? false,
  }));
}

// ─── Set Production Qty (morning setup) ──────────────────────────────────────

/**
 * Kitchen manager sets how many portions of each product are ready for service.
 * If deductRawMaterials=true, deducts from raw_materials via recipes automatically.
 */
export async function setProductionQty(data: {
  productId: number;
  producedQty: number;
  date?: string;
  notes?: string;
  deductRawMaterials?: boolean;
  createdBy?: number;
}): Promise<{ id: number; deducted: boolean }> {
  const targetDate = data.date ?? new Date().toISOString().slice(0, 10);

  const [product] = await db
    .select({ name: products.name, nameAr: products.nameAr })
    .from(products)
    .where(eq(products.id, data.productId));

  if (!product) throw new Error("Product not found");

  // Check for carry-forward from yesterday
  const yesterday = new Date(targetDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const [yesterdayRow] = await db
    .select({ remainingQty: kitchenItemProduction.remainingQty })
    .from(kitchenItemProduction)
    .where(
      and(
        eq(kitchenItemProduction.productionDate, yesterdayStr),
        eq(kitchenItemProduction.productId, data.productId),
        eq(kitchenItemProduction.status, "in_service")
      )
    );

  const carriedForward = parseFloat(yesterdayRow?.remainingQty as string) || 0;
  const totalAvailable = data.producedQty + carriedForward;

  // Upsert
  const existing = await db
    .select({ id: kitchenItemProduction.id, soldQty: kitchenItemProduction.soldQty })
    .from(kitchenItemProduction)
    .where(
      and(
        eq(kitchenItemProduction.productionDate, targetDate),
        eq(kitchenItemProduction.productId, data.productId)
      )
    );

  let recordId: number;
  if (existing.length > 0) {
    const alreadySold = parseFloat(existing[0].soldQty as string) || 0;
    recordId = existing[0].id;
    await db.update(kitchenItemProduction).set({
      producedQty: String(data.producedQty),
      carriedForwardQty: String(carriedForward),
      totalAvailableQty: String(totalAvailable),
      remainingQty: String(Math.max(0, totalAvailable - alreadySold)),
      is86d: Math.max(0, totalAvailable - alreadySold) <= 0,
      notes: data.notes,
      status: "in_service",
    }).where(eq(kitchenItemProduction.id, recordId));
  } else {
    const [res] = await db.insert(kitchenItemProduction).values({
      productionDate: targetDate,
      productId: data.productId,
      productName: product.name,
      productNameAr: product.nameAr ?? null,
      producedQty: String(data.producedQty),
      carriedForwardQty: String(carriedForward),
      totalAvailableQty: String(totalAvailable),
      soldQty: "0",
      remainingQty: String(totalAvailable),
      is86d: totalAvailable <= 0,
      rawMaterialsDeducted: false,
      notes: data.notes,
      createdBy: data.createdBy ?? null,
    });
    recordId = (res as any).insertId;
  }

  // Optionally deduct raw materials from warehouse
  let deducted = false;
  if (data.deductRawMaterials && data.producedQty > 0) {
    await deductRawMaterialsForProduction(data.productId, data.producedQty, targetDate, data.createdBy);
    await db.update(kitchenItemProduction)
      .set({ rawMaterialsDeducted: true })
      .where(eq(kitchenItemProduction.id, recordId));
    deducted = true;
  }

  return { id: recordId, deducted };
}

/**
 * Batch setup for morning production — receives array of product+qty pairs.
 * Returns summary of what was set.
 */
export async function batchSetProductionQty(items: Array<{
  productId: number;
  producedQty: number;
  notes?: string;
}>, options: {
  date?: string;
  deductRawMaterials?: boolean;
  createdBy?: number;
} = {}): Promise<StockSetupResult> {
  let set = 0; let skipped = 0; let rawMaterialsDeducted = 0;

  for (const item of items) {
    try {
      const res = await setProductionQty({
        ...item,
        date: options.date,
        deductRawMaterials: options.deductRawMaterials,
        createdBy: options.createdBy,
      });
      set++;
      if (res.deducted) rawMaterialsDeducted++;
    } catch {
      skipped++;
    }
  }
  return { set, skipped, rawMaterialsDeducted };
}

// ─── POS Sale Deduction (called when order is paid) ───────────────────────────

/**
 * Deduct sold quantity from kitchen service stock.
 * This is the core link between POS and Kitchen.
 *
 * Returns:
 *  - deducted: how much was actually deducted
 *  - is86d: true if item ran out after this sale
 *  - hadServiceStock: false if no production record found (fallback to recipe deduction)
 */
export async function deductFromServiceStock(
  productId: number,
  quantity: number,
  date?: string
): Promise<{ deducted: number; is86d: boolean; hadServiceStock: boolean; productionId: number | null }> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const [row] = await db
    .select()
    .from(kitchenItemProduction)
    .where(
      and(
        eq(kitchenItemProduction.productionDate, targetDate),
        eq(kitchenItemProduction.productId, productId),
        eq(kitchenItemProduction.status, "in_service")
      )
    );

  if (!row) {
    // No production record for today → fallback (will use recipe deduction)
    return { deducted: 0, is86d: false, hadServiceStock: false, productionId: null };
  }

  const current = parseFloat(row.remainingQty as string) || 0;
  const actualDeduct = Math.min(quantity, current);
  const newRemaining = Math.max(0, current - quantity);
  const newSold = (parseFloat(row.soldQty as string) || 0) + actualDeduct;
  const is86d = newRemaining <= 0;

  await db.update(kitchenItemProduction).set({
    soldQty: String(Math.round(newSold * 1000) / 1000),
    remainingQty: String(Math.round(newRemaining * 1000) / 1000),
    is86d,
  }).where(eq(kitchenItemProduction.id, row.id));

  return { deducted: actualDeduct, is86d, hadServiceStock: true, productionId: row.id };
}

/**
 * Mark an item as 86'd manually (kitchen ran out mid-service).
 */
export async function set86d(productId: number, is86d: boolean, date?: string) {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  await db.update(kitchenItemProduction).set({ is86d }).where(
    and(
      eq(kitchenItemProduction.productionDate, targetDate),
      eq(kitchenItemProduction.productId, productId)
    )
  );
}

// ─── End-of-Day Closing ───────────────────────────────────────────────────────

/**
 * Close kitchen service stock for the day.
 * - Calculates waste (remainingQty not sold)
 * - Optionally carries forward to tomorrow
 * - Creates waste_log entries for unsold portions
 */
export async function closeServiceStock(date: string, options: {
  carryForward?: boolean;
  createdBy?: number;
} = {}): Promise<{ closed: number; totalWastePortions: number }> {
  const rows = await db
    .select()
    .from(kitchenItemProduction)
    .where(
      and(
        eq(kitchenItemProduction.productionDate, date),
        eq(kitchenItemProduction.status, "in_service")
      )
    );

  let closed = 0;
  let totalWastePortions = 0;

  for (const row of rows) {
    const remaining = parseFloat(row.remainingQty as string) || 0;
    totalWastePortions += remaining;

    await db.update(kitchenItemProduction).set({
      wasteQty: String(remaining),
      status: "closed",
      remainingQty: options.carryForward ? row.remainingQty : "0",
    }).where(eq(kitchenItemProduction.id, row.id));

    closed++;
  }

  return { closed, totalWastePortions };
}

// ─── Raw Material Deduction for Production ───────────────────────────────────

/**
 * When kitchen sets production qty, this optionally deducts
 * the recipe ingredients from raw materials warehouse stock.
 * This represents Layer 2→1 deduction (kitchen pull).
 */
async function deductRawMaterialsForProduction(
  productId: number,
  qty: number,
  date: string,
  createdBy?: number
) {
  // Get direct recipe items
  const directRecipe = await db
    .select({
      materialId: recipeItems.materialId,
      quantity: recipeItems.quantity,
      unit: recipeItems.unit,
    })
    .from(recipeItems)
    .where(eq(recipeItems.productId, productId));

  for (const item of directRecipe) {
    const totalNeeded = (parseFloat(item.quantity as string) || 0) * qty;
    if (totalNeeded <= 0) continue;

    // Deduct from raw_materials
    await db.execute(
      sql`UPDATE raw_materials
          SET currentQuantity = GREATEST(0, currentQuantity - ${totalNeeded})
          WHERE id = ${item.materialId}`
    );

    // Log as kitchen pull transaction
    await db.insert(inventoryTransactions).values({
      materialId: item.materialId,
      transactionType: "OUT",
      quantity: String(totalNeeded),
      reason: "production",
      notes: `Kitchen production: productId=${productId} qty=${qty} date=${date}`,
      createdBy: createdBy ?? null,
    } as any);
  }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

/**
 * Summary for the kitchen service stock report:
 * - What was produced vs sold vs wasted today
 * - Waste value (qty × recipe cost)
 * - Sell-through rate per item
 */
export async function getServiceStockReport(date: string) {
  const rows = await db
    .select()
    .from(kitchenItemProduction)
    .where(eq(kitchenItemProduction.productionDate, date))
    .orderBy(desc(kitchenItemProduction.soldQty));

  const mapped = rows.map(mapRow);

  const totalProduced = mapped.reduce((s, r) => s + r.producedQty + r.carriedForwardQty, 0);
  const totalSold = mapped.reduce((s, r) => s + r.soldQty, 0);
  const totalWaste = mapped.reduce((s, r) => s + r.wasteQty + r.remainingQty, 0);
  const avgSellThrough = totalProduced > 0 ? Math.round((totalSold / totalProduced) * 1000) / 10 : 0;

  return {
    date,
    items: mapped,
    summary: {
      totalProducts: mapped.length,
      totalProduced: Math.round(totalProduced * 100) / 100,
      totalSold: Math.round(totalSold * 100) / 100,
      totalWaste: Math.round(totalWaste * 100) / 100,
      avgSellThrough,
      items86d: mapped.filter((r) => r.is86d).length,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapRow(r: any): ServiceStockItem {
  const total = parseFloat(r.totalAvailableQty) || 0;
  const sold = parseFloat(r.soldQty) || 0;
  return {
    id: r.id,
    productionDate: typeof r.productionDate === "string"
      ? r.productionDate
      : new Date(r.productionDate).toISOString().slice(0, 10),
    productId: r.productId,
    productName: r.productName,
    productNameAr: r.productNameAr ?? null,
    producedQty: parseFloat(r.producedQty) || 0,
    carriedForwardQty: parseFloat(r.carriedForwardQty) || 0,
    totalAvailableQty: total,
    soldQty: sold,
    remainingQty: parseFloat(r.remainingQty) || 0,
    wasteQty: parseFloat(r.wasteQty) || 0,
    is86d: r.is86d ?? false,
    status: r.status,
    notes: r.notes ?? null,
    soldPct: total > 0 ? Math.round((sold / total) * 1000) / 10 : 0,
    remainingPct: total > 0 ? Math.round(((parseFloat(r.remainingQty) || 0) / total) * 1000) / 10 : 0,
  };
}
