import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  ArrowDownCircle, ArrowUpCircle, Download, BookOpen, Trash2,
  RotateCcw, Eye, AlertTriangle, Loader2, Search, X, Filter,
  ChevronDown, ChevronRight, Package, Boxes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Pagination, usePagination } from "@/components/Pagination";

// ─── Movement type config ─────────────────────────────────────────────────────
function getMovementLabel(type: string, reason: string | null, ar: boolean) {
  const key = `${type}_${reason ?? ""}`;
  const MAP: Record<string, { ar: string; en: string; color: string }> = {
    "IN_purchase":        { ar: "استلام مشتريات",  en: "Purchase In",         color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    "IN_production":      { ar: "ناتج إنتاج",      en: "Production Output",    color: "bg-blue-100 text-blue-700 border-blue-200" },
    "IN_return":          { ar: "إرجاع وارد",       en: "Return In",            color: "bg-teal-100 text-teal-700 border-teal-200" },
    "IN_adjustment":      { ar: "تسوية زيادة",      en: "Adjustment In",        color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
    "IN_transfer":        { ar: "تحويل وارد",       en: "Transfer In",          color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
    "IN_opening_balance": { ar: "رصيد افتتاحي",    en: "Opening Balance",      color: "bg-gray-100 text-gray-700 border-gray-200" },
    "OUT_production":     { ar: "استهلاك إنتاج",   en: "Production Use",       color: "bg-orange-100 text-orange-700 border-orange-200" },
    "OUT_waste":          { ar: "هدر / تلف",        en: "Waste / Damage",       color: "bg-red-100 text-red-700 border-red-200" },
    "OUT_return":         { ar: "إرجاع لمورد",      en: "Return to Supplier",   color: "bg-rose-100 text-rose-700 border-rose-200" },
    "OUT_adjustment":     { ar: "تسوية نقص",        en: "Adjustment Out",       color: "bg-amber-100 text-amber-700 border-amber-200" },
    "OUT_transfer":       { ar: "تحويل صادر",       en: "Transfer Out",         color: "bg-violet-100 text-violet-700 border-violet-200" },
    "OUT_purchase":       { ar: "مرتجع شراء",       en: "Purchase Return",      color: "bg-pink-100 text-pink-700 border-pink-200" },
    "OUT_other":          { ar: "خروج أخرى",        en: "Other Out",            color: "bg-slate-100 text-slate-700 border-slate-200" },
    "ADJUSTMENT_adjustment": { ar: "تسوية مخزون", en: "Stock Adjustment",      color: "bg-purple-100 text-purple-700 border-purple-200" },
  };
  return MAP[key] ?? (type === "IN"
    ? { ar: "وارد", en: "Stock In", color: "bg-emerald-100 text-emerald-700 border-emerald-200" }
    : type === "OUT"
    ? { ar: "صادر", en: "Stock Out", color: "bg-red-100 text-red-700 border-red-200" }
    : { ar: "تسوية", en: "Adjustment", color: "bg-purple-100 text-purple-700 border-purple-200" });
}

const STATUS_CFG: Record<string, { ar: string; en: string; color: string }> = {
  posted:    { ar: "مرحّل",    en: "Posted",    color: "bg-emerald-100 text-emerald-700" },
  draft:     { ar: "مسودة",    en: "Draft",     color: "bg-gray-100 text-gray-600" },
  reversed:  { ar: "مُعكوس",   en: "Reversed",  color: "bg-amber-100 text-amber-700" },
  cancelled: { ar: "ملغي",     en: "Cancelled", color: "bg-red-100 text-red-700" },
};

function fmtQty(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return n % 1 === 0 ? n.toString() : n.toFixed(3).replace(/\.?0+$/, "");
}
function fmtCurrency(v: string | number | null | undefined, ar: boolean) {
  const n = parseFloat(String(v ?? "0")) || 0;
  if (n === 0) return "—";
  return ar
    ? `${n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ`
    : `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDateTime(d: Date | string, ar: boolean) {
  return new Date(d).toLocaleString(ar ? "ar-AE" : "en-AE", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const { isRTL, language } = useLanguage();
  const ar = language === "ar";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canWrite = user?.role !== "viewer";

  const [txPage, setTxPage] = useState(1);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [reverseTarget, setReverseTarget] = useState<{ id: number; name: string } | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    transactionType: "all" as "all" | "IN" | "OUT" | "ADJUSTMENT",
    reason: "all",
    movementStatus: "all",
    materialId: "all",
    dateFrom: "",
    dateTo: "",
    limit: 200,
  });

  const f = (k: keyof typeof filters, v: any) => { setFilters(p => ({ ...p, [k]: v })); setTxPage(1); };

  const utils = trpc.useUtils();

  // Build query input
  const queryInput = useMemo(() => {
    const inp: any = { limit: filters.limit };
    if (filters.transactionType !== "all") inp.transactionType = filters.transactionType;
    if (filters.reason !== "all") inp.reason = filters.reason;
    if (filters.movementStatus !== "all") inp.movementStatus = filters.movementStatus;
    if (filters.materialId !== "all") inp.materialId = Number(filters.materialId);
    if (filters.dateFrom) inp.dateFrom = new Date(filters.dateFrom);
    if (filters.dateTo) inp.dateTo = new Date(filters.dateTo);
    return inp;
  }, [filters]);

  const txQuery = trpc.inventory.transactions.useQuery(queryInput);
  const materialsQuery = trpc.materials.list.useQuery({});
  const txList = (txQuery.data ?? []) as any[];

  const deleteMutation = trpc.inventory.deleteTransaction.useMutation({
    onSuccess: () => { toast.success(ar ? "تم حذف الحركة" : "Movement deleted"); utils.inventory.transactions.invalidate(); setDeleteId(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const reverseMutation = trpc.inventory.reverseTransaction.useMutation({
    onSuccess: (res: any) => {
      toast.success(ar ? `تم إنشاء حركة عكسية #${res.reversingId}` : `Reversing movement #${res.reversingId} created`);
      utils.inventory.transactions.invalidate();
      utils.materials.list.invalidate();
      setReverseTarget(null);
      setReverseReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Compute running balance per material (for single-material filter only)
  const txWithBalance = useMemo(() => {
    if (filters.materialId === "all") return txList;
    // Sort oldest first to compute running balance
    const sorted = [...txList].sort((a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime());
    let balance = 0;
    const withBal = sorted.map(tx => {
      const qty = parseFloat(tx.quantity) || 0;
      const before = balance;
      if (tx.transactionType === "IN") balance += qty;
      else if (tx.transactionType === "OUT") balance -= qty;
      // ADJUSTMENT: check sign (quantityBefore/After in DB, or derive)
      return { ...tx, _balanceBefore: before, _balanceAfter: balance };
    });
    // Return newest first
    return withBal.reverse();
  }, [txList, filters.materialId]);

  const pagination = usePagination(txWithBalance, 20);
  const pagedTx = pagination.paginate(txPage);

  // KPI
  const kpis = useMemo(() => {
    const inRows = txList.filter((t: any) => t.transactionType === "IN");
    const outRows = txList.filter((t: any) => t.transactionType === "OUT");
    const totalIn = inRows.reduce((s: number, t: any) => s + (parseFloat(t.quantity) || 0), 0);
    const totalOut = outRows.reduce((s: number, t: any) => s + (parseFloat(t.quantity) || 0), 0);
    const totalInVal = inRows.reduce((s: number, t: any) => s + (parseFloat(t.totalAmount ?? "0") || 0), 0);
    const totalOutVal = outRows.reduce((s: number, t: any) => s + (parseFloat(t.totalAmount ?? "0") || 0), 0);
    const reversed = txList.filter((t: any) => t.movementStatus === "reversed").length;
    return { totalIn, totalOut, totalInVal, totalOutVal, count: txList.length, reversed };
  }, [txList]);

  const activeFilterCount = [
    filters.transactionType !== "all", filters.reason !== "all",
    filters.movementStatus !== "all", filters.materialId !== "all",
    !!filters.dateFrom, !!filters.dateTo,
  ].filter(Boolean).length;

  // CSV export
  const exportCsv = () => {
    const headers = ar
      ? ["#","النوع","السبب","المادة","الكمية","وحدة","سعر الوحدة","القيمة الإجمالية","المورد/الوجهة","المرجع","نوع المرجع","الحالة","التاريخ","ملاحظات"]
      : ["#","Type","Reason","Material","Qty","Unit","Unit Price","Total Value","Supplier/Dest","Reference","Ref Type","Status","Date","Notes"];
    const rows = txWithBalance.map((t: any) => [
      t.id, t.transactionType, t.reason ?? "", ar && t.materialNameAr ? t.materialNameAr : (t.materialName ?? ""),
      t.quantity, t.materialUnit ?? "", t.unitPrice ?? "", t.totalAmount ?? "",
      t.supplierName ?? t.destination ?? "", t.referenceNumber ?? "", t.referenceType ?? "",
      t.movementStatus ?? "posted", fmtDateTime(t.transactionDate, false), t.notes ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `inventory-ledger-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <div className="space-y-5 p-4 md:p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className={`flex items-start justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen size={24} className="text-blue-600" />
            {ar ? "سجل حركات المخزون" : "Inventory Movement Ledger"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {ar
              ? "سجل تفصيلي لكل حركات دخول وخروج وتعديل المخزون مع تتبع المصدر والسبب والتكلفة والرصيد بعد كل حركة."
              : "Detailed audit trail for every stock in, stock out, production, waste, adjustment, and transfer movement."}
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="gap-2 shrink-0">
          <Download size={15} /> {ar ? "تصدير CSV" : "Export CSV"}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: ar ? "إجمالي الحركات" : "Total Movements", value: kpis.count.toString(), color: "blue", icon: <BookOpen size={15} /> },
          { label: ar ? "إجمالي الوارد (كمية)" : "Total In (qty)", value: fmtQty(kpis.totalIn), color: "emerald", icon: <ArrowDownCircle size={15} /> },
          { label: ar ? "إجمالي الصادر (كمية)" : "Total Out (qty)", value: fmtQty(kpis.totalOut), color: "red", icon: <ArrowUpCircle size={15} /> },
          { label: ar ? "قيمة المشتريات" : "Purchase Value", value: fmtCurrency(kpis.totalInVal, ar), color: "purple", icon: <Package size={15} /> },
        ].map((k, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-3 flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-${k.color}-100 dark:bg-${k.color}-950/40 text-${k.color}-600`}>{k.icon}</div>
            <div className={isRTL ? "text-right" : ""}>
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
              <p className="text-base font-bold">{txQuery.isLoading ? "…" : k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className={`flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40 ${isRTL ? "flex-row-reverse" : ""}`}>
          <button
            className={`flex items-center gap-2 text-sm font-semibold text-foreground ${isRTL ? "flex-row-reverse" : ""}`}
            onClick={() => setShowFilters(p => !p)}
          >
            <Filter size={14} />
            {ar ? "تصفية الحركات" : "Filter Movements"}
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{activeFilterCount}</span>
            )}
            {showFilters ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1"
              onClick={() => setFilters(p => ({ ...p, transactionType: "all", reason: "all", movementStatus: "all", materialId: "all", dateFrom: "", dateTo: "" }))}>
              <X size={11} />{ar ? "مسح" : "Clear"}
            </Button>
          )}
        </div>
        {showFilters && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Type */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">{ar ? "اتجاه الحركة" : "Direction"}</label>
              <Select value={filters.transactionType} onValueChange={v => f("transactionType", v)}>
                <SelectTrigger className={`h-9 mt-1 text-xs ${filters.transactionType !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "الكل" : "All"}</SelectItem>
                  <SelectItem value="IN">{ar ? "وارد (IN)" : "Stock In"}</SelectItem>
                  <SelectItem value="OUT">{ar ? "صادر (OUT)" : "Stock Out"}</SelectItem>
                  <SelectItem value="ADJUSTMENT">{ar ? "تسوية" : "Adjustment"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">{ar ? "السبب" : "Reason"}</label>
              <Select value={filters.reason} onValueChange={v => f("reason", v)}>
                <SelectTrigger className={`h-9 mt-1 text-xs ${filters.reason !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الأسباب" : "All Reasons"}</SelectItem>
                  <SelectItem value="purchase">{ar ? "شراء" : "Purchase"}</SelectItem>
                  <SelectItem value="production">{ar ? "إنتاج" : "Production"}</SelectItem>
                  <SelectItem value="waste">{ar ? "هدر / تلف" : "Waste"}</SelectItem>
                  <SelectItem value="transfer">{ar ? "تحويل" : "Transfer"}</SelectItem>
                  <SelectItem value="return">{ar ? "مرتجع" : "Return"}</SelectItem>
                  <SelectItem value="adjustment">{ar ? "تسوية" : "Adjustment"}</SelectItem>
                  <SelectItem value="opening_balance">{ar ? "رصيد افتتاحي" : "Opening Balance"}</SelectItem>
                  <SelectItem value="other">{ar ? "أخرى" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">{ar ? "الحالة" : "Status"}</label>
              <Select value={filters.movementStatus} onValueChange={v => f("movementStatus", v)}>
                <SelectTrigger className={`h-9 mt-1 text-xs ${filters.movementStatus !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الحالات" : "All Statuses"}</SelectItem>
                  <SelectItem value="posted">{ar ? "مرحّل" : "Posted"}</SelectItem>
                  <SelectItem value="draft">{ar ? "مسودة" : "Draft"}</SelectItem>
                  <SelectItem value="reversed">{ar ? "مُعكوس" : "Reversed"}</SelectItem>
                  <SelectItem value="cancelled">{ar ? "ملغي" : "Cancelled"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Material */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">{ar ? "المادة" : "Material"}</label>
              <Select value={filters.materialId} onValueChange={v => f("materialId", v)}>
                <SelectTrigger className={`h-9 mt-1 text-xs ${filters.materialId !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue placeholder={ar ? "كل المواد" : "All Materials"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل المواد" : "All Materials"}</SelectItem>
                  {(materialsQuery.data as any[] ?? []).map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>{ar && m.nameAr ? m.nameAr : m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date From */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">{ar ? "من تاريخ" : "From"}</label>
              <Input type="datetime-local" value={filters.dateFrom} onChange={e => f("dateFrom", e.target.value)} className={`h-9 mt-1 text-xs ${filters.dateFrom ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`} />
            </div>

            {/* Date To */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase">{ar ? "إلى تاريخ" : "To"}</label>
              <Input type="datetime-local" value={filters.dateTo} onChange={e => f("dateTo", e.target.value)} className={`h-9 mt-1 text-xs ${filters.dateTo ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`} />
            </div>
          </div>
        )}
      </div>

      {/* Quick date presets */}
      <div className={`flex gap-2 flex-wrap ${isRTL ? "flex-row-reverse" : ""}`}>
        {[
          { label: ar ? "اليوم" : "Today", days: 0 },
          { label: ar ? "هذا الأسبوع" : "This Week", days: 7 },
          { label: ar ? "هذا الشهر" : "This Month", days: 30 },
          { label: ar ? "٣ أشهر" : "3 Months", days: 90 },
        ].map(preset => (
          <button key={preset.label} type="button"
            className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            onClick={() => {
              const to = new Date();
              const from = new Date(to);
              from.setDate(from.getDate() - (preset.days || 1));
              if (preset.days === 0) { from.setHours(0, 0, 0, 0); }
              f("dateFrom", from.toISOString().slice(0, 16));
              f("dateTo", to.toISOString().slice(0, 16));
            }}>
            {preset.label}
          </button>
        ))}
        {(filters.dateFrom || filters.dateTo) && (
          <button type="button" className="text-xs px-3 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
            onClick={() => { f("dateFrom", ""); f("dateTo", ""); }}>
            <X size={10} />{ar ? "مسح التاريخ" : "Clear dates"}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground text-xs">
              <tr className={isRTL ? "text-right" : "text-left"}>
                <th className="px-3 py-2.5 font-semibold w-12">#</th>
                <th className="px-3 py-2.5 font-semibold">{ar ? "التاريخ والوقت" : "Date & Time"}</th>
                <th className="px-3 py-2.5 font-semibold">{ar ? "نوع الحركة" : "Movement Type"}</th>
                <th className="px-3 py-2.5 font-semibold">{ar ? "المادة" : "Material"}</th>
                {filters.materialId !== "all" && (
                  <>
                    <th className="px-3 py-2.5 font-semibold text-end">{ar ? "قبل" : "Before"}</th>
                    <th className="px-3 py-2.5 font-semibold text-end">{ar ? "الحركة" : "Movement"}</th>
                    <th className="px-3 py-2.5 font-semibold text-end">{ar ? "بعد" : "After"}</th>
                  </>
                )}
                {filters.materialId === "all" && (
                  <th className="px-3 py-2.5 font-semibold text-end">{ar ? "الكمية" : "Qty"}</th>
                )}
                <th className="px-3 py-2.5 font-semibold text-end">{ar ? "سعر الوحدة" : "Unit Cost"}</th>
                <th className="px-3 py-2.5 font-semibold text-end">{ar ? "القيمة" : "Value"}</th>
                <th className="px-3 py-2.5 font-semibold">{ar ? "المرجع" : "Reference"}</th>
                <th className="px-3 py-2.5 font-semibold">{ar ? "الحالة" : "Status"}</th>
                <th className="px-3 py-2.5 font-semibold w-20">{ar ? "إجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {txQuery.isLoading ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                  {ar ? "جاري التحميل..." : "Loading..."}
                </td></tr>
              ) : pagedTx.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                  <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                  {ar ? "لا توجد حركات مطابقة للفلاتر المحددة" : "No movements match the selected filters"}
                </td></tr>
              ) : pagedTx.map((tx: any) => {
                const mvCfg = getMovementLabel(tx.transactionType, tx.reason, ar);
                const statusCfg = STATUS_CFG[tx.movementStatus ?? "posted"] ?? STATUS_CFG.posted;
                const qty = parseFloat(tx.quantity) || 0;
                const isOut = tx.transactionType === "OUT";
                const isReversed = tx.movementStatus === "reversed";
                const isDraft = tx.movementStatus === "draft";
                const showBalance = filters.materialId !== "all";
                const matName = ar && tx.materialNameAr ? tx.materialNameAr : (tx.materialName ?? "—");
                const refLabel = tx.supplierName ?? tx.destination ?? "—";

                return (
                  <tr key={tx.id}
                    className={`border-t border-border/50 hover:bg-muted/20 transition-colors text-xs ${isReversed ? "opacity-60 bg-muted/10" : ""}`}>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">{tx.id}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground" dir="ltr">
                      {fmtDateTime(tx.transactionDate, ar)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${mvCfg.color}`}>
                        {isOut ? <ArrowUpCircle size={10} /> : <ArrowDownCircle size={10} />}
                        {ar ? mvCfg.ar : mvCfg.en}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{matName}</div>
                      {tx.materialCode && <div className="text-[10px] text-muted-foreground font-mono">{tx.materialCode}</div>}
                    </td>

                    {showBalance ? (
                      <>
                        <td className={`px-3 py-2.5 text-end text-muted-foreground`}>{fmtQty(tx._balanceBefore)} {tx.materialUnit}</td>
                        <td className={`px-3 py-2.5 text-end font-semibold ${isOut ? "text-red-600" : "text-emerald-600"}`}>
                          {isOut ? "−" : "+"}{fmtQty(qty)} {tx.materialUnit}
                        </td>
                        <td className={`px-3 py-2.5 text-end font-semibold`}>{fmtQty(tx._balanceAfter)} {tx.materialUnit}</td>
                      </>
                    ) : (
                      <td className={`px-3 py-2.5 text-end font-medium ${isOut ? "text-red-600" : "text-emerald-600"}`}>
                        {isOut ? "−" : "+"}{fmtQty(qty)} {tx.materialUnit ?? ""}
                      </td>
                    )}

                    <td className="px-3 py-2.5 text-end text-muted-foreground">{fmtCurrency(tx.unitPrice, ar)}</td>
                    <td className="px-3 py-2.5 text-end font-medium">{fmtCurrency(tx.totalAmount, ar)}</td>

                    <td className="px-3 py-2.5">
                      {tx.referenceNumber ? (
                        <div>
                          <span className="font-mono text-[10px] text-primary">{tx.referenceNumber}</span>
                          {refLabel !== "—" && <div className="text-[10px] text-muted-foreground truncate max-w-[100px]">{refLabel}</div>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium ${statusCfg.color}`}>
                        {ar ? statusCfg.ar : statusCfg.en}
                      </span>
                      {tx.reversingTransactionId && (
                        <div className="text-[10px] text-amber-600 mt-0.5">#{tx.reversingTransactionId}</div>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className={`flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                        {/* Reverse — for posted, non-draft only */}
                        {canWrite && !isDraft && !isReversed && tx.movementStatus !== "cancelled" && (
                          <button
                            className="h-6 w-6 rounded hover:bg-amber-100 hover:text-amber-700 flex items-center justify-center transition-colors text-muted-foreground"
                            title={ar ? "عكس الحركة" : "Reverse"}
                            onClick={() => { setReverseTarget({ id: tx.id, name: matName }); setReverseReason(""); }}
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                        {/* Delete — draft only */}
                        {isAdmin && isDraft && (
                          <button
                            className="h-6 w-6 rounded hover:bg-red-100 hover:text-red-700 flex items-center justify-center transition-colors text-muted-foreground"
                            title={ar ? "حذف مسودة" : "Delete Draft"}
                            onClick={() => setDeleteId(tx.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {ar
              ? `عرض ${pagedTx.length} من ${txWithBalance.length} حركة`
              : `Showing ${pagedTx.length} of ${txWithBalance.length} movements`}
          </p>
          <Pagination
            currentPage={txPage}
            totalPages={pagination.totalPages}
            onPageChange={setTxPage}
            totalItems={pagination.totalItems}
            pageSize={20}
          />
        </div>
      </div>

      {/* Delete Dialog — draft only */}
      <AlertDialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 size={18} className="text-red-600" />
              {ar ? "حذف حركة المخزون" : "Delete Stock Movement"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ar ? "هذه الحركة في حالة مسودة ويمكن حذفها. هل تريد المتابعة؟" : "This is a draft movement and can be deleted. Continue?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-red-600 hover:bg-red-700 text-white">
              {ar ? "نعم، احذف" : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse Transaction Dialog */}
      <AlertDialog open={reverseTarget !== null} onOpenChange={o => !o && setReverseTarget(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw size={18} className="text-amber-600" />
              {ar ? "عكس حركة المخزون" : "Reverse Stock Movement"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span className="block font-medium text-foreground">{reverseTarget?.name}</span>
              <span className="block text-xs">
                {ar
                  ? "لا يمكن حذف حركة مخزون معتمدة. سيتم إنشاء حركة عكسية لتصحيح الرصيد مع الاحتفاظ بسجل التدقيق."
                  : "A posted movement cannot be deleted. A reversing transaction will be created to correct the balance while preserving the audit trail."}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 space-y-1.5">
            <Label className="text-xs">{ar ? "سبب العكس *" : "Reason for reversal *"}</Label>
            <Textarea
              rows={2}
              value={reverseReason}
              onChange={e => setReverseReason(e.target.value)}
              placeholder={ar ? "مثال: إدخال خاطئ، كمية غير صحيحة..." : "e.g. Wrong entry, incorrect quantity..."}
              className="text-sm"
            />
          </div>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel disabled={reverseMutation.isPending}>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reverseTarget && reverseReason.trim() && reverseMutation.mutate({ id: reverseTarget.id, reason: reverseReason.trim() })}
              disabled={!reverseReason.trim() || reverseMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              {reverseMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              {ar ? "إنشاء حركة عكسية" : "Create Reversing Transaction"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
