import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AlertTriangle,
  CalendarDays,
  ArrowDownCircle,
  BarChart3,
  Receipt,
  Box,
  ChefHat,
  ChevronDown,
  FlaskConical,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScrollText,
  Tag,
  Settings,
  Trash2,
  Truck,
  Users,
  UtensilsCrossed,
  Warehouse,
  X,
  Factory,
  ShoppingCart,
  BookOpen,
  Scissors,
  Sparkles,
  ClipboardList,
  TrendingUp,
  MessageSquare,
  MessageCircle,
  Phone,
  Wallet,
  ShoppingBag,
  CreditCard,
  Download,
  Scale,
  Calculator,
  CalendarCheck,
  BrainCircuit,
  Zap,
  LineChart,
  MonitorPlay,
  ConciergeBell,
  User,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

interface NavItem {
  key: string;
  href: string;
  icon: ReactNode;
  roles?: string[];
}

interface NavGroup {
  labelAr: string;
  labelEn: string;
  icon: ReactNode;
  items: NavItem[];
}

export default function AppLayout({ children, noPadding }: { children: ReactNode; noPadding?: boolean }) {
  const { user } = useAuth();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    warehouse: true,
    kitchen: true,
    butcher: true,
    reports: true,
    pos: true,
    admin: true,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { navigate("/login"); },
  });

  // ── Flat items (no group) ──────────────────────────────────────────────────
  const topItems: NavItem[] = [
    { key: "dashboard", href: "/", icon: <LayoutDashboard size={18} /> },
  ];

  // ── Grouped items ──────────────────────────────────────────────────────────
  const navGroups: NavGroup[] = [
    {
      labelAr: "المخزن",
      labelEn: "Warehouse",
      icon: <Warehouse size={16} />,
      items: [
        { key: "materials",   href: "/materials",     icon: <Box size={18} /> },
        { key: "suppliers",   href: "/suppliers",     icon: <Truck size={18} /> },
        { key: "semiFinished",href: "/semi-finished", icon: <FlaskConical size={18} /> },
        { key: "invoices",    href: "/invoices",      icon: <Receipt size={18} /> },
        { key: "transactions",href: "/transactions",  icon: <ScrollText size={18} /> },
        { key: "categories",  href: "/categories",   icon: <Tag size={18} /> },
        { key: "purchaseOrders", href: "/purchase-orders", icon: <ShoppingCart size={18} /> },
        { key: "inventoryForecast", href: "/inventory-forecast", icon: <BrainCircuit size={18} /> },
      ],
    },
    {
      labelAr: "المطبخ",
      labelEn: "Kitchen",
      icon: <ChefHat size={16} />,
      items: [
        { key: "kitchen",   href: "/kitchen",  icon: <ChefHat size={18} /> },
        { key: "recipes",   href: "/recipes",  icon: <UtensilsCrossed size={18} /> },
        { key: "foodCost",  href: "/food-cost", icon: <TrendingUp size={18} /> },
        { key: "wasteLog",  href: "/waste",    icon: <Trash2 size={18} /> },
        { key: "menuOfferDesigner", href: "/menu-offer-designer", icon: <Sparkles size={18} /> },
        { key: "menu", href: "/menu", icon: <Menu size={18} /> },
        { key: "menuImport", href: "/menu-import", icon: <Download size={18} /> },
        { key: "priceComparison", href: "/price-comparison", icon: <Scale size={18} /> },
        { key: "productionPlanning", href: "/production-planning", icon: <Calculator size={18} /> },
        { key: "shifts", href: "/shifts", icon: <CalendarCheck size={18} /> },
        { key: "menuEngineering", href: "/menu-engineering", icon: <BarChart3 size={18} /> },
        { key: "priceSimulator", href: "/price-simulator", icon: <Calculator size={18} /> },
        { key: "wasteAnalytics", href: "/waste-analytics", icon: <LineChart size={18} /> },
      ],
    },
    {
      labelAr: "الملحمة",
      labelEn: "Butcher",
      icon: <Scissors size={16} />,
      items: [
        { key: "butcherRecipes",    href: "/butcher/recipes",    icon: <BookOpen size={18} /> },
        { key: "butcherProduction", href: "/butcher/production", icon: <Factory size={18} /> },
        { key: "butcherWaste",      href: "/butcher/waste",      icon: <Trash2 size={18} /> },
        { key: "butcherCashier",    href: "/butcher/cashier",    icon: <ShoppingCart size={18} /> },
      ],
    },
    {
      labelAr: "التقارير والتنبيهات",
      labelEn: "Reports & Alerts",
      icon: <BarChart3 size={16} />,
      items: [

        { key: "analytics", href: "/analytics", icon: <TrendingUp size={18} /> },
        { key: "alerts",  href: "/alerts",  icon: <AlertTriangle size={18} /> },
        { key: "reports", href: "/reports", icon: <BarChart3 size={18} /> },
        { key: "sales",   href: "/sales",   icon: <ShoppingBag size={18} /> },
        { key: "whatsappReports", href: "/whatsapp-reports", icon: <MessageSquare size={18} /> },
        { key: "waChats", href: "/wa-chats", icon: <MessageCircle size={18} /> },
        { key: "waNumbers", href: "/wa-numbers", icon: <Phone size={18} /> },
        { key: "waAnalytics", href: "/wa-analytics", icon: <BarChart3 size={18} /> },
        { key: "dailyAccounts", href: "/daily-accounts", icon: <Wallet size={18} /> },
        { key: "materialPrices", href: "/material-prices", icon: <TrendingUp size={18} /> },
        { key: "monthlyPayments", href: "/monthly-payments", icon: <CreditCard size={18} /> },
        { key: "dailyFlash", href: "/daily-flash", icon: <Zap size={18} /> },
      ],
    },
    {
      labelAr: "نقطة البيع",
      labelEn: "Point of Sale",
      icon: <ShoppingCart size={16} />,
      items: [
        { key: "posCashier",       href: "/pos/cashier",    icon: <CreditCard size={18} /> },
        { key: "posWaiter",        href: "/pos/waiter",     icon: <ConciergeBell size={18} /> },
        { key: "posKitchen",       href: "/pos/kitchen",    icon: <MonitorPlay size={18} /> },
        { key: "posServiceStock",  href: "/pos/service-stock", icon: <ChefHat size={18} /> },
        { key: "posCustomers",     href: "/pos/customers",  icon: <User size={18} /> },
      ],
    },
    {
      labelAr: "الإدارة",
      labelEn: "Admin",
      icon: <Users size={16} />,
      items: [
        { key: "users",     href: "/users",    icon: <Users size={18} />,    roles: ["admin"] },
        { key: "settings",  href: "/settings", icon: <Settings size={18} />, roles: ["admin"] },
      ],
    },
  ];

  // ── Permission helpers ─────────────────────────────────────────────────────
  const getUserAllowedPages = (): string[] | null => {
    if (!user) return null;
    if (user.role === "admin") return null;
    const u = user as any;
    if (!u.allowedPages) return null;
    try { return JSON.parse(u.allowedPages); } catch { return null; }
  };
  const allowedPages = getUserAllowedPages();

  const filterItems = (items: NavItem[]) =>
    items.filter((item) => {
      if (item.roles && !item.roles.includes(user?.role || "viewer")) return false;
      if (allowedPages !== null && !allowedPages.includes(item.key)) return false;
      return true;
    });

  const visibleTopItems = filterItems(topItems);

  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Reusable nav link ──────────────────────────────────────────────────────
  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
    return (
      <Link key={item.key} href={item.href} onClick={() => setSidebarOpen(false)}>
        <div
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
            isActive
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
          } ${isRTL ? "flex-row-reverse text-right" : ""}`}
        >
          <span className={isActive ? "text-sidebar-primary" : ""}>{item.icon}</span>
          <span>{t(item.key as any)}</span>
          {item.key === "alerts" && (
            <span className="ms-auto text-xs bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">!</span>
          )}
        </div>
      </Link>
    );
  };

  // ── Group label keys ───────────────────────────────────────────────────────
  const groupKeys = ["warehouse", "kitchen", "butcher", "reports", "pos", "admin"];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center shadow-lg">
            <Package size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-sidebar-foreground leading-none">{t("appName")}</h1>
            <p className="text-[10px] text-sidebar-foreground/50 mt-0.5 leading-none">{t("appTagline")}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        {/* Top-level flat items (Dashboard) */}
        {visibleTopItems.map((item) => <NavLink key={item.key} item={item} />)}

        {/* Grouped sections */}
        {navGroups.map((group, idx) => {
          const gKey = groupKeys[idx];
          const visibleGroupItems = filterItems(group.items);
          if (visibleGroupItems.length === 0) return null;
          const isOpen = openGroups[gKey] !== false;
          const label = language === "ar" ? group.labelAr : group.labelEn;
          return (
            <div key={gKey} className="mt-2">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(gKey)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/40 transition-all ${isRTL ? "flex-row-reverse text-right" : ""}`}
              >
                <span>{group.icon}</span>
                <span className="flex-1 text-start">{label}</span>
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 ${isOpen ? "rotate-0" : (isRTL ? "rotate-90" : "-rotate-90")}`}
                />
              </button>

              {/* Group items */}
              {isOpen && (
                <div className={`mt-0.5 space-y-0.5 ${isRTL ? "pr-3" : "pl-3"}`}>
                  {visibleGroupItems.map((item) => <NavLink key={item.key} item={item} />)}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User + Actions */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        {/* Language Toggle */}
        <button
          onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
        >
          <Globe size={18} />
          <span>{t("switchLanguage")}</span>
        </button>

        {/* User Info */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sidebar-accent/40">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary/30 flex items-center justify-center text-sidebar-foreground font-semibold text-sm flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user?.name || "User"}</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">{t(user?.role as any || "viewer")}</p>
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="text-sidebar-foreground/40 hover:text-destructive transition-colors"
            title={t("logout")}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex bg-background ${isRTL ? "flex-row-reverse" : ""}`}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 h-screen sticky top-0" style={{ background: "var(--sidebar)" }}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside
            className={`absolute top-0 h-full w-72 flex flex-col ${isRTL ? "right-0" : "left-0"}`}
            style={{ background: "var(--sidebar)" }}
          >
            <button
              onClick={() => setSidebarOpen(false)}
              className={`absolute top-4 text-sidebar-foreground/60 hover:text-sidebar-foreground ${isRTL ? "left-4" : "right-4"}`}
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border sticky top-0 z-40">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Package size={18} className="text-primary" />
            <span className="font-bold text-foreground">{t("appName")}</span>
          </div>
          <button
            onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-muted-foreground"
          >
            {t("switchLanguage")}
          </button>
        </header>

        {/* Page Content */}
        <main className={`flex-1 animate-fade-in ${noPadding ? "overflow-hidden flex flex-col" : "p-4 sm:p-6 lg:p-8"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
