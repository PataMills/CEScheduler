// pages/bidsInline.js
// Registers a lightweight HTML page at /bids-inline that calls your /api/bids/* endpoints.
export default function registerBidsInline(app) {
  app.get("/bids-inline", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sales — Bids (inline)</title>
  <style>
    body { font-family: system-ui, Arial, sans-serif; padding: 16px; }
    .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    input, select, button { font-size:14px; padding:6px 8px; }
    button { border:1px solid #ccc; background:#f7f7f7; border-radius:8px; cursor:pointer; }
    button:hover { background:#eee; }
    table { border-collapse:collapse; width:100%; margin-top:12px; }
    th, td { border:1px solid #ddd; padding:6px 8px; font-size:13px; }
    th { background:#fafafa; text-align:left; }
    .section { border:1px solid #eee; border-radius:10px; padding:12px; margin:12px 0; }
    .muted { color:#666; font-size:12px; }
    .totals { font-weight:600; }
  </style>
</head>
<body>
  <h2>Sales — Bids</h2>

  <div class="row">
    <label for="bidId">Bid ID:</label>
    <input id="bidId" type="number" value="1" style="width:6rem" />
    <button id="refreshBtn" type="button">Refresh</button>
    <span id="status" class="muted">Ready.</span>
  </div>

  <div class="section">
    <h3>Add Column (room/unit/color)</h3>
    <div class="row">
      <input id="colLabel" placeholder="Label (e.g., Kitchen – White)" style="min-width:18rem" />
      <input id="colRoom"  placeholder="Room (Kitchen)" />
      <input id="colType"  placeholder="Unit Type (Kitchen/Bath)" />
      <input id="colColor" placeholder="Color (White)" />
      <input id="colUnits" type="number" value="1" min="0" step="1" style="width:6rem" />
      <button id="addColBtn">Add Column</button>
    </div>
    <div class="muted">Units is your Row 28 multiplier for that column.</div>
  </div>

  <div class="section">
    <h3>Add Line (row)</h3>
    <div class="row">
      <input id="lineCode"  placeholder="Code (e.g., W1230)" />
      <input id="lineDesc"  placeholder="Description (Wall Cabinet 12x30)" style="min-width:18rem" />
      <input id="lineCat"   placeholder="Category (Wall/Base/Hardware)" />
      <input id="lineQtyU"  type="number" value="1" step="0.01" style="width:8rem" />
      <input id="linePrice" type="number" value="0" step="0.01" style="width:8rem" />
      <button id="addLineBtn">Add Line</button>
    </div>
    <div class="muted">qty_per_unit × Units = qty_total; unit_price × qty_total = line_total.</div>
  </div>

  <div class="section">
    <h3>Columns</h3>
    <div id="columns"></div>
  </div>

  <div class="section">
    <h3>Preview</h3>
    <table id="previewTbl">
      <thead>
        <tr><th>Column</th><th>Units</th><th>Line</th><th>Qty/Unit</th><th>Unit Price</th><th>Qty Total</th><th>Line Total</th></tr>
      </thead>
      <tbody></tbody>
    </table>
    <div id="totals" class="totals"></div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const fmt = (n) => Number(n).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});

    async function getPreview(bidId) {
      const r = await fetch('/api/bids/' + bidId + '/preview');
      if (!r.ok) throw new Error('preview HTTP ' + r.status);
      return r.json();
    }
    async function getTotals(bidId) {
      const r = await fetch('/api/bids/' + bidId + '/totals');
      if (!r.ok) throw new Error('totals HTTP ' + r.status);
      return r.json();
    }
    async function addColumn(bidId, payload) {
      const r = await fetch('/api/bids/' + bidId + '/columns', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('add column HTTP ' + r.status);
      return r.json();
    }
    async function addLine(bidId, payload) {
      const r = await fetch('/api/bids/' + bidId + '/lines', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('add line HTTP ' + r.status);
      return r.json();
    }
    async function setUnits(columnId, units) {
      const r = await fetch('/api/bids/columns/' + columnId + '/units', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ units })
      });
      if (!r.ok) throw new Error('update units HTTP ' + r.status);
      return r.json();
    }

    function renderPreview(rows) {
      const tbody = $('#previewTbl').querySelector('tbody');
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td>\${r.column_label}</td>
          <td>\${r.units}</td>
          <td>\${r.description}</td>
          <td>\${fmt(r.qty_per_unit)}</td>
          <td>\${fmt(r.unit_price || 0)}</td>
          <td>\${fmt(r.qty_total)}</td>
          <td>\${fmt(r.line_total)}</td>\`;
        tbody.appendChild(tr);
      });
    }

    function renderColumns(bidId, cols) {
      const host = $('#columns');
      host.innerHTML = '';
      cols.forEach(c => {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.marginBottom = '6px';
        const lbl = document.createElement('strong');
        lbl.textContent = \`\${c.column_label} (id \${c.column_id})\`;
        const u = document.createElement('input');
        u.type = 'number'; u.value = c.units; u.min = 0; u.step = 1; u.style.width='6rem';
        const btn = document.createElement('button'); btn.textContent = 'Update Units';
        btn.onclick = async () => {
          try {
            btn.disabled = true;
            await setUnits(c.column_id, Number(u.value));
            await refresh();
          } catch(e) {
            alert(e.message || e);
          } finally {
            btn.disabled = false;
          }
        };
        row.appendChild(lbl);
        row.appendChild(document.createTextNode(' Units: '));
        row.appendChild(u);
        row.appendChild(btn);
        host.appendChild(row);
      });
    }

    async function refresh() {
      const bidId = Number($('#bidId').value);
      try {
        $('#status').textContent = 'Loading…';
        const [rows, totals] = await Promise.all([getPreview(bidId), getTotals(bidId)]);
        renderPreview(rows);
        renderColumns(bidId, (totals.columns || []));
        const g = totals.grand || { subtotal:0, tax_rate:0, tax_amount:0, total:0 };
        $('#totals').textContent =
          'Subtotal: $' + fmt(g.subtotal) + '   Tax (' + (g.tax_rate*100).toFixed(2) + '%): $' + fmt(g.tax_amount) +
          '   Total: $' + fmt(g.total);
        $('#status').textContent = 'Loaded.';
      } catch(e) {
        $('#status').textContent = 'Error: ' + (e.message || e);
      }
    }

    $('#refreshBtn').onclick = refresh;

    $('#addColBtn').onclick = async () => {
      const bidId = Number($('#bidId').value);
      const payload = {
        label: $('#colLabel').value.trim(),
        room:  $('#colRoom').value.trim(),
        unit_type: $('#colType').value.trim(),
        color: $('#colColor').value.trim(),
        units: Number($('#colUnits').value || 0),
        sort_order: 99
      };
      if (!payload.label) return alert('Label required');
      try { await addColumn(bidId, payload); await refresh(); }
      catch(e){ alert(e.message || e); }
    };

    $('#addLineBtn').onclick = async () => {
      const bidId = Number($('#bidId').value);
      const payload = {
        code: $('#lineCode').value.trim(),
        description: $('#lineDesc').value.trim(),
        category: $('#lineCat').value.trim(),
        unit_of_measure: 'ea',
        qty_per_unit: Number($('#lineQtyU').value || 0),
        unit_price: Number($('#linePrice').value || 0),
        pricing_method: 'fixed',
        sort_order: 99
      };
      if (!payload.description) return alert('Description required');
      try { await addLine(bidId, payload); await refresh(); }
      catch(e){ alert(e.message || e); }
    };

    // initial
    refresh();
  </script>
</body>
</html>`);
  });
}
