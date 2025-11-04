import express from "express";
import { pool } from "../db.js";
import path from "path";
import fs from "fs";
import { saveDataUrlToFile } from "../app.js";

const router = express.Router();

// --- GET /api/bids/:bid/history ---
router.get("/bids/:bid/history", async (req, res) => {
  const bidId = Number(req.params.bid);
  if (!bidId) return res.status(400).json({ error: "bad_bid" });
  try {
    const { rows } = await pool.query(
      `SELECT id, event_type AS type, payload, actor, created_at
         FROM public.job_events
        WHERE bid_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [bidId]
    );
    // normalize shape
    const events = rows.map(r => ({
      id: r.id,
      type: r.type,
      note: (r.payload && r.payload.note) || "",
      photos: (r.payload && r.payload.photos) || [],
      by: r.actor || "",
      created_at: r.created_at
    }));
    res.json({ events });
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

// --- GET /api/tasks/:taskId/history -> events for a specific task -------------
// router.get("/:taskId/history", async (req, res) => {
//   const taskId = Number(req.params.taskId);
//   if (!taskId) return res.status(400).json({ error: "bad_task_id" });
//   try {
//     const { rows } = await pool.query(
//       `SELECT id, event_type AS type, payload, actor, created_at
//          FROM public.job_events
//         WHERE task_id = $1
//         ORDER BY created_at DESC
//         LIMIT 200`,
//       [taskId]
//     );
//     // normalize shape
//     const events = rows.map(r => ({
//       id: r.id,
//       type: r.type,
//       note: (r.payload && r.payload.note) || "",
//       photos: (r.payload && r.payload.photos) || [],
//       by: r.actor || "",
//       created_at: r.created_at
//     }));
//     res.json({ events });
//   } catch (e) {
//     res.status(500).json({ error: "db_error", detail: e.message });
//   }
// });

// --- GET /api/tasks/by-job/:id  -> tasks for one job (with deps) -------------
router.get("/by-job/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "bad_job_id" });
  try {
    const q = await pool.query(`
      SELECT id, job_id, type, name, window_start, window_end,
             duration_min, phase_group, depends_on
      FROM public.install_tasks
      WHERE job_id = $1
      ORDER BY window_start NULLS LAST, id
    `, [id]);
    res.json(q.rows);
  } catch (e) {
    console.error("[BY-JOB ERR]", e);
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

// POST /api/tasks/auto-schedule
// Body: { job_id?: number|string, bid_id?: number|string, install_date: 'YYYY-MM-DD' or ISO }
router.post("/auto-schedule", express.json(), async (req, res) => {
  let { job_id, bid_id, install_date } = req.body || {};
  const hasJob = job_id != null && String(job_id).trim() !== "";
  const hasBid = bid_id != null && String(bid_id).trim() !== "";
  if (!install_date || (!hasJob && !hasBid)) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const PLAN = [
    { type: "install",       label: "Install",        phase_group: "INS", offset: 0  },
    { type: "delivery",      label: "Delivery",       phase_group: "DLV", offset: 1  },
    { type: "assembly",      label: "Assembly",       phase_group: "ASM", offset: 5  },
    { type: "manufacturing", label: "Manufacturing",  phase_group: "MFG", offset: 11 },
    { type: "purchasing",    label: "Purchasing",     phase_group: "PUR", offset: 24 }
  ];

  const install = new Date(install_date);
  const daysBack = (n) => new Date(install.getTime() - n * 86400000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Resolve install_job id
    let jobId = hasJob ? Number(job_id) : null;

    if (!jobId && hasBid) {
      const bidId = Number(bid_id);
      // ensure the bid exists (optional; no-op if you don’t keep bids)
      await client.query(`SELECT 1 FROM public.bids WHERE id = $1`, [bidId]).catch(()=>{});
      // try find an existing install_job for this bid
      const f = await client.query(`SELECT id FROM public.install_jobs WHERE bid_id = $1 LIMIT 1`, [bidId]).catch(()=>({rows:[]}));
      if (f.rows && f.rows[0]) {
        jobId = Number(f.rows[0].id);
      } else {
        // create a new install_job (with bid link if that column exists)
        try {
          const ins = await client.query(
            `INSERT INTO public.install_jobs (bid_id) VALUES ($1) RETURNING id`,
            [bidId]
          );
          jobId = Number(ins.rows[0].id);
        } catch {
          // if bid_id column doesn’t exist, insert without it
          const ins2 = await client.query(`INSERT INTO public.install_jobs DEFAULT VALUES RETURNING id`);
          jobId = Number(ins2.rows[0].id);
        }
      }
    }

    if (!jobId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "install_job_not_found" });
    }

    // Upsert/Date each phase task for this install_job
    for (const p of PLAN) {
      // ensure task exists
      const ex = await client.query(
        `SELECT id FROM public.install_tasks WHERE job_id = $1 AND LOWER(type) = LOWER($2) LIMIT 1`,
        [jobId, p.type]
      );
      let taskId = ex.rows[0]?.id;
      if (!taskId) {
        const insT = await client.query(
          `INSERT INTO public.install_tasks
             (job_id, type, name, duration_min, notes, checklist, phase_group, created_at, updated_at)
           VALUES ($1,$2,$3,0,'','[]'::jsonb,$4,now(),now())
           RETURNING id`,
          [jobId, p.type, `${p.label} — Job #${jobId}`, p.phase_group]
        );
        taskId = insT.rows[0].id;
      }

      // dates from install
      const start = daysBack(p.offset);
      const end   = new Date(start.getTime() + 8*3600000);
      await client.query(
        `UPDATE public.install_tasks
            SET window_start = $2::timestamptz,
                window_end   = $3::timestamptz,
                updated_at   = now()
          WHERE id = $1`,
        [taskId, start.toISOString(), end.toISOString()]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, job_id: jobId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[AUTO-SCHEDULE ERR]", e);
    res.status(500).json({ error: "db_error", detail: e.message });
  } finally {
    client.release();
  }
});



// --- helpers (put once at top of file if you like)
async function _insertJobEvent(client, taskId, kind, note, whenISO) {
  try {
    await client.query(
      `INSERT INTO public.job_events (task_id, event_type, note, created_at)
       VALUES ($1,$2,$3, $4::timestamptz)`,
      [taskId, kind, note || '', whenISO || new Date().toISOString()]
    );
  } catch (_) { /* table may not exist yet; ignore */ }
}

const OPS_WEBHOOK = process.env.N8N_OPS_STATUS_WEBHOOK;
// --- POST /api/tasks/:id/wip  (use if they’ll return tomorrow)
router.post("/:id/wip", express.json(), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "bad_task_id" });
  const { note, when } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE public.install_tasks SET status='in_progress', updated_at=now() WHERE id=$1`, [id]);
    await _insertJobEvent(client, id, 'wip', note, when);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "db_error", detail: e.message });
  } finally { client.release(); }
});

async function notifyOps(payload) {
  if (!OPS_WEBHOOK) return;
  try {
    await fetch(OPS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('N8N webhook failed:', err.message);
  }
}

// Fetch extra job metadata (customer name). Adjust table/column if needed.
async function getJobMeta(client, jobId) {
  // Try install_jobs first
  try {
    const r1 = await client.query(
      'SELECT customer_name FROM public.install_jobs WHERE id = $1 LIMIT 1',
      [jobId]
    );
    if (r1.rowCount) return { customer_name: r1.rows[0].customer_name };
  } catch (_) {}

  // Fallback: jobs table (if you have one)
  try {
    const r2 = await client.query(
      'SELECT customer_name FROM public.jobs WHERE id = $1 LIMIT 1',
      [jobId]
    );
    if (r2.rowCount) return { customer_name: r2.rows[0].customer_name };
  } catch (_) {}

  return {}; // graceful fallback
}

async function writeEventAndStatus(taskId, newStatus, eventType, payload, createdBy = "api") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Resolve job_id from install_tasks and bid_id from bids table
    const { rows } = await client.query(`
      SELECT
        t.job_id,
        b.id AS bid_id,
        COALESCE(r.name, 'system') AS actor
      FROM public.install_tasks t
      LEFT JOIN public.bids b ON b.job_id::text = t.job_id
      LEFT JOIN public.resources r ON r.id = t.resource_id
      WHERE t.id = $1
      LIMIT 1
    `, [taskId]);

    if (!rows.length) throw new Error("task_not_found");

    const jobId = rows[0].job_id;                 // text
    const bidId = rows[0].bid_id || null;         // int or null
    const actor = rows[0].actor || "system";

    // Optional: use your existing helper; safe if it only needs job_id
    let meta = {};
    try { meta = await getJobMeta(client, jobId); } catch { /* ignore */ }

    // 2) Update task status (always cast ids)
    if (newStatus) {
      await client.query(
        `UPDATE public.install_tasks
            SET status = $1, updated_at = now()
          WHERE id = $2`,
        [newStatus, taskId]
      );
    }

    // 3) Insert job_event (bid_id can be NULL; that's OK)
    const { rows: erows } = await client.query(
      `INSERT INTO public.job_events
         (task_id, job_id, bid_id, event_type, payload, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       RETURNING id, created_at`,
      [taskId, jobId, bidId, eventType, JSON.stringify(payload || {}), actor]
    );

    await client.query("COMMIT");

    // helpful one-line trace (remove later)
    console.log("[EVENT RESOLVE]", { taskId, jobId, bidId, eventType, by: actor });

    return {
      ok: true,
      task_id: taskId,
      job_id: jobId,
      bid_id: bidId,
      status: newStatus,
      event: eventType,
      event_id: erows[0].id,
      event_created_at: erows[0].created_at,
      customer_name: meta?.customer_name
    };
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[WRITE EVENT ERR]", e);
    throw e;
  } finally {
    client.release();
  }
}


router.post("/:id/arrived", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // 1. Write to DB and job_events table
    const out = await writeEventAndStatus(
      id,
      "in_progress",   // new status
      "arrived",       // event type
      req.body,
      "tech"
    );

    // 2. Forward to N8N → Slack
    await notifyOps({
      event: "arrived",
      task_id: id,
      job_id: out?.job_id,
      customer_name: out?.customer_name, // add later if you fetch this
      status: "in_progress",
      created_by: "tech",
      payload: {
        note: req.body?.note || "Arrived (tap)",
        when: req.body?.when || new Date().toISOString(),
        photos: [] // nothing attached for arrived
      }
    });

    console.log("[ARRIVED OK]", out);
    res.json(out);
  } catch (e) {
    console.error("[ARRIVED] ERROR", e);
    res.status(500).json({ error: e.message });
  }
});

// --- POST /api/tasks/:id/ontheway  (aka en_route)
router.post("/:id/ontheway", express.json(), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "bad_task_id" });
  const { note, when } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE public.install_tasks SET status='en_route', updated_at=now() WHERE id=$1`, [id]);
    await _insertJobEvent(client, id, 'on_the_way', note, when);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "db_error", detail: e.message });
  } finally { client.release(); }
});


router.post("/:id/complete", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Guard: keep at most 15 photos in payload
    const photos = Array.isArray(req.body?.photos) ? req.body.photos.slice(0, 15) : [];
    const note = req.body?.note || '';
    const when = req.body?.when || new Date().toISOString();

    // Save photos to disk and collect file info
    const photoFiles = [];
    if (photos.length) {
      const destDir = path.join(process.cwd(), 'uploads', 'tasks', String(id));
      let idx = 1;
      for (const dataUrl of photos) {
        try {
          const baseName = `complete_${when.replace(/[:.\-]/g, '').slice(0,15)}_${idx}`;
          const file = saveDataUrlToFile(dataUrl, destDir, baseName);
          if (file && file.rel && file.fileName) {
            photoFiles.push({ path: file.rel.replace(/\\/g, '/'), name: file.fileName });
          }
        } catch (e) { /* skip failed photo */ }
        idx++;
      }
    }

    // Build payload for event
    const payload = { note, when, photos: photoFiles };
    const out = await writeEventAndStatus(id, "complete", "complete", payload, "tech");
    console.log("[COMPLETE OK]", out);

    // ---- Forward to n8n for Slack #ops-status
    try {
      const webhook = process.env.N8N_OPS_STATUS_WEBHOOK;
      if (webhook) {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "complete",
            task_id: out.task_id,
            job_id: out.job_id,
            customer_name: out.customer_name,
            status: out.status,
            created_by: "tech",
            payload,
            at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }
    } catch (_) {}

    res.json(out);
  } catch (e) {
    console.error("[COMPLETE] ERROR", e);
    res.status(500).json({ error: e.message });
  }
});


// PATCH /api/tasks/:id/assign { resource_id }
router.patch("/:id/assign", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { resource_id } = req.body || {};
  if (!resource_id) return res.status(400).json({ error: "missing_resource_id" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // get current assignment + job
    const { rows: trows } = await client.query(
      "SELECT job_id, resource_id FROM public.install_tasks WHERE id = $1 FOR UPDATE",
      [id]
    );
    if (trows.length === 0) throw new Error("task_not_found");
    const jobId = trows[0].job_id;
    const fromId = trows[0].resource_id;

    // change assignment
    await client.query(
      "UPDATE public.install_tasks SET resource_id = $1, updated_at = now() WHERE id = $2",
      [resource_id, id]
    );

    // log event
    await client.query(
        `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
         VALUES ($1, $2, 'reassigned', $3::jsonb, $4)`,
        [id, jobId, JSON.stringify({ from: fromId, to: resource_id }), "ops"]
    );

    await client.query("COMMIT");
    res.json({ ok: true, task_id: id, job_id: jobId, from: fromId, to: resource_id });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[ASSIGN] ERROR", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id/status  body: { status: 'scheduled' | 'in_progress' | 'complete' | 'hold' | 'canceled' }
router.patch("/:id/status", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};

  try {
    const allowed = new Set(["scheduled", "in_progress", "complete", "hold", "canceled"]);
    if (!allowed.has(status)) return res.status(400).json({ error: "bad_status" });
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad_id" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1) Update the task status (cast to text so PG knows the type)
      const upd = await client.query(
        `UPDATE public.install_tasks
           SET status = $1::text, updated_at = now()
         WHERE id = $2
         RETURNING job_id`,
        [status, id]
      );
      if (upd.rowCount === 0) throw new Error("task_not_found");
      const jobId = upd.rows[0].job_id;

      // 2) Log an event (use jsonb_build_object and cast the param)
      await client.query(
        `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
         VALUES ($1, $2, 'reassigned', jsonb_build_object('status_set', $3::text), 'ops')`,
        [id, jobId, status]
      );

      await client.query("COMMIT");
      res.json({ ok: true, task_id: id, job_id: jobId, status });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[STATUS] ERROR", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reschedule body: { task_id, new_date }
// Reschedules a task and adjusts critical path dependencies
router.post("/reschedule", async (req, res) => {
  const { task_id, new_date } = req.body || {};
  
  try {
    if (!task_id || !new_date) {
      return res.status(400).json({ error: "task_id and new_date required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get the task and its current scheduling info
      const taskRes = await client.query(
        `SELECT id, job_id, window_start, window_end, duration_min, depends_on, phase_group
         FROM public.install_tasks WHERE id = $1`,
        [task_id]
      );
      
      if (taskRes.rowCount === 0) {
        throw new Error("Task not found");
      }

      const task = taskRes.rows[0];
      const oldStart = task.window_start;
      const durationMs = (task.duration_min || 60) * 60 * 1000;
      
      // Calculate new window based on new date
      const newStart = new Date(new_date + 'T00:00:00');
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Update the task
      await client.query(
        `UPDATE public.install_tasks
         SET window_start = $1, window_end = $2, updated_at = now()
         WHERE id = $3`,
        [newStart.toISOString(), newEnd.toISOString(), task_id]
      );

      // Find all dependent tasks (tasks that depend on this one)
      const depsRes = await client.query(
        `SELECT id, window_start, window_end, duration_min, depends_on
         FROM public.install_tasks
         WHERE job_id = $1 AND $2 = ANY(depends_on)
         ORDER BY window_start`,
        [task.job_id, task_id]
      );

      let adjusted_count = 0;

      // Adjust dependent tasks if this task was moved later
      if (newStart > new Date(oldStart)) {
        const timeDiff = newStart.getTime() - new Date(oldStart).getTime();
        
        for (const dep of depsRes.rows) {
          const depStart = new Date(dep.window_start);
          const depEnd = new Date(dep.window_end);
          const newDepStart = new Date(depStart.getTime() + timeDiff);
          const newDepEnd = new Date(depEnd.getTime() + timeDiff);

          await client.query(
            `UPDATE public.install_tasks
             SET window_start = $1, window_end = $2, updated_at = now()
             WHERE id = $3`,
            [newDepStart.toISOString(), newDepEnd.toISOString(), dep.id]
          );
          adjusted_count++;
        }
      }

      // Log the reschedule event
      await client.query(
        `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
         VALUES ($1, $2, 'rescheduled', jsonb_build_object(
           'old_date', $3::text,
           'new_date', $4::text,
           'adjusted_tasks', $5
         ), 'ops')`,
        [task_id, task.job_id, oldStart, newStart.toISOString(), adjusted_count]
      );

      await client.query("COMMIT");
      
      res.json({ 
        ok: true, 
        task_id, 
        new_start: newStart.toISOString(),
        new_end: newEnd.toISOString(),
        critical_path_adjusted: adjusted_count > 0,
        adjusted_tasks: adjusted_count
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[RESCHEDULE] ERROR", e);
    res.status(500).json({ error: e.message });
  }
});

// --- UPDATE TASK (edit core, phases, and team set) ---------------------------
router.patch("/:id", express.json(), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "bad_task_id" });

  const {
    type, name, job_id,
    window_start, window_end, duration_min,
    notes, checklist,
    phase_group, depends_on,
    resource_ids, resource_names
  } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sets = [];
    const vals = [];
    let i = 1;

    if (type != null)        { sets.push(`type = $${i++}`); vals.push(String(type).toLowerCase()); }
    if (name != null)        { sets.push(`name = $${i++}`); vals.push(name); }
    if (job_id !== undefined){ sets.push(`job_id = $${i++}`); vals.push(job_id || null); }
    if (window_start)        { sets.push(`window_start = $${i++}::timestamptz`); vals.push(window_start); }
    if (window_end)          { sets.push(`window_end   = $${i++}::timestamptz`); vals.push(window_end); }
    if (duration_min != null){ sets.push(`duration_min = $${i++}`); vals.push(Number(duration_min)||0); }
    if (notes != null)       { sets.push(`notes = $${i++}`); vals.push(notes); }
    if (checklist != null)   { sets.push(`checklist = $${i++}::jsonb`); vals.push(JSON.stringify(checklist)); }
    if (phase_group != null) { sets.push(`phase_group = $${i++}`); vals.push(phase_group); }
    if (depends_on != null)  { sets.push(`depends_on  = $${i++}`); vals.push(Array.isArray(depends_on)?depends_on:null); }

    if (sets.length) {
      sets.push(`updated_at = now()`);
      await client.query(`UPDATE public.install_tasks SET ${sets.join(", ")} WHERE id = $${i}`, [...vals, id]);
    }

    // Replace team set if provided
    const hasTeamSet =
      (Array.isArray(resource_ids) && resource_ids.length) ||
      (Array.isArray(resource_names) && resource_names.length);

    if (hasTeamSet) {
      await client.query(`DELETE FROM public.install_task_assignments WHERE task_id = $1`, [id]);

      const ids = Array.isArray(resource_ids) ? resource_ids.map(Number).filter(Boolean) : [];
      if (ids.length) {
        const q = await client.query(`SELECT id, name FROM public.resources WHERE id = ANY($1::int[])`, [ids]);
        const byId = new Map(q.rows.map(r => [Number(r.id), r.name]));
        for (const rid of ids) {
          const rname = byId.get(rid);
          if (rname) {
            await client.query(
              `INSERT INTO public.install_task_assignments (task_id, resource_id, resource_name)
               VALUES ($1,$2,$3)
               ON CONFLICT (task_id, COALESCE(resource_id, -1), resource_name) DO NOTHING`,
              [id, rid, rname]
            );
          }
        }
      } else {
        for (const nm of (resource_names||[])) {
          await client.query(
            `INSERT INTO public.install_task_assignments (task_id, resource_name)
             VALUES ($1,$2)
             ON CONFLICT (task_id, COALESCE(resource_id, -1), resource_name) DO NOTHING`,
            [id, String(nm)]
          );
        }
      }
    }

    await client.query("COMMIT");
    res.json({ ok:true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[TASK UPDATE]", e);
    res.status(500).json({ error:"db_error", detail:e.message });
  } finally {
    client.release();
  }
});

// --- POST /api/tasks/seed-phases  -------------------------------------------
// body: { job_id: number, map?: { manufacturing?:ids[], assembly?:ids[], delivery?:ids[], install?:ids[], service?:ids[] } }
router.post("/seed-phases", express.json(), async (req, res) => {
  const { job_id, map = {} } = req.body || {};
  if (!job_id) return res.status(400).json({ error: "missing_job_id" });

  const PHASES = [
    { type: 'manufacturing', name: 'Manufacturing', phase_group: 'MFG', deps: null },
    { type: 'assembly',      name: 'Assembly',      phase_group: 'ASM', deps: null },
    { type: 'delivery',      name: 'Delivery',      phase_group: 'DLV', deps: null },
    { type: 'install',       name: 'Install',       phase_group: 'INS', deps: null },
    { type: 'service',       name: 'Service',       phase_group: 'SRV', deps: null }
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];

    // 1) create rows unscheduled (only job_id/type/name/phases)
    for (const p of PHASES) {
      const ins = await client.query(
        `INSERT INTO public.install_tasks
           (type, name, job_id, duration_min, notes, checklist, phase_group, depends_on, created_at, updated_at)
         VALUES ($1,$2,$3,0,'', '[]'::jsonb, $4, $5, now(), now())
         RETURNING id`,
        [p.type, `${p.name} — Job #${job_id}`, job_id, p.phase_group, p.deps]
      );
      created.push({ phase: p.type, id: ins.rows[0].id });
    }

    // 2) add simple dependencies (chain in order)
    for (let i=1;i<created.length;i++){
      const prev = created[i-1].id;
      const cur  = created[i].id;
      await client.query(
        `UPDATE public.install_tasks SET depends_on = $2 WHERE id = $1`,
        [cur, [prev]]
      );
    }

    // 3) team assignment per phase (optional)
    for (const row of created){
      const ids = Array.isArray(map[row.phase]) ? map[row.phase].map(Number).filter(Boolean) : [];
      if (!ids.length) continue;
      const q = await client.query(`SELECT id, name FROM public.resources WHERE id = ANY($1::int[])`, [ids]);
      for (const r of q.rows){
        await client.query(
          `INSERT INTO public.install_task_assignments (task_id, resource_id, resource_name)
           VALUES ($1,$2,$3)
           ON CONFLICT (task_id, COALESCE(resource_id, -1), resource_name) DO NOTHING`,
          [row.id, r.id, r.name]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok:true, created }); // [{phase,id}]
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[SEED PHASES]', e);
    res.status(500).json({ error:'db_error', detail:e.message });
  } finally {
    client.release();
  }
});


// --- CREATE TASK (supports multiple teams) -----------------------------------
router.post("/", express.json(), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      type,            // "install" | "service" | "manufacturing" | ...
      name,            // task title
      job_id,          // bid_id
      resource_id,     // single (legacy)
      resource_ids,    // array (new, preferred)
      resource_names,  // array of names (optional)
      window_start,    // ISO (optional for unscheduled tasks)
      duration_min = 0,
      notes = "",
      checklist = [],
      phase_group = null,
      depends_on = null
    } = req.body || {};

    if (!type || !name) return res.status(400).json({ error: "missing_fields" });

    let startISO = window_start || null;
    let endISO = null;
    if (startISO && duration_min) {
      const start = new Date(startISO);
      const end = new Date(start.getTime() + Number(duration_min) * 60000);
      endISO = end.toISOString();
      startISO = start.toISOString();
    }

    await client.query("BEGIN");

    const ins = await client.query(
      `
      INSERT INTO public.install_tasks
        (type, name, job_id, window_start, window_end, duration_min,
         notes, checklist, phase_group, depends_on, created_at, updated_at)
      VALUES
        ($1,   $2,   $3,     $4::timestamptz, $5::timestamptz, $6,
         $7,   $8::jsonb,   $9,         $10,        now(),     now())
      RETURNING id
      `,
      [
        String(type).toLowerCase(),
        name,
        job_id || null,
        startISO,
        endISO,
        Number(duration_min)||0,
        notes,
        JSON.stringify(Array.isArray(checklist)?checklist:[]),
        phase_group,
        Array.isArray(depends_on)? depends_on : null
      ]
    );
    const taskId = ins.rows[0].id;

    // teams
    const teamIds = Array.isArray(resource_ids) && resource_ids.length
      ? resource_ids.map(Number).filter(Boolean)
      : (resource_id ? [Number(resource_id)] : []);

    if (teamIds.length) {
      const q = await client.query(
        `SELECT id, name FROM public.resources WHERE id = ANY($1::int[])`,
        [teamIds]
      );
      const byId = new Map(q.rows.map(r => [Number(r.id), r.name]));
      for (const rid of teamIds) {
        const rname = byId.get(rid);
        if (rname) {
          await client.query(
            `INSERT INTO public.install_task_assignments (task_id, resource_id, resource_name)
             VALUES ($1,$2,$3)
             ON CONFLICT (task_id, COALESCE(resource_id, -1), resource_name) DO NOTHING`,
            [taskId, rid, rname]
          );
        }
      }
    } else if (Array.isArray(resource_names) && resource_names.length) {
      for (const nm of resource_names) {
        await client.query(
          `INSERT INTO public.install_task_assignments (task_id, resource_name)
           VALUES ($1,$2)
           ON CONFLICT (task_id, COALESCE(resource_id, -1), resource_name) DO NOTHING`,
          [taskId, String(nm)]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ ok:true, id: taskId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[TASK CREATE]", e);
    res.status(500).json({ error: "db_error", detail: e.message });
  } finally {
    client.release();
  }
});


// --- GET /api/tasks/:id/summary (defensive version)
router.get("/:id/summary", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "bad_task_id" });

  try {
    // 1) Task - use SELECT * and map in JS for flexibility
    console.log("[TASK SUMMARY] defensive route active for id=", id);
    const tQ = await pool.query(
      `SELECT * FROM public.install_tasks WHERE id = $1`,
      [id]
    );
    if (!tQ.rows.length) return res.status(404).json({ error: "task_not_found" });
    const rawTask = tQ.rows[0];
    try { console.log("[TASK SUMMARY] rawTask keys:", Object.keys(rawTask||{})); } catch {}

    // Map to expected fields with fallbacks
    const pick = (...vals) => {
      for (const v of vals) if (v != null && v !== "") return v;
      return "";
    };

    const task = {
      id: rawTask.id,
      task_type: pick(rawTask.task_type, rawTask.type, rawTask.event_type),
      title: pick(rawTask.title, rawTask.name, rawTask.task_name),
      resource_name: pick(rawTask.resource_name, rawTask.crew, rawTask.assigned_to),
      job_name: pick(rawTask.job_name, rawTask.project_name),
      job_id: rawTask.job_id,
      bid_id: rawTask.bid_id,
      phase: pick(rawTask.phase, rawTask.phase_group),
      window_start: rawTask.window_start,
      window_end: rawTask.window_end,
      notes: pick(rawTask.notes, rawTask.description, rawTask.note)
    };

    // 1.5) Teams assigned to this task
    let teams = [];
    try {
      const a = await pool.query(
        `SELECT resource_id, resource_name
           FROM public.install_task_assignments
          WHERE task_id = $1
          ORDER BY resource_name`,
        [task.id]
      );
      teams = a.rows || [];
    } catch (_) {}

    // 2) Bid (raw row; we map in JS so column name drift won't break)
    let bidRow = null;
    let bidIdForTotals = null;
    if (task.bid_id) {
      const bQ = await pool.query(`SELECT * FROM public.bids WHERE id = $1`, [task.bid_id]);
      bidRow = bQ.rows[0] || null;
      bidIdForTotals = bidRow?.id || task.bid_id;
    } else if (task.job_id) {
      // Fallback: find the latest bid for this job
      const jQ = await pool.query(`SELECT * FROM public.bids WHERE job_id = $1 ORDER BY id DESC LIMIT 1`, [task.job_id]);
      bidRow = jQ.rows[0] || null;
      bidIdForTotals = bidRow?.id || null;
    }

    const bid = bidRow ? {
      id:                 bidRow.id,
      customer_type:      pick(bidRow.customer_type, bidRow.cust_type, bidRow.type),
      sales_person:       pick(bidRow.sales_person, bidRow.salesperson, bidRow.sales_rep),
      designer:           pick(bidRow.designer, bidRow.designer_name),
      builder:            pick(bidRow.builder, bidRow.builder_name, bidRow.builder_company),
      builder_phone:      pick(bidRow.builder_phone, bidRow.builder_phone_number, bidRow.builder_tel),
      homeowner:          pick(bidRow.homeowner, bidRow.homeowner_name, bidRow.customer_name),
      homeowner_phone:    pick(bidRow.homeowner_phone, bidRow.customer_phone, bidRow.homeowner_tel),
      customer_email:     pick(bidRow.customer_email, bidRow.email, bidRow.homeowner_email),
      home_address:       pick(bidRow.home_address, bidRow.address, bidRow.job_address, bidRow.site_address),
      lot_plan:           pick(bidRow.lot_plan, bidRow.lot_plan_name, bidRow.lot_number, bidRow.plan_name),
      access_notes:       pick(bidRow.access_notes, bidRow.how_to_get_in, bidRow.gate_codes, bidRow.entry_notes),
      install_date:       pick(bidRow.install_date, bidRow.target_install_date, bidRow.requested_install_date),
    } : null;

    // 3) Financials — try several sources in order
    let financial = { subtotal: 0, tax: 0, total: 0 };

    if (bidIdForTotals) {
      // Helper to try a query and ignore "relation does not exist" errors
      async function tryTotals(sql, params) {
        try {
          const r = await pool.query(sql, params);
          if (r.rows.length) {
            const row = r.rows[0];
            financial = {
              subtotal: Number(row.subtotal || 0),
              tax:      Number(row.tax || 0),
              total:    Number(row.total || 0),
            };
            return true;
          }
        } catch (e) {
          // swallow only missing relation errors; rethrow others
          if (!(e && (String(e.message||"").includes("does not exist") || e.code === "42P01"))) {
            throw e;
          }
        }
        return false;
      }

      // Try common locations in priority order
      const used = await tryTotals(
        `SELECT subtotal, tax, total FROM public.bid_totals WHERE bid_id = $1`,
        [bidIdForTotals]
      ) || await tryTotals(
        `SELECT subtotal, tax, total FROM public.v_bid_totals WHERE bid_id = $1`,
        [bidIdForTotals]
      ) || await tryTotals(
        `SELECT * FROM public.calculate_bid_totals($1)`,
        [bidIdForTotals]
      );
      console.log("[TASK SUMMARY] totals source used:", used ? "ok" : "none-found");
    }

  res.json({ task, bid, financial, teams });
  } catch (e) {
    console.error("[TASK SUMMARY ERR]", e && (e.stack || e));
    res.status(500).json({ error: "server_error", detail: e.message });
  }
});

// DELETE /api/tasks/:id -> remove a task
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM public.install_tasks WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "delete_failed" });
  }
});

// --- GET /api/tasks/team/:id  -> Crew-friendly bundle -----------------------
router.get("/team/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "bad_task_id" });

  // helpers
  const pick = (...vals) => { for (const v of vals) if (v != null && v !== "") return v; return ""; };

  try {
    // 1) Task
    const tQ = await pool.query(
      `SELECT id, job_id, type, name, window_start, window_end, notes, checklist, phase_group
         FROM public.install_tasks
        WHERE id = $1`, [id]
    );
    if (!tQ.rows.length) return res.status(404).json({ error: "task_not_found" });
    const task = tQ.rows[0];

    // 2) Bid (job→bid if you have that; otherwise try job_id as bid_id)
    // Resolve bid_id defensively from: tasks.job_id -> bids.id or install_jobs.bid_id
    let bidId = null;
    try {
      // prefer install_jobs → bids
      const jQ = await pool.query(`SELECT bid_id FROM public.install_jobs WHERE id = $1`, [task.job_id]);
      bidId = jQ.rows[0]?.bid_id || null;
    } catch {}
    if (!bidId) bidId = task.job_id || null;

    let bid = null;
    if (bidId) {
      const bQ = await pool.query(`SELECT * FROM public.bids WHERE id = $1`, [bidId]).catch(()=>({rows:[]}));
      const r = bQ.rows[0] || {};
      bid = {
        id: r.id,
        sales_person:    pick(r.sales_person, r.salesperson, r.sales_rep),
        sales_phone:     pick(r.sales_phone, r.salesperson_phone, r.sales_rep_phone),
        customer_name:   pick(r.homeowner, r.customer_name, r.builder),
        customer_phone:  pick(r.homeowner_phone, r.customer_phone, r.builder_phone),
        address:         pick(r.home_address, r.job_address, r.site_address),
        access:          pick(r.access_notes, r.how_to_get_in, r.gate_codes, r.entry_notes),
        // extras for UI
        designer:        pick(r.designer, r.designer_name),
        lot_plan:        pick(r.lot_plan, r.plan_name),
        customer_email:  pick(r.customer_email, r.email),
      };
    }

    // 3) Files (layouts, renderings, orders) — optional tables, safe fallbacks
    let files = [];
    try {
      const fQ = await pool.query(
        `SELECT id, label, doc_type, url, file_path, created_at
           FROM public.bid_documents
          WHERE bid_id = $1
          ORDER BY created_at DESC
        `, [bid?.id || 0]
      );
      files = fQ.rows.map(x => ({
        id: x.id,
        label: x.label || x.doc_type || 'Document',
        url:   x.url || x.file_path,   // serve via your existing static if needed
        type:  x.doc_type || ''
      }));
    } catch {
      files = [];  // table may not exist yet
    }

    // 4) Hardware / handles — try common places
    let hardware = [];
    try {
      const hQ = await pool.query(
        `SELECT kind, model, finish, location
           FROM public.bid_hardware
          WHERE bid_id = $1
          ORDER BY id`, [bid?.id || 0]
      );
      hardware = hQ.rows;
    } catch {
      // fallback from column details summary if you have it
      try {
        const h2 = await pool.query(
          `SELECT details->>'kind'  AS kind,
                  details->>'model' AS model,
                  details->>'finish' AS finish,
                  details->>'location' AS location
             FROM public.bid_column_details
            WHERE bid_id = $1 AND column_key = 'hardware'`, [bid?.id || 0]
        );
        hardware = h2.rows;
      } catch {}
    }

    // 5) Teams for this task
    let teams = [];
    try {
      const a = await pool.query(
        `SELECT resource_id, resource_name
           FROM public.install_task_assignments
          WHERE task_id = $1 ORDER BY resource_name`, [task.id]
      );
      teams = a.rows;
    } catch {}

    res.json({ task, bid, files, hardware, teams });
  } catch (e) {
    console.error("[TEAM TASK ERR]", e);
    res.status(500).json({ error: "server_error", detail: e.message });
  }
});


export default router;
