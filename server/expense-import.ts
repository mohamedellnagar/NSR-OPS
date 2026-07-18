/**
 * expense-import.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulk import of paid expenses from an Excel sheet with the columns:
 *
 *   التاريخ | نوع المصروف | الفئة | البيان | طريقة الدفع | المبلغ
 *
 * Every imported row becomes a FREE invoice (`free_invoices`), never a supplier
 * invoice: `createInvoice` posts stock movements and rewrites material average
 * costs, which would corrupt inventory for what are plain expenses.
 *
 * All imported rows are recorded as PAID, and `paidAt` is forced to the invoice
 * date — `createFreeInvoice` stamps it with "now", which would pile every
 * historical expense onto today in the daily-accounts view.
 *
 * The parsing half is pure and unit-tested; only `importExpensesFromExcel`
 * touches the database.
 */
import * as XLSX from "xlsx";
import { getConn } from "./pool";
import { createFreeInvoice } from "./db";
import {
  EXPENSE_CATEGORY_CODES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type ExpenseCategoryCode,
  type ExpenseType,
  type PaymentMethod,
} from "@shared/expenseClassification";

// ─── Column aliases (Arabic first, English accepted) ──────────────────────────
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["التاريخ", "تاريخ", "date"],
  expenseType: ["نوع المصروف", "النوع", "نوع", "expenseType", "type"],
  category: ["الفئة", "التصنيف", "تصنيف المصروف", "category"],
  description: ["البيان", "الوصف", "بيان", "description", "statement"],
  paymentMethod: ["طريقة الدفع", "الدفع", "paymentMethod"],
  amount: ["المبلغ", "القيمة", "amount", "total"],
};

/** Normalises a header cell so lookup is whitespace/format insensitive. */
function normalizeHeader(h: string): string {
  return String(h).replace(/[‏‎]/g, "").trim().toLowerCase();
}

/** Reads a value from a sheet row by any of the accepted column names. */
export function pickColumn(row: Record<string, unknown>, key: string): unknown {
  const aliases = COLUMN_ALIASES[key] ?? [];
  const normalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) normalized.set(normalizeHeader(k), v);
  for (const alias of aliases) {
    const v = normalized.get(normalizeHeader(alias));
    if (v !== undefined && String(v).trim() !== "") return v;
  }
  return undefined;
}

// ─── Value normalisation ──────────────────────────────────────────────────────
/** Arabic-Indic and Persian digits → ASCII, so "١٥" parses like "15". */
export function toWesternDigits(s: string): string {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** "1,305.00" / "١٬٣٠٥٫٠٠" / 1305 → 1305. Returns null when not a number. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  const cleaned = toWesternDigits(String(v))
    .replace(/[٬،,\s]/g, "")   // thousands separators + spaces
    .replace(/[٫]/g, ".")            // Arabic decimal separator
    .replace(/[^\d.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Excel serial day 1 = 1900-01-01, with the well-known 1900 leap-year bug. */
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 60000) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Accepts a Date (cellDates), an Excel serial, or a DD/MM/YYYY-style string.
 * Day-first, because that is what the sheet uses (15/2/2026).
 * Returns a UTC-midnight Date so no timezone shift can move the day.
 */
export function parseSheetDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  }
  if (typeof v === "number") {
    const d = excelSerialToDate(v);
    return d ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : null;
  }
  if (v === null || v === undefined) return null;

  const s = toWesternDigits(String(v)).trim();
  if (s === "") return null;

  // Pure number as text → Excel serial
  if (/^\d+(\.\d+)?$/.test(s) && !s.includes("/") && !s.includes("-")) {
    const d = excelSerialToDate(parseFloat(s));
    if (d) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  const m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    // Rejects impossible dates like 31/2 that would silently roll over.
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return d;
  }

  // ISO or anything Date understands, as a last resort
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ─── Label → code lookups ─────────────────────────────────────────────────────
function normalizeLabel(s: string): string {
  return toWesternDigits(String(s))
    .replace(/[‏‎]/g, "")
    // Fold the spelling variants people actually type on Arabic keyboards.
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي") // alef maqsura → yaa ("تشغيلى" = "تشغيلي")
    .replace(/[ً-ْـ]/g, "") // diacritics + tatweel
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const TYPE_LOOKUP = new Map<string, ExpenseType>();
for (const [code, label] of Object.entries(EXPENSE_TYPE_LABELS)) {
  TYPE_LOOKUP.set(normalizeLabel(label), code as ExpenseType);
  TYPE_LOOKUP.set(normalizeLabel(code), code as ExpenseType);
}

const CATEGORY_LOOKUP = new Map<string, ExpenseCategoryCode>();
for (const code of EXPENSE_CATEGORY_CODES) {
  CATEGORY_LOOKUP.set(normalizeLabel(EXPENSE_CATEGORY_LABELS[code]), code);
  CATEGORY_LOOKUP.set(normalizeLabel(code), code);
}
// A few natural variants a human would type.
CATEGORY_LOOKUP.set(normalizeLabel("صيانة ومعدات"), "MAINTENANCE");
CATEGORY_LOOKUP.set(normalizeLabel("مشتريات"), "FOOD_PURCHASES");
CATEGORY_LOOKUP.set(normalizeLabel("رواتب"), "SALARIES");
CATEGORY_LOOKUP.set(normalizeLabel("كهرباء"), "UTILITIES");
CATEGORY_LOOKUP.set(normalizeLabel("مياه"), "UTILITIES");

const METHOD_LOOKUP = new Map<string, PaymentMethod>();
for (const code of PAYMENT_METHODS) {
  METHOD_LOOKUP.set(normalizeLabel(PAYMENT_METHOD_LABELS[code]), code);
  METHOD_LOOKUP.set(normalizeLabel(code), code);
}
METHOD_LOOKUP.set(normalizeLabel("كاش"), "CASH");
METHOD_LOOKUP.set(normalizeLabel("تحويل"), "BANK_TRANSFER");
METHOD_LOOKUP.set(normalizeLabel("بنك"), "BANK_TRANSFER");
METHOD_LOOKUP.set(normalizeLabel("visa"), "CARD");

/** The legacy `expenseCategory` still drives the daily-accounts aggregation. */
export function toLegacyCategory(
  type: ExpenseType,
  code: ExpenseCategoryCode
): "operational" | "maintenance" | "fixed" | "other" {
  if (type === "NON_OPERATIONAL") return "other";
  if (code === "MAINTENANCE" || code === "EQUIPMENT_ASSETS") return "maintenance";
  return "operational";
}

// ─── Row parsing ──────────────────────────────────────────────────────────────
export interface ParsedExpenseRow {
  rowNumber: number;
  date: Date;
  description: string;
  amount: number;
  expenseType: ExpenseType;
  expenseCategoryCode: ExpenseCategoryCode;
  paymentMethod: PaymentMethod | null;
}

export interface ParseOutcome {
  rows: ParsedExpenseRow[];
  errors: string[];
}

/** Pure: validates sheet rows. Row numbers are 1-based including the header. */
export function parseExpenseRows(raw: Record<string, unknown>[]): ParseOutcome {
  const rows: ParsedExpenseRow[] = [];
  const errors: string[] = [];

  raw.forEach((r, i) => {
    const rowNumber = i + 2; // +1 for zero-index, +1 for the header row

    const rawDate = pickColumn(r, "date");
    const rawType = pickColumn(r, "expenseType");
    const rawCat = pickColumn(r, "category");
    const rawDesc = pickColumn(r, "description");
    const rawMethod = pickColumn(r, "paymentMethod");
    const rawAmount = pickColumn(r, "amount");

    // A fully blank line is skipped silently, not reported as an error.
    if (
      rawDate === undefined && rawType === undefined && rawCat === undefined &&
      rawDesc === undefined && rawAmount === undefined
    ) return;

    const problems: string[] = [];

    const date = parseSheetDate(rawDate);
    if (!date) problems.push(`التاريخ غير صالح (${rawDate ?? "فارغ"})`);

    const description = rawDesc === undefined ? "" : String(rawDesc).trim();
    if (!description) problems.push("البيان مطلوب");

    const amount = parseAmount(rawAmount);
    if (amount === null) problems.push(`المبلغ غير صالح (${rawAmount ?? "فارغ"})`);
    else if (amount <= 0) problems.push("المبلغ يجب أن يكون أكبر من صفر");

    const expenseType = rawType === undefined ? undefined : TYPE_LOOKUP.get(normalizeLabel(String(rawType)));
    if (!expenseType) problems.push(`نوع المصروف غير معروف (${rawType ?? "فارغ"}) — المسموح: تشغيلي / غير تشغيلي`);

    const expenseCategoryCode = rawCat === undefined ? undefined : CATEGORY_LOOKUP.get(normalizeLabel(String(rawCat)));
    if (!expenseCategoryCode) problems.push(`الفئة غير معروفة (${rawCat ?? "فارغ"})`);

    // Payment method is optional; an unrecognised value is reported, not fatal.
    let paymentMethod: PaymentMethod | null = null;
    if (rawMethod !== undefined && String(rawMethod).trim() !== "") {
      paymentMethod = METHOD_LOOKUP.get(normalizeLabel(String(rawMethod))) ?? null;
      if (!paymentMethod) errors.push(`صف ${rowNumber}: طريقة دفع غير معروفة (${rawMethod}) — تم تجاهلها`);
    }

    if (problems.length > 0) {
      errors.push(`صف ${rowNumber}: ${problems.join("، ")}`);
      return;
    }

    rows.push({
      rowNumber,
      date: date!,
      description,
      amount: amount!,
      expenseType: expenseType!,
      expenseCategoryCode: expenseCategoryCode!,
      paymentMethod,
    });
  });

  return { rows, errors };
}

/** Rows that look like repeats of each other (same date + description + amount). */
export function countLikelyDuplicates(rows: ParsedExpenseRow[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of rows) {
    const key = `${r.date.toISOString().slice(0, 10)}|${r.description}|${r.amount}`;
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  return dupes;
}

// ─── Import ───────────────────────────────────────────────────────────────────
export interface ImportExpensesResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: string[];
  likelyDuplicates: number;
  durationMs: number;
  createdInvoiceNumbers: string[];
}

export async function importExpensesFromExcel(input: {
  base64: string;
}): Promise<ImportExpensesResult> {
  const startedAt = Date.now();

  let raw: Record<string, unknown>[];
  try {
    const wb = XLSX.read(input.base64, { type: "base64", cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("الملف لا يحتوي على أي ورقة");
    raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
  } catch (err) {
    throw new Error(
      `تعذّر قراءة ملف الإكسل: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const { rows, errors } = parseExpenseRows(raw);
  const result: ImportExpensesResult = {
    totalRows: raw.length,
    imported: 0,
    skipped: raw.length - rows.length,
    errors,
    likelyDuplicates: countLikelyDuplicates(rows),
    durationMs: 0,
    createdInvoiceNumbers: [],
  };

  // Sequential on purpose: the FREE-xxxx sequence is read-then-increment and
  // would collide under Promise.all.
  for (const row of rows) {
    try {
      const invoiceId = await createFreeInvoice({
        supplierName: row.description, // the sheet has no vendor column
        supplierType: "service",
        date: row.date,
        vatPct: 0, // amounts are final totals
        paymentStatus: "paid", // every imported expense is paid
        paidAmount: row.amount,
        notes: "مستورد من ملف إكسل",
        expenseCategory: toLegacyCategory(row.expenseType, row.expenseCategoryCode),
        items: [{ description: row.description, qty: 1, unitPrice: row.amount }],
      });

      // createFreeInvoice does not know about the new classification columns,
      // and stamps paidAt with "now" — both are corrected here so the expense
      // lands on its real date in the daily/monthly views.
      const conn = await getConn();
      try {
        await conn.execute(
          `UPDATE free_invoices
              SET expenseType = ?, expenseCategoryCode = ?, paymentMethod = ?, paidAt = ?
            WHERE id = ?`,
          [
            row.expenseType,
            row.expenseCategoryCode,
            row.paymentMethod,
            row.date,
            invoiceId,
          ]
        );
        const [r] = await conn.execute<any[]>(
          `SELECT invoiceNumber FROM free_invoices WHERE id = ?`,
          [invoiceId]
        );
        const num = (r as any[])[0]?.invoiceNumber;
        if (num) result.createdInvoiceNumbers.push(num);
      } finally {
        conn.release();
      }

      result.imported++;
    } catch (err) {
      result.errors.push(
        `صف ${row.rowNumber} (${row.description}): ${err instanceof Error ? err.message : String(err)}`
      );
      result.skipped++;
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

// ─── Template ─────────────────────────────────────────────────────────────────
/** A ready-to-fill sheet with the exact headers and a couple of example rows. */
export function buildExpenseImportTemplate(): { base64: string; filename: string } {
  const headers = ["التاريخ", "نوع المصروف", "الفئة", "البيان", "طريقة الدفع", "المبلغ"];
  const examples = [
    ["15/02/2026", "تشغيلي", "مشتريات غذائية", "أرز بسمتي", "نقدي", 10.5],
    ["19/02/2026", "تشغيلي", "مشتريات غذائية", "سمنة", "تحويل بنكي", 1305],
    ["16/02/2026", "غير تشغيلي", "صيانة", "اصلاح العجان", "نقدي", 100],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 12 }];

  // A reference sheet so the user never has to guess an allowed value.
  const refRows: (string | number)[][] = [["الفئات المسموحة"], ...EXPENSE_CATEGORY_CODES.map((c) => [EXPENSE_CATEGORY_LABELS[c]])];
  refRows.push([""], ["أنواع المصروف"], ["تشغيلي"], ["غير تشغيلي"]);
  refRows.push([""], ["طرق الدفع"], ...PAYMENT_METHODS.map((m) => [PAYMENT_METHOD_LABELS[m]]));
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef["!cols"] = [{ wch: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المصروفات");
  XLSX.utils.book_append_sheet(wb, wsRef, "القيم المسموحة");

  return {
    base64: XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
    filename: "قالب-استيراد-المصروفات.xlsx",
  };
}
