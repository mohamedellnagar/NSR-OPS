CREATE TABLE `kitchen_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`nameAr` varchar(256),
	`unit` varchar(32) NOT NULL DEFAULT 'حصة',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kitchen_products_id` PRIMARY KEY(`id`),
	CONSTRAINT `kitchen_products_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `idx_kp_name` ON `kitchen_products` (`name`);