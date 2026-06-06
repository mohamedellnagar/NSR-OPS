import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Edit2, Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

export default function CategoriesPage() {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", nameAr: "", description: "", color: "#6366f1" });

  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.categories.list.useQuery();

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.categories.list.invalidate(); toast.success(t("categoryAdded")); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.categories.list.invalidate(); toast.success(t("success")); closeModal(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.categories.delete.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.categories.list.invalidate(); toast.success(t("success")); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  const closeModal = () => { setShowModal(false); setEditItem(null); setForm({ name: "", nameAr: "", description: "", color: "#6366f1" }); };

  const openAdd = () => { setEditItem(null); setForm({ name: "", nameAr: "", description: "", color: "#6366f1" }); setShowModal(true); };
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, nameAr: item.nameAr || "", description: item.description || "", color: item.color || "#6366f1" });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold text-foreground">{t("categoriesTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{categories?.length ?? 0} {language === "ar" ? "تصنيف" : "categories"}</p>
        </div>
        {canWrite && (
          <Button onClick={openAdd} className="gap-2">
            <Plus size={16} />
            {t("addCategory")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-32 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))
        ) : categories?.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Tag size={40} className="mb-3 opacity-30" />
            <p>{t("noData")}</p>
          </div>
        ) : (
          categories?.map((cat: any) => (
            <div key={cat.id} className="bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all group">
              <div className={`flex items-start justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: (cat.color || "#6366f1") + "20", color: cat.color || "#6366f1" }}>
                    <Tag size={18} />
                  </div>
                  <div className={isRTL ? "text-right" : ""}>
                    <h3 className="font-semibold text-foreground">{language === "ar" && cat.nameAr ? cat.nameAr : cat.name}</h3>
                    {language === "ar" && cat.nameAr && cat.name !== cat.nameAr && (
                      <p className="text-xs text-muted-foreground">{cat.name}</p>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isRTL ? "flex-row-reverse" : ""}`}>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(cat)} className="h-7 w-7 p-0">
                      <Edit2 size={13} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(cat.id)} className="h-7 w-7 p-0 hover:text-destructive">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )}
              </div>
              {cat.description && (
                <p className={`mt-3 text-xs text-muted-foreground line-clamp-2 ${isRTL ? "text-right" : ""}`}>{cat.description}</p>
              )}
              <div className={`mt-3 flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className="w-3 h-3 rounded-full" style={{ background: cat.color ?? "#6366f1" }} />
                <span className={`text-xs px-2 py-0.5 rounded-full ${cat.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {cat.isActive ? t("active") : t("inactive")}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent className="max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{editItem ? t("editCategory") : t("addCategory")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="form-label">{t("categoryName")} ({language === "ar" ? "English" : "الإنجليزية"}) *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <Label className="form-label">{t("categoryName")} ({language === "ar" ? "العربية" : "Arabic"})</Label>
              <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label className="form-label">{t("description")}</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label className="form-label">{t("categoryColor")}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="w-7 h-7 rounded-lg transition-transform hover:scale-110"
                    style={{ background: c, outline: form.color === c ? `3px solid ${c}` : "none", outlineOffset: "2px" }}
                  />
                ))}
              </div>
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
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
