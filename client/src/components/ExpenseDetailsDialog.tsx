import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Receipt, Info } from "lucide-react";
import {
  EXPENSE_TYPE_LABELS, EXPENSE_TYPE_UNSET_LABEL,
  EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_UNSET_LABEL,
  EXPENSE_SOURCE_LABELS, PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type ExpenseCategoryCode, type ExpenseType,
} from "@shared/expenseClassification";

const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

/** Quantities are not money — trailing zeros just add noise. */
const fmtQty = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", { maximumFractionDigits: 3 });

export type ExpenseRowRef = {
  sourceType: string;
  id: number;
  date: string;
} | null;

/** Read-only breakdown of one expense row: its header plus its line items. */
export default function ExpenseDetailsDialog({
  row, onOpenChange, currency = "د.إ",
}: {
  row: ExpenseRowRef;
  onOpenChange: (open: boolean) => void;
  currency?: string;
}) {
  const enabled = row !== null;
  const { data, isLoading, isError, error } = trpc.monthlyAccounts.expenseRowDetails.useQuery(
    {
      sourceType: (row?.sourceType ?? "FREE_INVOICE") as
        "SUPPLIER_INVOICE" | "FREE_INVOICE" | "MONTHLY_PAYMENT" | "DAILY_EXPENSE",
      ...(row?.sourceType === "DAILY_EXPENSE" ? { date: row?.date } : { id: row?.id }),
    },
    { enabled, refetchOnWindowFocus: false }
  );

  const itemsTotal = (data?.items ?? []).reduce((s, i) => s + i.total, 0);
  // A gap here means the header total does not equal the sum of its items,
  // which is worth surfacing rather than hiding.
  const mismatch = data && data.items.length > 0
    ? Math.abs(itemsTotal - data.total) > 0.01
    : false;

  return (
    <Dialog open={enabled} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            تفاصيل المصروف
          </DialogTitle>
          <DialogDescription>
            {data
              ? `${EXPENSE_SOURCE_LABELS[data.sourceType]} — ${data.vendorName || data.invoiceNumber || "بدون اسم"}`
              : "جارٍ التحميل…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="py-10 text-center text-sm text-muted-foreground">جارٍ تحميل التفاصيل…</p>
        )}

        {isError && (
          <p className="py-10 text-center text-sm text-destructive">
            تعذّر تحميل التفاصيل: {error?.message}
          </p>
        )}

        {data && (
          <div className="overflow-auto space-y-4">
            {/* ── Header ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm rounded-lg border p-3">
              <Field label="رقم الفاتورة" value={data.invoiceNumber || "—"} mono />
              <Field label="التاريخ" value={data.date} />
              <Field label="المورد / الجهة" value={data.vendorName || "—"} />
              <Field
                label="نوع المصروف"
                value={data.expenseType
                  ? EXPENSE_TYPE_LABELS[data.expenseType as ExpenseType]
                  : EXPENSE_TYPE_UNSET_LABEL}
              />
              <Field
                label="التصنيف"
                value={data.expenseCategoryCode
                  ? EXPENSE_CATEGORY_LABELS[data.expenseCategoryCode as ExpenseCategoryCode]
                  : EXPENSE_CATEGORY_UNSET_LABEL}
              />
              <Field
                label="طريقة الدفع"
                value={data.paymentMethod
                  ? PAYMENT_METHOD_LABELS[data.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? "—"
                  : "—"}
              />
              <Field label="الإجمالي" value={`${fmt(data.total)} ${currency}`} strong />
              <Field label="المدفوع" value={`${fmt(data.paid)} ${currency}`} />
              <Field label="المتبقي" value={`${fmt(data.remaining)} ${currency}`} />
              <Field
                label="حالة الدفع"
                value={PAYMENT_STATUS_LABELS[data.paymentStatus ?? ""] ?? "—"}
              />
            </div>

            {data.notes && (
              <div className="rounded-lg border p-3 text-sm">
                <span className="text-xs text-muted-foreground block mb-1">البيان / ملاحظات</span>
                {data.notes}
              </div>
            )}

            {/* ── Items ── */}
            <div>
              <h4 className="text-sm font-bold mb-2">
                بنود الفاتورة {data.items.length > 0 && `(${data.items.length})`}
              </h4>

              {data.itemsUnavailableReason ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  {data.itemsUnavailableReason}
                </div>
              ) : data.items.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-center text-muted-foreground">
                  لا توجد بنود مسجّلة لهذه الفاتورة
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-start font-semibold">الصنف</th>
                          <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">الكمية</th>
                          <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">الوحدة</th>
                          <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">سعر الوحدة</th>
                          <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((it, i) => (
                          <tr key={i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                            <td className="px-3 py-1.5">{it.description}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums whitespace-nowrap">{fmtQty(it.qty)}</td>
                            <td className="px-3 py-1.5 text-center text-muted-foreground whitespace-nowrap">
                              {it.unit || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-center tabular-nums whitespace-nowrap">{fmt(it.unitPrice)}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums font-semibold whitespace-nowrap">
                              {fmt(it.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted font-bold">
                        <tr>
                          <td className="px-3 py-2" colSpan={4}>مجموع البنود</td>
                          <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">
                            {fmt(itemsTotal)} {currency}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {mismatch && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                      ملاحظة: مجموع البنود ({fmt(itemsTotal)}) لا يساوي إجمالي الفاتورة
                      ({fmt(data.total)}) — قد يكون بسبب ضريبة أو خصم مسجّل على الفاتورة.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, value, strong, mono,
}: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground block">{label}</span>
      <span className={`${strong ? "font-bold" : ""} ${mono ? "text-xs font-mono" : ""}`}>{value}</span>
    </div>
  );
}
