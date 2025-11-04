// pages/mydayTeams.js
import { requireRolePage } from "../routes/auth.js";
import { headCommon, footCommon } from "./_layout.js";

export default function registerMyDayTeams(app){
  app.get("/myday-teams", requireRolePage(["admin","ops","installer","service","manufacturing","assembly","delivery"]), (_req, res) => {
  res.type("html").send(headCommon('My Day — Teams') + `
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js"></script>
<style>
/* Page-specific styles - everything else comes from shared CSS */
</style>
<div class="wrap">
  <div class="row" style="justify-content:space-between">
    <div>
      <h1>My Day</h1>
      <div class="muted small">Arrive, complete (notes & photos), directions & calls.</div>
    </div>
    <div class="row">
      <label class="muted">Date</label>
      <input id="day" type="date"/>
      <label class="muted">Crew</label>
      <select id="crew"></select>
      <button class="btn" id="loadBtn">Load</button>
    </div>
  </div>


  <div class="panel">
    <div class="row" style="justify-content:space-between; width:100%;">
      <div class="row">
        <button class="btn" id="hereBtn">Use my location</button>
        <span class="muted small">Start from the shop by default.</span>
      </div>
      <div class="row">
        <input id="q" placeholder="Search jobs, address…" style="min-width:220px"/>
        <button class="btn" id="searchBtn">Search</button>
      </div>
    </div>
  </div>

  <div class="panel" style="padding:0;overflow:hidden">
    <div id="teamCal"></div>
  </div>

  <div class="legend">
    <span><i class="dot manu"></i> Manufacturing</span>
    <span><i class="dot paint"></i> Paint</span>
    <span><i class="dot asm"></i> Assembly</span>
    <span><i class="dot del"></i> Delivery</span>
    <span><i class="dot ins"></i> Install</span>
    <span><i class="dot svc"></i> Service</span>
  </div>

  <div id="status" class="muted small">Pick a date, choose crew, Load.</div>
  <div id="list"></div>
</div>

<!-- Complete modal -->
<div id="noteModal" hidden>
  <div class="sheet">
    <div style="font-weight:600;margin-bottom:8px;">Complete with note</div>
    <textarea id="noteInput" rows="4" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:#0f1220;color:#eef2ff" placeholder="Optional note…"></textarea>
    <input id="photoInput" type="file" accept="image/*" multiple style="margin-top:10px"/>
    <div id="photoHint" class="muted small" style="margin-top:6px">Attach up to 15 photos (&lt; 30 MB total).</div>
    <div class="row" style="justify-content:flex-end;margin-top:10px;">
      <button class="btn" id="cancelBtn">Cancel</button>
      <button class="btn" id="saveBtn">Save</button>
    </div>
  </div>
</div>
<script>
const $ = s => document.querySelector(s);

// -------- Helper to build clean query strings (no empty params)
function buildQuery(params) {
  const parts = Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  return parts ? '?' + parts : '';
}

// -------- API helpers (existing routes) - FIXED
async function j(url, opts){ 
  const r = await fetch(url, opts||{}); 
  if(!r.ok) throw new Error('HTTP '+r.status); 
  return r.json(); 
}

const api = {
  day: (date, crew) => {
    const params = { date };
    const crewTrimmed = (crew || '').trim();
    if (crewTrimmed) params.crew = crewTrimmed;
    return j('/api/myday' + buildQuery(params));
  },
  arrived: (id) => j('/api/tasks/'+id+'/arrived',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ note:'Arrived (tap)', when:new Date().toISOString() })}),
  complete: (id, body) => j('/api/tasks/'+id+'/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})}),
};

// -------- constants (shop origin default)
const SHOP_ORIGIN = { addr: "3943 S 500 W, Salt Lake City, UT" };

// -------- origin store
function saveOrigin(lat,lng){ localStorage.setItem('origin_lat',String(lat||'')); localStorage.setItem('origin_lng',String(lng||'')); }
function loadOrigin(){ const lat=parseFloat(localStorage.getItem('origin_lat')||''); const lng=parseFloat(localStorage.getItem('origin_lng')||''); return (Number.isFinite(lat)&&Number.isFinite(lng))?{lat,lng}:null; }

// -------- utils
function ymd(d){const y=d.getFullYear(),m=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);return y+'-'+m+'-'+da;}
(function preset(){const d=new Date();d.setDate(d.getDate()+1); $('#day').value = ymd(d); })();
function badge(status){
  const s = String(status||'').toLowerCase();
  if (s === 'en_route')      return '<span class="badge en_route">OTW</span>';
  if (s === 'in_progress')   return '<span class="badge in_progress">ARRIVED</span>';
  if (s === 'wip')           return '<span class="badge wip">WIP</span>';
  if (s === 'complete')      return '<span class="badge complete">DONE</span>';
  return '<span class="badge scheduled">SCHED</span>';
}
function mapUrl(address){ return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address||''); }
function telHref(num){ return 'tel:'+String(num||'').replace(/[^\\d+]/g,''); }
function haversineKm(a,b){ if(!a||!b) return null; const R=6371,toRad=d=>d*Math.PI/180;const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);const s1=Math.sin(dLat/2),s2=Math.sin(dLng/2);const q=s1*s1+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;return 2*R*Math.asin(Math.sqrt(q)); }
function minutesFromKm(km, kmh=48.3){ return km? (km/kmh)*60 : null; }

function flash(msg){
  const n=document.createElement('div');
  n.textContent=msg;
  Object.assign(n.style,{position:'fixed',left:'50%',top:'16px',transform:'translateX(-50%)',background:'#111',color:'#fff',padding:'8px 12px',borderRadius:'9999px',zIndex:99999,boxShadow:'0 8px 24px rgba(0,0,0,.15)'});
  document.body.appendChild(n); setTimeout(()=>n.remove(),1400);
}

function readFilesAsDataURLs(fileList, {maxFiles=15, maxTotalBytes=30*1024*1024} = {}){
  const files = Array.from(fileList||[]).slice(0,maxFiles);
  const total = files.reduce((s,f)=>s+f.size,0);
  if (total > maxTotalBytes) throw new Error("Photos > 30 MB total");
  return Promise.all(files.map(f=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res({name:f.name,type:f.type,size:f.size,data:r.result}); r.onerror=rej; r.readAsDataURL(f);})));
}

// -------- modal state
let _modalTaskId = null;
function openModal(id){ _modalTaskId = id; $('#noteModal').hidden = false; $('#noteInput').value=''; $('#photoInput').value=''; $('#photoHint').textContent='Attach up to 15 photos (< 30 MB total).'; }
function closeModal(){ $('#noteModal').hidden = true; _modalTaskId = null; }
$('#cancelBtn').onclick = closeModal;
$('#photoInput').addEventListener('change', e => { const n=(e.target.files||[]).length; $('#photoHint').textContent = n? (n+' photo'+(n>1?'s':'')) : 'Attach up to 15 photos (< 30 MB total).'; });

$('#saveBtn').onclick = async ()=>{
  if(!_modalTaskId) return closeModal();
  try{
    const note = ($('#noteInput').value||'');
    const files = $('#photoInput').files || [];
    const photos = await readFilesAsDataURLs(files);
    await api.complete(_modalTaskId, { note, photos, when: new Date().toISOString() });
    flash('Completed ✓'); closeModal(); await load(); if (window.teamCal?.refetchEvents) window.teamCal.refetchEvents();
  }catch(e){ flash((e&&e.message)||'Complete failed'); }
};

// -------- page actions
$('#hereBtn').onclick = ()=>{
  if(!navigator.geolocation) return alert('Geolocation not available');
  navigator.geolocation.getCurrentPosition(
    pos => { const {latitude,longitude} = pos.coords; saveOrigin(latitude,longitude); flash('Origin set'); },
    err => alert('Location error: '+err.message),
    { enableHighAccuracy:true, timeout:8000 }
  );
};

async function load(){
  const date = $('#day').value;
  const crew = $('#crew').value;
  if(!date){ alert('Pick a date'); return; }

  $('#status').textContent = 'Loading…';
  let rows = [];
  try {
    rows = await api.day(date, crew);
    // Ensure we have an array
    if (!Array.isArray(rows)) rows = [];
  } catch(e) {
    console.error('Load error:', e);
    $('#status').textContent = 'Error: '+(e.message||e);
    return;
  }

  const host = $('#list'); host.innerHTML = '';
  const origin = loadOrigin();

  rows.forEach(r=>{
    const card = document.createElement('div'); card.className='card';

    const head = document.createElement('div'); head.className='row'; head.style.justifyContent='space-between';
    const left = document.createElement('div');
    left.innerHTML =
      '<div style="font-weight:600">'+(r.customer_name||r.job_id)+'</div>'+
      '<div class="muted small">'+new Date(r.window_start).toLocaleString()+' → '+new Date(r.window_end).toLocaleString()+'</div>'+
      (r.name ? '<div class="muted small">'+r.name+'</div>' : '');
    const state = document.createElement('span'); state.innerHTML = badge(r.status||'scheduled');
    head.appendChild(left); head.appendChild(state);

    const addr = document.createElement('div'); addr.className='muted small'; addr.textContent = r.address || '';

    const btns = document.createElement('div'); btns.className='row';

    async function postStatus(url, body){
      const resp = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(Object.assign({ when: new Date().toISOString() }, body||{}))
      });
      if (!resp.ok) throw new Error('HTTP '+resp.status);
      if (window.teamCal?.refetchEvents) window.teamCal.refetchEvents();
    }

    const bOTW = document.createElement('button'); bOTW.className='btn'; bOTW.textContent='On the way';
    bOTW.onclick = async () => {
      try { await postStatus('/api/tasks/'+r.task_id+'/ontheway'); state.innerHTML = badge('en_route'); flash('On the way ✓'); }
      catch { flash('Failed to update (OTW)'); }
    };

    const bArr = document.createElement('button'); bArr.className='btn'; bArr.textContent='Arrived';
    bArr.onclick = async () => {
      const note = '';
      try { await postStatus('/api/tasks/'+r.task_id+'/arrived', { note }); state.innerHTML = badge('in_progress'); flash('Arrived ✓'); }
      catch { flash('Arrived failed'); }
    };

    const bWip = document.createElement('button'); bWip.className='btn'; bWip.textContent='WIP';
    bWip.onclick = async () => {
      const note = prompt('Note for WIP / return tomorrow? (optional)') || '';
      try { await postStatus('/api/tasks/'+r.task_id+'/wip', { note }); state.innerHTML = badge('in_progress'); flash('WIP ✓'); }
      catch { flash('WIP failed'); }
    };

    const bDone = document.createElement('button'); bDone.className='btn'; bDone.textContent='Complete';
    bDone.onclick = () => openModal(r.task_id);

    const bDetails = document.createElement('button'); bDetails.className='btn'; bDetails.textContent='Details';
    bDetails.onclick = () => { window.location.href = '/team/task?id=' + encodeURIComponent(r.task_id); };

    const bDir = document.createElement('button'); bDir.className='btn'; bDir.textContent='Directions';
    bDir.onclick = () => window.open(mapUrl(r.address || SHOP_ORIGIN.addr), '_blank');

    const bCall = document.createElement('button'); bCall.className='btn'; bCall.textContent='Call';
    bCall.onclick = () => { if (r.cust_contact_phone) window.location.href = telHref(r.cust_contact_phone); else alert('No phone on file'); };

    btns.appendChild(bOTW);
    btns.appendChild(bArr);
    btns.appendChild(bWip);
    btns.appendChild(bDone);
    btns.appendChild(bDetails);
    if (r.address) btns.appendChild(bDir);
    if (r.cust_contact_phone) btns.appendChild(bCall);

    if (origin && Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
      const km = haversineKm(origin, {lat:r.lat, lng:r.lng});
      const min = minutesFromKm(km);
      if (km && min) {
        const travel = document.createElement('div');
        travel.className = 'muted small';
        const miles = km * 0.621371;
        travel.textContent = '≈ '+Math.round(min)+' min drive ('+miles.toFixed(1)+' mi) from origin';
        card.appendChild(travel);
      }
    }

    card.appendChild(head);
    card.appendChild(addr);
    card.appendChild(btns);
    host.appendChild(card);
  });

  $('#status').textContent = 'Loaded '+rows.length+' task(s).';
}

document.getElementById('loadBtn').addEventListener('click', load);

// --- Search button logic - FIXED ---
document.getElementById('searchBtn').addEventListener('click', async ()=>{
  const date = $('#day').value;
  const crew = $('#crew').value;
  const q = ($('#q').value||'').trim();
  if (!q) { flash('Type something to search'); return; }

  $('#status').textContent = 'Searching…';
  try {
    const params = { q };
    const crewTrimmed = (crew || '').trim();
    if (crewTrimmed) params.crew = crewTrimmed;
    
    const res = await j('/api/team/search' + buildQuery(params));
    let results = Array.isArray(res) ? res : [];
    
    // Client-side filter for installers: only show tasks assigned to their crew
    if (window._userRole && window._userCrew) {
      const installerRoles = ['installer', 'service', 'manufacturing', 'assembly', 'delivery'];
      if (installerRoles.includes(window._userRole)) {
        results = results.filter(r => (r.resource_name || '').trim() === window._userCrew);
      }
    }

    const host = $('#list'); host.innerHTML = '';
    if (!results.length) {
      $('#status').textContent = 'No matches.';
      return;
    }
    
    results.forEach(r=>{
      const card = document.createElement('div'); card.className='card';
      const head = document.createElement('div'); head.className='row'; head.style.justifyContent='space-between';
      const left = document.createElement('div');
      left.innerHTML =
        '<div style="font-weight:600">'+(r.customer_name||r.job_id)+'</div>'+
        '<div class="muted small">'+new Date(r.window_start).toLocaleString()+' → '+new Date(r.window_end).toLocaleString()+'</div>'+
        (r.name ? '<div class="muted small">'+r.name+'</div>' : '');
      const state = document.createElement('span'); state.innerHTML = badge(r.status||'scheduled');
      head.appendChild(left); head.appendChild(state);
      const addr = document.createElement('div'); addr.className='muted small'; addr.textContent = r.address || '';
      const btns = document.createElement('div'); btns.className='row';

      async function postStatus(url, body){
        const resp = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(Object.assign({ when: new Date().toISOString() }, body||{}))
        });
        if (!resp.ok) throw new Error('HTTP '+resp.status);
        if (window.teamCal?.refetchEvents) window.teamCal.refetchEvents();
      }

      const bOTW = document.createElement('button'); bOTW.className='btn'; bOTW.textContent='On the way';
      bOTW.onclick = async () => {
        try { await postStatus('/api/tasks/'+r.task_id+'/ontheway'); state.innerHTML = badge('en_route'); flash('On the way ✓'); }
        catch { flash('Failed to update (OTW)'); }
      };

      const bArr = document.createElement('button'); bArr.className='btn'; bArr.textContent='Arrived';
      bArr.onclick = async () => {
        const note = '';
        try { await postStatus('/api/tasks/'+r.task_id+'/arrived', { note }); state.innerHTML = badge('in_progress'); flash('Arrived ✓'); }
        catch { flash('Arrived failed'); }
      };

      const bWip = document.createElement('button'); bWip.className='btn'; bWip.textContent='WIP';
      bWip.onclick = async () => {
        const note = prompt('Note for WIP / return tomorrow? (optional)') || '';
        try { await postStatus('/api/tasks/'+r.task_id+'/wip', { note }); state.innerHTML = badge('in_progress'); flash('WIP ✓'); }
        catch { flash('WIP failed'); }
      };

      const bDone = document.createElement('button'); bDone.className='btn'; bDone.textContent='Complete';
      bDone.onclick = () => openModal(r.task_id);

      const bDet = document.createElement('button'); bDet.className='btn'; bDet.textContent='Details';
      bDet.onclick = () => { window.location.href = '/team/task?id='+encodeURIComponent(r.task_id); };

      btns.appendChild(bOTW);
      btns.appendChild(bArr);
      btns.appendChild(bWip);
      btns.appendChild(bDone);
      btns.appendChild(bDet);
      card.appendChild(head); card.appendChild(addr); card.appendChild(btns);
      host.appendChild(card);
    });
    $('#status').textContent = 'Found '+results.length+' match(es).';
  } catch(e) {
    console.error('Search error:', e);
    $('#status').textContent = 'Search error: '+(e.message||e);
  }
});

// Fetch and populate crew/team dropdown - FIXED
async function loadCrews() {
  const sel = document.getElementById('crew');
  sel.innerHTML = '<option value="">(All Crews)</option>';
  
  try {
    // Fetch current user to check role and crew assignment
    const userResp = await j('/api/auth/me').catch(() => ({}));
    const currentUser = userResp || {};
    const userRole = (currentUser.role || '').toLowerCase();
    const userCrew = currentUser.crew_name || '';

    // Fetch available crews - handle errors gracefully
    let crews = [];
    try {
      const crewsResp = await fetch('/api/crews');
      if (crewsResp.ok) {
        const data = await crewsResp.json();
        crews = Array.isArray(data) ? data : (data.rows || []);
      }
    } catch (e) {
      console.error('Failed to load crews:', e);
    }

    crews.filter(c => c.active !== false).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name || '';
      opt.textContent = c.name || '(unnamed)';
      sel.appendChild(opt);
    });

    // Installer privacy: auto-select their crew and lock the dropdown
    const installerRoles = ['installer', 'service', 'manufacturing', 'assembly', 'delivery'];
    if (installerRoles.includes(userRole)) {
      if (userCrew) {
        sel.value = userCrew;
        sel.disabled = true;
        sel.style.opacity = '0.6';
        sel.style.cursor = 'not-allowed';
        window._userCrew = userCrew;
        window._userRole = userRole;
      } else {
        flash('⚠️ No crew assigned to your account. Contact admin.');
      }
    }

  } catch (e) {
    console.error('loadCrews error:', e);
    sel.innerHTML = '<option value="">(Error loading crews)</option>';
  }
}
document.addEventListener('DOMContentLoaded', loadCrews);

// FullCalendar for Team Hub (Week/Day view) - FIXED
(() => {
  const $ = (id)=>document.getElementById(id);

  let cal;
  const LAST_TEAM_VIEW = 'team_cal_view';

  function baseTaskId(event) {
    return (event.extendedProps && event.extendedProps.task_id)
      ? event.extendedProps.task_id
      : String(event.id || '').split(':')[0];
  }

  async function initCalendar() {
    const el = $('teamCal');
    if (!el) return;

    const lastView = localStorage.getItem(LAST_TEAM_VIEW);
    const initialView = (lastView === 'timeGridDay' || lastView === 'timeGridWeek') ? lastView : 'timeGridWeek';

    const typeKey = (t)=>{
      t = String(t||'').toLowerCase();
      if (t.startsWith('manu')) return 'manufacturing';
      if (t.startsWith('paint')) return 'paint';
      if (t.startsWith('assem')) return 'assembly';
      if (t.startsWith('deliv')) return 'delivery';
      if (t.startsWith('inst')) return 'install';
      if (t.startsWith('serv')) return 'service';
      return '';
    };
    const statusKey = (s)=>{
      s = String(s||'').toLowerCase();
      if (s === 'en_route' || s === 'on_the_way' || s === 'otw') return 'en_route';
      if (s === 'in_progress' || s === 'arrived') return 'in_progress';
      if (s === 'wip') return 'wip';
      if (s === 'complete' || s === 'completed') return 'complete';
      return 'scheduled';
    };

    cal = new FullCalendar.Calendar(el, {
      initialView,
      headerToolbar: { left:'prev,today,next', center:'title', right:'timeGridWeek,timeGridDay' },
      height: 'auto',
      expandRows: true,
      slotMinTime: '06:00:00',
      slotMaxTime: '18:00:00',
      nowIndicator: true,
      allDaySlot: false,
      editable: false,
      selectable: false,

      events: async (info, success, failure) => {
        try {
          const params = { start: info.startStr, end: info.endStr };
          const crew = ($('crew')?.value || '').trim();
          if (crew) params.crew = crew;

          const r = await fetch('/api/calendar/events' + buildQuery(params));
          
          // Handle non-200 responses
          if (!r.ok) {
            console.error('Calendar API error:', r.status);
            success([]);
            return;
          }

          const d = await r.json();
          
          // Ensure we have an array
          let evts = Array.isArray(d) ? d : (d.events || d.rows || []);
          if (!Array.isArray(evts)) evts = [];

          // client fallback for crew filter
          if (crew) {
            evts = evts.filter(e => {
              const rn = (e.resource_name || (e.extendedProps && e.extendedProps.resource_name) || '').trim();
              return rn === crew;
            });
          }

          // ensure extendedProps we need
          evts = evts.map(e => {
            e.extendedProps = Object.assign({}, e.extendedProps || {}, {
              task_type: e.extendedProps?.task_type || e.task_type || '',
              status:    e.extendedProps?.status    || e.status    || 'scheduled',
              resource_name: e.extendedProps?.resource_name || e.resource_name || ''
            });
            return e;
          });

          success(evts);
        } catch (e) { 
          console.error('Calendar events error:', e);
          success([]);
        }
      },

      eventClassNames: (arg) => {
        const t = typeKey(arg.event.extendedProps.task_type || arg.event.title);
        const classes = [];
        if (t) classes.push('ev-'+t);
        const s = statusKey(arg.event.extendedProps.status);
        if (s) classes.push('st-'+s);
        return classes;
      },

      eventDidMount: (info) => {
        const s = statusKey(info.event.extendedProps.status);
        const badge = document.createElement('span');
        badge.className = 'badge ' + s;
        badge.textContent =
          s === 'en_route'    ? 'OTW' :
          s === 'in_progress' ? 'ARRIVED' :
          s === 'wip'         ? 'WIP' :
          s === 'complete'    ? 'DONE' : 'SCHED';
        const main = info.el.querySelector('.fc-event-title, .fc-event-main');
        (main || info.el).appendChild(badge);
      },

      eventClick: (info) => {
        const id = baseTaskId(info.event);
        if (id) window.location.href = '/team/task?id=' + encodeURIComponent(id);
      },

      datesSet: (arg) => {
        localStorage.setItem(LAST_TEAM_VIEW, arg.view.type);
        try {
          const d = arg.view.currentStart;
          const mm = String(d.getMonth()+1).padStart(2,'0');
          const dd = String(d.getDate()).padStart(2,'0');
          const yyyy = d.getFullYear();
          if ($('day')) $('day').value = yyyy + '-' + mm + '-' + dd;
        } catch {}
      }
    });

    cal.render();
    window.teamCal = cal;
  }

  function wireCalendarControls() {
    const loadBtn = $('loadBtn');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        if (!window.teamCal) return;
        const val = $('day')?.value || '';
        const d = val ? new Date(val) : null;
        if (d && !isNaN(d.getTime())) window.teamCal.gotoDate(d);
        window.teamCal.refetchEvents();
      });
    }

    const crewSel = $('crew');
    if (crewSel) {
      crewSel.addEventListener('change', () => {
        if (window.teamCal) window.teamCal.refetchEvents();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initCalendar();
    wireCalendarControls();
  });
})();
</script>
` + footCommon());
  });
}