import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/jobs/search?q=... or ?term=...
router.get('/search', async (req, res) => {
  const term = String(req.query.q || req.query.term || '').trim();
  if (!term) return res.json([]);
  try {
    const like = '%' + term + '%';
    const isNum = /^\d+$/.test(term);
    const sql = isNum
      ? `SELECT id, customer_name, project_name
           FROM public.jobs
          WHERE CAST(id AS TEXT) LIKE $1 OR customer_name ILIKE $1 OR project_name ILIKE $1
          ORDER BY id DESC
          LIMIT 20`
      : `SELECT id, customer_name, project_name
           FROM public.jobs
          WHERE (customer_name ILIKE $1 OR project_name ILIKE $1)
          ORDER BY id DESC
          LIMIT 20`;
    const { rows } = await pool.query(sql, [like]);
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

// GET /api/jobs/:id/resources  -> list active crews/resources (simple)
router.get('/:id/resources', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, name, team, capacity_min_per_day, timezone, active
         FROM public.resources
        WHERE active = true
        ORDER BY type, name`
    );
    res.json(rows || []);
  } catch (e) {
    console.error('[GET /api/jobs/:id/resources]', e.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// GET /api/jobs/:id - Fetch job details supporting numeric and text ids
router.get('/:id', async (req, res) => {
  const raw = String(req.params.id || '').trim();
  if (!raw) return res.status(400).json({ error: 'invalid_job_id' });

  try {
    if (/^\d+$/.test(raw)) {
      const { rows } = await pool.query(
        `SELECT id, customer_name, project_name, contact_phone,
                address_line1, city, state, zip
           FROM public.jobs
          WHERE id = $1
          LIMIT 1`,
        [parseInt(raw, 10)]
      );
      if (!rows.length) return res.status(404).json({ error: 'job_not_found' });
      return res.json(rows[0]);
    }

    const { rows } = await pool.query(
      `SELECT id, customer_name, cust_contact_phone AS contact_phone,
              address_line1, city, state, zip
         FROM public.install_jobs
        WHERE id = $1
        LIMIT 1`,
      [raw]
    );
    if (!rows.length) return res.status(404).json({ error: 'job_not_found' });
    return res.json(rows[0]);
  } catch (e) {
    console.error('[GET /api/jobs/:id]', e.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// GET /api/jobs/:jobId/material-ready -> { job_id, material_ready, req, rec }
router.get('/:jobId/material-ready', async (req, res) => {
  const jobId = parseInt(req.params.jobId, 10);
  if (!jobId) return res.status(400).json({ error: 'invalid_job_id' });
  try {
    const { rows } = await pool.query(
      `SELECT
          $1::int AS job_id,
          COALESCE(SUM(COALESCE(p.qty_required,0)),0) AS req,
          COALESCE(SUM(COALESCE(p.qty_received,0)),0) AS rec,
          COALESCE(BOOL_AND(p.status IN ('received') OR COALESCE(p.qty_received,0) >= COALESCE(p.qty_required,0)), false) AS material_ready
       FROM public.purchase_queue p
       WHERE (NULLIF(regexp_replace((p.job_id)::text, '[^0-9]', '', 'g'), '')::int) = $1
         AND p.status IN ('pending','ordered','partial_received','received')
      `,
      [jobId]
    );
    const row = rows?.[0] || { job_id: jobId, req: 0, rec: 0, material_ready: false };
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

export default router;
