import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  Calendar,
  Download,
  TrendingDown,
  Package,
  DollarSign,
  ChevronDown,
  ChevronRight,
  ClipboardList,
} from "lucide-react";

function fmt(n: number, dec = 3) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
function fmtCost(n: number) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function KitchenConsumptionReportPage() {
  const { isRTL } = useLanguage();

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);

  const [fromDate, setFromDate] = useState(weekAgo.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
  const [queryDates, setQueryDates] = useState({ from: weekAgo.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) });
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"summary" | "daily">("summary");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, error } = trpc.kitchenConsumption.report.useQuery({
    fromDate: queryDates.from,
    toDate: queryDates.to,
  });

  const handleSearch = () => {
    if (fromDate > toDate) return;
    setQueryDates({ from: fromDate, to: toDate });
  };

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const f = start.toISOString().slice(0, 10);
    const t = end.toISOString().slice(0, 10);
    setFromDate(f);
    setToDate(t);
    setQueryDates({ from: f, to: t });
  };

  const filteredMaterials = useMemo(() => {
    if (!data?.materials) return [];
    if (!searchTerm.trim()) return data.materials;
    const q = searchTerm.toLowerCase();
    return data.materials.filter(m => m.materialName.toLowerCase().includes(q));
  }, [data?.materials, searchTerm]);

  // Group daily breakdown by date
  type DayRow = NonNullable<typeof data>["dailyBreakdown"][number];
  const dailyByDate = useMemo(() => {
    const map = new Map<string, DayRow[]>();
    if (!data?.dailyBreakdown) return map;
    for (const row of data.dailyBreakdown) {
      if (!map.has(row.date)) map.set(row.date, []);
      map.get(row.date)!.push(row);
    }
    return map;
  }, [data?.dailyBreakdown]);

  const toggleDay = (date: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  // Export to CSV
  const exportCSV = () => {
    if (!data?.materials) return;
    const rows = [
      ["المادة الخام", "الوحدة", "إجمالي الكمية", "سعر الوحدة", "إجمالي التكلفة", "المصدر"],
      ...data.materials.map(m => [
        m.materialName,
        m.unit,
        fmt(m.totalQty),
        fmtCost(m.unitCost),
        fmtCost(m.totalCost),
        m.source === "inventory" ? "جرد" : m.source === "production" ? "إنتاج/سحب" : "مختلط",
      ]),
      [],
      ["الإجمالي", "", "", "", fmtCost(data.totalCost), ""],
    ];
    const csv = "\uFEFF" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kitchen-consumption-${queryDates.from}-to-${queryDates.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sourceLabel = (source: string) => {
    if (source === "inventory") return { label: "جرد", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
    if (source === "production") return { label: "إنتاج", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
    return { label: "مختلط", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" };
  };

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <Activity size={20} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">تقرير استهلاك المطبخ</h1>
            <p className="text-sm text-muted-foreground">المواد الخام المستهلكة من الجرد اليومي والإنتاج</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data?.materials?.length} className="gap-2">
          <Download size={15} />
          تصدير CSV
        </Button>
      </div>

      {/* Date Filter */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">الفترة:</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">من</label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">إلى</label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            <Button size="sm" onClick={handleSearch} className="h-8">عرض التقرير</Button>
            <div className="flex gap-1.5 ms-auto">
              {[
                { label: "اليوم", days: 1 },
                { label: "7 أيام", days: 7 },
                { label: "30 يوم", days: 30 },
              ].map(p => (
                <Button key={p.days} variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setPreset(p.days)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 text-destructive text-sm">خطأ في تحميل البيانات: {error.message}</CardContent>
        </Card>
      )}

      {data && !isLoading && (
        <>
          {/* Data source notice */}
          {data.hasInventoryData ? (
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2.5 border border-blue-200 dark:border-blue-800">
              <ClipboardList size={15} />
              <span>البيانات مبنية على <strong>الجرد اليومي</strong> (افتتاحي + مستلم − ختامي). الأيام بدون جرد تعتمد على بيانات الإنتاج والسحب.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg px-4 py-2.5 border border-orange-200 dark:border-orange-800">
              <Activity size={15} />
              <span>لا يوجد جرد يومي مسجّل في هذه الفترة. البيانات مبنية على سجلات الإنتاج والسحب اليومي.</span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package size={15} className="text-blue-500" />
                  <span className="text-xs text-muted-foreground">عدد المواد</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.materials.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">مادة خام مستهلكة</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar size={15} className="text-purple-500" />
                  <span className="text-xs text-muted-foreground">أيام النشاط</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.totalDays}</p>
                <p className="text-xs text-muted-foreground mt-0.5">يوم</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown size={15} className="text-orange-500" />
                  <span className="text-xs text-muted-foreground">إجمالي الكمية</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {fmt(data.materials.reduce((s, m) => s + m.totalQty, 0), 1)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">وحدة مستهلكة</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={15} className="text-green-500" />
                  <span className="text-xs text-muted-foreground">إجمالي التكلفة</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{fmtCost(data.totalCost)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">درهم</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border">
            {[
              { key: "summary", label: "ملخص المواد الخام" },
              { key: "daily", label: "التفصيل اليومي" },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Summary Tab */}
          {activeTab === "summary" && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">إجمالي استهلاك المواد الخام</CardTitle>
                  <Input
                    placeholder="بحث عن مادة..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-44 h-8 text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  الفترة: {queryDates.from} إلى {queryDates.to}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {filteredMaterials.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">لا توجد بيانات استهلاك في هذه الفترة</p>
                    <p className="text-xs mt-1">تأكد من تسجيل الجرد اليومي أو بيانات الإنتاج</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">المادة الخام</TableHead>
                          <TableHead className="text-center">الوحدة</TableHead>
                          <TableHead className="text-center font-bold">الكمية المستهلكة</TableHead>
                          <TableHead className="text-center">سعر الوحدة</TableHead>
                          <TableHead className="text-center font-bold text-green-700 dark:text-green-400">إجمالي التكلفة</TableHead>
                          <TableHead className="text-center">المصدر</TableHead>
                          <TableHead className="text-center">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMaterials.map((m) => {
                          const pct = data.totalCost > 0 ? (m.totalCost / data.totalCost) * 100 : 0;
                          const src = sourceLabel(m.source);
                          return (
                            <TableRow key={m.materialId} className="hover:bg-muted/40">
                              <TableCell className="font-medium text-right">{m.materialName}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">{m.unit}</Badge>
                              </TableCell>
                              <TableCell className="text-center font-bold">{fmt(m.totalQty)}</TableCell>
                              <TableCell className="text-center text-sm">{fmtCost(m.unitCost)}</TableCell>
                              <TableCell className="text-center font-bold text-green-700 dark:text-green-400">
                                {fmtCost(m.totalCost)}
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${src.color}`}>{src.label}</span>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center gap-1.5 justify-center">
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {/* Total row */}
                    <div className="border-t border-border px-4 py-3 flex justify-between items-center bg-muted/30">
                      <span className="text-sm font-semibold">الإجمالي</span>
                      <span className="text-base font-bold text-green-700 dark:text-green-400">
                        {fmtCost(data.totalCost)} درهم
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Daily Tab */}
          {activeTab === "daily" && (
            <div className="space-y-3">
              {dailyByDate.size === 0 ? (
                <Card>
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">لا توجد بيانات يومية في هذه الفترة</p>
                  </CardContent>
                </Card>
              ) : (
                Array.from(dailyByDate.entries()).map(([date, rows]) => {
                  const dayTotal = rows.reduce((s, r) => s + r.totalCost, 0);
                  const isOpen = expandedDays.has(date);
                  const daySource = rows.every(r => r.source === "inventory") ? "inventory"
                    : rows.every(r => r.source === "production") ? "production" : "mixed";
                  const src = sourceLabel(daySource);
                  return (
                    <Card key={date} className="overflow-hidden">
                      <button
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
                        onClick={() => toggleDay(date)}
                      >
                        <div className="flex items-center gap-3">
                          {isOpen ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                          <Calendar size={15} className="text-blue-500" />
                          <span className="font-semibold text-sm">{date}</span>
                          <Badge variant="secondary" className="text-xs">{rows.length} مادة</Badge>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${src.color}`}>{src.label}</span>
                        </div>
                        <span className="font-bold text-green-700 dark:text-green-400 text-sm">
                          {fmtCost(dayTotal)} درهم
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-right">المادة الخام</TableHead>
                                <TableHead className="text-center">الوحدة</TableHead>
                                <TableHead className="text-center font-bold">الكمية المستهلكة</TableHead>
                                <TableHead className="text-center">التكلفة</TableHead>
                                <TableHead className="text-center">المصدر</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.map((r) => {
                                const rsrc = sourceLabel(r.source);
                                return (
                                  <TableRow key={`${date}-${r.materialId}`}>
                                    <TableCell className="text-right text-sm">{r.materialName}</TableCell>
                                    <TableCell className="text-center">
                                      <Badge variant="outline" className="text-xs">{r.unit}</Badge>
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-sm">{fmt(r.totalQty)}</TableCell>
                                    <TableCell className="text-center text-sm font-medium text-green-700 dark:text-green-400">
                                      {fmtCost(r.totalCost)}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rsrc.color}`}>{rsrc.label}</span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
