// /public/static/admin-nav.js
(function(){
  try {
    const bar = document.createElement('div');
    bar.style.cssText = "position:sticky;top:0;z-index:9;background:#0f121a;border-bottom:1px solid #212432;font:14px system-ui;color:#cfd6ea";
    bar.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;padding:8px 18px;display:flex;gap:14px;flex-wrap:wrap;align-items:center">
        <a href="/admin" style="color:#bcd3ff;text-decoration:none;font-weight:700">Admin</a>
        <a href="/purchasing-worklist" style="color:#bcd3ff;text-decoration:none">Purchasing</a>
        <a href="/admin-options" style="color:#bcd3ff;text-decoration:none">Options</a>
        <a href="/admin-content" style="color:#bcd3ff;text-decoration:none">Content</a>
        <a href="/admin-lead-times" style="color:#bcd3ff;text-decoration:none">Lead Times</a>
        <a href="/calendar" style="color:#bcd3ff;text-decoration:none">Calendar</a>
        <span style="opacity:.5">|</span>
        <a href="/ops-day-board" style="color:#bcd3ff;text-decoration:none">Ops</a>
  <a href="/ops-dashboard" style="color:#bcd3ff;text-decoration:none">Ops-Dashboard</a>
        <a href="/myday-teams" style="color:#bcd3ff;text-decoration:none">My Day</a>
        <a href="/sales-home" style="color:#bcd3ff;text-decoration:none">Sales</a>
      </div>`;
    // insert right below existing appbar if present
    const firstScript = document.currentScript;
    (document.body ? Promise.resolve() : new Promise(r=>document.addEventListener('DOMContentLoaded', r)))
      .then(()=>{
        const appbar = document.querySelector('#appbar-root')?.parentElement;
        if (appbar && appbar.nextSibling) appbar.parentElement.insertBefore(bar, appbar.nextSibling);
        else document.body.prepend(bar);

        // light active-state styling based on current path
        try {
          const here = location.pathname.toLowerCase();
          bar.querySelectorAll('a[href]')?.forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;
            const path = href.toLowerCase();
            if (here === path || (here.startsWith(path) && path !== '/')) {
              a.style.fontWeight = '700';
              a.style.color = '#ffffff';
              a.style.textDecoration = 'underline';
            }
          });
        } catch {}
      });
  } catch(e) { /* no-op */ }
})();
