import { Router } from "express";
import cookieParser from "cookie-parser";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = Router();
const allow = (_req, _res, next) => next(); // TODO: swap to your real auth guard

router.use(cookieParser());

function requireAdminOrPurchasing(req, res, next) {
  const role = req.user?.role;
  if (role === "admin" || role === "purchasing") return next();
  return res.status(403).json({ error: "forbidden" });
}

// Basic columns for a bid
router.get("/:id/columns", allow, async (req, res) => {
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
router.get("/:id/columns-details", allow, async (req, res) => {
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
router.get("/:id/documents", allow, async (req, res) => {
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

// Manufacturer lead-time management (admin/purchasing)
router.get("/lead-times", requireAuth, requireAdminOrPurchasing, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT manufacturer, base_days, avg_90d_days, notes, updated_at
        FROM public.manufacturer_lead_times
       ORDER BY manufacturer ASC
    `);
    res.json(rows);
  } catch (e) {
    if (e?.code === "42P01") {
      // Table missing; return empty list but surface log.
      console.warn("[lead-times] manufacturer_lead_times table missing");
      return res.json([]);
    }
    console.error("[/api/bids/lead-times:get]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/lead-times", requireAuth, requireAdminOrPurchasing, async (req, res) => {
  try {
    const body = req.body || {};
    const manufacturer = String(body.manufacturer || "").trim();
    if (!manufacturer) {
      return res.status(400).json({ error: "missing_manufacturer" });
    }
    const baseDays = Number.isFinite(Number(body.base_days)) ? Number(body.base_days) : 14;
    if (baseDays <= 0) {
      return res.status(400).json({ error: "invalid_base_days" });
    }
    const avgRaw = body.avg_90d_days;
    const avg90 = avgRaw === "" || avgRaw === null || avgRaw === undefined ? null : Number(avgRaw);
    if (avg90 !== null && !Number.isFinite(avg90)) {
      return res.status(400).json({ error: "invalid_avg_90d" });
    }
    const notes = body.notes ? String(body.notes).trim() : null;

    const { rows } = await pool.query(
      `INSERT INTO public.manufacturer_lead_times (manufacturer, base_days, avg_90d_days, notes, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (manufacturer)
       DO UPDATE SET base_days = EXCLUDED.base_days,
                     avg_90d_days = EXCLUDED.avg_90d_days,
                     notes = EXCLUDED.notes,
                     updated_at = now()
       RETURNING manufacturer, base_days, avg_90d_days, notes, updated_at`,
      [manufacturer, baseDays, avg90, notes]
    );
    res.status(200).json(rows[0]);
  } catch (e) {
    if (e?.code === "42P01") {
      console.warn("[/api/bids/lead-times:post] manufacturer_lead_times table missing");
      return res.status(500).json({ error: "table_missing" });
    }
    console.error("[/api/bids/lead-times:post]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/lead-times/:manufacturer", requireAuth, requireAdminOrPurchasing, async (req, res) => {
  try {
    const manufacturer = String(req.params.manufacturer || "").trim();
    if (!manufacturer) return res.status(400).json({ error: "missing_manufacturer" });
    const result = await pool.query(
      `DELETE FROM public.manufacturer_lead_times WHERE manufacturer ILIKE $1`,
      [manufacturer]
    );
    res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    if (e?.code === "42P01") {
      console.warn("[/api/bids/lead-times:delete] manufacturer_lead_times table missing");
      return res.json({ ok: true, deleted: 0 });
    }
    console.error("[/api/bids/lead-times:delete]", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;