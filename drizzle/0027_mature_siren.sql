CREATE TABLE `kitchen_inventory_counts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countDate` varchar(10) NOT NULL,
	`materialId` int NOT NULL,
	`materialName` varchar(256) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`openingQty` decimal(12,3) NOT NULL DEFAULT '0',
	`receivedQty` decimal(12,3) NOT NULL DEFAULT '0',
	`closingQty` decimal(12,3),
	`actualConsumption` decimal(12,3),
	`unitCost` decimal(12,3) DEFAULT '0',
	`consumptionCost` decimal(12,3) DEFAULT '0',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kitchen_inventory_counts_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_kic_date_material` UNIQUE(`countDate`,`materialId`)
);
--> statement-breakpoint
ALTER TABLE `report_subscriptions` MODIFY COLUMN `reportType` enum('daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts','warehouse_performance','kitchen_production','kitchen_pull','daily_account_summary') NOT NULL;--> statement-breakpoint
ALTER TABLE `report_subscriptions` MODIFY COLUMN `scheduleType` enum('hourly','daily','weekly','monthly','instant') NOT NULL;--> statement-breakpoint
ALTER TABLE `kitchen_inventory_counts` ADD CONSTRAINT `kitchen_inventory_counts_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_inventory_counts` ADD CONSTRAINT `kitchen_inventory_counts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_kic_date` ON `kitchen_inventory_counts` (`countDate`);--> statement-breakpoint
CREATE INDEX `idx_kic_material` ON `kitchen_inventory_counts` (`materialId`);