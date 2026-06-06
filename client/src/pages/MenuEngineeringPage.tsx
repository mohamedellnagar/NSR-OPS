import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { BarChart3, Star, Download, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import * as XLSX from "xlsx";

function fmt(n: number, d = 2) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const CATEGORIES = {
  star:       { emoji: "⭐", label: "نجوم", labelEn: "Stars",      color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  plowhorse:  { emoji: "🐴", label: "ثيران", labelEn: "Plowhorses", color: "bg-blue-100 text-blue-800 border-blue-300" },
  puzzle:     { emoji: "🔮", label: "ألغاز", labelEn: "Puzzles",    color: "bg-amber-100 text-amber-800 border-amber-300" },
  dog:        { emoji: "🐕", label: "كلاب",  labelEn: "Dogs",       color: "bg-red-100 text-red-800 border-red-300" },
  uncategorized: { emoji: "❓", label: "غير مصنف", labelEn: "N/A",  color: "bg-gray-100 text-gray-600 border-gray-200" },
};

function getLast30Days() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

export default function MenuEngineeringPage() {
  const { isRTL } = useLanguage();
  const defaults = getLast30Days();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [selectedCat, setSelectedCat] = useState<string>("all");

  const { data, isLoading, refetch } = trpc.menuEngineering.analyze.useQuery(
    { fromDate, toDate },
    { enabled: true }
  );

  const rows = data?.rows ?? [];
  const filtered = selectedCat === "all" ? rows : rows.filter((r: any) => r.category === selectedCat);

  const exportExcel = () => {
    if (!rows.length) return;
    const wsData = [
      ["المنتج", "الفئة", "الكمية المباعة", "الإيراد", "تكلفة الوصفة", "Food Cost %", "هامش الربح", "التصنيف", "التوصية"],
      ...rows.map((r: any) => [
        r.productNameAr || r.productName,
        r.categoryReference || "",
        r.totalQtySold,
        r.totalRevenue,
        r.recipeCost,
        r.foodCostPct,
        r.contributionMargin,
        CATEGORIES[r.category as keyof typeof CATEGORIES]?.label || r.category,
        r.suggestion,
      ]),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, "Menu Engineering");
    XLSX.writeFile(wb, `menu-engineering-${fromDate}-${toDate}.xlsx`);
  };

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">هندسة القائمة</h1>
            <p className="text-sm text-muted-foreground">تحليل ربحية وشعبية المنتجات</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
          <span className="text-muted-foreground text-sm">→</span>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
          <Button onClick={() => refetch()} disabled={isLoading} size="sm">
            {isLoading ? "جاري التحليل..." : "تحليل"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!rows.length}>
            <Download className="w-4 h-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      {data && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(["star", "puzzle", "plowhorse", "dog"] as const).map(cat => {
              const cfg = CATEGORIES[cat];
              const count = data[`${cat}Count` as keyof typeof data] as number ?? 0;
              return (
                <Card key={cat} className={`border-2 cursor-pointer transition-all ${selectedCat === cat ? "ring-2 ring-offset-1 ring-primary scale-[1.02]" : ""}`}
                  onClick={() => setSelectedCat(prev => prev === cat ? "all" : cat)}>
                  <CardContent className="pt-5 pb-4 text-center">
                    <div className="text-4xl mb-1">{cfg.emoji}</div>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm font-medium">{cfg.label}</div>
                    <Badge className={`mt-2 text-xs ${cfg.color} border`}>{cfg.labelEn}</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Matrix Visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">مصفوفة هندسة القائمة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative border-2 border-border rounded-xl overflow-hidden" style={{ minHeight: 280 }}>
                {/* Axis labels */}
                <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 text-xs pointer-events-none">
                  {/* Stars: top-left (high profit, high pop) */}
                  <div className="bg-emerald-50/60 border-b border-r border-border p-4 flex flex-col">
                    <div className="text-emerald-700 font-bold text-lg">⭐ نجوم</div>
                    <div className="text-muted-foreground mt-1">ربحية عالية + مبيعات عالية</div>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {rows.filter((r: any) => r.category === "star").slice(0, 5).map((r: any) => (
                        <Badge key={r.productId} variant="outline" className="text-xs bg-white">{r.productNameAr || r.productName}</Badge>
                      ))}
                      {rows.filter((r: any) => r.category === "star").length > 5 && (
                        <Badge variant="outline" className="text-xs">+{rows.filter((r: any) => r.category === "star").length - 5}</Badge>
                      )}
                    </div>
                  </div>
                  {/* Puzzles: top-right (high profit, low pop) */}
                  <div className="bg-amber-50/60 border-b border-border p-4 flex flex-col">
                    <div className="text-amber-700 font-bold text-lg">🔮 ألغاز</div>
                    <div className="text-muted-foreground mt-1">ربحية عالية + مبيعات منخفضة</div>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {rows.filter((r: any) => r.category === "puzzle").slice(0, 5).map((r: any) => (
                        <Badge key={r.productId} variant="outline" className="text-xs bg-white">{r.productNameAr || r.productName}</Badge>
                      ))}
                    </div>
                  </div>
                  {/* Plowhorses: bottom-left (low profit, high pop) */}
                  <div className="bg-blue-50/60 border-r border-border p-4 flex flex-col">
                    <div className="text-blue-700 font-bold text-lg">🐴 ثيران</div>
                    <div className="text-muted-foreground mt-1">ربحية منخفضة + مبيعات عالية</div>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {rows.filter((r: any) => r.category === "plowhorse").slice(0, 5).map((r: any) => (
                        <Badge key={r.productId} variant="outline" className="text-xs bg-white">{r.productNameAr || r.productName}</Badge>
                      ))}
                    </div>
                  </div>
                  {/* Dogs: bottom-right (low profit, low pop) */}
                  <div className="bg-red-50/60 p-4 flex flex-col">
                    <div className="text-red-700 font-bold text-lg">🐕 كلاب</div>
                    <div className="text-muted-foreground mt-1">ربحية منخفضة + مبيعات منخفضة</div>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {rows.filter((r: any) => r.category === "dog").slice(0, 5).map((r: any) => (
                        <Badge key={r.productId} variant="outline" className="text-xs bg-white">{r.productNameAr || r.productName}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Axis indicators */}
                <div className="absolute bottom-2 left-0 right-0 flex justify-between px-4 text-[10px] text-muted-foreground pointer-events-none">
                  <span>← مبيعات عالية</span>
                  <span>مبيعات منخفضة →</span>
                </div>
                <div className="absolute top-0 bottom-0 right-2 flex flex-col justify-between py-4 text-[10px] text-muted-foreground pointer-events-none">
                  <span>ربحية عالية ↑</span>
                  <span>ربحية منخفضة ↓</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">تفاصيل كل المنتجات ({filtered.length})</CardTitle>
                <div className="flex gap-1 flex-wrap">
                  {(["all", "star", "plowhorse", "puzzle", "dog"] as const).map(cat => (
                    <Button key={cat} size="sm" variant={selectedCat === cat ? "default" : "outline"}
                      onClick={() => setSelectedCat(cat)} className="text-xs">
                      {cat === "all" ? "الكل" : `${CATEGORIES[cat].emoji} ${CATEGORIES[cat].label}`}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium">المنتج</th>
                      <th className="px-4 py-3 text-center font-medium">الكمية</th>
                      <th className="px-4 py-3 text-center font-medium">الإيراد</th>
                      <th className="px-4 py-3 text-center font-medium">Food Cost</th>
                      <th className="px-4 py-3 text-center font-medium">هامش الربح</th>
                      <th className="px-4 py-3 text-center font-medium">التصنيف</th>
                      <th className="px-4 py-3 text-right font-medium">التوصية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any) => {
                      const cfg = CATEGORIES[r.category as keyof typeof CATEGORIES];
                      return (
                        <tr key={r.productId} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium">{r.productNameAr || r.productName}</div>
                            {r.categoryReference && <div className="text-xs text-muted-foreground">{r.categoryReference}</div>}
                          </td>
                          <td className="px-4 py-3 text-center font-mono">{r.totalQtySold.toFixed(0)}</td>
                          <td className="px-4 py-3 text-center">{fmt(r.totalRevenue)} AED</td>
                          <td className="px-4 py-3 text-center">
                            <span className={r.foodCostPct > 40 ? "text-red-600 font-bold" : r.foodCostPct > 30 ? "text-amber-600" : "text-emerald-600"}>
                              {fmt(r.foodCostPct, 1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">{fmt(r.contributionMargin)} AED</td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`${cfg.color} border text-xs`}>
                              {cfg.emoji} {cfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">{r.suggestion}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!filtered.length && (
                  <div className="py-16 text-center text-muted-foreground">
                    لا توجد بيانات مبيعات في هذه الفترة. ارفع تقارير المبيعات أولاً.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
