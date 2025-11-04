// pages/purchasingWorklist.js
import { requireRolePage } from "../routes/auth.js";

export default function registerPurchasingWorklist(app){
  app.get('/purchasing-worklist', requireRolePage(["admin","purchasing"]), (_req,res)=>{
    res.type('html').send(`<!doctype html><html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Purchasing Worklist</title>
<style>
  :root{ --bg:#0b0c10; --panel:#111318; --line:#212432; --text:#eef2ff; --muted:#9aa4b2; }
  body{background:var(--bg);color:var(--text);font-family:system-ui,Segoe UI,Roboto;margin:0}
  .wrap{max-width:1100px;margin:0 auto;padding:18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:10px}
  .tile{display:flex;gap:10px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:14px;background:#0f121a;text-decoration:none;color:var(--text)}
  .tile:hover{background:#0b1220}
  .muted{color:var(--muted);font-size:12px}
  .pill{padding:4px 8px;border-radius:999px;border:1px solid #334155;background:#0b1220;font-size:12px}
</style>
</head><body>
<link rel="stylesheet" href="/static/appbar.css">
<script src="/static/appbar.js"></script>
<script src="/static/purchasing-nav.js"></script>
<div class="wrap">
  <h2>Purchasing Worklist</h2>
  <div class="muted">Your hub for purchasing. Jump to the queue (bid-centric) or dashboard (PO-centric).</div>

  <div class="grid" style="margin-top:12px">
    <a class="tile" href="/purchasing-dashboard?tab=queue">
      <div style="font-size:22px">🧾</div>
      <div><b>Purchasing Queue</b><div class="muted">Edit manufacturer, due dates, and status</div></div>
    </a>
    <a class="tile" href="/purchasing-dashboard">
      <div style="font-size:22px">📦</div>
      <div><b>PO Dashboard</b><div class="muted">Track pending/ordered/received POs</div></div>
    </a>
  </div>

  <div style="margin-top:16px" class="muted">
    Notes:
    <ul>
      <li><span class="pill">Queue</span> updates bid-level purchasing status (waiting → po_sent → received).</li>
      <li><span class="pill">Dashboard</span> manages POs: place orders, set expected dates, and record receipts.</li>
    </ul>
  </div>
</div>
</body></html>`);
  });
}
 