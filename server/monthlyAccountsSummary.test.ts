import { describe, it, expect } from "vitest";
import {
  calculateMonthlyAccountsSummary,
  verifyNetProfit,
  safePercentage,
  sumMoney,
  type SummaryInput,
} from "@shared/monthlyAccountsSummary";

/** Builds a valid input, overridable per test. */
function makeInput(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    year: 2026,
    month: 5,
    sales: { cash: 0, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
    staffMeals: 0,
    expenses: [],
    openingInventory: 0,
    closingInventory: 0,
    discounts: 0,
    ...over,
  };
}

const food = (total: number, type = "OPERATIONAL") => ({
  expenseType: type, expenseCategoryCode: "FOOD_PURCHASES", total,
});
const other = (total: number, type = "OPERATIONAL", code = "RENT") => ({
  expenseType: type, expenseCategoryCode: code, total,
});

// ═══════════════════════════════════════════════════════════════════════════
// السيناريو الإلزامي من المواصفات
// ═══════════════════════════════════════════════════════════════════════════
describe("السيناريو الإلزامي", () => {
  // مبيعات 100,000 | خصومات 2,000 | صافي 98,000
  // تشغيلية 40,000 منها طعام 30,000 | غير تشغيلية 5,000
  // مخزون أول 5,000 | مخزون آخر 7,000
  const summary = calculateMonthlyAccountsSummary(
    makeInput({
      sales: { cash: 100000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
      discounts: 2000,
      expenses: [food(30000), other(10000), other(5000, "NON_OPERATIONAL")],
      openingInventory: 5000,
      closingInventory: 7000,
    })
  );

  it("إجمالي المبيعات = 100,000", () => expect(summary.sales.totalSales).toBe(100000));
  it("الخصومات = 2,000", () => expect(summary.sales.totalDiscounts).toBe(2000));
  it("صافي المبيعات = 98,000", () => expect(summary.sales.netSales).toBe(98000));
  it("المصروفات التشغيلية المسجلة = 40,000", () =>
    expect(summary.recordedExpenses.operational).toBe(40000));
  it("المصروفات غير التشغيلية = 5,000", () =>
    expect(summary.recordedExpenses.nonOperational).toBe(5000));
  it("مشتريات الطعام = 30,000", () => expect(summary.inventory.foodPurchases).toBe(30000));

  it("تكلفة الطعام = 5,000 + 30,000 - 7,000 = 28,000", () =>
    expect(summary.inventory.foodCost).toBe(28000));

  it("باقي المصروفات التشغيلية = 40,000 - 30,000 = 10,000", () =>
    expect(summary.profits.operationalExcludingFood).toBe(10000));

  it("الربح قبل تسوية المخزون = 98,000 - 40,000 - 5,000 = 53,000", () =>
    expect(summary.profits.profitBeforeInventory).toBe(53000));

  it("صافي الربح بعد التسوية = 98,000 - 28,000 - 10,000 - 5,000 = 55,000", () =>
    expect(summary.profits.netProfitAfterInventory).toBe(55000));

  it("التحقق البديل: 53,000 + 30,000 - 28,000 = 55,000", () =>
    expect(verifyNetProfit(summary)).toBe(55000));

  it("المعادلتان متطابقتان (منع خصم الطعام مرتين)", () =>
    expect(summary.profits.netProfitAfterInventory).toBe(verifyNetProfit(summary)));
});

// ═══════════════════════════════════════════════════════════════════════════
describe("المعادلات المطلوبة", () => {
  it("1. إجمالي المبيعات = مجموع القنوات السبعة", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: { cash: 1, card: 2, kita: 4, orders: 8, careem: 16, deliveroo: 32, noon: 64 } })
    );
    expect(s.sales.totalSales).toBe(127);
  });

  it("2. صافي المبيعات = الإجمالي - الخصومات", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: { cash: 500, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 }, discounts: 120 })
    );
    expect(s.sales.netSales).toBe(380);
  });

  it("3. إجمالي المصروفات المسجلة = التشغيلية + غير التشغيلية", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ expenses: [other(300), other(200, "NON_OPERATIONAL")] })
    );
    expect(s.recordedExpenses.totalRecorded).toBe(500);
  });

  it("5. مشتريات الطعام تعتمد على التصنيف لا على المورد", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ expenses: [food(100), food(50, "NON_OPERATIONAL"), other(999)] })
    );
    // تُجمع بغض النظر عن النوع
    expect(s.inventory.foodPurchases).toBe(150);
    expect(s.warnings.nonOperationalFoodPurchasesCount).toBe(1);
  });

  it("7. نسبة تكلفة الطعام بمنزلتين عشريتين", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({
        sales: { cash: 1000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
        expenses: [food(333)],
      })
    );
    expect(s.inventory.foodCost).toBe(333);
    expect(s.inventory.foodCostPercentage).toBe(33.3);
  });

  it("8. استبعاد مشتريات الطعام من باقي المصروفات", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ expenses: [food(700), other(300), food(100, "NON_OPERATIONAL"), other(200, "NON_OPERATIONAL")] })
    );
    expect(s.profits.operationalExcludingFood).toBe(300);
    expect(s.profits.nonOperationalExcludingFood).toBe(200);
  });

  it("11. هامش صافي الربح", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({
        sales: { cash: 1000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
        expenses: [other(250)],
      })
    );
    expect(s.profits.netProfitAfterInventory).toBe(750);
    expect(s.profits.netProfitMargin).toBe(75);
  });

  it("16. إجمالي المصروفات بعد التسوية لا يستخدم مشتريات الطعام مرة أخرى", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({
        expenses: [food(30000), other(10000), other(5000, "NON_OPERATIONAL")],
        openingInventory: 5000, closingInventory: 7000,
      })
    );
    // 28,000 + 10,000 + 5,000
    expect(s.profits.adjustedTotalExpenses).toBe(43000);
    // لو حُسبت المشتريات مرتين لكان الرقم 73,000
    expect(s.profits.adjustedTotalExpenses).not.toBe(73000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("القسمة على صفر والقيم الحدية", () => {
  it("12. لا NaN ولا Infinity عند صفر مبيعات", () => {
    const s = calculateMonthlyAccountsSummary(makeInput({ expenses: [other(500)] }));
    expect(s.sales.netSales).toBe(0);
    expect(s.inventory.foodCostPercentage).toBe(0);
    expect(s.profits.netProfitMargin).toBe(0);
    expect(s.staffMeals.percentage).toBe(0);
    for (const v of [s.inventory.foodCostPercentage, s.profits.netProfitMargin, s.staffMeals.percentage]) {
      expect(Number.isNaN(v)).toBe(false);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("safePercentage محصّنة", () => {
    expect(safePercentage(5, 0)).toBe(0);
    expect(safePercentage(5, -10)).toBe(0);
    expect(safePercentage(0, 0)).toBe(0);
    expect(safePercentage(50, 200)).toBe(25);
  });

  it("الخصومات الأكبر من المبيعات لا تنتج صافي سالب ويظهر تحذير", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: { cash: 100, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 }, discounts: 500 })
    );
    expect(s.sales.netSales).toBe(0);
    expect(s.warnings.discountsExceedSales).toBe(true);
  });

  it("تحذيرات المخزون غير المنطقي", () => {
    const neg = calculateMonthlyAccountsSummary(makeInput({ openingInventory: -5 }));
    expect(neg.warnings.negativeOpeningInventory).toBe(true);
    expect(neg.warnings.hasInvalidInventory).toBe(true);

    const tooHigh = calculateMonthlyAccountsSummary(
      makeInput({ expenses: [food(100)], openingInventory: 10, closingInventory: 5000 })
    );
    expect(tooHigh.warnings.closingInventoryTooHigh).toBe(true);
    expect(tooHigh.warnings.negativeFoodCost).toBe(true);
  });

  it("sumMoney لا يراكم خطأ العشرية العائمة", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("المصروفات غير المصنفة", () => {
  const s = calculateMonthlyAccountsSummary(
    makeInput({
      sales: { cash: 1000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
      expenses: [
        other(200),
        { expenseType: null, expenseCategoryCode: null, total: 350 },
        { expenseType: null, expenseCategoryCode: "FOOD_PURCHASES", total: 90 },
      ],
    })
  );

  it("14. لا تدخل في التشغيلية ولا غير التشغيلية ولا الربح", () => {
    expect(s.recordedExpenses.operational).toBe(200);
    expect(s.recordedExpenses.nonOperational).toBe(0);
    expect(s.recordedExpenses.totalRecorded).toBe(200);
    expect(s.profits.netProfitAfterInventory).toBe(800);
  });

  it("تظهر في بند مستقل مع تحذير", () => {
    expect(s.recordedExpenses.unclassified).toBe(440);
    expect(s.warnings.unclassifiedInvoicesCount).toBe(2);
    expect(s.warnings.unclassifiedInvoicesAmount).toBe(440);
  });

  it("مشترياتها الغذائية لا تدخل في مشتريات الطعام", () => {
    // 90 غير مصنفة النوع → مستبعدة تمامًا حتى يصنفها المستخدم
    expect(s.inventory.foodPurchases).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("أكل الموظفين", () => {
  it("13. مؤشر تحليلي فقط — لا يُخصم من الربح", () => {
    const withMeals = calculateMonthlyAccountsSummary(
      makeInput({
        sales: { cash: 2000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
        expenses: [other(500)], staffMeals: 300,
      })
    );
    const withoutMeals = calculateMonthlyAccountsSummary(
      makeInput({
        sales: { cash: 2000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
        expenses: [other(500)], staffMeals: 0,
      })
    );
    // نفس الربح تمامًا
    expect(withMeals.profits.netProfitAfterInventory).toBe(withoutMeals.profits.netProfitAfterInventory);
    expect(withMeals.staffMeals.total).toBe(300);
    expect(withMeals.staffMeals.percentage).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("قواعد مصدر البيانات", () => {
  it("15. يستخدم إجمالي الفاتورة وليس المدفوع", () => {
    // فاتورة بإجمالي 1000 لم يُدفع منها إلا 100 — الملخص يعتمد الإجمالي
    const s = calculateMonthlyAccountsSummary(
      makeInput({
        sales: { cash: 5000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
        expenses: [{ expenseType: "OPERATIONAL", expenseCategoryCode: "RENT", total: 1000 }],
      })
    );
    expect(s.recordedExpenses.operational).toBe(1000);
    expect(s.profits.netProfitAfterInventory).toBe(4000); // 5000 - 1000، لا 5000 - 100
  });

  it("16/17. الملخص يعمل على ما يُمرَّر إليه فقط (الفلترة بالشهر تتم في طبقة البيانات)", () => {
    // نمرر مصروفات شهر واحد فقط؛ الدالة نقية ولا تعرف عن التواريخ شيئًا،
    // وهو ما يجعل فلترة الشهر/السنة مسؤولية getMonthlyAccounts وحدها.
    const s = calculateMonthlyAccountsSummary(
      makeInput({ year: 2026, month: 5, expenses: [other(100)] })
    );
    expect(s.year).toBe(2026);
    expect(s.month).toBe(5);
    expect(s.recordedExpenses.totalRecorded).toBe(100);
  });

  it("الفلاتر لا تغيّر الملخص — الملخص يُحسب من كل مصروفات الشهر", () => {
    const all = [other(100), other(200, "NON_OPERATIONAL"), food(300)];
    const full = calculateMonthlyAccountsSummary(makeInput({ expenses: all }));
    // لو مُرِّر subset (كما لو طُبِّق فلتر) لاختلفت النتيجة — لذلك تمرَّر القائمة كاملة
    const subset = calculateMonthlyAccountsSummary(makeInput({ expenses: [all[0]] }));
    expect(full.recordedExpenses.totalRecorded).toBe(600);
    expect(subset.recordedExpenses.totalRecorded).toBe(100);
    expect(full.recordedExpenses.totalRecorded).not.toBe(subset.recordedExpenses.totalRecorded);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("عدم خصم مشتريات الطعام مرتين — عبر حالات متعددة", () => {
  const cases = [
    { name: "مخزون متساوٍ", opening: 5000, closing: 5000, foodBuy: 30000 },
    { name: "مخزون آخر أكبر", opening: 1000, closing: 9000, foodBuy: 30000 },
    { name: "بدون مخزون", opening: 0, closing: 0, foodBuy: 12345.678 },
    { name: "بدون مشتريات طعام", opening: 500, closing: 200, foodBuy: 0 },
    { name: "كسور عشرية", opening: 1234.567, closing: 987.654, foodBuy: 4321.123 },
  ];

  for (const c of cases) {
    it(`المعادلتان متطابقتان — ${c.name}`, () => {
      const s = calculateMonthlyAccountsSummary(
        makeInput({
          sales: { cash: 98000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 },
          expenses: [food(c.foodBuy), other(10000), other(5000, "NON_OPERATIONAL")],
          openingInventory: c.opening,
          closingInventory: c.closing,
        })
      );
      expect(s.profits.netProfitAfterInventory).toBe(verifyNetProfit(s));
      // وإجمالي المصروفات بعد التسوية متسق مع الربح
      expect(s.profits.netProfitAfterInventory).toBe(
        Math.round((s.sales.netSales - s.profits.adjustedTotalExpenses) * 1000) / 1000
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe("قواعد محاسبة المطاعم", () => {
  const sales1000 = { cash: 1000, card: 0, kita: 0, orders: 0, careem: 0, deliveroo: 0, noon: 0 };
  const cat = (code: string, total: number, type = "OPERATIONAL") =>
    ({ expenseType: type, expenseCategoryCode: code, total });

  it("الملحمة تدخل في تكلفة الطعام (اللحمة أكل)", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("FOOD_PURCHASES", 200), cat("BUTCHERY", 100)] })
    );
    expect(s.inventory.foodPurchases).toBe(300);
    // ولا تُحسب مرتين في باقي التشغيلية
    expect(s.profits.operationalExcludingFood).toBe(0);
  });

  it("الفحم والغاز ليست تكلفة طعام (طاقة وليست بضاعة)", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("CHARCOAL", 100), cat("GAS", 50)] })
    );
    expect(s.inventory.foodPurchases).toBe(0);
    expect(s.profits.operationalExcludingFood).toBe(150);
  });

  it("سحب المالك لا يُخصم من الربح — توزيع وليس مصروف", () => {
    const withDraw = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("RENT", 200), cat("OWNER_DRAW", 500)] })
    );
    const withoutDraw = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("RENT", 200)] })
    );
    expect(withDraw.profits.netProfitAfterInventory)
      .toBe(withoutDraw.profits.netProfitAfterInventory);
    expect(withDraw.profits.netProfitAfterInventory).toBe(800);
    // لكن المبلغ يظهر في بند مستقل
    expect(withDraw.recordedExpenses.excludedFromPL).toBe(500);
  });

  it("شراء المعدات لا يُحمّل على شهر واحد — مصروف رأسمالي", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("EQUIPMENT_ASSETS", 3000)] })
    );
    expect(s.profits.netProfitAfterInventory).toBe(1000); // لم يتأثر
    expect(s.recordedExpenses.excludedFromPL).toBe(3000);
  });

  it("الاستبعاد يسري حتى لو صُنّف تشغيليًا بالخطأ", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("OWNER_DRAW", 400, "OPERATIONAL")] })
    );
    expect(s.recordedExpenses.operational).toBe(0);
    expect(s.recordedExpenses.excludedFromPL).toBe(400);
  });

  it("Prime Cost = تكلفة الطعام + العمالة", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({
        sales: sales1000,
        expenses: [cat("FOOD_PURCHASES", 300), cat("SALARIES", 250)],
        openingInventory: 0, closingInventory: 0,
      })
    );
    expect(s.inventory.foodCost).toBe(300);
    expect(s.keyMetrics.labourCost).toBe(250);
    expect(s.keyMetrics.primeCost).toBe(550);
    expect(s.keyMetrics.primeCostPercentage).toBe(55);
    expect(s.keyMetrics.labourCostPercentage).toBe(25);
  });

  it("Prime Cost مؤشر تحليلي فقط — لا يُخصم مرتين", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("FOOD_PURCHASES", 300), cat("SALARIES", 250)] })
    );
    // 1000 - 300 (طعام) - 250 (عمالة ضمن باقي التشغيلية)
    expect(s.profits.netProfitAfterInventory).toBe(450);
    // ولا تزال المعادلتان متطابقتين
    expect(s.profits.netProfitAfterInventory).toBe(verifyNetProfit(s));
  });

  it("ينبّه على الدفعة الكبيرة التي تشوّه الشهر", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({ sales: sales1000, expenses: [cat("RENT", 700), cat("GAS", 50)] })
    );
    expect(s.warnings.largeExpenses).toHaveLength(1);
    expect(s.warnings.largeExpenses[0]).toMatchObject({ label: "RENT", amount: 700, shareOfSales: 70 });
  });

  it("لا تنبيهات عند صفر مبيعات (تجنّب القسمة على صفر)", () => {
    const s = calculateMonthlyAccountsSummary(makeInput({ expenses: [cat("RENT", 700)] }));
    expect(s.warnings.largeExpenses).toEqual([]);
  });

  it("المعادلتان تظلان متطابقتين مع البنود المستبعدة", () => {
    const s = calculateMonthlyAccountsSummary(
      makeInput({
        sales: sales1000,
        expenses: [cat("FOOD_PURCHASES", 300), cat("BUTCHERY", 100), cat("SALARIES", 200),
                   cat("OWNER_DRAW", 500), cat("EQUIPMENT_ASSETS", 900),
                   cat("TAXES", 50, "NON_OPERATIONAL")],
        openingInventory: 120, closingInventory: 80,
      })
    );
    expect(s.profits.netProfitAfterInventory).toBe(verifyNetProfit(s));
    expect(s.recordedExpenses.excludedFromPL).toBe(1400);
  });
});
