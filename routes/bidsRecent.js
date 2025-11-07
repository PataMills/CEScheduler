// routes/bidsRecent.js
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

router.get("/recent", requireAuth, async (_req, res) => {
  const sql = `
  SELECT id, name, builder_id, total, status, updated_at
    FROM bids
   ORDER BY updated_at DESC NULLS LAST, id DESC
   LIMIT 10;
`;

  try {
    const { rows } = await pool.query(sql);
    res.json({ ok: true, bids: rows });
  } catch (e) {
    console.error("dashboard recent error:", e.message);
    res.json({ ok: true, bids: [] }); // temporary fallback
  }
});

export default router;
