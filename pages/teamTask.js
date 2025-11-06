// pages/teamTask.js
import { requireRolePage } from "../routes/auth.js";

export default function registerTeamTaskPage(app){
  app.get("/team/task", requireRolePage(["admin","ops","installer","service","manufacturing","assembly","delivery"]), async (req, res) => {
    // very light HTML, mobile-first, no build step
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>Task</title>
  <link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/lcVmVwAAAABJRU5ErkJggg==">
  <style>
    body{margin:0;background:#0f1320;color:#e9eefc;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif}
    .bar{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#111837;border-bottom:1px solid #222943;position:sticky;top:0;z-index:10}
    .wrap{padding:12px 14px}
    h1{font-size:18px;margin:0 0 6px}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .pill{display:inline-block;background:#1c2446;border-radius:999px;padding:6px 10px;font-size:12px;border:1px solid #2a3158}
    .btn{background:#4051a3;color:#e9eefc;border:0;border-radius:10px;padding:10px 12px;font-weight:600}
    .btn:disabled{opacity:.6}
    .kv{display:grid;grid-template-columns:120px 1fr;gap:6px 10px;font-size:14px}
    a.file{display:flex;justify-content:space-between;align-items:center;padding:10px;background:#0f1320;border:1px solid #222943;border-radius:10px;margin-top:8px;text-decoration:none;color:#e9eefc}
    .note{white-space:pre-wrap;line-height:1.35}
    .foot{padding:10px 14px;opacity:.6;font-size:12px}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .btn.gray{background:#2b314f}
    .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700}
    .badge.scheduled{background:#374151}
    .badge.en_route{background:#1e3a8a;color:#dbeafe;border:1px solid #3b82f6}
    .badge.in_progress{background:#1d4ed8;color:#e5e7eb;border:1px solid #3b82f6}
    .badge.wip{background:#92400e;color:#fde68a;border:1px solid #f59e0b}
    .badge.complete{background:#065f46;color:#bbf7d0;border:1px solid #10b981}
    #completeModal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:16px;z-index:50}
    #completeModal[hidden]{display:none}
    .sheet{background:#12172a;border:1px solid #222943;border-radius:12px;max-width:460px;width:100%;padding:14px}
  </style>
</head>
<body>
  <div class="bar">
    <div style="font-weight:700">Team Task</div>
    <button id="btnSync" class="btn" style="background:#2e9157">Sync for offline</button>
  </div>
  <div id="main">
  <div class="muted">Loading...</div>
  <div class="muted small">Tip: tap a document to open it. After "Sync for offline", this page and documents will be available without signal.</div>
  </div>

  <!-- Complete modal -->
  <div id="completeModal" hidden>
    <div class="sheet">
      <div style="font-weight:700;margin-bottom:6px">Complete with note</div>
  <textarea id="cm_note" rows="4" style="width:100%;padding:10px;border-radius:10px;border:1px solid #222943;background:#0f1320;color:#e9eefc" placeholder="Optional note..."></textarea>
      <input id="cm_photos" type="file" accept="image/*" multiple style="margin-top:10px"/>
      <div id="cm_hint" style="opacity:.7;font-size:12px;margin-top:6px">Attach up to 15 photos (&lt; 30 MB total).</div>
      <div class="row" style="justify-content:flex-end;margin-top:10px">
        <button id="cm_cancel" class="btn gray">Cancel</button>
        <button id="cm_save" class="btn">Save</button>
      </div>
    </div>
  </div>

  <script>
(function() {
  // Global escape helper (ASCII-only)
  window.esc = window.esc || function(v) {
    var s = String(v == null ? "" : v);
    return s.replace(/[&<>"']/g, function(c) {
      switch (c) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
        default: return c;
      }
    });
  };
})();
  </script>
</body>
</html>`);
  });
}
