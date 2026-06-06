/**
 * Kitchen Service Stock — Morning Setup Page
 *
 * This is where the kitchen manager starts each day:
 * "We prepared X portions of [Product] today"
 *
 * This feeds the POS availability system:
 * - POS shows only items with remaining qty > 0
 * - When remainingQty = 0 → item is 86'd (auto-hidden in Cashier & Waiter)
 * - End-of-day: close to calculate waste and optionally carry forward
 */
import { useState, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChefHat, Plus, Minus, Save, XCircle, CheckCircle2,
  AlertTriangle, TrendingUp, Package, RefreshCw,
  Lock, Unlock, BarChart2, ArrowRight, Info,
} from "lucide-react";

export default function KitchenServiceStockPage() {
  const { dir } = useLanguage();
  const isRtl = dir === "rtl";
  const utils = trpc.useUtils();

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [deductRawMaterials, setDeductRawMaterials] = useState(true);
  const [showReport, setShowReport] = useState(false);
  // productId → input qty
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: products = [] } = trpc.products.list.useQuery({ isActive: true });
  const { data: stock = [], refetch: refetchStock } = trpc.kitchenServiceStock.today.useQuery(
    { date: selectedDate },
    { refetchInterval: 30000 }
  );
  const { data: report } = trpc.kitchenServiceStock.report.useQuery(
    { date: selectedDate },
    { enabled: showReport }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const batchSetMut = trpc.kitchenServiceStock.batchSetQty.useMutation({
    onSuccess: (res) => {
      toast.success(
        isRtl
          ? `تم ضبط ${res.set} منتج${res.rawMaterialsDeducted > 0 ? ` (خُصم مخزون ${res.rawMaterialsDeducted} منتج)` : ""}`
          : `Set ${res.set} items${res.rawMaterialsDeducted > 0 ? ` (deducted raw materials for ${res.rawMaterialsDeducted})` : ""}`
      );
      setQtyInputs({});
      refetchStock();
    },
    onError: (e) => toast.error(e.message),
  });

  const set86dMut = trpc.kitchenServiceStock.set86d.useMutation({
    onSuccess: () => {
      utils.kitchenServiceStock.today.invalidate();
      utils.kitchenServiceStock.available.invalidate();
    },
  });

  const closeDayMut = trpc.kitchenServiceStock.closeDay.useMutation({
    onSuccess: (res) => {
      toast.success(
        isRtl
          ? `تم إغلاق ${res.closed} منتج — ${res.totalWastePortions.toFixed(1)} حصة هدر`
          : `Closed ${res.closed} items — ${res.totalWastePortions.toFixed(1)} portions wasted`
      );
      refetchStock();
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Computed ──────────────────────────────────────────────────────────────
  const stockMap = useMemo(() => {
    const m = new Map<number, typeof stock[0]>();
    for (const s of stock) m.set(s.productId, s);
    return m;
  }, [stock]);

  // Products not yet set for today
  const unsetProducts = useMemo(() =>
    products.filter((p: any) => !stockMap.has(p.id) && p.isActive),
    [products, stockMap]
  );

  function adjustQty(productId: number, delta: number) {
    setQtyInputs((prev) => {
      const current = parseFloat(prev[productId] || "0") || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [productId]: String(next) };
    });
  }

  async function handleSaveAll() {
    const items = Object.entries(qtyInputs)
      .map(([id, qty]) => ({ productId: Number(id), producedQty: parseFloat(qty) || 0 }))
      .filter((i) => i.producedQty > 0);

    if (items.length === 0) {
      toast.error(isRtl ? "لم تُدخل أي كميات" : "No quantities entered");
      return;
    }

    setSaving(true);
    try {
      await batchSetMut.mutateAsync({
        items,
        date: selectedDate,
        deductRawMaterials,
      });
    } finally {
      setSaving(false);
    }
  }

  const anyInput = Object.values(qtyInputs).some((v) => parseFloat(v) > 0);
  const isToday = selectedDate === today;

  return (
    <div className="p-4 md:p-6 space-y-5" dir={dir}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-orange-500" />
            {isRtl ? "إعداد الإنتاج اليومي" : "Daily Kitchen Production Setup"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isRtl ? "حدد كمية كل منتج جاهز للخدمة — الكاشير سيبيع منه فقط" : "Set how many portions of each product are ready — POS will sell from this stock"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
          />
          <button
            onClick={() => refetchStock()}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
          >
            <RefreshCw size={15} className="text-gray-500" />
          </button>
          <button
            onClick={() => setShowReport((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showReport ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <BarChart2 size={14} />
            {isRtl ? "التقرير" : "Report"}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
        <Info size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">{isRtl ? "كيف يعمل الربط؟" : "How does the link work?"}</p>
          <p className="text-xs leading-relaxed">
            {isRtl
              ? "المطبخ يحضّر → يسجّل الكميات هنا → الكاشير يبيع من هذا المخزون → عند النفاد يُعلَّم المنتج كـ \"86\" ويختفي من الكاشير تلقائياً. الخيار \"خصم المواد الخام\" يخصم مكونات الوصفة من المخزن عند تسجيل الإنتاج."
              : "Kitchen prepares → logs quantities here → Cashier sells from this stock → when it runs out the item is marked 86'd and disappears from POS automatically. The 'Deduct Raw Materials' option deducts recipe ingredients from warehouse when production is logged."
            }
          </p>
        </div>
      </div>

      {/* Options row */}
      <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={deductRawMaterials}
            onChange={(e) => setDeductRawMaterials(e.target.checked)}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="text-sm font-medium text-gray-700">
            {isRtl ? "خصم المواد الخام من المخزن عند تسجيل الإنتاج" : "Deduct raw materials from warehouse when logging production"}
          </span>
        </label>
        <span className="text-xs text-gray-400 ms-auto">
          {isRtl ? "(الطريقة المعتمدة في معظم المطاعم)" : "(Standard restaurant practice)"}
        </span>
      </div>

      {/* REPORT VIEW */}
      {showReport && report && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              {isRtl ? `تقرير الخدمة — ${report.date}` : `Service Stock Report — ${report.date}`}
            </h3>
            <div className="flex gap-4 text-xs text-gray-500">
              <span>🍽️ {isRtl ? "إجمالي إنتاج:" : "Produced:"} <b className="text-gray-800">{report.summary.totalProduced}</b></span>
              <span>✅ {isRtl ? "مبيع:" : "Sold:"} <b className="text-green-700">{report.summary.totalSold}</b></span>
              <span>🗑️ {isRtl ? "هدر:" : "Waste:"} <b className="text-red-600">{report.summary.totalWaste}</b></span>
              <span>📊 {isRtl ? "معدل البيع:" : "Sell-through:"} <b className="text-blue-700">{report.summary.avgSellThrough}%</b></span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className={`p-3 font-medium ${isRtl ? "text-right" : "text-left"}`}>{isRtl ? "المنتج" : "Product"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "أُنتج" : "Produced"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "مُباع" : "Sold"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "متبقي" : "Remaining"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "هدر" : "Waste"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "% البيع" : "Sell-through"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className={`p-3 ${isRtl ? "text-right" : "text-left"}`}>
                      <div className="flex items-center gap-2">
                        {item.is86d && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">86'd</span>}
                        <span className="font-medium">{item.productNameAr || item.productName}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-gray-600">{item.totalAvailableQty}</td>
                    <td className="p-3 text-center font-semibold text-green-700">{item.soldQty}</td>
                    <td className="p-3 text-center">{item.remainingQty}</td>
                    <td className="p-3 text-center text-red-500">{(item.wasteQty + item.remainingQty).toFixed(1)}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${item.soldPct}%` }} />
                        </div>
                        <span className="text-xs text-gray-600 w-10">{item.soldPct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXISTING STOCK (already set today) */}
      {stock.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              {isRtl ? "الإنتاج المُسجَّل اليوم" : "Today's Logged Production"}
            </h3>
            {isToday && (
              <button
                onClick={() => closeDayMut.mutate({ date: selectedDate, carryForward: false })}
                disabled={closeDayMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-semibold hover:bg-red-100 transition-colors"
              >
                <Lock size={12} />
                {isRtl ? "إغلاق نهاية اليوم" : "Close Day"}
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className={`p-3 font-medium ${isRtl ? "text-right" : "text-left"}`}>{isRtl ? "المنتج" : "Product"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "أُنتج" : "Produced"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "مُباع" : "Sold"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "متبقي" : "Remaining"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "حالة الكاشير" : "POS Status"}</th>
                  <th className="p-3 font-medium text-center">{isRtl ? "تحكم" : "Control"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stock.map((item) => (
                  <tr key={item.id} className={item.is86d ? "bg-red-50" : "hover:bg-gray-50"}>
                    <td className={`p-3 ${isRtl ? "text-right" : "text-left"}`}>
                      <span className="font-medium text-gray-900">
                        {item.productNameAr || item.productName}
                      </span>
                      {item.carriedForwardQty > 0 && (
                        <span className="ms-2 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          +{item.carriedForwardQty} {isRtl ? "ترحيل" : "carried"}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center text-gray-600">
                      {item.totalAvailableQty}
                    </td>
                    <td className="p-3 text-center font-semibold text-green-700">
                      {item.soldQty}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`font-bold ${item.remainingQty <= 0 ? "text-red-600" : item.remainingQty <= item.totalAvailableQty * 0.2 ? "text-orange-600" : "text-gray-800"}`}>
                          {item.remainingQty}
                        </span>
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${item.soldPct > 80 ? "bg-red-500" : item.soldPct > 60 ? "bg-orange-400" : "bg-green-500"}`}
                            style={{ width: `${item.soldPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {item.is86d ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          <XCircle size={11} /> 86'd
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                          <CheckCircle2 size={11} /> {isRtl ? "متاح" : "Available"}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {isToday && item.status === "in_service" && (
                        <button
                          onClick={() => set86dMut.mutate({ productId: item.productId, is86d: !item.is86d, date: selectedDate })}
                          className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                            item.is86d
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-red-100 text-red-700 hover:bg-red-200"
                          }`}
                        >
                          {item.is86d ? (isRtl ? "إتاحة" : "Un-86") : (isRtl ? "إيقاف" : "86 it")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NEW PRODUCTION SETUP */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            {isRtl
              ? stock.length > 0 ? "إضافة أو تعديل كميات" : "إعداد الإنتاج الصباحي"
              : stock.length > 0 ? "Add / Update Quantities" : "Morning Production Setup"
            }
          </h3>
          <span className="text-xs text-gray-400">
            {products.length} {isRtl ? "منتج متاح" : "products available"}
          </span>
        </div>

        <div className="divide-y divide-gray-50">
          {products.filter((p: any) => p.isActive).map((p: any) => {
            const existing = stockMap.get(p.id);
            const inputVal = qtyInputs[p.id] ?? "";
            const hasInput = parseFloat(inputVal) > 0;

            return (
              <div key={p.id} className={`flex items-center gap-4 px-4 py-3 ${hasInput ? "bg-orange-50" : existing ? "bg-green-50" : ""}`}>
                {/* Product name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {isRtl ? (p.nameAr || p.name) : p.name}
                  </p>
                  {existing && (
                    <p className="text-xs text-green-600">
                      {isRtl ? `مُسجَّل: ${existing.totalAvailableQty} — متبقي: ${existing.remainingQty}` : `Logged: ${existing.totalAvailableQty} — Remaining: ${existing.remainingQty}`}
                    </p>
                  )}
                </div>

                {/* Qty input with +/- */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustQty(p.id, -1)}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    value={inputVal}
                    onChange={(e) => setQtyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder={existing ? String(existing.producedQty) : "0"}
                    min="0"
                    className={`w-20 text-center text-sm border rounded-lg py-1.5 font-medium ${hasInput ? "border-orange-400 bg-orange-50 text-orange-700" : "border-gray-200"}`}
                  />
                  <button
                    onClick={() => adjustQty(p.id, 1)}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-green-100 hover:text-green-600 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                  <span className="text-xs text-gray-400 w-12 truncate">
                    {isRtl ? "حصة" : "portions"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save button */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {isRtl
              ? `${Object.values(qtyInputs).filter((v) => parseFloat(v) > 0).length} منتج سيتم تسجيله`
              : `${Object.values(qtyInputs).filter((v) => parseFloat(v) > 0).length} products will be logged`
            }
          </p>
          <button
            onClick={handleSaveAll}
            disabled={!anyInput || saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={15} />
            {saving ? (isRtl ? "جاري الحفظ..." : "Saving...") : (isRtl ? "حفظ وتفعيل الإنتاج" : "Save & Activate for Service")}
          </button>
        </div>
      </div>
    </div>
  );
}
