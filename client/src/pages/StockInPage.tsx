import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { PackagePlus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/NumericInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function StockInPage() {
  const { t, isRTL, language } = useLanguage();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    materialId: "",
    quantity: "",
    unitPrice: "",
    supplierId: "",
    supplierName: "",
    referenceNumber: "",
    transactionDate: new Date().toISOString().slice(0, 16),
    expiryDate: "",
    notes: "",
  });

  const expiryWarning = useMemo(() => {
    if (!form.expiryDate) return null;
    const diff = Math.ceil((new Date(form.expiryDate).getTime() - Date.now()) / 86400000);
    if (diff < 0) return "expired";
    if (diff <= 3) return "critical";
    if (diff <= 7) return "warning";
    return null;
  }, [form.expiryDate]);

  const { data: materials } = trpc.materials.list.useQuery({ });
  const { data: suppliers } = trpc.suppliers.list.useQuery();

  const selectedMaterial = useMemo(
    () => materials?.find((m) => m.id.toString() === form.materialId),
    [materials, form.materialId]
  );

  const totalCost = useMemo(() => {
    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.unitPrice);
    if (!isNaN(qty) && !isNaN(price)) return qty * price;
    return 0;
  }, [form.quantity, form.unitPrice]);

  const stockInMutation = trpc.inventory.stockIn.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate();
      utils.dashboard.stats.invalidate();
      utils.inventory.transactions.invalidate();
      toast.success(t("transactionAdded"));
      setForm({
        materialId: "",
        quantity: "",
        unitPrice: "",
        supplierId: "",
        supplierName: "",
        referenceNumber: "",
        transactionDate: new Date().toISOString().slice(0, 16),
        expiryDate: "",
        notes: "",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.materialId || !form.quantity) return;

    stockInMutation.mutate({
      materialId: Number(form.materialId),
      quantity: parseFloat(form.quantity),
      unitPrice: form.unitPrice ? parseFloat(form.unitPrice) : undefined,
      supplierId: form.supplierId ? Number(form.supplierId) : undefined,
      supplierName: form.supplierName || undefined,
      referenceNumber: form.referenceNumber || undefined,
      transactionDate: new Date(form.transactionDate),
      expiryDate: form.expiryDate || undefined,
      notes: form.notes || undefined,
    });
  };

  const formatCurrency = (val: number) =>
    `${new Intl.NumberFormat(language === "ar" ? "ar-AE" : "en-AE", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(val)} ${language === "ar" ? "د.إ" : "AED"}`;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className={isRTL ? "text-right" : ""}>
        <h1 className="text-2xl font-bold text-foreground">{t("stockInTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("stockInDesc")}</p>
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
                      {materials?.map((m) => (
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

                {/* Quantity + Unit Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="form-label">{t("quantity")} {selectedMaterial ? `(${selectedMaterial.unit})` : ""} *</Label>
                    <NumericInput
                      
                      step="0.001"
                      min="0.001"
                      value={form.quantity}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                      placeholder="0.000"
                      required
                    />
                  </div>
                  <div>
                    <Label className="form-label">{t("unitPrice")} ({t("currency")})</Label>
                    <NumericInput
                      
                      step="0.01"
                      min="0"
                      value={form.unitPrice}
                      onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Supplier */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="form-label">{t("supplier")}</Label>
                    <Select
                      value={form.supplierId || "none"}
                      onValueChange={(v) => {
                        const sup = suppliers?.find((s) => s.id.toString() === v);
                        setForm((f) => ({
                          ...f,
                          supplierId: v === "none" ? "" : v,
                          supplierName: sup ? (language === "ar" && sup.nameAr ? sup.nameAr : sup.name) : f.supplierName,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectSupplier")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {suppliers?.map((s) => (
                          <SelectItem key={s.id} value={s.id.toString()}>
                            {language === "ar" && s.nameAr ? s.nameAr : s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="form-label">{t("supplierName")}</Label>
                    <Input
                      value={form.supplierName}
                      onChange={(e) => setForm((f) => ({ ...f, supplierName: e.target.value }))}
                      placeholder={language === "ar" ? "أو أدخل اسم المورد" : "Or enter supplier name"}
                    />
                  </div>
                </div>

                {/* Invoice + Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="form-label">{t("invoiceNumber")}</Label>
                    <Input
                      value={form.referenceNumber}
                      onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                      placeholder="INV-001"
                    />
                  </div>
                  <div>
                    <Label className="form-label">{t("entryDate")} *</Label>
                    <Input
                      type="datetime-local"
                      value={form.transactionDate}
                      onChange={(e) => setForm((f) => ({ ...f, transactionDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Expiry Date */}
                <div>
                  <Label className="form-label">تاريخ انتهاء الصلاحية (اختياري)</Label>
                  <Input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  />
                  {expiryWarning === "expired" && (
                    <p className="text-xs text-red-600 mt-1">⛔ التاريخ المختار منتهٍ بالفعل!</p>
                  )}
                  {expiryWarning === "critical" && (
                    <p className="text-xs text-red-600 mt-1">🚨 تحذير: ينتهي خلال 3 أيام أو أقل!</p>
                  )}
                  {expiryWarning === "warning" && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ تنبيه: ينتهي خلال أسبوع</p>
                  )}
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
                  className="w-full gap-2"
                  disabled={stockInMutation.isPending || !form.materialId || !form.quantity}
                >
                  <PackagePlus size={18} />
                  {stockInMutation.isPending ? t("loading") : t("addStockIn")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Summary Panel */}
        <div className="space-y-4">
          {/* Selected Material Info */}
          {selectedMaterial && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-primary">{language === "ar" ? "المادة المختارة" : "Selected Material"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className={`flex justify-between text-sm ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="text-muted-foreground">{t("materialName")}</span>
                  <span className="font-medium">{isRTL && selectedMaterial.nameAr ? selectedMaterial.nameAr : selectedMaterial.name}</span>
                </div>
                <div className={`flex justify-between text-sm ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="text-muted-foreground">{t("currentQuantity")}</span>
                  <span className="font-semibold number-display">{Number(selectedMaterial.currentQuantity).toLocaleString()} {selectedMaterial.unit}</span>
                </div>
                <div className={`flex justify-between text-sm ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="text-muted-foreground">{t("minimumQuantity")}</span>
                  <span className="number-display">{Number(selectedMaterial.minimumQuantity).toLocaleString()} {selectedMaterial.unit}</span>
                </div>
                {form.quantity && (
                  <div className={`flex justify-between text-sm pt-2 border-t border-primary/20 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <span className="text-muted-foreground">{language === "ar" ? "بعد الإضافة" : "After addition"}</span>
                    <span className="font-bold text-emerald-600 number-display">
                      {(Number(selectedMaterial.currentQuantity) + parseFloat(form.quantity || "0")).toLocaleString()} {selectedMaterial.unit}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Cost Summary */}
          {totalCost > 0 && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="pt-4">
                <div className={`flex items-center gap-2 mb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <ArrowUpRight size={18} className="text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">{t("totalCost")}</span>
                </div>
                <p className="text-2xl font-bold text-emerald-700 number-display">{formatCurrency(totalCost)}</p>
                <p className="text-xs text-emerald-600 mt-1">
                  {parseFloat(form.quantity || "0").toLocaleString()} × {formatCurrency(parseFloat(form.unitPrice || "0"))}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
