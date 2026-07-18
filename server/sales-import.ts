/**
 * sales-import.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bulk import of daily sales into `daily_accounts` from an Excel sheet:
 *
 *   التاريخ | نقدي | بطاقة | كيتا | طلبات | كريم | ديلفروا | نون | أكل الموظفين
 *
 * UPSERT by accountDate, on purpose. `daily_accounts` has no unique key on
 * accountDate and the monthly page SUMS same-day rows, so a plain insert would
 * silently double a day's sales on re-upload. Existing days are updated in
 * place instead.
 *
 * Only the sales columns (and staff meals) are written. Derived fields —
 * carryForwardToNext, foodCostPercent, stockValue — are deliberately left
 * alone: they are computed from live inventory/KPI state and fabricating them
 * for historical rows would be wrong. `saveDailyAccount` is not reused because
 * it recomputes the full financial KPI and inventory snapshot per row, which
 * would be both meaningless here and unusably slow at hundreds of rows.
 */
import * as XLSX from "xlsx";
import { getConn } from "./pool";
import { parseAmount, parseSheetDate, toWesternDigits } from "./expense-import";

// ─── Columns ──────────────────────────────────────────────────────────────────
const SALES_COLUMNS = {
  date: ["التاريخ", "تاريخ", "date"],
  cash: ["نقدي", "كاش", "نقدا", "cash"],
  card: ["بطاقة", "فيزا", "شبكة", "card"],
  kita: ["كيتا", "keeta", "kita"],
  orders: ["طلبات", "talabat", "orders"],
  careem: ["كريم", "careem"],
  deliveroo: ["ديلفروا", "ديليفرو", "deliveroo"],
  noon: ["نون", "noon"],
  staffMeals: ["أكل الموظفين", "اكل الموظفين", "وجبات الموظفين", "staffMeals"],
} as const;

type SalesColumnKey = keyof typeof SALES_COLUMNS;

function normalizeHeader(h: string): string {
  return toWesternDigits(String(h))
    .replace(/[‏‎]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function pickSalesColumn(row: Record<string, unknown>, key: SalesColumnKey): unknown {
  const normalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) normalized.set(normalizeHeader(k), v);
  for (const alias of SALES_COLUMNS[key]) {
    const v = normalized.get(normalizeHeader(alias));
    if (v !== undefined && String(v).trim() !== "") return v;
  }
  return undefined;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────
export interface ParsedSalesRow {
  rowNumber: number;
  /** YYYY-MM-DD — daily_accounts.accountDate is a varchar(10) string. */
  accountDate: string;
  cash: number;
  card: number;
  kita: number;
  orders: number;
  careem: number;
  deliveroo: number;
  noon: number;
  staffMeals: number | null;
  totalSales: number;
}

export interface ParseSalesOutcome {
  rows: ParsedSalesRow[];
  errors: string[];
}

const CHANNELS: Array<Exclude<SalesColumnKey, "date" | "staffMeals">> = [
  "cash", "card", "kita", "orders", "careem", "deliveroo", "noon",
];

/** Pure: validates sheet rows. Row numbers are 1-based including the header. */
export function parseSalesRows(raw: Record<string, unknown>[]): ParseSalesOutcome {
  const rows: ParsedSalesRow[] = [];
  const errors: string[] = [];
  const seenDates = new Map<string, number>();

  raw.forEach((r, i) => {
    const rowNumber = i + 2;
    const rawDate = pickSalesColumn(r, "date");

    const channelValues: Record<string, unknown> = {};
    for (const c of CHANNELS) channelValues[c] = pickSalesColumn(r, c);
    const rawStaff = pickSalesColumn(r, "staffMeals");

    const allChannelsEmpty = CHANNELS.every((c) => channelValues[c] === undefined);
    if (rawDate === undefined && allChannelsEmpty && rawStaff === undefined) return; // blank line

    const problems: string[] = [];

    const date = parseSheetDate(rawDate);
    if (!date) problems.push(`التاريخ غير صالح (${rawDate ?? "فارغ"})`);

    // A missing channel is 0, not an error — most days lack some channels.
    const parsed: Record<string, number> = {};
    for (const c of CHANNELS) {
      const v = channelValues[c];
      if (v === undefined) { parsed[c] = 0; continue; }
      const n = parseAmount(v);
      if (n === null) problems.push(`قيمة غير صالحة في «${SALES_COLUMNS[c][0]}» (${v})`);
      else if (n < 0) problems.push(`«${SALES_COLUMNS[c][0]}» لا يمكن أن يكون سالبًا`);
      else parsed[c] = n;
    }

    let staffMeals: number | null = null;
    if (rawStaff !== undefined) {
      const n = parseAmount(rawStaff);
      if (n === null || n < 0) errors.push(`صف ${rowNumber}: قيمة أكل الموظفين غير صالحة — تم تجاهلها`);
      else staffMeals = n;
    }

    if (problems.length > 0) {
      errors.push(`صف ${rowNumber}: ${problems.join("، ")}`);
      return;
    }

    const accountDate = date!.toISOString().slice(0, 10);

    // Two rows for the same day inside one file would fight over the upsert.
    const prev = seenDates.get(accountDate);
    if (prev !== undefined) {
      errors.push(`صف ${rowNumber}: التاريخ ${accountDate} مكرر (موجود في صف ${prev}) — تم تجاهل هذا الصف`);
      return;
    }
    seenDates.set(accountDate, rowNumber);

    const totalSales = CHANNELS.reduce((s, c) => s + parsed[c], 0);
    rows.push({
      rowNumber, accountDate,
      cash: parsed.cash, card: parsed.card, kita: parsed.kita,
      orders: parsed.orders, careem: parsed.careem,
      deliveroo: parsed.deliveroo, noon: parsed.noon,
      staffMeals,
      totalSales: Math.round(totalSales * 1000) / 1000,
    });
  });

  return { rows, errors };
}

// ─── Import ───────────────────────────────────────────────────────────────────
export interface ImportSalesResult {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  totalSalesImported: number;
  dateRange: { from: string; to: string } | null;
  durationMs: number;
}

export async function importSalesFromExcel(input: {
  base64: string;
  userId: number;
}): Promise<ImportSalesResult> {
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

  const { rows, errors } = parseSalesRows(raw);
  const result: ImportSalesResult = {
    totalRows: raw.length,
    inserted: 0, updated: 0,
    skipped: raw.length - rows.length,
    errors,
    totalSalesImported: 0,
    dateRange: null,
    durationMs: 0,
  };

  if (rows.length === 0) {
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const conn = await getConn();
  try {
    for (const row of rows) {
      try {
        const [existing] = await conn.execute<any[]>(
          `SELECT id FROM daily_accounts WHERE accountDate = ? LIMIT 1`,
          [row.accountDate]
        );

        const staffClause = row.staffMeals !== null ? ", staffMeals = ?" : "";
        const staffValue = row.staffMeals !== null ? [row.staffMeals.toFixed(3)] : [];

        if ((existing as any[]).length > 0) {
          // Update the sales columns only — never touch derived fields or the
          // expense/supply figures the user entered by hand.
          await conn.execute(
            `UPDATE daily_accounts
                SET salesCash = ?, salesCard = ?, salesKita = ?, salesOrders = ?,
                    salesCareem = ?, salesDeliveroo = ?, salesNoon = ?${staffClause}
              WHERE accountDate = ?`,
            [
              row.cash.toFixed(3), row.card.toFixed(3), row.kita.toFixed(3),
              row.orders.toFixed(3), row.careem.toFixed(3),
              row.deliveroo.toFixed(3), row.noon.toFixed(3),
              ...staffValue, row.accountDate,
            ]
          );
          result.updated++;
        } else {
          await conn.execute(
            `INSERT INTO daily_accounts
               (accountDate, salesCash, salesCard, salesKita, salesOrders,
                salesCareem, salesDeliveroo, salesNoon, staffMeals, createdBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              row.accountDate,
              row.cash.toFixed(3), row.card.toFixed(3), row.kita.toFixed(3),
              row.orders.toFixed(3), row.careem.toFixed(3),
              row.deliveroo.toFixed(3), row.noon.toFixed(3),
              row.staffMeals !== null ? row.staffMeals.toFixed(3) : null,
              input.userId,
            ]
          );
          result.inserted++;
        }

        result.totalSalesImported += row.totalSales;
      } catch (err) {
        result.errors.push(
          `صف ${row.rowNumber} (${row.accountDate}): ${err instanceof Error ? err.message : String(err)}`
        );
        result.skipped++;
      }
    }

    const dates = rows.map((r) => r.accountDate).sort();
    result.dateRange = { from: dates[0], to: dates[dates.length - 1] };
    result.totalSalesImported = Math.round(result.totalSalesImported * 1000) / 1000;
    result.durationMs = Date.now() - startedAt;
    return result;
  } finally {
    conn.release();
  }
}

// ─── Template ─────────────────────────────────────────────────────────────────
export function buildSalesImportTemplate(): { base64: string; filename: string } {
  const headers = [
    "التاريخ", "نقدي", "بطاقة", "كيتا", "طلبات", "كريم", "ديلفروا", "نون", "أكل الموظفين",
  ];
  const examples = [
    ["01/05/2026", 200, 590.25, 12, 224, 0, 0, 0, 50],
    ["02/05/2026", 584, 1157, 0, 65, 0, 0, 129, 0],
    ["03/05/2026", 518, 1241, 25, 0, 0, 0, 81, 45],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [{ wch: 14 }, ...Array(8).fill({ wch: 11 })];

  const notes = [
    ["ملاحظات"],
    ["• التاريخ بصيغة يوم/شهر/سنة — مثال 01/05/2026"],
    ["• الأعمدة الفارغة تُحسب صفرًا"],
    ["• عمود «أكل الموظفين» اختياري"],
    ["• إذا كان اليوم مسجلًا بالفعل، سيتم تحديث مبيعاته وليس إضافتها مرة أخرى"],
    ["• المصروفات والتوريدات المسجلة يدويًا لهذا اليوم لن تتأثر"],
  ];
  const wsNotes = XLSX.utils.aoa_to_sheet(notes);
  wsNotes["!cols"] = [{ wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "المبيعات");
  XLSX.utils.book_append_sheet(wb, wsNotes, "ملاحظات");

  return {
    base64: XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
    filename: "قالب-استيراد-المبيعات.xlsx",
  };
}
