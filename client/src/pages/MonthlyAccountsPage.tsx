import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Receipt,
  Search, TrendingUp, AlertTriangle, Info, Settings2, Save, Calculator,
  Sparkles, CheckCircle2, CalendarX, Upload, Trash2,
} from "lucide-react";
import {
  EXPENSE_TYPES, EXPENSE_TYPE_LABELS, EXPENSE_TYPE_UNSET_LABEL,
  EXPENSE_CATEGORY_CODES, EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_UNSET_LABEL,
  EXPENSE_SOURCE_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type ExpenseCategoryCode, type ExpenseType,
} from "@shared/expenseClassification";
import DeleteMonthDialog from "@/components/DeleteMonthDialog";
import SalesImportDialog from "@/components/SalesImportDialog";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

const pct = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}%`;

function getMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("ar-AE", { month: "long", year: "numeric" });
}

function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return day && m ? `${day}/${m}` : d;
}

const SENTINEL_ALL = "__ALL__";

const STATUS_COLORS: Record<string, string> = {
  paid: "text-emerald-600 dark:text-emerald-400",
  deferred: "text-amber-600 dark:text-amber-400",
  partial: "text-blue-600 dark:text-blue-400",
  under_review: "text-purple-600 dark:text-purple-400",
};

const SOURCE_COLORS: Record<string, string> = {
  SUPPLIER_INVOICE: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  FREE_INVOICE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  MONTHLY_PAYMENT: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  DAILY_EXPENSE: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

/** Which expenses make up a drill-down metric. Mirrors the summary buckets exactly. */
type DrillKey =
  | "operational" | "nonOperational" | "foodPurchases"
  | "operationalExFood" | "nonOperationalExFood" | "unclassified";

const DRILL_LABELS: Record<DrillKey, string> = {
  operational: "المصروفات التشغيلية",
  nonOperational: "المصروفات غير التشغيلية",
  foodPurchases: "مشتريات الطعام",
  operationalExFood: "باقي المصروفات التشغيلية",
  nonOperationalExFood: "باقي المصروفات غير التشغيلية",
  unclassified: "مصروفات غير مصنفة",
};

type ExpenseLike = {
  expenseType: string | null;
  expenseCategoryCode: string | null;
};

/** One row of the unified expense table, as returned by monthlyAccounts.getMonth. */
type ExpenseRow = {
  id: number;
  sourceType: string;
  invoiceNumber: string | null;
  date: string;
  vendorName: string | null;
  total: number;
};

/** Shape returned by monthlyAccounts.aiClassify. */
type AiResult = {
  analyzed: number;
  applied: number;
  skippedLowConfidence: number;
  failed: number;
  durationMs: number;
  changes: Array<{
    id: number; sourceType: string; invoiceNumber: string | null; vendorName: string | null;
    fromType: string | null; fromCategory: string | null;
    expenseType: string; expenseCategoryCode: string; confidence: number; reason: string;
  }>;
  skipped: Array<{
    id: number; sourceType: string; invoiceNumber: string | null;
    vendorName: string | null; confidence: number; reason: string;
  }>;
};

function drillFilter(key: DrillKey): (e: ExpenseLike) => boolean {
  const isFood = (e: ExpenseLike) => e.expenseCategoryCode === "FOOD_PURCHASES";
  switch (key) {
    case "operational": return (e) => e.expenseType === "OPERATIONAL";
    case "nonOperational": return (e) => e.expenseType === "NON_OPERATIONAL";
    // Unclassified rows are outside the P&L, so they are outside food purchases too.
    case "foodPurchases": return (e) => !!e.expenseType && isFood(e);
    case "operationalExFood": return (e) => e.expenseType === "OPERATIONAL" && !isFood(e);
    case "nonOperationalExFood": return (e) => e.expenseType === "NON_OPERATIONAL" && !isFood(e);
    case "unclassified": return (e) => !e.expenseType;
  }
}

/** A row in the summary: optional formula tooltip, optional drill-down. */
function SummaryRow({
  label, value, currency, formula, onClick, strong, tone, prefix,
}: {
  label: string; value: string; currency?: string; formula?: string;
  onClick?: () => void; strong?: boolean; tone?: "profit" | "loss" | "neutral"; prefix?: string;
}) {
  const toneClass =
    tone === "profit" ? "text-emerald-700 dark:text-emerald-400"
    : tone === "loss" ? "text-rose-700 dark:text-rose-400"
    : "";
  const text = `${prefix ? prefix + " " : ""}${value}${currency ? " " + currency : ""}`;
  return (
    <div className={`flex items-center justify-between gap-2 py-2 border-b last:border-b-0 ${strong ? "font-bold" : ""}`}>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {formula && (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={`معادلة ${label}`} className="opacity-60 hover:opacity-100">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[300px] text-right whitespace-pre-line">
                {formula}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      {onClick ? (
        <button
          type="button" onClick={onClick}
          className={`text-sm tabular-nums underline decoration-dotted underline-offset-4 hover:opacity-70 ${toneClass}`}
        >
          {text}
        </button>
      ) : (
        <span className={`text-sm tabular-nums ${toneClass}`}>{text}</span>
      )}
    </div>
  );
}

export default function MonthlyAccountsPage() {
  const today = new Date();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "warehouse_manager";

  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [salesOpen, setSalesOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [drill, setDrill] = useState<DrillKey | null>(null);
  const [showDeleteMonth, setShowDeleteMonth] = useState(false);
  const [showSalesImport, setShowSalesImport] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<ExpenseRow | null>(null);

  // Expense table filters — client-side, so they never affect the summary.
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState<string>(SENTINEL_ALL);
  const [fCategory, setFCategory] = useState<string>(SENTINEL_ALL);
  const [fSource, setFSource] = useState<string>(SENTINEL_ALL);
  const [fStatus, setFStatus] = useState<string>(SENTINEL_ALL);

  const { data, isLoading, isFetching, isError, error, refetch } =
    trpc.monthlyAccounts.getMonth.useQuery(
      { year: selectedYear, month: selectedMonth },
      { refetchOnWindowFocus: true }
    );

  const utils = trpc.useUtils();
  const invalidate = () => utils.monthlyAccounts.getMonth.invalidate();

  const updateClassification = trpc.monthlyAccounts.updateClassification.useMutation({
    onSuccess: () => { toast.success("تم حفظ التصنيف"); invalidate(); },
    onError: (e) => toast.error(e.message || "تعذّر حفظ التصنيف"),
  });

  const deleteRow = trpc.monthlyAccounts.deleteExpenseRow.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.clearedOnly ? "تم تصفير المصروف الثابت لهذا اليوم" : "تم حذف السجل"
      );
      if (r.stockWentNegative && r.stockWentNegative.length > 0) {
        toast.warning(`${r.stockWentNegative.length} مادة كانت ستصبح كميتها سالبة — تم ضبطها على صفر`);
      }
      setRowToDelete(null);
      invalidate();
    },
    onError: (e) => { toast.error(e.message || "تعذّر الحذف"); setRowToDelete(null); },
  });

  const saveSettings = trpc.monthlyAccounts.saveSettings.useMutation({
    onSuccess: () => { toast.success("تم حفظ إعدادات الشهر"); invalidate(); },
    onError: (e) => toast.error(e.message || "تعذّر حفظ الإعدادات"),
  });

  // ── AI classification ──
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiScopeAll, setAiScopeAll] = useState(false);
  const isAdmin = user?.role === "admin";
  const aiClassify = trpc.monthlyAccounts.aiClassify.useMutation({
    onSuccess: (r) => {
      setAiResult(r);
      if (r.applied > 0) toast.success(`تم تصنيف ${r.applied} فاتورة`);
      else if (r.analyzed === 0) toast.info("لا توجد فواتير تحتاج تصنيفًا");
      else toast.warning("لم يتم تطبيق أي تصنيف — راجع التفاصيل");
      invalidate();
    },
    onError: (e) => toast.error(e.message || "تعذّر تشغيل التصنيف الذكي"),
  });

  // ── Settings form, re-seeded when the month's stored values arrive ──
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("0");
  const [discounts, setDiscounts] = useState("0");
  const s = data?.settings;
  useEffect(() => {
    if (!s) return;
    setOpening(String(s.openingInventory));
    setClosing(String(s.closingInventory));
    setDiscounts(String(s.discounts));
  }, [s?.year, s?.month, s?.openingInventory, s?.closingInventory, s?.discounts]);

  const prevMonth = () => {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear((y) => y - 1); }
    else setSelectedMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear((y) => y + 1); }
    else setSelectedMonth((m) => m + 1);
  };

  const resetFilters = () => {
    setSearch(""); setFType(SENTINEL_ALL); setFCategory(SENTINEL_ALL);
    setFSource(SENTINEL_ALL); setFStatus(SENTINEL_ALL);
  };

  const dailySales = data?.dailySales ?? [];
  const totals = data?.salesTotals;
  const allExpenses = data?.expenses ?? [];
  const summary = data?.summary;
  const currency = data?.currency ?? "د.إ";
  const warn = summary?.warnings;

  // ── Client-side filtering, for the table only ──
  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allExpenses.filter((e) => {
      if (fType !== SENTINEL_ALL && (e.expenseType ?? "") !== fType) return false;
      if (fCategory !== SENTINEL_ALL && (e.expenseCategoryCode ?? "") !== fCategory) return false;
      if (fSource !== SENTINEL_ALL && e.sourceType !== fSource) return false;
      if (fStatus !== SENTINEL_ALL && (e.paymentStatus ?? "") !== fStatus) return false;
      if (q && !`${e.invoiceNumber ?? ""} ${e.vendorName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allExpenses, search, fType, fCategory, fSource, fStatus]);

  const filteredTotals = useMemo(
    () => filteredExpenses.reduce(
      (a, e) => ({
        total: a.total + e.total, paid: a.paid + e.paid,
        remaining: a.remaining + e.remaining, count: a.count + 1,
      }),
      { total: 0, paid: 0, remaining: 0, count: 0 }
    ),
    [filteredExpenses]
  );

  const drillRows = useMemo(
    () => (drill ? allExpenses.filter(drillFilter(drill)) : []),
    [drill, allExpenses]
  );
  const drillTotal = drillRows.reduce((sum, e) => sum + e.total, 0);

  const hasFilters =
    search.trim() !== "" || [fType, fCategory, fSource, fStatus].some((v) => v !== SENTINEL_ALL);

  const netProfit = summary?.profits.netProfitAfterInventory ?? 0;

  /**
   * Profit lines never render a bare negative number — a loss is shown as
   * "خسارة 1,234.00" in red, a profit as "ربح 1,234.00" in green.
   */
  const profitProps = (n: number) => ({
    value: fmt(Math.abs(n)),
    prefix: n > 0 ? "ربح" : n < 0 ? "خسارة" : "",
    tone: (n > 0 ? "profit" : n < 0 ? "loss" : "neutral") as "profit" | "loss" | "neutral",
  });

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">الحسابات الشهرية</h1>
            {data?.restaurantName && (
              <p className="text-xs text-muted-foreground">{data.restaurantName}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-2 w-fit">
            <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="الشهر السابق">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base min-w-[140px] text-center">
              {getMonthLabel(selectedYear, selectedMonth)}
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="الشهر التالي">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            تحديث البيانات
          </Button>
        </div>
      </div>

      {isError && (
        <Card className="border-destructive/40">
          <CardContent className="py-6 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
            <p className="text-sm text-destructive">
              تعذّر تحميل بيانات الشهر: {error?.message ?? "خطأ غير معروف"}
            </p>
            <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {isLoading && !isError && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            جارٍ تحميل بيانات الشهر…
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && summary && (
        <>
          {/* ══ Warnings ══ */}
          {(warn?.unclassifiedInvoicesCount ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  يوجد {warn!.unclassifiedInvoicesCount} فاتورة بقيمة{" "}
                  {fmt(warn!.unclassifiedInvoicesAmount)} {currency} تحتاج إلى تصنيف.
                </p>
                <p className="text-amber-700 dark:text-amber-400">
                  هذه المصروفات غير داخلة في النتائج، وصافي الربح مؤقت حتى يتم تصنيفها.
                </p>
              </div>
            </div>
          )}
          {warn?.hasInvalidInventory && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-sm text-rose-800 dark:text-rose-300 space-y-0.5">
                <p className="font-semibold">قيم المخزون تحتاج مراجعة:</p>
                {warn.negativeOpeningInventory && <p>• مخزون أول الشهر سالب.</p>}
                {warn.negativeClosingInventory && <p>• مخزون آخر الشهر سالب.</p>}
                {warn.negativeFoodCost && <p>• تكلفة الطعام الناتجة سالبة.</p>}
                {warn.closingInventoryTooHigh && (
                  <p>• مخزون آخر الشهر أكبر من مخزون أول الشهر + مشتريات الطعام.</p>
                )}
              </div>
            </div>
          )}
          {warn?.discountsExceedSales && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 p-3 text-sm text-rose-800 dark:text-rose-300">
              الخصومات أكبر من إجمالي المبيعات — تم اعتبار صافي المبيعات صفرًا.
            </div>
          )}
          {(warn?.nonOperationalFoodPurchasesCount ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
              يوجد {warn!.nonOperationalFoodPurchasesCount} فاتورة «مشتريات غذائية» مصنفة
              كـ«غير تشغيلي» — تحتاج مراجعة.
            </div>
          )}

          {/* ══ Month settings ══ */}
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer select-none">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-slate-600" />
                      إعدادات الشهر
                      {s?.isNew && <Badge variant="secondary">لم تُحفظ بعد</Badge>}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">السنة</Label>
                      <Input value={selectedYear} readOnly className="h-9 bg-muted/40" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">الشهر</Label>
                      <Input value={getMonthLabel(selectedYear, selectedMonth)} readOnly className="h-9 bg-muted/40" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">اسم المطعم</Label>
                      <Input value={data?.restaurantName ?? ""} readOnly className="h-9 bg-muted/40" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="opening">مخزون أول الشهر ({currency})</Label>
                      <Input
                        id="opening" type="number" min="0" step="0.001" inputMode="decimal"
                        value={opening} onChange={(e) => setOpening(e.target.value)}
                        disabled={!canEdit} className="h-9"
                      />
                      {s?.suggestedFromPreviousMonth && s.isNew && (
                        <p className="text-[11px] text-muted-foreground">
                          مقترح من مخزون آخر الشهر السابق — يمكنك تعديله.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="closing">مخزون آخر الشهر ({currency})</Label>
                      <Input
                        id="closing" type="number" min="0" step="0.001" inputMode="decimal"
                        value={closing} onChange={(e) => setClosing(e.target.value)}
                        disabled={!canEdit} className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs" htmlFor="discounts">الخصومات الشهرية ({currency})</Label>
                      <Input
                        id="discounts" type="number" min="0" step="0.001" inputMode="decimal"
                        value={discounts} onChange={(e) => setDiscounts(e.target.value)}
                        disabled={!canEdit} className="h-9"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        إدخال يدوي — الحسابات اليومية لا تسجّل خصومات.
                      </p>
                    </div>
                  </div>

                  {canEdit ? (
                    <Button
                      onClick={() =>
                        saveSettings.mutate({
                          year: selectedYear, month: selectedMonth,
                          openingInventory: Math.max(0, parseFloat(opening) || 0),
                          closingInventory: Math.max(0, parseFloat(closing) || 0),
                          discounts: Math.max(0, parseFloat(discounts) || 0),
                        })
                      }
                      disabled={saveSettings.isPending}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {saveSettings.isPending ? "جارٍ الحفظ…" : "حفظ"}
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">ليس لديك صلاحية تعديل إعدادات الشهر.</p>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ══ Summary ══ */}
          <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer select-none">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-primary" />
                      ملخص الشهر
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${summaryOpen ? "rotate-180" : ""}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
                    {/* ── Group 1: activity ── */}
                    <div>
                      <h3 className="text-sm font-bold mb-2 pb-2 border-b-2 border-violet-400">ملخص النشاط</h3>
                      <SummaryRow label="إجمالي المبيعات" value={fmt(summary.sales.totalSales)} currency={currency} />
                      <SummaryRow label="إجمالي الخصومات" value={fmt(summary.sales.totalDiscounts)} currency={currency} />
                      <SummaryRow
                        label="صافي المبيعات" value={fmt(summary.sales.netSales)} currency={currency} strong
                        formula={"صافي المبيعات =\nإجمالي المبيعات − إجمالي الخصومات"}
                      />
                      <SummaryRow
                        label="المصروفات التشغيلية" value={fmt(summary.recordedExpenses.operational)} currency={currency}
                        onClick={() => setDrill("operational")}
                      />
                      <SummaryRow
                        label="المصروفات غير التشغيلية" value={fmt(summary.recordedExpenses.nonOperational)} currency={currency}
                        onClick={() => setDrill("nonOperational")}
                      />
                      {summary.recordedExpenses.unclassified > 0 && (
                        <SummaryRow
                          label="مصروفات غير مصنفة (خارج النتائج)"
                          value={fmt(summary.recordedExpenses.unclassified)} currency={currency}
                          onClick={() => setDrill("unclassified")}
                        />
                      )}
                      <SummaryRow
                        label="إجمالي المصروفات المسجلة" value={fmt(summary.recordedExpenses.totalRecorded)}
                        currency={currency} strong
                        formula={"إجمالي المصروفات المسجلة =\nالتشغيلية + غير التشغيلية\n\n(المصروفات غير المصنفة غير داخلة)"}
                      />
                      <SummaryRow
                        label="الربح قبل تسوية المخزون" currency={currency} strong
                        {...profitProps(summary.profits.profitBeforeInventory)}
                        formula={"الربح قبل تسوية المخزون =\nصافي المبيعات − إجمالي المصروفات المسجلة"}
                      />
                    </div>

                    {/* ── Group 2: inventory settlement & result ── */}
                    <div>
                      <h3 className="text-sm font-bold mb-2 pb-2 border-b-2 border-emerald-400">تسوية المخزون والنتيجة</h3>
                      <SummaryRow label="مخزون أول الشهر" value={fmt(summary.inventory.openingInventory)} currency={currency} />
                      <SummaryRow
                        label="مشتريات الطعام" value={fmt(summary.inventory.foodPurchases)} currency={currency}
                        onClick={() => setDrill("foodPurchases")}
                      />
                      <SummaryRow label="مخزون آخر الشهر" value={fmt(summary.inventory.closingInventory)} currency={currency} />
                      <SummaryRow
                        label="تكلفة الطعام الفعلية" value={fmt(summary.inventory.foodCost)} currency={currency} strong
                        formula={"تكلفة الطعام =\nمخزون أول الشهر + مشتريات الطعام − مخزون آخر الشهر"}
                      />
                      <SummaryRow
                        label="نسبة تكلفة الطعام" value={pct(summary.inventory.foodCostPercentage)}
                        formula={"نسبة تكلفة الطعام =\nتكلفة الطعام ÷ صافي المبيعات × 100"}
                      />
                      <SummaryRow label="مجمل الربح بعد تكلفة الطعام" currency={currency} {...profitProps(summary.profits.grossProfitAfterFoodCost)} />
                      <SummaryRow
                        label="باقي المصروفات التشغيلية" value={fmt(summary.profits.operationalExcludingFood)} currency={currency}
                        onClick={() => setDrill("operationalExFood")}
                      />
                      <SummaryRow
                        label="باقي المصروفات غير التشغيلية" value={fmt(summary.profits.nonOperationalExcludingFood)} currency={currency}
                        onClick={() => setDrill("nonOperationalExFood")}
                      />
                      <SummaryRow label="الربح التشغيلي" currency={currency} {...profitProps(summary.profits.operatingProfit)} />
                      <SummaryRow
                        label="إجمالي المصروفات بعد التسوية" value={fmt(summary.profits.adjustedTotalExpenses)} currency={currency}
                        formula={"إجمالي المصروفات بعد التسوية =\nتكلفة الطعام + باقي التشغيلية + باقي غير التشغيلية\n\n(مشتريات الطعام لا تُحتسب مرة أخرى)"}
                      />
                      <SummaryRow
                        label="صافي الربح أو الخسارة" currency={currency} strong
                        {...profitProps(netProfit)}
                        formula={"صافي الربح =\nصافي المبيعات − تكلفة الطعام − باقي التشغيلية − باقي غير التشغيلية\n\nتحقق بديل:\nالربح قبل التسوية + مشتريات الطعام − تكلفة الطعام"}
                      />
                      <SummaryRow label="هامش صافي الربح" value={pct(summary.profits.netProfitMargin)} tone={profitProps(netProfit).tone} />
                      <SummaryRow label="أكل الموظفين" value={fmt(summary.staffMeals.total)} currency={currency} />
                      <SummaryRow
                        label="نسبة أكل الموظفين" value={pct(summary.staffMeals.percentage)}
                        formula={"مؤشر تحليلي فقط — غير مخصوم من صافي الربح،\nلأنه مستهلك من نفس مخزون الطعام."}
                      />
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ══ Daily sales ══ */}
          <Collapsible open={salesOpen} onOpenChange={setSalesOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer select-none">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-violet-600" />
                      المبيعات اليومية
                      <Badge variant="secondary">{dailySales.length} يوم</Badge>
                      {canEdit && (
                        <Button
                          variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); setShowSalesImport(true); }}
                          title="رفع مبيعات الأيام من ملف إكسل"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          رفع مبيعات
                        </Button>
                      )}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${salesOpen ? "rotate-180" : ""}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {dailySales.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      لا توجد بيانات مبيعات لهذا الشهر
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse min-w-[820px]">
                        <thead>
                          <tr className="bg-violet-50 dark:bg-violet-950/40">
                            <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">التاريخ</th>
                            <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">اليوم</th>
                            {["نقدي", "بطاقة", "كيتا", "طلبات", "كريم", "ديلفروا", "نون"].map((h) => (
                              <th key={h} className="px-2 py-2 text-center font-semibold whitespace-nowrap">{h}</th>
                            ))}
                            <th className="px-2 py-2 text-center font-semibold whitespace-nowrap border-r border-violet-200 dark:border-violet-800">
                              إجمالي المبيعات
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailySales.map((d, idx) => (
                            <tr key={d.date} className={idx % 2 === 0 ? "bg-white dark:bg-card" : "bg-muted/20"}>
                              <td className="px-2 py-1.5 whitespace-nowrap">{shortDate(d.date)}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{d.dayName}</td>
                              <td className="px-2 py-1.5 text-center">{fmt(d.cash)}</td>
                              <td className="px-2 py-1.5 text-center">{fmt(d.card)}</td>
                              <td className="px-2 py-1.5 text-center">{fmt(d.kita)}</td>
                              <td className="px-2 py-1.5 text-center">{fmt(d.orders)}</td>
                              <td className="px-2 py-1.5 text-center">{fmt(d.careem)}</td>
                              <td className="px-2 py-1.5 text-center">{fmt(d.deliveroo)}</td>
                              <td className="px-2 py-1.5 text-center">{fmt(d.noon)}</td>
                              <td className="px-2 py-1.5 text-center font-semibold text-violet-700 dark:text-violet-300 border-r border-violet-100 dark:border-violet-900">
                                {fmt(d.totalSales)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {totals && (
                          <tfoot>
                            <tr className="bg-violet-100 dark:bg-violet-950/70 font-bold">
                              <td className="px-2 py-2" colSpan={2}>الإجمالي</td>
                              <td className="px-2 py-2 text-center">{fmt(totals.cash)}</td>
                              <td className="px-2 py-2 text-center">{fmt(totals.card)}</td>
                              <td className="px-2 py-2 text-center">{fmt(totals.kita)}</td>
                              <td className="px-2 py-2 text-center">{fmt(totals.orders)}</td>
                              <td className="px-2 py-2 text-center">{fmt(totals.careem)}</td>
                              <td className="px-2 py-2 text-center">{fmt(totals.deliveroo)}</td>
                              <td className="px-2 py-2 text-center">{fmt(totals.noon)}</td>
                              <td className="px-2 py-2 text-center text-violet-800 dark:text-violet-200 border-r border-violet-200 dark:border-violet-800">
                                {fmt(totals.totalSales)} {currency}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* ══ Expenses ══ */}
          <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer select-none">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2 flex-wrap">
                      <Receipt className="w-5 h-5 text-rose-600" />
                      المصروفات والفواتير
                      <Badge variant="secondary">{filteredExpenses.length} سجل</Badge>
                      {(data?.needsClassificationCount ?? 0) > 0 && (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {data?.needsClassificationCount} يحتاج تصنيف
                        </Badge>
                      )}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${expensesOpen ? "rotate-180" : ""}`} />
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative">
                      <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث برقم الفاتورة أو المورد" className="pr-8 h-9 w-[240px]"
                      />
                    </div>
                    <Select value={fSource} onValueChange={setFSource}>
                      <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="المصدر" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SENTINEL_ALL}>كل المصادر</SelectItem>
                        {Object.entries(EXPENSE_SOURCE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={fType} onValueChange={setFType}>
                      <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="نوع المصروف" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SENTINEL_ALL}>كل الأنواع</SelectItem>
                        {EXPENSE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={fCategory} onValueChange={setFCategory}>
                      <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="التصنيف" /></SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        <SelectItem value={SENTINEL_ALL}>كل التصنيفات</SelectItem>
                        {EXPENSE_CATEGORY_CODES.map((c) => (
                          <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={fStatus} onValueChange={setFStatus}>
                      <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="حالة الدفع" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SENTINEL_ALL}>كل الحالات</SelectItem>
                        {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hasFilters && <Button variant="ghost" size="sm" onClick={resetFilters}>مسح الفلاتر</Button>}

                    {isAdmin && (
                      <Button
                        variant="outline"
                        onClick={() => setShowDeleteMonth(true)}
                        className="gap-2 border-rose-400 text-rose-700 hover:bg-rose-50 dark:border-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/30"
                        title="حذف كل فواتير هذا الشهر"
                      >
                        <CalendarX className="w-4 h-4" />
                        حذف فواتير الشهر
                      </Button>
                    )}

                    {/* AI classification — admin only, writes to financial records */}
                    {isAdmin && (
                      <div className="flex items-center gap-2 ms-auto">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox" checked={aiScopeAll}
                            onChange={(e) => setAiScopeAll(e.target.checked)}
                            className="accent-primary"
                          />
                          إعادة تصنيف الكل
                        </label>
                        <Button
                          variant="outline"
                          onClick={() => aiClassify.mutate({
                            year: selectedYear, month: selectedMonth,
                            onlyUnclassified: !aiScopeAll,
                          })}
                          disabled={aiClassify.isPending}
                          className="gap-2 border-violet-400 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950"
                          title="يحلّل بنود كل فاتورة واسم المورد ويقترح نوع وتصنيف المصروف كخبير محاسبي"
                        >
                          <Sparkles className={`w-4 h-4 ${aiClassify.isPending ? "animate-pulse" : ""}`} />
                          {aiClassify.isPending ? "جارٍ التحليل…" : "تصنيف بالذكاء الاصطناعي"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {aiClassify.isPending && (
                    <p className="text-xs text-muted-foreground">
                      يتم تحليل الفواتير على دفعات — قد يستغرق ذلك دقيقة حسب عددها.
                    </p>
                  )}

                  {filteredExpenses.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      {hasFilters ? "لا توجد نتائج مطابقة للفلاتر" : "لا توجد مصروفات أو فواتير لهذا الشهر"}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse min-w-[1200px]">
                        <thead>
                          <tr className="bg-rose-50 dark:bg-rose-950/40">
                            {["التاريخ", "رقم الفاتورة", "المورد / الجهة", "المصدر", "البيان", "نوع المصروف", "تصنيف المصروف", "طريقة الدفع", "الإجمالي", "المدفوع", "المتبقي", "حالة الدفع", "إجراءات"].map((h) => (
                              <th key={h} className="px-2 py-2 text-center font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredExpenses.map((e, idx) => (
                            <tr key={`${e.sourceType}-${e.id}-${e.date}`} className={idx % 2 === 0 ? "bg-white dark:bg-card" : "bg-muted/20"}>
                              <td className="px-2 py-1.5 whitespace-nowrap">{shortDate(e.date)}</td>
                              <td className="px-2 py-1.5 whitespace-nowrap text-xs">
                                {e.invoiceNumber || <span className="opacity-30">—</span>}
                              </td>
                              <td className="px-2 py-1.5 max-w-[180px] truncate" title={e.vendorName ?? ""}>
                                {e.vendorName || <span className="opacity-30">—</span>}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${SOURCE_COLORS[e.sourceType] ?? ""}`}>
                                  {EXPENSE_SOURCE_LABELS[e.sourceType]}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 max-w-[200px] truncate text-xs text-muted-foreground" title={e.description ?? ""}>
                                {e.description || <span className="opacity-30">—</span>}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {e.editable && canEdit ? (
                                  <Select
                                    value={e.expenseType ?? ""}
                                    onValueChange={(val) => updateClassification.mutate({
                                      id: e.id,
                                      sourceType: e.sourceType as "SUPPLIER_INVOICE" | "FREE_INVOICE" | "MONTHLY_PAYMENT",
                                      expenseType: val as ExpenseType,
                                    })}
                                    disabled={updateClassification.isPending}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[110px] border-dashed mx-auto">
                                      <SelectValue placeholder={EXPENSE_TYPE_UNSET_LABEL}>
                                        {e.expenseType ? EXPENSE_TYPE_LABELS[e.expenseType] : EXPENSE_TYPE_UNSET_LABEL}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {EXPENSE_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{EXPENSE_TYPE_LABELS[t]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs">
                                    {e.expenseType ? EXPENSE_TYPE_LABELS[e.expenseType] : EXPENSE_TYPE_UNSET_LABEL}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {e.editable && canEdit ? (
                                  <Select
                                    value={e.expenseCategoryCode ?? ""}
                                    onValueChange={(val) => updateClassification.mutate({
                                      id: e.id,
                                      sourceType: e.sourceType as "SUPPLIER_INVOICE" | "FREE_INVOICE" | "MONTHLY_PAYMENT",
                                      expenseCategoryCode: val as ExpenseCategoryCode,
                                    })}
                                    disabled={updateClassification.isPending}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[140px] border-dashed mx-auto">
                                      <SelectValue placeholder={EXPENSE_CATEGORY_UNSET_LABEL}>
                                        {e.expenseCategoryCode ? EXPENSE_CATEGORY_LABELS[e.expenseCategoryCode] : EXPENSE_CATEGORY_UNSET_LABEL}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[300px]">
                                      {EXPENSE_CATEGORY_CODES.map((c) => (
                                        <SelectItem key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs">
                                    {e.expenseCategoryCode ? EXPENSE_CATEGORY_LABELS[e.expenseCategoryCode] : EXPENSE_CATEGORY_UNSET_LABEL}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {e.editable && canEdit ? (
                                  <Select
                                    value={e.paymentMethod ?? ""}
                                    onValueChange={(val) => updateClassification.mutate({
                                      id: e.id,
                                      sourceType: e.sourceType as "SUPPLIER_INVOICE" | "FREE_INVOICE" | "MONTHLY_PAYMENT",
                                      paymentMethod: val as (typeof PAYMENT_METHODS)[number],
                                    })}
                                    disabled={updateClassification.isPending}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[110px] border-dashed mx-auto">
                                      <SelectValue placeholder="—">
                                        {e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod as (typeof PAYMENT_METHODS)[number]] : "—"}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {PAYMENT_METHODS.map((p) => (
                                        <SelectItem key={p} value={p}>{PAYMENT_METHOD_LABELS[p]}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs opacity-50">—</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">{fmt(e.total)}</td>
                              <td className="px-2 py-1.5 text-center text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{fmt(e.paid)}</td>
                              <td className="px-2 py-1.5 text-center text-amber-700 dark:text-amber-400 whitespace-nowrap">{fmt(e.remaining)}</td>
                              <td className="px-2 py-1.5 text-center whitespace-nowrap">
                                <span className={`text-xs font-medium ${STATUS_COLORS[e.paymentStatus ?? ""] ?? ""}`}>
                                  {PAYMENT_STATUS_LABELS[e.paymentStatus ?? ""] ?? "—"}
                                </span>
                                {e.needsClassification && (
                                  <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">يحتاج تصنيف</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => setRowToDelete(e)}
                                    disabled={deleteRow.isPending}
                                    className="text-rose-600 hover:text-rose-800 dark:hover:text-rose-400 disabled:opacity-40"
                                    title={e.sourceType === "DAILY_EXPENSE"
                                      ? "تصفير المصروف الثابت لهذا اليوم"
                                      : "حذف هذا السجل"}
                                    aria-label="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-rose-100 dark:bg-rose-950/70 font-bold">
                            <td className="px-2 py-2" colSpan={8}>الإجمالي ({filteredTotals.count} سجل)</td>
                            <td className="px-2 py-2 text-center whitespace-nowrap">{fmt(filteredTotals.total)}</td>
                            <td className="px-2 py-2 text-center whitespace-nowrap">{fmt(filteredTotals.paid)}</td>
                            <td className="px-2 py-2 text-center whitespace-nowrap">{fmt(filteredTotals.remaining)}</td>
                            <td className="px-2 py-2" />
                            <td className="px-2 py-2" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </>
      )}

      <AlertDialog open={rowToDelete !== null} onOpenChange={(o) => !o && setRowToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rowToDelete?.sourceType === "DAILY_EXPENSE"
                ? "تصفير المصروف الثابت؟"
                : "حذف هذا السجل؟"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {rowToDelete && (
                <span className="block">
                  <span className="font-semibold text-foreground">
                    {rowToDelete.vendorName || rowToDelete.invoiceNumber || "—"}
                  </span>
                  {" — "}{fmt(rowToDelete.total)} {currency} — {shortDate(rowToDelete.date)}
                </span>
              )}
              {rowToDelete?.sourceType === "DAILY_EXPENSE" && (
                <span className="block text-amber-700 dark:text-amber-400">
                  هذا ليس فاتورة، بل خانة «المصروفات الثابتة» في يوم الحسابات اليومية.
                  سيتم تصفيرها فقط، ولن تتأثر مبيعات هذا اليوم أو أي بيانات أخرى فيه.
                </span>
              )}
              {rowToDelete?.sourceType === "SUPPLIER_INVOICE" && (
                <span className="block text-amber-700 dark:text-amber-400">
                  فاتورة مورد — سيتم عكس كميات المخزون ومتوسط التكلفة تلقائيًا.
                </span>
              )}
              <span className="block">لا يمكن التراجع عن هذه العملية.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRow.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteRow.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!rowToDelete) return;
                deleteRow.mutate({
                  source: rowToDelete.sourceType as "SUPPLIER_INVOICE" | "FREE_INVOICE" | "MONTHLY_PAYMENT" | "DAILY_EXPENSE",
                  ...(rowToDelete.sourceType === "DAILY_EXPENSE"
                    ? { date: rowToDelete.date }
                    : { id: rowToDelete.id }),
                });
              }}
            >
              {deleteRow.isPending ? "جارٍ…" : (rowToDelete?.sourceType === "DAILY_EXPENSE" ? "تصفير" : "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SalesImportDialog
        open={showSalesImport}
        onOpenChange={setShowSalesImport}
        currency={currency}
        onImported={invalidate}
      />

      <DeleteMonthDialog
        open={showDeleteMonth}
        onOpenChange={setShowDeleteMonth}
        year={selectedYear}
        month={selectedMonth}
        currency={currency}
        onDeleted={invalidate}
      />

      {/* ══ AI classification report ══ */}
      <Dialog open={aiResult !== null} onOpenChange={(o) => !o && setAiResult(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-600" />
              نتيجة التصنيف بالذكاء الاصطناعي
            </DialogTitle>
            <DialogDescription>
              تم تحليل {aiResult?.analyzed ?? 0} فاتورة في{" "}
              {(((aiResult?.durationMs ?? 0) / 1000)).toFixed(1)} ثانية
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2 shrink-0">
            <div className="rounded-lg border p-2 text-center">
              <div className="text-xs text-muted-foreground">تم تصنيفها</div>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {aiResult?.applied ?? 0}
              </div>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <div className="text-xs text-muted-foreground">تُركت للمراجعة</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                {aiResult?.skippedLowConfidence ?? 0}
              </div>
            </div>
            <div className="rounded-lg border p-2 text-center">
              <div className="text-xs text-muted-foreground">تعذّر تصنيفها</div>
              <div className="text-lg font-bold text-muted-foreground">{aiResult?.failed ?? 0}</div>
            </div>
          </div>

          <div className="overflow-auto mt-2">
            {(aiResult?.changes.length ?? 0) > 0 && (
              <>
                <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  التصنيفات المطبّقة
                </h4>
                <table className="w-full text-sm border-collapse min-w-[760px] mb-4">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {["رقم الفاتورة", "المورد / الجهة", "من", "إلى", "النوع", "الثقة", "السبب"].map((h) => (
                        <th key={h} className="px-2 py-2 text-center font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiResult!.changes.map((c, i) => (
                      <tr key={`${c.sourceType}-${c.id}-${i}`} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap">{c.invoiceNumber || "—"}</td>
                        <td className="px-2 py-1.5 max-w-[150px] truncate" title={c.vendorName ?? ""}>{c.vendorName || "—"}</td>
                        <td className="px-2 py-1.5 text-center text-xs text-muted-foreground whitespace-nowrap">
                          {c.fromCategory
                            ? EXPENSE_CATEGORY_LABELS[c.fromCategory as ExpenseCategoryCode]
                            : EXPENSE_CATEGORY_UNSET_LABEL}
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs font-semibold whitespace-nowrap">
                          {EXPENSE_CATEGORY_LABELS[c.expenseCategoryCode as ExpenseCategoryCode]}
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs whitespace-nowrap">
                          {EXPENSE_TYPE_LABELS[c.expenseType as ExpenseType]}
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs tabular-nums">
                          {Math.round(c.confidence * 100)}%
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground max-w-[220px] truncate" title={c.reason}>
                          {c.reason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {(aiResult?.skipped.length ?? 0) > 0 && (
              <>
                <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  تُركت للمراجعة اليدوية (ثقة منخفضة)
                </h4>
                <table className="w-full text-sm border-collapse min-w-[600px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {["رقم الفاتورة", "المورد / الجهة", "الثقة", "الملاحظة"].map((h) => (
                        <th key={h} className="px-2 py-2 text-center font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aiResult!.skipped.map((c, i) => (
                      <tr key={`sk-${c.sourceType}-${c.id}-${i}`} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap">{c.invoiceNumber || "—"}</td>
                        <td className="px-2 py-1.5 max-w-[180px] truncate" title={c.vendorName ?? ""}>{c.vendorName || "—"}</td>
                        <td className="px-2 py-1.5 text-center text-xs tabular-nums">{Math.round(c.confidence * 100)}%</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{c.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {aiResult && aiResult.changes.length === 0 && aiResult.skipped.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {aiResult.analyzed === 0
                  ? "لا توجد فواتير تحتاج تصنيفًا في هذا الشهر."
                  : "لم يُطبَّق أي تصنيف."}
              </p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground shrink-0 pt-2 border-t">
            التصنيفات المطبّقة قابلة للتعديل يدويًا من جدول المصروفات في أي وقت.
          </p>
        </DialogContent>
      </Dialog>

      {/* ══ Drill-down ══ */}
      <Dialog open={drill !== null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle>{drill ? DRILL_LABELS[drill] : ""}</DialogTitle>
            <DialogDescription>
              {drillRows.length} سجل — الإجمالي {fmt(drillTotal)} {currency}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto">
            {drillRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">لا توجد سجلات</p>
            ) : (
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    {["التاريخ", "رقم الفاتورة", "المورد / الجهة", "نوع المصروف", "تصنيف المصروف", "المصدر", "الإجمالي", "المدفوع", "المتبقي"].map((h) => (
                      <th key={h} className="px-2 py-2 text-center font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillRows.map((e, i) => (
                    <tr key={`${e.sourceType}-${e.id}-${e.date}-${i}`} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{shortDate(e.date)}</td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">{e.invoiceNumber || "—"}</td>
                      <td className="px-2 py-1.5 max-w-[180px] truncate" title={e.vendorName ?? ""}>{e.vendorName || "—"}</td>
                      <td className="px-2 py-1.5 text-center text-xs">
                        {e.expenseType ? EXPENSE_TYPE_LABELS[e.expenseType] : EXPENSE_TYPE_UNSET_LABEL}
                      </td>
                      <td className="px-2 py-1.5 text-center text-xs">
                        {e.expenseCategoryCode ? EXPENSE_CATEGORY_LABELS[e.expenseCategoryCode] : EXPENSE_CATEGORY_UNSET_LABEL}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${SOURCE_COLORS[e.sourceType] ?? ""}`}>
                          {EXPENSE_SOURCE_LABELS[e.sourceType]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">{fmt(e.total)}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{fmt(e.paid)}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{fmt(e.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-muted font-bold">
                  <tr>
                    <td className="px-2 py-2" colSpan={6}>الإجمالي</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{fmt(drillTotal)}</td>
                    <td className="px-2 py-2" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
