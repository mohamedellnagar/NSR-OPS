import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Edit2, Plus, Trash2, Truck, Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pagination, usePagination } from "@/components/Pagination";

export default function SuppliersPage() {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";

  const [showModal, setShowModal] = useState(false);
  const [suppliersPage, setSuppliersPage] = useState(1);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", nameAr: "", contactPerson: "", phone: "", email: "", address: "", notes: "", whatsappPhone: "" });

  const utils = trpc.useUtils();
  const { data: suppliers, isLoading } = trpc.suppliers.list.useQuery();
  const suppliersPagination = usePagination((suppliers ?? []) as any[], 15);
  const pagedSuppliers = suppliersPagination.paginate(suppliersPage);

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => { utils.suppliers.list.invalidate(); toast.success(t("supplierAdded")); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => { utils.suppliers.list.invalidate(); toast.success(t("success")); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => { utils.suppliers.list.invalidate(); toast.success(t("success")); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const closeModal = () => { setShowModal(false); setEditItem(null); setForm({ name: "", nameAr: "", contactPerson: "", phone: "", email: "", address: "", notes: "", whatsappPhone: "" }); };
  const openAdd = () => { setEditItem(null); setForm({ name: "", nameAr: "", contactPerson: "", phone: "", email: "", address: "", notes: "", whatsappPhone: "" }); setShowModal(true); };
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, nameAr: item.nameAr || "", contactPerson: item.contactPerson || "", phone: item.phone || "", email: item.email || "", address: item.address || "", notes: item.notes || "", whatsappPhone: item.whatsappPhone || "" });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editItem) { updateMutation.mutate({ id: editItem.id, ...form }); }
    else { createMutation.mutate(form); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold text-foreground">{t("suppliersTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{suppliers?.length ?? 0} {language === "ar" ? "مورد" : "suppliers"}</p>
        </div>
        {canWrite && <Button onClick={openAdd} className="gap-2"><Plus size={16} />{t("addSupplier")}</Button>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => <div key={i} className="bg-card rounded-xl border border-border p-5 h-40 animate-pulse" />)
        ) : suppliers?.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Truck size={40} className="mb-3 opacity-30" />
            <p>{t("noData")}</p>
          </div>
        ) : (
          pagedSuppliers.map((s: any) => (
            <div key={s.id} className="bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all group">
              <div className={`flex items-start justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Truck size={18} />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <h3 className="font-semibold text-foreground">{language === "ar" && s.nameAr ? s.nameAr : s.name}</h3>
                    {s.contactPerson && <p className="text-xs text-muted-foreground">{s.contactPerson}</p>}
                  </div>
                </div>
                {canWrite && (
                  <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isRTL ? "flex-row-reverse" : ""}`}>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} className="h-7 w-7 p-0"><Edit2 size={13} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(s.id)} className="h-7 w-7 p-0 hover:text-destructive"><Trash2 size={13} /></Button>
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                {s.phone && <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}><Phone size={12} /><span>{s.phone}</span></div>}
                {s.whatsappPhone && <div className={`flex items-center gap-2 text-xs text-green-600 ${isRTL ? "flex-row-reverse" : ""}`}><MessageCircle size={12} /><span>{s.whatsappPhone}</span></div>}
                {s.email && <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}><Mail size={12} /><span>{s.email}</span></div>}
                {s.address && <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isRTL ? "flex-row-reverse" : ""}`}><MapPin size={12} /><span className="truncate">{s.address}</span></div>}
              </div>
              <div className={`mt-3 flex items-center ${isRTL ? "flex-row-reverse" : ""}`}>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {s.isActive ? t("active") : t("inactive")}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <Pagination currentPage={suppliersPage} totalPages={suppliersPagination.totalPages} onPageChange={setSuppliersPage} totalItems={suppliersPagination.totalItems} pageSize={15} />

      <Dialog open={showModal} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader><DialogTitle>{editItem ? t("editSupplier") : t("addSupplier")}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="form-label">{t("name")} (EN) *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <Label className="form-label">{t("name")} (AR)</Label>
                <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} dir="rtl" />
              </div>
            </div>
            <div>
              <Label className="form-label">{t("contactPerson")}</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="form-label">{t("phone")}</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} type="tel" />
              </div>
              <div>
                <Label className="form-label">{t("email")}</Label>
                <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" />
              </div>
            </div>
            <div>
              <Label className="form-label flex items-center gap-1">
                <MessageCircle size={13} className="text-green-600" /> واتساب (للطلبيات)
              </Label>
              <Input
                value={form.whatsappPhone}
                onChange={(e) => setForm((f) => ({ ...f, whatsappPhone: e.target.value }))}
                type="tel"
                placeholder="+971XXXXXXXXX"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">سيُستخدم لإرسال طلبات الشراء مباشرةً عبر واتساب</p>
            </div>
            <div>
              <Label className="form-label">{t("address")}</Label>
              <Textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label className="form-label">{t("notes")}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
              <Button type="button" variant="outline" onClick={closeModal}>{t("cancel")}</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? t("loading") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWarning")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
