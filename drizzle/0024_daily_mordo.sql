ALTER TABLE `free_invoices` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `invoices` ADD `paidAt` timestamp;--> statement-breakpoint
CREATE INDEX `idx_inv_paidAt` ON `invoices` (`paidAt`);