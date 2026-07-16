/**
 * Report Generators — v2
 * Generates WhatsApp message content using REAL data from all database tables
 */

import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { getBusinessDayTzOffset, calcKitchenPullRawCost, getFinancialKpi } from "./db";

type ReportType = "daily_sales" | "orders_summary" | "kitchen_cost" | "inventory_value" | "waste_summary" | "system_alerts" | "warehouse_performance" | "daily_account_summary" | "daily_financial_summary";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | string, dec = 2): string {
  return Number(n || 0).toFixed(dec);
}

function fmtAED(n: number | string): string {
  return `${fmt(n)} د.إ`;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get the current business day date string (YYYY-MM-DD).
 * Business day starts at 06:00 local time (Dubai UTC+4).
 * Before 06:00 local time, returns yesterday's date.
 */
async function businessTodayStr(): Promise<string> {
  try {
    const tzOffset = await getBusinessDayTzOffset();
    // Parse offset like '+04:00' or '-02:00'
    const sign = tzOffset[0] === '-' ? -1 : 1;
    const parts = tzOffset.slice(1).split(':');
    const offsetHours = sign * (parseInt(parts[0]) + parseInt(parts[1] || '0') / 60);
    const nowUtc = Date.now();
    const localMs = nowUtc + offsetHours * 3600000;
    const d = new Date(localMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function arabicDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("ar-AE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// // ─── Template Applier ────────────────────────────────────────────────────

/**
 * Replace {{variable}} tokens in template body with real values from DB stats.
 * If bodyText has no tokens, it is used as-is (static custom text).
 */
async function resolveVariables(
  bodyText: string,
  reportType: ReportType,
  date: string
): Promise<string> {
  // Check if there are any {{...}} tokens to replace
  if (!/\{\{[^}]+\}\}/.test(bodyText)) return bodyText;

  const conn = await getConn();
  const vars: Record<string, string> = {};
  // استخدام توقيت دبي الكامندري (+04:00) لمطابقة منطق الجدول في لوحة التحكم
  const tzOffset = '+04:00';

  try {
    if (reportType === "daily_sales") {
      // مبيعات من daily_accounts (المصدر الرئيسي للمبيعات المُدخلة يدوياً)
      // accountDate هو نص YYYY-MM-DD مباشرة، لا يحتاج CONVERT_TZ
      const [sr] = await conn.query<any[]>(
        `SELECT
          COALESCE(salesCash,0)+COALESCE(salesCard,0)+COALESCE(salesKita,0)+
          COALESCE(salesOrders,0)+COALESCE(salesNoon,0)+COALESCE(salesDeliveroo,0)+COALESCE(salesCareem,0) as netSales,
          COALESCE(salesCash,0)+COALESCE(salesCard,0)+COALESCE(salesKita,0)+
          COALESCE(salesOrders,0)+COALESCE(salesNoon,0)+COALESCE(salesDeliveroo,0)+COALESCE(salesCareem,0) as totalSales,
          1 as cnt
         FROM daily_accounts WHERE accountDate=?`, [date]);
      const [fi] = await conn.query<any[]>(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(totalAmount),0) as total,
         COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN totalAmount ELSE 0 END),0) as paid,
         COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN totalAmount ELSE 0 END),0) as pending
         FROM free_invoices WHERE DATE(CONVERT_TZ(date,'+00:00',?))=?`, [tzOffset, date]);
      const [bs] = await conn.query<any[]>(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(totalAmount),0) as total FROM butcher_sales WHERE DATE(CONVERT_TZ(saleDate,'+00:00',?))=?`, [tzOffset, date]);
      // تكلفة المطبخ: counted+closed مع استخدام updatedAt للتاريخ (نفس منطق getMonthlyDailyPerformance)
      // tzOffset للتاريخ التشغيلي: DATE_SUB(CONVERT_TZ(updatedAt,'+00:00','+04:00'), INTERVAL 6 HOUR)
      const [kitchenRows2] = await conn.query<any[]>(
        `SELECT kdp.materialId, kdp.materialType,
          COALESCE(kdp.closingCount, 0) as closingCount
         FROM kitchen_daily_pulls kdp
         WHERE kdp.status IN ('counted', 'closed')
           AND DATE(DATE_SUB(CONVERT_TZ(kdp.updatedAt,'+00:00','+04:00'), INTERVAL 6 HOUR))=?`, [date]);
      let kitchenDailyCost = 0;
      for (const row of kitchenRows2 as any[]) {
        const closing = parseFloat(row.closingCount) || 0;
        if (closing > 0) {
          const cost = await calcKitchenPullRawCost(Number(row.materialId), row.materialType, closing);
          kitchenDailyCost += cost;
        }
      }
      // إذا لم يوجد سجل في daily_accounts لهذا اليوم، نستخدم قيم صفرية
      const s = sr[0] ?? { netSales: 0, totalSales: 0, cnt: 0 };
      const f = fi[0] ?? { cnt: 0, total: 0, paid: 0, pending: 0 };
      const b = bs[0] ?? { cnt: 0, total: 0 };
      const netSales = Number(s.netSales);
      const profit = netSales - kitchenDailyCost;
      const dailyCostPct = netSales > 0 ? (kitchenDailyCost / netSales) * 100 : 0;
      vars['pos_reports_count'] = String(s.cnt);
      vars['pos_total_sales'] = `${fmt(s.totalSales)} د.إ`;
      vars['pos_net_sales'] = `${fmt(netSales)} د.إ`;
      vars['pos_profit'] = `${fmt(profit)} د.إ`;
      vars['pos_qty'] = '0';
      vars['kitchen_daily_cost'] = `${fmt(kitchenDailyCost)} د.إ`;
      vars['daily_cost_pct'] = `${fmt(dailyCostPct, 1)}%`;
      vars['invoices_count'] = String(f.cnt);
      vars['invoices_total'] = `${fmt(f.total)} د.إ`;
      vars['invoices_paid'] = `${fmt(f.paid)} د.إ`;
      vars['invoices_pending'] = `${fmt(f.pending)} د.إ`;
      vars['butcher_count'] = String(b.cnt);
      vars['butcher_total'] = `${fmt(b.total)} د.إ`;
    } else if (reportType === "orders_summary") {
      const [fi] = await conn.query<any[]>(
        `SELECT COUNT(*) as total, COALESCE(SUM(totalAmount),0) as amt,
         COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN 1 ELSE 0 END),0) as paid,
         COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN 1 ELSE 0 END),0) as pending,
         COALESCE(SUM(CASE WHEN paymentStatus='partial' THEN 1 ELSE 0 END),0) as partial,
         COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN totalAmount ELSE 0 END),0) as paidAmt,
         COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN totalAmount ELSE 0 END),0) as pendingAmt
         FROM free_invoices WHERE DATE(CONVERT_TZ(date,'+00:00',?))=?`, [tzOffset, date]);
      const [inv] = await conn.query<any[]>(
        `SELECT COUNT(*) as total, COALESCE(SUM(totalAmount),0) as amt FROM invoices WHERE DATE(CONVERT_TZ(invoiceDate,'+00:00',?))=?`, [tzOffset, date]);
      const f = fi[0], i = inv[0];
      vars['fi_total'] = String(f.total);
      vars['fi_amount'] = `${fmt(f.amt)} د.إ`;
      vars['fi_paid'] = String(f.paid);
      vars['fi_pending'] = String(f.pending);
      vars['fi_partial'] = String(f.partial);
      vars['fi_paid_amount'] = `${fmt(f.paidAmt)} د.إ`;
      vars['fi_pending_amount'] = `${fmt(f.pendingAmt)} د.إ`;
      vars['inv_total'] = String(i.total);
      vars['inv_amount'] = `${fmt(i.amt)} د.إ`;
    } else if (reportType === "kitchen_cost") {
      const [p] = await conn.query<any[]>(
        `SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN status='open' THEN 1 ELSE 0 END),0) as open,
         COALESCE(SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END),0) as closed,
         COALESCE(SUM(pulledQuantity),0) as pulled, COALESCE(SUM(wasteQty),0) as waste
         FROM kitchen_daily_pulls WHERE DATE(CONVERT_TZ(pullDate,'+00:00',?))=?`, [tzOffset, date]);
      // Daily kitchen cost = pulled quantity * material price
      const [kc] = await conn.query<any[]>(
        `SELECT 
          COALESCE(SUM(kdp.pulledQuantity * COALESCE(rm.averageCost, rm.lastPurchasePrice, 0)), 0) as daily_cost,
          COALESCE(SUM(kdp.wasteQty * COALESCE(rm.averageCost, rm.lastPurchasePrice, 0)), 0) as daily_waste_cost,
          COUNT(DISTINCT kdp.materialId) as materials_count
         FROM kitchen_daily_pulls kdp
         LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
         WHERE DATE(CONVERT_TZ(kdp.pullDate,'+00:00',?))=?`, [tzOffset, date]);
      const [prod] = await conn.query<any[]>(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(producedQuantity * actualUnitCost), 0) as prod_cost
         FROM kitchen_daily_production WHERE DATE(CONVERT_TZ(productionDate,'+00:00',?))=?`, [tzOffset, date]);
      const [top] = await conn.query<any[]>(
        `SELECT kdp.materialNameAr, SUM(kdp.pulledQuantity) as qty, kdp.unit,
         SUM(kdp.pulledQuantity * COALESCE(rm.averageCost, rm.lastPurchasePrice, 0)) as cost
         FROM kitchen_daily_pulls kdp
         LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
         WHERE DATE(CONVERT_TZ(kdp.pullDate,'+00:00',?))=?
         GROUP BY kdp.materialId, kdp.materialNameAr, kdp.unit ORDER BY cost DESC LIMIT 3`, [tzOffset, date]);
      const pp = p[0], kk = kc[0];
      vars['pulls_total'] = String(pp.total);
      vars['pulls_open'] = String(pp.open);
      vars['pulls_closed'] = String(pp.closed);
      vars['pulls_qty'] = fmt(pp.pulled);
      vars['pulls_waste'] = fmt(pp.waste);
      vars['kitchen_daily_cost'] = `${fmt(kk.daily_cost)} د.إ`;
      vars['kitchen_daily_waste_cost'] = `${fmt(kk.daily_waste_cost)} د.إ`;
      vars['kitchen_materials_count'] = String(kk.materials_count);
      vars['production_count'] = String(prod[0].cnt);
      vars['kitchen_prod_cost'] = `${fmt(prod[0].prod_cost)} د.إ`;
      vars['top_materials'] = (top as any[]).map((t: any, i: number)=>`${i+1}. ${t.materialNameAr} (${fmt(t.qty)} ${t.unit} - ${fmt(t.cost)} د.إ)`).join('، ');
      // Aliases for VariablesPicker compatibility
      vars['kitchen_pull_count'] = String(pp.total);
      vars['kitchen_open_count'] = String(pp.open);
      vars['kitchen_closed_count'] = String(pp.closed);
      vars['kitchen_pull_qty'] = fmt(pp.pulled);
      vars['kitchen_waste_qty'] = fmt(pp.waste);
      vars['kitchen_prod_count'] = String(prod[0].cnt);
      // Top materials individual items
      const topArr = top as any[];
      vars['kitchen_top1'] = topArr[0] ? `${topArr[0].materialNameAr} (${fmt(topArr[0].qty)} ${topArr[0].unit})` : '-';
      vars['kitchen_top2'] = topArr[1] ? `${topArr[1].materialNameAr} (${fmt(topArr[1].qty)} ${topArr[1].unit})` : '-';
      vars['kitchen_top3'] = topArr[2] ? `${topArr[2].materialNameAr} (${fmt(topArr[2].qty)} ${topArr[2].unit})` : '-';
    } else if (reportType === "inventory_value") {
      const [s] = await conn.query<any[]>(
        `SELECT COUNT(*) as total,
         COALESCE(SUM(CASE WHEN currentQuantity<=0 THEN 1 ELSE 0 END),0) as out,
         COALESCE(SUM(CASE WHEN currentQuantity>0 AND currentQuantity<=minimumQuantity THEN 1 ELSE 0 END),0) as low,
         COALESCE(SUM(CASE WHEN currentQuantity>minimumQuantity THEN 1 ELSE 0 END),0) as good,
         COALESCE(SUM(currentQuantity*COALESCE(averageCost,lastPurchasePrice,0)),0) as totalVal,
         COALESCE(SUM(CASE WHEN (materialType IS NULL OR materialType='raw') THEN currentQuantity*COALESCE(averageCost,lastPurchasePrice,0) ELSE 0 END),0) as rawVal,
         COALESCE(SUM(CASE WHEN materialType IN ('semi_finished','manufactured') THEN currentQuantity*COALESCE(averageCost,lastPurchasePrice,0) ELSE 0 END),0) as mfgVal
         FROM raw_materials WHERE isActive=1`);
      const [low] = await conn.query<any[]>(
        `SELECT nameAr FROM raw_materials WHERE isActive=1 AND currentQuantity>0 AND currentQuantity<=minimumQuantity LIMIT 5`);
      const [out] = await conn.query<any[]>(
        `SELECT nameAr FROM raw_materials WHERE isActive=1 AND currentQuantity<=0 LIMIT 5`);
      const ss = s[0];
      vars['total_materials'] = String(ss.total);
      vars['good_count'] = String(ss.good);
      vars['low_count'] = String(ss.low);
      vars['out_count'] = String(ss.out);
      vars['raw_value'] = `${fmt(ss.rawVal)} د.إ`;
      vars['mfg_value'] = `${fmt(ss.mfgVal)} د.إ`;
      vars['total_value'] = `${fmt(ss.totalVal)} د.إ`;
      vars['low_materials'] = (low as any[]).map((m: any)=>m.nameAr).join('، ');
      vars['out_materials'] = (out as any[]).map((m: any)=>m.nameAr).join('، ');
      // Aliases for VariablesPicker compatibility
      vars['inv_total_items'] = String(ss.total);
      vars['inv_good_count'] = String(ss.good);
      vars['inv_low_count'] = String(ss.low);
      vars['inv_out_count'] = String(ss.out);
      vars['inv_raw_value'] = `${fmt(ss.rawVal)} د.إ`;
      vars['inv_mfg_value'] = `${fmt(ss.mfgVal)} د.إ`;
      vars['inv_total_value'] = `${fmt(ss.totalVal)} د.إ`;
      vars['inv_low_list'] = (low as any[]).map((m: any)=>m.nameAr).join('، ');
      vars['inv_out_list'] = (out as any[]).map((m: any)=>m.nameAr).join('، ');
    } else if (reportType === "waste_summary") {
      const [w] = await conn.query<any[]>(
        `SELECT COUNT(*) as entries, COUNT(DISTINCT materialId) as materials,
         COALESCE(SUM(wasteQty),0) as qty, COALESCE(SUM(totalCost),0) as cost
         FROM waste_logs WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',?))=?`, [tzOffset, date]);
      const [bw] = await conn.query<any[]>(
        `SELECT COUNT(*) as entries, COALESCE(SUM(wasteQty),0) as qty, COALESCE(SUM(totalCost),0) as cost
         FROM butcher_waste WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',?))=?`, [tzOffset, date]);
      const [kw] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(wasteQty),0) as qty FROM kitchen_daily_pulls WHERE DATE(CONVERT_TZ(pullDate,'+00:00',?))=? AND wasteQty>0`, [tzOffset, date]);
      const [top] = await conn.query<any[]>(
        `SELECT materialNameAr, SUM(wasteQty) as qty, SUM(totalCost) as cost, unit
         FROM waste_logs WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',?))=?
         GROUP BY materialId, materialNameAr, unit ORDER BY cost DESC LIMIT 3`, [tzOffset, date]);
      const ww = w[0], bb = bw[0], kk = kw[0];
      vars['waste_entries'] = String(ww.entries);
      vars['waste_materials'] = String(ww.materials);
      vars['waste_qty'] = fmt(ww.qty);
      vars['waste_cost'] = `${fmt(ww.cost)} د.إ`;
      vars['butcher_waste_entries'] = String(bb.entries);
      vars['butcher_waste_qty'] = fmt(bb.qty);
      vars['butcher_waste_cost'] = `${fmt(bb.cost)} د.إ`;
      vars['kitchen_waste_qty'] = fmt(kk.qty);
      vars['top_waste'] = (top as any[]).map((t: any, i: number)=>`${i+1}. ${t.materialNameAr} (${fmt(t.qty)} ${t.unit})`).join('، ');
    } else if (reportType === "warehouse_performance") {
      // تقرير أداء المخزن: كميات المواد الخمسة من جدول المواد الخام
      const WAREHOUSE_ITEMS = [
        { id: 132, varKey: 'wh_chicken',  label: 'دجاج كاملة' },
        { id: 144, varKey: 'wh_charcoal', label: 'الفحم' },
        { id: 143, varKey: 'wh_gas',      label: 'الغاز' },
        { id: 158, varKey: 'wh_kofta',    label: 'لحم كفتة' },
        { id: 167, varKey: 'wh_rice',     label: 'أرز' },
      ];
      for (const item of WAREHOUSE_ITEMS) {
        const [rows] = await conn.query<any[]>(
          `SELECT currentQuantity, unit, minimumQuantity FROM raw_materials WHERE id = ?`, [item.id]
        );
        const row = (rows as any[])[0];
        if (row) {
          const qty = parseFloat(row.currentQuantity) || 0;
          const min = parseFloat(row.minimumQuantity) || 0;
          const status = qty <= 0 ? '🔴 نفد' : qty <= min ? '🟡 منخفض' : '✅ جيد';
          vars[item.varKey] = `${fmt(qty, 2)} ${row.unit}`;
          vars[`${item.varKey}_status`] = status;
          vars[`${item.varKey}_min`] = `${fmt(min, 2)} ${row.unit}`;
        } else {
          vars[item.varKey] = '-';
          vars[`${item.varKey}_status`] = '-';
          vars[`${item.varKey}_min`] = '-';
        }
      }
      // إجمالي المخزون
      const [inv] = await conn.query<any[]>(
        `SELECT COUNT(*) as total,
         COALESCE(SUM(CASE WHEN currentQuantity<=0 THEN 1 ELSE 0 END),0) as out_cnt,
         COALESCE(SUM(CASE WHEN currentQuantity>0 AND currentQuantity<=minimumQuantity THEN 1 ELSE 0 END),0) as low_cnt
         FROM raw_materials WHERE isActive=1`
      );
      vars['inv_total_items'] = String((inv as any[])[0].total);
      vars['inv_out_count'] = String((inv as any[])[0].out_cnt);
      vars['inv_low_count'] = String((inv as any[])[0].low_cnt);
    } else if (reportType === "system_alerts") {
      const [c] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(CASE WHEN currentQuantity<=0 THEN 1 ELSE 0 END),0) as out,
         COALESCE(SUM(CASE WHEN currentQuantity>0 AND currentQuantity<=minimumQuantity THEN 1 ELSE 0 END),0) as low
         FROM raw_materials WHERE isActive=1`);
      const [out] = await conn.query<any[]>(
        `SELECT nameAr FROM raw_materials WHERE isActive=1 AND currentQuantity<=0 LIMIT 10`);
      const [low] = await conn.query<any[]>(
        `SELECT nameAr, currentQuantity, minimumQuantity, unit FROM raw_materials
         WHERE isActive=1 AND currentQuantity>0 AND currentQuantity<=minimumQuantity
         ORDER BY (currentQuantity/minimumQuantity) ASC LIMIT 10`);
      vars['total_alerts'] = String(Number(c[0].out) + Number(c[0].low));
      vars['out_count'] = String(c[0].out);
      vars['low_count'] = String(c[0].low);
      vars['out_materials'] = (out as any[]).map((m: any)=>m.nameAr).join('، ');
      vars['low_materials'] = (low as any[]).map((m: any)=>`${m.nameAr}: ${fmt(m.currentQuantity)}/${fmt(m.minimumQuantity)} ${m.unit}`).join('، ');
    } else if (reportType === "expiry_alert") {
      // Materials expiring in the next 7 days
      const [expiring] = await conn.query<any[]>(
        `SELECT m.nameAr, t.expiryDate, t.quantity, m.unit,
         DATEDIFF(t.expiryDate, CURDATE()) as daysLeft
         FROM inventory_transactions t
         JOIN raw_materials m ON m.id = t.materialId
         WHERE t.expiryDate IS NOT NULL
           AND t.expiryDate >= CURDATE()
           AND t.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
           AND t.transactionType = 'IN'
         ORDER BY t.expiryDate ASC
         LIMIT 20`);
      const [critical] = await conn.query<any[]>(
        `SELECT COUNT(*) as cnt FROM inventory_transactions t
         WHERE t.expiryDate IS NOT NULL AND t.expiryDate >= CURDATE()
           AND t.expiryDate <= DATE_ADD(CURDATE(), INTERVAL 3 DAY)`);
      vars['expiry_count'] = String((expiring as any[]).length);
      vars['critical_count'] = String((critical as any[])[0]?.cnt ?? 0);
      vars['expiring_materials'] = (expiring as any[]).map((r: any) =>
        `${r.nameAr}: ينتهي في ${r.daysLeft} يوم (${String(r.expiryDate).split('T')[0]})`
      ).join('\n');
    } else if (reportType === "daily_closing_report") {
      // Daily closing: pull key metrics for today
      const [sales] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(totalAmount),0) as total FROM invoices WHERE DATE(invoiceDate)=? AND paymentStatus IN ('paid','partial')`, [date]);
      const [purchases] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(COALESCE(paidAmount,totalAmount)),0) as total FROM invoices WHERE DATE(invoiceDate)=?`, [date]);
      const [wasteRows] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(totalCost),0) as total FROM waste_log WHERE DATE(wasteDate)=?`, [date]);
      const [prodRows] = await conn.query<any[]>(
        `SELECT COUNT(*) as cnt FROM kitchen_production_pulls WHERE DATE(productionDate)=? AND status='closed'`, [date]);
      const [lowRows] = await conn.query<any[]>(
        `SELECT COUNT(*) as cnt FROM raw_materials WHERE isActive=1 AND currentQuantity>0 AND currentQuantity<=minimumQuantity`);
      const [saleItems] = await conn.query<any[]>(
        `SELECT p.nameAr, SUM(si.quantity) as qty
         FROM sale_items si JOIN products p ON p.id=si.productId
         WHERE DATE(si.createdAt)=?
         GROUP BY si.productId ORDER BY qty DESC LIMIT 3`, [date]);
      const totalSales = Number((sales as any[])[0]?.total ?? 0);
      const totalPurchases = Number((purchases as any[])[0]?.total ?? 0);
      const totalWaste = Number((wasteRows as any[])[0]?.total ?? 0);
      vars['closing_date'] = date;
      vars['total_sales'] = fmt(totalSales);
      vars['total_purchases'] = fmt(totalPurchases);
      vars['total_waste_cost'] = fmt(totalWaste);
      vars['kitchen_production_count'] = String((prodRows as any[])[0]?.cnt ?? 0);
      vars['low_stock_count'] = String((lowRows as any[])[0]?.cnt ?? 0);
      vars['top_3_sellers'] = (saleItems as any[]).map((r: any) =>
        `${r.nameAr} (${r.qty})`).join('، ') || '—';
      vars['food_cost_pct'] = totalSales > 0 ? fmt((totalPurchases / totalSales) * 100, 1) + '%' : '—';
    }
    // ─── Daily Account Summary ────────────────────────────────────────────────
    if (reportType === "daily_account_summary") {
      try {
        // Always use the most recently saved daily account (not necessarily today)
        const [daLatest] = await conn.query<any[]>(
          `SELECT * FROM daily_accounts ORDER BY accountDate DESC LIMIT 1`
        );
        const latestRow = (daLatest as any[])[0];
        const effectiveDate = latestRow?.accountDate instanceof Date
          ? latestRow.accountDate.toISOString().split('T')[0]
          : latestRow?.accountDate ? String(latestRow.accountDate).split('T')[0] : date;
        const [da] = await conn.query<any[]>(
          `SELECT * FROM daily_accounts WHERE accountDate=? ORDER BY id DESC LIMIT 1`, [effectiveDate]
        );
        const row = (da as any[])[0] ?? {};
        const salesCash = Number(row.salesCash || 0);
        const salesCard = Number(row.salesCard || 0);
        const salesKita = Number(row.salesKita || 0);
        const salesOrders = Number(row.salesOrders || 0);
        const salesNoon = Number(row.salesNoon || 0);
        const salesDeliveroo = Number(row.salesDeliveroo || 0);
        const salesCareem = Number(row.salesCareem || 0);
        const salesApps = salesKita + salesOrders + salesNoon + salesDeliveroo + salesCareem;
        const totalSales = salesCash + salesCard + salesApps;
        const expensesFixed = Number(row.expensesFixed || 0);
        const supplyToRestaurant = Number(row.supplyToRestaurant || 0);
        const supplyToManagement = Number(row.supplyToManagement || 0);
        const supplyExtra = Number(row.supplyExtra || 0);
        const carryForwardToNext = Number(row.carryForwardToNext || 0);
        // carry_from_prev = carryForwardToNext of the previous day's record
        const [prevDa] = await conn.query<any[]>(
          `SELECT carryForwardToNext FROM daily_accounts WHERE accountDate < ? ORDER BY accountDate DESC LIMIT 1`, [effectiveDate]
        );
        const carryForwardFromPrev = Number((prevDa as any[])[0]?.carryForwardToNext || 0);
        // Get expenses from invoices for that date
        const [suppInv] = await conn.query<any[]>(
          `SELECT COALESCE(SUM(COALESCE(paidAmount,totalAmount)),0) as total FROM invoices WHERE DATE(invoiceDate)=? AND paymentStatus IN ('paid','partial')`, [effectiveDate]
        );
        const [freeInv] = await conn.query<any[]>(
          `SELECT COALESCE(SUM(COALESCE(paidAmount,totalAmount)),0) as total FROM free_invoices WHERE DATE(date)=?`, [effectiveDate]
        );
        const expensesSupplier = Number((suppInv as any[])[0]?.total || 0);
        const expensesFree = Number((freeInv as any[])[0]?.total || 0);
        const totalExpenses = expensesFixed + expensesSupplier + expensesFree;
        const netProfit = totalSales - totalExpenses;
        vars['account_date'] = arabicDate(date);
        vars['sales_cash'] = `${fmt(salesCash)} د.إ`;
        vars['sales_card'] = `${fmt(salesCard)} د.إ`;
        vars['sales_kita'] = `${fmt(salesKita)} د.إ`;
        vars['sales_orders'] = `${fmt(salesOrders)} د.إ`;
        vars['sales_noon'] = `${fmt(salesNoon)} د.إ`;
        vars['sales_deliveroo'] = `${fmt(salesDeliveroo)} د.إ`;
        vars['sales_careem'] = `${fmt(salesCareem)} د.إ`;
        vars['sales_apps'] = `${fmt(salesApps)} د.إ`;
        vars['total_sales'] = `${fmt(totalSales)} د.إ`;
        vars['expenses_supplier'] = `${fmt(expensesSupplier)} د.إ`;
        vars['expenses_free'] = `${fmt(expensesFree)} د.إ`;
        vars['expenses_fixed'] = `${fmt(expensesFixed)} د.إ`;
        vars['total_expenses'] = `${fmt(totalExpenses)} د.إ`;
        vars['supply_restaurant'] = `${fmt(supplyToRestaurant)} د.إ`;
        vars['supply_management'] = `${fmt(supplyToManagement)} د.إ`;
        vars['supply_extra'] = `${fmt(supplyExtra)} د.إ`;
        vars['carry_from_prev'] = `${fmt(carryForwardFromPrev)} د.إ`;
        vars['carry_to_next'] = `${fmt(carryForwardToNext)} د.إ`;
        vars['net_profit'] = `${fmt(netProfit)} د.إ`;
        vars['notes'] = row.notes ?? '—';
      } catch (_) { /* ignore */ }
    }
    // ─── Daily Financial Summary (matches "الحسابات اليومية" KPI cards) ────────
    if (reportType === "daily_financial_summary") {
      try {
        const d = new Date(date + "T00:00:00");
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const kpi = await getFinancialKpi(year, month);

        const cogsPct = kpi.netSales > 0 ? (kpi.cogsValue / kpi.netSales) * 100 : 0;

        // نسبة المطعم: من إجمالي إيداعات النقدي والتوريدات مقابل نصف المبيعات
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
        const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`;
        const [daRows] = await conn.query<any[]>(
          `SELECT
            COUNT(*) as days,
            COALESCE(SUM(salesCash),0) as cash,
            COALESCE(SUM(supplyToRestaurant+supplyToManagement+supplyExtra),0) as supply
           FROM daily_accounts WHERE accountDate BETWEEN ? AND ?`, [monthStart, monthEnd]);
        const da = (daRows as any[])[0] ?? { days: 0, cash: 0, supply: 0 };
        const monthTotalCash = Number(da.cash || 0);
        const monthTotalSupply = Number(da.supply || 0);
        const restaurantReceived = monthTotalCash + monthTotalSupply;
        const restaurantPercent = kpi.netSales > 0 ? (restaurantReceived / kpi.netSales) * 100 : 0;
        const restaurantExpected = kpi.netSales / 2 - monthTotalCash;
        const restaurantDiff = monthTotalSupply - restaurantExpected;

        vars['account_month'] = new Date(year, month - 1, 1).toLocaleDateString('ar-AE', { month: 'long', year: 'numeric' });
        vars['days_recorded'] = String(da.days || 0);
        vars['net_sales'] = `${fmt(kpi.netSales)} د.إ`;
        vars['gross_profit'] = `${fmt(kpi.grossProfit)} د.إ`;
        vars['gross_margin'] = `${fmt(kpi.grossMargin, 1)}%`;
        vars['cogs_value'] = `${fmt(kpi.cogsValue)} د.إ`;
        vars['cogs_pct'] = `${fmt(cogsPct, 1)}%`;
        vars['op_paid'] = `${fmt(kpi.opPaid)} د.إ`;
        vars['op_deferred'] = `${fmt(kpi.opDeferred)} د.إ`;
        vars['opening_stock_value'] = `${fmt(kpi.openingStockValue)} د.إ`;
        vars['opening_stock_date'] = kpi.openingStockDate ? arabicDate(kpi.openingStockDate) : '—';
        vars['current_inventory_value'] = `${fmt(kpi.currentInventoryValue)} د.إ`;
        vars['raw_materials_value'] = `${fmt(kpi.rawMaterialsValue)} د.إ`;
        vars['manufactured_value'] = `${fmt(kpi.manufacturedValue)} د.إ`;
        vars['butcher_value'] = `${fmt(kpi.butcherValue)} د.إ`;
        vars['total_debt'] = `${fmt(kpi.totalDebt)} د.إ`;
        vars['supplier_debt'] = `${fmt(kpi.supplierDebt)} د.إ`;
        vars['free_debt'] = `${fmt(kpi.freeDebt)} د.إ`;
        vars['restaurant_percentage'] = `${fmt(restaurantPercent, 1)}%`;
        vars['restaurant_received'] = `${fmt(restaurantReceived)} د.إ`;
        vars['restaurant_expected'] = `${fmt(restaurantExpected)} د.إ`;
        vars['restaurant_diff'] = `${fmt(restaurantDiff)} د.إ`;
      } catch (_) { /* ignore */ }
    }
    // ─── Monthly Performance (shared across all report types) ────────────────
    try {
      const [ms] = await conn.query<any[]>(
        `SELECT 
          COALESCE(SUM(totalSales),0) as monthly_sales,
          COALESCE(SUM(totalNetSales),0) as monthly_net_sales,
          COALESCE(SUM(totalCost),0) as monthly_pos_cost,
          COALESCE(SUM(totalProfit),0) as monthly_profit
        FROM sales_reports 
        WHERE YEAR(reportDateFrom) = YEAR(CURDATE()) AND MONTH(reportDateFrom) = MONTH(CURDATE())`
      );
      const [mk] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(producedQuantity * actualUnitCost), 0) as kitchen_monthly_cost
         FROM kitchen_daily_production
         WHERE YEAR(productionDate) = YEAR(CURDATE()) AND MONTH(productionDate) = MONTH(CURDATE())`
      );
      const [mp] = await conn.query<any[]>(
        `SELECT COALESCE(SUM(totalAmount), 0) as monthly_purchases, COUNT(*) as monthly_invoice_count
         FROM free_invoices
         WHERE YEAR(date) = YEAR(CURDATE()) AND MONTH(date) = MONTH(CURDATE())`
      );
      const monthlySales = Number(ms[0].monthly_sales || 0);
      const kitchenCost = Number(mk[0].kitchen_monthly_cost || 0);
      const monthlyDiff = monthlySales - kitchenCost;
      const costPct = monthlySales > 0 ? ((kitchenCost / monthlySales) * 100) : 0;
      const currentMonth = new Date().toLocaleDateString('ar-AE', { month: 'long', year: 'numeric' });
      vars['monthly_sales'] = `${fmt(monthlySales)} د.إ`;
      vars['monthly_net_sales'] = `${fmt(Number(ms[0].monthly_net_sales || 0))} د.إ`;
      vars['monthly_profit'] = `${fmt(Number(ms[0].monthly_profit || 0))} د.إ`;
      vars['monthly_kitchen_cost'] = `${fmt(kitchenCost)} د.إ`;
      vars['monthly_diff'] = `${fmt(monthlyDiff)} د.إ`;
      vars['monthly_cost_pct'] = `${fmt(costPct, 1)}%`;
      vars['monthly_purchases'] = `${fmt(Number(mp[0].monthly_purchases || 0))} د.إ`;
      vars['monthly_invoice_count'] = String(mp[0].monthly_invoice_count || 0);
      vars['current_month'] = currentMonth;
    } catch (_) { /* ignore if tables not available */ }

  } finally {
    await conn.release();
  }

  // Add report_date and common aliases so AI-generated templates work regardless of naming
  vars['report_date'] = arabicDate(date);
  vars['today'] = arabicDate(date);
  vars['date'] = arabicDate(date);
  // Aliases: map common AI-generated names to actual variable names
  const ALIASES: Record<string, string> = {
    // Sales aliases
    'daily_total_sales': 'pos_total_sales',
    'daily_net_sales': 'pos_net_sales',
    'daily_gross_profit': 'pos_profit',
    'daily_profit': 'pos_profit',
    'daily_butchery_sales': 'butcher_total',
    'daily_sales': 'pos_total_sales',
    'total_sales': 'pos_total_sales',
    'net_sales': 'pos_net_sales',
    'gross_profit': 'pos_profit',
    'pos_total_profit': 'pos_profit',
    'pos_gross_profit': 'pos_profit',
    'pos_report_count': 'pos_reports_count',
    'pos_total_qty': 'pos_qty',
    'butcher_sales_total': 'butcher_total',
    'butcher_invoice_count': 'butcher_count',
    'butcher_top_item': 'kitchen_top1',
    // Kitchen aliases
    'kitchen_pulls_today': 'pulls_total',
    'kitchen_pulls_closed': 'pulls_closed',
    'kitchen_pulls_open': 'pulls_open',
    'kitchen_pulls_qty': 'pulls_qty',
    'kitchen_waste_total': 'kitchen_daily_waste_cost',
    'kitchen_cost': 'kitchen_daily_cost',
    'kitchen_daily_pulls': 'pulls_total',
    'kitchen_total_cost': 'kitchen_daily_cost',
    'kitchen_prod_count': 'production_count',
    // Inventory aliases
    'out_of_stock_items': 'out_count',
    'low_stock_items': 'low_count',
    'total_stock_items': 'total_materials',
    'raw_inventory_value': 'raw_value',
    'processed_inventory_value': 'mfg_value',
    'inventory_total_value': 'total_value',
    'inv_good': 'good_count',
    'inv_low': 'low_count',
    'inv_out': 'out_count',
    'supplier_invoice_count': 'invoices_count',
    'supplier_invoice_total': 'invoices_total',
    'supplier_paid_count': 'fi_paid',
    'supplier_paid_amount': 'fi_paid_amount',
    'supplier_pending_count': 'fi_pending',
    'supplier_pending_amount': 'fi_pending_amount',
    'supplier_partial_count': 'fi_partial',
    'inv_invoice_count': 'inv_total',
    'inv_invoice_total': 'inv_amount',
    // Waste aliases
    'waste_total': 'waste_cost',
    'waste_count': 'waste_entries',
    'waste_total_qty': 'waste_qty',
    'butcher_waste_total': 'butcher_waste_cost',
    'kitchen_waste_cost': 'kitchen_daily_waste_cost',
    // Performance chart aliases (used in daily performance report template)
    'gross_sales': 'pos_total_sales',
    'total_revenue': 'pos_total_sales',
    'net_profit': 'pos_profit',
    'profit_margin': 'pos_profit',
    'net_revenue': 'pos_net_sales',
    'cost_pct': 'monthly_cost_pct',
    'daily_cost_pct': 'monthly_cost_pct',
    'kitchen_cost_pct': 'monthly_cost_pct',
    'production_cost_pct': 'monthly_cost_pct',
  };
  for (const [alias, real] of Object.entries(ALIASES)) {
    if (!(alias in vars) && real in vars) vars[alias] = vars[real];
  }
  // Replace all {{variable}} tokens with real values
  return bodyText.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => vars[key.trim()] ?? `[${key.trim()}]`);
}

function applyTemplate(
  template: { headerText?: string; bodyText?: string; footerText?: string; includeDate?: boolean } | null,
  defaultHeader: string,
  dynamicBody: string,
  defaultFooter: string,
  date: string
): string {
  const header = template?.headerText?.trim() || defaultHeader;
  const footer = template?.footerText?.trim() || defaultFooter;
  // If user wrote custom bodyText, use it; otherwise use the live dynamic body
  const body = template?.bodyText?.trim() || dynamicBody;
  const includeDate = template?.includeDate !== false;

  const parts: string[] = [header];
  if (includeDate) {
    parts.push(`📅 ${arabicDate(date)}`);
  }
  parts.push("", body);
  if (footer) parts.push("", footer);
  return parts.join("\n");
}

export async function applyTemplateAsync(
  template: { headerText?: string; bodyText?: string; footerText?: string; includeDate?: boolean } | null,
  defaultHeader: string,
  dynamicBody: string,
  defaultFooter: string,
  date: string,
  reportType: ReportType
): Promise<string> {
  const header = template?.headerText?.trim() || defaultHeader;
  const footer = template?.footerText?.trim() || defaultFooter;
  const includeDate = template?.includeDate !== false;

  let body: string;
  if (template?.bodyText?.trim()) {
    // Resolve {{variable}} tokens with real DB values
    body = await resolveVariables(template.bodyText.trim(), reportType, date);
  } else {
    body = dynamicBody;
  }

  const parts: string[] = [header];
  if (includeDate) parts.push(`📅 ${arabicDate(date)}`);
  parts.push("", body);
  if (footer) parts.push("", footer);
   return parts.join("\n");
}
// ─── 1. Daily Sales ───────────────────────────────────────────────────────────

async function buildDailySalesBody(date: string): Promise<string> {
  const conn = await getConn();
  const tzOffset = await getBusinessDayTzOffset();
  try {
    // POS / restaurant sales reports
    const [sr] = await conn.query<any[]>(
      `SELECT COUNT(*) as cnt,
              COALESCE(SUM(totalSales),0) as sales,
              COALESCE(SUM(totalNetSales),0) as netSales,
              COALESCE(SUM(totalCost),0) as cost,
              COALESCE(SUM(totalProfit),0) as profit,
              COALESCE(SUM(totalQty),0) as qty
       FROM sales_reports WHERE DATE(CONVERT_TZ(createdAt,'+00:00',tzOffset)) = ?`, [date]
    );

    // Free invoices (supplier invoices)
    const [fi] = await conn.query<any[]>(
      `SELECT COUNT(*) as cnt,
              COALESCE(SUM(totalAmount),0) as total,
              COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN totalAmount ELSE 0 END),0) as paid,
              COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN totalAmount ELSE 0 END),0) as pending,
              COALESCE(SUM(CASE WHEN paymentStatus='partial' THEN totalAmount ELSE 0 END),0) as partial
       FROM free_invoices WHERE DATE(CONVERT_TZ(date,'+00:00',tzOffset)) = ?`, [date]
    );

    // Butcher sales
    const [bs] = await conn.query<any[]>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(totalAmount),0) as total
       FROM butcher_sales WHERE DATE(CONVERT_TZ(saleDate,'+00:00',tzOffset)) = ?`, [date]
    );

    // Inventory purchases
    const [ip] = await conn.query<any[]>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(totalAmount),0) as total
       FROM inventory_transactions WHERE DATE(CONVERT_TZ(transactionDate,'+00:00',tzOffset)) = ? AND transactionType='purchase'`, [date]
    );

    const s = sr[0], f = fi[0], b = bs[0], p = ip[0];

    let body = `━━━━━━━━━━━━━━━━━━━━\n`;

    if (Number(s.cnt) > 0) {
      body += `\n🏪 *مبيعات نقاط البيع:*\n`;
      body += `  📋 عدد التقارير: ${s.cnt}\n`;
      body += `  💰 إجمالي المبيعات: ${fmtAED(s.sales)}\n`;
      body += `  💵 صافي المبيعات: ${fmtAED(s.netSales)}\n`;
      body += `  📦 إجمالي الكميات: ${fmt(s.qty, 0)}\n`;
      body += `  📈 إجمالي الربح: ${fmtAED(s.profit)}\n`;
    }

    if (Number(b.total) > 0) {
      body += `\n🥩 *مبيعات الجزارة:*\n`;
      body += `  💰 ${fmtAED(b.total)} (${b.cnt} فاتورة)\n`;
    }

    if (Number(f.total) > 0) {
      body += `\n📄 *فواتير الموردين:*\n`;
      body += `  📋 عدد الفواتير: ${f.cnt}\n`;
      body += `  💰 الإجمالي: ${fmtAED(f.total)}\n`;
      body += `  ✅ مدفوع: ${fmtAED(f.paid)}\n`;
      body += `  ⏳ معلق: ${fmtAED(f.pending)}\n`;
      if (Number(f.partial) > 0) body += `  🔶 جزئي: ${fmtAED(f.partial)}\n`;
    }

    if (Number(p.total) > 0) {
      body += `\n🛒 *مشتريات المخزون:*\n`;
      body += `  ${p.cnt} معاملة • ${fmtAED(p.total)}\n`;
    }

    const grandTotal = Number(s.sales) + Number(b.total);
    if (grandTotal > 0) {
      body += `\n💵 *إجمالي الإيرادات: ${fmtAED(grandTotal)}*`;
    }

    if (body.trim() === "━━━━━━━━━━━━━━━━━━━━") {
      body += `\nلا توجد مبيعات مسجلة لهذا اليوم`;
    }

    return body;
  } finally {
    await conn.release();
  }
}

// ─── 2. Orders Summary ────────────────────────────────────────────────────────

async function buildOrdersSummaryBody(date: string): Promise<string> {
  const conn = await getConn();
  const tzOffset = await getBusinessDayTzOffset();
  try {
    const [fi] = await conn.query<any[]>(
      `SELECT COUNT(*) as total,
              COALESCE(SUM(totalAmount),0) as totalAmount,
              COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN 1 ELSE 0 END),0) as paid,
              COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN 1 ELSE 0 END),0) as pending,
              COALESCE(SUM(CASE WHEN paymentStatus='partial' THEN 1 ELSE 0 END),0) as partial,
              COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN totalAmount ELSE 0 END),0) as paidAmt,
              COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN totalAmount ELSE 0 END),0) as pendingAmt
       FROM free_invoices WHERE DATE(CONVERT_TZ(date,'+00:00',tzOffset)) = ?`, [date]
    );

    const [inv] = await conn.query<any[]>(
      `SELECT COUNT(*) as total,
              COALESCE(SUM(totalAmount),0) as totalAmount,
              COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN 1 ELSE 0 END),0) as paid,
              COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN 1 ELSE 0 END),0) as pending
       FROM invoices WHERE DATE(CONVERT_TZ(invoiceDate,'+00:00',tzOffset)) = ?`, [date]
    );

    const [sr] = await conn.query<any[]>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(totalSales),0) as total
       FROM sales_reports WHERE DATE(CONVERT_TZ(createdAt,'+00:00',tzOffset)) = ?`, [date]
    );

    const f = fi[0], i = inv[0], s = sr[0];
    const grandTotal = Number(f.totalAmount) + Number(i.totalAmount) + Number(s.total);

    let body = `━━━━━━━━━━━━━━━━━━━━\n`;

    if (Number(f.total) > 0) {
      body += `\n📄 *فواتير الموردين الحرة:*\n`;
      body += `  📋 إجمالي: ${f.total} فاتورة\n`;
      body += `  ✅ مدفوعة: ${f.paid} (${fmtAED(f.paidAmt)})\n`;
      body += `  ⏳ معلقة: ${f.pending} (${fmtAED(f.pendingAmt)})\n`;
      if (Number(f.partial) > 0) body += `  🔶 جزئية: ${f.partial}\n`;
    }

    if (Number(i.total) > 0) {
      body += `\n📦 *فواتير المخزون:*\n`;
      body += `  📋 إجمالي: ${i.total} فاتورة\n`;
      body += `  ✅ مدفوعة: ${i.paid}\n`;
      body += `  ⏳ معلقة: ${i.pending}\n`;
    }

    if (Number(s.cnt) > 0) {
      body += `\n🏪 *تقارير المبيعات:*\n`;
      body += `  ${s.cnt} تقرير • ${fmtAED(s.total)}\n`;
    }

    if (grandTotal > 0) {
      body += `\n💰 *الإجمالي الكلي: ${fmtAED(grandTotal)}*`;
    } else {
      body += `\nلا توجد فواتير مسجلة لهذا اليوم`;
    }

    return body;
  } finally {
    await conn.release();
  }
}

// ─── 3. Kitchen Cost ──────────────────────────────────────────────────────────

async function buildKitchenCostBody(date: string): Promise<string> {
  const conn = await getConn();
  const tzOffset = await getBusinessDayTzOffset();
  try {
    const [pulls] = await conn.query<any[]>(
      `SELECT COUNT(*) as total,
              COALESCE(SUM(CASE WHEN status='open' THEN 1 ELSE 0 END),0) as openCount,
              COALESCE(SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END),0) as closedCount,
              COALESCE(SUM(pulledQuantity),0) as totalPulled,
              COALESCE(SUM(wasteQty),0) as totalWaste
       FROM kitchen_daily_pulls WHERE DATE(CONVERT_TZ(pullDate,'+00:00',tzOffset)) = ?`, [date]
    );

    const [topMats] = await conn.query<any[]>(
      `SELECT materialNameAr, materialName, unit, SUM(pulledQuantity) as qty
       FROM kitchen_daily_pulls WHERE DATE(CONVERT_TZ(pullDate,'+00:00',tzOffset)) = ?
       GROUP BY materialId, materialNameAr, materialName, unit
       ORDER BY qty DESC LIMIT 5`, [date]
    );

    const [prod] = await conn.query<any[]>(
      `SELECT COUNT(*) as cnt FROM kitchen_daily_production WHERE DATE(CONVERT_TZ(productionDate,'+00:00',tzOffset)) = ?`, [date]
    );

    const p = pulls[0];

    let body = `━━━━━━━━━━━━━━━━━━━━\n`;
    body += `\n📦 *المواد المسحوبة:*\n`;
    body += `  📋 إجمالي السحبات: ${p.total}\n`;
    body += `  🔓 مفتوحة (لم تُجرد): ${p.openCount}\n`;
    body += `  🔒 مغلقة (تم جردها): ${p.closedCount}\n`;
    body += `  ⚖️ إجمالي الكميات: ${fmt(p.totalPulled, 2)}\n`;
    if (Number(p.totalWaste) > 0) {
      body += `  🗑️ هدر المطبخ: ${fmt(p.totalWaste, 2)}\n`;
    }

    if (Number(prod[0].cnt) > 0) {
      body += `\n🏭 *الإنتاج اليومي:* ${prod[0].cnt} صنف\n`;
    }

    if (topMats.length > 0) {
      body += `\n🔝 *أكثر المواد سحباً:*\n`;
      topMats.forEach((m: any, i: number) => {
        body += `  ${i + 1}. ${m.materialNameAr || m.materialName}: ${fmt(m.qty, 2)} ${m.unit}\n`;
      });
    }

    return body;
  } finally {
    await conn.release();
  }
}

// ─── 4. Inventory Value ───────────────────────────────────────────────────────

async function buildInventoryValueBody(): Promise<string> {
  const conn = await getConn();
  try {
    const [summary] = await conn.query<any[]>(
      `SELECT COUNT(*) as total,
              COALESCE(SUM(CASE WHEN currentQuantity <= 0 THEN 1 ELSE 0 END),0) as outOfStock,
              COALESCE(SUM(CASE WHEN currentQuantity > 0 AND currentQuantity <= minimumQuantity THEN 1 ELSE 0 END),0) as lowStock,
              COALESCE(SUM(CASE WHEN currentQuantity > minimumQuantity THEN 1 ELSE 0 END),0) as healthy,
              COALESCE(SUM(currentQuantity * COALESCE(averageCost, lastPurchasePrice, 0)),0) as totalValue,
              COALESCE(SUM(CASE WHEN (materialType IS NULL OR materialType='raw') THEN currentQuantity * COALESCE(averageCost, lastPurchasePrice, 0) ELSE 0 END),0) as rawValue,
              COALESCE(SUM(CASE WHEN materialType IN ('semi_finished','manufactured') THEN currentQuantity * COALESCE(averageCost, lastPurchasePrice, 0) ELSE 0 END),0) as mfgValue
       FROM raw_materials WHERE isActive = 1`
    );

    const [lowStock] = await conn.query<any[]>(
      `SELECT nameAr, name, currentQuantity, minimumQuantity, unit
       FROM raw_materials
       WHERE isActive=1 AND currentQuantity > 0 AND currentQuantity <= minimumQuantity
       ORDER BY (currentQuantity / minimumQuantity) ASC LIMIT 5`
    );

    const [outOfStock] = await conn.query<any[]>(
      `SELECT nameAr, name, unit FROM raw_materials
       WHERE isActive=1 AND currentQuantity <= 0 LIMIT 5`
    );

    const s = summary[0];

    let body = `━━━━━━━━━━━━━━━━━━━━\n`;
    body += `\n📊 *إحصائيات المخزون:*\n`;
    body += `  🏷️ إجمالي المواد: ${s.total}\n`;
    body += `  ✅ مخزون جيد: ${s.healthy}\n`;
    body += `  🟡 مخزون منخفض: ${s.lowStock}\n`;
    body += `  🔴 نفد من المخزون: ${s.outOfStock}\n`;
    body += `\n💰 *القيمة المالية:*\n`;
    body += `  📦 قيمة المواد الخام: ${fmtAED(s.rawValue)}\n`;
    body += `  🏭 قيمة المصنّعة: ${fmtAED(s.mfgValue)}\n`;
    body += `  💵 *الإجمالي: ${fmtAED(s.totalValue)}*\n`;

    if (lowStock.length > 0) {
      body += `\n⚠️ *مواد تحتاج إعادة طلب:*\n`;
      lowStock.forEach((m: any) => {
        body += `  • ${m.nameAr || m.name}: ${fmt(m.currentQuantity, 2)} / ${fmt(m.minimumQuantity, 2)} ${m.unit}\n`;
      });
    }

    if (outOfStock.length > 0) {
      body += `\n🚨 *مواد نافدة:*\n`;
      outOfStock.forEach((m: any) => {
        body += `  • ${m.nameAr || m.name} (${m.unit})\n`;
      });
    }

    return body;
  } finally {
    await conn.release();
  }
}

// ─── 5. Waste Summary ─────────────────────────────────────────────────────────

async function buildWasteSummaryBody(date: string): Promise<string> {
  const conn = await getConn();
  const tzOffset = await getBusinessDayTzOffset();
  try {
    const [wl] = await conn.query<any[]>(
      `SELECT COUNT(*) as entries,
              COUNT(DISTINCT materialId) as materials,
              COALESCE(SUM(wasteQty),0) as qty,
              COALESCE(SUM(totalCost),0) as cost
       FROM waste_logs WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',tzOffset)) = ?`, [date]
    );

    const [bw] = await conn.query<any[]>(
      `SELECT COUNT(*) as entries,
              COALESCE(SUM(wasteQty),0) as qty,
              COALESCE(SUM(totalCost),0) as cost
       FROM butcher_waste WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',tzOffset)) = ?`, [date]
    );

    const [kw] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(wasteQty),0) as qty
       FROM kitchen_daily_pulls WHERE DATE(CONVERT_TZ(pullDate,'+00:00',tzOffset)) = ? AND wasteQty > 0`, [date]
    );

    const [topWaste] = await conn.query<any[]>(
      `SELECT materialNameAr, materialName, unit, SUM(wasteQty) as qty, SUM(totalCost) as cost
       FROM waste_logs WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',tzOffset)) = ?
       GROUP BY materialId, materialNameAr, materialName, unit
       ORDER BY cost DESC LIMIT 3`, [date]
    );

    const w = wl[0], b = bw[0], k = kw[0];
    const totalCost = Number(w.cost) + Number(b.cost);
    const totalQty = Number(w.qty) + Number(b.qty) + Number(k.qty);

    let body = `━━━━━━━━━━━━━━━━━━━━\n`;

    if (totalQty === 0 && totalCost === 0) {
      body += `\n✅ لا يوجد هدر مسجل لهذا اليوم`;
      return body;
    }

    body += `\n📊 *ملخص الهدر:*\n`;
    body += `  📦 مواد مهدورة: ${w.materials} مادة\n`;
    body += `  ⚖️ إجمالي الكميات: ${fmt(totalQty, 2)}\n`;
    body += `  💸 إجمالي التكلفة: ${fmtAED(totalCost)}\n`;

    if (Number(w.cost) > 0) {
      body += `\n🏪 *هدر المستودع:*\n`;
      body += `  ${w.entries} سجل • ${fmtAED(w.cost)}\n`;
    }

    if (Number(b.cost) > 0) {
      body += `\n🥩 *هدر الجزارة:*\n`;
      body += `  ${b.entries} سجل • ${fmtAED(b.cost)}\n`;
    }

    if (Number(k.qty) > 0) {
      body += `\n🍳 *هدر المطبخ:* ${fmt(k.qty, 2)}\n`;
    }

    if (topWaste.length > 0) {
      body += `\n🔝 *أكثر المواد هدراً:*\n`;
      topWaste.forEach((t: any, i: number) => {
        body += `  ${i + 1}. ${t.materialNameAr || t.materialName}: ${fmt(t.qty, 2)} ${t.unit} (${fmtAED(t.cost)})\n`;
      });
    }

    return body;
  } finally {
    await conn.release();
  }
}

// ─── 6. System Alerts ─────────────────────────────────────────────────────────

async function buildSystemAlertsBody(): Promise<string> {
  const conn = await getConn();
  try {
    const [counts] = await conn.query<any[]>(
      `SELECT COALESCE(SUM(CASE WHEN currentQuantity <= 0 THEN 1 ELSE 0 END),0) as outOfStock,
              COALESCE(SUM(CASE WHEN currentQuantity > 0 AND currentQuantity <= minimumQuantity THEN 1 ELSE 0 END),0) as lowStock
       FROM raw_materials WHERE isActive=1`
    );

    const [outOfStock] = await conn.query<any[]>(
      `SELECT nameAr, name, unit, reorderQuantity
       FROM raw_materials WHERE isActive=1 AND currentQuantity <= 0 LIMIT 10`
    );

    const [lowStock] = await conn.query<any[]>(
      `SELECT nameAr, name, currentQuantity, minimumQuantity, unit
       FROM raw_materials WHERE isActive=1 AND currentQuantity > 0 AND currentQuantity <= minimumQuantity
       ORDER BY (currentQuantity / minimumQuantity) ASC LIMIT 10`
    );

    const c = counts[0];
    const totalAlerts = Number(c.outOfStock) + Number(c.lowStock);

    let body = `━━━━━━━━━━━━━━━━━━━━\n`;

    if (totalAlerts === 0) {
      body += `\n✅ *لا توجد تنبيهات*\nجميع المواد في مستويات جيدة 👍`;
      return body;
    }

    body += `\n🚨 إجمالي التنبيهات: ${totalAlerts}\n`;

    if (outOfStock.length > 0) {
      body += `\n🔴 *نفد من المخزون (${c.outOfStock}):*\n`;
      outOfStock.forEach((m: any) => {
        body += `  • ${m.nameAr || m.name} (${m.unit})`;
        if (m.reorderQuantity) body += ` — يحتاج: ${fmt(m.reorderQuantity, 0)}`;
        body += `\n`;
      });
    }

    if (lowStock.length > 0) {
      body += `\n🟡 *مخزون منخفض (${c.lowStock}):*\n`;
      lowStock.forEach((m: any) => {
        body += `  • ${m.nameAr || m.name}: ${fmt(m.currentQuantity, 2)} ${m.unit} (الحد: ${fmt(m.minimumQuantity, 2)})\n`;
      });
    }

    return body;
  } finally {
    await conn.release();
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateReport(
  reportType: ReportType,
  template?: { headerText?: string; bodyText?: string; footerText?: string; includeDate?: boolean } | null,
  date?: string
): Promise<string> {
  const targetDate = date || await businessTodayStr();

  try {
    switch (reportType) {
      case "daily_sales": {
        const body = await buildDailySalesBody(targetDate);
        return applyTemplateAsync(template ?? null, "📊 *تقرير المبيعات اليومي*", body, "_تم الإرسال تلقائياً من منصة مطجري_", targetDate, "daily_sales");
      }
      case "orders_summary": {
        const body = await buildOrdersSummaryBody(targetDate);
        return applyTemplateAsync(template ?? null, "📋 *ملخص الطلبات اليومي*", body, "_تم الإرسال تلقائياً من منصة مطجري_", targetDate, "orders_summary");
      }
      case "kitchen_cost": {
        const body = await buildKitchenCostBody(targetDate);
        return applyTemplateAsync(template ?? null, "🍳 *تقرير تكلفة المطبخ اليومي*", body, "_تم الإرسال تلقائياً من منصة مطجري_", targetDate, "kitchen_cost");
      }
      case "inventory_value": {
        const body = await buildInventoryValueBody();
        return applyTemplateAsync(template ?? null, "📦 *تقرير قيمة المخزون*", body, "_تم الإرسال تلقائياً من منصة مطجري_", targetDate, "inventory_value");
      }
      case "waste_summary": {
        const body = await buildWasteSummaryBody(targetDate);
        return applyTemplateAsync(template ?? null, "🗑️ *تقرير الهدر اليومي*", body, "_تم الإرسال تلقائياً من منصة مطجري_", targetDate, "waste_summary");
      }
      case "system_alerts": {
        const body = await buildSystemAlertsBody();
        return applyTemplateAsync(template ?? null, "⚠️ *تنبيهات المخزون*", body, "_تم الإرسال تلقائياً من منصة مطجري_", targetDate, "system_alerts");
      }
      default:
        return `📊 تقرير غير معروف: ${reportType}`;
    }
  } catch (err: any) {
    return `⚠️ تعذّر توليد التقرير\nالخطأ: ${err?.message ?? "خطأ غير معروف"}`;
  }
}

/**
 * Generate a WhatsApp message from a full-text template (single text field with {{variables}}).
 * This is the new model: templates are stored as a single `full_text` string, not header/body/footer.
 * The reportType is used only to determine which variables to resolve.
 */
export async function generateReportFromFullText(
  fullText: string,
  reportType: ReportType,
  date?: string
): Promise<string> {
  const targetDate = date || await businessTodayStr();
  try {
    return await resolveVariables(fullText, reportType, targetDate);
  } catch (err: any) {
    return `⚠️ تعذّر توليد التقرير\nالخطأ: ${err?.message ?? "خطأ غير معروف"}`;
  }
}

/**
 * Preview a full-text template with real data from DB.
 * Used for "preview with real data" feature in template editor.
 */
export async function previewFullTextTemplate(
  fullText: string,
  reportType: ReportType
): Promise<string> {
  const date = await businessTodayStr();
  return resolveVariables(fullText, reportType, date);
}
