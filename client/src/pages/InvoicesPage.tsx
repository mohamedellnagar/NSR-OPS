import React, { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/NumericInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import ExpenseImportDialog from "@/components/ExpenseImportDialog";
import DeleteMonthDialog from "@/components/DeleteMonthDialog";
import {
  Plus, Trash2, Eye, FileText, CheckCircle, Clock, AlertCircle, Search as SearchIcon,
  ChevronDown, ChevronUp, X, Loader2, Search, Pencil, Receipt, FileDown, Sheet, ShoppingCart, Wrench, Building2, Zap,
  Send, ShieldCheck, Ban, History, PackagePlus, ArrowRight, ArrowLeft, Upload, CalendarX,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { NumericKeypad } from "@/components/NumericKeypad";
import { Pagination, usePagination } from "@/components/Pagination";
// ─── Types ────────────────────────────────────────────────────────────────────
interface LineItem {
  materialId: number;
  materialName: string;
  materialUnit: string;
  quantity: string;
  unitPrice: string;
  vatEnabled: boolean;
  lineTotalInput: string; // editable total field; back-calculates unitPrice
}

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  supplierId?: number | null;
  supplierName?: string | null;
  invoiceDate: Date | string;
  subtotal: string;
  vatEnabled: boolean;
  vatAmount: string;
  totalAmount: string;
  paymentStatus: "paid" | "deferred" | "partial" | "under_review";
  paidAmount?: string | null;
  paidAt?: Date | string | null;
  notes?: string | null;
  createdAt: Date | string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  paid: { labelAr: "مدفوع", labelEn: "Paid", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle size={13} /> },
  deferred: { labelAr: "مؤجل", labelEn: "Deferred", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock size={13} /> },
  partial: { labelAr: "جزئي", labelEn: "Partial", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <AlertCircle size={13} /> },
  under_review: { labelAr: "مراجعة", labelEn: "Under Review", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <SearchIcon size={13} /> },
};

const INVOICE_STATUS_CONFIG = {
  draft:     { labelAr: "مسودة",           labelEn: "Draft",           color: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300" },
  pending:   { labelAr: "قيد المراجعة",     labelEn: "Pending Review",  color: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300" },
  approved:  { labelAr: "معتمدة",           labelEn: "Approved",        color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300" },
  rejected:  { labelAr: "مرفوضة",          labelEn: "Rejected",        color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300" },
  cancelled: { labelAr: "ملغاة",           labelEn: "Cancelled",       color: "bg-muted text-muted-foreground border-border" },
};

const PAYMENT_METHOD_CONFIG: Record<string, { labelAr: string; labelEn: string }> = {
  cash:          { labelAr: "نقداً",          labelEn: "Cash" },
  bank_transfer: { labelAr: "تحويل بنكي",    labelEn: "Bank Transfer" },
  card:          { labelAr: "بطاقة",          labelEn: "Card" },
  cheque:        { labelAr: "شيك",            labelEn: "Cheque" },
  other:         { labelAr: "أخرى",           labelEn: "Other" },
};

function fmtCurrency(val: string | number | null | undefined, ar: boolean) {
  const n = parseFloat(String(val ?? "0")) || 0;
  return ar
    ? `${n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ`
    : `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | string, ar: boolean) {
  return new Date(d).toLocaleDateString(ar ? "ar-AE" : "en-AE", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const { language, isRTL } = useLanguage();
  const ar = language === "ar";

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<string>("all"); // all | supplier | free
  const [paidDateFrom, setPaidDateFrom] = useState<string>("");
  const [paidDateTo, setPaidDateTo] = useState<string>("");
  const [supplierNameFilter, setSupplierNameFilter] = useState<string>(""); // فلتر نصي باسم المورد/الجهة
  const [itemNameFilter, setItemNameFilter] = useState<string>(""); // فلتر باسم البند/المادة
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("all"); // all | draft | pending | approved | rejected | cancelled
  const [dueDateFrom, setDueDateFrom] = useState<string>("");
  const [dueDateTo, setDueDateTo] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Dialogs
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDeleteMonth, setShowDeleteMonth] = useState(false);
  const [wizardStep, setWizardStep] = useState(0); // 0=Info, 1=Items, 2=Payment, 3=Review
  const [viewInvoice, setViewInvoice] = useState<number | null>(null);
  const [viewInvoiceType, setViewInvoiceType] = useState<"supplier" | "free">("supplier");
  const [viewAuditTab, setViewAuditTab] = useState("details");
  // Workflow action dialog
  const [workflowTarget, setWorkflowTarget] = useState<{ id: number; type: "supplier" | "free"; action: string; invoiceNumber: string } | null>(null);
  const [workflowNotes, setWorkflowNotes] = useState("");
  const [editInvoiceType, setEditInvoiceType] = useState<"supplier" | "free">("supplier");
  const [statusDialogId, setStatusDialogId] = useState<number | null>(null);
  const [statusDialogType, setStatusDialogType] = useState<"supplier" | "free">("supplier");

  // Create form state
  const [newInvoiceType, setNewInvoiceType] = useState<"supplier" | "free">("supplier"); // نوع الفاتورة الجديدة
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierNameFree, setSupplierNameFree] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vatEnabled, setVatEnabled] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "deferred" | "partial" | "under_review">("deferred");
  const [paidAmount, setPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [supplierExpenseCategory, setSupplierExpenseCategory] = useState<"operational" | "maintenance" | "fixed" | "other">("other");
  const [items, setItems] = useState<LineItem[]>([{ materialId: 0, materialName: "", materialUnit: "", quantity: "", unitPrice: "", vatEnabled: false, lineTotalInput: "" }]);
  const [materialSearch, setMaterialSearch] = useState<Record<number, string>>({});
  const [materialOpen, setMaterialOpen] = useState<Record<number, boolean>>({});
  // Free invoice form state
  const [freeInvoicePartyName, setFreeInvoicePartyName] = useState("");
  const [freeInvoiceExpenseCategory, setFreeInvoiceExpenseCategory] = useState<"operational" | "maintenance" | "fixed" | "other">("operational");
  const [freeInvoiceVatPct, setFreeInvoiceVatPct] = useState("");
  const [freeInvoiceItems, setFreeInvoiceItems] = useState([{ description: "", qty: "1", unitPrice: "" }]);

  // Edit mode
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null);

  // Status update form
  const [newStatus, setNewStatus] = useState<"paid" | "deferred" | "partial" | "under_review">("paid");
  const [newPaidAmount, setNewPaidAmount] = useState("");
  const [newPaidAt, setNewPaidAt] = useState<string>("");
  const [newPaymentMethod, setNewPaymentMethod] = useState<string>("cash");
  const [newPaymentAccount, setNewPaymentAccount] = useState<string>("");
  const [newReferenceNumber, setNewReferenceNumber] = useState<string>("");
  // بيانات الفاتورة المحددة في dialog الدفع
  const [statusDialogInvoiceData, setStatusDialogInvoiceData] = useState<{
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    paymentStatus: string;
    invoiceNumber: string;
  } | null>(null);

  // Build PDF export URL from current filters
  const pdfExportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("paymentStatus", statusFilter);
    if (supplierFilter !== "all") params.set("supplierId", supplierFilter);
    if (monthFilter) params.set("month", monthFilter);
    if (dateFrom && !monthFilter) params.set("dateFrom", dateFrom);
    if (dateTo && !monthFilter) params.set("dateTo", dateTo);
    const qs = params.toString();
    return `/api/pdf/invoices${qs ? `?${qs}` : ""}`;
  }, [statusFilter, supplierFilter, monthFilter, dateFrom, dateTo]);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);

  // Build Excel export URL (all invoices, no supplier filter — Excel has both sheets)
  const excelExportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateFrom && !monthFilter) params.set("dateFrom", dateFrom);
    if (dateTo && !monthFilter) params.set("dateTo", dateTo);
    const qs = params.toString();
    return `/api/excel/invoices${qs ? `?${qs}` : ""}`;
  }, [statusFilter, monthFilter, dateFrom, dateTo]);

  async function handleExportExcel() {
    setExcelLoading(true);
    try {
      const res = await fetch(excelExportUrl);
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = today.getFullYear();
      a.download = `invoices-${yyyy}${mm}${dd}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(ar ? "تم تصدير Excel بنجاح" : "Excel exported successfully");
    } catch {
      toast.error(ar ? "فشل تصدير Excel" : "Excel export failed");
    } finally {
      setExcelLoading(false);
    }
  }

  async function handleExportPDF() {
    setPdfLoading(true);
    try {
      const res = await fetch(pdfExportUrl);
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoices-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(ar ? "تم تصدير PDF بنجاح" : "PDF exported successfully");
    } catch {
      toast.error(ar ? "فشل تصدير PDF" : "PDF export failed");
    } finally {
      setPdfLoading(false);
    }
  }

  // Build query filters for unified view
  const unifiedQueryFilters = useMemo(() => {
    const f: any = {};
    if (statusFilter !== "all") f.paymentStatus = statusFilter;
    if (invoiceTypeFilter !== "all") f.invoiceType = invoiceTypeFilter;
    if (monthFilter) f.month = monthFilter;
    if (dateFrom && !monthFilter) f.dateFrom = dateFrom;
    if (dateTo && !monthFilter) f.dateTo = dateTo;
    if (paidDateFrom) f.paidDateFrom = paidDateFrom;
    if (paidDateTo) f.paidDateTo = paidDateTo;
    if (itemNameFilter && itemNameFilter !== "all") f.itemName = itemNameFilter;
    return f;
  }, [statusFilter, invoiceTypeFilter, monthFilter, dateFrom, dateTo, paidDateFrom, paidDateTo, itemNameFilter]);

  // Query بدون فلتر حالة الدفع — لحساب KPI التصنيفات (تشغيلية/صيانة/ثابتة) بشكل مستقل
  const kpiQueryFilters = useMemo(() => {
    const f: any = {};
    if (invoiceTypeFilter !== "all") f.invoiceType = invoiceTypeFilter;
    if (monthFilter) f.month = monthFilter;
    if (dateFrom && !monthFilter) f.dateFrom = dateFrom;
    if (dateTo && !monthFilter) f.dateTo = dateTo;
    return f;
  }, [invoiceTypeFilter, monthFilter, dateFrom, dateTo]);

  // Build query filters for legacy supplier-only list (used for PDF/Excel export)
  const queryFilters = useMemo(() => {
    const f: any = {};
    if (statusFilter !== "all") f.paymentStatus = statusFilter;
    if (supplierFilter !== "all") f.supplierId = Number(supplierFilter);
    if (monthFilter) f.month = monthFilter;
    if (dateFrom && !monthFilter) f.dateFrom = new Date(dateFrom);
    if (dateTo && !monthFilter) f.dateTo = new Date(dateTo);
    return Object.keys(f).length > 0 ? f : undefined;
  }, [statusFilter, supplierFilter, monthFilter, dateFrom, dateTo]);

  // Queries
  const invoicesQuery = trpc.invoices.allUnified.useQuery(unifiedQueryFilters);
  const kpiAllQuery = trpc.invoices.allUnified.useQuery(kpiQueryFilters, { refetchOnWindowFocus: false });
  const suppliersQuery = trpc.suppliers.list.useQuery();
  const itemNamesQuery = trpc.invoices.itemNames.useQuery(undefined, { refetchOnWindowFocus: false });
  const materialsQuery = trpc.materials.list.useQuery({});
  const viewQuerySupplier = trpc.invoices.get.useQuery(
    { id: viewInvoice! },
    { enabled: viewInvoice !== null && viewInvoiceType === "supplier" }
  );
  const viewQueryFree = trpc.freeInvoices.getById.useQuery(
    { id: viewInvoice! },
    { enabled: viewInvoice !== null && viewInvoiceType === "free" }
  );
  const viewQuery = viewInvoiceType === "free" ? viewQueryFree : viewQuerySupplier;

  // Query لجلب تفاصيل الفاتورة (مع paymentHistory) عند فتح dialog الدفع
  const statusDialogSupplierQuery = trpc.invoices.get.useQuery(
    { id: statusDialogId! },
    { enabled: statusDialogId !== null && statusDialogType === "supplier" }
  );
  const statusDialogFreeQuery = trpc.freeInvoices.getById.useQuery(
    { id: statusDialogId! },
    { enabled: statusDialogId !== null && statusDialogType === "free" }
  );
  const statusDialogDetailQuery = statusDialogType === "free" ? statusDialogFreeQuery : statusDialogSupplierQuery;

  const utils = trpc.useUtils();

  const createMutation = trpc.invoices.create.useMutation({
    onSuccess: (res) => {
      toast.success(ar ? `تم إنشاء الفاتورة ${res.invoiceNumber} بنجاح` : `Invoice ${res.invoiceNumber} created`);
      utils.invoices.list.invalidate();
      utils.materials.list.invalidate();
      utils.inventory.transactions.invalidate();
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.invoices.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تمت إضافة الدفعة بنجاح" : "Payment added successfully");
      utils.invoices.list.invalidate();
      utils.invoices.allUnified.invalidate();
      utils.invoices.get.invalidate({ id: statusDialogId! });
      setNewPaidAmount("");
      const now = new Date();
      setNewPaidAt(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      setNewStatus("partial");
      // لا نغلق الديالوج حتى يتمكن المستخدم من إضافة دفعات متعددة
    },
    onError: (e) => toast.error(e.message),
  });

  const updateFreeStatusMutationUnified = trpc.freeInvoices.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تمت إضافة الدفعة بنجاح" : "Payment added successfully");
      utils.freeInvoices.list.invalidate();
      utils.invoices.allUnified.invalidate();
      utils.freeInvoices.getById.invalidate({ id: statusDialogId! });
      setNewPaidAmount("");
      const now = new Date();
      setNewPaidAt(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      setNewStatus("partial");
      // لا نغلق الديالوج حتى يتمكن المستخدم من إضافة دفعات متعددة
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePaymentMutation = trpc.invoices.deletePayment.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حذف الدفعة وإرجاع المبلغ" : "Payment deleted and amount reversed");
      utils.invoices.get.invalidate({ id: statusDialogId! });
      utils.invoices.list.invalidate();
      utils.invoices.allUnified.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteFreePaymentMutation = trpc.freeInvoices.deletePayment.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حذف الدفعة وإرجاع المبلغ" : "Payment deleted and amount reversed");
      utils.freeInvoices.getById.invalidate({ id: statusDialogId! });
      utils.freeInvoices.list.invalidate();
      utils.invoices.allUnified.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حذف الفاتورة" : "Invoice deleted");
      utils.invoices.list.invalidate();
      utils.invoices.allUnified.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Workflow mutations
  const updateInvoiceStatusMutation = trpc.invoices.updateInvoiceStatus.useMutation({
    onSuccess: () => {
      utils.invoices.allUnified.invalidate();
      toast.success(ar ? "تم تحديث حالة الفاتورة" : "Invoice status updated");
      setWorkflowTarget(null); setWorkflowNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateFreeInvoiceStatusMutation = trpc.freeInvoices.updateInvoiceStatus.useMutation({
    onSuccess: () => {
      utils.invoices.allUnified.invalidate();
      toast.success(ar ? "تم تحديث حالة الفاتورة" : "Invoice status updated");
      setWorkflowTarget(null); setWorkflowNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const postToInventoryMutation = trpc.invoices.postToInventory.useMutation({
    onSuccess: (res: any) => {
      utils.invoices.allUnified.invalidate();
      utils.materials.list.invalidate();
      toast.success(ar ? `تم ترحيل ${res.posted} بند للمخزون` : `Posted ${res.posted} items to inventory`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // mutations مخصصة للجدول الموحد
  const deleteSupplierMutationUnified = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حذف الفاتورة" : "Invoice deleted");
      utils.invoices.allUnified.invalidate();
      utils.invoices.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteFreeMutationUnified = trpc.freeInvoices.delete.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حذف الفاتورة" : "Invoice deleted");
      utils.invoices.allUnified.invalidate();
      utils.freeInvoices.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.invoices.update.useMutation({
    onSuccess: (res) => {
      toast.success(ar ? `تم تحديث الفاتورة ${res.invoiceNumber}` : `Invoice ${res.invoiceNumber} updated`);
      utils.invoices.list.invalidate();
      utils.materials.list.invalidate();
      utils.inventory.transactions.invalidate();
      setEditInvoiceId(null);
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  // Fetch invoice for editing
  const editQuerySupplier = trpc.invoices.get.useQuery(
    { id: editInvoiceId! },
    { enabled: editInvoiceId !== null && editInvoiceType === "supplier" }
  );
  const editQueryFree = trpc.freeInvoices.getById.useQuery(
    { id: editInvoiceId! },
    { enabled: editInvoiceId !== null && editInvoiceType === "free" }
  );
  const editQuery = editInvoiceType === "free" ? editQueryFree : editQuerySupplier;

  // Pre-fill form when edit data loads
  const prevEditId = useRef<number | null>(null);
  useEffect(() => {
    if (editInvoiceId !== null && editQuery.data && prevEditId.current !== editInvoiceId) {
      prevEditId.current = editInvoiceId;
      const inv = editQuery.data as any;
      if (editInvoiceType === "free") {
        // فاتورة حرة: نفتح نموذج الفواتير الحرة
        setNewInvoiceType("free");
        setFreeInvoicePartyName(inv.supplierName ?? "");
        setFreeInvoiceExpenseCategory(inv.expenseCategory ?? "operational");
        setFreeInvoiceVatPct(inv.vatPct ? String(inv.vatPct) : "");
        setPaymentStatus(inv.paymentStatus ?? "deferred");
        setPaidAmount(inv.paidAmount ?? "");
        setNotes(inv.notes ?? "");
        const loadedFreeItems = (inv.items ?? []).map((it: any) => ({
          description: it.description ?? "",
          qty: String(it.qty ?? it.quantity ?? "1"),
          unitPrice: String(it.unitPrice ?? ""),
        }));
        setFreeInvoiceItems(loadedFreeItems.length ? loadedFreeItems : [{ description: "", qty: "1", unitPrice: "" }]);
      } else {
        // فاتورة مورد
        setNewInvoiceType("supplier");
        setSupplierId(inv.supplierId ? String(inv.supplierId) : "");
        setSupplierNameFree(inv.supplierName ?? "");
        setInvoiceDate(new Date(inv.invoiceDate).toISOString().slice(0, 10));
        setVatEnabled(inv.vatEnabled ?? false);
        setPaymentStatus(inv.paymentStatus ?? "deferred");
        setPaidAmount(inv.paidAmount ?? "");
        setNotes(inv.notes ?? "");
        setSupplierExpenseCategory(inv.expenseCategory ?? "other");
        const loadedItems: LineItem[] = (inv.items ?? []).map((it: any) => {
          const qty = parseFloat(it.quantity) || 0;
          const price = parseFloat(it.unitPrice) || 0;
          return {
            materialId: it.materialId,
            materialName: it.materialName,
            materialUnit: it.materialUnit,
            quantity: String(it.quantity),
            unitPrice: String(it.unitPrice),
            vatEnabled: false,
            lineTotalInput: qty > 0 && price > 0 ? String(qty * price) : "",
          };
        });
        setItems(loadedItems.length ? loadedItems : [{ materialId: 0, materialName: "", materialUnit: "", quantity: "", unitPrice: "", vatEnabled: false, lineTotalInput: "" }]);
      }
      setShowCreate(true);
    }
  }, [editInvoiceId, editQuery.data, editInvoiceType]);

  // ─── Form helpers ──────────────────────────────────────────────────────────
  function resetForm() {
    setSupplierId(""); setSupplierNameFree(""); setInvoiceDate(new Date().toISOString().slice(0, 10));
    setVatEnabled(false); setPaymentStatus("deferred"); setPaidAmount(""); setNotes(""); setSupplierExpenseCategory("other");
    setItems([{ materialId: 0, materialName: "", materialUnit: "", quantity: "", unitPrice: "", vatEnabled: false, lineTotalInput: "" }]);
  }

  function addItem() {
    setItems(prev => [...prev, { materialId: 0, materialName: "", materialUnit: "", quantity: "", unitPrice: "", vatEnabled: false, lineTotalInput: "" }]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === "materialId") {
        const mat = (materialsQuery.data as any[])?.find((m: any) => m.id === Number(value));
        const displayName = ar && mat?.nameAr ? mat.nameAr : (mat?.name ?? "");
        return { ...item, materialId: Number(value), materialName: displayName, materialUnit: mat?.unit ?? "" };
      }
      // When quantity changes, recalculate lineTotalInput from unitPrice
      if (field === "quantity") {
        const qty = parseFloat(String(value)) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        const newTotal = qty * price;
        return { ...item, quantity: String(value), lineTotalInput: newTotal > 0 ? String(newTotal) : "" };
      }
      // When unitPrice changes, recalculate lineTotalInput
      if (field === "unitPrice") {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(String(value)) || 0;
        const newTotal = qty * price;
        return { ...item, unitPrice: String(value), lineTotalInput: newTotal > 0 ? String(newTotal) : "" };
      }
      return { ...item, [field]: value };
    }));
  }

  function updateLineTotal(idx: number, totalStr: string) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const qty = parseFloat(item.quantity) || 0;
      const totalVal = parseFloat(totalStr) || 0;
      const newUnitPrice = qty > 0 ? totalVal / qty : 0;
      return { ...item, lineTotalInput: totalStr, unitPrice: newUnitPrice > 0 ? String(newUnitPrice) : item.unitPrice };
    }));
  }

  // ─── Totals ────────────────────────────────────────────────────────────────
  const subtotal = useMemo(() =>
    items.reduce((s, i) => {
      const base = (parseFloat(i.quantity) || 0) * (parseFloat(i.unitPrice) || 0);
      return s + base + (i.vatEnabled ? base * 0.05 : 0);
    }, 0),
    [items]
  );
  const vatAmount = vatEnabled ? subtotal * 0.05 : 0;
  const total = subtotal + vatAmount;

  // ─── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit() {
    const validItems = items.filter(i => i.materialId > 0 && parseFloat(i.quantity) > 0 && parseFloat(i.unitPrice) >= 0);
    if (!validItems.length) { toast.error(ar ? "أضف بند واحد على الأقل" : "Add at least one item"); return; }

    const supplierIdNum = supplierId && supplierId !== "free" ? Number(supplierId) : undefined;
    const supplier = supplierIdNum ? (suppliersQuery.data as any[])?.find((s: any) => s.id === supplierIdNum) : null;
    const payload = {
      supplierId: supplierIdNum && !isNaN(supplierIdNum) ? supplierIdNum : undefined,
      supplierName: (supplier?.name ?? supplierNameFree) || undefined,
      invoiceDate: new Date(invoiceDate),
      vatEnabled,
      paymentStatus,
      paidAmount: paidAmount ? parseFloat(paidAmount) : undefined,
      notes: notes || undefined,
      expenseCategory: supplierExpenseCategory,
      items: validItems.map(i => ({
        materialId: i.materialId,
        materialName: i.materialName,
        materialUnit: i.materialUnit,
        quantity: parseFloat(i.quantity),
        unitPrice: parseFloat(i.unitPrice),
      })),
    };

    if (editInvoiceId !== null) {
      updateMutation.mutate({ id: editInvoiceId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // Unified invoice list - use any[] to accommodate both supplier and free invoices
  const rawInvoiceList = (invoicesQuery.data ?? []) as any[];

  // استخراج أسماء الموردين/الجهات الفريدة من جميع الفواتير (بدون فلتر حالة الدفع)
  const allNamesForDropdown = useMemo(() => {
    const kpiData = (kpiAllQuery.data ?? []) as any[];
    const names = new Set<string>();
    kpiData.forEach((i: any) => {
      const n = (i.supplierName ?? i.partyName ?? "").trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ar"));
  }, [kpiAllQuery.data]);

  // تطبيق فلتر اسم المورد/الجهة + تصنيف المصروف محلياً
  const invoiceList = (() => {
    let list = rawInvoiceList;
    if (supplierNameFilter && supplierNameFilter !== "all") {
      list = list.filter((i: any) => {
        const name = (i.supplierName ?? i.partyName ?? "").trim();
        return name === supplierNameFilter;
      });
    }
    if (expenseCategoryFilter && expenseCategoryFilter !== "all") {
      list = list.filter((i: any) => {
        const cat = i.expenseCategory || "other";
        return cat === expenseCategoryFilter;
      });
    }
    // فلتر اسم البند: نبحث في invoiceNumber ونترك الجلب التفصيلي للباكند
    // بما أن allUnified لا يجلب بنوداً، نحتفظ بالفلتر كمعرف للبحث في الجلسة
    return list;
  })();
  const [invoicesPage, setInvoicesPage] = useState(1);
  const invoicesPagination = usePagination(invoiceList, 15);
  const pagedInvoices = invoicesPagination.paginate(invoicesPage);
  // Reset page when filters change
  useEffect(() => { setInvoicesPage(1); }, [statusFilter, supplierFilter, monthFilter, dateFrom, dateTo, supplierNameFilter, itemNameFilter, expenseCategoryFilter]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{ar ? "إدارة الفواتير" : "Invoice Management"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ar ? "إنشاء ومتابعة فواتير المشتريات" : "Create and track purchase invoices"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={excelLoading}
            className="gap-2 border-green-400 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-950/30"
          >
            {excelLoading ? <Loader2 size={16} className="animate-spin" /> : <Sheet size={16} />}
            {ar ? "تصدير Excel" : "Export Excel"}
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            disabled={pdfLoading}
            className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            {pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            {ar ? "تصدير PDF" : "Export PDF"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowImport(true)}
            className="gap-2 border-violet-400 text-violet-700 hover:bg-violet-50 dark:border-violet-600 dark:text-violet-400 dark:hover:bg-violet-950/30"
          >
            <Upload size={16} />
            {ar ? "رفع من إكسل" : "Import from Excel"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowDeleteMonth(true)}
            disabled={!monthFilter}
            title={monthFilter
              ? (ar ? "حذف كل فواتير الشهر المحدد" : "Delete all invoices of the selected month")
              : (ar ? "اختر شهرًا من الفلتر أولاً" : "Pick a month in the filter first")}
            className="gap-2 border-rose-400 text-rose-700 hover:bg-rose-50 dark:border-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <CalendarX size={16} />
            {ar ? "حذف فواتير الشهر" : "Delete month"}
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus size={16} />
            {ar ? "فاتورة جديدة" : "New Invoice"}
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            {ar ? "تصفية الفواتير" : "Filter Invoices"}
            {(statusFilter !== "all" || supplierFilter !== "all" || monthFilter || dateFrom || dateTo || expenseCategoryFilter !== "all" || invoiceTypeFilter !== "all") && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {[statusFilter !== "all", supplierFilter !== "all", !!monthFilter, !!dateFrom, !!dateTo, expenseCategoryFilter !== "all", invoiceTypeFilter !== "all"].filter(Boolean).length}
              </span>
            )}
          </div>
          {(statusFilter !== "all" || supplierFilter !== "all" || monthFilter || dateFrom || dateTo || paidDateFrom || paidDateTo || supplierNameFilter || itemNameFilter || expenseCategoryFilter !== "all" || invoiceTypeFilter !== "all") && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1 px-2"
              onClick={() => { setStatusFilter("all"); setSupplierFilter("all"); setMonthFilter(""); setDateFrom(""); setDateTo(""); setPaidDateFrom(""); setPaidDateTo(""); setSupplierNameFilter(""); setItemNameFilter(""); setExpenseCategoryFilter("all"); setInvoiceTypeFilter("all"); }}>
              <X size={11} />{ar ? "مسح الكل" : "Clear All"}
            </Button>
          )}
        </div>
        {/* Fields */}
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Month */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "الشهر" : "Month"}</label>
              <Select
                value={monthFilter || "all"}
                onValueChange={v => {
                  const val = v === "all" ? "" : v;
                  setMonthFilter(val);
                  if (val) { setDateFrom(""); setDateTo(""); }
                }}
              >
                <SelectTrigger className={`h-9 text-sm transition-all ${monthFilter ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue placeholder={ar ? "كل الشهور" : "All Months"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الشهور" : "All Months"}</SelectItem>
                  {(() => {
                    const now = new Date();
                    const monthsAr = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
                    const monthsEn = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                    const items = [];
                    // Current year + previous year
                    for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
                      const maxMonth = y === now.getFullYear() ? now.getMonth() : 11;
                      for (let m = maxMonth; m >= 0; m--) {
                        const val = `${y}-${String(m + 1).padStart(2, "0")}`;
                        items.push(
                          <SelectItem key={val} value={val}>
                            {ar ? `${monthsAr[m]} ${y}` : `${monthsEn[m]} ${y}`}
                          </SelectItem>
                        );
                      }
                    }
                    return items;
                  })()}
                </SelectContent>
              </Select>
            </div>
            {/* Date From */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "من تاريخ" : "From Date"}</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); if (e.target.value) setMonthFilter(""); }}
                className={`h-9 text-sm transition-all ${dateFrom ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}
              />
            </div>
            {/* Date To */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "إلى تاريخ" : "To Date"}</label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); if (e.target.value) setMonthFilter(""); }}
                className={`h-9 text-sm transition-all ${dateTo ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}
              />
            </div>
            {/* Invoice Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "نوع الفاتورة" : "Invoice Type"}</label>
              <Select value={invoiceTypeFilter} onValueChange={setInvoiceTypeFilter}>
                <SelectTrigger className={`h-9 text-sm transition-all ${invoiceTypeFilter !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue placeholder={ar ? "كل الأنواع" : "All types"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الأنواع" : "All Types"}</SelectItem>
                  <SelectItem value="supplier">{ar ? "فواتير موردين" : "Supplier Invoices"}</SelectItem>
                  <SelectItem value="free">{ar ? "فواتير حرة" : "Free Invoices"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Expense Category (تشغيلية / صيانة ومعدات / أخرى) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "تصنيف المصروف" : "Expense Category"}</label>
              <Select value={expenseCategoryFilter} onValueChange={setExpenseCategoryFilter}>
                <SelectTrigger className={`h-9 text-sm transition-all ${expenseCategoryFilter !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue placeholder={ar ? "كل التصنيفات" : "All Categories"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل التصنيفات" : "All Categories"}</SelectItem>
                  <SelectItem value="operational">{ar ? "تشغيلية" : "Operational"}</SelectItem>
                  <SelectItem value="maintenance">{ar ? "معدات وصيانة" : "Equipment & Maintenance"}</SelectItem>
                  <SelectItem value="other">{ar ? "أخرى" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "الحالة" : "Status"}</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={`h-9 text-sm transition-all ${statusFilter !== "all" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue placeholder={ar ? "كل الحالات" : "All statuses"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الحالات" : "All Statuses"}</SelectItem>
                  <SelectItem value="paid">{ar ? "تم الدفع" : "Paid"}</SelectItem>
                  <SelectItem value="deferred">{ar ? "مؤجل" : "Deferred"}</SelectItem>
                  <SelectItem value="partial">{ar ? "دفع جزئي" : "Partial"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Paid Date From */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "تاريخ الدفع من" : "Paid From"}</label>
              <Input
                type="date"
                value={paidDateFrom}
                onChange={e => setPaidDateFrom(e.target.value)}
                className={`h-9 text-sm transition-all ${paidDateFrom ? "border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-50/20" : ""}`}
              />
            </div>
            {/* Paid Date To */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "تاريخ الدفع إلى" : "Paid To"}</label>
              <Input
                type="date"
                value={paidDateTo}
                onChange={e => setPaidDateTo(e.target.value)}
                className={`h-9 text-sm transition-all ${paidDateTo ? "border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-50/20" : ""}`}
              />
            </div>
            {/* Supplier / Party Name - Dropdown */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "اسم المورد/الجهة" : "Supplier / Party"}</label>
              <Select value={supplierNameFilter || "all"} onValueChange={v => setSupplierNameFilter(v === "all" ? "" : v)}>
                <SelectTrigger className={`h-9 text-sm transition-all ${supplierNameFilter ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue placeholder={ar ? "كل الموردين" : "All Suppliers"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الموردين" : "All Suppliers"}</SelectItem>
                  {allNamesForDropdown.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Item / Material Name - Dropdown */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "اسم البند/المادة" : "Item / Material"}</label>
              <Select value={itemNameFilter || "all"} onValueChange={v => setItemNameFilter(v === "all" ? "" : v)}>
                <SelectTrigger className={`h-9 text-sm transition-all ${itemNameFilter ? "border-primary ring-1 ring-primary/30 bg-primary/5" : ""}`}>
                  <SelectValue placeholder={ar ? "كل البنود" : "All Items"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل البنود" : "All Items"}</SelectItem>
                  {(itemNamesQuery.data ?? []).map((name: string) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Active filter badges */}
          {(statusFilter !== "all" || supplierFilter !== "all" || monthFilter || dateFrom || dateTo || paidDateFrom || paidDateTo || supplierNameFilter || itemNameFilter || expenseCategoryFilter !== "all" || invoiceTypeFilter !== "all") && (
            <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-muted-foreground font-medium me-1">{ar ? "نشط:" : "Active:"}</span>
              {invoiceTypeFilter !== "all" && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                  {invoiceTypeFilter === "supplier" ? (ar ? "فواتير موردين" : "Supplier") : (ar ? "فواتير حرة" : "Free")}
                  <button onClick={() => setInvoiceTypeFilter("all")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {expenseCategoryFilter !== "all" && (
                <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50 px-2 py-0.5 rounded-full font-medium">
                  {expenseCategoryFilter === "operational" ? (ar ? "تشغيلية" : "Operational")
                    : expenseCategoryFilter === "maintenance" ? (ar ? "معدات وصيانة" : "Equipment & Maintenance")
                    : (ar ? "أخرى" : "Other")}
                  <button onClick={() => setExpenseCategoryFilter("all")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {monthFilter && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                  {monthFilter}
                  <button onClick={() => setMonthFilter("")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {dateFrom && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                  {ar ? "من" : "From"}: {dateFrom}
                  <button onClick={() => setDateFrom("")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {dateTo && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                  {ar ? "إلى" : "To"}: {dateTo}
                  <button onClick={() => setDateTo("")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {supplierFilter !== "all" && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                  {(suppliersQuery.data as any[] ?? []).find((s: any) => String(s.id) === supplierFilter)?.name ?? supplierFilter}
                  <button onClick={() => setSupplierFilter("all")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {statusFilter !== "all" && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                  {statusFilter === "paid" ? (ar ? "مدفوع" : "Paid") : statusFilter === "deferred" ? (ar ? "مؤجل" : "Deferred") : (ar ? "جزئي" : "Partial")}
                  <button onClick={() => setStatusFilter("all")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {paidDateFrom && (
                <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                  {ar ? "دفع من" : "Paid from"}: {paidDateFrom}
                  <button onClick={() => setPaidDateFrom("")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {paidDateTo && (
                <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
                  {ar ? "دفع إلى" : "Paid to"}: {paidDateTo}
                  <button onClick={() => setPaidDateTo("")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {supplierNameFilter && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                  {ar ? "المورد" : "Supplier"}: {supplierNameFilter}
                  <button onClick={() => setSupplierNameFilter("")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
              {itemNameFilter && (
                <span className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-700 px-2 py-0.5 rounded-full font-medium">
                  {ar ? "البند" : "Item"}: {itemNameFilter}
                  <button onClick={() => setItemNameFilter("")} className="hover:text-destructive transition-colors"><X size={10}/></button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {!invoicesQuery.isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["all", "paid", "deferred", "partial", "under_review"] as const).map(s => {
            const count = s === "all" ? invoiceList.length : invoiceList.filter(i => i.paymentStatus === s).length;
            const cfg = s === "all"
              ? { labelAr: "الكل", labelEn: "All", color: "border-border" }
              : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG];
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-xl border p-4 text-start transition-all hover:shadow-md ${statusFilter === s ? "ring-2 ring-primary shadow-md" : ""} ${s !== "all" ? STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].color : "bg-card border-border"}`}
              >
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs font-medium mt-0.5">{ar ? (s === "all" ? "الكل" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].labelAr) : (s === "all" ? "All" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].labelEn)}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* KPI Cards: Purchases + Operational + Maintenance + Other + Debt */}
      {!invoicesQuery.isLoading && (() => {
        // استخدام القائمة الكاملة (بدون فلتر حالة الدفع) لحساب KPI التصنيفات
        const kpiList = (kpiAllQuery.data ?? []) as any[];
        // إجمالي التشغيلية (جميع حالات الدفع - موردين + حرة)
        const totalOperational = kpiList
          .filter(i => i.expenseCategory === "operational")
          .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        // إجمالي الصيانة والمعدات (جميع حالات الدفع - موردين + حرة)
        const totalMaintenance = kpiList
          .filter(i => i.expenseCategory === "maintenance")
          .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        // إجمالي أخرى (جميع حالات الدفع - موردين + حرة)
        const totalOther = kpiList
          .filter(i => i.expenseCategory === "other" || !i.expenseCategory)
          .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        // إجمالي المديونية = المؤجل + الجزئي المتبقي (موردين + حرة)
        const totalDebt = kpiList
          .reduce((s, i) => {
            if (i.paymentStatus === "deferred") return s + (parseFloat(i.totalAmount) || 0);
            if (i.paymentStatus === "partial") {
              const total = parseFloat(i.totalAmount) || 0;
              const paid = parseFloat(i.paidAmount ?? "0") || 0;
              return s + Math.max(0, total - paid);
            }
            return s;
          }, 0);
        // مدفوع ومؤجل التشغيلية
        const operationalPaid = kpiList
          .filter(i => i.expenseCategory === "operational" && i.paymentStatus === "paid")
          .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        const operationalDeferred = kpiList
          .filter(i => i.expenseCategory === "operational" && i.paymentStatus === "deferred")
          .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        // مدفوع ومؤجل الصيانة
        const maintenancePaid = kpiList
          .filter(i => i.expenseCategory === "maintenance" && i.paymentStatus === "paid")
          .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        const maintenanceDeferred = kpiList
          .filter(i => i.expenseCategory === "maintenance" && i.paymentStatus === "deferred")
          .reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        // إجمالي المشتريات = التشغيلية + الصيانة والمعدات (موردين + حرة، مدفوع + غير مدفوع)
        const totalPurchases = totalOperational + totalMaintenance;
        // إجمالي كل الفواتير
        const grandTotal = kpiList.reduce((s, i) => s + (parseFloat(i.totalAmount) || 0), 0);
        // مدفوع بالكامل = مجموع paidAmount لجميع الفواتير (مدفوع + جزئي)
        const totalFullyPaid = kpiList
          .reduce((s, i) => s + (parseFloat(i.paidAmount ?? "0") || 0), 0);
        // مؤجل (غير مدوع) = مجموع remainingAmount للفواتير غير المسددة بالكامل
        const totalDeferred = kpiList
          .filter(i => i.paymentStatus === "deferred" || i.paymentStatus === "partial")
          .reduce((s, i) => {
            const remaining = parseFloat(i.remainingAmount ?? "0") || 0;
            if (remaining > 0) return s + remaining;
            // fallback: إذا لم يكن remainingAmount محدداً
            const total = parseFloat(i.totalAmount) || 0;
            const paid = parseFloat(i.paidAmount ?? "0") || 0;
            return s + Math.max(0, total - paid);
          }, 0);
        return (
          <div className="flex flex-col gap-4">
            {/* صف واحد: جميع البطاقات جنباً إلى جنب */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* إجمالي كل الفواتير */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-800 p-4 flex items-center gap-3">
                <div className="rounded-full bg-indigo-100 dark:bg-indigo-900/50 p-2.5 shrink-0">
                  <Receipt size={18} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium">{ar ? "إجمالي كل الفواتير" : "Grand Total"}</p>
                  <p className="text-lg font-bold text-indigo-800 dark:text-indigo-300">{fmtCurrency(grandTotal, ar)}</p>
                  <p className="text-xs text-indigo-500 mt-0.5">{kpiList.length} {ar ? "فاتورة" : "invoices"}</p>
                </div>
              </div>
              {/* مدفوع بالكامل */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4 flex items-center gap-3">
                <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-2.5 shrink-0">
                  <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{ar ? "مدفوع بالكامل" : "Fully Paid"}</p>
                  <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">{fmtCurrency(totalFullyPaid, ar)}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">{kpiList.filter(i => i.paymentStatus === "paid" || i.paymentStatus === "partial").length} {ar ? "فاتورة" : "invoices"}</p>
                </div>
              </div>
              {/* مؤجل (غير مدفوع) */}
              <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-4 flex items-center gap-3">
                <div className="rounded-full bg-rose-100 dark:bg-rose-900/50 p-2.5 shrink-0">
                  <Clock size={18} className="text-rose-600 dark:text-rose-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-rose-700 dark:text-rose-400 font-medium">{ar ? "مؤجل (غير مدفوع)" : "Deferred"}</p>
                  <p className="text-lg font-bold text-rose-800 dark:text-rose-300">{fmtCurrency(totalDeferred, ar)}</p>
                  <p className="text-xs text-rose-500 mt-0.5">{kpiList.filter(i => i.paymentStatus === "deferred" || i.paymentStatus === "partial").length} {ar ? "فاتورة" : "invoices"}</p>
                </div>
              </div>
              {/* إجمالي التشغيلية */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-full bg-blue-100 dark:bg-blue-900/50 p-2.5 shrink-0">
                    <Zap size={18} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">{ar ? "التشغيلية" : "Operational"}</p>
                    <p className="text-base font-bold text-blue-800 dark:text-blue-300">{fmtCurrency(totalOperational, ar)}</p>
                  </div>
                </div>
                <div className="flex justify-between text-xs border-t border-blue-100 dark:border-blue-800 pt-2 mt-1">
                  <span className="text-emerald-600 font-medium">✓ {fmtCurrency(operationalPaid, ar)}</span>
                  <span className="text-rose-500 font-medium">⧗ {fmtCurrency(operationalDeferred, ar)}</span>
                </div>
              </div>
              {/* إجمالي الصيانة والمعدات */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-full bg-amber-100 dark:bg-amber-900/50 p-2.5 shrink-0">
                    <Wrench size={18} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{ar ? "الصيانة والمعدات" : "Maintenance"}</p>
                    <p className="text-base font-bold text-amber-800 dark:text-amber-300">{fmtCurrency(totalMaintenance, ar)}</p>
                  </div>
                </div>
                <div className="flex justify-between text-xs border-t border-amber-100 dark:border-amber-800 pt-2 mt-1">
                  <span className="text-emerald-600 font-medium">✓ {fmtCurrency(maintenancePaid, ar)}</span>
                  <span className="text-rose-500 font-medium">⧗ {fmtCurrency(maintenanceDeferred, ar)}</span>
                </div>
              </div>
              {/* إجمالي أخرى */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-950/30 dark:border-slate-700 p-4 flex items-center gap-3">
                <div className="rounded-full bg-slate-100 dark:bg-slate-800/50 p-2.5 shrink-0">
                  <FileText size={18} className="text-slate-600 dark:text-slate-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-700 dark:text-slate-400 font-medium truncate">{ar ? "أخرى" : "Other"}</p>
                  <p className="text-base font-bold text-slate-800 dark:text-slate-300">{fmtCurrency(totalOther, ar)}</p>
                </div>
              </div>

            </div>

            {/* ── Aging Report ── */}
            {(() => {
              const today = new Date();
              const unpaid = kpiList.filter((i: any) => i.paymentStatus !== "paid" && i.dueDate);
              if (unpaid.length === 0) return null;
              const aging = [
                { labelAr: "لم يستحق",  labelEn: "Not Due",  cls: "border-border text-muted-foreground bg-card",                         items: unpaid.filter((i: any) => new Date(i.dueDate) >= today) },
                { labelAr: "١–٧ أيام",  labelEn: "1–7d",     cls: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-amber-700",    items: unpaid.filter((i: any) => { const d = Math.floor((today.getTime()-new Date(i.dueDate).getTime())/86400000); return d>=1&&d<=7; }) },
                { labelAr: "٨–١٥ يوم",  labelEn: "8–15d",    cls: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 text-orange-700",items: unpaid.filter((i: any) => { const d = Math.floor((today.getTime()-new Date(i.dueDate).getTime())/86400000); return d>=8&&d<=15; }) },
                { labelAr: "١٦–٣٠ يوم", labelEn: "16–30d",   cls: "bg-red-50 dark:bg-red-950/20 border-red-200 text-red-700",            items: unpaid.filter((i: any) => { const d = Math.floor((today.getTime()-new Date(i.dueDate).getTime())/86400000); return d>=16&&d<=30; }) },
                { labelAr: "+٣٠ يوم",   labelEn: "+30d",     cls: "bg-rose-100 dark:bg-rose-950/30 border-rose-300 text-rose-700 font-semibold", items: unpaid.filter((i: any) => { const d = Math.floor((today.getTime()-new Date(i.dueDate).getTime())/86400000); return d>30; }) },
              ];
              return (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className={`text-xs font-semibold text-muted-foreground mb-2.5 flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <AlertCircle size={12} className="text-amber-500" />
                    {ar ? "تحليل تأخر السداد" : "Aging Analysis"} — {unpaid.length} {ar ? "فاتورة غير مسددة" : "unpaid"}
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {aging.map((b, i) => (
                      <div key={i} className={`rounded-lg border px-3 py-2 text-center text-xs ${b.cls}`}>
                        <p className="text-base font-bold">{b.items.length}</p>
                        <p className="text-[10px] opacity-80">{ar ? b.labelAr : b.labelEn}</p>
                        <p className="font-medium text-[10px] mt-0.5">{fmtCurrency(b.items.reduce((s: number, inv: any) => s + Math.max(0,(parseFloat(inv.totalAmount)||0)-(parseFloat(inv.paidAmount)||0)), 0), ar)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                {[
                  ar ? "النوع" : "Type",
                  ar ? "رقم الفاتورة" : "Invoice #",
                  ar ? "الجهة" : "Party",
                  ar ? "التاريخ" : "Date",
                  ar ? "المجموع الفرعي" : "Subtotal",
                  ar ? "الإجمالي" : "Total",
                  ar ? "حالة الدفع" : "Status",
                  ar ? "تاريخ الدفع" : "Paid At",
                  ar ? "إجراءات" : "Actions",
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground text-start">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoicesQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : !invoiceList.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                    <FileText size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{ar ? "لا توجد فواتير" : "No invoices found"}</p>
                    <p className="text-xs mt-1">{ar ? "أنشئ فاتورة جديدة للبدء" : "Create a new invoice to get started"}</p>
                  </td>
                </tr>
              ) : (
                pagedInvoices.map(inv => {
                  const cfg = STATUS_CONFIG[inv.paymentStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.deferred;
                  const invStatusCfg = INVOICE_STATUS_CONFIG[(inv.invoiceStatus ?? "approved") as keyof typeof INVOICE_STATUS_CONFIG] ?? INVOICE_STATUS_CONFIG.approved;
                  const isSupplier = inv.invoiceType === "supplier";
                  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.paymentStatus !== "paid";
                  const paidAmt = parseFloat(inv.paidAmount ?? "0") || 0;
                  const total = parseFloat(inv.totalAmount ?? "0") || 0;
                  const remaining = Math.max(0, total - paidAmt);
                  return (
                    <tr key={inv.uid} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${isOverdue ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${
                            isSupplier ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-violet-100 text-violet-700 border-violet-200"
                          }`}>
                            {isSupplier ? (ar ? "مورد" : "Supplier") : (ar ? "حرة" : "Free")}
                          </span>
                          <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${invStatusCfg.color}`}>
                            {ar ? invStatusCfg.labelAr : invStatusCfg.labelEn}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-semibold text-primary">{inv.invoiceNumber ?? "—"}</div>
                        {inv.supplierInvoiceNumber && <div className="text-[10px] text-muted-foreground" dir="ltr">{inv.supplierInvoiceNumber}</div>}
                      </td>
                      <td className="px-4 py-3 text-foreground">{inv.partyName ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <div>{fmtDate(inv.invoiceDate, ar)}</div>
                        {inv.dueDate && (
                          <div className={`text-[10px] mt-0.5 ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                            {ar ? "استحقاق: " : "Due: "}{fmtDate(inv.dueDate, ar)}
                            {isOverdue && " ⚠"}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{fmtCurrency(inv.subtotal, ar)}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{fmtCurrency(inv.totalAmount, ar)}</div>
                        {paidAmt > 0 && remaining > 0 && (
                          <div className="text-[10px] text-amber-600">{ar ? `متبقي: ` : "Rem: "}{fmtCurrency(remaining, ar)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                          {cfg.icon}
                          {ar ? cfg.labelAr : cfg.labelEn}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {inv.paymentHistory && inv.paymentHistory.length > 1 ? (
                          <div className="space-y-1">
                            {inv.paymentHistory.map((ph: any, idx: number) => (
                              <div key={ph.id ?? idx} className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="font-medium text-emerald-600">{fmtCurrency(ph.paidAmount, ar)}</span>
                                <span className="text-muted-foreground/50">·</span>
                                <span>{new Date(ph.paymentDate).toLocaleDateString(ar ? "ar-AE" : "en-AE", { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
                              </div>
                            ))}
                          </div>
                        ) : inv.paidAt ? (
                          <span className="whitespace-nowrap">
                            {new Date(inv.paidAt).toLocaleString(ar ? "ar-AE" : "en-AE", {
                              year: "numeric", month: "2-digit", day: "2-digit",
                              hour: "2-digit", minute: "2-digit", hour12: false,
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setViewInvoiceType(inv.invoiceType === "free" ? "free" : "supplier"); setViewInvoice(inv.id); }} title={ar ? "عرض" : "View"}>
                            <Eye size={13} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700" onClick={() => { setEditInvoiceType(inv.invoiceType === "free" ? "free" : "supplier"); setEditInvoiceId(inv.id); }} title={ar ? "تعديل" : "Edit"}>
                            <Pencil size={13} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" onClick={() => {
                              setStatusDialogId(inv.id);
                              setStatusDialogType(inv.invoiceType === "free" ? "free" : "supplier");
                              setNewStatus(inv.paymentStatus);
                              setNewPaidAmount("");
                              const now = new Date();
                              const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setNewPaidAt(localISO);
                            }} title={ar ? "تحديث الدفع" : "Update payment"}>
                            <CheckCircle size={13} />
                          </Button>
                          {/* Workflow actions */}
                          {(inv.invoiceStatus === "draft" || inv.invoiceStatus === "rejected") && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700"
                              onClick={() => { setWorkflowTarget({ id: inv.id, type: inv.invoiceType === "free" ? "free" : "supplier", action: "pending", invoiceNumber: inv.invoiceNumber }); setWorkflowNotes(""); }}
                              title={ar ? "إرسال للمراجعة" : "Submit for Review"}>
                              <Send size={13} />
                            </Button>
                          )}
                          {inv.invoiceStatus === "pending" && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700"
                              onClick={() => { setWorkflowTarget({ id: inv.id, type: inv.invoiceType === "free" ? "free" : "supplier", action: "approved", invoiceNumber: inv.invoiceNumber }); setWorkflowNotes(""); }}
                              title={ar ? "اعتماد الفاتورة" : "Approve Invoice"}>
                              <ShieldCheck size={13} />
                            </Button>
                          )}
                          {/* Post to inventory: approved supplier invoice, not yet posted */}
                          {inv.invoiceStatus === "approved" && inv.invoiceType === "supplier" && !inv.stockUpdated && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-purple-600 hover:text-purple-700"
                              onClick={() => { if(confirm(ar ? "ترحيل الفاتورة للمخزون؟" : "Post invoice to inventory?")) postToInventoryMutation.mutate({ invoiceId: inv.id }); }}
                              title={ar ? "ترحيل للمخزون" : "Post to Inventory"}
                              disabled={postToInventoryMutation.isPending}>
                              <PackagePlus size={13} />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => {
                              if (!confirm(ar ? "حذف هذه الفاتورة؟" : "Delete this invoice?")) return;
                              if (inv.invoiceType === "free") {
                                deleteFreeMutationUnified.mutate({ id: inv.id });
                              } else {
                                deleteSupplierMutationUnified.mutate({ id: inv.id });
                              }
                            }} title={ar ? "حذف" : "Delete"}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={invoicesPage}
            totalPages={invoicesPagination.totalPages}
            onPageChange={(p) => setInvoicesPage(p)}
            totalItems={invoicesPagination.totalItems}
            pageSize={15}
          />
        </div>
      </div>

      {/* Free invoices are now merged into the unified table above */}

      {/* ─── Create / Edit Invoice Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { resetForm(); setEditInvoiceId(null); prevEditId.current = null; } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              {editInvoiceId !== null
                ? (ar ? "تعديل الفاتورة" : "Edit Invoice")
                : (ar ? "إنشاء فاتورة جديدة" : "Create New Invoice")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Invoice Type Selector */}
            {editInvoiceId === null && (
              <div className="space-y-1.5">
                <Label>{ar ? "نوع الفاتورة" : "Invoice Type"}</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewInvoiceType("supplier")}
                    className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                      newInvoiceType === "supplier"
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:border-blue-400"
                    }`}
                  >
                    {ar ? "📦 فاتورة مورد" : "📦 Supplier Invoice"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewInvoiceType("free")}
                    className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
                      newInvoiceType === "free"
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                        : "bg-background border-border text-muted-foreground hover:border-violet-400"
                    }`}
                  >
                    {ar ? "📝 فاتورة حرة" : "📝 Free Invoice"}
                  </button>
                </div>
              </div>
            )}

            {/* ─── Supplier Invoice Form ─── */}
            {((editInvoiceId !== null && editInvoiceType === "supplier") || (editInvoiceId === null && newInvoiceType === "supplier")) && (<>
            {/* Supplier + Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "المورد" : "Supplier"}</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder={ar ? "اختر موردًا..." : "Select supplier..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">{ar ? "إدخال يدوي" : "Manual entry"}</SelectItem>
                    {(suppliersQuery.data as any[] ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {supplierId === "free" && (
                  <Input
                    placeholder={ar ? "اسم المورد..." : "Supplier name..."}
                    value={supplierNameFree}
                    onChange={e => setSupplierNameFree(e.target.value)}
                    className="mt-1"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "تاريخ الفاتورة" : "Invoice Date"}</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{ar ? "بنود الفاتورة" : "Invoice Items"}</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1 h-7 text-xs">
                  <Plus size={12} />
                  {ar ? "إضافة بند" : "Add Item"}
                </Button>
              </div>

              {/* Card layout per item */}
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const baseTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
                  const lineVat = item.vatEnabled ? baseTotal * 0.05 : 0;
                  const lineTotal = baseTotal + lineVat;
                  const search = materialSearch[idx] ?? "";
                  const filteredMaterials = (materialsQuery.data as any[] ?? []).filter((m: any) =>
                    m.name.toLowerCase().includes(search.toLowerCase()) ||
                    (m.nameAr ?? "").includes(search) ||
                    (m.code ?? "").toLowerCase().includes(search.toLowerCase())
                  );
                  return (
                    <div key={idx} className="rounded-xl border border-border bg-card shadow-sm overflow-visible">
                      {/* Card header: item number + delete */}
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/50 rounded-t-xl">
                        <span className="text-xs font-semibold text-muted-foreground">{ar ? `بند #${idx + 1}` : `Item #${idx + 1}`}</span>
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10 transition-colors">
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Row 1: Material (full width) */}
                      <div className="px-4 pt-3 pb-2">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{ar ? "المادة" : "Material"}</label>
                        <div className="relative">
                          <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <input
                            className="w-full h-10 rounded-lg border border-input bg-background ps-8 pe-8 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder:text-muted-foreground"
                            placeholder={item.materialName || (ar ? "اكتب اسم المادة..." : "Type material name...")}
                            value={search}
                            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                            onChange={e => { setMaterialSearch(prev => ({ ...prev, [idx]: e.target.value })); setMaterialOpen(prev => ({ ...prev, [idx]: true })); }}
                            onFocus={() => setMaterialOpen(prev => ({ ...prev, [idx]: true }))}
                            onBlur={() => setTimeout(() => setMaterialOpen(prev => ({ ...prev, [idx]: false })), 150)}
                          />
                          {(search || item.materialId > 0) && (
                            <button type="button" className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onMouseDown={e => { e.preventDefault(); updateItem(idx, "materialId", 0); setMaterialSearch(prev => ({ ...prev, [idx]: "" })); }}>
                              <X size={13} />
                            </button>
                          )}
                          {materialOpen[idx] && (
                            <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                              {filteredMaterials.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-muted-foreground text-center">{ar ? "لا توجد نتائج" : "No results"}</div>
                              ) : filteredMaterials.map((m: any) => (
                                <button key={m.id} type="button"
                                  className={`w-full text-start px-4 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${item.materialId === m.id ? "bg-primary/10 text-primary font-semibold" : ""}`}
                                  onMouseDown={e => { e.preventDefault(); updateItem(idx, "materialId", String(m.id)); setMaterialSearch(prev => ({ ...prev, [idx]: "" })); setMaterialOpen(prev => ({ ...prev, [idx]: false })); }}>
                                  <span className="font-medium">{ar && m.nameAr ? m.nameAr : m.name}</span>
                                  {ar && m.nameAr && m.name !== m.nameAr && <span className="text-muted-foreground text-xs ms-1" dir="ltr">{m.name}</span>}
                                  <span className="text-muted-foreground text-xs ms-2">({m.unit})</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Qty | Unit Price | Total */}
                      <div className="grid grid-cols-3 gap-3 px-4 pb-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">{ar ? "الكمية" : "Qty"}</label>
                          <div className="flex items-center gap-1">
                            <NumericInput min="0.001" step="0.001" placeholder="0"
                              value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)}
                              className="h-10 text-sm" />
                            <NumericKeypad value={item.quantity} onChange={(v) => updateItem(idx, "quantity", v)} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">{ar ? "سعر الوحدة" : "Unit Price"}</label>
                          <div className="flex items-center gap-1">
                            <NumericInput min="0" step="0.01" placeholder="0.00"
                              value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                              className="h-10 text-sm" />
                            <NumericKeypad value={item.unitPrice} onChange={(v) => updateItem(idx, "unitPrice", v)} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">{ar ? "الإجمالي" : "Total"}</label>
                          <div className="flex items-center gap-1">
                            <NumericInput min="0" step="0.01" placeholder="0.00"
                              value={item.lineTotalInput} onChange={e => updateLineTotal(idx, e.target.value)}
                              className="h-10 text-sm font-semibold border-primary/50 focus:border-primary" />
                            <NumericKeypad value={item.lineTotalInput} onChange={(v) => updateLineTotal(idx, v)} />
                          </div>
                        </div>
                      </div>

                      {/* Row 3: VAT toggle + computed total display */}
                      <div className="flex items-center justify-between px-4 pb-3">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={item.vatEnabled}
                            onChange={e => updateItem(idx, "vatEnabled", e.target.checked as any)}
                            className="w-4 h-4 accent-primary cursor-pointer" />
                          <span className="text-xs text-muted-foreground">{ar ? "تفعيل ضريبة 5%" : "Enable 5% VAT"}</span>
                        </label>
                        <div className="text-sm font-bold text-primary">
                          {fmtCurrency(lineTotal, ar)}
                          {item.vatEnabled && lineVat > 0 && (
                            <span className="text-orange-500 text-xs font-normal ms-1">(+{fmtCurrency(lineVat, ar)} {ar ? "ض." : "VAT"})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* VAT + Totals */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch id="vat" checked={vatEnabled} onCheckedChange={setVatEnabled} />
                  <Label htmlFor="vat" className="cursor-pointer font-medium">
                    {ar ? "تفعيل ضريبة القيمة المضافة (5%)" : "Enable VAT (5%)"}
                  </Label>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>{ar ? "المجموع الفرعي" : "Subtotal"}</span>
                  <span>{fmtCurrency(subtotal, ar)}</span>
                </div>
                {vatEnabled && (
                  <div className="flex justify-between text-orange-600">
                    <span>{ar ? "ضريبة القيمة المضافة (5%)" : "VAT (5%)"}</span>
                    <span>{fmtCurrency(vatAmount, ar)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-border pt-2 mt-1">
                  <span>{ar ? "الإجمالي" : "Total"}</span>
                  <span className="text-primary">{fmtCurrency(total, ar)}</span>
                </div>
              </div>
            </div>

            {/* Payment Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "حالة الدفع" : "Payment Status"}</Label>
                <Select value={paymentStatus} onValueChange={v => setPaymentStatus(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="paid">{ar ? "تم الدفع" : "Paid"}</SelectItem>
                  <SelectItem value="deferred">{ar ? "مؤجل" : "Deferred"}</SelectItem>
                  <SelectItem value="partial">{ar ? "دفع جزئي" : "Partial Payment"}</SelectItem>
                  <SelectItem value="under_review">{ar ? "التدقيق" : "Under Review"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
              {paymentStatus === "partial" && (
                <div className="space-y-1.5">
                  <Label>{ar ? "المبلغ المدفوع" : "Paid Amount"}</Label>
                  <div className="flex items-center gap-1">
                    <NumericInput
                       min="0" step="0.01"
                      placeholder="0.00"
                      value={paidAmount}
                      onChange={e => setPaidAmount(e.target.value)}
                    />
                    <NumericKeypad value={paidAmount} onChange={(v) => setPaidAmount(v)} />
                  </div>
                </div>
              )}
            </div>

            {/* Expense Category */}
            <div className="space-y-1.5">
              <Label>{ar ? "تصنيف المصروف" : "Expense Category"}</Label>
              <Select value={supplierExpenseCategory} onValueChange={(v: any) => setSupplierExpenseCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operational">{ar ? "تشغيلية" : "Operational"}</SelectItem>
                  <SelectItem value="maintenance">{ar ? "صيانة ومعدات" : "Maintenance"}</SelectItem>
                  <SelectItem value="fixed">{ar ? "ثابتة" : "Fixed"}</SelectItem>
                  <SelectItem value="other">{ar ? "أخرى" : "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>{ar ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
              <Input placeholder={ar ? "أي ملاحظات إضافية..." : "Any additional notes..."} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {/* Actions - Supplier Invoice */}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="gap-2 min-w-32">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={14} className="animate-spin" /> : editInvoiceId !== null ? <Pencil size={14} /> : <Plus size={14} />}
                {editInvoiceId !== null ? (ar ? "حفظ التعديلات" : "Save Changes") : (ar ? "إنشاء الفاتورة" : "Create Invoice")}
              </Button>
            </div>
            </>)}

            {/* ─── Free Invoice Form ─── */}
            {((editInvoiceId === null && newInvoiceType === "free") || (editInvoiceId !== null && editInvoiceType === "free")) && (
              <FreeInvoiceFormInline
                ar={ar}
                isRTL={isRTL}
                editInvoiceId={editInvoiceId !== null && editInvoiceType === "free" ? editInvoiceId : undefined}
                editData={editInvoiceId !== null && editInvoiceType === "free" && editQuery.data ? editQuery.data as any : undefined}
                onClose={() => { setShowCreate(false); resetForm(); setEditInvoiceId(null); prevEditId.current = null; }}
                onSuccess={() => {
                  setShowCreate(false);
                  resetForm();
                  setEditInvoiceId(null);
                  prevEditId.current = null;
                  utils.invoices.allUnified.invalidate();
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── View Invoice Dialog ───────────────────────────────────────────── */}
      <Dialog open={viewInvoice !== null} onOpenChange={(o) => { if (!o) { setViewInvoice(null); setViewAuditTab("details"); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} className="text-primary" />
              {viewQuery.data?.invoiceNumber ?? "..."}
            </DialogTitle>
          </DialogHeader>
          {viewQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : viewQuery.data ? (() => {
            const inv = viewQuery.data as any;
            const cfg = STATUS_CONFIG[inv.paymentStatus as keyof typeof STATUS_CONFIG];
            const invStatusCfg = INVOICE_STATUS_CONFIG[(inv.invoiceStatus ?? "approved") as keyof typeof INVOICE_STATUS_CONFIG] ?? INVOICE_STATUS_CONFIG.approved;
            const isFreeView = viewInvoiceType === "free";
            return (
              <Tabs value={viewAuditTab} onValueChange={setViewAuditTab} dir={isRTL ? "rtl" : "ltr"}>
                <TabsList className="grid grid-cols-2 w-full mb-3">
                  <TabsTrigger value="details" className="gap-1.5"><FileText size={13} />{ar ? "التفاصيل" : "Details"}</TabsTrigger>
                  <TabsTrigger value="audit" className="gap-1.5"><History size={13} />{ar ? "سجل الأحداث" : "Audit Log"}</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4 mt-0">
                {/* Status row */}
                <div className={`flex items-center gap-2 flex-wrap ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${invStatusCfg.color}`}>
                    {ar ? invStatusCfg.labelAr : invStatusCfg.labelEn}
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                    {cfg.icon}{ar ? cfg.labelAr : cfg.labelEn}
                  </span>
                  {inv.supplierInvoiceNumber && (
                    <span className="text-xs text-muted-foreground" dir="ltr">#{inv.supplierInvoiceNumber}</span>
                  )}
                  {inv.stockUpdated && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                      <PackagePlus size={10} />{ar ? "مرحّل للمخزون" : "Posted to Stock"}
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">{ar ? "الجهة:" : "Party:"}</span> <span className="font-medium">{inv.supplierName ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">{ar ? "التاريخ:" : "Date:"}</span> <span className="font-medium">{fmtDate(isFreeView ? inv.date : inv.invoiceDate, ar)}</span></div>
                  {inv.dueDate && <div><span className="text-muted-foreground">{ar ? "الاستحقاق:" : "Due:"}</span> <span className={`font-medium ${new Date(inv.dueDate) < new Date() && inv.paymentStatus !== "paid" ? "text-red-600" : ""}`}>{fmtDate(inv.dueDate, ar)}</span></div>}
                  {inv.paymentStatus === "partial" && (
                    <div><span className="text-muted-foreground">{ar ? "المدفوع:" : "Paid:"}</span> <span className="font-medium">{fmtCurrency(inv.paidAmount, ar)}</span></div>
                  )}
                  {inv.expenseCategory && (
                    <div><span className="text-muted-foreground">{ar ? "تصنيف المصروف:" : "Category:"}</span> <span className="font-medium">{inv.expenseCategory === "operational" ? (ar ? "تشغيلية" : "Operational") : inv.expenseCategory === "maintenance" ? (ar ? "صيانة" : "Maintenance") : inv.expenseCategory === "fixed" ? (ar ? "ثابتة" : "Fixed") : (ar ? "أخرى" : "Other")}</span></div>
                  )}
                </div>

                {/* Items table */}
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        {isFreeView
                          ? [ar ? "البيان" : "Description", ar ? "الكمية" : "Qty", ar ? "سعر الوحدة" : "Unit Price", ar ? "الإجمالي" : "Total"].map(h => (
                            <th key={h} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-start">{h}</th>
                          ))
                          : [ar ? "المادة" : "Material", ar ? "الكمية" : "Qty", ar ? "سعر الوحدة" : "Unit Price", ar ? "الإجمالي" : "Total"].map(h => (
                            <th key={h} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-start">{h}</th>
                          ))
                        }
                      </tr>
                    </thead>
                    <tbody>
                      {(inv.items ?? []).map((item: any, idx: number) => (
                        <tr key={item.id ?? idx} className="border-t border-border/50">
                          <td className="px-3 py-2">{isFreeView ? item.description : item.materialName}</td>
                          <td className="px-3 py-2">{isFreeView ? (parseFloat(item.qty) || 1).toLocaleString() : (parseFloat(item.quantity).toLocaleString() + " " + item.materialUnit)}</td>
                          <td className="px-3 py-2">{fmtCurrency(item.unitPrice, ar)}</td>
                          <td className="px-3 py-2 font-medium">{fmtCurrency(isFreeView ? item.totalPrice : item.totalPrice, ar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{ar ? "المجموع الفرعي" : "Subtotal"}</span>
                    <span>{fmtCurrency(inv.subtotal, ar)}</span>
                  </div>
                  {(isFreeView ? parseFloat(inv.vatPct) > 0 : inv.vatEnabled) && (
                    <div className="flex justify-between text-orange-600">
                      <span>{ar ? `ضريبة القيمة المضافة (${isFreeView ? inv.vatPct : 5}%)` : `VAT (${isFreeView ? inv.vatPct : 5}%)`}</span>
                      <span>{fmtCurrency(inv.vatAmount, ar)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-border pt-1.5">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    <span className="text-primary">{fmtCurrency(inv.totalAmount, ar)}</span>
                  </div>
                  {/* Payment summary for partial/paid */}
                  {(inv.paymentStatus === "partial" || inv.paymentStatus === "paid") && (
                    <>
                      <div className="flex justify-between text-emerald-600 font-medium border-t border-border pt-1.5">
                        <span>{ar ? "إجمالي المدفوع" : "Total Paid"}</span>
                        <span>{fmtCurrency(inv.paidAmount, ar)}</span>
                      </div>
                      {inv.paymentStatus === "partial" && (
                        <div className="flex justify-between text-rose-600 font-medium">
                          <span>{ar ? "المتبقي (مؤجل)" : "Remaining (Deferred)"}</span>
                          <span>{fmtCurrency(
                            inv.remainingAmount ?? String(Math.max(0, parseFloat(inv.totalAmount || "0") - parseFloat(inv.paidAmount || "0")).toFixed(3)),
                            ar
                          )}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Payment History */}
                {inv.paymentHistory && inv.paymentHistory.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">{ar ? "سجل الدفعات" : "Payment History"}</h4>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-start text-muted-foreground">{ar ? "التاريخ" : "Date"}</th>
                            <th className="px-3 py-2 text-start text-muted-foreground">{ar ? "المبلغ" : "Amount"}</th>
                            <th className="px-3 py-2 text-start text-muted-foreground">{ar ? "النوع" : "Type"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.paymentHistory.map((ph: any, idx: number) => (
                            <tr key={ph.id ?? idx} className="border-t border-border/50">
                              <td className="px-3 py-2">{new Date(ph.paymentDate).toLocaleString(ar ? "ar-AE" : "en-AE")}</td>
                              <td className="px-3 py-2 font-medium text-emerald-600">{fmtCurrency(ph.paidAmount, ar)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                  ph.paymentType === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                  {ph.paymentType === "paid" ? (ar ? "دفع كامل" : "Full") : (ar ? "جزئي" : "Partial")}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {inv.notes && (
                  <p className="text-sm text-muted-foreground bg-muted/20 rounded-lg p-3">
                    <span className="font-medium">{ar ? "ملاحظات: " : "Notes: "}</span>{inv.notes}
                  </p>
                )}
                </TabsContent>

                <TabsContent value="audit" className="mt-0">
                  <InvoiceAuditLogPanel invoiceId={viewInvoice!} invoiceType={viewInvoiceType} ar={ar} isRTL={isRTL} />
                </TabsContent>
              </Tabs>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      {/* ─── Workflow Action Dialog ──────────────────────────────────────────── */}
      {workflowTarget && (
        <InvoiceWorkflowDialog
          target={workflowTarget}
          notes={workflowNotes}
          onNotesChange={setWorkflowNotes}
          ar={ar}
          isRTL={isRTL}
          isPending={updateInvoiceStatusMutation.isPending || updateFreeInvoiceStatusMutation.isPending}
          onClose={() => { setWorkflowTarget(null); setWorkflowNotes(""); }}
          onConfirm={() => {
            const payload = { id: workflowTarget.id, invoiceStatus: workflowTarget.action as any, notes: workflowNotes || undefined };
            if (workflowTarget.type === "free") updateFreeInvoiceStatusMutation.mutate(payload);
            else updateInvoiceStatusMutation.mutate(payload);
          }}
        />
      )}

      {/* ─── Update Status Dialog ──────────────────────────────────────────── */}
      <Dialog open={statusDialogId !== null} onOpenChange={(o) => { if (!o) setStatusDialogId(null); }}>
        <DialogContent className="max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt size={18} className="text-primary" />
              {ar ? "سجل الدفعات" : "Payment History"}
              {statusDialogDetailQuery.data && (
                <span className="text-sm font-normal text-muted-foreground">— {(statusDialogDetailQuery.data as any).invoiceNumber}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {statusDialogDetailQuery.isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : (() => {
            const inv = statusDialogDetailQuery.data as any;
            const totalAmt = parseFloat(inv?.totalAmount ?? "0") || 0;
            const paidAmt = parseFloat(inv?.paidAmount ?? "0") || 0;
            const remainingAmt = Math.max(0, parseFloat(inv?.remainingAmount ?? String(totalAmt - paidAmt)) || 0);
            const history: any[] = inv?.paymentHistory ?? [];
            const isPending = updateStatusMutation.isPending || updateFreeStatusMutationUnified.isPending;
            return (
              <div className="space-y-4 pt-1">
                {/* ملخص الفاتورة */}
                <div className="grid grid-cols-3 gap-2 bg-muted/30 rounded-lg p-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">{ar ? "إجمالي الفاتورة" : "Total"}</p>
                    <p className="text-sm font-bold text-foreground">{fmtCurrency(totalAmt, ar)}</p>
                  </div>
                  <div className="text-center border-x border-border">
                    <p className="text-xs text-muted-foreground mb-0.5">{ar ? "مدفوع" : "Paid"}</p>
                    <p className="text-sm font-bold text-emerald-600">{fmtCurrency(paidAmt, ar)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-0.5">{ar ? "متبقي" : "Remaining"}</p>
                    <p className={`text-sm font-bold ${remainingAmt > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmtCurrency(remainingAmt, ar)}</p>
                  </div>
                </div>

                {/* سجل الدفعات السابقة */}
                {history.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "الدفعات السابقة" : "Previous Payments"}</p>
                    <div className="rounded-lg border border-border overflow-hidden max-h-44 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr>
                            <th className="px-2.5 py-1.5 text-start text-muted-foreground">#</th>
                            <th className="px-2.5 py-1.5 text-start text-muted-foreground">{ar ? "التاريخ" : "Date"}</th>
                            <th className="px-2.5 py-1.5 text-start text-muted-foreground">{ar ? "المبلغ" : "Amount"}</th>
                            <th className="px-2.5 py-1.5 text-start text-muted-foreground">{ar ? "النوع" : "Type"}</th>
                            <th className="px-2.5 py-1.5 text-center text-muted-foreground">{ar ? "حذف" : "Del"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((ph: any, idx: number) => (
                            <tr key={ph.id ?? idx} className="border-t border-border/50 hover:bg-muted/20">
                              <td className="px-2.5 py-1.5 text-muted-foreground">{idx + 1}</td>
                              <td className="px-2.5 py-1.5">{new Date(ph.paymentDate).toLocaleString(ar ? "ar-AE" : "en-AE", { dateStyle: "short", timeStyle: "short" })}</td>
                              <td className="px-2.5 py-1.5 font-medium text-emerald-600">{fmtCurrency(ph.paidAmount, ar)}</td>
                              <td className="px-2.5 py-1.5">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                  ph.paymentType === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                                }`}>
                                  {ph.paymentType === "paid" ? (ar ? "كامل" : "Full") : (ar ? "جزئي" : "Partial")}
                                </span>
                              </td>
                              <td className="px-2.5 py-1.5 text-center">
                                <button
                                  type="button"
                                  title={ar ? "حذف الدفعة" : "Delete payment"}
                                  disabled={deletePaymentMutation.isPending || deleteFreePaymentMutation.isPending}
                                  onClick={() => {
                                    if (!ph.id) return;
                                    if (!window.confirm(ar ? `حذف الدفعة بمبلغ ${fmtCurrency(ph.paidAmount, ar)}؟ سيتم إرجاع المبلغ للمتبقي.` : `Delete payment of ${fmtCurrency(ph.paidAmount, ar)}? The amount will be reversed.`)) return;
                                    if (statusDialogType === "free") {
                                      deleteFreePaymentMutation.mutate({ paymentId: ph.id });
                                    } else {
                                      deletePaymentMutation.mutate({ paymentId: ph.id });
                                    }
                                  }}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-40 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* إضافة دفعة جديدة */}
                {remainingAmt > 0 ? (
                  <div className="space-y-3 border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{ar ? "إضافة دفعة جديدة" : "Add New Payment"}</p>
                    <div className="space-y-1.5">
                      <Label>{ar ? "نوع الدفع" : "Payment Type"}</Label>
                      <Select value={newStatus} onValueChange={v => setNewStatus(v as any)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="partial">{ar ? "دفع جزئي" : "Partial Payment"}</SelectItem>
                          <SelectItem value="paid">{ar ? "دفع كامل (تسوية كاملة)" : "Full Payment (Settle All)"}</SelectItem>
                          <SelectItem value="deferred">{ar ? "تأجيل" : "Defer"}</SelectItem>
                          <SelectItem value="under_review">{ar ? "تحت التدقيق" : "Under Review"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(newStatus === "partial" || newStatus === "paid") && (
                      <div className="space-y-1.5">
                        <Label>
                          {ar ? "مبلغ الدفعة" : "Payment Amount"}
                          {newStatus === "partial" && (
                            <span className="text-xs text-muted-foreground ms-1">({ar ? `المتبقي: ${fmtCurrency(remainingAmt, ar)}` : `Remaining: ${fmtCurrency(remainingAmt, ar)}`})</span>
                          )}
                        </Label>
                        <div className="flex items-center gap-1">
                          <NumericInput
                            min="0"
                            step="0.01"
                            placeholder={newStatus === "paid" ? String(remainingAmt.toFixed(3)) : "0.00"}
                            value={newPaidAmount}
                            onChange={e => setNewPaidAmount(e.target.value)}
                          />
                          <NumericKeypad value={newPaidAmount} onChange={(v) => setNewPaidAmount(v)} />
                        </div>
                        {newStatus === "partial" && newPaidAmount && parseFloat(newPaidAmount) > remainingAmt && (
                          <p className="text-xs text-amber-600">{ar ? "تحذير: المبلغ أكبر من المتبقي" : "Warning: Amount exceeds remaining balance"}</p>
                        )}
                      </div>
                    )}
                    {(newStatus === "paid" || newStatus === "partial") && (
                      <div className="space-y-1.5">
                        <Label>{ar ? "تاريخ ووقت الدفعة" : "Payment Date & Time"}</Label>
                        <input
                          type="datetime-local"
                          className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          value={newPaidAt}
                          max={(() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()}
                          onChange={e => setNewPaidAt(e.target.value)}
                        />
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setStatusDialogId(null)}>{ar ? "إغلاق" : "Close"}</Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const payload = {
                            id: statusDialogId!,
                            paymentStatus: newStatus,
                            paidAmount: (newStatus === "partial" || newStatus === "paid") && newPaidAmount ? parseFloat(newPaidAmount) : undefined,
                            paidAt: (newStatus === "paid" || newStatus === "partial") && newPaidAt ? new Date(newPaidAt).toISOString() : undefined,
                          };
                          if (statusDialogType === "free") {
                            updateFreeStatusMutationUnified.mutate(payload);
                          } else {
                            updateStatusMutation.mutate(payload);
                          }
                        }}
                        disabled={isPending || (newStatus === "partial" && !newPaidAmount)}
                        className="gap-2"
                      >
                        {isPending && <Loader2 size={14} className="animate-spin" />}
                        {ar ? "تسجيل الدفعة" : "Record Payment"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 border-t border-border pt-3">
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg p-3">
                      <CheckCircle size={16} />
                      <p className="text-sm font-medium">{ar ? "تم سداد الفاتورة بالكامل" : "Invoice fully paid"}</p>
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => setStatusDialogId(null)}>{ar ? "إغلاق" : "Close"}</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ExpenseImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        ar={ar}
        onImported={() => {
          utils.invoices.allUnified.invalidate();
          utils.freeInvoices.list.invalidate();
        }}
      />

      {monthFilter && (
        <DeleteMonthDialog
          open={showDeleteMonth}
          onOpenChange={setShowDeleteMonth}
          year={parseInt(monthFilter.split("-")[0], 10)}
          month={parseInt(monthFilter.split("-")[1], 10)}
          onDeleted={() => utils.invoices.allUnified.invalidate()}
        />
      )}
    </div>
  );
}

// ─── Free Invoices Section Component ──────────────────────────────────────────
interface FreeItem {
  description: string;
  qty: string;
  unitPrice: string;
}

function FreeInvoicesSection({ ar, isRTL }: { ar: boolean; isRTL: boolean }) {
  const utils = trpc.useUtils();

  // List state
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [statusDialogId, setStatusDialogId] = useState<number | null>(null);

  // Create form
  const [supplierName, setSupplierName] = useState("");
  const [supplierType, setSupplierType] = useState<"supplier" | "service">("supplier");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [vatPct, setVatPct] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "deferred" | "partial" | "under_review">("deferred");
  const [paidAmount, setPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<"operational" | "maintenance" | "fixed" | "other">("other");
  const [freeItems, setFreeItems] = useState<FreeItem[]>([{ description: "", qty: "1", unitPrice: "" }]);

  // Status update
  const [newStatus, setNewStatus] = useState<"paid" | "deferred" | "partial" | "under_review">("paid");
  const [newPaidAmount, setNewPaidAmount] = useState("");
  const [newPaidAt, setNewPaidAt] = useState<string>("");
  const [newPaymentMethod, setNewPaymentMethod] = useState<string>("cash");
  const [newPaymentAccount, setNewPaymentAccount] = useState<string>("");
  const [newReferenceNumber, setNewReferenceNumber] = useState<string>("");
  const statusDialogType = "free"; // always free in this component

  const queryFilters = useMemo(() => {
    const f: any = {};
    if (statusFilter !== "all") f.paymentStatus = statusFilter;
    if (typeFilter !== "all") f.supplierType = typeFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [statusFilter, typeFilter]);

  const listQuery = trpc.freeInvoices.list.useQuery(queryFilters);
  const viewQuery = trpc.freeInvoices.getById.useQuery({ id: viewId! }, { enabled: viewId !== null });

  const createMutation = trpc.freeInvoices.create.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم إنشاء الفاتورة الحرة" : "Free invoice created");
      utils.freeInvoices.list.invalidate();
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.freeInvoices.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم تحديث حالة الدفع" : "Payment status updated");
      utils.freeInvoices.list.invalidate();
      setStatusDialogId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.freeInvoices.delete.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حذف الفاتورة" : "Invoice deleted");
      utils.freeInvoices.list.invalidate();
      utils.invoices.allUnified.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setSupplierName(""); setSupplierType("supplier"); setInvoiceNumber("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setVatPct("0"); setPaymentStatus("deferred"); setPaidAmount(""); setNotes("");
    setExpenseCategory("other");
    setFreeItems([{ description: "", qty: "1", unitPrice: "" }]);
  }

  function addItem() {
    setFreeItems(prev => [...prev, { description: "", qty: "1", unitPrice: "" }]);
  }

  function removeItem(idx: number) {
    setFreeItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof FreeItem, val: string) {
    setFreeItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  const subtotal = freeItems.reduce((s, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.unitPrice) || 0;
    return s + q * p;
  }, 0);
  const vatAmount = subtotal * ((parseFloat(vatPct) || 0) / 100);
  const totalAmount = subtotal + vatAmount;

  function handleSubmit() {
    if (!supplierName.trim()) return toast.error(ar ? "أدخل اسم المورد/الخدمة" : "Enter supplier/service name");
    const validItems = freeItems.filter(i => i.description.trim() && parseFloat(i.qty) > 0 && parseFloat(i.unitPrice) >= 0);
    if (!validItems.length) return toast.error(ar ? "أضف بنداً واحداً على الأقل" : "Add at least one item");
    createMutation.mutate({
      supplierName: supplierName.trim(),
      supplierType,
      invoiceNumber: invoiceNumber.trim() || undefined,
      date: invoiceDate,
      vatPct: parseFloat(vatPct) || 0,
      paymentStatus,
      paidAmount: paidAmount ? parseFloat(paidAmount) : undefined,
      notes: notes.trim() || undefined,
      expenseCategory,
      items: validItems.map(i => ({ description: i.description, qty: parseFloat(i.qty), unitPrice: parseFloat(i.unitPrice) })),
    });
  }

  const invoiceList = (listQuery.data ?? []) as any[];
  const [freePage, setFreePage] = useState(1);
  const freePagination = usePagination(invoiceList, 15);
  const pagedFreeInvoices = freePagination.paginate(freePage);

  return (
    <div className="space-y-4" dir={isRTL ? "rtl" : "ltr"}>
      {/* Section Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Receipt size={20} className="text-violet-500" />
            {ar ? "الفواتير الحرة" : "Free Invoices"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ar ? "فواتير موردين وخدمات بدون ربط بالمخزون" : "Supplier & service invoices without inventory link"}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
          <Plus size={16} />
          {ar ? "فاتورة حرة جديدة" : "New Free Invoice"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ar ? "كل الحالات" : "All Statuses"}</SelectItem>
            <SelectItem value="paid">{ar ? "مدفوع" : "Paid"}</SelectItem>
            <SelectItem value="deferred">{ar ? "مؤجل" : "Deferred"}</SelectItem>
            <SelectItem value="partial">{ar ? "جزئي" : "Partial"}</SelectItem>
            <SelectItem value="under_review">{ar ? "التدقيق" : "Under Review"}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ar ? "كل الأنواع" : "All Types"}</SelectItem>
            <SelectItem value="supplier">{ar ? "مورد" : "Supplier"}</SelectItem>
            <SelectItem value="service">{ar ? "خدمة" : "Service"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Summary */}
      {!listQuery.isLoading && invoiceList.length > 0 && (() => {
        const totalDeferred = invoiceList.filter(i => i.paymentStatus === "deferred").reduce((s: number, i: any) => s + parseFloat(i.totalAmount || 0), 0);
        const totalPaid = invoiceList.filter(i => i.paymentStatus === "paid").reduce((s: number, i: any) => s + parseFloat(i.totalAmount || 0), 0);
        const totalPartialRemaining = invoiceList.filter(i => i.paymentStatus === "partial").reduce((s: number, i: any) => s + (parseFloat(i.totalAmount || 0) - parseFloat(i.paidAmount || 0)), 0);
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3">
              <div className="rounded-full bg-amber-100 dark:bg-amber-900/50 p-2.5"><Clock size={16} className="text-amber-600" /></div>
              <div>
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{ar ? "إجمالي المؤجل" : "Total Deferred"}</p>
                <p className="text-base font-bold text-amber-800 dark:text-amber-300">{fmtCurrency(totalDeferred, ar)}</p>
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/50 p-2.5"><AlertCircle size={16} className="text-blue-600" /></div>
              <div>
                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">{ar ? "متبقي جزئي" : "Partial Remaining"}</p>
                <p className="text-base font-bold text-blue-800 dark:text-blue-300">{fmtCurrency(totalPartialRemaining, ar)}</p>
              </div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-2.5"><CheckCircle size={16} className="text-emerald-600" /></div>
              <div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{ar ? "إجمالي المدفوع" : "Total Paid"}</p>
                <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">{fmtCurrency(totalPaid, ar)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                {[
                  ar ? "المورد/الخدمة" : "Supplier/Service",
                  ar ? "النوع" : "Type",
                  ar ? "رقم الفاتورة" : "Invoice #",
                  ar ? "التاريخ" : "Date",
                  ar ? "التصنيف" : "Category",
                  ar ? "الإجمالي" : "Total",
                  ar ? "حالة الدفع" : "Status",
                  ar ? "تاريخ الدفع" : "Paid At",
                  ar ? "إجراءات" : "Actions",
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground text-start">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : !invoiceList.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    <Receipt size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{ar ? "لا توجد فواتير حرة" : "No free invoices yet"}</p>
                    <p className="text-xs mt-1">{ar ? "أنشئ فاتورة حرة للبدء" : "Create a free invoice to get started"}</p>
                  </td>
                </tr>
              ) : (
                pagedFreeInvoices.map((inv: any) => {
                  const cfg = STATUS_CONFIG[inv.paymentStatus as keyof typeof STATUS_CONFIG];
                  return (
                    <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{inv.supplierName}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.supplierType === "service" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                          {inv.supplierType === "service" ? (ar ? "خدمة" : "Service") : (ar ? "مورد" : "Supplier")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.invoiceNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {/* للمدفوعة: عرض paidAt (تاريخ الدفع الفعلي)، للمؤجلة: عرض date (تاريخ الفاتورة) */}
                        {(inv.paymentStatus === "paid" || inv.paymentStatus === "partial") && inv.paidAt
                          ? <span title={ar ? `تاريخ الفاتورة: ${fmtDate(inv.date, ar)}` : `Invoice date: ${fmtDate(inv.date, ar)}`}>
                              {fmtDate(inv.paidAt, ar)}
                              <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">{ar ? "تاريخ الدفع" : "Paid date"}</span>
                            </span>
                          : fmtDate(inv.date, ar)
                        }
                      </td>
                      <td className="px-4 py-3">
                        {inv.expenseCategory && inv.expenseCategory !== "other" ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            inv.expenseCategory === "operational" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : inv.expenseCategory === "maintenance" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                            : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                          }`}>
                            {inv.expenseCategory === "operational" ? (ar ? "تشغيلية" : "Operational")
                              : inv.expenseCategory === "maintenance" ? (ar ? "صيانة" : "Maintenance")
                              : (ar ? "ثابتة" : "Fixed")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{ar ? "—" : "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold">{fmtCurrency(parseFloat(inv.totalAmount), ar)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${cfg.color}`}>
                          {cfg.icon}
                          {ar ? cfg.labelAr : cfg.labelEn}
                        </span>
                        {inv.paymentStatus === "partial" && (
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {ar ? "مدفوع:" : "Paid:"} {fmtCurrency(parseFloat(inv.paidAmount || 0), ar)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {inv.paymentHistory && inv.paymentHistory.length > 1 ? (
                          <div className="space-y-1">
                            {inv.paymentHistory.map((ph: any, idx: number) => (
                              <div key={ph.id ?? idx} className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="font-medium text-emerald-600">{fmtCurrency(ph.paidAmount, ar)}</span>
                                <span className="text-muted-foreground/50">·</span>
                                <span>{new Date(ph.paymentDate).toLocaleDateString(ar ? "ar-AE" : "en-AE", { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
                              </div>
                            ))}
                          </div>
                        ) : inv.paidAt ? (
                          <span className="whitespace-nowrap">
                            {new Date(inv.paidAt).toLocaleString(ar ? "ar-AE" : "en-AE", {
                              year: "numeric", month: "2-digit", day: "2-digit",
                              hour: "2-digit", minute: "2-digit", hour12: false,
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewId(inv.id)} title={ar ? "عرض" : "View"}>
                            <Eye size={13} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" onClick={() => { 
                              setStatusDialogId(inv.id); 
                              setNewStatus(inv.paymentStatus); 
                              setNewPaidAmount(inv.paidAmount ?? ""); 
                              const now = new Date();
                              const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setNewPaidAt(localISO);
                            }} title={ar ? "تحديث الدفع" : "Update payment"}>
                            <CheckCircle size={13} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm(ar ? "حذف هذه الفاتورة؟" : "Delete this invoice?")) deleteMutation.mutate({ id: inv.id }); }} title={ar ? "حذف" : "Delete"}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border">
          <Pagination currentPage={freePage} totalPages={freePagination.totalPages} onPageChange={setFreePage} totalItems={freePagination.totalItems} pageSize={15} />
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt size={18} className="text-violet-500" />
              {ar ? "إنشاء فاتورة حرة" : "Create Free Invoice"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Supplier Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "اسم المورد / الخدمة" : "Supplier / Service Name"}</Label>
                <Input placeholder={ar ? "مثال: شركة الكهرباء، مورد التوابل..." : "e.g. Electricity Co., Spice Supplier..."} value={supplierName} onChange={e => setSupplierName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "النوع" : "Type"}</Label>
                <Select value={supplierType} onValueChange={(v: any) => setSupplierType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier">{ar ? "مورد" : "Supplier"}</SelectItem>
                    <SelectItem value="service">{ar ? "خدمة" : "Service"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "رقم الفاتورة" : "Invoice Number"}</Label>
                <div className="relative">
                  <Input
                    placeholder={ar ? "تلقائي: FREE-YYYYMMDD-0001" : "Auto: FREE-YYYYMMDD-0001"}
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    className="pr-8"
                  />
                  {invoiceNumber && (
                    <button
                      type="button"
                      onClick={() => setInvoiceNumber("")}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                      title={ar ? "مسح للرقم التلقائي" : "Clear for auto-number"}
                    >×</button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{ar ? "اتركه فارغاً ليولده النظام تلقائياً" : "Leave empty for auto-generated number"}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "تاريخ الفاتورة" : "Invoice Date"}</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{ar ? "البنود" : "Line Items"}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 text-xs gap-1">
                  <Plus size={12} />{ar ? "إضافة بند" : "Add Item"}
                </Button>
              </div>
              <div className="space-y-2">
                {freeItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6">
                      <Input placeholder={ar ? "وصف البند..." : "Item description..."} value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min="0" step="0.001" placeholder={ar ? "الكمية" : "Qty"} value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-3">
                      <Input type="number" min="0" step="0.01" placeholder={ar ? "سعر الوحدة" : "Unit Price"} value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {freeItems.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* VAT + Totals */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "نسبة الضريبة %" : "VAT %"}</Label>
                <Input type="number" min="0" max="100" step="0.5" placeholder="0" value={vatPct} onChange={e => setVatPct(e.target.value)} className="h-9" />
              </div>
              <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{ar ? "المجموع الفرعي:" : "Subtotal:"}</span><span className="font-medium">{fmtCurrency(subtotal, ar)}</span></div>
                {parseFloat(vatPct) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{ar ? "الضريبة:" : "VAT:"}</span><span>{fmtCurrency(vatAmount, ar)}</span></div>}
                <div className="flex justify-between font-bold border-t border-border pt-1 mt-1"><span>{ar ? "الإجمالي:" : "Total:"}</span><span className="text-primary">{fmtCurrency(totalAmount, ar)}</span></div>
              </div>
            </div>

            {/* Payment + Expense Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{ar ? "حالة الدفع" : "Payment Status"}</Label>
                <Select value={paymentStatus} onValueChange={(v: any) => setPaymentStatus(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">{ar ? "مدفوع" : "Paid"}</SelectItem>
                    <SelectItem value="deferred">{ar ? "مؤجل" : "Deferred"}</SelectItem>
                    <SelectItem value="partial">{ar ? "دفع جزئي" : "Partial"}</SelectItem>
                    <SelectItem value="under_review">{ar ? "التدقيق" : "Under Review"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{ar ? "تصنيف المصروف" : "Expense Category"}</Label>
                <Select value={expenseCategory} onValueChange={(v: any) => setExpenseCategory(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operational">{ar ? "تشغيلية" : "Operational"}</SelectItem>
                    <SelectItem value="maintenance">{ar ? "صيانة ومعدات" : "Maintenance"}</SelectItem>
                    <SelectItem value="fixed">{ar ? "ثابتة" : "Fixed"}</SelectItem>
                    <SelectItem value="other">{ar ? "أخرى" : "Other"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {paymentStatus === "partial" && (
              <div className="space-y-1.5">
                <Label>{ar ? "المبلغ المدفوع" : "Paid Amount"}</Label>
                <div className="flex items-center gap-1">
                  <NumericInput min="0" step="0.01" placeholder="0.00" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
                  <NumericKeypad value={paidAmount} onChange={setPaidAmount} />
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>{ar ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
              <Input placeholder={ar ? "أي ملاحظات إضافية..." : "Any additional notes..."} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>{ar ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {ar ? "حفظ الفاتورة" : "Save Invoice"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewId !== null} onOpenChange={(o) => { if (!o) setViewId(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt size={18} className="text-violet-500" />
              {ar ? "تفاصيل الفاتورة الحرة" : "Free Invoice Details"}
            </DialogTitle>
          </DialogHeader>
          {viewQuery.isLoading ? (
            <div className="py-8 text-center"><Loader2 size={24} className="animate-spin mx-auto text-muted-foreground" /></div>
          ) : viewQuery.data ? (() => {
            const inv = viewQuery.data as any;
            const cfg = STATUS_CONFIG[inv.paymentStatus as keyof typeof STATUS_CONFIG];
            return (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">{ar ? "المورد:" : "Supplier:"}</span><p className="font-semibold">{inv.supplierName}</p></div>
                  <div><span className="text-muted-foreground">{ar ? "النوع:" : "Type:"}</span><p className="font-semibold">{inv.supplierType === "service" ? (ar ? "خدمة" : "Service") : (ar ? "مورد" : "Supplier")}</p></div>
                  {inv.invoiceNumber && <div><span className="text-muted-foreground">{ar ? "رقم الفاتورة:" : "Invoice #:"}</span><p className="font-mono font-semibold">{inv.invoiceNumber}</p></div>}
                  <div>
                    <span className="text-muted-foreground">{ar ? "تاريخ الفاتورة:" : "Invoice Date:"}</span>
                    <p className="font-semibold">{fmtDate(inv.date, ar)}</p>
                  </div>
                  {(inv.paymentStatus === "paid" || inv.paymentStatus === "partial") && inv.paidAt && (
                    <div>
                      <span className="text-muted-foreground">{ar ? "تاريخ الدفع:" : "Paid Date:"}</span>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtDate(inv.paidAt, ar)}</p>
                    </div>
                  )}
                  {inv.expenseCategory && inv.expenseCategory !== "other" && (
                    <div>
                      <span className="text-muted-foreground">{ar ? "تصنيف المصروف:" : "Expense Category:"}</span>
                      <p className="font-semibold">
                        {inv.expenseCategory === "operational" ? (ar ? "تشغيلية" : "Operational")
                          : inv.expenseCategory === "maintenance" ? (ar ? "صيانة ومعدات" : "Maintenance")
                          : inv.expenseCategory === "fixed" ? (ar ? "ثابتة" : "Fixed")
                          : (ar ? "أخرى" : "Other")}
                      </p>
                    </div>
                  )}
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">{ar ? "الوصف" : "Description"}</th>
                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">{ar ? "الكمية" : "Qty"}</th>
                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">{ar ? "السعر" : "Price"}</th>
                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">{ar ? "الإجمالي" : "Total"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inv.items ?? []).map((item: any) => (
                        <tr key={item.id} className="border-t border-border/50">
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2">{parseFloat(item.qty)}</td>
                          <td className="px-3 py-2">{fmtCurrency(parseFloat(item.unitPrice), ar)}</td>
                          <td className="px-3 py-2 font-medium">{fmtCurrency(parseFloat(item.total), ar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{ar ? "المجموع الفرعي:" : "Subtotal:"}</span><span>{fmtCurrency(parseFloat(inv.subtotal), ar)}</span></div>
                  {parseFloat(inv.vatPct) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{ar ? `ضريبة (${inv.vatPct}%):` : `VAT (${inv.vatPct}%):`}</span><span>{fmtCurrency(parseFloat(inv.vatAmount), ar)}</span></div>}
                  <div className="flex justify-between font-bold border-t border-border pt-1"><span>{ar ? "الإجمالي:" : "Total:"}</span><span className="text-primary">{fmtCurrency(parseFloat(inv.totalAmount), ar)}</span></div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${cfg.color}`}>{cfg.icon}{ar ? cfg.labelAr : cfg.labelEn}</span>
                  {inv.paymentStatus === "partial" && <span className="text-xs text-muted-foreground">{ar ? `مدفوع: ${fmtCurrency(parseFloat(inv.paidAmount || 0), ar)}` : `Paid: ${fmtCurrency(parseFloat(inv.paidAmount || 0), ar)}`}</span>}
                </div>
                {inv.notes && <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2">{inv.notes}</p>}
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={statusDialogId !== null} onOpenChange={(o) => { if (!o) setStatusDialogId(null); }}>
        <DialogContent className="max-w-sm" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{ar ? "تحديث حالة الدفع" : "Update Payment Status"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{ar ? "حالة الدفع" : "Payment Status"}</Label>
              <Select value={newStatus} onValueChange={(v: any) => setNewStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">{ar ? "مدفوع" : "Paid"}</SelectItem>
                  <SelectItem value="deferred">{ar ? "مؤجل" : "Deferred"}</SelectItem>
                  <SelectItem value="partial">{ar ? "دفع جزئي" : "Partial"}</SelectItem>
                  <SelectItem value="under_review">{ar ? "التدقيق" : "Under Review"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newStatus === "partial" && (
              <div className="space-y-1.5">
                <Label>{ar ? "المبلغ المدفوع" : "Paid Amount"}</Label>
                <div className="flex items-center gap-1">
                  <NumericInput min="0" step="0.01" placeholder="0.00" value={newPaidAmount} onChange={e => setNewPaidAmount(e.target.value)} />
                  <NumericKeypad value={newPaidAmount} onChange={setNewPaidAmount} />
                </div>
              </div>
            )}
            {(newStatus === "paid" || newStatus === "partial") && (
              <>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    {ar ? "تاريخ ووقت الدفع" : "Payment Date & Time"}
                    <span className="text-xs text-muted-foreground">({ar ? "يدوي" : "manual"})</span>
                  </Label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    value={newPaidAt}
                    max={(() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })()}
                    onChange={e => setNewPaidAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{ar ? "يجب ألا يتجاوز الوقت الحالي" : "Cannot be in the future"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{ar ? "طريقة الدفع" : "Payment Method"}</Label>
                    <Select value={newPaymentMethod} onValueChange={setNewPaymentMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHOD_CONFIG).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{ar ? v.labelAr : v.labelEn}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{ar ? "رقم المرجع" : "Reference No."}</Label>
                    <Input value={newReferenceNumber} onChange={e => setNewReferenceNumber(e.target.value)} placeholder={ar ? "اختياري" : "Optional"} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{ar ? "الحساب / الخزينة" : "Account"}</Label>
                  <Select value={newPaymentAccount} onValueChange={setNewPaymentAccount}>
                    <SelectTrigger><SelectValue placeholder={ar ? "اختر حساب..." : "Select account..."} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashbox">{ar ? "صندوق النقدية" : "Cashbox"}</SelectItem>
                      <SelectItem value="bank">{ar ? "حساب بنكي" : "Bank Account"}</SelectItem>
                      <SelectItem value="petty_cash">{ar ? "المصروفات النثرية" : "Petty Cash"}</SelectItem>
                      <SelectItem value="other">{ar ? "أخرى" : "Other"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setStatusDialogId(null)}>{ar ? "إلغاء" : "Cancel"}</Button>
              <Button onClick={() => {
                const payload: any = {
                  id: statusDialogId!, paymentStatus: newStatus,
                  paidAmount: newPaidAmount ? parseFloat(newPaidAmount) : undefined,
                  paidAt: (newStatus === "paid" || newStatus === "partial") && newPaidAt ? new Date(newPaidAt).toISOString() : undefined,
                  paymentMethod: newPaymentMethod as any,
                  paymentAccount: newPaymentAccount || undefined,
                  referenceNumber: newReferenceNumber || undefined,
                };
                updateStatusMutation.mutate(payload);
              }} disabled={updateStatusMutation.isPending} className="gap-2">
                {updateStatusMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {ar ? "حفظ الدفعة" : "Save Payment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── FreeInvoiceFormInline ─────────────────────────────────────────────────────
interface FreeItem { description: string; qty: string; unitPrice: string; }

function FreeInvoiceFormInline({ ar, isRTL, onClose, onSuccess, editInvoiceId, editData }: {
  ar: boolean;
  isRTL: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editInvoiceId?: number;
  editData?: any;
}) {
  const isEdit = editInvoiceId != null;
  const [partyName, setPartyName] = useState(editData?.supplierName ?? "");
  const [invoiceDate, setInvoiceDate] = useState(() => {
    if (editData?.date) return new Date(editData.date).toISOString().slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  });
  const [expenseCategory, setExpenseCategory] = useState<"operational" | "maintenance" | "fixed" | "other">(editData?.expenseCategory ?? "operational");
  const [vatPct, setVatPct] = useState(editData?.vatPct ? String(parseFloat(editData.vatPct)) : "0");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "deferred" | "partial">(editData?.paymentStatus ?? "deferred");
  const [paidAmount, setPaidAmount] = useState(editData?.paidAmount ? String(parseFloat(editData.paidAmount)) : "");
  const [notes, setNotes] = useState(editData?.notes ?? "");
  const [items, setItems] = useState<FreeItem[]>(() => {
    if (editData?.items?.length) {
      return editData.items.map((it: any) => ({
        description: it.description ?? "",
        qty: String(parseFloat(it.qty) || 1),
        unitPrice: String(parseFloat(it.unitPrice) || 0),
      }));
    }
    return [{ description: "", qty: "1", unitPrice: "" }];
  });

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.unitPrice) || 0), 0);
  const vatAmount = subtotal * (parseFloat(vatPct) || 0) / 100;
  const totalAmount = subtotal + vatAmount;

  const utils = trpc.useUtils();
  const createMutation = trpc.freeInvoices.create.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم إنشاء الفاتورة الحرة" : "Free invoice created");
      utils.invoices.allUnified.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.freeInvoices.update.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم تحديث الفاتورة الحرة" : "Free invoice updated");
      utils.invoices.allUnified.invalidate();
      utils.freeInvoices.list.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  function addItem() { setItems(p => [...p, { description: "", qty: "1", unitPrice: "" }]); }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof FreeItem, val: string) {
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  }

  function handleSubmit() {
    if (!partyName.trim()) return toast.error(ar ? "أدخل اسم الجهة" : "Enter party name");
    if (items.some(it => !it.description.trim())) return toast.error(ar ? "أدخل وصف لكل بند" : "Enter description for each item");
    const payload = {
      supplierName: partyName,
      date: invoiceDate,
      expenseCategory,
      vatPct: parseFloat(vatPct) || 0,
      paymentStatus,
      paidAmount: paymentStatus === "partial" ? parseFloat(paidAmount) || 0 : undefined,
      notes: notes || undefined,
      items: items.map(it => ({
        description: it.description,
        qty: parseFloat(it.qty) || 1,
        unitPrice: parseFloat(it.unitPrice) || 0,
      })),
    };
    if (isEdit && editInvoiceId) {
      updateMutation.mutate({ ...payload, id: editInvoiceId });
    } else {
      createMutation.mutate({ ...payload, supplierType: "service" as const });
    }
  }

  return (
    <div className="space-y-4" dir={isRTL ? "rtl" : "ltr"}>
      {/* Party + Date */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{ar ? "اسم الجهة / المورد" : "Party / Supplier Name"}</Label>
          <Input placeholder={ar ? "مثال: شركة الغاز، صيانة مكيفات..." : "e.g. Gas company, AC maintenance..."} value={partyName} onChange={e => setPartyName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{ar ? "تاريخ الفاتورة" : "Invoice Date"}</Label>
          <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
        </div>
      </div>
      {/* Expense Category */}
      <div className="space-y-1.5">
        <Label>{ar ? "تصنيف المصروف" : "Expense Category"}</Label>
        <Select value={expenseCategory} onValueChange={(v: any) => setExpenseCategory(v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="operational">{ar ? "تشغيلية" : "Operational"}</SelectItem>
            <SelectItem value="maintenance">{ar ? "صيانة ومعدات" : "Maintenance & Equipment"}</SelectItem>
            <SelectItem value="fixed">{ar ? "ثابتة" : "Fixed"}</SelectItem>
            <SelectItem value="other">{ar ? "أخرى" : "Other"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Items */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{ar ? "البنود" : "Items"}</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 text-xs gap-1"><Plus size={12} />{ar ? "إضافة بند" : "Add Item"}</Button>
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-6">
              <Input placeholder={ar ? "الوصف..." : "Description..."} value={it.description} onChange={e => updateItem(i, "description", e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="col-span-2">
              <Input type="number" min="0" step="0.01" placeholder={ar ? "الكمية" : "Qty"} value={it.qty} onChange={e => updateItem(i, "qty", e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="col-span-3">
              <Input type="number" min="0" step="0.01" placeholder={ar ? "السعر" : "Price"} value={it.unitPrice} onChange={e => updateItem(i, "unitPrice", e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="col-span-1 flex justify-center">
              {items.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeItem(i)}><Trash2 size={13} /></Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* VAT + Totals */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{ar ? "نسبة الضريبة %" : "VAT %"}</Label>
          <Input type="number" min="0" max="100" step="0.5" placeholder="0" value={vatPct} onChange={e => setVatPct(e.target.value)} className="h-9" />
        </div>
        <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{ar ? "المجموع الفرعي:" : "Subtotal:"}</span><span className="font-medium">{subtotal.toFixed(2)}</span></div>
          {parseFloat(vatPct) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{ar ? "الضريبة:" : "VAT:"}</span><span>{vatAmount.toFixed(2)}</span></div>}
          <div className="flex justify-between font-bold border-t border-border pt-1 mt-1"><span>{ar ? "الإجمالي:" : "Total:"}</span><span className="text-primary">{totalAmount.toFixed(2)}</span></div>
        </div>
      </div>
      {/* Payment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{ar ? "حالة الدفع" : "Payment Status"}</Label>
          <Select value={paymentStatus} onValueChange={(v: any) => setPaymentStatus(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="paid">{ar ? "مدفوع" : "Paid"}</SelectItem>
              <SelectItem value="deferred">{ar ? "مؤجل" : "Deferred"}</SelectItem>
              <SelectItem value="partial">{ar ? "دفع جزئي" : "Partial"}</SelectItem>
              <SelectItem value="under_review">{ar ? "التدقيق" : "Under Review"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {paymentStatus === "partial" && (
          <div className="space-y-1.5">
            <Label>{ar ? "المبلغ المدفوع" : "Paid Amount"}</Label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
          </div>
        )}
      </div>
      {/* Notes */}
      <div className="space-y-1.5">
        <Label>{ar ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
        <Input placeholder={ar ? "أي ملاحظات..." : "Any notes..."} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      {/* Actions */}
      <div className="flex gap-3 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
          {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
          {isEdit ? <Pencil size={14} /> : <Receipt size={14} />}
          {isEdit ? (ar ? "حفظ التعديلات" : "Save Changes") : (ar ? "حفظ الفاتورة الحرة" : "Save Free Invoice")}
        </Button>
      </div>
    </div>
  );
}

// ─── Invoice Workflow Dialog ──────────────────────────────────────────────────
function InvoiceWorkflowDialog({ target, notes, onNotesChange, ar, isRTL, isPending, onClose, onConfirm }: {
  target: { id: number; type: "supplier" | "free"; action: string; invoiceNumber: string };
  notes: string; onNotesChange: (v: string) => void;
  ar: boolean; isRTL: boolean; isPending: boolean;
  onClose: () => void; onConfirm: () => void;
}) {
  const { Dialog, DialogContent, DialogHeader, DialogTitle } = require("@/components/ui/dialog");
  const actionMap: Record<string, { titleAr: string; titleEn: string; descAr: string; descEn: string; btnAr: string; btnEn: string; cls: string }> = {
    draft:     { titleAr: "إعادة لمسودة", titleEn: "Back to Draft", descAr: "سيتم إرجاع الفاتورة لحالة المسودة.", descEn: "Invoice will be moved back to draft.", btnAr: "تأكيد", btnEn: "Confirm", cls: "bg-gray-600 hover:bg-gray-700 text-white" },
    pending:   { titleAr: "إرسال للمراجعة", titleEn: "Submit for Review", descAr: "سيتم إرسال الفاتورة للمراجعة والاعتماد.", descEn: "Invoice will be sent for review and approval.", btnAr: "إرسال", btnEn: "Submit", cls: "bg-orange-600 hover:bg-orange-700 text-white" },
    approved:  { titleAr: "اعتماد الفاتورة", titleEn: "Approve Invoice", descAr: "سيتم اعتماد الفاتورة. يمكن ترحيلها للمخزون بعد ذلك.", descEn: "Invoice will be approved. You can then post it to inventory.", btnAr: "اعتماد", btnEn: "Approve", cls: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    rejected:  { titleAr: "رفض الفاتورة", titleEn: "Reject Invoice", descAr: "سيتم رفض الفاتورة وإرجاعها للمراجعة.", descEn: "Invoice will be rejected and returned for correction.", btnAr: "رفض", btnEn: "Reject", cls: "bg-red-600 hover:bg-red-700 text-white" },
    cancelled: { titleAr: "إلغاء الفاتورة", titleEn: "Cancel Invoice", descAr: "سيتم إلغاء الفاتورة ولن يمكن تعديلها.", descEn: "Invoice will be cancelled and become read-only.", btnAr: "إلغاء الفاتورة", btnEn: "Cancel Invoice", cls: "bg-muted-foreground hover:opacity-80 text-white" },
  };
  const cfg = actionMap[target.action] ?? actionMap.pending;
  const { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } = require("@/components/ui/alert-dialog");
  const { Label } = require("@/components/ui/label");
  const { Textarea } = require("@/components/ui/textarea");

  return (
    <AlertDialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
        <AlertDialogHeader>
          <AlertDialogTitle>{ar ? cfg.titleAr : cfg.titleEn}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-1">
            <span className="block font-medium text-foreground" dir="ltr">{target.invoiceNumber}</span>
            <span className="block">{ar ? cfg.descAr : cfg.descEn}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-1 space-y-1.5">
          <Label className="text-xs">{ar ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
          <Textarea rows={2} value={notes} onChange={(e: any) => onNotesChange(e.target.value)} placeholder={ar ? "سبب التغيير..." : "Reason for change..."} className="text-sm" />
        </div>
        <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
          <AlertDialogCancel disabled={isPending}>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending} className={cfg.cls}>
            {isPending && <Loader2 size={13} className="animate-spin me-1" />}
            {ar ? cfg.btnAr : cfg.btnEn}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Invoice Audit Log Panel ──────────────────────────────────────────────────
function InvoiceAuditLogPanel({ invoiceId, invoiceType, ar, isRTL }: {
  invoiceId: number; invoiceType: "supplier" | "free"; ar: boolean; isRTL: boolean;
}) {
  const { data: logs = [], isLoading } = trpc.invoices.getAuditLog.useQuery({ invoiceId, invoiceType }, { enabled: !!invoiceId });

  const ACTION_LABELS: Record<string, { ar: string; en: string; color: string }> = {
    created:          { ar: "إنشاء",             en: "Created",          color: "bg-blue-100 text-blue-700" },
    edited:           { ar: "تعديل",             en: "Edited",           color: "bg-amber-100 text-amber-700" },
    draft:            { ar: "إرجاع لمسودة",      en: "Back to Draft",    color: "bg-gray-100 text-gray-700" },
    pending:          { ar: "إرسال للمراجعة",    en: "Submitted",        color: "bg-orange-100 text-orange-700" },
    approved:         { ar: "اعتماد",             en: "Approved",         color: "bg-emerald-100 text-emerald-700" },
    rejected:         { ar: "رفض",               en: "Rejected",         color: "bg-red-100 text-red-700" },
    cancelled:        { ar: "إلغاء",              en: "Cancelled",        color: "bg-muted text-muted-foreground" },
    payment_added:    { ar: "إضافة دفعة",         en: "Payment Added",    color: "bg-green-100 text-green-700" },
    payment_voided:   { ar: "إلغاء دفعة",         en: "Payment Voided",   color: "bg-red-100 text-red-700" },
    inventory_posted: { ar: "ترحيل للمخزون",     en: "Posted to Stock",  color: "bg-purple-100 text-purple-700" },
  };

  if (isLoading) return <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className={`space-y-2 ${isRTL ? "text-right" : ""}`}>
      {(logs as any[]).length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{ar ? "لا توجد أحداث مسجّلة بعد" : "No audit events recorded yet"}</p>
      ) : (logs as any[]).map((log: any) => {
        const cfg = ACTION_LABELS[log.action] ?? { ar: log.action, en: log.action, color: "bg-gray-100 text-gray-600" };
        return (
          <div key={log.id} className={`flex items-start gap-3 bg-muted/30 rounded-lg px-3 py-2.5 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${cfg.color}`}>
              {ar ? cfg.ar : cfg.en}
            </span>
            <div className={`flex-1 min-w-0 ${isRTL ? "text-right" : ""}`}>
              {log.userName && <span className="font-medium">{log.userName}</span>}
              {log.notes && <span className="text-muted-foreground ms-1">— {log.notes}</span>}
            </div>
            <span className="text-muted-foreground shrink-0 tabular-nums" dir="ltr">
              {new Date(log.createdAt).toLocaleString(ar ? "ar-AE" : "en-AE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
