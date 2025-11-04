export default function registerAdminOptions(app) {
  app.get(["/admin/options", "/admin-options", "/admin/data"], (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Dropdown Data Management</title>
  <link rel="stylesheet" href="/static/appbar.css">
  <script src="/static/appbar.js"></script>
  <script src="/static/user-role.js"></script>
  <script src="/static/admin-nav.js"></script>
  <style>
    body { background: #181a20; color: #f3f4f6; font-family: ui-sans-serif, system-ui, Segoe UI, Arial; margin: 0; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 32px; }
    h1 { font-size: 2rem; margin-bottom: 18px; }
    .panel { background: #23263a; border-radius: 12px; padding: 18px; margin-bottom: 24px; box-shadow: 0 2px 8px #0002; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { padding: 8px 10px; border: 1px solid #2d3148; }
    th { background: #23263a; color: #a5b4fc; }
    input, select { background: #181a20; color: #f3f4f6; border: 1px solid #2d3148; border-radius: 6px; padding: 6px 8px; }
    .row { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
    .btn { background: #23263a; color: #a5b4fc; border: 1px solid #2d3148; border-radius: 8px; padding: 6px 14px; cursor: pointer; }
    .btn:hover { background: #2d3148; }
    .danger { color: #ef4444; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Dropdown Data Management</h1>

    <!-- Crews -->
    <div class="panel" id="crewPanel" style="display:none">
      <h2>Crew / Team Management</h2>
      <table id="crewTbl"><thead>
        <tr><th>Name</th><th>Team</th><th>Capacity (min/day)</th><th>Active</th><th></th></tr>
      </thead><tbody></tbody></table>
      <div class="row">
        <button id="addCrew" class="btn">+ Add Crew</button>
        <button id="saveCrew" class="btn">Save</button>
      </div>
    </div>

    <!-- Dropdowns -->
    <div class="panel">
      <label for="setKey">Dropdown:</label>
      <select id="setKey">
        <option value="__crews__">Crews / Teams</option>
        <option value="team_kind">Team Kind</option>
        <option value="deposit_pct">Deposit %</option>
        <option value="manufacturer">Manufacturer</option>
        <option value="species">Wood Species</option>
        <option value="door_style">Door Style</option>
        <option value="finish_color">Stain/Paint Color</option>
        <option value="hardware">Hardware</option>
        <option value="accessory">Accessories & Parts</option>
        <option value="room">Room/Plan Description</option>
        <option value="sales_person">Sales Person</option>
        <option value="builder">Builder</option>
      </select>
      <button id="loadBtn" class="btn">Load</button>
    </div>

    <div class="panel" id="optsValuesPanel">
      <h2 id="setLabel"></h2>
      <table id="tbl"><thead>
        <tr><th>Order</th><th>Text</th><th>Number</th><th></th></tr>
      </thead><tbody></tbody></table>
      <div class="row">
        <button id="addRow" class="btn">+ Add Row</button>
        <button id="save" class="btn">Save</button>
      </div>
    </div>

    <div class="panel" id="debugPanel" style="margin-top:24px;">
      <h3>Debug: Raw API Response</h3>
      <pre id="debugRaw" style="background:#181a20;color:#a5b4fc;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px;"></pre>
    </div>

    <div class="panel" style="margin-top:24px;">
      <h3>Roles & Access</h3>
      <div style="font-size:13px;line-height:1.8">
        <div><b>admin</b> → All pages & features</div>
        <div><b>sales</b> → Sales Home, Intake, Details, Quote, Review</div>
        <div><b>ops</b> → Schedule, Ops Dashboard, Calendar</div>
        <div><b>installer, service, manufacturing, assembly, delivery</b> → My Day (Teams), Team Task</div>
      </div>
    </div>
  </div>

  <script>
    // ============ CREWS ============
    async function loadCrews() {
      const [crewRes, kindsRes] = await Promise.all([
        fetch('/api/crews'),
        fetch('/api/options/team_kind')
      ]);
      const crews = await crewRes.json();
      let kinds = await kindsRes.json();
      kinds = Array.isArray(kinds) ? kinds : [];
      if (!kinds.length) kinds = [
        {value_text:'Install'},{value_text:'Service'},{value_text:'Delivery'},
        {value_text:'Manufacturing'},{value_text:'Assembly'},{value_text:'Paint'},
        {value_text:'Field'},{value_text:'Shop'}
      ];
      window.__teamKinds = kinds.map(k=>k.value_text||k.value||'Install');
      
      const tbody = document.getElementById('crewTbl').querySelector('tbody');
      tbody.innerHTML = '';
      (Array.isArray(crews) ? crews : []).forEach(c => {
        const tr = document.createElement('tr');
        tr.dataset.id = c.id || '';
        const tdName = document.createElement('td');
        tdName.innerHTML = '<input value="'+(c.name||'')+'" style="width:180px">';
        const tdTeam = document.createElement('td');
        const sel = document.createElement('select'); sel.style.width='140px';
        window.__teamKinds.forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; sel.appendChild(o); });
        sel.value = String(c.team||'');
        tdTeam.appendChild(sel);
        const tdCap = document.createElement('td');
        tdCap.innerHTML = '<input type="number" step="1" min="0" value="'+(c.capacity_min_per_day||'')+'" style="width:140px">';
        const tdAct = document.createElement('td'); tdAct.style.textAlign='center';
        tdAct.innerHTML = '<input type="checkbox" '+((c.active!==false)?'checked':'')+'>';
        const tdDel = document.createElement('td');
        tdDel.innerHTML = '<button class="btn danger" onclick="confirmDeleteCrew(this)">Delete</button>';
        tr.appendChild(tdName); tr.appendChild(tdTeam); tr.appendChild(tdCap); tr.appendChild(tdAct); tr.appendChild(tdDel);
        tbody.appendChild(tr);
      });
    }

    document.getElementById('addCrew').addEventListener('click', () => {
      const tr = document.createElement('tr');
      const tdName = document.createElement('td');
      tdName.innerHTML = '<input value="" style="width:180px">';
      const tdTeam = document.createElement('td');
      const sel = document.createElement('select'); sel.style.width='140px';
      (window.__teamKinds||['Install','Service','Delivery','Manufacturing','Assembly','Paint','Field','Shop']).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; sel.appendChild(o); });
      tdTeam.appendChild(sel);
      const tdCap = document.createElement('td');
      tdCap.innerHTML = '<input type="number" step="1" min="0" value="" style="width:140px">';
      const tdAct = document.createElement('td'); tdAct.style.textAlign='center';
      tdAct.innerHTML = '<input type="checkbox" checked>';
      const tdDel = document.createElement('td');
      tdDel.innerHTML = '<button class="btn danger" onclick="confirmDeleteCrew(this)">Delete</button>';
      tr.appendChild(tdName); tr.appendChild(tdTeam); tr.appendChild(tdCap); tr.appendChild(tdAct); tr.appendChild(tdDel);
      document.getElementById('crewTbl').querySelector('tbody').appendChild(tr);
    });

    window.confirmDeleteCrew = function(btn){
      if (confirm('Remove this crew/team? It will be permanently deleted after you click Save.')) {
        const tr = btn.closest('tr');
        if (tr) tr.remove();
      }
    };

    document.getElementById('saveCrew').addEventListener('click', async () => {
      const rows = Array.from(document.getElementById('crewTbl').querySelectorAll('tbody tr')).map(tr => {
        const inputs = tr.querySelectorAll('input');
        const teamSel = tr.querySelector('select');
        return {
          id: tr.dataset.id ? Number(tr.dataset.id) : undefined,
          name: inputs[0].value,
          team: teamSel ? teamSel.value : '',
          capacity_min_per_day: inputs[1].value ? Number(inputs[1].value) : null,
          active: inputs[2].checked
        };
      });
      await fetch('/api/crews', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ crews: rows })
      });
      alert('Saved.');
      loadCrews();
    });

    // initial crews load
    loadCrews();

    // ============ DROPDOWNS / TOGGLE UI ============
    const $ = id => document.getElementById(id);

    async function load() {
      const key = $('setKey').value;
      const isCrews = (key === '__crews__');
      // toggle panels
      $('crewPanel').style.display = isCrews ? '' : 'none';
      $('optsValuesPanel').style.display = isCrews ? 'none' : '';
      $('debugPanel').style.display = isCrews ? 'none' : '';
      if (isCrews) { await loadCrews(); return; }

      $('setLabel').textContent = key;

      const r = await fetch('/api/options/' + key);
      const raw = await r.json();

      // show raw for debugging
      document.getElementById('debugRaw').textContent = JSON.stringify(raw, null, 2);

      // accept either { options:[...] } or a bare array
      const list = Array.isArray(raw && raw.options) ? raw.options : (Array.isArray(raw) ? raw : []);

      // normalize fields to table schema
      const mapped = list.map(v => ({
        sort_order: (v.sort != null ? v.sort : (v.sort_order != null ? v.sort_order : 0)),
        value_text: (v.value != null ? v.value : (v.value_text != null ? v.value_text : '')),
        value_num:  (v.num != null ? v.num : (v.value_num != null ? v.value_num : null))
      }));

      const tbody = $('tbl').querySelector('tbody');
      tbody.innerHTML = '';

      (mapped.length ? mapped : [{ sort_order: 1, value_text: '', value_num: null }])
        .forEach(v => {
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td><input type="number" value="' + (v.sort_order||0) + '" style="width:60px"></td>' +
            '<td><input value="' + (v.value_text||'') + '" style="width:220px"></td>' +
            '<td><input type="number" step="0.0001" value="' + (v.value_num||'') + '" style="width:120px"></td>' +
            '<td><button class="btn danger" onclick="confirmDelete(this)">Delete</button></td>';
          tbody.appendChild(tr);
        });
    }

    $('loadBtn').addEventListener('click', load);
    document.getElementById('setKey').addEventListener('change', load);

    $('addRow').addEventListener('click', () => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="number" value="0" style="width:60px"></td>' +
        '<td><input value="" style="width:220px"></td>' +
        '<td><input type="number" step="0.0001" value="" style="width:120px"></td>' +
        '<td><button class="btn danger" onclick="confirmDelete(this)">Delete</button></td>';
      $('tbl').querySelector('tbody').appendChild(tr);
    });

    window.confirmDelete = function(btn){
      if (confirm('Remove this option? It will be permanently deleted after you click Save.')) {
        const tr = btn.closest('tr');
        if (tr) tr.remove();
      }
    };

    $('save').addEventListener('click', async () => {
      const key = $('setKey').value;
      const rows = Array.from($('tbl').querySelectorAll('tbody tr')).map(tr => {
        const tds = tr.querySelectorAll('input');
        return {
          sort_order: Number(tds[0].value || 0),
          value_text: tds[1].value,
          value_num:  tds[2].value ? Number(tds[2].value) : null
        };
      });
      await fetch('/api/options/' + key, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ label: key, values: rows })
      });
      alert('Saved.');
      load();
    });

    // initial load
    load();
  </script>
</body>
</html>`);
  });
}
