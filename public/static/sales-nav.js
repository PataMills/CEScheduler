// sales-nav.js
// Injects the sales workflow navigation bar with Home, Intake, Quote, Details tabs
window.createSalesNav = function(active) {
  if (document.getElementById('salesNavBar')) return; // Prevent duplicate navs
  // Get current bid id from URL
  var bid = '';
  try {
    var q = window.location.search;
    var m = q.match(/[?&]bid=(\d+)/);
    if (m) bid = m[1];
  } catch {}
  // Build tab links, preserving bid id if present
  function tabLink(base) {
    if (!bid || base === '/sales-home') return base;
    return base + '?bid=' + bid;
  }
  var nav = document.createElement('nav');
  nav.id = 'salesNavBar';
  nav.style = 'width:100%;margin-bottom:0;';
  nav.innerHTML = `
    <div style="display:flex;gap:0;background:#151822;border-bottom:1px solid #212432;">
      <a href="${tabLink('/sales-home')}" class="salesNavTab${active==='home'?' active':''}">Home</a>
      <a href="${tabLink('/sales-intake')}" class="salesNavTab${active==='intake'?' active':''}">Intake</a>
      <a href="${tabLink('/sales-quote')}" class="salesNavTab${active==='quote'?' active':''}">Quote</a>
      <a href="${tabLink('/sales-details')}" class="salesNavTab${active==='details'?' active':''}">Details</a>
    </div>
    <style>
      .salesNavTab { display:inline-block;padding:12px 32px;font-size:15px;color:#eef2ff;text-decoration:none;border:none;background:none;transition:.2s; }
      .salesNavTab.active { background:#212432;color:#fff;font-weight:700;border-bottom:2px solid #6ee7b7; }
      .salesNavTab:not(.active):hover { background:#222a44;color:#bff7e6; }
    </style>
  `;
  var wrap = document.body.querySelector('.wrap');
  if (wrap) {
    wrap.insertAdjacentElement('beforebegin', nav);
  } else {
    document.body.insertAdjacentElement('afterbegin', nav);
  }
};
