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
      const me = await fetch('/api/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
      const sp = me?.name ? ('&sp='+encodeURIComponent(me.name)) : '';
      const r  = await fetch('/api/bids/recent?limit=10'+sp,{cache:'no-store'});
      const rows = r.ok ? await r.json() : [];
      const host = document.querySelector('#recentSidebar'); if (!host) return;
      host.innerHTML = '';

      rows.forEach(b => {
        const div = document.createElement('div');
        div.className = 'sideItem';
        div.innerHTML = `
          <div style="display:flex;gap:8px;align-items:center;flex:1;justify-content:space-between">
            <a href="/sales-quote?bid=${b.id}">${b.name || ('Bid #'+b.id)}</a>
            <span class="badge">${Number(b.total||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</span>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-view" data-bid="${b.id}">View</button>
            <button class="btn btn-edit" data-bid="${b.id}">Edit</button>
          </div>
        `;
        // wire
        div.querySelector('.btn-view').onclick = e => {
          const bid = e.currentTarget.dataset.bid; location.href = '/sales-quote?bid='+bid;
        };
        div.querySelector('.btn-edit').onclick = e => {
          const bid = e.currentTarget.dataset.bid; location.href = '/sales-intake?bid='+bid;
        };
        host.appendChild(div);
      });
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
      const me = await fetch('/api/me', {cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
      const sp = me?.name ? ('&sp=' + encodeURIComponent(me.name)) : '';
      const r = await fetch('/api/bids/recent?limit=200' + sp, { cache: 'no-store' });
      const rows = r.ok ? await r.json() : [];

        // derive counts (store arrays for click handlers)
        const awaitingList = rows.filter(b => {
          const s = String(b.status||'').toLowerCase();
          return s !== 'accepted' && s !== 'complete' && s !== 'scheduled';
        });
        const depositList = rows.filter(b => String(b.status||'').toLowerCase()==='accepted' && !b.deposit_received_at);
        const readyList = rows.filter(b => !!b.ready_for_schedule);

      // update UI
      const A = document.getElementById('statAwaiting');
      const D = document.getElementById('statDeposit');
      const R = document.getElementById('statReady');
        if (A) A.textContent = awaitingList.length;
        if (D) D.textContent = depositList.length;
        if (R) R.textContent = readyList.length;

        // Make tiles clickable to show filtered lists
        document.getElementById('tileAwaiting')?.addEventListener('click', (e)=>{ 
          e.preventDefault(); 
          showFilteredList(awaitingList, 'Awaiting Acceptance');
        });
        document.getElementById('tileDeposit')?.addEventListener('click', (e)=>{ 
          e.preventDefault(); 
          showFilteredList(depositList, 'Awaiting Deposit');
        });
        document.getElementById('tileReady')?.addEventListener('click', (e)=>{ 
          e.preventDefault(); 
          showFilteredList(readyList, 'Ready to Schedule');
        });
    } catch {}
  }

    function showFilteredList(bids, title) {
      const tbody = $('#results tbody');
      if (!tbody) return;
      tbody.innerHTML = '';
      bids.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.id||''}</td>
          <td>${row.name||''}</td>
          <td>${row.sales_person||''}</td>
          <td>${Number(row.total||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</td>
          <td class="status">${row.status||''}</td>
          <td>${row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}</td>
          <td>
            <button class="btn-view" data-bid="${row.id}">View</button>
            <button class="btn-edit" data-bid="${row.id}">Edit</button>
          </td>
        `;
        tr.querySelector('.btn-view').onclick = (e)=>{ const bid=e.currentTarget.dataset.bid; location.href='/sales-quote?bid='+bid; };
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

    // fetch scheduled tasks for each day
    // (we call /api/schedule?date=YYYY-MM-DD for each day and merge)
    const results = [];
    for (const d of days) {
      const r = await fetch('/api/schedule?date='+ymd(d)).then(x=>x.ok?x.json():[]).catch(()=>[]);
      results.push(...r);
    }

    // filter by salesperson for "mine"
    const filtered = results.filter(t => {
      if (filter==='scheduled') return true;
      if (filter==='projects')  return true; // you can swap to project-level list later
      if (!myName) return true;
      // if jobs table has salesperson, you can enrich; for now match if task name or customer hints contain it
      return true; // keep all until we add a salesperson join
    });

    // paint items
    filtered.forEach(t => {
      const dayIdx = Math.max(0, Math.min(6, Math.round((new Date(t.window_start) - weekStart) / 86400000)));
      const cell = host.children[dayIdx]; if (!cell) return;
      const div = document.createElement('div');
      div.className = 'pill '+typeColor(t.type);
      div.title = (t.customer_name || t.job_id || '') + ' • ' + (t.name || t.type);
      const labelType = String(t.type||'').toLowerCase() === 'install' ? 'Install' : (t.name || t.type || '');
        const cust = shortName(t.customer_name || t.job_id || '');
        const ccTxt = (t.units_total != null) ? ' (CC: ' + t.units_total + ')' : '';
        div.textContent = (labelType === 'Install')
          ? `Install — ${cust}${ccTxt}`
          : (labelType || '').slice(0,26);
      cell.querySelector('.dayBody').appendChild(div);
    });
  }

  $('#calPrev')?.addEventListener('click', ()=>{ weekStart.setDate(weekStart.getDate()-7); loadCalendar(); });
  $('#calNext')?.addEventListener('click', ()=>{ weekStart.setDate(weekStart.getDate()+7); loadCalendar(); });
  $('#calFilter')?.addEventListener('change', loadCalendar);

  // ---- Search (keep your existing)
  async function doSearch() {
    const q = ($('#q').value || '').trim();
    if (!q) { $('#results').style.display='none'; return; }
    try {
      const r = await fetch('/api/search?q=' + encodeURIComponent(q));
      const data = r.ok ? await r.json() : { results: [] };
      const list = Array.isArray(data.results) ? data.results : [];
      const tbody = $('#results tbody');
      tbody.innerHTML = '';
      list.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.id||''}</td>
          <td>${row.customer_name||row.name||''}</td>
          <td>${row.builder||row.sales_person||''}</td>
          <td>${Number(row.total||0).toLocaleString('en-US',{style:'currency',currency:'USD'})}</td>
          <td class="status">${row.status||''}</td>
          <td>${row.updated_at ? new Date(row.updated_at).toLocaleString() : ''}</td>
          <td>
            <button class="btn-view" data-bid="${row.id}">View</button>
            <button class="btn-edit" data-bid="${row.id}">Edit</button>
          </td>
        `;
        tr.querySelector('.btn-view').onclick = (e)=>{ const bid=e.currentTarget.dataset.bid; location.href='/sales-quote?bid='+bid; };
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
