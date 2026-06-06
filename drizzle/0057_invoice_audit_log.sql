-- Invoice audit log: tracks all actions on invoices
CREATE TABLE `invoice_audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoiceId` INT NOT NULL,
  `invoiceType` ENUM('supplier','free') NOT NULL DEFAULT 'supplier',
  `invoiceNumber` VARCHAR(64),
  `action` VARCHAR(64) NOT NULL,
  -- created | edited | submitted | approved | rejected | cancelled
  -- payment_added | payment_voided | inventory_posted | attachment_added
  `userId` INT NULL,
  `userName` VARCHAR(128) NULL,
  `notes` TEXT NULL,
  `metadata` JSON NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_audit_invoice` (`invoiceId`, `invoiceType`),
  INDEX `idx_audit_date` (`createdAt`)
);
