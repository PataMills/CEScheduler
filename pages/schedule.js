// pages/schedule.js
import { requireRolePage } from "../routes/auth.js";

export default function registerSchedulePage(app){
  app.get("/schedule", requireRolePage(["admin","ops"]), (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Schedule</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.14/index.global.min.css">
<link rel="stylesheet" href="/static/appbar.css">
<style>
  body{margin:0;background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto}
  .wrap{max-width:1200px;margin:0 auto;padding:18px}
  .panel{background:#111318;border:1px solid #212432;border-radius:14px;padding:12px;margin:12px 0}
  .row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .btn{padding:8px 12px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;border-radius:10px;cursor:pointer}
  #cal{background:#0f1220;border:1px solid #212432;border-radius:12px;padding:8px}
  .muted{color:#9aa4b2;font-size:12px}
  
  /* event colors — match Team Hub palette */
  .fc .ev-manufacturing { background:#3b82f6 !important; border-color:#3b82f6 !important; }
  .fc .ev-paint         { background:#8b5cf6 !important; border-color:#8b5cf6 !important; }
  .fc .ev-assembly      { background:#f59e0b !important; border-color:#f59e0b !important; }
  .fc .ev-delivery      { background:#10b981 !important; border-color:#10b981 !important; }
  .fc .ev-install       { background:#22c55e !important; border-color:#22c55e !important; }
  .fc .ev-service       { background:#ef4444 !important; border-color:#ef4444 !important; }
  
  /* status badges inside event */
  .fc .badge { display:inline-block; padding:0 6px; border-radius:999px; font-size:10px; font-weight:600; margin-left:6px; }
  .fc .badge.scheduled   { background:#1f2937; color:#e5e7eb; border:1px solid #374151; }
  .fc .badge.en_route    { background:#1e3a8a; color:#dbeafe; border:1px solid #3b82f6; }
  .fc .badge.in_progress { background:#1d4ed8; color:#e5e7eb; border:1px solid #3b82f6; }
  .fc .badge.wip         { background:#92400e; color:#fde68a; border:1px solid #f59e0b; }
  .fc .badge.complete    { background:#065f46; color:#bbf7d0; border:1px solid #10b981; }
  .fc .badge.ready       { background:#064e3b; color:#a7f3d0; border:1px solid #10b981; }
  
  /* optional: colored left border */
  .fc-event { border-left: 4px solid rgba(255,255,255,0.2) !important; }
  .fc .ev-manufacturing { border-left-color:#3b82f6 !important; }
  .fc .ev-paint         { border-left-color:#8b5cf6 !important; }
  .fc .ev-assembly      { border-left-color:#f59e0b !important; }
  .fc .ev-delivery      { border-left-color:#10b981 !important; }
  .fc .ev-install       { border-left-color:#22c55e !important; }
  .fc .ev-service       { border-left-color:#ef4444 !important; }
  
  /* modal */
  #modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:grid;place-items:center;padding:18px}
  #modal[hidden]{display:none}
  .sheet{background:#0f1220;border:1px solid #212432;border-radius:12px;padding:16px;max-width:720px;width:100%;box-sizing:border-box}
  label{font-size:12px;color:#9aa4b2;display:block;margin-bottom:6px}
  input,select,textarea{width:100%;padding:8px 10px;border:1px solid #2a2f3f;border-radius:10px;background:#0f1220;color:#eef2ff}
  .hdr-btns .btn{white-space:nowrap}
</style>
</head>
<body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.14/index.global.min.js"></script>
<script src="/static/task-summary.js"></script>

<div class="wrap">
  <h2>Schedule</h2>

  <div class="panel">
    <div class="row" style="justify-content:space-between">
      <div class="row">
        <button class="btn" id="btnNew">+ New Task</button>
        <a class="btn" href="/calendar">Open Full Calendar</a>
        <a class="btn" href="/ops-day-board">Open Ops - Day View</a>
      </div>
      <div class="muted">Drag & drop to reschedule. Click an event to edit.</div>
    </div>
    
    <!-- Crew Filter -->
    <div style="display:flex; align-items:center; gap:10px; margin:8px 0 12px;">
      <label for="crewFilter" style="opacity:.8;">Crew / Resource:</label>
      <select id="crewFilter" style="background:#0f1320; color:#e9eefc; border:1px solid #222943; border-radius:8px; padding:6px 10px;">
        <option value="">All crews</option>
      </select>
    </div>

    <div id="cal"></div>
  </div>
</div>

<!-- modal -->
<div id="modal" hidden>
  <div class="sheet">
    <div class="row" style="justify-content:space-between;align-items:center">
      <strong id="mTitle" style="font-size:18px">New Task</strong>
      <div class="row hdr-btns" id="mHdrBtns" style="gap:8px">
        <button class="btn" id="mSeed" type="button" title="Seed common phases">Seed Phases</button>
        <button class="btn" id="mSummary" type="button" style="display:none" title="Open Task Summary">Summary</button>
        <button class="btn" id="mClose">✕</button>
      </div>
    </div>
    <div class="row">
      <div style="flex:1">
        <label>Type</label>
        <select id="mType">
          <option value="install">Install</option>
          <option value="service">Service</option>
          <option value="manufacturing">Manufacturing</option>
          <option value="assembly">Assembly</option>
          <option value="delivery">Delivery</option>
        </select>
      </div>
      <div style="flex:2">
        <label>Title</label>
        <input id="mName" placeholder="e.g., Install Cabinets (CC:)">
      </div>
    </div>
    <div class="row">
      <div style="flex:1;min-width:260px">
        <label>Crew / Resource</label>
        <select id="mResource" multiple size="6" style="min-width:260px;"></select>
        <div style="font-size:12px;opacity:.7;margin-top:4px;">Tip: Ctrl/Cmd-click to select multiple teams.</div>
      </div>
      <div style="flex:1;min-width:260px">
  <label>Job ID (optional)</label>
  <input id="mJob" list="jobList" placeholder="Search job or enter ID">
  <datalist id="jobList"></datalist>
  <div style="margin-top:6px"><button class="btn" id="mOpenBid" type="button" style="display:none">Open Bid</button></div>
      </div>
    </div>
    <div class="row">
      <div style="flex:1;min-width:300px">
        <label>Job Snapshot</label>
        <div id="jobSnapshot" class="muted" style="border:1px solid #2a2f3f;border-radius:10px;padding:10px;min-height:56px">No job selected</div>
      </div>
    </div>
    <div class="row">
  <div style="flex:1"><label>Start</label><input id="mStart" type="datetime-local"></div>
  <div style="flex:1"><label>Duration (minutes)</label><input id="mDur" type="number" min="0" step="5" value="90"></div>
</div>

<div class="row">
  <div style="flex:1">
    <label>Notes</label>
    <textarea id="mNotes" rows="3" style="width:100%;padding:8px 10px;border:1px solid #2a2f3f;border-radius:10px;background:#0f1220;color:#eef2ff"></textarea>
  </div>
</div>

<div class="row">
  <div style="flex:1">
    <label>Checklist</label>
    <div id="mChecklist"></div>
    <button class="btn" id="mAddItem" type="button">+ Add item</button>
  </div>
</div>

    <div class="row" style="justify-content:space-between;margin-top:12px">
      <button class="btn" id="mDelete" style="display:none">Delete</button>
      <div style="flex:1"></div>
      <button class="btn" id="mSave">Save</button>
    </div>
  </div>
</div>

<script>
(async function(){
  // Modal state and overlay strength
  let currentEditId = null;
  const modalEl = document.getElementById('modal');
  if (modalEl) {
    modalEl.style.zIndex = '9999';
    modalEl.style.backdropFilter = 'blur(2px)';
  }
  const $ = s => document.querySelector(s);
  const modal = $('#modal'), mTitle=$('#mTitle'), mType=$('#mType'), mName=$('#mName'),
    mRes=$('#mResource'), mJob=$('#mJob'), mStart=$('#mStart'),
    mSave=$('#mSave'), mDel=$('#mDelete'), mClose=$('#mClose'),
    mSummary=$('#mSummary'), mOpenBid=$('#mOpenBid');

  // Helpers: format a Date to input[type=datetime-local] value (local time)
  function pad2(n){ return String(n).padStart(2,'0'); }
  function toLocalInputValue(d){
    try{
      if (!(d instanceof Date) || isNaN(d)) return '';
      const y = d.getFullYear();
      const m = pad2(d.getMonth()+1);
      const day = pad2(d.getDate());
      const h = pad2(d.getHours());
      const min = pad2(d.getMinutes());
  return y + '-' + m + '-' + day + 'T' + h + ':' + min;
    }catch(_){ return ''; }
  }

  // Job search/autocomplete
  const jobList = document.getElementById('jobList');
  let jobSearchTimer;
  mJob.addEventListener('input', async () => {
    const v = mJob.value.trim();
    if (!v || /^\d+$/.test(v)) return; // numeric ID typed directly
    clearTimeout(jobSearchTimer);
    jobSearchTimer = setTimeout(async () => {
      const r = await fetch('/api/jobs/search?q=' + encodeURIComponent(v));
      const rows = await r.json();
      jobList.innerHTML = '';
      rows.forEach(j => {
        const opt = document.createElement('option');
        opt.value = (j.id + ' - ' + (j.customer_name || '') + (j.project_name ? ' - ' + j.project_name : '')).trim();
        jobList.appendChild(opt);
      });
    }, 250);
  });

  // Seed Phases handler
  document.getElementById('mSeed').onclick = async () => {
    // read job id first
    const jobId = parseInt((mJob.value||'').trim(), 10);
    if (!jobId) { alert('Enter/select a Job first'); return; }

    // simple phase group tag
    const group = 'JOB-' + jobId;

    // create 4 tasks chained: manufacturing -> assembly -> delivery -> install
    const baseStart = new Date(mStart.value || new Date());
    const resId = Number(mRes.value||0) || null;

    const phases = [
      { type:'manufacturing', name:'Manufacturing',  dur: 60*8,  offset: 0   },
      { type:'assembly',      name:'Assembly',       dur: 60*4,  offset: 1   },
      { type:'delivery',      name:'Deliver Order',  dur: 90,    offset: 2   },
      { type:'install',       name:'Install',        dur: 60*4,  offset: 3   }
    ];

    // build sequentially
    let lastId = null;
    for (const p of phases) {
      const start = new Date(baseStart);
      start.setDate(start.getDate() + p.offset);
      const payload = {
        job_id: jobId,
        type: p.type,
        name: p.name + ' (CC:)',
        resource_id: resId || 1,
        window_start: start.toISOString(),
        duration_min: p.dur,
        depends_on: lastId ? [lastId] : [],
        phase_group: group
      };
      const r = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await r.json(); if (data?.id) lastId = data.id;
    }

    calendar.refetchEvents();
    alert('Phases seeded ✓');
    modal.hidden = true;
  };

  // load crews/resources and populate both modal + filter
  const crewFilter = document.getElementById('crewFilter');
  const CREW_KEY = 'schedule_crew_filter';
  const savedCrew = localStorage.getItem(CREW_KEY) || '';

  async function loadResources(){
    try{
      const r = await fetch('/api/resources');
      const list = await r.json();
      const items = Array.isArray(list) ? list : (list.resources || []);
      const toName = (x) => (x && (x.name || x.resource_name || x.title || x.id || x)) + '';
      const unique = new Set();
      
      mRes.innerHTML = '';
      items.forEach(v=>{
        // Modal dropdown
        const o = document.createElement('option');
        o.value = v.id; 
        o.textContent = v.name || v.resource_name || v.id;
        mRes.appendChild(o);
        
        // Filter dropdown
        const name = toName(v).trim();
        if (name && !unique.has(name)) {
          unique.add(name);
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          crewFilter.appendChild(opt);
        }
      });
    }catch(e){
      console.warn('resources load failed', e);
    }
  }
  await loadResources();
  
  // Restore saved crew filter
  if (crewFilter) crewFilter.value = savedCrew;

  // --- Notes / Duration / Checklist wiring (no backticks) ---
var mNotes = document.getElementById('mNotes');
var mDur   = document.getElementById('mDur');
var mCL    = document.getElementById('mChecklist');
var mAddItemBtn = document.getElementById('mAddItem');
if (mAddItemBtn) mAddItemBtn.onclick = function(){ addCLItem('', false); };

function addCLItem(text, done){
  var row = document.createElement('div');
  row.className = 'row';

  var chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.style.width = 'auto';
  if (done) chk.checked = true;

  var txt = document.createElement('input');
  txt.type = 'text';
  txt.value = (text || '');
  txt.placeholder = 'Checklist item';
  txt.style.cssText = 'flex:1;padding:6px 8px;border:1px solid #2a2f3f;border-radius:8px;background:#0f1220;color:#eef2ff';

  var del = document.createElement('button');
  del.className = 'btn';
  del.type = 'button';
  del.textContent = '×';
  del.onclick = function(){ row.remove(); };

  row.appendChild(chk);
  row.appendChild(txt);
  row.appendChild(del);
  if (mCL) mCL.appendChild(row);
}

function readChecklist(){
  var out = [];
  if (!mCL) return out;
  var rows = mCL.children;
  for (var i=0; i<rows.length; i++){
    var row = rows[i];
    var chk = row.querySelector('input[type="checkbox"]');
    var txt = row.querySelector('input[type="text"]');
    var item = {
      text: ((txt && txt.value) || '').trim(),
      done: !!(chk && chk.checked)
    };
    if (item.text) out.push(item);
  }
  return out;
}

  async function openModal({title='New Task', task=null, startISO=null}={}){
    mTitle.textContent = title;
    modal.hidden = false;
    if (task) {
      currentEditId = task.id;
      mType.value = task.extendedProps?.type || 'install';
      mName.value = task.title || '';
      // Preselect teams by requesting summary (for full team list)
      try {
        const baseId = String(task.id).includes(':') ? String(task.id).split(':')[0] : String(task.id);
        const r = await fetch('/api/tasks/' + baseId + '/summary');
        if (r.ok) {
          const data = await r.json();
          const teams = Array.isArray(data?.teams) ? data.teams : [];
          const want = new Set(teams.map(t => String(t.resource_id)));
          for (const opt of mRes.options) { opt.selected = want.has(String(opt.value)); }
        }
      } catch {}
      mJob.value  = task.extendedProps?.job_id || '';
      if (task.startStr) {
        const dt = new Date(task.startStr);
        mStart.value = toLocalInputValue(dt);
      } else if (startISO) {
        const dt = startISO instanceof Date ? startISO : new Date(startISO);
        mStart.value = toLocalInputValue(dt);
      } else {
        mStart.value = toLocalInputValue(new Date());
      }
      mDur.value   = task.extendedProps?.duration_min || 90;
      mNotes.value = task.extendedProps?.notes || '';
      mCL.innerHTML = '';
      (task.extendedProps?.checklist || []).forEach(i => addCLItem(i.text, !!i.done));
      mDel.style.display = 'inline-block';
      mDel.onclick = async ()=>{ await fetch('/api/tasks/'+task.id,{method:'DELETE'}); calendar.refetchEvents(); modal.hidden=true; };
      if (mSummary) mSummary.style.display = 'inline-block';
      if (mOpenBid) mOpenBid.style.display = 'none';
      // pre-load snapshot for this job if present
      if (mJob && mJob.value) loadJobSnapshot(mJob.value);
    } else {
      currentEditId = null;
      mType.value = 'install'; mName.value = ''; mJob.value='';
      if (startISO) {
        const dt = startISO instanceof Date ? startISO : new Date(startISO);
        mStart.value = toLocalInputValue(dt);
      } else {
        mStart.value = toLocalInputValue(new Date());
      }
      mDur.value   = 90;
      mNotes.value = '';
      mCL.innerHTML = '';
      mDel.style.display = 'none';
      mDel.onclick = null;
      if (mSummary) mSummary.style.display = 'none';
      if (mOpenBid) mOpenBid.style.display = 'none';
    }
  }
  mClose.onclick = ()=> modal.hidden = true;

  // color map and type/status helpers
  const TYPE_COLOR = {
    manufacturing:'#3b82f6', paint:'#8b5cf6', assembly:'#f59e0b',
    delivery:'#14b8a6', install:'#22c55e', service:'#ef4444'
  };
  
  function typeKey(t) {
    t = String(t||'').toLowerCase();
    if (t.includes('manu') || t.includes('mfg')) return 'manufacturing';
    if (t.includes('paint')) return 'paint';
    if (t.includes('asm') || t.includes('assembly')) return 'assembly';
    if (t.includes('del') || t.includes('delivery')) return 'delivery';
    if (t.includes('inst') || t.includes('install')) return 'install';
    if (t.includes('svc') || t.includes('service')) return 'service';
    return 'install';
  }
  
  function statusKey(s) {
    s = String(s||'').toLowerCase();
    if (s === 'en_route' || s === 'on_the_way' || s === 'otw') return 'en_route';
    if (s === 'in_progress' || s === 'arrived') return 'in_progress';
    if (s === 'wip') return 'wip';
    if (s === 'complete' || s === 'completed') return 'complete';
    return 'scheduled';
  }
  
  function colorFor(ev){
    const t = (ev.extendedProps?.type || '').toLowerCase();
    if (t.includes('mfg')) return TYPE_COLOR.manufacturing;
    if (t.includes('paint')) return TYPE_COLOR.paint;
    if (t.includes('asm') || t.includes('assembly')) return TYPE_COLOR.assembly;
    if (t.includes('del')) return TYPE_COLOR.delivery;
    if (t.includes('svc') || t.includes('service')) return TYPE_COLOR.service;
    return TYPE_COLOR.install;
  }

  // Enhanced calendar with Week/Day/Month toggle and view persistence
  const LAST_VIEW_KEY = 'schedule_last_view';
  const lastView = localStorage.getItem(LAST_VIEW_KEY);
  const initialView = (lastView === 'timeGridDay' || lastView === 'timeGridWeek' || lastView === 'dayGridMonth') ? lastView : 'timeGridWeek';

  // Cache for job-level material readiness lookups
  const jobReadyCache = new Map(); // jobId:number -> Promise<boolean> or boolean
  async function fetchMaterialReady(jobId){
    if (!jobId || !Number.isFinite(Number(jobId))) return false;
    const key = String(jobId);
    if (jobReadyCache.has(key)) {
      const v = jobReadyCache.get(key);
      return typeof v === 'boolean' ? v : v.catch(()=>false);
    }
    const p = (async () => {
      try{
        const r = await fetch('/api/jobs/'+encodeURIComponent(key)+'/material-ready');
        if (!r.ok) return false;
        const j = await r.json();
        return !!(j && (j.material_ready === true || j.ready === true));
      }catch{ return false; }
    })();
    jobReadyCache.set(key, p);
    const val = await p.catch(()=>false);
    jobReadyCache.set(key, val);
    return val;
  }

  const calendar = new FullCalendar.Calendar(document.getElementById('cal'), {
    initialView,
    headerToolbar: {
      left: 'prev,today,next',
      center: 'title',
      right: 'timeGridDay,timeGridWeek,dayGridMonth'
    },
    slotMinTime: '06:00:00',
    slotMaxTime: '18:00:00',
    expandRows: true,
    height: 'auto',
    nowIndicator: true,
    allDaySlot: false,
    selectable: true,
    editable: true,
    eventOverlap: true,

    events: async (info, success, failure) => {
      try{
        const params = new URLSearchParams({
          start: info.startStr,
          end: info.endStr
        });
        const crew = crewFilter.value.trim();
        if (crew) params.set('crew', crew);

        const r = await fetch('/api/calendar/events?' + params.toString());
        const data = await r.json();
        let evts = data.events || data || [];

        // client-side fallback filter
        if (crew) {
          evts = evts.filter(e => {
            const rn = (e.resource_name || (e.extendedProps && e.extendedProps.resource_name) || '').trim();
            return rn === crew;
          });
        }

        // normalize extendedProps for colors/badges - the server returns 'type' not 'task_type'
        evts = evts.map(e => {
          if (!e.extendedProps) e.extendedProps = {};
          // use 'type' from extendedProps OR top-level, map it to task_type
          const rawType = e.extendedProps.type || e.extendedProps.task_type || e.type || '';
          e.extendedProps.task_type = rawType;
          e.extendedProps.type = rawType; // keep both for compatibility
          e.extendedProps.status = e.extendedProps.status || 'scheduled';
          e.extendedProps.resource_name = e.extendedProps.resource_name || e.resource_name || '';
          return e;
        });

        success(evts);
      }catch(e){ failure(e); }
    },

  dateClick: (info) => openModal({ title:'New Task', startISO: info.date }),

  // Drag selection opens with the start of selection
  select: (info) => openModal({ title:'New Task', startISO: info.start }),

    eventClassNames: (arg) => {
      const t = typeKey(arg.event.extendedProps.task_type || arg.event.title);
      const classes = [];
      if (t) classes.push('ev-'+t);
      const s = statusKey(arg.event.extendedProps.status);
      if (s) classes.push('st-'+s);
      return classes;
    },

    eventDidMount: (info) => {
      // inject status badge
      const s = statusKey(info.event.extendedProps.status);
      const badge = document.createElement('span');
      badge.className = 'badge ' + s;
      badge.textContent =
        s === 'en_route'    ? 'OTW' :
        s === 'in_progress' ? 'ARRIVED' :
        s === 'wip'         ? 'WIP' :
        s === 'complete'    ? 'DONE' : 'SCHED';
      const main = info.el.querySelector('.fc-event-title, .fc-event-main');
      (main || info.el).appendChild(badge);

      // Add READY pill if materials are ready.
      // Prefer server-provided flag if available; otherwise, query per job with cache.
      const readyFlag = info.event.extendedProps.material_ready;
      const jobId = info.event.extendedProps.job_id || info.event.extendedProps.job || null;
      const addReady = () => {
        const rb = document.createElement('span');
        rb.className = 'badge ready';
        rb.textContent = 'READY';
        (main || info.el).appendChild(rb);
      };
      if (readyFlag === true) {
        addReady();
      } else if (readyFlag === false) {
        // do nothing
      } else if (jobId) {
        // async lookup; don't block render
        fetchMaterialReady(jobId).then(ok => { if (ok) addReady(); }).catch(()=>{});
      }
    },

    eventClick: (info) => {
      // strip composite ID suffix if present (e.g., "7618:resource_name" → "7618")
      const rawId = String(info.event.id || '');
      const taskId = rawId.includes(':') ? rawId.split(':')[0] : rawId;
      
      // convert event -> modal fields
      const task = {
        id: taskId,
        title: info.event.title,
        startStr: info.event.start?.toISOString(),
        endStr: info.event.end?.toISOString(),
        extendedProps: Object.assign({},
          info.event.extendedProps || {},
          { job_id: info.event.extendedProps?.job_id, resource_id: info.event.extendedProps?.resource_id })
      };
      openModal({ title:'Edit Task', task });
    },

    eventDrop: async (info) => {
      try{
        // strip composite ID suffix
        const rawId = String(info.event.id || '');
        const taskId = rawId.includes(':') ? rawId.split(':')[0] : rawId;
        await fetch('/api/calendar/events/'+taskId,{
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ start: info.event.start?.toISOString(), end: info.event.end?.toISOString() })
        });
      }catch(_){ info.revert(); }
    },

    eventResize: async (info) => {
      try{
        // strip composite ID suffix
        const rawId = String(info.event.id || '');
        const taskId = rawId.includes(':') ? rawId.split(':')[0] : rawId;
        await fetch('/api/calendar/events/'+taskId,{
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ start: info.event.start?.toISOString(), end: info.event.end?.toISOString() })
        });
      }catch(_){ info.revert(); }
    },

    // Remember view when user switches
    datesSet: (arg) => {
      localStorage.setItem(LAST_VIEW_KEY, arg.view.type);
    }
  });

  calendar.render();

  // React to crew filter changes
  if (crewFilter) {
    crewFilter.addEventListener('change', () => {
      localStorage.setItem(CREW_KEY, crewFilter.value.trim());
      calendar.refetchEvents();
    });
  }

  document.getElementById('btnNew').onclick = ()=> openModal({ title:'New Task', startISO: new Date() });

  // Save handler (create or inline update)
  mSave.onclick = async ()=>{
    try{
      // Basic client validation
      const nameVal = (mName.value || '').trim();
      if (!nameVal) { alert('Please enter a Title.'); return; }
      if (!mStart.value) { alert('Please pick a Start date/time.'); return; }

      let startIso;
      try {
        const dt = new Date(mStart.value);
        if (!(dt instanceof Date) || isNaN(dt)) throw new Error('Invalid start');
        startIso = dt.toISOString();
      } catch (_) {
        alert('Start date/time is invalid.');
        return;
      }

      const parsedJobId = (function(v){
        const s = String(v||'');
        const m = s.match(/\d+/);
        const n = m ? parseInt(m[0],10) : NaN;
        return Number.isFinite(n) ? n : null;
      })(mJob.value);

      const selectedIds = Array.from(mRes.selectedOptions).map(o => Number(o.value)).filter(Boolean);
      const payload = {
        type: mType.value,
        name: nameVal,
        job_id: parsedJobId,
        resource_ids: selectedIds,
        window_start: startIso,
        duration_min: Math.max(0, Number(mDur.value||0)),
        notes: (mNotes.value || '').trim(),
        checklist: readChecklist()
      };
      const isEdit = !!currentEditId;
      
      if (isEdit) {
        // PATCH the existing task with all fields including notes and checklist
        const r = await fetch('/api/tasks/' + currentEditId, { 
          method:'PATCH', 
          headers:{'Content-Type':'application/json'}, 
          body: JSON.stringify(payload) 
        });
        if (!r.ok) {
          let msg = 'Update failed (HTTP ' + r.status + ')';
          try { const j = await r.json(); msg = (j && (j.error || j.detail)) ? (j.error + (j.detail ? ': ' + j.detail : '')) : msg; } catch {}
          alert(msg);
          return;
        }
        modal.hidden = true; 
        calendar.refetchEvents();
        return;
      }

      const r = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!r.ok) {
        let msg = 'Create failed (HTTP ' + r.status + ')';
        try { const j = await r.json(); msg = (j && (j.error || j.detail)) ? (j.error + (j.detail ? ': ' + j.detail : '')) : msg; } catch {}
        alert(msg);
        return;
      }
      modal.hidden = true; calendar.refetchEvents();
    }catch(e){ alert('Save failed: ' + (e && e.message || e)); }
  };

  // --- Job Snapshot panel ---
  const snapEl = document.getElementById('jobSnapshot');
  let lastBidIdForJob = null;
  async function loadJobSnapshot(inputVal){
    try{
      if (!snapEl) return;
      const num = parseInt(String(inputVal||'').split(/\D/)[0] || String(inputVal||''), 10);
      if (!Number.isFinite(num) || num <= 0) { snapEl.innerHTML = '<div class="muted">No job selected</div>'; return; }
      snapEl.innerHTML = '<div class="muted">Loading…</div>';
      const r = await fetch('/api/bids/by-job/'+num+'/summary');
      if (!r.ok) { snapEl.innerHTML = '<div class="muted">No bid found for job</div>'; return; }
      const data = await r.json();
      const b = data.bid || {};
      const fin = data.financial || {};
      lastBidIdForJob = b.id || null;
      const addr = [b.home_address].filter(Boolean).join(' ');
      const phone = b.homeowner_phone || b.builder_phone || '';
      snapEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px">'
        + '<div><strong>Bid:</strong> #' + (b.id || '?') + ' – ' + (b.name || '') + '</div>'
        + '<div><strong>Customer:</strong> ' + (b.homeowner || b.builder || '') + '</div>'
        + '<div><strong>Phone:</strong> ' + (phone || '') + '</div>'
        + '<div><strong>Address:</strong> ' + (addr || '') + '</div>'
        + '<div><strong>Totals:</strong> $' + Number(fin.total||0).toLocaleString() + '</div>'
        + '<div class="row" style="gap:8px">'
        +   '<a class="btn" href="/sales-details?bid=' + (b.id || '') + '" target="_blank">Open Bid</a>'
        + '</div>'
        + '</div>';
      if (mOpenBid) mOpenBid.style.display = lastBidIdForJob ? 'inline-block' : 'none';
    }catch(e){
      if (snapEl) snapEl.innerHTML = '<div class="muted">Failed to load snapshot</div>';
    }
  }
  mJob.addEventListener('change', ()=> loadJobSnapshot(mJob.value));
  mJob.addEventListener('blur',   ()=> loadJobSnapshot(mJob.value));

  // Button handlers
  if (mSummary) {
    mSummary.onclick = ()=> { if (currentEditId && window.openTaskSummary) window.openTaskSummary(currentEditId); };
  }
  if (mOpenBid) {
    mOpenBid.onclick = ()=> { if (lastBidIdForJob) window.open('/sales-details?bid=' + lastBidIdForJob, '_blank'); };
  }
})();
</script>
</body></html>`);
  });
}
