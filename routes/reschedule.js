// routes/reschedule.js
import express from "express";
import db from "../db.js"; // whatever you use to export a pg Pool/Client

const router = express.Router();

// helper: check overlap & capacity on the same resource
async function canPlaceTask(client, taskId, newStart, newEnd) {
  const { rows: [t] } = await client.query(
    `SELECT id, resource_id,
            EXTRACT(EPOCH FROM ($2::timestamptz - $1::timestamptz))/60 AS dur
     FROM install_tasks WHERE id=$3`,
    [newStart, newEnd, taskId]
  );
  if (!t) return { ok: false, reason: "task_not_found" };
  if (!t.resource_id) return { ok: true }; // unassigned yet → OK

  // no overlap with other tasks on the same resource
  const { rows: [overlap] } = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM install_tasks it
     WHERE it.resource_id = $1
       AND it.id <> $2
       AND it.window_end   > $3
       AND it.window_start < $4`,
    [t.resource_id, taskId, newStart, newEnd]
  );
  if (overlap.n > 0) return { ok: false, reason: "overlap" };

  // capacity check (minutes that day)
  const { rows: [cap] } = await client.query(
    `SELECT r.capacity_min_per_day AS cap,
            COALESCE((
              SELECT SUM(duration_min)
              FROM install_tasks it
              WHERE it.resource_id=$1
                AND it.window_start::date = $2::date
            ),0)::int AS day_load`,
    [t.resource_id, newStart]
  );
  if (cap && cap.day_load + Math.round(+t.dur) > cap.cap)
    return { ok: false, reason: "capacity" };

  return { ok: true };
}

// 1) Create request
router.post("/api/tasks/:id/reschedule-requests", async (req, res) => {
  const { id } = req.params;
  const { new_start, new_end, reason } = req.body;
  const user = req.user?.email ?? "sales@unknown";

  const { rows: [task] } = await db.query(
    "SELECT window_start, window_end FROM install_tasks WHERE id=$1",
    [id]
  );
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { rows } = await db.query(
    `INSERT INTO task_reschedule_requests
       (task_id, requested_by, old_start, old_end, new_start, new_end, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [id, user, task.window_start, task.window_end, new_start, new_end, reason || null]
  );

  // TODO: notify Slack #schedule
  res.json({ ok: true, request: rows[0] });
});

// 2) List requests (for Ops)
router.get("/api/tasks/reschedule-requests", async (req, res) => {
  const status = req.query.status || "pending";
  const { rows } = await db.query(
    `SELECT r.*, j.customer_name, t.name AS task_name
     FROM task_reschedule_requests r
     JOIN install_tasks t ON t.id = r.task_id
     JOIN install_jobs  j ON j.id = t.job_id
     WHERE r.status = $1
     ORDER BY r.created_at DESC`,
    [status]
  );
  res.json({ requests: rows });
});

// 3) Approve → safe update
router.post("/api/tasks/reschedule-requests/:reqId/approve", async (req, res) => {
  const { reqId } = req.params;
  const approver = req.user?.email ?? "ops@unknown";
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows: [r] } = await client.query(
      `SELECT * FROM task_reschedule_requests WHERE id=$1 FOR UPDATE`,
      [reqId]
    );
    if (!r) throw new Error("request_not_found");
    if (r.status !== "pending") throw new Error("not_pending");

    const ok = await canPlaceTask(client, r.task_id, r.new_start, r.new_end);
    if (!ok.ok) {
      await client.query(
        `UPDATE task_reschedule_requests
           SET status='rejected', decided_by=$2, decided_at=now()
         WHERE id=$1`,
        [reqId, approver]
      );
      await client.query("COMMIT");
      return res.status(409).json({ ok: false, reason: ok.reason });
    }

    // apply the change
    await client.query(
      `UPDATE install_tasks
         SET window_start=$2, window_end=$3
       WHERE id=$1`,
      [r.task_id, r.new_start, r.new_end]
    );

    // close the request
    await client.query(
      `UPDATE task_reschedule_requests
         SET status='applied', decided_by=$2, decided_at=now()
       WHERE id=$1`,
      [reqId, approver]
    );

    await client.query("COMMIT");
    // TODO: notify Slack #schedule (approved)
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(400).json({ ok: false, error: e.message });
  } finally {
    client.release();
  }
});

// 4) Reject
router.post("/api/tasks/reschedule-requests/:reqId/reject", async (req, res) => {
  const { reqId } = req.params;
  const approver = req.user?.email ?? "ops@unknown";
  await db.query(
    `UPDATE task_reschedule_requests
       SET status='rejected', decided_by=$2, decided_at=now()
     WHERE id=$1 AND status='pending'`,
    [reqId, approver]
  );
  // TODO: notify Slack #schedule (rejected)
  res.json({ ok: true });
});

export default router;
