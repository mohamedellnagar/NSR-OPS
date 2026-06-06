CREATE TABLE `invoice_payment_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`invoiceType` enum('supplier','free') NOT NULL DEFAULT 'supplier',
	`paymentDate` timestamp NOT NULL,
	`paidAmount` decimal(14,3) NOT NULL,
	`paymentType` enum('paid','partial') NOT NULL DEFAULT 'partial',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_payment_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `free_invoices` ADD `remainingAmount` decimal(12,3) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `invoices` ADD `remainingAmount` decimal(14,3) DEFAULT '0';