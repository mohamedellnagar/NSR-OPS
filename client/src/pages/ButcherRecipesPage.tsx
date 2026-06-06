import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { NumericInput } from "@/components/NumericInput";
import { NumpadDialog } from "@/components/NumpadDialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, ChevronDown, Scale, Package, Check, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const UNITS = ["kg", "g", "L", "ml", "piece", "portion", "حصة", "قطعة"];

export default function ButcherRecipesPage() {
  const utils = trpc.useUtils();

  const { data: products = [], isLoading } = trpc.butcher.listProducts.useQuery({ activeOnly: false });
  const { data: rawMaterials = [] } = trpc.materials.list.useQuery({});

  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // Product form state
  const [productForm, setProductForm] = useState({
    name: "", nameAr: "", unit: "kg", pricePerUnit: "", soldByWeight: false, notes: ""
  });

  // Recipe editing
  const [recipeItems, setRecipeItems] = useState<Array<{ materialId: number; materialName: string; unit: string; quantity: string }>>([]);
  const [matComboOpen, setMatComboOpen] = useState(false);
  const [matSearch, setMatSearch] = useState("");
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadIndex, setNumpadIndex] = useState<number | null>(null);
  const [numpadValue, setNumpadValue] = useState("");

  const { data: recipe = [] } = trpc.butcher.getRecipe.useQuery(
    { productId: selectedProduct! },
    { enabled: !!selectedProduct }
  );

  // Sync recipe from server when product changes
  const [recipeSynced, setRecipeSynced] = useState(false);
  useMemo(() => {
    if (recipe.length > 0 || selectedProduct) {
      setRecipeItems(recipe.map(r => ({
        materialId: r.materialId!,
        materialName: r.materialName || "",
        unit: r.unit,
        quantity: r.quantity,
      })));
      setRecipeSynced(true);
    }
  }, [recipe, selectedProduct]);

  const createProduct = trpc.butcher.createProduct.useMutation({
    onSuccess: () => {
      utils.butcher.listProducts.invalidate();
      setShowProductDialog(false);
      toast.success("تم إضافة المنتج");
    }
  });

  const updateProduct = trpc.butcher.updateProduct.useMutation({
    onSuccess: () => {
      utils.butcher.listProducts.invalidate();
      setShowProductDialog(false);
      setEditingProduct(null);
      toast.success("تم تحديث المنتج");
    }
  });

  const deleteProduct = trpc.butcher.deleteProduct.useMutation({
    onSuccess: () => {
      utils.butcher.listProducts.invalidate();
      if (selectedProduct === editingProduct?.id) setSelectedProduct(null);
      toast.success("تم حذف المنتج");
    }
  });

  const replaceRecipe = trpc.butcher.replaceRecipe.useMutation({
    onSuccess: () => {
      utils.butcher.getRecipe.invalidate({ productId: selectedProduct! });
      toast.success("تم حفظ الوصفة");
    }
  });

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.nameAr || "").includes(search)
  );

  const filteredMaterials = rawMaterials.filter(m =>
    m.name.toLowerCase().includes(matSearch.toLowerCase()) ||
    (m.nameAr || "").includes(matSearch)
  );

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({ name: "", nameAr: "", unit: "kg", pricePerUnit: "", soldByWeight: false, notes: "" });
    setShowProductDialog(true);
  };

  const openEditProduct = (p: any) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name, nameAr: p.nameAr || "", unit: p.unit,
      pricePerUnit: p.pricePerUnit, soldByWeight: p.soldByWeight, notes: p.notes || ""
    });
    setShowProductDialog(true);
  };

  const handleSaveProduct = () => {
    if (!productForm.name || !productForm.pricePerUnit) return;
    if (editingProduct) {
      updateProduct.mutate({ id: editingProduct.id, ...productForm });
    } else {
      createProduct.mutate(productForm);
    }
  };

  const addRecipeRow = (mat: any) => {
    if (recipeItems.find(r => r.materialId === mat.id)) return;
    setRecipeItems(prev => [...prev, { materialId: mat.id, materialName: mat.nameAr || mat.name, unit: mat.unit, quantity: "" }]);
    setMatComboOpen(false);
    setMatSearch("");
  };

  const removeRecipeRow = (idx: number) => {
    setRecipeItems(prev => prev.filter((_, i) => i !== idx));
  };

  const openNumpad = (idx: number) => {
    setNumpadIndex(idx);
    setNumpadValue(recipeItems[idx].quantity);
    setNumpadOpen(true);
  };

  const handleNumpadConfirm = () => {
    if (numpadIndex !== null) {
      setRecipeItems(prev => prev.map((r, i) => i === numpadIndex ? { ...r, quantity: numpadValue } : r));
    }
  };

  const handleSaveRecipe = () => {
    if (!selectedProduct) return;
    const valid = recipeItems.every(r => r.materialId && parseFloat(r.quantity) > 0);
    if (!valid) { toast.error("تحقق من الكميات"); return; }
    replaceRecipe.mutate({
      productId: selectedProduct,
      items: recipeItems.map(r => ({ materialId: r.materialId, quantity: r.quantity, unit: r.unit }))
    });
  };

  const selectedProductData = products.find(p => p.id === selectedProduct);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-red-600" />
            وصفات الملحمة
          </h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة منتجات الملحمة ووصفاتها</p>
        </div>
        <Button onClick={openAddProduct} className="bg-red-600 hover:bg-red-700">
          <Plus className="w-4 h-4 ml-1" /> منتج جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Products List */}
        <div className="md:col-span-1 space-y-3">
          <Input
            placeholder="بحث في المنتجات..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-right"
          />
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">لا توجد منتجات</div>
          ) : (
            filteredProducts.map(p => (
              <Card
                key={p.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  selectedProduct === p.id && "border-red-500 bg-red-50 dark:bg-red-950/20"
                )}
                onClick={() => { setSelectedProduct(p.id); setRecipeSynced(false); }}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.nameAr || p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {p.pricePerUnit} / {p.unit}
                        </Badge>
                        {p.soldByWeight && (
                          <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                            <Scale className="w-3 h-3 ml-1" /> بالوزن
                          </Badge>
                        )}
                        {!p.isActive && <Badge variant="secondary" className="text-xs">غير نشط</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1 mr-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEditProduct(p); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); deleteProduct.mutate({ id: p.id }); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Recipe Editor */}
        <div className="md:col-span-2">
          {!selectedProduct ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-lg">
              <Package className="w-12 h-12 mb-3 opacity-30" />
              <p>اختر منتجاً لتعديل وصفته</p>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  وصفة: {selectedProductData?.nameAr || selectedProductData?.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Add ingredient */}
                <Popover open={matComboOpen} onOpenChange={setMatComboOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="text-muted-foreground">إضافة مادة خام...</span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="بحث في المواد..."
                        value={matSearch}
                        onValueChange={setMatSearch}
                      />
                      <CommandList>
                        <CommandEmpty>لا توجد نتائج</CommandEmpty>
                        <CommandGroup>
                          {filteredMaterials.map(m => (
                            <CommandItem key={m.id} onSelect={() => addRecipeRow(m)}>
                              <Check className={cn("ml-2 h-4 w-4", recipeItems.find(r => r.materialId === m.id) ? "opacity-100" : "opacity-0")} />
                              {m.nameAr || m.name} ({m.unit})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Recipe rows */}
                {recipeItems.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">لا توجد مكونات في الوصفة</div>
                ) : (
                  <div className="space-y-2">
                    {recipeItems.map((row, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                        <div className="flex-1 font-medium text-sm">{row.materialName}</div>
                        <div className="text-xs text-muted-foreground">{row.unit}</div>
                        <div className="w-28">
                          <NumericInput
                            value={row.quantity}
                            onChange={e => setRecipeItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                            placeholder="الكمية"
                            className="h-8 text-sm"
                            numpadLabel={`كمية ${row.materialName}`}
                          />
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeRecipeRow(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  className="w-full bg-red-600 hover:bg-red-700"
                  onClick={handleSaveRecipe}
                  disabled={replaceRecipe.isPending}
                >
                  {replaceRecipe.isPending ? "جاري الحفظ..." : "حفظ الوصفة"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Product Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "تعديل المنتج" : "منتج جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الاسم بالعربي *</Label>
                <Input value={productForm.nameAr} onChange={e => setProductForm(p => ({ ...p, nameAr: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>الاسم بالإنجليزي *</Label>
                <Input value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الوحدة</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={productForm.unit}
                  onChange={e => setProductForm(p => ({ ...p, unit: e.target.value }))}
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>السعر / الوحدة *</Label>
                <NumericInput
                  value={productForm.pricePerUnit}
                  onChange={e => setProductForm(p => ({ ...p, pricePerUnit: e.target.value }))}
                  numpadLabel="السعر لكل وحدة"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Switch
                checked={productForm.soldByWeight}
                onCheckedChange={v => setProductForm(p => ({ ...p, soldByWeight: v }))}
              />
              <div>
                <div className="font-medium text-sm">يُباع بالوزن</div>
                <div className="text-xs text-muted-foreground">الكاشير يُدخل الوزن ويحسب السعر تلقائياً</div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={productForm.notes} onChange={e => setProductForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductDialog(false)}>إلغاء</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleSaveProduct}
              disabled={createProduct.isPending || updateProduct.isPending}
            >
              {editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NumpadDialog
        open={numpadOpen}
        onOpenChange={setNumpadOpen}
        value={numpadValue}
        onValueChange={setNumpadValue}
        onConfirm={handleNumpadConfirm}
      />
    </div>
  );
}
