// routes/myday.js
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Auth-required and lightly scoped by role/team
router.get("/", requireAuth, async (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD
    let { crew } = req.query;    // crew name (optional)
    if (!date) return res.status(400).json({ error: "missing_date" });

    const role = String(req.user?.role || "").toLowerCase();
    const myCrew = (req.user?.crew_name || "").trim();
    // For field roles, default to their assigned crew; else allow explicit crew or show all
    const isFieldRole = ["service","installer","delivery","manufacturing","assembly"].includes(role);
    const crewName = isFieldRole
      ? (myCrew || (crew && String(crew).trim()) || "Install Team A")
      : (crew && String(crew).trim());

    let rows;
    if (crewName) {
      const q = await pool.query(
        `
        SELECT *
        FROM public.install_tasks_for_day v
        WHERE DATE(v.window_start AT TIME ZONE 'America/Denver') = $1
          AND v.resource_name = $2
        ORDER BY v.window_start ASC
        `,
        [date, crewName]
      );
      rows = q.rows;
    } else {
      // broader view: admins/ops etc.
      const q = await pool.query(
        `
        SELECT *
        FROM public.install_tasks_for_day v
        WHERE DATE(v.window_start AT TIME ZONE 'America/Denver') = $1
        ORDER BY v.window_start ASC
        LIMIT 500
        `,
        [date]
      );
      rows = q.rows;
    }

    res.json(rows); // <— clean array
  } catch (e) {
    console.error("MYDAY ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
