import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Lightbulb, TrendingUp, TrendingDown, AlertTriangle,
  ArrowRight, BarChart3,
} from "lucide-react";

function fmt(n: number, d = 2) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function pctColor(v: number) {
  if (v > 3) return "text-red-600";
  if (v > 1) return "text-amber-600";
  if (v < -1) return "text-emerald-600";
  return "text-blue-600";
}

const IMPACT_CONFIG = {
  high:   { label: "تأثير عالٍ",    bg: "bg-red-100",    color: "text-red-700",    border: "border-red-200" },
  medium: { label: "تأثير متوسط",  bg: "bg-amber-100",  color: "text-amber-700",  border: "border-amber-200" },
  low:    { label: "تأثير منخفض",  bg: "bg-green-100",  color: "text-green-700",  border: "border-green-200" },
};

export default function PriceSimulatorPage() {
  const { isRTL } = useLanguage();
  const [materialId, setMaterialId] = useState<string>("");
  const [simulatedPrice, setSimulatedPrice] = useState<string>("");
  const [searchMat, setSearchMat] = useState("");

  const { data: materials = [] } = trpc.materials.list.useQuery();
  const { data: volatileMaterials = [] } = trpc.priceSimulator.topVolatile.useQuery({});

  const selectedMaterial = useMemo(
    () => (materials as any[]).find((m: any) => String(m.id) === materialId),
    [materials, materialId]
  );

  const pctChange = useMemo(() => {
    if (!selectedMaterial || !simulatedPrice) return null;
    const current = parseFloat(selectedMaterial.lastPurchasePrice) || 0;
    const simulated = parseFloat(simulatedPrice);
    if (!current || !simulated) return null;
    return ((simulated - current) / current) * 100;
  }, [selectedMaterial, simulatedPrice]);

  const { data: result, isFetching } = trpc.priceSimulator.simulate.useQuery(
    { materialId: parseInt(materialId), simulatedPrice: parseFloat(simulatedPrice) },
    { enabled: !!materialId && !!simulatedPrice && parseFloat(simulatedPrice) >= 0 }
  );

  const { data: history = [] } = trpc.priceSimulator.priceHistory.useQuery(
    { materialId: parseInt(materialId) },
    { enabled: !!materialId }
  );

  const filteredMaterials = useMemo(() =>
    (materials as any[]).filter((m: any) =>
      !searchMat || [m.name, m.nameAr].some((n: any) => n?.toLowerCase().includes(searchMat.toLowerCase()))
    ),
    [materials, searchMat]
  );

  function handleSelectVolatile(matId: number, currentPrice: number) {
    setMaterialId(String(matId));
    setSimulatedPrice((currentPrice * 1.1).toFixed(2)); // default: +10%
  }

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">محاكاة تأثير الأسعار</h1>
          <p className="text-sm text-muted-foreground">ماذا يحدث لـ Food Cost لو تغيّر سعر مادة خام؟</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          {/* Material selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">اختر المادة الخام</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="ابحث..." value={searchMat} onChange={e => setSearchMat(e.target.value)} className="h-8 text-sm" />
              <Select value={materialId} onValueChange={v => {
                setMaterialId(v);
                const m = (materials as any[]).find((m: any) => String(m.id) === v);
                if (m?.lastPurchasePrice) setSimulatedPrice(m.lastPurchasePrice);
              }}>
                <SelectTrigger><SelectValue placeholder="اختر المادة..." /></SelectTrigger>
                <SelectContent>
                  {filteredMaterials.map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span>{m.nameAr || m.name}</span>
                      {m.lastPurchasePrice && (
                        <span className="text-muted-foreground text-xs mr-2">{parseFloat(m.lastPurchasePrice).toFixed(2)} AED/{m.unit}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedMaterial && (
                <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">السعر الحالي</span>
                    <span className="font-bold">{selectedMaterial.lastPurchasePrice ? `${parseFloat(selectedMaterial.lastPurchasePrice).toFixed(3)} AED` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">المخزون الحالي</span>
                    <span>{parseFloat(selectedMaterial.currentQuantity).toFixed(2)} {selectedMaterial.unit}</span>
                  </div>
                </div>
              )}

              {/* Simulated price input */}
              <div className="space-y-1">
                <label className="text-sm font-medium">السعر المحاكى (AED)</label>
                <Input
                  type="number" min={0} step={0.001}
                  value={simulatedPrice}
                  onChange={e => setSimulatedPrice(e.target.value)}
                  placeholder="0.000"
                />
              </div>

              {/* Quick change buttons */}
              <div className="flex gap-1.5 flex-wrap">
                {[-20, -10, -5, +5, +10, +20].map(pct => (
                  <button key={pct}
                    disabled={!selectedMaterial?.lastPurchasePrice}
                    onClick={() => {
                      const base = parseFloat(selectedMaterial?.lastPurchasePrice || "0");
                      setSimulatedPrice((base * (1 + pct / 100)).toFixed(3));
                    }}
                    className={`px-2 py-1 text-xs rounded-md border font-medium transition-colors ${
                      pct > 0
                        ? "border-red-200 text-red-700 hover:bg-red-50"
                        : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    {pct > 0 ? "+" : ""}{pct}%
                  </button>
                ))}
              </div>

              {pctChange !== null && (
                <div className={`flex items-center gap-2 text-sm font-bold ${pctChange > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {pctChange > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {pctChange > 0 ? "ارتفاع" : "انخفاض"} {Math.abs(pctChange).toFixed(1)}%
                </div>
              )}
            </CardContent>
          </Card>

          {/* Price history */}
          {(history as any[]).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-violet-500" /> تاريخ الأسعار
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(history as any[]).slice(0, 10).map((h: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-xs border-b pb-1">
                      <span className="text-muted-foreground">{h.date}</span>
                      <div className="text-right">
                        <div className="font-mono font-bold">{h.price.toFixed(3)} AED</div>
                        {h.supplierName && <div className="text-muted-foreground">{h.supplierName}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Volatile materials */}
          {(volatileMaterials as any[]).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> أكثر المواد تذبذباً في الأسعار
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {(volatileMaterials as any[]).slice(0, 5).map((m: any) => (
                    <button key={m.materialId} onClick={() => handleSelectVolatile(m.materialId, m.currentPrice)}
                      className="w-full text-right flex items-center justify-between p-2 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors">
                      <div className="text-xs text-right">
                        <div className="font-medium">{m.materialNameAr || m.materialName}</div>
                        <div className="text-muted-foreground">{m.minPrice.toFixed(2)} → {m.maxPrice.toFixed(2)} AED</div>
                      </div>
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs">
                        ±{m.volatilityPct}%
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {!result && !isFetching && (
            <Card className="border-dashed">
              <CardContent className="py-20 text-center text-muted-foreground">
                <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>اختر مادة خام وأدخل السعر الجديد لرؤية التأثير على الوصفات</p>
              </CardContent>
            </Card>
          )}

          {isFetching && (
            <Card>
              <CardContent className="py-16 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
              </CardContent>
            </Card>
          )}

          {result && !isFetching && (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-violet-50 border-violet-200">
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">وصفات متأثرة</div>
                    <div className="text-2xl font-bold text-violet-700">{(result as any).totalRecipesAffected}</div>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">تأثير عالٍ</div>
                    <div className="text-2xl font-bold text-red-700">{(result as any).highImpactCount}</div>
                  </CardContent>
                </Card>
                <Card className={`${(result as any).avgFoodCostDelta > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">متوسط تغيّر Food Cost</div>
                    <div className={`text-2xl font-bold ${pctColor((result as any).avgFoodCostDelta)}`}>
                      {(result as any).avgFoodCostDelta > 0 ? "+" : ""}{(result as any).avgFoodCostDelta}%
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recipes table */}
              {(result as any).affectedRecipes?.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">تأثير على الوصفات</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-right">المنتج</th>
                            <th className="px-4 py-2 text-center">تكلفة الوصفة</th>
                            <th className="px-4 py-2 text-center">Food Cost %</th>
                            <th className="px-4 py-2 text-center">هامش الربح</th>
                            <th className="px-4 py-2 text-center">التأثير</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(result as any).affectedRecipes.map((r: any) => {
                            const impact = IMPACT_CONFIG[r.impact as keyof typeof IMPACT_CONFIG];
                            return (
                              <tr key={r.productId} className="border-b hover:bg-muted/20">
                                <td className="px-4 py-2.5 font-medium">{r.productNameAr || r.productName}</td>
                                <td className="px-4 py-2.5 text-center text-xs">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-muted-foreground">{fmt(r.currentRecipeCost, 3)}</span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                    <span className={r.costDelta > 0 ? "text-red-600 font-bold" : "text-emerald-600 font-bold"}>{fmt(r.newRecipeCost, 3)}</span>
                                    <span className={`text-[10px] ${r.costDelta > 0 ? "text-red-500" : "text-emerald-500"}`}>({r.costDelta > 0 ? "+" : ""}{fmt(r.costDeltaPct, 1)}%)</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center text-xs">
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="text-muted-foreground">{r.currentFoodCostPct}%</span>
                                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                    <span className={`font-bold ${r.newFoodCostPct > 35 ? "text-red-600" : "text-emerald-600"}`}>{r.newFoodCostPct}%</span>
                                    {r.fcDeltaPct !== 0 && (
                                      <span className={`text-[10px] ${r.fcDeltaPct > 0 ? "text-red-500" : "text-emerald-500"}`}>
                                        ({r.fcDeltaPct > 0 ? "+" : ""}{r.fcDeltaPct}pp)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center text-xs">
                                  <span className={r.newMargin < r.currentMargin ? "text-red-600" : "text-emerald-600"}>
                                    {fmt(r.newMargin, 2)} AED
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <Badge className={`${impact.bg} ${impact.color} ${impact.border} border text-xs`}>
                                    {impact.label}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    ✅ هذه المادة غير مستخدمة في أي وصفة مسجّلة
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
