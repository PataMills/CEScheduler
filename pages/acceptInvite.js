export default function registerAcceptInvite(app) {
  app.get('/invite/:token', (req, res) => {
    const token = String(req.params.token || '').trim();
    // Prevent dev caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Accept Invitation</title>
    <meta http-equiv="Cache-Control" content="no-store" />
    <style>
      body { margin:0; background:#0b0c10; color:#eef2ff; font-family:system-ui,Segoe UI,Roboto; display:grid; place-items:center; min-height:100vh; padding:16px; }
      .card { max-width: 460px; width:100%; border:1px solid #212432; border-radius:12px; padding:24px; background:#111318; }
      h2 { margin:0 0 6px; font-size:24px; }
      label { display:block; margin: 12px 0 4px; font-size: 13px; color:#9aa4b2; }
      input { width:100%; padding: 10px 12px; border:1px solid #212432; border-radius:10px; font-size:14px; background:#0f1220; color:#eef2ff; box-sizing:border-box; }
      input:focus { outline:none; border-color:#2563eb; }
      button { width:100%; margin-top:16px; padding:12px; border-radius:10px; border:1px solid #2563eb; background:#2563eb; color:#fff; font-weight:600; cursor:pointer; font-size:15px; }
      button:hover { background:#1d4ed8; border-color:#1d4ed8; }
      .muted { color:#9aa4b2; font-size:13px; margin-bottom:16px; }
      #msg { margin-top:12px; padding:8px; border-radius:8px; background:#1a2033; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2 style="margin:0 0 6px">Accept Invitation</h2>
      <div class="muted" style="margin-bottom:12px">Create your account to continue.</div>

      <label for="name">Name</label>
      <input id="name" type="text" placeholder="Your name" />

      <label for="password">Password</label>
      <input id="password" type="password" placeholder="Create a password" />

      <button id="btnAccept">Create account</button>
      <div id="msg" class="muted" style="margin-top:10px"></div>
    </div>

    <script>
      // In dev, unregister SW to avoid cached pages
      (function(){ if ('serviceWorker' in navigator && location.hostname === 'localhost') { try { navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister().catch(function(){}); }); }); } catch(e){} } })();
      const token = ${JSON.stringify(token)};
      async function accept(){
        const name = document.getElementById('name').value.trim();
        const password = document.getElementById('password').value;
        const msg = document.getElementById('msg');
        msg.textContent = 'Submitting…';
        try {
          const res = await fetch('/api/auth/accept-invite', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, name, password })
          });
          const j = await res.json().catch(()=>({}));
          if (!res.ok || !j.ok) throw new Error(j.error || ('HTTP '+res.status));
          msg.textContent = 'Success! Redirecting…';
          setTimeout(() => { location.href = '/login'; }, 800);
        } catch (e) {
          msg.textContent = (e && e.message) ? e.message : 'Accept failed';
        }
      }
      document.getElementById('btnAccept').addEventListener('click', accept);
    </script>
  </body>
</html>`);
  });
}
