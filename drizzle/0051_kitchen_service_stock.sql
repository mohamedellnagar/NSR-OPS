-- ─────────────────────────────────────────────────────────────────────────────
-- Kitchen Service Stock (Layer 3)
-- Tracks ready-to-serve portions per product per day.
-- POS deducts from here. When qty=0 → item is 86'd.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE `kitchen_item_production` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `productionDate` date NOT NULL,
  `productId` int NOT NULL REFERENCES `products`(`id`),
  `productName` varchar(256) NOT NULL,
  `productNameAr` varchar(256),
  -- How many portions the kitchen prepared today (set by kitchen manager)
  `producedQty` decimal(10,3) NOT NULL DEFAULT 0,
  -- Carry-forward from previous day (leftover)
  `carriedForwardQty` decimal(10,3) DEFAULT 0,
  -- Total available = producedQty + carriedForwardQty
  `totalAvailableQty` decimal(10,3) DEFAULT 0,
  -- Deducted by POS sales (auto-updated on each sale)
  `soldQty` decimal(10,3) DEFAULT 0,
  -- Remaining for service = totalAvailableQty - soldQty
  `remainingQty` decimal(10,3) DEFAULT 0,
  -- End-of-day waste (remaining that gets discarded)
  `wasteQty` decimal(10,3) DEFAULT 0,
  -- 86'd = true means item unavailable at POS
  `is86d` boolean DEFAULT false,
  -- Whether kitchen deducted raw materials for this batch
  `rawMaterialsDeducted` boolean DEFAULT false,
  `status` enum('in_service','closed') DEFAULT 'in_service',
  `notes` text,
  `createdBy` int REFERENCES `users`(`id`),
  `createdAt` timestamp DEFAULT NOW(),
  `updatedAt` timestamp DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY `uniq_prod_date_product` (`productionDate`, `productId`)
);
CREATE INDEX `idx_kip_date` ON `kitchen_item_production`(`productionDate`);
CREATE INDEX `idx_kip_product` ON `kitchen_item_production`(`productId`);
CREATE INDEX `idx_kip_86d` ON `kitchen_item_production`(`is86d`);

-- Link: which pos_order_items deducted from which kitchen_item_production
ALTER TABLE `pos_order_items`
  ADD COLUMN `kitchenProductionId` int NULL REFERENCES `kitchen_item_production`(`id`);
