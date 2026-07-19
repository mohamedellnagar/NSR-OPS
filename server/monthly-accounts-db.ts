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
  /** How many months this invoice's cost is spread across. 1 = just its own. */
  amortizeMonths?: number;
  /** Which instalment this row is, 1-based. null when not spread. */
  amortizePeriod?: number | null;
  /** The full invoice value, when only an instalment of it is shown. */
  amortizeTotal?: number | null;
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

    // ── 2/3. Invoices charged to this month ──
    //
    // An invoice normally belongs to its own month (amortizeMonths = 1). When it
    // is spread, it also lands on the following N-1 months with 1/N of its value
    // each, so a quarter's rent is matched to the quarter it covers and a piece
    // of equipment is depreciated instead of wiping out the month it was bought.
    //
    // PERIOD_DIFF counts months between two YYYYMM periods, so an invoice is in
    // scope when this month is between its own month and N-1 months after it.
    const periodKey = year * 100 + month;
    const AMORTIZE_SCOPE = (dateCol: string) => `
      PERIOD_DIFF(?, CAST(DATE_FORMAT(CONVERT_TZ(${dateCol}, '+00:00', '${TZ}'), '%Y%m') AS UNSIGNED))
        BETWEEN 0 AND GREATEST(amortizeMonths, 1) - 1`;

    const [supplierRows] = await conn.execute<any[]>(
      `SELECT id, invoiceNumber, supplierName, notes,
              DATE_FORMAT(CONVERT_TZ(invoiceDate, '+00:00', '${TZ}'), '%Y-%m-%d') AS dateKey,
              totalAmount, paidAmount, remainingAmount, paymentStatus,
              expenseCategory, expenseType, expenseCategoryCode, paymentMethod,
              GREATEST(amortizeMonths, 1) AS amortizeMonths,
              PERIOD_DIFF(?, CAST(DATE_FORMAT(CONVERT_TZ(invoiceDate, '+00:00', '${TZ}'), '%Y%m') AS UNSIGNED)) AS periodOffset
         FROM invoices
        WHERE ${AMORTIZE_SCOPE("invoiceDate")}
        ORDER BY invoiceDate, id`,
      [periodKey, periodKey]
    );

    const [freeRows] = await conn.execute<any[]>(
      `SELECT id, invoiceNumber, supplierName, notes,
              DATE_FORMAT(CONVERT_TZ(date, '+00:00', '${TZ}'), '%Y-%m-%d') AS dateKey,
              totalAmount, paidAmount, remainingAmount, paymentStatus,
              expenseCategory, expenseType, expenseCategoryCode, paymentMethod,
              GREATEST(amortizeMonths, 1) AS amortizeMonths,
              PERIOD_DIFF(?, CAST(DATE_FORMAT(CONVERT_TZ(date, '+00:00', '${TZ}'), '%Y%m') AS UNSIGNED)) AS periodOffset
         FROM free_invoices
        WHERE ${AMORTIZE_SCOPE("date")}
        ORDER BY date, id`,
      [periodKey, periodKey]
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
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

    const mapInvoice = (r: any, sourceType: ExpenseSourceType): UnifiedExpenseRow => {
      const cls = resolveClassification(r);
      const invoiceTotal = num(r.totalAmount);
      const spread = Math.max(1, Math.trunc(num(r.amortizeMonths) || 1));
      const offset = Math.max(0, Math.trunc(num(r.periodOffset) || 0));

      // Only the slice belonging to this month reaches the P&L. The last slice
      // absorbs the rounding remainder so the instalments always add back up to
      // the invoice exactly, however awkwardly it divides.
      const slice = spread === 1
        ? invoiceTotal
        : offset === spread - 1
          ? money(invoiceTotal - money(invoiceTotal / spread) * (spread - 1))
          : money(invoiceTotal / spread);

      const total = slice;
      const paid = spread === 1 ? num(r.paidAmount) : slice;
      const storedRemaining = spread === 1 ? num(r.remainingAmount) : 0;
      const remaining = storedRemaining > 0 ? storedRemaining : Math.max(0, total - paid);
      return {
        id: r.id,
        sourceType,
        invoiceNumber: r.invoiceNumber ?? null,
        // A carried-over instalment has no day inside this month, so it sits on
        // the first — it belongs to the period, not to a date.
        date: offset === 0 ? r.dateKey : monthStart,
        amortizeMonths: spread,
        amortizePeriod: spread === 1 ? null : offset + 1,
        amortizeTotal: spread === 1 ? null : money(invoiceTotal),
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
  amortizeMonths?: number;
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

  if (input.amortizeMonths !== undefined && table === "monthly_payments") {
    throw new Error("الدفعات الشهرية متكررة بطبيعتها ولا تُوزَّع");
  }

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
  if (input.amortizeMonths !== undefined) {
    // A five-year spread is already generous for kitchen equipment; anything
    // beyond that is a typo, and it would keep the invoice in scope forever.
    const n = Math.trunc(input.amortizeMonths);
    if (!Number.isFinite(n) || n < 1 || n > 60) {
      throw new Error("عدد شهور التوزيع يجب أن يكون بين 1 و 60");
    }
    sets.push("amortizeMonths = ?");
    params.push(n);
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

// ─── Row details (line items) ─────────────────────────────────────────────────
export interface ExpenseRowDetails {
  sourceType: ExpenseSourceType;
  id: number;
  invoiceNumber: string | null;
  vendorName: string | null;
  date: string;
  notes: string | null;
  total: number;
  paid: number;
  remaining: number;
  paymentStatus: string | null;
  expenseType: ExpenseType | null;
  expenseCategoryCode: ExpenseCategoryCode | null;
  paymentMethod: string | null;
  items: Array<{ description: string; qty: number; unit: string | null; unitPrice: number; total: number }>;
  /** Sources that genuinely have no line items, so the UI can say why. */
  itemsUnavailableReason: string | null;
}

/**
 * Loads one expense row with its line items, for the details popup.
 * Two queries at most; monthly payments and daily expenses have no item rows
 * to fetch, which is reported rather than shown as an empty table.
 */
export async function getExpenseRowDetails(input: {
  sourceType: ExpenseSourceType;
  id?: number;
  date?: string;
}): Promise<ExpenseRowDetails> {
  const conn = await getConn();
  try {
    if (input.sourceType === "SUPPLIER_INVOICE") {
      const [[inv]] = (await conn.execute(
        `SELECT id, invoiceNumber, supplierName, notes, totalAmount, paidAmount, remainingAmount,
                paymentStatus, expenseType, expenseCategoryCode, paymentMethod,
                DATE_FORMAT(CONVERT_TZ(invoiceDate,'+00:00','${TZ}'),'%Y-%m-%d') AS dateKey
           FROM invoices WHERE id = ?`,
        [input.id]
      )) as any;
      if (!inv) throw new Error("الفاتورة غير موجودة");

      const [items] = await conn.execute<any[]>(
        `SELECT materialName AS description, quantity AS qty, materialUnit AS unit,
                unitPrice, totalPrice AS total
           FROM invoice_items WHERE invoiceId = ? ORDER BY id`,
        [input.id]
      );

      return {
        sourceType: "SUPPLIER_INVOICE", id: inv.id,
        invoiceNumber: inv.invoiceNumber ?? null, vendorName: inv.supplierName ?? null,
        date: inv.dateKey, notes: inv.notes ?? null,
        total: num(inv.totalAmount), paid: num(inv.paidAmount),
        remaining: num(inv.remainingAmount), paymentStatus: inv.paymentStatus ?? null,
        expenseType: inv.expenseType ?? null, expenseCategoryCode: inv.expenseCategoryCode ?? null,
        paymentMethod: inv.paymentMethod ?? null,
        items: (items as any[]).map((i) => ({
          description: i.description ?? "—", qty: num(i.qty), unit: i.unit ?? null,
          unitPrice: num(i.unitPrice), total: num(i.total),
        })),
        itemsUnavailableReason: null,
      };
    }

    if (input.sourceType === "FREE_INVOICE") {
      const [[inv]] = (await conn.execute(
        `SELECT id, invoiceNumber, supplierName, notes, totalAmount, paidAmount, remainingAmount,
                paymentStatus, expenseType, expenseCategoryCode, paymentMethod,
                DATE_FORMAT(CONVERT_TZ(date,'+00:00','${TZ}'),'%Y-%m-%d') AS dateKey
           FROM free_invoices WHERE id = ?`,
        [input.id]
      )) as any;
      if (!inv) throw new Error("الفاتورة غير موجودة");

      const [items] = await conn.execute<any[]>(
        `SELECT description, qty, unitPrice, total
           FROM free_invoice_items WHERE invoiceId = ? ORDER BY id`,
        [input.id]
      );

      return {
        sourceType: "FREE_INVOICE", id: inv.id,
        invoiceNumber: inv.invoiceNumber ?? null, vendorName: inv.supplierName ?? null,
        date: inv.dateKey, notes: inv.notes ?? null,
        total: num(inv.totalAmount), paid: num(inv.paidAmount),
        remaining: num(inv.remainingAmount), paymentStatus: inv.paymentStatus ?? null,
        expenseType: inv.expenseType ?? null, expenseCategoryCode: inv.expenseCategoryCode ?? null,
        paymentMethod: inv.paymentMethod ?? null,
        items: (items as any[]).map((i) => ({
          description: i.description ?? "—", qty: num(i.qty), unit: null,
          unitPrice: num(i.unitPrice), total: num(i.total),
        })),
        itemsUnavailableReason: null,
      };
    }

    if (input.sourceType === "MONTHLY_PAYMENT") {
      const [[p]] = (await conn.execute(
        `SELECT id, name, category, notes, totalAmount, paidAmount, dueDay, recurrence, status,
                expenseType, expenseCategoryCode, paymentMethod, year, month
           FROM monthly_payments WHERE id = ?`,
        [input.id]
      )) as any;
      if (!p) throw new Error("الدفعة غير موجودة");

      const total = num(p.totalAmount), paid = num(p.paidAmount);
      const lastDay = new Date(p.year, p.month, 0).getDate();
      const day = Math.min(Math.max(Number(p.dueDay) || 1, 1), lastDay);

      return {
        sourceType: "MONTHLY_PAYMENT", id: p.id,
        invoiceNumber: null, vendorName: p.name ?? null,
        date: `${p.year}-${String(p.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        notes: p.notes ?? null,
        total, paid, remaining: Math.max(0, total - paid),
        paymentStatus: total - paid <= 0 && total > 0 ? "paid" : paid > 0 ? "partial" : "deferred",
        expenseType: p.expenseType ?? null, expenseCategoryCode: p.expenseCategoryCode ?? null,
        paymentMethod: p.paymentMethod ?? null,
        items: [],
        itemsUnavailableReason: "الدفعات الشهرية مبلغ واحد وليست فاتورة ببنود",
      };
    }

    // DAILY_EXPENSE — the fixed-expense figure on a daily_accounts row.
    const [[d]] = (await conn.execute(
      `SELECT accountDate, expensesFixed FROM daily_accounts WHERE accountDate = ?`,
      [input.date]
    )) as any;
    if (!d) throw new Error("اليوم غير موجود");
    const amount = num(d.expensesFixed);

    return {
      sourceType: "DAILY_EXPENSE", id: 0,
      invoiceNumber: null, vendorName: null, date: d.accountDate,
      notes: "مصروفات ثابتة مسجّلة يدويًا في الحسابات اليومية",
      total: amount, paid: amount, remaining: 0, paymentStatus: "paid",
      expenseType: "OPERATIONAL", expenseCategoryCode: null, paymentMethod: null,
      items: [],
      itemsUnavailableReason:
        "هذا مبلغ إجمالي مُدخل يدويًا في خانة «المصروفات الثابتة»، وليس فاتورة ببنود",
    };
  } finally {
    conn.release();
  }
}
