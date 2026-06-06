CREATE TABLE `restaurant_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`live_menu_token` varchar(64),
	`live_menu_id` int,
	`restaurant_name` varchar(255) DEFAULT 'NSR',
	`restaurant_name_en` varchar(255) DEFAULT 'NSR',
	`currency` varchar(10) DEFAULT 'د.إ',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurant_settings_live_menu_token_unique` UNIQUE(`live_menu_token`)
);
--> statement-breakpoint
ALTER TABLE `restaurant_settings` ADD CONSTRAINT `restaurant_settings_live_menu_id_saved_menus_id_fk` FOREIGN KEY (`live_menu_id`) REFERENCES `saved_menus`(`id`) ON DELETE no action ON UPDATE no action;