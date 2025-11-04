(() => {
  // --- event type to class and color ---
  const typeToClass = {
    manufacturing: 'p-mfg',
    paint: 'p-paint',
    assembly: 'p-asm',
    delivery: 'p-del',
    install: 'p-inst',
    service: 'p-svc'
  };
  const styles = {
    'p-mfg':'#3b82f6','p-paint':'#8b5cf6','p-asm':'#f59e0b',
    'p-del':'#14b8a6','p-inst':'#22c55e','p-svc':'#ef4444'
  };

  // --- color map (same as Admin) ---
  const TYPE_COLOR = {
    manufacturing: '#3b82f6',
    paint:         '#8b5cf6',
    assembly:      '#f59e0b',
    delivery:      '#14b8a6',
    install:       '#22c55e',
    service:       '#ef4444'
  };
  function colorFor(ev){
    const t = (ev.extendedProps?.type || '').toLowerCase();
    if (t.includes('mfg')) return TYPE_COLOR.manufacturing;
    if (t.includes('paint')) return TYPE_COLOR.paint;
    if (t.includes('asm') || t.includes('assembly')) return TYPE_COLOR.assembly;
    if (t.includes('del')) return TYPE_COLOR.delivery;
    if (t.includes('svc') || t.includes('service')) return TYPE_COLOR.service;
    return TYPE_COLOR.install;
  }
  function decorateEvent(ev){
    const cls = typeToClass[(ev.type||'').toLowerCase()];
    ev.classNames = cls ? [cls] : [];
    if (cls && styles[cls]) {
      ev.backgroundColor = styles[cls];
      ev.borderColor = styles[cls];
      ev.textColor = '#ffffff';
    }
    return ev;
  }
  function fmtRange(start, end){
    const opts = { month:'short', day:'numeric' };
    return `${start.toLocaleDateString(undefined,opts)} – ${end.toLocaleDateString(undefined,opts)}`;
  }
  function toast(msg, ok=true){
    let t=document.getElementById('cal-toast');
    if(!t){ t=document.createElement('div'); t.id='cal-toast';
      t.style.cssText='position:fixed;bottom:18px;right:18px;padding:10px 12px;border-radius:10px;border:1px solid #2a2f3f;background:#0f121a;color:#cfe;z-index:9999';
      document.body.appendChild(t);
    }
    t.style.borderColor = ok ? '#2a2f3f' : '#7a2a2a';
    t.style.background = ok ? '#0f121a' : '#2a0f10';
    t.textContent=msg; setTimeout(()=>{ if(t) t.remove(); }, 1800);
  }
  async function patchEventMove(id, startStr, endStr){
    const r = await fetch(`/api/calendar/events/${id}`, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ start: startStr, end: endStr })
    });
    if(!r.ok) throw new Error(await r.text());
  }
  function startOfWeek(d){
    const x=new Date(d); const day=(x.getDay()+7)%7;
    x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x;
  }
  function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

  document.addEventListener('DOMContentLoaded', async () => {
  const calEl = document.getElementById('calendar');
  const rangeEl = document.getElementById('calRange');
  const sel = document.getElementById('calFilter');
  const prev = document.getElementById('calPrev');
  const next = document.getElementById('calNext');
  const params = new URLSearchParams(location.search);
  const initialDate = params.get('d') || undefined;
  const initialView = params.get('v') || 'dayGridMonth';

    // Week strip UI
    const wrap = document.querySelector('.wrap');
    const strip = document.createElement('div');
    strip.className='panel';
    strip.style.display='flex';
    strip.style.gap='6px';
    strip.style.alignItems='center';
    strip.style.flexWrap='wrap';
    strip.style.marginTop='6px';
    wrap.insertBefore(strip, calEl);

    function renderStrip(currentDate){
      strip.innerHTML='';
      const start = startOfWeek(currentDate);
      for(let i=0;i<7;i++){
        const d = addDays(start, i);
        const b = document.createElement('button');
        b.className='btn';
        b.textContent = d.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
        b.onclick = ()=> calendar.gotoDate(d);
        strip.appendChild(b);
      }
    }

    const calendar = new FullCalendar.Calendar(calEl, {
      initialView,
      initialDate,
      height: 'auto',
      nowIndicator: true,
      editable: true,
      droppable: false,
      eventDurationEditable: true,
      eventStartEditable: true,
      slotMinTime: '06:00:00',
      slotMaxTime: '18:00:00',
      allDaySlot: false,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
      },
      events: async (info, success, failure) => {
        try {
          const url = `/api/calendar/events?start=${encodeURIComponent(info.startStr)}&end=${encodeURIComponent(info.endStr)}&filter=scheduled`;
          const r = await fetch(url);
          const data = await r.json();
          success(data.events || []);
        } catch (e) { failure(e); }
      },
      eventDidMount: (info) => {
        const c = colorFor(info.event);
        info.el.style.backgroundColor = c;
        info.el.style.borderColor = c;
        info.el.style.color = '#fff';
        info.el.style.opacity = '1';
      },
      datesSet: (arg) => {
        rangeEl.textContent = fmtRange(arg.start, arg.end);
        renderStrip(arg.start);
      },
      eventClick: (info) => {
        const baseId = info.event.extendedProps?.task_id || String(info.event.id).split(':')[0];
        if (baseId) window.openTaskSummary(baseId);
      },
      eventDrop: async (info) => {
        try {
          await fetch(`/api/calendar/events/${info.event.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start: info.event.start.toISOString(), end: info.event.end?.toISOString() })
          });
        } catch { info.revert(); }
      },
      eventResize: async (info) => {
        try {
          await fetch(`/api/calendar/events/${info.event.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start: info.event.start.toISOString(), end: info.event.end?.toISOString() })
          });
        } catch { info.revert(); }
      }
    });

    calendar.render();

    sel.onchange = ()=> calendar.refetchEvents();
    prev.onclick = ()=> calendar.prev();
    next.onclick = ()=> calendar.next();
  });
})();
