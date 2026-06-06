import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/NumericInput";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Search,
  AlertTriangle,
  ChefHat,
  Package,
  FlaskConical,
  Filter,
  Download,
  TrendingDown,
  BarChart2,
  X,
  Flame,
} from "lucide-react";
import { Pagination, usePagination } from "@/components/Pagination";
import * as XLSX from "xlsx";

// ─── Waste reason categories ──────────────────────────────────────────────────
const WASTE_REASONS = [
  { value: "end_of_day",    label: "هدر نهاية اليوم",    color: "bg-slate-100 text-slate-600" },
  { value: "overproduction", label: "فائض إنتاج",         color: "bg-amber-100 text-amber-700" },
  { value: "spoilage",      label: "تلف / فساد",          color: "bg-red-100 text-red-700" },
  { value: "expired",       label: "انتهاء صلاحية",      color: "bg-orange-100 text-orange-700" },
  { value: "spillage",      label: "انسكاب",              color: "bg-blue-100 text-blue-700" },
  { value: "prep_error",    label: "خطأ في التحضير",     color: "bg-purple-100 text-purple-700" },
  { value: "storage_damage",label: "تلف في التخزين",    color: "bg-rose-100 text-rose-700" },
  { value: "trimming",      label: "هوامش تقطيع",        color: "bg-yellow-100 text-yellow-700" },
  { value: "other",         label: "أخرى",               color: "bg-gray-100 text-gray-600" },
];

function reasonLabel(r: string | null) {
  return WASTE_REASONS.find(x => x.value === r)?.label ?? r ?? "—";
}
function reasonColor(r: string | null) {
  return WASTE_REASONS.find(x => x.value === r)?.color ?? "bg-gray-100 text-gray-600";
}
function fmtAED(n: number) {
  return `${n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type WasteLog = {
  id: number;
  wasteDate: Date;
  materialId: number;
  materialName: string;
  materialNameAr: string | null;
  unit: string;
  wasteQty: string;
  unitCost: string | null;
  totalCost: string | null;
  source: "kitchen" | "raw_material" | "semi_finished";
  referenceId: number | null;
  reason: string | null;
  notes: string | null;
  createdAt: Date;
  pulledQuantity?: string | null;
  rawUsedForWaste?: string | null;
  recipeCostPerUnit?: string | null;
};

const SOURCE_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  kitchen: {
    label: "هدر المطبخ",
    color: "text-orange-500 border-orange-500/40 bg-orange-500/10",
    icon: <ChefHat size={12} />,
  },
  raw_material: {
    label: "هدر مواد خام",
    color: "text-blue-500 border-blue-500/40 bg-blue-500/10",
    icon: <Package size={12} />,
  },
  semi_finished: {
    label: "هدر مواد مصنّعة",
    color: "text-purple-500 border-purple-500/40 bg-purple-500/10",
    icon: <FlaskConical size={12} />,
  },
};

function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_LABELS[source];
  if (!s) return null;
  return (
    <Badge variant="outline" className={`${s.color} text-xs gap-1`}>
      {s.icon}
      {s.label}
    </Badge>
  );
}

// ─── Add Waste Dialog ─────────────────────────────────────────────────────────
function AddWasteDialog({
  open,
  onClose,
  onSave,
  materials,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    wasteDate: string;
    materialId: number;
    materialName: string;
    materialNameAr?: string;
    unit: string;
    wasteQty: string;
    unitCost?: string;
    source: "kitchen" | "raw_material" | "semi_finished";
    reason?: string;
    notes?: string;
  }) => void;
  materials: { id: number; name: string; nameAr?: string; unit: string; type: string; currentQuantity?: string }[];
}) {
  const today = new Date().toISOString().split("T")[0];
  const [wasteDate, setWasteDate] = useState(today);
  const [matId, setMatId] = useState("");
  const [matSearch, setMatSearch] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [source, setSource] = useState<"kitchen" | "raw_material" | "semi_finished">("raw_material");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const filtered = useMemo(() =>
    materials.filter((m) => {
      if (!matSearch) return true;
      const q = matSearch.toLowerCase();
      return m.name.toLowerCase().includes(q) || (m.nameAr && m.nameAr.includes(matSearch));
    }),
    [materials, matSearch]
  );

  const handleSave = () => {
    if (!matId || !wasteQty || !wasteDate) {
      toast.error("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }
    const mat = materials.find((m) => String(m.id) === matId);
    if (!mat) return;
    onSave({
      wasteDate,
      materialId: mat.id,
      materialName: mat.name,
      materialNameAr: mat.nameAr,
      unit: mat.unit,
      wasteQty,
      unitCost: unitCost || undefined,
      source,
      reason: reason || undefined,
      notes: notes || undefined,
    });
    // Reset
    setMatId("");
    setWasteQty("");
    setUnitCost("");
    setReason("");
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>تسجيل هدر جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">التاريخ *</label>
              <Input
                type="date"
                value={wasteDate}
                onChange={(e) => setWasteDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">المصدر *</label>
              <Select value={source} onValueChange={(v) => setSource(v as any)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw_material">هدر مواد خام</SelectItem>
                  <SelectItem value="semi_finished">هدر مواد مصنّعة</SelectItem>
                  <SelectItem value="kitchen">هدر المطبخ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Material selector */}
          <div>
            <label className="text-xs font-medium mb-1 block">المادة *</label>
            <Select value={matId} onValueChange={setMatId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="اختر المادة" />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                  <div className="relative">
                    <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="w-full h-7 text-xs pr-7 pl-2 rounded border border-border bg-background focus:outline-none"
                      placeholder="ابحث..."
                      value={matSearch}
                      onChange={(e) => setMatSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
                {filtered.length === 0 ? (
                  <div className="py-3 text-center text-xs text-muted-foreground">لا توجد نتائج</div>
                ) : (
                  filtered.map((m) => (
                    <SelectItem key={`${m.type}-${m.id}`} value={String(m.id)}>
                      <span className="flex items-center gap-2">
                        {m.type === "semi_finished" ? (
                          <FlaskConical size={12} className="text-purple-400" />
                        ) : (
                          <Package size={12} className="text-blue-400" />
                        )}
                        {m.nameAr || m.name}
                        <span className="text-muted-foreground text-xs">({m.unit})</span>
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">الكمية المهدرة *</label>
              <NumericInput
                
                value={wasteQty}
                onChange={(e) => setWasteQty(e.target.value)}
                placeholder="0.000"
                step="0.001"
                min="0"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">تكلفة الوحدة (اختياري)</label>
              <NumericInput
                
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-1 block">سبب الهدر *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="اختر السبب..." />
              </SelectTrigger>
              <SelectContent>
                {WASTE_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className={`inline-flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded ${r.color}`}>
                      {r.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">ملاحظات</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية (اختياري)"
              className="h-9 text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}>تسجيل الهدر</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WastePage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);
  const [sourceFilter, setSourceFilter] = useState<"all" | "kitchen" | "raw_material" | "semi_finished">("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [wastePage, setWastePage] = useState(1);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const utils = trpc.useUtils();

  const { data: wasteLogs = [], isLoading } = trpc.waste.list.useQuery({
    from: fromDate,
    to: toDate,
    source: sourceFilter === "all" ? undefined : sourceFilter,
  });
  const wastePagination = usePagination(wasteLogs as WasteLog[], 15);
  const pagedWaste = wastePagination.paginate(wastePage);

  const { data: rawMats = [] } = trpc.materials.list.useQuery();
  const { data: semiMats = [] } = trpc.semiFinished.list.useQuery();

  const allMaterials = useMemo(() => [
    ...(rawMats as any[]).filter((m) => m.isActive).map((m) => ({ ...m, type: "raw" as const })),
    ...(semiMats as any[]).filter((m) => m.isActive).map((m) => ({ ...m, type: "semi_finished" as const })),
  ], [rawMats, semiMats]);

  const addWaste = trpc.waste.add.useMutation({
    onSuccess: () => {
      utils.waste.list.invalidate();
      utils.materials.list.invalidate();
      toast.success("تم تسجيل الهدر وخصم الكمية من المخزون");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteWaste = trpc.waste.delete.useMutation({
    onSuccess: () => {
      utils.waste.list.invalidate();
      utils.materials.list.invalidate();
      toast.success("تم حذف سجل الهدر وإعادة الكمية للمخزون");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── filtered list ────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    return (wasteLogs as WasteLog[]).filter(w => {
      if (reasonFilter !== "all" && w.reason !== reasonFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (w.materialNameAr || w.materialName).toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [wasteLogs, reasonFilter, search]);

  const wastePagination2 = usePagination(filteredLogs, 15);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const allLogs = wasteLogs as WasteLog[];
  const totalWasteQty  = allLogs.reduce((s, w) => s + parseFloat(w.wasteQty), 0);
  const totalWasteCost = allLogs.reduce((s, w) => {
    const wq = parseFloat(w.wasteQty ?? "0");
    if ((w.source === "semi_finished" || w.source === "kitchen") && w.recipeCostPerUnit)
      return s + parseFloat(w.recipeCostPerUnit) * wq;
    return s + parseFloat(w.totalCost ?? "0");
  }, 0);
  const bySource = {
    kitchen:      allLogs.filter(w => w.source === "kitchen").length,
    raw_material: allLogs.filter(w => w.source === "raw_material").length,
    semi_finished:allLogs.filter(w => w.source === "semi_finished").length,
  };
  const byCostSource = {
    kitchen:      allLogs.filter(w => w.source === "kitchen").reduce((s, w) => s + (parseFloat(w.recipeCostPerUnit ?? "0") * parseFloat(w.wasteQty)), 0),
    raw_material: allLogs.filter(w => w.source === "raw_material").reduce((s, w) => s + parseFloat(w.totalCost ?? "0"), 0),
    semi_finished:allLogs.filter(w => w.source === "semi_finished").reduce((s, w) => s + (parseFloat(w.recipeCostPerUnit ?? "0") * parseFloat(w.wasteQty)), 0),
  };

  // ── Top wasting materials (by cost) ──────────────────────────────────────
  const topMaterials = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; cost: number; unit: string; source: string }>();
    allLogs.forEach(w => {
      const key = w.materialId?.toString() ?? w.materialName;
      const wq = parseFloat(w.wasteQty ?? "0");
      let cost = parseFloat(w.totalCost ?? "0");
      if ((w.source === "semi_finished" || w.source === "kitchen") && w.recipeCostPerUnit)
        cost = parseFloat(w.recipeCostPerUnit) * wq;
      const existing = map.get(key);
      if (existing) { existing.qty += wq; existing.cost += cost; }
      else map.set(key, { name: w.materialNameAr || w.materialName, qty: wq, cost, unit: w.unit, source: w.source });
    });
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost).slice(0, 5);
  }, [allLogs]);

  // ── Daily average ─────────────────────────────────────────────────────────
  const daysDiff = Math.max(1, Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / 86400000));
  const dailyAvgCost = totalWasteCost / daysDiff;

  // ── Export Excel ──────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!allLogs.length) { toast.error("لا توجد بيانات للتصدير"); return; }
    const rows = allLogs.map(w => {
      const wq = parseFloat(w.wasteQty ?? "0");
      let cost = parseFloat(w.totalCost ?? "0");
      if ((w.source === "semi_finished" || w.source === "kitchen") && w.recipeCostPerUnit)
        cost = parseFloat(w.recipeCostPerUnit) * wq;
      return {
        "التاريخ": new Date(w.wasteDate).toLocaleDateString("ar-AE"),
        "المادة": w.materialNameAr || w.materialName,
        "الوحدة": w.unit,
        "المصدر": SOURCE_LABELS[w.source]?.label ?? w.source,
        "الكمية المهدرة": wq.toFixed(3),
        "تكلفة الوحدة": w.unitCost ?? "",
        "إجمالي التكلفة": cost.toFixed(2),
        "السبب": reasonLabel(w.reason),
        "ملاحظات": w.notes ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل الهدر");
    XLSX.writeFile(wb, `waste-log-${fromDate}-${toDate}.xlsx`);
    toast.success(`تم تصدير ${rows.length} سجل`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <AlertTriangle size={22} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">سجل الهدر</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              تتبع الهدر من جرد المطبخ اليومي والمخزون — المواد الخام والمصنّعة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50">
            <Download size={14} /> تصدير Excel
          </Button>
          <Button onClick={() => setShowAddDialog(true)} variant="destructive" className="gap-2">
            <Plus size={16} /> تسجيل هدر
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">من</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">إلى</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 w-40 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">المصدر</label>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <Filter size={12} className="ml-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المصادر</SelectItem>
              <SelectItem value="kitchen">هدر المطبخ</SelectItem>
              <SelectItem value="raw_material">هدر مواد خام</SelectItem>
              <SelectItem value="semi_finished">هدر مواد مصنّعة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Reason filter */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">السبب</label>
          <Select value={reasonFilter} onValueChange={v => { setReasonFilter(v); setWastePage(1); }}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue placeholder="كل الأسباب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأسباب</SelectItem>
              {WASTE_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* إجمالي السجلات */}
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">إجمالي السجلات</p>
            <p className="text-2xl font-bold mt-1">{allLogs.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{daysDiff} يوم</p>
          </CardContent>
        </Card>
        {/* تكلفة الهدر الإجمالية */}
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown size={11} className="text-red-500" /> تكلفة الهدر</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{fmtAED(totalWasteCost)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">معدّل يومي: {fmtAED(dailyAvgCost)}</p>
          </CardContent>
        </Card>
        {/* توزيع المصادر */}
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-2">توزيع التكلفة حسب المصدر</p>
            {[
              { label: "المطبخ",   cost: byCostSource.kitchen,      cnt: bySource.kitchen,      color: "bg-orange-400" },
              { label: "خام",      cost: byCostSource.raw_material,  cnt: bySource.raw_material,  color: "bg-blue-400" },
              { label: "مصنّعة",  cost: byCostSource.semi_finished, cnt: bySource.semi_finished, color: "bg-purple-400" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5 mb-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${s.color}`} />
                <span className="text-xs text-muted-foreground w-12">{s.label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${totalWasteCost > 0 ? (s.cost / totalWasteCost) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-medium w-8 text-right">{s.cnt}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top Wasting Materials */}
      {topMaterials.length > 0 && (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 border-b flex items-center gap-2">
            <BarChart2 size={14} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">أعلى المواد هدراً (حسب التكلفة)</span>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
            {topMaterials.map((m, i) => (
              <div key={i} className="flex items-start gap-2 bg-card border border-border/40 rounded-lg px-3 py-2">
                <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${i === 0 ? "bg-red-100 text-red-700" : i === 1 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{m.name}</p>
                  <p className="text-xs text-red-600 font-semibold">{fmtAED(m.cost)}</p>
                  <p className="text-[10px] text-muted-foreground">{m.qty.toFixed(3)} {m.unit}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث بالمادة..." value={search} onChange={e => { setSearch(e.target.value); setWastePage(1); }} className="pr-9 h-9 text-sm" />
          {search && <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={13} /></button>}
        </div>
        {(reasonFilter !== "all" || search) && (
          <span className="text-xs text-muted-foreground">{filteredLogs.length} نتيجة</span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : allLogs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <AlertTriangle size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد سجلات هدر في هذه الفترة</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30 text-xs text-muted-foreground">
                <th className="py-3 px-4 text-start font-medium">التاريخ</th>
                <th className="py-3 px-4 text-start font-medium">المادة</th>
                <th className="py-3 px-4 text-start font-medium">المصدر</th>
                <th className="py-3 px-4 text-start font-medium">الكمية المهدرة</th>
                <th className="py-3 px-4 text-start font-medium">تكلفة الهدر</th>
                <th className="py-3 px-4 text-start font-medium">السبب</th>
                <th className="py-3 px-4 text-start font-medium">ملاحظات</th>
                <th className="py-3 px-4 text-start font-medium">حذف</th>
              </tr>
            </thead>
            <tbody>
              {wastePagination2.paginate(wastePage).map((log) => (
                <tr key={log.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.wasteDate).toLocaleDateString("ar-EG")}
                  </td>
                  {/* المادة */}
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium">{log.materialNameAr || log.materialName}</p>
                    <p className="text-xs text-muted-foreground">{log.unit}</p>
                  </td>
                  {/* المصدر */}
                  <td className="py-3 px-4"><SourceBadge source={log.source} /></td>
                  {/* الكمية المهدرة */}
                  <td className="py-3 px-4 text-sm">
                    <span className="font-bold text-red-500">{parseFloat(log.wasteQty).toFixed(3)}</span>
                    <span className="text-red-400 text-xs mr-1">{log.unit}</span>
                    {(log as any).pulledQuantity && parseFloat((log as any).pulledQuantity) > 0 && (() => {
                      const pct = (parseFloat(log.wasteQty) / parseFloat((log as any).pulledQuantity)) * 100;
                      return (
                        <p className={`text-[10px] font-medium mt-0.5 ${pct > 15 ? "text-red-500" : pct > 8 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {pct.toFixed(1)}% من المسحوب
                        </p>
                      );
                    })()}
                  </td>
                  {/* تكلفة الهدر */}
                  <td className="py-3 px-4 text-sm font-semibold text-red-500">
                    {(() => {
                      const wq = parseFloat(log.wasteQty ?? "0");
                      let cost = 0;
                      if ((log.source === "semi_finished" || log.source === "kitchen") && log.recipeCostPerUnit)
                        cost = parseFloat(log.recipeCostPerUnit) * wq;
                      else cost = wq * (log.unitCost ? parseFloat(log.unitCost) : 0);
                      return cost > 0 ? fmtAED(cost) : <span className="text-muted-foreground font-normal text-xs">غير محسوبة</span>;
                    })()}
                  </td>
                  {/* السبب */}
                  <td className="py-3 px-4">
                    {log.reason ? (
                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium ${reasonColor(log.reason)}`}>
                        {reasonLabel(log.reason)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* ملاحظات */}
                  <td className="py-3 px-4 text-xs text-muted-foreground max-w-[120px] truncate">{log.notes || "—"}</td>
                  {/* حذف */}
                  <td className="py-3 px-4">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                      onClick={() => { if (confirm("هل تريد حذف هذا السجل؟ سيتم إعادة الكمية للمخزون.")) deleteWaste.mutate({ id: log.id }); }}>
                      <Trash2 size={13} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination currentPage={wastePage} totalPages={wastePagination2.totalPages} onPageChange={setWastePage} totalItems={wastePagination2.totalItems} pageSize={15} />
        </div>
      )}

      {/* Add Dialog */}
      <AddWasteDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSave={(data) => addWaste.mutate(data)}
        materials={allMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          nameAr: (m as any).nameAr,
          unit: m.unit,
          type: m.type,
          currentQuantity: (m as any).currentQuantity,
        }))}
      />
    </div>
  );
}
