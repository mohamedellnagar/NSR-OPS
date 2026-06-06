-- Phase 2: Add opening_balance to inventory_transactions reason enum
ALTER TABLE `inventory_transactions`
  MODIFY COLUMN `reason` ENUM(
    'purchase',
    'production',
    'waste',
    'transfer',
    'return',
    'adjustment',
    'other',
    'opening_balance'
  );
