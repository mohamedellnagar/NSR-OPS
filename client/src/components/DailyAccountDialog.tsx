import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  TrendingDown,
  ShoppingCart,
  ArrowRightLeft,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getToday(): string {
  const now = new Date();
  const dubaiMs = now.getTime() + 4 * 60 * 60 * 1000;
  const dubai = new Date(dubaiMs);
  const dubaiHour = dubai.getUTCHours();
  if (dubaiHour < 6) {
    const yesterday = new Date(dubaiMs - 24 * 60 * 60 * 1000);
    return yesterday.toISOString().slice(0, 10);
  }
  return dubai.toISOString().slice(0, 10);
}

function formatDateArLong(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString("ar-AE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const toNum = (s: string) => parseFloat(s) || 0;

// ─── Form State ───────────────────────────────────────────────────────────────
export interface DailyFormState {
  accountDate: string;
  salesCash: string;
  salesCard: string;
  salesKita: string;
  salesOrders: string;
  salesNoon: string;
  salesDeliveroo: string;
  salesCareem: string;
  expensesFixed: string;
  supplyToRestaurant: string;
  supplyToManagement: string;
  supplyExtra: string;
  notes: string;
}

export const emptyDailyForm = (date?: string): DailyFormState => ({
  accountDate: date ?? getToday(),
  salesCash: "",
  salesCard: "",
  salesKita: "",
  salesOrders: "",
  salesNoon: "",
  salesDeliveroo: "",
  salesCareem: "",
  expensesFixed: "",
  supplyToRestaurant: "",
  supplyToManagement: "",
  supplyExtra: "",
  notes: "",
});

// ─── Expense Categories ───────────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  { value: "operational", label: "تشغيلية", color: "text-orange-600" },
  { value: "maintenance", label: "صيانة ومعدات", color: "text-blue-600" },
  { value: "fixed", label: "ثابتة", color: "text-purple-600" },
  { value: "other", label: "أخرى", color: "text-gray-500" },
] as const;

// ─── InvoiceAccordionRow: صف قابل للتوسيع يعرض بنود الفاتورة ──────────────────
type ItemRow = { description: string; qty: number; unitPrice: number; total: number };
function InvoiceAccordionRow({
  inv,
  amountColor = "text-red-600",
  showPaidAmount = false,
}: {
  inv: { id: number; supplierName: string; invoiceNumber: string | null; totalAmount: number; paidAmount?: number; paidAt?: Date | null; items?: ItemRow[] };
  amountColor?: string;
  showPaidAmount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasItems = (inv.items?.length ?? 0) > 0;
  const displayAmount = showPaidAmount ? (inv.paidAmount ?? 0) : inv.totalAmount;
  return (
    <div>
      <button
        type="button"
        onClick={() => hasItems && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/20 transition-colors ${hasItems ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasItems ? (
            open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <span className="w-3.5" />
          )}
          <span className="font-medium truncate max-w-[120px]" title={inv.supplierName}>{inv.supplierName}</span>
          {inv.invoiceNumber && <span className="text-muted-foreground shrink-0">{inv.invoiceNumber}</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {inv.paidAt && (
            <span className="text-muted-foreground">
              {new Date(inv.paidAt).toLocaleString("ar-AE", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          )}
          <span className={`font-semibold ${amountColor}`}>
            {displayAmount.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
          </span>
        </div>
      </button>
      {open && hasItems && (
        <div className="bg-muted/10 border-t px-4 pb-2">
          <table className="w-full text-xs mt-1">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-right py-1 font-medium">البيان</th>
                <th className="text-center py-1 font-medium w-12">كمية</th>
                <th className="text-left py-1 font-medium w-20">سعر الوحدة</th>
                <th className="text-left py-1 font-medium w-20">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {inv.items!.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 text-right">{item.description}</td>
                  <td className="py-1 text-center text-muted-foreground">{item.qty}</td>
                  <td className="py-1 text-left text-muted-foreground">{item.unitPrice.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-1 text-left font-medium">{item.total.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── FreeInvoiceAccordionRow: فاتورة حرة مع Accordion و select التصنيف ───────────────
function FreeInvoiceAccordionRow({
  invoice,
  accountDate,
}: {
  invoice: { id: number; supplierName: string; invoiceNumber: string | null; totalAmount: number; expenseCategory: string; items?: ItemRow[] };
  accountDate: string;
}) {
  const [open, setOpen] = useState(false);
  const hasItems = (invoice.items?.length ?? 0) > 0;
  const utils = trpc.useUtils();
  const updateCategory = trpc.dailyAccounts.updateInvoiceCategory.useMutation({
    onSuccess: () => {
      utils.dailyAccounts.expensesForDate.invalidate({ accountDate });
      toast.success("تم تحديث تصنيف الفاتورة");
    },
    onError: (e) => toast.error(e.message),
  });
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === invoice.expenseCategory);
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/20 transition-colors">
        <button
          type="button"
          onClick={() => hasItems && setOpen((o) => !o)}
          className={`flex items-center gap-1.5 min-w-0 flex-1 ${hasItems ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {hasItems ? (
            open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <span className="w-3.5" />
          )}
          <span className="font-medium truncate max-w-[120px]" title={invoice.supplierName}>{invoice.supplierName}</span>
          {invoice.invoiceNumber && <span className="text-muted-foreground shrink-0">{invoice.invoiceNumber}</span>}
          <span className="font-semibold text-orange-600 shrink-0 mr-auto">
            {invoice.totalAmount.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
          </span>
        </button>
        <Select
          value={invoice.expenseCategory}
          onValueChange={(val) =>
            updateCategory.mutate({ invoiceId: invoice.id, category: val as "operational" | "maintenance" | "fixed" | "other" })
          }
          disabled={updateCategory.isPending}
        >
          <SelectTrigger className="h-7 text-xs w-[110px] border-dashed shrink-0">
            <SelectValue>
              <span className={cat?.color ?? "text-gray-500"}>{cat?.label ?? "أخرى"}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span className={c.color}>{c.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {open && hasItems && (
        <div className="bg-muted/10 border-t px-4 pb-2">
          <table className="w-full text-xs mt-1">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-right py-1 font-medium">البيان</th>
                <th className="text-center py-1 font-medium w-12">كمية</th>
                <th className="text-left py-1 font-medium w-20">سعر الوحدة</th>
                <th className="text-left py-1 font-medium w-20">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items!.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 text-right">{item.description}</td>
                  <td className="py-1 text-center text-muted-foreground">{item.qty}</td>
                  <td className="py-1 text-left text-muted-foreground">{item.unitPrice.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="py-1 text-left font-medium">{item.total.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InvoiceCategoryRow({
  invoice,
  accountDate,
}: {
  invoice: { id: number; supplierName: string; invoiceNumber: string | null; totalAmount: number; expenseCategory: string };
  accountDate: string;
}) {
  const utils = trpc.useUtils();
  const updateCategory = trpc.dailyAccounts.updateInvoiceCategory.useMutation({
    onSuccess: () => {
      utils.dailyAccounts.expensesForDate.invalidate({ accountDate });
      toast.success("تم تحديث تصنيف الفاتورة");
    },
    onError: (e) => toast.error(e.message),
  });
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === invoice.expenseCategory);
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="px-2 py-2 text-xs font-medium max-w-[90px] truncate" title={invoice.supplierName}>
        {invoice.supplierName}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">
        {invoice.invoiceNumber ?? "—"}
      </td>
      <td className="px-2 py-2 text-xs font-semibold text-orange-600 whitespace-nowrap">
        {invoice.totalAmount.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
      </td>
      <td className="px-2 py-2">
        <Select
          value={invoice.expenseCategory}
          onValueChange={(val) =>
            updateCategory.mutate({ invoiceId: invoice.id, category: val as "operational" | "maintenance" | "fixed" | "other" })
          }
          disabled={updateCategory.isPending}
        >
          <SelectTrigger className="h-7 text-xs w-[110px] border-dashed">
            <SelectValue>
              <span className={cat?.color ?? "text-gray-500"}>{cat?.label ?? "أخرى"}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span className={c.color}>{c.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface DailyAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** إذا كان null → إضافة جديد، وإلا → تعديل */
  editingDate: string | null;
  initialForm?: DailyFormState;
  onSaved?: () => void;
}

export default function DailyAccountDialog({
  open,
  onOpenChange,
  editingDate,
  initialForm,
  onSaved,
}: DailyAccountDialogProps) {
  const today = getToday();
  const [form, setForm] = useState<DailyFormState>(initialForm ?? emptyDailyForm(today));
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sync form when initialForm changes (e.g. when editing)
  const [lastInitial, setLastInitial] = useState(initialForm);
  if (initialForm !== lastInitial) {
    setLastInitial(initialForm);
    setForm(initialForm ?? emptyDailyForm(today));
  }

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: invoiceExpenses } = trpc.dailyAccounts.expensesForDate.useQuery(
    { accountDate: form.accountDate },
    { enabled: open, refetchOnWindowFocus: false }
  );

  const { data: prevCarry } = trpc.dailyAccounts.previousCarryForward.useQuery(
    { accountDate: form.accountDate },
    { enabled: open && !!form.accountDate, refetchOnWindowFocus: false, staleTime: 0, gcTime: 0 }
  );

  // جلب بيانات اليوم عند تغيير التاريخ (فقط عند الإضافة لا التعديل)
  const { data: existingDay } = trpc.dailyAccounts.getByDate.useQuery(
    { accountDate: form.accountDate },
    { enabled: open && !editingDate, refetchOnWindowFocus: false }
  );

  // عند وجود بيانات لليوم المختار: تعبئة الحقول تلقائياً
  const [lastLoadedDate, setLastLoadedDate] = useState<string | null>(null);
  if (existingDay && !editingDate && existingDay.accountDate !== lastLoadedDate) {
    setLastLoadedDate(existingDay.accountDate);
    const toStr = (v: string | number | null | undefined) => {
      const n = parseFloat(String(v ?? 0));
      return isNaN(n) || n === 0 ? "" : String(n);
    };
    setForm((prev) => ({
      ...prev,
      salesCash: toStr(existingDay.salesCash),
      salesCard: toStr(existingDay.salesCard),
      salesKita: toStr(existingDay.salesKita),
      salesOrders: toStr(existingDay.salesOrders),
      salesNoon: toStr(existingDay.salesNoon),
      salesDeliveroo: toStr(existingDay.salesDeliveroo),
      salesCareem: toStr(existingDay.salesCareem),
      expensesFixed: toStr(existingDay.expensesFixed),
      supplyToRestaurant: toStr(existingDay.supplyToRestaurant),
      supplyToManagement: toStr(existingDay.supplyToManagement),
      supplyExtra: toStr(existingDay.supplyExtra),
      notes: existingDay.notes ?? "",
    }));
  }
  // عند تغيير التاريخ ليوم غير موجود: إعادة تعيين lastLoadedDate
  if (!existingDay && !editingDate && lastLoadedDate !== null && lastLoadedDate !== form.accountDate) {
    setLastLoadedDate(null);
  }

  // ─── Mutation ─────────────────────────────────────────────────────────────
  const saveMutation = trpc.dailyAccounts.save.useMutation({
    onSuccess: () => {
      toast.success("تم الحفظ بنجاح");
      setConfirmOpen(false);
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e) => {
      toast.error(e.message);
      setConfirmOpen(false);
    },
  });

  // ─── Computed ─────────────────────────────────────────────────────────────
  const totalSales =
    toNum(form.salesCash) + toNum(form.salesCard) + toNum(form.salesKita) +
    toNum(form.salesOrders) + toNum(form.salesNoon) + toNum(form.salesDeliveroo) + toNum(form.salesCareem);

  const isManualExpenses = invoiceExpenses?.isManual ?? false;
  // إذا كانت البيانات يدوية (من الإكسل): نستخدم operational + maintenance مباشرة
  // إذا كانت تلقائية: نجمع فواتير الموردين + الفواتير الحرة
  const expensesSupplierInvoices = isManualExpenses ? 0 : (invoiceExpenses?.supplierInvoicesTotal ?? 0);
  const expensesFreeInvoicesTotal = isManualExpenses ? 0 : (invoiceExpenses?.invoices?.reduce((s, i) => s + i.totalAmount, 0) ?? 0);
  const expensesOperational = isManualExpenses ? (invoiceExpenses?.operational ?? 0) : 0;
  const expensesMaintenance = isManualExpenses ? (invoiceExpenses?.maintenance ?? 0) : 0;
  // المبلغ المدفوع جزئياً (فواتير موردين + حرة بحالة partial)
  const expensesPartialTotal = isManualExpenses ? 0 : (((invoiceExpenses as any)?.partialSupplierTotal ?? 0) + ((invoiceExpenses as any)?.partialFreeTotal ?? 0));
  const totalExpenses = isManualExpenses
    ? expensesOperational + expensesMaintenance + toNum(form.expensesFixed)
    : expensesSupplierInvoices + expensesFreeInvoicesTotal + expensesPartialTotal + toNum(form.expensesFixed);

  const carryForwardFromPrev = prevCarry ?? 0;
  const carryForwardToNext =
    carryForwardFromPrev + toNum(form.salesCash) + toNum(form.supplyToRestaurant) +
    toNum(form.supplyExtra) - totalExpenses - toNum(form.supplyToManagement);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  function handleReviewClick() {
    setConfirmOpen(true);
  }

  function handleConfirmSave() {
    saveMutation.mutate({
      accountDate: form.accountDate,
      salesCash: toNum(form.salesCash),
      salesCard: toNum(form.salesCard),
      salesKita: toNum(form.salesKita),
      salesOrders: toNum(form.salesOrders),
      salesNoon: toNum(form.salesNoon),
      salesDeliveroo: toNum(form.salesDeliveroo),
      salesCareem: toNum(form.salesCareem),
      expensesFixed: toNum(form.expensesFixed),
      supplyToRestaurant: toNum(form.supplyToRestaurant),
      supplyToManagement: toNum(form.supplyToManagement),
      supplyExtra: toNum(form.supplyExtra),
      notes: form.notes || undefined,
      // بيانات إضافية لرسالة واتساب
      expensesSupplierInvoices,
      expensesFreeInvoices: expensesFreeInvoicesTotal,
      expensesPartial: expensesPartialTotal,
      carryForwardFromPrev,
      carryForwardToNext,
      // بيانات الفواتير التفصيلية لـ PDF
      supplierInvoices: !isManualExpenses && invoiceExpenses?.supplierInvoices
        ? invoiceExpenses.supplierInvoices.map((inv: any) => ({
            supplierName: inv.supplierName,
            invoiceNumber: inv.invoiceNumber ?? null,
            totalAmount: inv.totalAmount,
            items: inv.items?.map((item: any) => ({
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          }))
        : undefined,
      freeInvoices: !isManualExpenses && invoiceExpenses?.invoices
        ? invoiceExpenses.invoices.map((inv: any) => ({
            supplierName: inv.supplierName,
            invoiceNumber: inv.invoiceNumber ?? null,
            totalAmount: inv.totalAmount,
            expenseCategory: inv.expenseCategory ?? '',
            items: inv.items?.map((item: any) => ({
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          }))
        : undefined,
      partialInvoices: !isManualExpenses && (invoiceExpenses as any)?.partialInvoices
        ? (invoiceExpenses as any).partialInvoices.map((inv: any) => ({
            supplierName: inv.supplierName,
            invoiceNumber: inv.invoiceNumber ?? null,
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
          }))
        : undefined,
    });
  }

  const salesFields = [
    { key: "salesCash", label: "نقدي" },
    { key: "salesCard", label: "بطاقة" },
    { key: "salesKita", label: "كيتا" },
    { key: "salesOrders", label: "طلبات" },
    { key: "salesNoon", label: "نون" },
    { key: "salesDeliveroo", label: "ديلفروا" },
    { key: "salesCareem", label: "كريم" },
  ] as const;

  return (
    <>
      {/* ─── Main Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {editingDate ? "تعديل بيانات يوم" : "إضافة بيانات يوم جديد"}
            </DialogTitle>
            <DialogDescription>أدخل بيانات المبيعات والمصروفات والتوريدات</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Date */}
            <div>
              <Label>التاريخ</Label>
              <Input
                type="date"
                value={form.accountDate}
                onChange={(e) => setForm((f) => ({ ...f, accountDate: e.target.value }))}
                className="mt-1"
                disabled={!!editingDate}
              />
            </div>

            {/* Carry forward info */}
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
              <ArrowRightLeft className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-blue-700 dark:text-blue-300">
                المرحّل من اليوم السابق: <strong>{fmt(carryForwardFromPrev)} د.إ</strong>
              </span>
            </div>

            {/* Sales Section */}
            <div>
              <h3 className="font-semibold text-violet-700 dark:text-violet-400 mb-3 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                المبيعات اليومية
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {salesFields.map(({ key, label }) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="mt-1 h-9"
                    />
                  </div>
                ))}
                <div className="col-span-2 bg-violet-50 dark:bg-violet-950/30 rounded-lg px-3 py-2 flex justify-between items-center">
                  <span className="text-sm font-medium text-violet-700 dark:text-violet-400">إجمالي المبيعات</span>
                  <span className="font-bold text-violet-700 dark:text-violet-400">{fmt(totalSales)} د.إ</span>
                </div>
              </div>
            </div>

            {/* Expenses Section */}
            <div>
              <h3 className="font-semibold text-red-700 dark:text-red-400 mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                المصروفات
              </h3>
              <div className="space-y-3">
                {/* Manual expenses (from Excel) */}
                {isManualExpenses && invoiceExpenses ? (
                  <div className="border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden text-sm">
                    <div className="bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 border-b border-amber-200 dark:border-amber-800">
                      <Info className="w-3.5 h-3.5" />
                      <span>بيانات مدخلة يدوياً من السجلات السابقة</span>
                    </div>
                    <div className="px-3 py-2 space-y-1.5">
                      {expensesOperational > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">تشغيلية:</span>
                          <span className="font-semibold text-orange-600">{fmt(expensesOperational)} د.إ</span>
                        </div>
                      )}
                      {expensesMaintenance > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">صيانة ومعدات:</span>
                          <span className="font-semibold text-blue-600">{fmt(expensesMaintenance)} د.إ</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Free Invoices Table - Accordion with items */}
                    {invoiceExpenses && invoiceExpenses.invoices.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden text-sm">
                        <div className="bg-muted/60 px-3 py-1.5 flex items-center gap-1.5 text-xs text-muted-foreground border-b">
                          <Info className="w-3.5 h-3.5" />
                          <span>الفواتير الحرة — اضغط لعرض البنود | حدد نوع كل فاتورة</span>
                        </div>
                        <div className="divide-y">
                          {invoiceExpenses.invoices.map((inv) => (
                            <FreeInvoiceAccordionRow key={inv.id} invoice={inv} accountDate={form.accountDate} />
                          ))}
                        </div>
                        <div className="border-t bg-muted/20 px-3 py-1.5 flex justify-between text-xs">
                          <span className="text-muted-foreground">مجموع الفواتير الحرة</span>
                          <span className="font-semibold text-orange-600">{fmt(invoiceExpenses.invoices.reduce((s, i) => s + i.totalAmount, 0))} د.إ</span>
                        </div>
                      </div>
                    ) : invoiceExpenses ? (
                      <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        لا توجد فواتير حرة مدفوعة في هذا اليوم التشغيلي
                      </div>
                    ) : null}

                    {/* Supplier Invoices Table - Accordion with items */}
                    {invoiceExpenses && invoiceExpenses.supplierInvoices && invoiceExpenses.supplierInvoices.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden text-sm">
                        <div className="bg-muted/60 px-3 py-1.5 flex items-center gap-1.5 text-xs text-muted-foreground border-b">
                          <Info className="w-3.5 h-3.5" />
                          <span>فواتير الموردين — اضغط لعرض البنود</span>
                        </div>
                        <div className="divide-y">
                          {invoiceExpenses.supplierInvoices.map((inv) => (
                            <InvoiceAccordionRow key={inv.id} inv={inv} amountColor="text-red-600" />
                          ))}
                        </div>
                        <div className="border-t bg-muted/20 px-3 py-1.5 flex justify-between text-xs">
                          <span className="text-muted-foreground">إجمالي فواتير الموردين</span>
                          <span className="font-semibold text-red-600">{fmt(invoiceExpenses.supplierInvoicesTotal ?? 0)} د.إ</span>
                        </div>
                      </div>
                    ) : invoiceExpenses ? (
                      <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />
                        لا توجد فواتير موردين مدفوعة لهذا اليوم
                      </div>
                    ) : null}

                    {/* Partial Invoices Section */}
                    {invoiceExpenses && (((invoiceExpenses as any).partialSupplierInvoices?.length ?? 0) > 0 || ((invoiceExpenses as any).partialFreeInvoices?.length ?? 0) > 0) ? (
                      <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden text-sm">
                        <div className="bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 border-b border-blue-200 dark:border-blue-800">
                          <Info className="w-3.5 h-3.5" />
                          <span>فواتير دفع جزئي — المبلغ المدفوع فقط</span>
                        </div>
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                              <th className="text-right px-2 py-1.5 font-medium">المورد</th>
                              <th className="text-right px-2 py-1.5 font-medium">رقم الفاتورة</th>
                              <th className="text-right px-2 py-1.5 font-medium">الإجمالي</th>
                              <th className="text-right px-2 py-1.5 font-medium text-blue-600">المدفوع</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...((invoiceExpenses as any).partialFreeInvoices ?? []), ...((invoiceExpenses as any).partialSupplierInvoices ?? [])].map((inv: any, idx: number) => (
                              <tr key={`partial-${idx}-${inv.id}`} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-2 py-2 text-xs font-medium max-w-[100px] truncate" title={inv.supplierName}>
                                  {inv.supplierName}
                                </td>
                                <td className="px-2 py-2 text-xs text-muted-foreground">{inv.invoiceNumber ?? "—"}</td>
                                <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                  {inv.totalAmount.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
                                </td>
                                <td className="px-2 py-2 text-xs font-semibold text-blue-600 whitespace-nowrap">
                                  {(inv.paidAmount ?? 0).toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.إ
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-muted/20 text-xs">
                              <td colSpan={3} className="px-2 py-1.5 text-muted-foreground">إجمالي المدفوع جزئياً</td>
                              <td className="px-2 py-1.5 font-semibold text-blue-600">
                                {fmt(((invoiceExpenses as any).partialSupplierTotal ?? 0) + ((invoiceExpenses as any).partialFreeTotal ?? 0))} د.إ
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : null}
                  </>
                )}

                {/* Fixed expenses */}
                <div>
                  <Label className="text-xs text-muted-foreground">ثابتة (يدوي)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="0"
                    value={form.expensesFixed}
                    onChange={(e) => setForm((f) => ({ ...f, expensesFixed: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">إجمالي المصروفات</span>
                    <span className="font-bold text-red-700 dark:text-red-400">{fmt(totalExpenses)} د.إ</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-red-600/70 dark:text-red-400/70">
                    {isManualExpenses ? (
                      <>
                        {expensesOperational > 0 && <span>تشغيلية: {fmt(expensesOperational)}</span>}
                        {expensesMaintenance > 0 && <span>صيانة: {fmt(expensesMaintenance)}</span>}
                      </>
                    ) : (
                      <>
                        <span>موردين: {fmt(expensesSupplierInvoices)}</span>
                        <span>حرة: {fmt(expensesFreeInvoicesTotal)}</span>
                        {expensesPartialTotal > 0 && <span className="text-blue-600">جزئي: {fmt(expensesPartialTotal)}</span>}
                      </>
                    )}
                    {toNum(form.expensesFixed) > 0 && <span>ثابتة: {fmt(toNum(form.expensesFixed))}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Supply Section */}
            <div>
              <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                التوريدات
              </h3>
              <div className="space-y-2">
                {[
                  { key: "supplyToRestaurant", label: "توريد للمطعم (يزود الكاش)" },
                  { key: "supplyToManagement", label: "توريد للإدارة (يقلل الكاش)" },
                  { key: "supplyExtra", label: "مبلغ إضافي (يزود الكاش)" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0"
                      value={form[key as keyof DailyFormState]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="mt-1 h-9"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Cash Balance Summary */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 rounded-xl p-4 space-y-2 border">
              <h3 className="font-bold text-center mb-3">الرصيد النقدي المتبقي للترحيل</h3>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المرحّل من اليوم السابق:</span>
                  <span className="font-medium text-blue-600">{fmt(carryForwardFromPrev)} د.إ</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ النقدي من المبيعات:</span>
                  <span className="font-medium text-green-600">+{fmt(toNum(form.salesCash))} د.إ</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ توريد للمطعم:</span>
                  <span className="font-medium text-green-600">+{fmt(toNum(form.supplyToRestaurant))} د.إ</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ مبلغ إضافي:</span>
                  <span className="font-medium text-green-600">+{fmt(toNum(form.supplyExtra))} د.إ</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">- إجمالي المصروفات:</span>
                  <span className="font-medium text-red-600">-{fmt(totalExpenses)} د.إ</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">- توريد للإدارة:</span>
                  <span className="font-medium text-red-600">-{fmt(toNum(form.supplyToManagement))} د.إ</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-base">
                  <span>= الرصيد المرحّل لليوم التالي:</span>
                  <span className={carryForwardToNext >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {fmt(carryForwardToNext)} د.إ
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs text-muted-foreground">ملاحظات</Label>
              <Textarea
                placeholder="ملاحظات إضافية..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1 resize-none"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={handleReviewClick} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="w-4 h-4 ml-1" />
              مراجعة وتأكيد الحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm Dialog ───────────────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl" className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              تأكيد حفظ بيانات اليوم
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-right">
                <p className="text-sm font-medium text-foreground">{formatDateArLong(form.accountDate)}</p>

                {/* Sales summary */}
                <div className="bg-violet-50 dark:bg-violet-950/30 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-semibold text-violet-700 dark:text-violet-400 mb-2">المبيعات اليومية</p>
                  {salesFields.filter(f => toNum(form[f.key]) > 0).map(({ key, label }) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}:</span>
                      <span className="font-medium">{fmt(toNum(form[key]))} د.إ</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-violet-700 dark:text-violet-400 border-t pt-1 mt-1">
                    <span>الإجمالي:</span>
                    <span>{fmt(totalSales)} د.إ</span>
                  </div>
                </div>

                {/* Expenses summary */}
                <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 space-y-1 text-sm">
                  <p className="font-semibold text-red-700 dark:text-red-400 mb-2">المصروفات</p>
                  {expensesSupplierInvoices > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">موردين:</span>
                      <span className="font-medium">{fmt(expensesSupplierInvoices)} د.إ</span>
                    </div>
                  )}
                  {expensesFreeInvoicesTotal > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">حرة:</span>
                      <span className="font-medium">{fmt(expensesFreeInvoicesTotal)} د.إ</span>
                    </div>
                  )}
                  {expensesPartialTotal > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">جزئي:</span>
                      <span className="font-medium text-blue-600">{fmt(expensesPartialTotal)} د.إ</span>
                    </div>
                  )}
                  {toNum(form.expensesFixed) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">ثابتة:</span>
                      <span className="font-medium">{fmt(toNum(form.expensesFixed))} د.إ</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-red-700 dark:text-red-400 border-t pt-1 mt-1">
                    <span>الإجمالي:</span>
                    <span>{fmt(totalExpenses)} د.إ</span>
                  </div>
                </div>

                {/* Supply summary */}
                {(toNum(form.supplyToRestaurant) > 0 || toNum(form.supplyToManagement) > 0 || toNum(form.supplyExtra) > 0) && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-1 text-sm">
                    <p className="font-semibold text-amber-700 dark:text-amber-400 mb-2">التوريدات</p>
                    {toNum(form.supplyToRestaurant) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">للمطعم:</span>
                        <span className="font-medium">{fmt(toNum(form.supplyToRestaurant))} د.إ</span>
                      </div>
                    )}
                    {toNum(form.supplyToManagement) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">للإدارة:</span>
                        <span className="font-medium">{fmt(toNum(form.supplyToManagement))} د.إ</span>
                      </div>
                    )}
                    {toNum(form.supplyExtra) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">إضافي:</span>
                        <span className="font-medium">{fmt(toNum(form.supplyExtra))} د.إ</span>
                      </div>
                    )}
                  </div>
                )}

                {form.notes && (
                  <div className="bg-muted/30 rounded-lg p-2 text-xs text-muted-foreground">
                    <span className="font-medium">ملاحظات: </span>{form.notes}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>تعديل البيانات</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSave}
              disabled={saveMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saveMutation.isPending ? "جاري الحفظ..." : "✓ تأكيد الحفظ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
