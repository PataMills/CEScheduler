// pages/salesOnboarding.js
export default function registerSalesOnboarding(app) {
  app.get("/sales-onboarding", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Sales Onboarding</title>
  <style>
    :root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#8b93a3; }
    *{ box-sizing:border-box }
    body{ margin:0; background:var(--bg); color:var(--text); font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial }
    .wrap{ max-width:960px; margin:0 auto; padding:24px }
    h1{ margin:0 0 12px; font-size:22px }
    .panel{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; margin:14px 0 }
    label{ display:block; font-size:12px; color:var(--muted); margin-bottom:6px }
    input, textarea{ width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:#0f1220; color:#eef2ff; font-size:14px }
    textarea{ min-height:84px; resize:vertical }
    .grid{ display:grid; gap:12px }
    .g-2{ grid-template-columns: repeat(2, minmax(0,1fr)) }
    .g-3{ grid-template-columns: repeat(3, minmax(0,1fr)) }
    .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center }
    .btn{ padding:10px 14px; border-radius:12px; border:1px solid var(--line); background:#1a2033; color:#eef2ff; cursor:pointer }
    .btn:hover{ background:#222a44 }
    .muted{ color:var(--muted) }
    @media (max-width:780px){ .g-3{ grid-template-columns:1fr } .g-2{ grid-template-columns:1fr } }
    @media print { .wrap{ padding:0 } .btn{ display:none } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Onboarding — Project Information</h1>
    <div id="bidInfo" class="muted" style="margin-bottom:8px"></div>

    <!-- Non-redundant fields from Info Packet (Tab 2) -->
    <div class="panel">
      <div class="grid g-3">
        <div><label>Order Number</label><input id="info_order_no"/></div>
        <div><label>Island Dimension</label><input id="info_island_dim" placeholder='e.g., 84" x 42"'/></div>
        <div><label>Number of Cabinets</label><input id="info_num_cabs" type="number" min="0" step="1"/></div>
      </div>

      <div class="grid g-3">
        <div><label>Install Unit Count</label><input id="info_install_units" type="number" min="0" step="1"/></div>
        <div><label># Cabinets to Assemble</label><input id="info_to_assemble" type="number" min="0" step="1"/></div>
      </div>

      <div class="grid g-3">
        <div><label>Hardware Type (1)</label><input id="info_hw_type_1"/></div>
        <div><label>Model No (1)</label><input id="info_hw_model_1"/></div>
        <div><label>Unit Count (1)</label><input id="info_hw_units_1" type="number" min="0" step="1"/></div>
      </div>

      <div class="grid g-3">
        <div><label>Hardware Type (2)</label><input id="info_hw_type_2"/></div>
        <div><label>Model No (2)</label><input id="info_hw_model_2"/></div>
        <div><label>Unit Count (2)</label><input id="info_hw_units_2" type="number" min="0" step="1"/></div>
      </div>

      <div><label>Appliance Specs</label><textarea id="info_appliance_specs"></textarea></div>
      <div><label>Room / Plan Description</label><textarea id="info_room_desc"></textarea></div>
      <div><label>Notes</label><textarea id="info_notes"></textarea></div>
      <div><label>Specific Notes (per plan / hardware locations)</label><textarea id="info_specific_notes"></textarea></div>
    </div>

    <div class="row" style="justify-content:space-between">
      <button id="backBtn" class="btn">Back to Bid</button>
      <div class="row">
        <button id="saveBtn" class="btn">Save</button>
        <button id="printBtn" class="btn">Print</button>
      </div>
    </div>
  </div>

<script>
function $(id){ return document.getElementById(id); }
function getQuery(name){ return new URLSearchParams(location.search).get(name); }

async function loadExisting(){
  const bid = getQuery('bid');
  if (!bid) return;
  $('bidInfo').textContent = 'Bid #'+bid;

  try{
    const r = await fetch('/api/bids/'+bid);
    if (!r.ok) return;
    const data = await r.json();
    const ob = data.onboarding || {};
    const set = (k,v)=>{ const el=$(k); if(el) el.value = v ?? ''; };
    set('info_order_no', ob.order_no);
    set('info_island_dim', ob.island_dimension);
    set('info_num_cabs', ob.num_cabinets);
    set('info_install_units', ob.install_units);
    set('info_to_assemble', ob.to_assemble);
    set('info_hw_type_1', ob.hw_type_1);
    set('info_hw_model_1', ob.hw_model_1);
    set('info_hw_units_1', ob.hw_units_1);
    set('info_hw_type_2', ob.hw_type_2);
    set('info_hw_model_2', ob.hw_model_2);
    set('info_hw_units_2', ob.hw_units_2);
    set('info_appliance_specs', ob.appliance_specs);
    set('info_room_desc', ob.room_desc);
    set('info_notes', ob.notes);
    set('info_specific_notes', ob.specific_notes);
  }catch(e){}
}

async function save(){
  const bid = getQuery('bid');
  if (!bid) { alert('Missing bid id'); return; }
  const v = id => ($(id)?.value || '').trim();
  const onboarding = {
    order_no: v('info_order_no'),
    island_dimension: v('info_island_dim'),
    num_cabinets: v('info_num_cabs'),
    install_units: v('info_install_units'),
    to_assemble: v('info_to_assemble'),
    hw_type_1: v('info_hw_type_1'),
    hw_model_1: v('info_hw_model_1'),
    hw_units_1: v('info_hw_units_1'),
    hw_type_2: v('info_hw_type_2'),
    hw_model_2: v('info_hw_model_2'),
    hw_units_2: v('info_hw_units_2'),
    appliance_specs: v('info_appliance_specs'),
    room_desc: v('info_room_desc'),
    notes: v('info_notes'),
    specific_notes: v('info_specific_notes')
  };
  try{
    const r = await fetch('/api/bids/'+bid, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ onboarding })
    });
    if (!r.ok) throw new Error('HTTP '+r.status);
    alert('Onboarding saved for Bid #'+bid);
  }catch(e){
    alert('Save failed: ' + (e.message || e));
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  loadExisting();
  $('saveBtn').onclick = save;
  $('backBtn').onclick = ()=> {
    const bid = getQuery('bid');
    // go back to Sales Intake (adjust to your route if different)
    location.href = '/sales-intake';
  };
  $('printBtn').onclick = ()=> window.print();
});
</script>
</body>
</html>`);
  });
}
