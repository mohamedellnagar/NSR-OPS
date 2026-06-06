CREATE TABLE `monthly_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`category` varchar(64) NOT NULL DEFAULT 'other',
	`totalAmount` decimal(12,4) NOT NULL DEFAULT '0',
	`paidAmount` decimal(12,4) NOT NULL DEFAULT '0',
	`dueDay` int NOT NULL DEFAULT 1,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`recurrence` varchar(32) NOT NULL DEFAULT 'monthly',
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`paidAt` timestamp,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `monthly_payments` ADD CONSTRAINT `monthly_payments_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_mp_month_year` ON `monthly_payments` (`month`,`year`);--> statement-breakpoint
CREATE INDEX `idx_mp_category` ON `monthly_payments` (`category`);--> statement-breakpoint
CREATE INDEX `idx_mp_status` ON `monthly_payments` (`status`);