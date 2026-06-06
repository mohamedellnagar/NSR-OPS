-- Add waste percentage per ingredient in final product recipes
ALTER TABLE `recipe_items`
  ADD COLUMN `wastePercent` DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER `quantity`;
