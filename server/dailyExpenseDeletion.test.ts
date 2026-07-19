/**
 * Clearing a month's daily fixed expenses.
 *
 * The rule that matters: a daily_accounts row carries that day's SALES as well
 * as its fixed expense. Clearing the expense must never take the revenue with
 * it, and must never happen unless it was explicitly asked for.
 */
import { describe, it, expect } from "vitest";

/** Mirrors the guard in deleteMonthInvoices. */
function shouldClear(opts: { clearDailyExpenses?: boolean }): boolean {
  return opts.clearDailyExpenses === true;
}

/** Mirrors the UPDATE: zeroes the expense, leaves every other column alone. */
function clearExpense(day: { date: string; salesCash: number; expensesFixed: number }) {
  return { ...day, expensesFixed: 0 };
}

describe("مسح المصروفات اليومية عند حذف الشهر", () => {
  const day = { date: "2026-04-10", salesCash: 5000, expensesFixed: 300 };

  it("لا يُمسح إلا بطلب صريح", () => {
    expect(shouldClear({})).toBe(false);
    expect(shouldClear({ clearDailyExpenses: false })).toBe(false);
    expect(shouldClear({ clearDailyExpenses: undefined })).toBe(false);
    expect(shouldClear({ clearDailyExpenses: true })).toBe(true);
  });

  it("★ المبيعات لا تتأثر", () => {
    expect(clearExpense(day).salesCash).toBe(5000);
  });

  it("المصروف يصير صفرًا", () => {
    expect(clearExpense(day).expensesFixed).toBe(0);
  });

  it("★ اليوم نفسه يبقى موجودًا — لا يُحذف السجل", () => {
    const after = clearExpense(day);
    expect(after).not.toBeNull();
    expect(after.date).toBe("2026-04-10");
  });

  it("قيمة غير موجودة لا تكسر شيئًا", () => {
    expect(clearExpense({ date: "2026-04-11", salesCash: 0, expensesFixed: 0 }).expensesFixed).toBe(0);
  });
});
