-- Monthly accounts: expense classification on supplier + free invoices.
--
-- Adds three NEW nullable columns to each invoice table. The legacy
-- `expenseCategory` enum (operational|maintenance|fixed|other) is deliberately
-- left in place and unchanged: the daily-accounts expense aggregation and the
-- financial KPI both group on it.
--
-- NULL in the new columns means "needs classification" — that state is computed
-- at read time, never stored.
--
-- Backfill mapping (legacy expenseCategory -> expenseType, expenseCategoryCode):
--   operational -> OPERATIONAL, OTHER
--   maintenance -> OPERATIONAL, MAINTENANCE
--   fixed       -> OPERATIONAL, OTHER
--   other       -> (NULL),      OTHER      -- type left unset for user review
--   NULL        -> (NULL),      (NULL)     -- fully unclassified

ALTER TABLE `invoices`
  ADD COLUMN `expenseType` ENUM('OPERATIONAL','NON_OPERATIONAL') NULL AFTER `expenseCategory`,
  ADD COLUMN `expenseCategoryCode` ENUM(
    'FOOD_PURCHASES','SALARIES','RENT','UTILITIES','GAS','PACKAGING','CLEANING',
    'MAINTENANCE','DELIVERY','APP_COMMISSIONS','MARKETING','BANK_FEES',
    'EQUIPMENT_ASSETS','OWNER_DRAW','TAXES','LICENSES','CHARCOAL','BUTCHERY','OTHER'
  ) NULL AFTER `expenseType`,
  ADD COLUMN `paymentMethod` ENUM('CASH','BANK_TRANSFER','CARD','CHEQUE','OTHER') NULL AFTER `expenseCategoryCode`;

ALTER TABLE `free_invoices`
  ADD COLUMN `expenseType` ENUM('OPERATIONAL','NON_OPERATIONAL') NULL AFTER `expenseCategory`,
  ADD COLUMN `expenseCategoryCode` ENUM(
    'FOOD_PURCHASES','SALARIES','RENT','UTILITIES','GAS','PACKAGING','CLEANING',
    'MAINTENANCE','DELIVERY','APP_COMMISSIONS','MARKETING','BANK_FEES',
    'EQUIPMENT_ASSETS','OWNER_DRAW','TAXES','LICENSES','CHARCOAL','BUTCHERY','OTHER'
  ) NULL AFTER `expenseType`,
  ADD COLUMN `paymentMethod` ENUM('CASH','BANK_TRANSFER','CARD','CHEQUE','OTHER') NULL AFTER `expenseCategoryCode`;

-- Backfill from the legacy category. Only touches rows not yet classified.
UPDATE `invoices` SET `expenseType` = 'OPERATIONAL', `expenseCategoryCode` = 'OTHER'
  WHERE `expenseCategory` IN ('operational','fixed') AND `expenseType` IS NULL AND `expenseCategoryCode` IS NULL;
UPDATE `invoices` SET `expenseType` = 'OPERATIONAL', `expenseCategoryCode` = 'MAINTENANCE'
  WHERE `expenseCategory` = 'maintenance' AND `expenseType` IS NULL AND `expenseCategoryCode` IS NULL;
UPDATE `invoices` SET `expenseCategoryCode` = 'OTHER'
  WHERE `expenseCategory` = 'other' AND `expenseCategoryCode` IS NULL;

UPDATE `free_invoices` SET `expenseType` = 'OPERATIONAL', `expenseCategoryCode` = 'OTHER'
  WHERE `expenseCategory` IN ('operational','fixed') AND `expenseType` IS NULL AND `expenseCategoryCode` IS NULL;
UPDATE `free_invoices` SET `expenseType` = 'OPERATIONAL', `expenseCategoryCode` = 'MAINTENANCE'
  WHERE `expenseCategory` = 'maintenance' AND `expenseType` IS NULL AND `expenseCategoryCode` IS NULL;
UPDATE `free_invoices` SET `expenseCategoryCode` = 'OTHER'
  WHERE `expenseCategory` = 'other' AND `expenseCategoryCode` IS NULL;

-- Month filtering on the monthly-accounts page uses the invoice date.
CREATE INDEX `idx_fi_date` ON `free_invoices` (`date`);

-- ── monthly_payments: same classification columns ──
-- Backfill maps its existing `category` (salaries|rent|utilities|other), which
-- is left in place.
ALTER TABLE `monthly_payments`
  ADD COLUMN `expenseType` ENUM('OPERATIONAL','NON_OPERATIONAL') NULL AFTER `notes`,
  ADD COLUMN `expenseCategoryCode` ENUM(
    'FOOD_PURCHASES','SALARIES','RENT','UTILITIES','GAS','PACKAGING','CLEANING',
    'MAINTENANCE','DELIVERY','APP_COMMISSIONS','MARKETING','BANK_FEES',
    'EQUIPMENT_ASSETS','OWNER_DRAW','TAXES','LICENSES','CHARCOAL','BUTCHERY','OTHER'
  ) NULL AFTER `expenseType`,
  ADD COLUMN `paymentMethod` ENUM('CASH','BANK_TRANSFER','CARD','CHEQUE','OTHER') NULL AFTER `expenseCategoryCode`;

UPDATE `monthly_payments` SET `expenseType`='OPERATIONAL', `expenseCategoryCode`='SALARIES'
  WHERE `category`='salaries' AND `expenseType` IS NULL AND `expenseCategoryCode` IS NULL;
UPDATE `monthly_payments` SET `expenseType`='OPERATIONAL', `expenseCategoryCode`='RENT'
  WHERE `category`='rent' AND `expenseType` IS NULL AND `expenseCategoryCode` IS NULL;
UPDATE `monthly_payments` SET `expenseType`='OPERATIONAL', `expenseCategoryCode`='UTILITIES'
  WHERE `category`='utilities' AND `expenseType` IS NULL AND `expenseCategoryCode` IS NULL;
UPDATE `monthly_payments` SET `expenseCategoryCode`='OTHER'
  WHERE `category`='other' AND `expenseCategoryCode` IS NULL;
