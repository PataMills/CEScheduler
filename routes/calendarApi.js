// routes/calendarApi.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// GET /api/calendar/events?start=...&end=...&crew=Install%20Team%20A
router.get("/events", async (req, res) => {
  const { start, end, crew = "" } = req.query || {};
  if (!start || !end) return res.status(400).json({ error: "missing_range" });

  try {
    const q = await pool.query(
      `
      SELECT t.id, t.type, t.name, t.window_start,
             COALESCE(t.window_end, t.window_start) AS window_end,
             COALESCE(t.status, 'scheduled') AS status,
             a.resource_name
      FROM public.install_tasks t
      LEFT JOIN public.install_task_assignments a ON a.task_id = t.id
      WHERE t.window_start < $1::timestamptz
        AND COALESCE(t.window_end, t.window_start) >= $2::timestamptz
        AND ($3 = '' OR a.resource_name = $3)
      ORDER BY t.window_start ASC
      `,
      [end, start, String(crew || '').trim()]
    );

    const events = q.rows.map(r => ({
      id: String(r.id) + ':' + (r.resource_name || ''),
      title: r.name,
      start: r.window_start,
      end:   r.window_end,
      extendedProps: {
        task_id: r.id,
        task_type: r.type,
        status: r.status,
        resource_name: r.resource_name || ''
      }
    }));

    res.json({ events });
  } catch (e) {
    console.error("[CAL EVENTS ERR]", e);
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});



// PATCH /api/calendar/events/:id   body: { start, end? }
router.patch("/events/:id", express.json(), async (req, res) => {
  const raw = String(req.params.id || "");
  const base = raw.includes(":") ? raw.split(":")[0] : raw;
  const id = Number(base);
  const { start, end } = req.body || {};
  if (!id || !start) return res.status(400).json({ error: "bad_request" });
  try {
    await pool.query(
      `UPDATE public.install_tasks
         SET window_start = $2::timestamptz,
             window_end   = COALESCE($3::timestamptz, $2::timestamptz),
             updated_at   = now()
       WHERE id = $1`,
      [id, start, end || start]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[CAL PATCH ERR]", e.message || e);
    res.status(500).json({ error: "db_error" });
  }
});

export default router;
