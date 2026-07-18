import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Upload, FileDown, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";

type SalesImportResult = {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  totalSalesImported: number;
  dateRange: { from: string; to: string } | null;
  durationMs: number;
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

const fmt = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("ar-AE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

const COLUMNS = [
  { name: "التاريخ", hint: "يوم/شهر/سنة — مثال 01/05/2026", required: true },
  { name: "نقدي", hint: "", required: false },
  { name: "بطاقة", hint: "", required: false },
  { name: "كيتا", hint: "", required: false },
  { name: "طلبات", hint: "", required: false },
  { name: "كريم", hint: "", required: false },
  { name: "ديلفروا", hint: "", required: false },
  { name: "نون", hint: "", required: false },
  { name: "أكل الموظفين", hint: "اختياري — مؤشر تحليلي", required: false },
];

/**
 * Bulk import of daily sales into daily_accounts.
 *
 * Upserts by date: a day that already exists is UPDATED, never added again —
 * daily_accounts has no unique key on the date and the monthly page sums
 * same-day rows, so inserting would silently double that day's sales.
 */
export default function SalesImportDialog({
  open, onOpenChange, currency = "د.إ", onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currency?: string;
  onImported?: () => void;
}) {
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = "sales-import-input";

  const importSales = trpc.monthlyAccounts.importSales.useMutation({
    onSuccess: (r) => {
      setResult(r);
      const total = r.inserted + r.updated;
      if (total > 0) {
        toast.success(`تم استيراد ${total} يوم (${r.inserted} جديد، ${r.updated} محدّث)`);
        onImported?.();
      } else {
        toast.warning("لم يتم استيراد أي يوم — راجع التفاصيل");
      }
    },
    onError: (e) => toast.error(e.message || "تعذّر استيراد الملف"),
  });

  const template = trpc.monthlyAccounts.salesTemplate.useQuery(undefined, { enabled: false });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error("الملف يجب أن يكون Excel أو CSV");
      return;
    }
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = String(e.target?.result ?? "").split(",")[1];
      if (base64) importSales.mutate({ base64 });
      else toast.error("الملف فارغ");
    };
    reader.onerror = () => toast.error("تعذّر قراءة الملف");
    reader.readAsDataURL(file);
  };

  const close = (o: boolean) => {
    if (!o) setResult(null);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-600" />
            رفع المبيعات اليومية من إكسل
          </DialogTitle>
          <DialogDescription>
            كل صف = يوم واحد. اليوم المسجّل بالفعل سيتم تحديث مبيعاته، لا إضافتها مرة أخرى.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto space-y-4">
          {/* ── Format ── */}
          <div>
            <h4 className="text-sm font-bold mb-2">أعمدة الملف</h4>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-2 text-start font-semibold">العمود</th>
                    <th className="px-2 py-2 text-start font-semibold">ملاحظة</th>
                    <th className="px-2 py-2 text-center font-semibold">إلزامي</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNS.map((c) => (
                    <tr key={c.name} className="border-t">
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{c.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.hint || "—"}</td>
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
            <ul className="text-[11px] text-muted-foreground mt-1.5 space-y-0.5">
              <li>• أي قناة فارغة تُحسب صفرًا — مش لازم تملأ كل الأعمدة.</li>
              <li>• يقبل الأرقام العربية (٠١/٠٥/٢٠٢٦) وفواصل الآلاف (1,305.00).</li>
              <li>• المصروفات والتوريدات المسجّلة يدويًا لهذا اليوم لن تتأثر.</li>
            </ul>
          </div>

          {/* ── Drop zone ── */}
          <div>
            <input
              id={inputId} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
              onClick={() => !importSales.isPending && document.getElementById(inputId)?.click()}
              className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                dragging ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-border hover:border-violet-400"
              } ${importSales.isPending ? "opacity-60 pointer-events-none" : ""}`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-2 text-muted-foreground ${importSales.isPending ? "animate-pulse" : ""}`} />
              <p className="text-sm font-medium">
                {importSales.isPending ? "جارٍ الرفع والمعالجة…" : "اسحب الملف هنا أو اضغط للاختيار"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx / .xls / .csv</p>
            </div>

            <div className="flex justify-center mt-3">
              <Button
                variant="outline" size="sm" className="gap-1.5"
                disabled={template.isFetching}
                onClick={async () => {
                  const res = await template.refetch();
                  if (res.data) {
                    downloadBase64(
                      res.data.base64, res.data.filename,
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    );
                  } else toast.error("تعذّر تنزيل القالب");
                }}
              >
                <FileDown className="w-4 h-4" />
                تنزيل قالب جاهز
              </Button>
            </div>
          </div>

          {/* ── Result ── */}
          {result && (
            <div className="space-y-3 pt-2 border-t">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">أيام جديدة</div>
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{result.inserted}</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">أيام محدّثة</div>
                  <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{result.updated}</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">تم تخطّيها</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{result.skipped}</div>
                </div>
              </div>

              {result.dateRange && (
                <p className="text-xs text-muted-foreground text-center">
                  من {result.dateRange.from} إلى {result.dateRange.to} — إجمالي مبيعات{" "}
                  <span className="font-semibold text-foreground">{fmt(result.totalSalesImported)} {currency}</span>
                </p>
              )}

              {result.errors.length > 0 ? (
                <div>
                  <h4 className="text-sm font-bold mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    صفوف لم تُرفع ({result.errors.length})
                  </h4>
                  <ul className="text-xs space-y-1 max-h-40 overflow-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="rounded bg-rose-50 dark:bg-rose-950/40 px-2 py-1.5 text-rose-800 dark:text-rose-300">
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (result.inserted + result.updated) > 0 && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  تم رفع جميع الأيام بدون أخطاء
                </p>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground shrink-0 pt-2 border-t">
          الرفع يحدّث المبيعات فقط. الحقول المحسوبة (المرحّل، نسبة الفود كوست، قيمة المخزون)
          لا تتأثر — افتح اليوم من صفحة الحسابات اليومية واحفظه لو احتجت إعادة حسابها.
        </p>
      </DialogContent>
    </Dialog>
  );
}
