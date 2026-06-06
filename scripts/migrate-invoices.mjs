import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const stmts = [
  `CREATE TABLE IF NOT EXISTS \`invoice_items\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`invoiceId\` int NOT NULL,
    \`materialId\` int NOT NULL,
    \`materialName\` varchar(256) NOT NULL,
    \`materialUnit\` varchar(32) NOT NULL,
    \`quantity\` decimal(12,3) NOT NULL,
    \`unitPrice\` decimal(12,3) NOT NULL,
    \`totalPrice\` decimal(14,3) NOT NULL,
    CONSTRAINT \`invoice_items_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`invoices\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`invoiceNumber\` varchar(64) NOT NULL,
    \`supplierId\` int,
    \`supplierName\` varchar(256),
    \`invoiceDate\` timestamp NOT NULL DEFAULT (now()),
    \`subtotal\` decimal(14,3) NOT NULL DEFAULT '0',
    \`vatEnabled\` boolean NOT NULL DEFAULT false,
    \`vatRate\` decimal(5,2) DEFAULT '5.00',
    \`vatAmount\` decimal(14,3) NOT NULL DEFAULT '0',
    \`totalAmount\` decimal(14,3) NOT NULL DEFAULT '0',
    \`paymentStatus\` enum('paid','deferred','partial') NOT NULL DEFAULT 'deferred',
    \`paidAmount\` decimal(14,3) DEFAULT '0',
    \`notes\` text,
    \`stockUpdated\` boolean NOT NULL DEFAULT false,
    \`createdBy\` int,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`invoices_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`invoices_invoiceNumber_unique\` UNIQUE(\`invoiceNumber\`)
  )`,
  `ALTER TABLE \`invoice_items\` ADD CONSTRAINT \`invoice_items_invoiceId_invoices_id_fk\` FOREIGN KEY (\`invoiceId\`) REFERENCES \`invoices\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`invoice_items\` ADD CONSTRAINT \`invoice_items_materialId_raw_materials_id_fk\` FOREIGN KEY (\`materialId\`) REFERENCES \`raw_materials\`(\`id\`) ON DELETE no action ON UPDATE no action`,
  `ALTER TABLE \`invoices\` ADD CONSTRAINT \`invoices_supplierId_suppliers_id_fk\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE no action ON UPDATE no action`,
  `ALTER TABLE \`invoices\` ADD CONSTRAINT \`invoices_createdBy_users_id_fk\` FOREIGN KEY (\`createdBy\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS \`idx_ii_invoice\` ON \`invoice_items\` (\`invoiceId\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_ii_material\` ON \`invoice_items\` (\`materialId\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_inv_supplier\` ON \`invoices\` (\`supplierId\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_inv_date\` ON \`invoices\` (\`invoiceDate\`)`,
  `CREATE INDEX IF NOT EXISTS \`idx_inv_status\` ON \`invoices\` (\`paymentStatus\`)`,
];

for (const s of stmts) {
  try {
    await conn.execute(s);
    console.log('OK:', s.slice(0, 70).replace(/\n\s*/g, ' '));
  } catch (e) {
    const skip = e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_TABLE_EXISTS_ERROR' || (e.message && e.message.includes('Duplicate'));
    if (skip) {
      console.log('SKIP (already exists):', s.slice(0, 60).replace(/\n\s*/g, ' '));
    } else {
      throw e;
    }
  }
}

await conn.end();
console.log('Migration complete!');
