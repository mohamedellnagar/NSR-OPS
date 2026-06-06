CREATE TABLE `whatsapp_customer_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingId` int,
	`remoteJid` varchar(128) NOT NULL,
	`contactName` varchar(256),
	`messageCount` int NOT NULL DEFAULT 0,
	`sentiment` varchar(32) DEFAULT 'neutral',
	`sentimentScore` decimal(5,2) DEFAULT '0',
	`behaviorCategory` varchar(64),
	`behaviorTags` text,
	`impressionSummary` text,
	`keyTopics` text,
	`urgencyLevel` varchar(16) DEFAULT 'low',
	`recommendationAction` text,
	`rawAnalysisJson` text,
	`lastMessageAt` timestamp,
	`analyzedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_customer_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `whatsapp_customer_analyses` ADD CONSTRAINT `whatsapp_customer_analyses_settingId_evolution_settings_id_fk` FOREIGN KEY (`settingId`) REFERENCES `evolution_settings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_wca_setting` ON `whatsapp_customer_analyses` (`settingId`);--> statement-breakpoint
CREATE INDEX `idx_wca_remote` ON `whatsapp_customer_analyses` (`remoteJid`);--> statement-breakpoint
CREATE INDEX `idx_wca_sentiment` ON `whatsapp_customer_analyses` (`sentiment`);