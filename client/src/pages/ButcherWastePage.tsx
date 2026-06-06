import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NumericInput } from "@/components/NumericInput";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, Trash, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Pagination, usePagination } from "@/components/Pagination";

const WASTE_REASONS = ["تلف", "انتهاء صلاحية", "كسر", "خطأ في التحضير", "أخرى"];

export default function ButcherWastePage() {
  const utils = trpc.useUtils();

  const { data: wasteLogs = [], isLoading } = trpc.butcher.listWaste.useQuery({});
  const { data: rawMaterials = [] } = trpc.materials.list.useQuery({});
  const { data: butcherProducts = [] } = trpc.butcher.listProducts.useQuery({});

  const [showDialog, setShowDialog] = useState(false);
  const [itemType, setItemType] = useState<"raw_material" | "butcher_product">("raw_material");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [itemComboOpen, setItemComboOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [wasteDate, setWasteDate] = useState(new Date().toISOString().split("T")[0]);
  const [wasteQty, setWasteQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [wastePage, setWastePage] = useState(1);
  const wastePagination = usePagination(wasteLogs as any[], 15);
  const pagedWaste = wastePagination.paginate(wastePage);

  const items = itemType === "raw_material" ? rawMaterials : butcherProducts;
  const filteredItems = items.filter((m: any) =>
    m.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (m.nameAr || "").includes(itemSearch)
  );
  const selectedItem = items.find((m: any) => m.id === selectedItemId) as any;

  const totalCost = selectedItem && wasteQty && unitCost
    ? (parseFloat(wasteQty) * parseFloat(unitCost)).toFixed(3)
    : "";

  const createWaste = trpc.butcher.createWaste.useMutation({
    onSuccess: () => {
      utils.butcher.listWaste.invalidate();
      utils.materials.list.invalidate();
      setShowDialog(false);
      resetForm();
      toast.success("تم تسجيل الهدر");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteWaste = trpc.butcher.deleteWaste.useMutation({
    onSuccess: () => {
      utils.butcher.listWaste.invalidate();
      utils.materials.list.invalidate();
      toast.success("تم حذف سجل الهدر");
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setSelectedItemId(null);
    setWasteQty("");
    setUnitCost("");
    setReason("");
    setNotes("");
    setItemSearch("");
    setWasteDate(new Date().toISOString().split("T")[0]);
  };

  const handleSubmit = () => {
    if (!selectedItemId || !selectedItem) { toast.error("اختر العنصر"); return; }
    if (!wasteQty || parseFloat(wasteQty) <= 0) { toast.error("أدخل الكمية"); return; }

    createWaste.mutate({
      wasteDate: new Date(wasteDate),
      itemType,
      rawMaterialId: itemType === "raw_material" ? selectedItemId : undefined,
      butcherProductId: itemType === "butcher_product" ? selectedItemId : undefined,
      itemName: selectedItem.nameAr || selectedItem.name,
      unit: selectedItem.unit,
      wasteQty,
      unitCost: unitCost || undefined,
      totalCost: totalCost || undefined,
      reason: reason || undefined,
      notes: notes || undefined,
    });
  };

  const totalWasteCost = wasteLogs.reduce((sum, w) => sum + parseFloat(w.totalCost || "0"), 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash className="w-6 h-6 text-red-600" />
            هدر الملحمة
          </h1>
          <p className="text-muted-foreground text-sm mt-1">تسجيل الهدر في المواد الخام ومنتجات الملحمة</p>
        </div>
        <div className="flex items-center gap-3">
          {totalWasteCost > 0 && (
            <Badge variant="destructive" className="text-sm px-3 py-1">
              إجمالي الهدر: {totalWasteCost.toFixed(3)}
            </Badge>
          )}
          <Button onClick={() => setShowDialog(true)} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 ml-1" /> تسجيل هدر
          </Button>
        </div>
      </div>

      {/* Waste Log Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-right p-3 font-medium">التاريخ</th>
              <th className="text-right p-3 font-medium">العنصر</th>
              <th className="text-right p-3 font-medium">النوع</th>
              <th className="text-right p-3 font-medium">الكمية</th>
              <th className="text-right p-3 font-medium">التكلفة</th>
              <th className="text-right p-3 font-medium">السبب</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">جاري التحميل...</td></tr>
            ) : wasteLogs.length === 0 ? (
              <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">لا توجد سجلات هدر</td></tr>
            ) : (
              pagedWaste.map(w => (
                <tr key={w.id} className="border-t hover:bg-muted/20">
                  <td className="p-3">{new Date(w.wasteDate).toLocaleDateString("ar-SA")}</td>
                  <td className="p-3 font-medium">{w.itemName}</td>
                  <td className="p-3">
                    <Badge variant={w.itemType === "raw_material" ? "secondary" : "outline"} className="text-xs">
                      {w.itemType === "raw_material" ? "مادة خام" : "منتج ملحمة"}
                    </Badge>
                  </td>
                  <td className="p-3">{w.wasteQty} {w.unit}</td>
                  <td className="p-3 text-red-600">{w.totalCost ? `${w.totalCost}` : "—"}</td>
                  <td className="p-3 text-muted-foreground">{w.reason || "—"}</td>
                  <td className="p-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteWaste.mutate({ id: w.id })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination currentPage={wastePage} totalPages={wastePagination.totalPages} onPageChange={setWastePage} totalItems={wastePagination.totalItems} pageSize={15} />
      </div>

      {/* Waste Dialog */}
      <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل هدر جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Date */}
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={wasteDate} onChange={e => setWasteDate(e.target.value)} />
            </div>

            {/* Item Type Toggle */}
            <div className="space-y-1">
              <Label>نوع العنصر</Label>
              <div className="flex gap-2">
                <Button
                  variant={itemType === "raw_material" ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-1", itemType === "raw_material" && "bg-red-600 hover:bg-red-700")}
                  onClick={() => { setItemType("raw_material"); setSelectedItemId(null); }}
                >
                  مادة خام
                </Button>
                <Button
                  variant={itemType === "butcher_product" ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-1", itemType === "butcher_product" && "bg-red-600 hover:bg-red-700")}
                  onClick={() => { setItemType("butcher_product"); setSelectedItemId(null); }}
                >
                  منتج ملحمة
                </Button>
              </div>
            </div>

            {/* Item Select */}
            <div className="space-y-1">
              <Label>العنصر *</Label>
              <Popover open={itemComboOpen} onOpenChange={setItemComboOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className={cn(!selectedItem && "text-muted-foreground")}>
                      {selectedItem ? (selectedItem.nameAr || selectedItem.name) : "اختر العنصر..."}
                    </span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="بحث..." value={itemSearch} onValueChange={setItemSearch} />
                    <CommandList>
                      <CommandEmpty>لا توجد نتائج</CommandEmpty>
                      <CommandGroup>
                        {filteredItems.map((m: any) => (
                          <CommandItem key={m.id} onSelect={() => { setSelectedItemId(m.id); setItemComboOpen(false); }}>
                            <Check className={cn("ml-2 h-4 w-4", selectedItemId === m.id ? "opacity-100" : "opacity-0")} />
                            {m.nameAr || m.name} ({m.unit})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Quantity and Cost */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الكمية * {selectedItem && `(${selectedItem.unit})`}</Label>
                <NumericInput
                  value={wasteQty}
                  onChange={e => setWasteQty(e.target.value)}
                  placeholder="0"
                  numpadLabel="كمية الهدر"
                />
              </div>
              <div className="space-y-1">
                <Label>تكلفة الوحدة</Label>
                <NumericInput
                  value={unitCost}
                  onChange={e => setUnitCost(e.target.value)}
                  placeholder="0.000"
                  numpadLabel="تكلفة الوحدة"
                />
              </div>
            </div>

            {totalCost && (
              <div className="p-2 bg-red-50 dark:bg-red-950/20 rounded-lg text-sm text-red-700 dark:text-red-400">
                إجمالي التكلفة: <strong>{totalCost}</strong>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1">
              <Label>السبب</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={reason}
                onChange={e => setReason(e.target.value)}
              >
                <option value="">اختر السبب...</option>
                {WASTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
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
              disabled={createWaste.isPending}
            >
              {createWaste.isPending ? "جاري الحفظ..." : "تسجيل الهدر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
