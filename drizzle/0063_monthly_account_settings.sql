-- Monthly accounts phase 2: per-month inputs that cannot be derived from
-- transactions (opening/closing food inventory, manual monthly discount).
--
-- One row per (year, month), enforced by a unique index so a month can never
-- end up with two conflicting settings rows.
--
-- No branchId column: the project has no multi-branch model. Add one (and widen
-- the unique index) if branches are introduced.

CREATE TABLE IF NOT EXISTS `monthly_account_settings` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `year` INT NOT NULL,
  `month` INT NOT NULL,
  `openingInventory` DECIMAL(14,3) NOT NULL DEFAULT '0',
  `closingInventory` DECIMAL(14,3) NOT NULL DEFAULT '0',
  `discounts` DECIMAL(14,3) NOT NULL DEFAULT '0',
  `notes` TEXT NULL,
  `createdBy` INT NULL,
  `updatedBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mas_year_month` (`year`, `month`)
);
