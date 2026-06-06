/**
 * purchase-orders-db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Purchase Orders management: CRUD, auto-generation for low stock, WhatsApp send
 */

import mysql from "mysql2/promise";
import { sendWhatsAppText } from "./whatsapp";

async function getConn() {
  return mysql.createConnection(process.env.DATABASE_URL as string);
}

/** Generate next PO number: PO-YYYY-NNNN */
async function generateOrderNumber(conn: mysql.Connection): Promise<string> {
  const year = new Date().getFullYear();
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE orderNumber LIKE ?`,
    [`PO-${year}-%`]
  ) as [any[], any];
  const nextNum = (Number(rows[0].cnt) + 1).toString().padStart(4, "0");
  return `PO-${year}-${nextNum}`;
}

export interface POWithItems {
  id: number;
  orderNumber: string;
  supplierId: number | null;
  supplierName: string | null;
  supplierWaPhone: string | null;
  status: "draft" | "sent" | "confirmed" | "received" | "cancelled";
  totalAmount: number | null;
  notes: string | null;
  sentAt: string | null;
  confirmedAt: string | null;
  receivedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  items: Array<{
    id: number;
    materialId: number;
    materialName: string;
    unit: string | null;
    requestedQty: number;
    unitPrice: number | null;
    totalPrice: number | null;
    notes: string | null;
  }>;
}

export async function listPurchaseOrders(filters?: {
  status?: string;
  supplierId?: number;
  limit?: number;
}): Promise<POWithItems[]> {
  const conn = await getConn();
  try {
    let query = `
      SELECT po.*, s.whatsappPhone AS supplierWaPhone
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplierId
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status && filters.status !== "all") {
      query += " AND po.status = ?";
      params.push(filters.status);
    }
    if (filters?.supplierId) {
      query += " AND po.supplierId = ?";
      params.push(filters.supplierId);
    }
    query += ` ORDER BY po.createdAt DESC LIMIT ${filters?.limit ?? 100}`;

    const [orders] = await conn.execute(query, params) as [any[], any];
    if (!orders.length) return [];

    const orderIds = orders.map((o: any) => o.id);
    const ph = orderIds.map(() => "?").join(",");
    const [items] = await conn.execute(
      `SELECT * FROM purchase_order_items WHERE orderId IN (${ph}) ORDER BY id ASC`,
      orderIds
    ) as [any[], any];

    const itemsMap = new Map<number, any[]>();
    for (const item of items) {
      if (!itemsMap.has(item.orderId)) itemsMap.set(item.orderId, []);
      itemsMap.get(item.orderId)!.push(item);
    }

    return orders.map((o: any) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      supplierId: o.supplierId,
      supplierName: o.supplierName,
      supplierWaPhone: o.supplierWaPhone,
      status: o.status,
      totalAmount: o.totalAmount ? parseFloat(o.totalAmount) : null,
      notes: o.notes,
      sentAt: o.sentAt ? String(o.sentAt) : null,
      confirmedAt: o.confirmedAt ? String(o.confirmedAt) : null,
      receivedAt: o.receivedAt ? String(o.receivedAt) : null,
      createdBy: o.createdBy,
      createdAt: String(o.createdAt),
      items: (itemsMap.get(o.id) || []).map((i: any) => ({
        id: i.id,
        materialId: i.materialId,
        materialName: i.materialName,
        unit: i.unit,
        requestedQty: parseFloat(i.requestedQty || "0"),
        unitPrice: i.unitPrice ? parseFloat(i.unitPrice) : null,
        totalPrice: i.totalPrice ? parseFloat(i.totalPrice) : null,
        notes: i.notes,
      })),
    }));
  } finally {
    await conn.end();
  }
}

export async function getPurchaseOrderById(id: number): Promise<POWithItems | null> {
  const orders = await listPurchaseOrders({ limit: 1 });
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT po.*, s.whatsappPhone AS supplierWaPhone FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplierId WHERE po.id = ?`,
      [id]
    ) as [any[], any];
    if (!rows.length) return null;
    const o = rows[0];

    const [items] = await conn.execute(
      `SELECT * FROM purchase_order_items WHERE orderId = ? ORDER BY id ASC`,
      [id]
    ) as [any[], any];

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      supplierId: o.supplierId,
      supplierName: o.supplierName,
      supplierWaPhone: o.supplierWaPhone,
      status: o.status,
      totalAmount: o.totalAmount ? parseFloat(o.totalAmount) : null,
      notes: o.notes,
      sentAt: o.sentAt ? String(o.sentAt) : null,
      confirmedAt: o.confirmedAt ? String(o.confirmedAt) : null,
      receivedAt: o.receivedAt ? String(o.receivedAt) : null,
      createdBy: o.createdBy,
      createdAt: String(o.createdAt),
      items: (items as any[]).map((i: any) => ({
        id: i.id, materialId: i.materialId, materialName: i.materialName,
        unit: i.unit, requestedQty: parseFloat(i.requestedQty || "0"),
        unitPrice: i.unitPrice ? parseFloat(i.unitPrice) : null,
        totalPrice: i.totalPrice ? parseFloat(i.totalPrice) : null,
        notes: i.notes,
      })),
    };
  } finally {
    await conn.end();
  }
}

export async function createPurchaseOrder(data: {
  supplierId?: number;
  supplierName?: string;
  notes?: string;
  createdBy: number;
  items: Array<{
    materialId: number;
    materialName: string;
    unit?: string;
    requestedQty: number;
    unitPrice?: number;
  }>;
}): Promise<{ id: number; orderNumber: string }> {
  const conn = await getConn();
  try {
    const orderNumber = await generateOrderNumber(conn);

    // Calculate total
    const totalAmount = data.items.reduce((sum, i) => {
      return sum + (i.requestedQty * (i.unitPrice ?? 0));
    }, 0);

    // Get supplier name if not provided
    let supplierName = data.supplierName;
    if (!supplierName && data.supplierId) {
      const [sRows] = await conn.execute(
        `SELECT name FROM suppliers WHERE id = ?`, [data.supplierId]
      ) as [any[], any];
      supplierName = sRows[0]?.name || "";
    }

    const [res] = await conn.execute(
      `INSERT INTO purchase_orders (orderNumber, supplierId, supplierName, status, totalAmount, notes, createdBy)
       VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
      [orderNumber, data.supplierId ?? null, supplierName ?? null,
       totalAmount > 0 ? totalAmount.toFixed(3) : null,
       data.notes ?? null, data.createdBy]
    ) as [any, any];
    const orderId = res.insertId;

    for (const item of data.items) {
      const totalPrice = item.requestedQty * (item.unitPrice ?? 0);
      await conn.execute(
        `INSERT INTO purchase_order_items (orderId, materialId, materialName, unit, requestedQty, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.materialId, item.materialName, item.unit ?? null,
         item.requestedQty.toFixed(3),
         item.unitPrice != null ? item.unitPrice.toFixed(3) : null,
         totalPrice > 0 ? totalPrice.toFixed(3) : null]
      );
    }

    return { id: orderId, orderNumber };
  } finally {
    await conn.end();
  }
}

export async function updatePurchaseOrderStatus(
  id: number,
  status: "draft" | "sent" | "confirmed" | "received" | "cancelled"
): Promise<void> {
  const conn = await getConn();
  try {
    const tsField: Record<string, string> = {
      sent: "sentAt", confirmed: "confirmedAt", received: "receivedAt",
    };
    const ts = tsField[status];
    const extra = ts ? `, ${ts} = NOW()` : "";
    await conn.execute(
      `UPDATE purchase_orders SET status = ?${extra} WHERE id = ?`,
      [status, id]
    );
  } finally {
    await conn.end();
  }
}

export async function deletePurchaseOrder(id: number): Promise<void> {
  const conn = await getConn();
  try {
    await conn.execute(`DELETE FROM purchase_orders WHERE id = ?`, [id]);
  } finally {
    await conn.end();
  }
}

/**
 * Send Purchase Order to supplier via WhatsApp.
 * Fetches the WA number from the order's supplier record.
 */
export async function sendPurchaseOrderToSupplier(
  orderId: number,
  waNumberId: number // Evolution API instance ID
): Promise<{ sent: boolean; phone: string | null; message: string }> {
  const po = await getPurchaseOrderById(orderId);
  if (!po) throw new Error("طلب الشراء غير موجود");

  const phone = po.supplierWaPhone;
  if (!phone) throw new Error("المورد ليس لديه رقم واتساب مسجّل");

  // Build WhatsApp message
  const dateStr = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  const itemLines = po.items
    .map((i) => `• ${i.materialName}: ${i.requestedQty} ${i.unit || ""}${i.unitPrice ? ` × ${i.unitPrice.toFixed(2)} AED` : ""}`)
    .join("\n");

  const message =
    `📦 *طلب شراء جديد — ${po.orderNumber}*\n` +
    `📅 التاريخ: ${dateStr}\n\n` +
    `الأصناف المطلوبة:\n${itemLines}\n\n` +
    (po.totalAmount ? `💰 *الإجمالي المتوقع: ${po.totalAmount.toFixed(2)} AED*\n\n` : "") +
    (po.notes ? `📝 ملاحظات: ${po.notes}\n\n` : "") +
    `يرجى التأكيد على هذا الطلب في أقرب وقت. شكراً 🙏`;

  try {
    const conn = await getConn();
    let evoConfig: { apiUrl: string; apiKey: string; instance: string } | null = null;
    try {
      const [rows] = await conn.execute(
        `SELECT evolutionApiUrl, evolutionApiKey, evolutionInstance FROM evolution_settings WHERE id = ? LIMIT 1`,
        [waNumberId]
      ) as [any[], any];
      if (rows[0]) {
        evoConfig = {
          apiUrl: rows[0].evolutionApiUrl,
          apiKey: rows[0].evolutionApiKey,
          instance: rows[0].evolutionInstance,
        };
      }
    } finally {
      await conn.end();
    }
    if (!evoConfig) throw new Error("Evolution settings not found");
    const result = await sendWhatsAppText(evoConfig, phone, message);
    if (!result.success) throw new Error(result.error || "Send failed");
    await updatePurchaseOrderStatus(orderId, "sent");
    return { sent: true, phone, message };
  } catch (err) {
    console.error("[PO] Failed to send WA message:", err);
    throw new Error("فشل إرسال الرسالة عبر واتساب: " + (err instanceof Error ? err.message : String(err)));
  }
}

/**
 * Auto-generate draft Purchase Orders for all low-stock materials,
 * grouped by their last supplier.
 */
export async function autoGeneratePOsForLowStock(createdBy: number): Promise<{
  ordersCreated: number;
  itemsCount: number;
  orders: Array<{ orderNumber: string; supplierName: string; itemCount: number }>;
}> {
  const conn = await getConn();
  try {
    // Materials below minimum with their last supplier
    const [materials] = await conn.execute(
      `SELECT rm.id, rm.name, rm.unit, rm.minimumQuantity, rm.reorderQuantity, rm.currentQuantity,
              rm.lastPurchasePrice,
              s.id AS supplierId, s.name AS supplierName
       FROM raw_materials rm
       LEFT JOIN (
         SELECT DISTINCT it.materialId, it.supplierId,
                FIRST_VALUE(it.supplierId) OVER (PARTITION BY it.materialId ORDER BY it.transactionDate DESC) AS latestSupplierId
         FROM inventory_transactions it WHERE it.transactionType = 'IN' AND it.supplierId IS NOT NULL
       ) last_sup ON last_sup.materialId = rm.id
       LEFT JOIN suppliers s ON s.id = last_sup.latestSupplierId
       WHERE rm.isActive = 1
         AND CAST(rm.currentQuantity AS DECIMAL(12,3)) <= CAST(rm.minimumQuantity AS DECIMAL(12,3))
         AND rm.minimumQuantity > 0`,
    ) as [any[], any];

    if (!materials.length) return { ordersCreated: 0, itemsCount: 0, orders: [] };

    // Group by supplier
    const supplierGroups = new Map<string, any[]>();
    for (const m of materials as any[]) {
      const key = m.supplierId ? String(m.supplierId) : "unknown";
      if (!supplierGroups.has(key)) supplierGroups.set(key, []);
      supplierGroups.get(key)!.push(m);
    }

    const createdOrders: Array<{ orderNumber: string; supplierName: string; itemCount: number }> = [];
    let totalItems = 0;

    for (const [, items] of supplierGroups.entries()) {
      const first = items[0];
      const supplierId = first.supplierId || undefined;
      const supplierName = first.supplierName || "مورد غير معروف";

      const poItems = items.map((m: any) => ({
        materialId: m.id,
        materialName: m.name,
        unit: m.unit,
        requestedQty: parseFloat(m.reorderQuantity || m.minimumQuantity || "1"),
        unitPrice: m.lastPurchasePrice ? parseFloat(m.lastPurchasePrice) : undefined,
      }));

      const { orderNumber } = await createPurchaseOrder({
        supplierId,
        supplierName,
        notes: "طلب تلقائي بناءً على المخزون المنخفض",
        createdBy,
        items: poItems,
      });

      createdOrders.push({ orderNumber, supplierName, itemCount: poItems.length });
      totalItems += poItems.length;
    }

    return {
      ordersCreated: createdOrders.length,
      itemsCount: totalItems,
      orders: createdOrders,
    };
  } finally {
    await conn.end();
  }
}
