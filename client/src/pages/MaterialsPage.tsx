import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Edit2, Plus, Package, Trash2, Search, AlertTriangle, FlaskConical,
  Sparkles, Loader2, Wand2, Eye, Archive as ArchiveIcon, ArchiveRestore,
  RotateCw, CheckCircle, XCircle, PackageX, Boxes, Wallet, FileX2, X,
  Calendar, ShoppingCart, Tag, Hash, Layers, PackagePlus, ChefHat,
  SlidersHorizontal, History, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { formatUnit, formatQtyWithUnit } from "@/lib/units";
import {
  getStockStatus, STATUS_CONFIG, estimatedStockValue, recommendedReorderQty,
  fmtCurrency, type StockStatus,
} from "@/lib/inventoryHelpers";

interface MaterialForm {
  code: string;
  name: string;
  nameAr: string;
  categoryId: string;
  unit: string;
  currentQuantity: string;
  minimumQuantity: string;
  reorderQuantity: string;
  lastPurchasePrice: string;
  notes: string;
}

const emptyForm: MaterialForm = {
  code: "",
  name: "",
  nameAr: "",
  categoryId: "",
  unit: "kg",
  currentQuantity: "0",
  minimumQuantity: "0",
  reorderQuantity: "",
  lastPurchasePrice: "",
  notes: "",
};

type StatusFilter = "all" | StockStatus;

const STATUS_FILTER_ORDER: StatusFilter[] = ["all", "available", "low", "out", "inactive"];

export default function MaterialsPage() {
  const { t, isRTL, language } = useLanguage();
  const ar = language === "ar";
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeTab, setActiveTab] = useState<"raw" | "semi">("raw");

  // ── Dialog / drawer state ─────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [archiveTarget, setArchiveTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [movementTarget, setMovementTarget] = useState<{ material: any; tab: "in" | "kitchen" | "waste" | "adjust" } | null>(null);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [enhanceOpts, setEnhanceOpts] = useState({
    updateNames: true,
    updateCodes: true,
    updateThresholds: true,
    onlyMissing: false,
  });

  const utils = trpc.useUtils();
  const materialsQuery = trpc.materials.list.useQuery({
    search: search || undefined,
    categoryId: categoryFilter !== "all" ? Number(categoryFilter) : undefined,
    includeInactive: true, // we filter active/inactive on the frontend via statusFilter
  });
  const materials = materialsQuery.data;
  const { isLoading, error, refetch } = materialsQuery;
  const inventoryKpisQuery = trpc.materials.kpis.useQuery();

  const { data: categories } = trpc.categories.list.useQuery();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = trpc.materials.create.useMutation({
    onSuccess: () => { utils.materials.list.invalidate(); toast.success(t("success") || "Added"); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.materials.update.useMutation({
    onSuccess: () => { utils.materials.list.invalidate(); toast.success(t("success") || "Updated"); closeModal(); },
    onError: (e) => toast.error(e.message),
  });

  // Archive uses the same update endpoint with isActive:false (the existing
  // `delete` endpoint also soft-deletes, but `update` keeps the semantics clear).
  const archiveMutation = trpc.materials.update.useMutation({
    onSuccess: (_data, vars) => {
      utils.materials.list.invalidate();
      toast.success(vars.isActive ? (ar ? "تم إلغاء الأرشفة" : "Restored") : (ar ? "تم أرشفة المادة" : "Archived"));
      setArchiveTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const hardDeleteMutation = trpc.materials.hardDelete.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate();
      toast.success(ar ? "تم حذف المادة نهائياً" : "Material permanently deleted");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const aiCategorizeMutation = trpc.materials.aiAutoCategorize.useMutation({
    onSuccess: (r: any) => {
      utils.materials.list.invalidate();
      utils.categories.list.invalidate();
      toast.success(
        ar
          ? `تم تصنيف ${r.categorized} مادة من ${r.totalMaterials}${r.categoriesEnsured ? ` (أُنشئ ${r.categoriesEnsured} تصنيف جديد)` : ""}`
          : `Categorized ${r.categorized} of ${r.totalMaterials}${r.categoriesEnsured ? ` (created ${r.categoriesEnsured} new categories)` : ""}`
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const aiEnhanceMutation = trpc.materials.aiEnhance.useMutation({
    onSuccess: (r: any) => {
      utils.materials.list.invalidate();
      setEnhanceOpen(false);
      toast.success(
        ar
          ? `تم تحديث ${r.enhanced} مادة من ${r.totalMaterials}${r.conflicts ? ` (${r.conflicts} كود مُعدّل لتجنب التكرار)` : ""}`
          : `Enhanced ${r.enhanced} of ${r.totalMaterials}${r.conflicts ? ` (${r.conflicts} codes adjusted for uniqueness)` : ""}`
      );
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const closeModal = () => { setShowModal(false); setEditItem(null); setForm(emptyForm); };
  const openAdd = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      code: item.code || "",
      name: item.name || "",
      nameAr: item.nameAr || "",
      categoryId: item.categoryId ? String(item.categoryId) : "",
      unit: item.unit || "kg",
      currentQuantity: String(item.currentQuantity ?? 0),
      minimumQuantity: String(item.minimumQuantity ?? 0),
      reorderQuantity: item.reorderQuantity != null ? String(item.reorderQuantity) : "",
      lastPurchasePrice: item.lastPurchasePrice != null ? String(item.lastPurchasePrice) : "",
      notes: item.notes || "",
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return;
    const payload: any = {
      code: form.code.trim(),
      name: form.name.trim(),
      nameAr: form.nameAr.trim() || undefined,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      unit: form.unit.trim() || "kg",
      minimumQuantity: Number(form.minimumQuantity) || 0,
      reorderQuantity: form.reorderQuantity ? Number(form.reorderQuantity) : undefined,
      notes: form.notes.trim() || undefined,
    };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...payload });
    } else {
      createMutation.mutate({
        ...payload,
        currentQuantity: Number(form.currentQuantity) || 0,
        lastPurchasePrice: form.lastPurchasePrice ? Number(form.lastPurchasePrice) : undefined,
      });
    }
  };

  const clearAllFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };
  const hasActiveFilters = search.trim().length > 0 || categoryFilter !== "all" || statusFilter !== "all";

  // ── Derived: split raw vs semi, apply status + search-secondary filters ──
  const filteredAll = useMemo(() => {
    if (!materials) return [] as any[];
    return materials.filter((m: any) => {
      if (statusFilter !== "all") {
        const s = getStockStatus(m);
        if (s !== statusFilter) return false;
      }
      return true;
    });
  }, [materials, statusFilter]);

  const { rawList, semiList } = useMemo(() => {
    const raw: any[] = [];
    const semi: any[] = [];
    filteredAll.forEach((m: any) => {
      if (m.materialType === "semi_finished") semi.push(m);
      else raw.push(m);
    });
    return { rawList: raw, semiList: semi };
  }, [filteredAll]);

  const activeList = activeTab === "raw" ? rawList : semiList;

  // ── KPI computation (dynamic per active tab + filters) ────────────────────
  const kpis = useMemo(() => {
    const total = activeList.length;
    let available = 0, low = 0, out = 0, inactive = 0;
    let value = 0;
    activeList.forEach((m: any) => {
      const s = getStockStatus(m);
      if (s === "available") available++;
      else if (s === "low") low++;
      else if (s === "out") out++;
      else if (s === "inactive") inactive++;
      value += estimatedStockValue(m.currentQuantity, m.lastPurchasePrice);
    });
    return { total, available, low, out, inactive, value };
  }, [activeList]);

  // ── Stock value split: always raw vs semi regardless of active tab ──────────
  // Sourced from the backend (getInventoryKpis) to match the dashboard exactly:
  //  - raw materials: qty × last purchase price (qty > 0 only)
  //  - semi-finished: open-pulled qty × actual recipe cost (NOT last purchase
  //    price, which is meaningless for items produced in-house, not bought)
  const rawStockValue = inventoryKpisQuery.data?.rawMaterialsTotalValue ?? 0;
  const semiStockValue = inventoryKpisQuery.data?.semiFinishedTotalValue ?? 0;

  // ── Renderers ─────────────────────────────────────────────────────────────
  const renderStatusBadge = (m: any) => {
    const s = getStockStatus(m);
    const cfg = STATUS_CONFIG[s];
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
        {ar ? cfg.labelAr : cfg.labelEn}
      </span>
    );
  };

  const renderRow = (m: any) => {
    const catName = categories?.find((c: any) => c.id === m.categoryId);
    const status = getStockStatus(m);
    const isInactive = status === "inactive";
    const value = estimatedStockValue(m.currentQuantity, m.lastPurchasePrice);
    const lastPurchase = m.updatedAt ? new Date(m.updatedAt) : null;
    return (
      <tr
        key={m.id}
        className={`border-t border-border hover:bg-muted/30 cursor-pointer ${isInactive ? "opacity-60" : ""}`}
        onClick={() => setViewId(m.id)}
      >
        <td className="px-4 py-3">{renderStatusBadge(m)}</td>
        <td className="px-4 py-3 font-mono text-xs" dir="ltr">{m.code || "—"}</td>
        <td className="px-4 py-3 font-medium">
          {ar && m.nameAr ? m.nameAr : (m.name || m.nameAr || "—")}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {catName ? (ar && catName.nameAr ? catName.nameAr : catName.name) : "—"}
        </td>
        <td className={`px-4 py-3 ${status === "low" || status === "out" ? "text-amber-600 font-semibold" : ""}`}>
          {formatQtyWithUnit(m.currentQuantity, m.unit, ar ? "ar" : "en")}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {formatQtyWithUnit(m.minimumQuantity, m.unit, ar ? "ar" : "en")}
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {m.lastPurchasePrice != null ? fmtCurrency(m.lastPurchasePrice, ar ? "ar" : "en") : "—"}
        </td>
        <td className="px-4 py-3 font-medium">
          {value > 0 ? fmtCurrency(value, ar ? "ar" : "en") : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
          {lastPurchase ? lastPurchase.toLocaleDateString(ar ? "ar-AE" : "en-AE", { year: "numeric", month: "short", day: "numeric" }) : "—"}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className={`flex gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
            <Button
              variant="ghost" size="sm"
              onClick={() => setViewId(m.id)}
              className="h-8 w-8 p-0 hover:text-emerald-600"
              title={ar ? "عرض" : "View"}
            >
              <Eye size={14} />
            </Button>
            {canWrite && (
              <>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => openEdit(m)}
                  className="h-8 w-8 p-0 hover:text-blue-600"
                  title={ar ? "تعديل" : "Edit"}
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setArchiveTarget(m)}
                  className={`h-8 w-8 p-0 ${isInactive ? "hover:text-emerald-600" : "hover:text-amber-600"}`}
                  title={isInactive ? (ar ? "إلغاء الأرشفة" : "Restore") : (ar ? "أرشفة" : "Archive")}
                >
                  {isInactive ? <ArchiveRestore size={14} /> : <ArchiveIcon size={14} />}
                </Button>
                {isInactive && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setDeleteTarget(m)}
                    className="h-8 w-8 p-0 hover:text-red-600"
                    title={ar ? "حذف نهائي" : "Permanently delete"}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
                {!isInactive && (
                  <>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setMovementTarget({ material: m, tab: "in" })}
                      className="h-8 w-8 p-0 hover:text-emerald-600"
                      title={ar ? "إضافة وارد" : "Add Stock"}
                    >
                      <PackagePlus size={14} />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setMovementTarget({ material: m, tab: "kitchen" })}
                      className="h-8 w-8 p-0 hover:text-orange-600"
                      title={ar ? "صرف للمطبخ" : "Issue to Kitchen"}
                    >
                      <ChefHat size={14} />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setMovementTarget({ material: m, tab: "waste" })}
                      className="h-8 w-8 p-0 hover:text-red-600"
                      title={ar ? "تسجيل هالك" : "Record Waste"}
                    >
                      <PackageX size={14} />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setMovementTarget({ material: m, tab: "adjust" })}
                      className="h-8 w-8 p-0 hover:text-purple-600"
                      title={ar ? "تسوية مخزون" : "Stock Adjustment"}
                    >
                      <SlidersHorizontal size={14} />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderTableHead = () => (
    <thead className="bg-muted/40 text-muted-foreground">
      <tr className={isRTL ? "text-right" : "text-left"}>
        <th className="px-4 py-3 font-medium">{ar ? "الحالة" : "Status"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "الكود" : "Code"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "الاسم" : "Name"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "التصنيف" : "Category"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "الكمية الحالية" : "Current Qty"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "الحد الأدنى" : "Min"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "آخر سعر" : "Last Price"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "قيمة المخزون" : "Stock Value"}</th>
        <th className="px-4 py-3 font-medium">{ar ? "آخر شراء" : "Last Purchase"}</th>
        <th className="px-4 py-3 font-medium w-32">{ar ? "الإجراءات" : "Actions"}</th>
      </tr>
    </thead>
  );

  const renderSkeleton = () => (
    [...Array(4)].map((_, i) => (
      <tr key={i} className="border-t border-border">
        <td colSpan={10} className="px-4 py-3">
          <div className="h-4 bg-muted rounded animate-pulse" />
        </td>
      </tr>
    ))
  );

  const renderEmptyNoData = (label: string) => (
    <tr>
      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
        <Package size={36} className="mx-auto mb-2 opacity-30" />
        <p>{label}</p>
      </td>
    </tr>
  );

  const renderEmptyFiltered = () => (
    <tr>
      <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
        <FileX2 size={36} className="mx-auto mb-2 opacity-30" />
        <p className="mb-3">{ar ? "لا توجد نتائج مطابقة للفلتر" : "No materials match the current filters"}</p>
        <Button variant="outline" size="sm" onClick={clearAllFilters} className="gap-1">
          <X size={13} /> {ar ? "مسح الفلاتر" : "Clear filters"}
        </Button>
      </td>
    </tr>
  );

  const statusLabel = (s: StatusFilter): string => {
    if (s === "all") return ar ? "كل الحالات" : "All Statuses";
    return ar ? STATUS_CONFIG[s].labelAr : STATUS_CONFIG[s].labelEn;
  };

  // ── KPI Card primitive ────────────────────────────────────────────────────
  const KpiCard = ({ label, value, icon, iconClass, sub }: {
    label: string; value: string | number; icon: React.ReactNode; iconClass: string; sub?: string;
  }) => (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition-all">
      <div className={`flex items-start justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          {icon}
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in" dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Header ── */}
      <div className={`flex items-center justify-between flex-wrap gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold text-foreground">{t("materials") || (ar ? "المواد الخام" : "Raw Materials")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ar ? "إدارة شاملة للمواد الخام والمصنّعة" : "Comprehensive raw & semi-finished material management"}
          </p>
        </div>
        {canWrite && (
          <div className={`flex gap-2 flex-wrap ${isRTL ? "flex-row-reverse" : ""}`}>
            <Button
              variant="outline"
              onClick={() => aiCategorizeMutation.mutate({ onlyUncategorized: true })}
              disabled={aiCategorizeMutation.isPending}
              className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-950/30"
              title={ar ? "تصنيف المواد غير المُصنّفة باستخدام OpenAI" : "Auto-categorize uncategorized materials via OpenAI"}
            >
              {aiCategorizeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {aiCategorizeMutation.isPending
                ? (ar ? "جاري التصنيف..." : "Categorizing...")
                : (ar ? "تصنيف بالذكاء" : "AI Categorize")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setEnhanceOpen(true)}
              disabled={aiEnhanceMutation.isPending}
              className="gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-950/30"
              title={ar ? "تحسين الأسماء والأكواد والحد الأدنى بالذكاء الاصطناعي" : "AI-enhance names, codes, and thresholds"}
            >
              {aiEnhanceMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              {aiEnhanceMutation.isPending
                ? (ar ? "جاري التحسين..." : "Enhancing...")
                : (ar ? "تحسين بالذكاء" : "AI Enhance")}
            </Button>
            <Button onClick={openAdd} className="gap-2">
              <Plus size={16} />
              {ar ? "إضافة مادة" : "Add Material"}
            </Button>
          </div>
        )}
      </div>

      {/* ── KPI Cards (dynamic per active tab) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label={ar ? "إجمالي المواد" : "Total Materials"}
          value={kpis.total}
          icon={<Boxes size={18} />}
          iconClass="bg-blue-100 text-blue-600 dark:bg-blue-950/40"
          sub={kpis.inactive > 0 ? (ar ? `${kpis.inactive} غير مفعّل` : `${kpis.inactive} inactive`) : undefined}
        />
        <KpiCard
          label={ar ? "مواد متوفرة" : "Available"}
          value={kpis.available}
          icon={<CheckCircle size={18} />}
          iconClass={STATUS_CONFIG.available.iconClass}
        />
        <KpiCard
          label={ar ? "مواد منخفضة" : "Low Stock"}
          value={kpis.low}
          icon={<AlertTriangle size={18} />}
          iconClass={STATUS_CONFIG.low.iconClass}
        />
        <KpiCard
          label={ar ? "مواد نافدة" : "Out of Stock"}
          value={kpis.out}
          icon={<PackageX size={18} />}
          iconClass={STATUS_CONFIG.out.iconClass}
        />
        <KpiCard
          label={ar ? "قيمة مخزون الخام" : "Raw Stock Value"}
          value={fmtCurrency(rawStockValue, ar ? "ar" : "en")}
          icon={<Wallet size={18} />}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40"
          sub={ar ? "المواد الخام فقط" : "Raw materials only"}
        />
        <KpiCard
          label={ar ? "قيمة مخزون المصنّعة" : "Semi-Finished Value"}
          value={fmtCurrency(semiStockValue, ar ? "ar" : "en")}
          icon={<FlaskConical size={18} />}
          iconClass="bg-purple-100 text-purple-600 dark:bg-purple-950/40"
          sub={ar ? "المواد المصنّعة فقط" : "Semi-finished only"}
        />
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className={`grid grid-cols-1 md:grid-cols-12 gap-3 ${isRTL ? "" : ""}`}>
          {/* Search */}
          <div className="md:col-span-5 relative">
            <Search size={16} className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={ar ? "بحث بالاسم أو الكود..." : "Search by name or code..."}
              className={isRTL ? "pr-9 text-right" : "pl-9"}
            />
          </div>
          {/* Category */}
          <div className="md:col-span-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className={categoryFilter !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}>
                <SelectValue placeholder={ar ? "كل التصنيفات" : "All Categories"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ar ? "كل التصنيفات" : "All Categories"}</SelectItem>
                {categories?.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {ar && c.nameAr ? c.nameAr : c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Status */}
          <div className="md:col-span-3">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className={statusFilter !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}>
                <SelectValue placeholder={statusLabel("all")} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Clear */}
          <div className="md:col-span-1 flex">
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearAllFilters} className="w-full gap-1">
                <X size={14} />
                {ar ? "مسح" : "Clear"}
              </Button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className={`flex flex-wrap gap-1.5 pt-2 border-t border-border/60 items-center`}>
            <span className="text-[11px] text-muted-foreground font-medium me-1">{ar ? "فلاتر نشطة:" : "Active filters:"}</span>
            {search.trim() && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                {ar ? "بحث:" : "Search:"} {search}
                <button onClick={() => setSearch("")} className="hover:text-destructive"><X size={10}/></button>
              </span>
            )}
            {categoryFilter !== "all" && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                {(() => {
                  const c = categories?.find((c: any) => String(c.id) === categoryFilter);
                  return c ? (ar && c.nameAr ? c.nameAr : c.name) : categoryFilter;
                })()}
                <button onClick={() => setCategoryFilter("all")} className="hover:text-destructive"><X size={10}/></button>
              </span>
            )}
            {statusFilter !== "all" && (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[statusFilter].badgeClass}`}>
                {statusLabel(statusFilter)}
                <button onClick={() => setStatusFilter("all")} className="hover:text-destructive"><X size={10}/></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs: Raw / Semi-Finished ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "raw" | "semi")} className="w-full" dir={isRTL ? "rtl" : "ltr"}>
        <div className={`flex items-center gap-3 flex-wrap ${isRTL ? "flex-row-reverse" : ""}`}>
        <TabsList className="grid grid-cols-2 w-full sm:w-[480px]">
          <TabsTrigger value="raw" className="gap-2">
            <Package size={15} />
            {ar ? "المواد الخام" : "Raw Materials"}
            <span className="ms-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[11px] font-semibold">
              {rawList.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="semi" className="gap-2">
            <FlaskConical size={15} />
            {ar ? "المواد المصنّعة" : "Semi-Finished"}
            <span className="ms-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[11px] font-semibold">
              {semiList.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Archive toggle */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
            ${statusFilter === "inactive"
              ? "bg-amber-100 dark:bg-amber-950/40 border-amber-400 text-amber-700 dark:text-amber-300"
              : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
        >
          <ArchiveIcon size={13} />
          {ar ? "عرض الأرشيف" : "Show Archived"}
          {kpis.inactive > 0 && (
            <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
              ${statusFilter === "inactive" ? "bg-amber-600 text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}>
              {kpis.inactive}
            </span>
          )}
        </button>
        </div>

        {(["raw", "semi"] as const).map((tab) => {
          const list = tab === "raw" ? rawList : semiList;
          const emptyMsg = tab === "raw"
            ? (ar ? "لا توجد مواد خام" : "No raw materials")
            : (ar ? "لا توجد مواد مصنّعة" : "No semi-finished materials");
          const desc = tab === "raw"
            ? (ar ? "المواد بدون مكونات (تُشترى مباشرة)" : "Materials with no recipe (purchased directly)")
            : (ar ? "المواد التي لها مكونات (يتم تصنيعها من مواد خام)" : "Materials with a recipe (produced from raw materials)");
          return (
            <TabsContent key={tab} value={tab} className="mt-4">
              <p className={`text-xs text-muted-foreground mb-2 ${isRTL ? "text-right" : ""}`}>{desc}</p>
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    {renderTableHead()}
                    <tbody>
                      {error ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                            <AlertTriangle size={36} className="mx-auto mb-2 text-red-500 opacity-70" />
                            <p className="mb-1 text-red-600 dark:text-red-400 font-medium">
                              {ar ? "حدث خطأ أثناء تحميل البيانات" : "Failed to load materials"}
                            </p>
                            <p className="text-xs mb-3">{error.message}</p>
                            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
                              <RotateCw size={13} /> {ar ? "إعادة المحاولة" : "Retry"}
                            </Button>
                          </td>
                        </tr>
                      ) : isLoading
                        ? renderSkeleton()
                        : list.length === 0
                          ? (hasActiveFilters ? renderEmptyFiltered() : renderEmptyNoData(emptyMsg))
                          : list.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* ── Details Drawer ── */}
      <MaterialDetailsDrawer
        materialId={viewId}
        onClose={() => setViewId(null)}
        onEdit={(m) => { setViewId(null); openEdit(m); }}
        onArchive={(m) => { setViewId(null); setArchiveTarget(m); }}
        onMovement={(m, tab) => { setViewId(null); setMovementTarget({ material: m, tab }); }}
        ar={ar}
        isRTL={isRTL}
        categories={categories ?? []}
        canWrite={canWrite}
      />

      {/* ── Add/Edit Dialog ── */}
      <Dialog open={showModal} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-2xl" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>
              {editItem ? (ar ? "تعديل مادة" : "Edit Material") : (ar ? "إضافة مادة" : "Add Material")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{ar ? "الكود" : "Code"} *</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} required />
              </div>
              <div>
                <Label>{ar ? "الوحدة" : "Unit"} *</Label>
                <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{ar ? "الاسم (إنجليزي)" : "Name (English)"} *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <Label>{ar ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
                <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} dir="rtl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{ar ? "التصنيف" : "Category"}</Label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="">—</option>
                  {categories?.map((c: any) => (
                    <option key={c.id} value={c.id}>{ar && c.nameAr ? c.nameAr : c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{ar ? "الكمية الحالية" : "Current Qty"}</Label>
                <Input
                  type="number" step="0.001" min="0"
                  value={form.currentQuantity}
                  onChange={(e) => setForm((f) => ({ ...f, currentQuantity: e.target.value }))}
                  disabled={!!editItem}
                />
                {editItem && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {ar ? "استخدم Stock In/Out لتعديل الكمية" : "Use Stock In/Out to change qty"}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{ar ? "الحد الأدنى" : "Minimum Qty"}</Label>
                <Input type="number" step="0.001" min="0" value={form.minimumQuantity} onChange={(e) => setForm((f) => ({ ...f, minimumQuantity: e.target.value }))} />
              </div>
              <div>
                <Label>{ar ? "كمية إعادة الطلب" : "Reorder Qty"}</Label>
                <Input type="number" step="0.001" min="0" value={form.reorderQuantity} onChange={(e) => setForm((f) => ({ ...f, reorderQuantity: e.target.value }))} />
              </div>
            </div>
            {!editItem && (
              <div>
                <Label>{ar ? "آخر سعر شراء" : "Last Purchase Price"}</Label>
                <Input type="number" step="0.001" min="0" value={form.lastPurchasePrice} onChange={(e) => setForm((f) => ({ ...f, lastPurchasePrice: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>{ar ? "ملاحظات" : "Notes"}</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
              <Button type="button" variant="outline" onClick={closeModal}>{t("cancel") || "Cancel"}</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) ? (t("loading") || "...") : (t("save") || "Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── AI Enhance Dialog ── */}
      <Dialog open={enhanceOpen} onOpenChange={setEnhanceOpen}>
        <DialogContent className="max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 size={18} className="text-indigo-600" />
              {ar ? "تحسين المواد بالذكاء الاصطناعي" : "AI-Enhance Materials"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {ar
                ? "سيقوم OpenAI بتحسين الأسماء وتوليد أكواد احترافية واقتراح حد أدنى منطقي لكل مادة. اختر الحقول المراد تحديثها:"
                : "OpenAI will improve names, generate professional codes, and suggest sensible thresholds. Pick what to update:"}
            </p>

            <div className="space-y-3 border border-border rounded-lg p-3 bg-muted/20">
              <label className={`flex items-start gap-2 cursor-pointer ${isRTL ? "flex-row-reverse text-right" : ""}`}>
                <Checkbox
                  checked={enhanceOpts.updateNames}
                  onCheckedChange={(v) => setEnhanceOpts((o) => ({ ...o, updateNames: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{ar ? "تحسين الأسماء (عربي + إنجليزي)" : "Improve names (Ar + En)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {ar ? "توحيد التسمية وتنظيف الأخطاء الإملائية" : "Standardize and fix spelling"}
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-2 cursor-pointer ${isRTL ? "flex-row-reverse text-right" : ""}`}>
                <Checkbox
                  checked={enhanceOpts.updateCodes}
                  onCheckedChange={(v) => setEnhanceOpts((o) => ({ ...o, updateCodes: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{ar ? "توليد أكواد احترافية (SKU)" : "Generate professional codes"}</div>
                  <div className="text-xs text-muted-foreground">
                    {ar ? "مثال: VEG-TOM-001 للطماطم" : "e.g. VEG-TOM-001 for tomato"}
                  </div>
                </div>
              </label>

              <label className={`flex items-start gap-2 cursor-pointer ${isRTL ? "flex-row-reverse text-right" : ""}`}>
                <Checkbox
                  checked={enhanceOpts.updateThresholds}
                  onCheckedChange={(v) => setEnhanceOpts((o) => ({ ...o, updateThresholds: !!v }))}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">{ar ? "اقتراح الحد الأدنى وكمية إعادة الطلب" : "Suggest min & reorder qty"}</div>
                  <div className="text-xs text-muted-foreground">
                    {ar ? "بناءً على نوع المادة والاستهلاك المعتاد" : "Based on material type and typical usage"}
                  </div>
                </div>
              </label>
            </div>

            <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? "flex-row-reverse" : ""}`}>
              <Checkbox
                checked={enhanceOpts.onlyMissing}
                onCheckedChange={(v) => setEnhanceOpts((o) => ({ ...o, onlyMissing: !!v }))}
              />
              <span className="text-sm">
                {ar ? "فقط المواد التي تنقصها هذه الحقول" : "Only materials missing these fields"}
              </span>
            </label>

            <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <span className="text-amber-900 dark:text-amber-200">
                {ar
                  ? "العملية ستستبدل القيم الحالية. ينصح بعمل sync من السحابة أولاً لو احتجت تتراجع."
                  : "This will overwrite current values. Run cloud sync first if you might need to roll back."}
              </span>
            </div>
          </div>
          <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <Button variant="outline" onClick={() => setEnhanceOpen(false)}>
              {t("cancel") || (ar ? "إلغاء" : "Cancel")}
            </Button>
            <Button
              onClick={() => aiEnhanceMutation.mutate(enhanceOpts)}
              disabled={aiEnhanceMutation.isPending || (!enhanceOpts.updateNames && !enhanceOpts.updateCodes && !enhanceOpts.updateThresholds)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
            >
              {aiEnhanceMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
              {ar ? "تشغيل التحسين" : "Run Enhancement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Archive / Unarchive AlertDialog ── */}
      <AlertDialog open={archiveTarget !== null} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {archiveTarget?.isActive === false ? (
                <><ArchiveRestore size={18} className="text-emerald-600" /> {ar ? "إلغاء أرشفة المادة" : "Restore material"}</>
              ) : (
                <><ArchiveIcon size={18} className="text-amber-600" /> {ar ? "أرشفة المادة" : "Archive material"}</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.isActive === false
                ? (ar
                    ? "سيتم استرجاع المادة وعرضها مرة أخرى في القوائم الافتراضية."
                    : "The material will be restored and shown in default lists.")
                : (ar
                    ? "ستخفي المادة من القوائم الافتراضية. لن تُحذف البيانات، يمكنك استرجاعها من فلتر 'غير مفعّل'."
                    : "The material will be hidden from default lists. Data is preserved; you can restore it from the 'Inactive' filter.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{t("cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!archiveTarget) return;
                const newActive = archiveTarget.isActive === false;
                archiveMutation.mutate({ id: archiveTarget.id, isActive: newActive });
              }}
              className={archiveTarget?.isActive === false
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-amber-600 hover:bg-amber-700 text-white"}
            >
              {archiveTarget?.isActive === false ? (ar ? "نعم، استرجع" : "Yes, restore") : (ar ? "نعم، أرشف" : "Yes, archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Hard Delete AlertDialog ── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 size={18} className="text-red-600" />
              {ar ? "حذف نهائي للمادة" : "Permanently delete material"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {ar
                  ? `سيتم حذف "${deleteTarget?.nameAr || deleteTarget?.name}" بشكل نهائي ولا يمكن التراجع عن هذا الإجراء.`
                  : `"${deleteTarget?.name}" will be permanently deleted. This action cannot be undone.`}
              </span>
              <span className="block text-red-600 font-medium text-xs">
                {ar
                  ? "⚠️ تأكد من أن المادة ليس لها معاملات أو وصفات مرتبطة قبل الحذف."
                  : "⚠️ Make sure the material has no linked transactions or recipes before deleting."}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) hardDeleteMutation.mutate({ id: deleteTarget.id }); }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={hardDeleteMutation.isPending}
            >
              {hardDeleteMutation.isPending
                ? (ar ? "جاري الحذف..." : "Deleting...")
                : (ar ? "نعم، احذف نهائياً" : "Yes, delete permanently")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Stock Movement Dialog ── */}
      {movementTarget && (
        <StockMovementDialog
          material={movementTarget.material}
          defaultTab={movementTarget.tab}
          onClose={() => setMovementTarget(null)}
          onSuccess={() => {
            utils.materials.list.invalidate();
            setMovementTarget(null);
          }}
          ar={ar}
          isRTL={isRTL}
        />
      )}
    </div>
  );
}

// ─── Material Details Drawer ────────────────────────────────────────────────
function MaterialDetailsDrawer({
  materialId, onClose, onEdit, onArchive, onMovement, ar, isRTL, categories, canWrite,
}: {
  materialId: number | null;
  onClose: () => void;
  onEdit: (material: any) => void;
  onArchive: (material: any) => void;
  onMovement: (material: any, tab: MovementTab) => void;
  ar: boolean;
  isRTL: boolean;
  categories: any[];
  canWrite: boolean;
}) {
  const isOpen = materialId !== null;
  const detailQuery = trpc.materials.get.useQuery(
    { id: materialId! },
    { enabled: isOpen }
  );
  const ledgerQuery = trpc.materials.ledger.useQuery(
    { materialId: materialId!, limit: 50 },
    { enabled: isOpen }
  );

  const material = detailQuery.data;
  const ledger = ledgerQuery.data;

  // Last IN transaction = last purchase
  const lastIn = useMemo(() => {
    if (!ledger?.transactions) return null;
    return (ledger.transactions as any[]).find((tx: any) => tx.transactionType === "IN") || null;
  }, [ledger]);

  const status = material ? getStockStatus(material) : "available";
  const cfg = STATUS_CONFIG[status];
  const catName = material ? categories?.find((c: any) => c.id === material.categoryId) : null;
  const stockValue = material ? estimatedStockValue(material.currentQuantity, material.lastPurchasePrice) : 0;
  const reorderQty = material ? recommendedReorderQty(material.currentQuantity, material.minimumQuantity) : 0;

  return (
    <Drawer open={isOpen} onOpenChange={(o) => !o && onClose()} direction={isRTL ? "right" : "left"}>
      <DrawerContent className="max-w-md ms-auto" dir={isRTL ? "rtl" : "ltr"}>
        <DrawerHeader className={isRTL ? "text-right" : ""}>
          <div className={`flex items-center justify-between gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <DrawerTitle className="flex items-center gap-2">
              <Package size={18} className="text-blue-500" />
              {ar ? "تفاصيل المادة" : "Material Details"}
            </DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><X size={16} /></Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-4 overflow-y-auto space-y-4">
          {detailQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
            </div>
          ) : !material ? (
            <p className="text-center text-muted-foreground py-8">
              {ar ? "تعذّر تحميل البيانات" : "Could not load material"}
            </p>
          ) : (
            <>
              {/* Header card with name + status */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                <div className={`flex items-start justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className={isRTL ? "text-right" : ""}>
                    <h3 className="font-semibold text-base">
                      {ar && material.nameAr ? material.nameAr : material.name}
                    </h3>
                    {ar && material.nameAr && material.name !== material.nameAr && (
                      <p className="text-xs text-muted-foreground" dir="ltr">{material.name}</p>
                    )}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
                    {ar ? cfg.labelAr : cfg.labelEn}
                  </span>
                </div>
                {material.notes && (
                  <p className="text-xs text-muted-foreground mt-2">{material.notes}</p>
                )}
              </div>

              {/* Details grid */}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <DetailItem icon={<Hash size={14} />} label={ar ? "الكود" : "Code"} value={material.code || "—"} mono />
                <DetailItem icon={<Tag size={14} />} label={ar ? "التصنيف" : "Category"} value={catName ? (ar && catName.nameAr ? catName.nameAr : catName.name) : "—"} />
                <DetailItem icon={<Layers size={14} />} label={ar ? "النوع" : "Type"} value={material.materialType === "semi_finished" ? (ar ? "مصنّعة" : "Semi-Finished") : (ar ? "خام" : "Raw")} />
                <DetailItem icon={<Package size={14} />} label={ar ? "الوحدة" : "Unit"} value={formatUnit(material.unit, ar ? "ar" : "en")} />
                <DetailItem
                  icon={<Boxes size={14} />}
                  label={ar ? "الكمية الحالية" : "Current Qty"}
                  value={formatQtyWithUnit(material.currentQuantity, material.unit, ar ? "ar" : "en")}
                  highlight={status === "low" || status === "out" ? "amber" : "default"}
                />
                <DetailItem
                  icon={<AlertTriangle size={14} />}
                  label={ar ? "الحد الأدنى" : "Min"}
                  value={formatQtyWithUnit(material.minimumQuantity, material.unit, ar ? "ar" : "en")}
                />
                <DetailItem
                  icon={<Wallet size={14} />}
                  label={ar ? "آخر سعر" : "Last Price"}
                  value={material.lastPurchasePrice != null ? fmtCurrency(material.lastPurchasePrice, ar ? "ar" : "en") : "—"}
                />
                <DetailItem
                  icon={<Wallet size={14} />}
                  label={ar ? "قيمة المخزون" : "Stock Value"}
                  value={fmtCurrency(stockValue, ar ? "ar" : "en")}
                  highlight={stockValue > 0 ? "emerald" : "default"}
                />
                <DetailItem
                  icon={<Calendar size={14} />}
                  label={ar ? "آخر شراء" : "Last Purchase"}
                  value={lastIn?.transactionDate
                    ? new Date(lastIn.transactionDate).toLocaleDateString(ar ? "ar-AE" : "en-AE", { year: "numeric", month: "short", day: "numeric" })
                    : (ar ? "لا يوجد" : "None")}
                />
                <DetailItem
                  icon={<ShoppingCart size={14} />}
                  label={ar ? "الكمية المقترحة للشراء" : "Suggested Reorder"}
                  value={reorderQty > 0 ? formatQtyWithUnit(reorderQty, material.unit, ar ? "ar" : "en") : (ar ? "غير مطلوب" : "Not needed")}
                  highlight={reorderQty > 0 ? "amber" : "default"}
                />
              </dl>

              {lastIn && (
                <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-1">
                  <p className="font-medium text-foreground">{ar ? "آخر عملية شراء" : "Last purchase details"}</p>
                  {lastIn.supplierName && (
                    <p className="text-muted-foreground">
                      {ar ? "المورد: " : "Supplier: "}<span className="text-foreground">{lastIn.supplierName}</span>
                    </p>
                  )}
                  {lastIn.unitPrice != null && (
                    <p className="text-muted-foreground">
                      {ar ? "سعر الوحدة: " : "Unit price: "}<span className="text-foreground">{fmtCurrency(lastIn.unitPrice, ar ? "ar" : "en")}</span>
                    </p>
                  )}
                  {lastIn.quantity != null && (
                    <p className="text-muted-foreground">
                      {ar ? "الكمية: " : "Qty: "}<span className="text-foreground">{formatQtyWithUnit(lastIn.quantity, material.unit, ar ? "ar" : "en")}</span>
                    </p>
                  )}
                </div>
              )}

              {/* ── Recent Movements ── */}
              <div className="space-y-2">
                <div className={`flex items-center gap-1.5 text-xs font-medium text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}>
                  <History size={13} />
                  <span>{ar ? "آخر حركات المخزون" : "Recent Stock Movements"}</span>
                  {ledgerQuery.isLoading && <Loader2 size={12} className="animate-spin" />}
                </div>
                {ledger && (ledger.transactions as any[]).length > 0 ? (
                  <div className="space-y-1.5">
                    {(ledger.transactions as any[]).slice(0, 10).map((tx: any) => {
                      const isIn = tx.transactionType === "IN";
                      const isAdj = tx.transactionType === "ADJUSTMENT";
                      const qtyNum = parseFloat(tx.quantity);
                      const reasonLabel: Record<string, string> = {
                        purchase: ar ? "شراء" : "Purchase",
                        production: ar ? "صرف مطبخ" : "Kitchen Issue",
                        waste: ar ? "هالك" : "Waste",
                        transfer: ar ? "تحويل" : "Transfer",
                        return: ar ? "مرتجع" : "Return",
                        adjustment: ar ? "تسوية" : "Adjustment",
                        other: ar ? "أخرى" : "Other",
                        opening_balance: ar ? "رصيد افتتاحي" : "Opening Balance",
                      };
                      return (
                        <div key={tx.id} className={`flex items-start justify-between gap-2 bg-muted/30 rounded-md p-2 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                          <div className={`flex items-center gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                            {isIn ? (
                              <ArrowDownCircle size={13} className="text-emerald-500 shrink-0" />
                            ) : isAdj ? (
                              <SlidersHorizontal size={13} className="text-purple-500 shrink-0" />
                            ) : (
                              <ArrowUpCircle size={13} className="text-red-500 shrink-0" />
                            )}
                            <div className={isRTL ? "text-right" : ""}>
                              <p className="font-medium">{reasonLabel[tx.reason ?? "other"] ?? tx.reason}</p>
                              {tx.notes && <p className="text-muted-foreground truncate max-w-[130px]">{tx.notes}</p>}
                            </div>
                          </div>
                          <div className={`shrink-0 ${isRTL ? "text-left" : "text-right"}`}>
                            <p className={`font-semibold ${isIn ? "text-emerald-600" : "text-red-600"}`}>
                              {isIn ? "+" : "−"}{qtyNum.toFixed(3)} {material.unit}
                            </p>
                            <p className="text-muted-foreground" dir="ltr">
                              {new Date(tx.transactionDate).toLocaleDateString(ar ? "ar-AE" : "en-AE", { month: "short", day: "numeric" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : !ledgerQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    {ar ? "لا توجد حركات مخزون مسجلة بعد" : "No stock movements recorded yet"}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>

        <DrawerFooter className="space-y-2 pb-4">
          {canWrite && material && material.isActive !== false && (
            <div className={`grid grid-cols-2 gap-1.5 ${isRTL ? "direction-rtl" : ""}`}>
              <Button size="sm" variant="outline" onClick={() => onMovement(material, "in")} className="gap-1 text-emerald-600 hover:text-emerald-700">
                <PackagePlus size={13} /> {ar ? "إضافة وارد" : "Add Stock"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMovement(material, "kitchen")} className="gap-1 text-orange-600 hover:text-orange-700">
                <ChefHat size={13} /> {ar ? "صرف للمطبخ" : "Issue"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMovement(material, "waste")} className="gap-1 text-red-600 hover:text-red-700">
                <PackageX size={13} /> {ar ? "تسجيل هالك" : "Waste"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMovement(material, "adjust")} className="gap-1 text-purple-600 hover:text-purple-700">
                <SlidersHorizontal size={13} /> {ar ? "تسوية" : "Adjust"}
              </Button>
            </div>
          )}
          <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            {canWrite && material && (
              <>
                <Button variant="outline" onClick={() => onEdit(material)} className="gap-1 flex-1">
                  <Edit2 size={14} /> {ar ? "تعديل" : "Edit"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onArchive(material)}
                  className={`gap-1 flex-1 ${material.isActive === false ? "text-emerald-600" : "text-amber-600"}`}
                >
                  {material.isActive === false ? <ArchiveRestore size={14} /> : <ArchiveIcon size={14} />}
                  {material.isActive === false ? (ar ? "إلغاء الأرشفة" : "Restore") : (ar ? "أرشفة" : "Archive")}
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={onClose}>{ar ? "إغلاق" : "Close"}</Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function DetailItem({ icon, label, value, mono, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: "default" | "amber" | "emerald";
}) {
  const tone =
    highlight === "amber" ? "text-amber-600 font-semibold" :
    highlight === "emerald" ? "text-emerald-600 font-semibold" :
    "text-foreground";
  return (
    <div className="rounded-md border border-border/60 p-2.5 bg-card">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-sm ${tone} ${mono ? "font-mono" : "font-medium"}`}>
        {value}
      </div>
    </div>
  );
}

// ─── Stock Movement Dialog ────────────────────────────────────────────────────
type MovementTab = "in" | "kitchen" | "waste" | "adjust";

function StockMovementDialog({
  material, defaultTab, onClose, onSuccess, ar, isRTL,
}: {
  material: any;
  defaultTab: MovementTab;
  onClose: () => void;
  onSuccess: () => void;
  ar: boolean;
  isRTL: boolean;
}) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<MovementTab>(defaultTab);
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [destination, setDestination] = useState("");
  const [wasteReason, setWasteReason] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [notes, setNotes] = useState("");

  const stockInMutation = trpc.inventory.stockIn.useMutation({
    onSuccess: () => { toast.success(ar ? "تم إضافة الوارد بنجاح" : "Stock added"); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });
  const stockOutMutation = trpc.inventory.stockOut.useMutation({
    onSuccess: (res: any) => {
      toast.success(ar ? "تم الصرف بنجاح" : "Stock issued");
      if (res?.belowMinimum) toast.warning(ar ? "⚠️ الكمية وصلت للحد الأدنى" : "⚠️ Stock below minimum");
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const stockAdjustMutation = trpc.inventory.stockAdjust.useMutation({
    onSuccess: () => { toast.success(ar ? "تمت التسوية بنجاح" : "Adjustment saved"); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });

  const currentQty = parseFloat(material?.currentQuantity ?? "0");
  const unit = material?.unit ?? "";
  const matName = ar && material?.nameAr ? material.nameAr : material?.name;

  const tabConfig: { id: MovementTab; label: string; icon: React.ReactNode; color: string }[] = [
    { id: "in",      label: ar ? "إضافة وارد"    : "Add Stock",       icon: <PackagePlus size={14} />,      color: "text-emerald-600" },
    { id: "kitchen", label: ar ? "صرف للمطبخ"    : "Issue to Kitchen", icon: <ChefHat size={14} />,         color: "text-orange-600"  },
    { id: "waste",   label: ar ? "تسجيل هالك"    : "Record Waste",    icon: <PackageX size={14} />,         color: "text-red-600"     },
    { id: "adjust",  label: ar ? "تسوية مخزون"   : "Adjustment",      icon: <SlidersHorizontal size={14} />, color: "text-purple-600" },
  ];

  const isPending = stockInMutation.isPending || stockOutMutation.isPending || stockAdjustMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "in") {
      const q = parseFloat(qty);
      if (!q || q <= 0) return toast.error(ar ? "الكمية يجب أن تكون أكبر من صفر" : "Quantity must be > 0");
      stockInMutation.mutate({
        materialId: material.id,
        quantity: q,
        unitPrice: unitCost ? parseFloat(unitCost) : undefined,
        supplierName: supplier || undefined,
        referenceNumber: reference || undefined,
        transactionDate: new Date(),
        notes: notes || undefined,
      });
    } else if (tab === "kitchen") {
      const q = parseFloat(qty);
      if (!q || q <= 0) return toast.error(ar ? "الكمية يجب أن تكون أكبر من صفر" : "Quantity must be > 0");
      stockOutMutation.mutate({
        materialId: material.id,
        quantity: q,
        reason: "production",
        destination: destination || undefined,
        transactionDate: new Date(),
        notes: notes || undefined,
      });
    } else if (tab === "waste") {
      const q = parseFloat(qty);
      if (!q || q <= 0) return toast.error(ar ? "الكمية يجب أن تكون أكبر من صفر" : "Quantity must be > 0");
      stockOutMutation.mutate({
        materialId: material.id,
        quantity: q,
        reason: "waste",
        transactionDate: new Date(),
        notes: wasteReason ? `[${wasteReason}] ${notes}` : notes || undefined,
      });
    } else if (tab === "adjust") {
      const delta = parseFloat(adjustDelta);
      if (!adjustDelta || delta === 0) return toast.error(ar ? "أدخل كمية التسوية (موجبة أو سالبة)" : "Enter adjustment quantity");
      if (!adjustReason.trim()) return toast.error(ar ? "السبب مطلوب للتسوية" : "Reason is required");
      stockAdjustMutation.mutate({
        materialId: material.id,
        quantityDelta: delta,
        reason: adjustReason,
        notes: notes || undefined,
      });
    }
  };

  const activeTab = tabConfig.find((t) => t.id === tab)!;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History size={16} className="text-muted-foreground" />
            {ar ? "حركة مخزون" : "Stock Movement"} — <span className="font-normal text-muted-foreground">{matName}</span>
          </DialogTitle>
          <p className={`text-xs text-muted-foreground ${isRTL ? "text-right" : ""}`}>
            {ar ? "الكمية الحالية: " : "Current qty: "}
            <span className="font-semibold text-foreground">{currentQty.toFixed(3)} {unit}</span>
          </p>
        </DialogHeader>

        {/* Tab selector */}
        <div className={`flex gap-1 flex-wrap ${isRTL ? "flex-row-reverse" : ""}`}>
          {tabConfig.map((tc) => (
            <button
              key={tc.id}
              type="button"
              onClick={() => { setTab(tc.id); setQty(""); setNotes(""); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors
                ${tab === tc.id
                  ? `border-current ${tc.color} bg-muted`
                  : "border-border text-muted-foreground hover:bg-muted/50"}`}
            >
              {tc.icon} {tc.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* إضافة وارد */}
          {tab === "in" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{ar ? "الكمية" : "Quantity"} *</Label>
                  <Input type="number" step="0.001" min="0.001" value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
                </div>
                <div>
                  <Label>{ar ? "سعر الوحدة" : "Unit Cost"}</Label>
                  <Input type="number" step="0.001" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>{ar ? "المورد (اختياري)" : "Supplier (optional)"}</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
              <div>
                <Label>{ar ? "رقم المرجع (اختياري)" : "Reference No (optional)"}</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" />
              </div>
            </>
          )}

          {/* صرف للمطبخ */}
          {tab === "kitchen" && (
            <>
              <div>
                <Label>{ar ? "الكمية" : "Quantity"} *</Label>
                <Input type="number" step="0.001" min="0.001" max={currentQty} value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
                <p className="text-xs text-muted-foreground mt-0.5">{ar ? `الحد الأقصى: ${currentQty.toFixed(3)} ${unit}` : `Max: ${currentQty.toFixed(3)} ${unit}`}</p>
              </div>
              <div>
                <Label>{ar ? "الوجهة (اختياري)" : "Destination (optional)"}</Label>
                <Input value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>
            </>
          )}

          {/* تسجيل هالك */}
          {tab === "waste" && (
            <>
              <div>
                <Label>{ar ? "الكمية" : "Quantity"} *</Label>
                <Input type="number" step="0.001" min="0.001" max={currentQty} value={qty} onChange={(e) => setQty(e.target.value)} required autoFocus />
                <p className="text-xs text-muted-foreground mt-0.5">{ar ? `الحد الأقصى: ${currentQty.toFixed(3)} ${unit}` : `Max: ${currentQty.toFixed(3)} ${unit}`}</p>
              </div>
              <div>
                <Label>{ar ? "سبب الهالك" : "Waste Reason"}</Label>
                <Input value={wasteReason} onChange={(e) => setWasteReason(e.target.value)} placeholder={ar ? "مثل: انتهاء صلاحية، تلف..." : "e.g. Expired, Damaged..."} />
              </div>
            </>
          )}

          {/* تسوية مخزون */}
          {tab === "adjust" && (
            <>
              <div>
                <Label>{ar ? "الفرق في الكمية" : "Quantity Difference"} *</Label>
                <Input
                  type="number" step="0.001"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  required autoFocus
                  placeholder={ar ? "موجب = إضافة، سالب = خصم" : "Positive = add, negative = deduct"}
                />
                {adjustDelta && !isNaN(parseFloat(adjustDelta)) && (
                  <p className="text-xs mt-0.5">
                    {ar ? "الكمية بعد التسوية: " : "Qty after: "}
                    <span className={`font-semibold ${currentQty + parseFloat(adjustDelta) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {(currentQty + parseFloat(adjustDelta)).toFixed(3)} {unit}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <Label>{ar ? "السبب" : "Reason"} *</Label>
                <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} required placeholder={ar ? "مثل: جرد فعلي، خطأ إدخال..." : "e.g. Physical count, Entry error..."} />
              </div>
            </>
          )}

          {/* Notes - shared across tabs */}
          <div>
            <Label>{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <Button type="button" variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button
              type="submit"
              disabled={isPending}
              className={`gap-2 ${tab === "waste" ? "bg-red-600 hover:bg-red-700 text-white" : tab === "kitchen" ? "bg-orange-600 hover:bg-orange-700 text-white" : tab === "adjust" ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : activeTab.icon}
              {activeTab.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
