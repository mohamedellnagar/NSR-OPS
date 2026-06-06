/**
 * sync-export.ts
 * Exports specific tables to JSON for offline sync.
 * Called by GET /api/export-sync-data on the cloud/Manus deployment.
 * The local app imports this JSON to update its database.
 */
import { getDb } from "./db";

export async function exportSyncData() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [invoices]              = await db.execute("SELECT * FROM invoices");
  const [invoiceItems]          = await db.execute("SELECT * FROM invoice_items");
  const [invoicePayments]       = await db.execute("SELECT * FROM invoice_payment_history");
  const [materials]             = await db.execute(
    "SELECT id, currentQuantity, lastPurchasePrice, averageCost, minimumQuantity FROM raw_materials"
  );
  const [kitchenProd]           = await db.execute("SELECT * FROM kitchen_daily_production");
  const [kitchenProdMaterials]  = await db.execute("SELECT * FROM kitchen_production_materials");
  const [dailyAccounts]         = await db.execute("SELECT * FROM daily_accounts");

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    tables: {
      invoices,
      invoice_items:             invoiceItems,
      invoice_payment_history:   invoicePayments,
      raw_materials_update:      materials,      // UPDATE only: qty + prices
      kitchen_daily_production:  kitchenProd,
      kitchen_production_materials: kitchenProdMaterials,
      daily_accounts:            dailyAccounts,
    },
  };
}
