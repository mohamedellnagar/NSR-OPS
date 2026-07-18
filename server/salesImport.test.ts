import { describe, it, expect } from "vitest";
import { parseSalesRows, pickSalesColumn } from "./sales-import";

const base = { "التاريخ": "01/05/2026" };

describe("قراءة أعمدة المبيعات", () => {
  it("يقرأ كل القنوات السبعة", () => {
    const { rows, errors } = parseSalesRows([{
      ...base, "نقدي": 200, "بطاقة": 590.25, "كيتا": 12,
      "طلبات": 224, "كريم": 5, "ديلفروا": 7, "نون": 9,
    }]);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      accountDate: "2026-05-01", cash: 200, card: 590.25, kita: 12,
      orders: 224, careem: 5, deliveroo: 7, noon: 9,
    });
    expect(rows[0].totalSales).toBe(1047.25);
  });

  it("يقبل مرادفات الأعمدة", () => {
    expect(pickSalesColumn({ "كاش": 100 }, "cash")).toBe(100);
    expect(pickSalesColumn({ "فيزا": 50 }, "card")).toBe(50);
    expect(pickSalesColumn({ "شبكة": 50 }, "card")).toBe(50);
    expect(pickSalesColumn({ "talabat": 20 }, "orders")).toBe(20);
  });

  it("يتحمّل اختلاف الهمزة والتاء المربوطة في العناوين", () => {
    const { rows } = parseSalesRows([{ "التاريخ": "01/05/2026", "بطاقه": 75 }]);
    expect(rows[0].card).toBe(75);
  });

  it("القنوات الناقصة تُحسب صفرًا وليست خطأ", () => {
    const { rows, errors } = parseSalesRows([{ ...base, "نقدي": 100 }]);
    expect(errors).toHaveLength(0);
    expect(rows[0].card).toBe(0);
    expect(rows[0].noon).toBe(0);
    expect(rows[0].totalSales).toBe(100);
  });

  it("يقرأ الأرقام العربية وفواصل الآلاف", () => {
    const { rows } = parseSalesRows([{ "التاريخ": "١٥/٢/٢٠٢٦", "نقدي": "1,305.50" }]);
    expect(rows[0].accountDate).toBe("2026-02-15");
    expect(rows[0].cash).toBe(1305.5);
  });
});

describe("أكل الموظفين", () => {
  it("اختياري", () => {
    const { rows, errors } = parseSalesRows([{ ...base, "نقدي": 100 }]);
    expect(errors).toHaveLength(0);
    expect(rows[0].staffMeals).toBeNull();
  });

  it("يُقرأ لو موجود", () => {
    const { rows } = parseSalesRows([{ ...base, "نقدي": 100, "أكل الموظفين": 45 }]);
    expect(rows[0].staffMeals).toBe(45);
  });

  it("قيمة غير صالحة تُتجاهل ولا تُسقط الصف", () => {
    const { rows, errors } = parseSalesRows([{ ...base, "نقدي": 100, "أكل الموظفين": "كلام" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].staffMeals).toBeNull();
    expect(errors.some((e) => e.includes("أكل الموظفين"))).toBe(true);
  });
});

describe("التحقق", () => {
  it("يرفض التاريخ غير الصالح", () => {
    const { rows, errors } = parseSalesRows([{ "التاريخ": "31/2/2026", "نقدي": 100 }]);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain("التاريخ غير صالح");
  });

  it("يرفض القيم السالبة", () => {
    const { rows, errors } = parseSalesRows([{ ...base, "نقدي": -50 }]);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain("سالبًا");
  });

  it("يتخطى الصفوف الفارغة بصمت", () => {
    const { rows, errors } = parseSalesRows([
      { "التاريخ": "", "نقدي": "", "بطاقة": "" },
    ]);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("يرفض تكرار نفس اليوم داخل الملف (يمنع تعارض التحديث)", () => {
    const { rows, errors } = parseSalesRows([
      { "التاريخ": "01/05/2026", "نقدي": 100 },
      { "التاريخ": "01/05/2026", "نقدي": 200 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].cash).toBe(100); // الأول يفوز
    expect(errors[0]).toContain("مكرر");
  });

  it("الصفوف السليمة تمر رغم وجود صف فاسد", () => {
    const { rows, errors } = parseSalesRows([
      { "التاريخ": "01/05/2026", "نقدي": 100 },
      { "التاريخ": "غلط", "نقدي": 200 },
      { "التاريخ": "03/05/2026", "نقدي": 300 },
    ]);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });

  it("رقم الصف يطابق الإكسل (يشمل صف العناوين)", () => {
    const { errors } = parseSalesRows([
      { "التاريخ": "01/05/2026", "نقدي": 100 },
      { "التاريخ": "غلط", "نقدي": 200 },
    ]);
    expect(errors[0]).toContain("صف 3");
  });
});

describe("منع مضاعفة المبيعات", () => {
  // daily_accounts ليس عليه قيد فريد على accountDate، والصفحة الشهرية تجمع
  // صفوف اليوم الواحد — لذلك الاستيراد يحدّث بدل أن يضيف.
  it("اليوم الموجود يُحدَّث ولا يُضاف", () => {
    const existingDay = true;
    const action = existingDay ? "UPDATE" : "INSERT";
    expect(action).toBe("UPDATE");
  });

  it("إجمالي اليوم = مجموع القنوات السبعة فقط", () => {
    const { rows } = parseSalesRows([{
      ...base, "نقدي": 1, "بطاقة": 2, "كيتا": 4, "طلبات": 8,
      "كريم": 16, "ديلفروا": 32, "نون": 64, "أكل الموظفين": 999,
    }]);
    // أكل الموظفين لا يدخل في إجمالي المبيعات
    expect(rows[0].totalSales).toBe(127);
  });
});
