import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  TrendingDown, AlertTriangle, CheckCircle2, Clock, ShoppingCart,
  Download, Zap, Search, Filter,
} from "lucide-react";
import * as XLSX from "xlsx";

function fmt(n: number, d = 3) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const URGENCY_CONFIG = {
  critical: { label: "حرج",     labelEn: "Critical", color: "text-red-700",    bg: "bg-red-100",    border: "border-red-300",    icon: AlertTriangle, dot: "bg-red-500" },
  warning:  { label: "تحذير",   labelEn: "Warning",  color: "text-amber-700",  bg: "bg-amber-100",  border: "border-amber-300",  icon: Clock,         dot: "bg-amber-500" },
  ok:       { label: "جيد",     labelEn: "OK",       color: "text-emerald-700",bg: "bg-emerald-100",border: "border-emerald-300",icon: CheckCircle2,  dot: "bg-emerald-500" },
  surplus:  { label: "فائض",    labelEn: "Surplus",  color: "text-blue-700",   bg: "bg-blue-100",   border: "border-blue-300",   icon: TrendingDown,  dot: "bg-blue-400" },
  no_data:  { label: "لا بيانات",labelEn: "No Data", color: "text-gray-500",   bg: "bg-gray-50",    border: "border-gray-200",   icon: Filter,        dot: "bg-gray-300" },
};

export default function InventoryForecastPage() {
  const { isRTL } = useLanguage();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [coverDays, setCoverDays] = useState(14);
  const [showOrderSheet, setShowOrderSheet] = useState(false);

  const { data: items = [], isLoading } = trpc.inventoryIntelligence.daysOfStock.useQuery();
  const { data: orderSheet, isFetching: loadingOrder } = trpc.inventoryIntelligence.smartOrderSheet.useQuery(
    { coverDays },
    { enabled: showOrderSheet }
  );

  const filtered = useMemo(() => {
    return (items as any[]).filter((item: any) => {
      const matchFilter = filter === "all" || item.urgency === filter;
      const matchSearch = !search || [item.materialName, item.materialNameAr].some(n => n?.toLowerCase().includes(search.toLowerCase()));
      return matchFilter && matchSearch;
    });
  }, [items, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, critical: 0, warning: 0, ok: 0, surplus: 0, no_data: 0 };
    for (const i of items as any[]) { c.all++; c[i.urgency] = (c[i.urgency] || 0) + 1; }
    return c;
  }, [items]);

  const exportExcel = () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["المادة", "الوحدة", "المتوفر", "متوسط الاستهلاك/يوم", "أيام الكفاية", "الحالة", "المورد", "آخر سعر"],
      ...(items as any[]).map((i: any) => [
        i.materialNameAr || i.materialName,
        i.unit,
        i.currentQuantity,
        i.avgDailyConsumption.toFixed(3),
        i.daysOfStock ?? "لا بيانات",
        URGENCY_CONFIG[i.urgency as keyof typeof URGENCY_CONFIG]?.label,
        i.lastSupplierName || "",
        i.lastPurchasePrice ?? "",
      ]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "أيام الكفاية");
    XLSX.writeFile(wb, `inventory-forecast-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportOrderSheet = () => {
    if (!orderSheet) return;
    const rows: any[][] = [["المادة", "الوحدة", "المتوفر", "أيام الكفاية", "الكمية المقترحة", "التكلفة المقدرة", "المورد", "آخر سعر"]];
    for (const item of orderSheet.items as any[]) {
      rows.push([
        item.materialNameAr || item.materialName,
        item.unit,
        item.currentQuantity,
        item.daysOfStock ?? "—",
        item.suggestedOrderQty,
        item.estimatedCost ?? "—",
        item.lastSupplierName || "—",
        item.lastPurchasePrice ?? "—",
      ]);
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `طلب ${coverDays} يوم`);
    XLSX.writeFile(wb, `smart-order-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">تنبؤ المخزون</h1>
            <p className="text-sm text-muted-foreground">أيام الكفاية لكل مادة بناءً على متوسط الاستهلاك (30 يوماً)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!items.length}>
            <Download className="w-4 h-4 ml-1" /> Excel
          </Button>
          <Button
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700"
            onClick={() => setShowOrderSheet(v => !v)}
          >
            <Zap className="w-4 h-4 ml-1" />
            {showOrderSheet ? "إخفاء ورقة الطلب" : "ورقة الطلب الذكية"}
          </Button>
        </div>
      </div>

      {/* Urgency KPI pills */}
      <div className="flex flex-wrap gap-2">
        {(["all", "critical", "warning", "ok", "surplus", "no_data"] as const).map(u => {
          const cfg = u === "all" ? null : URGENCY_CONFIG[u];
          return (
            <button key={u}
              onClick={() => setFilter(u)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                filter === u ? "ring-2 ring-offset-1 ring-cyan-500 " : ""
              }${cfg ? `${cfg.bg} ${cfg.color} ${cfg.border}` : "bg-muted text-foreground border-border"}`}>
              {cfg && <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />}
              {u === "all" ? "الكل" : cfg!.label}
              <span className="font-bold">{counts[u] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="ابحث عن مادة..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
      </div>

      {/* Smart Order Sheet */}
      {showOrderSheet && (
        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-cyan-600" />
                ورقة الطلب الذكية
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">تغطية</span>
                <Input type="number" min={1} max={90} value={coverDays}
                  onChange={e => setCoverDays(parseInt(e.target.value) || 14)}
                  className="w-20 h-8 text-center" />
                <span className="text-sm text-muted-foreground">يوم</span>
                <Button size="sm" variant="outline" onClick={exportOrderSheet} disabled={!orderSheet?.items.length}>
                  <Download className="w-3.5 h-3.5 ml-1" /> تصدير
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingOrder ? (
              <div className="py-8 text-center text-muted-foreground text-sm">جاري الحساب...</div>
            ) : !orderSheet?.items.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">✅ جميع المواد مكتفية لـ {coverDays} يوماً</div>
            ) : (
              <>
                <div className="px-4 py-2 bg-cyan-100/60 border-b border-cyan-200 text-sm flex items-center gap-4 flex-wrap">
                  <span className="font-semibold">{orderSheet.items.length} صنف يحتاج طلب</span>
                  {orderSheet.totalEstimatedCost > 0 && (
                    <span className="text-cyan-700 font-bold">التكلفة التقديرية: {fmt(orderSheet.totalEstimatedCost, 2)} AED</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-4 py-2 text-right">المادة</th>
                        <th className="px-4 py-2 text-center">المتوفر</th>
                        <th className="px-4 py-2 text-center">أيام الكفاية</th>
                        <th className="px-4 py-2 text-center">الكمية المقترحة</th>
                        <th className="px-4 py-2 text-center">التكلفة</th>
                        <th className="px-4 py-2 text-center">المورد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orderSheet.items as any[]).map((item: any) => {
                        const urg = URGENCY_CONFIG[item.urgency as keyof typeof URGENCY_CONFIG];
                        return (
                          <tr key={item.materialId} className="border-b hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${urg.dot}`} />
                                {item.materialNameAr || item.materialName}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center text-muted-foreground">{fmt(item.currentQuantity)} {item.unit}</td>
                            <td className="px-4 py-2.5 text-center">
                              {item.daysOfStock !== null
                                ? <span className={urg.color + " font-bold"}>{item.daysOfStock} يوم</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center font-bold text-cyan-700">{fmt(item.suggestedOrderQty)} {item.unit}</td>
                            <td className="px-4 py-2.5 text-center">{item.estimatedCost ? `${fmt(item.estimatedCost, 2)} AED` : "—"}</td>
                            <td className="px-4 py-2.5 text-center text-muted-foreground text-xs">{item.lastSupplierName || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">المادة</th>
                    <th className="px-4 py-3 text-center font-medium">المتوفر</th>
                    <th className="px-4 py-3 text-center font-medium">استهلاك/يوم</th>
                    <th className="px-4 py-3 text-center font-medium">أيام الكفاية</th>
                    <th className="px-4 py-3 text-center font-medium">شريط الكفاية</th>
                    <th className="px-4 py-3 text-center font-medium">الحالة</th>
                    <th className="px-4 py-3 text-center font-medium">المورد</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item: any) => {
                    const urg = URGENCY_CONFIG[item.urgency as keyof typeof URGENCY_CONFIG];
                    const barPct = item.daysOfStock !== null
                      ? Math.min(100, (item.daysOfStock / 30) * 100)
                      : 0;
                    const barColor = item.urgency === "critical" ? "bg-red-500" :
                                     item.urgency === "warning" ? "bg-amber-400" :
                                     item.urgency === "surplus" ? "bg-blue-400" : "bg-emerald-500";
                    return (
                      <tr key={item.materialId} className={`border-b hover:bg-muted/20 transition-colors ${item.urgency === "critical" ? "bg-red-50/30" : item.urgency === "warning" ? "bg-amber-50/30" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.materialNameAr || item.materialName}</div>
                          {item.categoryName && <div className="text-xs text-muted-foreground">{item.categoryName}</div>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{fmt(item.currentQuantity)} {item.unit}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground text-xs">
                          {item.avgDailyConsumption > 0 ? `${fmt(item.avgDailyConsumption)} ${item.unit}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.daysOfStock !== null
                            ? <span className={`font-bold text-lg ${urg.color}`}>{item.daysOfStock}</span>
                            : <span className="text-muted-foreground text-xs">لا بيانات</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-full bg-muted rounded-full h-2 min-w-[80px]">
                            <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />
                          </div>
                          {item.daysOfStock !== null && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 text-center">{Math.round(barPct)}% من 30 يوم</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={`${urg.bg} ${urg.color} ${urg.border} border text-xs`}>
                            {urg.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                          {item.lastSupplierName || "—"}
                          {item.lastPurchasePrice && <div className="font-mono">{fmt(item.lastPurchasePrice, 2)} AED</div>}
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-muted-foreground">لا توجد نتائج</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
