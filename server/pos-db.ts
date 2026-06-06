/**
 * POS System — Orders, Tables, Payments, Returns
 * Drives Cashier, Waiter and Kitchen Display interfaces.
 *
 * INVENTORY DEDUCTION LOGIC (3-layer model):
 *   When a sale is paid, for each item:
 *   1. Try to deduct from kitchen_item_production (Layer 3 — service stock)
 *      → If production record exists: deduct soldQty, check 86'd
 *   2. If no service stock record: fall back to recipe-based raw material deduction
 *      → Direct deduction from raw_materials via recipe_items
 *   This gives flexibility: restaurants that pre-produce use Layer 3,
 *   restaurants that cook on-demand fall back to Layer 1 automatically.
 */
import "dotenv/config";
import { db } from "./db";

// Strip undefined/null/empty-string from an object before Drizzle INSERT.
// Prevents MySQL2 from sending '' for nullable INT/FK columns which causes FK violations.
function clean<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ) as Partial<T>;
}
import {
  restaurantTables,
  posOrders,
  posOrderItems,
  posPayments,
  posReturns,
  posCustomers,
  products,
  users,
  inventoryTransactions,
  recipeItems,
  rawMaterials,
  kitchenItemProduction,
  semiFinishedRecipes,
  kitchenDailyPulls,
} from "../drizzle/schema";
import { like, or } from "drizzle-orm";
import { eq, and, gte, lte, inArray, desc, sql, ne } from "drizzle-orm";
import { deductFromServiceStock } from "./kitchen-service-stock-db";
import { getBusinessDayTzOffset } from "./db";

// Business-day aware date comparison helper
// Converts a UTC timestamp to the business-day date using the configured start hour
async function bizDate(col: ReturnType<typeof sql>) {
  const tz = await getBusinessDayTzOffset();
  return sql`DATE(CONVERT_TZ(${col}, '+00:00', ${tz}))`;
}
async function bizToday() {
  const tz = await getBusinessDayTzOffset();
  return sql`DATE(CONVERT_TZ(NOW(), '+00:00', ${tz}))`;
}

// ─── Unit conversion helper (recipe unit → material base unit) ─────────────
function convertRecipeUnit(qty: number, recipeUnit: string, materialUnit: string): number {
  const r = (recipeUnit ?? "").toLowerCase().trim();
  const m = (materialUnit ?? "").toLowerCase().trim();
  if (r === m) return qty;
  // weight: base=kg
  if (m === "kg") {
    if (r === "g")  return qty / 1000;
    if (r === "mg") return qty / 1_000_000;
  }
  if (m === "g") {
    if (r === "kg") return qty * 1000;
    if (r === "mg") return qty / 1000;
  }
  // volume: base=l
  if (m === "l" || m === "liter") {
    if (r === "ml") return qty / 1000;
    if (r === "cl") return qty / 100;
    if (r === "dl") return qty / 10;
  }
  if (m === "ml") {
    if (r === "l" || r === "liter") return qty * 1000;
  }
  return qty; // same family or unknown — return as-is
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PosOrderWithItems {
  id: number;
  orderNumber: string;
  tableId: number | null;
  tableLabel: string | null;
  orderType: string;
  status: string;
  waiterName: string | null;
  guestCount: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  sentToKitchenAt: Date | null;
  readyAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  items: PosOrderItemRow[];
}

export interface PosOrderItemRow {
  id: number;
  productId: number;
  productName: string;
  productNameAr: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
  status: string;
  notes: string | null;
  course: string | null;
}

// ─── Order Number Generator ───────────────────────────────────────────────────

async function generateOrderNumber(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const [row] = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(posOrders)
    .where(sql`DATE(createdAt) = CURDATE()`);
  const seq = ((row?.cnt ?? 0) as number) + 1;
  return `ORD-${today}-${String(seq).padStart(4, "0")}`;
}

// ─── Tables CRUD ─────────────────────────────────────────────────────────────

export async function listTables() {
  const rows = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.isActive, true))
    .orderBy(restaurantTables.sortOrder, restaurantTables.tableNumber);

  // Attach active order per table
  const occupied = await db
    .select({ tableId: posOrders.tableId, orderId: posOrders.id, orderNumber: posOrders.orderNumber, status: posOrders.status, total: posOrders.total })
    .from(posOrders)
    .where(
      and(
        inArray(posOrders.status, ["draft", "sent_to_kitchen", "partially_ready", "ready", "served"]),
        sql`tableId IS NOT NULL`
      )
    );

  const occupiedMap = new Map<number, typeof occupied[0]>();
  for (const o of occupied) {
    if (o.tableId) occupiedMap.set(o.tableId, o);
  }

  return rows.map((t) => ({
    ...t,
    activeOrder: occupiedMap.get(t.id) ?? null,
  }));
}

export async function createTable(data: {
  tableNumber: string;
  label?: string;
  capacity?: number;
  section?: string;
  sortOrder?: number;
}) {
  const [res] = await db.insert(restaurantTables).values({
    tableNumber: data.tableNumber,
    label: data.label,
    capacity: data.capacity ?? 4,
    section: data.section,
    sortOrder: data.sortOrder ?? 0,
  });
  return { id: (res as any).insertId };
}

export async function updateTable(id: number, data: {
  tableNumber?: string;
  label?: string;
  capacity?: number;
  section?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  await db.update(restaurantTables).set(data).where(eq(restaurantTables.id, id));
}

export async function deleteTable(id: number) {
  await db.update(restaurantTables).set({ isActive: false }).where(eq(restaurantTables.id, id));
}

export async function clearTable(tableId: number) {
  // Check if table has any unpaid active orders
  const activeOrders = await db
    .select({ id: posOrders.id, status: posOrders.status })
    .from(posOrders)
    .where(and(
      eq(posOrders.tableId, tableId),
      inArray(posOrders.status, ["draft", "sent_to_kitchen", "partially_ready", "ready", "served"])
    ));
  if (activeOrders.length > 0) {
    throw new Error("لا يمكن تفريغ الطاولة — يوجد طلب نشط غير مدفوع");
  }
  await db.update(restaurantTables)
    .set({ status: "available" } as any)
    .where(eq(restaurantTables.id, tableId));
}

// ─── Orders CRUD ─────────────────────────────────────────────────────────────

export async function createOrder(data: {
  tableId?: number;
  orderType?: string;
  waiterId?: number;
  guestCount?: number;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  taxPct?: number;
}) {
  const orderNumber = await generateOrderNumber();
  const [res] = await db.insert(posOrders).values(clean({
    orderNumber,
    orderType:     (data.orderType ?? "dine_in") as any,
    guestCount:    data.guestCount ?? 1,
    taxPct:        String(data.taxPct ?? 0),
    tableId:       data.tableId,
    waiterId:      data.waiterId,
    notes:         data.notes,
    customerName:  data.customerName,
    customerPhone: data.customerPhone,
  }) as any);
  if (data.tableId) {
    await db.update(restaurantTables)
      .set({ status: "occupied" })
      .where(eq(restaurantTables.id, data.tableId));
  }
  return { id: (res as any).insertId, orderNumber };
}

export async function getOrderById(id: number): Promise<PosOrderWithItems | null> {
  const [order] = await db
    .select({
      id: posOrders.id,
      orderNumber: posOrders.orderNumber,
      tableId: posOrders.tableId,
      tableLabel: restaurantTables.label,
      tableNumber: restaurantTables.tableNumber,
      orderType: posOrders.orderType,
      status: posOrders.status,
      waiterName: users.name,
      guestCount: posOrders.guestCount,
      subtotal: posOrders.subtotal,
      discountAmount: posOrders.discountAmount,
      taxAmount: posOrders.taxAmount,
      total: posOrders.total,
      notes: posOrders.notes,
      customerName: posOrders.customerName,
      customerPhone: posOrders.customerPhone,
      sentToKitchenAt: posOrders.sentToKitchenAt,
      readyAt: posOrders.readyAt,
      paidAt: posOrders.paidAt,
      createdAt: posOrders.createdAt,
    })
    .from(posOrders)
    .leftJoin(restaurantTables, eq(posOrders.tableId, restaurantTables.id))
    .leftJoin(users, eq(posOrders.waiterId, users.id))
    .where(eq(posOrders.id, id));

  if (!order) return null;

  const items = await db
    .select()
    .from(posOrderItems)
    .where(and(eq(posOrderItems.orderId, id), ne(posOrderItems.status, "cancelled")))
    .orderBy(posOrderItems.createdAt);

  return {
    ...order,
    tableLabel: order.tableLabel ?? (order as any).tableNumber ?? null,
    waiterName: order.waiterName,
    subtotal: parseFloat(order.subtotal as string) || 0,
    discountAmount: parseFloat(order.discountAmount as string) || 0,
    taxAmount: parseFloat(order.taxAmount as string) || 0,
    total: parseFloat(order.total as string) || 0,
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      productNameAr: i.productNameAr ?? null,
      quantity: parseFloat(i.quantity as string) || 0,
      unitPrice: parseFloat(i.unitPrice as string) || 0,
      discountAmount: parseFloat(i.discountAmount as string) || 0,
      totalPrice: parseFloat(i.totalPrice as string) || 0,
      status: i.status,
      notes: i.notes ?? null,
      course: i.course ?? null,
    })),
  };
}

export async function listActiveOrders() {
  const orders = await db
    .select({
      id: posOrders.id,
      orderNumber: posOrders.orderNumber,
      tableId: posOrders.tableId,
      tableLabel: restaurantTables.label,
      tableNumber: restaurantTables.tableNumber,
      orderType: posOrders.orderType,
      status: posOrders.status,
      waiterName: users.name,
      guestCount: posOrders.guestCount,
      total: posOrders.total,
      sentToKitchenAt: posOrders.sentToKitchenAt,
      createdAt: posOrders.createdAt,
    })
    .from(posOrders)
    .leftJoin(restaurantTables, eq(posOrders.tableId, restaurantTables.id))
    .leftJoin(users, eq(posOrders.waiterId, users.id))
    .where(
      inArray(posOrders.status, ["draft", "sent_to_kitchen", "partially_ready", "ready", "served"])
    )
    .orderBy(desc(posOrders.createdAt));

  return orders.map((o) => ({
    ...o,
    tableLabel: o.tableLabel ?? o.tableNumber ?? null,
    total: parseFloat(o.total as string) || 0,
  }));
}

export async function listOrdersForDate(date: string) {
  const orders = await db
    .select({
      id: posOrders.id,
      orderNumber: posOrders.orderNumber,
      tableLabel: restaurantTables.label,
      orderType: posOrders.orderType,
      status: posOrders.status,
      total: posOrders.total,
      paidAt: posOrders.paidAt,
      createdAt: posOrders.createdAt,
    })
    .from(posOrders)
    .leftJoin(restaurantTables, eq(posOrders.tableId, restaurantTables.id))
    .where(sql`DATE(${posOrders.createdAt}) = ${date}`)
    .orderBy(desc(posOrders.createdAt));

  return orders.map((o) => ({
    ...o,
    total: parseFloat(o.total as string) || 0,
  }));
}

// ─── Order Items ──────────────────────────────────────────────────────────────

export async function addItemToOrder(orderId: number, data: {
  productId: number;
  quantity: number;
  notes?: string;
  course?: string;
}) {
  const [product] = await db
    .select({ name: products.name, nameAr: products.nameAr, price: products.price })
    .from(products)
    .where(eq(products.id, data.productId));

  if (!product) throw new Error("Product not found");

  const unitPrice = parseFloat(product.price as string) || 0;
  const totalPrice = unitPrice * data.quantity;

  const [res] = await db.insert(posOrderItems).values(clean({
    orderId,
    productId:    data.productId,
    productName:  product.name,
    productNameAr: product.nameAr,
    quantity:     String(data.quantity),
    unitPrice:    String(unitPrice),
    totalPrice:   String(totalPrice),
    notes:        data.notes,
    course:       data.course,
  }) as any);

  await recalcOrderTotals(orderId);
  return { id: (res as any).insertId };
}

export async function updateOrderItem(itemId: number, data: {
  quantity?: number;
  notes?: string;
  discountAmount?: number;
}) {
  const [item] = await db.select().from(posOrderItems).where(eq(posOrderItems.id, itemId));
  if (!item) throw new Error("Item not found");

  const newQty = data.quantity ?? parseFloat(item.quantity as string);
  const unitPrice = parseFloat(item.unitPrice as string);
  const discount = data.discountAmount ?? parseFloat(item.discountAmount as string) ?? 0;
  const newTotal = unitPrice * newQty - discount;

  await db.update(posOrderItems).set({
    quantity: String(newQty),
    notes: data.notes ?? item.notes,
    discountAmount: String(discount),
    totalPrice: String(newTotal),
  }).where(eq(posOrderItems.id, itemId));

  await recalcOrderTotals(item.orderId);
}

export async function cancelOrderItem(itemId: number) {
  const [item] = await db.select().from(posOrderItems).where(eq(posOrderItems.id, itemId));
  if (!item) throw new Error("Item not found");
  await db.update(posOrderItems).set({ status: "cancelled" }).where(eq(posOrderItems.id, itemId));
  await recalcOrderTotals(item.orderId);
}

async function recalcOrderTotals(orderId: number) {
  const [order] = await db.select().from(posOrders).where(eq(posOrders.id, orderId));
  if (!order) return;

  const items = await db
    .select({ totalPrice: posOrderItems.totalPrice })
    .from(posOrderItems)
    .where(and(eq(posOrderItems.orderId, orderId), ne(posOrderItems.status, "cancelled")));

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.totalPrice as string) || 0), 0);
  const discountAmt = parseFloat(order.discountAmount as string) || 0;
  const taxPct = parseFloat(order.taxPct as string) || 0;
  const taxAmount = ((subtotal - discountAmt) * taxPct) / 100;
  const total = subtotal - discountAmt + taxAmount;

  await db.update(posOrders).set({
    subtotal: String(Math.round(subtotal * 1000) / 1000),
    taxAmount: String(Math.round(taxAmount * 1000) / 1000),
    total: String(Math.round(total * 1000) / 1000),
  }).where(eq(posOrders.id, orderId));
}

// ─── Order Lifecycle ──────────────────────────────────────────────────────────

export async function applyOrderDiscount(orderId: number, discountType: "fixed" | "percentage", discountValue: number) {
  const [order] = await db.select().from(posOrders).where(eq(posOrders.id, orderId));
  if (!order) throw new Error("Order not found");

  const subtotal = parseFloat(order.subtotal as string) || 0;
  const discountAmt = discountType === "fixed"
    ? Math.min(discountValue, subtotal)
    : Math.round((subtotal * discountValue / 100) * 1000) / 1000;

  const taxPct = parseFloat(order.taxPct as string) || 0;
  const taxAmount = ((subtotal - discountAmt) * taxPct) / 100;
  const total = subtotal - discountAmt + taxAmount;

  await db.update(posOrders).set({
    discountType,
    discountValue: String(discountValue),
    discountAmount: String(Math.round(discountAmt * 1000) / 1000),
    taxAmount: String(Math.round(taxAmount * 1000) / 1000),
    total: String(Math.round(total * 1000) / 1000),
  }).where(eq(posOrders.id, orderId));
}

export async function sendOrderToKitchen(orderId: number) {
  await db.update(posOrders).set({
    status: "sent_to_kitchen",
    sentToKitchenAt: new Date(),
  }).where(eq(posOrders.id, orderId));

  // Real-time push to kitchen display
  const [order] = await db
    .select({ orderNumber: posOrders.orderNumber, orderType: posOrders.orderType })
    .from(posOrders).where(eq(posOrders.id, orderId)).limit(1);
  if (order) {
    const { broadcastKitchenOrder } = await import("./_core/../sseBroadcaster");
    broadcastKitchenOrder({ orderId, orderNumber: order.orderNumber, orderType: order.orderType ?? undefined });
  }
}

/** Called by KDS — mark a single item as preparing / ready */
export async function updateItemStatus(itemId: number, status: "preparing" | "ready" | "served", processedBy?: number) {
  const [item] = await db.select().from(posOrderItems).where(eq(posOrderItems.id, itemId));
  if (!item) throw new Error("Item not found");

  await db.update(posOrderItems).set({ status }).where(eq(posOrderItems.id, itemId));

  // Notify all clients (waiter, cashier) that this order has been updated
  const { broadcastSseEvent } = await import("./_core/../sseBroadcaster");
  broadcastSseEvent("kitchen_item_update", { orderId: item.orderId, itemId, status });

  // Re-evaluate order status (no ingredient deduction here — only via markAllReady)
  const allItems = await db
    .select({ status: posOrderItems.status, productId: posOrderItems.productId, quantity: posOrderItems.quantity })
    .from(posOrderItems)
    .where(and(eq(posOrderItems.orderId, item.orderId), ne(posOrderItems.status, "cancelled")));

  const allReady  = allItems.every((i) => i.status === "ready" || i.status === "served");
  const someReady = allItems.some((i) => i.status === "ready");

  const newOrderStatus = allReady ? "ready" : someReady ? "partially_ready" : undefined;
  if (newOrderStatus) {
    await db.update(posOrders).set({
      status:  newOrderStatus,
      readyAt: allReady ? new Date() : undefined,
    }).where(eq(posOrders.id, item.orderId));
  }

  return { orderId: item.orderId };
}

// ── Deduct recipe ingredients for a completed order ───────────────────────────
// Called ONLY from markAllReady — never automatically on individual item updates.
export async function deductOrderIngredients(orderId: number, processedBy?: number) {
  const today = new Date().toISOString().slice(0, 10);

  const orderItems = await db
    .select({ productId: posOrderItems.productId, quantity: posOrderItems.quantity })
    .from(posOrderItems)
    .where(and(eq(posOrderItems.orderId, orderId), ne(posOrderItems.status, "cancelled")));

  const [orderRow] = await db
    .select({ orderNumber: posOrders.orderNumber })
    .from(posOrders).where(eq(posOrders.id, orderId)).limit(1);

  for (const orderItem of orderItems) {
    if (!orderItem.productId) continue;
    const qty = parseFloat(String(orderItem.quantity)) || 1;

    // Layer 3: kitchen service stock
    const serviceResult = await deductFromServiceStock(orderItem.productId, qty, today);
    if (serviceResult.hadServiceStock) continue;

    // Layer 2: recipe-based deduction
    const recipes = await db
      .select({
        materialId:   recipeItems.materialId,
        quantity:     recipeItems.quantity,
        unit:         recipeItems.unit,
        wastePercent: recipeItems.wastePercent,
        materialUnit: rawMaterials.unit,
        materialType: rawMaterials.materialType,
        currentQty:   rawMaterials.currentQuantity,
      })
      .from(recipeItems)
      .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
      .where(eq(recipeItems.productId, orderItem.productId));

    for (const rec of recipes) {
      const recipeQty    = parseFloat(String(rec.quantity)) || 0;
      const wastePct     = parseFloat(String(rec.wastePercent ?? "0")) || 0;
      const neededQty    = convertRecipeUnit(recipeQty * (1 + wastePct / 100) * qty, rec.unit, rec.materialUnit ?? "");
      if (neededQty <= 0) continue;

      if (rec.materialType === "semi_finished") {
        const stock = parseFloat(String(rec.currentQty ?? "0")) || 0;
        if (stock >= neededQty) {
          await db.execute(sql`UPDATE raw_materials SET currentQuantity = GREATEST(0, currentQuantity - ${neededQty}) WHERE id = ${rec.materialId}`);
          await db.insert(inventoryTransactions).values(clean({ materialId: rec.materialId, transactionType: "OUT", quantity: String(neededQty.toFixed(4)), reason: "production", notes: `Kitchen complete: ${orderRow?.orderNumber ?? ""}`, createdBy: processedBy, transactionDate: new Date() }) as any);
          // تحديث ordersConsumed في kitchen_daily_pulls لليوم
          await db.execute(sql`
            UPDATE kitchen_daily_pulls
            SET ordersConsumed = COALESCE(ordersConsumed, 0) + ${neededQty}
            WHERE materialId = ${rec.materialId}
              AND DATE(CONVERT_TZ(pullDate, '+00:00', @@session.time_zone)) = CURDATE()
          `);
        }
        // Insufficient semi_finished → skip (product was blocked at cashier)
      } else {
        await db.execute(sql`UPDATE raw_materials SET currentQuantity = GREATEST(0, currentQuantity - ${neededQty}) WHERE id = ${rec.materialId}`);
        await db.insert(inventoryTransactions).values(clean({ materialId: rec.materialId, transactionType: "OUT", quantity: String(neededQty.toFixed(4)), reason: "production", notes: `Kitchen complete: ${orderRow?.orderNumber ?? ""}${wastePct > 0 ? ` (+${wastePct}% هدر)` : ""}`, createdBy: processedBy, transactionDate: new Date() }) as any);
      }
    }
  }
}

/** Mark order as served (all items delivered to table) */
export async function markOrderServed(orderId: number) {
  await db.update(posOrders).set({ status: "served", servedAt: new Date() }).where(eq(posOrders.id, orderId));
  await db.update(posOrderItems)
    .set({ status: "served" })
    .where(and(eq(posOrderItems.orderId, orderId), eq(posOrderItems.status, "ready")));
}

/** Cancel entire order */
export async function cancelOrder(orderId: number) {
  const [order] = await db.select().from(posOrders).where(eq(posOrders.id, orderId));
  if (!order) throw new Error("Order not found");

  await db.update(posOrders).set({ status: "cancelled" }).where(eq(posOrders.id, orderId));

  if (order.tableId) {
    // Check no other active order on this table
    const others = await db
      .select({ id: posOrders.id })
      .from(posOrders)
      .where(and(
        eq(posOrders.tableId, order.tableId),
        inArray(posOrders.status, ["draft", "sent_to_kitchen", "partially_ready", "ready", "served"])
      ));
    if (others.length === 0) {
      await db.update(restaurantTables).set({ status: "available" }).where(eq(restaurantTables.id, order.tableId));
    }
  }
}

// ─── Payment ──────────────────────────────────────────────────────────────────

export async function processPayment(orderId: number, data: {
  paymentMethod: "cash" | "card" | "transfer" | "online";
  amount: number;
  cashPaid?: number;
  reference?: string;
  processedBy?: number;
  deductInventory?: boolean;
}) {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "paid") throw new Error("Order already paid");

  // Record payment
  await db.insert(posPayments).values(clean({
    orderId,
    paymentMethod: data.paymentMethod,
    amount:        String(data.amount),
    cashPaid:      data.cashPaid ? String(data.cashPaid) : undefined,
    changeGiven:   data.cashPaid ? String(Math.max(0, data.cashPaid - data.amount)) : undefined,
    reference:     data.reference,
    processedBy:   data.processedBy,
  }) as any);

  // Mark order as paid
  await db.update(posOrders).set({
    status: "paid",
    cashierId: data.processedBy ?? null,
    paidAt: new Date(),
  }).where(eq(posOrders.id, orderId));

  // Free the table
  if (order.tableId) {
    const others = await db
      .select({ id: posOrders.id })
      .from(posOrders)
      .where(and(
        eq(posOrders.tableId, order.tableId),
        inArray(posOrders.status, ["draft", "sent_to_kitchen", "partially_ready", "ready", "served"])
      ));
    if (others.length === 0) {
      await db.update(restaurantTables).set({ status: "available" }).where(eq(restaurantTables.id, order.tableId));
    }
  }

  // ── Inventory deduction (3-layer model) ─────────────────────────────────
  if (data.deductInventory !== false) {
    const today = new Date().toISOString().slice(0, 10);

    for (const item of order.items) {
      // ── Layer 3: Kitchen Service Stock (primary) ──────────────────────────
      const serviceResult = await deductFromServiceStock(item.productId, item.quantity, today);

      if (serviceResult.hadServiceStock) {
        // Successfully deducted from pre-produced kitchen stock.
        // Update the order item with the production record link.
        if (serviceResult.productionId) {
          await db.update(posOrderItems)
            .set({ kitchenProductionId: serviceResult.productionId } as any)
            .where(eq(posOrderItems.id, item.id));
        }
        // Note: raw materials were already deducted when kitchen SET the production qty
        // (if deductRawMaterials=true was used). No double deduction.
        continue;
      }

      // ── Layer 1 Fallback: Recipe-based deduction (on-demand cooking) ────────
      // Fetches recipe ingredients with unit + wastePercent + material info
      const recipes = await db
        .select({
          materialId:    recipeItems.materialId,
          quantity:      recipeItems.quantity,
          unit:          recipeItems.unit,
          wastePercent:  recipeItems.wastePercent,
          materialUnit:  rawMaterials.unit,
          materialType:  rawMaterials.materialType,
          currentQty:    rawMaterials.currentQuantity,
        })
        .from(recipeItems)
        .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
        .where(eq(recipeItems.productId, item.productId));

      for (const rec of recipes) {
        const recipeQty   = parseFloat(rec.quantity as string) || 0;
        const wastePct    = parseFloat(rec.wastePercent as string ?? "0") || 0;
        // Quantity needed per unit sold × number sold, including waste
        const qtyWithWaste = recipeQty * (1 + wastePct / 100) * item.quantity;
        // Convert from recipe unit to material's base unit
        const neededQty = convertRecipeUnit(qtyWithWaste, rec.unit, rec.materialUnit ?? "");
        if (neededQty <= 0) continue;

        if (rec.materialType === "semi_finished") {
          // ── Semi-finished: deduct from semi-finished stock directly ──────────
          // These are kitchen-produced items tracked in raw_materials (semi_finished type)
          const currentStock = parseFloat(rec.currentQty as string ?? "0") || 0;

          if (currentStock >= neededQty) {
            // Enough stock — deduct directly
            await db.execute(
              sql`UPDATE raw_materials
                  SET currentQuantity = GREATEST(0, currentQuantity - ${neededQty})
                  WHERE id = ${rec.materialId}`
            );
            await db.insert(inventoryTransactions).values(clean({
              materialId:      rec.materialId,
              transactionType: "OUT",
              quantity:        String(neededQty.toFixed(4)),
              reason:          "production",
              notes:           `POS: ${order.orderNumber} — صرف مصنّعة`,
              createdBy:       data.processedBy,
              transactionDate: new Date(),
            }) as any);
          } else {
            // Semi-finished stock insufficient — skip deduction entirely.
          }
        } else {
          // ── Raw material: deduct directly from warehouse ──────────────────────
          await db.execute(
            sql`UPDATE raw_materials
                SET currentQuantity = GREATEST(0, currentQuantity - ${neededQty})
                WHERE id = ${rec.materialId}`
          );
          await db.insert(inventoryTransactions).values(clean({
            materialId:      rec.materialId,
            transactionType: "OUT",
            quantity:        String(neededQty.toFixed(4)),
            reason:          "production",
            notes:           `POS: ${order.orderNumber}${wastePct > 0 ? ` (${wastePct}% هدر)` : ""}`,
            createdBy:       data.processedBy,
            transactionDate: new Date(),
          }) as any);
        }
      }
    }
  }

  const changeGiven = data.cashPaid ? Math.max(0, data.cashPaid - data.amount) : 0;
  return { changeGiven };
}

// ─── Returns ──────────────────────────────────────────────────────────────────

export async function processReturn(data: {
  originalOrderId: number;
  reason: string;
  totalRefund: number;
  refundMethod: "cash" | "card" | "credit";
  processedBy?: number;
}) {
  const [res] = await db.insert(posReturns).values(clean({
    originalOrderId: data.originalOrderId,
    reason:          data.reason,
    totalRefund:     String(data.totalRefund),
    refundMethod:    data.refundMethod,
    processedBy:     data.processedBy,
  }) as any);
  await db.update(posOrders).set({ status: "refunded" }).where(eq(posOrders.id, data.originalOrderId));
  return { id: (res as any).insertId };
}

// ─── Kitchen Display Queue ────────────────────────────────────────────────────

export async function getKitchenQueue() {
  const orders = await db
    .select({
      id: posOrders.id,
      orderNumber: posOrders.orderNumber,
      tableLabel: restaurantTables.label,
      tableNumber: restaurantTables.tableNumber,
      orderType: posOrders.orderType,
      status: posOrders.status,
      guestCount: posOrders.guestCount,
      notes: posOrders.notes,
      sentToKitchenAt: posOrders.sentToKitchenAt,
      createdAt: posOrders.createdAt,
    })
    .from(posOrders)
    .leftJoin(restaurantTables, eq(posOrders.tableId, restaurantTables.id))
    .where(inArray(posOrders.status, ["sent_to_kitchen", "partially_ready"]))
    .orderBy(posOrders.sentToKitchenAt);

  const result = [];
  for (const order of orders) {
    const items = await db
      .select()
      .from(posOrderItems)
      .where(and(
        eq(posOrderItems.orderId, order.id),
        ne(posOrderItems.status, "cancelled"),
        ne(posOrderItems.status, "served"),
      ))
      .orderBy(posOrderItems.course, posOrderItems.createdAt);

    result.push({
      ...order,
      tableLabel: order.tableLabel ?? order.tableNumber ?? null,
      elapsedMinutes: order.sentToKitchenAt
        ? Math.floor((Date.now() - new Date(order.sentToKitchenAt).getTime()) / 60000)
        : 0,
      items: items.map((i) => ({
        id: i.id,
        productName: i.productName,
        productNameAr: i.productNameAr ?? null,
        quantity: parseFloat(i.quantity as string) || 0,
        status: i.status,
        notes: i.notes ?? null,
        course: i.course ?? null,
      })),
    });
  }
  return result;
}

// ─── Products blocked due to insufficient semi-finished stock ────────────────
// A product is blocked when:
//   currentStock - totalNeededToday <= 0
// meaning the semi-finished material is fully consumed by today's planned orders
// and there is nothing left to fulfill a new order.
export async function getBlockedProductIds(): Promise<number[]> {
  const today = new Date().toISOString().slice(0, 10);

  // المنطق البسيط: بص على currentQuantity في المخزن مباشرة بغض النظر عن التاريخ
  // المادة المصنّعة محجوبة فقط لو رصيدها أقل من حصة واحدة
  const semiRows = await db
    .select({
      productId:    recipeItems.productId,
      materialId:   recipeItems.materialId,
      recipeQty:    recipeItems.quantity,
      recipeUnit:   recipeItems.unit,
      wastePercent: recipeItems.wastePercent,
      materialUnit: rawMaterials.unit,
      currentStock: rawMaterials.currentQuantity,
    })
    .from(recipeItems)
    .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
    .where(sql`${rawMaterials.materialType} = 'semi_finished'`);

  if (semiRows.length === 0) return [];

  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  const blocked = new Set<number>();
  for (const row of semiRows) {
    const stock      = round4(parseFloat(String(row.currentStock ?? "0")) || 0);
    const rawPerServing = (parseFloat(String(row.recipeQty)) || 0) * (1 + (parseFloat(String(row.wastePercent)) || 0) / 100);
    const perServing = round4(convertRecipeUnit(rawPerServing, row.recipeUnit ?? "", row.materialUnit ?? ""));
    // محجوب فقط لو الرصيد أقل من حصة واحدة
    if (stock < perServing) {
      blocked.add(row.productId!);
    }
  }
  return Array.from(blocked);
}

// ─── Kitchen Production Panel — ALL semi-finished materials ──────────────────
// Shows ALL semi-finished materials with today's production, deduction, and availability.
export async function getKitchenProductionPanel(date: string) {
  // Step 1: ALL active semi-finished materials
  const allSemi = await db
    .select({
      materialId:   rawMaterials.id,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      unit:         rawMaterials.unit,
      currentStock: rawMaterials.currentQuantity,
      minQty:       rawMaterials.minimumQuantity,
    })
    .from(rawMaterials)
    .where(and(
      sql`${rawMaterials.materialType} = 'semi_finished'`,
      eq(rawMaterials.isActive, true),
    ))
    .orderBy(rawMaterials.nameAr, rawMaterials.name);

  if (allSemi.length === 0) return [];

  const matIds = allSemi.map(m => m.materialId);

  // Step 2: today's ordered items (sent to kitchen)
  const orderedItems = await db
    .select({
      productId: posOrderItems.productId,
      totalQty: sql<number>`SUM(CAST(${posOrderItems.quantity} AS DECIMAL(18,4)))`,
    })
    .from(posOrderItems)
    .innerJoin(posOrders, eq(posOrderItems.orderId, posOrders.id))
    .where(and(
      sql`DATE(${posOrders.sentToKitchenAt}) = ${date}`,
      ne(posOrderItems.status, "cancelled"),
      ne(posOrders.status, "cancelled"),
    ))
    .groupBy(posOrderItems.productId);

  const productIds = orderedItems.map(i => i.productId).filter(Boolean) as number[];

  // Step 3: recipe items for today's orders that use semi_finished
  const semiRecipes = productIds.length > 0 ? await db
    .select({
      productId:   recipeItems.productId,
      materialId:  recipeItems.materialId,
      recipeQty:   recipeItems.quantity,
      wastePercent: recipeItems.wastePercent,
    })
    .from(recipeItems)
    .where(and(
      inArray(recipeItems.productId, productIds),
      inArray(recipeItems.materialId, matIds),
    )) : [];

  // totalNeeded per material from today's orders
  const neededMap = new Map<number, number>();
  for (const rec of semiRecipes) {
    const ordered = orderedItems.find(o => o.productId === rec.productId);
    if (!ordered) continue;
    const ordQty = parseFloat(String(ordered.totalQty)) || 0;
    const recQty = parseFloat(String(rec.recipeQty)) || 0;
    const waste  = parseFloat(String(rec.wastePercent)) || 0;
    const needed = recQty * (1 + waste / 100) * ordQty;
    neededMap.set(rec.materialId, (neededMap.get(rec.materialId) ?? 0) + needed);
  }

  // Step 4a: today's IN/OUT transactions per material (from confirmProduction)
  const txRows = await db
    .select({
      materialId:      inventoryTransactions.materialId,
      transactionType: inventoryTransactions.transactionType,
      total: sql<number>`SUM(CAST(${inventoryTransactions.quantity} AS DECIMAL(18,4)))`,
    })
    .from(inventoryTransactions)
    .where(and(
      inArray(inventoryTransactions.materialId, matIds),
      eq(inventoryTransactions.reason, "production"),
      sql`${await bizDate(inventoryTransactions.transactionDate)} = ${await bizToday()}`,
    ))
    .groupBy(inventoryTransactions.materialId, inventoryTransactions.transactionType);

  const producedTodayMap = new Map<number, number>();
  const deductedMap      = new Map<number, number>();
  for (const tx of txRows) {
    const v = parseFloat(String(tx.total)) || 0;
    if (tx.transactionType === "IN")  producedTodayMap.set(tx.materialId!, v);
    if (tx.transactionType === "OUT") deductedMap.set(tx.materialId!, v);
  }

  // Step 4b: also check kitchen_daily_pulls for today
  // actualYield = الناتج الفعلي للمادة المصنّعة (مش pulledQuantity اللي هي المكونات المستخدمة)
  const pullRows = await db
    .select({
      materialId: kitchenDailyPulls.materialId,
      // COALESCE: لو actualYield موجود استخدمه، لو لا استخدم pulledQuantity
      total: sql<number>`SUM(CAST(COALESCE(${kitchenDailyPulls.actualYield}, ${kitchenDailyPulls.pulledQuantity}) AS DECIMAL(18,4)))`,
    })
    .from(kitchenDailyPulls)
    .where(and(
      inArray(kitchenDailyPulls.materialId, matIds),
      sql`${await bizDate(kitchenDailyPulls.pullDate)} = ${await bizToday()}`,
    ))
    .groupBy(kitchenDailyPulls.materialId);

  for (const pull of pullRows) {
    const v = parseFloat(String(pull.total)) || 0;
    if (v > 0 && !producedTodayMap.has(pull.materialId!)) {
      producedTodayMap.set(pull.materialId!, v);
    } else if (v > 0) {
      producedTodayMap.set(pull.materialId!, Math.max(producedTodayMap.get(pull.materialId!)!, v));
    }
  }

  // Step 5: build result from ALL semi-finished materials
  return allSemi.map(mat => ({
    materialId:      mat.materialId,
    name:            mat.materialName,
    nameAr:          mat.materialNameAr ?? mat.materialName,
    unit:            mat.unit ?? "",
    currentStock:    parseFloat(String(mat.currentStock)) || 0,
    todayProduced:   producedTodayMap.get(mat.materialId) ?? 0,
    minQty:          parseFloat(String(mat.minQty)) || 0,
    totalNeeded:     neededMap.get(mat.materialId) ?? 0,
    alreadyDeducted: deductedMap.get(mat.materialId) ?? 0,
  })).sort((a, b) => b.todayProduced - a.todayProduced);
}

// ─── Kitchen Today's Production Summary ──────────────────────────────────────
// Returns all products ordered today + their recipe ingredients (qty × ordered qty)
export async function getKitchenTodayProduction(date: string) {
  // Step 1: sum ordered quantities per product for today
  const orderedItems = await db
    .select({
      productId: posOrderItems.productId,
      productName: posOrderItems.productName,
      productNameAr: posOrderItems.productNameAr,
      totalQty: sql<number>`SUM(CAST(${posOrderItems.quantity} AS DECIMAL(18,4)))`,
    })
    .from(posOrderItems)
    .innerJoin(posOrders, eq(posOrderItems.orderId, posOrders.id))
    .where(
      and(
        sql`DATE(${posOrders.sentToKitchenAt}) = ${date}`,
        ne(posOrderItems.status, "cancelled"),
        ne(posOrders.status, "cancelled"),
      )
    )
    .groupBy(posOrderItems.productId, posOrderItems.productName, posOrderItems.productNameAr);

  if (orderedItems.length === 0) return [];

  // Step 2: for each product get its recipe ingredients
  const productIds = orderedItems.map(i => i.productId).filter(Boolean) as number[];

  const recipes = await db
    .select({
      productId: recipeItems.productId,
      materialId: recipeItems.materialId,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      unit: recipeItems.unit,
      materialUnit: rawMaterials.unit,
      recipeQty: recipeItems.quantity,
      wastePercent: recipeItems.wastePercent,
      currentStock: rawMaterials.currentQuantity,
    })
    .from(recipeItems)
    .innerJoin(rawMaterials, eq(recipeItems.materialId, rawMaterials.id))
    .where(inArray(recipeItems.productId, productIds));

  // Step 3: assemble result
  return orderedItems.map(item => {
    const qty = parseFloat(String(item.totalQty)) || 0;
    const itemRecipes = recipes
      .filter(r => r.productId === item.productId)
      .map(r => {
        const rQty = parseFloat(String(r.recipeQty)) || 0;
        const waste = parseFloat(String(r.wastePercent)) || 0;
        const needed = rQty * (1 + waste / 100) * qty;
        const stock = parseFloat(String(r.currentStock)) || 0;
        return {
          materialId: r.materialId,
          name: r.materialName,
          nameAr: r.materialNameAr ?? r.materialName,
          unit: r.unit || r.materialUnit || "",
          neededQty: needed,
          currentStock: stock,
          isLow: stock < needed,
        };
      });

    return {
      productId: item.productId,
      productName: item.productName,
      productNameAr: item.productNameAr ?? item.productName,
      totalQty: qty,
      ingredients: itemRecipes,
      hasRecipe: itemRecipes.length > 0,
    };
  });
}

// ─── Kitchen Today's Consumption (live panel) ────────────────────────────────
export async function getKitchenTodayConsumption(date: string) {
  const rows = await db
    .select({
      materialId: inventoryTransactions.materialId,
      materialName: rawMaterials.name,
      materialNameAr: rawMaterials.nameAr,
      unit: rawMaterials.unit,
      currentQty: rawMaterials.currentQuantity,
      totalOut: sql<number>`SUM(CAST(${inventoryTransactions.quantity} AS DECIMAL(18,4)))`,
      orderCount: sql<number>`COUNT(*)`,
    })
    .from(inventoryTransactions)
    .innerJoin(rawMaterials, eq(inventoryTransactions.materialId, rawMaterials.id))
    .where(
      and(
        eq(inventoryTransactions.transactionType, "OUT"),
        eq(inventoryTransactions.reason, "production"),
        sql`${await bizDate(inventoryTransactions.transactionDate)} = ${await bizToday()}`,
      )
    )
    .groupBy(inventoryTransactions.materialId, rawMaterials.name, rawMaterials.nameAr, rawMaterials.unit, rawMaterials.currentQuantity)
    .orderBy(sql`SUM(CAST(${inventoryTransactions.quantity} AS DECIMAL(18,4))) DESC`);

  return rows.map(r => ({
    materialId: r.materialId,
    name: r.materialName,
    nameAr: r.materialNameAr ?? r.materialName,
    unit: r.unit ?? "",
    currentQty: parseFloat(String(r.currentQty ?? "0")),
    totalOut: parseFloat(String(r.totalOut ?? "0")),
    orderCount: Number(r.orderCount ?? 0),
  }));
}

// ─── POS Reports ─────────────────────────────────────────────────────────────

export async function getPosReport(date: string) {
  const orders = await db
    .select({
      id: posOrders.id,
      orderNumber: posOrders.orderNumber,
      orderType: posOrders.orderType,
      status: posOrders.status,
      subtotal: posOrders.subtotal,
      discountAmount: posOrders.discountAmount,
      total: posOrders.total,
      paidAt: posOrders.paidAt,
    })
    .from(posOrders)
    .where(and(
      sql`DATE(${posOrders.createdAt}) = ${date}`,
      ne(posOrders.status, "cancelled")
    ));

  const paid = orders.filter((o) => o.status === "paid");
  const totalRevenue = paid.reduce((s, o) => s + (parseFloat(o.total as string) || 0), 0);
  const totalDiscount = paid.reduce((s, o) => s + (parseFloat(o.discountAmount as string) || 0), 0);
  const avgOrderValue = paid.length > 0 ? totalRevenue / paid.length : 0;

  const byType = paid.reduce((acc, o) => {
    const t = o.orderType || "dine_in";
    acc[t] = (acc[t] || 0) + (parseFloat(o.total as string) || 0);
    return acc;
  }, {} as Record<string, number>);

  // payments breakdown
  const paymentRows = await db
    .select({
      method: posPayments.paymentMethod,
      amount: sql<number>`SUM(${posPayments.amount})`,
    })
    .from(posPayments)
    .innerJoin(posOrders, eq(posPayments.orderId, posOrders.id))
    .where(sql`DATE(${posOrders.createdAt}) = ${date}`)
    .groupBy(posPayments.paymentMethod);

  return {
    date,
    totalOrders: orders.length,
    paidOrders: paid.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    byType,
    paymentMethods: paymentRows.reduce((acc, p) => {
      acc[p.method] = parseFloat(String(p.amount)) || 0;
      return acc;
    }, {} as Record<string, number>),
  };
}

// ─── POS Customers ────────────────────────────────────────────────────────────

export async function searchCustomerByPhone(phone: string) {
  // Search by exact phone or starts-with
  const rows = await db.select().from(posCustomers)
    .where(or(eq(posCustomers.phone, phone), like(posCustomers.phone, `${phone}%`)))
    .orderBy(desc(posCustomers.orderCount))
    .limit(5);
  return rows;
}

export async function listCustomers(search?: string) {
  const conditions = search ? or(
    like(posCustomers.name, `%${search}%`),
    like(posCustomers.phone, `%${search}%`),
    like(posCustomers.area, `%${search}%`),
  ) : undefined;
  return db.select().from(posCustomers)
    .where(conditions)
    .orderBy(desc(posCustomers.lastOrderAt))
    .limit(100);
}

export async function upsertCustomer(data: {
  name: string; phone: string;
  area?: string; building?: string; floor?: string; apartment?: string; notes?: string;
}) {
  // Try find existing
  const [existing] = await db.select({ id: posCustomers.id }).from(posCustomers)
    .where(eq(posCustomers.phone, data.phone)).limit(1);
  if (existing) {
    await db.update(posCustomers).set({
      name: data.name,
      area: data.area ?? undefined,
      building: data.building ?? undefined,
      floor: data.floor ?? undefined,
      apartment: data.apartment ?? undefined,
      notes: data.notes ?? undefined,
    }).where(eq(posCustomers.id, existing.id));
    return existing.id;
  }
  const [res] = await db.insert(posCustomers).values(data);
  return (res as any).insertId as number;
}

export async function updateCustomerOrderStats(customerId: number) {
  await db.update(posCustomers).set({
    orderCount: sql`orderCount + 1`,
    lastOrderAt: new Date(),
  }).where(eq(posCustomers.id, customerId));
}

export async function deleteCustomer(id: number) {
  await db.delete(posCustomers).where(eq(posCustomers.id, id));
}

export async function updateOrderDeliveryInfo(orderId: number, info: {
  customerName?: string; customerPhone?: string;
  customerArea?: string; customerBuilding?: string;
  customerFloor?: string; customerApartment?: string;
  deliveryNotes?: string; customerId?: number;
}) {
  await db.update(posOrders).set(info as any).where(eq(posOrders.id, orderId));
}
