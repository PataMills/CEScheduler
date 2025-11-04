// /static/purchasing-nav.js
(function(){
  try{
    const bar = document.createElement('div');
    bar.style.cssText = "position:sticky;top:0;z-index:9;background:#0f121a;border-bottom:1px solid #212432;font:14px system-ui,color:#cfd6ea";
    bar.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;padding:8px 18px;display:flex;gap:14px;flex-wrap:wrap;align-items:center">
        <a href="/purchasing-worklist" style="color:#bcd3ff;text-decoration:none;font-weight:700">Purchasing</a>
        <a href="/purchasing" style="color:#bcd3ff;text-decoration:none">Queue</a>
        <a href="/purchasing-dashboard" style="color:#bcd3ff;text-decoration:none">Dashboard</a>
      </div>`;

    (document.body ? Promise.resolve() : new Promise(r=>document.addEventListener('DOMContentLoaded', r))).then(()=>{
      const appbar = document.querySelector('#appbar-root')?.parentElement;
      if (appbar && appbar.nextSibling) appbar.parentElement.insertBefore(bar, appbar.nextSibling);
      else document.body.prepend(bar);

      try{
        const here = location.pathname.toLowerCase();
        bar.querySelectorAll('a[href]')?.forEach(a=>{
          const href=a.getAttribute('href'); if(!href) return; const path=href.toLowerCase();
          if (here===path || (here.startsWith(path) && path !== '/')){
            a.style.fontWeight='700'; a.style.color='#ffffff'; a.style.textDecoration='underline';
          }
        });
      }catch{}
    });
  }catch{}
})();
