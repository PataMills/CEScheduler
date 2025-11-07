// routes/autoTasks.js
import express from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// phases in order with default offsets (days) relative to install_date
const DEFAULT_CHAIN = [
  { code: "purchasing",    title: "Purchasing",    offset_days: -20, duration_min: 60 },
  { code: "manufacturing", title: "Manufacturing", offset_days: -10, duration_min: 240 },
  { code: "assembly",      title: "Assembly",      offset_days:  -3, duration_min: 180 },
  { code: "delivery",      title: "Delivery",      offset_days:  -1, duration_min: 90  },
  { code: "install",       title: "Install",       offset_days:   0, duration_min: 480 },
  { code: "service",       title: "Service",       offset_days:   7, duration_min: 60  }
];

function mergeChain(base, overrides) {
  if (!Array.isArray(overrides) || overrides.length === 0) return base;
  const byCode = Object.fromEntries(base.map(s => [s.code, { ...s }]));
  for (const ov of overrides) {
    if (!ov?.code || !byCode[ov.code]) continue;
    if (Number.isFinite(ov.offset_days)) byCode[ov.code].offset_days = ov.offset_days;
    if (Number.isFinite(ov.duration_min)) byCode[ov.code].duration_min = ov.duration_min;
    if (ov.title) byCode[ov.code].title = ov.title;
  }
  return Object.values(byCode);
}

// POST /api/tasks/generate-from-bid/:bidId
// body: { install_date: "YYYY-MM-DD", resource_hints?: {install?: resource_id, ...}, overrides?: [{code, offset_days, duration_min}] }
router.post("/generate-from-bid/:bidId", requireAuth, express.json(), async (req, res) => {
  const bidId = Number(req.params.bidId);
  const { install_date, resource_hints = {}, overrides = [] } = req.body || {};
  if (!bidId || !install_date) {
    return res.status(400).json({ error: "bad_request", hint: "bidId and install_date required" });
  }

  const chain = mergeChain(DEFAULT_CHAIN, overrides);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Resolve or create install_job for this bid defensively (no unique constraint required)
    let jobId = null;
    try {
      const f = await client.query(`SELECT id FROM public.install_jobs WHERE bid_id = $1 LIMIT 1`, [bidId]);
      if (f.rowCount) jobId = Number(f.rows[0].id);
    } catch {}
    if (!jobId) {
      try {
        const ins = await client.query(`INSERT INTO public.install_jobs (bid_id) VALUES ($1) RETURNING id`, [bidId]);
        jobId = Number(ins.rows[0].id);
      } catch {
        const ins2 = await client.query(`INSERT INTO public.install_jobs DEFAULT VALUES RETURNING id`);
        jobId = Number(ins2.rows[0].id);
      }
    }

    const baseStart = `${install_date}T08:00:00-07:00`; // Mountain morning; server stores as timestamptz

    const results = [];
    for (const step of chain) {
      // Upsert per phase/type (avoid duplicates)
      const ex = await client.query(
        `SELECT id FROM public.install_tasks WHERE job_id = $1 AND LOWER(type) = LOWER($2) LIMIT 1`,
        [jobId, step.code]
      );
      let taskId = ex.rows[0]?.id;
      if (!taskId) {
        const insT = await client.query(
          `INSERT INTO public.install_tasks
             (job_id, type, name, duration_min, status, resource_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'scheduled',$5, now(), now())
           RETURNING id` ,
          [jobId, step.code, step.title, step.duration_min, resource_hints?.[step.code] ?? null]
        );
        taskId = insT.rows[0].id;
      }

      // Update dates based on offset
      await client.query(
        `UPDATE public.install_tasks
           SET window_start = (TIMESTAMPTZ $2 + ($3||' days')::interval),
               window_end   = (TIMESTAMPTZ $2 + ($3||' days')::interval) + make_interval(mins => $4),
               duration_min = $4,
               resource_id  = COALESCE($5, resource_id),
               updated_at   = now()
         WHERE id = $1`,
        [taskId, baseStart, step.offset_days, step.duration_min, resource_hints?.[step.code] ?? null]
      );

      const { rows } = await client.query(`SELECT * FROM public.install_tasks WHERE id = $1`, [taskId]);
      results.push(rows[0]);
    }

    await client.query("COMMIT");
    return res.json({ ok: true, job_id: jobId, tasks: results });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[AUTOCHAIN ERR]", e);
    return res.status(500).json({ error: "db_error" });
  } finally {
    client.release();
  }
});

export default router;
