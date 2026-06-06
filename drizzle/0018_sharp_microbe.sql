CREATE TABLE `sale_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`productName` varchar(256) NOT NULL,
	`sku` varchar(100),
	`branchName` varchar(256),
	`branchRef` varchar(64),
	`totalSales` decimal(12,3) NOT NULL DEFAULT '0',
	`netSalesWithTax` decimal(12,3) NOT NULL DEFAULT '0',
	`tax` decimal(12,3) NOT NULL DEFAULT '0',
	`discount` decimal(12,3) NOT NULL DEFAULT '0',
	`netSales` decimal(12,3) NOT NULL DEFAULT '0',
	`qty` int NOT NULL DEFAULT 0,
	`cost` decimal(12,3) NOT NULL DEFAULT '0',
	`returnAmount` decimal(12,3) NOT NULL DEFAULT '0',
	`returnQty` int NOT NULL DEFAULT 0,
	`cancelAmount` decimal(12,3) NOT NULL DEFAULT '0',
	`cancelQty` int NOT NULL DEFAULT 0,
	`profit` decimal(12,3) NOT NULL DEFAULT '0',
	`productId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sale_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDateFrom` timestamp NOT NULL,
	`reportDateTo` timestamp NOT NULL,
	`branchName` varchar(256),
	`branchRef` varchar(64),
	`totalSales` decimal(14,3) NOT NULL DEFAULT '0',
	`totalNetSales` decimal(14,3) NOT NULL DEFAULT '0',
	`totalQty` int NOT NULL DEFAULT 0,
	`totalCost` decimal(14,3) NOT NULL DEFAULT '0',
	`totalProfit` decimal(14,3) NOT NULL DEFAULT '0',
	`fileName` varchar(512),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_reportId_sales_reports_id_fk` FOREIGN KEY (`reportId`) REFERENCES `sales_reports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_reports` ADD CONSTRAINT `sales_reports_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_si_report` ON `sale_items` (`reportId`);--> statement-breakpoint
CREATE INDEX `idx_si_sku` ON `sale_items` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_si_product` ON `sale_items` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_sr_date` ON `sales_reports` (`reportDateFrom`);--> statement-breakpoint
CREATE INDEX `idx_sr_branch` ON `sales_reports` (`branchRef`);