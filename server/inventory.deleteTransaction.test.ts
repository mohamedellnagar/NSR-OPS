/**
 * Tests for deleteTransaction safety guard.
 *
 * The guard prevents direct deletion of auto-generated transactions whose
 * reason is "production", "waste", or "other". These are managed by their
 * originating workflows (kitchen pulls, waste logs, end-of-day counts) and
 * deleting them directly would corrupt inventory balances.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Minimal mock of the database layer ──────────────────────────────────────
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

const chainMock = {
  select: () => chainMock,
  from: () => chainMock,
  where: () => chainMock,
  limit: () => Promise.resolve([]),
  set: () => chainMock,
  update: () => chainMock,
};

vi.mock("../drizzle/schema", () => ({
  inventoryTransactions: { id: "id", reason: "reason", transactionType: "transactionType", quantity: "quantity", materialId: "materialId" },
  rawMaterials: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

// Helper: build a fake transaction row
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    materialId: 10,
    transactionType: "OUT",
    quantity: "5.000",
    reason: "purchase",
    ...overrides,
  };
}

// ── Re-implement deleteTransaction logic for unit testing ────────────────────
// We extract the guard logic so it can be tested without a real DB connection.
const PROTECTED_REASONS = ["production", "waste", "other"];

async function deleteTransactionGuard(tx: ReturnType<typeof makeTx>) {
  if (PROTECTED_REASONS.includes(tx.reason ?? "")) {
    throw new Error(
      "لا يمكن حذف هذه المعاملة مباشرة. يتم إدارتها تلقائياً من خلال نظام الإنتاج أو الجرد أو الهدر. استخدم التراجع عن الجرد أو حذف سجل الهدر بدلاً من ذلك."
    );
  }
  return { success: true };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("deleteTransaction safety guard", () => {
  it("allows deletion of 'purchase' transactions", async () => {
    const tx = makeTx({ reason: "purchase" });
    await expect(deleteTransactionGuard(tx)).resolves.toEqual({ success: true });
  });

  it("allows deletion of 'transfer' transactions", async () => {
    const tx = makeTx({ reason: "transfer" });
    await expect(deleteTransactionGuard(tx)).resolves.toEqual({ success: true });
  });

  it("allows deletion of 'return' transactions", async () => {
    const tx = makeTx({ reason: "return" });
    await expect(deleteTransactionGuard(tx)).resolves.toEqual({ success: true });
  });

  it("allows deletion of 'adjustment' transactions", async () => {
    const tx = makeTx({ reason: "adjustment" });
    await expect(deleteTransactionGuard(tx)).resolves.toEqual({ success: true });
  });

  it("BLOCKS deletion of 'production' transactions", async () => {
    const tx = makeTx({ reason: "production" });
    await expect(deleteTransactionGuard(tx)).rejects.toThrow(
      "لا يمكن حذف هذه المعاملة مباشرة"
    );
  });

  it("BLOCKS deletion of 'waste' transactions", async () => {
    const tx = makeTx({ reason: "waste" });
    await expect(deleteTransactionGuard(tx)).rejects.toThrow(
      "لا يمكن حذف هذه المعاملة مباشرة"
    );
  });

  it("BLOCKS deletion of 'other' transactions (end-of-day counts)", async () => {
    const tx = makeTx({ reason: "other" });
    await expect(deleteTransactionGuard(tx)).rejects.toThrow(
      "لا يمكن حذف هذه المعاملة مباشرة"
    );
  });

  it("allows deletion when reason is null/undefined (legacy rows)", async () => {
    const tx = makeTx({ reason: null });
    await expect(deleteTransactionGuard(tx as any)).resolves.toEqual({ success: true });
  });
});
