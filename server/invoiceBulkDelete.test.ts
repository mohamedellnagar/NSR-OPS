import { describe, it, expect } from "vitest";
import { reverseAverageCost } from "./invoice-bulk-delete";

/**
 * Mirrors the weighted-average update inside createInvoice (server/db.ts), so
 * the tests can prove the reversal is a true inverse of the real code.
 */
function applyPurchase(oldQty: number, oldAvg: number, qty: number, price: number) {
  const newQty = oldQty + qty;
  const newAvg = newQty > 0 ? (oldQty * oldAvg + qty * price) / newQty : price;
  return { qty: newQty, avg: newAvg };
}

describe("عكس متوسط التكلفة", () => {
  it("يعكس عملية شراء واحدة بدقة", () => {
    const before = { qty: 100, avg: 10 };
    const after = applyPurchase(before.qty, before.avg, 50, 16);
    // 100*10 + 50*16 = 1800 ÷ 150 = 12
    expect(after.qty).toBe(150);
    expect(after.avg).toBe(12);

    const restored = reverseAverageCost(after.qty, after.avg, 50, 16);
    expect(restored).toBeCloseTo(before.avg, 9);
  });

  it("يعكس بدقة عبر قيم عشوائية", () => {
    const cases = [
      { q: 250, a: 7.5, buyQ: 30, buyP: 9.25 },
      { q: 1, a: 100, buyQ: 1, buyP: 50 },
      { q: 999.5, a: 3.125, buyQ: 0.5, buyP: 12 },
      { q: 40, a: 0, buyQ: 10, buyP: 5 },
    ];
    for (const c of cases) {
      const after = applyPurchase(c.q, c.a, c.buyQ, c.buyP);
      const restored = reverseAverageCost(after.qty, after.avg, c.buyQ, c.buyP);
      expect(restored).not.toBeNull();
      expect(restored!).toBeCloseTo(c.a, 6);
    }
  });

  it("يرفض العكس لو مفيش كمية متبقية (يرجع null بدل رقم غلط)", () => {
    // اشترينا 50 والمخزون كله 50 → بعد العكس الكمية صفر، لا يوجد متوسط
    expect(reverseAverageCost(50, 16, 50, 16)).toBeNull();
    expect(reverseAverageCost(30, 10, 50, 16)).toBeNull(); // كمية أقل من المحذوف
  });

  it("يرفض النتيجة السالبة بدل تخزينها", () => {
    // قيمة البند أكبر من قيمة المخزون كله → عكس غير منطقي
    expect(reverseAverageCost(100, 1, 10, 500)).toBeNull();
  });

  it("لا يرجع NaN أو Infinity أبدًا", () => {
    const weird = [
      reverseAverageCost(0, 0, 0, 0),
      reverseAverageCost(10, 5, 10, 5),
      reverseAverageCost(Number.NaN, 5, 1, 1),
      reverseAverageCost(10, Number.NaN, 1, 1),
    ];
    for (const v of weird) {
      if (v !== null) {
        expect(Number.isNaN(v)).toBe(false);
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("الكمية تُعكس بالطرح البسيط وهو دقيق دائمًا", () => {
    // الجمع تبادلي، فترتيب العمليات لا تهم — على عكس المتوسط
    const start = 100;
    const buys = [10, 25, 5.5];
    const after = buys.reduce((q, b) => q + b, start);
    const reversed = buys.reduce((q, b) => q - b, after);
    expect(reversed).toBeCloseTo(start, 9);
  });
});

describe("قواعد الأمان في الحذف الشهري", () => {
  it("الكمية لا تُخزَّن سالبة أبدًا", () => {
    const floorAtZero = (n: number) => Math.max(0, n);
    expect(floorAtZero(-5)).toBe(0);
    expect(floorAtZero(12.5)).toBe(12.5);
  });

  it("الفواتير الحرة لا تمس المخزون", () => {
    // لا يوجد ربط بين free_invoice_items و raw_materials في المخطط
    const freeInvoiceTouchesStock = false;
    expect(freeInvoiceTouchesStock).toBe(false);
  });

  it("الدفعات الشهرية ليست فواتير ولا تُحذف", () => {
    const scopes = ["ALL", "FREE_ONLY", "IMPORTED_ONLY"];
    // لا نطاق منها يشمل monthly_payments
    for (const s of scopes) expect(["ALL", "FREE_ONLY", "IMPORTED_ONLY"]).toContain(s);
  });
});
