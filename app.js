// app.js â€” minimal Express server + API routes + test pages
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import registerSalesIntake from "./pages/salesIntake.js";
import scheduleRouter from "./routes/schedule.js";
import resourcesRouter from "./routes/resources.js";
import mydayRouter from "./routes/myday.js";
import tasksRouter from "./routes/tasks.js";
import registerBids from "./routes/bids.js";
// optionsRouter removed
import 'dotenv/config';
import registerPurchasing from "./routes/purchasing.js";
import registerPurchasingWorklist from "./pages/purchasingWorklist.js";
import registerBidsInline from "./pages/bidsInline.js";
import registerBidsCards from "./pages/bidsCards.js";
import registerAdminOptions from "./pages/adminOptions.js";
import registerSalesOnboarding from "./pages/salesOnboarding.js";
import registerSalesQuote from "./pages/salesQuote.js";
import registerQuoteAck from "./pages/quoteAck.js";
import registerOpsDayBoard from "./pages/opsDayBoard.js";
import registerMyDayTeams from "./pages/mydayTeams.js";
// import serviceRouter from "./routes/service.js";
import registerCreateService from "./pages/createService.js";
import adminContentRouter from "./routes/adminContent.js";
import registerAdminContent from "./pages/adminContent.js";
import { ensureDepositItemId } from './services/qbo.js';
import registerQboRoutes from './routes/qbo.js';
import registerLoginPage from "./pages/login.js";
import registerRegisterPage from "./pages/register.js";
import authRouter, { requireAuthPage, requireRolePage } from "./routes/auth.js";
import cookieParser from "cookie-parser";
import { requireAuth } from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import adminUsersRouter from "./routes/adminUsers.js";
import registerAdminUsersPage from "./pages/adminUsers.js";
import registerSalesHomePage from "./pages/salesHome.js";
import searchRouter from "./routes/search.js";
import bidsRecentRouter from "./routes/bidsRecent.js";
import registerCalendarPage from "./pages/calendar.js";
import calendarApiRouter from "./routes/calendarApi.js";
import rescheduleRouter from "./routes/reschedule.js";
import salesRouter from "./routes/sales.js"; 
import registerSalesDetails from "./pages/salesDetails.js";
import registerAdminLeadTimes from "./pages/adminLeadTimes.js";
import registerPurchasingPage from "./pages/purchasing.js";
import registerAdminHub from "./pages/adminHub.js";
import pool from "./db.js";
import registerSchedulePage from "./pages/schedule.js";
import jobsRouter from "./routes/jobs.js";
import registerGanttPage from "./pages/gantt.js";
import registerTeamTaskPage from "./pages/teamTask.js";
import lookupRouter from "./routes/lookup.js";
import remindersRouter from "./routes/reminders.js";
import opsDashboardRouter from "./routes/opsDashboard.js";
import registerOpsDashboardPage from "./pages/opsDashboard.js";
import issuesRouter from "./routes/issues.js";
import materialRouter from "./routes/material.js";
import poRouter from "./routes/po.js";
import registerSalesReview from "./pages/salesReview.js";
import registerPurchasingDashboard from "./pages/purchasingDashboard.js";
import invitationsRouter from "./routes/invitations.js";
import registerAdminInvites from "./pages/adminInvites.js";
import registerAcceptInvite from "./pages/acceptInvite.js";
import crewsRouter from "./routes/crews.js";
import registerJobHub from "./routes/job-hub.js";
import registerSalesConsole from "./pages/salesConsole.js";
import registerSalesReschedule from "./pages/salesReschedule.js";
import registerSalesServiceSchedule from "./pages/salesServiceSchedule.js";
import salesExtraRouter from "./routes/salesExtra.js";
import availabilityRouter from "./routes/availability.js";
import teamTasksRoutes from "./routes/teamTasks.js";
import tasksSearchRoutes from "./routes/tasksSearch.js";
import { slack, SLACK_CHANNEL, PUBLIC_BASE_URL } from "./slack.js";
import autoTasksRouter from "./routes/autoTasks.js";
import teamTaskApi from "./routes/teamTaskApi.js";

// --- init app FIRST ---
const app = express();

pool
  .query("select 1")
  .then(() => console.log("DB connection OK"))
  .catch((err) => console.error("DB connection failed:", err.message));

registerBids(app);
registerPurchasing(app);

app.get('/qbo/check', async (_req, res) => {
  try {
    const id = await ensureDepositItemId();
    res.json({ ok: true, depositItemId: id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});
app.get("/logout", (req, res) => {
  res.clearCookie("ce_jwt");
  res.redirect("/login");
});

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// --- security middleware (CRITICAL) ---
app.set('trust proxy', 1);
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('X-XSS-Protection', '1; mode=block'); next(); });
if (process.env.NODE_ENV === 'production') { app.use((req, res, next) => { if (req.header('x-forwarded-proto') !== 'https') res.redirect(`https://${req.header('host')}${req.url}`); else next(); }); }

// --- middleware ---
app.use(cors());
app.use(express.json({ limit: "35mb" }));
app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  if (req.method !== 'GET') {
    try { console.log('[BODY]', JSON.stringify(req.body)); } catch {}
  }
  next();
});
app.use(express.static("public"));
app.use("/static", express.static(path.join(process.cwd(), "static")));
app.use(cookieParser());
app.use(["/sales-intake", "/sales-quote", "/admin-options", "/admin/options", "/admin/data"], requireAuthPage);
// Removed redundant adminUsersRouter mounting at /api/admin/users
app.use("/admin/users", requireAuthPage);

// Mount teamTasksRoutes BEFORE tasksRouter to handle specific routes like /api/tasks/:id/ontheway
app.use(teamTasksRoutes);
app.use(tasksSearchRoutes);
app.use(teamTaskApi);

app.use("/api/myday", mydayRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/tasks", autoTasksRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/resources", resourcesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/crews", crewsRouter);
app.use("/api/availability", availabilityRouter);
app.use(salesRouter);

// GET /api/files?bid=:id -> files for a bid (delegates to bid's doc_links)
app.get('/api/files', async (req, res) => {
  const bidId = Number(req.query.bid);
  if (!bidId) return res.status(400).json({ error: 'missing_bid_id' });
  try {
    const { rows } = await pool.query('SELECT doc_links FROM bids WHERE id = $1', [bidId]);
    if (!rows.length) return res.status(404).json({ error: 'bid_not_found' });
    const docs = rows[0].doc_links || [];
    res.json(Array.isArray(docs) ? docs : []);
  } catch (e) {
    console.error('files error:', e);
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});
import serviceRouter from "./routes/service.js";
app.use("/api/admin-content", adminContentRouter);
app.use('/qbo/webhook', express.raw({ type: '*/*' }));
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/invitations", invitationsRouter);
// Sales-facing pages
app.use("/sales-intake",   requireRolePage(["admin","sales"]));
app.use("/sales-quote",    requireRolePage(["admin","sales"]));
app.use("/sales-details",  requireRolePage(["admin","sales"]));
app.use("/sales-reschedule", requireRolePage(["admin","sales"]));
app.use("/sales-service-schedule", requireRolePage(["admin","sales"]));
app.use("/sales/reschedule", requireRolePage(["admin","sales"]));
app.use("/sales/service-new", requireRolePage(["admin","sales"]));
app.use("/admin-lead-times",requireRolePage(["admin","purchasing"]));

// Ops-facing pages (add/remove as you turn them on)
app.use("/schedule",      requireRolePage(["admin","ops"]));
app.use("/myday",         requireRolePage(["admin","ops"]));
app.use("/gantt",         requireRolePage(["admin","ops"]));

// Admin pages
app.use("/admin/users",    requireRolePage(["admin"]));
app.use("/admin/hub",      requireRolePage(["admin"]));
app.use(["/admin-options", "/admin/options", "/admin/data"], requireRolePage(["admin"]));
app.use("/admin/invitations", requireRolePage(["admin"]));

// Other protected pages
app.use("/sales-home",     requireAuthPage);
app.use("/sales-review",   requireRolePage(["admin","sales"]));
app.use("/calendar",       requireAuthPage);
app.use("/purchasing",     requireRolePage(["admin","purchasing"]));
app.use("/purchasing-dashboard", requireRolePage(["admin","purchasing"]));
app.use("/ops-dashboard",  requireRolePage(["admin","ops"]));
app.use("/team-task",      requireRolePage(["admin","ops","installer","service","manufacturing","assembly","delivery"]));
app.use("/myday-teams",    requireRolePage(["admin","ops","installer","service","manufacturing","assembly","delivery"]));

app.use("/api/search", searchRouter);
app.use("/api/bids-recent", bidsRecentRouter);
app.use("/api/calendar", calendarApiRouter);
app.use(rescheduleRouter);
app.use(salesRouter);         
app.use("/api/lookup", lookupRouter);                   
app.use("/api/reminders", remindersRouter);
app.use("/api/ops-dashboard", opsDashboardRouter);
app.use("/api/issues", issuesRouter);
app.use("/api", materialRouter);
app.use("/api", poRouter);
app.use("/api/sales", salesExtraRouter);

// GET /api/team/search?q=&crew=&days=14   (next N days)
app.get("/api/team/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  const crew = (req.query.crew || "").trim();
  const days = Math.max(1, Math.min(60, Number(req.query.days || 14)));

  try {
    const r = await pool.query(
      `
      SELECT v.task_id, v.name, v.window_start, v.window_end,
             v.customer_name, v.address, v.cust_contact_phone, v.resource_name, v.status
      FROM public.install_tasks_for_day v
      WHERE v.window_start >= now() - interval '1 day'
        AND v.window_start <  now() + ($1 || ' days')::interval
        AND ($2 = '' OR v.resource_name = $2)
        AND (
             $3 = ''
          OR  LOWER(COALESCE(v.customer_name,'')) LIKE LOWER('%' || $3 || '%')
          OR  LOWER(COALESCE(v.address,''))       LIKE LOWER('%' || $3 || '%')
          OR  LOWER(COALESCE(v.name,''))          LIKE LOWER('%' || $3 || '%')
        )
      ORDER BY v.window_start ASC
      `,
      [days, crew, q]
    );
    res.json(r.rows);
  } catch (e) {
    console.error("[TEAM SEARCH ERR]", e);
    res.status(500).json({ error:"db_error", detail:e.message });
  }
});

// --- page routes (mount ONCE, AFTER app is created) ---
registerBidsInline(app);
registerBidsCards(app);
registerSalesIntake(app);
registerAdminOptions(app);
registerSalesOnboarding(app);
registerSalesQuote(app);
registerQuoteAck(app);
registerPurchasingWorklist(app);
registerOpsDayBoard(app);
registerMyDayTeams(app);
registerCreateService(app);
registerAdminContent(app);  
registerQboRoutes(app);
registerLoginPage(app);
registerRegisterPage(app);
registerAdminUsersPage(app);
registerSalesHomePage(app);
registerCalendarPage(app);
registerSalesDetails(app);
registerAdminLeadTimes(app);
registerPurchasingPage(app);
registerAdminHub(app);
registerSchedulePage(app);
registerOpsDashboardPage(app);
registerSalesReview(app);
registerPurchasingDashboard(app);
registerGanttPage(app, pool);
registerTeamTaskPage(app);
registerJobHub(app, pool);
registerSalesConsole(app);
registerSalesReschedule(app);
registerSalesServiceSchedule(app);
registerAdminInvites(app);
registerAcceptInvite(app);

// Legacy route redirect: /incomplete -> /ops-dashboard
app.get('/incomplete', (req, res) => res.redirect(302, '/ops-dashboard'));

// --- Dropdown key mapping ---
const dropdownKeyMap = {
  manufacturer: 'manufacturer',
  species: 'species',
  door_style: 'door_style',
  finish_color: 'finish_color',
  color: 'finish_color', // allow 'color' to map to 'finish_color'
  style: 'door_style',   // allow 'style' to map to 'door_style'
  // additional friendly aliases (non-breaking)
  finish: 'finish_color',
  paint: 'finish_color',
  paint_color: 'finish_color',
  stain_color: 'finish_color',
  wood: 'species',
  wood_species: 'species',
  brand: 'manufacturer',
  mfg: 'manufacturer',
  doorstyle: 'door_style',
  // add more aliases as needed
};

function mapDropdownKey(key) {
  key = String(key || '').trim();
  return dropdownKeyMap[key] || key;
}

app.get('/api/options/:key', async (req, res) => {
  const key = mapDropdownKey(req.params.key);
  try {
    const { rows } = await pool.query(
      `SELECT
         value        AS value_text,
         value        AS value,
         sort         AS sort_order,
         sort         AS sort,
         NULLIF((meta->>'num'),'')::numeric AS value_num,
         NULLIF((meta->>'num'),'')::numeric AS num
       FROM public.options_kv
       WHERE group_key = $1
       ORDER BY sort, value`,
      [key]
    );
    // Backward-compat output:
    // - default: wrapper object { options: [...] }
    // - flat: when ?flat=1 or ?wrap=0, return just the array
    const flat = String(req.query.flat || '') === '1' || String(req.query.wrap || '') === '0';
    if (flat) return res.json(rows);
    return res.json({ options: rows, rows, values: rows, count: rows.length });
  } catch (e) {
    console.error('[OPTIONS GET ERR]', e);
    res.status(500).json({ error: 'db_error', detail: e.message || String(e) });
  }
});

app.put('/api/options/:key', express.json(), async (req, res) => {
  const key = mapDropdownKey(req.params.key);
  const values = Array.isArray(req.body?.values) ? req.body.values : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM public.options_kv WHERE group_key = $1`, [key]);
    for (const v of values) {
      const valueText = String(v.value_text ?? v.value ?? '').trim();
      const sortOrder = Number(v.sort_order ?? v.sort ?? 0) || 0;
      const numRaw = v.value_num ?? v.num;
      const hasNum = numRaw !== undefined && numRaw !== null && numRaw !== '' && !Number.isNaN(Number(numRaw));
      const metaJson = hasNum ? JSON.stringify({ num: Number(numRaw) }) : '{}';

      await client.query(
        `INSERT INTO public.options_kv (group_key, value, sort, active, meta)
         VALUES ($1, $2, $3, TRUE, COALESCE($4::jsonb, '{}'::jsonb))`,
        [key, valueText, sortOrder, metaJson]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: values.length });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'save_failed', detail: e.message || String(e) });
  } finally { client.release(); }
});

// Bulk options: GET /api/options/bulk?keys=manufacturer,species,door_style,finish_color
// Returns a map of key -> array of options (each option has dual field names)
app.get('/api/options/bulk', async (req, res) => {
  try {
    const rawKeys = String(req.query.keys || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!rawKeys.length) {
      return res.status(400).json({ error: 'missing_keys', detail: 'Provide ?keys=comma,separated,groups' });
    }

    const out = {};
    for (const raw of rawKeys) {
      const key = mapDropdownKey(raw);
      const { rows } = await pool.query(
        `SELECT
           value        AS value_text,
           value        AS value,
           sort         AS sort_order,
           sort         AS sort,
           NULLIF((meta->>'num'),'')::numeric AS value_num,
           NULLIF((meta->>'num'),'')::numeric AS num
         FROM public.options_kv
         WHERE group_key = $1
         ORDER BY sort, value`,
        [key]
      );
      // Keep both original and canonical keys in the map for compatibility
      out[raw] = rows;
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = rows;
    }
    return res.json({ options: out, count: Object.keys(out).length });
  } catch (e) {
    console.error('[OPTIONS BULK ERR]', e);
    res.status(500).json({ error: 'db_error', detail: e.message || String(e) });
  }
});

// List distinct option groups that have been seeded
// GET /api/options/groups -> { groups: ["manufacturer", ...], count }
app.get('/api/options/groups', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT group_key FROM public.options_kv ORDER BY group_key`
    );
    res.json({ groups: rows.map(r => r.group_key), count: rows.length });
  } catch (e) {
    console.error('[OPTIONS GROUPS ERR]', e);
    res.status(500).json({ error: 'db_error', detail: e.message || String(e) });
  }
});

// --- Purchasing hierarchy & hub APIs ---
// GET /api/builders
app.get('/api/builders', async (_req, res) => {
  try {
    const r = await pool.query(`SELECT id, name FROM public.builders ORDER BY name`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'db_error', detail:e.message }); }
});

// GET /api/builders/:id/communities
app.get('/api/builders/:id/communities', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error:'bad_builder_id' });
  try {
    const r = await pool.query(`SELECT id, name FROM public.communities WHERE builder_id=$1 ORDER BY name`, [id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error:'db_error', detail:e.message }); }
});

// GET /api/hierarchy/jobs?builder_id&community_id&q
app.get('/api/hierarchy/jobs', async (req, res) => {
  try {
    const { builder_id, community_id } = req.query;
    const q = String(req.query.q || '').trim();
    const where = [];
    const params = [];
    if (builder_id) { params.push(Number(builder_id)); where.push(`j.builder_id = $${params.length}`); }
    if (community_id) { params.push(Number(community_id)); where.push(`j.community_id = $${params.length}`); }
    if (q) { params.push('%' + q + '%'); where.push(`(j.customer_name ILIKE $${params.length} OR j.project_name ILIKE $${params.length})`); }
    const sql = `
      SELECT j.id, j.customer_name, j.project_name, j.builder_id, j.community_id
        FROM public.jobs j
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY j.id DESC
       LIMIT 200`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error:'db_error', detail:e.message });
  }
});

// GET /api/jobs/:id/purchasing-hub -> bundle job, pos, receipts, docs
app.get('/api/jobs/:id/purchasing-hub', async (req, res) => {
  const jobId = Number(req.params.id);
  if (!jobId) return res.status(400).json({ error:'bad_job_id' });
  try {
    const jobQ = await pool.query(`SELECT id, customer_name, project_name, builder_id, community_id FROM public.jobs WHERE id=$1`, [jobId]);
    if (!jobQ.rowCount) return res.status(404).json({ error:'job_not_found' });

    const poQ = await pool.query(`
      SELECT po.id, po.job_id, po.vendor, po.brand, po.category, po.order_no,
             po.status, po.expected_date, po.placed_at,
             COALESCE((SELECT sum(COALESCE(i.qty_required,0)) FROM public.purchase_order_items i WHERE i.po_id = po.id),0) AS req,
             COALESCE((SELECT sum(COALESCE(i.qty_received,0)) FROM public.purchase_order_items i WHERE i.po_id = po.id),0) AS rec,
             COALESCE((SELECT count(*) FROM public.purchase_order_docs d WHERE d.po_id = po.id),0) AS doc_count
        FROM public.purchase_orders po
       WHERE po.job_id = $1
       ORDER BY po.id DESC
    `, [jobId]);

    const recQ = await pool.query(`
      SELECT r.id, r.po_item_id, r.qty_received, r.note, r.created_at,
             i.po_id, i.description
        FROM public.purchase_receipts r
        JOIN public.purchase_order_items i ON i.id = r.po_item_id
        JOIN public.purchase_orders po ON po.id = i.po_id
       WHERE po.job_id = $1
       ORDER BY r.created_at DESC
       LIMIT 200
    `, [jobId]);

    const docsQ = await pool.query(`
      SELECT id, po_id, job_id, bid_id, file_path AS url, file_name, kind, created_at
        FROM public.purchase_order_docs
       WHERE job_id = $1
       ORDER BY created_at DESC
    `, [jobId]);

    res.json({ job: jobQ.rows[0], pos: poQ.rows, receipts: recQ.rows, docs: docsQ.rows });
  } catch (e) {
    res.status(500).json({ error:'db_error', detail:e.message });
  }
});


// --- safe uploads dir ---
const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "tasks");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// --- helpers ---
function saveDataUrlToFile(dataUrl, destDir, baseName) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) return null;
  const mime = m[1];
  const buf = Buffer.from(m[2], "base64");
  const ext = mime.split("/")[1] || "bin";
  const fileName = `${baseName}.${ext}`;
  fs.mkdirSync(destDir, { recursive: true });
  const abs = path.join(destDir, fileName);
  fs.writeFileSync(abs, buf);
  return { abs, rel: abs.replace(process.cwd(), ""), fileName };
}

async function getJobMeta(client, jobId) {
  try {
    const j1 = await client.query(
      "SELECT customer_name FROM public.jobs WHERE id = $1 LIMIT 1",
      [jobId]
    );
    if (j1.rowCount) return { customer_name: j1.rows[0].customer_name };
  } catch {}
  try {
    const j2 = await client.query(
      "SELECT customer_name FROM public.install_jobs WHERE id = $1 LIMIT 1",
      [jobId]
    );
    if (j2.rowCount) return { customer_name: j2.rows[0].customer_name };
  } catch {}
  return {};
}

async function postTaskCompleteToSlack({ taskId, note, photoLinks = [], meta = {} }) {
  const blocks = [
    { type: "header", text: { type: "plain_text", text: `âœ… Task ${taskId} completed`, emoji: true } },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Customer:*\n${meta.customer_name || "â€”"}` },
        { type: "mrkdwn", text: `*When:*\n${new Date().toLocaleString()}` },
        { type: "mrkdwn", text: `*Resource:*\n${meta.resource_name || "â€”"}` },
        { type: "mrkdwn", text: `*Duration:*\n${meta.duration_min ? meta.duration_min + " min" : "â€”"}` },
      ].filter(Boolean),
    },
  ];
  if (note) blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Note:*\n${note}` } });
  if (photoLinks.length) {
    const list = photoLinks.slice(0, 10).map((u, i) => `â€¢ <${u}|photo ${i + 1}>`).join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Photos (${photoLinks.length}):*\n${list}` } });
  }
  await slack.chat.postMessage({ channel: SLACK_CHANNEL, text: `Task ${taskId} completed`, blocks });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- health ---
app.get("/health", (_req, res) => res.json({ ok: true }));

// GET /api/install-jobs  -> recent install job ids
app.get("/api/install-jobs", async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT j.id
      FROM public.install_jobs j
      ORDER BY j.id DESC
      LIMIT 100
    `);
    // Return a simple array of { id }
    res.json(q.rows.map(r => ({ id: r.id })));
  } catch (e) {
    console.error("[INSTALL-JOBS LIST ERR]", e);
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

// --- test/demo pages you already had ---
app.get("/myday-test.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "myday-test.html"));
});

app.get('/api/me', (_req, res) => {
  // TODO: replace with real authâ€™d user profile
  res.json({
    name: process.env.DEMO_SALES_NAME || 'Sales User',
    email: process.env.DEMO_SALES_EMAIL || 'sales@cabinetsexpress.com',
    phone: process.env.DEMO_SALES_PHONE || '(801) 617-1133',
    profile_complete: true
  });
});

// Inline "My Day" page (DOM-built; includes Directions, Call, Arrived, Complete-with-note modal)
app.get("/myday-inline", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My Day Inline</title>
    <style>
      body { font-family: system-ui, Arial, sans-serif; padding: 16px; }
      .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 10px 0; }
      .muted { color: #666; font-size: 12px; }
      label,input,button,select { font-size:14px; }
      input,select { padding:6px 8px; }
      button { padding: 6px 10px; border-radius: 8px; border: 1px solid #ccc; background:#f7f7f7; cursor:pointer; }
      button:hover { background:#eee; }
      #noteModal { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: grid; place-items: center; padding: 16px; z-index: 9999; }
      #noteModal[hidden] { display:none; }
      .sheet { background:#fff; border-radius:12px; max-width:420px; width:100%; padding:16px; }
    </style>
  </head>
  <body>
    <h2>My Day (inline test)</h2>

    <div style="display:flex; gap:8px; align-items:center; margin:8px 0; flex-wrap:wrap;">
      <label for="date">Date:</label>
      <input id="date" type="date"/>

      <label for="crew">Crew:</label>
      <select id="crew">
        <option>Install Team A</option>
        <option>Install Team B</option>
      </select>

      <label for="origLat">From (shop):</label>
      <input id="origLat" type="number" step="any" placeholder="lat" style="width:9rem"/>
      <input id="origLng" type="number" step="any" placeholder="lng" style="width:9rem"/>

      <button id="btnHere" type="button">Use my location</button>
      <button id="btnLoad" type="button">Load</button>
    </div>

    <div id="status">Pick a date and press Load.</div>
    <div id="list"></div>

    <!-- Note modal -->
    <div id="noteModal" hidden>
      <div class="sheet">
        <div style="font-weight:600; margin-bottom:8px;">Complete with note</div>
        <textarea id="noteInput" rows="4" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:8px;" placeholder="Optional noteâ€¦"></textarea>

        <!-- multi-photo input -->
        <input id="photoInput" type="file" accept="image/*" multiple style="margin-top:10px" />
        <div id="photoHint" class="muted" style="margin-top:4px;font-size:12px;">
          You can attach up to 15 photos (total &lt; 30 MB).
        </div>

        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
          <button id="noteCancelBtn" type="button">Cancel</button>
          <button id="noteSaveBtn"   type="button">Save</button>
        </div>
      </div>
    </div>

    <script>
      // -------- helpers
      function ymd(d){var y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
      (function preset(){var x=document.getElementById('date');var d=new Date();d.setDate(d.getDate()+1);x.value=ymd(d);})();

      function statusBadge(s){
        var color = (s==='complete') ? '#16a34a' : (s==='in_progress') ? '#2563eb' : '#6b7280';
        return '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:'+color+';color:#fff;font-size:12px">'+ s.replace('_',' ') +'</span>';
      }
      function mapUrl(address){ if(!address) return null; return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address); }
      function telHref(num){ if(!num) return null; return 'tel:'+String(num).replace(/[^\\d+]/g,''); }

      function flash(msg) {
        const n = document.createElement('div');
        n.textContent = msg;
        Object.assign(n.style, {
          position:'fixed', left:'50%', top:'16px', transform:'translateX(-50%)',
          background:'#111', color:'#fff', padding:'8px 12px', borderRadius:'9999px',
          fontSize:'13px', zIndex:99999, boxShadow:'0 8px 24px rgba(0,0,0,.15)', opacity:'0.98'
        });
        document.body.appendChild(n);
        setTimeout(()=>n.remove(), 1400);
      }

      function readFilesAsDataURLs(fileList, {maxFiles=15, maxTotalBytes=30*1024*1024} = {}) {
        const files = Array.from(fileList || []).slice(0, maxFiles);
        const total = files.reduce((s,f)=>s+f.size,0);
        if (total > maxTotalBytes) throw new Error("Photos > 30 MB total");
        return Promise.all(files.map(f => new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve({ name: f.name, type: f.type, size: f.size, data: r.result });
          r.onerror = reject;
          r.readAsDataURL(f);
        })));
      }

      async function arrived(id, el){
        try{
          if(el){ el.disabled=true; setTimeout(function(){ el.disabled=false; }, 2000); }
          var r = await fetch('/api/tasks/'+id+'/arrived', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ note:'Arrived (tap)', when:new Date().toISOString() })
          });
          await r.json();
          var wrap = document.getElementById('status-'+id);
          if (wrap) wrap.innerHTML = statusBadge('in_progress');
          flash('Arrived âœ“');
        }catch(e){ flash('Arrived failed'); }
      }

      // --- Shop origin (always start from here)
      const SHOP_ADDRESS = "3943 S 500 W, Salt Lake City, UT";

      // Cache helpers
      function saveOrigin(lat, lng){
        localStorage.setItem('origin_lat', String(lat ?? ''));
        localStorage.setItem('origin_lng', String(lng ?? ''));
      }
      function loadOrigin(){
        const lat = parseFloat(localStorage.getItem('origin_lat') || '');
        const lng = parseFloat(localStorage.getItem('origin_lng') || '');
        return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
      }

      // One-time geocode of the shop address (OpenStreetMap Nominatim)
      async function geocodeShopOrigin(){
        try {
          const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(SHOP_ADDRESS);
          const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
          const data = await res.json();
          if (Array.isArray(data) && data[0]) {
            const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              saveOrigin(lat, lng);
              return { lat, lng };
            }
          }
        } catch (_) {}
        return null;
      }

      // Prefill the origin inputs
      async function initOriginBoxes(){
        const o = loadOrigin();
        const latEl = document.getElementById('origLat');
        const lngEl = document.getElementById('origLng');

        if (o) {
          latEl.value = String(o.lat);
          lngEl.value = String(o.lng);
          return;
        }
        const g = await geocodeShopOrigin();
        if (g) { latEl.value = String(g.lat); lngEl.value = String(g.lng); }
      }

      function haversineKm(a, b){
        if(!a || !b) return null;
        const R=6371, toRad = d => d*Math.PI/180;
        const dLat = toRad(b.lat-a.lat), dLng = toRad(b.lng-a.lng);
        const s1 = Math.sin(dLat/2), s2 = Math.sin(dLng/2);
        const aa = s1*s1 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
        return 2*R*Math.asin(Math.sqrt(aa));
      }
      function minutesFromKm(km, kmh=48.3){ if(!km) return null; return (km/kmh)*60; } // ~30 mph

      // modal state
      var _modalTaskId = null;
      function openCompleteModal(taskId){
        _modalTaskId = taskId;
        var m=document.getElementById('noteModal'), i=document.getElementById('noteInput');
        i.value=''; m.hidden=false; setTimeout(function(){ i.focus(); },0);
      }
      function closeCompleteModal(){ document.getElementById('noteModal').hidden=true; _modalTaskId=null; }

      async function submitCompleteModal() {
        if (!_modalTaskId) return closeCompleteModal();

        const note  = document.getElementById('noteInput').value || '';
        const files = document.getElementById('photoInput')?.files || [];

        try {
          if (files.length > 15) { flash('You can upload up to 15 photos only.'); return; }
          const photos = await readFilesAsDataURLs(files); // enforces 30 MB

          await fetch('/api/tasks/' + _modalTaskId + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note, photos, when: new Date().toISOString() })
          });

          // TODO: also notify ops (#ops-status) from backend endpoint
          // await fetch('/api/ops/notify', { ... });

          const wrap = document.getElementById('status' + _modalTaskId);
          if (wrap) wrap.innerHTML = statusBadge('complete');
          flash('Completed âœ“');
        } catch (e) {
          flash((e && e.message) ? e.message : 'Complete failed');
        } finally {
          closeCompleteModal();
        }
      }

      document.getElementById('photoInput').addEventListener('change', (e) => {
        const n = (e.target.files || []).length;
        document.getElementById('photoHint').textContent = n
          ? (n + ' photo' + (n>1?'s':'') + ' selected')
          : 'You can attach up to 15 photos (total < 30 MB).';
      });

  document.getElementById('noteCancelBtn').addEventListener('click', closeCompleteModal);
  document.getElementById('noteSaveBtn').addEventListener('click', submitCompleteModal);

      document.getElementById('btnHere').addEventListener('click', () => {
        if (!navigator.geolocation) return alert('Geolocation not available');
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { latitude, longitude } = pos.coords;
            document.getElementById('origLat').value = String(latitude.toFixed(6));
            document.getElementById('origLng').value = String(longitude.toFixed(6));
            saveOrigin(latitude, longitude);
          },
          err => alert('Location error: ' + err.message),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });

      function buildCard(r){
        var card=document.createElement('div'); card.className='card';
        card.style.cursor = 'pointer';
        card.addEventListener('click', function(e){
          // Don't open summary if clicking a button
          if (e.target.tagName === 'BUTTON') return;
          if (window.openTaskSummary) window.openTaskSummary(r.task_id);
        });

        var head=document.createElement('div'); head.style.display='flex'; head.style.alignItems='center'; head.style.gap='8px';
        var title=document.createElement('strong'); title.textContent=r.customer_name||r.job_id;
        var badge=document.createElement('span'); badge.id='status-'+r.task_id; badge.innerHTML=statusBadge(r.status||'scheduled'); badge.style.marginLeft = '6px';

        head.appendChild(title); head.appendChild(badge);

        var name=document.createElement('div'); name.textContent=r.name||r.type;

        var time=document.createElement('div'); time.className='muted';
        time.textContent=new Date(r.window_start).toLocaleString()+' \\u2192 '+new Date(r.window_end).toLocaleString();

        var crew=document.createElement('div'); crew.className='muted'; crew.textContent=r.resource_name||'';

        var addr=document.createElement('div'); addr.textContent=r.address||'';

        var row=document.createElement('div'); row.style.marginTop='8px'; row.style.display='flex'; row.style.gap='8px'; row.style.flexWrap='wrap';
  var bArr=document.createElement('button'); bArr.textContent='Arrived'; bArr.addEventListener('click', function(ev){ arrived(r.task_id, ev.currentTarget); });
  var bCom=document.createElement('button'); bCom.textContent='Complete'; bCom.addEventListener('click', function(){ openCompleteModal(r.task_id); });
        row.appendChild(bArr); row.appendChild(bCom);

        (function () {
          const lat = parseFloat(document.getElementById('origLat').value || '');
          const lng = parseFloat(document.getElementById('origLng').value || '');
          const origin = (Number.isFinite(lat) && Number.isFinite(lng)) ? (saveOrigin(lat,lng), { lat, lng }) : loadOrigin();

          if (origin && Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
            const km = haversineKm(origin, { lat: r.lat, lng: r.lng });
            const min = minutesFromKm(km);
            if (km && min) {
              const travel = document.createElement('div');
              travel.className = 'muted';
              const miles = km * 0.621371;
              travel.textContent = 'â‰ˆ ' + Math.round(min) + ' min drive (' + miles.toFixed(1) + ' mi) from shop';
              card.appendChild(travel);
            }
          }
        })();

        if(r.address){
          var bDir=document.createElement('button'); bDir.textContent='Directions'; bDir.addEventListener('click', function(){ window.open(mapUrl(r.address),'_blank'); });
          row.appendChild(bDir);
        }
        if(r.cust_contact_phone){
          var bCall=document.createElement('button'); bCall.textContent='Call'; bCall.addEventListener('click', function(){ window.location.href=telHref(r.cust_contact_phone); });
          row.appendChild(bCall);
        }

        card.appendChild(head);
        card.appendChild(name);
        card.appendChild(time);
        card.appendChild(crew);
        card.appendChild(addr);
        card.appendChild(row);
        return card;
      }

      async function load(){
        var date=document.getElementById('date').value;
        var crew=document.getElementById('crew').value;
        if(!date){ alert('Pick a date'); return; }
        try{
          var res = await fetch('/api/myday?date='+date+'&crew='+encodeURIComponent(crew));
          if(!res.ok) throw new Error('HTTP '+res.status);
          var rows = await res.json();

          var statusEl=document.getElementById('status'); statusEl.textContent='Tasks loaded: '+rows.length;
          var list=document.getElementById('list'); list.innerHTML='';
          rows.forEach(function(r){ list.appendChild(buildCard(r)); });
        }catch(e){
          document.getElementById('status').textContent='Error: '+(e&&e.message||e);
          console.error(e);
        }
      }

      document.getElementById('btnLoad').addEventListener('click', load);
      document.addEventListener('DOMContentLoaded', initOriginBoxes);
    </script>
    <script src="/static/task-summary.js"></script>
  </body>
</html>`);
});

// Ops day view (DOM-built; no template-string escaping headaches)
app.get("/ops-inline", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ops â€“ Day View</title>
    <style>
        body { font-family: system-ui, Arial, sans-serif; padding: 16px; }
        .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 10px 0; }
        .badge {
          display: inline-block;
          margin-left: 6px;
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
          background: #6b7280; /* gray by default */
          color: #fff;
        }
        .badge.scheduled { background: #6b7280; }   /* gray */
        .badge.in_progress { background: #2563eb; } /* blue */
        .badge.complete { background: #16a34a; }    /* green */

        .muted { color: #666; font-size: 12px; }
        label,input,button,select { font-size:14px; }
        input,select { padding:6px 8px; }
        button { padding: 6px 10px; border-radius: 8px; border: 1px solid #ccc; background:#f7f7f7; cursor:pointer; }
        button:hover { background:#eee; }
        /* modal */
        #noteModal { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: grid; place-items: center; padding: 16px; z-index: 9999; }
        #noteModal[hidden] { display:none; }
        .sheet { background:#fff; border-radius:12px; max-width:420px; width:100%; padding:16px; }

        .availTrack { height:8px; background:#eee; border-radius:9999px; overflow:hidden; width:100%; display:block; }
        .availFill  { height:100%; background:#22c55e; }
        h3 { margin: 0; }
    </style>

</head>
<body>
  <h2>Ops â€“ Day View</h2>
  <div style="display:flex; gap:8px; align-items:center; margin:8px 0;">
    <label for="date">Date:</label>
    <input id="date" type="date"/>
    <button id="btnLoad">Load</button>
  </div>
  
  <div id="status" class="muted">Pick a date and press Load.</div>
  <div id="content"></div>
  
    <div id="opsToasts" style="
        position:fixed; right:16px; top:16px;
        display:flex; flex-direction:column; gap:8px;
        z-index:10000;"></div>

  <script>
    var defaultCapacity = 450;

    function ymd(d){var y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
    (function preset(){var x=document.getElementById('date');var d=new Date();d.setDate(d.getDate()+1);x.value=ymd(d);})();

    function mapUrl(address){ if(!address) return null; return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address); }
    function telHref(num){ if(!num) return null; return 'tel:'+String(num).replace(/[^\\d+]/g,''); }

    function flash(msg) {
      const tray = document.getElementById('opsToasts');
      const n = document.createElement('div');
      n.textContent = msg;
      Object.assign(n.style, {
        padding:'8px 12px', borderRadius:'10px', background:'#111',
        color:'#fff', fontSize:'13px', boxShadow:'0 8px 24px rgba(0,0,0,.15)'
      });
      (tray || document.body).appendChild(n);
      if (!tray) { // center fallback for pages without ops tray
        Object.assign(n.style, { position:'fixed', left:'50%', top:'16px', transform:'translateX(-50%)', zIndex:99999 });
      }
      setTimeout(()=>n.remove(), 1800);
    }

    function appendAvailabilityBar(containerEl, usedMin, capacityMin) {
      const pct = Math.max(0, Math.min(100, Math.round(100 * usedMin / capacityMin)));
      const track = document.createElement('div');
      track.className = 'availTrack';
      track.style.margin = '6px 0 10px';

      const fill = document.createElement('div');
      fill.className = 'availFill';
      fill.style.width = pct + '%';
      fill.style.background = pct < 60 ? '#22c55e' : pct < 90 ? '#f59e0b' : '#ef4444';

      track.appendChild(fill);
      containerEl.appendChild(track);
    }

    async function fetchJSON(url, opts){ const r = await fetch(url, opts||{}); if(!r.ok) throw new Error(url+' HTTP '+r.status); return r.json(); }

    async function fetchResources(){ return fetchJSON('/api/resources'); }

    function makeCapMap(resources){
      var m={}; resources.forEach(function(r){ m[r.name] = r.capacity_min_per_day || defaultCapacity; }); return m;
    }

    async function assign(taskId) {
        try {
            var sel = document.getElementById('sel-' + taskId);
            var rid = parseInt((sel && sel.value) || '0', 10);
            if (!rid) { flash('Pick a resource'); return; }
            var res = await fetch('/api/tasks/' + taskId + '/assign', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resource_id: rid })
            });
            if (!res.ok) { flash('Assign failed'); return; }
            flash('Assigned âœ“');
            load();
        } catch (e) {
            flash('Assign failed');
        }
    }

    async function setStatus(taskId, status) {
        try {
            await fetch('/api/tasks/' + taskId + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
            });
            flash((status === 'scheduled' ? 'Reset' : 'Status') + ' âœ“');
            load();
        } catch (e) {
            flash('Status change failed');
        }
    }

    function buildTaskRow(t, resources){
      var row = document.createElement('div'); row.className='row';

      var title = document.createElement('div'); title.className='row-title';
      var strong = document.createElement('strong'); strong.textContent = t.customer_name || t.job_id;
      var badge = document.createElement('span');
        badge.className = 'badge ' + t.status;
        badge.textContent = t.status.replace('_',' ');

      title.appendChild(strong); title.appendChild(badge);

      var time = document.createElement('div'); time.className='muted';
      time.textContent = new Date(t.window_start).toLocaleTimeString() + ' \u2192 ' + new Date(t.window_end).toLocaleTimeString();

      var name = document.createElement('div'); name.textContent = t.name || t.type;

      var addr = document.createElement('div'); addr.className='muted'; addr.textContent = t.address || '';

      var ctl = document.createElement('div'); ctl.className='row-controls';
      // select
      var sel = document.createElement('select'); sel.id = 'sel-'+t.task_id;
      resources.forEach(function(r){
        var opt = document.createElement('option');
        opt.value = r.id; opt.textContent = r.name;
        if(r.name === t.resource_name) opt.selected = true;
        sel.appendChild(opt);
      });
      // assign btn
      var btnAssign = document.createElement('button'); btnAssign.textContent='Assign';
  btnAssign.addEventListener('click', function(){ assign(t.task_id); });
      // reset btn
      var btnReset = document.createElement('button');
        btnReset.textContent = 'Reset to scheduled';
  btnReset.addEventListener('click', function(){ setStatus(t.task_id, 'scheduled'); });
        ctl.appendChild(btnReset);
      // directions
      if(t.address){
        var btnDir = document.createElement('button'); btnDir.textContent='Directions';
  btnDir.addEventListener('click', function(){ window.open(mapUrl(t.address),'_blank'); });
        ctl.appendChild(btnDir);
      }
      // call
      if(t.cust_contact_phone){
        var btnCall = document.createElement('button'); btnCall.textContent='Call';
  btnCall.addEventListener('click', function(){ window.location.href = telHref(t.cust_contact_phone); });
        ctl.appendChild(btnCall);
      }

      ctl.insertBefore(sel, ctl.firstChild);
      ctl.insertBefore(btnAssign, ctl.children[1] || null);

      var btnComplete = document.createElement('button');
        btnComplete.textContent = 'Complete';
  btnComplete.addEventListener('click', function(){ completeWithNote(t.task_id); });
        ctl.appendChild(btnComplete);

      row.appendChild(title);
      row.appendChild(time);
      row.appendChild(name);
      row.appendChild(addr);
      row.appendChild(ctl);
      return row;
    }

    async function load(){
      var date = document.getElementById('date').value;
      if(!date){ alert('Pick a date'); return; }
      var status = document.getElementById('status'); status.textContent='Loadingâ€¦';
      var content = document.getElementById('content'); content.innerHTML='';

      try{
        var rows = await fetchJSON('/api/schedule?date='+date);
        var resources = await fetchResources();
        var capMap = makeCapMap(resources);

        // group by resource_name
        var groups = {}; rows.forEach(function(r){ var k=r.resource_name||'Unassigned'; (groups[k]=groups[k]||[]).push(r); });

        Object.keys(groups).forEach(function(name){
          var tasks = groups[name];
          var total = tasks.reduce(function(s,t){ return s + (t.duration_min||0); }, 0);
          var cap = (capMap[name]!=null?capMap[name]:defaultCapacity);
          var pct = Math.min(100, Math.round((total/cap)*100));
          var over = total > cap;

          var group = document.createElement('div'); group.className='group';

          var header = document.createElement('div');
          header.style.display='flex';
          header.style.justifyContent='space-between';
          header.style.alignItems='center';

          var h3 = document.createElement('h3'); h3.textContent = name;
          var util = document.createElement('div'); util.className='muted';
          util.textContent = Math.round(total)+' / '+cap+' min ('+pct+'%)';

          header.appendChild(h3);
          header.appendChild(util);

          var list = document.createElement('div');
          tasks.forEach(function(t){ list.appendChild(buildTaskRow(t, resources)); });

          group.appendChild(header);
          appendAvailabilityBar(group, total, cap); 
          group.appendChild(list);
          content.appendChild(group);
        });

        status.textContent = 'Loaded ' + rows.length + ' tasks.';
      }catch(e){
        status.textContent = 'Error: '+e.message;
        console.error(e);
      }
    }

    async function completeWithNote(taskId){
        const note = prompt("Add a completion note (optional):") || "";
        try {
            const res = await fetch('/api/tasks/' + taskId + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note, when: new Date().toISOString() })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            flash('Completed âœ“');
            load();
        } catch (e) {
            flash('Complete failed');
        }
    }

    document.getElementById('btnLoad').addEventListener('click', load);
  </script>
</body>
</html>`);
});

// Export helper for use in other modules
export { saveDataUrlToFile };

// Export app for testing and external usage
export default app;

// Only start the server when not running tests
if (process.env.NODE_ENV !== "test") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

