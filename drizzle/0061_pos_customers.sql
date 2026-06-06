-- Delivery customers database
CREATE TABLE `pos_customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(256) NOT NULL,
  `phone` VARCHAR(32) NOT NULL UNIQUE,
  `area` VARCHAR(256),
  `building` VARCHAR(256),
  `floor` VARCHAR(64),
  `apartment` VARCHAR(64),
  `notes` TEXT,
  `orderCount` INT NOT NULL DEFAULT 0,
  `lastOrderAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_customer_phone` (`phone`),
  INDEX `idx_customer_name` (`name`)
);

-- Add delivery address fields to pos_orders
ALTER TABLE `pos_orders`
  ADD COLUMN `customerArea` VARCHAR(256) NULL AFTER `customerPhone`,
  ADD COLUMN `customerBuilding` VARCHAR(256) NULL AFTER `customerArea`,
  ADD COLUMN `customerFloor` VARCHAR(64) NULL AFTER `customerBuilding`,
  ADD COLUMN `customerApartment` VARCHAR(64) NULL AFTER `customerFloor`,
  ADD COLUMN `deliveryNotes` TEXT NULL AFTER `customerApartment`,
  ADD COLUMN `customerId` INT NULL AFTER `deliveryNotes`;
