import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check, Pencil, X, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";

const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string; logo: string }> = {
  talabat:   { bg: "bg-orange-50 dark:bg-orange-950/20",  text: "text-orange-700 dark:text-orange-300",  border: "border-orange-200 dark:border-orange-700/50", logo: "🟠" },
  noon:      { bg: "bg-yellow-50 dark:bg-yellow-950/20", text: "text-yellow-700 dark:text-yellow-300",  border: "border-yellow-200 dark:border-yellow-700/50", logo: "🟡" },
  keeta:     { bg: "bg-green-50 dark:bg-green-950/20",   text: "text-green-700 dark:text-green-300",    border: "border-green-200 dark:border-green-700/50",  logo: "🟢" },
  careem:    { bg: "bg-teal-50 dark:bg-teal-950/20",     text: "text-teal-700 dark:text-teal-300",      border: "border-teal-200 dark:border-teal-700/50",    logo: "🟦" },
  deliveroo: { bg: "bg-sky-50 dark:bg-sky-950/20",       text: "text-sky-700 dark:text-sky-300",        border: "border-sky-200 dark:border-sky-700/50",      logo: "🔵" },
};

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// سعر البيع = سعر المطعم × (1 + markup%)
function calcListPrice(restaurantPrice: number, markupRate: number) {
  return restaurantPrice * (1 + markupRate / 100);
}

// يدخل المطعم = سعر البيع × (1 − كوميشن% − خصم%) − توصيل
function calcRestaurantNet(listPrice: number, commissionRate: number, discountRate: number, deliveryFee: number) {
  return listPrice * (1 - commissionRate / 100 - discountRate / 100) - deliveryFee;
}

export default function DeliveryPricingPage() {
  const utils = trpc.useUtils();
  const { data: platforms = [], isLoading: platformsLoading } = trpc.deliveryPricing.getPlatforms.useQuery();
  const { data: products = [], isLoading: productsLoading } = trpc.deliveryPricing.getProducts.useQuery();
  const updatePlatformMut = trpc.deliveryPricing.updatePlatform.useMutation({
    onSuccess: () => { toast.success("تم تحديث إعدادات المنصة"); utils.deliveryPricing.getPlatforms.invalidate(); setEditingPlatform(null); },
    onError: (e) => toast.error(e.message),
  });

  const [editingPlatform, setEditingPlatform] = useState<number | null>(null);
  const [editMarkup, setEditMarkup] = useState("");
  const [editCommission, setEditCommission] = useState("");
  const [editDiscount, setEditDiscount] = useState("");
  const [editDeliveryFee, setEditDeliveryFee] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("الكل");

  const categories = ["الكل", ...Array.from(new Set(products.map((p: any) => p.categoryReference).filter(Boolean)))];
  const filtered = products.filter((p: any) => {
    const matchSearch = !search || p.name?.includes(search) || p.nameAr?.includes(search);
    const matchCat = selectedCategory === "الكل" || p.categoryReference === selectedCategory;
    return matchSearch && matchCat;
  });

  const isLoading = platformsLoading || productsLoading;

  return (
    <div className="p-4 space-y-4 max-w-full" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">أسعار التوصيل</h1>
        <p className="text-sm text-muted-foreground mt-0.5">سعر المطعم × (1 + كوميشن% + خصم%)</p>
      </div>

      {/* Platform Settings Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {platforms.map((p: any) => {
          const color = PLATFORM_COLORS[p.platform] ?? PLATFORM_COLORS.talabat;
          const isEditing = editingPlatform === p.id;
          return (
            <div key={p.id} className={`rounded-xl border ${color.border} ${color.bg} p-3`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-bold ${color.text}`}>{color.logo} {p.platformAr}</span>
                {!isEditing ? (
                  <button onClick={() => { setEditMarkup(String(p.markupRate ?? 55)); setEditCommission(String(p.commissionRate)); setEditDiscount(String(p.discountRate)); setEditDeliveryFee(String(p.deliveryFee ?? 0)); setEditingPlatform(p.id); }}
                    className="p-1 rounded hover:bg-white/50 transition-colors">
                    <Pencil className="w-3 h-3 text-slate-400" />
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={() => updatePlatformMut.mutate({ id: p.id, markupRate: parseFloat(editMarkup) || 0, commissionRate: parseFloat(editCommission) || 0, discountRate: parseFloat(editDiscount) || 0, deliveryFee: parseFloat(editDeliveryFee) || 0 })}
                      className="p-1 rounded hover:bg-emerald-100 text-emerald-600"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setEditingPlatform(null)} className="p-1 rounded hover:bg-red-100 text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-1.5">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">زيادة سعر البيع %</p>
                    <Input value={editMarkup} onChange={e => setEditMarkup(e.target.value)} type="number" className="h-7 text-sm" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">كوميشن %</p>
                    <Input value={editCommission} onChange={e => setEditCommission(e.target.value)} type="number" className="h-7 text-sm" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">خصم %</p>
                    <Input value={editDiscount} onChange={e => setEditDiscount(e.target.value)} type="number" className="h-7 text-sm" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-0.5">رسم توصيل د.إ</p>
                    <Input value={editDeliveryFee} onChange={e => setEditDeliveryFee(e.target.value)} type="number" className="h-7 text-sm" />
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className={`text-xs font-bold ${color.text}`}>سعر البيع: +<span>{p.markupRate ?? 55}%</span></p>
                  <p className={`text-xs ${color.text}`}>كوميشن: <span className="font-bold">{p.commissionRate}%</span></p>
                  <p className={`text-xs ${color.text}`}>خصم: <span className="font-bold">{p.discountRate}%</span></p>
                  <p className={`text-xs ${color.text}`}>توصيل: <span className="font-bold">{fmt(parseFloat(p.deliveryFee ?? 0))} د.إ</span></p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن وصفة..." className="h-8 w-48 text-sm" />
        <div className="flex gap-1 flex-wrap">
          {categories.map(c => (
            <button key={c} onClick={() => setSelectedCategory(c)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${selectedCategory === c ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing Table */}
      <div className="overflow-x-auto rounded-xl border shadow-sm bg-white dark:bg-card">
        <table className="w-full text-sm border-collapse" style={{ minWidth: '900px' }}>
          <thead>
            <tr className="border-b bg-slate-50 dark:bg-slate-800/50">
              <th className="text-right px-3 py-2.5 font-bold text-slate-700 dark:text-slate-200 sticky right-0 bg-slate-50 dark:bg-slate-800/50 z-10 min-w-[180px]">الوصفة</th>
              <th className="text-center px-3 py-2.5 font-bold text-slate-600 dark:text-slate-300 min-w-[100px]">سعر المطعم</th>
              {platforms.map((p: any) => {
                const color = PLATFORM_COLORS[p.platform] ?? PLATFORM_COLORS.talabat;
                return (
                  <th key={p.id} className={`text-center px-3 py-2.5 font-bold ${color.text} min-w-[100px]`}>
                    <div>{color.logo} {p.platformAr}</div>
                    <div className="text-[10px] font-normal opacity-70">+{(parseFloat(p.commissionRate) + parseFloat(p.discountRate)).toFixed(1)}%</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={2 + platforms.length} className="text-center py-12 text-muted-foreground">جار التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={2 + platforms.length} className="text-center py-12 text-muted-foreground">لا توجد وصفات</td></tr>
            ) : filtered.map((product: any, i: number) => {
              const restaurantPrice = parseFloat(product.price ?? 0);
              return (
                <tr key={product.id} className={`border-b transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30 ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/10'}`}>
                  <td className="px-3 py-2.5 sticky right-0 bg-white dark:bg-card z-10 border-l">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{product.nameAr || product.name}</p>
                    {product.categoryReference && <p className="text-[10px] text-muted-foreground">{product.categoryReference}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-200 border-l">
                    {fmt(restaurantPrice)} <span className="text-[10px] font-normal">د.إ</span>
                  </td>
                  {platforms.map((p: any) => {
                    const color = PLATFORM_COLORS[p.platform] ?? PLATFORM_COLORS.talabat;
                    const commission = parseFloat(p.commissionRate);
                    const discount = parseFloat(p.discountRate);
                    const deliveryFee = parseFloat(p.deliveryFee ?? 0);
                    const markupRate = parseFloat(p.markupRate ?? 55);
                    const listPrice = calcListPrice(restaurantPrice, markupRate);
                    const priceAfterDiscount = listPrice * (1 - discount / 100);
                    const netForRestaurant = calcRestaurantNet(listPrice, commission, discount, deliveryFee);
                    return (
                      <td key={p.id} className={`px-2 py-2 text-center border-l ${color.bg}`}>
                        {/* سعر البيع */}
                        <p className={`font-bold text-sm ${color.text}`}>{fmt(listPrice)}</p>
                        <p className="text-[10px] text-muted-foreground">سعر البيع</p>
                        {/* بعد الخصم */}
                        <div className="mt-1.5 pt-1.5 border-t border-black/10 dark:border-white/10">
                          <p className="font-semibold text-xs text-amber-600 dark:text-amber-400">{fmt(priceAfterDiscount)}</p>
                          <p className="text-[10px] text-muted-foreground">بعد الخصم {discount > 0 ? `(−${discount}%)` : ''}</p>
                        </div>
                        {/* يدخل المطعم */}
                        <div className="mt-1.5 pt-1.5 border-t border-black/10 dark:border-white/10">
                          <p className="font-bold text-xs text-emerald-600 dark:text-emerald-400">{fmt(netForRestaurant)}</p>
                          <p className="text-[10px] text-muted-foreground">يدخل المطعم</p>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-slate-100 dark:bg-slate-800/60">
                <td className="px-3 py-2 font-bold text-slate-700 sticky right-0 bg-slate-100 dark:bg-slate-800/60 z-10 border-l">
                  <div className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> متوسط الأسعار</div>
                </td>
                <td className="px-3 py-2 text-center font-bold text-slate-700 border-l">
                  {fmt(filtered.reduce((s: number, p: any) => s + parseFloat(p.price ?? 0), 0) / filtered.length)}
                </td>
                {platforms.map((p: any) => {
                  const color = PLATFORM_COLORS[p.platform] ?? PLATFORM_COLORS.talabat;
                  const avg = filtered.reduce((s: number, prod: any) => s + calcListPrice(parseFloat(prod.price ?? 0), parseFloat(p.markupRate ?? 55)), 0) / filtered.length;
                  return (
                    <td key={p.id} className={`px-3 py-2 text-center font-bold ${color.text} border-l`}>
                      {fmt(avg)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
