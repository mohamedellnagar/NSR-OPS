-- Invoice management improvements: separate invoice status, supplier invoice no, due date
-- Phase: invoice workflow

-- ── invoices (supplier) ──────────────────────────────────────────────────────
ALTER TABLE `invoices`
  ADD COLUMN `invoiceStatus` ENUM('draft','pending','approved','rejected','cancelled') NOT NULL DEFAULT 'approved' AFTER `invoiceNumber`,
  ADD COLUMN `supplierInvoiceNumber` VARCHAR(128) NULL AFTER `supplierName`,
  ADD COLUMN `dueDate` DATE NULL AFTER `invoiceDate`,
  ADD COLUMN `vatMode` ENUM('exclusive','inclusive') NOT NULL DEFAULT 'exclusive' AFTER `vatRate`,
  ADD COLUMN `postToInventory` BOOLEAN NOT NULL DEFAULT FALSE AFTER `stockUpdated`;

-- Migrate under_review paymentStatus → invoiceStatus = pending
UPDATE `invoices` SET `invoiceStatus` = 'pending', `paymentStatus` = 'deferred'
  WHERE `paymentStatus` = 'under_review';

-- ── free_invoices ────────────────────────────────────────────────────────────
ALTER TABLE `free_invoices`
  ADD COLUMN `invoiceStatus` ENUM('draft','pending','approved','rejected','cancelled') NOT NULL DEFAULT 'approved' AFTER `invoiceNumber`,
  ADD COLUMN `supplierInvoiceNumber` VARCHAR(128) NULL AFTER `supplierName`,
  ADD COLUMN `dueDate` DATE NULL AFTER `date`,
  ADD COLUMN `vatMode` ENUM('exclusive','inclusive') NOT NULL DEFAULT 'exclusive' AFTER `vatPct`;

UPDATE `free_invoices` SET `invoiceStatus` = 'pending', `paymentStatus` = 'deferred'
  WHERE `paymentStatus` = 'under_review';

-- ── invoice_payment_history ───────────────────────────────────────────────────
ALTER TABLE `invoice_payment_history`
  ADD COLUMN `paymentMethod` ENUM('cash','bank_transfer','card','cheque','other') NOT NULL DEFAULT 'cash' AFTER `paymentType`,
  ADD COLUMN `paymentAccount` VARCHAR(64) NULL AFTER `paymentMethod`,
  ADD COLUMN `referenceNumber` VARCHAR(128) NULL AFTER `paymentAccount`,
  ADD COLUMN `createdBy` INT NULL AFTER `notes`,
  ADD COLUMN `isVoided` BOOLEAN NOT NULL DEFAULT FALSE AFTER `createdBy`,
  ADD COLUMN `voidReason` TEXT NULL AFTER `isVoided`,
  ADD COLUMN `voidedAt` TIMESTAMP NULL AFTER `voidReason`;
