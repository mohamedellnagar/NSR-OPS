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
  userId: number;
}): Promise<MonthDeletionResult> {
  const startedAt = Date.now();
  const { start, end } = monthRange(input.year, input.month);
  const conn = await getConn();

  const result: MonthDeletionResult = {
    year: input.year, month: input.month,
    deletedSupplierInvoices: 0, deletedFreeInvoices: 0,
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
          const [items] = await conn.execute<any[]>(
            `SELECT id, materialId, materialName, quantity, unitPrice
               FROM invoice_items WHERE invoiceId = ? AND materialId IS NOT NULL`,
            [inv.id]
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
              result.stockWentNegative.push(
                `${mat.name ?? it.materialName}: ${curQty} − ${qty} = ${newQty.toFixed(3)}`
              );
            }

            const restoredAvg = reverseAverageCost(curQty, curAvg, qty, price);
            if (restoredAvg === null) result.averageCostSkipped++;

            // Quantity is floored at 0: negative physical stock is never valid,
            // and the shortfall is reported above rather than silently stored.
            await conn.execute(
              `UPDATE raw_materials
                  SET currentQuantity = ?, ${restoredAvg !== null ? "averageCost = ?," : ""} updatedAt = NOW()
                WHERE id = ?`,
              restoredAvg !== null
                ? [Math.max(0, newQty).toFixed(3), restoredAvg.toFixed(3), it.materialId]
                : [Math.max(0, newQty).toFixed(3), it.materialId]
            );
            result.materialsAdjusted++;

            // Audit: write the reversing OUT row and mark the original reversed.
            const [ins] = (await conn.execute(
              `INSERT INTO inventory_transactions
                 (materialId, transactionType, quantity, unitPrice, totalAmount,
                  supplierId, supplierName, reason, movementStatus,
                  referenceNumber, referenceType, quantityBefore, quantityAfter,
                  notes, createdBy)
               VALUES (?, 'OUT', ?, ?, ?, ?, ?, 'return', 'posted', ?, 'invoice_deleted', ?, ?, ?, ?)`,
              [
                it.materialId, qty.toFixed(3), price.toFixed(3), (qty * price).toFixed(3),
                inv.supplierId ?? null, inv.supplierName ?? null,
                inv.invoiceNumber, curQty.toFixed(3), Math.max(0, newQty).toFixed(3),
                `عكس تلقائي عند حذف فواتير شهر ${input.year}-${String(input.month).padStart(2, "0")}`,
                input.userId,
              ]
            )) as any;
            result.reversalTransactions++;

            await conn.execute(
              `UPDATE inventory_transactions
                  SET movementStatus = 'reversed', reversingTransactionId = ?
                WHERE referenceNumber = ? AND materialId = ?
                  AND transactionType = 'IN' AND movementStatus = 'posted'`,
              [ins.insertId, inv.invoiceNumber, it.materialId]
            );
          }

          // invoice_items cascade with the invoice
          await conn.execute(`DELETE FROM invoices WHERE id = ?`, [inv.id]);
          result.deletedSupplierInvoices++;

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

    result.durationMs = Date.now() - startedAt;
    return result;
  } finally {
    conn.release();
  }
}
