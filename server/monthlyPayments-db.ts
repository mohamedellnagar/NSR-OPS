import mysql from "mysql2/promise";
import { getConn } from "./pool";
import { getBusinessDayTzOffset } from "./db";

export type PaymentCategory = "salaries" | "rent" | "utilities" | "other";
export type PaymentStatus = "paid" | "pending" | "overdue";
export type PaymentRecurrence = "monthly" | "once";

export interface CreateMonthlyPaymentInput {
  name: string;
  category: PaymentCategory;
  totalAmount: number;
  paidAmount?: number;
  dueDay: number;
  month: number;
  year: number;
  recurrence: PaymentRecurrence;
  notes?: string;
  createdBy?: number;
  copyToMonths?: number[]; // list of months to copy to (1-12)
}

export interface UpdateMonthlyPaymentInput {
  id: number;
  name?: string;
  category?: PaymentCategory;
  totalAmount?: number;
  paidAmount?: number;
  dueDay?: number;
  recurrence?: PaymentRecurrence;
  status?: PaymentStatus;
  notes?: string;
}

// Get all payments for a given month/year
export async function getMonthlyPayments(month: number, year: number) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT * FROM monthly_payments WHERE month = ? AND year = ? ORDER BY category, dueDay, name`,
      [month, year]
    );
    return rows as any[];
  } finally {
    await conn.release();
  }
}

// Get yearly summary: aggregate by month for a given year
export async function getYearlySummary(year: number) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT 
        month,
        SUM(CASE WHEN category = 'salaries' THEN totalAmount ELSE 0 END) AS salaries,
        SUM(CASE WHEN category = 'rent' THEN totalAmount ELSE 0 END) AS rent,
        SUM(CASE WHEN category = 'utilities' THEN totalAmount ELSE 0 END) AS utilities,
        SUM(CASE WHEN category = 'other' THEN totalAmount ELSE 0 END) AS other,
        SUM(totalAmount) AS total,
        SUM(paidAmount) AS paid
      FROM monthly_payments
      WHERE year = ?
      GROUP BY month
      ORDER BY month`,
      [year]
    );

    // Also get daily_accounts aggregated by month for the year
    const [dailyRows] = await conn.execute(
      `SELECT 
        MONTH(STR_TO_DATE(accountDate, '%Y-%m-%d')) AS month,
        SUM(COALESCE(salesCash,0) + COALESCE(salesCard,0) + COALESCE(salesKita,0) + 
            COALESCE(salesOrders,0) + COALESCE(salesNoon,0) + COALESCE(salesDeliveroo,0) + 
            COALESCE(salesCareem,0)) AS totalSales
      FROM daily_accounts
      WHERE accountDate LIKE ?
      GROUP BY MONTH(STR_TO_DATE(accountDate, '%Y-%m-%d'))`,
      [`${year}-%`]
    );

    // Get operational expenses per month matching DailyAccountsPage "تشغيلية" column:
    // Logic mirrors DailyAccountsPage exactly:
    //   - Days with manual data (expensesOperational/expensesMaintenance > 0): use expensesOperational
    //   - Other days: use free_invoices(operational) + supplier invoices grouped by payment date
    const tzOffset = await getBusinessDayTzOffset();

    // 1. Get all daily_accounts for the year to identify manual vs non-manual days
    const [allDailyRows] = await conn.execute(
      `SELECT accountDate,
        COALESCE(expensesOperational,0) AS expensesOperational,
        COALESCE(expensesMaintenance,0) AS expensesMaintenance
      FROM daily_accounts WHERE accountDate LIKE ?`,
      [`${year}-%`]
    );

    // Separate manual days from non-manual days
    const manualDaysByMonth: Record<number, number> = {};
    const nonManualDates = new Set<string>();
    for (const r of allDailyRows as any[]) {
      const m = parseInt(r.accountDate.split('-')[1]);
      const hasManual = parseFloat(r.expensesOperational) > 0 || parseFloat(r.expensesMaintenance) > 0;
      if (hasManual) {
        manualDaysByMonth[m] = (manualDaysByMonth[m] ?? 0) + parseFloat(r.expensesOperational);
      } else {
        nonManualDates.add(r.accountDate);
      }
    }

    // 2. Free invoices operational - only for non-manual days (grouped by payment date)
    const [freeOpRows] = await conn.execute(
      `SELECT
        DATE_FORMAT(CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'), '%Y-%m-%d') AS payDate,
        MONTH(DATE_FORMAT(CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'), '%Y-%m-%d')) AS month,
        SUM(CASE WHEN paymentStatus='partial' THEN paidAmount ELSE totalAmount END) AS total
      FROM free_invoices
      WHERE expenseCategory = 'operational'
        AND paymentStatus IN ('paid','partial')
        AND YEAR(DATE_FORMAT(CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'), '%Y-%m-%d')) = ?
      GROUP BY payDate, month`,
      [year]
    );

    // 3. Supplier invoices - only for non-manual days (grouped by payment date)
    const [supplierInvRows] = await conn.execute(
      `SELECT
        DATE_FORMAT(CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'), '%Y-%m-%d') AS payDate,
        MONTH(DATE_FORMAT(CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'), '%Y-%m-%d')) AS month,
        SUM(totalAmount) AS total
      FROM invoices
      WHERE paymentStatus = 'paid'
        AND YEAR(DATE_FORMAT(CONVERT_TZ(COALESCE(paidAt, updatedAt), '+00:00', '${tzOffset}'), '%Y-%m-%d')) = ?
      GROUP BY payDate, month`,
      [year]
    );

    // Build operational expenses map per month
    // Start with manual days
    const opMap: Record<number, number> = { ...manualDaysByMonth };

    // Build a set of all registered daily account dates for quick lookup
    const allAccountDates = new Set((allDailyRows as any[]).map((d: any) => d.accountDate));

    // Add invoice-based expenses only for non-manual days
    for (const r of freeOpRows as any[]) {
      // Include if: payment date is a non-manual day OR not in daily_accounts at all
      if (nonManualDates.has(r.payDate) || !allAccountDates.has(r.payDate)) {
        opMap[r.month] = (opMap[r.month] ?? 0) + parseFloat(r.total ?? 0);
      }
    }
    for (const r of supplierInvRows as any[]) {
      if (nonManualDates.has(r.payDate) || !allAccountDates.has(r.payDate)) {
        opMap[r.month] = (opMap[r.month] ?? 0) + parseFloat(r.total ?? 0);
      }
    }

    // Attach to daily rows
    const enrichedDaily = (dailyRows as any[]).map((d: any) => ({
      ...d,
      operationalExpenses: opMap[d.month] ?? 0,
      maintenanceExpenses: 0,
    }));
    // Add months that have expenses but no daily_accounts rows
    for (const m of Object.keys(opMap).map(Number)) {
      if (!enrichedDaily.find((d: any) => d.month === m)) {
        enrichedDaily.push({
          month: m,
          totalSales: 0,
          operationalExpenses: opMap[m],
          maintenanceExpenses: 0,
        });
      }
    }

    return { monthly: rows as any[], daily: enrichedDaily };
  } finally {
    await conn.release();
  }
}

// Create a new payment (and optionally copy to other months)
export async function createMonthlyPayment(input: CreateMonthlyPaymentInput) {
  const conn = await getConn();
  try {
    const { copyToMonths, ...data } = input;

    // Determine initial status
    const today = new Date();
    const dueDate = new Date(data.year, data.month - 1, data.dueDay);
    let status: PaymentStatus = "pending";
    if (data.paidAmount && data.paidAmount >= data.totalAmount) {
      status = "paid";
    } else if (today > dueDate) {
      status = "overdue";
    }

    const [result] = await conn.execute(
      `INSERT INTO monthly_payments (name, category, totalAmount, paidAmount, dueDay, month, year, recurrence, status, notes, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.category,
        data.totalAmount,
        data.paidAmount ?? 0,
        data.dueDay,
        data.month,
        data.year,
        data.recurrence,
        status,
        data.notes ?? null,
        data.createdBy ?? null,
      ]
    );

    const insertedId = (result as any).insertId;

    // Copy to other months if requested
    if (copyToMonths && copyToMonths.length > 0) {
      for (const targetMonth of copyToMonths) {
        if (targetMonth === data.month) continue; // skip current month
        const targetYear = targetMonth < data.month ? data.year + 1 : data.year;
        const targetDue = new Date(targetYear, targetMonth - 1, data.dueDay);
        let targetStatus: PaymentStatus = "pending";
        if (today > targetDue) targetStatus = "overdue";

        await conn.execute(
          `INSERT INTO monthly_payments (name, category, totalAmount, paidAmount, dueDay, month, year, recurrence, status, notes, createdBy)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.name,
            data.category,
            data.totalAmount,
            data.dueDay,
            targetMonth,
            targetYear,
            data.recurrence,
            targetStatus,
            data.notes ?? null,
            data.createdBy ?? null,
          ]
        );
      }
    }

    return insertedId;
  } finally {
    await conn.release();
  }
}

// Update an existing payment
export async function updateMonthlyPayment(input: UpdateMonthlyPaymentInput) {
  const conn = await getConn();
  try {
    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name); }
    if (input.category !== undefined) { fields.push("category = ?"); values.push(input.category); }
    if (input.totalAmount !== undefined) { fields.push("totalAmount = ?"); values.push(input.totalAmount); }
    if (input.paidAmount !== undefined) { fields.push("paidAmount = ?"); values.push(input.paidAmount); }
    if (input.dueDay !== undefined) { fields.push("dueDay = ?"); values.push(input.dueDay); }
    if (input.recurrence !== undefined) { fields.push("recurrence = ?"); values.push(input.recurrence); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.notes !== undefined) { fields.push("notes = ?"); values.push(input.notes); }

    if (fields.length === 0) return;

    values.push(input.id);
    await conn.execute(
      `UPDATE monthly_payments SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
  } finally {
    await conn.release();
  }
}

// Mark payment as paid
export async function markPaymentAsPaid(id: number, paidAmount?: number) {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute(
      `SELECT totalAmount FROM monthly_payments WHERE id = ?`,
      [id]
    );
    const payment = (rows as any[])[0];
    if (!payment) throw new Error("Payment not found");

    const amount = paidAmount ?? parseFloat(payment.totalAmount);
    await conn.execute(
      `UPDATE monthly_payments SET paidAmount = ?, status = 'paid', paidAt = NOW() WHERE id = ?`,
      [amount, id]
    );
  } finally {
    await conn.release();
  }
}

// Delete a payment
export async function deleteMonthlyPayment(id: number) {
  const conn = await getConn();
  try {
    await conn.execute(`DELETE FROM monthly_payments WHERE id = ?`, [id]);
  } finally {
    await conn.release();
  }
}

// Delete all payments for a given month/year
export async function deleteMonthlyPaymentsByMonth(month: number, year: number) {
  const conn = await getConn();
  try {
    const [result] = await conn.execute(
      `DELETE FROM monthly_payments WHERE month = ? AND year = ?`,
      [month, year]
    );
    return (result as any).affectedRows;
  } finally {
    await conn.release();
  }
}
