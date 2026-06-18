import { useState, useEffect, useMemo } from "react";
import DailyAccountDialog, { emptyDailyForm, type DailyFormState as SharedDailyFormState } from "@/components/DailyAccountDialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Tag,
  Package,
  AlertTriangle,
  BarChart3,
  Pencil,
  Check,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getToday(): string {
  const now = new Date();
  // توقيت دبي UTC+4
  const dubaiMs = now.getTime() + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  const dubaiHour = dubai.getUTCHours();
  // اليوم يبدأ الساعة 6 صباحاً بتوقيت دبي - إذا كانت الساعة قبل 6 فهو لا يزال يوم الأمس
  if (dubaiHour < 6) {
    const yesterday = new Date(dubaiMs - 24 * 60 * 60 * 1000);
    return yesterday.toISOString().slice(0, 10);
  }
  return dubai.toISOString().slice(0, 10);
}

function getMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("ar-AE", {
    month: "long",
    year: "numeric",
  });
}

function formatDateAr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString("ar-AE", { day: "numeric", month: "short" });
}

// ─── Form State ───────────────────────────────────────────────────────────────
interface DailyFormState {
  accountDate: string;
  salesCash: string;
  salesCard: string;
  salesKita: string;
  salesOrders: string;
  salesNoon: string;
  salesDeliveroo: string;
  salesCareem: string;
  expensesFixed: string;
  supplyToRestaurant: string;
  supplyToManagement: string;
  supplyExtra: string;
  notes: string;
}

const emptyForm = (date: string): DailyFormState => ({
  accountDate: date,
  salesCash: "",
  salesCard: "",
  salesKita: "",
  salesOrders: "",
  salesNoon: "",
  salesDeliveroo: "",
  salesCareem: "",
  expensesFixed: "",
  supplyToRestaurant: "",
  supplyToManagement: "",
  supplyExtra: "",
  notes: "",
});

const toNum = (s: string) => parseFloat(s) || 0;

// ─── Invoice Category Row ────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  { value: "operational", label: "تشغيلية", color: "text-orange-600" },
  { value: "maintenance", label: "صيانة ومعدات", color: "text-blue-600" },
  { value: "fixed", label: "ثابتة", color: "text-purple-600" },
  { value: "other", label: "أخرى", color: "text-gray-500" },
] as const;

function InvoiceCategoryRow({
  invoice,
  accountDate,
}: {
  invoice: { id: number; supplierName: string; invoiceNumber: string | null; totalAmount: number; paidAmount?: number; expenseCategory: string };
  accountDate: string;
}) {
  const utils = trpc.useUtils();
  const updateCategory = trpc.dailyAccounts.updateInvoiceCategory.useMutation({
    onSuccess: () => {
      utils.dailyAccounts.expensesForDate.invalidate({ accountDate });
      toast.success("تم تحديث تصنيف الفاتورة");
    },
    onError: (e) => toast.error(e.message),
  });
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === invoice.expenseCategory);
  const displayAmount = invoice.paidAmount ?? invoice.totalAmount;
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-2 py-2 text-xs font-medium max-w-[90px] truncate" title={invoice.supplierName}>
        {invoice.supplierName}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {invoice.invoiceNumber ?? "—"}
      </td>
      <td className="px-2 py-2 text-xs font-semibold text-orange-600 whitespace-nowrap">
        {displayAmount.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
      </td>
      <td className="px-2 py-2">
        <Select
          value={invoice.expenseCategory}
          onValueChange={(val) =>
            updateCategory.mutate({ invoiceId: invoice.id, category: val as "operational" | "maintenance" | "fixed" | "other" })
          }
          disabled={updateCategory.isPending}
        >
          <SelectTrigger className="h-7 text-xs w-[110px] border-dashed">
            <SelectValue>
              <span className={cat?.color ?? "text-gray-500"}>{cat?.label ?? "أخرى"}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span className={c.color}>{c.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DailyAccountsPage() {
  const today = getToday();
  const todayDate = new Date(today + "T00:00:00");
  const [selectedYear, setSelectedYear] = useState(todayDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(todayDate.getMonth() + 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dialogForm, setDialogForm] = useState<SharedDailyFormState>(emptyDailyForm(today));
  const [editingDate, setEditingDate] = useState<string | null>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data: accounts = [], refetch } = trpc.dailyAccounts.list.useQuery(
    { year: selectedYear, month: selectedMonth },
    { refetchOnWindowFocus: false }
  );

  const deleteMutation = trpc.dailyAccounts.delete.useMutation({
    onSuccess: () => {
      toast.success("تم الحذف");
      setDeleteId(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [resendingDate, setResendingDate] = useState<string | null>(null);
  const resendMutation = trpc.dailyAccounts.resendReport.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال التقرير بنجاح عبر WhatsApp ✅");
      setResendingDate(null);
    },
    onError: (e) => {
      toast.error("فشل الإرسال: " + e.message);
      setResendingDate(null);
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function openAddDialog() {
    setEditingDate(null);
    setDialogForm(emptyDailyForm(today));
    setDialogOpen(true);
  }

  function openEditDialog(acc: typeof accounts[0]) {
    setEditingDate(acc.accountDate);
    // تحويل القيم الرقمية من decimal إلى string نظيف (بدون أصفار زائدة)
    const toStr = (v: string | number | null | undefined) => {
      const n = parseFloat(String(v ?? 0));
      return isNaN(n) || n === 0 ? "" : String(n);
    };
    setDialogForm({
      accountDate: acc.accountDate,
      salesCash: toStr(acc.salesCash),
      salesCard: toStr(acc.salesCard),
      salesKita: toStr(acc.salesKita),
      salesOrders: toStr(acc.salesOrders),
      salesNoon: toStr(acc.salesNoon),
      salesDeliveroo: toStr(acc.salesDeliveroo),
      salesCareem: toStr(acc.salesCareem),
      expensesFixed: toStr(acc.expensesFixed),
      supplyToRestaurant: toStr(acc.supplyToRestaurant),
      supplyToManagement: toStr(acc.supplyToManagement),
      supplyExtra: toStr(acc.supplyExtra),
      notes: acc.notes ?? "",
    });
    setDialogOpen(true);
  }

  function prevMonth() {
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  }
  function nextMonth() {
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  }

  const utils = trpc.useUtils();
  const [editingOpeningStock, setEditingOpeningStock] = useState(false);
  const [openingStockInput, setOpeningStockInput] = useState("");
  const [openingStockDateInput, setOpeningStockDateInput] = useState("");
  const [includeFixed, setIncludeFixed] = useState(true);
  const [showCloseMonthConfirm, setShowCloseMonthConfirm] = useState(false);

  // ─── Financial KPI Query ─────────────────────────────────────────────────
  const { data: kpi, isLoading: kpiLoading } = trpc.dailyAccounts.financialKpi.useQuery(
    { year: selectedYear, month: selectedMonth },
    { refetchOnWindowFocus: false }
  );
  const { data: liveInvKpis } = trpc.materials.kpis.useQuery(undefined, { refetchOnWindowFocus: false });
  const updateOpeningStockMut = trpc.dailyAccounts.updateOpeningStock.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث مخزون أول المدة");
      utils.dailyAccounts.financialKpi.invalidate();
      setEditingOpeningStock(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const closeMonthMut = trpc.dailyAccounts.closeMonth.useMutation({
    onSuccess: () => {
      toast.success("تم إقفال الشهر وتجميد قيمة المخزون");
      utils.dailyAccounts.financialKpi.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  //  // ─── Month Expenses Query ────────────────────────────────────────────────────
  const { data: monthExpenses = {} } = trpc.dailyAccounts.monthExpenses.useQuery(
    { year: selectedYear, month: selectedMonth },
    { refetchOnWindowFocus: false }
  );

   // ─── Merge accounts + expense-only days ────────────────────────────────────────────
  // Build a unified list: registered days + days that only have expenses (no sales entry)
  const accountDates = new Set(accounts.map(a => a.accountDate));
  const expenseOnlyDays: string[] = Object.keys(monthExpenses)
    .filter(d => !accountDates.has(d))
    .sort();

  // ─── Summary KPIs ───────────────────────────────────────────────────
  const monthTotalSales = accounts.reduce((s, a) => s + a.totalSales, 0);
  const monthTotalCash = accounts.reduce((s, a) => s + (parseFloat(a.salesCash) || 0), 0);
  const monthTotalSupply = accounts.reduce((s, a) =>
    s + (parseFloat(a.supplyToRestaurant) || 0) + (parseFloat(a.supplyToManagement) || 0) + (parseFloat(a.supplyExtra) || 0), 0);
  const restaurantReceived = monthTotalCash + monthTotalSupply;
  const restaurantPercent = monthTotalSales > 0 ? (restaurantReceived / monthTotalSales) * 100 : 0;
  const restaurantExpected = monthTotalSales / 2 - monthTotalCash;
  const restaurantDiff = monthTotalSupply - restaurantExpected;
  const monthTotalFixed = accounts.reduce((s, a) => s + parseFloat(a.expensesFixed), 0);
  const monthTotalExpenses = (() => {
    // From registered days
    const fromAccounts = accounts.reduce((s, a) => {
      const fixed = parseFloat(a.expensesFixed) || 0;
      const hasManual = parseFloat(String(a.expensesOperational ?? 0)) > 0 || parseFloat(String(a.expensesMaintenance ?? 0)) > 0;
      if (hasManual) {
        // Use stored manual values for days 1-12
        const op = parseFloat(String(a.expensesOperational ?? 0)) || 0;
        const ma = parseFloat(String(a.expensesMaintenance ?? 0)) || 0;
        return s + op + ma + fixed;
      }
      const exp = monthExpenses[a.accountDate];
      return s + (exp ? exp.totalExpenses + fixed : fixed);
    }, 0);
    // From expense-only days
    const fromExpenseOnly = expenseOnlyDays.reduce((s, d) => {
      const exp = monthExpenses[d];
      return s + (exp ? exp.totalExpenses : 0);
    }, 0);
    return fromAccounts + fromExpenseOnly;
  })();

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">الحسابات اليومية</h1>
          <p className="text-muted-foreground text-sm mt-1">تتبع المبيعات والمصروفات والتوريدات اليومية</p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          إضافة يوم جديد
        </Button>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-3 w-fit">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronRight className="w-4 h-4" /></Button>
        <span className="font-semibold text-base min-w-[140px] text-center">{getMonthLabel(selectedYear, selectedMonth)}</span>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronLeft className="w-4 h-4" /></Button>
      </div>

      {/* Financial KPI Dashboard - Redesigned */}
      <div className="space-y-0">
        {/* ═══════════════════════════════════════════════════════════════
            الملخص المالي — تصميم محاسبي احترافي
            ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-white dark:bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden">

          {/* ── رأس الملخص ── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-gradient-to-l from-slate-50 to-white dark:from-slate-900/30 dark:to-card">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <span className="text-sm font-bold text-foreground">الملخص المالي</span>
                <span className="text-xs text-muted-foreground mr-2">{getMonthLabel(selectedYear, selectedMonth)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {kpi?.isMonthClosed ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                  <Check className="w-3.5 h-3.5" />
                  مُقفل بتاريخ {kpi.monthClosedDate}
                </span>
              ) : (
                <button
                  onClick={() => setShowCloseMonthConfirm(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border bg-muted text-muted-foreground border-border hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 dark:hover:bg-amber-950/40"
                >
                  <Package className="w-4 h-4" />
                  <span>إقفال الشهر</span>
                </button>
              )}
              <button
                onClick={() => setIncludeFixed(!includeFixed)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 border ${
                  includeFixed
                    ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {includeFixed ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                <span>تضمين المصروفات الثابتة</span>
              </button>
            </div>
          </div>

          {/* ── جسم الملخص ── */}
          <div className="p-4 space-y-3">

            {/* ── الصف الأول: مؤشرات الإيرادات والتكلفة ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

              {/* مخزون أول المدة */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-6 w-6 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                      <Package className="w-3 h-3 text-slate-600 dark:text-slate-300" />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">مخزون أول المدة</span>
                  </div>
                  {!editingOpeningStock ? (
                    <button onClick={() => { setOpeningStockInput(String(kpi?.openingStockValue ?? 10800)); setOpeningStockDateInput(kpi?.openingStockDate ?? '2026-04-01'); setEditingOpeningStock(true); }} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                      <Pencil className="w-3 h-3 text-slate-400" />
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <button onClick={() => updateOpeningStockMut.mutate({ openingStockValue: parseFloat(openingStockInput) || 0, openingStockDate: openingStockDateInput })} className="p-1 rounded hover:bg-emerald-100 text-emerald-600">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setEditingOpeningStock(false)} className="p-1 rounded hover:bg-red-100 text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                {editingOpeningStock ? (
                  <div className="space-y-1.5">
                    <Input value={openingStockInput} onChange={e => setOpeningStockInput(e.target.value)} className="h-7 text-sm" placeholder="القيمة" type="number" />
                    <Input value={openingStockDateInput} onChange={e => setOpeningStockDateInput(e.target.value)} className="h-7 text-xs" type="date" />
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{fmt(kpi?.openingStockValue ?? 0)} <span className="text-xs font-normal">د.إ</span></p>
                    {kpi?.openingStockDate && <p className="text-[10px] text-slate-400 mt-0.5">بتاريخ {kpi.openingStockDate}</p>}
                  </>
                )}
              </div>

              {/* صافي المبيعات */}
              <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="h-6 w-6 rounded-md bg-violet-200 dark:bg-violet-800/50 flex items-center justify-center">
                    <TrendingUp className="w-3 h-3 text-violet-600 dark:text-violet-300" />
                  </div>
                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">صافي المبيعات</span>
                </div>
                <p className="text-lg font-bold text-violet-700 dark:text-violet-200">{fmt(kpi?.netSales ?? kpi?.totalSales ?? monthTotalSales)} <span className="text-xs font-normal">د.إ</span></p>
                <p className="text-[10px] text-violet-500/70 dark:text-violet-400/60 mt-0.5">{accounts.length} يوم مسجّل</p>
              </div>

              {/* تكلفة البضاعة المستخدمة */}
              <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-6 w-6 rounded-md bg-orange-200 dark:bg-orange-800/50 flex items-center justify-center">
                      <ShoppingCart className="w-3 h-3 text-orange-600 dark:text-orange-300" />
                    </div>
                    <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">تكلفة البضاعة</span>
                  </div>
                  {(() => {
                    const sales = kpi?.netSales ?? kpi?.totalSales ?? monthTotalSales;
                    const cogsPercent = sales > 0 ? ((kpi?.cogsValue ?? 0) / sales) * 100 : 0;
                    return (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                        {cogsPercent.toFixed(1)}%
                      </span>
                    );
                  })()}
                </div>
                <p className="text-lg font-bold text-orange-700 dark:text-orange-200">{fmt(kpi?.cogsValue ?? 0)} <span className="text-xs font-normal">د.إ</span></p>
                <div className="text-[10px] text-orange-500/70 dark:text-orange-400/60 mt-0.5 space-y-0.5">
                  <div>أول: {fmt(kpi?.openingStockValue ?? 0)} + تشغيلية: {fmt(kpi?.totalOpEx ?? 0)}</div>
                  <div className="ps-3">(مدفوع: {fmt(kpi?.opPaid ?? 0)} / مؤجل: {fmt(kpi?.opDeferred ?? 0)})</div>
                  <div>− مخزون آخر: {fmt(kpi?.currentInventoryValue ?? 0)}</div>
                </div>
              </div>

              {/* مجمل الربح */}
              {(() => {
                const gp = kpi?.grossProfit ?? 0;
                const gm = kpi?.grossMargin ?? 0;
                const isPos = gp >= 0;
                return (
                  <div className={`rounded-xl border p-3 ${
                    isPos
                      ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className={`h-6 w-6 rounded-md flex items-center justify-center ${
                          isPos ? 'bg-emerald-200 dark:bg-emerald-800/50' : 'bg-red-200 dark:bg-red-800/50'
                        }`}>
                          <ArrowRightLeft className={`w-3 h-3 ${isPos ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`} />
                        </div>
                        <span className={`text-xs font-semibold ${isPos ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>مجمل الربح</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isPos ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}>{gm.toFixed(1)}%</span>
                    </div>
                    <p className={`text-lg font-bold ${isPos ? 'text-emerald-700 dark:text-emerald-200' : 'text-red-700 dark:text-red-200'}`}>
                      {gp < 0 ? '−' : ''}{fmt(Math.abs(gp))} <span className="text-xs font-normal">د.إ</span>
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isPos ? 'text-emerald-500/70 dark:text-emerald-400/60' : 'text-red-500/70 dark:text-red-400/60'}`}>
                      مبيعات − تكلفة البضاعة
                    </p>
                  </div>
                );
              })()}
            </div>



            {/* ── فاصل ── */}
            <div className="border-t border-dashed border-border/50 pt-3">
              {/* ── الصف الثالث: المديونية والمخزون ونسبة المطعم ── */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

                {/* إجمالي المديونية */}
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-6 w-6 rounded-md bg-amber-200 dark:bg-amber-800/50 flex items-center justify-center">
                      <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-300" />
                    </div>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">إجمالي المديونية</span>
                  </div>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-200">{fmt(kpi?.totalDebt ?? 0)} <span className="text-xs font-normal">د.إ</span></p>
                  <div className="flex gap-3 mt-0.5 text-[10px] text-amber-600/70 dark:text-amber-400/60">
                    <span>موردين: {fmt(kpi?.supplierDebt ?? 0)}</span>
                    <span>حرة: {fmt(kpi?.freeDebt ?? 0)}</span>
                  </div>
                </div>

                {/* قيمة المخزون الحالي */}
                <div className="rounded-xl border border-teal-200 dark:border-teal-800/50 bg-teal-50 dark:bg-teal-950/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-6 w-6 rounded-md bg-teal-200 dark:bg-teal-800/50 flex items-center justify-center">
                      <Package className="w-3 h-3 text-teal-600 dark:text-teal-300" />
                    </div>
                    <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">قيمة المخزون الحالي</span>
                  </div>
                  <p className="text-lg font-bold text-teal-700 dark:text-teal-200">{fmt((liveInvKpis?.rawMaterialsTotalValue ?? 0) + (liveInvKpis?.semiFinishedTotalValue ?? 0))} <span className="text-xs font-normal">د.إ</span></p>
                  <div className="flex gap-3 mt-0.5 text-[10px] text-teal-600/70 dark:text-teal-400/60 flex-wrap">
                    <span>خام: {fmt(liveInvKpis?.rawMaterialsTotalValue ?? 0)}</span>
                    <span>مصنعة: {fmt(liveInvKpis?.semiFinishedTotalValue ?? 0)}</span>
                  </div>
                </div>

                {/* نسبة المطعم */}
                <div className="rounded-xl border border-cyan-200 dark:border-cyan-800/50 bg-cyan-50 dark:bg-cyan-950/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-6 w-6 rounded-md bg-cyan-200 dark:bg-cyan-800/50 flex items-center justify-center">
                      <Wallet className="w-3 h-3 text-cyan-600 dark:text-cyan-300" />
                    </div>
                    <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">نسبة المطعم</span>
                  </div>
                  <p className="text-lg font-bold text-cyan-700 dark:text-cyan-200">{restaurantPercent.toFixed(1)}%</p>
                  <p className="text-[10px] text-cyan-600/70 dark:text-cyan-400/60 mt-0.5">
                    استلام: {fmt(restaurantReceived)} (نقدي {fmt(monthTotalCash)} + توريدات {fmt(monthTotalSupply)})
                  </p>
                  <p className="text-[10px] text-cyan-600/70 dark:text-cyan-400/60 mt-0.5">
                    المفروض: {fmt(restaurantExpected)} (مبيعات÷2 − نقدي)
                  </p>
                  <p className={`text-xs font-bold mt-1 ${restaurantDiff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {restaurantDiff >= 0 ? '+' : '−'}{fmt(Math.abs(restaurantDiff))} د.إ — {restaurantDiff >= 0 ? 'للمطعم' : 'على المطعم'}
                  </p>
                </div>

              </div>
            </div>

          </div>{/* end جسم الملخص */}
        </div>{/* end bg-white rounded-2xl */}
      </div>{/* end space-y-0 */}
            {/* Table */}
      {accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>لا توجد بيانات لهذا الشهر</p>
            <p className="text-sm mt-1">اضغط "إضافة يوم جديد" لبدء التسجيل</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border shadow-sm bg-white dark:bg-card">
          <table className="w-full text-sm border-collapse" style={{ minWidth: '1100px' }}>
            <thead>
              {/* Row 1: Group headers */}
              <tr className="border-b-2 border-border">
                <th className="text-center px-3 py-2.5 font-bold bg-muted/40 border-b border-l" rowSpan={2}>التاريخ</th>
                {/* Carry Forward */}
                <th className="text-center px-3 py-2 font-bold text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/20 border-l" rowSpan={2}>المرحّل</th>
                {/* Sales group */}
                <th className="text-center px-3 py-2 font-bold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20 border-l" colSpan={8}>المبيعات اليومية</th>
                {/* Expenses group */}
                <th className="text-center px-3 py-2 font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-l" colSpan={4}>المصروفات</th>
                {/* Supply group */}
                <th className="text-center px-3 py-2 font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border-l" colSpan={4}>التوريدات</th>
                {/* Net */}
                <th className="text-center px-3 py-2 font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border-l" rowSpan={2}>الصافي</th>
                {/* Staff Meals */}
                <th className="text-center px-3 py-2 font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 border-l" rowSpan={2}>أكل الأصناف</th>
                {/* Food Cost % */}
                <th className="text-center px-3 py-2 font-bold text-orange-600 dark:text-orange-400 bg-orange-50/60 dark:bg-orange-950/10 border-l" rowSpan={2}>% فود كوست</th>
                {/* Actions */}
                <th className="text-center px-3 py-2 font-bold text-muted-foreground bg-muted/40" rowSpan={2}>إجراءات</th>
              </tr>
              {/* Row 2: Sub-headers */}
              <tr className="border-b-2 border-border text-xs">
                {/* Sales sub-cols */}
                <th className="text-center px-2 py-2 text-violet-600 bg-violet-50/60 dark:bg-violet-950/10 font-semibold border-l">نقدي</th>
                <th className="text-center px-2 py-2 text-violet-600 bg-violet-50/60 dark:bg-violet-950/10 font-semibold border-l">بطاقة</th>
                <th className="text-center px-2 py-2 text-violet-600 bg-violet-50/60 dark:bg-violet-950/10 font-semibold border-l">كيتا</th>
                <th className="text-center px-2 py-2 text-violet-600 bg-violet-50/60 dark:bg-violet-950/10 font-semibold border-l">طلبات</th>
                <th className="text-center px-2 py-2 text-violet-600 bg-violet-50/60 dark:bg-violet-950/10 font-semibold border-l">كريم</th>
                <th className="text-center px-2 py-2 text-violet-600 bg-violet-50/60 dark:bg-violet-950/10 font-semibold border-l">ديلفروا</th>
                <th className="text-center px-2 py-2 text-violet-600 bg-violet-50/60 dark:bg-violet-950/10 font-semibold border-l">نون</th>
                <th className="text-center px-2 py-2 text-violet-700 bg-violet-100/60 dark:bg-violet-950/20 font-bold border-l">الإجمالي</th>
                {/* Expenses sub-cols */}
                <th className="text-center px-2 py-2 text-orange-600 bg-red-50/60 dark:bg-red-950/10 font-semibold border-l">تشغيلية</th>
                <th className="text-center px-2 py-2 text-blue-600 bg-red-50/60 dark:bg-red-950/10 font-semibold border-l">معدات وصيانة</th>
                <th className="text-center px-2 py-2 text-purple-600 bg-red-50/60 dark:bg-red-950/10 font-semibold border-l">ثابتة</th>
                <th className="text-center px-2 py-2 text-red-700 bg-red-100/60 dark:bg-red-950/20 font-bold border-l">الإجمالي</th>
                {/* Supply sub-cols */}
                <th className="text-center px-2 py-2 text-amber-600 bg-amber-50/60 dark:bg-amber-950/10 font-semibold border-l">للمطعم</th>
                <th className="text-center px-2 py-2 text-amber-600 bg-amber-50/60 dark:bg-amber-950/10 font-semibold border-l">للإدارة</th>
                <th className="text-center px-2 py-2 text-amber-600 bg-amber-50/60 dark:bg-amber-950/10 font-semibold border-l">إضافي</th>
                <th className="text-center px-2 py-2 text-amber-700 bg-amber-100/60 dark:bg-amber-950/20 font-bold border-l">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a, idx) => {
                const cumSales = accounts.slice(0, idx + 1).reduce((s, r) => s + r.totalSales, 0);
                const exp = monthExpenses[a.accountDate];
                // إذا كان اليوم مخزّن يدوياً (1-12 أبريل): نستخدم expensesOperational/expensesMaintenance
                const hasManual = parseFloat(String(a.expensesOperational ?? 0)) > 0 || parseFloat(String(a.expensesMaintenance ?? 0)) > 0;
                const operationalExpenses = hasManual
                  ? (parseFloat(String(a.expensesOperational ?? 0)) || 0)
                  : ((exp?.operational ?? 0) + (exp?.supplierTotal ?? 0));
                const maintenanceExpenses = hasManual
                  ? (parseFloat(String(a.expensesMaintenance ?? 0)) || 0)
                  : (exp?.maintenance ?? 0);
                const fixedExpenses = parseFloat(a.expensesFixed) || 0;
                const totalExpensesDay = operationalExpenses + maintenanceExpenses + fixedExpenses;
                const supplyRest = parseFloat(a.supplyToRestaurant) || 0;
                const supplyMgmt = parseFloat(a.supplyToManagement) || 0;
                const supplyExtra = parseFloat(a.supplyExtra) || 0;
                const supplyTotal = supplyRest + supplyMgmt + supplyExtra;
                const netDay = a.totalSales - totalExpensesDay;
                const isNeg = netDay < 0;
                const rowBg = idx % 2 === 0 ? 'bg-white dark:bg-card' : 'bg-muted/20';
                return (
                  <tr key={a.id} className={`border-b hover:bg-muted/30 transition-colors ${rowBg}`}>
                    {/* Date */}
                    <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap border-l">
                      <div className="text-sm">{formatDateAr(a.accountDate)}</div>
                      <div className="text-xs text-muted-foreground">{new Date(a.accountDate + 'T12:00:00').toLocaleDateString('ar-AE', { weekday: 'short' })}</div>
                    </td>
                    {/* Carry Forward */}
                    <td className="px-2 py-2.5 text-center font-semibold bg-sky-50/40 dark:bg-sky-950/10 border-l">
                      {(() => {
                        const v = parseFloat(String(a.carryForwardToNext ?? 0));
                        if (v === 0) return <span className="opacity-30">—</span>;
                        return <span className={v >= 0 ? 'text-sky-700 dark:text-sky-400' : 'text-red-600 dark:text-red-400'}>{fmt(v)}</span>;
                      })()}
                    </td>
                    {/* Sales */}
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{parseFloat(a.salesCash) > 0 ? fmt(parseFloat(a.salesCash)) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{parseFloat(a.salesCard) > 0 ? fmt(parseFloat(a.salesCard)) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{parseFloat(a.salesKita) > 0 ? fmt(parseFloat(a.salesKita)) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{parseFloat(a.salesOrders) > 0 ? fmt(parseFloat(a.salesOrders)) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{parseFloat(a.salesCareem) > 0 ? fmt(parseFloat(a.salesCareem)) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{parseFloat(a.salesDeliveroo) > 0 ? fmt(parseFloat(a.salesDeliveroo)) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{parseFloat(a.salesNoon) > 0 ? fmt(parseFloat(a.salesNoon)) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center font-bold text-violet-700 dark:text-violet-400 bg-violet-50/40 dark:bg-violet-950/10 border-l">{fmt(a.totalSales)}</td>
                    {/* Expenses */}
                    <td className="px-2 py-2.5 text-center text-orange-600 border-l">{operationalExpenses > 0 ? fmt(operationalExpenses) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-blue-600 border-l">{maintenanceExpenses > 0 ? fmt(maintenanceExpenses) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-purple-600 border-l">{fixedExpenses > 0 ? fmt(fixedExpenses) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center font-bold text-red-600 dark:text-red-400 bg-red-50/40 dark:bg-red-950/10 border-l">{fmt(totalExpensesDay)}</td>
                    {/* Supply */}
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{supplyRest > 0 ? fmt(supplyRest) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{supplyMgmt > 0 ? fmt(supplyMgmt) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-muted-foreground border-l">{supplyExtra > 0 ? fmt(supplyExtra) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center font-bold text-amber-700 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/10 border-l">{supplyTotal > 0 ? fmt(supplyTotal) : <span className="opacity-30">—</span>}</td>
                    {/* Net */}
                    <td className={`px-3 py-2.5 text-center font-bold border-l ${isNeg ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {isNeg ? '-' : ''}{fmt(Math.abs(netDay))}
                    </td>
                    {/* Staff Meals */}
                    <td className="px-2 py-2.5 text-center text-purple-700 dark:text-purple-300 bg-purple-50/30 dark:bg-purple-950/10 border-l text-sm">
                      {(a as any).staffMeals != null && parseFloat((a as any).staffMeals) > 0 ? fmt(parseFloat((a as any).staffMeals)) : <span className="opacity-30">—</span>}
                    </td>
                    {/* Food Cost % */}
                    {(() => {
                      const pct = (a as any).foodCostPercent != null ? parseFloat((a as any).foodCostPercent) : null;
                      return (
                        <td className="px-2 py-2.5 text-center text-xs font-semibold bg-orange-50/20 dark:bg-orange-950/5 border-l">
                          {pct != null ? (
                            <span className={pct > 40 ? 'text-red-500' : pct > 30 ? 'text-amber-500' : 'text-emerald-600'}>
                              {pct.toFixed(1)}%
                            </span>
                          ) : <span className="opacity-30">—</span>}
                        </td>
                      );
                    })()}
                    {/* Actions */}
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditDialog(a)} className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500 hover:text-blue-700 transition-colors" title="تعديل">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button
                          onClick={() => { setResendingDate(a.accountDate); resendMutation.mutate({ accountDate: a.accountDate }); }}
                          disabled={resendingDate === a.accountDate}
                          className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-500 hover:text-green-700 transition-colors disabled:opacity-50" title="إعادة إرسال التقرير"
                        >
                          {resendingDate === a.accountDate ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                          )}
                        </button>
                        <button onClick={() => setDeleteId(a.id)} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 hover:text-red-600 transition-colors" title="حذف">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Expense-only rows: days with paid invoices but no sales entry */}
              {expenseOnlyDays.map((dateKey) => {
                const exp = monthExpenses[dateKey]!;
                const supplierTotal = exp.supplierTotal;
                const freeTotal = exp.freeTotal;
                const totalExpensesDay = exp.totalExpenses;
                const netDay = -totalExpensesDay;
                return (
                  <tr key={`exp-${dateKey}`} className="border-b hover:bg-muted/30 transition-colors bg-orange-50/30 dark:bg-orange-950/10">
                    {/* Date */}
                    <td className="px-3 py-2.5 font-semibold text-foreground whitespace-nowrap border-l">
                      <div className="text-sm">{formatDateAr(dateKey)}</div>
                      <div className="text-xs text-muted-foreground">{new Date(dateKey + 'T12:00:00').toLocaleDateString('ar-AE', { weekday: 'short' })}</div>
                      <div className="text-xs text-orange-500 font-normal mt-0.5">مصروفات فقط</div>
                    </td>
                    {/* Carry Forward: dash */}
                    <td className="px-2 py-2.5 text-center bg-sky-50/40 dark:bg-sky-950/10 border-l"><span className="opacity-30">—</span></td>
                    {/* Sales: all dashes (7 channels + 1 total = 8 cells) */}
                    {Array.from({length: 7}).map((_,i) => <td key={i} className="px-2 py-2.5 text-center border-l"><span className="opacity-30">—</span></td>)}
                    <td className="px-2 py-2.5 text-center font-bold text-violet-700 dark:text-violet-400 bg-violet-50/40 dark:bg-violet-950/10 border-l"><span className="opacity-30">—</span></td>
                    {/* Expenses */}
                    <td className="px-2 py-2.5 text-center text-orange-600 border-l">{(exp.operational + exp.supplierTotal) > 0 ? fmt(exp.operational + exp.supplierTotal) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-blue-600 border-l">{exp.maintenance > 0 ? fmt(exp.maintenance) : <span className="opacity-30">—</span>}</td>
                    <td className="px-2 py-2.5 text-center text-purple-600 border-l"><span className="opacity-30">—</span></td>
                    <td className="px-2 py-2.5 text-center font-bold text-red-600 dark:text-red-400 bg-red-50/40 dark:bg-red-950/10 border-l">{fmt(totalExpensesDay)}</td>
                    {/* Supply: all dashes */}
                    {Array.from({length: 3}).map((_,i) => <td key={i} className="px-2 py-2.5 text-center border-l"><span className="opacity-30">—</span></td>)}
                    <td className="px-2 py-2.5 text-center font-bold text-amber-700 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/10 border-l"><span className="opacity-30">—</span></td>
                    {/* Net */}
                    <td className="px-3 py-2.5 text-center font-bold border-l text-red-600 dark:text-red-400">
                      -{fmt(totalExpensesDay)}
                    </td>
                    {/* Actions: empty */}
                    <td className="px-3 py-2.5 text-center"></td>
                  </tr>
                );
              })}
              {/* Totals row */}
              {accounts.length > 0 && (
                <tr className="border-t-2 border-border bg-muted/50 font-bold text-sm">
                  <td className="px-3 py-3 font-bold text-foreground border-l">الإجمالي</td>
                  <td className="px-2 py-3 text-center text-sky-700 bg-sky-50/40 dark:bg-sky-950/10 border-l">—</td>
                  <td className="px-2 py-3 text-center text-violet-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.salesCash),0))}</td>
                  <td className="px-2 py-3 text-center text-violet-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.salesCard),0))}</td>
                  <td className="px-2 py-3 text-center text-violet-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.salesKita),0))}</td>
                  <td className="px-2 py-3 text-center text-violet-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.salesOrders),0))}</td>
                  <td className="px-2 py-3 text-center text-violet-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.salesCareem),0))}</td>
                  <td className="px-2 py-3 text-center text-violet-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.salesDeliveroo),0))}</td>
                  <td className="px-2 py-3 text-center text-violet-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.salesNoon),0))}</td>
                  <td className="px-2 py-3 text-center text-violet-800 bg-violet-100/60 dark:bg-violet-950/20 border-l">{fmt(monthTotalSales)}</td>
                  <td className="px-2 py-3 text-center text-orange-600 border-l">{fmt(accounts.reduce((s,a)=>{
                    const hasM = parseFloat(String(a.expensesOperational ?? 0)) > 0 || parseFloat(String(a.expensesMaintenance ?? 0)) > 0;
                    if (hasM) return s + (parseFloat(String(a.expensesOperational ?? 0)) || 0);
                    const exp = monthExpenses[a.accountDate];
                    return s + ((exp?.operational ?? 0) + (exp?.supplierTotal ?? 0));
                  }, 0) + Object.keys(monthExpenses).filter(d => !accounts.some(a => a.accountDate === d)).reduce((s,d)=>s+(monthExpenses[d]?.operational ?? 0)+(monthExpenses[d]?.supplierTotal ?? 0),0))}</td>
                  <td className="px-2 py-3 text-center text-blue-600 border-l">{fmt(accounts.reduce((s,a)=>{
                    const hasM = parseFloat(String(a.expensesOperational ?? 0)) > 0 || parseFloat(String(a.expensesMaintenance ?? 0)) > 0;
                    if (hasM) return s + (parseFloat(String(a.expensesMaintenance ?? 0)) || 0);
                    const exp = monthExpenses[a.accountDate];
                    return s + (exp?.maintenance ?? 0);
                  }, 0) + Object.keys(monthExpenses).filter(d => !accounts.some(a => a.accountDate === d)).reduce((s,d)=>s+(monthExpenses[d]?.maintenance ?? 0),0))}</td>
                  <td className="px-2 py-3 text-center text-purple-600 border-l">{fmt(monthTotalFixed)}</td>
                  <td className="px-2 py-3 text-center text-red-800 bg-red-100/60 dark:bg-red-950/20 border-l">{fmt(monthTotalExpenses)}</td>
                  <td className="px-2 py-3 text-center text-amber-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.supplyToRestaurant),0))}</td>
                  <td className="px-2 py-3 text-center text-amber-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.supplyToManagement),0))}</td>
                  <td className="px-2 py-3 text-center text-amber-700 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.supplyExtra),0))}</td>
                  <td className="px-2 py-3 text-center text-amber-800 bg-amber-100/60 dark:bg-amber-950/20 border-l">{fmt(accounts.reduce((s,a)=>s+parseFloat(a.supplyToRestaurant)+parseFloat(a.supplyToManagement)+parseFloat(a.supplyExtra),0))}</td>
                  <td className={`px-3 py-3 text-center border-l ${monthTotalSales - monthTotalExpenses < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {monthTotalSales - monthTotalExpenses < 0 ? '-' : ''}{fmt(Math.abs(monthTotalSales - monthTotalExpenses))}
                  </td>
                  <td className="px-2 py-3 text-center border-l text-purple-700 font-semibold">
                    {(() => { const t = accounts.reduce((s,a) => s + (parseFloat((a as any).staffMeals ?? '0') || 0), 0); return t > 0 ? fmt(t) : '—'; })()}
                  </td>
                  <td className="px-2 py-3 text-center border-l text-muted-foreground">—</td>
                  <td className="px-3 py-3"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog - using shared component */}
      <DailyAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingDate={editingDate}
        initialForm={dialogForm}
        onSaved={() => refetch()}
      />


      {/* Close Month Confirmation */}
      <AlertDialog open={showCloseMonthConfirm} onOpenChange={setShowCloseMonthConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إقفال الشهر</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم تجميد قيمة المخزون الحالي ({fmt(kpi?.currentInventoryValue ?? 0)} د.إ) كمخزون آخر المدة لشهر {getMonthLabel(selectedYear, selectedMonth)}،
              وستصبح هي مخزون أول المدة للشهر التالي. كما سيتم ترحيل إجمالي المديونية الحالي ({fmt(kpi?.totalDebt ?? 0)} د.إ) كمديونية هذا الشهر.
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                closeMonthMut.mutate({ year: selectedYear, month: selectedMonth });
                setShowCloseMonthConfirm(false);
              }}
            >
              تأكيد الإقفال
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف بيانات هذا اليوم؟ لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
