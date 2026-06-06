-- Add standard recipe fields to raw_materials (for semi-finished items)
ALTER TABLE `raw_materials`
  ADD COLUMN `outputQuantity` decimal(12,3) NOT NULL DEFAULT 1.000 AFTER `unit`,
  ADD COLUMN `shelfLife` int NULL AFTER `outputQuantity`,
  ADD COLUMN `storageLocation` varchar(64) NULL AFTER `shelfLife`,
  ADD COLUMN `defaultWastePercent` decimal(5,2) NOT NULL DEFAULT 0.00 AFTER `storageLocation`;

-- Add expected waste % per ingredient in recipe
ALTER TABLE `semi_finished_recipes`
  ADD COLUMN `expectedWastePercent` decimal(5,2) NOT NULL DEFAULT 0.00 AFTER `unit`;
