import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart, Calendar, Download, Package, DollarSign,
  FileText, ChevronDown, ChevronRight, TrendingUp,
} from "lucide-react";

function fmt(n: number, dec = 3) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
function fmtCost(n: number) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SupplierItemsReportPage() {
  const { isRTL } = useLanguage();

  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 29);

  const [fromDate, setFromDate] = useState(monthAgo.toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10));
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [queryParams, setQueryParams] = useState({
    from: monthAgo.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
    supplierId: null as number | null,
  });
  const [activeTab, setActiveTab] = useState<"summary" | "details">("summary");
  const [expandedInvoices, setExpandedInvoices] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, error } = trpc.supplierItems.report.useQuery({
    fromDate: queryParams.from,
    toDate: queryParams.to,
    supplierId: queryParams.supplierId,
  });

  const handleSearch = () => {
    if (fromDate > toDate) return;
    setQueryParams({ from: fromDate, to: toDate, supplierId: selectedSupplierId });
  };

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const f = start.toISOString().slice(0, 10);
    const t = end.toISOString().slice(0, 10);
    setFromDate(f);
    setToDate(t);
    setQueryParams({ from: f, to: t, supplierId: selectedSupplierId });
  };

  const filteredMaterials = useMemo(() => {
    if (!data?.materials) return [];
    if (!searchTerm.trim()) return data.materials;
    const q = searchTerm.toLowerCase();
    return data.materials.filter(m => m.materialName.toLowerCase().includes(q));
  }, [data?.materials, searchTerm]);

  // Group invoice details by invoiceId
  const invoiceGroups = useMemo(() => {
    type InvDetail = { invoiceId: number; invoiceNumber: string; invoiceDate: string; supplierName: string; items: Array<{ invoiceId: number; invoiceNumber: string; invoiceDate: string; supplierName: string; materialId: number; materialName: string; unit: string; quantity: number; unitPrice: number; totalPrice: number }> };
    const map = new Map<number, InvDetail>();
    if (!data?.invoiceDetails) return map;
    for (const row of (data?.invoiceDetails ?? [])) {
      if (!map.has(row.invoiceId)) {
        map.set(row.invoiceId, {
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
          invoiceDate: row.invoiceDate,
          supplierName: row.supplierName,
          items: [],
        });
      }
      map.get(row.invoiceId)!.items.push(row);
    }
    return map;
  }, [data?.invoiceDetails]);

  const toggleInvoice = (id: number) => {
    setExpandedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Export to CSV
  const exportCSV = () => {
    if (!data?.materials) return;
    const rows = [
      ["المادة الخام", "الوحدة", "إجمالي الكمية", "متوسط سعر الوحدة", "أدنى سعر", "أعلى سعر", "إجمالي التكلفة", "عدد الفواتير"],
      ...data.materials.map(m => [
        m.materialName, m.unit,
        fmt(m.totalQty), fmtCost(m.avgUnitPrice),
        fmtCost(m.minUnitPrice), fmtCost(m.maxUnitPrice),
        fmtCost(m.totalCost), m.invoiceCount,
      ]),
      [],
      ["الإجمالي", "", fmt(data.totalQty), "", "", "", fmtCost(data.totalCost), data.invoiceCount],
    ];
    const csv = "\uFEFF" + rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supplier-items-${queryParams.from}-to-${queryParams.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <ShoppingCart size={20} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">تقرير بنود فواتير الموردين</h1>
            <p className="text-sm text-muted-foreground">إجمالي المواد المشتراة من فواتير الموردين</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data?.materials?.length} className="gap-2">
          <Download size={15} />
          تصدير CSV
        </Button>
      </div>

      {/* Filters */}
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
            {/* Supplier filter — populated after first load */}
            <Select
              value={selectedSupplierId ? String(selectedSupplierId) : "all"}
              onValueChange={v => setSelectedSupplierId(v === "all" ? null : Number(v))}
            >
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="كل الموردين" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموردين</SelectItem>
                {(data?.supplierList ?? []).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleSearch} className="h-8">عرض التقرير</Button>
            <div className="flex gap-1.5 ms-auto">
              {[{ label: "7 أيام", days: 7 }, { label: "30 يوم", days: 30 }, { label: "90 يوم", days: 90 }].map(p => (
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
          <CardContent className="pt-4 text-destructive text-sm">خطأ: {error.message}</CardContent>
        </Card>
      )}

      {data && !isLoading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package size={15} className="text-blue-500" />
                  <span className="text-xs text-muted-foreground">عدد المواد</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.materials.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">مادة مختلفة</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={15} className="text-purple-500" />
                  <span className="text-xs text-muted-foreground">عدد الفواتير</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.invoiceCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">فاتورة مورد</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={15} className="text-orange-500" />
                  <span className="text-xs text-muted-foreground">إجمالي الكمية</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{fmt(data.totalQty, 1)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">وحدة مشتراة</p>
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
              { key: "summary", label: "ملخص المواد" },
              { key: "details", label: "تفصيل الفواتير" },
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
                  <CardTitle className="text-base">إجمالي المواد المشتراة</CardTitle>
                  <Input
                    placeholder="بحث عن مادة..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-44 h-8 text-sm"
                  />
                </div>
                {queryParams.supplierId && data.supplierName && (
                  <p className="text-xs text-muted-foreground">المورد: <strong>{data.supplierName}</strong></p>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {filteredMaterials.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">لا توجد بنود في هذه الفترة</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">المادة الخام</TableHead>
                          <TableHead className="text-center">الوحدة</TableHead>
                          <TableHead className="text-center font-bold">إجمالي الكمية</TableHead>
                          <TableHead className="text-center">متوسط السعر</TableHead>
                          <TableHead className="text-center">أدنى سعر</TableHead>
                          <TableHead className="text-center">أعلى سعر</TableHead>
                          <TableHead className="text-center font-bold text-green-700 dark:text-green-400">إجمالي التكلفة</TableHead>
                          <TableHead className="text-center">فواتير</TableHead>
                          <TableHead className="text-center">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMaterials.map(m => {
                          const pct = data.totalCost > 0 ? (m.totalCost / data.totalCost) * 100 : 0;
                          return (
                            <TableRow key={m.materialId} className="hover:bg-muted/40">
                              <TableCell className="font-medium text-right">{m.materialName}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">{m.unit}</Badge>
                              </TableCell>
                              <TableCell className="text-center font-bold">{fmt(m.totalQty)}</TableCell>
                              <TableCell className="text-center text-sm">{fmtCost(m.avgUnitPrice)}</TableCell>
                              <TableCell className="text-center text-xs text-muted-foreground">{fmtCost(m.minUnitPrice)}</TableCell>
                              <TableCell className="text-center text-xs text-muted-foreground">{fmtCost(m.maxUnitPrice)}</TableCell>
                              <TableCell className="text-center font-bold text-green-700 dark:text-green-400">
                                {fmtCost(m.totalCost)}
                              </TableCell>
                              <TableCell className="text-center text-xs text-muted-foreground">{m.invoiceCount}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center gap-1.5 justify-center">
                                  <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
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

          {/* Details Tab */}
          {activeTab === "details" && (
            <div className="space-y-3">
              {invoiceGroups.size === 0 ? (
                <Card>
                  <CardContent className="text-center py-12 text-muted-foreground">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">لا توجد فواتير في هذه الفترة</p>
                  </CardContent>
                </Card>
              ) : (
                Array.from(invoiceGroups.values()).map(inv => {
                  const invTotal = inv.items.reduce((s, r) => s + r.totalPrice, 0);
                  const isOpen = expandedInvoices.has(inv.invoiceId);
                  return (
                    <Card key={inv.invoiceId} className="overflow-hidden">
                      <button
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
                        onClick={() => toggleInvoice(inv.invoiceId)}
                      >
                        <div className="flex items-center gap-3">
                          {isOpen ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                          <FileText size={15} className="text-emerald-500" />
                          <span className="font-semibold text-sm">{inv.invoiceNumber}</span>
                          <Badge variant="secondary" className="text-xs">{inv.supplierName}</Badge>
                          <span className="text-xs text-muted-foreground">{inv.invoiceDate}</span>
                          <Badge variant="outline" className="text-xs">{inv.items.length} بند</Badge>
                        </div>
                        <span className="font-bold text-green-700 dark:text-green-400 text-sm">
                          {fmtCost(invTotal)} درهم
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-right">المادة الخام</TableHead>
                                <TableHead className="text-center">الوحدة</TableHead>
                                <TableHead className="text-center">الكمية</TableHead>
                                <TableHead className="text-center">سعر الوحدة</TableHead>
                                <TableHead className="text-center font-bold">الإجمالي</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {inv.items.map((r, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-right text-sm font-medium">{r.materialName}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline" className="text-xs">{r.unit}</Badge>
                                  </TableCell>
                                  <TableCell className="text-center text-sm">{fmt(r.quantity)}</TableCell>
                                  <TableCell className="text-center text-sm">{fmtCost(r.unitPrice)}</TableCell>
                                  <TableCell className="text-center font-bold text-sm text-green-700 dark:text-green-400">
                                    {fmtCost(r.totalPrice)}
                                  </TableCell>
                                </TableRow>
                              ))}
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
