import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChefHat, Plus, Trash2, Calculator, CheckCircle2,
  AlertTriangle, XCircle, PackagePlus, ShoppingCart,
  Printer, TrendingUp,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

function fmt(n: number, d = 3) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const STATUS_CONFIG = {
  ok:      { label: "متوفر",     labelEn: "Available", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  low:     { label: "ناقص جزئياً", labelEn: "Partial",  icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  missing: { label: "غير متوفر", labelEn: "Missing",   icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

export default function ProductionPlanningPage() {
  const { isRTL } = useLanguage();
  const [items, setItems] = useState<Array<{ productId: number | null; desiredQty: number }>>([{ productId: null, desiredQty: 1 }]);
  const [result, setResult] = useState<any>(null);

  const { data: products = [] } = trpc.products.list.useQuery();
  const calculateMutation = trpc.productionPlanning.calculate.useMutation({
    onSuccess: (data) => { setResult(data); },
    onError: (e) => toast.error(e.message),
  });
  const createPOMutation = trpc.purchaseOrders.autoGenerate.useMutation({
    onSuccess: (data) => {
      toast.success(`تم إنشاء ${data.ordersCreated} طلب شراء تلقائياً لـ ${data.itemsCount} صنف`);
    },
    onError: (e) => toast.error(e.message),
  });

  const addRow = () => setItems(prev => [...prev, { productId: null, desiredQty: 1 }]);
  const removeRow = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const setProduct = (idx: number, productId: number) =>
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, productId } : r));
  const setQty = (idx: number, qty: number) =>
    setItems(prev => prev.map((r, i) => i === idx ? { ...r, desiredQty: Math.max(1, qty) } : r));

  const handleCalculate = () => {
    const valid = items.filter(i => i.productId !== null && i.desiredQty > 0);
    if (!valid.length) return toast.error("اختر منتجاً واحداً على الأقل");
    calculateMutation.mutate(valid.map(i => ({ productId: i.productId!, desiredQty: i.desiredQty })));
  };

  const printPlan = () => window.print();

  const missingCount = result?.materials?.filter((m: any) => m.status !== "ok").length ?? 0;

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">تخطيط الإنتاج</h1>
            <p className="text-sm text-muted-foreground">احسب المواد المطلوبة قبل بدء الإنتاج</p>
          </div>
        </div>
        {result && (
          <Button variant="outline" size="sm" onClick={printPlan}>
            <Printer className="w-4 h-4 ml-2" /> طباعة
          </Button>
        )}
      </div>

      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            المنتجات المراد إنتاجها
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <Select value={item.productId?.toString() ?? ""} onValueChange={(v) => setProduct(idx, Number(v))}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="اختر المنتج..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nameAr || p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 w-40">
                <label className="text-sm text-muted-foreground whitespace-nowrap">الكمية:</label>
                <Input
                  type="number" min={1} value={item.desiredQty}
                  onChange={(e) => setQty(idx, parseInt(e.target.value) || 1)}
                  className="w-20 text-center"
                />
              </div>
              {items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeRow(idx)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="w-4 h-4 ml-1" /> إضافة منتج
            </Button>
            <Button onClick={handleCalculate} disabled={calculateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
              <Calculator className="w-4 h-4 ml-2" />
              {calculateMutation.isPending ? "جاري الحساب..." : "احسب المتطلبات"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Feasibility Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {result.items.map((item: any) => (
              <Card key={item.productId} className={`border-2 ${item.canFullyProduce ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-sm font-medium truncate">{item.productNameAr || item.productName}</p>
                  <p className="text-2xl font-bold mt-1">{item.desiredQty} <span className="text-sm font-normal">وجبة</span></p>
                  {item.canFullyProduce ? (
                    <Badge className="mt-2 bg-emerald-100 text-emerald-800 border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 ml-1" /> ممكن الإنتاج
                    </Badge>
                  ) : (
                    <div className="mt-1">
                      <Badge className="bg-red-100 text-red-800 border-red-200">
                        <XCircle className="w-3 h-3 ml-1" /> يمكن {item.maxProducible} فقط
                      </Badge>
                      {item.bottleneckMaterial && (
                        <p className="text-xs text-red-600 mt-1 truncate">بسبب: {item.bottleneckMaterial}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Materials Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <PackagePlus className="w-4 h-4 text-indigo-500" />
                  المواد الخام المطلوبة
                  {missingCount > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-red-200">{missingCount} ناقص</Badge>
                  )}
                </CardTitle>
                {missingCount > 0 && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => createPOMutation.mutate()}
                    disabled={createPOMutation.isPending}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    <ShoppingCart className="w-4 h-4 ml-2" />
                    {createPOMutation.isPending ? "جاري الإنشاء..." : "إنشاء طلبات شراء تلقائية"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium">المادة</th>
                      <th className="px-4 py-3 text-center font-medium">المطلوب</th>
                      <th className="px-4 py-3 text-center font-medium">المتوفر</th>
                      <th className="px-4 py-3 text-center font-medium">النقص</th>
                      <th className="px-4 py-3 text-center font-medium">تكلفة النقص</th>
                      <th className="px-4 py-3 text-center font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.materials.map((m: any) => {
                      const cfg = STATUS_CONFIG[m.status as keyof typeof STATUS_CONFIG];
                      const Icon = cfg.icon;
                      return (
                        <tr key={m.materialId} className={`border-b transition-colors hover:bg-muted/30 ${m.status !== "ok" ? "bg-red-50/50" : ""}`}>
                          <td className="px-4 py-3 font-medium">{m.materialNameAr || m.materialName}</td>
                          <td className="px-4 py-3 text-center">{fmt(m.requiredQty)} {m.unit}</td>
                          <td className="px-4 py-3 text-center">{fmt(m.availableQty)} {m.unit}</td>
                          <td className="px-4 py-3 text-center font-bold">
                            {m.shortfallQty > 0 ? <span className="text-red-600">{fmt(m.shortfallQty)} {m.unit}</span> : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {m.shortfallCost > 0 ? <span className="text-red-600">{fmt(m.shortfallCost, 2)} AED</span> : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`${cfg.bg} ${cfg.color} border`}>
                              <Icon className="w-3 h-3 ml-1" />
                              {cfg.label}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 font-bold border-t-2">
                      <td className="px-4 py-3">الإجمالي</td>
                      <td className="px-4 py-3 text-center" colSpan={3}>
                        {result.allFeasible
                          ? <span className="text-emerald-600">✅ الإنتاج ممكن بالكامل</span>
                          : <span className="text-red-600">⚠️ مخزون غير كافٍ لبعض المواد</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-red-600">
                        {result.totalShortfallCost > 0 ? `${fmt(result.totalShortfallCost, 2)} AED` : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
