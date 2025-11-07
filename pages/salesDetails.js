// pages/salesDetails.js
import { requireRolePage } from "../routes/auth.js";

export default function registerSalesDetails(app){
  app.get("/sales-details", requireRolePage(["sales","admin"]), (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sales Details</title>
<link rel="stylesheet" href="/static/appbar.css">
<link rel="stylesheet" href="/static/sales-nav.css">
<script src="/static/sales-nav.js"></script>
<style>
  /* Layout */
  body{background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto,Arial;margin:0}
  .wrap{max-width:1100px;margin:0 auto;padding:18px}
  .panel{background:#111318;border:1px solid #212432;border-radius:14px;padding:12px 14px;margin:12px 0}

  /* Typography */
  h1{margin:0 0 8px;font-size:22px}
  h3{margin:0 0 8px;font-size:16px}

  /* Fields */
  label{display:block;font-size:12px;color:#9aa4b2;margin:4px 0 4px}
  input,textarea,select{
    width:100%;padding:8px 10px;border-radius:10px;border:1px solid #2a2f3f;
    background:#0f1220;color:#eef2ff;box-sizing:border-box
  }
  textarea{min-height:56px;resize:vertical}

  /* Generic layout helpers */
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .grid{display:grid;gap:8px}
  .g2{grid-template-columns:repeat(2,minmax(0,1fr))}
  /* Make per-card two columns on desktop, one on small widths */
  .gridx{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
  .row-right{display:flex;justify-content:flex-end;gap:10px}

  .docchips { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px }
  .docchip  { display:inline-flex; align-items:center; gap:8px; padding:6px 10px;
              border:1px solid #2a2f3f; border-radius:9999px; background:#1a2033; color:#eef2ff; }
  .docchip a { color:#eef2ff; text-decoration:none; }
  .docchip .x { border:1px solid #39425a; background:#162035; border-radius:8px; padding:2px 6px; cursor:pointer; }
  .docchip .x:hover { background:#1d2947; }


  /* Buttons */
  .btn{padding:8px 12px;border-radius:12px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;cursor:pointer}
  .btn:hover{background:#222a44}
  .btnx{padding:8px 12px;border-radius:10px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;cursor:pointer}
  .btnx:hover{background:#222a44}

  /* Per-card */
  .cardx { background:#0f1220; border:1px solid #212432; border-radius:14px; padding:12px; }
  .rowx  { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .hrx   { border:none; border-top:1px solid #212432; margin:10px 0; }
  .tblx  { width:100%; border-collapse:collapse; }
  .tblx th,.tblx td { border-bottom:1px solid #212432; padding:8px; font-size:13px; text-align:left; }

  .mutedx { color:#9aa4b2; font-size:12px; }
  .badge  { display:inline-block; padding:3px 8px; border-radius:9999px; background:#132133; color:#c7d2fe; font-size:12px; }

  /* Tighter top panel spacing */
  #panelSpecs .grid > div { margin-bottom: 4px; }
  #panelSpecs .row-right { margin-top: 6px; }
</style>

</head>
<body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<script src="/static/sales-nav.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    if (window.createSalesNav) window.createSalesNav('details');
  });
</script>

<div class="wrap">
  <h1>Sales Details</h1>
  <div id="bidMeta" class="row" style="opacity:.85;font-size:13px;margin-bottom:6px"></div>

  <!-- Project Snapshot (bid-level, compact) -->
  <div class="panel" id="panelSpecs" style="padding:12px 14px">
    <div class="row" style="justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px">
      <h3 style="margin:0; font-size:16px">Project Snapshot</h3>
      <div id="snapshotBadges" class="row" style="gap:8px">
        <span class="badge" id="badgeCards">0 Cards</span>
        <span class="badge" id="badgeUnits">0 Units</span>
        <span class="badge" id="badgeDocs">0 Docs</span>
      </div>
    </div>
    <div class="grid g2" style="gap:8px">
      <div><label>Order Number</label><input id="info_order_no"/></div>
      <div></div>
    </div>
    <div class="grid" style="margin-top:8px; gap:8px">
      <div><label>Notes</label><textarea id="info_notes"></textarea></div>
      <div><label>Specific Notes (per plan / hardware locations)</label><textarea id="info_specific_notes"></textarea></div>
    </div>
    <div class="row" style="justify-content:flex-end; margin-top:8px">
      <button class="btn" id="saveBidBtn">Save (Bid)</button>
    </div>
  </div>


  <!-- Units / Room Cards -->
  <div class="panel">
    <h3 style="margin:0 0 8px">Units / Room Cards</h3>
    <div id="cardsHost" class="grid" style="gap:14px"></div>
  </div>

  <!-- Upload PDFs/Images (bid-level) with drag-drop -->
  <div class="panel">
    <h3 style="margin:0 0 8px">Upload PDFs / Images (Bid-level)</h3>
    
    <!-- Drag-and-drop zone -->
    <div id="dropZone" style="border:2px dashed #2a2f3f;border-radius:12px;padding:24px;text-align:center;background:#0f1220;cursor:pointer;transition:all 0.2s">
      <div style="font-size:48px;margin-bottom:8px">📎</div>
      <div style="font-size:14px;color:#eef2ff;margin-bottom:4px">Drag & drop files here or click to browse</div>
      <div class="mutedx">Supports: PDF, JPEG, PNG, HEIC • Max 15MB per file • Multiple files OK</div>
      <input id="pdf_file" type="file" accept="application/pdf,image/*,.heic,.heif" multiple style="display:none">
    </div>
    
    <!-- Preview thumbnails before upload -->
    <div id="previewZone" style="margin-top:12px;display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:13px;color:#9aa4b2">Ready to upload (<span id="previewCount">0</span> files)</div>
        <button class="btn" id="uploadAllBtn" style="background:#1a4d2e;border-color:#2d6a4f">Upload All</button>
      </div>
      <div id="previewList" class="gridx"></div>
    </div>
    
    <!-- Upload controls -->
    <div class="row" style="margin-top:12px;gap:8px">
      <select id="pdf_kind">
        <option value="layout">Layout</option>
        <option value="rendering">Rendering</option>
        <option value="order">Order Sheet</option>
        <option value="spec">Spec Sheet</option>
        <option value="other">Other</option>
      </select>
      <input id="pdf_name" placeholder="Optional: custom name" style="flex:1">
    </div>
    
    <!-- Uploaded documents -->
    <div id="bidDocsList" class="gridx" style="margin-top:12px"></div>
  </div>

    <div class="row" style="margin-top:8px">
      <select id="link_kind">
        <option value="layout">layout</option>
        <option value="rendering">rendering</option>
        <option value="order">order</option>
        <option value="spec">spec</option>
        <option value="other">other</option>
      </select>
      <input id="link_name" placeholder="Document name" style="flex:1">
      <input id="link_url"  placeholder="https://drive.google.com/..." style="flex:2">
      <button class="btn" id="link_add_btn">Add Link</button>
    </div>

  <div class="row" style="justify-content:space-between; margin-top:10px">
    <a class="btn" href="/sales-home">&larr; Back</a>
    <div class="row-right">
      <a class="btn" id="toQuoteBtn">Open Quote</a>
      <button class="btn" id="submitPurchBtn" style="background:#1a4d2e;border-color:#2d6a4f">Review & Submit</button>
    </div>
  </div>
</div>

<script>
  // ---------- utils ----------
  function $(s){ return document.querySelector(s); }
  function el(tag, attrs){ var n=document.createElement(tag); if(attrs){ for(var k in attrs){ if(k==='text') n.textContent=attrs[k]; else n.setAttribute(k, attrs[k]); } } return n; }
  function fetchSoft(u,opts){ return fetch(u,opts||{}).then(r=>r.ok?r.json():null).catch(()=>null); }
  function fetchJSON(u,opts){ return fetch(u,opts||{}).then(async r=>{ if(!r.ok) throw new Error(u+' HTTP '+r.status); return r.json(); }); }
  function q(name){ return new URLSearchParams(location.search).get(name); }
  function money(n){ var v=Number(n||0); return v.toLocaleString('en-US',{style:'currency',currency:'USD'}); }

  // ---------- client-side image compression ----------
  function compressImage(file, maxWidth = 1920, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Calculate new dimensions (preserve aspect ratio)
          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = (height / width) * maxWidth;
              width = maxWidth;
            } else {
              width = (width / height) * maxWidth;
              height = maxWidth;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              reject(new Error('Canvas conversion failed'));
            }
          }, 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Avoid JSX anywhere; plain DOM only.
  var bid = Number(q('bid')||'');
  if ($('#bidMeta')) { $('#bidMeta').textContent = bid ? ('Bid #'+bid) : 'Missing bid id'; }
  if ($('#toQuoteBtn')) { $('#toQuoteBtn').onclick = function(){ if(bid) location.href='/sales-quote?bid='+bid; }; }
  if ($('#submitPurchBtn')) { $('#submitPurchBtn').onclick = function(){ if(!bid) return alert('Missing bid id'); location.href='/sales-review?bid='+bid; }; }

  function docLabel(d){
  try { return (d.kind || 'doc') + ' — ' + (d.name || d.url.split('/').pop()); }
  catch { return (d.kind || 'doc') + ' — ' + (d.name || 'file'); }
}

function addDocChip(host, d, bidId){
  if (!d || !d.url) return;
  const row = document.createElement('div');
  row.className = 'rowx';

  const a = document.createElement('a');
  a.href = d.url; a.target = '_blank'; a.className = 'btnx';
  a.textContent = docLabel(d);

  const del = document.createElement('button');
  del.className = 'btnx'; del.title = 'Delete'; del.textContent = '×';
  del.onclick = async () => {
    try {
      await fetch('/api/bids/'+bidId+'/docs/delete', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url: d.url })
      });
      row.remove();
    } catch { alert('Delete failed'); }
  };

  row.appendChild(a); row.appendChild(del);
  host.appendChild(row);
}


  // ---------- bid-level load/save ----------
async function loadBidDetails(){
  if(!bid) return;

  // Pull bid details
  const d = await fetchSoft('/api/bids/'+bid+'/details');
  const ob = (d && d.onboarding) ? d.onboarding : {};
  const docs = (d && Array.isArray(d.doc_links)) ? d.doc_links : [];

  // Set only bid-level fields we keep
  function set(id,val){ const e=document.querySelector(id); if(e) e.value = (val==null?'':String(val)); }
  set('#info_order_no', ob.order_no);
  set('#info_notes', ob.notes);
  set('#info_specific_notes', ob.specific_notes);

  // Bid-level docs list using addDocChip
  const host = document.getElementById('bidDocsList');
  if (host) {
    host.innerHTML = '';
    (docs.filter(x => !x.column_id)).forEach(d => {
      addDocChip(host, d, bid);
    });
  }

  // Snapshot badges (cards/units/docs)
  try {
    const model = await fetchSoft('/api/bids/'+bid+'/model'); // { columns }
    const cols = (model && Array.isArray(model.columns)) ? model.columns : [];
    const totalUnits = cols.reduce((s,c)=> s + Number(c.units||0), 0);
    const badgeCards = document.getElementById('badgeCards');
    const badgeUnits = document.getElementById('badgeUnits');
    const badgeDocs  = document.getElementById('badgeDocs');
    if (badgeCards) badgeCards.textContent = cols.length + ' ' + (cols.length === 1 ? 'Card' : 'Cards');
    if (badgeUnits) badgeUnits.textContent = totalUnits + ' ' + (totalUnits === 1 ? 'Unit' : 'Units');
    if (badgeDocs)  badgeDocs.textContent  = docs.length + ' ' + (docs.length === 1 ? 'Doc' : 'Docs');
  } catch (_) {}
}

function parseMetaString(s){
  // Accepts: "Mfg: Patagonia | Species: Maple | Style: Shaker | Color: White"
  const out = {};
  (String(s||'').split('|')).forEach(pair=>{
    const [k,v] = pair.split(':').map(x=>String(x||'').trim());
    if (!k || !v) return;
    const key = k.toLowerCase();
    if (key.startsWith('mfg')) out.manufacturer = v;
    else if (key.startsWith('species')) out.species = v;
    else if (key.startsWith('style')) out.style = v;
    else if (key.startsWith('color')) out.finish_color = v;
  });
  return out;
}


  async function saveBid(){
    if(!bid) return alert('Missing bid id');
    function v(id){ return ($(id)&&$(id).value) ? $(id).value.trim() : ''; }
    const onboarding = {
      order_no: (document.querySelector('#info_order_no')?.value || '').trim(),
      notes: (document.querySelector('#info_notes')?.value || '').trim(),
      specific_notes: (document.querySelector('#info_specific_notes')?.value || '').trim()
    };
    try{
      await fetchJSON('/api/bids/'+bid+'/details', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ onboarding: onboarding })
      });
      alert('Saved ✓');
    } catch(e){ alert(e.message||'Save failed'); }
  }
  $('#saveBidBtn') && ($('#saveBidBtn').onclick = saveBid);

  // ---------- dataURL helper (pdf/images) ----------
  async function fileToDataUrl(file){
    const ok = new Set(['application/pdf','image/png','image/jpeg','image/webp','image/heic']);
    if (!file || !ok.has(file.type)) throw new Error('PDF or image only');
    if (file.size > 15*1024*1024) throw new Error('File too large (>15MB)');

    // Use FileReader to avoid call-stack errors
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Read failed'));
      reader.onload  = () => resolve(reader.result); // already a data: URL
      reader.readAsDataURL(file);
    });
  }


  // ---------- per-card hardware rows ----------
  function makeHardwareRow(data){
    var tr = document.createElement('tr');
    tr.innerHTML = ''
      + '<td><select class="hw-kind">'
      + '<option value="handle">handle</option>'
      + '<option value="knob">knob</option>'
      + '<option value="pull">pull</option>'
      + '<option value="appliance">appliance</option>'
      + '<option value="other">other</option>'
      + '</select></td>'
      + '<td><input class="hw-model"  placeholder="Model"  style="width:100%"></td>'
      + '<td><input class="hw-finish" placeholder="Finish" style="width:100%"></td>'
      + '<td><input class="hw-count"  type="number" min="0" step="1" value="0" style="width:90px"></td>'
      + '<td><button class="btnx hw-del">Remove</button></td>';
    tr.querySelector('.hw-kind').value   = (data&&data.kind)   ? data.kind   : 'handle';
    tr.querySelector('.hw-model').value  = (data&&data.model)  ? data.model  : '';
    tr.querySelector('.hw-finish').value = (data&&data.finish) ? data.finish : '';
    tr.querySelector('.hw-count').value  = Number((data&&data.unit_count)||0);
    tr.querySelector('.hw-del').onclick  = function(){ tr.remove(); };
    return tr;
  }
  function readHardwareRows(tbody){
    return Array.prototype.map.call(tbody.querySelectorAll('tr'), function(tr){
      return {
        kind: tr.querySelector('.hw-kind').value,
        model: (tr.querySelector('.hw-model').value||'').trim(),
        finish: (tr.querySelector('.hw-finish').value||'').trim(),
        unit_count: Number(tr.querySelector('.hw-count').value||0)
      };
    }).filter(function(x){ return x.model || x.unit_count>0; });
  }

  

  // ---------- build one per-column card ----------
  function buildCard(col, details, docsForCol){
    var columnId = Number(col?.column_id ?? col?.id ?? col?.columnId ?? col?.columnID);
    if (!Number.isFinite(columnId)) columnId = null;
    var cardLabel = col.column_label || col.label || 'Unit';
    var unitsVal = Number(col.units ?? col.unit_count ?? 0) || 0;

    var card = el('div',{class:'cardx'});
    var title = el('div',{class:'rowx'});
    title.appendChild(el('div',{class:'badge', text: cardLabel}));
    var idLabel = columnId != null ? ('ID '+columnId) : 'ID —';
    var metaLine = el('div',{class:'mutedx', text:(idLabel+' • Units: '+unitsVal)});
    title.appendChild(metaLine);
    card.appendChild(title);



    // meta
    var meta = details && details.meta ? details.meta : {};
    var metaGrid = el('div',{class:'gridx'});
    metaGrid.innerHTML = ''
      + '<div><label class="mutedx">Manufacturer</label><input class="m-manufacturer"></div>'
      + '<div><label class="mutedx">Species</label><input class="m-species"></div>'
      + '<div><label class="mutedx">Style</label><input class="m-style"></div>'
      + '<div><label class="mutedx">Color</label><input class="m-color"></div>'
      + '<div><label class="mutedx">Island Dimension</label><input class="m-island" placeholder="84\\" x 42\\"></div>'
      + '<div><label class="mutedx"># to Assemble</label><input class="m-assemble" type="number" min="0" step="1" value="0"></div>'
      + '<div><label class="mutedx">Total Cabinets (Count)</label><input class="m-cabcount" type="number" min="0" step="1" value="0"></div>';
    card.appendChild(metaGrid);

    // set values
    card.querySelector('.m-manufacturer').value = meta.manufacturer || '';
    card.querySelector('.m-species').value      = meta.species || '';
    card.querySelector('.m-style').value        = meta.style || '';
    card.querySelector('.m-color').value        = meta.finish_color || '';
    card.querySelector('.m-island').value       = meta.island_dimension || '';
    card.querySelector('.m-assemble').value     = Number(meta.assemble_count || 0);
    card.querySelector('.m-cabcount').value    = Number(meta.num_cabinets || 0);

    // hardware
    card.appendChild(el('hr',{class:'hrx'}));
    var hwWrap = el('div'); hwWrap.appendChild(el('div',{class:'mutedx',text:'Hardware'}));
    var tbl = el('table',{class:'tblx'});
    tbl.innerHTML = '<thead><tr><th>Kind</th><th>Model</th><th>Finish</th><th>Units</th><th></th></tr></thead><tbody></tbody>';
    var tbody = tbl.querySelector('tbody');
    (details && Array.isArray(details.hardware) ? details.hardware : []).forEach(function(h){ tbody.appendChild(makeHardwareRow(h)); });
    hwWrap.appendChild(tbl);
    var addBtn = el('button',{class:'btnx',text:'+ Add Hardware'});
    addBtn.onclick = function(){ tbody.appendChild(makeHardwareRow()); };
    hwWrap.appendChild(addBtn);
    card.appendChild(hwWrap);

    // notes
    card.appendChild(el('hr',{class:'hrx'}));
    var notes = el('div');
    notes.innerHTML = '<label class="mutedx">Notes</label><textarea class="m-notes" style="width:100%"></textarea>';
    notes.querySelector('.m-notes').value = (details && details.notes) ? details.notes : '';
    card.appendChild(notes);

    // per-card upload
    card.appendChild(el('hr',{class:'hrx'}));
    var up = el('div',{class:'rowx'});
    up.innerHTML = ''
      + '<select class="u-kind">'
      + '<option value="layout">layout</option>'
      + '<option value="rendering">rendering</option>'
      + '<option value="order">order</option>'
      + '<option value="spec">spec</option>'
      + '<option value="other">other</option>'
      + '</select>'
      + '<input class="u-name" placeholder="Document name" style="flex:1">'
      + '<input class="u-file" type="file" accept="application/pdf,image/*" multiple>'
      + '<button class="btnx u-upload">Upload</button>'
      + '<div class="mutedx">PDF or image • 15 MB max</div>';
    var docsList = el('div',{class:'gridx'});
    (Array.isArray(docsForCol) ? docsForCol : []).forEach(d => addDocChip(docsList, d, bid));
    card.appendChild(up);
    card.appendChild(docsList);

    // save button
    var saveRow = el('div',{class:'rowx'});
    var saveBtn = el('button',{class:'btnx',text:'Save Card'});
    saveRow.appendChild(saveBtn);
    card.appendChild(el('hr',{class:'hrx'}));
    card.appendChild(saveRow);

    // handlers
    saveBtn.onclick = function(){
      saveBtn.disabled=true; saveBtn.textContent='Saving…';
      var payload = {
        meta: {
          manufacturer: card.querySelector('.m-manufacturer').value.trim(),
          species:      card.querySelector('.m-species').value.trim(),
          style:        card.querySelector('.m-style').value.trim(),
          finish_color: card.querySelector('.m-color').value.trim(),
          island_dimension: card.querySelector('.m-island').value.trim(),
          assemble_count: Number(card.querySelector('.m-assemble').value||0),
          num_cabinets:   Number(card.querySelector('.m-cabcount').value||0)
        },
        hardware: readHardwareRows(tbody),
        notes: card.querySelector('.m-notes').value.trim()
      };
      if (!Number.isFinite(columnId)) {
        alert('Missing column id');
        saveBtn.disabled=false; saveBtn.textContent='Save Card';
        return;
      }
      fetchJSON('/api/bids/'+bid+'/columns-details/'+columnId, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      }).then(function(){ alert('Saved ✓'); })
        .catch(function(e){ alert(e.message||'Save failed'); })
        .finally(function(){ saveBtn.disabled=false; saveBtn.textContent='Save Card'; });
    };

    function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
      const autoSave = debounce(async ()=>{
        // same payload used in saveBtn.onclick
        const payload = {
          meta: {
            manufacturer: card.querySelector('.m-manufacturer').value.trim(),
            species:      card.querySelector('.m-species').value.trim(),
            style:        card.querySelector('.m-style').value.trim(),
            finish_color: card.querySelector('.m-color').value.trim(),
            island_dimension: card.querySelector('.m-island').value.trim(),
            assemble_count: Number(card.querySelector('.m-assemble').value||0),
            num_cabinets:   Number(card.querySelector('.m-cabcount').value||0)
          },
          hardware: readHardwareRows(tbody),
          notes: card.querySelector('.m-notes').value.trim()
        };
        try {
          if (!Number.isFinite(columnId)) return;
          await fetchJSON('/api/bids/'+bid+'/columns-details/'+columnId, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          });
        } catch(_) {}
      }, 800);

      // Wire autosave to meta inputs (not to file inputs)
      ['.m-manufacturer','.m-species','.m-style','.m-color','.m-island','.m-assemble','.m-cabcount','.m-notes']
        .forEach(sel => card.querySelector(sel)?.addEventListener('input', autoSave));


    up.querySelector('.u-upload').onclick = async function(){
      const files = Array.from(up.querySelector('.u-file').files || []);
      if (!files.length) return alert('Pick file(s)');
      const kind = up.querySelector('.u-kind').value || 'other';
      const nameInput = up.querySelector('.u-name');
      try {
        for (const file of files) {
          const dataUrl = await fileToDataUrl(file);
          const name = (nameInput.value || file.name || 'document').trim();
          const resp = await fetchJSON('/api/bids/'+bid+'/docs/upload-dataurl', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ kind, name, dataUrl, column_id: columnId })
          });
          if (resp?.file) addDocChip(docsList, resp.file, bid);
        }
        up.querySelector('.u-file').value=''; nameInput.value='';
        alert('Uploaded ✓');
      } catch (e) {
        alert(e.message || 'Upload failed');
      }
    };

    return card;
  }




  // ---------- load cards ----------
  async function loadCards(){
    if (!bid) return;

    const [columnsResp, detailsResp, documentsResp, modelResp, legacyDetails] = await Promise.all([
      fetchSoft('/api/bids/'+bid+'/columns'),
      fetchSoft('/api/bids/'+bid+'/columns-details'),
      fetchSoft('/api/bids/'+bid+'/documents'),
      fetchSoft('/api/bids/'+bid+'/model'),
      fetchSoft('/api/bids/'+bid+'/details')
    ]);

    const model = modelResp && !modelResp._error ? modelResp : {};
    const modelColumns = Array.isArray(model.columns) ? model.columns : [];
    const modelLines = Array.isArray(model.lines) ? model.lines : [];

    const columnsSafe = Array.isArray(columnsResp) ? columnsResp : [];
    const columns = columnsSafe.length
      ? columnsSafe.map((col) => ({
          column_id: Number(col.id ?? col.column_id ?? col.columnId ?? col.columnID),
          column_label: col.label || col.room || ('Card ' + (col.id ?? col.column_id ?? '')),
          units: Number(col.units ?? 0) || 0,
          room: col.room || null,
          unit_type: col.unit_type || null,
          color: col.color || null
        }))
      : modelColumns;

    const detailsArray = Array.isArray(detailsResp) ? detailsResp : [];
    let detailsMap = {};
    if (detailsArray.length) {
      detailsMap = detailsArray.reduce((acc, row) => {
        const cid = Number(row.column_id);
        if (!Number.isFinite(cid)) return acc;
        acc[cid] = {
          meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
          hardware: Array.isArray(row.hardware) ? row.hardware : [],
          notes: row.notes ?? null
        };
        return acc;
      }, {});
    } else if (detailsResp && typeof detailsResp === 'object' && !Array.isArray(detailsResp)) {
      detailsMap = detailsResp;
    }

    const documentList = Array.isArray(documentsResp) ? documentsResp : [];
    const legacyDocLinks = (legacyDetails && Array.isArray(legacyDetails.doc_links)) ? legacyDetails.doc_links : [];
    const docsCombined = documentList.length ? documentList : legacyDocLinks;

    const noteLines = modelLines
      .filter(l => String(l.category||'').toLowerCase() === 'notes' && /^mfg:/i.test(String(l.description||'')))
      .map(l => parseMetaString(l.description));

    const host = document.getElementById('cardsHost');
    if (host) host.innerHTML = '';

    (columns || []).forEach((c, idx) => {
      const columnId = Number(c.column_id ?? c.id ?? c.columnId ?? c.columnID);
      const saved = Number.isFinite(columnId) ? detailsMap[columnId] || {} : {};
      const hasSavedMeta = saved.meta && (saved.meta.manufacturer || saved.meta.species || saved.meta.style || saved.meta.finish_color);
      const fallbackMeta = (!hasSavedMeta && noteLines[idx]) ? { meta: noteLines[idx], hardware: [], notes: '' } : {};
      const det = hasSavedMeta ? saved : fallbackMeta;

      const docsForCol = docsCombined.filter((doc) => {
        const docCol = Number(doc?.column_id ?? doc?.columnId);
        return Number.isFinite(columnId) && Number.isFinite(docCol) && docCol === columnId;
      });

      if (host) host.appendChild(buildCard(c, det, docsForCol));
    });
  }


  // ---------- bid-level drag-drop upload with preview ----------
  let pendingFiles = [];
  
  const dropZone = $('#dropZone');
  const fileInput = $('#pdf_file');
  const previewZone = $('#previewZone');
  const previewList = $('#previewList');
  const previewCount = $('#previewCount');
  const uploadAllBtn = $('#uploadAllBtn');
  
  // Click to browse
  if (dropZone && fileInput) {
    dropZone.onclick = () => fileInput.click();
  }
  
  // Drag-drop handlers
  if (dropZone) {
    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#4a9eff';
      dropZone.style.background = '#1a2a44';
    };
    dropZone.ondragleave = () => {
      dropZone.style.borderColor = '#2a2f3f';
      dropZone.style.background = '#0f1220';
    };
    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#2a2f3f';
      dropZone.style.background = '#0f1220';
      const files = Array.from(e.dataTransfer.files || []);
      handleFileSelection(files);
    };
  }
  
  // File input change
  if (fileInput) {
    fileInput.onchange = () => {
      const files = Array.from(fileInput.files || []);
      handleFileSelection(files);
    };
  }
  
  // Handle file selection and show previews
  async function handleFileSelection(files) {
    if (!files.length) return;
    
    for (const file of files) {
      // Client-side compress images before previewing
      let processedFile = file;
      const isImage = file.type.startsWith('image/');
      
      if (isImage && file.size > 500000) { // compress if > 500KB
        try {
          processedFile = await compressImage(file);
          console.log('Compressed:', file.name, 'from', Math.round(file.size/1024)+'KB', 'to', Math.round(processedFile.size/1024)+'KB');
        } catch (e) {
          console.warn('Compression failed, using original:', e);
        }
      }
      
      pendingFiles.push({ original: file, processed: processedFile });
    }
    
    renderPreviews();
  }
  
  // Render preview thumbnails
  function renderPreviews() {
    if (!previewList || !previewZone || !previewCount) return;
    
    previewList.innerHTML = '';
    previewCount.textContent = pendingFiles.length;
    
    if (pendingFiles.length === 0) {
      previewZone.style.display = 'none';
      return;
    }
    
    previewZone.style.display = 'block';
    
    pendingFiles.forEach((item, idx) => {
      const file = item.processed;
      const isImage = file.type.startsWith('image/');
      
      const card = document.createElement('div');
      card.style.cssText = 'background:#0f1220;border:1px solid #2a2f3f;border-radius:8px;padding:8px;position:relative';
      
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.style.cssText = 'width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:4px';
          card.insertBefore(img, card.firstChild);
        };
        reader.readAsDataURL(file);
      } else {
        const icon = document.createElement('div');
        icon.textContent = '📄';
        icon.style.cssText = 'font-size:48px;text-align:center;padding:20px 0';
        card.appendChild(icon);
      }
      
      const name = document.createElement('div');
      name.textContent = file.name;
      name.style.cssText = 'font-size:11px;color:#9aa4b2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px';
      card.appendChild(name);
      
      const size = document.createElement('div');
      size.textContent = Math.round(file.size / 1024) + ' KB';
      size.style.cssText = 'font-size:10px;color:#6b7280';
      card.appendChild(size);
      
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.className = 'btn';
      remove.style.cssText = 'position:absolute;top:4px;right:4px;width:24px;height:24px;padding:0;font-size:16px;line-height:1';
      remove.onclick = () => {
        pendingFiles.splice(idx, 1);
        renderPreviews();
      };
      card.appendChild(remove);
      
      previewList.appendChild(card);
    });
  }
  
  // Upload all pending files
  if (uploadAllBtn) {
    uploadAllBtn.onclick = async function() {
      if (!bid) return alert('Missing bid id');
      if (pendingFiles.length === 0) return;
      
      const kind = ($('#pdf_kind')?.value) || 'other';
      const customName = ($('#pdf_name')?.value || '').trim();
      const host = $('#bidDocsList');
      
      uploadAllBtn.disabled = true;
      uploadAllBtn.textContent = 'Uploading...';
      
      try {
        for (const item of pendingFiles) {
          const file = item.processed;
          const dataUrl = await fileToDataUrl(file);
          const name = customName || file.name || 'document';
          
          const resp = await fetchJSON('/api/bids/'+bid+'/docs/upload-dataurl', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ kind, name, dataUrl })
          });
          
          if (resp?.file && host) addDocChip(host, resp.file, bid);
        }
        
        // Clear
        pendingFiles = [];
        renderPreviews();
        if (fileInput) fileInput.value = '';
        if ($('#pdf_name')) $('#pdf_name').value = '';
        
        alert('All files uploaded ✓');
      } catch (e) {
        alert(e.message || 'Upload failed');
      } finally {
        uploadAllBtn.disabled = false;
        uploadAllBtn.textContent = 'Upload All';
      }
    };
  }

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', function(){
    if (window.createSalesNav) window.createSalesNav('details');
    loadBidDetails().then(loadCards).catch(function(){});
    // Add Review & Submit button handler
    const bidId = Number(new URLSearchParams(location.search).get('bid') || '');
    document.getElementById('submitPurchBtn')?.addEventListener('click', () => {
      if (!bidId) return alert('Missing bid id');
      location.href = '/sales-review?bid=' + bidId;
    });
  });

  $('#link_add_btn') && ($('#link_add_btn').onclick = async function(){
  try {
    if (!bid) return alert('Missing bid id');
    const kind = ($('#link_kind') && $('#link_kind').value) || 'other';
    const name = ($('#link_name') && $('#link_name').value || '').trim();
    const url  = ($('#link_url')  && $('#link_url').value  || '').trim();
    if (!url) return alert('Enter a URL');

    // Pull current doc_links, append, PATCH back
    const d = await fetchSoft('/api/bids/'+bid+'/details');
    const current = (d && Array.isArray(d.doc_links)) ? d.doc_links : [];
    current.push({ kind, name: name || url, url });

    await fetchJSON('/api/bids/'+bid+'/details', {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ doc_links: current })
    });

    // Show it immediately
    const host = $('#bidDocsList');
    if (host) {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.className='btn';
      a.textContent = (kind||'doc') + ' — ' + (name || url);
      host.prepend(a);
    }
    $('#link_name').value = ''; $('#link_url').value = '';
    alert('Added ✓');
  } catch(e) {
    alert(e.message || 'Add link failed');
  }
});

</script>

<!-- Tab bar -->
<div class="row" id="tabBar" style="margin:18px 0 0 0; gap:0">
  <button class="btn" id="tabDetailsBtn">Details</button>
  <button class="btn" id="tabHistoryBtn">History</button>
</div>

<!-- Tab content containers -->
<div id="tabDetails" style="display:block">
  <!-- ...existing details panels... -->
</div>
<div id="tabHistory" style="display:none">
  <h3 style="margin:12px 0 8px">History</h3>
  <div id="historyFilters" class="row" style="gap:8px; margin-bottom:8px">
    <button class="btn" data-f="all">All</button>
    <button class="btn" data-f="notes">Notes</button>
    <button class="btn" data-f="photos">Photos</button>
    <button class="btn" data-f="status">Status</button>
  </div>
  <div id="historyList"></div>
</div>

<script>
// Tab switching logic
const tabDetailsBtn = document.getElementById('tabDetailsBtn');
const tabHistoryBtn = document.getElementById('tabHistoryBtn');
const tabDetails = document.getElementById('tabDetails');
const tabHistory = document.getElementById('tabHistory');
if (tabDetailsBtn && tabHistoryBtn && tabDetails && tabHistory) {
  tabDetailsBtn.onclick = () => { tabDetails.style.display = 'block'; tabHistory.style.display = 'none'; };
  tabHistoryBtn.onclick = () => { tabDetails.style.display = 'none'; tabHistory.style.display = 'block'; loadHistory(); };
}

// History fetch and render
async function loadHistory(filter) {
  if (!bid) return;
  const r = await fetchSoft('/api/bids/' + bid + '/history');
  const events = (r && Array.isArray(r.events)) ? r.events : [];
  let filtered = events;
  if (filter === 'notes') filtered = events.filter(e => e.note && e.note.trim());
  if (filter === 'photos') filtered = events.filter(e => e.photos && e.photos.length);
  if (filter === 'status') filtered = events.filter(e => ['arrived','on_the_way','wip','complete'].includes(e.type));
  renderHistory(filtered);
}

function renderHistory(events) {
  const host = document.getElementById('historyList');
  if (!host) return;
  host.innerHTML = '';
  if (!events.length) { host.innerHTML = '<div class="mutedx">No history yet.</div>'; return; }
  
  const statusColors = {
    'arrived': '#2563eb',
    'on_the_way': '#f59e0b',
    'wip': '#8b5cf6',
    'complete': '#16a34a'
  };
  
  for (const e of events) {
    const card = document.createElement('div');
    card.className = 'cardx';
    // Line 1: badge with color, type, timestamp, by
    const l1 = document.createElement('div');
    const badgeColor = statusColors[e.type] || '#132133';
   l1.innerHTML = [
    '<span class="badge" style="background:' + badgeColor + '; color:#fff">', 
    (e.type || 'event').replace(/_/g, ' ').toUpperCase(), 
    '</span>',
    ' • ',
    new Date(e.created_at).toLocaleString(),
    e.by ? (' • <span class="mutedx">' + (e.by || '') + '</span>') : ''
  ].join('');
  card.appendChild(l1);
    // Line 2: note
    if (e.note && e.note.trim()) {
      const l2 = document.createElement('div');
      l2.textContent = e.note;
      l2.style.margin = '6px 0 0 0';
      l2.style.whiteSpace = 'pre-wrap';
      card.appendChild(l2);
    }
    // Line 3: thumbnails
    if (e.photos && e.photos.length) {
      const l3 = document.createElement('div');
      l3.className = 'row';
      l3.style.marginTop = '8px';
      for (const p of e.photos) {
        const a = document.createElement('a');
        a.href = p.path;
        a.target = '_blank';
        a.rel = 'noopener';
        const img = document.createElement('img');
        img.src = p.path;
        img.alt = p.name||'photo';
        img.style.maxWidth = '80px';
        img.style.maxHeight = '80px';
        img.style.objectFit = 'cover';
        img.style.border = '1px solid #2a2f3f';
        img.style.borderRadius = '8px';
        img.style.cursor = 'pointer';
        a.appendChild(img);
        l3.appendChild(a);
      }
      card.appendChild(l3);
    }
    host.appendChild(card);
  }
}
// History filter buttons
const histFilters = document.getElementById('historyFilters');
if (histFilters) {
  histFilters.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => loadHistory(btn.dataset.f);
  });
}
    </script>
    </body>
    </html>
      `);
    });
  }
