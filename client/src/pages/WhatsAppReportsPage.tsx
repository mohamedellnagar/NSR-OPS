import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, MessageSquare, Trash2, Send, Power, Settings as SettingsIcon, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Recipient = { phoneNumber: string; name?: string };

const REPORT_TYPES = [
  { value: "daily_sales", labelEn: "Daily Sales", labelAr: "المبيعات اليومية" },
  { value: "orders_summary", labelEn: "Orders Summary", labelAr: "ملخص الطلبات" },
  { value: "kitchen_cost", labelEn: "Kitchen Cost", labelAr: "تكلفة المطبخ" },
  { value: "inventory_value", labelEn: "Inventory Value", labelAr: "قيمة المخزون" },
  { value: "waste_summary", labelEn: "Waste Summary", labelAr: "ملخص الهدر" },
  { value: "system_alerts", labelEn: "System Alerts", labelAr: "تنبيهات النظام" },
  { value: "warehouse_performance", labelEn: "Warehouse Performance", labelAr: "أداء المخزن" },
];

export default function WhatsAppReportsPage() {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";

  const [showSubModal, setShowSubModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [subForm, setSubForm] = useState({
    name: "",
    reportType: "daily_sales",
    scheduleType: "daily" as "hourly" | "daily" | "weekly" | "monthly" | "instant",
    scheduleHour: 8,
    scheduleDay: 1,
    scheduleEveryHours: 4,
    recipients: [{ phoneNumber: "", name: "" }] as Recipient[],
  });

  const [settingsForm, setSettingsForm] = useState({
    evolutionApiUrl: "",
    evolutionApiKey: "",
    evolutionInstance: "",
  });

  const utils = trpc.useUtils();
  const { data: subs, isLoading } = trpc.whatsapp.listSubscriptions.useQuery();
  const { data: settings } = trpc.whatsapp.getSettings.useQuery();

  const createMutation = trpc.whatsapp.createSubscription.useMutation({
    onSuccess: () => { utils.whatsapp.listSubscriptions.invalidate(); toast.success(t("success") || "Created"); closeSubModal(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.whatsapp.updateSubscription.useMutation({
    onSuccess: () => { utils.whatsapp.listSubscriptions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.whatsapp.deleteSubscription.useMutation({
    onSuccess: () => { utils.whatsapp.listSubscriptions.invalidate(); toast.success(t("success") || "Deleted"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });
  const sendNowMutation = trpc.whatsapp.sendNow.useMutation({
    onSuccess: () => toast.success(language === "ar" ? "تم الإرسال" : "Sent"),
    onError: (e) => toast.error(e.message),
  });
  const saveSettingsMutation = trpc.whatsapp.saveSettings.useMutation({
    onSuccess: () => { utils.whatsapp.getSettings.invalidate(); toast.success(t("success") || "Saved"); setShowSettings(false); },
    onError: (e) => toast.error(e.message),
  });
  const testMutation = trpc.whatsapp.testConnection.useMutation({
    onSuccess: (r: any) => {
      if (r.connected) toast.success(language === "ar" ? "متصل ✓" : "Connected ✓");
      else toast.error(r.error || (language === "ar" ? "فشل الاتصال" : "Connection failed"));
    },
    onError: (e) => toast.error(e.message),
  });

  const closeSubModal = () => {
    setShowSubModal(false);
    setSubForm({
      name: "", reportType: "daily_sales", scheduleType: "daily",
      scheduleHour: 8, scheduleDay: 1, scheduleEveryHours: 4,
      recipients: [{ phoneNumber: "", name: "" }],
    });
  };

  const openSettings = () => {
    setSettingsForm({
      evolutionApiUrl: settings?.evolutionApiUrl || "",
      evolutionApiKey: "",
      evolutionInstance: settings?.evolutionInstance || "",
    });
    setShowSettings(true);
  };

  const handleSubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRecipients = subForm.recipients.filter((r) => r.phoneNumber.trim());
    if (!subForm.name.trim() || validRecipients.length === 0) {
      toast.error(language === "ar" ? "أدخل اسم ومستلم واحد على الأقل" : "Name and at least one recipient required");
      return;
    }
    createMutation.mutate({
      name: subForm.name.trim(),
      reportType: subForm.reportType,
      scheduleType: subForm.scheduleType,
      scheduleHour: subForm.scheduleHour,
      scheduleDay: subForm.scheduleDay,
      scheduleEveryHours: subForm.scheduleEveryHours,
      recipients: validRecipients.map((r) => ({ phoneNumber: r.phoneNumber.trim(), name: r.name?.trim() || undefined })),
    });
  };

  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm.evolutionApiUrl || !settingsForm.evolutionApiKey || !settingsForm.evolutionInstance) {
      toast.error(language === "ar" ? "أكمل كل الحقول" : "All fields required");
      return;
    }
    saveSettingsMutation.mutate(settingsForm);
  };

  const toggleActive = (sub: any) => {
    updateMutation.mutate({ id: sub.id, isActive: sub.isActive ? 0 : 1 });
  };

  const addRecipient = () => {
    setSubForm((f) => ({ ...f, recipients: [...f.recipients, { phoneNumber: "", name: "" }] }));
  };
  const removeRecipient = (idx: number) => {
    setSubForm((f) => ({ ...f, recipients: f.recipients.filter((_, i) => i !== idx) }));
  };
  const updateRecipient = (idx: number, field: keyof Recipient, val: string) => {
    setSubForm((f) => ({
      ...f,
      recipients: f.recipients.map((r, i) => (i === idx ? { ...r, [field]: val } : r)),
    }));
  };

  const reportTypeLabel = (rt: string) => {
    const r = REPORT_TYPES.find((x) => x.value === rt);
    return r ? (language === "ar" ? r.labelAr : r.labelEn) : rt;
  };

  const scheduleLabel = (sub: any) => {
    if (sub.scheduleType === "daily") return `${language === "ar" ? "يومياً" : "Daily"} @ ${String(sub.scheduleHour).padStart(2, "0")}:00`;
    if (sub.scheduleType === "hourly") return `${language === "ar" ? "كل" : "Every"} ${sub.scheduleEveryHours}h`;
    if (sub.scheduleType === "weekly") return `${language === "ar" ? "أسبوعياً" : "Weekly"}`;
    if (sub.scheduleType === "monthly") return `${language === "ar" ? "شهرياً يوم" : "Monthly day"} ${sub.scheduleDay}`;
    return sub.scheduleType;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold text-foreground">
            {language === "ar" ? "تقارير WhatsApp" : "WhatsApp Reports"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {subs?.length ?? 0} {language === "ar" ? "اشتراك" : "subscriptions"}
            {settings?.isConfigured ? (
              <span className="ms-2 text-emerald-600">· {language === "ar" ? "متصل" : "configured"}</span>
            ) : (
              <span className="ms-2 text-amber-600">· {language === "ar" ? "غير مُعد" : "not configured"}</span>
            )}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button variant="outline" onClick={openSettings} className="gap-2">
            <SettingsIcon size={16} />
            {language === "ar" ? "إعدادات Evolution" : "Settings"}
          </Button>
          {canWrite && (
            <Button onClick={() => setShowSubModal(true)} className="gap-2">
              <Plus size={16} />
              {language === "ar" ? "اشتراك جديد" : "New Subscription"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-5 h-32 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))
        ) : !subs?.length ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquare size={40} className="mb-3 opacity-30" />
            <p>{t("noData") || (language === "ar" ? "لا توجد اشتراكات" : "No subscriptions")}</p>
          </div>
        ) : (
          subs.map((sub: any) => (
            <div key={sub.id} className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <div className={`flex items-start justify-between gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
                  <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <h3 className="font-semibold text-foreground">{sub.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${sub.isActive ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {sub.isActive ? (language === "ar" ? "نشط" : "Active") : (language === "ar" ? "متوقف" : "Inactive")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{reportTypeLabel(sub.reportType)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{scheduleLabel(sub)}</p>
                </div>
                {canWrite && (
                  <div className={`flex gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <Button variant="ghost" size="sm" onClick={() => sendNowMutation.mutate({ id: sub.id })} className="h-8 w-8 p-0" title={language === "ar" ? "إرسال الآن" : "Send now"}>
                      <Send size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(sub)} className="h-8 w-8 p-0" title={language === "ar" ? "تفعيل/إيقاف" : "Toggle"}>
                      <Power size={14} className={sub.isActive ? "text-emerald-600" : ""} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(sub.id)} className="h-8 w-8 p-0 hover:text-destructive">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </div>
              {sub.recipients && sub.recipients.length > 0 && (
                <div className={`mt-3 pt-3 border-t border-border space-y-1 ${isRTL ? "text-right" : ""}`}>
                  <p className="text-xs font-medium text-muted-foreground">{language === "ar" ? "المستلمون" : "Recipients"}:</p>
                  {sub.recipients.slice(0, 3).map((r: any) => (
                    <div key={r.id} className={`flex items-center gap-2 text-xs ${isRTL ? "flex-row-reverse" : ""}`}>
                      <Phone size={12} className="text-muted-foreground" />
                      <span>{r.name || r.phoneNumber}</span>
                      {r.name && <span className="text-muted-foreground">{r.phoneNumber}</span>}
                    </div>
                  ))}
                  {sub.recipients.length > 3 && (
                    <p className="text-xs text-muted-foreground">+{sub.recipients.length - 3} {language === "ar" ? "آخرون" : "more"}</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={showSubModal} onOpenChange={(o) => !o && closeSubModal()}>
        <DialogContent className="max-w-lg" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "اشتراك جديد" : "New Subscription"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubSubmit} className="space-y-4">
            <div>
              <Label>{language === "ar" ? "اسم الاشتراك" : "Subscription Name"} *</Label>
              <Input value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <Label>{language === "ar" ? "نوع التقرير" : "Report Type"}</Label>
              <select
                value={subForm.reportType}
                onChange={(e) => setSubForm((f) => ({ ...f, reportType: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                {REPORT_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {language === "ar" ? rt.labelAr : rt.labelEn}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{language === "ar" ? "الجدولة" : "Schedule"}</Label>
                <select
                  value={subForm.scheduleType}
                  onChange={(e) => setSubForm((f) => ({ ...f, scheduleType: e.target.value as any }))}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="hourly">{language === "ar" ? "كل ساعة/ساعات" : "Hourly"}</option>
                  <option value="daily">{language === "ar" ? "يومياً" : "Daily"}</option>
                  <option value="weekly">{language === "ar" ? "أسبوعياً" : "Weekly"}</option>
                  <option value="monthly">{language === "ar" ? "شهرياً" : "Monthly"}</option>
                  <option value="instant">{language === "ar" ? "فوري" : "Instant"}</option>
                </select>
              </div>
              {subForm.scheduleType === "daily" && (
                <div>
                  <Label>{language === "ar" ? "الساعة" : "Hour"} (0-23)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={subForm.scheduleHour}
                    onChange={(e) => setSubForm((f) => ({ ...f, scheduleHour: Number(e.target.value) || 0 }))}
                  />
                </div>
              )}
              {subForm.scheduleType === "hourly" && (
                <div>
                  <Label>{language === "ar" ? "كل كم ساعة" : "Every N hours"}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={subForm.scheduleEveryHours}
                    onChange={(e) => setSubForm((f) => ({ ...f, scheduleEveryHours: Number(e.target.value) || 1 }))}
                  />
                </div>
              )}
              {subForm.scheduleType === "monthly" && (
                <div>
                  <Label>{language === "ar" ? "يوم الشهر" : "Day of month"}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={subForm.scheduleDay}
                    onChange={(e) => setSubForm((f) => ({ ...f, scheduleDay: Number(e.target.value) || 1 }))}
                  />
                </div>
              )}
            </div>
            <div>
              <div className={`flex items-center justify-between mb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <Label>{language === "ar" ? "المستلمون" : "Recipients"} *</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addRecipient} className="h-7 gap-1">
                  <Plus size={12} /> {language === "ar" ? "إضافة" : "Add"}
                </Button>
              </div>
              <div className="space-y-2">
                {subForm.recipients.map((r, i) => (
                  <div key={i} className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <Input
                      placeholder={language === "ar" ? "الرقم (e.g., 971501234567)" : "Phone (e.g., 971501234567)"}
                      value={r.phoneNumber}
                      onChange={(e) => updateRecipient(i, "phoneNumber", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder={language === "ar" ? "الاسم (اختياري)" : "Name (optional)"}
                      value={r.name || ""}
                      onChange={(e) => updateRecipient(i, "name", e.target.value)}
                      className="flex-1"
                    />
                    {subForm.recipients.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRecipient(i)} className="h-10 w-10 p-0">
                        <X size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className={isRTL ? "flex-row-reverse" : ""}>
              <Button type="button" variant="outline" onClick={closeSubModal}>{t("cancel") || "Cancel"}</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (t("loading") || "...") : (t("save") || "Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "إعدادات Evolution API" : "Evolution API Settings"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSettingsSubmit} className="space-y-4">
            <div>
              <Label>API URL *</Label>
              <Input
                type="url"
                value={settingsForm.evolutionApiUrl}
                onChange={(e) => setSettingsForm((f) => ({ ...f, evolutionApiUrl: e.target.value }))}
                placeholder="https://evolution.example.com"
                required
              />
            </div>
            <div>
              <Label>API Key *</Label>
              <Input
                type="password"
                value={settingsForm.evolutionApiKey}
                onChange={(e) => setSettingsForm((f) => ({ ...f, evolutionApiKey: e.target.value }))}
                placeholder={settings?.isConfigured ? "••••••••" : ""}
                required
              />
            </div>
            <div>
              <Label>Instance Name *</Label>
              <Input
                value={settingsForm.evolutionInstance}
                onChange={(e) => setSettingsForm((f) => ({ ...f, evolutionInstance: e.target.value }))}
                required
              />
            </div>
            <DialogFooter className={`gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <Button type="button" variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
                {language === "ar" ? "اختبار" : "Test"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowSettings(false)}>{t("cancel") || "Cancel"}</Button>
              <Button type="submit" disabled={saveSettingsMutation.isPending}>
                {saveSettingsMutation.isPending ? (t("loading") || "...") : (t("save") || "Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete") || (language === "ar" ? "تأكيد الحذف" : "Confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWarning") || (language === "ar" ? "لا يمكن التراجع" : "Cannot undo")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{t("cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete") || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
