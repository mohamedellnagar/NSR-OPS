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
import { Building2, Clock, DollarSign, Globe, Phone, Mail, MapPin, Save, Loader2, AlertTriangle, KeyRound, Eye, EyeOff } from "lucide-react";

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
  const autoSyncStatus = trpc.settings.autoSyncStatus.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const setAutoSyncEnabledMut = trpc.settings.setAutoSyncEnabled.useMutation({
    onSuccess: (r) => {
      utils.settings.autoSyncStatus.setData(undefined, r);
      toast.success(r.userEnabled ? "▶️ تم تشغيل المزامنة التلقائية" : "⏸️ تم إيقاف المزامنة التلقائية");
    },
    onError: (e) => toast.error(`فشل التغيير: ${e.message}`),
  });
  const utils = trpc.useUtils();

  // ── OpenAI API Key ──
  const openaiKeyStatus = trpc.settings.openaiKeyStatus.useQuery();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const saveApiKeyMut = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success(ar ? "تم حفظ مفتاح OpenAI بنجاح" : "OpenAI API key saved");
      setApiKeyInput("");
      utils.settings.openaiKeyStatus.invalidate();
    },
    onError: (e) => toast.error(ar ? `خطأ: ${e.message}` : `Error: ${e.message}`),
  });
  const handleSaveApiKey = () => saveApiKeyMut.mutate({ openaiApiKey: apiKeyInput });
  const handleClearApiKey = () => saveApiKeyMut.mutate({ openaiApiKey: "" });

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

      {/* ─── Auto Sync Status (runs every minute in background) ─── */}
      <Card className="border-emerald-200/70 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-emerald-600" />
              المزامنة التلقائية (كل دقيقة)
            </CardTitle>
            {autoSyncStatus.data?.configured && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {autoSyncStatus.data?.userEnabled ? "مفعّلة" : "متوقفة"}
                </span>
                <Switch
                  checked={autoSyncStatus.data?.userEnabled ?? false}
                  disabled={setAutoSyncEnabledMut.isPending || autoSyncStatus.isLoading}
                  onCheckedChange={(checked) => setAutoSyncEnabledMut.mutate({ enabled: checked })}
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!autoSyncStatus.data?.configured ? (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              المزامنة التلقائية غير مفعّلة (تأكد من ضبط CLOUD_DATABASE_URL)
            </div>
          ) : !autoSyncStatus.data?.userEnabled ? (
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-muted text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              المزامنة التلقائية متوقفة الآن — استخدم المفتاح أعلاه لتشغيلها
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-card border border-border">
                {autoSyncStatus.data?.running
                  ? <Loader2 className="h-4 w-4 text-emerald-600 animate-spin" />
                  : <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />}
                <span>
                  {autoSyncStatus.data?.running ? "جاري المزامنة الآن..." : "تعمل في الخلفية"}
                </span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-md bg-card border border-border">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  آخر تشغيل: {autoSyncStatus.data?.lastRunAt
                    ? new Date(autoSyncStatus.data.lastRunAt).toLocaleTimeString("ar-EG")
                    : "لم تبدأ بعد"}
                </span>
              </div>
            </div>
          )}

          {autoSyncStatus.data?.lastResult && (
            <div className={`text-xs border rounded-md p-2.5 space-y-1 ${
              autoSyncStatus.data.lastResult.ok
                ? "border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20"
                : "border-red-200 bg-red-50/60 dark:bg-red-950/20"
            }`}>
              {autoSyncStatus.data.lastResult.ok ? (
                <p className="text-emerald-700 dark:text-emerald-400">
                  ✅ آخر مزامنة ناجحة — {autoSyncStatus.data.lastResult.tables} جداول، {autoSyncStatus.data.lastResult.rows} صف
                  {" "}في {(autoSyncStatus.data.lastResult.durationMs / 1000).toFixed(1)} ثانية
                  {autoSyncStatus.data.lastSuccessAt && (
                    <> — الساعة {new Date(autoSyncStatus.data.lastSuccessAt).toLocaleTimeString("ar-EG")}</>
                  )}
                </p>
              ) : (
                <p className="text-red-700 dark:text-red-400">
                  ✗ فشلت آخر محاولة مزامنة: {autoSyncStatus.data.lastResult.error}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── OpenAI API Key (used by AI Chef, material categorizer/enhancer) ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            {ar ? "مفتاح OpenAI API" : "OpenAI API Key"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {ar
              ? "يُستخدم هذا المفتاح في ميزات الذكاء الاصطناعي (شيف الذكاء الاصطناعي، تصنيف المواد، تحسين بيانات المواد)."
              : "Used by AI features (AI Chef, material categorizer, material enhancer)."}
          </p>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{ar ? "الحالة:" : "Status:"}</span>
            {openaiKeyStatus.data?.configured ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                ✅ {ar ? "مُفعّل" : "Configured"}
                {openaiKeyStatus.data?.masked && (
                  <span className="text-muted-foreground font-normal"> — {openaiKeyStatus.data.masked}</span>
                )}
                <span className="text-muted-foreground font-normal">
                  {" "}({openaiKeyStatus.data?.source === "database"
                    ? (ar ? "من الإعدادات" : "from settings")
                    : (ar ? "من ملف .env" : "from .env")})
                </span>
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ {ar ? "غير مُعد" : "Not configured"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showApiKey ? "text" : "password"}
                placeholder={ar ? "sk-..." : "sk-..."}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                dir="ltr"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button onClick={handleSaveApiKey} disabled={!apiKeyInput.trim() || saveApiKeyMut.isPending} className="gap-2">
              {saveApiKeyMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ar ? "حفظ" : "Save"}
            </Button>
            {openaiKeyStatus.data?.source === "database" && (
              <Button variant="outline" onClick={handleClearApiKey} disabled={saveApiKeyMut.isPending}>
                {ar ? "مسح" : "Clear"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
