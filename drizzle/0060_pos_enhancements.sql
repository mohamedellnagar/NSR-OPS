-- POS enhancements: tip, modifiers, split payment, waiter name, void tracking

-- Add tip amount to orders
ALTER TABLE `pos_orders`
  ADD COLUMN `tipAmount` DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER `taxAmount`,
  ADD COLUMN `secondPaymentMethod` ENUM('cash','card','transfer','online') NULL AFTER `tipAmount`,
  ADD COLUMN `secondPaymentAmount` DECIMAL(10,3) NULL AFTER `secondPaymentMethod`,
  ADD COLUMN `waiterName` VARCHAR(128) NULL AFTER `customerPhone`,
  ADD COLUMN `transferredFromTableId` INT NULL AFTER `tableId`;

-- Add modifiers/customizations per item
ALTER TABLE `pos_order_items`
  ADD COLUMN `modifiers` JSON NULL AFTER `notes`,
  ADD COLUMN `isVoided` BOOLEAN NOT NULL DEFAULT FALSE AFTER `modifiers`,
  ADD COLUMN `voidReason` VARCHAR(256) NULL AFTER `isVoided`,
  ADD COLUMN `voidedAt` TIMESTAMP NULL AFTER `voidReason`;
