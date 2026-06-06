import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NumericInput } from "@/components/NumericInput";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, Factory, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/Pagination";

export default function ButcherProductionPage() {
  const utils = trpc.useUtils();

  const { data: productions = [], isLoading } = trpc.butcher.listProduction.useQuery({});
  const { data: products = [] } = trpc.butcher.listProducts.useQuery({});
  const { data: rawMaterials = [] } = trpc.materials.list.useQuery({});

  const [showDialog, setShowDialog] = useState(false);
  const [productComboOpen, setProductComboOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [producedQty, setProducedQty] = useState("");
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [materials, setMaterials] = useState<Array<{ rawMaterialId: number; materialName: string; unit: string; consumedQuantity: string }>>([]);
  const [matComboOpen, setMatComboOpen] = useState(false);
  const [matSearch, setMatSearch] = useState("");
  const [prodPage, setProdPage] = useState(1);
  const prodPagination = usePagination(productions as any[], 15);
  const pagedProductions = prodPagination.paginate(prodPage);

  // Auto-fill recipe when product is selected
  const { data: recipe = [] } = trpc.butcher.getRecipe.useQuery(
    { productId: selectedProductId! },
    { enabled: !!selectedProductId }
  );

  useMemo(() => {
    if (recipe.length > 0) {
      setMaterials(recipe.map(r => ({
        rawMaterialId: r.materialId!,
        materialName: r.materialName || "",
        unit: r.unit,
        consumedQuantity: r.quantity,
      })));
    }
  }, [recipe]);

  const createProduction = trpc.butcher.createProduction.useMutation({
    onSuccess: () => {
      utils.butcher.listProduction.invalidate();
      utils.materials.list.invalidate();
      setShowDialog(false);
      resetForm();
      toast.success("تم تسجيل الإنتاج بنجاح");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProduction = trpc.butcher.deleteProduction.useMutation({
    onSuccess: () => {
      utils.butcher.listProduction.invalidate();
      utils.materials.list.invalidate();
      toast.success("تم حذف سجل الإنتاج");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setSelectedProductId(null);
    setProducedQty("");
    setProductionDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setMaterials([]);
    setProductSearch("");
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.nameAr || "").includes(productSearch)
  );

  const filteredMaterials = rawMaterials.filter(m =>
    m.name.toLowerCase().includes(matSearch.toLowerCase()) ||
    (m.nameAr || "").includes(matSearch)
  );

  const addMaterial = (mat: any) => {
    if (materials.find(m => m.rawMaterialId === mat.id)) return;
    setMaterials(prev => [...prev, {
      rawMaterialId: mat.id,
      materialName: mat.nameAr || mat.name,
      unit: mat.unit,
      consumedQuantity: "",
    }]);
    setMatComboOpen(false);
    setMatSearch("");
  };

  const handleSubmit = () => {
    if (!selectedProductId || !selectedProduct) {
      toast.error("اختر المنتج أولاً");
      return;
    }
    if (!producedQty || parseFloat(producedQty) <= 0) {
      toast.error("أدخل الكمية المنتجة");
      return;
    }
    if (materials.length === 0) {
      toast.error("أضف المواد الخام المستهلكة");
      return;
    }
    const invalid = materials.find(m => !m.consumedQuantity || parseFloat(m.consumedQuantity) <= 0);
    if (invalid) {
      toast.error(`أدخل كمية المادة: ${invalid.materialName}`);
      return;
    }

    createProduction.mutate({
      productionDate: new Date(productionDate),
      productId: selectedProductId,
      productName: selectedProduct.name,
      productNameAr: selectedProduct.nameAr || undefined,
      unit: selectedProduct.unit,
      producedQuantity: producedQty,
      notes: notes || undefined,
      materials,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="w-6 h-6 text-red-600" />
            إنتاج الملحمة
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تسجيل عمليات الإنتاج وخصم المواد الخام</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="bg-red-600 hover:bg-red-700">
          <Plus className="w-4 h-4 ml-1" /> تسجيل إنتاج
        </Button>
      </div>

      {/* Production Log Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-right p-3 font-medium">التاريخ</th>
              <th className="text-right p-3 font-medium">المنتج</th>
              <th className="text-right p-3 font-medium">الكمية المنتجة</th>
              <th className="text-right p-3 font-medium">ملاحظات</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center p-8 text-muted-foreground">جاري التحميل...</td></tr>
            ) : productions.length === 0 ? (
              <tr><td colSpan={5} className="text-center p-8 text-muted-foreground">لا توجد سجلات إنتاج</td></tr>
            ) : (
              pagedProductions.map(prod => (
                <tr key={prod.id} className="border-t hover:bg-muted/20">
                  <td className="p-3">{new Date(prod.productionDate).toLocaleDateString("ar-SA")}</td>
                  <td className="p-3">
                    <div className="font-medium">{prod.productNameAr || prod.productName}</div>
                    <div className="text-xs text-muted-foreground">{prod.productName}</div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      {prod.producedQuantity} {prod.unit}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{prod.notes || "—"}</td>
                  <td className="p-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteProduction.mutate({ id: prod.id })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={prodPage} totalPages={prodPagination.totalPages} onPageChange={setProdPage} totalItems={prodPagination.totalItems} pageSize={15} />
      </div>

      {/* Production Dialog */}
      <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل إنتاج جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Date */}
            <div className="space-y-1">
              <Label>تاريخ الإنتاج</Label>
              <Input type="date" value={productionDate} onChange={e => setProductionDate(e.target.value)} />
            </div>

            {/* Product select */}
            <div className="space-y-1">
              <Label>المنتج *</Label>
              <Popover open={productComboOpen} onOpenChange={setProductComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className={cn(!selectedProduct && "text-muted-foreground")}>
                      {selectedProduct ? (selectedProduct.nameAr || selectedProduct.name) : "اختر المنتج..."}
                    </span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="بحث..." value={productSearch} onValueChange={setProductSearch} />
                    <CommandList>
                      <CommandEmpty>لا توجد نتائج</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.map(p => (
                          <CommandItem key={p.id} onSelect={() => { setSelectedProductId(p.id); setProductComboOpen(false); }}>
                            <Check className={cn("ml-2 h-4 w-4", selectedProductId === p.id ? "opacity-100" : "opacity-0")} />
                            {p.nameAr || p.name} ({p.unit})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Produced Quantity */}
            <div className="space-y-1">
              <Label>الكمية المنتجة * {selectedProduct && `(${selectedProduct.unit})`}</Label>
              <NumericInput
                value={producedQty}
                onChange={e => setProducedQty(e.target.value)}
                placeholder="0"
                numpadLabel="الكمية المنتجة"
              />
            </div>

            {/* Materials consumed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>المواد الخام المستهلكة *</Label>
                {recipe.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Check className="w-3 h-3 ml-1" /> تم تحميل الوصفة
                  </Badge>
                )}
              </div>

              <Popover open={matComboOpen} onOpenChange={setMatComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-sm">
                    <span className="text-muted-foreground">إضافة مادة خام...</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="بحث في المواد..." value={matSearch} onValueChange={setMatSearch} />
                    <CommandList>
                      <CommandEmpty>لا توجد نتائج</CommandEmpty>
                      <CommandGroup>
                        {filteredMaterials.map(m => (
                          <CommandItem key={m.id} onSelect={() => addMaterial(m)}>
                            <Check className={cn("ml-2 h-4 w-4", materials.find(r => r.rawMaterialId === m.id) ? "opacity-100" : "opacity-0")} />
                            {m.nameAr || m.name} ({m.unit}) — {m.currentQuantity} متاح
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {materials.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {materials.map((mat, idx) => {
                    const rawMat = rawMaterials.find(m => m.id === mat.rawMaterialId);
                    const insufficient = rawMat && parseFloat(mat.consumedQuantity) > parseFloat(rawMat.currentQuantity);
                    return (
                      <div key={idx} className={cn("flex items-center gap-2 p-2 rounded-lg", insufficient ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/30")}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{mat.materialName}</div>
                          {rawMat && <div className="text-xs text-muted-foreground">متاح: {rawMat.currentQuantity} {mat.unit}</div>}
                        </div>
                        {insufficient && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                        <div className="w-28">
                          <NumericInput
                            value={mat.consumedQuantity}
                            onChange={e => setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, consumedQuantity: e.target.value } : m))}
                            placeholder="الكمية"
                            className="h-8 text-sm"
                            numpadLabel={`كمية ${mat.materialName}`}
                          />
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive flex-shrink-0" onClick={() => setMaterials(prev => prev.filter((_, i) => i !== idx))}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="اختياري..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>إلغاء</Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleSubmit}
              disabled={createProduction.isPending}
            >
              {createProduction.isPending ? "جاري الحفظ..." : "تسجيل الإنتاج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
