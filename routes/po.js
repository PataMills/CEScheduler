import express from "express";
import { pool } from "../db.js";
import fs from "node:fs";
import path from "node:path";
import { requireRoleApi } from "./auth.js";
const router = express.Router();

const SUBMIT_ROLES = ["admin", "ops", "sales", "purchasing"];

function computeNeededBy(installDate) {
  if (!installDate) return null;
  const d = new Date(installDate);
  if (Number.isNaN(d.valueOf())) return null;
  d.setDate(d.getDate() - 14);
  return d.toISOString().slice(0, 10);
}

async function handleSubmitToPurchasing(req, res) {
  const rawBid = req.body?.bidId ?? req.body?.bid_id;
  const bidId = Number(rawBid);
  if (!Number.isFinite(bidId) || bidId <= 0) {
    res.status(400).json({ error: 'bad_bid_id' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bidResult = await client.query(
      `SELECT b.id, b.job_id, j.install_date
         FROM public.bids b
         LEFT JOIN public.jobs j ON j.id = b.job_id
        WHERE b.id = $1
        LIMIT 1`,
      [bidId]
    );

    if (!bidResult.rowCount) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'bid_not_found' });
      return;
    }

    const bid = bidResult.rows[0];
    const jobId = bid.job_id || null;
    const installDate = bid.install_date || null;

    let purchaseOrder = null;
    try {
      const poInsert = await client.query(
        `INSERT INTO public.purchase_orders (job_id, vendor, status)
         VALUES ($1, $2, 'draft')
         RETURNING id, status`,
        [jobId, 'TBD']
      );
      purchaseOrder = poInsert.rows[0] || null;
    } catch (poErr) {
      const code = poErr?.code;
      const message = String(poErr?.message || '').toLowerCase();
      if (!(code === '42P01' || code === '42703' || message.includes('does not exist'))) {
        throw poErr;
      }
      console.warn('[po-submit] purchase_orders insert skipped:', poErr.message);
    }

    if (jobId) {
      try {
        const existing = await client.query(
          `SELECT 1
             FROM public.purchase_queue
            WHERE job_id = $1
              AND item_name = 'Order verification'
            LIMIT 1`,
          [jobId]
        );

        if (!existing.rowCount) {
          const neededBy = computeNeededBy(installDate);
          await client.query(
            `INSERT INTO public.purchase_queue
              (job_id, item_name, spec, needed_by, vendor, status)
             VALUES ($1, $2, $3::jsonb, $4, $5, 'pending')`,
            [
              jobId,
              'Order verification',
              JSON.stringify({ source: 'po_submit', bid_id: bidId }),
              neededBy,
              'TBD'
            ]
          );
        }
      } catch (queueErr) {
        const code = queueErr?.code;
        const message = String(queueErr?.message || '').toLowerCase();
        if (!(code === '42P01' || code === '42703' || message.includes('does not exist'))) {
          throw queueErr;
        }
        console.warn('[po-submit] purchase_queue insert skipped:', queueErr.message);
      }
    }

    try {
      await client.query(
        `INSERT INTO public.bid_events (bid_id, event_type, meta)
         VALUES ($1, 'purchasing_submitted', $2::jsonb)`,
        [
          bidId,
          JSON.stringify({
            by: req.user?.uid || null,
            at: new Date().toISOString(),
            po_id: purchaseOrder?.id || null
          })
        ]
      );
    } catch (eventErr) {
      const code = eventErr?.code;
      const message = String(eventErr?.message || '').toLowerCase();
      if (!(code === '42P01' || code === '42703' || message.includes('does not exist'))) {
        throw eventErr;
      }
      console.warn('[po-submit] bid_events insert skipped:', eventErr.message);
    }

    await client.query('COMMIT');
    res.json({
      ok: true,
      bid_id: bidId,
      job_id: jobId,
      po_id: purchaseOrder?.id || null,
      status: purchaseOrder?.status || null
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[po-submit error]', err);
    res.status(500).json({ error: 'submit_failed' });
  } finally {
    client.release();
  }
}

// --- LIST POs for dashboard tabs ---
// ...existing code...
router.get('/api/po/list', async (req, res) => {
  try {
    const { status, job_id } = req.query;
    const builder_id = req.query.builder_id ? Number(req.query.builder_id) : null;
    const community_id = req.query.community_id ? Number(req.query.community_id) : null;
    const params = [];
    const where = [];
    if (status) { params.push(status); where.push(`po.status = $${params.length}`); }
    if (job_id) { params.push(Number(job_id)); where.push(`po.job_id = $${params.length}`); }
    if (builder_id) { params.push(builder_id); where.push(`j.builder_id = $${params.length}`); }
    if (community_id) { params.push(community_id); where.push(`j.community_id = $${params.length}`); }
    const sql = `
      SELECT po.id, po.job_id, po.vendor, po.brand, po.category, po.order_no,
             po.status, po.expected_date, po.placed_at,
             j.customer_name, j.builder_id, j.community_id,
             COALESCE((SELECT count(*) FROM purchase_order_docs d WHERE d.po_id = po.id),0) AS doc_count,
             COALESCE((SELECT sum(COALESCE(i.qty_required,0)) FROM purchase_order_items i WHERE i.po_id = po.id),0) AS req,
             COALESCE((SELECT sum(COALESCE(i.qty_received,0)) FROM purchase_order_items i WHERE i.po_id = po.id),0) AS rec
        FROM public.purchase_orders po
        LEFT JOIN public.jobs j ON j.id = po.job_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY po.id DESC`;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('po/list', e); res.status(500).json({ error: 'server_error' });
  }
});

// --- Submit PO stub from Sales Review ---
router.post('/api/po/submit', requireRoleApi(SUBMIT_ROLES), async (req, res) => {
  await handleSubmitToPurchasing(req, res);
});

// --- CREATE a bare PO (used by + New PO) ---
router.post('/api/po', express.json(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { job_id: rawJobId, bid_id: rawBidId, vendor, brand=null, category=null, status='pending' } = req.body || {};
    if (!vendor) return res.status(400).json({ error: 'vendor_required' });
    const allowed = new Set(['pending','ordered','partial_received','received']);
    const safeStatus = allowed.has(String(status)) ? String(status) : 'pending';

    await client.query('BEGIN');

    let jobId = rawJobId ? Number(rawJobId) : null;
    const bidId = rawBidId ? Number(rawBidId) : null;

    // If no job_id provided, try resolving via bid_id
    if (!jobId && bidId) {
      const b = await client.query(`SELECT id, job_id, community_id, builder_id, customer_name FROM public.bids WHERE id=$1`, [bidId]);
      const bid = b.rows[0] || null;
      if (bid?.job_id) {
        jobId = Number(bid.job_id);
      } else if (bid) {
        // Create a minimal job from bid context if schema allows
        const ins = await client.query(
          `INSERT INTO public.jobs (customer_name, community_id, builder_id)
           VALUES ($1,$2,$3)
           RETURNING id`,
          [bid.customer_name || `Bid #${bidId}`, bid.community_id || null, bid.builder_id || null]
        );
        jobId = ins.rows[0].id;
        // back-link bid -> job if column exists
        try { await client.query(`UPDATE public.bids SET job_id = $2 WHERE id = $1`, [bidId, jobId]); } catch {}
      }
    }

    if (!jobId) return res.status(400).json({ error: 'job_or_bid_required' });

    const { rows } = await client.query(
      `INSERT INTO public.purchase_orders (job_id, vendor, brand, category, status)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, job_id, vendor, brand, category, status, expected_date, placed_at`,
      [Number(jobId), String(vendor), brand, category, safeStatus]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('po/create', e); res.status(500).json({ error: 'server_error', detail: e.message });
  } finally { client.release(); }
});

// Jobs search for modal autocomplete
router.get('/api/jobs/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);
    const like = `%${q}%`;
    const isNum = /^\d+$/.test(q);
    const sql = isNum
      ? `SELECT id, customer_name FROM public.jobs WHERE CAST(id AS TEXT) LIKE $1 OR customer_name ILIKE $1 ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 20`
      : `SELECT id, customer_name FROM public.jobs WHERE customer_name ILIKE $1 ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 20`;
    const { rows } = await pool.query(sql, [like]);
    res.json(rows);
  } catch (e) {
    console.error('jobs/search', e); res.status(500).json({ error:'server_error' });
  }
});

// --- UPDATE PO header (drawer: order_no / expected_date / status / placed_at) ---
router.patch('/api/po/:id', express.json(), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_po' });
  try {
    const fields = [];
    const vals = []; let i = 1;
    for (const [k,v] of Object.entries(req.body||{})) {
      if (!['vendor','brand','category','order_no','status','expected_date','placed_at','meta'].includes(k)) continue;
      fields.push(`${k} = $${i++}`); vals.push(v);
    }
    if (!fields.length) return res.json({ ok:true });
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE public.purchase_orders SET ${fields.join(', ')}, meta = COALESCE(meta,'{}'::jsonb)
         WHERE id = $${i} RETURNING *`, vals
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('po/patch', e); res.status(500).json({ error: 'server_error' });
  }
});

// --- Items endpoints the drawer uses (if you don't have them yet) ---
router.get('/api/po/:id/items', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, sku, description, unit, qty_required, qty_ordered, qty_received
         FROM public.purchase_order_items WHERE po_id = $1 ORDER BY id`, [Number(req.params.id)]
    );
    res.json(rows);
  } catch (e) { console.error('po/items list', e); res.status(500).json({ error:'server_error' }); }
});

router.post('/api/po/:id/items', express.json(), async (req, res) => {
  try {
    const po_id = Number(req.params.id);
    const { sku=null, description='Item', unit='ea', qty_required=0, qty_ordered=0, source=null } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO public.purchase_order_items (po_id, sku, description, unit, qty_required, qty_ordered, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, sku, description, unit, qty_required, qty_ordered, qty_received`,
      [po_id, sku, description, unit, Number(qty_required||0), Number(qty_ordered||0), source]
    );
    res.json(rows[0]);
  } catch (e) { console.error('po/items add', e); res.status(500).json({ error:'server_error' }); }
});

router.patch('/api/po/items/:itemId', express.json(), async (req, res) => {
  try {
    const id = Number(req.params.itemId);
    const { qty_required, qty_ordered } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE public.purchase_order_items
          SET qty_required = COALESCE($2, qty_required),
              qty_ordered  = COALESCE($3, qty_ordered)
        WHERE id = $1
      RETURNING id, sku, description, unit, qty_required, qty_ordered, qty_received`,
      [id, qty_required, qty_ordered]
    );
    res.json(rows[0]);
  } catch (e) { console.error('po/items patch', e); res.status(500).json({ error:'server_error' }); }
});

/* Create PO (one vendor/brand per call) */
router.post("/po", async (req, res) => {
  const { job_id, vendor, brand, category, order_no, expected_date } = req.body || {};
  if (!job_id || !vendor) return res.status(400).json({ error: "missing_fields" });
  const q = `
    INSERT INTO public.purchase_orders (job_id, vendor, brand, category, order_no, status, expected_date, created_by, placed_at)
    VALUES ($1,$2,$3,$4,$5,'pending',$6,$7, NULL)
    RETURNING *`;
  const { rows } = await pool.query(q, [job_id, vendor, brand||null, category||null, order_no||null, expected_date||null, req.user?.email||null].map(x=>x??null));
  res.status(201).json(rows[0]);
});

/* Add item to PO */
router.post("/po/:id/items", async (req, res) => {
  const id = Number(req.params.id);
  const { sku, description, unit, qty_required, qty_ordered, source } = req.body || {};
  const q = `
    INSERT INTO public.purchase_order_items
    (po_id, sku, description, unit, qty_required, qty_ordered, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`;
  const { rows } = await pool.query(q, [id, sku||null, description||null, unit||'ea', qty_required||0, qty_ordered||0, source||{}]);
  res.status(201).json(rows[0]);
});

/* Patch PO (status/order_no/expected_date/placed_at/vendor/brand) */
router.patch("/po/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { status, order_no, expected_date, placed_at, vendor, brand } = req.body || {};
  const q = `
    UPDATE public.purchase_orders
       SET status=COALESCE($2,status),
           order_no=COALESCE($3,order_no),
           expected_date=COALESCE($4,expected_date),
           placed_at=COALESCE($5,placed_at),
           vendor=COALESCE($6,vendor),
           brand=COALESCE($7,brand)
     WHERE id=$1
     RETURNING *`;
  const { rows } = await pool.query(q, [id, status??null, order_no??null, expected_date??null, placed_at??null, vendor??null, brand??null]);
  if (!rows.length) return res.status(404).json({ error:"not_found" });
  res.json(rows[0]);
});

/* Patch PO item (qty/status roll-up handled on receive) */
router.patch("/po/items/:itemId", async (req, res) => {
  const id = Number(req.params.itemId);
  const { sku, description, unit, qty_required, qty_ordered } = req.body || {};
  const q = `
    UPDATE public.purchase_order_items
       SET sku=COALESCE($2,sku),
           description=COALESCE($3,description),
           unit=COALESCE($4,unit),
           qty_required=COALESCE($5,qty_required),
           qty_ordered=COALESCE($6,qty_ordered)
     WHERE id=$1
     RETURNING *`;
  const { rows } = await pool.query(q, [id, sku??null, description??null, unit??null, qty_required??null, qty_ordered??null]);
  if (!rows.length) return res.status(404).json({ error:"not_found" });
  res.json(rows[0]);
});

/* Receive against an item (creates receipt + updates qty_received; auto-closes PO when all met) */
router.post("/po/items/:itemId/receive", async (req, res) => {
  const itemId = Number(req.params.itemId);
  const qty = Number(req.body?.qty || 0);
  const note = String(req.body?.note || "");
  if (!qty || qty < 0) return res.status(400).json({ error: "bad_qty" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const it = await client.query(`SELECT po_id, qty_required, qty_received FROM public.purchase_order_items WHERE id=$1 FOR UPDATE`, [itemId]);
    if (!it.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error:"not_found" }); }
    const poId = it.rows[0].po_id;
    const newRec = Number(it.rows[0].qty_received||0) + qty;

    await client.query(
      `INSERT INTO public.purchase_receipts (po_item_id, qty_received, note) VALUES ($1,$2,$3)`,
      [itemId, qty, note]
    );
    await client.query(
      `UPDATE public.purchase_order_items SET qty_received=$2 WHERE id=$1`,
      [itemId, newRec]
    );

    /* roll-up: if all items >= required -> received; else partial_received */
    const chk = await client.query(
      `SELECT BOOL_AND(qty_received >= qty_required) AS all_met
         FROM public.purchase_order_items WHERE po_id=$1`,
      [poId]
    );
    const allMet = !!chk.rows[0]?.all_met;
    await client.query(
      `UPDATE public.purchase_orders SET status=$2 WHERE id=$1`,
      [poId, allMet ? 'received' : 'partial_received']
    );

    await client.query("COMMIT");

    /* notify Slack (optional) */
    try {
      const hook = process.env.N8N_OPS_STATUS_WEBHOOK;
      if (hook) {
        await fetch(hook, { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ event:'po_item_received', item_id:itemId, qty }) });
      }
    } catch {}

    res.json({ ok:true, po_id: poId, all_met: allMet });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[PO RECEIVE]", e);
    res.status(500).json({ error: "receive_failed" });
  } finally {
    client.release();
  }
});

/* Job readiness for UI/scheduler (PO-based view) */
router.get("/jobs/:jobId/material-ready", async (req, res) => {
  const jobId = Number(req.params.jobId);
  const { rows } = await pool.query(
    `SELECT job_id, customer_name, req, rec, material_ready
       FROM public.job_material_readiness WHERE job_id=$1`, [jobId]
  );
  res.json(rows[0] || { job_id: jobId, material_ready:false, req:0, rec:0 });
});

/* Submit bid to purchasing (sales workflow legacy alias) */
router.post('/po/submit', requireRoleApi(SUBMIT_ROLES), async (req, res) => {
  await handleSubmitToPurchasing(req, res);
});

/* List all POs with summary */
router.get('/po/list', async (_req, res) => {
  await ensurePoDocsTable();
  const sql = `
    SELECT po.id, po.job_id, po.vendor, po.brand, po.category, po.order_no,
           po.status, po.expected_date, po.placed_at, j.customer_name,
           COALESCE(SUM(i.qty_required),0) AS req,
           COALESCE(SUM(i.qty_received),0) AS rec,
           COALESCE(d.cnt,0) AS doc_count
    FROM public.purchase_orders po
    LEFT JOIN public.jobs j ON j.id = po.job_id
    LEFT JOIN public.purchase_order_items i ON i.po_id = po.id
    LEFT JOIN (
      SELECT po_id, COUNT(*) AS cnt
      FROM public.purchase_order_docs
      GROUP BY po_id
    ) d ON d.po_id = po.id
  GROUP BY po.id, j.customer_name, d.cnt
    ORDER BY po.status, po.id DESC`;
  const { rows } = await pool.query(sql);
  res.json(rows);
});

/* Get items for a specific PO */
router.get('/po/:id/items', async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT id, sku, description, unit, qty_required, qty_ordered, qty_received
       FROM public.purchase_order_items WHERE po_id=$1 ORDER BY id`, [id]);
  res.json(rows);
});

export default router;
 
/* --------------------------- Attachments (Docs) --------------------------- */
// Minimal doc storage for POs: saves files under /uploads/po/:poId and records in DB

const DOCS_ROOT = path.join(process.cwd(), "uploads", "po");
try { fs.mkdirSync(DOCS_ROOT, { recursive: true }); } catch {}

async function ensurePoDocsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.purchase_order_docs (
      id          BIGSERIAL PRIMARY KEY,
      po_id       INTEGER NOT NULL,
      job_id      INTEGER,
      bid_id      INTEGER,
      file_path   TEXT    NOT NULL,
      file_name   TEXT    NOT NULL,
      kind        TEXT,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);
  // Add columns if we created the table earlier without them
  await pool.query(`
    DO $$ BEGIN
      BEGIN ALTER TABLE public.purchase_order_docs ADD COLUMN IF NOT EXISTS job_id INTEGER; EXCEPTION WHEN duplicate_column THEN END;
      BEGIN ALTER TABLE public.purchase_order_docs ADD COLUMN IF NOT EXISTS bid_id INTEGER; EXCEPTION WHEN duplicate_column THEN END;
    END $$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_po_docs_po_id ON public.purchase_order_docs(po_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_po_docs_job_id ON public.purchase_order_docs(job_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_po_docs_bid_id ON public.purchase_order_docs(bid_id);`);
}

function saveDataUrlToFile(dataUrl, destDir, baseName) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) return null;
  const mime = m[1];
  const buf = Buffer.from(m[2], "base64");
  const ext = (mime.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "");
  const fileName = `${baseName}.${ext}`;
  fs.mkdirSync(destDir, { recursive: true });
  const abs = path.join(destDir, fileName);
  fs.writeFileSync(abs, buf);
  return { abs, rel: abs.replace(process.cwd(), ""), fileName };
}

// List docs for a PO
router.get('/po/:id/docs', async (req, res) => {
  const poId = Number(req.params.id);
  await ensurePoDocsTable();
  const { rows } = await pool.query(
    `SELECT id, file_path, file_name, kind, created_at, job_id, bid_id
       FROM public.purchase_order_docs
      WHERE po_id = $1
      ORDER BY created_at DESC`,
    [poId]
  );
  // Expose a public URL using /uploads
  const out = rows.map(r => ({
    id: r.id,
    file_name: r.file_name,
    kind: r.kind || null,
    created_at: r.created_at,
    job_id: r.job_id || null,
    bid_id: r.bid_id || null,
    url: r.file_path // already a relative '/uploads/...' path
  }));
  res.json(out);
});

// Upload a doc for a PO (expects JSON: { name, dataUrl, kind })
router.post('/po/:id/docs', async (req, res) => {
  const poId = Number(req.params.id);
  const name = String(req.body?.name || '').trim() || 'document';
  const dataUrl = req.body?.dataUrl || '';
  const kind = String(req.body?.kind || '').trim() || null; // e.g., 'bol' | 'confirmation'

  if (!dataUrl.startsWith('data:')) return res.status(400).json({ error: 'bad_payload' });

  try {
    await ensurePoDocsTable();
    // lookup job_id (and a likely bid_id for reference)
    const p = await pool.query(`SELECT job_id FROM public.purchase_orders WHERE id=$1`, [poId]);
    const jobId = p.rows[0]?.job_id || null;
    let bidId = null;
    if (jobId) {
      const b = await pool.query(`SELECT id FROM public.bids WHERE job_id=$1 ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`, [jobId]);
      bidId = b.rows[0]?.id || null;
    }
    const dir = path.join(DOCS_ROOT, String(poId));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBase = `${stamp}-${name}`.replace(/[^a-z0-9._-]/gi, '_');
    const saved = saveDataUrlToFile(dataUrl, dir, safeBase);
    if (!saved) return res.status(400).json({ error: 'decode_failed' });

    // Build a public URL under /uploads
    const relUnderUploads = saved.abs.replace(process.cwd(), '').replace(/\\/g, '/');
    const uploadsIdx = relUnderUploads.indexOf('/uploads/');
    const publicUrl = uploadsIdx >= 0 ? relUnderUploads.slice(uploadsIdx) : `/uploads/po/${poId}/${saved.fileName}`;

    const ins = await pool.query(
      `INSERT INTO public.purchase_order_docs (po_id, job_id, bid_id, file_path, file_name, kind)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, po_id, job_id, bid_id, file_path, file_name, kind, created_at`,
      [poId, jobId, bidId, publicUrl, saved.fileName, kind]
    );

    res.status(201).json({ ok: true, ...ins.rows[0] });
  } catch (e) {
    console.error('[PO DOC UPLOAD]', e);
    res.status(500).json({ error: 'upload_failed', detail: e.message });
  }
});

// List docs by job
router.get('/jobs/:jobId/po-docs', async (req, res) => {
  await ensurePoDocsTable();
  const jobId = Number(req.params.jobId);
  const { rows } = await pool.query(
    `SELECT id, po_id, job_id, bid_id, file_path, file_name, kind, created_at
       FROM public.purchase_order_docs
      WHERE job_id = $1
      ORDER BY created_at DESC`, [jobId]
  );
  res.json(rows.map(r => ({ ...r, url: r.file_path })));
});

// List docs by bid (uses recorded bid_id; falls back to job join if empty)
router.get('/bids/:bidId/po-docs', async (req, res) => {
  await ensurePoDocsTable();
  const bidId = Number(req.params.bidId);
  let rows = [];
  const byBid = await pool.query(
    `SELECT id, po_id, job_id, bid_id, file_path, file_name, kind, created_at
       FROM public.purchase_order_docs
      WHERE bid_id = $1
      ORDER BY created_at DESC`, [bidId]
  );
  rows = byBid.rows;
  if (!rows.length) {
    const j = await pool.query(`SELECT job_id FROM public.bids WHERE id=$1`, [bidId]);
    const jobId = j.rows[0]?.job_id || null;
    if (jobId) {
      const byJob = await pool.query(
        `SELECT id, po_id, job_id, bid_id, file_path, file_name, kind, created_at
           FROM public.purchase_order_docs
          WHERE job_id = $1
          ORDER BY created_at DESC`, [jobId]
      );
      rows = byJob.rows;
    }
  }
  res.json(rows.map(r => ({ ...r, url: r.file_path })));
});

// --------------------------- API Aliases ---------------------------
// Provide /api/po/... versions expected by the UI.

// Alias: receive against item
router.post('/api/po/items/:itemId/receive', async (req, res) => {
  const itemId = Number(req.params.itemId);
  const qty = Number(req.body?.qty || 0);
  const note = String(req.body?.note || "");
  if (!qty || qty < 0) return res.status(400).json({ error: 'bad_qty' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const it = await client.query(`SELECT po_id, qty_required, qty_received FROM public.purchase_order_items WHERE id=$1 FOR UPDATE`, [itemId]);
    if (!it.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not_found' }); }
    const poId = it.rows[0].po_id;
    const newRec = Number(it.rows[0].qty_received||0) + qty;

    await client.query(
      `INSERT INTO public.purchase_receipts (po_item_id, qty_received, note) VALUES ($1,$2,$3)`,
      [itemId, qty, note]
    );
    await client.query(
      `UPDATE public.purchase_order_items SET qty_received=$2 WHERE id=$1`,
      [itemId, newRec]
    );

    const chk = await client.query(
      `SELECT BOOL_AND(qty_received >= qty_required) AS all_met FROM public.purchase_order_items WHERE po_id=$1`,
      [poId]
    );
    const allMet = !!chk.rows[0]?.all_met;
    await client.query(
      `UPDATE public.purchase_orders SET status=$2 WHERE id=$1`,
      [poId, allMet ? 'received' : 'partial_received']
    );
    await client.query('COMMIT');
    res.json({ ok: true, po_id: poId, all_met: allMet });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[PO RECEIVE API]', e);
    res.status(500).json({ error: 'receive_failed' });
  } finally {
    client.release();
  }
});

// Alias: docs list for a PO
router.get('/api/po/:id/docs', async (req, res) => {
  const poId = Number(req.params.id);
  await ensurePoDocsTable();
  const { rows } = await pool.query(
    `SELECT id, file_path, file_name, kind, created_at, job_id, bid_id
       FROM public.purchase_order_docs
      WHERE po_id = $1
      ORDER BY created_at DESC`,
    [poId]
  );
  const out = rows.map(r => ({
    id: r.id,
    file_name: r.file_name,
    kind: r.kind || null,
    created_at: r.created_at,
    job_id: r.job_id || null,
    bid_id: r.bid_id || null,
    url: r.file_path
  }));
  res.json(out);
});

// Alias: upload doc for a PO
router.post('/api/po/:id/docs', async (req, res) => {
  const poId = Number(req.params.id);
  const name = String(req.body?.name || '').trim() || 'document';
  const dataUrl = req.body?.dataUrl || '';
  const kind = String(req.body?.kind || '').trim() || null;
  if (!dataUrl.startsWith('data:')) return res.status(400).json({ error: 'bad_payload' });
  try {
    await ensurePoDocsTable();
    const p = await pool.query(`SELECT job_id FROM public.purchase_orders WHERE id=$1`, [poId]);
    const jobId = p.rows[0]?.job_id || null;
    let bidId = null;
    if (jobId) {
      const b = await pool.query(`SELECT id FROM public.bids WHERE job_id=$1 ORDER BY updated_at DESC NULLS LAST, id DESC LIMIT 1`, [jobId]);
      bidId = b.rows[0]?.id || null;
    }
    const dir = path.join(DOCS_ROOT, String(poId));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBase = `${stamp}-${name}`.replace(/[^a-z0-9._-]/gi, '_');
    const saved = saveDataUrlToFile(dataUrl, dir, safeBase);
    if (!saved) return res.status(400).json({ error: 'decode_failed' });

    const relUnderUploads = saved.abs.replace(process.cwd(), '').replace(/\\/g, '/');
    const uploadsIdx = relUnderUploads.indexOf('/uploads/');
    const publicUrl = uploadsIdx >= 0 ? relUnderUploads.slice(uploadsIdx) : `/uploads/po/${poId}/${saved.fileName}`;

    const ins = await pool.query(
      `INSERT INTO public.purchase_order_docs (po_id, job_id, bid_id, file_path, file_name, kind)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, po_id, job_id, bid_id, file_path, file_name, kind, created_at`,
      [poId, jobId, bidId, publicUrl, saved.fileName, kind]
    );
    res.status(201).json({ ok: true, ...ins.rows[0] });
  } catch (e) {
    console.error('[PO DOC UPLOAD API]', e);
    res.status(500).json({ error: 'upload_failed', detail: e.message });
  }
});
