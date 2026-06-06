CREATE TABLE `inventory_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` int NOT NULL,
	`transactionType` enum('IN','OUT','ADJUSTMENT') NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`unitPrice` decimal(12,3),
	`totalAmount` decimal(12,3),
	`supplierId` int,
	`supplierName` varchar(256),
	`destination` varchar(256),
	`reason` enum('purchase','production','waste','transfer','return','adjustment','other'),
	`referenceNumber` varchar(128),
	`transactionDate` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `material_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`nameAr` varchar(128),
	`description` text,
	`color` varchar(32) DEFAULT '#6366f1',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `material_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `raw_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(256) NOT NULL,
	`nameAr` varchar(256),
	`categoryId` int,
	`unit` varchar(32) NOT NULL DEFAULT 'kg',
	`currentQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`minimumQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`reorderQuantity` decimal(12,3) DEFAULT '0',
	`lastPurchasePrice` decimal(12,3),
	`averageCost` decimal(12,3) DEFAULT '0',
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `raw_materials_id` PRIMARY KEY(`id`),
	CONSTRAINT `raw_materials_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`nameAr` varchar(256),
	`contactPerson` varchar(128),
	`phone` varchar(32),
	`email` varchar(320),
	`address` text,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','warehouse_manager','viewer') NOT NULL DEFAULT 'viewer';--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_materials` ADD CONSTRAINT `raw_materials_categoryId_material_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `material_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `raw_materials` ADD CONSTRAINT `raw_materials_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_tx_material` ON `inventory_transactions` (`materialId`);--> statement-breakpoint
CREATE INDEX `idx_tx_type` ON `inventory_transactions` (`transactionType`);--> statement-breakpoint
CREATE INDEX `idx_tx_date` ON `inventory_transactions` (`transactionDate`);--> statement-breakpoint
CREATE INDEX `idx_tx_supplier` ON `inventory_transactions` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_rm_category` ON `raw_materials` (`categoryId`);--> statement-breakpoint
CREATE INDEX `idx_rm_code` ON `raw_materials` (`code`);