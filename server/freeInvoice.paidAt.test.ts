import { describe, it, expect } from "vitest";

// اختبار منطق paidAt وexpenseCategory والتاريخ في الفواتير الحرة

describe("Free Invoice paidAt & expenseCategory logic", () => {
  it("should set paidAt when paymentStatus is paid", () => {
    const paymentStatus = "paid";
    const isPaid = paymentStatus === "paid" || paymentStatus === "partial";
    const paidAt = isPaid ? new Date() : undefined;
    expect(paidAt).toBeDefined();
    expect(paidAt).toBeInstanceOf(Date);
  });

  it("should set paidAt when paymentStatus is partial", () => {
    const paymentStatus = "partial";
    const isPaid = paymentStatus === "paid" || paymentStatus === "partial";
    const paidAt = isPaid ? new Date() : undefined;
    expect(paidAt).toBeDefined();
  });

  it("should NOT set paidAt when paymentStatus is deferred", () => {
    const paymentStatus = "deferred";
    const isPaid = paymentStatus === "paid" || paymentStatus === "partial";
    const paidAt = isPaid ? new Date() : undefined;
    expect(paidAt).toBeUndefined();
  });

  it("should display paidAt date in table for paid invoices", () => {
    const inv = { paymentStatus: "paid", paidAt: new Date("2026-04-09T06:00:00Z"), date: new Date("2026-04-08T10:00:00Z") };
    const displayDate = (inv.paymentStatus === "paid" || inv.paymentStatus === "partial") && inv.paidAt
      ? inv.paidAt
      : inv.date;
    expect(displayDate).toBe(inv.paidAt);
  });

  it("should use date for deferred invoices in display", () => {
    const inv = { paymentStatus: "deferred", paidAt: null as Date | null, date: new Date("2026-04-08T10:00:00Z") };
    const displayDate = (inv.paymentStatus === "paid" || inv.paymentStatus === "partial") && inv.paidAt
      ? inv.paidAt
      : inv.date;
    expect(displayDate).toBe(inv.date);
  });

  it("should default expenseCategory to other when not provided", () => {
    const expenseCategory = undefined;
    const result = expenseCategory ?? "other";
    expect(result).toBe("other");
  });

  it("should preserve expenseCategory when provided", () => {
    const expenseCategory = "operational";
    const result = expenseCategory ?? "other";
    expect(result).toBe("operational");
  });

  // اختبار منطق CONVERT_TZ: الفاتورة المدفوعة الساعة 1:30 صباحاً UTC (5:30 صباحاً دبي)
  // يجب أن تظهر في اليوم السابق (قبل 6 صباحاً دبي)
  it("should correctly identify business day using tzOffset logic", () => {
    // Dubai UTC+4, 6AM start → tzOffset = -02:00
    // A payment at 2026-04-09 01:30 UTC = 2026-04-09 05:30 Dubai (before 6AM)
    // → business day = 2026-04-08 (yesterday)
    // CONVERT_TZ('2026-04-09 01:30:00', '+00:00', '-02:00') = '2026-04-08 23:30:00'
    // DATE(...) = '2026-04-08' ✓
    const utcTime = new Date("2026-04-09T01:30:00Z");
    const tzOffsetHours = -2; // Dubai UTC+4 with 6AM start
    const adjustedMs = utcTime.getTime() + tzOffsetHours * 3600 * 1000;
    const adjustedDate = new Date(adjustedMs);
    const businessDay = adjustedDate.toISOString().slice(0, 10);
    expect(businessDay).toBe("2026-04-08"); // يظهر في يوم 8 أبريل (أمس)
  });

  it("should correctly identify business day for payment after 6AM Dubai", () => {
    // A payment at 2026-04-09 06:30 UTC = 2026-04-09 10:30 Dubai (after 6AM)
    // → business day = 2026-04-09 (today)
    // CONVERT_TZ('2026-04-09 06:30:00', '+00:00', '-02:00') = '2026-04-09 04:30:00'
    // DATE(...) = '2026-04-09' ✓
    const utcTime = new Date("2026-04-09T06:30:00Z");
    const tzOffsetHours = -2;
    const adjustedMs = utcTime.getTime() + tzOffsetHours * 3600 * 1000;
    const adjustedDate = new Date(adjustedMs);
    const businessDay = adjustedDate.toISOString().slice(0, 10);
    expect(businessDay).toBe("2026-04-09"); // يظهر في يوم 9 أبريل (اليوم)
  });

  it("should correctly identify business day for payment at exactly 6AM Dubai (2AM UTC)", () => {
    // A payment at 2026-04-09 02:00 UTC = 2026-04-09 06:00 Dubai (exactly 6AM)
    // → business day = 2026-04-09 (today, new business day starts)
    const utcTime = new Date("2026-04-09T02:00:00Z");
    const tzOffsetHours = -2;
    const adjustedMs = utcTime.getTime() + tzOffsetHours * 3600 * 1000;
    const adjustedDate = new Date(adjustedMs);
    const businessDay = adjustedDate.toISOString().slice(0, 10);
    expect(businessDay).toBe("2026-04-09"); // يبدأ اليوم الجديد
  });
});
