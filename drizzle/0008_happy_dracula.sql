CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`nameAr` varchar(255),
	`sku` varchar(100) NOT NULL,
	`categoryReference` varchar(100),
	`price` decimal(12,4),
	`cost` decimal(12,4),
	`description` text,
	`calories` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`recipeSource` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_sku_unique` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `recipe_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`materialId` int NOT NULL,
	`quantity` decimal(10,4) NOT NULL,
	`unit` varchar(50) NOT NULL DEFAULT 'g',
	`notes` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `recipe_items` ADD CONSTRAINT `recipe_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_items` ADD CONSTRAINT `recipe_items_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_products_sku` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_products_name` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `idx_recipe_product` ON `recipe_items` (`productId`);--> statement-breakpoint
CREATE INDEX `idx_recipe_material` ON `recipe_items` (`materialId`);