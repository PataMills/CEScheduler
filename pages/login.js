// pages/login.js
export default function registerLoginPage(app) {
  app.get('/login', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Login – Cabinets Express</title>
<style>
  body {
    background: #0b0c10;
    color: #eef2ff;
    font-family: system-ui, sans-serif;
    margin: 0;
  }
  .container {
    max-width: 400px;
    margin: 10vh auto;
    padding: 20px;
    background: #111318;
    border-radius: 12px;
    border: 1px solid #222;
  }
  h1 {
    margin-bottom: 10px;
    font-size: 22px;
  }
  label {
    display: block;
    font-size: 13px;
    color: #aaa;
    margin: 10px 0 4px;
  }
  input {
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #333;
    background: #0f1220;
    color: #fff;
  }
  button {
    width: 100%;
    margin-top: 15px;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: #1e2a47;
    color: white;
    cursor: pointer;
  }
  .msg {
    color: #f87171;
    margin-top: 10px;
    font-size: 13px;
  }
  .link {
    text-align: center;
    margin-top: 16px;
    font-size: 13px;
    color: #aaa;
  }
  .link a {
    color: #60a5fa;
    text-decoration: none;
  }
  .link a:hover {
    text-decoration: underline;
  }
</style>
</head>
<body>
  <div class="container">
    <h1>Sign in</h1>
    <label>Email</label>
    <input id="email" type="email" placeholder="you@company.com" />
    <label>Password</label>
    <input id="password" type="password" placeholder="••••••••" />
    <button id="loginBtn">Login</button>
    <div id="msg" class="msg"></div>
    
    <div class="link">
      Don't have an account? <a href="/register">Create one</a>
    </div>
  </div>

  <script src="/static/appbar.js"></script>

  <script>
  document.getElementById('loginBtn').onclick = async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const msg = document.getElementById('msg');
    msg.textContent = '';
    try {
      const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Login failed');
      // Follow server-provided landing path
      window.location.replace(data.redirect || '/');
    } catch (err) {
      msg.textContent = err.message || 'Login failed';
    }
  };
  </script>
</body>
</html>`);
  });
}
