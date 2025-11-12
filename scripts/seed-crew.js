import pool from '../db.js';

async function main() {
  try {
    const sql = `
      INSERT INTO public.resources (name, type)
      SELECT 'Install Crew A','crew'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.resources WHERE type = 'crew'
      );
    `;
    const r = await pool.query(sql);
    console.log('[seed-crew] done; rowCount =', r.rowCount);
    process.exit(0);
  } catch (e) {
    console.error('[seed-crew] ERROR:', e.message || e);
    process.exit(1);
  }
}

main();
