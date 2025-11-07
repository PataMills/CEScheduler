// db.js
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const isRequireSSL = (process.env.PGSSLMODE || '').toLowerCase() === 'require';

const useUrl = !!process.env.DATABASE_URL;

// Build the config *either* from DATABASE_URL or discrete vars — not both
const cfg = useUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isRequireSSL ? { rejectUnauthorized: false } : undefined,
    }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      ssl: isRequireSSL ? { rejectUnauthorized: false } : undefined,
    };

const pool = new Pool(cfg);

export const query = (sql, params) => pool.query(sql, params);
export { pool };
export default pool;

// Helpful boot log (redacts password)
console.log('[db] target', {
  via: useUrl ? 'DATABASE_URL' : 'PG* vars',
  host: useUrl ? '(from URL)' : cfg.host,
  port: useUrl ? '(from URL)' : cfg.port,
  db: useUrl ? '(from URL)' : cfg.database,
  ssl: isRequireSSL ? 'require' : 'disable',
});

// Quick self-test (non-fatal)
pool.connect()
  .then(c => c.release())
  .catch(err => console.error('[db] initial connect failed:', err));
