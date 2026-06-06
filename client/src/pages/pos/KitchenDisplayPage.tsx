/**
 * Kitchen Display Screen (KDS) — 3-column layout
 *
 * LEFT  : Production panel — semi-finished materials needed for today's orders
 *         (auto-deducted when order completes)
 * CENTER: Live order queue (optimistic UI — items vanish instantly)
 * BOTTOM: Today's production summary + consumption tracker
 */
import { useState, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2, ChefHat, Clock, UtensilsCrossed,
  Zap, RefreshCw, Car, Package, Volume2, VolumeX,
  ChevronDown, ChevronUp, Beaker,
} from "lucide-react";

// ── time helpers ──────────────────────────────────────────────────────────────
function elapsedBorder(m: number) {
  if (m >= 6) return "#ef4444";
  if (m >= 3) return "#f97316";
  return "#22c55e";
}
function elapsedHeaderBg(m: number) {
  if (m >= 6) return "#7f1d1d";
  if (m >= 3) return "#7c2d12";
  return "#14532d";
}
function ElapsedBadge({ minutes }: { minutes: number }) {
  const bg = minutes >= 6 ? "#ef4444" : minutes >= 3 ? "#f97316" : "#22c55e";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#fff", background: bg }}>
      <Clock size={10} /> {minutes}م
    </span>
  );
}

// ── types ─────────────────────────────────────────────────────────────────────
type KitchenItem = {
  id: number;
  productName: string;
  productNameAr: string | null;
  quantity: number;
  status: "pending" | "preparing" | "ready" | "served";
  notes: string | null;
  course: string | null;
  modifiers?: string[];
};
type KitchenOrder = {
  id: number;
  orderNumber: string;
  tableLabel: string | null;
  orderType: string;
  status: string;
  elapsedMinutes: number;
  notes: string | null;
  items: KitchenItem[];
};
type ProductionItem = {
  materialId: number;
  name: string;
  nameAr: string;
  unit: string;
  currentStock: number;
  todayProduced: number;
  minQty: number;
  totalNeeded: number;
  alreadyDeducted: number;
};

// ── sounds ────────────────────────────────────────────────────────────────────

// 🔔 طلب جديد — 3 نغمات تصاعدية
function playNewOrder(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    const freqs = [523, 659, 784]; // C5 → E5 → G5
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.25);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.25);
    });
  } catch {}
}

// ⚠️ طلب متأخر > 15 دقيقة — نغمة إنذار متكررة
function playLateAlert(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    [0, 0.2, 0.4].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(220, ctx.currentTime + offset);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.15);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.15);
    });
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
export default function KitchenDisplayPage() {
  const { dir } = useLanguage();
  const isRtl = dir === "rtl";
  const today = new Date().toISOString().slice(0, 10);

  // ── remote data ──────────────────────────────────────────────────────────
  const { data: rawQueue = [], refetch, isRefetching } = trpc.pos.kitchen.queue.useQuery(
    undefined, { refetchInterval: 15000 }
  );
  const { data: productionPanel = [], refetch: refetchPanel } = trpc.pos.kitchen.productionPanel.useQuery(
    { date: today }, { refetchInterval: 15000 }
  );

  // ── optimistic local queue ────────────────────────────────────────────────
  const [localQueue, setLocalQueue] = useState<KitchenOrder[]>([]);
  useEffect(() => { setLocalQueue(rawQueue as KitchenOrder[]); }, [rawQueue]);

  // ── SSE: real-time kitchen order push ─────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/sse/wa-events");
    es.addEventListener("kitchen_order", () => {
      refetch();
      refetchPanel();
    });
    return () => es.close();
  }, []);

  const utils = trpc.useUtils();

  function invalidateAll() {
    utils.pos.kitchen.queue.invalidate();
    refetchPanel();
  }

  const updateItemMut = trpc.pos.kitchen.updateItemStatus.useMutation({
    onMutate: ({ itemId, status }) => {
      setLocalQueue(prev =>
        prev.map(order => {
          const hasItem = order.items.some(i => i.id === itemId);
          if (!hasItem) return order;
          const updatedItems = order.items.map(i => i.id === itemId ? { ...i, status } : i);
          const allDone = updatedItems.every(i => i.status === "ready" || i.status === "served");
          if (allDone) return null as any;
          return { ...order, items: updatedItems };
        }).filter(Boolean)
      );
    },
    onSuccess: invalidateAll,
    onError: () => utils.pos.kitchen.queue.invalidate(),
  });

  const markAllReadyMut = trpc.pos.kitchen.markAllReady.useMutation({
    onMutate: ({ orderId }) => {
      setLocalQueue(prev => prev.filter(o => o.id !== orderId));
    },
    onSuccess: () => { utils.materials.list.invalidate(); invalidateAll(); },

    onError: () => utils.pos.kitchen.queue.invalidate(),
  });

  // ── sound ─────────────────────────────────────────────────────────────────
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevQueueLen = useRef(0);
  const prevOrderIds = useRef<Set<number>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alertedLate  = useRef<Set<number>>(new Set()); // طلبات تم تنبيهها بالفعل

  function getCtx() {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    // Resume if suspended (browser requires user gesture first)
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  // فتح الـ AudioContext عند أول تفاعل
  useEffect(() => {
    const unlock = () => { getCtx(); };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  // 🔔 تنبيه طلب جديد
  const mountedRef = useRef(false);
  useEffect(() => {
    const currentIds = new Set(localQueue.map(o => o.id));

    if (!mountedRef.current) {
      // أول render — سجّل الطلبات الموجودة بدون صوت
      mountedRef.current = true;
      prevOrderIds.current = currentIds;
      return;
    }

    // أي طلب ID جديد مش كان موجود قبل → عزف
    const newOrders = localQueue.filter(o => !prevOrderIds.current.has(o.id));
    if (newOrders.length > 0 && soundEnabled) {
      playNewOrder(getCtx());
    }

    prevOrderIds.current = currentIds;
  }, [localQueue]);

  // ⚠️ تنبيه طلب متأخر > 15 دقيقة — يفحص كل 60 ثانية
  useEffect(() => {
    if (!soundEnabled) return;
    const check = () => {
      const lateOrders = localQueue.filter(o => (o.elapsedMinutes ?? 0) >= 15);
      const newLate = lateOrders.filter(o => !alertedLate.current.has(o.id));
      if (newLate.length > 0) {
        playLateAlert(getCtx());
        newLate.forEach(o => alertedLate.current.add(o.id));
      }
      // اشيل الطلبات المكتملة من الـ set
      const activeIds = new Set(localQueue.map(o => o.id));
      alertedLate.current.forEach(id => { if (!activeIds.has(id)) alertedLate.current.delete(id); });
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [localQueue, soundEnabled]);

  // ── bottom panels state ───────────────────────────────────────────────────

  const lateCount = localQueue.filter(o => o.elapsedMinutes >= 6).length;
  const panel = productionPanel as ProductionItem[];
  const blockedCount = panel.filter(m => ((m.todayProduced ?? 0) - m.alreadyDeducted) <= 0).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0d1117", overflow: "hidden" }} dir={dir}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#161b27", borderBottom: "1px solid #1e2535", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChefHat size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>شاشة المطبخ</h1>
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
              {localQueue.length} طلب نشط
              {lateCount > 0 && <span style={{ color: "#ef4444", fontWeight: 700, marginInlineStart: 8 }}>⚠️ {lateCount} متأخر</span>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Legend */}
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748b", marginInlineEnd: 8 }}>
            {[{ c: "#22c55e", l: "< 3م" }, { c: "#f97316", l: "3–6م" }, { c: "#ef4444", l: "> 6م 🔥" }].map(x => (
              <span key={x.l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: x.c, display: "block" }} />
                {x.l}
              </span>
            ))}
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#4ade80" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "block", animation: "pulse 1.5s infinite" }} />
            مباشر
          </span>
          <button
            onClick={() => { if (soundEnabled) playNewOrder(getCtx()); setSoundEnabled(s => !s); }}
            title={soundEnabled ? "كتم الصوت" : "تشغيل الصوت — اضغط لاختبار"}
            style={{ padding: 7, borderRadius: 8, background: soundEnabled ? "#14532d" : "#1e2535", border: "none", color: soundEnabled ? "#4ade80" : "#64748b", cursor: "pointer", display: "flex" }}>
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button onClick={() => { refetch(); refetchPanel(); }}
            style={{ padding: 7, borderRadius: 8, background: "#1e2535", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex" }}>
            <RefreshCw size={15} style={{ animation: isRefetching ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* ── Main 2-column body ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isRtl ? "row-reverse" : "row" }}>

        {/* ══ LEFT: Production Panel ════════════════════════════════════════ */}
        <div style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", background: "#161b27", borderInlineEnd: "1px solid #1e2535", overflowY: "auto" }}>
          {/* Panel header */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #1e2535", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "#0a1628", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Beaker size={15} style={{ color: "#60a5fa" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>إنتاج المطبخ</p>
              <p style={{ fontSize: 10, color: "#475569", margin: 0 }}>المواد المصنعة لأوامر اليوم</p>
            </div>
            {blockedCount > 0 && (
              <span style={{ fontSize: 10, background: "#450a0a", color: "#fca5a5", padding: "2px 6px", borderRadius: 6, fontWeight: 700, border: "1px solid #7f1d1d", flexShrink: 0 }}>
                ⚠ {blockedCount}
              </span>
            )}
          </div>

          {/* Materials list */}
          {panel.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 20, textAlign: "center" }}>
              <Beaker size={32} style={{ color: "#1e2535" }} />
              <p style={{ fontSize: 12, color: "#374151" }}>لا توجد مواد مصنعة في أوامر اليوم</p>
              <p style={{ fontSize: 10, color: "#1e2535" }}>ستظهر هنا عند إرسال الطلبات للمطبخ</p>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {panel.map(mat => {
                // المتاح = إنتاج اليوم − المسحوب فعلاً
                const produced  = mat.todayProduced ?? 0;
                const available = produced - mat.alreadyDeducted;
                const isOk      = available > 0;

                return (
                  <div key={mat.materialId} style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid #0f1520",
                    background: isOk ? "#0d1117" : "#110505",
                  }}>
                    {/* row: name — two pills */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                      {/* status dot */}
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                        background: isOk ? "#22c55e" : "#ef4444",
                        boxShadow: `0 0 5px ${isOk ? "#22c55e88" : "#ef444488"}`,
                      }} />

                      {/* name */}
                      <span style={{ fontSize: 11, fontWeight: 600, color: isOk ? "#94a3b8" : "#fca5a5", flex: 1, lineHeight: 1 }}>
                        {mat.nameAr || mat.name}
                      </span>

                      {/* إنتاج اليوم */}
                      <div style={{ textAlign: "center", minWidth: 48 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>
                          {(mat.todayProduced ?? 0).toFixed(1)}
                        </span>
                        <span style={{ fontSize: 8, color: "#374151", marginInlineStart: 2 }}>{mat.unit}</span>
                        <div style={{ fontSize: 7, color: "#1e3a5f", marginTop: 1 }}>إنتاج اليوم</div>
                      </div>

                      {/* divider */}
                      <div style={{ width: 1, height: 20, background: "#1e2535", flexShrink: 0 }} />

                      {/* المتاح */}
                      <div style={{ textAlign: "center", minWidth: 48 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: isOk ? "#4ade80" : "#ef4444" }}>
                          {available.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 8, color: "#374151", marginInlineStart: 2 }}>{mat.unit}</span>
                        <div style={{ fontSize: 7, color: isOk ? "#166534" : "#7f1d1d", marginTop: 1 }}>المتاح</div>
                      </div>

                    </div>

                    {/* thin bar */}
                    <div style={{ height: 2, background: "#1a2030", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                      <div style={{
                        width: `${produced > 0 ? Math.min(100, Math.max(0, (available / produced) * 100)) : 0}%`,
                        height: "100%", borderRadius: 2, transition: "width .5s",
                        background: isOk ? "#22c55e" : "#ef4444",
                      }} />
                    </div>

                    {!isOk && (
                      <div style={{ marginTop: 4, fontSize: 8, color: "#7f1d1d", textAlign: "center", letterSpacing: "0.04em" }}>
                        🔒 محجوب في الكاشير
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══ RIGHT: Orders + bottom panels ════════════════════════════════ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Order cards scrollable area */}
          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            {localQueue.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 12, color: "#374151" }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: "#161b27", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Zap size={26} style={{ color: "#374151" }} />
                </div>
                <p style={{ fontSize: 17, fontWeight: 700, color: "#4b5563" }}>لا توجد طلبات حالياً</p>
                <p style={{ fontSize: 12, color: "#374151" }}>الطلبات تظهر هنا فور إرسالها من الويتر</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {localQueue.map(order => {
                  const elapsed = order.elapsedMinutes ?? 0;
                  const allReady = order.items.every(i => i.status === "ready" || i.status === "served");
                  const readyCount = order.items.filter(i => i.status === "ready" || i.status === "served").length;

                  return (
                    <div key={order.id} style={{
                      borderRadius: 14, border: `2px solid ${elapsedBorder(elapsed)}`,
                      overflow: "hidden", display: "flex", flexDirection: "column",
                      boxShadow: `0 0 10px ${elapsedBorder(elapsed)}22`,
                    }}>
                      {/* Header */}
                      <div style={{ background: elapsedHeaderBg(elapsed), padding: "9px 13px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          {order.orderType === "delivery" ? <Car size={14} /> : order.orderType === "takeaway" ? <Package size={14} /> : <UtensilsCrossed size={14} />}
                          <span style={{ fontWeight: 800, fontSize: 14 }}>{order.orderNumber}</span>
                          {order.tableLabel && (
                            <span style={{ fontSize: 10, background: "rgba(255,255,255,.15)", padding: "2px 7px", borderRadius: 20, fontWeight: 600 }}>{order.tableLabel}</span>
                          )}
                        </div>
                        <ElapsedBadge minutes={elapsed} />
                      </div>

                      {order.notes && (
                        <div style={{ padding: "5px 12px", background: "#451a03", fontSize: 11, color: "#fb923c" }}>📝 {order.notes}</div>
                      )}

                      {/* Items */}
                      <div style={{ flex: 1, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 7, background: "#161b27" }}>
                        {order.items.map(item => {
                          const isReady     = item.status === "ready" || item.status === "served";
                          const isPreparing = item.status === "preparing";
                          return (
                            <div key={item.id} style={{
                              display: "flex", alignItems: "flex-start", gap: 9, padding: "9px 10px",
                              borderRadius: 11,
                              background: isReady ? "#052e16" : isPreparing ? "#431407" : "#1e2535",
                              border: `1px solid ${isReady ? "#166534" : isPreparing ? "#7c2d12" : "#2d3748"}`,
                              transition: "all .2s",
                            }}>
                              <span style={{
                                width: 9, height: 9, borderRadius: "50%", flexShrink: 0, marginTop: 4, display: "block",
                                background: isReady ? "#22c55e" : isPreparing ? "#f97316" : "#475569",
                                animation: (!isReady && !isPreparing) ? "pulse 1.5s infinite" : "none",
                              }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, background: "#111827", color: "#e2e8f0", width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    {item.quantity}×
                                  </span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: isReady ? "#86efac" : "#e2e8f0" }}>
                                    {isRtl ? (item.productNameAr || item.productName) : item.productName}
                                  </span>
                                </div>
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                                    {item.modifiers.map((m: string) => (
                                      <span key={m} style={{ fontSize: 9, padding: "2px 5px", background: "#451a03", color: "#fb923c", borderRadius: 7 }}>{m}</span>
                                    ))}
                                  </div>
                                )}
                                {item.notes && (
                                  <p style={{ fontSize: 10, color: "#fca5a5", margin: "3px 0 0", background: "#450a0a", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>⚠️ {item.notes}</p>
                                )}
                              </div>
                              <div style={{ flexShrink: 0 }}>
                                {item.status === "pending" && (
                                  <button onClick={() => updateItemMut.mutate({ itemId: item.id, status: "preparing" })}
                                    style={{ padding: "4px 9px", background: "#c2410c", border: "none", borderRadius: 7, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                    ابدأ
                                  </button>
                                )}
                                {item.status === "preparing" && (
                                  <button onClick={() => updateItemMut.mutate({ itemId: item.id, status: "ready" })}
                                    style={{ padding: "4px 9px", background: "#16a34a", border: "none", borderRadius: 7, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                    جاهز ✓
                                  </button>
                                )}
                                {isReady && <CheckCircle2 size={18} style={{ color: "#22c55e" }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer */}
                      <div style={{ padding: "9px 11px", background: "#0f1117", borderTop: "1px solid #1e2535", display: "flex", flexDirection: "column", gap: 7 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>{readyCount}/{order.items.length} جاهز</span>
                          {allReady ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
                              <CheckCircle2 size={12} /> كل شيء جاهز!
                            </span>
                          ) : (
                            <div style={{ width: 70, height: 4, background: "#1e2535", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${order.items.length > 0 ? (readyCount / order.items.length) * 100 : 0}%`, height: "100%", background: "#22c55e", borderRadius: 4, transition: "width .4s" }} />
                            </div>
                          )}
                        </div>
                        {!allReady && (
                          <button onClick={() => markAllReadyMut.mutate({ orderId: order.id })}
                            disabled={markAllReadyMut.isPending}
                            style={{
                              width: "100%", padding: "8px 0", background: "#166534", border: "none", borderRadius: 9,
                              color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                              opacity: markAllReadyMut.isPending ? 0.5 : 1,
                            }}>
                            <CheckCircle2 size={13} /> تحضير الكل ✓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}


          </div>{/* end scrollable center */}
        </div>{/* end right column */}
      </div>{/* end main 2-col */}
    </div>
  );
}
