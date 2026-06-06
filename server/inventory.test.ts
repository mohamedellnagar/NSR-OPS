import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  // Auth stubs (for sdk.ts compatibility)
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getUserByEmail: vi.fn().mockResolvedValue(null),
  getUserById: vi.fn().mockResolvedValue(null),
  verifyPassword: vi.fn().mockResolvedValue(false),
  updateLastSignedIn: vi.fn().mockResolvedValue(undefined),
  // Users
  listUsers: vi.fn().mockResolvedValue([]),
  createUser: vi.fn().mockResolvedValue({ id: 2, name: "New User", email: "new@example.com", role: "viewer" }),
  updateUser: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  // Categories
  listCategories: vi.fn().mockResolvedValue([]),
  createCategory: vi.fn().mockResolvedValue({ id: 1, name: "Test Category" }),
  updateCategory: vi.fn().mockResolvedValue(undefined),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
  // Suppliers
  listSuppliers: vi.fn().mockResolvedValue([]),
  createSupplier: vi.fn().mockResolvedValue({ id: 1, name: "Test Supplier" }),
  updateSupplier: vi.fn().mockResolvedValue(undefined),
  deleteSupplier: vi.fn().mockResolvedValue(undefined),
  // Materials
  listMaterials: vi.fn().mockResolvedValue([]),
  getMaterialById: vi.fn().mockResolvedValue(null),
  createMaterial: vi.fn().mockResolvedValue(1),
  updateMaterial: vi.fn().mockResolvedValue(undefined),
  deleteMaterial: vi.fn().mockResolvedValue(undefined),
  bulkCreateMaterials: vi.fn().mockResolvedValue({ inserted: 2, skipped: 0, errors: [] }),
  // Inventory
  createTransaction: vi.fn().mockImplementation(({ transactionType }: { transactionType: string }) =>
    Promise.resolve({ id: 1, transactionType, quantity: "50" })
  ),
  listTransactions: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({ totalMaterials: 0, lowStockCount: 0, outOfStockCount: 0, totalValue: "0" }),
  getRecentTransactions: vi.fn().mockResolvedValue([]),
  // Alerts & Reports
  getLowStockMaterials: vi.fn().mockResolvedValue([]),
  getInventoryValuationReport: vi.fn().mockResolvedValue({ items: [], totalValue: 0 }),
  getStockMovementReport: vi.fn().mockResolvedValue({ transactions: [], totalIn: 0, totalOut: 0 }),
  getSupplierPerformanceReport: vi.fn().mockResolvedValue([]),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────
function makeCtx(role: "admin" | "warehouse_manager" | "viewer" = "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      name: "Test User",
      email: "test@example.com",
      loginMethod: null,
      role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────
describe("auth", () => {
  it("me returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("me returns user for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test User");
  });

  it("logout clears session cookie", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

// ─── Materials Tests ──────────────────────────────────────────────────────────
describe("materials", () => {
  it("list returns array for viewer", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.materials.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("create requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.materials.create({ name: "Test", code: "T001", unit: "kg", currentQuantity: 100, minimumQuantity: 10 })
    ).rejects.toThrow();
  });

  it("create succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.materials.create({ name: "Test Material", code: "TM001", unit: "kg", currentQuantity: 100, minimumQuantity: 10 });
    expect(result).toBeDefined();
  });

  it("delete requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.materials.delete({ id: 1 })).rejects.toThrow();
  });

  it("bulkImport succeeds for warehouse_manager", async () => {
    const caller = appRouter.createCaller(makeCtx("warehouse_manager"));
    const result = await caller.materials.bulkImport({
      items: [{ code: "RM-001", name: "Flour", unit: "kg", currentQuantity: 100, minimumQuantity: 20 }],
    });
    expect(result).toHaveProperty("inserted");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("errors");
  });
});

// ─── Categories Tests ─────────────────────────────────────────────────────────
describe("categories", () => {
  it("list returns array", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.categories.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("create succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.categories.create({ name: "Test Category" });
    expect(result).toBeDefined();
    expect(result.name).toBe("Test Category");
  });
});

// ─── Suppliers Tests ──────────────────────────────────────────────────────────
describe("suppliers", () => {
  it("list returns array", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.suppliers.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("create succeeds for warehouse_manager", async () => {
    const caller = appRouter.createCaller(makeCtx("warehouse_manager"));
    const result = await caller.suppliers.create({ name: "Test Supplier" });
    expect(result).toBeDefined();
    expect(result.name).toBe("Test Supplier");
  });
});

// ─── Inventory Tests ──────────────────────────────────────────────────────────
describe("inventory", () => {
  it("stockIn requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.inventory.stockIn({ materialId: 1, quantity: 50, transactionDate: new Date() })
    ).rejects.toThrow();
  });

  it("stockIn succeeds for warehouse_manager", async () => {
    const caller = appRouter.createCaller(makeCtx("warehouse_manager"));
    const result = await caller.inventory.stockIn({ materialId: 1, quantity: 50, transactionDate: new Date() });
    expect(result).toBeDefined();
    expect(result.transactionType).toBe("IN");
  });

  it("stockOut requires authentication", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.inventory.stockOut({ materialId: 1, quantity: 20, transactionDate: new Date() })
    ).rejects.toThrow();
  });

  it("stockOut succeeds for warehouse_manager", async () => {
    const caller = appRouter.createCaller(makeCtx("warehouse_manager"));
    const result = await caller.inventory.stockOut({ materialId: 1, quantity: 20, reason: "production", transactionDate: new Date() });
    expect(result).toBeDefined();
    expect(result.transactionType).toBe("OUT");
  });

  it("transactions returns array", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.inventory.transactions({});
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Alerts Tests ─────────────────────────────────────────────────────────────
describe("alerts", () => {
  it("lowStock returns array", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.alerts.lowStock();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Reports Tests ────────────────────────────────────────────────────────────
describe("reports", () => {
  it("inventoryValuation returns object with items", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.reports.inventoryValuation();
    expect(result).toHaveProperty("items");
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("stockMovement returns object with transactions", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.reports.stockMovement({
      dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dateTo: new Date(),
    });
    expect(result).toHaveProperty("transactions");
  });

  it("supplierPerformance returns array", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    const result = await caller.reports.supplierPerformance();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Users Tests ──────────────────────────────────────────────────────────────
describe("users", () => {
  it("list requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("viewer"));
    await expect(caller.users.list()).rejects.toThrow();
  });

  it("list succeeds for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.users.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("updateRole requires admin role", async () => {
    const caller = appRouter.createCaller(makeCtx("warehouse_manager"));
    await expect(caller.users.updateRole({ userId: 2, role: "viewer" })).rejects.toThrow();
  });
});
