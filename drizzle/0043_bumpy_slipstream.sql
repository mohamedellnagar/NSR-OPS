CREATE TABLE `comparison_match_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`comparisonSessionId` int NOT NULL,
	`unifiedName` varchar(512) NOT NULL,
	`unifiedNameAr` varchar(512),
	`unifiedCategory` varchar(256),
	`confidenceScore` int DEFAULT 100,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comparison_match_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comparison_match_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matchGroupId` int NOT NULL,
	`importSessionId` int NOT NULL,
	`menuItemId` int NOT NULL,
	`priceSnapshot` decimal(10,2) NOT NULL DEFAULT '0',
	`currency` varchar(8) NOT NULL DEFAULT 'AED',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comparison_match_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comparison_restaurants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`comparisonSessionId` int NOT NULL,
	`importSessionId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `comparison_restaurants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_comparison_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`myRestaurantSessionId` int NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`matchedGroupCount` int DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_comparison_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `comparison_match_groups` ADD CONSTRAINT `comparison_match_groups_comparisonSessionId_price_comparison_sessions_id_fk` FOREIGN KEY (`comparisonSessionId`) REFERENCES `price_comparison_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparison_match_items` ADD CONSTRAINT `comparison_match_items_matchGroupId_comparison_match_groups_id_fk` FOREIGN KEY (`matchGroupId`) REFERENCES `comparison_match_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparison_match_items` ADD CONSTRAINT `comparison_match_items_importSessionId_menu_import_sessions_id_fk` FOREIGN KEY (`importSessionId`) REFERENCES `menu_import_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparison_match_items` ADD CONSTRAINT `comparison_match_items_menuItemId_imported_menu_items_id_fk` FOREIGN KEY (`menuItemId`) REFERENCES `imported_menu_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparison_restaurants` ADD CONSTRAINT `comparison_restaurants_comparisonSessionId_price_comparison_sessions_id_fk` FOREIGN KEY (`comparisonSessionId`) REFERENCES `price_comparison_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `comparison_restaurants` ADD CONSTRAINT `comparison_restaurants_importSessionId_menu_import_sessions_id_fk` FOREIGN KEY (`importSessionId`) REFERENCES `menu_import_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_comparison_sessions` ADD CONSTRAINT `price_comparison_sessions_myRestaurantSessionId_menu_import_sessions_id_fk` FOREIGN KEY (`myRestaurantSessionId`) REFERENCES `menu_import_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_comparison_sessions` ADD CONSTRAINT `price_comparison_sessions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_cmg_comp_session` ON `comparison_match_groups` (`comparisonSessionId`);--> statement-breakpoint
CREATE INDEX `idx_cmi_group` ON `comparison_match_items` (`matchGroupId`);--> statement-breakpoint
CREATE INDEX `idx_cmi_session` ON `comparison_match_items` (`importSessionId`);--> statement-breakpoint
CREATE INDEX `idx_cmi_item` ON `comparison_match_items` (`menuItemId`);--> statement-breakpoint
CREATE INDEX `idx_cr_comp_session` ON `comparison_restaurants` (`comparisonSessionId`);--> statement-breakpoint
CREATE INDEX `idx_cr_import_session` ON `comparison_restaurants` (`importSessionId`);--> statement-breakpoint
CREATE INDEX `idx_pcs_my_rest` ON `price_comparison_sessions` (`myRestaurantSessionId`);--> statement-breakpoint
CREATE INDEX `idx_pcs_status` ON `price_comparison_sessions` (`status`);