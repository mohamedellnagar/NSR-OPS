/**
 * invoice-bulk-delete.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deletes a whole month's invoices, REVERSING the stock effects of supplier
 * invoices as it goes.
 *
 * Why this exists: `createInvoice` increases `rawMaterials.currentQuantity`,
 * rewrites the weighted-average `averageCost` and `lastPurchasePrice`, and
 * writes an inventory transaction. The plain `deleteInvoice` undoes NONE of
 * that, so deleting invoices in bulk would silently inflate stock and corrupt
 * costing. Everything here exists to undo those four effects.
 *
 * What is reversible, and how exactly:
 *   - quantity      → exact. Addition commutes, so subtracting the same qty is
 *                     always correct regardless of what happened in between.
 *   - averageCost   → algebraically inverted. Exact only when nothing else has
 *                     touched the material since; otherwise best-effort, and
 *                     skipped entirely if the result would be nonsense.
 *   - lastPurchasePrice → recomputed from the most recent SURVIVING purchase.
 *   - inventory transaction → not deleted. The original is marked `reversed`
 *                     and a matching OUT row is written, preserving the audit
 *                     trail (the schema already models this).
 *
 * Free invoices have no stock effects at all, so they are simply deleted.
 */
import { getConn } from "./pool";

const TZ = "+04:00";

function num(v: unknown): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function monthRange(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * Inverts the weighted-average update that `createInvoice` performed:
 *   newAvg = (oldQty*oldAvg + q*p) / (oldQty + q)
 * so:
 *   oldAvg = (curAvg*curQty - q*p) / (curQty - q)
 *
 * Returns null when the reversal cannot be trusted (no stock left to average
 * over, or a negative/!finite result), in which case the caller must leave
 * averageCost untouched rather than write a wrong number.
 *
 * Pure — unit tested.
 */
export function reverseAverageCost(
  currentQty: number,
  currentAvg: number,
  itemQty: number,
  itemUnitPrice: number
): number | null {
  const remainingQty = currentQty - itemQty;
  if (!(remainingQty > 0)) return null; // nothing left to hold an average
  const value = currentAvg * currentQty - itemQty * itemUnitPrice;
  const restored = value / remainingQty;
  if (!Number.isFinite(restored) || restored < 0) return null;
  return restored;
}


// ─── Single invoice, with stock reversal ──────────────────────────────────────
export interface ReversalOutcome {
  materialsAdjusted: number;
  averageCostSkipped: number;
  stockWentNegative: string[];
  reversalTransactions: number;
}

/**
 * Deletes ONE supplier invoice and undoes its stock effects.
 * Shared by the single-row delete and the whole-month delete so the reversal
 * logic exists in exactly one place.
 */
export async function deleteSupplierInvoiceWithReversal(
  conn: any,
  invoice: { id: number; invoiceNumber: string; supplierId?: number | null; supplierName?: string | null },
  userId: number,
  note: string
): Promise<ReversalOutcome> {
  const out: ReversalOutcome = {
    materialsAdjusted: 0, averageCostSkipped: 0,
    stockWentNegative: [], reversalTransactions: 0,
  };

  const [items] = await conn.execute(
    `SELECT id, materialId, materialName, quantity, unitPrice
       FROM invoice_items WHERE invoiceId = ? AND materialId IS NOT NULL`,
    [invoice.id]
  );

  for (const it of items as any[]) {
    const qty = num(it.quantity);
    const price = num(it.unitPrice);

    const [[mat]] = (await conn.execute(
      `SELECT currentQuantity, averageCost, name FROM raw_materials WHERE id = ?`,
      [it.materialId]
    )) as any;
    if (!mat) continue;

    const curQty = num(mat.currentQuantity);
    const curAvg = num(mat.averageCost);
    const newQty = curQty - qty;

    if (newQty < 0) {
      out.stockWentNegative.push(
        `${mat.name ?? it.materialName}: ${curQty} \u2212 ${qty} = ${newQty.toFixed(3)}`
      );
    }

    const restoredAvg = reverseAverageCost(curQty, curAvg, qty, price);
    if (restoredAvg === null) out.averageCostSkipped++;

    await conn.execute(
      `UPDATE raw_materials
          SET currentQuantity = ?, ${restoredAvg !== null ? "averageCost = ?," : ""} updatedAt = NOW()
        WHERE id = ?`,
      restoredAvg !== null
        ? [Math.max(0, newQty).toFixed(3), restoredAvg.toFixed(3), it.materialId]
        : [Math.max(0, newQty).toFixed(3), it.materialId]
    );
    out.materialsAdjusted++;

    const [ins] = (await conn.execute(
      `INSERT INTO inventory_transactions
         (materialId, transactionType, quantity, unitPrice, totalAmount,
          supplierId, supplierName, reason, movementStatus,
          referenceNumber, referenceType, quantityBefore, quantityAfter, notes, createdBy)
       VALUES (?, 'OUT', ?, ?, ?, ?, ?, 'return', 'posted', ?, 'invoice_deleted', ?, ?, ?, ?)`,
      [
        it.materialId, qty.toFixed(3), price.toFixed(3), (qty * price).toFixed(3),
        invoice.supplierId ?? null, invoice.supplierName ?? null,
        invoice.invoiceNumber, curQty.toFixed(3), Math.max(0, newQty).toFixed(3),
        note, userId,
      ]
    )) as any;
    out.reversalTransactions++;

    await conn.execute(
      `UPDATE inventory_transactions
          SET movementStatus = 'reversed', reversingTransactionId = ?
        WHERE referenceNumber = ? AND materialId = ?
          AND transactionType = 'IN' AND movementStatus = 'posted'`,
      [ins.insertId, invoice.invoiceNumber, it.materialId]
    );
  }

  await conn.execute(`DELETE FROM invoices WHERE id = ?`, [invoice.id]);

  // lastPurchasePrice must come from a purchase that still exists.
  for (const it of items as any[]) {
    const [[latest]] = (await conn.execute(
      `SELECT ii.unitPrice FROM invoice_items ii
         JOIN invoices i ON ii.invoiceId = i.id
        WHERE ii.materialId = ?
        ORDER BY i.invoiceDate DESC, i.id DESC LIMIT 1`,
      [it.materialId]
    )) as any;
    if (latest) {
      await conn.execute(
        `UPDATE raw_materials SET lastPurchasePrice = ? WHERE id = ?`,
        [num(latest.unitPrice).toFixed(3), it.materialId]
      );
    }
  }

  return out;
}

// ─── Preview ──────────────────────────────────────────────────────────────────
export interface MonthDeletionPreview {
  year: number;
  month: number;
  supplierInvoices: number;
  freeInvoices: number;
  supplierTotal: number;
  freeTotal: number;
  /** Materials whose stock will be reduced, and by how much. */
  affectedMaterials: Array<{
    materialId: number;
    materialName: string;
    currentQuantity: number;
    quantityToReverse: number;
    resultingQuantity: number;
    goesNegative: boolean;
  }>;
  /**
   * The `expensesFixed` figure on this month's daily_accounts rows. Not an
   * invoice, so it is never removed by a scope — it is opted into separately.
   */
  dailyExpenses: { days: number; total: number };
  /** Monthly payments are NOT invoices and are never touched — shown for clarity. */
  monthlyPaymentsUntouched: number;
}

export async function previewMonthDeletion(
  year: number,
  month: number
): Promise<MonthDeletionPreview> {
  const { start, end } = monthRange(year, month);
  const conn = await getConn();
  try {
    const [[sup]] = (await conn.execute(
      `SELECT COUNT(*) AS n, COALESCE(SUM(totalAmount),0) AS total FROM invoices
        WHERE DATE(CONVERT_TZ(invoiceDate,'+00:00','${TZ}')) BETWEEN ? AND ?`,
      [start, end]
    )) as any;

    const [[free]] = (await conn.execute(
      `SELECT COUNT(*) AS n, COALESCE(SUM(totalAmount),0) AS total FROM free_invoices
        WHERE DATE(CONVERT_TZ(date,'+00:00','${TZ}')) BETWEEN ? AND ?`,
      [start, end]
    )) as any;

    const [[mp]] = (await conn.execute(
      `SELECT COUNT(*) AS n FROM monthly_payments WHERE year = ? AND month = ?`,
      [year, month]
    )) as any;

    const [[daily]] = (await conn.execute(
      `SELECT COUNT(*) AS n, COALESCE(SUM(expensesFixed),0) AS total
         FROM daily_accounts
        WHERE accountDate BETWEEN ? AND ? AND expensesFixed > 0`,
      [start, end]
    )) as any;

    // Aggregate per material so the user sees the real stock impact up front.
    const [mats] = await conn.execute<any[]>(
      `SELECT ii.materialId,
              COALESCE(rm.name, ii.materialName) AS materialName,
              rm.currentQuantity,
              SUM(ii.quantity) AS qtyToReverse
         FROM invoice_items ii
         JOIN invoices i    ON ii.invoiceId = i.id
    LEFT JOIN raw_materials rm ON rm.id = ii.materialId
        WHERE DATE(CONVERT_TZ(i.invoiceDate,'+00:00','${TZ}')) BETWEEN ? AND ?
          AND ii.materialId IS NOT NULL
        GROUP BY ii.materialId, materialName, rm.currentQuantity
        ORDER BY qtyToReverse DESC`,
      [start, end]
    );

    return {
      year, month,
      supplierInvoices: Number(sup?.n ?? 0),
      freeInvoices: Number(free?.n ?? 0),
      supplierTotal: num(sup?.total),
      freeTotal: num(free?.total),
      dailyExpenses: { days: num(daily.n), total: num(daily.total) },
      monthlyPaymentsUntouched: Number(mp?.n ?? 0),
      affectedMaterials: (mats as any[]).map((m) => {
        const current = num(m.currentQuantity);
        const toReverse = num(m.qtyToReverse);
        const resulting = current - toReverse;
        return {
          materialId: Number(m.materialId),
          materialName: m.materialName ?? "—",
          currentQuantity: current,
          quantityToReverse: toReverse,
          resultingQuantity: resulting,
          goesNegative: resulting < 0,
        };
      }),
    };
  } finally {
    conn.release();
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export type DeleteScope = "ALL" | "FREE_ONLY" | "IMPORTED_ONLY";

export interface MonthDeletionResult {
  year: number;
  month: number;
  deletedSupplierInvoices: number;
  deletedFreeInvoices: number;
  /** Days whose fixed expense was cleared. The sales on those days survive. */
  clearedDailyExpenseDays: number;
  materialsAdjusted: number;
  averageCostSkipped: number;
  stockWentNegative: string[];
  reversalTransactions: number;
  durationMs: number;
  errors: string[];
}

export async function deleteMonthInvoices(input: {
  year: number;
  month: number;
  scope: DeleteScope;
  /** Also zero the daily fixed-expense figures. Off unless asked for. */
  clearDailyExpenses?: boolean;
  userId: number;
}): Promise<MonthDeletionResult> {
  const startedAt = Date.now();
  const { start, end } = monthRange(input.year, input.month);
  const conn = await getConn();

  const result: MonthDeletionResult = {
    year: input.year, month: input.month,
    deletedSupplierInvoices: 0, deletedFreeInvoices: 0,
    clearedDailyExpenseDays: 0,
    materialsAdjusted: 0, averageCostSkipped: 0,
    stockWentNegative: [], reversalTransactions: 0,
    durationMs: 0, errors: [],
  };

  try {
    // ── 1. Supplier invoices — reverse stock, then delete ──
    if (input.scope === "ALL") {
      const [invoiceRows] = await conn.execute<any[]>(
        `SELECT id, invoiceNumber, supplierId, supplierName FROM invoices
          WHERE DATE(CONVERT_TZ(invoiceDate,'+00:00','${TZ}')) BETWEEN ? AND ?
          ORDER BY id`,
        [start, end]
      );

      for (const inv of invoiceRows as any[]) {
        try {
          const outcome = await deleteSupplierInvoiceWithReversal(
            conn, inv, input.userId,
            `عكس تلقائي عند حذف فواتير شهر ${input.year}-${String(input.month).padStart(2, "0")}`
          );
          result.materialsAdjusted += outcome.materialsAdjusted;
          result.averageCostSkipped += outcome.averageCostSkipped;
          result.stockWentNegative.push(...outcome.stockWentNegative);
          result.reversalTransactions += outcome.reversalTransactions;
          result.deletedSupplierInvoices++;
        } catch (err) {
          result.errors.push(
            `فاتورة ${inv.invoiceNumber}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // ── 2. Free invoices — no stock effects ──
    let freeWhere = `DATE(CONVERT_TZ(date,'+00:00','${TZ}')) BETWEEN ? AND ?`;
    const freeParams: unknown[] = [start, end];
    if (input.scope === "IMPORTED_ONLY") {
      freeWhere += ` AND notes = 'مستورد من ملف إكسل'`;
    }

    const [freeRows] = await conn.execute<any[]>(
      `SELECT id FROM free_invoices WHERE ${freeWhere}`,
      freeParams
    );
    const freeIds = (freeRows as any[]).map((r) => r.id);
    if (freeIds.length > 0) {
      const placeholders = freeIds.map(() => "?").join(",");
      await conn.execute(
        `DELETE FROM free_invoice_items WHERE invoiceId IN (${placeholders})`,
        freeIds
      );
      await conn.execute(`DELETE FROM free_invoices WHERE id IN (${placeholders})`, freeIds);
      result.deletedFreeInvoices = freeIds.length;
    }

    // ── 3. Daily fixed expenses ──
    // Zeroed, not deleted: the daily_accounts row also carries that day's SALES,
    // so removing it would destroy revenue the caller never asked to touch.
    if (input.clearDailyExpenses) {
      const [res] = await conn.execute<any>(
        `UPDATE daily_accounts SET expensesFixed = 0
          WHERE accountDate BETWEEN ? AND ? AND expensesFixed > 0`,
        [start, end]
      );
      result.clearedDailyExpenseDays = res.affectedRows ?? 0;
    }

    result.durationMs = Date.now() - startedAt;
    return result;
  } finally {
    conn.release();
  }
}

// ─── Single expense row ───────────────────────────────────────────────────────
export type ExpenseRowSource =
  | "SUPPLIER_INVOICE" | "FREE_INVOICE" | "MONTHLY_PAYMENT" | "DAILY_EXPENSE";

export interface DeleteExpenseRowResult {
  deleted: boolean;
  kind: ExpenseRowSource;
  /** Set for DAILY_EXPENSE: the row is kept, only the fixed-expense figure is cleared. */
  clearedOnly?: boolean;
  materialsAdjusted?: number;
  stockWentNegative?: string[];
}

/**
 * Deletes ONE row as shown in the monthly expenses table.
 *
 * DAILY_EXPENSE is special: it is not a record of its own but the
 * `expensesFixed` figure on a daily_accounts row that ALSO holds that day's
 * sales. Deleting the row would destroy the sales, so the figure is zeroed
 * instead and the day is left intact.
 */
export async function deleteExpenseRow(input: {
  source: ExpenseRowSource;
  /** invoice/payment id, or the YYYY-MM-DD date for a daily expense. */
  id?: number;
  date?: string;
  userId: number;
}): Promise<DeleteExpenseRowResult> {
  const conn = await getConn();
  try {
    if (input.source === "DAILY_EXPENSE") {
      if (!input.date) throw new Error("التاريخ مطلوب لحذف المصروف اليومي");
      const [res] = await conn.execute<any>(
        `UPDATE daily_accounts SET expensesFixed = 0 WHERE accountDate = ?`,
        [input.date]
      );
      if (res.affectedRows === 0) throw new Error("اليوم غير موجود");
      return { deleted: true, kind: "DAILY_EXPENSE", clearedOnly: true };
    }

    if (!input.id) throw new Error("المعرّف مطلوب");

    if (input.source === "SUPPLIER_INVOICE") {
      const [[inv]] = (await conn.execute(
        `SELECT id, invoiceNumber, supplierId, supplierName FROM invoices WHERE id = ?`,
        [input.id]
      )) as any;
      if (!inv) throw new Error("الفاتورة غير موجودة");
      const outcome = await deleteSupplierInvoiceWithReversal(
        conn, inv, input.userId, `عكس تلقائي عند حذف الفاتورة ${inv.invoiceNumber}`
      );
      return {
        deleted: true, kind: "SUPPLIER_INVOICE",
        materialsAdjusted: outcome.materialsAdjusted,
        stockWentNegative: outcome.stockWentNegative,
      };
    }

    if (input.source === "FREE_INVOICE") {
      await conn.execute(`DELETE FROM free_invoice_items WHERE invoiceId = ?`, [input.id]);
      const [res] = await conn.execute<any>(`DELETE FROM free_invoices WHERE id = ?`, [input.id]);
      if (res.affectedRows === 0) throw new Error("الفاتورة غير موجودة");
      return { deleted: true, kind: "FREE_INVOICE" };
    }

    const [res] = await conn.execute<any>(`DELETE FROM monthly_payments WHERE id = ?`, [input.id]);
    if (res.affectedRows === 0) throw new Error("الدفعة غير موجودة");
    return { deleted: true, kind: "MONTHLY_PAYMENT" };
  } finally {
    conn.release();
  }
}
