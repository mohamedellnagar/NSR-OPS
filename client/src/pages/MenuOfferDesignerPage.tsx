import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  ChefHat,
  Lightbulb,
  BookOpen,
  UtensilsCrossed,
  Tag,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

interface Ingredient {
  materialId: number;
  materialName: string;
  quantity: number;
  unit: string;
  notes?: string;
  lastPurchasePrice?: string | null;
}

interface Dish {
  dishName: string;
  preparationMethod?: string;
  ingredients: Ingredient[];
}

interface OfferResult {
  offerName: string;
  servings?: number;
  dishes: Dish[];
}

const EXAMPLE_PROMPTS = [
  "كومبو غداء عائلي لـ 4 أشخاص يتضمن كباب وكفتة مشوية مع سلطة وخبز",
  "عرض عشاء رومانسي لشخصين: فراخ محشية مع أرز بالشعيرية وحلو",
  "منيو إفطار رمضاني كامل: شوربة، طبق رئيسي مصري، حلو",
  "كومبو وجبة سريعة: سندوتش كفتة مع بطاطس وعصير",
  "عرض مشاوي مشكلة: كباب، كفتة، دجاج مشوي مع المقبلات",
];

function calcDishCost(ingredients: Ingredient[]): number {
  return ingredients.reduce((sum, ing) => {
    const price = parseFloat(ing.lastPurchasePrice ?? "0");
    return sum + price * ing.quantity;
  }, 0);
}

function DishTable({ dish }: { dish: Dish }) {
  const totalCost = calcDishCost(dish.ingredients);
  return (
    <Card className="border-orange-100 shadow-sm">
      <CardHeader className="pb-2 border-b border-orange-50">
        <CardTitle className="text-sm flex items-center gap-2 text-orange-800">
          <UtensilsCrossed className="w-4 h-4" />
          {dish.dishName}
        </CardTitle>
        {dish.preparationMethod && (
          <CardDescription className="text-xs leading-relaxed mt-1">
            {dish.preparationMethod}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-3 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-right font-medium">المادة الخام</th>
                <th className="px-3 py-2 text-center font-medium">الكمية</th>
                <th className="px-3 py-2 text-center font-medium">الوحدة</th>
                <th className="px-3 py-2 text-center font-medium">آخر سعر</th>
                <th className="px-3 py-2 text-center font-medium">التكلفة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dish.ingredients.map((ing, i) => {
                const price = parseFloat(ing.lastPurchasePrice ?? "0");
                const cost = price * ing.quantity;
                return (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-medium">
                      {ing.materialName}
                      {ing.notes && (
                        <span className="text-xs text-muted-foreground mr-2">
                          ({ing.notes})
                        </span>
                      )}
                      {ing.materialId === 0 && (
                        <span className="text-xs text-amber-600 mr-1">(غير موجود في المخزون)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">{ing.quantity.toFixed(3)}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{ing.unit}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground text-xs">
                      {ing.lastPurchasePrice ? `${price.toFixed(2)} د.إ` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center text-amber-600 font-medium">
                      {ing.lastPurchasePrice ? `${cost.toFixed(2)} د.إ` : "—"}
                    </td>
                  </tr>
                );
              })}
              {/* Total Row */}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-3 py-2 text-muted-foreground" colSpan={4}>
                  إجمالي تكلفة الصنف
                </td>
                <td className="px-3 py-2 text-center text-amber-600">
                  {totalCost.toFixed(2)} د.إ
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MenuOfferDesignerPage() {
  const [offerText, setOfferText] = useState("");
  const [restrictToStock, setRestrictToStock] = useState(true);
  const [offerResult, setOfferResult] = useState<OfferResult | null>(null);
  const [sellingPrice, setSellingPrice] = useState<string>("");

  const designOffer = trpc.recipes.designMenuOffer.useMutation({
    onSuccess: (data) => {
      const offer = data.offer as OfferResult;
      setOfferResult(offer);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDesign = () => {
    if (!offerText.trim()) {
      toast.error("اكتب وصف العرض أولاً");
      return;
    }
    setOfferResult(null);
    designOffer.mutate({
      offerDescription: offerText,
      restrictToStock,
    });
  };

  const totalOfferCost = offerResult?.dishes.reduce(
    (sum, dish) => sum + calcDishCost(dish.ingredients),
    0
  ) ?? 0;

  const handlePrint = () => {
    if (!offerResult) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const rows = offerResult.dishes.map((dish) => {
      const dishCost = calcDishCost(dish.ingredients);
      const ingredientRows = dish.ingredients.map((ing) => {
        const price = ing.lastPurchasePrice ? parseFloat(String(ing.lastPurchasePrice)) : null;
        const cost = price ? price * ing.quantity : null;
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #f0e6d3">${ing.materialName}${ing.notes ? ` <span style="color:#999;font-size:11px">(${ing.notes})</span>` : ""}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0e6d3;text-align:center">${ing.quantity}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0e6d3;text-align:center">${ing.unit}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0e6d3;text-align:center">${price ? price.toFixed(2) + " د.إ" : "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0e6d3;text-align:center;color:#d97706;font-weight:600">${cost ? cost.toFixed(2) + " د.إ" : "—"}</td>
        </tr>`;
      }).join("");
      return `<div style="margin-bottom:24px">
        <h3 style="background:#fff7ed;padding:10px 14px;border-radius:8px;color:#c2410c;margin:0 0 8px">${dish.dishName}</h3>
        ${dish.preparationMethod ? `<p style="font-size:12px;color:#666;margin:0 0 8px;padding:0 4px">${dish.preparationMethod}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#fef3c7">
            <th style="padding:8px 10px;text-align:right">المادة الخام</th>
            <th style="padding:8px 10px">الكمية</th>
            <th style="padding:8px 10px">الوحدة</th>
            <th style="padding:8px 10px">آخر سعر</th>
            <th style="padding:8px 10px">التكلفة</th>
          </tr></thead>
          <tbody>${ingredientRows}</tbody>
          <tfoot><tr style="background:#fef9ee;font-weight:700">
            <td colspan="4" style="padding:8px 10px;text-align:right">إجمالي تكلفة الصنف</td>
            <td style="padding:8px 10px;text-align:center;color:#d97706">${dishCost.toFixed(2)} د.إ</td>
          </tr></tfoot>
        </table>
      </div>`;
    }).join("");
    const foodCostLine = sellingPriceNum > 0 ? `<span style="margin-right:16px">سعر البيع: ${sellingPriceNum.toFixed(2)} د.إ</span><span style="color:${foodCostPct! <= 30 ? '#16a34a' : foodCostPct! <= 40 ? '#d97706' : '#dc2626'}">فود كوست: ${foodCostPct!.toFixed(1)}%</span>` : "";
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${offerResult.offerName}</title><style>body{font-family:'Dubai','Segoe UI',sans-serif;padding:24px;color:#1a1a1a}h1{color:#c2410c}@media print{button{display:none}}</style></head><body>
      <h1>${offerResult.offerName}</h1>
      <p style="color:#666;margin-bottom:16px">${offerResult.dishes.length} صنف · لشخص واحد · <strong>إجمالي التكلفة: ${totalOfferCost.toFixed(2)} د.إ</strong> ${foodCostLine}</p>
      ${rows}
      <button onclick="window.print()" style="margin-top:16px;padding:10px 24px;background:#ea580c;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">طباعة</button>
    </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const sellingPriceNum = parseFloat(sellingPrice) || 0;
  const foodCostPct = sellingPriceNum > 0 ? (totalOfferCost / sellingPriceNum) * 100 : null;
  const foodCostColor = foodCostPct === null ? "" : foodCostPct <= 30 ? "text-green-600" : foodCostPct <= 40 ? "text-amber-600" : "text-red-600";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg">
          <ChefHat className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">مصمم العروض AI</h1>
          <p className="text-muted-foreground text-sm">
            صف عرضك أو كومبو المنيو، والـ AI يصمم لك الوصفات الكاملة كخبير طاهي مصري
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                وصف العرض
              </CardTitle>
              <CardDescription className="text-xs">
                اكتب ما تريده بالعربي الحر — الـ AI يفهم ويصمم
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                dir="rtl"
                placeholder="مثال: عايز كومبو غداء عائلي يتضمن كباب وكفتة مشوية مع سلطة وخبز..."
                value={offerText}
                onChange={(e) => setOfferText(e.target.value)}
                rows={6}
                className="resize-none text-sm"
              />

              {/* Restrict to Stock Toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                <div>
                  <div className="text-sm font-medium">مواد المخزون فقط</div>
                  <div className="text-xs text-muted-foreground">
                    يقتصر على المواد الموجودة في المخزون
                  </div>
                </div>
                <Switch
                  checked={restrictToStock}
                  onCheckedChange={setRestrictToStock}
                />
              </div>

              <Button
                className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                disabled={designOffer.isPending || !offerText.trim()}
                onClick={handleDesign}
              >
                {designOffer.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {designOffer.isPending ? "جاري التصميم..." : "صمّم العرض"}
              </Button>

              {offerResult && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-orange-700 border-orange-300"
                  onClick={() => {
                    setOfferResult(null);
                    setOfferText("");
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> تصميم جديد
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Example Prompts */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                أمثلة للإلهام
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {EXAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  className="w-full text-right text-xs p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors leading-relaxed"
                  onClick={() => setOfferText(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Result Panel */}
        <div className="lg:col-span-2 space-y-4">
          {!offerResult && !designOffer.isPending && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
              <BookOpen className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">وصفات العرض ستظهر هنا</p>
              <p className="text-sm mt-1 max-w-xs">
                اكتب وصف العرض في النموذج على اليسار واضغط "صمّم العرض"
              </p>
            </div>
          )}

          {designOffer.isPending && (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 text-muted-foreground border-2 border-dashed border-orange-200 rounded-2xl bg-orange-50/30">
              <Loader2 className="w-12 h-12 mb-4 animate-spin text-orange-500" />
              <p className="text-base font-medium text-orange-700">
                الخبير الطاهي يصمم وصفاتك...
              </p>
              <p className="text-sm mt-1 text-orange-500">
                قد يستغرق هذا بضع ثوانٍ
              </p>
            </div>
          )}

          {offerResult && (
            <>
              {/* Offer Header */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-l from-orange-50 to-amber-50 border border-orange-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                    <ChefHat className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-orange-900">{offerResult.offerName}</h2>
                    <p className="text-xs text-orange-600">
                      {offerResult.dishes.length} صنف · لشخص واحد
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {/* Selling Price Input */}
                  <div className="flex flex-col items-end gap-1">
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="w-3 h-3" /> سعر البيع (د.إ)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="0.00"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      className="w-24 h-8 text-sm text-center"
                    />
                  </div>
                  {/* Cost Summary */}
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground">إجمالي التكلفة</div>
                    <div className="text-xl font-bold text-amber-600">
                      {totalOfferCost.toFixed(2)} د.إ
                    </div>
                    {foodCostPct !== null && (
                      <div className={`text-xs font-semibold mt-0.5 ${foodCostColor}`}>
                        فود كوست: {foodCostPct.toFixed(1)}%
                        {foodCostPct <= 30 ? " ✓ ممتاز" : foodCostPct <= 40 ? " ⚠ مقبول" : " ✗ مرتفع"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Print Button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="gap-2 text-orange-700 border-orange-300 hover:bg-orange-50"
                >
                  <Printer className="w-4 h-4" />
                  طباعة / PDF
                </Button>
              </div>

              {/* Dishes Tables */}
              {offerResult.dishes.map((dish, i) => (
                <DishTable key={i} dish={dish} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
