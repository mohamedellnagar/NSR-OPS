import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Trash2, CheckCircle, Edit2, Calendar, AlertTriangle,
  Clock, DollarSign, Users, Home, Zap, MoreHorizontal, TrendingUp, RefreshCw
} from "lucide-react";

const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const CATEGORIES = [
  { value: "salaries", label: "رواتب", icon: Users, color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "rent", label: "إيجارات", icon: Home, color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "utilities", label: "فواتير", icon: Zap, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "other", label: "أخرى", icon: MoreHorizontal, color: "bg-gray-100 text-gray-700 border-gray-200" },
];

function fmt(n: number | string | null | undefined) {
  const v = parseFloat(String(n ?? 0));
  return isNaN(v) ? "0.00" : v.toLocaleString("ar-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(status: string) {
  if (status === "paid") return <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs">مدفوع ✓</Badge>;
  if (status === "overdue") return <Badge className="bg-red-100 text-red-700 border-red-200 border text-xs">متأخر ⚠</Badge>;
  return <Badge className="bg-orange-100 text-orange-700 border-orange-200 border text-xs">قيد الانتظار</Badge>;
}

function catInfo(cat: string) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[3];
}

interface PaymentFormData {
  name: string;
  category: string;
  totalAmount: string;
  paidAmount: string;
  dueDay: string;
  month: number;
  year: number;
  recurrence: string;
  notes: string;
  copyToMonths: number[];
}

const defaultForm = (month: number, year: number): PaymentFormData => ({
  name: "", category: "salaries", totalAmount: "", paidAmount: "0",
  dueDay: "1", month, year, recurrence: "monthly", notes: "", copyToMonths: [],
});

export default function MonthlyPayments() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [activeTab, setActiveTab] = useState("payments");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editPayment, setEditPayment] = useState<any>(null);
  const [form, setForm] = useState<PaymentFormData>(defaultForm(now.getMonth() + 1, now.getFullYear()));
  const [markPaidDialog, setMarkPaidDialog] = useState<any>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleteMonthConfirm, setDeleteMonthConfirm] = useState(false);

  const utils = trpc.useUtils();

  const { data: payments = [], isLoading } = trpc.monthlyPayments.getByMonth.useQuery({
    month: selectedMonth, year: selectedYear
  });

  const { data: yearlySummary } = trpc.monthlyPayments.getYearlySummary.useQuery({
    year: selectedYear
  });

  const createMutation = trpc.monthlyPayments.create.useMutation({
    onSuccess: () => {
      utils.monthlyPayments.getByMonth.invalidate();
      utils.monthlyPayments.getYearlySummary.invalidate();
      setShowAddDialog(false);
      toast.success("تم الإضافة", { description: "تمت إضافة المدفوعة بنجاح" });
    },
    onError: (e) => toast.error("خطأ", { description: e.message }),
  });

  const updateMutation = trpc.monthlyPayments.update.useMutation({
    onSuccess: () => {
      utils.monthlyPayments.getByMonth.invalidate();
      utils.monthlyPayments.getYearlySummary.invalidate();
      setEditPayment(null);
      toast.success("تم التحديث");
    },
    onError: (e) => toast.error("خطأ", { description: e.message }),
  });

  const markPaidMutation = trpc.monthlyPayments.markAsPaid.useMutation({
    onSuccess: () => {
      utils.monthlyPayments.getByMonth.invalidate();
      utils.monthlyPayments.getYearlySummary.invalidate();
      setMarkPaidDialog(null);
      toast.success("تم التعليم كمدفوع ✓");
    },
    onError: (e) => toast.error("خطأ", { description: e.message }),
  });

  const deleteMutation = trpc.monthlyPayments.delete.useMutation({
    onSuccess: () => {
      utils.monthlyPayments.getByMonth.invalidate();
      utils.monthlyPayments.getYearlySummary.invalidate();
      setDeleteConfirm(null);
      toast.success("تم الحذف");
    },
    onError: (e) => toast.error("خطأ", { description: e.message }),
  });

  const deleteMonthMutation = trpc.monthlyPayments.deleteByMonth.useMutation({
    onSuccess: (count: any) => {
      utils.monthlyPayments.getByMonth.invalidate();
      utils.monthlyPayments.getYearlySummary.invalidate();
      setDeleteMonthConfirm(false);
      toast.success("تم الحذف", { description: `تم حذف ${count} مدفوعة` });
    },
    onError: (e) => toast.error("خطأ", { description: e.message }),
  });

  // Filter payments
  const filtered = useMemo(() => {
    return payments.filter((p: any) => {
      const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = filterCategory === "all" || p.category === filterCategory;
      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      return matchSearch && matchCat && matchStatus;
    });
  }, [payments, searchQuery, filterCategory, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    const total = payments.reduce((s: number, p: any) => s + parseFloat(p.totalAmount ?? 0), 0);
    const paid = payments.reduce((s: number, p: any) => s + parseFloat(p.paidAmount ?? 0), 0);
    const remaining = total - paid;
    const paidCount = payments.filter((p: any) => p.status === "paid").length;
    const overdueCount = payments.filter((p: any) => p.status === "overdue").length;
    const pendingCount = payments.filter((p: any) => p.status === "pending").length;
    return { total, paid, remaining, paidCount, overdueCount, pendingCount };
  }, [payments]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const p of filtered) {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    }
    return groups;
  }, [filtered]);

  function openAdd() {
    setForm(defaultForm(selectedMonth, selectedYear));
    setShowAddDialog(true);
  }

  function openEdit(p: any) {
    setForm({
      name: p.name, category: p.category,
      totalAmount: String(parseFloat(p.totalAmount)),
      paidAmount: String(parseFloat(p.paidAmount)),
      dueDay: String(p.dueDay), month: p.month, year: p.year,
      recurrence: p.recurrence, notes: p.notes ?? "", copyToMonths: [],
    });
    setEditPayment(p);
  }

  function handleSubmit() {
    const payload = {
      name: form.name,
      category: form.category as any,
      totalAmount: parseFloat(form.totalAmount) || 0,
      paidAmount: parseFloat(form.paidAmount) || 0,
      dueDay: parseInt(form.dueDay) || 1,
      month: form.month,
      year: form.year,
      recurrence: form.recurrence as any,
      notes: form.notes || undefined,
      copyToMonths: form.copyToMonths.length > 0 ? form.copyToMonths : undefined,
    };
    if (editPayment) {
      updateMutation.mutate({ id: editPayment.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function toggleCopyMonth(m: number) {
    setForm(f => ({
      ...f,
      copyToMonths: f.copyToMonths.includes(m)
        ? f.copyToMonths.filter(x => x !== m)
        : [...f.copyToMonths, m],
    }));
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المدفوعات الشهرية الثابتة</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة الرواتب والإيجارات والفواتير المتكررة</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS_AR.map((m, i) => (
                <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" /> إضافة مدفوعة
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="col-span-2 sm:col-span-1 lg:col-span-2">
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">إجمالي المدفوعات</div>
            <div className="text-xl font-bold text-foreground">{fmt(stats.total)} <span className="text-xs font-normal">د.إ</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">المدفوع</div>
            <div className="text-lg font-bold text-green-600">{fmt(stats.paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">المتبقي</div>
            <div className="text-lg font-bold text-orange-600">{fmt(stats.remaining)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">مدفوع</div>
            <div className="text-lg font-bold text-green-600">{stats.paidCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">متأخر</div>
            <div className="text-lg font-bold text-red-600">{stats.overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">انتظار</div>
            <div className="text-lg font-bold text-orange-600">{stats.pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="payments">المدفوعات</TabsTrigger>
          <TabsTrigger value="yearly">الجدول السنوي</TabsTrigger>
        </TabsList>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="بحث..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-48"
            />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-36"><SelectValue placeholder="التصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="paid">مدفوع</SelectItem>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="overdue">متأخر</SelectItem>
              </SelectContent>
            </Select>
            {payments.length > 0 && (
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 mr-auto" onClick={() => setDeleteMonthConfirm(true)}>
                <Trash2 className="w-4 h-4 mr-1" /> حذف كل {MONTHS_AR[selectedMonth-1]}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد مدفوعات لهذا الشهر</p>
              <Button onClick={openAdd} variant="outline" className="mt-3 gap-2">
                <Plus className="w-4 h-4" /> إضافة مدفوعة
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {CATEGORIES.map(cat => {
                const items = grouped[cat.value];
                if (!items || items.length === 0) return null;
                const catTotal = items.reduce((s: number, p: any) => s + parseFloat(p.totalAmount ?? 0), 0);
                const catPaid = items.reduce((s: number, p: any) => s + parseFloat(p.paidAmount ?? 0), 0);
                const CatIcon = cat.icon;
                return (
                  <div key={cat.value}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${cat.color}`}>
                        <CatIcon className="w-4 h-4" />
                        {cat.label}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {fmt(catPaid)} / {fmt(catTotal)} د.إ
                      </span>
                    </div>
                    <div className="space-y-2">
                      {items.map((p: any) => (
                        <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors ${p.status === 'overdue' ? 'border-red-200' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{p.name}</span>
                              {statusBadge(p.status)}
                              {p.recurrence === "monthly" && (
                                <Badge variant="outline" className="text-xs"><RefreshCw className="w-3 h-3 mr-1" />شهري</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              استحقاق يوم {p.dueDay} — المبلغ: {fmt(p.totalAmount)} د.إ
                              {parseFloat(p.paidAmount) > 0 && parseFloat(p.paidAmount) < parseFloat(p.totalAmount) && (
                                <span className="text-orange-600"> — مدفوع: {fmt(p.paidAmount)} — متبقي: {fmt(parseFloat(p.totalAmount) - parseFloat(p.paidAmount))}</span>
                              )}
                            </div>
                            {p.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">{p.notes}</div>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {p.status !== "paid" && (
                              <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700 h-8 px-2" onClick={() => { setMarkPaidDialog(p); setMarkPaidAmount(String(parseFloat(p.totalAmount))); }}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEdit(p)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 h-8 px-2" onClick={() => setDeleteConfirm(p.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Yearly Tab */}
        <TabsContent value="yearly">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right p-3 font-medium">الشهر</th>
                  <th className="text-right p-3 font-medium text-blue-600">رواتب</th>
                  <th className="text-right p-3 font-medium text-purple-600">إيجارات</th>
                  <th className="text-right p-3 font-medium text-yellow-600">فواتير</th>
                  <th className="text-right p-3 font-medium text-gray-600">أخرى</th>
                  <th className="text-right p-3 font-medium">إجمالي</th>
                  <th className="text-right p-3 font-medium text-green-600">مبيعات</th>
                  <th className="text-right p-3 font-medium text-orange-600">التشغيلية</th>
                  <th className="text-right p-3 font-medium">صافي بعد الثوابت</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS_AR.map((mName, idx) => {
                  const m = idx + 1;
                  const row = yearlySummary?.monthly?.find((r: any) => r.month === m);
                  const dailyRow = yearlySummary?.daily?.find((r: any) => r.month === m);
                  const totalFixed = parseFloat(row?.total ?? 0);
                  const totalSales = parseFloat(dailyRow?.totalSales ?? 0);
                  const totalOps = parseFloat(dailyRow?.operationalExpenses ?? 0) + parseFloat(dailyRow?.maintenanceExpenses ?? 0);
                  const netAfterFixed = totalSales - totalOps - totalFixed;
                  const isCurrentMonth = m === now.getMonth() + 1 && selectedYear === now.getFullYear();
                  return (
                    <tr key={m} className={`border-t hover:bg-muted/30 cursor-pointer ${isCurrentMonth ? 'bg-primary/5 font-medium' : ''}`}
                      onClick={() => { setSelectedMonth(m); setActiveTab("payments"); }}>
                      <td className="p-3">{mName} {isCurrentMonth && <span className="text-xs text-primary mr-1">← الحالي</span>}</td>
                      <td className="p-3 text-blue-600">{row?.salaries ? fmt(row.salaries) : "—"}</td>
                      <td className="p-3 text-purple-600">{row?.rent ? fmt(row.rent) : "—"}</td>
                      <td className="p-3 text-yellow-600">{row?.utilities ? fmt(row.utilities) : "—"}</td>
                      <td className="p-3 text-gray-600">{row?.other ? fmt(row.other) : "—"}</td>
                      <td className="p-3 font-medium">{totalFixed > 0 ? fmt(totalFixed) : "—"}</td>
                      <td className="p-3 text-green-600">{totalSales > 0 ? fmt(totalSales) : "—"}</td>
                      <td className="p-3 text-orange-600">{totalOps > 0 ? fmt(totalOps) : "—"}</td>
                      <td className={`p-3 font-bold ${netAfterFixed > 0 ? 'text-green-600' : netAfterFixed < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {totalFixed > 0 || totalSales > 0 ? fmt(netAfterFixed) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/50 border-t-2">
                <tr>
                  <td className="p-3 font-bold">الإجمالي</td>
                  {["salaries","rent","utilities","other"].map(cat => {
                    const total = yearlySummary?.monthly?.reduce((s: number, r: any) => s + parseFloat(r[cat] ?? 0), 0) ?? 0;
                    return <td key={cat} className="p-3 font-bold">{total > 0 ? fmt(total) : "—"}</td>;
                  })}
                  <td className="p-3 font-bold">
                    {fmt(yearlySummary?.monthly?.reduce((s: number, r: any) => s + parseFloat(r.total ?? 0), 0) ?? 0)}
                  </td>
                  <td className="p-3 font-bold text-green-600">
                    {fmt(yearlySummary?.daily?.reduce((s: number, r: any) => s + parseFloat(r.totalSales ?? 0), 0) ?? 0)}
                  </td>
                  <td className="p-3 font-bold text-orange-600">
                    {fmt(yearlySummary?.daily?.reduce((s: number, r: any) => s + parseFloat(r.operationalExpenses ?? 0), 0) ?? 0)}
                  </td>
                  <td className="p-3 font-bold">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog || !!editPayment} onOpenChange={v => { if (!v) { setShowAddDialog(false); setEditPayment(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPayment ? "تعديل مدفوعة" : "إضافة مدفوعة شهرية"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>اسم المدفوعة *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: راتب المحاسب" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>التصنيف</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>نوع التكرار</Label>
                <Select value={form.recurrence} onValueChange={v => setForm(f => ({ ...f, recurrence: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري متكرر</SelectItem>
                    <SelectItem value="once">دفعة واحدة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المبلغ الإجمالي (د.إ) *</Label>
                <Input type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>المبلغ المدفوع (د.إ)</Label>
                <Input type="number" value={form.paidAmount} onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>يوم الاستحقاق</Label>
                <Input type="number" min={1} max={31} value={form.dueDay} onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} />
              </div>
              <div>
                <Label>الشهر</Label>
                <Select value={String(form.month)} onValueChange={v => setForm(f => ({ ...f, month: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS_AR.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>السنة</Label>
                <Select value={String(form.year)} onValueChange={v => setForm(f => ({ ...f, year: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="ملاحظات اختيارية..." />
            </div>
            {!editPayment && (
              <div>
                <Label className="mb-2 block">نسخ لأشهر أخرى (اختياري)</Label>
                <div className="grid grid-cols-4 gap-2">
                  {MONTHS_AR.map((m, i) => {
                    const mNum = i + 1;
                    if (mNum === form.month) return null;
                    return (
                      <div key={mNum} className="flex items-center gap-1">
                        <Checkbox
                          id={`month-${mNum}`}
                          checked={form.copyToMonths.includes(mNum)}
                          onCheckedChange={() => toggleCopyMonth(mNum)}
                        />
                        <label htmlFor={`month-${mNum}`} className="text-xs cursor-pointer">{m}</label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditPayment(null); }}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.totalAmount || createMutation.isPending || updateMutation.isPending}>
              {editPayment ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Dialog */}
      <Dialog open={!!markPaidDialog} onOpenChange={v => !v && setMarkPaidDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تعليم كمدفوع</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{markPaidDialog?.name}</p>
            <div>
              <Label>المبلغ المدفوع (د.إ)</Label>
              <Input type="number" value={markPaidAmount} onChange={e => setMarkPaidAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidDialog(null)}>إلغاء</Button>
            <Button onClick={() => markPaidMutation.mutate({ id: markPaidDialog.id, paidAmount: parseFloat(markPaidAmount) })} disabled={markPaidMutation.isPending}>
              <CheckCircle className="w-4 h-4 mr-1" /> تأكيد الدفع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">هل أنت متأكد من حذف هذه المدفوعة؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate({ id: deleteConfirm! })} disabled={deleteMutation.isPending}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Month Confirm */}
      <Dialog open={deleteMonthConfirm} onOpenChange={setDeleteMonthConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>حذف كل مدفوعات {MONTHS_AR[selectedMonth-1]}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">سيتم حذف جميع المدفوعات ({payments.length}) لشهر {MONTHS_AR[selectedMonth-1]} {selectedYear}. هذا الإجراء لا يمكن التراجع عنه.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMonthConfirm(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMonthMutation.mutate({ month: selectedMonth, year: selectedYear })} disabled={deleteMonthMutation.isPending}>حذف الكل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
