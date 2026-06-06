CREATE TABLE `semi_finished_recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` int NOT NULL,
	`ingredientId` int NOT NULL,
	`quantity` decimal(12,4) NOT NULL,
	`unit` varchar(50) NOT NULL DEFAULT 'g',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `semi_finished_recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `raw_materials` ADD `materialType` varchar(32) DEFAULT 'raw' NOT NULL;--> statement-breakpoint
ALTER TABLE `semi_finished_recipes` ADD CONSTRAINT `semi_finished_recipes_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `semi_finished_recipes` ADD CONSTRAINT `semi_finished_recipes_ingredientId_raw_materials_id_fk` FOREIGN KEY (`ingredientId`) REFERENCES `raw_materials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_sfr_material` ON `semi_finished_recipes` (`materialId`);--> statement-breakpoint
CREATE INDEX `idx_sfr_ingredient` ON `semi_finished_recipes` (`ingredientId`);