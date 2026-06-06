import ExcelJS from "exceljs";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = String(dt.getMonth() + 1).padStart(2, "0");
  const yr = dt.getFullYear();
  return `${day}/${mon}/${yr}`;
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const day = String(dt.getDate()).padStart(2, "0");
  const mon = String(dt.getMonth() + 1).padStart(2, "0");
  const yr = dt.getFullYear();
  const hr = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${day}/${mon}/${yr} ${hr}:${min}`;
}

function num(v: unknown): number {
  return parseFloat(String(v ?? "0")) || 0;
}

function statusLabel(s: string): string {
  if (s === "paid") return "مدفوع";
  if (s === "deferred") return "مؤجل";
  if (s === "partial") return "جزئي";
  if (s === "under_review") return "التدقيق";
  return s;
}

function expenseCategoryLabel(c: string | null | undefined): string {
  if (c === "operational") return "تشغيلية";
  if (c === "maintenance") return "صيانة ومعدات";
  if (c === "fixed") return "ثابتة";
  if (c === "other") return "أخرى";
  return c ?? "";
}

function supplierTypeLabel(t: string | null | undefined): string {
  if (t === "supplier") return "مورد";
  if (t === "service") return "خدمة";
  return t ?? "";
}

// ─── Style helpers ────────────────────────────────────────────────────────────
function applyHeaderStyle(row: ExcelJS.Row, bgColor: string) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  row.height = 28;
}

function applyDataStyle(cell: ExcelJS.Cell, isAlt: boolean) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: isAlt ? "FFF5F5F5" : "FFFFFFFF" },
  };
  cell.border = {
    top: { style: "hair" },
    left: { style: "hair" },
    bottom: { style: "hair" },
    right: { style: "hair" },
  };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

// ─── DB fetch helpers ─────────────────────────────────────────────────────────
async function fetchWithRetry<T>(fn: (conn: import("mysql2/promise").Connection) => Promise<T>): Promise<T> {
  const mysql = await import("mysql2/promise");
  let conn: import("mysql2/promise").Connection | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      conn = await mysql.createConnection(process.env.DATABASE_URL!);
      break;
    } catch (err: unknown) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  if (!conn) throw new Error("Failed to connect to database");
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

// ─── Main export function ─────────────────────────────────────────────────────
export async function generateInvoicesExcel(filters: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}): Promise<Buffer> {
  // ── Fetch data from DB ─────────────────────────────────────────────────────
  const { allInvoices, allFreeInvoices } = await fetchWithRetry(async (conn) => {
    // Build WHERE clauses
    const invConditions: string[] = [];
    const invParams: unknown[] = [];
    if (filters.dateFrom) {
      invConditions.push("invoiceDate >= ?");
      invParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      invConditions.push("invoiceDate <= ?");
      invParams.push(filters.dateTo + " 23:59:59");
    }
    if (filters.status && filters.status !== "all") {
      invConditions.push("paymentStatus = ?");
      invParams.push(filters.status);
    }
    const invWhere = invConditions.length > 0 ? `WHERE ${invConditions.join(" AND ")}` : "";

    const [invoicesRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
      `SELECT invoiceNumber, supplierName, invoiceDate, totalAmount, paymentStatus, paidAmount, remainingAmount, paidAt, notes FROM invoices ${invWhere} ORDER BY invoiceDate DESC`,
      invParams
    );

    // Free invoices
    const freeConditions: string[] = [];
    const freeParams: unknown[] = [];
    if (filters.dateFrom) {
      freeConditions.push("date >= ?");
      freeParams.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      freeConditions.push("date <= ?");
      freeParams.push(filters.dateTo + " 23:59:59");
    }
    if (filters.status && filters.status !== "all") {
      freeConditions.push("paymentStatus = ?");
      freeParams.push(filters.status);
    }
    const freeWhere = freeConditions.length > 0 ? `WHERE ${freeConditions.join(" AND ")}` : "";

    const [freeRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
      `SELECT invoiceNumber, supplierName, supplierType, date, expenseCategory, totalAmount, paymentStatus, paidAmount, remainingAmount, paidAt, notes FROM free_invoices ${freeWhere} ORDER BY date DESC`,
      freeParams
    );

    return {
      allInvoices: invoicesRows,
      allFreeInvoices: freeRows,
    };
  });

  // ── Build workbook ─────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "منصة مطعمي";
  wb.created = new Date();

  // ═══════════════════════════════════════════════════════════════════════════
  // Sheet 1: فواتير الموردين
  // ═══════════════════════════════════════════════════════════════════════════
  const wsSupplier = wb.addWorksheet("فواتير الموردين", {
    views: [{ rightToLeft: true }],
    properties: { tabColor: { argb: "FF1E40AF" } },
  });

  wsSupplier.columns = [
    { key: "c1", width: 20 },
    { key: "c2", width: 26 },
    { key: "c3", width: 14 },
    { key: "c4", width: 14 },
    { key: "c5", width: 14 },
    { key: "c6", width: 14 },
    { key: "c7", width: 14 },
    { key: "c8", width: 20 },
    { key: "c9", width: 28 },
  ];

  const supplierHeader = wsSupplier.addRow([
    "رقم الفاتورة",
    "المورد",
    "تاريخ الفاتورة",
    "الإجمالي",
    "المدفوع",
    "المتبقي",
    "حالة الدفع",
    "تاريخ الدفع",
    "ملاحظات",
  ]);
  applyHeaderStyle(supplierHeader, "FF1E40AF");

  let rowIdx = 0;
  for (const inv of allInvoices) {
    const remaining = num(inv.remainingAmount) > 0 ? num(inv.remainingAmount) : (num(inv.totalAmount) - num(inv.paidAmount));
    const r = wsSupplier.addRow([
      inv.invoiceNumber ?? "",
      inv.supplierName ?? "",
      formatDate(inv.invoiceDate),
      num(inv.totalAmount),
      num(inv.paidAmount),
      remaining > 0 ? remaining : 0,
      statusLabel(inv.paymentStatus),
      formatDateTime(inv.paidAt),
      inv.notes ?? "",
    ]);
    r.eachCell((c) => applyDataStyle(c, rowIdx % 2 === 1));
    rowIdx++;
  }

  // Summary row
  const totalSupplier = allInvoices.reduce((s, i) => s + num(i.totalAmount), 0);
  const paidSupplier = allInvoices.reduce((s, i) => s + num(i.paidAmount), 0);
  const pendingSupplier = allInvoices.reduce((s, i) => {
    const rem = num(i.remainingAmount) > 0 ? num(i.remainingAmount) : (num(i.totalAmount) - num(i.paidAmount));
    return s + (rem > 0 ? rem : 0);
  }, 0);

  wsSupplier.addRow([]);
  const summaryRow = wsSupplier.addRow([
    `إجمالي الفواتير: ${allInvoices.length}`,
    "",
    "",
    `الإجمالي: ${totalSupplier.toFixed(2)} د.إ`,
    `مدفوع: ${paidSupplier.toFixed(2)} د.إ`,
    `معلق: ${pendingSupplier.toFixed(2)} د.إ`,
    "", "", "",
  ]);
  summaryRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FD" } };
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "medium" }, bottom: { style: "medium" } };
  });
  summaryRow.height = 24;

  // ═══════════════════════════════════════════════════════════════════════════
  // Sheet 2: الفواتير الحرة
  // ═══════════════════════════════════════════════════════════════════════════
  const wsFree = wb.addWorksheet("الفواتير الحرة", {
    views: [{ rightToLeft: true }],
    properties: { tabColor: { argb: "FF065F46" } },
  });

  wsFree.columns = [
    { key: "c1", width: 20 },
    { key: "c2", width: 26 },
    { key: "c3", width: 14 },
    { key: "c4", width: 16 },
    { key: "c5", width: 14 },
    { key: "c6", width: 14 },
    { key: "c7", width: 14 },
    { key: "c8", width: 14 },
    { key: "c9", width: 20 },
    { key: "c10", width: 28 },
  ];

  const freeHeader = wsFree.addRow([
    "رقم الفاتورة",
    "المورد / الجهة",
    "تاريخ الفاتورة",
    "تصنيف المصروف",
    "الإجمالي",
    "المدفوع",
    "المتبقي",
    "حالة الدفع",
    "تاريخ الدفع",
    "ملاحظات",
  ]);
  applyHeaderStyle(freeHeader, "FF065F46");

  let freeRowIdx = 0;
  for (const inv of allFreeInvoices) {
    const remaining = num(inv.remainingAmount) > 0 ? num(inv.remainingAmount) : (num(inv.totalAmount) - num(inv.paidAmount));
    const r = wsFree.addRow([
      inv.invoiceNumber ?? "",
      inv.supplierName ?? "",
      formatDate(inv.date),
      expenseCategoryLabel(inv.expenseCategory),
      num(inv.totalAmount),
      num(inv.paidAmount),
      remaining > 0 ? remaining : 0,
      statusLabel(inv.paymentStatus),
      formatDateTime(inv.paidAt),
      inv.notes ?? "",
    ]);
    r.eachCell((c) => applyDataStyle(c, freeRowIdx % 2 === 1));
    freeRowIdx++;
  }

  const totalFree = allFreeInvoices.reduce((s, i) => s + num(i.totalAmount), 0);
  const paidFree = allFreeInvoices.reduce((s, i) => s + num(i.paidAmount), 0);
  const pendingFree = allFreeInvoices.reduce((s, i) => {
    const rem = num(i.remainingAmount) > 0 ? num(i.remainingAmount) : (num(i.totalAmount) - num(i.paidAmount));
    return s + (rem > 0 ? rem : 0);
  }, 0);

  wsFree.addRow([]);
  const freeSummaryRow = wsFree.addRow([
    `إجمالي الفواتير: ${allFreeInvoices.length}`,
    "", "",
    "",
    `الإجمالي: ${totalFree.toFixed(2)} د.إ`,
    `مدفوع: ${paidFree.toFixed(2)} د.إ`,
    `معلق: ${pendingFree.toFixed(2)} د.إ`,
    "", "", "",
  ]);
  freeSummaryRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4F1" } };
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "medium" }, bottom: { style: "medium" } };
  });
  freeSummaryRow.height = 24;

  // ═══════════════════════════════════════════════════════════════════════════
  // Sheet 3: ملخص إجمالي
  // ═══════════════════════════════════════════════════════════════════════════
  const wsSummary = wb.addWorksheet("ملخص إجمالي", {
    views: [{ rightToLeft: true }],
    properties: { tabColor: { argb: "FF7C3AED" } },
  });

  wsSummary.columns = [
    { key: "label", width: 32 },
    { key: "value", width: 24 },
  ];

  const titleRow = wsSummary.addRow(["ملخص الفواتير الإجمالي", ""]);
  wsSummary.mergeCells("A1:B1");
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: "FF7C3AED" } };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 40;

  wsSummary.addRow([]);

  const addSummaryRow = (label: string, value: string, bold = false, bgArgb?: string) => {
    const r = wsSummary.addRow([label, value]);
    r.getCell(1).font = { bold, size: 12 };
    r.getCell(2).font = { bold, size: 12 };
    r.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
    r.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    if (bgArgb) {
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
      r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
    }
    r.getCell(1).border = { bottom: { style: "hair" }, right: { style: "hair" } };
    r.getCell(2).border = { bottom: { style: "hair" }, left: { style: "hair" } };
    r.height = 22;
  };

  addSummaryRow("── فواتير الموردين ──", "", true, "FFE8F4FD");
  addSummaryRow("عدد الفواتير", `${allInvoices.length}`);
  addSummaryRow("إجمالي المبالغ", `${totalSupplier.toFixed(2)} د.إ`);
  addSummaryRow("إجمالي المدفوع", `${paidSupplier.toFixed(2)} د.إ`);
  addSummaryRow("إجمالي المعلق", `${pendingSupplier.toFixed(2)} د.إ`);

  wsSummary.addRow([]);

  addSummaryRow("── الفواتير الحرة ──", "", true, "FFE6F4F1");
  addSummaryRow("عدد الفواتير", `${allFreeInvoices.length}`);
  addSummaryRow("إجمالي المبالغ", `${totalFree.toFixed(2)} د.إ`);
  addSummaryRow("إجمالي المدفوع", `${paidFree.toFixed(2)} د.إ`);
  addSummaryRow("إجمالي المعلق", `${pendingFree.toFixed(2)} د.إ`);

  wsSummary.addRow([]);

  const grandTotal = totalSupplier + totalFree;
  const grandPaid = paidSupplier + paidFree;
  const grandPending = pendingSupplier + pendingFree;

  addSummaryRow("── الإجمالي الكلي ──", "", true, "FFEDE9FE");
  addSummaryRow("إجمالي جميع الفواتير", `${allInvoices.length + allFreeInvoices.length}`, true);
  addSummaryRow("إجمالي المبالغ الكلي", `${grandTotal.toFixed(2)} د.إ`, true);
  addSummaryRow("إجمالي المدفوع الكلي", `${grandPaid.toFixed(2)} د.إ`, true);
  addSummaryRow("إجمالي المعلق الكلي", `${grandPending.toFixed(2)} د.إ`, true);

  // ── Export ─────────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
