import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { NumericInput } from "@/components/NumericInput";
import { NumpadDialog } from "@/components/NumpadDialog";
import { toast } from "sonner";
import { ShoppingCart, Trash2, Plus, Minus, Scale, CreditCard, Banknote, ArrowLeftRight, CheckCircle2, History, X, PackageX, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type CartItem = {
  productId: number;
  productName: string;
  unit: string;
  soldByWeight: boolean;
  quantity: string;
  pricePerUnit: string;
  totalPrice: string;
};

export default function ButcherCashierPage() {
  const utils = trpc.useUtils();

  const { data: products = [] } = trpc.butcher.listProducts.useQuery({});
  const { data: sales = [], isLoading: salesLoading } = trpc.butcher.listSales.useQuery({});

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [showHistory, setShowHistory] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTotal, setLastTotal] = useState("0");

  // Numpad for weight/quantity input
  const [numpadOpen, setNumpadOpen] = useState(false);
  const [numpadValue, setNumpadValue] = useState("");
  const [numpadLabel, setNumpadLabel] = useState("");
  const [numpadTarget, setNumpadTarget] = useState<{ productId: number; field: "quantity" } | null>(null);

  const createSale = trpc.butcher.createSale.useMutation({
    onSuccess: () => {
      utils.butcher.listSales.invalidate();
      utils.butcher.listProducts.invalidate();
      const total = cartTotal.toFixed(3);
      setLastTotal(total);
      setCart([]);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSale = trpc.butcher.deleteSale.useMutation({
    onSuccess: () => {
      utils.butcher.listSales.invalidate();
      utils.butcher.listProducts.invalidate();
      toast.success("تم إلغاء الفاتورة");
    },
    onError: (e) => toast.error(e.message),
  });

  const getAvailableStock = (product: any): number => {
    const stock = parseFloat(product.currentStock ?? "0");
    const inCart = cart.find(c => c.productId === product.id);
    const inCartQty = inCart ? parseFloat(inCart.quantity) || 0 : 0;
    return stock - inCartQty;
  };

  const addToCart = (product: any) => {
    const stock = parseFloat(product.currentStock ?? "0");
    if (stock <= 0) {
      toast.error(`نفد مخزون ${product.nameAr || product.name}`);
      return;
    }
    const existing = cart.find(c => c.productId === product.id);
    if (existing) {
      if (product.soldByWeight) {
        // Open numpad for weight entry
        setNumpadTarget({ productId: product.id, field: "quantity" });
        setNumpadValue(existing.quantity);
        setNumpadLabel(`وزن ${product.nameAr || product.name} (${product.unit}) — متاح: ${stock} ${product.unit}`);
        setNumpadOpen(true);
      } else {
        const newQty = parseFloat(existing.quantity) + 1;
        if (newQty > stock) { toast.error("تجاوزت الكمية المتاحة في المخزون"); return; }
        updateCartItem(product.id, String(newQty));
      }
      return;
    }

    if (product.soldByWeight) {
      // Add with 0 quantity, then open numpad
      const newItem: CartItem = {
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        soldByWeight: true,
        quantity: "0",
        pricePerUnit: product.pricePerUnit,
        totalPrice: "0",
      };
      setCart(prev => [...prev, newItem]);
      setNumpadTarget({ productId: product.id, field: "quantity" });
      setNumpadValue("");
      setNumpadLabel(`وزن ${product.nameAr || product.name} (${product.unit}) — متاح: ${stock} ${product.unit}`);
      setNumpadOpen(true);
    } else {
      const newItem: CartItem = {
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        soldByWeight: false,
        quantity: "1",
        pricePerUnit: product.pricePerUnit,
        totalPrice: product.pricePerUnit,
      };
      setCart(prev => [...prev, newItem]);
    }
  };

  const updateCartItem = (productId: number, quantity: string) => {
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const qty = parseFloat(quantity) || 0;
      const price = parseFloat(item.pricePerUnit) || 0;
      return { ...item, quantity, totalPrice: (qty * price).toFixed(3) };
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(c => c.productId !== productId));
  };

  const handleNumpadConfirm = () => {
    if (numpadTarget) {
      updateCartItem(numpadTarget.productId, numpadValue || "0");
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + parseFloat(item.totalPrice || "0"), 0);

  const handleCheckout = () => {
    if (cart.length === 0) { toast.error("السلة فارغة"); return; }
    const invalidItems = cart.filter(c => parseFloat(c.quantity) <= 0);
    if (invalidItems.length > 0) {
      toast.error(`أدخل الكمية/الوزن لـ: ${invalidItems.map(i => i.productName).join(", ")}`);
      return;
    }
    // Validate against available stock
    for (const item of cart) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;
      const stock = parseFloat(product.currentStock ?? "0");
      const qty = parseFloat(item.quantity);
      if (qty > stock) {
        toast.error(`الكمية المطلوبة (${qty}) تتجاوز المخزون المتاح (${stock}) لـ ${product.nameAr || product.name}`);
        return;
      }
    }
    createSale.mutate({
      saleDate: new Date(),
      paymentMethod,
      items: cart,
    });
  };

  const paymentMethods = [
    { value: "cash" as const, label: "نقداً", icon: Banknote },
    { value: "card" as const, label: "بطاقة", icon: CreditCard },
    { value: "transfer" as const, label: "تحويل", icon: ArrowLeftRight },
  ];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row gap-0" dir="rtl">
      {/* Products Grid */}
      <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">منتجات الملحمة</h2>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            <History className="w-4 h-4 ml-1" /> السجل
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map(product => {
            const inCart = cart.find(c => c.productId === product.id);
            const stock = parseFloat(product.currentStock ?? "0");
            const outOfStock = stock <= 0;
            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={outOfStock}
                className={cn(
                  "p-3 rounded-xl border-2 text-right transition-all hover:shadow-md active:scale-95 relative",
                  outOfStock
                    ? "border-muted bg-muted/30 opacity-60 cursor-not-allowed"
                    : inCart
                    ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                    : "border-border bg-card hover:border-red-300"
                )}
              >
                {outOfStock && (
                  <div className="absolute top-1 left-1">
                    <PackageX className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="font-semibold text-sm leading-tight mb-1">
                  {product.nameAr || product.name}
                </div>
                <div className="text-xs text-muted-foreground mb-2">{product.name}</div>
                <div className="flex items-center justify-between">
                  <span className={cn("text-sm font-bold", outOfStock ? "text-muted-foreground" : "text-red-600")}>
                    {product.pricePerUnit}
                  </span>
                  <div className="flex items-center gap-1">
                    {product.soldByWeight && (
                      <Scale className="w-3 h-3 text-amber-500" />
                    )}
                    <span className="text-xs text-muted-foreground">/{product.unit}</span>
                  </div>
                </div>
                {/* Stock badge */}
                <div className={cn(
                  "mt-1 text-xs font-medium flex items-center gap-1",
                  outOfStock ? "text-destructive" : stock <= 2 ? "text-amber-600" : "text-emerald-600"
                )}>
                  {outOfStock ? (
                    <><AlertTriangle className="w-3 h-3" /> نفد المخزون</>
                  ) : (
                    <>{stock} {product.unit} متاح</>
                  )}
                </div>
                {inCart && !outOfStock && (
                  <div className="mt-0.5 text-xs font-medium text-red-600">
                    {inCart.quantity} {product.unit} ← في السلة
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart */}
      <div className="w-full md:w-80 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-red-600" />
            الفاتورة
            {cart.length > 0 && (
              <Badge className="bg-red-600 text-white">{cart.length}</Badge>
            )}
          </h2>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">اضغط على منتج لإضافته</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.productId} className="p-2 bg-muted/30 rounded-lg">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.productName}</div>
                    <div className="text-xs text-muted-foreground">{item.pricePerUnit} / {item.unit}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive flex-shrink-0"
                    onClick={() => removeFromCart(item.productId)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {item.soldByWeight ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs border-amber-300 text-amber-700"
                      onClick={() => {
                        setNumpadTarget({ productId: item.productId, field: "quantity" });
                        setNumpadValue(item.quantity);
                        setNumpadLabel(`وزن ${item.productName} (${item.unit})`);
                        setNumpadOpen(true);
                      }}
                    >
                      <Scale className="w-3 h-3 ml-1" />
                      {item.quantity} {item.unit}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1 flex-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => {
                          const newQty = Math.max(0, parseFloat(item.quantity) - 1);
                          if (newQty === 0) removeFromCart(item.productId);
                          else updateCartItem(item.productId, String(newQty));
                        }}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-medium flex-1 text-center">{item.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateCartItem(item.productId, String(parseFloat(item.quantity) + 1))}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  <div className="text-sm font-bold text-red-600 w-16 text-left">
                    {item.totalPrice}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout */}
        <div className="p-4 border-t space-y-3">
          {/* Payment Method */}
          <div className="grid grid-cols-3 gap-1">
            {paymentMethods.map(pm => (
              <Button
                key={pm.value}
                variant={paymentMethod === pm.value ? "default" : "outline"}
                size="sm"
                className={cn("text-xs", paymentMethod === pm.value && "bg-red-600 hover:bg-red-700")}
                onClick={() => setPaymentMethod(pm.value)}
              >
                <pm.icon className="w-3 h-3 ml-1" />
                {pm.label}
              </Button>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="font-medium">الإجمالي</span>
            <span className="text-xl font-bold text-red-600">{cartTotal.toFixed(3)}</span>
          </div>

          {/* Checkout Button */}
          <Button
            className="w-full bg-red-600 hover:bg-red-700 h-12 text-base"
            onClick={handleCheckout}
            disabled={cart.length === 0 || createSale.isPending}
          >
            {createSale.isPending ? "جاري المعالجة..." : "إتمام البيع"}
          </Button>

          {/* Clear Cart */}
          {cart.length > 0 && (
            <Button variant="outline" className="w-full text-destructive" onClick={() => setCart([])}>
              <Trash2 className="w-4 h-4 ml-1" /> مسح الفاتورة
            </Button>
          )}
        </div>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          تم البيع بنجاح — الإجمالي: {lastTotal}
        </div>
      )}

      {/* Numpad Dialog */}
      <NumpadDialog
        open={numpadOpen}
        onOpenChange={setNumpadOpen}
        value={numpadValue}
        onValueChange={setNumpadValue}
        onConfirm={handleNumpadConfirm}
        label={numpadLabel}
      />

      {/* Sales History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>سجل مبيعات الملحمة</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-right p-2 font-medium">التاريخ</th>
                  <th className="text-right p-2 font-medium">الإجمالي</th>
                  <th className="text-right p-2 font-medium">الدفع</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {salesLoading ? (
                  <tr><td colSpan={4} className="text-center p-4 text-muted-foreground">جاري التحميل...</td></tr>
                ) : sales.length === 0 ? (
                  <tr><td colSpan={4} className="text-center p-4 text-muted-foreground">لا توجد مبيعات</td></tr>
                ) : (
                  sales.map(sale => (
                    <tr key={sale.id} className="border-t hover:bg-muted/20">
                      <td className="p-2">{new Date(sale.saleDate).toLocaleString("ar-SA")}</td>
                      <td className="p-2 font-bold text-red-600">{sale.totalAmount}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {sale.paymentMethod === "cash" ? "نقداً" : sale.paymentMethod === "card" ? "بطاقة" : "تحويل"}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteSale.mutate({ id: sale.id })}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistory(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
