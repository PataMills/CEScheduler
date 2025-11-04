// pages/adminUsers.js
import { requireAuthPage } from "../routes/auth.js";

export default function registerAdminUsersPage(app) {
  app.get("/admin/users", requireAuthPage, (_req, res) => {
    res.type("html").send(`<!doctype html>
<html><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Admin • Users</title>
<style>
  body{margin:0;background:#0b0c10;color:#eef2ff;font-family:system-ui,Segoe UI,Roboto}
  .wrap{max-width:980px;margin:72px auto 40px;padding:0 16px}
  h1{font-size:22px;margin:0 0 12px}
  .card{background:#111318;border:1px solid #212432;border-radius:14px;padding:16px;margin:12px 0}
  label{display:block;font-size:12px;color:#9aa4b2;margin:8px 0 4px}
  input,select{width:100%;padding:10px;border:1px solid #2a2f3f;border-radius:10px;background:#0f1220;color:#eef2ff}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  button{margin-top:12px;padding:10px 14px;border-radius:12px;border:1px solid #2a2f3f;background:#1a2033;color:#eef2ff;cursor:pointer}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{padding:10px;border-bottom:1px solid #212432;font-size:14px}
  .err{color:#fca5a5;margin-top:8px;min-height:1em}
  .ok{color:#86efac;margin-top:8px;min-height:1em}
</style>
</head><body>
<script src="/static/appbar.js"></script>
<div class="wrap">
  <h1>Admin • Users</h1>
  <div class="card">
    <div class="row">
      <div><label>Name</label><input id="name" placeholder="Jane Doe"></div>
      <div><label>Email</label><input id="email" placeholder="jane@company.com"></div>
    </div>
    <div class="row">
      <div><label>Phone</label><input id="phone" placeholder="(555) 123-4567"></div>
      <div>
        <label>Role</label>
        <select id="role">
          <option value="">Loading...</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div>
        <label>Crew Assignment <span style="color:#9aa4b2;font-weight:normal">(for team roles)</span></label>
        <select id="crew">
          <option value="">(None)</option>
        </select>
      </div>
      <div><label>Temp Password</label><input id="password" type="password" placeholder="Temp password"></div>
    </div>
    <button id="createBtn">Create User</button>
    <div id="msg" class="err"></div>
  </div>

  <div class="card">
    <h2 style="font-size:16px;margin:0 0 8px">Existing Users</h2>
    <table id="users"><thead>
      <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Crew</th><th>Created</th><th>Status</th><th>Actions</th></tr>
    </thead><tbody></tbody></table>
  </div>
</div>

<!-- Edit User Modal -->
<div id="editModal" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);">
  <div style="background:#181b22;padding:24px 28px;border-radius:16px;max-width:420px;margin:80px auto;box-shadow:0 8px 32px #0007;">
    <h2 style="margin-top:0;font-size:18px">Edit User</h2>
    <div class="row">
      <div><label>Name</label><input id="editName"></div>
      <div><label>Email</label><input id="editEmail"></div>
    </div>
    <div class="row">
      <div><label>Phone</label><input id="editPhone"></div>
      <div><label>Role</label><select id="editRole"></select></div>
    </div>
    <div class="row">
      <div><label>Crew Assignment</label><select id="editCrew"></select></div>
      <div></div>
    </div>
    <div id="editMsg" class="err"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
      <button id="editCancelBtn" class="btn" type="button">Cancel</button>
      <button id="editSaveBtn" class="btn" type="button">Save Changes</button>
    </div>
  </div>
</div>

<script src="/static/appbar.js"></script>
<script src="/static/admin-nav.js"></script>

<script>
const $ = s => document.querySelector(s);

async function j(url, opts){ 
  const r = await fetch(url, opts||{}); 
  if(!r.ok) throw new Error('HTTP '+r.status); 
  return r.json(); 
}

// Load roles from API
async function loadRoles() {
  try {
    const data = await j('/api/auth/roles');
    const roles = data.roles || [];
    const sel = $('#role');
    sel.innerHTML = roles.map(r => 
      \`<option value="\${r}">\${r}</option>\`
    ).join('');
  } catch(e) {
    $('#role').innerHTML = '<option value="">Error loading roles</option>';
  }
}

// Load crews from API
async function loadCrews() {
  try {
    const crews = await j('/api/crews');
    const sel = $('#crew');
    sel.innerHTML = '<option value="">(None)</option>' + 
      (Array.isArray(crews) ? crews : [])
        .filter(c => c.active !== false)
        .map(c => \`<option value="\${c.name}">\${c.name}</option>\`)
        .join('');
  } catch(e) {
    $('#crew').innerHTML = '<option value="">(Error loading crews)</option>';
  }
}

// Load existing users
async function loadUsers() {
  try {
    const users = await j('/api/admin/users');
    const tbody = $('#users tbody');
    tbody.innerHTML = (Array.isArray(users) ? users : []).map(u => \`
      <tr>
        <td>\${u.name || ''}</td>
        <td>\${u.email || ''}</td>
        <td>\${u.phone || ''}</td>
        <td>\${u.role || ''}</td>
        <td>\${u.crew_name || '—'}</td>
        <td>\${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}</td>
        <td>\${u.is_active ? '✓ Active' : '✗ Inactive'}</td>
        <td>
          <button onclick="editUser(\${u.id})" style="padding:4px 8px;margin:0 4px">Edit</button>
          <button onclick="toggleUser(\${u.id}, \${!u.is_active})" style="padding:4px 8px">
            \${u.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    \`).join('');
  } catch(e) {
    console.error('Load users error:', e);
  }
}

// Create user
$('#createBtn').onclick = async () => {
  const name = $('#name').value.trim();
  const email = $('#email').value.trim();
  const phone = $('#phone').value.trim();
  const role = $('#role').value;
  const crew = $('#crew').value;
  const password = $('#password').value;

  const msg = $('#msg');
  msg.className = 'err';
  msg.textContent = '';

  if (!name || !email || !password) {
    msg.textContent = 'Name, email, and password are required';
    return;
  }

  try {
    await j('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, role, crew_name: crew || null, password })
    });
    
    msg.className = 'ok';
    msg.textContent = 'User created successfully!';
    
    // Clear form
    $('#name').value = '';
    $('#email').value = '';
    $('#phone').value = '';
    $('#password').value = '';
    $('#crew').value = '';
    
    // Reload users
    await loadUsers();
  } catch(e) {
    msg.textContent = 'Error: ' + (e.message || 'Failed to create user');
  }
};

// Edit user modal logic
let _editUserId = null;
window.editUser = async (id) => {
  _editUserId = id;
  const modal = document.getElementById('editModal');
  modal.style.display = '';
  document.body.style.overflow = 'hidden';
  // Load user data
  let user;
  try {
    const users = await j('/api/admin/users');
    user = (users || []).find(u => u.id === id);
    if (!user) throw new Error('User not found');
  } catch(e) {
    document.getElementById('editMsg').textContent = 'Error loading user';
    return;
  }
  // Pre-fill fields
  document.getElementById('editName').value = user.name || '';
  document.getElementById('editEmail').value = user.email || '';
  document.getElementById('editPhone').value = user.phone || '';
  // Load roles
  try {
    const data = await j('/api/auth/roles');
    const roles = data.roles || [];
    const sel = document.getElementById('editRole');
  sel.innerHTML = roles.map(function(r){return '<option value="'+r+'">'+r+'</option>';}).join('');
    sel.value = user.role || '';
  } catch {}
  // Load crews
  try {
    const crews = await j('/api/crews');
    const sel = document.getElementById('editCrew');
  sel.innerHTML = '<option value="">(None)</option>' + (Array.isArray(crews) ? crews : []).filter(function(c){return c.active !== false;}).map(function(c){return '<option value="'+c.name+'">'+c.name+'</option>';}).join('');
    sel.value = user.crew_name || '';
  } catch {}
  document.getElementById('editMsg').textContent = '';
};

document.getElementById('editCancelBtn').onclick = () => {
  document.getElementById('editModal').style.display = 'none';
  document.body.style.overflow = '';
  _editUserId = null;
};

document.getElementById('editSaveBtn').onclick = async function() {
  if (!_editUserId) return;
  var name = document.getElementById('editName').value.trim();
  var email = document.getElementById('editEmail').value.trim();
  var phone = document.getElementById('editPhone').value.trim();
  var role = document.getElementById('editRole').value;
  var crew = document.getElementById('editCrew').value;
  var msg = document.getElementById('editMsg');
  msg.className = 'err';
  msg.textContent = '';
  if (!name || !email) {
    msg.textContent = 'Name and email are required';
    return;
  }
  try {
    await j('/api/admin/users/' + _editUserId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, phone: phone, role: role, crew_name: crew || null })
    });
    msg.className = 'ok';
    msg.textContent = 'Saved!';
    setTimeout(function() {
      document.getElementById('editModal').style.display = 'none';
      document.body.style.overflow = '';
      _editUserId = null;
      loadUsers();
    }, 600);
  } catch(e) {
    msg.textContent = 'Error: ' + (e.message || 'Failed to save');
  }
};

// Toggle user active status
window.toggleUser = async (id, activate) => {
  try {
    await j(\`/api/admin/users/\${id}/\${activate ? 'activate' : 'deactivate'}\`, {
      method: 'POST'
    });
    await loadUsers();
  } catch(e) {
    alert('Error: ' + (e.message || 'Failed to update user'));
  }
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadRoles(), loadCrews(), loadUsers()]);
});
</script>
</body></html>`);
  });
}
