import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/NumericInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Building2, Clock, DollarSign, Globe, Phone, Mail, MapPin, Save, Loader2, Cloud, Database, RefreshCw, AlertTriangle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const TIMEZONES = [
  { value: "Asia/Dubai", label: "الإمارات (UTC+4)" },
  { value: "Asia/Riyadh", label: "السعودية (UTC+3)" },
  { value: "Asia/Kuwait", label: "الكويت (UTC+3)" },
  { value: "Asia/Qatar", label: "قطر (UTC+3)" },
  { value: "Asia/Bahrain", label: "البحرين (UTC+3)" },
  { value: "Asia/Muscat", label: "عُمان (UTC+4)" },
  { value: "Africa/Cairo", label: "مصر (UTC+2)" },
  { value: "Europe/London", label: "لندن (UTC+0/+1)" },
  { value: "UTC", label: "UTC" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? "12:00 ص (منتصف الليل)" :
    i < 12 ? `${i}:00 ص` :
    i === 12 ? "12:00 م (الظهر)" :
    `${i - 12}:00 م`,
}));

export default function SettingsPage() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حفظ الإعدادات بنجاح" : "Settings saved successfully");
    },
    onError: (e) => {
      toast.error(ar ? `خطأ: ${e.message}` : `Error: ${e.message}`);
    },
  });

  // ── Cloud Sync (TiDB → Local) ──
  const cloudStatus = trpc.settings.cloudSyncStatus.useQuery();
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ tablesCopied: number; totalRows: number; durationMs: number } | null>(null);
  const utils = trpc.useUtils();
  const syncMutation = trpc.settings.syncFromCloud.useMutation({
    onSuccess: (r: any) => {
      setLastSyncResult({ tablesCopied: r.tablesCopied, totalRows: r.totalRows, durationMs: r.durationMs });
      toast.success(ar
        ? `تم التحديث: ${r.tablesCopied} جدول، ${r.totalRows} صف`
        : `Synced: ${r.tablesCopied} tables, ${r.totalRows} rows`);
      utils.invalidate();
    },
    onError: (e) => toast.error(ar ? `فشل التحديث: ${e.message}` : `Sync failed: ${e.message}`),
  });

  const [smartSyncResult, setSmartSyncResult] = useState<{ tables: { table: string; strategy: string; rows: number }[]; durationMs: number } | null>(null);
  const smartSyncMut = trpc.settings.smartSyncFromCloud.useMutation({
    onSuccess: (r: any) => {
      setSmartSyncResult(r);
      const total = r.tables.reduce((s: number, t: any) => s + t.rows, 0);
      toast.success(`✅ تمت المزامنة الذكية — ${r.tables.length} جداول، ${total} صف`);
      utils.invalidate();
    },
    onError: (e) => toast.error(`فشلت المزامنة: ${e.message}`),
  });

  // File-based import
  // Excel template download
  const templateQuery = trpc.settings.downloadSyncTemplate.useQuery(undefined, { enabled: false });
  function downloadTemplate() {
    templateQuery.refetch().then(r => {
      if (!r.data) return;
      const link = document.createElement("a");
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${r.data.base64}`;
      link.download = r.data.filename;
      link.click();
    });
  }

  // Excel import
  const [excelImportResult, setExcelImportResult] = useState<{ tables: any[]; durationMs: number } | null>(null);
  const [excelImportLoading, setExcelImportLoading] = useState(false);
  const excelImportMut = trpc.settings.importSyncExcel.useMutation({
    onSuccess: (r: any) => {
      setExcelImportResult(r);
      const total = r.tables.reduce((s: number, t: any) => s + t.rows, 0);
      toast.success(`✅ تم الاستيراد — ${total} صف`);
      utils.invalidate();
      setExcelImportLoading(false);
    },
    onError: (e) => { toast.error(`فشل الاستيراد: ${e.message}`); setExcelImportLoading(false); },
  });

  function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelImportLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      excelImportMut.mutate({ base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const [importResult, setImportResult] = useState<{ tables: any[]; durationMs: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const importMut = trpc.settings.importSyncFile.useMutation({
    onSuccess: (r: any) => {
      setImportResult(r);
      const total = r.tables.reduce((s: number, t: any) => s + t.rows, 0);
      toast.success(`✅ تم الاستيراد — ${total} صف`);
      utils.invalidate();
    },
    onError: (e) => { toast.error(`فشل الاستيراد: ${e.message}`); setImportLoading(false); },
  });

  const [manusUrl, setManusUrl] = useState(() => localStorage.getItem("manusUrl") || "");

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target?.result as string);
        importMut.mutate({ payload });
      } catch {
        toast.error("ملف JSON غير صحيح");
        setImportLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleFetchFromManus() {
    if (!manusUrl.trim()) { toast.error("أدخل رابط Manus أولاً"); return; }
    localStorage.setItem("manusUrl", manusUrl.trim());
    setImportLoading(true);
    try {
      const base = manusUrl.trim().replace(/\/$/, "");
      const res  = await fetch(`${base}/api/export-sync-data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      importMut.mutate({ payload });
    } catch (e: any) {
      toast.error(`فشل الجلب: ${e.message}`);
      setImportLoading(false);
    }
  }

  const [form, setForm] = useState({
    restaurantName: "",
    restaurantNameEn: "",
    phone: "",
    phone2: "",
    email: "",
    address: "",
    city: "",
    country: "UAE",
    timezone: "Asia/Dubai",
    businessDayStartHour: 6,
    currency: "AED",
    currencySymbol: "د.إ",
    vatRate: "5.00",
    vatEnabled: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        restaurantName: settings.restaurantName ?? "",
        restaurantNameEn: settings.restaurantNameEn ?? "",
        phone: settings.phone ?? "",
        phone2: settings.phone2 ?? "",
        email: settings.email ?? "",
        address: settings.address ?? "",
        city: settings.city ?? "",
        country: settings.country ?? "UAE",
        timezone: settings.timezone ?? "Asia/Dubai",
        businessDayStartHour: settings.businessDayStartHour ?? 6,
        currency: settings.currency ?? "AED",
        currencySymbol: settings.currencySymbol ?? "د.إ",
        vatRate: settings.vatRate ?? "5.00",
        vatEnabled: settings.vatEnabled ?? true,
      });
    }
  }, [settings]);

  const set = (key: string, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    updateMutation.mutate({
      ...form,
      businessDayStartHour: Number(form.businessDayStartHour),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{ar ? "الإعدادات" : "Settings"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {ar ? "إعدادات المطعم والنظام" : "Restaurant and system settings"}
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ar ? "حفظ الإعدادات" : "Save Settings"}
        </Button>
      </div>

      {/* ─── Restaurant Info ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-blue-500" />
            {ar ? "معلومات المطعم" : "Restaurant Info"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{ar ? "اسم المطعم (عربي)" : "Restaurant Name (Arabic)"}</Label>
              <Input
                value={form.restaurantName}
                onChange={(e) => set("restaurantName", e.target.value)}
                placeholder="مطعمي"
                dir="rtl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "اسم المطعم (إنجليزي)" : "Restaurant Name (English)"}</Label>
              <Input
                value={form.restaurantNameEn}
                onChange={(e) => set("restaurantNameEn", e.target.value)}
                placeholder="My Restaurant"
                dir="ltr"
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {ar ? "رقم الهاتف" : "Phone"}
              </Label>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+971 50 000 0000"
                dir="ltr"
                type="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {ar ? "رقم هاتف ثانٍ" : "Phone 2"}
              </Label>
              <Input
                value={form.phone2}
                onChange={(e) => set("phone2", e.target.value)}
                placeholder="+971 4 000 0000"
                dir="ltr"
                type="tel"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {ar ? "البريد الإلكتروني" : "Email"}
            </Label>
            <Input
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="info@restaurant.com"
              dir="ltr"
              type="email"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {ar ? "العنوان" : "Address"}
              </Label>
              <Input
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder={ar ? "شارع، حي، مدينة" : "Street, District, City"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "المدينة" : "City"}</Label>
              <Input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder={ar ? "دبي" : "Dubai"}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              {ar ? "الدولة" : "Country"}
            </Label>
            <Input
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
              placeholder="UAE"
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      {/* ─── Timing Settings ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-amber-500" />
            {ar ? "إعدادات التوقيت" : "Timing Settings"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>{ar ? "المنطقة الزمنية" : "Timezone"}</Label>
            <Select value={form.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{ar ? "ساعة بداية يوم العمل" : "Business Day Start Hour"}</Label>
            <Select
              value={String(form.businessDayStartHour)}
              onValueChange={(v) => set("businessDayStartHour", Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ar
                ? `يوم العمل يبدأ الساعة ${HOURS[form.businessDayStartHour]?.label} وينتهي في نفس الوقت من اليوم التالي. أي عملية قبل هذا الوقت تُعدّ جزءاً من اليوم السابق.`
                : `Business day starts at ${HOURS[form.businessDayStartHour]?.label} and ends at the same time next day.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ─── Currency & VAT ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5 text-green-500" />
            {ar ? "العملة والضريبة" : "Currency & VAT"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{ar ? "رمز العملة" : "Currency Code"}</Label>
              <Input
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
                placeholder="AED"
                dir="ltr"
                maxLength={10}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ar ? "رمز العرض" : "Display Symbol"}</Label>
              <Input
                value={form.currencySymbol}
                onChange={(e) => set("currencySymbol", e.target.value)}
                placeholder="د.إ"
                maxLength={10}
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{ar ? "تفعيل ضريبة القيمة المضافة" : "Enable VAT"}</p>
              <p className="text-xs text-muted-foreground">{ar ? "تطبيق الضريبة على الفواتير" : "Apply VAT on invoices"}</p>
            </div>
            <Switch
              checked={form.vatEnabled}
              onCheckedChange={(v) => set("vatEnabled", v)}
            />
          </div>

          {form.vatEnabled && (
            <div className="space-y-1.5">
              <Label>{ar ? "نسبة الضريبة (%)" : "VAT Rate (%)"}</Label>
              <NumericInput
                value={form.vatRate}
                onChange={(e) => set("vatRate", e.target.value)}
                placeholder="5.00"
                dir="ltr"
                min="0"
                max="100"
                step="0.01"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Excel Sync (Template → Manus → Import) ─── */}
      <Card className="border-emerald-200/70 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-emerald-600" />
            مزامنة عبر Excel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm space-y-2">
            <p className="font-medium">خطوات المزامنة:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground">
              <li>حمّل نموذج Excel من هنا</li>
              <li>أرسله لـ Manus AI واطلب منه: <span className="font-mono bg-muted px-1 rounded text-foreground">"عبّئ هذا النموذج ببيانات قاعدة البيانات"</span></li>
              <li>ارفع الملف المعبّأ هنا</li>
            </ol>
          </div>

          {excelImportResult && (
            <div className="text-xs border border-border rounded-md p-2.5 bg-card space-y-1">
              <p className="font-medium text-emerald-600">✅ آخر استيراد ({(excelImportResult.durationMs / 1000).toFixed(1)}s)</p>
              {excelImportResult.tables.map((t: any) => (
                <div key={t.table} className="flex justify-between text-muted-foreground">
                  <span>{t.table}</span>
                  <span className="font-mono">{t.rows} صف — {t.strategy}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={downloadTemplate}
              disabled={templateQuery.isFetching}
              variant="outline"
              className="gap-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            >
              {templateQuery.isFetching
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              ① تحميل النموذج
            </Button>
            <label className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors ${excelImportLoading ? "bg-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}>
              {excelImportLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الاستيراد...</>
                : <><RefreshCw className="h-4 w-4" /> ③ رفع الملف المعبّأ</>}
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={excelImportLoading} onChange={handleExcelImport} />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ─── File-based Import ─── */}
      <Card className="border-green-200/70 bg-green-50/30 dark:bg-green-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-green-600" />
            استيراد البيانات من ملف (بديل المزامنة)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Manus URL input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">رابط الـ app على Manus</label>
            <div className="flex gap-2">
              <input
                value={manusUrl}
                onChange={e => setManusUrl(e.target.value)}
                placeholder="https://matjari-inv-jz9zqe8j.manus.space"
                className="flex-1 text-xs border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-green-500 font-mono"
              />
              <button
                onClick={handleFetchFromManus}
                disabled={importLoading}
                className={`px-3 py-2 rounded-md text-xs font-medium text-white transition-colors ${importLoading ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"}`}
              >
                {importLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "جلب البيانات"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">أو ارفع ملف JSON سبق تحميله:</p>
          </div>

          {importResult && (
            <div className="text-xs border border-border rounded-md p-2.5 bg-card space-y-1">
              <p className="font-medium text-emerald-600">✅ آخر استيراد ({(importResult.durationMs / 1000).toFixed(1)}s)</p>
              {importResult.tables.map((t: any) => (
                <div key={t.table} className="flex justify-between text-muted-foreground">
                  <span>{t.table}</span>
                  <span className="font-mono">{t.rows} صف</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${importLoading ? "opacity-50 cursor-not-allowed border-border text-muted-foreground" : "border-green-600 text-green-700 hover:bg-green-50"}`}>
              {importLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الاستيراد...</>
                : <><RefreshCw className="h-4 w-4" /> رفع ملف .json</>}
              <input type="file" accept=".json" className="hidden" disabled={importLoading} onChange={handleImportFile} />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* ─── Smart Cloud Sync ─── */}
      <Card className="border-blue-200/70 bg-blue-50/30 dark:bg-blue-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="h-5 w-5 text-blue-600" />
            مزامنة ذكية من السحابة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>تحدّث فقط البيانات المحددة دون المساس بباقي النظام:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li><span className="font-medium text-foreground">الفواتير</span> — حذف القديم وإضافة الجديد</li>
              <li><span className="font-medium text-foreground">المواد الخام</span> — تحديث الكميات وآخر الأسعار فقط (الأسماء والرموز لا تتغير)</li>
              <li><span className="font-medium text-foreground">إنتاج المطبخ</span> — حذف القديم وإضافة الجديد</li>
              <li><span className="font-medium text-foreground">الحسابات اليومية</span> — حذف القديم وإضافة الجديد</li>
            </ul>
          </div>

          {smartSyncResult && (
            <div className="text-xs border border-border rounded-md p-2.5 bg-card space-y-1">
              <p className="font-medium text-emerald-600">✅ آخر مزامنة ذكية</p>
              {smartSyncResult.tables.map((t: any) => (
                <div key={t.table} className="flex justify-between text-muted-foreground">
                  <span>{t.table}</span>
                  <span className="font-mono">{t.rows} صف — {t.strategy}</span>
                </div>
              ))}
              <p className="text-muted-foreground">{(smartSyncResult.durationMs / 1000).toFixed(1)}s</p>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button
              onClick={() => smartSyncMut.mutate()}
              disabled={smartSyncMut.isPending || !cloudStatus.data?.enabled}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {smartSyncMut.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري المزامنة الذكية...</>
                : <><RefreshCw className="h-4 w-4" /> مزامنة ذكية من السحابة</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Cloud Sync (TiDB → Local) ─── */}
      <Card className="border-amber-200/70 bg-amber-50/30 dark:bg-amber-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="h-5 w-5 text-amber-600" />
            {ar ? "مزامنة البيانات من السحابة" : "Sync Data From Cloud"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-100/60 dark:bg-amber-950/30 border border-amber-300/60 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {ar ? "سيتم استبدال البيانات المحلية بالكامل ببيانات السحابة" : "All local data will be replaced with the cloud data"}
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                {ar ? "البيانات الموجودة على السحابة لن تتأثر — العملية read-only من ناحيتها. أي تعديلات محلية لم تُرفع للسحابة ستُفقد." : "Cloud data is not affected — this is read-only from the cloud side. Any local changes that haven't been pushed to the cloud will be lost."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-card border border-border">
              <Database className="h-4 w-4 text-blue-500" />
              <div>
                <div className="text-xs text-muted-foreground">{ar ? "المصدر (سحابي)" : "Source (cloud)"}</div>
                <div className="font-mono text-xs truncate">
                  {cloudStatus.data?.cloudHost || (ar ? "غير مُعد" : "Not configured")}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-card border border-border">
              <Database className="h-4 w-4 text-emerald-500" />
              <div>
                <div className="text-xs text-muted-foreground">{ar ? "الهدف (محلي)" : "Target (local)"}</div>
                <div className="font-mono text-xs truncate">localhost:3306</div>
              </div>
            </div>
          </div>

          {lastSyncResult && (
            <div className="text-xs text-muted-foreground border border-border rounded-md p-2.5 bg-card space-y-1">
              <p className="font-medium text-emerald-600">
                ✅ {lastSyncResult.tablesCopied} {ar ? "جدول" : "tables"} · {lastSyncResult.totalRows.toLocaleString()} {ar ? "صف" : "rows"} · {(lastSyncResult.durationMs / 1000).toFixed(1)}s
              </p>
              {(lastSyncResult as any).tables?.map((t: any) => (
                <div key={t.table} className="flex justify-between">
                  <span>{t.table}</span>
                  <span className={`font-mono ${t.rows === 0 ? "text-amber-500" : "text-emerald-600"}`}>
                    {t.rows} صف {t.note ? `— ${t.note}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button
              onClick={() => setShowSyncConfirm(true)}
              disabled={syncMutation.isPending || !cloudStatus.data?.enabled}
              variant="default"
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncMutation.isPending
                ? (ar ? "جاري التحديث..." : "Syncing...")
                : (ar ? "تحديث البيانات من السحابة" : "Sync from Cloud")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showSyncConfirm} onOpenChange={setShowSyncConfirm}>
        <AlertDialogContent dir={ar ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {ar ? "تأكيد المزامنة" : "Confirm Sync"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {ar
                  ? "هذه العملية ستحذف كل البيانات المحلية وتستبدلها بنسخة طازجة من السحابة. هل أنت متأكد؟"
                  : "This will delete all local data and replace it with a fresh copy from the cloud. Are you sure?"}
              </p>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "العملية قد تستغرق دقيقة إلى دقيقتين بحسب حجم البيانات."
                  : "This may take 1-2 minutes depending on data size."}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={ar ? "flex-row-reverse" : ""}>
            <AlertDialogCancel>{ar ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowSyncConfirm(false); syncMutation.mutate(); }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {ar ? "نعم، حدّث الآن" : "Yes, sync now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save button at bottom too */}
      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg" className="gap-2">
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ar ? "حفظ الإعدادات" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
