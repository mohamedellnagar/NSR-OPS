import { useAuth } from "@/_core/hooks/useAuth";
import { parseUserPagePermissions, getPageAccess, type PagePermissions } from "@/lib/permissions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Users, Package, Tags, Truck, ArrowDownUp, ArrowUpFromLine, FileText, Bell, BarChart3, ChefHat, Flame, Factory, Trash, ShoppingCart, BookOpen, Clock, CalendarDays, Sparkles, ClipboardList, MessageSquare, UtensilsCrossed, Layers, TrendingUp, DollarSign, Settings, BarChart2, Activity, Warehouse, FlaskConical, Scissors, Calculator, LineChart, ShoppingBag, Receipt } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuGroups = [
  {
    label: null,
    items: [
      { icon: LayoutDashboard, label: "لوحة التحكم", path: "/", pageKey: "dashboard" },
    ],
  },
  {
    label: "المخزون",
    items: [
      { icon: Package, label: "المواد الخام", path: "/materials", pageKey: "materials" },
      { icon: Tags, label: "التصنيفات", path: "/categories", pageKey: "categories" },
      { icon: Truck, label: "الموردين", path: "/suppliers", pageKey: "suppliers" },
      { icon: FileText, label: "فواتير الشراء", path: "/invoices", pageKey: "invoices" },
      { icon: ArrowDownUp, label: "حركة المخزون", path: "/transactions", pageKey: "transactions" },
      { icon: DollarSign, label: "أسعار المواد", path: "/material-prices", pageKey: "materialPrices" },
    ],
  },
  {
    label: "الوصفات والمنيو",
    items: [
      { icon: UtensilsCrossed, label: "الوصفات", path: "/recipes", pageKey: "recipes" },
      { icon: TrendingUp, label: "Food Cost", path: "/food-cost", pageKey: "foodCost" },
      { icon: Layers, label: "المنتجات شبه المصنعة", path: "/semi-finished", pageKey: "semiFinished" },
      { icon: Sparkles, label: "المنيو", path: "/menu", pageKey: "menu" },
      { icon: Sparkles, label: "مصمم العروض AI", path: "/menu-offer-designer", pageKey: "menuOfferDesigner" },
    ],
  },
  {
    label: "المطبخ",
    items: [
      { icon: ChefHat, label: "إنتاج المطبخ", path: "/kitchen", pageKey: "kitchen" },
      { icon: Activity, label: "استهلاك المطبخ", path: "/consumption", pageKey: "consumption" },
      { icon: BarChart2, label: "تقرير استهلاك المطبخ", path: "/kitchen-consumption-report", pageKey: "kitchenConsumptionReport" },
    ],
  },
  {
    label: "المبيعات والحسابات",
    items: [
      { icon: ShoppingBag, label: "المبيعات", path: "/sales", pageKey: "sales" },
      { icon: Receipt, label: "الحسابات اليومية", path: "/daily-accounts", pageKey: "dailyAccounts" },
      { icon: TrendingUp, label: "تحليل الانحراف", path: "/variance-analysis", pageKey: "varianceAnalysis" },
      { icon: LineChart, label: "المشتريات مقابل المبيعات", path: "/purchase-vs-sales", pageKey: "purchaseVsSales" },
    ],
  },
  {
    label: "الملحمة",
    items: [
      { icon: BookOpen, label: "وصفات الملحمة", path: "/butcher/recipes", pageKey: "butcherRecipes" },
      { icon: Factory, label: "إنتاج الملحمة", path: "/butcher/production", pageKey: "butcherProduction" },
      { icon: Scissors, label: "هدر الملحمة", path: "/butcher/waste", pageKey: "butcherWaste" },
      { icon: ShoppingCart, label: "كاشير الملحمة", path: "/butcher/cashier", pageKey: "butcherCashier" },
    ],
  },
  {
    label: "التقارير",
    items: [
      { icon: BarChart3, label: "التقارير", path: "/reports", pageKey: "reports" },
      { icon: Flame, label: "تقرير الهدر", path: "/reports/waste", pageKey: "reports" },
      { icon: Calculator, label: "تقرير الموردين", path: "/supplier-items-report", pageKey: "supplierItemsReport" },
      { icon: LineChart, label: "لوحة التحليلات", path: "/analytics", pageKey: "analytics" },
      { icon: MessageSquare, label: "تقارير WhatsApp", path: "/whatsapp-reports", pageKey: "whatsappReports" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { icon: Bell, label: "التنبيهات", path: "/alerts", pageKey: "alerts" },
      { icon: Trash, label: "الهدر", path: "/waste", pageKey: "wasteLog" },
      { icon: Users, label: "المستخدمين", path: "/users", pageKey: "users" },
      { icon: Settings, label: "الإعدادات", path: "/settings", pageKey: "settings" },
    ],
  },
];

// Flat list for active item detection
const menuItems = menuGroups.flatMap(g => g.items);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeStr = time.toLocaleTimeString("ar-AE", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const dateStr = time.toLocaleDateString("ar-AE", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50">
      <Clock size={14} className="text-muted-foreground shrink-0" />
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-mono font-semibold text-foreground tabular-nums">{timeStr}</span>
        <span className="text-[10px] text-muted-foreground">{dateStr}</span>
      </div>
    </div>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // ── Permission filtering ───────────────────────────────────────────────────
  const pagePermissions: PagePermissions | null =
    !user || (user as any).role === "admin" ? null : parseUserPagePermissions((user as any).allowedPages);

  const visibleGroups = menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item =>
      getPageAccess(pagePermissions, item.pageKey) !== null
    ),
  })).filter(group => group.items.length > 0);

  const activeMenuItem = menuItems.find(item => item.path === location) ?? menuItems.find(item => location.startsWith(item.path) && item.path !== "/");

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate">
                    Navigation
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <div className="px-2 py-1">
              {visibleGroups.map((group, gi) => (
                <div key={gi} className="mb-1">
                  {group.label && (
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 group-data-[collapsible=icon]:hidden">
                      {group.label}
                    </div>
                  )}
                  <SidebarMenu>
                    {group.items.map(item => {
                      const isActive = location === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className={`h-9 transition-all font-normal`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                            />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                  {gi < visibleGroups.length - 1 && group.label && (
                    <div className="mx-3 my-1 border-t border-border/40 group-data-[collapsible=icon]:hidden" />
                  )}
                </div>
              ))}
            </div>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div className="flex border-b h-14 items-center justify-between bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
          <div className="flex items-center gap-2">
            {isMobile && <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />}
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="tracking-tight text-foreground font-medium">
                  {activeMenuItem?.label ?? ""}
                </span>
              </div>
            </div>
          </div>
          <LiveClock />
        </div>
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
