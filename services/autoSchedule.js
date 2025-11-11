import pool from '../db.js';
import { addBusinessDays } from 'date-fns';

// Create a simple install task next business day for the bid's install job.
// Returns the created task row (or null on failure).
export default async function autoSchedule(bidId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure an install_job exists for this bid
    let jobId = null;
    try {
      const f = await client.query(`SELECT id FROM public.install_jobs WHERE bid_id = $1 LIMIT 1`, [bidId]);
      if (f.rows[0]) jobId = f.rows[0].id;
    } catch (_) {}

    if (!jobId) {
      try {
        const ins = await client.query(
          `INSERT INTO public.install_jobs (bid_id, created_at, updated_at)
           VALUES ($1, now(), now()) RETURNING id`,
          [bidId]
        );
        jobId = ins.rows[0].id;
      } catch (_) {
        // Fallback if install_jobs has no bid_id column
        const ins2 = await client.query(`INSERT INTO public.install_jobs (created_at, updated_at) VALUES (now(), now()) RETURNING id`);
        jobId = ins2.rows[0].id;
      }
    }

    // Pick a crew/resource (prefer type ~ 'install' then 'crew')
    let resource = null;
    try {
      const r = await client.query(
        `SELECT id, name FROM public.resources
          WHERE LOWER(COALESCE(type,'')) IN ('install','crew')
          ORDER BY id ASC LIMIT 1`
      );
      resource = r.rows[0] || null;
    } catch (_) {}
    if (!resource) {
      const r2 = await client.query(`SELECT id, name FROM public.resources ORDER BY id ASC LIMIT 1`).catch(() => ({ rows: [] }));
      resource = r2.rows[0] || null;
    }

    // Next business day 9am-1pm window
    const start = addBusinessDays(new Date(), 1);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);

    // Create install task
    const tIns = await client.query(
      `INSERT INTO public.install_tasks
         (job_id, type, name, window_start, window_end, duration_min, status, notes, checklist, phase_group, created_at, updated_at)
       VALUES ($1,'install',$2,$3::timestamptz,$4::timestamptz,240,'scheduled','', '[]'::jsonb, 'INS', now(), now())
       RETURNING *`,
      [jobId, `Install — Job #${jobId}`, start.toISOString(), end.toISOString()]
    );
    const task = tIns.rows[0];

    // Assign team if we found a resource
    if (resource && resource.id) {
      await client.query(
        `INSERT INTO public.install_task_assignments (task_id, resource_id, resource_name)
         VALUES ($1,$2,$3)
         ON CONFLICT (task_id, COALESCE(resource_id, -1), resource_name) DO NOTHING`,
        [task.id, resource.id, resource.name || null]
      ).catch(() => {});
    }

    await client.query('COMMIT');
    return task;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
