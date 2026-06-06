-- ─────────────────────────────────────────────────────────────────────────────
-- POS System: Tables, Orders, Order Items, Payments, Returns
-- ─────────────────────────────────────────────────────────────────────────────

-- Restaurant physical tables
CREATE TABLE `restaurant_tables` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `tableNumber` varchar(20) NOT NULL,
  `label` varchar(100),          -- e.g. "Table 1", "VIP Room", "Terrace"
  `capacity` int DEFAULT 4,
  `section` varchar(100),        -- 'indoor','outdoor','vip','terrace'
  `status` enum('available','occupied','reserved') DEFAULT 'available',
  `isActive` boolean DEFAULT true,
  `sortOrder` int DEFAULT 0,
  `createdAt` timestamp DEFAULT NOW(),
  `updatedAt` timestamp DEFAULT NOW() ON UPDATE NOW()
);
CREATE INDEX `idx_tables_status` ON `restaurant_tables`(`status`);

-- Main POS orders
CREATE TABLE `pos_orders` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orderNumber` varchar(64) UNIQUE NOT NULL,
  `tableId` int NULL REFERENCES `restaurant_tables`(`id`),
  `orderType` enum('dine_in','takeaway','delivery') DEFAULT 'dine_in' NOT NULL,
  `status` enum('draft','sent_to_kitchen','partially_ready','ready','served','paid','cancelled','refunded') DEFAULT 'draft' NOT NULL,
  `waiterId` int NULL REFERENCES `users`(`id`),
  `cashierId` int NULL REFERENCES `users`(`id`),
  `guestCount` int DEFAULT 1,
  `subtotal` decimal(14,3) DEFAULT 0,
  `discountType` enum('fixed','percentage') NULL,
  `discountValue` decimal(10,3) DEFAULT 0,
  `discountAmount` decimal(14,3) DEFAULT 0,
  `taxPct` decimal(5,2) DEFAULT 0,
  `taxAmount` decimal(14,3) DEFAULT 0,
  `total` decimal(14,3) DEFAULT 0,
  `notes` text,
  `customerName` varchar(256) NULL,
  `customerPhone` varchar(64) NULL,
  `sentToKitchenAt` timestamp NULL,
  `readyAt` timestamp NULL,
  `servedAt` timestamp NULL,
  `paidAt` timestamp NULL,
  `createdAt` timestamp DEFAULT NOW(),
  `updatedAt` timestamp DEFAULT NOW() ON UPDATE NOW()
);
CREATE INDEX `idx_pos_orders_status` ON `pos_orders`(`status`);
CREATE INDEX `idx_pos_orders_table` ON `pos_orders`(`tableId`);
CREATE INDEX `idx_pos_orders_date` ON `pos_orders`(`createdAt`);

-- Order line items
CREATE TABLE `pos_order_items` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orderId` int NOT NULL REFERENCES `pos_orders`(`id`) ON DELETE CASCADE,
  `productId` int NOT NULL REFERENCES `products`(`id`),
  `productName` varchar(256) NOT NULL,
  `productNameAr` varchar(256),
  `quantity` decimal(10,3) DEFAULT 1 NOT NULL,
  `unitPrice` decimal(12,3) NOT NULL,
  `discountAmount` decimal(12,3) DEFAULT 0,
  `totalPrice` decimal(14,3) NOT NULL,
  `status` enum('pending','preparing','ready','served','cancelled') DEFAULT 'pending' NOT NULL,
  `notes` text,             -- special requests: "no onions", "extra spicy"
  `course` varchar(50) NULL,  -- 'starter','main','dessert','drinks'
  `printedAt` timestamp NULL, -- when sent to kitchen printer
  `createdAt` timestamp DEFAULT NOW(),
  `updatedAt` timestamp DEFAULT NOW() ON UPDATE NOW()
);
CREATE INDEX `idx_poi_order` ON `pos_order_items`(`orderId`);
CREATE INDEX `idx_poi_status` ON `pos_order_items`(`status`);

-- Payments (supports split payment: cash + card)
CREATE TABLE `pos_payments` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `orderId` int NOT NULL REFERENCES `pos_orders`(`id`),
  `paymentMethod` enum('cash','card','transfer','online') NOT NULL,
  `amount` decimal(14,3) NOT NULL,
  `cashPaid` decimal(14,3) NULL,     -- customer gave this much cash
  `changeGiven` decimal(14,3) NULL,  -- change returned to customer
  `reference` varchar(100) NULL,     -- card approval code, transfer ref
  `processedBy` int NULL REFERENCES `users`(`id`),
  `processedAt` timestamp DEFAULT NOW()
);
CREATE INDEX `idx_pos_payments_order` ON `pos_payments`(`orderId`);

-- Returns / Refunds
CREATE TABLE `pos_returns` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `originalOrderId` int NOT NULL REFERENCES `pos_orders`(`id`),
  `reason` text,
  `totalRefund` decimal(14,3) NOT NULL,
  `refundMethod` enum('cash','card','credit') DEFAULT 'cash',
  `processedBy` int NULL REFERENCES `users`(`id`),
  `processedAt` timestamp DEFAULT NOW()
);
CREATE INDEX `idx_pos_returns_order` ON `pos_returns`(`originalOrderId`);
