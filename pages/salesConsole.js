export default function registerSalesConsole(app) {
  app.get("/sales-console", (req, res) => {
    const bidParam = (req.query.bid || "").toString().trim();
    res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Sales Console</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="/static/appbar.css" rel="stylesheet" />
  <style>
    :root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#e5e7eb; --muted:#9aa4b2; --brand:#3b82f6; }
    *{ box-sizing:border-box }
    html,body{ height:100%; }
    body{ margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; background:var(--background,#0b0c10); color:var(--text); }
    .wrap{ max-width:1200px; margin:0 auto; padding:20px; }
    h1{ font-size:28px; font-weight:700; margin:0; color:#e5e7eb; }
    .muted{ color:#9aa4b2; }
    .toolbar{ display:flex; align-items:center; gap:12px; margin: 12px 0 16px; flex-wrap: wrap; }
    .btn{ display:inline-flex; align-items:center; gap:.5rem; border:1px solid #2a3348; background:#223152; color:#e5e7eb; border-radius:10px; padding:8px 12px; cursor:pointer; }
    .btn:hover{ background:#2f4067; }
    .btn.secondary{ background:#1f2937; }
    .input{ border:1px solid #2a3348; background:#0f121a; color:#e5e7eb; padding:8px 10px; border-radius:8px; }
    .card{ background:#0f121a; border:1px solid #1f2937; border-radius:14px; padding:16px; }
    .row{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .grid{ display:grid; gap:12px; }
    .grid.two{ grid-template-columns: repeat(2, minmax(0,1fr)); }
    .grid.three{ grid-template-columns: repeat(3, minmax(0,1fr)); }
    .grid.four{ grid-template-columns: repeat(4, minmax(0,1fr)); }
    .section-title{ font-weight:600; color:#e5e7eb; margin-bottom:8px; font-size:14px; }
    table{ width:100%; border-collapse:separate; border-spacing:0 8px; color:#e5e7eb; }
    th, td{ text-align:left; padding:10px; border-bottom:1px solid var(--line); }
    .text-right{ text-align:right; }
    .pill{ display:inline-block; padding: 3px 8px; border:1px solid #334155; border-radius:999px; font-size:12px; background:#0f121a; color:#9aa4b2; }
    .ok{ color:#22c55e; border-color:#22c5; }
    .danger{ color:#ef4444; border-color:#ef4444; }
    .notice{ position:fixed; top:70px; left:50%; transform:translateX(-50%); background:#0f172a; color:#e2e8f0; border:1px solid #1f2937; padding:10px 14px; border-radius:8px; box-shadow:0 10px 20px rgba(0,0,0,.4); display:none; z-index:50; }
    .link{ color:#93c5fd; text-decoration:underline; cursor:pointer; }
  </style>
</head>
<body>
  <link rel="stylesheet" href="/static/appbar.css">
  <div id="appbar"></div>
  <script src="/static/appbar.js"></script>

  <div class="wrap">
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h1>Sales Console</h1>
      <div class="row">
        <span class="muted">Signed in as:</span>
        <strong id="meName">—</strong>
      </div>
    </div>

    <div class="toolbar">
      <label class="section-label">Load Bid #</label>
      <input id="bidInput" class="input" type="number" min="1" placeholder="e.g. 42" style="width:140px" />
      <button id="btnLoad" class="btn">Load</button>
      <span class="muted" id="hintText"></span>
    </div>

    <div id="notice" class="notice"></div>

    <!-- Summary -->
    <div class="card" id="summaryCard" style="display:none;">
      <div class="section-title">Summary</div>
      <div class="grid four">
        <div>
          <div class="muted">Bid #</div>
          <div id="summaryBid" class="bold"></div>
        </div>
        <div>
          <div class="muted">Customer</div>
          <div id="summaryCustomer"></div>
        </div>
        <div>
          <div class="muted">Project</div>
          <div id="summaryProject"></div>
        </div>
        <div>
          <div class="muted">Status</div>
          <div id="summaryStatus"></div>
        </div>
      </div>
    </div>

    <!-- Totals -->
    <div class="card" id="totalsCard" style="display:none;">
      <div class="section-title">Financials</div>
      <div class="grid three">
        <div>
          <div class="muted">Subtotal</div>
          <div id="totalSubtotal">$0.00</div>
        </div>
        <div>
          <div class="muted">Tax</div>
          <div id="totalTax">$0.00</div>
        </div>
        <div>
          <div class="muted">Total</div>
          <div id="totalOverall">$0.00</div>
        </div>
        <div>
          <div class="muted">Deposit %</div>
          <div id="totalDepPct">—</div>
        </div>
        <div>
          <div class="muted">Deposit Amount</div>
          <div id="totalDepAmt">$0.00</div>
        </div>
        <div>
          <div class="muted">Balance Due</div>
          <div id="totalRemain">$0.00</div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="row" id="actionsRow" style="display:none;">
      <a id="previewLink" class="btn" href="#" target="_blank">🔎 Preview Quote</a>

      <div class="row" style="margin-left:auto;">
        <input id="emailTo" class="input" type="email" placeholder="customer@email">
        <button id="btnSendQuote" class="btn">✉️ Send Quote</button>
      </div>
    </div>

    <!-- Items -->
    <div class="card" id="itemsCard" style="display:none;">
      <div class="section-title">Line Items</div>
      <div class="table-wrap">
        <table id="itemsTable">
          <thead>
            <tr>
              <th style="width:40%">Description</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Line Total</th>
            </tr>
          </thead>
          <tbody id="itemsBody"></tbody>
        </table>
      </div>
    </div>

    <!-- Help -->
    <div class="card">
      <div class="section-title">Tips</div>
      <ul class="muted">
        <li>Use the field above to load a bid by ID, or open a preview via <span class="link" id="openPreviewLink">/sales-quote?bid=…</span>.</li>
        <li>Make sure your backend routes are available:
          <code>/api/bids/:id/details</code>,
          <code>/api/bids/:id/columns-details</code>,
          <code>/api/bids/:id/totals</code>,
          <code>/api/bids/:id/customer-info</code>,
          <code>/api/bids/:id/email-quote</code>.
        </li>
      </ul>
    </div>
  </div>

  <script>
    (function(){
      const $ = (sel, ctx=document) => ctx.querySelector(sel);
      const fmt = n => (isFinite(n) ? n.toLocaleString(undefined,{style:'currency',currency:'USD'}) : '—');
      const noticeEl = document.getElementById('notice');

      function showNotice(msg) {
        noticeEl.textContent = msg;
        noticeEl.style.display = 'block';
        clearTimeout(window.__noticeTimer);
        window.__noticeTimer = setTimeout(()=>{ noticeEl.style.display='none';}, 2400);
      }

      // Populate header user
      fetch('/api/me').then(r => r.ok ? r.json() : null).then(d => {
        if (d && d.name) document.getElementById('me').textContent = d.name;
        document.getElementById('meName').textContent = d?.name || '—';
      }).catch(()=>{});

      function getQueryParam(name){
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
      }

      const bidInput = document.getElementById('bidInput');
      const btnLoad = document.getElementById('btnLoad');
      const hintText = document.getElementById('hintText');

      btnLoad.addEventListener('click', ()=> {
        const id = (bidInput.value||'').trim();
        if(!id){ showNotice('Enter a bid id'); return; }
        loadBid(id);
      });

      document.getElementById('openPreviewLink').addEventListener('click', ()=>{
        const id = (bidInput.value||'').trim();
        if(!id){ showMessage('Enter a bid id'); return; }
        window.open('/sales-quote?bid='+encodeURIComponent(id),'_blank');
      });

      const startupId = "${bidParam}";
      if (startupId) {
        bidInput.value = startupId;
        loadBid(startupId);
      } else {
        hintText.textContent = "Tip: append ?bid=123 to the URL to auto-load a bid.";
      }

      function setVisible(id, visible) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = visible ? '' : 'none';
      }

      // Fetch helpers
      async function fetchJSON(url, options) {
        const r = await fetch(url, options);
        if(!r.ok) throw new Error('Request failed: '+r.status+' '+r.statusText);
        return await r.json();
      }

      async function loadBid(id){
        try {
          setVisible('summaryCard', false);
          setVisible('totalsCard', false);
          setVisible('itemsCard', false);
          setVisible('actionsRow', false);
          document.getElementById('itemsBody').innerHTML = '';
          hintText.textContent = 'Loading…';

          // fetch details in parallel
          const [details, totals, customer, lines] = await Promise.all([
            fetchJSON('/api/bids/'+id+'/details').catch(()=>null),
            fetchJSON('/api/bids/'+id+'/totals').catch(()=>null),
            fetchJSON('/api/bids/'+id+'/customer-info').catch(()=>null),
            fetchJSON('/api/bids/'+id+'/columns-details').catch(()=>({rows:[]}))
          ]);

          if(!details){ showNotice('Could not load bid #'+id); hintText.textContent=''; return; }

          // Summary
          setVisible('summaryCard', true);
          document.getElementById('summaryBid').textContent = '#'+id;
          document.getElementById('summaryCustomer').textContent = (customer && (customer.company_name || customer.first_name)) || '—';
          document.getElementById('summaryProject').textContent = details?.project_name || '—';
          document.getElementById('summaryStatus').innerHTML = '<span class="pill">'+(details?.status || '—')+'</span>';

          // Totals
          if (totals) {
            setVisible('totalsCard', true);
            document.getElementById('totalSubtotal').textContent = fmt(totals.subtotal_after);
            document.getElementById('totalTax').textContent = fmt(totals.tax_amount);
            document.getElementById('totalOverall').textContent = fmt(totals.total);
            document.getElementById('totalDepPct').textContent = Math.round((totals.deposit_pct||0)*100) + '%';
            document.getElementById('totalDepAmt').textContent = fmt(totals.deposit||0);
            document.getElementById('totalRemain').textContent = fmt(totals.remaining||0);
          }

          // Items
          const body = document.getElementById('itemsBody');
          body.innerHTML = '';
          (Array.isArray(lines) ? lines : []).forEach(row => {
            const tr = document.createElement('tr');
            const desc = document.createElement('td');
            const qty = document.createElement('td');
            const uprice = document.createElement('td');
            const ltot = document.createElement('td');
            desc.textContent = row.description || row.column_label || '—';
            qty.className='text-right';
            uprice.className='text-right';
            ltot.className='text-right';
            qty.textContent = (row.qty_total!=null? row.qty_total : row.qty) || '—';
            uprice.textContent = row.unit_price!=null ? '$'+Number(row.unit_price).toFixed(2) : '—';
            const total = (Number(row.unit_price||0) * Number(row.qty_total||row.qty||0));
            ltot.textContent = isFinite(total) ? '$'+total.toFixed(2) : '—';
            tr.appendChild(desc); tr.appendChild(qty); tr.appendChild(uprice); tr.appendChild(ltot);
            body.appendChild(tr);
          });
          setVisible('itemsCard', true);

          // Actions
          const emailEl = document.getElementById('emailTo');
          emailEl.value = customer?.email || '';
          document.getElementById('previewLink').setAttribute('href','/sales-quote?bid='+encodeURIComponent(id));
          document.getElementById('btnSendQuote').onclick = async () => {
            const to = (emailEl.value||'').trim();
            if(!to){ showNotice('Enter recipient email'); return; }
            try {
              await fetchJSON('/api/bids/'+id+'/email-quote', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ to })
              });
              showNotice('Quote sent to '+to);
            } catch(e) {
              console.error(e);
              showNotice('Failed to send quote');
            }
          };
          setVisible('actionsRow', true);

          hintText.textContent = '';

        } catch(err) {
          console.error(err);
          showNotice('Error loading bid: '+ err.message);
          document.getElementById('itemsBody').innerHTML = '';
          setVisible('summaryCard', false);
          setVisible('totalsCard', false);
          setVisible('itemsCard', false);
          setVisible('actionsRow', false);
          document.getElementById('hintText').textContent = '';
        }
      }
    })();
  </script>
</body>
</html>`);
  });
}
