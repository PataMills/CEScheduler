// pages/opsDayBoard.js
export default function registerOpsDayBoard(app){
  app.get("/ops-day-board", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Ops Day Board</title>
<link rel="stylesheet" href="/static/appbar.css">
<style>
:root{ --bg:#0b0c10; --panel:#111318; --card:#151822; --line:#212432; --text:#eef2ff; --muted:#8b93a3; --accent:#6ee7b7; --good:#16a34a; --warn:#f59e0b; --bad:#ef4444; }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial}
.wrap{max-width:1400px;margin:0 auto;padding:24px}
h1{margin:0 0 12px;font-size:24px;font-weight:600}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.muted{color:var(--muted)}
.btn{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:#1a2033;color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:background 0.15s}
.btn:hover{background:#222a44}
.btn:disabled{opacity:0.5;cursor:not-allowed}
.btn-sm{padding:6px 10px;font-size:13px}
.grid{display:grid;gap:14px}
.group{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--panel);box-shadow:0 4px 12px rgba(0,0,0,0.15)}
.group h3{margin:0 0 8px;font-size:18px;font-weight:600}
.small{font-size:13px}
.badge{display:inline-block;padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:600;color:#fff}
.badge.scheduled{background:#6b7280}
.badge.in_progress{background:#2563eb}
.badge.complete{background:#16a34a}
.avail{height:10px;background:#0d1020;border-radius:9999px;overflow:hidden;margin:10px 0}
.fill{height:100%;transition:width 0.3s}
.card{border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0;background:var(--card);box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:transform 0.15s,box-shadow 0.15s}
.card:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,0.2)}
.card .top{display:flex;justify-content:space-between;gap:10px;align-items:center}
.right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
select,input{background:#0f1220;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px}
select:focus,input:focus{outline:2px solid var(--accent);outline-offset:2px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.toolbar{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
label{font-size:14px;color:var(--muted);font-weight:500}
.date-display{background:#0f1220;border:1px solid var(--line);border-radius:10px;padding:10px 14px;cursor:pointer;user-select:none;font-size:14px;font-weight:500;min-width:140px;text-align:center}
.date-display:hover{background:#151822;border-color:var(--accent)}
input[type="date"]{position:absolute;opacity:0;pointer-events:none}
</style>
</head>
<body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>

<div class="wrap">
  <div class="header">
    <div>
      <h1>Ops Day Board</h1>
      <div class="muted small">Team capacity, task assignments, and quick rescheduling.</div>
    </div>
  </div>

  <div class="toolbar">
    <label>Date</label>
    <div class="date-display" id="dateDisplay" title="Click to change date"></div>
    <input id="day" type="date"/>
    <button class="btn" id="btnLoad">Load Day</button>
      <button class="btn" id="btnScan" title="Scan for late/overdue tasks and send reminders">🔔 Scan Now</button>
    <div style="flex:1"></div>
    <div id="status" class="muted small">Pick a date and press Load Day.</div>
  </div>

  <div id="groups" class="grid"></div>
</div>

<script src="/static/appbar.js"></script>

<script>
const $ = s => document.querySelector(s);
const api = {
  schedule: d => fetch('/api/schedule?date='+encodeURIComponent(d)).then(r=>r.json()),
  resources: () => fetch('/api/resources').then(r=>r.json()),
  assign: (taskId, resource_id) => fetch('/api/tasks/'+taskId+'/assign', {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ resource_id })
  }).then(r=>r.json()),
  setStatus: (taskId, status) => fetch('/api/tasks/'+taskId+'/status', {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status })
  }).then(r=>r.json()),
  reschedule: (taskId, newDate) => fetch('/api/tasks/reschedule', {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task_id: taskId, new_date: newDate })
  }).then(r=>r.json()),
  nudge: (taskId) => fetch('/api/reminders/'+taskId+'/nudge', {
    method:'POST', headers:{'Content-Type':'application/json'}
  }).then(r=>r.json()),
    scanReminders: () => fetch('/api/reminders/scan', {
      method:'POST', headers:{'Content-Type':'application/json'}
    }).then(r=>r.json()),
};
function ymd(d){const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
function friendlyDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const tom = new Date(today); tom.setDate(tom.getDate()+1);
  const dateOnly = new Date(d); dateOnly.setHours(0,0,0,0);
  if(dateOnly.getTime()===today.getTime()) return 'Today';
  if(dateOnly.getTime()===tom.getTime()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
}
(function seedTomorrow(){
  const x=$("#day"); 
  const d=new Date(); 
  d.setDate(d.getDate()+1); 
  x.value=ymd(d);
  $("#dateDisplay").textContent = friendlyDate(x.value);
})();

// Click on date display opens the native date picker
$("#dateDisplay").onclick = ()=> $("#day").showPicker ? $("#day").showPicker() : $("#day").focus();
$("#day").onchange = ()=> {
  $("#dateDisplay").textContent = friendlyDate($("#day").value);
  load();
};

function badge(s){return '<span class="badge '+s+'">'+s.replace('_',' ')+'</span>';}
function barColor(pct){return pct<60?'#16a34a':pct<90?'#f59e0b':'#ef4444';}

function groupBy(arr, key){const m={}; arr.forEach(r=>{const k=r[key]||'Unassigned'; (m[k]=m[k]||[]).push(r)}); return m;}

async function load(){
  const d = $("#day").value;
  if(!d){ alert('Pick a date'); return; }
  $("#status").textContent = 'Loading…';
  const [rows, resources] = await Promise.all([api.schedule(d), api.resources()]);
  const capMap = Object.fromEntries(resources.map(r=>[r.name, r.capacity_min_per_day || 450]));
  const idByName = Object.fromEntries(resources.map(r=>[r.name, r.id]));
  const groups = groupBy(rows, 'resource_name');
  const host = $("#groups"); host.innerHTML = '';

  Object.entries(groups).forEach(([name, list])=>{
    const total = list.reduce((s,t)=> s + (t.duration_min||0), 0);
    const cap = capMap[name] ?? 450;
    const pct = Math.max(0, Math.min(100, Math.round(100*total/cap)));

    const wrap = document.createElement('div'); wrap.className='group';
    const h = document.createElement('div');
    h.innerHTML = '<h3>'+name+'</h3><div class="muted small">'+Math.round(total)+' / '+cap+' min ('+pct+'%)</div>';
    h.style.display='flex'; h.style.justifyContent='space-between'; h.style.alignItems='center';
    wrap.appendChild(h);

    const rail = document.createElement('div'); rail.className='avail';
    const fill = document.createElement('div'); fill.className='fill'; fill.style.width=pct+'%'; fill.style.background=barColor(pct);
    rail.appendChild(fill); wrap.appendChild(rail);

    list.forEach(t=>{
      const card = document.createElement('div'); card.className='card';
      const top  = document.createElement('div'); top.className='top';
      const left = document.createElement('div');
      left.innerHTML =
        '<div style="font-weight:600">'+(t.customer_name||t.job_id)+'</div>'+
        '<div class="muted small">'+new Date(t.window_start).toLocaleTimeString()+
        ' → '+new Date(t.window_end).toLocaleTimeString()+'</div>'+
        '<div class="muted small">'+(t.name||t.type||'')+'</div>';
      const right = document.createElement('div'); right.className='right';
      const sel = document.createElement('select'); sel.id = 'sel-'+t.task_id;
      resources.forEach(r=>{ const o=document.createElement('option'); o.value=r.id; o.textContent=r.name; if(r.name===t.resource_name) o.selected=true; sel.appendChild(o); });
      const btnAssign = document.createElement('button'); btnAssign.className='btn btn-sm'; btnAssign.textContent='Assign';
      btnAssign.onclick = async ()=>{ await api.assign(t.task_id, Number(sel.value)); load(); };
      const btnReschedule = document.createElement('button'); btnReschedule.className='btn btn-sm'; btnReschedule.textContent='Reschedule';
      btnReschedule.onclick = async ()=>{ 
        const newDate = prompt('Reschedule to (YYYY-MM-DD):', t.window_start ? t.window_start.split('T')[0] : d); 
        if(!newDate) return;
        try {
          const result = await api.reschedule(t.task_id, newDate);
          if(result.critical_path_adjusted) {
            alert(\`Task rescheduled. Critical path adjusted: \${result.adjusted_tasks} task(s) updated.\`);
          }
          load();
        } catch(err) {
          alert('Reschedule failed: ' + err.message);
        }
      };
      const btnReset = document.createElement('button'); btnReset.className='btn btn-sm'; btnReset.textContent='Reset';
      btnReset.onclick = async ()=>{ 
        if(!confirm('Reset this task to scheduled status?')) return;
        await api.setStatus(t.task_id,'scheduled'); 
        load(); 
      };
        const btnNudge = document.createElement('button'); btnNudge.className='btn btn-sm'; btnNudge.textContent='Nudge';
        btnNudge.onclick = async ()=>{ 
          try {
            await api.nudge(t.task_id);
            alert('Nudge sent! Crew notified via Slack.');
          } catch(err) {
            alert('Nudge failed: ' + err.message);
          }
        };
      const state = document.createElement('span'); state.innerHTML = badge(t.status||'scheduled');

        right.appendChild(state); right.appendChild(sel); right.appendChild(btnAssign); right.appendChild(btnReschedule); right.appendChild(btnNudge); right.appendChild(btnReset);
      top.appendChild(left); top.appendChild(right);
      card.appendChild(top);
      wrap.appendChild(card);
    });

    host.appendChild(wrap);
  });

  $("#status").textContent = 'Loaded '+rows.length+' tasks.';
}
document.getElementById('btnLoad').addEventListener('click', load);
  document.getElementById('btnScan').addEventListener('click', async ()=>{
    try {
      $("#status").textContent = 'Scanning for late tasks...';
      const result = await api.scanReminders();
      $("#status").textContent = \`Scan complete: \${result.nudged} nudged, \${result.escalated} escalated, \${result.past_end} past end.\`;
      if(result.nudged + result.escalated + result.past_end === 0) {
        alert('✓ All tasks on track!');
      } else {
        alert(\`Reminders sent:\n- \${result.nudged} late start nudges\n- \${result.escalated} escalations\n- \${result.past_end} past end alerts\`);
      }
    } catch(err) {
      $("#status").textContent = 'Scan failed.';
      alert('Scan failed: ' + err.message);
    }
  });
</script>
</body></html>`);
  });
}
