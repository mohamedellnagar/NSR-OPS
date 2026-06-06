import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  // Check existing columns
  const [rows] = await conn.query('DESCRIBE report_templates');
  const cols = rows.map(r => r.Field);
  console.log('Existing columns:', cols);

  if (!cols.includes('name')) {
    await conn.execute('ALTER TABLE report_templates ADD COLUMN name VARCHAR(256) DEFAULT NULL');
    console.log('Added name column');
  } else {
    console.log('name column already exists');
  }

  if (!cols.includes('full_text')) {
    await conn.execute('ALTER TABLE report_templates ADD COLUMN full_text TEXT DEFAULT NULL');
    console.log('Added full_text column');
  } else {
    console.log('full_text column already exists');
  }

  // Check indexes
  const [keys] = await conn.query('SHOW INDEX FROM report_templates WHERE Key_name != "PRIMARY"');
  console.log('Indexes:', keys.map(k => k.Key_name + ':' + k.Column_name));

  // Drop unique key on reportType if exists
  const uniqueKey = keys.find(k => k.Column_name === 'reportType');
  if (uniqueKey) {
    await conn.execute(`ALTER TABLE report_templates DROP INDEX ${uniqueKey.Key_name}`);
    console.log('Dropped unique index:', uniqueKey.Key_name);
  } else {
    console.log('No unique index on reportType to drop');
  }

  const [final] = await conn.query('DESCRIBE report_templates');
  console.log('Final schema:', final.map(r => r.Field + ':' + r.Type));
} finally {
  await conn.end();
}
