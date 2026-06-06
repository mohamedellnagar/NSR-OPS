/**
 * supplier-items-db.ts
 * Aggregates invoice items from supplier invoices with date + supplier filters.
 */

export interface SupplierItemRow {
  materialId: number;
  materialName: string;
  unit: string;
  totalQty: number;
  totalCost: number;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  invoiceCount: number;
}

export interface SupplierInvoiceDetail {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  supplierName: string;
  materialId: number;
  materialName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface SupplierItemsReport {
  fromDate: string;
  toDate: string;
  supplierId: number | null;
  supplierName: string | null;
  materials: SupplierItemRow[];
  invoiceDetails: SupplierInvoiceDetail[];
  totalCost: number;
  totalQty: number;
  invoiceCount: number;
  supplierList: { id: number; name: string }[];
}

async function getConn() {
  const mysql = await import("mysql2/promise");
  return mysql.createConnection(process.env.DATABASE_URL!);
}

export async function getSupplierItemsReport(
  fromDate: string,
  toDate: string,
  supplierId?: number | null
): Promise<SupplierItemsReport> {
  const conn = await getConn();
  try {
    // ── 1. Get supplier list for filter dropdown ──
    const [supplierRows] = await conn.execute<any[]>(`
      SELECT DISTINCT
        COALESCE(i.supplierId, 0) AS id,
        COALESCE(s.name, i.supplierName, 'غير محدد') AS name
      FROM invoices i
      LEFT JOIN suppliers s ON i.supplierId = s.id
      WHERE DATE(i.invoiceDate) >= ? AND DATE(i.invoiceDate) <= ?
      ORDER BY name
    `, [fromDate, toDate]);

    const supplierList = supplierRows
      .filter((r: any) => r.id > 0)
      .map((r: any) => ({ id: Number(r.id), name: String(r.name) }));

    // ── 2. Build WHERE clause ──
    const params: any[] = [fromDate, toDate];
    let supplierWhere = "";
    if (supplierId && supplierId > 0) {
      supplierWhere = " AND i.supplierId = ?";
      params.push(supplierId);
    }

    // ── 3. Aggregated materials summary ──
    const [matRows] = await conn.execute<any[]>(`
      SELECT
        ii.materialId,
        MIN(ii.materialName) AS materialName,
        MIN(ii.materialUnit) AS unit,
        SUM(CAST(ii.quantity AS DECIMAL(14,3))) AS totalQty,
        SUM(CAST(ii.totalPrice AS DECIMAL(14,3))) AS totalCost,
        AVG(CAST(ii.unitPrice AS DECIMAL(14,3))) AS avgUnitPrice,
        MIN(CAST(ii.unitPrice AS DECIMAL(14,3))) AS minUnitPrice,
        MAX(CAST(ii.unitPrice AS DECIMAL(14,3))) AS maxUnitPrice,
        COUNT(DISTINCT i.id) AS invoiceCount
      FROM invoice_items ii
      JOIN invoices i ON ii.invoiceId = i.id
      WHERE DATE(i.invoiceDate) >= ? AND DATE(i.invoiceDate) <= ?
      ${supplierWhere}
      GROUP BY ii.materialId
      ORDER BY totalCost DESC
    `, params);

    // ── 4. Detailed invoice lines ──
    const [detailRows] = await conn.execute<any[]>(`
      SELECT
        i.id AS invoiceId,
        i.invoiceNumber,
        DATE(i.invoiceDate) AS invoiceDate,
        COALESCE(s.name, i.supplierName, 'غير محدد') AS supplierName,
        ii.materialId,
        ii.materialName,
        ii.materialUnit AS unit,
        CAST(ii.quantity AS DECIMAL(14,3)) AS quantity,
        CAST(ii.unitPrice AS DECIMAL(14,3)) AS unitPrice,
        CAST(ii.totalPrice AS DECIMAL(14,3)) AS totalPrice
      FROM invoice_items ii
      JOIN invoices i ON ii.invoiceId = i.id
      LEFT JOIN suppliers s ON i.supplierId = s.id
      WHERE DATE(i.invoiceDate) >= ? AND DATE(i.invoiceDate) <= ?
      ${supplierWhere}
      ORDER BY i.invoiceDate DESC, i.id DESC, ii.materialName
    `, params);

    // ── 5. Invoice count ──
    const [cntRows] = await conn.execute<any[]>(`
      SELECT COUNT(DISTINCT i.id) AS cnt
      FROM invoices i
      JOIN invoice_items ii ON ii.invoiceId = i.id
      WHERE DATE(i.invoiceDate) >= ? AND DATE(i.invoiceDate) <= ?
      ${supplierWhere}
    `, params);

    const materials: SupplierItemRow[] = matRows.map((r: any) => ({
      materialId: Number(r.materialId),
      materialName: String(r.materialName),
      unit: String(r.unit),
      totalQty: Number(r.totalQty ?? 0),
      totalCost: Number(r.totalCost ?? 0),
      avgUnitPrice: Number(r.avgUnitPrice ?? 0),
      minUnitPrice: Number(r.minUnitPrice ?? 0),
      maxUnitPrice: Number(r.maxUnitPrice ?? 0),
      invoiceCount: Number(r.invoiceCount ?? 0),
    }));

    const invoiceDetails: SupplierInvoiceDetail[] = detailRows.map((r: any) => ({
      invoiceId: Number(r.invoiceId),
      invoiceNumber: String(r.invoiceNumber),
      invoiceDate: r.invoiceDate instanceof Date
        ? r.invoiceDate.toISOString().slice(0, 10)
        : String(r.invoiceDate),
      supplierName: String(r.supplierName),
      materialId: Number(r.materialId),
      materialName: String(r.materialName),
      unit: String(r.unit),
      quantity: Number(r.quantity ?? 0),
      unitPrice: Number(r.unitPrice ?? 0),
      totalPrice: Number(r.totalPrice ?? 0),
    }));

    const totalCost = materials.reduce((s, m) => s + m.totalCost, 0);
    const totalQty = materials.reduce((s, m) => s + m.totalQty, 0);
    const invoiceCount = Number((cntRows[0] as any)?.cnt ?? 0);

    // Resolve supplier name
    let resolvedSupplierName: string | null = null;
    if (supplierId && supplierId > 0) {
      resolvedSupplierName = supplierList.find(s => s.id === supplierId)?.name ?? null;
    }

    return {
      fromDate,
      toDate,
      supplierId: supplierId ?? null,
      supplierName: resolvedSupplierName,
      materials,
      invoiceDetails,
      totalCost,
      totalQty,
      invoiceCount,
      supplierList,
    };
  } finally {
    await conn.end();
  }
}
