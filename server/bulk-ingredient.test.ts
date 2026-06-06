import { describe, it, expect } from "vitest";

// Unit tests for bulk ingredient quantity update logic
// These tests verify the selection logic (which IDs to update) without hitting the DB

describe("bulkUpdateIngredientQuantity selection logic", () => {
  const allRecipes = [
    { id: 1, productName: "Burger", productNameAr: "برجر", quantity: "50", unit: "g" },
    { id: 2, productName: "Pizza", productNameAr: "بيتزا", quantity: "30", unit: "g" },
    { id: 3, productName: "Pasta", productNameAr: "باستا", quantity: "40", unit: "g" },
  ];

  function computeTargetIds(
    bulkQtySelectAll: boolean,
    bulkQtySelectedIds: number[],
    recipes: { id: number }[]
  ): number[] {
    if (bulkQtySelectAll) {
      const excluded = new Set(bulkQtySelectedIds);
      return recipes.filter((r) => !excluded.has(r.id)).map((r) => r.id);
    } else {
      return bulkQtySelectedIds;
    }
  }

  it("selectAll=true, no exclusions → all IDs", () => {
    const ids = computeTargetIds(true, [], allRecipes);
    expect(ids).toEqual([1, 2, 3]);
  });

  it("selectAll=true, exclude id=2 → [1, 3]", () => {
    const ids = computeTargetIds(true, [2], allRecipes);
    expect(ids).toEqual([1, 3]);
  });

  it("selectAll=false, selected=[1,3] → [1, 3]", () => {
    const ids = computeTargetIds(false, [1, 3], allRecipes);
    expect(ids).toEqual([1, 3]);
  });

  it("selectAll=false, no selection → empty", () => {
    const ids = computeTargetIds(false, [], allRecipes);
    expect(ids).toEqual([]);
  });

  it("isAll check: when targetIds.length === recipes.length → send undefined", () => {
    const ids = computeTargetIds(true, [], allRecipes);
    const isAll = ids.length === allRecipes.length;
    expect(isAll).toBe(true);
    // When isAll, recipeItemIds should be undefined (update all)
    const recipeItemIds = isAll ? undefined : ids;
    expect(recipeItemIds).toBeUndefined();
  });

  it("isAll check: when partial selection → send specific IDs", () => {
    const ids = computeTargetIds(true, [2], allRecipes);
    const isAll = ids.length === allRecipes.length;
    expect(isAll).toBe(false);
    const recipeItemIds = isAll ? undefined : ids;
    expect(recipeItemIds).toEqual([1, 3]);
  });
});
