// pages/adminContent.js
export default function registerAdminContent(app){
  app.get("/admin-content", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<link rel="stylesheet" href="/static/appbar.css"><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Admin Content</title>
<style>
:root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#8b93a3; }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial}
.wrap{max-width:900px;margin:0 auto;padding:22px}
h1{margin:0 0 10px;font-size:22px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin:12px 0}
label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
input,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0f1220;color:#eef2ff}
.btn{padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:#1a2033;color:#eef2ff;cursor:pointer}
.btn:hover{background:#222a44}
.grid{display:grid;gap:10px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.small{color:#8b93a3;font-size:12px}
</style>

<script src="/static/user-role.js"></script>
<div class="wrap">
  <h1>Admin Content</h1>
  <div class="small">These values flow into Sales Intake / Sales Quote.</div>

  <div class="panel">
    <div class="grid g2">
      <div><label>Company Name</label><input id="company_name"/></div>
      <div><label>Company Phone</label><input id="company_phone"/></div>
      <div><label>Company Email</label><input id="company_email"/></div>
    </div>

    <div style="margin-top:10px">
      <label>Quote Disclaimer</label>
      <textarea id="quote_disclaimer" rows="4"></textarea>
    </div>

    <div style="margin-top:10px">
      <label>Payment Terms</label>
      <textarea id="payment_terms" rows="4"></textarea>
    </div>

    <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
      <button class="btn" id="saveBtn">Save</button>
      <span class="small" id="status"></span>
    </div>
  </div>
</div>
<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>
<script>
const $=id=>document.getElementById(id);
async function load(){
  const r = await fetch('/api/admin-content'); const j = await r.json();
  ['company_name','company_phone','company_email','quote_disclaimer','payment_terms']
    .forEach(k=>{ if ($(k)) $(k).value = j[k] || ''; });
}
document.getElementById('saveBtn').onclick = async ()=>{
  const body = {
    company_name: $('company_name').value,
    company_phone: $('company_phone').value,
    company_email: $('company_email').value,
    quote_disclaimer: $('quote_disclaimer').value,
    payment_terms: $('payment_terms').value
  };
  $('status').textContent = 'Saving…';
  const r = await fetch('/api/admin-content', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  $('status').textContent = r.ok ? 'Saved ✓' : 'Save failed';
};
load();
</script>
</body></html>`);
  });
}

