CREATE TABLE `butcher_production` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionDate` timestamp NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(256) NOT NULL,
	`productNameAr` varchar(256),
	`unit` varchar(32) NOT NULL DEFAULT 'kg',
	`producedQuantity` decimal(12,3) NOT NULL,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `butcher_production_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `butcher_production_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionId` int NOT NULL,
	`rawMaterialId` int NOT NULL,
	`materialName` varchar(256) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`consumedQuantity` decimal(12,3) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `butcher_production_materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `butcher_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`nameAr` varchar(256),
	`unit` varchar(32) NOT NULL DEFAULT 'kg',
	`pricePerUnit` decimal(12,3) NOT NULL DEFAULT '0',
	`soldByWeight` boolean NOT NULL DEFAULT false,
	`currentStock` decimal(12,3) NOT NULL DEFAULT '0',
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `butcher_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `butcher_recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`materialId` int NOT NULL,
	`quantity` decimal(12,4) NOT NULL,
	`unit` varchar(50) NOT NULL DEFAULT 'kg',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `butcher_recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `butcher_sale_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saleId` int NOT NULL,
	`productId` int NOT NULL,
	`productName` varchar(256) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`soldByWeight` boolean NOT NULL DEFAULT false,
	`quantity` decimal(12,3) NOT NULL,
	`pricePerUnit` decimal(12,3) NOT NULL,
	`totalPrice` decimal(14,3) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `butcher_sale_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `butcher_sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`saleDate` timestamp NOT NULL,
	`totalAmount` decimal(14,3) NOT NULL DEFAULT '0',
	`paymentMethod` enum('cash','card','transfer') NOT NULL DEFAULT 'cash',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `butcher_sales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `butcher_waste` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wasteDate` timestamp NOT NULL,
	`itemType` enum('raw_material','butcher_product') NOT NULL DEFAULT 'raw_material',
	`rawMaterialId` int,
	`butcherProductId` int,
	`itemName` varchar(256) NOT NULL,
	`unit` varchar(32) NOT NULL,
	`wasteQty` decimal(12,3) NOT NULL,
	`unitCost` decimal(12,3),
	`totalCost` decimal(12,3),
	`reason` varchar(256),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `butcher_waste_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `butcher_production` ADD CONSTRAINT `butcher_production_productId_butcher_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `butcher_products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_production` ADD CONSTRAINT `butcher_production_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_production_materials` ADD CONSTRAINT `butcher_production_materials_productionId_butcher_production_id_fk` FOREIGN KEY (`productionId`) REFERENCES `butcher_production`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_production_materials` ADD CONSTRAINT `butcher_production_materials_rawMaterialId_raw_materials_id_fk` FOREIGN KEY (`rawMaterialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_products` ADD CONSTRAINT `butcher_products_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_recipes` ADD CONSTRAINT `butcher_recipes_productId_butcher_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `butcher_products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_recipes` ADD CONSTRAINT `butcher_recipes_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_sale_items` ADD CONSTRAINT `butcher_sale_items_saleId_butcher_sales_id_fk` FOREIGN KEY (`saleId`) REFERENCES `butcher_sales`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_sale_items` ADD CONSTRAINT `butcher_sale_items_productId_butcher_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `butcher_products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_sales` ADD CONSTRAINT `butcher_sales_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_waste` ADD CONSTRAINT `butcher_waste_rawMaterialId_raw_materials_id_fk` FOREIGN KEY (`rawMaterialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_waste` ADD CONSTRAINT `butcher_waste_butcherProductId_butcher_products_id_fk` FOREIGN KEY (`butcherProductId`) REFERENCES `butcher_products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `butcher_waste` ADD CONSTRAINT `butcher_waste_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_bprod_date` ON `butcher_production` (`productionDate`);--> statement-breakpoint
CREATE INDEX `idx_bprod_product` ON `butcher_production` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_bpm_production` ON `butcher_production_materials` (`productionId`);--> statement-breakpoint
CREATE INDEX `idx_bpm_material` ON `butcher_production_materials` (`rawMaterialId`);--> statement-breakpoint
CREATE INDEX `idx_bp_name` ON `butcher_products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_br_product` ON `butcher_recipes` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_br_material` ON `butcher_recipes` (`materialId`);--> statement-breakpoint
CREATE INDEX `idx_bsi_sale` ON `butcher_sale_items` (`saleId`);--> statement-breakpoint
CREATE INDEX `idx_bsi_product` ON `butcher_sale_items` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_bs_date` ON `butcher_sales` (`saleDate`);--> statement-breakpoint
CREATE INDEX `idx_bw_date` ON `butcher_waste` (`wasteDate`);--> statement-breakpoint
CREATE INDEX `idx_bw_item` ON `butcher_waste` (`itemType`);