// routes/search.js
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "./auth.js"; // API-style guard

const router = express.Router();

// Simple bids search (extend later to customers/builders)
router.get("/", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ ok:true, bids: [] });

  // Try to detect numeric ID search first
  const id = /^\d+$/.test(q) ? Number(q) : null;

  const sql = `
  SELECT id,
         name,               -- we'll show as "Customer / Project"
         builder_id,         -- temporary until we join builders
         total,
         status,
         updated_at,
         customer_email
    FROM bids
   WHERE ($1::int IS NOT NULL AND id = $1)
      OR (name ILIKE '%'||$2||'%')
      OR (status ILIKE '%'||$2||'%')
      OR (customer_email ILIKE '%'||$2||'%')
      OR (CAST(builder_id AS TEXT) ILIKE '%'||$2||'%')
      OR (CAST(total AS TEXT) ILIKE '%'||$2||'%')
   ORDER BY updated_at DESC NULLS LAST, id DESC
   LIMIT 50;
`;

  try {
  const { rows } = await pool.query(sql, [id, q]);
  res.json({ ok:true, bids: rows });
    } catch (e) {
    console.error("dashboard search error:", e.message);
    res.json({ ok:true, bids: [] }); // temporary fallback
    }

});

export default router;
