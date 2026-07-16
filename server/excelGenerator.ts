import ExcelJS from "exceljs";

import { getConn } from "./pool";
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
      conn = await getConn();
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
    await conn.release();
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

// ─── Daily accounts (monthly) with invoice detail sheets ──────────────────────
export async function generateDailyAccountsExcel(
  year: number,
  month: number
): Promise<Buffer> {
  const { getDailyAccounts, getMonthExpenses } = await import("./db");
  const accounts = await getDailyAccounts({ year, month });
  const monthExpenses = await getMonthExpenses(year, month);

  const wb = new ExcelJS.Workbook();
  wb.creator = "منصة مطعمي";
  wb.created = new Date();

  // ═══ Sheet 1: الحسابات اليومية ═══
  const ws = wb.addWorksheet("الحسابات اليومية", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    properties: { tabColor: { argb: "FF4F46E5" } },
  });
  ws.columns = [
    { key: "date", width: 13 }, { key: "carry", width: 12 },
    { key: "cash", width: 11 }, { key: "card", width: 11 }, { key: "kita", width: 11 },
    { key: "orders", width: 11 }, { key: "careem", width: 11 }, { key: "deliveroo", width: 11 },
    { key: "noon", width: 11 }, { key: "totalSales", width: 14 },
    { key: "op", width: 13 }, { key: "maint", width: 13 }, { key: "fixed", width: 12 }, { key: "totalExp", width: 14 },
    { key: "supRest", width: 13 }, { key: "supMgmt", width: 13 }, { key: "supExtra", width: 12 }, { key: "supTotal", width: 14 },
    { key: "net", width: 14 }, { key: "staff", width: 12 }, { key: "foodCost", width: 12 },
  ];
  const header = ws.addRow([
    "التاريخ", "المرحّل",
    "نقدي", "بطاقة", "كيتا", "طلبات", "كريم", "ديلفروا", "نون", "إجمالي المبيعات",
    "مصروفات تشغيلية", "معدات وصيانة", "ثابتة", "إجمالي المصروفات",
    "توريد للمطعم", "توريد للإدارة", "توريد إضافي", "إجمالي التوريدات",
    "الصافي", "أكل الأصناف", "% فود كوست",
  ]);
  applyHeaderStyle(header, "FF4F46E5");

  type DailyRow = { date: string; vals: (number | string)[] };
  const dailyRows: DailyRow[] = [];

  for (const a of accounts as any[]) {
    const exp = monthExpenses[a.accountDate];
    const hasManual = num(a.expensesOperational) > 0 || num(a.expensesMaintenance) > 0;
    const operational = hasManual ? num(a.expensesOperational) : (exp?.operational ?? 0) + (exp?.supplierTotal ?? 0);
    const maintenance = hasManual ? num(a.expensesMaintenance) : exp?.maintenance ?? 0;
    const fixed = num(a.expensesFixed);
    const totalExp = operational + maintenance + fixed;
    const supRest = num(a.supplyToRestaurant), supMgmt = num(a.supplyToManagement), supExtra = num(a.supplyExtra);
    const supTotal = supRest + supMgmt + supExtra;
    const net = num(a.totalSales) - totalExp;
    const pct = a.foodCostPercent != null ? num(a.foodCostPercent) : "";
    dailyRows.push({ date: a.accountDate, vals: [
      formatDate(a.accountDate), num(a.carryForwardToNext),
      num(a.salesCash), num(a.salesCard), num(a.salesKita), num(a.salesOrders),
      num(a.salesCareem), num(a.salesDeliveroo), num(a.salesNoon), num(a.totalSales),
      operational, maintenance, fixed, totalExp,
      supRest, supMgmt, supExtra, supTotal,
      net, num(a.staffMeals), pct,
    ]});
  }

  // Expense-only days (paid invoices, no sales entry)
  const accountDates = new Set((accounts as any[]).map((a) => a.accountDate));
  for (const [dateKey, exp] of Object.entries(monthExpenses)) {
    if (accountDates.has(dateKey)) continue;
    if ((exp.totalExpenses ?? 0) === 0) continue;
    const operational = (exp.operational ?? 0) + (exp.supplierTotal ?? 0);
    dailyRows.push({ date: dateKey, vals: [
      formatDate(dateKey), 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      operational, exp.maintenance ?? 0, 0, exp.totalExpenses,
      0, 0, 0, 0,
      -exp.totalExpenses, 0, "",
    ]});
  }

  dailyRows.sort((a, b) => a.date.localeCompare(b.date));
  let di = 0;
  for (const dr of dailyRows) {
    const r = ws.addRow(dr.vals);
    r.eachCell((c) => applyDataStyle(c, di % 2 === 1));
    di++;
  }

  // Totals row
  const sumCol = (idx: number) => dailyRows.reduce((s, r) => s + (typeof r.vals[idx] === "number" ? (r.vals[idx] as number) : 0), 0);
  ws.addRow([]);
  const totalRow = ws.addRow([
    "الإجمالي", sumCol(1),
    sumCol(2), sumCol(3), sumCol(4), sumCol(5), sumCol(6), sumCol(7), sumCol(8), sumCol(9),
    sumCol(10), sumCol(11), sumCol(12), sumCol(13),
    sumCol(14), sumCol(15), sumCol(16), sumCol(17),
    sumCol(18), sumCol(19), "",
  ]);
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "medium" }, bottom: { style: "medium" } };
  });
  totalRow.height = 24;

  // ═══ Sheets 2 & 3: تفاصيل الفواتير (للشهر) ═══
  const lastDay = new Date(year, month, 0).getDate();
  const dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
  const dateTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { allInvoices, allFreeInvoices } = await fetchWithRetry(async (conn) => {
    const [invoicesRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
      `SELECT invoiceNumber, supplierName, invoiceDate, totalAmount, paymentStatus, paidAmount, remainingAmount, paidAt, notes FROM invoices WHERE invoiceDate >= ? AND invoiceDate <= ? ORDER BY invoiceDate DESC`,
      [dateFrom, dateTo + " 23:59:59"]
    );
    const [freeRows] = await conn.execute<import("mysql2").RowDataPacket[]>(
      `SELECT invoiceNumber, supplierName, supplierType, date, expenseCategory, totalAmount, paymentStatus, paidAmount, remainingAmount, paidAt, notes FROM free_invoices WHERE date >= ? AND date <= ? ORDER BY date DESC`,
      [dateFrom, dateTo + " 23:59:59"]
    );
    return { allInvoices: invoicesRows, allFreeInvoices: freeRows };
  });

  const wsSupplier = wb.addWorksheet("فواتير الموردين", {
    views: [{ rightToLeft: true }], properties: { tabColor: { argb: "FF1E40AF" } },
  });
  wsSupplier.columns = [
    { width: 20 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 28 },
  ];
  const supHeader = wsSupplier.addRow(["رقم الفاتورة", "المورد", "تاريخ الفاتورة", "الإجمالي", "المدفوع", "المتبقي", "حالة الدفع", "تاريخ الدفع", "ملاحظات"]);
  applyHeaderStyle(supHeader, "FF1E40AF");
  let si = 0;
  for (const inv of allInvoices) {
    const remaining = num(inv.remainingAmount) > 0 ? num(inv.remainingAmount) : num(inv.totalAmount) - num(inv.paidAmount);
    const r = wsSupplier.addRow([
      inv.invoiceNumber ?? "", inv.supplierName ?? "", formatDate(inv.invoiceDate),
      num(inv.totalAmount), num(inv.paidAmount), remaining > 0 ? remaining : 0,
      statusLabel(inv.paymentStatus), formatDateTime(inv.paidAt), inv.notes ?? "",
    ]);
    r.eachCell((c) => applyDataStyle(c, si % 2 === 1));
    si++;
  }

  const wsFree = wb.addWorksheet("الفواتير الحرة", {
    views: [{ rightToLeft: true }], properties: { tabColor: { argb: "FF065F46" } },
  });
  wsFree.columns = [
    { width: 20 }, { width: 26 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 28 },
  ];
  const frHeader = wsFree.addRow(["رقم الفاتورة", "المورد / الجهة", "تاريخ الفاتورة", "تصنيف المصروف", "الإجمالي", "المدفوع", "المتبقي", "حالة الدفع", "تاريخ الدفع", "ملاحظات"]);
  applyHeaderStyle(frHeader, "FF065F46");
  let fi = 0;
  for (const inv of allFreeInvoices) {
    const remaining = num(inv.remainingAmount) > 0 ? num(inv.remainingAmount) : num(inv.totalAmount) - num(inv.paidAmount);
    const r = wsFree.addRow([
      inv.invoiceNumber ?? "", inv.supplierName ?? "", formatDate(inv.date),
      expenseCategoryLabel(inv.expenseCategory), num(inv.totalAmount), num(inv.paidAmount),
      remaining > 0 ? remaining : 0, statusLabel(inv.paymentStatus), formatDateTime(inv.paidAt), inv.notes ?? "",
    ]);
    r.eachCell((c) => applyDataStyle(c, fi % 2 === 1));
    fi++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
