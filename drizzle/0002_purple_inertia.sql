CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`materialId` int NOT NULL,
	`materialName` varchar(256) NOT NULL,
	`materialUnit` varchar(32) NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`unitPrice` decimal(12,3) NOT NULL,
	`totalPrice` decimal(14,3) NOT NULL,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(64) NOT NULL,
	`supplierId` int,
	`supplierName` varchar(256),
	`invoiceDate` timestamp NOT NULL DEFAULT (now()),
	`subtotal` decimal(14,3) NOT NULL DEFAULT '0',
	`vatEnabled` boolean NOT NULL DEFAULT false,
	`vatRate` decimal(5,2) DEFAULT '5.00',
	`vatAmount` decimal(14,3) NOT NULL DEFAULT '0',
	`totalAmount` decimal(14,3) NOT NULL DEFAULT '0',
	`paymentStatus` enum('paid','deferred','partial') NOT NULL DEFAULT 'deferred',
	`paidAmount` decimal(14,3) DEFAULT '0',
	`notes` text,
	`stockUpdated` boolean NOT NULL DEFAULT false,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `allowedPages` text;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_materialId_raw_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_supplierId_suppliers_id_fk` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_ii_invoice` ON `invoice_items` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `idx_ii_material` ON `invoice_items` (`materialId`);--> statement-breakpoint
CREATE INDEX `idx_inv_supplier` ON `invoices` (`supplierId`);--> statement-breakpoint
CREATE INDEX `idx_inv_date` ON `invoices` (`invoiceDate`);--> statement-breakpoint
CREATE INDEX `idx_inv_status` ON `invoices` (`paymentStatus`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `loginMethod`;