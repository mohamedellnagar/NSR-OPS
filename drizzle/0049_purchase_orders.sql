-- Purchase orders management tables
CREATE TABLE `purchase_orders` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orderNumber` varchar(64) NOT NULL,
  `supplierId` int,
  `supplierName` varchar(256),
  `status` enum('draft','sent','confirmed','received','cancelled') NOT NULL DEFAULT 'draft',
  `totalAmount` decimal(14,3),
  `notes` text,
  `sentAt` timestamp NULL,
  `confirmedAt` timestamp NULL,
  `receivedAt` timestamp NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
  CONSTRAINT `purchase_orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
CREATE INDEX `idx_po_supplier` ON `purchase_orders` (`supplierId`);
CREATE INDEX `idx_po_status` ON `purchase_orders` (`status`);
CREATE INDEX `idx_po_date` ON `purchase_orders` (`createdAt`);
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_supplierId_suppliers_id_fk`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_createdBy_users_id_fk`
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE `purchase_order_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `orderId` int NOT NULL,
  `materialId` int NOT NULL,
  `materialName` varchar(256) NOT NULL,
  `unit` varchar(32),
  `requestedQty` decimal(12,3) NOT NULL,
  `unitPrice` decimal(12,3),
  `totalPrice` decimal(12,3),
  `notes` text,
  CONSTRAINT `purchase_order_items_id` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_poi_order` ON `purchase_order_items` (`orderId`);
CREATE INDEX `idx_poi_material` ON `purchase_order_items` (`materialId`);
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_orderId_fk`
  FOREIGN KEY (`orderId`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_materialId_fk`
  FOREIGN KEY (`materialId`) REFERENCES `raw_materials`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
