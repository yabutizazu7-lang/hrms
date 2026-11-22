const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v); // DATE columns stay 'YYYY-MM-DD' strings (no timezone shift)
types.setTypeParser(20, (v) => Number(v)); // bigint -> number (counts)
types.setTypeParser(1700, (v) => Number(v)); // numeric -> number
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
});
pool.on('error', (e) => console.error('PostgreSQL pool error:', e.message));
// tx(fn): run fn(client) inside a transaction
const tx = async (fn) => {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
};
module.exports = { pool, tx, q: (t, p) => pool.query(t, p) };
