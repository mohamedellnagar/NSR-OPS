/**
 * Slicing an invoice across the months it covers.
 *
 * The rule under test: N instalments must add back to the invoice EXACTLY, for
 * any amount and any N. Anything else quietly creates or destroys money across
 * the year, which is worse than not spreading at all.
 */
import { describe, it, expect } from "vitest";

const money = (n: number) => Math.round(n * 1000) / 1000;

/** Mirrors the allocation in monthly-accounts-db.ts mapInvoice. */
function slice(total: number, spread: number, offset: number): number {
  if (spread === 1) return total;
  return offset === spread - 1
    ? money(total - money(total / spread) * (spread - 1))
    : money(total / spread);
}

const instalments = (total: number, spread: number) =>
  Array.from({ length: spread }, (_, i) => slice(total, spread, i));

describe("توزيع الفاتورة على شهورها", () => {
  it("شهر واحد = المبلغ كاملًا في شهره", () => {
    expect(slice(1000, 1, 0)).toBe(1000);
  });

  it("قسمة مستوية", () => {
    expect(instalments(3000, 3)).toEqual([1000, 1000, 1000]);
  });

  it("القسط الأخير يبتلع الكسر", () => {
    const parts = instalments(10000, 3);
    expect(parts[0]).toBe(3333.333);
    expect(parts[2]).toBe(3333.334);
  });

  it("★ الأقساط تساوي الفاتورة بالضبط — لأي مبلغ وأي عدد شهور", () => {
    const amounts = [10000, 999.99, 1, 0.003, 12345.678, 7, 250.5, 33333.333];
    const spreads = [1, 2, 3, 6, 7, 12, 24, 36, 60];
    for (const total of amounts) {
      for (const spread of spreads) {
        const sum = money(instalments(total, spread).reduce((a, b) => a + b, 0));
        expect(sum, `${total} على ${spread} شهر`).toBe(money(total));
      }
    }
  });

  it("لا ينتج قسطًا سالبًا", () => {
    for (const spread of [2, 3, 12, 60]) {
      for (const part of instalments(0.001, spread)) {
        expect(part).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("مبلغ صفر يعطي أقساطًا صفرية", () => {
    expect(instalments(0, 12).every((p) => p === 0)).toBe(true);
  });
});
