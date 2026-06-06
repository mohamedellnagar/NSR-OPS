import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FlaskConical, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  Search, X, AlertTriangle, Loader2, ChefHat, Tag,
  Package, Clock, Thermometer, Sparkles, Calculator,
  BookOpen, CheckCircle, XCircle, Clock3, Archive,
  Copy, GitBranch, Send, ShieldCheck, Ban, History,
  Link2, MoreVertical, BarChart3, TrendingUp, Eye, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NumericInput } from "@/components/NumericInput";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Constants ────────────────────────────────────────────────────────────────
const OUTPUT_UNITS = ["kg", "g", "liter", "ml", "piece", "portion", "pcs"];
const STORAGE_LOCATIONS = ["Chiller", "Freezer", "Dry Storage"];
const STORAGE_LOCATIONS_AR = ["مبرد", "مجمد", "مخزن جاف"];
const UNIT_LABELS: Record<string, string> = {
  kg: "كجم", g: "جرام", liter: "لتر", ml: "مل", piece: "قطعة", portion: "حصة", pcs: "قطع",
};

type RecipeStatus = "draft" | "pending" | "approved" | "suspended" | "archived";

const STATUS_CONFIG: Record<RecipeStatus, { labelAr: string; labelEn: string; badgeClass: string; icon: React.ReactNode }> = {
  draft:     { labelAr: "مسودة",       labelEn: "Draft",            badgeClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",              icon: <Pencil size={10} /> },
  pending:   { labelAr: "بانتظار الاعتماد", labelEn: "Pending",      badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300", icon: <Clock3 size={10} /> },
  approved:  { labelAr: "معتمد",        labelEn: "Approved",        badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", icon: <CheckCircle size={10} /> },
  suspended: { labelAr: "موقوف",        labelEn: "Suspended",       badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",               icon: <Ban size={10} /> },
  archived:  { labelAr: "مؤرشف",       labelEn: "Archived",        badgeClass: "bg-muted text-muted-foreground",                                              icon: <Archive size={10} /> },
};

// ─── Unit conversion ─────────────────────────────────────────────────────────
function normalizeUnit(u: string): string {
  const s = (u ?? "").toLowerCase().trim();
  if (["gram","grams","جرام","g"].includes(s)) return "g";
  if (["kilogram","kilograms","kilo","كيلو","كيلوجرام","kg"].includes(s)) return "kg";
  if (["milligram","milligrams","mg"].includes(s)) return "mg";
  if (["milliliter","milliliters","مل","ml"].includes(s)) return "ml";
  if (["liter","liters","litre","litres","لتر","l"].includes(s)) return "l";
  if (["centiliter","cl"].includes(s)) return "cl";
  if (["deciliter","dl"].includes(s)) return "dl";
  if (["piece","pieces","pc","pcs","قطعة","حبة","حبات","portion"].includes(s)) return "pcs";
  return s;
}
function convertToBaseUnit(qty: number, recipeUnit: string, materialBaseUnit: string): number {
  const from = normalizeUnit(recipeUnit);
  const to = normalizeUnit(materialBaseUnit);
  if (from === to) return qty;
  if (to === "kg") { if (from === "g") return qty / 1000; if (from === "mg") return qty / 1_000_000; }
  if (to === "g") { if (from === "kg") return qty * 1000; if (from === "mg") return qty / 1000; }
  if (to === "l") { if (from === "ml") return qty / 1000; if (from === "cl") return qty / 100; if (from === "dl") return qty / 10; }
  if (to === "ml") { if (from === "l") return qty * 1000; if (from === "cl") return qty * 10; if (from === "dl") return qty * 100; }
  return qty;
}

function fmtCurrency(v: number | string | null | undefined, lang: "ar" | "en" = "ar") {
  const n = parseFloat(String(v ?? "0")) || 0;
  return n.toLocaleString(lang === "ar" ? "ar-AE" : "en-AE", {
    style: "currency", currency: "AED", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
function fmtQty(v: number | string | null | undefined, decimals = 3) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return n % 1 === 0 ? n.toString() : n.toFixed(decimals).replace(/\.?0+$/, "");
}
function fmtDate(d: Date | string | null | undefined, lang: "ar" | "en" = "ar") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface RecipeItem {
  id: number;
  ingredientId: number;
  ingredientName: string;
  ingredientNameAr: string | null;
  ingredientUnit: string;
  quantity: string;
  unit: string;
  expectedWastePercent: string;
  lastPurchasePrice: string | null;
  notes: string | null;
}
interface SemiMaterial {
  id: number;
  code: string | null;
  name: string;
  nameAr: string | null;
  categoryId: number | null;
  unit: string;
  outputQuantity: string;
  shelfLife: number | null;
  storageLocation: string | null;
  defaultWastePercent: string;
  notes: string | null;
  recipeStatus: RecipeStatus;
  recipeVersion: number;
  approvedBy: number | null;
  approvalDate: Date | null;
  changeLog: string | null;
  updatedAt: Date;
  createdAt: Date;
}
interface CostSummary { totalCost: number; costPerUnit: number; hasMissingCost: boolean; count: number; }

function computeCostSummary(items: RecipeItem[], outputQty: number): CostSummary {
  let totalCost = 0, hasMissingCost = false;
  items.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.lastPurchasePrice ?? "0") || 0;
    if (!price) hasMissingCost = true;
    totalCost += convertToBaseUnit(qty, item.unit, item.ingredientUnit) * price;
  });
  return { totalCost, costPerUnit: outputQty > 0 ? totalCost / outputQty : 0, hasMissingCost, count: items.length };
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, ar }: { status: RecipeStatus; ar: boolean }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
      {cfg.icon}
      {ar ? cfg.labelAr : cfg.labelEn}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SemiFinishedPage() {
  const { language, isRTL } = useLanguage();
  const ar = language === "ar";
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RecipeStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "updated" | "status" | "cost">("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [missingCostOnly, setMissingCostOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SemiMaterial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SemiMaterial | null>(null);
  const [actionTarget, setActionTarget] = useState<{ material: SemiMaterial; action: string } | null>(null);
  const [changeLogInput, setChangeLogInput] = useState("");

  const utils = trpc.useUtils();
  const { data: materials = [], isLoading, error, refetch } = trpc.semiFinished.list.useQuery();
  const { data: categories = [] } = trpc.categories.list.useQuery();
  const { data: rawMaterials = [] } = trpc.materials.list.useQuery({ includeInactive: false });

  // Mutations
  const deleteMutation = trpc.semiFinished.delete.useMutation({
    onSuccess: () => { utils.semiFinished.list.invalidate(); toast.success(ar ? "تم حذف الوصفة" : "Recipe deleted"); setDeleteTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const submitMutation = trpc.semiFinished.submitForApproval.useMutation({
    onSuccess: () => { utils.semiFinished.list.invalidate(); toast.success(ar ? "تم إرسال الوصفة للاعتماد" : "Submitted for approval"); setActionTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const approveMutation = trpc.semiFinished.approve.useMutation({
    onSuccess: () => { utils.semiFinished.list.invalidate(); toast.success(ar ? "✅ تم اعتماد الوصفة" : "✅ Recipe approved"); setActionTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const suspendMutation = trpc.semiFinished.suspend.useMutation({
    onSuccess: () => { utils.semiFinished.list.invalidate(); toast.success(ar ? "تم إيقاف الوصفة" : "Recipe suspended"); setActionTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const archiveMutation = trpc.semiFinished.archiveRecipe.useMutation({
    onSuccess: () => { utils.semiFinished.list.invalidate(); toast.success(ar ? "تم أرشفة الوصفة" : "Recipe archived"); setActionTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const versionMutation = trpc.semiFinished.createNewVersion.useMutation({
    onSuccess: (_, vars) => {
      utils.semiFinished.list.invalidate();
      toast.success(ar ? "تم إنشاء إصدار جديد — الوصفة في مسودة للتعديل" : "New version created — recipe is now a draft");
      setActionTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const duplicateMutation = trpc.semiFinished.duplicate.useMutation({
    onSuccess: (res: any) => {
      utils.semiFinished.list.invalidate();
      toast.success(ar ? "تم نسخ الوصفة" : "Recipe duplicated");
      setExpandedIds(prev => new Set(Array.from(prev).concat(res.id)));
      setActionTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  // KPIs
  const kpis = useMemo(() => {
    const all = materials as SemiMaterial[];
    const active = all.filter(m => m.recipeStatus !== "archived");
    const approved = active.filter(m => m.recipeStatus === "approved").length;
    const pending = active.filter(m => m.recipeStatus === "pending").length;
    const drafts = active.filter(m => m.recipeStatus === "draft").length;
    const suspended = active.filter(m => m.recipeStatus === "suspended").length;
    const recentDays = 7;
    const cutoff = new Date(Date.now() - recentDays * 86400000);
    const recentlyUpdated = active.filter(m => new Date(m.updatedAt) > cutoff).length;
    return { total: active.length, approved, pending, drafts, suspended, recentlyUpdated };
  }, [materials]);

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let list = (materials as SemiMaterial[]);
    if (!showArchived) list = list.filter(m => m.recipeStatus !== "archived");
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(m =>
      m.name.toLowerCase().includes(q) || (m.nameAr ?? "").includes(q) || (m.code ?? "").toLowerCase().includes(q)
    );
    if (statusFilter !== "all") list = list.filter(m => m.recipeStatus === statusFilter);
    if (categoryFilter !== "all") list = list.filter(m => String(m.categoryId) === categoryFilter);
    if (sortBy === "name") list = [...list].sort((a, b) => (a.nameAr || a.name).localeCompare(b.nameAr || b.name, "ar"));
    else if (sortBy === "updated") list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    else if (sortBy === "status") list = [...list].sort((a, b) => a.recipeStatus.localeCompare(b.recipeStatus));
    return list;
  }, [materials, search, statusFilter, categoryFilter, sortBy, showArchived]);

  const handleAction = (material: SemiMaterial, action: string) => {
    if (action === "edit") {
      if (material.recipeStatus === "approved") {
        setActionTarget({ material, action: "confirmNewVersion" });
      } else {
        setEditTarget(material);
      }
    } else if (action === "duplicate") {
      duplicateMutation.mutate({ id: material.id });
    } else if (["submitForApproval", "approve", "suspend", "archive", "createNewVersion"].includes(action)) {
      setActionTarget({ material, action });
      setChangeLogInput("");
    } else if (action === "delete") {
      setDeleteTarget(material);
    }
  };

  const confirmAction = () => {
    if (!actionTarget) return;
    const { material, action } = actionTarget;
    if (action === "submitForApproval") submitMutation.mutate({ id: material.id, changeLog: changeLogInput || undefined });
    else if (action === "approve") approveMutation.mutate({ id: material.id, changeLog: changeLogInput || undefined });
    else if (action === "suspend") suspendMutation.mutate({ id: material.id, changeLog: changeLogInput || undefined });
    else if (action === "archive") archiveMutation.mutate({ id: material.id });
    else if (action === "createNewVersion" || action === "confirmNewVersion") versionMutation.mutate({ id: material.id });
  };

  const isPendingAction = submitMutation.isPending || approveMutation.isPending || suspendMutation.isPending || archiveMutation.isPending || versionMutation.isPending || duplicateMutation.isPending;

  if (error) return (
    <div className="p-8 text-center space-y-3">
      <AlertTriangle size={40} className="mx-auto text-red-500" />
      <p className="text-red-600 font-medium">{ar ? "فشل تحميل الوصفات" : "Failed to load recipes"}</p>
      <Button variant="outline" onClick={() => refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</Button>
    </div>
  );

  return (
    <div className="space-y-5 p-4 md:p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className={`flex items-start justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen size={24} className="text-purple-600" />
            {ar ? "وصفات المواد المصنّعة" : "Manufactured Item Recipes"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {ar
              ? "وصفات معيارية ثابتة لتحديد المكونات والتكلفة — تُعتمد قبل استخدامها في الإنتاج الفعلي."
              : "Fixed standard recipes defining ingredients and costing — must be approved before use in production."}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
            <Plus size={16} /> {ar ? "إضافة وصفة" : "Add Recipe"}
          </Button>
        )}
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { label: ar ? "إجمالي الوصفات" : "Total", value: kpis.total, color: "blue", icon: <FlaskConical size={15} /> },
          { label: ar ? "معتمدة" : "Approved", value: kpis.approved, color: "emerald", icon: <CheckCircle size={15} /> },
          { label: ar ? "انتظار الاعتماد" : "Pending", value: kpis.pending, color: "orange", icon: <Clock3 size={15} /> },
          { label: ar ? "مسودة" : "Draft", value: kpis.drafts, color: "gray", icon: <Pencil size={15} /> },
          { label: ar ? "موقوفة" : "Suspended", value: kpis.suspended, color: "red", icon: <Ban size={15} /> },
          { label: ar ? "محدّثة (٧ أيام)" : "Updated (7d)", value: kpis.recentlyUpdated, color: "purple", icon: <TrendingUp size={15} /> },
        ].map((k, i) => (
          <div key={i} className={`bg-card border border-border rounded-xl p-3 flex items-center gap-2.5`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-${k.color}-100 dark:bg-${k.color}-950/40 text-${k.color}-600 dark:text-${k.color}-400`}>
              {k.icon}
            </div>
            <div className={isRTL ? "text-right" : ""}>
              <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
              <p className="text-lg font-bold leading-tight">{isLoading ? "—" : k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`flex flex-wrap gap-2 items-center ${isRTL ? "flex-row-reverse" : ""}`}>
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={ar ? "بحث بالاسم أو الكود..." : "Search by name or code..."}
            className={isRTL ? "pr-8 text-right" : "pl-8"} />
          {search && <button onClick={() => setSearch("")} className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground ${isRTL ? "left-2" : "right-2"}`}><X size={13} /></button>}
        </div>

        {/* Status filter */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">{ar ? "كل الحالات" : "All Statuses"}</option>
          {(Object.keys(STATUS_CONFIG) as RecipeStatus[]).map(s => (
            <option key={s} value={s}>{ar ? STATUS_CONFIG[s].labelAr : STATUS_CONFIG[s].labelEn}</option>
          ))}
        </select>

        {/* Category */}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="all">{ar ? "كل التصنيفات" : "All Categories"}</option>
          {(categories as any[]).map((c: any) => (
            <option key={c.id} value={String(c.id)}>{ar && c.nameAr ? c.nameAr : c.name}</option>
          ))}
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm">
          <option value="updated">{ar ? "آخر تعديل" : "Last Updated"}</option>
          <option value="name">{ar ? "الاسم" : "Name"}</option>
          <option value="status">{ar ? "الحالة" : "Status"}</option>
        </select>

        {/* Archive toggle */}
        <button
          onClick={() => setShowArchived(p => !p)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-colors
            ${showArchived ? "bg-muted-foreground/10 border-muted-foreground/30 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"}`}
        >
          <Archive size={13} />
          {ar ? "عرض المؤرشف" : "Show Archived"}
        </button>
      </div>

      {/* Recipe Cards */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FlaskConical size={48} className="mx-auto text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">
            {search || statusFilter !== "all" ? (ar ? "لا توجد نتائج" : "No results") : (ar ? "لا توجد وصفات بعد" : "No recipes yet")}
          </p>
          {!search && canWrite && (
            <Button onClick={() => setAddOpen(true)} variant="outline" className="gap-2"><Plus size={14} />{ar ? "إضافة أول وصفة" : "Add first recipe"}</Button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(m => (
            <RecipeCard
              key={m.id}
              material={m}
              expanded={expandedIds.has(m.id)}
              onToggle={() => toggleExpand(m.id)}
              onAction={(action) => handleAction(m, action)}
              categories={categories as any[]}
              rawMaterials={rawMaterials as any[]}
              ar={ar}
              isRTL={isRTL}
              canWrite={canWrite}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Add Dialog */}
      {addOpen && (
        <RecipeMetaDialog mode="add" categories={categories as any[]} ar={ar} isRTL={isRTL}
          onClose={() => setAddOpen(false)}
          onSaved={(id) => { setAddOpen(false); if (id !== undefined) setExpandedIds(prev => new Set(Array.from(prev).concat(id))); }}
        />
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <RecipeMetaDialog mode="edit" material={editTarget} categories={categories as any[]} ar={ar} isRTL={isRTL}
          onClose={() => setEditTarget(null)}
          onSaved={() => setEditTarget(null)}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 size={18} className="text-red-600" />
              {ar ? "حذف الوصفة" : "Delete Recipe"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ar ? `سيتم حذف "${deleteTarget?.nameAr || deleteTarget?.name}" وجميع مكوناتها نهائياً.` : `"${deleteTarget?.name}" and all its ingredients will be permanently deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })} className="bg-red-600 hover:bg-red-700 text-white">
              {ar ? "نعم، احذف" : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Workflow Action Dialog */}
      {actionTarget && (
        <WorkflowActionDialog
          action={actionTarget.action}
          material={actionTarget.material}
          changeLog={changeLogInput}
          onChangeLog={setChangeLogInput}
          isPending={isPendingAction}
          ar={ar}
          isRTL={isRTL}
          onClose={() => setActionTarget(null)}
          onConfirm={confirmAction}
        />
      )}
    </div>
  );
}

// ─── Workflow Action Dialog ───────────────────────────────────────────────────
function WorkflowActionDialog({ action, material, changeLog, onChangeLog, isPending, ar, isRTL, onClose, onConfirm }: {
  action: string; material: SemiMaterial; changeLog: string; onChangeLog: (v: string) => void;
  isPending: boolean; ar: boolean; isRTL: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const needsLog = ["submitForApproval","approve","suspend","createNewVersion"].includes(action);
  const configs: Record<string, { titleAr: string; titleEn: string; descAr: string; descEn: string; btnAr: string; btnEn: string; btnClass: string }> = {
    submitForApproval: { titleAr: "إرسال للاعتماد", titleEn: "Submit for Approval", descAr: "سيتم إرسال الوصفة للمراجعة والاعتماد.", descEn: "The recipe will be sent for review and approval.", btnAr: "إرسال", btnEn: "Submit", btnClass: "bg-orange-600 hover:bg-orange-700 text-white" },
    approve: { titleAr: "اعتماد الوصفة", titleEn: "Approve Recipe", descAr: "سيتم اعتماد هذه الوصفة وستصبح جاهزة للإنتاج.", descEn: "This recipe will be approved and become ready for production.", btnAr: "اعتماد", btnEn: "Approve", btnClass: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    suspend: { titleAr: "إيقاف الوصفة", titleEn: "Suspend Recipe", descAr: "ستُوقَف الوصفة مؤقتاً ولن يمكن استخدامها في الإنتاج.", descEn: "The recipe will be temporarily suspended and cannot be used in production.", btnAr: "إيقاف", btnEn: "Suspend", btnClass: "bg-red-600 hover:bg-red-700 text-white" },
    archive: { titleAr: "أرشفة الوصفة", titleEn: "Archive Recipe", descAr: "ستُخفى الوصفة من العرض الافتراضي.", descEn: "The recipe will be hidden from the default view.", btnAr: "أرشفة", btnEn: "Archive", btnClass: "bg-muted-foreground hover:bg-muted-foreground/80 text-white" },
    createNewVersion: { titleAr: "إنشاء إصدار جديد", titleEn: "Create New Version", descAr: "سيتم حفظ الإصدار الحالي المعتمد في السجل وإنشاء مسودة جديدة للتعديل.", descEn: "The current approved version will be saved to history and a new draft will be created for editing.", btnAr: "إنشاء إصدار جديد", btnEn: "Create New Version", btnClass: "bg-purple-600 hover:bg-purple-700 text-white" },
    confirmNewVersion: { titleAr: "تعديل الوصفة المعتمدة", titleEn: "Edit Approved Recipe", descAr: "هذه الوصفة معتمدة. لتعديلها يجب إنشاء إصدار جديد — الإصدار الحالي سيُحفظ في السجل.", descEn: "This recipe is approved. To edit it, a new version must be created — the current version will be saved to history.", btnAr: "إنشاء إصدار جديد وتعديل", btnEn: "Create New Version & Edit", btnClass: "bg-purple-600 hover:bg-purple-700 text-white" },
  };
  const cfg = configs[action] ?? configs.archive;
  const name = ar && material.nameAr ? material.nameAr : material.name;

  return (
    <AlertDialog open onOpenChange={o => !o && onClose()}>
      <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
        <AlertDialogHeader>
          <AlertDialogTitle>{ar ? cfg.titleAr : cfg.titleEn}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block font-medium text-foreground">{name}</span>
            <span className="block">{ar ? cfg.descAr : cfg.descEn}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needsLog && (
          <div className="px-1">
            <Label className="text-xs text-muted-foreground">{ar ? "ملاحظات التغيير (اختياري)" : "Change notes (optional)"}</Label>
            <Textarea rows={2} value={changeLog} onChange={e => onChangeLog(e.target.value)}
              placeholder={ar ? "مثل: تعديل نسبة الهالك، تحديث الأسعار..." : "e.g. Updated waste %, price adjustment..."}
              className="mt-1 text-sm" />
          </div>
        )}
        <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
          <AlertDialogCancel disabled={isPending}>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending} className={cfg.btnClass}>
            {isPending ? <Loader2 size={14} className="animate-spin me-1" /> : null}
            {ar ? cfg.btnAr : cfg.btnEn}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Recipe Card ──────────────────────────────────────────────────────────────
function RecipeCard({ material, expanded, onToggle, onAction, categories, rawMaterials, ar, isRTL, canWrite, isAdmin }: {
  material: SemiMaterial; expanded: boolean; onToggle: () => void;
  onAction: (action: string) => void; categories: any[]; rawMaterials: any[];
  ar: boolean; isRTL: boolean; canWrite: boolean; isAdmin: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"recipe" | "usage" | "history">("recipe");

  const { data: recipeItems = [], isLoading: recipeLoading } = trpc.semiFinished.getRecipe.useQuery(
    { materialId: material.id }, { enabled: expanded }
  );
  const utils = trpc.useUtils();
  const deleteItemMutation = trpc.semiFinished.deleteItem.useMutation({
    onSuccess: () => utils.semiFinished.getRecipe.invalidate({ materialId: material.id }),
    onError: (e: any) => toast.error(e.message),
  });

  const catName = categories.find((c: any) => c.id === material.categoryId);
  const outputQty = parseFloat(material.outputQuantity || "1");
  const outputUnit = ar ? (UNIT_LABELS[material.unit] ?? material.unit) : material.unit;
  const costSummary = useMemo(() => computeCostSummary(recipeItems as RecipeItem[], outputQty), [recipeItems, outputQty]);
  const storLocAr = material.storageLocation ? STORAGE_LOCATIONS_AR[STORAGE_LOCATIONS.indexOf(material.storageLocation)] ?? material.storageLocation : null;
  const isArchived = material.recipeStatus === "archived";

  // Action menu items based on status
  const menuItems = useMemo(() => {
    const s = material.recipeStatus;
    const items = [];
    if (canWrite && !isArchived) {
      items.push({ key: "edit", labelAr: "تعديل", labelEn: "Edit", icon: <Pencil size={13} /> });
      items.push({ key: "duplicate", labelAr: "نسخ الوصفة", labelEn: "Duplicate", icon: <Copy size={13} /> });
      if (s === "draft" || s === "suspended") items.push({ key: "submitForApproval", labelAr: "إرسال للاعتماد", labelEn: "Submit for Approval", icon: <Send size={13} /> });
      if (s === "pending" && (isAdmin || canWrite)) items.push({ key: "approve", labelAr: "اعتماد الوصفة", labelEn: "Approve Recipe", icon: <ShieldCheck size={13} /> });
      if (s === "approved") {
        items.push({ key: "createNewVersion", labelAr: "إنشاء إصدار جديد", labelEn: "New Version", icon: <GitBranch size={13} /> });
        items.push({ key: "suspend", labelAr: "إيقاف الوصفة", labelEn: "Suspend", icon: <Ban size={13} /> });
      }
      items.push(null); // separator
      items.push({ key: "archive", labelAr: "أرشفة", labelEn: "Archive", icon: <Archive size={13} />, danger: true });
      items.push({ key: "delete", labelAr: "حذف", labelEn: "Delete", icon: <Trash2 size={13} />, danger: true });
    }
    return items;
  }, [material.recipeStatus, canWrite, isAdmin, isArchived]);

  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${isArchived ? "opacity-60" : ""}`}>
      {/* Card Header */}
      <div className={`flex items-start justify-between gap-3 p-3.5 cursor-pointer hover:bg-muted/30 transition-colors ${isRTL ? "flex-row-reverse" : ""}`} onClick={onToggle}>
        {/* Left */}
        <div className={`flex items-start gap-3 flex-1 min-w-0 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center shrink-0 mt-0.5">
            <FlaskConical size={16} className="text-purple-600" />
          </div>
          <div className={`flex-1 min-w-0 ${isRTL ? "text-right" : ""}`}>
            <div className={`flex items-center gap-2 flex-wrap ${isRTL ? "flex-row-reverse" : ""}`}>
              <StatusBadge status={material.recipeStatus} ar={ar} />
              <h3 className="font-semibold text-sm">{ar && material.nameAr ? material.nameAr : material.name}</h3>
              {ar && material.nameAr && material.name !== material.nameAr && (
                <span className="text-xs text-muted-foreground hidden sm:inline" dir="ltr">{material.name}</span>
              )}
              {material.code && <span className="font-mono text-[10px] border border-border px-1.5 py-0 rounded text-muted-foreground">{material.code}</span>}
              <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0 rounded">v{material.recipeVersion}</span>
            </div>
            <div className={`flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}>
              {catName && <span className="flex items-center gap-1"><Tag size={10} />{ar && catName.nameAr ? catName.nameAr : catName.name}</span>}
              <span className="flex items-center gap-1"><Package size={10} />{fmtQty(outputQty)} {outputUnit}</span>
              {material.shelfLife && <span className="flex items-center gap-1"><Clock size={10} />{material.shelfLife}{ar ? "ي" : "d"}</span>}
              {material.storageLocation && <span className="flex items-center gap-1"><Thermometer size={10} />{ar ? storLocAr : material.storageLocation}</span>}
              {material.approvalDate && <span className="flex items-center gap-1"><CheckCircle size={10} className="text-emerald-500" />{fmtDate(material.approvalDate, ar ? "ar" : "en")}</span>}
            </div>
          </div>
        </div>

        {/* Right: cost + actions */}
        <div className={`flex items-center gap-2 shrink-0 ${isRTL ? "flex-row-reverse" : ""}`} onClick={e => e.stopPropagation()}>
          {expanded && costSummary.count > 0 && (
            <div className={`hidden md:block ${isRTL ? "text-left" : "text-right"}`}>
              <p className="text-sm font-semibold text-emerald-600">{fmtCurrency(costSummary.totalCost, ar ? "ar" : "en")}</p>
              <p className="text-[10px] text-muted-foreground">{fmtCurrency(costSummary.costPerUnit, ar ? "ar" : "en")}/{outputUnit}</p>
            </div>
          )}
          {canWrite && menuItems.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical size={14} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isRTL ? "start" : "end"} className="w-48">
                {menuItems.map((item, i) =>
                  item === null ? <DropdownMenuSeparator key={i} /> : (
                    <DropdownMenuItem key={item.key} onClick={() => onAction(item.key)}
                      className={`gap-2 text-xs ${item.danger ? "text-red-600 focus:text-red-600" : ""}`}>
                      {item.icon}
                      {ar ? item.labelAr : item.labelEn}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button className="text-muted-foreground hover:text-foreground p-1" onClick={onToggle}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border">
          {recipeLoading ? (
            <div className="p-6 flex justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)} dir={isRTL ? "rtl" : "ltr"}>
              <div className="px-4 pt-3">
                <TabsList className="h-8">
                  <TabsTrigger value="recipe" className="text-xs gap-1.5"><BookOpen size={12} />{ar ? "الوصفة" : "Recipe"}</TabsTrigger>
                  <TabsTrigger value="usage" className="text-xs gap-1.5"><Link2 size={12} />{ar ? "الاستخدام" : "Usage"}</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs gap-1.5"><History size={12} />{ar ? "السجل" : "History"}</TabsTrigger>
                </TabsList>
              </div>

              {/* Recipe Tab */}
              <TabsContent value="recipe" className="mt-0">
                <IngredientTable
                  materialId={material.id}
                  items={recipeItems as RecipeItem[]}
                  outputQty={outputQty}
                  outputUnit={outputUnit}
                  costSummary={costSummary}
                  rawMaterials={rawMaterials}
                  ar={ar} isRTL={isRTL}
                  canWrite={canWrite && !isArchived && material.recipeStatus !== "approved"}
                  onDeleteItem={id => deleteItemMutation.mutate({ id })}
                />
                {/* Warning: approved recipes can't be edited inline */}
                {material.recipeStatus === "approved" && canWrite && (
                  <div className={`mx-4 mb-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <ShieldCheck size={13} className="shrink-0 text-blue-500" />
                    {ar ? "الوصفة معتمدة — لتعديلها أنشئ إصداراً جديداً من قائمة الإجراءات ⋮" : "Recipe is approved — create a new version from the actions menu ⋮ to edit it"}
                  </div>
                )}
              </TabsContent>

              {/* Usage Tab */}
              <TabsContent value="usage" className="mt-0">
                <UsagePanel materialId={material.id} ar={ar} isRTL={isRTL} />
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="mt-0">
                <VersionHistoryPanel materialId={material.id} currentVersion={material.recipeVersion} ar={ar} isRTL={isRTL} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ingredient Table ─────────────────────────────────────────────────────────
function IngredientTable({ materialId, items, outputQty, outputUnit, costSummary, rawMaterials, ar, isRTL, canWrite, onDeleteItem }: {
  materialId: number; items: RecipeItem[]; outputQty: number; outputUnit: string;
  costSummary: CostSummary; rawMaterials: any[]; ar: boolean; isRTL: boolean;
  canWrite: boolean; onDeleteItem: (id: number) => void;
}) {
  const utils = trpc.useUtils();

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className={isRTL ? "text-right" : "text-left"}>
              <th className="px-4 py-2 font-medium text-xs">{ar ? "المادة الخام" : "Raw Material"}</th>
              <th className="px-4 py-2 font-medium text-xs">{ar ? "الكمية" : "Qty"}</th>
              <th className="px-4 py-2 font-medium text-xs">{ar ? "الوحدة" : "Unit"}</th>
              <th className="px-4 py-2 font-medium text-xs">{ar ? "سعر الوحدة" : "Unit Cost"}</th>
              <th className="px-4 py-2 font-medium text-xs">{ar ? "تكلفة المكوّن" : "Cost"}</th>
              <th className="px-4 py-2 font-medium text-xs">{ar ? "هالك %" : "Waste %"}</th>
              <th className="px-4 py-2 font-medium text-xs">{ar ? "ملاحظات" : "Notes"}</th>
              {canWrite && <th className="px-3 py-2 w-16"></th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={canWrite ? 8 : 7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                {ar ? "لا توجد مكونات — أضف مكوناً أدناه" : "No ingredients yet — add one below"}
              </td></tr>
            ) : items.map(item => (
              <IngredientRow key={item.id} item={item} materialId={materialId} ar={ar} isRTL={isRTL} canWrite={canWrite} onDelete={() => onDeleteItem(item.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Alerts */}
      {costSummary.hasMissingCost && items.length > 0 && (
        <div className={`mx-4 my-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <AlertTriangle size={12} className="shrink-0" />
          {ar ? "بعض المكونات بدون سعر — تكلفة الوصفة غير مكتملة ولا يمكن اعتمادها" : "Some ingredients have no unit cost — recipe cost is incomplete and cannot be approved"}
        </div>
      )}

      {/* Cost Summary */}
      {items.length > 0 && (
        <div className={`mx-4 my-3 bg-muted/30 border border-border rounded-lg p-3 ${isRTL ? "text-right" : ""}`}>
          <div className={`flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}>
            <Calculator size={12} /> {ar ? "ملخص تكلفة الوصفة" : "Cost Summary"}
          </div>
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 text-sm ${isRTL ? "text-right" : ""}`}>
            <div><p className="text-xs text-muted-foreground">{ar ? "إجمالي تكلفة المواد" : "Total Material Cost"}</p>
              <p className="font-semibold text-emerald-600">{fmtCurrency(costSummary.totalCost, ar ? "ar" : "en")}</p></div>
            <div><p className="text-xs text-muted-foreground">{ar ? "كمية الناتج" : "Output"}</p>
              <p className="font-semibold">{fmtQty(outputQty)} {outputUnit}</p></div>
            <div><p className="text-xs text-muted-foreground">{ar ? "تكلفة وحدة الناتج" : "Cost / Unit"}</p>
              <p className="font-semibold text-purple-600">{fmtCurrency(costSummary.costPerUnit, ar ? "ar" : "en")} / {outputUnit}</p></div>
            <div><p className="text-xs text-muted-foreground">{ar ? "عدد المكونات" : "Ingredients"}</p>
              <p className="font-semibold">{costSummary.count}</p></div>
          </div>
        </div>
      )}

      {/* Add ingredient form */}
      {canWrite && (
        <AddIngredientForm materialId={materialId} rawMaterials={rawMaterials}
          existingIds={items.map(i => i.ingredientId)} ar={ar} isRTL={isRTL}
          onAdded={() => utils.semiFinished.getRecipe.invalidate({ materialId })}
        />
      )}
    </>
  );
}

// ─── Ingredient Row ───────────────────────────────────────────────────────────
function IngredientRow({ item, materialId, ar, isRTL, canWrite, onDelete }: {
  item: RecipeItem; materialId: number; ar: boolean; isRTL: boolean; canWrite: boolean; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit);
  const [waste, setWaste] = useState(item.expectedWastePercent ?? "0");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const utils = trpc.useUtils();

  const updateMutation = trpc.semiFinished.updateItem.useMutation({
    onSuccess: () => { utils.semiFinished.getRecipe.invalidate({ materialId }); setEditing(false); toast.success(ar ? "تم التحديث" : "Updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const price = parseFloat(item.lastPurchasePrice ?? "0") || 0;
  const qtyNum = parseFloat(item.quantity) || 0;
  const qtyInBase = convertToBaseUnit(qtyNum, item.unit, item.ingredientUnit);
  const cost = qtyInBase * price;
  const wasteNum = parseFloat(item.expectedWastePercent ?? "0") || 0;
  const ingName = ar && item.ingredientNameAr ? item.ingredientNameAr : item.ingredientName;

  // Show unit mismatch warning
  const unitMismatch = normalizeUnit(item.unit) !== normalizeUnit(item.ingredientUnit) &&
    normalizeUnit(item.unit) !== "pcs" && normalizeUnit(item.ingredientUnit) !== "pcs";

  return (
    <>
      <tr className={`border-t border-border/50 hover:bg-muted/20 text-xs ${isRTL ? "text-right" : ""}`}>
        <td className="px-4 py-2 font-medium">
          <div className={`flex items-center gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
            {ingName}
            {unitMismatch && (
              <span title={ar ? `وحدة المخزون: ${item.ingredientUnit}` : `Inventory unit: ${item.ingredientUnit}`}>
                <AlertTriangle size={10} className="text-amber-500" />
              </span>
            )}
            {!price && <span title={ar ? "لا يوجد سعر" : "No price"}><AlertTriangle size={10} className="text-amber-500" /></span>}
          </div>
        </td>
        {editing ? (
          <>
            <td className="px-4 py-2"><NumericInput value={qty} onChange={e => setQty((e.target as HTMLInputElement).value)} className="h-7 w-20 text-xs" min={0} step={0.001} /></td>
            <td className="px-4 py-2">
              <select value={unit} onChange={e => setUnit(e.target.value)} className="h-7 px-1 rounded border border-input bg-background text-xs">
                {OUTPUT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </td>
            <td className="px-4 py-2 text-muted-foreground">{price ? fmtCurrency(price, ar ? "ar" : "en") : "—"}</td>
            <td className="px-4 py-2">{price ? fmtCurrency(convertToBaseUnit(parseFloat(qty||"0"), unit, item.ingredientUnit)*price, ar?"ar":"en") : "—"}</td>
            <td className="px-4 py-2"><NumericInput value={waste} onChange={e => setWaste((e.target as HTMLInputElement).value)} className="h-7 w-14 text-xs" min={0} max={100} step={0.1} /></td>
            <td className="px-4 py-2"><Input value={notes} onChange={e => setNotes(e.target.value)} className="h-7 text-xs w-24" /></td>
            <td className="px-3 py-2">
              <div className={`flex gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                <Button size="sm" className="h-6 px-2 text-[10px]" disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: item.id, quantity: qty, unit, expectedWastePercent: waste, notes: notes||undefined })}>
                  {ar ? "حفظ" : "Save"}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditing(false)}>{ar ? "إلغاء" : "Cancel"}</Button>
              </div>
            </td>
          </>
        ) : (
          <>
            <td className="px-4 py-2">{fmtQty(qtyNum)}</td>
            <td className="px-4 py-2 text-muted-foreground">{item.unit}</td>
            <td className="px-4 py-2 text-muted-foreground">{price ? fmtCurrency(price, ar ? "ar" : "en") : <span className="text-amber-500">—</span>}</td>
            <td className="px-4 py-2 font-medium">{price ? fmtCurrency(cost, ar ? "ar" : "en") : <span className="text-amber-500">—</span>}</td>
            <td className="px-4 py-2">{wasteNum > 0 ? <span className="text-orange-600 font-medium">{wasteNum}%</span> : <span className="text-muted-foreground">—</span>}</td>
            <td className="px-4 py-2 text-muted-foreground truncate max-w-[100px]">{item.notes || "—"}</td>
            {canWrite && (
              <td className="px-3 py-2">
                <div className={`flex gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-blue-600" onClick={() => setEditing(true)}><Pencil size={11} /></Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-red-600" onClick={() => setDeleteConfirm(true)}><Trash2 size={11} /></Button>
                </div>
              </td>
            )}
          </>
        )}
      </tr>
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ar ? "حذف المكوّن؟" : "Delete ingredient?"}</AlertDialogTitle>
            <AlertDialogDescription>{ingName}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white">{ar ? "حذف" : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Add Ingredient Form ──────────────────────────────────────────────────────
function AddIngredientForm({ materialId, rawMaterials, existingIds, ar, isRTL, onAdded }: {
  materialId: number; rawMaterials: any[]; existingIds: number[]; ar: boolean; isRTL: boolean; onAdded: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedMat, setSelectedMat] = useState<any>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const [waste, setWaste] = useState("0");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const addMutation = trpc.semiFinished.addItem.useMutation({
    onSuccess: () => {
      utils.semiFinished.getRecipe.invalidate({ materialId });
      onAdded();
      setSelectedMat(null); setQty(""); setUnit("kg"); setWaste("0"); setNotes(""); setShowForm(false);
      toast.success(ar ? "تمت إضافة المكوّن" : "Ingredient added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const available = rawMaterials.filter((m: any) => m.materialType !== "semi_finished" && !existingIds.includes(m.id));
  const filteredMats = search ? available.filter((m: any) =>
    m.name.toLowerCase().includes(search.toLowerCase()) || (m.nameAr ?? "").includes(search) || (m.code ?? "").toLowerCase().includes(search.toLowerCase())
  ) : available;

  const handleAdd = () => {
    if (!selectedMat || !qty || parseFloat(qty) <= 0) return toast.error(ar ? "اختر مادة وأدخل كمية صحيحة" : "Select material and enter valid quantity");
    addMutation.mutate({ materialId, ingredientId: selectedMat.id, quantity: qty, unit, expectedWastePercent: waste || "0", notes: notes || undefined });
  };

  if (!showForm) return (
    <div className={`p-3 border-t border-dashed border-border/60 flex ${isRTL ? "flex-row-reverse" : ""}`}>
      <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowForm(true)}>
        <Plus size={12} /> {ar ? "إضافة مكوّن" : "Add Ingredient"}
      </Button>
    </div>
  );

  const previewCost = selectedMat?.lastPurchasePrice && qty
    ? convertToBaseUnit(parseFloat(qty || "0"), unit, selectedMat.unit || "kg") * parseFloat(selectedMat.lastPurchasePrice)
    : null;

  return (
    <div className={`p-3.5 border-t border-dashed border-border/60 bg-muted/20 space-y-3 ${isRTL ? "text-right" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <p className="text-xs font-medium text-muted-foreground">{ar ? "إضافة مكوّن جديد" : "Add New Ingredient"}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {/* Material */}
        <div className="col-span-2">
          <Label className="text-[11px]">{ar ? "المادة الخام *" : "Raw Material *"}</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={`w-full h-8 justify-between text-[11px] font-normal mt-0.5 ${!selectedMat ? "text-muted-foreground" : ""}`}>
                {selectedMat ? (ar && selectedMat.nameAr ? selectedMat.nameAr : selectedMat.name) : (ar ? "اختر..." : "Select...")}
                <ChevronDown size={11} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align={isRTL ? "end" : "start"}>
              <Command>
                <CommandInput placeholder={ar ? "بحث..." : "Search..."} value={search} onValueChange={setSearch} />
                <CommandList>
                  <CommandEmpty>{ar ? "لا توجد نتائج" : "No results"}</CommandEmpty>
                  <CommandGroup>
                    {filteredMats.slice(0, 50).map((m: any) => (
                      <CommandItem key={m.id} onSelect={() => { setSelectedMat(m); setUnit(m.unit || "kg"); setOpen(false); setSearch(""); }}>
                        <span className="text-xs">{ar && m.nameAr ? m.nameAr : m.name}</span>
                        <span className="text-[10px] text-muted-foreground ms-auto">{m.unit}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Qty */}
        <div>
          <Label className="text-[11px]">{ar ? "الكمية *" : "Quantity *"}</Label>
          <NumericInput value={qty} onChange={e => setQty((e.target as HTMLInputElement).value)} className="h-8 text-xs mt-0.5" min={0} step={0.001} placeholder="0.000" />
        </div>

        {/* Unit */}
        <div>
          <Label className="text-[11px]">{ar ? "الوحدة" : "Unit"}</Label>
          <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full h-8 mt-0.5 px-2 rounded-md border border-input bg-background text-xs">
            {OUTPUT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {/* Unit cost (auto) */}
        <div>
          <Label className="text-[11px]">{ar ? "سعر الوحدة" : "Unit Cost"}</Label>
          <Input readOnly value={selectedMat?.lastPurchasePrice ? fmtCurrency(selectedMat.lastPurchasePrice, ar ? "ar" : "en") : "—"} className="h-8 text-xs mt-0.5 bg-muted/40 cursor-default" />
        </div>

        {/* Ingredient cost preview */}
        <div>
          <Label className="text-[11px]">{ar ? "تكلفة المكوّن" : "Ingr. Cost"}</Label>
          <Input readOnly value={previewCost !== null ? fmtCurrency(previewCost, ar ? "ar" : "en") : "—"} className="h-8 text-xs mt-0.5 bg-muted/40 cursor-default text-emerald-600 font-medium" />
        </div>

        {/* Waste */}
        <div>
          <Label className="text-[11px]">{ar ? "هالك %" : "Waste %"}</Label>
          <NumericInput value={waste} onChange={e => setWaste((e.target as HTMLInputElement).value)} className="h-8 text-xs mt-0.5" min={0} max={100} step={0.1} placeholder="0" />
        </div>

        {/* Notes */}
        <div className="col-span-2">
          <Label className="text-[11px]">{ar ? "ملاحظات" : "Notes"}</Label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-xs mt-0.5" />
        </div>
      </div>

      {/* Unit mismatch warning */}
      {selectedMat && normalizeUnit(unit) !== normalizeUnit(selectedMat.unit) && normalizeUnit(unit) !== "pcs" && (
        <div className={`flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded px-2.5 py-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
          <AlertTriangle size={11} />
          {ar ? `تحويل وحدات: ${qty || "X"} ${unit} → ${convertToBaseUnit(parseFloat(qty||"0"), unit, selectedMat.unit||"kg").toFixed(4)} ${selectedMat.unit}` : `Unit conversion: ${qty || "X"} ${unit} → ${convertToBaseUnit(parseFloat(qty||"0"), unit, selectedMat.unit||"kg").toFixed(4)} ${selectedMat.unit}`}
        </div>
      )}

      <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
        <Button size="sm" onClick={handleAdd} disabled={addMutation.isPending} className="h-8 gap-1.5 text-xs">
          {addMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {ar ? "إضافة" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setSelectedMat(null); setQty(""); }} className="h-8 text-xs">
          {ar ? "إلغاء" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

// ─── Usage Panel ──────────────────────────────────────────────────────────────
function UsagePanel({ materialId, ar, isRTL }: { materialId: number; ar: boolean; isRTL: boolean }) {
  const { data, isLoading } = trpc.semiFinished.getUsage.useQuery({ materialId });

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;
  const productList = (data as any)?.products ?? [];
  const sfList = (data as any)?.semiFinished ?? [];
  const pullList = (data as any)?.kitchenPulls ?? [];
  const formalTotal = productList.length + sfList.length;

  return (
    <div className={`p-4 space-y-4 ${isRTL ? "text-right" : ""}`}>

      {/* ── Formal recipe linkage ── */}
      <div className="space-y-1.5">
        <div className={`flex items-center gap-2 text-xs font-medium text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}>
          <Link2 size={12} />
          {ar ? "مُدرجة في وصفات المنتجات" : "In Product Recipes"}
          {formalTotal > 0 && <span className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 rounded-full">{formalTotal}</span>}
        </div>
        {formalTotal === 0 ? (
          <p className="text-xs text-muted-foreground ps-5">{ar ? "لم تُربط بوصفات منتجات بعد" : "Not linked to any product recipes yet"}</p>
        ) : (
          <div className="space-y-1">
            {productList.map((p: any, i: number) => (
              <div key={i} className={`flex items-center justify-between gap-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg px-3 py-2 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <ChefHat size={12} className="text-blue-500 shrink-0" />
                  <span className="font-medium">{ar && p.productNameAr ? p.productNameAr : p.productName}</span>
                </div>
                <span className="text-muted-foreground">{p.quantity} {p.unit}</span>
              </div>
            ))}
            {sfList.map((s: any, i: number) => (
              <div key={i} className={`flex items-center justify-between gap-2 bg-purple-50 dark:bg-purple-950/20 rounded-lg px-3 py-2 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <FlaskConical size={12} className="text-purple-500 shrink-0" />
                  <span className="font-medium">{ar && s.parentNameAr ? s.parentNameAr : s.parentName}</span>
                </div>
                <span className="text-muted-foreground">{s.quantity} {s.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Kitchen production pulls (actual usage) ── */}
      <div className="space-y-1.5 border-t border-border/60 pt-3">
        <div className={`flex items-center gap-2 text-xs font-medium text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}>
          <ChefHat size={12} />
          {ar ? "صرف فعلي من المطبخ" : "Actual Kitchen Usage"}
          {pullList.length > 0 && <span className="bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-[10px] px-1.5 rounded-full">{pullList.length}</span>}
        </div>
        {pullList.length === 0 ? (
          <p className="text-xs text-muted-foreground ps-5">{ar ? "لا يوجد صرف مسجّل من المطبخ" : "No kitchen pull records found"}</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {pullList.map((pull: any, i: number) => {
              const qty = parseFloat(pull.pulledQuantity || "0");
              const date = new Date(pull.pullDate).toLocaleDateString(ar ? "ar-AE" : "en-AE", { month: "short", day: "numeric", year: "numeric" });
              return (
                <div key={i} className={`flex items-center justify-between gap-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg px-3 py-2 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${pull.status === "closed" ? "bg-emerald-500" : pull.status === "counted" ? "bg-blue-500" : "bg-orange-500"}`} />
                    <span className="text-muted-foreground" dir="ltr">{date}</span>
                    {pull.notes && <span className="text-muted-foreground truncate max-w-[100px]">{pull.notes}</span>}
                  </div>
                  <span className="font-medium text-orange-700 dark:text-orange-300 shrink-0">
                    {qty.toFixed(3)} {pull.unit}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Version History Panel ────────────────────────────────────────────────────
function VersionHistoryPanel({ materialId, currentVersion, ar, isRTL }: {
  materialId: number; currentVersion: number; ar: boolean; isRTL: boolean;
}) {
  const { data: versions = [], isLoading } = trpc.semiFinished.getVersionHistory.useQuery({ materialId });

  if (isLoading) return <div className="p-6 flex justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className={`p-4 space-y-2 ${isRTL ? "text-right" : ""}`}>
      <div className={`flex items-center gap-2 text-xs font-medium text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}>
        <History size={13} /> {ar ? "سجل الإصدارات" : "Version History"}
        <span className="ms-1">{ar ? `الإصدار الحالي: v${currentVersion}` : `Current: v${currentVersion}`}</span>
      </div>
      {versions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{ar ? "لا يوجد سجل إصدارات بعد — يُحفظ عند الاعتماد" : "No version history yet — saved when approving"}</p>
      ) : (
        <div className="space-y-1.5">
          {(versions as any[]).map((v: any) => (
            <div key={v.id} className={`flex items-center justify-between gap-3 bg-muted/30 rounded-lg px-3 py-2.5 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <span className="font-mono font-semibold text-purple-600 w-8">v{v.version}</span>
                <StatusBadge status={v.status as RecipeStatus} ar={ar} />
                <div className={isRTL ? "text-right" : ""}>
                  {v.changeLog && <p className="text-muted-foreground truncate max-w-[200px]">{v.changeLog}</p>}
                  {v.approvedByName && <p className="text-[10px] text-muted-foreground">{ar ? "بواسطة: " : "By: "}{v.approvedByName}</p>}
                </div>
              </div>
              <div className={`shrink-0 ${isRTL ? "text-left" : "text-right"}`}>
                <p className="font-semibold text-emerald-600">{v.totalCost ? fmtCurrency(v.totalCost, ar ? "ar" : "en") : "—"}</p>
                <p className="text-muted-foreground">{fmtDate(v.createdAt, ar ? "ar" : "en")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Recipe Meta Dialog (Add / Edit) ─────────────────────────────────────────
function RecipeMetaDialog({ mode, material, categories, ar, isRTL, onClose, onSaved }: {
  mode: "add" | "edit"; material?: SemiMaterial; categories: any[];
  ar: boolean; isRTL: boolean; onClose: () => void; onSaved: (id?: number) => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: material?.name ?? "",
    nameAr: material?.nameAr ?? "",
    code: material?.code ?? "",
    categoryId: material?.categoryId ? String(material.categoryId) : "",
    unit: material?.unit ?? "kg",
    outputQuantity: material?.outputQuantity ? String(parseFloat(material.outputQuantity)) : "1",
    shelfLife: material?.shelfLife ? String(material.shelfLife) : "",
    storageLocation: material?.storageLocation ?? "",
    defaultWastePercent: material?.defaultWastePercent ? String(parseFloat(material.defaultWastePercent)) : "0",
    notes: material?.notes ?? "",
  });
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const createMutation = trpc.semiFinished.create.useMutation({
    onSuccess: (res: any) => { utils.semiFinished.list.invalidate(); toast.success(ar ? "تمت إضافة الوصفة" : "Recipe added"); onSaved(res.id); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.semiFinished.update.useMutation({
    onSuccess: () => { utils.semiFinished.list.invalidate(); toast.success(ar ? "تم التحديث" : "Updated"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(ar ? "الاسم الإنجليزي مطلوب" : "English name required");
    if (!form.nameAr.trim()) return toast.error(ar ? "الاسم العربي مطلوب" : "Arabic name required");
    if (!form.outputQuantity || parseFloat(form.outputQuantity) <= 0) return toast.error(ar ? "كمية الناتج يجب أن تكون أكبر من صفر" : "Output quantity must be > 0");
    const payload = {
      name: form.name.trim(), nameAr: form.nameAr.trim() || undefined, code: form.code.trim() || undefined,
      unit: form.unit, outputQuantity: parseFloat(form.outputQuantity) || 1,
      shelfLife: form.shelfLife ? parseInt(form.shelfLife) : undefined,
      storageLocation: form.storageLocation || undefined,
      defaultWastePercent: parseFloat(form.defaultWastePercent) || 0,
      categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      notes: form.notes.trim() || undefined,
    };
    mode === "add" ? createMutation.mutate(payload) : updateMutation.mutate({ id: material!.id, ...payload });
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical size={18} className="text-purple-600" />
            {mode === "add" ? (ar ? "إضافة وصفة جديدة" : "Add New Recipe") : (ar ? "تعديل الوصفة" : "Edit Recipe")}
          </DialogTitle>
          {mode === "add" && <p className="text-xs text-muted-foreground">{ar ? "تبدأ الوصفات الجديدة كـ «مسودة»" : "New recipes start as Draft"}</p>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{ar ? "الاسم (إنجليزي) *" : "Name (English) *"}</Label><Input value={form.name} onChange={e => f("name", e.target.value)} required dir="ltr" /></div>
            <div><Label>{ar ? "الاسم (عربي) *" : "Name (Arabic) *"}</Label><Input value={form.nameAr} onChange={e => f("nameAr", e.target.value)} required dir="rtl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{ar ? "الكود الداخلي" : "Internal Code"}</Label>
              <Input value={form.code} onChange={e => f("code", e.target.value)} placeholder={ar ? "تلقائي إن تُرك فارغاً" : "Auto-generated if empty"} dir="ltr" /></div>
            <div><Label>{ar ? "التصنيف" : "Category"}</Label>
              <select value={form.categoryId} onChange={e => f("categoryId", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="">—</option>
                {(categories as any[]).map((c: any) => <option key={c.id} value={c.id}>{ar && c.nameAr ? c.nameAr : c.name}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{ar ? "وحدة الناتج *" : "Output Unit *"}</Label>
              <select value={form.unit} onChange={e => f("unit", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                {OUTPUT_UNITS.map(u => <option key={u} value={u}>{u}{ar ? ` — ${UNIT_LABELS[u] ?? u}` : ""}</option>)}
              </select></div>
            <div><Label>{ar ? "كمية الناتج المعياري *" : "Standard Output *"}</Label>
              <NumericInput value={form.outputQuantity} onChange={e => f("outputQuantity", (e.target as HTMLInputElement).value)} min={0.001} step={0.001} placeholder="1" className="h-10" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>{ar ? "مدة الصلاحية (أيام)" : "Shelf Life (days)"}</Label>
              <NumericInput value={form.shelfLife} onChange={e => f("shelfLife", (e.target as HTMLInputElement).value)} min={0} step={1} placeholder={ar ? "اختياري" : "Optional"} className="h-10" /></div>
            <div><Label>{ar ? "مكان التخزين" : "Storage Location"}</Label>
              <select value={form.storageLocation} onChange={e => f("storageLocation", e.target.value)} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="">—</option>
                {STORAGE_LOCATIONS.map((loc, i) => <option key={loc} value={loc}>{ar ? STORAGE_LOCATIONS_AR[i] : loc}</option>)}
              </select></div>
            <div><Label>{ar ? "هالك افتراضي %" : "Default Waste %"}</Label>
              <NumericInput value={form.defaultWastePercent} onChange={e => f("defaultWastePercent", (e.target as HTMLInputElement).value)} min={0} max={100} step={0.1} placeholder="0" className="h-10" /></div>
          </div>
          <div><Label>{ar ? "ملاحظات" : "Notes"}</Label><Textarea rows={2} value={form.notes} onChange={e => f("notes", e.target.value)} /></div>
          <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <Button type="button" variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {mode === "add" ? (ar ? "إضافة الوصفة" : "Add Recipe") : (ar ? "حفظ التعديلات" : "Save Changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
