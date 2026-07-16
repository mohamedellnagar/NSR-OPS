/**
 * Advanced Waste Analytics
 * Patterns, trends, top offenders, waste as % of purchases, recommendations.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

import { getConn } from "./pool";
export interface WasteTopItem {
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  totalQty: number;
  totalCost: number;
  pctOfTotalCost: number;
  entryCount: number;
  lastWasteDate: string;
}

export interface WasteDayTrend {
  date: string;
  totalCost: number;
  totalQty: number;
  entryCount: number;
}

export interface WasteByReason {
  reason: string;
  entryCount: number;
  totalCost: number;
  pctOfTotal: number;
}

export interface WasteVsPurchase {
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  purchaseQty: number;
  wasteQty: number;
  wastePct: number;   // waste / purchase * 100
  purchaseCost: number;
  wasteCost: number;
}

export interface WasteAnalytics {
  period: { fromDate: string; toDate: string };
  summary: {
    totalWasteCost: number;
    totalWasteQty: number;
    totalEntries: number;
    avgDailyCost: number;
    daysWithWaste: number;
  };
  topItems: WasteTopItem[];          // top 10 by cost
  dailyTrend: WasteDayTrend[];       // day-by-day breakdown
  byReason: WasteByReason[];         // breakdown by waste reason
  wasteVsPurchase: WasteVsPurchase[]; // top offenders: waste / purchases ratio
  weekComparison: {
    currentWeekCost: number;
    prevWeekCost: number;
    changePct: number;
  };
  recommendations: string[];
}

const REASON_LABELS: Record<string, string> = {
  expired: "منتهية الصلاحية",
  spoiled: "تلف",
  overproduced: "إنتاج زائد",
  damaged: "ضرر في التخزين",
  kitchen_error: "خطأ في المطبخ",
  other: "أسباب أخرى",
};

export async function getWasteAnalytics(
  fromDate: string,
  toDate: string
): Promise<WasteAnalytics> {
  const conn = await getConn();
  try {
    // Summary
    const [summary] = await conn.query<any[]>(`
      SELECT
        COALESCE(SUM(totalCost), 0)   AS totalWasteCost,
        COALESCE(SUM(quantity), 0)    AS totalWasteQty,
        COUNT(*)                       AS totalEntries,
        COUNT(DISTINCT DATE(wasteDate)) AS daysWithWaste
      FROM waste_log
      WHERE DATE(wasteDate) BETWEEN ? AND ?
    `, [fromDate, toDate]);
    const s = (summary as any[])[0];
    const days = Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000) + 1);

    // Top items by cost
    const [topItems] = await conn.query<any[]>(`
      SELECT
        w.materialId,
        m.name AS materialName,
        m.nameAr AS materialNameAr,
        m.unit,
        SUM(w.quantity)  AS totalQty,
        SUM(w.totalCost) AS totalCost,
        COUNT(w.id)      AS entryCount,
        MAX(DATE(w.wasteDate)) AS lastWasteDate
      FROM waste_log w
      JOIN raw_materials m ON m.id = w.materialId
      WHERE DATE(w.wasteDate) BETWEEN ? AND ?
      GROUP BY w.materialId
      ORDER BY totalCost DESC
      LIMIT 10
    `, [fromDate, toDate]);

    const totalCostVal = parseFloat(s.totalWasteCost) || 1;
    const topItemsMapped: WasteTopItem[] = (topItems as any[]).map((r: any) => ({
      materialId: r.materialId,
      materialName: r.materialName,
      materialNameAr: r.materialNameAr,
      unit: r.unit,
      totalQty: parseFloat(r.totalQty),
      totalCost: parseFloat(r.totalCost),
      pctOfTotalCost: Math.round((parseFloat(r.totalCost) / totalCostVal) * 1000) / 10,
      entryCount: parseInt(r.entryCount),
      lastWasteDate: String(r.lastWasteDate).split("T")[0],
    }));

    // Daily trend
    const [trend] = await conn.query<any[]>(`
      SELECT
        DATE(wasteDate) AS date,
        SUM(totalCost)  AS totalCost,
        SUM(quantity)   AS totalQty,
        COUNT(*)        AS entryCount
      FROM waste_log
      WHERE DATE(wasteDate) BETWEEN ? AND ?
      GROUP BY DATE(wasteDate)
      ORDER BY date ASC
    `, [fromDate, toDate]);
    const dailyTrend: WasteDayTrend[] = (trend as any[]).map((r: any) => ({
      date: String(r.date).split("T")[0],
      totalCost: parseFloat(r.totalCost),
      totalQty: parseFloat(r.totalQty),
      entryCount: parseInt(r.entryCount),
    }));

    // By reason
    const [byReason] = await conn.query<any[]>(`
      SELECT
        COALESCE(reason, 'other') AS reason,
        COUNT(*) AS entryCount,
        SUM(totalCost) AS totalCost
      FROM waste_log
      WHERE DATE(wasteDate) BETWEEN ? AND ?
      GROUP BY reason
      ORDER BY totalCost DESC
    `, [fromDate, toDate]);
    const byReasonMapped: WasteByReason[] = (byReason as any[]).map((r: any) => ({
      reason: REASON_LABELS[r.reason] || r.reason,
      entryCount: parseInt(r.entryCount),
      totalCost: parseFloat(r.totalCost),
      pctOfTotal: Math.round((parseFloat(r.totalCost) / totalCostVal) * 1000) / 10,
    }));

    // Waste vs purchases (same period)
    const [wvp] = await conn.query<any[]>(`
      SELECT
        m.id AS materialId,
        m.name AS materialName,
        m.nameAr AS materialNameAr,
        m.unit,
        COALESCE(p.purchaseQty, 0)   AS purchaseQty,
        COALESCE(wq.wasteQty, 0)     AS wasteQty,
        COALESCE(p.purchaseCost, 0)  AS purchaseCost,
        COALESCE(wq.wasteCost, 0)    AS wasteCost
      FROM raw_materials m
      JOIN (
        SELECT materialId, SUM(quantity) AS wasteQty, SUM(totalCost) AS wasteCost
        FROM waste_log WHERE DATE(wasteDate) BETWEEN ? AND ?
        GROUP BY materialId
      ) wq ON wq.materialId = m.id
      LEFT JOIN (
        SELECT materialId, SUM(quantity) AS purchaseQty, SUM(quantity * COALESCE(unitPrice,0)) AS purchaseCost
        FROM inventory_transactions
        WHERE transactionType = 'IN' AND DATE(transactionDate) BETWEEN ? AND ?
        GROUP BY materialId
      ) p ON p.materialId = m.id
      ORDER BY wasteCost DESC
      LIMIT 15
    `, [fromDate, toDate, fromDate, toDate]);

    const wasteVsPurchase: WasteVsPurchase[] = (wvp as any[]).map((r: any) => {
      const pQty = parseFloat(r.purchaseQty) || 0;
      const wQty = parseFloat(r.wasteQty) || 0;
      return {
        materialId: r.materialId,
        materialName: r.materialName,
        materialNameAr: r.materialNameAr,
        unit: r.unit,
        purchaseQty: pQty,
        wasteQty: wQty,
        wastePct: pQty > 0 ? Math.round((wQty / pQty) * 1000) / 10 : 100,
        purchaseCost: parseFloat(r.purchaseCost),
        wasteCost: parseFloat(r.wasteCost),
      };
    });

    // Week comparison
    const todayStr = new Date().toISOString().split("T")[0];
    const thisWeekStart = new Date(); thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const prevWeekStart = new Date(); prevWeekStart.setDate(prevWeekStart.getDate() - 14);
    const [weekRows] = await conn.query<any[]>(`
      SELECT
        SUM(CASE WHEN DATE(wasteDate) >= ? THEN totalCost ELSE 0 END) AS thisWeek,
        SUM(CASE WHEN DATE(wasteDate) < ? AND DATE(wasteDate) >= ? THEN totalCost ELSE 0 END) AS prevWeek
      FROM waste_log
      WHERE DATE(wasteDate) >= ?
    `, [
      thisWeekStart.toISOString().split("T")[0],
      thisWeekStart.toISOString().split("T")[0],
      prevWeekStart.toISOString().split("T")[0],
      prevWeekStart.toISOString().split("T")[0],
    ]);
    const wr = (weekRows as any[])[0];
    const thisW = parseFloat(wr?.thisWeek) || 0;
    const prevW = parseFloat(wr?.prevWeek) || 0;
    const changePct = prevW > 0 ? Math.round(((thisW - prevW) / prevW) * 1000) / 10 : 0;

    // Auto-recommendations
    const recommendations: string[] = [];
    if (topItemsMapped[0]?.pctOfTotalCost > 30) {
      recommendations.push(`⚠️ "${topItemsMapped[0].materialNameAr || topItemsMapped[0].materialName}" يمثّل ${topItemsMapped[0].pctOfTotalCost}% من إجمالي الهدر — راجع كميات الطلب وطريقة التخزين`);
    }
    const expiredReason = byReasonMapped.find(r => r.reason === REASON_LABELS.expired || r.reason === "expired");
    if (expiredReason && expiredReason.pctOfTotal > 20) {
      recommendations.push(`📦 ${expiredReason.pctOfTotal}% من الهدر بسبب انتهاء الصلاحية — فعّل تتبع تواريخ الانتهاء (FEFO) وقلّل كميات الطلب`);
    }
    if (changePct > 20) {
      recommendations.push(`📈 الهدر هذا الأسبوع ارتفع ${changePct}% مقارنة بالأسبوع الماضي — يحتاج تدخلاً فورياً`);
    }
    const highWasteRatio = wasteVsPurchase.filter(w => w.wastePct > 15);
    if (highWasteRatio.length > 0) {
      recommendations.push(`🚨 ${highWasteRatio.length} مواد هدرها يتجاوز 15% من المشتريات: ${highWasteRatio.slice(0, 3).map(w => w.materialNameAr || w.materialName).join("، ")}`);
    }
    if (recommendations.length === 0) {
      recommendations.push("✅ مستويات الهدر ضمن النطاق الطبيعي في هذه الفترة");
    }

    return {
      period: { fromDate, toDate },
      summary: {
        totalWasteCost: parseFloat(s.totalWasteCost) || 0,
        totalWasteQty: parseFloat(s.totalWasteQty) || 0,
        totalEntries: parseInt(s.totalEntries) || 0,
        avgDailyCost: Math.round(((parseFloat(s.totalWasteCost) || 0) / days) * 100) / 100,
        daysWithWaste: parseInt(s.daysWithWaste) || 0,
      },
      topItems: topItemsMapped,
      dailyTrend,
      byReason: byReasonMapped,
      wasteVsPurchase,
      weekComparison: { currentWeekCost: thisW, prevWeekCost: prevW, changePct },
      recommendations,
    };
  } finally {
    await conn.release();
  }
}
