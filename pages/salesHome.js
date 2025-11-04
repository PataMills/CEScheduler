// pages/salesHome.js
import { requireRolePage } from "../routes/auth.js";

export default function registerSalesHomePage(app) {
  app.get("/sales-home", requireRolePage(["sales","admin"]), (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sales Dashboard</title>
<link rel="stylesheet" href="/static/appbar.css">
<style>
body{margin:0;background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto}
.wrap{max-width:1100px;margin:80px auto;padding:0 20px}
h1{font-size:24px;margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:18px}
.card{background:#111318;border:1px solid #212432;border-radius:14px;padding:16px;transition:.2s}
.card:hover{background:#1a2033}
.card a{display:block;color:inherit;text-decoration:none}
.input{display:flex;gap:8px;margin:12px 0}
.input input{flex:1;padding:10px;border-radius:10px;border:1px solid #2a2f3f;background:#0f1220;color:#eef2ff}
.input button{padding:10px 14px;border-radius:12px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;cursor:pointer}
.table{background:#111318;border:1px solid #212432;border-radius:14px;padding:10px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px;border-bottom:1px solid #212432;font-size:14px;text-align:left}
.status{font-size:12px;opacity:.85}
.small{font-size:12px;color:#9aa4b2;margin-top:4px}
/* Top tile strip */
.tiles-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px}
.tile{display:flex;gap:10px;align-items:center;padding:14px;border:1px solid #212432;border-radius:12px;text-decoration:none;color:#eef2ff;background:#111318}
.tile:hover{background:#1a2033}
.tileIcon{font-size:20px;min-width:20px;text-align:center}
.tileHead{font-weight:700}
.tileSub{color:#9aa4b2;font-size:12px}

/* Status tiles (color accents) */
.tile.stat.wait  { border-color:#3a2c00;background:linear-gradient(0deg,#151107,#111318) }
.tile.stat.pay   { border-color:#331313;background:linear-gradient(0deg,#1a0e0e,#111318) }
.tile.stat.ready { border-color:#13331c;background:linear-gradient(0deg,#0f1912,#111318) }

</style>
</head><body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<link rel="stylesheet" href="/static/sales-nav.css">
<script src="/static/sales-nav.js"></script>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.createSalesNav)window.createSalesNav('home');});</script>

<div class="wrap">
  <h1>Sales Dashboard</h1>

  <div class="layout">
    <!-- LEFT: Recent for me -->
    <aside class="side">
      <h3 class="sideTitle">Recent (Mine)</h3>
      <div id="recentSidebar" class="sideList"></div>
    </aside>

    <!-- RIGHT: Main -->
    <main class="main">
      <!-- Action tiles -->
      <div class="tiles">
        <!-- New Quote -->
        <a class="tile" href="/sales-intake">
          <div class="tileIcon">➕</div>
          <div class="tileText">
            <div class="tileHead">New Quote</div>
            <div class="tileSub">Start a customer intake</div>
          </div>
        </a>
        <a class="tile" href="/sales-reschedule">
          <div class="tileIcon">🗓️</div>
          <div class="tileText">
            <div class="tileHead">Reschedule</div>
            <div class="tileSub">Request or approve changes</div>
          </div>
        </a>
        <a class="tile" href="/sales-service-schedule">
          <div class="tileIcon">🛠️</div>
          <div class="tileText">
            <div class="tileHead">Schedule Service</div>
            <div class="tileSub">Create & manage service</div>
          </div>
        </a>
        <a class="tile" href="/sales-console">
    <div class="tileIcon">📁</div>
    <div class="tileText">
      <div class="tileHead">Active Quotes</div>
      <div class="tileSub">Work your open quotes</div>
    </div>
  </a>

  <!-- Awaiting Acceptance -->
  <a class="tile stat wait" href="#" id="tileAwaiting">
    <div class="tileIcon">⏳</div>
    <div class="tileText">
      <div class="tileHead">Awaiting Acceptance</div>
      <div class="tileSub"><span id="statAwaiting">0</span> open</div>
    </div>
  </a>

  <!-- Awaiting Deposit -->
  <a class="tile stat pay" href="#" id="tileDeposit">
    <div class="tileIcon">💳</div>
    <div class="tileText">
      <div class="tileHead">Awaiting Deposit</div>
      <div class="tileSub"><span id="statDeposit">0</span> open</div>
    </div>
  </a>

  <!-- Ready to Schedule -->
  <a class="tile stat ready" href="/sales-console?tab=finish" id="tileReady">
    <div class="tileIcon">✅</div>
    <div class="tileText">
      <div class="tileHead">Ready</div>
      <div class="tileSub"><span id="statReady">0</span> jobs</div>
    </div>
  </a>
      </div>

      <!-- Compact weekly calendar -->
      <div class="panel">
        <div class="calHeader">
          <div class="row">
            <button class="btn" id="calPrev">‹</button>
            <div id="calRange" class="muted"></div>
            <button class="btn" id="calNext">›</button>
          </div>
          <div class="row">
            <select id="calFilter">
              <option value="mine" selected>My jobs</option>
              <option value="scheduled">All scheduled</option>
              <option value="projects">All projects</option>
            </select>
          </div>
        </div>
        <div id="calWeek" class="calWeek"></div>
        <div class="muted" style="margin-top:6px">
          Legend:
          <span class="pill p-mfg">Manufacturing</span>
          <span class="pill p-paint">Paint</span>
          <span class="pill p-asm">Assembly</span>
          <span class="pill p-del">Delivery</span>
          <span class="pill p-inst">Install</span>
          <span class="pill p-svc">Service</span>
        </div>
      </div>

      <!-- Search -->
      <div class="panel">
        <h3 style="margin:0 0 6px">Search</h3>
        <div class="row">
          <input id="q" placeholder="e.g., 291, Jane Smith, LGI Homes, pending" style="flex:1">
          <button class="btn" id="go">Search</button>
        </div>
        <div id="results" class="table" style="display:none; margin-top:8px">
          <table><thead><tr>
            <th>ID</th><th>Customer</th><th>Builder</th><th>Total</th><th>Status</th><th>Updated</th><th></th>
          </tr></thead><tbody></tbody></table>
        </div>
      </div>
    </main>
  </div>
</div>

<style>
  .wrap{max-width:1200px;margin:0 auto;padding:18px}
  .layout{display:grid;grid-template-columns:280px 1fr;gap:16px}
  @media (max-width:1000px){ .layout{grid-template-columns:1fr} .side{order:2} .main{order:1} }
  .panel{background:#111318;border:1px solid #212432;border-radius:14px;padding:12px 14px;margin:12px 0}
  .row{display:flex;gap:8px;align-items:center}
  .btn{padding:6px 10px;border-radius:10px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;cursor:pointer}
  .btn:hover{background:#222a44}
  .muted{color:#9aa4b2;font-size:12px}

  /* Sidebar */
  .sideTitle{margin:0 0 8px}
  .sideList{display:flex;flex-direction:column;gap:8px}
  .sideItem{display:flex;justify-content:space-between;gap:8px;padding:8px;border:1px solid #212432;border-radius:10px;background:#0f1220}
  .sideItem a{color:#eef2ff;text-decoration:none}
  .badge{display:inline-block;padding:2px 8px;border-radius:9999px;background:#132133;color:#c7d2fe;font-size:12px}

  /* Tiles */
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
  .tile{display:flex;gap:10px;align-items:center;padding:14px;border:1px solid #212432;border-radius:12px;text-decoration:none;color:#eef2ff;background:#111318}
  .tile:hover{background:#1a2033}
  .tileIcon{font-size:20px}
  .tileHead{font-weight:700}
  .tileSub{color:#9aa4b2;font-size:12px}

  /* Calendar */
  .calHeader{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .calWeek{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
  .day{border:1px solid #212432;border-radius:10px;background:#0f1220;min-height:80px;padding:6px;display:flex;flex-direction:column;gap:4px}
  .dayHead{display:flex;justify-content:space-between;font-size:12px;color:#9aa4b2}
  .pill{display:inline-block;padding:2px 6px;border-radius:9999px;font-size:11px;color:#fff}
  .p-mfg{background:#3b82f6}
  .p-paint{background:#8b5cf6}
  .p-asm{background:#f59e0b}
  .p-del{background:#14b8a6}
  .p-inst{background:#22c55e}
  .p-svc{background:#ef4444}

  /* Table */
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #212432;padding:10px 8px;text-align:left;font-size:14px}
</style>
<script src="/static/sales-home.js"></script>
</body></html>`);
  });
}
