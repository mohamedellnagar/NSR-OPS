import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/NumericInput";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChefHat,
  Plus,
  Trash2,
  Pencil,
  Sparkles,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Loader2,
  UtensilsCrossed,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Upload,
  Download,
  FileSpreadsheet,
  Tag,
  Tags,
  MessageSquare,
  ArrowLeftRight,
  Eye,
  EyeOff,
  Sliders,
  MoreHorizontal,
  AlertTriangle,
  TrendingDown,
  Filter,
  BarChart2,
  PackageX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: number;
  name: string;
  nameAr?: string | null;
  sku: string;
  categoryReference?: string | null;
  price?: string | null;
  cost?: string | null;
  description?: string | null;
  calories?: number | null;
  isActive: boolean;
  showInMenu: boolean;
  recipeSource?: string | null;
}

interface RecipeItem {
  id: number;
  productId: number;
  materialId: number;
  quantity: string;
  unit: string;
  wastePercent?: string | null;
  notes?: string | null;
  materialName: string;
  materialNameAr?: string | null;
  materialUnit: string;
  lastPurchasePrice?: string | null;
  materialType?: string | null;
  allergens?: string | null;
}

// ─── Helper ────────────────────────────────────────────────────────────────────────────────
/**
 * Convert a quantity from recipeUnit to materialUnit so we can multiply by lastPurchasePrice.
 * lastPurchasePrice is always per materialUnit (e.g. price/kg, price/L, price/pcs).
 *
 * Supported conversions:
 *   g  → kg  : ÷ 1000
 *   mg → kg  : ÷ 1_000_000
 *   ml → L   : ÷ 1000
 *   cl → L   : ÷ 100
 *   dl → L   : ÷ 10
 *   kg → kg  : × 1
 *   L  → L   : × 1
 *   pcs→ pcs : × 1
 * If units are the same or no conversion known → use quantity as-is.
 */
/** Normalize unit strings to a canonical short form for comparison */
function normalizeUnit(u: string): string {
  const s = u.toLowerCase().trim();
  // Weight
  if (s === "gram" || s === "grams" || s === "جرام" || s === "جرام") return "g";
  if (s === "kilogram" || s === "kilograms" || s === "kilo" || s === "كيلو" || s === "كيلوجرام") return "kg";
  if (s === "milligram" || s === "milligrams") return "mg";
  // Volume
  if (s === "milliliter" || s === "milliliters" || s === "millilitre" || s === "مل" || s === "مليلتر") return "ml";
  if (s === "liter" || s === "liters" || s === "litre" || s === "litres" || s === "لتر" || s === "لتر") return "l";
  if (s === "centiliter" || s === "cl") return "cl";
  if (s === "deciliter" || s === "dl") return "dl";
  // Count
  if (s === "piece" || s === "pieces" || s === "pc" || s === "قطعة" || s === "حبة" || s === "حبات") return "pcs";
  // Return as-is if no match
  return s;
}

function convertToBaseUnit(qty: number, recipeUnit: string, materialUnit: string): number {
  const r = normalizeUnit(recipeUnit);
  const m = normalizeUnit(materialUnit);
  if (r === m) return qty; // same unit — no conversion needed
  // Weight conversions → base: kg
  if (m === "kg") {
    if (r === "g")  return qty / 1000;
    if (r === "mg") return qty / 1_000_000;
  }
  // Volume conversions → base: l
  if (m === "l") {
    if (r === "ml") return qty / 1000;
    if (r === "cl") return qty / 100;
    if (r === "dl") return qty / 10;
  }
  // If we don’t know how to convert, return as-is (best effort)
  return qty;
}

/**
 * Effective quantity after waste:
 *   effectiveQty = quantity × (1 + wastePercent / 100)
 * This means if a recipe calls for 100g with 10% waste,
 * we actually need 110g from stock → cost is based on 110g.
 */
function effectiveQty(qty: number, wastePercent: number): number {
  return qty * (1 + wastePercent / 100);
}

function calcRecipeCost(items: RecipeItem[], semiCostMap?: Record<number, number>): number {
  return items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity);
    const wastePct = parseFloat(item.wastePercent ?? "0") || 0;
    const qtyWithWaste = effectiveQty(qty, wastePct);
    if (item.materialType === "semi_finished" && semiCostMap && semiCostMap[item.materialId] !== undefined) {
      const costPerUnit = semiCostMap[item.materialId];
      const qtyInBaseUnit = convertToBaseUnit(qtyWithWaste, item.unit, item.materialUnit);
      return sum + costPerUnit * qtyInBaseUnit;
    }
    // Raw material: use lastPurchasePrice
    const price = parseFloat(item.lastPurchasePrice ?? "0");
    const qtyInBaseUnit = convertToBaseUnit(qtyWithWaste, item.unit, item.materialUnit);
    return sum + price * qtyInBaseUnit;
  }, 0);
}

function foodCostPct(cost: number, price: number): number {
  if (!price) return 0;
  return (cost / price) * 100;
}

// ─── Product Card ─────────────────────────────────────────────────────────────
const PRESET_CATEGORIES_CARD = ["مشاوي", "سندوتشات", "شوربات", "مقبلات", "أطباق رئيسية", "أرز وحبوب", "مشروبات", "حلويات", "سلطات", "وجبات خفيفة"];

function ProductCard({
  product,
  materials,
  onDelete,
  onEdit,
}: {
  product: Product;
  materials: Array<{ id: number; name: string; unit: string }>;
  onDelete: (id: number) => void;
  onEdit: (product: Product) => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(false);
  const [catInput, setCatInput] = useState("");

  const updateCategoryMut = trpc.products.update.useMutation({
    onSuccess: () => { utils.products.list.invalidate(); setEditingCategory(false); setCatInput(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleShowInMenu = trpc.products.toggleShowInMenu.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      toast.success(product.showInMenu ? "تم إخفاء الوصفة من المنيو" : "تم إظهار الوصفة في المنيو");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActiveMut = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      toast.success(product.isActive ? "تم إخفاء الوصفة من الكاشير والويتر" : "تم تفعيل الوصفة");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editWaste, setEditWaste] = useState("0");
  const [editNotes, setEditNotes] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [newMaterialId, setNewMaterialId] = useState<string>("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("g");
  const [newWaste, setNewWaste] = useState("0");
  const [newNotes, setNewNotes] = useState("");
  const [newAllergens, setNewAllergens] = useState<string[]>([]);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [offerUserText, setOfferUserText] = useState("");
  const [offerResult, setOfferResult] = useState<string | null>(null);
  const suggestOffers = trpc.recipes.suggestOffers.useMutation({
    onSuccess: (data) => setOfferResult(typeof data.suggestions === "string" ? data.suggestions : ""),
    onError: (e) => toast.error(e.message),
  });

  const { data: recipeItems = [], isLoading } = trpc.recipes.getByProduct.useQuery(
    { productId: product.id },
    { enabled: open }
  );

  const generateAI = trpc.recipes.generateWithAI.useMutation({
    onSuccess: (data) => {
      utils.recipes.getByProduct.invalidate({ productId: product.id });
      utils.products.list.invalidate();
      toast.success("تم توليد الوصفة بالذكاء الاصطناعي", { description: data.notes ?? `تم إضافة ${data.items?.length ?? 0} مكون` });
    },
    onError: (e) => toast.error(e.message),
  });

  const addItem = trpc.recipes.addItem.useMutation({
    onSuccess: () => {
      utils.recipes.getByProduct.invalidate({ productId: product.id });
      setAddingItem(false);
      setNewMaterialId("");
      setNewQty("");
      setNewUnit("g");
      setNewNotes("");
      toast.success("تم إضافة المكون");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = trpc.recipes.updateItem.useMutation({
    onSuccess: () => {
      utils.recipes.getByProduct.invalidate({ productId: product.id });
      setEditingItemId(null);
      toast.success("تم تحديث المكون");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteItem = trpc.recipes.deleteItem.useMutation({
    onSuccess: () => {
      utils.recipes.getByProduct.invalidate({ productId: product.id });
      setDeleteItemId(null);
      toast.success("تم حذف المكون");
    },
    onError: (e) => toast.error(e.message),
  });

  const clearRecipe = trpc.recipes.clearRecipe.useMutation({
    onSuccess: () => {
      utils.recipes.getByProduct.invalidate({ productId: product.id });
      utils.products.list.invalidate();
      setClearConfirm(false);
      toast.success("تم مسح الوصفة");
    },
    onError: (e) => toast.error(e.message),
  });

  // Find semi-finished material IDs in this recipe
  const semiFinishedIds = useMemo(
    () => (recipeItems as RecipeItem[]).filter(i => i.materialType === "semi_finished").map(i => i.materialId),
    [recipeItems]
  );

  // Fetch costs for all semi-finished materials in a single batch query (avoids Rules of Hooks violation)
  const { data: semiCostBatch } = trpc.semiFinished.calcCostBatch.useQuery(
    { materialIds: semiFinishedIds },
    { enabled: open && semiFinishedIds.length > 0 }
  );

  const semiCostMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (semiCostBatch) {
      semiFinishedIds.forEach((id) => {
        const cost = semiCostBatch[id];
        if (cost !== undefined) map[id] = cost;
      });
    }
    return map;
  }, [semiFinishedIds, semiCostBatch]);

  const recipeCost = useMemo(
    () => calcRecipeCost(recipeItems as RecipeItem[], semiCostMap),
    [recipeItems, semiCostMap]
  );
  const sellingPrice = parseFloat(product.price ?? "0");
  const fcPct = foodCostPct(recipeCost, sellingPrice);
  const margin = sellingPrice - recipeCost;

  const startEdit = (item: RecipeItem) => {
    setEditingItemId(item.id);
    setEditQty(item.quantity);
    setEditUnit(item.unit);
    setEditWaste(item.wastePercent ? String(parseFloat(item.wastePercent)) : "0");
    setEditNotes(item.notes ?? "");
  };

  return (
    <Card className="border border-border shadow-sm hover:shadow-md transition-shadow">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none py-4 px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <UtensilsCrossed className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base font-semibold leading-tight">
                      {product.nameAr || product.name}
                    </CardTitle>
                    {product.recipeSource === "ai" && (
                      <Badge variant="secondary" className="text-xs gap-1 bg-purple-100 text-purple-700 border-purple-200">
                        <Sparkles className="w-3 h-3" /> AI
                      </Badge>
                    )}
                    {!product.isActive && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">غير نشط</Badge>
                    )}
                    {!product.showInMenu && (
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50 gap-1">
                        <EyeOff className="w-3 h-3" /> مخفي من المنيو
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>{product.sku}</span>
                    {/* Category badge — click to edit */}
                    {editingCategory ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                          <input value={catInput} onChange={e => setCatInput(e.target.value)}
                            placeholder="اسم الفئة..." autoFocus
                            className="h-6 text-xs border border-amber-300 rounded-full px-2 py-0.5 w-32 focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                            onKeyDown={e => {
                              if (e.key === "Enter" && catInput.trim()) updateCategoryMut.mutate({ id: product.id, categoryReference: catInput.trim() });
                              if (e.key === "Escape") { setEditingCategory(false); setCatInput(""); }
                            }}
                          />
                          {catInput.length === 0 && (
                            <div className="absolute top-full right-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 p-1.5 w-40 max-h-52 overflow-y-auto">
                              {PRESET_CATEGORIES_CARD.map(cat => (
                                <button key={cat} onClick={() => updateCategoryMut.mutate({ id: product.id, categoryReference: cat })}
                                  className="w-full text-right text-xs px-2 py-1.5 rounded-lg hover:bg-amber-50 text-gray-700">
                                  {cat}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button onClick={() => catInput.trim() && updateCategoryMut.mutate({ id: product.id, categoryReference: catInput.trim() })}
                          className="text-[10px] bg-amber-600 text-white rounded-full px-2 py-0.5 hover:bg-amber-700">✓</button>
                        <button onClick={() => { setEditingCategory(false); setCatInput(""); }}
                          className="text-[10px] text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setEditingCategory(true); setCatInput(product.categoryReference ?? ""); }}
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors hover:border-amber-400 ${
                          product.categoryReference
                            ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
                            : "bg-muted text-muted-foreground border-dashed border-gray-300 hover:bg-amber-50"
                        }`}>
                        {product.categoryReference ? `🏷 ${product.categoryReference}` : "+ فئة"}
                      </button>
                    )}
                    {recipeItems.length > 0 && (
                      <>
                        <span>• {recipeItems.length} مكون</span>
                        <span className="text-amber-600 font-medium">• تكلفة: {recipeCost.toFixed(2)} د.إ</span>
                        {sellingPrice > 0 && (
                          <span className={`font-medium ${fcPct > 40 ? "text-red-600" : fcPct > 33 ? "text-amber-600" : "text-green-600"}`}>
                            • Food Cost: {fcPct.toFixed(1)}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Toggle: إخفاء/إظهار من الكاشير والويتر */}
                <Button
                  size="sm"
                  variant="ghost"
                  title={product.isActive ? "إخفاء من الكاشير والويتر" : "إظهار في الكاشير والويتر"}
                  className={`h-8 w-8 p-0 ${
                    product.isActive
                      ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      : "text-red-400 hover:text-red-500 hover:bg-red-50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleActiveMut.mutate({ id: product.id, isActive: !product.isActive });
                  }}
                  disabled={toggleActiveMut.isPending}
                >
                  {product.isActive
                    ? <UtensilsCrossed className="w-4 h-4" />
                    : <UtensilsCrossed className="w-4 h-4 opacity-40" />}
                </Button>
                {/* Toggle: إخفاء/إظهار من المنيو */}
                <Button
                  size="sm"
                  variant="ghost"
                  title={product.showInMenu ? "إخفاء من المنيو" : "إظهار في المنيو"}
                  className={`h-8 w-8 p-0 ${
                    product.showInMenu
                      ? "text-green-600 hover:text-green-700 hover:bg-green-50"
                      : "text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleShowInMenu.mutate({ id: product.id, showInMenu: !product.showInMenu });
                  }}
                  disabled={toggleShowInMenu.isPending}
                >
                  {product.showInMenu
                    ? <Eye className="w-4 h-4" />
                    : <EyeOff className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); onEdit(product); }}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(product.id); }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-5 px-5">
            {/* Cost Summary */}
            {recipeItems.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 p-3 bg-muted/40 rounded-xl">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">تكلفة الوصفة</p>
                  <p className="text-base font-bold text-amber-600">{recipeCost.toFixed(2)} د.إ</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">سعر البيع</p>
                  <p className="text-base font-bold text-blue-600">{sellingPrice > 0 ? `${sellingPrice.toFixed(2)} د.إ` : "—"}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Food Cost %</p>
                  <p className={`text-base font-bold ${fcPct > 40 ? "text-red-600" : fcPct > 33 ? "text-amber-500" : "text-green-600"}`}>
                    {sellingPrice > 0 ? `${fcPct.toFixed(1)}%` : "—"}
                    {sellingPrice > 0 && fcPct > 40 && <span className="text-xs font-normal mr-1">⚠ مرتفع</span>}
                    {sellingPrice > 0 && fcPct > 33 && fcPct <= 40 && <span className="text-xs font-normal mr-1">تنبّه</span>}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">هامش الربح</p>
                  <p className={`text-base font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {sellingPrice > 0 ? `${margin.toFixed(2)} د.إ` : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50"
                disabled={generateAI.isPending}
                onClick={() => generateAI.mutate({
                  productId: product.id,
                  productName: product.nameAr || product.name,
                  productCategory: product.categoryReference ?? "طعام",
                  productDescription: product.description ?? undefined,
                })}
              >
                {generateAI.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {recipeItems.length > 0 ? "إعادة توليد بـ AI" : "توليد وصفة بـ AI"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setAddingItem(true)}
              >
                <Plus className="w-3.5 h-3.5" /> إضافة مكون
              </Button>
              {recipeItems.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => setClearConfirm(true)}
                >
                  <X className="w-3.5 h-3.5" /> مسح الوصفة
                </Button>
              )}
              {recipeCost > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-orange-700 border-orange-300 hover:bg-orange-50"
                  onClick={() => { setOfferResult(null); setOfferUserText(""); setShowOfferDialog(true); }}
                >
                  <Tag className="w-3.5 h-3.5" /> مقترح عروض AI
                </Button>
              )}
              {recipeItems.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  onClick={() => window.open(`/api/pdf/recipe/${product.id}`, "_blank")}
                >
                  <Download className="w-3.5 h-3.5" /> بطاقة التكلفة PDF
                </Button>
              )}
            </div>

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
              </div>
            )}

            {/* Empty State */}
            {!isLoading && recipeItems.length === 0 && !addingItem && (
              <div className="text-center py-8 text-muted-foreground">
                <ChefHat className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد وصفة بعد</p>
                <p className="text-xs mt-1">استخدم AI لتوليد وصفة تلقائياً أو أضف المكونات يدوياً</p>
              </div>
            )}

            {/* Recipe Items Table */}
            {recipeItems.length > 0 && (
              <div className="border border-border rounded-xl overflow-x-auto mb-3">
                <table className="w-full text-sm min-w-[450px]" dir="rtl">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">المادة الخام</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">الكمية</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">الوحدة</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">هدر %</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">آخر سعر</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-28">التكلفة الفعلية</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(recipeItems as RecipeItem[]).map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        {editingItemId === item.id ? (
                          <>
                            <td className="px-3 py-2 font-medium">{item.materialNameAr || item.materialName}</td>
                            <td className="px-3 py-2">
                              <NumericInput
                                
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                className="h-7 text-center text-sm"
                                min="0"
                                step="0.001"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Select value={editUnit} onValueChange={setEditUnit}>
                                <SelectTrigger className="h-7 text-xs w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="g">g</SelectItem>
                                  <SelectItem value="kg">kg</SelectItem>
                                  <SelectItem value="ml">ml</SelectItem>
                                  <SelectItem value="l">l</SelectItem>
                                  <SelectItem value="pcs">حبة</SelectItem>
                                  <SelectItem value="tbsp">ملعقة كبيرة</SelectItem>
                                  <SelectItem value="tsp">ملعقة صغيرة</SelectItem>
                                  <SelectItem value="cup">كوب</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <NumericInput
                                value={editWaste}
                                onChange={(e) => setEditWaste(e.target.value)}
                                className="h-7 text-center text-sm w-16"
                                min="0"
                                max="100"
                                step="0.5"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground text-xs">
                              {item.lastPurchasePrice ? `${parseFloat(item.lastPurchasePrice).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-3 py-2 text-center text-amber-600 font-medium text-xs">
                              {(() => {
                                const qty = parseFloat(editQty || "0");
                                const waste = parseFloat(editWaste || "0");
                                const qtyWithWaste = qty * (1 + waste / 100);
                                const price = parseFloat(item.lastPurchasePrice ?? "0");
                                const cost = price * convertToBaseUnit(qtyWithWaste, editUnit, item.materialUnit);
                                return price ? (
                                  <span title={waste > 0 ? `الكمية مع الهدر: ${qtyWithWaste.toFixed(3)} ${editUnit}` : ""}>
                                    {cost.toFixed(2)} د.إ
                                    {waste > 0 && <span className="text-orange-500 ms-1">(+{waste}% هدر)</span>}
                                  </span>
                                ) : "—";
                              })()}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-green-600"
                                  onClick={() => updateItem.mutate({ id: item.id, quantity: editQty, unit: editUnit, wastePercent: parseFloat(editWaste) || 0, notes: editNotes })}
                                  disabled={updateItem.isPending}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground"
                                  onClick={() => setEditingItemId(null)}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-medium">
                              <div className="flex items-center gap-1.5">
                                {item.materialNameAr || item.materialName}
                                {(() => {
                                  // المصنّعة: تكلفتها من semiCostMap — ليس من lastPurchasePrice
                                  const hasCost =
                                    (item.materialType === "semi_finished" && semiCostMap[item.materialId] !== undefined)
                                    || (item.lastPurchasePrice && parseFloat(item.lastPurchasePrice) > 0);
                                  return !hasCost ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 font-medium shrink-0" title="لا يوجد سعر — التكلفة غير محسوبة">
                                      <AlertTriangle className="w-2.5 h-2.5" /> بدون سعر
                                    </span>
                                  ) : null;
                                })()}
                              </div>
                              {item.notes && <span className="text-xs text-muted-foreground">({item.notes})</span>}
                              {item.allergens && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {item.allergens.split(",").map(a => a.trim()).filter(Boolean).map(a => (
                                    <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">{a}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">{parseFloat(item.quantity).toFixed(2)}</td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{item.unit}</td>
                            {/* هدر % */}
                            <td className="px-3 py-2 text-center">
                              {(() => {
                                const w = parseFloat(item.wastePercent ?? "0") || 0;
                                if (w === 0) return <span className="text-muted-foreground text-xs">—</span>;
                                return (
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${w > 15 ? "bg-red-100 text-red-700" : w > 8 ? "bg-orange-100 text-orange-600" : "bg-amber-100 text-amber-600"}`}>
                                    {w}%
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground text-xs">
                              {item.materialType === "semi_finished" && semiCostMap[item.materialId] !== undefined
                                ? `${semiCostMap[item.materialId].toFixed(2)} د.إ/وحدة`
                                : item.lastPurchasePrice
                                  ? `${parseFloat(item.lastPurchasePrice).toFixed(2)} د.إ`
                                  : "—"}
                            </td>
                            {/* التكلفة الفعلية = الكمية × (1 + هدر%) × السعر */}
                            <td className="px-3 py-2 text-center text-amber-600 font-medium text-xs">
                              {(() => {
                                const qty = parseFloat(item.quantity);
                                const wastePct = parseFloat(item.wastePercent ?? "0") || 0;
                                const qtyWithWaste = qty * (1 + wastePct / 100);
                                if (item.materialType === "semi_finished" && semiCostMap[item.materialId] !== undefined) {
                                  const cost = semiCostMap[item.materialId] * convertToBaseUnit(qtyWithWaste, item.unit, item.materialUnit);
                                  return (
                                    <span title={wastePct > 0 ? `الكمية مع الهدر: ${qtyWithWaste.toFixed(3)} ${item.unit}` : ""}>
                                      {cost.toFixed(2)} د.إ
                                      {wastePct > 0 && <span className="text-orange-500 block text-[10px]">+{wastePct}% هدر</span>}
                                    </span>
                                  );
                                }
                                if (!item.lastPurchasePrice) return <span className="text-muted-foreground">—</span>;
                                const cost = parseFloat(item.lastPurchasePrice) * convertToBaseUnit(qtyWithWaste, item.unit, item.materialUnit);
                                return (
                                  <span title={wastePct > 0 ? `الكمية مع الهدر: ${qtyWithWaste.toFixed(3)} ${item.unit}` : ""}>
                                    {cost.toFixed(2)} د.إ
                                    {wastePct > 0 && <span className="text-orange-500 block text-[10px]">+{wastePct}% هدر</span>}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => startEdit(item)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive"
                                  onClick={() => setDeleteItemId(item.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="bg-muted/30 font-semibold">
                      <td className="px-3 py-2" colSpan={4}>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          إجمالي تكلفة الوصفة
                          {(() => {
                            const missingPrice = (recipeItems as RecipeItem[]).filter(i => {
                              const hasCost =
                                (i.materialType === "semi_finished" && semiCostMap[i.materialId] !== undefined)
                                || (i.lastPurchasePrice && parseFloat(i.lastPurchasePrice) > 0);
                              return !hasCost;
                            });
                            return missingPrice.length > 0 ? (
                              <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 font-medium">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {missingPrice.length} مكوّن بدون سعر — التكلفة غير مكتملة
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-amber-600 text-base">{recipeCost.toFixed(2)} د.إ</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Add Item Row */}
            {addingItem && (
              <div className="border border-dashed border-primary/40 rounded-xl p-4 bg-primary/5 space-y-3">
                <p className="text-sm font-medium text-primary">إضافة مكون جديد</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs mb-1 block">المادة الخام *</Label>
                    <Select value={newMaterialId} onValueChange={(v) => { setNewMaterialId(v); setMaterialSearch(""); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="اختر مادة خام..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                          <div className="relative">
                            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                              className="w-full h-7 pr-7 pl-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              placeholder="ابحث عن مادة..."
                              value={materialSearch}
                              onChange={(e) => setMaterialSearch(e.target.value)}
                              onKeyDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        {materials
                          .filter((m) => {
                            const q = materialSearch.toLowerCase();
                            return !q || m.name.toLowerCase().includes(q);
                          })
                          .map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.name} ({m.unit})
                            </SelectItem>
                          ))}
                        {materialSearch && materials.filter((m) => m.name.toLowerCase().includes(materialSearch.toLowerCase())).length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground text-center">لا توجد نتائج</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">الكمية *</Label>
                    <NumericInput
                      
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      placeholder="0"
                      className="h-9"
                      min="0"
                      step="0.001"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">الوحدة</Label>
                    <Select value={newUnit} onValueChange={setNewUnit}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="g" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="g">g — جرام</SelectItem>
                        <SelectItem value="kg">kg — كيلو</SelectItem>
                        <SelectItem value="ml">ml — مل</SelectItem>
                        <SelectItem value="l">l — لتر</SelectItem>
                        <SelectItem value="pcs">حبة / قطعة</SelectItem>
                        <SelectItem value="tbsp">ملعقة كبيرة</SelectItem>
                        <SelectItem value="tsp">ملعقة صغيرة</SelectItem>
                        <SelectItem value="cup">كوب</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block flex items-center gap-1">
                      هدر % <span className="text-muted-foreground font-normal">(اختياري)</span>
                    </Label>
                    <NumericInput
                      value={newWaste}
                      onChange={(e) => setNewWaste(e.target.value)}
                      placeholder="0"
                      min="0"
                      max="100"
                      step="0.5"
                      className="h-9"
                    />
                    {parseFloat(newWaste) > 0 && parseFloat(newQty) > 0 && (
                      <p className="text-[10px] text-orange-600 mt-0.5">
                        الكمية الفعلية من المخزون: {(parseFloat(newQty) * (1 + parseFloat(newWaste) / 100)).toFixed(3)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">ملاحظة (اختياري)</Label>
                    <Input
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="مثال: مفروم ناعم"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">مسببات الحساسية (اختياري)</Label>
                    <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[36px]">
                      {["gluten","dairy","nuts","eggs","soy","seafood","sesame"].map(a => (
                        <button
                          key={a} type="button"
                          onClick={() => setNewAllergens(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a])}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${newAllergens.includes(a) ? "bg-orange-100 text-orange-700 border-orange-300" : "bg-muted text-muted-foreground border-muted-foreground/20 hover:border-orange-300"}`}
                        >{a}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!newMaterialId || !newQty || addItem.isPending}
                    onClick={() => {
                      addItem.mutate({
                        productId: product.id,
                        materialId: parseInt(newMaterialId),
                        quantity: newQty,
                        unit: newUnit,
                        wastePercent: parseFloat(newWaste) || 0,
                        notes: newNotes || undefined,
                        allergens: newAllergens.length ? newAllergens.join(",") : undefined,
                      });
                      setNewAllergens([]);
                      setNewWaste("0");
                    }}
                  >
                    {addItem.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                    حفظ
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddingItem(false)}>
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete Item Confirm */}
      <AlertDialog open={deleteItemId !== null} onOpenChange={(o) => !o && setDeleteItemId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المكون</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا المكون من الوصفة؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteItemId !== null && deleteItem.mutate({ id: deleteItemId })}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Recipe Confirm */}
      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>مسح الوصفة كاملة</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف جميع مكونات وصفة "{product.nameAr || product.name}". هل أنت متأكد؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => clearRecipe.mutate({ productId: product.id })}
            >
              مسح الكل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Offer Suggestions Dialog ─── */}
      <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-orange-600" />
              مقترح عروض وكومبو — {product.nameAr || product.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 p-3 bg-muted/40 rounded-lg text-sm">
              <div className="text-center">
                <div className="text-muted-foreground text-xs mb-1">تكلفة الوصفة</div>
                <div className="font-semibold text-red-600">{recipeCost.toFixed(2)} د.إ</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground text-xs mb-1">سعر البيع</div>
                <div className="font-semibold text-green-600">{sellingPrice > 0 ? sellingPrice.toFixed(2) + " د.إ" : "غير محدد"}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground text-xs mb-1">فود كوست</div>
                <div className={`font-semibold ${fcPct > 35 ? "text-red-600" : fcPct > 25 ? "text-yellow-600" : "text-green-600"}`}>
                  {sellingPrice > 0 ? fcPct.toFixed(1) + "%" : "—"}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">أخبرني عن ما تريد من العرض <span className="text-muted-foreground font-normal">(اختياري)</span></Label>
              <Textarea
                dir="rtl"
                placeholder="مثال: عايز عرض عشاء عائلي مع مشروب، أو كومبو غداء بسعر تنافسي..."
                value={offerUserText}
                onChange={(e) => setOfferUserText(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            {!offerResult && (
              <Button
                className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                disabled={suggestOffers.isPending}
                onClick={() => suggestOffers.mutate({
                  productName: product.nameAr || product.name,
                  recipeCost,
                  sellingPrice,
                  userText: offerUserText || `اقترح عروضًا مناسبة لمنتج ${product.nameAr || product.name}`,
                })}
              >
                {suggestOffers.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {suggestOffers.isPending ? "جاري تحليل البيانات..." : "اقترح عروضًا"}
              </Button>
            )}
            {offerResult && (
              <div className="space-y-3">
                <div className="border border-orange-200 rounded-xl p-4 bg-orange-50/50 max-h-80 overflow-y-auto">
                  <Streamdown>{offerResult}</Streamdown>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-orange-700 border-orange-300"
                  onClick={() => { setOfferResult(null); setOfferUserText(""); }}
                >
                  <RefreshCw className="w-3.5 h-3.5" /> طلب مقترحات جديدة
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RecipesPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [fcFilter, setFcFilter] = useState<"all" | "high" | "ok" | "norecipe" | "noprice">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    sku: "",
    categoryReference: "",
    price: "",
    cost: "",
    description: "",
    calories: "",
  });

  const [generateAllProgress, setGenerateAllProgress] = useState<{ done: number; total: number } | null>(null);
  const [showGenerateAllResult, setShowGenerateAllResult] = useState(false);
  const [generateAllResult, setGenerateAllResult] = useState<{ generated: number; total: number } | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const generateAllAbortRef = useRef(false);

  // Replace material state
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [replaceFromId, setReplaceFromId] = useState("");
  const [replaceToId, setReplaceToId] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const { data: productsList = [], isLoading: loadingProducts } = trpc.products.list.useQuery();
  const { data: materialsList = [] } = trpc.materials.list.useQuery();
  const downloadTemplate = trpc.products.downloadTemplate.useQuery(undefined, { enabled: false });
  const exportAllRecipes = trpc.recipes.exportAll.useQuery(undefined, { enabled: false });

  const generateAllAI = trpc.recipes.generateAllWithAI.useMutation({
    onSuccess: (data) => {
      utils.products.list.invalidate();
      setGenerateAllProgress(null);
      setGenerateAllResult({ generated: data.generated, total: data.total });
      setShowGenerateAllResult(true);
      toast.success(`تم توليد وصفات لـ ${data.generated} منتج`);
    },
    onError: (e) => {
      setGenerateAllProgress(null);
      toast.error(e.message);
    },
  });

  // Sequential per-product AI generation to avoid 504 timeout
  const generateSingleAI = trpc.recipes.generateWithAI.useMutation();

  const runSequentialGeneration = useCallback(async (products: Product[], overwrite: boolean) => {
    setIsGeneratingAll(true);
    generateAllAbortRef.current = false;
    const total = products.length;
    let generated = 0;
    setGenerateAllProgress({ done: 0, total });

    for (let i = 0; i < products.length; i++) {
      if (generateAllAbortRef.current) break;
      const product = products[i];
      try {
        // generateWithAI always clears and regenerates (overwrite is handled by skipping in sequential loop)
        if (!overwrite) {
          // Skip products that already have a recipe
          const existingRecipe = (productsList as Product[]).find(p => p.id === product.id);
          if (existingRecipe?.recipeSource) {
            setGenerateAllProgress({ done: i + 1, total });
            continue;
          }
        }
        await generateSingleAI.mutateAsync({
          productId: product.id,
          productName: product.nameAr || product.name,
          productCategory: product.categoryReference ?? "طعام",
          productDescription: product.description ?? undefined,
        });
        generated++;
      } catch {
        // continue with next product on error
      }
      setGenerateAllProgress({ done: i + 1, total });
    }

    await utils.products.list.invalidate();
    setGenerateAllProgress(null);
    setIsGeneratingAll(false);
    setGenerateAllResult({ generated, total });
    setShowGenerateAllResult(true);
    toast.success(`تم توليد وصفات لـ ${generated} منتج من أصل ${total}`);
  }, [generateSingleAI, utils]);
  // ─── Bulk Update Ingredient Quantity ────────────────────────────────────────
  const [showBulkQtyDialog, setShowBulkQtyDialog] = useState(false);
  const [bulkQtyMaterialId, setBulkQtyMaterialId] = useState("");
  const [bulkQtyNewQty, setBulkQtyNewQty] = useState("");
  const [bulkQtyNewUnit, setBulkQtyNewUnit] = useState("g");
  const [bulkQtyMaterialSearch, setBulkQtyMaterialSearch] = useState("");
  const [bulkQtySelectedIds, setBulkQtySelectedIds] = useState<number[]>([]);
  const [bulkQtySelectAll, setBulkQtySelectAll] = useState(true);

  const { data: recipesContainingMaterial = [], isFetching: loadingRecipesContaining } =
    trpc.recipes.getRecipesContainingMaterial.useQuery(
      { materialId: Number(bulkQtyMaterialId) },
      { enabled: showBulkQtyDialog && !!bulkQtyMaterialId && Number(bulkQtyMaterialId) > 0 }
    );

  const bulkUpdateIngredientQty = trpc.recipes.bulkUpdateIngredientQuantity.useMutation({
    onSuccess: (data) => {
      utils.products.list.invalidate();
      setShowBulkQtyDialog(false);
      setBulkQtyMaterialId("");
      setBulkQtyNewQty("");
      setBulkQtyNewUnit("g");
      setBulkQtyMaterialSearch("");
      setBulkQtySelectedIds([]);
      setBulkQtySelectAll(true);
      toast.success(`تم تحديث الكمية في ${data.updatedCount} وصفة بنجاح`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Add Ingredient To Many ────────────────────────────────────────────────
  const [showBulkIngDialog, setShowBulkIngDialog] = useState(false);
  const [bulkMaterialId, setBulkMaterialId] = useState("");
  const [bulkQty, setBulkQty] = useState("");
  const [bulkUnit, setBulkUnit] = useState("g");
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkSelectedProducts, setBulkSelectedProducts] = useState<number[]>([]);
  const [bulkSkipExisting, setBulkSkipExisting] = useState(true);
  const [bulkMaterialSearch, setBulkMaterialSearch] = useState("");
  const [bulkProductSearch, setBulkProductSearch] = useState("");

  const addIngredientToMany = trpc.recipes.addIngredientToMany.useMutation({
    onSuccess: (data) => {
      utils.products.list.invalidate();
      setShowBulkIngDialog(false);
      setBulkMaterialId("");
      setBulkQty("");
      setBulkUnit("g");
      setBulkNotes("");
      setBulkSelectedProducts([]);
      setBulkMaterialSearch("");
      setBulkProductSearch("");
      toast.success(`تم إضافة المكوّن لـ ${data.added} صنف${data.skipped > 0 ? ` (تم تخطي ${data.skipped} لوجوده مسبقاً)` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const replaceMaterial = trpc.recipes.replaceMaterial.useMutation({
    onSuccess: (data) => {
      utils.products.list.invalidate();
      setShowReplaceDialog(false);
      setReplaceFromId("");
      setReplaceToId("");
      if (data.replacedCount === 0) {
        toast.info("لم يتم العثور على المادة في أي وصفة");
      } else {
        toast.success(`تم استبدال المادة في ${data.replacedCount} وصفة`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const importFromExcel = trpc.products.importFromExcel.useMutation({
    onSuccess: (result) => {
      setImportResult(result);
      setIsImporting(false);
      utils.products.list.invalidate();
      if (result.added > 0) toast.success(`تم استيراد ${result.added} منتج بنجاح`);
    },
    onError: (e) => { setIsImporting(false); toast.error(e.message); },
  });

  const handleDownloadTemplate = async () => {
    const result = await downloadTemplate.refetch();
    if (!result.data) return;
    const { base64, filename } = result.data;
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const exportResult = await exportAllRecipes.refetch();
      const recipeData = exportResult.data ?? [];
      const XLSX = await import("xlsx");

      // Build rows: one row per ingredient, repeating recipe-level data
      // All values come directly from backend (same source as UI)
      const rows: Record<string, string | number>[] = [];
      let totalIngredients = 0;
      for (const recipe of recipeData) {
        const sellingPrice = parseFloat(String(recipe.sellingPrice ?? 0)) || 0;
        const totalRecipeCost = recipe.totalRecipeCost;
        const foodCostPct = sellingPrice > 0
          ? parseFloat(((totalRecipeCost / sellingPrice) * 100).toFixed(2))
          : 0;
        for (const ing of recipe.ingredients) {
          rows.push({
            "اسم الوصفة": recipe.productNameAr || recipe.productName,
            "سعر البيع": sellingPrice,
            "تكلفة الوصفة الإجمالية": totalRecipeCost,
            "Food Cost %": foodCostPct,
            "اسم المكون": ing.materialName,
            "الكمية": ing.recipeQty,
            "الوحدة": ing.unit,
            "آخر سعر للوحدة": ing.lastPurchasePrice,
            "تكلفة المكون": ing.ingredientCost,
          });
          totalIngredients++;
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, "وصفات المنتجات");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `recipes_export_${today}.xlsx`);
      toast.success(`تم تصدير ${totalIngredients} مكون من ${recipeData.length} وصفة`);
    } catch (e: any) {
      toast.error(e.message ?? "فشل التصدير");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportExcel = () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      importFromExcel.mutate({ base64 });
    };
    reader.readAsDataURL(importFile);
  };

  const materials = useMemo(
    () => (materialsList as Array<{ id: number; name: string; unit: string }>).map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
    })),
    [materialsList]
  );

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return (productsList as Product[]).filter((p) => {
      // text search
      const matchSearch = p.name.toLowerCase().includes(q) ||
        (p.nameAr ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.categoryReference ?? "").toLowerCase().includes(q);
      if (!matchSearch) return false;
      // FC filter
      if (fcFilter === "norecipe") return !p.recipeSource;
      if (fcFilter === "noprice") return !p.price || parseFloat(p.price) === 0;
      if (fcFilter === "high" || fcFilter === "ok") {
        const cost = parseFloat(p.cost ?? "0") || 0;
        const price = parseFloat(p.price ?? "0") || 0;
        if (!price || !cost) return false;
        const fc = (cost / price) * 100;
        if (fcFilter === "high") return fc > 35;
        if (fcFilter === "ok") return fc <= 35;
      }
      // Category filter
      if (categoryFilter !== "all") {
        if (categoryFilter === "__none__") return !p.categoryReference;
        return p.categoryReference === categoryFilter;
      }
      return true;
    });
  }, [productsList, search, fcFilter, categoryFilter]);

  const renameCatMut = trpc.products.renameCategory.useMutation({
    onSuccess: (r) => {
      utils.products.list.invalidate();
      toast.success(`تم تحديث ${r.updated} منتج`);
      setRenamingCat(null); setRenameInput("");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteCatMut = trpc.products.deleteCategory.useMutation({
    onSuccess: (r) => {
      utils.products.list.invalidate();
      toast.success(`تم إزالة الفئة من ${r.updated} منتج`);
      if (categoryFilter === renamingCat) setCategoryFilter("all");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // All categories from products (dynamic)
  const allProductCategories = useMemo(() => {
    const cats = new Set<string>();
    (productsList as Product[]).forEach(p => { if (p.categoryReference) cats.add(p.categoryReference); });
    return Array.from(cats).sort();
  }, [productsList]);

  const aiCategorizeProducts = trpc.products.aiAutoCategorize.useMutation({
    onSuccess: (r: any) => {
      utils.products.list.invalidate();
      toast.success(`تم تصنيف ${r.categorized} صنف من ${r.totalProducts}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createProduct = trpc.products.create.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      setShowAddProduct(false);
      resetForm();
      toast.success("تم إضافة المنتج");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateProduct = trpc.products.update.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      setEditProduct(null);
      resetForm();
      toast.success("تم تحديث المنتج");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProduct = trpc.products.delete.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
      setDeleteProductId(null);
      toast.success("تم حذف المنتج");
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setForm({ name: "", nameAr: "", sku: "", categoryReference: "", price: "", cost: "", description: "", calories: "" });
  }

  function openEdit(product: Product) {
    setForm({
      name: product.name,
      nameAr: product.nameAr ?? "",
      sku: product.sku,
      categoryReference: product.categoryReference ?? "",
      price: product.price ?? "",
      cost: product.cost ?? "",
      description: product.description ?? "",
      calories: product.calories ? String(product.calories) : "",
    });
    setEditProduct(product);
  }

  function handleSave() {
    const payload = {
      name: form.name,
      nameAr: form.nameAr || undefined,
      sku: form.sku,
      categoryReference: form.categoryReference || undefined,
      price: form.price || undefined,
      cost: form.cost || undefined,
      description: form.description || undefined,
      calories: form.calories ? parseInt(form.calories) : undefined,
    };
    if (editProduct) {
      updateProduct.mutate({ id: editProduct.id, ...payload });
    } else {
      createProduct.mutate(payload);
    }
  }

  const isSaving = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">صفحة الوصفات</h1>
            <p className="text-sm text-muted-foreground">إدارة وصفات المنتجات مع دعم الذكاء الاصطناعي</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
          {/* زر تصنيف الأصناف تلقائياً بالذكاء */}
          <Button
            variant="outline"
            className="gap-2 text-purple-700 border-purple-300 hover:bg-purple-50"
            disabled={aiCategorizeProducts.isPending}
            title="تصنيف الأصناف غير المصنّفة تلقائياً حسب الاسم والوصف (مثال: سندوتش كبدة → السندوتشات)"
            onClick={() => {
              if (!confirm("سيتم تصنيف الأصناف غير المصنّفة تلقائياً بالذكاء الاصطناعي حسب اسمها ووصفها. هل تريد المتابعة؟")) return;
              aiCategorizeProducts.mutate({ onlyUncategorized: true });
            }}
          >
            {aiCategorizeProducts.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tags className="w-4 h-4" />}
            تصنيف الأصناف بالذكاء
          </Button>

          {/* زر AI للكل */}
          <Button
            variant="outline"
            className="gap-2 text-purple-700 border-purple-300 hover:bg-purple-50"
            disabled={isGeneratingAll}
            onClick={() => {
              const withoutRecipe = (productsList as Product[]).filter(p => !p.recipeSource);
              const withRecipe = (productsList as Product[]).filter(p => !!p.recipeSource);
              if (withoutRecipe.length === 0 && withRecipe.length > 0) {
                if (!confirm(`جميع المنتجات (${withRecipe.length}) لديها وصفات بالفعل.\nهل تريد إعادة توليد الجميع؟`)) return;
                runSequentialGeneration(withRecipe, true); return;
              }
              if (withoutRecipe.length === 0) { toast.info("لا توجد منتجات"); return; }
              const msg = withRecipe.length > 0
                ? `سيتم توليد وصفات AI لـ ${withoutRecipe.length} منتج (بدون وصفة). هل تريد المتابعة؟`
                : `سيتم توليد وصفات AI لـ ${withoutRecipe.length} منتج. هل تريد المتابعة؟`;
              if (!confirm(msg)) return;
              runSequentialGeneration([...withoutRecipe, ...withRecipe], false);
            }}
          >
            {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            توليد AI للكل
          </Button>

          {/* قائمة العمليات الجماعية */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Sliders className="w-4 h-4" /> عمليات
                <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => {
                setBulkMaterialId(""); setBulkQty(""); setBulkUnit("g"); setBulkNotes("");
                setBulkSelectedProducts([]); setBulkMaterialSearch(""); setBulkProductSearch("");
                setShowBulkIngDialog(true);
              }}>
                <Plus className="w-4 h-4 ml-2 text-teal-600" /> إضافة مكوّن لعدة أصناف
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                setBulkQtyMaterialId(""); setBulkQtyNewQty(""); setBulkQtyNewUnit("g");
                setBulkQtyMaterialSearch(""); setBulkQtySelectedIds([]); setBulkQtySelectAll(true);
                setShowBulkQtyDialog(true);
              }}>
                <Sliders className="w-4 h-4 ml-2 text-blue-600" /> تعديل كمية مكوّن
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setReplaceFromId(""); setReplaceToId(""); setShowReplaceDialog(true); }}>
                <ArrowLeftRight className="w-4 h-4 ml-2 text-orange-600" /> استبدال مادة
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportExcel} disabled={isExporting || loadingProducts}>
                {isExporting ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 ml-2 text-green-600" />}
                تصدير Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setImportFile(null); setImportResult(null); setShowImportDialog(true); }}>
                <Upload className="w-4 h-4 ml-2" /> استيراد من Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadTemplate} disabled={downloadTemplate.isFetching}>
                {downloadTemplate.isFetching ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Download className="w-4 h-4 ml-2" />}
                تحميل قالب Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* زر إضافة منتج — الأهم */}
          <Button onClick={() => { resetForm(); setShowAddProduct(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> إضافة منتج
          </Button>
        </div>
      </div>

      {/* Generate All Progress Banner */}
      {isGeneratingAll && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-purple-600 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-purple-800">
              جاري توليد الوصفات بواسطة AI
              {generateAllProgress && ` (${generateAllProgress.done} / ${generateAllProgress.total})`}
            </p>
            {generateAllProgress && (
              <div className="mt-2 bg-purple-200 rounded-full h-1.5">
                <div
                  className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((generateAllProgress.done / generateAllProgress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
          <Sparkles className="w-5 h-5 text-purple-400" />
        </div>
      )}

      {/* Smart KPI Cards */}
      {productsList.length > 0 && (() => {
        const products = productsList as Product[];
        const noRecipe     = products.filter(p => !p.recipeSource).length;
        const noPrice      = products.filter(p => !p.price || parseFloat(p.price) === 0).length;
        const highFC       = products.filter(p => {
          const cost = parseFloat(p.cost ?? "0"); const price = parseFloat(p.price ?? "0");
          return price > 0 && cost > 0 && (cost / price) * 100 > 35;
        }).length;
        const avgFC = (() => {
          const withBoth = products.filter(p => parseFloat(p.cost ?? "0") > 0 && parseFloat(p.price ?? "0") > 0);
          if (!withBoth.length) return null;
          const sum = withBoth.reduce((s, p) => s + (parseFloat(p.cost!) / parseFloat(p.price!)) * 100, 0);
          return sum / withBoth.length;
        })();

        const cards = [
          {
            label: "إجمالي المنتجات",
            value: products.length,
            icon: <UtensilsCrossed className="w-4 h-4" />,
            color: "text-blue-600 bg-blue-50",
            filter: "all" as const,
            sub: `${products.filter(p => p.recipeSource).length} لها وصفة`,
          },
          {
            label: "بدون وصفة",
            value: noRecipe,
            icon: <PackageX className="w-4 h-4" />,
            color: noRecipe > 0 ? "text-amber-700 bg-amber-50" : "text-muted-foreground bg-muted/30",
            filter: "norecipe" as const,
            sub: noRecipe > 0 ? "تحتاج وصفات" : "الكل لديه وصفة ✓",
          },
          {
            label: "Food Cost > 35%",
            value: highFC,
            icon: <TrendingDown className="w-4 h-4" />,
            color: highFC > 0 ? "text-red-700 bg-red-50" : "text-emerald-700 bg-emerald-50",
            filter: "high" as const,
            sub: highFC > 0 ? "تحتاج مراجعة" : "لا توجد مشكلات ✓",
          },
          {
            label: "متوسط Food Cost",
            value: avgFC !== null ? `${avgFC.toFixed(1)}%` : "—",
            icon: <BarChart2 className="w-4 h-4" />,
            color: avgFC !== null
              ? avgFC > 35 ? "text-red-600 bg-red-50"
              : avgFC > 30 ? "text-amber-700 bg-amber-50"
              : "text-emerald-700 bg-emerald-50"
              : "text-muted-foreground bg-muted/30",
            filter: "all" as const,
            sub: avgFC !== null
              ? avgFC > 35 ? "مرتفع — راجع الوصفات"
              : avgFC > 30 ? "مقبول — المثالي < 30%"
              : "ممتاز"
              : "لا يوجد بيانات",
          },
        ];

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cards.map((k, i) => (
              <button
                key={i}
                onClick={() => setFcFilter(fcFilter === k.filter && k.filter !== "all" ? "all" : k.filter)}
                className={`p-4 rounded-xl border text-right transition-all hover:shadow-md ${
                  fcFilter === k.filter && k.filter !== "all"
                    ? "ring-2 ring-primary shadow-md border-primary/30"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${k.color}`}>{k.icon}</div>
                  <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{k.value}</p>
                <p className={`text-xs mt-0.5 ${k.color.split(' ')[0]}`}>{k.sub}</p>
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── Category Tabs ── */}
      {(allProductCategories.length > 0 || true) && (
        <div className="flex gap-1.5 flex-wrap items-center pb-1">
          {[{ key: "all", label: "الكل" }, ...allProductCategories.map(c => ({ key: c, label: c })), { key: "__none__", label: "بدون فئة" }].map(cat => (
            <button key={cat.key} onClick={() => setCategoryFilter(cat.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                categoryFilter === cat.key
                  ? "bg-amber-700 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-amber-100 hover:text-amber-800"
              }`}>
              {cat.label}
              {cat.key !== "all" && cat.key !== "__none__" && (
                <span className="ms-1 opacity-60">
                  ({(productsList as Product[]).filter(p => p.categoryReference === cat.key).length})
                </span>
              )}
            </button>
          ))}
          {/* زر إدارة الفئات */}
          <button
            onClick={() => setShowCategoryManager(true)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground hover:bg-blue-100 hover:text-blue-700 transition-all flex items-center gap-1 border border-dashed border-muted-foreground/30"
            title="إدارة الفئات"
          >
            ⚙️ {allProductCategories.length > 0 ? "إدارة الفئات" : "إنشاء فئات"}
          </button>
        </div>
      )}

      {/* Search + filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو الكود أو الفئة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
        {/* Filter chips */}
        {(fcFilter !== "all" || search) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">فلاتر نشطة:</span>
            {fcFilter !== "all" && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                <Filter className="w-2.5 h-2.5" />
                {fcFilter === "high" ? "Food Cost > 35%" : fcFilter === "norecipe" ? "بدون وصفة" : fcFilter === "noprice" ? "بدون سعر" : fcFilter}
                <button onClick={() => setFcFilter("all")} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
              </span>
            )}
            {search && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                بحث: {search}
                <button onClick={() => setSearch("")} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
              </span>
            )}
            <span className="text-xs text-muted-foreground">— {filteredProducts.length} نتيجة</span>
          </div>
        )}
      </div>

      {/* Products List */}
      {loadingProducts ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ChefHat className="w-14 h-14 mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">لا توجد منتجات</p>
          <p className="text-sm mt-1">ابدأ بإضافة منتجات من قائمة مطعمك</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              materials={materials}
              onDelete={setDeleteProductId}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Product Dialog */}
      <Dialog open={showAddProduct || editProduct !== null} onOpenChange={(o) => { if (!o) { setShowAddProduct(false); setEditProduct(null); resetForm(); } }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="w-5 h-5" />
              {editProduct ? "تعديل المنتج" : "إضافة منتج جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">الاسم بالعربية *</Label>
                <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value, name: form.name || e.target.value })} placeholder="مثال: ربع دجاج شوي" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">الاسم بالإنجليزية</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Quarter Grilled Chicken" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">كود المنتج (SKU) *</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="مثال: CHK-001" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">الفئة</Label>
                <Input value={form.categoryReference} onChange={(e) => setForm({ ...form, categoryReference: e.target.value })} placeholder="مثال: دجاج مشوي" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">سعر البيع (د.إ)</Label>
                <NumericInput value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" min="0" step="0.01" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">السعرات الحرارية</Label>
                <NumericInput value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} placeholder="0" min="0" />
              </div>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">وصف المنتج (يساعد AI في توليد الوصفة)</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="مثال: ربع دجاج مشوي على الفحم مع أرز وسلطة" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddProduct(false); setEditProduct(null); resetForm(); }}>إلغاء</Button>
            <Button
              disabled={!form.name && !form.nameAr || !form.sku || isSaving}
              onClick={handleSave}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {editProduct ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Excel Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(o) => { if (!o) { setShowImportDialog(false); setImportFile(null); setImportResult(null); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              استيراد المنيو من Excel
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">تعليمات:</p>
              <p>1. حمّل قالب Excel باستخدام زر "تحميل القالب"</p>
              <p>2. املأ بيانات المنتجات (العمودان الأول والثالث إلزاميان)</p>
              <p>3. ارفع الملف هنا</p>
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">ملف Excel (.xlsx)</Label>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
              />
            </div>
            {importResult && (
              <div className={`rounded-lg p-3 text-sm space-y-1 ${importResult.added > 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <p className="font-medium">نتيجة الاستيراد:</p>
                <p className="text-green-700">✅ تم إضافة: {importResult.added} منتج</p>
                {importResult.skipped > 0 && <p className="text-amber-700">⚠️ تم تخطي: {importResult.skipped} صف (بيانات ناقصة)</p>}
                {importResult.errors.length > 0 && (
                  <div>
                    <p className="text-red-700">❌ أخطاء:</p>
                    {importResult.errors.slice(0, 5).map((err, i) => <p key={i} className="text-red-600 text-xs mr-2">{err}</p>)}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportFile(null); setImportResult(null); }}>إغلاق</Button>
            <Button
              onClick={handleImportExcel}
              disabled={!importFile || isImporting}
              className="gap-2"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {isImporting ? "جاري الاستيراد..." : "استيراد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replace Material Dialog */}
      <Dialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-orange-600" /> استبدال مادة في جميع الوصفات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              سيتم استبدال المادة المحددة بمادة أخرى في جميع الوصفات التي تحتوي عليها.
            </p>
            <div className="space-y-2">
              <Label>المادة القديمة (ستُستبدل)</Label>
              <Select value={replaceFromId} onValueChange={setReplaceFromId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المادة المراد استبدالها" />
                </SelectTrigger>
                <SelectContent>
                  {materialsList.map((m: { id: number; name: string; nameAr?: string | null }) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.nameAr || m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المادة الجديدة (ستحل محلها)</Label>
              <Select value={replaceToId} onValueChange={setReplaceToId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المادة البديلة" />
                </SelectTrigger>
                <SelectContent>
                  {materialsList
                    .filter((m: { id: number }) => String(m.id) !== replaceFromId)
                    .map((m: { id: number; name: string; nameAr?: string | null }) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.nameAr || m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReplaceDialog(false)}>إلغاء</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
              disabled={!replaceFromId || !replaceToId || replaceMaterial.isPending}
              onClick={() => {
                const fromName = materialsList.find((m: { id: number }) => String(m.id) === replaceFromId);
                const toName = materialsList.find((m: { id: number }) => String(m.id) === replaceToId);
                const from = (fromName as { nameAr?: string | null; name: string } | undefined);
                const to = (toName as { nameAr?: string | null; name: string } | undefined);
                if (!confirm(`سيتم استبدال "${from?.nameAr || from?.name}" بـ "${to?.nameAr || to?.name}" في جميع الوصفات. هل تريد المتابعة؟`)) return;
                replaceMaterial.mutate({ fromMaterialId: Number(replaceFromId), toMaterialId: Number(replaceToId) });
              }}
            >
              {replaceMaterial.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
              {replaceMaterial.isPending ? "جاري الاستبدال..." : "استبدال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate All AI Result Dialog */}
      <AlertDialog open={showGenerateAllResult} onOpenChange={setShowGenerateAllResult}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-purple-700">
              <Sparkles className="w-5 h-5" /> نتيجة توليد AI
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-foreground">
                <p>تم توليد الوصفات بواسطة AI بنجاح.</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  <p>تم توليد: <strong>{generateAllResult?.generated}</strong> منتج</p>
                  <p>اجمالي المنتجات: <strong>{generateAllResult?.total}</strong></p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowGenerateAllResult(false)}>حسناً</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Bulk Add Ingredient Dialog ─── */}
      <Dialog open={showBulkIngDialog} onOpenChange={setShowBulkIngDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-teal-700">
              <Plus className="w-5 h-5" /> إضافة مكوّن لعدة أصناف
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Step 1: Choose material */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">المادة / المكوّن</Label>
              <Input
                placeholder="بحث في المواد..."
                value={bulkMaterialSearch}
                onChange={(e) => setBulkMaterialSearch(e.target.value)}
                className="mb-1"
              />
              <Select value={bulkMaterialId} onValueChange={setBulkMaterialId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المادة" />
                </SelectTrigger>
                <SelectContent>
                  {(materialsList as Array<{ id: number; name: string; nameAr?: string | null; unit: string }>)
                    .filter(m => {
                      if (!bulkMaterialSearch) return true;
                      const q = bulkMaterialSearch.toLowerCase();
                      return (m.nameAr || m.name).toLowerCase().includes(q);
                    })
                    .map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.nameAr || m.name} <span className="text-muted-foreground text-xs">({m.unit})</span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {/* Step 2: Quantity + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">الكمية</Label>
                <Input
                  type="number"
                  value={bulkQty}
                  onChange={e => setBulkQty(e.target.value)}
                  placeholder="مثال: 100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">الوحدة</Label>
                <Select value={bulkUnit} onValueChange={setBulkUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["g","kg","ml","L","pcs","cl","dl","mg"].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Step 3: Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">ملاحظات <span className="text-muted-foreground font-normal">(اختياري)</span></Label>
              <Input value={bulkNotes} onChange={e => setBulkNotes(e.target.value)} placeholder="ملاحظات..." />
            </div>
            {/* Step 4: Select products */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">اختر الأصناف</Label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{bulkSelectedProducts.length} مختار</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => {
                      const filtered = (productsList as Product[]).filter(p => {
                        if (!bulkProductSearch) return true;
                        const q = bulkProductSearch.toLowerCase();
                        return (p.nameAr || p.name).toLowerCase().includes(q);
                      });
                      if (bulkSelectedProducts.length === filtered.length) {
                        setBulkSelectedProducts([]);
                      } else {
                        setBulkSelectedProducts(filtered.map(p => p.id));
                      }
                    }}
                  >
                    {bulkSelectedProducts.length === (productsList as Product[]).filter(p => {
                      if (!bulkProductSearch) return true;
                      return (p.nameAr || p.name).toLowerCase().includes(bulkProductSearch.toLowerCase());
                    }).length ? "إلغاء تحديد الكل" : "تحديد الكل"}
                  </Button>
                </div>
              </div>
              <Input
                placeholder="بحث في الأصناف..."
                value={bulkProductSearch}
                onChange={e => setBulkProductSearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                {(productsList as Product[])
                  .filter(p => {
                    if (!bulkProductSearch) return true;
                    const q = bulkProductSearch.toLowerCase();
                    return (p.nameAr || p.name).toLowerCase().includes(q);
                  })
                  .map(p => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${
                        bulkSelectedProducts.includes(p.id) ? "bg-teal-50 dark:bg-teal-950/30" : ""
                      }`}
                      onClick={() => {
                        setBulkSelectedProducts(prev =>
                          prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                        );
                      }}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        bulkSelectedProducts.includes(p.id)
                          ? "bg-teal-600 border-teal-600"
                          : "border-muted-foreground"
                      }`}>
                        {bulkSelectedProducts.includes(p.id) && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-sm">{p.nameAr || p.name}</span>
                      {p.recipeSource && <Badge variant="outline" className="text-xs ml-auto">لديه وصفة</Badge>}
                    </div>
                  ))}
              </div>
            </div>
            {/* Skip existing option */}
            <div
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={() => setBulkSkipExisting(v => !v)}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                bulkSkipExisting ? "bg-primary border-primary" : "border-muted-foreground"
              }`}>
                {bulkSkipExisting && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <span className="text-sm">تخطي الأصناف التي تحتوي هذه المادة مسبقاً</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowBulkIngDialog(false)}>إلغاء</Button>
            <Button
              className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
              disabled={
                !bulkMaterialId ||
                !bulkQty ||
                bulkSelectedProducts.length === 0 ||
                addIngredientToMany.isPending
              }
              onClick={() => {
                addIngredientToMany.mutate({
                  materialId: Number(bulkMaterialId),
                  quantity: bulkQty,
                  unit: bulkUnit,
                  notes: bulkNotes || undefined,
                  productIds: bulkSelectedProducts,
                  skipExisting: bulkSkipExisting,
                });
              }}
            >
              {addIngredientToMany.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Plus className="w-4 h-4" />}
              {addIngredientToMany.isPending
                ? "جاري الإضافة..."
                : `إضافة لـ ${bulkSelectedProducts.length} صنف`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Update Ingredient Quantity Dialog ─── */}
      <Dialog open={showBulkQtyDialog} onOpenChange={setShowBulkQtyDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Sliders className="w-5 h-5" /> تعديل كمية مكوّن في جميع الوصفات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              اختر مكوّناً وحدّد الكمية الجديدة وسيتم تحديثها في جميع الوصفات التي تحتوي على هذا المكوّن.
            </p>

            {/* اختيار المكوّن */}
            <div className="space-y-2">
              <Label>المكوّن</Label>
              <Input
                placeholder="بحث عن مكوّن..."
                value={bulkQtyMaterialSearch}
                onChange={(e) => { setBulkQtyMaterialSearch(e.target.value); setBulkQtyMaterialId(""); }}
                className="mb-1"
              />
              <Select
                value={bulkQtyMaterialId}
                onValueChange={(v) => {
                  setBulkQtyMaterialId(v);
                  setBulkQtySelectedIds([]);
                  setBulkQtySelectAll(true);
                  // استخدام وحدة المكوّن كافتراضي
                  const mat = (materialsList as { id: number; unit?: string }[]).find(m => String(m.id) === v);
                  if (mat?.unit) setBulkQtyNewUnit(mat.unit);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المكوّن" />
                </SelectTrigger>
                <SelectContent>
                  {(materialsList as { id: number; name: string; nameAr?: string | null; unit?: string }[])
                    .filter(m => {
                      const q = bulkQtyMaterialSearch.toLowerCase();
                      return !q || (m.nameAr || m.name).toLowerCase().includes(q);
                    })
                    .map(m => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.nameAr || m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* الكمية والوحدة الجديدة */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>الكمية الجديدة</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="0.000"
                  value={bulkQtyNewQty}
                  onChange={(e) => setBulkQtyNewQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>الوحدة</Label>
                <Select value={bulkQtyNewUnit} onValueChange={setBulkQtyNewUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["g","kg","ml","L","piece","tbsp","tsp","cup","oz","lb"].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* قائمة الوصفات التي تحتوي على هذا المكوّن */}
            {bulkQtyMaterialId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>الوصفات التي تحتوي على هذا المكوّن</Label>
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => {
                      if (bulkQtySelectAll) {
                        setBulkQtySelectedIds([]);
                        setBulkQtySelectAll(false);
                      } else {
                        setBulkQtySelectedIds(recipesContainingMaterial.map((r: { id: number }) => r.id));
                        setBulkQtySelectAll(true);
                      }
                    }}
                  >
                    {bulkQtySelectAll ? "إلغاء تحديد الكل" : "تحديد الكل"}
                  </button>
                </div>
                {loadingRecipesContaining ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> جاري تحميل الوصفات...
                  </div>
                ) : recipesContainingMaterial.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">لا توجد وصفات تحتوي على هذا المكوّن.</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                    {recipesContainingMaterial.map((r: { id: number; productNameAr?: string | null; productName: string; quantity: string; unit: string }) => {
                      const isSelected = bulkQtySelectAll
                        ? !bulkQtySelectedIds.includes(r.id)
                        : bulkQtySelectedIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (bulkQtySelectAll) {
                                // في وضع تحديد الكل: المحددة هي المستثناة
                                setBulkQtySelectedIds(prev =>
                                  prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                                );
                              } else {
                                // في وضع إلغاء الكل: المحددة هي المختارة
                                setBulkQtySelectedIds(prev =>
                                  prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                                );
                              }
                            }}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{r.productNameAr || r.productName}</span>
                          </div>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {r.quantity} {r.unit}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {recipesContainingMaterial.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {bulkQtySelectAll
                      ? `سيتم تحديث ${recipesContainingMaterial.length - bulkQtySelectedIds.length} وصفة`
                      : `سيتم تحديث ${bulkQtySelectedIds.length} وصفة`
                    }
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkQtyDialog(false)}>إلغاء</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              disabled={
                !bulkQtyMaterialId ||
                !bulkQtyNewQty ||
                parseFloat(bulkQtyNewQty) <= 0 ||
                recipesContainingMaterial.length === 0 ||
                bulkUpdateIngredientQty.isPending ||
                (bulkQtySelectAll
                  ? recipesContainingMaterial.length - bulkQtySelectedIds.length === 0
                  : bulkQtySelectedIds.length === 0)
              }
              onClick={() => {
                // حساب ال**IDs** الفعلية المختارة
                let targetIds: number[];
                if (bulkQtySelectAll) {
                  // الكل محدد ما عدا المستثنيات
                  const excluded = new Set(bulkQtySelectedIds);
                  targetIds = recipesContainingMaterial
                    .filter((r: { id: number }) => !excluded.has(r.id))
                    .map((r: { id: number }) => r.id);
                } else {
                  targetIds = bulkQtySelectedIds;
                }
                // إذا جميع الوصفات محددة نرسل undefined لتحديث الكل
                const isAll = targetIds.length === recipesContainingMaterial.length;
                bulkUpdateIngredientQty.mutate({
                  materialId: Number(bulkQtyMaterialId),
                  newQuantity: bulkQtyNewQty,
                  newUnit: bulkQtyNewUnit,
                  recipeItemIds: isAll ? undefined : targetIds,
                });
              }}
            >
              {bulkUpdateIngredientQty.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sliders className="w-4 h-4" />}
              {bulkUpdateIngredientQty.isPending ? "جاري التحديث..." : "تحديث الكمية"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Category Manager Dialog ── */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              🏷️ إدارة فئات الوصفات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              الفئات تنظّم وصفاتك في الكاشير. اضغط على أي فئة للتعديل أو الحذف.
            </p>

            {allProductCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm font-medium">لا توجد فئات بعد</p>
                <p className="text-xs mt-1">افتح أي وصفة واضغط "+ فئة" لإنشاء أول فئة</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {allProductCategories.map(cat => {
                  const count = (productsList as Product[]).filter(p => p.categoryReference === cat).length;
                  const isRenaming = renamingCat === cat;
                  return (
                    <div key={cat} className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${isRenaming ? "border-blue-400 bg-blue-50" : "border-border bg-card hover:bg-muted/30"}`}>
                      {isRenaming ? (
                        <>
                          <input
                            value={renameInput}
                            onChange={e => setRenameInput(e.target.value)}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter" && renameInput.trim()) renameCatMut.mutate({ oldName: cat, newName: renameInput.trim() });
                              if (e.key === "Escape") { setRenamingCat(null); setRenameInput(""); }
                            }}
                            className="flex-1 text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none bg-white"
                          />
                          <button
                            onClick={() => renameInput.trim() && renameCatMut.mutate({ oldName: cat, newName: renameInput.trim() })}
                            disabled={!renameInput.trim() || renameCatMut.isPending}
                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                          >
                            {renameCatMut.isPending ? "⏳" : "✓ حفظ"}
                          </button>
                          <button onClick={() => { setRenamingCat(null); setRenameInput(""); }} className="text-xs text-muted-foreground hover:text-foreground px-2">✕</button>
                        </>
                      ) : (
                        <>
                          <span className="text-lg">🏷</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">{cat}</p>
                            <p className="text-xs text-muted-foreground">{count} وصفة</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => { setRenamingCat(cat); setRenameInput(cat); }}
                              className="text-xs px-2.5 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium transition-colors"
                            >
                              ✎ تعديل
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`حذف فئة "${cat}"؟\nسيتم إزالتها من ${count} وصفة بدون حذف الوصفات نفسها.`)) {
                                  deleteCatMut.mutate({ name: cat });
                                }
                              }}
                              disabled={deleteCatMut.isPending}
                              className="text-xs px-2.5 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium transition-colors disabled:opacity-50"
                            >
                              ✕ حذف
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* إضافة فئة جديدة */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">➕ إضافة فئة جديدة</p>
              <div className="flex gap-2">
                <input
                  id="new-cat-input"
                  placeholder="اسم الفئة الجديدة..."
                  className="flex-1 text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !allProductCategories.includes(val)) {
                        // Just show a toast - category gets created when assigned to first product
                        toast.info(`فئة "${val}" جاهزة — اضغط على "+ فئة" في أي وصفة لتعيينها`);
                        (e.target as HTMLInputElement).value = "";
                      } else if (allProductCategories.includes(val)) {
                        toast.error("هذه الفئة موجودة بالفعل");
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.getElementById("new-cat-input") as HTMLInputElement;
                    const val = input?.value.trim();
                    if (val && !allProductCategories.includes(val)) {
                      toast.info(`فئة "${val}" جاهزة — اضغط على "+ فئة" في أي وصفة لتعيينها`);
                      if (input) input.value = "";
                    } else if (allProductCategories.includes(val ?? "")) {
                      toast.error("هذه الفئة موجودة بالفعل");
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700"
                >
                  إضافة
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                💡 الفئات تُنشأ تلقائياً عند تعيينها لأي وصفة من الـ "+ فئة"
              </p>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowCategoryManager(false)} className="px-4 py-2 border rounded-xl text-sm text-muted-foreground hover:bg-muted">
              إغلاق
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Product Confirm */}
      <AlertDialog open={deleteProductId !== null} onOpenChange={(o) => !o && setDeleteProductId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" /> حذف المنتج
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المنتج وجميع مكونات وصفته نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProductId !== null && deleteProduct.mutate({ id: deleteProductId })}
            >
              حذف نهائياً
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
