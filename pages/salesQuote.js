// /pages/salesQuote.js
export default function registerSalesQuote(app) {
  app.get("/sales-quote", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sales Quote</title>
<link rel="stylesheet" href="/static/appbar.css">
<link rel="stylesheet" href="/static/sales-nav.css">
<script src="/static/sales-nav.js"></script>
<style>
  :root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#8b93a3; }
  *{ box-sizing:border-box }
  body{ margin:0; background:var(--bg); color:var(--text); font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial }
  .wrap{ max-width:980px; margin:0 auto; padding:28px }
  h1{ margin:0 0 8px; font-size:24px }
  h2{ font-size:16px; margin:18px 0 8px }
  h3{ font-size:15px; margin:14px 0 6px }
  .muted{ color:var(--muted) }
  .box{ border:1px solid var(--line); border-radius:12px; padding:12px; background:#0f121a; }
  .panel{ background:#111318; border:1px solid var(--line); border-radius:14px; padding:16px; margin:14px 0 }
  table{ width:100%; border-collapse:collapse; font-size:14px }
  th, td{ border-bottom:1px solid var(--line); padding:10px 8px; text-align:left }
  th{ color:#a9b0c2; font-weight:600 }
  .summary{ width:100%; border:1px solid var(--line); border-radius:12px; overflow:hidden; margin-top:8px }
  .summary td:first-child{ width:70% }
  .summary td:last-child{ text-align:right; font-weight:700 }
  .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:space-between }
  .btn{ padding:8px 12px; border-radius:10px; border:1px solid var(--line); background:#1a2033; color:#eef2ff; cursor:pointer }
  .footnote{ font-size:12px; color:#aab; line-height:1.4 }
  #sp_contact{ margin-top:3px; font-size:14px; }
  @media print{
    body{ background:#fff; color:#000 }
    .panel{ background:#fff; border:1px solid #ccc; color:#000 }
    .btn{ display:none }
    th, td{ border-color:#ddd }
    .summary{ border-color:#ccc }
</style>
</head>
<body>
  <script src="/static/user-role.js"></script>
  <script src="/static/appbar.js"></script>
  <script src="/static/sales-nav.js"></script>
  <div class="wrap">

    <!-- Header -->
    <div class="row" style="align-items:flex-start; margin-bottom:10px">
      <div class="row" style="gap:14px">
        <img src="/static/ce-logo-trademarked.jpg" onerror="this.onerror=null;this.src='/static/ce-logo-trademarked.jpg';" alt="Cabinets Express" style="height:40px; vertical-align:middle"/>
        <div>
          <h1 style="margin:0">Bid Package - Cabinets Express</h1>
          <div class="muted" id="metaLine">Loading…</div>
          <div class="muted">Cabinets Express • (801) 617-1133</div>
          <div id="sp_contact" class="muted"></div>
        </div>
      </div>
      <div class="row">
  <button id="btnEmailQuote" class="btn">Email Quote</button>
  <button class="btn" id="btnDetails">Details</button>
  <span id="customerInfo" class="muted" style="margin-left:12px"></span>
        <button class="btn" id="printBtn">Print</button>
      </div>
    </div>

    <!-- Bid Package includes -->
    <div class="panel">
      <h2>Bid Package includes the following:</h2>
      <div class="box">
        Cabinets & all cabinet installation material (scribe, toe-kick, crown if applicable, shims, anchors, etc.),
        cabinet hardware (per plans), cabinet accessories (per plans). Delivering all supplies and materials to the job site.
        Installation of all cabinets, hardware and accessories if applicable.
      </div>

      <!-- Payment Summary -->
      <table class="summary" style="margin-top:14px">
        <tr><td>Required deposit before ordering cabinets:</td><td id="q_deposit">$ 0.00</td></tr>
        <tr><td>Remaining balance due on installation:</td><td id="q_balance">$ 0.00</td></tr>
        <tr><td><b>Bid Price:</b></td><td id="q_total"><b>$ 0.00</b></td></tr>
      </table>
    </div>

    <!-- Additional Information / Disclaimers -->
    <div class="panel">
      <h2>Additional Information</h2>
      <div class="footnote">
        
      </div>
    </div>

    <!-- PAGE 2: Project Information -->
  <div class="pagebreak"></div>
  <div class="panel">
    <h2>Project Information</h2>
    <div id="project-info"></div>
    <div id="onb"></div>
  </div>

<script src="/static/appbar.js"></script>

<script>
  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const qp = (n) => new URLSearchParams(location.search).get(n);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt2 = (n) => (Math.round((Number(n)||0)*100)/100).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
  const detailsBtn = document.getElementById('btnDetails');
    if (detailsBtn) detailsBtn.onclick = () => {
      const bid = new URLSearchParams(location.search).get('bid');
      if (bid) window.location.href = '/sales-details?bid=' + bid;
    };

async function renderProjectInfo(bid){
  async function get(url){ try{ const r=await fetch(url); return r.ok ? await r.json() : {}; }catch(_){ return {}; } }

  var custInfo   = await get('/api/bids/'+bid+'/customer-info');
  var leadTime   = await get('/api/bids/'+bid+'/lead-time');
  var columnsMap = await get('/api/bids/'+bid+'/columns-details');

  // Job Address
  var addr = (custInfo && (custInfo.job_address || custInfo.service_address)) || {};
  var line3 = [addr.city, addr.state, addr.zip].filter(Boolean).join(' ');
  var jobAddress = [addr.line1, addr.line2, line3].filter(Boolean).join(', ').replace(/\s+,/g, ',');

  // Lead time -> tentative window
  var days = Number((leadTime && leadTime.days) || 14);
  var start = new Date(); start.setDate(start.getDate() + days);
  var end   = new Date(start); end.setDate(end.getDate() + 2);
  var opts  = { month:'short', day:'numeric', year:'numeric' };
  var tentative = start.toLocaleDateString(undefined, opts) + ' - ' + end.toLocaleDateString(undefined, opts) + ' (Tentative)';

  // Summaries from first column
  var firstCol = Object.values(columnsMap || {})[0] || {};
  var meta = firstCol.meta || {};
  var hardware = (firstCol.hardware || []).map(function(h){
    var k = (h.kind||'').toString().toUpperCase();
    var f = h.finish || '';
    var m = h.model  || '';
  return (k ? k+' - ' : '') + f + (m ? ' '+m : '');
  }).filter(Boolean).join(', ');

  // Site contact + status
  var siteContact = 'TBD';
  if (custInfo && custInfo.site_contact && custInfo.site_contact.name) {
    siteContact = custInfo.site_contact.name + ' - ' + (custInfo.site_contact.phone || '');
  } else if (custInfo && custInfo.customer_name) {
    siteContact = custInfo.customer_name;
  }
  var status = (custInfo && custInfo.deposit_received) ? 'Scheduled' : 'Awaiting Deposit';

  // Render
  var host = document.querySelector('#project-info');
  if (host) {
      host.innerHTML = [
        '<p><strong>Job Address:</strong> '         + esc(jobAddress || 'TBD') + '</p>',
        '<p><strong>Tentative Start:</strong> '     + esc(tentative) + '</p>',
        '<p><strong>Estimated Duration:</strong> '  + esc(meta.install_days || 3) + ' days</p>',
        '<p><strong>Hardware Selections:</strong> ' + esc(hardware || 'TBD') + '</p>',
        '<p><strong>Material / Finish:</strong> '   + esc(((meta.species||'') + (meta.style ? ' / '+meta.style : '') + (meta.finish_color ? ' '+meta.finish_color : '')) || 'TBD') + '</p>',
        '<p><strong>Site Contact:</strong> '        + esc(siteContact) + '</p>',
        '<p><strong>Status:</strong> '              + esc(status) + '</p>',
        '<p class="muted">Lead time source: '       + esc((leadTime && leadTime.manufacturer) || 'N/A') + ' (' + esc(days) + ' days)</p>'
      ].join('');
  }
}

  // "soft" fetch: returns null on 404/500 instead of throwing
async function fetchSoft(url) {
  try {
    const r = await fetch(url, { method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.warn('fetchSoft error for', url, e);
    return null;
  }
}

  async function load(){
    const bid = qp('bid');
    if(!bid){
        const host = document.querySelector('.wrap') || document.body;
        host.innerHTML = '<p class="muted">Missing ?bid=</p>';
        return;
    }

    // All code below this line can safely use bid
    // Fetch and display customer info
    const customer = await fetchSoft('/api/bids/' + bid + '/customer-info');
    if (customer && (customer.customer_name || customer.customer_email)) {
      const infoEl = $('customerInfo');
      if (infoEl) {
  let infoText = 'Customer: ' + esc(customer.customer_name || '-');
        if (customer.customer_email) infoText += ' • ' + esc(customer.customer_email);
        infoEl.textContent = infoText;
      }
    }

    // Render project info panel
    renderProjectInfo(bid).catch(function(){});
/*
    // ---- header/meta (soft fetch, OK if 404) ----
    const head = await fetchSoft('/api/bids/'+bid); // may be null
    const metaEl = $('metaLine');
    const dateStr = new Date().toLocaleDateString();
  const proj = head?.name || (head?.lot_plan ? ((head.builder||'') + ' - ' + head.lot_plan) : '-');
    if (metaEl) metaEl.textContent = 'Date: ' + dateStr + ' • Project: ' + proj + ' • Bid #' + bid;
*/

const metaEl = $('metaLine');
if (metaEl) {
  metaEl.textContent = 'Date: ' + new Date().toLocaleDateString() + ' • Bid #' + bid;
}

    // salesperson (prefer bid header; fallback to /api/me)
const spEl = $('sp_contact');
if (spEl){
  const bits = [];
  // If you later restore the header fetch, you can add those fields back in
  const me = await fetchSoft('/api/me');
  if (me?.name)  bits.push('Salesperson: ' + me.name);
  if (me?.phone) bits.push(me.phone);
  if (me?.email) bits.push(me.email);
  if (bits.length){ spEl.textContent = bits.join(' • '); spEl.style.display='block'; }
  else spEl.style.display='none';
}


// ---- quote totals (use stored snapshot ONLY; else placeholders) ----
const depEl = $('q_deposit'), balEl = $('q_balance'), totEl = $('q_total');

function asNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}
function setMoney(el, value, placeholder) {
  if (!el) return;
  if (Number.isFinite(value)) el.textContent = '$ ' + fmt2(value);
  else el.textContent = placeholder;
}

// 1) fetch snapshot (no cache)
const snap = await fetchSoft('/api/bids/' + bid + '/totals');

// After declaring fetchSoft and before load() finishes:
const ac = await fetchSoft('/api/admin-content');
if (ac) {
  // header contact line
  const phoneLine = document.querySelector('.wrap .muted:nth-of-type(2)');
  if (phoneLine && ac.company_phone) phoneLine.textContent = (ac.company_name || 'Cabinets Express') + ' • ' + ac.company_phone;

  // replace disclaimer blocks if provided
  if (ac.payment_terms || ac.quote_disclaimer) {
    const foot = document.querySelector('.footnote');
    if (foot) {
      let html = '';
      if (ac.payment_terms) html += '<h3>Payment Terms</h3><p>' + ac.payment_terms + '</p>';
      if (ac.quote_disclaimer) html += '<h3>General Disclaimer</h3><p>' + ac.quote_disclaimer + '</p>';
      foot.innerHTML = html || foot.innerHTML;
    }
  }
}

// 2) use top-level response
const row = snap;

// 3) read fields defensively from top-level
const hasCore = row && ('total' in row) && ('deposit_amount' in row) && ('remaining_amount' in row);
if (hasCore) {
  const dep = asNum(row.deposit_amount);
  const bal = asNum(row.remaining_amount);
  const tot = asNum(row.total);
  setMoney(depEl, dep, '$ 0.00');
  setMoney(balEl, bal, '$ 0.00');
  setMoney(totEl, tot, '$ 0.00');
} else {
  // show safe placeholders + banner; do NOT compute anything
  setMoney(depEl, NaN, '$ 0.00');
  setMoney(balEl, NaN, '$ 0.00');
  setMoney(totEl, NaN, '$ 0.00');

  const host = document.querySelector('.wrap') || document.body;
  const note = document.createElement('div');
  note.style.cssText = 'margin:8px 0 16px 0;padding:8px 12px;border-radius:8px;background:#3a2c00;color:#ffdca8;font-size:0.95rem;';
  note.textContent = 'Totals not finalized. Save the Sales Intake first to store the official numbers.';
  host.insertBefore(note, host.firstChild);

  const emailBtn = document.getElementById('btnEmailQuote');
  const printBtn = document.getElementById('btnPrintQuote');
  if (emailBtn) { emailBtn.disabled = true; emailBtn.title = 'Totals not finalized'; }
  if (printBtn) { printBtn.disabled = true; printBtn.title = 'Totals not finalized'; }
}


    // No line-items on the quote page (you said not to show them)
    }

  // Email + Print
  function wireActions(){
    const emailBtn = document.getElementById('btnEmailQuote');
    if (emailBtn){
      emailBtn.onclick = async ()=>{
        const bid = qp('bid'); if(!bid) return alert('Missing bid id');
        await emailQuote(bid);
      };
    }
    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.onclick = ()=>window.print();
  }

  async function emailQuote(bid){
  // Fetch customer info to pre-fill email
  let to = '';
  try {
    const bidId = bid;
    const customer = await fetchSoft('/api/bids/' + bidId + '/customer-info');
    if (customer && customer.customer_email) to = customer.customer_email;
  } catch {}
  to = prompt('Send quote PDF to (email):', to);
  if (!to) return;

  const resp = await fetch('/api/bids/' + bid + '/email-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to })
  });
  const data = await resp.json().catch(()=> ({}));

  if (!resp.ok || !data.ok) {
    alert('Email failed: ' + (data.error || resp.status));
    return;
  }
  alert('Quote emailed!');
  window.location.href = '/sales-home?toast=quoteSent';
}


  document.addEventListener('DOMContentLoaded', ()=>{
    if (window.createSalesNav) window.createSalesNav('quote');
    wireActions();
    load().catch(e=>{
      console.error(e);
      const host = document.querySelector('.wrap') || document.body;
      host.insertAdjacentHTML('afterbegin','<div class="panel">Failed to load quote: '+(e.message||e)+'</div>');
    });
  });
</script>

</body>
</html>`);
  });
}

