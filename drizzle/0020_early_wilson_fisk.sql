CREATE TABLE `free_invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`description` varchar(512) NOT NULL,
	`qty` decimal(10,3) NOT NULL DEFAULT '1',
	`unitPrice` decimal(12,3) NOT NULL DEFAULT '0',
	`total` decimal(12,3) NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `free_invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `free_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierName` varchar(256) NOT NULL,
	`supplierType` enum('supplier','service') NOT NULL DEFAULT 'supplier',
	`invoiceNumber` varchar(64),
	`date` timestamp NOT NULL,
	`subtotal` decimal(12,3) NOT NULL DEFAULT '0',
	`vatPct` decimal(5,2) NOT NULL DEFAULT '0',
	`vatAmount` decimal(12,3) NOT NULL DEFAULT '0',
	`totalAmount` decimal(12,3) NOT NULL DEFAULT '0',
	`paymentStatus` enum('paid','deferred','partial') NOT NULL DEFAULT 'deferred',
	`paidAmount` decimal(12,3) DEFAULT '0',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `free_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `free_invoice_items` ADD CONSTRAINT `free_invoice_items_invoiceId_free_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `free_invoices`(`id`) ON DELETE cascade ON UPDATE no action;