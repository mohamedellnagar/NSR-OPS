/**
 * Inventory Intelligence — Days-of-Stock forecasting + Smart Order Sheet
 * Uses last 30 days of OUT transactions to calculate average daily consumption.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function getConn() {
  return mysql.createConnection({ uri: process.env.DATABASE_URL });
}

export interface DaysOfStockItem {
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  currentQuantity: number;
  minimumQuantity: number;
  avgDailyConsumption: number;     // avg units consumed per day (last 30 days)
  daysOfStock: number | null;       // null = no consumption data
  urgency: "critical" | "warning" | "ok" | "surplus" | "no_data";
  reorderQuantity: number;
  lastSupplierName: string | null;
  lastPurchasePrice: number | null;
  categoryName: string | null;
}

export interface SmartOrderItem {
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  currentQuantity: number;
  avgDailyConsumption: number;
  daysOfStock: number | null;
  suggestedOrderQty: number;        // cover 14-day target
  estimatedCost: number | null;
  lastSupplierName: string | null;
  lastSupplierId: number | null;
  lastPurchasePrice: number | null;
  urgency: "critical" | "warning" | "ok";
}

export interface SmartOrderSheet {
  generatedAt: string;
  coverDays: number;
  totalEstimatedCost: number;
  items: SmartOrderItem[];
  bySupplier: Record<string, SmartOrderItem[]>;
}

const COVER_DAYS = 14; // target stock coverage

export async function getDaysOfStock(): Promise<DaysOfStockItem[]> {
  const conn = await getConn();
  try {
    // Avg daily consumption = total OUT qty in last 30 days / 30
    const [consumption] = await conn.query<any[]>(`
      SELECT
        t.materialId,
        SUM(t.quantity) / 30.0 AS avgDailyConsumption
      FROM inventory_transactions t
      WHERE t.transactionType = 'OUT'
        AND t.transactionDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY t.materialId
    `);
    const consumptionMap: Record<number, number> = {};
    for (const row of consumption as any[]) {
      consumptionMap[row.materialId] = parseFloat(row.avgDailyConsumption) || 0;
    }

    // All active materials
    const [materials] = await conn.query<any[]>(`
      SELECT
        m.id, m.name, m.nameAr, m.unit,
        m.currentQuantity, m.minimumQuantity, m.reorderQuantity,
        m.lastPurchasePrice,
        c.name AS categoryName,
        s.name AS lastSupplierName
      FROM raw_materials m
      LEFT JOIN material_categories c ON c.id = m.categoryId
      LEFT JOIN (
        SELECT t2.materialId, sup.name
        FROM inventory_transactions t2
        JOIN suppliers sup ON sup.id = t2.supplierId
        WHERE t2.transactionType = 'IN' AND t2.supplierId IS NOT NULL
        ORDER BY t2.createdAt DESC
        LIMIT 1000
      ) s ON s.materialId = m.id
      WHERE m.isActive = 1
      ORDER BY m.nameAr, m.name
    `);

    return (materials as any[]).map((m: any) => {
      const current = parseFloat(m.currentQuantity) || 0;
      const minimum = parseFloat(m.minimumQuantity) || 0;
      const reorder = parseFloat(m.reorderQuantity) || 0;
      const avgDaily = consumptionMap[m.id] || 0;

      let daysOfStock: number | null = null;
      let urgency: DaysOfStockItem["urgency"] = "no_data";

      if (avgDaily > 0) {
        daysOfStock = current / avgDaily;
        if (daysOfStock < 3) urgency = "critical";
        else if (daysOfStock < 7) urgency = "warning";
        else if (daysOfStock < 30) urgency = "ok";
        else urgency = "surplus";
      } else {
        // No consumption in 30 days
        if (current <= minimum) urgency = "warning";
        else urgency = "no_data";
      }

      return {
        materialId: m.id,
        materialName: m.name,
        materialNameAr: m.nameAr,
        unit: m.unit,
        currentQuantity: current,
        minimumQuantity: minimum,
        avgDailyConsumption: avgDaily,
        daysOfStock: daysOfStock !== null ? Math.round(daysOfStock * 10) / 10 : null,
        urgency,
        reorderQuantity: reorder,
        lastSupplierName: m.lastSupplierName || null,
        lastPurchasePrice: m.lastPurchasePrice ? parseFloat(m.lastPurchasePrice) : null,
        categoryName: m.categoryName || null,
      };
    });
  } finally {
    await conn.end();
  }
}

export async function generateSmartOrderSheet(coverDays: number = COVER_DAYS): Promise<SmartOrderSheet> {
  const conn = await getConn();
  try {
    // Same consumption calculation
    const [consumption] = await conn.query<any[]>(`
      SELECT t.materialId, SUM(t.quantity) / 30.0 AS avgDailyConsumption
      FROM inventory_transactions t
      WHERE t.transactionType = 'OUT'
        AND t.transactionDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY t.materialId
    `);
    const consumptionMap: Record<number, number> = {};
    for (const row of consumption as any[]) {
      consumptionMap[row.materialId] = parseFloat(row.avgDailyConsumption) || 0;
    }

    // Materials that need ordering (days_of_stock < coverDays OR below minimum)
    const [materials] = await conn.query<any[]>(`
      SELECT
        m.id, m.name, m.nameAr, m.unit,
        m.currentQuantity, m.minimumQuantity, m.reorderQuantity,
        m.lastPurchasePrice,
        s.id AS lastSupplierId,
        s.name AS lastSupplierName
      FROM raw_materials m
      LEFT JOIN (
        SELECT DISTINCT t2.materialId,
          FIRST_VALUE(t2.supplierId) OVER (PARTITION BY t2.materialId ORDER BY t2.createdAt DESC) AS supplierId
        FROM inventory_transactions t2
        WHERE t2.transactionType = 'IN' AND t2.supplierId IS NOT NULL
      ) ls ON ls.materialId = m.id
      LEFT JOIN suppliers s ON s.id = ls.supplierId
      WHERE m.isActive = 1
    `);

    const items: SmartOrderItem[] = [];
    for (const m of materials as any[]) {
      const current = parseFloat(m.currentQuantity) || 0;
      const avgDaily = consumptionMap[m.id] || 0;
      const minimum = parseFloat(m.minimumQuantity) || 0;
      const lastPrice = m.lastPurchasePrice ? parseFloat(m.lastPurchasePrice) : null;

      let daysOfStock: number | null = avgDaily > 0 ? current / avgDaily : null;

      // Include if: low days of stock OR below minimum
      const needsOrder = (daysOfStock !== null && daysOfStock < coverDays) ||
                         (current <= minimum && minimum > 0);

      if (!needsOrder) continue;

      // How much to order: enough to cover coverDays from today
      const targetQty = avgDaily > 0 ? avgDaily * coverDays : minimum * 3;
      const suggestedOrderQty = Math.max(0, targetQty - current);
      if (suggestedOrderQty <= 0.001) continue;

      let urgency: SmartOrderItem["urgency"] = "ok";
      if (daysOfStock !== null && daysOfStock < 3) urgency = "critical";
      else if (daysOfStock !== null && daysOfStock < 7) urgency = "warning";
      else if (current <= minimum) urgency = "warning";

      items.push({
        materialId: m.id,
        materialName: m.name,
        materialNameAr: m.nameAr,
        unit: m.unit,
        currentQuantity: current,
        avgDailyConsumption: avgDaily,
        daysOfStock: daysOfStock !== null ? Math.round(daysOfStock * 10) / 10 : null,
        suggestedOrderQty: Math.round(suggestedOrderQty * 1000) / 1000,
        estimatedCost: lastPrice ? Math.round(lastPrice * suggestedOrderQty * 100) / 100 : null,
        lastSupplierName: m.lastSupplierName || null,
        lastSupplierId: m.lastSupplierId ? parseInt(m.lastSupplierId) : null,
        lastPurchasePrice: lastPrice,
        urgency,
      });
    }

    // Sort: critical first, then warning, then ok
    const urgencyOrder = { critical: 0, warning: 1, ok: 2 };
    items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    // Group by supplier
    const bySupplier: Record<string, SmartOrderItem[]> = {};
    for (const item of items) {
      const key = item.lastSupplierName || "بدون مورد محدد";
      if (!bySupplier[key]) bySupplier[key] = [];
      bySupplier[key].push(item);
    }

    const totalEstimatedCost = items.reduce((s, i) => s + (i.estimatedCost ?? 0), 0);

    return {
      generatedAt: new Date().toISOString(),
      coverDays,
      totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
      items,
      bySupplier,
    };
  } finally {
    await conn.end();
  }
}
