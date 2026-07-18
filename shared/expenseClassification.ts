/**
 * Expense classification shared between server and client.
 *
 * These are NEW fields (`expenseType`, `expenseCategoryCode`, `paymentMethod`) added to
 * `invoices` and `free_invoices`. They live alongside the legacy `expenseCategory`
 * enum (operational | maintenance | fixed | other), which is intentionally left
 * untouched: the daily-accounts expense aggregation and the financial KPI both
 * group on those legacy values, so repurposing that column would break them.
 *
 * A record is considered "needs classification" when either new field is null.
 * That is computed, never stored.
 */

// ── نوع المصروف ───────────────────────────────────────────────────────────────
export const EXPENSE_TYPES = ["OPERATIONAL", "NON_OPERATIONAL"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  OPERATIONAL: "تشغيلي",
  NON_OPERATIONAL: "غير تشغيلي",
};

/** Shown when expenseType is null (legacy record the user has not reviewed). */
export const EXPENSE_TYPE_UNSET_LABEL = "غير محدد";

// ── تصنيف المصروف ─────────────────────────────────────────────────────────────
export const EXPENSE_CATEGORY_CODES = [
  "FOOD_PURCHASES",
  "SALARIES",
  "RENT",
  "UTILITIES",
  "GAS",
  "PACKAGING",
  "CLEANING",
  "MAINTENANCE",
  "DELIVERY",
  "APP_COMMISSIONS",
  "MARKETING",
  "BANK_FEES",
  "EQUIPMENT_ASSETS",
  "OWNER_DRAW",
  "TAXES",
  "LICENSES",
  "CHARCOAL",
  "BUTCHERY",
  "OTHER",
] as const;
export type ExpenseCategoryCode = (typeof EXPENSE_CATEGORY_CODES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryCode, string> = {
  FOOD_PURCHASES: "مشتريات غذائية",
  SALARIES: "رواتب وأجور",
  RENT: "إيجار",
  UTILITIES: "كهرباء ومياه",
  GAS: "غاز",
  PACKAGING: "تغليف وتعبئة",
  CLEANING: "نظافة",
  MAINTENANCE: "صيانة",
  DELIVERY: "توصيل",
  APP_COMMISSIONS: "عمولات تطبيقات",
  MARKETING: "تسويق",
  BANK_FEES: "رسوم بنكية",
  EQUIPMENT_ASSETS: "معدات وأصول",
  OWNER_DRAW: "سحب مالك",
  TAXES: "ضرائب",
  LICENSES: "تراخيص",
  CHARCOAL: "فحم",
  BUTCHERY: "ملحمة",
  OTHER: "أخرى",
};

/** Shown when expenseCategoryCode is null. */
export const EXPENSE_CATEGORY_UNSET_LABEL = "غير مصنف";

// ── طريقة الدفع ───────────────────────────────────────────────────────────────
export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CARD: "بطاقة",
  CHEQUE: "شيك",
  OTHER: "أخرى",
};

export const PAYMENT_METHOD_UNSET_LABEL = "—";

// ── مصدر السجل ────────────────────────────────────────────────────────────────
export const EXPENSE_SOURCE_TYPES = [
  "SUPPLIER_INVOICE",
  "FREE_INVOICE",
  "MONTHLY_PAYMENT",
  "DAILY_EXPENSE",
] as const;
export type ExpenseSourceType = (typeof EXPENSE_SOURCE_TYPES)[number];

export const EXPENSE_SOURCE_LABELS: Record<ExpenseSourceType, string> = {
  SUPPLIER_INVOICE: "فاتورة مورد",
  FREE_INVOICE: "فاتورة حرة",
  MONTHLY_PAYMENT: "دفعة شهرية",
  DAILY_EXPENSE: "مصروف يومي",
};

// ── حالة الدفع (legacy values already stored on both invoice tables) ──────────
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "مدفوع",
  deferred: "مؤجل",
  partial: "جزئي",
  under_review: "التدقيق",
};

/**
 * Legacy `expenseCategory` → new (type, category) mapping.
 * Used by the backfill migration and as a read-time fallback so rows that were
 * never backfilled still display something sensible.
 *
 * `null` means "leave unset so the user reviews it".
 */
export const LEGACY_CATEGORY_MAP: Record<
  string,
  { expenseType: ExpenseType | null; expenseCategoryCode: ExpenseCategoryCode | null }
> = {
  operational: { expenseType: "OPERATIONAL", expenseCategoryCode: "OTHER" },
  maintenance: { expenseType: "OPERATIONAL", expenseCategoryCode: "MAINTENANCE" },
  fixed: { expenseType: "OPERATIONAL", expenseCategoryCode: "OTHER" },
  other: { expenseType: null, expenseCategoryCode: "OTHER" },
};

/**
 * `monthly_payments.category` (salaries | rent | utilities | other) → new codes.
 * Three of the four map exactly, so the backfill is lossless.
 */
export const PAYMENT_CATEGORY_MAP: Record<
  string,
  { expenseType: ExpenseType | null; expenseCategoryCode: ExpenseCategoryCode | null }
> = {
  salaries: { expenseType: "OPERATIONAL", expenseCategoryCode: "SALARIES" },
  rent: { expenseType: "OPERATIONAL", expenseCategoryCode: "RENT" },
  utilities: { expenseType: "OPERATIONAL", expenseCategoryCode: "UTILITIES" },
  other: { expenseType: null, expenseCategoryCode: "OTHER" },
};

export function expenseTypeLabel(v: string | null | undefined): string {
  if (!v) return EXPENSE_TYPE_UNSET_LABEL;
  return EXPENSE_TYPE_LABELS[v as ExpenseType] ?? EXPENSE_TYPE_UNSET_LABEL;
}

export function expenseCategoryLabel(v: string | null | undefined): string {
  if (!v) return EXPENSE_CATEGORY_UNSET_LABEL;
  return EXPENSE_CATEGORY_LABELS[v as ExpenseCategoryCode] ?? EXPENSE_CATEGORY_UNSET_LABEL;
}

export function paymentMethodLabel(v: string | null | undefined): string {
  if (!v) return PAYMENT_METHOD_UNSET_LABEL;
  return PAYMENT_METHOD_LABELS[v as PaymentMethod] ?? PAYMENT_METHOD_UNSET_LABEL;
}

/** Computed, never stored. */
export function needsClassification(row: {
  expenseType: string | null | undefined;
  expenseCategoryCode: string | null | undefined;
}): boolean {
  return !row.expenseType || !row.expenseCategoryCode;
}
