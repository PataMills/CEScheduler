// /static/admin-invites.js
(function () {
  const ROLE_OPTIONS = [
    ['admin','Admin'],
    ['sales','Sales'],
    ['installer','Installer'],
    ['service','Service'],
    ['manufacturing','Manufacturing'],
    ['assembly','Assembly'],
    ['delivery','Delivery'],
  ];

  function $(id){ return document.getElementById(id); }

  async function fetchJSON(url, opts){
    const r = await fetch(url, opts || {});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // Build role dropdown
  const roleSel = $('invRole');
  if (roleSel) {
    roleSel.innerHTML = ROLE_OPTIONS.map(function (p){
      return '<option value="'+p[0]+'">'+p[1]+'</option>';
    }).join('');
    roleSel.value = 'installer';
  }

  // Load pending list
  async function loadPending(){
    try{
      const rows = await fetchJSON('/api/admin/invitations');
      const tb = $('pendingBody');
      if (!tb) return;
      tb.innerHTML = '';
      rows.filter(function(r){ return !r.used_at; }).forEach(function(r){
        const tr = document.createElement('tr');
        const exp = r.expires_at ? new Date(r.expires_at).toLocaleString() : '—';
        tr.innerHTML =
          '<td>'+ r.email +'</td>'+
          '<td>'+ r.role +'</td>'+
          '<td class="muted">'+ exp +'</td>'+
          '<td>'+
            '<button data-act="resend" data-id="'+r.id+'">Resend</button> '+
            '<button data-act="revoke" data-id="'+r.id+'">Revoke</button> '+
            '<button data-act="copy"   data-id="'+r.id+'">Copy link</button>'+
          '</td>';
        tb.appendChild(tr);
      });
    }catch(err){
      console.error('[loadPending]', err);
      alert('Failed to load invitations');
    }
  }

  // Send invite
  const sendBtn = $('sendInvite');
  if (sendBtn) {
    sendBtn.addEventListener('click', async function (){
      const email = ($('invEmail').value || '').trim();
      const role  = $('invRole').value;
      if (!email) { alert('Enter an email'); return; }
      try{
        const r = await fetch('/api/admin/invitations', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email, role, expires_in_days: 14 })
        });
        if (r.status === 409) { alert('Open invite already exists for this email. Revoke/accept first.'); return; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await loadPending();
        alert('Invite sent');
      }catch(err){
        console.error('[createInvite]', err);
        alert('Invite failed');
      }
    });
  }

  // Row actions
  document.addEventListener('click', async function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;

    const id  = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');

    if (act === 'copy') {
      try {
        const r = await fetch('/api/admin/invitations/' + id);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const inv  = await r.json();
        const base = (window.location.origin || '').replace(/\/$/, '');
        const url  = base + '/accept-invite?token=' + encodeURIComponent(inv.token);
        try { await navigator.clipboard.writeText(url); alert('Link copied'); }
        catch { alert(url); }
      } catch (err) {
        console.error('[copy]', err);
        alert('Copy failed');
      }
      return;
    }

    if (act === 'resend') {
      try {
        const r = await fetch('/api/admin/invitations/' + id + '/resend', { method:'POST' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await loadPending();
        alert('Invite resent');
      } catch (err) {
        console.error('[resend]', err);
        alert('Resend failed');
      }
      return;
    }

    if (act === 'revoke') {
      try {
        const r = await fetch('/api/admin/invitations/' + id + '/revoke', { method:'POST' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await loadPending();
        alert('Invite revoked');
      } catch (err) {
        console.error('[revoke]', err);
        alert('Revoke failed');
      }
      return;
    }
  });

  // Boot
  loadPending();
})();