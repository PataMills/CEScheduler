// pages/incomplete.js
import { requireRolePage } from "../routes/auth.js";

export default function registerOpsDashboardPage(app) {
  app.get(
    "/ops-dashboard",
    requireRolePage(["admin", "ops", "sales"]),
    (_req, res) => {
      res
        .type("html")
        .send(`<!doctype html>
<html>
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ops Dashboard</title>
<link rel="stylesheet" href="/static/appbar.css">
<style>
  body{margin:0;background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto}
  .wrap{max-width:1400px;margin:0 auto;padding:24px}
  h1{margin:0 0 12px;font-size:24px;font-weight:600}
  .subtitle{color:#8b93a3;font-size:14px;margin-bottom:24px}
  .panel{background:#111318;border:1px solid #212432;border-radius:14px;padding:16px;margin:14px 0}
  .card{background:#151822;border:1px solid #212432;border-radius:12px;padding:14px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
  .card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.2)}
  .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px}
  .card-title{font-size:18px;font-weight:600}
  .card-subtitle{color:#8b93a3;font-size:13px}
  .chip{display:inline-block;padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:600;margin:4px}
  .chip.pending{background:#6b7280;color:#fff}
  .chip.ordered{background:#2563eb;color:#fff}
  .chip.received{background:#10b981;color:#fff}
  .chip.hold{background:#f59e0b;color:#000}
  .btn{padding:10px 14px;border-radius:12px;border:1px solid #212432;background:#1a2033;color:#eef2ff;cursor:pointer;font-size:14px;font-weight:500}
  .btn:hover{background:#222a44}
  .btn-sm{padding:6px 10px;font-size:13px}
  .needs-list{margin:10px 0;padding-left:20px}
  .needs-list li{margin:6px 0;color:#c9d1dd}
  .purchase-list{margin-top:10px}
  .purchase-item{background:#0f1220;border:1px solid #212432;border-radius:8px;padding:8px;margin:6px 0;font-size:13px}
  .empty{text-align:center;padding:40px;color:#8b93a3}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .muted{color:#8b93a3}
  .grid{display:grid;gap:14px}
</style>
</head>
<body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>

<div class="wrap">
  <h1>Ops Dashboard</h1>
  <div class="subtitle">Daily operational status: incomplete, late, unassigned, and purchasing hold jobs</div>

  <div class="row" style="gap:8px;margin:8px 0">
    <button class="btn btn-sm" data-tab="incomplete">Incomplete</button>
    <button class="btn btn-sm" data-tab="late">Late</button>
    <button class="btn btn-sm" data-tab="unassigned">Unassigned</button>
    <button class="btn btn-sm" data-tab="purchasing">Purchasing Hold</button>
  </div>

  <div class="panel">
    <div class="row" style="justify-content:space-between;width:100%">
      <div id="status" class="muted">Loading...</div>
      <button class="btn" id="btnRefresh">🔄 Refresh</button>
    </div>
  </div>

  <div id="jobs" class="grid"></div>
</div>

<script>
  const $ = (sel) => document.querySelector(sel);

  const api = {
    listIncomplete: () => fetch('/api/incomplete').then(r => r.json()),
    resolve: (jobId, note) => fetch('/api/incomplete/' + jobId + '/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution_note: note })
    }).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
  };

  function formatDate(iso) {
    if (!iso) return 'N/A';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function chipStatus(status) {
    const s = (status || '').toLowerCase();
    const text = s ? s[0].toUpperCase() + s.slice(1) : 'Status';
    return '<span class="chip ' + s + '">' + text + '</span>';
  }

  async function loadIncomplete() {
    $("#status").textContent = 'Loading…';
    try {
      const jobs = await api.listIncomplete();

      if (!Array.isArray(jobs) || jobs.length === 0) {
        $("#jobs").innerHTML = '<div class="empty">✓ No incomplete jobs. All tasks completed successfully!</div>';
        $("#status").textContent = 'No incomplete jobs';
        return;
      }

      $("#jobs").innerHTML = jobs.map(job => {
        const needsEvents = Array.isArray(job.needs_list) ? job.needs_list : [];
        const purchasing  = Array.isArray(job.purchasing) ? job.purchasing : [];
        const serviceTasks = Array.isArray(job.service_tasks) ? job.service_tasks : [];

        // Dedupe needs by item_name
        const allNeeds = [];
        for (const ev of needsEvents) {
          if (Array.isArray(ev?.needs)) {
            for (const n of ev.needs) {
              if (n && !allNeeds.find(x => x.item_name === n.item_name)) allNeeds.push(n);
            }
          }
        }

        return \`
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">
                  <a href="/sales-details?job=\${job.job_id}" target="_blank" style="color:#6ee7b7">\${job.customer_name ?? '(No customer)'}</a>
                  <span class="muted"> — Job #\${job.job_id}</span>
                </div>
                <div class="card-subtitle">Last reported: \${formatDate(job.last_ts)}</div>
              </div>
              <div class="row">
                <button class="btn btn-sm" onclick="openJob(\${job.job_id})">View Details</button>
                <button class="btn btn-sm" onclick="resolveJob(\${job.job_id})">✓ Resolve</button>
              </div>
            </div>

            <div style="margin:12px 0">
              <strong>Missing/Needed Items (\${allNeeds.length}):</strong>
              <ul class="needs-list">
                \${allNeeds.map(n => \`<li>\${n.item_name ?? ''}</li>\`).join('')}
              </ul>
            </div>

            \${purchasing.length ? \`
              <div style="margin:12px 0">
                <strong>Purchase Queue (\${purchasing.length}):</strong>
                <div class="purchase-list">
                  \${purchasing.map(p => \`
                    <div class="purchase-item">
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>\${p.item_name ?? ''}</div>
                        \${chipStatus(p.status)}
                      </div>
                      \${p.vendor ? \`<div class="muted" style="font-size:11px">Vendor: \${p.vendor}</div>\` : ''}
                      \${p.needed_by ? \`<div class="muted" style="font-size:11px">Needed by: \${formatDate(p.needed_by)}</div>\` : ''}
                    </div>
                  \`).join('')}
                </div>
              </div>
            \` : ''}

            \${serviceTasks.length ? \`
              <div style="margin:12px 0">
                <strong>Service Tasks (\${serviceTasks.length}):</strong>
                \${serviceTasks.map(t => \`
                  <div class="row" style="margin:6px 0">
                    <div>\${t.name ?? 'Service task'}</div>
                    \${t.window_start ? \`<span class="muted">\${formatDate(t.window_start)}</span>\` : ''}
                  </div>
                \`).join('')}
              </div>
            \` : ''}
          </div>
        \`;
      }).join('');

      $("#status").textContent = \`\${jobs.length} incomplete job\${jobs.length !== 1 ? 's' : ''}\`;
    } catch (e) {
      console.error('Load error:', e);
      $("#jobs").innerHTML = '<div class="empty">Error loading incomplete jobs</div>';
      $("#status").textContent = 'Error loading data';
    }
  }

  function openJob(jobId) {
    window.open('/sales-details?job=' + jobId, '_blank');
  }

  async function resolveJob(jobId) {
    const note = prompt('Resolution notes (optional):');
    if (note === null) return;
    try {
      await api.resolve(jobId, (note || 'Manually resolved'));
      alert('Job marked as resolved ✓');
      loads[currentTab]();
    } catch (e) {
      alert('Failed to resolve: ' + e.message);
    }
  }

  async function loadLate() {
    $("#status").textContent = 'Loading late…';
    const rows = await fetch('/api/issues/late?days=7').then(r => r.json());
    if (!rows.length) {
      $("#jobs").innerHTML = '<div class="empty">No late tasks.</div>';
      $("#status").textContent = 'No late';
      return;
    }
    $("#jobs").innerHTML = rows.map(r => \`
      <div class="card">
        <div class="card-header">
          <div class="card-title">\${r.customer_name || '—'}</div>
          <span class="muted">Ended: \${r.window_end ? new Date(r.window_end).toLocaleString() : 'N/A'}</span>
        </div>
        <div class="muted">\${r.resource_name || 'Unassigned'} • \${r.type || 'task'}</div>
      </div>\`).join('');
    $("#status").textContent = \`\${rows.length} late\`;
  }

  async function loadUnassigned() {
    $("#status").textContent = 'Loading unassigned…';
    const rows = await fetch('/api/issues/unassigned?days=14').then(r => r.json());
    if (!rows.length) {
      $("#jobs").innerHTML = '<div class="empty">No unassigned upcoming tasks.</div>';
      $("#status").textContent = 'No unassigned';
      return;
    }
    $("#jobs").innerHTML = rows.map(r => \`
      <div class="card">
        <div class="card-header">
          <div class="card-title">\${r.customer_name || '—'}</div>
          <span class="muted">\${r.window_start ? new Date(r.window_start).toLocaleString() : 'N/A'}</span>
        </div>
        <div class="muted">\${r.type || 'task'}</div>
      </div>\`).join('');
    $("#status").textContent = \`\${rows.length} unassigned\`;
  }

  async function loadPurchasing() {
    $("#status").textContent = 'Loading purchasing…';
    const rows = await fetch('/api/issues/purchasing').then(r => r.json());
    if (!rows.length) {
      $("#jobs").innerHTML = '<div class="empty">No jobs on purchasing hold.</div>';
      $("#status").textContent = 'No purchasing holds';
      return;
    }
    $("#jobs").innerHTML = rows.map(r => \`
      <div class="card">
        <div class="card-header">
          <div class="card-title">\${r.customer_name || '—'}</div>
          <span class="muted">\${Number(r.open_items || 0)} open items</span>
        </div>
        \${(r.items || []).map(i =>
          \`<div class="purchase-item">\${i.item_name || ''} — <span class="chip \${(i.status || '').toLowerCase()}">\${i.status || ''}</span></div>\`
        ).join('')}
      </div>\`).join('');
    $("#status").textContent = \`\${rows.length} on hold\`;
  }

  let currentTab = 'incomplete';
  const loads = {
    incomplete: loadIncomplete,
    late: loadLate,
    unassigned: loadUnassigned,
    purchasing: loadPurchasing
  };

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      loads[currentTab]();
    });
  });

  $("#btnRefresh").onclick = () => loads[currentTab]();

  // initial
  loads[currentTab]();
</script>
</body>
</html>`);
    }
  );
}
