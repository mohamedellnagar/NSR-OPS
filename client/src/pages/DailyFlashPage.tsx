import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  Zap, TrendingUp, Utensils, Trash2, Package, FileText,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw,
  ShoppingBag, DollarSign, BarChart2,
} from "lucide-react";

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function SectionCard({
  title,
  icon,
  color,
  children,
  collapsible = false,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const borderMap: Record<string, string> = {
    green: "border-green-200",
    blue: "border-blue-200",
    orange: "border-orange-200",
    red: "border-red-200",
    purple: "border-purple-200",
    indigo: "border-indigo-200",
    gray: "border-gray-200",
  };
  const iconMap: Record<string, string> = {
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
    orange: "bg-orange-100 text-orange-600",
    red: "bg-red-100 text-red-600",
    purple: "bg-purple-100 text-purple-600",
    indigo: "bg-indigo-100 text-indigo-600",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <div className={`bg-white rounded-xl border ${borderMap[color] ?? "border-gray-200"} overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => collapsible && setOpen((v) => !v)}
        disabled={!collapsible}
      >
        <div className="flex items-center gap-3">
          <span className={`p-2 rounded-lg ${iconMap[color] ?? "bg-gray-100 text-gray-600"}`}>
            {icon}
          </span>
          <span className="font-semibold text-gray-800">{title}</span>
        </div>
        {collapsible && (
          open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function StatRow({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-blue-700" : "text-gray-800"}`}>{value}</span>
    </div>
  );
}

export default function DailyFlashPage() {
  const { t, dir } = useLanguage();
  const isRtl = dir === "rtl";
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));

  const { data, isLoading, refetch, isRefetching } = trpc.dailyFlash.report.useQuery(
    { date: selectedDate },
    { keepPreviousData: true }
  );

  const prev = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(formatDate(d));
  };
  const next = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    if (d <= new Date()) setSelectedDate(formatDate(d));
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-500" />
            {isRtl ? "تقرير اليومية السريع" : "Daily Flash Report"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isRtl ? "ملخص شامل لجميع مؤشرات الأداء ليوم واحد" : "Comprehensive KPI summary for a single day"}
          </p>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
          >
            {isRtl ? "›" : "‹"}
          </button>
          <input
            type="date"
            value={selectedDate}
            max={formatDate(new Date())}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium"
          />
          <button
            onClick={next}
            disabled={selectedDate >= formatDate(new Date())}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRtl ? "‹" : "›"}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
            title={isRtl ? "تحديث" : "Refresh"}
          >
            <RefreshCw className={`h-4 w-4 text-gray-500 ${isRefetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500 mx-auto mb-3" />
            <p>{isRtl ? "جاري تحميل التقرير..." : "Loading report..."}</p>
          </div>
        </div>
      ) : !data ? null : (
        <>
          {/* Alert banners */}
          {data.alerts.length > 0 && (
            <div className="space-y-2">
              {data.alerts.map((alert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{alert}</span>
                </div>
              ))}
            </div>
          )}
          {data.alerts.length === 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{isRtl ? "لا تنبيهات — يوم ممتاز ✅" : "No alerts — excellent day ✅"}</span>
            </div>
          )}

          {/* Quick stats hero row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: isRtl ? "الإيراد" : "Revenue",
                value: `${data.sales.totalRevenue.toFixed(0)}`,
                unit: isRtl ? "درهم" : "AED",
                icon: <DollarSign className="h-4 w-4" />,
                bg: "bg-green-500",
              },
              {
                label: isRtl ? "تكلفة الطعام" : "Food Cost",
                value: data.foodCost.foodCostPct != null ? `${data.foodCost.foodCostPct}%` : "—",
                unit: "",
                icon: <BarChart2 className="h-4 w-4" />,
                bg:
                  data.foodCost.foodCostPct == null
                    ? "bg-gray-400"
                    : data.foodCost.foodCostPct > 35
                    ? "bg-red-500"
                    : data.foodCost.foodCostPct > 30
                    ? "bg-orange-500"
                    : "bg-green-500",
              },
              {
                label: isRtl ? "الإنتاج" : "Production",
                value: String(data.kitchen.productionCount),
                unit: isRtl ? "دفعة" : "batches",
                icon: <Utensils className="h-4 w-4" />,
                bg: "bg-blue-500",
              },
              {
                label: isRtl ? "الهدر" : "Waste",
                value: `${data.waste.totalCost.toFixed(0)}`,
                unit: isRtl ? "درهم" : "AED",
                icon: <Trash2 className="h-4 w-4" />,
                bg: data.waste.totalCost > data.sales.totalRevenue * 0.05 ? "bg-red-500" : "bg-gray-500",
              },
              {
                label: isRtl ? "المشتريات" : "Purchases",
                value: `${data.foodCost.actualPurchases.toFixed(0)}`,
                unit: isRtl ? "درهم" : "AED",
                icon: <ShoppingBag className="h-4 w-4" />,
                bg: "bg-purple-500",
              },
              {
                label: isRtl ? "الفواتير" : "Invoices",
                value: String(data.invoices.invoiceCount),
                unit: isRtl ? "فاتورة" : "invoices",
                icon: <FileText className="h-4 w-4" />,
                bg: "bg-indigo-500",
              },
            ].map((item) => (
              <div key={item.label} className="rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                <div className={`${item.bg} text-white px-3 py-2 flex items-center gap-2`}>
                  {item.icon}
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
                <div className="px-3 py-2 bg-white">
                  <span className="text-lg font-bold text-gray-900">{item.value}</span>
                  {item.unit && <span className="text-xs text-gray-400 ms-1">{item.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Detail sections grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Sales */}
            <SectionCard
              title={isRtl ? "المبيعات" : "Sales"}
              icon={<TrendingUp className="h-4 w-4" />}
              color="green"
              collapsible
            >
              <div className="space-y-0.5">
                <StatRow
                  label={isRtl ? "إجمالي الإيراد" : "Total Revenue"}
                  value={`${data.sales.totalRevenue.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                  highlight
                />
                <StatRow
                  label={isRtl ? "ملفات مرفوعة" : "Upload Files"}
                  value={data.sales.uploadCount}
                />
                {data.sales.topSellers.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      {isRtl ? "أعلى المبيعات" : "Top Sellers"}
                    </p>
                    {data.sales.topSellers.map((s, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-xs border-b border-gray-50 last:border-0">
                        <span className="text-gray-700 flex items-center gap-1">
                          <span
                            className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold ${
                              i === 0 ? "bg-yellow-400" : i === 1 ? "bg-gray-400" : "bg-amber-600"
                            }`}
                          >
                            {i + 1}
                          </span>
                          {s.nameAr || s.name}
                        </span>
                        <span className="text-gray-500">
                          {s.qty}× — {s.revenue.toFixed(0)} {isRtl ? "درهم" : "AED"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Food Cost */}
            <SectionCard
              title={isRtl ? "تكلفة الطعام" : "Food Cost"}
              icon={<BarChart2 className="h-4 w-4" />}
              color="orange"
              collapsible
            >
              <div className="space-y-0.5">
                <StatRow
                  label={isRtl ? "التكلفة النظرية" : "Theoretical Cost"}
                  value={`${data.foodCost.theoreticalCost.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                />
                <StatRow
                  label={isRtl ? "المشتريات الفعلية" : "Actual Purchases"}
                  value={`${data.foodCost.actualPurchases.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                />
                <StatRow
                  label={isRtl ? "تكلفة الهدر" : "Waste Cost"}
                  value={`${data.foodCost.wasteCost.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                />
                <StatRow
                  label={isRtl ? "الأساس الإجمالي" : "Total Cost Basis"}
                  value={`${data.foodCost.totalCostBasis.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                />
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">
                      {isRtl ? "نسبة تكلفة الطعام" : "Food Cost %"}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        data.foodCost.foodCostPct == null
                          ? "text-gray-400"
                          : data.foodCost.foodCostPct > 35
                          ? "text-red-600"
                          : data.foodCost.foodCostPct > 30
                          ? "text-orange-600"
                          : "text-green-600"
                      }`}
                    >
                      {data.foodCost.foodCostPct != null ? `${data.foodCost.foodCostPct}%` : "—"}
                    </span>
                  </div>
                  {data.foodCost.foodCostPct != null && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          data.foodCost.foodCostPct > 35
                            ? "bg-red-500"
                            : data.foodCost.foodCostPct > 30
                            ? "bg-orange-500"
                            : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(100, data.foodCost.foodCostPct / 50 * 100)}%` }}
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {isRtl ? "الهدف: أقل من 30% — الحد الأقصى: 35%" : "Target: <30% — Max: 35%"}
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Kitchen */}
            <SectionCard
              title={isRtl ? "المطبخ" : "Kitchen"}
              icon={<Utensils className="h-4 w-4" />}
              color="blue"
              collapsible
            >
              <div className="space-y-0.5">
                <StatRow
                  label={isRtl ? "إجمالي الدفعات" : "Total Batches"}
                  value={data.kitchen.productionCount}
                  highlight
                />
                <StatRow
                  label={isRtl ? "مغلقة" : "Closed"}
                  value={data.kitchen.pullsClosed}
                />
                <StatRow
                  label={isRtl ? "مفتوحة" : "Open"}
                  value={data.kitchen.pullsOpen}
                />
                {data.kitchen.topProduced.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      {isRtl ? "أعلى الإنتاج" : "Top Produced"}
                    </p>
                    {data.kitchen.topProduced.map((p, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-xs border-b border-gray-50 last:border-0">
                        <span className="text-gray-700">{p.name}</span>
                        <span className="text-gray-500">{p.qty} {isRtl ? "وحدة" : "units"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Waste */}
            <SectionCard
              title={isRtl ? "الهدر" : "Waste"}
              icon={<Trash2 className="h-4 w-4" />}
              color="red"
              collapsible
            >
              <div className="space-y-0.5">
                <StatRow
                  label={isRtl ? "إجمالي التكلفة" : "Total Cost"}
                  value={`${data.waste.totalCost.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                  highlight
                />
                <StatRow
                  label={isRtl ? "الكمية الإجمالية" : "Total Qty"}
                  value={`${data.waste.totalQty.toFixed(2)}`}
                />
                <StatRow
                  label={isRtl ? "عدد الإدخالات" : "Entries"}
                  value={data.waste.entryCount}
                />
                {data.waste.topWasted.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      {isRtl ? "أعلى الهدر" : "Top Wasted"}
                    </p>
                    {data.waste.topWasted.map((w, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-xs border-b border-gray-50 last:border-0">
                        <span className="text-gray-700">{w.name}</span>
                        <span className="text-red-500 font-medium">{w.cost.toFixed(2)} {isRtl ? "درهم" : "AED"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Inventory */}
            <SectionCard
              title={isRtl ? "المخزون" : "Inventory"}
              icon={<Package className="h-4 w-4" />}
              color="purple"
              collapsible
            >
              <div className="space-y-0.5">
                <StatRow
                  label={isRtl ? "مشتريات (عدد)" : "Stock In Count"}
                  value={data.inventory.stockInCount}
                />
                <StatRow
                  label={isRtl ? "قيمة المشتريات" : "Stock In Value"}
                  value={`${data.inventory.stockInValue.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                  highlight
                />
                <StatRow
                  label={isRtl ? "صادر (عدد)" : "Stock Out Count"}
                  value={data.inventory.stockOutCount}
                />
                <div className="pt-2 flex gap-2">
                  {data.inventory.criticalStockCount > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-semibold">
                      🔴 {data.inventory.criticalStockCount} {isRtl ? "نفد" : "OOS"}
                    </span>
                  )}
                  {data.inventory.lowStockCount > 0 && (
                    <span className="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-700 text-xs font-semibold">
                      🟡 {data.inventory.lowStockCount} {isRtl ? "منخفض" : "Low"}
                    </span>
                  )}
                  {data.inventory.criticalStockCount === 0 && data.inventory.lowStockCount === 0 && (
                    <span className="px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-semibold">
                      ✅ {isRtl ? "المخزون جيد" : "Stock OK"}
                    </span>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* Invoices */}
            <SectionCard
              title={isRtl ? "الفواتير" : "Invoices"}
              icon={<FileText className="h-4 w-4" />}
              color="indigo"
              collapsible
            >
              <div className="space-y-0.5">
                <StatRow
                  label={isRtl ? "عدد الفواتير" : "Invoice Count"}
                  value={data.invoices.invoiceCount}
                />
                <StatRow
                  label={isRtl ? "الإجمالي" : "Total Amount"}
                  value={`${data.invoices.totalInvoiceAmount.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                  highlight
                />
                <StatRow
                  label={isRtl ? "المدفوع" : "Paid"}
                  value={`${data.invoices.paidAmount.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                />
                <StatRow
                  label={isRtl ? "المتبقي" : "Pending"}
                  value={`${data.invoices.pendingAmount.toFixed(2)} ${isRtl ? "درهم" : "AED"}`}
                />
                {data.invoices.pendingAmount > 0 && (
                  <div className="pt-2">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full"
                        style={{
                          width: `${
                            data.invoices.totalInvoiceAmount > 0
                              ? (data.invoices.paidAmount / data.invoices.totalInvoiceAmount) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {data.invoices.totalInvoiceAmount > 0
                        ? `${Math.round((data.invoices.paidAmount / data.invoices.totalInvoiceAmount) * 100)}% ${isRtl ? "مدفوع" : "paid"}`
                        : ""}
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
