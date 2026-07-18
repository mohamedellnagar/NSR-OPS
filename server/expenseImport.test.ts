import { describe, it, expect } from "vitest";
import {
  parseExpenseRows,
  parseSheetDate,
  parseAmount,
  toWesternDigits,
  pickColumn,
  toLegacyCategory,
  countLikelyDuplicates,
} from "./expense-import";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe("قراءة الأعمدة", () => {
  it("يقرأ الأعمدة العربية", () => {
    const row = { "التاريخ": "15/2/2026", "البيان": "أرز بسمتي", "المبلغ": 10.5 };
    expect(pickColumn(row, "date")).toBe("15/2/2026");
    expect(pickColumn(row, "description")).toBe("أرز بسمتي");
    expect(pickColumn(row, "amount")).toBe(10.5);
  });

  it("يتحمّل مسافات زائدة في العناوين", () => {
    expect(pickColumn({ "  التاريخ  ": "1/1/2026" }, "date")).toBe("1/1/2026");
  });

  it("يقبل العناوين الإنجليزية كذلك", () => {
    expect(pickColumn({ date: "1/1/2026", amount: 5 }, "date")).toBe("1/1/2026");
    expect(pickColumn({ amount: 5 }, "amount")).toBe(5);
  });

  it("يقبل مرادفات الفئة", () => {
    expect(pickColumn({ "التصنيف": "صيانة" }, "category")).toBe("صيانة");
    expect(pickColumn({ "الفئة": "صيانة" }, "category")).toBe("صيانة");
  });
});

describe("الأرقام العربية والفواصل", () => {
  it("يحوّل الأرقام العربية-الهندية", () => {
    expect(toWesternDigits("١٥/٢/٢٠٢٦")).toBe("15/2/2026");
    expect(toWesternDigits("١٣٠٥")).toBe("1305");
  });

  it("يقرأ المبالغ بفواصل الآلاف", () => {
    expect(parseAmount("1,305.00")).toBe(1305);
    expect(parseAmount("10.50")).toBe(10.5);
    expect(parseAmount(100)).toBe(100);
    expect(parseAmount("١٬٣٠٥")).toBe(1305);
  });

  it("يرفض المبالغ غير الصالحة", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe("قراءة التاريخ", () => {
  it("يقرأ صيغة يوم/شهر/سنة", () => {
    expect(iso(parseSheetDate("15/2/2026"))).toBe("2026-02-15");
    expect(iso(parseSheetDate("19/02/2026"))).toBe("2026-02-19");
    expect(iso(parseSheetDate("16/2/2025"))).toBe("2025-02-16");
  });

  it("يقرأ الأرقام العربية في التاريخ", () => {
    expect(iso(parseSheetDate("١٥/٢/٢٠٢٦"))).toBe("2026-02-15");
  });

  it("اليوم أولاً وليس الشهر (فرق جوهري)", () => {
    // 3/12/2026 = 3 ديسمبر وليس 12 مارس
    expect(iso(parseSheetDate("3/12/2026"))).toBe("2026-12-03");
  });

  it("يقبل كائن Date من الإكسل", () => {
    expect(iso(parseSheetDate(new Date(2026, 1, 15)))).toBe("2026-02-15");
  });

  it("يقبل الرقم التسلسلي للإكسل", () => {
    // 45000 ≈ 2023-03-15
    const d = parseSheetDate(45000);
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2023);
  });

  it("يقبل صيغة ISO", () => {
    expect(iso(parseSheetDate("2026-02-15"))).toBe("2026-02-15");
  });

  it("يرفض التواريخ المستحيلة بدل أن يزحلقها", () => {
    expect(parseSheetDate("31/2/2026")).toBeNull(); // فبراير ليس فيه 31
    expect(parseSheetDate("32/1/2026")).toBeNull();
    expect(parseSheetDate("15/13/2026")).toBeNull();
    expect(parseSheetDate("كلام")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
  });

  it("لا ينزلق يوم بسبب المنطقة الزمنية", () => {
    // منتصف ليل UTC — لو استُخدم التوقيت المحلي لرجع 14 فبراير
    const d = parseSheetDate("15/2/2026")!;
    expect(d.getUTCDate()).toBe(15);
    expect(d.getUTCMonth()).toBe(1);
  });
});

describe("تحويل النوع والفئة", () => {
  const base = { "التاريخ": "15/2/2026", "البيان": "بند", "المبلغ": 10 };

  it("يحوّل تشغيلي / غير تشغيلي", () => {
    const { rows } = parseExpenseRows([
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "مشتريات غذائية" },
      { ...base, "نوع المصروف": "غير تشغيلي", "الفئة": "صيانة" },
    ]);
    expect(rows[0].expenseType).toBe("OPERATIONAL");
    expect(rows[1].expenseType).toBe("NON_OPERATIONAL");
  });

  it("يحوّل الفئات العربية إلى أكواد", () => {
    const { rows } = parseExpenseRows([
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "مشتريات غذائية" },
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "صيانة" },
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "رواتب وأجور" },
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "فحم" },
    ]);
    expect(rows.map((r) => r.expenseCategoryCode)).toEqual([
      "FOOD_PURCHASES", "MAINTENANCE", "SALARIES", "CHARCOAL",
    ]);
  });

  it("يتحمّل اختلاف الهمزة والتاء المربوطة", () => {
    const { rows } = parseExpenseRows([
      { ...base, "نوع المصروف": "تشغيلى", "الفئة": "مشتريات غذائيه" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].expenseCategoryCode).toBe("FOOD_PURCHASES");
  });

  it("يقبل مرادفات شائعة", () => {
    const { rows } = parseExpenseRows([
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "صيانة ومعدات" },
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "كهرباء" },
    ]);
    expect(rows[0].expenseCategoryCode).toBe("MAINTENANCE");
    expect(rows[1].expenseCategoryCode).toBe("UTILITIES");
  });

  it("يرفض فئة غير معروفة برسالة واضحة", () => {
    const { rows, errors } = parseExpenseRows([
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "حاجة غريبة" },
    ]);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain("الفئة غير معروفة");
  });

  it("طريقة الدفع اختيارية ولا تُسقط الصف", () => {
    const { rows, errors } = parseExpenseRows([
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "صيانة" },
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "طريقة الدفع": "نقدي" },
      { ...base, "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "طريقة الدفع": "حمام زاجل" },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].paymentMethod).toBeNull();
    expect(rows[1].paymentMethod).toBe("CASH");
    expect(rows[2].paymentMethod).toBeNull();
    expect(errors.some((e) => e.includes("طريقة دفع غير معروفة"))).toBe(true);
  });
});

describe("التحقق من الصفوف", () => {
  it("يتخطى الصفوف الفارغة بصمت", () => {
    const { rows, errors } = parseExpenseRows([
      { "التاريخ": "", "البيان": "", "المبلغ": "", "نوع المصروف": "", "الفئة": "" },
    ]);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it("يرفض المبلغ صفر أو سالب", () => {
    const { rows, errors } = parseExpenseRows([
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "بند", "المبلغ": 0 },
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "بند", "المبلغ": -5 },
    ]);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("أكبر من صفر");
  });

  it("يطلب البيان", () => {
    const { errors } = parseExpenseRows([
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "", "المبلغ": 10 },
    ]);
    expect(errors[0]).toContain("البيان مطلوب");
  });

  it("رقم الصف في رسالة الخطأ يطابق الإكسل (يشمل صف العناوين)", () => {
    const { errors } = parseExpenseRows([
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "ok", "المبلغ": 10 },
      { "التاريخ": "غلط", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "bad", "المبلغ": 10 },
    ]);
    expect(errors[0]).toContain("صف 3"); // الصف الثاني في البيانات = صف 3 في الإكسل
  });

  it("الصفوف السليمة تمر حتى لو غيرها فاسد", () => {
    const { rows, errors } = parseExpenseRows([
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "مشتريات غذائية", "البيان": "أرز", "المبلغ": "10.50" },
      { "التاريخ": "غلط", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "خطأ", "المبلغ": 10 },
      { "التاريخ": "19/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "مشتريات غذائية", "البيان": "سمنة", "المبلغ": "1,305.00" },
    ]);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(rows[1].amount).toBe(1305);
  });
});

describe("الصف الحقيقي من ملف المستخدم", () => {
  it("يقرأ الصفوف الثلاثة من الصورة", () => {
    const { rows, errors } = parseExpenseRows([
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "مشتريات غذائية", "البيان": "أرز بسمتي", "طريقة الدفع": "", "المبلغ": "10.50" },
      { "التاريخ": "19/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "مشتريات غذائية", "البيان": "سمنة", "طريقة الدفع": "", "المبلغ": "1,305.00" },
      { "التاريخ": "16/2/2025", "نوع المصروف": "غير تشغيلي", "الفئة": "صيانة", "البيان": "اصلاح العجان", "طريقة الدفع": "", "المبلغ": "100.00" },
    ]);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(iso(rows[0].date)).toBe("2026-02-15");
    expect(rows[0].amount).toBe(10.5);
    expect(rows[1].amount).toBe(1305);
    expect(rows[2].expenseType).toBe("NON_OPERATIONAL");
    expect(rows[2].expenseCategoryCode).toBe("MAINTENANCE");
    expect(iso(rows[2].date)).toBe("2025-02-16"); // سنة مختلفة — تُقرأ كما هي
  });
});

describe("التصنيف القديم (يغذّي الحسابات اليومية)", () => {
  it("يربط التصنيف الجديد بالقديم بشكل متسق", () => {
    expect(toLegacyCategory("OPERATIONAL", "FOOD_PURCHASES")).toBe("operational");
    expect(toLegacyCategory("OPERATIONAL", "MAINTENANCE")).toBe("maintenance");
    expect(toLegacyCategory("OPERATIONAL", "EQUIPMENT_ASSETS")).toBe("maintenance");
    expect(toLegacyCategory("NON_OPERATIONAL", "TAXES")).toBe("other");
  });
});

describe("رصد المكرر (معلومة فقط)", () => {
  it("يعدّ الصفوف المتطابقة", () => {
    const { rows } = parseExpenseRows([
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "بند", "المبلغ": 10 },
      { "التاريخ": "15/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "بند", "المبلغ": 10 },
      { "التاريخ": "16/2/2026", "نوع المصروف": "تشغيلي", "الفئة": "صيانة", "البيان": "بند", "المبلغ": 10 },
    ]);
    expect(countLikelyDuplicates(rows)).toBe(1);
  });
});
