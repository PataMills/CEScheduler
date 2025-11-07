// routes/resources.js
import express from "express";
import pool from "../db.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, type, capacity_min_per_day
       FROM public.resources
       WHERE active = true
       ORDER BY name`
    );
    res.json(rows);
  } catch (e) {
    console.error("[RESOURCES] ERROR", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
