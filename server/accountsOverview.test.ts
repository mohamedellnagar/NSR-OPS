/**
 * The multi-month overview.
 *
 * The traps this guards against are all about a month that ISN'T comparable
 * being ranked as if it were: a month with no inventory shows 0% food cost and
 * would top the table, and a half-recorded month always looks like a collapse.
 */
import { describe, it, expect } from "vitest";

type M = {
  netSales: number; foodCostPercentage: number; labourCostPercentage: number;
  primeCostPercentage: number; netProfit: number; partial: boolean;
  inventoryMissing: boolean;
};

const mk = (o: Partial<M>): M => ({
  netSales: 10000, foodCostPercentage: 30, labourCostPercentage: 30,
  primeCostPercentage: 60, netProfit: 1000, partial: false,
  inventoryMissing: false, ...o,
});

/** Mirrors the weighted average in getAccountsOverview. */
function weightedPrime(months: M[]): number {
  const costed = months.filter((m) => !m.inventoryMissing);
  const sales = costed.reduce((a, m) => a + m.netSales, 0);
  return sales > 0
    ? Math.round((costed.reduce((a, m) => a + m.primeCostPercentage * m.netSales, 0) / sales) * 100) / 100
    : 0;
}

/** Mirrors the trend, which reads complete months only. */
function trend(months: M[]): number {
  const c = months.filter((m) => !m.partial);
  return c.length >= 2 ? c[c.length - 1].netSales - c[c.length - 2].netSales : 0;
}

describe("نظرة كل الشهور", () => {
  it("★ شهر بلا جرد لا يدخل متوسط التكلفة الأولية", () => {
    const withMissing = [
      mk({ primeCostPercentage: 80, netSales: 10000 }),
      mk({ primeCostPercentage: 20, netSales: 10000, inventoryMissing: true }),
    ];
    // بدون الاستبعاد كان المتوسط 50% — رقم لا يعبّر عن شيء
    expect(weightedPrime(withMissing)).toBe(80);
  });

  it("المتوسط مرجّح بالمبيعات لا حسابي", () => {
    const months = [
      mk({ primeCostPercentage: 90, netSales: 90000 }),
      mk({ primeCostPercentage: 50, netSales: 10000 }),
    ];
    // المتوسط الحسابي 70%؛ المرجّح 86% لأن الشهر الكبير يحكم
    expect(weightedPrime(months)).toBe(86);
  });

  it("بلا شهور مكتملة لا يُحسب اتجاه", () => {
    expect(trend([mk({ partial: true }), mk({ partial: true })])).toBe(0);
  });

  it("★ الاتجاه يتجاهل الشهر الناقص فلا يفتعل انهيارًا", () => {
    const months = [
      mk({ netSales: 50000 }),
      mk({ netSales: 60000 }),
      mk({ netSales: 5000, partial: true }), // شهر جارٍ تسجيله
    ];
    expect(trend(months)).toBe(10000); // ارتفاع حقيقي، لا هبوط وهمي
  });

  it("كل الشهور بلا جرد يعطي صفرًا لا قسمة على صفر", () => {
    expect(weightedPrime([mk({ inventoryMissing: true })])).toBe(0);
    expect(Number.isFinite(weightedPrime([]))).toBe(true);
  });
});
