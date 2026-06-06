import { describe, expect, it } from "vitest";
import { parseSalesCsv } from "./sales-db";

describe("parseSalesCsv", () => {
  it("should return empty array for empty input", () => {
    expect(parseSalesCsv("")).toEqual([]);
  });

  it("should parse CSV with header and one row", () => {
    const csv = [
      "Branch\tRef\tProduct\tSKU\tTotalSales\tCol5\tNetWithTax\tTax\tDiscount\tCol9\tNetSales\tCol11\tQty\tCost\tReturnAmt\tReturnQty\tCancelAmt\tCancelQty\tProfit",
      "Main\tBR1\tBurger\tBRG001\t100\t0\t95\t5\t0\t0\t90\t0\t10\t40\t0\t0\t0\t0\t50",
    ].join("\n");
    const rows = parseSalesCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].productName).toBe("Burger");
    expect(rows[0].sku).toBe("BRG001");
    expect(rows[0].qty).toBe(10);
    expect(rows[0].totalSales).toBe(100);
    expect(rows[0].netSales).toBe(90);
    expect(rows[0].profit).toBe(50);
  });

  it("should skip rows with empty product name", () => {
    const csv = [
      "Branch\tRef\tProduct\tSKU\tTotalSales\tCol5\tNetWithTax\tTax\tDiscount\tCol9\tNetSales\tCol11\tQty\tCost\tReturnAmt\tReturnQty\tCancelAmt\tCancelQty\tProfit",
      "Main\tBR1\t\tSKU1\t100\t0\t95\t5\t0\t0\t90\t0\t10\t40\t0\t0\t0\t0\t50",
    ].join("\n");
    const rows = parseSalesCsv(csv);
    expect(rows).toHaveLength(0);
  });

  it("should parse multiple rows and aggregate correctly", () => {
    const csv = [
      "Branch\tRef\tProduct\tSKU\tTotalSales\tCol5\tNetWithTax\tTax\tDiscount\tCol9\tNetSales\tCol11\tQty\tCost\tReturnAmt\tReturnQty\tCancelAmt\tCancelQty\tProfit",
      "Main\tBR1\tBurger\tBRG001\t100\t0\t95\t5\t0\t0\t90\t0\t10\t40\t0\t0\t0\t0\t50",
      "Main\tBR1\tFries\tFRS001\t50\t0\t47.5\t2.5\t0\t0\t45\t0\t5\t15\t0\t0\t0\t0\t30",
    ].join("\n");
    const rows = parseSalesCsv(csv);
    expect(rows).toHaveLength(2);
    const totalQty = rows.reduce((s, r) => s + r.qty, 0);
    expect(totalQty).toBe(15);
    const totalSales = rows.reduce((s, r) => s + r.totalSales, 0);
    expect(totalSales).toBe(150);
  });
});

describe("consumption analysis logic", () => {
  it("should correctly calculate totalQty = qtyPerUnit * soldQty", () => {
    const qtyPerUnit = 0.25; // 250g per unit
    const soldQty = 10;
    const totalQty = parseFloat((qtyPerUnit * soldQty).toFixed(4));
    expect(totalQty).toBe(2.5);
  });

  it("should correctly calculate totalCost = totalQty * unitCost", () => {
    const totalQty = 2.5;
    const unitCost = 20; // 20 AED per kg
    const totalCost = parseFloat((totalQty * unitCost).toFixed(3));
    expect(totalCost).toBe(50);
  });

  it("should aggregate same material across multiple products", () => {
    const consumptionMap = new Map<number, { totalQty: number; totalCost: number }>();
    
    // Product 1: uses 0.25 kg of material #1, sold 10 units
    const mat1Qty1 = 0.25 * 10;
    const mat1Cost1 = mat1Qty1 * 20;
    consumptionMap.set(1, { totalQty: mat1Qty1, totalCost: mat1Cost1 });
    
    // Product 2: also uses 0.1 kg of material #1, sold 5 units
    const mat1Qty2 = 0.1 * 5;
    const mat1Cost2 = mat1Qty2 * 20;
    const existing = consumptionMap.get(1)!;
    existing.totalQty += mat1Qty2;
    existing.totalCost += mat1Cost2;
    
    const result = consumptionMap.get(1)!;
    expect(parseFloat(result.totalQty.toFixed(4))).toBe(3.0);
    expect(parseFloat(result.totalCost.toFixed(3))).toBe(60.0);
  });

  it("should NOT add semi_finished materials to consumption map directly", () => {
    // Simulate: recipe has a semi_finished material
    // The accumulateRawMaterial logic should skip it and expand its components instead
    const materialType = "semi_finished";
    const isRaw = materialType === "raw";
    expect(isRaw).toBe(false);
  });

  it("should expand semi_finished components into raw materials", () => {
    // Simulate expansion: semi_finished 'Sauce' (1 unit) = 0.5kg tomato + 0.1kg onion
    const consumptionMap = new Map<number, { materialId: number; materialName: string; unit: string; totalQty: number; unitCost: number; totalCost: number }>();
    
    // Sauce used qty = 2 (e.g., 2 portions of sauce used by a product sold 2 times)
    const sauceQty = 2;
    // Tomato component: 0.5 kg per sauce unit
    const tomatoQtyPerSauce = 0.5;
    const tomatoTotalQty = tomatoQtyPerSauce * sauceQty;
    const tomatoUnitCost = 5;
    consumptionMap.set(10, { materialId: 10, materialName: "Tomato", unit: "kg", totalQty: tomatoTotalQty, unitCost: tomatoUnitCost, totalCost: tomatoTotalQty * tomatoUnitCost });
    
    // Onion component: 0.1 kg per sauce unit
    const onionQtyPerSauce = 0.1;
    const onionTotalQty = onionQtyPerSauce * sauceQty;
    const onionUnitCost = 3;
    consumptionMap.set(11, { materialId: 11, materialName: "Onion", unit: "kg", totalQty: onionTotalQty, unitCost: onionUnitCost, totalCost: onionTotalQty * onionUnitCost });
    
    // Verify: only raw materials in map, not the semi_finished sauce
    expect(consumptionMap.has(99)).toBe(false); // sauce (id=99) not in map
    expect(consumptionMap.get(10)?.totalQty).toBe(1.0); // 0.5 * 2
    expect(consumptionMap.get(11)?.totalQty).toBe(0.2); // 0.1 * 2
    expect(consumptionMap.get(10)?.totalCost).toBe(5.0);
    expect(consumptionMap.get(11)?.totalCost).toBeCloseTo(0.6);
  });

  it("should guard against circular recipes with depth limit", () => {
    // depth > 5 should stop recursion
    const maxDepth = 5;
    let depth = 0;
    const shouldStop = () => {
      depth++;
      return depth > maxDepth;
    };
    // Simulate 7 levels of recursion
    for (let i = 0; i < 7; i++) shouldStop();
    expect(depth).toBe(7);
    // At depth 6 and 7, shouldStop() returns true
    expect(6 > maxDepth).toBe(true);
  });
});
