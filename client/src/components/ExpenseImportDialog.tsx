import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Upload, FileDown, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import {
  EXPENSE_CATEGORY_CODES, EXPENSE_CATEGORY_LABELS,
  EXPENSE_TYPE_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
} from "@shared/expenseClassification";

type ImportResult = {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: string[];
  likelyDuplicates: number;
  durationMs: number;
  createdInvoiceNumbers: string[];
};

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const COLUMNS = [
  { name: "التاريخ", nameEn: "Date", hint: "يوم/شهر/سنة — مثال 15/2/2026", required: true },
  { name: "نوع المصروف", nameEn: "Expense Type", hint: "تشغيلي أو غير تشغيلي", required: true },
  { name: "الفئة", nameEn: "Category", hint: "من القائمة المعتمدة", required: true },
  { name: "البيان", nameEn: "Description", hint: "وصف المصروف — يُستخدم كاسم الجهة", required: true },
  { name: "طريقة الدفع", nameEn: "Payment Method", hint: "اختياري", required: false },
  { name: "المبلغ", nameEn: "Amount", hint: "الإجمالي النهائي بدون ضريبة", required: true },
];

/**
 * Bulk import of paid expenses from an Excel sheet.
 *
 * Every row becomes a PAID free invoice dated by the sheet's date column. Free
 * invoices specifically — supplier invoices post stock movements and rewrite
 * material average costs, which must not happen for plain expenses.
 */
export default function ExpenseImportDialog({
  open, onOpenChange, ar = true, onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ar?: boolean;
  /** Called after a successful import so the caller can refresh its lists. */
  onImported?: () => void;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = "expense-import-input";

  const importExpenses = trpc.monthlyAccounts.importExpenses.useMutation({
    onSuccess: (r) => {
      setResult(r);
      if (r.imported > 0) {
        toast.success(ar ? `تم استيراد ${r.imported} مصروف` : `Imported ${r.imported} expenses`);
        onImported?.();
      } else {
        toast.warning(ar ? "لم يتم استيراد أي صف — راجع التفاصيل" : "Nothing imported");
      }
    },
    onError: (e) => toast.error(e.message || (ar ? "تعذّر استيراد الملف" : "Import failed")),
  });

  const template = trpc.monthlyAccounts.importTemplate.useQuery(undefined, { enabled: false });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error(ar ? "الملف يجب أن يكون Excel أو CSV" : "File must be Excel or CSV");
      return;
    }
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = String(e.target?.result ?? "").split(",")[1];
      if (base64) importExpenses.mutate({ base64 });
      else toast.error(ar ? "الملف فارغ" : "Empty file");
    };
    reader.onerror = () => toast.error(ar ? "تعذّر قراءة الملف" : "Could not read file");
    reader.readAsDataURL(file);
  };

  const close = (o: boolean) => {
    if (!o) setResult(null);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col" dir={ar ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-violet-600" />
            {ar ? "رفع فواتير من ملف إكسل" : "Import invoices from Excel"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "كل صف يُسجَّل كفاتورة حرة مدفوعة بالكامل بتاريخ الفاتورة المذكور في الملف."
              : "Each row becomes a fully-paid free invoice dated by the sheet."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto space-y-4">
          {/* ── Expected format ── */}
          <div>
            <h4 className="text-sm font-bold mb-2">{ar ? "أعمدة الملف المطلوبة" : "Required columns"}</h4>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-2 text-start font-semibold">{ar ? "العمود" : "Column"}</th>
                    <th className="px-2 py-2 text-start font-semibold">{ar ? "الشرح" : "Notes"}</th>
                    <th className="px-2 py-2 text-center font-semibold">{ar ? "إلزامي" : "Required"}</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNS.map((c) => (
                    <tr key={c.name} className="border-t">
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{ar ? c.name : c.nameEn}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.hint}</td>
                      <td className="px-2 py-1.5 text-center">
                        {c.required
                          ? <span className="text-rose-600">●</span>
                          : <span className="text-muted-foreground opacity-40">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {ar
                ? "يقبل الأرقام العربية (١٥/٢/٢٠٢٦) وفواصل الآلاف (1,305.00). صف العناوين إلزامي في أول الملف."
                : "Arabic-Indic digits and thousands separators are accepted. A header row is required."}
            </p>
          </div>

          {/* ── Allowed values ── */}
          <details className="rounded-lg border p-3">
            <summary className="text-sm font-bold cursor-pointer select-none">
              {ar ? "القيم المسموحة" : "Allowed values"}
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
              <div>
                <p className="font-semibold mb-1">{ar ? "نوع المصروف" : "Expense type"}</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {Object.values(EXPENSE_TYPE_LABELS).map((l) => <li key={l}>• {l}</li>)}
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1">{ar ? "الفئة" : "Category"}</p>
                <ul className="space-y-0.5 text-muted-foreground max-h-40 overflow-auto">
                  {EXPENSE_CATEGORY_CODES.map((c) => (
                    <li key={c}>• {EXPENSE_CATEGORY_LABELS[c]}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1">{ar ? "طريقة الدفع" : "Payment method"}</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {PAYMENT_METHODS.map((m) => <li key={m}>• {PAYMENT_METHOD_LABELS[m]}</li>)}
                </ul>
              </div>
            </div>
          </details>

          {/* ── Drop zone ── */}
          <div>
            <input
              id={inputId} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                handleFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => !importExpenses.isPending && document.getElementById(inputId)?.click()}
              className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                dragging ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-border hover:border-violet-400"
              } ${importExpenses.isPending ? "opacity-60 pointer-events-none" : ""}`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-2 text-muted-foreground ${importExpenses.isPending ? "animate-pulse" : ""}`} />
              <p className="text-sm font-medium">
                {importExpenses.isPending
                  ? (ar ? "جارٍ رفع الملف ومعالجته…" : "Uploading…")
                  : (ar ? "اسحب الملف هنا أو اضغط للاختيار" : "Drop the file here or click to choose")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx / .xls / .csv</p>
            </div>

            <div className="flex justify-center mt-3">
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={async () => {
                  const res = await template.refetch();
                  if (res.data) {
                    downloadBase64(
                      res.data.base64, res.data.filename,
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    );
                  } else {
                    toast.error(ar ? "تعذّر تنزيل القالب" : "Could not download template");
                  }
                }}
                disabled={template.isFetching}
              >
                <FileDown className="w-4 h-4" />
                {ar ? "تنزيل قالب جاهز" : "Download template"}
              </Button>
            </div>
          </div>

          {/* ── Result ── */}
          {result && (
            <div className="space-y-3 pt-2 border-t">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">{ar ? "تم استيرادها" : "Imported"}</div>
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{result.imported}</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">{ar ? "تم تخطّيها" : "Skipped"}</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{result.skipped}</div>
                </div>
              </div>

              {result.likelyDuplicates > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-2.5 text-sm text-amber-800 dark:text-amber-300">
                  {ar
                    ? `تنبيه: ${result.likelyDuplicates} صف يبدو مكررًا داخل الملف (نفس التاريخ والبيان والمبلغ) — تم رفعه كما هو.`
                    : `${result.likelyDuplicates} row(s) look duplicated within the file — imported as-is.`}
                </div>
              )}

              {result.errors.length > 0 ? (
                <div>
                  <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    {ar ? `الصفوف التي لم تُرفع (${result.errors.length})` : `Rows not imported (${result.errors.length})`}
                  </h4>
                  <ul className="text-xs space-y-1 max-h-44 overflow-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="rounded bg-rose-50 dark:bg-rose-950/40 px-2 py-1.5 text-rose-800 dark:text-rose-300">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : result.imported > 0 && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {ar ? "تم رفع جميع الصفوف بدون أخطاء" : "All rows imported"}
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground shrink-0 pt-2 border-t">
          {ar
            ? "تُسجَّل كفواتير حرة (بدون تأثير على المخزون) وتظهر في شهرها الصحيح حسب التاريخ. رفع نفس الملف مرتين يضاعف المصروفات."
            : "Recorded as free invoices (no stock impact). Re-uploading the same file will duplicate expenses."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
