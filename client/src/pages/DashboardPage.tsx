import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Box,
  CheckCircle2, ChefHat, DollarSign, Flame, Package,
  ShoppingCart, TrendingDown, TrendingUp, XCircle, Clock,
  BarChart3, Activity, Layers, RefreshCw, Calendar, CalendarDays,
} from "lucide-react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, ComposedChart,
  Line, Area, AreaChart,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import AIWhatsAppTemplateButton from "@/components/AIWhatsAppTemplateButton";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(v: number, dec = 0) {
  return v.toLocaleString("ar-AE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtAED(v: number) {
  return `${fmtNum(v, 0)} AED`;
}
function shortDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-AE", { weekday: "short", day: "numeric" });
}
function fmtTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("ar-AE", { hour: "2-digit", minute: "2-digit" });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, color, trend, link,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; trend?: "up" | "down" | "warn" | "ok";
  link?: string;
}) {
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : trend === "warn" ? "text-amber-500" : "text-emerald-500";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : trend === "warn" ? AlertTriangle : CheckCircle2;
  const card = (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground mb-1 font-medium">{label}</p>
          <p className="text-2xl font-bold text-foreground number-display leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${trendColor}`}>
          <TrendIcon size={12} />
          <span>{sub ?? ""}</span>
        </div>
      )}
    </div>
  );
  return link ? <Link href={link}><div className="cursor-pointer">{card}</div></Link> : card;
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, sub, icon }: { title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon && <div className="text-primary">{icon}</div>}
      <div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5 h-28">
            <div className="h-3 bg-muted rounded w-3/4 mb-3" />
            <div className="h-7 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { language } = useLanguage();
  const { data: today, isLoading, refetch, isFetching } = trpc.dashboard.today.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });
  const { data: dailyPerf } = trpc.dashboard.monthlyDailyPerformance.useQuery(undefined, {
    refetchInterval: 10 * 60 * 1000,
  });
  const { data: monthlySales } = trpc.dashboard.monthlySalesChart.useQuery(undefined, {
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const [salesView, setSalesView] = useState<"year" | "month">("year");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const { data: dailySalesData } = trpc.dashboard.dailySalesForMonth.useQuery(
    { monthKey: selectedMonth },
    { enabled: salesView === "month", refetchOnWindowFocus: false }
  );

  // جلب كل الفواتير لحساب إحصائيات المديونية بنفس منطق صفحة الفواتير
  const { data: allInvoicesRaw } = trpc.invoices.allUnified.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data: monthInvoicesRaw } = trpc.invoices.allUnified.useQuery(
    { month: currentMonth },
    { refetchInterval: 5 * 60 * 1000, refetchOnWindowFocus: false }
  );

  // حساب إحصائيات المديونية بنفس منطق InvoicesPage
  function calcDebtStats(list: any[]) {
    const totalPaid = list.reduce((s, i) => s + (parseFloat(i.paidAmount ?? "0") || 0), 0);
    const totalDeferred = list
      .filter(i => i.paymentStatus === "deferred" || i.paymentStatus === "partial")
      .reduce((s, i) => {
        const remaining = parseFloat(i.remainingAmount ?? "0") || 0;
        if (remaining > 0) return s + remaining;
        const total = parseFloat(i.totalAmount) || 0;
        const paid = parseFloat(i.paidAmount ?? "0") || 0;
        return s + Math.max(0, total - paid);
      }, 0);
    const grandTotal = list.reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
    return { totalPaid, totalDeferred, grandTotal };
  }

  const debtStatsAll = calcDebtStats((allInvoicesRaw ?? []) as any[]);
  const debtStatsMonth = calcDebtStats((monthInvoicesRaw ?? []) as any[]);

  const [purchasesView, setPurchasesView] = useState<"day" | "month">("day");
  const [debtView, setDebtView] = useState<"month" | "all">("month");
  const [weekFilter, setWeekFilter] = useState(0); // 0=all, 1-4=week

  const todayDate = new Date().toLocaleDateString("ar-AE", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  if (isLoading || !today) return <Skeleton />;

  const s = today;
  const totalAlerts = (s.stock.outOfStock ?? 0) + (s.stock.lowStock ?? 0);
  const kitchenDoneRatio = s.todayKitchen.totalPulls > 0
    ? Math.round(((s.todayKitchen.closedPulls + s.todayKitchen.countedPulls) / s.todayKitchen.totalPulls) * 100)
    : 0;

  // Colors for charts
  const COLORS = [
    "oklch(0.55 0.18 250)",
    "oklch(0.55 0.18 150)",
    "oklch(0.70 0.18 60)",
    "oklch(0.55 0.22 25)",
    "oklch(0.60 0.18 300)",
    "oklch(0.55 0.18 200)",
    "oklch(0.65 0.18 100)",
    "oklch(0.60 0.20 350)",
  ];

  // Kitchen last 7 days chart data
  const kitchenChartData = s.kitchenLast7.map((d) => ({
    day: shortDay(d.day),
    سحب: d.pullsCount,
    هدر: parseFloat(d.wasteQty.toFixed(2)),
  }));

  // Stock status pie
  const normalCount = s.stock.totalMaterials - s.stock.outOfStock - s.stock.lowStock;
  const stockPie = [
    { name: "طبيعي", value: normalCount, color: "oklch(0.55 0.18 150)" },
    { name: "منخفض", value: s.stock.lowStock, color: "oklch(0.70 0.18 60)" },
    { name: "نفد", value: s.stock.outOfStock, color: "oklch(0.55 0.22 25)" },
  ].filter((d) => d.value > 0);

  // Daily performance chart data
  const dailyChartData = [...(dailyPerf ?? [])]
    .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime())
    .map((d) => ({
      // إضافة T12:00:00 لمنع تحويل UTC الذي يسبب ظهور اليوم السابق
      day: new Date(d.day + 'T12:00:00').toLocaleDateString("ar-AE", { day: "numeric", month: "short" }),
      "صافيالمبيعات": Math.round(d.sales),
      مبيعات: Math.round(d.sales),
      تكلفة: Math.round(d.kitchenCost),
      ربح: Math.max(0, Math.round(d.sales - d.kitchenCost)),
      "نسبة%": d.costPct,
      _rawDay: d.day,
    }));

  // Top pulls bar chart
  const topPullsData = s.topTodayPulls.map((p) => ({
    name: p.materialName.length > 12 ? p.materialName.slice(0, 12) + "…" : p.materialName,
    كمية: parseFloat(p.totalPulled.toFixed(2)),
  }));

  return (
    <div className="space-y-7 animate-fade-in" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{todayDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <AIWhatsAppTemplateButton
            pageName="لوحة التحكم الرئيسية"
            getPageStats={() => ({
              'إجمالي المبيعات اليوم': `${(s as any).todaySales?.totalSales ?? 0} AED`,
              'صافي المبيعات': `${(s as any).todaySales?.totalNetSales ?? 0} AED`,
              'إجمالي الربح': `${(s as any).todaySales?.totalProfit ?? 0} AED`,
              'مبيعات الجزارة': `${(s as any).butcherSales?.totalAmount ?? 0} AED`,
              'سحبات المطبخ اليوم': s.todayKitchen?.totalPulls ?? 0,
              'سحبات مغلقة': s.todayKitchen?.closedPulls ?? 0,
              'هدر المطبخ': s.todayKitchen?.totalWasteQty ?? 0,
              'مواد نافدة': s.stock?.outOfStock ?? 0,
              'مواد منخفضة': s.stock?.lowStock ?? 0,
              'إجمالي المواد': s.stock?.totalMaterials ?? 0,
              'قيمة المخزون الخام': `${s.stock?.totalStockValue ?? 0} AED`,
              'قيمة المواد المصنّعة': `${s.stock?.semiFinishedStockValue ?? 0} AED`,
            })}
          />
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            تحديث
          </button>
          {totalAlerts > 0 ? (
            <Link href="/alerts">
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-400 text-sm font-medium cursor-pointer hover:bg-amber-100 transition-colors">
                <AlertTriangle size={15} />
                {totalAlerts} تنبيه مخزون
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm font-medium">
              <CheckCircle2 size={15} />
              المخزون جيد
            </div>
          )}
        </div>
      </div>

      {/* ── Row 1: KPI Cards ── */}
      <div>
        <SectionHeader title="مؤشرات الأداء اليوم" sub="البيانات محدّثة لحظياً" icon={<Activity size={16} />} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* بطاقة مدمجة: قيمة المواد الخام + المصنّعة */}
          <Link href="/materials">
            <div className="cursor-pointer bg-card rounded-2xl border border-border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2 h-full">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">قيمة المخزون</p>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                  <DollarSign size={15} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">المواد الخام</span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400 number-display">{fmtAED(s.stock.totalStockValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">المصنّعة</span>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400 number-display">{fmtAED(s.stock.semiFinishedStockValue ?? 0)}</span>
              </div>
              <div className="border-t border-border/40 pt-1.5 flex items-center justify-between mt-auto">
                <span className="text-xs text-muted-foreground">الإجمالي</span>
                <span className="text-xs font-bold text-foreground number-display">{fmtAED((s.stock.totalStockValue) + (s.stock.semiFinishedStockValue ?? 0))}</span>
              </div>
            </div>
          </Link>
          {/* بطاقة عناصر المطبخ: مفتوحة + مجرودة */}
          <Link href="/kitchen">
            <div className="cursor-pointer bg-card rounded-2xl border border-border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2 h-full">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">عناصر المطبخ</p>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                  <ChefHat size={15} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">مفتوحة</span>
                <span className="text-sm font-bold text-amber-500 number-display">{fmtAED(s.todayKitchen.openValue ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">جُردت</span>
                <span className="text-sm font-bold text-emerald-500 number-display">{fmtAED(s.todayKitchen.countedValue ?? 0)}</span>
              </div>
              <div className="border-t border-border/40 pt-1.5 flex items-center justify-between mt-auto">
                <span className="text-xs text-muted-foreground">الإجمالي</span>
                <span className="text-xs font-bold text-foreground number-display">{fmtAED((s.todayKitchen.openValue ?? 0) + (s.todayKitchen.countedValue ?? 0))}</span>
              </div>
            </div>
          </Link>
          {/* بطاقة مدمجة: مشتريات - فواتير + حرة مع فلتر يوم/شهر */}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2 h-full">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">
                {purchasesView === "day" ? "مشتريات اليوم" : "مشتريات الشهر"}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPurchasesView(purchasesView === "day" ? "month" : "day")}
                  title={purchasesView === "day" ? "عرض الشهر" : "عرض اليوم"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {purchasesView === "day" ? <CalendarDays size={13} /> : <Calendar size={13} />}
                </button>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <ShoppingCart size={15} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">فواتير الموردين</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 number-display">
                {purchasesView === "day" ? fmtAED(s.todayPurchases?.invoicesTotal ?? 0) : fmtAED(s.monthPurchases?.monthPurchases ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الفواتير الحرة</span>
              <span className="text-sm font-bold text-teal-600 dark:text-teal-400 number-display">
                {purchasesView === "day" ? fmtAED(s.todayPurchases?.freeTotal ?? 0) : fmtAED(s.monthPurchases?.monthFreeTotal ?? 0)}
              </span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex items-center justify-between mt-auto">
              <span className="text-xs text-muted-foreground">الإجمالي</span>
              <span className="text-xs font-bold text-foreground number-display">
                {purchasesView === "day"
                  ? fmtAED((s.todayPurchases?.invoicesTotal ?? 0) + (s.todayPurchases?.freeTotal ?? 0))
                  : fmtAED((s.monthPurchases?.monthPurchases ?? 0) + (s.monthPurchases?.monthFreeTotal ?? 0))}
              </span>
            </div>
          </div>
          {/* كارد المديونية والمدفوع */}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col gap-2 h-full">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">
                {debtView === "month" ? "المديونية - الشهر" : "المديونية - الكل"}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDebtView("month")}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    debtView === "month"
                      ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >شهر</button>
                <button
                  onClick={() => setDebtView("all")}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    debtView === "all"
                      ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >الكل</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">المديونية</span>
              <span className="text-sm font-bold text-rose-500 number-display">
                {debtView === "month" ? fmtAED(debtStatsMonth.totalDeferred) : fmtAED(debtStatsAll.totalDeferred)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">المدفوع</span>
              <span className="text-sm font-bold text-emerald-500 number-display">
                {debtView === "month" ? fmtAED(debtStatsMonth.totalPaid) : fmtAED(debtStatsAll.totalPaid)}
              </span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex items-center justify-between mt-auto">
              <span className="text-xs text-muted-foreground">الإجمالي</span>
              <span className="text-xs font-bold text-foreground number-display">
                {debtView === "month" ? fmtAED(debtStatsMonth.grandTotal) : fmtAED(debtStatsAll.grandTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* صف أداء الشهر: كارد الملخص + شارت يومي */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 mt-4">
          {/* كارد أداء الشهر الحالي */}
          <div className="bg-card rounded-2xl border border-border p-4 shadow-sm space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-muted-foreground">أداء الشهر الحالي</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                (() => {
                  const sales = s.monthPerformance?.totalSales ?? 0;
                  const cost = s.monthPerformance?.kitchenCost ?? 0;
                  const pct = sales > 0 ? (cost / sales) * 100 : 0;
                  return pct <= 30 ? 'bg-emerald-100 text-emerald-700' : pct <= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
                })()
              }`}>
                {(() => {
                  const sales = s.monthPerformance?.totalSales ?? 0;
                  const cost = s.monthPerformance?.kitchenCost ?? 0;
                  const pct = sales > 0 ? (cost / sales) * 100 : 0;
                  return `تكلفة: ${pct.toFixed(1)}%`;
                })()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">إجمالي المبيعات</span>
              <span className="text-sm font-semibold text-blue-500 number-display">{fmtAED(s.monthPerformance?.totalSales ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">تكلفة المطبخ</span>
              <span className="text-sm font-semibold text-orange-500 number-display">{fmtAED(s.monthPerformance?.kitchenCost ?? 0)}</span>
            </div>
            <div className="border-t border-border/40 pt-1.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الفرق</span>
              <span className={`text-xs font-bold number-display ${
                (s.monthPerformance?.grossProfit ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}>{fmtAED(s.monthPerformance?.grossProfit ?? 0)}</span>
            </div>
          </div>

          {/* جدول الأداء اليومي */}
          {(() => {
            const weeks = [
              { label: 'الكل', value: 0 },
              { label: 'أسبوع 1', value: 1 },
              { label: 'أسبوع 2', value: 2 },
              { label: 'أسبوع 3', value: 3 },
              { label: 'أسبوع 4', value: 4 },
            ];
            const filteredData = weekFilter === 0
              ? dailyChartData
              : dailyChartData.slice((weekFilter - 1) * 7, weekFilter * 7);
            return (
              <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Activity size={14} className="text-primary" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">أداء المطعم اليومي - مبيعات وتكلفة وربح</p>
                      <p className="text-xs text-muted-foreground">مقارنة يومية للمبيعات والتكلفة والربح ونسبة تكلفة الإنتاج</p>
                    </div>
                  </div>
                  {/* فلتر الأسابيع */}
                  <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1" dir="rtl">
                    {weeks.map((w) => (
                      <button
                        key={w.value}
                        onClick={() => setWeekFilter(w.value)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          weekFilter === w.value
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-background'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredData.length > 0 ? (
                  <div className="overflow-x-auto -mx-4 px-4" style={{WebkitOverflowScrolling:'touch'}}>
                    <table className="text-xs border-collapse" style={{minWidth: Math.max(filteredData.length * 80 + 120, 400) + 'px', width: '100%'}} dir="rtl">
                      <thead>
                        <tr className="bg-muted/60">
                          <td className="py-2 px-3 font-semibold text-muted-foreground rounded-tr-lg border border-border/40 sticky right-0 z-10 bg-muted/60 min-w-[110px] whitespace-nowrap">البيان</td>
                          {filteredData.map((d) => (
                            <td key={d._rawDay} className="py-2 px-3 text-center font-semibold text-foreground border border-border/40 min-w-[80px] whitespace-nowrap">{d.day}</td>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium text-violet-700 dark:text-violet-400 border border-border/40 sticky right-0 z-10 bg-card whitespace-nowrap">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block"></span>صافي المبيعات</span>
                          </td>
                          {filteredData.map((d) => (
                            <td key={d._rawDay} className="py-2 px-3 text-center font-bold text-violet-700 dark:text-violet-400 border border-border/40 number-display">
                              {d['صافيالمبيعات'].toLocaleString('ar-AE')}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium text-orange-600 dark:text-orange-400 border border-border/40 sticky right-0 z-10 bg-card whitespace-nowrap">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>تكلفة المطبخ</span>
                          </td>
                          {filteredData.map((d) => (
                            <td key={d._rawDay} className="py-2 px-3 text-center text-orange-600 dark:text-orange-400 border border-border/40 number-display">
                              {d['تكلفة'].toLocaleString('ar-AE')}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium text-emerald-700 dark:text-emerald-400 border border-border/40 sticky right-0 z-10 bg-card whitespace-nowrap">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>صافي الربح</span>
                          </td>
                          {filteredData.map((d) => (
                            <td key={d._rawDay} className="py-2 px-3 text-center font-semibold text-emerald-700 dark:text-emerald-400 border border-border/40 number-display">
                              {d['ربح'].toLocaleString('ar-AE')}
                            </td>
                          ))}
                        </tr>
                        <tr className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium text-blue-700 dark:text-blue-400 border border-border/40 sticky right-0 z-10 bg-card rounded-br-lg whitespace-nowrap">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>نسبة تكلفة الإنتاج %</span>
                          </td>
                          {filteredData.map((d) => {
                            const pct = d['نسبة%'];
                            const color = pct > 50 ? 'text-rose-600 dark:text-rose-400' : pct > 35 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400';
                            return (
                              <td key={d._rawDay} className={`py-2 px-3 text-center font-bold border border-border/40 number-display ${color}`}>
                                {Number(pct).toFixed(1)}%
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
                    <BarChart3 size={28} className="opacity-30" />
                    <p className="text-xs">لا توجد بيانات لهذا الأسبوع</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

      </div>

      {/* ── Row 3: Charts ── */}
      <div className="grid grid-cols-1 gap-6">
        {/* Sales Chart with view filter */}
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">
                  {salesView === "year" ? "المبيعات الشهرية (12 شهر)" : `مبيعات ${(monthlySales ?? []).find(m => m.monthKey === selectedMonth)?.month ?? selectedMonth}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {salesView === "year" ? "حركة المبيعات على مدار السنة" : "المبيعات اليومية للشهر المحدد"}
                </p>
              </div>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-2">
              {salesView === "month" && (
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="text-xs border border-border rounded-lg px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {(monthlySales ?? []).filter(m => m.sales > 0).map(m => (
                    <option key={m.monthKey} value={m.monthKey}>{m.month} {m.monthKey.slice(0, 4)}</option>
                  ))}
                </select>
              )}
              <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                <button
                  onClick={() => setSalesView("year")}
                  className={`px-3 py-1 transition-colors ${salesView === "year" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  سنوي
                </button>
                <button
                  onClick={() => { setSalesView("month"); }}
                  className={`px-3 py-1 transition-colors ${salesView === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  شهري
                </button>
              </div>
            </div>
          </div>

          {/* Chart */}
          {salesView === "year" ? (
            monthlySales && monthlySales.some(m => m.sales > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={monthlySales} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.55 0.18 250)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.55 0.18 250)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.3)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid oklch(0.85 0 0)" }}
                    labelStyle={{ fontWeight: "bold" }}
                    formatter={(v: number) => [`${fmtNum(v, 0)} د.إ`, "المبيعات"]}
                  />
                  <Area type="monotone" dataKey="sales" stroke="oklch(0.55 0.18 250)" strokeWidth={2}
                    fill="url(#salesGradient)" dot={{ r: 3, fill: "oklch(0.55 0.18 250)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">لا توجد بيانات</div>
            )
          ) : (
            dailySalesData && dailySalesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={dailySalesData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.55 0.18 150)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.55 0.18 150)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.3)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={v => `${v}`} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid oklch(0.85 0 0)" }}
                    labelStyle={{ fontWeight: "bold" }}
                    labelFormatter={(label) => `يوم ${label}`}
                    formatter={(v: number) => [`${fmtNum(v, 0)} د.إ`, "المبيعات"]}
                  />
                  <Area type="monotone" dataKey="sales" stroke="oklch(0.55 0.18 150)" strokeWidth={2}
                    fill="url(#dailyGradient)" dot={{ r: 3, fill: "oklch(0.55 0.18 150)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">لا توجد بيانات لهذا الشهر</div>
            )
          )}
        </div>

      </div>

    </div>
  );
}
