// routes/lookup.js
import express from "express";
import { pool } from "../db.js";
const router = express.Router();

const clean = s => String(s||"").trim();

router.get("/builder", async (req, res) => {
  const q = clean(req.query.name);
  if (!q) return res.status(400).json({ error: "missing_name" });
  const { rows } = await pool.query(
    `SELECT name, email, phone
       FROM public.builders
      WHERE lower(name) = lower($1) OR name ILIKE $2
      ORDER BY name LIMIT 1`,
    [q, q + "%"]
  );
  res.json(rows[0] || {});
});

router.get("/customer", async (req, res) => {
  const q = clean(req.query.name);
  if (!q) return res.status(400).json({ error: "missing_name" });

  // newest intake job first; fallback to jobs table
  const c1 = await pool.query(
    `SELECT customer_name AS name, contact_email AS email, contact_phone AS phone
       FROM public.intake_jobs
      WHERE customer_name ILIKE $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [q + "%"]
  );
  if (c1.rowCount) return res.json(c1.rows[0]);

  const c2 = await pool.query(
    `SELECT customer_name AS name, NULL::text AS email, NULL::text AS phone
       FROM public.jobs
      WHERE customer_name ILIKE $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [q + "%"]
  );
  res.json(c2.rows[0] || {});
});

export default router;
