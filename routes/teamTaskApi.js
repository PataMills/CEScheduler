// routes/teamTaskApi.js
import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

const STATUS_MAP = {
  ontheway: 'in_progress',
  arrived: 'in_progress',
  wip: 'in_progress',
  complete: 'complete'
};

/** GET /api/team/task?id=7631 */
router.get('/task', async (req, res) => {
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

router.patch('/task/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });

  const rawStatus = (req.body?.status || '').toString().trim().toLowerCase();
  if (!rawStatus || !STATUS_MAP[rawStatus]) {
    return res.status(400).json({ error: 'bad_status', allowed: Object.keys(STATUS_MAP) });
  }

  const noteInput = (req.body?.note ?? '').toString().trim();
  const note = noteInput.length ? noteInput : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE public.install_tasks
         SET status = $1,
             updated_at = now()
       WHERE id = $2
       RETURNING id, status`,
      [STATUS_MAP[rawStatus], id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not_found' });
    }

    await client.query(
      `INSERT INTO public.task_events (task_id, task_table, event_type, note, at)
       VALUES ($1, $2, $3, $4, now())`,
      [id, 'install_tasks', rawStatus, note]
    );

    await client.query('COMMIT');
    const out = rows[0];
    res.json({ ok: true, id: out.id, status: out.status });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[team task status patch]', err);
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

export default function registerTeamTaskApi(app) {
  app.use('/api/team', router);
}
