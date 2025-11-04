export default function registerAdminInvites(app) {
  app.get('/admin/invitations', (_req, res) => {
    // Prevent dev caching while we iterate on inline scripts
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Admin – Invitations</title>
    <link rel="stylesheet" href="/static/appbar.css">
    <meta http-equiv="Cache-Control" content="no-store" />
    <style>
      body { margin:0; background:#0b0c10; color:#eef2ff; font-family:system-ui,Segoe UI,Roboto; }
      .wrap { max-width:1200px; margin:0 auto; padding:18px; }
      h2 { font-size:22px; margin:0 0 16px; }
      h3 { font-size:18px; margin:16px 0 8px; }
      label { display:block; margin: 8px 0 4px; font-size: 13px; color:#9aa4b2; }
      input, select { padding: 8px 10px; border:1px solid #212432; border-radius:8px; font-size:14px; background:#111318; color:#eef2ff; }
      input:focus, select:focus { outline:none; border-color:#2563eb; }
      button { padding:8px 12px; border-radius:8px; border:1px solid #2a2f3f; background:#1a2033; color:#eef2ff; cursor:pointer; font-size:14px; }
      button:hover { background:#243049; }
      table { border-collapse: collapse; width:100%; margin-top:16px; background:#111318; border:1px solid #212432; border-radius:12px; }
      th, td { border-bottom:1px solid #212432; padding:10px; text-align:left; font-size:14px; }
      th { color:#9aa4b2; font-weight:600; }
      tbody tr:last-child td { border-bottom:none; }
      .muted { color:#9aa4b2; font-size:12px; }
      .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .card { border:1px solid #212432; border-radius:12px; padding:14px; margin:12px 0; background:#111318; }
    </style>
  </head>
  <body>
    <script src="/static/user-role.js"></script>
    <script src="/static/appbar.js"></script>
    <script src="/static/admin-nav.js"></script>
    <div class="wrap">
    <h2 style="margin:0 0 12px">Invitations</h2>
    <div class="card">
      <div class="row">
        <div>
          <label>Email</label>
          <input id="invEmail" type="email" placeholder="user@example.com" style="min-width:260px" />
        </div>
        <div>
          <label>Role</label>
          <select id="invRole"></select>
        </div>
        <div style="align-self:flex-end; padding-bottom:4px">
          <button id="sendInvite">Send Invite</button>
        </div>
      </div>
      <div class="muted" style="margin-top:6px">An email with an acceptance link will be sent.</div>
    </div>

    <h3 style="margin:16px 0 8px">Pending</h3>
    <table>
      <thead>
  <tr><th>Email</th><th>Role</th><th>Expires</th><th>Actions</th></tr>
      </thead>
      <tbody id="pendingBody"></tbody>
    </table>

    <script src="/static/admin-invites.js"></script>
  </body>
</html>`);
  });
}
