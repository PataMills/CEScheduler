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
(function(){
  // Global escape helper (ASCII-only)
  window.esc = window.esc || function(v){
    var s = String(v == null ? "" : v);
    return s.replace(/[&<>'"]/g, function(c){
      return c === "&" ? "&amp;" :
             c === "<" ? "&lt;" :
             c === ">" ? "&gt;" :
             c === "\"" ? "&quot;" :
                            "&#39;";
    });
  };

  var esc = window.esc;
  var currentTaskId = null;

  function byId(id){ return document.getElementById(id); }

  function appendError(message){
    var host = byId("main") || document.body;
    host.insertAdjacentHTML("beforeend",
      "<div style=\"margin:12px;padding:10px;border:1px solid #933;background:#2a0f13;color:#ffd7d7;border-radius:8px\">" +
        "<div style=\"font-weight:600;margin-bottom:6px\">Problem</div>" +
        "<div class=\"small\" style=\"opacity:.9\">" + esc(message || "Unexpected error") + "</div>" +
      "</div>"
    );
  }

  window.addEventListener("error", function(evt){
    try {
      var msg = (evt && (evt.message || (evt.error && evt.error.message))) || "Unknown script error";
      appendError("Script error: " + msg);
    } catch (_) {}
  });

  function getParam(name){
    return new URLSearchParams(location.search).get(name);
  }

  async function fetchJSON(url, opts){
    var response = await fetch(url, Object.assign({ credentials: "same-origin" }, opts || {}));
    if (!response.ok) throw new Error(url + " HTTP " + response.status);
    return response.json();
  }

  async function fetchTaskAny(id){
    var urls = [
      "/api/team/task?id=" + encodeURIComponent(id),
      "/api/tasks/" + encodeURIComponent(id),
      "/api/task/" + encodeURIComponent(id)
    ];
    for (var i = 0; i < urls.length; i++){
      try {
        return await fetchJSON(urls[i]);
      } catch (_) {}
    }
    throw new Error("No task API matched this id.");
  }

  function formatDate(dt){
    if (!dt) return "";
    try {
      return new Date(dt).toLocaleString();
    } catch (_) {
      return String(dt);
    }
  }

  function buildDocsList(docs){
    return docs.map(function(doc){
      var url = esc(doc && doc.url ? doc.url : "#");
      var label = esc(doc && (doc.name || doc.file) ? (doc.name || doc.file) : "file");
      return "<div><a target=\"_blank\" href=\"" + url + "\">" + label + "</a></div>";
    }).join("");
  }

  function sendStatus(id, route, body){
    if (!id) {
      appendError("Missing task id for status update.");
      return;
    }
    fetch("/api/tasks/" + encodeURIComponent(id) + "/" + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ when: new Date().toISOString() }, body || {}))
    }).then(function(res){
      if (!res.ok) throw new Error("HTTP " + res.status);
    }).catch(function(err){
      appendError("Status update failed: " + (err && err.message ? err.message : String(err)));
    });
  }

  function renderBasic(task){
    var main = byId("main") || document.body;
    var customer = task.customer_name || task.job_name || task.name || ("Task " + (task.task_id || ""));
    var when = "";
    if (task.window_start && task.window_end) {
      when = formatDate(task.window_start) + " - " + formatDate(task.window_end);
    } else if (task.start) {
      when = String(task.start);
    } else if (task.date) {
      when = String(task.date);
    }
    var addr = task.address || task.site_address || "";
    var docs = Array.isArray(task.docs) ? task.docs : [];

    var html = "";
    html += "<div class=\"panel\" style=\"margin:12px\">";
    html +=   "<div style=\"font-weight:700;font-size:18px\">" + esc(customer) + "</div>";
    if (when) html += "<div class=\"muted small\" style=\"margin-top:4px\">" + esc(when) + "</div>";
    if (addr) html += "<div class=\"muted small\" style=\"margin-top:4px\">" + esc(addr) + "</div>";
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
      var docsHost = byId("docs");
      if (docsHost) docsHost.innerHTML = buildDocsList(docs);
    }

    var id = task.task_id || task.id || currentTaskId;
    currentTaskId = id;

    var btn = byId("bOTW");
    if (btn) btn.onclick = function(){ sendStatus(id, "ontheway"); };

    btn = byId("bArr");
    if (btn) btn.onclick = function(){ sendStatus(id, "arrived"); };

    btn = byId("bWip");
    if (btn) btn.onclick = function(){ sendStatus(id, "wip", { note: "" }); };

    btn = byId("bDone");
    if (btn) btn.onclick = function(){ openComplete(id); };
  }

  function openComplete(id){
    currentTaskId = id || currentTaskId;
    var modal = byId("completeModal");
    if (!modal) return;
    modal.hidden = false;
    var note = byId("cm_note");
    if (note) note.value = "";
    var photos = byId("cm_photos");
    if (photos) photos.value = "";
    var hint = byId("cm_hint");
    if (hint) hint.textContent = "Attach up to 15 photos (< 30 MB total).";
  }

  function closeComplete(){
    var modal = byId("completeModal");
    if (modal) modal.hidden = true;
  }

  function readFilesAsDataURLs(list, maxFiles, maxBytes){
    var files = [];
    if (list && typeof list.length === "number"){
      for (var i = 0; i < list.length && files.length < maxFiles; i++){
        files.push(list[i]);
      }
    }
    var total = 0;
    for (var j = 0; j < files.length; j++){
      total += files[j].size || 0;
    }
    if (total > maxBytes) throw new Error("Photos exceed 30 MB total.");
    return Promise.all(files.map(function(file){
      return new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onload = function(){ resolve({ name: file.name, type: file.type, size: file.size, data: reader.result }); };
        reader.onerror = function(){ reject(new Error("Failed to read " + file.name)); };
        reader.readAsDataURL(file);
      });
    }));
  }

  async function submitComplete(){
    var id = currentTaskId;
    if (!id) return;
    try {
      var noteEl = byId("cm_note");
      var photosEl = byId("cm_photos");
      var photos = await readFilesAsDataURLs(photosEl ? photosEl.files : [], 15, 30 * 1024 * 1024);
      var payload = {
        note: noteEl ? (noteEl.value || "") : "",
        photos: photos,
        when: new Date().toISOString()
      };
      var response = await fetch("/api/tasks/" + encodeURIComponent(id) + "/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      closeComplete();
      alert("Task marked complete.");
    } catch (err) {
      alert("Complete failed: " + (err && err.message ? err.message : String(err)));
    }
  }

  function wireCompleteModal(){
    document.addEventListener("click", function(evt){
      if (!evt || !evt.target) return;
      if (evt.target.id === "cm_cancel") {
        closeComplete();
      }
      if (evt.target.id === "cm_save") {
        submitComplete();
      }
    });
  }

  async function syncOffline(){
    try {
      if ("serviceWorker" in navigator) {
        await navigator.serviceWorker.register("/sw-team.js", { scope: "/" });
      }
      await fetch(location.href).catch(function(){});
      if (currentTaskId) {
        await fetch("/api/tasks/team/" + encodeURIComponent(currentTaskId)).catch(function(){});
      }
      alert("Sync complete. This page is cached for offline use.");
    } catch (err) {
      alert("Sync failed: " + (err && err.message ? err.message : String(err)));
    }
  }

  function wireSyncButton(){
    var btn = byId("btnSync");
    if (btn) btn.addEventListener("click", syncOffline);
  }

  async function boot(){
    var main = byId("main") || document.body;
    main.innerHTML = "<div class=\"muted\">Loading...</div>";
    try {
      var id = getParam("id");
      if (!id) throw new Error("Missing ?id");
      currentTaskId = id;
      var taskObj = await fetchTaskAny(id);
      renderBasic(taskObj);
    } catch (err) {
      appendError(err && err.message ? err.message : String(err));
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", function(){
    wireCompleteModal();
    wireSyncButton();
    boot();
  });
})();
  </script>
</body>
</html>`);
  });
}
