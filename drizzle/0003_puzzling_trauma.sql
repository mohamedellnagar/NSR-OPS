CREATE TABLE `kitchen_daily_production` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionDate` timestamp NOT NULL,
	`productName` varchar(256) NOT NULL,
	`productNameAr` varchar(256),
	`unit` varchar(32) NOT NULL DEFAULT 'portion',
	`openingBalance` decimal(12,3) NOT NULL DEFAULT '0',
	`producedQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`usedQuantity` decimal(12,3) NOT NULL DEFAULT '0',
	`closingBalance` decimal(12,3) NOT NULL DEFAULT '0',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kitchen_daily_production_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kitchen_production_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionId` int NOT NULL,
	`rawMaterialId` int NOT NULL,
	`materialName` varchar(256) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`consumedQuantity` decimal(12,3) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kitchen_production_materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `kitchen_daily_production` ADD CONSTRAINT `kitchen_daily_production_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_production_materials` ADD CONSTRAINT `kitchen_production_materials_productionId_kitchen_daily_production_id_fk` FOREIGN KEY (`productionId`) REFERENCES `kitchen_daily_production`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_production_materials` ADD CONSTRAINT `kitchen_production_materials_rawMaterialId_raw_materials_id_fk` FOREIGN KEY (`rawMaterialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_kdp_date` ON `kitchen_daily_production` (`productionDate`);--> statement-breakpoint
CREATE INDEX `idx_kdp_product` ON `kitchen_daily_production` (`productName`);--> statement-breakpoint
CREATE INDEX `idx_kpm_production` ON `kitchen_production_materials` (`productionId`);--> statement-breakpoint
CREATE INDEX `idx_kpm_material` ON `kitchen_production_materials` (`rawMaterialId`);