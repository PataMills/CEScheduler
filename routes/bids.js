import { Router } from "express";
import pool from "../db.js";

const router = Router();
const allow = (_req, _res, next) => next(); // TODO: swap to your real auth guard

// Basic columns for a bid
router.get("/api/bids/:id/columns", allow, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, bid_id, label, room, unit_type, color, units, sort_order
         FROM public.bid_columns
        WHERE bid_id = $1
        ORDER BY sort_order, id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error("[/api/bids/:id/columns]", e);
    res.status(500).json({ error: "server_error" });
  }
});

// Columns + Details + Hardware (join on (bid_id, column_id))
router.get("/api/bids/:id/columns-details", allow, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
          bc.id AS column_id,
          bc.bid_id,
          bc.label AS column_label,
          bc.room, bc.unit_type, bc.color, bc.units, bc.sort_order,
          COALESCE(bcd.meta, '{}'::jsonb)     AS meta,
          COALESCE(bcd.hardware, '[]'::jsonb) AS hardware,
          bcd.notes, bcd.updated_at
         FROM public.bid_columns bc
    LEFT JOIN public.bid_column_details bcd
           ON bcd.bid_id   = bc.bid_id
          AND bcd.column_id = bc.id
        WHERE bc.bid_id = $1
        ORDER BY bc.sort_order, bc.id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error("[/api/bids/:id/columns-details]", e);
    res.status(500).json({ error: "server_error" });
  }
});

// Bid-level documents for Review page
router.get("/api/bids/:id/documents", allow, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, bid_id, kind, name, url, uploaded_at
         FROM public.bid_documents
        WHERE bid_id = $1
        ORDER BY uploaded_at DESC, id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error("[/api/bids/:id/documents]", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default function registerBids(app) {
  app.use(router);
}