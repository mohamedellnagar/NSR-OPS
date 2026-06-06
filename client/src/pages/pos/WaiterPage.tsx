/**
 * Waiter Interface — dark theme, matches CashierPage
 * Floor map → tap table → manage order → send to kitchen → mark served
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  UtensilsCrossed, Plus, Minus, X, Send, CheckCircle2,
  Search, Users, ArrowRight, ArrowLeft, RefreshCw,
  Clock, ChevronRight, Utensils, Bell,
} from "lucide-react";

// ── Category colours (same palette as CashierPage) ──────────────────────────
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

// ── Table status colours ─────────────────────────────────────────────────────
const TABLE_STATUS = {
  available: { bg: "#001a0d", border: "#065f46", dot: "#34d399", label: "متاحة" },
  occupied:  { bg: "#1a0a00", border: "#7c2d12", dot: "#fb923c", label: "مشغولة" },
  reserved:  { bg: "#0f0f00", border: "#713f12", dot: "#facc15", label: "محجوزة" },
};

// ── Kitchen status badges ─────────────────────────────────────────────────────
const KITCHEN_STATUS = {
  draft:           { bg: "#1e2535", color: "#64748b", label: "مسودة" },
  sent_to_kitchen: { bg: "#451a03", color: "#fb923c", label: "🍳 في المطبخ" },
  partially_ready: { bg: "#422006", color: "#fbbf24", label: "⏳ جزئياً" },
  ready:           { bg: "#064e3b", color: "#34d399", label: "✅ جاهز" },
  served:          { bg: "#1e3a5f", color: "#60a5fa", label: "🍽 قُدِّم" },
};

type Screen = "floor" | "order";

function elapsed(isoStr?: string) {
  if (!isoStr) return null;
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}د`;
  return `${Math.floor(mins / 60)}س ${mins % 60}د`;
}

export default function WaiterPage() {
  const { dir } = useLanguage();
  const isRtl = dir === "rtl";
  const utils = trpc.useUtils();

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: tables = [], refetch: refetchTables } = trpc.pos.tables.list.useQuery(undefined, {
    refetchInterval: 12000,
  });
  const { data: products = [] } = trpc.products.list.useQuery({ isActive: true });
  const { data: blockedIds = [] } = trpc.pos.kitchen.blockedProducts.useQuery(undefined, { refetchInterval: 20000 });
  const blockedSet = useMemo(() => new Set(blockedIds as number[]), [blockedIds]);

  // categories from products (same approach as CashierPage)
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

  // ── State ─────────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>("floor");
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [filterSection, setFilterSection] = useState("all");
  const [noteTarget, setNoteTarget] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createOrderMut = trpc.pos.orders.create.useMutation({
    onSuccess: async (data) => {
      setActiveOrderId(data.id);
      const order = await utils.pos.orders.get.fetch({ id: data.id });
      setActiveOrder(order);
    },
  });

  const addItemMut = trpc.pos.orders.addItem.useMutation({
    onSuccess: async () => {
      if (!activeOrderId) return;
      const order = await utils.pos.orders.get.fetch({ id: activeOrderId });
      setActiveOrder(order);
    },
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

  const sendKitchenMut = trpc.pos.orders.sendToKitchen.useMutation({
    onSuccess: async () => {
      toast.success("تم الإرسال للمطبخ 🍳");
      refetchTables();
      if (!activeOrderId) return;
      const order = await utils.pos.orders.get.fetch({ id: activeOrderId });
      setActiveOrder(order);
    },
    onError: (e) => toast.error(e.message),
  });

  const markServedMut = trpc.pos.orders.markServed.useMutation({
    onSuccess: async () => {
      toast.success("تم تقديم الطلب ✓");
      refetchTables();
      if (!activeOrderId) return;
      const order = await utils.pos.orders.get.fetch({ id: activeOrderId });
      setActiveOrder(order);
    },
  });

  const clearTableMut = trpc.pos.tables.clear.useMutation({
    onSuccess: () => {
      toast.success("تم تفريغ الطاولة ✓");
      refetchTables();
      setScreen("floor");
      setSelectedTable(null);
      setActiveOrder(null);
      setActiveOrderId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelOrderMut = trpc.pos.orders.cancel.useMutation({
    onSuccess: async () => {
      toast.success("تم إغلاق الطلب ✓");
      refetchTables();
      setActiveOrder(null);
      setActiveOrderId(null);
      setScreen("floor");
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function openTable(table: any) {
    setSelectedTable(table);
    setScreen("order");
    setSearch("");
    setSelectedCategory("all");
    if (table.activeOrder) {
      const order = await utils.pos.orders.get.fetch({ id: table.activeOrder.orderId });
      setActiveOrderId(table.activeOrder.orderId);
      setActiveOrder(order);
    } else {
      setActiveOrderId(null);
      setActiveOrder(null);
    }
  }

  async function ensureOrder() {
    if (activeOrderId) return activeOrderId;
    const res = await createOrderMut.mutateAsync({
      orderType: "dine_in",
      tableId: selectedTable?.id,
      guestCount: 1,
    });
    return res.id;
  }

  async function handleAddProduct(product: any) {
    const oid = await ensureOrder();
    addItemMut.mutate({ orderId: oid, productId: product.id, quantity: 1, notes: undefined });
  }

  function handleQty(itemId: number, delta: number, currentQty: number) {
    if (currentQty + delta <= 0) cancelItemMut.mutate({ itemId });
    else updateItemMut.mutate({ itemId, quantity: currentQty + delta });
  }

  function saveNote(itemId: number) {
    updateItemMut.mutate({ itemId, notes: noteText });
    setNoteTarget(null);
    setNoteText("");
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refetchTables();
    setTimeout(() => setRefreshing(false), 600);
  }

  const sections = Array.from(new Set((tables as any[]).map((t: any) => t.section).filter(Boolean)));
  const filteredTables = filterSection === "all"
    ? (tables as any[])
    : (tables as any[]).filter((t: any) => t.section === filterSection);

  const orderItems: any[] = activeOrder?.items ?? [];
  const kitchenSent = ["sent_to_kitchen", "partially_ready", "ready", "served"].includes(activeOrder?.status);
  const isReady = ["ready", "partially_ready"].includes(activeOrder?.status);
  // أصناف جديدة أُضيفت بعد الإرسال (pending في طلب مرسل)
  const pendingNewItems = kitchenSent ? orderItems.filter((i: any) => i.status === "pending" && !i.isVoided) : [];

  // SSE: auto-refresh active order when kitchen updates any item
  const activeOrderIdRef = useRef<number | null>(null);
  activeOrderIdRef.current = activeOrderId;
  useEffect(() => {
    const es = new EventSource("/api/sse/wa-events");
    const refreshOrder = async () => {
      const oid = activeOrderIdRef.current;
      if (!oid) return;
      const order = await utils.pos.orders.get.fetch({ id: oid });
      setActiveOrder(order);
      refetchTables();
    };
    // لما يتم إرسال طلب جديد للمطبخ
    es.addEventListener("kitchen_order", refreshOrder);
    // لما المطبخ يغير حالة صنف → يتحدث الطلب فوراً
    es.addEventListener("kitchen_item_update", (e: any) => {
      try {
        const data = JSON.parse(e.data);
        // فقط لو الصنف خاص بالطلب النشط حالياً
        if (data.orderId === activeOrderIdRef.current) refreshOrder();
      } catch {}
    });
    return () => es.close();
  }, []);

  const filteredProducts = (products as any[]).filter((p: any) => {
    const inCat = selectedCategory === "all" || p.categoryReference === selectedCategory;
    const inSearch = !search || (p.nameAr || p.name || "").toLowerCase().includes(search.toLowerCase());
    return inCat && inSearch && p.isActive;
  });

  const readyCount  = orderItems.filter(i => i.status === "ready" || i.status === "served").length;
  const totalItems  = orderItems.filter(i => !i.isVoided).length;

  // table counts
  const availCount  = (tables as any[]).filter(t => t.status === "available").length;
  const occupCount  = (tables as any[]).filter(t => t.status === "occupied").length;
  const readyTables = (tables as any[]).filter(t => t.activeOrder?.status === "ready").length;

  // ── SCREEN: Floor Map ──────────────────────────────────────────────────────
  if (screen === "floor") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f1117" }} dir={dir}>

        {/* Header */}
        <div style={{ background: "#161b27", borderBottom: "1px solid #1e2535", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: 36, height: 36, borderRadius: "10px", background: "#1e2535", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Utensils size={18} style={{ color: "#60a5fa" }} />
              </div>
              <div>
                <h1 style={{ fontSize: "16px", fontWeight: 800, color: "#e2e8f0", margin: 0 }}>خريطة الصالة</h1>
                <p style={{ fontSize: "11px", color: "#475569", margin: 0 }}>اضغط على طاولة لإدارة طلبها</p>
              </div>
            </div>
            <button onClick={handleRefresh}
              style={{ background: "#1e2535", border: "none", borderRadius: "10px", padding: "8px", cursor: "pointer", color: "#64748b" }}>
              <RefreshCw size={16} style={{ transform: refreshing ? "rotate(360deg)" : "none", transition: "transform .6s" }} />
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "8px" }}>
            {[
              { count: availCount,  label: "متاحة",   bg: "#001a0d", color: "#34d399", dot: "#34d399" },
              { count: occupCount,  label: "مشغولة",  bg: "#1a0a00", color: "#fb923c", dot: "#fb923c" },
              { count: readyTables, label: "جاهزة ✅", bg: "#064e3b", color: "#34d399", dot: "#34d399" },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, background: s.bg, borderRadius: "10px", padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: "20px", fontWeight: 900, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: "10px", color: s.color, opacity: 0.7, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Section tabs */}
          {sections.length > 0 && (
            <div style={{ display: "flex", gap: "6px", marginTop: "10px", overflowX: "auto" }}>
              {(["all", ...sections] as string[]).map(s => (
                <button key={s} onClick={() => setFilterSection(s)}
                  style={{
                    padding: "5px 14px", borderRadius: "20px", border: "none", cursor: "pointer",
                    background: filterSection === s ? "#2563eb" : "#1e2535",
                    color: filterSection === s ? "#fff" : "#94a3b8",
                    fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
                  }}>
                  {s === "all" ? "🏠 الكل" : s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Table grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
          {filteredTables.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "200px", color: "#2d3748", gap: "8px" }}>
              <UtensilsCrossed size={40} />
              <p style={{ fontSize: "14px", color: "#4a5568" }}>لا توجد طاولات</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "10px" }}>
              {filteredTables.map((table: any) => {
                const stCfg = TABLE_STATUS[table.status as keyof typeof TABLE_STATUS] ?? TABLE_STATUS.available;
                const orderStatus = table.activeOrder?.status;
                const ksCfg = orderStatus ? KITCHEN_STATUS[orderStatus as keyof typeof KITCHEN_STATUS] : null;
                const isTableReady = orderStatus === "ready";
                const timeStr = elapsed(table.activeOrder?.createdAt);

                return (
                  <button key={table.id} onClick={() => openTable(table)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      padding: "14px 8px 12px",
                      background: stCfg.bg,
                      border: `2px solid ${isTableReady ? "#34d399" : stCfg.border}`,
                      borderRadius: "16px", cursor: "pointer",
                      boxShadow: isTableReady ? "0 0 12px #34d39940" : "none",
                      transition: "all .15s", position: "relative",
                    }}>
                    {/* Ready pulse ring */}
                    {isTableReady && (
                      <span style={{ position: "absolute", top: 6, insetInlineEnd: 6, width: 8, height: 8, borderRadius: "50%", background: "#34d399", animation: "pulse 1.5s infinite" }} />
                    )}

                    {/* Table number badge */}
                    <div style={{
                      width: 44, height: 44, borderRadius: "12px",
                      background: table.status === "occupied" ? "#7c2d12" : table.status === "reserved" ? "#713f12" : "#065f46",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "18px", fontWeight: 900, color: "#fff", marginBottom: "8px",
                    }}>
                      {table.tableNumber}
                    </div>

                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", marginBottom: "4px" }}>
                      {table.label || `طاولة ${table.tableNumber}`}
                    </span>

                    {/* Kitchen status or table status */}
                    {ksCfg ? (
                      <span style={{ fontSize: "9px", padding: "2px 7px", borderRadius: "8px", background: ksCfg.bg, color: ksCfg.color, fontWeight: 700 }}>
                        {ksCfg.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: "9px", color: stCfg.dot, fontWeight: 700 }}>{stCfg.label}</span>
                    )}

                    {/* Time + guests */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px" }}>
                      {timeStr && (
                        <span style={{ fontSize: "9px", color: "#64748b", display: "flex", alignItems: "center", gap: "2px" }}>
                          <Clock size={8} />{timeStr}
                        </span>
                      )}
                      <span style={{ fontSize: "9px", color: "#475569", display: "flex", alignItems: "center", gap: "2px" }}>
                        <Users size={8} />{table.capacity}
                      </span>
                    </div>

                    {/* Amount if order exists */}
                    {table.activeOrder?.total && (
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#60a5fa", marginTop: "4px" }}>
                        {parseFloat(table.activeOrder.total).toFixed(0)} <span style={{ fontSize: "8px" }}>د.إ</span>
                      </span>
                    )}

                    {/* زر تفريغ — فقط لو الطاولة occupied وما فيهاش طلب نشط */}
                    {table.status === "occupied" && !table.activeOrder && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm("تفريغ الطاولة وجعلها متاحة؟")) {
                            clearTableMut.mutate({ tableId: table.id });
                          }
                        }}
                        style={{
                          marginTop: "6px", padding: "3px 10px", borderRadius: "8px",
                          background: "#1a0800", border: "1px solid #7c2d12",
                          color: "#fb923c", fontSize: "9px", fontWeight: 700, cursor: "pointer",
                        }}>
                        🪑 تفريغ
                      </button>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SCREEN: Order (Table detail) ───────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f1117" }} dir={dir}>

      {/* Header */}
      <div style={{ background: "#161b27", borderBottom: "1px solid #1e2535", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
        <button onClick={() => { setScreen("floor"); setSelectedTable(null); setActiveOrder(null); setActiveOrderId(null); }}
          style={{ background: "#1e2535", border: "none", borderRadius: "10px", padding: "8px", cursor: "pointer", color: "#94a3b8", display: "flex" }}>
          {isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", fontWeight: 800, color: "#e2e8f0" }}>
              {selectedTable?.label || `طاولة ${selectedTable?.tableNumber}`}
            </span>
            {activeOrder?.orderNumber && (
              <span style={{ fontSize: "11px", color: "#475569" }}>#{activeOrder.orderNumber}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
            <Users size={10} style={{ color: "#475569" }} />
            <span style={{ fontSize: "11px", color: "#475569" }}>{selectedTable?.capacity} أشخاص</span>
            {activeOrder?.createdAt && (
              <>
                <span style={{ color: "#1e2535" }}>·</span>
                <Clock size={10} style={{ color: "#475569" }} />
                <span style={{ fontSize: "11px", color: "#475569" }}>{elapsed(activeOrder.createdAt)}</span>
              </>
            )}
          </div>
        </div>

        {activeOrder?.status && (() => {
          const ksCfg = KITCHEN_STATUS[activeOrder.status as keyof typeof KITCHEN_STATUS];
          return ksCfg ? (
            <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "10px", background: ksCfg.bg, color: ksCfg.color }}>
              {ksCfg.label}
            </span>
          ) : null;
        })()}
      </div>

      {/* Body: Left=Menu, Right=Order */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isRtl ? "row-reverse" : "row" }}>

        {/* ── LEFT: Menu ────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#0f1117" }}>

          {/* Search */}
          <div style={{ padding: "8px 10px", background: "#161b27", borderBottom: "1px solid #1e2535" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [isRtl ? "right" : "left"]: "10px", color: "#475569" }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن صنف..."
                style={{
                  width: "100%", background: "#1e2535", border: "1px solid #2d3748", borderRadius: "10px",
                  padding: isRtl ? "8px 34px 8px 10px" : "8px 10px 8px 34px",
                  color: "#e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box",
                }} />
              {search && (
                <button onClick={() => setSearch("")}
                  style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", [isRtl ? "left" : "right"]: "10px", background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: "flex", gap: "5px", padding: "7px 10px", background: "#161b27", borderBottom: "1px solid #1e2535", overflowX: "auto", scrollbarWidth: "none" }}>
            <button onClick={() => setSelectedCategory("all")}
              style={{
                padding: "5px 13px", borderRadius: "20px", border: "none",
                background: selectedCategory === "all" ? "#2563eb" : "#1e2535",
                color: selectedCategory === "all" ? "#fff" : "#94a3b8",
                fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
              }}>
              🍽 الكل
            </button>
            {productCategories.map(cat => {
              const cc = getCatColor(cat);
              const isActive = selectedCategory === cat;
              return (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: "5px 12px", borderRadius: "20px",
                    border: isActive ? "none" : `1px solid ${cc.text}33`,
                    background: isActive ? cc.text : cc.bg,
                    color: isActive ? "#000" : cc.text,
                    fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                    transition: "all .12s",
                  }}>
                  {cc.icon} {cat}
                </button>
              );
            })}
          </div>

          {/* Product grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "8px" }}>
              {filteredProducts.map((p: any) => {
                const cc = getCatColor(p.categoryReference ?? "");
                const isBlocked = blockedSet.has(p.id);
                return (
                  <button key={p.id}
                    onClick={() => !isBlocked && handleAddProduct(p)}
                    disabled={isBlocked}
                    style={{
                      position: "relative",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      padding: isBlocked ? "18px 8px 12px" : "14px 8px 12px",
                      background: isBlocked ? "#1a0a1a" : cc.bg,
                      border: `1.5px solid ${isBlocked ? "#7c3aed44" : cc.text + "33"}`,
                      borderRadius: "12px",
                      cursor: isBlocked ? "not-allowed" : "pointer",
                      opacity: isBlocked ? 0.55 : 1,
                      transition: "border-color .12s", minHeight: "90px", textAlign: "center",
                    }}
                    onMouseEnter={e => { if (!isBlocked) (e.currentTarget as any).style.borderColor = cc.text + "99"; }}
                    onMouseLeave={e => { if (!isBlocked) (e.currentTarget as any).style.borderColor = cc.text + "33"; }}
                  >
                    {isBlocked && (
                      <span style={{ position: "absolute", top: 0, left: 0, right: 0, borderRadius: "11px 11px 0 0", fontSize: "8px", background: "#7c3aed", color: "#fff", padding: "2px 4px", fontWeight: 700, textAlign: "center" }}>
                        🔒 وصفة غير متاحة
                      </span>
                    )}
                    <span style={{ fontSize: "22px", lineHeight: 1, marginBottom: "6px" }}>{cc.icon}</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: isBlocked ? "#4a5568" : "#e2e8f0", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: "4px" }}>
                      {isRtl ? (p.nameAr || p.name) : p.name}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 800, color: isBlocked ? "#4a5568" : cc.text }}>
                      {parseFloat(p.price || 0).toFixed(2)} <span style={{ fontSize: "9px", opacity: 0.7 }}>د.إ</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {filteredProducts.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "160px", color: "#2d3748", gap: "8px" }}>
                <Search size={32} />
                <span style={{ fontSize: "13px", color: "#4a5568" }}>لا توجد منتجات</span>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Order Panel ──────────────────────────────────────────────── */}
        <div style={{ width: "220px", flexShrink: 0, display: "flex", flexDirection: "column", background: "#161b27", borderInlineStart: "1px solid #1e2535" }}>

          {/* Order header */}
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e2535", background: "#0f1117" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8" }}>الطلب ({totalItems})</span>
              {totalItems > 0 && (
                <span style={{ fontSize: "10px", color: "#34d399" }}>{readyCount}/{totalItems} جاهز</span>
              )}
            </div>
            {/* Kitchen progress */}
            {totalItems > 0 && (
              <div style={{ marginTop: "6px", height: 4, background: "#1e2535", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${(readyCount / totalItems) * 100}%`, height: "100%", background: "#34d399", borderRadius: "4px", transition: "width .4s" }} />
              </div>
            )}
          </div>

          {/* Items list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {orderItems.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "120px", gap: "6px" }}>
                <UtensilsCrossed size={28} style={{ color: "#2d3748" }} />
                <p style={{ fontSize: "11px", color: "#374151" }}>اضغط على صنف للإضافة</p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {orderItems.map((item: any) => {
                  const isVoided = item.isVoided;
                  const isSent = activeOrder?.status !== "draft";
                  return (
                    <li key={item.id} style={{
                      padding: "8px 10px", borderBottom: "1px solid #1e2535",
                      opacity: isVoided ? 0.4 : 1, background: isVoided ? "#1a0a0a" : "transparent",
                    }}>
                      {noteTarget === item.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                            placeholder="ملاحظة..."
                            rows={2}
                            autoFocus
                            style={{ width: "100%", background: "#1e2535", border: "1px solid #2d3748", borderRadius: "8px", color: "#e2e8f0", fontSize: "11px", padding: "5px 7px", resize: "none", outline: "none", boxSizing: "border-box" }}
                          />
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button onClick={() => saveNote(item.id)}
                              style={{ flex: 1, background: "#2563eb", border: "none", borderRadius: "7px", color: "#fff", fontSize: "11px", padding: "5px", cursor: "pointer" }}>حفظ</button>
                            <button onClick={() => { setNoteTarget(null); setNoteText(""); }}
                              style={{ background: "#1e2535", border: "none", borderRadius: "7px", color: "#94a3b8", fontSize: "11px", padding: "5px 8px", cursor: "pointer" }}><X size={10} /></button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "4px", marginBottom: "3px" }}>
                            <button onClick={() => { setNoteTarget(item.id); setNoteText(item.notes || ""); }}
                              style={{ flex: 1, textAlign: "start", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: item.notes ? "#fbbf24" : "#e2e8f0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {isRtl ? (item.productNameAr || item.productName) : item.productName}
                              </span>
                            </button>
                            {/* Kitchen status dot */}
                            {isSent && (
                              <span style={{
                                width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: "4px",
                                background: item.status === "ready" ? "#34d399" : item.status === "preparing" ? "#fbbf24" : "#4a5568",
                                display: "block",
                              }} />
                            )}
                          </div>
                          {item.notes && <p style={{ fontSize: "10px", color: "#f59e0b", margin: "0 0 3px" }}>{item.notes}</p>}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <button onClick={() => handleQty(item.id, -1, item.quantity)} disabled={isVoided || isSent}
                                style={{ width: 20, height: 20, borderRadius: "50%", background: "#1e2535", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: (isVoided || isSent) ? 0.3 : 1 }}>
                                <Minus size={9} />
                              </button>
                              <span style={{ width: 18, textAlign: "center", fontSize: "12px", fontWeight: 700, color: "#e2e8f0" }}>{item.quantity}</span>
                              <button onClick={() => handleQty(item.id, 1, item.quantity)} disabled={isVoided || isSent}
                                style={{ width: 20, height: 20, borderRadius: "50%", background: "#1e2535", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: (isVoided || isSent) ? 0.3 : 1 }}>
                                <Plus size={9} />
                              </button>
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "#60a5fa" }}>{item.totalPrice.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Total + Actions */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1e2535", background: "#0f1117", display: "flex", flexDirection: "column", gap: "7px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>الإجمالي</span>
              <span style={{ fontSize: "18px", fontWeight: 900, color: "#60a5fa" }}>
                {parseFloat(activeOrder?.total ?? "0").toFixed(2)}
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 500 }}> د.إ</span>
              </span>
            </div>

            {/* Send to Kitchen — أو إرسال إضافة */}
            {pendingNewItems.length > 0 ? (
              // زر إرسال الأصناف الجديدة المضافة بعد الإرسال الأول
              <button
                onClick={() => activeOrderId && sendKitchenMut.mutate({ orderId: activeOrderId })}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  padding: "10px", borderRadius: "12px", border: "none",
                  background: "#b45309", color: "#fff",
                  fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 0 12px #b4530940",
                }}>
                <Send size={13} />
                إرسال إضافة للمطبخ ({pendingNewItems.length})
              </button>
            ) : (
              <button
                onClick={() => activeOrderId && sendKitchenMut.mutate({ orderId: activeOrderId })}
                disabled={!activeOrderId || orderItems.length === 0 || kitchenSent}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  padding: "10px", borderRadius: "12px", border: "none",
                  background: (!activeOrderId || orderItems.length === 0 || kitchenSent) ? "#1e2535" : "#c2410c",
                  color: (!activeOrderId || orderItems.length === 0 || kitchenSent) ? "#4a5568" : "#fff",
                  fontSize: "12px", fontWeight: 700, cursor: (!activeOrderId || orderItems.length === 0 || kitchenSent) ? "not-allowed" : "pointer",
                }}>
                <Send size={13} />
                {kitchenSent ? "✓ تم الإرسال" : "أرسل للمطبخ"}
              </button>
            )}

            {/* Mark Served — prominent green when ready */}
            {isReady && (
              <button
                onClick={() => activeOrderId && markServedMut.mutate({ orderId: activeOrderId })}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  padding: "12px", borderRadius: "12px", border: "none",
                  background: "#065f46", color: "#34d399",
                  fontSize: "13px", fontWeight: 800, cursor: "pointer",
                  boxShadow: "0 0 16px #34d39930",
                }}>
                <CheckCircle2 size={15} />
                تم التقديم ✓
              </button>
            )}

            {/* إغلاق الطلب — للطلبات المرسلة أو المقدّمة التي تحتاج تصفية */}
            {activeOrderId && activeOrder && ["sent_to_kitchen","partially_ready","ready","served"].includes(activeOrder.status) && (
              <button
                onClick={() => {
                  if (confirm("إغلاق هذا الطلب وتفريغ الطاولة؟\nتأكد من إتمام الدفع من الكاشير أولاً.")) {
                    cancelOrderMut.mutate({ orderId: activeOrderId });
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  padding: "10px", borderRadius: "10px", border: "1px solid #7c2d12",
                  background: "#1a0800", color: "#fb923c", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                }}>
                🗑 إغلاق الطلب وتفريغ الطاولة
              </button>
            )}

            {/* تفريغ الطاولة — يظهر فقط إذا الطاولة مشغولة وما فيش طلب نشط */}
            {selectedTable && selectedTable.status === "occupied" && !activeOrder && (
              <button
                onClick={() => {
                  if (confirm("تفريغ الطاولة وجعلها متاحة؟")) {
                    clearTableMut.mutate({ tableId: selectedTable.id });
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
                  padding: "10px", borderRadius: "10px", border: "1px solid #7c2d12",
                  background: "#1a0800", color: "#fb923c", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                }}>
                🪑 تفريغ الطاولة
              </button>
            )}

            {/* Back to floor */}
            <button onClick={() => { setScreen("floor"); refetchTables(); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "8px", borderRadius: "10px", background: "transparent", border: "1px solid #1e2535", color: "#64748b", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
              {isRtl ? <ChevronRight size={12} /> : <ChevronRight size={12} style={{ transform: "rotate(180deg)" }} />}
              العودة للصالة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
