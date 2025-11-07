import express from 'express';
import { pool } from '../db.js';
import db from "../db.js";
import { requireRoleApi } from "./auth.js";
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';
import archiver from 'archiver'; // <-- NEW IMPORT


const router = express.Router();
const $ = n => Math.round(Number(n || 0) * 100) / 100;
const r2 = $; // alias so calls below don't throw

/* ---------------------------- helpers ---------------------------- */
async function assertDraft(db, bidId) {
  const r = await db.query(`SELECT status FROM bids WHERE id = $1`, [bidId]);
  if (!r.rowCount) throw new Error("bid_not_found");
  if ((r.rows[0].status || "").toLowerCase() !== "draft") throw new Error("bid_not_draft");
}

// Create a one-time acceptance token (random, unique); stores recipient email separately
async function createAckToken(bidId, recipientEmail) {
  for (let i = 0; i < 5; i++) {
    const raw = crypto.randomBytes(24).toString('base64url'); // URL-safe
    const { rows } = await pool.query(
      `INSERT INTO quote_ack_tokens (bid_id, token, recipient_email, expires_at)
       VALUES ($1, $2, $3, now() + interval '14 days')
       ON CONFLICT (token) DO NOTHING
       RETURNING token`,
      [bidId, raw, recipientEmail || null]   // <-- IMPORTANT: raw goes to $2 (token)
    );
    if (rows.length) return rows[0].token;
  }
  throw new Error('token_collision');
}

// tiny helper to deep-merge two plain objects
function deepMerge(a = {}, b = {}) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
      out[k] = deepMerge(a[k] || {}, b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeDocUrl(rawUrl, baseOrigin = "") {
  const value = String(rawUrl ?? "").trim();
  if (!value) return null;
  if (value.startsWith("/")) return value;
  if (isHttpUrl(value)) return value;
  if (baseOrigin) {
    try {
      return new URL(value, baseOrigin).toString();
    } catch {
      return null;
    }
  }
  return null;
}


async function seedPurchasingForJob(pool, jobId, installDateIso) {
  if (!jobId) return { seeded: 0, reason: "no_job" };

  // Avoid duplicates (simple existence check per item_name)
  const exists = await pool.query(
    `SELECT 1 FROM public.purchase_queue
      WHERE job_id = $1 AND item_name = 'Hardware pulls' LIMIT 1`,
    [jobId]
  );
  if (exists.rowCount) return { seeded: 0, reason: "already_seeded" };

  // Compute needed_by = (install_date - 14 days) if known
  let neededBy = null;
  if (installDateIso) {
    const d = new Date(installDateIso);
    if (!isNaN(d)) { d.setDate(d.getDate() - 14); neededBy = d.toISOString().slice(0,10); }
  }

  const rows = [
    { item_name: 'Hardware pulls', vendor: null },
    { item_name: 'Install consumables kit', vendor: null }, // shims, anchors, scribe, etc.
  ];

  let count = 0;
  for (const r of rows) {
    await pool.query(
      `INSERT INTO public.purchase_queue (job_id, item_name, spec, needed_by, vendor, status)
       VALUES ($1,$2,$3,$4,$5,'pending')`,
      [jobId, r.item_name, {}, neededBy, r.vendor]
    );
    count++;
  }
  return { seeded: count, reason: neededBy ? "dated" : "no_install_date" };
}

// --- Purchasing: list queue (awaiting PO or in-flight) ---
router.get('/purchasing-queue', async (_req, res) => {
  const q = `
    SELECT 
      b.id,
      COALESCE(j.customer_name, NULL) AS customer_name,  -- no email fallback
      b.purchasing_status,
      b.po_sent_at,
      b.po_received_at,
      b.mfr_override,
      COALESCE(b.due_date::text, NULL) AS due_date,
      COALESCE((
        SELECT (meta->>'manufacturer')::text
        FROM public.bid_column_details d
        WHERE d.bid_id = b.id AND (d.meta ? 'manufacturer')
        ORDER BY d.column_id LIMIT 1
      ), '') AS manufacturer
    FROM public.bids b
    LEFT JOIN public.jobs j ON j.id = b.job_id
    WHERE COALESCE(b.purchasing_status,'waiting') IN ('waiting','po_sent','received')
    ORDER BY b.id DESC
  `;
  const { rows } = await pool.query(q);
  res.json(rows || []);
});

router.get("/api/jobs/search", async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const { rows } = await pool.query(
    `SELECT id, customer_name, project_name
       FROM public.jobs
      WHERE (customer_name ILIKE $1 OR project_name ILIKE $1)
      ORDER BY id DESC
      LIMIT 20`,
    ['%'+q+'%']
  );
  res.json(rows);
});

// --- Purchasing: update a bid's purchasing fields ---
router.patch('/:id/purchasing', async (req, res) => {
  const id = Number(req.params.id);
  const s  = String(req.body?.purchasing_status || '').trim() || null;
  const sent = req.body?.po_sent_at ? new Date(req.body.po_sent_at) : null;
  const recv = req.body?.po_received_at ? new Date(req.body.po_received_at) : null;
  const mfr  = (req.body?.mfr_override ?? '').toString().trim() || null;
  const due  = req.body?.due_date ? new Date(req.body.due_date) : null;

  const q = `
    UPDATE public.bids SET
      purchasing_status = COALESCE($2, purchasing_status),
      po_sent_at        = $3,
      po_received_at    = $4,
      mfr_override      = $5,
      due_date          = $6,
      updated_at        = now()
    WHERE id = $1
    RETURNING id, purchasing_status, po_sent_at, po_received_at, mfr_override, due_date
  `;
  const { rows } = await pool.query(q, [id, s, sent, recv, mfr, due]);
  res.json(rows[0]);
});


// --- Lead Times API ---
router.get('/lead-times', async (_req, res) => {
  const r = await pool.query(
    `SELECT manufacturer, base_days, avg_90d_days, notes, updated_at
       FROM public.manufacturer_lead_times
      ORDER BY manufacturer`);
  res.json(r.rows || []);
});

router.post('/lead-times', async (req, res) => {
  const m = String(req.body?.manufacturer || '').trim();
  if (!m) return res.status(400).json({ error: 'missing_manufacturer' });
  const base = Number(req.body?.base_days ?? 14);
  const avg  = (req.body?.avg_90d_days == null) ? null : Number(req.body.avg_90d_days);
  const notes = String(req.body?.notes || '');
  const q = `
    INSERT INTO public.manufacturer_lead_times (manufacturer, base_days, avg_90d_days, notes)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (manufacturer) DO UPDATE
      SET base_days=EXCLUDED.base_days,
          avg_90d_days=EXCLUDED.avg_90d_days,
          notes=EXCLUDED.notes,
          updated_at=now()
    RETURNING *`;
  const r = await pool.query(q, [m, base, avg, notes]);
  res.json(r.rows[0]);
});

router.delete('/lead-times/:manufacturer', async (req, res) => {
  const m = String(req.params.manufacturer || '').trim();
  await pool.query(`DELETE FROM public.manufacturer_lead_times WHERE manufacturer=$1`, [m]);
  res.json({ ok: true });
});


async function fetchAdminContent() {
  const base = process.env.PUBLIC_ORIGIN || 'http://localhost:3000';
  try {
    const r = await fetch(`${base}/api/admin-content`, {
      // Node 18+ supports timeouts via AbortSignal:
      signal: AbortSignal.timeout(4000)
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }
function savePdfDataUrl(dataUrl, destDir, base){
  const m = /^data:application\/pdf;base64,(.+)$/i.exec(String(dataUrl||""));
  if (!m) throw new Error("invalid_pdf_dataurl");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > 15 * 1024 * 1024) throw new Error("file_too_large"); // 15 MB
  ensureDir(destDir);
  const fname = `${base}.pdf`;
  const abs = path.join(destDir, fname);
  fs.writeFileSync(abs, buf);
  const rel = `/uploads/${path.relative(path.join(process.cwd(), "uploads"), abs).replace(/\\/g,'/')}`;
  return { abs, url: rel, name: fname };
}

function requireSnapshot(row) {
  if (!row) return 'No totals row';
  const has = ['total','deposit_amount','remaining_amount'].every(k => k in row);
  if (!has) return 'Totals row missing fields';
  const pos = Number(row.total) > 0 && Number(row.deposit_amount) >= 0 && Number(row.remaining_amount) >= 0;
  if (!pos) return 'Totals look invalid';
  return null;
}

async function fetchTotalsRow(pool, bidId) {
  const { rows } = await pool.query(
    `SELECT subtotal_after_discount, tax_rate, tax_amount,
            cc_fee_pct, cc_fee, total,
            deposit_pct, deposit_amount, remaining_amount, updated_at
       FROM public.bid_grand_totals
      WHERE bid_id = $1`,
    [bidId]
  );
  return rows[0] || null;
}

// ---- small helpers (place in helpers section) ----
function normalizeEmails(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(isLikelyEmail);
  return String(value).split(/[;,]/g).map(s => s.trim()).filter(isLikelyEmail);
}
function isLikelyEmail(s) { return !!s && /.+@.+\..+/.test(s); }

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0,10); // YYYY-MM-DD
}
function formatLong(dateIso) {
  const d = new Date(dateIso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
}

// Try to get salesperson display + phone from the bid (fallback to env phone)
async function getSalesRep(pool, bidId) {
  try {
    const r = await pool.query(
      `SELECT COALESCE(b.sales_person,'') AS sales_person,
              COALESCE(j.designer,'')      AS designer
         FROM public.bids b
    LEFT JOIN public.jobs j ON j.id = b.job_id
        WHERE b.id = $1
        LIMIT 1`,
      [bidId]
    );
    const name = (r.rows[0]?.sales_person || r.rows[0]?.designer || '').trim();
    return {
      name: name || null,
      phone: process.env.BRAND_PHONE || null
    };
  } catch {
    return { name: null, phone: process.env.BRAND_PHONE || null };
  }
}


async function renderQuotePDF(bidId) {
  const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:3000';
  const url = `${origin}/sales-quote?bid=${bidId}`;

  const browser = await puppeteer.launch({
    headless: 'new',  // modern headless
    args: ['--no-sandbox','--disable-setuid-sandbox'] // safe on most hosts
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 });

    // Give client code a tick to load snapshot + bind (your JS is fast; this is defensive)
    await new Promise(res => setTimeout(res, 300));

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
    });
    return pdf; // Buffer
  } finally {
    await browser.close();
  }
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,                // smtp.office365.com
    port: Number(process.env.SMTP_PORT || 587), // 587
    secure: false,                              // STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER,              // cs@cabinetsexpress.com
      pass: process.env.SMTP_PASS
    },
    tls: { ciphers: 'TLSv1.2' }                 // helps some tenants
  });
}


/* ------------------------ recent + summary ------------------------ */
// GET /api/bids/:id/intake  -> intake/job info for purchasing workflow
router.get('/:id/intake', async (req, res) => {
  const bidId = Number(req.params.id);
  try {
    // Get bid with job info
    const bidQ = await pool.query(
      `SELECT b.*, j.customer_name, j.project_name, j.address, j.designer,
              j.install_date, j.status as job_status, j.created_at as job_created_at
       FROM bids b
       LEFT JOIN jobs j ON j.id = b.job_id
       WHERE b.id = $1`,
      [bidId]
    );
    
    if (!bidQ.rowCount) return res.status(404).json({ error: 'bid_not_found' });
    
    const result = bidQ.rows[0];
    
    // Try to fetch intake_jobs data if it exists
    try {
      const intakeQ = await pool.query(
        `SELECT * FROM intake_jobs 
         WHERE customer_name = $1 OR project_name = $2
         ORDER BY id DESC LIMIT 1`,
        [result.customer_name, result.project_name]
      );
      
      if (intakeQ.rowCount) {
        // Merge intake data
        const intake = intakeQ.rows[0];
        result.site_address1 = intake.site_address1 || result.address;
        result.site_city = intake.site_city;
        result.site_state = intake.site_state;
        result.site_zip = intake.site_zip;
        result.contact_name = intake.contact_name;
        result.contact_phone = intake.contact_phone;
        result.contact_email = intake.contact_email;
        result.requested_date = intake.requested_date;
        result.intake_notes = intake.notes;
      }
    } catch (intakeErr) {
      // intake_jobs table might not exist, just continue with job data
      console.log('intake_jobs query failed:', intakeErr.message);
    }
    
    res.json(result);
  } catch (e) {
    console.error('intake error:', e);
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

// GET /api/bids/:id/customer-info  -> customer name and email for quote emailing
router.get('/:id/customer-info', async (req, res) => {
  const bidId = Number(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT customer_email, sales_person, onboarding
         FROM public.bids
        WHERE id = $1
        LIMIT 1`,
      [bidId]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });

    const ob = rows[0].onboarding || {};
    const sales = (rows[0].sales_person || ob.sales_person || ob.salesman || '').toString().trim() || null;
    const out = {
      // names
      customer_name:  ob.customer_name || ob.homeowner || ob.builder || ob.customer || null,
      contact_name:   ob.contact_name  || ob.homeowner || ob.builder || null,

      // phones/emails
      phone:          ob.homeowner_phone || ob.builder_phone || ob.phone || null,
      email:          rows[0].customer_email || ob.customer_email || ob.email || null,

      // address
      address_line1:  ob.address_line1 || ob.home_address || ob.address || null,
      city:           ob.city || ob.job_city || null,
      state:          ob.state || ob.job_state || null,
      zip:            ob.zip || ob.job_zip || null,

      // salesperson (normalized)
      sales_person:   sales
    };

    res.json(out);
  } catch (e) {
    console.error('customer-info error:', e);
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

// Resize image buffer to max 1920px width/height, preserve aspect ratio, 85% quality
// Auto-converts HEIC/HEIF to JPEG
async function resizeImageBuffer(buf, mime) {
  try {
    const img = sharp(buf);
    const meta = await img.metadata();
    
    // Auto-convert HEIC/HEIF to JPEG (Apple formats)
    const isHEIC = mime === 'image/heic' || mime === 'image/heif' || meta.format === 'heif';
    
    // Only resize if larger than 1920px in either dimension
    const needsResize = meta.width > 1920 || meta.height > 1920;
    
    // If HEIC or needs resize, process; otherwise return original
    if (!isHEIC && !needsResize) return buf;
    
    // Resize with aspect ratio preservation and convert to JPEG
    const resized = await img
      .resize(1920, 1920, {
        fit: 'inside',           // preserve aspect ratio
        withoutEnlargement: true // don't upscale small images
      })
      .jpeg({ quality: 85 })     // compress to 85% quality JPEG
      .toBuffer();
    
    return resized;
  } catch (e) {
    console.error('Image resize/conversion failed:', e);
    return buf; // fallback to original if resize fails
  }
}

function saveDataUrlGeneric(dataUrl, destDir, base, allow = []) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!m) throw new Error("bad_dataurl");
  const mime = m[1].toLowerCase();
  if (allow.length && !allow.includes(mime)) throw new Error("blocked_type");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 15 * 1024 * 1024) throw new Error("file_too_large"); // 15 MB limit

  const ext = ({
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/heic": "heic",
  })[mime] || "bin";

  fs.mkdirSync(destDir, { recursive: true });
  const fname = `${base}.${ext}`;
  const abs = path.join(destDir, fname);
  fs.writeFileSync(abs, buf);

  const rel = `/uploads/${path
    .relative(path.join(process.cwd(), "uploads"), abs)
    .replace(/\\/g, "/")}`;

  return { url: rel, name: fname, mime };
}

// GET /api/bids/recent?sp=Sales%20Person&limit=10
router.get("/recent", async (req, res) => {
  try {
    const sp = (req.query.sp || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    const params = [];
    let where = "";
    if (sp) { where = "WHERE b.sales_person = $1"; params.push(sp); }
    params.push(limit);

    const { rows } = await db.query(
      `
      SELECT b.id, b.name, b.sales_person, b.status, b.deposit_received_at, b.ready_for_schedule, 
             COALESCE(gt.total, t.total, 0) AS total, b.created_at
      FROM bids b
      LEFT JOIN bid_grand_totals gt ON gt.bid_id = b.id
      LEFT JOIN bid_totals t ON t.bid_id = b.id
      ${where}
      ORDER BY b.id DESC
      LIMIT $${params.length}
      `,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});

// GET /api/bids/by-job/:jobId/summary -> latest bid for a job with totals (MUST be before /:id/summary)
router.get('/by-job/:jobId/summary', async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!jobId) return res.status(400).json({ error: 'bad_job_id' });
  try {
    const r = await pool.query(`SELECT id FROM public.bids WHERE job_id = $1 ORDER BY id DESC LIMIT 1`, [jobId]);
    if (!r.rowCount) return res.status(404).json({ error: 'bid_not_found_for_job' });
    // Delegate to the main handler by querying again (DRY could be improved)
    const bidId = r.rows[0].id;
    // Manually fetch the same data as above (to avoid routing recursion)
    const bQ = await pool.query(`SELECT * FROM public.bids WHERE id = $1`, [bidId]);
    const raw = bQ.rows[0] || {};
    const pick = (...vals) => { for (const v of vals) if (v !== undefined && v !== null && v !== '') return v; return ''; };
    const bid = {
      id: raw.id,
      job_id: raw.job_id ?? null,
      name: pick(raw.name, raw.title, raw.bid_name),
      status: pick(raw.status, raw.bid_status),
      sales_person: pick(raw.sales_person, raw.salesperson, raw.sales_rep),
      designer: pick(raw.designer, raw.designer_name),
      builder: pick(raw.builder, raw.builder_name, raw.builder_company),
      builder_phone: pick(raw.builder_phone, raw.builder_phone_number, raw.builder_tel),
      homeowner: pick(raw.homeowner, raw.homeowner_name, raw.customer_name),
      homeowner_phone: pick(raw.homeowner_phone, raw.customer_phone, raw.homeowner_tel),
      customer_email: pick(raw.customer_email, raw.email, raw.homeowner_email),
      home_address: pick(raw.home_address, raw.address, raw.job_address, raw.site_address),
      lot_plan: pick(raw.lot_plan, raw.lot_plan_name, raw.lot_number, raw.plan_name),
      access_notes: pick(raw.access_notes, raw.how_to_get_in, raw.gate_codes, raw.entry_notes),
      install_date: pick(raw.install_date, raw.target_install_date, raw.requested_install_date),
      ready_for_schedule: raw.ready_for_schedule ?? null,
      deposit_received_at: raw.deposit_received_at ?? null,
      created_at: raw.created_at ?? null,
      updated_at: raw.updated_at ?? null,
    };

    let financial = { subtotal: 0, tax: 0, total: 0 };
    async function tryTotals(sql, params) {
      try {
        const r = await pool.query(sql, params);
        if (r.rows.length) {
          const row = r.rows[0] || {};
          financial = {
            subtotal: Number(row.subtotal || 0),
            tax: Number(row.tax || 0),
            total: Number(row.total || 0),
          };
          return true;
        }
      } catch (e) {
        const msg = String(e && (e.message || e) || '').toLowerCase();
        if (!(e && (e.code === '42P01' || msg.includes('does not exist')))) throw e;
      }
      return false;
    }
    await tryTotals(`SELECT subtotal, tax, total FROM public.bid_totals WHERE bid_id = $1`, [bidId])
      || await tryTotals(`SELECT subtotal, tax, total FROM public.v_bid_totals WHERE bid_id = $1`, [bidId])
      || await tryTotals(`SELECT * FROM public.calculate_bid_totals($1)`, [bidId]);

    res.json({ bid, financial, subtotal: financial.subtotal, tax: financial.tax, total: financial.total });
  } catch (e) {
    console.error('[BID BY-JOB SUMMARY ERR]', e && (e.stack || e));
    res.status(500).json({ error: 'server_error', detail: e.message });
  }
});

// GET /api/bids/:id/summary  -> defensive summary with bid info + totals (with fallbacks)
router.get("/:id/summary", async (req, res) => {
  const bidId = Number(req.params.id);
  if (!bidId) return res.status(400).json({ error: "bad_bid_id" });
  try {
    // 1) Load the bid row flexibly
    const bQ = await pool.query(`SELECT * FROM public.bids WHERE id = $1`, [bidId]);
    if (!bQ.rowCount) return res.status(404).json({ error: "bid_not_found" });
    const raw = bQ.rows[0] || {};

    const pick = (...vals) => {
      for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
      return '';
    };
    const bid = {
      id: raw.id,
      job_id: raw.job_id ?? null,
      name: pick(raw.name, raw.title, raw.bid_name),
      status: pick(raw.status, raw.bid_status),
      sales_person: pick(raw.sales_person, raw.salesperson, raw.sales_rep),
      designer: pick(raw.designer, raw.designer_name),
      builder: pick(raw.builder, raw.builder_name, raw.builder_company),
      builder_phone: pick(raw.builder_phone, raw.builder_phone_number, raw.builder_tel),
      homeowner: pick(raw.homeowner, raw.homeowner_name, raw.customer_name),
      homeowner_phone: pick(raw.homeowner_phone, raw.customer_phone, raw.homeowner_tel),
      customer_email: pick(raw.customer_email, raw.email, raw.homeowner_email),
      home_address: pick(raw.home_address, raw.address, raw.job_address, raw.site_address),
      lot_plan: pick(raw.lot_plan, raw.lot_plan_name, raw.lot_number, raw.plan_name),
      access_notes: pick(raw.access_notes, raw.how_to_get_in, raw.gate_codes, raw.entry_notes),
      install_date: pick(raw.install_date, raw.target_install_date, raw.requested_install_date),
      ready_for_schedule: raw.ready_for_schedule ?? null,
      deposit_received_at: raw.deposit_received_at ?? null,
      created_at: raw.created_at ?? null,
      updated_at: raw.updated_at ?? null,
    };

    // 2) Financial totals with fallbacks
    let financial = { subtotal: 0, tax: 0, total: 0 };
    async function tryTotals(sql, params) {
      try {
        const r = await pool.query(sql, params);
        if (r.rows.length) {
          const row = r.rows[0] || {};
          financial = {
            subtotal: Number(row.subtotal || 0),
            tax: Number(row.tax || 0),
            total: Number(row.total || 0),
          };
          return true;
        }
      } catch (e) {
        // Swallow missing relation/func errors; rethrow others
        const msg = String(e && (e.message || e) || '').toLowerCase();
        if (!(e && (e.code === '42P01' || msg.includes('does not exist')))) throw e;
      }
      return false;
    }

    await tryTotals(`SELECT subtotal, tax, total FROM public.bid_totals WHERE bid_id = $1`, [bidId])
      || await tryTotals(`SELECT subtotal, tax, total FROM public.v_bid_totals WHERE bid_id = $1`, [bidId])
      || await tryTotals(`SELECT * FROM public.calculate_bid_totals($1)`, [bidId]);

    // Back-compat: also place top-level keys subtotal/tax/total
    res.json({ bid, financial, subtotal: financial.subtotal, tax: financial.tax, total: financial.total });
  } catch (e) {
    console.error('[BID SUMMARY ERR]', e && (e.stack || e));
    res.status(500).json({ error: "server_error", detail: e.message });
  }
});

// GET /api/bids/:id/lead-time -> { manufacturer, days }
router.get('/:id/lead-time', async (req, res) => {
  const bidId = Number(req.params.id);
  try {
    // find the primary manufacturer from column meta (first non-empty)
    const q1 = `
      SELECT DISTINCT COALESCE(NULLIF(meta->>'manufacturer',''),'') AS m
      FROM public.bid_column_details
      WHERE bid_id = $1
      ORDER BY m DESC
      LIMIT 1`;
    const r1 = await pool.query(q1, [bidId]);
    const manufacturer = (r1.rows[0]?.m || '').trim() || null;

    // look up lead time
    let days = 14;
    if (manufacturer) {
      const r2 = await pool.query(
        `SELECT base_days, COALESCE(avg_90d_days, base_days) AS rec
           FROM public.manufacturer_lead_times WHERE manufacturer = $1`,
        [manufacturer]
      );
      if (r2.rowCount) days = r2.rows[0].rec || r2.rows[0].base_days || 14;
    }
    res.json({ manufacturer, days });
  } catch (e) {
    console.error('lead-time error', e);
    res.status(500).json({ error: 'lead_time_failed' });
  }
});


// --- Docs: upload (Data URL -> file -> append to bids.doc_links) ---
router.post("/:id/docs/upload-dataurl", async (req, res) => {
  try {
    const bidId = Number(req.params.id);
    const { dataUrl } = req.body || {};
    if (!bidId || !dataUrl || !/^data:/.test(dataUrl)) {
      return res.status(400).json({ error: "missing_or_bad_data" });
    }

    // normalize inputs
    const allowed = new Set(["application/pdf","image/png","image/jpeg","image/webp","image/heic"]);
    const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
    if (!m || !allowed.has(m[1].toLowerCase())) {
      return res.status(415).json({ error: "unsupported_type" });
    }
    const mime = m[1].toLowerCase();

    const kindRaw = String(req.body?.kind ?? "").trim().toLowerCase();
    const kind = kindRaw || "doc";

    const colIdNum = Number(req.body?.column_id);
    const column_id = Number.isFinite(colIdNum) ? colIdNum : null;

    // Decode and optionally resize image
    const buf = Buffer.from(m[2], "base64");
    let finalBuf = buf;
    
    // Auto-resize images to max 1920px (preserves aspect ratio)
    const isImage = mime.startsWith("image/");
    if (isImage) {
      finalBuf = await resizeImageBuffer(buf, mime);
    }

    // write file
    const stamp = new Date().toISOString().replace(/[:.]/g, "");
    const destDir = path.join(process.cwd(), "uploads", "bids", String(bidId));
    fs.mkdirSync(destDir, { recursive: true });
    
    const ext = ({
      "application/pdf": "pdf",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/heic": "heic",
    })[mime] || "bin";
    
    const fname = `${stamp}.${ext}`;
    const abs = path.join(destDir, fname);
    fs.writeFileSync(abs, finalBuf);
    
    const rel = `/uploads/${path.relative(path.join(process.cwd(), "uploads"), abs).replace(/\\/g, "/")}`;
    const out = { url: rel, name: fname, mime };
    const filename = fname;

    const nameRaw = String(req.body?.name ?? "").trim();
    const name = nameRaw || filename;

    const entry = { kind, name, url: out.url, mime, column_id };

    // append to doc_links (keeps it a proper JSON array)
    const { rows } = await pool.query(
      `UPDATE public.bids
         SET doc_links = COALESCE(doc_links,'[]'::jsonb) || $2::jsonb,
             updated_at = now()
       WHERE id = $1
       RETURNING doc_links`,
      [bidId, JSON.stringify([entry])]
    );

    return res.json({ ok: true, file: entry, doc_links: rows[0]?.doc_links || [] });
  } catch (e) {
    console.error("docs upload error", e);
    return res.status(500).json({ error: "upload_failed" });
  }
});

// --- Docs: delete (remove from bids.doc_links and best-effort unlink) ---
router.post("/:id/docs/delete", async (req, res) => {
  try {
    const bidId = Number(req.params.id);
    const url = String(req.body?.url || "");
    if (!bidId || !url) return res.status(400).json({ error: "missing_url" });

    // remove from JSON list
    const { rows } = await pool.query(
      `UPDATE public.bids
         SET doc_links = COALESCE((
             SELECT jsonb_agg(e) FROM jsonb_array_elements(COALESCE(doc_links,'[]'::jsonb)) AS e
             WHERE (e ? 'url') AND e->>'url' <> $2
           ), '[]'::jsonb),
             updated_at = now()
       WHERE id = $1
       RETURNING doc_links`,
      [bidId, url]
    );

    // best-effort unlink if it's under /uploads
    try {
      const rel = url.replace(/^\//, "");
      const abs = path.join(process.cwd(), rel);
      const uploadsRoot = path.join(process.cwd(), "uploads");
      if (abs.startsWith(uploadsRoot)) {
        fs.unlink(abs, () => {});
      }
    } catch {}

    return res.json({ ok: true, doc_links: rows[0]?.doc_links || [] });
  } catch (e) {
    console.error("docs delete error", e);
    return res.status(500).json({ error: "delete_failed" });
  }
});


// GET /api/bids/:id/columns-details -> { [column_id]: { meta, hardware, notes }, hardware: [...] }
router.get('/:id/columns-details', async (req, res) => {
  const bidId = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT column_id, meta, hardware, notes
       FROM public.bid_column_details
      WHERE bid_id = $1`,
    [bidId]
  );
  const out = {};
  const allHardware = [];
  
  for (const r of rows) {
    out[r.column_id] = {
      meta: r.meta || {},
      hardware: Array.isArray(r.hardware) ? r.hardware : [], // <- array guarantee
      notes: r.notes ?? null
    };
    // Aggregate hardware from all columns
    if (Array.isArray(r.hardware)) {
      allHardware.push(...r.hardware);
    }
  }
  
  // Add aggregated hardware at top level for easy access
  out.hardware = allHardware;
  
  res.json(out);
});



// PATCH /api/bids/:id/columns-details/:columnId
router.patch('/:id/columns-details/:columnId', async (req, res) => {
  const bidId = Number(req.params.id);
  const colId = Number(req.params.columnId);

  const metaIn = req.body?.meta;
  let hwIn = req.body?.hardware;
  const notes = (req.body?.notes ?? null);

  // normalize meta
  const meta = (metaIn && typeof metaIn === 'object') ? metaIn : {};

  // normalize hardware → array of objects
  if (typeof hwIn === 'string') { try { hwIn = JSON.parse(hwIn); } catch { hwIn = []; } }
  if (!Array.isArray(hwIn)) hwIn = hwIn && typeof hwIn === 'object' ? [hwIn] : [];
  const hardware = hwIn.map(h => ({
    kind: String(h?.kind || '').toLowerCase() || 'other',
    model: String(h?.model || ''),
    finish: String(h?.finish || ''),
    unit_count: Number(h?.unit_count || 0)
  }));

  // log before DB call
  console.log('[HW SAVE] types:', typeof meta, Array.isArray(hardware), typeof hardware?.[0]);

  const q = `
    INSERT INTO public.bid_column_details (bid_id, column_id, meta, hardware, notes)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
    ON CONFLICT (bid_id, column_id) DO UPDATE SET
      meta      = EXCLUDED.meta,
      hardware  = EXCLUDED.hardware,
      notes     = EXCLUDED.notes,
      updated_at= now()
    RETURNING column_id, meta, hardware, notes;
  `;

  try {
    // send JSON strings for jsonb params
    const params = [
      bidId,
      colId,
      JSON.stringify(meta),
      JSON.stringify(hardware),
      notes
    ];
    const { rows } = await pool.query(q, params);
    return res.json(rows[0]);
  } catch (e) {
    console.error('columns-details upsert error', e);
    return res.status(500).json({ error: 'upsert_failed', detail: e.message });
  }
});


/* -------------------------- preview/totals ------------------------ */
router.get("/:id/preview", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM bid_preview WHERE bid_id = $1 ORDER BY column_label, line_id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: e.message });
  }
});


/* ------------------------------ create --------------------------- */
// POST /api/bids  -> create a draft bid (store intake inputs; totals come from view)
router.post("/", async (req, res) => {
  try {
    // Extract customer/project info from request body
    const {
      customer_name,
      project_name,
      site_address1,
      site_city,
      site_state,
      site_zip,
      contact_name,
      contact_phone,
      contact_email,
      requested_date,
      notes,
      designer = '', // <-- added designer with default
      // Bid fields
      name = "Sales Intake Draft",
      tax_rate = 0.0725,
      discount_pct = 0.0,
      deposit_pct  = 0.50,
      credit_card  = false,
      cc_fee_pct   = 0.0,
      installation = null,
      delivery     = null,
      goal_amt     = 0,
      sales_person = null
    } = req.body || {};

    // 1. Create intake_jobs record (for customer/project info)
    let intakeJobResult;
    try {
      intakeJobResult = await db.query(
        `INSERT INTO intake_jobs
          (customer_name, project_name, site_address1, site_city, site_state, site_zip,
           contact_name, contact_phone, contact_email, requested_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [customer_name, project_name, site_address1, site_city, site_state, site_zip,
         contact_name, contact_phone, contact_email, requested_date, notes]
      );
      console.log('intake_jobs insert result:', intakeJobResult.rows);
    } catch (err) {
      console.error('[intake_jobs insert error]', err);
      return res.status(500).json({ error: 'intake_jobs_insert_failed', detail: err.message });
    }

    if (!intakeJobResult.rows.length || typeof intakeJobResult.rows[0].id === 'undefined' || intakeJobResult.rows[0].id === null) {
      console.error('[intake_jobs insert returned no id]', intakeJobResult);
      return res.status(500).json({ error: 'intake_jobs_no_id', detail: intakeJobResult });
    }
    const intake_job_id = intakeJobResult.rows[0].id;
    console.log('Using intake_job_id:', intake_job_id);

    // 2. Create jobs record (for foreign key in bids)
    let jobsResult;
    try {
      jobsResult = await db.query(
        `INSERT INTO jobs
          (customer_name, project_name, address, designer, cabinets_count, status, drive_folder_id, job_meta, created_at, install_date, phase)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10)
         RETURNING id`,
        [customer_name, project_name, site_address1, designer || '', 0, 'intake', null, '{}', requested_date, null]
      );
      console.log('jobs insert result:', jobsResult.rows);
    } catch (err) {
      console.error('[jobs insert error]', err);
      return res.status(500).json({ error: 'jobs_insert_failed', detail: err.message });
    }

    if (!jobsResult.rows.length || typeof jobsResult.rows[0].id === 'undefined' || jobsResult.rows[0].id === null) {
      console.error('[jobs insert returned no id]', jobsResult);
      return res.status(500).json({ error: 'jobs_no_id', detail: jobsResult });
    }
    const job_id = jobsResult.rows[0].id;
    console.log('Using job_id for bid:', job_id);

    // 3. Create bid, linking job_id
    let bidResult;
    try {
// AFTER — now persists customer_email
        bidResult = await db.query(
        `INSERT INTO bids
            (job_id, name, status, tax_rate, discount_pct, deposit_pct, credit_card, cc_fee_pct,
            installation, delivery, goal_amt, sales_person, customer_email)
        VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id, name, sales_person, job_id`,
        [job_id, name, tax_rate, discount_pct, deposit_pct, credit_card, cc_fee_pct,
        installation, delivery, goal_amt, sales_person, (req.body?.customer_email || null)]
        );  
    } catch (err) {
      console.error('[bids insert error]', err, 'job_id:', job_id);
      return res.status(500).json({ error: 'bids_insert_failed', detail: err.message, job_id });
    }

    if (!bidResult.rows.length || typeof bidResult.rows[0].id === 'undefined' || bidResult.rows[0].id === null) {
      console.error('[bids insert returned no id]', bidResult);
      return res.status(500).json({ error: 'bids_no_id', detail: bidResult });
    }
    res.status(201).json(bidResult.rows[0]);
  } catch (e) {
    console.error('[POST /api/bids error]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bids/:id/details  -> { onboarding, doc_links, order_number?, notes_top?, notes_specific?, specs, sales_person, designer }
router.get("/:id/details", async (req, res) => {
  const bidId = Number(req.params.id);
  const r = await pool.query(
    `SELECT b.onboarding, b.doc_links, b.sales_person, j.designer
     FROM public.bids b
     LEFT JOIN public.jobs j ON j.id = b.job_id
     WHERE b.id=$1`,
    [bidId]
  );
  if (!r.rowCount) return res.status(404).json({ error: "bid_not_found" });

  const ob = r.rows[0].onboarding || {};
  const docs = Array.isArray(r.rows[0].doc_links) ? r.rows[0].doc_links : [];
  const spRaw = (r.rows[0].sales_person || ob.sales_person || ob.salesman || '').toString();
  const sales_person = spRaw.trim();
  const designer = r.rows[0].designer || '';

  // Fetch specs from bid_column_details (aggregate from all columns)
  let specs = {};
  try {
    const colsQ = await pool.query(
      `SELECT meta FROM public.bid_column_details WHERE bid_id = $1 LIMIT 1`,
      [bidId]
    );
    if (colsQ.rowCount && colsQ.rows[0].meta) {
      const meta = colsQ.rows[0].meta;
      specs = {
        box_construction: meta.box_construction || meta.box || '',
        material: meta.material || meta.door_material || '',
        finish: meta.finish || meta.door_finish || '',
        door_style: meta.door_style || meta.door || '',
        edge_profile: meta.edge_profile || meta.edge || '',
        crown: meta.crown || '',
        light_rail: meta.light_rail || ''
      };
    }
  } catch (e) {
    console.log('specs fetch warning:', e.message);
  }

  // add aliases so your page fields fill even if keys differ
  const obOut = {
    ...ob,
    order_no: ob.order_no ?? ob.order_number ?? '',
    notes: ob.notes ?? ob.notes_top ?? '',
    specific_notes: ob.specific_notes ?? ob.notes_specific ?? '',
    // normalize salesperson inside onboarding for consumers that read ob
    sales_person: (ob.sales_person ?? ob.salesman ?? sales_person) || ''
  };

  res.json({
    onboarding: obOut,
    doc_links: docs,
  sales_person: sales_person,
    designer: designer,
    // optional flat mirrors (some UIs read these)
    order_number: ob.order_number ?? ob.order_no ?? '',
    notes_top: ob.notes_top ?? ob.notes ?? '',
    notes_specific: ob.notes_specific ?? ob.specific_notes ?? '',
    // Add specs at top level for renderSpecs function
    ...specs
  });
});


// PATCH /api/bids/:id/details  body: { onboarding, doc_links }
router.patch('/:id/details', async (req, res) => {
  const bidId = Number(req.params.id);
  try {
    const cur = await pool.query(
      'SELECT onboarding, doc_links FROM public.bids WHERE id=$1',
      [bidId]
    );
    if (!cur.rows.length) return res.status(404).json({ error: 'bid_not_found' });

    // merge onboarding (accept any keys)
    const incoming = (req.body?.onboarding && typeof req.body.onboarding === 'object') ? req.body.onboarding : {};
        if (incoming.order_no && !incoming.order_number) incoming.order_number = incoming.order_no;
        if (incoming.notes && !incoming.notes_top) incoming.notes_top = incoming.notes;
        if (incoming.specific_notes && !incoming.notes_specific) incoming.notes_specific = incoming.specific_notes;
    const onboarding = { ...(cur.rows[0].onboarding || {}), ...incoming };

    // normalize doc_links from BOTH body and DB, prioritize body if provided
    const source = Array.isArray(req.body?.doc_links) ? req.body.doc_links
                  : (Array.isArray(cur.rows[0].doc_links) ? cur.rows[0].doc_links : []);

    const doc_links = source
      .map(e => {
        if (typeof e === 'string') { try { return JSON.parse(e); } catch { return null; } }
        return (e && typeof e === 'object') ? e : null;
      })
      .filter(e => e && typeof e.url === 'string' && e.url.length > 0);

    const upd = await pool.query(
      `UPDATE public.bids
         SET onboarding = $2::jsonb,
             doc_links  = $3::jsonb
       WHERE id = $1
       RETURNING onboarding, doc_links`,
      [bidId, onboarding, doc_links]
    );
    res.json(upd.rows[0]);
  } catch (e) {
    console.error('details patch error', e);
    res.status(500).json({ error: 'details_failed', detail: e.message });
  }
});


// POST /api/bids/:id/accept  -> mark accepted + seed purchasing
router.post('/:id/accept', async (req, res) => {
  const bidId = Number(req.params.id);
  const { name, email, notes } = req.body || {};
  try {
    // 1) mark bid as accepted
    const upd = await pool.query(
      `UPDATE public.bids SET status='accepted', updated_at=now()
         WHERE id=$1 RETURNING id, job_id`,
      [bidId]
    );
    if (!upd.rowCount) return res.status(404).json({ ok:false, error:'bid_not_found' });

    // 2) look up install date from jobs
    const jobId = upd.rows[0].job_id;
    let installDate = null;
    if (jobId) {
      const r = await pool.query(`SELECT install_date FROM public.jobs WHERE id=$1`, [jobId]);
      installDate = r.rows[0]?.install_date || null;
    }

    // 3) seed purchase_queue (idempotent)
    const seeded = await seedPurchasingForJob(pool, jobId, installDate);

    // (optional) persist a simple acceptance event in bid_events table if you want
    try {
      await pool.query(
        `INSERT INTO public.bid_events (bid_id, event_type, meta)
         VALUES ($1,'accepted', $2)`,
        [bidId, { name, email, notes }]
      );
    } catch (_) {}

    res.json({ ok:true, job_id: jobId ?? null, install_date: installDate, purchasing: seeded });
  } catch (e) {
    console.error('accept error:', e);
    res.status(500).json({ ok:false, error:'accept_failed', detail:e.message });
  }
});

// POST /api/bids/:id/purchasing/reseed
router.post('/:id/purchasing/reseed', async (req, res) => {
  const bidId = Number(req.params.id);
  const r1 = await pool.query(`SELECT job_id FROM public.bids WHERE id=$1`, [bidId]);
  if (!r1.rowCount) return res.status(404).json({ ok:false, error:'bid_not_found' });
  const jobId = r1.rows[0].job_id;

  const r2 = await pool.query(`SELECT install_date FROM public.jobs WHERE id=$1`, [jobId]);
  const installDate = r2.rows[0]?.install_date || null;

  // Delete existing seed rows and re-seed
  await pool.query(
    `DELETE FROM public.purchase_queue
      WHERE job_id=$1 AND item_name IN ('Hardware pulls','Install consumables kit')`,
    [jobId]
  );
  const seeded = await seedPurchasingForJob(pool, jobId, installDate);
  res.json({ ok:true, job_id: jobId, purchasing: seeded });
});

// PATCH /api/bids/:id/deposit
router.patch('/:id/deposit', async (req, res) => {
  const id = Number(req.params.id);
  const when = req.body?.when ? new Date(req.body.when) : new Date();
  const { rows } = await pool.query(
    `UPDATE public.bids
       SET deposit_received_at = $2
     WHERE id=$1
     RETURNING id, deposit_received_at`,
    [id, when.toISOString()]
  );
  if (!rows.length) return res.status(404).json({ error:'not_found' });
  res.json(rows[0]);
});

// POST /api/bids/:id/ready-for-schedule
router.post('/:id/ready-for-schedule', async (req, res) => {
  const id = Number(req.params.id);
  // must have deposit first
  const r = await pool.query(`SELECT deposit_received_at FROM public.bids WHERE id=$1`, [id]);
  if (!r.rowCount) return res.status(404).json({ error:'not_found' });
  if (!r.rows[0].deposit_received_at) return res.status(409).json({ error:'deposit_not_received' });
  const { rows } = await pool.query(
    `UPDATE public.bids SET ready_for_schedule=true WHERE id=$1
     RETURNING id, ready_for_schedule`,
    [id]
  );
  res.json(rows[0]);
});


/* ------------------------------ patch ---------------------------- */
// PATCH /api/bids/:id  -> update intake inputs (NOT totals)
router.patch("/:id", async (req, res) => {
  try {
    const bidId = Number(req.params.id);
    const {
      tax_rate, discount_pct, deposit_pct, credit_card, cc_fee_pct,
      installation, delivery, goal_amt, sales_person
    } = req.body || {};

    const { rows } = await db.query(
      `UPDATE bids SET
         tax_rate     = COALESCE($1, tax_rate),
         discount_pct = COALESCE($2, discount_pct),
         deposit_pct  = COALESCE($3, deposit_pct),
         credit_card  = COALESCE($4, credit_card),
         cc_fee_pct   = COALESCE($5, cc_fee_pct),
         installation = COALESCE($6, installation),
         delivery     = COALESCE($7, delivery),
         goal_amt     = COALESCE($8, goal_amt),
         sales_person = COALESCE($9, sales_person)
       WHERE id = $10
       RETURNING id, name, sales_person, tax_rate, discount_pct, deposit_pct, credit_card, cc_fee_pct, installation, delivery, goal_amt`,
      [tax_rate, discount_pct, deposit_pct, credit_card, cc_fee_pct,
       installation, delivery, goal_amt, sales_person, bidId]
    );

    if (!rows.length) return res.status(404).json({ error: "bid_not_found" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --------------------------- columns/lines ------------------------ */
// POST /api/bids/:id/columns
router.post("/:id/columns", async (req, res) => {
  try {
    const bidId = Number(req.params.id);
    await assertDraft(db, bidId);

    const {
      label, room = null, unit_type = null, color = null,
      units = 1, sort_order = 0, notes = null,
    } = req.body;

    if (!label) return res.status(400).json({ error: "label_required" });
    const { rows } = await db.query(
      `INSERT INTO bid_columns (bid_id, label, room, unit_type, color, units, sort_order, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [bidId, label, room, unit_type, color, units, sort_order, notes]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/bids/:id/email-quote  -> send the PDF quote via email
router.post('/:id/email-quote', async (req, res) => {
  const bidId = Number(req.params.id);
  const { to, cc, note } = req.body || {};
  try {
       if (!bidId || Number.isNaN(bidId)) {
      return res.status(400).json({ ok: false, error: 'invalid_bid_id' });
    }

    // normalize recipients
    const toList  = normalizeEmails(to);
    const ccList  = normalizeEmails(cc);
    const bccList = normalizeEmails(process.env.DEFAULT_BCC || '');
    if (!toList.length) {
      return res.status(400).json({ ok: false, error: 'missing_to_address' });
    }

    // load totals row
    const { rows: totalsRows } = await pool.query(
      `SELECT subtotal_after_discount, tax_rate, tax_amount,
              cc_fee_pct, cc_fee, total, deposit_pct, deposit_amount,
              remaining_amount, updated_at
         FROM public.bid_grand_totals
        WHERE bid_id = $1`,
      [bidId]
    );
    if (!totalsRows.length) {
      return res.status(409).json({ ok: false, error: 'totals_missing', message: 'Save totals on Sales Intake before emailing the quote.' });
    }
    const totals = totalsRows[0];

    // customer name (best-effort)
    let customerName = null;
    try {
      const q = await pool.query(
        `SELECT COALESCE(c.full_name, c.name, c.contact_name) AS customer_name
           FROM public.bids b
      LEFT JOIN public.customers c ON c.id = b.customer_id
          WHERE b.id = $1 LIMIT 1`, [bidId]
      );
      customerName = q.rows[0]?.customer_name || null;
    } catch {}

    // sales rep (name/phone)
    let rep = await getSalesRep(pool, bidId);

    // render PDF
    const pdfBuffer = await renderQuotePDF(bidId);

    // transporter (SMTP)
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      return res.status(500).json({ ok:false, error:'smtp_not_configured', message:'Missing SMTP_HOST/SMTP_USER/SMTP_PASS env vars.' });
    }
    const transporter = nodemailer.createTransport({
      host, port, secure: (port === 465),
      auth: { user, pass }
    });

    // sales rep (name/phone): prefer the logged-in user, then DB fallback, then brand phone
if (req.user) {
  rep.name  = (req.user.full_name || req.user.name || '').trim() || null;
  rep.phone = (req.user.phone || '').trim() || null;
}
if (!rep.name || !rep.phone) {
  const dbRep = await getSalesRep(pool, bidId);   // uses bids/jobs; falls back to BRAND_PHONE
  rep = { name: rep.name || dbRep.name, phone: rep.phone || dbRep.phone };
}

    // build message (after rep is finalized)
    const primaryTo = toList[0] || null;
const token = await createAckToken(bidId, primaryTo);
    const brand = brandFull();
    const subject = `Your ${brand} Quote #${bidId}`;
    const viewUrl = `${process.env.PUBLIC_ORIGIN || 'http://localhost:3000'}/sales-quote?bid=${bidId}`;
    const acceptUrl =
    `${process.env.PUBLIC_ORIGIN || 'http://localhost:3000'}` +
    `/quote-ack?bid=${bidId}&k=${encodeURIComponent(token)}`;
    const termsUrl = process.env.TERMS_URL || '';
    const admin = await fetchAdminContent();
    const safeText = buildPlainText(note, customerName, totals, acceptUrl, rep, termsUrl);
    const safeHtml = buildBrandedHtmlLight(note, customerName, totals, acceptUrl, rep, termsUrl, admin);

    const attachments = [
      { filename: `CabinetsExpress_Quote_${bidId}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
    ];
    const logoAtt = loadLogoAsAttachment(); if (logoAtt) attachments.push(logoAtt);

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || user,
      to: toList.join(','),
      cc: ccList.length ? ccList.join(',') : undefined,
      bcc: bccList.length ? bccList.join(',') : undefined,
      replyTo: process.env.REPLY_TO || undefined,
      subject,
      text: safeText,
      html: safeHtml,
      attachments
    });

    return res.json({ ok: true, messageId: info?.messageId || null });

  } catch (e) {
    console.error('email-quote error:', e);
    return res
      .status(500)
      .json({ ok: false, error: 'email_send_failed', detail: e?.message || String(e) });
  }
});

function brandFull() {
  const name = process.env.BRAND_NAME || 'Cabinets Express';
  const mark = process.env.BRAND_MARK || '™';
  return `${name}${mark}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function currency(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function loadLogoAsAttachment() {
  const p = process.env.BRAND_LOGO_PATH || '';
  if (!p) return null;
  try {
    let filePath = p;
    if (!fs.existsSync(filePath)) {
      const publicBase = path.join(process.cwd(), 'public');
      const staticBase = path.join(process.cwd(), 'static');
      const tryJpgPublic = path.join(publicBase, 'ce-logo-trademarked.jpg');
      const tryPngPublic = path.join(publicBase, 'ce-logo-trademarked.png');
      const tryJpgStatic = path.join(staticBase, 'ce-logo-trademarked.jpg');
      const tryPngStatic = path.join(staticBase, 'ce-logo-trademarked.png');
      if (fs.existsSync(tryPngPublic)) filePath = tryPngPublic;
      else if (fs.existsSync(tryJpgPublic)) filePath = tryJpgPublic;
      else if (fs.existsSync(tryPngStatic)) filePath = tryPngStatic;
      else if (fs.existsSync(tryJpgStatic)) filePath = tryJpgStatic;
      else filePath = p;
    }
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
    return { filename: path.basename(filePath), content: buf, contentType, cid: 'ceLogo' };
  } catch { return null; }
}

function buildPlainText(note, customerName, totals, viewUrl, rep, termsUrl) {
  const brand = brandFull();
  const hello = customerName ? `Hi ${customerName},` : 'Hi,';

  // Default body if no custom note was typed
  const base =
    (typeof note === 'string' && note.trim())
      ? note.trim()
      : `Your quote is attached. A separate invoice for the deposit will be sent shortly. The sooner this quote is approved and the deposit is paid, the sooner we’ll get your cabinets ordered and installation scheduled.`;

  const lines = [
    hello,
    '',
    base,
    '',
    totals ? `Bid Total: ${currency(totals.total)}` : '',
    totals ? `Deposit Due Now (${(Number(totals.deposit_pct) * 100).toFixed(0)}%): ${currency(totals.deposit_amount)}` : '',
    totals ? `Remaining on Installation: ${currency(totals.remaining_amount)}` : '',
    '',
    `We accept ACH / wire / credit card (3% fee).`,
    termsUrl ? `Terms: ${termsUrl}` : '',
    viewUrl ? `Review & accept online: ${viewUrl}` : '',
    '',
    `Thanks,`,
    brand,
    rep?.name ? `Sales: ${rep.name}${rep.phone ? ` — ${rep.phone}` : ''}` : (rep?.phone ? `Sales: ${rep.phone}` : '')
  ].filter(Boolean);

  return lines.join('\n');
}

function buildBrandedHtmlLight(note, customerName, totals, viewUrl, rep, termsUrl, admin) {
  const brand = brandFull();
  const accent = process.env.BRAND_COLOR || '#0D61FF';
  const text   = process.env.BRAND_TEXT_DARK || '#202124';
  const muted  = process.env.BRAND_TEXT_MUTED || '#5f6368';
  const border = process.env.BRAND_BORDER || '#e6e8eb';
  const bg     = process.env.BRAND_BG || '#ffffff';
  const phone  = escapeHtml(process.env.BRAND_PHONE || '');
  const email  = escapeHtml(process.env.BRAND_EMAIL || '');
  const website= escapeHtml(process.env.BRAND_WEBSITE || '');
  const hello  = customerName ? `Hi ${escapeHtml(customerName)},` : 'Hi,';

  const base =
    (note || '').trim() ||
    'Your quote is attached. A separate invoice for the deposit will be sent shortly. The sooner this quote is approved and the deposit is paid, the sooner we’ll get your cabinets ordered and installation scheduled.';

  const paymentTerms = admin?.payment_terms || '';
  const termsHref = termsUrl || '';

  const totalsHtml = totals ? `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:8px">
      <tr>
        <td style="padding:6px 0;color:${muted}">Bid Total</td>
        <td align="right" style="padding:6px 0;color:${text};font-weight:600">${currency(totals.total)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${muted}">Deposit Due Now (${(Number(totals.deposit_pct) * 100).toFixed(0)}%)</td>
        <td align="right" style="padding:6px 0;color:${text};font-weight:600">${currency(totals.deposit_amount)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:${muted}">Remaining on Installation</td>
        <td align="right" style="padding:6px 0;color:${text};font-weight:600">${currency(totals.remaining_amount)}</td>
      </tr>
    </table>
  ` : '';

  const buttonHtml = viewUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:12px">
      <tr>
        <td bgcolor="${accent}" style="border-radius:6px">
          <a href="${viewUrl}" style="display:inline-block;padding:10px 16px;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px">
            Review & Accept Online
          </a>
        </td>
      </tr>
    </table>
  ` : '';

  const termsHtml =
    paymentTerms
      ? `<p style="margin:8px 0 0 0;font-size:13px;color:${muted}">${paymentTerms}</p>`
      : (termsHref ? `<p style="margin:8px 0 0 0;font-size:13px;color:${muted}">Terms: <a style="color:${accent};text-decoration:none" href="${termsHref}">${termsHref}</a></p>` : '');

  const repHtml = (rep?.name || rep?.phone)
    ? `<p style="margin:10px 0 0 0;font-size:14px;color:${muted}"><strong style="color:${text}">Sales:</strong> ${escapeHtml(rep?.name || '')}${rep?.name && rep?.phone ? ' — ' : ''}${escapeHtml(rep?.phone || '')}</p>`
    : '';

  return `
  <div style="background:${bg};padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${text}">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="width:100%;max-width:680px;border:1px solid ${border};border-radius:10px">
      <tr>
        <td style="padding:14px 14px 0 14px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
            <tr>
              <td style="width:44px;vertical-align:middle"><img src="cid:ceLogo" alt="${brand}" style="height:32px;display:block"/></td>
              <td style="vertical-align:middle"><div style="font-size:17px;font-weight:700;color:${text}">${brand}</div></td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 14px 14px 14px;font-size:15px;line-height:1.45;color:${text}">
          <p style="margin:0 0 8px 0">${hello}</p>
          <p style="margin:0 0 8px 0">${base}</p>
          ${totalsHtml}
          <p style="margin:8px 0 0 0;font-size:13px;color:${muted}">We accept ACH / wire / credit card (3% fee).</p>
          ${buttonHtml}
          ${termsHtml}
          ${repHtml}
          <p style="margin:12px 0 0 0">Thanks,<br>${brand}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 14px;border-top:1px solid ${border};font-size:12px;color:${muted}">
          <span>${phone ? `📞 ${phone}` : ''}</span>${phone ? ' • ' : ''}${email ? `✉️ ${email}` : ''}${email ? ' • ' : ''}${website ? `🌐 ${website}` : ''}
          <div style="margin-top:6px;color:${muted}">© ${new Date().getFullYear()} ${brand}. All rights reserved.</div>
        </td>
      </tr>
    </table>
  </div>`;
}


// SAVE exact numbers from Sales Intake sidebar
router.post('/:id/totals', async (req, res) => {
  const bidId = Number(req.params.id);
  console.log('[TOT-SAVE] bidId=', bidId, 'payload=', req.body);
  try {
    const {
      subtotal_after_discount, tax_rate, tax_amount,
      cc_fee_pct, cc_fee, total,
      deposit_pct, deposit_amount, remaining_amount
    } = req.body || {};

    const sql = `
      INSERT INTO public.bid_grand_totals
        (bid_id, subtotal_after_discount, tax_rate, tax_amount,
         cc_fee_pct, cc_fee, total,
         deposit_pct, deposit_amount, remaining_amount, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT ON CONSTRAINT bid_grand_totals_pkey DO UPDATE SET
        subtotal_after_discount=$2, tax_rate=$3, tax_amount=$4,
        cc_fee_pct=$5, cc_fee=$6, total=$7,
        deposit_pct=$8, deposit_amount=$9, remaining_amount=$10, updated_at=NOW()
      RETURNING *`;
    const params = [
      bidId,
      $(subtotal_after_discount), Number(tax_rate||0), $(tax_amount),
      Number(cc_fee_pct||0), $(cc_fee), $(total),
      Number(deposit_pct||0), $(deposit_amount), $(remaining_amount)
    ];
    console.log('[SQL]', sql.replace(/\s+/g,' '), '[PARAMS]', params);

    const { rows } = await pool.query(sql, params);
    console.log('[TOT-SAVE OK]', rows[0]);
    res.json({ ok: true, row: rows[0] });
  } catch (e) {
    console.error('[TOT-SAVE FAIL]', e);
    res.status(500).json({ ok: false, error: e.message || 'save_totals_failed' });
  }
});

router.get('/:id/totals', async (req, res) => {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ ok: false, error: 'invalid_bid_id' });
  }

  const { rows } = await pool.query(
    `SELECT
        subtotal_after_discount,
        tax_rate,
        tax_amount,
        cc_fee_pct,
        cc_fee,
        total,
        deposit_pct,
        deposit_amount,
        remaining_amount,
        updated_at
     FROM public.bid_grand_totals
     WHERE bid_id = $1`,
    [id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }

  // <-- key change: return the row directly
  return res.json(rows[0]);
});


// POST /api/bids/:id/lines
router.post("/:id/lines", async (req, res) => { 
  try {
    const bidId = Number(req.params.id);
    await assertDraft(db, bidId);

    const {
      code = null, description, category = null, unit_of_measure = "ea",
      qty_per_unit = 1, unit_price = null, pricing_method = "fixed",
      sort_order = 0, notes = null,
    } = req.body;

    if (!description) return res.status(400).json({ error: "description_required" });

    const { rows } = await db.query(
      `INSERT INTO bid_lines
         (bid_id, code, description, category, unit_of_measure,
          qty_per_unit, unit_price, pricing_method, sort_order, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [bidId, code, description, category, unit_of_measure,
       qty_per_unit, unit_price, pricing_method, sort_order, notes]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH /api/bids/columns/:columnId/units
router.patch("/columns/:columnId/units", async (req, res) => {
  try {
    const columnId = Number(req.params.columnId);
    const { units } = req.body;
    if (!Number.isFinite(units) || units < 0) return res.status(400).json({ error: "units_invalid" });

    const r = await db.query(`SELECT bid_id FROM bid_columns WHERE id = $1`, [columnId]);
    if (!r.rowCount) return res.status(404).json({ error: "column_not_found" });
    await assertDraft(db, r.rows[0].bid_id);

    const upd = await db.query(
      `UPDATE bid_columns SET units = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [units, columnId]
    );
    res.json(upd.rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/bids/:id/quote-totals  -> { total, deposit, remaining }
router.get('/:id/quote-totals', async (req, res) => {
  const id = Number(req.params.id);
  const sql = `
    WITH agg AS (
      SELECT
        b.id AS bid_id,
        COALESCE(SUM(ct.amount_subtotal), 0)::numeric AS sub_after,   -- sidebar base
        COALESCE(b.tax_rate,   0)::numeric AS tax_rate,               -- FRACTIONS (0.0725)
        COALESCE(b.cc_fee_pct, 0)::numeric AS cc_pct,                 -- FRACTIONS (0.03)
        COALESCE(b.deposit_pct,0)::numeric AS dep_pct                 -- FRACTIONS (0.50)
      FROM bids b
      LEFT JOIN bid_column_totals ct ON ct.bid_id = b.id
      WHERE b.id = $1
      GROUP BY b.id, b.tax_rate, b.cc_fee_pct, b.deposit_pct
    ),
    steps AS (
      SELECT
        sub_after,
        ROUND(sub_after * tax_rate, 2)                          AS tax_amt,
        ROUND((sub_after + (sub_after * tax_rate)) * cc_pct, 2) AS cc_fee,
        dep_pct
      FROM agg
    )
    SELECT
      ROUND(sub_after + tax_amt + cc_fee, 2)                                             AS total,
      ROUND((sub_after + tax_amt + cc_fee) * dep_pct, 2)                                 AS deposit,
      ROUND((sub_after + tax_amt + cc_fee) - ((sub_after + tax_amt + cc_fee) * dep_pct), 2) AS remaining
    FROM steps;
  `;
  try {
    const { rows } = await db.query(sql, [id]);
    res.json(rows[0] || { total: 0, deposit: 0, remaining: 0 });
  } catch (e) {
    console.error('quote-totals error:', e);
    res.status(500).json({ error: 'quote_totals_failed' });
  }
});

// PUT /api/bids/:id/columns  -> replace the bid's column totals
router.put('/:id/columns', async (req, res) => {
  const bidId = Number(req.params.id);
  const cols = Array.isArray(req.body?.columns) ? req.body.columns : [];
  if (!bidId) return res.status(400).json({ ok:false, error:'bad_bid' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bid_column_totals WHERE bid_id = $1', [bidId]);
    if (cols.length) {
      const sql = `INSERT INTO bid_column_totals (bid_id, column_id, column_label, units, amount_subtotal)
                   VALUES ($1,$2,$3,$4,$5)`;
      for (const c of cols) {
        await client.query(sql, [
          bidId,
          Number(c.column_id) || 0,
          String(c.column_label || ''),
          Number(c.units) || 0,
          Number(c.amount_subtotal) || 0
        ]);
      }
    }
    await client.query('COMMIT');
    res.json({ ok:true, changed: cols.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('columns upsert error:', e);
    res.status(500).json({ ok:false, error:'columns_upsert_failed' });
  } finally {
    client.release();
  }
});


// POST /api/bids/:id/sidebar-totals
// Body: { subtotal_after_discount, tax_rate, tax_amount, cc_fee_pct, cc_fee, total, deposit_pct, deposit_amount, remaining_amount }
router.post('/:id/sidebar-totals', async (req, res) => {
  const bidId = Number(req.params.id);
  const b = req.body || {};

  // enforce fractions
  const tax_rate   = Number(b.tax_rate ?? 0);            // e.g., 0.0725
  const cc_fee_pct = Number(b.cc_fee_pct ?? 0);          // 0.03
  const deposit_pct= Number(b.deposit_pct ?? 0);         // 0.50

  const sql = `
    INSERT INTO bid_grand_totals AS g
      (bid_id, subtotal_after_discount, tax_rate, tax_amount, cc_fee_pct, cc_fee,
       total, deposit_pct, deposit_amount, remaining_amount, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
    ON CONFLICT (bid_id) DO UPDATE SET
       subtotal_after_discount = EXCLUDED.subtotal_after_discount,
       tax_rate   = EXCLUDED.tax_rate,
       tax_amount = EXCLUDED.tax_amount,
       cc_fee_pct = EXCLUDED.cc_fee_pct,
       cc_fee     = EXCLUDED.cc_fee,
       total      = EXCLUDED.total,
       deposit_pct= EXCLUDED.deposit_pct,
       deposit_amount   = EXCLUDED.deposit_amount,
       remaining_amount = EXCLUDED.remaining_amount,
       updated_at = now()
    RETURNING *;
  `;
  try {
    const { rows } = await db.query(sql, [
      bidId,
      b.subtotal_after_discount, tax_rate, b.tax_amount,
      cc_fee_pct, b.cc_fee,
      b.total, deposit_pct, b.deposit_amount, b.remaining_amount
    ]);
    res.json({ ok: true, saved: rows[0] });
  } catch (e) {
    console.error('sidebar-totals upsert error', e);
    res.status(500).json({ ok:false, error:'save_failed' });
  }
});

// POST /api/bids/:id/recalc  -> trigger a recalculation (currently a noop)
router.post('/:id/recalc', async (req, res) => {
  try {
    // Optional: SELECT from views to force planner to compute; otherwise noop
    // await db.query('SELECT 1'); 
    // await db.query('SELECT 1'); 
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'recalc_failed', detail: e.message });
  }
});

// DELETE column
router.delete("/columns/:columnId", async (req, res) => {
  try {
    const columnId = Number(req.params.columnId);
    const r = await db.query(`SELECT bid_id FROM bid_columns WHERE id = $1`, [columnId]);
    if (!r.rowCount) return res.status(404).json({ error: "column_not_found" });
    await assertDraft(db, r.rows[0].bid_id);
    await db.query(`DELETE FROM bid_columns WHERE id = $1`, [columnId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE line
router.delete("/lines/:lineId", async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const r = await db.query(`SELECT bid_id FROM bid_lines WHERE id = $1`, [lineId]);
    if (!r.rowCount) return res.status(404).json({ error: "line_not_found" });
    await assertDraft(db, r.rows[0].bid_id);
    await db.query(`DELETE FROM bid_lines WHERE id = $1`, [lineId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/bids/:id/docs-zip  -> streams all doc_links as a ZIP
router.get('/:id/docs-zip', async (req, res) => {
  const bidId = Number(req.params.id);
  if (!bidId) return res.status(400).json({ error: 'bad_bid_id' });
  try {
    // Get doc_links from bid
    const { rows } = await pool.query('SELECT doc_links FROM bids WHERE id = $1', [bidId]);
    if (!rows.length) return res.status(404).json({ error: 'bid_not_found' });
    const docs = Array.isArray(rows[0].doc_links) ? rows[0].doc_links : [];
    if (!docs.length) return res.status(404).json({ error: 'no_docs' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="bid_${bidId}_docs.zip"`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const doc of docs) {
      if (!doc.url) continue;
      // Only include local files (not external links)
      if (!/^\/uploads\//.test(doc.url)) continue;
      const abs = path.join(process.cwd(), doc.url.replace(/^\//, ''));
      if (fs.existsSync(abs)) {
        // Use doc.name or fallback to file name
        const fname = doc.name || path.basename(abs);
        archive.file(abs, { name: fname });
      }
    }
    archive.finalize();
  } catch (e) {
    console.error('ZIP error:', e);
    res.status(500).json({ error: 'zip_failed', detail: e.message });
  }
});

// GET /api/bids/:id/model -> returns mock model data for the bid
router.get('/:id/model', async (req, res) => {
  const bidId = Number(req.params.id);
  if (!bidId) return res.status(400).json({ error: 'bad_bid_id' });
  // TODO: Replace with real DB query for model data
  // For now, return a mock response
  res.json({
    columns: [],
    lines: []
  });
});


export default router;

