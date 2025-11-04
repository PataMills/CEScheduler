import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// GET /api/issues/late?days=7
router.get("/late", async (req, res) => {
  const days = parseInt(req.query.days, 10) || 7;
  const sql = `
    SELECT t.id, t.type, t.status, t.window_end, t.resource_id, r.name as resource_name,
           j.customer_name, j.id as job_id
    FROM public.install_tasks t
    JOIN public.install_jobs j ON j.id = t.job_id
    LEFT JOIN public.resources r ON r.id = t.resource_id
    WHERE t.status::text != 'complete'
      AND t.window_end < now()
      AND t.window_end > now() - interval '${days} days'
    ORDER BY t.window_end DESC
    LIMIT 100
  `;
  try {
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'query_failed', detail: e.message });
  }
});

// GET /api/issues/unassigned?days=14
router.get("/unassigned", async (req, res) => {
  const days = parseInt(req.query.days, 10) || 14;
  const sql = `
    SELECT t.id, t.type, t.status, t.window_start, t.resource_id,
           j.customer_name, j.id as job_id
    FROM public.install_tasks t
    JOIN public.install_jobs j ON j.id = t.job_id
    WHERE t.resource_id IS NULL
      AND t.window_start > now()
      AND t.window_start < now() + interval '${days} days'
    ORDER BY t.window_start ASC
    LIMIT 100
  `;
  try {
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'query_failed', detail: e.message });
  }
});

// GET /api/issues/purchasing
router.get("/purchasing", async (_req, res) => {
  const sql = `
    SELECT j.id as job_id, j.customer_name,
      COUNT(p.id) as open_items,
      COALESCE(jsonb_agg(p.*), '[]'::jsonb) as items
  FROM public.purchase_queue p
  JOIN public.install_jobs j ON j.id::text = p.job_id::text
    WHERE p.status IN ('pending','ordered')
    GROUP BY j.id, j.customer_name
    ORDER BY open_items DESC
    LIMIT 100
  `;
  try {
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'query_failed', detail: e.message });
  }
});

export default router;
