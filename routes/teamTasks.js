// routes/teamTasks.js
import express from "express";
import pool from "../db.js";
import { slack, SLACK_CHANNEL, PUBLIC_BASE_URL } from "../slack.js";

const router = express.Router();

const TABLE = "public.install_tasks";
const COL_ID = "id";
const COL_STATUS = "status";
const COL_UPDATED = "updated_at";
const COL_NOTES = "notes";

// dev signal
console.log("[teamTasks] routes loaded for install_tasks");

// ---- helpers
async function getTask(id) {
  const r = await pool.query(
    `SELECT ${COL_ID}, ${COL_STATUS}, ${COL_UPDATED} FROM ${TABLE} WHERE ${COL_ID} = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function fetchTaskContext(id) {
  const sql = `
    SELECT it.id,
           it.job_id,
           it.type,
           it.name,
           it.status,
           it.window_start,
           it.window_end,
           it.resource_id,
           c.name AS resource_name,
           b.customer_name
    FROM public.install_tasks it
    LEFT JOIN public.crews c ON c.id = it.resource_id
    LEFT JOIN public.bids b  ON b.id::text = it.job_id::text
    WHERE it.id = $1
  `;
  const r = await pool.query(sql, [id]);
  return r.rows[0] || null;
}

async function logEvent(taskId, eventType, note, whenISO) {
  try {
    await pool.query(
      `INSERT INTO public.task_events (task_id, task_table, event_type, note, at)
       VALUES ($1,$2,$3,$4,$5::timestamptz)`,
      [taskId, 'install_tasks', eventType, (note || "").trim() || null, whenISO || new Date().toISOString()]
    );
  } catch (e) {
    // don't fail the endpoint if history insert fails
    console.warn("[task_events] insert warn:", e.message);
  }
}

/**
 * Update status (only allowed values) and always bump updated_at.
 * Returns { id, status, updated_at }
 */
async function updateTaskStatus({ id, status, note }) {
  const row = await getTask(id);
  if (!row) {
    const e = new Error("task_not_found");
    e.code = "TASK_NOT_FOUND";
    throw e;
  }

  const sets = [`${COL_STATUS} = $2`, `${COL_UPDATED} = now()`];
  const params = [id, status];

  if (note && String(note).trim()) {
    params.push(String(note).trim());
    sets.push(`${COL_NOTES} = $${params.length}`);
  }

  const sql = `
    UPDATE ${TABLE}
       SET ${sets.join(", ")}
     WHERE ${COL_ID} = $1
     RETURNING ${COL_ID} AS id, ${COL_STATUS} AS status, ${COL_UPDATED} AS updated_at
  `;

  const r = await pool.query(sql, params);
  return r.rows[0];
}

// Status mapping that **fits your CHECK constraint**
const map = {
  ontheway:  "in_progress", // 'en_route' not allowed in your DB
  arrived:   "in_progress",
  wip:       "in_progress",
  complete:  "complete"
};

// --- Color + emoji per event
const EVENT_META = {
  ontheway: { color: "#f59e0b", emoji: "🚚", label: "On the way" },
  arrived:  { color: "#3b82f6", emoji: "📍", label: "Arrived" },
  wip:      { color: "#8b5cf6", emoji: "🛠", label: "WIP" },
  complete: { color: "#10b981", emoji: "✅", label: "Complete" },
};

function fmtTaskSlack(task, eventType, note) {
  const em = {
    ontheway: "�",
    arrived: "�",
    wip: "�",
    complete: "✅"
  }[eventType] || "🔔";

  const title = `${task.type || "task"} — ${task.name || "Unnamed"}`;
  const crew  = task.resource_name || "Unassigned";
  const cust  = task.customer_name || "Unknown Customer";
  const start = task.window_start ? new Date(task.window_start).toLocaleString() : "—";
  const end   = task.window_end ? new Date(task.window_end).toLocaleTimeString() : "—";
  const link  = `${PUBLIC_BASE_URL}/team/task?id=${task.id}`;

  const noteBlock = (note && note.trim())
    ? `> _${note.trim()}_`
    : "> _no note_";

  const text = `${em} ${eventType.toUpperCase()} — Task #${task.id}: ${title}`;
  const mrkdwn = [
    `*${em} ${eventType.toUpperCase()}* — *Task #${task.id}*`,
    `*${title}*`,
    `*Customer:* ${cust}`,
    `*When:* ${start} → ${end}`,
    `*Crew:* ${crew}`,
    noteBlock,
    `<${link}|Open task>`
  ].join("\n");

  return { text, mrkdwn };
}

function buildSlackPayload(task, eventType, note) {
  const meta   = EVENT_META[eventType] || { color: "#6b7280", emoji: "🔔", label: eventType };
  const title  = `${task.type || "Task"} — ${task.name || "Unnamed"}`;
  const crew   = task.resource_name || "Unassigned";
  const cust   = task.customer_name || "Unknown Customer";
  const start  = task.window_start ? new Date(task.window_start).toLocaleString()   : "—";
  const end    = task.window_end   ? new Date(task.window_end).toLocaleTimeString() : "—";
  const link   = `${PUBLIC_BASE_URL}/team/task?id=${task.id}`;
  const noteMd = (note && note.trim()) ? `_${note.trim()}_` : "_no note_";

  const text = `${meta.emoji} ${meta.label} — Task #${task.id}: ${title}`;

  return {
    text,
    attachments: [
      {
        color: meta.color,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `${meta.emoji} ${meta.label} — Task #${task.id}`, emoji: true } },
          { type: "section",
            text: { type: "mrkdwn", text: `*${title}*\n*Customer:* ${cust}\n*When:* ${start} → ${end}\n*Crew:* ${crew}` }
          },
          { type: "section", text: { type: "mrkdwn", text: noteMd } },
          { type: "actions",
            elements: [
              { type: "button", text: { type: "plain_text", text: "Open task" }, url: link }
            ]
          },
          { type: "context", elements: [{ type: "mrkdwn", text: `Job #${task.job_id || "—"} • Status: *${task.status || "—"}*` }] }
        ]
      }
    ]
  };
}

async function postOpsStatusToSlack(taskId, eventType, note) {
  try {
    const t = await fetchTaskContext(taskId);
    if (!t) { console.warn("[Slack] task not found:", taskId); return; }

    const payload = buildSlackPayload(t, eventType, note);
    await slack.chat.postMessage({
      channel: SLACK_CHANNEL,
      ...payload
    });
    console.log("[Slack] posted", eventType, "for task", taskId);
  } catch (e) {
    console.error("[Slack] post error:", e.message);
  }
}

// Slack helper
async function postToSlack({ taskId, eventType, note }) {
  if (!slack || !SLACK_CHANNEL) return; // skip if not configured
  try {
    const task = await fetchTaskContext(taskId);
    if (!task) {
      console.warn("[Slack] task not found:", taskId);
      return;
    }

    const { text, mrkdwn } = fmtTaskSlack(task, eventType, note);
    
    await slack.chat.postMessage({
      channel: SLACK_CHANNEL,
      text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: mrkdwn
          }
        }
      ],
      unfurl_links: false
    });
  } catch (err) {
    console.warn("[Slack] post failed:", err.message);
  }
}

function wrap(handler) {
  return async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_task_id" });
      const body = req.body || {};
      const note = (body.note || "").toString();
      const when = body.when || new Date().toISOString();

      const out = await handler({ id, note, when });
      res.json(out);
    } catch (e) {
      if (e.code === "TASK_NOT_FOUND") return res.status(404).json({ error: "task_not_found" });
      console.error("💥 TEAM TASKS ERROR 💥", e);
      res.status(500).json({ error: "server_error", message: e.message || String(e) });
    }
  };
}

// ---- endpoints

router.post("/api/tasks/:id/ontheway", express.json(), wrap(async ({ id, note, when }) => {
  const status = map.ontheway;                       // -> 'in_progress'
  const out = await updateTaskStatus({ id, status, note });
  await logEvent(id, "ontheway", note, when);
  await postOpsStatusToSlack(id, "ontheway", note);
  return { ok: true, id: out.id, status: out.status, updated_at: out.updated_at };
}));

router.post("/api/tasks/:id/arrived", express.json(), wrap(async ({ id, note, when }) => {
  const status = map.arrived;                        // -> 'in_progress'
  const out = await updateTaskStatus({ id, status, note });
  await logEvent(id, "arrived", note, when);
  await postOpsStatusToSlack(id, "arrived", note);
  return { ok: true, id: out.id, status: out.status, updated_at: out.updated_at };
}));

router.post("/api/tasks/:id/wip", express.json(), wrap(async ({ id, note, when }) => {
  const status = map.wip;                            // -> 'in_progress'
  const out = await updateTaskStatus({ id, status, note });
  await logEvent(id, "wip", note, when);
  await postOpsStatusToSlack(id, "wip", note);
  return { ok: true, id: out.id, status: out.status, updated_at: out.updated_at };
}));

router.post("/api/tasks/:id/complete", express.json(), wrap(async ({ id, note, when }) => {
  const status = map.complete;                       // -> 'complete'
  const out = await updateTaskStatus({ id, status, note });
  await logEvent(id, "complete", note, when);
  await postOpsStatusToSlack(id, "complete", note);
  return { ok: true, id: out.id, status: out.status, updated_at: out.updated_at };
}));

// ---- History / Events endpoints

// List events (newest first)
router.get("/api/tasks/:id/events", async (req, res) => {
  const id = Number(req.params.id);
  const limit = Math.min(Number(req.query.limit || 50), 200);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_task_id" });

  try {
    const { rows } = await pool.query(
      `SELECT id, event_type, note, at
         FROM public.task_events
        WHERE task_id = $1
        ORDER BY at DESC, id DESC
        LIMIT $2`,
      [id, limit]
    );
    res.json(rows);
  } catch (e) {
    console.error("[events list]", e.message);
    res.status(500).json({ error: "server_error" });
  }
});

// Optional: simple event post (for custom notes from UI)
router.post("/api/tasks/:id/events", express.json(), async (req, res) => {
  const id = Number(req.params.id);
  const note = (req.body?.note || "").toString();
  const type = (req.body?.event_type || "note").toString();
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_task_id" });
  try {
    await pool.query(
      `INSERT INTO public.task_events (task_id, task_table, event_type, note, at)
       VALUES ($1, $2, $3, $4, now())`,
      [id, 'install_tasks', type, note.trim() || null]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[events add]", e.message);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
