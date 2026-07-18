/**
 * foodCostAlert.test.ts
 * Unit tests for the Food Cost alert logic.
 * These tests mock the DB and WhatsApp trigger to verify the 1% threshold logic,
 * including indirect impact via semi-finished materials.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoist mocks so they're available before module imports ───────────────────
const { mockTrigger, mockExecute } = vi.hoisted(() => {
  const mockTrigger = vi.fn();
  const mockExecute = vi.fn();
  return { mockTrigger, mockExecute };
});

vi.mock("./whatsappScheduler", () => ({
  triggerEventSubscriptions: mockTrigger,
}));

// server/pool.ts calls createPool(...).getConnection().
vi.mock("mysql2/promise", () => {
  const connection = {
    execute: mockExecute,
    query: mockExecute,
    release: vi.fn(),
    end: vi.fn(),
  };
  const pool = { getConnection: vi.fn(async () => connection) };
  return {
    default: {
      createPool: vi.fn(() => pool),
      createConnection: vi.fn(() => connection),
    },
  };
});

// server/pool.ts refuses to build a pool without DATABASE_URL. mysql2 is mocked
// above, so this value is never dialled — it only satisfies that guard.
process.env.DATABASE_URL ||= "mysql://test:test@localhost:3306/test";

import { checkFoodCostImpact } from "./foodCostAlert";

describe("checkFoodCostImpact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends WhatsApp alert when Food Cost changes by more than 1% (direct raw material)", async () => {
    // Mock DB calls in order (new flow):
    // 1. Find products using material #10 DIRECTLY (raw)
    // 2. Find semi-finished materials that contain material #10
    // 3. (no indirect products since no semi-finished found)
    // 4. Get material name
    // 5. calcRecipeCost (old price) - recipe items for product 1
    // 6. calcRecipeCost (new price) - recipe items for product 1
    mockExecute
      .mockResolvedValueOnce([[{ id: 1, nameAr: "دجاج مشوي", name: "Grilled Chicken", price: "20" }]]) // direct products
      .mockResolvedValueOnce([[]])  // no semi-finished materials contain this raw material
      .mockResolvedValueOnce([[{ name: "دجاج", nameAr: "دجاج" }]])  // material name
      .mockResolvedValueOnce([[{ materialId: 10, quantity: "0.5", unit: "kg", lastPurchasePrice: "10", matUnit: "kg", materialType: "raw" }]])  // recipe items old
      .mockResolvedValueOnce([[{ materialId: 10, quantity: "0.5", unit: "kg", lastPurchasePrice: "10", matUnit: "kg", materialType: "raw" }]]); // recipe items new

    // Old price: 10 → cost = 0.5 * 10 = 5 → FC% = 5/20 * 100 = 25%
    // New price: 13 → cost = 0.5 * 13 = 6.5 → FC% = 6.5/20 * 100 = 32.5%
    // Diff = 7.5% > 1% → should trigger
    await checkFoodCostImpact(10, 10, 13);

    expect(mockTrigger).toHaveBeenCalledOnce();
    const [reportType, variables] = mockTrigger.mock.calls[0];
    expect(reportType).toBe("food_cost_alert");
    expect(variables.affected_count).toBe("1");
    expect(variables.affected_recipes).toContain("دجاج مشوي");
  });

  it("sends WhatsApp alert when Food Cost changes via semi-finished material", async () => {
    // Scenario: raw material #5 (أرز) is used in semi-finished #60001 (ارز شعريه)
    // which is used in product #100 (وجبة الأرز)
    mockExecute
      .mockResolvedValueOnce([[]])  // no direct products use material #5 as raw
      .mockResolvedValueOnce([[{ sfId: 60001, sfName: "ارز شعريه", sfNameAr: "ارز شعريه" }]])  // semi-finished containing #5
      .mockResolvedValueOnce([[{ id: 100, nameAr: "وجبة الأرز", name: "Rice Meal", price: "30" }]])  // indirect products
      .mockResolvedValueOnce([[{ name: "أرز", nameAr: "أرز" }]])  // material name
      // calcRecipeCost for product 100 (old): recipe has semi-finished #60001
      .mockResolvedValueOnce([[{ materialId: 60001, quantity: "0.5", unit: "kg", lastPurchasePrice: "5", matUnit: "kg", materialType: "semi_finished" }]])
      // calcSemiFinishedCost for #60001 (old): contains 1kg أرز at old price 3
      .mockResolvedValueOnce([[{ ingredientId: 5, quantity: "1.0", unit: "kg", lastPurchasePrice: "3", ingUnit: "kg" }]])
      // calcRecipeCost for product 100 (new): same recipe
      .mockResolvedValueOnce([[{ materialId: 60001, quantity: "0.5", unit: "kg", lastPurchasePrice: "5", matUnit: "kg", materialType: "semi_finished" }]])
      // calcSemiFinishedCost for #60001 (new): contains 1kg أرز at new price 8
      .mockResolvedValueOnce([[{ ingredientId: 5, quantity: "1.0", unit: "kg", lastPurchasePrice: "3", ingUnit: "kg" }]]);

    // Old: sf cost = 1*3 = 3 per kg → product cost = 0.5 * 3 = 1.5 → FC% = 1.5/30 * 100 = 5%
    // New: sf cost = 1*8 = 8 per kg → product cost = 0.5 * 8 = 4 → FC% = 4/30 * 100 = 13.3%
    // Diff = 8.3% > 1% → should trigger
    await checkFoodCostImpact(5, 3, 8);

    expect(mockTrigger).toHaveBeenCalledOnce();
    const [reportType, variables] = mockTrigger.mock.calls[0];
    expect(reportType).toBe("food_cost_alert");
    expect(variables.affected_count).toBe("1");
    expect(variables.affected_recipes).toContain("وجبة الأرز");
    expect(variables.affected_recipes).toContain("🔗"); // indirect indicator
  });

  it("does NOT send alert when Food Cost changes by less than 1%", async () => {
    mockExecute
      .mockResolvedValueOnce([[{ id: 1, nameAr: "دجاج مشوي", name: "Grilled Chicken", price: "100" }]]) // direct
      .mockResolvedValueOnce([[]])  // no semi-finished
      .mockResolvedValueOnce([[{ name: "دجاج", nameAr: "دجاج" }]])  // material name
      .mockResolvedValueOnce([[{ materialId: 10, quantity: "0.1", unit: "kg", lastPurchasePrice: "10", matUnit: "kg", materialType: "raw" }]])
      .mockResolvedValueOnce([[{ materialId: 10, quantity: "0.1", unit: "kg", lastPurchasePrice: "10", matUnit: "kg", materialType: "raw" }]]);

    // Old: 0.1 * 10 = 1 → FC% = 1%
    // New: 0.1 * 10.5 = 1.05 → FC% = 1.05% → diff = 0.05% < 1% → no alert
    await checkFoodCostImpact(10, 10, 10.5);

    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("does NOT send alert when old price equals new price", async () => {
    await checkFoodCostImpact(10, 15, 15);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("does NOT send alert when no products use the material (direct or indirect)", async () => {
    mockExecute
      .mockResolvedValueOnce([[]])  // no direct products
      .mockResolvedValueOnce([[]]); // no semi-finished materials
    await checkFoodCostImpact(99, 5, 10);
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
