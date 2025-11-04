import express from "express";
import { pool } from "../db.js";
const router = express.Router();

// ---- Customers: quick search
router.get("/api/customers/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  try {
    const { rows } = await pool.query(
      `
      SELECT id, name, phone, mobile, address_line1, city, state, zip
      FROM public.customers
      WHERE name ILIKE $1 OR phone ILIKE $1 OR mobile ILIKE $1 OR address_line1 ILIKE $1
      ORDER BY name ASC
      LIMIT 20
      `,
      [`%${q}%`]
    );
    res.json({ results: rows });
  } catch (e) {
    console.error("[customers/search]", e.message);
    res.status(500).json({ results: [] });
  }
});

// ---- Customer by id
router.get("/api/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "bad_request" });
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, mobile, address_line1, city, state, zip
       FROM public.customers WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    res.json({ customer: rows[0] });
  } catch (e) {
    console.error("[customers/:id]", e.message);
    res.status(500).json({ error: "db_error" });
  }
});

// ---- Availability check
router.get("/api/availability", async (req, res) => {
  const startIso   = req.query.start;
  const durationMin = Math.max(15, Number(req.query.duration || 60));
  const resourceId  = req.query.resourceId || null;

  if (!startIso) return res.status(400).json({ available: false, message: "Missing start time" });

  const endIso = new Date(new Date(startIso).getTime() + durationMin*60000).toISOString();

  try {
    const params = [startIso, endIso];
    let whereRes = "";
    if (resourceId) { params.push(resourceId); whereRes = "AND t.resource_id = $3"; }

    const { rows } = await pool.query(
      `
      WITH tasks AS (
        SELECT id, resource_id, window_start AS start_at, window_end AS end_at
          FROM public.install_tasks
        UNION ALL
        SELECT id, resource_id, start_at, end_at
          FROM public.service_tasks
      )
      SELECT count(*) AS cnt
      FROM tasks t
      WHERE
        t.start_at < $2::timestamptz
        AND t.end_at   > $1::timestamptz
        ${whereRes}
      `,
      params
    );

    const busy = Number(rows[0]?.cnt || 0) > 0;
    if (!busy) {
      return res.json({ available: true, message: "Available", suggestions: [] });
    }

    const suggestions = [];
    let probe = new Date(endIso).getTime();
    for (let i=0; i<12 && suggestions.length<5; i++) {
      const s = new Date(probe).toISOString();
      const e = new Date(probe + durationMin*60000).toISOString();
      const p = resourceId ? [s,e,resourceId] : [s,e];

      const q = `
        WITH tasks AS (
          SELECT id, resource_id, window_start AS start_at, window_end AS end_at
            FROM public.install_tasks
          UNION ALL
          SELECT id, resource_id, start_at, end_at
            FROM public.service_tasks
        )
        SELECT count(*) AS cnt
        FROM tasks t
        WHERE t.start_at < $2::timestamptz
          AND t.end_at   > $1::timestamptz
          ${resourceId ? "AND t.resource_id = $3" : ""}
      `;
      const r2 = await pool.query(q, p);
      const clash = Number(r2.rows[0]?.cnt || 0) > 0;
      if (!clash) suggestions.push({ start: s, end: e });
      probe += 30*60000;
    }

    res.json({ available: false, message: "Conflict at requested time", suggestions });
  } catch (e) {
    console.error("[availability]", e.message);
    res.status(500).json({ available: false, message: "DB error", suggestions: [] });
  }
});

// ---- Simple calendar blocks (free/busy for a day)
router.get("/api/availability/calendar", async (req, res) => {
  const day = (req.query.day || new Date().toISOString().slice(0,10));
  const resourceId = req.query.resourceId || null;

  try {
    const startDay = `${day}T00:00:00`;
    const endDay   = `${day}T23:59:59`;

    const params = [startDay, endDay];
    let whereRes = "";
    if (resourceId) { params.push(resourceId); whereRes = "AND resource_id = $3"; }

    const { rows } = await pool.query(
      `
      SELECT start_at, end_at FROM (
        SELECT window_start AS start_at, window_end AS end_at, resource_id
        FROM public.install_tasks
        WHERE window_start <= $2::timestamptz AND window_end >= $1::timestamptz
        ${whereRes}
        UNION ALL
        SELECT start_at, end_at, resource_id
        FROM public.service_tasks
        WHERE start_at <= $2::timestamptz AND end_at >= $1::timestamptz
        ${whereRes}
      ) x
      ORDER BY start_at ASC
      `,
      params
    );

    const blocks = rows.map(r => ({ type: "busy", start: r.start_at, end: r.end_at }));
    res.json({ blocks });
  } catch (e) {
    console.error("[availability/calendar]", e.message);
    res.status(500).json({ blocks: [] });
  }
});

// ---- Create service appointment
router.post("/api/service-appointments", express.json(), async (req, res) => {
  const { customer_id, start, duration_min, resource_id, phone, address, notes } = req.body || {};
  if (!customer_id || !start || !duration_min) {
    return res.status(400).json({ error: "bad_request" });
  }
  const end = new Date(new Date(start).getTime() + Number(duration_min)*60000).toISOString();

  try {
    const chk = await pool.query(
      `
      SELECT count(*) AS cnt
      FROM public.service_tasks
      WHERE start_at < $2::timestamptz
        AND end_at   > $1::timestamptz
        ${resource_id ? "AND resource_id = $3" : ""}
      `,
      resource_id ? [start, end, resource_id] : [start, end]
    );
    if (Number(chk.rows[0]?.cnt || 0) > 0) {
      return res.status(409).json({ error: "conflict" });
    }

    const ins = await pool.query(
      `
      INSERT INTO public.service_tasks
        (customer_id, resource_id, start_at, end_at, phone, address, notes, status, created_at, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,'scheduled', now(), now())
      RETURNING id
      `,
      [customer_id, resource_id || null, start, end, phone || null, address || null, notes || null]
    );
    res.json({ id: ins.rows[0].id });
  } catch (e) {
    console.error("[service-appointments]", e.message);
    res.status(500).json({ error: "db_error" });
  }
});

export default router;
