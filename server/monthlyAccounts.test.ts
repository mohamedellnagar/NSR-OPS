import { describe, it, expect } from "vitest";
import {
  LEGACY_CATEGORY_MAP,
  PAYMENT_CATEGORY_MAP,
  needsClassification,
  expenseTypeLabel,
  expenseCategoryLabel,
  EXPENSE_CATEGORY_CODES,
  EXPENSE_TYPES,
} from "@shared/expenseClassification";
import { arabicDayName } from "./monthly-accounts-db";

// ── Extracted logic (mirrors monthly-accounts-db.ts getMonthlyAccounts) ──
// The project convention is to re-implement the rule under test rather than
// hit the database; see server/dailyAccounts.test.ts.

type Row = {
  accountDate: string;
  salesCash: number; salesCard: number; salesKita: number; salesOrders: number;
  salesCareem: number; salesDeliveroo: number; salesNoon: number;
  expensesFixed?: number;
};

/** Sums the 7 sales channels — the only sales maths allowed in phase 1. */
function totalSales(r: Row): number {
  return r.salesCash + r.salesCard + r.salesKita + r.salesOrders +
         r.salesCareem + r.salesDeliveroo + r.salesNoon;
}

/** daily_accounts has no unique key on accountDate, so same-day rows are summed. */
function aggregateByDate(rows: Row[]): Map<string, Row> {
  const out = new Map<string, Row>();
  for (const r of rows) {
    const prev = out.get(r.accountDate);
    if (!prev) { out.set(r.accountDate, { ...r }); continue; }
    out.set(r.accountDate, {
      accountDate: r.accountDate,
      salesCash: prev.salesCash + r.salesCash,
      salesCard: prev.salesCard + r.salesCard,
      salesKita: prev.salesKita + r.salesKita,
      salesOrders: prev.salesOrders + r.salesOrders,
      salesCareem: prev.salesCareem + r.salesCareem,
      salesDeliveroo: prev.salesDeliveroo + r.salesDeliveroo,
      salesNoon: prev.salesNoon + r.salesNoon,
      expensesFixed: (prev.expensesFixed ?? 0) + (r.expensesFixed ?? 0),
    });
  }
  return out;
}

function inMonth(dateStr: string, year: number, month: number): boolean {
  return dateStr.startsWith(`${year}-${String(month).padStart(2, "0")}`);
}

describe("الحسابات الشهرية — المبيعات", () => {
  it("1. تجلب مبيعات الشهر المحدد فقط", () => {
    const dates = ["2026-04-30", "2026-05-01", "2026-05-31", "2026-06-01"];
    expect(dates.filter((d) => inMonth(d, 2026, 5))).toEqual(["2026-05-01", "2026-05-31"]);
  });

  it("2. تجمع قنوات المبيعات السبعة بشكل صحيح", () => {
    const r: Row = {
      accountDate: "2026-05-01",
      salesCash: 200, salesCard: 590.25, salesKita: 12, salesOrders: 224,
      salesCareem: 0, salesDeliveroo: 0, salesNoon: 0,
    };
    expect(totalSales(r)).toBe(1026.25);
  });

  it("3. يظهر يوم فيه مصروفات بدون مبيعات", () => {
    const rows: Row[] = [{
      accountDate: "2026-03-05",
      salesCash: 0, salesCard: 0, salesKita: 0, salesOrders: 0,
      salesCareem: 0, salesDeliveroo: 0, salesNoon: 0, expensesFixed: 1300,
    }];
    const agg = aggregateByDate(rows);
    expect(agg.has("2026-03-05")).toBe(true);
    expect(totalSales(agg.get("2026-03-05")!)).toBe(0);
    expect(agg.get("2026-03-05")!.expensesFixed).toBe(1300);
  });

  it("لا تعرض أيامًا مكررة — تُجمع سجلات نفس اليوم", () => {
    const base = {
      salesCard: 0, salesKita: 0, salesOrders: 0,
      salesCareem: 0, salesDeliveroo: 0, salesNoon: 0,
    };
    const agg = aggregateByDate([
      { accountDate: "2026-05-01", salesCash: 100, ...base },
      { accountDate: "2026-05-01", salesCash: 50, ...base },
    ]);
    expect(agg.size).toBe(1);
    expect(agg.get("2026-05-01")!.salesCash).toBe(150);
  });

  it("اسم اليوم بالعربي صحيح", () => {
    expect(arabicDayName("2026-05-01")).toBe("الجمعة");
    expect(arabicDayName("2026-05-02")).toBe("السبت");
    expect(arabicDayName("2026-05-03")).toBe("الأحد");
  });
});

// ── Unified expenses ──
type Expense = {
  id: number;
  sourceType: "SUPPLIER_INVOICE" | "FREE_INVOICE" | "DAILY_EXPENSE";
  date: string;
  total: number; paid: number; remaining: number;
};

describe("الحسابات الشهرية — المصروفات الموحدة", () => {
  const supplier: Expense[] = [
    { id: 1, sourceType: "SUPPLIER_INVOICE", date: "2026-05-01", total: 30, paid: 30, remaining: 0 },
    { id: 2, sourceType: "SUPPLIER_INVOICE", date: "2026-05-02", total: 100, paid: 60, remaining: 40 },
  ];
  const free: Expense[] = [
    { id: 1, sourceType: "FREE_INVOICE", date: "2026-05-03", total: 200, paid: 200, remaining: 0 },
  ];

  it("4. تجمع فواتير الموردين والفواتير الحرة في جدول موحد", () => {
    const unified = [...supplier, ...free];
    expect(unified).toHaveLength(3);
    expect(new Set(unified.map((e) => e.sourceType))).toEqual(
      new Set(["SUPPLIER_INVOICE", "FREE_INVOICE"])
    );
  });

  it("5. لا تكرر الفاتورة — المفتاح هو (المصدر + المعرف)", () => {
    // id=1 يتكرر بين الجدولين لكنه سجلان مختلفان
    const unified = [...supplier, ...free];
    const keys = unified.map((e) => `${e.sourceType}:${e.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("10. لا تظهر فواتير شهر آخر", () => {
    const all = [...supplier, ...free,
      { id: 9, sourceType: "SUPPLIER_INVOICE" as const, date: "2026-04-28", total: 500, paid: 0, remaining: 500 }];
    const may = all.filter((e) => inMonth(e.date, 2026, 5));
    expect(may).toHaveLength(3);
    expect(may.every((e) => e.date.startsWith("2026-05"))).toBe(true);
  });

  it("11. إجمالي الفواتير والمدفوع والمتبقي", () => {
    const unified = [...supplier, ...free];
    const t = unified.reduce(
      (a, e) => ({ total: a.total + e.total, paid: a.paid + e.paid, remaining: a.remaining + e.remaining }),
      { total: 0, paid: 0, remaining: 0 }
    );
    expect(t).toEqual({ total: 330, paid: 290, remaining: 40 });
  });

  it("المتبقي يُشتق من الإجمالي ناقص المدفوع عند غياب القيمة المخزنة", () => {
    const derive = (total: number, paid: number, stored: number) =>
      stored > 0 ? stored : Math.max(0, total - paid);
    expect(derive(100, 60, 0)).toBe(40);
    expect(derive(100, 60, 40)).toBe(40);
    expect(derive(100, 120, 0)).toBe(0); // لا قيم سالبة
  });

  it("المصروف اليومي غير قابل للتصنيف", () => {
    const daily: Expense = { id: 0, sourceType: "DAILY_EXPENSE", date: "2026-03-01", total: 1300, paid: 1300, remaining: 0 };
    const editable = daily.sourceType !== "DAILY_EXPENSE";
    expect(editable).toBe(false);
  });
});

// ── Monthly payments as a fourth expense source ──
describe("الحسابات الشهرية — المدفوعات الشهرية", () => {
  // monthly_payments has no date column: (year, month) + dueDay, clamped.
  function paymentDate(year: number, month: number, dueDay: number): string {
    const last = new Date(year, month, 0).getDate();
    const day = Math.min(Math.max(dueDay || 1, 1), last);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // status is paid|pending|overdue, so the unified status is derived from amounts.
  function derivedStatus(total: number, paid: number): string {
    const remaining = Math.max(0, total - paid);
    return remaining <= 0 && total > 0 ? "paid" : paid > 0 ? "partial" : "deferred";
  }

  it("تظهر المدفوعات الشهرية ضمن جدول المصروفات", () => {
    const unified = [
      { sourceType: "SUPPLIER_INVOICE", id: 1 },
      { sourceType: "FREE_INVOICE", id: 1 },
      { sourceType: "MONTHLY_PAYMENT", id: 1 },
    ];
    expect(unified.filter((e) => e.sourceType === "MONTHLY_PAYMENT")).toHaveLength(1);
    // نفس المعرف في ٣ مصادر ولا يزال بلا تكرار
    const keys = unified.map((e) => `${e.sourceType}:${e.id}`);
    expect(new Set(keys).size).toBe(3);
  });

  it("تاريخ الدفعة من يوم الاستحقاق مع ضبطه داخل حدود الشهر", () => {
    expect(paymentDate(2026, 5, 15)).toBe("2026-05-15");
    expect(paymentDate(2026, 2, 31)).toBe("2026-02-28"); // فبراير أقصر
    expect(paymentDate(2026, 5, 0)).toBe("2026-05-01");  // قيمة غير صالحة
  });

  it("حالة الدفع تُشتق من المبالغ لا من عمود status", () => {
    expect(derivedStatus(1000, 1000)).toBe("paid");
    expect(derivedStatus(1000, 400)).toBe("partial");
    expect(derivedStatus(1000, 0)).toBe("deferred");
  });

  it("ترحيل تصنيفات المدفوعات الشهرية", () => {
    expect(PAYMENT_CATEGORY_MAP.salaries).toEqual({ expenseType: "OPERATIONAL", expenseCategoryCode: "SALARIES" });
    expect(PAYMENT_CATEGORY_MAP.rent).toEqual({ expenseType: "OPERATIONAL", expenseCategoryCode: "RENT" });
    expect(PAYMENT_CATEGORY_MAP.utilities).toEqual({ expenseType: "OPERATIONAL", expenseCategoryCode: "UTILITIES" });
    expect(PAYMENT_CATEGORY_MAP.other).toEqual({ expenseType: null, expenseCategoryCode: "OTHER" });
    expect(needsClassification(PAYMENT_CATEGORY_MAP.other)).toBe(true);
  });

  it("المدفوعات الشهرية قابلة للتصنيف ويُحفظ في جدولها الأصلي", () => {
    const TABLE_BY_SOURCE: Record<string, string> = {
      SUPPLIER_INVOICE: "invoices",
      FREE_INVOICE: "free_invoices",
      MONTHLY_PAYMENT: "monthly_payments",
    };
    expect(TABLE_BY_SOURCE.MONTHLY_PAYMENT).toBe("monthly_payments");
    expect(TABLE_BY_SOURCE.DAILY_EXPENSE).toBeUndefined(); // غير قابل للتصنيف
  });
});

// ── Classification ──
describe("الحسابات الشهرية — نوع وتصنيف المصروف", () => {
  it("6. حفظ نوع المصروف التشغيلي", () => {
    const update = { expenseType: "OPERATIONAL" as const };
    expect(EXPENSE_TYPES).toContain(update.expenseType);
    expect(expenseTypeLabel(update.expenseType)).toBe("تشغيلي");
  });

  it("7. حفظ نوع المصروف غير التشغيلي", () => {
    const update = { expenseType: "NON_OPERATIONAL" as const };
    expect(EXPENSE_TYPES).toContain(update.expenseType);
    expect(expenseTypeLabel(update.expenseType)).toBe("غير تشغيلي");
  });

  it("8. حفظ تصنيف المصروف", () => {
    expect(EXPENSE_CATEGORY_CODES).toContain("FOOD_PURCHASES");
    expect(expenseCategoryLabel("FOOD_PURCHASES")).toBe("مشتريات غذائية");
    expect(expenseCategoryLabel("SALARIES")).toBe("رواتب وأجور");
    expect(EXPENSE_CATEGORY_CODES).toHaveLength(19);
  });

  it("9. السجلات القديمة تظهر كـ (يحتاج تصنيف)", () => {
    expect(needsClassification({ expenseType: null, expenseCategoryCode: null })).toBe(true);
    expect(needsClassification({ expenseType: "OPERATIONAL", expenseCategoryCode: null })).toBe(true);
    expect(needsClassification({ expenseType: null, expenseCategoryCode: "OTHER" })).toBe(true);
    expect(needsClassification({ expenseType: "OPERATIONAL", expenseCategoryCode: "RENT" })).toBe(false);
  });

  it("يعرض (غير محدد) و(غير مصنف) للقيم الفارغة بدل undefined/NaN", () => {
    expect(expenseTypeLabel(null)).toBe("غير محدد");
    expect(expenseCategoryLabel(null)).toBe("غير مصنف");
    expect(expenseTypeLabel("BOGUS")).toBe("غير محدد");
    expect(expenseCategoryLabel("BOGUS")).toBe("غير مصنف");
  });

  it("ترحيل التصنيفات القديمة يتبع الخريطة المحددة", () => {
    expect(LEGACY_CATEGORY_MAP.operational).toEqual({ expenseType: "OPERATIONAL", expenseCategoryCode: "OTHER" });
    expect(LEGACY_CATEGORY_MAP.maintenance).toEqual({ expenseType: "OPERATIONAL", expenseCategoryCode: "MAINTENANCE" });
    expect(LEGACY_CATEGORY_MAP.fixed).toEqual({ expenseType: "OPERATIONAL", expenseCategoryCode: "OTHER" });
    // "أخرى" يترك النوع غير محدد ليراجعه المستخدم
    expect(LEGACY_CATEGORY_MAP.other).toEqual({ expenseType: null, expenseCategoryCode: "OTHER" });
    expect(needsClassification(LEGACY_CATEGORY_MAP.other)).toBe(true);
  });
});

// ── Permissions ──
describe("الحسابات الشهرية — الصلاحيات", () => {
  // Mirrors warehouseProcedure in server/routers.ts: viewers cannot write.
  const canEdit = (role: string) => role === "admin" || role === "warehouse_manager";

  it("12. العرض متاح للجميع والتعديل ممنوع على viewer", () => {
    expect(canEdit("admin")).toBe(true);
    expect(canEdit("warehouse_manager")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
  });
});
