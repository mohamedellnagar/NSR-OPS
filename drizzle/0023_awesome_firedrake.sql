CREATE TABLE `daily_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountDate` varchar(10) NOT NULL,
	`salesCash` decimal(12,3) NOT NULL DEFAULT '0',
	`salesCard` decimal(12,3) NOT NULL DEFAULT '0',
	`salesKita` decimal(12,3) NOT NULL DEFAULT '0',
	`salesOrders` decimal(12,3) NOT NULL DEFAULT '0',
	`salesNoon` decimal(12,3) NOT NULL DEFAULT '0',
	`salesDeliveroo` decimal(12,3) NOT NULL DEFAULT '0',
	`salesCareem` decimal(12,3) NOT NULL DEFAULT '0',
	`expensesFixed` decimal(12,3) NOT NULL DEFAULT '0',
	`supplyToRestaurant` decimal(12,3) NOT NULL DEFAULT '0',
	`supplyToManagement` decimal(12,3) NOT NULL DEFAULT '0',
	`supplyExtra` decimal(12,3) NOT NULL DEFAULT '0',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `free_invoices` ADD `expenseCategory` enum('operational','maintenance','fixed','other') DEFAULT 'other';--> statement-breakpoint
ALTER TABLE `daily_accounts` ADD CONSTRAINT `daily_accounts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_da_date` ON `daily_accounts` (`accountDate`);