import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, MessageSquare, Trash2, Send, Power, Settings as SettingsIcon, Phone, X, FileText, Pencil, Eye, Loader2 } from "lucide-react";
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

// Report types available for template editing (includes daily account summary)
const TEMPLATE_REPORT_TYPES = [
  ...REPORT_TYPES,
  { value: "daily_account_summary", labelEn: "Daily Account Summary", labelAr: "ملخص الحساب اليومي" },
  { value: "daily_financial_summary", labelEn: "Monthly Financial Summary", labelAr: "الملخص المالي الشهري" },
];

// Variables available per report type for the {{variable}} picker in the template editor.
// "common" variables are available for every report type.
const COMMON_VARIABLES = [
  { key: "report_date", label: "تاريخ التقرير" },
  { key: "current_month", label: "الشهر الحالي" },
  { key: "monthly_sales", label: "إجمالي المبيعات الشهرية" },
  { key: "monthly_net_sales", label: "صافي المبيعات الشهرية" },
  { key: "monthly_profit", label: "الربح الشهري" },
  { key: "monthly_kitchen_cost", label: "تكلفة المطبخ الشهرية" },
  { key: "monthly_diff", label: "الفرق الشهري" },
  { key: "monthly_cost_pct", label: "نسبة التكلفة الشهرية" },
  { key: "monthly_purchases", label: "المشتريات الشهرية" },
  { key: "monthly_invoice_count", label: "عدد فواتير الشهر" },
];

const VARIABLES_BY_TYPE: Record<string, { key: string; label: string }[]> = {
  daily_sales: [
    { key: "pos_reports_count", label: "عدد تقارير المبيعات" },
    { key: "pos_total_sales", label: "إجمالي المبيعات" },
    { key: "pos_net_sales", label: "صافي المبيعات" },
    { key: "pos_profit", label: "الربح" },
    { key: "kitchen_daily_cost", label: "تكلفة المطبخ اليومية" },
    { key: "daily_cost_pct", label: "نسبة التكلفة اليومية" },
    { key: "invoices_count", label: "عدد فواتير الموردين" },
    { key: "invoices_total", label: "إجمالي فواتير الموردين" },
    { key: "invoices_paid", label: "المدفوع من الفواتير" },
    { key: "invoices_pending", label: "المتبقي من الفواتير" },
    { key: "butcher_count", label: "عدد مبيعات الملحمة" },
    { key: "butcher_total", label: "إجمالي مبيعات الملحمة" },
  ],
  orders_summary: [
    { key: "fi_total", label: "عدد فواتير الموردين" },
    { key: "fi_amount", label: "إجمالي فواتير الموردين" },
    { key: "fi_paid", label: "عدد المدفوع" },
    { key: "fi_pending", label: "عدد المعلق" },
    { key: "fi_partial", label: "عدد المدفوع جزئياً" },
    { key: "fi_paid_amount", label: "قيمة المدفوع" },
    { key: "fi_pending_amount", label: "قيمة المعلق" },
    { key: "inv_total", label: "عدد فواتير الشراء" },
    { key: "inv_amount", label: "إجمالي فواتير الشراء" },
  ],
  kitchen_cost: [
    { key: "kitchen_pull_count", label: "عدد عمليات السحب" },
    { key: "kitchen_open_count", label: "عمليات سحب مفتوحة" },
    { key: "kitchen_closed_count", label: "عمليات سحب مغلقة" },
    { key: "kitchen_pull_qty", label: "كمية السحب" },
    { key: "kitchen_waste_qty", label: "كمية الهدر" },
    { key: "kitchen_daily_cost", label: "تكلفة المطبخ اليومية" },
    { key: "kitchen_daily_waste_cost", label: "تكلفة الهدر اليومية" },
    { key: "kitchen_materials_count", label: "عدد المواد المستخدمة" },
    { key: "kitchen_prod_count", label: "عدد عمليات الإنتاج" },
    { key: "kitchen_prod_cost", label: "تكلفة الإنتاج" },
    { key: "top_materials", label: "أعلى المواد استخداماً" },
    { key: "kitchen_top1", label: "الأعلى استخداماً #1" },
    { key: "kitchen_top2", label: "الأعلى استخداماً #2" },
    { key: "kitchen_top3", label: "الأعلى استخداماً #3" },
  ],
  inventory_value: [
    { key: "inv_total_items", label: "إجمالي عدد المواد" },
    { key: "inv_good_count", label: "مواد بمستوى جيد" },
    { key: "inv_low_count", label: "مواد منخفضة" },
    { key: "inv_out_count", label: "مواد منتهية" },
    { key: "inv_raw_value", label: "قيمة المواد الخام" },
    { key: "inv_mfg_value", label: "قيمة المواد المصنّعة" },
    { key: "inv_total_value", label: "إجمالي قيمة المخزون" },
    { key: "inv_low_list", label: "قائمة المواد المنخفضة" },
    { key: "inv_out_list", label: "قائمة المواد المنتهية" },
  ],
  waste_summary: [
    { key: "waste_entries", label: "عدد سجلات الهدر" },
    { key: "waste_materials", label: "عدد المواد المهدرة" },
    { key: "waste_qty", label: "كمية الهدر" },
    { key: "waste_cost", label: "تكلفة الهدر" },
    { key: "butcher_waste_entries", label: "سجلات هدر الملحمة" },
    { key: "butcher_waste_qty", label: "كمية هدر الملحمة" },
    { key: "butcher_waste_cost", label: "تكلفة هدر الملحمة" },
    { key: "kitchen_waste_qty", label: "كمية هدر المطبخ" },
    { key: "top_waste", label: "أعلى المواد هدراً" },
  ],
  system_alerts: [
    { key: "total_alerts", label: "إجمالي التنبيهات" },
    { key: "out_count", label: "عدد المواد المنتهية" },
    { key: "low_count", label: "عدد المواد المنخفضة" },
    { key: "out_materials", label: "قائمة المواد المنتهية" },
    { key: "low_materials", label: "قائمة المواد المنخفضة" },
  ],
  warehouse_performance: [
    { key: "wh_chicken", label: "كمية الدجاج" },
    { key: "wh_chicken_status", label: "حالة الدجاج" },
    { key: "wh_charcoal", label: "كمية الفحم" },
    { key: "wh_charcoal_status", label: "حالة الفحم" },
    { key: "wh_gas", label: "كمية الغاز" },
    { key: "wh_gas_status", label: "حالة الغاز" },
    { key: "wh_kofta", label: "كمية لحم الكفتة" },
    { key: "wh_kofta_status", label: "حالة لحم الكفتة" },
    { key: "wh_rice", label: "كمية الأرز" },
    { key: "wh_rice_status", label: "حالة الأرز" },
    { key: "inv_total_items", label: "إجمالي عدد المواد" },
    { key: "inv_out_count", label: "عدد المواد المنتهية" },
    { key: "inv_low_count", label: "عدد المواد المنخفضة" },
  ],
  daily_account_summary: [
    { key: "account_date", label: "التاريخ" },
    { key: "sales_cash", label: "مبيعات كاش" },
    { key: "sales_card", label: "مبيعات شبكة" },
    { key: "sales_kita", label: "مبيعات كيتا" },
    { key: "sales_orders", label: "مبيعات أوردرز" },
    { key: "sales_noon", label: "مبيعات نون" },
    { key: "sales_deliveroo", label: "مبيعات ديليفرو" },
    { key: "sales_careem", label: "مبيعات كريم" },
    { key: "sales_apps", label: "إجمالي مبيعات التطبيقات" },
    { key: "total_sales", label: "إجمالي المبيعات" },
    { key: "expenses_supplier", label: "مصروفات الموردين" },
    { key: "expenses_free", label: "مصروفات حرة" },
    { key: "expenses_fixed", label: "مصروفات ثابتة" },
    { key: "total_expenses", label: "إجمالي المصروفات" },
    { key: "supply_restaurant", label: "توريد للمطعم" },
    { key: "supply_management", label: "توريد للإدارة" },
    { key: "supply_extra", label: "توريد إضافي" },
    { key: "carry_from_prev", label: "مرحّل من السابق" },
    { key: "carry_to_next", label: "مرحّل للتالي" },
    { key: "net_profit", label: "الربح الصافي" },
    { key: "notes", label: "ملاحظات" },
  ],
  daily_financial_summary: [
    { key: "account_month", label: "الشهر" },
    { key: "days_recorded", label: "عدد الأيام المسجلة" },
    { key: "net_sales", label: "صافي المبيعات" },
    { key: "gross_profit", label: "مجمل الربح" },
    { key: "gross_margin", label: "نسبة مجمل الربح" },
    { key: "cogs_value", label: "تكلفة البضاعة" },
    { key: "cogs_pct", label: "نسبة تكلفة البضاعة" },
    { key: "op_paid", label: "تشغيلية مدفوعة" },
    { key: "op_deferred", label: "تشغيلية مؤجلة" },
    { key: "opening_stock_value", label: "مخزون أول المدة" },
    { key: "opening_stock_date", label: "تاريخ مخزون أول المدة" },
    { key: "current_inventory_value", label: "قيمة المخزون الحالي" },
    { key: "raw_materials_value", label: "قيمة المواد الخام" },
    { key: "manufactured_value", label: "قيمة المواد المصنّعة" },
    { key: "butcher_value", label: "قيمة منتجات الجزار" },
    { key: "total_debt", label: "إجمالي المديونية" },
    { key: "supplier_debt", label: "مديونية الموردين" },
    { key: "free_debt", label: "مديونية الفواتير الحرة" },
    { key: "restaurant_percentage", label: "نسبة المطعم" },
    { key: "restaurant_received", label: "المستلم للمطعم" },
    { key: "restaurant_expected", label: "المفروض للمطعم" },
    { key: "restaurant_diff", label: "فرق المطعم" },
  ],
};

export default function WhatsAppReportsPage() {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const canWrite = user?.role !== "viewer";

  const [showSubModal, setShowSubModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState<{ id?: number; name: string; reportType: string; fullText: string }>({
    name: "", reportType: "daily_sales", fullText: "",
  });
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null);

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
  const { data: templates, isLoading: templatesLoading } = trpc.whatsapp.getTemplates.useQuery(undefined, { enabled: showTemplatesModal });

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
  const saveTemplateMutation = trpc.whatsapp.saveFullTextTemplate.useMutation({
    onSuccess: () => {
      utils.whatsapp.getTemplates.invalidate();
      toast.success(t("success") || (language === "ar" ? "تم الحفظ" : "Saved"));
      resetTemplateForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteTemplateMutation = trpc.whatsapp.deleteTemplate.useMutation({
    onSuccess: () => {
      utils.whatsapp.getTemplates.invalidate();
      toast.success(t("success") || (language === "ar" ? "تم الحذف" : "Deleted"));
      setDeleteTemplateId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const previewTemplateMutation = trpc.whatsapp.previewFullText.useMutation({
    onSuccess: (r: any) => setTemplatePreview(r.preview),
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

  const resetTemplateForm = () => {
    setTemplateForm({ name: "", reportType: "daily_sales", fullText: "" });
    setTemplatePreview(null);
  };

  const openEditTemplate = (tmpl: any) => {
    setTemplateForm({
      id: tmpl.id,
      name: tmpl.name || "",
      reportType: tmpl.reportType,
      fullText: tmpl.full_text || "",
    });
    setTemplatePreview(null);
  };

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const el = templateTextareaRef.current;
    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newText = el.value.slice(0, start) + token + el.value.slice(end);
      setTemplateForm((f) => ({ ...f, fullText: newText }));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setTemplateForm((f) => ({ ...f, fullText: f.fullText + token }));
    }
    setTemplatePreview(null);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.fullText.trim()) {
      toast.error(language === "ar" ? "أدخل اسم ونص القالب" : "Name and template text required");
      return;
    }
    saveTemplateMutation.mutate({
      id: templateForm.id,
      name: templateForm.name.trim(),
      reportType: templateForm.reportType,
      fullText: templateForm.fullText.trim(),
    });
  };

  const handlePreviewTemplate = () => {
    if (!templateForm.fullText.trim()) return;
    previewTemplateMutation.mutate({ fullText: templateForm.fullText.trim(), reportType: templateForm.reportType });
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

  const templateReportTypeLabel = (rt: string) => {
    const r = TEMPLATE_REPORT_TYPES.find((x) => x.value === rt);
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
          <Button variant="outline" onClick={() => { resetTemplateForm(); setShowTemplatesModal(true); }} className="gap-2">
            <FileText size={16} />
            {language === "ar" ? "قوالب التقارير" : "Report Templates"}
          </Button>
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

      <Dialog open={showTemplatesModal} onOpenChange={(o) => { setShowTemplatesModal(o); if (!o) resetTemplateForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{language === "ar" ? "قوالب التقارير" : "Report Templates"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className={isRTL ? "text-right" : ""}>
              <Label className="mb-2 block">{language === "ar" ? "القوالب الحالية" : "Existing templates"}</Label>
              {templatesLoading ? (
                <p className="text-sm text-muted-foreground">{t("loading") || "..."}</p>
              ) : !templates?.length ? (
                <p className="text-sm text-muted-foreground">{language === "ar" ? "لا توجد قوالب محفوظة" : "No saved templates"}</p>
              ) : (
                <div className="space-y-2">
                  {templates.map((tmpl: any) => (
                    <div key={tmpl.id} className={`flex items-center justify-between gap-3 rounded-lg border border-border p-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                      <div className={isRTL ? "text-right" : ""}>
                        <p className="font-medium text-foreground">{tmpl.name || templateReportTypeLabel(tmpl.reportType)}</p>
                        <p className="text-xs text-muted-foreground">{templateReportTypeLabel(tmpl.reportType)}</p>
                      </div>
                      <div className={`flex gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <Button variant="ghost" size="sm" onClick={() => openEditTemplate(tmpl)} className="h-8 w-8 p-0" title={language === "ar" ? "تعديل" : "Edit"}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTemplateId(tmpl.id)} className="h-8 w-8 p-0" title={language === "ar" ? "حذف" : "Delete"}>
                          <Trash2 size={14} className="text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <Label className="mb-2 block">
                {templateForm.id ? (language === "ar" ? "تعديل القالب" : "Edit template") : (language === "ar" ? "قالب جديد" : "New template")}
              </Label>
              <form onSubmit={handleSaveTemplate} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block">{language === "ar" ? "اسم القالب" : "Template name"}</Label>
                    <Input
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={language === "ar" ? "مثال: تقرير المبيعات اليومي" : "e.g. Daily sales report"}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block">{language === "ar" ? "نوع التقرير" : "Report type"}</Label>
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={templateForm.reportType}
                      onChange={(e) => { setTemplateForm((f) => ({ ...f, reportType: e.target.value })); setTemplatePreview(null); }}
                    >
                      {!TEMPLATE_REPORT_TYPES.some((rt) => rt.value === templateForm.reportType) && (
                        <option value={templateForm.reportType}>{templateForm.reportType}</option>
                      )}
                      {TEMPLATE_REPORT_TYPES.map((rt) => (
                        <option key={rt.value} value={rt.value}>
                          {language === "ar" ? rt.labelAr : rt.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="mb-1 block">{language === "ar" ? "نص القالب" : "Template text"}</Label>
                  <Textarea
                    ref={templateTextareaRef}
                    value={templateForm.fullText}
                    onChange={(e) => { setTemplateForm((f) => ({ ...f, fullText: e.target.value })); setTemplatePreview(null); }}
                    rows={8}
                    dir={isRTL ? "rtl" : "ltr"}
                    placeholder={language === "ar" ? "اكتب نص الرسالة، واستخدم المتغيرات أدناه" : "Write the message text, use the variables below"}
                  />
                </div>

                <div>
                  <Label className="mb-1 block">{language === "ar" ? "المتغيرات المتاحة (اضغط للإضافة)" : "Available variables (click to insert)"}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[...COMMON_VARIABLES, ...(VARIABLES_BY_TYPE[templateForm.reportType] || [])].map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="text-xs px-2 py-1 rounded-full border border-border bg-muted hover:bg-accent transition-colors"
                        title={`{{${v.key}}}`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {templatePreview !== null && (
                  <div className={isRTL ? "text-right" : ""}>
                    <Label className="mb-1 block">{language === "ar" ? "معاينة" : "Preview"}</Label>
                    <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm whitespace-pre-wrap" dir={isRTL ? "rtl" : "ltr"}>
                      {templatePreview}
                    </div>
                  </div>
                )}

                <DialogFooter className={`gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  {templateForm.id && (
                    <Button type="button" variant="outline" onClick={resetTemplateForm}>
                      {language === "ar" ? "قالب جديد" : "New template"}
                    </Button>
                  )}
                  <Button type="button" variant="outline" onClick={handlePreviewTemplate} disabled={previewTemplateMutation.isPending} className="gap-2">
                    {previewTemplateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                    {language === "ar" ? "معاينة" : "Preview"}
                  </Button>
                  <Button type="submit" disabled={saveTemplateMutation.isPending}>
                    {saveTemplateMutation.isPending ? (t("loading") || "...") : (t("save") || "Save")}
                  </Button>
                </DialogFooter>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTemplateId !== null} onOpenChange={(o) => !o && setDeleteTemplateId(null)}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete") || (language === "ar" ? "تأكيد الحذف" : "Confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWarning") || (language === "ar" ? "لا يمكن التراجع" : "Cannot undo")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{t("cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateId && deleteTemplateMutation.mutate({ id: deleteTemplateId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete") || "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
