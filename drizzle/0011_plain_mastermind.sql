CREATE TABLE `kitchen_daily_pulls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pullDate` timestamp NOT NULL,
	`materialId` int NOT NULL,
	`materialName` varchar(256) NOT NULL,
	`materialNameAr` varchar(256),
	`materialType` varchar(32) NOT NULL DEFAULT 'raw',
	`unit` varchar(32) NOT NULL,
	`pulledQuantity` decimal(12,3) NOT NULL,
	`closingCount` decimal(12,3),
	`carriedForward` decimal(12,3) DEFAULT '0',
	`wasteQty` decimal(12,3) DEFAULT '0',
	`status` enum('open','counted','closed') NOT NULL DEFAULT 'open',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kitchen_daily_pulls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waste_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wasteDate` timestamp NOT NULL,
	`materialId` int NOT NULL,
	`materialName` varchar(256) NOT NULL,
	`materialNameAr` varchar(256),
	`unit` varchar(32) NOT NULL,
	`wasteQty` decimal(12,3) NOT NULL,
	`unitCost` decimal(12,3),
	`totalCost` decimal(12,3),
	`source` enum('kitchen','raw_material','semi_finished') NOT NULL,
	`referenceId` int,
	`reason` varchar(256),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waste_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `kitchen_daily_pulls` ADD CONSTRAINT `kitchen_daily_pulls_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_daily_pulls` ADD CONSTRAINT `kitchen_daily_pulls_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_logs` ADD CONSTRAINT `waste_logs_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_logs` ADD CONSTRAINT `waste_logs_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_kdpull_date` ON `kitchen_daily_pulls` (`pullDate`);--> statement-breakpoint
CREATE INDEX `idx_kdpull_material` ON `kitchen_daily_pulls` (`materialId`);--> statement-breakpoint
CREATE INDEX `idx_wl_date` ON `waste_logs` (`wasteDate`);--> statement-breakpoint
CREATE INDEX `idx_wl_material` ON `waste_logs` (`materialId`);--> statement-breakpoint
CREATE INDEX `idx_wl_source` ON `waste_logs` (`source`);