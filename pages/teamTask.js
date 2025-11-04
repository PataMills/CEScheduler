// pages/teamTask.js
import { requireRolePage } from "../routes/auth.js";

export default function registerTeamTaskPage(app){
  app.get("/team/task", requireRolePage(["admin","ops","installer","service","manufacturing","assembly","delivery"]), async (req, res) => {
    // very light HTML, mobile-first, no build step
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>Task</title>
  <style>
    body{margin:0;background:#0f1320;color:#e9eefc;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif}
    .bar{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#111837;border-bottom:1px solid #222943;position:sticky;top:0;z-index:10}
    .wrap{padding:12px 14px}
    h1{font-size:18px;margin:0 0 6px}
    .sec{background:#12172a;border:1px solid #222943;border-radius:12px;padding:12px;margin-bottom:12px}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .pill{display:inline-block;background:#1c2446;border-radius:999px;padding:6px 10px;font-size:12px;border:1px solid #2a3158}
    .btn{background:#4051a3;color:#e9eefc;border:0;border-radius:10px;padding:10px 12px;font-weight:600}
    .btn:disabled{opacity:.6}
    .kv{display:grid;grid-template-columns:120px 1fr;gap:6px 10px;font-size:14px}
    a.file{display:flex;justify-content:space-between;align-items:center;padding:10px;background:#0f1320;border:1px solid #222943;border-radius:10px;margin-top:8px;text-decoration:none;color:#e9eefc}
    .note{white-space:pre-wrap;line-height:1.35}
    .foot{padding:10px 14px;opacity:.6;font-size:12px}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .btn.gray{background:#2b314f}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700}
    .badge.scheduled{background:#374151}
    .badge.en_route{background:#1e3a8a;color:#dbeafe;border:1px solid #3b82f6}
    .badge.in_progress{background:#1d4ed8;color:#e5e7eb;border:1px solid #3b82f6}
    .badge.wip{background:#92400e;color:#fde68a;border:1px solid #f59e0b}
    .badge.complete{background:#065f46;color:#bbf7d0;border:1px solid #10b981}
    #completeModal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:16px;z-index:50}
    #completeModal[hidden]{display:none}
    .sheet{background:#12172a;border:1px solid #222943;border-radius:12px;max-width:460px;width:100%;padding:14px}
  </style>
</head>
<body>
  <div class="bar">
    <div style="font-weight:700">Team Task</div>
    <button id="btnSync" class="btn" style="background:#2e9157">Sync for offline</button>
  </div>
  <div class="wrap" id="content">Loading…</div>
  <div class="foot">Tip: tap a document to open it. After 'Sync for offline', this page and documents will be available without signal.</div>

  <!-- Complete modal -->
  <div id="completeModal" hidden>
    <div class="sheet">
      <div style="font-weight:700;margin-bottom:6px">Complete with note</div>
      <textarea id="cm_note" rows="4" style="width:100%;padding:10px;border-radius:10px;border:1px solid #222943;background:#0f1320;color:#e9eefc" placeholder="Optional note…"></textarea>
      <input id="cm_photos" type="file" accept="image/*" multiple style="margin-top:10px"/>
      <div id="cm_hint" style="opacity:.7;font-size:12px;margin-top:6px">Attach up to 15 photos (&lt; 30 MB total).</div>
      <div class="row" style="justify-content:flex-end;margin-top:10px">
        <button id="cm_cancel" class="btn gray">Cancel</button>
        <button id="cm_save" class="btn">Save</button>
      </div>
    </div>
  </div>

  <script>
    // HTML escape helper for safe rendering
    function esc(v) {
      const s = String(v ?? '');
      return s.replace(/[&<>"']/g, c => (
        c === '&' ? '&amp;' :
        c === '<' ? '&lt;'  :
        c === '>' ? '&gt;'  :
        c === '"' ? '&quot;':
                   '&#39;'
      ));
    }

    const $ = (id)=>document.getElementById(id);
    const q = new URLSearchParams(location.search);
    const taskId = q.get('id');

    // Fetch first URL that returns 2xx JSON
    async function fetchAny(urls){
      for (const u of urls){
        try {
          const r = await fetch(u, { credentials:'same-origin' });
          if (r.ok) return await r.json();
        } catch(e){ /* try next */ }
      }
      throw new Error('No task API responded (tried: '+urls.join(', ')+')');
    }

    // Visible error so the page doesn't look "stuck"
    function showError(msg){
      const host = document.getElementById('main') || document.getElementById('content') || document.body;
      host.insertAdjacentHTML('beforeend',
        '<div style="margin:12px 16px;padding:10px;border:1px solid #933;background:#2a0f13;color:#ffd7d7;border-radius:8px">'
        + '<div style="font-weight:600;margin-bottom:6px">Can\'t load task</div>'
        + '<div class="small" style="opacity:.9">' + esc(msg||'Unknown error') + '</div>'
        + '</div>'
      );
    }

    // Load history events for this task
    async function loadHistory(limit = 50) {
      const historyEl = $('historyList');
      if (!historyEl || !taskId) return;
      
      try {
        const r = await fetch('/api/tasks/'+encodeURIComponent(taskId)+'/history');
        if (!r.ok) throw new Error('HTTP '+r.status);
        const events = await r.json();
        
        if (!events || !events.length) {
          historyEl.innerHTML = '<div style="opacity:.7">No history yet.</div>';
          return;
        }
        
        historyEl.innerHTML = events.slice(0, limit).map(evt => {
          const ts = evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '';
          const type = esc(evt.event_type || '');
          const note = evt.note ? '<div style="opacity:.8;margin-top:4px">'+esc(evt.note)+'</div>' : '';
          return '<div style="padding:8px 0;border-bottom:1px solid #222943">'+
                 '<div><b>'+type+'</b> — '+ts+'</div>'+note+'</div>';
        }).join('');
      } catch (e) {
        console.error('History load error:', e);
        historyEl.innerHTML = '<div style="opacity:.7;color:#f66">Could not load history.</div>';
      }
    }

    async function load(){
      try{
        if(!taskId) throw new Error('Missing ?id');
        // Try common endpoints so a route mismatch won’t brick the page
        const data = await fetchAny([
          '/api/team/task?id=' + encodeURIComponent(taskId),
          '/api/tasks/' + encodeURIComponent(taskId),
          '/api/task/' + encodeURIComponent(taskId),
          '/api/tasks/team/' + encodeURIComponent(taskId)
        ]);

        // Basic sanity so render() can’t explode on nulls
        const t = data || {};
        const customer = t.customer_name || t.job_name || t.name || ('Task '+taskId);
        const when = (t.window_start && t.window_end)
          ? (new Date(t.window_start).toLocaleString()+' – '+new Date(t.window_end).toLocaleString())
          : (t.start || t.date || '');
        const addr = t.address || t.site_address || '';

        const main = document.getElementById('main') || document.getElementById('content') || document.body;
        var ih = '';
        ih += '<div class="sec" style="margin:12px">';
        ih +=   '<div style="font-weight:700;font-size:18px">' + esc(customer) + '</div>';
        ih +=   '<div class="muted small" style="margin-top:4px">' + esc(when) + '</div>';
        if (addr) {
          ih += '<div class="muted small" style="margin-top:4px">' + esc(addr) + '</div>';
        }
        ih +=   '<div class="row" style="gap:8px;margin-top:12px">'
             +     '<button class="btn" id="bOTW">On the way</button>'
             +     '<button class="btn" id="bArr">Arrived</button>'
             +     '<button class="btn" id="bWip">WIP</button>'
             +     '<button class="btn" id="bDone">Complete</button>'
             +   '</div>';
        ih += '</div>';
        ih += '<div class="sec" style="margin:12px">'
           +   '<div style="font-weight:600">Documents</div>'
           +   '<div id="docs" class="muted small" style="margin-top:6px">Loading…</div>'
           + '</div>';
        main.innerHTML = ih;

        // Button wiring (errors won’t crash UI)
        async function postStatus(path, body){
          const r = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(Object.assign({ when: new Date().toISOString() }, body||{})) });
          if(!r.ok) throw new Error('HTTP '+r.status);
        }
  document.getElementById('bOTW').onclick = async()=>{ try{ await postStatus('/api/tasks/' + taskId + '/ontheway'); }catch(e){ showError(e.message); } };
  document.getElementById('bArr').onclick = async()=>{ try{ await postStatus('/api/tasks/' + taskId + '/arrived'); }catch(e){ showError(e.message); } };
  document.getElementById('bWip').onclick = async()=>{ try{ await postStatus('/api/tasks/' + taskId + '/wip', { note: '' }); }catch(e){ showError(e.message); } };
        document.getElementById('bDone').onclick = ()=>{ try{ if (typeof openComplete === 'function') openComplete(); }catch{} };

        // Docs list (tolerant)
        const docsHost = document.getElementById('docs');
        try{
          const docs = Array.isArray(t.docs) ? t.docs : (await fetchAny([
            '/api/tasks/' + taskId + '/docs',
            '/api/task/' + taskId + '/docs'
          ]));
          if (Array.isArray(docs) && docs.length){
            docsHost.innerHTML = docs.map(function(d){
              return '<div><a href="' + esc(d.url||'#') + '" target="_blank">' + esc(d.name||d.file||'file') + '</a></div>';
            }).join('');
          } else {
            docsHost.textContent = 'No documents.';
          }
        }catch{ docsHost.textContent = 'No documents.'; }

      }catch(e){
        console.error(e);
        showError(e.message);
      }
    }

    function render(data, offline){
      const t = data.task || {};
      const b = data.bid  || {};
      const teams = Array.isArray(data.teams)?data.teams:[];
      const files = Array.isArray(data.files)?data.files:[];
      const hw = Array.isArray(data.hardware)?data.hardware:[];

      const teamLine = teams.length ? teams.map(x=>esc(x.resource_name)).join(', ') : '';

      const f = (dt)=> dt ? (new Date(dt)).toLocaleString() : '';

      let html = '';
  html += '<div class="sec">';
      html += '<h1>'+esc(t.type||'Task')+' — '+esc(t.name||'')+'</h1>';
  if (teamLine) html += '<div class="pill">'+teamLine+'</div>';
  html += '<div class="actions">'
    +   '<button class="btn" id="btn_otw">On the way</button>'
    +   '<button class="btn" id="btn_arr">Arrived</button>'
    +   '<button class="btn" id="btn_wip">WIP</button>'
    +   '<button class="btn" id="btn_done">Complete</button>'
    + '</div>';
      html += '<div class="kv" style="margin-top:10px">';
      html += '<div>Start</div><div><b>'+f(t.window_start)+'</b></div>';
      html += '<div>End</div><div><b>'+f(t.window_end||t.window_start)+'</b></div>';
      if (t.phase_group) { html += '<div>Phase</div><div>'+esc(t.phase_group)+'</div>'; }
      html += '</div>';
      html += '</div>';

      html += '<div class="sec"><div style="font-weight:700;margin-bottom:6px">Contacts & Site</div>';
      html += '<div class="kv">';
      html += '<div>Sales</div><div><b>'+esc(b.sales_person)+'</b> '+(b.sales_phone?(' — '+esc(b.sales_phone)):'')+'</div>';
      html += '<div>Customer</div><div><b>'+esc(b.customer_name)+'</b> '+(b.customer_phone?(' — '+esc(b.customer_phone)):'')+'</div>';
      html += '<div>Address</div><div>'+esc(b.address)+'</div>';
      html += '<div>Access</div><div>'+esc(b.access)+'</div>';
      html += '</div></div>';

      html += '<div class="sec"><div style="font-weight:700;margin-bottom:6px">Docs (Layouts, Renderings, Orders)</div>';
      if (!files.length) {
        html += '<div style="opacity:.7">No documents.</div>';
      } else {
        for (const f of files) {
          const label = esc(f.label || f.type || 'Document');
          const url = esc(f.url||'#');
          html += '<a class="file" href="'+url+'" target="_blank" rel="noopener">'+label+'<span>↗</span></a>';
        }
      }
      html += '</div>';

      html += '<div class="sec"><div style="font-weight:700;margin-bottom:6px">Hardware / Handles</div>';
      if (!hw.length) {
        html += '<div style="opacity:.7">None listed.</div>';
      } else {
        for (const h of hw) {
          const line = [h.kind,h.model,h.finish,h.location].filter(Boolean).map(esc).join(' — ');
          html += '<div>'+line+'</div>';
        }
      }
      html += '</div>';

      // History section
      if (b.id) {
        html += '<details class="sec" style="margin-bottom:12px"><summary style="font-weight:700;font-size:16px">History</summary>';
        html += '<div id="historyList" style="margin-top:10px"></div>';
        html += '</details>';
      }

      if (t.notes){
        html += '<div class="sec"><div style="font-weight:700;margin-bottom:6px">Notes</div><div class="note">'+esc(t.notes)+'</div></div>';
      }

      if (offline) html += '<div class="sec" style="background:#0d1a0d;border-color:#1e3a1e">Offline copy</div>';

      $('content').innerHTML = html;

      // wire buttons
      const post = async (route, body)=>{
        const r = await fetch('/api/tasks/'+encodeURIComponent(taskId)+'/'+route, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(Object.assign({ when:new Date().toISOString() }, body||{}))
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || j.error || 'server_error');
        return j;
      };

      const flash = (msg)=>{ const n=document.createElement('div'); n.textContent=msg; Object.assign(n.style,{position:'fixed',left:'50%',top:'16px',transform:'translateX(-50%)',background:'#111',color:'#fff',padding:'8px 12px',borderRadius:'9999px',zIndex:99999,boxShadow:'0 8px 24px rgba(0,0,0,.15)'}); document.body.appendChild(n); setTimeout(()=>n.remove(),1400); };

      const updateStatusBadge = (text)=>{ const badge=$('statusBadge'); if(badge) badge.textContent=text; };

      const btnOTW=$('btn_otw'), btnArr=$('btn_arr'), btnWip=$('btn_wip'), btnDone=$('btn_done');
      if (btnOTW) btnOTW.onclick = async ()=>{ try{ const j = await post('ontheway'); flash('On the way ✓'); updateStatusBadge('In progress • on the way'); await loadHistory(20); }catch(e){ flash('Failed: ' + (e.message||'Error')); } };
      if (btnArr) btnArr.onclick = async ()=>{ try{ const j = await post('arrived', { note:'' }); flash('Arrived ✓'); updateStatusBadge('In progress • arrived'); await loadHistory(20); }catch(e){ flash('Failed: ' + (e.message||'Error')); } };
      if (btnWip) btnWip.onclick = async ()=>{ const note=prompt('Note (optional)')||''; try{ const j = await post('wip', { note }); flash('WIP ✓'); updateStatusBadge('In progress • working'); await loadHistory(20); }catch(e){ flash('Failed: ' + (e.message||'Error')); } };
      if (btnDone) btnDone.onclick = ()=> openComplete();
      
      // Initial history load
      loadHistory();
    }

    // Complete modal logic
    function openComplete(){ $('completeModal').hidden=false; $('cm_note').value=''; $('cm_photos').value=''; $('cm_hint').textContent='Attach up to 15 photos (< 30 MB total).'; }
    function closeComplete(){ $('completeModal').hidden=true; }
    document.addEventListener('click', (e)=>{
      if (e.target && e.target.id === 'cm_cancel') closeComplete();
    });

    function readFilesAsDataURLs(fileList, {maxFiles=15, maxTotalBytes=30*1024*1024}={}){
      const files = Array.from(fileList||[]).slice(0,maxFiles);
      const total = files.reduce((s,f)=>s+f.size,0);
      if (total > maxTotalBytes) throw new Error('Photos > 30 MB total');
      return Promise.all(files.map(f=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res({name:f.name,type:f.type,size:f.size,data:r.result}); r.onerror=rej; r.readAsDataURL(f);}))); }

    const cmPhotosEl = ()=>document.getElementById('cm_photos');
    const cmNoteEl = ()=>document.getElementById('cm_note');
    const cmSave = async ()=>{
      try {
        const photos = await readFilesAsDataURLs(cmPhotosEl().files || []);
        const note = cmNoteEl().value || '';
        const r = await fetch('/api/tasks/'+encodeURIComponent(taskId)+'/complete', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ note, photos, when:new Date().toISOString() })
        });
        if (!r.ok) throw new Error('HTTP '+r.status);
        closeComplete();
        alert('Completed ✓');
        await loadHistory(20);
      } catch(e) {
        alert('Complete failed: '+(e&&e.message||e));
      }
    };
    document.addEventListener('click', (e)=>{ if (e.target && e.target.id==='cm_save') cmSave(); });

    // Offline caching (PWA-lite)
    $('btnSync').addEventListener('click', async ()=>{
      try{
        // register SW
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.register('/sw-team.js', { scope: '/' });
        }
        // warm cache: page + API + files
        await fetch(location.href).catch(()=>{});
        if (taskId){
          const r = await fetch('/api/tasks/team/'+taskId); const d = await r.json();
          const files = Array.isArray(d.files)?d.files:[];
          await Promise.all(files.map(x => x.url ? fetch(x.url).catch(()=>{}) : null));
          alert('Synced. You can open this page offline.');
        } else {
          alert('Synced page.');
        }
      }catch(e){
        alert('Sync failed: '+e.message);
      }
    });

    load();
  </script>
</body>
</html>`);
  });
}
