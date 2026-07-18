/**
 * Monthly accounts (الحسابات الشهرية).
 *
 * Read-side aggregation for one month:
 *   - daily sales, one row per calendar day that has any data
 *   - every expense of the month, unified from its ORIGINAL source
 *   - the monthly P&L summary
 *
 * Nothing is copied into a new table. Supplier invoices, free invoices and
 * monthly payments are read in place and mapped onto one shape; classification
 * edits write back to the original row.
 *
 * Every figure in `summary` comes from calculateMonthlyAccountsSummary() in
 * @shared/monthlyAccountsSummary — the formulas live there and nowhere else.
 * It is fed the UNFILTERED expense set, so the P&L never changes when the user
 * filters the table.
 *
 * Out of scope: investors, ownership, distributions, cash flow, month closing.
 */
import { getConn } from "./pool";
import {
  LEGACY_CATEGORY_MAP,
  PAYMENT_CATEGORY_MAP,
  type ExpenseCategoryCode,
  type ExpenseSourceType,
  type ExpenseType,
} from "@shared/expenseClassification";
import {
  calculateMonthlyAccountsSummary,
  type MonthlyAccountsSummary,
} from "@shared/monthlyAccountsSummary";

/** Business-day timezone offset used across the project (Dubai, UTC+4). */
const TZ = "+04:00";

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** Money is stored as DECIMAL; round to fils to avoid float drift in sums. */
function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Day name from a YYYY-MM-DD string, without timezone drift. */
export function arabicDayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  return AR_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DailySalesRow {
  date: string;
  dayName: string;
  cash: number;
  card: number;
  kita: number;
  orders: number;
  careem: number;
  deliveroo: number;
  noon: number;
  totalSales: number;
}

export interface UnifiedExpenseRow {
  id: number;
  sourceType: ExpenseSourceType;
  invoiceNumber: string | null;
  date: string;
  vendorName: string | null;
  description: string | null;
  expenseType: ExpenseType | null;
  expenseCategoryCode: ExpenseCategoryCode | null;
  paymentMethod: string | null;
  total: number;
  paid: number;
  remaining: number;
  paymentStatus: string | null;
  needsClassification: boolean;
  /** Daily expenses live on daily_accounts and are not classifiable rows. */
  editable: boolean;
}

export interface MonthlyAccountSettingsRow {
  year: number;
  month: number;
  openingInventory: number;
  closingInventory: number;
  discounts: number;
  notes: string | null;
  /** True when no row is stored yet and openingInventory was suggested. */
  isNew: boolean;
  /** Where the suggested opening inventory came from, for the UI hint. */
  suggestedFromPreviousMonth: boolean;
}

export interface MonthlyAccountsResult {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  restaurantName: string;
  currency: string;
  dailySales: DailySalesRow[];
  salesTotals: Omit<DailySalesRow, "date" | "dayName">;
  /** ALL expenses of the month, unfiltered. The client filters for display. */
  expenses: UnifiedExpenseRow[];
  expenseTotals: { total: number; paid: number; remaining: number; count: number };
  needsClassificationCount: number;
  settings: MonthlyAccountSettingsRow;
  summary: MonthlyAccountsSummary;
}

/**
 * Read-time fallback: a row that predates the backfill still renders sensibly.
 * Never written back — the user decides via the UI.
 */
function resolveClassification(row: {
  expenseType: string | null;
  expenseCategoryCode: string | null;
  expenseCategory: string | null;
}): { expenseType: ExpenseType | null; expenseCategoryCode: ExpenseCategoryCode | null } {
  if (row.expenseType || row.expenseCategoryCode) {
    return {
      expenseType: (row.expenseType as ExpenseType) ?? null,
      expenseCategoryCode: (row.expenseCategoryCode as ExpenseCategoryCode) ?? null,
    };
  }
  const mapped = row.expenseCategory ? LEGACY_CATEGORY_MAP[row.expenseCategory] : undefined;
  return mapped ?? { expenseType: null, expenseCategoryCode: null };
}

// ─── Main query ───────────────────────────────────────────────────────────────
/**
 * One round-trip per data set (4 queries total) — no per-day or per-invoice
 * queries, so no N+1.
 */
export async function getMonthlyAccounts(
  year: number,
  month: number
): Promise<MonthlyAccountsResult> {
  const { start, end } = monthRange(year, month);
  const conn = await getConn();

  try {
    // ── 1. Daily sales, aggregated by date ──
    // daily_accounts has no unique constraint on accountDate, so several rows
    // for one day are summed rather than picked arbitrarily.
    const [salesRows] = await conn.execute<any[]>(
      `SELECT accountDate,
              SUM(salesCash)      AS cash,
              SUM(salesCard)      AS card,
              SUM(salesKita)      AS kita,
              SUM(salesOrders)    AS orders,
              SUM(salesCareem)    AS careem,
              SUM(salesDeliveroo) AS deliveroo,
              SUM(salesNoon)      AS noon,
              SUM(expensesFixed)  AS expensesFixed,
              SUM(staffMeals)     AS staffMeals
         FROM daily_accounts
        WHERE accountDate >= ? AND accountDate <= ?
        GROUP BY accountDate
        ORDER BY accountDate`,
      [start, end]
    );

    // ── 2. Supplier invoices (by INVOICE date, not payment date) ──
    const [supplierRows] = await conn.execute<any[]>(
      `SELECT id, invoiceNumber, supplierName, notes,
              DATE_FORMAT(CONVERT_TZ(invoiceDate, '+00:00', '${TZ}'), '%Y-%m-%d') AS dateKey,
              totalAmount, paidAmount, remainingAmount, paymentStatus,
              expenseCategory, expenseType, expenseCategoryCode, paymentMethod
         FROM invoices
        WHERE DATE(CONVERT_TZ(invoiceDate, '+00:00', '${TZ}')) BETWEEN ? AND ?
        ORDER BY invoiceDate, id`,
      [start, end]
    );

    // ── 3. Free invoices ──
    const [freeRows] = await conn.execute<any[]>(
      `SELECT id, invoiceNumber, supplierName, notes,
              DATE_FORMAT(CONVERT_TZ(date, '+00:00', '${TZ}'), '%Y-%m-%d') AS dateKey,
              totalAmount, paidAmount, remainingAmount, paymentStatus,
              expenseCategory, expenseType, expenseCategoryCode, paymentMethod
         FROM free_invoices
        WHERE DATE(CONVERT_TZ(date, '+00:00', '${TZ}')) BETWEEN ? AND ?
        ORDER BY date, id`,
      [start, end]
    );

    // ── 4. Monthly payments (selected by month/year columns, not a date) ──
    const [paymentRows] = await conn.execute<any[]>(
      `SELECT id, name, category, notes, dueDay, totalAmount, paidAmount, status,
              expenseType, expenseCategoryCode, paymentMethod
         FROM monthly_payments
        WHERE year = ? AND month = ?
        ORDER BY dueDay, id`,
      [year, month]
    );

    // ── Build daily sales rows ──
    const dailySales: DailySalesRow[] = (salesRows as any[]).map((r) => {
      const cash = num(r.cash), card = num(r.card), kita = num(r.kita);
      const orders = num(r.orders), careem = num(r.careem);
      const deliveroo = num(r.deliveroo), noon = num(r.noon);
      return {
        date: r.accountDate,
        dayName: arabicDayName(r.accountDate),
        cash, card, kita, orders, careem, deliveroo, noon,
        totalSales: money(cash + card + kita + orders + careem + deliveroo + noon),
      };
    });

    const salesTotals = dailySales.reduce(
      (acc, r) => ({
        cash: money(acc.cash + r.cash),
        card: money(acc.card + r.card),
        kita: money(acc.kita + r.kita),
        orders: money(acc.orders + r.orders),
        careem: money(acc.careem + r.careem),
        deliveroo: money(acc.deliveroo + r.deliveroo),
        noon: money(acc.noon + r.noon),
        totalSales: money(acc.totalSales + r.totalSales),
      }),
      { cash: 0, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0, totalSales: 0 }
    );

    // ── Unify expenses ──
    const mapInvoice = (r: any, sourceType: ExpenseSourceType): UnifiedExpenseRow => {
      const cls = resolveClassification(r);
      const total = num(r.totalAmount);
      const paid = num(r.paidAmount);
      const storedRemaining = num(r.remainingAmount);
      const remaining = storedRemaining > 0 ? storedRemaining : Math.max(0, total - paid);
      return {
        id: r.id,
        sourceType,
        invoiceNumber: r.invoiceNumber ?? null,
        date: r.dateKey,
        vendorName: r.supplierName ?? null,
        description: r.notes ?? null,
        expenseType: cls.expenseType,
        expenseCategoryCode: cls.expenseCategoryCode,
        paymentMethod: r.paymentMethod ?? null,
        total: money(total),
        paid: money(paid),
        remaining: money(remaining),
        paymentStatus: r.paymentStatus ?? null,
        needsClassification: !cls.expenseType || !cls.expenseCategoryCode,
        editable: true,
      };
    };

    const expenses: UnifiedExpenseRow[] = [
      ...(supplierRows as any[]).map((r) => mapInvoice(r, "SUPPLIER_INVOICE")),
      ...(freeRows as any[]).map((r) => mapInvoice(r, "FREE_INVOICE")),
    ];

    // ── Monthly payments ──
    // This table has no date column: the row belongs to (year, month) and
    // `dueDay` gives the day, clamped to the length of that month.
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    for (const r of paymentRows as any[]) {
      const day = Math.min(Math.max(Number(r.dueDay) || 1, 1), lastDayOfMonth);
      const total = num(r.totalAmount);
      const paid = num(r.paidAmount);
      const remaining = Math.max(0, total - paid);

      // `status` here is paid|pending|overdue; the unified column uses the
      // invoice vocabulary, so derive it from the amounts instead.
      const paymentStatus = remaining <= 0 && total > 0 ? "paid" : paid > 0 ? "partial" : "deferred";

      // Read-time fallback from the payment's own category.
      let cls: { expenseType: ExpenseType | null; expenseCategoryCode: ExpenseCategoryCode | null };
      if (r.expenseType || r.expenseCategoryCode) {
        cls = {
          expenseType: (r.expenseType as ExpenseType) ?? null,
          expenseCategoryCode: (r.expenseCategoryCode as ExpenseCategoryCode) ?? null,
        };
      } else {
        cls = PAYMENT_CATEGORY_MAP[r.category] ?? { expenseType: null, expenseCategoryCode: null };
      }

      expenses.push({
        id: r.id,
        sourceType: "MONTHLY_PAYMENT",
        invoiceNumber: null,
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        vendorName: r.name ?? null,
        description: r.notes ?? null,
        expenseType: cls.expenseType,
        expenseCategoryCode: cls.expenseCategoryCode,
        paymentMethod: r.paymentMethod ?? null,
        total: money(total),
        paid: money(paid),
        remaining: money(remaining),
        paymentStatus,
        needsClassification: !cls.expenseType || !cls.expenseCategoryCode,
        editable: true,
      });
    }

    // Daily fixed expenses recorded straight on daily_accounts.
    // Only `expensesFixed` is included: expensesOperational / expensesMaintenance
    // are derived from these same invoices, so listing them would double-count.
    for (const r of salesRows as any[]) {
      const fixed = num(r.expensesFixed);
      if (fixed <= 0) continue;
      expenses.push({
        id: 0,
        sourceType: "DAILY_EXPENSE",
        invoiceNumber: null,
        date: r.accountDate,
        vendorName: null,
        description: "مصروفات ثابتة (حسابات يومية)",
        expenseType: "OPERATIONAL",
        expenseCategoryCode: null,
        paymentMethod: null,
        total: money(fixed),
        paid: money(fixed),
        remaining: 0,
        paymentStatus: "paid",
        needsClassification: false,
        editable: false,
      });
    }

    expenses.sort((a, b) => a.date.localeCompare(b.date) || a.sourceType.localeCompare(b.sourceType));

    const expenseTotals = expenses.reduce(
      (acc, e) => ({
        total: money(acc.total + e.total),
        paid: money(acc.paid + e.paid),
        remaining: money(acc.remaining + e.remaining),
        count: acc.count + 1,
      }),
      { total: 0, paid: 0, remaining: 0, count: 0 }
    );

    // ── Month settings + restaurant identity (2 more small queries) ──
    const settings = await readSettings(conn, year, month);

    const [[restaurant]] = (await conn.query<any[]>(
      `SELECT restaurant_name AS name, currency FROM restaurant_settings ORDER BY id LIMIT 1`
    )) as any;

    // ── Summary: computed from ALL expenses, never the filtered view ──
    const staffMealsTotal = (salesRows as any[]).reduce((s, r) => s + num(r.staffMeals), 0);
    const summary = calculateMonthlyAccountsSummary({
      year,
      month,
      sales: {
        cash: salesTotals.cash, card: salesTotals.card, kita: salesTotals.kita,
        orders: salesTotals.orders, careem: salesTotals.careem,
        deliveroo: salesTotals.deliveroo, noon: salesTotals.noon,
      },
      staffMeals: staffMealsTotal,
      expenses: expenses.map((e) => ({
        expenseType: e.expenseType,
        expenseCategoryCode: e.expenseCategoryCode,
        total: e.total, // invoice TOTAL, not the paid amount
      })),
      openingInventory: settings.openingInventory,
      closingInventory: settings.closingInventory,
      discounts: settings.discounts,
    });

    return {
      year,
      month,
      startDate: start,
      endDate: end,
      restaurantName: restaurant?.name ?? "",
      currency: restaurant?.currency ?? "د.إ",
      dailySales,
      salesTotals,
      expenses,
      expenseTotals,
      needsClassificationCount: expenses.filter((e) => e.needsClassification).length,
      settings,
      summary,
    };
  } finally {
    conn.release();
  }
}

// ─── Month settings ───────────────────────────────────────────────────────────
/**
 * Reads the stored settings for a month. When none exist yet, suggests the
 * PREVIOUS month's closing inventory as this month's opening — without writing
 * anything, and without ever touching the previous month's row.
 */
async function readSettings(
  conn: { execute: (sql: string, params?: unknown[]) => Promise<any> },
  year: number,
  month: number
): Promise<MonthlyAccountSettingsRow> {
  const [rows] = await conn.execute(
    `SELECT openingInventory, closingInventory, discounts, notes
       FROM monthly_account_settings WHERE year = ? AND month = ?`,
    [year, month]
  );
  const row = (rows as any[])[0];
  if (row) {
    return {
      year, month,
      openingInventory: num(row.openingInventory),
      closingInventory: num(row.closingInventory),
      discounts: num(row.discounts),
      notes: row.notes ?? null,
      isNew: false,
      suggestedFromPreviousMonth: false,
    };
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const [prevRows] = await conn.execute(
    `SELECT closingInventory FROM monthly_account_settings WHERE year = ? AND month = ?`,
    [prevYear, prevMonth]
  );
  const prev = (prevRows as any[])[0];

  return {
    year, month,
    openingInventory: prev ? num(prev.closingInventory) : 0,
    closingInventory: 0,
    discounts: 0,
    notes: null,
    isNew: true,
    suggestedFromPreviousMonth: Boolean(prev),
  };
}

export async function getMonthlyAccountSettings(
  year: number,
  month: number
): Promise<MonthlyAccountSettingsRow> {
  const conn = await getConn();
  try {
    return await readSettings(conn as any, year, month);
  } finally {
    conn.release();
  }
}

/** Upsert keyed on the unique (year, month) index. */
export async function saveMonthlyAccountSettings(input: {
  year: number;
  month: number;
  openingInventory: number;
  closingInventory: number;
  discounts: number;
  notes?: string | null;
  userId: number;
}): Promise<{ success: true }> {
  const conn = await getConn();
  try {
    await conn.execute(
      `INSERT INTO monthly_account_settings
         (year, month, openingInventory, closingInventory, discounts, notes, createdBy, updatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         openingInventory = VALUES(openingInventory),
         closingInventory = VALUES(closingInventory),
         discounts        = VALUES(discounts),
         notes            = VALUES(notes),
         updatedBy        = VALUES(updatedBy)`,
      [
        input.year, input.month,
        input.openingInventory, input.closingInventory, input.discounts,
        input.notes ?? null, input.userId, input.userId,
      ]
    );
    return { success: true };
  } finally {
    conn.release();
  }
}

// ─── Classification write-back ────────────────────────────────────────────────
/**
 * Updates the ORIGINAL invoice row — no copy, no new record.
 * `sourceType` selects the table; DAILY_EXPENSE is not classifiable.
 */
export async function updateExpenseClassification(input: {
  id: number;
  sourceType: ExpenseSourceType;
  expenseType?: ExpenseType | null;
  expenseCategoryCode?: ExpenseCategoryCode | null;
  paymentMethod?: string | null;
}): Promise<{ success: true }> {
  if (input.sourceType === "DAILY_EXPENSE") {
    throw new Error("المصروفات اليومية لا تقبل التصنيف من هذه الصفحة");
  }
  const TABLE_BY_SOURCE: Record<string, string> = {
    SUPPLIER_INVOICE: "invoices",
    FREE_INVOICE: "free_invoices",
    MONTHLY_PAYMENT: "monthly_payments",
  };
  const table = TABLE_BY_SOURCE[input.sourceType];
  if (!table) throw new Error("مصدر غير معروف");

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.expenseType !== undefined) {
    sets.push("expenseType = ?");
    params.push(input.expenseType);
  }
  if (input.expenseCategoryCode !== undefined) {
    sets.push("expenseCategoryCode = ?");
    params.push(input.expenseCategoryCode);
  }
  if (input.paymentMethod !== undefined) {
    sets.push("paymentMethod = ?");
    params.push(input.paymentMethod);
  }
  if (sets.length === 0) return { success: true };

  const conn = await getConn();
  try {
    const [res] = await conn.execute<any>(
      `UPDATE \`${table}\` SET ${sets.join(", ")} WHERE id = ?`,
      [...params, input.id]
    );
    if (res.affectedRows === 0) throw new Error("السجل غير موجود");
    return { success: true };
  } finally {
    conn.release();
  }
}
