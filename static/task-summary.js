(() => {
  const fmt = (d) => d ? new Date(d).toLocaleString() : '';
  const safe = (v) => (v == null ? '' : String(v));

  function ensureModal() {
    if (document.getElementById('taskSummaryModal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'taskSummaryModal';
    wrap.style.cssText = `
      position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); z-index: 9999;
    `;
    wrap.innerHTML = `
      <div style="width: 900px; max-width: 95vw; background: #0f1320; color: #e9eefc; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #1d2235;">
          <div style="font-size:18px; font-weight:600;">Task Summary</div>
          <button id="tsClose" style="background:#1d2235; color:#e9eefc; border:0; padding:6px 10px; border-radius:8px; cursor:pointer;">Close</button>
        </div>
        <div id="tsBody" style="padding:16px;">
          <!-- filled dynamically -->
        </div>
        <div id="tsFooter" style="display:flex; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid #1d2235;">
          <!-- buttons are injected here by JS -->
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) hideModal(); });
    wrap.querySelector('#tsClose').addEventListener('click', hideModal);
  }

  function dtToLocalInput(dtStr){
  if (!dtStr) return '';
  const d = new Date(dtStr);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0,16); // "YYYY-MM-DDTHH:MM"
}
function localInputToISO(val){
  if (!val) return null;
  const d = new Date(val); // local
  return d.toISOString();
}


  function hideModal() {
    const m = document.getElementById('taskSummaryModal');
    if (m) m.style.display = 'none';
  }

  function showModal(html) {
    ensureModal();
    const m = document.getElementById('taskSummaryModal');
    m.querySelector('#tsBody').innerHTML = html;
    m.style.display = 'flex';
  }

  // Build HTML
  function render({ task, bid, financial, teams }) {
    const lines = [];
    lines.push(`
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;">
        <div>
          <div style="opacity:.7; font-size:12px;">Task</div>
          <div style="font-weight:600;">${safe(task.task_type)} — ${safe(task.title)}</div>
          <div style="margin-top:6px;">Crew/Resources: <b>${(() => {
            if (Array.isArray(teams) && teams.length) return teams.map(t => safe(t.resource_name)).join(', ');
            return safe(task.resource_name);
          })()}</b></div>
          <div>Phase: <b>${safe(task.phase || '')}</b></div>
          <div style="margin-top:6px;">Start: <b>${fmt(task.window_start)}</b></div>
          <div>End: <b>${fmt(task.window_end)}</b></div>
          ${task.job_name ? `<div style="margin-top:6px;">Job: <b>${safe(task.job_name)}</b></div>` : ''}
          ${task.notes ? `<div style="margin-top:8px; white-space:pre-wrap; opacity:.9">${safe(task.notes)}</div>` : ''}
        </div>

        <div>
          <div style="opacity:.7; font-size:12px;">Customer / Site</div>
          <div>Type: <b>${bid ? safe(bid.customer_type) : ''}</b></div>
          <div>Sales: <b>${bid ? safe(bid.sales_person) : ''}</b> &nbsp; • &nbsp; Designer: <b>${bid ? safe(bid.designer) : ''}</b></div>
          <div style="margin-top:6px;">Builder: <b>${bid ? safe(bid.builder) : ''}</b> &nbsp; (${bid ? safe(bid.builder_phone) : ''})</div>
          <div>Homeowner: <b>${bid ? safe(bid.homeowner) : ''}</b> &nbsp; (${bid ? safe(bid.homeowner_phone) : ''})</div>
          <div>Email: <b>${bid ? safe(bid.customer_email) : ''}</b></div>
          <div>Address: <b>${bid ? safe(bid.home_address) : ''}</b></div>
          <div>Lot/Plan: <b>${bid ? safe(bid.lot_plan) : ''}</b></div>
          <div>Install Date: <b>${bid ? (bid.install_date ? new Date(bid.install_date).toLocaleDateString() : '') : ''}</b></div>
          <div>Access: <b>${bid ? safe(bid.access_notes) : ''}</b></div>

          <div style="margin-top:10px; padding:10px; background:#12172a; border:1px solid #222943; border-radius:8px;">
            <div style="opacity:.7; font-size:12px;">Financial</div>
            <div>Total: <b>$${financial ? Number(financial.total||0).toLocaleString() : '0'}</b>
             &nbsp; <span style="opacity:.8"> (Sub: $${financial ? Number(financial.subtotal||0).toLocaleString() : '0'}, Tax: $${financial ? Number(financial.tax||0).toLocaleString() : '0'})</span>
            </div>
          </div>
        </div>
      </div>
      <div style="margin-top:16px; border-top:1px solid #1d2235; padding-top:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="opacity:.7; font-size:12px; cursor:pointer;" id="tsHistoryToggle">▶ History</div>
          <div style="display:flex; gap:4px;" id="tsHistoryFilters" style="display:none">
            <button class="tshf-btn" data-f="all" style="padding:3px 8px; font-size:11px; border-radius:6px; border:1px solid #2a2f3f; background:#1a2033; color:#c7d2fe; cursor:pointer;">All</button>
            <button class="tshf-btn" data-f="notes" style="padding:3px 8px; font-size:11px; border-radius:6px; border:1px solid #2a2f3f; background:#1a2033; color:#c7d2fe; cursor:pointer;">Notes</button>
            <button class="tshf-btn" data-f="photos" style="padding:3px 8px; font-size:11px; border-radius:6px; border:1px solid #2a2f3f; background:#1a2033; color:#c7d2fe; cursor:pointer;">Photos</button>
            <button class="tshf-btn" data-f="status" style="padding:3px 8px; font-size:11px; border-radius:6px; border:1px solid #2a2f3f; background:#1a2033; color:#c7d2fe; cursor:pointer;">Status</button>
            <button id="tsHistoryRefresh" style="padding:3px 8px; font-size:11px; border-radius:6px; border:1px solid #2a2f3f; background:#2563eb; color:#fff; cursor:pointer;">⟳</button>
          </div>
        </div>
        <div id="tsHistory" class="tsHistory" style="display:none">Loading…</div>
      </div>
    `);
    return lines.join("");
  }

  function renderEdit(data){
  const { task={}, bid=null, financial={} } = data || {};
  const safe = (v)=> (v==null?'':String(v));
  return `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
      <div>
        <div style="opacity:.7; font-size:12px;">Task</div>

        <label style="display:block; margin-top:8px; opacity:.8; font-size:12px;">Title</label>
        <input id="tsTitle" value="${safe(task.title)}" style="width:100%; padding:8px; background:#0f1320; color:#e9eefc; border:1px solid #222943; border-radius:8px;">

        <label style="display:block; margin-top:10px; opacity:.8; font-size:12px;">Phase</label>
        <input id="tsPhase" value="${safe(task.phase||task.phase_group||'')}" style="width:100%; padding:8px; background:#0f1320; color:#e9eefc; border:1px solid #222943; border-radius:8px;">

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
          <div>
            <label style="display:block; opacity:.8; font-size:12px;">Start</label>
            <input id="tsStart" type="datetime-local" value="${dtToLocalInput(task.window_start)}" style="width:100%; padding:8px; background:#0f1320; color:#e9eefc; border:1px solid #222943; border-radius:8px;">
          </div>
          <div>
            <label style="display:block; opacity:.8; font-size:12px;">End</label>
            <input id="tsEnd" type="datetime-local" value="${dtToLocalInput(task.window_end||task.window_start)}" style="width:100%; padding:8px; background:#0f1320; color:#e9eefc; border:1px solid #222943; border-radius:8px;">
          </div>
        </div>

        <label style="display:block; margin-top:10px; opacity:.8; font-size:12px;">Notes</label>
        <textarea id="tsNotes" rows="5" style="width:100%; padding:8px; background:#0f1320; color:#e9eefc; border:1px solid #222943; border-radius:8px;">${safe(task.notes)}</textarea>
      </div>

      <div>
        <div style="opacity:.7; font-size:12px;">Customer / Site</div>
        <div>Type: <b>${bid ? safe(bid.customer_type) : ''}</b></div>
        <div>Sales: <b>${bid ? safe(bid.sales_person) : ''}</b> &nbsp; • &nbsp; Designer: <b>${bid ? safe(bid.designer) : ''}</b></div>
        <div style="margin-top:6px;">Builder: <b>${bid ? safe(bid.builder) : ''}</b> &nbsp; (${bid ? safe(bid.builder_phone) : ''})</div>
        <div>Homeowner: <b>${bid ? safe(bid.homeowner) : ''}</b> &nbsp; (${bid ? safe(bid.homeowner_phone) : ''})</div>
        <div>Email: <b>${bid ? safe(bid.customer_email) : ''}</b></div>
        <div>Address: <b>${bid ? safe(bid.home_address) : ''}</b></div>
        <div>Lot/Plan: <b>${bid ? safe(bid.lot_plan) : ''}</b></div>
        <div>Install Date: <b>${bid ? (bid.install_date ? new Date(bid.install_date).toLocaleDateString() : '') : ''}</b></div>
        <div>Access: <b>${bid ? safe(bid.access_notes) : ''}</b></div>

        <div style="margin-top:10px; padding:10px; background:#12172a; border:1px solid #222943; border-radius:8px;">
          <div style="opacity:.7; font-size:12px;">Financial</div>
          <div>Total: <b>$${Number((financial||{}).total||0).toLocaleString()}</b>
           &nbsp; <span style="opacity:.8">(Sub: $${Number((financial||{}).subtotal||0).toLocaleString()}, Tax: $${Number((financial||{}).tax||0).toLocaleString()})</span>
          </div>
        </div>
      </div>
    </div>
    <div style="margin-top:16px; border-top:1px solid #1d2235; padding-top:12px;">
      <div style="opacity:.7; font-size:12px; margin-bottom:6px;">History</div>
      <div id="tsHistory" class="tsHistory">History is not available while editing.</div>
    </div>
  `;
}


  // Build summary text for copying
  function buildSummaryText(data) {
    const { task, bid, financial } = data;
    const lines = [];
    lines.push('=== TASK SUMMARY ===');
    lines.push(`Task: ${safe(task.task_type)} — ${safe(task.title)}`);
    lines.push(`Crew/Resource: ${safe(task.resource_name)}`);
    lines.push(`Phase: ${safe(task.phase || '')}`);
    lines.push(`Start: ${fmt(task.window_start)}`);
    lines.push(`End: ${fmt(task.window_end)}`);
    if (task.job_name) lines.push(`Job: ${safe(task.job_name)}`);
    if (task.notes) lines.push(`Notes: ${safe(task.notes)}`);
    lines.push('');
    lines.push('=== CUSTOMER / SITE ===');
    if (bid) {
      lines.push(`Type: ${safe(bid.customer_type)}`);
      lines.push(`Sales: ${safe(bid.sales_person)} • Designer: ${safe(bid.designer)}`);
      lines.push(`Builder: ${safe(bid.builder)} (${safe(bid.builder_phone)})`);
      lines.push(`Homeowner: ${safe(bid.homeowner)} (${safe(bid.homeowner_phone)})`);
      lines.push(`Email: ${safe(bid.customer_email)}`);
      lines.push(`Address: ${safe(bid.home_address)}`);
      lines.push(`Lot/Plan: ${safe(bid.lot_plan)}`);
      if (bid.install_date) lines.push(`Install Date: ${new Date(bid.install_date).toLocaleDateString()}`);
      if (bid.access_notes) lines.push(`Access: ${safe(bid.access_notes)}`);
    }
    lines.push('');
    lines.push('=== FINANCIAL ===');
    if (financial) {
      lines.push(`Total: $${Number(financial.total||0).toLocaleString()}`);
      lines.push(`Subtotal: $${Number(financial.subtotal||0).toLocaleString()}`);
      lines.push(`Tax: $${Number(financial.tax||0).toLocaleString()}`);
    }
    return lines.join('\n');
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert('Summary copied to clipboard!');
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      alert('Summary copied to clipboard!');
    } catch (e) {
      alert('Failed to copy');
    }
    document.body.removeChild(textarea);
  }

function renderHistory(events){
  if (!Array.isArray(events) || !events.length) return '<div style="opacity:.7;">No history yet.</div>';
  const esc = (s) => (s==null?'' : String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])));
  const fmt = (d) => d ? new Date(d).toLocaleString() : '';
  const statusColors = {
    'arrived': '#2563eb',
    'on_the_way': '#f59e0b',
    'wip': '#8b5cf6',
    'complete': '#16a34a'
  };
  const photo = (ph) => {
    const p = ph && (ph.path || ph.url || ph.href);
    if (!p) return '';
    const src = p.startsWith('/') ? p : ('/' + String(p).replace(/^\\+/, ''));
    const name = esc(ph.name || 'photo');
    return `<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${name}" style="max-width:120px; max-height:120px; object-fit:cover; border:1px solid #222943; border-radius:8px;" /></a>`;
  };
  return events.map(ev => {
    const badgeColor = statusColors[ev.type] || '#132133';
    return `
    <div style="padding:10px; border:1px solid #222943; border-radius:10px; margin:8px 0; background:#0f1320;">
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <div><span style="display:inline-block; padding:3px 8px; border-radius:9999px; background:${badgeColor}; color:#fff; font-size:12px; font-weight:600;">${esc((ev.type || 'event').replace(/_/g,' ').toUpperCase())}</span></div>
        <div style="opacity:.7; font-size:12px;">${fmt(ev.created_at)}</div>
      </div>
      ${ev.by ? `<div style="opacity:.8; font-size:12px; margin-top:2px;">by ${esc(ev.by)}</div>` : ''}
      ${ev.note ? `<div style="white-space:pre-wrap; margin-top:6px;">${esc(ev.note)}</div>` : ''}
      ${Array.isArray(ev.photos) && ev.photos.length ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">${ev.photos.map(photo).join('')}</div>` : ''}
    </div>
  `;}).join('');
}

async function openTaskSummary(taskId){
  let mode = 'view';           // 'view' | 'edit'
  let data = null;
  let historyEvents = null;
  let historyExpanded = false;
  let historyFilter = 'all';

  const modal = (() => {
    ensureModal();
    return document.getElementById('taskSummaryModal');
  })();

  const loadHistoryData = async () => {
    try {
      const h = await fetch(`/api/tasks/${taskId}/history`).then(r => r.json());
      historyEvents = Array.isArray(h?.events) ? h.events : [];
      renderHistoryPanel();
    } catch (_) {
      const host = modal.querySelector('#tsHistory');
      if (host) host.innerHTML = '<div style="opacity:.7;">Failed to load history</div>';
    }
  };

  const filterHistory = () => {
    if (!historyEvents) return [];
    if (historyFilter === 'notes') return historyEvents.filter(e => e.note && e.note.trim());
    if (historyFilter === 'photos') return historyEvents.filter(e => e.photos && e.photos.length);
    if (historyFilter === 'status') return historyEvents.filter(e => ['arrived','on_the_way','wip','complete'].includes(e.type));
    return historyEvents;
  };

  const renderHistoryPanel = () => {
    const host = modal.querySelector('#tsHistory');
    const toggle = modal.querySelector('#tsHistoryToggle');
    const filters = modal.querySelector('#tsHistoryFilters');
    if (!host || !toggle) return;
    
    if (historyExpanded) {
      toggle.textContent = '▼ History';
      host.style.display = 'block';
      if (filters) filters.style.display = 'flex';
      host.innerHTML = renderHistory(filterHistory());
    } else {
      toggle.textContent = '▶ History';
      host.style.display = 'none';
      if (filters) filters.style.display = 'none';
    }
  };

  const setupHistoryHandlers = () => {
    const toggle = modal.querySelector('#tsHistoryToggle');
    if (toggle) {
      toggle.onclick = () => {
        historyExpanded = !historyExpanded;
        renderHistoryPanel();
      };
    }
    
    const filterBtns = modal.querySelectorAll('.tshf-btn');
    filterBtns.forEach(btn => {
      btn.onclick = () => {
        historyFilter = btn.dataset.f || 'all';
        renderHistoryPanel();
      };
    });

    const refreshBtn = modal.querySelector('#tsHistoryRefresh');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        loadHistoryData();
      };
    }
  };

  const setFooter = () => {
    const footer = modal.querySelector('#tsFooter');
    if (!footer) return;

    if (mode === 'view') {
      footer.innerHTML = `
        <button id=\"tsCopy\"     style=\"background:#2b3456; color:#e9eefc; border:0; padding:8px 12px; border-radius:8px; cursor:pointer;\">Copy</button>
        <button id=\"tsOpenBid\"  style=\"background:#2b3456; color:#e9eefc; border:0; padding:8px 12px; border-radius:8px; cursor:pointer;\">Open Bid</button>
        <button id=\"tsEditJob\"  style=\"background:#4051a3; color:#e9eefc; border:0; padding:8px 12px; border-radius:8px; cursor:pointer;\">Edit Job</button>
        <button id=\"tsOpenTask\" style=\"background:#2b3456; color:#e9eefc; border:0; padding:8px 12px; border-radius:8px; cursor:pointer;\">Edit Task</button>
      `;
      modal.querySelector('#tsCopy').onclick = ()=> copyToClipboard(buildSummaryText(data));
      const getBidId = () => (data && data.task && data.task.bid_id) || (data && data.bid && data.bid.id) || null;
      const bOpen = modal.querySelector('#tsOpenBid');
      const bEdit = modal.querySelector('#tsEditJob');
      const bidId = getBidId();
      if (!bidId) {
        [bOpen, bEdit].forEach(btn => { if(btn){ btn.disabled = true; btn.style.opacity = '0.6'; btn.title = 'No bid linked to this task'; }});
      } else {
        if (bOpen) bOpen.onclick = ()=> { location.href = `/sales-intake?bid=${bidId}`; };
        if (bEdit) bEdit.onclick = ()=> { location.href = `/sales-details?bid=${bidId}`; };
      }
      modal.querySelector('#tsOpenTask').onclick = ()=> { mode='edit'; repaint(); };
    } else {
      footer.innerHTML = `
        <button id="tsSave"   style="background:#3aa06b; color:#0b1020; border:0; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:600;">Save</button>
        <button id="tsCancel" style="background:#2b3456; color:#e9eefc; border:0; padding:8px 12px; border-radius:8px; cursor:pointer;">Cancel</button>
      `;
      modal.querySelector('#tsSave').onclick = onSave;
      modal.querySelector('#tsCancel').onclick = ()=> { mode='view'; repaint(); };
    }
  };

  const repaint = () => {
    if (!data) return;
    const html = (mode === 'view') ? render(data) : renderEdit(data);
    modal.querySelector('#tsBody').innerHTML = html;
    // Populate history if available and in view mode
    if (mode === 'view') {
      setupHistoryHandlers();
      renderHistoryPanel();
    }
    setFooter();
  };

  const onSave = async () => {
    try {
      const title = (document.getElementById('tsTitle')||{}).value || '';
      const phase = (document.getElementById('tsPhase')||{}).value || null;
      const startISO = localInputToISO((document.getElementById('tsStart')||{}).value || '');
      const endISO   = localInputToISO((document.getElementById('tsEnd')||{}).value || '');
      const notes    = (document.getElementById('tsNotes')||{}).value || '';

      const body = {};
      if (title) body.name = title;
      if (notes != null) body.notes = notes;
      if (phase != null) body.phase_group = phase;
      if (startISO) body.window_start = startISO;
      if (endISO)   body.window_end   = endISO;

      const r = await fetch(`/api/tasks/${data.task.id}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.detail || j.error || ('HTTP '+r.status));

      // re-fetch fresh data and return to view mode
      const r2 = await fetch(`/api/tasks/${data.task.id}/summary`);
      data = await r2.json();
      mode = 'view';
      repaint();

      // optional: refresh calendar if available
      if (window.calendar && calendar.refetchEvents) calendar.refetchEvents();
    } catch (e) {
      alert('Save failed: '+ e.message);
      console.error(e);
    }
  };

  // initial load
  modal.querySelector('#tsBody').innerHTML = 'Loading…';
  modal.style.display = 'flex';
  try {
    const r = await fetch(`/api/tasks/${taskId}/summary`);
    data = await r.json();
    repaint();
    // Load history in background
    loadHistoryData();
  } catch (e) {
    modal.querySelector('#tsBody').innerHTML = `<div style="color:#ff9b9b;">Failed to load summary: ${e.message}</div>`;
    setFooter();
  }
}


  // expose globally
  window.openTaskSummary = openTaskSummary;
})();
