CREATE TABLE `saved_menus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'قائمة الطعام',
	`token` varchar(64) NOT NULL,
	`menuData` text NOT NULL,
	`restaurantName` varchar(255),
	`restaurantLogo` varchar(512),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_menus_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_menus_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `saved_menus` ADD CONSTRAINT `saved_menus_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_sm_token` ON `saved_menus` (`token`);--> statement-breakpoint
CREATE INDEX `idx_sm_created` ON `saved_menus` (`createdAt`);