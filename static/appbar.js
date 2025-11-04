// /static/appbar.js
(async () => {
  // Only show on authenticated pages
  async function getUser() {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}
    try {
      const r = await fetch('/api/me', { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {}
    return null;
  }

  const me = await getUser();
  if (!me) return; // not logged in or public page → do nothing

  // Build role-aware links
  const role = String(me.role || '').toLowerCase();
  const links = [];
  if (['service','installer','delivery'].includes(role)) links.push('<a href="/myday-teams">My Day</a>');
  if (role === 'sales') links.push('<a href="/sales-home">Sales</a>');
  if (['manufacturing','assembly'].includes(role)) links.push('<a href="/ops-dashboard">Ops</a>');
  if (role === 'admin') links.push('<a href="/admin">Admin</a>');
  links.push('<a href="/logout">Logout</a>');

  // Bar container
  const bar = document.createElement('div');
  bar.id = 'ce-appbar';
  bar.innerHTML = `
    <div style="
      max-width:1200px; margin:0 auto; padding:8px 12px;
      display:flex; gap:10px; align-items:center; justify-content:space-between;">
      <div style="font-weight:600">👤 ${me.name || 'User'}</div>
      <div style="opacity:.85; font-size:13px; flex:1">${me.email || ''}</div>
      <nav style="display:flex; gap:10px; align-items:center">
        ${links.join('\n')}
      </nav>
    </div>
  `;
  Object.assign(bar.style, {
    position: 'fixed',
    inset: '0 auto auto 0',
    width: '100%',
    zIndex: 9999,
    background: '#0f1220',
    color: '#eef2ff',
    borderBottom: '1px solid #212432',
  });

  // Avoid covering page content
  document.body.style.paddingTop = (parseInt(getComputedStyle(document.body).paddingTop)||0) + 44 + 'px';
  document.body.prepend(bar);
})();
