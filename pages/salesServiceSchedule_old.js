export default function registerSalesServiceSchedule(app){
  // Existing path
  app.get('/sales-service-schedule', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sales – Schedule Service</title>
<link href="/static/appbar.css" rel="stylesheet" />
<style>
:root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#8b93a3; }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial}
.wrap{max-width:900px;margin:0 auto;padding:22px}
h1{margin:0 0 10px;font-size:24px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin:12px 0}
.grid{display:grid;gap:10px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
input,select,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0f1220;color:var(--text)}
.btn{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:#1a2033;color:#eef2ff;cursor:pointer}
.btn:hover{background:#222a44}
.small{color:var(--muted);font-size:12px}
.notice{ position:fixed; top:70px; left:50%; transform:translateX(-50%); background:#0f172a; color:#e2e8f0; border:1px solid #1f2937; padding:10px 14px; border-radius:8px; display:none; z-index:50; }
</style>
</head>
<body>
<div id="appbar"></div>
<script src="/static/appbar.js"></script>

<div class="wrap">
  <h1>Schedule Service</h1>
  <div class="small">Create a service task for a customer (sales-friendly form). Start typing a customer to link this to an existing job.</div>

  <div class="panel">
    <div class="grid g2">
      <div style="position:relative">
        <label>Customer Name *</label>
        <input id="cust" placeholder="Customer Name" autocomplete="off"/>
        <input id="jobId" type="hidden" />
        <div id="custResults" style="position:absolute;left:0;right:0;top:58px;z-index:20;background:#0f1220;border:1px solid var(--line);border-radius:10px;max-height:220px;overflow:auto;display:none"></div>
        <div id="jobBadge" class="small" style="margin-top:4px;display:none"></div>
      </div>
      <div><label>Contact Phone</label><input id="phone" placeholder="+1 (###) ###-####"/></div>

      <div><label>Address *</label><input id="addr" placeholder="Street"/></div>
      <div><label>City</label><input id="city" placeholder="City"/></div>
      <div><label>State</label><input id="state" placeholder="UT"/></div>
      <div><label>ZIP</label><input id="zip" placeholder="840xx"/></div>

      <div><label>Date *</label><input id="date" type="date"/></div>
      <div><label>Start (local)</label><input id="start" type="time" value="09:00"/></div>

      <div><label>Duration (minutes)</label><input id="dur" type="number" min="15" step="15" value="90"/></div>
      <div><label>Assign to (resource id)</label><input id="rid" type="number" min="0" placeholder="Optional"/></div>
    </div>

    <div style="margin-top:10px">
      <label>Notes</label>
      <textarea id="notes" rows="3" placeholder="Optional notes for the crew…"></textarea>
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;">
      <button class="btn" id="saveBtn">Create Service</button>
      <span class="small" id="status"></span>
    </div>
  </div>

  <div class="panel">
    <div class="small">After creating, view it in <a href="/ops-day-board">Ops Day Board</a> or the crew’s <a href="/myday-teams">My Day</a>.</div>
  </div>
</div>

<div id="notice" class="notice"></div>

<script>
const $ = id => document.getElementById(id);
function ymd(d){const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
(function seed(){ const d=new Date(); d.setDate(d.getDate()+1); $('date').value = ymd(d); })();

// Optional prefill from query params
(function prefill(){
  const p = new URLSearchParams(location.search);
  const map = { cust:'customer', phone:'phone', addr:'address', city:'city', state:'state', zip:'zip' };
  Object.entries(map).forEach(([id,key])=>{ const v=p.get(key); if(v) $(id).value=v; });
})();

// Load current user for scoping searches and audit of who scheduled
let _currentUserName = '';
(async function loadMe(){
  try {
    const r = await fetch('/api/me');
    const d = await r.json();
    _currentUserName = d?.name || '';
    try { window.currentUserName = _currentUserName; } catch(_) {}
  } catch(_) {}
})();

// --- typeahead: search existing jobs by customer name and link job_id ---
let _searchTimer = null;
let _selectedJobId = null;
async function searchJobs(term){
  // STRICTLY SCOPED: Only return jobs owned by the current salesperson
  const salesName = _currentUserName || '';
  try {
    const url = '/api/sales/jobs?query=' + encodeURIComponent(term) + (salesName ? ('&sales=' + encodeURIComponent(salesName)) : '');
    const r = await fetch(url);
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

function showResults(list){
  const box = $('custResults');
  if(!list.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.innerHTML = list.slice(0,25).map(function(j){
    var name = String(j.customer_name||'').replace(/[<>]/g,'');
    var proj = String(j.project_name||'').replace(/[<>]/g,'');
    return '<div class="opt" data-id="'+j.id+'" data-name="'+name+'">\n'
      + '  <div style="padding:8px 10px;display:flex;justify-content:space-between;gap:8px;cursor:pointer">\n'
      + '    <div>'+ name + (proj ? ' - ' + proj : '') + '</div>\n'
      + '    <div class="small" style="opacity:.7">#'+ j.id +'</div>\n'
      + '  </div>\n'
      + '</div>';
  }).join('');
  box.style.display='block';
  Array.from(box.querySelectorAll('.opt')).forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const name = el.getAttribute('data-name');
      _selectedJobId = id; $('jobId').value = id;
      $('cust').value = name;
      box.style.display='none'; box.innerHTML='';
      const jb = $('jobBadge'); jb.textContent = 'Linked to Job #' + id; jb.style.display='block';
    });
  });
}

$('cust').addEventListener('input', (e) => {
  const term = (e.target.value||'').trim();
  _selectedJobId = null; $('jobId').value=''; $('jobBadge').style.display='none';
  clearTimeout(_searchTimer);
  if(term.length < 2){ $('custResults').style.display='none'; $('custResults').innerHTML=''; return; }
  _searchTimer = setTimeout(async () => {
    const list = await searchJobs(term);
    showResults(list);
  }, 180);
});

$('saveBtn').onclick = async ()=>{
  const body = {
    customer_name: $('cust').value.trim(),
    contact_phone: $('phone').value.trim(),
    address_line1: $('addr').value.trim(),
    city: $('city').value.trim(),
    state: $('state').value.trim(),
    zip: $('zip').value.trim(),
    date: $('date').value,
    start_local: $('start').value || '09:00',
    duration_min: Number($('dur').value || 90),
    resource_id: Number($('rid').value || 0) || null,
    notes: $('notes').value.trim(),
    job_id: $('jobId').value || null,
    scheduled_by: (window.currentUserName || '')
  };
  if (!body.customer_name) return alert('Customer name is required.');
  if (!body.address_line1) return alert('Address is required.');
  if (!body.date) return alert('Date is required.');

  try {
    $('saveBtn').disabled = true;
    $('status').textContent = 'Saving…';
    const r = await fetch('/api/service', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP '+r.status));
    $('status').textContent = 'Created ✓  Job: '+data.job_id+'  Task: '+data.task_id;
  } catch(e){
    $('status').textContent = 'Error: ' + (e.message||e);
    alert('Create failed: ' + (e.message||e));
  } finally { $('saveBtn').disabled = false; }
};
</script>
</body></html>`);
  });

  // Also serve at requested path: /sales/service-new
  app.get('/sales/service-new', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sales – Schedule Service</title>
<link href="/static/appbar.css" rel="stylesheet" />
<style>
:root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#8b93a3; }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial}
.wrap{max-width:900px;margin:0 auto;padding:22px}
h1{margin:0 0 10px;font-size:24px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin:12px 0}
.grid{display:grid;gap:10px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
input,select,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0f1220;color:var(--text)}
.btn{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:#1a2033;color:#eef2ff;cursor:pointer}
.btn:hover{background:#222a44}
.small{color:var(--muted);font-size:12px}
.notice{ position:fixed; top:70px; left:50%; transform:translateX(-50%); background:#0f172a; color:#e2e8f0; border:1px solid #1f2937; padding:10px 14px; border-radius:8px; display:none; z-index:50; }
</style>
</head>
<body>
<div id="appbar"></div>
<script src="/static/appbar.js"></script>

<div class="wrap">
  <h1>Schedule Service</h1>
  <div class="small">Create a service task for a customer (sales-friendly form).</div>

  <div class="panel">
    <div class="grid g2">
      <div><label>Customer Name *</label><input id="cust" placeholder="Customer Name"/></div>
      <div><label>Contact Phone</label><input id="phone" placeholder="+1 (###) ###-####"/></div>

      <div><label>Address *</label><input id="addr" placeholder="Street"/></div>
      <div><label>City</label><input id="city" placeholder="City"/></div>
      <div><label>State</label><input id="state" placeholder="UT"/></div>
      <div><label>ZIP</label><input id="zip" placeholder="840xx"/></div>

      <div><label>Date *</label><input id="date" type="date"/></div>
      <div><label>Start (local)</label><input id="start" type="time" value="09:00"/></div>

      <div><label>Duration (minutes)</label><input id="dur" type="number" min="15" step="15" value="90"/></div>
      <div><label>Assign to (resource id)</label><input id="rid" type="number" min="0" placeholder="Optional"/></div>
    </div>

    <div style="margin-top:10px">
      <label>Notes</label>
      <textarea id="notes" rows="3" placeholder="Optional notes for the crew…"></textarea>
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;">
      <button class="btn" id="saveBtn">Create Service</button>
      <span class="small" id="status"></span>
    </div>
  </div>

  <div class="panel">
    <div class="small">After creating, view it in <a href="/ops-day-board">Ops Day Board</a> or the crew’s <a href="/myday-teams">My Day</a>.</div>
  </div>
</div>

<div id="notice" class="notice"></div>

<script>
const $ = id => document.getElementById(id);
function ymd(d){const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
(function seed(){ const d=new Date(); d.setDate(d.getDate()+1); $('date').value = ymd(d); })();

// Optional prefill from query params
(function prefill(){
  const p = new URLSearchParams(location.search);
  const map = { cust:'customer', phone:'phone', addr:'address', city:'city', state:'state', zip:'zip' };
  Object.entries(map).forEach(([id,key])=>{ const v=p.get(key); if(v) $(id).value=v; });
})();

$('saveBtn').onclick = async ()=>{
  const body = {
    customer_name: $('cust').value.trim(),
    contact_phone: $('phone').value.trim(),
    address_line1: $('addr').value.trim(),
    city: $('city').value.trim(),
    state: $('state').value.trim(),
    zip: $('zip').value.trim(),
    date: $('date').value,
    start_local: $('start').value || '09:00',
    duration_min: Number($('dur').value || 90),
    resource_id: Number($('rid').value || 0) || null,
    notes: $('notes').value.trim()
  };
  if (!body.customer_name) return alert('Customer name is required.');
  if (!body.address_line1) return alert('Address is required.');
  if (!body.date) return alert('Date is required.');

  try {
    $('saveBtn').disabled = true;
    $('status').textContent = 'Saving…';
    const r = await fetch('/api/service', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP '+r.status));
    $('status').textContent = 'Created ✓  Job: '+data.job_id+'  Task: '+data.task_id;
  } catch(e){
    $('status').textContent = 'Error: ' + (e.message||e);
    alert('Create failed: ' + (e.message||e));
  } finally { $('saveBtn').disabled = false; }
};
</script>
</body></html>`);
  });
}
