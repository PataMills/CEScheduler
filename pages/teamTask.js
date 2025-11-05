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
// ===== SAFE BASELINE (ASCII only, no fancy quotes) =====

// 1) Global escape helper (works in module and non-module)
window.esc = window.esc || function (v) {
  var s = String(v == null ? "" : v);
  return s.replace(/[&<>"']/g, function(c){
    return c === "&" ? "&amp;" :
           c === "<" ? "&lt;"  :
           c === ">" ? "&gt;"  :
           c === "\"" ? "&quot;" :
                        "&#39;";
  });
};

// 2) Show any script error on the page (no silent "Loading...")
window.addEventListener("error", function(e){
  try {
    var msg = (e && (e.message || (e.error && e.error.message))) || "Unknown error";
    var host = document.getElementById("main") || document.body;
    host.insertAdjacentHTML("beforeend",
      "<div style=\"margin:12px;padding:10px;border:1px solid #933;background:#2a0f13;color:#ffd7d7;border-radius:8px\">" +
        "<div style=\"font-weight:600;margin-bottom:6px\">Script error</div>" +
        "<div class=\"small\" style=\"opacity:.9\">" + window.esc(msg) + "</div>" +
      "</div>"
    );
  } catch (_) {}
});

// 3) Small helpers
function $(sel){ return document.querySelector(sel); }
function getParam(name){ return new URLSearchParams(location.search).get(name); }
async function getJSON(url, opts){
  var r = await fetch(url, Object.assign({ credentials: "same-origin" }, (opts||{})));
  if (!r.ok) throw new Error(url + " -> HTTP " + r.status);
  return r.json();
}

// 4) Try several endpoints so a route mismatch will not brick the page
async function fetchTaskAny(id){
  var list = [
    "/api/team/task?id=" + encodeURIComponent(id),
    "/api/tasks/" + encodeURIComponent(id),
    "/api/task/" + encodeURIComponent(id)
  ];
  for (var i=0; i<list.length; i++){
    try { return await getJSON(list[i]); } catch(_) {}
  }
  throw new Error("No task API matched this id");
}

// 5) Render a simple, safe header + buttons
function renderBasic(t){
  var main = document.getElementById("main") || document.body;
  var customer = t.customer_name || t.job_name || t.name || ("Task " + (t.task_id || ""));
  var when = (t.window_start && t.window_end)
    ? (new Date(t.window_start).toLocaleString() + " - " + new Date(t.window_end).toLocaleString())
    : (t.start || t.date || "");
  var addr = t.address || t.site_address || "";
  var docs = Array.isArray(t.docs) ? t.docs : [];

  var html = "";
  html += "<div class=\"panel\" style=\"margin:12px\">";
  html +=   "<div style=\"font-weight:700;font-size:18px\">" + window.esc(customer) + "</div>";
  if (when) html += "<div class=\"muted small\" style=\"margin-top:4px\">" + window.esc(when) + "</div>";
  if (addr) html += "<div class=\"muted small\" style=\"margin-top:4px\">" + window.esc(addr) + "</div>";
  html +=   "<div class=\"row\" style=\"gap:8px;margin-top:12px\">";
  html +=     "<button class=\"btn\" id=\"bOTW\">On the way</button>";
  html +=     "<button class=\"btn\" id=\"bArr\">Arrived</button>";
  html +=     "<button class=\"btn\" id=\"bWip\">WIP</button>";
  html +=     "<button class=\"btn\" id=\"bDone\">Complete</button>";
  html +=   "</div>";
  html += "</div>";

  html += "<div class=\"panel\" style=\"margin:12px\">";
  html +=   "<div style=\"font-weight:600\">Documents</div>";
  html +=   "<div id=\"docs\" class=\"muted small\" style=\"margin-top:6px\">" + (docs.length ? "" : "No documents.") + "</div>";
  html += "</div>";

  main.innerHTML = html;

  if (docs.length) {
    var list = docs.map(function(d){
      return "<div><a target=\"_blank\" href=\"" + window.esc(d.url || "#") + "\">" + window.esc(d.name || d.file || "file") + "</a></div>";
    }).join("");
    var docsHost = document.getElementById("docs");
    if (docsHost) docsHost.innerHTML = list;
  }

  async function postStatus(path, body){
    var r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ when: new Date().toISOString() }, (body||{})))
    });
    if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
  }

  var id = t.task_id || t.id;
  var el;

  el = document.getElementById("bOTW");
  if (el) el.onclick = async function(){ try{ await postStatus("/api/tasks/" + id + "/ontheway"); }catch(e){ alert(e.message); } };

  el = document.getElementById("bArr");
  if (el) el.onclick = async function(){ try{ await postStatus("/api/tasks/" + id + "/arrived"); }catch(e){ alert(e.message); } };

  el = document.getElementById("bWip");
  if (el) el.onclick = async function(){ try{ await postStatus("/api/tasks/" + id + "/wip", { note: "" }); }catch(e){ alert(e.message); } };

  el = document.getElementById("bDone");
  if (el) el.onclick = function(){ try{ if (typeof openComplete === "function") openComplete(id); }catch(_){} };
}

// 6) Page bootstrap
async function boot(){
  var main = document.getElementById("main") || document.body;
  try{
    var id = getParam("id");
    if (!id) throw new Error("Missing ?id");
    main.innerHTML = "<div class=\"muted\">Loading...</div>";

    var taskObj = await fetchTaskAny(id);
    renderBasic(taskObj);

    // Optional: attempt extended view (non-blocking). Uncomment if you have it:
    // try {
    //   var ext = await getJSON("/api/tasks/team/" + encodeURIComponent(id));
    //   // renderExtended(ext); // your richer renderer, if/when ready
    // } catch(_) {}
  }catch(e){
    main.insertAdjacentHTML("beforeend",
      "<div style=\"margin:12px;padding:10px;border:1px solid #933;background:#2a0f13;color:#ffd7d7;border-radius:8px\">" +
        "<div style=\"font-weight:600;margin-bottom:6px\">Cannot load task</div>" +
        "<div class=\"small\" style=\"opacity:.9\">" + window.esc(e.message || String(e)) + "</div>" +
      "</div>"
    );
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", boot);

// ===== END SAFE BASELINE =====
  </script>
</body>
</html>`);
  });
}
