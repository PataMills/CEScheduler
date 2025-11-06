// pages/teamTask.js
import { requireRolePage } from "../routes/auth.js";

export default function registerTeamTaskPage(app){
  app.get(
    "/team/task",
    requireRolePage(["admin","ops","installer","service","manufacturing","assembly","delivery"]),
    async (_req, res) => {
      res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>Team Task</title>
  <style>
    :root { color-scheme: dark; }
    body{margin:0;background:#0f1320;color:#e9eefc;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,'Helvetica Neue',Arial,sans-serif}
    .bar{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#111837;border-bottom:1px solid #222943;position:sticky;top:0;z-index:10}
    .panel{background:#12172a;border:1px solid #222943;border-radius:12px;padding:12px}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .btn{background:#4051a3;color:#e9eefc;border:0;border-radius:10px;padding:10px 12px;font-weight:600}
    .btn.gray{background:#2b314f}
    .muted{opacity:.85}
    a.file{display:flex;justify-content:space-between;align-items:center;padding:10px;background:#0f1320;border:1px solid #222943;border-radius:10px;margin-top:8px;text-decoration:none;color:#e9eefc}
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

  <div id="main" style="padding:12px 14px">
    <div class="muted">Loading...</div>
    <div class="muted" style="font-size:12px">Tip: tap a document to open it. After "Sync for offline", this page and documents will be available without signal.</div>
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
    // ---------- tiny utils ----------
    function esc(v){
      var s = String(v == null ? '' : v);
      return s.replace(/[&<>"']/g, function(c){
        switch (c) {
          case '&': return '&amp;';
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case "'": return '&#39;';
          default: return c;
        }
      });
    }
    var $ = function(id){ return document.getElementById(id); };
    var qs = new URLSearchParams(location.search);
    var taskId = qs.get('id');
    var main = $('main');

    function showError(msg){
      var html =
        '<div class="panel" style="margin-top:12px;border-color:#5b1e22;background:#2a0f13;color:#ffd7d7">' +
          '<div style="font-weight:700;margin-bottom:6px">Can\\'t load task</div>' +
          '<div class="muted" style="font-size:12px">'+ esc(msg || 'Unknown error') +'</div>' +
        '</div>';
      main.insertAdjacentHTML('beforeend', html);
    }

    async function fetchJSON(u){
      var r = await fetch(u, { credentials:'same-origin' });
      if(!r.ok) throw new Error(u + ' -> HTTP ' + r.status);
      return r.json();
    }

    // ---------- history (no-op stub so buttons don’t error) ----------
    async function loadHistory(_limit){ /* wired later */ }

    // ---------- modal ----------
    function openComplete(){
      $('completeModal').hidden = false;
      $('cm_note').value = '';
      $('cm_photos').value = '';
      $('cm_hint').textContent = 'Attach up to 15 photos (< 30 MB total).';
    }
    function closeComplete(){ $('completeModal').hidden = true; }
    document.addEventListener('click', function(e){
      if (e.target && e.target.id === 'cm_cancel') closeComplete();
    });

    function readFilesAsDataURLs(fileList, opts){
      opts = opts || {};
      var maxFiles = opts.maxFiles || 15;
      var maxTotalBytes = opts.maxTotalBytes || (30*1024*1024);
      var files = Array.prototype.slice.call(fileList || [], 0, maxFiles);
      var total = files.reduce(function(s,f){return s+f.size;}, 0);
      if (total > maxTotalBytes) throw new Error('Photos > 30 MB total');
      return Promise.all(files.map(function(f){
        return new Promise(function(res, rej){
          var r = new FileReader();
          r.onload = function(){ res({ name:f.name, type:f.type, size:f.size, data:r.result }); };
          r.onerror = rej;
          r.readAsDataURL(f);
        });
      }));
    }

    async function postTaskEvent(route, body){
      var r = await fetch('/api/tasks/' + encodeURIComponent(taskId) + '/' + route, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(Object.assign({ when:new Date().toISOString() }, body || {}))
      });
      if (!r.ok) {
        var j = null; try { j = await r.json(); } catch(_){}
        throw new Error((j && (j.message||j.error)) || ('HTTP ' + r.status));
      }
      return r.json().catch(function(){ return {}; });
    }

    // ---------- main load ----------
    async function load(){
      try{
        if(!taskId) throw new Error('Missing ?id');
        // probe likely endpoints until one works
        var t = await (async function(){
          var urls = [
            '/api/team/task?id=' + encodeURIComponent(taskId),
            '/api/tasks/' + encodeURIComponent(taskId),
            '/api/task/'  + encodeURIComponent(taskId)
          ];
          for (var i=0;i<urls.length;i++){
            try { return await fetchJSON(urls[i]); } catch(_){}
          }
          throw new Error('No task API matched this id.');
        })();

        // normalize
        var customer = t.customer_name || t.job_name || t.name || ('Task ' + taskId);
        var when = (t.window_start && t.window_end)
          ? (new Date(t.window_start).toLocaleString() + ' – ' + new Date(t.window_end).toLocaleString())
          : (t.start || t.date || '');
        var addr = t.address || t.site_address || '';
        var docs = Array.isArray(t.docs) ? t.docs : [];

        // build HTML
        var html = '';
        html += '<div class="panel">';
        html +=   '<div style="font-size:18px;font-weight:700">' + esc(customer) + '</div>';
        if (when) html += '<div class="muted" style="margin-top:4px;font-size:12px">' + esc(when) + '</div>';
        if (addr) html += '<div class="muted" style="margin-top:4px;font-size:12px">' + esc(addr) + '</div>';
        html +=   '<div class="row" style="gap:8px;margin-top:12px">';
        html +=     '<button class="btn" id="bOTW">On the way</button>';
        html +=     '<button class="btn" id="bArr">Arrived</button>';
        html +=     '<button class="btn" id="bWip">WIP</button>';
        html +=     '<button class="btn" id="bDone">Complete</button>';
        html +=   '</div>';
        html += '</div>';

        html += '<div class="panel" style="margin-top:12px">';
        html +=   '<div style="font-weight:600">Documents</div>';
        html +=   '<div id="docs" class="muted" style="margin-top:6px;font-size:12px">' + (docs.length ? '' : 'No documents.') + '</div>';
        html += '</div>';

        main.innerHTML = html;

        if (docs.length){
          var docHTML = docs.map(function(d){
            return '<div><a class="file" target="_blank" href="' + esc(d.url||'#') + '">' + esc(d.name||d.file||'file') + '<span>↗</span></a></div>';
          }).join('');
          $('docs').innerHTML = docHTML;
        }

        // wire buttons
        $('bOTW').onclick = async function(){
          try { await postTaskEvent('ontheway'); alert('On the way ✓'); await loadHistory(20); }
          catch(e){ showError(e.message); }
        };
        $('bArr').onclick = async function(){
          try { await postTaskEvent('arrived', { note:'' }); alert('Arrived ✓'); await loadHistory(20); }
          catch(e){ showError(e.message); }
        };
        $('bWip').onclick = async function(){
          var note = prompt('Note (optional)') || '';
          try { await postTaskEvent('wip', { note: note }); alert('WIP ✓'); await loadHistory(20); }
          catch(e){ showError(e.message); }
        };
        $('bDone').onclick = function(){ openComplete(); };

        // modal save
        document.addEventListener('click', async function(e){
          if (e.target && e.target.id === 'cm_save'){
            try{
              var photos = await readFilesAsDataURLs(($('cm_photos').files || []), { maxFiles:15, maxTotalBytes:30*1024*1024 });
              var note   = $('cm_note').value || '';
              await postTaskEvent('complete', { note: note, photos: photos });
              closeComplete();
              alert('Completed ✓');
              await loadHistory(20);
            }catch(err){
              alert('Complete failed: ' + (err && err.message || err));
            }
          }
        });

      }catch(e){
        console.error(e);
        showError(e.message);
      }
    }

    // ---------- offline sync ----------
    $('btnSync').addEventListener('click', async function(){
      try{
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.register('/sw-team.js', { scope: '/' });
        }
        await fetch(location.href).catch(function(){});
        if (taskId){
          var r = await fetch('/api/tasks/team/' + taskId);
          var d = await r.json();
          var files = Array.isArray(d.files) ? d.files : [];
          await Promise.all(files.map(function(x){ return x && x.url ? fetch(x.url).catch(function(){}) : null; }));
          alert('Synced. You can open this page offline.');
        } else {
          alert('Synced page.');
        }
      }catch(e){
        alert('Sync failed: ' + e.message);
      }
    });

    document.addEventListener('DOMContentLoaded', load);
  </script>
</body>
</html>`);
    }
  );
}
