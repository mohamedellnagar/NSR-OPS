import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Package, Globe, Eye, EyeOff, Lock, Mail,
  BarChart3, Bell, ShieldCheck, TrendingUp, AlertTriangle,
} from "lucide-react";

export default function LoginPage() {
  const { language, setLanguage, isRTL } = useLanguage();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/");
    },
    onError: () => {
      toast.error(language === "ar" ? "بريد إلكتروني أو كلمة مرور غير صحيحة" : "Invalid email or password");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error(language === "ar" ? "يرجى إدخال البريد الإلكتروني وكلمة المرور" : "Please enter email and password");
      return;
    }
    loginMutation.mutate({ email: email.trim(), password });
  };

  const features = [
    { icon: <Package size={18} />, title: language === "ar" ? "إدارة المواد الخام" : "Raw Materials Management", desc: language === "ar" ? "تتبع كامل للمواد مع تصنيفات وموردين" : "Full tracking with categories & suppliers" },
    { icon: <TrendingUp size={18} />, title: language === "ar" ? "إدخال وإخراج المخزون" : "Stock In & Out", desc: language === "ar" ? "تسجيل الحركات مع تحديث تلقائي للأرصدة" : "Record movements with auto stock updates" },
    { icon: <AlertTriangle size={18} />, title: language === "ar" ? "تنبيهات المخزون المنخفض" : "Low Stock Alerts", desc: language === "ar" ? "إشعارات فورية عند الوصول للحد الأدنى" : "Instant alerts at minimum level" },
    { icon: <BarChart3 size={18} />, title: language === "ar" ? "تقارير شاملة" : "Comprehensive Reports", desc: language === "ar" ? "تقييم المخزون وتحليل أداء الموردين" : "Inventory valuation & supplier analysis" },
    { icon: <ShieldCheck size={18} />, title: language === "ar" ? "صلاحيات متعددة" : "Role-Based Access", desc: language === "ar" ? "مدير، مشرف مخزون، مشاهد فقط" : "Admin, Warehouse Manager, Viewer" },
  ];

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="min-h-screen flex"
      style={{ background: "var(--sidebar)" }}
    >
      {/* Left/Right Panel - Branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-10 w-72 h-72 rounded-full bg-sidebar-primary/20 blur-3xl" />
          <div className="absolute bottom-10 right-10 w-56 h-56 rounded-full bg-sidebar-primary/10 blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sidebar-primary flex items-center justify-center shadow-xl">
            <Package size={22} className="text-white" />
          </div>
          <div>
            <span className="text-xl font-bold text-sidebar-foreground">مطجري</span>
            <p className="text-xs text-sidebar-foreground/50">
              {language === "ar" ? "منصة إدارة مخزون المواد الخام" : "Raw Materials Inventory Platform"}
            </p>
          </div>
        </div>

        {/* Headline & Features */}
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-bold text-sidebar-foreground leading-tight">
            {language === "ar" ? "منصة إدارة\nمخزون المواد الخام" : "Raw Materials\nInventory Platform"}
          </h2>
          <p className="text-sidebar-foreground/60 text-base leading-relaxed max-w-sm">
            {language === "ar"
              ? "تتبع مخزونك، سجّل الحركات، واحصل على تقارير شاملة في مكان واحد"
              : "Track your inventory, record movements, and get comprehensive reports in one place"}
          </p>
          <div className="mt-6 space-y-3">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary flex-shrink-0 mt-0.5">
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-sidebar-foreground">{f.title}</p>
                  <p className="text-xs text-sidebar-foreground/50">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex gap-8">
          {[
            { num: "100%", label: language === "ar" ? "دقة البيانات" : "Data Accuracy" },
            { num: "∞", label: language === "ar" ? "سجل المعاملات" : "Transaction Log" },
            { num: "3", label: language === "ar" ? "مستويات الصلاحية" : "Access Levels" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-bold text-sidebar-primary">{stat.num}</p>
              <p className="text-xs text-sidebar-foreground/50">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Login Panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-8 bg-background">
        <div className="w-full max-w-md animate-fade-in">

          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
              <Package size={22} className="text-white" />
            </div>
            <div>
              <span className="text-xl font-bold text-foreground">مطجري</span>
              <p className="text-xs text-muted-foreground">
                {language === "ar" ? "منصة إدارة مخزون المواد الخام" : "Raw Materials Inventory Platform"}
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="bg-card rounded-2xl border border-border shadow-xl p-8">
            <div className="mb-7 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Package size={26} className="text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-1.5">
                {language === "ar" ? "مرحباً بك" : "Welcome Back"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {language === "ar"
                  ? "سجّل دخولك للوصول إلى لوحة التحكم"
                  : "Sign in to access your dashboard"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className={`text-sm font-medium ${isRTL ? "block text-right" : ""}`}>
                  {language === "ar" ? "البريد الإلكتروني" : "Email Address"}
                </Label>
                <div className="relative">
                  <Mail size={15} className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
                  <Input
                    id="email"
                    type="email"
                    placeholder={language === "ar" ? "أدخل بريدك الإلكتروني" : "Enter your email"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${isRTL ? "pr-9 text-right" : "pl-9"} h-11`}
                    dir="ltr"
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className={`text-sm font-medium ${isRTL ? "block text-right" : ""}`}>
                  {language === "ar" ? "كلمة المرور" : "Password"}
                </Label>
                <div className="relative">
                  <Lock size={15} className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={language === "ar" ? "أدخل كلمة المرور" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${isRTL ? "pr-9 pl-9" : "pl-9 pr-9"} h-11`}
                    dir="ltr"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors ${isRTL ? "left-3" : "right-3"}`}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold mt-2"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending
                  ? (language === "ar" ? "جاري تسجيل الدخول..." : "Signing in...")
                  : (language === "ar" ? "تسجيل الدخول" : "Sign In")
                }
              </Button>
            </form>
          </div>

          {/* Language Toggle */}
          <div className="mt-5 flex items-center justify-center">
            <button
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg hover:bg-muted"
            >
              <Globe size={15} />
              {language === "ar" ? "English" : "العربية"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
