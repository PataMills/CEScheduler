export default function registerSalesServiceSchedule(app){
  // Existing path
  app.get('/sales-service-schedule', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sales - Schedule Service</title>
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
#custResults{position:absolute;left:0;right:0;top:58px;z-index:20;background:#0f1220;border:1px solid var(--line);border-radius:10px;max-height:220px;overflow:auto;display:none}
#custResults .opt{padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--line)}
#custResults .opt:hover{background:#1a2338}
.badge{display:inline-block;padding:4px 8px;border-radius:6px;background:#1a2338;border:1px solid var(--line);font-size:11px;margin-top:4px}
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
        <input id="cust" placeholder="Start typing customer name or #123..." autocomplete="off"/>
        <input id="jobId" type="hidden" />
        <div id="custResults"></div>
        <div id="jobBadge" class="badge" style="display:none"></div>
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
      <button class="btn" id="checkAvailBtn" type="button">Check Availability</button>
      <span id="availStatus" class="small" style="margin-left:10px"></span>
    </div>
    <div id="altTimes" style="margin-top:10px"></div>
    <div id="calendarView" style="margin-top:18px"></div>

    <div style="margin-top:10px">
      <label>Notes</label>
      <textarea id="notes" rows="3" placeholder="Optional notes for the crew..."></textarea>
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;">
      <button class="btn" id="saveBtn">Create Service</button>
      <span class="small" id="status"></span>
    </div>
  </div>

  <div class="panel">
    <div class="small">After creating, view it in <a href="/ops-day-board">Ops Day Board</a> or the crew's <a href="/myday-teams">My Day</a>.</div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
function ymd(d){const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
(function seed(){ const d=new Date(); d.setDate(d.getDate()+1); $('date').value = ymd(d); })();

// Load current user for scoping searches and audit of who scheduled
// Load current user (try /api/auth/me first, then /api/me)
let _currentUserName = '';
(async function loadMe(){
  async function tryJson(u){ try { const r=await fetch(u); if(r.ok) return r.json(); } catch(_){} return null; }
  const d = await (tryJson('/api/auth/me') || tryJson('/api/me')) || {};
  _currentUserName = d?.name || d?.user?.name || '';
  try { window.currentUserName = _currentUserName; } catch(_) {}
})();

// --- typeahead: search existing jobs by customer name and link job_id ---
let _searchTimer = null;
let _selectedJobId = null;
let _selectedJobData = null;

async function searchJobs(term){
  const salesName = _currentUserName || '';
  try {
    const isNum = /^\d+$/.test(term);
    const url = '/api/sales/jobs?query=' + encodeURIComponent(term)
            + (isNum ? ('&id=' + encodeURIComponent(term)) : '')
            + (salesName ? ('&sales=' + encodeURIComponent(salesName)) : '');
    const r = await fetch(url);
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : (Array.isArray(rows?.jobs) ? rows.jobs : []);
  } catch (_) {
    return [];
  }
}

async function fetchJobDetails(jobId){
  try {
    const r = await fetch('/api/jobs/' + jobId);
    if (!r.ok) return null;
    return await r.json();
  } catch(_){ return null; }
}

function showResults(list){
  const box = $('custResults');
  console.log('[ShowResults] list:', list); // Debug log
  if(!list.length){ box.style.display='none'; box.innerHTML=''; return; }
  box.innerHTML = list.slice(0,25).map(function(j){
    const name = String(j.customer_name||'').replace(/[<>]/g,'');
    const proj = String(j.project_name||'').replace(/[<>]/g,'');
    const display = name + (proj ? ' - ' + proj : '');
    return '<div class="opt" data-id="'+j.id+'" data-name="'+name.replace(/"/g,'&quot;')+'" data-job="'+encodeURIComponent(JSON.stringify(j))+'"><div style="display:flex;justify-content:space-between;gap:8px"><div>'+display+'</div><div class="small" style="opacity:0.7">#'+j.id+'</div></div></div>';
  }).join('');
  box.style.display='block';
  console.log('[ShowResults] box.innerHTML:', box.innerHTML); // Debug log
  Array.from(box.querySelectorAll('.opt')).forEach(el => {
    el.addEventListener('click', async () => {
      const id   = el.getAttribute('data-id');
      const name = el.getAttribute('data-name');
      _selectedJobId = id; $('jobId').value = id;
      $('cust').value = name || '';

      // Hide list
      box.style.display='none'; box.innerHTML='';

      // Badge
      const jb = $('jobBadge');
      jb.textContent = 'Linked to Job #' + id;
      jb.style.display='inline-block';

      // Pull phone/address from original bid info if available
      try {
        const r = await fetch('/api/bids/' + id + '/customer-info');
        if (r.ok) {
          const info = await r.json();
          $('phone').value = (info.phone || info.mobile || $('phone').value || '').trim();
          $('addr').value  = (info.address_line1 || info.address || $('addr').value || '').trim();
          $('city').value  = (info.city || $('city').value || '').trim();
          $('state').value = (info.state || $('state').value || '').trim();
          $('zip').value   = (info.zip || $('zip').value || '').trim();
        } else {
          console.warn("Failed to fetch customer info for bid:", id, r.status);
        }
      } catch(err) {
        console.error('Error fetching customer info:', err);
      }

      // Fetch available resources and populate 'Assign to' dropdown
      try {
        const res = await fetch('/api/jobs/' + id + '/resources');
        if (res.ok) {
          const resources = await res.json();
          const ridInput = document.getElementById('rid');
          if (Array.isArray(resources) && resources.length && ridInput) {
            // Replace input with select dropdown
            const select = document.createElement('select');
            select.id = 'rid';
            select.name = 'rid';
            select.className = ridInput.className;
            select.innerHTML = '<option value="">Optional</option>' + resources.map(r => '<option value="' + r.id + '">' + r.name + '</option>').join('');
            ridInput.parentNode.replaceChild(select, ridInput);
          }
        }
      } catch (err) {
        console.error('Error fetching resources:', err);
      }

      $('status').textContent = 'Job details loaded.';
    });
  });
}

$('cust').addEventListener('input', function(){
  const term = this.value.trim();
  console.log('[Search Input]', term); // Debug log
  if (!term) { $('custResults').style.display='none'; return; }
  $('custResults').style.display='block';
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    const results = await searchJobs(term);
    console.log('[Search Results]', results); // Debug log
    showResults(results);
  }, 300);
});

// --- availability checking and calendar UI ---
let _checkAvailTimer = null;
let _lastCheckedParams = null;

function showAvailability(data){
  const box = $('altTimes');
  if (!box) return;

  // normalize payload
  const days = Array.isArray(data.days) ? data.days : [];

  // summary/status text
  $('availStatus').textContent = days.length
    ? 'Availability loaded.'
    : 'No availability for the selected time.';

  // table of days + slot counts
  let html = '<table style="width:100%;border-collapse:collapse;margin-top:8px">'
           + '<tr><th style="text-align:left;padding:6px 4px">Date</th>'
           + '<th style="text-align:left;padding:6px 4px">Available Slots</th>'
           + '<th style="text-align:left;padding:6px 4px">Tasks</th></tr>';

  for (var i = 0; i < days.length; i++) {
    var day = days[i];
    html += '<tr>'
         +  '<td style="padding:6px 4px">' + (day.date || '—') + '</td>'
         +  '<td style="padding:6px 4px">';
    if (day.available_slots && day.available_slots.length) {
      html += day.available_slots.join(', ');
    } else {
      html += '<span style="color:#eab308">No slots</span>';
    }
    html +=   '</td>'
         +    '<td style="padding:6px 4px">' + (day.task_count || 0) + '</td>'
         +  '</tr>';
  }
  html += '</table>';

  // optional: suggested alternatives
  if (Array.isArray(data.alternatives) && data.alternatives.length) {
    html += '<div style="margin-top:8px;color:#38bdf8">Suggested alternative times:</div><ul>';
    for (var j = 0; j < data.alternatives.length; j++) {
      var a = data.alternatives[j];
      html += '<li>' + (a.date || '') + ' at ' + (a.start || '') + (a.type ? ' (' + a.type + ')' : '') + '</li>';
    }
    html += '</ul>';
  }

  box.innerHTML = html;
  box.style.display = 'block';

  // render the calendar tiles using the same days array
  renderCalendar(days);
}

$('checkAvailBtn').addEventListener('click', async () => {
  const params = {
    date: $('date').value,
    start: $('start').value,
    duration: $('dur').value,
    rid: $('rid').value,
  };

  if (!params.date || !params.start || !params.duration) {
    $('availStatus').textContent = 'Please fill in all required fields for availability check.';
    return;
  }

  $('checkAvailBtn').disabled = true;
  $('availStatus').textContent = 'Checking availability...';

  try {
    const r = await fetch('/api/sales/check-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data || data.success === false) {
      throw new Error((data && data.message) || 'No availability data.');
    }

    // Use the fixed renderer
    showAvailability(data);
  } catch (error) {
    console.error('Error checking availability:', error);
    $('availStatus').textContent = 'Error checking availability.';
    // clear the previous alt-times if any
    $('altTimes').innerHTML = '';
    renderCalendar([]); // clear calendar
  } finally {
    $('checkAvailBtn').disabled = false;
  }
});

// --- calendar view for availability ---
function renderCalendar(days) {
    const container = $('calendarView');
    container.innerHTML = ''; // Clear existing content

    if (!days.length) {
      container.innerHTML = '<div style="color:#eab308;padding:10px">No availability data to display.</div>';
      return;
    }

       // Create calendar grid
    let html = '<div style="display:grid;grid-template-columns:repeat(' + (days.length > 7 ? 7 : days.length) + ',1fr);gap:10px;">';
    for (const day of days) {
      const date = new Date(day.date);
      const dayLabel = date.toLocaleString('default', { weekday: 'short', month: 'numeric', day: 'numeric' });
      html += '<div style="padding:8px;background:#1a2033;border-radius:8px;text-align:center;">' + dayLabel + '</div>';
    }
    html += '</div>';
    
    // Add availability slots
    html += '<div style="margin-top:10px;">';
    for (const day of days) {
      html += '<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">';
      if (day.available_slots && day.available_slots.length) {
        for (const slot of day.available_slots) {
          html += '<div style="padding:8px;background:#0f1220;border-radius:8px;display:flex;">';
          html += '<div style="flex-grow: 1;">' + slot + '</div>';
          html += '<div style="font-size:12px;color:#8b93a3;">Tasks: ' + day.task_count + '</div>';
          html += '</div>';
        }
      } else {
        html += '<div style="padding:8px;background:#0f1220;border-radius:8px;text-align:center;color:#eab308;">No available slots</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    
    container.innerHTML = html;
  }

  // Initial render
  renderCalendar([]);

  // --- save service task ---
  $('saveBtn').addEventListener('click', async () => {
    const params = {
      job_id: $('jobId').value.trim(),
      date: $('date').value.trim(),
      start: $('start').value.trim(),
      duration: $('dur').value.trim(),
      rid: $('rid').value.trim(),
      notes: $('notes').value.trim(),
    };

    // Basic validation
    if (!params.job_id || !params.date || !params.start || !params.duration) {
      $('status').textContent = 'Please fill in all required fields.';
      return;
    }

    $('status').textContent = 'Creating service task...';
    try {
      const r = await fetch('/api/sales/create-service-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!r.ok) throw new Error('Network response was not ok');
      const data = await r.json();
      if (!data.success) throw new Error(data.message || 'Unknown error');

      $('status').textContent = 'Service task created successfully!';
      $('saveBtn').disabled = true;

      // Optionally, redirect or clear form
      // window.location.href = '/somewhere';
      // or
      // $('jobId').value = ''; $('cust').value = ''; ...clear other fields...
    } catch (error) {
      console.error('Error creating service task:', error);
      $('status').textContent = 'Error creating service task.';
    }
  });
</script>
</body>
</html>`);
  });
}
