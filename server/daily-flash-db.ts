/**
 * Daily Flash Report — unified end-of-day summary
 * All KPIs for a single day in one place.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

import { getConn } from "./pool";
export interface DailyFlashReport {
  date: string;
  sales: {
    totalRevenue: number;
    topSellers: Array<{ name: string; nameAr: string | null; qty: number; revenue: number }>;
    salesByPlatform: Record<string, number>;
    uploadCount: number;
  };
  foodCost: {
    theoreticalCost: number;   // sales × recipe cost
    actualPurchases: number;   // what we bought today
    wasteCost: number;
    totalCostBasis: number;    // purchases + opening adjustment
    foodCostPct: number | null;
  };
  kitchen: {
    productionCount: number;
    pullsOpen: number;
    pullsClosed: number;
    topProduced: Array<{ name: string; qty: number }>;
  };
  waste: {
    totalCost: number;
    totalQty: number;
    entryCount: number;
    topWasted: Array<{ name: string; cost: number }>;
  };
  inventory: {
    stockInCount: number;
    stockInValue: number;
    stockOutCount: number;
    lowStockCount: number;
    criticalStockCount: number;
  };
  invoices: {
    totalInvoiceAmount: number;
    paidAmount: number;
    pendingAmount: number;
    invoiceCount: number;
  };
  alerts: string[];
}

export async function getDailyFlash(date: string): Promise<DailyFlashReport> {
  const conn = await getConn();
  try {
    // ── Sales ──────────────────────────────────────────────────────────────────
    const [salesRows] = await conn.query<any[]>(`
      SELECT
        COALESCE(SUM(si.totalPrice), 0) AS totalRevenue,
        COUNT(DISTINCT sr.id) AS uploadCount
      FROM daily_sales_uploads sr
      LEFT JOIN sale_items si ON si.uploadId = sr.id
      WHERE DATE(sr.uploadDate) = ?
    `, [date]);
    const salesSummary = (salesRows as any[])[0] || {};

    const [topSellers] = await conn.query<any[]>(`
      SELECT p.name, p.nameAr, SUM(si.quantity) AS qty, SUM(si.totalPrice) AS revenue
      FROM sale_items si
      JOIN products p ON p.id = si.productId
      JOIN daily_sales_uploads sr ON sr.id = si.uploadId
      WHERE DATE(sr.uploadDate) = ?
      GROUP BY p.id
      ORDER BY revenue DESC
      LIMIT 5
    `, [date]);

    // ── Kitchen ────────────────────────────────────────────────────────────────
    const [kitchenRows] = await conn.query<any[]>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN status!='closed' THEN 1 ELSE 0 END) AS open
      FROM kitchen_daily_pulls
      WHERE DATE(productionDate) = ?
    `, [date]).catch(() => [[{ total: 0, closed: 0, open: 0 }]]);
    const k = (kitchenRows as any[])[0] || {};

    const [topProduced] = await conn.query<any[]>(`
      SELECT p.nameAr AS name, SUM(kp.quantity) AS qty
      FROM kitchen_daily_pulls kp
      JOIN products p ON p.id = kp.productId
      WHERE DATE(kp.productionDate) = ? AND kp.status = 'closed'
      GROUP BY kp.productId
      ORDER BY qty DESC
      LIMIT 3
    `, [date]).catch(() => [[]]);

    // ── Waste ──────────────────────────────────────────────────────────────────
    const [wasteRows] = await conn.query<any[]>(`
      SELECT
        COALESCE(SUM(totalCost), 0) AS totalCost,
        COALESCE(SUM(quantity), 0) AS totalQty,
        COUNT(*) AS entryCount
      FROM waste_log
      WHERE DATE(wasteDate) = ?
    `, [date]);
    const w = (wasteRows as any[])[0] || {};

    const [topWasted] = await conn.query<any[]>(`
      SELECT m.nameAr AS name, SUM(wl.totalCost) AS cost
      FROM waste_log wl
      JOIN raw_materials m ON m.id = wl.materialId
      WHERE DATE(wl.wasteDate) = ?
      GROUP BY wl.materialId
      ORDER BY cost DESC
      LIMIT 3
    `, [date]).catch(() => [[]]);

    // ── Stock movements ────────────────────────────────────────────────────────
    const [stockRows] = await conn.query<any[]>(`
      SELECT
        SUM(CASE WHEN transactionType='IN' THEN 1 ELSE 0 END) AS inCount,
        SUM(CASE WHEN transactionType='IN' THEN quantity * COALESCE(unitPrice,0) ELSE 0 END) AS inValue,
        SUM(CASE WHEN transactionType='OUT' THEN 1 ELSE 0 END) AS outCount
      FROM inventory_transactions
      WHERE DATE(transactionDate) = ?
    `, [date]);
    const st = (stockRows as any[])[0] || {};

    const [lowStockCounts] = await conn.query<any[]>(`
      SELECT
        SUM(CASE WHEN currentQuantity <= 0 THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN currentQuantity > 0 AND currentQuantity <= minimumQuantity THEN 1 ELSE 0 END) AS low
      FROM raw_materials WHERE isActive = 1
    `);
    const ls = (lowStockCounts as any[])[0] || {};

    // ── Invoices ────────────────────────────────────────────────────────────────
    const [invRows] = await conn.query<any[]>(`
      SELECT
        COUNT(*) AS invoiceCount,
        COALESCE(SUM(totalAmount), 0) AS totalAmount,
        COALESCE(SUM(CASE WHEN paymentStatus IN ('paid','partial') THEN COALESCE(paidAmount, totalAmount) ELSE 0 END), 0) AS paidAmount
      FROM invoices
      WHERE DATE(invoiceDate) = ?
    `, [date]);
    const inv = (invRows as any[])[0] || {};
    const invTotal = parseFloat(inv.totalAmount) || 0;
    const invPaid = parseFloat(inv.paidAmount) || 0;

    // ── Food cost ──────────────────────────────────────────────────────────────
    const totalRevenue = parseFloat(salesSummary.totalRevenue) || 0;
    const wasteCost = parseFloat(w.totalCost) || 0;
    const purchasesValue = parseFloat(st.inValue) || 0;
    const foodCostPct = totalRevenue > 0
      ? Math.round(((purchasesValue + wasteCost) / totalRevenue) * 1000) / 10
      : null;

    // Theoretical cost: sum of (qty sold × recipe cost per unit)
    const [theoreticalRows] = await conn.query<any[]>(`
      SELECT COALESCE(SUM(si.quantity * COALESCE(rc.costPerUnit, 0)), 0) AS theoreticalCost
      FROM sale_items si
      JOIN daily_sales_uploads sr ON sr.id = si.uploadId
      LEFT JOIN (
        SELECT productId, SUM(quantity * COALESCE(rm.lastPurchasePrice, 0)) AS costPerUnit
        FROM recipe_items ri
        JOIN raw_materials rm ON rm.id = ri.materialId
        GROUP BY productId
      ) rc ON rc.productId = si.productId
      WHERE DATE(sr.uploadDate) = ?
    `, [date]).catch(() => [[{ theoreticalCost: 0 }]]);
    const theoreticalCost = parseFloat((theoreticalRows as any[])[0]?.theoreticalCost) || 0;

    // ── Alerts ─────────────────────────────────────────────────────────────────
    const alerts: string[] = [];
    if (parseInt(ls.critical) > 0) alerts.push(`🔴 ${ls.critical} مادة نفد مخزونها`);
    if (parseInt(ls.low) > 0) alerts.push(`🟡 ${ls.low} مادة تحت الحد الأدنى`);
    if (foodCostPct && foodCostPct > 35) alerts.push(`⚠️ نسبة تكلفة الطعام ${foodCostPct}% — تتجاوز الحد المقبول (35%)`);
    if (wasteCost > totalRevenue * 0.05 && totalRevenue > 0) alerts.push(`🗑️ الهدر يمثّل ${Math.round((wasteCost / totalRevenue) * 1000) / 10}% من الإيراد`);
    if (invTotal - invPaid > 1000) alerts.push(`💳 فواتير مستحقة بقيمة ${(invTotal - invPaid).toFixed(0)} درهم`);

    return {
      date,
      sales: {
        totalRevenue,
        topSellers: (topSellers as any[]).map((r: any) => ({
          name: r.name,
          nameAr: r.nameAr,
          qty: parseFloat(r.qty),
          revenue: parseFloat(r.revenue),
        })),
        salesByPlatform: {},
        uploadCount: parseInt(salesSummary.uploadCount) || 0,
      },
      foodCost: {
        theoreticalCost: Math.round(theoreticalCost * 100) / 100,
        actualPurchases: purchasesValue,
        wasteCost,
        totalCostBasis: purchasesValue + wasteCost,
        foodCostPct,
      },
      kitchen: {
        productionCount: parseInt(k.total) || 0,
        pullsOpen: parseInt(k.open) || 0,
        pullsClosed: parseInt(k.closed) || 0,
        topProduced: (topProduced as any[]).map((r: any) => ({ name: r.name, qty: parseFloat(r.qty) })),
      },
      waste: {
        totalCost: wasteCost,
        totalQty: parseFloat(w.totalQty) || 0,
        entryCount: parseInt(w.entryCount) || 0,
        topWasted: (topWasted as any[]).map((r: any) => ({ name: r.name, cost: parseFloat(r.cost) })),
      },
      inventory: {
        stockInCount: parseInt(st.inCount) || 0,
        stockInValue: purchasesValue,
        stockOutCount: parseInt(st.outCount) || 0,
        lowStockCount: parseInt(ls.low) || 0,
        criticalStockCount: parseInt(ls.critical) || 0,
      },
      invoices: {
        totalInvoiceAmount: invTotal,
        paidAmount: invPaid,
        pendingAmount: invTotal - invPaid,
        invoiceCount: parseInt(inv.invoiceCount) || 0,
      },
      alerts,
    };
  } finally {
    await conn.end();
  }
}
