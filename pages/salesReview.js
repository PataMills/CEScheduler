export default function registerSalesReview(app){
  app.get('/sales-review', (_req, res) => {
    res.type('html').send(`<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
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
</style>
</head><body>
<script src="/static/appbar.js"></script>
<div id="appbar"></div>
<div class="wrap">
  <h2>Review & Submit — Purchasing</h2>

  <div id="meta" class="panel">Loading…</div>

  <div class="panel">
  <h3>Attached Docs</h3>
  <button id="downloadZip" class="btn" style="margin-bottom:10px">Download All as ZIP</button>
  <div id="docs">Loading…</div>
  </div>

  <div class="panel">
    <h3>Summary</h3>
    <div id="summary">Loading…</div>
  </div>

  <!-- ✅ Newly added: Customer & Job block -->
  <div class="panel">
    <h3>Customer & Job</h3>
    <div id="custjob">Loading…</div>
  </div>

  <!-- ✅ Newly added: Specs block -->
  <div class="panel">
    <h3>Specs</h3>
    <div id="specs">Loading…</div>
  </div>

  <div class="panel">
    <h2>Sales Summary</h2>
    <div><strong>Order Number:</strong> <span id="summary_order_no"></span></div>
    <div><strong>Notes:</strong> <span id="summary_notes"></span></div>
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
(function(){
  // ---- helpers ----
  function qp(name){ return new URLSearchParams(location.search).get(name); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]); }); }
  function money(n){ n = Number(n || 0); return n.toLocaleString(undefined,{style:'currency',currency:'USD'}); }
  function $(id){ return document.getElementById(id); }
  async function fetchSoft(url){
    try{
      var r = await fetch(url, { cache:'no-store' });
      if(!r.ok) {
        console.error('API error:', url, r.status);
        return { _error: 'API error', status: r.status };
      }
      return await r.json();
    }catch(e){
      console.error('Fetch failed:', url, e);
      return { _error: 'Fetch failed', error: e };
    }
  }

  var bid = Number(qp('bid') || 0);
  if(!bid){ console.error('Missing bid param'); return; }

  // ---- renderers ----
  function renderHeader(me, details, intake, customerInfo){
    var meta = $('meta'); if(!meta) return;
    var parts = [];
    parts.push('<div><b>Bid #', esc(bid), '</b></div>');

    // Robust salesman extraction: intake > onboarding > details > me
    var salesman =
      (intake && (intake.sales_person || intake.salesman)) ||
      (details && details.onboarding && (details.onboarding.sales_person || details.onboarding.salesman)) ||
      (details && (details.sales_person || details.salesman)) ||
      (customerInfo && customerInfo.sales_person) ||
      (me && me.name) || '';

    // Designer info
    var designer =
      (intake && intake.designer) ||
      (details && details.designer) ||
      (details && details.onboarding && details.onboarding.designer) || '';

    parts.push('<div>Sales: ', esc(salesman || 'Sales User'), '</div>');
    if (designer) {
      parts.push('<div>Designer: ', esc(designer), '</div>');
    }
    if (me && me.email) {
      parts.push('<div>Email: ', esc(me.email), '</div>');
    }
    meta.innerHTML = parts.join('');
  }

  function renderDocs(documents, details){
    var box = $('docs'); if(!box) return;

    var docs = Array.isArray(documents) ? documents : [];
    if (!docs.length && details && Array.isArray(details.doc_links)) {
      docs = details.doc_links;
    }

    if (!docs.length) {
      box.innerHTML = '<div class="muted">No documents attached.</div>';
      return;
    }

    box.innerHTML = docs.map(function(doc){
      var rawUrl = doc && (doc.url || doc.link);
      var safeUrl = (rawUrl && /^https?:\/\//i.test(rawUrl)) ? rawUrl : '#';
      var label = doc && (doc.name || doc.filename || doc.kind);
      var text = label ? esc(label) : 'Document';
      return '<div><a class="btn" target="_blank" rel="noopener" href="'+esc(safeUrl)+'">'+text+'</a></div>';
    }).join('');
  }

  function renderMoney(totals){
    var box = $('summary'); if(!box) return;
    if(!totals){
      box.innerHTML = '<div class="muted">Totals not available.</div>';
      return;
    }
    var deposit = (totals.deposit_amount != null ? totals.deposit_amount
                  : (totals.deposit_paid != null ? totals.deposit_paid
                  : (totals.deposit_required != null ? totals.deposit_required : 0)));
    var remaining = (totals.remaining_amount != null)
      ? totals.remaining_amount
      : (Number(totals.total || 0) - Number(deposit || 0));

    var parts = [];
    parts.push('<div>Total: ', esc(money(totals.total)), '</div>');
    parts.push('<div>Deposit: ', esc(money(deposit)), '</div>');
    parts.push('<div>Remaining: ', esc(money(remaining)), '</div>');
    box.innerHTML = parts.join('');
  }

  function renderCustomerJob(customerInfo, details, intake){
    var box = $('custjob'); if(!box) return;

    // Extract customer name
    var custName = (customerInfo && (customerInfo.customer_name || customerInfo.name)) 
                || (details && details.homeowner) 
                || (intake && intake.customer_name) 
                || '';

    // Extract phone number
    var phone = (customerInfo && customerInfo.phone)
             || (details && details.customer_phone)
             || (intake && intake.customer_phone)
             || '';

    // Try multiple sources for address
    var addr = (customerInfo && customerInfo.address_line1) 
            || (details && details.home_address)
            || (details && details.onboarding && details.onboarding.home_address)
            || (intake && (intake.home_address || intake.address)) 
            || '';

    // If we have structured address fields, build from them
    if (!addr && customerInfo) {
      var addrParts = [];
      if(customerInfo.address_line1) addrParts.push(customerInfo.address_line1);
      var csz = [];
      if(customerInfo.city)  csz.push(customerInfo.city);
      if(customerInfo.state) csz.push(customerInfo.state);
      if(csz.length) addrParts.push(csz.join(', '));
      if(customerInfo.zip) addrParts.push(customerInfo.zip);
      addr = addrParts.join(' ');
    }

    // Mandatory field validation
    var missingFields = [];
    var missingLinks = [];
    if (!custName) {
      missingFields.push('Customer Name');
      missingLinks.push('<a href="/intake?bid=' + esc(bid) + '" style="color:#fff;text-decoration:underline">Customer Name</a>');
    }
    if (!phone) {
      missingFields.push('Phone Number');
      missingLinks.push('<a href="/intake?bid=' + esc(bid) + '" style="color:#fff;text-decoration:underline">Phone Number</a>');
    }
    if (!addr) {
      missingFields.push('Address');
      missingLinks.push('<a href="/intake?bid=' + esc(bid) + '" style="color:#fff;text-decoration:underline">Address</a>');
    }

    var orderNo = (details && details.order_number) || (details && details.order_no) || (intake && intake.order_number) || '—';

    var html = [
      '<div><strong>Customer:</strong> ', esc(custName || '—'), '</div>',
      '<div><strong>Phone:</strong> ', esc(phone || '—'), '</div>',
      '<div><strong>Address:</strong> ', esc(addr || '—'), '</div>'
    ];

    // Optionally show contact email if available
    var contactEmail = (customerInfo && (customerInfo.email || customerInfo.customer_email))
                   || (details && details.customer_email)
                   || (intake && intake.customer_email);
    if (contactEmail) {
      html.push('<div><strong>Email:</strong> ', esc(contactEmail), '</div>');
    }

    // Move missing required fields to bottom, with links
    if (missingFields.length) {
      html.push('<div style="color:#ff6f6f;margin-top:8px"><b>Missing Required:</b> ', missingLinks.join(', '), '</div>');
    }

    box.innerHTML = html.join('');

    // also feed existing summary chips
    var elON = $('summary_order_no'); if(elON) elON.textContent = orderNo;
    var elNotes = $('summary_notes'); if(elNotes) elNotes.textContent = (details && details.notes) || (intake && intake.notes) || '—';
  }

  function renderSpecs(details, colsDetails, model){
    var box = $('specs'); if(!box) return;

    var parts = [];
    
    // Check if we have column data
    if (!colsDetails || typeof colsDetails !== 'object') {
      parts.push('<div class="muted">No specifications available.</div>');
      box.innerHTML = parts.join('');
      return;
    }

    // Get columns array from model
    var columns = (model && Array.isArray(model.columns)) ? model.columns : [];
    
    // Iterate through each column (card) and display its specs
    var cardCount = 0;
    for (var key in colsDetails) {
      if (key === 'hardware') continue; // Skip aggregated hardware key
      
      var col = colsDetails[key];
      if (!col || !col.meta) continue;
      
      var meta = col.meta;
      var columnLabel = '';
      var units = 0;
      
      // Find matching column info from model
      for (var i = 0; i < columns.length; i++) {
        if (String(columns[i].column_id) === String(key)) {
          columnLabel = columns[i].column_label || '';
          units = columns[i].units || 0;
          break;
        }
      }
      
      cardCount++;
      
      // Card header
      parts.push('<div style="margin-top:', (cardCount > 1 ? '20px' : '0'), ';padding:12px;border:1px solid #2a2f3f;border-radius:8px;background:#0f1419">');
      parts.push('<h4 style="margin:0 0 10px 0;color:#66d9ef">', esc(columnLabel || 'Card ' + key));
      if (units > 0) parts.push(' <span style="color:#9aa3b2;font-weight:normal">(', units, ' units)</span>');
      parts.push('</h4>');
      
      // Specs table
      parts.push('<table class="kv" style="width:100%">');
      
      var specRows = [
        ['Box', meta.box_construction || meta.box || ''],
        ['Material', meta.material || meta.door_material || meta.species || ''],
        ['Finish', meta.finish || meta.finish_color || meta.door_finish || ''],
        ['Door Style', meta.door_style || meta.door || meta.style || ''],
        ['Edge', meta.edge_profile || meta.edge || ''],
        ['Manufacturer', meta.manufacturer || '']
      ];
      
      for (var j = 0; j < specRows.length; j++) {
        var row = specRows[j];
        if (row[1]) { // Only show if value exists
          parts.push('<tr><td style="color:#9aa3b2">', esc(row[0]), '</td><td>', esc(row[1]), '</td></tr>');
        }
      }
      
      parts.push('</table>');
      
      // Hardware for this card
      if (Array.isArray(col.hardware) && col.hardware.length > 0) {
        parts.push('<h5 style="margin:12px 0 6px 0">Hardware</h5>');
        parts.push('<table class="list" style="width:100%"><tbody>');
        for (var h = 0; h < col.hardware.length; h++) {
          var hw = col.hardware[h];
          var kind = String(hw.kind || hw.type || '').toUpperCase();
          var label = [hw.brand, hw.model, hw.finish].filter(Boolean).join(' ');
          var qty = hw.qty != null ? hw.qty : (hw.quantity != null ? hw.quantity : (hw.unit_count != null ? hw.unit_count : ''));
          parts.push('<tr><td>', esc(kind), '</td><td>', esc(label), '</td><td style="text-align:right">', esc(qty), '</td></tr>');
        }
        parts.push('</tbody></table>');
      }
      
      // Notes for this card
      if (col.notes) {
        parts.push('<div style="margin-top:8px;padding:8px;background:#1a1f2e;border-radius:4px;font-size:13px;color:#c9d1d9">');
        parts.push('<strong>Notes:</strong> ', esc(col.notes));
        parts.push('</div>');
      }
      
      parts.push('</div>');
    }
    
    if (cardCount === 0) {
      parts.push('<div class="muted">No card specifications found.</div>');
    }

    box.innerHTML = parts.join('');
  }

  function renderSnapshot(model, details, files){
    var cards = Number((model && model.cards_count) || (details && details.projectSnapshot && details.projectSnapshot.cards) || 0);
    var units = Number((model && model.units_count) || (details && details.projectSnapshot && details.projectSnapshot.units) || 0);
    var docsN = 0;
    if(Array.isArray(files)) docsN = files.length;
    else if(details && details.projectSnapshot && details.projectSnapshot.docs != null) docsN = Number(details.projectSnapshot.docs);

    var elC = $('summary_badgeCards'); if(elC) elC.textContent = cards + ' Cards';
    var elU = $('summary_badgeUnits'); if(elU) elU.textContent = units + ' Units';
    var elD = $('summary_badgeDocs');  if(elD) elD.textContent = docsN + ' Docs';
  }

  // ---- main load ----
  async function load(){
    var results = await Promise.all([
      fetchSoft('/api/bids/' + bid + '/intake'),
      fetchSoft('/api/bids/' + bid + '/details'),
      fetchSoft('/api/bids/' + bid + '/totals'),
      fetchSoft('/api/me'),
      fetchSoft('/api/bids/' + bid + '/customer-info'),
      fetchSoft('/api/bids/' + bid + '/model'),
      fetchSoft('/api/bids/' + bid + '/columns-details')
    ]);

    var intake = results[0];
    var details = results[1];
    var totals = results[2];
    var me = results[3];
    var customerInfo = results[4];
    var model = results[5];
    var colsDetails = results[6];

    var files = await fetchSoft('/api/files?bid=' + bid);
    if (files && files._error) {
      files = await fetchSoft('/api/bids/' + bid + '/files');
    }

    var docList = await fetchSoft('/api/bids/' + bid + '/documents');

    // Defensive: if any required data is missing, show error messages
    if (intake && intake._error) $('custjob').innerHTML = '<div class="muted">Customer/job info unavailable.</div>';
    if (details && details._error) $('summary').innerHTML = '<div class="muted">Summary unavailable.</div>';
    if (totals && totals._error) $('summary').innerHTML = '<div class="muted">Totals unavailable.</div>';
    if (files && files._error) $('docs').innerHTML = '<div class="muted">Docs unavailable.</div>';
    if (docList && docList._error) $('docs').innerHTML = '<div class="muted">Docs unavailable.</div>';
    if (customerInfo && customerInfo._error) $('custjob').innerHTML = '<div class="muted">Customer info unavailable.</div>';
    if (model && model._error) $('specs').innerHTML = '<div class="muted">Specs unavailable.</div>';
    if (colsDetails && colsDetails._error) $('specs').innerHTML = '<div class="muted">Specs unavailable.</div>';

    renderHeader(me,
      details && !details._error ? details : null,
      intake && !intake._error ? intake : null,
      customerInfo && !customerInfo._error ? customerInfo : null
    );

    var docsSafe = Array.isArray(docList) && !docList._error ? docList : [];
    if (!docsSafe.length && Array.isArray(files) && !files._error) {
      docsSafe = files;
    }

    renderDocs(docsSafe, details);
    renderMoney(totals && !totals._error ? totals : null);
    renderCustomerJob(customerInfo && !customerInfo._error ? customerInfo : null, details && !details._error ? details : null, intake && !intake._error ? intake : null);
    renderSpecs(details && !details._error ? details : null, colsDetails && !colsDetails._error ? colsDetails : null, model && !model._error ? model : null);
    renderSnapshot(
      model && !model._error ? model : null,
      details && !details._error ? details : null,
      Array.isArray(docsSafe) ? docsSafe : []
    );

    // Wire buttons with file validation
    wireButtons(Array.isArray(docsSafe) ? docsSafe : []);
  }

  // ---- buttons ----
  function wireButtons(files){
    var back = $('back');   if(back)   back.onclick = function(){ history.back(); };
    var downloadZip = $('downloadZip');
    if(downloadZip){
      downloadZip.onclick = async function(){
        downloadZip.disabled = true;
        downloadZip.textContent = 'Preparing ZIP...';
        try {
          var zipUrl = '/api/bids/' + bid + '/docs-zip';
          const resp = await fetch(zipUrl);
          if (!resp.ok) throw new Error('Failed to download ZIP');
          const blob = await resp.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'bid_' + bid + '_docs.zip';
          document.body.appendChild(a);
          a.click();
          setTimeout(function(){
            window.URL.revokeObjectURL(url);
            a.remove();
          }, 100);
        } catch(e) {
          alert('ZIP download failed: ' + (e && e.message ? e.message : e));
        } finally {
          downloadZip.disabled = false;
          downloadZip.textContent = 'Download All as ZIP';
        }
      };
    }
    var submit = $('submit');
    if(submit){
      submit.onclick = async function(){
        // Validate required documents
        var requiredDocs = ['layout', 'rendering', 'order sheet'];
        var missingDocs = [];
        
        if (!Array.isArray(files) || files.length === 0) {
          alert('Cannot submit to purchasing:\\n\\nMissing ALL required documents:\\n- Layout\\n- Renderings\\n- Order Sheet\\n\\nPlease attach these documents before submitting.');
          return;
        }
        
        // Check for each required document type
        for (var i = 0; i < requiredDocs.length; i++) {
          var docType = requiredDocs[i].toLowerCase().replace(/[\s_]+/g, '');
          var found = false;
          console.log('Checking required doc:', requiredDocs[i], 'as', docType);
          for (var j = 0; j < files.length; j++) {
            var fileKind = (files[j].kind || '').toLowerCase().replace(/[\s_]+/g, '');
            var fileNameRaw = (files[j].name || files[j].filename || '').toLowerCase();
            var fileNameNorm = fileNameRaw.replace(/[\s_]+/g, '');
            console.log('  Against file:', fileNameRaw, 'kind:', fileKind, 'docType:', docType);
            if (requiredDocs[i].toLowerCase() === 'order sheet') {
              if (fileKind === 'order' || fileKind === 'ordersheet') {
                console.log('    Matched:', fileKind, 'for order sheet');
                found = true;
                break;
              }
            } else if (fileKind === docType || fileNameNorm.includes(docType)) {
              console.log('    Matched:', fileKind || fileNameRaw, 'for', docType);
              found = true;
              break;
            }
          }
          if (!found) {
            console.warn('Missing required doc:', requiredDocs[i], 'docType:', docType);
            missingDocs.push(requiredDocs[i]);
          }
        }
        
        if (missingDocs.length > 0) {
          alert('Cannot submit to purchasing:\\n\\nMissing required documents:\\n- ' + missingDocs.join('\\n- ') + '\\n\\nPlease attach these documents before submitting.');
          return;
        }
        
        try{
          var r = await fetch('/api/po/submit', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ bidId: bid })
          });
          if(!r.ok) throw new Error('Submit failed (HTTP ' + r.status + ')');
          var payload = null;
          try { payload = await r.json(); }
          catch(_){ /* ignore */ }
          var poDisplay = payload && payload.po_id ? ('PO #' + payload.po_id) : 'Draft created';
          alert('Successfully submitted to Purchasing!\n' + poDisplay);
          location.href = '/sales-home';
        }catch(e){
          alert('Submit failed: ' + (e && e.message ? e.message : 'Unknown error'));
        }
      };
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Inline nav bar fallback: render minimal nav if external script didn't populate it
    try {
      var barRoot = document.getElementById('appbar');
      if (barRoot && barRoot.children.length === 0) {
        var q = location.search || '';
        barRoot.innerHTML = '<div class="appbar" style="display:flex;align-items:center;gap:16px;padding:10px 14px;background:#0f1220;border-bottom:1px solid #22273a;color:#e9edff">'
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
    } catch(e) { /* ignore */ }
    load();
  });
})();
</script>

</body></html>`);
  });
}
