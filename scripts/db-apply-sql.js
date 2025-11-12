import fs from 'fs';
import path from 'path';
import pool from '../db.js';

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node scripts/db-apply-sql.js <path-to-sql-file>');
    process.exit(1);
  }
  const abs = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  if (!fs.existsSync(abs)) {
    console.error('SQL file not found:', abs);
    process.exit(2);
  }
  const sql = fs.readFileSync(abs, 'utf8');
  try {
    console.log('[db-apply-sql] Applying', abs);
    await pool.query(sql);
    console.log('[db-apply-sql] OK');
    process.exit(0);
  } catch (e) {
    console.error('[db-apply-sql] ERROR:', e.message || e);
    process.exit(3);
  }
}

main();
