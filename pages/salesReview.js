// routes/salesReview.js
export default function registerSalesReview(app){
  app.get('/sales-review', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Review & Submit — Purchasing</title>
  <style>
    body{background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto;margin:0}
    .wrap{max-width:1000px;margin:0 auto;padding:18px}
    .panel{background:#111318;border:1px solid #212432;border-radius:12px;padding:12px;margin:12px 0}
    .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .btn{padding:10px 14px;border-radius:12px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;cursor:pointer}
    .kv td{padding:4px 8px;vertical-align:top}
    .list{width:100%}
    .list td{padding:4px 8px;border-bottom:1px solid #1f2432}
    .muted{color:#9aa3b2}
    .badge{display:inline-block;margin-right:8px;margin-top:8px;padding:4px 8px;border-radius:999px;background:#1a2033;border:1px solid #2a2f3f}
    .docs-list{ display:flex; flex-wrap:wrap; gap:8px 10px; }
    .docs-list .btn{ margin:0; white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
  </style>
</head>
<body>
  <script src="/static/appbar.js"></script>
  <div id="appbar"></div>
  <div class="wrap">
    <h2>Review & Submit — Purchasing</h2>

    <div id="meta" class="panel">Loading...</div>

    <div class="panel">
      <h3>Attached Docs</h3>
      <button id="downloadZip" class="btn" style="margin-bottom:10px">Download All as ZIP</button>
      <div id="docs">Loading...</div>
    </div>

    <div class="panel">
      <h3>Summary</h3>
      <div id="summary">Loading...</div>
    </div>

    <div class="panel">
      <h3>Customer & Job</h3>
      <div id="custjob">Loading...</div>
    </div>

    <div class="panel">
      <h3>Specs</h3>
      <div id="specs">Loading...</div>
    </div>

    <div class="panel">
      <h2>Sales Summary</h2>
      <div><strong>Order Number:</strong> <span id="summary_order_no">—</span></div>
      <div><strong>Notes:</strong> <span id="summary_notes">—</span></div>
      <div style="margin-top:6px"><strong>Project Snapshot:</strong></div>
      <div id="snapshotBadges">
        <span class="badge" id="summary_badgeCards">0 Cards</span>
        <span class="badge" id="summary_badgeUnits">0 Units</span>
        <span class="badge" id="summary_badgeDocs">0 Docs</span>
      </div>
    </div>

    <div class="row" style="justify-content:flex-end">
      <button id="back" class="btn">Back</button>
      <button id="submit" class="btn">Submit to Purchasing</button>
    </div>
  </div>

  <script>
  ;(function(){
    // ---------- helpers ----------
    function qp(n){ return new URLSearchParams(location.search).get(n); }
    function $(id){ return document.getElementById(id); }
    function esc(s){
      s = String(s == null ? '' : s);
      s = s.replace(/&/g,'&amp;')
           .replace(/</g,'&lt;')
           .replace(/>/g,'&gt;')
           .replace(/"/g,'&quot;')
           .replace(/'/g,'&#39;');
      return s.replace(/<\\/script/gi,'<\\\\/script');
    }
    function money(n){ n = Number(n||0); return n.toLocaleString(undefined,{style:'currency',currency:'USD'}); }
    async function fetchSoft(url){
      try{
        var r = await fetch(url,{cache:'no-store'});
        if(!r.ok){ console.error('API error',url,r.status); return {_error:'API', status:r.status}; }
        return await r.json();
      }catch(e){ console.error('Fetch failed',url,e); return {_error:'Fetch', error:e}; }
    }
    function isSafeHttpUrl(u){
      try{
        var x = new URL(u, location.origin);
        return x.protocol === 'http:' || x.protocol === 'https:';
      }catch{ return false; }
    }

    var bid = Number(qp('bid')||0);
    if(!bid){ console.error('Missing bid param'); return; }

    // ---------- renderers ----------
    function renderHeader(me, details, intake, customerInfo){
      var meta = $('meta'); if(!meta) return;
      var parts = [];
      parts.push('<div><b>Bid #', esc(bid), '</b></div>');

      var salesman =
        (intake && (intake.sales_person || intake.salesman)) ||
        (details && details.onboarding && (details.onboarding.sales_person || details.onboarding.salesman)) ||
        (details && (details.sales_person || details.salesman)) ||
        (customerInfo && customerInfo.sales_person) ||
        (me && me.name) || '';

      var designer =
        (intake && intake.designer) ||
        (details && details.designer) ||
        (details && details.onboarding && details.onboarding.designer) || '';

      parts.push('<div>Sales: ', esc(salesman || 'Sales User'), '</div>');
      if (designer) parts.push('<div>Designer: ', esc(designer), '</div>');
      if (me && me.email) parts.push('<div>Email: ', esc(me.email), '</div>');
      meta.innerHTML = parts.join('');
    }

    function renderDocs(documents, details){
      var box = $('docs'); if(!box) return;
      var docs = Array.isArray(documents) ? documents : [];
      if(!docs.length && details && Array.isArray(details.doc_links)) docs = details.doc_links;

      if(!docs.length){ box.innerHTML = '<div class="muted">No documents attached.</div>'; return; }

      box.innerHTML = '<div class="docs-list">' + docs.map(function(doc){
        var raw = doc && (doc.url || doc.link);
        var safe = (raw && isSafeHttpUrl(raw)) ? raw : '#';
        var label = doc && (doc.name || doc.filename || doc.kind) || 'Document';
        return '<a class="btn" target="_blank" rel="noopener noreferrer" href="'+esc(safe)+'">'+esc(label)+'</a>';
      }).join('') + '</div>';
    }

    function normalizeColumnsDetails(data){
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object' && !Array.isArray(data) && !data._error) {
        return Object.keys(data).map(function(key){
          var row = data[key] || {};
          var units = Number(row.units ?? row.unit_count ?? 0) || 0;
          return {
            column_id: Number(key),
            column_label: row.column_label || row.label || row.room || ('Card ' + key),
            room: row.room || null,
            unit_type: row.unit_type || null,
            color: row.color || null,
            units: units,
            meta: row.meta,
            hardware: row.hardware,
            notes: row.notes
          };
        });
      }
      return [];
    }

    function renderMoney(totals){
      var box = $('summary'); if(!box) return;
      if(!totals){ box.innerHTML = '<div class="muted">Totals not available.</div>'; return; }

      var deposit = (totals.deposit_amount != null ? totals.deposit_amount
                    : (totals.deposit_paid != null ? totals.deposit_paid
                    : (totals.deposit_required != null ? totals.deposit_required : 0)));
      var remaining = (totals.remaining_amount != null)
        ? totals.remaining_amount
        : (Number(totals.total || 0) - Number(deposit || 0));

      var out = [];
      out.push('<div>Total: ', esc(money(totals.total)), '</div>');
      out.push('<div>Deposit: ', esc(money(deposit)), '</div>');
      out.push('<div>Remaining: ', esc(money(remaining)), '</div>');
      box.innerHTML = out.join('');
    }

    function renderCustomerJob(customerInfo, details, intake){
      var box = $('custjob'); if(!box) return;

      var custName = (customerInfo && (customerInfo.customer_name || customerInfo.name))
                  || (details && details.homeowner)
                  || (intake && intake.customer_name) || '';

      // Extract homeowner/site contact phone across sources
      var phone =
        (customerInfo && (customerInfo.phone || customerInfo.cust_contact_phone || customerInfo.cell || customerInfo.cell_norm)) ||
        (details && (details.homeowner_phone || details.customer_phone ||
                     (details.onboarding && (details.onboarding.homeowner_phone || details.onboarding.customer_phone)))) ||
        (intake  && (intake.homeowner_phone  || intake.customer_phone || intake.homeowner_phone_number)) ||
        '';
      var phoneDisp = String(phone).replace(/[^\d()+\-.\s]/g,'');

      var addr = (customerInfo && customerInfo.address_line1)
              || (details && details.home_address)
              || (details && details.onboarding && details.onboarding.home_address)
              || (intake && (intake.home_address || intake.address)) || '';

      if (!addr && customerInfo) {
        var parts = [];
        if(customerInfo.address_line1) parts.push(customerInfo.address_line1);
        var csz = [];
        if(customerInfo.city)  csz.push(customerInfo.city);
        if(customerInfo.state) csz.push(customerInfo.state);
        if(csz.length) parts.push(csz.join(', '));
        if(customerInfo.zip) parts.push(customerInfo.zip);
        addr = parts.join(' ');
      }

      var missing = [];
      var links = [];
      if (!custName){ missing.push('Customer Name'); links.push('<a href="/sales-intake?bid='+esc(bid)+'" style="color:#fff;text-decoration:underline">Customer Name</a>'); }
      if (!phone){ missing.push('Phone Number'); links.push('<a href="/sales-intake?bid='+esc(bid)+'" style="color:#fff;text-decoration:underline">Phone Number</a>'); }
      if (!addr){  missing.push('Address');       links.push('<a href="/sales-intake?bid='+esc(bid)+'" style="color:#fff;text-decoration:underline">Address</a>'); }

      var orderNo = (details && (details.order_number || details.order_no)) || (intake && intake.order_number) || '—';

      var html = [
        '<div><strong>Customer:</strong> ', esc(custName || '—'), '</div>',
        '<div><strong>Phone:</strong> ', esc(phoneDisp || '—'), '</div>',
        '<div><strong>Address:</strong> ', esc(addr || '—'), '</div>'
      ];

      var email = (customerInfo && (customerInfo.email || customerInfo.customer_email))
               || (details && details.customer_email)
               || (intake && intake.customer_email);
      if (email) html.push('<div><strong>Email:</strong> ', esc(email), '</div>');

      if (missing.length) html.push('<div style="color:#ff6f6f;margin-top:8px"><b>Missing Required:</b> ', links.join(', '), '</div>');

      box.innerHTML = html.join('');

      var elON = $('summary_order_no'); if (elON) elON.textContent = orderNo;
      var elNotes = $('summary_notes'); if (elNotes) elNotes.textContent = (details && details.notes) || (intake && intake.notes) || '—';
    }

    function renderSpecs(details, colsDetails, model){
      var box = $('specs'); if(!box) return;

      var rows = normalizeColumnsDetails(colsDetails);
      if (!rows.length){ box.innerHTML = '<div class="muted">No card specifications found.</div>'; return; }

      var modelColumns = (model && Array.isArray(model.columns)) ? model.columns : [];
      var byId = new Map();
      for (var i=0;i<modelColumns.length;i++){
        var mc = modelColumns[i];
        var key = String(mc.column_id ?? mc.id ?? mc.columnId ?? mc.columnID ?? i);
        byId.set(key, mc);
      }

      var out = [];
      rows.forEach(function(row, idx){
        var cidRaw = row.column_id ?? row.id ?? row.columnId ?? row.columnID ?? idx;
        var cid = Number(cidRaw);
        var meta = (row.meta && typeof row.meta === 'object') ? row.meta : {};
        var hardware = Array.isArray(row.hardware) ? row.hardware : [];
        var info = byId.get(String(cidRaw)) || row || {};
        var label = info.column_label || info.label || info.room || ('Card ' + (Number.isFinite(cid) ? cid : idx+1));
        var units = Number(info.units ?? row.units ?? 0) || 0;

        out.push('<div style="margin-top:', (idx>0 ? '20px':'0'), ';padding:12px;border:1px solid #2a2f3f;border-radius:8px;background:#0f1419">');
        out.push('<h4 style="margin:0 0 10px 0;color:#66d9ef">', esc(label));
        if (units>0) out.push(' <span style="color:#9aa3b2;font-weight:normal">(', units, ' units)</span>');
        out.push('</h4>');

        var specRows = [
          ['Box', meta.box_construction || meta.box || ''],
          ['Material', meta.material || meta.door_material || meta.species || ''],
          ['Finish', meta.finish || meta.finish_color || meta.door_finish || ''],
          ['Door Style', meta.door_style || meta.door || meta.style || ''],
          ['Edge', meta.edge_profile || meta.edge || ''],
          ['Manufacturer', meta.manufacturer || '']
        ];

        out.push('<table class="kv" style="width:100%">');
        for (var j=0;j<specRows.length;j++){
          var rs = specRows[j];
          if (rs[1]) out.push('<tr><td style="color:#9aa3b2">', esc(rs[0]), '</td><td>', esc(rs[1]), '</td></tr>');
        }
        out.push('</table>');

        if (hardware.length){
          out.push('<h5 style="margin:12px 0 6px 0">Hardware</h5><table class="list" style="width:100%"><tbody>');
          for (var h=0;h<hardware.length;h++){
            var hw = hardware[h];
            var kind = String(hw.kind || hw.type || '').toUpperCase();
            var labelHW = [hw.brand, hw.model, hw.finish].filter(Boolean).join(' ');
            var qty = hw.qty != null ? hw.qty : (hw.quantity != null ? hw.quantity : (hw.unit_count != null ? hw.unit_count : ''));
            out.push('<tr><td>', esc(kind), '</td><td>', esc(labelHW), '</td><td style="text-align:right">', esc(qty), '</td></tr>');
          }
          out.push('</tbody></table>');
        }

        var notes = row.notes || '';
        if (notes){
          out.push('<div style="margin-top:8px;padding:8px;background:#1a1f2e;border-radius:4px;font-size:13px;color:#c9d1d9">');
          out.push('<strong>Notes:</strong> ', esc(notes), '</div>');
        }
        out.push('</div>');
      });

      box.innerHTML = out.join('');
    }

    function renderSnapshot(model, details, files, colsDetails){
      var columns = normalizeColumnsDetails(colsDetails);
      var cards = columns.length || Number((model && model.cards_count) || (details && details.projectSnapshot && details.projectSnapshot.cards) || 0);
      var unitsFromCols = columns.reduce(function(sum, c){ return sum + Number(c.units || 0); }, 0);
      var units = unitsFromCols || Number((model && model.units_count) || (details && details.projectSnapshot && details.projectSnapshot.units) || 0);
      var docsN = Array.isArray(files) ? files.length : (details && details.projectSnapshot && details.projectSnapshot.docs != null ? Number(details.projectSnapshot.docs) : 0);

      var elC = $('summary_badgeCards'); if (elC) elC.textContent = cards + (cards===1?' Card':' Cards');
      var elU = $('summary_badgeUnits'); if (elU) elU.textContent = units + (units===1?' Unit':' Units');
      var elD = $('summary_badgeDocs');  if (elD) elD.textContent = docsN + (docsN===1?' Doc':' Docs');
    }

    // Normalize docs from all sources into one canonical array
    function normalizeDocs(details, docList, files){
      var out = [];

      // /api/bids/:id/documents may return an array OR {docs:[...]}
      if (docList) {
        if (Array.isArray(docList)) out = out.concat(docList);
        else if (Array.isArray(docList.docs)) out = out.concat(docList.docs);
      }

      // /api/files may return an array OR {files:[...]}
      if (files) {
        if (Array.isArray(files)) out = out.concat(files);
        else if (Array.isArray(files.files)) out = out.concat(files.files);
      }

      // Details page links (what you're seeing)
      if (details && Array.isArray(details.doc_links)) {
        out = out.concat(details.doc_links);
      }

      // De-dupe by URL + name
      var seen = {};
      var uniq = [];
      for (var i=0;i<out.length;i++){
        var d = out[i] || {};
        var key = (d.url||d.link||'') + '|' + (d.name||d.filename||'');
        if (!seen[key]) { seen[key] = 1; uniq.push(d); }
      }
      return uniq;
    }

    // ---------- load ----------
    async function load(){
      var results = await Promise.all([
        fetchSoft('/api/bids/'+bid+'/intake'),
        fetchSoft('/api/bids/'+bid+'/details'),
        fetchSoft('/api/bids/'+bid+'/totals'),
        fetchSoft('/api/me'),
        fetchSoft('/api/bids/'+bid+'/customer-info'),
        fetchSoft('/api/bids/'+bid+'/model'),
        fetchSoft('/api/bids/'+bid+'/columns-details')
      ]);

      var intake = results[0], details = results[1], totals = results[2], me = results[3],
          customerInfo = results[4], model = results[5], colsDetails = results[6];

      if (intake && intake._error)  $('custjob').innerHTML = '<div class="muted">Customer/job info unavailable.</div>';
      if (details && details._error) $('summary').innerHTML = '<div class="muted">Summary unavailable.</div>';
      if (totals && totals._error)  $('summary').innerHTML = '<div class="muted">Totals unavailable.</div>';
      if (customerInfo && customerInfo._error) $('custjob').innerHTML = '<div class="muted">Customer info unavailable.</div>';
      if (model && model._error)     $('specs').innerHTML = '<div class="muted">Specs unavailable.</div>';
      if (colsDetails && colsDetails._error) $('specs').innerHTML = '<div class="muted">Specs unavailable.</div>';

      renderHeader(me, details && !details._error ? details : null,
                      intake && !intake._error ? intake : null,
                      customerInfo && !customerInfo._error ? customerInfo : null);

      var filesA = await fetchSoft('/api/files?bid='+bid);
      if (!filesA || filesA._error) filesA = await fetchSoft('/api/bids/'+bid+'/files');

      var docList = await fetchSoft('/api/bids/'+bid+'/documents');

      // Canonical docs array used everywhere (render + snapshot + validator)
      var docsSafe = normalizeDocs(details && !details._error ? details : null, docList, filesA);

      renderDocs(docsSafe, details);
      renderMoney(totals && !totals._error ? totals : null);

      var colsArray = normalizeColumnsDetails(colsDetails && !colsDetails._error ? colsDetails : null);
      renderCustomerJob(customerInfo && !customerInfo._error ? customerInfo : null,
                        details && !details._error ? details : null,
                        intake && !intake._error ? intake : null);
      renderSpecs(details && !details._error ? details : null, colsArray, model && !model._error ? model : null);
      renderSnapshot(model && !model._error ? model : null,
                     details && !details._error ? details : null,
                     docsSafe,
                     colsArray);

      wireButtons(docsSafe);
    }

    // ---------- buttons ----------
    function wireButtons(files){
      var back = $('back'); if (back) back.onclick = function(){ history.back(); };

      var downloadZip = $('downloadZip');
      if(downloadZip){
        downloadZip.onclick = async function(){
          downloadZip.disabled = true; downloadZip.textContent = 'Preparing ZIP...';
          try{
            var resp = await fetch('/api/bids/'+bid+'/docs-zip');
            if(!resp.ok) throw new Error('Failed to download ZIP');
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'bid_'+bid+'_docs.zip';
            document.body.appendChild(a); a.click();
            setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 100);
          }catch(e){ alert('ZIP download failed: '+(e && e.message ? e.message : e)); }
          finally{ downloadZip.disabled = false; downloadZip.textContent = 'Download All as ZIP'; }
        };
      }

      var submit = $('submit');
      if(submit){
        submit.onclick = async function(){
          var synonyms = { 
            'rendering': ['rendering','renderings','drawing','drawings','elevation','elevations'],
            'layout':    ['layout','plan','floorplan','floor_plan'],
            'order sheet': ['order','ordersheet','order_sheet']
          };
          var required = ['layout','rendering','order sheet'];
          if (!Array.isArray(files) || files.length === 0) {
            alert('Cannot submit to purchasing:\\n\\nMissing ALL required documents:\\n- Layout\\n- Renderings\\n- Order Sheet\\n\\nPlease attach these documents before submitting.');
            return;
          }
          var missing = [];
          for (var i=0;i<required.length;i++){
            var keys = synonyms[required[i]] || [required[i]];
            var found = files.some(function(f){
              var kind = String(f.kind||'').toLowerCase().replace(/[\\s_]+/g,'');
              var name = String((f.name||f.filename||'')).toLowerCase().replace(/[\\s_]+/g,'');
              for (var k=0;k<keys.length;k++){
                var needle = keys[k].replace(/[\\s_]+/g,'');
                if (required[i]==='order sheet'){
                  if (kind==='order' || kind==='ordersheet' || name.indexOf(needle)>-1) return true;
                } else if (kind===needle || name.indexOf(needle)>-1) return true;
              }
              return false;
            });
            if(!found) missing.push(required[i]);
          }
          if (missing.length){
            alert('Cannot submit to purchasing:\\n\\nMissing required documents:\\n- ' + missing.join('\\n- ') + '\\n\\nPlease attach these documents before submitting.');
            return;
          }

          try{
            var r = await fetch('/api/po/submit', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ bidId: bid })
            });
            if(!r.ok) throw new Error('Submit failed (HTTP '+r.status+')');
            var payload = null; try{ payload = await r.json(); }catch(_){}
            var poDisplay = payload && payload.po_id ? ('PO #'+payload.po_id) : 'Draft created';
            alert('Successfully submitted to Purchasing!\\n'+poDisplay);
            location.href = '/sales-home';
          }catch(e){
            alert('Submit failed: ' + (e && e.message ? e.message : 'Unknown error'));
          }
        };
      }
    }

    document.addEventListener('DOMContentLoaded', function(){
      try{
        var root = document.getElementById('appbar');
        if (root && root.children.length === 0){
          var q = location.search || '';
          root.innerHTML =
            '<div class="appbar" style="display:flex;align-items:center;gap:16px;padding:10px 14px;background:#0f1220;border-bottom:1px solid #22273a;color:#e9edff">'
            + '<a href="/" style="font-weight:700;text-decoration:none;color:#e9edff">Admin</a>'
            + '<nav style="margin-left:8px">'
            +   '<a href="/sales-home" style="margin-right:10px;text-decoration:none;color:#c9d2e8">Home</a>'
            +   '<a href="/sales-intake'+q+'" style="margin-right:10px;text-decoration:none;color:#c9d2e8">Intake</a>'
            +   '<a href="/sales-quote'+q+'" style="margin-right:10px;text-decoration:none;color:#c9d2e8">Quote</a>'
            +   '<a href="/sales-details'+q+'" style="margin-right:10px;text-decoration:none;color:#c9d2e8">Details</a>'
            +   '<a href="/sales-review'+q+'" style="margin-right:10px;text-decoration:none;color:#c9d2e8">Review</a>'
            + '</nav>'
            + '<div style="flex:1"></div>'
            + '<a href="/logout" style="color:#e9edff;text-decoration:none;border:1px solid #2a3048;padding:6px 10px;border-radius:10px;background:#141935">Logout</a>'
            + '</div>';
        }
      }catch(e){}
      load();
    });
  })();
  </script>

</body>
</html>`);
  });
}
  