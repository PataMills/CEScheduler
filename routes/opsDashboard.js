import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// GET /api/ops-dashboard - List all jobs with missing/defective items
router.get("/", async (_req, res) => {
  const sql = `
    WITH inc AS (
      SELECT
        e.task_id,
        e.job_id           AS install_job_id_text,   -- text (install_jobs.id)
        e.bid_id,                                    -- int (can be null)
        MAX(e.created_at) AS last_ts
      FROM public.job_events e
      WHERE e.event_type = 'incomplete'
      GROUP BY e.task_id, e.job_id, e.bid_id
    )
    SELECT
      inc.last_ts,
      ij.id            AS install_job_id,
      ij.customer_name,
      t.id             AS task_id,
      r.name           AS resource_name,
      COALESCE((
        SELECT jsonb_agg(e.payload->'needs')
        FROM public.job_events e
        WHERE e.event_type='incomplete'
          AND e.job_id = inc.install_job_id_text
      ), '[]'::jsonb) AS needs_list,
      COALESCE((
        SELECT jsonb_agg(p.*)
        FROM public.bids b
        JOIN public.jobs pj        ON pj.id = b.job_id
        JOIN public.purchase_queue p ON p.job_id = pj.id
        WHERE b.id = inc.bid_id
          AND p.status IN ('pending','ordered')
      ), '[]'::jsonb) AS purchasing
    FROM inc
    LEFT JOIN public.install_tasks t ON t.id = inc.task_id
    LEFT JOIN public.resources    r ON r.id = t.resource_id
    LEFT JOIN public.install_jobs ij ON ij.id = inc.install_job_id_text
    ORDER BY inc.last_ts DESC
  `;
  try {
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    console.error('[OPS DASHBOARD] query error', e);
    res.status(500).json({ error: 'query_failed', detail: e.message });
  }
});

// GET /api/ops-dashboard/:jobId - Get details for a specific job
router.get("/:jobId", async (req, res) => {
  const jobId = parseInt(req.params.jobId, 10);
  if (!jobId) return res.status(400).json({ error: 'invalid_job_id' });
  try {
    const jobRes = await pool.query(
      `SELECT j.*, 
        (SELECT jsonb_agg(e.* ORDER BY e.created_at DESC)
         FROM public.job_events e
         WHERE e.job_id = j.id AND e.event_type = 'incomplete') AS incomplete_events,
        (SELECT jsonb_agg(p.* ORDER BY p.created_at DESC)
         FROM public.purchase_queue p
         WHERE p.job_id = j.id) AS purchase_items,
        (SELECT jsonb_agg(t.* ORDER BY t.created_at DESC)
         FROM public.install_tasks t
         WHERE t.job_id = j.id AND t.type = 'service') AS service_tasks
       FROM public.install_jobs j
       WHERE j.id = $1`,
      [jobId]
    );
    if (jobRes.rowCount === 0) {
      return res.status(404).json({ error: 'job_not_found' });
    }
    res.json(jobRes.rows[0]);
  } catch (e) {
    console.error('[OPS DASHBOARD] detail error', e);
    res.status(500).json({ error: 'query_failed', detail: e.message });
  }
});

// POST /api/ops-dashboard/:jobId/resolve - Mark items as resolved
router.post("/:jobId/resolve", async (req, res) => {
  const jobId = parseInt(req.params.jobId, 10);
  if (!jobId) return res.status(400).json({ error: 'invalid_job_id' });
  const { resolution_note } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.purchase_queue
       SET status = 'resolved'::text, updated_at = now()
       WHERE job_id = $1 AND status::text IN ('pending','ordered')`,
      [jobId]
    );
    await client.query(
      `INSERT INTO public.job_events (job_id, event_type, payload, created_by)
       VALUES ($1, 'incomplete_resolved', $2, 'ops')`,
      [jobId, JSON.stringify({ resolution_note: resolution_note || 'Manually resolved' })]
    );
    await client.query(
      `UPDATE public.install_tasks
       SET status = 'complete'::text, updated_at = now()
       WHERE job_id = $1 AND type::text = 'service' AND status::text IN ('hold','scheduled')`,
      [jobId]
    );
    await client.query("COMMIT");
    res.json({ ok: true, job_id: jobId, resolved: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error('[OPS DASHBOARD] resolve error', e);
    res.status(500).json({ error: 'resolve_failed', detail: e.message });
  } finally {
    client.release();
  }
});

export default router;
