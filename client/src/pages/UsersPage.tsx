import React, { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Shield, Users, Eye, Warehouse, Plus, Edit2, Trash2, Loader2, Crown,
  CheckSquare, Square, Settings, ChevronDown, ChevronUp, Mail, Lock, User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Pagination, usePagination } from "@/components/Pagination";

type Role = "admin" | "warehouse_manager" | "viewer";

// All available pages with their labels
const ALL_PAGES = [
  { key: "dashboard",    labelAr: "لوحة التحكم",          labelEn: "Dashboard" },
  { key: "materials",    labelAr: "المواد الخام",          labelEn: "Raw Materials" },
  { key: "categories",   labelAr: "التصنيفات",             labelEn: "Categories" },
  { key: "suppliers",    labelAr: "الموردون",              labelEn: "Suppliers" },
  { key: "transactions", labelAr: "سجل المعاملات",       labelEn: "Transactions" },
  { key: "invoices",     labelAr: "الفواتير",               labelEn: "Invoices" },
  { key: "kitchen",      labelAr: "إنتاج المطبخ",           labelEn: "Kitchen Production" },
  { key: "recipes",      labelAr: "الوصفات",                  labelEn: "Recipes" },
  { key: "semiFinished",         labelAr: "المواد المصنّعة",            labelEn: "Semi-Finished" },
  { key: "wasteLog",          labelAr: "سجل الهدر",                labelEn: "Waste Log" },
  { key: "menuOfferDesigner", labelAr: "مصمم العروض",              labelEn: "Menu Offer Designer" },
  { key: "foodCost",           labelAr: "Food Cost",                    labelEn: "Food Cost" },
  { key: "menu",               labelAr: "المنيو",                       labelEn: "Menu" },
  { key: "consumption",        labelAr: "استهلاك المطبخ",           labelEn: "Consumption" },
  { key: "kitchenConsumptionReport", labelAr: "تقرير استهلاك المطبخ",  labelEn: "Kitchen Consumption Report" },
  { key: "sales",              labelAr: "المبيعات",                    labelEn: "Sales" },
  { key: "dailyAccounts",      labelAr: "الحسابات اليومية",         labelEn: "Daily Accounts" },
  { key: "varianceAnalysis",   labelAr: "تحليل الانحراف",           labelEn: "Variance Analysis" },
  { key: "purchaseVsSales",    labelAr: "المشتريات مقابل المبيعات",  labelEn: "Purchase vs Sales" },
  { key: "materialPrices",     labelAr: "أسعار المواد",              labelEn: "Material Prices" },
  { key: "analytics",          labelAr: "لوحة التحليلات",           labelEn: "Analytics" },
  { key: "whatsappReports",    labelAr: "تقارير WhatsApp",             labelEn: "WhatsApp Reports" },
  { key: "waChats",             labelAr: "شات واتساب",                  labelEn: "WhatsApp Chats" },
  { key: "waNumbers",           labelAr: "أرقام المطعم",                 labelEn: "Restaurant Numbers" },
  { key: "supplierItemsReport",labelAr: "تقرير الموردين",           labelEn: "Supplier Items Report" },
  { key: "alerts",            labelAr: "التنبيهات",               labelEn: "Alerts" },
  { key: "reports",           labelAr: "التقارير",                labelEn: "Reports" },
  { key: "settings",          labelAr: "الإعدادات",               labelEn: "Settings" },
  { key: "users",             labelAr: "إدارة المستخدمين",     labelEn: "Users Management" },
  { key: "butcherRecipes",    labelAr: "وصفات الجزارة",            labelEn: "Butcher Recipes" },
  { key: "butcherProduction", labelAr: "إنتاج الجزارة",            labelEn: "Butcher Production" },
  { key: "butcherWaste",      labelAr: "هدر الجزارة",               labelEn: "Butcher Waste" },
  { key: "butcherCashier",    labelAr: "كاشير الجزارة",             labelEn: "Butcher Cashier" },
  { key: "productionPlanning", labelAr: "تخطيط الإنتاج",           labelEn: "Production Planning" },
  { key: "menuEngineering",   labelAr: "هندسة القائمة",             labelEn: "Menu Engineering" },
  { key: "shifts",            labelAr: "إدارة الورديات",            labelEn: "Shift Management" },
  { key: "purchaseOrders",    labelAr: "طلبات الشراء",              labelEn: "Purchase Orders" },
  { key: "inventoryForecast", labelAr: "توقعات المخزون",            labelEn: "Inventory Forecast" },
  { key: "priceSimulator",    labelAr: "محاكي الأسعار",             labelEn: "Price Simulator" },
  { key: "wasteAnalytics",    labelAr: "تحليل الهدر المتقدم",       labelEn: "Advanced Waste Analytics" },
  { key: "dailyFlash",        labelAr: "تقرير اليومية",             labelEn: "Daily Flash Report" },
  { key: "posCashier",        labelAr: "الكاشير",                   labelEn: "Cashier" },
  { key: "posWaiter",         labelAr: "الويتر",                    labelEn: "Waiter" },
  { key: "posKitchen",        labelAr: "شاشة المطبخ",               labelEn: "Kitchen Display" },
  { key: "posServiceStock",   labelAr: "إعداد الإنتاج اليومي",     labelEn: "Daily Production Setup" },
  { key: "posCustomers",      labelAr: "عملاء التوصيل",             labelEn: "Delivery Customers" },
];

const ROLE_CONFIG: Record<Role, { icon: React.ReactNode; color: string; label: { ar: string; en: string } }> = {
  admin: { icon: <Crown size={14} />, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300", label: { ar: "مدير", en: "Admin" } },
  warehouse_manager: { icon: <Warehouse size={14} />, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", label: { ar: "مشرف مخزون", en: "Warehouse Manager" } },
  viewer: { icon: <Eye size={14} />, color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: { ar: "مشاهد", en: "Viewer" } },
};

type UserRow = {
  id: number; name: string; email: string; role: Role;
  isActive: boolean; createdAt: Date; lastSignedIn: Date;
  allowedPages?: string | null;
};

export default function UsersPage() {
  const { isRTL, language } = useLanguage();
  const { user: currentUser } = useAuth();
  const [, navigate] = useLocation();
  const ar = language === "ar";

  if (currentUser && currentUser.role !== "admin") {
    navigate("/");
    return null;
  }

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.users.list.useQuery();

  const [showDialog, setShowDialog] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "viewer" as Role,
    allowedPages: ALL_PAGES.map(p => p.key) as string[],
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const usersPagination = usePagination(users ?? [], 15);
  const pagedUsers = usersPagination.paginate(usersPage);

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); setShowDialog(false); toast.success(ar ? "تم إنشاء المستخدم" : "User created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); setShowDialog(false); setEditUser(null); toast.success(ar ? "تم التحديث" : "Updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => { utils.users.list.invalidate(); setDeleteId(null); toast.success(ar ? "تم الحذف" : "Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const parsePages = (u: UserRow): string[] | null => {
    if (u.role === "admin") return null;
    if (!u.allowedPages) return ALL_PAGES.map(p => p.key);
    try { return JSON.parse(u.allowedPages); } catch { return ALL_PAGES.map(p => p.key); }
  };

  const openCreate = () => {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "viewer", allowedPages: ALL_PAGES.map(p => p.key) });
    setShowDialog(true);
  };

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    const pages = parsePages(u);
    setForm({
      name: u.name, email: u.email, password: "", role: u.role,
      allowedPages: pages ?? ALL_PAGES.map(p => p.key),
    });
    setShowDialog(true);
  };

  const togglePage = (key: string) => {
    setForm(f => ({
      ...f,
      allowedPages: f.allowedPages.includes(key)
        ? f.allowedPages.filter(k => k !== key)
        : [...f.allowedPages, key],
    }));
  };

  const toggleAllPages = () => {
    setForm(f => ({
      ...f,
      allowedPages: f.allowedPages.length === ALL_PAGES.length ? [] : ALL_PAGES.map(p => p.key),
    }));
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error(ar ? "الاسم والبريد مطلوبان" : "Name and email required"); return; }
    const pages = form.role === "admin" ? null : form.allowedPages;
    if (editUser) {
      const data: Record<string, unknown> = { id: editUser.id, name: form.name, email: form.email, role: form.role, allowedPages: pages };
      if (form.password.length >= 6) data.password = form.password;
      updateMutation.mutate(data as any);
    } else {
      if (form.password.length < 6) { toast.error(ar ? "كلمة المرور 6 أحرف على الأقل" : "Password min 6 characters"); return; }
      createMutation.mutate({ name: form.name, email: form.email, password: form.password, role: form.role, allowedPages: pages });
    }
  };

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(ar ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-bold text-foreground">{ar ? "إدارة المستخدمين" : "User Management"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{users?.length ?? 0} {ar ? "مستخدم" : "users"}</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={15} />
          {ar ? "مستخدم جديد" : "New User"}
        </Button>
      </div>

      {/* Users Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {[
                  ar ? "المستخدم" : "User",
                  ar ? "البريد الإلكتروني" : "Email",
                  ar ? "الدور" : "Role",
                  ar ? "الصفحات المتاحة" : "Allowed Pages",
                  ar ? "الحالة" : "Status",
                  ar ? "إجراءات" : "Actions",
                ].map((h) => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border whitespace-nowrap ${isRTL ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3 border-b border-border/50">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !users?.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <Users size={32} className="mx-auto mb-2 opacity-30" />
                    <p>{ar ? "لا يوجد مستخدمون" : "No users found"}</p>
                  </td>
                </tr>
              ) : (
                (pagedUsers as UserRow[]).map((u) => {
                  const roleCfg = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.viewer;
                  const isMe = u.id === currentUser?.id;
                  const pages = parsePages(u);
                  const isExpanded = expandedUser === u.id;
                  return (
                    <React.Fragment key={u.id}>
                      <tr className={`hover:bg-muted/30 transition-colors ${isMe ? "bg-primary/5" : ""}`}>
                        <td className={`px-4 py-3 border-b border-border/50 ${isRTL ? "text-right" : ""}`}>
                          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                              {u.name?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{u.name}</p>
                              {isMe && <span className="text-xs text-primary">{ar ? "(أنت)" : "(You)"}</span>}
                            </div>
                          </div>
                        </td>
                        <td className={`px-4 py-3 border-b border-border/50 text-muted-foreground text-xs ${isRTL ? "text-right" : ""}`}>{u.email}</td>
                        <td className="px-4 py-3 border-b border-border/50">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg font-medium ${roleCfg.color}`}>
                            {roleCfg.icon}
                            {ar ? roleCfg.label.ar : roleCfg.label.en}
                          </span>
                        </td>
                        {/* Pages column */}
                        <td className="px-4 py-3 border-b border-border/50">
                          <button
                            onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
                            <Settings size={12} />
                            {pages === null
                              ? (ar ? "جميع الصفحات" : "All pages")
                              : `${pages.length}/${ALL_PAGES.length} ${ar ? "صفحات" : "pages"}`}
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 border-b border-border/50">
                          <span className={`text-xs font-medium ${u.isActive ? "text-green-600" : "text-red-500"}`}>
                            {u.isActive ? (ar ? "نشط" : "Active") : (ar ? "معطل" : "Inactive")}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-b border-border/50">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(u)} className="h-7 w-7 p-0">
                              <Edit2 size={13} />
                            </Button>
                            {!isMe && (
                              <Button size="sm" variant="ghost" onClick={() => setDeleteId(u.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                <Trash2 size={13} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expanded permissions row */}
                      {isExpanded && (
                        <tr key={`${u.id}-perms`}>
                          <td colSpan={6} className="px-6 py-3 bg-muted/30 border-b border-border/50">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              {ar ? "الصفحات المتاحة لهذا المستخدم:" : "Pages accessible to this user:"}
                            </p>
                            {pages === null ? (
                              <p className="text-xs text-green-600 font-medium">
                                ✓ {ar ? "جميع الصفحات (مدير)" : "All pages (Admin)"}
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {ALL_PAGES.map(page => (
                                  <span
                                    key={page.key}
                                    className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                                      pages.includes(page.key)
                                        ? "bg-primary/10 text-primary border-primary/20"
                                        : "bg-muted text-muted-foreground/50 border-border line-through"
                                    }`}
                                  >
                                    {ar ? page.labelAr : page.labelEn}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={usersPage}
            totalPages={usersPagination.totalPages}
            onPageChange={(p) => setUsersPage(p)}
            totalItems={usersPagination.totalItems}
            pageSize={15}
          />
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditUser(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{editUser ? (ar ? "تعديل المستخدم" : "Edit User") : (ar ? "إضافة مستخدم جديد" : "Add New User")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>{ar ? "الاسم الكامل" : "Full Name"}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={ar ? "أدخل الاسم" : "Enter name"} />
            </div>
            {/* Email */}
            <div className="space-y-1.5">
              <Label>{ar ? "البريد الإلكتروني" : "Email"}</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
            </div>
            {/* Password */}
            <div className="space-y-1.5">
              <Label>{editUser ? (ar ? "كلمة المرور الجديدة (اتركها فارغة للإبقاء)" : "New Password (leave blank to keep)") : (ar ? "كلمة المرور" : "Password")}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={editUser ? (ar ? "اتركها فارغة" : "Leave blank") : (ar ? "6 أحرف على الأقل" : "Min 6 characters")} />
            </div>
            {/* Role */}
            <div className="space-y-1.5">
              <Label>{ar ? "الدور" : "Role"}</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{ar ? "مدير - وصول كامل" : "Admin - Full Access"}</SelectItem>
                  <SelectItem value="warehouse_manager">{ar ? "مشرف مخزون" : "Warehouse Manager"}</SelectItem>
                  <SelectItem value="viewer">{ar ? "مشاهد - عرض فقط" : "Viewer - Read Only"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page Permissions - only for non-admin */}
            {form.role !== "admin" && (
              <div className="space-y-2">
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <Label>{ar ? "الصفحات المسموح بها" : "Allowed Pages"}</Label>
                  <button
                    type="button"
                    onClick={toggleAllPages}
                    className="text-xs text-primary hover:underline"
                  >
                    {form.allowedPages.length === ALL_PAGES.length
                      ? (ar ? "إلغاء تحديد الكل" : "Deselect all")
                      : (ar ? "تحديد الكل" : "Select all")}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1 p-3 bg-muted/40 rounded-lg border border-border/50">
                  {ALL_PAGES.map(page => {
                    const checked = form.allowedPages.includes(page.key);
                    return (
                      <button
                        key={page.key}
                        type="button"
                        onClick={() => togglePage(page.key)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all text-start ${
                          checked ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {checked
                          ? <CheckSquare size={15} className="text-primary flex-shrink-0" />
                          : <Square size={15} className="flex-shrink-0" />}
                        {ar ? page.labelAr : page.labelEn}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? `تم تحديد ${form.allowedPages.length} من ${ALL_PAGES.length} صفحات`
                    : `${form.allowedPages.length} of ${ALL_PAGES.length} pages selected`}
                </p>
              </div>
            )}

            {form.role === "admin" && (
              <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800/30">
                <p className="text-xs text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <Shield size={13} />
                  {ar ? "المدير يملك وصولاً كاملاً لجميع الصفحات تلقائياً" : "Admin has full access to all pages automatically"}
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="flex-1">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin me-2" />}
                {editUser ? (ar ? "حفظ التغييرات" : "Save Changes") : (ar ? "إنشاء المستخدم" : "Create User")}
              </Button>
              <Button variant="outline" onClick={() => { setShowDialog(false); setEditUser(null); }}>{ar ? "إلغاء" : "Cancel"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="text-destructive">{ar ? "تأكيد الحذف" : "Confirm Delete"}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">{ar ? "هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع." : "Are you sure? This cannot be undone."}</p>
          <div className="flex gap-2 pt-2">
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} disabled={deleteMutation.isPending} className="flex-1">
              {deleteMutation.isPending && <Loader2 size={14} className="animate-spin me-2" />}
              {ar ? "حذف" : "Delete"}
            </Button>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{ar ? "إلغاء" : "Cancel"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
