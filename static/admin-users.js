(async () => {
  async function loadUsers(){
    const r = await fetch('/api/admin/users');
    const data = await r.json();
    const tbody = document.querySelector('#users tbody');
    tbody.innerHTML = '';
    (data.users || []).forEach(u => {
      const tr = document.createElement('tr');
      const activeTxt = u.is_active ? 'Active' : 'Inactive';
      tr.innerHTML = `
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.role}</td>
        <td>${new Date(u.created_at).toLocaleString()}</td>
        <td>${activeTxt}</td>
        <td style="display:flex;gap:8px">
          <button data-act="reset" data-id="${u.id}">Reset PW</button>
          <button data-act="${u.is_active ? 'deactivate' : 'activate'}" data-id="${u.id}">
            ${u.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('createBtn').onclick = async () => {
    const msg = document.getElementById('msg'); msg.className='err'; msg.textContent='';
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const role = document.getElementById('role').value;
    const password = document.getElementById('password').value;
    try{
      const r = await fetch('/api/admin/users', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, email, role, password })
      });
      const d = await r.json();
      if(!r.ok || !d.ok) throw new Error(d.error || 'create_failed');
      msg.textContent = 'User created'; msg.className = 'ok';
      document.getElementById('password').value='';
      await loadUsers();
    }catch(e){ msg.textContent = e.message || 'Error'; }
  };

  async function promptPassword(){
    const pw = prompt("Enter new temporary password:");
    if (!pw) throw new Error("No password entered");
    if (pw.length < 6) throw new Error("Password too short");
    return pw;
  }

  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');
    try{
      if(act === 'reset'){
        const pw = await promptPassword();
        const r = await fetch(`/api/admin/users/${id}/password`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ password: pw })
        });
        if(!r.ok) throw new Error('Reset failed');
        alert('Password reset. Share the temp password with the user.');
      }
      if(act === 'deactivate' || act === 'activate'){
        const is_active = (act === 'activate');
        const r = await fetch(`/api/admin/users/${id}/status`, {
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ is_active })
        });
        if(!r.ok) throw new Error('Update failed');
      }
      await loadUsers();
    }catch(err){
      alert(err.message || 'Action failed');
    }
  });

  await loadUsers();
})();
