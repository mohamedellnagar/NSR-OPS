-- Add WhatsApp phone number to suppliers for automated purchase order sending
ALTER TABLE `suppliers` ADD COLUMN `whatsappPhone` varchar(32) NULL;
