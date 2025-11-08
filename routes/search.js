// routes/search.js
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "./auth.js"; // API-style guard

const router = express.Router();

// Simple bids search (extend later to customers/builders)
router.get("/", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ ok:true, bids: [] });

  try {
    const { rows } = await pool.query(
      `SELECT id, customer_name, project_name, external_ref
         FROM jobs
        WHERE (customer_name ILIKE $1
           OR  project_name ILIKE $1
           OR  external_ref ILIKE $1)
        ORDER BY created_at DESC
        LIMIT 50`,
      [`%${q}%`]
    );
    const mapped = rows.map((r) => ({
      ...r,
      name: r.project_name || r.customer_name || r.external_ref || "",
    }));
    res.json({ ok: true, bids: mapped });
  } catch (e) {
    console.error("dashboard search error:", e.message);
    res.json({ ok: true, bids: [] }); // temporary fallback
  }

});

export default router;
