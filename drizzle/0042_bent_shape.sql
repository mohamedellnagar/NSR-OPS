CREATE TABLE `imported_menu_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `imported_menu_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `imported_menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`categoryId` int,
	`categoryName` varchar(256),
	`name` varchar(512) NOT NULL,
	`nameAr` varchar(512),
	`description` text,
	`price` decimal(10,2) NOT NULL DEFAULT '0',
	`currency` varchar(8) NOT NULL DEFAULT 'AED',
	`imageUrl` text,
	`isAvailable` boolean DEFAULT true,
	`exported` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `imported_menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menu_import_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceUrl` text NOT NULL,
	`platform` varchar(32) NOT NULL DEFAULT 'unknown',
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`restaurantName` varchar(256),
	`restaurantNameAr` varchar(256),
	`restaurantLogoUrl` text,
	`itemCount` int DEFAULT 0,
	`categoryCount` int DEFAULT 0,
	`errorMessage` text,
	`savedToDb` boolean DEFAULT false,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_import_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `imported_menu_categories` ADD CONSTRAINT `imported_menu_categories_sessionId_menu_import_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `menu_import_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `imported_menu_items` ADD CONSTRAINT `imported_menu_items_sessionId_menu_import_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `menu_import_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `imported_menu_items` ADD CONSTRAINT `imported_menu_items_categoryId_imported_menu_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `imported_menu_categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_import_sessions` ADD CONSTRAINT `menu_import_sessions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_imc_session` ON `imported_menu_categories` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_imi_session` ON `imported_menu_items` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_imi_category` ON `imported_menu_items` (`categoryId`);--> statement-breakpoint
CREATE INDEX `idx_mis_platform` ON `menu_import_sessions` (`platform`);--> statement-breakpoint
CREATE INDEX `idx_mis_status` ON `menu_import_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mis_created` ON `menu_import_sessions` (`createdAt`);