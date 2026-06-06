-- Kitchen shift management tables
CREATE TABLE `shifts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `shiftDate` date NOT NULL,
  `shiftType` enum('morning','afternoon','night') NOT NULL,
  `startTime` varchar(8) NOT NULL,
  `endTime` varchar(8) NOT NULL,
  `notes` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_shifts_date` ON `shifts` (`shiftDate`);
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_createdBy_users_id_fk`
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE `shift_assignments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `shiftId` int NOT NULL,
  `employeeName` varchar(256) NOT NULL,
  `employeeNameAr` varchar(256),
  `role` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT `shift_assignments_id` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_sa_shift` ON `shift_assignments` (`shiftId`);
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_shiftId_shifts_id_fk`
  FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
