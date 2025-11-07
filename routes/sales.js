// routes/sales.js
import express from "express";
import { pool } from "../db.js"; // update if your db helper has a different path/name

const router = express.Router();

/* ---------------------- SALES: LIST JOBS ---------------------- */
// GET /api/sales/jobs
// query params: query (text), id (exact id optional), sales (salesperson name optional)
router.get("/api/sales/jobs", async (req, res) => {
  const qRaw  = String(req.query.query || '').trim();
  const idRaw = String(req.query.id || '').trim();
  const sales = String(req.query.sales || '').trim();

  const params = [];
  const where = [];

  if (qRaw) {
    params.push(`%${qRaw}%`);
    where.push(`(j.customer_name ILIKE $${params.length} OR COALESCE(j.address,'') ILIKE $${params.length} OR COALESCE(b.project_name,'') ILIKE $${params.length})`);
  }
  if (idRaw) {
    params.push(idRaw);
    where.push(`(j.id::text = $${params.length} OR b.id::text = $${params.length})`);
  }
  if (sales) {
    params.push(sales);
    where.push(`COALESCE(b.salesman, b.sales_person, '') = $${params.length}`);
  }

  const sql = `
    SELECT j.id,
           j.customer_name,
           COALESCE(b.project_name, '') AS project_name
    FROM public.install_jobs j
    LEFT JOIN public.bids b ON CAST(b.job_id AS TEXT) = CAST(j.id AS TEXT)
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY j.id DESC
    LIMIT 100`;

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows || []);
  } catch (e) {
    console.error("[GET /api/sales/jobs]", e);
    res.status(500).json({ error: e.message });
  }
});

/* -------------------- SALES: JOB TASKS ------------------------ */
// GET /api/sales/jobs/:id/tasks
router.get("/api/sales/jobs/:id/tasks", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT id, job_id, type, name, status, window_start, window_end
       FROM install_tasks
       WHERE job_id = $1
       ORDER BY window_start`,
      [id]
    );
    res.json({ tasks: rows || [] });
  } catch (e) {
    console.error("[GET /api/sales/jobs/:id/tasks]", e);
    res.status(500).json({ error: e.message });
  }
});

/* --------------- CREATE RESCHEDULE REQUEST -------------------- */
// POST /api/tasks/:taskId/reschedule-requests
router.post("/api/tasks/:taskId/reschedule-requests", async (req, res) => {
  try {
    const { taskId } = req.params;
    const { new_start, new_end, reason } = req.body || {};
    const user = req.user?.email || "sales@unknown";

    const { rows: [t] } = await pool.query(
      "SELECT window_start, window_end FROM install_tasks WHERE id=$1",
      [taskId]
    );
    if (!t) return res.status(404).json({ error: "task_not_found" });

    const { rows } = await pool.query(
      `INSERT INTO task_reschedule_requests
         (task_id, requested_by, old_start, old_end, new_start, new_end, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [taskId, user, t.window_start, t.window_end, new_start, new_end, reason || null]
    );
    res.json({ ok: true, request: rows[0] });
  } catch (e) {
    console.error("[POST /api/tasks/:taskId/reschedule-requests]", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------------------- CREATE SERVICE ------------------------ */
// POST /api/services
router.post("/api/services", async (req, res) => {
  try {
    const { job_id, summary, preferred_start, preferred_end, contact_name, contact_phone, files = [] } = req.body || {};

    await pool.query(
      `INSERT INTO service_requests(job_id, summary, preferred_start, preferred_end, contact_name, contact_phone, files, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [job_id, summary, preferred_start, preferred_end, contact_name, contact_phone, JSON.stringify(files), req.user?.email || "sales@unknown"]
    ).catch(() => {});

    const { rows: [task] } = await pool.query(
      `INSERT INTO install_tasks (job_id, type, name, status, duration_min, window_start, window_end)
       VALUES ($1, 'service', LEFT($2,100), 'scheduled',
               GREATEST(30, EXTRACT(EPOCH FROM ($4::timestamptz-$3::timestamptz))::int/60),
               $3, $4)
       RETURNING id`,
      [job_id, summary, preferred_start, preferred_end]
    );
    res.json({ ok: true, task_id: task.id });
  } catch (e) {
    console.error("[POST /api/services]", e);
    res.status(500).json({ error: e.message });
  }
});

/* --------------------- SALES PACKAGE GET ---------------------- */
// GET /api/bids/:id/package
router.get("/api/bids/:id/package", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: [b] } = await pool.query(
      `SELECT id, po_number, total_amount, deposit_amount, deposit_received_at, promised_install_date, status
       FROM bids WHERE id=$1`,
      [id]
    );
    if (!b) return res.status(404).json({ error: "not_found" });
    const { rows: docs } = await pool.query(
      `SELECT id, kind, name, url, uploaded_at FROM bid_documents WHERE bid_id=$1 ORDER BY uploaded_at DESC`,
      [id]
    );
    res.json({ ...b, documents: docs || [] });
  } catch (e) {
    console.error("[GET /api/bids/:id/package]", e);
    res.status(500).json({ error: e.message });
  }
});

/* --------------------- SALES PACKAGE PUT ---------------------- */
// PUT /api/bids/:id/package
router.put("/api/bids/:id/package", async (req, res) => {
  try {
    const { id } = req.params;
    const { po_number, total_amount, deposit_amount, deposit_received_at, promised_install_date, status } = req.body || {};
    await pool.query(
      `UPDATE bids SET
         po_number=$2, total_amount=$3, deposit_amount=$4, deposit_received_at=$5, promised_install_date=$6,
         status = COALESCE($7,status)
       WHERE id=$1`,
      [id, po_number, total_amount, deposit_amount, deposit_received_at, promised_install_date, status]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[PUT /api/bids/:id/package]", e);
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------- ADD DOCUMENT ------------------------- */
// POST /api/bids/:id/docs
router.post("/api/bids/:id/docs", async (req, res) => {
  try {
    const { id } = req.params;
    const { kind, name, url } = req.body || {};
    const { rows: [doc] } = await pool.query(
      `INSERT INTO bid_documents (bid_id, kind, name, url, uploaded_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [id, kind, name, url, req.user?.email || "sales@unknown"]
    );
    res.json({ ok: true, doc });
  } catch (e) {
    console.error("[POST /api/bids/:id/docs]", e);
    res.status(500).json({ error: e.message });
  }
});

/* ----------------- MARK READY FOR SCHEDULING ------------------ */
// POST /api/bids/:id/ready-for-schedule
router.post("/api/bids/:id/ready-for-schedule", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`UPDATE bids SET status='ready_for_schedule' WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/bids/:id/ready-for-schedule]", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bids/:id/customer-info -> minimal contact/address for auto-fill
router.get('/api/bids/:id/customer-info', async (req, res) => {
  const id = String(req.params.id || '').trim();
  try {
    const { rows: byBid } = await pool.query(
      `SELECT COALESCE(b.phone, b.contact_phone) AS phone,
              COALESCE(b.mobile, NULL) AS mobile,
              COALESCE(b.site_address, b.job_address, b.address_line1, NULL) AS address_line1,
              COALESCE(b.city, NULL) AS city,
              COALESCE(b.state, NULL) AS state,
              COALESCE(b.zip, NULL) AS zip,
              COALESCE(b.job_id::text, NULL) AS job_id
       FROM bids b
       WHERE b.id::text = $1
       LIMIT 1`,
      [id]
    );
    if (byBid.length) return res.json(byBid[0]);

    const { rows: byJob } = await pool.query(
      `SELECT COALESCE(j.cust_contact_phone, j.contact_phone) AS phone,
              NULL::text AS mobile,
              COALESCE(j.address_line1, j.address) AS address_line1,
              j.city, j.state, j.zip
       FROM install_jobs j
       WHERE j.id::text = $1
       LIMIT 1`,
      [id]
    );
    if (byJob.length) return res.json(byJob[0]);

    return res.status(404).json({ error: 'not_found' });
  } catch (e) {
    console.error('[GET /api/bids/:id/customer-info]', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
