import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Trash2, AlertTriangle, PackageMinus, Loader2 } from "lucide-react";

type Scope = "ALL" | "FREE_ONLY" | "IMPORTED_ONLY";

const SCOPE_LABELS: Record<Scope, { label: string; hint: string; danger: boolean }> = {
  IMPORTED_ONLY: {
    label: "المستوردة من إكسل فقط",
    hint: "تراجع عن رفعة غلط — لا يمس أي فاتورة أدخلتها يدويًا ولا المخزون.",
    danger: false,
  },
  FREE_ONLY: {
    label: "كل الفواتير الحرة",
    hint: "المستوردة والمُدخلة يدويًا. الفواتير الحرة لا تؤثر على المخزون.",
    danger: false,
  },
  ALL: {
    label: "كل الفواتير (شاملة الموردين)",
    hint: "يشمل فواتير الموردين — سيتم عكس الكميات ومتوسط التكلفة تلقائيًا.",
    danger: true,
  },
};

const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

/**
 * Deletes a whole month's invoices. Destructive and irreversible, so the flow
 * is: pick scope → see exactly what will go (including the stock impact) →
 * type the month to confirm.
 */
export default function DeleteMonthDialog({
  open, onOpenChange, year, month, currency = "د.إ", onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  year: number;
  month: number;
  currency?: string;
  onDeleted?: () => void;
}) {
  const [scope, setScope] = useState<Scope>("IMPORTED_ONLY");
  const [confirmText, setConfirmText] = useState("");
  const [clearDaily, setClearDaily] = useState(false);
  const expected = `${year}-${String(month).padStart(2, "0")}`;

  const preview = trpc.monthlyAccounts.previewMonthDeletion.useQuery(
    { year, month },
    { enabled: open, refetchOnWindowFocus: false }
  );

  const utils = trpc.useUtils();
  const del = trpc.monthlyAccounts.deleteMonth.useMutation({
    onSuccess: (r) => {
      toast.success(
        `تم حذف ${r.deletedSupplierInvoices + r.deletedFreeInvoices} فاتورة` +
          (r.materialsAdjusted > 0 ? ` وعكس ${r.materialsAdjusted} حركة مخزون` : "")
      );
      if (r.stockWentNegative.length > 0) {
        toast.warning(`${r.stockWentNegative.length} مادة كانت ستصبح كميتها سالبة — تم ضبطها على صفر`);
      }
      if (r.errors.length > 0) toast.error(`${r.errors.length} فاتورة تعذّر حذفها`);
      utils.invoices.allUnified.invalidate();
      utils.freeInvoices.list.invalidate();
      utils.monthlyAccounts.getMonth.invalidate();
      onDeleted?.();
      setConfirmText("");
      setClearDaily(false);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message || "تعذّر الحذف"),
  });

  useEffect(() => {
    if (!open) { setConfirmText(""); setScope("IMPORTED_ONLY"); setClearDaily(false); }
  }, [open]);

  const p = preview.data;
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("ar-AE", {
    month: "long", year: "numeric",
  });

  // How many rows this scope will actually remove.
  const willDeleteCount =
    !p ? 0
    : scope === "ALL" ? p.supplierInvoices + p.freeInvoices
    : scope === "FREE_ONLY" ? p.freeInvoices
    : 0; // imported-only is a subset the preview does not break out

  const negatives = (p?.affectedMaterials ?? []).filter((m) => m.goesNegative);
  const confirmed = confirmText.trim() === expected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <Trash2 className="w-5 h-5" />
            حذف فواتير شهر {monthLabel}
          </DialogTitle>
          <DialogDescription>
            عملية نهائية لا يمكن التراجع عنها. راجع التفاصيل جيدًا قبل التأكيد.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto space-y-4">
          {/* ── Scope ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">نطاق الحذف</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
                  <SelectItem key={s} value={s}>{SCOPE_LABELS[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className={`text-[11px] ${SCOPE_LABELS[scope].danger ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
              {SCOPE_LABELS[scope].hint}
            </p>
          </div>

          {/* ── What will go ── */}
          {preview.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">جارٍ حساب ما سيتم حذفه…</p>
          ) : p ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-lg border p-3 text-center ${scope === "ALL" ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30" : "opacity-50"}`}>
                  <div className="text-xs text-muted-foreground">فواتير موردين</div>
                  <div className="text-xl font-bold">{scope === "ALL" ? p.supplierInvoices : 0}</div>
                  <div className="text-[11px] text-muted-foreground">{fmt(p.supplierTotal)} {currency}</div>
                </div>
                <div className="rounded-lg border p-3 text-center border-rose-300 bg-rose-50 dark:bg-rose-950/30">
                  <div className="text-xs text-muted-foreground">فواتير حرة</div>
                  <div className="text-xl font-bold">
                    {scope === "IMPORTED_ONLY" ? "المستوردة فقط" : p.freeInvoices}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {scope === "IMPORTED_ONLY" ? "—" : `${fmt(p.freeTotal)} ${currency}`}
                  </div>
                </div>
              </div>

              {/* Daily fixed expenses are a field on the day, not an invoice, so
                  no scope touches them — they are opted into on their own. */}
              {p.dailyExpenses.days > 0 && (
                <label className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-rose-600"
                    checked={clearDaily}
                    onChange={(e) => setClearDaily(e.target.checked)}
                  />
                  <span className="text-sm">
                    امسح كمان المصروفات اليومية
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      {p.dailyExpenses.days} يوم — {fmt(p.dailyExpenses.total)} {currency}.
                      مبيعات تلك الأيام لا تتأثر.
                    </span>
                  </span>
                </label>
              )}

              {p.monthlyPaymentsUntouched > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  ملاحظة: {p.monthlyPaymentsUntouched} دفعة شهرية في هذا الشهر — لن تُحذف (ليست فواتير).
                </p>
              )}

              {/* ── Stock impact ── */}
              {scope === "ALL" && p.affectedMaterials.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                    <PackageMinus className="w-4 h-4 text-amber-600" />
                    أثر المخزون ({p.affectedMaterials.length} مادة)
                  </h4>
                  <p className="text-[11px] text-muted-foreground mb-1.5">
                    سيتم خصم هذه الكميات وعكس متوسط التكلفة تلقائيًا.
                  </p>
                  <div className="overflow-auto max-h-44 rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          {["المادة", "الحالية", "سيُخصم", "المتبقية"].map((h) => (
                            <th key={h} className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.affectedMaterials.map((m) => (
                          <tr key={m.materialId} className={m.goesNegative ? "bg-rose-50 dark:bg-rose-950/40" : ""}>
                            <td className="px-2 py-1 max-w-[180px] truncate" title={m.materialName}>{m.materialName}</td>
                            <td className="px-2 py-1 text-center tabular-nums">{m.currentQuantity}</td>
                            <td className="px-2 py-1 text-center tabular-nums text-amber-700 dark:text-amber-400">−{m.quantityToReverse}</td>
                            <td className={`px-2 py-1 text-center tabular-nums font-semibold ${m.goesNegative ? "text-rose-700 dark:text-rose-400" : ""}`}>
                              {m.resultingQuantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {negatives.length > 0 && (
                    <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 p-2.5 text-xs text-rose-800 dark:text-rose-300">
                      <AlertTriangle className="w-4 h-4 inline ms-1" />
                      {negatives.length} مادة كميتها ستصبح سالبة (استُهلكت بعد الشراء) — سيتم ضبطها على صفر
                      وتسجيل ذلك. راجع الجرد بعد الحذف.
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}

          {/* ── Confirmation ── */}
          <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 p-3 space-y-2">
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              للتأكيد، اكتب <code className="bg-white dark:bg-black/40 px-1.5 py-0.5 rounded font-mono">{expected}</code>
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expected}
              className="h-9 font-mono"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            إلغاء
          </Button>
          <Button
            variant="destructive"
            disabled={
              !confirmed || del.isPending ||
              (scope !== "IMPORTED_ONLY" && willDeleteCount === 0 && !clearDaily)
            }
            onClick={() => del.mutate({
              year, month, scope, confirm: confirmText.trim(),
              clearDailyExpenses: clearDaily,
            })}
            className="gap-2"
          >
            {del.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {del.isPending ? "جارٍ الحذف…" : "حذف نهائيًا"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
