// routes/job-hub.js (ESM)
import express from "express";

export default function registerJobHub(app, pool) {
  // ---------- PAGE ----------
  app.get("/job-hub", (_req, res) => {
    res.type("html").send(getJobHubHTML());
  });

  // ---------- LOOKUPS ----------
  app.get("/api/builders", async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, name FROM public.builders ORDER BY name`
      );
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error:"server_error" }); }
  });

  app.get("/api/builders/:id/communities", async (req, res) => {
    const id = Number(req.params.id||0);
    try {
      const { rows } = await pool.query(
        `SELECT id, name FROM public.communities WHERE builder_id=$1 ORDER BY name`, [id]
      );
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error:"server_error" }); }
  });

  app.get("/api/hierarchy/jobs", async (req, res) => {
    const builderId = req.query.builder_id? Number(req.query.builder_id): null;
    const communityId = req.query.community_id? Number(req.query.community_id): null;
    const q = (req.query.q||"").trim();
    const params = [];
    const where = [];
    if (builderId) { params.push(builderId); where.push(`j.builder_id=$${params.length}`); }
    if (communityId) { params.push(communityId); where.push(`j.community_id=$${params.length}`); }
    if (q) {
      params.push(`%${q}%`, `%${q}%`);
      where.push(`(CAST(j.id AS TEXT) ILIKE $${params.length-1} OR j.customer_name ILIKE $${params.length})`);
    }
    const sql = `
      SELECT j.id, j.customer_name, j.address, j.status, j.builder_id, j.community_id
      FROM public.jobs j
      ${where.length? `WHERE ${where.join(" AND ")}`:""}
      ORDER BY j.id DESC
      LIMIT 100`;
    try {
      const { rows } = await pool.query(sql, params);
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error:"server_error" }); }
  });

  // ---------- GLOBAL SEARCH (builders/communities/jobs/bids) ----------
  app.get("/api/search/hierarchy", async (req, res) => {
    const term = (req.query.term||"").trim();
    if (!term) return res.json({ builders:[], communities:[], jobs:[], bids:[] });

    try {
      const [buildersQ, commsQ, jobsQ, bidsQ] = await Promise.all([
        pool.query(`SELECT id, name FROM public.builders WHERE name ILIKE $1 ORDER BY name LIMIT 10`, [`%${term}%`]),
        pool.query(`SELECT c.id, c.name, c.builder_id, b.name AS builder_name
                    FROM public.communities c
                    JOIN public.builders b ON b.id=c.builder_id
                    WHERE c.name ILIKE $1
                    ORDER BY c.name LIMIT 10`, [`%${term}%`]),
        pool.query(`SELECT id, customer_name, builder_id, community_id
                    FROM public.jobs
                    WHERE CAST(id AS TEXT) ILIKE $1 OR customer_name ILIKE $1
                    ORDER BY id DESC LIMIT 10`, [`%${term}%`]),
        pool.query(`SELECT b.id AS bid_id, b.job_id, b.builder_id, j.community_id, j.customer_name
                    FROM public.bids b
                    LEFT JOIN public.jobs j ON j.id=b.job_id
                    WHERE CAST(b.id AS TEXT) ILIKE $1 OR b.name ILIKE $1
                    ORDER BY b.id DESC LIMIT 10`, [`%${term}%`]),
      ]);
      res.json({
        builders: buildersQ.rows,
        communities: commsQ.rows,
        jobs: jobsQ.rows,
        bids: bidsQ.rows
      });
    } catch (e) { console.error(e); res.status(500).json({ error:"server_error" }); }
  });

  // ---------- HUB: everything for one job ----------
  app.get("/api/jobs/:id/purchasing-hub", async (req, res) => {
    const jobId = Number(req.params.id||0);
    if (!jobId) return res.status(400).json({ error:"bad_job" });
    try {
      const jobQ  = await pool.query(
        `SELECT id, customer_name, address, status, builder_id, community_id
         FROM public.jobs WHERE id=$1`, [jobId]);

      const bidsQ = await pool.query(
        `SELECT id, name, total_amount, deposit_amount, remaining_balance, tax_rate, deposit_pct
           FROM public.bids WHERE job_id=$1 ORDER BY id DESC`, [jobId]);

      // Prefer bid_quote_totals if available; else fall back to bids totals
      const quoteQ = await pool.query(
        `SELECT bqt.bid_id, bqt.total, bqt.deposit, bqt.remaining
           FROM public.bid_quote_totals bqt
           WHERE bqt.bid_id IN (SELECT id FROM public.bids WHERE job_id=$1)
           ORDER BY bid_id DESC LIMIT 1`, [jobId]);

      const poQ   = await pool.query(
        `SELECT po.id, po.job_id, po.vendor, po.brand, po.category, po.order_no,
                po.status, po.expected_date, po.placed_at,
                COALESCE((SELECT SUM(COALESCE(i.qty_required,0)) FROM public.purchase_order_items i WHERE i.po_id=po.id),0) AS req,
                COALESCE((SELECT SUM(COALESCE(i.qty_received,0)) FROM public.purchase_order_items i WHERE i.po_id=po.id),0) AS rec
           FROM public.purchase_orders po
          WHERE po.job_id=$1
          ORDER BY po.id DESC`, [jobId]);

      const poIds = poQ.rows.map(r=>r.id);
      const [itemsQ, rcptQ, docsQ] = poIds.length ? await Promise.all([
        pool.query(`SELECT * FROM public.purchase_order_items WHERE po_id = ANY($1::bigint[]) ORDER BY id`, [poIds]),
        pool.query(`SELECT * FROM public.purchase_receipts WHERE po_item_id IN (SELECT id FROM public.purchase_order_items WHERE po_id = ANY($1::bigint[])) ORDER BY received_at`, [poIds]),
        pool.query(`SELECT * FROM public.purchase_documents WHERE po_id = ANY($1::bigint[]) ORDER BY uploaded_at DESC`, [poIds]),
      ]) : [{rows:[]},{rows:[]},{rows:[]}];

      const readyQ = await pool.query(
        `SELECT job_id, customer_name, req, rec, material_ready
           FROM public.job_material_readiness WHERE job_id=$1`, [jobId]);

      const bidEventsQ = bidsQ.rows.length ? await pool.query(
        `SELECT * FROM public.bid_events WHERE bid_id = ANY($1::int[]) ORDER BY created_at DESC`,
        [bidsQ.rows.map(b=>b.id)]
      ) : { rows: [] };

      const jobEventsQ = await pool.query(
        `SELECT * FROM public.job_events WHERE job_id::text = $1::text ORDER BY created_at DESC`,
        [String(jobId)]
      );

      // Quote totals
      let quote = null;
      if (quoteQ.rows[0]) {
        quote = {
          bid_id: quoteQ.rows[0].bid_id,
          total: Number(quoteQ.rows[0].total||0),
          deposit: Number(quoteQ.rows[0].deposit||0),
          remaining: Number(quoteQ.rows[0].remaining||0),
        };
        // try to fetch deposit_pct & tax_rate from bids row
        const b = bidsQ.rows.find(x=>x.id===quote.bid_id);
        if (b) { quote.deposit_pct = Number(b.deposit_pct||0); quote.tax_rate = Number(b.tax_rate||0); }
      } else if (bidsQ.rows[0]) {
        const b = bidsQ.rows[0];
        quote = {
          bid_id: b.id,
          total: Number(b.total_amount||0),
          deposit: Number(b.deposit_amount||0),
          remaining: Number(b.remaining_balance||0),
          deposit_pct: Number(b.deposit_pct||0),
          tax_rate: Number(b.tax_rate||0),
        };
      }

      // Pack child maps
      const itemsByPo = new Map(); for (const r of itemsQ.rows) { (itemsByPo.get(r.po_id)||itemsByPo.set(r.po_id,[]).get(r.po_id)).push(r); }
      const rcptByItem = new Map(); for (const r of rcptQ.rows) { (rcptByItem.get(r.po_item_id)||rcptByItem.set(r.po_item_id,[]).get(r.po_item_id)).push(r); }
      const docsByPo = new Map(); for (const r of docsQ.rows) { (docsByPo.get(r.po_id)||docsByPo.set(r.po_id,[]).get(r.po_id)).push(r); }

      const pos = poQ.rows.map(po => {
        const items = (itemsByPo.get(po.id)||[]).map(it => ({ ...it, receipts: rcptByItem.get(it.id)||[] }));
        const docs = docsByPo.get(po.id)||[];
        return { ...po, items, docs };
      });

      res.json({
        job: jobQ.rows[0] || null,
        quote,
        bids: bidsQ.rows,
        pos,
        readiness: readyQ.rows[0] || { job_id: jobId, req:0, rec:0, material_ready:false },
        bid_events: bidEventsQ.rows,
        job_events: jobEventsQ.rows
      });
    } catch (e) {
      console.error("hub", e);
      res.status(500).json({ error:"server_error" });
    }
  });

  // ---------- OPTIONAL: extend /api/po/list filters ----------
  app.get("/api/po/list", async (req, res, next) => next()); // let your existing handler run
}

// -------------------
// HTML (React via CDN)
// -------------------
function getJobHubHTML() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Job Hub</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body{ background:#0b0c10; color:#e5e7eb; }
  .card{ background:#0f121a; border:1px solid #1f2937; border-radius:14px; }
  .btn{ border:1px solid #334155; padding:8px 12px; border-radius:10px; background:#223152; color:#e5e7eb }
  .btn:hover{ background:#2b3a5c; border-color:#4a5a82 }
  .navbar{ background:#1a2338; border-bottom:1px solid #212432; padding:0 24px; display:flex; align-items:center; height:56px; }
  .navbar a{ color:#e5e7eb; text-decoration:none; margin-right:24px; font-weight:500; font-size:16px; }
  .navbar a.active{ color:#60a5fa; }
</style>
</head>
<body class="min-h-screen">
<nav class="navbar">
  <a href="/purchasing-dashboard">Purchasing Dashboard</a>
  <a href="/job-hub" class="active">Job Hub</a>
  <a href="/purchasing">Worklist</a>
</nav>
<div id="root" class="p-5"></div>

<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script type="module">
  const { useState, useEffect, useMemo } = React;

  const Chip = ({color="slate", children}) => {
    const map = {
      slate: "text-slate-200 border-slate-600/50 bg-slate-700/30",
      blue: "text-blue-200 border-blue-500/50 bg-blue-500/10",
      green:"text-emerald-200 border-emerald-500/50 bg-emerald-500/10",
      yellow:"text-amber-200 border-amber-500/50 bg-amber-500/10",
      red:"text-red-200 border-red-500/50 bg-red-500/10",
    };
    return React.createElement('span',{className:"inline-flex items-center rounded-full border px-2 py-0.5 text-xs "+map[color]},children);
  };

  const Section = ({title, right, children}) => (
    React.createElement('div',{className:"card p-4 shadow-sm"},
      React.createElement('div',{className:"mb-3 flex items-center gap-3"},
        React.createElement('h3',{className:"text-sm font-semibold text-slate-200 tracking-wide"},title),
        React.createElement('div',{className:"ml-auto"}, right)
      ),
      children
    )
  );

  const Field = ({label,value}) => (
    React.createElement('div',null,
      React.createElement('div',{className:"text-xs text-slate-400"},label),
      React.createElement('div',{className:"text-slate-100"}, value ?? "—")
    )
  );

  function useHierarchy(){
    const [builderId,setBuilderId]=useState("");
    const [communityId,setCommunityId]=useState("");
    const [jobId,setJobId]=useState("");
    const [builders,setBuilders]=useState([]);
    const [communities,setCommunities]=useState([]);
    const [jobs,setJobs]=useState([]);

    useEffect(()=>{ fetch('/api/builders').then(r=>r.json()).then(setBuilders).catch(()=>setBuilders([])); },[]);
    useEffect(()=>{
      if(!builderId){ setCommunities([]); return; }
      fetch('/api/builders/'+builderId+'/communities').then(r=>r.json()).then(setCommunities).catch(()=>setCommunities([]));
    },[builderId]);
    useEffect(()=>{
      const qs = new URLSearchParams();
      if(builderId) qs.set('builder_id',builderId);
      if(communityId) qs.set('community_id',communityId);
      fetch('/api/hierarchy/jobs?'+qs.toString()).then(r=>r.json()).then(setJobs).catch(()=>setJobs([]));
    },[builderId,communityId]);

    return { builderId,setBuilderId,communityId,setCommunityId,jobId,setJobId,builders,communities,jobs };
  }

  function GlobalSearch({ onChoose }){
    const [term,setTerm]=useState("");
    const [open,setOpen]=useState(false);
    const [sel,setSel]=useState(-1);
    const [res,setRes]=useState({builders:[],communities:[],jobs:[],bids:[]});

    useEffect(()=>{
      if(!term.trim()){ setOpen(false); setRes({builders:[],communities:[],jobs:[],bids:[]}); return; }
      const id = setTimeout(()=>{
        fetch('/api/search/hierarchy?term='+encodeURIComponent(term.trim()))
          .then(r=>r.json()).then(d=>{ setRes(d); setOpen(true); setSel(-1); })
          .catch(()=>{ setRes({builders:[],communities:[],jobs:[],bids:[]}); setOpen(false); });
      },200); return ()=>clearTimeout(id);
    },[term]);

    const items = useMemo(()=>{
      const a = [];
      res.jobs.forEach(j=>a.push({kind:'job', id:j.id, label:'Job #'+j.id+' — '+(j.customer_name||''), sub:'', builderId:j.builder_id, communityId:j.community_id, jobId:j.id}));
      res.bids.forEach(b=>a.push({kind:'bid', id:b.bid_id, label:'Bid #'+b.bid_id, sub:(b.job_id?('→ Job #'+b.job_id+' — '+(b.customer_name||'')):'(creates job on PO)'), builderId:b.builder_id, communityId:b.community_id, jobId:b.job_id}));
      res.builders.forEach(b=>a.push({kind:'builder', id:b.id, label:'Builder — '+b.name, sub:'' , builderId:b.id}));
      res.communities.forEach(c=>a.push({kind:'community', id:c.id, label:'Community — '+c.name, sub:(c.builder_name||''), builderId:c.builder_id, communityId:c.id}));
      return a.slice(0,20);
    },[res]);

    function choose(i){ if(i<0||i>=items.length) return; onChoose(items[i]); setOpen(false); setTerm(''); }
    function onKeyDown(e){
      if(!open||!items.length) return;
      if(e.key==='ArrowDown'){ e.preventDefault(); setSel(s=>Math.min(s+1,items.length-1)); }
      if(e.key==='ArrowUp'){ e.preventDefault(); setSel(s=>Math.max(s-1,0)); }
      if(e.key==='Enter'){ e.preventDefault(); choose(sel<0?0:sel); }
      if(e.key==='Escape'){ setOpen(false); }
    }

    return (
      React.createElement('div',{className:"relative w-full md:w-[520px]"},
        React.createElement('input',{value:term, onChange:e=>setTerm(e.target.value), onKeyDown,
          placeholder:"Search builder, community, customer, job #, or bid #…",
          className:"w-full rounded-xl border border-slate-700 bg-[#0f121a] px-3 py-2 pl-9 text-slate-100 outline-none focus:border-blue-500"}),
        React.createElement('span',{className:"pointer-events-none absolute left-2 top-2.5 text-slate-500"},"🔎"),
        open && items.length>0 && React.createElement('div',{className:"absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-800/70 bg-[#0f121a] shadow-xl"},
          items.map((r,i)=> React.createElement('div',{key:r.kind+'-'+r.id,
            className:"cursor-pointer px-3 py-2 text-sm "+(sel===i?"bg-slate-800/60":"hover:bg-slate-800/40"),
            onMouseEnter:()=>setSel(i), onClick:()=>choose(i)},
            React.createElement('div',{className:"flex items-center gap-2"},
              React.createElement(Chip,{color:r.kind==='job'?'blue':r.kind==='bid'?'yellow':r.kind==='builder'?'slate':'green'}, r.kind),
              React.createElement('div',{className:"text-slate-100"}, r.label)
            ),
            r.sub && React.createElement('div',{className:"ml-14 text-xs text-slate-500"}, r.sub)
          ))
        )
      )
    );
  }

  function JobHub() {
    const H = useHierarchy();
    const [tab,setTab]=useState('pos');
    const [hub,setHub]=useState(null);

    function applySearch(r){
      if(!r) return;
      if(r.kind==='builder'){ H.setBuilderId(r.builderId); H.setCommunityId(""); H.setJobId(""); setHub(null); }
      else if(r.kind==='community'){ H.setBuilderId(r.builderId); H.setCommunityId(r.communityId); H.setJobId(""); setHub(null); }
      else if(r.kind==='job'){ H.setBuilderId(r.builderId||""); H.setCommunityId(r.communityId||""); H.setJobId(r.jobId); fetchHub(r.jobId); }
      else if(r.kind==='bid'){ if(r.jobId){ H.setBuilderId(r.builderId||""); H.setCommunityId(r.communityId||""); H.setJobId(r.jobId); fetchHub(r.jobId);} }
    }

    function fetchHub(jobId){
      if(!jobId) return;
      fetch('/api/jobs/'+jobId+'/purchasing-hub').then(r=>r.json()).then(setHub).catch(()=>setHub(null));
    }

    useEffect(()=>{ if(H.jobId) fetchHub(H.jobId); },[H.jobId]);

    const jobRow = useMemo(()=> (H.jobs||[]).find(j=> String(j.id)===String(H.jobId)) || null, [H.jobs,H.jobId]);

    return (
      React.createElement('div',{className:"mx-auto max-w-7xl"},
        React.createElement('div',{className:"mb-4 flex flex-col gap-3 md:flex-row md:items-center"},
          React.createElement('div',{className:"flex items-center gap-3"},
            React.createElement('h1',{className:"text-xl font-semibold"},"Job Hub"),
            React.createElement('span',{className:"rounded-xl border border-slate-700 px-2 py-0.5 text-xs text-slate-300"},"Live")
          ),
          React.createElement(GlobalSearch,{ onChoose: applySearch }),
        ),

        React.createElement('div',{className:"mb-4 grid gap-3 md:grid-cols-3"},
          React.createElement('div',null,
            React.createElement('div',{className:"mb-1 text-xs text-slate-400"},"Builder"),
            React.createElement('select',{value:H.builderId, onChange:e=>{H.setBuilderId(e.target.value); H.setCommunityId(''); H.setJobId(''); setHub(null);},
              className:"w-full rounded-xl border border-slate-700 bg-[#0b0c10] px-3 py-2"},
              React.createElement('option',{value:""},"Select a builder"),
              (H.builders||[]).map(b=> React.createElement('option',{key:b.id, value:b.id}, b.name))
            )
          ),
          React.createElement('div',null,
            React.createElement('div',{className:"mb-1 text-xs text-slate-400"},"Community"),
            React.createElement('select',{value:H.communityId, onChange:e=>{H.setCommunityId(e.target.value); H.setJobId(''); setHub(null);},
              className:"w-full rounded-xl border border-slate-700 bg-[#0b0c10] px-3 py-2"},
              React.createElement('option',{value:""},"Select a community"),
              (H.communities||[]).map(c=> React.createElement('option',{key:c.id, value:c.id}, c.name))
            )
          ),
          React.createElement('div',null,
            React.createElement('div',{className:"mb-1 text-xs text-slate-400"},"Job"),
            React.createElement('select',{value:H.jobId, onChange:e=>{H.setJobId(e.target.value);},
              className:"w-full rounded-xl border border-slate-700 bg-[#0b0c10] px-3 py-2"},
              React.createElement('option',{value:""},"Select a job"),
              (H.jobs||[]).map(j=> React.createElement('option',{key:j.id, value:j.id}, '#'+j.id+' — '+(j.customer_name||'')))
            )
          )
        ),

        !hub && React.createElement('div',{className:"card border-dashed p-10 text-center text-slate-400"},"Search above or pick Builder → Community → Job"),

        hub && React.createElement(React.Fragment,null,
          React.createElement(Section,{title:"Job Summary",
            right: React.createElement(Chip,{color: hub?.readiness?.material_ready?'green':'yellow'},
              hub?.readiness?.material_ready?'Material Ready':'Awaiting Materials')
          },
            React.createElement('div',{className:"grid grid-cols-1 gap-3 md:grid-cols-4"},
              React.createElement(Field,{label:"Job", value: '#'+hub.job.id+' — '+(hub.job.customer_name||'')}),
              React.createElement(Field,{label:"Address", value: hub.job.address||'—'}),
              React.createElement(Field,{label:"Status", value: hub.job.status||'—'}),
              React.createElement(Field,{label:"Materials", value: (hub.readiness?.rec||0)+'/'+(hub.readiness?.req||0)})
            )
          ),

          React.createElement('div',{className:"mt-4 grid gap-4 md:grid-cols-3"},
            React.createElement('div',{className:"md:col-span-2 space-y-4"},
              React.createElement(Section,{title:"Financials",
                right: hub.quote ? React.createElement(Chip,{color: (hub.quote.remaining||0)===0?'green':'blue'},
                  (hub.quote.remaining||0)===0?'Paid in Full':'Open Balance') : null
              },
                hub.quote ? React.createElement('div',{className:"grid gap-4 md:grid-cols-3"},
                  React.createElement('div',{className:"rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"},
                    React.createElement(Field,{label:"Bid", value:'#'+hub.quote.bid_id})
                  ),
                  React.createElement('div',{className:"rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"},
                    React.createElement(Field,{label:"Total", value:'$'+Number(hub.quote.total||0).toLocaleString()})
                  ),
                  React.createElement('div',{className:"rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"},
                    React.createElement(Field,{label:"Deposit", value:'$'+Number(hub.quote.deposit||0).toLocaleString()})
                  ),
                  React.createElement('div',{className:"rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"},
                    React.createElement(Field,{label:"Remaining", value:'$'+Number(hub.quote.remaining||0).toLocaleString()})
                  ),
                  React.createElement('div',{className:"rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"},
                    React.createElement(Field,{label:"Tax Rate", value: (hub.quote.tax_rate!=null)? ((hub.quote.tax_rate*100).toFixed(2)+'%'):'—'})
                  ),
                ) : React.createElement('div',{className:"text-sm text-slate-400"},"No quote on file.")
              ),

              React.createElement('div', {className:"flex items-center gap-2"},
                ['pos','items','docs','history'].map(k=> React.createElement('button',{key:k, onClick:()=>setTab(k),
                  className:"rounded-xl border px-3 py-1.5 text-sm "+(tab===k?'border-blue-500/60 bg-blue-500/10 text-blue-200':'border-slate-700 hover:bg-slate-800/40')},
                  k==='pos'?'POs':(k[0].toUpperCase()+k.slice(1))
                ))
              ),

              tab==='pos' && React.createElement(Section,{title:"Purchase Orders",
                right: React.createElement('span',{className:"text-xs text-slate-400"}, (hub.pos||[]).length+' total')
              },
                (hub.pos||[]).length===0 ? React.createElement('div',{className:"text-sm text-slate-400"},"No POs.")
                : React.createElement('div',{className:"overflow-x-auto"},
                    React.createElement('table',{className:"w-full text-sm"},
                      React.createElement('thead',null,
                        React.createElement('tr',{className:"text-slate-400"},
                          React.createElement('th',{className:"py-2 pr-4 text-left"},"PO #"),
                          React.createElement('th',{className:"py-2 pr-4 text-left"},"Vendor"),
                          React.createElement('th',{className:"py-2 pr-4 text-left"},"Category"),
                          React.createElement('th',{className:"py-2 pr-4 text-left"},"Status"),
                          React.createElement('th',{className:"py-2 pr-4 text-left"},"Expected"),
                          React.createElement('th',{className:"py-2 pr-4 text-right"},"Req → Rec"),
                        )
                      ),
                      React.createElement('tbody',null,
                        (hub.pos||[]).map(po => React.createElement('tr',{key:po.id, className:"border-t border-slate-800/70 hover:bg-slate-900/40"},
                          React.createElement('td',{className:"py-2 pr-4"},
                            React.createElement('a',{href:'#', onClick:(e)=>{e.preventDefault(); window.alert('Open PO '+po.id+' in the existing drawer on the PO dashboard. (Reuse your /purchasing-dashboard drawer logic.)');}, className:"underline decoration-dotted"}, po.id)
                          ),
                          React.createElement('td',{className:"py-2 pr-4"}, (po.vendor||'')+(po.brand?(' — '+po.brand):'')),
                          React.createElement('td',{className:"py-2 pr-4"}, po.category||'—'),
                          React.createElement('td',{className:"py-2 pr-4"},
                            po.status==='received' && React.createElement(Chip,{color:'green'},'received'),
                            po.status==='ordered' && React.createElement(Chip,{color:'blue'},'ordered'),
                            po.status==='pending' && React.createElement(Chip,{color:'yellow'},'pending'),
                            po.status==='partial_received' && React.createElement(Chip,{color:'red'},'partial')
                          ),
                          React.createElement('td',{className:"py-2 pr-4"}, po.expected_date||'—'),
                          React.createElement('td',{className:"py-2 pr-4 text-right"}, (po.rec||0)+'/'+(po.req||0)),
                        ))
                      )
                    )
                  )
              ),

              tab==='items' && React.createElement(Section,{title:"All Items & Receipts"},
                (hub.pos||[]).length===0 ? React.createElement('div',{className:"text-sm text-slate-400"},"No POs.")
                : React.createElement('div',{className:"space-y-3"},
                    (hub.pos||[]).map(po => React.createElement('div',{key:po.id, className:"rounded-2xl border border-slate-800/70 bg-slate-900/30 p-3"},
                      React.createElement('div',{className:"mb-1 flex items-center gap-2"},
                        React.createElement('span',{className:"text-slate-300"}, 'PO #'+po.id),
                        React.createElement('span',{className:"text-xs text-slate-500"}, po.vendor||'')
                      ),
                      React.createElement('div',{className:"grid gap-2 sm:grid-cols-2"},
                        (po.items||[]).map(it => React.createElement('div',{key:it.id, className:"rounded-xl border border-slate-800/70 bg-slate-900/40 p-3"},
                          React.createElement('div',{className:"text-slate-100"}, it.description||it.sku||'Item'),
                          React.createElement('div',{className:"text-xs text-slate-500"}, (it.qty_received||0)+'/'+(it.qty_required||0)+' '+(it.unit||'ea'))
                        ))
                      )
                    ))
                  )
              ),

              tab==='docs' && React.createElement(Section,{title:"Documents (Confirmations / BOL)"},
                ((hub.pos||[]).flatMap(po => (po.docs||[])).length===0)
                  ? React.createElement('div',{className:"text-sm text-slate-400"},"No documents yet.")
                  : React.createElement('ul',{className:"space-y-2"},
                      (hub.pos||[]).flatMap(po => (po.docs||[]).map(d => ({...d, po_id:po.id}))).map(d =>
                        React.createElement('li',{key:d.id, className:"flex items-center justify-between rounded-xl border border-slate-800/70 bg-slate-900/30 p-3"},
                          React.createElement('div',null,
                            React.createElement('div',{className:"text-slate-100"}, d.file_name||'document'),
                            React.createElement('div',{className:"text-xs text-slate-500"}, 'PO #'+d.po_id+' · '+(d.kind||'doc'))
                          ),
                          React.createElement('a',{href:d.url, className:"text-xs underline decoration-dotted", target:"_blank"}, "Open")
                        )
                      )
                    )
              ),

              tab==='history' && React.createElement(Section,{title:"History"},
                (hub.bid_events||[]).length===0 && (hub.job_events||[]).length===0
                  ? React.createElement('div',{className:"text-sm text-slate-400"},"No events yet.")
                  : React.createElement('ol',{className:"space-y-3"}, 
                      (hub.bid_events||[]).map((ev,i)=> React.createElement('li',{key:'be'+i, className:"relative pl-6"},
                        React.createElement('span',{className:"absolute left-0 top-1.5 inline-block h-3 w-3 rounded-full bg-blue-500"}),
                        React.createElement('div',{className:"text-xs text-slate-500"}, new Date(ev.created_at).toLocaleString()),
                        React.createElement('div',{className:"text-slate-100"}, ev.event_type)
                      )),
                      (hub.job_events||[]).map((ev,i)=> React.createElement('li',{key:'je'+i, className:"relative pl-6"},
                        React.createElement('span',{className:"absolute left-0 top-1.5 inline-block h-3 w-3 rounded-full bg-emerald-500"}),
                        React.createElement('div',{className:"text-xs text-slate-500"}, new Date(ev.created_at).toLocaleString()),
                        React.createElement('div',{className:"text-slate-100"}, ev.event_type)
                      ))
                    )
              )
            ),

            React.createElement('div',{className:"space-y-4"},
              React.createElement(Section,{title:"Customer & Contacts"},
                React.createElement('div',{className:"grid grid-cols-2 gap-3 text-sm"},
                  React.createElement(Field,{label:"Customer", value: hub.job.customer_name}),
                  React.createElement(Field,{label:"Address", value: hub.job.address||'—'}),
                  React.createElement(Field,{label:"Job #", value:'#'+hub.job.id}),
                  React.createElement(Field,{label:"PO Count", value:String((hub.pos||[]).length)}),
                )
              ),
              React.createElement(Section,{title:"Shortcuts"},
                React.createElement('div',{className:"flex flex-wrap gap-2 text-sm"},
                  React.createElement('a',{href:'/purchasing-dashboard', className:"btn"},"Open PO Dashboard"),
                  React.createElement('a',{href:'/purchasing', className:"btn"},"Open Worklist")
                )
              )
            )
          )
        )
      )
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(JobHub));
</script>
</body>
</html>`;
}
