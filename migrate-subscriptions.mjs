import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await conn.query('DESCRIBE report_subscriptions');
  const cols = rows.map(r => r.Field);
  console.log('Existing columns:', cols);

  // Add templateId column (FK to report_templates.id)
  if (!cols.includes('templateId')) {
    await conn.execute('ALTER TABLE report_subscriptions ADD COLUMN templateId INT DEFAULT NULL');
    console.log('Added templateId column');
  } else {
    console.log('templateId already exists');
  }

  // Change reportType from ENUM to VARCHAR(100) to support any template name/type
  // (keep backward compatibility - existing subscriptions keep their reportType value)
  await conn.execute('ALTER TABLE report_subscriptions MODIFY COLUMN reportType VARCHAR(100) NOT NULL DEFAULT "daily_sales"');
  console.log('Changed reportType to VARCHAR(100)');

  const [final] = await conn.query('DESCRIBE report_subscriptions');
  console.log('Final schema:', final.map(r => r.Field + ':' + r.Type));
} finally {
  await conn.end();
}
