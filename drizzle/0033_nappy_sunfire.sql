CREATE TABLE `evolution_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(128) NOT NULL,
	`serverUrl` varchar(512) NOT NULL,
	`apiKey` varchar(256) NOT NULL,
	`instanceName` varchar(128) NOT NULL,
	`phoneNumber` varchar(32) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `evolution_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingId` int,
	`remoteJid` varchar(128) NOT NULL,
	`contactName` varchar(256),
	`messagesJson` text NOT NULL,
	`aiAnalysis` text,
	`analysisType` varchar(64) DEFAULT 'general',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `whatsapp_analyses` ADD CONSTRAINT `whatsapp_analyses_settingId_evolution_settings_id_fk` FOREIGN KEY (`settingId`) REFERENCES `evolution_settings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_wa_setting` ON `whatsapp_analyses` (`settingId`);--> statement-breakpoint
CREATE INDEX `idx_wa_remote` ON `whatsapp_analyses` (`remoteJid`);