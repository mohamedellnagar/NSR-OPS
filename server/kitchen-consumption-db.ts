/**
 * kitchen-consumption-db.ts
 * Aggregates raw material consumption from:
 *   PRIMARY: kitchen_inventory_counts (actualConsumption = opening + received - closing)
 *   FALLBACK: kitchen_production_materials + kitchen_daily_pulls (raw) + semi_finished pulls expanded via semi_finished_recipes
 */

export interface MaterialConsumptionRow {
  materialId: number;
  materialName: string;
  unit: string;
  totalQty: number;
  totalCost: number;
  unitCost: number;
  source: "inventory" | "production" | "mixed";
}

export interface DailyBreakdownRow {
  date: string;
  materialId: number;
  materialName: string;
  unit: string;
  totalQty: number;
  totalCost: number;
  source: "inventory" | "production";
}

export interface KitchenConsumptionReport {
  fromDate: string;
  toDate: string;
  materials: MaterialConsumptionRow[];
  dailyBreakdown: DailyBreakdownRow[];
  totalCost: number;
  totalDays: number;
  hasInventoryData: boolean;
}

async function getConn() {
  const mysql = await import("mysql2/promise");
  return mysql.createConnection(process.env.DATABASE_URL!);
}

export async function getKitchenConsumptionReport(
  fromDate: string,
  toDate: string
): Promise<KitchenConsumptionReport> {
  const conn = await getConn();
  try {
    // ── 1. From inventory counts (actualConsumption = opening + received - closing) ──
    const [invRows] = await conn.execute<any[]>(`
      SELECT
        kic.countDate AS date,
        kic.materialId,
        kic.materialName,
        kic.unit,
        COALESCE(kic.actualConsumption, 0) AS actualConsumption,
        COALESCE(kic.unitCost, 0) AS unitCost,
        COALESCE(kic.consumptionCost, kic.actualConsumption * kic.unitCost, 0) AS consumptionCost
      FROM kitchen_inventory_counts kic
      WHERE kic.countDate >= ? AND kic.countDate <= ?
        AND kic.closingQty IS NOT NULL
        AND COALESCE(kic.actualConsumption, 0) > 0
      ORDER BY kic.countDate, kic.materialName
    `, [fromDate, toDate]);

    // ── 2. From production materials (fallback for days without inventory count) ──
    const [prodRows] = await conn.execute<any[]>(`
      SELECT
        DATE(kdp.productionDate) AS date,
        kpm.rawMaterialId AS materialId,
        kpm.materialName,
        kpm.unit,
        SUM(kpm.consumedQuantity) AS totalQty,
        COALESCE(rm.lastPurchasePrice, 0) AS unitCost
      FROM kitchen_production_materials kpm
      JOIN kitchen_daily_production kdp ON kpm.productionId = kdp.id
      LEFT JOIN raw_materials rm ON kpm.rawMaterialId = rm.id
      WHERE DATE(kdp.productionDate) >= ? AND DATE(kdp.productionDate) <= ?
      GROUP BY DATE(kdp.productionDate), kpm.rawMaterialId, kpm.materialName, kpm.unit, rm.lastPurchasePrice
    `, [fromDate, toDate]);

    // ── 3. From daily pulls - RAW materials only (fallback) ──
    const [pullRows] = await conn.execute<any[]>(`
      SELECT
        DATE(kdp.pullDate) AS date,
        kdp.materialId,
        kdp.materialName,
        kdp.unit,
        SUM(kdp.pulledQuantity) AS totalQty,
        COALESCE(rm.lastPurchasePrice, 0) AS unitCost
      FROM kitchen_daily_pulls kdp
      LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
      WHERE kdp.materialType = 'raw'
        AND kdp.isCarriedForward = 0
        AND DATE(kdp.pullDate) >= ? AND DATE(kdp.pullDate) <= ?
      GROUP BY DATE(kdp.pullDate), kdp.materialId, kdp.materialName, kdp.unit, rm.lastPurchasePrice
    `, [fromDate, toDate]);

    // ── 4. From daily pulls - SEMI_FINISHED materials expanded via semi_finished_recipes ──
    // Step 4a: Get all semi_finished pulls in the period
    const [sfPullRows] = await conn.execute<any[]>(`
      SELECT
        DATE(kdp.pullDate) AS date,
        kdp.materialId AS sfMaterialId,
        kdp.materialName AS sfMaterialName,
        SUM(kdp.pulledQuantity) AS totalSfQty
      FROM kitchen_daily_pulls kdp
      WHERE kdp.materialType = 'semi_finished'
        AND kdp.isCarriedForward = 0
        AND DATE(kdp.pullDate) >= ? AND DATE(kdp.pullDate) <= ?
      GROUP BY DATE(kdp.pullDate), kdp.materialId, kdp.materialName
    `, [fromDate, toDate]);

    // Step 4b: Get all semi_finished_recipes for the pulled materials
    let sfExpandedRows: Array<{
      date: string;
      materialId: number;
      materialName: string;
      unit: string;
      totalQty: number;
      unitCost: number;
    }> = [];

    if (sfPullRows.length > 0) {
      const sfMaterialIdsSet = new Set<number>(sfPullRows.map((r: any) => Number(r.sfMaterialId)));
      const sfMaterialIds = Array.from(sfMaterialIdsSet);
      const placeholders = sfMaterialIds.map(() => '?').join(',');
      
      const [sfRecipes] = await conn.execute<any[]>(`
        SELECT 
          sfr.materialId AS sfId,
          sfr.ingredientId AS rawId,
          rm.name AS rawName,
          rm.unit AS rawUnit,
          sfr.quantity AS qtyPerUnit,
          COALESCE(rm.lastPurchasePrice, 0) AS unitCost
        FROM semi_finished_recipes sfr
        JOIN raw_materials rm ON sfr.ingredientId = rm.id
        WHERE sfr.materialId IN (${placeholders})
      `, sfMaterialIds);

      // Build a map: sfMaterialId -> list of raw ingredients
      const sfRecipeMap = new Map<number, Array<{rawId: number; rawName: string; rawUnit: string; qtyPerUnit: number; unitCost: number}>>();
      for (const recipe of sfRecipes) {
        const sfId = Number(recipe.sfId);
        if (!sfRecipeMap.has(sfId)) sfRecipeMap.set(sfId, []);
        sfRecipeMap.get(sfId)!.push({
          rawId: Number(recipe.rawId),
          rawName: recipe.rawName,
          rawUnit: recipe.rawUnit,
          qtyPerUnit: Number(recipe.qtyPerUnit),
          unitCost: Number(recipe.unitCost),
        });
      }

      // Expand each sf pull into raw material consumption
      for (const sfPull of sfPullRows) {
        const dateStr = sfPull.date instanceof Date ? sfPull.date.toISOString().slice(0, 10) : String(sfPull.date);
        const sfId = Number(sfPull.sfMaterialId);
        const sfQty = Number(sfPull.totalSfQty);
        const ingredients = sfRecipeMap.get(sfId) || [];

        for (const ing of ingredients) {
          const rawQty = sfQty * ing.qtyPerUnit;
          sfExpandedRows.push({
            date: dateStr,
            materialId: ing.rawId,
            materialName: ing.rawName,
            unit: ing.rawUnit,
            totalQty: rawQty,
            unitCost: ing.unitCost,
          });
        }
      }
    }

    // ── Determine which dates have inventory count data ──
    const invDates = new Set<string>(
      invRows.map((r: any) => r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date))
    );
    const hasInventoryData = invDates.size > 0;

    // ── Build daily breakdown ──
    type DailyKey = string; // "YYYY-MM-DD__materialId"
    const dailyMap = new Map<DailyKey, DailyBreakdownRow>();

    // Add inventory count rows first (highest priority)
    for (const row of invRows) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
      const key = `${dateStr}__${row.materialId}`;
      const qty = Number(row.actualConsumption ?? 0);
      const unitCost = Number(row.unitCost ?? 0);
      const cost = Number(row.consumptionCost ?? qty * unitCost);
      dailyMap.set(key, {
        date: dateStr,
        materialId: Number(row.materialId),
        materialName: row.materialName,
        unit: row.unit,
        totalQty: qty,
        totalCost: cost,
        source: "inventory",
      });
    }

    // Helper to add fallback rows (only for dates without inventory count)
    const addFallbackRow = (dateStr: string, materialId: number, materialName: string, unit: string, qty: number, unitCost: number) => {
      if (invDates.has(dateStr)) return; // skip — inventory count takes priority
      const key = `${dateStr}__${materialId}`;
      const cost = qty * unitCost;
      if (dailyMap.has(key)) {
        const ex = dailyMap.get(key)!;
        ex.totalQty += qty;
        ex.totalCost += cost;
      } else {
        dailyMap.set(key, {
          date: dateStr,
          materialId,
          materialName,
          unit,
          totalQty: qty,
          totalCost: cost,
          source: "production",
        });
      }
    }

    // Add production rows for dates WITHOUT inventory count
    for (const row of prodRows) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
      addFallbackRow(dateStr, Number(row.materialId), row.materialName, row.unit, Number(row.totalQty ?? 0), Number(row.unitCost ?? 0));
    }

    // Add raw pull rows for dates WITHOUT inventory count
    for (const row of pullRows) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date);
      addFallbackRow(dateStr, Number(row.materialId), row.materialName, row.unit, Number(row.totalQty ?? 0), Number(row.unitCost ?? 0));
    }

    // Add semi_finished expanded rows for dates WITHOUT inventory count
    for (const row of sfExpandedRows) {
      addFallbackRow(row.date, row.materialId, row.materialName, row.unit, row.totalQty, row.unitCost);
    }

    const dailyBreakdown = Array.from(dailyMap.values())
      .filter(r => r.totalQty > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || b.totalCost - a.totalCost);

    // ── Aggregate materials ──
    const materialsMap = new Map<number, MaterialConsumptionRow>();
    for (const row of dailyBreakdown) {
      const id = row.materialId;
      if (materialsMap.has(id)) {
        const ex = materialsMap.get(id)!;
        ex.totalQty += row.totalQty;
        ex.totalCost += row.totalCost;
        if (ex.source !== row.source) ex.source = "mixed";
      } else {
        materialsMap.set(id, {
          materialId: id,
          materialName: row.materialName,
          unit: row.unit,
          totalQty: row.totalQty,
          totalCost: row.totalCost,
          unitCost: row.totalQty > 0 ? row.totalCost / row.totalQty : 0,
          source: row.source,
        });
      }
    }

    const materials = Array.from(materialsMap.values())
      .filter(m => m.totalQty > 0)
      .sort((a, b) => b.totalCost - a.totalCost);

    const totalCost = materials.reduce((s, m) => s + m.totalCost, 0);

    const uniqueDays = new Set(dailyBreakdown.map(r => r.date));

    return {
      fromDate,
      toDate,
      materials,
      dailyBreakdown,
      totalCost,
      totalDays: uniqueDays.size,
      hasInventoryData,
    };
  } finally {
    await conn.end();
  }
}
