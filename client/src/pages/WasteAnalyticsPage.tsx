import { useState, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Trash2, TrendingDown, TrendingUp, Calendar, AlertTriangle, CheckCircle2, Package } from "lucide-react";

const REASON_COLORS: Record<string, string> = {
  "منتهية الصلاحية": "#ef4444",
  "تلف": "#f97316",
  "إنتاج زائد": "#eab308",
  "ضرر في التخزين": "#8b5cf6",
  "خطأ في المطبخ": "#3b82f6",
  "أسباب أخرى": "#6b7280",
  "expired": "#ef4444",
  "spoiled": "#f97316",
  "overproduced": "#eab308",
  "damaged": "#8b5cf6",
  "kitchen_error": "#3b82f6",
  "other": "#6b7280",
};

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#8b5cf6", "#3b82f6", "#6b7280", "#10b981", "#06b6d4"];

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  color = "gray",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    red: "bg-red-50 border-red-200 text-red-600",
    orange: "bg-orange-50 border-orange-200 text-orange-600",
    green: "bg-green-50 border-green-200 text-green-600",
    blue: "bg-blue-50 border-blue-200 text-blue-600",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium opacity-70 mb-0.5">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export default function WasteAnalyticsPage() {
  const { t, dir } = useLanguage();
  const isRtl = dir === "rtl";

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 29);

  const [fromDate, setFromDate] = useState(formatDate(thirtyDaysAgo));
  const [toDate, setToDate] = useState(formatDate(today));

  const { data, isLoading } = trpc.wasteAnalytics.analytics.useQuery(
    { fromDate, toDate },
    { keepPreviousData: true }
  );

  const weekTrend = useMemo(() => {
    if (!data) return null;
    const { currentWeekCost, prevWeekCost, changePct } = data.weekComparison;
    return { currentWeekCost, prevWeekCost, changePct };
  }, [data]);

  const quickRanges = [
    { label: isRtl ? "آخر 7 أيام" : "Last 7 days", days: 7 },
    { label: isRtl ? "آخر 30 يوماً" : "Last 30 days", days: 30 },
    { label: isRtl ? "آخر 90 يوماً" : "Last 90 days", days: 90 },
  ];

  function applyQuickRange(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFromDate(formatDate(start));
    setToDate(formatDate(end));
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-red-500" />
            {isRtl ? "تحليل الهدر المتقدم" : "Advanced Waste Analytics"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isRtl ? "أنماط الهدر ومقارنة المشتريات والتوصيات" : "Waste patterns, purchase comparison and recommendations"}
          </p>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-2">
          {quickRanges.map((r) => (
            <button
              key={r.days}
              onClick={() => applyQuickRange(r.days)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
            >
              {r.label}
            </button>
          ))}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          />
          <span className="text-gray-400 text-sm">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500 mx-auto mb-3" />
            <p>{isRtl ? "جاري التحليل..." : "Analyzing..."}</p>
          </div>
        </div>
      ) : !data ? null : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label={isRtl ? "إجمالي تكلفة الهدر" : "Total Waste Cost"}
              value={`${data.summary.totalWasteCost.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
              sub={isRtl ? `${data.summary.totalEntries} إدخال` : `${data.summary.totalEntries} entries`}
              icon={<Trash2 className="h-5 w-5" />}
              color="red"
            />
            <KpiCard
              label={isRtl ? "متوسط التكلفة اليومية" : "Avg Daily Cost"}
              value={`${data.summary.avgDailyCost.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
              sub={isRtl ? `خلال ${data.summary.daysWithWaste} يوم` : `over ${data.summary.daysWithWaste} days`}
              icon={<Calendar className="h-5 w-5" />}
              color="orange"
            />
            <KpiCard
              label={isRtl ? "هذا الأسبوع" : "This Week"}
              value={`${(weekTrend?.currentWeekCost ?? 0).toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
              sub={
                weekTrend && weekTrend.changePct !== 0
                  ? `${weekTrend.changePct > 0 ? "+" : ""}${weekTrend.changePct}% ${isRtl ? "عن الأسبوع الماضي" : "vs last week"}`
                  : undefined
              }
              icon={weekTrend && weekTrend.changePct > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              color={weekTrend && weekTrend.changePct > 10 ? "red" : weekTrend && weekTrend.changePct < 0 ? "green" : "orange"}
            />
            <KpiCard
              label={isRtl ? "إجمالي الكميات" : "Total Qty Wasted"}
              value={data.summary.totalWasteQty.toFixed(1)}
              sub={isRtl ? "وحدة من المواد الخام" : "raw material units"}
              icon={<Package className="h-5 w-5" />}
              color="gray"
            />
          </div>

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {isRtl ? "توصيات" : "Recommendations"}
              </h3>
              <ul className="space-y-1">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily trend */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-4">
                {isRtl ? "اتجاه الهدر اليومي" : "Daily Waste Trend"}
              </h3>
              {data.dailyTrend.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                  {isRtl ? "لا توجد بيانات" : "No data"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(2)} AED`, isRtl ? "التكلفة" : "Cost"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalCost"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* By reason pie */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-4">
                {isRtl ? "الهدر حسب السبب" : "Waste by Reason"}
              </h3>
              {data.byReason.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                  {isRtl ? "لا توجد بيانات" : "No data"}
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={data.byReason}
                        dataKey="totalCost"
                        nameKey="reason"
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                      >
                        {data.byReason.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={REASON_COLORS[entry.reason] ?? PIE_COLORS[idx % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [`${v.toFixed(2)} AED`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="space-y-1 mt-2">
                    {data.byReason.map((r, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: REASON_COLORS[r.reason] ?? PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="text-gray-700">{r.reason}</span>
                        </span>
                        <span className="font-medium text-gray-800">{r.pctOfTotal}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          {/* Top items bar chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-4">
              {isRtl ? "أعلى 10 مواد هدراً" : "Top 10 Wasted Materials"}
            </h3>
            {data.topItems.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                {isRtl ? "لا توجد بيانات" : "No data"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={data.topItems.map((item) => ({
                    name: item.materialNameAr || item.materialName,
                    cost: item.totalCost,
                    pct: item.pctOfTotalCost,
                  }))}
                  layout="vertical"
                  margin={{ left: 8, right: 48 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "cost" ? [`${v.toFixed(2)} AED`, isRtl ? "التكلفة" : "Cost"] : [`${v}%`, isRtl ? "النسبة" : "Share"]
                    }
                  />
                  <Bar dataKey="cost" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Waste vs Purchases table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">
                {isRtl ? "الهدر مقابل المشتريات" : "Waste vs Purchases"}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {isRtl ? "نسبة الهدر من كمية المشتريات لكل مادة" : "Waste as % of purchased quantity per material"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className={`p-3 font-medium ${isRtl ? "text-right" : "text-left"}`}>
                      {isRtl ? "المادة" : "Material"}
                    </th>
                    <th className="p-3 font-medium text-center">{isRtl ? "مشتريات" : "Purchased"}</th>
                    <th className="p-3 font-medium text-center">{isRtl ? "هدر" : "Wasted"}</th>
                    <th className="p-3 font-medium text-center">{isRtl ? "نسبة الهدر" : "Waste %"}</th>
                    <th className="p-3 font-medium text-center">{isRtl ? "تكلفة الهدر" : "Waste Cost"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.wasteVsPurchase.map((item) => (
                    <tr key={item.materialId} className="hover:bg-gray-50">
                      <td className={`p-3 font-medium text-gray-900 ${isRtl ? "text-right" : "text-left"}`}>
                        {item.materialNameAr || item.materialName}
                        <span className="text-xs text-gray-400 ms-1">({item.unit})</span>
                      </td>
                      <td className="p-3 text-center text-gray-600">
                        {item.purchaseQty.toFixed(2)}
                      </td>
                      <td className="p-3 text-center text-red-600 font-medium">
                        {item.wasteQty.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            item.wastePct > 20
                              ? "bg-red-100 text-red-700"
                              : item.wastePct > 10
                              ? "bg-orange-100 text-orange-700"
                              : item.wastePct > 5
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {item.wastePct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3 text-center text-gray-700">
                        {item.wasteCost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {data.wasteVsPurchase.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400 text-sm">
                        {isRtl ? "لا توجد بيانات في هذه الفترة" : "No data in this period"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top items detail table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                {isRtl ? "تفاصيل أعلى المواد هدراً" : "Top Wasted Items Detail"}
              </h3>
              <span className="text-xs text-gray-400">
                {isRtl ? `${data.topItems.length} مادة` : `${data.topItems.length} items`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className={`p-3 font-medium ${isRtl ? "text-right" : "text-left"}`}>
                      {isRtl ? "المادة" : "Material"}
                    </th>
                    <th className="p-3 font-medium text-center">{isRtl ? "الكمية" : "Qty"}</th>
                    <th className="p-3 font-medium text-center">{isRtl ? "التكلفة" : "Cost"}</th>
                    <th className="p-3 font-medium text-center">{isRtl ? "% من الإجمالي" : "% of Total"}</th>
                    <th className="p-3 font-medium text-center">{isRtl ? "عدد المرات" : "Entries"}</th>
                    <th className="p-3 font-medium text-center">{isRtl ? "آخر تاريخ" : "Last Date"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.topItems.map((item, idx) => (
                    <tr key={item.materialId} className="hover:bg-gray-50">
                      <td className={`p-3 ${isRtl ? "text-right" : "text-left"}`}>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${
                              idx === 0 ? "bg-red-500" : idx < 3 ? "bg-orange-400" : "bg-gray-400"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="font-medium text-gray-900">
                            {item.materialNameAr || item.materialName}
                          </span>
                          <span className="text-xs text-gray-400">({item.unit})</span>
                        </div>
                      </td>
                      <td className="p-3 text-center text-gray-600">{item.totalQty.toFixed(2)}</td>
                      <td className="p-3 text-center font-semibold text-red-600">
                        {item.totalCost.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div
                              className="bg-red-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, item.pctOfTotalCost)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600 w-10 text-right">{item.pctOfTotalCost}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-center text-gray-600">{item.entryCount}</td>
                      <td className="p-3 text-center text-gray-500 text-xs">{item.lastWasteDate}</td>
                    </tr>
                  ))}
                  {data.topItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400 text-sm">
                        <div className="flex flex-col items-center gap-2">
                          <CheckCircle2 className="h-8 w-8 text-green-300" />
                          {isRtl ? "لا توجد سجلات هدر في هذه الفترة" : "No waste records in this period"}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
