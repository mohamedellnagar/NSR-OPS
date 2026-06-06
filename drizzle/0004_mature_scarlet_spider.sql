CREATE TABLE `kitchen_production_counts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productionId` int NOT NULL,
	`actualCount` decimal(12,3) NOT NULL,
	`notes` text,
	`countedBy` int,
	`countedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kitchen_production_counts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `kitchen_production_counts` ADD CONSTRAINT `kitchen_production_counts_productionId_kitchen_daily_production_id_fk` FOREIGN KEY (`productionId`) REFERENCES `kitchen_daily_production`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kitchen_production_counts` ADD CONSTRAINT `kitchen_production_counts_countedBy_users_id_fk` FOREIGN KEY (`countedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_kpc_production` ON `kitchen_production_counts` (`productionId`);