// pages/calendar.js
import { requireRolePage } from "../routes/auth.js";

export default function registerCalendarPage(app){
  app.get("/calendar", requireRolePage(["admin","ops","sales"]), (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Schedule Calendar</title>
  <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.css" rel="stylesheet"/>
  <link rel="stylesheet" href="/static/appbar.css">
  <style>
    /* match sales-home look */
    body{margin:0;background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto}
    .wrap{max-width:1200px;margin:0 auto;padding:18px}
    h1{font-size:24px;margin:0 0 12px}
    .panel{background:#111318;border:1px solid #212432;border-radius:14px;padding:12px 14px;margin:12px 0}
    .row{display:flex;gap:8px;align-items:center}
    .btn{padding:6px 10px;border-radius:10px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;cursor:pointer}
    .btn:hover{background:#222a44}
    .muted{color:#9aa4b2;font-size:12px}

    /* pills/colors copied from salesHome */
    .pill{display:inline-block;padding:2px 6px;border-radius:9999px;font-size:11px;color:#fff}
    .p-mfg{background:#3b82f6}
    .p-paint{background:#8b5cf6}
    .p-asm{background:#f59e0b}
    .p-del{background:#14b8a6}
    .p-inst{background:#22c55e}
    .p-svc{background:#ef4444}

    /* FullCalendar dark border harmony */
    #calendar{background:#111318;border:1px solid #212432;border-radius:14px;padding:10px}
    .fc .fc-button{background:#1a2033;border:1px solid #2a2f3f;color:#eef2ff}
    .fc-theme-standard .fc-scrollgrid{border-color:#212432}
    .fc-theme-standard td,.fc-theme-standard th{border-color:#212432}
  </style>
</head>
<body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>

<div class="wrap">
  <h1>Schedule Calendar</h1>

  <div class="panel" style="display:flex;justify-content:space-between;align-items:center">
    <div class="row">
      <button class="btn" id="calPrev">‹</button>
      <div id="calRange" class="muted"></div>
      <button class="btn" id="calNext">›</button>
    </div>
    <div class="row">
      <select id="calFilter">
        <option value="scheduled" selected>All scheduled</option>
        <option value="mine">My jobs</option>
        <option value="projects">All projects</option>
      </select>
    </div>
  </div>

  <div id="calendar" class="panel"></div>

  <div class="muted" style="margin-top:6px">
    Legend:
    <span class="pill p-mfg">Manufacturing</span>
    <span class="pill p-paint">Paint</span>
    <span class="pill p-asm">Assembly</span>
    <span class="pill p-del">Delivery</span>
    <span class="pill p-inst">Install</span>
    <span class="pill p-svc">Service</span>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js"></script>
<script src="/static/task-summary.js"></script>
<script src="/static/calendar.js"></script>
</body>
</html>`);
  });
}
