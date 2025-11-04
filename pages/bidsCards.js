// pages/bidsCards.js
export default function registerBidsCards(app) {
  app.get("/bids-cards", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sales — Bids (Cards)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg:#0b0c10; --panel:#111318; --card:#151822; --muted:#8b93a3; --text:#eef2ff; --accent:#6ee7b7; --line:#212432;
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial; background:var(--bg); color:var(--text); }
    .wrap { max-width:1200px; margin:0 auto; padding:24px; }
    h1 { font-size:22px; margin:0 0 12px; }
    .toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:8px 0 16px; }
    input, button { font-size:14px; padding:8px 10px; border-radius:10px; border:1px solid var(--line); background:#0f1220; color:var(--text); }
    input::placeholder { color:#6b7280; }
    button { background:#1a2033; cursor:pointer; }
    button:hover { background:#222a44; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:12px; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
    .cardHeader { display:flex; gap:8px; align-items:center; justify-content:space-between; }
    .title { font-weight:600; font-size:14px; }
    .units { display:flex; gap:6px; align-items:center; }
    .units input { width:64px; text-align:right; }
    .line { display:grid; grid-template-columns: 1fr 80px 92px 90px 110px; gap:8px; align-items:center; padding:6px 0; border-top:1px dashed var(--line); }
    .line:first-of-type { border-top:none; }
    .hdr { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.06em; padding:4px 0 6px; }
    .pill { background:#202642; color:#cde2ff; padding:2px 8px; border-radius:999px; font-size:11px; }
    .muted { color: var(--muted); font-size:12px; }
    .totalsBar { position:sticky; bottom:0; backdrop-filter: blur(6px); background: rgba(15,18,32,.8); border-top:1px solid var(--line);
                 padding:10px 12px; margin-top:14px; display:flex; gap:16px; align-items:center; justify-content:space-between; border-radius:12px; }
    .subtotalList { display:flex; gap:12px; flex-wrap:wrap; font-size:13px; }
    .money { color: var(--accent); font-weight:700; }
    .addRow { display:grid; grid-template-columns: 1fr 80px 92px auto; gap:8px; margin:8px 0; }
    .num { text-align:right; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Sales — Bids</h1>

    <div class="toolbar">
        <span>Bid ID</span>
        <input id="bidId" type="number" value="1" style="width:80px"/>
        <input id="newColLabel" placeholder="Add Column: Kitchen – White" style="min-width:260px"/>
        <input id="newColUnits" type="number" value="1" min="0" style="width:80px; text-align:right"/>
        <button id="addColBtn">Add Column</button>
        <button id="refreshBtn">Refresh</button>
        <span id="status" class="muted">Ready.</span>
    </div>


    <div id="cards" class="grid"></div>

    <div id="totals" class="totalsBar" style="display:none">
      <div class="subtotalList" id="colTotals"></div>
      <div id="grand"></div>
    </div>
  </div>

<script>
  // ---------- helpers ----------
  function $(id){ return document.getElementById(id); }
  function fmt(n){ return Number(n || 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }

  async function fetchJSON(url, opts){
    var o = Object.assign({ headers:{ "Content-Type":"application/json" } }, opts || {});
    var r = await fetch(url, o);
    if(!r.ok) throw new Error(url + " HTTP " + r.status);
    return r.json();
  }

  function getBidFromQS(){
  var qs = new URLSearchParams(location.search);
  var b = Number(qs.get('bid') || 0);
  return (isFinite(b) && b>0) ? b : 0;
}


  function ensureEl(id, parentSelector, className){
  var el = document.getElementById(id);
  if (!el) {
    var parent = document.querySelector(parentSelector) || document.body;
    el = document.createElement('div');
    el.id = id;
    if (className) el.className = className;
    parent.appendChild(el);
  }
  return el;
}

  var api = {
    model:   function(bidId){ return fetchJSON("/api/bids/" + bidId + "/model"); },
    preview: function(bidId){ return fetchJSON("/api/bids/" + bidId + "/preview"); },
    totals:  function(bidId){ return fetchJSON("/api/bids/" + bidId + "/totals"); },
    addCol:  function(bidId, payload){ return fetchJSON("/api/bids/" + bidId + "/columns", { method:"POST", body: JSON.stringify(payload) }); },
    addLine: function(bidId, payload){ return fetchJSON("/api/bids/" + bidId + "/lines",   { method:"POST", body: JSON.stringify(payload) }); },
    patchLine: function(lineId, payload){ return fetchJSON("/api/bids/lines/" + lineId,    { method:"PATCH", body: JSON.stringify(payload) }); },
    setUnits:  function(colId, units){ return fetchJSON("/api/bids/columns/" + colId + "/units", { method:"PATCH", body: JSON.stringify({ units: units }) }); }
  };

  function groupBy(arr, keyFn){
    var m = new Map();
    (arr || []).forEach(function(x){
      var k = keyFn(x);
      if(!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return m;
  }

  // ---------- UI wiring ----------
  function wireEvents(){
    var refreshBtn = $("#refreshBtn");
    var addColBtn  = $("#addColBtn");
    var bidEl      = $("#bidId");

  if (refreshBtn) refreshBtn.addEventListener('click', function(){ safe(refresh); });
    if (bidEl) bidEl.addEventListener("keydown", function(e){ if (e.key === "Enter") safe(refresh); });

  if (addColBtn) addColBtn.addEventListener('click', function(){
      safe(async function(){
        var bidId = Number(($("#bidId") || {}).value || 0);
        var label = (($("#newColLabel") || {}).value || "").trim();
        var units = Number(($("#newColUnits") || {}).value || 0);
        if(!bidId)  return alert("Enter a Bid ID first");
        if(!label)  return alert("Label required");
        await api.addCol(bidId, { label: label, units: units, sort_order: 999 });
        if ($("#newColLabel")) $("#newColLabel").value = "";
        if ($("#newColUnits")) $("#newColUnits").value = "1";
        await refresh();
      });
    };
  }

    function getBidId() {
    // prefer the input if present
    var el = document.getElementById('bidId');
    var fromInput = el ? Number(el.value || 0) : 0;
    if (fromInput) return fromInput;

    // fallback: /bids-cards?bid=1
    var qs = new URLSearchParams(location.search);
    var fromQS = Number(qs.get('bid') || 0);
    if (fromQS) return fromQS;

    // safe default
    return 1;
    }

    async function refresh(){
    var statusEl = document.getElementById('status');
    var bidId = getBidId();
    if (statusEl) statusEl.textContent = 'Loading…';

    try{
        var results = await Promise.all([
        api.model(bidId), api.preview(bidId), api.totals(bidId)
        ]);
        renderCards(bidId, results[0], results[1], results[2]);
        if (statusEl) statusEl.textContent = 'Loaded.';
        // write the resolved bid back to the input if it exists but was empty
        var el = document.getElementById('bidId');
        if (el && !el.value) el.value = String(bidId);
    }catch(e){
        if (statusEl) statusEl.textContent = 'Error: ' + (e.message || e);
        console.error(e);
    }
    }

  function renderCards(bidId, model, preview, totals){
    var cardsHost = ensureEl("cards", ".wrap", "grid");
    cardsHost.innerHTML = "";


    // map preview by (line_id:column_id)
    var pv = new Map();
    (preview || []).forEach(function(r){ pv.set(r.line_id + ":" + r.column_id, r); });

    // cards per column
    (model.columns || []).forEach(function(c){
      var card = document.createElement("div");
      card.className = "card";

      // header
      var head = document.createElement("div"); head.className = "cardHeader";
      var left = document.createElement("div");
      left.innerHTML = '<div class="title">' + (c.column_label || "—") + '</div><div class="muted">Column #' + c.column_id + '</div>';
      var right = document.createElement("div"); right.className = "units";
      var tag = document.createElement("span"); tag.className = "pill"; tag.textContent = "Units";
      var u = document.createElement("input"); u.type = "number"; u.min = "0"; u.value = String(c.units || 0);
      u.addEventListener("change", function(){
        safe(async function(){
          u.disabled = true;
          try{ await api.setUnits(c.column_id, Number(u.value || 0)); await refresh(); }
          finally{ u.disabled = false; }
        });
      });
      right.appendChild(tag); right.appendChild(u);
      head.appendChild(left); head.appendChild(right);
      card.appendChild(head);

      // quick add line
      var add = document.createElement("div"); add.className = "addRow";
      add.innerHTML =
        '<input placeholder="Add line: description"/>' +
        '<input type="number" step="0.01" value="1" />' +
        '<input type="number" step="0.01" value="0" />' +
        '<button>Add Line</button>';
      var parts = add.querySelectorAll("input,button");
      var descEl = parts[0], qtyEl = parts[1], priceEl = parts[2], btnEl = parts[3];
      btnEl.addEventListener("click", function(){
        safe(async function(){
          var description = (descEl.value || "").trim();
          if(!description) return alert("Description required");
          btnEl.disabled = true;
          try{
            await api.addLine(bidId, {
              description: description,
              qty_per_unit: Number(qtyEl.value || 0),
              unit_price: Number(priceEl.value || 0),
              pricing_method: "fixed",
              sort_order: 999
            });
            descEl.value = ""; qtyEl.value = "1"; priceEl.value = "0";
            await refresh();
          } finally { btnEl.disabled = false; }
        });
      });
      card.appendChild(add);

      // inner header row
      var hdr = document.createElement("div"); hdr.className = "line hdr";
      hdr.innerHTML = "<div>Line</div><div class='num'>Qty/Unit</div><div class='num'>Unit Price</div><div class='num'>Qty Total</div><div class='num'>Line Total</div>";
      card.appendChild(hdr);

      // lines
      (model.lines || []).forEach(function(line){
        var key = line.line_id + ":" + c.column_id;
        var pr = pv.get(key);
        var qtyUnit   = Number(line.qty_per_unit || 0);
        var unitPrice = Number(line.unit_price || 0);
        var units     = Number(c.units || 0);
        var qtyTotal  = pr ? Number(pr.qty_total)  : (qtyUnit * units);
        var lineTotal = pr ? Number(pr.line_total) : (qtyTotal * unitPrice);

        var el = document.createElement("div"); el.className = "line";
        el.innerHTML =
          "<div>" + (line.description || "(no description)") + " <span class='muted'>#" + line.line_id + "</span></div>" +
          "<div class='num'><input data-edit='qty'   data-line='" + line.line_id + "' type='number' step='0.01' value='" + qtyUnit + "' style='width:100%'/></div>" +
          "<div class='num'><input data-edit='price' data-line='" + line.line_id + "' type='number' step='0.01' value='" + unitPrice + "' style='width:100%'/></div>" +
          "<div class='num'>" + fmt(qtyTotal)  + "</div>" +
          "<div class='num'>" + fmt(lineTotal) + "</div>";

        var inputs = el.querySelectorAll("input");
        var qtyInp   = inputs[0];
        var priceInp = inputs[1];
        qtyInp.addEventListener("change", function(){
          safe(async function(){
            qtyInp.disabled = true;
            try{ await api.patchLine(Number(qtyInp.getAttribute("data-line")), { qty_per_unit: Number(qtyInp.value || 0) }); await refresh(); }
            finally{ qtyInp.disabled = false; }
          });
        });
        priceInp.addEventListener("change", function(){
          safe(async function(){
            priceInp.disabled = true;
            try{ await api.patchLine(Number(priceInp.getAttribute("data-line")), { unit_price: Number(priceInp.value || 0) }); await refresh(); }
            finally{ priceInp.disabled = false; }
          });
        });

        card.appendChild(el);
      });

      cardsHost.appendChild(card);
    });

    // totals bar
    var bar = ensureEl("totals", ".wrap", "totalsBar");

    var colTotals = document.getElementById("colTotals") || (function(){
    var d = document.createElement("div"); d.id = "colTotals"; d.className = "subtotalList"; bar.appendChild(d); return d;
    })();

    var grand = document.getElementById("grand") || (function(){
    var d = document.createElement("div"); d.id = "grand"; bar.appendChild(d); return d;
    })();

    var list = (totals.columns || []).map(function(ct){
      return "<span class='pill'>" + ct.column_label + ": <strong>$ " + fmt(ct.amount_subtotal) + "</strong></span>";
    }).join(" ");
    colTotals.innerHTML = list || "<span class='muted'>No columns yet.</span>";

    var g = totals.grand || { subtotal:0, tax_rate:0, tax_amount:0, total:0 };
    grand.innerHTML =
      "Subtotal <span class='money'>$ " + fmt(g.subtotal) + "</span>" +
      " &nbsp; Tax " + (g.tax_rate * 100).toFixed(2) + "% = $ " + fmt(g.tax_amount) +
      " &nbsp; <span class='money'>Total $ " + fmt(g.total) + "</span>";

    bar.style.display = "flex";
  }

  async function safe(fn){
    try { await fn(); }
    catch(e){ var s=$("#status"); if(s) s.textContent="Error: " + (e.message || e); console.error(e); }
  }

  // Boot after DOM is ready
document.addEventListener("DOMContentLoaded", function(){
  wireEvents();
  var qsBid = getBidFromQS();
  var bidEl = document.getElementById('bidId');
  if (qsBid && bidEl) bidEl.value = String(qsBid);
  safe(refresh);
});


</script>
</body>
</html>`);
  });
}
