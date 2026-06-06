import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Calendar, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function SalesPage() {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";

  const [showUpload, setShowUpload] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState({
    fileName: "",
    reportDateFrom: new Date().toISOString().slice(0, 10),
    reportDateTo: new Date().toISOString().slice(0, 10),
    notes: "",
    csvText: "",
  });

  const utils = trpc.useUtils();
  const { data: reports, isLoading } = trpc.sales.list.useQuery();
  const detail = trpc.sales.getById.useQuery(
    { id: viewId! },
    { enabled: viewId !== null }
  );

  const uploadMutation = trpc.sales.upload.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      toast.success(language === "ar" ? "تم رفع التقرير" : "Report uploaded");
      setShowUpload(false);
      setForm({ fileName: "", reportDateFrom: new Date().toISOString().slice(0, 10), reportDateTo: new Date().toISOString().slice(0, 10), notes: "", csvText: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.sales.delete.useMutation({
    onSuccess: () => { utils.sales.list.invalidate(); toast.success(t("success") || "Deleted"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setForm((f) => ({ ...f, csvText: text, fileName: file.name }));
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.csvText || !form.fileName) {
      toast.error(language === "ar" ? "اختر ملف CSV" : "Select a CSV file");
      return;
    }
    uploadMutation.mutate({
      csvText: form.csvText,
      reportDateFrom: form.reportDateFrom,
      reportDateTo: form.reportDateTo,
      fileName: form.fileName,
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold text-foreground">
            {language === "ar" ? "تقارير المبيعات" : "Sales Reports"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {reports?.length ?? 0} {language === "ar" ? "تقرير" : "reports"}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowUpload(true)} className="gap-2">
            <Upload size={16} />
            {language === "ar" ? "رفع تقرير CSV" : "Upload CSV"}
          </Button>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className={isRTL ? "text-right" : "text-left"}>
                <th className="px-4 py-3 font-medium">{language === "ar" ? "الملف" : "File"}</th>
                <th className="px-4 py-3 font-medium">{language === "ar" ? "من تاريخ" : "From"}</th>
                <th className="px-4 py-3 font-medium">{language === "ar" ? "إلى تاريخ" : "To"}</th>
                <th className="px-4 py-3 font-medium">{language === "ar" ? "الإجمالي" : "Total"}</th>
                <th className="px-4 py-3 font-medium">{language === "ar" ? "البنود" : "Items"}</th>
                <th className="px-4 py-3 font-medium">{language === "ar" ? "تاريخ الرفع" : "Uploaded"}</th>
                <th className="px-4 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
              ) : !reports?.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    <FileText size={40} className="mx-auto mb-3 opacity-30" />
                    {t("noData") || (language === "ar" ? "لا توجد بيانات" : "No data")}
                  </td>
                </tr>
              ) : (
                reports.map((r: any) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{r.fileName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(r.reportDateFrom).slice(0, 10)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{String(r.reportDateTo).slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      {r.totalAmount != null ? Number(r.totalAmount).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.itemCount ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString(language === "ar" ? "ar-EG" : "en") : ""}
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <Button variant="ghost" size="sm" onClick={() => setViewId(r.id)} className="h-8 w-8 p-0">
                          <Eye size={14} />
                        </Button>
                        {canWrite && (
                          <Button variant="ghost" size="sm" onClick={() => setDeleteId(r.id)} className="h-8 w-8 p-0 hover:text-destructive">
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "رفع تقرير مبيعات" : "Upload Sales Report"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <Label>{language === "ar" ? "ملف CSV" : "CSV File"} *</Label>
              <Input type="file" accept=".csv,.txt" onChange={handleFile} />
              {form.fileName && (
                <p className="text-xs text-muted-foreground mt-1">{form.fileName}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1"><Calendar size={14} /> {language === "ar" ? "من تاريخ" : "From"} *</Label>
                <Input type="date" value={form.reportDateFrom} onChange={(e) => setForm((f) => ({ ...f, reportDateFrom: e.target.value }))} required />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Calendar size={14} /> {language === "ar" ? "إلى تاريخ" : "To"} *</Label>
                <Input type="date" value={form.reportDateTo} onChange={(e) => setForm((f) => ({ ...f, reportDateTo: e.target.value }))} required />
              </div>
            </div>
            <div>
              <Label>{language === "ar" ? "ملاحظات" : "Notes"}</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
              <Button type="button" variant="outline" onClick={() => setShowUpload(false)}>{t("cancel") || "Cancel"}</Button>
              <Button type="submit" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? (t("loading") || "...") : (language === "ar" ? "رفع" : "Upload")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={viewId !== null} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "تفاصيل التقرير" : "Report Details"}</DialogTitle>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="py-8 text-center text-muted-foreground">{t("loading") || "..."}</div>
          ) : detail.data ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">{language === "ar" ? "الملف" : "File"}:</span> {(detail.data as any).fileName}</div>
                <div><span className="text-muted-foreground">{language === "ar" ? "الإجمالي" : "Total"}:</span> {(detail.data as any).totalAmount}</div>
              </div>
              {(detail.data as any).items && Array.isArray((detail.data as any).items) && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className={isRTL ? "text-right" : "text-left"}>
                        <th className="px-3 py-2">{language === "ar" ? "الصنف" : "Item"}</th>
                        <th className="px-3 py-2">{language === "ar" ? "الكمية" : "Qty"}</th>
                        <th className="px-3 py-2">{language === "ar" ? "السعر" : "Price"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.data as any).items.slice(0, 200).map((it: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-2">{it.itemName || it.name}</td>
                          <td className="px-3 py-2">{it.quantity ?? it.qty}</td>
                          <td className="px-3 py-2">{it.totalPrice ?? it.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete") || (language === "ar" ? "تأكيد الحذف" : "Confirm delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWarning") || (language === "ar" ? "لا يمكن التراجع" : "This cannot be undone")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{t("cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete") || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
