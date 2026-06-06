import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Download,
  Search,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";

function formatNum(n: number, decimals = 2) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrency(n: number) {
  return `${formatNum(n)} د.إ`;
}

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

export default function PurchaseVsSalesPage() {
  const { t, language } = useLanguage();
  const defaults = getDefaultDateRange();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [search, setSearch] = useState("");
  const [queryParams, setQueryParams] = useState({
    fromDate: defaults.from,
    toDate: defaults.to,
    search: "",
  });

  const { data, isLoading, refetch } = trpc.purchaseVsSales.getReport.useQuery(queryParams);

  const handleRefresh = () => {
    setQueryParams({ fromDate, toDate, search });
  };

  // Filter rows by search (client-side for instant feedback)
  const rows = useMemo(() => {
    if (!data?.rows) return [];
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter((r) => r.materialName.toLowerCase().includes(q));
  }, [data?.rows, search]);

  // Export CSV
  const handleExportCsv = () => {
    if (!rows.length) return;
    const headers = language === "ar"
      ? ["المادة", "الوحدة", "آخر سعر", "كمية المشتريات", "تكلفة المشتريات", "كمية الاستهلاك المتوقع", "تكلفة الاستهلاك المتوقع", "فرق الكمية", "فرق التكلفة", "فرق %"]
      : ["Material", "Unit", "Last Price", "Purchased Qty", "Purchased Cost", "Expected Qty", "Expected Cost", "Diff Qty", "Diff Cost", "Diff %"];

    const csvRows = rows.map((r) => [
      r.materialName,
      r.unit,
      r.lastPurchasePrice,
      r.purchasedQty,
      r.purchasedCost,
      r.expectedQty,
      r.expectedCost,
      r.diffQty,
      r.diffCost,
      r.diffPct !== null ? r.diffPct.toFixed(1) + "%" : "—",
    ]);

    const csv = [headers, ...csvRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-vs-sales-${queryParams.fromDate}-${queryParams.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isAr = language === "ar";

  // Determine diff badge style
  function getDiffBadge(diffCost: number, diffQty: number) {
    if (Math.abs(diffCost) < 1) {
      return { variant: "secondary" as const, icon: <Minus className="w-3 h-3" />, label: isAr ? "متوازن" : "Balanced", color: "text-gray-500" };
    }
    if (diffCost > 0) {
      return { variant: "destructive" as const, icon: <TrendingUp className="w-3 h-3" />, label: isAr ? "زيادة شراء" : "Over-purchased", color: "text-red-600" };
    }
    return { variant: "default" as const, icon: <TrendingDown className="w-3 h-3" />, label: isAr ? "نقص شراء" : "Under-purchased", color: "text-green-600" };
  }

  return (
    <div className="p-6 space-y-6" dir={isAr ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isAr ? "مقارنة المشتريات بالمبيعات" : "Purchases vs Sales Analysis"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAr
              ? "مقارنة ما تم شراؤه من الموردين بالاستهلاك المتوقع بناءً على المبيعات والوصفات"
              : "Compare what was purchased from suppliers vs expected consumption based on sales & recipes"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isAr ? "ml-2" : "mr-2"} ${isLoading ? "animate-spin" : ""}`} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!rows.length}>
            <Download className={`w-4 h-4 ${isAr ? "ml-2" : "mr-2"}`} />
            {isAr ? "تصدير CSV" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{isAr ? "من" : "From"}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-background text-foreground"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{isAr ? "إلى" : "To"}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-background text-foreground"
              />
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">{isAr ? "بحث" : "Search"}</label>
              <div className="relative">
                <Search className="absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" style={isAr ? { right: "10px" } : { left: "10px" }} />
                <Input
                  placeholder={isAr ? "اسم المادة..." : "Material name..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={isAr ? "pr-9" : "pl-9"}
                />
              </div>
            </div>
            <Button onClick={handleRefresh} disabled={isLoading}>
              {isAr ? "بحث" : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                {isAr ? "إجمالي تكلفة المشتريات" : "Total Purchased Cost"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-800 dark:text-blue-300">
                {formatCurrency(data.totalPurchasedCost)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                {isAr ? "إجمالي الاستهلاك المتوقع" : "Total Expected Consumption"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">
                {formatCurrency(data.totalExpectedCost)}
              </p>
            </CardContent>
          </Card>

          <Card className={`border-2 ${data.totalDiffCost > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/20" : data.totalDiffCost < 0 ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-gray-200 bg-gray-50 dark:bg-gray-950/20"}`}>
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm font-medium flex items-center gap-2 ${data.totalDiffCost > 0 ? "text-red-700 dark:text-red-400" : data.totalDiffCost < 0 ? "text-amber-700 dark:text-amber-400" : "text-gray-600"}`}>
                {data.totalDiffCost > 0 ? <AlertTriangle className="w-4 h-4" /> : data.totalDiffCost < 0 ? <Info className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                {isAr ? "الفرق (مشتريات - متوقع)" : "Difference (Purchased - Expected)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${data.totalDiffCost > 0 ? "text-red-800 dark:text-red-300" : data.totalDiffCost < 0 ? "text-amber-800 dark:text-amber-300" : "text-gray-700"}`}>
                {data.totalDiffCost >= 0 ? "+" : ""}{formatCurrency(data.totalDiffCost)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.totalDiffCost > 0
                  ? (isAr ? "اشتريت أكثر مما استهلكت" : "Purchased more than consumed")
                  : data.totalDiffCost < 0
                  ? (isAr ? "الاستهلاك أعلى من المشتريات" : "Consumption exceeds purchases")
                  : (isAr ? "متوازن" : "Balanced")}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info note */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 text-sm text-blue-800 dark:text-blue-300">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          {isAr
            ? "الاستهلاك المتوقع = مجموع (كمية المبيعات × كمية المادة في الوصفة). مثال: بعت 10 نص دجاج × 0.5 كجم دجاج = 5 كجم استهلاك متوقع."
            : "Expected consumption = SUM(sold qty × recipe ingredient qty). E.g. 10 half-chicken sold × 0.5kg = 5kg expected."}
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>
              {isAr ? "تفاصيل المقارنة" : "Comparison Details"}
              {rows.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground ms-2">
                  ({rows.length} {isAr ? "مادة" : "materials"})
                </span>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              {isAr ? "جاري التحميل..." : "Loading..."}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {isAr ? "لا توجد بيانات للفترة المحددة" : "No data for selected period"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-start font-medium">{isAr ? "المادة" : "Material"}</th>
                    <th className="px-4 py-3 text-center font-medium text-xs text-muted-foreground">{isAr ? "النوع" : "Type"}</th>
                    <th className="px-4 py-3 text-center font-medium">{isAr ? "الوحدة" : "Unit"}</th>
                    <th className="px-4 py-3 text-end font-medium text-blue-700">{isAr ? "كمية المشتريات" : "Purchased Qty"}</th>
                    <th className="px-4 py-3 text-end font-medium text-blue-700">{isAr ? "تكلفة المشتريات" : "Purchased Cost"}</th>
                    <th className="px-4 py-3 text-end font-medium text-emerald-700">{isAr ? "كمية الاستهلاك المتوقع" : "Expected Qty"}</th>
                    <th className="px-4 py-3 text-end font-medium text-emerald-700">{isAr ? "تكلفة الاستهلاك المتوقع" : "Expected Cost"}</th>
                    <th className="px-4 py-3 text-end font-medium">{isAr ? "فرق الكمية" : "Diff Qty"}</th>
                    <th className="px-4 py-3 text-end font-medium">{isAr ? "فرق التكلفة ↓" : "Diff Cost ↓"}</th>
                    <th className="px-4 py-3 text-center font-medium">{isAr ? "الحالة" : "Status"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const badge = getDiffBadge(row.diffCost, row.diffQty);
                    const isOver = row.diffCost > 1;
                    const isUnder = row.diffCost < -1;
                    return (
                      <tr
                        key={row.materialId}
                        className={`border-b transition-colors hover:bg-muted/30 ${
                          isOver ? "bg-red-50/30 dark:bg-red-950/10" : isUnder ? "bg-amber-50/30 dark:bg-amber-950/10" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-medium">{row.materialName}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            (row as any).materialType === 'semi_finished' 
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400' 
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                          }`}>
                            {(row as any).materialType === 'semi_finished' ? (isAr ? 'مصنّع' : 'Semi') : (isAr ? 'خام' : 'Raw')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{row.unit}</td>
                        <td className="px-4 py-3 text-end text-blue-700 dark:text-blue-400 font-mono">
                          {formatNum(row.purchasedQty, 3)}
                        </td>
                        <td className="px-4 py-3 text-end text-blue-700 dark:text-blue-400 font-mono">
                          {formatCurrency(row.purchasedCost)}
                        </td>
                        <td className="px-4 py-3 text-end text-emerald-700 dark:text-emerald-400 font-mono">
                          {row.expectedQty > 0 ? formatNum(row.expectedQty, 3) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-end text-emerald-700 dark:text-emerald-400 font-mono">
                          {row.expectedCost > 0 ? formatCurrency(row.expectedCost) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className={`px-4 py-3 text-end font-mono font-semibold ${isOver ? "text-red-600" : isUnder ? "text-amber-600" : "text-gray-500"}`}>
                          {row.diffQty >= 0 ? "+" : ""}{formatNum(row.diffQty, 3)}
                        </td>
                        <td className={`px-4 py-3 text-end font-mono font-bold ${isOver ? "text-red-600" : isUnder ? "text-amber-600" : "text-gray-500"}`}>
                          {row.diffCost >= 0 ? "+" : ""}{formatCurrency(row.diffCost)}
                          {row.diffPct !== null && (
                            <span className="block text-xs font-normal opacity-70">
                              {row.diffPct >= 0 ? "+" : ""}{row.diffPct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={badge.variant} className="text-xs flex items-center gap-1 w-fit mx-auto">
                            {badge.icon}
                            {badge.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/50 font-bold">
                    <td className="px-4 py-3" colSpan={2}>{isAr ? "الإجمالي" : "Total"}</td>
                    <td className="px-4 py-3 text-end text-blue-700 font-mono">—</td>
                    <td className="px-4 py-3 text-end text-blue-700 font-mono">
                      {data ? formatCurrency(data.totalPurchasedCost) : "—"}
                    </td>
                    <td className="px-4 py-3 text-end text-emerald-700 font-mono">—</td>
                    <td className="px-4 py-3 text-end text-emerald-700 font-mono">
                      {data ? formatCurrency(data.totalExpectedCost) : "—"}
                    </td>
                    <td className="px-4 py-3 text-end font-mono">—</td>
                    <td className={`px-4 py-3 text-end font-mono ${data && data.totalDiffCost > 0 ? "text-red-600" : data && data.totalDiffCost < 0 ? "text-amber-600" : "text-gray-500"}`}>
                      {data ? `${data.totalDiffCost >= 0 ? "+" : ""}${formatCurrency(data.totalDiffCost)}` : "—"}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
