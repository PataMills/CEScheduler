// routes/search.js
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "./auth.js"; // API-style guard

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.json([]);

    const { rows } = await pool.query(
      `SELECT id, customer_name, project_name, external_ref
         FROM jobs
        WHERE customer_name ILIKE $1
           OR project_name ILIKE $1
           OR external_ref  ILIKE $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [`%${q}%`]
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.project_name || r.customer_name || r.external_ref,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
