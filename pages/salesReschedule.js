export default function registerSalesReschedule(app) {
  // Keep existing path
  app.get("/sales-reschedule", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sales – Reschedule Request</title>
  <link href="/static/appbar.css" rel="stylesheet" />
  <style>
    :root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#e5e7eb; --muted:#9aa4b2; --brand:#3b82f6; }
    *{ box-sizing:border-box }
    html,body{ height:100%; }
    body{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial; background:var(--bg); color:var(--text); }
    .wrap{ max-width:1100px; margin:0 auto; padding:20px; }
    
    /* Task finder dropdown */
    #findList{ position:absolute; z-index:999; background:#1f2937; border:1px solid #374151; border-radius:6px; margin-top:2px; max-height:360px; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,.4); display:none; }
    .opt{ padding:10px 14px; cursor:pointer; border-bottom:1px solid #374151; }
    .opt:hover{ background:#374151; }
    .opt:last-child{ border-bottom:none; }
    h1{ font-size:26px; font-weight:700; margin:0; }
    .muted{ color:var(--muted); }
    .card{ background:#0f121a; border:1px solid #1f2937; border-radius:14px; padding:16px; }
    .grid{ display:grid; gap:12px; }
    .g2{ grid-template-columns: repeat(2, minmax(0,1fr)); }
    label{ display:block; font-size:12px; color:var(--muted); margin-bottom:6px; }
    input, textarea, select{ width:100%; padding:10px; border-radius:10px; border:1px solid #2a3348; background:#0f121a; color:#e5e7eb; }
    .row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .btn{ display:inline-flex; align-items:center; gap:.5rem; border:1px solid #2a3348; background:#223152; color:#e5e7eb; border-radius:10px; padding:9px 12px; cursor:pointer; }
    .btn:hover{ background:#2f4067; }
    table{ width:100%; border-collapse:separate; border-spacing:0 8px; color:#e5e7eb; }
    th, td{ text-align:left; padding:10px; border-bottom:1px solid var(--line); }
    .pill{ display:inline-block; padding:3px 8px; border:1px solid #334155; border-radius:999px; font-size:12px; background:#0f121a; color:#9aa4b2; }
    .notice{ position:fixed; top:70px; left:50%; transform:translateX(-50%); background:#0f172a; color:#e2e8f0; border:1px solid #1f2937; padding:10px 14px; border-radius:8px; display:none; z-index:50; }
    .opt{ padding:10px 12px; cursor:pointer; border-bottom:1px solid #1a1f36; }
    .opt:hover{ background:#1a1f36; }
  </style>
</head>
<body>
  <div id="appbar"></div>
  <script src="/static/appbar.js"></script>

  <div class="wrap">
    <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h1>Reschedule Requests</h1>
      <div class="muted">Signed in: <strong id="meName">—</strong></div>
    </div>

    <div class="card" style="margin-bottom:14px;">
      <div style="margin-bottom:12px;">
        <label>Find Task</label>
        <input id="findTask" class="input" placeholder="Search by customer, job #, task, crew…" autocomplete="off">
        <div id="findTaskResults" style="position:relative">
          <div id="findList"
               style="position:absolute; z-index: 50; top: 4px; left:0; right:0; display:none;
                      background:#0f1220; border:1px solid #212432; border-radius:12px; max-height:260px; overflow:auto">
          </div>
        </div>
      </div>
      <div class="row" style="align-items:flex-end; gap:16px;">
        <div style="width:140px;">
          <label>Task ID *</label>
          <input id="taskId" type="number" min="1" placeholder="e.g. 12345" />
          <div id="currentWindow" class="muted" style="margin-top:4px"></div>
        </div>
        <div>
          <label>New Start (local) *</label>
          <input id="newStart" type="datetime-local" />
        </div>
        <div>
          <label>New End (local) *</label>
          <input id="newEnd" type="datetime-local" />
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>Reason</label>
        <textarea id="reason" rows="2" placeholder="Optional note for Ops…"></textarea>
      </div>
      <div style="margin-top:12px;" class="row">
        <button id="btnCreate" class="btn">Submit Reschedule Request</button>
        <span id="hint" class="muted"></span>
      </div>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="muted">My Requests</div>
        <div>
          <label style="margin-right:8px">Status</label>
          <select id="status">
            <option value="pending">pending</option>
            <option value="applied">applied</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
      </div>
      <div style="margin-top:10px; overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Task</th>
              <th>Customer</th>
              <th>From → To</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Requested By</th>
              <th>Requested At</th>
            </tr>
          </thead>
          <tbody id="list"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="notice" class="notice"></div>

  <script>
  (function(){
    const $ = (sel, ctx=document) => ctx.querySelector(sel);
    const listEl = document.getElementById('list');
    const meNameEl = document.getElementById('meName');
    const noticeEl = document.getElementById('notice');
    let me = null;

    // Task finder typeahead
    const elFind = document.getElementById('findTask');
    const elList = document.getElementById('findList');
    const elTaskId = document.getElementById('taskId');
    let tmr = null;
    function showList(html) {
      elList.innerHTML = html;
      elList.style.display = html ? 'block' : 'none';
    }
    async function searchTasks(q) {
      const r = await fetch('/api/tasks/search?q=' + encodeURIComponent(q));
      if (!r.ok) throw new Error('search_failed');
      return r.json();
    }
    function fmtRow(r) {
      const start = r.window_start ? new Date(r.window_start).toLocaleString() : '—';
      const end = r.window_end ? new Date(r.window_end).toLocaleTimeString() : '—';
      const crew = r.crew || 'Unassigned';
      return '<div class="opt" data-id="' + r.id + '" data-start="' + (r.window_start || '') + '" data-end="' + (r.window_end || '') + '">' +
        '<div style="font-weight:600">' + (r.customer_name || 'Unknown') + ' — ' + (r.title || '') + '</div>' +
        '<div style="font-size:12px; color:#8b93a3">' +
        'Task #' + r.id + ' • Job ' + (r.job_id || '—') + ' • ' + start + ' → ' + end + ' • ' + crew +
        '</div></div>';
    }
    async function handleSearch() {
      const q = (elFind.value || '').trim();
      if (q.length < 2) { showList(''); return; }
      try {
        const rows = await searchTasks(q);
        if (!rows.length) { showList('<div style="padding:10px;opacity:.6">No matches</div>'); return; }
        showList(rows.map(fmtRow).join(''));
        Array.from(document.querySelectorAll('#findList .opt')).forEach(function(el) {
          el.onclick = function() {
            const id = Number(el.getAttribute('data-id'));
            if (elTaskId) elTaskId.value = id;
            showList('');
            elFind.value = '';
            // bonus: show current window
            const info = document.getElementById('currentWindow');
            if (info) {
              const sRaw = el.getAttribute('data-start');
              const eRaw = el.getAttribute('data-end');
              const s = sRaw ? new Date(sRaw).toLocaleString() : '—';
              const e = eRaw ? new Date(eRaw).toLocaleTimeString() : '—';
              info.textContent = 'Current window: ' + s + ' → ' + e;
            }
          };
        });
      } catch { showList('<div style="padding:10px;opacity:.6">Search failed</div>'); }
    }
    if (elFind) {
      elFind.addEventListener('input', function() {
        if (tmr) clearTimeout(tmr);
        tmr = setTimeout(handleSearch, 220);
      });
      document.addEventListener('click', function(e) {
        if (!elList.contains(e.target) && e.target !== elFind) showList('');
      });
    }

    function show(msg){
      noticeEl.textContent = msg; noticeEl.style.display='block';
      clearTimeout(window.__nt);
      window.__nt = setTimeout(()=> noticeEl.style.display='none', 2000);
    }

    fetch('/api/me').then(r=>r.json()).then(d=>{ me=d||{}; meNameEl.textContent = me.name||'—'; load(); }).catch(()=>load());

    async function fetchJSON(url, opts){ const r=await fetch(url, opts||{}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }

    async function load(){
      const status = document.getElementById('status').value;
      try{
        const data = await fetchJSON('/api/tasks/reschedule-requests?status='+encodeURIComponent(status));
        const rows = (data && data.requests) || [];
        const myEmail = (me && me.email) || null;
        const mine = myEmail ? rows.filter(r => r.requested_by === myEmail) : rows; // fallback: show all
        render(mine);
      }catch(e){ listEl.innerHTML = '<tr><td colspan="8" class="muted">Error: '+(e.message||e)+'</td></tr>'; }
    }

    function dt(s){ try{ return new Date(s).toLocaleString(); } catch { return s; } }

    function render(rows){
      listEl.innerHTML = '';
      if(!rows.length){ listEl.innerHTML = '<tr><td colspan="8" class="muted">No requests</td></tr>'; return; }
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = 
          '<td>#' + r.id + '</td>'+
          '<td>' + (r.task_id ?? '') + ' — ' + (r.task_name||'') + '</td>'+
          '<td>' + (r.customer_name||'—') + '</td>'+
          '<td>'+
            '<span class="pill">' + dt(r.old_start) + ' → ' + dt(r.old_end) + '</span><br/>'+
            '<span class="pill">' + dt(r.new_start) + ' → ' + dt(r.new_end) + '</span>'+
          '</td>'+
          '<td>' + (r.reason||'—') + '</td>'+
          '<td><span class="pill">' + r.status + '</span></td>'+
          '<td>' + (r.requested_by||'—') + '</td>'+
          '<td>' + dt(r.created_at) + '</td>';
        listEl.appendChild(tr);
      });
    }

    document.getElementById('status').addEventListener('change', load);
    document.getElementById('btnCreate').addEventListener('click', async ()=>{
      const taskId = Number(document.getElementById('taskId').value||0);
      const ns = document.getElementById('newStart').value;
      const ne = document.getElementById('newEnd').value;
      const reason = document.getElementById('reason').value||'';
      if(!taskId){ return show('Enter Task ID'); }
      if(!ns || !ne){ return show('Pick new start and end'); }
      try{
        await fetchJSON('/api/tasks/'+taskId+'/reschedule-requests', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ new_start: ns, new_end: ne, reason })
        });
        show('Request submitted');
        document.getElementById('hint').textContent = 'Submitted ✓';
        load();
      }catch(e){ show('Submit failed: '+(e.message||e)); }
    });
  })();
  </script>
</body>
</html>`);
  });

  // Also serve at the path you requested: /sales/reschedule
  app.get("/sales/reschedule", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sales – Reschedule Request</title>
  <link href="/static/appbar.css" rel="stylesheet" />
  <style>
    :root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#e5e7eb; --muted:#9aa4b2; --brand:#3b82f6; }
    *{ box-sizing:border-box }
    html,body{ height:100%; }
    body{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial; background:var(--bg); color:var(--text); }
    .wrap{ max-width:1100px; margin:0 auto; padding:20px; }
    
    /* Task finder dropdown */
    #findList{ position:absolute; z-index:999; background:#1f2937; border:1px solid #374151; border-radius:6px; margin-top:2px; max-height:360px; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,.4); display:none; }
    .opt{ padding:10px 14px; cursor:pointer; border-bottom:1px solid #374151; }
    .opt:hover{ background:#374151; }
    .opt:last-child{ border-bottom:none; }
    h1{ font-size:26px; font-weight:700; margin:0; }
    .muted{ color:var(--muted); }
    .card{ background:#0f121a; border:1px solid #1f2937; border-radius:14px; padding:16px; }
    .grid{ display:grid; gap:12px; }
    .g2{ grid-template-columns: repeat(2, minmax(0,1fr)); }
    label{ display:block; font-size:12px; color:var(--muted); margin-bottom:6px; }
    input, textarea, select{ width:100%; padding:10px; border-radius:10px; border:1px solid #2a3348; background:#0f121a; color:#e5e7eb; }
    .row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .btn{ display:inline-flex; align-items:center; gap:.5rem; border:1px solid #2a3348; background:#223152; color:#e5e7eb; border-radius:10px; padding:9px 12px; cursor:pointer; }
    .btn:hover{ background:#2f4067; }
    table{ width:100%; border-collapse:separate; border-spacing:0 8px; color:#e5e7eb; }
    th, td{ text-align:left; padding:10px; border-bottom:1px solid var(--line); }
    .pill{ display:inline-block; padding:3px 8px; border:1px solid #334155; border-radius:999px; font-size:12px; background:#0f121a; color:#9aa4b2; }
    .notice{ position:fixed; top:70px; left:50%; transform:translateX(-50%); background:#0f172a; color:#e2e8f0; border:1px solid #1f2937; padding:10px 14px; border-radius:8px; display:none; z-index:50; }
  </style>
</head>
<body>
  <div id="appbar"></div>
  <script src="/static/appbar.js"></script>

  <div class="wrap">
    <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h1>Reschedule Requests</h1>
      <div class="muted">Signed in: <strong id="meName">—</strong></div>
    </div>

    <div class="card" style="margin-bottom:14px;">
      <div style="margin-bottom:12px;">
        <label>Find Task</label>
        <input id="findTask" class="input" placeholder="Search by customer, job #, task, crew…" autocomplete="off">
        <div id="findTaskResults" style="position:relative">
          <div id="findList"
               style="position:absolute; z-index: 50; top: 4px; left:0; right:0; display:none;
                      background:#0f1220; border:1px solid #212432; border-radius:12px; max-height:260px; overflow:auto">
          </div>
        </div>
      </div>
      <div class="row" style="align-items:flex-end; gap:16px;">
        <div style="width:140px;">
          <label>Task ID *</label>
          <input id="taskId" type="number" min="1" placeholder="e.g. 12345" />
          <div id="currentWindow" class="muted" style="margin-top:4px"></div>
        </div>
        <div>
          <label>New Start (local) *</label>
          <input id="newStart" type="datetime-local" />
        </div>
        <div>
          <label>New End (local) *</label>
          <input id="newEnd" type="datetime-local" />
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>Reason</label>
        <textarea id="reason" rows="2" placeholder="Optional note for Ops…"></textarea>
      </div>
      <div style="margin-top:12px;" class="row">
        <button id="btnCreate" class="btn">Submit Reschedule Request</button>
        <span id="hint" class="muted"></span>
      </div>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="muted">My Requests</div>
        <div>
          <label style="margin-right:8px">Status</label>
          <select id="status">
            <option value="pending">pending</option>
            <option value="applied">applied</option>
            <option value="rejected">rejected</option>
          </select>
        </div>
      </div>
      <div style="margin-top:10px; overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Task</th>
              <th>Customer</th>
              <th>From → To</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Requested By</th>
              <th>Requested At</th>
            </tr>
          </thead>
          <tbody id="list"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="notice" class="notice"></div>

  <script>
  (function(){
    const $ = (sel, ctx=document) => ctx.querySelector(sel);
    const listEl = document.getElementById('list');
    const meNameEl = document.getElementById('meName');
    const noticeEl = document.getElementById('notice');
    let me = null;

    function show(msg){
      noticeEl.textContent = msg; noticeEl.style.display='block';
      clearTimeout(window.__nt);
      window.__nt = setTimeout(()=> noticeEl.style.display='none', 2000);
    }

    fetch('/api/me').then(r=>r.json()).then(d=>{ me=d||{}; meNameEl.textContent = me.name||'—'; load(); }).catch(()=>load());

    async function fetchJSON(url, opts){ const r=await fetch(url, opts||{}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }

    async function load(){
      const status = document.getElementById('status').value;
      try{
        const data = await fetchJSON('/api/tasks/reschedule-requests?status='+encodeURIComponent(status));
        const rows = (data && data.requests) || [];
        const myEmail = (me && me.email) || null;
        const mine = myEmail ? rows.filter(r => r.requested_by === myEmail) : rows; // fallback: show all
        render(mine);
      }catch(e){ listEl.innerHTML = '<tr><td colspan="8" class="muted">Error: '+(e.message||e)+'</td></tr>'; }
    }

    function dt(s){ try{ return new Date(s).toLocaleString(); } catch { return s; } }

    function render(rows){
      listEl.innerHTML = '';
      if(!rows.length){ listEl.innerHTML = '<tr><td colspan="8" class="muted">No requests</td></tr>'; return; }
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = 
          '<td>#' + r.id + '</td>'+
          '<td>' + (r.task_id ?? '') + ' — ' + (r.task_name||'') + '</td>'+
          '<td>' + (r.customer_name||'—') + '</td>'+
          '<td>'+
            '<span class="pill">' + dt(r.old_start) + ' → ' + dt(r.old_end) + '</span><br/>'+
            '<span class="pill">' + dt(r.new_start) + ' → ' + dt(r.new_end) + '</span>'+
          '</td>'+
          '<td>' + (r.reason||'—') + '</td>'+
          '<td><span class="pill">' + r.status + '</span></td>'+
          '<td>' + (r.requested_by||'—') + '</td>'+
          '<td>' + dt(r.created_at) + '</td>';
        listEl.appendChild(tr);
      });
    }

    document.getElementById('status').addEventListener('change', load);
    document.getElementById('btnCreate').addEventListener('click', async ()=>{
      const taskId = Number(document.getElementById('taskId').value||0);
      const ns = document.getElementById('newStart').value;
      const ne = document.getElementById('newEnd').value;
      const reason = document.getElementById('reason').value||'';
      if(!taskId){ return show('Enter Task ID'); }
      if(!ns || !ne){ return show('Pick new start and end'); }
      try{
        await fetchJSON('/api/tasks/'+taskId+'/reschedule-requests', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ new_start: ns, new_end: ne, reason })
        });
        show('Request submitted');
        document.getElementById('hint').textContent = 'Submitted ✓';
        load();
      }catch(e){ show('Submit failed: '+(e.message||e)); }
    });

    // Task finder typeahead
    const elFind = document.getElementById('findTask');
    const elList = document.getElementById('findList');
    const elTaskId = document.getElementById('taskId');
    let tmr = null;
    function showList(html) {
      elList.innerHTML = html;
      elList.style.display = html ? 'block' : 'none';
    }
    async function searchTasks(q) {
      const r = await fetch('/api/tasks/search?q=' + encodeURIComponent(q));
      if (!r.ok) throw new Error('search_failed');
      return r.json();
    }
    function fmtRow(r) {
      const start = r.window_start ? new Date(r.window_start).toLocaleString() : '—';
      const end = r.window_end ? new Date(r.window_end).toLocaleTimeString() : '—';
      const crew = r.crew || 'Unassigned';
      return '<div class="opt" data-id="' + r.id + '" data-start="' + (r.window_start || '') + '" data-end="' + (r.window_end || '') + '">' +
        '<div style="font-weight:600">' + (r.customer_name || 'Unknown') + ' — ' + (r.title || '') + '</div>' +
        '<div style="font-size:12px; color:#8b93a3">' +
        'Task #' + r.id + ' • Job ' + (r.job_id || '—') + ' • ' + start + ' → ' + end + ' • ' + crew +
        '</div></div>';
    }
    async function handleSearch() {
      const q = (elFind.value || '').trim();
      if (q.length < 2) { showList(''); return; }
      try {
        const rows = await searchTasks(q);
        if (!rows.length) { showList('<div style="padding:10px;opacity:.6">No matches</div>'); return; }
        showList(rows.map(fmtRow).join(''));
        Array.from(document.querySelectorAll('#findList .opt')).forEach(function(el) {
          el.onclick = function() {
            const id = Number(el.getAttribute('data-id'));
            if (elTaskId) elTaskId.value = id;
            showList('');
            elFind.value = '';
            // bonus: show current window
            const info = document.getElementById('currentWindow');
            if (info) {
              const sRaw = el.getAttribute('data-start');
              const eRaw = el.getAttribute('data-end');
              const s = sRaw ? new Date(sRaw).toLocaleString() : '—';
              const e = eRaw ? new Date(eRaw).toLocaleTimeString() : '—';
              info.textContent = 'Current window: ' + s + ' → ' + e;
            }
          };
        });
      } catch { showList('<div style="padding:10px;opacity:.6">Search failed</div>'); }
    }
    if (elFind) {
      elFind.addEventListener('input', function() {
        if (tmr) clearTimeout(tmr);
        tmr = setTimeout(handleSearch, 220);
      });
      document.addEventListener('click', function(e) {
        if (!elList.contains(e.target) && e.target !== elFind) showList('');
      });
    }
  })();
  </script>
</body>
</html>`);
  });
}
