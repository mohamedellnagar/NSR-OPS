CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`restaurantName` varchar(255) NOT NULL DEFAULT 'مطعمي',
	`restaurantNameEn` varchar(255) DEFAULT 'My Restaurant',
	`phone` varchar(50),
	`phone2` varchar(50),
	`email` varchar(320),
	`address` text,
	`city` varchar(100),
	`country` varchar(100) DEFAULT 'UAE',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Dubai',
	`businessDayStartHour` int NOT NULL DEFAULT 6,
	`currency` varchar(10) NOT NULL DEFAULT 'AED',
	`currencySymbol` varchar(10) NOT NULL DEFAULT 'د.إ',
	`vatRate` decimal(5,2) NOT NULL DEFAULT '5.00',
	`vatEnabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`)
);
