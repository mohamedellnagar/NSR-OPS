-- Manual fixes to bring an existing (pre-populated) database in sync with drizzle/schema.ts
-- without triggering drizzle-kit's "data-loss" enum recreation warning.
-- Safe to run multiple times is NOT guaranteed for the ADD COLUMN statements
-- (re-running will error "Duplicate column" if already applied) - that's fine,
-- just skip statements that error with "Duplicate column" or "already exists".

ALTER TABLE raw_materials
  ADD COLUMN materialType VARCHAR(32) NOT NULL DEFAULT 'raw';

ALTER TABLE invoices
  ADD COLUMN expenseCategory ENUM('operational','maintenance','fixed','other') DEFAULT 'other';

ALTER TABLE invoices
  MODIFY COLUMN paymentStatus ENUM('paid','deferred','partial','under_review') NOT NULL DEFAULT 'deferred';

ALTER TABLE free_invoices
  ADD COLUMN expenseCategory ENUM('operational','maintenance','fixed','other') DEFAULT 'other';

ALTER TABLE free_invoices
  MODIFY COLUMN paymentStatus ENUM('paid','deferred','partial','under_review') NOT NULL DEFAULT 'deferred';

ALTER TABLE inventory_transactions
  MODIFY COLUMN reason ENUM('purchase','production','waste','transfer','return','adjustment','other','opening_balance');

ALTER TABLE app_settings
  ADD COLUMN openaiApiKey VARCHAR(255);

CREATE TABLE IF NOT EXISTS report_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reportType VARCHAR(50) NOT NULL,
  headerText TEXT NULL,
  footerText TEXT NULL,
  bodyText TEXT NULL,
  includeDate TINYINT(1) DEFAULT 1,
  customFields JSON NULL,
  updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  name VARCHAR(256) NULL,
  full_text TEXT NULL
);

CREATE TABLE IF NOT EXISTS daily_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accountDate VARCHAR(10) NOT NULL,
  salesCash DECIMAL(12,3) NOT NULL DEFAULT 0,
  salesCard DECIMAL(12,3) NOT NULL DEFAULT 0,
  salesKita DECIMAL(12,3) NOT NULL DEFAULT 0,
  salesOrders DECIMAL(12,3) NOT NULL DEFAULT 0,
  salesNoon DECIMAL(12,3) NOT NULL DEFAULT 0,
  salesDeliveroo DECIMAL(12,3) NOT NULL DEFAULT 0,
  salesCareem DECIMAL(12,3) NOT NULL DEFAULT 0,
  expensesFixed DECIMAL(12,3) NOT NULL DEFAULT 0,
  expensesOperational DECIMAL(12,3) NULL,
  expensesMaintenance DECIMAL(12,3) NULL,
  supplyToRestaurant DECIMAL(12,3) NOT NULL DEFAULT 0,
  supplyToManagement DECIMAL(12,3) NOT NULL DEFAULT 0,
  supplyExtra DECIMAL(12,3) NOT NULL DEFAULT 0,
  carryForwardToNext DECIMAL(12,3) NULL,
  notes TEXT NULL,
  createdBy INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_da_date (accountDate),
  CONSTRAINT fk_daily_accounts_created_by FOREIGN KEY (createdBy) REFERENCES users(id)
);
