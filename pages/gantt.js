// pages/gantt.js
export default function registerGanttPage(app, pool){
  // Route: /gantt
  app.get("/gantt", async (req, res) => {
    try {
      // quick list of recent jobs for the dropdown
      const jobs = await pool.query(`
        SELECT id
        FROM public.bids
        ORDER BY id DESC
        LIMIT 50
        `);
        const opts = jobs.rows.map(j =>
          `<option value="${j.id}">#${j.id}</option>`
        ).join("");
      res.send(`<!doctype html>
<html>

  <link rel="stylesheet" href="/static/appbar.css">
  <title>Job Gantt</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body{background:#0f1320;color:#e9eefc;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif;margin:0;}
    .wrap{padding:16px 18px;max-width:1200px;margin:0 auto;}
    .row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}
    select, input, button{background:#0f1320;color:#e9eefc;border:1px solid #222943;border-radius:8px;padding:8px 10px}
    button.primary{background:#4051a3;color:#e9eefc;border:0}
    #gantt{background:#12172a;border:1px solid #222943;border-radius:12px;padding:10px;overflow:auto}
    .help{opacity:.7;font-size:12px}
  </style>
  <!-- Frappe Gantt (tiny dependency; same as any CDN you already use) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/frappe-gantt@0.6.1/dist/frappe-gantt.css">

<script src="/static/appbar.js"></script>

  
<script src="/static/admin-nav.js"></script>
  <div class="wrap">
    <h2 style="margin:8px 0 12px;">Job Gantt</h2>

    <div class="row">
      <label>Job:</label>
      <select id="jobSel">${opts}</select>

      <label style="margin-left:14px;">Install date:</label>
      <input id="installDate" type="date">
      <button id="autoBtn" class="primary">Auto-schedule</button>

      <button id="refreshBtn">Refresh</button>
      <span class="help">Tip: Auto-schedule backfills Purchasing → Manufacturing → Assembly → Delivery → Install from the selected install date.</span>
    </div>

    <div id="gantt" style="min-height:420px"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/frappe-gantt@0.6.1/dist/frappe-gantt.min.js"></script>
  <script>
  const $ = (id)=>document.getElementById(id);
  function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}


  async function load(jobId){
    if(!jobId) return;
    const base = new Date(); base.setHours(8,0,0,0);
    const r = await fetch('/api/tasks/by-job/'+jobId);
    const raw = await r.json();

    const tasks = [];
    for (const t of (Array.isArray(raw)?raw:[])) {
      const startD = coerceDate(t.window_start, base);
      let endD;
      if (t.window_end) endD = coerceDate(t.window_end, startD);
      else if (t.duration_min && Number(t.duration_min) > 0)
        endD = new Date(startD.getTime() + Number(t.duration_min)*60000);
      else endD = new Date(startD.getTime() + 8*3600000);

      tasks.push({
        id: String(t.id),
        name: esc(t.name || t.type || ('Task '+t.id)),
        start: toYMD(startD),
        end:   toYMD(endD),
        progress: 100,
        dependencies: (Array.isArray(t.depends_on)&&t.depends_on.length)
          ? t.depends_on.map(String).join(',') : undefined,
        custom_class: 'phase-'+(t.type||'task')
      });
    }

    if (!tasks.length) {
      $('gantt').innerHTML = '<div style="padding:16px;opacity:.7;">No tasks for this job yet.</div>';
      return;
    }

    $('gantt').innerHTML = '';
    try {
      new Gantt('#gantt', tasks, { view_mode:'Day', custom_popup_html:null });
    } catch (e) {
      console.error('Gantt render error', e, tasks);
      $('gantt').innerHTML = '<div style="padding:16px;color:#ff9b9b;">Could not render Gantt (invalid dates). Check console for details.</div>';
    }
  }
async function loadJobs(){
    const sel = document.getElementById('jobSel');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading…</option>';

    try {
      // 1) try install-jobs
      let list = [];
      let r = await fetch('/api/install-jobs');
      if (r.ok) {
        const jobs = await r.json();
        list = Array.isArray(jobs) ? jobs : [];
      }
      sel.innerHTML = '';
      if (list.length) {
        for (const row of list) {
          const id = Number(row.id);
          if (!id) continue;
          const opt = document.createElement('option');
          opt.value = String(id);
          opt.textContent = 'Job #' + id;
          opt.dataset.kind = 'job';          // <— mark as install_job
          sel.appendChild(opt);
        }
      } else {
        // 2) fallback to bids if no install jobs
        const rb = await fetch('/api/bids?limit=50');
        const bids = rb.ok ? await rb.json() : [];
        if (!Array.isArray(bids) || !bids.length) {
          sel.innerHTML = '<option value="">No jobs or bids found</option>';
          return;
        }
        for (const b of bids) {
          const id = Number(b.id);
          if (!id) continue;
          const label = ['Bid #'+id];
          if (b.builder) label.push('— ' + b.builder);
          if (b.home_address) label.push('— ' + b.home_address);
          const opt = document.createElement('option');
          opt.value = String(id);
          opt.textContent = label.join(' ');
          opt.dataset.kind = 'bid';          // <— mark as bid
          sel.appendChild(opt);
        }
      }

      if (sel.options.length) {
        if (!sel.value) sel.selectedIndex = 0;
        const kind = sel.options[sel.selectedIndex].dataset.kind;
        // If we only have bids, load() may return empty until autoschedule creates tasks
        loadCurrent(kind);
      }

      sel.onchange = () => {
        const kind = sel.options[sel.selectedIndex].dataset.kind;
        loadCurrent(kind);
      };

      function loadCurrent(kind){
        const id = sel.value;
        if (kind === 'job') load(id);  // existing install_job tasks
        else {
          // bids have no tasks yet — show placeholder
          document.getElementById('gantt').innerHTML =
            '<div style="padding:16px;opacity:.7;">Select an install date and click Auto-schedule to create tasks for this bid.</div>';
        }
      }
    } catch (e) {
      console.error('loadJobs error:', e);
      sel.innerHTML = '<option value="">Error loading</option>';
    }
  }

  async function autoschedule(){
    const sel = document.getElementById('jobSel');
    const kind = sel.options[sel.selectedIndex]?.dataset.kind || 'job';
    const id = Number(sel.value || 0);
    const d = document.getElementById('installDate').value;
    if (!id || !d) { alert('Pick a job/bid and an install date'); return; }
    const btn = document.getElementById('autoBtn');
    btn.disabled = true; btn.textContent = 'Scheduling…';
    try {
      const body = (kind === 'job')
        ? { job_id: id, install_date: d }
        : { bid_id: id, install_date: d };
      const r = await fetch('/api/tasks/auto-schedule', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.detail || j.error || ('HTTP '+r.status));

      // After scheduling from a bid, we get a new job — reload dropdowns
      if (kind === 'bid' && j.job_id) {
        await loadJobs();
        // select the new job if present
        const selEl = document.getElementById('jobSel');
        for (let i=0;i<selEl.options.length;i++){
          if (selEl.options[i].dataset.kind === 'job' && Number(selEl.options[i].value) === Number(j.job_id)){
            selEl.selectedIndex = i;
            break;
          }
        }
      } else {
        await load(id);
      }
    } catch (e) {
      alert('Auto-schedule failed: ' + e.message);
      console.error(e);
    } finally {
      btn.disabled = false; btn.textContent = 'Auto-schedule';
    }
  }

  // wire and boot
  document.getElementById('jobSel').addEventListener('change', ()=>{});
  document.getElementById('refreshBtn').addEventListener('click', ()=> {
    const sel = document.getElementById('jobSel');
    const kind = sel.options[sel.selectedIndex]?.dataset.kind || 'job';
    if (kind === 'job') load(sel.value);
  });
  document.getElementById('autoBtn').addEventListener('click', autoschedule);

  loadJobs();   
</script>


</body>
</html>`);
    } catch (e) {
      console.error("[GANTT PAGE ERR]", e);
      res.status(500).send("Gantt page error");
    }
  });
}


