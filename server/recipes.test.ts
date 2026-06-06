import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the DB functions to avoid actual DB calls in unit tests
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    listProducts: vi.fn().mockResolvedValue([
      { id: 1, name: "Quarter Chicken", nameAr: "ربع دجاج", sku: "CHK-001", categoryReference: "دجاج", price: "25.00", cost: null, description: null, calories: null, isActive: true, recipeSource: null, createdAt: new Date(), updatedAt: new Date() },
    ]),
    getProductById: vi.fn().mockResolvedValue({
      id: 1, name: "Quarter Chicken", nameAr: "ربع دجاج", sku: "CHK-001", isActive: true, recipeSource: null, createdAt: new Date(), updatedAt: new Date(),
    }),
    createProduct: vi.fn().mockResolvedValue({
      id: 2, name: "Grilled Fish", nameAr: "سمك مشوي", sku: "FISH-001", isActive: true, recipeSource: null, createdAt: new Date(), updatedAt: new Date(),
    }),
    updateProduct: vi.fn().mockResolvedValue({
      id: 1, name: "Quarter Chicken Updated", nameAr: "ربع دجاج", sku: "CHK-001", isActive: true, recipeSource: null, createdAt: new Date(), updatedAt: new Date(),
    }),
    deleteProduct: vi.fn().mockResolvedValue({ success: true }),
    getRecipeItems: vi.fn().mockResolvedValue([
      { id: 1, productId: 1, materialId: 1, quantity: "250.0000", unit: "g", notes: null, materialName: "دجاج كاملة", materialUnit: "kg", lastPurchasePrice: "25.00", createdAt: new Date(), updatedAt: new Date() },
    ]),
    addRecipeItem: vi.fn().mockResolvedValue({
      id: 2, productId: 1, materialId: 2, quantity: "200.0000", unit: "g", notes: null, createdAt: new Date(), updatedAt: new Date(),
    }),
    updateRecipeItem: vi.fn().mockResolvedValue({
      id: 1, productId: 1, materialId: 1, quantity: "300.0000", unit: "g", notes: "مفروم", createdAt: new Date(), updatedAt: new Date(),
    }),
    deleteRecipeItem: vi.fn().mockResolvedValue({ success: true }),
    clearRecipeItems: vi.fn().mockResolvedValue({ success: true }),
    bulkInsertRecipeItems: vi.fn().mockResolvedValue([]),
    listMaterials: vi.fn().mockResolvedValue([
      { id: 1, name: "دجاج كاملة", unit: "kg", currentQuantity: "10.00", lastPurchasePrice: "25.00" },
      { id: 2, name: "أرز", unit: "kg", currentQuantity: "50.00", lastPurchasePrice: "5.00" },
    ]),
  };
});

vi.mock("./aiChef", () => ({
  generateRecipeWithAI: vi.fn().mockResolvedValue({
    ingredients: [
      { materialId: 1, materialName: "دجاج كاملة", quantity: 0.25, unit: "pcs", notes: "" },
      { materialId: 2, materialName: "أرز", quantity: 200, unit: "g", notes: "" },
    ],
    notes: "وصفة ربع دجاج مشوي مع أرز",
  }),
}));

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: { headers: {} } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  };
}

function createWarehouseContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "warehouse-user",
      email: "warehouse@example.com",
      name: "Warehouse Manager",
      loginMethod: "manus",
      role: "warehouse_manager",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: { headers: {} } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  };
}

describe("Products Router", () => {
  it("should list products", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.products.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should create a product", async () => {
    const caller = appRouter.createCaller(createWarehouseContext());
    const result = await caller.products.create({
      name: "Grilled Fish",
      nameAr: "سمك مشوي",
      sku: "FISH-001",
      categoryReference: "أسماك",
      price: "35.00",
    });
    expect(result).toBeDefined();
  });

  it("should update a product", async () => {
    const caller = appRouter.createCaller(createWarehouseContext());
    const result = await caller.products.update({
      id: 1,
      name: "Quarter Chicken Updated",
    });
    expect(result).toBeDefined();
  });

  it("should delete a product (admin only)", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.products.delete({ id: 1 });
    expect(result).toBeDefined();
  });
});

describe("Recipes Router", () => {
  it("should get recipe items for a product", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.recipes.getByProduct({ productId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("should add a recipe item", async () => {
    const caller = appRouter.createCaller(createWarehouseContext());
    const result = await caller.recipes.addItem({
      productId: 1,
      materialId: 2,
      quantity: "200",
      unit: "g",
      notes: "مسلوق",
    });
    expect(result).toBeDefined();
  });

  it("should update a recipe item", async () => {
    const caller = appRouter.createCaller(createWarehouseContext());
    const result = await caller.recipes.updateItem({
      id: 1,
      quantity: "300",
      unit: "g",
      notes: "مفروم",
    });
    expect(result).toBeDefined();
  });

  it("should delete a recipe item", async () => {
    const caller = appRouter.createCaller(createWarehouseContext());
    const result = await caller.recipes.deleteItem({ id: 1 });
    expect(result).toBeDefined();
  });

  it("should clear all recipe items for a product", async () => {
    const caller = appRouter.createCaller(createWarehouseContext());
    const result = await caller.recipes.clearRecipe({ productId: 1 });
    expect(result).toBeDefined();
  });

  it("should generate recipe with AI", async () => {
    const caller = appRouter.createCaller(createWarehouseContext());
    const result = await caller.recipes.generateWithAI({
      productId: 1,
      productName: "ربع دجاج مشوي",
      productCategory: "دجاج",
      productDescription: "ربع دجاج مشوي على الفحم مع أرز",
    });
    expect(result).toBeDefined();
    expect(result.notes).toBeDefined();
  });
});
