CREATE TABLE `report_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriptionId` int NOT NULL,
	`status` enum('sent','failed','pending') NOT NULL DEFAULT 'pending',
	`recipientPhone` varchar(32) NOT NULL,
	`messageContent` text,
	`errorMessage` text,
	`retryCount` int NOT NULL DEFAULT 0,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriptionId` int NOT NULL,
	`phoneNumber` varchar(32) NOT NULL,
	`name` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_recipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`reportType` enum('daily_sales','orders_summary','kitchen_cost','inventory_value','waste_summary','system_alerts') NOT NULL,
	`scheduleType` enum('hourly','daily','weekly','monthly') NOT NULL,
	`scheduleHour` int DEFAULT 8,
	`scheduleDay` int DEFAULT 1,
	`scheduleEveryHours` int DEFAULT 4,
	`isActive` int NOT NULL DEFAULT 1,
	`messageTemplate` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `report_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`evolutionApiUrl` varchar(512),
	`evolutionApiKey` varchar(512),
	`evolutionInstance` varchar(256),
	`isConfigured` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `report_logs` ADD CONSTRAINT `report_logs_subscriptionId_report_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `report_subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_recipients` ADD CONSTRAINT `report_recipients_subscriptionId_report_subscriptions_id_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `report_subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_subscriptions` ADD CONSTRAINT `report_subscriptions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;