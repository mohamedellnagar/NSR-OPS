import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { PackageMinus, AlertTriangle, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/NumericInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REASONS = ["production", "waste", "transfer", "return", "adjustment", "other"] as const;

export default function StockOutPage() {
  const { t, isRTL, language } = useLanguage();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    materialId: "",
    quantity: "",
    destination: "",
    reason: "production" as typeof REASONS[number],
    referenceNumber: "",
    transactionDate: new Date().toISOString().slice(0, 16),
    notes: "",
  });

  const { data: materials } = trpc.materials.list.useQuery({ });

  const selectedMaterial = useMemo(
    () => materials?.find((m) => m.id.toString() === form.materialId),
    [materials, form.materialId]
  );

  const requestedQty = parseFloat(form.quantity || "0");
  const currentQty = Number(selectedMaterial?.currentQuantity || 0);
  const isInsufficient = requestedQty > currentQty && requestedQty > 0;
  const afterQty = currentQty - requestedQty;

  const stockOutMutation = trpc.inventory.stockOut.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.inventory.transactions.invalidate();
      toast.success(t("transactionAdded"));
      setForm({
        materialId: "",
        quantity: "",
        destination: "",
        reason: "production",
        referenceNumber: "",
        transactionDate: new Date().toISOString().slice(0, 16),
        notes: "",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.materialId || !form.quantity || isInsufficient) return;

    stockOutMutation.mutate({
      materialId: Number(form.materialId),
      quantity: parseFloat(form.quantity),
      destination: form.destination || undefined,
      reason: form.reason,
      referenceNumber: form.referenceNumber || undefined,
      transactionDate: new Date(form.transactionDate),
      notes: form.notes || undefined,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className={isRTL ? "text-right" : ""}>
        <h1 className="text-2xl font-bold text-foreground">{t("stockOutTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("stockOutDesc")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-5" dir={isRTL ? "rtl" : "ltr"}>
                {/* Material */}
                <div>
                  <Label className="form-label">{t("materials")} *</Label>
                  <Select value={form.materialId} onValueChange={(v) => setForm((f) => ({ ...f, materialId: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectMaterial")} />
                    </SelectTrigger>
                    <SelectContent>
                      {materials?.filter((m) => Number(m.currentQuantity) > 0).map((m) => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          <span className="flex items-center gap-2">
                            <span>{isRTL && m.nameAr ? m.nameAr : m.name}</span>
                            <span className="text-muted-foreground text-xs">({Number(m.currentQuantity).toLocaleString()} {m.unit})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity */}
                <div>
                  <Label className="form-label">{t("quantity")} {selectedMaterial ? `(${selectedMaterial.unit})` : ""} *</Label>
                  <NumericInput
                    
                    step="0.001"
                    min="0.001"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                    placeholder="0.000"
                    required
                    className={isInsufficient ? "border-destructive" : ""}
                  />
                  {isInsufficient && (
                    <p className={`text-xs text-destructive mt-1 flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                      <AlertTriangle size={12} />
                      {t("insufficientStock")} ({t("currentQuantity")}: {currentQty.toLocaleString()} {selectedMaterial?.unit})
                    </p>
                  )}
                </div>

                {/* Reason + Destination */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="form-label">{t("reason")} *</Label>
                    <Select value={form.reason} onValueChange={(v) => setForm((f) => ({ ...f, reason: v as any }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REASONS.map((r) => (
                          <SelectItem key={r} value={r}>{t(r as any)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="form-label">{t("destination")}</Label>
                    <Input
                      value={form.destination}
                      onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                      placeholder={language === "ar" ? "المطبخ، الإنتاج..." : "Kitchen, Production..."}
                    />
                  </div>
                </div>

                {/* Reference + Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="form-label">{language === "ar" ? "رقم المرجع" : "Reference No."}</Label>
                    <Input
                      value={form.referenceNumber}
                      onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                      placeholder="REF-001"
                    />
                  </div>
                  <div>
                    <Label className="form-label">{t("withdrawalDate")} *</Label>
                    <Input
                      type="datetime-local"
                      value={form.transactionDate}
                      onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label className="form-label">{t("notes")}</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                  />
                </div>

                <Button
                  type="submit"
                  variant="destructive"
                  className="w-full gap-2"
                  disabled={stockOutMutation.isPending || !form.materialId || !form.quantity || isInsufficient}
                >
                  <PackageMinus size={18} />
                  {stockOutMutation.isPending ? t("loading") : t("addStockOut")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          {selectedMaterial && (
            <Card className={`border-2 ${isInsufficient ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${isInsufficient ? "text-destructive" : "text-primary"}`}>
                  {language === "ar" ? "المادة المختارة" : "Selected Material"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className={`flex justify-between text-sm ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="text-muted-foreground">{t("materialName")}</span>
                  <span className="font-medium">{isRTL && selectedMaterial.nameAr ? selectedMaterial.nameAr : selectedMaterial.name}</span>
                </div>
                <div className={`flex justify-between text-sm ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="text-muted-foreground">{t("currentQuantity")}</span>
                  <span className="font-semibold number-display">{currentQty.toLocaleString()} {selectedMaterial.unit}</span>
                </div>
                {requestedQty > 0 && (
                  <div className={`flex justify-between text-sm pt-2 border-t ${isInsufficient ? "border-destructive/20" : "border-primary/20"} ${isRTL ? "flex-row-reverse" : ""}`}>
                    <span className="text-muted-foreground">{language === "ar" ? "بعد الصرف" : "After withdrawal"}</span>
                    <span className={`font-bold number-display ${isInsufficient ? "text-destructive" : afterQty <= Number(selectedMaterial.minimumQuantity) ? "text-amber-600" : "text-emerald-600"}`}>
                      {Math.max(0, afterQty).toLocaleString()} {selectedMaterial.unit}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reason Info */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4">
              <div className={`flex items-center gap-2 mb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <ArrowDownRight size={18} className="text-amber-600" />
                <span className="text-sm font-medium text-amber-700">{t("reason")}</span>
              </div>
              <p className="text-lg font-semibold text-amber-700">{t(form.reason as any)}</p>
              {form.destination && (
                <p className="text-xs text-amber-600 mt-1">→ {form.destination}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
