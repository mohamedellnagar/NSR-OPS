import { useLanguage } from "@/contexts/LanguageContext";
import { Pagination, usePagination } from "@/components/Pagination";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Download, BarChart3, TrendingUp, TrendingDown, Truck, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export default function ReportsPage() {
  const { t, isRTL, language } = useLanguage();
  const [suppliersReportPage, setSuppliersReportPage] = useState(1);
  const [movementDates, setMovementDates] = useState({
    dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    dateTo: new Date().toISOString().slice(0, 10),
  });

  const { data: valuationRaw, isLoading: vLoading } = trpc.reports.inventoryValuation.useQuery();
  const movementQueryInput = useMemo(() => ({
    dateFrom: new Date(movementDates.dateFrom),
    dateTo: new Date(movementDates.dateTo),
  }), [movementDates.dateFrom, movementDates.dateTo]);
  const { data: movementRaw, isLoading: mLoading } = trpc.reports.stockMovement.useQuery(movementQueryInput);
  const { data: suppliersRaw, isLoading: sLoading } = trpc.reports.supplierPerformance.useQuery();

  // Compute derived stats from raw data
  const valuationItems: any[] = (valuationRaw as any)?.items || [];
  const valuation = {
    items: valuationItems,
    totalValue: (valuationRaw as any)?.totalValue || 0,
    totalItems: valuationItems.length,
    activeItems: valuationItems.filter((i: any) => i.currentQuantity > 0).length,
    noPriceItems: valuationItems.filter((i: any) => !i.averageCost || Number(i.averageCost) === 0).length,
    byCategory: Object.values(
      valuationItems.reduce((acc: any, item: any) => {
        const key = item.categoryName || (language === "ar" ? "غير مصنف" : "Uncategorized");
        if (!acc[key]) acc[key] = { categoryName: key, totalValue: 0 };
        acc[key].totalValue += item.totalValue || 0;
        return acc;
      }, {})
    ),
  };

  const movementTxs: any[] = (movementRaw as any)?.transactions || [];
  const movement = {
    byMaterial: movementTxs,
    totalIn: (movementRaw as any)?.totalIn || 0,
    totalOut: (movementRaw as any)?.totalOut || 0,
    totalInValue: movementTxs.reduce((s: number, r: any) => s + Number(r.totalAmount || 0), 0),
    transactionCount: movementTxs.length,
  };

  const suppliersAll = ((suppliersRaw as any) || []).map((s: any) => ({
    ...s,
    totalValue: Number(s.totalValue || 0),
  }));
  const suppliersPagination = usePagination(suppliersAll, 15);
  const suppliers = suppliersPagination.paginate(suppliersReportPage);


  const formatCurrency = (val: number | string | null | undefined) => {
    if (!val) return `0 ${language === "ar" ? "د.إ" : "AED"}`;
    return `${new Intl.NumberFormat(language === "ar" ? "ar-AE" : "en-AE", {
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(Number(val))} ${language === "ar" ? "د.إ" : "AED"}`;
  };

  const PIE_COLORS = [
    "oklch(0.55 0.18 260)", "oklch(0.60 0.18 150)", "oklch(0.65 0.18 60)",
    "oklch(0.55 0.22 25)", "oklch(0.60 0.15 300)", "oklch(0.65 0.18 200)",
  ];

  const exportValuation = () => {
    if (!valuation?.items?.length) return;
    const headers = ["Code", "Name", "Category", "Unit", "Quantity", "Unit Price", "Total Value"];
    const rows = valuation.items.map((i: any) => [
      i.code, i.name, i.category?.name || "", i.unit,
      Number(i.currentQuantity), Number(i.lastPurchasePrice || 0), Number(i.totalValue || 0),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_valuation_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className={isRTL ? "text-right" : ""}>
        <h1 className="text-2xl font-bold text-foreground">{t("reports")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{language === "ar" ? "تقارير شاملة لمخزونك" : "Comprehensive inventory reports"}</p>
      </div>

      <Tabs defaultValue="valuation" dir={isRTL ? "rtl" : "ltr"}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="valuation" className="gap-2">
            <DollarSign size={14} />
            {t("inventoryValuation")}
          </TabsTrigger>
          <TabsTrigger value="movement" className="gap-2">
            <BarChart3 size={14} />
            {t("stockMovement")}
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2">
            <Truck size={14} />
            {t("supplierPerformance")}
          </TabsTrigger>
        </TabsList>

        {/* ─── Inventory Valuation ─── */}
        <TabsContent value="valuation" className="space-y-4 mt-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: language === "ar" ? "إجمالي القيمة" : "Total Value", value: formatCurrency(valuation?.totalValue), icon: <DollarSign size={18} />, color: "text-emerald-600 bg-emerald-50" },
              { label: language === "ar" ? "عدد المواد" : "Total Items", value: valuation?.totalItems ?? 0, icon: <BarChart3 size={18} />, color: "text-blue-600 bg-blue-50" },
              { label: language === "ar" ? "مواد نشطة" : "Active Items", value: valuation?.activeItems ?? 0, icon: <TrendingUp size={18} />, color: "text-purple-600 bg-purple-50" },
              { label: language === "ar" ? "مواد بدون سعر" : "No Price Set", value: valuation?.noPriceItems ?? 0, icon: <TrendingDown size={18} />, color: "text-amber-600 bg-amber-50" },
            ].map((c, i) => (
              <Card key={i}>
                <CardContent className="pt-4 pb-4">
                  <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.color}`}>{c.icon}</div>
                    <div className={isRTL ? "text-right" : ""}>
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <p className="text-lg font-bold number-display">{c.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Chart + Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart by Category */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{language === "ar" ? "القيمة حسب التصنيف" : "Value by Category"}</CardTitle>
              </CardHeader>
              <CardContent>
                {vLoading ? (
                  <div className="h-48 bg-muted rounded animate-pulse" />
                ) : valuation?.byCategory?.length ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={valuation.byCategory} dataKey="totalValue" nameKey="categoryName" cx="50%" cy="50%" outerRadius={80} strokeWidth={0}>
                        {valuation.byCategory.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">{t("noData")}</div>
                )}
              </CardContent>
            </Card>

            {/* Top 10 by Value */}
            <Card>
              <CardHeader className="pb-2">
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <CardTitle className="text-sm">{language === "ar" ? "أعلى 10 مواد بالقيمة" : "Top 10 by Value"}</CardTitle>
                  <Button variant="outline" size="sm" onClick={exportValuation} className="gap-1 h-7 text-xs">
                    <Download size={12} />
                    {t("exportCSV")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {vLoading ? (
                    [...Array(5)].map((_, i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)
                  ) : (
                    valuation?.items?.slice(0, 10).map((item: any, i: number) => (
                      <div key={item.id} className={`flex items-center gap-2 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold flex-shrink-0">{i + 1}</span>
                        <span className="flex-1 truncate font-medium">{isRTL && item.nameAr ? item.nameAr : item.name}</span>
                        <span className="font-semibold number-display text-primary">{formatCurrency(item.totalValue)}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── Stock Movement ─── */}
        <TabsContent value="movement" className="space-y-4 mt-4">
          {/* Date Range */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className={`flex flex-wrap gap-4 items-end ${isRTL ? "flex-row-reverse" : ""}`}>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">{t("from")}</Label>
                  <Input
                    type="date"
                    className="h-9 w-40"
                    value={movementDates.dateFrom}
                    onChange={(e) => setMovementDates((d) => ({ ...d, dateFrom: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">{t("to")}</Label>
                  <Input
                    type="date"
                    className="h-9 w-40"
                    value={movementDates.dateTo}
                    onChange={(e) => setMovementDates((d) => ({ ...d, dateTo: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: language === "ar" ? "إجمالي الوارد" : "Total IN", value: movement?.totalIn ?? 0, color: "text-emerald-600 bg-emerald-50" },
              { label: language === "ar" ? "إجمالي الصادر" : "Total OUT", value: movement?.totalOut ?? 0, color: "text-red-600 bg-red-50" },
              { label: language === "ar" ? "قيمة الوارد" : "IN Value", value: formatCurrency(movement?.totalInValue), color: "text-blue-600 bg-blue-50" },
              { label: language === "ar" ? "عدد المعاملات" : "Transactions", value: movement?.transactionCount ?? 0, color: "text-purple-600 bg-purple-50" },
            ].map((c, i) => (
              <Card key={i}>
                <CardContent className="pt-4 pb-4">
                  <p className={`text-xs text-muted-foreground mb-1 ${isRTL ? "text-right" : ""}`}>{c.label}</p>
                  <p className={`text-xl font-bold number-display ${c.color.split(" ")[0]} ${isRTL ? "text-right" : ""}`}>{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Bar Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{language === "ar" ? "حركة المخزون حسب المادة" : "Stock Movement by Material"}</CardTitle>
            </CardHeader>
            <CardContent>
              {mLoading ? (
                <div className="h-64 bg-muted rounded animate-pulse" />
              ) : movement?.byMaterial?.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={movement.byMaterial.slice(0, 10)} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey={isRTL ? "nameAr" : "name"} tick={{ fontSize: 11 }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="totalIn" name={language === "ar" ? "وارد" : "IN"} fill="oklch(0.55 0.18 150)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="totalOut" name={language === "ar" ? "صادر" : "OUT"} fill="oklch(0.55 0.22 25)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">{t("noData")}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Supplier Performance ─── */}
        <TabsContent value="suppliers" className="space-y-4 mt-4">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      language === "ar" ? "المورد" : "Supplier",
                      language === "ar" ? "عدد الطلبات" : "Orders",
                      language === "ar" ? "إجمالي الكمية" : "Total Qty",
                      language === "ar" ? "إجمالي القيمة" : "Total Value",
                      language === "ar" ? "آخر طلب" : "Last Order",
                    ].map((h) => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border ${isRTL ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sLoading ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={i}>
                        {[...Array(5)].map((_, j) => (
                          <td key={j} className="px-4 py-3 border-b border-border/50">
                            <div className="h-4 bg-muted rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : suppliers?.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                        <Truck size={32} className="mx-auto mb-2 opacity-30" />
                        <p>{t("noData")}</p>
                      </td>
                    </tr>
                  ) : (
                    (suppliers as any[]).map((s: any) => (
                      <tr key={s.supplierId || s.supplierName} className="hover:bg-muted/30 transition-colors">
                        <td className={`px-4 py-3 border-b border-border/50 font-medium ${isRTL ? "text-right" : ""}`}>
                          <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                              <Truck size={13} />
                            </div>
                            {s.supplierName || (language === "ar" ? "غير محدد" : "Unknown")}
                          </div>
                        </td>
                        <td className={`px-4 py-3 border-b border-border/50 number-display ${isRTL ? "text-right" : ""}`}>{s.orderCount}</td>
                        <td className={`px-4 py-3 border-b border-border/50 number-display ${isRTL ? "text-right" : ""}`}>{Number(s.totalQuantity).toLocaleString()}</td>
                        <td className={`px-4 py-3 border-b border-border/50 font-semibold number-display ${isRTL ? "text-right" : ""}`}>{formatCurrency(s.totalValue)}</td>
                        <td className={`px-4 py-3 border-b border-border/50 text-xs text-muted-foreground ${isRTL ? "text-right" : ""}`}>
                          {s.lastOrderDate
                            ? new Date(s.lastOrderDate).toLocaleDateString(language === "ar" ? "ar-SA" : "en-US")
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-border">
              <Pagination currentPage={suppliersReportPage} totalPages={suppliersPagination.totalPages} onPageChange={setSuppliersReportPage} totalItems={suppliersPagination.totalItems} pageSize={15} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
