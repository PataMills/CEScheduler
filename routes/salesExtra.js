import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../db.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'task-docs');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function ok(res, data) { return res.json(data || { ok: true }); }
function fail(res, e) { console.error('[salesExtra]', e); return res.status(500).json({ error: e.message || String(e) }); }

// Alias: /api/sales/check-availability -> /api/availability/check with same query string
router.get('/check-availability', async (req, res) => {
  try {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(307, '/api/availability/check' + qs);
  } catch (e) {
    console.error('[sales alias check-availability]', e);
    res.status(500).json({ error: 'alias_failed' });
  }
});

// Alias: /api/sales/create-service-task -> existing /api/services logic
router.post('/create-service-task', async (req, res) => {
  try {
    const resp = await fetch(`http://localhost:${process.env.PORT || 3000}/api/services`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const data = await resp.json().catch(() => ({}));
    res.status(resp.status).json(data);
  } catch (e) {
    console.error('[sales alias create-service-task]', e);
    res.status(500).json({ error: 'alias_failed' });
  }
});

// GET /api/sales/tasks?start=YYYY-MM-DD&end=YYYY-MM-DD&types=install,service&query=foo
router.get('/tasks', async (req, res) => {
  try {
    const start = String(req.query.start || new Date().toISOString().slice(0,10));
    const end = String(req.query.end || new Date(Date.now()+14*86400000).toISOString().slice(0,10));
    const types = String(req.query.types || 'install,service').split(',').map(s=>s.trim()).filter(Boolean);
    const q = String(req.query.query || '').trim();
    const who = String(req.query.sales || '').trim(); // optional explicit salesperson

    const params = [start, end];
    const where = [
      `t.window_start >= $1::date`,
      `t.window_start <  ($2::date + interval '1 day')`,
      `COALESCE(t.status,'scheduled') <> 'complete'`
    ];
    if (types.length && !types.includes('all')) { params.push(types); where.push(`LOWER(t.type) = ANY($${params.length})`); }

    // Join bids via job_id relationship to filter by salesperson if provided
    let salespersonFilter = '';
    if (who) {
      params.push(who);
      salespersonFilter = `AND (b.sales_person = $${params.length})`;
    }

    const sql = `
      SELECT t.id, t.type, t.name, t.window_start, t.window_end, t.duration_min, t.status,
             t.job_id, t.resource_id,
             COALESCE(r.name, '') AS resource_name,
             COALESCE(j.customer_name, '') AS customer_name,
             COALESCE(j.address, '') AS address
      FROM public.install_tasks t
      LEFT JOIN public.resources r ON r.id = t.resource_id
      LEFT JOIN public.install_jobs j ON CAST(j.id AS TEXT) = t.job_id
      LEFT JOIN public.bids b ON CAST(b.job_id AS TEXT) = t.job_id
      WHERE ${where.join(' AND ')}
        ${salespersonFilter}
      ORDER BY t.window_start ASC, t.id ASC
      LIMIT 500`;

    const r = await pool.query(sql, params);
    return ok(res, r.rows);
  } catch (e) { return fail(res, e); }
});

// GET /api/sales/jobs?query=foo
router.get('/jobs', async (req, res) => {
  try {
    const q = String(req.query.query || '').trim();
    const who = String(req.query.sales || '').trim();

    const params = [];
    const where = [];
    if (q) { params.push('%'+q+'%'); where.push(`(j.customer_name ILIKE $${params.length})`); }
    // salesperson filter if provided: join bids by job_id
    if (who) { params.push(who); where.push(`EXISTS (SELECT 1 FROM public.bids b WHERE CAST(b.job_id AS TEXT) = CAST(j.id AS TEXT) AND b.sales_person = $${params.length})`); }

    const sql = `
      SELECT j.id, j.customer_name, j.address
      FROM public.install_jobs j
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY j.id DESC
      LIMIT 100`;

    const r = await pool.query(sql, params);
    return ok(res, r.rows);
  } catch (e) { return fail(res, e); }
});

// POST /api/tasks/:id/docs  body: { name, dataUrl, mime_type }
router.post('/tasks/:id/docs', express.json({ limit: '25mb' }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, dataUrl, mime_type } = req.body || {};
    if (!id || !dataUrl) return res.status(400).json({ error: 'missing_fields' });
    const m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl));
    if (!m) return res.status(400).json({ error: 'bad_data_url' });
    const buf = Buffer.from(m[2], 'base64');
    const safe = (name || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const fileName = `${id}_${Date.now()}_${safe}`;
    const abs = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(abs, buf);
    const url = `/uploads/task-docs/${fileName}`;
    await pool.query(
      `INSERT INTO public.task_documents (task_id, name, url, mime_type, uploaded_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, safe, url, mime_type || null, req.user?.email || null]
    );
    return ok(res, { ok: true, url });
  } catch (e) { return fail(res, e); }
});

router.get('/tasks/:id/docs', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query(
      `SELECT id, name, url, mime_type, uploaded_by, uploaded_at
       FROM public.task_documents WHERE task_id = $1 ORDER BY id DESC`, [id]
    );
    return ok(res, r.rows);
  } catch (e) { return fail(res, e); }
});

// POST /api/tasks/:id/status  body: { status, note }
router.post('/tasks/:id/status', express.json(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, note } = req.body || {};
    const allowed = new Set(['scheduled','in_progress','complete','hold','canceled']);
    if (!allowed.has(status)) return res.status(400).json({ error: 'bad_status' });

    const up = await pool.query(
      `UPDATE public.install_tasks
         SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING job_id`,
      [status, id]
    );
    if (!up.rowCount) return res.status(404).json({ error: 'task_not_found' });

    await pool.query(
      `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, up.rows[0].job_id, status === 'in_progress' ? 'arrived' : (status === 'complete' ? 'complete' : 'reassigned'), { note }, req.user?.email || null]
    );

    return ok(res, { ok: true });
  } catch (e) { return fail(res, e); }
});

// POST /api/tasks/:id/reschedule  body: { start_iso, end_iso, duration_min, resource_id?, note? }
router.post('/tasks/:id/reschedule', express.json(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { start_iso, end_iso, duration_min, resource_id, note } = req.body || {};
    if (!id || (!start_iso && !end_iso && !duration_min)) return res.status(400).json({ error: 'missing_fields' });

    const tq = await pool.query(`SELECT id, job_id, window_start, window_end, duration_min, resource_id FROM public.install_tasks WHERE id = $1`, [id]);
    if (!tq.rowCount) return res.status(404).json({ error: 'task_not_found' });
    const t = tq.rows[0];

    const start = start_iso ? new Date(start_iso) : (t.window_start || new Date());
    const end = end_iso ? new Date(end_iso) : new Date(start.getTime() + (Number(duration_min || t.duration_min || 60) * 60000));

    const params = [start, end, id];
    const setResource = Number.isFinite(Number(resource_id));
    const sql = `UPDATE public.install_tasks SET window_start=$1, window_end=$2, updated_at=now() ${setResource ? ', resource_id=' + Number(resource_id) : ''} WHERE id=$3`;
    await pool.query(sql, params);

    await pool.query(
      `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
       VALUES ($1, $2, 'reassigned', $3, $4)`,
      [id, t.job_id, { from: { start: t.window_start, end: t.window_end, resource_id: t.resource_id }, to: { start, end, resource_id }, note }, req.user?.email || null]
    );

    return ok(res, { ok: true });
  } catch (e) { return fail(res, e); }
});

export default router;
