import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Flame, TrendingDown, Package, AlertTriangle } from "lucide-react";

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function getWasteColor(pct: number): { badge: string; bar: string; text: string } {
  if (pct <= 0) return { badge: "bg-gray-100 text-gray-600", bar: "bg-gray-300", text: "text-gray-500" };
  if (pct < 5) return { badge: "bg-green-100 text-green-700", bar: "bg-green-500", text: "text-green-700" };
  if (pct < 15) return { badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-500", text: "text-yellow-700" };
  return { badge: "bg-red-100 text-red-700", bar: "bg-red-500", text: "text-red-700" };
}

export default function WasteReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = trpc.reports.monthlyWaste.useQuery({ year, month });

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-100">
              <Flame className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">تقرير الهدر الشهري</h1>
              <p className="text-sm text-muted-foreground">نسبة الهدر لكل مادة من إجمالي السحب</p>
            </div>
          </div>
          {/* Month / Year selectors */}
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_AR.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm bg-orange-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground">إجمالي الهدر</span>
                </div>
                <p className="text-2xl font-bold text-orange-600">
                  {data.summary.totalWasteQty.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">وحدة</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground">إجمالي السحب</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">
                  {data.summary.totalWithdrawnQty.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">وحدة</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-purple-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-muted-foreground">متوسط نسبة الهدر</span>
                </div>
                <p className={`text-2xl font-bold ${getWasteColor(data.summary.avgWastePct).text}`}>
                  {data.summary.avgWastePct.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">من إجمالي السحب</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">أعلى هدر</span>
                </div>
                <p className="text-base font-bold text-red-600 truncate">
                  {data.summary.topWastedMaterial ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">المادة الأكثر هدراً</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              تفاصيل الهدر — {MONTHS_AR[month - 1]} {year}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span className="text-sm">جاري التحميل...</span>
                </div>
              </div>
            ) : !data || data.rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Flame className="h-10 w-10 opacity-20" />
                <p className="text-sm">لا توجد بيانات هدر لهذا الشهر</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">#</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">المادة</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">إجمالي السحب</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">إجمالي الهدر</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">نسبة الهدر</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">الوحدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, idx) => {
                      const colors = getWasteColor(row.wastePct);
                      return (
                        <tr key={row.materialId} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium">
                            {row.materialNameAr || row.materialName}
                          </td>
                          <td className="px-4 py-3 text-blue-700 font-medium">
                            {row.totalWithdrawn.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-medium ${row.totalWaste > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                              {row.totalWaste.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[60px]">
                                <div
                                  className={`h-2 rounded-full transition-all ${colors.bar}`}
                                  style={{ width: `${Math.min(row.wastePct, 100).toFixed(1)}%` }}
                                />
                              </div>
                              <Badge className={`text-xs px-2 py-0.5 rounded-full border-0 ${colors.badge}`}>
                                {row.wastePct.toFixed(1)}%
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.unit}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium">مفتاح الألوان:</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500" /> أقل من 5% (ممتاز)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-500" /> 5% – 15% (مقبول)</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" /> أكثر من 15% (مرتفع)</span>
        </div>
    </div>
  );
}
