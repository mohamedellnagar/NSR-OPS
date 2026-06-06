import { eq, and, desc, lte } from "drizzle-orm";
import { getDb } from "./db";
import { kitchenInventoryCounts, rawMaterials } from "../drizzle/schema";

export interface KitchenCountRow {
  id: number;
  countDate: string;
  materialId: number;
  materialName: string;
  unit: string;
  openingQty: number;
  receivedQty: number;
  closingQty: number | null;
  actualConsumption: number | null;
  unitCost: number;
  consumptionCost: number;
  notes: string | null;
}

/** Get or initialise a count sheet for a given date.
 *  For each active raw material, a row is created/returned with:
 *  - openingQty = closingQty of the previous day (if exists)
 *  - receivedQty = 0 (user fills manually or we can auto-fill later)
 */
export async function getOrInitCountSheet(date: string, userId: number): Promise<KitchenCountRow[]> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Fetch existing rows for this date
  const existing = await db
    .select()
    .from(kitchenInventoryCounts)
    .where(eq(kitchenInventoryCounts.countDate, date))
    .orderBy(kitchenInventoryCounts.materialName);

  if (existing.length > 0) {
    return existing.map(toRow);
  }

  // No rows yet → initialise from active raw materials
  const materials = await db
    .select({
      id: rawMaterials.id,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      averageCost: rawMaterials.averageCost,
      materialType: rawMaterials.materialType,
    })
    .from(rawMaterials)
    .where(and(eq(rawMaterials.isActive, true), eq(rawMaterials.materialType, "raw")))
    .orderBy(rawMaterials.name);

  // For each material, find the previous day closing qty
  type MaterialRow = typeof materials[0];
  const rows = await Promise.all(
    materials.map(async (m: MaterialRow) => {
      // Find most recent count before this date
      const prev = await db
        .select({ closingQty: kitchenInventoryCounts.closingQty, countDate: kitchenInventoryCounts.countDate })
        .from(kitchenInventoryCounts)
        .where(
          and(
            eq(kitchenInventoryCounts.materialId, m.id),
            lte(kitchenInventoryCounts.countDate, date)
          )
        )
        .orderBy(desc(kitchenInventoryCounts.countDate))
        .limit(1);

      const prevClosing = prev.length > 0 && prev[0].countDate < date
        ? parseFloat(String(prev[0].closingQty ?? "0"))
        : 0;

      const unitCost = parseFloat(String(m.averageCost ?? m.lastPurchasePrice ?? "0"));

      await db.insert(kitchenInventoryCounts).values({
        countDate: date,
        materialId: m.id,
        materialName: m.nameAr || m.name,
        unit: m.unit,
        openingQty: String(prevClosing),
        receivedQty: "0",
        closingQty: null,
        actualConsumption: null,
        unitCost: String(unitCost),
        consumptionCost: "0",
        createdBy: userId,
      });

      return {
        id: 0, // will be fetched below
        countDate: date,
        materialId: m.id,
        materialName: m.nameAr || m.name,
        unit: m.unit,
        openingQty: prevClosing,
        receivedQty: 0,
        closingQty: null,
        actualConsumption: null,
        unitCost,
        consumptionCost: 0,
        notes: null,
      } as KitchenCountRow;
    })
  );

  // Re-fetch to get actual IDs
  const fresh = await db
    .select()
    .from(kitchenInventoryCounts)
    .where(eq(kitchenInventoryCounts.countDate, date))
    .orderBy(kitchenInventoryCounts.materialName);

  return fresh.map(toRow);
}

/** Update closing qty for a single row and recalculate consumption */
export async function updateClosingQty(
  id: number,
  closingQty: number,
  notes?: string
): Promise<KitchenCountRow> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Fetch current row
  const rows = await db
    .select()
    .from(kitchenInventoryCounts)
    .where(eq(kitchenInventoryCounts.id, id))
    .limit(1);
  if (rows.length === 0) throw new Error("Row not found");

  const row = rows[0];
  const openingQty = parseFloat(String(row.openingQty));
  const receivedQty = parseFloat(String(row.receivedQty));
  const actualConsumption = Math.max(0, openingQty + receivedQty - closingQty);
  const unitCost = parseFloat(String(row.unitCost ?? "0"));
  const consumptionCost = actualConsumption * unitCost;

  await db
    .update(kitchenInventoryCounts)
    .set({
      closingQty: String(closingQty),
      actualConsumption: String(actualConsumption),
      consumptionCost: String(consumptionCost),
      notes: notes ?? row.notes,
    })
    .where(eq(kitchenInventoryCounts.id, id));

  const updated = await db
    .select()
    .from(kitchenInventoryCounts)
    .where(eq(kitchenInventoryCounts.id, id))
    .limit(1);
  return toRow(updated[0]);
}

/** Update received qty for a single row */
export async function updateReceivedQty(id: number, receivedQty: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const rows = await db.select().from(kitchenInventoryCounts).where(eq(kitchenInventoryCounts.id, id)).limit(1);
  if (rows.length === 0) return;
  const row = rows[0];

  // Recalculate consumption if closing already set
  const closingQty = row.closingQty !== null ? parseFloat(String(row.closingQty)) : null;
  const openingQty = parseFloat(String(row.openingQty));
  const actualConsumption = closingQty !== null
    ? Math.max(0, openingQty + receivedQty - closingQty)
    : null;
  const unitCost = parseFloat(String(row.unitCost ?? "0"));
  const consumptionCost = actualConsumption !== null ? actualConsumption * unitCost : 0;

  await db
    .update(kitchenInventoryCounts)
    .set({
      receivedQty: String(receivedQty),
      actualConsumption: actualConsumption !== null ? String(actualConsumption) : null,
      consumptionCost: String(consumptionCost),
    })
    .where(eq(kitchenInventoryCounts.id, id));
}

/** Get count sheet for a date (read-only) */
export async function getCountSheet(date: string): Promise<KitchenCountRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(kitchenInventoryCounts)
    .where(eq(kitchenInventoryCounts.countDate, date))
    .orderBy(kitchenInventoryCounts.materialName);
  return rows.map(toRow);
}

/** Get list of dates that have count sheets */
export async function getCountDates(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ countDate: kitchenInventoryCounts.countDate })
    .from(kitchenInventoryCounts)
    .orderBy(desc(kitchenInventoryCounts.countDate))
    .limit(60);
  return rows.map((r) => r.countDate);
}

function toRow(r: typeof kitchenInventoryCounts.$inferSelect): KitchenCountRow {
  return {
    id: r.id,
    countDate: r.countDate,
    materialId: r.materialId,
    materialName: r.materialName,
    unit: r.unit,
    openingQty: parseFloat(String(r.openingQty)),
    receivedQty: parseFloat(String(r.receivedQty)),
    closingQty: r.closingQty !== null ? parseFloat(String(r.closingQty)) : null,
    actualConsumption: r.actualConsumption !== null ? parseFloat(String(r.actualConsumption)) : null,
    unitCost: parseFloat(String(r.unitCost ?? "0")),
    consumptionCost: parseFloat(String(r.consumptionCost ?? "0")),
    notes: r.notes ?? null,
  };
}
