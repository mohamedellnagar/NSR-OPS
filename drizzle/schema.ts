import {
  int,
  smallint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index,
  uniqueIndex,
  date,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  // openId kept as optional for SDK compatibility (not used in custom auth)
  openId: varchar("openId", { length: 64 }),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 256 }).notNull(),
  role: mysqlEnum("role", ["admin", "warehouse_manager", "viewer"]).default("viewer").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  // JSON array of allowed page keys e.g. '["dashboard","materials","transactions"]'
  // null means all pages allowed (used for admin role)
  allowedPages: text("allowedPages"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Material Categories ──────────────────────────────────────────────────────
export const materialCategories = mysqlTable("material_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  nameAr: varchar("nameAr", { length: 128 }),
  description: text("description"),
  color: varchar("color", { length: 32 }).default("#6366f1"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MaterialCategory = typeof materialCategories.$inferSelect;
export type InsertMaterialCategory = typeof materialCategories.$inferInsert;

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  nameAr: varchar("nameAr", { length: 256 }),
  contactPerson: varchar("contactPerson", { length: 128 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  notes: text("notes"),
  whatsappPhone: varchar("whatsappPhone", { length: 32 }), // for automated PO sending
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

// ─── Raw Materials ────────────────────────────────────────────────────────────
export const rawMaterials = mysqlTable(
  "raw_materials",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 256 }).notNull(),
    nameAr: varchar("nameAr", { length: 256 }),
    categoryId: int("categoryId").references(() => materialCategories.id),
    unit: varchar("unit", { length: 32 }).notNull().default("kg"),
    outputQuantity: decimal("outputQuantity", { precision: 12, scale: 3 }).notNull().default("1"),
    shelfLife: int("shelfLife"),
    storageLocation: varchar("storageLocation", { length: 64 }),
    defaultWastePercent: decimal("defaultWastePercent", { precision: 5, scale: 2 }).notNull().default("0"),
    currentQuantity: decimal("currentQuantity", { precision: 12, scale: 3 }).notNull().default("0"),
    minimumQuantity: decimal("minimumQuantity", { precision: 12, scale: 3 }).notNull().default("0"),
    reorderQuantity: decimal("reorderQuantity", { precision: 12, scale: 3 }).default("0"),
    lastPurchasePrice: decimal("lastPurchasePrice", { precision: 12, scale: 3 }),
    averageCost: decimal("averageCost", { precision: 12, scale: 3 }).default("0"),
    notes: text("notes"),
    materialType: varchar("materialType", { length: 32 }).notNull().default("raw"), // 'raw' | 'semi_finished'
    recipeStatus: mysqlEnum("recipeStatus", ["draft","pending","approved","suspended","archived"]).default("draft").notNull(),
    recipeVersion: smallint("recipeVersion").notNull().default(1),
    approvedBy: int("approvedBy").references(() => users.id, { onDelete: "set null" }),
    approvalDate: timestamp("approvalDate"),
    changeLog: text("changeLog"),
    isActive: boolean("isActive").default(true).notNull(),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_rm_category").on(t.categoryId), index("idx_rm_code").on(t.code)]
);

export type RawMaterial = typeof rawMaterials.$inferSelect;
export type InsertRawMaterial = typeof rawMaterials.$inferInsert;

// ─── Semi-Finished Material Recipes ──────────────────────────────────────────
// Each semi-finished material has a recipe composed of raw materials
export const semiFinishedRecipes = mysqlTable(
  "semi_finished_recipes",
  {
    id: int("id").autoincrement().primaryKey(),
    materialId: int("materialId").notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
    ingredientId: int("ingredientId").notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
    quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
    actualQuantity: decimal("actualQuantity", { precision: 12, scale: 4 }),
    unit: varchar("unit", { length: 50 }).notNull().default("g"),
    expectedWastePercent: decimal("expectedWastePercent", { precision: 5, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_sfr_material").on(t.materialId),
    index("idx_sfr_ingredient").on(t.ingredientId),
  ]
);
export type SemiFinishedRecipe = typeof semiFinishedRecipes.$inferSelect;
export type InsertSemiFinishedRecipe = typeof semiFinishedRecipes.$inferInsert;

// ─── Semi-Finished Recipe Version History ────────────────────────────────────
export const semiFinishedRecipeVersions = mysqlTable(
  "semi_finished_recipe_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    materialId: int("materialId").notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
    version: smallint("version").notNull().default(1),
    status: mysqlEnum("status", ["draft","pending","approved","suspended","archived"]).notNull().default("draft"),
    ingredientsSnapshot: json("ingredientsSnapshot"),
    totalCost: decimal("totalCost", { precision: 12, scale: 3 }).default("0"),
    costPerUnit: decimal("costPerUnit", { precision: 12, scale: 3 }).default("0"),
    outputQuantity: decimal("outputQuantity", { precision: 12, scale: 3 }).default("1"),
    outputUnit: varchar("outputUnit", { length: 32 }),
    changeLog: text("changeLog"),
    createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
    approvedBy: int("approvedBy").references(() => users.id, { onDelete: "set null" }),
    approvalDate: timestamp("approvalDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_sfv_material").on(t.materialId),
    index("idx_sfv_version").on(t.materialId, t.version),
  ]
);
export type SemiFinishedRecipeVersion = typeof semiFinishedRecipeVersions.$inferSelect;

// ─── Inventory Transactions ───────────────────────────────────────────────────
export const inventoryTransactions = mysqlTable(
  "inventory_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    materialId: int("materialId")
      .references(() => rawMaterials.id, { onDelete: "set null" }),
    transactionType: mysqlEnum("transactionType", ["IN", "OUT", "ADJUSTMENT"]).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 3 }),
    totalAmount: decimal("totalAmount", { precision: 12, scale: 3 }),
    supplierId: int("supplierId").references(() => suppliers.id),
    supplierName: varchar("supplierName", { length: 256 }),
    destination: varchar("destination", { length: 256 }),
    reason: mysqlEnum("reason", [
      "purchase",
      "production",
      "waste",
      "transfer",
      "return",
      "adjustment",
      "other",
      "opening_balance",
    ]),
    movementStatus: mysqlEnum("movementStatus", ["draft","posted","reversed","cancelled"]).notNull().default("posted"),
    referenceNumber: varchar("referenceNumber", { length: 128 }),
    referenceType: varchar("referenceType", { length: 64 }),
    reversingTransactionId: int("reversingTransactionId"),
    quantityBefore: decimal("quantityBefore", { precision: 12, scale: 3 }),
    quantityAfter: decimal("quantityAfter", { precision: 12, scale: 3 }),
    transactionDate: timestamp("transactionDate").defaultNow().notNull(),
    expiryDate: date("expiryDate"),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_tx_material").on(t.materialId),
    index("idx_tx_type").on(t.transactionType),
    index("idx_tx_date").on(t.transactionDate),
    index("idx_tx_supplier").on(t.supplierId),
    index("idx_tx_expiry").on(t.expiryDate),
  ]
);

export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type InsertInventoryTransaction = typeof inventoryTransactions.$inferInsert;

// ─── Invoices ────────────────────────────────────────────────────────────────────────────────
export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull().unique(),
    invoiceStatus: mysqlEnum("invoiceStatus", ["draft","pending","approved","rejected","cancelled"]).notNull().default("approved"),
    supplierId: int("supplierId").references(() => suppliers.id),
    supplierName: varchar("supplierName", { length: 256 }),
    supplierInvoiceNumber: varchar("supplierInvoiceNumber", { length: 128 }),
    invoiceDate: timestamp("invoiceDate").defaultNow().notNull(),
    dueDate: date("dueDate"),
    subtotal: decimal("subtotal", { precision: 14, scale: 3 }).notNull().default("0"),
    vatEnabled: boolean("vatEnabled").default(false).notNull(),
    vatRate: decimal("vatRate", { precision: 5, scale: 2 }).default("5.00"),
    vatMode: mysqlEnum("vatMode", ["exclusive","inclusive"]).notNull().default("exclusive"),
    vatAmount: decimal("vatAmount", { precision: 14, scale: 3 }).notNull().default("0"),
    totalAmount: decimal("totalAmount", { precision: 14, scale: 3 }).notNull().default("0"),
    paymentStatus: mysqlEnum("paymentStatus", ["paid", "deferred", "partial", "under_review"]).default("deferred").notNull(),
    paidAmount: decimal("paidAmount", { precision: 14, scale: 3 }).default("0"),
    remainingAmount: decimal("remainingAmount", { precision: 14, scale: 3 }).default("0"),
    paidAt: timestamp("paidAt"),
    notes: text("notes"),
    expenseCategory: mysqlEnum("expenseCategory", ["operational", "maintenance", "fixed", "other"]).default("other"),
    stockUpdated: boolean("stockUpdated").default(false).notNull(),
    postToInventory: boolean("postToInventory").notNull().default(false),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_inv_supplier").on(t.supplierId),
    index("idx_inv_date").on(t.invoiceDate),
    index("idx_inv_status").on(t.paymentStatus),
    index("idx_inv_paidAt").on(t.paidAt),
  ]
);

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

export const invoiceItems = mysqlTable(
  "invoice_items",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    materialId: int("materialId").references(() => rawMaterials.id, { onDelete: "set null" }),
    materialName: varchar("materialName", { length: 256 }).notNull(),
    materialUnit: varchar("materialUnit", { length: 32 }).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 3 }).notNull(),
    totalPrice: decimal("totalPrice", { precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    index("idx_ii_invoice").on(t.invoiceId),
    index("idx_ii_material").on(t.materialId),
  ]
);

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;

// ─── Kitchen Daily Production ─────────────────────────────────────────────────
// Tracks each finished product produced per day
export const kitchenDailyProduction = mysqlTable(
  "kitchen_daily_production",
  {
    id: int("id").autoincrement().primaryKey(),
    productionDate: timestamp("productionDate").notNull(),
    productName: varchar("productName", { length: 256 }).notNull(),
    productNameAr: varchar("productNameAr", { length: 256 }),
    unit: varchar("unit", { length: 32 }).notNull().default("portion"),
    openingBalance: decimal("openingBalance", { precision: 12, scale: 3 }).notNull().default("0"),
    producedQuantity: decimal("producedQuantity", { precision: 12, scale: 3 }).notNull().default("0"),
    usedQuantity: decimal("usedQuantity", { precision: 12, scale: 3 }).notNull().default("0"),
    closingBalance: decimal("closingBalance", { precision: 12, scale: 3 }).notNull().default("0"),
    actualUnitCost: decimal("actualUnitCost", { precision: 12, scale: 4 }),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_kdp_date").on(t.productionDate),
    index("idx_kdp_product").on(t.productName),
  ]
);

export type KitchenDailyProduction = typeof kitchenDailyProduction.$inferSelect;
export type InsertKitchenDailyProduction = typeof kitchenDailyProduction.$inferInsert;

// Materials consumed per production record
export const kitchenProductionMaterials = mysqlTable(
  "kitchen_production_materials",
  {
    id: int("id").autoincrement().primaryKey(),
    productionId: int("productionId").notNull().references(() => kitchenDailyProduction.id, { onDelete: "cascade" }),
    rawMaterialId: int("rawMaterialId").references(() => rawMaterials.id, { onDelete: "cascade" }),
    materialName: varchar("materialName", { length: 256 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    consumedQuantity: decimal("consumedQuantity", { precision: 12, scale: 3 }).notNull(),
    wasteQty: decimal("wasteQty", { precision: 12, scale: 3 }).default("0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_kpm_production").on(t.productionId),
    index("idx_kpm_material").on(t.rawMaterialId),
  ]
);

export type KitchenProductionMaterial = typeof kitchenProductionMaterials.$inferSelect;
export type InsertKitchenProductionMaterial = typeof kitchenProductionMaterials.$inferInsert;

// Inventory count (جرد) per production record
export const kitchenProductionCounts = mysqlTable(
  "kitchen_production_counts",
  {
    id: int("id").autoincrement().primaryKey(),
    productionId: int("productionId").notNull().references(() => kitchenDailyProduction.id, { onDelete: "cascade" }),
    actualCount: decimal("actualCount", { precision: 12, scale: 3 }).notNull(),
    notes: text("notes"),
    countedBy: int("countedBy").references(() => users.id),
    countedAt: timestamp("countedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_kpc_production").on(t.productionId),
  ]
);

export type KitchenProductionCount = typeof kitchenProductionCounts.$inferSelect;
export type InsertKitchenProductionCount = typeof kitchenProductionCounts.$inferInsert;

// Kitchen products list (for combobox autocomplete in production form)
export const kitchenProducts = mysqlTable(
  "kitchen_products",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 256 }).notNull().unique(),
    nameAr: varchar("nameAr", { length: 256 }),
    unit: varchar("unit", { length: 32 }).notNull().default("حصة"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_kp_name").on(t.name),
  ]
);
export type KitchenProduct = typeof kitchenProducts.$inferSelect;
export type InsertKitchenProduct = typeof kitchenProducts.$inferInsert;

// ─── Products (Menu Items) ────────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  sku: varchar("sku", { length: 100 }).notNull().unique(),
  categoryReference: varchar("categoryReference", { length: 100 }),
  price: decimal("price", { precision: 12, scale: 4 }),
  cost: decimal("cost", { precision: 12, scale: 4 }),
  description: text("description"),
  calories: int("calories"),
  isActive: boolean("isActive").default(true).notNull(),
  showInMenu: boolean("showInMenu").default(true).notNull(),
  recipeSource: varchar("recipeSource", { length: 20 }), // 'ai' | 'manual' | null
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_products_sku").on(t.sku),
  index("idx_products_name").on(t.name),
]);
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Kitchen Daily Pulls ─────────────────────────────────────────────────────
// Tracks daily material withdrawals from inventory to kitchen
export const kitchenDailyPulls = mysqlTable(
  "kitchen_daily_pulls",
  {
    id: int("id").autoincrement().primaryKey(),
    pullDate: timestamp("pullDate").notNull(),
    materialId: int("materialId").references(() => rawMaterials.id, { onDelete: "set null" }),
    materialName: varchar("materialName", { length: 256 }).notNull(),
    materialNameAr: varchar("materialNameAr", { length: 256 }),
    materialType: varchar("materialType", { length: 32 }).notNull().default("raw"), // 'raw' | 'semi_finished'
    unit: varchar("unit", { length: 32 }).notNull(),
    pulledQuantity: decimal("pulledQuantity", { precision: 12, scale: 3 }).notNull(),
    // Actual yield from production (may differ from pulledQuantity which drives ingredient deductions)
    actualYield: decimal("actualYield", { precision: 12, scale: 3 }),
    ordersConsumed: decimal("ordersConsumed", { precision: 12, scale: 3 }).default("0"),
    // End-of-day count
    closingCount: decimal("closingCount", { precision: 12, scale: 3 }),
    // Carry-forward to next day
    carriedForward: decimal("carriedForward", { precision: 12, scale: 3 }).default("0"),
    // For semi_finished: the raw material equivalent of the carried forward quantity
    carriedRawQty: decimal("carriedRawQty", { precision: 12, scale: 3 }).default("0"),
    // Waste = pulledQuantity - closingCount - carriedForward
    wasteQty: decimal("wasteQty", { precision: 12, scale: 3 }).default("0"),
    status: mysqlEnum("status", ["open", "counted", "closed"]).default("open").notNull(),
    // true if this record was carried forward from a previous day (not produced today)
    isCarriedForward: boolean("isCarriedForward").default(false).notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_kdpull_date").on(t.pullDate),
    index("idx_kdpull_material").on(t.materialId),
  ]
);
export type KitchenDailyPull = typeof kitchenDailyPulls.$inferSelect;
export type InsertKitchenDailyPull = typeof kitchenDailyPulls.$inferInsert;

// ─── Waste Logs (Unified) ─────────────────────────────────────────────────────
// Tracks all waste events from all sources
export const wasteLogs = mysqlTable(
  "waste_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    wasteDate: timestamp("wasteDate").notNull(),
    materialId: int("materialId").references(() => rawMaterials.id, { onDelete: "set null" }),
    materialName: varchar("materialName", { length: 256 }).notNull(),
    materialNameAr: varchar("materialNameAr", { length: 256 }),
    unit: varchar("unit", { length: 32 }).notNull(),
    wasteQty: decimal("wasteQty", { precision: 12, scale: 3 }).notNull(),
    unitCost: decimal("unitCost", { precision: 12, scale: 3 }),
    totalCost: decimal("totalCost", { precision: 12, scale: 3 }),
    // Source of waste
    source: mysqlEnum("source", ["kitchen", "raw_material", "semi_finished"]).notNull(),
    // Reference to the pull or transaction that caused the waste
    referenceId: int("referenceId"),
    reason: varchar("reason", { length: 256 }),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_wl_date").on(t.wasteDate),
    index("idx_wl_material").on(t.materialId),
    index("idx_wl_source").on(t.source),
  ]
);
export type WasteLog = typeof wasteLogs.$inferSelect;
export type InsertWasteLog = typeof wasteLogs.$inferInsert;

// ─── Recipe Items ─────────────────────────────────────────────────────────────
export const recipeItems = mysqlTable("recipe_items", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  materialId: int("materialId").notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
  wastePercent: decimal("wastePercent", { precision: 5, scale: 2 }).notNull().default("0"),
  unit: varchar("unit", { length: 50 }).notNull().default("g"),
  notes: varchar("notes", { length: 255 }),
  allergens: text("allergens"), // comma-separated: "gluten,dairy,nuts,eggs,soy,seafood,sesame"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_recipe_product").on(t.productId),
  index("idx_recipe_material").on(t.materialId),
]);
export type RecipeItem = typeof recipeItems.$inferSelect;
export type InsertRecipeItem = typeof recipeItems.$inferInsert;

// ─── App Settings ─────────────────────────────────────────────────────────────
// Single-row settings table (always id=1). Use upsert to update.
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  // Restaurant info
  restaurantName: varchar("restaurantName", { length: 255 }).default("مطعمي").notNull(),
  restaurantNameEn: varchar("restaurantNameEn", { length: 255 }).default("My Restaurant"),
  phone: varchar("phone", { length: 50 }),
  phone2: varchar("phone2", { length: 50 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }).default("UAE"),
  // Timing settings
  timezone: varchar("timezone", { length: 64 }).default("Asia/Dubai").notNull(),
  // Business day start hour (0-23) in local timezone. Default 6 = 6AM.
  businessDayStartHour: int("businessDayStartHour").default(6).notNull(),
  // Currency
  currency: varchar("currency", { length: 10 }).default("AED").notNull(),
  currencySymbol: varchar("currencySymbol", { length: 10 }).default("د.إ").notNull(),
  // VAT
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }).default("5.00").notNull(),
  vatEnabled: boolean("vatEnabled").default(true).notNull(),
  // COGS: Opening stock value (قيمة مخزون أول المدة)
  openingStockValue: decimal("openingStockValue", { precision: 14, scale: 2 }).default("0").notNull(),
  // AI: OpenAI API key (used by AI Chef, material categorizer, material enhancer)
  openaiApiKey: varchar("openaiApiKey", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppSettings = typeof appSettings.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// ─── BUTCHER SHOP MODULE (ملحمة) ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Butcher Products ─────────────────────────────────────────────────────────
// Products sold in the butcher shop (e.g. كباب, لحم مفروم, شاورما)
export const butcherProducts = mysqlTable(
  "butcher_products",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    nameAr: varchar("nameAr", { length: 256 }),
    unit: varchar("unit", { length: 32 }).notNull().default("kg"), // kg, piece, portion
    pricePerUnit: decimal("pricePerUnit", { precision: 12, scale: 3 }).notNull().default("0"),
    // soldByWeight: if true, cashier enters weight and price = weight * pricePerUnit
    soldByWeight: boolean("soldByWeight").default(false).notNull(),
    currentStock: decimal("currentStock", { precision: 12, scale: 3 }).notNull().default("0"),
    isActive: boolean("isActive").default(true).notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_bp_name").on(t.name),
  ]
);
export type ButcherProduct = typeof butcherProducts.$inferSelect;
export type InsertButcherProduct = typeof butcherProducts.$inferInsert;

// ─── Butcher Recipes ──────────────────────────────────────────────────────────
// Each butcher product has a recipe: which raw materials are consumed to produce it
export const butcherRecipes = mysqlTable(
  "butcher_recipes",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull().references(() => butcherProducts.id, { onDelete: "cascade" }),
    materialId: int("materialId").notNull().references(() => rawMaterials.id, { onDelete: "cascade" }),
    quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(), // quantity of material per unit of product
    unit: varchar("unit", { length: 50 }).notNull().default("kg"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_br_product").on(t.productId),
    index("idx_br_material").on(t.materialId),
  ]
);
export type ButcherRecipe = typeof butcherRecipes.$inferSelect;
export type InsertButcherRecipe = typeof butcherRecipes.$inferInsert;

// ─── Butcher Production ───────────────────────────────────────────────────────
// Each production batch: produces a quantity of a butcher product
export const butcherProduction = mysqlTable(
  "butcher_production",
  {
    id: int("id").autoincrement().primaryKey(),
    productionDate: timestamp("productionDate").notNull(),
    productId: int("productId").notNull().references(() => butcherProducts.id),
    productName: varchar("productName", { length: 256 }).notNull(),
    productNameAr: varchar("productNameAr", { length: 256 }),
    unit: varchar("unit", { length: 32 }).notNull().default("kg"),
    producedQuantity: decimal("producedQuantity", { precision: 12, scale: 3 }).notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_bprod_date").on(t.productionDate),
    index("idx_bprod_product").on(t.productId),
  ]
);
export type ButcherProduction = typeof butcherProduction.$inferSelect;
export type InsertButcherProduction = typeof butcherProduction.$inferInsert;

// Materials consumed per butcher production batch
export const butcherProductionMaterials = mysqlTable(
  "butcher_production_materials",
  {
    id: int("id").autoincrement().primaryKey(),
    productionId: int("productionId").notNull().references(() => butcherProduction.id, { onDelete: "cascade" }),
    rawMaterialId: int("rawMaterialId").references(() => rawMaterials.id, { onDelete: "cascade" }),
    materialName: varchar("materialName", { length: 256 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    consumedQuantity: decimal("consumedQuantity", { precision: 12, scale: 3 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_bpm_production").on(t.productionId),
    index("idx_bpm_material").on(t.rawMaterialId),
  ]
);
export type ButcherProductionMaterial = typeof butcherProductionMaterials.$inferSelect;
export type InsertButcherProductionMaterial = typeof butcherProductionMaterials.$inferInsert;

// ─── Butcher Waste ────────────────────────────────────────────────────────────
export const butcherWaste = mysqlTable(
  "butcher_waste",
  {
    id: int("id").autoincrement().primaryKey(),
    wasteDate: timestamp("wasteDate").notNull(),
    // Can be a raw material or a butcher product
    itemType: mysqlEnum("itemType", ["raw_material", "butcher_product"]).notNull().default("raw_material"),
    rawMaterialId: int("rawMaterialId").references(() => rawMaterials.id),
    butcherProductId: int("butcherProductId").references(() => butcherProducts.id),
    itemName: varchar("itemName", { length: 256 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    wasteQty: decimal("wasteQty", { precision: 12, scale: 3 }).notNull(),
    unitCost: decimal("unitCost", { precision: 12, scale: 3 }),
    totalCost: decimal("totalCost", { precision: 12, scale: 3 }),
    reason: varchar("reason", { length: 256 }),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_bw_date").on(t.wasteDate),
    index("idx_bw_item").on(t.itemType),
  ]
);
export type ButcherWaste = typeof butcherWaste.$inferSelect;
export type InsertButcherWaste = typeof butcherWaste.$inferInsert;

// ─── Butcher Sales (Cashier) ──────────────────────────────────────────────────
export const butcherSales = mysqlTable(
  "butcher_sales",
  {
    id: int("id").autoincrement().primaryKey(),
    saleDate: timestamp("saleDate").notNull(),
    totalAmount: decimal("totalAmount", { precision: 14, scale: 3 }).notNull().default("0"),
    paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "transfer"]).default("cash").notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_bs_date").on(t.saleDate),
  ]
);
export type ButcherSale = typeof butcherSales.$inferSelect;
export type InsertButcherSale = typeof butcherSales.$inferInsert;

// Sale line items
export const butcherSaleItems = mysqlTable(
  "butcher_sale_items",
  {
    id: int("id").autoincrement().primaryKey(),
    saleId: int("saleId").notNull().references(() => butcherSales.id, { onDelete: "cascade" }),
    productId: int("productId").notNull().references(() => butcherProducts.id),
    productName: varchar("productName", { length: 256 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    soldByWeight: boolean("soldByWeight").default(false).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(), // weight if soldByWeight
    pricePerUnit: decimal("pricePerUnit", { precision: 12, scale: 3 }).notNull(),
    totalPrice: decimal("totalPrice", { precision: 14, scale: 3 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_bsi_sale").on(t.saleId),
    index("idx_bsi_product").on(t.productId),
  ]
);
export type ButcherSaleItem = typeof butcherSaleItems.$inferSelect;
export type InsertButcherSaleItem = typeof butcherSaleItems.$inferInsert;

// ─── Sales Reports (POS تقارير المبيعات) ──────────────────────────────────────────────────
export const salesReports = mysqlTable(
  "sales_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    // Date range covered by this report
    reportDateFrom: timestamp("reportDateFrom").notNull(),
    reportDateTo: timestamp("reportDateTo").notNull(),
    branchName: varchar("branchName", { length: 256 }),
    branchRef: varchar("branchRef", { length: 64 }),
    // Aggregated totals from the CSV
    totalSales: decimal("totalSales", { precision: 14, scale: 3 }).notNull().default("0"),
    totalNetSales: decimal("totalNetSales", { precision: 14, scale: 3 }).notNull().default("0"),
    totalQty: int("totalQty").notNull().default(0),
    totalCost: decimal("totalCost", { precision: 14, scale: 3 }).notNull().default("0"),
    totalProfit: decimal("totalProfit", { precision: 14, scale: 3 }).notNull().default("0"),
    // Original filename for reference
    fileName: varchar("fileName", { length: 512 }),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_sr_date").on(t.reportDateFrom),
    index("idx_sr_branch").on(t.branchRef),
  ]
);
export type SalesReport = typeof salesReports.$inferSelect;
export type InsertSalesReport = typeof salesReports.$inferInsert;

// Sale line items (one row per product in the CSV)
export const saleItems = mysqlTable(
  "sale_items",
  {
    id: int("id").autoincrement().primaryKey(),
    reportId: int("reportId").notNull().references(() => salesReports.id, { onDelete: "cascade" }),
    // From CSV
    productName: varchar("productName", { length: 256 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    branchName: varchar("branchName", { length: 256 }),
    branchRef: varchar("branchRef", { length: 64 }),
    totalSales: decimal("totalSales", { precision: 12, scale: 3 }).notNull().default("0"),
    netSalesWithTax: decimal("netSalesWithTax", { precision: 12, scale: 3 }).notNull().default("0"),
    tax: decimal("tax", { precision: 12, scale: 3 }).notNull().default("0"),
    discount: decimal("discount", { precision: 12, scale: 3 }).notNull().default("0"),
    netSales: decimal("netSales", { precision: 12, scale: 3 }).notNull().default("0"),
    qty: int("qty").notNull().default(0),
    cost: decimal("cost", { precision: 12, scale: 3 }).notNull().default("0"),
    returnAmount: decimal("returnAmount", { precision: 12, scale: 3 }).notNull().default("0"),
    returnQty: int("returnQty").notNull().default(0),
    cancelAmount: decimal("cancelAmount", { precision: 12, scale: 3 }).notNull().default("0"),
    cancelQty: int("cancelQty").notNull().default(0),
    profit: decimal("profit", { precision: 12, scale: 3 }).notNull().default("0"),
    // Link to menu product (matched by SKU)
    productId: int("productId").references(() => products.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_si_report").on(t.reportId),
    index("idx_si_sku").on(t.sku),
    index("idx_si_product").on(t.productId),
  ]
);
export type SaleItem = typeof saleItems.$inferSelect;
export type InsertSaleItem = typeof saleItems.$inferInsert;

// ─── Free Invoices (Manual / Service Invoices) ────────────────────────────────
export const freeInvoices = mysqlTable("free_invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceStatus: mysqlEnum("invoiceStatus", ["draft","pending","approved","rejected","cancelled"]).notNull().default("approved"),
  supplierName: varchar("supplierName", { length: 256 }).notNull(),
  supplierType: mysqlEnum("supplierType", ["supplier", "service"]).default("supplier").notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }),
  supplierInvoiceNumber: varchar("supplierInvoiceNumber", { length: 128 }),
  date: timestamp("date").notNull(),
  dueDate: date("dueDate"),
  subtotal: decimal("subtotal", { precision: 12, scale: 3 }).notNull().default("0"),
  vatPct: decimal("vatPct", { precision: 5, scale: 2 }).notNull().default("0"),
  vatMode: mysqlEnum("vatMode", ["exclusive","inclusive"]).notNull().default("exclusive"),
  vatAmount: decimal("vatAmount", { precision: 12, scale: 3 }).notNull().default("0"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 3 }).notNull().default("0"),
  paymentStatus: mysqlEnum("paymentStatus", ["paid", "deferred", "partial", "under_review"]).default("deferred").notNull(),
  paidAmount: decimal("paidAmount", { precision: 12, scale: 3 }).default("0"),
  remainingAmount: decimal("remainingAmount", { precision: 12, scale: 3 }).default("0"),
  expenseCategory: mysqlEnum("expenseCategory", ["operational", "maintenance", "fixed", "other"]).default("other"),
  paidAt: timestamp("paidAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FreeInvoicee = typeof freeInvoices.$inferSelect;
export type InsertFreeInvoice = typeof freeInvoices.$inferInsert;

export const freeInvoiceItems = mysqlTable("free_invoice_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => freeInvoices.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 512 }).notNull(),
  qty: decimal("qty", { precision: 10, scale: 3 }).notNull().default("1"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 3 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 3 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FreeInvoiceItem = typeof freeInvoiceItems.$inferSelect;
export type InsertFreeInvoiceItem = typeof freeInvoiceItems.$inferInsert;

// ─── Invoice Payment History ─────────────────────────────────────────────────
export const invoicePaymentHistory = mysqlTable("invoice_payment_history", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  invoiceType: mysqlEnum("invoiceType", ["supplier", "free"]).notNull().default("supplier"),
  paymentDate: timestamp("paymentDate").notNull(),
  paidAmount: decimal("paidAmount", { precision: 14, scale: 3 }).notNull(),
  paymentType: mysqlEnum("paymentType", ["paid", "partial"]).notNull().default("partial"),
  paymentMethod: mysqlEnum("paymentMethod", ["cash","bank_transfer","card","cheque","other"]).notNull().default("cash"),
  paymentAccount: varchar("paymentAccount", { length: 64 }),
  referenceNumber: varchar("referenceNumber", { length: 128 }),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  isVoided: boolean("isVoided").notNull().default(false),
  voidReason: text("voidReason"),
  voidedAt: timestamp("voidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InvoicePaymentHistory = typeof invoicePaymentHistory.$inferSelect;
export type InsertInvoicePaymentHistory = typeof invoicePaymentHistory.$inferInsert;

// ─── Invoice Audit Log ───────────────────────────────────────────────────────
export const invoiceAuditLog = mysqlTable("invoice_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  invoiceType: mysqlEnum("invoiceType", ["supplier","free"]).notNull().default("supplier"),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }),
  action: varchar("action", { length: 64 }).notNull(),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  userName: varchar("userName", { length: 128 }),
  notes: text("notes"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("idx_audit_invoice").on(t.invoiceId, t.invoiceType),
  index("idx_audit_date").on(t.createdAt),
]);
export type InvoiceAuditLog = typeof invoiceAuditLog.$inferSelect;

// ─── WhatsApp Scheduled Reports ──────────────────────────────────────────────
export const reportSubscriptions = mysqlTable("report_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  reportType: mysqlEnum("reportType", [
    "daily_sales",
    "orders_summary",
    "kitchen_cost",
    "inventory_value",
    "waste_summary",
    "system_alerts",
    "warehouse_performance",
    "kitchen_production",
    "kitchen_pull",
    "daily_account_summary",
    "supplier_invoice_new",
    "supplier_invoice_paid",
    "free_invoice_new",
    "free_invoice_paid",
    "daily_summary_confirmed",
    "food_cost_alert",
    "expiry_alert",
    "daily_closing_report",
    "purchase_order_sent",
    "low_stock_po_created",
  ]).notNull(),
  scheduleType: mysqlEnum("scheduleType", ["hourly", "daily", "weekly", "monthly", "instant", "event"]).notNull(),
  scheduleHour: int("scheduleHour").default(8),
  scheduleDay: int("scheduleDay").default(1),
  scheduleEveryHours: int("scheduleEveryHours").default(4),
  isActive: int("isActive").notNull().default(1),
  messageTemplate: text("messageTemplate"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ReportSubscription = typeof reportSubscriptions.$inferSelect;
export type InsertReportSubscription = typeof reportSubscriptions.$inferInsert;

export const reportRecipients = mysqlTable("report_recipients", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: int("subscriptionId").notNull().references(() => reportSubscriptions.id, { onDelete: "cascade" }),
  phoneNumber: varchar("phoneNumber", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReportRecipient = typeof reportRecipients.$inferSelect;
export type InsertReportRecipient = typeof reportRecipients.$inferInsert;

export const reportLogs = mysqlTable("report_logs", {
  id: int("id").autoincrement().primaryKey(),
  subscriptionId: int("subscriptionId").notNull().references(() => reportSubscriptions.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["sent", "failed", "pending"]).notNull().default("pending"),
  recipientPhone: varchar("recipientPhone", { length: 32 }).notNull(),
  messageContent: text("messageContent"),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").notNull().default(0),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ReportLog = typeof reportLogs.$inferSelect;
export type InsertReportLog = typeof reportLogs.$inferInsert;

export const whatsappSettings = mysqlTable("whatsapp_settings", {
  id: int("id").autoincrement().primaryKey(),
  evolutionApiUrl: varchar("evolutionApiUrl", { length: 512 }),
  evolutionApiKey: varchar("evolutionApiKey", { length: 512 }),
  evolutionInstance: varchar("evolutionInstance", { length: 256 }),
  isConfigured: int("isConfigured").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappSettings = typeof whatsappSettings.$inferSelect;

// ─── Daily Accounts (الحسابات اليومية) ────────────────────────────────────────
export const dailyAccounts = mysqlTable(
  "daily_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    accountDate: varchar("accountDate", { length: 10 }).notNull(), // YYYY-MM-DD stored as string

    // ── المبيعات اليومية (يدوي) ──────────────────────────────────────────────
    salesCash: decimal("salesCash", { precision: 12, scale: 3 }).notNull().default("0"),
    salesCard: decimal("salesCard", { precision: 12, scale: 3 }).notNull().default("0"),
    salesKita: decimal("salesKita", { precision: 12, scale: 3 }).notNull().default("0"),
    salesOrders: decimal("salesOrders", { precision: 12, scale: 3 }).notNull().default("0"),
    salesNoon: decimal("salesNoon", { precision: 12, scale: 3 }).notNull().default("0"),
    salesDeliveroo: decimal("salesDeliveroo", { precision: 12, scale: 3 }).notNull().default("0"),
    salesCareem: decimal("salesCareem", { precision: 12, scale: 3 }).notNull().default("0"),

    // ── المصروفات ─────────────────────────────────────────────────────────────
    expensesFixed: decimal("expensesFixed", { precision: 12, scale: 3 }).notNull().default("0"),
    // إذا كانت قيمة null → يُجلب تلقائياً من الفواتير المدفوعة في اليوم التشغيلي
    // إذا كانت قيمة محددة → تُستخدم هذه القيمة مباشرة (بيانات يدوية من الإكسل)
    expensesOperational: decimal("expensesOperational", { precision: 12, scale: 3 }),
    expensesMaintenance: decimal("expensesMaintenance", { precision: 12, scale: 3 }),

    // ── التوريدات ─────────────────────────────────────────────────────────────
    supplyToRestaurant: decimal("supplyToRestaurant", { precision: 12, scale: 3 }).notNull().default("0"),
    supplyToManagement: decimal("supplyToManagement", { precision: 12, scale: 3 }).notNull().default("0"),
    supplyExtra: decimal("supplyExtra", { precision: 12, scale: 3 }).notNull().default("0"),

    // ── المبلغ المرحّل (مخزّن من الملف أو محسوب) ────────────────────────────
    carryForwardToNext: decimal("carryForwardToNext", { precision: 12, scale: 3 }),

    // ── ملاحظات ───────────────────────────────────────────────────────────────
    notes: text("notes"),

    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_da_date").on(t.accountDate),
  ]
);
export type DailyAccount = typeof dailyAccounts.$inferSelect;
export type InsertDailyAccount = typeof dailyAccounts.$inferInsert;

// ─── Kitchen Daily Inventory Count (جرد المطبخ اليومي) ───────────────────────
// Each row = one material counted on one date
export const kitchenInventoryCounts = mysqlTable(
  "kitchen_inventory_counts",
  {
    id: int("id").autoincrement().primaryKey(),
    countDate: varchar("countDate", { length: 10 }).notNull(), // YYYY-MM-DD
    materialId: int("materialId").references(() => rawMaterials.id, { onDelete: "set null" }),
    materialName: varchar("materialName", { length: 256 }).notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    // Opening balance = closing count from previous day (auto-filled)
    openingQty: decimal("openingQty", { precision: 12, scale: 3 }).notNull().default("0"),
    // Received/pulled into kitchen today
    receivedQty: decimal("receivedQty", { precision: 12, scale: 3 }).notNull().default("0"),
    // Actual physical closing count entered by user
    closingQty: decimal("closingQty", { precision: 12, scale: 3 }),
    // Actual consumption = openingQty + receivedQty - closingQty
    actualConsumption: decimal("actualConsumption", { precision: 12, scale: 3 }),
    // Unit cost at time of count
    unitCost: decimal("unitCost", { precision: 12, scale: 3 }).default("0"),
    // Actual consumption cost
    consumptionCost: decimal("consumptionCost", { precision: 12, scale: 3 }).default("0"),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_kic_date").on(t.countDate),
    index("idx_kic_material").on(t.materialId),
    uniqueIndex("idx_kic_date_material").on(t.countDate, t.materialId),
  ]
);
export type KitchenInventoryCount = typeof kitchenInventoryCounts.$inferSelect;
export type InsertKitchenInventoryCount = typeof kitchenInventoryCounts.$inferInsert;

// ─── Saved Menus ──────────────────────────────────────────────────────────────
// Stores generated menus with a public share token
export const savedMenus = mysqlTable(
  "saved_menus",
  {
    id: int("id").autoincrement().primaryKey(),
    // Human-readable name for the saved menu
    name: varchar("name", { length: 255 }).notNull().default("قائمة الطعام"),
    // Unique public token used in the share URL
    token: varchar("token", { length: 64 }).notNull().unique(),
    // Full menu JSON data (sections + items)
    menuData: text("menuData").notNull(),
    // Restaurant name snapshot at save time
    restaurantName: varchar("restaurantName", { length: 255 }),
    // Restaurant logo URL snapshot
    restaurantLogo: varchar("restaurantLogo", { length: 512 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_sm_token").on(t.token),
    index("idx_sm_created").on(t.createdAt),
  ]
);
export type SavedMenu = typeof savedMenus.$inferSelect;
export type InsertSavedMenu = typeof savedMenus.$inferInsert;

// ─── Restaurant Settings ──────────────────────────────────────────────────────
// Stores global restaurant settings including the fixed live menu token
export const restaurantSettings = mysqlTable("restaurant_settings", {
  id: int("id").autoincrement().primaryKey(),
  // Fixed slug/token for the live menu - never changes, always points to latest menu
  liveMenuToken: varchar("live_menu_token", { length: 64 }).unique(),
  // The saved_menu id that the live token points to (updated on each save)
  liveMenuId: int("live_menu_id").references(() => savedMenus.id),
  restaurantName: varchar("restaurant_name", { length: 255 }).default("NSR"),
  restaurantNameEn: varchar("restaurant_name_en", { length: 255 }).default("NSR"),
  currency: varchar("currency", { length: 10 }).default("د.إ"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type RestaurantSettings = typeof restaurantSettings.$inferSelect;
export type InsertRestaurantSettings = typeof restaurantSettings.$inferInsert;

// ─── Daily Sales Uploads (رفع المبيعات اليومية) ───────────────────────────────
// Each row = one CSV upload for a specific date and branch
export const dailySalesUploads = mysqlTable(
  "daily_sales_uploads",
  {
    id: int("id").autoincrement().primaryKey(),
    saleDate: date("saleDate").notNull(),
    branchName: varchar("branchName", { length: 256 }),
    branchRef: varchar("branchRef", { length: 64 }),
    fileName: varchar("fileName", { length: 512 }),
    totalItems: int("totalItems").default(0),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_dsu_date").on(t.saleDate),
    index("idx_dsu_branch").on(t.branchRef),
  ]
);
export type DailySalesUpload = typeof dailySalesUploads.$inferSelect;
export type InsertDailySalesUpload = typeof dailySalesUploads.$inferInsert;

// ─── Daily Sales Items (تفاصيل المبيعات اليومية) ─────────────────────────────
// Each row = one product sold in a daily sales upload
export const dailySalesItems = mysqlTable(
  "daily_sales_items",
  {
    id: int("id").autoincrement().primaryKey(),
    uploadId: int("uploadId").notNull().references(() => dailySalesUploads.id, { onDelete: "cascade" }),
    productSku: varchar("productSku", { length: 100 }),
    productName: varchar("productName", { length: 256 }).notNull(),
    // Matched product id from products table (null if not matched)
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    netQuantity: decimal("netQuantity", { precision: 12, scale: 4 }).notNull().default("0"),
    totalSales: decimal("totalSales", { precision: 12, scale: 4 }).default("0"),
    netSales: decimal("netSales", { precision: 12, scale: 4 }).default("0"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_dsi_upload").on(t.uploadId),
    index("idx_dsi_product").on(t.productId),
    index("idx_dsi_sku").on(t.productSku),
  ]
);
export type DailySalesItem = typeof dailySalesItems.$inferSelect;
export type InsertDailySalesItem = typeof dailySalesItems.$inferInsert;

// ─── Monthly Fixed Payments (المدفوعات الشهرية الثابتة) ─────────────────────
export const monthlyPayments = mysqlTable(
  "monthly_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    // التصنيف: salaries / rent / utilities / other
    category: varchar("category", { length: 64 }).notNull().default("other"),
    // المبلغ الإجمالي المفروض دفعه
    totalAmount: decimal("totalAmount", { precision: 12, scale: 4 }).notNull().default("0"),
    // المبلغ المدفوع فعلاً
    paidAmount: decimal("paidAmount", { precision: 12, scale: 4 }).notNull().default("0"),
    // يوم الاستحقاق من الشهر (1-31)
    dueDay: int("dueDay").notNull().default(1),
    // الشهر (1-12)
    month: int("month").notNull(),
    // السنة
    year: int("year").notNull(),
    // نوع التكرار: monthly = متكرر شهرياً، once = دفعة واحدة
    recurrence: varchar("recurrence", { length: 32 }).notNull().default("monthly"),
    // الحالة: paid / pending / overdue
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    // تاريخ الدفع الفعلي
    paidAt: timestamp("paidAt"),
    // ملاحظات
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_mp_month_year").on(t.month, t.year),
    index("idx_mp_category").on(t.category),
    index("idx_mp_status").on(t.status),
  ]
);
export type MonthlyPayment = typeof monthlyPayments.$inferSelect;
export type InsertMonthlyPayment = typeof monthlyPayments.$inferInsert;

// ─── Menu Import (استيراد قوائم الطعام من منصات التوصيل) ─────────────────────

/** جلسة استيراد واحدة (رابط واحد = جلسة واحدة) */
export const menuImportSessions = mysqlTable(
  "menu_import_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceUrl: text("sourceUrl").notNull(),
    platform: varchar("platform", { length: 32 }).notNull().default("unknown"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    restaurantName: varchar("restaurantName", { length: 256 }),
    restaurantNameAr: varchar("restaurantNameAr", { length: 256 }),
    restaurantLogoUrl: text("restaurantLogoUrl"),
    itemCount: int("itemCount").default(0),
    categoryCount: int("categoryCount").default(0),
    errorMessage: text("errorMessage"),
    savedToDb: boolean("savedToDb").default(false),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_mis_platform").on(t.platform),
    index("idx_mis_status").on(t.status),
    index("idx_mis_created").on(t.createdAt),
  ]
);
export type MenuImportSession = typeof menuImportSessions.$inferSelect;
export type InsertMenuImportSession = typeof menuImportSessions.$inferInsert;

/** فئة من قائمة الطعام المستوردة */
export const importedMenuCategories = mysqlTable(
  "imported_menu_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("sessionId").notNull().references(() => menuImportSessions.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    sortOrder: int("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_imc_session").on(t.sessionId)]
);
export type ImportedMenuCategory = typeof importedMenuCategories.$inferSelect;

/** عنصر من قائمة الطعام المستوردة */
export const importedMenuItems = mysqlTable(
  "imported_menu_items",
  {
    id: int("id").autoincrement().primaryKey(),
    sessionId: int("sessionId").notNull().references(() => menuImportSessions.id, { onDelete: "cascade" }),
    categoryId: int("categoryId").references(() => importedMenuCategories.id, { onDelete: "set null" }),
    categoryName: varchar("categoryName", { length: 256 }),
    name: varchar("name", { length: 512 }).notNull(),
    nameAr: varchar("nameAr", { length: 512 }),
    description: text("description"),
    price: decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 8 }).notNull().default("AED"),
    imageUrl: text("imageUrl"),
    isAvailable: boolean("isAvailable").default(true),
    exported: boolean("exported").default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_imi_session").on(t.sessionId),
    index("idx_imi_category").on(t.categoryId),
  ]
);
export type ImportedMenuItem = typeof importedMenuItems.$inferSelect;
export type InsertImportedMenuItem = typeof importedMenuItems.$inferInsert;

// ─── Price Comparison (مقارنة أسعار القوائم بين المطاعم) ──────────────────────

/** جلسة مقارنة: تحدد مطعمي + المنافسين */
export const priceComparisonSessions = mysqlTable(
  "price_comparison_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 256 }).notNull(),
    myRestaurantSessionId: int("myRestaurantSessionId")
      .notNull()
      .references(() => menuImportSessions.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    /** عدد الأصناف المطابقة التي وجدها AI */
    matchedGroupCount: int("matchedGroupCount").default(0),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_pcs_my_rest").on(t.myRestaurantSessionId),
    index("idx_pcs_status").on(t.status),
  ]
);
export type PriceComparisonSession = typeof priceComparisonSessions.$inferSelect;
export type InsertPriceComparisonSession = typeof priceComparisonSessions.$inferInsert;

/** المطاعم المنافسة المشمولة في جلسة المقارنة */
export const comparisonRestaurants = mysqlTable(
  "comparison_restaurants",
  {
    id: int("id").autoincrement().primaryKey(),
    comparisonSessionId: int("comparisonSessionId")
      .notNull()
      .references(() => priceComparisonSessions.id, { onDelete: "cascade" }),
    importSessionId: int("importSessionId")
      .notNull()
      .references(() => menuImportSessions.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cr_comp_session").on(t.comparisonSessionId),
    index("idx_cr_import_session").on(t.importSessionId),
  ]
);
export type ComparisonRestaurant = typeof comparisonRestaurants.$inferSelect;

/**
 * مجموعة مطابقة: AI يجمع الأصناف المتشابهة من مطاعم مختلفة في مجموعة واحدة.
 * مثال: "فلافل" + "فلافل مصري" + "فلافل مشكل" → مجموعة "فلافل"
 */
export const comparisonMatchGroups = mysqlTable(
  "comparison_match_groups",
  {
    id: int("id").autoincrement().primaryKey(),
    comparisonSessionId: int("comparisonSessionId")
      .notNull()
      .references(() => priceComparisonSessions.id, { onDelete: "cascade" }),
    /** الاسم الموحد الذي اختاره AI للمجموعة */
    unifiedName: varchar("unifiedName", { length: 512 }).notNull(),
    unifiedNameAr: varchar("unifiedNameAr", { length: 512 }),
    /** الفئة الموحدة */
    unifiedCategory: varchar("unifiedCategory", { length: 256 }),
    /** درجة ثقة AI في المطابقة (0-100) */
    confidenceScore: int("confidenceScore").default(100),
    /** سبب المطابقة الذي شرحه AI */
    matchReason: varchar("matchReason", { length: 512 }),
    sortOrder: int("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cmg_comp_session").on(t.comparisonSessionId),
  ]
);
export type ComparisonMatchGroup = typeof comparisonMatchGroups.$inferSelect;

/** ربط كل صنف من قائمة مطعم بمجموعة المطابقة */
export const comparisonMatchItems = mysqlTable(
  "comparison_match_items",
  {
    id: int("id").autoincrement().primaryKey(),
    matchGroupId: int("matchGroupId")
      .notNull()
      .references(() => comparisonMatchGroups.id, { onDelete: "cascade" }),
    importSessionId: int("importSessionId")
      .notNull()
      .references(() => menuImportSessions.id, { onDelete: "cascade" }),
    menuItemId: int("menuItemId")
      .notNull()
      .references(() => importedMenuItems.id, { onDelete: "cascade" }),
    /** السعر وقت المقارنة (snapshot) */
    priceSnapshot: decimal("priceSnapshot", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 8 }).notNull().default("AED"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cmi_group").on(t.matchGroupId),
    index("idx_cmi_session").on(t.importSessionId),
    index("idx_cmi_item").on(t.menuItemId),
  ]
);

// ─── Shift Management ─────────────────────────────────────────────────────────
export const shifts = mysqlTable(
  "shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    shiftDate: date("shiftDate").notNull(),
    shiftType: mysqlEnum("shiftType", ["morning", "afternoon", "night"]).notNull(),
    startTime: varchar("startTime", { length: 8 }).notNull(), // "08:00"
    endTime: varchar("endTime", { length: 8 }).notNull(),     // "16:00"
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_shifts_date").on(t.shiftDate)]
);
export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

export const shiftAssignments = mysqlTable(
  "shift_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    shiftId: int("shiftId").notNull().references(() => shifts.id, { onDelete: "cascade" }),
    employeeName: varchar("employeeName", { length: 256 }).notNull(),
    employeeNameAr: varchar("employeeNameAr", { length: 256 }),
    role: varchar("role", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_sa_shift").on(t.shiftId)]
);
export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
export type InsertShiftAssignment = typeof shiftAssignments.$inferInsert;

// ─── Purchase Orders ──────────────────────────────────────────────────────────
export const purchaseOrders = mysqlTable(
  "purchase_orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orderNumber: varchar("orderNumber", { length: 64 }).notNull().unique(),
    supplierId: int("supplierId").references(() => suppliers.id, { onDelete: "set null" }),
    supplierName: varchar("supplierName", { length: 256 }),
    status: mysqlEnum("status", ["draft", "sent", "confirmed", "received", "cancelled"])
      .notNull()
      .default("draft"),
    totalAmount: decimal("totalAmount", { precision: 14, scale: 3 }),
    notes: text("notes"),
    sentAt: timestamp("sentAt"),
    confirmedAt: timestamp("confirmedAt"),
    receivedAt: timestamp("receivedAt"),
    createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_po_supplier").on(t.supplierId),
    index("idx_po_status").on(t.status),
    index("idx_po_date").on(t.createdAt),
  ]
);
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

export const purchaseOrderItems = mysqlTable(
  "purchase_order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
    materialId: int("materialId").notNull().references(() => rawMaterials.id, { onDelete: "restrict" }),
    materialName: varchar("materialName", { length: 256 }).notNull(),
    unit: varchar("unit", { length: 32 }),
    requestedQty: decimal("requestedQty", { precision: 12, scale: 3 }).notNull(),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 3 }),
    totalPrice: decimal("totalPrice", { precision: 12, scale: 3 }),
    notes: text("notes"),
  },
  (t) => [
    index("idx_poi_order").on(t.orderId),
    index("idx_poi_material").on(t.materialId),
  ]
);
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;
export type ComparisonMatchItem = typeof comparisonMatchItems.$inferSelect;

// ─── POS System ───────────────────────────────────────────────────────────────

export const restaurantTables = mysqlTable(
  "restaurant_tables",
  {
    id: int("id").autoincrement().primaryKey(),
    tableNumber: varchar("tableNumber", { length: 20 }).notNull(),
    label: varchar("label", { length: 100 }),
    capacity: int("capacity").default(4),
    section: varchar("section", { length: 100 }),
    status: mysqlEnum("status", ["available", "occupied", "reserved"]).default("available"),
    isActive: boolean("isActive").default(true).notNull(),
    sortOrder: int("sortOrder").default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_tables_status").on(t.status)]
);
export type RestaurantTable = typeof restaurantTables.$inferSelect;

export const posOrders = mysqlTable(
  "pos_orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orderNumber: varchar("orderNumber", { length: 64 }).notNull().unique(),
    tableId: int("tableId").references(() => restaurantTables.id),
    orderType: mysqlEnum("orderType", ["dine_in", "takeaway", "delivery"]).default("dine_in").notNull(),
    status: mysqlEnum("status", [
      "draft", "sent_to_kitchen", "partially_ready", "ready", "served", "paid", "cancelled", "refunded"
    ]).default("draft").notNull(),
    waiterId: int("waiterId").references(() => users.id),
    cashierId: int("cashierId").references(() => users.id),
    guestCount: int("guestCount").default(1),
    subtotal: decimal("subtotal", { precision: 14, scale: 3 }).default("0"),
    discountType: mysqlEnum("discountType", ["fixed", "percentage"]),
    discountValue: decimal("discountValue", { precision: 10, scale: 3 }).default("0"),
    discountAmount: decimal("discountAmount", { precision: 14, scale: 3 }).default("0"),
    taxPct: decimal("taxPct", { precision: 5, scale: 2 }).default("0"),
    taxAmount: decimal("taxAmount", { precision: 14, scale: 3 }).default("0"),
    tipAmount: decimal("tipAmount", { precision: 10, scale: 3 }).notNull().default("0"),
    secondPaymentMethod: mysqlEnum("secondPaymentMethod", ["cash","card","transfer","online"]),
    secondPaymentAmount: decimal("secondPaymentAmount", { precision: 10, scale: 3 }),
    total: decimal("total", { precision: 14, scale: 3 }).default("0"),
    notes: text("notes"),
    customerName: varchar("customerName", { length: 256 }),
    customerPhone: varchar("customerPhone", { length: 64 }),
    customerArea: varchar("customerArea", { length: 256 }),
    customerBuilding: varchar("customerBuilding", { length: 256 }),
    customerFloor: varchar("customerFloor", { length: 64 }),
    customerApartment: varchar("customerApartment", { length: 64 }),
    deliveryNotes: text("deliveryNotes"),
    customerId: int("customerId"),
    waiterName: varchar("waiterName", { length: 128 }),
    transferredFromTableId: int("transferredFromTableId"),
    sentToKitchenAt: timestamp("sentToKitchenAt"),
    readyAt: timestamp("readyAt"),
    servedAt: timestamp("servedAt"),
    paidAt: timestamp("paidAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_pos_orders_status").on(t.status),
    index("idx_pos_orders_table").on(t.tableId),
    index("idx_pos_orders_date").on(t.createdAt),
  ]
);
export type PosOrder = typeof posOrders.$inferSelect;

export const posOrderItems = mysqlTable(
  "pos_order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull().references(() => posOrders.id, { onDelete: "cascade" }),
    productId: int("productId").notNull().references(() => products.id),
    productName: varchar("productName", { length: 256 }).notNull(),
    productNameAr: varchar("productNameAr", { length: 256 }),
    quantity: decimal("quantity", { precision: 10, scale: 3 }).default("1").notNull(),
    unitPrice: decimal("unitPrice", { precision: 12, scale: 3 }).notNull(),
    discountAmount: decimal("discountAmount", { precision: 12, scale: 3 }).default("0"),
    totalPrice: decimal("totalPrice", { precision: 14, scale: 3 }).notNull(),
    status: mysqlEnum("status", ["pending", "preparing", "ready", "served", "cancelled"]).default("pending").notNull(),
    notes: text("notes"),
    modifiers: json("modifiers"),
    isVoided: boolean("isVoided").notNull().default(false),
    voidReason: varchar("voidReason", { length: 256 }),
    voidedAt: timestamp("voidedAt"),
    course: varchar("course", { length: 50 }),
    printedAt: timestamp("printedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_poi_order").on(t.orderId),
    index("idx_poi_status").on(t.status),
  ]
);
export type PosOrderItem = typeof posOrderItems.$inferSelect;

export const posPayments = mysqlTable(
  "pos_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull().references(() => posOrders.id),
    paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "transfer", "online"]).notNull(),
    amount: decimal("amount", { precision: 14, scale: 3 }).notNull(),
    cashPaid: decimal("cashPaid", { precision: 14, scale: 3 }),
    changeGiven: decimal("changeGiven", { precision: 14, scale: 3 }),
    reference: varchar("reference", { length: 100 }),
    processedBy: int("processedBy").references(() => users.id),
    processedAt: timestamp("processedAt").defaultNow().notNull(),
  },
  (t) => [index("idx_pos_payments_order").on(t.orderId)]
);

// ─── Kitchen Item Production (Service Stock — Layer 3) ───────────────────────
// Tracks ready-to-serve portions per product per day.
// POS deducts soldQty. When remainingQty=0 → is86d=true → item hidden in POS.
export const kitchenItemProduction = mysqlTable(
  "kitchen_item_production",
  {
    id: int("id").autoincrement().primaryKey(),
    productionDate: date("productionDate").notNull(),
    productId: int("productId").notNull().references(() => products.id),
    productName: varchar("productName", { length: 256 }).notNull(),
    productNameAr: varchar("productNameAr", { length: 256 }),
    producedQty: decimal("producedQty", { precision: 10, scale: 3 }).default("0").notNull(),
    carriedForwardQty: decimal("carriedForwardQty", { precision: 10, scale: 3 }).default("0"),
    totalAvailableQty: decimal("totalAvailableQty", { precision: 10, scale: 3 }).default("0"),
    soldQty: decimal("soldQty", { precision: 10, scale: 3 }).default("0"),
    remainingQty: decimal("remainingQty", { precision: 10, scale: 3 }).default("0"),
    wasteQty: decimal("wasteQty", { precision: 10, scale: 3 }).default("0"),
    is86d: boolean("is86d").default(false),
    rawMaterialsDeducted: boolean("rawMaterialsDeducted").default(false),
    status: mysqlEnum("status", ["in_service", "closed"]).default("in_service"),
    notes: text("notes"),
    createdBy: int("createdBy").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_kip_date").on(t.productionDate),
    index("idx_kip_product").on(t.productId),
    index("idx_kip_86d").on(t.is86d),
  ]
);
export type KitchenItemProduction = typeof kitchenItemProduction.$inferSelect;

// ─── POS Customers ─────────────────────────────────────────────────────────
export const posCustomers = mysqlTable("pos_customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  area: varchar("area", { length: 256 }),
  building: varchar("building", { length: 256 }),
  floor: varchar("floor", { length: 64 }),
  apartment: varchar("apartment", { length: 64 }),
  notes: text("notes"),
  orderCount: int("orderCount").notNull().default(0),
  lastOrderAt: timestamp("lastOrderAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_customer_phone").on(t.phone),
  index("idx_customer_name").on(t.name),
]);
export type PosCustomer = typeof posCustomers.$inferSelect;

export const posReturns = mysqlTable(
  "pos_returns",
  {
    id: int("id").autoincrement().primaryKey(),
    originalOrderId: int("originalOrderId").notNull().references(() => posOrders.id),
    reason: text("reason"),
    totalRefund: decimal("totalRefund", { precision: 14, scale: 3 }).notNull(),
    refundMethod: mysqlEnum("refundMethod", ["cash", "card", "credit"]).default("cash"),
    processedBy: int("processedBy").references(() => users.id),
    processedAt: timestamp("processedAt").defaultNow().notNull(),
  },
  (t) => [index("idx_pos_returns_order").on(t.originalOrderId)]
);
