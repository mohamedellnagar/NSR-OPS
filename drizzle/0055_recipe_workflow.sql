-- Phase: Recipe workflow — status, versioning, approval
ALTER TABLE `raw_materials`
  ADD COLUMN `recipeStatus` ENUM('draft','pending','approved','suspended','archived') NOT NULL DEFAULT 'draft' AFTER `materialType`,
  ADD COLUMN `recipeVersion` SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER `recipeStatus`,
  ADD COLUMN `approvedBy` INT NULL AFTER `recipeVersion`,
  ADD COLUMN `approvalDate` TIMESTAMP NULL AFTER `approvedBy`,
  ADD COLUMN `changeLog` TEXT NULL AFTER `approvalDate`;

ALTER TABLE `raw_materials`
  ADD CONSTRAINT `fk_rm_approvedBy` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE SET NULL;

-- Snapshot table for recipe version history
CREATE TABLE `semi_finished_recipe_versions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `materialId` INT NOT NULL,
  `version` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `status` ENUM('draft','pending','approved','suspended','archived') NOT NULL DEFAULT 'draft',
  `ingredientsSnapshot` JSON,
  `totalCost` DECIMAL(12,3) DEFAULT 0,
  `costPerUnit` DECIMAL(12,3) DEFAULT 0,
  `outputQuantity` DECIMAL(12,3) DEFAULT 1,
  `outputUnit` VARCHAR(32),
  `changeLog` TEXT,
  `createdBy` INT,
  `approvedBy` INT,
  `approvalDate` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_sfv_material` (`materialId`),
  INDEX `idx_sfv_version` (`materialId`, `version`),
  FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE CASCADE
);
