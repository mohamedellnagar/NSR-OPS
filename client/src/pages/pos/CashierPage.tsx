/**
 * Cashier POS Interface
 * Full-screen split layout:
 *  LEFT  → product grid (category tabs + item cards)
 *  RIGHT → current order (cart, discount, payment)
 */
import { useState, useMemo, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ShoppingCart, Trash2, Plus, Minus, Tag, CreditCard, Banknote,
  ArrowLeftRight, Search, X, ChevronDown, CheckCircle2, RotateCcw,
  Receipt, Percent, Hash, UtensilsCrossed, Car, Package,
  Clock, AlertTriangle,
} from "lucide-react";

type PayMethod = "cash" | "card" | "transfer" | "online";
type DiscountType = "fixed" | "percentage";

const ORDER_TYPE_CONFIG = {
  dine_in: { icon: <UtensilsCrossed size={14} />, labelAr: "داخلي", labelEn: "Dine In", color: "bg-blue-100 text-blue-700" },
  takeaway: { icon: <Package size={14} />, labelAr: "تيك أواي", labelEn: "Takeaway", color: "bg-amber-100 text-amber-700" },
  delivery: { icon: <Car size={14} />, labelAr: "توصيل", labelEn: "Delivery", color: "bg-purple-100 text-purple-700" },
};

const PAY_METHODS: { key: PayMethod; labelAr: string; labelEn: string; icon: React.ReactNode }[] = [
  { key: "cash", labelAr: "نقداً", labelEn: "Cash", icon: <Banknote size={16} /> },
  { key: "card", labelAr: "بطاقة", labelEn: "Card", icon: <CreditCard size={16} /> },
  { key: "transfer", labelAr: "تحويل", labelEn: "Transfer", icon: <ArrowLeftRight size={16} /> },
];

export default function CashierPage() {
  const { dir } = useLanguage();
  const isRtl = dir === "rtl";
  const utils = trpc.useUtils();

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: products = [] } = trpc.products.list.useQuery({ isActive: true });
  const { data: tables = [] } = trpc.pos.tables.list.useQuery();
  // Categories derived from products (categoryReference) — not material categories
  const productCategories = useMemo(() => {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const p of products as any[]) {
      if (p.categoryReference && !seen.has(p.categoryReference)) {
        seen.add(p.categoryReference);
        cats.push(p.categoryReference);
      }
    }
    return cats;
  }, [products]);
  // Kitchen service stock — drives availability (86'd items are hidden/greyed)
  const { data: availableStock = [] } = trpc.kitchenServiceStock.available.useQuery(
    undefined,
    { refetchInterval: 20000 }
  );
  // Products blocked because a semi-finished ingredient is out of stock
  const { data: blockedIds = [] } = trpc.pos.kitchen.blockedProducts.useQuery(
    undefined,
    { refetchInterval: 20000 }
  );
  const blockedSet = useMemo(() => new Set(blockedIds as number[]), [blockedIds]);

  // Build availability map: productId → { remainingQty, is86d }
  const availabilityMap = useMemo(() => {
    const m = new Map<number, { remainingQty: number; is86d: boolean }>();
    for (const s of availableStock) m.set(s.productId, s);
    return m;
  }, [availableStock]);

  function getAvailability(productId: number) {
    // Blocked by semi-finished stock shortage
    if (blockedSet.has(productId)) {
      return { available: false, remainingQty: null, is86d: true, reason: "recipe" as const };
    }
    if (availableStock.length === 0) return { available: true, remainingQty: null, is86d: false, reason: null };
    const entry = availabilityMap.get(productId);
    if (!entry) return { available: true, remainingQty: null, is86d: false, reason: null };
    return { available: !entry.is86d && entry.remainingQty > 0, remainingQty: entry.remainingQty, is86d: entry.is86d, reason: "86d" as const };
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showTableManager, setShowTableManager] = useState(false);
  const [newTableNum, setNewTableNum] = useState("");
  const [newTableLabel, setNewTableLabel] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("4");
  const [newTableSection, setNewTableSection] = useState("");
  const [editTableTarget, setEditTableTarget] = useState<any>(null);
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [cashPaid, setCashPaid] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [splitPayMethod, setSplitPayMethod] = useState<PayMethod | "">("");
  const [splitPayAmount, setSplitPayAmount] = useState("");
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnOrderNum, setReturnOrderNum] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnAmount, setReturnAmount] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastChange, setLastChange] = useState(0);
  const [guestCount, setGuestCount] = useState(1);
  const [taxPct] = useState(0);
  const [waiterName, setWaiterName] = useState("");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showModifierDialog, setShowModifierDialog] = useState<any>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [itemNote, setItemNote] = useState("");
  const [voidItemTarget, setVoidItemTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState("");
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ customerName: "", customerPhone: "", customerArea: "", customerBuilding: "", customerFloor: "", customerApartment: "", deliveryNotes: "", pickupTime: "" });
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [phoneSearchTimer, setPhoneSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [rightTab, setRightTab] = useState<"order" | "orders">("order"); // can be set in restaurant settings

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createOrderMut = trpc.pos.orders.create.useMutation({
    onError: (e) => toast.error(`خطأ في إنشاء الطلب: ${e.message}`),
  });

  const addItemMut = trpc.pos.orders.addItem.useMutation({
    onSuccess: async (_, variables) => {
      const oid = variables.orderId;
      if (!oid) return;
      setActiveOrderId(oid);
      const order = await utils.pos.orders.get.fetch({ id: oid });
      setActiveOrder(order);
    },
    onError: (e) => toast.error(`خطأ في إضافة الصنف: ${e.message}`),
  });

  const updateItemMut = trpc.pos.orders.updateItem.useMutation({
    onSuccess: async () => {
      if (!activeOrderId) return;
      const order = await utils.pos.orders.get.fetch({ id: activeOrderId });
      setActiveOrder(order);
    },
  });

  const cancelItemMut = trpc.pos.orders.cancelItem.useMutation({
    onSuccess: async () => {
      if (!activeOrderId) return;
      const order = await utils.pos.orders.get.fetch({ id: activeOrderId });
      setActiveOrder(order);
    },
  });

  const discountMut = trpc.pos.orders.applyDiscount.useMutation({
    onSuccess: async () => {
      if (!activeOrderId) return;
      const order = await utils.pos.orders.get.fetch({ id: activeOrderId });
      setActiveOrder(order);
    },
  });

  const sendKitchenMut = trpc.pos.orders.sendToKitchen.useMutation({
    onSuccess: async () => {
      toast.success(isRtl ? "✅ تم الإرسال للمطبخ — يمكنك البدء بطلب جديد" : "✅ Sent to kitchen — ready for new order", { duration: 2500 });
      utils.pos.tables.list.invalidate();
      // افرغ الـ panel لطلب جديد فوراً
      newOrder();
      // بدّل لتاب الطلبات مؤقتاً لإظهار الطلب المُرسل
      setTimeout(() => setRightTab("orders"), 300);
    },
  });

  const payMut = trpc.pos.orders.pay.useMutation({
    onSuccess: (data) => {
      setLastChange(data.changeGiven ?? 0);
      setShowPayDialog(false);
      setShowSuccess(true);
      utils.pos.tables.list.invalidate();
      setTimeout(() => {
        setShowSuccess(false);
        newOrder();
        // بعد الدفع → تاب الطلبات لعرض الملخص
        setRightTab("orders");
      }, 3000);
    },
    onError: (e) => toast.error(e.message),
  });

  const returnMut = trpc.pos.orders.return.useMutation({
    onSuccess: () => {
      toast.success(isRtl ? "تم تسجيل الاسترداد" : "Return processed");
      setShowReturnDialog(false);
      setReturnOrderNum(""); setReturnReason(""); setReturnAmount("");
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelOrderMut = trpc.pos.orders.cancel.useMutation({
    onSuccess: () => {
      utils.pos.tables.list.invalidate();
      newOrder();
    },
  });

  const setDeliveryMut = trpc.pos.setDeliveryInfo.useMutation({
    onSuccess: () => {
      toast.success(isRtl ? "تم حفظ بيانات التوصيل" : "Delivery info saved");
      setShowDeliveryDialog(false);
      // Now send to kitchen
      if (activeOrderId) sendKitchenMut.mutate({ orderId: activeOrderId });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const upsertCustomerMut = trpc.pos.customers.upsert.useMutation({
    onError: (e: any) => toast.error(e.message),
  });

  const createTableMut = trpc.pos.tables.create.useMutation({
    onSuccess: () => { utils.pos.tables.list.invalidate(); toast.success(isRtl ? "تم إنشاء الطاولة" : "Table created"); setNewTableNum(""); setNewTableLabel(""); setNewTableCapacity("4"); setNewTableSection(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateTableMut = trpc.pos.tables.update.useMutation({
    onSuccess: () => { utils.pos.tables.list.invalidate(); toast.success(isRtl ? "تم التعديل" : "Updated"); setEditTableTarget(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteTableMut = trpc.pos.tables.delete.useMutation({
    onSuccess: () => { utils.pos.tables.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const transferTableMut = trpc.pos.orders.transferTable.useMutation({
    onSuccess: async () => {
      toast.success(isRtl ? "تم نقل الطاولة" : "Table transferred");
      utils.pos.tables.list.invalidate();
      if (activeOrderId) { const order = await utils.pos.orders.get.fetch({ id: activeOrderId }); setActiveOrder(order); }
      setShowTransferDialog(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setWaiterMut = trpc.pos.orders.setWaiter.useMutation({
    onSuccess: () => toast.success(isRtl ? "تم تعيين الويتر" : "Waiter assigned"),
    onError: (e: any) => toast.error(e.message),
  });

  const voidItemMut = trpc.pos.orders.voidItem.useMutation({
    onSuccess: async () => {
      toast.success(isRtl ? "تم إلغاء البند" : "Item voided");
      if (activeOrderId) { const order = await utils.pos.orders.get.fetch({ id: activeOrderId }); setActiveOrder(order); }
      setVoidItemTarget(null); setVoidReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setModifiersMut = trpc.pos.orders.setItemModifiers.useMutation({
    onSuccess: async () => {
      toast.success(isRtl ? "تم حفظ التخصيصات" : "Modifiers saved");
      if (activeOrderId) { const order = await utils.pos.orders.get.fetch({ id: activeOrderId }); setActiveOrder(order); }
      setShowModifierDialog(null); setSelectedModifiers([]); setItemNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  // ── Today's orders for the orders board ────────────────────────────────────
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  const { data: todayOrders = [], refetch: refetchOrders } = trpc.pos.orders.listByDate.useQuery(
    { date: todayStr },
    { refetchInterval: 8000 }
  );

  function newOrder() {
    setActiveOrderId(null);
    setActiveOrder(null);
    setDiscountValue("");
    setCashPaid("");
    setTipAmount("");
    setSplitPayMethod("");
    setSplitPayAmount("");
    setWaiterName("");
    setSelectedTableId(null);
  }

  async function ensureOrder(): Promise<number> {
    if (activeOrderId) return activeOrderId;
    const res = await createOrderMut.mutateAsync({
      orderType,
      tableId: selectedTableId ?? undefined,
      guestCount,
      taxPct,
    });
    setActiveOrderId(res.id);
    return res.id;
  }

  async function handleAddProduct(product: any) {
    // منع إضافة منتجات لطلب داخلي بدون طاولة
    if (orderType === "dine_in" && !selectedTableId && !activeOrderId) {
      setShowTablePicker(true);
      toast.warning(isRtl ? "اختر الطاولة أولاً قبل إضافة الأصناف" : "Select a table before adding items", { duration: 2000 });
      return;
    }
    const oid = await ensureOrder();
    await addItemMut.mutateAsync({ orderId: oid, productId: product.id, quantity: 1 });
  }

  function handleQtyChange(itemId: number, delta: number, currentQty: number) {
    const newQty = currentQty + delta;
    if (newQty <= 0) {
      cancelItemMut.mutate({ itemId });
    } else {
      updateItemMut.mutate({ itemId, quantity: newQty });
    }
  }

  function handleApplyDiscount() {
    if (!activeOrderId || !discountValue) return;
    discountMut.mutate({
      orderId: activeOrderId,
      discountType,
      discountValue: parseFloat(discountValue),
    });
  }

  function handlePay() {
    if (!activeOrderId || !activeOrder) return;
    const tip = tipAmount ? parseFloat(tipAmount) : 0;
    const totalWithTip = (parseFloat(activeOrder.total) || 0) + tip;
    payMut.mutate({
      orderId: activeOrderId,
      paymentMethod: payMethod,
      amount: totalWithTip,
      cashPaid: payMethod === "cash" && cashPaid ? parseFloat(cashPaid) : undefined,
      deductInventory: true,
      tipAmount: tip > 0 ? tip : undefined,
      secondPaymentMethod: splitPayMethod || undefined,
      secondPaymentAmount: splitPayAmount ? parseFloat(splitPayAmount) : undefined,
    });
  }

  // ── Filtered products ──────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) => {
      const inCategory = selectedCategory === "all" || p.categoryReference === selectedCategory;
      const inSearch = !search || (p.nameAr || p.name).toLowerCase().includes(search.toLowerCase());
      return inCategory && inSearch && p.isActive;
    });
  }, [products, selectedCategory, search]);

  const orderItems = activeOrder?.items ?? [];
  const subtotal = activeOrder?.subtotal ?? 0;
  const discountAmount = activeOrder?.discountAmount ?? 0;
  const taxAmount = activeOrder?.taxAmount ?? 0;
  const total = activeOrder?.total ?? 0;
  const change = payMethod === "cash" && cashPaid ? Math.max(0, parseFloat(cashPaid) - total) : 0;
  const kitchenSent = activeOrder?.status === "sent_to_kitchen" || activeOrder?.status === "partially_ready" || activeOrder?.status === "ready";

  // Category color palette
  const CAT_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
    "مشاوي الفحم":       { bg: "#1a0a00", text: "#ff8c42", icon: "🔥" },
    "سندوتشات":          { bg: "#001a0a", text: "#4ade80", icon: "🥙" },
    "محاشي":             { bg: "#0a001a", text: "#a78bfa", icon: "🫕" },
    "مكرونة وباستا":     { bg: "#00101a", text: "#38bdf8", icon: "🍝" },
    "طواجن":             { bg: "#1a0010", text: "#f472b6", icon: "🥘" },
    "فتة وصواني":        { bg: "#0f0f00", text: "#facc15", icon: "🍲" },
    "فواكه اللحوم":      { bg: "#1a0000", text: "#f87171", icon: "🥩" },
    "شوربات":            { bg: "#001010", text: "#34d399", icon: "🍜" },
    "أرز وأطباق جانبية":{ bg: "#001500", text: "#86efac", icon: "🍚" },
    "مشروبات":           { bg: "#00001a", text: "#93c5fd", icon: "☕" },
    "وجبات البط":        { bg: "#1a0800", text: "#fb923c", icon: "🦆" },
    "ريزو":              { bg: "#100015", text: "#c084fc", icon: "🍛" },
    "دجاج محمر":         { bg: "#150500", text: "#fbbf24", icon: "🐓" },
    "مقبلات وإضافات":   { bg: "#001a10", text: "#6ee7b7", icon: "🥗" },
  };
  function getCatColor(cat: string) {
    return CAT_COLORS[cat] ?? { bg: "#111827", text: "#94a3b8", icon: "🍽" };
  }

  return (
    <div className={`flex h-screen overflow-hidden ${isRtl ? "flex-row-reverse" : ""}`}
      style={{ background: "#0f1117", direction: isRtl ? "rtl" : "ltr" }}
      dir={dir}>

      {/* ── LEFT: Product Grid ─────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0" style={{ background: "#0f1117" }}>

        {/* ── Top bar ── */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "#161b27", borderBottom: "1px solid #1e2535" }}>
          {/* Order type pills */}
          {(["dine_in", "takeaway", "delivery"] as const).map((t) => (
            <button key={t} onClick={() => setOrderType(t)}
              style={{
                background: orderType === t ? "#2563eb" : "#1e2535",
                color: orderType === t ? "#fff" : "#94a3b8",
                border: "none", borderRadius: "10px", padding: "6px 14px",
                fontSize: "12px", fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: "5px",
                transition: "all .15s",
              }}>
              {ORDER_TYPE_CONFIG[t].icon}
              {isRtl ? ORDER_TYPE_CONFIG[t].labelAr : ORDER_TYPE_CONFIG[t].labelEn}
            </button>
          ))}

          {/* Table selector */}
          {orderType === "dine_in" && (
            <button onClick={() => setShowTablePicker(true)}
              style={{
                background: selectedTableId ? "#1d4ed8" : "#92400e",
                color: "#fff", border: "none", borderRadius: "10px",
                padding: "6px 14px", fontSize: "12px", fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
              }}>
              🪑 {selectedTableId
                ? (tables as any[]).find((t: any) => t.id === selectedTableId)?.label || `T${(tables as any[]).find((t: any) => t.id === selectedTableId)?.tableNumber}`
                : "اختر طاولة !"}
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Guests */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "12px" }}>
            <span>👥</span>
            <button onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
              style={{ width: 24, height: 24, borderRadius: "50%", background: "#1e2535", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
            <span style={{ color: "#e2e8f0", fontWeight: 700, minWidth: "20px", textAlign: "center" }}>{guestCount}</span>
            <button onClick={() => setGuestCount((g) => g + 1)}
              style={{ width: 24, height: 24, borderRadius: "50%", background: "#1e2535", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
          </div>

          <button onClick={() => setShowTableManager(true)}
            style={{ background: "#1e2535", border: "none", borderRadius: "8px", padding: "6px 8px", cursor: "pointer", color: "#64748b", fontSize: "14px" }}
            title="إدارة الطاولات">⚙️</button>
        </div>

        {/* ── Search ── */}
        <div style={{ padding: "8px 12px", background: "#161b27", borderBottom: "1px solid #1e2535" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [isRtl ? "right" : "left"]: "10px", color: "#475569" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isRtl ? "ابحث عن منتج..." : "Search products..."}
              style={{
                width: "100%", background: "#1e2535", border: "1px solid #2d3748",
                borderRadius: "10px", padding: isRtl ? "9px 34px 9px 10px" : "9px 10px 9px 34px",
                color: "#e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box",
              }} />
            {search && (
              <button onClick={() => setSearch("")}
                style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [isRtl ? "left" : "right"]: "10px", background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Category tabs ── */}
        <div style={{
          display: "flex", gap: "6px", padding: "8px 12px", overflowX: "auto",
          background: "#161b27", borderBottom: "1px solid #1e2535",
          scrollbarWidth: "none",
        }}>
          <style>{`div::-webkit-scrollbar{display:none}`}</style>
          <button onClick={() => setSelectedCategory("all")}
            style={{
              padding: "7px 16px", borderRadius: "20px", border: "none",
              background: selectedCategory === "all" ? "#2563eb" : "#1e2535",
              color: selectedCategory === "all" ? "#fff" : "#94a3b8",
              fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            }}>
            🍽 الكل
          </button>
          {productCategories.map(cat => {
            const cc = getCatColor(cat);
            const isActive = selectedCategory === cat;
            return (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "7px 16px", borderRadius: "20px",
                  border: isActive ? "none" : `1px solid ${cc.text}33`,
                  background: isActive ? cc.text : cc.bg,
                  color: isActive ? "#000" : cc.text,
                  fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                  transition: "all .15s",
                }}>
                {cc.icon} {cat}
              </button>
            );
          })}
        </div>

        {/* ── Products grid ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "10px",
          }}>
            {filteredProducts.map((p: any) => {
              const avail = getAvailability(p.id);
              const is86d = avail.is86d;
              const isRecipeBlocked = is86d && avail.reason === "recipe";
              const lowStock = avail.remainingQty !== null && avail.remainingQty <= 3 && !is86d;
              const cc = getCatColor(p.categoryReference ?? "");
              return (
                <button key={p.id}
                  onClick={() => !is86d && handleAddProduct(p)}
                  disabled={is86d}
                  style={{
                    position: "relative", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", textAlign: "center",
                    padding: "16px 10px 14px",
                    background: isRecipeBlocked ? "#1a0a1a" : is86d ? "#1a1a2e" : cc.bg,
                    border: `1.5px solid ${isRecipeBlocked ? "#7c3aed44" : is86d ? "#2d2d4a" : cc.text + "44"}`,
                    borderRadius: "14px", cursor: is86d ? "not-allowed" : "pointer",
                    opacity: is86d ? 0.5 : 1,
                    transition: "all .15s",
                    minHeight: "100px",
                  }}
                  onMouseEnter={e => { if (!is86d) (e.currentTarget as any).style.borderColor = cc.text + "cc"; }}
                  onMouseLeave={e => { if (!is86d) (e.currentTarget as any).style.borderColor = cc.text + "44"; }}
                >
                  {isRecipeBlocked && (
                    <span style={{ position: "absolute", top: 0, left: 0, right: 0, borderRadius: "13px 13px 0 0", fontSize: "9px", background: "#7c3aed", color: "#fff", padding: "3px 4px", fontWeight: 700, textAlign: "center" }}>
                      🔒 وصفة غير متاحة
                    </span>
                  )}
                  {!isRecipeBlocked && is86d && (
                    <span style={{ position: "absolute", top: 6, insetInlineEnd: 6, fontSize: "9px", background: "#ef4444", color: "#fff", padding: "2px 6px", borderRadius: "6px", fontWeight: 700 }}>86'd</span>
                  )}
                  {lowStock && (
                    <span style={{ position: "absolute", top: 6, insetInlineStart: 6, fontSize: "9px", background: "#f97316", color: "#fff", padding: "2px 6px", borderRadius: "6px", fontWeight: 700 }}>{avail.remainingQty}</span>
                  )}
                  <span style={{ fontSize: "26px", lineHeight: 1, marginBottom: "8px", marginTop: isRecipeBlocked ? "8px" : "0" }}>{cc.icon}</span>
                  <span style={{
                    fontSize: "13px", fontWeight: 700, color: is86d ? "#4a5568" : "#e2e8f0",
                    lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden", marginBottom: "6px",
                  }}>
                    {isRtl ? (p.nameAr || p.name) : p.name}
                  </span>
                  <span style={{ fontSize: "15px", fontWeight: 800, color: is86d ? "#4a5568" : cc.text }}>
                    {parseFloat(p.price || 0).toFixed(2)}
                    <span style={{ fontSize: "10px", fontWeight: 500, opacity: 0.7 }}> د.إ</span>
                  </span>
                </button>
              );
            })}
          </div>
          {filteredProducts.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#4a5568", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "40px" }}>🔍</span>
              <span style={{ fontSize: "14px" }}>{isRtl ? "لا توجد منتجات" : "No products"}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Order Panel ────────────────────────────────────────────────── */}
      <div style={{ width: "360px", flexShrink: 0, display: "flex", flexDirection: "column", background: "#161b27", borderInlineStart: "1px solid #1e2535" }}>

        {/* Tab switcher */}
        <div style={{ display: "flex", background: "#0f1117", borderBottom: "1px solid #1e2535" }}>
          <button onClick={() => setRightTab("order")}
            style={{
              flex: 1, padding: "12px 0", fontSize: "12px", fontWeight: 700, border: "none",
              background: rightTab === "order" ? "#161b27" : "transparent",
              color: rightTab === "order" ? "#60a5fa" : "#64748b",
              borderBottom: rightTab === "order" ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}>
            <ShoppingCart size={13} />
            {isRtl ? "الطلب الحالي" : "Current Order"}
          </button>
          <button onClick={() => { setRightTab("orders"); refetchOrders(); }}
            style={{
              flex: 1, padding: "12px 0", fontSize: "12px", fontWeight: 700, border: "none",
              background: rightTab === "orders" ? "#161b27" : "transparent",
              color: rightTab === "orders" ? "#60a5fa" : "#64748b",
              borderBottom: rightTab === "orders" ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            }}>
            <Receipt size={13} />
            {isRtl ? "الطلبات" : "Orders"}
            {(() => {
              const pending = (todayOrders as any[]).filter(o =>
                ["sent_to_kitchen","partially_ready","ready","served"].includes(o.status)
              ).length;
              return pending > 0 ? (
                <span style={{ background: "#f97316", color: "#fff", fontSize: "9px", fontWeight: 700, width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>{pending}</span>
              ) : null;
            })()}
          </button>
        </div>
        {rightTab === "order" ? (<>
        {/* Order header */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e2535", background: "#0f1117" }}>

          {orderType === "dine_in" && !selectedTableId && !activeOrderId && (
            <button onClick={() => setShowTablePicker(true)}
              style={{ width: "100%", background: "#92400e", color: "#fff", border: "none", borderRadius: "12px", padding: "12px", fontSize: "14px", fontWeight: 700, cursor: "pointer", marginBottom: "8px", animation: "pulse 2s infinite" }}>
              🪑 {isRtl ? "اختر الطاولة أولاً" : "Select Table First"}
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ShoppingCart size={16} style={{ color: "#60a5fa" }} />
              <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "14px" }}>
                {activeOrder ? activeOrder.orderNumber : (isRtl ? "طلب جديد" : "New Order")}
              </span>
              {activeOrder?.status && (
                <span style={{
                  fontSize: "10px", padding: "2px 8px", borderRadius: "20px", fontWeight: 700,
                  background: activeOrder.status === "ready" ? "#064e3b" : kitchenSent ? "#451a03" : "#1e2535",
                  color: activeOrder.status === "ready" ? "#34d399" : kitchenSent ? "#fb923c" : "#64748b",
                }}>
                  {activeOrder.status === "sent_to_kitchen" ? "🍳 في المطبخ" :
                   activeOrder.status === "ready" ? "✅ جاهز" :
                   activeOrder.status === "draft" ? "مسودة" : activeOrder.status}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {activeOrderId && activeOrder?.orderType === "dine_in" && (
                <button onClick={() => setShowTransferDialog(true)}
                  style={{ background: "#2d1b69", border: "none", borderRadius: "8px", padding: "5px", cursor: "pointer", color: "#a78bfa" }}
                  title="نقل الطاولة">
                  <ArrowLeftRight size={13} />
                </button>
              )}
              {activeOrderId && (
                <button onClick={() => cancelOrderMut.mutate({ orderId: activeOrderId })}
                  style={{ background: "#2d0a0a", border: "none", borderRadius: "8px", padding: "5px", cursor: "pointer", color: "#f87171" }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
            {orderType === "dine_in" && (
              <button onClick={() => !kitchenSent && setShowTablePicker(true)} disabled={!!kitchenSent}
                style={{
                  display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700,
                  padding: "4px 10px", borderRadius: "8px", border: "none", cursor: kitchenSent ? "default" : "pointer",
                  background: selectedTableId ? "#1e3a5f" : "#451a03",
                  color: selectedTableId ? "#60a5fa" : "#fb923c",
                }}>
                🪑 {selectedTableId
                  ? (tables as any[]).find((t: any) => t.id === selectedTableId)?.label || `T${(tables as any[]).find((t: any) => t.id === selectedTableId)?.tableNumber}`
                  : "لا طاولة"}
              </button>
            )}
            {activeOrderId && (
              <input value={waiterName} onChange={e => setWaiterName(e.target.value)}
                onBlur={() => waiterName.trim() && setWaiterMut.mutate({ orderId: activeOrderId, waiterName: waiterName.trim() })}
                placeholder="👤 ويتر..."
                style={{ flex: 1, background: "#1e2535", border: "1px solid #2d3748", borderRadius: "8px", color: "#e2e8f0", fontSize: "11px", padding: "5px 8px", outline: "none" }} />
            )}
          </div>
        </div>

        {/* Order items */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {orderItems.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "160px", color: "#2d3748", gap: "8px" }}>
              <ShoppingCart size={40} />
              <p style={{ fontSize: "13px", color: "#4a5568" }}>{isRtl ? "اضغط على منتج للإضافة" : "Tap a product to add"}</p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {orderItems.map((item: any) => {
                const isVoided = item.isVoided;
                const isSentToKitchen = activeOrder?.status !== "draft";
                const mods: string[] = item.modifiers ?? [];
                return (
                <li key={item.id} style={{
                  padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: "8px",
                  borderBottom: "1px solid #1e2535", opacity: isVoided ? 0.4 : 1,
                  textDecoration: isVoided ? "line-through" : "none",
                  background: isVoided ? "#1a0a0a" : "transparent",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", margin: 0 }}>
                        {isRtl ? (item.productNameAr || item.productName) : item.productName}
                      </p>
                      {isSentToKitchen && !isVoided && (
                        <span style={{
                          fontSize: "9px", padding: "2px 6px", borderRadius: "8px", fontWeight: 700,
                          background: item.status === "ready" ? "#064e3b" : item.status === "preparing" ? "#451a03" : "#1e2535",
                          color: item.status === "ready" ? "#34d399" : item.status === "preparing" ? "#fb923c" : "#64748b",
                        }}>
                          {item.status === "ready" ? "✓ جاهز" : item.status === "preparing" ? "⏳ يُحضَّر" : "🕐"}
                        </span>
                      )}
                    </div>
                    {mods.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "3px" }}>
                        {mods.map((m: string) => (
                          <span key={m} style={{ fontSize: "9px", padding: "2px 6px", background: "#451a03", color: "#fb923c", borderRadius: "8px" }}>{m}</span>
                        ))}
                      </div>
                    )}
                    {item.notes && <p style={{ fontSize: "11px", color: "#f59e0b", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.notes}</p>}
                    <p style={{ fontSize: "11px", color: "#475569", margin: "2px 0 0" }}>{item.unitPrice.toFixed(2)} × {item.quantity}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                      <button onClick={() => handleQtyChange(item.id, -1, item.quantity)} disabled={isVoided || isSentToKitchen}
                        style={{ width: 24, height: 24, borderRadius: "50%", background: "#1e2535", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: (isVoided || isSentToKitchen) ? 0.3 : 1 }}>
                        <Minus size={11} />
                      </button>
                      <span style={{ width: 20, textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#e2e8f0" }}>{item.quantity}</span>
                      <button onClick={() => handleQtyChange(item.id, 1, item.quantity)} disabled={isVoided || isSentToKitchen}
                        style={{ width: 24, height: 24, borderRadius: "50%", background: "#1e2535", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: (isVoided || isSentToKitchen) ? 0.3 : 1 }}>
                        <Plus size={11} />
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "3px" }}>
                      <button onClick={() => { setShowModifierDialog(item); setSelectedModifiers(item.modifiers ?? []); setItemNote(item.notes ?? ""); }}
                        style={{ width: 20, height: 20, borderRadius: "5px", background: "#451a03", border: "none", color: "#fb923c", cursor: "pointer", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>✎</button>
                      {isSentToKitchen && !isVoided && (
                        <button onClick={() => setVoidItemTarget(item)}
                          style={{ width: 20, height: 20, borderRadius: "5px", background: "#2d0a0a", border: "none", color: "#f87171", cursor: "pointer", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#60a5fa", minWidth: "44px", textAlign: "end" }}>
                    {item.totalPrice.toFixed(2)}
                  </span>
                </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Discount */}
        {activeOrderId && (
          <div style={{ padding: "8px 12px", borderTop: "1px solid #1e2535", background: "#0f1117" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Tag size={13} style={{ color: "#475569" }} />
              <span style={{ fontSize: "11px", color: "#64748b" }}>{isRtl ? "خصم:" : "Discount:"}</span>
              <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid #2d3748" }}>
                <button onClick={() => setDiscountType("percentage")}
                  style={{ padding: "4px 8px", background: discountType === "percentage" ? "#2563eb" : "#1e2535", border: "none", cursor: "pointer", color: discountType === "percentage" ? "#fff" : "#64748b" }}>
                  <Percent size={11} />
                </button>
                <button onClick={() => setDiscountType("fixed")}
                  style={{ padding: "4px 8px", background: discountType === "fixed" ? "#2563eb" : "#1e2535", border: "none", cursor: "pointer", color: discountType === "fixed" ? "#fff" : "#64748b" }}>
                  <Hash size={11} />
                </button>
              </div>
              <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                placeholder={discountType === "percentage" ? "10%" : "10"}
                style={{ flex: 1, background: "#1e2535", border: "1px solid #2d3748", borderRadius: "8px", color: "#e2e8f0", fontSize: "12px", padding: "4px 8px", outline: "none", minWidth: 0 }} />
              <button onClick={handleApplyDiscount}
                style={{ background: "#2563eb", border: "none", borderRadius: "8px", color: "#fff", fontSize: "11px", padding: "4px 10px", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                {isRtl ? "تطبيق" : "Apply"}
              </button>
            </div>
          </div>
        )}

        {/* Totals */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1e2535", background: "#0f1117" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
            <span>{isRtl ? "المجموع" : "Subtotal"}</span>
            <span>{subtotal.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#34d399", marginBottom: "4px" }}>
              <span>{isRtl ? "الخصم" : "Discount"}</span>
              <span>- {discountAmount.toFixed(2)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#64748b", marginBottom: "4px" }}>
              <span>{isRtl ? "الضريبة" : "Tax"}</span>
              <span>{taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #1e2535", paddingTop: "8px", marginTop: "4px" }}>
            <span style={{ fontSize: "16px", fontWeight: 800, color: "#e2e8f0" }}>{isRtl ? "الإجمالي" : "TOTAL"}</span>
            <span style={{ fontSize: "20px", fontWeight: 900, color: "#60a5fa" }}>{total.toFixed(2)} <span style={{ fontSize: "12px", fontWeight: 500, color: "#475569" }}>د.إ</span></span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid #1e2535", background: "#0f1117" }}>
          <button
            onClick={() => {
              if (!activeOrderId) return;
              if (orderType === "delivery" || orderType === "takeaway") {
                setDeliveryForm({
                  customerName: activeOrder?.customerName ?? "",
                  customerPhone: activeOrder?.customerPhone ?? "",
                  customerArea: activeOrder?.customerArea ?? "",
                  customerBuilding: activeOrder?.customerBuilding ?? "",
                  customerFloor: activeOrder?.customerFloor ?? "",
                  customerApartment: activeOrder?.customerApartment ?? "",
                  deliveryNotes: activeOrder?.deliveryNotes ?? "",
                  pickupTime: "",
                });
                setCustomerSearchResults([]);
                setShowDeliveryDialog(true);
              } else {
                sendKitchenMut.mutate({ orderId: activeOrderId });
              }
            }}
            disabled={!activeOrderId || orderItems.length === 0 || kitchenSent}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "12px", borderRadius: "14px", border: "none", fontSize: "14px", fontWeight: 700,
              background: (!activeOrderId || orderItems.length === 0 || kitchenSent) ? "#1e2535" : "#c2410c",
              color: (!activeOrderId || orderItems.length === 0 || kitchenSent) ? "#4a5568" : "#fff",
              cursor: (!activeOrderId || orderItems.length === 0 || kitchenSent) ? "not-allowed" : "pointer",
            }}>
            <UtensilsCrossed size={16} />
            {kitchenSent ? (isRtl ? "✓ تم الإرسال للمطبخ" : "✓ Sent to Kitchen") : (isRtl ? "إرسال للمطبخ" : "Send to Kitchen")}
          </button>

          <button
            onClick={() => setShowPayDialog(true)}
            disabled={!activeOrderId || orderItems.length === 0 || total <= 0}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "16px", borderRadius: "14px", border: "none", fontSize: "16px", fontWeight: 800,
              background: (!activeOrderId || orderItems.length === 0 || total <= 0) ? "#1e2535" : "#1d4ed8",
              color: (!activeOrderId || orderItems.length === 0 || total <= 0) ? "#4a5568" : "#fff",
              cursor: (!activeOrderId || orderItems.length === 0 || total <= 0) ? "not-allowed" : "pointer",
              boxShadow: (!activeOrderId || orderItems.length === 0 || total <= 0) ? "none" : "0 4px 20px #1d4ed840",
            }}>
            <CreditCard size={18} />
            {isRtl ? `دفع  ${total.toFixed(2)} د.إ` : `Pay  ${total.toFixed(2)} AED`}
          </button>

          <button onClick={() => setShowReturnDialog(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "9px", borderRadius: "12px", background: "transparent", border: "1px solid #2d0a0a", color: "#f87171", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
            <RotateCcw size={13} />
            {isRtl ? "استرداد / إرجاع" : "Return / Refund"}
          </button>
        </div>
      </>) : (

        /* ── Orders Board Tab ──────────────────────────────────────────────────── */
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* زر طلب جديد */}
          <div style={{ padding: "10px 12px", position: "sticky", top: 0, background: "#0f1117", zIndex: 10, borderBottom: "1px solid #1e2535" }}>
            <button onClick={() => { newOrder(); setRightTab("order"); }}
              style={{ width: "100%", background: "#1d4ed8", border: "none", borderRadius: "12px", color: "#fff", fontSize: "13px", fontWeight: 700, padding: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Plus size={15} />
              {isRtl ? "طلب جديد" : "New Order"}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
          {(() => {
            const orders = todayOrders as any[];
            const kitchen = orders.filter(o => ["sent_to_kitchen","partially_ready","ready","served"].includes(o.status));
            const paid    = orders.filter(o => o.status === "paid");
            const cancelled = orders.filter(o => ["cancelled","refunded"].includes(o.status));

            const STATUS_CFG: Record<string, { label: string; dotColor: string; cardBg: string; cardBorder: string }> = {
              sent_to_kitchen: { label: "🍳 في المطبخ",    dotColor: "#fbbf24", cardBg: "#1c1400", cardBorder: "#451a03" },
              partially_ready: { label: "⏳ يُحضَّر بعضه", dotColor: "#f97316", cardBg: "#1c0e00", cardBorder: "#7c2d12" },
              ready:           { label: "✅ جاهز",          dotColor: "#34d399", cardBg: "#001a0d", cardBorder: "#065f46" },
              served:          { label: "🍽 قُدِّم",        dotColor: "#60a5fa", cardBg: "#00101a", cardBorder: "#1e3a5f" },
              paid:            { label: "💰 مدفوع",         dotColor: "#94a3b8", cardBg: "#111827", cardBorder: "#1e2535" },
              cancelled:       { label: "❌ ملغي",          dotColor: "#f87171", cardBg: "#1a0000", cardBorder: "#450a0a" },
              refunded:        { label: "↩ مسترد",         dotColor: "#c084fc", cardBg: "#0f001a", cardBorder: "#3b0764" },
            };

            function OrderCard({ order }: { order: any }) {
              const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.sent_to_kitchen;
              const readyCount  = (order.items ?? []).filter((i: any) => i.status === "ready" || i.status === "served").length;
              const totalItems  = (order.items ?? []).filter((i: any) => i.status !== "cancelled").length;
              const isClickable = !["paid","cancelled","refunded"].includes(order.status);

              return (
                <div
                  style={{ margin: "0 10px 8px", borderRadius: "12px", border: `1px solid ${cfg.cardBorder}`, padding: "10px 12px", cursor: isClickable ? "pointer" : "default", background: cfg.cardBg, opacity: isClickable ? 1 : 0.7 }}
                  onClick={() => {
                    if (!isClickable) return;
                    setActiveOrderId(order.id);
                    utils.pos.orders.get.fetch({ id: order.id }).then(setActiveOrder);
                    setRightTab("order");
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dotColor, flexShrink: 0, display: "block" }} />
                      <span style={{ fontWeight: 800, fontSize: "13px", color: "#e2e8f0" }}>{order.orderNumber}</span>
                      {order.tableLabel && (
                        <span style={{ fontSize: "10px", padding: "2px 6px", background: "#1e2535", borderRadius: "8px", color: "#94a3b8", border: "1px solid #2d3748" }}>
                          {order.tableLabel}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 700, color: cfg.dotColor }}>
                      {cfg.label}
                    </span>
                  </div>

                  {(order.items ?? []).filter((i: any) => i.status !== "cancelled").length > 0 && (
                    <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>
                      {(order.items ?? []).filter((i: any) => i.status !== "cancelled").slice(0, 3).map((item: any) => (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: item.status === "ready" ? "#34d399" : item.status === "preparing" ? "#fbbf24" : "#374151", flexShrink: 0, display: "block" }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.quantity}× {item.productNameAr || item.productName}</span>
                          {item.modifiers?.length > 0 && (
                            <span style={{ color: "#fb923c", flexShrink: 0 }}>({item.modifiers.join(", ")})</span>
                          )}
                        </div>
                      ))}
                      {(order.items ?? []).filter((i: any) => i.status !== "cancelled").length > 3 && (
                        <span style={{ color: "#4a5568" }}>+{(order.items ?? []).filter((i: any) => i.status !== "cancelled").length - 3} {isRtl ? "أخرى" : "more"}</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {!["paid","cancelled","refunded"].includes(order.status) && totalItems > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <div style={{ width: 56, height: 4, background: "#1e2535", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ width: `${(readyCount / totalItems) * 100}%`, height: "100%", background: "#34d399", borderRadius: "4px", transition: "width .3s" }} />
                          </div>
                          <span style={{ fontSize: "10px", color: "#64748b" }}>{readyCount}/{totalItems}</span>
                        </div>
                      )}
                      {order.waiterName && (
                        <span style={{ fontSize: "10px", color: "#475569" }}>👤 {order.waiterName}</span>
                      )}
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 800, color: "#60a5fa" }}>
                      {parseFloat(order.total ?? "0").toFixed(2)} <span style={{ fontSize: "10px", color: "#475569" }}>د.إ</span>
                    </span>
                  </div>

                  {order.status === "ready" && (
                    <button onClick={(e) => { e.stopPropagation(); setActiveOrderId(order.id); utils.pos.orders.get.fetch({ id: order.id }).then(setActiveOrder); setRightTab("order"); setShowPayDialog(true); }}
                      style={{ marginTop: "8px", width: "100%", background: "#065f46", border: "none", borderRadius: "10px", color: "#34d399", fontSize: "12px", fontWeight: 700, padding: "8px", cursor: "pointer" }}>
                      💰 {isRtl ? "ادفع الآن" : "Pay Now"}
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div style={{ paddingTop: "8px", paddingBottom: "8px" }}>
                {kitchen.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 14px 6px" }}>
                      🍳 {isRtl ? "في المطبخ / لم تدفع" : "In Kitchen / Unpaid"} ({kitchen.length})
                    </p>
                    {kitchen.map((o: any) => <OrderCard key={o.id} order={o} />)}
                  </div>
                )}

                {paid.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 14px 6px" }}>
                      💰 {isRtl ? "مدفوعة" : "Paid"} ({paid.length})
                    </p>
                    {paid.map((o: any) => <OrderCard key={o.id} order={o} />)}
                  </div>
                )}

                {cancelled.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 14px 6px" }}>
                      ❌ {isRtl ? "ملغية" : "Cancelled"} ({cancelled.length})
                    </p>
                    {cancelled.map((o: any) => <OrderCard key={o.id} order={o} />)}
                  </div>
                )}

                {orders.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", color: "#2d3748", gap: "8px" }}>
                    <Receipt size={36} />
                    <p style={{ fontSize: "13px", color: "#4a5568" }}>{isRtl ? "لا توجد طلبات اليوم" : "No orders today"}</p>
                  </div>
                )}
              </div>
            );
          })()}
          </div>
        </div>
      )}
      </div>

      {/* ── Pay Dialog (Enhanced) ─────────────────────────────────────────────── */}
      {showPayDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir={dir}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
              <CreditCard size={20} className="text-blue-600" />
              {isRtl ? "إتمام الدفع" : "Process Payment"}
            </h3>

            {/* Total */}
            <div className="text-center mb-4 bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-0.5">{isRtl ? "المبلغ المستحق" : "Amount Due"}</p>
              <p className="text-3xl font-bold text-blue-700">{total.toFixed(2)} {isRtl ? "درهم" : "AED"}</p>
              {tipAmount && parseFloat(tipAmount) > 0 && (
                <p className="text-xs text-emerald-600 mt-0.5">
                  + {isRtl ? "بقشيش:" : "Tip:"} {parseFloat(tipAmount).toFixed(2)} = {(total + parseFloat(tipAmount)).toFixed(2)}
                </p>
              )}
            </div>

            {/* Payment method */}
            <p className="text-xs text-gray-500 mb-1.5 font-medium">{isRtl ? "طريقة الدفع الأولى" : "Primary Payment"}</p>
            <div className="flex gap-2 mb-3">
              {PAY_METHODS.map((m) => (
                <button key={m.key} onClick={() => setPayMethod(m.key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    payMethod === m.key ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                  {m.icon}
                  {isRtl ? m.labelAr : m.labelEn}
                </button>
              ))}
            </div>

            {/* Cash input */}
            {payMethod === "cash" && (
              <div className="mb-3">
                <label className="text-xs text-gray-500 block mb-1">{isRtl ? "المبلغ المُعطى" : "Cash Received"}</label>
                <input type="number" value={cashPaid} onChange={(e) => setCashPaid(e.target.value)}
                  placeholder={total.toFixed(2)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
                  autoFocus />
                {cashPaid && parseFloat(cashPaid) >= total && (
                  <p className="text-center mt-1.5 text-sm font-bold text-green-600 bg-green-50 rounded-lg py-1">
                    {isRtl ? "الباقي:" : "Change:"} {(parseFloat(cashPaid) - total).toFixed(2)} {isRtl ? "درهم" : "AED"}
                  </p>
                )}
              </div>
            )}

            {/* Tip */}
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1 flex items-center gap-1">
                💝 {isRtl ? "بقشيش (اختياري)" : "Tip (optional)"}
              </label>
              <div className="flex gap-2 items-center">
                <input type="number" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="0.00" min="0"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                {[5, 10, 20].map(v => (
                  <button key={v} onClick={() => setTipAmount(String(v))}
                    className="px-2.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Payment */}
            <div className="mb-4 border border-dashed border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-medium mb-2">💳 {isRtl ? "دفع مختلط (اختياري)" : "Split Payment (optional)"}</p>
              <div className="flex gap-2 mb-2">
                {["", ...PAY_METHODS.map(m => m.key)].map((k) => (
                  <button key={k || "none"} onClick={() => setSplitPayMethod(k as any)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      splitPayMethod === k ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}>
                    {k === "" ? (isRtl ? "بدون" : "None") : PAY_METHODS.find(m=>m.key===k)?.[isRtl?"labelAr":"labelEn"]}
                  </button>
                ))}
              </div>
              {splitPayMethod && (
                <input type="number" value={splitPayAmount} onChange={(e) => setSplitPayAmount(e.target.value)}
                  placeholder={isRtl ? "المبلغ الثاني" : "Second amount"}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none" />
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowPayDialog(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50">
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
              <button onClick={handlePay}
                disabled={payMut.isPending || (payMethod === "cash" && cashPaid ? parseFloat(cashPaid) < total : false)}
                className="flex-[2] py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                {payMut.isPending ? "⏳" : "✓"} {isRtl ? "تأكيد الدفع" : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Return Dialog ─────────────────────────────────────────────────────── */}
      {showReturnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" dir={dir}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <RotateCcw size={20} className="text-red-600" />
              {isRtl ? "استرداد / إرجاع" : "Return / Refund"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{isRtl ? "رقم الطلب الأصلي" : "Original Order Number"}</label>
                <input
                  value={returnOrderNum}
                  onChange={(e) => setReturnOrderNum(e.target.value)}
                  placeholder="ORD-20240101-0001"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{isRtl ? "المبلغ المُسترد" : "Refund Amount"}</label>
                <input
                  type="number"
                  value={returnAmount}
                  onChange={(e) => setReturnAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{isRtl ? "سبب الاسترداد" : "Reason"}</label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowReturnDialog(false)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
              <button
                onClick={async () => {
                  // Find original order by number
                  const orders = await utils.pos.orders.listByDate.fetch({ date: new Date().toISOString().slice(0, 10) });
                  const orig = orders.find((o: any) => o.orderNumber === returnOrderNum);
                  if (!orig) { toast.error(isRtl ? "الطلب غير موجود" : "Order not found"); return; }
                  returnMut.mutate({
                    originalOrderId: orig.id,
                    reason: returnReason,
                    totalRefund: parseFloat(returnAmount) || 0,
                    refundMethod: "cash",
                  });
                }}
                disabled={!returnOrderNum || !returnAmount || returnMut.isPending}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {isRtl ? "تأكيد الاسترداد" : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Screen ────────────────────────────────────────────────────── */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir={dir}>
          <div className="bg-white rounded-3xl shadow-2xl p-10 text-center animate-in fade-in zoom-in">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={44} className="text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {isRtl ? "تم الدفع بنجاح ✓" : "Payment Successful ✓"}
            </h2>
            {payMethod === "cash" && lastChange > 0 && (
              <p className="text-lg font-semibold text-green-600 mt-2">
                {isRtl ? `الباقي: ${lastChange.toFixed(2)} درهم` : `Change: ${lastChange.toFixed(2)} AED`}
              </p>
            )}
            <p className="text-sm text-gray-400 mt-3">{isRtl ? "جاري إغلاق الحساب..." : "Closing order..."}</p>
          </div>
        </div>
      )}
      {/* ── Delivery Info Dialog ──────────────────────────────────────────────── */}
      {showDeliveryDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir={dir}>
          <div className={`bg-white rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto ${orderType === "takeaway" ? "w-[360px]" : "w-[440px]"}`}>
            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              {orderType === "takeaway" ? "🥡" : "🚗"} {isRtl ? (orderType === "takeaway" ? "بيانات التيك أواي" : "بيانات التوصيل") : (orderType === "takeaway" ? "Takeaway Info" : "Delivery Info")}
            </h3>
            <p className="text-xs text-gray-400 mb-4">{isRtl ? "يجب تعبئة البيانات قبل الإرسال للمطبخ" : "Required before sending to kitchen"}</p>

            {/* Phone — with auto-fill */}
            <div className="mb-3 relative">
              <label className="text-xs font-semibold text-gray-700 block mb-1">📱 {isRtl ? "رقم الموبايل *" : "Phone *"}</label>
              <input
                value={deliveryForm.customerPhone}
                onChange={(e) => {
                  const val = e.target.value;
                  setDeliveryForm(f => ({ ...f, customerPhone: val }));
                  // Auto-search after 0.5s
                  if (phoneSearchTimer) clearTimeout(phoneSearchTimer);
                  if (val.length >= 3) {
                    setPhoneSearchTimer(setTimeout(async () => {
                      const results = await utils.pos.customers.search.fetch({ phone: val });
                      setCustomerSearchResults(results as any[]);
                    }, 500));
                  } else {
                    setCustomerSearchResults([]);
                  }
                }}
                placeholder="05xxxxxxxx"
                dir="ltr"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {/* Auto-fill suggestions */}
              {customerSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                  {customerSearchResults.map((c: any) => (
                    <button key={c.id} onClick={() => {
                      setDeliveryForm({ customerName: c.name, customerPhone: c.phone, customerArea: c.area ?? "", customerBuilding: c.building ?? "", customerFloor: c.floor ?? "", customerApartment: c.apartment ?? "", deliveryNotes: "", pickupTime: "" });
                      setCustomerSearchResults([]);
                    }}
                      className="w-full text-start px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                      <p className="text-sm font-semibold text-gray-800">{c.name} — {c.phone}</p>
                      {c.area && <p className="text-xs text-gray-400">{c.area} {c.building ? `· ${c.building}` : ""}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Name */}
            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-700 block mb-1">👤 {isRtl ? "اسم العميل *" : "Customer Name *"}</label>
              <input value={deliveryForm.customerName} onChange={e => setDeliveryForm(f => ({ ...f, customerName: e.target.value }))}
                placeholder={isRtl ? "الاسم الكامل" : "Full name"}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>

            {/* Area + Building */}
            {/* حقول التوصيل فقط */}
            {orderType === "delivery" && (<>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">📍 {isRtl ? "المنطقة *" : "Area *"}</label>
                <input value={deliveryForm.customerArea} onChange={e => setDeliveryForm(f => ({ ...f, customerArea: e.target.value }))}
                  placeholder={isRtl ? "المنطقة" : "Area"}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">🏢 {isRtl ? "المبنى *" : "Building *"}</label>
                <input value={deliveryForm.customerBuilding} onChange={e => setDeliveryForm(f => ({ ...f, customerBuilding: e.target.value }))}
                  placeholder={isRtl ? "اسم/رقم المبنى" : "Building name/no."}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">🏗 {isRtl ? "الطابق" : "Floor"}</label>
                <input value={deliveryForm.customerFloor} onChange={e => setDeliveryForm(f => ({ ...f, customerFloor: e.target.value }))}
                  placeholder={isRtl ? "رقم الطابق" : "Floor no."}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">🚪 {isRtl ? "الشقة" : "Apartment"}</label>
                <input value={deliveryForm.customerApartment} onChange={e => setDeliveryForm(f => ({ ...f, customerApartment: e.target.value }))}
                  placeholder={isRtl ? "رقم الشقة" : "Apt no."}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-gray-700 block mb-1">📝 {isRtl ? "ملاحظات التوصيل" : "Delivery Notes"}</label>
              <textarea value={deliveryForm.deliveryNotes} onChange={e => setDeliveryForm(f => ({ ...f, deliveryNotes: e.target.value }))}
                placeholder={isRtl ? "مثال: رن الجرس مرتين، لا تتصل..." : "e.g. Ring twice, don't call..."}
                rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            </>)}

            {/* موعد الاستلام — للتيك أواي فقط */}
            {orderType === "takeaway" && (
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-700 block mb-1">⏰ {isRtl ? "موعد الاستلام" : "Pickup Time"}</label>
                <div className="grid grid-cols-2 gap-2">
                  {/* أزرار سريعة */}
                  {[
                    { label: isRtl ? "الآن" : "Now", value: isRtl ? "الآن" : "Now" },
                    { label: "15 دقيقة", value: "15 دقيقة" },
                    { label: "30 دقيقة", value: "30 دقيقة" },
                    { label: "45 دقيقة", value: "45 دقيقة" },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setDeliveryForm(f => ({ ...f, pickupTime: opt.value }))}
                      className={`py-2 rounded-xl text-sm font-semibold transition-colors border ${
                        deliveryForm.pickupTime === opt.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <input value={deliveryForm.pickupTime} onChange={e => setDeliveryForm(f => ({ ...f, pickupTime: e.target.value }))}
                  placeholder={isRtl ? "أو اكتب الوقت يدوياً..." : "Or type custom time..."}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 mt-2" />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setShowDeliveryDialog(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
              <button
                disabled={
                  !deliveryForm.customerName.trim() || !deliveryForm.customerPhone.trim() ||
                  (orderType === "delivery" && (!deliveryForm.customerArea.trim() || !deliveryForm.customerBuilding.trim())) ||
                  setDeliveryMut.isPending
                }
                onClick={async () => {
                  if (!activeOrderId) return;
                  // حفظ بيانات العميل للتوصيل فقط (التيك أواي اختياري)
                  let custId: number | undefined;
                  try {
                    custId = await upsertCustomerMut.mutateAsync({
                      name: deliveryForm.customerName.trim(),
                      phone: deliveryForm.customerPhone.trim(),
                      area: deliveryForm.customerArea.trim() || undefined,
                      building: deliveryForm.customerBuilding.trim() || undefined,
                      floor: deliveryForm.customerFloor.trim() || undefined,
                      apartment: deliveryForm.customerApartment.trim() || undefined,
                    }) as number;
                  } catch {}
                  const notes = orderType === "takeaway"
                    ? (deliveryForm.pickupTime ? `استلام: ${deliveryForm.pickupTime}` : undefined)
                    : (deliveryForm.deliveryNotes.trim() || undefined);
                  setDeliveryMut.mutate({
                    orderId: activeOrderId,
                    customerName: deliveryForm.customerName.trim(),
                    customerPhone: deliveryForm.customerPhone.trim(),
                    customerArea: deliveryForm.customerArea.trim() || "تيك أواي",
                    customerBuilding: deliveryForm.customerBuilding.trim() || "-",
                    customerFloor: deliveryForm.customerFloor.trim() || undefined,
                    customerApartment: deliveryForm.customerApartment.trim() || undefined,
                    deliveryNotes: notes,
                    customerId: custId || undefined,
                  });
                }}
                className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                {setDeliveryMut.isPending ? "⏳" : (orderType === "takeaway" ? "🥡" : "🚗")}
                {isRtl ? "حفظ وإرسال للمطبخ" : "Save & Send to Kitchen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table Picker Dialog ──────────────────────────────────────────────── */}
      {showTablePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir={dir}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[480px] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                🪑 {isRtl ? "اختر الطاولة" : "Select Table"}
              </h3>
              <button onClick={() => setShowTableManager(true)} className="text-xs text-blue-600 hover:underline">
                + {isRtl ? "إضافة طاولة" : "Add Table"}
              </button>
            </div>

            {/* Section filter */}
            {(() => {
              const sections = Array.from(new Set((tables as any[]).map((t: any) => t.section).filter(Boolean)));
              return sections.length > 0 ? (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {sections.map((s: string) => (
                    <span key={s} className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">{s}</span>
                  ))}
                </div>
              ) : null;
            })()}

            <div className="grid grid-cols-4 gap-3 overflow-y-auto flex-1">
              {(tables as any[]).length === 0 ? (
                <div className="col-span-4 text-center py-12 text-gray-400">
                  <p className="text-sm">{isRtl ? "لا توجد طاولات — أضف من ⚙️ إدارة الطاولات" : "No tables — add from ⚙️ Manage Tables"}</p>
                </div>
              ) : (tables as any[]).map((tb: any) => {
                // طاولة مشغولة = عليها أوردر غير مدفوع (وليست الأوردر الحالي للتعديل)
                const hasUnpaidOrder = tb.status === "occupied" && tb.activeOrder;
                const isCurrentOrder = tb.activeOrder?.orderId === activeOrderId;
                const isOccupied = hasUnpaidOrder && !isCurrentOrder;
                const isSelected = selectedTableId === tb.id;
                return (
                  <button
                    key={tb.id}
                    disabled={isOccupied}
                    onClick={() => { setSelectedTableId(tb.id); setShowTablePicker(false); }}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 border-2 transition-all font-semibold text-sm relative ${
                      isSelected ? "bg-blue-600 border-blue-600 text-white shadow-lg scale-105" :
                      isOccupied ? "bg-red-100 border-red-300 text-red-500 cursor-not-allowed" :
                      "bg-green-50 border-green-300 text-green-700 hover:bg-green-100 hover:shadow-md"
                    }`}
                  >
                    <span className="text-2xl">{isOccupied ? "🔴" : isSelected ? "✓" : "🟢"}</span>
                    <span className="text-xs font-bold">{tb.label || `T${tb.tableNumber}`}</span>
                    {tb.capacity && <span className="text-[10px] opacity-70">{tb.capacity} 👤</span>}
                    {isOccupied && tb.activeOrder && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-100/90 rounded-xl">
                        <span className="text-lg">🔴</span>
                        <span className="text-[9px] font-bold text-red-600 text-center px-1">{tb.activeOrder.orderNumber}</span>
                        <span className="text-[8px] text-red-500">{isRtl ? "مشغولة" : "Occupied"}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button onClick={() => setShowTablePicker(false)}
              className="mt-4 w-full py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
              {isRtl ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* ── Table Manager Dialog ──────────────────────────────────────────────── */}
      {showTableManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" dir={dir}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[520px] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">⚙️ {isRtl ? "إدارة الطاولات" : "Manage Tables"}</h3>
              <button onClick={() => setShowTableManager(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {/* Add new table form */}
            <div className="bg-blue-50 rounded-xl p-3 mb-4 border border-blue-200">
              <p className="text-xs font-semibold text-blue-700 mb-2">➕ {isRtl ? "إضافة طاولة جديدة" : "Add New Table"}</p>
              <div className="grid grid-cols-4 gap-2">
                <input value={newTableNum} onChange={e => setNewTableNum(e.target.value)}
                  placeholder={isRtl ? "رقم *" : "No. *"}
                  className="col-span-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input value={newTableLabel} onChange={e => setNewTableLabel(e.target.value)}
                  placeholder={isRtl ? "اسم (مثال: طاولة VIP)" : "Label (e.g. VIP)"}
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input value={newTableCapacity} onChange={e => setNewTableCapacity(e.target.value)}
                  placeholder={isRtl ? "سعة" : "Cap"} type="number" min="1"
                  className="col-span-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input value={newTableSection} onChange={e => setNewTableSection(e.target.value)}
                  placeholder={isRtl ? "القسم (داخلي/خارجي...)" : "Section (Indoor/Outdoor...)"}
                  className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <button
                  onClick={() => newTableNum.trim() && createTableMut.mutate({ tableNumber: newTableNum.trim(), label: newTableLabel.trim() || undefined, capacity: parseInt(newTableCapacity) || 4, section: newTableSection.trim() || undefined })}
                  disabled={!newTableNum.trim() || createTableMut.isPending}
                  className="col-span-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors">
                  {isRtl ? "إضافة" : "Add"}
                </button>
              </div>
            </div>

            {/* Tables list */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {(tables as any[]).length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{isRtl ? "لا توجد طاولات بعد" : "No tables yet"}</p>
              ) : (tables as any[]).map((tb: any) => (
                <div key={tb.id} className={`flex items-center gap-3 p-3 rounded-xl border ${tb.status === "occupied" ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
                  <span className="text-lg">{tb.status === "occupied" ? "🔴" : "🟢"}</span>
                  {editTableTarget?.id === tb.id ? (
                    // Edit mode
                    <div className="flex-1 grid grid-cols-3 gap-1.5">
                      <input defaultValue={editTableTarget.label || editTableTarget.tableNumber}
                        onChange={e => setEditTableTarget((p: any) => ({...p, label: e.target.value}))}
                        className="col-span-1 border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                      <input defaultValue={editTableTarget.capacity} type="number"
                        onChange={e => setEditTableTarget((p: any) => ({...p, capacity: parseInt(e.target.value)}))}
                        placeholder="سعة" className="border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                      <input defaultValue={editTableTarget.section || ""}
                        onChange={e => setEditTableTarget((p: any) => ({...p, section: e.target.value}))}
                        placeholder="قسم" className="border border-blue-300 rounded-lg px-2 py-1 text-xs focus:outline-none" />
                      <button onClick={() => updateTableMut.mutate({ id: tb.id, label: editTableTarget.label, capacity: editTableTarget.capacity, section: editTableTarget.section || undefined })}
                        className="col-span-2 bg-green-600 text-white text-xs rounded-lg py-1 font-bold">✓ {isRtl ? "حفظ" : "Save"}</button>
                      <button onClick={() => setEditTableTarget(null)} className="bg-gray-200 text-gray-600 text-xs rounded-lg py-1">✕</button>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-800">{tb.label || `طاولة ${tb.tableNumber}`}</p>
                      <p className="text-[11px] text-gray-400">
                        #{tb.tableNumber} {tb.capacity ? `· ${tb.capacity} 👤` : ""} {tb.section ? `· ${tb.section}` : ""}
                        {tb.status === "occupied" && tb.activeOrder ? ` · ${tb.activeOrder.orderNumber}` : ""}
                      </p>
                    </div>
                  )}
                  {editTableTarget?.id !== tb.id && (
                    <div className="flex gap-1">
                      <button onClick={() => setEditTableTarget(tb)}
                        className="w-7 h-7 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg flex items-center justify-center text-xs transition-colors">✎</button>
                      <button onClick={() => { if (tb.status !== "occupied" && confirm(isRtl ? `حذف "${tb.label || tb.tableNumber}"؟` : `Delete "${tb.label || tb.tableNumber}"?`)) deleteTableMut.mutate({ id: tb.id }); }}
                        disabled={tb.status === "occupied"}
                        className="w-7 h-7 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg flex items-center justify-center text-xs transition-colors disabled:opacity-30">✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => setShowTableManager(false)}
              className="mt-4 w-full py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
              {isRtl ? "إغلاق" : "Close"}
            </button>
          </div>
        </div>
      )}

      {/* ── Modifier Dialog ──────────────────────────────────────────────────── */}
      {showModifierDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" dir={dir}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-80">
            <h3 className="text-base font-bold text-gray-900 mb-3">
              ✎ {isRtl ? "تخصيص الصنف" : "Customize Item"}
            </h3>
            <p className="text-sm text-gray-500 mb-3">{showModifierDialog.productNameAr || showModifierDialog.productName}</p>

            {/* Quick modifiers */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                "بدون بصل", "حار", "خفيف الحرارة", "وسط", "ويل دان", "ميديم",
                "بدون ثوم", "بدون جبن", "إضافي ساوس", "صغير", "كبير", "عادي"
              ].map(mod => (
                <button key={mod} onClick={() => setSelectedModifiers(prev =>
                  prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
                )}
                  className={`text-[11px] px-2 py-1.5 rounded-lg border font-medium transition-colors ${
                    selectedModifiers.includes(mod)
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-amber-50"
                  }`}>
                  {mod}
                </button>
              ))}
            </div>

            <textarea value={itemNote} onChange={(e) => setItemNote(e.target.value)}
              placeholder={isRtl ? "ملاحظة خاصة..." : "Special note..."}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 mb-3" />

            <div className="flex gap-2">
              <button onClick={() => { setShowModifierDialog(null); setSelectedModifiers([]); setItemNote(""); }}
                className="flex-1 py-2 rounded-xl border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50">
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
              <button onClick={() => setModifiersMut.mutate({ itemId: showModifierDialog.id, modifiers: selectedModifiers, notes: itemNote || undefined })}
                disabled={setModifiersMut.isPending}
                className="flex-[2] py-2 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600">
                {isRtl ? "حفظ" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Void Item Dialog ──────────────────────────────────────────────────── */}
      {voidItemTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" dir={dir}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-80">
            <h3 className="text-base font-bold text-red-700 mb-2 flex items-center gap-2">
              <AlertTriangle size={18} /> {isRtl ? "إلغاء البند (Void)" : "Void Item"}
            </h3>
            <p className="text-sm text-gray-600 mb-1">{voidItemTarget.productNameAr || voidItemTarget.productName}</p>
            <p className="text-xs text-gray-400 mb-3">{isRtl ? "تم إرساله للمطبخ — يجب تسجيل السبب" : "Already sent to kitchen — reason required"}</p>

            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {["خطأ في الطلب", "تغيير رأي الزبون", "خطأ مطبخ", "نفد الصنف", "سبب آخر"].map(r => (
                <button key={r} onClick={() => setVoidReason(r)}
                  className={`text-xs px-2 py-2 rounded-lg border font-medium transition-colors ${
                    voidReason === r ? "bg-red-500 text-white border-red-500" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-red-50"
                  }`}>
                  {r}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setVoidItemTarget(null); setVoidReason(""); }}
                className="flex-1 py-2 rounded-xl border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
              <button onClick={() => voidReason && voidItemMut.mutate({ itemId: voidItemTarget.id, reason: voidReason })}
                disabled={!voidReason || voidItemMut.isPending}
                className="flex-[2] py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                {isRtl ? "تأكيد الإلغاء" : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer Table Dialog ──────────────────────────────────────────────── */}
      {showTransferDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" dir={dir}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-72">
            <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <ArrowLeftRight size={18} className="text-purple-600" />
              {isRtl ? "نقل الطاولة" : "Transfer Table"}
            </h3>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {(tables as any[]).filter((tb: any) => tb.id !== selectedTableId).map((tb: any) => (
                <button key={tb.id} onClick={() => { transferTableMut.mutate({ orderId: activeOrderId!, newTableId: tb.id }); setSelectedTableId(tb.id); }}
                  disabled={tb.status === "occupied" || transferTableMut.isPending}
                  className={`w-full text-start px-3 py-2 rounded-xl border text-sm font-medium flex items-center justify-between transition-colors ${
                    tb.status === "occupied" ? "opacity-40 cursor-not-allowed border-gray-200" : "border-purple-200 hover:bg-purple-50 text-purple-700"
                  }`}>
                  <span>{tb.label || `T${tb.tableNumber}`}</span>
                  <span className="text-xs">{tb.status === "occupied" ? (isRtl ? "مشغولة" : "Busy") : (isRtl ? "متاحة ✓" : "Free ✓")}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowTransferDialog(false)}
              className="mt-3 w-full py-2 rounded-xl border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
              {isRtl ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
