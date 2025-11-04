// routes/material.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

/** Update a single purchase_queue item (buyer actions) */
router.patch("/purchasing/item/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    status, vendor, order_no, po_group, brand,
    qty_required, qty_ordered, qty_received, unit, expected_date
  } = req.body || {};

  const q = `
    UPDATE public.purchase_queue SET
      status        = COALESCE($2, status),
      vendor        = COALESCE($3, vendor),
      order_no      = COALESCE($4, order_no),
      po_group      = COALESCE($5, po_group),
      brand         = COALESCE($6, brand),
      qty_required  = COALESCE($7, qty_required),
      qty_ordered   = COALESCE($8, qty_ordered),
      qty_received  = COALESCE($9, qty_received),
      unit          = COALESCE($10, unit),
      expected_date = COALESCE($11, expected_date),
      created_at    = created_at
    WHERE id = $1
    RETURNING *`;
  try {
    const { rows } = await pool.query(q, [
      id, status ?? null, vendor ?? null, order_no ?? null, po_group ?? null, brand ?? null,
      qty_required ?? null, qty_ordered ?? null, qty_received ?? null, unit ?? null, expected_date ?? null
    ]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (e) {
    console.error("[PQ PATCH]", e);
    res.status(500).json({ error: "update_failed" });
  }
});

/** Receive helper: increments qty_received and flips status when complete */
router.post("/purchasing/item/:id/receive", async (req, res) => {
  const id = Number(req.params.id);
  const addQty = Number(req.body?.qty || 0);
  const note   = String(req.body?.note || "");
  if (!addQty || addQty < 0) return res.status(400).json({ error: "bad_qty" });

  try {
    const { rows: cur } = await pool.query(
      `SELECT qty_required, COALESCE(qty_received,0) AS rec FROM public.purchase_queue WHERE id=$1`, [id]);
    if (!cur.length) return res.status(404).json({ error: "not_found" });

    const reqd = Number(cur[0].qty_required || 0);
    const newRec = Number(cur[0].rec) + addQty;
    const newStatus = (reqd && newRec >= reqd) ? 'received' : 'partial_received';

    const { rows } = await pool.query(
      `UPDATE public.purchase_queue
         SET qty_received=$2, status=$3
       WHERE id=$1
       RETURNING *`,
      [id, newRec, newStatus]
    );

    // Optional: notify Slack / n8n when received
    try {
      const hook = process.env.N8N_OPS_STATUS_WEBHOOK;
      if (hook) {
        await fetch(hook, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ event:'purchasing_received', item_id:id, qty:addQty, note })
        });
      }
    } catch {}

    res.json(rows[0]);
  } catch (e) {
    console.error("[PQ RECEIVE]", e);
    res.status(500).json({ error: "receive_failed" });
  }
});

/** Job readiness for scheduler & sales */
router.get("/jobs/:jobId/material-ready", async (req, res) => {
  const jobId = Number(req.params.jobId);
  try {
    const { rows } = await pool.query(
      `SELECT job_id, customer_name, req, rec, material_ready
         FROM public.job_material_readiness
        WHERE job_id = $1`,
      [jobId]
    );
    res.json(rows[0] || { job_id: jobId, material_ready: false, req: 0, rec: 0 });
  } catch (e) {
    console.error("[READY]", e);
    res.status(500).json({ error: "ready_failed" });
  }
});

export default router;
