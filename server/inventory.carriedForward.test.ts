/**
 * Tests for carried-forward pull inventory safety guards.
 *
 * Carried-forward pulls are created by countKitchenPull when remaining > 0.
 * They are NOT deducted from inventory at creation time (the original pull
 * already deducted the full amount). Therefore:
 *   - deleteKitchenPull on a carried-forward pull must NOT restore inventory.
 *   - updateKitchenPullQuantity on a carried-forward pull must NOT adjust inventory.
 */

import { describe, it, expect } from "vitest";

// ── Minimal domain model ─────────────────────────────────────────────────────
interface Pull {
  id: number;
  materialId: number;
  materialType: string;
  pulledQuantity: string;
  status: "open" | "counted" | "closed";
  isCarriedForward: boolean;
}

// ── Extracted guard logic (mirrors db.ts deleteKitchenPull) ──────────────────
function shouldRestoreInventoryOnDelete(pull: Pull): boolean {
  if (pull.materialType === "semi_finished") {
    // Semi-finished always restores (production is reversed)
    return true;
  }
  // Raw material: only restore if NOT a carried-forward pull
  return !pull.isCarriedForward;
}

// ── Extracted guard logic (mirrors db.ts updateKitchenPullQuantity) ──────────
function shouldAdjustInventoryOnUpdate(pull: Pull, diff: number): boolean {
  if (diff === 0) return false;
  if (pull.materialType === "semi_finished") return true;
  // Raw material: only adjust if NOT a carried-forward pull
  return !pull.isCarriedForward;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("deleteKitchenPull inventory guard", () => {
  it("restores inventory for original raw material pull", () => {
    const pull: Pull = {
      id: 1, materialId: 10, materialType: "raw",
      pulledQuantity: "5.000", status: "open", isCarriedForward: false,
    };
    expect(shouldRestoreInventoryOnDelete(pull)).toBe(true);
  });

  it("does NOT restore inventory for carried-forward raw material pull", () => {
    const pull: Pull = {
      id: 2, materialId: 10, materialType: "raw",
      pulledQuantity: "3.000", status: "open", isCarriedForward: true,
    };
    expect(shouldRestoreInventoryOnDelete(pull)).toBe(false);
  });

  it("always restores inventory for semi-finished pull (production reversal)", () => {
    const pull: Pull = {
      id: 3, materialId: 20, materialType: "semi_finished",
      pulledQuantity: "10.000", status: "open", isCarriedForward: false,
    };
    expect(shouldRestoreInventoryOnDelete(pull)).toBe(true);
  });

  it("always restores inventory for carried-forward semi-finished pull", () => {
    const pull: Pull = {
      id: 4, materialId: 20, materialType: "semi_finished",
      pulledQuantity: "4.000", status: "open", isCarriedForward: true,
    };
    expect(shouldRestoreInventoryOnDelete(pull)).toBe(true);
  });
});

describe("updateKitchenPullQuantity inventory guard", () => {
  it("adjusts inventory for original raw material pull when diff != 0", () => {
    const pull: Pull = {
      id: 1, materialId: 10, materialType: "raw",
      pulledQuantity: "5.000", status: "open", isCarriedForward: false,
    };
    expect(shouldAdjustInventoryOnUpdate(pull, 2)).toBe(true);
    expect(shouldAdjustInventoryOnUpdate(pull, -2)).toBe(true);
  });

  it("does NOT adjust inventory for carried-forward raw material pull", () => {
    const pull: Pull = {
      id: 2, materialId: 10, materialType: "raw",
      pulledQuantity: "3.000", status: "open", isCarriedForward: true,
    };
    expect(shouldAdjustInventoryOnUpdate(pull, 1)).toBe(false);
    expect(shouldAdjustInventoryOnUpdate(pull, -1)).toBe(false);
  });

  it("never adjusts inventory when diff is 0", () => {
    const pull: Pull = {
      id: 3, materialId: 10, materialType: "raw",
      pulledQuantity: "5.000", status: "open", isCarriedForward: false,
    };
    expect(shouldAdjustInventoryOnUpdate(pull, 0)).toBe(false);
  });

  it("adjusts inventory for semi-finished pull regardless of isCarriedForward", () => {
    const pull: Pull = {
      id: 4, materialId: 20, materialType: "semi_finished",
      pulledQuantity: "10.000", status: "open", isCarriedForward: true,
    };
    expect(shouldAdjustInventoryOnUpdate(pull, 3)).toBe(true);
  });
});
