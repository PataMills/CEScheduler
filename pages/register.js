// pages/register.js
export default function registerRegisterPage(app) {
  app.get('/register', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Register – Cabinets Express</title>
<style>
  body {
    background: #0b0c10;
    color: #eef2ff;
    font-family: system-ui, sans-serif;
    margin: 0;
  }
  .container {
    max-width: 450px;
    margin: 8vh auto;
    padding: 24px;
    background: #111318;
    border-radius: 12px;
    border: 1px solid #222;
  }
  h1 {
    margin-bottom: 6px;
    font-size: 24px;
  }
  p {
    color: #aaa;
    font-size: 14px;
    margin-top: 0;
  }
  label {
    display: block;
    font-size: 13px;
    color: #aaa;
    margin: 12px 0 4px;
  }
  input, select {
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #333;
    background: #0f1220;
    color: #fff;
    box-sizing: border-box;
  }
  button {
    width: 100%;
    margin-top: 16px;
    padding: 12px;
    border: none;
    border-radius: 8px;
    background: #1e2a47;
    color: white;
    cursor: pointer;
    font-weight: 600;
  }
  button:hover {
    background: #2a3a5f;
  }
  .msg {
    color: #f87171;
    margin-top: 10px;
    font-size: 13px;
  }
  .success {
    color: #4ade80;
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
    <h1>Create Account</h1>
    <p>Join the team at Cabinets Express</p>
    
    <label>Full Name</label>
    <input id="name" type="text" placeholder="John Doe" />
    
    <label>Email</label>
    <input id="email" type="email" placeholder="you@company.com" />
    
    <label>Phone</label>
    <input id="phone" type="tel" placeholder="(555) 123-4567" />
    
    <label>Password</label>
    <input id="password" type="password" placeholder="••••••••" />
    
    <label>Confirm Password</label>
    <input id="confirmPassword" type="password" placeholder="••••••••" />
    
    <label>Role</label>
    <select id="role">
      <option value="sales">Sales</option>
      <option value="ops">Operations</option>
      <option value="purchasing">Purchasing</option>
      <option value="installer">Installer</option>
      <option value="service">Service</option>
      <option value="manufacturing">Manufacturing</option>
      <option value="assembly">Assembly</option>
      <option value="delivery">Delivery</option>
    </select>
    
    <button id="registerBtn">Create Account</button>
    <div id="msg" class="msg"></div>
    
    <div class="link">
      Already have an account? <a href="/login">Sign in</a>
    </div>
  </div>

  <script>
    document.getElementById('registerBtn').onclick = async () => {
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const role = document.getElementById('role').value;
      const msg = document.getElementById('msg');
      
      msg.textContent = '';
      msg.className = 'msg';
      
      // Validation
      if (!name || !email || !password) {
        msg.textContent = 'Please fill in all required fields';
        return;
      }
      
      if (password !== confirmPassword) {
        msg.textContent = 'Passwords do not match';
        return;
      }
      
      if (password.length < 8) {
        msg.textContent = 'Password must be at least 8 characters';
        return;
      }
      
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, password, role })
        });
        
        const data = await res.json();
        
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Registration failed');
        }
        
        msg.textContent = 'Account created! Redirecting...';
        msg.className = 'msg success';
        
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
        
      } catch (err) {
        msg.textContent = err.message || 'Registration failed';
      }
    };
    
    // Allow Enter key to submit
    document.querySelectorAll('input').forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('registerBtn').click();
      });
    });
  </script>
</body>
</html>`);
  });
}
