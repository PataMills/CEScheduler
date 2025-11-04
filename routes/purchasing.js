// routes/purchasing.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// GET /api/purchasing?status=pending|ordered|received (default: all)
router.get("/", async (req, res) => {
  const status = (req.query.status || "").trim();
  const params = [];
  let where = "";
  if (status) { where = "WHERE status = $1"; params.push(status); }

  const sql = `
    SELECT id, job_id, item_name, spec, needed_by, vendor, status, created_at
    FROM public.purchase_queue
    ${where}
    ORDER BY COALESCE(needed_by, DATE '2099-12-31'), id
  `;
  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

// POST /api/purchasing  (quick add, mock-friendly)
router.post("/", async (req, res) => {
  const { job_id = null, item_name, spec = {}, needed_by = null, vendor = null } = req.body || {};
  if (!item_name) return res.status(400).json({ error: "item_name_required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.purchase_queue (job_id, item_name, spec, needed_by, vendor, status, created_at)
       VALUES ($1,$2,$3,$4,$5,'pending', now())
       RETURNING *`,
      [job_id, item_name, spec, needed_by, vendor]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "insert_failed", detail: e.message });
  }
});

// PATCH /api/purchasing/:id/status  { status: 'pending'|'ordered'|'received' }
router.patch("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = new Set(["pending", "ordered", "received"]);
  if (!allowed.has((status || "").toLowerCase())) {
    return res.status(400).json({ error: "bad_status" });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE public.purchase_queue SET status = $1, created_at = created_at
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "update_failed", detail: e.message });
  }
});

export default router;
