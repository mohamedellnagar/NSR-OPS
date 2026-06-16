import { eq, and, gte, lte, like, or, desc, sql, lt, inArray } from "drizzle-orm";

// Remove undefined/null/empty-string from INSERT objects to prevent FK/type errors in MySQL
export function clean<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ) as Partial<T>;
}
import { drizzle } from "drizzle-orm/mysql2";
import * as bcrypt from "bcryptjs";
import {
  appSettings,
  users,
  materialCategories,
  suppliers,
  rawMaterials,
  inventoryTransactions,
  invoices,
  invoiceItems,
  semiFinishedRecipes,
  semiFinishedRecipeVersions,
  invoiceAuditLog,
  kitchenDailyPulls,
  wasteLogs,
  freeInvoices,
  freeInvoiceItems,
  kitchenDailyProduction,
  kitchenProductionMaterials,
  kitchenProductionCounts,
  kitchenProducts,
  products,
  recipeItems,
  dailyAccounts,
  invoicePaymentHistory,
  savedMenus,
  restaurantSettings,
  type DailyAccount,
  type InsertDailyAccount,
  type InsertUser,
  type InsertMaterialCategory,
  type InsertSupplier,
  type InsertRawMaterial,
  type InsertInventoryTransaction,
  type User,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    if (!_db) {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not set");
      }
      _db = drizzle(process.env.DATABASE_URL);
    }
    return (_db as any)[prop];
  },
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function updateLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

/** Seed the first admin user if no users exist */
export async function seedAdminIfEmpty() {
  const db = await getDb();
  if (!db) return;
  const count = await db.select({ c: sql<number>`count(*)` }).from(users);
  if (Number(count[0]?.c) > 0) return;
  const passwordHash = await hashPassword("admin123");
  await db.insert(users).values({
    name: "مدير النظام",
    email: "admin@matjari.com",
    passwordHash,
    role: "admin",
    isActive: true,
  });
  console.log("[Seed] Created default admin: admin@matjari.com / admin123");
}

// ─── User Management ──────────────────────────────────────────────────────────

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      allowedPages: users.allowedPages,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "warehouse_manager" | "viewer";
  allowedPages?: string[] | Record<string, string> | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const passwordHash = await hashPassword(data.password);
  const [result] = await db.insert(users).values({
    name: data.name,
    email: data.email.toLowerCase(),
    passwordHash,
    role: data.role,
    isActive: true,
    allowedPages: data.allowedPages ? JSON.stringify(data.allowedPages) : null,
  });
  return (result as any).insertId as number;
}

export async function updateUser(
  id: number,
  data: { name?: string; email?: string; role?: "admin" | "warehouse_manager" | "viewer"; isActive?: boolean; password?: string; allowedPages?: string[] | Record<string, string> | null }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.email !== undefined) update.email = data.email.toLowerCase();
  if (data.role !== undefined) update.role = data.role;
  if (data.isActive !== undefined) update.isActive = data.isActive;
  if (data.password) update.passwordHash = await hashPassword(data.password);
  if (data.allowedPages !== undefined) {
    update.allowedPages = data.allowedPages ? JSON.stringify(data.allowedPages) : null;
  }
  if (Object.keys(update).length > 0) {
    await db.update(users).set(update).where(eq(users.id, id));
  }
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(users).where(eq(users.id, id));
}

// ─── Material Categories ──────────────────────────────────────────────────────

export async function listCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(materialCategories).where(eq(materialCategories.isActive, true)).orderBy(materialCategories.name);
}

export async function createCategory(data: InsertMaterialCategory) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(materialCategories).values(data);
  return (result as any).insertId as number;
}

export async function updateCategory(id: number, data: Partial<InsertMaterialCategory>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(materialCategories).set(data).where(eq(materialCategories.id, id));
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(materialCategories).set({ isActive: false }).where(eq(materialCategories.id, id));
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

export async function listSuppliers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(suppliers.name);
}

export async function createSupplier(data: InsertSupplier) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(suppliers).values(data);
  return (result as any).insertId as number;
}

export async function updateSupplier(id: number, data: Partial<InsertSupplier>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(suppliers).set(data).where(eq(suppliers.id, id));
}

export async function deleteSupplier(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, id));
}

// ─── Raw Materials ────────────────────────────────────────────────────────────

export async function listMaterials(filters?: { search?: string; categoryId?: number; lowStock?: boolean; includeInactive?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = filters?.includeInactive ? [] : [eq(rawMaterials.isActive, true)];
  if (filters?.categoryId) conditions.push(eq(rawMaterials.categoryId, filters.categoryId));
  if (filters?.search) {
    conditions.push(
      or(
        like(rawMaterials.name, `%${filters.search}%`),
        like(rawMaterials.nameAr, `%${filters.search}%`),
        like(rawMaterials.code, `%${filters.search}%`)
      )!
    );
  }
  const rows = await db
    .select({
      id: rawMaterials.id,
      code: rawMaterials.code,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      categoryId: rawMaterials.categoryId,
      categoryName: materialCategories.name,
      categoryColor: materialCategories.color,
      unit: rawMaterials.unit,
      currentQuantity: rawMaterials.currentQuantity,
      minimumQuantity: rawMaterials.minimumQuantity,
      reorderQuantity: rawMaterials.reorderQuantity,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      averageCost: rawMaterials.averageCost,
      notes: rawMaterials.notes,
      isActive: rawMaterials.isActive,
      materialType: rawMaterials.materialType,
      createdAt: rawMaterials.createdAt,
      updatedAt: rawMaterials.updatedAt,
    })
    .from(rawMaterials)
    .leftJoin(materialCategories, eq(rawMaterials.categoryId, materialCategories.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(rawMaterials.name);

  // For semi_finished materials, calculate recipe cost and override lastPurchasePrice
  // Also fetch total pulled quantity for semi_finished materials with recipe cost
  const db2 = await getDb();
  let pulledMap = new Map<number, number>();
  if (db2) {
    const pulledRows = await db2
      .select({
        materialId: kitchenDailyPulls.materialId,
        totalPulled: sql<string>`SUM(${kitchenDailyPulls.pulledQuantity})`,
      })
      .from(kitchenDailyPulls)
      .where(and(
        eq(kitchenDailyPulls.materialType, "semi_finished"),
        eq(kitchenDailyPulls.status, "open")  // فقط السجلات المفتوحة (لم تُجرد بعد)
      ))
      .groupBy(kitchenDailyPulls.materialId);
    for (const pr of pulledRows) {
      pulledMap.set(pr.materialId, parseFloat(pr.totalPulled ?? "0"));
    }
  }
  const enriched = await Promise.all(
    rows.map(async (row) => {
      if (row.materialType === "semi_finished") {
        const cost = await calcSemiFinishedCost(row.id);
        const hasCost = cost > 0;
        const totalPulled = pulledMap.get(row.id) ?? null;
        return {
          ...row,
          lastPurchasePrice: cost.toFixed(4),
          // If has recipe cost, expose totalPulledQuantity for display in MaterialsPage
          totalPulledQuantity: hasCost && totalPulled !== null ? totalPulled.toFixed(3) : null,
        };
      }
      return { ...row, totalPulledQuantity: null };
    })
  );

  if (filters?.lowStock) {
    return enriched.filter((r) => parseFloat(r.currentQuantity) <= parseFloat(r.minimumQuantity));
  }
  return enriched;
}

export async function getMaterialById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rawMaterials).where(eq(rawMaterials.id, id)).limit(1);
  return result[0];
}

export async function createMaterial(data: InsertRawMaterial) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(rawMaterials).values(data);
  return (result as any).insertId as number;
}

export async function updateMaterial(id: number, data: Partial<InsertRawMaterial>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rawMaterials).set(data).where(eq(rawMaterials.id, id));
}

export async function deleteMaterial(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rawMaterials).set({ isActive: false }).where(eq(rawMaterials.id, id));
}

export async function hardDeleteMaterial(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Only allow hard-delete if material is already archived (isActive = false)
  const [mat] = await db.select({ isActive: rawMaterials.isActive }).from(rawMaterials).where(eq(rawMaterials.id, id)).limit(1);
  if (!mat) throw new Error("المادة غير موجودة");
  if (mat.isActive !== false) throw new Error("يجب أرشفة المادة أولاً قبل حذفها نهائياً");
  await db.delete(rawMaterials).where(eq(rawMaterials.id, id));
}

// ─── Inventory Transactions ───────────────────────────────────────────────────

export async function listTransactions(filters?: {
  materialId?: number;
  transactionType?: "IN" | "OUT" | "ADJUSTMENT";
  reason?: string;
  movementStatus?: string;
  referenceType?: string;
  startDate?: Date;
  endDate?: Date;
  dateStr?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.materialId) conditions.push(eq(inventoryTransactions.materialId, filters.materialId));
  if (filters?.transactionType) conditions.push(eq(inventoryTransactions.transactionType, filters.transactionType));
  if (filters?.reason) conditions.push(eq(inventoryTransactions.reason, filters.reason as any));
  if (filters?.movementStatus) conditions.push(eq(inventoryTransactions.movementStatus, filters.movementStatus as any));
  if (filters?.referenceType) conditions.push(eq(inventoryTransactions.referenceType, filters.referenceType));
  // Use dateStr (YYYY-MM-DD) for business-day filtering with dynamic offset from settings.
  if (filters?.dateStr) {
    const tzOffset = await getBusinessDayTzOffset();
    conditions.push(sql`DATE(CONVERT_TZ(${inventoryTransactions.transactionDate}, '+00:00', ${tzOffset})) = ${filters.dateStr}`);
  } else {
    if (filters?.startDate) conditions.push(gte(inventoryTransactions.transactionDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(inventoryTransactions.transactionDate, filters.endDate));
  }

  const query = db
    .select({
      id: inventoryTransactions.id,
      materialId: inventoryTransactions.materialId,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      materialCode: rawMaterials.code,
      materialUnit: rawMaterials.unit,
      materialType: rawMaterials.materialType,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      unitPrice: inventoryTransactions.unitPrice,
      totalAmount: inventoryTransactions.totalAmount,
      supplierId: inventoryTransactions.supplierId,
      supplierName: inventoryTransactions.supplierName,
      destination: inventoryTransactions.destination,
      reason: inventoryTransactions.reason,
      movementStatus: inventoryTransactions.movementStatus,
      referenceNumber: inventoryTransactions.referenceNumber,
      referenceType: inventoryTransactions.referenceType,
      reversingTransactionId: inventoryTransactions.reversingTransactionId,
      quantityBefore: inventoryTransactions.quantityBefore,
      quantityAfter: inventoryTransactions.quantityAfter,
      transactionDate: inventoryTransactions.transactionDate,
      notes: inventoryTransactions.notes,
      createdBy: inventoryTransactions.createdBy,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .leftJoin(rawMaterials, eq(inventoryTransactions.materialId, rawMaterials.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryTransactions.transactionDate))
    .limit(filters?.limit ?? 500);

  return query;
}

export async function createTransaction(data: InsertInventoryTransaction) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(inventoryTransactions).values(clean(data) as any);
  const txId = (result as any).insertId as number;

  // Update material quantity
  const qty = parseFloat(data.quantity as string);
  if (data.transactionType === "IN") {
    await db
      .update(rawMaterials)
      .set({
        currentQuantity: sql`currentQuantity + ${qty}`,
        lastPurchasePrice: data.unitPrice ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(rawMaterials.id, data.materialId));
  } else if (data.transactionType === "OUT") {
    await db
      .update(rawMaterials)
      .set({ currentQuantity: sql`currentQuantity - ${qty}`, updatedAt: new Date() })
      .where(eq(rawMaterials.id, data.materialId));
  }
  return txId;
}

// ─── Expiry Date Alerts ───────────────────────────────────────────────────────

export async function getExpiringMaterials(daysAhead: number = 7) {
  const db = await getDb();
  if (!db) return [];
  const today = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);
  // Format as YYYY-MM-DD strings for date comparison
  const todayStr = today.toISOString().split("T")[0];
  const futureStr = future.toISOString().split("T")[0];

  const rows = await db
    .select({
      txId: inventoryTransactions.id,
      materialId: inventoryTransactions.materialId,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      quantity: inventoryTransactions.quantity,
      expiryDate: inventoryTransactions.expiryDate,
      transactionDate: inventoryTransactions.transactionDate,
      supplierName: inventoryTransactions.supplierName,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    })
    .from(inventoryTransactions)
    .innerJoin(rawMaterials, eq(inventoryTransactions.materialId, rawMaterials.id))
    .where(
      and(
        sql`${inventoryTransactions.expiryDate} IS NOT NULL`,
        sql`DATE(${inventoryTransactions.expiryDate}) >= ${todayStr}`,
        sql`DATE(${inventoryTransactions.expiryDate}) <= ${futureStr}`,
        eq(inventoryTransactions.transactionType, "IN")
      )
    )
    .orderBy(inventoryTransactions.expiryDate);

  return rows.map((r) => ({
    txId: r.txId,
    materialId: r.materialId,
    materialName: r.materialName,
    materialNameAr: r.materialNameAr,
    unit: r.unit,
    quantity: parseFloat(String(r.quantity || "0")),
    expiryDate: r.expiryDate ? String(r.expiryDate) : null,
    transactionDate: r.transactionDate,
    supplierName: r.supplierName,
    lastPurchasePrice: r.lastPurchasePrice ? parseFloat(String(r.lastPurchasePrice)) : null,
    daysUntilExpiry: Math.ceil(
      (new Date(String(r.expiryDate)).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalMaterials: 0, lowStockCount: 0, outOfStockCount: 0, totalValue: 0 };

    const materials = await db
    .select({
      currentQuantity: rawMaterials.currentQuantity,
      minimumQuantity: rawMaterials.minimumQuantity,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      averageCost: rawMaterials.averageCost,
      materialType: rawMaterials.materialType,
    })
    .from(rawMaterials)
    .where(eq(rawMaterials.isActive, true));
  const totalMaterials = materials.length;
  const lowStockCount = materials.filter(
    (m) => parseFloat(m.currentQuantity) > 0 && parseFloat(m.currentQuantity) <= parseFloat(m.minimumQuantity)
  ).length;
  const outOfStockCount = materials.filter((m) => parseFloat(m.currentQuantity) <= 0).length;
  // إجمالي قيمة المخزون: المواد الخام (qty × lastPurchasePrice) + المواد المصنّعة (qty × averageCost)
  const totalValue = materials.reduce((sum, m) => {
    const qty = parseFloat(m.currentQuantity);
    if (qty <= 0) return sum;
    if (m.materialType === 'semi_finished') {
      // المواد المصنّعة: استخدم averageCost (تكلفة الإنتاج)
      const cost = parseFloat(m.averageCost || '0');
      return sum + qty * cost;
    } else {
      // المواد الخام: استخدم lastPurchasePrice
      const price = parseFloat(m.lastPurchasePrice || '0');
      return sum + qty * price;
    }
  }, 0);
  return { totalMaterials, lowStockCount, outOfStockCount, totalValue };
}

export async function getRecentTransactions(limit = 10) {
  return listTransactions({ limit });
}

export async function getLowStockMaterials() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: rawMaterials.id,
      code: rawMaterials.code,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      currentQuantity: rawMaterials.currentQuantity,
      minimumQuantity: rawMaterials.minimumQuantity,
      reorderQuantity: rawMaterials.reorderQuantity,
      categoryName: materialCategories.name,
      categoryColor: materialCategories.color,
    })
    .from(rawMaterials)
    .leftJoin(materialCategories, eq(rawMaterials.categoryId, materialCategories.id))
    .where(
      and(
        eq(rawMaterials.isActive, true),
        sql`${rawMaterials.currentQuantity} <= ${rawMaterials.minimumQuantity}`
      )
    )
    .orderBy(rawMaterials.currentQuantity);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getInventoryValuationReport() {
  const db = await getDb();
  if (!db) return { items: [], totalValue: 0 };
  const rows = await db
    .select({
      id: rawMaterials.id,
      code: rawMaterials.code,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      currentQuantity: rawMaterials.currentQuantity,
      averageCost: rawMaterials.averageCost,
      categoryName: materialCategories.name,
    })
    .from(rawMaterials)
    .leftJoin(materialCategories, eq(rawMaterials.categoryId, materialCategories.id))
    .where(eq(rawMaterials.isActive, true))
    .orderBy(desc(sql`currentQuantity * averageCost`));

  const items = rows.map((r) => ({
    ...r,
    totalValue: parseFloat(r.currentQuantity) * parseFloat(r.averageCost || "0"),
  }));
  const totalValue = items.reduce((s, i) => s + i.totalValue, 0);
  return { items, totalValue };
}

export async function getStockMovementReport(startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return { totalIn: 0, totalOut: 0, transactions: [] };
  const txs = await listTransactions({ startDate, endDate });
  const totalIn = txs.filter((t) => t.transactionType === "IN").reduce((s, t) => s + parseFloat(t.quantity), 0);
  const totalOut = txs.filter((t) => t.transactionType === "OUT").reduce((s, t) => s + parseFloat(t.quantity), 0);
  return { totalIn, totalOut, transactions: txs };
}

export async function getSupplierPerformanceReport() {
  const db = await getDb();
  if (!db) return [];
  const txs = await db
    .select({
      supplierId: inventoryTransactions.supplierId,
      supplierName: inventoryTransactions.supplierName,
      quantity: inventoryTransactions.quantity,
      totalAmount: inventoryTransactions.totalAmount,
    })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.transactionType, "IN"));

  const map = new Map<string, { supplierName: string; totalQty: number; totalAmount: number; count: number }>();
  for (const tx of txs) {
    const key = tx.supplierName || "Unknown";
    const existing = map.get(key) || { supplierName: key, totalQty: 0, totalAmount: 0, count: 0 };
    existing.totalQty += parseFloat(tx.quantity);
    existing.totalAmount += parseFloat(tx.totalAmount || "0");
    existing.count += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

// ─── Compatibility stubs for sdk.ts (Manus OAuth not used but referenced) ────
// These are no-ops since we use custom JWT auth; sdk.ts imports them but
// authenticateRequest is never called (context.ts bypasses it).
export async function getUserByOpenId(_openId: string): Promise<User | undefined> {
  return undefined;
}
export async function upsertUser(_data: Record<string, unknown>) {
  // no-op: we use custom email/password auth
}

// ─── Bulk Import ──────────────────────────────────────────────────────────────
export async function bulkCreateMaterials(
  items: Array<{
    code: string;
    name: string;
    nameAr?: string;
    unit: string;
    currentQuantity?: number;
    minimumQuantity?: number;
    reorderQuantity?: number;
    lastPurchasePrice?: number;
    notes?: string;
    createdBy?: number;
  }>
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      // Check if code already exists
      const existing = await db
        .select({ id: rawMaterials.id })
        .from(rawMaterials)
        .where(eq(rawMaterials.code, item.code))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        errors.push(`Code "${item.code}" already exists — skipped`);
        continue;
      }

      await db.insert(rawMaterials).values({
        code: item.code,
        name: item.name,
        nameAr: item.nameAr || null,
        unit: item.unit || "kg",
        currentQuantity: String(item.currentQuantity ?? 0),
        minimumQuantity: String(item.minimumQuantity ?? 0),
        reorderQuantity: item.reorderQuantity !== undefined ? String(item.reorderQuantity) : "0",
        lastPurchasePrice: item.lastPurchasePrice !== undefined ? String(item.lastPurchasePrice) : null,
        notes: item.notes || null,
        createdBy: item.createdBy || null,
        isActive: true,
      });
      inserted++;
    } catch (err: any) {
      errors.push(`Row "${item.code}": ${err.message}`);
    }
  }

  return { inserted, skipped, errors };
}

// ─── Reset All Stock ──────────────────────────────────────────────────────────
export async function resetAllStock() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rawMaterials).set({
    currentQuantity: "0",
    lastPurchasePrice: null,
    averageCost: "0",
    updatedAt: new Date(),
  });
  return { success: true };
}

// ─── Reset Single Material Stock ──────────────────────────────────────────
export async function resetSingleMaterial(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rawMaterials).set({
    currentQuantity: "0",
    updatedAt: new Date(),
  }).where(eq(rawMaterials.id, id));
  return { success: true };
}

// ─── Update Stock Quantity and Price for a Single Material ──────────────────
export async function updateStockAndPrice(id: number, currentQuantity: number, lastPurchasePrice: number | null) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rawMaterials).set({
    currentQuantity: currentQuantity.toString(),
    lastPurchasePrice: lastPurchasePrice != null ? lastPurchasePrice.toString() : null,
    updatedAt: new Date(),
  }).where(eq(rawMaterials.id, id));
  return { success: true };
}

// ─── Delete All Materials ─────────────────────────────────────────────────
export async function deleteAllMaterials() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Delete all transactions first (foreign key constraint)
  await db.delete(inventoryTransactions);
  // Then delete all materials
  await db.delete(rawMaterials);
  return { success: true };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/** Generate a unique invoice number like INV-20260401-0001 */
async function generateInvoiceNumber(db: ReturnType<typeof drizzle>): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `INV-${dateStr}-`;
  const [last] = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(like(invoices.invoiceNumber, `${prefix}%`))
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);
  const seq = last ? parseInt(last.invoiceNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export interface CreateInvoiceInput {
  supplierId?: number;
  supplierName?: string;
  invoiceDate: Date;
  vatEnabled: boolean;
  paymentStatus: "paid" | "deferred" | "partial" | "under_review";
  paidAmount?: number;
  notes?: string;
  expenseCategory?: "operational" | "maintenance" | "fixed" | "other";
  createdBy: number;
  items: Array<{
    materialId: number;
    materialName: string;
    materialUnit: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const invoiceNumber = await generateInvoiceNumber(db);

  // Auto-create supplier from free-text name ONLY when:
  // 1. No supplierId is linked
  // 2. supplierName is a non-empty STRING (not a number)
  let resolvedSupplierId = input.supplierId;
  let resolvedSupplierName = typeof input.supplierName === "string" ? input.supplierName : undefined;

  if (resolvedSupplierId) {
    // Supplier already linked by ID — fetch name from DB to ensure accuracy
    if (!resolvedSupplierName) {
      const [sup] = await db.select({ name: suppliers.name }).from(suppliers).where(eq(suppliers.id, resolvedSupplierId)).limit(1);
      if (sup) resolvedSupplierName = sup.name;
    }
  } else if (resolvedSupplierName?.trim() && isNaN(Number(resolvedSupplierName.trim()))) {
    // Free-text name that is NOT a number → find or create supplier
    const name = resolvedSupplierName.trim();
    const existing = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.name, name))
      .limit(1);
    if (existing.length > 0) {
      resolvedSupplierId = existing[0].id;
    } else {
      const [newSupplier] = await db.insert(suppliers).values({ name, isActive: true });
      resolvedSupplierId = (newSupplier as any).insertId as number;
    }
  }

  // Calculate totals - sum rounded item totals to match stored totalPrice values
  const subtotal = parseFloat(
    input.items
      .reduce((s, i) => s + parseFloat((i.quantity * i.unitPrice).toFixed(3)), 0)
      .toFixed(3)
  );
  const vatAmount = input.vatEnabled ? parseFloat((subtotal * 0.05).toFixed(3)) : 0;
  const totalAmount = parseFloat((subtotal + vatAmount).toFixed(3));

  // Insert invoice
  const [invoiceResult] = await (db.insert(invoices) as any).values({
    invoiceNumber,
    supplierId: resolvedSupplierId,
    supplierName: resolvedSupplierName,
    invoiceDate: input.invoiceDate,
    subtotal: String(subtotal.toFixed(3)),
    vatEnabled: input.vatEnabled,
    vatRate: "5.00",
    vatAmount: String(vatAmount.toFixed(3)),
    totalAmount: String(totalAmount.toFixed(3)),
    paymentStatus: input.paymentStatus as any,
    paidAmount: String((input.paidAmount ?? 0).toFixed(3)),
    remainingAmount: input.paymentStatus === "paid" ? "0.000" : String(totalAmount.toFixed(3)),
    notes: input.notes,
    expenseCategory: input.expenseCategory ?? "other",
    stockUpdated: true,
    createdBy: input.createdBy,
  });
  const invoiceId = (invoiceResult as any).insertId as number;

  // Insert line items and update stock
  for (const item of input.items) {
    const itemTotal = item.quantity * item.unitPrice;
    await db.insert(invoiceItems).values({
      invoiceId,
      materialId: item.materialId,
      materialName: item.materialName,
      materialUnit: item.materialUnit,
      quantity: String(item.quantity.toFixed(3)),
      unitPrice: String(item.unitPrice.toFixed(3)),
      totalPrice: String(itemTotal.toFixed(3)),
    });

    // Update stock: increase currentQuantity and update lastPurchasePrice + averageCost
    const [mat] = await db.select({
      currentQuantity: rawMaterials.currentQuantity,
      averageCost: rawMaterials.averageCost,
    }).from(rawMaterials).where(eq(rawMaterials.id, item.materialId)).limit(1);

    if (mat) {
      const oldQty = parseFloat(mat.currentQuantity);
      const oldAvg = parseFloat(mat.averageCost || "0");
      const newQty = oldQty + item.quantity;
      const newAvg = newQty > 0 ? ((oldQty * oldAvg) + (item.quantity * item.unitPrice)) / newQty : item.unitPrice;

      await db.update(rawMaterials).set({
        currentQuantity: String(newQty.toFixed(3)),
        lastPurchasePrice: String(item.unitPrice.toFixed(3)),
        averageCost: String(newAvg.toFixed(3)),
        updatedAt: new Date(),
      }).where(eq(rawMaterials.id, item.materialId));
    }

    // Create inventory transaction record
    await db.insert(inventoryTransactions).values(clean({
      materialId: item.materialId,
      transactionType: "IN",
      quantity: String(item.quantity.toFixed(3)),
      unitPrice: String(item.unitPrice.toFixed(3)),
      totalAmount: String(itemTotal.toFixed(3)),
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      reason: "purchase",
      referenceNumber: invoiceNumber,
      transactionDate: input.invoiceDate,
      notes: `فاتورة رقم ${invoiceNumber}`,
      createdBy: input.createdBy,
}) as any);
  }

  return { invoiceId, invoiceNumber };
}

export async function listInvoices(filters?: {
  paymentStatus?: "paid" | "deferred" | "partial" | "under_review";
  supplierId?: number;
  limit?: number;
  dateFrom?: Date;
  dateTo?: Date;
  month?: string; // "YYYY-MM"
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.paymentStatus) conditions.push(eq(invoices.paymentStatus, filters.paymentStatus as any));
  if (filters?.supplierId) conditions.push(eq(invoices.supplierId, filters.supplierId));
  if (filters?.dateFrom) conditions.push(gte(invoices.invoiceDate, filters.dateFrom));
  if (filters?.dateTo) {
    // Use UTC end of day to match how invoiceDate is stored
    const d = new Date(filters.dateTo);
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
    conditions.push(lte(invoices.invoiceDate, end));
  }
  if (filters?.month) {
    const [y, m] = filters.month.split("-").map(Number);
    // Use UTC boundaries to match how invoiceDate is stored (new Date(dateString) = UTC midnight)
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    conditions.push(gte(invoices.invoiceDate, start));
    conditions.push(lte(invoices.invoiceDate, end));
  }

  const invoiceList = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      supplierId: invoices.supplierId,
      supplierName: invoices.supplierName,
      invoiceDate: invoices.invoiceDate,
      subtotal: invoices.subtotal,
      vatEnabled: invoices.vatEnabled,
      vatAmount: invoices.vatAmount,
      totalAmount: invoices.totalAmount,
      paymentStatus: invoices.paymentStatus,
      paidAmount: invoices.paidAmount,
      paidAt: invoices.paidAt,
      notes: invoices.notes,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoices.invoiceDate))
    .limit(filters?.limit ?? 200);

  if (invoiceList.length === 0) return [];

  // Batch-fetch payment history for all invoices in one query
  const ids = invoiceList.map(i => i.id);
  const allPayments = await db
    .select()
    .from(invoicePaymentHistory)
    .where(and(
      inArray(invoicePaymentHistory.invoiceId, ids),
      eq(invoicePaymentHistory.invoiceType, "supplier")
    ))
    .orderBy(invoicePaymentHistory.paymentDate);

  const historyMap = new Map<number, typeof allPayments>();
  for (const ph of allPayments) {
    if (!historyMap.has(ph.invoiceId)) historyMap.set(ph.invoiceId, []);
    historyMap.get(ph.invoiceId)!.push(ph);
  }

  return invoiceList.map(inv => ({
    ...inv,
    paymentHistory: historyMap.get(inv.id) ?? [],
  }));
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);

  if (!invoice) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id));

  const paymentHistory = await db
    .select()
    .from(invoicePaymentHistory)
    .where(
      and(
        eq(invoicePaymentHistory.invoiceId, id),
        eq(invoicePaymentHistory.invoiceType, "supplier")
      )
    )
    .orderBy(invoicePaymentHistory.paymentDate);

  return { ...invoice, items, paymentHistory };
}

export async function updateInvoiceStatus(
  id: number,
  paymentStatus: "paid" | "deferred" | "partial" | "under_review",
  paidAmount?: number,
  paidAt?: Date,
  paymentOpts?: { paymentMethod?: string; paymentAccount?: string; referenceNumber?: string; createdBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();

  // جلب الفاتورة الحالية لحساب القيم المتراكمة
  const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!existing) throw new Error("Invoice not found");

  const totalAmount = parseFloat(existing.totalAmount ?? "0");
  const prevPaid = parseFloat(existing.paidAmount ?? "0");

  // حالة التدقيق: لا تغيير في القيم المالية - فقط تغيير الحالة
  if (paymentStatus === "under_review") {
    await (db.update(invoices) as any).set({
      paymentStatus: "under_review",
      updatedAt: now,
    }).where(eq(invoices.id, id));
    return;
  }

  // استخدام paidAt اليدوي إذا كان محدداً ولا يتجاوز الوقت الحالي
  const effectivePaidAt = (paymentStatus === "paid" || paymentStatus === "partial")
    ? (paidAt && paidAt <= now ? paidAt : now)
    : undefined;

  let newPaidAmount: number;
  let newRemainingAmount: number;

  if (paymentStatus === "paid") {
    // دفع كامل: المدفوع = إجمالي الفاتورة، المتبقي = 0
    newPaidAmount = totalAmount;
    newRemainingAmount = 0;
  } else if (paymentStatus === "partial" && paidAmount !== undefined) {
    // دفع جزئي: يُضاف المبلغ الجديد إلى ما سبق دفعه
    newPaidAmount = prevPaid + paidAmount;
    newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
    // إذا أصبح المتبقي = 0 نغيّر الحالة إلى paid
    if (newRemainingAmount === 0) {
      paymentStatus = "paid";
    }
  } else if (paymentStatus === "deferred") {
    // تأجيل: المدفوع = 0، المتبقي = إجمالي الفاتورة
    newPaidAmount = 0;
    newRemainingAmount = totalAmount;
  } else {
    newPaidAmount = paidAmount ?? prevPaid;
    newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
  }

  await (db.update(invoices) as any).set({
    paymentStatus,
    paidAmount: String(newPaidAmount.toFixed(3)),
    remainingAmount: String(newRemainingAmount.toFixed(3)),
    paidAt: effectivePaidAt,
    updatedAt: now,
  }).where(eq(invoices.id, id));

  // حفظ سجل الدفع للدفعات الجزئية والكاملة
  if ((paymentStatus === "partial" || paymentStatus === "paid") && paidAmount !== undefined && paidAmount > 0) {
    await db.insert(invoicePaymentHistory).values({
      invoiceId: id,
      invoiceType: "supplier",
      paymentDate: effectivePaidAt ?? now,
      paidAmount: String(paidAmount.toFixed(3)),
      paymentType: paymentStatus === "paid" && prevPaid === 0 ? "paid" : "partial",
      paymentMethod: (paymentOpts?.paymentMethod ?? "cash") as any,
      paymentAccount: paymentOpts?.paymentAccount,
      referenceNumber: paymentOpts?.referenceNumber,
      createdBy: paymentOpts?.createdBy,
    });
  } else if (paymentStatus === "paid" && paidAmount === undefined) {
    await db.insert(invoicePaymentHistory).values({
      invoiceId: id,
      invoiceType: "supplier",
      paymentDate: effectivePaidAt ?? now,
      paidAmount: String(totalAmount.toFixed(3)),
      paymentType: "paid",
      paymentMethod: (paymentOpts?.paymentMethod ?? "cash") as any,
      paymentAccount: paymentOpts?.paymentAccount,
      referenceNumber: paymentOpts?.referenceNumber,
      createdBy: paymentOpts?.createdBy,
    });
  }

  return { success: true };
}

// ─── Invoice Audit Log ────────────────────────────────────────────────────────

export async function logInvoiceAction(params: {
  invoiceId: number;
  invoiceType: "supplier" | "free";
  invoiceNumber?: string;
  action: string;
  userId?: number;
  userName?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(invoiceAuditLog).values({
      invoiceId: params.invoiceId,
      invoiceType: params.invoiceType,
      invoiceNumber: params.invoiceNumber,
      action: params.action,
      userId: params.userId,
      userName: params.userName,
      notes: params.notes,
      metadata: params.metadata as any,
    });
  } catch (e) {
    console.error("[audit] failed to log:", e);
  }
}

export async function getInvoiceAuditLog(invoiceId: number, invoiceType: "supplier" | "free") {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(invoiceAuditLog)
    .where(and(eq(invoiceAuditLog.invoiceId, invoiceId), eq(invoiceAuditLog.invoiceType, invoiceType)))
    .orderBy(desc(invoiceAuditLog.createdAt));
}

// ─── Inventory Posting ────────────────────────────────────────────────────────

/** Post supplier invoice items to inventory stock (when invoice is approved) */
export async function postInvoiceToInventory(invoiceId: number, userId?: number): Promise<{ posted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) throw new Error("Invoice not found");
  if (inv.stockUpdated) throw new Error("تم ترحيل هذه الفاتورة للمخزون مسبقاً");
  if (inv.invoiceStatus !== "approved") throw new Error("يجب اعتماد الفاتورة قبل الترحيل للمخزون");

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  if (!items.length) throw new Error("الفاتورة لا تحتوي على بنود");

  let posted = 0;
  for (const item of items) {
    if (!item.materialId) continue;
    const qty = parseFloat(item.quantity as string) || 0;
    const price = parseFloat(item.unitPrice as string) || 0;
    if (qty <= 0) continue;

    await createTransaction({
      materialId: item.materialId,
      transactionType: "IN",
      quantity: String(qty),
      unitPrice: price > 0 ? String(price) : undefined,
      totalAmount: price > 0 ? String(qty * price) : undefined,
      reason: "purchase",
      referenceNumber: inv.invoiceNumber,
      notes: `ترحيل فاتورة ${inv.invoiceNumber}`,
      transactionDate: new Date(inv.invoiceDate),
      createdBy: userId,
    });
    posted++;
  }

  // Mark as posted
  await db.update(invoices).set({ stockUpdated: true, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));

  // Log the action
  await logInvoiceAction({
    invoiceId, invoiceType: "supplier",
    invoiceNumber: inv.invoiceNumber,
    action: "inventory_posted",
    userId,
    notes: `تم ترحيل ${posted} بند للمخزون`,
  });

  return { posted };
}

/** Void a payment (instead of deleting) — recalculates invoice payment totals */
export async function voidInvoicePayment(paymentId: number, invoiceId: number, invoiceType: "supplier" | "free", voidReason: string, voidedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [payment] = await db.select().from(invoicePaymentHistory).where(eq(invoicePaymentHistory.id, paymentId)).limit(1);
  if (!payment) throw new Error("Payment not found");
  if (payment.isVoided) throw new Error("الدفعة مُلغاة بالفعل");

  // Mark voided
  await db.update(invoicePaymentHistory).set({
    isVoided: true,
    voidReason,
    voidedAt: new Date(),
  }).where(eq(invoicePaymentHistory.id, paymentId));

  // Recalculate paid total from non-voided payments
  const allPayments = await db.select({ paidAmount: invoicePaymentHistory.paidAmount })
    .from(invoicePaymentHistory)
    .where(and(
      eq(invoicePaymentHistory.invoiceId, invoiceId),
      eq(invoicePaymentHistory.invoiceType, invoiceType)
    ));
  const newPaid = allPayments
    .filter((_: any, i: number) => i !== allPayments.findIndex((p: any) => p === _) || true) // all
    .reduce((s: number, p: any) => s + (parseFloat(p.paidAmount) || 0), 0);

  // Re-query non-voided
  const nonVoided = await db.select({ paidAmount: invoicePaymentHistory.paidAmount })
    .from(invoicePaymentHistory)
    .where(and(
      eq(invoicePaymentHistory.invoiceId, invoiceId),
      eq(invoicePaymentHistory.invoiceType, invoiceType),
      eq(invoicePaymentHistory.isVoided, false)
    ));
  const actualPaid = nonVoided.reduce((s: number, p: any) => s + (parseFloat(p.paidAmount) || 0), 0);

  const table = invoiceType === "supplier" ? invoices : freeInvoices;
  const [inv] = await db.select({ totalAmount: (table as any).totalAmount }).from(table as any).where(eq((table as any).id, invoiceId)).limit(1);
  const total = parseFloat((inv as any)?.totalAmount ?? "0");
  const remaining = Math.max(0, total - actualPaid);
  const newStatus = actualPaid <= 0 ? "deferred" : actualPaid >= total ? "paid" : "partial";

  await (db.update(table as any) as any).set({
    paidAmount: String(actualPaid.toFixed(3)),
    remainingAmount: String(remaining.toFixed(3)),
    paymentStatus: newStatus,
    updatedAt: new Date(),
  }).where(eq((table as any).id, invoiceId));

  return { success: true };
}

export async function deleteInvoice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // invoice_items will cascade delete
  await db.delete(invoices).where(eq(invoices.id, id));
  return { success: true };
}

/** حذف دفعة من سجل الدفعات وتحديث الفاتورة تلقائياً */
export async function deleteInvoicePayment(paymentId: number, invoiceType: "supplier" | "free") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. جلب بيانات الدفعة
  const [payment] = await db
    .select()
    .from(invoicePaymentHistory)
    .where(eq(invoicePaymentHistory.id, paymentId))
    .limit(1);
  if (!payment) throw new Error("Payment not found");

  const invoiceId = payment.invoiceId;
  const removedAmount = parseFloat(payment.paidAmount ?? "0");

  // 2. حذف سجل الدفعة
  await db.delete(invoicePaymentHistory).where(eq(invoicePaymentHistory.id, paymentId));

  // 3. جلب آخر دفعة متبقية لتحديث paidAt
  const remainingPayments = await db
    .select()
    .from(invoicePaymentHistory)
    .where(
      and(
        eq(invoicePaymentHistory.invoiceId, invoiceId),
        eq(invoicePaymentHistory.invoiceType, invoiceType)
      )
    )
    .orderBy(invoicePaymentHistory.paymentDate);
  // آخر دفعة متبقية (أحدث تاريخ)
  const lastPayment = remainingPayments.length > 0
    ? remainingPayments[remainingPayments.length - 1]
    : null;
  const newPaidAt = lastPayment ? lastPayment.paymentDate : null;

  // 4. جلب الفاتورة وتحديث المبالغ
  if (invoiceType === "supplier") {
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!inv) throw new Error("Invoice not found");
    const totalAmount = parseFloat(inv.totalAmount ?? "0");
    const newPaid = Math.max(0, parseFloat(inv.paidAmount ?? "0") - removedAmount);
    const newRemaining = Math.max(0, totalAmount - newPaid);
    const newStatus: "paid" | "partial" | "deferred" = newPaid <= 0 ? "deferred" : newRemaining <= 0 ? "paid" : "partial";
    await (db.update(invoices) as any).set({
      paidAmount: String(newPaid.toFixed(3)),
      remainingAmount: String(newRemaining.toFixed(3)),
      paymentStatus: newStatus,
      paidAt: newPaidAt,
      updatedAt: new Date(),
    }).where(eq(invoices.id, invoiceId));
  } else {
    const [inv] = await db.select().from(freeInvoices).where(eq(freeInvoices.id, invoiceId)).limit(1);
    if (!inv) throw new Error("Free invoice not found");
    const totalAmount = parseFloat(inv.totalAmount ?? "0");
    const newPaid = Math.max(0, parseFloat(inv.paidAmount ?? "0") - removedAmount);
    const newRemaining = Math.max(0, totalAmount - newPaid);
    const newStatus: "paid" | "partial" | "deferred" = newPaid <= 0 ? "deferred" : newRemaining <= 0 ? "paid" : "partial";
    await (db.update(freeInvoices) as any).set({
      paidAmount: String(newPaid.toFixed(3)),
      remainingAmount: String(newRemaining.toFixed(3)),
      paymentStatus: newStatus,
      paidAt: newPaidAt,
      updatedAt: new Date(),
    }).where(eq(freeInvoices.id, invoiceId));
  }

  return { success: true };
}

export interface UpdateInvoiceInput {
  id: number;
  supplierId?: number;
  supplierName?: string;
  invoiceDate: Date;
  vatEnabled: boolean;
  paymentStatus: "paid" | "deferred" | "partial" | "under_review";
  paidAmount?: number;
  notes?: string;
  expenseCategory?: "operational" | "maintenance" | "fixed" | "other";
  updatedBy: number;
  items: Array<{
    materialId: number;
    materialName: string;
    materialUnit: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export async function updateInvoice(input: UpdateInvoiceInput) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. Fetch existing invoice to get invoiceNumber and old items
  const [existingInvoice] = await db.select().from(invoices).where(eq(invoices.id, input.id)).limit(1);
  if (!existingInvoice) throw new Error("Invoice not found");

  const invoiceNumber = existingInvoice.invoiceNumber;

  // 2. Fetch old items to reverse their stock effect
  const oldItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));

  // 3. Reverse old stock: subtract old quantities from materials
  for (const oldItem of oldItems) {
    const oldQty = parseFloat(oldItem.quantity);
    const [mat] = await db.select({
      currentQuantity: rawMaterials.currentQuantity,
      averageCost: rawMaterials.averageCost,
    }).from(rawMaterials).where(eq(rawMaterials.id, oldItem.materialId)).limit(1);

    if (mat) {
      const newQty = Math.max(0, parseFloat(mat.currentQuantity) - oldQty);
      await db.update(rawMaterials).set({
        currentQuantity: String(newQty.toFixed(3)),
        updatedAt: new Date(),
      }).where(eq(rawMaterials.id, oldItem.materialId));
    }
  }

  // 4. Delete old invoice items and old inventory transactions for this invoice
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, input.id));
  await db.delete(inventoryTransactions).where(eq(inventoryTransactions.referenceNumber, invoiceNumber));

  // 5. Recalculate totals with new items
  const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = input.vatEnabled ? subtotal * 0.05 : 0;
  const totalAmount = subtotal + vatAmount;

  // 6. Update invoice header
  const now = new Date();
  // حفظ paidAt: إذا كانت الفاتورة مدفوعة أو جزئية، احتفظ بالقيمة القديمة إذا كانت موجودة، وإلا استخدم الوقت الحالي
  const isPaidNow = input.paymentStatus === 'paid' || input.paymentStatus === 'partial';
  const newPaidAt = isPaidNow ? (existingInvoice.paidAt ?? now) : null;
  await db.update(invoices).set({
    supplierId: input.supplierId ?? null,
    supplierName: input.supplierName ?? null,
    invoiceDate: input.invoiceDate,
    subtotal: String(subtotal.toFixed(3)),
    vatEnabled: input.vatEnabled,
    vatRate: "5.00",
    vatAmount: String(vatAmount.toFixed(3)),
    totalAmount: String(totalAmount.toFixed(3)),
    paymentStatus: input.paymentStatus as any,
    paidAmount: String((input.paidAmount ?? 0).toFixed(3)),
    paidAt: newPaidAt,
    notes: input.notes ?? null,
    expenseCategory: input.expenseCategory ?? "other",
    updatedAt: now,
  }).where(eq(invoices.id, input.id));

  // 7. Insert new items and apply new stock
  for (const item of input.items) {
    const itemTotal = item.quantity * item.unitPrice;
    await db.insert(invoiceItems).values({
      invoiceId: input.id,
      materialId: item.materialId,
      materialName: item.materialName,
      materialUnit: item.materialUnit,
      quantity: String(item.quantity.toFixed(3)),
      unitPrice: String(item.unitPrice.toFixed(3)),
      totalPrice: String(itemTotal.toFixed(3)),
    });

    // Update stock: increase currentQuantity and update lastPurchasePrice + averageCost
    const [mat] = await db.select({
      currentQuantity: rawMaterials.currentQuantity,
      averageCost: rawMaterials.averageCost,
    }).from(rawMaterials).where(eq(rawMaterials.id, item.materialId)).limit(1);

    if (mat) {
      const oldQty = parseFloat(mat.currentQuantity);
      const oldAvg = parseFloat(mat.averageCost || "0");
      const newQty = oldQty + item.quantity;
      const newAvg = newQty > 0 ? ((oldQty * oldAvg) + (item.quantity * item.unitPrice)) / newQty : item.unitPrice;

      await db.update(rawMaterials).set({
        currentQuantity: String(newQty.toFixed(3)),
        lastPurchasePrice: String(item.unitPrice.toFixed(3)),
        averageCost: String(newAvg.toFixed(3)),
        updatedAt: new Date(),
      }).where(eq(rawMaterials.id, item.materialId));
    }

    // Create new inventory transaction
    await db.insert(inventoryTransactions).values(clean({
      materialId: item.materialId,
      transactionType: "IN",
      quantity: String(item.quantity.toFixed(3)),
      unitPrice: String(item.unitPrice.toFixed(3)),
      totalAmount: String(itemTotal.toFixed(3)),
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      reason: "purchase",
      referenceNumber: invoiceNumber,
      transactionDate: input.invoiceDate,
      notes: `تعديل فاتورة رقم ${invoiceNumber}`,
      createdBy: input.updatedBy,
}) as any);
  }

  return { invoiceId: input.id, invoiceNumber };
}

// ─── Delete Transaction (Admin Only) ─────────────────────────────────────────

export async function deleteTransaction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Fetch the transaction first to reverse the stock effect
  const [tx] = await db
    .select()
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.id, id))
    .limit(1);
  if (!tx) throw new Error("Transaction not found");

  // ─── SAFETY GUARD ────────────────────────────────────────────────────────────
  // Prevent deletion of auto-generated transactions that are managed by other
  // workflows (production, kitchen pulls, waste logs, end-of-day counts).
  // Deleting these directly would corrupt inventory balances because the
  // originating workflow already handles the stock adjustment.
  const protectedReasons = ["production", "waste", "other"];
  if (protectedReasons.includes(tx.reason ?? "")) {
    throw new Error(
      "لا يمكن حذف هذه المعاملة مباشرة. يتم إدارتها تلقائياً من خلال نظام الإنتاج أو الجرد أو الهدر. استخدم التراجع عن الجرد أو حذف سجل الهدر بدلاً من ذلك."
    );
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const qty = parseFloat(tx.quantity as string);
  // Reverse the stock change
  if (tx.transactionType === "IN") {
    // Was an IN → subtract back
    await db
      .update(rawMaterials)
      .set({ currentQuantity: sql`currentQuantity - ${qty}`, updatedAt: new Date() })
      .where(eq(rawMaterials.id, tx.materialId));
  } else if (tx.transactionType === "OUT") {
    // Was an OUT → add back
    await db
      .update(rawMaterials)
      .set({ currentQuantity: sql`currentQuantity + ${qty}`, updatedAt: new Date() })
      .where(eq(rawMaterials.id, tx.materialId));
  }
  // Delete the transaction record
  await db.delete(inventoryTransactions).where(eq(inventoryTransactions.id, id));
  return { success: true };
}

/** Reverse a posted transaction — creates an opposite movement and marks original as reversed */
export async function reverseTransaction(id: number, reason: string, createdBy?: number): Promise<{ reversingId: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [tx] = await db.select().from(inventoryTransactions).where(eq(inventoryTransactions.id, id)).limit(1);
  if (!tx) throw new Error("Transaction not found");
  if (tx.movementStatus === "reversed") throw new Error("هذه الحركة مُعكوسة بالفعل");
  if (tx.movementStatus === "cancelled") throw new Error("هذه الحركة ملغاة");

  // Create opposite transaction
  const reversingType = tx.transactionType === "IN" ? "OUT" : tx.transactionType === "OUT" ? "IN" : "ADJUSTMENT";
  const [result] = await db.insert(inventoryTransactions).values(clean({
    materialId: tx.materialId,
    transactionType: reversingType as any,
    quantity: tx.quantity,
    unitPrice: tx.unitPrice ?? undefined,
    totalAmount: tx.totalAmount ?? undefined,
    reason: "adjustment" as any,
    movementStatus: "posted" as any,
    referenceNumber: `REV-${tx.id}`,
    referenceType: "reversal",
    reversingTransactionId: id,
    notes: `[عكس حركة #${id}] ${reason}`,
    transactionDate: new Date(),
    createdBy,
}) as any);
  const reversingId = (result as any).insertId as number;

  // Apply stock effect
  const qty = parseFloat(tx.quantity as string);
  if (tx.materialId) {
    if (reversingType === "IN") {
      await db.update(rawMaterials).set({ currentQuantity: sql`currentQuantity + ${qty}`, updatedAt: new Date() }).where(eq(rawMaterials.id, tx.materialId));
    } else if (reversingType === "OUT") {
      await db.update(rawMaterials).set({ currentQuantity: sql`currentQuantity - ${qty}`, updatedAt: new Date() }).where(eq(rawMaterials.id, tx.materialId));
    }
  }

  // Mark original as reversed
  await db.update(inventoryTransactions).set({
    movementStatus: "reversed" as any,
    reversingTransactionId: reversingId,
  }).where(eq(inventoryTransactions.id, id));

  return { reversingId };
}

// ─── Kitchen Daily Production ─────────────────────────────────────────────────────────────────────────────
/** Get stock-OUT transactions for a given date (only materials actually withdrawn that day) */
export async function getWithdrawnMaterialsForDate(date: Date) {
  const db = await getDb();
  if (!db) return [];
  // Business day offset is dynamic (read from app_settings).
  const tzOffset = await getBusinessDayTzOffset();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const rows = await db
    .select({
      materialId: inventoryTransactions.materialId,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      withdrawnQty: sql<string>`SUM(${inventoryTransactions.quantity})`,
      wasteQty: sql<string>`0`,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    })
    .from(inventoryTransactions)
    .innerJoin(rawMaterials, eq(inventoryTransactions.materialId, rawMaterials.id))
    .where(
      and(
        eq(inventoryTransactions.transactionType, "OUT"),
        sql`DATE(CONVERT_TZ(${inventoryTransactions.transactionDate}, '+00:00', ${tzOffset})) = ${dateStr}`
      )
    )
    .groupBy(inventoryTransactions.materialId, rawMaterials.name, rawMaterials.nameAr, rawMaterials.unit, rawMaterials.lastPurchasePrice);
  return rows;
}

/** Get kitchen production records for a specific date */
export async function getKitchenProductionForDate(date: Date) {
  const db = await getDb();
  if (!db) return [];
  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0));
  const end = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59));

  const productions = await db
    .select()
    .from(kitchenDailyProduction)
    .where(
      and(
        gte(kitchenDailyProduction.productionDate, start),
        lte(kitchenDailyProduction.productionDate, end)
      )
    )
    .orderBy(kitchenDailyProduction.productName);

  // Attach consumed materials (with lastPurchasePrice) for each production record
  const result = await Promise.all(
    productions.map(async (p) => {
      const materials = await db
        .select({
          id: kitchenProductionMaterials.id,
          productionId: kitchenProductionMaterials.productionId,
          rawMaterialId: kitchenProductionMaterials.rawMaterialId,
          materialName: kitchenProductionMaterials.materialName,
          unit: kitchenProductionMaterials.unit,
          consumedQuantity: kitchenProductionMaterials.consumedQuantity,
          wasteQty: kitchenProductionMaterials.wasteQty,
          lastPurchasePrice: rawMaterials.lastPurchasePrice,
        })
        .from(kitchenProductionMaterials)
        .leftJoin(rawMaterials, eq(kitchenProductionMaterials.rawMaterialId, rawMaterials.id))
        .where(eq(kitchenProductionMaterials.productionId, p.id));
      return { ...p, materials };
    })
  );
  return result;
}

/** Get consumed quantities per material for a given date (from kitchen production) */
export async function getConsumedMaterialsForDate(date: Date) {
  const db = await getDb();
  if (!db) return [];
  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0));
  const end = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59));

  const rows = await db
    .select({
      rawMaterialId: kitchenProductionMaterials.rawMaterialId,
      totalConsumed: sql<string>`SUM(${kitchenProductionMaterials.consumedQuantity})`,
    })
    .from(kitchenProductionMaterials)
    .innerJoin(kitchenDailyProduction, eq(kitchenProductionMaterials.productionId, kitchenDailyProduction.id))
    .where(
      and(
        gte(kitchenDailyProduction.productionDate, start),
        lte(kitchenDailyProduction.productionDate, end)
      )
    )
    .groupBy(kitchenProductionMaterials.rawMaterialId);

  return rows;
}

/** Save a new kitchen production entry for a date */
export async function saveKitchenProduction(data: {
  productionDate: Date;
  productName: string;
  productNameAr?: string;
  unit: string;
  producedQuantity: number;
  notes?: string;
  actualUnitCost?: number;
  materials: { rawMaterialId: number; materialName: string; unit: string; consumedQuantity: number; wasteQty?: number }[];
  createdBy: number;
  // wasteQty is stored in kitchen_production_materials, NOT in inventory_transactions
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Get opening balance = closing balance of previous day for this product
  const prevDay = new Date(data.productionDate);
  prevDay.setDate(prevDay.getDate() - 1);
  const prevStart = new Date(Date.UTC(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 0, 0, 0));
  const prevEnd = new Date(Date.UTC(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 23, 59, 59));

  const prevRows = await db
    .select({ closingBalance: kitchenDailyProduction.closingBalance })
    .from(kitchenDailyProduction)
    .where(
      and(
        eq(kitchenDailyProduction.productName, data.productName),
        gte(kitchenDailyProduction.productionDate, prevStart),
        lte(kitchenDailyProduction.productionDate, prevEnd)
      )
    )
    .limit(1);

  const openingBalance = prevRows.length > 0 ? parseFloat(prevRows[0].closingBalance as string) : 0;
  const closingBalance = openingBalance + data.producedQuantity;

  // Insert production record
  const [result] = await db.insert(kitchenDailyProduction).values({
    productionDate: data.productionDate,
    productName: data.productName,
    productNameAr: data.productNameAr,
    unit: data.unit,
    openingBalance: openingBalance.toString(),
    producedQuantity: data.producedQuantity.toString(),
    usedQuantity: "0",
    closingBalance: closingBalance.toString(),
    actualUnitCost: data.actualUnitCost != null ? data.actualUnitCost.toString() : undefined,
    notes: data.notes,
    createdBy: data.createdBy,
  });

  const productionId = (result as any).insertId as number;

  // Insert consumed materials (wasteQty stored here, NOT in inventory_transactions)
  if (data.materials.length > 0) {
    await db.insert(kitchenProductionMaterials).values(
      data.materials.map((m) => ({
        productionId,
        rawMaterialId: m.rawMaterialId,
        materialName: m.materialName,
        unit: m.unit,
        consumedQuantity: m.consumedQuantity.toString(),
        wasteQty: (m.wasteQty ?? 0).toString(),
      }))
    );
  }

  return { id: productionId, openingBalance, closingBalance };
}

/** Update usedQuantity for a kitchen production record and recalculate closing balance */
export async function updateKitchenProductionUsed(productionId: number, usedQuantity: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [prod] = await db
    .select()
    .from(kitchenDailyProduction)
    .where(eq(kitchenDailyProduction.id, productionId))
    .limit(1);

  if (!prod) throw new Error("Production record not found");

  const opening = parseFloat(prod.openingBalance as string);
  const produced = parseFloat(prod.producedQuantity as string);
  const closing = opening + produced - usedQuantity;

  await db
    .update(kitchenDailyProduction)
    .set({ usedQuantity: usedQuantity.toString(), closingBalance: closing.toString(), updatedAt: new Date() })
    .where(eq(kitchenDailyProduction.id, productionId));

  return { closingBalance: closing };
}

/** Update both producedQuantity and usedQuantity for a kitchen production record */
export async function updateKitchenProduction(productionId: number, producedQuantity: number, usedQuantity: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [prod] = await db
    .select()
    .from(kitchenDailyProduction)
    .where(eq(kitchenDailyProduction.id, productionId))
    .limit(1);
  if (!prod) throw new Error("Production record not found");
  const opening = parseFloat(prod.openingBalance as string);
  const closing = opening + producedQuantity - usedQuantity;
  await db
    .update(kitchenDailyProduction)
    .set({
      producedQuantity: producedQuantity.toString(),
      usedQuantity: usedQuantity.toString(),
      closingBalance: closing.toString(),
      updatedAt: new Date(),
    })
    .where(eq(kitchenDailyProduction.id, productionId));
  return { closingBalance: closing };
}

/** Delete a kitchen production record and its materials */
export async function deleteKitchenProduction(productionId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(kitchenDailyProduction).where(eq(kitchenDailyProduction.id, productionId));
  return { success: true };
}

/** Save an inventory count (جرد) for a production record */
export async function saveProductionCount(data: {
  productionId: number;
  actualCount: number;
  notes?: string;
  countedBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Upsert: delete existing count for this production then insert new one
  await db.delete(kitchenProductionCounts).where(eq(kitchenProductionCounts.productionId, data.productionId));
  const result = await db.insert(kitchenProductionCounts).values({
    productionId: data.productionId,
    actualCount: data.actualCount.toString(),
    notes: data.notes,
    countedBy: data.countedBy,
    countedAt: new Date(),
  });
  return { id: (result as any).insertId as number, actualCount: data.actualCount };
}

/** Get inventory counts for a list of production IDs */
export async function getProductionCounts(productionIds: number[]) {
  if (productionIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(kitchenProductionCounts)
    .where(inArray(kitchenProductionCounts.productionId, productionIds));
}

// ─── Monthly Waste Report ─────────────────────────────────────────────────────
/** Get monthly waste report: waste per material vs total withdrawn, with percentage */
export async function getMonthlyWasteReport(year: number, month: number) {
  const db = await getDb();
  if (!db) return { rows: [], summary: { totalWasteQty: 0, totalWithdrawnQty: 0, avgWastePct: 0, topWastedMaterial: null as string | null } };

  // First day and last day of the month (UTC)
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59)); // last day of month

  // Get all OUT transactions for the month grouped by material
  const allOut = await db
    .select({
      materialId: inventoryTransactions.materialId,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      reason: inventoryTransactions.reason,
      totalQty: sql<string>`SUM(${inventoryTransactions.quantity})`,
    })
    .from(inventoryTransactions)
    .innerJoin(rawMaterials, eq(inventoryTransactions.materialId, rawMaterials.id))
    .where(
      and(
        eq(inventoryTransactions.transactionType, "OUT"),
        gte(inventoryTransactions.transactionDate, startDate),
        lte(inventoryTransactions.transactionDate, endDate)
      )
    )
    .groupBy(inventoryTransactions.materialId, rawMaterials.name, rawMaterials.nameAr, rawMaterials.unit, inventoryTransactions.reason);

  // Aggregate per material
  const materialMap = new Map<number, {
    materialId: number;
    materialName: string;
    materialNameAr: string | null;
    unit: string;
    totalWithdrawn: number;
    totalWaste: number;
  }>();

  for (const row of allOut) {
    const qty = parseFloat(row.totalQty || "0");
    if (!materialMap.has(row.materialId)) {
      materialMap.set(row.materialId, {
        materialId: row.materialId,
        materialName: row.materialName,
        materialNameAr: row.materialNameAr,
        unit: row.unit,
        totalWithdrawn: 0,
        totalWaste: 0,
      });
    }
    const entry = materialMap.get(row.materialId)!;
    entry.totalWithdrawn += qty;
    if (row.reason === "waste") {
      entry.totalWaste += qty;
    }
  }

  const rows = Array.from(materialMap.values())
    .filter((r) => r.totalWithdrawn > 0)
    .map((r) => ({
      ...r,
      wastePct: r.totalWithdrawn > 0 ? (r.totalWaste / r.totalWithdrawn) * 100 : 0,
    }))
    .sort((a, b) => b.wastePct - a.wastePct);

  // Summary
  const totalWasteQty = rows.reduce((s, r) => s + r.totalWaste, 0);
  const totalWithdrawnQty = rows.reduce((s, r) => s + r.totalWithdrawn, 0);
  const avgWastePct = totalWithdrawnQty > 0 ? (totalWasteQty / totalWithdrawnQty) * 100 : 0;
  const topWastedMaterial = rows.length > 0 ? rows[0].materialName : null;

  return { rows, summary: { totalWasteQty, totalWithdrawnQty, avgWastePct, topWastedMaterial } };
}

/** Get all kitchen products (for combobox autocomplete) */
export async function getKitchenProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(kitchenProducts).orderBy(kitchenProducts.name);
}

/** Upsert a kitchen product by name (insert if not exists, return existing if duplicate) */
export async function upsertKitchenProduct(data: { name: string; nameAr?: string; unit: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Check if already exists
  const existing = await db
    .select()
    .from(kitchenProducts)
    .where(eq(kitchenProducts.name, data.name))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const [result] = await db.insert(kitchenProducts).values({
    name: data.name,
    nameAr: data.nameAr,
    unit: data.unit,
  });
  const id = (result as any).insertId as number;
  return { id, name: data.name, nameAr: data.nameAr ?? null, unit: data.unit };
}

// ─── Products (Menu Items) ────────────────────────────────────────────────────
export async function listProducts(isActive?: boolean) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(products);
  if (isActive !== undefined) {
    return q.where(eq(products.isActive, isActive)).orderBy(products.name);
  }
  return q.orderBy(products.name);
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createProduct(data: {
  name: string;
  nameAr?: string;
  sku: string;
  categoryReference?: string;
  price?: string;
  cost?: string;
  description?: string;
  calories?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(products).values({
    name: data.name,
    nameAr: data.nameAr,
    sku: data.sku,
    categoryReference: data.categoryReference,
    price: data.price,
    cost: data.cost,
    description: data.description,
    calories: data.calories,
  });
  const id = (result as any).insertId as number;
  return getProductById(id);
}

export async function updateProduct(id: number, data: Partial<{
  name: string;
  nameAr: string;
  sku: string;
  categoryReference: string;
  price: string;
  cost: string;
  description: string;
  calories: number;
  isActive: boolean;
  showInMenu: boolean;
  recipeSource: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(products).set(data).where(eq(products.id, id));
  return getProductById(id);
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(products).where(eq(products.id, id));
  return { success: true };
}

// ─── Recipe Items ─────────────────────────────────────────────────────────────
export async function getRecipeItems(productId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: recipeItems.id,
      productId: recipeItems.productId,
      materialId: recipeItems.materialId,
      quantity: recipeItems.quantity,
      unit: recipeItems.unit,
      notes: recipeItems.notes,
      allergens: recipeItems.allergens,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      materialUnit: rawMaterials.unit,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      materialType: rawMaterials.materialType,
    })
    .from(recipeItems)
    .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
    .where(eq(recipeItems.productId, productId))
    .orderBy(recipeItems.id);
  return rows;
}

/** Get ALL recipe items across all products — used for Excel export */
export async function getAllRecipeItemsForExport() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      recipeItemId: recipeItems.id,
      productId: recipeItems.productId,
      materialId: recipeItems.materialId,
      quantity: recipeItems.quantity,
      unit: recipeItems.unit,
      notes: recipeItems.notes,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      materialUnit: rawMaterials.unit,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      materialType: rawMaterials.materialType,
    })
    .from(recipeItems)
    .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
    .orderBy(recipeItems.productId, recipeItems.id);
}

export async function addRecipeItem(data: {
  productId: number;
  materialId: number;
  quantity: string;
  unit: string;
  notes?: string;
  allergens?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(recipeItems).values(data);
  const id = (result as any).insertId as number;
  const rows = await db
    .select({
      id: recipeItems.id,
      productId: recipeItems.productId,
      materialId: recipeItems.materialId,
      quantity: recipeItems.quantity,
      unit: recipeItems.unit,
      notes: recipeItems.notes,
      allergens: recipeItems.allergens,
      materialName: rawMaterials.name,
      materialUnit: rawMaterials.unit,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      materialType: rawMaterials.materialType,
    })
    .from(recipeItems)
    .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
    .where(eq(recipeItems.id, id))
    .limit(1);
  return rows[0];
}

export async function updateRecipeItem(id: number, data: Partial<{
  quantity: string;
  unit: string;
  notes: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(recipeItems).set(data).where(eq(recipeItems.id, id));
  return { success: true };
}

export async function deleteRecipeItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(recipeItems).where(eq(recipeItems.id, id));
  return { success: true };
}

export async function clearRecipeItems(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(recipeItems).where(eq(recipeItems.productId, productId));
  return { success: true };
}

export async function bulkInsertRecipeItems(items: Array<{
  productId: number;
  materialId: number;
  quantity: string;
  unit: string;
  notes?: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (items.length === 0) return [];
  await db.insert(recipeItems).values(items);
  return getRecipeItems(items[0].productId);
}

/**
 * Replace one material with another across ALL recipe_items.
 * Returns the count of updated rows.
 */
export async function replaceMaterialInRecipes(
  fromMaterialId: number,
  toMaterialId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Count affected rows first
  const affected = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(recipeItems)
    .where(eq(recipeItems.materialId, fromMaterialId));
  const count = Number(affected[0]?.count ?? 0);
  if (count === 0) return 0;
  // Perform the update
  await db
    .update(recipeItems)
    .set({ materialId: toMaterialId })
    .where(eq(recipeItems.materialId, fromMaterialId));
  return count;
}

/**
 * Count how many recipe_items reference a given material.
 */
export async function countMaterialInRecipes(materialId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(recipeItems)
    .where(eq(recipeItems.materialId, materialId));
  return Number(rows[0]?.count ?? 0);
}

// ─── Bulk ingredient quantity update ────────────────────────────────────────────────────────────────────────

/** Get all recipe items (with product info) that use a specific material */
export async function getRecipesContainingMaterial(materialId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: recipeItems.id,
      productId: recipeItems.productId,
      productName: products.name,
      productNameAr: products.nameAr,
      quantity: recipeItems.quantity,
      unit: recipeItems.unit,
      notes: recipeItems.notes,
    })
    .from(recipeItems)
    .innerJoin(products, eq(recipeItems.productId, products.id))
    .where(eq(recipeItems.materialId, materialId))
    .orderBy(products.nameAr, products.name);
}

/** Update quantity of a specific material across multiple recipe items */
export async function bulkUpdateIngredientQuantity(
  materialId: number,
  newQuantity: string,
  newUnit: string,
  recipeItemIds?: number[] // if undefined, update ALL recipes containing this material
) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const whereClause = recipeItemIds && recipeItemIds.length > 0
    ? and(eq(recipeItems.materialId, materialId), inArray(recipeItems.id, recipeItemIds))
    : eq(recipeItems.materialId, materialId);
  const result = await db
    .update(recipeItems)
    .set({ quantity: newQuantity, unit: newUnit })
    .where(whereClause);
  return { updatedCount: (result as any)[0]?.affectedRows ?? 0 };
}

// ─── Semi-Finished Materials ────────────────────────────────────────────────────────────────────────────────

/** List all semi-finished materials */
export async function listSemiFinishedMaterials() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: rawMaterials.id,
      code: rawMaterials.code,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      categoryId: rawMaterials.categoryId,
      unit: rawMaterials.unit,
      outputQuantity: rawMaterials.outputQuantity,
      shelfLife: rawMaterials.shelfLife,
      storageLocation: rawMaterials.storageLocation,
      defaultWastePercent: rawMaterials.defaultWastePercent,
      currentQuantity: rawMaterials.currentQuantity,
      minimumQuantity: rawMaterials.minimumQuantity,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      averageCost: rawMaterials.averageCost,
      notes: rawMaterials.notes,
      materialType: rawMaterials.materialType,
      recipeStatus: rawMaterials.recipeStatus,
      recipeVersion: rawMaterials.recipeVersion,
      approvedBy: rawMaterials.approvedBy,
      approvalDate: rawMaterials.approvalDate,
      changeLog: rawMaterials.changeLog,
      createdBy: rawMaterials.createdBy,
      isActive: rawMaterials.isActive,
      createdAt: rawMaterials.createdAt,
      updatedAt: rawMaterials.updatedAt,
    })
    .from(rawMaterials)
    .where(and(eq(rawMaterials.materialType, "semi_finished"), eq(rawMaterials.isActive, true)))
    .orderBy(rawMaterials.name);
}

/** Get the recipe (ingredients) of a semi-finished material */
export async function getSemiFinishedRecipe(materialId: number) {
  const db = await getDb();
  if (!db) return [];
  const ingredient = rawMaterials;
  const sfr = semiFinishedRecipes;
  // alias for the ingredient join
  const rows = await db
    .select({
      id: sfr.id,
      materialId: sfr.materialId,
      ingredientId: sfr.ingredientId,
      quantity: sfr.quantity,
      actualQuantity: sfr.actualQuantity,
      unit: sfr.unit,
      expectedWastePercent: sfr.expectedWastePercent,
      notes: sfr.notes,
      ingredientName: ingredient.name,
      ingredientNameAr: ingredient.nameAr,
      ingredientUnit: ingredient.unit,
      lastPurchasePrice: ingredient.lastPurchasePrice,
    })
    .from(sfr)
    .innerJoin(ingredient, eq(sfr.ingredientId, ingredient.id))
    .where(eq(sfr.materialId, materialId))
    .orderBy(sfr.id);
  return rows;
}

/** Add an ingredient to a semi-finished material recipe */
export async function addSemiFinishedItem(data: {
  materialId: number;
  ingredientId: number;
  quantity: string;
  actualQuantity?: string;
  unit: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(semiFinishedRecipes).values(data);
  const id = (result as any).insertId as number;
  return getSemiFinishedRecipe(data.materialId);
}

/** Update an ingredient in a semi-finished material recipe */
export async function updateSemiFinishedItem(
  id: number,
  data: { quantity?: string; actualQuantity?: string | null; unit?: string; notes?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(semiFinishedRecipes).set(data).where(eq(semiFinishedRecipes.id, id));
  // return updated recipe for the parent material
  const rows = await db.select().from(semiFinishedRecipes).where(eq(semiFinishedRecipes.id, id)).limit(1);
  if (rows[0]) return getSemiFinishedRecipe(rows[0].materialId);
  return [];
}

/** Delete an ingredient from a semi-finished material recipe */
export async function deleteSemiFinishedItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(semiFinishedRecipes).where(eq(semiFinishedRecipes.id, id));
  return { success: true };
}

/** Clear all ingredients of a semi-finished material recipe */
export async function clearSemiFinishedRecipe(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(semiFinishedRecipes).where(eq(semiFinishedRecipes.materialId, materialId));
  return { success: true };
}

/**
 * Calculate the cost of a semi-finished material per its base unit (e.g. per kg or per L).
 * Returns the total cost of all ingredients combined.
 */
export async function calcSemiFinishedCost(materialId: number): Promise<number> {
  const items = await getSemiFinishedRecipe(materialId);
  return items.reduce((sum, item) => {
    const price = parseFloat(item.lastPurchasePrice ?? "0");
    const qty = parseFloat(item.quantity);
    // Convert recipe unit to ingredient base unit before multiplying
    const qtyInBase = convertUnitToBase(qty, item.unit, item.ingredientUnit);
    return sum + price * qtyInBase;
  }, 0);
}

// ─── Recipe Workflow: Status, Versioning, Approval ────────────────────────────

/** Update recipe status with optional approval metadata */
export async function updateSemiFinishedStatus(
  id: number,
  status: "draft" | "pending" | "approved" | "suspended" | "archived",
  opts?: { approvedBy?: number; changeLog?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(rawMaterials).set({
    recipeStatus: status,
    ...(status === "approved" && opts?.approvedBy !== undefined && {
      approvedBy: opts.approvedBy,
      approvalDate: new Date(),
    }),
    ...(opts?.changeLog !== undefined && { changeLog: opts.changeLog }),
    updatedAt: new Date(),
  }).where(eq(rawMaterials.id, id));
}

/** Save a snapshot of the current recipe ingredients as a version history entry */
export async function saveRecipeVersionSnapshot(
  materialId: number,
  opts?: { status?: string; changeLog?: string; createdBy?: number; approvedBy?: number }
) {
  const db = await getDb();
  if (!db) return;
  const [mat] = await db.select({
    recipeVersion: rawMaterials.recipeVersion,
    unit: rawMaterials.unit,
    outputQuantity: rawMaterials.outputQuantity,
  }).from(rawMaterials).where(eq(rawMaterials.id, materialId)).limit(1);
  if (!mat) return;

  const ingredients = await getSemiFinishedRecipe(materialId);
  const totalCost = await calcSemiFinishedCost(materialId);
  const outputQty = parseFloat(mat.outputQuantity as string) || 1;
  const costPerUnit = outputQty > 0 ? totalCost / outputQty : 0;

  await db.insert(semiFinishedRecipeVersions).values({
    materialId,
    version: mat.recipeVersion,
    status: (opts?.status ?? "draft") as any,
    ingredientsSnapshot: ingredients as any,
    totalCost: String(totalCost.toFixed(3)),
    costPerUnit: String(costPerUnit.toFixed(3)),
    outputQuantity: mat.outputQuantity,
    outputUnit: mat.unit,
    changeLog: opts?.changeLog,
    createdBy: opts?.createdBy,
    approvedBy: opts?.approvedBy,
    approvalDate: opts?.approvedBy ? new Date() : undefined,
  });
}

/** Bump version number and reset to draft (when editing an approved recipe) */
export async function bumpRecipeVersion(id: number, createdBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Save snapshot of current approved version first
  const [mat] = await db.select({ recipeStatus: rawMaterials.recipeStatus, recipeVersion: rawMaterials.recipeVersion })
    .from(rawMaterials).where(eq(rawMaterials.id, id)).limit(1);
  if (mat) {
    await saveRecipeVersionSnapshot(id, { status: mat.recipeStatus as string, createdBy });
  }
  // Increment version and reset to draft
  await db.update(rawMaterials).set({
    recipeStatus: "draft",
    recipeVersion: sql`recipeVersion + 1`,
    approvedBy: null,
    approvalDate: null,
    updatedAt: new Date(),
  }).where(eq(rawMaterials.id, id));
}

/** Get version history for a recipe */
export async function getRecipeVersionHistory(materialId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: semiFinishedRecipeVersions.id,
    version: semiFinishedRecipeVersions.version,
    status: semiFinishedRecipeVersions.status,
    totalCost: semiFinishedRecipeVersions.totalCost,
    costPerUnit: semiFinishedRecipeVersions.costPerUnit,
    outputQuantity: semiFinishedRecipeVersions.outputQuantity,
    outputUnit: semiFinishedRecipeVersions.outputUnit,
    changeLog: semiFinishedRecipeVersions.changeLog,
    approvalDate: semiFinishedRecipeVersions.approvalDate,
    createdAt: semiFinishedRecipeVersions.createdAt,
    approvedByName: users.name,
  })
  .from(semiFinishedRecipeVersions)
  .leftJoin(users, eq(semiFinishedRecipeVersions.approvedBy, users.id))
  .where(eq(semiFinishedRecipeVersions.materialId, materialId))
  .orderBy(desc(semiFinishedRecipeVersions.version));
}

/** Get where a semi-finished material is used (product recipes + other semi-finished + kitchen pulls) */
export async function getSemiFinishedUsage(materialId: number) {
  const db = await getDb();
  if (!db) return { products: [], semiFinished: [], kitchenPulls: [] };

  // 1. Used in final product recipes (recipe_items → products)
  const productUsage = await db.select({
    productId: products.id,
    productName: products.name,
    productNameAr: products.nameAr,
    quantity: recipeItems.quantity,
    unit: recipeItems.unit,
    productCost: products.cost,
  })
  .from(recipeItems)
  .innerJoin(products, eq(recipeItems.productId, products.id))
  .where(eq(recipeItems.materialId, materialId));

  // 2. Used as ingredient in other semi-finished recipes
  const sfUsage = await db.select({
    parentId: rawMaterials.id,
    parentName: rawMaterials.name,
    parentNameAr: rawMaterials.nameAr,
    quantity: semiFinishedRecipes.quantity,
    unit: semiFinishedRecipes.unit,
  })
  .from(semiFinishedRecipes)
  .innerJoin(rawMaterials, eq(semiFinishedRecipes.materialId, rawMaterials.id))
  .where(eq(semiFinishedRecipes.ingredientId, materialId));

  // 3. Actual kitchen production pulls (صرف فعلي من المطبخ) — last 30 entries
  const pullUsage = await db.select({
    id: kitchenDailyPulls.id,
    pullDate: kitchenDailyPulls.pullDate,
    pulledQuantity: kitchenDailyPulls.pulledQuantity,
    actualYield: kitchenDailyPulls.actualYield,
    unit: kitchenDailyPulls.unit,
    status: kitchenDailyPulls.status,
    notes: kitchenDailyPulls.notes,
  })
  .from(kitchenDailyPulls)
  .where(eq(kitchenDailyPulls.materialId, materialId))
  .orderBy(desc(kitchenDailyPulls.pullDate))
  .limit(30);

  return { products: productUsage, semiFinished: sfUsage, kitchenPulls: pullUsage };
}

/** Duplicate a recipe (copy to a new material with same ingredients) */
export async function duplicateSemiFinishedRecipe(sourceId: number, createdBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [source] = await db.select().from(rawMaterials).where(eq(rawMaterials.id, sourceId)).limit(1);
  if (!source) throw new Error("Source recipe not found");

  // Create new material with "(نسخة)" suffix
  const newName = `${source.name} (Copy)`;
  const prefix = (source.code ?? "SF").replace(/-\d+$/, "");
  const newCode = `${prefix}-${Date.now().toString().slice(-5)}`;

  const [result] = await db.insert(rawMaterials).values({
    code: newCode,
    name: newName,
    nameAr: source.nameAr ? `${source.nameAr} (نسخة)` : undefined,
    categoryId: source.categoryId,
    unit: source.unit,
    outputQuantity: source.outputQuantity,
    shelfLife: source.shelfLife,
    storageLocation: source.storageLocation,
    defaultWastePercent: source.defaultWastePercent,
    materialType: "semi_finished",
    recipeStatus: "draft",
    recipeVersion: 1,
    currentQuantity: "0",
    minimumQuantity: "0",
    notes: source.notes,
    createdBy,
  });
  const newId = (result as any).insertId as number;

  // Copy recipe ingredients
  const items = await getSemiFinishedRecipe(sourceId);
  for (const item of items) {
    await db.insert(semiFinishedRecipes).values({
      materialId: newId,
      ingredientId: item.ingredientId,
      quantity: item.quantity,
      unit: item.unit,
      expectedWastePercent: item.expectedWastePercent,
      notes: item.notes ?? undefined,
    });
  }
  return newId;
}

/**
 * القاعدة الموحّدة لحساب تكلفة أي سطر إنتاج في المطبخ.
 * لكل مادة (خام أو مصنّعة):
 *   - نجلب lastPurchasePrice (أو averageCost) من جدول raw_materials مباشرةً
 *   - نضربها في الكمية المستخدمة
 *
 * للخام:     cost = qty × lastPurchasePrice
 * للمصنّعة: cost = qty × lastPurchasePrice  (سعر المنتج المصنّع نفسه)
 *
 * @param materialId   - معرّف المادة
 * @param materialType - 'raw' | 'semi_finished'
 * @param qty          - الكمية المستخدمة
 */
export async function calcKitchenPullRawCost(
  materialId: number,
  materialType: string,
  qty: number
): Promise<number> {
  if (qty <= 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const [mat] = await db
    .select({ price: rawMaterials.lastPurchasePrice, avgCost: rawMaterials.averageCost })
    .from(rawMaterials)
    .where(eq(rawMaterials.id, materialId))
    .limit(1);
  const directPrice = parseFloat(mat?.price ?? '0') || parseFloat(mat?.avgCost ?? '0');
  // نفس منطق getKitchenPullsByDate:
  // للمصنّعة: استخدم lastPurchasePrice إذا كان > 0، وإلا احسب من الوصفة
  if (materialType === 'semi_finished') {
    if (directPrice > 0) return qty * directPrice;
    const recipeCost = await calcSemiFinishedCost(materialId);
    return qty * recipeCost;
  }
  // للخام: استخدم lastPurchasePrice أو averageCost
  return qty * directPrice;
}

/** Normalize unit string to canonical short form */
function normalizeUnitStr(u: string): string {
  const s = u.toLowerCase().trim();
  if (s === "gram" || s === "grams" || s === "جرام") return "g";
  if (s === "kilogram" || s === "kilograms" || s === "kilo" || s === "كيلو" || s === "كيلوجرام") return "kg";
  if (s === "milligram" || s === "milligrams") return "mg";
  if (s === "milliliter" || s === "milliliters" || s === "millilitre" || s === "مل" || s === "مليلتر") return "ml";
  if (s === "liter" || s === "liters" || s === "litre" || s === "litres" || s === "لتر") return "l";
  if (s === "centiliter" || s === "cl") return "cl";
  if (s === "deciliter" || s === "dl") return "dl";
  if (s === "piece" || s === "pieces" || s === "pc" || s === "قطعة" || s === "حبة" || s === "حبات") return "pcs";
  return s;
}

function convertUnitToBase(qty: number, fromUnit: string, toUnit: string): number {
  const r = normalizeUnitStr(fromUnit);
  const m = normalizeUnitStr(toUnit);
  if (r === m) return qty;
  if (m === "kg") {
    if (r === "g") return qty / 1000;
    if (r === "mg") return qty / 1_000_000;
  }
  if (m === "l") {
    if (r === "ml") return qty / 1000;
    if (r === "cl") return qty / 100;
    if (r === "dl") return qty / 10;
  }
  return qty;
}

// ─── Semi-Finished Production ─────────────────────────────────────────────────
/**
 * Produce a semi-finished material:
 * - Validates that the recipe exists and has ingredients
 * - Scales ingredient quantities by the produced amount (1 unit of recipe = 1 base unit of material)
 * - Deducts each raw ingredient from inventory (OUT transaction)
 * - Adds the produced quantity to the semi-finished material's stock (IN transaction)
 * - Returns a summary of what was deducted
 */

export async function produceSemiFinished(params: {
  materialId: number;
  producedQuantity: number;  // quantity used to scale ingredient deductions (recipe basis)
  actualYield?: number;      // actual output quantity added to stock (defaults to producedQuantity)
  notes?: string;
  createdBy?: number;
  addToPulls?: boolean; // if true, adds a kitchen_daily_pull record for end-of-day count
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. Get the semi-finished material info
  const [material] = await db
    .select({ id: rawMaterials.id, name: rawMaterials.name, nameAr: rawMaterials.nameAr, unit: rawMaterials.unit })
    .from(rawMaterials)
    .where(eq(rawMaterials.id, params.materialId))
    .limit(1);
  if (!material) throw new Error("المادة المصنّعة غير موجودة");

  // 2. Get the recipe
  const recipe = await getSemiFinishedRecipe(params.materialId);
  if (!recipe || recipe.length === 0) {
    throw new Error(`لا توجد وصفة للمادة: ${material.nameAr || material.name}. يرجى إضافة مكونات الوصفة أولاً.`);
  }

  // 3. Scale ingredient quantities by producedQuantity AND convert to the material's base unit
  const deductions: Array<{
    ingredientId: number;
    ingredientName: string;
    ingredientNameAr: string | null;
    recipeUnit: string;       // unit as written in the recipe (e.g. "g")
    unit: string;             // base unit of the raw material in inventory (e.g. "kg")
    recipeQty: number;        // qty per 1 unit of production in recipe unit
    scaledQty: number;        // scaled by producedQuantity, still in recipe unit
    deductQty: number;        // converted to base inventory unit — this is what gets deducted
    lastPurchasePrice: number; // سعر الوحدة للمكوّن
  }> = recipe.map(item => {
    const recipeQty = parseFloat(item.quantity);
    const scaledQty = recipeQty * params.producedQuantity;
    // item.unit = unit written in recipe (may be "g", "ml", etc.)
    // item.ingredientUnit = base unit stored in inventory ("kg", "l", etc.)
    const deductQty = convertUnitToBase(scaledQty, item.unit, item.ingredientUnit);
    return {
      ingredientId: item.ingredientId,
      ingredientName: item.ingredientName,
      ingredientNameAr: item.ingredientNameAr,
      recipeUnit: item.unit,
      unit: item.ingredientUnit,
      recipeQty,
      scaledQty,
      deductQty,
      lastPurchasePrice: parseFloat(item.lastPurchasePrice ?? '0') || 0,
    };
  });

  const now = new Date();
  // actualYield is what gets added to stock; producedQuantity is only for ingredient scaling
  const yieldQty = params.actualYield ?? params.producedQuantity;
  const productionNote = params.notes
    ? `إنتاج: ${material.nameAr || material.name} (مكونات: ${params.producedQuantity} ${material.unit}, ناتج فعلي: ${yieldQty} ${material.unit}) — ${params.notes}`
    : `إنتاج: ${material.nameAr || material.name} (مكونات: ${params.producedQuantity} ${material.unit}, ناتج فعلي: ${yieldQty} ${material.unit})`;

  // 4. Deduct each ingredient from inventory using the converted base-unit quantity
  for (const d of deductions) {
    await createTransaction({
      materialId: d.ingredientId,
      transactionType: "OUT",
      quantity: d.deductQty.toString(),  // ✅ converted to inventory base unit
      reason: "production",
      notes: productionNote,
      transactionDate: now,
      createdBy: params.createdBy,
    });
  }

  // 5. Create IN transaction for the produced semi-finished material using actualYield
  // createTransaction handles BOTH inserting the transaction AND updating currentQuantity
  await createTransaction({
    materialId: params.materialId,
    transactionType: "IN",
    quantity: yieldQty.toString(),
    reason: "production",
    notes: productionNote,
    transactionDate: now,
    createdBy: params.createdBy ?? null,
  });

  // 7. Optionally add a kitchen_daily_pull record for end-of-day inventory tracking
  // pulledQuantity = producedQuantity (كمية المواد الخام المسحوبة للتصنيع)
  // actualYield = yieldQty (الإنتاج الفعلي الناتج من التصنيع)
  if (params.addToPulls) {
    const tzOffset = await getBusinessDayTzOffset();
    const dateStr = now.toISOString().slice(0, 10);
    // Check for existing open pull for same material on same business date
    const [existingPull] = await db
      .select()
      .from(kitchenDailyPulls)
      .where(
        and(
          eq(kitchenDailyPulls.materialId, params.materialId),
          eq(kitchenDailyPulls.status, "open"),
          sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${dateStr}`
        )
      )
      .limit(1);

    if (existingPull) {
      // Add to existing open pull instead of creating a new one
      const newPulled = parseFloat(existingPull.pulledQuantity) + params.producedQuantity;
      const existingYield = existingPull.actualYield != null ? parseFloat(existingPull.actualYield) : null;
      const newYield = existingYield !== null ? existingYield + yieldQty : yieldQty;
      const combinedNotes = params.notes
        ? [existingPull.notes, productionNote].filter(Boolean).join('; ')
        : existingPull.notes;
      await db
        .update(kitchenDailyPulls)
        .set({
          pulledQuantity: newPulled.toFixed(3),
          actualYield: newYield.toFixed(3),
          notes: combinedNotes,
          updatedAt: new Date(),
        })
        .where(eq(kitchenDailyPulls.id, existingPull.id));
    } else {
      // No existing open pull — create a new one
      await db.insert(kitchenDailyPulls).values({
        pullDate: now,
        materialId: params.materialId,
        materialName: material.name,
        materialNameAr: material.nameAr ?? null,
        materialType: "semi_finished",
        unit: material.unit,
        pulledQuantity: params.producedQuantity.toString(), // كمية المواد الخام المسحوبة للتصنيع
        actualYield: yieldQty.toString(),                   // الإنتاج الفعلي الناتج
        status: "open",
        notes: productionNote,
      });
    }
  }
  return {
    materialId: params.materialId,
    materialName: material.nameAr || material.name,
    producedQuantity: params.producedQuantity,
    actualYield: yieldQty,
    unit: material.unit,
    deductions,
  };
}

// ─── Kitchen Daily Pulls ──────────────────────────────────────────────────────

/** Get all pulls for a specific date (YYYY-MM-DD) using 6AM-6AM business day */
export async function getKitchenPullsByDate(date: string) {
  const db = await getDb();
  if (!db) return [];
  const tzOffset = await getBusinessDayTzOffset();
  const rows = await db
    .select({
      id: kitchenDailyPulls.id,
      pullDate: kitchenDailyPulls.pullDate,
      materialId: kitchenDailyPulls.materialId,
      materialName: kitchenDailyPulls.materialName,
      materialNameAr: kitchenDailyPulls.materialNameAr,
      materialType: kitchenDailyPulls.materialType,
      unit: kitchenDailyPulls.unit,
      pulledQuantity: kitchenDailyPulls.pulledQuantity,
      actualYield: kitchenDailyPulls.actualYield,
      closingCount: kitchenDailyPulls.closingCount,
      ordersConsumed: kitchenDailyPulls.ordersConsumed,
      carriedForward: kitchenDailyPulls.carriedForward,
      carriedRawQty: kitchenDailyPulls.carriedRawQty,
      wasteQty: kitchenDailyPulls.wasteQty,
      status: kitchenDailyPulls.status,
      isCarriedForward: kitchenDailyPulls.isCarriedForward,
      notes: kitchenDailyPulls.notes,
      createdBy: kitchenDailyPulls.createdBy,
      createdAt: kitchenDailyPulls.createdAt,
      updatedAt: kitchenDailyPulls.updatedAt,
      unitCost: rawMaterials.lastPurchasePrice,
    })
    .from(kitchenDailyPulls)
    .leftJoin(rawMaterials, eq(kitchenDailyPulls.materialId, rawMaterials.id))
    .where(
      sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${date}`
    )
    .orderBy(kitchenDailyPulls.id);

  // للمصنّعة: إذا كان lastPurchasePrice فارغاً نحسب تكلفة الوصفة كبديل
  const enriched = await Promise.all(
    rows.map(async (row) => {
      if (
        row.materialType === 'semi_finished' &&
        (row.unitCost === null || row.unitCost === '0' || parseFloat(row.unitCost ?? '0') === 0)
      ) {
        const recipeCost = await calcSemiFinishedCost(row.materialId);
        return { ...row, unitCost: recipeCost > 0 ? String(recipeCost.toFixed(4)) : null };
      }
      return row;
    })
  );
  return enriched;
}

/** Add a new kitchen pull (deducts from inventory immediately).
 * If an open pull already exists for the same material on the same business date,
 * the pulled quantity is added to the existing record instead of creating a new one.
 */
export async function addKitchenPull(data: {
  pullDate: Date;
  materialId: number;
  materialName: string;
  materialNameAr?: string;
  materialType: string;
  unit: string;
  pulledQuantity: string;
  actualYield?: string; // الإنتاج الفعلي إذا كان مختلفاً عن كمية الخام
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const tzOffset = await getBusinessDayTzOffset();
  const dateStr = data.pullDate.toISOString().slice(0, 10);
  // Check for existing open pull for same material on same business date
  const [existing] = await db
    .select()
    .from(kitchenDailyPulls)
    .where(
      and(
        eq(kitchenDailyPulls.materialId, data.materialId),
        eq(kitchenDailyPulls.status, "open"),
        sql`DATE(CONVERT_TZ(${kitchenDailyPulls.pullDate}, '+00:00', ${tzOffset})) = ${dateStr}`
      )
    )
    .limit(1);
  // Deduct from inventory (always)
  await db
    .update(rawMaterials)
    .set({
      currentQuantity: sql`GREATEST(0, currentQuantity - ${parseFloat(data.pulledQuantity)})`,
    })
    .where(eq(rawMaterials.id, data.materialId));
  // Record transaction (always)
  await db.insert(inventoryTransactions).values(clean({
    materialId: data.materialId,
    transactionType: "OUT",
    quantity: data.pulledQuantity,
    reason: "production",
    destination: "المطبخ",
    transactionDate: data.pullDate,
    notes: data.notes ?? "سحب يومي للمطبخ",
    createdBy: data.createdBy,
}) as any);
  if (existing) {
    // Add to existing open pull instead of creating a new one
    const newPulled = parseFloat(existing.pulledQuantity) + parseFloat(data.pulledQuantity);
    const existingYield = existing.actualYield != null ? parseFloat(existing.actualYield) : null;
    const addedYield = data.actualYield != null ? parseFloat(data.actualYield) : parseFloat(data.pulledQuantity);
    const newYield = existingYield !== null ? existingYield + addedYield : null;
    const combinedNotes = data.notes
      ? [existing.notes, data.notes].filter(Boolean).join('; ')
      : existing.notes;
    await db
      .update(kitchenDailyPulls)
      .set({
        pulledQuantity: newPulled.toFixed(3),
        ...(newYield !== null ? { actualYield: newYield.toFixed(3) } : {}),
        notes: combinedNotes,
        updatedAt: new Date(),
      })
      .where(eq(kitchenDailyPulls.id, existing.id));
    return existing.id;
  }
  // No existing open pull — create a new one
  const [result] = await db.insert(kitchenDailyPulls).values({
    pullDate: data.pullDate,
    materialId: data.materialId,
    materialName: data.materialName,
    materialNameAr: data.materialNameAr,
    materialType: data.materialType,
    unit: data.unit,
    pulledQuantity: data.pulledQuantity,
    actualYield: data.actualYield ?? null,
    notes: data.notes,
    createdBy: data.createdBy,
    status: "open",
  });
  return (result as any).insertId as number;
}
/** Delete a kitchen pull (reverses inventory deduction) */
export async function deleteKitchenPull(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(kitchenDailyPulls).where(eq(kitchenDailyPulls.id, id)).limit(1);
  if (!rows[0]) throw new Error("Pull not found");
  const pull = rows[0];
  if (pull.status !== "open") throw new Error("لا يمكن حذف سحب مُغلق أو تم جرده");
  const producedQty = parseFloat(pull.pulledQuantity);

  if (pull.materialType === "semi_finished") {
    // For semi-finished production: reverse the production
    const now = new Date();
    const cancelNote = `إلغاء إنتاج: ${pull.materialNameAr || pull.materialName} (${producedQty} ${pull.unit})`;

    // 1. Create OUT transaction to reverse the semi-finished IN (log only, stock updated directly below)
    await db.insert(inventoryTransactions).values(clean({
      materialId: pull.materialId,
      transactionType: "OUT",
      quantity: producedQty.toString(),
      reason: "adjustment",
      notes: cancelNote,
      transactionDate: now,
}) as any);

    // 2. Deduct the produced quantity from the semi-finished material stock
    await db
      .update(rawMaterials)
      .set({
        currentQuantity: sql`currentQuantity - ${producedQty}`,
      })
      .where(eq(rawMaterials.id, pull.materialId));

    // 3. Restore raw ingredient quantities based on the recipe
    // IMPORTANT: recipe quantities are in recipe units (g, mL, etc.)
    // but inventory is stored in base units (kg, L, etc.) → must convert!
    const recipe = await getSemiFinishedRecipe(pull.materialId);
    if (recipe && recipe.length > 0) {
      for (const item of recipe) {
        const scaledQty = parseFloat(item.quantity) * producedQty;
        // Convert from recipe unit to ingredient base unit before restoring
        const restoredQty = convertUnitToBase(scaledQty, item.unit, item.ingredientUnit);
        await createTransaction({
          materialId: item.ingredientId,
          transactionType: "IN",
          quantity: restoredQty.toString(),
          reason: "adjustment",
          notes: cancelNote,
          transactionDate: now,
        });
      }
    }
  } else {
    // For raw material pulls: restore the pulled quantity to inventory
    // IMPORTANT: carried-forward pulls (isCarriedForward=true) were NOT deducted from inventory
    // when created by countKitchenPull. Only original pulls (addKitchenPull) deduct stock.
    // Restoring a carried-forward pull would INFLATE inventory incorrectly.
    if (!pull.isCarriedForward) {
      await db
        .update(rawMaterials)
        .set({
          currentQuantity: sql`currentQuantity + ${producedQty}`,
        })
        .where(eq(rawMaterials.id, pull.materialId));
    }
    // If it IS a carried-forward pull: no inventory was deducted when created,
    // so we simply delete the record without touching stock.
  }
  await db.delete(kitchenDailyPulls).where(eq(kitchenDailyPulls.id, id));
  return { success: true };
}
/** Update the pulled quantity for an open pull and adjust inventory accordingly */
export async function updateKitchenPullQuantity(
  id: number,
  newQuantity: string,
  updatedBy?: number,
  newActualYield?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(kitchenDailyPulls).where(eq(kitchenDailyPulls.id, id)).limit(1);
  if (!rows[0]) throw new Error("Pull not found");
  const pull = rows[0];
  if (pull.status !== "open") throw new Error("لا يمكن تعديل سحب مُغلق أو تم جرده");

  const oldQty = parseFloat(pull.pulledQuantity);
  const newQty = parseFloat(newQuantity);
  if (isNaN(newQty) || newQty <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");
  const diff = newQty - oldQty; // positive = more pulled, negative = less pulled
  const now = new Date();

  if (pull.materialType === "semi_finished") {
    // For semi-finished:
    // - pulledQuantity drives ingredient deductions (recipe scaling)
    // - actualYield drives what gets added to semi-finished stock
    const oldYield = parseFloat(pull.actualYield ?? pull.pulledQuantity);
    const newYield = newActualYield !== undefined ? parseFloat(newActualYield) : (diff !== 0 ? newQty : oldYield);
    if (isNaN(newYield) || newYield < 0) throw new Error("الإنتاج الفعلي يجب أن يكون صفراً أو أكبر");
    // Safety guard: actualYield must not exceed 50× the pulled quantity to prevent data-entry mistakes
    if (newYield > newQty * 50) {
      throw new Error(`خطأ: الإنتاج الفعلي (${newYield}) كبير جداً مقارنةً بكمية المكونات (${newQty}). تحقق من الأرقام وحاول مرة أخرى.`);
    }
    const yieldDiff = newYield - oldYield;
    // Adjust semi-finished stock based on yield diff
    if (yieldDiff !== 0) {
      await db
        .update(rawMaterials)
        .set({ currentQuantity: sql`currentQuantity + ${yieldDiff}` })
        .where(eq(rawMaterials.id, pull.materialId));
      await db.insert(inventoryTransactions).values(clean({
        materialId: pull.materialId,
        transactionType: yieldDiff > 0 ? "IN" : "OUT",
        quantity: Math.abs(yieldDiff).toString(),
        reason: "adjustment",
        notes: `تعديل إنتاج فعلي: ${pull.materialNameAr || pull.materialName} (${oldYield} → ${newYield} ${pull.unit})`,
        transactionDate: now,
        createdBy: updatedBy,
}) as any);
    }
    // Adjust raw ingredient quantities based on pulledQuantity diff
    // IMPORTANT: recipe quantities are in recipe units (g, mL, etc.)
    // but inventory is stored in base units (kg, L, etc.) → must convert!
    if (diff !== 0) {
      const recipe = await getSemiFinishedRecipe(pull.materialId);
      for (const item of recipe) {
        const rawScaled = parseFloat(item.quantity) * Math.abs(diff);
        const scaledDiff = convertUnitToBase(rawScaled, item.unit, item.ingredientUnit);
        await db
          .update(rawMaterials)
          .set({
            currentQuantity: diff > 0
              ? sql`GREATEST(0, currentQuantity - ${scaledDiff})`
              : sql`currentQuantity + ${scaledDiff}`,
          })
          .where(eq(rawMaterials.id, item.ingredientId));
        await db.insert(inventoryTransactions).values(clean({
          materialId: item.ingredientId,
          transactionType: diff > 0 ? "OUT" : "IN",
          quantity: scaledDiff.toString(),
          reason: "production",
          notes: `تعديل إنتاج ${pull.materialNameAr || pull.materialName}`,
          transactionDate: now,
          createdBy: updatedBy,
}) as any);
      }
    }
    // Update the pull record with both pulledQuantity and actualYield
    await db
      .update(kitchenDailyPulls)
      .set({ pulledQuantity: newQty.toString(), actualYield: newYield.toString(), updatedAt: now })
      .where(eq(kitchenDailyPulls.id, id));
    return { success: true, oldQty, newQty, diff, oldYield, newYield, yieldDiff };
  } else {
    // For raw material pulls: adjust inventory by the diff
    // IMPORTANT: carried-forward pulls (isCarriedForward=true) were NOT deducted from inventory
    // when created. Only original pulls (addKitchenPull) affect stock.
    // Adjusting a carried-forward pull quantity must NOT touch inventory.
    if (diff !== 0 && !pull.isCarriedForward) {
      await db
        .update(rawMaterials)
        .set({
          currentQuantity: diff > 0
            ? sql`GREATEST(0, currentQuantity - ${diff})`
            : sql`currentQuantity + ${Math.abs(diff)}`,
        })
        .where(eq(rawMaterials.id, pull.materialId));
      await db.insert(inventoryTransactions).values(clean({
        materialId: pull.materialId,
        transactionType: diff > 0 ? "OUT" : "IN",
        quantity: Math.abs(diff).toString(),
        reason: "production",
        destination: diff > 0 ? "المطبخ" : undefined,
        notes: `تعديل كمية سحب: ${pull.materialNameAr || pull.materialName} (${oldQty} → ${newQty} ${pull.unit})`,
        transactionDate: now,
        createdBy: updatedBy,
}) as any);
    }
    // Update the pull record (raw material)
    await db
      .update(kitchenDailyPulls)
      .set({ pulledQuantity: newQty.toString(), updatedAt: now })
      .where(eq(kitchenDailyPulls.id, id));
    return { success: true, oldQty, newQty, diff };
  }
}
/** Record end-of-day count for a pull */
export async function countKitchenPull(
  id: number,
  remainingQty: string,
  wasteQtyInput: string,
  createdBy?: number,
  carriedRawQty?: string,
  notes?: string // سبب الهدر
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(kitchenDailyPulls).where(eq(kitchenDailyPulls.id, id)).limit(1);
  if (!rows[0]) throw new Error("Pull not found");
  const pull = rows[0];
  const pulled = parseFloat(pull.pulledQuantity);
  const isSemiFinished = pull.materialType === "semi_finished";
  const now = new Date();

   // NEW LOGIC (user enters remaining qty, system calculates used):
  //   actualYield = actualYield (if set, for any material type) OR pulledQuantity
  //   remaining = remainingQty (what is left in the kitchen)
  //   waste = wasteQtyInput (explicitly entered by user)
  //   usedQty = actualYield - remaining - waste (what was actually consumed)
  //   carriedToTomorrow = remaining (carry forward to next day)
  // إذا كان actualYield محفوظاً (لأي نوع مادة) فيستخدم كأساس للجرد
  const actualYield = pull.actualYield
    ? parseFloat(pull.actualYield)
    : pulled;
  const remaining = Math.max(0, parseFloat(remainingQty || "0"));
  const wasteEntered = Math.max(0, parseFloat(wasteQtyInput || "0"));
  const carriedToTomorrow = remaining;

  let actualWaste: number;
  let usedQty: number;
  if (isSemiFinished) {
    usedQty = Math.max(0, actualYield - remaining - wasteEntered);
    actualWaste = wasteEntered;
  } else {
    // للمواد الخام: المستخدم = المسحوب - المتبقي - الهدر
    usedQty = Math.max(0, pulled - remaining - wasteEntered);
    actualWaste = wasteEntered;
  }

  // closingCount = usedQty (what was consumed)
  const closingCountValue = usedQty.toFixed(3);

  // حساب المقابل من المواد الخام للترحيل (للمواد المصنّعة فقط)
  const rawCarriedToSave = isSemiFinished ? parseFloat(carriedRawQty || "0") : 0;
  const remainingRatioForSave = actualYield > 0 ? carriedToTomorrow / actualYield : 0;
  const computedCarriedRaw = isSemiFinished && rawCarriedToSave === 0 && carriedRawQty === undefined
    ? pulled * remainingRatioForSave  // احسب تلقائياً إذا لم يُرسَل
    : rawCarriedToSave;

  // Store: closingCount=usedQty, carriedForward=remaining, carriedRawQty=raw equivalent, wasteQty=waste
  await db
    .update(kitchenDailyPulls)
    .set({
      closingCount: closingCountValue,
      carriedForward: String(carriedToTomorrow.toFixed(3)),
      carriedRawQty: String(computedCarriedRaw.toFixed(3)),
      wasteQty: String(actualWaste.toFixed(3)),
      status: "counted",
      ...(notes !== undefined && { notes }),
    })
    .where(eq(kitchenDailyPulls.id, id));

  const mat = await db.select().from(rawMaterials).where(eq(rawMaterials.id, pull.materialId)).limit(1);
  const unitCost = mat[0]?.averageCost ?? mat[0]?.lastPurchasePrice ?? "0";

  if (isSemiFinished) {
    // Deduct USED quantity from semi-finished material stock
    if (usedQty > 0) {
      await db
        .update(rawMaterials)
        .set({ currentQuantity: sql`GREATEST(0, currentQuantity - ${usedQty})`, updatedAt: now })
        .where(eq(rawMaterials.id, pull.materialId));
      // Record OUT transaction for used quantity
      await db.insert(inventoryTransactions).values(clean({
        materialId: pull.materialId,
        transactionType: "OUT",
        quantity: usedQty.toFixed(3),
        reason: "other",
        notes: `استخدام نهاية اليوم: ${pull.materialNameAr ?? pull.materialName}`,
        transactionDate: now,
        createdBy: createdBy ?? null,
}) as any);
    }
    // Log waste for semi-finished material
    if (actualWaste > 0) {
      const totalCost = (actualWaste * parseFloat(unitCost ?? "0")).toFixed(3);
      // Deduct waste from stock
      await db
        .update(rawMaterials)
        .set({ currentQuantity: sql`GREATEST(0, currentQuantity - ${actualWaste})`, updatedAt: now })
        .where(eq(rawMaterials.id, pull.materialId));
      // Record OUT transaction for waste
      await db.insert(inventoryTransactions).values(clean({
        materialId: pull.materialId,
        transactionType: "OUT",
        quantity: actualWaste.toFixed(3),
        reason: "waste",
        notes: `هدر نهاية اليوم: ${pull.materialNameAr ?? pull.materialName}`,
        transactionDate: now,
        createdBy: createdBy ?? null,
}) as any);
      await db.insert(wasteLogs).values({
        wasteDate: now,
        materialId: pull.materialId,
        materialName: pull.materialName,
        materialNameAr: pull.materialNameAr ?? undefined,
        unit: pull.unit,
        wasteQty: String(actualWaste.toFixed(3)),
        unitCost: unitCost ?? undefined,
        totalCost,
        source: "semi_finished",
        referenceId: id,
        reason: "هدر نهاية اليوم",
        createdBy,
      });
    }
  } else {
    // For raw materials: log waste if any
    if (actualWaste > 0) {
      const totalCost = (actualWaste * parseFloat(unitCost ?? "0")).toFixed(3);
      await db.insert(wasteLogs).values({
        wasteDate: now,
        materialId: pull.materialId,
        materialName: pull.materialName,
        materialNameAr: pull.materialNameAr ?? undefined,
        unit: pull.unit,
        wasteQty: String(actualWaste.toFixed(3)),
        unitCost: unitCost ?? undefined,
        totalCost,
        source: "kitchen",
        referenceId: id,
        reason: "هدر نهاية اليوم",
        createdBy,
      });
    }
  }

  // If carried forward > 0, create a new pull for the NEXT day after the pull's date
  if (carriedToTomorrow > 0) {
    // FIX: use pull.pullDate (the date of the record being counted) NOT now (execution time).
    // This ensures that counting a past day always carries forward to the correct next day.
    const settings = await getAppSettings();
    const tzOffsets: Record<string, number> = {
      'Asia/Dubai': 4, 'Asia/Riyadh': 3, 'Asia/Kuwait': 3, 'Asia/Qatar': 3,
      'Asia/Bahrain': 3, 'Asia/Muscat': 4, 'Africa/Cairo': 2, 'Europe/London': 0, 'UTC': 0,
    };
    const tz = settings?.timezone ?? 'Asia/Dubai';
    const localOffsetHours = tzOffsets[tz] ?? 4;
    // Get the pull's date as a local YYYY-MM-DD string
    const pullLocalMs = pull.pullDate.getTime() + localOffsetHours * 3600_000;
    const pullLocal = new Date(pullLocalMs);
    const pullYear = pullLocal.getUTCFullYear();
    const pullMonth = pullLocal.getUTCMonth(); // 0-indexed
    const pullDay = pullLocal.getUTCDate();
    // Next day = pull date + 1 calendar day, stored as noon UTC
    const nextBizLocal = new Date(Date.UTC(pullYear, pullMonth, pullDay + 1, 12, 0, 0));
    // Convert back to UTC: subtract local offset
    const tomorrow = new Date(nextBizLocal.getTime() - localOffsetHours * 3600_000);

    if (isSemiFinished) {
      // للمواد المصنّعة: سجل واحد فقط للإنتاج المتبقي مع تخزين carriedRawQty فيه
      const rawCarried = parseFloat(carriedRawQty || "0");
      await db.insert(kitchenDailyPulls).values({
        pullDate: tomorrow,
        materialId: pull.materialId,
        materialName: pull.materialName,
        materialNameAr: pull.materialNameAr ?? undefined,
        materialType: "semi_finished",
        unit: pull.unit,
        pulledQuantity: String(carriedToTomorrow.toFixed(3)),
        actualYield: String(carriedToTomorrow.toFixed(3)),
        carriedRawQty: rawCarried > 0 ? String(rawCarried.toFixed(3)) : null,
        notes: `ترحيل إنتاج من ${pull.pullDate.toLocaleDateString("ar-EG")}`,
        createdBy,
        status: "open",
        isCarriedForward: true,
      });
    } else {
      // للمواد الخام: سجل واحد فقط
      await db.insert(kitchenDailyPulls).values({
        pullDate: tomorrow,
        materialId: pull.materialId,
        materialName: pull.materialName,
        materialNameAr: pull.materialNameAr ?? undefined,
        materialType: pull.materialType,
        unit: pull.unit,
        pulledQuantity: String(carriedToTomorrow.toFixed(3)),
        notes: `ترحيل من ${pull.pullDate.toLocaleDateString("ar-EG")}`,
        createdBy,
        status: "open",
        isCarriedForward: true,
      });
    }
  }

  return { success: true, wasteQty: actualWaste, usedQty: isSemiFinished ? usedQty : undefined };
}

/** Close a pull (mark as closed after counting) */
export async function closeKitchenPull(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(kitchenDailyPulls).set({ status: "closed" }).where(eq(kitchenDailyPulls.id, id));
  return { success: true };
}

/** Admin only: reopen a closed kitchen pull back to 'counted' so it can be re-edited */
export async function reopenKitchenPull(id: number, reopenedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(kitchenDailyPulls).where(eq(kitchenDailyPulls.id, id)).limit(1);
  if (!rows[0]) throw new Error("لم يتم العثور على السجل");
  const pull = rows[0];
  if (pull.status !== "closed") throw new Error("يمكن إعادة الفتح فقط للجرد المغلق");
  await db
    .update(kitchenDailyPulls)
    .set({ status: "counted" })
    .where(eq(kitchenDailyPulls.id, id));
  return { success: true };
}

/** Undo/revert a counted kitchen pull: restore inventory and remove waste/carry-forward records */
export async function uncountKitchenPull(id: number, createdBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Fetch the pull record
  const rows = await db.select().from(kitchenDailyPulls).where(eq(kitchenDailyPulls.id, id)).limit(1);
  if (!rows[0]) throw new Error("لم يتم العثور على السحب");
  const pull = rows[0];

  if (pull.status !== "counted") throw new Error("يمكن التراجع فقط عن الجرد المكتمل");

  const isSemiFinished = pull.materialType === "semi_finished";
  // closingCount = usedQty (كمية الإنتاج المستخدم للمصنّعة، أو كمية الخام المستخدمة للخام)
  const usedQty = parseFloat(pull.closingCount ?? "0");
  const wasteQty = parseFloat(pull.wasteQty ?? "0");
  const carriedForward = parseFloat(pull.carriedForward ?? "0");
  const carriedRawQtyVal = parseFloat(pull.carriedRawQty ?? "0");
  const pulled = parseFloat(pull.pulledQuantity);
  const now = new Date();

  if (isSemiFinished) {
    // 1. Restore used quantity back to stock (كمية الإنتاج المستخدم)
    if (usedQty > 0) {
      await db
        .update(rawMaterials)
        .set({ currentQuantity: sql`currentQuantity + ${usedQty}`, updatedAt: now })
        .where(eq(rawMaterials.id, pull.materialId));
      await db.insert(inventoryTransactions).values(clean({
        materialId: pull.materialId,
        transactionType: "IN",
        quantity: usedQty.toFixed(3),
        reason: "other",
        notes: `تراجع جرد: إعادة الإنتاج المستخدم - ${pull.materialNameAr ?? pull.materialName}`,
        transactionDate: now,
        createdBy: createdBy ?? null,
}) as any);
    }

    // 2. Restore waste quantity back to stock
    if (wasteQty > 0) {
      await db
        .update(rawMaterials)
        .set({ currentQuantity: sql`currentQuantity + ${wasteQty}`, updatedAt: now })
        .where(eq(rawMaterials.id, pull.materialId));
      await db.insert(inventoryTransactions).values(clean({
        materialId: pull.materialId,
        transactionType: "IN",
        quantity: wasteQty.toFixed(3),
        reason: "other",
        notes: `تراجع جرد: إعادة الهدر - ${pull.materialNameAr ?? pull.materialName}`,
        transactionDate: now,
        createdBy: createdBy ?? null,
}) as any);

      // 3. Remove waste log entry linked to this pull
      await db.delete(wasteLogs).where(
        and(
          eq(wasteLogs.referenceId, id),
          eq(wasteLogs.source, "semi_finished")
        )
      );
    }
  } else {
    // للمواد الخام: حذف سجل الهدر المرتبط إن وجد
    if (wasteQty > 0) {
      await db.delete(wasteLogs).where(
        and(
          eq(wasteLogs.referenceId, id),
          eq(wasteLogs.source, "kitchen")
        )
      );
    }
  }

  // 4. Delete ALL carry-forward pulls for next day (including double carry for semi-finished)
  if (carriedForward > 0 || carriedRawQtyVal > 0) {
    // حذف سجل الإنتاج المرحّل (semi_finished)
    const carryRows = await db
      .select()
      .from(kitchenDailyPulls)
      .where(
        and(
          eq(kitchenDailyPulls.materialId, pull.materialId),
          eq(kitchenDailyPulls.isCarriedForward, true),
          sql`notes LIKE '%ترحيل%'`,
          sql`id > ${id}`
        )
      )
      .orderBy(kitchenDailyPulls.id)
      .limit(5);
    for (const row of carryRows) {
      await db.delete(kitchenDailyPulls).where(eq(kitchenDailyPulls.id, row.id));
    }

    // ملاحظة: الترحيل الجديد ينشئ سجلاً واحداً فقط للمادة المصنّعة (carriedRawQty مخزّن فيه)
    // لا حاجة للبحث عن سجلات خام منفصلة بعد الإصلاح
  }

  // 5. Reset the pull back to open status, clear ALL count fields
  await db
    .update(kitchenDailyPulls)
    .set({
      closingCount: null,
      carriedForward: null,
      carriedRawQty: null,
      wasteQty: null,
      status: "open",
    })
    .where(eq(kitchenDailyPulls.id, id));

  return { success: true, usedQty, wasteQty, carriedForward, carriedRawQtyVal };
}

// ─── Waste Logs ───────────────────────────────────────────────────────────────

/** Get waste logs with optional date range and source filter */
export async function getWasteLogs(opts?: {
  from?: string;
  to?: string;
  source?: "kitchen" | "raw_material" | "semi_finished";
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  // Business day = 6AM UAE to 6AM UAE next day (UTC-2 shift).
  const tzOffset = await getBusinessDayTzOffset();
  if (opts?.from) conditions.push(sql`DATE(CONVERT_TZ(${wasteLogs.wasteDate}, '+00:00', ${tzOffset})) >= ${opts.from}`);
  if (opts?.to) conditions.push(sql`DATE(CONVERT_TZ(${wasteLogs.wasteDate}, '+00:00', ${tzOffset})) <= ${opts.to}`);
  if (opts?.source) conditions.push(eq(wasteLogs.source, opts.source));
  // JOIN with kitchen_daily_pulls to get pulledQuantity (raw stock pulled)
  const query = db
    .select({
      id: wasteLogs.id,
      wasteDate: wasteLogs.wasteDate,
      materialId: wasteLogs.materialId,
      materialName: wasteLogs.materialName,
      materialNameAr: wasteLogs.materialNameAr,
      unit: wasteLogs.unit,
      wasteQty: wasteLogs.wasteQty,
      unitCost: wasteLogs.unitCost,
      totalCost: wasteLogs.totalCost,
      source: wasteLogs.source,
      referenceId: wasteLogs.referenceId,
      reason: wasteLogs.reason,
      notes: wasteLogs.notes,
      createdBy: wasteLogs.createdBy,
      createdAt: wasteLogs.createdAt,
      // rawUsedForWaste = (wasteQty / actualYield) * pulledQuantity
      // = كمية الخام التي استُهلكت لإنتاج كمية الهدر
      rawUsedForWaste: sql<string | null>`
        CASE
          WHEN ${kitchenDailyPulls.actualYield} IS NOT NULL
            AND CAST(${kitchenDailyPulls.actualYield} AS DECIMAL(12,3)) > 0
          THEN ROUND(
            (CAST(${wasteLogs.wasteQty} AS DECIMAL(12,3)) / CAST(${kitchenDailyPulls.actualYield} AS DECIMAL(12,3)))
            * CAST(${kitchenDailyPulls.pulledQuantity} AS DECIMAL(12,3)),
            3
          )
          WHEN ${kitchenDailyPulls.pulledQuantity} IS NOT NULL
          THEN CAST(${wasteLogs.wasteQty} AS DECIMAL(12,3))
          ELSE NULL
        END
      `,
    })
    .from(wasteLogs)
    .leftJoin(
      kitchenDailyPulls,
      and(
        eq(wasteLogs.referenceId, kitchenDailyPulls.id),
        sql`${wasteLogs.source} IN ('kitchen', 'semi_finished')`
      )
    );
  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(desc(wasteLogs.wasteDate))
    : await query.orderBy(desc(wasteLogs.wasteDate));

  // For semi_finished rows: enrich with recipe cost per unit
  // Collect unique semi_finished materialIds
  const semiIdsSet = new Set<number>();
  rows
    .filter((r) => r.source === "semi_finished" || r.source === "kitchen")
    .forEach((r) => semiIdsSet.add(r.materialId));
  const semiIds = Array.from(semiIdsSet);
  const recipeCostMap: Record<number, number> = {};
  for (const mid of semiIds) {
    try {
      recipeCostMap[mid] = await calcSemiFinishedCost(mid);
    } catch {
      recipeCostMap[mid] = 0;
    }
  }

  return rows.map((r) => {
    if ((r.source === "semi_finished" || r.source === "kitchen") && recipeCostMap[r.materialId] != null) {
      return { ...r, recipeCostPerUnit: String(recipeCostMap[r.materialId].toFixed(4)) };
    }
    return { ...r, recipeCostPerUnit: null as string | null };
  });
}

/** Manually add a waste log (for raw material or semi-finished waste) */
export async function addWasteLog(data: {
  wasteDate: Date;
  materialId: number;
  materialName: string;
  materialNameAr?: string;
  unit: string;
  wasteQty: string;
  unitCost?: string;
  source: "kitchen" | "raw_material" | "semi_finished";
  reason?: string;
  notes?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const unitCost = data.unitCost ?? "0";
  const totalCost = (parseFloat(data.wasteQty) * parseFloat(unitCost)).toFixed(3);
  // Deduct from inventory
  await db
    .update(rawMaterials)
    .set({
      currentQuantity: sql`GREATEST(0, currentQuantity - ${parseFloat(data.wasteQty)})`,
    })
    .where(eq(rawMaterials.id, data.materialId));
  // Record OUT transaction
  await db.insert(inventoryTransactions).values(clean({
    materialId: data.materialId,
    transactionType: "OUT",
    quantity: data.wasteQty,
    reason: "waste",
    transactionDate: data.wasteDate,
    notes: data.notes ?? data.reason ?? "هدر",
    createdBy: data.createdBy,
}) as any);
  const [result] = await db.insert(wasteLogs).values({
    ...data,
    totalCost,
  });
  return (result as any).insertId as number;
}

/** Delete a waste log */
export async function deleteWasteLog(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(wasteLogs).where(eq(wasteLogs.id, id)).limit(1);
  if (!rows[0]) throw new Error("Waste log not found");
  const log = rows[0];
  // Restore inventory
  await db
    .update(rawMaterials)
    .set({
      currentQuantity: sql`currentQuantity + ${parseFloat(log.wasteQty)}`,
    })
    .where(eq(rawMaterials.id, log.materialId));
  // Also delete the associated OUT transaction to keep records consistent.
  // This prevents double-restoration if someone tries to delete the transaction separately.
  await db.delete(inventoryTransactions).where(
    and(
      eq(inventoryTransactions.materialId, log.materialId),
      eq(inventoryTransactions.transactionType, "OUT"),
      eq(inventoryTransactions.reason, "waste"),
      sql`ABS(TIMESTAMPDIFF(SECOND, ${inventoryTransactions.transactionDate}, ${log.wasteDate})) < 5`
    )
  );
  await db.delete(wasteLogs).where(eq(wasteLogs.id, id));
  return { success: true };
}

// ─── App Settings ─────────────────────────────────────────────────────────────

/**
 * Returns the MySQL CONVERT_TZ offset string that maps UTC timestamps to
 * "business day" dates.  A business day starts at `businessDayStartHour` in
 * the restaurant's local timezone (default Asia/Dubai = UTC+4).
 *
 * Logic: to group midnight-to-startHour with the *previous* calendar day we
 * subtract startHour hours from the local time before calling DATE().
 * net offset = localUtcOffset - startHour hours.
 * For Dubai (UTC+4) with startHour=6: net = +4h - 6h = -2h → '-02:00'
 * For Dubai (UTC+4) with startHour=0: net = +4h - 0h = +4h → '+04:00'
 */
let _cachedOffset: string | null = null;
let _cacheExpiry = 0;
export async function getBusinessDayTzOffset(): Promise<string> {
  const now = Date.now();
  if (_cachedOffset && now < _cacheExpiry) return _cachedOffset;
  const settings = await getAppSettings();
  const startHour = settings?.businessDayStartHour ?? 6;
  // Timezone offset in hours (positive = ahead of UTC)
  const tzOffsets: Record<string, number> = {
    'Asia/Dubai': 4, 'Asia/Riyadh': 3, 'Asia/Kuwait': 3, 'Asia/Qatar': 3,
    'Asia/Bahrain': 3, 'Asia/Muscat': 4, 'Africa/Cairo': 2, 'Europe/London': 0, 'UTC': 0,
  };
  const tz = settings?.timezone ?? 'Asia/Dubai';
  const localOffset = tzOffsets[tz] ?? 4;
  const netHours = localOffset - startHour;
  const sign = netHours >= 0 ? '+' : '-';
  const absH = Math.abs(netHours);
  const offset = `${sign}${String(absH).padStart(2, '0')}:00`;
  _cachedOffset = offset;
  _cacheExpiry = now + 60_000; // cache for 1 minute
  return offset;
}

/**
 * Returns the local timezone offset string (e.g. '+04:00' for Dubai)
 * WITHOUT subtracting the business-day start hour.
 * Use this for payment date matching (paidAt) where we want the calendar date
 * in local time, not the business-day shifted date.
 */
export async function getLocalTzOffset(): Promise<string> {
  const settings = await getAppSettings();
  const tzOffsets: Record<string, number> = {
    'Asia/Dubai': 4, 'Asia/Riyadh': 3, 'Asia/Kuwait': 3, 'Asia/Qatar': 3,
    'Asia/Bahrain': 3, 'Asia/Muscat': 4, 'Africa/Cairo': 2, 'Europe/London': 0, 'UTC': 0,
  };
  const tz = settings?.timezone ?? 'Asia/Dubai';
  const localOffset = tzOffsets[tz] ?? 4;
  const sign = localOffset >= 0 ? '+' : '-';
  const absH = Math.abs(localOffset);
  return `${sign}${String(absH).padStart(2, '0')}:00`;
}

/** Invalidate the cached business day offset (call after settings update). */
export function invalidateBusinessDayCache() {
  _cachedOffset = null;
  _cacheExpiry = 0;
}

/** Get the single app settings row (id=1). Returns defaults if not found. */
/** Resolve the effective OpenAI API key: DB-stored value takes priority, falls back to env var. */
export async function getEffectiveOpenAIApiKey(): Promise<string | null> {
  const settings = await getAppSettings();
  const dbKey = (settings as any)?.openaiApiKey;
  if (dbKey && typeof dbKey === "string" && dbKey.trim()) return dbKey.trim();
  return process.env.OPENAI_API_KEY || null;
}

export async function getAppSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  if (rows.length > 0) return rows[0];
  // Auto-create default row
  await db.insert(appSettings).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
  const created = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return created[0] ?? null;
}

/** Update app settings (partial update). Invalidates the business day offset cache. */
export async function updateAppSettings(data: Partial<{
  restaurantName: string;
  restaurantNameEn: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  businessDayStartHour: number;
  currency: string;
  currencySymbol: string;
  vatRate: string;
  vatEnabled: boolean;
  openaiApiKey: string | null;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(appSettings).set(data).where(eq(appSettings.id, 1));
  invalidateBusinessDayCache(); // force re-read on next query
  return getAppSettings();
}

// ─── Analytics Dashboard ─────────────────────────────────────────────────────

async function getRawConn() {
  const mysql = await import("mysql2/promise");
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  return conn;
}

export async function getAnalyticsSummary() {
  const conn = await getRawConn();
  try {
    const [[stockVal]] = await conn.execute(`
      SELECT 
        COALESCE(SUM(CASE WHEN materialType != 'semi_finished' AND currentQuantity > 0 THEN currentQuantity * COALESCE(lastPurchasePrice, averageCost, 0) ELSE 0 END), 0) as rawMaterialsValue,
        COUNT(CASE WHEN materialType != 'semi_finished' THEN 1 END) as totalRawMaterials,
        COUNT(CASE WHEN materialType = 'semi_finished' THEN 1 END) as totalSemiFinished,
        SUM(CASE WHEN currentQuantity <= 0 THEN 1 ELSE 0 END) as outOfStock,
        SUM(CASE WHEN minimumQuantity > 0 AND currentQuantity <= minimumQuantity AND currentQuantity > 0 THEN 1 ELSE 0 END) as lowStock,
        SUM(CASE WHEN currentQuantity < 0 THEN 1 ELSE 0 END) as negativeStock
      FROM raw_materials WHERE isActive = 1
    `) as any;

    // Calculate semi-finished value using recipe cost × current quantity
    const [sfMaterials] = await conn.execute(`
      SELECT id, currentQuantity FROM raw_materials
      WHERE materialType = 'semi_finished' AND currentQuantity > 0 AND isActive = 1
    `) as any;
    let semiFinishedValue = 0;
    for (const mat of sfMaterials) {
      const recipeCost = await calcSemiFinishedCost(mat.id);
      semiFinishedValue += recipeCost * parseFloat(mat.currentQuantity);
    }
    (stockVal as any).semiFinishedValue = semiFinishedValue.toFixed(2);

    const [[invoiceStats]] = await conn.execute(`
      SELECT 
        COUNT(*) as totalInvoices,
        COALESCE(SUM(totalAmount), 0) as totalPurchases,
        COALESCE(SUM(CASE WHEN paymentStatus IN ('deferred','partial') THEN remainingAmount ELSE 0 END), 0) as totalDeferred,
        COALESCE(SUM(paidAmount), 0) as totalPaid,
        COALESCE(SUM(vatAmount), 0) as totalVat
      FROM invoices
    `) as any;

    const [[wasteStats]] = await conn.execute(`
      SELECT COALESCE(SUM(totalCost), 0) as totalWasteCost, COUNT(*) as wasteCount FROM waste_logs
    `) as any;

    // Total sales from sales_reports
    const [[salesStats]] = await conn.execute(`
      SELECT 
        COALESCE(SUM(totalNetSales), 0) as totalNetSales,
        COALESCE(SUM(totalSales), 0) as totalGrossSales,
        COALESCE(SUM(totalQty), 0) as totalQty,
        COUNT(*) as totalReports
      FROM sales_reports
    `) as any;

     const [[todayProduction]] = await conn.execute(`
      SELECT COUNT(DISTINCT materialId) as itemsProduced, COALESCE(SUM(pulledQuantity), 0) as totalQty
      FROM kitchen_daily_pulls WHERE DATE(pullDate) = CURDATE()
    `) as any;

    // Calculate total used value from kitchen daily pulls (counted + closed)
    // نفس منطق totalUsedValue في KitchenProductionPage: closingCount × unitCost
    const [allKitchenPulls] = await conn.execute(`
      SELECT k.materialId, k.materialType, k.closingCount
      FROM kitchen_daily_pulls k
      WHERE k.status IN ('counted', 'closed')
        AND COALESCE(k.closingCount, 0) > 0
    `) as any;
    let totalKitchenUsedValueNum = 0;
    for (const pull of (allKitchenPulls as any[])) {
      const qty = parseFloat(pull.closingCount) || 0;
      if (qty > 0) {
        totalKitchenUsedValueNum += await calcKitchenPullRawCost(Number(pull.materialId), pull.materialType, qty);
      }
    }
    const totalKitchenUsedValue = totalKitchenUsedValueNum.toFixed(2);

    return {
      stock: stockVal,
      invoices: invoiceStats,
      waste: wasteStats,
      todayProduction,
      kitchenUsedValue: totalKitchenUsedValue,
      sales: salesStats,
    };
  } finally {
    await conn.end();
  }
}

export async function getTopConsumedMaterials(days = 30, limit = 10) {
  const conn = await getRawConn();
  const daysInt = parseInt(String(days), 10);
  const limitInt = parseInt(String(limit), 10);
  try {
    const [rows] = await conn.query(`
      SELECT rm.nameAr, rm.name, rm.unit,
             CAST(SUM(it.quantity) AS DECIMAL(15,3)) as totalOut,
             CAST(SUM(it.quantity * COALESCE(it.unitPrice, rm.averageCost, rm.lastPurchasePrice, 0)) AS DECIMAL(15,2)) as totalCost
      FROM inventory_transactions it
      JOIN raw_materials rm ON rm.id = it.materialId
      WHERE it.transactionType = 'OUT' 
        AND it.createdAt >= DATE_SUB(NOW(), INTERVAL ${daysInt} DAY)
      GROUP BY rm.id, rm.nameAr, rm.name, rm.unit
      ORDER BY totalCost DESC
      LIMIT ${limitInt}
    `) as any;
    return rows as any[];
  } finally {
    await conn.end();
  }
}

export async function getDailyInventoryFlow(days = 14) {
  const conn = await getRawConn();
  const daysInt = parseInt(String(days), 10);
  try {
    const [rows] = await conn.query(`
      SELECT 
        DATE(createdAt) as day,
        CAST(SUM(CASE WHEN transactionType='IN' THEN quantity * COALESCE(unitPrice, 0) ELSE 0 END) AS DECIMAL(15,2)) as inValue,
        CAST(SUM(CASE WHEN transactionType='OUT' THEN quantity * COALESCE(unitPrice, 0) ELSE 0 END) AS DECIMAL(15,2)) as outValue,
        SUM(CASE WHEN transactionType='IN' THEN 1 ELSE 0 END) as inCount,
        SUM(CASE WHEN transactionType='OUT' THEN 1 ELSE 0 END) as outCount
      FROM inventory_transactions
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${daysInt} DAY)
      GROUP BY day ORDER BY day ASC
    `) as any;
    return rows as any[];
  } finally {
    await conn.end();
  }
}

export async function getSupplierSpendAnalysis() {
  const conn = await getRawConn();
  try {
    const [rows] = await conn.execute(`
      SELECT 
        supplierName,
        COUNT(*) as invoiceCount,
        CAST(SUM(totalAmount) AS DECIMAL(15,2)) as totalSpend,
        CAST(SUM(paidAmount) AS DECIMAL(15,2)) as totalPaid,
        CAST(SUM(totalAmount - paidAmount) AS DECIMAL(15,2)) as remaining,
        MAX(invoiceDate) as lastInvoice
      FROM invoices
      GROUP BY supplierName
      ORDER BY totalSpend DESC
      LIMIT 10
    `) as any;
    return rows as any[];
  } finally {
    await conn.end();
  }
}

export async function getKitchenProductionTrend(days = 7) {
  const conn = await getRawConn();
  const daysInt = parseInt(String(days), 10);
  try {
    const [rows] = await conn.query(`
      SELECT 
        DATE(pullDate) as day,
        COUNT(DISTINCT materialId) as itemsCount,
        CAST(SUM(pulledQuantity) AS DECIMAL(12,2)) as totalProduced,
        SUM(CASE WHEN status != 'open' THEN 1 ELSE 0 END) as closedCount,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as openCount
      FROM kitchen_daily_pulls
      WHERE pullDate >= DATE_SUB(NOW(), INTERVAL ${daysInt} DAY)
      GROUP BY day ORDER BY day ASC
    `) as any;
    return rows as any[];
  } finally {
    await conn.end();
  }
}

export async function getCriticalStockMaterials(limit = 15) {
  const conn = await getRawConn();
  const limitInt = parseInt(String(limit), 10);
  try {
    const [rows] = await conn.query(`
      SELECT 
        rm.nameAr, rm.name, rm.unit,
        CAST(rm.currentQuantity AS DECIMAL(12,3)) as currentQuantity,
        CAST(rm.minimumQuantity AS DECIMAL(12,3)) as minimumQuantity,
        CAST(rm.reorderQuantity AS DECIMAL(12,3)) as reorderQuantity,
        CAST(rm.lastPurchasePrice AS DECIMAL(12,3)) as lastPurchasePrice,
        mc.nameAr as categoryName, mc.color as categoryColor,
        CASE 
          WHEN rm.currentQuantity < 0 THEN 'negative'
          WHEN rm.currentQuantity = 0 THEN 'out'
          ELSE 'low'
        END as stockStatus,
        CASE 
          WHEN rm.minimumQuantity > 0 THEN ROUND(rm.currentQuantity / rm.minimumQuantity * 100, 1)
          ELSE NULL
        END as stockPct
      FROM raw_materials rm
      LEFT JOIN material_categories mc ON mc.id = rm.categoryId
      WHERE rm.isActive = 1 
        AND rm.minimumQuantity > 0 
        AND rm.currentQuantity <= rm.minimumQuantity
      ORDER BY rm.currentQuantity ASC
      LIMIT ${limitInt}
    `) as any;
    return rows as any[];
  } finally {
    await conn.end();
  }
}

export async function getMonthlyPurchaseTrend(months = 6) {
  const conn = await getRawConn();
  const monthsInt = parseInt(String(months), 10);
  try {
    const [rows] = await conn.query(`
      SELECT 
        DATE_FORMAT(invoiceDate, '%Y-%m') as month,
        COUNT(*) as invoiceCount,
        CAST(SUM(totalAmount) AS DECIMAL(15,2)) as total,
        CAST(SUM(vatAmount) AS DECIMAL(15,2)) as vat,
        CAST(SUM(totalAmount - vatAmount) AS DECIMAL(15,2)) as subtotal
      FROM invoices
      WHERE invoiceDate >= DATE_SUB(NOW(), INTERVAL ${monthsInt} MONTH)
      GROUP BY month ORDER BY month ASC
    `) as any;
    return rows as any[];
  } finally {
    await conn.end();
  }
}

export async function getTopProducedSemiFinished(days = 30, limit = 8) {
  const conn = await getRawConn();
  const daysInt = parseInt(String(days), 10);
  const limitInt = parseInt(String(limit), 10);
  try {
    const [rows] = await conn.query(`
      SELECT rm.nameAr, rm.name, rm.unit,
             CAST(SUM(it.quantity) AS DECIMAL(12,2)) as totalProduced,
             CAST(rm.currentQuantity AS DECIMAL(12,2)) as currentStock
      FROM inventory_transactions it
      JOIN raw_materials rm ON rm.id = it.materialId
      WHERE it.transactionType = 'IN' 
        AND it.notes LIKE '%إنتاج%'
        AND it.createdAt >= DATE_SUB(NOW(), INTERVAL ${daysInt} DAY)
        AND rm.materialType = 'semi_finished'
      GROUP BY rm.id, rm.nameAr, rm.name, rm.unit, rm.currentQuantity
      ORDER BY totalProduced DESC
      LIMIT ${limitInt}
    `) as any;
    return rows as any[];
  } finally {
    await conn.end();
  }
}

// ─── Inventory KPIs ───────────────────────────────────────────────────────────

/**
 * Returns KPI values for the materials page:
 * 1. Total raw materials value = SUM(currentQty × lastPurchasePrice) for type='raw'
 * 2. Total semi-finished materials value = SUM(currentQty × recipeCost) for type='semi_finished'
 * 3. Chicken total quantity = SUM(currentQty) for materials with 'دجاج' or 'chicken' in name
 */
export async function getInventoryKpis(): Promise<{
  rawMaterialsTotalValue: number;
  semiFinishedTotalValue: number;
  chickenTotalQty: number;
  chickenUnit: string;
  chickenItems: { name: string; qty: number; unit: string }[];
  charcoalQty: number;
  charcoalUnit: string;
  gasQty: number;
  gasUnit: string;
  meatKoftaQty: number;
  meatKoftaUnit: string;
}> {
  const db = await getDb();
  if (!db) return { rawMaterialsTotalValue: 0, semiFinishedTotalValue: 0, chickenTotalQty: 0, chickenUnit: "pcs", chickenItems: [], charcoalQty: 0, charcoalUnit: "Pcs", gasQty: 0, gasUnit: "Pcs", meatKoftaQty: 0, meatKoftaUnit: "kg" };

  const materials = await db
    .select({
      id: rawMaterials.id,
      name: rawMaterials.name,
      unit: rawMaterials.unit,
      currentQuantity: rawMaterials.currentQuantity,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      materialType: rawMaterials.materialType,
    })
    .from(rawMaterials)
    .where(eq(rawMaterials.isActive, true));

  // جلب مجموع الكمية المسحوبة المفتوحة لكل مادة مصنّعة
  const openPulledRows = await db
    .select({
      materialId: kitchenDailyPulls.materialId,
      totalPulled: sql<string>`SUM(${kitchenDailyPulls.pulledQuantity})`,
    })
    .from(kitchenDailyPulls)
    .where(and(
      eq(kitchenDailyPulls.materialType, "semi_finished"),
      eq(kitchenDailyPulls.status, "open")
    ))
    .groupBy(kitchenDailyPulls.materialId);
  const openPulledMap = new Map<number, number>();
  for (const pr of openPulledRows) {
    openPulledMap.set(pr.materialId, parseFloat(pr.totalPulled ?? "0"));
  }
  let rawMaterialsTotalValue = 0;
  let semiFinishedTotalValue = 0;
  let chickenTotalQty = 0;
  const chickenItems: { name: string; qty: number; unit: string }[] = [];
  let chickenUnit = "pcs";
  let charcoalQty = 0;
  let charcoalUnit = "Pcs";
  let gasQty = 0;
  let gasUnit = "Pcs";
  let meatKoftaQty = 0;
  let meatKoftaUnit = "kg";
  for (const m of materials) {
    const qty = parseFloat(m.currentQuantity ?? "0");
    if (qty <= 0) {
      // Still check chicken even with 0 qty for display
    }
    if (m.materialType === "raw" || !m.materialType) {
      // Only count positive quantities (same as analytics page)
      if (qty > 0) {
        const price = parseFloat(m.lastPurchasePrice ?? "0");
        rawMaterialsTotalValue += qty * price;
      }
    } else if (m.materialType === "semi_finished") {
      // استخدم مجموع الكمية المسحوبة المفتوحة × تكلفة الوصفة
      const openPulled = openPulledMap.get(m.id) ?? 0;
      if (openPulled > 0) {
        const unitCost = await calcSemiFinishedCost(m.id);
        semiFinishedTotalValue += openPulled * unitCost;
      }
     }
    // Chicken check - only the exact raw material named 'دجاج كاملة'
    const trimmedName = (m.name ?? "").trim();
    if ((m.materialType === "raw" || !m.materialType) && trimmedName === "دجاج كاملة") {
      chickenTotalQty += qty;
      chickenItems.push({ name: m.name ?? "", qty, unit: m.unit ?? "pcs" });
      chickenUnit = m.unit ?? "pcs";
    }
    // Charcoal check - 'الفحم'
    if ((m.materialType === "raw" || !m.materialType) && trimmedName === "الفحم") {
      charcoalQty += qty;
      charcoalUnit = m.unit ?? "Pcs";
    }
    // Gas check - 'الغاز'
    if ((m.materialType === "raw" || !m.materialType) && trimmedName === "الغاز") {
      gasQty += qty;
      gasUnit = m.unit ?? "Pcs";
    }
    // Meat kofta check - 'لحم كفتة'
    if ((m.materialType === "raw" || !m.materialType) && trimmedName === "لحم كفتة") {
      meatKoftaQty += qty;
      meatKoftaUnit = m.unit ?? "kg";
    }
  }

  return {
    rawMaterialsTotalValue: parseFloat(rawMaterialsTotalValue.toFixed(3)),
    semiFinishedTotalValue: parseFloat(semiFinishedTotalValue.toFixed(3)),
    chickenTotalQty: parseFloat(chickenTotalQty.toFixed(3)),
    chickenUnit,
    chickenItems,
    charcoalQty: parseFloat(charcoalQty.toFixed(3)),
    charcoalUnit,
    gasQty: parseFloat(gasQty.toFixed(3)),
    gasUnit,
    meatKoftaQty: parseFloat(meatKoftaQty.toFixed(3)),
    meatKoftaUnit,
  };
}

// ─── Analytics: Profit & Loss + Weekly Trends ────────────────────────────────

export async function getAnalyticsProfitLoss(filter?: { startDate?: string; endDate?: string }): Promise<{
  totalSales: number;
  totalUnits: number;
  totalKitchenCost: number;
  grossProfit: number;
  grossMarginPct: number;
  foodCostPct: number;
  totalPurchases: number;
  totalDeferred: number;
  debtRatioPct: number;
  rawStockValue: number;
  semiStockValue: number;
  weeklyTrend: Array<{
    day: string;
    sales: number;
    cost: number;
    profit: number;
    margin: number;
  }>;
}> {
  const conn = await getRawConn();
  try {
    // Build date filter clauses
    const hasDateFilter = filter?.startDate || filter?.endDate;
    // For sales: filter by sales_reports.reportDateFrom
    const salesDateWhere = hasDateFilter
      ? `WHERE ${filter?.startDate ? `DATE(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00')) >= '${filter.startDate}'` : '1=1'}
         ${filter?.startDate && filter?.endDate ? 'AND' : ''}
         ${filter?.endDate ? `DATE(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00')) <= '${filter.endDate}'` : ''}`
      : '';
    // For pulls: filter by updatedAt (المادة تنتمي لليوم الذي أُغلقت فيه)
    const pullsDateWhere = hasDateFilter
      ? `AND ${filter?.startDate ? `DATE(DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) >= '${filter.startDate}'` : '1=1'}
         ${filter?.startDate && filter?.endDate ? 'AND' : ''}
         ${filter?.endDate ? `DATE(DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) <= '${filter.endDate}'` : ''}`
      : '';
    // For invoices: filter by invoiceDate
    const invoiceDateWhere = hasDateFilter
      ? `AND ${filter?.startDate ? `DATE(invoiceDate) >= '${filter.startDate}'` : '1=1'}
         ${filter?.startDate && filter?.endDate ? 'AND' : ''}
         ${filter?.endDate ? `DATE(invoiceDate) <= '${filter.endDate}'` : ''}`
      : '';

    // 1. Total sales from all reports
    const [salesRows] = await conn.execute(`
      SELECT 
        COALESCE(SUM(si.netSales), 0) as totalSales,
        COALESCE(SUM(si.qty), 0) as totalUnits
      FROM sale_items si
      JOIN sales_reports sr ON si.reportId = sr.id
      ${salesDateWhere}
    `) as any[];
    const totalSales = parseFloat(salesRows[0].totalSales) || 0;
    const totalUnits = parseInt(salesRows[0].totalUnits) || 0;

    // 2. Total kitchen cost (counted + closed) — batch SQL (no N+1)
    // للخام: closingCount × lastPurchasePrice
    // للمصنّعة: closingCount × (مجموع quantity × lastPurchasePrice لكل مكوّن في الوصفة)
    const [pullRows] = await conn.execute(`
      SELECT
        kdp.materialId,
        kdp.materialType,
        COALESCE(kdp.closingCount, 0) as closingCount,
        COALESCE(rm.lastPurchasePrice, 0) as unitCost,
        COALESCE((
          SELECT SUM(sfr.quantity * COALESCE(rm2.lastPurchasePrice, 0))
          FROM semi_finished_recipes sfr
          LEFT JOIN raw_materials rm2 ON sfr.ingredientId = rm2.id
          WHERE sfr.materialId = kdp.materialId
        ), 0) as recipeCost
      FROM kitchen_daily_pulls kdp
      LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
      WHERE kdp.status IN ('counted', 'closed')
        AND COALESCE(kdp.closingCount, 0) > 0
        ${pullsDateWhere}
    `) as any[];

    let totalKitchenCost = 0;
    for (const pull of pullRows) {
      const qty = parseFloat(pull.closingCount) || 0;
      if (qty <= 0) continue;
      if (pull.materialType === 'semi_finished') {
        const rCost = parseFloat(pull.recipeCost) || 0;
        const dCost = parseFloat(pull.unitCost) || 0;
        totalKitchenCost += qty * (dCost > 0 ? dCost : rCost);
      } else {
        totalKitchenCost += qty * (parseFloat(pull.unitCost) || 0);
      }
    }

    // 3. Purchases & deferred
    const [invRows] = await conn.execute(`
      SELECT 
        COALESCE(SUM(totalAmount), 0) as totalPurchases,
        COALESCE(SUM(CASE WHEN paymentStatus IN ('deferred','partial') THEN remainingAmount ELSE 0 END), 0) as totalDeferred
      FROM invoices
      WHERE 1=1 ${invoiceDateWhere}
    `) as any[];
    const totalPurchases = parseFloat(invRows[0].totalPurchases) || 0;
    const totalDeferred = parseFloat(invRows[0].totalDeferred) || 0;

    // 4. Stock values
    const [rawRows] = await conn.execute(`
      SELECT COALESCE(SUM(currentQuantity * COALESCE(lastPurchasePrice, averageCost, 0)), 0) as val
      FROM raw_materials
      WHERE materialType != 'semi_finished' AND currentQuantity > 0
    `) as any[];
    const rawStockValue = parseFloat(rawRows[0].val) || 0;

    // Semi-finished stock value — batch SQL (no N+1)
    const [semiRows] = await conn.execute(`
      SELECT
        rm.id,
        rm.currentQuantity,
        COALESCE(rm.lastPurchasePrice, 0) as directPrice,
        COALESCE((
          SELECT SUM(sfr.quantity * COALESCE(rm2.lastPurchasePrice, 0))
          FROM semi_finished_recipes sfr
          LEFT JOIN raw_materials rm2 ON sfr.ingredientId = rm2.id
          WHERE sfr.materialId = rm.id
        ), 0) as recipeCost
      FROM raw_materials rm
      WHERE rm.materialType = 'semi_finished' AND rm.currentQuantity > 0
    `) as any[];
    let semiStockValue = 0;
    for (const row of semiRows) {
      const qty = parseFloat(row.currentQuantity) || 0;
      const directPrice = parseFloat(row.directPrice) || 0;
      const recipeCost = parseFloat(row.recipeCost) || 0;
      const cost = directPrice > 0 ? directPrice : recipeCost;
      semiStockValue += qty * cost;
    }

    // 5. Weekly trend (last 7 days with sales data)
    const [weeklyRows] = await conn.execute(`
      SELECT 
        DATE(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00')) as day,
        COALESCE(SUM(si.netSales), 0) as sales,
        COALESCE(SUM(si.qty), 0) as units
      FROM sales_reports sr
      JOIN sale_items si ON si.reportId = sr.id
      ${salesDateWhere}
      GROUP BY DATE(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00'))
      ORDER BY day DESC
      LIMIT 7
    `) as any[];

    // Get kitchen cost per day — batch SQL (no N+1)
    const [dailyCostRows] = await conn.execute(`
      SELECT
        DATE_FORMAT(DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR), '%Y-%m-%d') as day,
        kdp.materialType,
        COALESCE(kdp.closingCount, 0) as closingCount,
        COALESCE(rm.lastPurchasePrice, 0) as unitCost,
        COALESCE((
          SELECT SUM(sfr.quantity * COALESCE(rm2.lastPurchasePrice, 0))
          FROM semi_finished_recipes sfr
          LEFT JOIN raw_materials rm2 ON sfr.ingredientId = rm2.id
          WHERE sfr.materialId = kdp.materialId
        ), 0) as recipeCost
      FROM kitchen_daily_pulls kdp
      LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
      WHERE kdp.status IN ('counted', 'closed')
        AND COALESCE(kdp.closingCount, 0) > 0
        ${pullsDateWhere}
    `) as any[];

    // Group cost by day
    const costByDay: Record<string, number> = {};
    for (const pull of dailyCostRows) {
      const day = String(pull.day).slice(0, 10);
      const qty = parseFloat(pull.closingCount) || 0;
      if (qty <= 0) continue;
      let unitCost = 0;
      if (pull.materialType === 'semi_finished') {
        const dCost = parseFloat(pull.unitCost) || 0;
        const rCost = parseFloat(pull.recipeCost) || 0;
        unitCost = dCost > 0 ? dCost : rCost;
      } else {
        unitCost = parseFloat(pull.unitCost) || 0;
      }
      costByDay[day] = (costByDay[day] || 0) + qty * unitCost;
    }

    const weeklyTrend = weeklyRows.map((row: any) => {
      const day = row.day instanceof Date ? row.day.toISOString().split('T')[0] : String(row.day).split('T')[0];
      const sales = parseFloat(row.sales) || 0;
      const cost = costByDay[day] || 0;
      const profit = sales - cost;
      const margin = sales > 0 ? (profit / sales) * 100 : 0;
      return { day, sales, cost, profit, margin: parseFloat(margin.toFixed(1)) };
    }).reverse();

    const grossProfit = totalSales - totalKitchenCost;
    const grossMarginPct = totalSales > 0 ? parseFloat(((grossProfit / totalSales) * 100).toFixed(1)) : 0;
    const foodCostPct = totalSales > 0 ? parseFloat(((totalKitchenCost / totalSales) * 100).toFixed(1)) : 0;
    const debtRatioPct = totalPurchases > 0 ? parseFloat(((totalDeferred / totalPurchases) * 100).toFixed(1)) : 0;

    return {
      totalSales,
      totalUnits,
      totalKitchenCost: parseFloat(totalKitchenCost.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossMarginPct,
      foodCostPct,
      totalPurchases,
      totalDeferred,
      debtRatioPct,
      rawStockValue: parseFloat(rawStockValue.toFixed(2)),
      semiStockValue: parseFloat(semiStockValue.toFixed(2)),
      weeklyTrend,
    };
  } finally {
    await conn.end();
  }
}

// ─── Analytics: COGS (Cost of Goods Sold) ────────────────────────────────────
// COGS = مخزون أول المدة + مشتريات الفترة − مخزون آخر المدة (الحالي)

export async function getAnalyticsCOGS(filter?: { startDate?: string; endDate?: string }): Promise<{
  openingStock: number;
  purchases: number;
  closingStock: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalSales: number;
  // Inventory Turnover
  avgStock: number;
  inventoryTurnover: number;
  daysOnHand: number;
  // Working Capital
  totalStockValue: number;
  rawStockValue: number;
  semiStockValue: number;
  capitalLocked: number;
  capitalLockedPct: number;
}> {
  const conn = await getRawConn();
  try {
    // 1. Opening stock value from app_settings
    const [settingsRows] = await conn.execute(`SELECT openingStockValue FROM app_settings WHERE id = 1`) as any[];
    const openingStock = parseFloat(settingsRows[0]?.openingStockValue ?? 0) || 0;

    // 2. Purchases in period from invoices
    const hasDateFilter = filter?.startDate || filter?.endDate;
    const invDateWhere = hasDateFilter
      ? `AND ${filter?.startDate ? `DATE(invoiceDate) >= '${filter.startDate}'` : '1=1'}
         ${filter?.startDate && filter?.endDate ? 'AND' : ''}
         ${filter?.endDate ? `DATE(invoiceDate) <= '${filter.endDate}'` : ''}`
      : '';
    const [invRows] = await conn.execute(`
      SELECT COALESCE(SUM(totalAmount), 0) as totalPurchases
      FROM invoices
      WHERE 1=1 ${invDateWhere}
    `) as any[];
    const purchases = parseFloat(invRows[0].totalPurchases) || 0;

    // 3. Closing stock = current total stock value (raw + semi-finished)
    const [rawRows] = await conn.execute(`
      SELECT COALESCE(SUM(currentQuantity * lastPurchasePrice), 0) as rawValue
      FROM raw_materials
      WHERE currentQuantity > 0 AND lastPurchasePrice > 0
    `) as any[];
    const closingStock = parseFloat(rawRows[0].rawValue) || 0;

    // 4. COGS = Opening + Purchases - Closing
    const cogs = openingStock + purchases - closingStock;

    // 5. Sales in period
    const salesDateWhere = hasDateFilter
      ? `WHERE ${filter?.startDate ? `DATE(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00')) >= '${filter.startDate}'` : '1=1'}
         ${filter?.startDate && filter?.endDate ? 'AND' : ''}
         ${filter?.endDate ? `DATE(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00')) <= '${filter.endDate}'` : ''}`
      : '';
    const [salesRows] = await conn.execute(`
      SELECT COALESCE(SUM(si.netSales), 0) as totalSales
      FROM sale_items si
      JOIN sales_reports sr ON si.reportId = sr.id
      ${salesDateWhere}
    `) as any[];
    const totalSales = parseFloat(salesRows[0].totalSales) || 0;

    const grossProfit = totalSales - cogs;
    const grossMarginPct = totalSales > 0 ? parseFloat(((grossProfit / totalSales) * 100).toFixed(1)) : 0;

    // 6. Inventory Turnover = COGS / avgStock
    // avgStock = (openingStock + closingStock) / 2
    const avgStock = (openingStock + closingStock) / 2;
    const inventoryTurnover = avgStock > 0 ? parseFloat((cogs / avgStock).toFixed(2)) : 0;
    // Days on Hand = 365 / Inventory Turnover (how many days stock lasts)
    const daysOnHand = inventoryTurnover > 0 ? parseFloat((365 / inventoryTurnover).toFixed(0)) : 0;

    // 7. Working Capital - total stock value (raw + semi-finished)
    // Use same method as getInventoryKpis: raw = qty × lastPurchasePrice, semi = qty × recipeCost
    const [rawOnlyRows] = await conn.execute(`
      SELECT COALESCE(SUM(currentQuantity * lastPurchasePrice), 0) as rawValue
      FROM raw_materials
      WHERE materialType = 'raw' AND currentQuantity > 0 AND lastPurchasePrice > 0
    `) as any[];
    const rawStockValue = parseFloat(rawOnlyRows[0].rawValue) || 0;
    // For semi-finished: batch SQL (no N+1)
    const [semiMaterials] = await conn.execute(`
      SELECT
        rm.id,
        rm.currentQuantity,
        COALESCE(rm.lastPurchasePrice, 0) as directPrice,
        COALESCE((
          SELECT SUM(sfr.quantity * COALESCE(rm2.lastPurchasePrice, 0))
          FROM semi_finished_recipes sfr
          LEFT JOIN raw_materials rm2 ON sfr.ingredientId = rm2.id
          WHERE sfr.materialId = rm.id
        ), 0) as recipeCost
      FROM raw_materials rm
      WHERE rm.materialType = 'semi_finished' AND rm.currentQuantity > 0 AND rm.isActive = 1
    `) as any[];
    let semiStockValue = 0;
    for (const sm of semiMaterials) {
      const qty = parseFloat(sm.currentQuantity) || 0;
      if (qty > 0) {
        const directPrice = parseFloat(sm.directPrice) || 0;
        const recipeCost = parseFloat(sm.recipeCost) || 0;
        const unitCost = directPrice > 0 ? directPrice : recipeCost;
        semiStockValue += qty * unitCost;
      }
    }
    const totalStockValue = rawStockValue + semiStockValue;
    // Capital locked = total stock value (money tied up in inventory)
    const capitalLocked = totalStockValue;
    // Capital locked as % of total purchases
    const capitalLockedPct = purchases > 0 ? parseFloat(((capitalLocked / purchases) * 100).toFixed(1)) : 0;

    return {
      openingStock: parseFloat(openingStock.toFixed(2)),
      purchases: parseFloat(purchases.toFixed(2)),
      closingStock: parseFloat(closingStock.toFixed(2)),
      cogs: parseFloat(cogs.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossMarginPct,
      totalSales: parseFloat(totalSales.toFixed(2)),
      avgStock: parseFloat(avgStock.toFixed(2)),
      inventoryTurnover,
      daysOnHand,
      totalStockValue: parseFloat(totalStockValue.toFixed(2)),
      rawStockValue: parseFloat(rawStockValue.toFixed(2)),
      semiStockValue: parseFloat(semiStockValue.toFixed(2)),
      capitalLocked: parseFloat(capitalLocked.toFixed(2)),
      capitalLockedPct,
    };
  } finally {
    await conn.end();
  }
}

// ─── Free Invoices ─────────────────────────────────────────────────────────────

export async function createFreeInvoice(data: {
  supplierName: string;
  supplierType: "supplier" | "service";
  invoiceNumber?: string;
  date: Date;
  vatPct: number;
  paymentStatus: "paid" | "deferred" | "partial" | "under_review";
  paidAmount?: number;
  notes?: string;
  expenseCategory?: "operational" | "maintenance" | "fixed" | "other";
  items: { description: string; qty: number; unitPrice: number }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // توليد رقم فاتورة تلقائي إذا لم يُحدد
  let invoiceNum = data.invoiceNumber;
  if (!invoiceNum) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `FREE-${dateStr}-`;
    const [last] = await db
      .select({ invoiceNumber: freeInvoices.invoiceNumber })
      .from(freeInvoices)
      .where(like(freeInvoices.invoiceNumber, `${prefix}%`))
      .orderBy(desc(freeInvoices.invoiceNumber))
      .limit(1);
    const seq = last?.invoiceNumber ? parseInt(last.invoiceNumber.slice(prefix.length)) + 1 : 1;
    invoiceNum = `${prefix}${String(seq).padStart(4, "0")}`;
  }

  const subtotal = data.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const vatAmount = subtotal * (data.vatPct / 100);
  const totalAmount = subtotal + vatAmount;

  // حفظ paidAt عند إنشاء فاتورة بحالة paid أو partial
  const isPaid = data.paymentStatus === "paid" || data.paymentStatus === "partial";

  const initialRemainingAmount = data.paymentStatus === "paid"
    ? 0
    : data.paymentStatus === "partial" && data.paidAmount != null
    ? Math.max(0, totalAmount - data.paidAmount)
    : totalAmount;

  const [result] = await (db.insert(freeInvoices) as any).values({
    supplierName: data.supplierName,
    supplierType: data.supplierType,
    invoiceNumber: invoiceNum,
    date: data.date,
    subtotal: subtotal.toFixed(3),
    vatPct: data.vatPct.toFixed(2),
    vatAmount: vatAmount.toFixed(3),
    totalAmount: totalAmount.toFixed(3),
    paymentStatus: data.paymentStatus,
    paidAmount: data.paidAmount != null ? data.paidAmount.toFixed(3) : "0",
    remainingAmount: initialRemainingAmount.toFixed(3),
    paidAt: isPaid ? new Date() : undefined,
    expenseCategory: data.expenseCategory ?? "other",
    notes: data.notes,
  });

  const invoiceId = (result as any).insertId as number;

  if (data.items.length > 0) {
    await db.insert(freeInvoiceItems).values(
      data.items.map((item) => ({
        invoiceId,
        description: item.description,
        qty: item.qty.toFixed(3),
        unitPrice: item.unitPrice.toFixed(3),
        total: (item.qty * item.unitPrice).toFixed(3),
      }))
    );
  }

  return invoiceId;
}

export async function getFreeInvoices(filters?: {
  startDate?: string; // YYYY-MM-DD business day
  endDate?: string;   // YYYY-MM-DD business day
  paymentStatus?: string;
  supplierType?: string;
}) {
  const db = await getDb();
  if (!db) return [];

  // 'date' في الفواتير الحرة هو تاريخ اختاره المستخدم (calendar date مخزن كـ UTC midnight)
  // وليس timestamp حدث فعلي، لذا نقارنه مباشرة بـ DATE(date) بدون CONVERT_TZ
  // مثال: المستخدم اختار '2026-04-08' → date = 2026-04-08T00:00:00Z → DATE(date) = '2026-04-08' ✓
  const conditions: any[] = [];

  if (filters?.startDate) {
    conditions.push(sql`DATE(${freeInvoices.date}) >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conditions.push(sql`DATE(${freeInvoices.date}) <= ${filters.endDate}`);
  }
  if (filters?.paymentStatus && filters.paymentStatus !== "all") {
    conditions.push(eq(freeInvoices.paymentStatus, filters.paymentStatus as any));
  }
  if (filters?.supplierType && filters.supplierType !== "all") {
    conditions.push(eq(freeInvoices.supplierType, filters.supplierType as any));
  }

  const rows = await db
    .select()
    .from(freeInvoices)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sql`COALESCE(${freeInvoices.paidAt}, ${freeInvoices.date})`));

  return rows;
}

export async function getFreeInvoiceWithItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return null;

  const [invoice] = await db
    .select()
    .from(freeInvoices)
    .where(eq(freeInvoices.id, invoiceId));

  if (!invoice) return null;

  const items = await db
    .select()
    .from(freeInvoiceItems)
    .where(eq(freeInvoiceItems.invoiceId, invoiceId));

  const paymentHistory = await db
    .select()
    .from(invoicePaymentHistory)
    .where(
      and(
        eq(invoicePaymentHistory.invoiceId, invoiceId),
        eq(invoicePaymentHistory.invoiceType, "free")
      )
    )
    .orderBy(invoicePaymentHistory.paymentDate);

  return { ...invoice, items, paymentHistory };
}

export async function updateFreeInvoiceStatus(
  invoiceId: number,
  paymentStatus: "paid" | "deferred" | "partial" | "under_review",
  paidAmount?: number,
  paidAt?: Date,
  paymentOpts?: { paymentMethod?: string; paymentAccount?: string; referenceNumber?: string; createdBy?: number }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const now = new Date();

  // جلب الفاتورة الحالية لحساب القيم المتراكمة
  const [existing] = await db.select().from(freeInvoices).where(eq(freeInvoices.id, invoiceId)).limit(1);
  if (!existing) throw new Error("Free invoice not found");

  const totalAmount = parseFloat(existing.totalAmount ?? "0");
  const prevPaid = parseFloat(existing.paidAmount ?? "0");

  // حالة التدقيق: لا تغيير في القيم المالية - فقط تغيير الحالة
  if (paymentStatus === "under_review") {
    await db.update(freeInvoices).set({
      paymentStatus: "under_review" as any,
      updatedAt: now,
    }).where(eq(freeInvoices.id, invoiceId));
    return;
  }

  // استخدام paidAt اليدوي إذا كان محدداً ولا يتجاوز الوقت الحالي
  const effectivePaidAt = (paymentStatus === "paid" || paymentStatus === "partial")
    ? (paidAt && paidAt <= now ? paidAt : now)
    : undefined;

  let newPaidAmount: number;
  let newRemainingAmount: number;

  if (paymentStatus === "paid") {
    newPaidAmount = totalAmount;
    newRemainingAmount = 0;
  } else if (paymentStatus === "partial" && paidAmount !== undefined) {
    newPaidAmount = prevPaid + paidAmount;
    newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
    if (newRemainingAmount === 0) {
      paymentStatus = "paid";
    }
  } else if (paymentStatus === "deferred") {
    newPaidAmount = 0;
    newRemainingAmount = totalAmount;
  } else {
    newPaidAmount = paidAmount ?? prevPaid;
    newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
  }

  await (db.update(freeInvoices) as any)
    .set({
      paymentStatus: paymentStatus as any,
      paidAmount: String(newPaidAmount.toFixed(3)),
      remainingAmount: String(newRemainingAmount.toFixed(3)),
      paidAt: effectivePaidAt,
    })
    .where(eq(freeInvoices.id, invoiceId));

  // حفظ سجل الدفع
  if ((paymentStatus === "partial" || paymentStatus === "paid") && paidAmount !== undefined && paidAmount > 0) {
    await db.insert(invoicePaymentHistory).values({
      invoiceId,
      invoiceType: "free",
      paymentDate: effectivePaidAt ?? now,
      paidAmount: String(paidAmount.toFixed(3)),
      paymentType: paymentStatus === "paid" && prevPaid === 0 ? "paid" : "partial",
    });
  } else if (paymentStatus === "paid" && paidAmount === undefined) {
    await db.insert(invoicePaymentHistory).values({
      invoiceId,
      invoiceType: "free",
      paymentDate: effectivePaidAt ?? now,
      paidAmount: String(totalAmount.toFixed(3)),
      paymentType: "paid",
    });
  }
}

export async function deleteFreeInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  await db.delete(freeInvoices).where(eq(freeInvoices.id, invoiceId));
}

export async function updateFreeInvoice(input: {
  id: number;
  supplierName: string;
  date: string; // YYYY-MM-DD
  expenseCategory?: "operational" | "maintenance" | "fixed" | "other";
  vatPct: number;
  paymentStatus: "paid" | "deferred" | "partial" | "under_review";
  paidAmount?: number;
  notes?: string;
  items: { description: string; qty: number; unitPrice: number }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const subtotal = input.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const vatAmount = subtotal * (input.vatPct / 100);
  const totalAmount = subtotal + vatAmount;

  await db.update(freeInvoices).set({
    supplierName: input.supplierName,
    date: new Date(input.date),
    expenseCategory: input.expenseCategory ?? "other",
    vatPct: input.vatPct.toFixed(2),
    subtotal: subtotal.toFixed(3),
    vatAmount: vatAmount.toFixed(3),
    totalAmount: totalAmount.toFixed(3),
    paymentStatus: input.paymentStatus as any,
    paidAmount: input.paymentStatus === "partial" && input.paidAmount != null ? input.paidAmount.toFixed(3) : "0",
    notes: input.notes ?? null,
    updatedAt: new Date(),
  }).where(eq(freeInvoices.id, input.id));

  // حذف البنود القديمة وإعادة إدراجها
  await db.delete(freeInvoiceItems).where(eq(freeInvoiceItems.invoiceId, input.id));
  if (input.items.length > 0) {
    await db.insert(freeInvoiceItems).values(
      input.items.map(it => ({
        invoiceId: input.id,
        description: it.description,
        qty: it.qty.toFixed(3),
        unitPrice: it.unitPrice.toFixed(3),
        total: (it.qty * it.unitPrice).toFixed(3),
      }))
    );
  }

  const [updated] = await db.select().from(freeInvoices).where(eq(freeInvoices.id, input.id)).limit(1);
  return updated;
}

// ─── Semi-Finished: Open Pulled Details for KPI Popup ────────────────────────
/**
 * Returns details of all semi-finished materials that have open (un-inventoried) pulled quantities.
 * Used in the KPI popup in MaterialsPage.
 */
export async function getSemiFinishedOpenPulledDetails(): Promise<{
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  totalPulled: number;
  recipeCost: number;
  totalValue: number;
}[]> {
  const db = await getDb();
  if (!db) return [];

  // جلب مجموع الكمية المسحوبة المفتوحة لكل مادة مصنّعة
  const pulledRows = await db
    .select({
      materialId: kitchenDailyPulls.materialId,
      totalPulled: sql<string>`SUM(${kitchenDailyPulls.pulledQuantity})`,
    })
    .from(kitchenDailyPulls)
    .where(and(
      eq(kitchenDailyPulls.materialType, "semi_finished"),
      eq(kitchenDailyPulls.status, "open")
    ))
    .groupBy(kitchenDailyPulls.materialId);

  if (pulledRows.length === 0) return [];

  const materialIds = pulledRows.map((r) => r.materialId);
  const materials = await db
    .select({
      id: rawMaterials.id,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
    })
    .from(rawMaterials)
    .where(and(
      inArray(rawMaterials.id, materialIds),
      eq(rawMaterials.isActive, true)
    ));

  const matMap = new Map(materials.map((m) => [m.id, m]));

  const result = await Promise.all(
    pulledRows.map(async (pr) => {
      const mat = matMap.get(pr.materialId);
      const totalPulled = parseFloat(pr.totalPulled ?? "0");
      const recipeCost = await calcSemiFinishedCost(pr.materialId);
      return {
        materialId: pr.materialId,
        materialName: mat?.name ?? `مادة #${pr.materialId}`,
        materialNameAr: mat?.nameAr ?? null,
        unit: mat?.unit ?? "",
        totalPulled,
        recipeCost,
        totalValue: parseFloat((totalPulled * recipeCost).toFixed(3)),
      };
    })
  );

  return result.filter((r) => r.totalPulled > 0).sort((a, b) => b.totalValue - a.totalValue);
}

// ─── Today's Dashboard ────────────────────────────────────────────────────────
/** Get daily sales and kitchen cost for each day in the current month */
export async function getMonthlyDailyPerformance(): Promise<{
  day: string;
  sales: number;
  grossSales: number;
  kitchenCost: number;
  costPct: number;
}[]> {
  const conn = await getRawConn();
  try {
    // المبيعات اليومية من daily_accounts (إجمالي كل قنوات البيع)
    const [salesRows] = await conn.execute(`
      SELECT
        accountDate as day,
        COALESCE(
          salesCash + salesCard + salesKita + salesOrders + salesNoon + salesDeliveroo + salesCareem,
          0
        ) as dailySales,
        COALESCE(
          salesCash + salesCard + salesKita + salesOrders + salesNoon + salesDeliveroo + salesCareem,
          0
        ) as dailyGrossSales
      FROM daily_accounts
      WHERE YEAR(accountDate) = YEAR(CURDATE())
        AND MONTH(accountDate) = MONTH(CURDATE())
      ORDER BY accountDate ASC
    `) as any;

    // تكلفة المطبخ اليومية — منطق Usage Cost المُعتمد:
    // للخام:    usedQty × unitCost
    // للمصنّعة: usedQty × (pulledQuantity ÷ actualYield) × unitCost
    // العناصر المفتوحة (open) أو بدون closingCount لا تُحتسب
    const [kitchenRows] = await conn.execute(`
      SELECT
        DATE_FORMAT(DATE_SUB(CONVERT_TZ(kdp.pullDate, '+00:00', '+04:00'), INTERVAL 6 HOUR), '%Y-%m-%d') as day,
        COALESCE(kdp.closingCount, 0) as closingCount,
        COALESCE(kdp.pulledQuantity, 0) as pulledQuantity,
        COALESCE(kdp.actualYield, 0) as actualYield,
        kdp.materialId,
        kdp.materialType,
        COALESCE(rm.lastPurchasePrice, 0) as unitCost
      FROM kitchen_daily_pulls kdp
      LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
      WHERE kdp.status IN ('counted', 'closed')
        AND COALESCE(kdp.closingCount, 0) > 0
        AND YEAR(DATE_SUB(CONVERT_TZ(kdp.pullDate, '+00:00', '+04:00'), INTERVAL 6 HOUR)) = YEAR(CURDATE())
        AND MONTH(DATE_SUB(CONVERT_TZ(kdp.pullDate, '+00:00', '+04:00'), INTERVAL 6 HOUR)) = MONTH(CURDATE())
    `) as any;

    // دالة مساعدة: تحويل أي قيمة تاريخ إلى صيغة YYYY-MM-DD
    const toDateStr = (v: any): string => {
      if (!v) return '';
      if (v instanceof Date) {
        const d = new Date(v.getTime() + 4 * 60 * 60 * 1000);
        return d.toISOString().slice(0, 10);
      }
      const s = String(v);
      if (s.includes('T') || s.includes('Z')) {
        return new Date(new Date(s).getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
      }
      return s.slice(0, 10);
    };

    // تجميع التكاليف اليومية بمنطق Usage Cost
    const kitchenByDay: Record<string, number> = {};
    for (const row of kitchenRows as any[]) {
      const day = toDateStr(row.day);
      const usedQty = parseFloat(row.closingCount) || 0;
      const pulled = parseFloat(row.pulledQuantity) || 0;
      const actualYield = parseFloat(row.actualYield) || 0;
      let unitCost = parseFloat(row.unitCost) || 0;
      // للمصنّعة: إذا كان lastPurchasePrice = 0 نحسب تكلفة الوصفة كبديل (نفس منطق صفحة الإنتاج)
      if (row.materialType === 'semi_finished' && unitCost === 0) {
        unitCost = await calcSemiFinishedCost(Number(row.materialId));
      }
      let usageCost = 0;
      if (row.materialType === 'semi_finished' && actualYield > 0) {
        const consumptionPerUnit = pulled / actualYield;
        usageCost = usedQty * consumptionPerUnit * unitCost;
      } else {
        usageCost = usedQty * unitCost;
      }
      kitchenByDay[day] = (kitchenByDay[day] ?? 0) + usageCost;
    }

    // دمج المبيعات والتكاليف في مصفوفة يومية
    const salesByDay: Record<string, number> = {};
    const grossSalesByDay: Record<string, number> = {};
    for (const r of salesRows as any[]) {
      const dayKey = toDateStr(r.day);
      salesByDay[dayKey] = parseFloat(r.dailySales) || 0;
      grossSalesByDay[dayKey] = parseFloat(r.dailyGrossSales) || 0;
    }

    // جمع كل الأيام الموجودة
    const allDays = new Set([...Object.keys(salesByDay), ...Object.keys(kitchenByDay)]);
    const result = Array.from(allDays).sort().map((day) => {
      const sales = salesByDay[day] ?? 0;
      const grossSales = grossSalesByDay[day] ?? 0;
      const kitchenCost = kitchenByDay[day] ?? 0;
      const costPct = sales > 0 ? Math.round((kitchenCost / sales) * 1000) / 10 : 0;
      return { day, sales, grossSales, kitchenCost, costPct };
    });

    return result;
  } finally {
    await conn.end();
  }
}

/** Get weekly trend: sales vs kitchen cost for the last 8 weeks */
export async function getWeeklyTrend(): Promise<{
  week: string;       // e.g. "الأسبوع 1" or date range
  weekStart: string;  // ISO date of Monday
  sales: number;
  kitchenCost: number;
  costPct: number;
}[]> {
  const conn = await getRawConn();
  try {
    // المبيعات الأسبوعية (آخر 8 أسابيع)
    const [salesRows] = await conn.execute(`
      SELECT
        DATE(DATE_SUB(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00'),
          INTERVAL WEEKDAY(CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00')) DAY)) as weekStart,
        COALESCE(SUM(si.netSales), 0) as weeklySales
      FROM sale_items si
      JOIN sales_reports sr ON si.reportId = sr.id
      WHERE CONVERT_TZ(sr.reportDateFrom, '+00:00', '+04:00') >= DATE_SUB(CURDATE(), INTERVAL 56 DAY)
      GROUP BY weekStart
      ORDER BY weekStart ASC
    `) as any;

    // تكلفة المطبخ الأسبوعية (آخر 8 أسابيع) - تُنسب للأسبوع الذي أُغلقت فيه (updatedAt)
    const [kitchenRows] = await conn.execute(`
      SELECT
        DATE(DATE_SUB(DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR),
          INTERVAL WEEKDAY(DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) DAY)) as weekStart,
        kdp.closingCount,
        kdp.materialId,
        kdp.materialType
      FROM kitchen_daily_pulls kdp
      WHERE kdp.status IN ('counted', 'closed')
        AND COALESCE(kdp.closingCount, 0) > 0
        AND DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR) >= DATE_SUB(CURDATE(), INTERVAL 56 DAY)
    `) as any;

    // القاعدة الموحّدة: cost = closingCount × lastPurchasePrice لجميع المواد (خام ومصنّع)
    const kitchenCostPerRow = await Promise.all(
      (kitchenRows as any[]).map(async (row: any) => {
        const closing = parseFloat(row.closingCount) || 0;
        if (closing <= 0) return { weekStart: String(row.weekStart), cost: 0 };
        const cost = await calcKitchenPullRawCost(Number(row.materialId), row.materialType, closing);
        return { weekStart: String(row.weekStart), cost };
      })
    );

    // تجميع التكاليف أسبوعياً
    const kitchenByWeek: Record<string, number> = {};
    for (const r of kitchenCostPerRow) {
      kitchenByWeek[r.weekStart] = (kitchenByWeek[r.weekStart] ?? 0) + r.cost;
    }

    const salesByWeek: Record<string, number> = {};
    for (const r of salesRows as any[]) {
      salesByWeek[String(r.weekStart)] = parseFloat(r.weeklySales) || 0;
    }

    const allWeeks = new Set([...Object.keys(salesByWeek), ...Object.keys(kitchenByWeek)]);
    const result = Array.from(allWeeks).sort().map((weekStart, idx) => {
      const sales = salesByWeek[weekStart] ?? 0;
      const kitchenCost = kitchenByWeek[weekStart] ?? 0;
      const costPct = sales > 0 ? Math.round((kitchenCost / sales) * 1000) / 10 : 0;
      // تنسيق التسمية: "أسبوع N" أو نطاق التاريخ
      const d = new Date(weekStart);
      const endDate = new Date(d);
      endDate.setDate(d.getDate() + 6);
      const fmt = (dt: Date) => `${dt.getDate()}/${dt.getMonth() + 1}`;
      const week = `${fmt(d)} - ${fmt(endDate)}`;
      return { week, weekStart, sales, kitchenCost, costPct };
    });

    return result;
  } finally {
    await conn.end();
  }
}

export async function getTodayDashboard() {
  const conn = await getRawConn();
  try {
    // 1. بيانات المخزون الحالية
    const [[stockRow]] = await conn.execute(`
      SELECT
        COUNT(*) as totalMaterials,
        SUM(CASE WHEN currentQuantity <= 0 THEN 1 ELSE 0 END) as outOfStock,
        SUM(CASE WHEN minimumQuantity > 0 AND currentQuantity <= minimumQuantity AND currentQuantity > 0 THEN 1 ELSE 0 END) as lowStock,
        COALESCE(SUM(CASE WHEN (materialType = 'raw' OR materialType IS NULL) AND currentQuantity > 0 THEN currentQuantity * COALESCE(lastPurchasePrice, 0) ELSE 0 END), 0) as totalStockValue
      FROM raw_materials WHERE isActive = 1
    `) as any;

    // 1b. قيمة المواد الخام والمصنّعة — نستدعي getInventoryKpis مباشرة لضمان التطابق التام مع صفحة المواد الخام
    // (تحسب تكلفة الوصفة مع تحويل الوحدات عبر calcSemiFinishedCost)
    const invKpis = await getInventoryKpis();
    stockRow.totalStockValue = invKpis.rawMaterialsTotalValue.toFixed(2);
    stockRow.semiFinishedStockValue = invKpis.semiFinishedTotalValue;

    // 2. بيانات اليوم - المطبخ
    // استخدام اليوم التشغيلي الحالي (مع مراعاة الساعة 6 صباحاً)
    const businessTzOffset = await getBusinessDayTzOffset();
    const [[currentDayRow]] = await conn.execute(
      `SELECT DATE_FORMAT(CONVERT_TZ(NOW(), '+00:00', ?), '%Y-%m-%d') as currentDay`,
      [businessTzOffset]
    ) as any;
    const activeDayStr = (currentDayRow as any)?.currentDay ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
    
    const [[todayKitchen]] = await conn.execute(`
      SELECT
        COUNT(*) as totalPulls,
        COUNT(DISTINCT materialId) as uniqueItems,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as openPulls,
        SUM(CASE WHEN status = 'counted' THEN 1 ELSE 0 END) as countedPulls,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closedPulls,
        COALESCE(SUM(pulledQuantity), 0) as totalPulledQty,
        COALESCE(SUM(COALESCE(wasteQty, 0)), 0) as totalWasteQty
      FROM kitchen_daily_pulls k
      LEFT JOIN raw_materials r ON r.id = k.materialId
      WHERE (
        (k.status = 'open' AND DATE_FORMAT(CONVERT_TZ(k.pullDate, '+00:00', '+04:00'), '%Y-%m-%d') = ?)
        OR
        (k.status IN ('counted','closed') AND DATE_FORMAT(DATE_SUB(CONVERT_TZ(k.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR), '%Y-%m-%d') = ?)
      )
    `, [activeDayStr, activeDayStr]) as any;
    const todayKitchenData = { ...((todayKitchen as any) ?? {}), openValue: 0, countedValue: 0 };
    Object.assign(todayKitchen, todayKitchenData);

    // حساب openValue وcountedValue - نفس منطق صفحة الإنتاج
    // openValue: pulledQuantity × unitCost للمفتوحة
    // countedValue: closingCount × unitCost للمجرودة/المغلقة
    const [kitchenValueRows] = await conn.execute(`
      SELECT k.status, k.materialId, k.materialType,
        k.pulledQuantity, k.closingCount
      FROM kitchen_daily_pulls k
      WHERE (
        (k.status = 'open' AND DATE_FORMAT(CONVERT_TZ(k.pullDate, '+00:00', '+04:00'), '%Y-%m-%d') = ?)
        OR
        (k.status IN ('counted','closed') AND DATE_FORMAT(DATE_SUB(CONVERT_TZ(k.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR), '%Y-%m-%d') = ?)
      )
    `, [activeDayStr, activeDayStr]) as any;

    let openValueTotal = 0;
    let countedValueTotal = 0;
    for (const row of (kitchenValueRows as any[])) {
      if (row.status === 'open') {
        const qty = parseFloat(row.pulledQuantity) || 0;
        if (qty > 0) openValueTotal += await calcKitchenPullRawCost(Number(row.materialId), row.materialType, qty);
      } else {
        const qty = parseFloat(row.closingCount) || 0;
        if (qty > 0) countedValueTotal += await calcKitchenPullRawCost(Number(row.materialId), row.materialType, qty);
      }
    }
    todayKitchen.openValue = openValueTotal;
    todayKitchen.countedValue = countedValueTotal;

    // 3. بيانات اليوم - المعاملات
    const [[todayTx]] = await conn.execute(`
      SELECT
        SUM(CASE WHEN transactionType = 'IN' THEN 1 ELSE 0 END) as inCount,
        SUM(CASE WHEN transactionType = 'OUT' THEN 1 ELSE 0 END) as outCount,
        COALESCE(SUM(CASE WHEN transactionType = 'IN' THEN quantity * COALESCE(unitPrice, 0) ELSE 0 END), 0) as inValue,
        COALESCE(SUM(CASE WHEN transactionType = 'OUT' THEN quantity * COALESCE(unitPrice, 0) ELSE 0 END), 0) as outValue
      FROM inventory_transactions
      WHERE DATE(createdAt) = CURDATE()
    `) as any;

    // 4. بيانات الهدر اليوم
    const [[todayWaste]] = await conn.execute(`
      SELECT
        COUNT(*) as wasteCount,
        COALESCE(SUM(totalCost), 0) as wasteCost
      FROM waste_logs
      WHERE DATE(wasteDate) = CURDATE()
    `) as any;

    // 4b. هدر المطبخ اليوم من kitchen_daily_pulls - حساب في SQL واحدة بدلاً من N+1 queries
    // للمواد المصنّعة: wasteQty × (pulled ÷ actualYield) × unitCost
    // للمواد الخام:    wasteQty × unitCost
    const [[kitchenWasteResult]] = await conn.execute(`
      SELECT COALESCE(SUM(
        CASE
          WHEN k.materialType = 'semi_finished'
            AND k.actualYield IS NOT NULL
            AND CAST(k.actualYield AS DECIMAL(12,3)) > 0
          THEN
            CAST(k.wasteQty AS DECIMAL(12,3))
            * (CAST(k.pulledQuantity AS DECIMAL(12,3)) / CAST(k.actualYield AS DECIMAL(12,3)))
            * COALESCE(r.lastPurchasePrice, r.averageCost, 0)
          ELSE
            CAST(k.wasteQty AS DECIMAL(12,3))
            * COALESCE(r.lastPurchasePrice, r.averageCost, 0)
        END
      ), 0) as kitchenWasteCost
      FROM kitchen_daily_pulls k
      LEFT JOIN raw_materials r ON r.id = k.materialId
      WHERE (
        (k.status = 'open' AND DATE_FORMAT(CONVERT_TZ(k.pullDate, '+00:00', '+04:00'), '%Y-%m-%d') = ?)
        OR
        (k.status IN ('counted','closed') AND DATE_FORMAT(DATE_SUB(CONVERT_TZ(k.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR), '%Y-%m-%d') = ?)
      )
      AND k.wasteQty IS NOT NULL AND CAST(k.wasteQty AS DECIMAL(12,3)) > 0
    `, [activeDayStr, activeDayStr]) as any;

    const kitchenWasteCostToday = parseFloat((kitchenWasteResult as any)?.kitchenWasteCost ?? '0');

    // 5. آخر 7 أيام - حركة المطبخ
    const [kitchenLast7] = await conn.execute(`
      SELECT
        DATE(pullDate) as day,
        COUNT(*) as pullsCount,
        COUNT(DISTINCT materialId) as uniqueItems,
        COALESCE(SUM(pulledQuantity), 0) as totalQty,
        COALESCE(SUM(COALESCE(wasteQty, 0)), 0) as wasteQty
      FROM kitchen_daily_pulls
      WHERE pullDate >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY day ORDER BY day ASC
    `) as any;

    // 6. آخر 7 أيام - المعاملات
    const [txLast7] = await conn.execute(`
      SELECT
        DATE(createdAt) as day,
        COALESCE(SUM(CASE WHEN transactionType='IN' THEN quantity * COALESCE(unitPrice,0) ELSE 0 END), 0) as inValue,
        COALESCE(SUM(CASE WHEN transactionType='OUT' THEN quantity * COALESCE(unitPrice,0) ELSE 0 END), 0) as outValue
      FROM inventory_transactions
      WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY day ORDER BY day ASC
    `) as any;

    // 7. المواد الأكثر سحباً اليوم
    const [topTodayPulls] = await conn.execute(`
      SELECT
        k.materialId,
        COALESCE(r.nameAr, r.name) as materialName,
        r.unit,
        CAST(SUM(k.pulledQuantity) AS DECIMAL(12,3)) as totalPulled,
        MAX(k.status) as status
      FROM kitchen_daily_pulls k
      LEFT JOIN raw_materials r ON r.id = k.materialId
      WHERE DATE(k.pullDate) = CURDATE()
      GROUP BY k.materialId, r.nameAr, r.name, r.unit
      ORDER BY totalPulled DESC
      LIMIT 8
    `) as any;

    // 8. المواد منخفضة المخزون (أعلى أولوية)
    const [criticalItems] = await conn.execute(`
      SELECT
        COALESCE(nameAr, name) as name,
        unit,
        CAST(currentQuantity AS DECIMAL(12,3)) as currentQuantity,
        CAST(minimumQuantity AS DECIMAL(12,3)) as minimumQuantity,
        CASE
          WHEN currentQuantity <= 0 THEN 'out'
          ELSE 'low'
        END as status
      FROM raw_materials
      WHERE isActive = 1 AND minimumQuantity > 0 AND currentQuantity <= minimumQuantity
      ORDER BY currentQuantity ASC
      LIMIT 6
    `) as any;

    // 9. آخر 5 معاملات اليوم
    const [recentTodayTx] = await conn.execute(`
      SELECT
        it.transactionType,
        COALESCE(r.nameAr, r.name) as materialName,
        it.quantity,
        r.unit,
        it.createdAt
      FROM inventory_transactions it
      LEFT JOIN raw_materials r ON r.id = it.materialId
      WHERE DATE(it.createdAt) = CURDATE()
      ORDER BY it.createdAt DESC
      LIMIT 5
    `) as any;

    // 9b. إجمالي المبيعات هذا الشهر - من جدول الحسابات اليومية
    const [[monthSales]] = await conn.execute(`
      SELECT
        COALESCE(SUM(
          COALESCE(salesCash, 0) + COALESCE(salesCard, 0) + COALESCE(salesKita, 0) +
          COALESCE(salesOrders, 0) + COALESCE(salesNoon, 0) + COALESCE(salesDeliveroo, 0) +
          COALESCE(salesCareem, 0)
        ), 0) as monthSalesTotal,
        COUNT(*) as monthSalesUnits
      FROM daily_accounts
      WHERE YEAR(accountDate) = YEAR(CURDATE())
        AND MONTH(accountDate) = MONTH(CURDATE())
    `) as any;

    // 9c. تكلفة المطبخ هذا الشهر — منطق Usage Cost المُعتمد:
    // للخام:    usedQty × unitCost
    // للمصنّعة: usedQty × (pulledQuantity ÷ actualYield) × unitCost
    const [monthKitchenRows] = await conn.execute(`
      SELECT
        kdp.materialId,
        kdp.materialType,
        COALESCE(kdp.closingCount, 0) as closingCount,
        COALESCE(kdp.pulledQuantity, 0) as pulledQuantity,
        COALESCE(kdp.actualYield, 0) as actualYield,
        COALESCE(rm.lastPurchasePrice, 0) as unitCost
      FROM kitchen_daily_pulls kdp
      LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
      WHERE kdp.status IN ('counted', 'closed')
        AND YEAR(DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) = YEAR(CURDATE())
        AND MONTH(DATE_SUB(CONVERT_TZ(kdp.updatedAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) = MONTH(CURDATE())
        AND COALESCE(kdp.closingCount, 0) > 0
    `) as any;
    let monthKitchenCostTotal = 0;
    for (const row of (monthKitchenRows as any[])) {
      const usedQty = parseFloat(row.closingCount) || 0;
      const pulled = parseFloat(row.pulledQuantity) || 0;
      const actualYield = parseFloat(row.actualYield) || 0;
      let unitCost = parseFloat(row.unitCost) || 0;
      if (usedQty <= 0) continue;
      // للمصنّعة: إذا كان lastPurchasePrice = 0 نحسب تكلفة الوصفة كبديل (نفس منطق صفحة الإنتاج)
      if (row.materialType === 'semi_finished' && unitCost === 0) {
        unitCost = await calcSemiFinishedCost(Number(row.materialId));
      }
      if (row.materialType === 'semi_finished' && actualYield > 0) {
        const consumptionPerUnit = pulled / actualYield;
        monthKitchenCostTotal += usedQty * consumptionPerUnit * unitCost;
      } else {
        monthKitchenCostTotal += usedQty * unitCost;
      }
    }

    // 10. إجمالي الهدر هذا الشهر
    const [[monthWaste]] = await conn.execute(`
      SELECT COALESCE(SUM(totalCost), 0) as monthWasteCost, COUNT(*) as monthWasteCount
      FROM waste_logs
      WHERE YEAR(wasteDate) = YEAR(CURDATE()) AND MONTH(wasteDate) = MONTH(CURDATE())
    `) as any;

    // 11. إجمالي المشتريات هذا الشهر
    const [[monthPurchases]] = await conn.execute(`
      SELECT COALESCE(SUM(totalAmount), 0) as monthPurchases, COUNT(*) as invoiceCount
      FROM invoices
      WHERE YEAR(invoiceDate) = YEAR(CURDATE()) AND MONTH(invoiceDate) = MONTH(CURDATE())
    `) as any;

    // 11b. إجمالي الفواتير الحرة هذا الشهر
    const [[monthFreeInvoices]] = await conn.execute(`
      SELECT COALESCE(SUM(totalAmount), 0) as monthFreeTotal, COUNT(*) as freeInvoiceCount
      FROM free_invoices
      WHERE YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())
    `) as any;

    // 12. مشتريات اليوم - فواتير الموردين
    const [[todayInvoices]] = await conn.execute(`
      SELECT
        COALESCE(SUM(totalAmount), 0) as invoicesTotal,
        COUNT(*) as invoicesCount
      FROM invoices
      WHERE DATE(invoiceDate) = CURDATE()
    `) as any;

    // 13. مشتريات اليوم - الفواتير الحرة
    const [[todayFreeInvoices]] = await conn.execute(`
      SELECT
        COALESCE(SUM(totalAmount), 0) as freeTotal,
        COUNT(*) as freeCount
      FROM free_invoices
      WHERE DATE(date) = CURDATE()
    `) as any;

    // 14. المديونية والمدفوع - الكل
    const [[debtAll]] = await conn.execute(`
      SELECT
        COALESCE(SUM(CASE WHEN paymentStatus IN ('deferred','partial') THEN remainingAmount ELSE 0 END), 0) as debtAll,
        COALESCE(SUM(paidAmount), 0) as paidAll,
        COALESCE(SUM(totalAmount), 0) as totalAll
      FROM (
        SELECT totalAmount, paymentStatus, paidAmount, remainingAmount FROM invoices
        UNION ALL
        SELECT totalAmount, paymentStatus, paidAmount, remainingAmount FROM free_invoices
      ) t
    `) as any;

    // 14b. المديونية والمدفوع - الشهر الحالي
    const [[debtMonth]] = await conn.execute(`
      SELECT
        COALESCE(SUM(CASE WHEN paymentStatus IN ('deferred','partial') THEN remainingAmount ELSE 0 END), 0) as debtMonth,
        COALESCE(SUM(paidAmount), 0) as paidMonth,
        COALESCE(SUM(totalAmount), 0) as totalMonth
      FROM (
        SELECT totalAmount, paymentStatus, paidAmount, remainingAmount FROM invoices
        WHERE YEAR(invoiceDate) = YEAR(CURDATE()) AND MONTH(invoiceDate) = MONTH(CURDATE())
        UNION ALL
        SELECT totalAmount, paymentStatus, paidAmount, remainingAmount FROM free_invoices
        WHERE YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())
      ) t
    `) as any;

    return {
      stock: {
        totalMaterials: Number(stockRow.totalMaterials),
        outOfStock: Number(stockRow.outOfStock),
        lowStock: Number(stockRow.lowStock),
        totalStockValue: parseFloat(stockRow.totalStockValue),
        semiFinishedStockValue: parseFloat(stockRow.semiFinishedStockValue ?? "0"),
      },
      todayKitchen: {
        totalPulls: Number(todayKitchen.totalPulls),
        uniqueItems: Number(todayKitchen.uniqueItems),
        openPulls: Number(todayKitchen.openPulls),
        countedPulls: Number(todayKitchen.countedPulls),
        closedPulls: Number(todayKitchen.closedPulls),
        totalPulledQty: parseFloat(todayKitchen.totalPulledQty),
        totalWasteQty: parseFloat(todayKitchen.totalWasteQty),
        openValue: parseFloat(todayKitchen.openValue ?? "0"),
        countedValue: parseFloat(todayKitchen.countedValue ?? "0"),
      },
      todayTx: {
        inCount: Number(todayTx.inCount),
        outCount: Number(todayTx.outCount),
        inValue: parseFloat(todayTx.inValue),
        outValue: parseFloat(todayTx.outValue),
      },
      todayWaste: {
        wasteCount: Number(todayWaste.wasteCount),
        wasteCost: parseFloat(todayWaste.wasteCost),
        kitchenWasteCost: kitchenWasteCostToday,
        totalWasteCost: parseFloat(todayWaste.wasteCost) + kitchenWasteCostToday,
      },
      kitchenLast7: (kitchenLast7 as any[]).map((r) => ({
        day: String(r.day),
        pullsCount: Number(r.pullsCount),
        uniqueItems: Number(r.uniqueItems),
        totalQty: parseFloat(r.totalQty),
        wasteQty: parseFloat(r.wasteQty),
      })),
      txLast7: (txLast7 as any[]).map((r) => ({
        day: String(r.day),
        inValue: parseFloat(r.inValue),
        outValue: parseFloat(r.outValue),
      })),
      topTodayPulls: (topTodayPulls as any[]).map((r) => ({
        materialId: Number(r.materialId),
        materialName: String(r.materialName ?? ""),
        unit: String(r.unit ?? ""),
        totalPulled: parseFloat(r.totalPulled),
        status: String(r.status),
      })),
      criticalItems: (criticalItems as any[]).map((r) => ({
        name: String(r.name ?? ""),
        unit: String(r.unit ?? ""),
        currentQuantity: parseFloat(r.currentQuantity),
        minimumQuantity: parseFloat(r.minimumQuantity),
        status: String(r.status),
      })),
      recentTodayTx: (recentTodayTx as any[]).map((r) => ({
        transactionType: String(r.transactionType),
        materialName: String(r.materialName ?? ""),
        quantity: parseFloat(r.quantity),
        unit: String(r.unit ?? ""),
        createdAt: r.createdAt,
      })),
      monthWaste: {
        monthWasteCost: parseFloat(monthWaste.monthWasteCost),
        monthWasteCount: Number(monthWaste.monthWasteCount),
      },
      monthPurchases: {
        monthPurchases: parseFloat(monthPurchases.monthPurchases),
        invoiceCount: Number(monthPurchases.invoiceCount),
        monthFreeTotal: parseFloat(monthFreeInvoices.monthFreeTotal ?? "0"),
        freeInvoiceCount: Number(monthFreeInvoices.freeInvoiceCount ?? 0),
      },
      todayPurchases: {
        invoicesTotal: parseFloat(todayInvoices.invoicesTotal ?? "0"),
        invoicesCount: Number(todayInvoices.invoicesCount ?? 0),
        freeTotal: parseFloat(todayFreeInvoices.freeTotal ?? "0"),
        freeCount: Number(todayFreeInvoices.freeCount ?? 0),
      },
      debtAll: {
        totalAll: parseFloat(debtAll.totalAll ?? "0"),
        paidAll: parseFloat(debtAll.paidAll ?? "0"),
        debtAll: parseFloat(debtAll.debtAll ?? "0"),
      },
      debtMonth: {
        totalMonth: parseFloat(debtMonth.totalMonth ?? "0"),
        paidMonth: parseFloat(debtMonth.paidMonth ?? "0"),
        debtMonth: parseFloat(debtMonth.debtMonth ?? "0"),
      },
      monthPerformance: {
        totalSales: parseFloat(monthSales.monthSalesTotal ?? "0"),
        totalUnits: Number(monthSales.monthSalesUnits ?? 0),
        kitchenCost: monthKitchenCostTotal,
        grossProfit: parseFloat(monthSales.monthSalesTotal ?? "0") - monthKitchenCostTotal,
      },
    };
  } finally {
    await conn.end();
  }
}

// ─── Daily Accounts (الحسابات اليومية) ────────────────────────────────────────

export async function saveDailyAccount(data: {
  accountDate: string; // YYYY-MM-DD
  salesCash: number;
  salesCard: number;
  salesKita: number;
  salesOrders: number;
  salesNoon: number;
  salesDeliveroo: number;
  salesCareem: number;
  expensesFixed: number;
  supplyToRestaurant: number;
  supplyToManagement: number;
  supplyExtra: number;
  notes?: string;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // حساب carryForwardToNext من قاعدة البيانات مباشرة
  // 1. جلب المرحّل من اليوم السابق
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  let carryFromPrev = 0;
  let expensesSupplier = 0;
  let expensesFree = 0;
  try {
    const [prevRows] = await conn.query<any[]>(
      `SELECT carryForwardToNext FROM daily_accounts WHERE accountDate < ? ORDER BY accountDate DESC LIMIT 1`,
      [data.accountDate]
    );
    carryFromPrev = Number((prevRows as any[])[0]?.carryForwardToNext || 0);

    // 2. جلب المصروفات من invoice_payment_history (المصدر الوحيد الدقيق)
    // يسجّل الدفعات الفعلية لكل يوم بدقة (بما فيها الدفعات الجزئية الفعلية لكل يوم)
    // JOIN لتجنّب السجلات اليتيمة (orphan records)
    const [suppHistRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(h.paidAmount),0) as total
       FROM invoice_payment_history h
       INNER JOIN invoices i ON h.invoiceId = i.id
       WHERE h.invoiceType = 'supplier'
       AND DATE(CONVERT_TZ(h.paymentDate, '+00:00', '+04:00') - INTERVAL 6 HOUR) = ?`,
      [data.accountDate]
    );
    expensesSupplier = Number((suppHistRows as any[])[0]?.total || 0);

    const [freeHistRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(h.paidAmount),0) as total
       FROM invoice_payment_history h
       INNER JOIN free_invoices fi ON h.invoiceId = fi.id
       WHERE h.invoiceType = 'free'
       AND DATE(CONVERT_TZ(h.paymentDate, '+00:00', '+04:00') - INTERVAL 6 HOUR) = ?`,
      [data.accountDate]
    );
    expensesFree = Number((freeHistRows as any[])[0]?.total || 0);
  } finally {
    await conn.end();
  }

  // معادلة المرحّل لليوم التالي
  const totalExpenses = expensesSupplier + expensesFree + data.expensesFixed;
  const carryToNext =
    carryFromPrev +
    data.salesCash +
    data.supplyToRestaurant +
    data.supplyExtra -
    totalExpenses -
    data.supplyToManagement;

  // Check if record exists for this date
  const existing = await db
    .select({ id: dailyAccounts.id })
    .from(dailyAccounts)
    .where(eq(dailyAccounts.accountDate, data.accountDate))
    .limit(1);

  const values = {
    salesCash: data.salesCash.toFixed(3),
    salesCard: data.salesCard.toFixed(3),
    salesKita: data.salesKita.toFixed(3),
    salesOrders: data.salesOrders.toFixed(3),
    salesNoon: data.salesNoon.toFixed(3),
    salesDeliveroo: data.salesDeliveroo.toFixed(3),
    salesCareem: data.salesCareem.toFixed(3),
    expensesFixed: data.expensesFixed.toFixed(3),
    supplyToRestaurant: data.supplyToRestaurant.toFixed(3),
    supplyToManagement: data.supplyToManagement.toFixed(3),
    supplyExtra: data.supplyExtra.toFixed(3),
    notes: data.notes ?? null,
    carryForwardToNext: carryToNext.toFixed(3),
  };

  if (existing.length > 0) {
    await db.update(dailyAccounts).set(values).where(eq(dailyAccounts.id, existing[0].id));
    return existing[0].id;
  } else {
    const [result] = await db.insert(dailyAccounts).values({
      accountDate: data.accountDate,
      ...values,
      createdBy: data.userId,
    });
    return (result as any).insertId as number;
  }
}

export async function getDailyAccounts(params: { year: number; month: number }) {
  const db = await getDb();
  if (!db) return [];
  // Date range for the month
  const startDate = `${params.year}-${String(params.month).padStart(2, "0")}-01`;
  const endDate = `${params.year}-${String(params.month).padStart(2, "0")}-31`;

  const rows = await db
    .select()
    .from(dailyAccounts)
    .where(
      and(
        sql`${dailyAccounts.accountDate} >= ${startDate}`,
        sql`${dailyAccounts.accountDate} <= ${endDate}`
      )
    )
    .orderBy(dailyAccounts.accountDate);

  return rows.map((r) => ({
    ...r,
    totalSales:
      parseFloat(r.salesCash) +
      parseFloat(r.salesCard) +
      parseFloat(r.salesKita) +
      parseFloat(r.salesOrders) +
      parseFloat(r.salesNoon) +
      parseFloat(r.salesDeliveroo) +
      parseFloat(r.salesCareem),
  }));
}

export async function getDailyAccountByDate(accountDate: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(dailyAccounts)
    .where(eq(dailyAccounts.accountDate, accountDate))
    .limit(1);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    totalSales:
      parseFloat(r.salesCash) +
      parseFloat(r.salesCard) +
      parseFloat(r.salesKita) +
      parseFloat(r.salesOrders) +
      parseFloat(r.salesNoon) +
      parseFloat(r.salesDeliveroo) +
      parseFloat(r.salesCareem),
  };
}

export async function deleteDailyAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(dailyAccounts).where(eq(dailyAccounts.id, id));
}

/** Get free invoices + supplier invoices (paid) for a specific business date.
 * 
 * FREE INVOICES: Use DATE(date) directly because 'date' is a user-selected calendar date
 * (stored as UTC midnight). No timezone conversion needed — the user picked '2026-04-08'
 * and that's exactly what we compare against.
 *
 * SUPPLIER INVOICES: Use CONVERT_TZ(paidAt/updatedAt) with business-day offset because
 * paidAt is a real timestamp of when payment was recorded.
 */
export async function getFreeInvoiceExpensesForDate(accountDate: string) {
  const db = await getDb();
  type ItemRow = { description: string; qty: number; unitPrice: number; total: number };
  type InvoiceRow = { id: number; supplierName: string; invoiceNumber: string | null; totalAmount: number; expenseCategory: string; paidAt?: Date | null; paidAmount?: number; isPartial?: boolean; items?: ItemRow[] };
  if (!db) return { operational: 0, maintenance: 0, invoices: [] as InvoiceRow[], supplierInvoices: [] as InvoiceRow[], supplierInvoicesTotal: 0, isManual: false };

  // ── تحقق إذا كانت هذه الفترة لديها بيانات يدوية مخزّنة (من الإكسل) ──
  const storedRows = await db
    .select({ expensesOperational: dailyAccounts.expensesOperational, expensesMaintenance: dailyAccounts.expensesMaintenance })
    .from(dailyAccounts)
    .where(eq(dailyAccounts.accountDate, accountDate))
    .limit(1);
  const stored = storedRows[0];
  if (stored && stored.expensesOperational !== null && stored.expensesOperational !== undefined) {
    // استخدام القيم المخزّنة يدوياً من الإكسل
    const operational = parseFloat(stored.expensesOperational as unknown as string);
    const maintenance = stored.expensesMaintenance !== null && stored.expensesMaintenance !== undefined
      ? parseFloat(stored.expensesMaintenance as unknown as string)
      : 0;
    return {
      operational,
      maintenance,
      invoices: [] as InvoiceRow[],
      supplierInvoices: [] as InvoiceRow[],
      supplierInvoicesTotal: 0,
      isManual: true, // إشارة للواجهة أن هذه بيانات يدوية
    };
  }
  // منطق اليوم التشغيلي: اليوم يبدأ الساعة 6 صباحاً بتوقيت دبي (+04:00)
  // يعني: اليوم التشغيلي accountDate يشمل الفترة من:
  //   accountDate 06:00 Dubai = accountDate 02:00 UTC
  //   إلى (accountDate+1) 05:59 Dubai = (accountDate+1) 01:59 UTC
  // الصيغة: DATE(CONVERT_TZ(paidAt - INTERVAL 6 HOUR, '+00:00', '+04:00')) = accountDate
  // أو بشكل مبسط: DATE(CONVERT_TZ(paidAt, '+00:00', '+04:00') - INTERVAL 6 HOUR) = accountDate
  // ── Free invoices (paid) ──
  const freeRows = await db
    .select({
      id: freeInvoices.id,
      supplierName: freeInvoices.supplierName,
      invoiceNumber: freeInvoices.invoiceNumber,
      totalAmount: freeInvoices.totalAmount,
      expenseCategory: freeInvoices.expenseCategory,
    })
    .from(freeInvoices)
    .where(
      and(
        sql`DATE(CONVERT_TZ(COALESCE(${freeInvoices.paidAt}, ${freeInvoices.updatedAt}), '+00:00', '+04:00') - INTERVAL 6 HOUR) = ${accountDate}`,
        eq(freeInvoices.paymentStatus, "paid")
      )
    )
    .orderBy(freeInvoices.id);
  const invoicesList: InvoiceRow[] = freeRows.map((r) => ({
    id: r.id,
    supplierName: r.supplierName,
    invoiceNumber: r.invoiceNumber,
    totalAmount: parseFloat(r.totalAmount as unknown as string),
    expenseCategory: r.expenseCategory ?? "other",
  }));
  // ── Supplier invoices: use invoice_payment_history as primary source ──
  // This correctly handles multi-payment invoices: shows only the amount paid on THIS day,
  // not the total invoice amount (which would be wrong for e.g. 50 on day1 + 110 on day2).
  const historySupplierRaw = await (db as any)
    .select({
      id: invoices.id,
      supplierName: invoices.supplierName,
      invoiceNumber: invoices.invoiceNumber,
      totalAmount: invoices.totalAmount,
      paymentStatus: invoices.paymentStatus,
      todayPaid: sql<number>`SUM(CAST(iph.paidAmount AS DECIMAL(15,3)))`,
    })
    .from(sql`invoice_payment_history iph`)
    .innerJoin(invoices, sql`${invoices.id} = iph.invoiceId AND iph.invoiceType = 'supplier'`)
    .where(sql`DATE_FORMAT(CONVERT_TZ(iph.paymentDate, '+00:00', '+04:00') - INTERVAL 6 HOUR, '%Y-%m-%d') = ${accountDate}`)
    .groupBy(invoices.id)
    .orderBy(invoices.id);

  const historySupplierIds = new Set(historySupplierRaw.map((r: any) => r.id as number));

  // Fallback: legacy fully-paid invoices without any payment history records
  const legacySupplierRows = await db
    .select({
      id: invoices.id,
      supplierName: invoices.supplierName,
      invoiceNumber: invoices.invoiceNumber,
      totalAmount: invoices.totalAmount,
      paidAt: invoices.paidAt,
      updatedAt: invoices.updatedAt,
    })
    .from(invoices)
    .where(
      and(
        sql`DATE(CONVERT_TZ(COALESCE(${invoices.paidAt}, ${invoices.updatedAt}), '+00:00', '+04:00') - INTERVAL 6 HOUR) = ${accountDate}`,
        eq(invoices.paymentStatus, "paid")
      )
    )
    .orderBy(invoices.id);

  const supplierInvoicesList: InvoiceRow[] = [
    ...historySupplierRaw.map((r: any) => ({
      id: r.id as number,
      supplierName: (r.supplierName ?? "—") as string,
      invoiceNumber: r.invoiceNumber as string | null,
      totalAmount: parseFloat(r.totalAmount as unknown as string),
      paidAmount: parseFloat(String(r.todayPaid ?? "0")),
      expenseCategory: "supplier",
      isPartial: r.paymentStatus !== "paid" || parseFloat(String(r.todayPaid ?? "0")) < parseFloat(r.totalAmount as unknown as string),
    })),
    ...legacySupplierRows
      .filter(r => !historySupplierIds.has(r.id))
      .map(r => ({
        id: r.id,
        supplierName: r.supplierName ?? "—",
        invoiceNumber: r.invoiceNumber,
        totalAmount: parseFloat(r.totalAmount as unknown as string),
        expenseCategory: "supplier",
        paidAt: r.paidAt ?? r.updatedAt,
      })),
  ];
  const supplierInvoicesTotal = supplierInvoicesList.reduce((s, r) => s + (r.paidAmount ?? r.totalAmount), 0);

  // Empty partial list (now merged into supplierInvoicesList above)
  const partialSupplierList: InvoiceRow[] = [];
  const partialSupplierTotal = 0;

  // ── Partial free invoices (paid partially today) ──
  // جلب الفواتير الحرة الجزئية التي تم دفع دفعة لها في هذا اليوم تحديداً
  const partialFreeRaw = await (db as any)
    .select({
      id: freeInvoices.id,
      supplierName: freeInvoices.supplierName,
      invoiceNumber: freeInvoices.invoiceNumber,
      totalAmount: freeInvoices.totalAmount,
      expenseCategory: freeInvoices.expenseCategory,
      paidAt: freeInvoices.paidAt,
      updatedAt: freeInvoices.updatedAt,
      todayPaid: sql<number>`SUM(CASE WHEN DATE_FORMAT(CONVERT_TZ(iph.paymentDate, '+00:00', '+04:00') - INTERVAL 6 HOUR, '%Y-%m-%d') = ${accountDate} THEN CAST(iph.paidAmount AS DECIMAL(15,3)) ELSE 0 END)`,
    })
    .from(freeInvoices)
    .innerJoin(
      sql`invoice_payment_history iph`,
      sql`iph.invoiceId = ${freeInvoices.id} AND iph.invoiceType = 'free'`
    )
    .where(eq(freeInvoices.paymentStatus, "partial"))
    .groupBy(freeInvoices.id)
    .having(sql`SUM(CASE WHEN DATE_FORMAT(CONVERT_TZ(iph.paymentDate, '+00:00', '+04:00') - INTERVAL 6 HOUR, '%Y-%m-%d') = ${accountDate} THEN 1 ELSE 0 END) > 0`)
    .orderBy(freeInvoices.id);
  const partialFreeList: InvoiceRow[] = partialFreeRaw.map((r: any) => ({
    id: r.id,
    supplierName: r.supplierName,
    invoiceNumber: r.invoiceNumber,
    totalAmount: parseFloat(r.totalAmount as unknown as string),
    paidAmount: parseFloat(String(r.todayPaid ?? "0")),
    expenseCategory: r.expenseCategory ?? "other",
    paidAt: r.paidAt ?? r.updatedAt,
    isPartial: true,
  }));
  const partialFreeTotal = partialFreeList.reduce((s, r) => s + (r.paidAmount ?? 0), 0);

  // ── Fetch items for all invoices (for accordion detail view) ──
  const allFreeIds = [...invoicesList.map(i => i.id), ...partialFreeList.map(i => i.id)];
  const allSupplierIds = [...supplierInvoicesList.map(i => i.id), ...partialSupplierList.map(i => i.id)];

  const freeItemsMap: Record<number, ItemRow[]> = {};
  if (allFreeIds.length > 0) {
    const [freeItemRows] = await (await (await import('mysql2/promise')).createConnection(process.env.DATABASE_URL!)).execute<any[]>(
      `SELECT invoiceId, description, qty, unitPrice, total FROM free_invoice_items WHERE invoiceId IN (${allFreeIds.join(',')}) ORDER BY id`,
    ).then(async (res) => { return res; }).catch(() => [[] as any[]]);
    for (const row of (freeItemRows as any[])) {
      if (!freeItemsMap[row.invoiceId]) freeItemsMap[row.invoiceId] = [];
      freeItemsMap[row.invoiceId].push({ description: row.description, qty: parseFloat(row.qty), unitPrice: parseFloat(row.unitPrice), total: parseFloat(row.total) });
    }
  }

  const supplierItemsMap: Record<number, ItemRow[]> = {};
  if (allSupplierIds.length > 0) {
    const [suppItemRows] = await (await (await import('mysql2/promise')).createConnection(process.env.DATABASE_URL!)).execute<any[]>(
      `SELECT invoiceId, materialName AS description, quantity AS qty, unitPrice, totalPrice AS total FROM invoice_items WHERE invoiceId IN (${allSupplierIds.join(',')}) ORDER BY id`,
    ).then(async (res) => { return res; }).catch(() => [[] as any[]]);
    for (const row of (suppItemRows as any[])) {
      if (!supplierItemsMap[row.invoiceId]) supplierItemsMap[row.invoiceId] = [];
      supplierItemsMap[row.invoiceId].push({ description: row.description, qty: parseFloat(row.qty), unitPrice: parseFloat(row.unitPrice), total: parseFloat(row.total) });
    }
  }

  // Attach items to invoices
  for (const inv of invoicesList) inv.items = freeItemsMap[inv.id] ?? [];
  for (const inv of partialFreeList) inv.items = freeItemsMap[inv.id] ?? [];
  for (const inv of supplierInvoicesList) inv.items = supplierItemsMap[inv.id] ?? [];
  for (const inv of partialSupplierList) inv.items = supplierItemsMap[inv.id] ?? [];

  const result = { operational: 0, maintenance: 0, invoices: invoicesList, supplierInvoices: supplierInvoicesList, supplierInvoicesTotal, partialSupplierInvoices: partialSupplierList, partialSupplierTotal, partialFreeInvoices: partialFreeList, partialFreeTotal, isManual: false };
  for (const r of invoicesList) {
    if (r.expenseCategory === "operational") result.operational += r.totalAmount;
    if (r.expenseCategory === "maintenance") result.maintenance += r.totalAmount;
  }
  return result;
}

/** Update expense category for a free invoice */
export async function updateFreeInvoiceExpenseCategory(id: number, category: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(freeInvoices)
    .set({ expenseCategory: category as "operational" | "maintenance" | "fixed" | "other" })
    .where(eq(freeInvoices.id, id));
}

/** Get previous day's carry-forward balance */
export async function getPreviousDayCarryForward(accountDate: string): Promise<number> {
  // استخدام raw SQL مباشرة لتجنّب أي مشكلة في Drizzle ORM
  const conn = await (await import('mysql2/promise')).createConnection(process.env.DATABASE_URL!);
  try {
    const [rows] = await conn.query<any[]>(
      `SELECT carryForwardToNext FROM daily_accounts WHERE accountDate < ? ORDER BY accountDate DESC LIMIT 1`,
      [accountDate]
    );
    if (!rows[0]) return 0;
    return Number(rows[0].carryForwardToNext || 0);
  } finally {
    await conn.end();
  }
}

// ─── Monthly Expenses for Daily Accounts Table ────────────────────────────────
export async function getMonthExpenses(
  year: number,
  month: number
): Promise<Record<string, { operational: number; maintenance: number; freeTotal: number; supplierTotal: number; totalExpenses: number }>> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  // Calculate actual last day of month (avoids invalid dates like April 31)
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Get settings for timezone and business day
  const settings = await getAppSettings();
  const tzOffsets: Record<string, number> = {
    'Asia/Dubai': 4, 'Asia/Riyadh': 3, 'Asia/Kuwait': 3, 'Asia/Qatar': 3,
    'Asia/Bahrain': 3, 'Asia/Muscat': 4, 'Africa/Cairo': 2, 'Europe/London': 0, 'UTC': 0,
  };
  const tz = settings?.timezone ?? 'Asia/Dubai';
  const localOffsetHours = tzOffsets[tz] ?? 4;
  const startHour = settings?.businessDayStartHour ?? 6;
  // Net offset for business-day grouping (e.g. Dubai UTC+4, startHour=6 → net=-2)
  const netHours = localOffsetHours - startHour;

  // Use raw SQL connection to avoid Drizzle ORM parameterization issues with DATE_FORMAT/CONVERT_TZ
  const conn = await getRawConn();
  const result: Record<string, { operational: number; maintenance: number; freeTotal: number; supplierTotal: number; totalExpenses: number }> = {};

  try {
    // ── Free invoices (paid + partial) grouped by PAYMENT date (business-day logic) ──
    // Use COALESCE(paidAt, updatedAt): prefer actual payment date, fallback to updatedAt (when status changed to paid)
    // Do NOT use 'date' (invoice date) as fallback — it is a calendar date (not a timestamp) and causes wrong day assignment
    // Use the business-day tzOffset directly (e.g. '-02:00' for Dubai UTC+4 with 6AM start)
    // This is equivalent to CONVERT_TZ(UTC, '+00:00', '+04:00') - 6h, but done in one step
    // For partial invoices: use paidAmount (actual amount paid, not totalAmount)
    const tzOffset = await getBusinessDayTzOffset();
    const [freeRows] = await conn.execute(
      `SELECT
        DATE_FORMAT(
          CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'),
          '%Y-%m-%d'
        ) AS dateKey,
        expenseCategory,
        SUM(CASE WHEN paymentStatus = 'partial' THEN paidAmount ELSE totalAmount END) AS totalAmount
       FROM free_invoices
       WHERE paymentStatus IN ('paid', 'partial')
         AND DATE_FORMAT(
           CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'),
           '%Y-%m-%d'
         ) >= ?
         AND DATE_FORMAT(
           CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'),
           '%Y-%m-%d'
         ) <= ?
       GROUP BY dateKey, expenseCategory
       ORDER BY dateKey`,
      [startDate, endDate]
    ) as any;

    for (const r of freeRows as any[]) {
      const key = r.dateKey as string;
      if (!result[key]) result[key] = { operational: 0, maintenance: 0, freeTotal: 0, supplierTotal: 0, totalExpenses: 0 };
      const amt = parseFloat(r.totalAmount) || 0;
      result[key].freeTotal += amt;
      if (r.expenseCategory === "operational") result[key].operational += amt;
      else if (r.expenseCategory === "maintenance") result[key].maintenance += amt;
    }

    // ── Supplier invoices (paid) grouped by payment date in business-day timezone ──
    // Using paidAt (or updatedAt as fallback), using the same business-day tzOffset directly
    const [supplierRows] = await conn.execute(
      `SELECT
        DATE_FORMAT(
          CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'),
          '%Y-%m-%d'
        ) AS dateKey,
        SUM(totalAmount) AS totalAmount
       FROM invoices
       WHERE paymentStatus = 'paid'
         AND DATE_FORMAT(
           CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'),
           '%Y-%m-%d'
         ) >= ?
         AND DATE_FORMAT(
           CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'),
           '%Y-%m-%d'
         ) <= ?
       GROUP BY dateKey
       ORDER BY dateKey`,
      [startDate, endDate]
    ) as any;

    for (const r of supplierRows as any[]) {
      const key = r.dateKey as string;
      if (!result[key]) result[key] = { operational: 0, maintenance: 0, freeTotal: 0, supplierTotal: 0, totalExpenses: 0 };
      result[key].supplierTotal += parseFloat(r.totalAmount) || 0;
    }
  } finally {
    await conn.end();
  }

  // Compute totalExpenses (free + supplier; fixed costs are added per-day in frontend)
  for (const key of Object.keys(result)) {
    result[key].totalExpenses = result[key].freeTotal + result[key].supplierTotal;
  }

  return result;
}

/** Get kitchen pulls summary aggregated by material for a date range */
export async function getKitchenPullsByRange(fromDate: string, toDate: string) {
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  try {
    const tzOffset = await getBusinessDayTzOffset();
    const [rows] = await conn.execute<any[]>(`
      SELECT
        kp.materialId AS materialId,
        kp.materialName AS materialName,
        kp.materialNameAr AS materialNameAr,
        kp.materialType AS materialType,
        kp.unit,
        SUM(CAST(kp.pulledQuantity AS DECIMAL(15,4))) AS totalPulled,
        SUM(CAST(COALESCE(kp.wasteQty, '0') AS DECIMAL(15,4))) AS totalWaste,
        COUNT(DISTINCT DATE(CONVERT_TZ(kp.pullDate, '+00:00', ?))) AS daysCount,
        rm.lastPurchasePrice AS unitCost
      FROM kitchen_daily_pulls kp
      LEFT JOIN raw_materials rm ON kp.materialId = rm.id
      WHERE (
        (kp.status = 'open' AND DATE(CONVERT_TZ(kp.pullDate, '+00:00', ?)) BETWEEN ? AND ?)
        OR
        (kp.status IN ('counted','closed') AND DATE(DATE_SUB(CONVERT_TZ(kp.updatedAt, '+00:00', ?), INTERVAL 6 HOUR)) BETWEEN ? AND ?)
      )
      GROUP BY kp.materialId, kp.materialName, kp.materialNameAr, kp.materialType, kp.unit, rm.lastPurchasePrice
      ORDER BY totalPulled DESC
    `, [tzOffset, tzOffset, fromDate, toDate, tzOffset, fromDate, toDate]);

    const enriched = await Promise.all(
      rows.map(async (row: any) => {
        const unitCost = row.unitCost ? parseFloat(row.unitCost) : 0;
        let finalCost = unitCost;
        if (row.materialType === 'semi_finished' && unitCost === 0) {
          finalCost = await calcSemiFinishedCost(row.materialId).catch(() => 0);
        }
        const totalPulled = parseFloat(row.totalPulled ?? '0');
        return {
          materialId: row.materialId as number,
          materialName: row.materialName as string,
          materialNameAr: row.materialNameAr as string | null,
          materialType: row.materialType as string,
          unit: row.unit as string,
          totalPulled,
          totalWaste: parseFloat(row.totalWaste ?? '0'),
          daysCount: parseInt(row.daysCount ?? '0'),
          unitCost: finalCost,
          totalCost: totalPulled * finalCost,
        };
      })
    );
    return enriched;
  } finally {
    await conn.end();
  }
}

// ─── Unified Invoices (Supplier + Free) ──────────────────────────────────────
export async function getAllInvoicesUnified(filters?: {
  dateFrom?: string;
  dateTo?: string;
  month?: string;
  paymentStatus?: string;
  invoiceType?: string;
  search?: string;
  paidDateFrom?: string;
  paidDateTo?: string;
  itemName?: string;
}) {
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  try {
    const supplierParams: any[] = [];
    const freeParams: any[] = [];

    let supplierQuery = `
      SELECT 
        CONCAT('S-', id) as uid, id, 'supplier' as invoiceType,
        invoiceNumber, COALESCE(supplierName, '') as partyName,
        expenseCategory, NULL as supplierType,
        invoiceDate as invoiceDate, subtotal, vatAmount, totalAmount,
        paymentStatus, paidAmount, remainingAmount, paidAt, notes, createdAt,
        supplierId, stockUpdated
      FROM invoices WHERE 1=1`;

    let freeQuery = `
      SELECT 
        CONCAT('F-', id) as uid, id, 'free' as invoiceType,
        invoiceNumber, COALESCE(supplierName, '') as partyName,
        expenseCategory, supplierType,
        date as invoiceDate, subtotal, vatAmount, totalAmount,
        paymentStatus, paidAmount, remainingAmount, paidAt, notes, createdAt,
        NULL as supplierId, NULL as stockUpdated
      FROM free_invoices WHERE 1=1`;

    if (filters?.month) {
      // استخدام DATE_FORMAT بدلاً من DATE() لأن العمود timestamp يُرجع كائن Date وليس string
      supplierQuery += ` AND DATE_FORMAT(invoiceDate, '%Y-%m') = ?`;
      supplierParams.push(filters.month);
      freeQuery += ` AND DATE_FORMAT(date, '%Y-%m') = ?`;
      freeParams.push(filters.month);
    } else {
      if (filters?.dateFrom) {
        supplierQuery += ` AND DATE(invoiceDate) >= ?`;
        supplierParams.push(filters.dateFrom);
        freeQuery += ` AND DATE(date) >= ?`;
        freeParams.push(filters.dateFrom);
      }
      if (filters?.dateTo) {
        supplierQuery += ` AND DATE(invoiceDate) <= ?`;
        supplierParams.push(filters.dateTo);
        freeQuery += ` AND DATE(date) <= ?`;
        freeParams.push(filters.dateTo);
      }
    }

    if (filters?.paymentStatus && filters.paymentStatus !== 'all') {
      supplierQuery += ` AND paymentStatus = ?`;
      supplierParams.push(filters.paymentStatus);
      freeQuery += ` AND paymentStatus = ?`;
      freeParams.push(filters.paymentStatus);
    }

    if (filters?.search) {
      const like = `%${filters.search}%`;
      supplierQuery += ` AND (supplierName LIKE ? OR invoiceNumber LIKE ?)`;
      supplierParams.push(like, like);
      freeQuery += ` AND (supplierName LIKE ? OR invoiceNumber LIKE ?)`;
      freeParams.push(like, like);
    }

    // فلتر باسم البند: نجلب فقط الفواتير التي تحتوي على هذا البند
    if (filters?.itemName) {
      supplierQuery += ` AND id IN (SELECT DISTINCT invoiceId FROM invoice_items WHERE materialName = ?)`;
      supplierParams.push(filters.itemName);
      freeQuery += ` AND id IN (SELECT DISTINCT invoiceId FROM free_invoice_items WHERE description = ?)`;
      freeParams.push(filters.itemName);
    }

    // فلتر تاريخ الدفع بمنطق اليوم التشغيلي (6 صباحاً دبي)
    if (filters?.paidDateFrom) {
      supplierQuery += ` AND DATE(DATE_SUB(CONVERT_TZ(paidAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) >= ?`;
      supplierParams.push(filters.paidDateFrom);
      freeQuery += ` AND DATE(DATE_SUB(CONVERT_TZ(paidAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) >= ?`;
      freeParams.push(filters.paidDateFrom);
    }
    if (filters?.paidDateTo) {
      supplierQuery += ` AND DATE(DATE_SUB(CONVERT_TZ(paidAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) <= ?`;
      supplierParams.push(filters.paidDateTo);
      freeQuery += ` AND DATE(DATE_SUB(CONVERT_TZ(paidAt, '+00:00', '+04:00'), INTERVAL 6 HOUR)) <= ?`;
      freeParams.push(filters.paidDateTo);
    }

    let rows: any[] = [];

    if (!filters?.invoiceType || filters.invoiceType === 'all' || filters.invoiceType === 'supplier') {
      const [supplierRows] = await conn.execute(supplierQuery + ' ORDER BY invoiceDate DESC', supplierParams) as any;
      rows = rows.concat(supplierRows);
    }

    if (!filters?.invoiceType || filters.invoiceType === 'all' || filters.invoiceType === 'free') {
      const [freeRows] = await conn.execute(freeQuery + ' ORDER BY invoiceDate DESC', freeParams) as any;
      rows = rows.concat(freeRows);
    }

    rows.sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());

    return rows.map(r => ({
      uid: r.uid as string,
      id: r.id as number,
      invoiceType: r.invoiceType as 'supplier' | 'free',
      invoiceNumber: r.invoiceNumber as string,
      partyName: r.partyName as string,
      expenseCategory: r.expenseCategory as string | null,
      supplierType: r.supplierType as string | null,
      invoiceDate: r.invoiceDate as Date,
      subtotal: parseFloat(r.subtotal ?? '0'),
      vatAmount: parseFloat(r.vatAmount ?? '0'),
      totalAmount: parseFloat(r.totalAmount ?? '0'),
      paymentStatus: r.paymentStatus as string,
      paidAmount: parseFloat(r.paidAmount ?? '0'),
      paidAt: r.paidAt as Date | null,
      notes: r.notes as string | null,
      createdAt: r.createdAt as Date,
      supplierId: r.supplierId as number | null,
      stockUpdated: r.stockUpdated as boolean | null,
    }));
  } finally {
    await conn.end();
  }
}


// ─── Invoice Item Names (for filter dropdown) ────────────────────────────────
export async function getInvoiceItemNames(): Promise<string[]> {
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  try {
    // أسماء بنود فواتير الموردين (materialName)
    const [supplierItems] = await conn.execute(
      `SELECT DISTINCT materialName as name FROM invoice_items WHERE materialName IS NOT NULL AND materialName != '' ORDER BY materialName`
    ) as any;
    // أسماء بنود الفواتير الحرة (description)
    const [freeItems] = await conn.execute(
      `SELECT DISTINCT description as name FROM free_invoice_items WHERE description IS NOT NULL AND description != '' ORDER BY description`
    ) as any;
    const allNames = new Set<string>();
    (supplierItems as any[]).forEach((r: any) => allNames.add(r.name));
    (freeItems as any[]).forEach((r: any) => allNames.add(r.name));
    return Array.from(allNames).sort((a, b) => a.localeCompare(b, 'ar'));
  } finally {
    await conn.end();
  }
}

// ─── Financial KPI Dashboard ──────────────────────────────────────────────────
export async function getFinancialKpi(year: number, month: number) {
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  try {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`;

    // 1. إجمالي المبيعات والمصروفات الثابتة للشهر
    const [salesRows] = await conn.query<any[]>(
      `SELECT
        COALESCE(SUM(salesCash+salesCard+salesKita+salesOrders+salesCareem+salesDeliveroo+salesNoon),0) AS totalSales,
        COALESCE(SUM(expensesFixed),0) AS totalFixedEx,
        COALESCE(SUM(supplyToRestaurant+supplyToManagement+supplyExtra),0) AS totalSupply
       FROM daily_accounts
       WHERE accountDate BETWEEN ? AND ?`,
      [monthStart, monthEnd]
    );

    // 1a. المصروفات التشغيلية مباشرة من الفواتير (موردين + حرة) - مطابقة لصفحة الفواتير
    const [opExRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS totalOpEx
       FROM invoices
       WHERE expenseCategory='operational' AND YEAR(invoiceDate)=? AND MONTH(invoiceDate)=?`,
      [year, month]
    );
    const [opExFreeRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS totalOpExFree
       FROM free_invoices
       WHERE expenseCategory='operational' AND YEAR(date)=? AND MONTH(date)=?`,
      [year, month]
    );

    // 1b. المصروفات الصيانة مباشرة من الفواتير (موردين + حرة)
    const [mainExRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS totalMainEx
       FROM invoices
       WHERE expenseCategory='maintenance' AND YEAR(invoiceDate)=? AND MONTH(invoiceDate)=?`,
      [year, month]
    );
    const [mainExFreeRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS totalMainExFree
       FROM free_invoices
       WHERE expenseCategory='maintenance' AND YEAR(date)=? AND MONTH(date)=?`,
      [year, month]
    );

    // 1c. تشغيلية مدفوعة ومؤجلة (لتفاصيل البطاقة)
    const [opPaidRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS opPaid
       FROM invoices
       WHERE expenseCategory='operational' AND paymentStatus='paid' AND YEAR(invoiceDate)=? AND MONTH(invoiceDate)=?`,
      [year, month]
    );
    const [opPaidFreeRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS opPaidFree
       FROM free_invoices
       WHERE expenseCategory='operational' AND paymentStatus='paid' AND YEAR(date)=? AND MONTH(date)=?`,
      [year, month]
    );
    const [opDeferredRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS opDeferred
       FROM invoices
       WHERE expenseCategory='operational' AND paymentStatus='deferred' AND YEAR(invoiceDate)=? AND MONTH(invoiceDate)=?`,
      [year, month]
    );
    const [opDeferredFreeRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS opDeferredFree
       FROM free_invoices
       WHERE expenseCategory='operational' AND paymentStatus='deferred' AND YEAR(date)=? AND MONTH(date)=?`,
      [year, month]
    );

    // 1b. المشتريات الفعلية التي دخلت المخزون (stockUpdated=1) - مدفوعة وآجلة
    const [purchasesRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount),0) AS totalPurchases
       FROM invoices
       WHERE stockUpdated=1 AND YEAR(invoiceDate)=? AND MONTH(invoiceDate)=?`,
      [year, month]
    );

    // 2. المديونية: فواتير موردين غير مدفوعة
    const [debtRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount - COALESCE(paidAmount,0)),0) AS debt
       FROM invoices WHERE paymentStatus NOT IN ('paid','cancelled')`
    );
    const [freeDebtRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount - COALESCE(paidAmount,0)),0) AS debt
       FROM free_invoices WHERE paymentStatus NOT IN ('paid','cancelled')`
    );

    // 3. إقفالات المخزون الشهرية: إقفال الشهر المختار (مخزون آخر المدة) وإقفال الشهر السابق (مخزون أول المدة)
    const [snapshotRows] = await conn.query<any[]>(
      `SELECT year, month, rawMaterialsValue, butcherValue, manufacturedValue, totalValue, snapshotDate, supplierDebt, freeDebt, totalDebt
       FROM monthly_stock_snapshots WHERE year=? AND month=?`,
      [year, month]
    );
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const [prevSnapshotRows] = await conn.query<any[]>(
      `SELECT totalValue FROM monthly_stock_snapshots WHERE year=? AND month=?`,
      [prevYear, prevMonth]
    );
    const snapshot = (snapshotRows as any[])[0] ?? null;
    const prevSnapshot = (prevSnapshotRows as any[])[0] ?? null;

    // 4. قيمة المواد الخام الحالية
    const [rawRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(currentQuantity * COALESCE(averageCost, lastPurchasePrice, 0)),0) AS rawValue
       FROM raw_materials WHERE isActive=1`
    );

    // 5. قيمة منتجات الجزار الحالية
    const [butcherRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(currentStock * pricePerUnit),0) AS butcherValue
       FROM butcher_products WHERE isActive=1`
    );

    // 5b. قيمة المواد المصنعة (آخر رصيد لكل منتج من kitchen_daily_production)
    const [manufacturedRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(t.closingBalance * COALESCE(t.actualUnitCost, 0)), 0) AS manufacturedValue
       FROM kitchen_daily_production t
       INNER JOIN (
         SELECT productName, MAX(productionDate) AS maxDate
         FROM kitchen_daily_production
         GROUP BY productName
       ) latest ON t.productName = latest.productName AND t.productionDate = latest.maxDate`
    );

    // 6. مخزون أول المدة من app_settings
    const [settingsRows] = await conn.query<any[]>(
      `SELECT openingStockValue, openingStockDate FROM app_settings WHERE id=1`
    );

    const s = (salesRows as any[])[0];
    const totalSales = parseFloat(s.totalSales ?? '0');
    // التشغيلية = موردين + حرة (مباشرة من الفواتير - مطابقة لصفحة الفواتير)
    const totalOpEx = parseFloat((opExRows as any[])[0].totalOpEx ?? '0') +
                      parseFloat((opExFreeRows as any[])[0].totalOpExFree ?? '0');
    // الصيانة = موردين + حرة (مباشرة من الفواتير)
    const totalMainEx = parseFloat((mainExRows as any[])[0].totalMainEx ?? '0') +
                        parseFloat((mainExFreeRows as any[])[0].totalMainExFree ?? '0');
    // تشغيلية مدفوعة ومؤجلة
    const opPaid = parseFloat((opPaidRows as any[])[0].opPaid ?? '0') +
                   parseFloat((opPaidFreeRows as any[])[0].opPaidFree ?? '0');
    const opDeferred = parseFloat((opDeferredRows as any[])[0].opDeferred ?? '0') +
                       parseFloat((opDeferredFreeRows as any[])[0].opDeferredFree ?? '0');
    const totalFixedEx = parseFloat(s.totalFixedEx ?? '0');
    const totalSupply = parseFloat(s.totalSupply ?? '0');
    const totalExpenses = totalOpEx + totalMainEx + totalFixedEx;

    // صافي المبيعات = إجمالي المبيعات (لا يوجد جدول خصومات حالياً)
    const netSales = totalSales;

    // تكلفة البضاعة المستخدمة = مخزون أول + مشتريات فعلية - مخزون آخر
    const totalPurchases = parseFloat((purchasesRows as any[])[0].totalPurchases ?? '0');

    const liveSupplierDebt = parseFloat((debtRows as any[])[0].debt ?? '0');
    const liveFreeDebt = parseFloat((freeDebtRows as any[])[0].debt ?? '0');
    const liveTotalDebt = liveSupplierDebt + liveFreeDebt;

    // إذا كان الشهر المختار مُقفلاً، استخدم المديونية المُرحّلة عند الإقفال؛ وإلا المديونية اللحظية
    const supplierDebt = snapshot ? parseFloat(snapshot.supplierDebt) : liveSupplierDebt;
    const freeDebt = snapshot ? parseFloat(snapshot.freeDebt) : liveFreeDebt;
    const totalDebt = snapshot ? parseFloat(snapshot.totalDebt) : liveTotalDebt;

    // إذا كان الشهر المختار مُقفلاً، استخدم القيم المجمّدة في الإقفال؛ وإلا استخدم القيم اللحظية
    const liveRawMaterialsValue = parseFloat((rawRows as any[])[0].rawValue ?? '0');
    const liveButcherValue = parseFloat((butcherRows as any[])[0].butcherValue ?? '0');
    const liveManufacturedValue = parseFloat((manufacturedRows as any[])[0].manufacturedValue ?? '0');
    const liveCurrentInventoryValue = liveRawMaterialsValue + liveButcherValue + liveManufacturedValue;

    const isMonthClosed = !!snapshot;
    const rawMaterialsValue = snapshot ? parseFloat(snapshot.rawMaterialsValue) : liveRawMaterialsValue;
    const butcherValue = snapshot ? parseFloat(snapshot.butcherValue) : liveButcherValue;
    const manufacturedValue = snapshot ? parseFloat(snapshot.manufacturedValue) : liveManufacturedValue;
    const currentInventoryValue = snapshot ? parseFloat(snapshot.totalValue) : liveCurrentInventoryValue;

    const settings = (settingsRows as any[])[0];
    // مخزون أول المدة: إقفال الشهر السابق إن وُجد، وإلا القيمة العامة من الإعدادات
    const openingStockValue = prevSnapshot
      ? parseFloat(prevSnapshot.totalValue)
      : parseFloat(settings?.openingStockValue ?? '0');
    // تحويل Date object إلى string بصيغة YYYY-MM-DD لتجنب خطأ React
    const rawDate = settings?.openingStockDate;
    const openingStockDate: string | null = prevSnapshot
      ? null
      : (rawDate
          ? (rawDate instanceof Date
              ? rawDate.toISOString().split('T')[0]
              : String(rawDate).split('T')[0])
          : null);

    // تكلفة البضاعة المستخدمة = مخزون أول + التشغيلية فقط - مخزون آخر
    const cogsPurchases = totalOpEx;
    const cogsValue = openingStockValue + cogsPurchases - currentInventoryValue;

    // مجمل الربح = صافي المبيعات - تكلفة البضاعة المستخدمة
    const grossProfit = netSales - cogsValue;
    const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
    // الربح قبل الثابت = مجمل الربح - المصروفات التشغيلية (تشغيلية + صيانة)
    const profitBeforeFixed = grossProfit - totalOpEx - totalMainEx;
    const profitBeforeFixedMargin = netSales > 0 ? (profitBeforeFixed / netSales) * 100 : 0;
    // صافي الربح = الربح قبل الثابت - المصروفات الثابتة
    const netProfit = profitBeforeFixed - totalFixedEx;
    const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    return {
      totalSales,
      netSales,
      totalOpEx,
      opPaid,
      opDeferred,
      totalMainEx,
      totalFixedEx,
      totalExpenses,
      totalSupply,
      totalPurchases,
      cogsValue,
      grossProfit,
      grossMargin,
      profitBeforeFixed,
      profitBeforeFixedMargin,
      netProfit,
      profitMargin,
      supplierDebt,
      freeDebt,
      totalDebt,
      rawMaterialsValue,
      butcherValue,
      manufacturedValue,
      currentInventoryValue,
      openingStockValue,
      openingStockDate,
      isMonthClosed,
      monthClosedDate: snapshot?.snapshotDate ?? null,
      liveCurrentInventoryValue,
      liveRawMaterialsValue,
      liveButcherValue,
      liveManufacturedValue,
    };
  } finally {
    await conn.end();
  }
}

// ─── إقفال الشهر: تجميد قيمة المخزون الحالية كمخزون آخر المدة لهذا الشهر ──────
export async function closeMonth(year: number, month: number, createdBy: number | null) {
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  try {
    const [existing] = await conn.query<any[]>(
      `SELECT id FROM monthly_stock_snapshots WHERE year=? AND month=?`,
      [year, month]
    );
    if ((existing as any[]).length > 0) {
      throw new Error("هذا الشهر مُقفل بالفعل");
    }

    const [rawRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(currentQuantity * COALESCE(averageCost, lastPurchasePrice, 0)),0) AS rawValue
       FROM raw_materials WHERE isActive=1`
    );
    const [butcherRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(currentStock * pricePerUnit),0) AS butcherValue
       FROM butcher_products WHERE isActive=1`
    );
    const [manufacturedRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(t.closingBalance * COALESCE(t.actualUnitCost, 0)), 0) AS manufacturedValue
       FROM kitchen_daily_production t
       INNER JOIN (
         SELECT productName, MAX(productionDate) AS maxDate
         FROM kitchen_daily_production
         GROUP BY productName
       ) latest ON t.productName = latest.productName AND t.productionDate = latest.maxDate`
    );
    const [debtRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount - COALESCE(paidAmount,0)),0) AS debt
       FROM invoices WHERE paymentStatus NOT IN ('paid','cancelled')`
    );
    const [freeDebtRows] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(totalAmount - COALESCE(paidAmount,0)),0) AS debt
       FROM free_invoices WHERE paymentStatus NOT IN ('paid','cancelled')`
    );

    const rawMaterialsValue = parseFloat((rawRows as any[])[0].rawValue ?? '0');
    const butcherValue = parseFloat((butcherRows as any[])[0].butcherValue ?? '0');
    const manufacturedValue = parseFloat((manufacturedRows as any[])[0].manufacturedValue ?? '0');
    const totalValue = rawMaterialsValue + butcherValue + manufacturedValue;
    const supplierDebt = parseFloat((debtRows as any[])[0].debt ?? '0');
    const freeDebt = parseFloat((freeDebtRows as any[])[0].debt ?? '0');
    const totalDebt = supplierDebt + freeDebt;
    const snapshotDate = new Date().toISOString().split('T')[0];

    await conn.execute(
      `INSERT INTO monthly_stock_snapshots
        (year, month, rawMaterialsValue, butcherValue, manufacturedValue, totalValue, supplierDebt, freeDebt, totalDebt, snapshotDate, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [year, month, rawMaterialsValue, butcherValue, manufacturedValue, totalValue, supplierDebt, freeDebt, totalDebt, snapshotDate, createdBy]
    );

    return { success: true, rawMaterialsValue, butcherValue, manufacturedValue, totalValue, supplierDebt, freeDebt, totalDebt, snapshotDate };
  } finally {
    await conn.end();
  }
}

export async function updateOpeningStock(openingStockValue: number, openingStockDate: string) {
  const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
  try {
    await conn.execute(
      `UPDATE app_settings SET openingStockValue=?, openingStockDate=? WHERE id=1`,
      [openingStockValue, openingStockDate]
    );
    return { success: true };
  } finally {
    await conn.end();
  }
}

// ─── Material Ledger (حركات المادة مع الرصيد المتراكم) ────────────────────────
export async function getMaterialLedger(materialId: number, limit = 500) {
  const db = await getDb();
  if (!db) return { material: null, transactions: [] };

  // Get material info
  const matRows = await db
    .select({
      id: rawMaterials.id,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      code: rawMaterials.code,
      unit: rawMaterials.unit,
      currentQuantity: rawMaterials.currentQuantity,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
      materialType: rawMaterials.materialType,
    })
    .from(rawMaterials)
    .where(eq(rawMaterials.id, materialId))
    .limit(1);

  if (!matRows.length) return { material: null, transactions: [] };
  const material = matRows[0];

  // Get all transactions ordered oldest first (to compute running balance)
  const txs = await db
    .select({
      id: inventoryTransactions.id,
      transactionType: inventoryTransactions.transactionType,
      quantity: inventoryTransactions.quantity,
      unitPrice: inventoryTransactions.unitPrice,
      totalAmount: inventoryTransactions.totalAmount,
      reason: inventoryTransactions.reason,
      supplierName: inventoryTransactions.supplierName,
      destination: inventoryTransactions.destination,
      referenceNumber: inventoryTransactions.referenceNumber,
      notes: inventoryTransactions.notes,
      transactionDate: inventoryTransactions.transactionDate,
      createdAt: inventoryTransactions.createdAt,
    })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.materialId, materialId))
    .orderBy(inventoryTransactions.transactionDate, inventoryTransactions.id)
    .limit(limit);

  // Compute running balance (oldest → newest)
  let runningBalance = 0;
  const withBalance = txs.map((tx) => {
    const qty = parseFloat(tx.quantity as string);
    if (tx.transactionType === "IN") {
      runningBalance += qty;
    } else if (tx.transactionType === "OUT") {
      runningBalance -= qty;
    }
    return {
      ...tx,
      runningBalance: Math.round(runningBalance * 1000) / 1000,
    };
  });

  // Return reversed (newest first) for display
  return {
    material,
    transactions: withBalance.reverse(),
  };
}

/** Export all semi-finished materials with their full recipe for Excel export */
export async function getAllSemiFinishedForExport() {
  const db = await getDb();
  if (!db) return { materials: [], ingredients: [] };
  const sfr = semiFinishedRecipes;
  const ingredient = rawMaterials;
  // Get all semi-finished materials
  const materials = await listSemiFinishedMaterials();
  // Get all recipe items for all semi-finished materials in one query
  const allIngredients = await db
    .select({
      recipeItemId: sfr.id,
      materialId: sfr.materialId,
      ingredientId: sfr.ingredientId,
      quantity: sfr.quantity,
      actualQuantity: sfr.actualQuantity,
      unit: sfr.unit,
      notes: sfr.notes,
      ingredientName: ingredient.name,
      ingredientNameAr: ingredient.nameAr,
      ingredientUnit: ingredient.unit,
      lastPurchasePrice: ingredient.lastPurchasePrice,
      ingredientType: ingredient.materialType,
    })
    .from(sfr)
    .innerJoin(ingredient, eq(sfr.ingredientId, ingredient.id))
    .orderBy(sfr.materialId, sfr.id);
  return { materials, ingredients: allIngredients };
}

// ─── Material Price History ────────────────────────────────────────────────
export async function getMaterialPriceHistory(params: {
  startDate: Date;
  endDate: Date;
  materialIds?: number[];
}) {
  const db = await getDb();
  if (!db) return { materials: [], priceHistory: [] };

  // جلب كل المواد الخام النشطة
  const allMaterials = await db
    .select({
      id: rawMaterials.id,
      name: rawMaterials.name,
      nameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      lastPurchasePrice: rawMaterials.lastPurchasePrice,
    })
    .from(rawMaterials)
    .where(eq(rawMaterials.isActive, true))
    .orderBy(rawMaterials.nameAr, rawMaterials.name);

  // جلب تاريخ الأسعار من invoice_items
  const conn = await (await import('mysql2/promise')).createConnection(process.env.DATABASE_URL!);
  try {
    const matFilter = params.materialIds && params.materialIds.length > 0
      ? `AND ii.materialId IN (${params.materialIds.map(() => '?').join(',')})`
      : '';
    const [rows] = await conn.execute<any[]>(
      `SELECT
         ii.materialId,
         ii.materialName,
         ii.unitPrice,
         ii.quantity,
         i.invoiceDate,
         i.supplierName,
         i.invoiceNumber
       FROM invoice_items ii
       JOIN invoices i ON ii.invoiceId = i.id
       WHERE ii.unitPrice > 0
         AND i.invoiceDate >= ?
         AND i.invoiceDate <= ?
         ${matFilter}
       ORDER BY ii.materialId, i.invoiceDate ASC`,
      [
        params.startDate,
        params.endDate,
        ...(params.materialIds && params.materialIds.length > 0 ? params.materialIds : []),
      ]
    );

    // تحديد المواد التي لديها بيانات فعلاً
    const materialIdsWithData = new Set<number>(rows.map((r: any) => r.materialId));
    const filteredMaterials = params.materialIds && params.materialIds.length > 0
      ? allMaterials.filter(m => params.materialIds!.includes(m.id))
      : allMaterials.filter(m => materialIdsWithData.has(m.id));

    return {
      materials: filteredMaterials,
      priceHistory: rows.map((r: any) => ({
        materialId: Number(r.materialId),
        materialName: r.materialName as string,
        unitPrice: parseFloat(r.unitPrice),
        quantity: parseFloat(r.quantity),
        invoiceDate: r.invoiceDate instanceof Date ? r.invoiceDate.toISOString() : String(r.invoiceDate),
        supplierName: r.supplierName as string,
        invoiceNumber: r.invoiceNumber as string,
      })),
    };
  } finally {
    await conn.end();
  }
}


// ─── Saved Menus ──────────────────────────────────────────────────────────────
import { randomBytes } from "crypto";

export async function saveMenu(data: {
  name: string;
  menuData: string;
  restaurantName?: string;
  restaurantLogo?: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const token = randomBytes(24).toString("hex");
  const [result] = await db.insert(savedMenus).values({
    name: data.name,
    token,
    menuData: data.menuData,
    restaurantName: data.restaurantName,
    restaurantLogo: data.restaurantLogo,
    createdBy: data.createdBy,
  });
  const id = (result as any).insertId as number;
  const rows = await db.select().from(savedMenus).where(eq(savedMenus.id, id)).limit(1);
  return rows[0];
}

export async function listSavedMenus(createdBy?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(savedMenus.isActive, true)];
  if (createdBy !== undefined) conditions.push(eq(savedMenus.createdBy, createdBy));
  return db
    .select({
      id: savedMenus.id,
      name: savedMenus.name,
      token: savedMenus.token,
      restaurantName: savedMenus.restaurantName,
      createdAt: savedMenus.createdAt,
    })
    .from(savedMenus)
    .where(and(...conditions))
    .orderBy(desc(savedMenus.createdAt));
}

export async function getPublicMenu(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(savedMenus)
    .where(and(eq(savedMenus.token, token), eq(savedMenus.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSavedMenu(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(savedMenus).set({ isActive: false }).where(eq(savedMenus.id, id));
  return { success: true };
}

// ─── Restaurant Settings ──────────────────────────────────────────────────────
export async function getRestaurantSettings() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(restaurantSettings).limit(1);
  return rows[0] ?? null;
}

export async function getOrCreateLiveMenuToken(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(restaurantSettings).limit(1);
  if (rows[0]?.liveMenuToken) return rows[0].liveMenuToken;
  // Create a stable token based on a random string (generated once, never changes)
  const { randomBytes } = await import("crypto");
  const token = "live-" + randomBytes(12).toString("hex");
  await db.insert(restaurantSettings).values({ liveMenuToken: token });
  return token;
}

export async function updateLiveMenu(savedMenuId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db.select().from(restaurantSettings).limit(1);
  if (rows[0]) {
    await db.update(restaurantSettings).set({ liveMenuId: savedMenuId }).where(eq(restaurantSettings.id, rows[0].id));
  } else {
    const { randomBytes } = await import("crypto");
    const token = "live-" + randomBytes(12).toString("hex");
    await db.insert(restaurantSettings).values({ liveMenuToken: token, liveMenuId: savedMenuId });
  }
}

export async function getMenuByLiveToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  // Find the settings row with this live token
  const settingsRows = await db
    .select({ liveMenuId: restaurantSettings.liveMenuId })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.liveMenuToken, token))
    .limit(1);
  if (!settingsRows[0]?.liveMenuId) return null;
  // Get the actual menu data
  const menuRows = await db
    .select()
    .from(savedMenus)
    .where(and(eq(savedMenus.id, settingsRows[0].liveMenuId), eq(savedMenus.isActive, true)))
    .limit(1);
  return menuRows[0] ?? null;
}

/** الحصول على المنيو الافتراضي (للرابط البسيط /menu) */
export async function getDefaultMenu() {
  const db = await getDb();
  if (!db) return null;
  // Get the live menu from restaurant settings (same as getByLiveToken but no token needed)
  const settingsRows = await db
    .select({ liveMenuId: restaurantSettings.liveMenuId, restaurantName: restaurantSettings.restaurantName })
    .from(restaurantSettings)
    .limit(1);
  if (!settingsRows[0]?.liveMenuId) {
    // Fallback: return latest saved menu
    const latest = await db.select().from(savedMenus).where(eq(savedMenus.isActive, true)).orderBy(desc(savedMenus.updatedAt)).limit(1);
    return latest[0] ?? null;
  }
  const menuRows = await db.select().from(savedMenus)
    .where(and(eq(savedMenus.id, settingsRows[0].liveMenuId), eq(savedMenus.isActive, true))).limit(1);
  return menuRows[0] ?? null;
}

export async function getLatestSavedMenu() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(savedMenus)
    .where(eq(savedMenus.isActive, true))
    .orderBy(desc(savedMenus.createdAt))
    .limit(1);
  return rows[0] ?? null;
}



