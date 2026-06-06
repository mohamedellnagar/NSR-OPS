import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Check current columns
  const [cols] = await conn.execute("SHOW COLUMNS FROM users");
  const colNames = cols.map(c => c.Field);
  console.log('Current columns:', colNames.join(', '));

  if (!colNames.includes('openId')) {
    await conn.execute("ALTER TABLE users ADD COLUMN `openId` varchar(64) NULL AFTER `id`");
    console.log('✅ Added openId column');
  } else {
    console.log('openId column already exists');
  }
  
  // Verify
  const [cols2] = await conn.execute("SHOW COLUMNS FROM users");
  console.log('Final columns:', cols2.map(c => c.Field).join(', '));
} finally {
  await conn.end();
}
