import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Eye } from "lucide-react";
import { parseUserPagePermissions, getPageAccess } from "@/lib/permissions";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MaterialsPage from "./pages/MaterialsPage";
import CategoriesPage from "./pages/CategoriesPage";
import SuppliersPage from "./pages/SuppliersPage";
import TransactionsPage from "./pages/TransactionsPage";
import AlertsPage from "./pages/AlertsPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import InvoicesPage from "./pages/InvoicesPage";
import KitchenProductionPage from "./pages/KitchenProductionPage";
import WasteReportPage from "./pages/WasteReportPage";
import WastePage from "./pages/WastePage";
import RecipesPage from "./pages/RecipesPage";
import MenuOfferDesignerPage from "./pages/MenuOfferDesignerPage";
import SemiFinishedPage from "./pages/SemiFinishedPage";
import SettingsPage from "./pages/SettingsPage";
import ButcherRecipesPage from "./pages/ButcherRecipesPage";
import ButcherProductionPage from "./pages/ButcherProductionPage";
import ButcherWastePage from "./pages/ButcherWastePage";
import ButcherCashierPage from "./pages/ButcherCashierPage";
import AnalyticsDashboardPage from "./pages/AnalyticsDashboardPage";
import SalesPage from "./pages/SalesPage";
import ConsumptionPage from "./pages/ConsumptionPage";
import KitchenConsumptionReportPage from "./pages/KitchenConsumptionReportPage";
import SupplierItemsReportPage from "./pages/SupplierItemsReportPage";
import VarianceAnalysisPage from "./pages/VarianceAnalysisPage";
import PurchaseVsSalesPage from "./pages/PurchaseVsSalesPage";
import WhatsAppReportsPage from "./pages/WhatsAppReportsPage";
import WaChatsPage from "./pages/WaChatsPage";
import WaNumbersPage from "./pages/WaNumbersPage";
import WaAnalyticsDashboard from "./pages/WaAnalyticsDashboard";
import DailyAccountsPage from "./pages/DailyAccountsPage";
import MaterialPricesPage from "./pages/MaterialPricesPage";
import MenuPage from "./pages/MenuPage";
import PublicMenuPage from "./pages/PublicMenuPage";
import PrintMenuPage from "./pages/PrintMenuPage";
import FoodCostPage from "./pages/FoodCostPage";
import MonthlyPayments from "./pages/MonthlyPayments";
import MenuImportPage from "./pages/MenuImportPage";
import PriceComparisonPage from "./pages/PriceComparisonPage";
import ProductionPlanningPage from "./pages/ProductionPlanningPage";
import MenuEngineeringPage from "./pages/MenuEngineeringPage";
import ShiftsPage from "./pages/ShiftsPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import InventoryForecastPage from "./pages/InventoryForecastPage";
import PriceSimulatorPage from "./pages/PriceSimulatorPage";
import WasteAnalyticsPage from "./pages/WasteAnalyticsPage";
import DailyFlashPage from "./pages/DailyFlashPage";
import CashierPage from "./pages/pos/CashierPage";
import CustomersPage from "./pages/pos/CustomersPage";
import WaiterPage from "./pages/pos/WaiterPage";
import KitchenDisplayPage from "./pages/pos/KitchenDisplayPage";
import KitchenServiceStockPage from "./pages/pos/KitchenServiceStockPage";
import { useAuth } from "@/_core/hooks/useAuth";

// Map route paths to their permission keys
const PAGE_PERMISSION_MAP: Record<string, string> = {
  "/": "dashboard",
  "/materials": "materials",
  "/categories": "categories",
  "/suppliers": "suppliers",
  "/transactions": "transactions",
  "/invoices": "invoices",
  "/alerts": "alerts",
  "/reports": "reports",
  "/users": "users", // admin-only, handled separately
};

/** Wraps a page with AppLayout; if not authenticated, shows LoginPage instead.
 *  Also enforces page-level permissions for non-admin users. */
function ProtectedRoute({ children, pageKey, noPadding }: { children: React.ReactNode; pageKey?: string; noPadding?: boolean }) {
  const { isAuthenticated, loading, user } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Check page-level permissions for non-admin users
  let viewOnly = false;
  if (pageKey && user && user.role !== "admin") {
    const u = user as any;
    const permissions = parseUserPagePermissions(u.allowedPages);
    const access = getPageAccess(permissions, pageKey);
    if (access === null) {
      // Redirect to dashboard (or first allowed page)
      return (
        <AppLayout>
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">غير مصرح بالوصول</h2>
              <p className="text-muted-foreground text-sm mt-1">Access Denied</p>
              <p className="text-muted-foreground text-xs mt-2">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              العودة للرئيسية / Go to Dashboard
            </button>
          </div>
        </AppLayout>
      );
    }
    viewOnly = access === "view";
  }

  return (
    <AppLayout noPadding={noPadding}>
      {viewOnly ? (
        <div className="relative">
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 text-xs font-medium">
            <Eye size={14} />
            وضع العرض فقط - لا يمكنك الإضافة أو التعديل أو الحذف في هذه الصفحة
          </div>
          <div className="[&_button:not([data-allow-view])]:opacity-50 [&_button:not([data-allow-view])]:pointer-events-none [&_button:not([data-allow-view])]:cursor-not-allowed">
            {children}
          </div>
        </div>
      ) : (
        children
      )}
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={() => <ProtectedRoute pageKey="dashboard"><DashboardPage /></ProtectedRoute>} />
      <Route path="/materials" component={() => <ProtectedRoute pageKey="materials"><MaterialsPage /></ProtectedRoute>} />
      <Route path="/categories" component={() => <ProtectedRoute pageKey="categories"><CategoriesPage /></ProtectedRoute>} />
      <Route path="/suppliers" component={() => <ProtectedRoute pageKey="suppliers"><SuppliersPage /></ProtectedRoute>} />
      <Route path="/transactions" component={() => <ProtectedRoute pageKey="transactions"><TransactionsPage /></ProtectedRoute>} />
      <Route path="/invoices" component={() => <ProtectedRoute pageKey="invoices"><InvoicesPage /></ProtectedRoute>} />
      <Route path="/kitchen" component={() => <ProtectedRoute pageKey="kitchen"><KitchenProductionPage /></ProtectedRoute>} />
      <Route path="/alerts" component={() => <ProtectedRoute pageKey="alerts"><AlertsPage /></ProtectedRoute>} />
      <Route path="/reports" component={() => <ProtectedRoute pageKey="reports"><ReportsPage /></ProtectedRoute>} />
      <Route path="/reports/waste" component={() => <ProtectedRoute pageKey="reports"><WasteReportPage /></ProtectedRoute>} />
      <Route path="/waste" component={() => <ProtectedRoute pageKey="wasteLog"><WastePage /></ProtectedRoute>} />
      <Route path="/users" component={() => <ProtectedRoute pageKey="users"><UsersPage /></ProtectedRoute>} />
      <Route path="/recipes" component={() => <ProtectedRoute pageKey="recipes"><RecipesPage /></ProtectedRoute>} />
      <Route path="/menu-offer-designer" component={() => <ProtectedRoute pageKey="menuOfferDesigner"><MenuOfferDesignerPage /></ProtectedRoute>} />
      <Route path="/semi-finished" component={() => <ProtectedRoute pageKey="semiFinished"><SemiFinishedPage /></ProtectedRoute>} />
      <Route path="/settings" component={() => <ProtectedRoute pageKey="settings"><SettingsPage /></ProtectedRoute>} />
      <Route path="/butcher/recipes" component={() => <ProtectedRoute pageKey="butcherRecipes"><ButcherRecipesPage /></ProtectedRoute>} />
      <Route path="/butcher/production" component={() => <ProtectedRoute pageKey="butcherProduction"><ButcherProductionPage /></ProtectedRoute>} />
      <Route path="/butcher/waste" component={() => <ProtectedRoute pageKey="butcherWaste"><ButcherWastePage /></ProtectedRoute>} />
      <Route path="/butcher/cashier" component={() => <ProtectedRoute pageKey="butcherCashier"><ButcherCashierPage /></ProtectedRoute>} />
      <Route path="/analytics" component={() => <ProtectedRoute pageKey="analytics"><AnalyticsDashboardPage /></ProtectedRoute>} />
      <Route path="/consumption" component={() => <ProtectedRoute pageKey="consumption"><ConsumptionPage /></ProtectedRoute>} />
      <Route path="/kitchen-consumption-report" component={() => <ProtectedRoute pageKey="kitchenConsumptionReport"><KitchenConsumptionReportPage /></ProtectedRoute>} />
      <Route path="/sales" component={() => <ProtectedRoute pageKey="sales"><SalesPage /></ProtectedRoute>} />
      <Route path="/whatsapp-reports" component={() => <ProtectedRoute pageKey="whatsappReports"><WhatsAppReportsPage /></ProtectedRoute>} />
      <Route path="/wa-chats" component={() => <ProtectedRoute pageKey="waChats" noPadding><WaChatsPage /></ProtectedRoute>} />
      <Route path="/wa-numbers" component={() => <ProtectedRoute pageKey="waNumbers"><WaNumbersPage /></ProtectedRoute>} />
      <Route path="/wa-analytics" component={() => <ProtectedRoute pageKey="waAnalytics"><WaAnalyticsDashboard /></ProtectedRoute>} />
      <Route path="/daily-accounts" component={() => <ProtectedRoute pageKey="dailyAccounts"><DailyAccountsPage /></ProtectedRoute>} />
      <Route path="/supplier-items-report" component={() => <ProtectedRoute pageKey="supplierItemsReport"><SupplierItemsReportPage /></ProtectedRoute>} />
      <Route path="/variance-analysis" component={() => <ProtectedRoute pageKey="varianceAnalysis"><VarianceAnalysisPage /></ProtectedRoute>} />
      <Route path="/purchase-vs-sales" component={() => <ProtectedRoute pageKey="purchaseVsSales"><PurchaseVsSalesPage /></ProtectedRoute>} />
      <Route path="/material-prices" component={() => <ProtectedRoute pageKey="materialPrices"><MaterialPricesPage /></ProtectedRoute>} />
      <Route path="/menu" component={() => <ProtectedRoute pageKey="menu"><MenuPage /></ProtectedRoute>} />
      <Route path="/menu-import" component={() => <ProtectedRoute pageKey="menuImport"><MenuImportPage /></ProtectedRoute>} />
      <Route path="/price-comparison" component={() => <ProtectedRoute pageKey="priceComparison"><PriceComparisonPage /></ProtectedRoute>} />
      <Route path="/food-cost" component={() => <ProtectedRoute pageKey="foodCost"><FoodCostPage /></ProtectedRoute>} />
      <Route path="/monthly-payments" component={() => <ProtectedRoute pageKey="monthlyPayments"><MonthlyPayments /></ProtectedRoute>} />
      <Route path="/production-planning" component={() => <ProtectedRoute pageKey="productionPlanning"><ProductionPlanningPage /></ProtectedRoute>} />
      <Route path="/menu-engineering" component={() => <ProtectedRoute pageKey="menuEngineering"><MenuEngineeringPage /></ProtectedRoute>} />
      <Route path="/shifts" component={() => <ProtectedRoute pageKey="shifts"><ShiftsPage /></ProtectedRoute>} />
      <Route path="/purchase-orders" component={() => <ProtectedRoute pageKey="purchaseOrders"><PurchaseOrdersPage /></ProtectedRoute>} />
      <Route path="/inventory-forecast" component={() => <ProtectedRoute pageKey="inventoryForecast"><InventoryForecastPage /></ProtectedRoute>} />
      <Route path="/price-simulator" component={() => <ProtectedRoute pageKey="priceSimulator"><PriceSimulatorPage /></ProtectedRoute>} />
      <Route path="/waste-analytics" component={() => <ProtectedRoute pageKey="wasteAnalytics"><WasteAnalyticsPage /></ProtectedRoute>} />
      <Route path="/daily-flash" component={() => <ProtectedRoute pageKey="dailyFlash"><DailyFlashPage /></ProtectedRoute>} />
      {/* POS — full-screen no layout padding */}
      <Route path="/pos/cashier" component={() => <ProtectedRoute pageKey="posCashier" noPadding><CashierPage /></ProtectedRoute>} />
      <Route path="/pos/waiter" component={() => <ProtectedRoute pageKey="posWaiter" noPadding><WaiterPage /></ProtectedRoute>} />
      <Route path="/pos/kitchen" component={() => <ProtectedRoute pageKey="posKitchen" noPadding><KitchenDisplayPage /></ProtectedRoute>} />
      <Route path="/pos/customers" component={() => <ProtectedRoute pageKey="posCashier"><CustomersPage /></ProtectedRoute>} />
      <Route path="/pos/service-stock" component={() => <ProtectedRoute pageKey="posServiceStock"><KitchenServiceStockPage /></ProtectedRoute>} />
      <Route path="/menu/print/live/:token" component={PrintMenuPage} />
      <Route path="/menu/print/:token" component={PrintMenuPage} />
      <Route path="/menu/live/:token" component={PublicMenuPage} />
      <Route path="/menu/:token" component={PublicMenuPage} />
      <Route path="/m" component={PublicMenuPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <LanguageProvider>
          <TooltipProvider>
            <Toaster richColors position="top-center" />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
