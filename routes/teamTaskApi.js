// routes/teamTaskApi.js
import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

/** GET /api/team/task?id=7631 */
router.get('/api/team/task', async (req, res) => {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  try {
    const { rows } = await pool.query(`
      SELECT
        t.id                               AS task_id,
        COALESCE(t.name, 'Task '||t.id)    AS name,
        t.job_id,
        t.status,
        t.resource_id,
        r.name                             AS resource_name,
        t.window_start,
        t.window_end,
        COALESCE(t.address, j.address)     AS address,
        COALESCE(j.customer_name, j.project_name) AS customer_name
      FROM public.install_tasks t
      LEFT JOIN public.jobs j   ON j.id = t.job_id
  LEFT JOIN public.resources r  ON r.id = t.resource_id
      WHERE t.id = $1
      LIMIT 1
    `, [id]);

    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'not_found' });

    // TODO: fetch real docs if available; return empty array for now
    res.json({ ...row, docs: [] });
  } catch (e) {
    console.error('[team task api]', e);
    res.status(500).json({ error: 'db_error' });
  }
});

export default router;
