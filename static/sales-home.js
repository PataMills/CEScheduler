(async () => {
  const $ = s => document.querySelector(s);


  // ---- who am I
  const me = await fetch('/api/me', {cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const myName = me?.name || '';
  const shortName = s => {
    s = String(s||'').trim();
    if (!s) return '';
    // keep first word + last initial if there are two words
    const parts = s.split(/\s+/);
    if (parts.length >= 2) return parts[0] + ' ' + parts[1][0] + '.';
    return s.length > 16 ? (s.slice(0,15)+'…') : s;
  };


  // ---- Sidebar: my recent
  async function loadMyRecent() {
    try {
        // Use new dedicated recent submissions endpoint
        const r = await fetch('/api/sales/home/recent?limit=8', {cache:'no-store'});
        const rows = r.ok ? await r.json() : [];
      const host = document.querySelector('#recentSidebar'); if (!host) return;
      host.innerHTML = '';

      rows.forEach(b => {
        const div = document.createElement('div');
        div.className = 'sideItem';
        const stage = b.stage || b.status || 'draft';
        const orderNo = b.order_no ? `<span class="muted" style="font-size:11px">Order: ${b.order_no}</span>` : '';
        
        div.innerHTML = `
          <div style="display:flex;gap:8px;align-items:center;flex:1;justify-content:space-between">
            <a href="/sales-quote?bid=${b.id}">${b.customer_name || ('Bid #'+b.id)}</a>
            <span class="badge">${Number(b.total||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</span>
          </div>
          ${orderNo}
          <div class="muted" style="font-size:11px">${stage}</div>
          <div style="display:flex;gap:6px;margin-top:4px">
            <button class="btn btn-view" data-bid="${b.id}">View</button>
            <button class="btn btn-edit" data-bid="${b.id}">Edit</button>
          </div>
        `;
        // wire - route based on stage
        div.querySelector('.btn-view').onclick = e => {
          const bid = e.currentTarget.dataset.bid;
          if (stage === 'draft' || stage === 'in_progress' || stage === 'intake') {
            location.href = '/sales-intake?bid='+bid;
          } else if (stage === 'ready_for_schedule' || b.status === 'ready_for_schedule') {
            location.href = '/sales-review?bid='+bid;
          } else {
            location.href = '/sales-details?bid='+bid;
          }
        };
        div.querySelector('.btn-edit').onclick = e => {
          const bid = e.currentTarget.dataset.bid; location.href = '/sales-intake?bid='+bid;
        };
        host.appendChild(div);
      });
        if (!rows.length) {
          host.innerHTML = '<div class="muted">No recent submissions yet.</div>';
        }
    } catch {}
  }


  // ---- Calendar
  const typeColor = (t) => {
    const x = String(t||'').toLowerCase();
    if (x==='manufacturing') return 'p-mfg';
    if (x==='paint')         return 'p-paint';
    if (x==='assembly')      return 'p-asm';
    if (x==='delivery')      return 'p-del';
    if (x==='install')       return 'p-inst';
    if (x==='service')       return 'p-svc';
    return 'p-inst';
  };

  // Start on current week (Mon-Sun)
  function monday(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; }
  let weekStart = monday(new Date());

  function ymd(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }

  async function loadStatusCounters() {
    try {
      // Use new dedicated stats endpoint
      const r = await fetch('/api/sales/home/stats', { cache: 'no-store' });
      const stats = r.ok ? await r.json() : { awaiting_acceptance: 0, awaiting_deposit: 0, ready: 0 };

      // update UI
      const A = document.getElementById('statAwaiting');
      const D = document.getElementById('statDeposit');
      const R = document.getElementById('statReady');
      if (A) A.textContent = stats.awaiting_acceptance || 0;
      if (D) D.textContent = stats.awaiting_deposit || 0;
      if (R) R.textContent = stats.ready || 0;

      // Make tiles clickable to show filtered lists (fetch on click for details)
      document.getElementById('tileAwaiting')?.addEventListener('click', async (e) => { 
        e.preventDefault();
        const bids = await fetch('/api/sales/home/recent?limit=200').then(r=>r.ok?r.json():[]);
        const filtered = bids.filter(b => {
          const st = String(b.stage||'').toLowerCase();
          return (st === 'quoted' || st === 'submitted') && !b.ready_for_schedule;
        });
        showFilteredList(filtered, 'Awaiting Acceptance');
      });
      document.getElementById('tileDeposit')?.addEventListener('click', async (e) => { 
        e.preventDefault();
        const bids = await fetch('/api/sales/home/recent?limit=200').then(r=>r.ok?r.json():[]);
        const filtered = bids.filter(b => b.stage === 'accepted' && !b.deposit_received_at);
        showFilteredList(filtered, 'Awaiting Deposit');
      });
      document.getElementById('tileReady')?.addEventListener('click', async (e) => { 
        e.preventDefault();
        const bids = await fetch('/api/sales/home/recent?limit=200').then(r=>r.ok?r.json():[]);
        const filtered = bids.filter(b => !!b.ready_for_schedule);
        showFilteredList(filtered, 'Ready to Schedule');
      });
    } catch {}
  }

    function showFilteredList(bids, title) {
      const tbody = $('#results tbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      bids.forEach(row => {
        const stage = row.stage || row.status || '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.id||''}</td>
          <td>${row.customer_name||''}</td>
          <td>${row.order_no||'—'}</td>
          <td>${Number(row.total||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</td>
          <td class="status">${stage}</td>
          <td>${row.updated_at ? new Date(row.updated_at).toLocaleDateString() : ''}</td>
          <td>
            <button class="btn-view" data-bid="${row.id}" data-stage="${stage}">View</button>
            <button class="btn-edit" data-bid="${row.id}">Edit</button>
          </td>
        `;
        tr.querySelector('.btn-view').onclick = (e)=>{
          const bid = e.currentTarget.dataset.bid;
          const st = e.currentTarget.dataset.stage;
          if (st === 'draft' || st === 'in_progress' || st === 'intake') {
            location.href = '/sales-intake?bid='+bid;
          } else if (st === 'ready_for_schedule') {
            location.href = '/sales-review?bid='+bid;
          } else {
            location.href = '/sales-details?bid='+bid;
          }
        };
        tr.querySelector('.btn-edit').onclick = (e)=>{ const bid=e.currentTarget.dataset.bid; location.href='/sales-intake?bid='+bid; };
        tbody.appendChild(tr);
      });
      $('#results').style.display = bids.length ? 'block' : 'none';
      // Optionally scroll to results
      $('#results')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

  async function loadCalendar() {
    const filter = $('#calFilter')?.value || 'mine';
    const days = Array.from({length:7},(_,i)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+i); return d; });
    $('#calRange').textContent = days[0].toLocaleDateString() + ' – ' + days[6].toLocaleDateString();

    const host = $('#calWeek'); if (!host) return;
    host.innerHTML = '';

    // build empty cells
    days.forEach(d => {
      const cell = document.createElement('div');
      cell.className = 'day';
      cell.innerHTML = `<div class="dayHead"><span>${d.toLocaleDateString(undefined,{weekday:'short'})}</span><span>${d.getMonth()+1}/${d.getDate()}</span></div><div class="dayBody"></div>`;
      host.appendChild(cell);
    });

    // Use new calendar endpoint
    const start = ymd(days[0]);
    const end = ymd(days[6]);
    const r = await fetch(`/api/sales/home/calendar?start=${start}&end=${end}&filter=${filter}`).catch(()=>({ok:false}));
    const results = r.ok ? await r.json() : [];

    // paint items
    results.forEach(t => {
      const taskDate = t.date; // YYYY-MM-DD from server
      const dayIdx = days.findIndex(d => ymd(d) === taskDate);
      if (dayIdx === -1) return;
      
      const cell = host.children[dayIdx]; if (!cell) return;
      const div = document.createElement('div');
      div.className = 'pill '+typeColor(t.kind);
      div.title = (t.customer_name || t.title || '') + ' • ' + (t.kind || '');
      const labelType = String(t.kind||'').toLowerCase() === 'install' ? 'Install' : (t.title || t.kind || '');
      const cust = shortName(t.customer_name || '');
      div.textContent = (labelType === 'Install')
        ? `Install — ${cust}`
        : (labelType || '').slice(0,26);
      cell.querySelector('.dayBody').appendChild(div);
    });
  }

  $('#calPrev')?.addEventListener('click', ()=>{ weekStart.setDate(weekStart.getDate()-7); loadCalendar(); });
  $('#calNext')?.addEventListener('click', ()=>{ weekStart.setDate(weekStart.getDate()+7); loadCalendar(); });
  $('#calFilter')?.addEventListener('change', loadCalendar);

  // ---- Search (use new dedicated search endpoint)
  async function doSearch() {
    const q = ($('#q').value || '').trim();
    if (!q) { $('#results').style.display='none'; return; }
    try {
      const r = await fetch('/api/bids/search?q=' + encodeURIComponent(q));
      const list = r.ok ? await r.json() : [];
      const tbody = $('#results tbody');
      tbody.innerHTML = '';
      list.forEach(row => {
        const stage = row.stage || row.status || '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.id||''}</td>
          <td>${row.customer_name||''}</td>
          <td>${row.order_no||'—'}</td>
          <td>${Number(row.total||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</td>
          <td class="status">${stage}</td>
          <td>${row.updated_at ? new Date(row.updated_at).toLocaleString() : ''}</td>
          <td>
            <button class="btn-view" data-bid="${row.id}" data-stage="${stage}">View</button>
            <button class="btn-edit" data-bid="${row.id}">Edit</button>
          </td>
        `;
        tr.querySelector('.btn-view').onclick = (e)=>{
          const bid = e.currentTarget.dataset.bid;
          const st = e.currentTarget.dataset.stage;
          if (st === 'draft' || st === 'in_progress' || st === 'intake') {
            location.href = '/sales-intake?bid='+bid;
          } else if (st === 'ready_for_schedule') {
            location.href = '/sales-review?bid='+bid;
          } else {
            location.href = '/sales-details?bid='+bid;
          }
        };
        tr.querySelector('.btn-edit').onclick = (e)=>{ const bid=e.currentTarget.dataset.bid; location.href='/sales-intake?bid='+bid; };
        tbody.appendChild(tr);
      });
      $('#results').style.display = list.length ? 'block' : 'none';
    } catch {
      $('#results').style.display='none';
    }
  }
  $('#go')?.addEventListener('click', doSearch);
  $('#q')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });

  await loadMyRecent();
  await loadCalendar();
  await loadStatusCounters();

})();
