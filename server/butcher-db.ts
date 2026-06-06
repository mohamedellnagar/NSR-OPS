import { getDb } from "./db";
import {
  butcherProducts,
  butcherRecipes,
  butcherProduction,
  butcherProductionMaterials,
  butcherWaste,
  butcherSales,
  butcherSaleItems,
  rawMaterials,
  inventoryTransactions,
} from "../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

// Helper to get db or throw
async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

// ─── Products ─────────────────────────────────────────────────────────────────
export async function listButcherProducts(activeOnly = true) {
  const d = await db();
  if (activeOnly) {
    return d.select().from(butcherProducts).where(eq(butcherProducts.isActive, true)).orderBy(butcherProducts.name);
  }
  return d.select().from(butcherProducts).orderBy(butcherProducts.name);
}

export async function createButcherProduct(data: {
  name: string;
  nameAr?: string;
  unit: string;
  pricePerUnit: string;
  soldByWeight: boolean;
  notes?: string;
  createdBy?: number;
}) {
  const d = await db();
  const [result] = await d.insert(butcherProducts).values(data);
  return (result as any).insertId as number;
}

export async function updateButcherProduct(id: number, data: Partial<{
  name: string;
  nameAr: string;
  unit: string;
  pricePerUnit: string;
  soldByWeight: boolean;
  isActive: boolean;
  notes: string;
}>) {
  const d = await db();
  await d.update(butcherProducts).set(data).where(eq(butcherProducts.id, id));
}

export async function deleteButcherProduct(id: number) {
  const d = await db();
  await d.update(butcherProducts).set({ isActive: false }).where(eq(butcherProducts.id, id));
}

// ─── Recipes ──────────────────────────────────────────────────────────────────
export async function getButcherRecipe(productId: number) {
  const d = await db();
  return d
    .select({
      id: butcherRecipes.id,
      productId: butcherRecipes.productId,
      materialId: butcherRecipes.materialId,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      materialUnit: rawMaterials.unit,
      quantity: butcherRecipes.quantity,
      unit: butcherRecipes.unit,
      notes: butcherRecipes.notes,
    })
    .from(butcherRecipes)
    .leftJoin(rawMaterials, eq(butcherRecipes.materialId, rawMaterials.id))
    .where(eq(butcherRecipes.productId, productId));
}

export async function replaceButcherRecipe(productId: number, items: Array<{
  materialId: number;
  quantity: string;
  unit: string;
  notes?: string;
}>) {
  const d = await db();
  await d.delete(butcherRecipes).where(eq(butcherRecipes.productId, productId));
  if (items.length > 0) {
    await d.insert(butcherRecipes).values(items.map(i => ({ ...i, productId })));
  }
}

export async function deleteButcherRecipeItem(id: number) {
  const d = await db();
  await d.delete(butcherRecipes).where(eq(butcherRecipes.id, id));
}

// ─── Production ───────────────────────────────────────────────────────────────
export async function listButcherProduction(filters: {
  from?: Date;
  to?: Date;
  productId?: number;
  limit?: number;
} = {}) {
  const d = await db();
  const conditions = [];
  if (filters.from) conditions.push(gte(butcherProduction.productionDate, filters.from));
  if (filters.to) conditions.push(lte(butcherProduction.productionDate, filters.to));
  if (filters.productId) conditions.push(eq(butcherProduction.productId, filters.productId));

  return d
    .select()
    .from(butcherProduction)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(butcherProduction.productionDate))
    .limit(filters.limit ?? 100);
}

export async function createButcherProduction(data: {
  productionDate: Date;
  productId: number;
  productName: string;
  productNameAr?: string;
  unit: string;
  producedQuantity: string;
  notes?: string;
  createdBy?: number;
  materials: Array<{
    rawMaterialId: number;
    materialName: string;
    unit: string;
    consumedQuantity: string;
  }>;
}) {
  const d = await db();
  const { materials, ...prodData } = data;

  return await d.transaction(async (tx) => {
    const [result] = await (tx as any).insert(butcherProduction).values(prodData);
    const productionId = (result as any).insertId as number;

    for (const mat of materials) {
      await (tx as any).insert(butcherProductionMaterials).values({ ...mat, productionId });

      await (tx as any)
        .update(rawMaterials)
        .set({ currentQuantity: sql`currentQuantity - ${mat.consumedQuantity}` })
        .where(eq(rawMaterials.id, mat.rawMaterialId));

      await (tx as any).insert(inventoryTransactions).values({
        materialId: mat.rawMaterialId,
        transactionType: "OUT",
        quantity: mat.consumedQuantity,
        reason: "production",
        notes: `إنتاج ملحمة: ${data.productName}`,
        transactionDate: data.productionDate,
        createdBy: data.createdBy,
      });
    }

    await (tx as any)
      .update(butcherProducts)
      .set({ currentStock: sql`currentStock + ${data.producedQuantity}` })
      .where(eq(butcherProducts.id, data.productId));

    return productionId;
  });
}

export async function deleteButcherProduction(id: number, deletedBy?: number) {
  const d = await db();
  const prod = await d.select().from(butcherProduction).where(eq(butcherProduction.id, id)).limit(1);
  if (!prod.length) throw new Error("Production record not found");

  const mats = await d
    .select()
    .from(butcherProductionMaterials)
    .where(eq(butcherProductionMaterials.productionId, id));

  await d.transaction(async (tx) => {
    for (const mat of mats) {
      await (tx as any)
        .update(rawMaterials)
        .set({ currentQuantity: sql`currentQuantity + ${mat.consumedQuantity}` })
        .where(eq(rawMaterials.id, mat.rawMaterialId));

      await (tx as any).insert(inventoryTransactions).values({
        materialId: mat.rawMaterialId,
        transactionType: "IN",
        quantity: mat.consumedQuantity,
        reason: "adjustment",
        notes: `إلغاء إنتاج ملحمة: ${prod[0].productName}`,
        transactionDate: new Date(),
        createdBy: deletedBy,
      });
    }

    await (tx as any)
      .update(butcherProducts)
      .set({ currentStock: sql`currentStock - ${prod[0].producedQuantity}` })
      .where(eq(butcherProducts.id, prod[0].productId));

    await (tx as any).delete(butcherProduction).where(eq(butcherProduction.id, id));
  });
}

// ─── Waste ────────────────────────────────────────────────────────────────────
export async function listButcherWaste(filters: { from?: Date; to?: Date; limit?: number } = {}) {
  const d = await db();
  const conditions = [];
  if (filters.from) conditions.push(gte(butcherWaste.wasteDate, filters.from));
  if (filters.to) conditions.push(lte(butcherWaste.wasteDate, filters.to));

  return d
    .select()
    .from(butcherWaste)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(butcherWaste.wasteDate))
    .limit(filters.limit ?? 100);
}

export async function createButcherWaste(data: {
  wasteDate: Date;
  itemType: "raw_material" | "butcher_product";
  rawMaterialId?: number;
  butcherProductId?: number;
  itemName: string;
  unit: string;
  wasteQty: string;
  unitCost?: string;
  totalCost?: string;
  reason?: string;
  notes?: string;
  createdBy?: number;
}) {
  const d = await db();
  await d.transaction(async (tx) => {
    await (tx as any).insert(butcherWaste).values(data);

    if (data.itemType === "raw_material" && data.rawMaterialId) {
      await (tx as any)
        .update(rawMaterials)
        .set({ currentQuantity: sql`currentQuantity - ${data.wasteQty}` })
        .where(eq(rawMaterials.id, data.rawMaterialId));

      await (tx as any).insert(inventoryTransactions).values({
        materialId: data.rawMaterialId,
        transactionType: "OUT",
        quantity: data.wasteQty,
        reason: "waste",
        notes: `هدر ملحمة: ${data.itemName}`,
        transactionDate: data.wasteDate,
        createdBy: data.createdBy,
      });
    } else if (data.itemType === "butcher_product" && data.butcherProductId) {
      await (tx as any)
        .update(butcherProducts)
        .set({ currentStock: sql`currentStock - ${data.wasteQty}` })
        .where(eq(butcherProducts.id, data.butcherProductId));
    }
  });
}

export async function deleteButcherWaste(id: number) {
  const d = await db();
  const [waste] = await d.select().from(butcherWaste).where(eq(butcherWaste.id, id)).limit(1);
  if (!waste) throw new Error("Waste record not found");

  await d.transaction(async (tx) => {
    if (waste.itemType === "raw_material" && waste.rawMaterialId) {
      await (tx as any)
        .update(rawMaterials)
        .set({ currentQuantity: sql`currentQuantity + ${waste.wasteQty}` })
        .where(eq(rawMaterials.id, waste.rawMaterialId));
    } else if (waste.itemType === "butcher_product" && waste.butcherProductId) {
      await (tx as any)
        .update(butcherProducts)
        .set({ currentStock: sql`currentStock + ${waste.wasteQty}` })
        .where(eq(butcherProducts.id, waste.butcherProductId));
    }
    await (tx as any).delete(butcherWaste).where(eq(butcherWaste.id, id));
  });
}

// ─── Sales (Cashier) ──────────────────────────────────────────────────────────
export async function listButcherSales(filters: { from?: Date; to?: Date; limit?: number } = {}) {
  const d = await db();
  const conditions = [];
  if (filters.from) conditions.push(gte(butcherSales.saleDate, filters.from));
  if (filters.to) conditions.push(lte(butcherSales.saleDate, filters.to));

  return d
    .select()
    .from(butcherSales)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(butcherSales.saleDate))
    .limit(filters.limit ?? 100);
}

export async function getButcherSaleItems(saleId: number) {
  const d = await db();
  return d.select().from(butcherSaleItems).where(eq(butcherSaleItems.saleId, saleId));
}

export async function createButcherSale(data: {
  saleDate: Date;
  paymentMethod: "cash" | "card" | "transfer";
  notes?: string;
  createdBy?: number;
  items: Array<{
    productId: number;
    productName: string;
    unit: string;
    soldByWeight: boolean;
    quantity: string;
    pricePerUnit: string;
    totalPrice: string;
  }>;
}) {
  const d = await db();
  const { items, ...saleData } = data;
  const totalAmount = items.reduce((sum, i) => sum + parseFloat(i.totalPrice), 0).toFixed(3);

  return await d.transaction(async (tx) => {
    const [result] = await (tx as any).insert(butcherSales).values({ ...saleData, totalAmount });
    const saleId = (result as any).insertId as number;

    for (const item of items) {
      await (tx as any).insert(butcherSaleItems).values({ ...item, saleId });

      await (tx as any)
        .update(butcherProducts)
        .set({ currentStock: sql`currentStock - ${item.quantity}` })
        .where(eq(butcherProducts.id, item.productId));
    }

    return saleId;
  });
}

export async function deleteButcherSale(id: number) {
  const d = await db();
  const items = await d.select().from(butcherSaleItems).where(eq(butcherSaleItems.saleId, id));

  await d.transaction(async (tx) => {
    for (const item of items) {
      await (tx as any)
        .update(butcherProducts)
        .set({ currentStock: sql`currentStock + ${item.quantity}` })
        .where(eq(butcherProducts.id, item.productId));
    }
    await (tx as any).delete(butcherSales).where(eq(butcherSales.id, id));
  });
}
