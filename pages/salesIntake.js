// pages/salesIntake.js  — DROP-IN REPLACEMENT
export default function registerSalesIntake(app) {
  app.get("/sales-intake", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Sales Intake</title>
  <link rel="stylesheet" href="/static/appbar.css">
  <link rel="stylesheet" href="/static/sales-nav.css">
  <script src="/static/sales-nav.js"></script>
  <style>
    :root{
      --bg:#0b0c10; --panel:#111318; --card:#151822; --muted:#8b93a3; --text:#eef2ff; --line:#212432; --accent:#6ee7b7; --warn:#ef4444;
    }
    *{ box-sizing:border-box }
    body{ margin:0; background:var(--bg); color:var(--text); font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial }
    .wrap{ max-width:1200px; margin:0 auto; padding:24px }
    h1{ margin:0 0 12px; font-size:24px }
    .muted{ color:var(--muted); font-size:12px }
    .panel{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px; margin:10px 0 }
    .grid{ display:grid; gap:10px }
    .g-2{ grid-template-columns: repeat(2, minmax(0,1fr)) }
    .g-3{ grid-template-columns: repeat(3, minmax(0,1fr)) }
    .g-4{ grid-template-columns: repeat(4, minmax(0,1fr)) }
    label{ display:block; font-size:12px; color:var(--muted); margin-bottom:4px }
    input, select, textarea{
      width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:#0f1220; color:var(--text); font-size:14px
    }
    textarea{ min-height:84px; resize:vertical }
    .row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }
    .btn{ padding:10px 14px; border-radius:12px; border:1px solid var(--line); background:#1a2033; color:var(--text); cursor:pointer; font-size:14px }
    .btn:hover{ background:#222a44 }
    .btn-ghost{ background:transparent }
    .btn-accent{ background:#19342d; border-color:#1c3f34; color:#bff7e6 }
    .req::after{ content:" *"; color:var(--warn); font-weight:700 }
    .card{ background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px; box-shadow:0 8px 24px rgba(0,0,0,.25) }
    .cardHead{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px }
    .invalid{ outline:2px solid var(--warn) }
    .stickyBar{ position:sticky; bottom:0; background:rgba(17,19,24,.9); border:1px solid var(--line); border-radius:12px; padding:10px 12px; display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:16px; backdrop-filter:blur(6px) }

    /* layout for sidebar */
    .layout{display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start}
    @media (max-width:1000px){.layout{grid-template-columns:1fr}}
    .sidebar{position:sticky;top:16px}
    .kpi{display:flex;justify-content:space-between;align-items:center;margin:6px 0}
    .kpi label{color:var(--muted);font-size:12px}
    .kpi .val{font-weight:700}
    .hr{border:none;border-top:1px solid var(--line);margin:10px 0}
    .cardSubtotal{margin-top:12px;padding:10px 12px;background:#191d2b;border:1px solid var(--line);border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .cardSubtotal label{margin:0;color:var(--muted);font-size:12px}
    .cardSubtotal .card-subtotal-text{font-weight:700;font-size:15px}
  </style>
</head>
<body>
  <script src="/static/user-role.js"></script>

  <script src="/static/appbar.js"></script>
  <script src="/static/options-autofill.js" defer></script>
  <script>if (window.createSalesNav) window.createSalesNav('intake');</script>
  <div class="wrap">

    <!-- two-column layout -->
    <div class="layout">

      <!-- ===== MAIN column ===== -->
      <div id="main">
        <h1>Sales Intake</h1>

        <!-- TOP (who/where/when) -->
        <div class="panel">
          <div class="grid g-3">
            <div>
              <label class="req">Sales Person</label>
              <input id="sales_person" list="dl-sales-person" placeholder="Type or pick…"/>
              <datalist id="dl-sales-person" data-key="sales_person"></datalist>
            </div>
            <div>
              <label class="req">Designer</label>
              <input id="designer" list="dl-designer" placeholder="Type or pick…"/>
              <datalist id="dl-designer" data-key="designer"></datalist>
            </div>
            <div><label>Customer Type</label>
              <select id="customer_type">
                <option value="Builder">Builder</option>
                <option value="Homeowner">Homeowner</option>
                <option value="D2C">Direct-to-Consumer</option>
              </select>
            </div>

            <div>
              <label class="req">Builder</label>
              <input id="builder_name" list="dl-builder" placeholder="Type or pick…"/>
              <datalist id="dl-builder" data-key="builder"></datalist>
            </div>
            <div><label>Builder Phone #</label><input id="builder_phone" placeholder="(###) ###-####"/></div>
            <div><label>Homeowner</label><input id="homeowner" placeholder="Homeowner"/></div>

            <div><label>Homeowner Phone #</label><input id="homeowner_phone" placeholder="(###) ###-####"/></div>
            <div><label class="req">Home Address</label><input id="home_address" placeholder="Street, City, ST ZIP"/></div>
            <div><label class="req">Lot#/Plan Name</label><input id="lot_plan" placeholder="Lot / Plan"/></div>

            <div><label class="req">Install Date</label><input id="install_date" type="date"/></div>
            <div><label class="req">Customer Email</label><input id="customer_email" type="email" placeholder="name@domain.com"/></div>
            <div><label>How to get in?</label><input id="access_notes" placeholder="Gate/lockbox codes, etc."/></div>
          </div>

          <hr style="border:none; border-top:1px solid var(--line); margin:12px 0"/>

          <!-- install/delivery/fees -->
          <div class="grid g-4" style="grid-template-columns: repeat(6, minmax(0,1fr));">
            <div>
              <label>Installation</label>
              <select id="installation"><option>Yes</option><option>No</option></select>
            </div>
            <div>
              <label>Delivery</label>
              <select id="delivery"><option>Yes</option><option>No</option></select>
            </div>
            <div>
                <label class="req">% Deposit</label>
                <select id="deposit_pct_select"></select>  <!-- replaces <input id="deposit_pct"> -->
                <input id="deposit_pct" type="hidden" value="50" />
            </div>
            <div>
              <label>Discount %</label>
              <input id="discount_pct" type="number" step="1" min="0" max="100" value="0"/>
            </div>
            <div>
              <label>Safety %</label>
              <input id="safety_pct_global" type="number" step="0.01" min="0" value="0"/>
            </div>
            
            <div>
              <label>Credit Card</label>
              <select id="credit_card"><option>Yes</option><option>No</option></select>
            </div>
          </div>
        </div>

        <!-- columns toolbar -->
        <div class="row" style="justify-content:space-between; margin:8px 0">
          <div class="muted">Add one card per Room / Unit Type / Color.</div>
          <div class="row">
            <button id="addColumnBtn" class="btn btn-accent">+ Add Column</button>
            <button id="validateBtn" class="btn">Validate Required</button>
          </div>
        </div>

        <!-- columns host -->
        <div id="columnsHost" class="grid g-2"></div>
      </div> <!-- /#main -->

      <!-- ===== SIDEBAR (live) ===== -->
      <aside class="sidebar">
        <div class="panel">
          <div class="kpi"><label>Units (all columns)</label><div id="sb_units" class="val">0</div></div>
          <div class="kpi"><label>Subtotal (raw)</label><div id="sb_subtotal" class="val">$ 0.00</div></div>
          <div class="kpi"><label>Discount %</label><div id="sb_disc_pct" class="val">0.00%</div></div>
          <div class="kpi"><label>Subtotal after discount</label><div id="sb_subtotal_disc" class="val">$ 0.00</div></div>
          <div class="kpi"><label>Tax %</label><div id="sb_tax_pct" class="val">0.00%</div></div>
          <div class="kpi"><label>Tax ($)</label><div id="sb_tax_amt" class="val">$ 0.00</div></div>
          <hr class="hr">
          <div class="kpi"><label>Credit Card?</label><div id="sb_cc" class="val">No</div></div>
          <div class="kpi"><label>CC Fee %</label><div id="sb_cc_pct" class="val">0.00%</div></div>
          <div class="kpi"><label>CC Fee ($)</label><div id="sb_cc_amt" class="val">$ 0.00</div></div>
          <div class="kpi"><label>Total</label><div id="sb_total" class="val">$ 0.00</div></div>
          <hr class="hr">
          <div class="kpi"><label>Deposit %</label><div id="sb_dep_pct" class="val">0.00%</div></div>
          <div class="kpi"><label>Deposit ($)</label><div id="sb_dep_amt" class="val">$ 0.00</div></div>
          <div class="kpi"><label>Remaining ($)</label><div id="sb_rem_amt" class="val">$ 0.00</div></div>
          <hr class="hr">
          <div class="kpi"><label>Goal ($)</label><div id="sb_goal" class="val">$ 0.00</div></div>
          <div class="kpi"><label>Difference ($)</label><div id="sb_diff" class="val">$ 0.00</div></div>
          <div class="kpi"><label>Throughput %</label><div id="sb_throughput" class="val">0.00%</div></div>
          <hr class="hr">
            <div class="row" style="justify-content:space-between; gap:8px;">
            <button id="sb_saveBtn" class="btn btn-accent" style="flex:1">Save Draft</button>
            <button id="continueBtn" class="btn btn-accent" style="flex:1">Continue</button>
            </div>
            <div class="row" style="margin-top:8px;">
            <button id="exportPdfBtn" class="btn btn-accent" style="flex:1; display:none">Export Quote (PDF)</button>
              <script src="/static/sales-nav.js"></script>
              <script>
                document.addEventListener('DOMContentLoaded', function() {
                  if (window.createSalesNav) window.createSalesNav('intake');
                });
              </script>
        </div>
      </aside>

    </div> <!-- /.layout -->
  </div> <!-- /.wrap -->

  <script src="/static/appbar.js"></script>

<script>
// =========================
//   SALES INTAKE – SCRIPT
// =========================
// Holds the current bid id once a draft is saved or an existing bid is loaded
window.currentBidId = window.currentBidId || null;

// ===== DEBUG SWITCH =====
const DEBUG = true;
const d = (...a) => {
  if (DEBUG) console.log("[INTAKE]", ...a);
};

/* ---------- API helpers (create bid / columns / lines / totals) ---------- */
/* Adjust the endpoint paths if your backend differs. */

/* ---------- API helpers (create bid / columns / lines / totals) ---------- */

async function createBid(payload){
  const r = await fetch('/api/bids', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('createBid failed: HTTP ' + r.status);
  return r.json();  // expect { id, ... }
}

function togglePdfBtn() {
  const b = document.getElementById('exportPdfBtn');
  if (!b) return;
  b.style.display = window.currentBidId ? 'flex' : 'none';
}

async function createColumn(bidId, payload){
  const url = '/api/bids/' + bidId + '/columns';
  const r = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('createColumn failed: HTTP ' + r.status);
  return r.json();
}

async function createLine(bidId, payload){
  const url = '/api/bids/' + bidId + '/lines';
  const r = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('createLine failed: HTTP ' + r.status);
  return r.json();
}

function buildColumnTotalsPayload(){
  return [];
}

async function upsertColumnTotals(){
  return { ok: true };
}

/* ---------------- helpers ---------------- */
function $(id){ return document.getElementById(id); }
function el(tag, attrs){ var d=document.createElement(tag); if(attrs){ for(var k in attrs){ if(k==='text') d.textContent=attrs[k]; else d.setAttribute(k, attrs[k]); } } return d; }
function num(v){ var n=Number(v); return isFinite(n)?n:0; }
function fmt2(n){ return (Math.round(n*100)/100).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
function putText(id, val){ var el=$(id); if(el) el.textContent = val; }

// ---- options cache / loaders ----

// --- PATCHED: normalize both array and wrapper responses ---
const optionCache = {};
async function ensureOptions(key){
  if (!optionCache[key]) {
    const r = await fetch('/api/options/'+key);
    const data = await r.json();
    const list = Array.isArray(data) ? data : (Array.isArray(data.options) ? data.options : []);
    optionCache[key] = list.map(v => ({
      value_text: v.value_text ?? v.value ?? '',
      value_num:  v.value_num  ?? v.num  ?? null,
      sort_order: v.sort_order ?? v.sort ?? 0
    }));
  }
  return optionCache[key];
}

// Save a full set of values for a key (overwrites existing on server per API definition)
async function putOptions(key, values){
  const payload = { label: key, values: values.map((v, i) => ({
    sort_order: Number(v.sort_order ?? i + 1) || (i + 1),
    value_text: String(v.value_text ?? v.value ?? ''),
    value_num:  (v.value_num ?? v.num ?? null)
  })) };
  const res = await fetch('/api/options/' + key, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('PUT /api/options/'+key+' HTTP '+res.status);
  // refresh local cache
  optionCache[key] = payload.values.map(v => ({
    value_text: v.value_text, value_num: v.value_num ?? null, sort_order: v.sort_order || 0
  }));
  return optionCache[key];
}
function populateSelect(el, list, selectedValue){
  if (!el) return;
  el.innerHTML = '';
  list.forEach(v=>{
    const txt = String(v.value_text ?? '');
    const opt = document.createElement('option');
    opt.value = txt; opt.textContent = txt;
    if (selectedValue && String(selectedValue)===txt) opt.selected = true;
    el.appendChild(opt);
  });
}

// Populate a datalist in a specific card for a given options key
function populateDatalist(card, key, list){
  const dl = card.querySelector('datalist[data-key="'+key+'"]');
  if (!dl) return;
  dl.innerHTML = '';
  (list||[]).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.value_text || '';
    dl.appendChild(opt);
  });
}

// Save a new option value into the server-backed set (idempotent)
async function saveOptionValue(key, value){
  const val = String(value||'').trim();
  if (!val) throw new Error('Value is empty');
  const r = await fetch('/api/options/'+key);
  if (!r.ok) throw new Error('Load options failed: HTTP '+r.status);
  const data = await r.json();
  const list = Array.isArray(data) ? data
              : (Array.isArray(data.options) ? data.options
              : (Array.isArray(data.values) ? data.values : []));
  const norm = list.map(v => ({
    value_text: v.value_text != null ? v.value_text : (v.value != null ? v.value : ''),
    value_num:  v.value_num  != null ? v.value_num  : (v.num   != null ? v.num   : null),
    sort_order: Number(v.sort_order != null ? v.sort_order : (v.sort != null ? v.sort : 0))
  }));
  if (norm.some(v => String(v.value_text||'').toLowerCase() === val.toLowerCase())){
    return { updated:false, list: norm };
  }
  const nextOrder = (norm.reduce((m,v)=>Math.max(m, Number(v.sort_order||0)), 0) || 0) + 1;
  const updated = [...norm, { sort_order: nextOrder, value_text: val, value_num: null }];
  const put = await fetch('/api/options/'+key, {
    method:'PUT', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ label: key, values: updated })
  });
  if (!put.ok) throw new Error('Save option failed: HTTP '+put.status);
  optionCache[key] = updated; // refresh cache
  return { updated:true, list: updated };
}

function showNotice(message, type = 'info') {
  const tag = type === 'error' ? 'error' : 'log';
  console[tag]('[notice]', message);
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value != null ? value : '';
}

function setText(selector, value) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;
  const text = value == null || String(value).trim() === '' ? '—' : String(value).trim();
  el.textContent = text;
}

function money(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0.00';
  return num.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function pct(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0%';
  return (num * 100).toFixed(2) + '%';
}

function setMoneyText(selector, value) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;
  const num = Number(value);
  el.textContent = Number.isFinite(num)
    ? num.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
    : '$0.00';
}

function normalizeSummary(data) {
  const infoRaw = data?.info ?? {};
  const modelRaw = data?.model ?? {};
  const totalsRaw = data?.totals ?? {};

  const info = {
    status: infoRaw.status ?? 'draft',
    customer_name: infoRaw.customer_name ?? '',
    customer_email: infoRaw.customer_email ?? '',
    project_name: infoRaw.project_name ?? '',
    builder: infoRaw.builder ?? infoRaw.builder_name ?? '',
    home_address: infoRaw.home_address ?? '',
    lot_plan_name: infoRaw.lot_plan_name ?? infoRaw.lot_plan ?? '',
    sales_person: infoRaw.sales_person ?? '',
    designer: infoRaw.designer ?? '',
    customer_type: infoRaw.customer_type ?? '',
    credit_card: infoRaw.credit_card ?? null,
    tax_rate: Number(infoRaw.tax_rate ?? totalsRaw.tax_rate ?? 0),
    deposit_pct: Number(infoRaw.deposit_pct ?? totalsRaw.deposit_pct ?? 0)
  };

  const totals = {
    subtotal: Number(totalsRaw.subtotal ?? totalsRaw.subtotal_after ?? totalsRaw.subtotal_after_discount ?? 0),
    subtotal_after_discount: Number(totalsRaw.subtotal_after_discount ?? totalsRaw.subtotal_after ?? totalsRaw.subtotal ?? 0),
    tax: Number(totalsRaw.tax ?? totalsRaw.tax_amount ?? 0),
    total: Number(totalsRaw.total ?? totalsRaw.total_amount ?? 0),
    deposit_pct: Number(totalsRaw.deposit_pct ?? infoRaw.deposit_pct ?? 0),
    deposit_amount: Number(totalsRaw.deposit_amount ?? totalsRaw.deposit ?? 0),
    remaining: Number(totalsRaw.remaining ?? totalsRaw.remaining_amount ?? 0),
    tax_rate: Number(totalsRaw.tax_rate ?? infoRaw.tax_rate ?? 0),
    cc_fee_amount: Number(totalsRaw.cc_fee_amount ?? totalsRaw.cc_fee ?? 0),
    cc_fee_pct: Number(totalsRaw.cc_fee_pct ?? totalsRaw.cc_fee_rate ?? 0)
  };

  const model = {
    cards_count: Number(modelRaw.cards_count ?? modelRaw.cards ?? 0),
    units_count: Number(modelRaw.units_count ?? modelRaw.units ?? 0)
  };

  return { info, totals, model };
}

function renderPreviewTable(rows) {
  // TODO: hook into Sales Intake preview table when available
  if (!Array.isArray(rows)) return;
  console.debug('[preview] rows', rows.length);
}

function renderPerCardTotals(rows) {
  if (!Array.isArray(rows)) return;
  const totalsMap = new Map();
  rows.forEach((row) => {
    const columnId = Number(row && row.column_id);
    const lineTotal = Number(row && row.line_total);
    if (!Number.isFinite(columnId)) return;
    if (!Number.isFinite(lineTotal)) return;
    totalsMap.set(columnId, (totalsMap.get(columnId) || 0) + lineTotal);
  });

  const fallbackTotals = Array.from(totalsMap.values());
  const cards = Array.from(document.querySelectorAll('#columnsHost .card'));
  cards.forEach((card, index) => {
    const attr = card.getAttribute('data-column-id');
    const columnId = Number(attr);
    let subtotal = 0;
    if (Number.isFinite(columnId) && totalsMap.has(columnId)) {
      subtotal = totalsMap.get(columnId) || 0;
    } else if (fallbackTotals[index] != null) {
      subtotal = fallbackTotals[index] || 0;
    }

    const textNode = card.querySelector('.card-subtotal-text');
    if (textNode) textNode.textContent = money(subtotal);

    const inputNode = card.querySelector('.card-subtotal-input');
    if (inputNode) inputNode.value = money(subtotal);
  });
}

// Core save that returns the bid id. Does NOT open cards view.
async function saveDraftCore(){
  const missing = validate();
  if (missing.length) { throw new Error('Please complete required fields.'); }

  const top = readTopForm();

  let bidId = window.currentBidId;
  let newBid;
  const payload = {
    name: (top.builder || 'Builder') + ' — ' + (top.lotPlan || 'Lot/Plan'),
    tax_rate:     (top.taxPct      || 0) / 100,
    discount_pct: (top.discountPct || 0) / 100,
    deposit_pct:  (top.depositPct  || 0) / 100,
    credit_card:   top.creditCard,
    cc_fee_pct:   (top.ccFeePct    || 0) / 100,
    installation:  top.installation,
    delivery:      top.delivery,
    goal_amt:      top.goal || 0,
    sales_person:  (document.getElementById('sales_person')?.value || '').trim(),
    customer_email: (document.getElementById('customer_email')?.value || '').trim(),
    customer_name:  (document.getElementById('homeowner')?.value || '').trim()
  };
  // Build onboarding data (for both new and existing bids)
  const onboarding = {
    sales_person: (document.getElementById('sales_person')?.value || '').trim(),
    designer: (document.getElementById('designer')?.value || '').trim(),
    customer_type: (document.getElementById('customer_type')?.value || '').trim(),
    builder: (document.getElementById('builder_name')?.value || '').trim(),
    builder_phone: (document.getElementById('builder_phone')?.value || '').trim(),
    homeowner: (document.getElementById('homeowner')?.value || '').trim(),
    homeowner_phone: (document.getElementById('homeowner_phone')?.value || '').trim(),
    home_address: (document.getElementById('home_address')?.value || '').trim(),
    lot_plan: (document.getElementById('lot_plan')?.value || '').trim(),
    install_date: (document.getElementById('install_date')?.value || '').trim(),
    customer_email: (document.getElementById('customer_email')?.value || '').trim(),
    access_notes: (document.getElementById('access_notes')?.value || '').trim(),
    discount_pct: Number(document.getElementById('discount_pct')?.value || 0),
    safety_pct_global: Number(document.getElementById('safety_pct_global')?.value || 0),
    credit_card: (document.getElementById('credit_card')?.value || 'No') === 'Yes',
    goal_amt: Number(document.getElementById('goal_amt')?.value || 0),
    deposit_pct: Number(document.getElementById('deposit_pct')?.value || 0),
    installation: top.installation,
    delivery: top.delivery
  };

  if (bidId) {
    // PATCH existing bid details (onboarding JSON)
    const r = await fetch('/api/bids/' + bidId + '/details', {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ onboarding })
    });
    if (!r.ok) throw new Error('updateBid details failed: HTTP ' + r.status);
    await r.json().catch(() => null);

    // Atomically clear columns and dependent rows before re-saving
    const reset = await fetch('/api/bids/' + bidId + '/reset-columns', { method: 'POST' });
    if (!reset.ok) {
      const msg = await reset.text().catch(() => '');
      const detail = msg ? ' ' + msg : '';
      throw new Error('reset-columns failed: HTTP ' + reset.status + detail);
    }
  } else {
    // POST new bid (still need minimal payload for bids table)
    newBid = await createBid(payload);
    bidId = newBid.id;
    // Then immediately save onboarding details
    const r = await fetch('/api/bids/' + bidId + '/details', {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ onboarding })
    });
    if (!r.ok) console.warn('Failed to save onboarding details for new bid');
  }

  // 2) save columns + lines + seed per-card meta for Details
  const cols = readColumnsForSave();
  for (const cardEl of document.querySelectorAll('#columnsHost .card')) {
    // create the column first and capture its id
    const label = cardEl.querySelector('.cardHead input:not([type="number"])')?.value || 'Column';
    const units = Number(cardEl.querySelector('.cardHead input[type="number"]')?.value || 0);
    const colRow = await createColumn(bidId, { label, units });
    if (colRow && colRow.id != null) {
      cardEl.dataset.columnId = String(colRow.id);
    }

    // read the four dropdowns from the intake card
    const meta = {
      manufacturer: cardEl.querySelector('.opt-manufacturer')?.value || '',
      species:      cardEl.querySelector('.opt-species')?.value || '',
      style:        cardEl.querySelector('.opt-door-style')?.value || '',
      finish_color: cardEl.querySelector('.opt-finish-color')?.value || ''
    };
    const notesText = (cardEl.querySelector('textarea')?.value || '').trim();

    // seed per-card details so Sales Details can prefill
    try {
      const r = await fetch('/api/bids/' + bidId + '/columns-details/' + colRow.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta, notes: notesText }) // hardware/notes added later by rep
      });
      if (!r.ok) {
        const t = await r.text().catch(()=> '');
        console.warn('Seed columns-details failed:', r.status, t);
      }
    } catch (e) {
      console.warn('Seed columns-details error:', e?.message || e);
    }

    // now create the pricing lines for this card (unchanged)
    const columnSnap = cols.find(c => (c.column_id && colRow && c.column_id === colRow.id) || (c.label === label && c.units === units)) || {};
    const items = Array.isArray(columnSnap.items) ? columnSnap.items : [];
    const bidColumnId = Number.isFinite(Number(cardEl.dataset.columnId)) ? Number(cardEl.dataset.columnId) : Number.isFinite(Number(colRow?.id)) ? Number(colRow.id) : null;
    for (const item of items) {
      const payload = { ...item, bid_column_id: bidColumnId ?? null };
      d('createLine →', payload);
      const resp = await createLine(bidId, payload);
      d('createLine ←', resp);
    }
  }

  // 3) persist per-column totals (so server math matches UI)
  try {
    const colTotals = buildColumnTotalsPayload();
    await upsertColumnTotals(bidId, colTotals);
  } catch (e) {
    console.warn('columns snapshot failed:', e);
  }

  // 4) persist the grand totals + working model snapshot so the bid rehydrates
  computeTotals();
  const latestTop = readTopForm();
  const totalsSnapshot = buildTotalsSnapshot(latestTop);
  const modelSnapshot = buildModelSnapshot(cols);
  try {
    await persistBidComputedState(bidId, { totals: totalsSnapshot, model: modelSnapshot });
  } catch (err) {
    console.error('Persist computed state failed', err);
    alert(err.message || 'Save totals failed');
  }

  window.currentBidId = bidId;
  togglePdfBtn();
  return bidId;
}



async function onSaveDraftClick(){
  const btn = document.getElementById('sb_saveBtn');
  try{
    if (btn) btn.disabled = true;
    const bidId = await saveDraftCore();
    // after save
    window.currentBidId = bidId;
    // flash a success message
    alert('Draft saved successfully! Bid #' + bidId);
    console.log('Draft saved as Bid #' + bidId);
  }catch(e){
    alert(e.message || 'Save failed');
  }finally{
    if (btn) btn.disabled = false;
  }
}

async function hydrateCardOptions(card){
  let [mans, specs, styles, colors] = await Promise.all([
    ensureOptions('manufacturer'),
    ensureOptions('species'),
    ensureOptions('door_style'),
    ensureOptions('finish_color')
  ]);

  // Auto-seed minimal defaults if missing so UI isn't empty (idempotent)
  try {
    if (!styles || !styles.length) {
      const defaultDoorStyles = [
        { value_text: 'Shaker' },
        { value_text: 'Raised Panel' },
        { value_text: 'Slab' },
        { value_text: 'Recessed Panel' }
      ];
      await putOptions('door_style', defaultDoorStyles);
      styles = await ensureOptions('door_style');
    }
    if (!colors || !colors.length) {
      const defaultColors = [
        { value_text: 'White' },
        { value_text: 'Off-White' },
        { value_text: 'Natural' },
        { value_text: 'Espresso' },
        { value_text: 'Gray' }
      ];
      // best-effort; ignore failure (input + datalist still works w/o suggestions)
      try { await putOptions('finish_color', defaultColors); } catch(_) {}
      colors = await ensureOptions('finish_color');
    }
  } catch(_) {
    // ignore; page remains functional and finish color is free-text
  }

  const sel = (cls) => card.querySelector(cls);

  // Read stored metadata from card dataset (set by makeColumnCard when prefilling)
  const currentMfg = card.dataset.manufacturer || sel('.opt-manufacturer')?.value || '';
  const currentSpec = card.dataset.species || sel('.opt-species')?.value || '';
  const currentStyle = card.dataset.style || sel('.opt-door-style')?.value || '';
  const currentColor = card.dataset.finish_color || '';

  // Populate selects with options, preserving current selection
  populateSelect(sel('.opt-manufacturer'), mans, currentMfg);
  populateSelect(sel('.opt-species'),      specs, currentSpec);
  populateSelect(sel('.opt-door-style'),   styles, currentStyle);

  // For finish color, support free-typed input with datalist suggestions
  populateDatalist(card, 'finish_color', colors);
  const colorEl = sel('.opt-finish-color');
  if (colorEl) {
    // Use stored value or current value, default to first option if empty
    if (currentColor) {
      colorEl.value = currentColor;
    } else if (!colorEl.value && colors.length) {
      colorEl.value = colors[0].value_text || '';
    }
    // on change, try to persist new value to options (idempotent)
    colorEl.addEventListener('change', function(){
      const v = (colorEl.value || '').trim();
      if (v) saveOptionValue('finish_color', v).catch(()=>{});
    });
  }
}



/* -------------- columns host safety -------------- */
function ensureColumnsHost(){
  var host = $('columnsHost');
  if (!host) {
    var main = $('main') || document.body;
    var sticky = document.querySelector('.stickyBar');
    host = document.createElement('div');
    host.id = 'columnsHost';
    host.className = 'grid g-2';
    if (sticky && sticky.parentNode === main) main.insertBefore(host, sticky);
    else main.appendChild(host);
  }
  return host;
}

/* -------------- column card -------------- */
var colSeq = 1;
function makeColumnCard(data){
  var card = el('div'); card.className = 'card';
  var head = el('div'); head.className = 'cardHead';

  var columnIdRaw = data && (data.column_id ?? data.columnId);
  var columnIdNum = Number(columnIdRaw);
  if (Number.isFinite(columnIdNum)) {
    card.dataset.columnId = String(columnIdNum);
  }

  var titleInput = el('input');
  titleInput.value = (data&&data.label) || ('Room / Unit ' + (colSeq++));
  titleInput.placeholder = 'Column Label (e.g., Kitchen)';
  titleInput.style.width = '60%';

  var unitsWrap = el('div'); unitsWrap.className = 'row';
  var unitsTag = el('span'); unitsTag.className = 'btn-ghost'; unitsTag.textContent = 'Units';
  var unitsInput = el('input'); unitsInput.type='number'; unitsInput.min='0'; unitsInput.step='1';
  unitsInput.value = String((data&&data.units) || 1); unitsInput.style.width='90px';
  unitsWrap.appendChild(unitsTag); unitsWrap.appendChild(unitsInput);

  var delBtn = el('button'); delBtn.className='btn btn-ghost'; delBtn.textContent='Remove';
  delBtn.onclick = function(){ card.remove(); computeTotals(); };

  head.appendChild(titleInput); head.appendChild(unitsWrap); head.appendChild(delBtn); card.appendChild(head);


  var row1 = el('div'); row1.className = 'grid g-2';
  // unique datalist id per card for finish color free-typing
  var fcId = 'finish-color-' + Math.random().toString(36).slice(2,8);
  row1.innerHTML =
    '<div><label class="req">Manufacturer</label><select class="req-field opt-manufacturer"></select></div>'+
    '<div><label class="req">Species</label><select class="req-field opt-species"></select></div>'+
    '<div><label class="req">Door Style</label><select class="req-field opt-door-style"></select></div>'+
    '<div><label class="req">Stain / Paint Color</label>'+
      '<input class="req-field opt-finish-color" list="'+fcId+'" placeholder="Type or pick…" />'+
      '<datalist id="'+fcId+'" data-key="finish_color"></datalist>'+
    '</div>';
  card.appendChild(row1);

  var row2 = el('div'); row2.className = 'grid g-2';
  row2.innerHTML =
    '<div><label class="req">Cabinet Material Cost</label><input class="req-field" type="number" step="0.01" min="0" placeholder="$"/></div>'+
    '<div><label>Hardware</label><input type="number" step="0.01" min="0" placeholder="$"/></div>'+
    '<div><label>Accessories</label><input type="number" step="0.01" min="0" placeholder="$"/></div>'+
    '<div><label>Assembly</label><input type="number" step="0.01" min="0" placeholder="$"/></div>';
  card.appendChild(row2);

  var row3 = el('div'); row3.className = 'grid g-2';
  row3.innerHTML =
    '<div><label>Misc $</label><input type="number" step="0.01" min="0" placeholder="$"/></div>'+
    '<div><label>Shipping</label><input type="number" step="0.01" min="0" placeholder="$"/></div>';
  card.appendChild(row3);

var row4 = el('div'); row4.className = 'grid g-1';
row4.innerHTML =
    '<div><label>Misc Notes</label><textarea placeholder="Notes…"></textarea></div>';
card.appendChild(row4);

  var subtotalBox = el('div'); subtotalBox.className = 'cardSubtotal';
  subtotalBox.innerHTML = '<label>Card Subtotal</label><div class="card-subtotal-text">$ 0.00</div>';
  card.appendChild(subtotalBox);

  // Store metadata on the card element so hydrateCardOptions can use it
  if (data) {
    card.dataset.manufacturer = data.manufacturer || '';
    card.dataset.species = data.species || '';
    card.dataset.style = data.style || '';
    card.dataset.finish_color = data.finish_color || '';
  }

  card.addEventListener('input', computeTotals);
  // fill the four dropdowns from options API
    hydrateCardOptions(card).catch(()=>{ /* silent: still usable */ });

  return card;
}

function addColumn(data){
  var host = ensureColumnsHost();
  var card = makeColumnCard(data);
  host.appendChild(card);
  if (data && (data.column_id != null || data.columnId != null)) {
    var cid = Number(data.column_id ?? data.columnId);
    if (Number.isFinite(cid)) card.dataset.columnId = String(cid);
  }
  computeTotals();
}

/* -------------- validation -------------- */
function validate(){
  var missing = [];
  [
    ['sales_person','Sales Person'],['designer','Designer'],
    ['builder_name','Builder'],['home_address','Home Address'],
    ['lot_plan','Lot/Plan'],['install_date','Install Date'],
    ['customer_email','Customer Email'],['deposit_pct','% Deposit']
  ].forEach(function(p){
    var el=$(p[0]); if(!el||!String(el.value||'').trim()){ missing.push(p[1]); if(el) el.classList.add('invalid'); } else if(el){ el.classList.remove('invalid'); }
  });

  var cols = Array.from(document.querySelectorAll('#columnsHost .card'));
  if (cols.length===0) missing.push('At least one Column');
  cols.forEach(function(card,i){
    Array.from(card.querySelectorAll('.req-field')).forEach(function(inp){
      if(!String(inp.value||'').trim()){ inp.classList.add('invalid'); missing.push('Column '+(i+1)+': '+(inp.placeholder||'Required')); }
      else inp.classList.remove('invalid');
    });
  });

  var s=$('status'); if(s) s.textContent = missing.length?('Error: '+missing.length+' required field(s) missing'):'Looks good';
  return missing;
}

/* -------------- read form + columns -------------- */
function readTopForm(){
  var get=function(id){return $(id);};
  return {
    builder:(get('builder_name')?.value||'').trim(),
    lotPlan:(get('lot_plan')?.value||'').trim(),
    installation:(get('installation')?.value||'Yes')==='Yes',
    delivery:(get('delivery')?.value||'Yes')==='Yes',
    depositPct:num(get('deposit_pct')?.value||0),
    discountPct:num(get('discount_pct')?.value||0),
    safetyPctGlobal:num(get('safety_pct_global')?.value||0),
    creditCard:(get('credit_card')?.value||'Yes')==='Yes',
    ccFeePct:num(get('cc_fee_pct')?.value||0),
    taxPct:num(get('tax_pct_global')?.value||7.25),
    goal:num(get('goal_amt')?.value||0)
  };
}

function readColumnsForSave(){
  const top = readTopForm();
  var out=[], host=$('columnsHost'); if(!host) return out;
  Array.from(host.querySelectorAll('.card')).forEach(function(card){
    var label=card.querySelector('.cardHead input:not([type="number"])')?.value||card.querySelector('.cardHead input')?.value||'Column';
    var units=num(card.querySelector('.cardHead input[type="number"]')?.value||0);
    var columnIdAttr = card.getAttribute('data-column-id');
    var columnId = Number(columnIdAttr);

    var findAmt=function(needle){
      var lab=Array.from(card.querySelectorAll('label')).find(function(l){return (l.textContent||'').toLowerCase().indexOf(needle)>-1;});
      var box=lab?.parentElement?.querySelector('input[type="number"]');
      return num(box?.value||0);
    };

    var items=[];
    function pushMoney(desc,cat,amt){
      if(!amt||amt<=0) return;
      items.push({description:desc,category:cat,unit_of_measure:'ea',qty_per_unit:1,unit_price:amt,pricing_method:'fixed',sort_order:999});
    }

    // (Optional) store selected metadata as a note line (price $0)
    const man = card.querySelector('.opt-manufacturer')?.value || '';
    const spc = card.querySelector('.opt-species')?.value || '';
    const sty = card.querySelector('.opt-door-style')?.value || '';
    const col = card.querySelector('.opt-finish-color')?.value || '';
  const metaText = ['Mfg: '+man, 'Species: '+spc, 'Style: '+sty, 'Color: '+col].join(' | ');
    items.push({
    description: metaText,
    category: 'Notes',
    unit_of_measure: 'ea',
    qty_per_unit: 0,
    unit_price: 0,
    pricing_method: 'fixed',
    sort_order: 50
    });

    var cab=findAmt('cabinet material cost'), hardware=findAmt('hardware'),
        accessories=findAmt('accessories'), assembly=findAmt('assembly'),
        shipping=findAmt('shipping'), inputAdj=findAmt('input (adj.)'),
        safetyPct=findAmt('safety %');

    pushMoney('Cabinet Material Cost','Materials',cab);
    pushMoney('Hardware','Hardware',hardware);
    pushMoney('Accessories','Accessories',accessories);
    pushMoney('Assembly','Assembly',assembly);
    pushMoney('Shipping','Shipping',shipping);
  pushMoney('Input Adj.','Adjustments',inputAdj);

  const deliveryPU = top.delivery ? 250 : 0;
  pushMoney('Delivery','Delivery',deliveryPU);

    var basePU=cab+hardware+accessories+assembly+shipping+inputAdj;
    var safetyPU=basePU*(safetyPct/100);
    if(safetyPU>0){ items.push({description:'Safety ('+safetyPct+'%)',category:'Safety',unit_of_measure:'ea',qty_per_unit:1,unit_price:safetyPU,pricing_method:'fixed',sort_order:1000}); }

    const meta = { manufacturer: man, species: spc, style: sty, finish_color: col };
    const notes = (card.querySelector('textarea')?.value || '').trim();
    out.push({ column_id: Number.isFinite(columnId) ? columnId : null, label: label, units: units, items: items, meta: meta, notes: notes });
  });
  return out;
}

/* -------------- totals (client-side live) -------------- */
function computeTotals(){
  var top=readTopForm();
  var cards=Array.from(document.querySelectorAll('#columnsHost .card')), base=0, sumUnits=0, goalBase=0, sumInputs=0; // sumInputs for throughput %

    const installFactor = (top.installation ? 0.95 : 0.88);   // A8
  const deliveryPU    = (top.delivery ? 250 : 0);           // B8 per-unit
  const discF         = Math.max(0, Number(top.discountPct||0)) / 100;
  const safetyF       = Math.max(0, Number(top.safetyPctGlobal||0)) / 100;

  cards.forEach(function(card){
    const u = card.querySelector('.cardHead input[type="number"]');
    const units = num(u?.value || 0);
    sumUnits += units;

    const getAmt = function(needle){
      const lab = Array.from(card.querySelectorAll('label')).find(function(l){
        const t = (l.textContent || '').toLowerCase();
        return t.includes(needle) || (needle==='input (adj.)' && (t.includes('misc $') || t.includes('misc')));
      });
      const box = lab?.parentElement?.querySelector('input[type="number"]');
      return num(box?.value || 0);
    };

    // === C25 = C16 + C17 + C18 + C19 + C21 ===
    const cab        = getAmt('cabinet material cost'); // C16
    const hardware   = getAmt('hardware');              // C17
    const accessories= getAmt('accessories');           // C18
    const assembly   = getAmt('assembly');              // C19
    const misc       = getAmt('input (adj.)');          // C21 (aka "Misc $")
    const C25 = cab + hardware + accessories + assembly + misc;
    sumInputs += C25 * units;

    // If/when you add a dedicated UI field for C24, read it here. For now, treat as 0.
    const C24_addon = 0;
    const shipping  = getAmt('shipping');               // C27

    // per-unit path: ((C25*2)*factor) + C24 + shipping + delivery
    let preDiscPU = ((C25 * 2) * installFactor) + C24_addon + shipping + deliveryPU;

    // apply global Safety % BEFORE discount
    preDiscPU = preDiscPU * (1 + safetyF);

    // discount then units
    const afterDiscPU = preDiscPU * (1 - discF);
  const columnTotal = afterDiscPU * units;
  const cid = Number(card.getAttribute('data-column-id') ?? card.dataset?.columnId ?? NaN);
  d('compute column total', { column_id: cid, columnTotal, units });

  // reflect per-card subtotal immediately for responsive UI
  const tileText = card.querySelector('.card-subtotal-text');
  if (tileText) tileText.textContent = '$ ' + fmt2(columnTotal);
  const tileInput = card.querySelector('.card-subtotal-input');
  if (tileInput) tileInput.value = '$ ' + fmt2(columnTotal);

    // per-unit path ... (your pricing calc)
    base += columnTotal; // base is the subtotal the sidebar shows

    // === GOAL ($) per column ===
    // M = cab + hardware + accessories + assembly + misc
    const M = cab + hardware + accessories + assembly + misc;
    // tax only on (cab + hardware + accessories)
    const taxableBase    = cab + hardware + accessories;
    const taxOnTaxables  = taxableBase * (top.taxPct / 100);
    // Goal for this column, then × units
    const goalCol = ( (2 * M) + shipping + taxOnTaxables ) * units;

    goalBase += goalCol;

  });


  var discounted=base*(1-(top.discountPct/100));
  var taxAmt=discounted*(top.taxPct/100);
  var customer=discounted+taxAmt;
  // Throughput % = 1 - ( Σ(Input×Units) / Σ(Detailed Customer Investment before CC) )
    let throughputPct = 0;
    if (customer > 0) {
    throughputPct = (1 - (sumInputs / customer)) * 100;
    }
    // clamp to [0,100] in case of edge rounding
    throughputPct = Math.max(0, Math.min(100, throughputPct));

  // --- Credit card fee (auto-apply 3 % when "Yes") ---
    const ccF = top.creditCard ? 0.03 : 0;      // 3 % if Yes, 0 % if No
    const ccFee = top.creditCard ? customer * ccF : 0;
    const customerCC = customer + ccFee;

  var deposit   = customerCC*(top.depositPct/100);
  var remaining = customerCC-deposit;
  var goal      = goalBase;  
  var diff      = customerCC - goal;
  
  // write totals panel
  function setVal(id,val){ var el=$(id); if(el) el.value=(Math.round(val*100)/100).toFixed(2); }
  setVal('subtotal_amt',discounted); setVal('tax_amt',taxAmt);
  setVal('customer_investment',customer); setVal('customer_investment_cc',customerCC);

  setVal('cc_fee_amt',ccFee);
  setVal('deposit_amt',deposit);
  setVal('remaining_amt',remaining);
  setVal('goal_amt',goal); 
  setVal('diff_amt',diff);
  setVal('throughput_amt',throughputPct);

  // sidebar mirrors
  putText('sb_units', sumUnits.toLocaleString());
  putText('sb_subtotal', '$ '+fmt2(base));
  putText('sb_disc_pct', (top.discountPct||0).toFixed(2)+'%');
  putText('sb_subtotal_disc', '$ '+fmt2(discounted));
  putText('sb_tax_pct', (top.taxPct||0).toFixed(2)+'%');
  putText('sb_tax_amt', '$ '+fmt2(taxAmt));
  putText('sb_cc', top.creditCard?'Yes':'No');
  putText('sb_cc_pct', top.creditCard ? '3.00%' : '0.00%'); // show 3%
  putText('sb_cc_amt', '$ '+fmt2(ccFee));
  putText('sb_total', '$ '+fmt2(customerCC));
  putText('sb_dep_pct', (top.depositPct||0).toFixed(2)+'%');
  putText('sb_dep_amt', '$ '+fmt2(deposit));
  putText('sb_rem_amt', '$ '+fmt2(remaining));
  putText('sb_goal', '$ '+fmt2(goal));   // show computed goal
  putText('sb_diff', '$ '+fmt2(diff));
  putText('sb_throughput', fmt2(throughputPct) + '%');
}

function buildTotalsSnapshot(topForm) {
  const top = topForm || readTopForm();
  const readMoney = (selector) => {
    const text = document.querySelector(selector)?.textContent || '0';
    const normalized = text.replace(/[^0-9.\-]/g, '');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
  };

  const subtotalRaw = readMoney('#sb_subtotal');
  const subtotalDiscounted = readMoney('#sb_subtotal_disc');
  const taxAmount = readMoney('#sb_tax_amt');
  const totalWithCc = readMoney('#sb_total');
  const depositAmount = readMoney('#sb_dep_amt');
  const remainingAmount = readMoney('#sb_rem_amt');
  const ccFeeAmount = readMoney('#sb_cc_amt');

  const taxRate = Number(top?.taxPct ?? 0) / 100;
  const depositPct = Number(top?.depositPct ?? 0) / 100;
  const ccFeePct = top?.creditCard ? 0.03 : 0;

  return {
    subtotal: subtotalRaw,
    subtotal_after_discount: subtotalDiscounted,
    subtotal_after: subtotalDiscounted,
    tax: taxAmount,
    tax_rate: taxRate,
    total: totalWithCc,
    deposit_pct: depositPct,
    deposit_amount: depositAmount,
    remaining: remainingAmount,
    cc_fee_pct: ccFeePct,
    cc_fee_amount: ccFeeAmount
  };
}

function buildModelSnapshot(columnsForSave) {
  const source = Array.isArray(columnsForSave) && columnsForSave.length ? columnsForSave : readColumnsForSave();
  let lineSeq = 1;
  let unitsCount = 0;

  const columns = source.map((col, idx) => {
    const units = num(col?.units ?? 0);
    unitsCount += units;
    const meta = col?.meta || {};
    const rawLabel = col && col.label ? String(col.label) : '';
    const label = rawLabel.trim() || ('Card ' + (idx + 1));
    const columnIdCandidate = Number(col && col.column_id);
    const columnId = Number.isFinite(columnIdCandidate) ? columnIdCandidate : idx + 1;
    return {
      column_id: columnId,
      column_label: label,
      units,
      manufacturer: meta.manufacturer || '',
      species: meta.species || '',
      style: meta.style || '',
      finish_color: meta.finish_color || '',
      notes: col?.notes || ''
    };
  });

  const lines = [];
  source.forEach((col, idx) => {
    const columnIdCandidate = Number(col && col.column_id);
    const columnId = Number.isFinite(columnIdCandidate) ? columnIdCandidate : (idx + 1);
    const items = Array.isArray(col?.items) ? col.items : [];
    items.forEach((item, itemIdx) => {
      lines.push({
        line_id: lineSeq++,
        column_id: columnId,
        description: item?.description ?? '',
        qty_per_unit: num(item?.qty_per_unit ?? 0),
        unit_price: num(item?.unit_price ?? 0),
        pricing_method: item?.pricing_method ?? 'fixed',
        sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item?.sort_order) : itemIdx,
        category: item?.category ?? null
      });
    });
  });

  return {
    columns,
    lines,
    cards_count: columns.length,
    units_count: unitsCount
  };
}

async function persistBidComputedState(bidId, snapshots) {
  if (!Number.isFinite(Number(bidId))) {
    throw new Error('Invalid bid id');
  }
  const { totals, model } = snapshots || {};
  const headers = { 'Content-Type': 'application/json', 'X-Org-Id': '1' };

  if (totals) {
    const body = {
      subtotal_after_discount: num(totals.subtotal_after_discount ?? totals.subtotal ?? 0),
      subtotal_after: num(totals.subtotal_after ?? totals.subtotal_after_discount ?? totals.subtotal ?? 0),
      tax_rate: num(totals.tax_rate ?? 0),
      tax_amount: num(totals.tax ?? 0),
      cc_fee_pct: num(totals.cc_fee_pct ?? 0),
      cc_fee_amount: num(totals.cc_fee_amount ?? totals.cc_fee ?? 0),
      cc_fee: num(totals.cc_fee_amount ?? totals.cc_fee ?? 0),
      total: num(totals.total ?? 0),
      deposit_pct: num(totals.deposit_pct ?? 0),
      deposit_amount: num(totals.deposit_amount ?? 0),
      remaining_amount: num(totals.remaining ?? totals.remaining_amount ?? 0)
    };

    const resp = await fetch('/api/bids/' + bidId + '/totals', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const message = ('Save totals failed (HTTP ' + resp.status + '): ' + text).trim();
      throw new Error(message);
    }
    await resp.json().catch(() => ({}));
  }

  if (model) {
    const snapshot = {
      columns: Array.isArray(model.columns) ? model.columns : [],
      lines: Array.isArray(model.lines) ? model.lines : [],
      cards_count: num(model.cards_count ?? (model.columns ? model.columns.length : 0)),
      units_count: num(model.units_count ?? 0)
    };

    const resp = await fetch('/api/bids/' + bidId + '/details', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ calc_snapshot: snapshot })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const message = ('Save snapshot failed (HTTP ' + resp.status + '): ' + text).trim();
      throw new Error(message);
    }
    await resp.json().catch(() => ({}));
  }
}

function autoWireTotals(){
  ['installation','delivery','deposit_pct_select','deposit_pct',
   'discount_pct','credit_card','tax_pct_global','cc_fee_pct','goal_amt','safety_pct_global']
   .forEach(function(id){
     var el = $(id);
     if (el) { el.addEventListener('input', computeTotals);
               el.addEventListener('change', computeTotals); }
   });
  $('columnsHost')?.addEventListener('input', function(e){
    if (e.target && (e.target.matches('input') || e.target.matches('textarea'))) computeTotals();
  });
}

// --- helpers ---
function setIfEmpty(id, val){
  const el = document.getElementById(id);
  if (!el) return;
  if (!String(el.value||"").trim() && val) el.value = val;
}
async function autofill(kind, name){
  if (!name) return;
  const url = kind === 'builder'
    ? '/api/lookup/builder?name=' + encodeURIComponent(name)
    : '/api/lookup/customer?name=' + encodeURIComponent(name);
  try{
    const r = await fetch(url); if (!r.ok) return;
    const d = await r.json();
    if (kind === 'builder'){
      setIfEmpty('builder_phone', d.phone);
      // if you store builder email, set another field here
    } else {
      setIfEmpty('homeowner_phone', d.phone);
      setIfEmpty('customer_email', d.email);
    }
  }catch(_){}
}


/* -------------- boot & handlers -------------- */
document.addEventListener('DOMContentLoaded', async function(){
  if (window.createSalesNav) window.createSalesNav('intake');
  
  // --- Prefill logic for edit mode ---
  const q = new URLSearchParams(location.search);
  const bidFromUrl = Number(q.get('bid') || '');
  window.currentBidId = Number.isFinite(bidFromUrl) && bidFromUrl > 0 ? bidFromUrl : null;
  togglePdfBtn();

  // wire toolbar
  var addBtn=$('addColumnBtn'); if(addBtn) addBtn.onclick=function(){ addColumn(); };
  var valBtn=$('validateBtn'); if(valBtn) valBtn.onclick=function(){ validate(); };

  // autofill phone/email when selecting Builder or typing Customer
  const builderInput = $('builder_name');
  if (builderInput) {
    const run = () => autofill('builder', (builderInput.value || '').trim());
    builderInput.addEventListener('change', run);
    builderInput.addEventListener('blur', run);
  }
  const customerInput = $('homeowner');
  if (customerInput) {
    const run = () => autofill('customer', (customerInput.value || '').trim());
    customerInput.addEventListener('change', run);
    customerInput.addEventListener('blur', run);
  }

  // sidebar buttons
  const sbSave = document.getElementById('sb_saveBtn');
  if (sbSave) sbSave.onclick = onSaveDraftClick;

  // center buttons
  const saveBtn = document.getElementById('saveDraftBtn');
  if (saveBtn) saveBtn.onclick = onSaveDraftClick;

  const contBtn = document.getElementById('continueBtn');
  if (contBtn) {
    contBtn.onclick = async () => {
      try {
        contBtn.disabled = true;
        contBtn.textContent = 'Saving…';
        let bidId = window.currentBidId;
        if (!bidId) bidId = await saveDraftCore();
        window.location.assign('/sales-details?bid=' + bidId);
      } catch (e) {
        alert(e.message || 'Could not continue');
      } finally {
        contBtn.textContent = 'Continue';
        contBtn.disabled = false;
      }
    };
  }

  async function hydrateMe() {
    try {
      const r = await fetch('/api/me');
      if (!r.ok) return;
      const me = await r.json();
      const sp = document.getElementById('sales_person');
      // Prefill salesperson but keep it editable
      if (me?.name && sp && !sp.value) {
        sp.value = me.name;
      }
      if (me && me.profile_complete === false) {
        window.location.href = '/onboarding/profile';
      }
    } catch (_) {}
  }
  
  // Export Quote (PDF)
  const pdfBtn = document.getElementById('exportPdfBtn');
  if (pdfBtn) {
    pdfBtn.onclick = async () => {
      try {
        pdfBtn.disabled = true;
        pdfBtn.textContent = 'Preparing…';
        let bidId = window.currentBidId;
        if (!bidId) {
          bidId = await saveDraftCore();
        }
        window.open('/sales-quote?bid=' + bidId, '_blank');
      } catch (e) {
        alert(e.message || 'Could not export quote');
      } finally {
        pdfBtn.textContent = 'Export Quote (PDF)';
        pdfBtn.disabled = false;
      }
    };
  }
  

  // --- PATCHED: bullet-proof deposit percent handling ---
  async function loadDepositOptions(){
    try{
      const r = await fetch('/api/options/deposit_pct');
      const data = await r.json();
      const list = Array.isArray(data) ? data : (data.options || []);

      const sel = document.getElementById('deposit_pct_select');
      if (!sel) return; sel.innerHTML='';

      list.forEach(v=>{
  const raw = Number((v.value_num !== undefined ? v.value_num : (v.num !== undefined ? v.num : 0)));
  const frac = raw > 1 ? raw/100 : raw;           // 50 -> 0.50, 0.5 -> 0.50
  const label = v.value_text ? v.value_text : (Math.round(frac*100) + '%');
  const o = document.createElement('option');
  o.value = String(frac); o.textContent = label;
  sel.appendChild(o);
      });

      sel.onchange = ()=>{
        const frac = Number(sel.value||0);
        const hidden = document.getElementById('deposit_pct');
        if (hidden) hidden.value = String(Math.round(frac*100));
        computeTotals();
      };

      if (sel.options.length){
        const frac0 = Number(sel.options[0].value||0);
        const hidden = document.getElementById('deposit_pct');
        if (hidden) hidden.value = String(Math.round(frac0*100));
      }
    }catch(_){}
  }
  
  // --- Prefill for edit mode ---
  async function prefillBid(bidId) {
    if (!Number.isFinite(bidId)) return;

    const opts = { headers: { 'X-Org-Id': '1' } };
    const hint = document.getElementById('hintText');
    if (hint) hint.textContent = 'Loading…';

    try {
  const summaryRes = await fetch('/api/bids/' + bidId + '/summary', opts);
      if (!summaryRes.ok) {
        showNotice('Could not load bid summary', 'error');
        if (hint) hint.textContent = '';
        return;
      }

      const summaryRaw = await summaryRes.json();
      if (!summaryRaw?.ok) {
        showNotice('Bid not found', 'error');
        if (hint) hint.textContent = '';
        return;
      }

      const { info, totals, model: modelSummary } = normalizeSummary(summaryRaw);
      const infoRaw = summaryRaw.info || {};
  d('summary ok?', summaryRaw?.ok, 'info', info, 'totals', totals, 'modelSummary', modelSummary);

      setInputValue('sales_person', info.sales_person || infoRaw.sales_person || '');
      setInputValue('builder_name', info.builder || infoRaw.builder || '');
      setInputValue('home_address', info.home_address || infoRaw.home_address || '');
      setInputValue('lot_plan', info.lot_plan_name || infoRaw.lot_plan_name || infoRaw.lot_plan || '');
      setInputValue('customer_email', info.customer_email || infoRaw.customer_email || '');
      setInputValue('homeowner', info.customer_name || infoRaw.customer_name || '');

      // Sidebar snapshot
  setText('#sb_units', Number(modelSummary.units_count || 0).toLocaleString());
  setMoneyText('#sb_subtotal', totals.subtotal);
  setMoneyText('#sb_subtotal_disc', totals.subtotal_after_discount);
  setText('#sb_tax_pct', pct(totals.tax_rate || info.tax_rate));
  setMoneyText('#sb_tax_amt', totals.tax);
  setMoneyText('#sb_total', totals.total);
  setMoneyText('#sb_rem_amt', totals.remaining);
  setMoneyText('#sb_cc_amt', totals.cc_fee_amount);
  setMoneyText('#subtotal', totals.subtotal);
  setMoneyText('#tax', totals.tax);
  setMoneyText('#total', totals.total);
  setText('#depositPct', pct(totals.deposit_pct));
  setMoneyText('#depositAmount', totals.deposit_amount);
  setMoneyText('#remaining', totals.remaining);

      const creditCardFlag = (() => {
        const raw = infoRaw.credit_card;
        if (raw === null || raw === undefined) {
          return Boolean(totals.cc_fee_pct && totals.cc_fee_pct > 0);
        }
        if (typeof raw === 'string') {
          const lower = raw.trim().toLowerCase();
          return lower === 'true' || lower === '1' || lower === 'yes';
        }
        return Boolean(raw);
      })();

      setText('#sb_cc', creditCardFlag ? 'Yes' : 'No');
      setText('#sb_cc_pct', pct(creditCardFlag ? (totals.cc_fee_pct || 0.03) : 0));

      const totalValue = totals.total;
      const depositAmountFromTotals = totals.deposit_amount;
      const applyDepositFraction = (rawValue) => {
        if (rawValue == null) return false;
        const fraction = rawValue > 1 ? rawValue / 100 : rawValue;
        if (!Number.isFinite(fraction)) return false;
        const percent = fraction * 100;

        const depHidden = $('deposit_pct');
        if (depHidden) depHidden.value = String(Math.round(percent));

        const depSelect = $('deposit_pct_select');
        if (depSelect) {
          let matched = false;
          for (let i = 0; i < depSelect.options.length; i += 1) {
            const optFraction = Number(depSelect.options[i].value || 0);
            if (Math.round(optFraction * 100) === Math.round(percent)) {
              depSelect.selectedIndex = i;
              matched = true;
              break;
            }
          }
          if (!matched) {
            const opt = document.createElement('option');
            opt.value = String(fraction);
            opt.textContent = Math.round(percent) + '%';
            depSelect.appendChild(opt);
            depSelect.value = opt.value;
          }
        }

        setText('#sb_dep_pct', percent.toFixed(2) + '%');
        const depositValue = Number.isFinite(depositAmountFromTotals) && depositAmountFromTotals > 0
          ? depositAmountFromTotals
          : totalValue * fraction;
        setMoneyText('#sb_dep_amt', depositValue);
        setText('#depositPct', percent.toFixed(2) + '%');
        setMoneyText('#depositAmount', depositValue);
        return true;
      };

      let depositHandled = false;
      if (totals.deposit_pct != null) {
        depositHandled = applyDepositFraction(totals.deposit_pct);
      }
      if (!depositHandled && info.deposit_pct != null) {
        depositHandled = applyDepositFraction(info.deposit_pct);
      }
      if (!depositHandled) {
        setText('#sb_dep_pct', '0.00%');
        setMoneyText('#sb_dep_amt', 0);
        setText('#depositPct', '0%');
        setMoneyText('#depositAmount', 0);
      }

      // Merge onboarding fields for form inputs
      let onboarding = {};
      try {
  const detailsRes = await fetch('/api/bids/' + bidId + '/details', opts);
        if (detailsRes.ok) {
          const det = await detailsRes.json();
          if (det?.onboarding && typeof det.onboarding === 'object') {
            onboarding = det.onboarding;
          }
        }
      } catch (err) {
        console.warn('[prefill] details load failed', err);
      }

      const applyInput = (id, val) => {
        if (val == null) return;
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') {
          el.value = val;
        } else {
          setInputValue(id, val);
        }
      };

      applyInput('designer', onboarding.designer ?? info.designer);
      applyInput('customer_type', onboarding.customer_type ?? info.customer_type);
      applyInput('sales_person', onboarding.sales_person);
      applyInput('builder_name', onboarding.builder);
      applyInput('homeowner', onboarding.homeowner);
      applyInput('builder_phone', onboarding.builder_phone);
      applyInput('homeowner_phone', onboarding.homeowner_phone);
      applyInput('install_date', onboarding.install_date ? String(onboarding.install_date).slice(0, 10) : null);
      applyInput('access_notes', onboarding.access_notes);
      applyInput('discount_pct', onboarding.discount_pct);
      applyInput('safety_pct_global', onboarding.safety_pct_global);
      applyInput('goal_amt', onboarding.goal_amt);
      if (onboarding.credit_card != null) {
        applyInput('credit_card', onboarding.credit_card ? 'Yes' : 'No');
        putText('sb_cc', onboarding.credit_card ? 'Yes' : 'No');
        putText('sb_cc_pct', onboarding.credit_card ? '3.00%' : '0.00%');
      }
      if (onboarding.installation != null) {
        applyInput('installation', onboarding.installation ? 'Yes' : 'No');
      }
      if (onboarding.delivery != null) {
        applyInput('delivery', onboarding.delivery ? 'Yes' : 'No');
      }

      if ((totals.deposit_pct ?? info.deposit_pct ?? null) == null && onboarding.deposit_pct != null) {
        applyDepositFraction(onboarding.deposit_pct);
      }

      // Remove starter card and rebuild columns
      const host = $('columnsHost');
      if (host) host.innerHTML = '';

      let columnDetails = {};
      try {
  const colsRes = await fetch('/api/bids/' + bidId + '/columns-details', opts);
        if (colsRes.ok) {
          const arr = await colsRes.json();
          const entries = Array.isArray(arr)
            ? arr.map((row) => [Number(row?.column_id), row]).filter(([key]) => Number.isFinite(key))
            : [];
          columnDetails = Object.fromEntries(entries);
        }
      } catch (err) {
        console.warn('[prefill] columns-details load failed', err);
      }
      d('columns-details map size', Object.keys(columnDetails || {}).length);

      let modelData = {};
      try {
  const modelRes = await fetch('/api/bids/' + bidId + '/model', opts);
        if (modelRes.ok) {
          modelData = await modelRes.json();
        }
      } catch (err) {
        console.warn('[prefill] model load failed', err);
      }

      const columns = Array.isArray(modelData.columns) ? modelData.columns : [];
      const lines = Array.isArray(modelData.lines) ? modelData.lines : [];
      d('model columns', columns.length, 'lines', lines.length);

      columns.forEach((col) => {
        const details = columnDetails[col.column_id] || {};
        const cardData = {
          column_id: col.column_id,
          label: col.column_label,
          units: col.units,
          manufacturer: details.meta?.manufacturer || '',
          species: details.meta?.species || '',
          style: details.meta?.style || '',
          finish_color: details.meta?.finish_color || ''
        };

        addColumn(cardData);

        const cardHost = $('columnsHost');
        const card = cardHost ? cardHost.lastElementChild : null;
        if (!card) return;

        const byCategory = (category) =>
          lines.find((line) =>
            (line.column_id === col.column_id || line.column_id == null) &&
            line.category === category
          );

        const currencyInputs = card.querySelectorAll('input[placeholder="$"]');
        const materialLine = byCategory('Materials');
        if (currencyInputs[0] && materialLine) currencyInputs[0].value = Number(materialLine.unit_price || 0);
        const hardwareLine = byCategory('Hardware');
        if (currencyInputs[1] && hardwareLine) currencyInputs[1].value = Number(hardwareLine.unit_price || 0);
        const accessoriesLine = byCategory('Accessories');
        if (currencyInputs[2] && accessoriesLine) currencyInputs[2].value = Number(accessoriesLine.unit_price || 0);
        const assemblyLine = byCategory('Assembly');
        if (currencyInputs[3] && assemblyLine) currencyInputs[3].value = Number(assemblyLine.unit_price || 0);
        const miscLine = byCategory('Adjustments');
        if (currencyInputs[4] && miscLine) currencyInputs[4].value = Number(miscLine.unit_price || 0);
        const shippingLine = byCategory('Shipping');
        if (currencyInputs[5] && shippingLine) currencyInputs[5].value = Number(shippingLine.unit_price || 0);

        const notesArea = card.querySelector('textarea');
        if (notesArea && details.notes) notesArea.value = details.notes;
      });
      d('cards rendered', document.querySelectorAll('#columnsHost .card').length);

      // Render preview/per-card totals (optional display hooks)
      try {
  const previewRes = await fetch('/api/bids/' + bidId + '/preview', opts);
        if (previewRes.ok) {
          const previewRows = await previewRes.json();
          if (Array.isArray(previewRows)) {
            renderPreviewTable(previewRows);
            renderPerCardTotals(previewRows);
            d('preview rows', previewRows.length);
          } else {
            d('preview rows', 'bad payload');
          }
        }
      } catch (err) {
        console.warn('preview load skipped', err);
      }

      window.currentBidId = bidId;
      togglePdfBtn();
      computeTotals();
      if (hint) hint.textContent = '';
    } catch (err) {
      console.error('[prefillBid]', err);
      if (hint) hint.textContent = '';
      showNotice('Error loading bid', 'error');
    }
  }
  
  await hydrateMe();
  await loadDepositOptions();
  
  // --- Populate datalists for Builder, Sales Person, Designer ---
  async function populateInputDatalist(dlId, optKey){
    const dl = document.getElementById(dlId);
    if (!dl) return;
    try {
      const opts = await ensureOptions(optKey);
      dl.innerHTML = '';
      opts.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.value_text || '';
        dl.appendChild(opt);
      });
    } catch(_) { /* ignore; still typeable */ }
  }
  
  await Promise.all([
    populateInputDatalist('dl-sales-person', 'sales_person'),
    populateInputDatalist('dl-designer', 'designer'),
    populateInputDatalist('dl-builder', 'builder')
  ]);
  
  // Wire auto-save on change for Builder, Sales Person, Designer
  function wireSaver(inputId, optKey){
    const inp = document.getElementById(inputId);
    if (!inp) return;
    inp.addEventListener('change', function(){
      const v = (inp.value || '').trim();
      if (v) saveOptionValue(optKey, v).catch(()=>{});
    });
  }
  wireSaver('builder_name', 'builder');
  wireSaver('sales_person', 'sales_person');
  wireSaver('designer', 'designer');
  
  autoWireTotals();

  if (window.currentBidId) {
    await prefillBid(window.currentBidId);
  } else {
    // seed one starter column card for new
    addColumn({ label:'Kitchen', units:1 });
  }
  computeTotals();
});
</script>

</body>
</html>`);
  });
}
