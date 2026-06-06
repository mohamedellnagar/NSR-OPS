import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Phone, Plus, RefreshCw, Wifi, WifiOff, Copy, Check, Trash2, Edit2, MessageSquare, Loader2, Globe, Key, Webhook, Activity } from "lucide-react";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const map: Record<string, { label: string; labelAr: string; badgeCls: string; bannerCls: string; icon: string }> = {
    connected:    { label: "Connected",    labelAr: "✅ متصل",          badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-300", bannerCls: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: "●" },
    disconnected: { label: "Disconnected", labelAr: "❌ غير متصل",      badgeCls: "bg-red-100 text-red-700 border-red-300",           bannerCls: "bg-red-50 border-red-200 text-red-800",           icon: "●" },
    connecting:   { label: "Connecting",   labelAr: "🔄 جارٍ الاتصال", badgeCls: "bg-amber-100 text-amber-700 border-amber-300",     bannerCls: "bg-amber-50 border-amber-200 text-amber-800",     icon: "●" },
    qr_pending:   { label: "QR Pending",   labelAr: "📱 في انتظار QR", badgeCls: "bg-blue-100 text-blue-700 border-blue-300",       bannerCls: "bg-blue-50 border-blue-200 text-blue-800",       icon: "●" },
    unknown:      { label: "Unknown",      labelAr: "❓ غير معروف",    badgeCls: "bg-slate-100 text-slate-600 border-slate-300",    bannerCls: "bg-slate-50 border-slate-200 text-slate-700",    icon: "●" },
  };
  const info = map[status] ?? map.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border-2 ${info.badgeCls}`}>
      <span className={`w-2 h-2 rounded-full ${status === "connected" ? "bg-emerald-500 animate-pulse" : status === "disconnected" ? "bg-red-500" : status === "connecting" ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`} />
      {ar ? info.labelAr : info.label}
    </span>
  );
}

function ConnectionBanner({ status }: { status: string }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  if (status === "connected") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-t-lg">
        <Wifi size={14} />
        {ar ? "الاتصال يعمل بشكل طبيعي" : "Connection is active"}
      </div>
    );
  }
  if (status === "disconnected") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-t-lg">
        <WifiOff size={14} />
        {ar ? "غير متصل — اضغط فحص للتحقق" : "Disconnected — press Check to verify"}
      </div>
    );
  }
  if (status === "connecting" || status === "qr_pending") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-t-lg">
        <Loader2 size={14} className="animate-spin" />
        {ar ? "جارٍ الاتصال..." : "Connecting..."}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-400 text-white text-sm font-medium rounded-t-lg">
      <RefreshCw size={14} />
      {ar ? "الحالة غير معروفة — اضغط فحص" : "Status unknown — press Check"}
    </div>
  );
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded flex-shrink-0"
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

const EMPTY = { label: "", phoneNumber: "", evolutionApiUrl: "", evolutionApiKey: "", evolutionInstance: "", webhookSecret: "" };

export default function WaNumbersPage() {
  const { language, isRTL } = useLanguage();
  const ar = language === "ar";
  const utils = trpc.useUtils();
  const { data: numbers = [], isLoading } = trpc.waNumbers.list.useQuery();

  const createM = trpc.waNumbers.create.useMutation({
    onSuccess: () => { utils.waNumbers.list.invalidate(); setShow(false); setForm(EMPTY); toast.success(ar ? "تم الإضافة" : "Added"); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateM = trpc.waNumbers.update.useMutation({
    onSuccess: () => { utils.waNumbers.list.invalidate(); setEditId(null); setForm(EMPTY); toast.success(ar ? "تم التحديث" : "Updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteM = trpc.waNumbers.delete.useMutation({
    onSuccess: () => { utils.waNumbers.list.invalidate(); setDelId(null); toast.success(ar ? "تم الحذف" : "Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
  const testM = trpc.waNumbers.testConnection.useMutation({
    onSuccess: (d: any) => {
      utils.waNumbers.list.invalidate();
      if (d.status === "connected") {
        toast.success(ar ? "✅ متصل — جاري سحب المحادثات والرسائل في الخلفية..." : "✅ Connected — syncing chats in background...");
      } else if (d.status === "disconnected") {
        toast.error(ar ? `❌ غير متصل${d.error ? ` (${d.error})` : ""}` : `❌ Disconnected${d.error ? ` (${d.error})` : ""}`);
      } else {
        toast.info(ar ? `حالة: ${d.status}` : `Status: ${d.status}`);
      }
    },
    onError: (e: any) => toast.error(ar ? `خطأ في الفحص: ${e.message}` : `Check failed: ${e.message}`),
  });
  const syncM = trpc.waNumbers.syncChats.useMutation({
    onSuccess: (d: any) => toast.success(ar ? `مزامنة: ${d.synced} محادثة` : `Synced: ${d.synced} chats`),
    onError: (e: any) => toast.error(e.message),
  });
  const fullSyncM = trpc.waNumbers.fullSync.useMutation({
    onSuccess: (d: any) => {
      utils.waNumbers.list.invalidate();
      toast.success(ar
        ? `✅ مزامنة كاملة: ${d.syncedChats} محادثة، ${d.totalMessages} رسالة، ${d.analyzedConversations} تحليل AI`
        : `✅ Full sync: ${d.syncedChats} chats, ${d.totalMessages} msgs, ${d.analyzedConversations} analyzed`);
    },
    onError: (e: any) => toast.error(ar ? `خطأ في المزامنة: ${e.message}` : `Sync failed: ${e.message}`),
  });

  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);

  const openEdit = (n: any) => {
    setForm({ label: n.label, phoneNumber: n.phoneNumber, evolutionApiUrl: n.evolutionApiUrl, evolutionApiKey: n.evolutionApiKey, evolutionInstance: n.evolutionInstance, webhookSecret: n.webhookSecret ?? "" });
    setEditId(n.id);
  };
  const submit = () => {
    const p = { label: form.label.trim(), phoneNumber: form.phoneNumber.trim(), evolutionApiUrl: form.evolutionApiUrl.trim(), evolutionApiKey: form.evolutionApiKey.trim(), evolutionInstance: form.evolutionInstance.trim(), webhookSecret: form.webhookSecret.trim() || undefined };
    if (editId !== null) { updateM.mutate({ id: editId, ...p }); } else { createM.mutate(p); }
  };
  const webhookBase = typeof window !== "undefined" ? window.location.origin : "";
  const nums = numbers as any[];

  return (
    <div className={`p-6 max-w-5xl mx-auto`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <MessageSquare className="text-emerald-600" size={20} />
            </div>
            {ar ? "أرقام الواتساب" : "WhatsApp Numbers"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {ar ? "إدارة الأرقام المتصلة عبر Evolution API" : "Manage numbers connected via Evolution API"}
          </p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setShow(true); }} className="gap-2">
          <Plus size={16} />{ar ? "إضافة رقم" : "Add Number"}
        </Button>
      </div>

      {/* Stats */}
      {nums.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center"><Wifi size={16} className="text-emerald-600" /></div>
              <div><p className="text-2xl font-bold">{nums.filter(n => n.connectionStatus === "connected").length}</p><p className="text-xs text-muted-foreground">{ar ? "متصل" : "Connected"}</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center"><WifiOff size={16} className="text-red-500" /></div>
              <div><p className="text-2xl font-bold">{nums.filter(n => n.connectionStatus !== "connected").length}</p><p className="text-xs text-muted-foreground">{ar ? "غير متصل" : "Disconnected"}</p></div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Phone size={16} className="text-primary" /></div>
              <div><p className="text-2xl font-bold">{nums.length}</p><p className="text-xs text-muted-foreground">{ar ? "إجمالي" : "Total"}</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted-foreground" size={32} />
        </div>
      )}

      {!isLoading && nums.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center"><MessageSquare size={28} className="text-muted-foreground" /></div>
            <div className="text-center">
              <p className="font-semibold">{ar ? "لا توجد أرقام مضافة" : "No numbers added yet"}</p>
              <p className="text-sm text-muted-foreground mt-1">{ar ? "أضف رقمك الأول للبدء" : "Add your first number to get started"}</p>
            </div>
            <Button onClick={() => { setForm(EMPTY); setShow(true); }} variant="outline" className="gap-2">
              <Plus size={16} />{ar ? "إضافة رقم" : "Add Number"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cards */}
      <div className="grid gap-4">
        {nums.map((num) => {
          const webhookUrl = `${webhookBase}/api/webhook/whatsapp/${num.evolutionInstance}`;
          const lastChecked = num.lastCheckedAt
            ? new Date(num.lastCheckedAt).toLocaleString(ar ? "ar-SA" : "en-US", { dateStyle: "short", timeStyle: "short" })
            : (ar ? "لم يُفحص" : "Never");
          return (
            <Card key={num.id} className="border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              <ConnectionBanner status={num.connectionStatus} />
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <Phone size={20} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{num.label}</h3>
                        <StatusBadge status={num.connectionStatus} />
                        {num.isActive === 0 && <Badge variant="secondary" className="text-xs">{ar ? "معطّل" : "Inactive"}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 font-mono">{num.phoneNumber}</p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                          <Globe size={12} className="flex-shrink-0" />
                          <span className="truncate font-mono">{num.evolutionApiUrl}</span>
                          <CopyBtn value={num.evolutionApiUrl} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                          <Activity size={12} className="flex-shrink-0" />
                          <span className="truncate font-mono">{num.evolutionInstance}</span>
                          <CopyBtn value={num.evolutionInstance} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 sm:col-span-2">
                          <Webhook size={12} className="flex-shrink-0" />
                          <span className="truncate font-mono">{webhookUrl}</span>
                          <CopyBtn value={webhookUrl} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{ar ? "آخر فحص" : "Last checked"}: {lastChecked}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => testM.mutate({ id: num.id, webhookOrigin: window.location.origin })} disabled={testM.isPending} className="gap-1.5 text-xs">
                      {testM.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {ar ? "فحص" : "Check"}
                    </Button>
                    <Button size="sm" variant="default" onClick={() => fullSyncM.mutate({ id: num.id, webhookOrigin: window.location.origin })} disabled={fullSyncM.isPending} className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                      {fullSyncM.isPending ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                      {ar ? "مزامنة كاملة" : "Full Sync"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => syncM.mutate({ id: num.id })} disabled={syncM.isPending} className="gap-1.5 text-xs">
                      {syncM.isPending ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                      {ar ? "مزامنة سريعة" : "Quick Sync"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(num)} className="gap-1.5 text-xs">
                      <Edit2 size={12} />{ar ? "تعديل" : "Edit"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDelId(num.id)} className="gap-1.5 text-xs text-destructive hover:text-destructive">
                      <Trash2 size={12} />{ar ? "حذف" : "Delete"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={show || editId !== null} onOpenChange={o => { if (!o) { setShow(false); setEditId(null); } }}>
        <DialogContent className="max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare size={18} className="text-emerald-600" />
              {editId !== null ? (ar ? "تعديل الرقم" : "Edit Number") : (ar ? "إضافة رقم واتساب" : "Add WhatsApp Number")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5"><Phone size={13} />{ar ? "الاسم" : "Label"}</Label>
              <Input placeholder={ar ? "الفرع الرئيسي" : "Main Branch"} value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5"><Phone size={13} />{ar ? "رقم الهاتف" : "Phone"}</Label>
              <Input placeholder="971501234567" dir="ltr" value={form.phoneNumber} onChange={e => setForm(p => ({ ...p, phoneNumber: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5"><Globe size={13} />{ar ? "رابط API" : "API URL"}</Label>
              <Input placeholder="https://evolution.example.com" dir="ltr" value={form.evolutionApiUrl} onChange={e => setForm(p => ({ ...p, evolutionApiUrl: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5"><Key size={13} />{ar ? "مفتاح API" : "API Key"}</Label>
              <Input placeholder="B6D11B..." dir="ltr" value={form.evolutionApiKey} onChange={e => setForm(p => ({ ...p, evolutionApiKey: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5"><Activity size={13} />{ar ? "اسم الـ Instance" : "Instance Name"}</Label>
              <Input placeholder="restaurant-main" dir="ltr" value={form.evolutionInstance} onChange={e => setForm(p => ({ ...p, evolutionInstance: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5"><Webhook size={13} />{ar ? "Webhook Secret (اختياري)" : "Webhook Secret (optional)"}</Label>
              <Input placeholder="" dir="ltr" value={form.webhookSecret} onChange={e => setForm(p => ({ ...p, webhookSecret: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <Button variant="outline" onClick={() => { setShow(false); setEditId(null); }}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={submit} disabled={createM.isPending || updateM.isPending || !form.label || !form.phoneNumber || !form.evolutionApiUrl || !form.evolutionApiKey || !form.evolutionInstance}>
              {(createM.isPending || updateM.isPending) && <Loader2 size={14} className="animate-spin me-1.5" />}
              {ar ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={delId !== null} onOpenChange={o => { if (!o) setDelId(null); }}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{ar ? "هل أنت متأكد؟" : "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>{ar ? "سيتم حذف جميع المحادثات المرتبطة." : "All associated conversations will be deleted."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => delId !== null && deleteM.mutate({ id: delId })}>
              {deleteM.isPending && <Loader2 size={14} className="animate-spin me-1.5" />}
              {ar ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
