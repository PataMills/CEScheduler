const $ = (s) => document.querySelector(s);
const api = {
  list: () => fetch('/api/ops-dashboard').then((r) => r.json()),
  resolve: (jobId, note) =>
    fetch('/api/ops-dashboard/' + jobId + '/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution_note: note }),
    }).then((r) => r.json()),
};

function formatDate(iso) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function chipStatus(status) {
  const map = {
    pending: 'Pending',
    ordered: 'Ordered',
    received: 'Received',
    hold: 'Hold',
    scheduled: 'Scheduled',
  };
  return `<span class="chip ${status}">${map[status] || status}</span>`;
}

async function loadOpsDashboard() {
  document.querySelector('#status').textContent = 'Loading...';
  try {
    const jobs = await api.list();
    if (jobs.length === 0) {
      document.querySelector('#jobs').innerHTML =
        '<div class="empty">✓ No ops dashboard jobs. All tasks completed successfully!</div>';
      document.querySelector('#status').textContent = 'No ops dashboard jobs';
      return;
    }
    document.querySelector('#jobs').innerHTML = jobs
      .map((job) => {
        const needs = Array.isArray(job.needs_list) ? job.needs_list : [];
        const purchasing = Array.isArray(job.purchasing) ? job.purchasing : [];
        const serviceTasks = Array.isArray(job.service_tasks) ? job.service_tasks : [];
        const allNeeds = [];
        needs.forEach((event) => {
          if (Array.isArray(event.needs)) {
            event.needs.forEach((n) => {
              if (!allNeeds.find((existing) => existing.item_name === n.item_name)) {
                allNeeds.push(n);
              }
            });
          }
        });
        return `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">
                <a href="/sales-details?job=${job.job_id}" target="_blank" style="color:#6ee7b7">${job.customer_name}</a>
                <span class="muted"> - Job #${job.job_id}</span>
              </div>
              <div class="card-subtitle">Last reported: ${formatDate(job.last_ts)}</div>
            </div>
            <div class="row">
              <button class="btn btn-sm" onclick="openJob(${job.job_id})">View Details</button>
              <button class="btn btn-sm" onclick="resolveJob(${job.job_id})">✓ Resolve</button>
            </div>
          </div>
          <div style="margin:12px 0">
            <strong>Missing/Needed Items (${allNeeds.length}):</strong>
            <ul class="needs-list">
              ${allNeeds.map((n) => `<li>${n.item_name}</li>`).join('')}
            </ul>
          </div>
          ${purchasing.length > 0
            ? `
            <div style="margin:12px 0">
              <strong>Purchase Queue (${purchasing.length}):</strong>
              <div class="purchase-list">
                ${purchasing
                  .map(
                    (p) => `
                  <div class="purchase-item">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <div>${p.item_name}</div>
                      ${chipStatus(p.status)}
                    </div>
                    ${p.vendor ? `<div class="muted" style="font-size:11px">Vendor: ${p.vendor}</div>` : ''}
                    ${p.needed_by ? `<div class="muted" style="font-size:11px">Needed by: ${formatDate(p.needed_by)}</div>` : ''}
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
            : ''}
          ${serviceTasks.length > 0
            ? `
            <div style="margin:12px 0">
              <strong>Service Tasks (${serviceTasks.length}):</strong>
              ${serviceTasks
                .map(
                  (t) => `
                <div class="row" style="margin:6px 0">
                  <div>${t.name}</div>
                  ${chipStatus(t.status)}
                  ${t.window_start ? `<span class="muted">${formatDate(t.window_start)}</span>` : ''}
                </div>
              `
                )
                .join('')}
            </div>
          `
            : ''}
        </div>
      `;
      })
      .join('');
    document.querySelector('#status').textContent = `${jobs.length} ops dashboard job${jobs.length !== 1 ? 's' : ''}`;
  } catch (e) {
    console.error('Load error:', e);
    document.querySelector('#jobs').innerHTML =
      '<div class="empty">Error loading ops dashboard jobs</div>';
    document.querySelector('#status').textContent = 'Error loading data';
  }
}

function openJob(jobId) {
  window.open('/sales-details?job=' + jobId, '_blank');
}

async function resolveJob(jobId) {
  const note = prompt('Resolution notes (optional):');
  if (note === null) return; // User cancelled
  try {
    await api.resolve(jobId, note || 'Manually resolved');
    alert('Job marked as resolved ✓');
    loadOpsDashboard();
  } catch (e) {
    alert('Failed to resolve: ' + e.message);
  }
}

async function loadLate() {
  document.querySelector('#status').textContent = 'Loading late…';
  const rows = await fetch('/api/issues/late?days=7').then((r) => r.json());
  if (!rows.length) {
    document.querySelector('#jobs').innerHTML = '<div class="empty">No late tasks.</div>';
    document.querySelector('#status').textContent = 'No late';
    return;
  }
  document.querySelector('#jobs').innerHTML = rows
    .map(
      (r) => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${r.customer_name || '—'}</div>
        <span class="muted">Ended: ${new Date(r.window_end).toLocaleString()}</span>
      </div>
      <div class="muted">${r.resource_name || 'Unassigned'} • ${r.type || 'task'}</div>
    </div>`
    )
    .join('');
  document.querySelector('#status').textContent = `${rows.length} late`;
}

async function loadUnassigned() {
  document.querySelector('#status').textContent = 'Loading unassigned…';
  const rows = await fetch('/api/issues/unassigned?days=14').then((r) => r.json());
  if (!rows.length) {
    document.querySelector('#jobs').innerHTML =
      '<div class="empty">No unassigned upcoming tasks.</div>';
    document.querySelector('#status').textContent = 'No unassigned';
    return;
  }
  document.querySelector('#jobs').innerHTML = rows
    .map(
      (r) => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${r.customer_name || '—'}</div>
        <span class="muted">${new Date(r.window_start).toLocaleString()}</span>
      </div>
      <div class="muted">${r.type || 'task'}</div>
    </div>`
    )
    .join('');
  document.querySelector('#status').textContent = `${rows.length} unassigned`;
}

async function loadPurchasing() {
  document.querySelector('#status').textContent = 'Loading purchasing…';
  const rows = await fetch('/api/issues/purchasing').then((r) => r.json());
  if (!rows.length) {
    document.querySelector('#jobs').innerHTML =
      '<div class="empty">No jobs on purchasing hold.</div>';
    document.querySelector('#status').textContent = 'No purchasing holds';
    return;
  }
  document.querySelector('#jobs').innerHTML = rows
    .map(
      (r) => `
    <div class="card">
      <div class="card-header">
        <div class="card-title">${r.customer_name || '—'}</div>
        <span class="muted">${r.open_items} open items</span>
      </div>
      ${(r.items || [])
        .map(
          (i) =>
            `<div class="purchase-item">${i.item_name} — <span class="chip ${i.status}">${i.status}</span></div>`
        )
        .join('')}
    </div>`
    )
    .join('');
  document.querySelector('#status').textContent = `${rows.length} on hold`;
}

let currentTab = 'ops-dashboard';
const loads = {
  'ops-dashboard': loadOpsDashboard,
  late: loadLate,
  unassigned: loadUnassigned,
  purchasing: loadPurchasing,
};

document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    loads[currentTab]();
  });
});

document.querySelector('#btnRefresh').onclick = () => loads[currentTab]();

// initial
loads[currentTab]();
