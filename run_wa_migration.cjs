const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
  const sql = fs.readFileSync('./drizzle/migrations/0042_whatsapp_integration.sql', 'utf8');
  const lines = sql.split('\n');
  const filtered = lines.filter(function(l) {
    return l.trim().indexOf('--') !== 0;
  }).join('\n');
  const stmts = filtered.split(';').map(function(s) {
    return s.trim();
  }).filter(function(s) {
    return s.length > 10;
  });

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  let ok = 0, fail = 0;
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    try {
      await conn.execute(stmt);
      ok++;
    } catch(e) {
      console.error('FAIL [' + i + ']:', e.message.slice(0, 150));
      fail++;
    }
  }
  console.log('Done:', ok, 'ok,', fail, 'failed');
  await conn.end();
}

run().catch(console.error);
