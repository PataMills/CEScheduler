import express from "express";
import db from "../db.js";
const router = express.Router();

// GET /api/options/:key  -> list values for a set (active only)
router.get("/:key", async (req, res) => {
  const { rows: sets } = await db.query(`SELECT id FROM option_sets WHERE key=$1`, [req.params.key]);
  if (!sets.length) return res.json([]);
  const { rows: vals } = await db.query(
    `SELECT id, value_text, value_num, sort_order
     FROM option_values
     WHERE set_id=$1 AND is_active=true
     ORDER BY sort_order, id`, [sets[0].id]
  );
  res.json(vals);
});

// PUT /api/options/:key  -> replace the whole list (admin)
router.put("/:key", async (req, res) => {
  const { label = req.params.key, values = [] } = req.body || {};
  // upsert set
  const { rows: setRows } = await db.query(
    `INSERT INTO option_sets (key, label)
       VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label
     RETURNING id`, [req.params.key, label]
  );
  const setId = setRows[0].id;

  // deactivate old
  await db.query(`UPDATE option_values SET is_active=false WHERE set_id=$1`, [setId]);

  // insert new (reactivate if same text/num pair)
  for (let i=0;i<values.length;i++) {
    const v = values[i];
    await db.query(
      `INSERT INTO option_values (set_id, value_text, value_num, sort_order, is_active)
       VALUES ($1,$2,$3,$4,true)`,
      [setId, v.value_text ?? null, v.value_num ?? null, v.sort_order ?? i+1]
    );
  }
  res.json({ ok: true });
});

// (optional) POST to add one value quickly
router.post("/:key", async (req, res) => {
  const { value_text=null, value_num=null, sort_order=0 } = req.body || {};
  const { rows: sets } = await db.query(`SELECT id FROM option_sets WHERE key=$1`, [req.params.key]);
  if (!sets.length) return res.status(404).json({ error: "set_not_found" });
  const { rows } = await db.query(
    `INSERT INTO option_values (set_id, value_text, value_num, sort_order, is_active)
     VALUES ($1,$2,$3,$4,true)
     RETURNING *`,
    [sets[0].id, value_text, value_num, sort_order]
  );
  res.status(201).json(rows[0]);
});

export default router;
