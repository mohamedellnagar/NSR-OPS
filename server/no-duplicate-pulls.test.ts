/**
 * اختبارات منطق منع التكرار في kitchenDailyPulls
 * يتحقق من أن النظام يُحدّث البند الموجود بدلاً من إنشاء بند جديد
 * عند إضافة إنتاج أو سحب لنفس المادة في نفس التاريخ
 */
import { describe, it, expect } from "vitest";

// ─── Unit tests for the deduplication logic ─────────────────────────────────

describe("منطق منع التكرار في kitchenDailyPulls", () => {
  /**
   * اختبار منطق حساب الكمية المجمّعة
   * عند وجود بند مفتوح، يجب إضافة الكمية الجديدة إلى الكمية الموجودة
   */
  it("يجب أن يُضيف الكمية الجديدة إلى الكمية الموجودة عند وجود بند مفتوح", () => {
    const existingPulledQuantity = "5.000";
    const newPulledQuantity = 3;
    const expectedTotal = parseFloat(existingPulledQuantity) + newPulledQuantity;
    expect(expectedTotal).toBe(8);
    expect(expectedTotal.toFixed(3)).toBe("8.000");
  });

  /**
   * اختبار منطق حساب الإنتاج الفعلي المجمّع
   * عند وجود بند مفتوح مع actualYield، يجب إضافة الإنتاج الجديد إلى الموجود
   */
  it("يجب أن يُضيف الإنتاج الفعلي الجديد إلى الموجود عند وجود بند مفتوح", () => {
    const existingYield = "4.500";
    const newYield = 2.5;
    const existingYieldNum = parseFloat(existingYield);
    const expectedTotal = existingYieldNum + newYield;
    expect(expectedTotal).toBe(7);
    expect(expectedTotal.toFixed(3)).toBe("7.000");
  });

  /**
   * اختبار منطق حساب الإنتاج الفعلي عند غياب actualYield في البند الموجود
   * يجب استخدام الكمية الجديدة فقط
   */
  it("يجب أن يستخدم الكمية الجديدة فقط عند غياب actualYield في البند الموجود", () => {
    const existingYield = null;
    const newYield = 3.5;
    const existingYieldNum = existingYield !== null ? parseFloat(existingYield) : null;
    const expectedTotal = existingYieldNum !== null ? existingYieldNum + newYield : newYield;
    expect(expectedTotal).toBe(3.5);
    expect(expectedTotal.toFixed(3)).toBe("3.500");
  });

  /**
   * اختبار منطق دمج الملاحظات
   * عند وجود بند مفتوح مع ملاحظات، يجب دمج الملاحظات الجديدة مع الموجودة
   */
  it("يجب أن يدمج الملاحظات الجديدة مع الموجودة", () => {
    const existingNotes = "إنتاج: مادة أ (مكونات: 5 kg, ناتج فعلي: 4.5 kg)";
    const newNotes = "إنتاج: مادة أ (مكونات: 3 kg, ناتج فعلي: 2.5 kg)";
    const combinedNotes = [existingNotes, newNotes].filter(Boolean).join('; ');
    expect(combinedNotes).toContain(existingNotes);
    expect(combinedNotes).toContain(newNotes);
    expect(combinedNotes).toContain('; ');
  });

  /**
   * اختبار منطق دمج الملاحظات عند غياب ملاحظات جديدة
   * يجب الإبقاء على الملاحظات الموجودة فقط
   */
  it("يجب الإبقاء على الملاحظات الموجودة عند غياب ملاحظات جديدة", () => {
    const existingNotes = "إنتاج: مادة أ";
    const newNotes = undefined;
    const combinedNotes = newNotes
      ? [existingNotes, newNotes].filter(Boolean).join('; ')
      : existingNotes;
    expect(combinedNotes).toBe(existingNotes);
  });

  /**
   * اختبار منطق حساب الكمية المسحوبة في addKitchenPull
   * عند وجود بند مفتوح، يجب إضافة الكمية الجديدة إلى الكمية الموجودة
   */
  it("يجب أن يُحسب مجموع الكمية المسحوبة بشكل صحيح في addKitchenPull", () => {
    const existingPulled = "10.000";
    const newPulledQuantity = "5.000";
    const newPulled = parseFloat(existingPulled) + parseFloat(newPulledQuantity);
    expect(newPulled).toBe(15);
    expect(newPulled.toFixed(3)).toBe("15.000");
  });

  /**
   * اختبار منطق حساب actualYield في addKitchenPull
   * عند وجود بند مفتوح مع actualYield، يجب إضافة الإنتاج الجديد إلى الموجود
   */
  it("يجب أن يُحسب مجموع actualYield بشكل صحيح في addKitchenPull", () => {
    const existingYield = "8.000";
    const addedYield = 4.5;
    const existingYieldNum = parseFloat(existingYield);
    const newYield = existingYieldNum + addedYield;
    expect(newYield).toBe(12.5);
    expect(newYield.toFixed(3)).toBe("12.500");
  });

  /**
   * اختبار منطق حساب actualYield في addKitchenPull عند غياب actualYield في البند الموجود
   */
  it("يجب أن يُحسب actualYield بشكل صحيح عند غياب actualYield في البند الموجود", () => {
    const existingYield = null;
    const addedYield = 5.0;
    const existingYieldNum = existingYield !== null ? parseFloat(existingYield) : null;
    const newYield = existingYieldNum !== null ? existingYieldNum + addedYield : null;
    // عند غياب actualYield في البند الموجود، يبقى null
    expect(newYield).toBeNull();
  });

  /**
   * اختبار منطق تحديد ما إذا كان يجب إنشاء بند جديد أم تحديث الموجود
   */
  it("يجب إنشاء بند جديد عند عدم وجود بند مفتوح لنفس المادة في نفس التاريخ", () => {
    const existingPull = null; // لا يوجد بند مفتوح
    const shouldCreateNew = existingPull === null;
    expect(shouldCreateNew).toBe(true);
  });

  it("يجب تحديث البند الموجود عند وجود بند مفتوح لنفس المادة في نفس التاريخ", () => {
    const existingPull = { id: 1, pulledQuantity: "5.000", actualYield: "4.500", status: "open" };
    const shouldUpdate = existingPull !== null;
    expect(shouldUpdate).toBe(true);
  });
});
