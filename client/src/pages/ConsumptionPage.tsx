import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FlameKindling,
  Plus,
  Trash2,
  Calculator,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Download,
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface LineItem {
  id: number;
  productId: number | null;
  productName: string;
  qty: number;
  searchQuery: string;
  showSuggestions: boolean;
}

interface CsvMatchResult {
  matched: Array<{ csvName: string; sku: string; productId: number; productName: string; qty: number }>;
  unmatched: Array<{ csvName: string; sku: string; qty: number }>;
}

type ConsumptionResult = {
  rawMaterials: Array<{
    materialId: number;
    materialName: string;
    unit: string;
    totalQty: number;
    unitCost: number;
    totalCost: number;
  }>;
  productBreakdown: Array<{
    productId: number;
    productName: string;
    sku: string | null;
    soldQty: number;
    ingredients: Array<{
      materialId: number;
      materialName: string;
      materialType: string;
      unit: string;
      qtyPerUnit: number;
      totalQty: number;
      unitCost: number;
      totalCost: number;
    }>;
  }>;
  noRecipe: Array<{ productId: number; productName: string; qty: number }>;
  totalCost: number;
};

/** Parse CSV text → array of {name, sku, qty} rows */
function parseSalesCSV(text: string): Array<{ name: string; sku: string; qty: number }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  // Detect header row (first line)
  const rows: Array<{ name: string; sku: string; qty: number }> = [];
  for (let i = 1; i < lines.length; i++) {
    // Handle quoted CSV fields
    const cols = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)?.map((c) => c.replace(/^"|"$/g, "").trim()) ?? lines[i].split(",").map((c) => c.trim());
    if (cols.length < 3) continue;
    const name = cols[0] || "";
    const sku = cols[1] || "";
    const qty = parseFloat(cols[2]) || 0;
    if (qty > 0) rows.push({ name, sku, qty });
  }
  return rows;
}

export default function ConsumptionPage() {
  const [lines, setLines] = useState<LineItem[]>([
    { id: 1, productId: null, productName: "", qty: 1, searchQuery: "", showSuggestions: false },
  ]);
  const [nextId, setNextId] = useState(2);
  const [result, setResult] = useState<ConsumptionResult | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());
  const [csvMatch, setCsvMatch] = useState<CsvMatchResult | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch products list for autocomplete
  const { data: products = [] } = trpc.products.list.useQuery();

  const calculateMutation = trpc.consumption.calculate.useMutation({
    onSuccess: (data) => {
      setResult(data);
      if (data.noRecipe.length > 0) {
        toast.warning(
          `${data.noRecipe.length} صنف بدون وصفة: ${data.noRecipe.map((p) => p.productName).join("، ")}`
        );
      } else {
        toast.success("تم حساب الاستهلاك بنجاح");
      }
    },
    onError: (err) => {
      toast.error("خطأ في الحساب: " + err.message);
    },
  });

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: nextId, productId: null, productName: "", qty: 1, searchQuery: "", showSuggestions: false },
    ]);
    setNextId((n) => n + 1);
  };

  const removeLine = (id: number) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: number, patch: Partial<LineItem>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleCalculate = () => {
    const validLines = lines.filter((l) => l.productId !== null && l.qty > 0);
    if (validLines.length === 0) {
      toast.error("أضف صنفاً واحداً على الأقل مع كميته");
      return;
    }
    setResult(null);
    calculateMutation.mutate({
      items: validLines.map((l) => ({ productId: l.productId!, qty: l.qty })),
    });
  };

  const toggleProduct = (productId: number) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  /** Handle CSV file upload: parse → match SKU/name → fill lines */
  const handleCsvUpload = useCallback((file: File) => {
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const csvRows = parseSalesCSV(text);
      if (csvRows.length === 0) {
        toast.error("لم يتم العثور على بيانات في الملف");
        return;
      }

      // Build lookup maps from products
      const skuMap = new Map<string, typeof products[0]>();
      const nameMap = new Map<string, typeof products[0]>();
      for (const p of products) {
        if (p.sku) skuMap.set(p.sku.toLowerCase().trim(), p);
        nameMap.set((p.nameAr || p.name).toLowerCase().trim(), p);
        nameMap.set(p.name.toLowerCase().trim(), p);
      }

      const matched: CsvMatchResult["matched"] = [];
      const unmatched: CsvMatchResult["unmatched"] = [];

      for (const row of csvRows) {
        const skuKey = row.sku.toLowerCase().trim();
        const nameKey = row.name.toLowerCase().trim();
        const found = skuMap.get(skuKey) || nameMap.get(nameKey);
        if (found) {
          matched.push({
            csvName: row.name,
            sku: row.sku,
            productId: found.id,
            productName: found.nameAr || found.name,
            qty: row.qty,
          });
        } else {
          unmatched.push({ csvName: row.name, sku: row.sku, qty: row.qty });
        }
      }

      setCsvMatch({ matched, unmatched });

      if (matched.length === 0) {
        toast.error("لم يتم مطابقة أي صنف من الملف مع المنتجات الموجودة");
        return;
      }

      // Fill lines with matched products
      let idCounter = nextId;
      const newLines: LineItem[] = matched.map((m) => ({
        id: idCounter++,
        productId: m.productId,
        productName: m.productName,
        qty: m.qty,
        searchQuery: m.productName,
        showSuggestions: false,
      }));
      setLines(newLines);
      setNextId(idCounter);
      setResult(null);

      toast.success(`تم تحميل ${matched.length} صنف من الملف${unmatched.length > 0 ? ` (${unmatched.length} غير مطابق)` : ""}`);
    };
    reader.readAsText(file, "UTF-8");
  }, [products, nextId]);

  const handleExportCsv = useCallback(() => {
    if (!result) return;
    const rows: string[][] = [];
    rows.push(["=== إجمالي المواد الخام المستهلكة ==="]);
    rows.push(["المادة الخام", "الوحدة", "الكمية الإجمالية", "سعر الوحدة (د.إ)", "التكلفة الإجمالية (د.إ)"]);
    result.rawMaterials.forEach((r) => {
      rows.push([r.materialName, r.unit, String(r.totalQty), String(r.unitCost), String(r.totalCost)]);
    });
    rows.push(["", "", "", "الإجمالي", String(result.totalCost)]);
    rows.push([]);
    rows.push(["=== تفصيل الأصناف ==="]);
    result.productBreakdown.forEach((p) => {
      rows.push([`${p.productName} (كمية: ${p.soldQty})`]);
      rows.push(["المادة", "النوع", "الوحدة", "الكمية/وحدة", "الإجمالي"]);
      p.ingredients.forEach((ing) => {
        rows.push([
          ing.materialName,
          ing.materialType === "semi_finished" ? "مصنّعة" : "خام",
          ing.unit,
          String(ing.qtyPerUnit),
          String(ing.totalQty),
        ]);
      });
      rows.push([]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consumption-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const filteredProducts = (query: string) => {
    if (!query.trim()) return products.slice(0, 12);
    const q = query.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.nameAr || "").includes(q) || (p.sku || "").toLowerCase().includes(q))
      .slice(0, 12);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <FlameKindling size={22} className="text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">حاسبة الاستهلاك</h1>
            <p className="text-sm text-muted-foreground">أدخل الأصناف يدوياً أو ارفع ملف CSV للمبيعات</p>
          </div>
        </div>
        {result && (
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2">
            <Download size={15} />
            تصدير CSV
          </Button>
        )}
      </div>

      {/* CSV Upload Zone */}
      <Card className="border-dashed border-2 border-orange-300/50 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
        <CardContent className="p-5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCsvUpload(f);
              e.target.value = "";
            }}
          />
          <div
            className="flex flex-col sm:flex-row items-center gap-4 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleCsvUpload(f);
            }}
          >
            <div className="w-12 h-12 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <Upload size={22} className="text-orange-500" />
            </div>
            <div className="text-center sm:text-right">
              <p className="font-semibold text-foreground text-sm">
                {csvFileName ? (
                  <span className="flex items-center gap-2 justify-center sm:justify-start">
                    <FileText size={15} className="text-orange-500" />
                    {csvFileName}
                  </span>
                ) : (
                  "ارفع ملف CSV للمبيعات"
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                اسحب الملف هنا أو اضغط للاختيار — يدعم ملفات تقارير المبيعات (المنتج، الكود، الكمية)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="sm:mr-auto gap-2 border-orange-300 text-orange-600 hover:bg-orange-500/10"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            >
              <Upload size={14} />
              اختر ملف
            </Button>
          </div>

          {/* Match summary */}
          {csvMatch && (
            <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">{csvMatch.matched.length} صنف مطابق</p>
                  <p className="text-xs text-muted-foreground mt-0.5">تم تحميلها في الجدول أدناه</p>
                </div>
              </div>
              {csvMatch.unmatched.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <XCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{csvMatch.unmatched.length} صنف غير مطابق</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {csvMatch.unmatched.slice(0, 4).map((u) => u.csvName).join("، ")}
                      {csvMatch.unmatched.length > 4 && ` و${csvMatch.unmatched.length - 4} آخرين`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Input Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator size={16} className="text-primary" />
            الأصناف المباعة
            {lines.filter((l) => l.productId).length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {lines.filter((l) => l.productId).length} صنف
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_120px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span>اسم الصنف</span>
            <span className="text-center">الكمية</span>
            <span />
          </div>

          {lines.map((line) => (
            <div key={line.id} className="grid grid-cols-[1fr_120px_40px] gap-2 items-center">
              {/* Product combobox */}
              <div className="relative">
                <Input
                  placeholder="ابحث عن صنف..."
                  value={line.searchQuery}
                  onChange={(e) => updateLine(line.id, { searchQuery: e.target.value, showSuggestions: true, productId: null, productName: "" })}
                  onFocus={() => updateLine(line.id, { showSuggestions: true })}
                  onBlur={() => setTimeout(() => updateLine(line.id, { showSuggestions: false }), 150)}
                  className={`text-sm ${line.productId ? "border-green-500/50 bg-green-500/5" : ""}`}
                />
                {line.productId && (
                  <button
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive text-xs"
                    onMouseDown={(e) => { e.preventDefault(); updateLine(line.id, { productId: null, productName: "", searchQuery: "", showSuggestions: false }); }}
                  >✕</button>
                )}
                {line.showSuggestions && !line.productId && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredProducts(line.searchQuery).length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">لا توجد نتائج</div>
                    ) : (
                      filteredProducts(line.searchQuery).map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updateLine(line.id, {
                              productId: p.id,
                              productName: p.name,
                              searchQuery: p.nameAr || p.name,
                              showSuggestions: false,
                            });
                          }}
                        >
                          <span>{p.nameAr || p.name}</span>
                          {p.sku && <span className="text-xs text-muted-foreground">{p.sku}</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Qty */}
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.qty}
                onChange={(e) => updateLine(line.id, { qty: parseFloat(e.target.value) || 0 })}
                className="text-sm text-center"
              />

              {/* Remove */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeLine(line.id)}
                disabled={lines.length === 1}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={addLine} className="gap-2">
              <Plus size={14} />
              إضافة صنف
            </Button>
            <Button
              onClick={handleCalculate}
              disabled={calculateMutation.isPending}
              className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <FlameKindling size={15} />
              {calculateMutation.isPending ? "جاري الحساب..." : "احسب الاستهلاك"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* No-recipe warning */}
          {result.noRecipe.length > 0 && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">أصناف بدون وصفة (لم تُحسب):</p>
                <p className="text-sm mt-1">{result.noRecipe.map((p) => `${p.productName} (${p.qty})`).join(" — ")}</p>
              </div>
            </div>
          )}

          {/* Summary KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="bg-orange-500/10 border-orange-500/20">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">إجمالي التكلفة النظرية</p>
                <p className="text-2xl font-bold text-orange-500 mt-1">{result.totalCost.toFixed(3)} <span className="text-sm font-normal">د.إ</span></p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">عدد المواد الخام</p>
                <p className="text-2xl font-bold text-foreground mt-1">{result.rawMaterials.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">أصناف محسوبة</p>
                <p className="text-2xl font-bold text-foreground mt-1">{result.productBreakdown.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Aggregated raw materials table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlameKindling size={16} className="text-orange-500" />
                إجمالي المواد الخام المستهلكة
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">المادة الخام</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">الوحدة</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">الكمية</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">سعر الوحدة</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rawMaterials.map((r, i) => (
                      <tr key={r.materialId} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{r.materialName}</td>
                        <td className="px-4 py-2.5 text-center text-muted-foreground">{r.unit}</td>
                        <td className="px-4 py-2.5 text-center font-mono text-blue-600 dark:text-blue-400">{r.totalQty}</td>
                        <td className="px-4 py-2.5 text-center text-muted-foreground">{r.unitCost > 0 ? r.unitCost.toFixed(3) : "—"}</td>
                        <td className="px-4 py-2.5 text-center font-semibold text-green-600 dark:text-green-400">
                          {r.totalCost > 0 ? r.totalCost.toFixed(3) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td colSpan={4} className="px-4 py-2.5 font-bold text-right">الإجمالي</td>
                      <td className="px-4 py-2.5 text-center font-bold text-orange-500">{result.totalCost.toFixed(3)} د.إ</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Per-product breakdown */}
          {result.productBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">تفصيل الاستهلاك لكل صنف</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {result.productBreakdown.map((p) => {
                  const isExpanded = expandedProducts.has(p.productId);
                  return (
                    <div key={p.productId} className="border border-border rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-right"
                        onClick={() => toggleProduct(p.productId)}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <span className="font-semibold text-sm">{p.productName}</span>
                          {p.sku && <Badge variant="outline" className="text-xs">{p.sku}</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>كمية: <strong className="text-foreground">{p.soldQty}</strong></span>
                          <span>{p.ingredients.length} مكوّن</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/20">
                                <th className="text-right px-4 py-2 font-medium text-muted-foreground">المادة</th>
                                <th className="text-center px-3 py-2 font-medium text-muted-foreground">النوع</th>
                                <th className="text-center px-3 py-2 font-medium text-muted-foreground">الوحدة</th>
                                <th className="text-center px-3 py-2 font-medium text-muted-foreground">كمية/وحدة</th>
                                <th className="text-center px-3 py-2 font-medium text-muted-foreground">الإجمالي</th>
                                <th className="text-center px-3 py-2 font-medium text-muted-foreground">التكلفة</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.ingredients.map((ing) => (
                                <tr key={ing.materialId} className="border-b border-border/40">
                                  <td className="px-4 py-2 font-medium">{ing.materialName}</td>
                                  <td className="px-3 py-2 text-center">
                                    {ing.materialType === "semi_finished" ? (
                                      <Badge className="text-xs bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">مصنّعة</Badge>
                                    ) : (
                                      <Badge className="text-xs bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/20">خام</Badge>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center text-muted-foreground">{ing.unit}</td>
                                  <td className="px-3 py-2 text-center font-mono">{ing.qtyPerUnit}</td>
                                  <td className="px-3 py-2 text-center font-mono text-blue-600 dark:text-blue-400">{ing.totalQty}</td>
                                  <td className="px-3 py-2 text-center text-green-600 dark:text-green-400">
                                    {ing.totalCost > 0 ? ing.totalCost.toFixed(3) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
