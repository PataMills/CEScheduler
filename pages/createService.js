// pages/createService.js
export default function registerCreateService(app){
  app.get("/create-service", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Create Service</title>
<style>
:root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#8b93a3; }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial}
.wrap{max-width:800px;margin:0 auto;padding:22px}
h1{margin:0 0 10px;font-size:22px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin:12px 0}
.grid{display:grid;gap:10px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
input,select,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0f1220;color:var(--text)}
.btn{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:#1a2033;color:#eef2ff;cursor:pointer}
.btn:hover{background:#222a44}
.small{color:var(--muted);font-size:12px}
#custSuggest{position:absolute;top:100%;left:0;right:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;margin-top:4px;max-height:220px;overflow:auto;z-index:10;display:none}
#custSuggest .opt{padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--line)}
#custSuggest .opt:hover{background:#1a2338}
.badge{display:inline-block;padding:4px 8px;border-radius:6px;background:#1a2338;border:1px solid var(--line);font-size:11px;margin-top:4px}
</style>
</head>
<body>
<div class="wrap">
  <h1>Create Service</h1>
  <div class="small">Minimal flow for service scheduling. Adds a <em>service</em> task for the chosen date/time.</div>

  <div class="panel">
    <div class="grid g2">
      <div style="position:relative">
        <label>Customer Name *</label>
        <input id="cust" placeholder="Start typing customer name or #123..."/>
        <div id="custSuggest"></div>
        <input id="jobId" type="hidden"/>
        <div id="jobBadge"></div>
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
      <textarea id="notes" rows="3" placeholder="Optional notes for the crew..."></textarea>
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;">
      <button class="btn" id="saveBtn">Create Service</button>
      <span class="small" id="status"></span>
    </div>
  </div>

  <div class="panel">
    <div class="small">After creating, view it in <a href="/ops-day-board">Ops Day Board</a> (by date) or crew’s <a href="/myday-teams">My Day</a>.</div>
  </div>
</div>

<script src="/static/appbar.js"></script>

<script>
const $ = id => document.getElementById(id);
function ymd(d){const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
(function seed(){ const d=new Date(); d.setDate(d.getDate()+1); $('date').value = ymd(d); })();

// Customer search with job linking
let searchTimeout;
$('cust').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const query = $('cust').value.trim();
  if (!query) {
    $('custSuggest').style.display = 'none';
    $('custSuggest').innerHTML = '';
    return;
  }
  searchTimeout = setTimeout(async () => {
    try {
      console.log('[Customer Search] Searching for:', query);
      const res = await fetch('/api/jobs/search?term=' + encodeURIComponent(query));
      console.log('[Customer Search] Response status:', res.status);
      const jobs = await res.json();
      console.log('[Customer Search] Found jobs:', jobs);
      if (!Array.isArray(jobs) || !jobs.length) {
        $('custSuggest').innerHTML = '<div class="opt" style="color:var(--muted);cursor:default">No matching jobs found</div>';
        $('custSuggest').style.display = '';
        return;
      }
      $('custSuggest').innerHTML = jobs.map(j => 
        '<div class="opt" data-id="' + j.id + '" data-name="' + (j.customer_name || '') + '">' +
        (j.customer_name || 'Job') + ' - #' + j.id + 
        '</div>'
      ).join('');
      $('custSuggest').style.display = '';
      
      // Wire click handlers
      $('custSuggest').querySelectorAll('.opt[data-id]').forEach(opt => {
        opt.onclick = async () => {
          const jid = opt.getAttribute('data-id');
          const name = opt.getAttribute('data-name');
          $('jobId').value = jid;
          $('cust').value = name;
          $('jobBadge').innerHTML = '<span class="badge">🔗 Linked to Job #' + jid + '</span>';
          $('custSuggest').style.display = 'none';
          $('custSuggest').innerHTML = '';
          
          // Auto-populate address and phone from job details
          $('status').textContent = 'Loading job details...';
          try {
            const detailRes = await fetch('/api/jobs/' + jid);
            if (detailRes.ok) {
              const details = await detailRes.json();
              if (details.address_line1) $('addr').value = details.address_line1;
              if (details.city) $('city').value = details.city;
              if (details.state) $('state').value = details.state;
              if (details.zip) $('zip').value = details.zip;
              if (details.contact_phone) $('phone').value = details.contact_phone;
              $('status').textContent = 'Job details loaded - address and phone populated';
              setTimeout(() => { $('status').textContent = ''; }, 3000);
            } else {
              $('status').textContent = 'Could not load job details';
              setTimeout(() => { $('status').textContent = ''; }, 3000);
            }
          } catch(e) {
            console.error('Error loading job details:', e);
            $('status').textContent = 'Error loading job details';
            setTimeout(() => { $('status').textContent = ''; }, 3000);
          }
        };
      });
    } catch (e) {
      console.error('Search error:', e);
      $('custSuggest').style.display = 'none';
    }
  }, 300);
});

// Click outside to close
document.addEventListener('click', (e) => {
  if (!e.target.closest('#cust') && !e.target.closest('#custSuggest')) {
    $('custSuggest').style.display = 'none';
  }
});

$('saveBtn').onclick = async ()=>{
  const jobId = $('jobId').value ? Number($('jobId').value) : null;
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
    job_id: jobId
  };
  if (!body.customer_name) return alert('Customer name is required.');
  if (!body.address_line1) return alert('Address is required.');
  if (!body.date) return alert('Date is required.');

  try {
    $('saveBtn').disabled = true;
    $('status').textContent = 'Saving...';
    const r = await fetch('/api/service', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    const data = await r.json().catch(()=> ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP '+r.status));
    $('status').textContent = 'Created - Job: '+data.job_id+' Task: '+data.task_id;
  } catch(e){
    $('status').textContent = 'Error: ' + (e.message||e);
    alert('Create failed: ' + (e.message||e));
  } finally {
    $('saveBtn').disabled = false;
  }
};
</script>
</body></html>`);
  });
}
