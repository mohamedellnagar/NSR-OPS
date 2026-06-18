import { TRPCError } from "@trpc/server";
import { sendReportNow, triggerEventSubscriptions } from "./whatsappScheduler";
import { checkFoodCostImpact } from "./foodCostAlert";
import {
  listWaNumbers, getWaNumber, createWaNumber, updateWaNumber, deleteWaNumber,
  testEvolutionConnection, updateWaNumberStatus, fetchEvolutionChats, fetchEvolutionMessages,
  listConversations, listMessages, markConversationRead, upsertConversation, insertWaMessage,
  getConversationByPhone, batchUpsertConversations,
  registerEvolutionWebhook,
  syncAllChatsWithMessages,
} from "./waNumbers";
import { sendDailyAccountNotification } from "./dailyAccountNotification";
import {
  getMonthlyPayments,
  getYearlySummary,
  createMonthlyPayment,
  updateMonthlyPayment,
  markPaymentAsPaid,
  deleteMonthlyPayment,
  deleteMonthlyPaymentsByMonth,
} from "./monthlyPayments-db";
import { checkEvolutionConnection } from "./whatsapp";
import { priceComparisonRouter } from "./priceComparison";
import {
  listTables, createTable, updateTable, deleteTable, clearTable,
  createOrder, getOrderById, listActiveOrders, listOrdersForDate,
  addItemToOrder, updateOrderItem, cancelOrderItem,
  applyOrderDiscount, sendOrderToKitchen, updateItemStatus,
  markOrderServed, cancelOrder, processPayment, processReturn,
  getKitchenQueue, deductOrderIngredients, getKitchenTodayConsumption, getKitchenTodayProduction, getKitchenProductionPanel, getBlockedProductIds, getPosReport,
  searchCustomerByPhone, listCustomers, upsertCustomer, deleteCustomer, updateOrderDeliveryInfo,
} from "./pos-db";
import {
  getTodayServiceStock, getAvailableProducts, setProductionQty,
  batchSetProductionQty, set86d, closeServiceStock, getServiceStockReport,
} from "./kitchen-service-stock-db";
import { generateReport, applyTemplateAsync, generateReportFromFullText, previewFullTextTemplate } from "./reportGenerators";
import mysql from "mysql2/promise";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { SignJWT, jwtVerify } from "jose";
import {
  getUserByEmail,
  getUserById,
  verifyPassword,
  updateLastSignedIn,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  hardDeleteMaterial,
  bulkCreateMaterials,
  resetAllStock,
  resetSingleMaterial,
  updateStockAndPrice,
  deleteAllMaterials,
  getInventoryKpis,
  listTransactions,
  createTransaction,
  deleteTransaction,
  reverseTransaction,
  getDashboardStats,
  getRecentTransactions,
  getLowStockMaterials,
  getInventoryValuationReport,
  getStockMovementReport,
  getSupplierPerformanceReport,
  getMonthlyWasteReport,
  createInvoice, listInvoices, getInvoiceById, updateInvoiceStatus, deleteInvoice, updateInvoice, deleteInvoicePayment,
  logInvoiceAction, getInvoiceAuditLog, postInvoiceToInventory, voidInvoicePayment,
  getWithdrawnMaterialsForDate,
  getKitchenProductionForDate,
  getConsumedMaterialsForDate,
  saveKitchenProduction,
  updateKitchenProductionUsed,
  updateKitchenProduction,
  deleteKitchenProduction,
  saveProductionCount,
  getProductionCounts,
  getKitchenProducts,
  upsertKitchenProduct,
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getRecipeItems,
  addRecipeItem,
  updateRecipeItem,
  deleteRecipeItem,
  clearRecipeItems,
  bulkInsertRecipeItems,
  replaceMaterialInRecipes,
  countMaterialInRecipes,
  getRecipesContainingMaterial,
  bulkUpdateIngredientQuantity,
  listSemiFinishedMaterials,
  getSemiFinishedRecipe,
  addSemiFinishedItem,
  updateSemiFinishedItem,
  deleteSemiFinishedItem,
  clearSemiFinishedRecipe,
  calcSemiFinishedCost,
  produceSemiFinished,
  updateSemiFinishedStatus,
  saveRecipeVersionSnapshot,
  bumpRecipeVersion,
  getRecipeVersionHistory,
  getSemiFinishedUsage,
  duplicateSemiFinishedRecipe,
  getKitchenPullsByDate,
  getKitchenPullsByRange,
  addKitchenPull,
  deleteKitchenPull,
  countKitchenPull,
  uncountKitchenPull,
  closeKitchenPull,
  reopenKitchenPull,
  updateKitchenPullQuantity,
  getWasteLogs,
  addWasteLog,
  deleteWasteLog,
  getAppSettings,
  updateAppSettings,
  getEffectiveOpenAIApiKey,
  getAnalyticsSummary,
  getTopConsumedMaterials,
  getDailyInventoryFlow,
  getSupplierSpendAnalysis,
  getKitchenProductionTrend,
  getCriticalStockMaterials,
  getMonthlyPurchaseTrend,
  getTopProducedSemiFinished,
  getAnalyticsProfitLoss,
  getAnalyticsCOGS,
  createFreeInvoice,
  getFreeInvoices,
  getFreeInvoiceWithItems,
  updateFreeInvoiceStatus,
  deleteFreeInvoice,
  updateFreeInvoice,
  getSemiFinishedOpenPulledDetails,
  getTodayDashboard,
  getMonthlyDailyPerformance,
  getWeeklyTrend,
  getMonthlySalesChart,
  getDailySalesForMonth,
  saveDailyAccount,
  getDailyAccounts,
  getDailyAccountByDate,
  deleteDailyAccount,
  getFreeInvoiceExpensesForDate,
  getPreviousDayCarryForward,
  updateFreeInvoiceExpenseCategory,
  getMonthExpenses,
  calcKitchenPullRawCost,
  getAllInvoicesUnified,
  getFinancialKpi,
  updateOpeningStock,
  closeMonth,
  getInvoiceItemNames,
  getMaterialLedger,
  getAllRecipeItemsForExport,
  getAllSemiFinishedForExport,
  getMaterialPriceHistory,
  saveMenu,
  listSavedMenus,
  getPublicMenu,
  deleteSavedMenu,
  getOrCreateLiveMenuToken,
  updateLiveMenu,
  getMenuByLiveToken,
  getDefaultMenu,
  getLatestSavedMenu,
} from "./db";
import { generateRecipeWithAI } from "./aiChef";
import { importMenuFromUrl, detectPlatform } from "./menuImportConnectors";
import { invokeLLM } from "./_core/llm";
import {
  listButcherProducts,
  createButcherProduct,
  updateButcherProduct,
  deleteButcherProduct,
  getButcherRecipe,
  replaceButcherRecipe,
  deleteButcherRecipeItem,
  listButcherProduction,
  createButcherProduction,
  deleteButcherProduction,
  listButcherWaste,
  createButcherWaste,
  deleteButcherWaste,
  listButcherSales,
  getButcherSaleItems,
  createButcherSale,
  deleteButcherSale,
} from "./butcher-db";
import * as XLSX from "xlsx";
import { calculateConsumption } from "./consumption-db";
import { getKitchenConsumptionReport } from "./kitchen-consumption-db";
import { getSupplierItemsReport } from "./supplier-items-db";
import { getVarianceAnalysis } from "./variance-analysis-db";
import { getPurchaseVsSalesAnalysis } from "./purchase-vs-sales-db";
import {
  getOrInitCountSheet,
  getCountSheet,
  getCountDates,
  updateClosingQty,
  updateReceivedQty,
} from "./kitchen-inventory-db";
import {
  saveSalesReport,
  listSalesReports,
  getSalesReportById,
  deleteSalesReport,
  getSalesConsumptionAnalysis,
  parseSalesCsv,
  getSalesByDate,
  getProductIngredients,
  getBatchIngredientCosts,
  getKitchenProductionCostByDate,
  getRawMaterialsValueByDate,
  getSemiFinishedValueByDate,
  getChickenQtyByDate,
  getSalesVsKitchenProduction,
  getDailyKitchenKPIs,
  getDailyVegetablesUsed,
  getDailySalesConsumptionComparison,
} from "./sales-db";
import { calcProductionRequirements, checkSingleProductFeasibility } from "./production-planning-db";
import { getMenuEngineeringAnalysis } from "./menu-engineering-db";
import { listShifts, createShift, updateShift, deleteShift, getShiftStats } from "./shifts-db";
import {
  listPurchaseOrders,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  sendPurchaseOrderToSupplier,
  autoGeneratePOsForLowStock,
} from "./purchase-orders-db";
import { getExpiringMaterials } from "./db";
import { getDaysOfStock, generateSmartOrderSheet } from "./inventory-intelligence-db";
import { simulatePriceChange, getMaterialPriceHistory, getTopVolatileMaterials } from "./price-simulator-db";
import { getWasteAnalytics } from "./waste-analytics-db";
import { getDailyFlash } from "./daily-flash-db";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "matjari-secret-key-2024");

// ─── Role Middleware ──────────────────────────────────────────────────────────
const warehouseProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot perform write operations" });
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

// ─── Sales Reports Router ────────────────────────────────────────────────────
export const salesRouter = router({
  upload: warehouseProcedure
    .input(z.object({
      csvText: z.string(),
      reportDateFrom: z.string(),
      reportDateTo: z.string(),
      fileName: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return saveSalesReport({
        csvText: input.csvText,
        reportDateFrom: new Date(input.reportDateFrom),
        reportDateTo: new Date(input.reportDateTo),
        fileName: input.fileName,
        notes: input.notes,
        userId: ctx.user.id,
      });
    }),

  list: protectedProcedure.query(() => listSalesReports()),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getSalesReportById(input.id)),

  delete: warehouseProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteSalesReport(input.id)),

  consumption: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .query(({ input }) => getSalesConsumptionAnalysis(input.reportId)),

  preview: protectedProcedure
    .input(z.object({ csvText: z.string() }))
    .mutation(({ input }) => parseSalesCsv(input.csvText)),

  byDate: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getSalesByDate(input.date)),

  ingredients: protectedProcedure
    .input(z.object({ productId: z.number(), soldQty: z.number() }))
    .query(({ input }) => getProductIngredients(input.productId, input.soldQty)),

  batchIngredientCosts: protectedProcedure
    .input(z.object({
      items: z.array(z.object({ productId: z.number(), soldQty: z.number() }))
    }))
    .query(async ({ input }) => {
      const costMap = await getBatchIngredientCosts(input.items);
      // Convert Map to plain object for serialization
      return Object.fromEntries(costMap.entries());
    }),

  kitchenProductionCost: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getKitchenProductionCostByDate(input.date)),



  rawMaterialsValue: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getRawMaterialsValueByDate(input.date)),

  semiFinishedValue: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getSemiFinishedValueByDate(input.date)),

  chickenQty: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getChickenQtyByDate(input.date)),

  dailyKPIs: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getDailyKitchenKPIs(input.date)),
  dailyVegetables: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getDailyVegetablesUsed(input.date)),

  // مقارنة استهلاك المبيعات اليومية مع kitchen_daily_pulls
  dailyConsumptionComparison: protectedProcedure
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(({ input }) => getDailySalesConsumptionComparison(input.date)),
});


// ─── Monthly Payments Router ────────────────────────────────────────────────
export const monthlyPaymentsRouter = router({
  getByMonth: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
    .query(({ input }) => getMonthlyPayments(input.month, input.year)),

  getYearlySummary: protectedProcedure
    .input(z.object({ year: z.number() }))
    .query(({ input }) => getYearlySummary(input.year)),

  create: warehouseProcedure
    .input(z.object({
      name: z.string().min(1),
      category: z.enum(["salaries", "rent", "utilities", "other"]),
      totalAmount: z.number().min(0),
      paidAmount: z.number().min(0).optional(),
      dueDay: z.number().min(1).max(31),
      month: z.number().min(1).max(12),
      year: z.number(),
      recurrence: z.enum(["monthly", "once"]),
      notes: z.string().optional(),
      copyToMonths: z.array(z.number().min(1).max(12)).optional(),
    }))
    .mutation(({ input, ctx }) => createMonthlyPayment({ ...input, createdBy: ctx.user.id })),

  update: warehouseProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      category: z.enum(["salaries", "rent", "utilities", "other"]).optional(),
      totalAmount: z.number().min(0).optional(),
      paidAmount: z.number().min(0).optional(),
      dueDay: z.number().min(1).max(31).optional(),
      recurrence: z.enum(["monthly", "once"]).optional(),
      status: z.enum(["paid", "pending", "overdue"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(({ input }) => updateMonthlyPayment(input)),

  markAsPaid: warehouseProcedure
    .input(z.object({ id: z.number(), paidAmount: z.number().optional() }))
    .mutation(({ input }) => markPaymentAsPaid(input.id, input.paidAmount)),

  delete: warehouseProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteMonthlyPayment(input.id)),

  deleteByMonth: warehouseProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
    .mutation(({ input }) => deleteMonthlyPaymentsByMonth(input.month, input.year)),
});

// ─── Menu Import Router ───────────────────────────────────────────────────────
export const menuImportRouter = router({
  /** استيراد قائمة طعام من رابط منصة توصيل */
  importFromUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        // إنشاء جلسة استيراد
        const platform = detectPlatform(input.url);
        const [sessionRes] = await conn.execute(
          `INSERT INTO menu_import_sessions (sourceUrl, platform, status, createdBy) VALUES (?, ?, 'processing', ?)`,
          [input.url, platform, ctx.user.id]
        ) as [{ insertId: number }, unknown];
        const sessionId = sessionRes.insertId;

        try {
          // تشغيل الاستخراج
          const result = await importMenuFromUrl(input.url);

          if (!result.success || !result.data) {
            await conn.execute(
              `UPDATE menu_import_sessions SET status='failed', errorMessage=? WHERE id=?`,
              [result.error || 'Unknown error', sessionId]
            );
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Extraction failed' });
          }

          const menu = result.data;

          // حفظ الفئات
          const categoryMap: Record<string, number> = {};
          for (let i = 0; i < menu.categories.length; i++) {
            const cat = menu.categories[i];
            const [catRes] = await conn.execute(
              `INSERT INTO imported_menu_categories (sessionId, name, sortOrder) VALUES (?, ?, ?)`,
              [sessionId, cat, i]
            ) as [{ insertId: number }, unknown];
            categoryMap[cat] = catRes.insertId;
          }

          // حفظ العناصر
          for (const item of menu.items) {
            const catId = categoryMap[item.categoryName] || null;
            await conn.execute(
              `INSERT INTO imported_menu_items (sessionId, categoryId, categoryName, name, nameAr, description, price, currency, imageUrl, isAvailable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [sessionId, catId, item.categoryName, item.name, item.nameAr || null, item.description || null,
               item.price, item.currency || 'AED', item.imageUrl || null, item.isAvailable ? 1 : 0]
            );
          }

          // تحديث الجلسة
          await conn.execute(
            `UPDATE menu_import_sessions SET status='done', restaurantName=?, restaurantNameAr=?, restaurantLogoUrl=?, itemCount=?, categoryCount=? WHERE id=?`,
            [menu.restaurantName, menu.restaurantNameAr || null, menu.restaurantLogoUrl || null,
             menu.items.length, menu.categories.length, sessionId]
          );

          return { sessionId, restaurantName: menu.restaurantName, itemCount: menu.items.length, categoryCount: menu.categories.length };
        } catch (err) {
          await conn.execute(
            `UPDATE menu_import_sessions SET status='failed', errorMessage=? WHERE id=?`,
            [err instanceof Error ? err.message : String(err), sessionId]
          );
          throw err;
        }
      } finally {
        await conn.end();
      }
    }),

  /** جلب قائمة جلسات الاستيراد */
  listSessions: protectedProcedure.query(async () => {
    const conn = await mysql.createConnection(process.env.DATABASE_URL!);
    try {
      const [rows] = await conn.execute(
        `SELECT id, sourceUrl, platform, status, restaurantName, restaurantNameAr, restaurantLogoUrl, itemCount, categoryCount, errorMessage, savedToDb, createdAt
         FROM menu_import_sessions ORDER BY createdAt DESC LIMIT 50`
      ) as [Array<Record<string, unknown>>, unknown];
      return rows;
    } finally {
      await conn.end();
    }
  }),

  /** جلب تفاصيل جلسة استيراد (الفئات + العناصر) */
  getSessionItems: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        const [cats] = await conn.execute(
          `SELECT id, name, sortOrder FROM imported_menu_categories WHERE sessionId=? ORDER BY sortOrder`,
          [input.sessionId]
        ) as [Array<Record<string, unknown>>, unknown];
        const [items] = await conn.execute(
          `SELECT id, categoryId, categoryName, name, nameAr, description, price, currency, imageUrl, isAvailable, exported
           FROM imported_menu_items WHERE sessionId=? ORDER BY categoryName, id`,
          [input.sessionId]
        ) as [Array<Record<string, unknown>>, unknown];
        return { categories: cats, items };
      } finally {
        await conn.end();
      }
    }),

  /** حذف جلسة استيراد */
  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        await conn.execute(`DELETE FROM menu_import_sessions WHERE id=?`, [input.sessionId]);
        return { success: true };
      } finally {
        await conn.end();
      }
    }),
});

// ─── Production Planning Router ──────────────────────────────────────────────
export const productionPlanningRouter = router({
  calculate: protectedProcedure
    .input(z.array(z.object({ productId: z.number(), desiredQty: z.number().positive() })))
    .mutation(({ input }) => calcProductionRequirements(input)),

  checkFeasibility: protectedProcedure
    .input(z.object({ productId: z.number(), qty: z.number().positive() }))
    .query(({ input }) => checkSingleProductFeasibility(input.productId, input.qty)),
});

// ─── Menu Engineering Router ──────────────────────────────────────────────────
export const menuEngineeringRouter = router({
  analyze: protectedProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string() }))
    .query(({ input }) => getMenuEngineeringAnalysis(input.fromDate, input.toDate)),
});

// ─── Shifts Router ────────────────────────────────────────────────────────────
export const shiftsRouter = router({
  list: protectedProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string() }))
    .query(({ input }) => listShifts(input.fromDate, input.toDate)),

  stats: protectedProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string() }))
    .query(({ input }) => getShiftStats(input.fromDate, input.toDate)),

  create: warehouseProcedure
    .input(z.object({
      shiftDate: z.string(),
      shiftType: z.enum(["morning", "afternoon", "night"]),
      startTime: z.string(),
      endTime: z.string(),
      notes: z.string().optional(),
      assignments: z.array(z.object({
        employeeName: z.string().min(1),
        employeeNameAr: z.string().optional(),
        role: z.string().optional(),
      })).default([]),
    }))
    .mutation(({ input, ctx }) => createShift({ ...input, createdBy: ctx.user.id })),

  update: warehouseProcedure
    .input(z.object({
      id: z.number(),
      shiftDate: z.string().optional(),
      shiftType: z.enum(["morning", "afternoon", "night"]).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      notes: z.string().optional(),
      assignments: z.array(z.object({
        employeeName: z.string().min(1),
        employeeNameAr: z.string().optional(),
        role: z.string().optional(),
      })).optional(),
    }))
    .mutation(({ input }) => { const { id, ...data } = input; return updateShift(id, data); }),

  delete: warehouseProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deleteShift(input.id)),
});

// ─── Purchase Orders Router ───────────────────────────────────────────────────
export const purchaseOrdersRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      supplierId: z.number().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => listPurchaseOrders(input ?? {})),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getPurchaseOrderById(input.id)),

  create: warehouseProcedure
    .input(z.object({
      supplierId: z.number().optional(),
      supplierName: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        materialId: z.number(),
        materialName: z.string(),
        unit: z.string().optional(),
        requestedQty: z.number().positive(),
        unitPrice: z.number().min(0).optional(),
        notes: z.string().optional(),
      })).min(1),
    }))
    .mutation(({ input, ctx }) => createPurchaseOrder({ ...input, createdBy: ctx.user.id })),

  updateStatus: warehouseProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["draft", "sent", "confirmed", "received", "cancelled"]),
    }))
    .mutation(({ input }) => updatePurchaseOrderStatus(input.id, input.status)),

  delete: warehouseProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deletePurchaseOrder(input.id)),

  sendToSupplier: warehouseProcedure
    .input(z.object({ id: z.number(), waNumberId: z.number() }))
    .mutation(({ input }) => sendPurchaseOrderToSupplier(input.id, input.waNumberId)),

  autoGenerate: warehouseProcedure
    .mutation(({ ctx }) => autoGeneratePOsForLowStock(ctx.user.id)),
});

// ─── Inventory Intelligence Router ───────────────────────────────────────────
export const inventoryIntelligenceRouter = router({
  daysOfStock: protectedProcedure
    .query(() => getDaysOfStock()),

  smartOrderSheet: protectedProcedure
    .input(z.object({ coverDays: z.number().min(1).max(90).optional() }).optional())
    .query(({ input }) => generateSmartOrderSheet(input?.coverDays ?? 14)),
});

// ─── Price Simulator Router ───────────────────────────────────────────────────
export const priceSimulatorRouter = router({
  simulate: protectedProcedure
    .input(z.object({ materialId: z.number(), simulatedPrice: z.number().min(0) }))
    .query(({ input }) => simulatePriceChange(input.materialId, input.simulatedPrice)),

  priceHistory: protectedProcedure
    .input(z.object({ materialId: z.number() }))
    .query(({ input }) => getMaterialPriceHistory(input.materialId)),

  topVolatile: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).optional() }).optional())
    .query(({ input }) => getTopVolatileMaterials(input?.limit ?? 10)),
});

// ─── Waste Analytics Router ───────────────────────────────────────────────────
export const wasteAnalyticsRouter = router({
  analytics: protectedProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string() }))
    .query(({ input }) => getWasteAnalytics(input.fromDate, input.toDate)),
});

// ─── Daily Flash Router ───────────────────────────────────────────────────────
export const dailyFlashRouter = router({
  report: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(({ input }) => getDailyFlash(input.date)),
});

// ─── POS Router ───────────────────────────────────────────────────────────────
export const posRouter = router({
  // Tables
  tables: router({
    list: protectedProcedure.query(() => listTables()),
    create: protectedProcedure
      .input(z.object({
        tableNumber: z.string(),
        label: z.string().optional(),
        capacity: z.number().min(1).max(50).optional(),
        section: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input }) => createTable(input)),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        tableNumber: z.string().optional(),
        label: z.string().optional(),
        capacity: z.number().optional(),
        section: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(({ input: { id, ...data } }) => updateTable(id, data)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteTable(input.id)),
    clear: protectedProcedure
      .input(z.object({ tableId: z.number() }))
      .mutation(({ input }) => clearTable(input.tableId)),
  }),

  // Orders
  orders: router({
    create: protectedProcedure
      .input(z.object({
        tableId: z.number().optional(),
        orderType: z.enum(["dine_in", "takeaway", "delivery"]).optional(),
        waiterId: z.number().optional(),
        guestCount: z.number().min(1).optional(),
        notes: z.string().optional(),
        customerName: z.string().optional(),
        customerPhone: z.string().optional(),
        taxPct: z.number().min(0).max(100).optional(),
      }))
      .mutation(({ input }) => createOrder(input)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getOrderById(input.id)),

    listActive: protectedProcedure.query(() => listActiveOrders()),

    listByDate: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(({ input }) => listOrdersForDate(input.date)),

    addItem: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        productId: z.number(),
        quantity: z.number().min(0.001),
        notes: z.string().optional(),
        course: z.string().optional(),
      }))
      .mutation(({ input }) => addItemToOrder(input.orderId, input)),

    updateItem: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        quantity: z.number().min(0.001).optional(),
        notes: z.string().optional(),
        discountAmount: z.number().min(0).optional(),
      }))
      .mutation(({ input: { itemId, ...data } }) => updateOrderItem(itemId, data)),

    cancelItem: protectedProcedure
      .input(z.object({ itemId: z.number() }))
      .mutation(({ input }) => cancelOrderItem(input.itemId)),

    applyDiscount: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        discountType: z.enum(["fixed", "percentage"]),
        discountValue: z.number().min(0),
      }))
      .mutation(({ input }) => applyOrderDiscount(input.orderId, input.discountType, input.discountValue)),

    sendToKitchen: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(({ input }) => sendOrderToKitchen(input.orderId)),

    markServed: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(({ input }) => markOrderServed(input.orderId)),

    cancel: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(({ input }) => cancelOrder(input.orderId)),

    pay: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        paymentMethod: z.enum(["cash", "card", "transfer", "online"]),
        amount: z.number().min(0),
        cashPaid: z.number().optional(),
        reference: z.string().optional(),
        deductInventory: z.boolean().optional(),
        tipAmount: z.number().min(0).optional(),
        secondPaymentMethod: z.enum(["cash","card","transfer","online"]).optional(),
        secondPaymentAmount: z.number().min(0).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await processPayment(input.orderId, { ...input, processedBy: ctx.user?.id });
        // Save tip + second payment to order
        if (input.tipAmount || input.secondPaymentMethod) {
          const { posOrders: po } = await import('../drizzle/schema');
          const { eq: eq2 } = await import('drizzle-orm');
          const db2 = await (await import('./db')).getDb();
          if (db2 && (input.tipAmount || input.secondPaymentAmount)) {
            await (db2.update(po) as any).set({
              ...(input.tipAmount !== undefined && { tipAmount: String(input.tipAmount) }),
              ...(input.secondPaymentMethod && { secondPaymentMethod: input.secondPaymentMethod }),
              ...(input.secondPaymentAmount !== undefined && { secondPaymentAmount: String(input.secondPaymentAmount) }),
            }).where(eq2(po.id, input.orderId));
          }
        }
        return result;
      }),

    // نقل الطلب لطاولة أخرى
    transferTable: protectedProcedure
      .input(z.object({ orderId: z.number(), newTableId: z.number() }))
      .mutation(async ({ input }) => {
        const { posOrders: po, restaurantTables: rt } = await import('../drizzle/schema');
        const { eq: eq2 } = await import('drizzle-orm');
        const dbInst = await (await import('./db')).getDb();
        if (!dbInst) throw new Error("DB not available");
        const [order] = await dbInst.select({ id: po.id, tableId: po.tableId }).from(po).where(eq2(po.id, input.orderId)).limit(1);
        if (!order) throw new Error("Order not found");
        const oldTableId = order.tableId;
        await dbInst.update(po).set({ tableId: input.newTableId, transferredFromTableId: oldTableId } as any).where(eq2(po.id, input.orderId));
        await dbInst.update(rt).set({ status: "occupied" } as any).where(eq2(rt.id, input.newTableId));
        if (oldTableId) {
          const others = await dbInst.select({ id: po.id }).from(po).where((eq2 as any)(po.tableId, oldTableId));
          if (others.length <= 1) await dbInst.update(rt).set({ status: "available" } as any).where(eq2(rt.id, oldTableId));
        }
        return { success: true };
      }),

    // تسجيل ويتر الطلب
    setWaiter: protectedProcedure
      .input(z.object({ orderId: z.number(), waiterName: z.string() }))
      .mutation(async ({ input }) => {
        const { posOrders: po } = await import('../drizzle/schema');
        const { eq: eq2 } = await import('drizzle-orm');
        const dbInst = await (await import('./db')).getDb();
        if (!dbInst) throw new Error("DB not available");
        await dbInst.update(po).set({ waiterName: input.waiterName } as any).where(eq2(po.id, input.orderId));
        return { success: true };
      }),

    // إلغاء بند بعد الإرسال للمطبخ (Void)
    voidItem: protectedProcedure
      .input(z.object({ itemId: z.number(), reason: z.string() }))
      .mutation(async ({ input }) => {
        const { posOrderItems: poi } = await import('../drizzle/schema');
        const { eq: eq2 } = await import('drizzle-orm');
        const dbInst = await (await import('./db')).getDb();
        if (!dbInst) throw new Error("DB not available");
        await dbInst.update(poi).set({
          isVoided: true,
          voidReason: input.reason,
          voidedAt: new Date(),
          status: "cancelled",
        } as any).where(eq2(poi.id, input.itemId));
        return { success: true };
      }),

    // إضافة Modifiers لبند
    setItemModifiers: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        modifiers: z.array(z.string()),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { posOrderItems: poi } = await import('../drizzle/schema');
        const { eq: eq2 } = await import('drizzle-orm');
        const dbInst = await (await import('./db')).getDb();
        if (!dbInst) throw new Error("DB not available");
        await dbInst.update(poi).set({
          modifiers: input.modifiers,
          notes: input.notes ?? undefined,
        } as any).where(eq2(poi.id, input.itemId));
        return { success: true };
      }),

    return: protectedProcedure
      .input(z.object({
        originalOrderId: z.number(),
        reason: z.string(),
        totalRefund: z.number().min(0),
        refundMethod: z.enum(["cash", "card", "credit"]).optional(),
      }))
      .mutation(({ input, ctx }) =>
        processReturn({ ...input, refundMethod: input.refundMethod ?? "cash", processedBy: ctx.user?.id })
      ),
  }),

  // Kitchen Display
  kitchen: router({
    queue: protectedProcedure.query(() => getKitchenQueue()),
    todayConsumption: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(({ input }) => getKitchenTodayConsumption(input.date)),
    todayProduction: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(({ input }) => getKitchenTodayProduction(input.date)),
    productionPanel: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(({ input }) => getKitchenProductionPanel(input.date)),
    blockedProducts: protectedProcedure
      .query(() => getBlockedProductIds()),
    updateItemStatus: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        status: z.enum(["preparing", "ready", "served"]),
      }))
      .mutation(({ input, ctx }) => updateItemStatus(input.itemId, input.status, ctx.user?.id)),

    // تحضير كل بنود الطلب دفعة واحدة
    markAllReady: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { posOrderItems: poi } = await import('../drizzle/schema');
        const { eq: eq2, ne: ne2, and: and2 } = await import('drizzle-orm');
        const dbInst = await (await import('./db')).getDb();
        if (!dbInst) throw new Error("DB not available");
        const items = await dbInst.select({ id: poi.id }).from(poi)
          .where(and2(eq2(poi.orderId, input.orderId), ne2(poi.status, "cancelled" as any)));
        // Mark all items ready (no deduction inside updateItemStatus)
        for (const item of items) {
          await updateItemStatus(item.id, "ready", ctx.user?.id);
        }
        // Deduct ingredients ONLY here — on explicit "تحضير الكل" press
        await deductOrderIngredients(input.orderId, ctx.user?.id);
        return { count: items.length };
      }),
  }),

  // Reports
  report: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(({ input }) => getPosReport(input.date)),

  // ── Customers ──────────────────────────────────────────────────────────────
  customers: router({
    search: protectedProcedure
      .input(z.object({ phone: z.string() }))
      .query(({ input }) => searchCustomerByPhone(input.phone)),
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(({ input }) => listCustomers(input?.search)),
    upsert: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        phone: z.string().min(1),
        area: z.string().optional(),
        building: z.string().optional(),
        floor: z.string().optional(),
        apartment: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => upsertCustomer(input)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCustomer(input.id)),
  }),

  // تحديث بيانات التوصيل للطلب
  setDeliveryInfo: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      customerName: z.string().min(1),
      customerPhone: z.string().min(1),
      customerArea: z.string().min(1),
      customerBuilding: z.string().min(1),
      customerFloor: z.string().optional(),
      customerApartment: z.string().optional(),
      deliveryNotes: z.string().optional(),
      customerId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { orderId, ...info } = input;
      await updateOrderDeliveryInfo(orderId, info);
      return { success: true };
    }),
});

// ─── Kitchen Service Stock Router ─────────────────────────────────────────────
export const kitchenServiceStockRouter = router({
  /** Today's service stock — used by POS to show availability */
  today: protectedProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(({ input }) => getTodayServiceStock(input?.date)),

  /** For POS: which products are available (not 86'd) and how many remain */
  available: protectedProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(({ input }) => getAvailableProducts(input?.date)),

  /** Set production qty for a single product (morning setup) */
  setQty: protectedProcedure
    .input(z.object({
      productId: z.number(),
      producedQty: z.number().min(0),
      date: z.string().optional(),
      notes: z.string().optional(),
      deductRawMaterials: z.boolean().optional(),
    }))
    .mutation(({ input, ctx }) =>
      setProductionQty({ ...input, createdBy: ctx.user?.id })
    ),

  /** Batch morning setup — kitchen sets all production qtys at once */
  batchSetQty: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        productId: z.number(),
        producedQty: z.number().min(0),
        notes: z.string().optional(),
      })),
      date: z.string().optional(),
      deductRawMaterials: z.boolean().optional(),
    }))
    .mutation(({ input, ctx }) =>
      batchSetProductionQty(input.items, {
        date: input.date,
        deductRawMaterials: input.deductRawMaterials,
        createdBy: ctx.user?.id,
      })
    ),

  /** Manually 86 / un-86 an item */
  set86d: protectedProcedure
    .input(z.object({
      productId: z.number(),
      is86d: z.boolean(),
      date: z.string().optional(),
    }))
    .mutation(({ input }) => set86d(input.productId, input.is86d, input.date)),

  /** End-of-day close */
  closeDay: protectedProcedure
    .input(z.object({
      date: z.string(),
      carryForward: z.boolean().optional(),
    }))
    .mutation(({ input, ctx }) =>
      closeServiceStock(input.date, {
        carryForward: input.carryForward,
        createdBy: ctx.user?.id,
      })
    ),

  /** Full service stock report for a date */
  report: protectedProcedure
    .input(z.object({ date: z.string() }))
    .query(({ input }) => getServiceStockReport(input.date)),
});

export type AppRouter = typeof appRouter;

// ─── App Router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  menuImport: menuImportRouter,
  priceComparison: priceComparisonRouter,
  productionPlanning: productionPlanningRouter,
  menuEngineering: menuEngineeringRouter,
  shifts: shiftsRouter,
  purchaseOrders: purchaseOrdersRouter,
  inventoryIntelligence: inventoryIntelligenceRouter,
  priceSimulator: priceSimulatorRouter,
  wasteAnalytics: wasteAnalyticsRouter,
  dailyFlash: dailyFlashRouter,
  pos: posRouter,
  kitchenServiceStock: kitchenServiceStockRouter,
  // ─── Custom Auth (email + password) ─────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        // ─── Rate limiting ────────────────────────────────────────────────────
        const ip = (ctx.req.headers["x-forwarded-for"] as string || ctx.req.socket?.remoteAddress || "unknown").split(",")[0].trim();
        const { checkLoginRateLimit, recordLoginFailure, recordLoginSuccess } = await import("./_core/index");
        const rateCheck = checkLoginRateLimit(ip);
        if (!rateCheck.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `تم تجاوز عدد محاولات تسجيل الدخول. يرجى المحاولة بعد ${rateCheck.retryAfterSecs} ثانية`,
          });
        }
        const user = await getUserByEmail(input.email);
        if (!user || !user.isActive) {
          recordLoginFailure(ip);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          recordLoginFailure(ip);
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
        recordLoginSuccess(ip);
        await updateLastSignedIn(user.id);

        // Issue JWT session cookie
        const token = await new SignJWT({ sub: String(user.id), role: user.role })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("30d")
          .sign(JWT_SECRET);

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      }),

    // Mobile login — returns JWT token in body instead of cookie
    mobileLogin: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.isActive) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "بيانات الدخول غير صحيحة" });
        }
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "بيانات الدخول غير صحيحة" });
        }
        const token = await new SignJWT({ sub: String(user.id), role: user.role })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("30d")
          .sign(JWT_SECRET);
        return { token, id: user.id, name: user.name, email: user.email, role: user.role };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  dashboard: router({
    stats: protectedProcedure.query(() => getDashboardStats()),
    recent: protectedProcedure.query(() => getRecentTransactions(10)),
    today: protectedProcedure.query(() => getTodayDashboard()),
    monthlyDailyPerformance: protectedProcedure.query(() => getMonthlyDailyPerformance()),
    weeklyTrend: protectedProcedure.query(() => getWeeklyTrend()),
    monthlySalesChart: protectedProcedure.query(() => getMonthlySalesChart()),
    dailySalesForMonth: protectedProcedure
      .input(z.object({ monthKey: z.string() }))
      .query(({ input }) => getDailySalesForMonth(input.monthKey)),
  }),

  // ─── Categories ─────────────────────────────────────────────────────────────
  categories: router({
    list: protectedProcedure.query(() => listCategories()),
    create: warehouseProcedure
      .input(z.object({
        name: z.string().min(1),
        nameAr: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
      }))
      .mutation(({ input }) => createCategory(input)),
    update: warehouseProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        nameAr: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return updateCategory(id, data); }),
    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteCategory(input.id)),
  }),

  // ─── Suppliers ──────────────────────────────────────────────────────────────
  suppliers: router({
    list: protectedProcedure.query(() => listSuppliers()),
    create: warehouseProcedure
      .input(z.object({
        name: z.string().min(1),
        nameAr: z.string().optional(),
        contactPerson: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        address: z.string().optional(),
        notes: z.string().optional(),
        whatsappPhone: z.string().optional(), // for PO automation
      }))
      .mutation(({ input }) => createSupplier(input)),
    update: warehouseProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        nameAr: z.string().optional(),
        contactPerson: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
        whatsappPhone: z.string().optional(),
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return updateSupplier(id, data); }),
    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSupplier(input.id)),
  }),

  // ─── Raw Materials ───────────────────────────────────────────────────────────
  materials: router({
    list: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        categoryId: z.number().optional(),
        lowStock: z.boolean().optional(),
        includeInactive: z.boolean().optional(),
      }).optional())
      .query(({ input }) => listMaterials(input)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getMaterialById(input.id)),
    ledger: protectedProcedure
      .input(z.object({ materialId: z.number(), limit: z.number().min(1).max(1000).default(500) }))
      .query(({ input }) => getMaterialLedger(input.materialId, input.limit)),
    create: warehouseProcedure
      .input(z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        nameAr: z.string().optional(),
        categoryId: z.number().optional(),
        unit: z.string().min(1),
        currentQuantity: z.number().min(0).default(0),
        minimumQuantity: z.number().min(0).default(0),
        reorderQuantity: z.number().min(0).optional(),
        lastPurchasePrice: z.number().min(0).optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        createMaterial({
          ...input,
          currentQuantity: String(input.currentQuantity),
          minimumQuantity: String(input.minimumQuantity),
          reorderQuantity: input.reorderQuantity !== undefined ? String(input.reorderQuantity) : undefined,
          lastPurchasePrice: input.lastPurchasePrice !== undefined ? String(input.lastPurchasePrice) : undefined,
          createdBy: ctx.user.id,
        })
      ),
    update: warehouseProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        nameAr: z.string().optional(),
        categoryId: z.number().optional().nullable(),
        unit: z.string().min(1).optional(),
        minimumQuantity: z.number().min(0).optional(),
        reorderQuantity: z.number().min(0).optional(),
        notes: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, minimumQuantity, reorderQuantity, ...rest } = input;
        return updateMaterial(id, {
          ...rest,
          ...(minimumQuantity !== undefined && { minimumQuantity: String(minimumQuantity) }),
          ...(reorderQuantity !== undefined && { reorderQuantity: String(reorderQuantity) }),
        });
      }),
    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteMaterial(input.id)),
    hardDelete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => hardDeleteMaterial(input.id)),
    bulkImport: warehouseProcedure
      .input(z.object({
        items: z.array(z.object({
          code: z.string().min(1),
          name: z.string().min(1),
          nameAr: z.string().optional(),
          unit: z.string().default("kg"),
          currentQuantity: z.number().min(0).default(0),
          minimumQuantity: z.number().min(0).default(0),
          reorderQuantity: z.number().min(0).optional(),
          lastPurchasePrice: z.number().min(0).optional(),
          notes: z.string().optional(),
        }))
      }))
      .mutation(({ input, ctx }) =>
        bulkCreateMaterials(input.items.map(item => ({ ...item, createdBy: ctx.user.id })))
      ),
    resetAllStock: adminProcedure
      .mutation(() => resetAllStock()),
    resetSingle: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => resetSingleMaterial(input.id)),
    updateStockAndPrice: warehouseProcedure
      .input(z.object({
        id: z.number(),
        currentQuantity: z.number().min(0),
        lastPurchasePrice: z.number().min(0).nullable(),
      }))
      .mutation(async ({ input }) => {
        const oldMat = await getMaterialById(input.id);
        const oldPrice = parseFloat(oldMat?.lastPurchasePrice || "0");
        const result = await updateStockAndPrice(input.id, input.currentQuantity, input.lastPurchasePrice);
        if (input.lastPurchasePrice !== null && input.lastPurchasePrice !== oldPrice) {
          checkFoodCostImpact(input.id, oldPrice, input.lastPurchasePrice).catch(console.error);
        }
        return result;
      }),
    deleteAll: adminProcedure
      .mutation(() => deleteAllMaterials()),
    kpis: protectedProcedure
      .query(() => getInventoryKpis()),
    semiFinishedOpenDetails: protectedProcedure
      .query(() => getSemiFinishedOpenPulledDetails()),
    priceHistory: protectedProcedure
      .input(z.object({
        startDate: z.string(), // ISO date string
        endDate: z.string(),   // ISO date string
        materialIds: z.array(z.number()).optional(),
      }))
      .query(({ input }) => getMaterialPriceHistory({
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        materialIds: input.materialIds,
      })),
    aiAutoCategorize: warehouseProcedure
      .input(z.object({ onlyUncategorized: z.boolean().default(true) }).optional())
      .mutation(async ({ input }) => {
        const { autoCategorizeMaterials } = await import("./aiCategorizer");
        return autoCategorizeMaterials({ onlyUncategorized: input?.onlyUncategorized });
      }),
    aiEnhance: warehouseProcedure
      .input(z.object({
        updateNames: z.boolean().default(true),
        updateCodes: z.boolean().default(true),
        updateThresholds: z.boolean().default(true),
        onlyMissing: z.boolean().default(false),
      }).optional())
      .mutation(async ({ input }) => {
        const { enhanceMaterialsWithAI } = await import("./aiEnhanceMaterials");
        return enhanceMaterialsWithAI(input);
      }),
  }),
  // ─── Inventory Transactionss ──────────────────────────────────────────────────
  inventory: router({
    stockIn: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        quantity: z.number().positive(),
        unitPrice: z.number().min(0).optional(),
        supplierId: z.number().optional(),
        supplierName: z.string().optional(),
        referenceNumber: z.string().optional(),
        transactionDate: z.date(),
        expiryDate: z.string().date().optional(), // FEFO expiry date (YYYY-MM-DD)
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        createTransaction({
          materialId: input.materialId,
          transactionType: "IN",
          quantity: String(input.quantity),
          unitPrice: input.unitPrice !== undefined ? String(input.unitPrice) : undefined,
          totalAmount: input.unitPrice !== undefined ? String(input.quantity * input.unitPrice) : undefined,
          supplierId: input.supplierId,
          supplierName: input.supplierName,
          reason: "purchase",
          referenceNumber: input.referenceNumber,
          transactionDate: input.transactionDate,
          expiryDate: input.expiryDate ?? undefined,
          notes: input.notes,
          createdBy: ctx.user.id,
        })
      ),
    stockOut: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        quantity: z.number().positive(),
        destination: z.string().optional(),
        reason: z.enum(["production", "waste", "transfer", "return", "adjustment", "other"]).optional(),
        referenceNumber: z.string().optional(),
        transactionDate: z.date(),
        notes: z.string().optional(),
        allowNegative: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        // Validate stock availability before withdrawal
        if (!input.allowNegative) {
          const mat = await getMaterialById(input.materialId);
          if (mat) {
            const currentQty = parseFloat(mat.currentQuantity as string);
            if (currentQty < input.quantity) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `الكمية المطلوبة (${input.quantity}) تتجاوز الرصيد المتاح (${currentQty.toFixed(3)}). يرجى مراجعة المخزون.`,
              });
            }
          }
        }
        const txResult = await createTransaction({
          materialId: input.materialId,
          transactionType: "OUT",
          quantity: String(input.quantity),
          destination: input.destination,
          reason: input.reason,
          referenceNumber: input.referenceNumber,
          transactionDate: input.transactionDate,
          notes: input.notes,
          createdBy: ctx.user.id,
        });
        // Check if material dropped below minimum — return flag for client toast
        const matAfter = await getMaterialById(input.materialId);
        const belowMinimum = matAfter
          ? parseFloat(matAfter.currentQuantity as string) <= parseFloat(matAfter.minimumQuantity as string)
          : false;
        return { ...txResult, belowMinimum, materialId: input.materialId };
      }),
    transactions: protectedProcedure
      .input(z.object({
        materialId: z.number().optional(),
        transactionType: z.enum(["IN", "OUT", "ADJUSTMENT"]).optional(),
        reason: z.enum(["purchase", "production", "waste", "transfer", "return", "adjustment", "other","opening_balance"]).optional(),
        movementStatus: z.enum(["draft","posted","reversed","cancelled"]).optional(),
        referenceType: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().min(1).max(1000).default(100),
      }).optional())
      .query(({ input }) =>
        listTransactions({
          materialId: input?.materialId,
          transactionType: input?.transactionType,
          reason: input?.reason,
          movementStatus: input?.movementStatus,
          referenceType: input?.referenceType,
          startDate: input?.dateFrom,
          endDate: input?.dateTo,
          limit: input?.limit,
        })
      ),

    reverseTransaction: warehouseProcedure
      .input(z.object({ id: z.number(), reason: z.string().min(1) }))
      .mutation(({ input, ctx }) => reverseTransaction(input.id, input.reason, ctx.user.id)),

    stockAdjust: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        quantityDelta: z.number().refine((v) => v !== 0, { message: "الكمية يجب أن تكون مختلفة عن الصفر" }),
        reason: z.string().min(1, "السبب مطلوب"),
        notes: z.string().optional(),
        allowNegative: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.quantityDelta < 0 && !input.allowNegative) {
          const mat = await getMaterialById(input.materialId);
          if (mat) {
            const currentQty = parseFloat(mat.currentQuantity as string);
            if (currentQty + input.quantityDelta < 0) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `التسوية ستؤدي إلى رصيد سالب. الرصيد الحالي: ${currentQty.toFixed(3)}`,
              });
            }
          }
        }
        const transactionType = input.quantityDelta > 0 ? "IN" : "OUT";
        const absQty = Math.abs(input.quantityDelta);
        const noteText = input.notes
          ? `[تسوية: ${input.reason}] ${input.notes}`
          : `[تسوية] ${input.reason}`;
        const txId = await createTransaction({
          materialId: input.materialId,
          transactionType,
          quantity: String(absQty),
          reason: "adjustment",
          notes: noteText,
          createdBy: ctx.user.id,
          transactionDate: new Date(),
        });
        const matAfter = await getMaterialById(input.materialId);
        return { txId, materialId: input.materialId, newQuantity: matAfter?.currentQuantity };
      }),
    stockOpeningBalance: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        quantity: z.number().min(0),
        unitPrice: z.number().min(0).optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        createTransaction({
          materialId: input.materialId,
          transactionType: "IN",
          quantity: String(input.quantity),
          unitPrice: input.unitPrice !== undefined ? String(input.unitPrice) : undefined,
          totalAmount: input.unitPrice !== undefined ? String(input.quantity * input.unitPrice) : undefined,
          reason: "opening_balance",
          notes: input.notes,
          createdBy: ctx.user.id,
          transactionDate: new Date(),
        })
      ),
    stockOutLog: protectedProcedure
      .input(z.object({
        materialId: z.number().optional(),
        dateStr: z.string().optional(), // YYYY-MM-DD local date string
        limit: z.number().min(1).max(1000).default(500),
      }).optional())
      .query(({ input }) => {
        return listTransactions({
          transactionType: "OUT",
          materialId: input?.materialId,
          dateStr: input?.dateStr,
          limit: input?.limit ?? 500,
        });
      }),

    deleteTransaction: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteTransaction(input.id)),
  }),

  // ─── Alerts ──────────────────────────────────────────────────────────────────
  alerts: router({
    lowStock: protectedProcedure.query(() => getLowStockMaterials()),
    expiring: protectedProcedure
      .input(z.object({ daysAhead: z.number().min(1).max(90).default(7) }).optional())
      .query(({ input }) => getExpiringMaterials(input?.daysAhead ?? 7)),
  }),

  // ─── Reports ─────────────────────────────────────────────────────────────────
  reports: router({
    monthlyWaste: protectedProcedure
      .input(z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }))
      .query(({ input }) => getMonthlyWasteReport(input.year, input.month)),
    inventoryValuation: protectedProcedure.query(() => getInventoryValuationReport()),
    stockMovement: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ input }) =>
        getStockMovementReport(
          input?.dateFrom ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          input?.dateTo ?? new Date()
        )
      ),
    supplierPerformance: protectedProcedure.query(() => getSupplierPerformanceReport()),
  }),

  // ─── User Management ─────────────────────────────────────────────────────────
  users: router({
    list: adminProcedure.query(() => listUsers()),
    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["admin", "warehouse_manager", "viewer"]),
        allowedPages: z.union([z.array(z.string()), z.record(z.string(), z.enum(["view", "edit"]))]).nullable().optional(),
      }))
      .mutation(({ input }) => createUser(input)),
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        role: z.enum(["admin", "warehouse_manager", "viewer"]).optional(),
        isActive: z.boolean().optional(),
        allowedPages: z.union([z.array(z.string()), z.record(z.string(), z.enum(["view", "edit"]))]).nullable().optional(),
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return updateUser(id, data); }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteUser(input.id)),
  }),

  // ─── Invoice Management ──────────────────────────────────────────────────────────────────────────────
  invoices: router({
    allUnified: protectedProcedure
      .input(z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        month: z.string().optional(),
        paymentStatus: z.string().optional(),
        invoiceType: z.string().optional(),
        search: z.string().optional(),
        paidDateFrom: z.string().optional(),
        paidDateTo: z.string().optional(),
        itemName: z.string().optional(),
      }).optional())
      .query(({ input }) => getAllInvoicesUnified(input ?? undefined)),

    itemNames: protectedProcedure
      .query(() => getInvoiceItemNames()),

    list: protectedProcedure
      .input(z.object({
        paymentStatus: z.enum(["paid", "deferred", "partial", "under_review"]).optional(),
        supplierId: z.number().optional(),
        limit: z.number().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        month: z.string().optional(),
      }).optional())
      .query(({ input }) => listInvoices(input)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getInvoiceById(input.id)),

    create: warehouseProcedure
      .input(z.object({
        supplierId: z.number().optional(),
        supplierName: z.string().optional(),
        supplierInvoiceNumber: z.string().optional(),
        invoiceDate: z.date(),
        dueDate: z.string().optional(), // YYYY-MM-DD
        vatEnabled: z.boolean(),
        vatMode: z.enum(["exclusive","inclusive"]).optional().default("exclusive"),
        invoiceStatus: z.enum(["draft","pending","approved","rejected","cancelled"]).optional().default("approved"),
        paymentStatus: z.enum(["paid", "deferred", "partial", "under_review"]),
        paidAmount: z.number().optional(),
        notes: z.string().optional(),
        expenseCategory: z.enum(["operational", "maintenance", "fixed", "other"]).optional(),
        items: z.array(z.object({
          materialId: z.number(),
          materialName: z.string(),
          materialUnit: z.string(),
          quantity: z.number().positive(),
          unitPrice: z.number().min(0),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Capture old prices before invoice updates them
        const oldPrices = new Map<number, number>();
        for (const item of input.items) {
          const mat = await getMaterialById(item.materialId);
          oldPrices.set(item.materialId, parseFloat(mat?.lastPurchasePrice || "0"));
        }
        const result = await createInvoice({ ...input, createdBy: ctx.user.id });
        // After invoice is saved, check Food Cost impact for each item whose price changed
        for (const item of input.items) {
          const oldPrice = oldPrices.get(item.materialId) ?? 0;
          if (item.unitPrice !== oldPrice) {
            checkFoodCostImpact(item.materialId, oldPrice, item.unitPrice).catch(console.error);
          }
        }
        return result;
      }),

    updateStatus: warehouseProcedure
      .input(z.object({
        id: z.number(),
        paymentStatus: z.enum(["paid", "deferred", "partial", "under_review"]),
        paidAmount: z.number().optional(),
        paidAt: z.string().optional(),
        paymentMethod: z.enum(["cash","bank_transfer","card","cheque","other"]).optional(),
        paymentAccount: z.string().optional(),
        referenceNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await updateInvoiceStatus(
          input.id, input.paymentStatus, input.paidAmount,
          input.paidAt ? new Date(input.paidAt) : undefined,
          { paymentMethod: input.paymentMethod, paymentAccount: input.paymentAccount, referenceNumber: input.referenceNumber, createdBy: ctx.user.id }
        );
        // Log creation
        logInvoiceAction({ invoiceId: result.id, invoiceType: "supplier", invoiceNumber: result.invoiceNumber, action: "created", userId: ctx.user.id, userName: (ctx.user as any).name ?? (ctx.user as any).email }).catch(console.error);
        return result;
      }),

    updateInvoiceStatus: warehouseProcedure
      .input(z.object({
        id: z.number(),
        invoiceStatus: z.enum(["draft","pending","approved","rejected","cancelled"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { invoices } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const [inv] = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, input.id)).limit(1);
        await db.update(invoices).set({ invoiceStatus: input.invoiceStatus as any, updatedAt: new Date() }).where(eq(invoices.id, input.id));
        await logInvoiceAction({ invoiceId: input.id, invoiceType: "supplier", invoiceNumber: inv?.invoiceNumber, action: input.invoiceStatus, userId: ctx.user.id, userName: (ctx.user as any).name ?? (ctx.user as any).email, notes: input.notes });
        return { success: true };
      }),

    voidPayment: warehouseProcedure
      .input(z.object({
        paymentId: z.number(),
        invoiceId: z.number(),
        voidReason: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { voidInvoicePayment } = await import('./db');
        return voidInvoicePayment(input.paymentId, input.invoiceId, "supplier", input.voidReason, ctx.user.id);
      }),

    update: warehouseProcedure
      .input(z.object({
        id: z.number(),
        supplierId: z.number().optional(),
        supplierName: z.string().optional(),
        invoiceDate: z.date(),
        vatEnabled: z.boolean(),
        paymentStatus: z.enum(["paid", "deferred", "partial", "under_review"]),
        paidAmount: z.number().optional(),
        notes: z.string().optional(),
        expenseCategory: z.enum(["operational", "maintenance", "fixed", "other"]).optional(),
        items: z.array(z.object({
          materialId: z.number(),
          materialName: z.string(),
          materialUnit: z.string(),
          quantity: z.number().positive(),
          unitPrice: z.number().min(0),
        })).min(1),
      }))
      .mutation(({ input, ctx }) => updateInvoice({ ...input, updatedBy: ctx.user.id })),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteInvoice(input.id)),

    deletePayment: protectedProcedure
      .input(z.object({ paymentId: z.number() }))
      .mutation(({ input }) => deleteInvoicePayment(input.paymentId, "supplier")),

    getAuditLog: protectedProcedure
      .input(z.object({ invoiceId: z.number(), invoiceType: z.enum(["supplier","free"]).default("supplier") }))
      .query(({ input }) => getInvoiceAuditLog(input.invoiceId, input.invoiceType)),

    postToInventory: warehouseProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(({ input, ctx }) => postInvoiceToInventory(input.invoiceId, ctx.user.id)),

    logAction: protectedProcedure
      .input(z.object({
        invoiceId: z.number(),
        invoiceType: z.enum(["supplier","free"]).default("supplier"),
        invoiceNumber: z.string().optional(),
        action: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => logInvoiceAction({
        ...input,
        userId: ctx.user.id,
        userName: (ctx.user as any).name ?? (ctx.user as any).email,
      })),
  }),
  // ─── Kitchen Daily Production ─────────────────────────────────────────────────
  kitchen: router({
    /** Load withdrawn materials + existing production for a date */
    loadDate: protectedProcedure
      .input(z.object({ date: z.date() }))
      .query(async ({ input }) => {
        console.log('[kitchen.loadDate] input.date:', input.date.toISOString());
        const [withdrawn, productions, consumed] = await Promise.all([
          getWithdrawnMaterialsForDate(input.date),
          getKitchenProductionForDate(input.date),
          getConsumedMaterialsForDate(input.date),
        ]);
        // Merge consumed into withdrawn — waste is now in kitchen_production_materials
        const consumedMap = new Map(consumed.map((c) => [c.rawMaterialId, parseFloat(String(c.totalConsumed))]));
        // Build waste-per-material map from production materials (wasteQty column)
        const wasteByMaterial = new Map<number, number>();
        for (const p of productions) {
          for (const m of (p as any).materials ?? []) {
            const mid = Number(m.rawMaterialId);
            const wq = parseFloat(String(m.wasteQty ?? 0));
            wasteByMaterial.set(mid, (wasteByMaterial.get(mid) ?? 0) + wq);
          }
        }
        const withdrawnWithRemaining = withdrawn.map((w) => {
          const wQty = parseFloat(String(w.withdrawnQty));
          const used = consumedMap.get(w.materialId) ?? 0;
          // wasteQty from production materials table
          const wasteQty = wasteByMaterial.get(w.materialId) ?? 0;
          // remainingQty = withdrawn - consumed - waste
          const remaining = Math.max(0, wQty - used - wasteQty);
          return {
            materialId: Number(w.materialId),
            materialName: String(w.materialName ?? ""),
            materialNameAr: w.materialNameAr ? String(w.materialNameAr) : null,
            unit: String(w.unit ?? ""),
            withdrawnQty: wQty,
            usedInProduction: used,
            wasteQty: wasteQty,
            remainingQty: remaining,
            lastPurchasePrice: w.lastPurchasePrice ? parseFloat(String(w.lastPurchasePrice)) : null,
          };
        });
        const plainProductions = productions.map((p: any) => ({ ...p }));
        // Fetch inventory counts for these productions
        const productionIds = plainProductions.map((p: any) => p.id as number);
        const counts = await getProductionCounts(productionIds);
        const countsMap = new Map(counts.map((c) => [c.productionId, { actualCount: parseFloat(String(c.actualCount)), notes: c.notes ?? null, countedAt: c.countedAt }]));
        const productionsWithCounts = plainProductions.map((p: any) => ({
          ...p,
          inventoryCount: countsMap.get(p.id) ?? null,
        }));
        return { withdrawn: withdrawnWithRemaining, productions: productionsWithCounts };
      }),

    /** Save a new production entry */
    save: warehouseProcedure
      .input(z.object({
        productionDate: z.date(),
        productName: z.string().min(1),
        productNameAr: z.string().optional(),
        unit: z.string().min(1),
        producedQuantity: z.number().positive(),
        notes: z.string().optional(),
        actualUnitCost: z.number().min(0).optional(),
        materials: z.array(z.object({
          rawMaterialId: z.number(),
          materialName: z.string(),
          unit: z.string(),
          consumedQuantity: z.number().positive(),
          wasteQty: z.number().min(0).optional(),
        })),
      }))
      .mutation(({ input, ctx }) => saveKitchenProduction({ ...input, createdBy: ctx.user.id })),

    /** Update used quantity for a production record */
    updateUsed: warehouseProcedure
      .input(z.object({ productionId: z.number(), usedQuantity: z.number().min(0) }))
      .mutation(({ input }) => updateKitchenProductionUsed(input.productionId, input.usedQuantity)),

    /** Update producedQuantity and usedQuantity for a production record */
    updateProduction: warehouseProcedure
      .input(z.object({
        productionId: z.number(),
        producedQuantity: z.number().min(0),
        usedQuantity: z.number().min(0),
      }))
      .mutation(({ input }) => updateKitchenProduction(input.productionId, input.producedQuantity, input.usedQuantity)),
    /** Delete a production record */
    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteKitchenProduction(input.id)),
    /** Save an inventory count (جرد) for a production record */
    saveCount: warehouseProcedure
      .input(z.object({
        productionId: z.number(),
        actualCount: z.number().min(0),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => saveProductionCount({
        productionId: input.productionId,
        actualCount: input.actualCount,
        notes: input.notes,
        countedBy: ctx.user.id,
      })),

    /** Carry-forward actual counted qty of a production item to the next day */
    carryForwardProduction: warehouseProcedure
      .input(z.object({
        productionId: z.number(),
        productName: z.string(),
        productNameAr: z.string().optional(),
        unit: z.string(),
        quantity: z.number().positive(),
        fromDate: z.date(),
      }))
      .mutation(async ({ input, ctx }) => {
        const nextDay = new Date(input.fromDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        nextDay.setUTCHours(12, 0, 0, 0);
        // Create a new production record for the next day
        // The opening balance will be auto-calculated from previous day's closing balance
        return saveKitchenProduction({
          productionDate: nextDay,
          productName: input.productName,
          productNameAr: input.productNameAr,
          unit: input.unit,
          producedQuantity: input.quantity,
          notes: `ترحيل من ${input.fromDate.toISOString().split('T')[0]}`,
          materials: [],
          createdBy: ctx.user.id,
        });
      }),

    /** Waste/discard remaining qty of a withdrawn material on the same day */
    wasteRemaining: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        quantity: z.number().positive(),
        onDate: z.date(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Record as waste on the same date at noon UTC
        const wasteDate = new Date(input.onDate);
        wasteDate.setUTCHours(13, 0, 0, 0); // slightly after noon to appear after carry-forward
        return createTransaction({
          materialId: input.materialId,
          transactionType: "OUT",
          quantity: String(input.quantity),
          reason: "waste",
          notes: `هدر متبقي يوم ${input.onDate.toISOString().split('T')[0]}`,
          transactionDate: wasteDate,
          createdBy: ctx.user.id,
        });
      }),
    /** Get waste summary for a date: materials with waste from production, joined with lastPurchasePrice */
    getWasteSummary: protectedProcedure
      .input(z.object({ date: z.date() }))
      .query(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) return [];
        const { kitchenProductionMaterials, kitchenDailyProduction, rawMaterials } = await import('../drizzle/schema');
        const { eq, and, gte, lte, gt, sql } = await import('drizzle-orm');
        const start = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate(), 0, 0, 0));
        const end   = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate(), 23, 59, 59));
        const rows = await db
          .select({
            materialId: kitchenProductionMaterials.rawMaterialId,
            materialName: rawMaterials.name,
            materialNameAr: rawMaterials.nameAr,
            unit: rawMaterials.unit,
            lastPurchasePrice: rawMaterials.lastPurchasePrice,
            totalWaste: sql<string>`SUM(${kitchenProductionMaterials.wasteQty})`,
          })
          .from(kitchenProductionMaterials)
          .innerJoin(kitchenDailyProduction, eq(kitchenProductionMaterials.productionId, kitchenDailyProduction.id))
          .innerJoin(rawMaterials, eq(kitchenProductionMaterials.rawMaterialId, rawMaterials.id))
          .where(
            and(
              gte(kitchenDailyProduction.productionDate, start),
              lte(kitchenDailyProduction.productionDate, end),
              gt(kitchenProductionMaterials.wasteQty, sql`0`)
            )
          )
          .groupBy(
            kitchenProductionMaterials.rawMaterialId,
            rawMaterials.name,
            rawMaterials.nameAr,
            rawMaterials.unit,
            rawMaterials.lastPurchasePrice
          );
        return rows.map((r) => ({
          materialId: Number(r.materialId),
          materialName: String(r.materialName ?? ''),
          materialNameAr: r.materialNameAr ? String(r.materialNameAr) : null,
          unit: String(r.unit ?? ''),
          lastPurchasePrice: r.lastPurchasePrice ? parseFloat(String(r.lastPurchasePrice)) : 0,
          totalWaste: parseFloat(String(r.totalWaste ?? 0)),
        }));
      }),

    /** Carry-forward remaining qty of a withdrawn material to the next day as a new stock-out */
    carryForward: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        quantity: z.number().positive(),
        fromDate: z.date(),   // the current day
      }))
      .mutation(async ({ input, ctx }) => {
        // Next day at noon UTC
        const nextDay = new Date(input.fromDate);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        nextDay.setUTCHours(12, 0, 0, 0);
        return createTransaction({
          materialId: input.materialId,
          transactionType: "OUT",
          quantity: String(input.quantity),
          reason: "transfer",
          notes: `ترحيل متبقي من ${input.fromDate.toISOString().split('T')[0]} إلى ${nextDay.toISOString().split('T')[0]}`,
          transactionDate: nextDay,
          createdBy: ctx.user.id,
        });
      }),
    /** Get all kitchen products for combobox */
    getProducts: protectedProcedure.query(() => getKitchenProducts()),
    /** Upsert a kitchen product by name */
    addProduct: warehouseProcedure
      .input(z.object({
        name: z.string().min(1),
        nameAr: z.string().optional(),
        unit: z.string().min(1),
      }))
      .mutation(({ input }) => upsertKitchenProduct(input)),
  }),

  // ─── Products (Menu Items) ──────────────────────────────────────────────────
  products: router({
    list: protectedProcedure
      .input(z.object({ isActive: z.boolean().optional() }).optional())
      .query(({ input }) => listProducts(input?.isActive)),
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProductById(input.id)),
    create: warehouseProcedure
      .input(z.object({
        name: z.string().min(1),
        nameAr: z.string().optional(),
        sku: z.string().min(1),
        categoryReference: z.string().optional(),
        price: z.string().optional(),
        cost: z.string().optional(),
        description: z.string().optional(),
        calories: z.number().optional(),
      }))
      .mutation(({ input }) => createProduct(input)),
    update: warehouseProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        sku: z.string().optional(),
        categoryReference: z.string().optional(),
        price: z.string().optional(),
        cost: z.string().optional(),
        description: z.string().optional(),
        calories: z.number().optional(),
        isActive: z.boolean().optional(),
        showInMenu: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateProduct(id, data);
      }),
    toggleShowInMenu: warehouseProcedure
      .input(z.object({ id: z.number(), showInMenu: z.boolean() }))
      .mutation(({ input }) => updateProduct(input.id, { showInMenu: input.showInMenu })),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteProduct(input.id)),

    // إعادة تسمية فئة (تحديث جماعي لكل المنتجات)
    renameCategory: warehouseProcedure
      .input(z.object({ oldName: z.string(), newName: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { products: prod } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const result = await db.update(prod)
          .set({ categoryReference: input.newName })
          .where(eq(prod.categoryReference, input.oldName));
        return { updated: (result as any)[0]?.affectedRows ?? 0 };
      }),

    // تصنيف الأصناف تلقائياً بالذكاء الاصطناعي حسب الاسم والوصف
    aiAutoCategorize: warehouseProcedure
      .input(z.object({ onlyUncategorized: z.boolean().default(true) }).optional())
      .mutation(async ({ input }) => {
        const { autoCategorizeProducts } = await import("./aiCategorizeRecipes");
        return autoCategorizeProducts({ onlyUncategorized: input?.onlyUncategorized });
      }),

    // حذف فئة (إزالتها من كل المنتجات)
    deleteCategory: warehouseProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ input }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { products: prod } = await import('../drizzle/schema');
        const { eq, sql } = await import('drizzle-orm');
        const result = await db.update(prod)
          .set({ categoryReference: sql`NULL` } as any)
          .where(eq(prod.categoryReference, input.name));
        return { updated: (result as any)[0]?.affectedRows ?? 0 };
      }),

    downloadTemplate: protectedProcedure.query(() => {
      const wb = XLSX.utils.book_new();
      const headers = [["name", "nameAr", "description", "descriptionAr", "price", "category", "categoryAr", "calories"]];
      const example = [
        ["Quarter Chicken", "ربع دجاج", "Grilled quarter chicken with rice and salad", "ربع دجاج مشوي مع أرز وسلطة", 25, "Chicken", "دجاج", 550],
        ["Kofta Sandwich", "سندوتش كفتة", "Kofta sandwich with baladi bread", "سندوتش كفتة بالخبز البلدي", 15, "Sandwiches", "سندوتشات", 400],
      ];
      const ws = XLSX.utils.aoa_to_sheet([...headers, ...example]);
      ws["!cols"] = [{ wch: 25 }, { wch: 25 }, { wch: 40 }, { wch: 40 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
      return { base64: buf as string, filename: "menu_template.xlsx" };
    }),

    importFromExcel: warehouseProcedure
      .input(z.object({ base64: z.string() }))
      .mutation(async ({ input }) => {
        const wb = XLSX.read(input.base64, { type: "base64" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const results: { added: number; skipped: number; errors: string[] } = { added: 0, skipped: 0, errors: [] };

        // Helper to generate SKU from product name
        const generateSku = (name: string): string => {
          return name
            .toUpperCase()
            .replace(/[^A-Z0-9\u0600-\u06FF]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .substring(0, 20);
        };

        for (const row of rows) {
          const name = String(row["name"] ?? row["اسم المنتج"] ?? "").trim();
          if (!name) { results.skipped++; continue; }
          // Use provided SKU or auto-generate from name
          const sku = String(row["sku"] ?? row["كود المنتج"] ?? "").trim() || generateSku(name);
          try {
            await createProduct({
              name,
              nameAr: String(row["nameAr"] ?? row["اسم المنتج بالعربي"] ?? "").trim() || undefined,
              sku,
              categoryReference: String(row["category"] ?? row["categoryAr"] ?? row["الفئة"] ?? "").trim() || undefined,
              price: row["price"] !== undefined && row["price"] !== "" ? String(row["price"]) : undefined,
              cost: row["cost"] !== undefined && row["cost"] !== "" ? String(row["cost"]) : undefined,
              description: String(row["descriptionAr"] ?? row["description"] ?? row["الوصف"] ?? "").trim() || undefined,
              calories: row["calories"] ? Number(row["calories"]) || undefined : undefined,
            });
            results.added++;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            results.errors.push(`${name}: ${msg}`);
          }
        }
        return results;
      }),
  }),

  // ─── Recipes ────────────────────────────────────────────────────────────────
  recipes: router({
    getByProduct: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getRecipeItems(input.productId)),
    // ─── Food Cost Report ─────────────────────────────────────────────────────
    getFoodCostReport: protectedProcedure
      .query(async () => {
        const allProducts = await listProducts();
        const productsWithRecipes = allProducts.filter((p: any) => p.recipeSource);
        const results: Array<{
          productId: number;
          productName: string;
          sellingPrice: number;
          totalCost: number;
          foodCostPercent: number;
          ingredients: Array<{
            recipeItemId: number;
            materialId: number;
            materialName: string;
            unit: string;
            recipeQty: number;
            lastPurchasePrice: number;
            ingredientCost: number;
          }>;
        }> = [];
        for (const product of productsWithRecipes) {
          const ingredients = await getProductIngredients(product.id, 1);
          const totalCost = ingredients.reduce((sum: number, ing: any) => sum + ing.totalCost, 0);
          const sellingPrice = parseFloat(String(product.price ?? 0));
          const foodCostPercent = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0;
          const recipeRows = await getRecipeItems(product.id);
          const recipeIdMap = new Map((recipeRows as any[]).map((r: any) => [r.materialId, r.id]));
          results.push({
            productId: product.id,
            productName: product.name,
            sellingPrice,
            totalCost: parseFloat(totalCost.toFixed(4)),
            foodCostPercent: parseFloat(foodCostPercent.toFixed(2)),
            ingredients: ingredients.map((ing: any) => ({
              recipeItemId: recipeIdMap.get(ing.materialId) ?? 0,
              materialId: ing.materialId,
              materialName: ing.materialName,
              unit: ing.unit,
              recipeQty: ing.recipeQty,
              lastPurchasePrice: ing.lastPurchasePrice,
              ingredientCost: ing.totalCost,
            })),
          });
        }
        return results.sort((a, b) => b.foodCostPercent - a.foodCostPercent);
      }),
    // ─── Update ingredient price directly from Food Cost page ────────────────
    updateIngredientPrice: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        newPrice: z.number().min(0),
      }))
      .mutation(async ({ input }) => {
        // Get old price before update for Food Cost impact check
        const oldMat = await getMaterialById(input.materialId);
        const oldPrice = parseFloat(oldMat?.lastPurchasePrice || "0");
        await updateMaterial(input.materialId, {
          lastPurchasePrice: String(input.newPrice),
        });
        // Fire-and-forget: check Food Cost impact and send WhatsApp alert if >1%
        checkFoodCostImpact(input.materialId, oldPrice, input.newPrice).catch(console.error);
        return { success: true };
      }),
    exportAll: protectedProcedure
      .query(async () => {
        // Get all products that have recipes
        const allProducts = await listProducts();
        const productsWithRecipes = allProducts.filter(p => p.recipeSource);
        // For each product, get ingredients with backend-computed costs (same as UI)
        const results: Array<{
          productId: number;
          productName: string;
          productNameAr: string | null;
          sellingPrice: string | null;
          totalRecipeCost: number;
          ingredients: Array<{
            materialId: number;
            materialName: string;
            unit: string;
            recipeQty: number;
            lastPurchasePrice: number;
            ingredientCost: number;
          }>;
        }> = [];
        for (const product of productsWithRecipes) {
          const ingredients = await getProductIngredients(product.id, 1);
          const totalRecipeCost = ingredients.reduce((sum, ing) => sum + ing.totalCost, 0);
          results.push({
            productId: product.id,
            productName: product.name,
            productNameAr: product.nameAr ?? null,
            sellingPrice: product.price ?? null,
            totalRecipeCost: parseFloat(totalRecipeCost.toFixed(4)),
            ingredients: ingredients.map(ing => ({
              materialId: ing.materialId,
              materialName: ing.materialName,
              unit: ing.unit,
              recipeQty: ing.recipeQty,
              lastPurchasePrice: ing.lastPurchasePrice,
              ingredientCost: ing.totalCost,
            })),
          });
        }
        return results;
      }),
    addItem: warehouseProcedure
      .input(z.object({
        productId: z.number(),
        materialId: z.number(),
        quantity: z.string(),
        unit: z.string(),
        wastePercent: z.number().min(0).max(100).default(0),
        notes: z.string().optional(),
        allergens: z.string().optional(),
      }))
      .mutation(({ input }) => addRecipeItem({ ...input, wastePercent: String(input.wastePercent ?? 0) })),
    updateItem: warehouseProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        wastePercent: z.number().min(0).max(100).optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, wastePercent, ...rest } = input;
        return updateRecipeItem(id, {
          ...rest,
          ...(wastePercent !== undefined && { wastePercent: String(wastePercent) }),
        });
      }),
    deleteItem: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteRecipeItem(input.id)),
    clearRecipe: warehouseProcedure
      .input(z.object({ productId: z.number() }))
      .mutation(({ input }) => clearRecipeItems(input.productId)),
    // Add one ingredient to multiple products at once
    addIngredientToMany: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        quantity: z.string(),
        unit: z.string(),
        notes: z.string().optional(),
        productIds: z.array(z.number()).min(1),
        skipExisting: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { materialId, quantity, unit, notes, productIds, skipExisting } = input;
        let added = 0;
        let skipped = 0;
        for (const productId of productIds) {
          if (skipExisting) {
            const existing = await getRecipeItems(productId);
            const alreadyExists = existing.some((r: any) => r.materialId === materialId);
            if (alreadyExists) { skipped++; continue; }
          }
          await addRecipeItem({ productId, materialId, quantity, unit, notes });
          added++;
        }
        return { added, skipped };
      }),
    suggestOffers: protectedProcedure
      .input(z.object({
        productName: z.string(),
        recipeCost: z.number(),
        sellingPrice: z.number(),
        userText: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { productName, recipeCost, sellingPrice, userText } = input;
        const fcPct = sellingPrice > 0 ? ((recipeCost / sellingPrice) * 100).toFixed(1) : "غير محدد";
        const margin = sellingPrice > 0 ? (sellingPrice - recipeCost).toFixed(2) : "غير محدد";
        const systemPrompt = `أنت خبير تسويق وتسعير للمطاعم. مهمتك تحليل بيانات الوصفة واقتراح عروض وكومبو مربحة بناءً على الفود كوست وسعر البيع.
المنتج: ${productName}
تكلفة الوصفة: ${recipeCost.toFixed(2)} د.إ
سعر البيع: ${sellingPrice > 0 ? sellingPrice.toFixed(2) + " د.إ" : "غير محدد"}
فود كوست: ${fcPct}%
هامش الربح: ${margin} د.إ

اقترح 3 عروض أو كومبو مختلفة بأسعار محددة بالدرهم الإماراتي. لكل عرض:
- اسم العرض
- محتوياته (ماذا يتضمن)
- سعره المقترح
- نسبة الربح المتوقعة
- سبب اختياره`;
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
        });
        const content = response.choices?.[0]?.message?.content ?? "";
        return { suggestions: content };
      }),
    designMenuOffer: protectedProcedure
      .input(z.object({
        offerDescription: z.string(),
        restrictToStock: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { offerDescription, restrictToStock } = input;
        // Fetch all available materials with prices from DB
        const materials = await listMaterials();
        const materialsSection = materials.length > 0
          ? `\n\nقائمة المواد الخام المتاحة في المخزون مع وحداتها:\n${materials.map(m => `- id:${m.id} | الاسم: ${m.name} | الوحدة: ${m.unit} | آخر سعر: ${m.lastPurchasePrice ?? '0'} د.إ/${m.unit}`).join("\n")}`
          : "";
        const restrictNote = restrictToStock
          ? "\n\nمهم جداً: استخدم فقط المواد الموجودة في القائمة أعلاه ولا تخترع مواد جديدة."
          : "\n\nيمكنك استخدام المواد من القائمة أعلاه، وإذا احتجت مادة غير موجودة اذكرها بـ id: 0.";
        const systemPrompt = `أنت خبير طاهي مصري متخصص في مطاعم الأكل المصري والشرقي. مهمتك تصميم عروض وكومبو كاملة بوصفات دقيقة لكل صنف.

عند تلقي وصف عرض أو كومبو، أعطِ النتيجة كـ JSON فقط بالشكل التالي:
{
  "offerName": "اسم العرض",
  "servings": 1,
  "dishes": [
    {
      "dishName": "اسم الصنف",
      "preparationMethod": "طريقة التحضير المختصرة",
      "ingredients": [
        {
          "materialId": 123,
          "materialName": "اسم المادة",
          "quantity": 0.25,
          "unit": "kg",
          "notes": "ملاحظة اختيارية"
        }
      ]
    }
  ]
}

القواعد:
1. الكميات لشخص واحد
2. استخدم id المادة من القائمة إن وُجدت، وإلا ضع id: 0
3. أعطِ JSON فقط بدون أي نص إضافي${materialsSection}${restrictNote}`;
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: offerDescription },
          ],
          response_format: { type: "json_object" } as any,
        });
        const rawContent = response.choices?.[0]?.message?.content ?? "{}";
        const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        let parsed: any;
        try { parsed = JSON.parse(content); } catch { parsed = { offerName: "العرض المقترح", dishes: [] }; }
        // Enrich with real prices from DB
        const materialMap = new Map(materials.map(m => [m.id, m]));
        if (parsed.dishes) {
          for (const dish of parsed.dishes) {
            if (dish.ingredients) {
              for (const ing of dish.ingredients) {
                const mat = materialMap.get(ing.materialId);
                if (mat) {
                  ing.materialName = mat.name;
                  ing.unit = mat.unit;
                  ing.lastPurchasePrice = mat.lastPurchasePrice ?? null;
                } else {
                  ing.lastPurchasePrice = null;
                }
              }
            }
          }
        }
        return { offer: parsed };
      }),
    generateWithAI: warehouseProcedure
      .input(z.object({
        productId: z.number(),
        productName: z.string(),
        productCategory: z.string().optional(),
        productDescription: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Get all available raw materials AND semi-finished materials
        const [materials, semiFinishedMaterials] = await Promise.all([
          listMaterials(),
          listSemiFinishedMaterials(),
        ]);
        const rawOptions = materials.map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          materialType: "raw" as const,
        }));
        const semiOptions = semiFinishedMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          materialType: "semi_finished" as const,
        }));
        const materialOptions = [...rawOptions, ...semiOptions];
        // Generate recipe using AI
        const generated = await generateRecipeWithAI(
          input.productName,
          input.productCategory ?? "طعام",
          materialOptions,
          input.productDescription
        );
        // Clear existing recipe items and insert new ones
        await clearRecipeItems(input.productId);
        const items = generated.ingredients.map((ing) => ({
          productId: input.productId,
          materialId: ing.materialId,
          quantity: String(ing.quantity),
          unit: ing.unit,
          notes: ing.notes,
        }));
        const saved = await bulkInsertRecipeItems(items);
        // Update product recipeSource
        await updateProduct(input.productId, { recipeSource: "ai" });
        return { items: saved, notes: generated.notes };
      }),

    generateAllWithAI: warehouseProcedure
      .input(z.object({ overwrite: z.boolean().optional().default(false) }))
      .mutation(async ({ input }) => {
        // Get all active products
        const allProducts = await listProducts();
        // Get all available materials (raw + semi-finished)
        const [materials, semiFinishedMaterials] = await Promise.all([
          listMaterials(),
          listSemiFinishedMaterials(),
        ]);
        const rawOptions = materials.map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          materialType: "raw" as const,
        }));
        const semiOptions = semiFinishedMaterials.map((m) => ({
          id: m.id,
          name: m.name,
          unit: m.unit,
          materialType: "semi_finished" as const,
        }));
        const materialOptions = [...rawOptions, ...semiOptions];

        // Filter products that have NO recipe items yet
        const results: { productId: number; productName: string; success: boolean; count: number; error?: string }[] = [];

        for (const product of allProducts) {
          const existingItems = await getRecipeItems(product.id);
          if (existingItems.length > 0 && !input.overwrite) {
            // Already has a recipe and overwrite is false — skip
            results.push({ productId: product.id, productName: product.nameAr || product.name, success: true, count: existingItems.length });
            continue;
          }
          try {
            const generated = await generateRecipeWithAI(
              product.nameAr || product.name,
              product.categoryReference ?? "طعام",
              materialOptions,
              product.description ?? undefined
            );
            await clearRecipeItems(product.id);
            const items = generated.ingredients.map((ing) => ({
              productId: product.id,
              materialId: ing.materialId,
              quantity: String(ing.quantity),
              unit: ing.unit,
              notes: ing.notes,
            }));
            await bulkInsertRecipeItems(items);
            await updateProduct(product.id, { recipeSource: "ai" });
            results.push({ productId: product.id, productName: product.nameAr || product.name, success: true, count: items.length });
          } catch (err) {
            results.push({ productId: product.id, productName: product.nameAr || product.name, success: false, count: 0, error: String(err) });
          }
        }
        return { results, total: allProducts.length, generated: results.filter(r => r.success && r.count > 0).length };
      }),

    countMaterialUsage: warehouseProcedure
      .input(z.object({ materialId: z.number() }))
      .query(({ input }) => countMaterialInRecipes(input.materialId)),

    getRecipesContainingMaterial: warehouseProcedure
      .input(z.object({ materialId: z.number() }))
      .query(({ input }) => getRecipesContainingMaterial(input.materialId)),

    bulkUpdateIngredientQuantity: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        newQuantity: z.string(),
        newUnit: z.string(),
        recipeItemIds: z.array(z.number()).optional(),
      }))
      .mutation(({ input }) =>
        bulkUpdateIngredientQuantity(input.materialId, input.newQuantity, input.newUnit, input.recipeItemIds)
      ),

    getDailyInventoryPreview: protectedProcedure
      .input(z.object({
        orders: z.array(z.object({
          productId: z.number(),
          quantity: z.number().min(0),
        })),
      }))
      .query(async ({ input }) => {
        if (input.orders.length === 0) return [];
        // Gather recipe items for all requested products
        // Fetch current stock for all materials
        const allMaterials = await listMaterials();
        const stockMap = new Map(allMaterials.map((m) => [m.id, m]));

        const allItems = await Promise.all(
          input.orders.map(async (o) => {
            const items = await getRecipeItems(o.productId);
            return items.map((item) => {
              const mat = stockMap.get(item.materialId);
              return {
                materialId: item.materialId,
                materialName: item.materialName,
                materialNameAr: mat?.nameAr ?? null,
                unit: item.unit,
                needed: Number(item.quantity) * o.quantity,
                currentStock: Number(mat?.currentQuantity ?? 0),
                lastPurchasePrice: Number(item.lastPurchasePrice ?? 0),
              };
            });
          })
        );
        // Merge by materialId
        const map = new Map<number, {
          materialId: number;
          materialName: string;
          materialNameAr: string | null;
          unit: string;
          needed: number;
          currentStock: number;
          lastPurchasePrice: number;
        }>();
        for (const group of allItems) {
          for (const item of group) {
            const existing = map.get(item.materialId);
            if (existing) {
              existing.needed += item.needed;
            } else {
              map.set(item.materialId, { ...item });
            }
          }
        }
        return Array.from(map.values()).map((m) => ({
          ...m,
          remaining: m.currentStock - m.needed,
          sufficient: m.currentStock >= m.needed,
        }));
      }),

    replaceMaterial: warehouseProcedure
      .input(z.object({
        fromMaterialId: z.number(),
        toMaterialId: z.number(),
      }))
      .mutation(async ({ input }) => {
        if (input.fromMaterialId === input.toMaterialId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن استبدال مادة بنفسها" });
        }
        const count = await replaceMaterialInRecipes(input.fromMaterialId, input.toMaterialId);
        return { replacedCount: count };
      }),
  }),

  // ─── Semi-Finished Materials ──────────────────────────────────────────────────
  semiFinished: router({
    list: protectedProcedure.query(() => listSemiFinishedMaterials()),

    getRecipe: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(({ input }) => getSemiFinishedRecipe(input.materialId)),

    addItem: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        ingredientId: z.number(),
        quantity: z.string(),
        unit: z.string(),
        expectedWastePercent: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => addSemiFinishedItem(input)),

    updateItem: warehouseProcedure
      .input(z.object({
        id: z.number(),
        quantity: z.string().optional(),
        unit: z.string().optional(),
        expectedWastePercent: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return updateSemiFinishedItem(id, data as any); }),

    deleteItem: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSemiFinishedItem(input.id)),

    clearRecipe: warehouseProcedure
      .input(z.object({ materialId: z.number() }))
      .mutation(({ input }) => clearSemiFinishedRecipe(input.materialId)),

    copyRecipe: warehouseProcedure
      .input(z.object({ sourceMaterialId: z.number(), targetMaterialId: z.number() }))
      .mutation(async ({ input }) => {
        const sourceRecipe = await getSemiFinishedRecipe(input.sourceMaterialId);
        await clearSemiFinishedRecipe(input.targetMaterialId);
        for (const item of sourceRecipe) {
          await addSemiFinishedItem({
            materialId: input.targetMaterialId,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unit: item.unit,
            notes: item.notes || undefined,
          });
        }
        return getSemiFinishedRecipe(input.targetMaterialId);
      }),

    calcCost: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(({ input }) => calcSemiFinishedCost(input.materialId).then(cost => ({ cost }))),

    calcCostBatch: protectedProcedure
      .input(z.object({ materialIds: z.array(z.number()) }))
      .query(async ({ input }) => {
        const entries = await Promise.all(
          input.materialIds.map(async (id) => {
            const cost = await calcSemiFinishedCost(id);
            return [id, cost] as [number, number];
          })
        );
        return Object.fromEntries(entries) as Record<string, number>;
      }),

    create: warehouseProcedure
      .input(z.object({
        name: z.string().min(1),
        nameAr: z.string().optional(),
        code: z.string().optional(),
        unit: z.string().default("kg"),
        outputQuantity: z.number().positive().default(1),
        shelfLife: z.number().int().positive().optional(),
        storageLocation: z.string().optional(),
        defaultWastePercent: z.number().min(0).max(100).default(0),
        notes: z.string().optional(),
        categoryId: z.number().optional(),
        minimumQuantity: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Auto-generate a unique code if not provided or if duplicate exists
        let code = input.code?.trim() || "";
        if (!code) {
          // Generate from name: take first 3 letters uppercase + timestamp suffix
          const prefix = (input.nameAr || input.name).replace(/[^a-zA-Z\u0600-\u06FF]/g, "").slice(0, 3).toUpperCase() || "SF";
          code = `${prefix}-${Date.now().toString().slice(-5)}`;
        }
        // Ensure uniqueness: if code exists, append random suffix
        const _db = await (await import('./db')).getDb();
        const { rawMaterials: _rm } = await import('../drizzle/schema');
        const { sql: _sql } = await import('drizzle-orm');
        const existing = _db ? await _db.select({ code: _rm.code }).from(_rm).where(_sql`LOWER(${_rm.code}) = LOWER(${code})`) : [];
        if (existing.length > 0) {
          code = `${code}-${Math.floor(Math.random() * 9000) + 1000}`;
        }
        return createMaterial({
          ...input,
          code,
          materialType: "semi_finished",
          currentQuantity: "0",
          outputQuantity: String(input.outputQuantity ?? 1),
          defaultWastePercent: String(input.defaultWastePercent ?? 0),
          minimumQuantity: input.minimumQuantity ?? "0",
          createdBy: ctx.user.id,
        }).then(id => ({ id }));
      }),

    update: warehouseProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        unit: z.string().optional(),
        outputQuantity: z.number().positive().optional(),
        shelfLife: z.number().int().positive().nullable().optional(),
        storageLocation: z.string().nullable().optional(),
        defaultWastePercent: z.number().min(0).max(100).optional(),
        notes: z.string().optional(),
        categoryId: z.number().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { id, outputQuantity, defaultWastePercent, ...rest } = input;
        return updateMaterial(id, {
          ...rest,
          ...(outputQuantity !== undefined && { outputQuantity: String(outputQuantity) }),
          ...(defaultWastePercent !== undefined && { defaultWastePercent: String(defaultWastePercent) }),
        });
      }),

    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteMaterial(input.id)),

    // ── Workflow: status, versioning, approval ─────────────────────────────────
    submitForApproval: warehouseProcedure
      .input(z.object({ id: z.number(), changeLog: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const recipe = await getSemiFinishedRecipe(input.id);
        if (!recipe.length) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تقديم وصفة بدون مكونات — أضف مكوناً على الأقل" });
        await updateSemiFinishedStatus(input.id, "pending", { changeLog: input.changeLog });
      }),

    approve: warehouseProcedure
      .input(z.object({ id: z.number(), changeLog: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        // Validate before approving
        const mat = await getMaterialById(input.id);
        if (!mat) throw new TRPCError({ code: "NOT_FOUND", message: "الوصفة غير موجودة" });
        const recipe = await getSemiFinishedRecipe(input.id);
        if (!recipe.length) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن اعتماد وصفة بدون مكونات" });
        const outputQty = parseFloat((mat as any).outputQuantity ?? "1");
        if (!outputQty || outputQty <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "كمية الناتج المعياري يجب أن تكون أكبر من صفر" });
        const missingCost = recipe.filter((i: any) => !i.lastPurchasePrice || parseFloat(i.lastPurchasePrice) === 0);
        if (missingCost.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `${missingCost.length} مكون بدون سعر: ${missingCost.map((i: any) => i.ingredientName).join(", ")}` });
        // Snapshot + approve
        await saveRecipeVersionSnapshot(input.id, { status: "approved", approvedBy: ctx.user.id, changeLog: input.changeLog });
        await updateSemiFinishedStatus(input.id, "approved", { approvedBy: ctx.user.id, changeLog: input.changeLog });
      }),

    suspend: warehouseProcedure
      .input(z.object({ id: z.number(), changeLog: z.string().optional() }))
      .mutation(({ input }) => updateSemiFinishedStatus(input.id, "suspended", { changeLog: input.changeLog })),

    archiveRecipe: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => updateSemiFinishedStatus(input.id, "archived")),

    createNewVersion: warehouseProcedure
      .input(z.object({ id: z.number(), changeLog: z.string().optional() }))
      .mutation(({ input, ctx }) => bumpRecipeVersion(input.id, ctx.user.id)),

    duplicate: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => duplicateSemiFinishedRecipe(input.id, ctx.user.id).then(id => ({ id }))),

    getVersionHistory: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(({ input }) => getRecipeVersionHistory(input.materialId)),

    getUsage: protectedProcedure
      .input(z.object({ materialId: z.number() }))
      .query(({ input }) => getSemiFinishedUsage(input.materialId)),

    generateWithAI: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        materialName: z.string(),
        materialUnit: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Get all available raw materials (only raw type — not semi_finished to avoid circular refs)
        const materials = await listMaterials();
        const rawOptions = materials
          .filter((m) => m.materialType !== "semi_finished")
          .map((m) => ({
            id: m.id,
            name: m.name,
            unit: m.unit,
            materialType: "raw" as const,
          }));
        // Generate recipe using AI
        const generated = await generateRecipeWithAI(
          input.materialName,
          "مادة مصنّعة",
          rawOptions,
          `هذه مادة مصنّعة (${input.materialUnit ?? ""}) يتم تحضيرها في المطبخ كمكوّن جاهز يُستخدم في الوصفات. أعطني مكوناتها من المواد الخام فقط.`
        );
        // Clear existing recipe and insert new ones
        await clearSemiFinishedRecipe(input.materialId);
        for (const ing of generated.ingredients) {
          await addSemiFinishedItem({
            materialId: input.materialId,
            ingredientId: ing.materialId,
            quantity: String(ing.quantity),
            unit: ing.unit,
            notes: ing.notes,
          });
        }
        return { notes: generated.notes, count: generated.ingredients.length };
      }),

    previewProduce: protectedProcedure
      .input(z.object({
        materialId: z.number(),
        producedQuantity: z.number().positive(),
      }))
      .query(async ({ input }) => {
        const recipe = await getSemiFinishedRecipe(input.materialId);
        if (!recipe || recipe.length === 0) return [];
        const allMaterials = await listMaterials();
        const stockMap = new Map(allMaterials.map((m: any) => [m.id, m]));
        return recipe.map((item: any) => {
          const recipeQty = parseFloat(item.quantity);
          const scaledQty = recipeQty * input.producedQuantity;
          // Inline unit conversion (same logic as convertUnitToBase)
          const r = item.unit.toLowerCase().trim();
          const m = item.ingredientUnit.toLowerCase().trim();
          let deductQty = scaledQty;
          if (m === 'kg') {
            if (r === 'g') deductQty = scaledQty / 1000;
            else if (r === 'mg') deductQty = scaledQty / 1_000_000;
          } else if (m === 'l') {
            if (r === 'ml') deductQty = scaledQty / 1000;
            else if (r === 'cl') deductQty = scaledQty / 100;
            else if (r === 'dl') deductQty = scaledQty / 10;
          }
          const mat = stockMap.get(item.ingredientId) as any;
          const currentStock = parseFloat(mat?.currentQuantity ?? '0');
          return {
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName,
            ingredientNameAr: item.ingredientNameAr,
            recipeUnit: item.unit,
            inventoryUnit: item.ingredientUnit,
            recipeQtyPerUnit: recipeQty,
            scaledQty,
            deductQty,
            currentStock,
            remaining: currentStock - deductQty,
            sufficient: currentStock >= deductQty,
          };
        });
      }),
    produce: warehouseProcedure
      .input(z.object({
        materialId: z.number(),
        producedQuantity: z.number().positive(),
        actualYield: z.number().positive().optional(),
        notes: z.string().optional(),
        addToPulls: z.boolean().optional().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await produceSemiFinished({
          materialId: input.materialId,
          producedQuantity: input.producedQuantity,
          actualYield: input.actualYield,
          notes: input.notes,
          createdBy: ctx.user.id,
          addToPulls: input.addToPulls,
        });
        // إرسال إشعار واتساب عبر نظام الاشتراكات فقط
        calcKitchenPullRawCost(result.materialId, 'semi_finished', result.producedQuantity)
          .then((totalCost) => {
            const unitCost = result.producedQuantity > 0 ? totalCost / result.producedQuantity : 0;
            const variables: Record<string, string> = {
              material_name: result.materialName,
              produced_quantity: String(result.producedQuantity),
              actual_yield: result.actualYield != null ? String(result.actualYield) : '',
              unit: result.unit,
              total_cost: totalCost > 0 ? totalCost.toFixed(3) : '',
              unit_cost: unitCost > 0 ? unitCost.toFixed(3) : '',
              date: new Date().toLocaleDateString('ar-EG'),
              deductions: result.deductions.map((d: any) =>
                `${d.ingredientNameAr || d.ingredientName}: ${d.deductQty} ${d.unit}`
              ).join(', '),
            };
            return triggerEventSubscriptions('kitchen_production', variables);
          })
          .catch(() => {});
        return result;
      }),
    exportAll: protectedProcedure
      .query(() => getAllSemiFinishedForExport()),
  }),

  // ─── Kitchen Daily Pulls ─────────────────────────────────────────────────────
  kitchenPulls: router({
     getByDate: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(({ input }) => getKitchenPullsByDate(input.date)),
    getByRange: protectedProcedure
      .input(z.object({ from: z.string(), to: z.string() }))
      .query(({ input }) => getKitchenPullsByRange(input.from, input.to)),
    salesVsKitchen: protectedProcedure
      .input(z.object({ from: z.string(), to: z.string() }))
      .query(({ input }) => getSalesVsKitchenProduction(input.from, input.to)),
    add: warehouseProcedure
      .input(z.object({
        pullDate: z.string(),
        materialId: z.number(),
        materialName: z.string(),
        materialNameAr: z.string().optional(),
        materialType: z.string().default("raw"),
        unit: z.string(),
        pulledQuantity: z.string(),
        actualYield: z.string().optional(), // الإنتاج الفعلي (مختلف عن الخام)
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const pullId = await addKitchenPull({
          ...input,
          pullDate: new Date(input.pullDate),
          createdBy: ctx.user.id,
        });
        // إرسال إشعار واتساب عبر نظام الاشتراكات فقط
        const pulledQty = parseFloat(input.pulledQuantity) || 0;
        const unitCost = await calcKitchenPullRawCost(
          input.materialId,
          input.materialType,
          1
        ).catch(() => 0);
        const pullVariables: Record<string, string> = {
          material_name: input.materialNameAr || input.materialName,
          material_type: input.materialType,
          pulled_quantity: String(pulledQty),
          actual_yield: input.actualYield ?? '',
          unit: input.unit,
          unit_cost: unitCost > 0 ? unitCost.toFixed(3) : '',
          date: new Date().toLocaleDateString('ar-EG'),
        };
        triggerEventSubscriptions('kitchen_pull', pullVariables).catch(() => {});
        return pullId;
      }),

    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteKitchenPull(input.id)),

    count: warehouseProcedure
      .input(z.object({
        id: z.number(),
        remainingQty: z.string().default("0"),
        wasteQty: z.string().default("0"),
        carriedRawQty: z.string().optional(),
        notes: z.string().optional(), // سبب الهدر
      }))
      .mutation(({ input, ctx }) =>
        countKitchenPull(input.id, input.remainingQty, input.wasteQty, ctx.user.id, input.carriedRawQty, input.notes)
      ),

    uncount: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) =>
        uncountKitchenPull(input.id, ctx.user.id)
      ),

    close: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => closeKitchenPull(input.id)),
    reopen: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => reopenKitchenPull(input.id, ctx.user.id)),
    updateQuantity: adminProcedure
      .input(z.object({
        id: z.number(),
        newQuantity: z.string(),
        newActualYield: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        updateKitchenPullQuantity(input.id, input.newQuantity, ctx.user.id, input.newActualYield)
      ),
  }),

  // ─── Waste Logs ───────────────────────────────────────────────────────────────────
  waste: router({
    list: protectedProcedure
      .input(z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        source: z.enum(["kitchen", "raw_material", "semi_finished"]).optional(),
      }).optional())
      .query(({ input }) => getWasteLogs(input ?? {})),

    add: warehouseProcedure
      .input(z.object({
        wasteDate: z.string(),
        materialId: z.number(),
        materialName: z.string(),
        materialNameAr: z.string().optional(),
        unit: z.string(),
        wasteQty: z.string(),
        unitCost: z.string().optional(),
        source: z.enum(["kitchen", "raw_material", "semi_finished"]),
        reason: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) =>
        addWasteLog({
          ...input,
          wasteDate: new Date(input.wasteDate),
          createdBy: ctx.user.id,
        })
      ),

    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteWasteLog(input.id)),
  }),

  // ─── App Settings ─────────────────────────────────────────────────────────
  settings: router({
    get: protectedProcedure.query(async () => {
      const settings = await getAppSettings();
      if (!settings) return settings;
      const { openaiApiKey, ...rest } = settings as any;
      return rest;
    }),
    update: adminProcedure
      .input(z.object({
        restaurantName: z.string().min(1).optional(),
        restaurantNameEn: z.string().optional(),
        phone: z.string().optional(),
        phone2: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        address: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        timezone: z.string().optional(),
        businessDayStartHour: z.number().min(0).max(23).optional(),
        currency: z.string().optional(),
        currencySymbol: z.string().optional(),
        vatRate: z.string().optional(),
        vatEnabled: z.boolean().optional(),
        openaiApiKey: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { openaiApiKey, ...rest } = input;
        const data: any = { ...rest };
        if (openaiApiKey !== undefined) {
          data.openaiApiKey = openaiApiKey.trim() ? openaiApiKey.trim() : null;
        }
        return updateAppSettings(data);
      }),
    openaiKeyStatus: adminProcedure.query(async () => {
      const settings = await getAppSettings();
      const dbKey = (settings as any)?.openaiApiKey as string | null | undefined;
      const envKey = process.env.OPENAI_API_KEY || null;
      const effective = await getEffectiveOpenAIApiKey();
      const mask = (key: string) => (key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "****");
      return {
        configured: Boolean(effective),
        source: dbKey ? "database" : envKey ? "env" : "none",
        masked: effective ? mask(effective) : null,
      };
    }),
    syncFromCloud: adminProcedure
      .mutation(async () => {
        if (!process.env.CLOUD_DATABASE_URL) {
          throw new Error("CLOUD_DATABASE_URL غير مُعد في ملف .env");
        }
        const { syncFromCloud } = await import("./cloud-sync");
        return await syncFromCloud();
      }),
    cloudTableStats: adminProcedure
      .query(async () => {
        if (!process.env.CLOUD_DATABASE_URL) throw new Error("CLOUD_DATABASE_URL غير مُعد");
        const mysql = await import("mysql2/promise");
        const cloud = await mysql.default.createConnection(process.env.CLOUD_DATABASE_URL);
        try {
          const [tables] = await cloud.query(
            "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY TABLE_NAME"
          ) as any[];
          // Specific kitchen production check
          const kitchenTables = (tables as any[]).filter((t: any) =>
            (t.TABLE_NAME || t.table_name || "").includes("kitchen")
          );
          const stats = [];
          for (const t of kitchenTables) {
            const name = t.TABLE_NAME || t.table_name;
            const [cnt] = await cloud.query(`SELECT COUNT(*) as c FROM \`${name}\``) as any[];
            const [cols] = await cloud.query(
              `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ORDINAL_POSITION`,
              [name]
            ) as any[];
            stats.push({
              table: name,
              rows: Number((cnt as any[])[0]?.c || 0),
              columns: (cols as any[]).map((c: any) => c.COLUMN_NAME || c.column_name),
            });
          }
          return { allTables: (tables as any[]).map((t: any) => ({ name: t.TABLE_NAME || t.table_name, rows: t.TABLE_ROWS })), kitchenDetails: stats };
        } finally {
          await cloud.end().catch(() => {});
        }
      }),
    smartSyncFromCloud: adminProcedure
      .mutation(async () => {
        if (!process.env.CLOUD_DATABASE_URL) {
          throw new Error("CLOUD_DATABASE_URL غير مُعد في ملف .env");
        }
        const { smartSyncFromCloud } = await import("./cloud-sync");
        return await smartSyncFromCloud();
      }),
    importSyncFile: adminProcedure
      .input(z.object({ payload: z.any() }))
      .mutation(async ({ input }) => {
        const { importSyncData } = await import("./sync-import");
        return await importSyncData(input.payload);
      }),
    exportSyncData: adminProcedure
      .query(async () => {
        const { exportSyncData } = await import("./sync-export");
        return await exportSyncData();
      }),
    downloadSyncTemplate: adminProcedure
      .query(async () => {
        const { generateSyncTemplate } = await import("./sync-template");
        const buf = await generateSyncTemplate();
        return { base64: buf.toString("base64"), filename: `sync-template-${new Date().toISOString().slice(0,10)}.xlsx` };
      }),
    importSyncExcel: adminProcedure
      .input(z.object({ base64: z.string() }))
      .mutation(async ({ input }) => {
        const { importFromSyncExcel } = await import("./sync-template");
        const buf = Buffer.from(input.base64, "base64");
        return await importFromSyncExcel(buf);
      }),
    cloudSyncStatus: adminProcedure
      .query(() => ({
        enabled: Boolean(process.env.CLOUD_DATABASE_URL),
        // mask the host so it's safe to show in the UI
        cloudHost: process.env.CLOUD_DATABASE_URL
          ? new URL(process.env.CLOUD_DATABASE_URL.replace(/\?.*$/, "")).host
          : null,
      })),
    autoSyncStatus: adminProcedure
      .query(async () => {
        const { getAutoSyncStatus } = await import("./cloudAutoSync");
        return getAutoSyncStatus();
      }),
    setAutoSyncEnabled: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        const { setAutoSyncEnabled, getAutoSyncStatus } = await import("./cloudAutoSync");
        setAutoSyncEnabled(input.enabled);
        return getAutoSyncStatus();
      }),
  }),

  // ─── Butcher Shop (ملحمة) ───────────────────────────────────────────────────
  butcher: router({
    listProducts: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(({ input }) => listButcherProducts(input?.activeOnly ?? true)),

    createProduct: warehouseProcedure
      .input(z.object({
        name: z.string().min(1),
        nameAr: z.string().optional(),
        unit: z.string().min(1),
        pricePerUnit: z.string(),
        soldByWeight: z.boolean(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => createButcherProduct({ ...input, createdBy: ctx.user.id })),

    updateProduct: warehouseProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        unit: z.string().optional(),
        pricePerUnit: z.string().optional(),
        soldByWeight: z.boolean().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => { const { id, ...data } = input; return updateButcherProduct(id, data); }),

    deleteProduct: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteButcherProduct(input.id)),

    getRecipe: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getButcherRecipe(input.productId)),

    replaceRecipe: warehouseProcedure
      .input(z.object({
        productId: z.number(),
        items: z.array(z.object({
          materialId: z.number(),
          quantity: z.string(),
          unit: z.string(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(({ input }) => replaceButcherRecipe(input.productId, input.items)),

    deleteRecipeItem: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteButcherRecipeItem(input.id)),

    listProduction: protectedProcedure
      .input(z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        productId: z.number().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input }) => listButcherProduction(input ?? {})),

    createProduction: warehouseProcedure
      .input(z.object({
        productionDate: z.date(),
        productId: z.number(),
        productName: z.string(),
        productNameAr: z.string().optional(),
        unit: z.string(),
        producedQuantity: z.string(),
        notes: z.string().optional(),
        materials: z.array(z.object({
          rawMaterialId: z.number(),
          materialName: z.string(),
          unit: z.string(),
          consumedQuantity: z.string(),
        })),
      }))
      .mutation(({ input, ctx }) => createButcherProduction({ ...input, createdBy: ctx.user.id })),

    deleteProduction: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input, ctx }) => deleteButcherProduction(input.id, ctx.user.id)),

    listWaste: protectedProcedure
      .input(z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input }) => listButcherWaste(input ?? {})),

    createWaste: warehouseProcedure
      .input(z.object({
        wasteDate: z.date(),
        itemType: z.enum(["raw_material", "butcher_product"]),
        rawMaterialId: z.number().optional(),
        butcherProductId: z.number().optional(),
        itemName: z.string(),
        unit: z.string(),
        wasteQty: z.string(),
        unitCost: z.string().optional(),
        totalCost: z.string().optional(),
        reason: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => createButcherWaste({ ...input, createdBy: ctx.user.id })),

    deleteWaste: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteButcherWaste(input.id)),

    listSales: protectedProcedure
      .input(z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input }) => listButcherSales(input ?? {})),

    getSaleItems: protectedProcedure
      .input(z.object({ saleId: z.number() }))
      .query(({ input }) => getButcherSaleItems(input.saleId)),

    createSale: protectedProcedure
      .input(z.object({
        saleDate: z.date(),
        paymentMethod: z.enum(["cash", "card", "transfer"]),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number(),
          productName: z.string(),
          unit: z.string(),
          soldByWeight: z.boolean(),
          quantity: z.string(),
          pricePerUnit: z.string(),
          totalPrice: z.string(),
        })),
      }))
      .mutation(({ input, ctx }) => createButcherSale({ ...input, createdBy: ctx.user.id })),

    deleteSale: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteButcherSale(input.id)),
  }),

  // ─── Analytics ────────────────────────────────────────────────────────────
  analytics: router({
    summary: protectedProcedure.query(() => getAnalyticsSummary()),
    topConsumed: protectedProcedure
      .input(z.object({ days: z.number().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => getTopConsumedMaterials(input?.days ?? 30, input?.limit ?? 10)),
    dailyFlow: protectedProcedure
      .input(z.object({ days: z.number().optional() }).optional())
      .query(({ input }) => getDailyInventoryFlow(input?.days ?? 14)),
    supplierSpend: protectedProcedure.query(() => getSupplierSpendAnalysis()),
    kitchenTrend: protectedProcedure
      .input(z.object({ days: z.number().optional() }).optional())
      .query(({ input }) => getKitchenProductionTrend(input?.days ?? 7)),
    criticalStock: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ input }) => getCriticalStockMaterials(input?.limit ?? 15)),
    monthlyPurchases: protectedProcedure
      .input(z.object({ months: z.number().optional() }).optional())
      .query(({ input }) => getMonthlyPurchaseTrend(input?.months ?? 6)),
    topSemiFinished: protectedProcedure
      .input(z.object({ days: z.number().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => getTopProducedSemiFinished(input?.days ?? 30, input?.limit ?? 8)),
    profitLoss: protectedProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }).optional())
      .query(({ input }) => getAnalyticsProfitLoss(input ?? undefined)),
    cogs: protectedProcedure
      .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }).optional())
      .query(({ input }) => getAnalyticsCOGS(input ?? undefined)),
  }),
  sales: salesRouter,
  monthlyPayments: monthlyPaymentsRouter,
  freeInvoices: router({
    list: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(), // YYYY-MM-DD business day
        endDate: z.string().optional(),   // YYYY-MM-DD business day
        paymentStatus: z.string().optional(),
        supplierType: z.string().optional(),
      }).optional())
      .query(({ input }) => getFreeInvoices({
        // نمرر التاريخ كـ string مباشرة، والتحويل يتم في MySQL باستخدام CONVERT_TZ
        startDate: input?.startDate,
        endDate: input?.endDate,
        paymentStatus: input?.paymentStatus,
        supplierType: input?.supplierType,
      })),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getFreeInvoiceWithItems(input.id)),

    create: protectedProcedure
      .input(z.object({
        supplierName: z.string().min(1),
        supplierType: z.enum(["supplier", "service"]),
        invoiceNumber: z.string().optional(),
        date: z.string(),
        vatPct: z.number().min(0).max(100).default(0),
        paymentStatus: z.enum(["paid", "deferred", "partial", "under_review"]),
        paidAmount: z.number().optional(),
        notes: z.string().optional(),
        expenseCategory: z.enum(["operational", "maintenance", "fixed", "other"]).optional(),
        items: z.array(z.object({
          description: z.string().min(1),
          qty: z.number().positive(),
          unitPrice: z.number().min(0),
        })).min(1),
      }))
      .mutation(async ({ input }) => {
        const invoiceId = await createFreeInvoice({
          ...input,
          date: new Date(input.date),
        });
        return invoiceId;
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        paymentStatus: z.enum(["paid", "deferred", "partial", "under_review"]),
        paidAmount: z.number().optional(),
        paidAt: z.string().optional(),
        paymentMethod: z.enum(["cash","bank_transfer","card","cheque","other"]).optional(),
        paymentAccount: z.string().optional(),
        referenceNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await updateFreeInvoiceStatus(input.id, input.paymentStatus, input.paidAmount,
          input.paidAt ? new Date(input.paidAt) : undefined,
          { paymentMethod: input.paymentMethod, paymentAccount: input.paymentAccount, referenceNumber: input.referenceNumber, createdBy: ctx.user.id }
        );
        return { success: true };
      }),

    updateInvoiceStatus: warehouseProcedure
      .input(z.object({
        id: z.number(),
        invoiceStatus: z.enum(["draft","pending","approved","rejected","cancelled"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await (await import('./db')).getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });
        const { freeInvoices } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const [inv] = await db.select({ invoiceNumber: freeInvoices.invoiceNumber }).from(freeInvoices).where(eq(freeInvoices.id, input.id)).limit(1);
        await db.update(freeInvoices).set({ invoiceStatus: input.invoiceStatus as any, updatedAt: new Date() }).where(eq(freeInvoices.id, input.id));
        await logInvoiceAction({ invoiceId: input.id, invoiceType: "free", invoiceNumber: inv?.invoiceNumber ?? undefined, action: input.invoiceStatus, userId: ctx.user.id, userName: (ctx.user as any).name ?? (ctx.user as any).email, notes: input.notes });
        return { success: true };
      }),

    getAuditLog: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(({ input }) => getInvoiceAuditLog(input.invoiceId, "free")),

    voidPayment: warehouseProcedure
      .input(z.object({ paymentId: z.number(), invoiceId: z.number(), voidReason: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { voidInvoicePayment } = await import('./db');
        return voidInvoicePayment(input.paymentId, input.invoiceId, "free", input.voidReason, ctx.user.id);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteFreeInvoice(input.id)),

    deletePayment: protectedProcedure
      .input(z.object({ paymentId: z.number() }))
      .mutation(({ input }) => deleteInvoicePayment(input.paymentId, "free")),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        supplierName: z.string().min(1),
        date: z.string(),
        expenseCategory: z.enum(["operational", "maintenance", "fixed", "other"]).optional(),
        vatPct: z.number().min(0).max(100).default(0),
        paymentStatus: z.enum(["paid", "deferred", "partial", "under_review"]),
        paidAmount: z.number().optional(),
        notes: z.string().optional(),
        items: z.array(z.object({
          description: z.string().min(1),
          qty: z.number().positive(),
          unitPrice: z.number().min(0),
        })).min(1),
      }))
      .mutation(({ input }) => updateFreeInvoice(input)),
  }),

  // ─── WhatsApp Scheduled Reports ──────────────────────────────────────────────
  whatsapp: router({
    getSettings: protectedProcedure.query(async () => {
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        const [rows] = await conn.execute("SELECT id, evolutionApiUrl, evolutionInstance, isConfigured, updatedAt FROM whatsapp_settings LIMIT 1");
        return (rows as any[])[0] ?? null;
      } finally { await conn.end(); }
    }),
    saveSettings: protectedProcedure
      .input(z.object({
        evolutionApiUrl: z.string().url(),
        evolutionApiKey: z.string().min(1),
        evolutionInstance: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const [existing] = await conn.execute("SELECT id FROM whatsapp_settings LIMIT 1");
          if ((existing as any[]).length) {
            await conn.execute(
              "UPDATE whatsapp_settings SET evolutionApiUrl=?, evolutionApiKey=?, evolutionInstance=?, isConfigured=1 WHERE id=?",
              [input.evolutionApiUrl, input.evolutionApiKey, input.evolutionInstance, (existing as any[])[0].id]
            );
          } else {
            await conn.execute(
              "INSERT INTO whatsapp_settings (evolutionApiUrl, evolutionApiKey, evolutionInstance, isConfigured) VALUES (?,?,?,1)",
              [input.evolutionApiUrl, input.evolutionApiKey, input.evolutionInstance]
            );
          }
          return { success: true };
        } finally { await conn.end(); }
      }),
    testConnection: protectedProcedure.mutation(async () => {
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        const [rows] = await conn.execute("SELECT * FROM whatsapp_settings WHERE isConfigured=1 LIMIT 1");
        const s = (rows as any[])[0];
        if (!s) return { connected: false, error: "لم يتم إعداد Evolution API" };
        return checkEvolutionConnection({ apiUrl: s.evolutionApiUrl, apiKey: s.evolutionApiKey, instance: s.evolutionInstance });
      } finally { await conn.end(); }
    }),
    listSubscriptions: protectedProcedure.query(async () => {
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        const [subs] = await conn.execute("SELECT * FROM report_subscriptions ORDER BY createdAt DESC");
        const subList = subs as any[];
        for (const sub of subList) {
          const [recs] = await conn.execute("SELECT * FROM report_recipients WHERE subscriptionId=?", [sub.id]);
          sub.recipients = recs;
        }
        return subList;
      } finally { await conn.end(); }
    }),
    createSubscription: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        reportType: z.string().min(1), // now accepts any string
        templateId: z.number().optional(), // link to specific template
        scheduleType: z.enum(["hourly","daily","weekly","monthly","instant"]),
        scheduleHour: z.number().min(0).max(23).optional(),
        scheduleDay: z.number().min(0).max(31).optional(),
        scheduleEveryHours: z.number().min(1).max(24).optional(),
        messageTemplate: z.string().optional(),
        recipients: z.array(z.object({ phoneNumber: z.string().min(5), name: z.string().optional() })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const [result] = await conn.execute(
            "INSERT INTO report_subscriptions (name, reportType, templateId, scheduleType, scheduleHour, scheduleDay, scheduleEveryHours, messageTemplate, createdBy) VALUES (?,?,?,?,?,?,?,?,?)",
            [input.name, input.reportType, input.templateId ?? null, input.scheduleType, input.scheduleHour??8, input.scheduleDay??1, input.scheduleEveryHours??4, input.messageTemplate??null, ctx.user.id]
          ) as any[];
          const subId = result.insertId;
          for (const r of input.recipients) {
            await conn.execute("INSERT INTO report_recipients (subscriptionId, phoneNumber, name) VALUES (?,?,?)", [subId, r.phoneNumber, r.name??null]);
          }
          return { id: subId };
        } finally { await conn.end(); }
      }),
    updateSubscription: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        isActive: z.number().min(0).max(1).optional(),
        reportType: z.string().optional(),
        templateId: z.number().nullable().optional(),
        scheduleType: z.enum(["hourly","daily","weekly","monthly","instant"]).optional(),
        scheduleHour: z.number().min(0).max(23).optional(),
        scheduleDay: z.number().min(0).max(31).optional(),
        scheduleEveryHours: z.number().min(1).max(24).optional(),
        messageTemplate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const { id, ...fields } = input;
          const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
          const sets = entries.map(([k]) => k + "=?").join(",");
          const vals = [...entries.map(([, v]) => v), id];
          if (sets) await conn.execute(`UPDATE report_subscriptions SET ${sets} WHERE id=?`, vals);
          return { success: true };
        } finally { await conn.end(); }
      }),
    deleteSubscription: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          await conn.execute("DELETE FROM report_subscriptions WHERE id=?", [input.id]);
          return { success: true };
        } finally { await conn.end(); }
      }),
    sendNow: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => sendReportNow(input.id)),
    previewReport: protectedProcedure
      .input(z.object({
        reportType: z.string(), // now accepts any string (template id or type)
        templateId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          // Try to get template by id first, then by reportType
          let tmplRow: any = null;
          if (input.templateId) {
            const [rows] = await conn.execute('SELECT * FROM report_templates WHERE id=? LIMIT 1', [input.templateId]);
            tmplRow = (rows as any[])[0] ?? null;
          }
          if (!tmplRow) {
            const [rows] = await conn.execute('SELECT * FROM report_templates WHERE reportType=? ORDER BY updatedAt DESC LIMIT 1', [input.reportType]);
            tmplRow = (rows as any[])[0] ?? null;
          }
          // If template has full_text, use new model
          if (tmplRow?.full_text) {
            const validTypes = ['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance','daily_account_summary','daily_financial_summary'];
            const rt = validTypes.includes(tmplRow.reportType) ? tmplRow.reportType : 'daily_sales';
            return previewFullTextTemplate(tmplRow.full_text, rt as any);
          }
          // Fallback to old model
          const validTypes2 = ['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance','daily_account_summary','daily_financial_summary'];
          const rt2 = validTypes2.includes(input.reportType) ? input.reportType : 'daily_sales';
          return generateReport(rt2 as any, tmplRow);
        } finally { await conn.end(); }
      }),

    // Preview a full-text template with real data (new model)
    previewFullText: protectedProcedure
      .input(z.object({
        fullText: z.string().min(1),
        reportType: z.string(),
        date: z.string().optional(), // YYYY-MM-DD, defaults to today
      }))
      .mutation(async ({ input }) => {
        const validTypes = ['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance','daily_account_summary','daily_financial_summary'];
        const rt = validTypes.includes(input.reportType) ? input.reportType : 'daily_sales';
        // If date provided, use it; otherwise use today
        const preview = input.date
          ? await generateReportFromFullText(input.fullText, rt as any, input.date)
          : await previewFullTextTemplate(input.fullText, rt as any);
        return { preview };
      }),

    previewTemplateWithData: protectedProcedure
      .input(z.object({
        reportType: z.enum(["daily_sales","orders_summary","kitchen_cost","inventory_value","waste_summary","system_alerts","warehouse_performance"]),
        headerText: z.string().optional().default(''),
        bodyText: z.string().optional().default(''),
        footerText: z.string().optional().default(''),
        includeDate: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const today = new Date().toISOString().split('T')[0];
        const tempTemplate = {
          headerText: input.headerText || '',
          bodyText: input.bodyText || '',
          footerText: input.footerText || '',
          includeDate: Boolean(input.includeDate),
        };
        const result = await applyTemplateAsync(
          tempTemplate, '', '', '', today, input.reportType
        );
        return { preview: result };
      }),
    getLogs: protectedProcedure
      .input(z.object({ subscriptionId: z.number().optional(), limit: z.number().default(50) }))
      .query(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const limitVal = parseInt(String(input.limit), 10) || 50;
          let q = `SELECT l.id, l.subscriptionId, l.status, l.recipientPhone, l.messageContent, l.errorMessage, l.retryCount,
            DATE_FORMAT(CONVERT_TZ(l.sentAt, '+00:00', '+00:00'), '%Y-%m-%dT%H:%i:%sZ') as sentAt,
            DATE_FORMAT(CONVERT_TZ(l.createdAt, '+00:00', '+00:00'), '%Y-%m-%dT%H:%i:%sZ') as createdAt,
            s.name as subscriptionName FROM report_logs l LEFT JOIN report_subscriptions s ON l.subscriptionId=s.id`;
          const params: any[] = [];
          if (input.subscriptionId) { q += " WHERE l.subscriptionId=?"; params.push(input.subscriptionId); }
          q += ` ORDER BY l.createdAt DESC LIMIT ${limitVal}`;
          const [rows] = await conn.query(q, params);
          return rows as any[];
        } finally { await conn.end(); }
      }),
    getTemplates: protectedProcedure
      .query(async () => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const [rows] = await conn.query('SELECT * FROM report_templates ORDER BY updatedAt DESC');
          return rows as any[];
        } finally { await conn.end(); }
      }),

    // Save a full-text template (new model: single text field with {{variables}})
    saveFullTextTemplate: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(256),
        reportType: z.string().min(1),
        fullText: z.string().min(1),
        id: z.number().optional(), // if provided, update existing
      }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          if (input.id) {
            await conn.execute(
              'UPDATE report_templates SET name=?, reportType=?, full_text=? WHERE id=?',
              [input.name, input.reportType, input.fullText, input.id]
            );
            return { success: true, id: input.id };
          } else {
            const [result] = await conn.execute(
              'INSERT INTO report_templates (name, reportType, full_text) VALUES (?,?,?)',
              [input.name, input.reportType, input.fullText]
            ) as any[];
            return { success: true, id: result.insertId };
          }
        } finally { await conn.end(); }
      }),

    deleteTemplate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          await conn.execute('DELETE FROM report_templates WHERE id=?', [input.id]);
          return { success: true };
        } finally { await conn.end(); }
      }),

    // Legacy: keep for backward compatibility
    saveTemplate: protectedProcedure
      .input(z.object({
        reportType: z.enum(['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance']),
        headerText: z.string().optional(),
        bodyText: z.string().optional(),
        footerText: z.string().optional(),
        includeDate: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          // Build full_text from header + body + footer
          const parts = [];
          if (input.headerText?.trim()) parts.push(input.headerText.trim());
          if (input.bodyText?.trim()) parts.push(input.bodyText.trim());
          if (input.footerText?.trim()) parts.push(input.footerText.trim());
          const fullText = parts.join('\n\n');
          const name = input.headerText?.trim() || input.reportType;
          await conn.execute(
            'INSERT INTO report_templates (name, reportType, full_text, headerText, bodyText, footerText, includeDate) VALUES (?,?,?,?,?,?,?)',
            [name, input.reportType, fullText, input.headerText ?? null, input.bodyText ?? null, input.footerText ?? null, input.includeDate ? 1 : 0]
          );
          return { success: true };
        } finally { await conn.end(); }
      }),
    resetTemplate: protectedProcedure
      .input(z.object({
        reportType: z.enum(['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance']),
      }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          await conn.execute('DELETE FROM report_templates WHERE reportType=?', [input.reportType]);
          return { success: true };
        } finally { await conn.end(); }
      }),

    deleteAllTemplates: protectedProcedure
      .mutation(async () => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          await conn.execute('DELETE FROM report_templates');
          return { success: true };
        } finally { await conn.end(); }
      }),

    generateTemplateWithAI: protectedProcedure
      .input(z.object({
        reportType: z.enum(['daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance']),
        userPrompt: z.string().min(1).max(500),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const { getBusinessDayTzOffset } = await import("./db");
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        const tzOffset = await getBusinessDayTzOffset();
        // Compute business day date: before 06:00 local time = yesterday
        const sign = tzOffset[0] === '-' ? -1 : 1;
        const tzParts = tzOffset.slice(1).split(':');
        const offsetHours = sign * (parseInt(tzParts[0]) + parseInt(tzParts[1] || '0') / 60);
        const localMs = Date.now() + offsetHours * 3600000;
        const localD = new Date(localMs);
        const today = `${localD.getUTCFullYear()}-${String(localD.getUTCMonth()+1).padStart(2,'0')}-${String(localD.getUTCDate()).padStart(2,'0')}`;
        let statsContext = '';
        try {
          if (input.reportType === 'daily_sales') {
            const [sr] = await conn.query<any[]>(
              `SELECT COUNT(*) as cnt, COALESCE(SUM(totalSales),0) as sales, COALESCE(SUM(totalNetSales),0) as netSales,
               COALESCE(SUM(totalProfit),0) as profit, COALESCE(SUM(totalQty),0) as qty FROM sales_reports WHERE DATE(CONVERT_TZ(createdAt,'+00:00',?))=?`, [tzOffset, today]);
            const [fi] = await conn.query<any[]>(
              `SELECT COUNT(*) as cnt, COALESCE(SUM(totalAmount),0) as total,
               COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN totalAmount ELSE 0 END),0) as paid,
               COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN totalAmount ELSE 0 END),0) as pending
               FROM free_invoices WHERE DATE(CONVERT_TZ(date,'+00:00',?))=?`, [tzOffset, today]);
            const [bs] = await conn.query<any[]>(
              `SELECT COUNT(*) as cnt, COALESCE(SUM(totalAmount),0) as total FROM butcher_sales WHERE DATE(CONVERT_TZ(saleDate,'+00:00',?))=?`, [tzOffset, today]);
            statsContext = `إحصائيات المبيعات اليوم (${today}):
- تقارير نقاط البيع: ${sr[0].cnt} تقرير، إجمالي: ${Number(sr[0].sales).toFixed(2)} د.إ، صافي: ${Number(sr[0].netSales).toFixed(2)} د.إ، ربح: ${Number(sr[0].profit).toFixed(2)} د.إ
- فواتير الموردين: ${fi[0].cnt} فاتورة، إجمالي: ${Number(fi[0].total).toFixed(2)} د.إ، مدفوع: ${Number(fi[0].paid).toFixed(2)} د.إ، معلق: ${Number(fi[0].pending).toFixed(2)} د.إ
- مبيعات الجزارة: ${bs[0].cnt} فاتورة، إجمالي: ${Number(bs[0].total).toFixed(2)} د.إ`;
          } else if (input.reportType === 'orders_summary') {
            const [fi] = await conn.query<any[]>(
              `SELECT COUNT(*) as total, COALESCE(SUM(totalAmount),0) as amt,
               COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN 1 ELSE 0 END),0) as paid,
               COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN 1 ELSE 0 END),0) as pending,
               COALESCE(SUM(CASE WHEN paymentStatus='partial' THEN 1 ELSE 0 END),0) as partial,
               COALESCE(SUM(CASE WHEN paymentStatus='paid' THEN totalAmount ELSE 0 END),0) as paidAmt,
               COALESCE(SUM(CASE WHEN paymentStatus='pending' THEN totalAmount ELSE 0 END),0) as pendingAmt
               FROM free_invoices WHERE DATE(CONVERT_TZ(date,'+00:00',?))=?`, [tzOffset, today]);
            const [inv] = await conn.query<any[]>(
              `SELECT COUNT(*) as total, COALESCE(SUM(totalAmount),0) as amt FROM invoices WHERE DATE(CONVERT_TZ(invoiceDate,'+00:00',?))=?`, [tzOffset, today]);
            statsContext = `إحصائيات الطلبات اليوم (${today}):
- فواتير الموردين: ${fi[0].total} فاتورة، إجمالي: ${Number(fi[0].amt).toFixed(2)} د.إ، مدفوعة: ${fi[0].paid} (${Number(fi[0].paidAmt).toFixed(2)} د.إ)، معلقة: ${fi[0].pending} (${Number(fi[0].pendingAmt).toFixed(2)} د.إ)، جزئية: ${fi[0].partial}
- فواتير المخزون: ${inv[0].total} فاتورة، إجمالي: ${Number(inv[0].amt).toFixed(2)} د.إ`;
          } else if (input.reportType === 'kitchen_cost') {
            const [p] = await conn.query<any[]>(
              `SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN status='open' THEN 1 ELSE 0 END),0) as open,
               COALESCE(SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END),0) as closed,
               COALESCE(SUM(pulledQuantity),0) as pulled, COALESCE(SUM(wasteQty),0) as waste
               FROM kitchen_daily_pulls WHERE DATE(CONVERT_TZ(pullDate,'+00:00',?))=?`, [tzOffset, today]);
            const [kc] = await conn.query<any[]>(
              `SELECT 
                COALESCE(SUM(kdp.pulledQuantity * COALESCE(rm.averageCost, rm.lastPurchasePrice, 0)), 0) as daily_cost,
                COALESCE(SUM(kdp.wasteQty * COALESCE(rm.averageCost, rm.lastPurchasePrice, 0)), 0) as daily_waste_cost,
                COUNT(DISTINCT kdp.materialId) as materials_count
               FROM kitchen_daily_pulls kdp
               LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
               WHERE DATE(CONVERT_TZ(kdp.pullDate,'+00:00',?))=?`, [tzOffset, today]);
            const [top] = await conn.query<any[]>(
              `SELECT kdp.materialNameAr, SUM(kdp.pulledQuantity) as qty, kdp.unit,
               SUM(kdp.pulledQuantity * COALESCE(rm.averageCost, rm.lastPurchasePrice, 0)) as cost
               FROM kitchen_daily_pulls kdp
               LEFT JOIN raw_materials rm ON kdp.materialId = rm.id
               WHERE DATE(CONVERT_TZ(kdp.pullDate,'+00:00',?))=?
               GROUP BY kdp.materialId, kdp.materialNameAr, kdp.unit ORDER BY cost DESC LIMIT 3`, [tzOffset, today]);
            const [prod] = await conn.query<any[]>(
              `SELECT COUNT(*) as cnt, COALESCE(SUM(producedQuantity * actualUnitCost), 0) as prod_cost
               FROM kitchen_daily_production WHERE DATE(CONVERT_TZ(productionDate,'+00:00',?))=?`, [tzOffset, today]);
            const topStr = (top as any[]).map((t: any, i: number)=>`${i+1}. ${t.materialNameAr} (${Number(t.qty).toFixed(2)} ${t.unit} - ${Number(t.cost).toFixed(2)} د.إ)`).join('، ');
            statsContext = `إحصائيات المطبخ اليوم (${today}):
- السحبات: ${p[0].total} سحبة، مفتوحة: ${p[0].open}، مغلقة: ${p[0].closed}، إجمالي الكميات: ${Number(p[0].pulled).toFixed(2)}، هدر: ${Number(p[0].waste).toFixed(2)}
- تكلفة المطبخ اليومية: ${Number(kc[0].daily_cost).toFixed(2)} د.إ (${kc[0].materials_count} مادة)
- تكلفة هدر المطبخ: ${Number(kc[0].daily_waste_cost).toFixed(2)} د.إ
- الإنتاج: ${prod[0].cnt} صنف، تكلفة الإنتاج: ${Number(prod[0].prod_cost).toFixed(2)} د.إ
- أعلى المواد تكلفةً: ${topStr}`;
          } else if (input.reportType === 'inventory_value') {
            const [s] = await conn.query<any[]>(
              `SELECT COUNT(*) as total,
               COALESCE(SUM(CASE WHEN currentQuantity<=0 THEN 1 ELSE 0 END),0) as out,
               COALESCE(SUM(CASE WHEN currentQuantity>0 AND currentQuantity<=minimumQuantity THEN 1 ELSE 0 END),0) as low,
               COALESCE(SUM(CASE WHEN currentQuantity>minimumQuantity THEN 1 ELSE 0 END),0) as good,
               COALESCE(SUM(currentQuantity*COALESCE(averageCost,lastPurchasePrice,0)),0) as totalVal,
               COALESCE(SUM(CASE WHEN (materialType IS NULL OR materialType='raw') THEN currentQuantity*COALESCE(averageCost,lastPurchasePrice,0) ELSE 0 END),0) as rawVal,
               COALESCE(SUM(CASE WHEN materialType IN ('semi_finished','manufactured') THEN currentQuantity*COALESCE(averageCost,lastPurchasePrice,0) ELSE 0 END),0) as mfgVal
               FROM raw_materials WHERE isActive=1`);
            const [low] = await conn.query<any[]>(
              `SELECT nameAr, currentQuantity, minimumQuantity, unit FROM raw_materials
               WHERE isActive=1 AND currentQuantity>0 AND currentQuantity<=minimumQuantity
               ORDER BY (currentQuantity/minimumQuantity) ASC LIMIT 5`);
            const [out] = await conn.query<any[]>(
              `SELECT nameAr FROM raw_materials WHERE isActive=1 AND currentQuantity<=0 LIMIT 5`);
            const lowStr = (low as any[]).map(m=>`${m.nameAr}: ${Number(m.currentQuantity).toFixed(2)}/${Number(m.minimumQuantity).toFixed(2)} ${m.unit}`).join('، ');
            const outStr = (out as any[]).map(m=>m.nameAr).join('، ');
            statsContext = `إحصائيات المخزون الحالية:
- إجمالي المواد: ${s[0].total}، جيد: ${s[0].good}، منخفض: ${s[0].low}، نافد: ${s[0].out}
- القيمة: خام: ${Number(s[0].rawVal).toFixed(2)} د.إ، مصنّع: ${Number(s[0].mfgVal).toFixed(2)} د.إ، الإجمالي: ${Number(s[0].totalVal).toFixed(2)} د.إ
- مواد منخفضة: ${lowStr}
- مواد نافدة: ${outStr}`;
          } else if (input.reportType === 'waste_summary') {
            const [w] = await conn.query<any[]>(
              `SELECT COUNT(*) as entries, COUNT(DISTINCT materialId) as mats,
               COALESCE(SUM(wasteQty),0) as qty, COALESCE(SUM(totalCost),0) as cost
               FROM waste_logs WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',?))=?`, [tzOffset, today]);
            const [bw] = await conn.query<any[]>(
              `SELECT COUNT(*) as entries, COALESCE(SUM(wasteQty),0) as qty, COALESCE(SUM(totalCost),0) as cost
               FROM butcher_waste WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',?))=?`, [tzOffset, today]);
            const [kw] = await conn.query<any[]>(
              `SELECT COALESCE(SUM(wasteQty),0) as qty FROM kitchen_daily_pulls WHERE DATE(CONVERT_TZ(pullDate,'+00:00',?))=? AND wasteQty>0`, [tzOffset, today]);
            const [top] = await conn.query<any[]>(
              `SELECT materialNameAr, SUM(wasteQty) as qty, SUM(totalCost) as cost, unit
               FROM waste_logs WHERE DATE(CONVERT_TZ(wasteDate,'+00:00',?))=?
               GROUP BY materialId, materialNameAr, unit ORDER BY cost DESC LIMIT 3`, [tzOffset, today]);
            const topStr = (top as any[]).map((t,i)=>`${i+1}. ${t.materialNameAr} (${Number(t.qty).toFixed(2)} ${t.unit}، ${Number(t.cost).toFixed(2)} د.إ)`).join('، ');
            statsContext = `إحصائيات الهدر اليوم (${today}):
- هدر المستودع: ${w[0].entries} سجل، ${w[0].mats} مادة، كمية: ${Number(w[0].qty).toFixed(2)}، تكلفة: ${Number(w[0].cost).toFixed(2)} د.إ
- هدر الجزارة: ${bw[0].entries} سجل، كمية: ${Number(bw[0].qty).toFixed(2)}، تكلفة: ${Number(bw[0].cost).toFixed(2)} د.إ
- هدر المطبخ: ${Number(kw[0].qty).toFixed(2)}
- أكثر المواد هدراً: ${topStr}`;
          } else if (input.reportType === 'system_alerts') {
            const [c] = await conn.query<any[]>(
              `SELECT COALESCE(SUM(CASE WHEN currentQuantity<=0 THEN 1 ELSE 0 END),0) as out,
               COALESCE(SUM(CASE WHEN currentQuantity>0 AND currentQuantity<=minimumQuantity THEN 1 ELSE 0 END),0) as low
               FROM raw_materials WHERE isActive=1`);
            const [out] = await conn.query<any[]>(
              `SELECT nameAr, unit FROM raw_materials WHERE isActive=1 AND currentQuantity<=0 LIMIT 10`);
            const [low] = await conn.query<any[]>(
              `SELECT nameAr, currentQuantity, minimumQuantity, unit FROM raw_materials
               WHERE isActive=1 AND currentQuantity>0 AND currentQuantity<=minimumQuantity
               ORDER BY (currentQuantity/minimumQuantity) ASC LIMIT 10`);
            const outStr = (out as any[]).map(m=>m.nameAr).join('، ');
            const lowStr = (low as any[]).map(m=>`${m.nameAr}: ${Number(m.currentQuantity).toFixed(2)}/${Number(m.minimumQuantity).toFixed(2)} ${m.unit}`).join('، ');
            statsContext = `تنبيهات المخزون الحالية:
- إجمالي التنبيهات: ${Number(c[0].out)+Number(c[0].low)} (نافد: ${c[0].out}، منخفض: ${c[0].low})
- مواد نافدة: ${outStr}
- مواد منخفضة: ${lowStr}`;
          } else if (input.reportType === 'warehouse_performance') {
            const ITEMS = [
              { id: 132, name: 'دجاج كاملة' },
              { id: 144, name: 'الفحم' },
              { id: 143, name: 'الغاز' },
              { id: 158, name: 'لحم كفتة' },
              { id: 167, name: 'أرز' },
            ];
            const lines: string[] = [];
            for (const item of ITEMS) {
              const [rows] = await conn.query<any[]>(
                `SELECT currentQuantity, unit, minimumQuantity FROM raw_materials WHERE id=?`, [item.id]);
              const row = (rows as any[])[0];
              if (row) {
                const qty = parseFloat(row.currentQuantity) || 0;
                const min = parseFloat(row.minimumQuantity) || 0;
                const status = qty <= 0 ? 'نافد' : qty <= min ? 'منخفض' : 'جيد';
                lines.push(`${item.name}: ${qty.toFixed(2)} ${row.unit} (${status}، الحد الأدنى: ${min.toFixed(2)} ${row.unit})`);
              }
            }
            statsContext = `تقرير أداء المخزن (${today}):\n${lines.join('\n')}`;
          }
        } finally {
          await conn.end();
        }

        const reportTypeLabels: Record<string,string> = {
          daily_sales: 'تقرير المبيعات اليومي',
          orders_summary: 'ملخص الطلبات',
          kitchen_cost: 'تقرير تكلفة المطبخ',
          inventory_value: 'تقرير قيمة المخزون',
          waste_summary: 'تقرير الهدر اليومي',
          system_alerts: 'تنبيهات المخزون',
          warehouse_performance: 'تقرير أداء المخزن',
        };

        const variablesGuide: Record<string, string> = {
          daily_sales: `المتغيرات المتاحة للاستخدام في bodyText:
{{pos_reports_count}} = عدد تقارير نقاط البيع
{{pos_total_sales}} = إجمالي مبيعات نقاط البيع
{{pos_net_sales}} = صافي مبيعات نقاط البيع
{{pos_profit}} = ربح نقاط البيع
{{pos_qty}} = عدد الأصناف المباعة
{{invoices_count}} = عدد فواتير الموردين
{{invoices_total}} = إجمالي فواتير الموردين
{{invoices_paid}} = مدفوع من فواتير الموردين
{{invoices_pending}} = معلق من فواتير الموردين
{{butcher_count}} = عدد فواتير الجزارة
{{butcher_total}} = إجمالي مبيعات الجزارة`,
          orders_summary: `المتغيرات المتاحة:
{{fi_total}} = إجمالي فواتير الموردين
{{fi_amount}} = قيمة فواتير الموردين
{{fi_paid}} = عدد المدفوعة
{{fi_pending}} = عدد المعلقة
{{fi_partial}} = عدد الجزئية
{{fi_paid_amount}} = قيمة المدفوعة
{{fi_pending_amount}} = قيمة المعلقة
{{inv_total}} = عدد فواتير المخزون
{{inv_amount}} = قيمة فواتير المخزون`,
          kitchen_cost: `المتغيرات المتاحة:
{{pulls_total}} = إجمالي السحبات
{{pulls_open}} = سحبات مفتوحة
{{pulls_closed}} = سحبات مغلقة
{{pulls_qty}} = إجمالي الكميات المسحوبة
{{pulls_waste}} = هدر السحبات
{{kitchen_daily_cost}} = تكلفة المطبخ اليومية (بالدرهم)
{{kitchen_daily_waste_cost}} = تكلفة هدر المطبخ اليومية (بالدرهم)
{{kitchen_materials_count}} = عدد المواد المستخدمة في المطبخ
{{production_count}} = عدد أصناف الإنتاج
{{kitchen_prod_cost}} = تكلفة الإنتاج اليومية (بالدرهم)
{{top_materials}} = أعلى المواد تكلفةً مع الأسعار`,
          inventory_value: `المتغيرات المتاحة:
{{total_materials}} = إجمالي المواد
{{good_count}} = مواد بمستوى جيد
{{low_count}} = مواد منخفضة
{{out_count}} = مواد نافدة
{{raw_value}} = قيمة المواد الخام
{{mfg_value}} = قيمة المواد المصنعة
{{total_value}} = إجمالي قيمة المخزون
{{low_materials}} = أسماء المواد المنخفضة
{{out_materials}} = أسماء المواد النافدة`,
          waste_summary: `المتغيرات المتاحة:
{{waste_entries}} = سجلات هدر المستودع
{{waste_materials}} = عدد مواد هدر المستودع
{{waste_qty}} = كمية هدر المستودع
{{waste_cost}} = تكلفة هدر المستودع
{{butcher_waste_entries}} = سجلات هدر الجزارة
{{butcher_waste_qty}} = كمية هدر الجزارة
{{butcher_waste_cost}} = تكلفة هدر الجزارة
{{kitchen_waste_qty}} = كمية هدر المطبخ
{{top_waste}} = أكثر المواد هدراً`,
          system_alerts: `المتغيرات المتاحة:
{{total_alerts}} = إجمالي التنبيهات
{{out_count}} = عدد المواد النافدة
{{low_count}} = عدد المواد المنخفضة
{{out_materials}} = أسماء المواد النافدة
{{low_materials}} = أسماء المواد المنخفضة`,
          warehouse_performance: `المتغيرات المتاحة:
{{wh_chicken}} = كمية دجاج كاملة
{{wh_chicken_status}} = حالة دجاج كاملة (✅ جيد / 🟡 منخفض / 🔴 نافد)
{{wh_chicken_min}} = الحد الأدنى لدجاج كاملة
{{wh_charcoal}} = كمية الفحم
{{wh_charcoal_status}} = حالة الفحم
{{wh_charcoal_min}} = الحد الأدنى للفحم
{{wh_gas}} = كمية الغاز
{{wh_gas_status}} = حالة الغاز
{{wh_gas_min}} = الحد الأدنى للغاز
{{wh_kofta}} = كمية لحم كفتة
{{wh_kofta_status}} = حالة لحم كفتة
{{wh_kofta_min}} = الحد الأدنى للحم كفتة
{{wh_rice}} = كمية أرز
{{wh_rice_status}} = حالة أرز
{{wh_rice_min}} = الحد الأدنى للأرز
{{inv_total_items}} = إجمالي عدد المواد في المخزن
{{inv_out_count}} = عدد المواد النافدة
{{inv_low_count}} = عدد المواد المنخفضة`,
        };

        const response = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `أنت مساعد ذكي متخصص في كتابة قوالب رسائل WhatsApp للتقارير الإدارية للمطاعم.

مهمتك: اكتب قالب رسالة WhatsApp احترافية بالعربية يستخدم المتغيرات الديناميكية {{variable}} بدلاً من الأرقام الثابتة.
هذه المتغيرات ستُستبدل تلقائياً بالقيم الحقيقية عند كل إرسال.

قواعد مهمة:
1. استخدم المتغيرات {{variable}} من القائمة المتاحة فقط - لا تخترع متغيرات غير موجودة
2. استخدم الإيموجي المناسبة لجعل الرسالة جذابة
3. الرسالة يجب أن تكون مختصرة ومفيدة
4. لا تضع أرقاماً ثابتة - استخدم المتغيرات دائماً
5. إذا احتجت إحصائية غير موجودة في القائمة، اذكرها في حقل suggestedVariables
6. يمكنك الاستعانة بالإحصائيات الحالية كمثال لفهم البنية فقط

أعد JSON بالشكل التالي فقط:
{
  "headerText": "عنوان الرسالة مع إيموجي",
  "bodyText": "محتوى القالب مع المتغيرات {{variable}}",
  "footerText": "توقيع ختامي ثابت",
  "suggestedVariables": ["وصف إحصائية مقترحة 1", "وصف إحصائية مقترحة 2"]
}`,
            },
            {
              role: 'user',
              content: `نوع التقرير: ${reportTypeLabels[input.reportType]}
طلب المستخدم: ${input.userPrompt}

${variablesGuide[input.reportType] ?? ''}

الإحصائيات الحالية (للاستئناس فقط - لا تضعها كأرقام ثابتة في القالب):
${statsContext}

اكتب قالب رسالة WhatsApp باستخدام المتغيرات {{variable}} بدلاً من الأرقام الثابتة.`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'whatsapp_template',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  headerText: { type: 'string', description: 'عنوان الرسالة' },
                  bodyText: { type: 'string', description: 'محتوى الرسالة' },
                  footerText: { type: 'string', description: 'التوقيع الختامي' },
                  suggestedVariables: { type: 'array', items: { type: 'string' }, description: 'إحصائيات مقترحة غير متوفرة حالياً' },
                },
                required: ['headerText', 'bodyText', 'footerText', 'suggestedVariables'],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));
        return {
          headerText: parsed.headerText as string,
          bodyText: parsed.bodyText as string,
          footerText: parsed.footerText as string,
          suggestedVariables: (parsed.suggestedVariables || []) as string[],
        };
      }),

    /**
     * Generate a WhatsApp template from any dashboard page context.
     * The frontend passes the page name + a JSON snapshot of the current stats.
     */
    generateTemplateFromPageContext: protectedProcedure
      .input(z.object({
        pageName: z.string(),
        pageStats: z.string(), // JSON string of key-value pairs
        userHint: z.string().optional().default(''),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const { getBusinessDayTzOffset } = await import("./db");
        const tzOffset = await getBusinessDayTzOffset();
        const sign = tzOffset[0] === '-' ? -1 : 1;
        const tzParts = tzOffset.slice(1).split(':');
        const offsetHours = sign * (parseInt(tzParts[0]) + parseInt(tzParts[1] || '0') / 60);
        const localMs = Date.now() + offsetHours * 3600000;
        const localD = new Date(localMs);
        const today = `${localD.getUTCFullYear()}-${String(localD.getUTCMonth()+1).padStart(2,'0')}-${String(localD.getUTCDate()).padStart(2,'0')}`;

        const parsedStats = JSON.parse(input.pageStats) as Record<string, string | number>;
        const statsText = Object.entries(parsedStats)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n');
        const response = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `أنت مساعد ذكي متخصص في كتابة قوالب رسائل WhatsApp للتقارير الإدارية للمطاعم.
مهمتك: بناءً على إحصائيات صفحة "${input.pageName}" في لوحة التحكم، اكتب قالب رسالة WhatsApp احترافية بالعربية.
القالب يجب أن يستخدم متغيرات ديناميكية بالشكل {{اسم_المتغير}} بدلاً من الأرقام الثابتة.
هذه المتغيرات ستُستبدل تلقائياً بالقيم الحقيقية عند كل إرسال.

تعليمات صارمة:
1. استخدم فقط المتغيرات من القائمة أدناه - لا تخترع أسماء جديدة
2. استخدم الإيموجي المناسبة لجعل الرسالة جذابة
3. الرسالة مختصرة ومفيدة وتعكس محتوى الصفحة بدقة
4. لا تضع أرقاماً ثابتة - استخدم المتغيرات دائماً
5. اختر reportType الأنسب بناءً على الصفحة

قائمة المتغيرات المتاحة:
{{report_date}} = تاريخ التقرير

للمبيعات (daily_sales):
{{pos_total_sales}} = إجمالي مبيعات POS
{{pos_net_sales}} = صافي مبيعات POS
{{pos_profit}} = ربح POS
{{pos_qty}} = عدد المبيعات
{{pos_reports_count}} = عدد تقارير POS
{{invoices_total}} = إجمالي الفواتير الحرة
{{invoices_paid}} = المدفوع من الفواتير
{{invoices_pending}} = المعلق من الفواتير
{{butcher_count}} = عدد فواتير الجزارة
{{butcher_total}} = إجمالي مبيعات الجزارة

للطلبات (orders_summary):
{{fi_total}} = عدد فواتير الموردين
{{fi_amount}} = قيمة فواتير الموردين
{{fi_paid}} = عدد المدفوعة
{{fi_pending}} = عدد المعلقة
{{fi_paid_amount}} = قيمة المدفوعة
{{fi_pending_amount}} = قيمة المعلقة
{{inv_total}} = عدد فواتير المخزون
{{inv_amount}} = قيمة فواتير المخزون

للمطبخ (kitchen_cost):
{{pulls_total}} = إجمالي السحبات
{{pulls_open}} = سحبات مفتوحة
{{pulls_closed}} = سحبات مغلقة
{{pulls_qty}} = إجمالي الكميات المسحوبة
{{pulls_waste}} = هدر السحبات
{{kitchen_daily_cost}} = تكلفة المطبخ اليومية
{{kitchen_daily_waste_cost}} = تكلفة هدر المطبخ
{{kitchen_materials_count}} = عدد المواد المستخدمة
{{production_count}} = عدد أصناف الإنتاج
{{kitchen_prod_cost}} = تكلفة الإنتاج
{{top_materials}} = أعلى المواد تكلفةً
{{kitchen_top1}} = المادة الأولى الأعلى تكلفة
{{kitchen_top2}} = المادة الثانية الأعلى تكلفة
{{kitchen_top3}} = المادة الثالثة الأعلى تكلفة

للمخزون (inventory_value):
{{total_materials}} = إجمالي المواد
{{good_count}} = مواد بمستوى جيد
{{low_count}} = مواد منخفضة
{{out_count}} = مواد نافدة
{{raw_value}} = قيمة المواد الخام
{{mfg_value}} = قيمة المواد المصنعة
{{total_value}} = إجمالي قيمة المخزون
{{low_materials}} = أسماء المواد المنخفضة
{{out_materials}} = أسماء المواد النافدة

للهدر (waste_summary):
{{waste_entries}} = سجلات هدر المستودع
{{waste_qty}} = كمية هدر المستودع
{{waste_cost}} = تكلفة هدر المستودع
{{butcher_waste_qty}} = كمية هدر الجزارة
{{butcher_waste_cost}} = تكلفة هدر الجزارة
{{kitchen_waste_qty}} = كمية هدر المطبخ
{{top_waste}} = أكثر المواد هدراً

للتنبيهات (system_alerts):
{{total_alerts}} = إجمالي التنبيهات
{{out_count}} = عدد المواد النافدة
{{low_count}} = عدد المواد المنخفضة
{{out_materials}} = أسماء المواد النافدة
{{low_materials}} = أسماء المواد المنخفضة

أعد JSON بالشكل التالي فقط:
{
  "fullText": "النص الكامل للرسالة مع الإيموجي والمتغيرات {{variable}} من أول سطر لآخر سطر",
  "suggestedName": "اسم مختصر للقالب",
  "reportType": "daily_sales|orders_summary|kitchen_cost|inventory_value|waste_summary|system_alerts",
  "suggestedVariables": ["وصف إحصائية مفيدة غير متوفرة حالياً"]
}
مهم: fullText يحتوي على الرسالة كاملة بما فيها العنوان والمحتوى والتوقيع في نص واحد متكامل.`,
            },
            {
              role: 'user',
              content: `الصفحة: ${input.pageName}\nالتاريخ: ${today}\n${input.userHint ? `ملاحظة المستخدم: ${input.userHint}\n` : ''}الإحصائيات الحالية في الصفحة:\n${statsText}\n\nاكتب قالب رسالة WhatsApp يعكس هذه الإحصائيات باستخدام متغيرات ديناميكية.`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'page_whatsapp_template',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  fullText: { type: 'string' },
                  suggestedName: { type: 'string' },
                  reportType: { type: 'string' },
                  suggestedVariables: { type: 'array', items: { type: 'string' } },
                },
                required: ['fullText', 'suggestedName', 'reportType', 'suggestedVariables'],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices[0].message.content;
        const parsed = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));
        return {
          fullText: parsed.fullText as string,
          suggestedName: parsed.suggestedName as string,
          reportType: parsed.reportType as string,
          suggestedVariables: (parsed.suggestedVariables || []) as string[],
        };
      }),
  }),

  // ─── Daily Accounts (الحسابات اليومية) ─────────────────────────────────────
  dailyAccounts: router({
    save: warehouseProcedure
      .input(z.object({
        accountDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        salesCash: z.number().min(0).default(0),
        salesCard: z.number().min(0).default(0),
        salesKita: z.number().min(0).default(0),
        salesOrders: z.number().min(0).default(0),
        salesNoon: z.number().min(0).default(0),
        salesDeliveroo: z.number().min(0).default(0),
        salesCareem: z.number().min(0).default(0),
        expensesFixed: z.number().min(0).default(0),
        supplyToRestaurant: z.number().min(0).default(0),
        supplyToManagement: z.number().min(0).default(0),
        supplyExtra: z.number().min(0).default(0),
        staffMeals: z.number().min(0).optional(),
        notes: z.string().optional(),
        stockValue: z.number().min(0).optional(),
        // بيانات إضافية لرسالة واتساب (محسوبة في الواجهة)
        expensesSupplierInvoices: z.number().min(0).default(0),
        expensesFreeInvoices: z.number().min(0).default(0),
        expensesPartial: z.number().min(0).default(0),
        carryForwardFromPrev: z.number().default(0),
        carryForwardToNext: z.number().default(0),
        // Detailed invoice data for PDF
        supplierInvoices: z.array(z.object({
          supplierName: z.string(),
          invoiceNumber: z.string().nullable().default(null),
          totalAmount: z.number(),
          items: z.array(z.object({
            description: z.string(),
            qty: z.number(),
            unitPrice: z.number(),
            total: z.number(),
          })).optional(),
        })).optional(),
        freeInvoices: z.array(z.object({
          supplierName: z.string(),
          invoiceNumber: z.string().nullable().default(null),
          totalAmount: z.number(),
          expenseCategory: z.string(),
          items: z.array(z.object({
            description: z.string(),
            qty: z.number(),
            unitPrice: z.number(),
            total: z.number(),
          })).optional(),
        })).optional(),
        partialInvoices: z.array(z.object({
          supplierName: z.string(),
          invoiceNumber: z.string().nullable().default(null),
          totalAmount: z.number(),
          paidAmount: z.number(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const savedId = await saveDailyAccount({ ...input, userId: ctx.user.id });
        // إرسال رسالة واتساب فورية (fire-and-forget)
        // جلب carry_from_prev من قاعدة البيانات (carryForwardToNext لليوم السابق)
        const fetchPrevCarry = async (): Promise<number> => {
          const conn2 = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
          try {
            const [rows] = await conn2.query<any[]>(
              `SELECT carryForwardToNext FROM daily_accounts WHERE accountDate < ? ORDER BY accountDate DESC LIMIT 1`,
              [input.accountDate]
            );
            return Number((rows as any[])[0]?.carryForwardToNext || 0);
          } finally { await conn2.end(); }
        };
        fetchPrevCarry().then(async (prevCarry) => {
          // جلب كل بيانات اليوم من DB مباشرة لضمان الدقة
          const conn3 = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
          let staffMeals = 0, foodCostPercent = 0;
          let expensesSupplierInvoices = input.expensesSupplierInvoices ?? 0;
          let expensesFreeInvoices = input.expensesFreeInvoices ?? 0;
          let expensesPartial = input.expensesPartial ?? 0;
          try {
            const [daRows] = await conn3.execute(
              `SELECT staffMeals, foodCostPercent FROM daily_accounts WHERE accountDate=? LIMIT 1`,
              [input.accountDate]
            ) as any[];
            staffMeals = parseFloat((daRows as any[])[0]?.staffMeals ?? 0) || 0;
            foodCostPercent = parseFloat((daRows as any[])[0]?.foodCostPercent ?? 0) || 0;

            // جلب المصروفات من الفواتير مباشرة
            const [invRows] = await conn3.execute(
              `SELECT
                COALESCE(SUM(CASE WHEN expenseCategory='operational' THEN totalAmount ELSE 0 END),0) as opEx,
                COALESCE(SUM(CASE WHEN expenseCategory='maintenance' THEN totalAmount ELSE 0 END),0) as mainEx
               FROM invoices
               WHERE DATE(CONVERT_TZ(invoiceDate,'+00:00','+04:00')) = ?`,
              [input.accountDate]
            ) as any[];
            const [freeRows] = await conn3.execute(
              `SELECT
                COALESCE(SUM(CASE WHEN expenseCategory='operational' THEN totalAmount ELSE 0 END),0) as opEx
               FROM free_invoices
               WHERE DATE(CONVERT_TZ(date,'+00:00','+04:00')) = ?`,
              [input.accountDate]
            ) as any[];
            expensesSupplierInvoices = parseFloat((invRows as any[])[0]?.opEx) || 0;
            expensesFreeInvoices = parseFloat((freeRows as any[])[0]?.opEx) || 0;
          } finally { await conn3.end(); }

          // حساب نسبة المطعم للشهر
          const [yr, mo] = input.accountDate.split('-').map(Number);
          const monthStart = `${yr}-${String(mo).padStart(2,'0')}-01`;
          const conn4 = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
          let restaurantDiff: number | undefined;
          try {
            const [mRows] = await conn4.execute(
              `SELECT
                COALESCE(SUM(salesCash),0) as totalCash,
                COALESCE(SUM(salesCash+salesCard+salesKita+salesOrders+salesNoon+salesDeliveroo+salesCareem),0) as totalSales,
                COALESCE(SUM(supplyToRestaurant+supplyExtra-supplyToManagement),0) as totalSupply
               FROM daily_accounts WHERE accountDate >= ? AND accountDate <= ?`,
              [monthStart, input.accountDate]
            ) as any[];
            const r = (mRows as any[])[0];
            const mTotalCash = parseFloat(r.totalCash) || 0;
            const mTotalSales = parseFloat(r.totalSales) || 0;
            const mTotalSupply = parseFloat(r.totalSupply) || 0;
            const expected = mTotalSales / 2 - mTotalCash;
            restaurantDiff = mTotalSupply - expected;
          } catch(_) {}
          finally { await conn4.end(); }

          console.log(`[DailyAccountNotif] Triggering notification for date: ${input.accountDate}`);
          return sendDailyAccountNotification({
            accountDate: input.accountDate,
            salesCash: input.salesCash,
            salesCard: input.salesCard,
            salesKita: input.salesKita,
            salesOrders: input.salesOrders,
            salesNoon: input.salesNoon,
            salesDeliveroo: input.salesDeliveroo,
            salesCareem: input.salesCareem,
            expensesFixed: input.expensesFixed,
            expensesSupplierInvoices,
            expensesFreeInvoices,
            expensesPartial,
            supplyToRestaurant: input.supplyToRestaurant,
            supplyToManagement: input.supplyToManagement,
            supplyExtra: input.supplyExtra,
            carryForwardFromPrev: prevCarry,
            carryForwardToNext: input.carryForwardToNext ?? 0,
            staffMeals,
            foodCostPercent,
            restaurantDiff,
            notes: input.notes,
            supplierInvoices: input.supplierInvoices,
            freeInvoices: input.freeInvoices,
            partialInvoices: input.partialInvoices,
          });
        }).then(() => {
          console.log(`[DailyAccountNotif] Notification completed for date: ${input.accountDate}`);
        }).catch((err) => console.error("[DailyAccountNotif] Error:", err));
        return savedId;
      }),

    list: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
      .query(({ input }) => getDailyAccounts(input)),

    getByDate: protectedProcedure
      .input(z.object({ accountDate: z.string() }))
      .query(({ input }) => getDailyAccountByDate(input.accountDate)),

    delete: warehouseProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteDailyAccount(input.id)),

    expensesForDate: protectedProcedure
      .input(z.object({ accountDate: z.string() }))
      .query(({ input }) => getFreeInvoiceExpensesForDate(input.accountDate)),

    previousCarryForward: protectedProcedure
      .input(z.object({ accountDate: z.string() }))
      .query(({ input }) => getPreviousDayCarryForward(input.accountDate)),

    updateInvoiceCategory: warehouseProcedure
      .input(z.object({
        invoiceId: z.number(),
        category: z.enum(["operational", "maintenance", "fixed", "other"]),
      }))
      .mutation(({ input }) => updateFreeInvoiceExpenseCategory(input.invoiceId, input.category)),
    monthExpenses: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
      .query(({ input }) => getMonthExpenses(input.year, input.month)),

    financialKpi: protectedProcedure
      .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
      .query(({ input }) => getFinancialKpi(input.year, input.month)),

    getOpeningStock: protectedProcedure.query(async () => {
      const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
      try {
        const [rows] = await conn.query<any[]>(`SELECT openingStockValue, openingStockDate FROM app_settings WHERE id=1`);
        const r = (rows as any[])[0];
        const rawDate = r?.openingStockDate;
        let dateStr: string | null = null;
        if (rawDate instanceof Date) {
          const y = rawDate.getFullYear();
          const m = String(rawDate.getMonth() + 1).padStart(2, '0');
          const d = String(rawDate.getDate()).padStart(2, '0');
          dateStr = `${y}-${m}-${d}`;
        } else if (rawDate) {
          dateStr = String(rawDate).split('T')[0];
        }
        return { openingStockValue: parseFloat(r?.openingStockValue ?? '0'), openingStockDate: dateStr };
      } finally { await conn.end(); }
    }),

    updateOpeningStock: warehouseProcedure
      .input(z.object({
        openingStockValue: z.number().min(0),
        openingStockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ يجب أن يكون بصيغة YYYY-MM-DD" }),
      }))
      .mutation(({ input }) => updateOpeningStock(input.openingStockValue, input.openingStockDate)),

    closeMonth: warehouseProcedure
      .input(z.object({ year: z.number(), month: z.number().min(1).max(12) }))
      .mutation(({ input, ctx }) => closeMonth(input.year, input.month, ctx.user.id)),
    resendReport: protectedProcedure
      .input(z.object({ accountDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(async ({ input }) => {
        const conn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const [rows] = await conn.execute<any[]>(
            'SELECT * FROM daily_accounts WHERE accountDate = ? LIMIT 1',
            [input.accountDate]
          );
          if (!rows || rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a \u0644\u0647\u0630\u0627 \u0627\u0644\u064a\u0648\u0645' });
          const row = rows[0];
          await sendDailyAccountNotification({
            accountDate: input.accountDate,
            salesCash: Number(row.salesCash ?? 0),
            salesCard: Number(row.salesCard ?? 0),
            salesKita: Number(row.salesKita ?? 0),
            salesOrders: Number(row.salesOrders ?? 0),
            salesNoon: Number(row.salesNoon ?? 0),
            salesDeliveroo: Number(row.salesDeliveroo ?? 0),
            salesCareem: Number(row.salesCareem ?? 0),
            expensesFixed: Number(row.expensesFixed ?? 0),
            expensesSupplierInvoices: 0,
            expensesFreeInvoices: 0,
            expensesPartial: 0,
            supplyToRestaurant: Number(row.supplyToRestaurant ?? 0),
            supplyToManagement: Number(row.supplyToManagement ?? 0),
            supplyExtra: Number(row.supplyExtra ?? 0),
            carryForwardFromPrev: Number(row.carryForwardFromPrev ?? 0),
            carryForwardToNext: Number(row.carryForwardToNext ?? 0),
            notes: row.notes ?? undefined,
          });
          return { success: true };
        } finally {
          await conn.end();
        }
      }),
  }),

  // --- Consumption Calculator ---
  consumption: router({
    calculate: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          productId: z.number(),
          qty: z.number().min(0),
        })).min(1),
      }))
      .mutation(({ input }) => calculateConsumption(input.items)),
  }),
  // ─── Kitchen Consumption Report (تقرير استهلاك المواد الخام)
  kitchenConsumption: router({
    report: protectedProcedure
      .input(z.object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .query(({ input }) => getKitchenConsumptionReport(input.fromDate, input.toDate)),
  }),
  // ─── Supplier Invoice Items Report ───────────────────────────────────────────────────────
  supplierItems: router({
    report: protectedProcedure
      .input(z.object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        supplierId: z.number().nullable().optional(),
      }))
      .query(({ input }) => getSupplierItemsReport(input.fromDate, input.toDate, input.supplierId)),
  }),
  // ─── Kitchen Daily Inventory Count (جرد المطبخ اليومي) ─────────────────────────
  kitchenCount: router({
    initSheet: protectedProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(({ input, ctx }) => getOrInitCountSheet(input.date, ctx.user.id)),
    getSheet: protectedProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .query(({ input }) => getCountSheet(input.date)),
    listDates: protectedProcedure
      .query(() => getCountDates()),
    updateClosing: protectedProcedure
      .input(z.object({
        id: z.number(),
        closingQty: z.number().min(0),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => updateClosingQty(input.id, input.closingQty, input.notes)),
    updateReceived: protectedProcedure
      .input(z.object({
        id: z.number(),
        receivedQty: z.number().min(0),
      }))
      .mutation(({ input }) => updateReceivedQty(input.id, input.receivedQty)),
  }),
  purchaseVsSales: router({
    getReport: protectedProcedure
      .input(z.object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        search: z.string().optional(),
      }))
      .query(({ input }) =>
        getPurchaseVsSalesAnalysis(
          input.fromDate,
          input.toDate,
          input.search
        )
      ),
  }),
  varianceAnalysis: router({
    getReport: protectedProcedure
      .input(z.object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        categoryId: z.number().nullable().optional(),
        materialType: z.enum(["raw", "semi_finished"]).nullable().optional(),
        warnThreshold: z.number().min(0).max(100).optional(),
        criticalThreshold: z.number().min(0).max(100).optional(),
      }))
      .query(({ input }) =>
        getVarianceAnalysis(
          input.fromDate,
          input.toDate,
          input.categoryId ?? null,
          input.materialType ?? null,
          input.warnThreshold ?? 3,
          input.criticalThreshold ?? 8
        )
      ),
  }),
  menu: router({
    // Generate AI-classified menu from products with recipes
    generate: protectedProcedure
      .input(z.object({
        forceRefresh: z.boolean().optional(),
      }))
      .query(async () => {
        const allProducts = await listProducts();
        const activeProducts = allProducts.filter((p: any) => p.isActive && p.showInMenu !== false);
        // Build product list with recipe cost
        const productsWithCost = await Promise.all(
          activeProducts.map(async (p: any) => {
            const items = await getRecipeItems(p.id);
            const recipeCost = items.reduce((sum: number, item: any) => {
              const qty = parseFloat(item.quantity) || 0;
              const price = parseFloat(item.lastPurchasePrice) || 0;
              return sum + qty * price;
            }, 0);
            return {
              id: p.id,
              name: p.name,
              price: parseFloat(p.price) || 0,
              calories: p.calories,
              description: p.description,
              recipeSource: p.recipeSource,
              recipeCost: Math.round(recipeCost * 100) / 100,
              ingredientCount: items.length,
            };
          })
        );
        // Use AI to classify and organize into menu sections
        const productNames = productsWithCost.map((p: any) => p.id + ':' + p.name).join('\n');
        const aiResponse = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `انت خبير في تصميم قوائم المطاعم المصرية. مهمتك تصنيف الاصناف الى اقسام منطقية لقائمة مطعم احترافية.
قواعد التصنيف:
- صنف كل صنف في القسم الانسب له
- رتب الاقسام بالترتيب المنطقي (مقبلات، شوربات، اطباق رئيسية، مشويات، مشروبات، حلويات، الخ)
- اختر اسماً عربياً جميلاً لكل قسم
- رتب الاصناف داخل كل قسم من الاعلى سعراً للاقل
- اضف وصفاً قصيراً جذاباً لكل صنف
ارجع JSON فقط.`,
            },
            {
              role: 'user',
              content: 'صنف هذه الاصناف في قائمة مطعم مصري احترافية:\n' + productNames,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'menu_classification',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  sections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        nameAr: { type: 'string' },
                        nameEn: { type: 'string' },
                        icon: { type: 'string' },
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              productId: { type: 'number' },
                              descriptionAr: { type: 'string' },
                            },
                            required: ['productId', 'descriptionAr'],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ['id', 'nameAr', 'nameEn', 'icon', 'items'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['sections'],
                additionalProperties: false,
              },
            },
          },
        });
        const aiData = JSON.parse(aiResponse.choices[0].message.content as string);
        // Merge AI classification with product data
        const productMap = new Map(productsWithCost.map((p: any) => [p.id, p]));
        const sections = aiData.sections.map((section: any) => ({
          ...section,
          items: section.items
            .map((item: any) => {
              const product = productMap.get(item.productId);
              if (!product) return null;
              return {
                ...product,
                descriptionAr: item.descriptionAr || product.description || '',
              };
            })
            .filter(Boolean),
        })).filter((s: any) => s.items.length > 0);
        return { sections, generatedAt: new Date().toISOString() };
      }),
    save: protectedProcedure
      .input(z.object({
        name: z.string().min(1).default('قائمة الطعام'),
        menuData: z.string(),
        restaurantName: z.string().optional(),
        restaurantLogo: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const saved = await saveMenu({
          name: input.name,
          menuData: input.menuData,
          restaurantName: input.restaurantName,
          restaurantLogo: input.restaurantLogo,
          createdBy: ctx.user.id,
        });
        // Always update the live menu pointer so the fixed URL shows latest
        if (saved) await updateLiveMenu(saved.id);
        return saved;
      }),
    list: protectedProcedure
      .query(() => listSavedMenus()),
    getPublic: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => getPublicMenu(input.token)),
    // Returns the permanent live token (never changes)
    getLiveToken: protectedProcedure
      .query(() => getOrCreateLiveMenuToken()),
    // Public endpoint to get the current live menu by permanent token
    getByLiveToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(({ input }) => getMenuByLiveToken(input.token)),
    // رابط بسيط /menu — بدون token
    getDefault: publicProcedure
      .query(() => getDefaultMenu()),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSavedMenu(input.id)),
    // Get the latest saved menu directly (no AI call)
    getLatestSaved: protectedProcedure
      .query(() => getLatestSavedMenu()),
    // Get live menu: merge saved classification with current products (always up-to-date, no AI)
    getLiveProducts: protectedProcedure
      .query(async () => {
        // 1. Get all active products
        const allProducts = await listProducts();
        const activeProducts = allProducts.filter((p: any) => p.isActive && p.showInMenu !== false);
        // 2. Build product map with recipe cost
        const productsWithCost = await Promise.all(
          activeProducts.map(async (p: any) => {
            const items = await getRecipeItems(p.id);
            const recipeCost = items.reduce((sum: number, item: any) => {
              const qty = parseFloat(item.quantity) || 0;
              const price = parseFloat(item.lastPurchasePrice) || 0;
              return sum + qty * price;
            }, 0);
            return {
              id: p.id,
              name: p.nameAr || p.name,
              nameEn: p.name,
              price: parseFloat(p.price) || 0,
              calories: p.calories,
              description: p.description,
              recipeSource: p.recipeSource,
              recipeCost: Math.round(recipeCost * 100) / 100,
              ingredientCount: items.length,
            };
          })
        );
        const productMap = new Map(productsWithCost.map((p: any) => [p.id, p]));
        // 3. Get latest saved menu for classification
        const savedMenu = await getLatestSavedMenu();
        if (savedMenu) {
          const savedData = JSON.parse(savedMenu.menuData as string);
          const savedSections: any[] = savedData.sections || [];
          const classifiedIds = new Set<number>();
          const sections = savedSections.map((section: any) => {
            const items = (section.items || []).map((item: any) => {
              const productId = item.id || item.productId;
              const product = productMap.get(productId);
              if (!product) return null;
              classifiedIds.add(productId);
              return { ...product, descriptionAr: item.descriptionAr || item.description || '' };
            }).filter(Boolean);
            return { ...section, items };
          }).filter((s: any) => s.items.length > 0);
          // 4. Add unclassified new products to a new section
          const newProducts = productsWithCost.filter((p: any) => !classifiedIds.has(p.id));
          if (newProducts.length > 0) {
            sections.push({
              id: 'new_items',
              nameAr: 'أصناف جديدة',
              nameEn: 'New Items',
              icon: 'new_icon',
              items: newProducts.map((p: any) => ({ ...p, descriptionAr: p.description || '' })),
            });
          }
          return { sections, generatedAt: savedMenu.createdAt, isLive: true };
        }
        // 5. No saved menu: return all products in one section
        return {
          sections: [{
            id: 'all',
            nameAr: 'قائمة الطعام',
            nameEn: 'Menu',
            icon: 'menu_icon',
            items: productsWithCost.map((p: any) => ({ ...p, descriptionAr: p.description || '' })),
          }],
          generatedAt: new Date().toISOString(),
          isLive: true,
        };
      }),
  }),
  // ─── Restaurant WhatsApp Numbers Management ───────────────────────────────────────────
  waNumbers: router({
    list: protectedProcedure.query(() => listWaNumbers()),
    create: protectedProcedure
      .input(z.object({
        label: z.string().min(1),
        phoneNumber: z.string().min(5),
        evolutionApiUrl: z.string().url(),
        evolutionApiKey: z.string().min(1),
        evolutionInstance: z.string().min(1),
        webhookSecret: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createWaNumber(input);
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        label: z.string().min(1).optional(),
        phoneNumber: z.string().min(5).optional(),
        evolutionApiUrl: z.string().url().optional(),
        evolutionApiKey: z.string().min(1).optional(),
        evolutionInstance: z.string().min(1).optional(),
        webhookSecret: z.string().nullable().optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateWaNumber(id, data);
        return { ok: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteWaNumber(input.id);
        return { ok: true };
      }),
    testConnection: protectedProcedure
      .input(z.object({ id: z.number(), webhookOrigin: z.string().optional() }))
      .mutation(async ({ input }) => {
        const num = await getWaNumber(input.id);
        if (!num) throw new TRPCError({ code: 'NOT_FOUND', message: 'الرقم غير موجود' });
        const result = await testEvolutionConnection(num);
        await updateWaNumberStatus(input.id, result.status);

        // Auto-sync and register webhook when connection is confirmed
        if (result.status === 'connected') {
          // Register webhook in Evolution API (non-blocking)
          if (input.webhookOrigin) {
            const webhookUrl = `${input.webhookOrigin}/api/webhook/whatsapp/${num.evolutionInstance}`;
            registerEvolutionWebhook(num, webhookUrl).then((wh) => {
              if (wh.ok) console.log(`[WA-Sync] Webhook registered for ${num.evolutionInstance}: ${webhookUrl}`);
              else console.warn(`[WA-Sync] Webhook registration failed for ${num.evolutionInstance}: ${wh.error}`);
            }).catch(() => {});
          }
          // Start full sync in background (non-blocking)
          syncAllChatsWithMessages(num, { messagesPerChat: 50, analyzeAi: true })
            .then((progress) => {
              console.log(`[WA-Sync] Auto-sync done for ${num.evolutionInstance}:`, progress.syncedChats, 'chats,', progress.totalMessages, 'msgs,', progress.analyzedConversations, 'analyzed');
            })
            .catch((err) => console.error('[WA-Sync] Auto-sync error:', err));
        }

        return result;
      }),
    fullSync: protectedProcedure
      .input(z.object({ id: z.number(), webhookOrigin: z.string().optional() }))
      .mutation(async ({ input }) => {
        const num = await getWaNumber(input.id);
        if (!num) throw new TRPCError({ code: 'NOT_FOUND', message: 'الرقم غير موجود' });
        // Register webhook if origin provided
        if (input.webhookOrigin) {
          const webhookUrl = `${input.webhookOrigin}/api/webhook/whatsapp/${num.evolutionInstance}`;
          await registerEvolutionWebhook(num, webhookUrl);
        }
        // Run full sync
        const progress = await syncAllChatsWithMessages(num, { messagesPerChat: 50, analyzeAi: true });
        return progress;
      }),
    syncChats: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const num = await getWaNumber(input.id);
        if (!num) throw new TRPCError({ code: 'NOT_FOUND', message: 'الرقم غير موجود' });
        const chats = await fetchEvolutionChats(num);
        // Build batch items (skip groups)
        const batchItems: Array<{
          numberId: number;
          contactPhone: string;
          contactName?: string | null;
          contactPushName?: string | null;
          lastMessage?: string | null;
          lastMessageAt?: number | null;
        }> = [];
        for (const chat of chats.slice(0, 500)) {
          const remoteJid: string = (chat as any).remoteJid ?? (chat as any).id ?? '';
          if (!remoteJid || remoteJid.endsWith('@g.us')) continue;
          const contactPhone = remoteJid.replace('@s.whatsapp.net', '');
          const pushName = (chat as any).pushName ?? (chat as any).name ?? null;
          const lm = (chat as any).lastMessage;
          const lastMsg = lm?.message?.conversation
            ?? lm?.message?.extendedTextMessage?.text
            ?? lm?.message?.imageMessage?.caption
            ?? null;
          const rawTs = lm?.messageTimestamp ?? null;
          const lastTs = rawTs ? Number(rawTs) * 1000 : null;
          batchItems.push({
            numberId: input.id,
            contactPhone,
            contactName: pushName,
            contactPushName: pushName,
            lastMessage: lastMsg,
            lastMessageAt: lastTs,
          });
        }
        // Batch upsert in chunks of 100 to avoid query size limits
        let synced = 0;
        for (let i = 0; i < batchItems.length; i += 100) {
          const chunk = batchItems.slice(i, i + 100);
          await batchUpsertConversations(chunk);
          synced += chunk.length;
        }
        return { synced };
      }),
    conversations: protectedProcedure
      .input(z.object({ numberId: z.number() }))
      .query(({ input }) => listConversations(input.numberId)),
    messages: protectedProcedure
      .input(z.object({ conversationId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => listMessages(input.conversationId, input.limit ?? 100)),
    markRead: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .mutation(async ({ input }) => {
        await markConversationRead(input.conversationId);
        return { ok: true };
      }),
    fetchMessages: protectedProcedure
      .input(z.object({ numberId: z.number(), conversationId: z.number(), contactPhone: z.string(), limit: z.number().optional() }))
      .mutation(async ({ input }) => {
        const num = await getWaNumber(input.numberId);
        if (!num) throw new TRPCError({ code: 'NOT_FOUND', message: 'الرقم غير موجود' });
        const remoteJid = `${input.contactPhone}@s.whatsapp.net`;
        const msgs = await fetchEvolutionMessages(num, remoteJid, input.limit ?? 50);
        let saved = 0;
        for (const rawMsg of msgs) {
          const keyData = (rawMsg as any)?.key ?? {};
          const fromMe = keyData?.fromMe === true;
          const msgId = keyData?.id ?? null;
          const ts = (rawMsg as any)?.messageTimestamp ? Number((rawMsg as any).messageTimestamp) * 1000 : Date.now();
          const msgContent = (rawMsg as any)?.message ?? {};
          let body: string | null = null;
          let messageType = 'text';
          if (msgContent.conversation) body = msgContent.conversation;
          else if (msgContent.extendedTextMessage?.text) body = msgContent.extendedTextMessage.text;
          else if (msgContent.imageMessage) { messageType = 'image'; body = msgContent.imageMessage.caption ?? null; }
          else if (msgContent.audioMessage || msgContent.pttMessage) messageType = 'audio';
          else if (msgContent.videoMessage) messageType = 'video';
          else if (msgContent.documentMessage) { messageType = 'document'; body = msgContent.documentMessage.fileName ?? null; }
          const id = await insertWaMessage({
            conversationId: input.conversationId,
            numberId: input.numberId,
            fromMe,
            evolutionMsgId: msgId,
            messageType,
            body,
            timestamp: ts,
          });
          if (id) saved++;
        }
        return { saved };
      }),
  }),

  // ─── WhatsApp Instances Management ─────────────────────────────────────────
  waInstances: router({
    // List all WhatsApp instances
    list: protectedProcedure.query(async () => {
      const { listInstances } = await import("./waIntegration");
      return listInstances();
    }),

    // Create a new WhatsApp instance
    create: protectedProcedure
      .input(z.object({
        label: z.string().min(1),
        phoneNumber: z.string().min(5),
        evolutionApiUrl: z.string().url(),
        evolutionApiKey: z.string().min(1),
        evolutionInstance: z.string().min(1),
        webhookSecret: z.string().optional(),
        restaurantId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createInstance } = await import("./waIntegration");
        const id = await createInstance(input);
        return { id };
      }),

    // Update instance status manually
    updateStatus: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
        status: z.string(),
        connected: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const { updateInstanceStatus } = await import("./waIntegration");
        await updateInstanceStatus(input.instanceId, input.status, input.connected);
        return { ok: true };
      }),

    // Check connection status via Evolution API
    checkConnection: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .mutation(async ({ input }) => {
        const conn = await import("mysql2/promise").then(m => m.default.createConnection(process.env.DATABASE_URL!));
        try {
          const [rows] = await conn.execute(
            "SELECT * FROM whatsapp_instances WHERE id = ? LIMIT 1",
            [input.instanceId]
          ) as any[];
          const instance = rows[0];
          if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
          const res = await fetch(`${instance.evolutionApiUrl}/instance/connectionState/${instance.evolutionInstance}`, {
            headers: { "apikey": instance.evolutionApiKey },
          });
          const data = await res.json() as any;
          const state = data?.instance?.state ?? data?.state ?? "unknown";
          const stateMap: Record<string, string> = {
            open: "connected", close: "disconnected", connecting: "connecting",
          };
          const mappedStatus = stateMap[state] ?? state;
          const { updateInstanceStatus } = await import("./waIntegration");
          await updateInstanceStatus(input.instanceId, mappedStatus, mappedStatus === "connected");
          return { status: mappedStatus, rawState: state };
        } finally {
          await conn.end();
        }
      }),

    // Soft-delete an instance
    delete: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .mutation(async ({ input }) => {
        const conn = await import("mysql2/promise").then(m => m.default.createConnection(process.env.DATABASE_URL!));
        try {
          await conn.execute("UPDATE whatsapp_instances SET isActive = 0 WHERE id = ?", [input.instanceId]);
          return { ok: true };
        } finally {
          await conn.end();
        }
      }),

    // Get AI analytics summary for an instance
    getAnalytics: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input }) => {
        const { getInstanceAnalyticsSummary } = await import("./waAiAnalysis");
        return getInstanceAnalyticsSummary(input.instanceId);
      }),

    // Get webhook URL for an instance (frontend passes its own origin)
    getWebhookUrl: protectedProcedure
      .input(z.object({ instanceId: z.number(), origin: z.string() }))
      .query(async ({ input }) => {
        const conn = await import("mysql2/promise").then(m => m.default.createConnection(process.env.DATABASE_URL!));
        try {
          const [rows] = await conn.execute(
            "SELECT evolutionInstance FROM whatsapp_instances WHERE id = ? LIMIT 1",
            [input.instanceId]
          ) as any[];
          const instance = (rows as any[])[0];
          if (!instance) throw new TRPCError({ code: "NOT_FOUND" });
          const webhookUrl = `${input.origin}/api/webhook/whatsapp/${instance.evolutionInstance}`;
          return { webhookUrl };
        } finally {
          await conn.end();
        }
      }),
  }),

  // ─── WhatsApp AI Analysis Procedures ───────────────────────────────────────
  waAnalysis: router({
    // Get latest analysis for a conversation
    getLatest: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        const { getLatestAnalysis } = await import("./waAiAnalysis");
        return getLatestAnalysis(input.conversationId);
      }),

    // Get all analyses for a conversation (paginated)
    getForConversation: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input }) => {
        const { getConversationAnalyses } = await import("./waAiAnalysis");
        return getConversationAnalyses(input.conversationId, input.limit, input.offset);
      }),

    // Trigger full conversation analysis on-demand
    runFull: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        instanceId: z.number(),
        contactId: z.number(),
        includeReply: z.boolean().default(false),
        restaurantName: z.string().optional(),
        forceRerun: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        const { runFullConversationAnalysis } = await import("./waAiAnalysis");
        return runFullConversationAnalysis(
          input.conversationId,
          input.instanceId,
          input.contactId,
          {
            includeReply: input.includeReply,
            restaurantName: input.restaurantName,
            forceRerun: input.forceRerun,
          }
        );
      }),

    // Analyze a single message on-demand
    analyzeMessage: protectedProcedure
      .input(z.object({
        messageBody: z.string().min(1),
        conversationContext: z.string().optional(),
        includeReply: z.boolean().default(false),
        restaurantName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { analyzeMessage } = await import("./waAiAnalysis");
        return analyzeMessage(input.messageBody, {
          includeReply: input.includeReply,
          conversationContext: input.conversationContext,
          restaurantName: input.restaurantName,
        });
      }),

    // Get AI analytics summary for an instance
    getInstanceSummary: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input }) => {
        const { getInstanceAnalyticsSummary } = await import("./waAiAnalysis");
        return getInstanceAnalyticsSummary(input.instanceId);
      }),

    // Get top issues (high/critical priority) for an instance
    getTopIssues: protectedProcedure
      .input(z.object({
        instanceId: z.number(),
        limit: z.number().min(1).max(50).default(10),
      }))
      .query(async ({ input }) => {
        const { getTopIssues } = await import("./waAiAnalysis");
        return getTopIssues(input.instanceId, input.limit);
      }),

    // Check if a conversation has a recent analysis
    hasRecent: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        analysisType: z.enum(["full","sentiment","behavior","summary","auto_reply_suggestion","complaint_detection","order_extraction"]).default("full"),
        cooldownMinutes: z.number().min(1).max(60).default(5),
      }))
      .query(async ({ input }) => {
        const { hasRecentAnalysis } = await import("./waAiAnalysis");
        const has = await hasRecentAnalysis(
          input.conversationId,
          input.analysisType,
          input.cooldownMinutes * 60 * 1000
        );
        return { hasRecent: has };
      }),
  }),

  // ── WhatsApp Analytics Dashboard ──────────────────────────────────────────
  waAnalyticsDash: router({
    // Full dashboard: all KPIs in one call
    full: protectedProcedure
      .input(z.object({
        fromTs:     z.number().optional(),
        toTs:       z.number().optional(),
        instanceId: z.number().optional(),
        status:     z.enum(["open","pending","resolved","archived","spam"]).optional(),
      }))
      .query(async ({ input }) => {
        const { getWaAnalyticsDashboard } = await import("./waAnalytics");
        return getWaAnalyticsDashboard(input);
      }),

    messageVolume: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getMessageVolume } = await import("./waAnalytics"); return getMessageVolume(input); }),

    firstResponse: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getAvgFirstResponseTime } = await import("./waAnalytics"); return getAvgFirstResponseTime(input); }),

    convsByStatus: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getConvsByStatus } = await import("./waAnalytics"); return getConvsByStatus(input); }),

    complaints: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getComplaintStats } = await import("./waAnalytics"); return getComplaintStats(input); }),

    topIntents: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional(), limit: z.number().min(1).max(20).default(8) }))
      .query(async ({ input }) => { const { getTopIntents } = await import("./waAnalytics"); return getTopIntents(input, input.limit); }),

    sentimentDist: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getSentimentDistribution } = await import("./waAnalytics"); return getSentimentDistribution(input); }),

    busiestHours: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getBusiestHours } = await import("./waAnalytics"); return getBusiestHours(input); }),

    agentPerformance: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getAgentPerformance } = await import("./waAnalytics"); return getAgentPerformance(input); }),

    instanceBreakdown: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional() }))
      .query(async ({ input }) => { const { getInstanceBreakdown } = await import("./waAnalytics"); return getInstanceBreakdown(input); }),

    dailyVolume: protectedProcedure
      .input(z.object({ fromTs: z.number().optional(), toTs: z.number().optional(), instanceId: z.number().optional() }))
      .query(async ({ input }) => { const { getDailyVolume } = await import("./waAnalytics"); return getDailyVolume(input); }),
  }),

  // ─── WhatsApp Batch AI Analysis ───────────────────────────────────────────────
  waBatch: router({
    /** Start batch analysis on all conversations (non-blocking, fire-and-forget) */
    start: protectedProcedure
      .input(z.object({
        numberId: z.number().optional(),
        forceRerun: z.boolean().default(false),
        includeReply: z.boolean().default(true),
        restaurantName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { batchAnalyzeAllConversations } = await import("./waAiAnalysis");
        batchAnalyzeAllConversations(input).catch(console.error);
        return { started: true };
      }),

    /** Get current batch analysis progress */
    progress: protectedProcedure
      .query(async () => {
        const { getBatchProgress } = await import("./waAiAnalysis");
        return getBatchProgress();
      }),

    /** Get analysis for a specific conversation */
    getConvAnalysis: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        const { getLatestAnalysis } = await import("./waAiAnalysis");
        return getLatestAnalysis(input.conversationId);
      }),

    /** Get all conversations with their latest AI analysis (for dashboard view) */
    getConversationsWithAnalysis: protectedProcedure
      .input(z.object({
        numberId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
        sentimentFilter: z.enum(["all", "positive", "negative", "neutral"]).default("all"),
        urgencyFilter: z.enum(["all", "critical", "high", "medium", "low"]).default("all"),
        dateFrom: z.string().optional(),  // YYYY-MM-DD or Unix ms timestamp string
        dateTo: z.string().optional(),    // YYYY-MM-DD or Unix ms timestamp string
        dateFromMs: z.number().optional(), // Unix ms timestamp (preferred, timezone-aware)
        dateToMs: z.number().optional(),   // Unix ms timestamp (preferred, timezone-aware)
      }))
      .query(async ({ input }) => {
        const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
        try {
          // Date filter based on lastMessageAt (Unix ms timestamp)
          // Prefer dateFromMs/dateToMs (timezone-aware Unix ms) over date strings
          const dateFromMs = input.dateFromMs
            ? `AND c.lastMessageAt >= ${input.dateFromMs}`
            : input.dateFrom
            ? `AND c.lastMessageAt >= UNIX_TIMESTAMP(STR_TO_DATE('${input.dateFrom.replace(/'/g, '')}', '%Y-%m-%d')) * 1000`
            : '';
          const dateToMs = input.dateToMs
            ? `AND c.lastMessageAt < ${input.dateToMs}`
            : input.dateTo
            ? `AND c.lastMessageAt < (UNIX_TIMESTAMP(STR_TO_DATE('${input.dateTo.replace(/'/g, '')}', '%Y-%m-%d')) + 86400) * 1000`
            : '';
          const dateFromMsWh = input.dateFromMs
            ? `AND wc.lastMessageAt >= ${input.dateFromMs}`
            : input.dateFrom
            ? `AND wc.lastMessageAt >= UNIX_TIMESTAMP(STR_TO_DATE('${input.dateFrom.replace(/'/g, '')}', '%Y-%m-%d')) * 1000`
            : '';
          const dateToMsWh = input.dateToMs
            ? `AND wc.lastMessageAt < ${input.dateToMs}`
            : input.dateTo
            ? `AND wc.lastMessageAt < (UNIX_TIMESTAMP(STR_TO_DATE('${input.dateTo.replace(/'/g, '')}', '%Y-%m-%d')) + 86400) * 1000`
            : '';

          // AI analysis subquery (no date filter - always get latest analysis for matched conversations)
          const aiSubquery = `(
            SELECT conversationId,
                   ANY_VALUE(sentiment) AS sentiment,
                   ANY_VALUE(sentimentScore) AS sentimentScore,
                   ANY_VALUE(urgencyLevel) AS urgencyLevel,
                   ANY_VALUE(behaviorCategory) AS behaviorCategory,
                   ANY_VALUE(impressionSummary) AS impressionSummary,
                   ANY_VALUE(keyTopics) AS keyTopics,
                   ANY_VALUE(suggestedReply) AS suggestedReply,
                   ANY_VALUE(detectedLanguage) AS detectedLanguage,
                   MAX(analyzedAt) AS analyzedAt
            FROM whatsapp_ai_analysis
            WHERE analysisType = 'full'
            GROUP BY conversationId
          )`;

          // Sentiment/urgency filters for outer query
          const sentimentCond = input.sentimentFilter !== "all" ? `AND a.sentiment = '${input.sentimentFilter.replace(/'/g, '')}'` : '';
          const urgencyCond = input.urgencyFilter !== "all" ? `AND a.urgencyLevel = '${input.urgencyFilter.replace(/'/g, '')}'` : '';

          // UNION of both systems:
          // 1. wa_conversations (old system - has bulk historical data)
          // 2. whatsapp_conversations (new system - receives live webhook messages)
          const unionQuery = `
            SELECT
              CONCAT('wa_', c.id) AS uid,
              c.id AS convId,
              'wa' AS source,
              COALESCE(c.contactPushName, c.contactName, c.contactPhone) AS contactLabel,
              c.contactPhone,
              c.lastMessage AS lastMessageBody,
              c.lastMessageAt,
              c.unreadCount,
              (SELECT COUNT(*) FROM wa_messages WHERE conversationId = c.id) AS messageCount,
              a.sentiment, a.sentimentScore, a.urgencyLevel, a.behaviorCategory,
              a.impressionSummary, a.keyTopics, a.suggestedReply, a.detectedLanguage, a.analyzedAt
            FROM wa_conversations c
            LEFT JOIN ${aiSubquery} a ON a.conversationId = c.id
            WHERE EXISTS (SELECT 1 FROM wa_messages m2 WHERE m2.conversationId = c.id AND m2.body IS NOT NULL AND m2.body != '')
              ${dateFromMs} ${dateToMs}
              ${sentimentCond} ${urgencyCond}

            UNION ALL

            SELECT
              CONCAT('wh_', wc.id) AS uid,
              wc.id AS convId,
              'wh' AS source,
              COALESCE(wct.pushName, wct.profileName, wct.phone) AS contactLabel,
              wct.phone AS contactPhone,
              wc.lastMessageBody,
              wc.lastMessageAt,
              wc.unreadCount,
              (SELECT COUNT(*) FROM whatsapp_messages WHERE conversationId = wc.id) AS messageCount,
              a.sentiment, a.sentimentScore, a.urgencyLevel, a.behaviorCategory,
              a.impressionSummary, a.keyTopics, a.suggestedReply, a.detectedLanguage, a.analyzedAt
            FROM whatsapp_conversations wc
            LEFT JOIN whatsapp_contacts wct ON wct.id = wc.contactId
            LEFT JOIN ${aiSubquery} a ON a.conversationId = wc.id
            WHERE EXISTS (SELECT 1 FROM whatsapp_messages wm2 WHERE wm2.conversationId = wc.id AND wm2.body IS NOT NULL AND wm2.body != '')
              ${dateFromMsWh} ${dateToMsWh}
              ${sentimentCond} ${urgencyCond}
          `;

          // Count total
          const [[countRow]] = await conn.execute(
            `SELECT COUNT(*) as total FROM (${unionQuery}) AS combined`
          ) as [Array<{total: number}>, unknown];

          // Fetch paginated results
          const safeLimit = Math.max(1, Math.min(200, input.limit));
          const safeOffset = Math.max(0, input.offset);
          const [rows] = await conn.execute(
            `SELECT * FROM (${unionQuery}) AS combined
             ORDER BY lastMessageAt DESC
             LIMIT ${safeLimit} OFFSET ${safeOffset}`
          );
          const conversations = (rows as Array<Record<string, unknown>>).map(r => {
            if (typeof r.keyTopics === "string") {
              try { r.keyTopics = JSON.parse(r.keyTopics as string); } catch { r.keyTopics = []; }
            }
            return r;
          });
          return { conversations, total: countRow.total };
        } finally {
          await conn.end();
        }
      }),
    /** Get analysis for multiple conversations (for inbox list sentiment badges) */
    getMultiAnalysis: protectedProcedure
      .input(z.object({ conversationIds: z.array(z.number()).max(100) }))
      .query(async ({ input }) => {
        if (input.conversationIds.length === 0) return {};
        const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
        try {
          const placeholders = input.conversationIds.map(() => "?").join(",");
          const [rows] = await conn.execute(
            `SELECT conversationId, sentiment, sentimentScore, urgencyLevel, behaviorCategory,
                    impressionSummary, keyTopics, suggestedReply, detectedLanguage, analyzedAt
             FROM whatsapp_ai_analysis
             WHERE conversationId IN (${placeholders})
             AND analysisType = 'full'
             ORDER BY analyzedAt DESC`,
            input.conversationIds
          );
          const result: Record<number, unknown> = {};
          for (const row of rows as Array<Record<string, unknown>>) {
            const cid = row.conversationId as number;
            if (!result[cid]) {
              if (typeof row.keyTopics === "string") {
                try { row.keyTopics = JSON.parse(row.keyTopics); } catch { row.keyTopics = []; }
              }
              result[cid] = row;
            }
          }
          return result;
        } finally {
          await conn.end();
        }
      }),

    /** Get full conversation detail: messages + AI analysis (for popup dialog) */
    getConversationDetail: protectedProcedure
      .input(z.object({ conversationId: z.number(), source: z.enum(["wa", "wh"]).optional() }))
      .query(async ({ input }) => {
        const conn = await (await import("mysql2/promise")).createConnection(process.env.DATABASE_URL!);
        try {
          let conv: Record<string, unknown> | undefined;
          let messages: unknown[] = [];
          let source = input.source;

          // Try wa_conversations first (unless source=wh)
          if (source !== "wh") {
            const [[waConv]] = await conn.execute(
              `SELECT c.id, c.numberId, c.contactPhone,
                      COALESCE(c.contactPushName, c.contactName, c.contactPhone) AS contactLabel,
                      c.lastMessage AS lastMessageBody, c.lastMessageAt, c.unreadCount, 'wa' AS source
               FROM wa_conversations c WHERE c.id = ?`,
              [input.conversationId]
            ) as [Array<Record<string, unknown>>, unknown];
            if (waConv) { conv = waConv; source = "wa"; }
          }

          // Try whatsapp_conversations if not found in wa_conversations
          if (!conv) {
            const [[whConv]] = await conn.execute(
              `SELECT wc.id, wc.instanceId AS numberId,
                      COALESCE(wct.phone, '') AS contactPhone,
                      COALESCE(wct.pushName, wct.profileName, wct.phone, '') AS contactLabel,
                      wc.lastMessageBody, wc.lastMessageAt, wc.unreadCount, 'wh' AS source
               FROM whatsapp_conversations wc
               LEFT JOIN whatsapp_contacts wct ON wct.id = wc.contactId
               WHERE wc.id = ?`,
              [input.conversationId]
            ) as [Array<Record<string, unknown>>, unknown];
            if (whConv) { conv = whConv; source = "wh"; }
          }

          if (!conv) return null;

          // Fetch messages from the correct table
          if (source === "wh") {
            const [whMsgs] = await conn.execute(
              `SELECT id, fromMe, messageType, body, mediaUrl, caption, timestamp, status
               FROM whatsapp_messages
               WHERE conversationId = ? AND isDeleted = 0
               ORDER BY timestamp ASC
               LIMIT 100`,
              [input.conversationId]
            );
            messages = whMsgs as unknown[];
          } else {
            const [waMsgs] = await conn.execute(
              `SELECT id, fromMe, messageType, body, mediaUrl, caption, timestamp, status
               FROM wa_messages
               WHERE conversationId = ?
               ORDER BY timestamp ASC
               LIMIT 100`,
              [input.conversationId]
            );
            messages = waMsgs as unknown[];
          }

          const [[analysis]] = await conn.execute(
            `SELECT sentiment, sentimentScore, urgencyLevel, behaviorCategory,
                    impressionSummary, keyTopics, suggestedReply, detectedLanguage,
                    recommendedAction, analyzedAt
             FROM whatsapp_ai_analysis
             WHERE conversationId = ? AND analysisType = 'full'
             ORDER BY analyzedAt DESC LIMIT 1`,
            [input.conversationId]
          ) as [Array<Record<string, unknown>>, unknown];

          if (analysis && typeof analysis.keyTopics === "string") {
            try { analysis.keyTopics = JSON.parse(analysis.keyTopics as string); } catch { analysis.keyTopics = []; }
          }

          return { conversation: conv, messages, analysis: analysis ?? null, source };
        } finally {
          await conn.end();
        }
      }),
    getRestaurantInsights: protectedProcedure
      .input(z.object({
        numberId: z.number().optional(),
        dateFrom: z.string().optional(), // YYYY-MM-DD
        dateTo: z.string().optional(),   // YYYY-MM-DD
        dateFromMs: z.number().optional(), // Unix ms timestamp (preferred, timezone-aware)
        dateToMs: z.number().optional(),   // Unix ms timestamp (preferred, timezone-aware)
      }))
      .query(async ({ input }) => {
        const conn = await (mysql as any).createConnection(process.env.DATABASE_URL!);
        try {
          // Build date filter based on lastMessageAt (Unix ms) via JOIN with wa_conversations
          // Prefer dateFromMs/dateToMs (timezone-aware Unix ms) over date strings
          const riDateFrom = input.dateFromMs
            ? `AND c.lastMessageAt >= ${input.dateFromMs}`
            : input.dateFrom
            ? `AND c.lastMessageAt >= UNIX_TIMESTAMP(STR_TO_DATE('${input.dateFrom.replace(/'/g, '')}', '%Y-%m-%d')) * 1000`
            : '';
          const riDateTo = input.dateToMs
            ? `AND c.lastMessageAt < ${input.dateToMs}`
            : input.dateTo
            ? `AND c.lastMessageAt < (UNIX_TIMESTAMP(STR_TO_DATE('${input.dateTo.replace(/'/g, '')}', '%Y-%m-%d')) + 86400) * 1000`
            : '';
          const dateFilter = `${riDateFrom} ${riDateTo}`;
          // 1. KPI Summary - join wa_conversations to filter by lastMessageAt
          const [[kpi]] = await conn.query(`
            SELECT
              COUNT(DISTINCT a.conversationId) as analyzedConvs,
              SUM(CASE WHEN a.urgencyLevel IN ('high','critical') THEN 1 ELSE 0 END) as urgentCount,
              SUM(CASE WHEN a.urgencyLevel = 'critical' THEN 1 ELSE 0 END) as criticalCount,
              AVG(CASE WHEN a.sentimentScore IS NOT NULL THEN a.sentimentScore ELSE NULL END) as avgSentiment,
              AVG(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.satisfactionScore') IS NOT NULL
                  THEN JSON_EXTRACT(a.rawAnalysisJson, '$.satisfactionScore') ELSE NULL END) as avgSatisfaction,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.requiresHumanEscalation') = true THEN 1 ELSE 0 END) as needsEscalation,
              SUM(CASE WHEN a.sentiment = 'negative' THEN 1 ELSE 0 END) as negativeCount,
              SUM(CASE WHEN a.sentiment = 'positive' THEN 1 ELSE 0 END) as positiveCount,
              SUM(CASE WHEN a.sentiment = 'neutral' THEN 1 ELSE 0 END) as neutralCount,
              SUM(CASE WHEN a.sentiment = 'mixed' THEN 1 ELSE 0 END) as mixedCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'complaint' THEN 1 ELSE 0 END) as complaintCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'order_inquiry' THEN 1 ELSE 0 END) as orderCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'reservation' THEN 1 ELSE 0 END) as reservationCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'delivery_issue' THEN 1 ELSE 0 END) as deliveryIssueCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'menu_question' THEN 1 ELSE 0 END) as menuQuestionCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'feedback' THEN 1 ELSE 0 END) as feedbackCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'greeting' THEN 1 ELSE 0 END) as greetingCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'support_request' THEN 1 ELSE 0 END) as supportCount,
              SUM(CASE WHEN JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'general_inquiry' THEN 1 ELSE 0 END) as generalCount,
              SUM(a.messageCountAnalyzed) as totalMessagesAnalyzed,
              COUNT(CASE WHEN JSON_LENGTH(a.extractedOrderItems) > 0 THEN 1 END) as convsWithOrders
            FROM whatsapp_ai_analysis a
            LEFT JOIN wa_conversations c ON c.id = a.conversationId
            WHERE a.analysisType = 'full' ${dateFilter}
          `) as [Array<Record<string,unknown>>, unknown];

          // 2. Intent distribution for chart
          const intentDist = [
            { intent: 'order_inquiry', label: 'استفسار طلب', labelEn: 'Order Inquiry', count: Number(kpi.orderCount || 0), color: '#3b82f6' },
            { intent: 'complaint', label: 'شكوى', labelEn: 'Complaint', count: Number(kpi.complaintCount || 0), color: '#ef4444' },
            { intent: 'reservation', label: 'حجز', labelEn: 'Reservation', count: Number(kpi.reservationCount || 0), color: '#8b5cf6' },
            { intent: 'delivery_issue', label: 'مشكلة توصيل', labelEn: 'Delivery Issue', count: Number(kpi.deliveryIssueCount || 0), color: '#f97316' },
            { intent: 'menu_question', label: 'سؤال عن القائمة', labelEn: 'Menu Question', count: Number(kpi.menuQuestionCount || 0), color: '#06b6d4' },
            { intent: 'feedback', label: 'تغذية راجعة', labelEn: 'Feedback', count: Number(kpi.feedbackCount || 0), color: '#10b981' },
            { intent: 'support_request', label: 'طلب دعم', labelEn: 'Support', count: Number(kpi.supportCount || 0), color: '#f59e0b' },
            { intent: 'general_inquiry', label: 'استفسار عام', labelEn: 'General', count: Number(kpi.generalCount || 0), color: '#6b7280' },
            { intent: 'greeting', label: 'تحية', labelEn: 'Greeting', count: Number(kpi.greetingCount || 0), color: '#a3e635' },
          ].filter(i => i.count > 0).sort((a, b) => b.count - a.count);

          // 3. Sentiment distribution for donut
          const sentimentDist = [
            { sentiment: 'positive', label: 'إيجابي', labelEn: 'Positive', count: Number(kpi.positiveCount || 0), color: '#10b981' },
            { sentiment: 'neutral', label: 'محايد', labelEn: 'Neutral', count: Number(kpi.neutralCount || 0), color: '#6b7280' },
            { sentiment: 'negative', label: 'سلبي', labelEn: 'Negative', count: Number(kpi.negativeCount || 0), color: '#ef4444' },
            { sentiment: 'mixed', label: 'مختلط', labelEn: 'Mixed', count: Number(kpi.mixedCount || 0), color: '#f59e0b' },
          ].filter(i => i.count > 0);

          // 4. Top mentioned menu items from extractedOrderItems
          const [orderRows] = await conn.query(`
            SELECT a.extractedOrderItems FROM whatsapp_ai_analysis a
            LEFT JOIN wa_conversations c ON c.id = a.conversationId
            WHERE JSON_LENGTH(a.extractedOrderItems) > 0 AND a.analysisType = 'full' ${dateFilter}
          `) as [Array<Record<string,unknown>>, unknown];
          const itemCount: Record<string, number> = {};
          for (const row of orderRows) {
            const items = Array.isArray(row.extractedOrderItems) ? row.extractedOrderItems : [];
            for (const item of items) {
              const key = String(item).trim();
              if (key) itemCount[key] = (itemCount[key] || 0) + 1;
            }
          }
          const topMenuItems = Object.entries(itemCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([item, count]) => ({ item, count }));

          // 5. Behavior category distribution
          const [behaviorRows] = await conn.query(`
            SELECT a.behaviorCategory, COUNT(*) as count
            FROM whatsapp_ai_analysis a
            LEFT JOIN wa_conversations c ON c.id = a.conversationId
            WHERE a.analysisType = 'full' ${dateFilter} AND a.behaviorCategory IS NOT NULL
            GROUP BY a.behaviorCategory ORDER BY count DESC
          `) as [Array<Record<string,unknown>>, unknown];
          const behaviorLabels: Record<string, string> = {
            loyal_customer: 'عميل وفي',
            first_time: 'عميل جديد',
            complainer: 'عميل شاكٍ',
            price_sensitive: 'حساس للسعر',
            vip: 'VIP',
            general: 'عام',
          };
          const behaviorDist = behaviorRows.map(r => ({
            category: String(r.behaviorCategory),
            label: behaviorLabels[String(r.behaviorCategory)] || String(r.behaviorCategory),
            count: Number(r.count),
          }));

          // 6. Urgent conversations needing action
          const [urgentConvs] = await conn.query(`
            SELECT a.conversationId, a.urgencyLevel, a.sentiment,
                   ANY_VALUE(a.impressionSummary) as impressionSummary,
                   ANY_VALUE(a.suggestedReply) as suggestedReply,
                   ANY_VALUE(JSON_EXTRACT(a.rawAnalysisJson, '$.intent')) as intent,
                   ANY_VALUE(JSON_EXTRACT(a.rawAnalysisJson, '$.requiresHumanEscalation')) as requiresEscalation,
                   ANY_VALUE(c.contactName) as contactLabel,
                   ANY_VALUE(c.contactPhone) as contactPhone,
                   ANY_VALUE(a.analyzedAt) as analyzedAt
            FROM whatsapp_ai_analysis a
            LEFT JOIN wa_conversations c ON c.id = a.conversationId
            WHERE a.analysisType = 'full' ${dateFilter}
              AND (a.urgencyLevel IN ('high','critical')
                   OR a.sentiment = 'negative'
                   OR JSON_EXTRACT(a.rawAnalysisJson, '$.requiresHumanEscalation') = true
                   OR JSON_EXTRACT(a.rawAnalysisJson, '$.intent') = 'complaint')
            GROUP BY a.conversationId, a.urgencyLevel, a.sentiment
            ORDER BY FIELD(MIN(a.urgencyLevel),'critical','high','medium','low'), MAX(a.analyzedAt) DESC
            LIMIT 20
          `) as [Array<Record<string,unknown>>, unknown];

          // 7. Response rate analysis
          const [[responseStats]] = await conn.query(`
            SELECT
              COUNT(DISTINCT conversationId) as totalConvs,
              SUM(CASE WHEN outboundCount > 0 THEN 1 ELSE 0 END) as respondedConvs,
              AVG(CASE WHEN outboundCount > 0 THEN outboundCount ELSE NULL END) as avgReplies
            FROM (
              SELECT conversationId,
                     SUM(fromMe = 1) as outboundCount,
                     SUM(fromMe = 0) as inboundCount
              FROM wa_messages
              WHERE body IS NOT NULL AND body != ''
              GROUP BY conversationId
            ) sub
          `) as [Array<Record<string,unknown>>, unknown];

          // 8. Key topics frequency
          const [topicRows] = await conn.query(`
            SELECT a.keyTopics FROM whatsapp_ai_analysis a
            LEFT JOIN wa_conversations c ON c.id = a.conversationId
            WHERE a.keyTopics IS NOT NULL AND a.analysisType = 'full' ${dateFilter}
          `) as [Array<Record<string,unknown>>, unknown];
          const topicCount: Record<string, number> = {};
          const skipTopics = new Set(['agent_message','no_customer_input','agent_messages_only','welcome','customer_service']);
          for (const row of topicRows) {
            const topics = Array.isArray(row.keyTopics) ? row.keyTopics : [];
            for (const t of topics) {
              const key = String(t).trim();
              if (key && !skipTopics.has(key)) topicCount[key] = (topicCount[key] || 0) + 1;
            }
          }
          const topTopics = Object.entries(topicCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([topic, count]) => ({ topic, count }));

          return {
            kpi: {
              analyzedConvs: Number(kpi.analyzedConvs || 0),
              urgentCount: Number(kpi.urgentCount || 0),
              criticalCount: Number(kpi.criticalCount || 0),
              avgSentiment: kpi.avgSentiment ? Number(Number(kpi.avgSentiment).toFixed(2)) : null,
              avgSatisfaction: kpi.avgSatisfaction ? Number(Number(kpi.avgSatisfaction).toFixed(1)) : null,
              needsEscalation: Number(kpi.needsEscalation || 0),
              negativeCount: Number(kpi.negativeCount || 0),
              positiveCount: Number(kpi.positiveCount || 0),
              complaintCount: Number(kpi.complaintCount || 0),
              orderCount: Number(kpi.orderCount || 0),
              totalMessagesAnalyzed: Number(kpi.totalMessagesAnalyzed || 0),
              convsWithOrders: Number(kpi.convsWithOrders || 0),
              responseRate: responseStats ? (Number(responseStats.respondedConvs) / Math.max(Number(responseStats.totalConvs), 1) * 100) : 0,
            },
            intentDist,
            sentimentDist,
            topMenuItems,
            behaviorDist,
            urgentConvs,
            topTopics,
          };
        } finally {
          await conn.end();
        }
      }),
  }),
});

