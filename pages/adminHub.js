// pages/adminHub.js
import { requireRolePage } from "../routes/auth.js";

export default function registerAdminHub(app){
  app.get("/admin", requireRolePage(["admin"]), (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.14/index.global.min.css">
<link rel="stylesheet" href="/static/appbar.css">
<style>
  body{margin:0;background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto}
  .wrap{max-width:1200px;margin:0 auto;padding:18px}
  h1{font-size:22px;margin:0 0 8px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:10px 0 16px}
  .tile{display:flex;gap:10px;align-items:center;padding:14px;border:1px solid #212432;border-radius:12px;color:#eef2ff;background:#111318;text-decoration:none}
  .tile:hover{background:#1a2033}
  .panel{background:#111318;border:1px solid #212432;border-radius:14px;padding:12px;margin:12px 0}
  .muted{color:#9aa4b2;font-size:12px}

  /* Compact calendar look */
  #miniCal{background:#0f1220;border:1px solid #212432;border-radius:12px;padding:8px}
  .fc .fc-toolbar-title{font-size:16px}
  .fc .fc-button{background:#1a2033;border-color:#2a2f3f;color:#eef2ff}
  .fc .fc-daygrid-day, .fc .fc-timegrid-slot{border-color:#1c2233}
  .fc-theme-standard .fc-scrollgrid{border-color:#1c2233}
  .fc .fc-timegrid-slot-label{color:#9aa4b2}
  .fc .fc-col-header-cell-cushion{color:#9aa4b2}
</style>
</head>
<body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.14/index.global.min.js"></script>

<div class="wrap">
  <h1>Admin</h1>

  <!-- quick tiles -->
  <div class="tiles">
    <a class="tile" href="/calendar">🗓️ <div><b>Calendar</b><div class="muted">Drag/drop install tasks</div></div></a>
    <a class="tile" href="/schedule">📅 <div><b>Schedule</b><div class="muted">Create & move tasks</div></div></a>
    <a class="tile" href="/gantt">📊 <div><b>Job Gantt</b><div class="muted">Phase timeline & auto-schedule</div></div></a>
    <a class="tile" href="/ops-day-board">📋 <div><b>Ops Day Board</b><div class="muted">Daily task management</div></div></a>
  <a class="tile" href="/ops-dashboard">⚠️ <div><b>Ops-Dashboard</b><div class="muted">Missing or defective items</div></div></a>
    <a class="tile" href="/purchasing">📦 <div><b>Purchasing</b><div class="muted">Worklist / PO tracking</div></div></a>
    <a class="tile" href="/lead-times">⏱️ <div><b>Lead Times</b><div class="muted">Manufacturer days</div></div></a>
    <a class="tile" href="/admin/options">⚙️ <div><b>Options</b><div class="muted">Dropdown manager</div></div></a>
    <a class="tile" href="/admin-content">📝 <div><b>Content</b><div class="muted">Payment terms & disclaimers</div></div></a>
      <a class="tile" href="/admin/users">👤 <div><b>Users</b><div class="muted">Manage user roles & permissions</div></div></a>
      <a class="tile" href="/admin/invitations">✉️ <div><b>Invitations</b><div class="muted">Invite employees to join</div></div></a>
  </div>

  <!-- embedded draggable calendar -->
  <div class="panel">
    <div id="miniCal"></div>
    <div class="muted" style="margin-top:6px">Tip: Click a day title to open the full Calendar.</div>
  </div>
</div>

<script>
// Color map for event types
const TYPE_COLOR = {
  manufacturing: '#3b82f6',
  paint:         '#8b5cf6',
  assembly:      '#f59e0b',
  delivery:      '#14b8a6',
  install:       '#22c55e',
  service:       '#ef4444'
};
function colorFor(ev){
  const t = (ev.extendedProps?.type || '').toLowerCase();
  if (t.includes('mfg')) return TYPE_COLOR.manufacturing;
  if (t.includes('paint')) return TYPE_COLOR.paint;
  if (t.includes('asm') || t.includes('assembly')) return TYPE_COLOR.assembly;
  if (t.includes('deliv')) return TYPE_COLOR.delivery;
  if (t.includes('svc') || t.includes('service')) return TYPE_COLOR.service;
  return TYPE_COLOR.install;
}

(function(){
  const el = document.getElementById('miniCal');

  const calendar = new FullCalendar.Calendar(el, {
    initialView: 'timeGridWeek',     // compact week view
    height: 600,
    nowIndicator: true,
    editable: true,                  // drag/resize enabled
    eventStartEditable: true,
    eventDurationEditable: true,
    slotMinTime: '07:00:00',
    slotMaxTime: '19:00:00',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'timeGridWeek,dayGridMonth' },

    // fetch events from your API
    events: async (info, success, failure) => {
      try {
        const url = '/api/calendar/events'
          + '?start=' + encodeURIComponent(info.startStr)
          + '&end='   + encodeURIComponent(info.endStr)
          + '&filter=scheduled';
        const r = await fetch(url);
        const data = await r.json();
        success(data.events || []);
      } catch (e) { failure(e); }
    },

    // color events by type
    eventDidMount: (info) => {
      const c = colorFor(info.event);
      info.el.style.backgroundColor = c;
      info.el.style.borderColor = c;
      info.el.style.color = '#ffffff';
    },

    // drag to new time/day
    eventDrop: async (info) => {
      try {
        await fetch('/api/calendar/events/' + info.event.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: info.event.start?.toISOString(),
            end:   info.event.end?.toISOString() || info.event.start?.toISOString()
          })
        });
      } catch (_) { info.revert(); }
    },

    // resize duration
    eventResize: async (info) => {
      try {
        await fetch('/api/calendar/events/' + info.event.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: info.event.start?.toISOString(),
            end:   info.event.end?.toISOString() || info.event.start?.toISOString()
          })
        });
      } catch (_) { info.revert(); }
    },

    // open full calendar on day header click
    datesSet: () => {
      // wire day header links to /calendar with the same week anchor
      Array.from(el.querySelectorAll('.fc-col-header-cell a, .fc-daygrid-day-number'))
        .forEach(a => a.addEventListener('click', (ev) => {
          const dateAttr = ev.currentTarget.getAttribute('data-navlink');
          if (!dateAttr) return;
          const d = new Date(dateAttr);
          const y = d.toISOString().slice(0,10);
          window.location.href = '/calendar?d=' + encodeURIComponent(y) + '&v=timeGridWeek';
          ev.preventDefault();
        }, { once:true }));
    }
  });

  calendar.render();
})();
</script>
</body></html>`);
  });
}
