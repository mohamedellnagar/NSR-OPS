-- Inventory Movement Ledger improvements
ALTER TABLE `inventory_transactions`
  ADD COLUMN `movementStatus` ENUM('draft','posted','reversed','cancelled') NOT NULL DEFAULT 'posted' AFTER `reason`,
  ADD COLUMN `referenceType` VARCHAR(64) NULL AFTER `referenceNumber`,
  ADD COLUMN `reversingTransactionId` INT NULL AFTER `referenceType`,
  ADD COLUMN `quantityBefore` DECIMAL(12,3) NULL AFTER `quantity`,
  ADD COLUMN `quantityAfter` DECIMAL(12,3) NULL AFTER `quantityBefore`,
  ADD INDEX `idx_tx_status` (`movementStatus`),
  ADD INDEX `idx_tx_reftype` (`referenceType`);
