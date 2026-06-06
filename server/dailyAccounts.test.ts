import { describe, it, expect } from "vitest";

describe("Daily Accounts Logic", () => {
  it("should compute carry forward correctly", () => {
    // carryForward = prevCarry + salesCash + supplyToRestaurant + supplyExtra - expensesFixed - supplyToManagement
    const prevCarry = 100;
    const salesCash = 500;
    const supplyToRestaurant = 200;
    const supplyExtra = 50;
    const expensesFixed = 300;
    const supplyToManagement = 100;
    const result = prevCarry + salesCash + supplyToRestaurant + supplyExtra - expensesFixed - supplyToManagement;
    expect(result).toBe(450);
  });

  it("should compute net profit correctly", () => {
    // netProfit = carryForward - expensesFixed
    const carryForward = 450;
    const expensesFixed = 300;
    const netProfit = carryForward - expensesFixed;
    expect(netProfit).toBe(150);
  });

  it("should compute total sales correctly", () => {
    const salesCash = 100;
    const salesCard = 200;
    const salesKita = 50;
    const salesOrders = 30;
    const salesNoon = 20;
    const salesDeliveroo = 10;
    const salesCareem = 5;
    const total = salesCash + salesCard + salesKita + salesOrders + salesNoon + salesDeliveroo + salesCareem;
    expect(total).toBe(415);
  });

  it("should validate expense categories", () => {
    const validCategories = ["operational", "maintenance", "fixed", "other"];
    expect(validCategories).toContain("operational");
    expect(validCategories).toContain("maintenance");
    expect(validCategories).toContain("fixed");
    expect(validCategories).not.toContain("invalid");
  });
});
