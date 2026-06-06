import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CalendarDays, Plus, Trash2, Users, ChevronLeft, ChevronRight,
  Clock, Edit2, Sun, Sunset, Moon,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type ShiftType = "morning" | "afternoon" | "night";

const SHIFT_CONFIG: Record<ShiftType, {
  label: string; labelEn: string; icon: any;
  color: string; bg: string; border: string; badge: string;
  defaultStart: string; defaultEnd: string;
}> = {
  morning:   { label: "صباحي",    labelEn: "Morning",   icon: Sun,    color: "text-sky-700",    bg: "bg-sky-50",    border: "border-sky-200",    badge: "bg-sky-100 text-sky-800 border-sky-200",    defaultStart: "07:00", defaultEnd: "15:00" },
  afternoon: { label: "مسائي",    labelEn: "Afternoon", icon: Sunset, color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  badge: "bg-amber-100 text-amber-800 border-amber-200",  defaultStart: "15:00", defaultEnd: "23:00" },
  night:     { label: "ليلي",     labelEn: "Night",     icon: Moon,   color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", badge: "bg-indigo-100 text-indigo-800 border-indigo-200", defaultStart: "23:00", defaultEnd: "07:00" },
};

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function getWeekDates(anchor: Date): Date[] {
  const sunday = new Date(anchor);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function formatDisplayDate(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

interface AssignmentInput {
  employeeName: string;
  employeeNameAr: string;
  role: string;
}

const emptyForm = {
  shiftDate: formatDate(new Date()),
  shiftType: "morning" as ShiftType,
  startTime: "07:00",
  endTime: "15:00",
  notes: "",
  assignments: [{ employeeName: "", employeeNameAr: "", role: "" }] as AssignmentInput[],
};

export default function ShiftsPage() {
  const { isRTL } = useLanguage();
  const [anchor, setAnchor] = useState(new Date());
  const weekDates = useMemo(() => getWeekDates(anchor), [anchor]);
  const fromDate = formatDate(weekDates[0]);
  const toDate = formatDate(weekDates[6]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: shifts = [], refetch } = trpc.shifts.list.useQuery({ fromDate, toDate });
  const { data: stats } = trpc.shifts.stats.useQuery({ fromDate, toDate });

  const createMutation = trpc.shifts.create.useMutation({
    onSuccess: () => { toast.success("تم إنشاء الوردية"); setDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.shifts.update.useMutation({
    onSuccess: () => { toast.success("تم تحديث الوردية"); setDialogOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.shifts.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف الوردية"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function openCreate(date?: string) {
    setEditingId(null);
    setForm({ ...emptyForm, shiftDate: date ?? formatDate(new Date()) });
    setDialogOpen(true);
  }

  function openEdit(shift: any) {
    setEditingId(shift.id);
    setForm({
      shiftDate: shift.shiftDate,
      shiftType: shift.shiftType as ShiftType,
      startTime: shift.startTime,
      endTime: shift.endTime,
      notes: shift.notes ?? "",
      assignments: shift.assignments?.length
        ? shift.assignments.map((a: any) => ({ employeeName: a.employeeName, employeeNameAr: a.employeeNameAr ?? "", role: a.role ?? "" }))
        : [{ employeeName: "", employeeNameAr: "", role: "" }],
    });
    setDialogOpen(true);
  }

  function handleTypeChange(t: ShiftType) {
    const cfg = SHIFT_CONFIG[t];
    setForm(prev => ({ ...prev, shiftType: t, startTime: cfg.defaultStart, endTime: cfg.defaultEnd }));
  }

  function addAssignment() {
    setForm(prev => ({ ...prev, assignments: [...prev.assignments, { employeeName: "", employeeNameAr: "", role: "" }] }));
  }

  function removeAssignment(idx: number) {
    setForm(prev => ({ ...prev, assignments: prev.assignments.filter((_, i) => i !== idx) }));
  }

  function updateAssignment(idx: number, field: keyof AssignmentInput, value: string) {
    setForm(prev => {
      const a = [...prev.assignments];
      a[idx] = { ...a[idx], [field]: value };
      return { ...prev, assignments: a };
    });
  }

  function handleSubmit() {
    const validAssignments = form.assignments.filter(a => a.employeeName.trim());
    const payload = {
      shiftDate: form.shiftDate,
      shiftType: form.shiftType,
      startTime: form.startTime,
      endTime: form.endTime,
      notes: form.notes || undefined,
      assignments: validAssignments,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Group shifts by date
  const shiftsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of weekDates) map[formatDate(d)] = [];
    for (const s of shifts as any[]) {
      if (map[s.shiftDate]) map[s.shiftDate].push(s);
    }
    return map;
  }, [shifts, weekDates]);

  return (
    <div className={`space-y-6 ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">إدارة الورديات</h1>
            <p className="text-sm text-muted-foreground">جدولة ورديات المطبخ والموظفين</p>
          </div>
        </div>
        <Button onClick={() => openCreate()} className="bg-violet-600 hover:bg-violet-700">
          <Plus className="w-4 h-4 ml-2" /> إضافة وردية
        </Button>
      </div>

      {/* Stats KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "إجمالي الورديات", value: (stats as any).totalShifts, icon: CalendarDays, color: "text-violet-600", bg: "bg-violet-50" },
            { label: "متوسط الموظفين", value: `${((stats as any).avgStaffPerShift ?? 0).toFixed(1)}`, icon: Users, color: "text-sky-600", bg: "bg-sky-50" },
            { label: "ورديات صباحية", value: (stats as any).morningCount, icon: Sun, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "ورديات ليلية", value: (stats as any).nightCount, icon: Moon, color: "text-indigo-600", bg: "bg-indigo-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className="pt-5 pb-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <div className="text-2xl font-bold">{value ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Week Navigation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <CardTitle className="text-base">
              الأسبوع: {formatDisplayDate(weekDates[0])} — {formatDisplayDate(weekDates[6])} / {weekDates[0].getFullYear()}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-t">
            {weekDates.map((date, idx) => {
              const dateStr = formatDate(date);
              const isToday = dateStr === formatDate(new Date());
              const dayShifts = shiftsByDate[dateStr] ?? [];
              return (
                <div key={dateStr} className={`border-r last:border-r-0 min-h-40 flex flex-col ${isToday ? "bg-violet-50/40" : ""}`}>
                  {/* Day header */}
                  <div className={`px-2 py-2 text-center border-b ${isToday ? "bg-violet-100" : "bg-muted/30"}`}>
                    <div className="text-xs font-medium text-muted-foreground">{DAYS_AR[idx]}</div>
                    <div className={`text-lg font-bold ${isToday ? "text-violet-600" : ""}`}>{date.getDate()}</div>
                  </div>
                  {/* Shifts */}
                  <div className="flex-1 p-1 space-y-1">
                    {dayShifts.map((s: any) => {
                      const cfg = SHIFT_CONFIG[s.shiftType as ShiftType];
                      const Icon = cfg.icon;
                      return (
                        <div key={s.id} className={`rounded-md p-1.5 border text-xs ${cfg.bg} ${cfg.border} cursor-pointer hover:opacity-80 transition-opacity`}
                          onClick={() => openEdit(s)}>
                          <div className={`flex items-center gap-1 font-semibold ${cfg.color}`}>
                            <Icon className="w-3 h-3" /> {cfg.label}
                          </div>
                          <div className="text-muted-foreground mt-0.5">{s.startTime}–{s.endTime}</div>
                          {s.assignments?.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                              <Users className="w-3 h-3" /> {s.assignments.length} موظف
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button
                      className="w-full py-1 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground/50 text-xs hover:border-violet-300 hover:text-violet-400 transition-colors"
                      onClick={() => openCreate(dateStr)}
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap">
        {(Object.entries(SHIFT_CONFIG) as [ShiftType, typeof SHIFT_CONFIG.morning][]).map(([key, cfg]) => (
          <Badge key={key} className={`${cfg.badge} border`}><cfg.icon className="w-3 h-3 ml-1" /> {cfg.label} ({cfg.defaultStart}–{cfg.defaultEnd})</Badge>
        ))}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل وردية" : "إضافة وردية جديدة"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>التاريخ</Label>
                <Input type="date" value={form.shiftDate} onChange={e => setForm(p => ({ ...p, shiftDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>نوع الوردية</Label>
                <Select value={form.shiftType} onValueChange={(v) => handleTypeChange(v as ShiftType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SHIFT_CONFIG) as [ShiftType, typeof SHIFT_CONFIG.morning][]).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>وقت البداية</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>وقت النهاية</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>ملاحظات (اختياري)</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="أي ملاحظات خاصة بهذه الوردية..." />
            </div>

            {/* Assignments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>الموظفون</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAssignment}>
                  <Plus className="w-3 h-3 ml-1" /> إضافة
                </Button>
              </div>
              {form.assignments.map((a, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <Input placeholder="الاسم (عربي)" value={a.employeeNameAr}
                    onChange={e => updateAssignment(idx, "employeeNameAr", e.target.value)} className="text-sm" />
                  <Input placeholder="Name (EN)" value={a.employeeName}
                    onChange={e => updateAssignment(idx, "employeeName", e.target.value)} className="text-sm" />
                  <Input placeholder="الدور / المنصب" value={a.role}
                    onChange={e => updateAssignment(idx, "role", e.target.value)} className="text-sm" />
                  {form.assignments.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeAssignment(idx)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editingId && (
              <Button variant="destructive" size="sm" onClick={() => { deleteMutation.mutate({ id: editingId }); setDialogOpen(false); }}
                disabled={deleteMutation.isPending}>
                <Trash2 className="w-4 h-4 ml-1" /> حذف
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={isPending} className="bg-violet-600 hover:bg-violet-700">
              {isPending ? "جاري الحفظ..." : editingId ? "تحديث" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
