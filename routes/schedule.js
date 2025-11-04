// routes/schedule.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/**
 * Returns ALL tasks for a given day across resources (ops view).
 * Query: ?date=YYYY-MM-DD  (local Mountain date)
 */
router.get("/", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "missing_date" });

    const { rows } = await pool.query(
      `
      WITH mr AS (
        SELECT
          NULLIF(regexp_replace((p.job_id)::text, '[^0-9]', '', 'g'), '')::int AS job_id,
          SUM(COALESCE(p.qty_required, 0)) AS req,
          SUM(COALESCE(p.qty_received, 0)) AS rec,
          BOOL_AND(p.status IN ('received') OR COALESCE(p.qty_received,0) >= COALESCE(p.qty_required,0)) AS material_ready
        FROM public.purchase_queue p
        WHERE p.status IN ('pending','ordered','partial_received','received')
        GROUP BY 1
      )
      SELECT
        v.task_id, v.job_id, v.type, v.name, v.status, v.duration_min,
        v.window_start, v.window_end, v.resource_id, v.resource_name,
        v.customer_name, v.address,
        COALESCE(mr.material_ready, false) AS material_ready
      FROM public.install_tasks_for_day v
      LEFT JOIN mr
        ON mr.job_id = NULLIF(regexp_replace((v.job_id)::text, '[^0-9]', '', 'g'), '')::int
      WHERE DATE(v.window_start AT TIME ZONE 'America/Denver') = $1
      ORDER BY v.resource_name, v.window_start
      `,
      [date]
    );
    res.json(rows);
  } catch (e) {
    console.error("[SCHEDULE] ERROR", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
