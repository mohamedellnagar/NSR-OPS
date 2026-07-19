/**
 * Monthly accounts — the single source of truth for every monthly figure.
 *
 * This is a PURE function shared by the API, the page and the tests. Do not
 * re-implement any of these formulas anywhere else.
 *
 * The one subtlety worth understanding: food purchases are already contained in
 * `operational` / `nonOperational` (they are ordinary invoices that happen to be
 * categorised FOOD_PURCHASES). The P&L replaces them with the inventory-adjusted
 * `foodCost`, so they are subtracted out via `*ExcludingFood`. Adding
 * `foodPurchases` on top of `foodCost` anywhere would double-count them.
 */

// Money in this project is DECIMAL(12,3). Work in thousandths so repeated
// addition cannot drift the way raw floats do.
const SCALE = 1000;

export function round3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * SCALE) / SCALE;
}

/** Sums a list of money values without accumulating float error. */
export function sumMoney(values: number[]): number {
  let acc = 0;
  for (const v of values) acc += Math.round((Number.isFinite(v) ? v : 0) * SCALE);
  return acc / SCALE;
}

/** Percentages are displayed to 2dp; guard against /0 producing NaN or Infinity. */
export function safePercentage(part: number, whole: number): number {
  if (!whole || !Number.isFinite(whole) || whole <= 0) return 0;
  const pct = (part / whole) * 100;
  return Number.isFinite(pct) ? Math.round(pct * 100) / 100 : 0;
}

// ─── Input ────────────────────────────────────────────────────────────────────
/** One expense as it enters the calculation. `total` is the INVOICE TOTAL, not the paid amount. */
export interface SummaryExpenseInput {
  expenseType: string | null;
  expenseCategoryCode: string | null;
  total: number;
}

export interface SummaryInput {
  year: number;
  month: number;
  sales: {
    cash: number;
    card: number;
    kita: number;
    orders: number;
    careem: number;
    deliveroo: number;
    noon: number;
  };
  staffMeals: number;
  expenses: SummaryExpenseInput[];
  openingInventory: number;
  closingInventory: number;
  discounts: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────
export interface MonthlyAccountsSummary {
  year: number;
  month: number;
  sales: {
    cash: number; card: number; kita: number; orders: number;
    careem: number; deliveroo: number; noon: number;
    totalSales: number;
    totalDiscounts: number;
    netSales: number;
  };
  recordedExpenses: {
    operational: number;
    nonOperational: number;
    unclassified: number;
    totalRecorded: number;
  };
  inventory: {
    openingInventory: number;
    foodPurchases: number;
    closingInventory: number;
    foodCost: number;
    foodCostPercentage: number;
  };
  profits: {
    profitBeforeInventory: number;
    operationalExcludingFood: number;
    nonOperationalExcludingFood: number;
    grossProfitAfterFoodCost: number;
    operatingProfit: number;
    adjustedTotalExpenses: number;
    netProfitAfterInventory: number;
    netProfitMargin: number;
  };
  staffMeals: { total: number; percentage: number };
  warnings: {
    unclassifiedInvoicesCount: number;
    unclassifiedInvoicesAmount: number;
    hasInvalidInventory: boolean;
    negativeOpeningInventory: boolean;
    negativeClosingInventory: boolean;
    negativeFoodCost: boolean;
    closingInventoryTooHigh: boolean;
    discountsExceedSales: boolean;
    /** FOOD_PURCHASES invoices marked NON_OPERATIONAL — needs a human look. */
    nonOperationalFoodPurchasesCount: number;
  };
}

const FOOD = "FOOD_PURCHASES";
const OPERATIONAL = "OPERATIONAL";
const NON_OPERATIONAL = "NON_OPERATIONAL";

export function calculateMonthlyAccountsSummary(input: SummaryInput): MonthlyAccountsSummary {
  const s = input.sales;

  // ── 1. Total sales = the seven channels ──
  const totalSales = sumMoney([s.cash, s.card, s.kita, s.orders, s.careem, s.deliveroo, s.noon]);

  // ── 2/3. Discounts and net sales ──
  const rawDiscounts = round3(Math.max(0, input.discounts));
  const discountsExceedSales = rawDiscounts > totalSales;
  const totalDiscounts = rawDiscounts;
  // Never let bad data produce a negative net sales figure.
  const netSales = round3(Math.max(0, totalSales - totalDiscounts));

  // ── Bucket the expenses in a single pass ──
  // An expense with no expenseType is "unclassified": it is deliberately kept
  // out of every profit figure until a human classifies it.
  let operational = 0;
  let nonOperational = 0;
  let unclassified = 0;
  let unclassifiedCount = 0;
  let foodPurchases = 0;
  let operationalFood = 0;
  let nonOperationalFood = 0;
  let nonOperationalFoodCount = 0;

  for (const e of input.expenses) {
    const amount = Math.round((Number.isFinite(e.total) ? e.total : 0) * SCALE);
    const isFood = e.expenseCategoryCode === FOOD;

    if (e.expenseType === OPERATIONAL) {
      operational += amount;
      if (isFood) operationalFood += amount;
    } else if (e.expenseType === NON_OPERATIONAL) {
      nonOperational += amount;
      if (isFood) {
        nonOperationalFood += amount;
        nonOperationalFoodCount++;
      }
    } else {
      unclassified += amount;
      unclassifiedCount++;
      // Unclassified rows are excluded from foodPurchases too — they are not in
      // the P&L at all, so counting their food value would unbalance foodCost.
      continue;
    }
    if (isFood) foodPurchases += amount;
  }

  const operationalM = operational / SCALE;
  const nonOperationalM = nonOperational / SCALE;
  const unclassifiedM = unclassified / SCALE;
  const foodPurchasesM = foodPurchases / SCALE;

  // ── 6. Recorded expenses (before inventory settlement) ──
  const totalRecorded = round3(operationalM + nonOperationalM);

  // ── 7. Profit before inventory settlement ──
  const profitBeforeInventory = round3(netSales - totalRecorded);

  // ── 9. Actual food cost = opening + purchases - closing ──
  const openingInventory = round3(input.openingInventory);
  const closingInventory = round3(input.closingInventory);
  const foodCost = round3(openingInventory + foodPurchasesM - closingInventory);

  // ── 10. Food cost % of net sales ──
  const foodCostPercentage = safePercentage(foodCost, netSales);

  // ── 11/12. Remaining expenses, with food purchases taken out ──
  // foodCost replaces them below, so leaving them in would double-count.
  const operationalExcludingFood = round3(operationalM - operationalFood / SCALE);
  const nonOperationalExcludingFood = round3(nonOperationalM - nonOperationalFood / SCALE);

  // ── 13/14/15/16 ──
  const grossProfitAfterFoodCost = round3(netSales - foodCost);
  const operatingProfit = round3(grossProfitAfterFoodCost - operationalExcludingFood);
  const adjustedTotalExpenses = round3(
    foodCost + operationalExcludingFood + nonOperationalExcludingFood
  );
  const netProfitAfterInventory = round3(
    netSales - foodCost - operationalExcludingFood - nonOperationalExcludingFood
  );

  // ── 17. Net profit margin ──
  const netProfitMargin = safePercentage(netProfitAfterInventory, netSales);

  // ── 18. Staff meals: an indicator only, never deducted again ──
  const staffMealsTotal = round3(input.staffMeals);

  return {
    year: input.year,
    month: input.month,
    sales: {
      cash: round3(s.cash), card: round3(s.card), kita: round3(s.kita),
      orders: round3(s.orders), careem: round3(s.careem),
      deliveroo: round3(s.deliveroo), noon: round3(s.noon),
      totalSales, totalDiscounts, netSales,
    },
    recordedExpenses: {
      operational: round3(operationalM),
      nonOperational: round3(nonOperationalM),
      unclassified: round3(unclassifiedM),
      totalRecorded,
    },
    inventory: {
      openingInventory,
      foodPurchases: round3(foodPurchasesM),
      closingInventory,
      foodCost,
      foodCostPercentage,
    },
    profits: {
      profitBeforeInventory,
      operationalExcludingFood,
      nonOperationalExcludingFood,
      grossProfitAfterFoodCost,
      operatingProfit,
      adjustedTotalExpenses,
      netProfitAfterInventory,
      netProfitMargin,
    },
    staffMeals: {
      total: staffMealsTotal,
      percentage: safePercentage(staffMealsTotal, netSales),
    },
    warnings: {
      unclassifiedInvoicesCount: unclassifiedCount,
      unclassifiedInvoicesAmount: round3(unclassifiedM),
      hasInvalidInventory:
        openingInventory < 0 ||
        closingInventory < 0 ||
        foodCost < 0 ||
        closingInventory > openingInventory + foodPurchasesM,
      negativeOpeningInventory: openingInventory < 0,
      negativeClosingInventory: closingInventory < 0,
      negativeFoodCost: foodCost < 0,
      closingInventoryTooHigh: closingInventory > openingInventory + foodPurchasesM,
      discountsExceedSales,
      nonOperationalFoodPurchasesCount: nonOperationalFoodCount,
    },
  };
}

/**
 * Independent cross-check of the headline figure, used by the tests and shown
 * in the UI tooltip:
 *   profitBeforeInventory + foodPurchases - foodCost
 * must equal netProfitAfterInventory. If it does not, food purchases are being
 * counted twice somewhere.
 */
export function verifyNetProfit(summary: MonthlyAccountsSummary): number {
  return round3(
    summary.profits.profitBeforeInventory +
      summary.inventory.foodPurchases -
      summary.inventory.foodCost
  );
}

/**
 * A date-only value (an invoice date) turned into an instant that safely lands
 * on THAT day once the business-day rule is applied.
 *
 * The daily view resolves a day as:
 *   DATE( CONVERT_TZ(paidAt,'+00:00','+04:00') - INTERVAL 6 HOUR )
 *
 * so UTC midnight becomes 04:00 Dubai, minus 6h = 22:00 the PREVIOUS day, and
 * the record shows up a day early. 08:00 UTC (noon in Dubai) maps back to
 * 06:00 on the intended day — comfortably inside it, and far from both edges.
 */
export function businessDayInstant(dateOnly: Date): Date {
  return new Date(Date.UTC(
    dateOnly.getUTCFullYear(),
    dateOnly.getUTCMonth(),
    dateOnly.getUTCDate(),
    8, 0, 0
  ));
}
