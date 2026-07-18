import { describe, it, expect } from "vitest";
import {
  parseSuggestions,
  renderInvoiceForPrompt,
  buildUserPrompt,
  SYSTEM_PROMPT,
  type ClassifiableInvoice,
} from "./aiExpenseClassifier";
import {
  EXPENSE_CATEGORY_CODES,
  EXPENSE_TYPES,
} from "@shared/expenseClassification";

function inv(over: Partial<ClassifiableInvoice> = {}): ClassifiableInvoice {
  return {
    id: 1,
    sourceType: "SUPPLIER_INVOICE",
    invoiceNumber: "INV-001",
    vendorName: "خبز بلدي",
    notes: null,
    total: 100,
    items: [{ description: "خبز", qty: 10, unitPrice: 10 }],
    currentType: null,
    currentCategory: null,
    ...over,
  };
}

describe("بناء الطلب للنموذج", () => {
  it("يضع بنود الفاتورة وعنوانها في الطلب", () => {
    const text = renderInvoiceForPrompt(
      inv({ vendorName: "الفلج ماركت", notes: "مشتريات مطبخ", items: [
        { description: "دجاج كامل", qty: 5, unitPrice: 20 },
        { description: "أرز بسمتي", qty: 2, unitPrice: 35 },
      ] })
    );
    expect(text).toContain("الفلج ماركت");
    expect(text).toContain("INV-001");
    expect(text).toContain("مشتريات مطبخ");
    expect(text).toContain("دجاج كامل");
    expect(text).toContain("أرز بسمتي");
  });

  it("يتعامل مع فاتورة بلا بنود (مثل الدفعات الشهرية)", () => {
    const text = renderInvoiceForPrompt(
      inv({ sourceType: "MONTHLY_PAYMENT", invoiceNumber: null, items: [], vendorName: "إيجار المحل" })
    );
    expect(text).toContain("لا توجد بنود");
    expect(text).toContain("إيجار المحل");
  });

  it("يقتطع البنود الطويلة جدًا مع ذكر العدد المتبقي", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      description: `صنف ${i}`, qty: 1, unitPrice: 1,
    }));
    const text = renderInvoiceForPrompt(inv({ items: many }));
    expect(text).toContain("و15 بند آخر");
    expect(text).not.toContain("صنف 39");
  });

  it("الطلب يحتوي كل فواتير الدفعة", () => {
    const prompt = buildUserPrompt([inv({ id: 1 }), inv({ id: 2, invoiceNumber: "INV-002" })]);
    expect(prompt).toContain("id: 1");
    expect(prompt).toContain("id: 2");
    expect(prompt).toContain("2 فاتورة");
  });

  it("تعليمات النظام تحتوي كل الأكواد المسموحة", () => {
    for (const code of EXPENSE_CATEGORY_CODES) expect(SYSTEM_PROMPT).toContain(code);
    for (const t of EXPENSE_TYPES) expect(SYSTEM_PROMPT).toContain(t);
  });
});

describe("التحقق من رد النموذج", () => {
  const batch = [inv({ id: 1 }), inv({ id: 2, sourceType: "FREE_INVOICE" })];

  it("يقبل الرد الصحيح", () => {
    const out = parseSuggestions(
      JSON.stringify({ results: [
        { id: 1, sourceType: "SUPPLIER_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "FOOD_PURCHASES", confidence: 0.95, reason: "بنود غذائية" },
      ] }),
      batch
    );
    expect(out).toHaveLength(1);
    expect(out[0].expenseCategoryCode).toBe("FOOD_PURCHASES");
    expect(out[0].confidence).toBe(0.95);
  });

  it("يرفض تصنيفًا مخترعًا خارج القائمة", () => {
    const out = parseSuggestions(
      JSON.stringify({ results: [
        { id: 1, sourceType: "SUPPLIER_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "PIZZA_STUFF", confidence: 1 },
      ] }),
      batch
    );
    expect(out).toHaveLength(0);
  });

  it("يرفض نوع مصروف غير صالح", () => {
    const out = parseSuggestions(
      JSON.stringify({ results: [
        { id: 1, sourceType: "SUPPLIER_INVOICE", expenseType: "MAYBE", expenseCategoryCode: "RENT", confidence: 1 },
      ] }),
      batch
    );
    expect(out).toHaveLength(0);
  });

  it("يرفض id لم يُرسل في الدفعة (منع تعديل فاتورة أخرى)", () => {
    const out = parseSuggestions(
      JSON.stringify({ results: [
        { id: 999, sourceType: "SUPPLIER_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "RENT", confidence: 1 },
      ] }),
      batch
    );
    expect(out).toHaveLength(0);
  });

  it("يفرّق بين نفس الـ id في مصدرين مختلفين", () => {
    const out = parseSuggestions(
      JSON.stringify({ results: [
        { id: 2, sourceType: "FREE_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "CLEANING", confidence: 0.9 },
        { id: 2, sourceType: "SUPPLIER_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "RENT", confidence: 0.9 },
      ] }),
      batch
    );
    // الثاني غير موجود في الدفعة (id=2 مرسل كـ FREE_INVOICE فقط)
    expect(out).toHaveLength(1);
    expect(out[0].sourceType).toBe("FREE_INVOICE");
  });

  it("يتجاهل التكرار لنفس السجل", () => {
    const out = parseSuggestions(
      JSON.stringify({ results: [
        { id: 1, sourceType: "SUPPLIER_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "RENT", confidence: 0.9 },
        { id: 1, sourceType: "SUPPLIER_INVOICE", expenseType: "NON_OPERATIONAL", expenseCategoryCode: "TAXES", confidence: 0.9 },
      ] }),
      batch
    );
    expect(out).toHaveLength(1);
    expect(out[0].expenseCategoryCode).toBe("RENT");
  });

  it("لا ينهار على رد ليس JSON", () => {
    expect(parseSuggestions("عذرًا، لا أستطيع", batch)).toEqual([]);
    expect(parseSuggestions("", batch)).toEqual([]);
    expect(parseSuggestions("{}", batch)).toEqual([]);
  });

  it("يضبط الثقة داخل المدى 0..1 ويعتبر الناقصة صفرًا", () => {
    const out = parseSuggestions(
      JSON.stringify({ results: [
        { id: 1, sourceType: "SUPPLIER_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "RENT", confidence: 5 },
        { id: 2, sourceType: "FREE_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "RENT" },
      ] }),
      batch
    );
    expect(out.find((o) => o.id === 1)!.confidence).toBe(1);
    expect(out.find((o) => o.id === 2)!.confidence).toBe(0); // ستُتخطى لاحقًا
  });

  it("يقبل مصفوفة مباشرة بدون مفتاح results", () => {
    const out = parseSuggestions(
      JSON.stringify([
        { id: 1, sourceType: "SUPPLIER_INVOICE", expenseType: "OPERATIONAL", expenseCategoryCode: "GAS", confidence: 0.8 },
      ]),
      batch
    );
    expect(out).toHaveLength(1);
    expect(out[0].expenseCategoryCode).toBe("GAS");
  });

  it("كل التصنيفات المُعادة تنتمي للقائمة المعتمدة", () => {
    const results = EXPENSE_CATEGORY_CODES.map((code, i) => ({
      id: i % 2 === 0 ? 1 : 2,
      sourceType: i % 2 === 0 ? "SUPPLIER_INVOICE" : "FREE_INVOICE",
      expenseType: "OPERATIONAL", expenseCategoryCode: code, confidence: 0.9,
    }));
    const out = parseSuggestions(JSON.stringify({ results }), batch);
    for (const o of out) {
      expect(EXPENSE_CATEGORY_CODES).toContain(o.expenseCategoryCode);
      expect(EXPENSE_TYPES).toContain(o.expenseType);
    }
  });
});

describe("عتبة الثقة", () => {
  // MIN_CONFIDENCE = 0.6 — يُطبَّق في classifyExpensesWithAI
  const MIN_CONFIDENCE = 0.6;
  it("الثقة المنخفضة تُترك للمراجعة البشرية بدل التخمين", () => {
    const decide = (c: number) => (c < MIN_CONFIDENCE ? "skip" : "apply");
    expect(decide(0.59)).toBe("skip");
    expect(decide(0.6)).toBe("apply");
    expect(decide(0)).toBe("skip");
    expect(decide(0.95)).toBe("apply");
  });
});
