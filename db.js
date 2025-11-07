// db.js
import pg from 'pg';

const {
  DATABASE_URL,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

// prefer DATABASE_URL, otherwise discrete fields
const pool = new pg.Pool(
  DATABASE_URL ? {
    connectionString: DATABASE_URL,
    // uncomment if your host requires TLS without CA:
//  ssl: { rejectUnauthorized: false },
  } : {
    host: DB_HOST || '127.0.0.1',   // ⟵ force IPv4 (avoids ::1)
    port: +(DB_PORT || 5432),
    user: DB_USER || 'postgres',
    password: DB_PASSWORD || 'postgres',
    database: DB_NAME || 'pata_ops',
    // ssl: { rejectUnauthorized: false }, // if needed
  }
);

// helpful startup print
(function printTarget(){
  try {
    const u = new URL(DATABASE_URL || '');
    console.log('[DB]', 'via URL →', u.hostname, u.port || '5432', u.pathname.slice(1));
  } catch {
    console.log('[DB]', 'via fields →', (DB_HOST||'127.0.0.1'), (DB_PORT||'5432'), (DB_NAME||'pata_ops'));
  }
})();

export default pool;
