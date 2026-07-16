import mysql from "mysql2/promise";

/**
 * Shared MySQL connection pool.
 *
 * Historically the codebase opened a brand-new physical connection via
 * `mysql.createConnection(process.env.DATABASE_URL)` on almost every query.
 * Under concurrent load this exhausted the server's `max_connections`
 * ("Too many connections"). All of those call-sites now go through this single
 * pool via `getConn()`.
 *
 * Important: `getConn()` returns a *pooled* connection. In mysql2, calling
 * `conn.end()` on a pooled connection RELEASES it back to the pool (it does not
 * close the underlying socket), so existing `try { ... } finally { conn.end() }`
 * blocks keep working correctly and no longer leak connections.
 */
let _pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    _pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 15),
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      idleTimeout: 60000,
    });
  }
  return _pool;
}

/**
 * Get a pooled connection. Always release it when done — the existing pattern
 * `const conn = await getConn(); try { ... } finally { await conn.end(); }`
 * releases it back to the pool.
 */
export function getConn(): Promise<mysql.PoolConnection> {
  return getPool().getConnection();
}
