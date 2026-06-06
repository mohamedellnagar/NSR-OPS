-- Add expiryDate to inventory_transactions for FEFO tracking
ALTER TABLE `inventory_transactions` ADD COLUMN `expiryDate` date NULL;
CREATE INDEX `idx_tx_expiry` ON `inventory_transactions` (`expiryDate`);
