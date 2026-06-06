CREATE TABLE `daily_sales_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` int NOT NULL,
	`productSku` varchar(100),
	`productName` varchar(256) NOT NULL,
	`productId` int,
	`netQuantity` decimal(12,4) NOT NULL DEFAULT '0',
	`totalSales` decimal(12,4) DEFAULT '0',
	`netSales` decimal(12,4) DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_sales_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_sales_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saleDate` date NOT NULL,
	`branchName` varchar(256),
	`branchRef` varchar(64),
	`fileName` varchar(512),
	`totalItems` int DEFAULT 0,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_sales_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `daily_sales_items` ADD CONSTRAINT `daily_sales_items_uploadId_daily_sales_uploads_id_fk` FOREIGN KEY (`uploadId`) REFERENCES `daily_sales_uploads`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_sales_items` ADD CONSTRAINT `daily_sales_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_sales_uploads` ADD CONSTRAINT `daily_sales_uploads_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_dsi_upload` ON `daily_sales_items` (`uploadId`);--> statement-breakpoint
CREATE INDEX `idx_dsi_product` ON `daily_sales_items` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_dsi_sku` ON `daily_sales_items` (`productSku`);--> statement-breakpoint
CREATE INDEX `idx_dsu_date` ON `daily_sales_uploads` (`saleDate`);--> statement-breakpoint
CREATE INDEX `idx_dsu_branch` ON `daily_sales_uploads` (`branchRef`);