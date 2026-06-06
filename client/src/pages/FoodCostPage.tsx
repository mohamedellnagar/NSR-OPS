import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Pencil,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Download,
  Target,
  BadgeDollarSign,
  Lightbulb,
  Filter,
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── FC thresholds ────────────────────────────────────────────────────────────
// FC% zones (restaurant industry standards):
//   ≤ 30%  → Excellent
//   31–40% → Warning
//   > 40%  → Danger
//   > 100% → Selling at a loss (cost > price)
const FC_TARGET = 30; // default target for suggested price calculation

function fcZone(pct: number): "excellent" | "warning" | "danger" | "loss" {
  if (pct > 100) return "loss";
  if (pct <= 30)  return "excellent";
  if (pct <= 40)  return "warning";
  return "danger";
}

function fcBadgeClass(pct: number) {
  const z = fcZone(pct);
  if (z === "loss")      return "bg-red-200 text-red-900 border-red-400 font-bold animate-pulse";
  if (z === "excellent") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (z === "warning")   return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-orange-100 text-orange-700 border-orange-200";
}

function fcRowClass(pct: number, margin: number, idx: number) {
  if (margin < 0 || pct > 100)
    return "bg-red-50 dark:bg-red-950/20 border-r-4 border-r-red-500";
  if (idx % 2 === 0) return "bg-background";
  return "bg-muted/20";
}

function FcIcon({ pct }: { pct: number }) {
  if (pct > 100)  return <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-700" />;
  if (pct <= 30)  return <TrendingDown className="w-3.5 h-3.5 inline mr-1" />;
  if (pct <= 40)  return <Minus className="w-3.5 h-3.5 inline mr-1" />;
  return <TrendingUp className="w-3.5 h-3.5 inline mr-1" />;
}

function fmtAED(n: number) {
  return `${n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ`;
}

// ─── Inline price editor ──────────────────────────────────────────────────────
function PriceCell({ materialId, materialName, currentPrice, onUpdated }: {
  materialId: number; materialName: string; currentPrice: number; onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(currentPrice));
  const utils = trpc.useUtils();

  const updatePrice = trpc.recipes.updateIngredientPrice.useMutation({
    onSuccess: () => {
      toast.success(`سعر "${materialName}" تم تحديثه`);
      utils.recipes.getFoodCostReport.invalidate();
      onUpdated();
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!editing) {
    return (
      <span className="group flex items-center gap-1 cursor-pointer hover:text-primary" onClick={() => { setVal(String(currentPrice)); setEditing(true); }}>
        <span>{currentPrice.toFixed(3)}</span>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Input type="number" step="0.001" min="0" value={val} onChange={(e) => setVal(e.target.value)}
        className="h-6 w-24 text-xs px-1 py-0" autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") updatePrice.mutate({ materialId, newPrice: parseFloat(val) || 0 });
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button className="text-emerald-600 hover:text-emerald-700"
        onClick={() => updatePrice.mutate({ materialId, newPrice: parseFloat(val) || 0 })}
        disabled={updatePrice.isPending}>
        <Check className="w-3.5 h-3.5" />
      </button>
      <button className="text-red-500 hover:text-red-600" onClick={() => setEditing(false)}>
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

// ─── Suggested Price Tooltip ──────────────────────────────────────────────────
function SuggestedPrice({ cost, currentPrice }: { cost: number; currentPrice: number }) {
  const suggested = cost > 0 ? cost / (FC_TARGET / 100) : 0;
  const gap = suggested - currentPrice;
  if (!cost || gap <= 0.5) return <span className="text-emerald-500 text-[10px]">✓ السعر مناسب</span>;
  return (
    <div className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 mt-0.5">
      <Lightbulb className="w-2.5 h-2.5 inline ml-0.5" />
      لـ {FC_TARGET}% FC: يُقترح <strong>{fmtAED(suggested)}</strong>
      <span className="text-muted-foreground mr-1">(+{fmtAED(gap)})</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FoodCostPage() {
  const [search, setSearch]           = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [filterZone, setFilterZone]   = useState<"all" | "excellent" | "warning" | "danger" | "loss">("all");
  const [showSuggested, setShowSuggested] = useState(true);

  const { data, isLoading, refetch } = trpc.recipes.getFoodCostReport.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data) return { avg: 0, excellent: 0, warning: 0, danger: 0, loss: 0, total: 0, lossValue: 0 };
    const total = data.length;
    const avg   = total > 0 ? data.reduce((s, r) => s + r.foodCostPercent, 0) / total : 0;
    const lossItems = data.filter(r => (r.sellingPrice - r.totalCost) < 0);
    return {
      avg,
      excellent: data.filter(r => fcZone(r.foodCostPercent) === "excellent").length,
      warning:   data.filter(r => fcZone(r.foodCostPercent) === "warning").length,
      danger:    data.filter(r => fcZone(r.foodCostPercent) === "danger").length,
      loss:      lossItems.length,
      total,
      lossValue: lossItems.reduce((s, r) => s + (r.totalCost - r.sellingPrice), 0),
    };
  }, [data]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((row) => {
      const margin = row.sellingPrice - row.totalCost;
      const matchSearch = !search || row.productName.toLowerCase().includes(search.toLowerCase());
      const matchZone =
        filterZone === "all" ||
        (filterZone === "loss"      && margin < 0) ||
        (filterZone === "excellent" && fcZone(row.foodCostPercent) === "excellent") ||
        (filterZone === "warning"   && fcZone(row.foodCostPercent) === "warning") ||
        (filterZone === "danger"    && fcZone(row.foodCostPercent) === "danger");
      return matchSearch && matchZone;
    });
  }, [data, search, filterZone]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Excel Export ───────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!data || !data.length) { toast.error("لا توجد بيانات للتصدير"); return; }
    const rows = filtered.map(row => {
      const margin = row.sellingPrice - row.totalCost;
      const marginPct = row.sellingPrice > 0 ? (margin / row.sellingPrice) * 100 : 0;
      const suggested = row.totalCost > 0 ? row.totalCost / (FC_TARGET / 100) : 0;
      return {
        "اسم الوصفة":        row.productName,
        "سعر البيع (د.إ)":   row.sellingPrice.toFixed(2),
        "تكلفة الوصفة (د.إ)":row.totalCost.toFixed(3),
        "هامش الربح (د.إ)":  margin.toFixed(3),
        "هامش الربح %":      marginPct.toFixed(1) + "%",
        "Food Cost %":       row.foodCostPercent.toFixed(1) + "%",
        "الحالة":             margin < 0 ? "خسارة!" : fcZone(row.foodCostPercent) === "excellent" ? "ممتاز" : fcZone(row.foodCostPercent) === "warning" ? "تحذير" : "خطر",
        "سعر مقترح (30% FC)": suggested > 0 ? suggested.toFixed(2) : "—",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Food Cost");
    XLSX.writeFile(wb, `food-cost-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`تم تصدير ${rows.length} وصفة`);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">متابعة Food Cost</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            نسبة تكلفة الوصفات محدّثة لحظياً بناءً على آخر أسعار الشراء
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50">
            <Download className="w-3.5 h-3.5" /> تصدير Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
        </div>
      </div>

      {/* Loss Alert Banner */}
      {stats.loss > 0 && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              ⚠ {stats.loss} وصفة تُباع بخسارة — إجمالي الخسارة: {fmtAED(stats.lossValue)} لكل وحدة مباعة
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              سعر البيع أقل من تكلفة الوصفة — يجب رفع السعر أو خفض التكلفة فوراً
            </p>
          </div>
          <Button size="sm" variant="outline" className="border-red-400 text-red-700 hover:bg-red-100 shrink-0"
            onClick={() => setFilterZone(filterZone === "loss" ? "all" : "loss")}>
            عرض فقط
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Average FC% */}
        <div className="rounded-xl border bg-card p-4 space-y-1 col-span-1">
          <p className="text-xs text-muted-foreground">متوسط Food Cost</p>
          <p className={`text-2xl font-bold ${stats.avg <= 30 ? "text-emerald-600" : stats.avg <= 40 ? "text-amber-500" : "text-red-600"}`}>
            {stats.avg.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">{stats.total} وصفة</p>
          <div className="w-full h-1.5 bg-muted rounded-full mt-1">
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(100, stats.avg)}%`, backgroundColor: stats.avg <= 30 ? "#10b981" : stats.avg <= 40 ? "#f59e0b" : "#ef4444" }} />
          </div>
        </div>
        {/* Loss items */}
        <div className={`rounded-xl border p-4 space-y-1 cursor-pointer transition-all hover:shadow-md ${filterZone === "loss" ? "ring-2 ring-red-500 shadow-md" : ""} ${stats.loss > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20" : "bg-card"}`}
          onClick={() => setFilterZone(filterZone === "loss" ? "all" : "loss")}>
          <p className="text-xs text-muted-foreground">بيع بخسارة</p>
          <p className={`text-2xl font-bold ${stats.loss > 0 ? "text-red-600" : "text-muted-foreground"}`}>{stats.loss}</p>
          <p className={`text-xs ${stats.loss > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
            {stats.loss > 0 ? "🔴 تحتاج تصحيح فوري" : "✓ لا توجد خسائر"}
          </p>
        </div>
        {/* Excellent */}
        <div className={`rounded-xl border bg-card p-4 space-y-1 cursor-pointer hover:border-emerald-400 transition-all hover:shadow-md ${filterZone === "excellent" ? "ring-2 ring-emerald-500 shadow-md" : ""}`}
          onClick={() => setFilterZone(filterZone === "excellent" ? "all" : "excellent")}>
          <p className="text-xs text-muted-foreground">ممتاز (≤30%)</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.excellent}</p>
          <p className="text-xs text-emerald-600">وصفة</p>
        </div>
        {/* Warning */}
        <div className={`rounded-xl border bg-card p-4 space-y-1 cursor-pointer hover:border-amber-400 transition-all hover:shadow-md ${filterZone === "warning" ? "ring-2 ring-amber-500 shadow-md" : ""}`}
          onClick={() => setFilterZone(filterZone === "warning" ? "all" : "warning")}>
          <p className="text-xs text-muted-foreground">تحذير (31–40%)</p>
          <p className="text-2xl font-bold text-amber-500">{stats.warning}</p>
          <p className="text-xs text-amber-500">وصفة</p>
        </div>
        {/* Danger */}
        <div className={`rounded-xl border bg-card p-4 space-y-1 cursor-pointer hover:border-orange-400 transition-all hover:shadow-md ${filterZone === "danger" ? "ring-2 ring-orange-500 shadow-md" : ""}`}
          onClick={() => setFilterZone(filterZone === "danger" ? "all" : "danger")}>
          <p className="text-xs text-muted-foreground">خطر (&gt;40%)</p>
          <p className="text-2xl font-bold text-orange-600">{stats.danger}</p>
          <p className="text-xs text-orange-600">وصفة</p>
        </div>
      </div>

      {/* Search + Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="ابحث عن وصفة..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" dir="rtl" />
        </div>
        <Button
          variant={showSuggested ? "default" : "outline"}
          size="sm"
          onClick={() => setShowSuggested(p => !p)}
          className="gap-1.5 text-xs"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          {showSuggested ? "إخفاء السعر المقترح" : "عرض السعر المقترح"}
        </Button>
        {(filterZone !== "all" || search) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            {filtered.length} نتيجة
            <button onClick={() => { setFilterZone("all"); setSearch(""); }} className="text-destructive hover:underline">مسح الفلاتر</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className={`grid px-4 py-2.5 text-xs font-semibold text-muted-foreground border-b bg-muted/50 ${showSuggested ? "grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_40px]" : "grid-cols-[2fr_1fr_1fr_1fr_1fr_40px]"}`}>
          <span>اسم الوصفة</span>
          <span className="text-center">سعر البيع</span>
          <span className="text-center">تكلفة الوصفة</span>
          <span className="text-center">هامش الربح</span>
          <span className="text-center">Food Cost %</span>
          {showSuggested && <span className="text-center text-amber-600 flex items-center justify-center gap-1"><Lightbulb className="w-3 h-3" /> سعر مقترح</span>}
          <span />
        </div>

        {isLoading && (
          <div className="py-16 text-center text-muted-foreground text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" /> جاري التحميل...
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="py-16 text-center text-muted-foreground text-sm">لا توجد وصفات مطابقة</div>
        )}

        {!isLoading && filtered.map((row, idx) => {
          const isExpanded = expandedIds.has(row.productId);
          const margin    = row.sellingPrice - row.totalCost;
          const marginPct = row.sellingPrice > 0 ? (margin / row.sellingPrice) * 100 : 0;
          const isLoss    = margin < 0 || row.foodCostPercent > 100;
          const suggested = row.totalCost > 0 ? row.totalCost / (FC_TARGET / 100) : 0;
          const needsRaise = suggested > row.sellingPrice + 0.5;

          return (
            <div key={row.productId} className={fcRowClass(row.foodCostPercent, margin, idx)}>
              {/* Main Row */}
              <div
                className={`grid px-4 py-3 items-center hover:bg-accent/30 transition-colors cursor-pointer border-b border-border/50 ${showSuggested ? "grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_40px]" : "grid-cols-[2fr_1fr_1fr_1fr_1fr_40px]"}`}
                onClick={() => toggleExpand(row.productId)}
              >
                {/* Name + loss badge */}
                <div className="flex items-start gap-2 pr-1">
                  <div>
                    <span className="font-medium text-sm">{row.productName}</span>
                    {isLoss && (
                      <span className="mr-2 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-bold">
                        <AlertTriangle className="w-2.5 h-2.5" /> خسارة!
                      </span>
                    )}
                  </div>
                </div>

                {/* Selling Price */}
                <span className="text-center text-sm tabular-nums">
                  {row.sellingPrice > 0 ? fmtAED(row.sellingPrice) : <span className="text-muted-foreground text-xs">غير محدد</span>}
                </span>

                {/* Recipe Cost */}
                <span className="text-center text-sm tabular-nums text-muted-foreground">
                  {fmtAED(row.totalCost)}
                </span>

                {/* Margin */}
                <span className={`text-center text-sm tabular-nums font-medium ${margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-700 dark:text-red-400 font-bold"}`}>
                  {isLoss && <AlertTriangle className="w-3 h-3 inline ml-0.5" />}
                  {fmtAED(margin)}
                  <span className={`text-xs mr-1 ${margin >= 0 ? "text-muted-foreground" : "text-red-600 font-bold"}`}>
                    ({marginPct.toFixed(1)}%)
                  </span>
                </span>

                {/* FC% badge */}
                <span className="text-center">
                  <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${fcBadgeClass(row.foodCostPercent)}`}>
                    <FcIcon pct={row.foodCostPercent} />
                    {row.foodCostPercent.toFixed(1)}%
                  </span>
                </span>

                {/* Suggested Price */}
                {showSuggested && (
                  <span className="text-center">
                    {suggested > 0 && needsRaise ? (
                      <div className="text-xs">
                        <span className="font-semibold text-amber-700 dark:text-amber-400 block">{fmtAED(suggested)}</span>
                        <span className="text-muted-foreground text-[10px]">لـ {FC_TARGET}% FC</span>
                      </div>
                    ) : suggested > 0 ? (
                      <span className="text-emerald-600 text-xs font-medium">✓ مناسب</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </span>
                )}

                {/* Expand toggle */}
                <span className="flex justify-center text-muted-foreground">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
              </div>

              {/* Expanded Ingredients */}
              {isExpanded && (
                <div className="bg-muted/30 border-b border-border/50">
                  {/* Suggested price box */}
                  {showSuggested && needsRaise && (
                    <div className="mx-4 mt-3 mb-1 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-amber-800 dark:text-amber-300">
                        <p className="font-semibold mb-0.5">توصية تسعير</p>
                        <p>لتحقيق هدف Food Cost = {FC_TARGET}%:</p>
                        <p>السعر الحالي: <strong>{fmtAED(row.sellingPrice)}</strong> → السعر المقترح: <strong className="text-amber-700">{fmtAED(suggested)}</strong></p>
                        <p className="text-muted-foreground mt-0.5">
                          زيادة: {fmtAED(suggested - row.sellingPrice)} ({((suggested - row.sellingPrice) / row.sellingPrice * 100).toFixed(1)}% رفع في السعر)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ingredients header */}
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] px-8 py-2 text-xs font-semibold text-muted-foreground border-b border-border/30">
                    <span>المكوّن</span>
                    <span className="text-center">الكمية</span>
                    <span className="text-center">الوحدة</span>
                    <span className="text-center">سعر الوحدة (د.إ) ✏️</span>
                    <span className="text-center">التكلفة الإجمالية</span>
                    <span />
                  </div>
                  {row.ingredients.length === 0 ? (
                    <div className="px-8 py-4 text-xs text-muted-foreground">لا توجد مكونات مسجّلة في هذه الوصفة</div>
                  ) : row.ingredients.map((ing) => {
                    const ingPct = row.totalCost > 0 ? (ing.ingredientCost / row.totalCost) * 100 : 0;
                    return (
                      <div key={ing.materialId} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] px-8 py-2 text-sm items-center border-b border-border/20 last:border-0 hover:bg-accent/20">
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground">{ing.materialName}</span>
                          {ing.lastPurchasePrice === 0 && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">بدون سعر</span>
                          )}
                          {/* Contribution bar */}
                          {ingPct > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, ingPct)}%` }} />
                              </div>
                              <span>{ingPct.toFixed(0)}%</span>
                            </div>
                          )}
                        </span>
                        <span className="text-center tabular-nums">{ing.recipeQty}</span>
                        <span className="text-center text-muted-foreground">{ing.unit}</span>
                        <span className="text-center tabular-nums">
                          <PriceCell materialId={ing.materialId} materialName={ing.materialName} currentPrice={ing.lastPurchasePrice} onUpdated={() => {}} />
                        </span>
                        <span className={`text-center tabular-nums font-medium ${ingPct > 40 ? "text-orange-600" : ""}`}>
                          {fmtAED(ing.ingredientCost)}
                          {ingPct > 40 && <span className="block text-[10px] text-orange-500">{ingPct.toFixed(0)}% من التكلفة</span>}
                        </span>
                        <span />
                      </div>
                    );
                  })}
                  {/* Totals row */}
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_40px] px-8 py-2.5 text-sm font-semibold bg-muted/50 border-t border-border/40">
                    <span className="text-muted-foreground">إجمالي التكلفة</span>
                    <span /><span /><span />
                    <span className="text-center tabular-nums text-amber-600 text-base">{fmtAED(row.totalCost)}</span>
                    <span />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Table footer summary */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2.5 bg-muted/40 border-t text-xs text-muted-foreground flex items-center justify-between">
            <span>عرض {filtered.length} من {stats.total} وصفة</span>
            <span>متوسط FC%: <strong className={stats.avg <= 30 ? "text-emerald-600" : stats.avg <= 40 ? "text-amber-600" : "text-red-600"}>{stats.avg.toFixed(1)}%</strong></span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />ممتاز ≤30%</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />تحذير 31–40%</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />خطر &gt;40%</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-700 inline-block" />خسارة (تكلفة &gt; سعر بيع)</span>
        <span className="mr-4 opacity-70">✏️ اضغط على السعر لتعديله مباشرة</span>
        <span className="opacity-70"><Lightbulb className="w-3 h-3 inline ml-0.5" />السعر المقترح لتحقيق {FC_TARGET}% FC</span>
      </div>
    </div>
  );
}
