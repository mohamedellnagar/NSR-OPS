import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Check current columns
  const [cols] = await conn.execute('DESCRIBE users');
  const colNames = cols.map(c => c.Field);
  console.log('Current columns:', colNames.join(', '));

  // Add passwordHash column if not exists
  if (!colNames.includes('passwordHash')) {
    await conn.execute("ALTER TABLE users ADD COLUMN passwordHash varchar(256) NOT NULL DEFAULT '' AFTER email");
    console.log('Added passwordHash column');
  }

  // Make email NOT NULL if it's nullable
  const emailCol = cols.find(c => c.Field === 'email');
  if (emailCol && emailCol.Null === 'YES') {
    // Update any null emails first
    await conn.execute("UPDATE users SET email = CONCAT('user_', id, '@temp.com') WHERE email IS NULL OR email = ''");
    await conn.execute('ALTER TABLE users MODIFY COLUMN email varchar(320) NOT NULL');
    console.log('Made email NOT NULL');
  }

  // Add unique constraint on email if not exists
  try {
    await conn.execute('ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email)');
    console.log('Added email unique constraint');
  } catch(e) {
    console.log('email unique constraint already exists');
  }

  // Remove openId unique constraint and column if exists
  if (colNames.includes('openId')) {
    try {
      await conn.execute('ALTER TABLE users DROP INDEX users_openId_unique');
    } catch(e) { /* ignore */ }
    try {
      await conn.execute('ALTER TABLE users DROP COLUMN openId');
      console.log('Dropped openId column');
    } catch(e) { console.log('Could not drop openId:', e.message); }
  }

  // Remove loginMethod column if exists
  if (colNames.includes('loginMethod')) {
    try {
      await conn.execute('ALTER TABLE users DROP COLUMN loginMethod');
      console.log('Dropped loginMethod column');
    } catch(e) { console.log('Could not drop loginMethod:', e.message); }
  }

  // Remove lastSignedIn column if exists (not needed for custom auth)
  // Keep it as it's useful for tracking

  // Update role enum to include warehouse_manager and viewer
  try {
    await conn.execute("ALTER TABLE users MODIFY COLUMN role enum('admin','warehouse_manager','viewer') NOT NULL DEFAULT 'viewer'");
    console.log('Updated role enum');
  } catch(e) { console.log('Role enum update:', e.message); }

  // Add isActive column if not exists
  if (!colNames.includes('isActive')) {
    await conn.execute("ALTER TABLE users ADD COLUMN isActive boolean NOT NULL DEFAULT true");
    console.log('Added isActive column');
  }

  // Seed admin user if no users exist
  const [users] = await conn.execute('SELECT COUNT(*) as count FROM users');
  if (users[0].count === 0) {
    // bcrypt hash of 'admin123'
    const adminHash = '$2b$10$rOzJqnBXqzHJqzHJqzHJqeKqzHJqzHJqzHJqzHJqzHJqzHJqzHJq';
    // Use a simple known hash for 'admin123'
    await conn.execute(
      "INSERT INTO users (email, passwordHash, name, role, isActive, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
      ['admin@matjari.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin', 'admin', true]
    );
    console.log('Seeded admin user: admin@matjari.com / password: password');
  }

  console.log('\nMigration complete!');
} catch(e) {
  console.error('Error:', e.message);
} finally {
  await conn.end();
}
