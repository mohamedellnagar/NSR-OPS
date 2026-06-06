import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart,
} from "recharts";
import {
  TrendingUp, TrendingDown, Package, ShoppingCart,
  AlertTriangle, DollarSign, ChefHat, Truck,
  RefreshCw, ArrowUp, ArrowDown, Flame, ReceiptText,
  CircleDollarSign, PiggyBank, BadgePercent, CreditCard,
  Scale, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { Calendar } from "lucide-react";

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff", "#faf5ff"];
const CHART_COLORS = {
  primary: "#6366f1",
  secondary: "#8b5cf6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  muted: "#94a3b8",
};

function fmt(n: number | string | null | undefined, decimals = 0) {
  const num = parseFloat(String(n ?? 0));
  if (isNaN(num)) return "0";
  return num.toLocaleString("ar-SA", { maximumFractionDigits: decimals });
}

function fmtCurrency(n: number | string | null | undefined) {
  const num = parseFloat(String(n ?? 0));
  if (isNaN(num)) return "0 د.إ";
  return `${num.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} د.إ`;
}

function fmtNum(n: number | null | undefined, decimals = 2) {
  const num = parseFloat(String(n ?? 0));
  if (isNaN(num)) return "0";
  return num.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function KPICard({
  title, value, subtitle, icon: Icon, trend, color = "indigo", loading = false,
}: {
  title: string; value: string; subtitle?: string; icon: any;
  trend?: { value: number; label: string }; color?: string; loading?: boolean;
}) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    orange: "bg-orange-50 text-orange-600 border-orange-100",
    green: "bg-green-50 text-green-600 border-green-100",
    teal: "bg-teal-50 text-teal-600 border-teal-100",
  };
  const iconClass = colorMap[color] || colorMap.indigo;

  if (loading) return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`p-2 rounded-lg border ${iconClass}`}>
            <Icon size={16} />
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend.value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {trend.value >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            <span>{Math.abs(trend.value)}% {trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label, currency = false }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: {currency ? fmtCurrency(p.value) : fmt(p.value, 2)}
        </p>
      ))}
    </div>
  );
};

// Gauge-style indicator for percentages
function GaugeIndicator({
  value, max = 100, thresholds, label, unit = "%",
}: {
  value: number; max?: number; thresholds: { good: number; warning: number }; label: string; unit?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value <= thresholds.good ? "#10b981" : value <= thresholds.warning ? "#f59e0b" : "#ef4444";
  const status = value <= thresholds.good ? "جيد" : value <= thresholds.warning ? "تحذير" : "خطر";
  const statusColor = value <= thresholds.good ? "text-emerald-600 bg-emerald-50" : value <= thresholds.warning ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${pct * 2.51} 251`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-foreground">{fmtNum(value, 1)}{unit}</span>
        </div>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{status}</span>
    </div>
  );
}

export default function AnalyticsDashboardPage() {
  const [flowDays, setFlowDays] = useState(14);
  const [consumedDays, setConsumedDays] = useState(30);
  // فلتر التاريخ لقسم P&L
  const [plStartDate, setPlStartDate] = useState("");
  const [plEndDate, setPlEndDate] = useState("");

  const plFilter = useMemo(() => {
    if (!plStartDate && !plEndDate) return undefined;
    return { startDate: plStartDate || undefined, endDate: plEndDate || undefined };
  }, [plStartDate, plEndDate]);

  const summary = trpc.analytics.summary.useQuery();
  const profitLoss = trpc.analytics.profitLoss.useQuery(plFilter);
  const cogsData = trpc.analytics.cogs.useQuery(plFilter);  // COGS uses same date filter
  const topConsumed = trpc.analytics.topConsumed.useQuery({ days: consumedDays, limit: 10 });
  const dailyFlow = trpc.analytics.dailyFlow.useQuery({ days: flowDays });
  const supplierSpend = trpc.analytics.supplierSpend.useQuery();
  const kitchenTrend = trpc.analytics.kitchenTrend.useQuery({ days: 14 });
  const criticalStock = trpc.analytics.criticalStock.useQuery({ limit: 15 });
  const monthlyPurchases = trpc.analytics.monthlyPurchases.useQuery({ months: 6 });

  const s = summary.data;
  const pl = profitLoss.data;
  const cogs = cogsData.data;
  const isLoading = summary.isLoading;
  const plLoading = profitLoss.isLoading;
  const cogsLoading = cogsData.isLoading;

  // Format daily flow for chart
  const flowData = (dailyFlow.data ?? []).map((d: any) => ({
    day: new Date(d.day).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }),
    وارد: parseFloat(d.inValue ?? 0),
    صادر: parseFloat(d.outValue ?? 0),
  }));

  // Format monthly purchases
  const monthlyData = (monthlyPurchases.data ?? []).map((d: any) => ({
    month: d.month,
    إجمالي: parseFloat(d.total ?? 0),
    "بدون ضريبة": parseFloat(d.subtotal ?? 0),
    ضريبة: parseFloat(d.vat ?? 0),
  }));

  // Format supplier spend for pie
  const supplierData = (supplierSpend.data ?? []).slice(0, 6).map((d: any) => ({
    name: d.supplierName,
    value: parseFloat(d.totalSpend ?? 0),
    remaining: parseFloat(d.remaining ?? 0),
  }));

  // Format kitchen trend
  const kitchenData = (kitchenTrend.data ?? []).map((d: any) => ({
    day: new Date(d.day).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }),
    "أصناف منتجة": parseInt(d.itemsCount ?? 0),
    "مغلق": parseInt(d.closedCount ?? 0),
    "مفتوح": parseInt(d.openCount ?? 0),
  }));

  // Format top consumed
  const consumedData = (topConsumed.data ?? []).slice(0, 8).map((d: any) => ({
    name: d.nameAr || d.name,
    تكلفة: parseFloat(d.totalCost ?? 0),
    كمية: parseFloat(d.totalOut ?? 0),
  }));

  // Weekly trend data for profit/loss chart
  const weeklyTrendData = (pl?.weeklyTrend ?? []).map((d: any) => ({
    day: new Date(d.day).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }),
    مبيعات: d.sales,
    تكلفة: d.cost,
    ربح: d.profit,
    "هامش%": d.margin,
  }));

  const isProfit = (pl?.grossProfit ?? 0) >= 0;
  const foodCostPct = pl?.foodCostPct ?? 0;
  const debtRatioPct = pl?.debtRatioPct ?? 0;
  const grossMarginPct = pl?.grossMarginPct ?? 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">لوحة التحليل</h1>
          <p className="text-sm text-muted-foreground mt-0.5">نظرة شاملة على أداء المخزون والمطبخ والربحية</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            summary.refetch();
            profitLoss.refetch();
            topConsumed.refetch();
            dailyFlow.refetch();
            supplierSpend.refetch();
            kitchenTrend.refetch();
            criticalStock.refetch();
            monthlyPurchases.refetch();
          }}
          className="gap-2"
        >
          <RefreshCw size={14} />
          تحديث
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          قسم تحليل الأرباح والخسائر
      ═══════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">تحليل الأرباح والخسائر</h2>
            <Badge variant="outline" className="text-xs">
              {plStartDate || plEndDate ? "فترة مخصصة" : "كل الفترات"}
            </Badge>
          </div>
          {/* فلتر التاريخ */}
          <div className="flex items-center gap-2 mr-auto flex-wrap">
            <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5 border">
              <Calendar size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">من:</span>
              <input
                type="date"
                value={plStartDate}
                onChange={e => setPlStartDate(e.target.value)}
                className="text-xs bg-transparent border-none outline-none text-foreground w-32 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5 border">
              <Calendar size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">إلى:</span>
              <input
                type="date"
                value={plEndDate}
                onChange={e => setPlEndDate(e.target.value)}
                className="text-xs bg-transparent border-none outline-none text-foreground w-32 cursor-pointer"
              />
            </div>
            {(plStartDate || plEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setPlStartDate(""); setPlEndDate(""); }}
                className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
              >
                مسح الفلتر ✕
              </Button>
            )}
          </div>
        </div>

        {/* Profit/Loss Main Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* الربح / الخسارة الإجمالية */}
          <Card className={`border-0 shadow-sm lg:col-span-1 ${isProfit ? "bg-gradient-to-br from-emerald-50 to-teal-50" : "bg-gradient-to-br from-red-50 to-rose-50"}`}>
            <CardContent className="p-5">
              {plLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-3 w-48" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-muted-foreground">صافي الربح / الخسارة</p>
                    <div className={`p-2 rounded-lg ${isProfit ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                      {isProfit ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    </div>
                  </div>
                  <p className={`text-3xl font-extrabold mb-1 ${isProfit ? "text-emerald-700" : "text-red-700"}`}>
                    {fmtNum(pl?.grossProfit)} د.إ
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                    <span className="font-medium text-foreground">{fmtNum(pl?.totalSales)} د.إ</span>
                    <span>مبيعات</span>
                    <span>−</span>
                    <span className="font-medium text-foreground">{fmtNum(pl?.totalKitchenCost)} د.إ</span>
                    <span>تكلفة</span>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${isProfit ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {isProfit ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    هامش الربح: {fmtNum(grossMarginPct, 1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {isProfit
                      ? "المطعم يحقق ربحاً — الهامش ضمن النطاق المقبول للمطاعم (25-40%)"
                      : "المطعم يعمل بخسارة — يُنصح بمراجعة التكاليف والأسعار"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* مؤشرات الأداء الثلاثة */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                مؤشرات الأداء المالي
              </CardTitle>
              <p className="text-xs text-muted-foreground">نسب حيوية لصحة المطعم المالية</p>
            </CardHeader>
            <CardContent>
              {plLoading ? (
                <div className="flex justify-around">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-28" />)}
                </div>
              ) : (
                <div className="flex flex-wrap justify-around gap-4">
                  <GaugeIndicator
                    value={foodCostPct}
                    thresholds={{ good: 30, warning: 38 }}
                    label="نسبة تكلفة الطعام"
                  />
                  <GaugeIndicator
                    value={grossMarginPct}
                    max={60}
                    thresholds={{ good: 40, warning: 25 }}
                    label="هامش الربح الإجمالي"
                  />
                  <GaugeIndicator
                    value={debtRatioPct}
                    thresholds={{ good: 30, warning: 60 }}
                    label="نسبة الديون للمشتريات"
                  />
                </div>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">نسبة تكلفة الطعام</p>
                  <p className="text-xs text-slate-600">المعيار: 28-35%</p>
                  <p className={`text-xs font-semibold mt-0.5 ${foodCostPct <= 35 ? "text-emerald-600" : "text-red-600"}`}>
                    {foodCostPct <= 30 ? "ممتاز" : foodCostPct <= 35 ? "جيد" : foodCostPct <= 40 ? "مرتفع" : "مرتفع جداً"}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">هامش الربح</p>
                  <p className="text-xs text-slate-600">المعيار: 25-40%</p>
                  <p className={`text-xs font-semibold mt-0.5 ${grossMarginPct >= 30 ? "text-emerald-600" : grossMarginPct >= 20 ? "text-amber-600" : "text-red-600"}`}>
                    {grossMarginPct >= 40 ? "ممتاز" : grossMarginPct >= 30 ? "جيد" : grossMarginPct >= 20 ? "مقبول" : "ضعيف"}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">نسبة الديون</p>
                  <p className="text-xs text-slate-600">المعيار: أقل من 30%</p>
                  <p className={`text-xs font-semibold mt-0.5 ${debtRatioPct <= 30 ? "text-emerald-600" : debtRatioPct <= 60 ? "text-amber-600" : "text-red-600"}`}>
                    {debtRatioPct <= 20 ? "ممتاز" : debtRatioPct <= 30 ? "جيد" : debtRatioPct <= 60 ? "تحذير" : "خطر"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Financial Summary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                  <ReceiptText size={16} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                  <p className="text-base font-bold text-foreground">{plLoading ? "..." : `${fmtNum(pl?.totalSales)} د.إ`}</p>
                  <p className="text-[10px] text-muted-foreground">{plLoading ? "" : `${pl?.totalUnits?.toLocaleString()} وحدة`}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-lg border border-orange-100">
                  <Flame size={16} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">تكلفة المطبخ</p>
                  <p className="text-base font-bold text-foreground">{plLoading ? "..." : `${fmtNum(pl?.totalKitchenCost)} د.إ`}</p>
                  <p className="text-[10px] text-muted-foreground">مجموع الأيام المغلقة</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg border border-purple-100">
                  <ShoppingCart size={16} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
                  <p className="text-base font-bold text-foreground">{plLoading ? "..." : `${fmtNum(pl?.totalPurchases)} د.إ`}</p>
                  <p className="text-[10px] text-muted-foreground">جميع الفواتير</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`border-0 shadow-sm ${debtRatioPct > 60 ? "border-l-4 border-l-red-500" : debtRatioPct > 30 ? "border-l-4 border-l-amber-500" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border ${debtRatioPct > 60 ? "bg-red-50 text-red-600 border-red-100" : debtRatioPct > 30 ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"}`}>
                  <CreditCard size={16} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الديون المعلقة</p>
                  <p className={`text-base font-bold ${debtRatioPct > 60 ? "text-red-700" : debtRatioPct > 30 ? "text-amber-700" : "text-emerald-700"}`}>
                    {plLoading ? "..." : `${fmtNum(pl?.totalDeferred)} د.إ`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {plLoading ? "" : `${fmtNum(debtRatioPct, 1)}% من المشتريات`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Debt Alert Banner */}
        {!plLoading && debtRatioPct > 60 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700">تحذير: نسبة ديون مرتفعة جداً</p>
              <p className="text-xs text-red-600 mt-0.5">
                الديون المعلقة تمثل {fmtNum(debtRatioPct, 1)}% من إجمالي المشتريات ({fmtNum(pl?.totalDeferred)} د.إ).
                يُنصح بمراجعة الموردين وجدولة السداد لتجنب التأثير على التشغيل.
              </p>
            </div>
          </div>
        )}
        {!plLoading && debtRatioPct > 30 && debtRatioPct <= 60 && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <AlertTriangle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-700">تنبيه: الديون في مستوى يستوجب المتابعة</p>
              <p className="text-xs text-amber-600 mt-0.5">
                الديون المعلقة تمثل {fmtNum(debtRatioPct, 1)}% من المشتريات. يُنصح بالسداد التدريجي.
              </p>
            </div>
          </div>
        )}

        {/* Weekly Trend Chart */}
        {weeklyTrendData.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" />
                <div>
                  <CardTitle className="text-base font-semibold">الاتجاه الأسبوعي: المبيعات مقابل التكلفة</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">مقارنة المبيعات والتكلفة والربح اليومي (آخر 7 أيام بها مبيعات)</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {plLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={weeklyTrendData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}k`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip currency />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="مبيعات" fill={CHART_COLORS.primary} radius={[4,4,0,0]} opacity={0.85} />
                    <Bar yAxisId="left" dataKey="تكلفة" fill={CHART_COLORS.danger} radius={[4,4,0,0]} opacity={0.75} />
                    <Bar yAxisId="left" dataKey="ربح" fill={CHART_COLORS.success} radius={[4,4,0,0]} opacity={0.85} />
                    <Line yAxisId="right" type="monotone" dataKey="هامش%" stroke={CHART_COLORS.warning} strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <p className="text-xs text-muted-foreground mt-2 text-center">
                الخط الأصفر يمثل هامش الربح % — المعيار المثالي للمطاعم بين 25% و40%
              </p>
            </CardContent>
          </Card>
        )}
      </div>



      {/* ═══════════════════════════════════════════════════════════════
          قسم كفاءة المخزون - Inventory Efficiency
      ═══════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw size={18} className="text-primary" />
          <h2 className="text-lg font-bold text-foreground">كفاءة المخزون</h2>
          <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">دوران المخزون ورأس المال العامل</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4">كلما زاد دوران المخزون = المخزون يتحرك بسرعة = كفاءة أعلى</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* بطاقة دوران المخزون */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <RefreshCw size={16} className="text-violet-600" />
                نسبة دوران المخزون (Inventory Turnover)
              </CardTitle>
              <p className="text-xs text-muted-foreground">دوران المخزون = COGS ÷ متوسط قيمة المخزون</p>
            </CardHeader>
            <CardContent>
              {cogsLoading ? <Skeleton className="h-32 w-full" /> : (
                <div className="space-y-4">
                  {/* المؤشر الرئيسي */}
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-4xl font-extrabold text-violet-700">
                        {fmtNum(cogs?.inventoryTurnover, 2)}
                        <span className="text-base font-normal text-muted-foreground mr-1">مرة/سنة</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        متوسط المخزون: {fmtNum(cogs?.avgStock)} د.إ
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">أيام الاحتفاظ</p>
                      <p className="text-2xl font-bold text-slate-700">{fmtNum(cogs?.daysOnHand, 0)}</p>
                      <p className="text-xs text-muted-foreground">يوم</p>
                    </div>
                  </div>
                  {/* شريط التقييم */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>ضعيف (&lt;2)</span>
                      <span>جيد (4-6)</span>
                      <span>ممتاز (&gt;8)</span>
                    </div>
                    <div className="relative h-3 bg-gradient-to-r from-red-200 via-amber-200 to-emerald-200 rounded-full overflow-hidden">
                      <div
                        className="absolute top-0 h-full w-1.5 bg-violet-600 rounded-full shadow"
                        style={{ left: `${Math.min(((cogs?.inventoryTurnover ?? 0) / 12) * 100, 98)}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground">مخزون أول المدة</p>
                      <p className="text-sm font-bold text-blue-700">{fmtNum(cogs?.openingStock)} د.إ</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground">COGS</p>
                      <p className="text-sm font-bold text-orange-700">{fmtNum(cogs?.cogs)} د.إ</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground">مخزون آخر المدة</p>
                      <p className="text-sm font-bold text-teal-700">{fmtNum(cogs?.closingStock)} د.إ</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* بطاقة رأس المال العامل */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PiggyBank size={16} className="text-amber-600" />
                رأس المال المحبوس في المخزون
              </CardTitle>
              <p className="text-xs text-muted-foreground">قيمة المخزون كأصل متداول — كم رأس مال مجمد في المخزون</p>
            </CardHeader>
            <CardContent>
              {cogsLoading ? <Skeleton className="h-32 w-full" /> : (
                <div className="space-y-4">
                  {/* المبلغ الإجمالي */}
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-4xl font-extrabold text-amber-700">
                        {fmtNum(cogs?.capitalLocked)}
                        <span className="text-base font-normal text-muted-foreground mr-1">د.إ</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fmtNum(cogs?.capitalLockedPct, 1)}% من إجمالي المشتريات
                      </p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                      (cogs?.capitalLockedPct ?? 0) <= 40 ? "bg-emerald-100 text-emerald-700" :
                      (cogs?.capitalLockedPct ?? 0) <= 70 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {(cogs?.capitalLockedPct ?? 0) <= 40 ? "كفاءة جيدة" :
                       (cogs?.capitalLockedPct ?? 0) <= 70 ? "متوسط" : "مخزون زائد"}
                    </div>
                  </div>
                  {/* تفصيل المخزون */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-indigo-500" />
                        <span className="text-xs text-muted-foreground">مواد خام</span>
                      </div>
                      <span className="text-sm font-semibold">{fmtNum(cogs?.rawStockValue)} د.إ</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full"
                        style={{ width: `${cogs?.totalStockValue ? (cogs.rawStockValue / cogs.totalStockValue) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="text-xs text-muted-foreground">مواد مصنّعة</span>
                      </div>
                      <span className="text-sm font-semibold">{fmtNum(cogs?.semiStockValue)} د.إ</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full"
                        style={{ width: `${cogs?.totalStockValue ? (cogs.semiStockValue / cogs.totalStockValue) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                    <p className="text-xs text-amber-800">
                      <span className="font-semibold">تفسير:</span> لديك {fmtNum(cogs?.capitalLocked)} د.إ مجمدة في مخزون غير مستهلك.
                      {(cogs?.inventoryTurnover ?? 0) < 4
                        ? " نسبة الدوران منخفضة — يُنصح بتقليل المخزون أو زيادة المبيعات."
                        : " نسبة الدوران جيدة — المخزون يتحرك بكفاءة."
                      }
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row 2: Daily Flow + Monthly Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Inventory Flow */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">حركة المخزون اليومية</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">قيمة الوارد مقابل الصادر (د.إ)</p>
              </div>
              <div className="flex gap-1">
                {[7, 14, 30].map((d) => (
                  <Button
                    key={d}
                    variant={flowDays === d ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setFlowDays(d)}
                  >
                    {d}ي
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dailyFlow.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : flowData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={flowData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.danger} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART_COLORS.danger} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip currency />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="وارد" stroke={CHART_COLORS.primary} fill="url(#colorIn)" strokeWidth={2} />
                  <Area type="monotone" dataKey="صادر" stroke={CHART_COLORS.danger} fill="url(#colorOut)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              الوارد يمثل قيمة المشتريات، الصادر يمثل قيمة المواد الخارجة من المخزون
            </p>
          </CardContent>
        </Card>

        {/* Monthly Purchases */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">المشتريات الشهرية</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">إجمالي المشتريات والضريبة آخر 6 أشهر (د.إ)</p>
          </CardHeader>
          <CardContent>
            {monthlyPurchases.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : monthlyData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip currency />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="بدون ضريبة" fill={CHART_COLORS.primary} radius={[4,4,0,0]} stackId="a" />
                  <Bar dataKey="ضريبة" fill={CHART_COLORS.secondary} radius={[4,4,0,0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              الأعمدة المكدسة تُظهر حصة الضريبة من إجمالي كل شهر
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Supplier Pie + Kitchen Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Supplier Pie */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">توزيع الإنفاق على الموردين</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">نسبة كل مورد من إجمالي المشتريات</p>
          </CardHeader>
          <CardContent>
            {supplierSpend.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : supplierData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={supplierData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                      {supplierData.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {supplierData.map((d: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-foreground truncate flex-1">{d.name}</span>
                      <span className="text-xs font-semibold text-foreground">{fmtCurrency(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kitchen Trend */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">نشاط المطبخ اليومي</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">عدد الأصناف المنتجة يومياً (آخر 14 يوم)</p>
          </CardHeader>
          <CardContent>
            {kitchenTrend.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : kitchenData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={kitchenData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="مغلق" fill={CHART_COLORS.success} radius={[4,4,0,0]} stackId="a" />
                  <Bar dataKey="مفتوح" fill={CHART_COLORS.warning} radius={[4,4,0,0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              الأخضر = أيام مغلقة (محاسبة)، الأصفر = أيام مفتوحة (قيد التشغيل)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Top Consumed + Critical Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Consumed */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">أكثر المواد استهلاكاً</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">بالتكلفة الإجمالية (د.إ)</p>
              </div>
              <div className="flex gap-1">
                {[7, 30, 90].map((d) => (
                  <Button
                    key={d}
                    variant={consumedDays === d ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConsumedDays(d)}
                  >
                    {d}ي
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {topConsumed.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : consumedData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={consumedData} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v/1000).toFixed(1)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
                  <Tooltip content={<CustomTooltip currency />} />
                  <Bar dataKey="تكلفة" fill={CHART_COLORS.primary} radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              المواد الأعلى تكلفة تستحق مراجعة دورية للأسعار والكميات
            </p>
          </CardContent>
        </Card>

        {/* Critical Stock */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              <div>
                <CardTitle className="text-base font-semibold">المواد ذات المخزون الحرج</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">تحتاج إعادة طلب عاجل</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {criticalStock.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : !criticalStock.data?.length ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                <Package size={32} className="text-emerald-400" />
                <p>جميع المواد بمستويات جيدة</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {criticalStock.data.map((m: any, i: number) => {
                  const isNeg = parseFloat(m.currentQuantity) < 0;
                  const isOut = parseFloat(m.currentQuantity) === 0;
                  const pct = m.minimumQuantity > 0 ? Math.round((parseFloat(m.currentQuantity) / parseFloat(m.minimumQuantity)) * 100) : null;
                  return (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${isNeg ? "bg-red-500" : isOut ? "bg-orange-500" : "bg-amber-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{m.nameAr || m.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {fmt(m.currentQuantity, 2)} / {fmt(m.minimumQuantity, 2)} {m.unit}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0.5 flex-shrink-0 ${
                          isNeg ? "border-red-300 text-red-600 bg-red-50" :
                          isOut ? "border-orange-300 text-orange-600 bg-orange-50" :
                          "border-amber-300 text-amber-600 bg-amber-50"
                        }`}
                      >
                        {isNeg ? "سالب" : isOut ? "نفد" : pct ? `${pct}%` : "منخفض"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2 text-center">
              المواد السالبة تعني استهلاكاً تجاوز المخزون — يجب مراجعة الوصفات أو إدخال مشتريات
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 5: Supplier Details Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Truck size={16} className="text-primary" />
            <div>
              <CardTitle className="text-base font-semibold">تحليل الموردين</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">إجمالي الإنفاق والمتبقي لكل مورد</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {supplierSpend.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !supplierSpend.data?.length ? (
            <div className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات موردين</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">المورد</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">الفواتير</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">الإجمالي</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">المدفوع</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">المتبقي</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">آخر فاتورة</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierSpend.data.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-foreground">{s.supplierName}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{fmt(s.invoiceCount)}</td>
                      <td className="py-2.5 px-3 font-semibold text-foreground">{fmtCurrency(s.totalSpend)}</td>
                      <td className="py-2.5 px-3 text-emerald-600">{fmtCurrency(s.totalPaid)}</td>
                      <td className="py-2.5 px-3">
                        {parseFloat(s.remaining) > 0 ? (
                          <span className="text-amber-600 font-medium">{fmtCurrency(s.remaining)}</span>
                        ) : (
                          <span className="text-emerald-600">مسدد</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">
                        {s.lastInvoice ? new Date(s.lastInvoice).toLocaleDateString("ar-SA") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3 text-center">
            المبالغ المتبقية تمثل الديون المستحقة للموردين — يُنصح بمتابعتها أسبوعياً لتجنب التأخر في السداد
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

