// routes/reminders.js
import express from "express";
import { pool } from "../db.js";

const router = express.Router();
const GRACE1_MIN = Number(process.env.NUDGE_GRACE_MIN || 15);   // after start
const GRACE2_MIN = Number(process.env.NUDGE_ESCALATE_MIN || 45); // stronger alert
const GRACE3_MIN = Number(process.env.NUDGE_PAST_END_MIN || 30); // after end

async function postSlack(text) {
  try {
    const t = process.env.N8N_OPS_STATUS_WEBHOOK;
    if (!t) return;
    await fetch(t, { 
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ event:"nudge", text })
    });
  } catch (e) {
    console.warn('[SLACK] nudge failed:', e.message);
  }
}

router.post("/scan", async (_req, res) => {
  // 1) NUDGE: scheduled, past start + GRACE1, no 'arrived' event
  const qNudge = `
    WITH last_arrived AS (
      SELECT task_id, max(created_at) AS ts
      FROM public.job_events
      WHERE event_type='arrived'
      GROUP BY task_id
    )
    SELECT t.id, t.job_id, t.resource_id, r.name AS resource_name, j.customer_name,
           t.window_start, t.window_end
    FROM public.install_tasks t
    LEFT JOIN last_arrived a ON a.task_id = t.id
    LEFT JOIN public.resources r ON r.id = t.resource_id
    LEFT JOIN public.install_jobs j ON j.id = t.job_id
    WHERE t.status = 'scheduled'
      AND now() > (t.window_start + ($1 || ' minutes')::interval)
      AND a.ts IS NULL
    LIMIT 50
  `;

  // 2) ESCALATE: still not in_progress after GRACE2
  const qEscalate = `
    SELECT t.id, t.job_id, r.name AS resource_name, j.customer_name, t.window_start
    FROM public.install_tasks t
    LEFT JOIN public.resources r ON r.id = t.resource_id
    LEFT JOIN public.install_jobs j ON j.id = t.job_id
    WHERE t.status = 'scheduled'
      AND now() > (t.window_start + ($1 || ' minutes')::interval)
    LIMIT 50
  `;

  // 3) PAST-END: not complete after end + GRACE3
  const qPastEnd = `
    SELECT t.id, t.job_id, r.name AS resource_name, j.customer_name, t.window_end
    FROM public.install_tasks t
    LEFT JOIN public.resources r ON r.id = t.resource_id
    LEFT JOIN public.install_jobs j ON j.id = t.job_id
    WHERE t.status <> 'complete'
      AND t.window_end IS NOT NULL
      AND now() > (t.window_end + ($1 || ' minutes')::interval)
    LIMIT 50
  `;

  const client = await pool.connect();
  try {
    const nudges = (await client.query(qNudge, [GRACE1_MIN])).rows || [];
    for (const x of nudges) {
      await client.query(
        `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
         VALUES ($1,$2,'nudge', $3, 'system')`,
        [x.id, x.job_id, JSON.stringify({ reason:'late_start', grace_min: GRACE1_MIN })]
      );
      await postSlack(`⏰ Nudge: Task ${x.id} (${x.customer_name}) not started. Crew: ${x.resource_name||'Unassigned'}`);
    }

    const esc = (await client.query(qEscalate, [GRACE2_MIN])).rows || [];
    for (const x of esc) {
      await client.query(
        `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
         VALUES ($1,$2,'nudge', $3, 'system')`,
        [x.id, x.job_id, JSON.stringify({ reason:'escalate_scheduler', grace_min: GRACE2_MIN })]
      );
      await postSlack(`🚨 Escalate: Task ${x.id} (${x.customer_name}) still not in progress. Ping scheduler.`);
    }

    const late = (await client.query(qPastEnd, [GRACE3_MIN])).rows || [];
    for (const x of late) {
      // optional: put task on hold
      await client.query(`UPDATE public.install_tasks SET status='hold', updated_at=now() WHERE id=$1 AND status <> 'complete'`, [x.id]);
      await client.query(
        `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
         VALUES ($1,$2,'nudge', $3, 'system')`,
        [x.id, x.job_id, JSON.stringify({ reason:'past_end', grace_min: GRACE3_MIN })]
      );
      await postSlack(`🟥 Past end: Task ${x.id} (${x.customer_name}) not completed. Marked HOLD.`);
    }

    res.json({ ok:true, nudged:nudges.length, escalated:esc.length, past_end:late.length });
  } catch (e) {
    console.error('[REMINDERS] scan error', e);
    res.status(500).json({ ok:false, error:'scan_failed' });
  } finally {
    client.release();
  }
});

// Manual nudge for a specific task
router.post("/:id/nudge", async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  if (!taskId) return res.status(400).json({ error: 'invalid_task_id' });

  const client = await pool.connect();
  try {
    const taskRes = await client.query(
      `SELECT t.id, t.job_id, t.status, r.name AS resource_name, j.customer_name
       FROM public.install_tasks t
       LEFT JOIN public.resources r ON r.id = t.resource_id
       LEFT JOIN public.install_jobs j ON j.id = t.job_id
       WHERE t.id = $1`,
      [taskId]
    );

    if (taskRes.rowCount === 0) {
      return res.status(404).json({ error: 'task_not_found' });
    }

    const task = taskRes.rows[0];

    await client.query(
      `INSERT INTO public.job_events (task_id, job_id, event_type, payload, created_by)
       VALUES ($1, $2, 'nudge', $3, 'manual')`,
      [taskId, task.job_id, JSON.stringify({ reason: 'manual_nudge' })]
    );

    await postSlack(`🔔 Manual nudge: Task ${taskId} (${task.customer_name}) - Status: ${task.status}. Crew: ${task.resource_name || 'Unassigned'}`);

    res.json({ ok: true, task_id: taskId, nudged: true });
  } catch (e) {
    console.error('[REMINDERS] manual nudge error', e);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

export default router;
