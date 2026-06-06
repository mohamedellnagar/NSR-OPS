import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, Plus, Trash2, Pencil, Phone, MapPin, User, X, Package } from "lucide-react";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", area: "", building: "", floor: "", apartment: "", notes: "" });

  const utils = trpc.useUtils();
  const { data: customers = [], isLoading } = trpc.pos.customers.list.useQuery(
    { search: search.trim() || undefined },
    { refetchOnWindowFocus: false }
  );

  const upsertMut = trpc.pos.customers.upsert.useMutation({
    onSuccess: () => {
      utils.pos.customers.list.invalidate();
      toast.success(editTarget ? "تم التعديل" : "تم إضافة العميل");
      setShowDialog(false); setEditTarget(null);
      setForm({ name: "", phone: "", area: "", building: "", floor: "", apartment: "", notes: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.pos.customers.delete.useMutation({
    onSuccess: () => { utils.pos.customers.list.invalidate(); toast.success("تم الحذف"); },
    onError: (e: any) => toast.error(e.message),
  });

  function openAdd() { setEditTarget(null); setForm({ name: "", phone: "", area: "", building: "", floor: "", apartment: "", notes: "" }); setShowDialog(true); }
  function openEdit(c: any) { setEditTarget(c); setForm({ name: c.name, phone: c.phone, area: c.area ?? "", building: c.building ?? "", floor: c.floor ?? "", apartment: c.apartment ?? "", notes: c.notes ?? "" }); setShowDialog(true); }

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <User size={24} className="text-blue-600" />
            عملاء التوصيل
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">قاعدة بيانات عملاء الطلبات والتوصيل</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors">
          <Plus size={16} /> إضافة عميل
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الموبايل أو المنطقة..."
          className="w-full border border-gray-300 rounded-xl py-2.5 pr-9 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
        {search && <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">{(customers as any[]).length} عميل</span>
        <span>اضغط على أي عميل لتعديل بياناته</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
      ) : (customers as any[]).length === 0 ? (
        <div className="text-center py-16 text-gray-400 space-y-2">
          <User size={40} className="mx-auto opacity-30" />
          <p className="font-medium">{search ? "لا توجد نتائج" : "لا توجد عملاء بعد"}</p>
          {!search && <p className="text-xs">سيتم حفظ العملاء تلقائياً عند أول طلب توصيل</p>}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 font-semibold">
              <tr>
                <th className="py-3 px-4 text-right">العميل</th>
                <th className="py-3 px-4 text-right">الموبايل</th>
                <th className="py-3 px-4 text-right">العنوان</th>
                <th className="py-3 px-4 text-center">الطلبات</th>
                <th className="py-3 px-4 text-center">آخر طلب</th>
                <th className="py-3 px-4 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(customers as any[]).map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => openEdit(c)}>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {c.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-800">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600" dir="ltr">{c.phone}</td>
                  <td className="py-3 px-4 text-gray-500 text-xs">
                    {[c.area, c.building, c.floor && `ط${c.floor}`, c.apartment && `ش${c.apartment}`].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                      <Package size={11} /> {c.orderCount}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-xs text-gray-400">
                    {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("ar-AE", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-center">
                      <button onClick={() => openEdit(c)}
                        className="w-7 h-7 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg flex items-center justify-center transition-colors">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => confirm(`حذف "${c.name}"؟`) && deleteMut.mutate({ id: c.id })}
                        className="w-7 h-7 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg flex items-center justify-center transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[420px] max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-4">{editTarget ? "✎ تعديل العميل" : "➕ إضافة عميل جديد"}</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">👤 الاسم *</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    placeholder="الاسم الكامل" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">📱 الموبايل *</label>
                  <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                    placeholder="05xxxxxxxx" dir="ltr" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">📍 المنطقة *</label>
                  <input value={form.area} onChange={e => setForm(f => ({...f, area: e.target.value}))}
                    placeholder="المنطقة" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">🏢 المبنى *</label>
                  <input value={form.building} onChange={e => setForm(f => ({...f, building: e.target.value}))}
                    placeholder="اسم/رقم المبنى" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">🏗 الطابق</label>
                  <input value={form.floor} onChange={e => setForm(f => ({...f, floor: e.target.value}))}
                    placeholder="رقم الطابق" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">🚪 الشقة</label>
                  <input value={form.apartment} onChange={e => setForm(f => ({...f, apartment: e.target.value}))}
                    placeholder="رقم الشقة" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">📝 ملاحظات</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  rows={2} placeholder="ملاحظات خاصة بالعميل..."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowDialog(false); setEditTarget(null); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">إلغاء</button>
              <button
                disabled={!form.name.trim() || !form.phone.trim() || upsertMut.isPending}
                onClick={() => upsertMut.mutate({ name: form.name.trim(), phone: form.phone.trim(), area: form.area.trim() || undefined, building: form.building.trim() || undefined, floor: form.floor.trim() || undefined, apartment: form.apartment.trim() || undefined, notes: form.notes.trim() || undefined })}
                className="flex-[2] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                {upsertMut.isPending ? "⏳" : "✓"} {editTarget ? "حفظ التعديلات" : "إضافة العميل"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
