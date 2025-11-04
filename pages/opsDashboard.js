import { requireRolePage } from "../routes/auth.js";

export default function registerOpsDashboardPage(app) {
  app.get("/ops-dashboard", requireRolePage(["admin", "ops", "sales"]), (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ops Dashboard</title>
<link rel="stylesheet" href="/static/appbar.css">
<style>
  body{margin:0;background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto}
  .wrap{max-width:1400px;margin:0 auto;padding:24px}
  h1{margin:0 0 12px;font-size:24px;font-weight:600}
  .subtitle{color:#8b93a3;font-size:14px;margin-bottom:24px}
  .panel{background:#111318;border:1px solid #212432;border-radius:14px;padding:16px;margin:14px 0}
  .card{background:#151822;border:1px solid #212432;border-radius:12px;padding:14px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
  .card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.2)}
  .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .card-title{font-size:18px;font-weight:600}
  .card-subtitle{color:#8b93a3;font-size:13px}
  .chip{display:inline-block;padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:600;margin:4px}
  .chip.pending{background:#6b7280;color:#fff}
  .chip.ordered{background:#2563eb;color:#fff}
  .chip.received{background:#10b981;color:#fff}
  .chip.hold{background:#f59e0b;color:#000}
  .btn{padding:10px 14px;border-radius:12px;border:1px solid #212432;background:#1a2033;color:#eef2ff;cursor:pointer;font-size:14px;font-weight:500}
  .btn:hover{background:#222a44}
  .btn-sm{padding:6px 10px;font-size:13px}
  .needs-list{margin:10px 0;padding-left:20px}
  .needs-list li{margin:6px 0;color:#c9d1dd}
  .purchase-list{margin-top:10px}
  .purchase-item{background:#0f1220;border:1px solid #212432;border-radius:8px;padding:8px;margin:6px 0;font-size:13px}
  .empty{text-align:center;padding:40px;color:#8b93a3}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .muted{color:#8b93a3}
  .grid{display:grid;gap:14px}
</style>
</head>
<body>
<script src="/static/user-role.js"></script>
<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>

<div class="wrap">
  <h1>Ops Dashboard</h1>
  <div class="subtitle">Daily operational status: ops dashboard, late, unassigned, and purchasing hold jobs</div>

  <div class="row" style="gap:8px;margin:8px 0">
    <button class="btn btn-sm" data-tab="ops-dashboard">Ops Dashboard</button>
    <button class="btn btn-sm" data-tab="late">Late</button>
    <button class="btn btn-sm" data-tab="unassigned">Unassigned</button>
    <button class="btn btn-sm" data-tab="purchasing">Purchasing Hold</button>
  </div>

  <div class="panel">
    <div class="row" style="justify-content:space-between">
      <div id="status" class="muted">Loading...</div>
      <button class="btn" id="btnRefresh">🔄 Refresh</button>
    </div>
  </div>

  <div id="jobs" class="grid"></div>
</div>

<script src="/static/ops-dashboard.js"></script>
</body></html>`);
  });
}
