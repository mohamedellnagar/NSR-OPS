-- Allow hard-delete of archived materials while preserving linked records.
-- Strategy:
--   SET NULL  → audit/history tables (transactions, invoices, waste, pulls, counts)
--   CASCADE   → detail/ingredient tables (production materials)

-- ── inventory_transactions (already nullable) ─────────────────────────────────
ALTER TABLE `inventory_transactions`
  DROP FOREIGN KEY `inventory_transactions_fk1`,
  ADD CONSTRAINT `inventory_transactions_fk1`
    FOREIGN KEY (`materialId`) REFERENCES `raw_materials` (`id`) ON DELETE SET NULL;

-- ── invoice_items (make nullable + SET NULL) ───────────────────────────────────
ALTER TABLE `invoice_items`
  DROP FOREIGN KEY `invoice_items_fk2`,
  MODIFY COLUMN `materialId` int NULL,
  ADD CONSTRAINT `invoice_items_fk2`
    FOREIGN KEY (`materialId`) REFERENCES `raw_materials` (`id`) ON DELETE SET NULL;

-- ── waste_logs (make nullable + SET NULL) ─────────────────────────────────────
ALTER TABLE `waste_logs`
  DROP FOREIGN KEY `waste_logs_fk1`,
  MODIFY COLUMN `materialId` int NULL,
  ADD CONSTRAINT `waste_logs_fk1`
    FOREIGN KEY (`materialId`) REFERENCES `raw_materials` (`id`) ON DELETE SET NULL;

-- ── kitchen_daily_pulls (make nullable + SET NULL) ────────────────────────────
ALTER TABLE `kitchen_daily_pulls`
  DROP FOREIGN KEY `kitchen_daily_pulls_fk1`,
  MODIFY COLUMN `materialId` int NULL,
  ADD CONSTRAINT `kitchen_daily_pulls_fk1`
    FOREIGN KEY (`materialId`) REFERENCES `raw_materials` (`id`) ON DELETE SET NULL;

-- ── kitchen_inventory_counts (make nullable + SET NULL) ───────────────────────
ALTER TABLE `kitchen_inventory_counts`
  DROP FOREIGN KEY `kitchen_inventory_counts_fk1`,
  MODIFY COLUMN `materialId` int NULL,
  ADD CONSTRAINT `kitchen_inventory_counts_fk1`
    FOREIGN KEY (`materialId`) REFERENCES `raw_materials` (`id`) ON DELETE SET NULL;

-- ── butcher_waste (already nullable + SET NULL) ───────────────────────────────
ALTER TABLE `butcher_waste`
  DROP FOREIGN KEY `butcher_waste_fk1`,
  ADD CONSTRAINT `butcher_waste_fk1`
    FOREIGN KEY (`rawMaterialId`) REFERENCES `raw_materials` (`id`) ON DELETE SET NULL;

-- ── kitchen_production_materials (CASCADE) ────────────────────────────────────
ALTER TABLE `kitchen_production_materials`
  DROP FOREIGN KEY `kitchen_production_materials_fk2`,
  ADD CONSTRAINT `kitchen_production_materials_fk2`
    FOREIGN KEY (`rawMaterialId`) REFERENCES `raw_materials` (`id`) ON DELETE CASCADE;

-- ── butcher_production_materials (CASCADE) ────────────────────────────────────
ALTER TABLE `butcher_production_materials`
  DROP FOREIGN KEY `butcher_production_materials_fk1`,
  ADD CONSTRAINT `butcher_production_materials_fk1`
    FOREIGN KEY (`rawMaterialId`) REFERENCES `raw_materials` (`id`) ON DELETE CASCADE;
