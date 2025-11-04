import express from "express";
import db from "../db.js";
const router = express.Router();

// This router treats the RESOURCES table (type='crew') as source of truth
// Fields we expose: id, name, team, capacity_min_per_day, timezone, active

// GET /api/crews -> list crews from resources
router.get("/", async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, team, capacity_min_per_day, timezone, active
       FROM resources
       WHERE type = 'crew'
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (e) {
    console.error('crews.list error', e);
    res.status(500).json({ error: "Failed to fetch crews" });
  }
});

// PUT /api/crews -> upsert crews and soft-disable removed ones
router.put("/", async (req, res) => {
  const crews = req.body.crews;
  if (!Array.isArray(crews)) return res.status(400).json({ error: "Invalid crews array" });
  try {
    // Normalize inputs
    const ids = [];
    for (const c of crews) {
      const name = (c.name||'').trim();
      if (!name) continue; // skip empties
      const team = (c.team||null);
      const cap = Number.isFinite(Number(c.capacity_min_per_day)) ? Number(c.capacity_min_per_day) : null;
      const tz = c.timezone || 'America/Denver';
      const active = (c.active !== false); // default true

      if (c.id) {
        const { rows } = await db.query(
          `UPDATE resources
             SET name=$2, team=$3, capacity_min_per_day=$4, timezone=$5, active=$6, updated_at=now()
           WHERE id=$1 AND type='crew'
           RETURNING id`,
          [c.id, name, team, cap, tz, active]
        );
        if (rows[0]?.id) ids.push(rows[0].id);
      } else {
        const { rows } = await db.query(
          `INSERT INTO resources (type, name, team, capacity_min_per_day, timezone, active, created_at, updated_at)
           VALUES ('crew', $1, $2, $3, $4, $5, now(), now())
           RETURNING id`,
          [name, team, cap, tz, active]
        );
        if (rows[0]?.id) ids.push(rows[0].id);
      }
    }

    // Soft-disable any crew not present in payload
    await db.query(
      `UPDATE resources SET active=false, updated_at=now()
         WHERE type='crew' AND ($1::int[] IS NULL OR NOT (id = ANY($1)))`,
      [ids.length ? ids : null]
    );
    res.json({ ok: true, ids });
  } catch (e) {
    console.error('crews.save error', e);
    res.status(500).json({ error: "Failed to save crews" });
  }
});

export default router;
