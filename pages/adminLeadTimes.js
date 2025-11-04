// pages/adminLeadTimes.js
import { requireRolePage } from "../routes/auth.js";
export default function registerAdminLeadTimes(app) {
  app.get('/admin-lead-times', requireRolePage(['admin']), (_req, res) => {
    res.type('html').send(`<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin • Lead Times</title>
<link rel="stylesheet" href="/static/app.css">
<link rel="stylesheet" href="/static/appbar.css">
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
  .btn:hover{background:#0b1220}
  .footnote{ font-size:12px; color:#aab; line-height:1.4 }
  @media print{
    body{ background:#fff; color:#000 }
    .panel{ background:#fff; border:1px solid #ccc; color:#000 }
    .btn{ display:none }
    th, td{ border-color:#ddd }
    .summary{ border-color:#ccc }
  }
</style>
</head><body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<div class="wrap">
  <div class="panel">
    <h2>Manufacturer Lead Times</h2>

    <div class="row" style="margin:8px 0 16px">
      <input id="mfr"  class="inp" placeholder="Manufacturer (e.g., Patagonia)">
      <input id="base" class="inp" type="number" min="1" step="1" placeholder="Base days (e.g., 14)">
      <input id="avg"  class="inp" type="number" min="1" step="1" placeholder="Avg 90d (optional)">
      <input id="notes" class="inp" placeholder="Notes (optional)" style="flex:1">
      <button id="add"  class="btn">Save / Update</button>
    </div>

    <table class="tbl">
      <thead><tr>
        <th>Manufacturer</th><th>Base Days</th><th>Avg 90d</th><th>Notes</th><th>Updated</th><th></th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>

    <p class="muted">Tip: click any value to edit; changes auto-save.</p>
  </div>
</div>
<script src="/static/admin-nav.js"></script>
<script>
async function getJSON(u){const r=await fetch(u,{cache:'no-store'});return r.ok? r.json():[]}
async function upsert(row){ // POST upsert
  const b=await fetch('/api/bids/lead-times',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)});
  if(!b.ok) throw new Error('save_failed'); return b.json();
}
async function del(m){ await fetch('/api/bids/lead-times/'+encodeURIComponent(m),{method:'DELETE'}) }

function trItem(x){
  const tr=document.createElement('tr');

  // manufacturer (readonly key)
  const tdM=document.createElement('td'); tdM.textContent=x.manufacturer;

  // editable inputs
  const base=document.createElement('input'); base.type='number'; base.min='1'; base.step='1'; base.value=x.base_days; base.className='inp td-input';
  const avg =document.createElement('input'); avg.type='number';  avg.min='1';  avg.step='1';  avg.value= (x.avg_90d_days??''); avg.className='inp td-input';
  const notes=document.createElement('input'); notes.value=x.notes||''; notes.className='inp td-notes';

  // updated timestamp
  const tdU=document.createElement('td'); tdU.textContent=new Date(x.updated_at).toLocaleString();

  // delete button
  const delBtn=document.createElement('button'); delBtn.className='btn'; delBtn.textContent='Delete';
  delBtn.onclick=async()=>{ if(!confirm('Delete '+x.manufacturer+'?')) return; await del(x.manufacturer); await load(); };

  // auto-save handler (debounced)
  let t=null; async function scheduleSave(){
    clearTimeout(t); t=setTimeout(async()=>{
      const payload={
        manufacturer:x.manufacturer,
        base_days:Number(base.value||14),
        avg_90d_days:(avg.value===''? null : Number(avg.value)),
        notes:notes.value
      };
      const saved=await upsert(payload);
      tdU.textContent=new Date(saved.updated_at).toLocaleString();
    },300);
  }
  base.oninput=scheduleSave; avg.oninput=scheduleSave; notes.oninput=scheduleSave;

  // assemble row
  const tdB=document.createElement('td'); tdB.appendChild(base);
  const tdA=document.createElement('td'); tdA.appendChild(avg);
  const tdN=document.createElement('td'); tdN.appendChild(notes);
  const tdD=document.createElement('td'); tdD.appendChild(delBtn);

  tr.appendChild(tdM); tr.appendChild(tdB); tr.appendChild(tdA); tr.appendChild(tdN); tr.appendChild(tdU); tr.appendChild(tdD);
  return tr;
}

async function load(){
  const data=await getJSON('/api/bids/lead-times');
  const tb=document.getElementById('rows'); tb.innerHTML='';
  data.forEach(d=>tb.appendChild(trItem(d)));
}

document.getElementById('add').onclick=async()=>{
  const m=document.getElementById('mfr').value.trim();
  if(!m) return alert('Enter manufacturer');
  const base=Number(document.getElementById('base').value||14);
  const avgV=document.getElementById('avg').value;
  const notes=document.getElementById('notes').value;
  await upsert({manufacturer:m, base_days:base, avg_90d_days:(avgV===''? null:Number(avgV)), notes});
  document.getElementById('mfr').value=''; document.getElementById('base').value=''; document.getElementById('avg').value=''; document.getElementById('notes').value='';
  load();
};

load();
</script>
</body></html>
    `);
  });
}
