import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ShoppingCart, Plus, Trash2, Send, CheckCircle2, Clock,
  PackageCheck, XCircle, Wand2, Eye, ChevronDown, ChevronUp,
  FileText,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type POStatus = "draft" | "sent" | "confirmed" | "received" | "cancelled";

const STATUS_CONFIG: Record<POStatus, { label: string; color: string; bg: string; border: string; icon: any }> = {
  draft:     { label: "مسودة",     color: "text-gray-700",    bg: "bg-gray-100",    border: "border-gray-300",    icon: FileText },
  sent:      { label: "مُرسل",     color: "text-blue-700",    bg: "bg-blue-100",    border: "border-blue-300",    icon: Send },
  confirmed: { label: "مؤكد",      color: "text-amber-700",   bg: "bg-amber-100",   border: "border-amber-300",   icon: CheckCircle2 },
  received:  { label: "مستلم",     color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-300", icon: PackageCheck },
  cancelled: { label: "ملغي",      color: "text-red-700",     bg: "bg-red-100",     border: "border-red-300",     icon: XCircle },
};

const STATUS_ORDER: POStatus[] = ["draft", "sent", "confirmed", "received"];

const NEXT_STATUS: Partial<Record<POStatus, POStatus>> = {
  draft: "sent",
  sent: "confirmed",
  confirmed: "received",
};

const NEXT_LABEL: Partial<Record<POStatus, string>> = {
  draft: "إرسال للمورد",
  sent: "تأكيد",
  confirmed: "استلام",
};

function fmt(n: number) {
  return n.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface POItemForm {
  materialId: number | null;
  materialName: string;
  unit: string;
  requestedQty: number;
  unitPrice: number;
  notes: string;
}

const emptyItem = (): POItemForm => ({ materialId: null, materialName: "", unit: "", requestedQty: 1, unitPrice: 0, notes: "" });

export default function PurchaseOrdersPage() {
  const { isRTL } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [waDialogId, setWaDialogId] = useState<number | null>(null);
  const [waNumberId, setWaNumberId] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form state
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [poNotes, setPoNotes] = useState("");
  const [items, setItems] = useState<POItemForm[]>([emptyItem()]);

  const { data: orders = [], refetch } = trpc.purchaseOrders.list.useQuery(
    { status: statusFilter !== "all" ? statusFilter as POStatus : undefined }
  );
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery();
  const { data: materials = [] } = trpc.materials.list.useQuery();
  const { data: waInstances = [] } = trpc.waInstances.list.useQuery();

  const createMutation = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => { toast.success("تم إنشاء طلب الشراء"); setDialogOpen(false); resetForm(); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateStatusMutation = trpc.purchaseOrders.updateStatus.useMutation({
    onSuccess: () => { toast.success("تم تحديث الحالة"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.purchaseOrders.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف طلب الشراء"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const sendWaMutation = trpc.purchaseOrders.sendToSupplier.useMutation({
    onSuccess: (d) => { toast.success(`✅ تم إرسال الطلب للمورد على ${d.phone}`); setWaDialogId(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const autoGenerateMutation = trpc.purchaseOrders.autoGenerate.useMutation({
    onSuccess: (d) => {
      toast.success(`تم إنشاء ${d.ordersCreated} طلب شراء لـ ${d.itemsCount} صنف ناقص`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setSupplierId(null);
    setPoNotes("");
    setItems([emptyItem()]);
  }

  function updateItem(idx: number, field: keyof POItemForm, value: any) {
    setItems(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: value };
      // Auto-fill name/unit from material selection
      if (field === "materialId" && value) {
        const mat = (materials as any[]).find(m => m.id === Number(value));
        if (mat) {
          arr[idx].materialName = mat.nameAr || mat.name;
          arr[idx].unit = mat.unit ?? "";
        }
      }
      return arr;
    });
  }

  function handleCreate() {
    const validItems = items.filter(i => i.materialId && i.requestedQty > 0);
    if (!validItems.length) return toast.error("أضف صنفاً واحداً على الأقل");
    const selectedSupplier = supplierId ? (suppliers as any[]).find(s => s.id === supplierId) : null;
    createMutation.mutate({
      supplierId: supplierId ?? undefined,
      supplierName: selectedSupplier ? (selectedSupplier.nameAr || selectedSupplier.name) : undefined,
      notes: poNotes || undefined,
      items: validItems.map(i => ({
        materialId: i.materialId!,
        materialName: i.materialName,
        unit: i.unit || undefined,
        requestedQty: i.requestedQty,
        unitPrice: i.unitPrice || undefined,
        notes: i.notes || undefined,
      })),
    });
  }

  const totalAmount = items.reduce((sum, i) => sum + (i.requestedQty * i.unitPrice), 0);

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">طلبات الشراء</h1>
            <p className="text-sm text-muted-foreground">إدارة طلبات الشراء وإرسالها للموردين</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"
            onClick={() => autoGenerateMutation.mutate({})}
            disabled={autoGenerateMutation.isPending}
            className="border-amber-300 text-amber-700 hover:bg-amber-50">
            <Wand2 className="w-4 h-4 ml-2" />
            {autoGenerateMutation.isPending ? "جاري الإنشاء..." : "توليد تلقائي (مخزون ناقص)"}
          </Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 ml-2" /> طلب شراء جديد
          </Button>
        </div>
      </div>

      {/* Status pipeline summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["all", ...STATUS_ORDER, "cancelled"] as const).map(s => {
          const count = s === "all"
            ? (orders as any[]).length
            : (orders as any[]).filter((o: any) => o.status === s).length;
          const cfg = s === "all" ? null : STATUS_CONFIG[s as POStatus];
          return (
            <Card key={s} className={`cursor-pointer transition-all border-2 ${statusFilter === s ? "ring-2 ring-primary ring-offset-1" : ""}`}
              onClick={() => setStatusFilter(s)}>
              <CardContent className="pt-4 pb-3 text-center">
                {cfg && <cfg.icon className={`w-5 h-5 mx-auto mb-1 ${cfg.color}`} />}
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{s === "all" ? "الكل" : cfg!.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Orders list */}
      <Card>
        <CardContent className="p-0">
          {(orders as any[]).length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">لا توجد طلبات شراء. اضغط "طلب شراء جديد" أو استخدم التوليد التلقائي.</div>
          ) : (
            <div className="divide-y">
              {(orders as any[]).map((order: any) => {
                const cfg = STATUS_CONFIG[order.status as POStatus];
                const StatusIcon = cfg.icon;
                const isExpanded = expandedId === order.id;
                const nextStatus = NEXT_STATUS[order.status as POStatus];

                return (
                  <div key={order.id} className="p-4 hover:bg-muted/20 transition-colors">
                    {/* Row header */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <Badge className={`${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                          <StatusIcon className="w-3 h-3 ml-1" />{cfg.label}
                        </Badge>
                        <div>
                          <span className="font-bold text-sm">{order.orderNumber}</span>
                          {order.supplierName && <span className="text-muted-foreground text-sm mr-2">← {order.supplierName}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground">{order.itemCount ?? 0} صنف</span>
                        {order.totalAmount > 0 && <span className="text-sm font-semibold">{fmt(order.totalAmount)} AED</span>}
                        <span className="text-xs text-muted-foreground">{order.createdAt?.split("T")[0]}</span>

                        {/* Action buttons */}
                        {nextStatus && (
                          <Button size="sm" variant="outline" className="text-xs"
                            onClick={() => updateStatusMutation.mutate({ id: order.id, status: nextStatus })}
                            disabled={updateStatusMutation.isPending}>
                            {NEXT_LABEL[order.status as POStatus]}
                          </Button>
                        )}
                        {(order.status === "draft" || order.status === "sent") && order.supplierWhatsapp && (
                          <Button size="sm" variant="outline"
                            className="text-xs border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => setWaDialogId(order.id)}>
                            <Send className="w-3 h-3 ml-1" /> واتساب
                          </Button>
                        )}
                        {order.status === "draft" && (
                          <Button size="sm" variant="ghost"
                            className="text-xs text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate({ id: order.id })}
                            disabled={deleteMutation.isPending}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && order.items && (
                      <div className="mt-3 rounded-lg border bg-muted/30 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-right">المادة</th>
                              <th className="px-3 py-2 text-center">الكمية</th>
                              <th className="px-3 py-2 text-center">سعر الوحدة</th>
                              <th className="px-3 py-2 text-center">الإجمالي</th>
                              <th className="px-3 py-2 text-right">ملاحظات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((it: any) => (
                              <tr key={it.id} className="border-t">
                                <td className="px-3 py-2 font-medium">{it.materialName}</td>
                                <td className="px-3 py-2 text-center">{it.requestedQty} {it.unit}</td>
                                <td className="px-3 py-2 text-center">{it.unitPrice ? `${fmt(it.unitPrice)} AED` : "—"}</td>
                                <td className="px-3 py-2 text-center">{it.totalPrice ? `${fmt(it.totalPrice)} AED` : "—"}</td>
                                <td className="px-3 py-2 text-muted-foreground">{it.notes || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {order.notes && (
                          <div className="px-3 py-2 border-t text-xs text-muted-foreground">ملاحظات: {order.notes}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create PO Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>طلب شراء جديد</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Supplier */}
            <div className="space-y-1">
              <Label>المورد (اختياري)</Label>
              <Select value={supplierId?.toString() ?? ""} onValueChange={v => setSupplierId(Number(v) || null)}>
                <SelectTrigger><SelectValue placeholder="اختر المورد..." /></SelectTrigger>
                <SelectContent>
                  {(suppliers as any[]).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.nameAr || s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>الأصناف</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setItems(p => [...p, emptyItem()])}>
                  <Plus className="w-3 h-3 ml-1" /> إضافة صنف
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-right">المادة</th>
                      <th className="px-3 py-2 text-center w-24">الكمية</th>
                      <th className="px-3 py-2 text-center w-28">سعر الوحدة</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-2 py-1">
                          <Select value={item.materialId?.toString() ?? ""} onValueChange={v => updateItem(idx, "materialId", Number(v))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر..." /></SelectTrigger>
                            <SelectContent>
                              {(materials as any[]).map((m: any) => (
                                <SelectItem key={m.id} value={String(m.id)}>{m.nameAr || m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1">
                          <Input type="number" min={0.001} step={0.001} value={item.requestedQty}
                            onChange={e => updateItem(idx, "requestedQty", parseFloat(e.target.value) || 0)}
                            className="h-8 text-center text-xs w-full" />
                        </td>
                        <td className="px-2 py-1">
                          <Input type="number" min={0} step={0.01} value={item.unitPrice}
                            onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="h-8 text-center text-xs w-full" />
                        </td>
                        <td className="px-2 py-1">
                          {items.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setItems(p => p.filter((_, i) => i !== idx))}>
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totalAmount > 0 && (
                    <tfoot>
                      <tr className="bg-muted/30 border-t font-bold">
                        <td className="px-3 py-2">الإجمالي</td>
                        <td colSpan={3} className="px-3 py-2 text-center">{fmt(totalAmount)} AED</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>ملاحظات (اختياري)</Label>
              <Textarea value={poNotes} onChange={e => setPoNotes(e.target.value)} rows={2} placeholder="أي تعليمات خاصة بهذا الطلب..." />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-teal-600 hover:bg-teal-700">
              {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء طلب الشراء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Send Dialog */}
      <Dialog open={waDialogId !== null} onOpenChange={() => setWaDialogId(null)}>
        <DialogContent dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>إرسال الطلب عبر واتساب</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">اختر نسخة واتساب لإرسال الطلب من خلالها</p>
            <Select value={waNumberId} onValueChange={setWaNumberId}>
              <SelectTrigger><SelectValue placeholder="اختر نسخة واتساب..." /></SelectTrigger>
              <SelectContent>
                {(waInstances as any[]).map((inst: any) => (
                  <SelectItem key={inst.id} value={String(inst.id)}>{inst.instanceName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWaDialogId(null)}>إلغاء</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!waNumberId || sendWaMutation.isPending}
              onClick={() => waDialogId && sendWaMutation.mutate({ id: waDialogId, waNumberId: Number(waNumberId) })}>
              <Send className="w-4 h-4 ml-2" />
              {sendWaMutation.isPending ? "جاري الإرسال..." : "إرسال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
