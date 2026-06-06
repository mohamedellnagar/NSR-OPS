import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
function fmt(n: number, dec = 2) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCost(n: number) {
  return `${fmt(n, 2)} د.إ`;
}

function pctColor(pct: number | null, warn: number, critical: number) {
  if (pct === null) return "text-gray-400";
  const abs = Math.abs(pct);
  if (abs <= warn) return "text-green-600";
  if (abs <= critical) return "text-amber-600";
  return "text-red-600";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "normal") return <Badge className="bg-green-100 text-green-800 border-green-200">طبيعي</Badge>;
  if (status === "warning") return <Badge className="bg-amber-100 text-amber-800 border-amber-200">تحذير</Badge>;
  if (status === "critical") return <Badge className="bg-red-100 text-red-800 border-red-200">حرج</Badge>;
  return <Badge variant="outline" className="text-gray-500">غير معروف</Badge>;
}

function FlagBadges({ flags }: { flags: string[] }) {
  const labels: Record<string, { label: string; color: string }> = {
    possible_waste: { label: "هدر محتمل", color: "bg-orange-100 text-orange-800" },
    possible_theft: { label: "تسرب محتمل", color: "bg-red-100 text-red-800" },
    recipe_review_needed: { label: "مراجعة الوصفة", color: "bg-blue-100 text-blue-800" },
    unexplained_consumption: { label: "استهلاك غير مبرر", color: "bg-purple-100 text-purple-800" },
    no_physical_count: { label: "بدون جرد", color: "bg-gray-100 text-gray-600" },
    negative_consumption: { label: "استهلاك سالب", color: "bg-pink-100 text-pink-800" },
    negative_stock: { label: "مخزون سالب", color: "bg-red-100 text-red-800" },
  };
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(f => {
        const info = labels[f];
        if (!info) return null;
        return (
          <span key={f} className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>
            {info.label}
          </span>
        );
      })}
    </div>
  );
}

export default function VarianceAnalysisPage() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("raw");
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"varianceCost" | "variancePct" | "materialName">("varianceCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading, refetch, isFetching } = trpc.varianceAnalysis.getReport.useQuery(
    {
      fromDate,
      toDate,
      materialType: filterType === "all" ? undefined : (filterType as "raw" | "semi_finished"),
    },
    { enabled: true }
  );

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = [...data.rows];

    if (filterStatus !== "all") {
      rows = rows.filter(r => r.status === filterStatus);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        r.materialName.toLowerCase().includes(q) ||
        r.materialCode.toLowerCase().includes(q) ||
        (r.categoryName ?? "").toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      let av: number, bv: number;
      if (sortBy === "materialName") {
        return sortDir === "asc"
          ? a.materialName.localeCompare(b.materialName, "ar")
          : b.materialName.localeCompare(a.materialName, "ar");
      }
      if (sortBy === "variancePct") {
        av = Math.abs(a.variancePct ?? 0);
        bv = Math.abs(b.variancePct ?? 0);
      } else {
        av = Math.abs(a.varianceCost);
        bv = Math.abs(b.varianceCost);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return rows;
  }, [data?.rows, filterStatus, search, sortBy, sortDir]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function exportCSV() {
    if (!filteredRows.length) return;
    const headers = ["الكود", "المادة", "التصنيف", "الوحدة", "افتتاحي", "مشتريات", "ختامي", "فعلي", "متوقع", "الفرق كمية", "الفرق %", "تكلفة الفرق", "الحالة", "ملاحظات"];
    const rows = filteredRows.map(r => [
      r.materialCode,
      r.materialName,
      r.categoryName ?? "",
      r.unit,
      fmt(r.openingQty, 3),
      fmt(r.purchasesQty, 3),
      fmt(r.closingQty, 3),
      fmt(r.actualConsumption, 3),
      fmt(r.expectedConsumption, 3),
      fmt(r.varianceQty, 3),
      r.variancePct !== null ? fmt(r.variancePct, 1) + "%" : "—",
      fmt(r.varianceCost, 2),
      r.status,
      r.flags.join(", "),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `variance-analysis-${fromDate}-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const warn = data?.warnThreshold ?? 3;
  const crit = data?.criticalThreshold ?? 8;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">تحليل الفروقات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            مقارنة الاستهلاك الفعلي بالمتوقع من الوصفات والمبيعات
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            <span className="mr-1">تحديث</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filteredRows.length}>
            <Download size={14} />
            <span className="mr-1">تصدير CSV</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">من</label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">إلى</label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">نوع المادة</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="raw">خام فقط</SelectItem>
                  <SelectItem value="semi_finished">مصنّعة فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">الحالة</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="critical">حرج</SelectItem>
                  <SelectItem value="warning">تحذير</SelectItem>
                  <SelectItem value="normal">طبيعي</SelectItem>
                  <SelectItem value="unknown">غير معروف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs text-muted-foreground">بحث</label>
              <Input
                placeholder="اسم المادة أو الكود..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">تكلفة الاستهلاك الفعلي</p>
                  <p className="text-xl font-bold mt-1">{fmtCost(data.totalActualCost)}</p>
                </div>
                <TrendingUp className="text-blue-500" size={28} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">تكلفة الاستهلاك المتوقع</p>
                  <p className="text-xl font-bold mt-1">{fmtCost(data.totalExpectedCost)}</p>
                </div>
                <TrendingDown className="text-green-500" size={28} />
              </div>
            </CardContent>
          </Card>
          <Card className={data.totalVarianceCost > 0 ? "border-red-200" : "border-green-200"}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي الفرق (تكلفة)</p>
                  <p className={`text-xl font-bold mt-1 ${data.totalVarianceCost > 0 ? "text-red-600" : "text-green-600"}`}>
                    {data.totalVarianceCost >= 0 ? "+" : ""}{fmtCost(data.totalVarianceCost)}
                  </p>
                  {data.totalVariancePct !== null && (
                    <p className="text-xs text-muted-foreground">
                      {data.totalVariancePct >= 0 ? "+" : ""}{fmt(data.totalVariancePct, 1)}%
                    </p>
                  )}
                </div>
                {data.totalVarianceCost > 0
                  ? <AlertTriangle className="text-red-500" size={28} />
                  : <CheckCircle2 className="text-green-500" size={28} />
                }
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-2">توزيع الحالات</p>
              <div className="flex gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-xs">
                  <CheckCircle2 size={12} className="text-green-600" />
                  <span className="font-semibold">{data.normalCount}</span> طبيعي
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <AlertTriangle size={12} className="text-amber-600" />
                  <span className="font-semibold">{data.warningCount}</span> تحذير
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <XCircle size={12} className="text-red-600" />
                  <span className="font-semibold">{data.criticalCount}</span> حرج
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top 10 Variance */}
      {data && data.top10Variance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              أعلى 10 مواد بفروقات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.top10Variance.map(r => (
                <div
                  key={r.materialId}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border cursor-pointer hover:opacity-80 transition-opacity
                    ${r.status === "critical" ? "bg-red-50 border-red-200" :
                      r.status === "warning" ? "bg-amber-50 border-amber-200" :
                      "bg-gray-50 border-gray-200"}`}
                  onClick={() => setExpandedRow(expandedRow === r.materialId ? null : r.materialId)}
                >
                  <span className="font-medium">{r.materialName}</span>
                  <span className={`font-bold ${r.varianceCost >= 0 ? "text-red-600" : "text-green-600"}`}>
                    {r.varianceCost >= 0 ? "+" : ""}{fmtCost(r.varianceCost)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            تفصيل الفروقات
            {filteredRows.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground mr-2">
                ({filteredRows.length} مادة)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw size={20} className="animate-spin ml-2" />
              جاري التحميل...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Info size={32} className="mb-2 opacity-40" />
              <p>لا توجد بيانات للفترة المحددة</p>
              <p className="text-xs mt-1">تأكد من وجود بيانات مبيعات وجرد يومي في هذه الفترة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-8"></TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-foreground"
                      onClick={() => toggleSort("materialName")}
                    >
                      المادة {sortBy === "materialName" && (sortDir === "asc" ? "↑" : "↓")}
                    </TableHead>
                    <TableHead>الوحدة</TableHead>
                    <TableHead>افتتاحي</TableHead>
                    <TableHead>مشتريات</TableHead>
                    <TableHead>ختامي</TableHead>
                    <TableHead>فعلي</TableHead>
                    <TableHead>متوقع</TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-foreground"
                      onClick={() => toggleSort("variancePct")}
                    >
                      فرق % {sortBy === "variancePct" && (sortDir === "asc" ? "↑" : "↓")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none hover:text-foreground"
                      onClick={() => toggleSort("varianceCost")}
                    >
                      تكلفة الفرق {sortBy === "varianceCost" && (sortDir === "asc" ? "↑" : "↓")}
                    </TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(row => (
                    <>
                      <TableRow
                        key={row.materialId}
                        className={`text-sm cursor-pointer hover:bg-muted/50 transition-colors
                          ${row.status === "critical" ? "bg-red-50/30" :
                            row.status === "warning" ? "bg-amber-50/30" : ""}`}
                        onClick={() => setExpandedRow(expandedRow === row.materialId ? null : row.materialId)}
                      >
                        <TableCell className="py-2">
                          {expandedRow === row.materialId
                            ? <ChevronUp size={14} className="text-muted-foreground" />
                            : <ChevronDown size={14} className="text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell className="font-medium py-2">
                          <div>{row.materialName}</div>
                          {row.categoryName && (
                            <div className="text-xs text-muted-foreground">{row.categoryName}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-muted-foreground">{row.unit}</TableCell>
                        <TableCell className="py-2">{fmt(row.openingQty, 2)}</TableCell>
                        <TableCell className="py-2">{fmt(row.purchasesQty, 2)}</TableCell>
                        <TableCell className="py-2">{fmt(row.closingQty, 2)}</TableCell>
                        <TableCell className="py-2 font-medium">{fmt(row.actualConsumption, 2)}</TableCell>
                        <TableCell className="py-2 text-muted-foreground">{fmt(row.expectedConsumption, 2)}</TableCell>
                        <TableCell className={`py-2 font-bold ${pctColor(row.variancePct, warn, crit)}`}>
                          {row.variancePct !== null
                            ? `${row.variancePct >= 0 ? "+" : ""}${fmt(row.variancePct, 1)}%`
                            : "—"}
                        </TableCell>
                        <TableCell className={`py-2 font-semibold ${row.varianceCost > 0 ? "text-red-600" : row.varianceCost < 0 ? "text-green-600" : ""}`}>
                          {row.varianceCost >= 0 ? "+" : ""}{fmtCost(row.varianceCost)}
                        </TableCell>
                        <TableCell className="py-2">
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="py-2">
                          <FlagBadges flags={row.flags} />
                        </TableCell>
                      </TableRow>
                      {expandedRow === row.materialId && (
                        <TableRow key={`${row.materialId}-detail`} className="bg-muted/20">
                          <TableCell colSpan={12} className="py-3 px-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">حركة المخزون</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">افتتاحي:</span>
                                    <span>{fmt(row.openingQty, 3)} {row.unit}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">مشتريات:</span>
                                    <span className="text-green-600">+{fmt(row.purchasesQty, 3)}</span>
                                  </div>
                                  {row.transferIn > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">تحويل وارد:</span>
                                      <span className="text-green-600">+{fmt(row.transferIn, 3)}</span>
                                    </div>
                                  )}
                                  {row.transferOut > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">تحويل صادر:</span>
                                      <span className="text-red-600">-{fmt(row.transferOut, 3)}</span>
                                    </div>
                                  )}
                                  {row.adjustment !== 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">تسوية:</span>
                                      <span className={row.adjustment >= 0 ? "text-green-600" : "text-red-600"}>
                                        {row.adjustment >= 0 ? "+" : ""}{fmt(row.adjustment, 3)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between border-t pt-1 font-medium">
                                    <span className="text-muted-foreground">ختامي:</span>
                                    <span>{fmt(row.closingQty, 3)} {row.unit}</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">الاستهلاك</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">فعلي:</span>
                                    <span className="font-medium">{fmt(row.actualConsumption, 3)} {row.unit}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">متوقع:</span>
                                    <span>{fmt(row.expectedConsumption, 3)} {row.unit}</span>
                                  </div>
                                  <div className="flex justify-between border-t pt-1 font-medium">
                                    <span className="text-muted-foreground">الفرق:</span>
                                    <span className={row.varianceQty > 0 ? "text-red-600" : "text-green-600"}>
                                      {row.varianceQty >= 0 ? "+" : ""}{fmt(row.varianceQty, 3)} {row.unit}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">التكلفة</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">متوسط التكلفة:</span>
                                    <span>{fmtCost(row.avgCost)}/{row.unit}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">تكلفة فعلية:</span>
                                    <span>{fmtCost(row.actualConsumptionCost)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">تكلفة متوقعة:</span>
                                    <span>{fmtCost(row.expectedConsumptionCost)}</span>
                                  </div>
                                  <div className="flex justify-between border-t pt-1 font-bold">
                                    <span className="text-muted-foreground">فرق التكلفة:</span>
                                    <span className={row.varianceCost > 0 ? "text-red-600" : "text-green-600"}>
                                      {row.varianceCost >= 0 ? "+" : ""}{fmtCost(row.varianceCost)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">التشخيص</p>
                                {row.flags.length === 0 ? (
                                  <div className="flex items-center gap-1 text-green-600 text-sm">
                                    <CheckCircle2 size={14} />
                                    لا توجد مشكلات
                                  </div>
                                ) : (
                                  <FlagBadges flags={row.flags} />
                                )}
                                {row.variancePct !== null && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    نسبة الفرق: <span className={`font-bold ${pctColor(row.variancePct, warn, crit)}`}>
                                      {row.variancePct >= 0 ? "+" : ""}{fmt(row.variancePct, 1)}%
                                    </span>
                                    {" "}(حد التحذير: {warn}%، حد الحرج: {crit}%)
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
