ALTER TABLE `butcher_products` ADD `sku` varchar(64);--> statement-breakpoint
CREATE INDEX `idx_bp_sku` ON `butcher_products` (`sku`);