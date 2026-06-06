-- Add allergens field to recipe_items for food safety compliance
ALTER TABLE `recipe_items` ADD COLUMN `allergens` text NULL;
