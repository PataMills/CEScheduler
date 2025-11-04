// pages/purchasingDashboard.js
export default function registerPurchasingDashboard(app){
  app.get('/purchasing-dashboard', (_req,res) => {
    res.type('html').send(`<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Purchasing Dashboard</title>
<style>
  body{background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto;margin:0}
  .wrap{max-width:1200px;margin:0 auto;padding:18px}
  .tabs{display:flex;gap:8px;margin-bottom:10px}
  .tab{padding:8px 12px;border:1px solid #2a3348;border-radius:10px;background:#1a2338;cursor:pointer;color:#e6ebff}
  .tab:hover{background:#223152;border-color:#394468}
  .tab.active{background:#2b3a5c;border-color:#4a5a82}
  table{width:100%;border-collapse:collapse}
  th,td{padding:8px;border-bottom:1px solid #212432;font-size:14px;text-align:left}
  .panel{background:#0f121a;border:1px solid #212432;border-radius:12px;padding:12px}
  .drawer{position:fixed;top:0;right:0;bottom:0;width:420px;background:#0f121a;border-left:1px solid #212432;padding:14px;display:none}
  .btn{padding:8px 12px;border-radius:10px;border:1px solid #2a3348;background:#223152;color:#eef2ff;cursor:pointer}
  .btn:hover{background:#2b3a5c;border-color:#4a5a82}
  .btn-sm{padding:4px 8px;font-size:12px}
  .muted{color:#9aa4b2;font-size:12px}
  input,select,textarea{background:#0b0c10;border:1px solid #2a2f3f;color:#eef2ff;border-radius:8px;padding:8px}
  /* Modal */
  .modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center}
  .sheet{width:520px;max-width:95vw;background:#0f121a;border:1px solid #212432;border-radius:16px;padding:16px}
  .navbar{ background:#1a2338; border-bottom:1px solid #212432; padding:0 24px; display:flex; align-items:center; height:56px; }
  .navbar a{ color:#e5e7eb; text-decoration:none; margin-right:24px; font-weight:500; font-size:16px; }
  .navbar a.active{ color:#60a5fa; }
  .global-search{ margin-left:auto; position:relative; }
  .global-search input{ width:280px; }
  .global-suggest{ position:absolute; top:38px; right:0; background:#0f121a; border:1px solid #212432; border-radius:8px; min-width:320px; max-height:260px; overflow:auto; display:none; z-index:5 }
  .global-suggest .opt{ padding:8px 10px; border-bottom:1px solid #1f2635; cursor:pointer; }
  .global-suggest .opt:hover{ background:#1a2338; }
</style>
</head><body>
<nav class="navbar">
  <a href="/purchasing-dashboard" class="active">Purchasing Dashboard</a>
  <a href="/job-hub">Job Hub</a>
  <a href="/purchasing">Worklist</a>
  <div class="global-search">
    <input id="globalSearch" placeholder="Search jobs or POs… (e.g. Jones, #123, PO 45)"/>
    <div id="globalSuggest" class="global-suggest"></div>
  </div>
</nav>
<script src="/static/appbar.js"></script>
<script src="/static/purchasing-nav.js"></script>

<div class="wrap">
  <h2>Purchasing Dashboard</h2>
  <div class="tabs">
    <button class="tab active" data-f="worklist">Worklist</button>
    <button class="tab" data-f="hub">Job Hub</button>
    <button class="tab" data-f="pending">POs</button>
    <button class="tab" data-f="ordered">Ordered</button>
    <button class="tab" data-f="received">Received</button>
    <button class="tab" data-f="timeline">Timeline</button>
    <!-- (top + New button intentionally removed) -->
  </div>

  <div id="aiAgentBar" class="panel" style="display:none;margin-bottom:10px"></div>

  <div id="list"></div>
</div>

<!-- Drawer -->
<div id="drawer" class="drawer" aria-hidden="true">
  <div class="muted" id="dTitle">PO</div>
  <div id="dItems" style="margin:10px 0"></div>

  <div class="muted">Vendor Order #</div>
  <input id="dOrderNo" style="width:100%;margin:6px 0"/>

  <div class="muted">Expected Date</div>
  <input id="dExpect" type="date" style="width:100%;margin:6px 0"/>

  <div style="display:flex;gap:8px;margin-top:10px">
    <button id="btnPlace" class="btn">Mark Ordered</button>
    <button id="btnReceive" class="btn">Receive Qty</button>
    <button id="btnClose" class="btn" style="margin-left:auto">Close</button>
  </div>

  <div style="margin-top:10px">
    <div class="muted">PO Details</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0">
      <div>
        <div class="muted">Vendor</div>
        <input id="dVendor" style="width:100%"/>
      </div>
      <div>
        <div class="muted">Status</div>
        <select id="dStatus" style="width:100%">
          <option value="pending">pending</option>
          <option value="ordered">ordered</option>
          <option value="partial_received">partial_received</option>
          <option value="received">received</option>
        </select>
      </div>
    </div>

    <div class="muted">Documents (Confirmations / BOL)</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="btnUploadDoc" class="btn">Upload Document</button>
      <input id="bol" type="file" accept="application/pdf,image/*" style="display:none"/>
    </div>
    <div id="dDocs" class="muted" style="margin-top:6px"></div>
  </div>
</div>

<!-- Modal: New Bid/Order -->
<div id="newBidOrderModal" class="modal" aria-hidden="true">
  <div class="sheet">
    <h3 style="margin:0 0 8px 0">New Bid/Order</h3>

    <div class="muted">Job (search by # or name)</div>
    <input id="modalBidJobSearch" placeholder="Start typing customer name or #35..." />
    <div id="modalBidJobSuggest" style="display:none;background:#0f121a;border:1px solid #212432;border-radius:8px;margin-top:6px;max-height:180px;overflow:auto"></div>
    <input id="modalBidJobId" placeholder="Numeric Job ID (auto-filled)" style="margin-top:6px"/>

    <div class="muted" style="margin-top:8px">Customer</div>
    <input id="modalBidCustomer" placeholder="Optional"/>

    <div class="muted" style="margin-top:8px">Manufacturer</div>
    <input id="modalBidManufacturer" placeholder="Optional"/>

    <div class="muted" style="margin-top:8px">Due Date</div>
    <input id="modalBidDueDate" type="date"/>

    <div class="muted" style="margin-top:8px">Status</div>
    <select id="modalBidStatus"><option>pending</option><option>ordered</option></select>

    <div class="muted" style="margin-top:8px">$ Amount</div>
    <input id="modalBidAmount" type="number" min="0" step="1" value="0"/>

    <div class="muted" style="margin-top:8px">Vendor</div>
    <input id="modalBidVendor" placeholder="Required"/>

    <div class="muted" style="margin-top:8px">Category</div>
    <select id="modalBidCategory"><option>Hardware</option><option>Accessories</option><option>Cabinets</option><option>Other</option></select>

    <div class="muted" style="margin-top:8px">Order Form (PDF/image)</div>
    <input id="modalBidOrderForm" type="file" accept="application/pdf,image/*"/>

    <div class="muted" style="margin-top:8px">Notes</div>
    <textarea id="modalBidNotes" rows="3" style="width:100%"></textarea>

    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:12px">
      <button id="modalBidCancel" class="btn">Cancel</button>
      <button id="modalBidCreate" class="btn">Create</button>
    </div>
  </div>
</div>

<script>
const $=s=>document.querySelector(s);
let all=[], filter='worklist', sel=null, nextHubJobId=null;

/* ---------- Global search (jobs + current POs) ---------- */
function buildGlobalOptions(term, jobs){
  const opts=[];
  // Job hits from API
  (Array.isArray(jobs)?jobs:[]).forEach(j=>{
    opts.push({ kind:'job', id:j.id, label:(j.customer_name||'Job')+' — #'+j.id });
  });
  // PO hits from currently loaded list (if available)
  const t = (term||'').toLowerCase();
  if (Array.isArray(all) && all.length && t){
    const poHits = all.filter(p=> String(p.id).includes(t) || (p.order_no||'').toLowerCase().includes(t) || (p.vendor||'').toLowerCase().includes(t) || (p.customer_name||'').toLowerCase().includes(t)).slice(0,10);
    poHits.forEach(p=> opts.push({ kind:'po', id:p.id, label:'PO #'+p.id+' — '+(p.vendor||'')+' — '+(p.customer_name||('Job '+p.job_id)) }));
  }
  return opts;
}
function renderGlobalSuggest(list){
  const box = $('#globalSuggest');
  if (!Array.isArray(list) || !list.length) { box.innerHTML=''; box.style.display='none'; return; }
  box.style.display='';
  box.innerHTML = list.map(o=>'<div class="opt" data-kind="'+o.kind+'" data-id="'+o.id+'">'+o.label+'</div>').join('');
  box.querySelectorAll('.opt').forEach(el=> el.onclick = ()=>{
    const kind = el.getAttribute('data-kind');
    const id = Number(el.getAttribute('data-id'));
    $('#globalSuggest').innerHTML=''; $('#globalSuggest').style.display='none';
    const input=$('#globalSearch'); if(input) input.value='';
    if (kind==='po') {
      // ensure table data loaded, then open drawer
      if (!all || !all.length) { filter='pending'; load().then(()=> openDrawer(id)).catch(()=>{}); }
      else { openDrawer(id); }
    } else {
      // job: jump to Hub tab and preload
      nextHubJobId = id; switchToTab('hub');
    }
  });
}
function switchToTab(tab){
  const b = document.querySelector('.tab[data-f="'+tab+'"]');
  if (!b) return;
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  filter = tab; load();
}
let tGlob;
document.addEventListener('DOMContentLoaded', ()=>{
  const inp = $('#globalSearch'); if (!inp) return;
  inp.addEventListener('input', ()=>{
    clearTimeout(tGlob);
    const q = (inp.value||'').trim();
    if (!q){ renderGlobalSuggest([]); return; }
    tGlob = setTimeout(async ()=>{
      try{
        const jobs = await fetch('/api/jobs/search?term='+encodeURIComponent(q)).then(r=>r.json());
        renderGlobalSuggest(buildGlobalOptions(q, jobs));
      }catch{ renderGlobalSuggest([]); }
    }, 200);
  });
  inp.addEventListener('keydown', (e)=>{
    if (e.key==='Enter'){
      const q = (inp.value||'').trim();
      if (!q) return;
      // Try PO ID first if numeric
      const num = (q.match(/(\d+)/)||[])[1];
      if (num && all && all.length){
        const p = all.find(x=> String(x.id)===String(num));
        if (p){ renderGlobalSuggest([]); inp.value=''; openDrawer(p.id); return; }
      }
      // Else treat as job search: pick first API result
      (async()=>{
        try{ const jobs = await fetch('/api/jobs/search?term='+encodeURIComponent(q)).then(r=>r.json());
          const j = Array.isArray(jobs) && jobs[0];
          if (j){ nextHubJobId=j.id; renderGlobalSuggest([]); inp.value=''; switchToTab('hub'); }
        }catch{}
      })();
    }
  });
});

/* ---------- AI Agent bar ---------- */
function showAIAgentBar(msg, actions){
  const bar = $('#aiAgentBar');
  bar.innerHTML = '<span style="font-weight:600">AI Agent:</span> '+msg + (actions && actions.length ? (' ' + actions.map(a=>'<button class="btn btn-sm" style="margin-left:8px">'+a.label+'</button>').join('')) : '');
  bar.style.display = '';
}
function hideAIAgentBar(){ $('#aiAgentBar').style.display='none'; }
function aiAgentCheck(){
  const pendingPOs = (window.all||[]).filter(r=>r.status==='pending');
  if(pendingPOs.length){
    showAIAgentBar('You have '+pendingPOs.length+' pending PO(s).', [
      {label:'Go to Ordered'}, {label:'Timeline'}
    ]);
    return;
  }
  hideAIAgentBar();
}

/* ---------- Load & Render ---------- */
async function renderWorklist(){
  // fetch the same data the /purchasing page uses
  const r = await fetch('/api/bids/purchasing-queue', { cache: 'no-store' });
  const data = await r.json();

  const h = [];
  h.push('<div class="panel">');
  h.push('<table class="tbl" style="width:100%;border-collapse:separate;border-spacing:0 8px;font-size:14px">');
  h.push('<thead><tr>');
  h.push('<th>Bid</th><th>Customer</th><th>Manufacturer</th><th>Due Date</th>');
  h.push('<th>Status</th><th>PO Sent</th><th>PO Received</th><th></th>');
  h.push('</tr></thead><tbody id="wlRows">');

  for (const x of data){
    const id = x.id;
    const due = (x.due_date||'').substring(0,10);
    const poS = x.po_sent_at ? new Date(x.po_sent_at).toISOString().slice(0,16) : '';
    const poR = x.po_received_at ? new Date(x.po_received_at).toISOString().slice(0,16) : '';

    h.push('<tr data-bid="'+id+'">');
    h.push('<td><a class="btn btn-sm" target="_blank" href="/sales-quote?bid='+id+'">#'+id+'</a></td>');
    h.push('<td>'+(x.customer_name||'')+'</td>');

    h.push('<td><input class="inp" style="width:160px" value="'+(x.mfr_override||x.manufacturer||'')+'" data-f="mfr"/></td>');
    h.push('<td><input class="inp" type="date" value="'+due+'" data-f="due"/></td>');

    h.push('<td>');
    h.push('<span class="pill" data-f="pill">'+(x.purchasing_status||'waiting')+'</span><br/>');
    h.push('<select class="inp" data-f="status">');
    ['waiting','po_sent','received'].forEach(s=>{
      h.push('<option value="'+s+'"'+(s===x.purchasing_status?' selected':'')+'>'+s+'</option>');
    });
    h.push('</select></td>');

    h.push('<td><input class="inp" type="datetime-local" value="'+poS+'" data-f="po_sent"/></td>');
    h.push('<td><input class="inp" type="datetime-local" value="'+poR+'" data-f="po_recv"/></td>');

    h.push('<td style="white-space:nowrap">');
    h.push('<button class="btn btn-sm" data-act="save">Save</button> ');
    h.push('<button class="btn btn-sm" data-act="place">Place Order</button> ');
    h.push('<button class="btn btn-sm" data-act="recv">Mark Received</button>');
    h.push('</td>');

    h.push('</tr>');
  }

  h.push('</tbody></table></div>');
  document.getElementById('list').innerHTML = h.join('');

  async function patchJSON(u,b){
    const r=await fetch(u,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
    if(!r.ok) throw new Error('save_failed');
    return r.json();
  }

  document.querySelectorAll('#wlRows tr[data-bid]').forEach(tr=>{
    const bid = tr.getAttribute('data-bid');
    const $row = (sel)=> tr.querySelector(sel);

    const pill = $row('[data-f="pill"]');
    const mfr  = $row('[data-f="mfr"]');
    const due  = $row('[data-f="due"]');
    const sel  = $row('[data-f="status"]');
    const sent = $row('[data-f="po_sent"]');
    const recv = $row('[data-f="po_recv"]');

    async function doSave(body){
      const r = await patchJSON('/api/bids/'+bid+'/purchasing', body);
      pill.textContent = r.purchasing_status || 'waiting';
      if (r.purchasing_status==='received') { pill.style.background='#083344'; pill.style.borderColor='#0e7490'; }
      else { pill.style.background=''; pill.style.borderColor=''; }
    }

    [mfr,due,sel,sent,recv].forEach(el=> el?.addEventListener('change', ()=>{
      doSave({
        purchasing_status: sel.value,
        mfr_override: (mfr.value||'').trim() || null,
        due_date: due.value || null,
        po_sent_at: sent.value ? new Date(sent.value).toISOString() : null,
        po_received_at: recv.value ? new Date(recv.value).toISOString() : null
      }).catch(e=> console.error(e));
    }));

    tr.querySelector('[data-act="save"]')?.addEventListener('click', ()=>{
      doSave({
        purchasing_status: sel.value,
        mfr_override: (mfr.value||'').trim() || null,
        due_date: due.value || null,
        po_sent_at: sent.value ? new Date(sent.value).toISOString() : null,
        po_received_at: recv.value ? new Date(recv.value).toISOString() : null
      }).catch(()=> alert('Save failed'));
    });

    tr.querySelector('[data-act="place"]')?.addEventListener('click', ()=>{
      const nowIso = new Date().toISOString();
      sel.value='po_sent'; sent.value = nowIso.slice(0,16);
      doSave({ purchasing_status:'po_sent', po_sent_at: nowIso }).catch(()=> alert('Failed'));
    });

    tr.querySelector('[data-act="recv"]')?.addEventListener('click', ()=>{
      const nowIso = new Date().toISOString();
      sel.value='received'; recv.value = nowIso.slice(0,16);
      doSave({ purchasing_status:'received', po_received_at: nowIso }).catch(()=> alert('Failed'));
    });
  });
}
async function load(){
  if (filter === 'worklist') {
    await renderWorklist();
    try { aiAgentCheck && aiAgentCheck(); } catch {}
    return;
  }
  if (filter === 'hub') {
    await renderHub();
    try { aiAgentCheck && aiAgentCheck(); } catch {}
    return;
  }
  const url = (filter === 'timeline') ? '/api/po/list' : '/api/po/list' + (filter?('?status='+encodeURIComponent(filter)):'');
  const r=await fetch(url, {cache:'no-store'});
  all = await r.json();
  window.all = all;
  render();
}
/* ---------- Job Hub ---------- */
async function renderHub(){
  const wrap = document.getElementById('list');
  // header with job search
  wrap.innerHTML = '<div class="panel">'
    + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
    +   '<div class="muted">Pick Job</div>'
    +   '<input id="hubJobSearch" placeholder="Search job name or #123" style="min-width:260px"/>'
    +   '<div id="hubJobSuggest" style="display:none;background:#0f121a;border:1px solid #212432;border-radius:8px;max-height:180px;overflow:auto"></div>'
    +   '<input id="hubJobId" placeholder="Job ID" style="width:120px"/>'
    +   '<button id="hubLoad" class="btn">Load</button>'
    + '</div>'
    + '<div id="hubOut" style="margin-top:10px"></div>'
    + '</div>';

  const $h = s => document.querySelector(s);
  function renderSuggest(list){
    const box = $h('#hubJobSuggest');
    if (!Array.isArray(list) || !list.length) { box.innerHTML=''; box.style.display='none'; return; }
    box.style.display='';
    box.innerHTML = list.map(j=>'<div class="opt" data-id="'+j.id+'" style="padding:6px 8px;border-bottom:1px solid #1f2635;cursor:pointer">'+(j.customer_name||'Job')+' — #'+j.id+'</div>').join('');
    box.querySelectorAll('.opt').forEach(el=> el.onclick = ()=>{
      $h('#hubJobId').value = el.dataset.id;
      $h('#hubJobSearch').value = el.textContent.trim();
      box.innerHTML=''; box.style.display='none';
    });
  }
  let t;
  $h('#hubJobSearch').addEventListener('input', ()=>{
    clearTimeout(t);
    const q = $h('#hubJobSearch').value.trim();
    if (!q) { renderSuggest([]); return; }
    t = setTimeout(async ()=>{
      try{
        const r = await fetch('/api/jobs/search?term='+encodeURIComponent(q));
        renderSuggest(await r.json());
      }catch{ renderSuggest([]); }
    }, 200);
  });
  $h('#hubLoad').onclick = async ()=>{
    const id = Number($h('#hubJobId').value||'0');
    if (!id) { alert('Enter a Job ID'); return; }
    const out = $h('#hubOut'); out.innerHTML = '<div class="muted">Loading…</div>';
    try{
      const hub = await fetch('/api/jobs/'+id+'/purchasing-hub').then(r=>r.json());
      const pos = Array.isArray(hub.pos) ? hub.pos : [];
      const docs = Array.isArray(hub.docs) ? hub.docs : [];
      const recs = Array.isArray(hub.receipts) ? hub.receipts : [];
      const head = '<div style="font-weight:600;margin-bottom:6px">'+(hub.job?.customer_name||('Job #'+id))+'</div>';
      const col = (title, html)=> '<div class="panel" style="flex:1;min-width:280px">'
        + '<div style="font-weight:600;margin-bottom:6px">'+title+'</div>'+ html +'</div>';

      const poTbl = pos.length ? ('<table><thead><tr><th>ID</th><th>Vendor</th><th>Status</th><th>Req→Rec</th><th>Docs</th></tr></thead><tbody>'
        + pos.map(p=>'<tr>'
          + '<td>#'+p.id+'</td>'
          + '<td>'+(p.vendor||'')+(p.brand?(' - '+p.brand):'')+'</td>'
          + '<td>'+p.status+'</td>'
          + '<td>'+Number(p.rec||0)+'/'+Number(p.req||0)+'</td>'
          + '<td>'+(Number(p.doc_count||0))+'</td>'
        + '</tr>').join('') + '</tbody></table>') : '<div class="muted">No POs yet.</div>';

      const recList = recs.length ? recs.map(r=>{
        const d = new Date(r.created_at).toLocaleString();
        return '<div style="padding:6px 0;border-bottom:1px solid #212432">Item '+r.po_item_id+': +'+r.qty_received+' <span class="muted">'+d+'</span></div>';
      }).join('') : '<div class="muted">No receipts.</div>';

      const docList = docs.length ? docs.map(d=>'<div style="padding:6px 0;border-bottom:1px solid #212432"><a target="_blank" href="'+d.url+'">'+(d.file_name||'document')+'</a> <span class="muted">'+new Date(d.created_at).toLocaleString()+'</span></div>').join('') : '<div class="muted">No documents.</div>';

      out.innerHTML = head + '<div style="display:flex;gap:12px;flex-wrap:wrap">'
        + col('Purchase Orders', poTbl)
        + col('Recent Receipts', recList)
        + col('Documents', docList)
        + '</div>';
    }catch(e){ out.innerHTML = '<div class="panel">Failed to load hub.</div>'; }
  };
  // If a global search preselected a job, auto-load it
  if (nextHubJobId){
    $h('#hubJobId').value = String(nextHubJobId);
    $h('#hubLoad').click();
    nextHubJobId = null;
  }
}
function render(){
  if (filter==='timeline') {
    const ordered = all.filter(r=>r.placed_at);
    const expected = all.filter(r=>r.expected_date);
    const received = all.filter(r=>r.status==='received');
    const col = (title,list,dateKey)=> '<div class="panel" style="flex:1;min-width:260px;margin:6px">'+
      '<div style="font-weight:600;margin-bottom:6px">'+title+'</div>'+
      (list.length? list.map(r=>{
        const d = (r[dateKey]||'').substring(0,10);
        return '<div style="padding:6px 0;border-bottom:1px solid #212432">'+
          '<div>'+(r.customer_name||('Job '+r.job_id))+' — '+(r.vendor||'')+'</div>'+
          (d?('<div class="muted" style="font-size:12px">'+d+'</div>'):'')+
        '</div>';
      }).join('') : '<div class="muted">No items</div>') + '</div>';
    $('#list').innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap">'
      + col('Ordered', ordered, 'placed_at')
      + col('Expected', expected, 'expected_date')
      + col('Received', received, 'received_at')
      + '</div>';
    try { aiAgentCheck && aiAgentCheck(); } catch {}
    return;
  }

  const rows = all.filter(x=> (filter==='received' ? x.status==='received'
                    : (filter==='ordered' ? (x.status==='ordered'||x.status==='partial_received')
                    : x.status===filter)));

  const head = '<thead><tr><th>Job</th><th>Vendor</th><th>Docs</th><th>PO #</th><th>Status</th><th>Req→Rec</th><th style="text-align:right"><button id="newBidOrder" class="btn">+ New Bid/Order</button></th></tr></thead>';

  $('#list').innerHTML = rows.length ? (
    '<table>'+ head +'<tbody>'+
     rows.map(r=>'<tr data-id="'+r.id+'">'+
       '<td>'+(r.customer_name||('Job '+r.job_id))+'</td>'+
       '<td>'+(r.vendor||'')+(r.brand?(' - '+r.brand):'')+'</td>'+
       '<td>'+(Number(r.doc_count||0))+' docs <button class="btn btn-sm" data-attach="'+r.id+'">Attach</button></td>'+
       '<td>'+(r.order_no||'-')+'</td>'+
       '<td>'+r.status+'</td>'+
       '<td>'+Number(r.rec||0)+'/'+Number(r.req||0)+'</td>'+
       '<td style="text-align:right"><button class="btn btn-sm" data-open="'+r.id+'">Open</button></td>'+
     '</tr>').join('') + '</tbody></table>'
  ) : '<div class="panel">No POs.</div>';

  // Table row open
  document.querySelectorAll('tr[data-id]').forEach(tr=>{
    tr.onclick = (ev)=>{
      if (ev.target && (ev.target.matches('button[data-attach]') || ev.target.matches('button[data-open]'))) return;
      openDrawer(Number(tr.dataset.id));
    };
  });
  // Open buttons
  document.querySelectorAll('button[data-open]').forEach(b=>{
    b.onclick = (e)=>{ e.stopPropagation(); openDrawer(Number(b.getAttribute('data-open'))); };
  });
  // Attach doc buttons
  document.querySelectorAll('button[data-attach]').forEach(btn=>{
    btn.onclick = ()=>{
      const id = Number(btn.getAttribute('data-attach'));
      sel = all.find(x=>x.id===id) || null;
      const up = document.getElementById('bol');
      if (up) { up.setAttribute('data-poid', String(id)); up.click(); }
    };
  });
  // New Bid/Order button → open modal
  const addBtn = $('#newBidOrder');
  if (addBtn) addBtn.onclick = ()=>{
    $('#newBidOrderModal').style.display='flex';
    $('#modalBidJobSearch').focus();
  };

  try { aiAgentCheck && aiAgentCheck(); } catch {}
}

async function openDrawer(id){
  sel = all.find(x=>x && x.id===id);
  if (!sel) return;
  $('#dTitle').textContent = 'PO #'+sel.id+' - '+(sel.vendor||'')+' - '+(sel.customer_name||('Job '+sel.job_id));
  $('#dOrderNo').value = sel.order_no||'';
  $('#dVendor').value = sel.vendor||'';
  $('#dStatus').value = sel.status||'pending';
  $('#dExpect').value = sel.expected_date || '';

  const items = await fetch('/api/po/'+id+'/items').then(r=>r.json());
  $('#dItems').innerHTML =
    '<div class="muted">Items</div>' +
    items.map(i=>{
      const rid = 'rq_'+i.id, oid='or_'+i.id;
      return (
        '<div style="display:grid;grid-template-columns:1fr 70px 70px;gap:8px;align-items:center;margin:6px 0">'+
          '<div>'+(i.description||i.sku||'Item')+'</div>'+
          '<input id="'+rid+'" type="number" min="0" step="1" value="'+(i.qty_required||0)+'"/>'+
          '<input id="'+oid+'" type="number" min="0" step="1" value="'+(i.qty_ordered||0)+'"/>'+
        '</div>'
      );
    }).join('')+
    '<div style="display:flex;gap:8px;align-items:center;margin-top:6px">'+
      '<input id="newDesc" placeholder="Description/SKU" style="flex:1"/>'+
      '<input id="newQty" type="number" min="0" step="1" placeholder="Qty" style="width:110px"/>'+
      '<button id="btnAddItem" class="btn">+ Add Item</button>'+
    '</div>';

  // qty edits
  items.forEach(i=>{
    const rid = document.getElementById('rq_'+i.id);
    const oid = document.getElementById('or_'+i.id);
    const save = async ()=>{
      try{
        await fetch('/api/po/items/'+i.id, { method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ qty_required: Number(rid.value||0), qty_ordered: Number(oid.value||0) }) });
      }catch(e){ console.error('save item failed', e); }
    };
    rid?.addEventListener('change', save);
    oid?.addEventListener('change', save);
  });

  // add item
  $('#btnAddItem')?.addEventListener('click', async ()=>{
    const desc = $('#newDesc').value.trim();
    const qty  = Number($('#newQty').value||0);
    if(!desc || !qty) return;
    await fetch('/api/po/'+id+'/items', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ description: desc, qty_required: qty, unit:'ea' }) });
    await load(); $('#drawer').style.display='none';
  });

  // docs list
  try{
    const docs = await fetch('/api/po/'+id+'/docs').then(r=>r.json());
    $('#dDocs').innerHTML = (docs||[]).length ? docs.map(d=>'<a target="_blank" href="'+d.url+'">'+(d.file_name||'document')+'</a>').join('<br>') : 'No documents attached.';
  }catch{ $('#dDocs').textContent = 'No documents attached.'; }

  $('#drawer').style.display='block';
}

/* ---------- Drawer controls ---------- */
$('#btnClose').onclick = ()=> $('#drawer').style.display='none';
$('#btnPlace').onclick = async ()=>{ if(!sel) return;
  await fetch('/api/po/'+sel.id, { method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ status:'ordered', order_no: $('#dOrderNo').value || null, expected_date: $('#dExpect').value || null, placed_at: new Date().toISOString() })
  });
  await load(); $('#drawer').style.display='none';
};
$('#btnReceive').onclick = async ()=>{ if(!sel) return;
  const itemId = prompt('Receive against which item id?');
  const qty = Number(prompt('Quantity received?')||'0');
  if(!itemId || !qty) return;
  await fetch('/api/po/items/'+itemId+'/receive', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ qty }) });
  await load(); $('#drawer').style.display='none';
};
$('#btnUploadDoc').addEventListener('click', ()=>{
  if (!sel) { alert('Open a PO first'); return; }
  const up = document.getElementById('bol'); up.setAttribute('data-poid', String(sel.id)); up.click();
});
document.getElementById('bol').addEventListener('change', async (e)=>{
  try{
    const up = e.target; const poId = up.getAttribute('data-poid'); if (!poId) return;
    const f = up.files && up.files[0]; if(!f) return;
    const r = new FileReader();
    const dataUrl = await new Promise((resolve, reject)=>{ r.onload = ()=>resolve(r.result); r.onerror = reject; r.readAsDataURL(f); });
    const body = { name: f.name, dataUrl, kind: 'confirmation' };
    const res = await fetch('/api/po/'+poId+'/docs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if(!res.ok){ alert('Upload failed'); return; }
    const docs = await fetch('/api/po/'+poId+'/docs').then(r=>r.json());
    $('#dDocs').innerHTML = (docs||[]).map(d=>'<a target="_blank" href="'+d.url+'">'+(d.file_name||'document')+'</a>').join('<br>');
    up.value = ''; up.removeAttribute('data-poid');
  }catch(err){ console.error(err); alert('Upload failed'); }
});

// persist header changes
document.addEventListener('change', async (e)=>{
  if(!sel) return;
  const t = e.target;
  if (t && (t.id==='dVendor' || t.id==='dStatus' || t.id==='dOrderNo' || t.id==='dExpect')){
    try{
      const body = {
        vendor: $('#dVendor')?.value || null,
        status: $('#dStatus')?.value || null,
        order_no: $('#dOrderNo')?.value || null,
        expected_date: $('#dExpect')?.value || null
      };
      await fetch('/api/po/'+sel.id, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      await load();
    }catch(err){ console.error('save po failed', err); }
  }
});

/* ---------- Modal: New Bid/Order ---------- */
const jobSearch = document.getElementById('modalBidJobSearch');
const jobIdBox  = document.getElementById('modalBidJobId');
const jobSuggest = document.getElementById('modalBidJobSuggest');

function renderJobSuggest(list){
  if (!Array.isArray(list) || !list.length) { jobSuggest.innerHTML=''; jobSuggest.style.display='none'; return; }
  jobSuggest.style.display='';
  jobSuggest.innerHTML = list.map(j =>
    '<div class="opt" data-id="'+j.id+'" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid #1f2635">'
    +(j.customer_name||'Job')+' — #'+j.id+'</div>').join('');
  jobSuggest.querySelectorAll('.opt').forEach(opt=>{
    opt.onclick = ()=>{
      jobIdBox.value = opt.dataset.id;
      jobSearch.value = opt.textContent.trim();
      jobSuggest.innerHTML=''; jobSuggest.style.display='none';
    };
  });
}
let tFind;
jobSearch.addEventListener('input', ()=>{
  clearTimeout(tFind);
  const q = jobSearch.value.trim();
  if (!q) { renderJobSuggest([]); return; }
  tFind = setTimeout(async ()=>{
    try{
      const r = await fetch('/api/jobs/search?term='+encodeURIComponent(q));
      renderJobSuggest(await r.json());
    }catch{ renderJobSuggest([]); }
  }, 200);
});

document.getElementById('modalBidCancel').onclick = ()=>{
  document.getElementById('newBidOrderModal').style.display='none';
};

document.getElementById('modalBidCreate').onclick = async ()=>{
  const job_id = Number(jobIdBox.value||'0');
  const vendor = (document.getElementById('modalBidVendor').value||'').trim();
  const brand  = (document.getElementById('modalBidManufacturer').value||'').trim() || null;
  const category = document.getElementById('modalBidCategory').value || null;
  const status = document.getElementById('modalBidStatus').value || 'pending';
  const due_date = document.getElementById('modalBidDueDate').value || null;
  const notes = document.getElementById('modalBidNotes').value.trim() || null;
  const amount = Number(document.getElementById('modalBidAmount').value||0);
  const file = document.getElementById('modalBidOrderForm').files[0];

  // Accept "#35" in the search box as a Bid ID if user didn't click a suggestion
  let bid_id = null;
  const m = (jobSearch.value||'').match(/#(\d+)/);
  if (!job_id && m) bid_id = Number(m[1]);

  if (!job_id && !bid_id) { alert('Select a Job (or type #Bid and press Create)'); return; }
  if (!vendor) { alert('Vendor is required'); return; }

  const btn = document.getElementById('modalBidCreate');
  btn.disabled = true;
  try{
    // robust backend resolves bid_id→job or uses job_id directly
    const poRes = await fetch('/api/po', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ job_id: job_id || null, bid_id, vendor, brand, category, status })
    });
    if (!poRes.ok) throw new Error('Create PO failed');
    const po = await poRes.json();

    if (due_date || notes || amount){
      await fetch('/api/po/'+po.id, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ expected_date: due_date, meta:{ notes, amount } })
      });
    }
    if (file){
      const r = new FileReader();
      const dataUrl = await new Promise((resolve,reject)=>{ r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
      await fetch('/api/po/'+po.id+'/docs', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name:file.name, dataUrl, kind:'confirmation' }) });
    }

    document.getElementById('newBidOrderModal').style.display='none';
    await load();
  }catch(e){
    console.error(e); alert('Error creating bid/order: '+(e.message||e));
  }finally{ btn.disabled=false; }
};

/* ---------- Tabs & bootstrap ---------- */
document.querySelectorAll('.tab[data-f]').forEach(b=> b.onclick=()=>{ 
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); filter=b.dataset.f; load();
});

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', load); } else { load(); }
</script>
</body></html>`);
  });
}
