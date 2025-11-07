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
    .wrap{padding:12px 14px}
    .panel{background:#12172a;border:1px solid #222943;border-radius:12px;padding:12px}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .btn{background:#4051a3;color:#e9eefc;border:0;border-radius:10px;padding:10px 12px;font-weight:600}
    .btn.gray{background:#2b314f}
    .muted{opacity:.85}
    a.file{display:flex;justify-content:space-between;align-items:center;padding:10px;background:#0f1320;border:1px solid #222943;border-radius:10px;margin-top:8px;text-decoration:none;color:#e9eefc}
    #completeModal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:16px;z-index:50}
    #completeModal[hidden]{display:none}
    .sheet{background:#12172a;border:1px solid #222943;border-radius:12px;max-width:460px;width:100%;padding:14px}
    .kv{display:grid;grid-template-columns:120px 1fr;gap:6px 10px;font-size:14px}
    details > summary{cursor:pointer}
  </style>
</head>
<body>
  <div class="bar">
    <div style="font-weight:700">Team Task</div>
    <button id="btnSync" class="btn" style="background:#2e9157">Sync for offline</button>
  </div>

  <div id="main" class="wrap">
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
    // ---------- helpers ----------
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

    async function tryUrls(urls){
      for (var i=0;i<urls.length;i++){
        try { return await fetchJSON(urls[i]); } catch(_){}
      }
      return null;
    }

    // ---------- history (safe, auto-detect route) ----------
    async function loadHistory(limit){
      var id = encodeURIComponent(taskId);
      var urls = [
        '/api/tasks/' + id + '/history?limit=' + (limit||20),
        '/api/tasks/team/' + id + '/history?limit=' + (limit||20),
        '/api/task/' + id + '/history?limit=' + (limit||20)
      ];
      var data = await tryUrls(urls);
      if (!data || !Array.isArray(data)) return;
      var list = data.map(function(ev){
        var when = ev.at || ev.created_at || ev.time || '';
        var t = when ? new Date(when).toLocaleString() : '';
        var note = ev.note || ev.message || '';
        var who = ev.created_by || ev.user || '';
        var type = ev.event_type || ev.type || '';
        return '<div style="display:grid;grid-template-columns:140px 1fr;gap:6px 10px;margin:6px 0">' +
          '<div class="muted" style="font-size:12px">'+esc(t)+'</div>' +
          '<div><b>'+esc(type)+'</b>' + (who?(' — '+esc(who)):'') + (note?(' — '+esc(note)):'') + '</div>' +
        '</div>';
      }).join('');
      var host = $('historyList');
      if (host) host.innerHTML = list || '<div class="muted" style="font-size:12px">No history yet.</div>';
    }

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
      var id = encodeURIComponent(taskId);
      var bodies = JSON.stringify(Object.assign({ when:new Date().toISOString() }, body||{}));
      var opts = { method:'POST', headers:{'Content-Type':'application/json'}, body:bodies };
      var urls = [
        '/api/tasks/' + id + '/' + route,
        '/api/tasks/team/' + id + '/' + route
      ];
      // try both shapes
      for (var i=0;i<urls.length;i++){
        var u = urls[i];
        try{
          var r = await fetch(u, opts);
          if (r.ok) return r.json().catch(function(){ return {}; });
        }catch(_){}
      }
      throw new Error('Could not post event: ' + route);
    }

    // ---------- main load ----------
    async function load(){
      try{
        if(!taskId) throw new Error('Missing ?id');

        // GET probe: prefer richer team route but fall back to common shapes
        var id = encodeURIComponent(taskId);
        var t = await tryUrls([
          '/api/tasks/team/' + id,
          '/api/team/task?id=' + id,
          '/api/tasks/' + id,
          '/api/task/'  + id,
          '/api/install_tasks/' + id
        ]);
        if (!t) throw new Error('No task API matched this id.');

        // normalize
        var customer = t.customer_name || t.job_name || t.name || ('Task ' + taskId);
        var when = (t.window_start && t.window_end)
          ? (new Date(t.window_start).toLocaleString() + ' - ' + new Date(t.window_end).toLocaleString())
          : (t.start || t.date || '');
        var addr = t.address || t.site_address || '';
        var bid   = t.bid || {};
        var teams = Array.isArray(t.teams) ? t.teams : [];
        var files = Array.isArray(t.files) ? t.files : (Array.isArray(t.docs) ? t.docs : []);
        var hw    = Array.isArray(t.hardware) ? t.hardware : [];
        var notes = t.notes || '';

        // build UI
        var html = '';
        // Header + actions
        html += '<div class="panel">';
        html +=   '<div style="font-size:18px;font-weight:700">' + esc(customer) + '</div>';
        if (when) html += '<div class="muted" style="margin-top:4px;font-size:12px">' + esc(when) + '</div>';
        if (addr) html += '<div class="muted" style="margin-top:4px;font-size:12px">' + esc(addr) + '</div>';
        if (teams.length){
          var teamLine = teams.map(function(x){ return esc(x.resource_name || x.name || ''); }).filter(Boolean).join(', ');
          if (teamLine) html += '<div class="muted" style="margin-top:6px;font-size:12px">Team: ' + teamLine + '</div>';
        }
        html +=   '<div class="row" style="gap:8px;margin-top:12px">';
        html +=     '<button class="btn" id="bOTW">On the way</button>';
        html +=     '<button class="btn" id="bArr">Arrived</button>';
        html +=     '<button class="btn" id="bWip">WIP</button>';
        html +=     '<button class="btn" id="bDone">Complete</button>';
        html +=   '</div>';
        html += '</div>';

        // Contacts & Site (guarded)
        if (bid.sales_person || bid.sales_phone || bid.customer_name || bid.customer_phone || bid.address || bid.access){
          html += '<div class="panel" style="margin-top:12px">';
          html += '<div style="font-weight:700;margin-bottom:6px">Contacts & Site</div>';
          html += '<div class="kv">';
          if (bid.sales_person || bid.sales_phone)
            html += '<div>Sales</div><div><b>'+esc(bid.sales_person||'')+'</b>'+ (bid.sales_phone ? ' — '+esc(bid.sales_phone) : '') +'</div>';
          if (bid.customer_name || bid.customer_phone)
            html += '<div>Customer</div><div><b>'+esc(bid.customer_name||'')+'</b>'+ (bid.customer_phone ? ' — '+esc(bid.customer_phone) : '') +'</div>';
          if (bid.address) html += '<div>Address</div><div>'+esc(bid.address)+'</div>';
          if (bid.access)  html += '<div>Access</div><div>'+esc(bid.access)+'</div>';
          html += '</div></div>';
        }

        // Documents
        html += '<div class="panel" style="margin-top:12px">';
        html +=   '<div style="font-weight:600">Documents</div>';
        html +=   '<div id="docs" class="muted" style="margin-top:6px;font-size:12px">' + (files.length ? '' : 'No documents.') + '</div>';
        html += '</div>';

        // Hardware
        if (hw.length){
          html += '<div class="panel" style="margin-top:12px">';
          html += '<div style="font-weight:700;margin-bottom:6px">Hardware / Handles</div>';
          for (var i=0;i<hw.length;i++){
            var h = hw[i] || {};
            var line = [h.kind,h.model,h.finish,h.location].filter(Boolean).map(esc).join(' — ');
            html += '<div>'+ (line || esc(h.label||'Item')) +'</div>';
          }
          html += '</div>';
        }

        // Notes
        if (notes){
          html += '<div class="panel" style="margin-top:12px">';
          html += '<div style="font-weight:700;margin-bottom:6px">Notes</div>';
          html += '<div>'+esc(notes)+'</div>';
          html += '</div>';
        }

        // History container (lazy loaded)
        html += '<details class="panel" style="margin-top:12px"><summary style="font-weight:700">History</summary><div id="historyList" style="margin-top:10px" class="muted">Loading...</div></details>';

        main.innerHTML = html;

        // Docs inject
        if (files.length){
          $('docs').innerHTML = files.map(function(d){
            var label = esc(d.label || d.name || d.file || 'Document');
            var url   = esc(d.url || '#');
            return '<div><a class="file" target="_blank" rel="noopener" href="'+url+'">'+label+'<span>↗</span></a></div>';
          }).join('');
        }

        // Wire actions
        $('bOTW').onclick = async function(){ try{ await postTaskEvent('ontheway'); alert('On the way ✓'); await loadHistory(20); }catch(e){ showError(e.message); } };
        $('bArr').onclick = async function(){ try{ await postTaskEvent('arrived', { note:'' }); alert('Arrived ✓'); await loadHistory(20); }catch(e){ showError(e.message); } };
        $('bWip').onclick = async function(){
          var note = prompt('Note (optional)') || '';
          try{ await postTaskEvent('wip', { note: note }); alert('WIP ✓'); await loadHistory(20); }catch(e){ showError(e.message); }
        };
        $('bDone').onclick = function(){ openComplete(); };

        // Modal save
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

        // Lazy load history (does nothing if route absent)
        loadHistory(20);

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
          var r = await fetch('/api/tasks/team/' + encodeURIComponent(taskId)).catch(function(){});
          if (r && r.ok){
            var d = await r.json();
            var files = Array.isArray(d.files) ? d.files : [];
            await Promise.all(files.map(function(x){ return x && x.url ? fetch(x.url).catch(function(){}) : null; }));
          }
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
