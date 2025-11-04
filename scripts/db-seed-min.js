#!/usr/bin/env node
import { pool } from "../db.js";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: j } = await client.query(
      `INSERT INTO public.install_jobs (bid_id, created_at) VALUES ($1, now())
       ON CONFLICT (bid_id) DO UPDATE SET updated_at = now()
       RETURNING id`, [10001]
    ).catch(async () => {
      // Fallback if bid_id constraint/column not present
      const r = await client.query(`INSERT INTO public.install_jobs DEFAULT VALUES RETURNING id`);
      return { rows: r.rows };
    });
    const jobId = j[0].id;

    await client.query(
      `INSERT INTO public.install_tasks
        (job_id, type, name, window_start, window_end, duration_min, status, created_at, updated_at)
       VALUES
        ($1,'install','Install – Seed', now() + INTERVAL '2 days', now() + INTERVAL '2 days' + INTERVAL '8 hours', 480, 'scheduled', now(), now())
       ON CONFLICT DO NOTHING`,
      [jobId]
    ).catch(() => {});

    await client.query("COMMIT");
    console.log("Seeded job", jobId);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
  }
  process.exit(0);
}

run();
