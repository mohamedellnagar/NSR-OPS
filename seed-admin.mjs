import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [users] = await conn.execute('SELECT COUNT(*) as count FROM users');
  if (users[0].count === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await conn.execute(
      "INSERT INTO users (email, passwordHash, name, role, isActive, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
      ['admin@matjari.com', hash, 'مدير النظام', 'admin', true]
    );
    console.log('✅ Admin user created: admin@matjari.com / admin123');
  } else {
    console.log('Users already exist, count:', users[0].count);
    const [existing] = await conn.execute('SELECT id, email, name, role FROM users');
    console.log('Existing users:', JSON.stringify(existing));
    
    // Update passwordHash for existing users that have empty hash
    const [emptyHash] = await conn.execute("SELECT id, email FROM users WHERE passwordHash = '' OR passwordHash IS NULL");
    if (emptyHash.length > 0) {
      const hash = await bcrypt.hash('admin123', 10);
      for (const u of emptyHash) {
        await conn.execute("UPDATE users SET passwordHash = ? WHERE id = ?", [hash, u.id]);
        console.log('Updated password for:', u.email);
      }
    }
  }
} finally {
  await conn.end();
}
