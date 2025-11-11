import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import pool from "../db.js";
import { requireAuth } from "./auth.js";
import { saveDataUrlToFile } from "../app.js";

const router = Router();
const allow = (_req, _res, next) => next(); // TODO: swap to your real auth guard

const SDEBUG = process.env.DEBUG ? process.env.DEBUG.split(",").map((s) => s.trim().toLowerCase()).includes("bids") : true;
const slog = (...a) => {
  if (SDEBUG) console.log("[BIDS]", ...a);
};

const BID_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "bid-docs");
fs.mkdirSync(BID_UPLOAD_ROOT, { recursive: true });

const tablePresenceCache = new Map();
const tableColumnsCache = new Map();

// Transaction helper to guarantee BEGIN/COMMIT/ROLLBACK and client.release()
export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("[TX ERROR]", err);
    throw err;
  } finally {
    client.release();
  }
}

router.get("/__ping", (_req, res) => {
  res.json({ ok: true, from: "routes/bids.js" });
});

const DETAILS_SQL = `
  SELECT id, job_id, builder_id, name, status, notes,
    order_no,
         sales_person, onboarding, doc_links, calc_snapshot,
         subtotal_after_discount, tax_rate, tax_rate_pct,
         tax_amount, cc_fee_pct, cc_fee_amount, total, total_amount,
         deposit_pct, deposit_amount, remaining_balance, promised_install_date,
         customer_email, purchasing_status, ready_for_schedule, po_number,
         deposit_invoice_id, deposit_received_at, credit_card, updated_at
    FROM public.bids
   WHERE id = $1
`; // keep in sync with shapeBidDetails

const TOTALS_SQL = `
  SELECT bid_id, subtotal_after_discount, tax_rate, tax_amount, cc_fee_pct,
         cc_fee, total, deposit_pct, deposit_amount, remaining_amount,
         updated_at, subtotal_after, cc_fee_amount
    FROM public.bid_grand_totals
   WHERE bid_id = $1
`;

const QUOTE_TOTALS_VIEW_SQL = `
  SELECT
    COALESCE(subtotal, subtotal_after, subtotal_after_discount, 0)::float AS subtotal,
    COALESCE(tax, 0)::float                                              AS tax,
    COALESCE(total, 0)::float                                            AS total,
    COALESCE(deposit_amount, 0)::float                                   AS deposit_amount,
    COALESCE(remaining, remaining_amount, 0)::float                      AS remaining,
    COALESCE(deposit_pct, 0)::float                                      AS deposit_pct,
    COALESCE(tax_rate, 0)::float                                         AS tax_rate
  FROM public.bid_quote_totals
  WHERE bid_id = $1
`;

const QUOTE_TOTALS_COMPUTE_SQL = `
  WITH b AS (
    SELECT id, COALESCE(tax_rate,0) AS tax_rate, COALESCE(deposit_pct,0) AS deposit_pct
      FROM public.bids WHERE id = $1
  ),
  u AS (
    SELECT COALESCE(SUM(units),0) AS units FROM public.bid_columns WHERE bid_id = $1
  ),
  l AS (
    SELECT COALESCE(SUM(qty_per_unit * unit_price),0) AS per_unit FROM public.bid_lines WHERE bid_id = $1
  ),
  raw AS (
    SELECT (u.units * l.per_unit) AS subtotal FROM u, l
  )
  SELECT
    COALESCE(raw.subtotal,0)::float                                        AS subtotal,
    ROUND(COALESCE(raw.subtotal,0) * b.tax_rate, 2)::float                 AS tax,
    ROUND(COALESCE(raw.subtotal,0) * (1 + b.tax_rate), 2)::float           AS total,
    ROUND(COALESCE(raw.subtotal,0) * (1 + b.tax_rate) * b.deposit_pct,2)::float AS deposit_amount,
    ROUND(COALESCE(raw.subtotal,0) * (1 + b.tax_rate) * (1 - b.deposit_pct),2)::float AS remaining,
    b.deposit_pct::float,
    b.tax_rate::float
  FROM raw, b;
`;

function ensurePlainObject(val) {
  return val && typeof val === "object" && !Array.isArray(val) ? val : {};
}

function ensureArray(val) {
  return Array.isArray(val) ? val : [];
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNumberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function tableExists(tableName) {
  const key = String(tableName || "").toLowerCase();
  if (!key) return false;
  if (tablePresenceCache.has(key)) {
    return tablePresenceCache.get(key);
  }
  try {
    const { rows } = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1`,
      [key]
    );
    const exists = rows.length > 0;
    tablePresenceCache.set(key, exists);
    return exists;
  } catch (e) {
    console.warn(`[schema check] table ${tableName} lookup failed:`, e?.message);
    tablePresenceCache.set(key, false);
    return false;
  }
}

async function getTableColumns(tableName) {
  const key = String(tableName || "").toLowerCase();
  if (!key) return [];
  if (tableColumnsCache.has(key)) {
    return tableColumnsCache.get(key);
  }
  try {
    const { rows } = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1`,
      [key]
    );
    const cols = rows.map((r) => r.column_name);
    tableColumnsCache.set(key, cols);
    return cols;
  } catch (e) {
    console.warn(`[schema check] columns for ${tableName} failed:`, e?.message);
    tableColumnsCache.set(key, []);
    return [];
  }
}

async function tableHasColumn(tableName, columnName) {
  const cols = await getTableColumns(tableName);
  return cols.includes(String(columnName || ""));
}

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeFileName(name, fallback = "document") {
  const base = safeString(name, fallback)
    .trim()
    .replace(/[\s]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || fallback;
}

function normalizeDoc(raw, bidId, source, idx = 0) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const label = raw.split("/").pop() || `doc-${idx + 1}`;
    return {
      id: null,
      bid_id: bidId,
      kind: null,
      name: label,
      url: raw,
      column_id: null,
      uploaded_at: null,
      source,
    };
  }

  if (typeof raw !== "object") return null;

  const url = safeString(raw.url ?? raw.href ?? raw.link ?? raw.file_path ?? raw.path ?? "");
  if (!url) return null;
  const name = safeString(raw.name ?? raw.file_name ?? raw.filename ?? raw.title ?? url.split("/").pop(), `doc-${idx + 1}`);
  const columnIdRaw = raw.column_id ?? raw.columnId;
  const columnId = Number.isFinite(Number(columnIdRaw)) ? Number(columnIdRaw) : null;
  return {
    id: Number.isFinite(Number(raw.id)) ? Number(raw.id) : null,
    bid_id: bidId,
    kind: safeString(raw.kind ?? raw.type ?? null, null),
    name,
    url,
    column_id: columnId,
    uploaded_at: raw.uploaded_at ?? raw.created_at ?? raw.date ?? null,
    source,
  };
}

function matchesDocUrl(entry, targetUrl) {
  if (!targetUrl) return false;
  if (!entry) return false;
  if (typeof entry === "string") {
    return entry === targetUrl;
  }
  if (typeof entry === "object") {
    const candidate = entry.url ?? entry.href ?? entry.link ?? "";
    return candidate === targetUrl;
  }
  return false;
}

function buildPublicUploadPath(absPath) {
  const relative = path.relative(path.join(process.cwd(), "uploads"), absPath);
  const normalized = relative.split(path.sep).join("/");
  return `/uploads/${normalized}`.replace(/\/+/g, "/");
}

function tryRemoveLocalFile(url) {
  if (!url) return;
  const cleanUrl = url.split("?")[0];
  if (!cleanUrl.startsWith("/")) return;
  const abs = path.join(process.cwd(), cleanUrl.replace(/^\/+/, ""));
  fs.unlink(abs, (err) => {
    if (err && err.code !== "ENOENT") {
      console.warn("[doc delete] failed to remove", abs, err.message);
    }
  });
}

async function loadBidModel(bidId) {
  const id = Number(bidId);
  if (!Number.isFinite(id)) return null;

  const [hasBidColumnId, columnsQ, snapshotQ] = await Promise.all([
    tableHasColumn("bid_lines", "bid_column_id").catch(() => false),
    pool
      .query(
        `SELECT id, label, room, unit_type, color, units, sort_order
           FROM public.bid_columns
          WHERE bid_id = $1
          ORDER BY sort_order, id`,
        [id]
      )
      .catch(() => ({ rows: [] })),
    pool
      .query(
        `SELECT calc_snapshot
           FROM public.bids
          WHERE id = $1
          LIMIT 1`,
        [id]
      )
      .catch(() => ({ rows: [] })),
  ]);

  let linesQ = { rows: [] };
  try {
    const selectLines = `SELECT id, description, category, qty_per_unit, unit_price, pricing_method, sort_order,
            ${hasBidColumnId ? "bid_column_id" : "NULL::int AS bid_column_id"}
           FROM public.bid_lines
          WHERE bid_id = $1
          ORDER BY sort_order, id`;
    linesQ = await pool.query(selectLines, [id]);
  } catch {
    linesQ = { rows: [] };
  }

  const snapshotRaw = columnsQ.rows.length || snapshotQ.rows.length ? ensurePlainObject(snapshotQ.rows[0]?.calc_snapshot) : {};
  const projectSnapshot = ensurePlainObject(snapshotRaw.projectSnapshot ?? snapshotRaw.project_snapshot ?? {});

  const snapshotColumns = ensureArray(snapshotRaw.columns ?? projectSnapshot.columns ?? projectSnapshot.cards ?? []);
  let snapshotLines = ensureArray(
    snapshotRaw.lines ??
      snapshotRaw.line_items ??
      projectSnapshot.lines ??
      projectSnapshot.line_items ??
      []
  );

  const columns = columnsQ.rows.length
    ? columnsQ.rows.map((row, idx) => ({
        column_id: Number(row.id),
        column_label: row.label ?? `Card ${idx + 1}`,
        room: row.room ?? null,
        unit_type: row.unit_type ?? null,
        color: row.color ?? null,
        units: toNumberOrZero(row.units),
        sort_order: toNumberOrZero(row.sort_order ?? idx),
      }))
    : snapshotColumns.map((col, idx) => ({
        column_id: Number.isFinite(Number(col.column_id ?? col.id)) ? Number(col.column_id ?? col.id) : idx + 1,
        column_label: col.column_label ?? col.label ?? col.room ?? `Card ${idx + 1}`,
        room: col.room ?? null,
        unit_type: col.unit_type ?? col.type ?? null,
        color: col.color ?? col.finish_color ?? null,
        units: toNumberOrZero(col.units ?? col.unit_count ?? col.qty ?? 0),
        sort_order: toNumberOrZero(col.sort_order ?? idx),
      }));

  if (!snapshotLines.length && linesQ.rows.length) {
    snapshotLines = linesQ.rows.map((line, idx) => ({
      line_id: Number(line.id),
      description: safeString(line.description ?? ""),
      category: safeString(line.category ?? null, null),
      qty_per_unit: toNumberOrZero(line.qty_per_unit),
      unit_price: toNumberOrZero(line.unit_price),
      pricing_method: safeString(line.pricing_method ?? "fixed") || "fixed",
      sort_order: toNumberOrZero(line.sort_order ?? idx),
      column_id: Number.isFinite(Number(line.bid_column_id)) ? Number(line.bid_column_id) : null,
    }));
  }

  const lines = snapshotLines.map((line, idx) => {
    const rawId = line.id ?? line.line_id;
    const lineId = Number.isFinite(Number(line.line_id ?? line.id)) ? Number(line.line_id ?? line.id) : idx + 1;
    const rawColumnId = line.column_id ?? line.bid_column_id ?? line.columnId ?? line.columnID ?? null;
    return {
      id: Number.isFinite(Number(rawId)) ? Number(rawId) : lineId,
      line_id: lineId,
      description: safeString(line.description ?? line.name ?? ""),
      category: safeString(line.category ?? null, null),
      qty_per_unit: toNumberOrZero(line.qty_per_unit ?? line.qty ?? line.quantity ?? 0),
      unit_price: toNumberOrZero(line.unit_price ?? line.price ?? 0),
      pricing_method: safeString(line.pricing_method ?? line.method ?? "fixed") || "fixed",
      sort_order: toNumberOrZero(line.sort_order ?? idx),
      column_id: Number.isFinite(Number(rawColumnId)) ? Number(rawColumnId) : null,
    };
  });

  const cardsCount =
    columns.length || toNumberOrZero(snapshotRaw.cards_count ?? projectSnapshot.cards_count ?? projectSnapshot.cards ?? 0);
  const unitsCount =
    columns.reduce((sum, col) => sum + toNumberOrZero(col.units), 0) ||
    toNumberOrZero(snapshotRaw.units_count ?? projectSnapshot.units_count ?? projectSnapshot.units ?? 0);

  return {
    columns,
    lines,
    cards_count: cardsCount,
    units_count: unitsCount,
    projectSnapshot,
    snapshot: snapshotRaw,
  };
}

async function gatherBidDocuments(bidId) {
  const id = Number(bidId);
  if (!Number.isFinite(id)) return [];

  if (!(await tableExists("bid_documents"))) {
    // fallback to legacy doc_links only
    try {
      const { rows } = await pool.query(`SELECT doc_links FROM public.bids WHERE id = $1`, [id]);
      return ensureArray(rows[0]?.doc_links).map((entry, idx) => normalizeDoc(entry, id, "doc_links", idx)).filter(Boolean);
    } catch {
      return [];
    }
  }

  const hasColumnId = await tableHasColumn("bid_documents", "column_id");
  const hasUrl = await tableHasColumn("bid_documents", "url");
  const hasFilePath = await tableHasColumn("bid_documents", "file_path");
  const hasFileName = await tableHasColumn("bid_documents", "file_name");

  const urlExpr = hasUrl && hasFilePath ? "COALESCE(url, file_path) AS url" : hasUrl ? "url" : hasFilePath ? "file_path AS url" : "NULL::text AS url";
  const nameExpr = hasFileName ? "COALESCE(name, file_name) AS name" : "name";
  const columnExpr = hasColumnId ? "column_id" : "NULL::int AS column_id";

  const docsQ = await pool
    .query(
      `SELECT id, bid_id, kind, ${nameExpr}, ${urlExpr}, ${columnExpr}, uploaded_at
         FROM public.bid_documents
        WHERE bid_id = $1
        ORDER BY uploaded_at DESC NULLS LAST, id DESC`,
      [id]
    )
    .catch(() => ({ rows: [] }));

  const docs = docsQ.rows.map((row, idx) => normalizeDoc(row, id, "bid_documents", idx)).filter(Boolean);

  let legacy = [];
  try {
    const { rows } = await pool.query(`SELECT doc_links FROM public.bids WHERE id = $1`, [id]);
    legacy = ensureArray(rows[0]?.doc_links).map((entry, idx) => normalizeDoc(entry, id, "doc_links", idx)).filter(Boolean);
  } catch {
    legacy = [];
  }

  return [...docs, ...legacy];
}

async function appendDocToArchive(archive, doc) {
  if (!doc || !doc.url) return false;
  const cleanUrl = doc.url.split("?")[0];
  const safeName = safeFileName(doc.name || cleanUrl.split("/").pop() || `doc-${doc.id || Date.now()}`);

  if (cleanUrl.startsWith("/")) {
    const abs = path.join(process.cwd(), cleanUrl.replace(/^\/+/, ""));
    if (fs.existsSync(abs)) {
      archive.file(abs, { name: safeName });
      return true;
    }
  }

  if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
    try {
      const resp = await fetch(cleanUrl);
      if (!resp.ok) return false;
      const buffer = Buffer.from(await resp.arrayBuffer());
      archive.append(buffer, { name: safeName });
      return true;
    } catch (e) {
      console.warn("[docs-zip] remote fetch failed", cleanUrl, e?.message);
      return false;
    }
  }

  return false;
}

function mapTotalsRow(row, source) {
  if (!row) return null;

  const subtotal = toNumberOrZero(
    row.subtotal ?? row.subtotal_after ?? row.subtotal_after_discount
  );
  const taxRate = toNumberOrZero(row.tax_rate ?? row.tax_rate_pct);
  const tax = toNumberOrZero(row.tax ?? row.tax_amount);
  const total = toNumberOrZero(row.total ?? row.total_amount);
  const depositPct = toNumberOrZero(row.deposit_pct);
  const depositAmount = toNumberOrZero(row.deposit_amount);
  const remaining = toNumberOrZero(
    row.remaining ?? row.remaining_amount ?? row.remaining_balance
  );
  const ccFeeAmount = toNumberOrZero(row.cc_fee_amount ?? row.cc_fee);
  const ccFeePct = toNumberOrZero(row.cc_fee_pct);

  return {
    bid_id: row.bid_id ?? row.id ?? null,
    subtotal,
    subtotal_after: subtotal,
    subtotal_after_discount: subtotal,
    tax_rate: taxRate,
    tax,
    tax_amount: tax,
    cc_fee_pct: ccFeePct,
    cc_fee: ccFeeAmount,
    cc_fee_amount: ccFeeAmount,
    total,
    total_amount: total,
    deposit_pct: depositPct,
    deposit_amount: depositAmount,
    remaining,
    remaining_amount: remaining,
    updated_at: row.updated_at || null,
    source,
  };
}

function shapeBidDetails(row) {
  if (!row) return null;
  const onboarding = ensurePlainObject(row.onboarding);
  const docLinks = ensureArray(row.doc_links);
  const calcSnapshot = row.calc_snapshot && typeof row.calc_snapshot === "object" ? row.calc_snapshot : null;
  const projectSnapshot = calcSnapshot?.projectSnapshot ?? calcSnapshot?.project_snapshot ?? null;

  const salesPerson = row.sales_person ?? onboarding.sales_person ?? onboarding.salesman ?? null;
  const homeowner = onboarding.customer_name ?? onboarding.homeowner ?? null;
  const customerPhone = onboarding.customer_phone ?? onboarding.phone ?? null;
  const homeAddress = onboarding.home_address ?? onboarding.address ?? null;
  const orderNo = row.order_no ?? onboarding.order_number ?? onboarding.order_no ?? null;

  return {
    id: row.id,
    job_id: row.job_id,
    builder_id: row.builder_id,
    name: row.name,
    status: row.status,
    notes: row.notes,
    sales_person: salesPerson,
    salesman: salesPerson,
    designer: onboarding.designer ?? null,
    homeowner,
    customer_phone: customerPhone,
    customer_email: row.customer_email ?? onboarding.customer_email ?? null,
    home_address: homeAddress,
    order_number: orderNo,
    order_no: orderNo,
    onboarding,
    doc_links: docLinks,
    calc_snapshot: calcSnapshot,
    projectSnapshot,
    subtotal_after_discount: toNumberOrNull(row.subtotal_after_discount ?? row.subtotal_after),
    tax_rate: toNumberOrNull(row.tax_rate ?? row.tax_rate_pct),
    tax_amount: toNumberOrNull(row.tax_amount),
    cc_fee_pct: toNumberOrNull(row.cc_fee_pct),
    cc_fee_amount: toNumberOrNull(row.cc_fee_amount),
    total: toNumberOrNull(row.total_amount ?? row.total),
    deposit_pct: toNumberOrNull(row.deposit_pct),
    deposit_amount: toNumberOrNull(row.deposit_amount),
    remaining_amount: toNumberOrNull(row.remaining_balance),
    promised_install_date: row.promised_install_date || null,
    purchasing_status: row.purchasing_status || null,
    ready_for_schedule: row.ready_for_schedule ?? null,
    po_number: row.po_number || null,
    deposit_invoice_id: row.deposit_invoice_id || null,
    deposit_received_at: row.deposit_received_at || null,
    credit_card: row.credit_card ?? null,
    updated_at: row.updated_at || null,
  };
}

async function loadBidDetails(bidId) {
  const { rows } = await pool.query(DETAILS_SQL, [bidId]);
  if (!rows.length) return null;
  return shapeBidDetails(rows[0]);
}

async function loadBidTotals(bidId) {
  const id = Number(bidId);
  if (!Number.isFinite(id)) return null;

  // Preferred: view-based canonical totals
  try {
    const viewQ = await pool.query(QUOTE_TOTALS_VIEW_SQL, [id]);
    if (viewQ.rows.length) {
      return mapTotalsRow({ ...viewQ.rows[0], bid_id: id }, "bid_quote_totals");
    }
  } catch (err) {
    if (err?.code !== "42P01" && err?.code !== "42703") {
      console.warn("[loadBidTotals] bid_quote_totals view error:", err.message);
    }
  }

  // Legacy aggregate table
  try {
    const totalsQ = await pool.query(TOTALS_SQL, [id]);
    if (totalsQ.rows.length) {
      return mapTotalsRow(totalsQ.rows[0], "grand_totals");
    }
  } catch (err) {
    if (err?.code !== "42P01") {
      throw err;
    }
  }

  // Computed fallback if view/table missing
  try {
    const computedQ = await pool.query(QUOTE_TOTALS_COMPUTE_SQL, [id]);
    if (computedQ.rows.length) {
      return mapTotalsRow({ ...computedQ.rows[0], bid_id: id }, "computed");
    }
  } catch (err) {
    if (err?.code !== "42P01") {
      console.warn("[loadBidTotals] compute fallback error:", err.message);
    }
  }

  // Last resort: raw columns from bids table
  try {
    const fallback = await pool.query(
      `SELECT id AS bid_id, subtotal_after_discount, tax_rate, tax_rate_pct,
              tax_amount, cc_fee_pct, cc_fee_amount, total, total_amount, deposit_pct,
              deposit_amount, remaining_balance
         FROM public.bids WHERE id = $1`,
      [id]
    );
    if (!fallback.rows.length) return null;
    return mapTotalsRow(fallback.rows[0], "bids");
  } catch (err) {
    if (err?.code === "42P01") return null;
    throw err;
  }
}

function requireAdminOrPurchasing(req, res, next) {
  const role = req.user?.role;
  if (role === "admin" || role === "purchasing") return next();
  return res.status(403).json({ error: "forbidden" });
}

router.get("/recent", requireAuth, async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 10));
  const sql = `
    SELECT id, name, builder_id, total, status, updated_at
      FROM public.bids
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT $1;
  `;
  try {
    const { rows } = await pool.query(sql, [limit]);
    res.json({ ok: true, bids: rows });
  } catch (e) {
    console.error("[/api/bids/recent]", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// GET /api/bids/:id/customer-info
router.get("/:id/customer-info", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "bad-id" });
  }

  try {
    const sql = `
      SELECT
        b.id,
        COALESCE(b.onboarding->>'customer_name', b.onboarding->>'homeowner', '')         AS customer_name,
        COALESCE(b.customer_email, b.onboarding->>'customer_email', '')                  AS customer_email,
        COALESCE(b.calc_snapshot->'projectSnapshot'->>'project_name', b.name, '')        AS project_name,
        COALESCE(b.onboarding->>'builder', '')                                           AS builder,
        COALESCE(b.onboarding->>'home_address', '')                                      AS home_address,
        COALESCE(b.onboarding->>'lot_plan', b.onboarding->>'lot_plan_name', '')          AS lot_plan_name,
        COALESCE(b.sales_person, b.onboarding->>'sales_person', '')                      AS sales_person,
        COALESCE(b.status, 'draft')                                                      AS status,
        COALESCE(b.deposit_pct, 0)::float                                                AS deposit_pct,
        COALESCE(b.tax_rate, 0)::float                                                   AS tax_rate
      FROM public.bids b
      WHERE b.id = $1
    `;
    const { rows } = await pool.query(sql, [id]);
    if (!rows.length) return res.status(404).json({ error: "not-found" });
    const payload = rows[0];
    slog("CUSTOMER-INFO", { id, ok: true });
    res.json(payload);
  } catch (err) {
    console.error("customer-info error", err);
    res.status(500).json({ error: "customer-info" });
  }
});

// Basic columns for a bid (cards data)
router.get("/:id/columns", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isInteger(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    if (!(await tableExists("bid_columns"))) {
      return res.json([]);
    }

    const available = await getTableColumns("bid_columns");
    if (!available.includes("bid_id")) {
      return res.json([]);
    }
    const selectParts = [];

    const addField = (column, fallback) => {
      if (available.includes(column)) {
        selectParts.push(column);
      } else if (fallback) {
        selectParts.push(`${fallback} AS ${column}`);
      }
    };

  addField("id");
  addField("bid_id", "NULL::int AS bid_id");
    addField("label", "NULL::text AS label");
    addField("room", "NULL::text AS room");
    addField("unit_type", "NULL::text AS unit_type");
    addField("color", "NULL::text AS color");
    addField("units", "0::numeric AS units");
    addField("sort_order", "0::int AS sort_order");
    addField("notes", "NULL::text AS notes");
    addField("updated_at", "NULL::timestamptz AS updated_at");

    if (!selectParts.length) {
      selectParts.push("*");
    }

    const sql = `SELECT ${selectParts.join(", ")}
                   FROM public.bid_columns
                  WHERE bid_id = $1
                  ORDER BY sort_order, id`;
    const { rows } = await pool.query(sql, [bidId]);
    res.json(rows || []);
  } catch (e) {
    console.error("[GET /api/bids/:id/columns]", e);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

// Bid lines (rows table)
router.get("/:id/lines", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isInteger(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    if (!(await tableExists("bid_lines"))) {
      return res.json([]);
    }

    const available = await getTableColumns("bid_lines");
    if (!available.includes("bid_id")) {
      return res.json([]);
    }
    const selectParts = [];
    const addField = (column, fallback) => {
      if (available.includes(column)) {
        selectParts.push(column);
      } else if (fallback) {
        selectParts.push(`${fallback} AS ${column}`);
      }
    };

  addField("id");
  addField("bid_id", "NULL::int AS bid_id");
    addField("code", "NULL::text AS code");
    addField("description", "NULL::text AS description");
    addField("category", "NULL::text AS category");
    addField("unit_of_measure", "NULL::text AS unit_of_measure");
    addField("qty_per_unit", "0::numeric AS qty_per_unit");
    addField("unit_cost", "0::numeric AS unit_cost");
    addField("unit_price", "0::numeric AS unit_price");
    addField("pricing_method", "NULL::text AS pricing_method");
    addField("sort_order", "0::int AS sort_order");
    addField("active", "NULL::boolean AS active");
    addField("notes", "NULL::text AS notes");

    if (!selectParts.length) {
      selectParts.push("*");
    }

    const sql = `SELECT ${selectParts.join(", ")}
                   FROM public.bid_lines
                  WHERE bid_id = $1
                  ORDER BY sort_order, id`;
    const { rows } = await pool.query(sql, [bidId]);
    res.json(rows || []);
  } catch (e) {
    console.error("[GET /api/bids/:id/lines]", e);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

// Bid line cell overrides
router.get("/:id/line-cells", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isInteger(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    if (!(await tableExists("bid_line_cells"))) {
      return res.json([]);
    }

    const available = await getTableColumns("bid_line_cells");
    if (!available.includes("bid_id")) {
      return res.json([]);
    }
    const selectParts = [];
    const addField = (column, fallback) => {
      if (available.includes(column)) {
        selectParts.push(column);
      } else if (fallback) {
        selectParts.push(`${fallback} AS ${column}`);
      }
    };

  addField("id");
  addField("bid_id", "NULL::int AS bid_id");
    addField("bid_line_id", "NULL::int AS bid_line_id");
    addField("bid_column_id", "NULL::int AS bid_column_id");
    addField("qty_override", "NULL::numeric AS qty_override");
    addField("price_override", "NULL::numeric AS price_override");
    addField("computed_qty", "NULL::numeric AS computed_qty");
    addField("computed_price", "NULL::numeric AS computed_price");
    addField("notes", "NULL::text AS notes");

    if (!selectParts.length) {
      selectParts.push("*");
    }

    const sql = `SELECT ${selectParts.join(", ")}
                   FROM public.bid_line_cells
                  WHERE bid_id = $1
                  ORDER BY bid_line_id, bid_column_id, id`;
    const { rows } = await pool.query(sql, [bidId]);
    res.json(rows || []);
  } catch (e) {
    console.error("[GET /api/bids/:id/line-cells]", e);
    res.status(500).json({ error: "db_error", message: e.message });
  }
});

// Columns + Details + Hardware (join on (bid_id, column_id))
router.get("/:id/columns-details", allow, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
          bc.id AS column_id,
          bc.bid_id,
          bc.label AS column_label,
          bc.room, bc.unit_type, bc.color, bc.units, bc.sort_order,
          COALESCE(bcd.meta, '{}'::jsonb)     AS meta,
          COALESCE(bcd.hardware, '[]'::jsonb) AS hardware,
          bcd.notes, bcd.updated_at
         FROM public.bid_columns bc
    LEFT JOIN public.bid_column_details bcd
           ON bcd.bid_id   = bc.bid_id
          AND bcd.column_id = bc.id
        WHERE bc.bid_id = $1
        ORDER BY bc.sort_order, bc.id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error("[/api/bids/:id/columns-details]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id/columns-details/:columnId", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  const columnId = Number(req.params.columnId);
  if (!Number.isFinite(bidId) || !Number.isFinite(columnId)) {
    return res.status(400).json({ error: "invalid_id" });
  }

  if (!(await tableExists("bid_column_details"))) {
    return res.status(500).json({ error: "table_missing" });
  }

  const columns = await getTableColumns("bid_column_details");
  if (!columns.length) {
    return res.status(500).json({ error: "table_missing" });
  }

  const body = req.body || {};
  const meta = ensurePlainObject(body.meta);
  const hardware = ensureArray(body.hardware);
  const notesRaw = body.notes;
  const notes = notesRaw === undefined || notesRaw === null ? null : String(notesRaw);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM public.bid_column_details WHERE bid_id = $1 AND column_id = $2`, [bidId, columnId]);

    const insertColumns = ["bid_id", "column_id"];
    const placeholders = ["$1", "$2"];
    const params = [bidId, columnId];

    function pushParam(value, cast) {
      params.push(value);
      const placeholder = `$${params.length}`;
      return cast ? `${placeholder}${cast}` : placeholder;
    }

    if (columns.includes("meta")) {
      insertColumns.push("meta");
      placeholders.push(pushParam(JSON.stringify(meta), "::jsonb"));
    }

    if (columns.includes("hardware")) {
      insertColumns.push("hardware");
      placeholders.push(pushParam(JSON.stringify(hardware), "::jsonb"));
    }

    if (columns.includes("notes")) {
      insertColumns.push("notes");
      placeholders.push(pushParam(notes, ""));
    }

    if (columns.includes("updated_at")) {
      insertColumns.push("updated_at");
      placeholders.push("now()");
    }

    if (columns.includes("created_at")) {
      insertColumns.push("created_at");
      placeholders.push("now()");
    }

    const returningCols = ["bid_id", "column_id"]; 
    if (columns.includes("meta")) returningCols.push("meta");
    if (columns.includes("hardware")) returningCols.push("hardware");
    if (columns.includes("notes")) returningCols.push("notes");
    if (columns.includes("updated_at")) returningCols.push("updated_at");

    const sql = `INSERT INTO public.bid_column_details (${insertColumns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${returningCols.join(", ")}`;
    const { rows } = await client.query(sql, params);
    await client.query("COMMIT");
    const result = rows[0] ?? { bid_id: bidId, column_id: columnId, meta, hardware, notes };
    res.json(result);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[/api/bids/:id/columns-details/:columnId]", e);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
});

// Bid-level documents for Review page
router.get("/:id/documents", allow, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    if (!(await tableExists("bid_documents"))) {
      return res.json([]);
    }
    const docs = await gatherBidDocuments(bidId);
    const filtered = docs.filter((doc) => doc && doc.source === "bid_documents");
    res.json(filtered);
  } catch (e) {
    console.error("[/api/bids/:id/documents]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/:id/files", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const { rows } = await pool.query(`SELECT doc_links FROM public.bids WHERE id = $1`, [bidId]);
    if (!rows.length) {
      return res.status(404).json({ error: "not_found" });
    }
    const docs = ensureArray(rows[0]?.doc_links)
      .map((entry, idx) => normalizeDoc(entry, bidId, "doc_links", idx))
      .filter(Boolean);
    res.json(docs);
  } catch (e) {
    console.error("[/api/bids/:id/files]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/:id/docs/upload-dataurl", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  const body = req.body || {};
  const dataUrl = safeString(body.dataUrl ?? body.data_url ?? "");
  if (!dataUrl) {
    return res.status(400).json({ error: "missing_data_url" });
  }
  const kind = safeString(body.kind ?? "other") || "other";
  const requestedName = safeString(body.name ?? body.filename ?? "");
  const columnIdRaw = body.column_id ?? body.columnId;
  const columnId = Number.isFinite(Number(columnIdRaw)) ? Number(columnIdRaw) : null;
  const mimeMatch = /^data:([^;]+);/i.exec(dataUrl);
  const mimeType = mimeMatch ? mimeMatch[1] : null;

  const destDir = path.join(BID_UPLOAD_ROOT, String(bidId));
  const baseName = safeFileName(requestedName || `${kind}-${Date.now()}`).replace(/\.[^.]+$/, "");
  const saved = saveDataUrlToFile(dataUrl, destDir, `${Date.now()}_${baseName}`);
  if (!saved) {
    return res.status(400).json({ error: "bad_data_url" });
  }

  const absPath = saved.abs;
  const publicUrl = buildPublicUploadPath(absPath);
  let fileSize = 0;
  try {
    fileSize = fs.statSync(absPath).size || 0;
  } catch {
    fileSize = 0;
  }
  const displayName = requestedName || saved.fileName;
  const uploadedBy = req.user?.email ?? req.user?.name ?? null;

  try {
    const hasBidDocuments = await tableExists("bid_documents");
    if (!hasBidDocuments) {
      if (await tableHasColumn("bids", "doc_links")) {
        const entry = { kind, name: displayName, url: publicUrl };
        if (columnId !== null) entry.column_id = columnId;
        await pool
          .query(`UPDATE public.bids SET doc_links = COALESCE(doc_links, '[]'::jsonb) || $2::jsonb WHERE id = $1`, [
            bidId,
            JSON.stringify(entry),
          ])
          .catch(() => {});
        const normalized = normalizeDoc(entry, bidId, "doc_links");
        return res.json({ ok: true, file: normalized });
      }
      return res.status(500).json({ error: "table_missing" });
    }

    const columns = await getTableColumns("bid_documents");
    if (!columns.includes("bid_id")) {
      return res.status(500).json({ error: "table_missing" });
    }

    const insertColumns = [];
    const placeholders = [];
    const params = [];

    function addField(field, value, options = {}) {
      if (!columns.includes(field) && !options.force) return;
      if (options.literal) {
        insertColumns.push(field);
        placeholders.push(options.literal);
        return;
      }
      insertColumns.push(field);
      params.push(value);
      let placeholder = `$${params.length}`;
      if (options.cast) placeholder += options.cast;
      placeholders.push(placeholder);
    }

    addField("bid_id", bidId, { force: true });
    if (columns.includes("kind")) addField("kind", kind || null);
    if (columns.includes("name")) addField("name", displayName);
    else if (columns.includes("file_name")) addField("file_name", displayName);
    if (columns.includes("url")) addField("url", publicUrl);
    else if (columns.includes("file_path")) addField("file_path", publicUrl);
    if (columns.includes("column_id")) addField("column_id", columnId);
    if (columns.includes("uploaded_by")) addField("uploaded_by", uploadedBy);
    if (columns.includes("mime_type")) addField("mime_type", mimeType);
    if (columns.includes("file_size")) addField("file_size", fileSize);
    if (columns.includes("meta")) addField("meta", JSON.stringify({ column_id: columnId }), { cast: "::jsonb" });
    if (columns.includes("uploaded_at")) addField("uploaded_at", null, { literal: "now()" });
    if (columns.includes("created_at")) addField("created_at", null, { literal: "now()" });

    if (!insertColumns.length) {
      return res.status(500).json({ error: "table_missing" });
    }

    const sql = `INSERT INTO public.bid_documents (${insertColumns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING id`;
    const { rows } = await pool.query(sql, params);
    const insertedId = rows[0]?.id ?? null;

    const docs = await gatherBidDocuments(bidId);
    const file =
      docs.find((doc) =>
        insertedId ? doc?.id === insertedId : doc?.source === "bid_documents" && doc?.url === publicUrl
      ) || {
        id: insertedId,
        bid_id: bidId,
        kind,
        name: displayName,
        url: publicUrl,
        column_id: columnId,
        uploaded_at: new Date().toISOString(),
        source: "bid_documents",
      };

    res.json({ ok: true, file });
  } catch (e) {
    tryRemoveLocalFile(publicUrl);
    console.error("[/api/bids/:id/docs/upload-dataurl]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/:id/docs/delete", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  const body = req.body || {};
  const url = safeString(body.url ?? "");
  const docIdRaw = body.id ?? body.doc_id ?? body.document_id;
  const docId = Number.isFinite(Number(docIdRaw)) ? Number(docIdRaw) : null;

  if (!url && docId === null) {
    return res.status(400).json({ error: "missing_identifier" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let deleted = 0;
    let targetUrl = url;

    if (await tableExists("bid_documents")) {
      if (docId !== null) {
        const del = await client.query(
          `DELETE FROM public.bid_documents WHERE id = $1 AND bid_id = $2 RETURNING url, file_path`,
          [docId, bidId]
        );
        if (del.rowCount) {
          deleted += del.rowCount;
          const resolvedUrl = safeString(del.rows[0]?.url ?? del.rows[0]?.file_path ?? "");
          targetUrl = targetUrl || resolvedUrl;
          tryRemoveLocalFile(resolvedUrl);
        }
      }
      if (targetUrl) {
        const delUrl = await client.query(
          `DELETE FROM public.bid_documents WHERE bid_id = $1 AND (url = $2 OR file_path = $2) RETURNING url, file_path`,
          [bidId, targetUrl]
        );
        if (delUrl.rowCount) {
          deleted += delUrl.rowCount;
          tryRemoveLocalFile(delUrl.rows[0]?.url ?? delUrl.rows[0]?.file_path ?? null);
        }
      }
    }

    if (targetUrl && (await tableHasColumn("bids", "doc_links"))) {
      const current = await client
        .query(`SELECT doc_links FROM public.bids WHERE id = $1`, [bidId])
        .then((r) => ensureArray(r.rows[0]?.doc_links))
        .catch(() => []);
      if (current.length) {
        const filtered = current.filter((entry) => !matchesDocUrl(entry, targetUrl));
        if (filtered.length !== current.length) {
          await client.query(`UPDATE public.bids SET doc_links = $2::jsonb WHERE id = $1`, [bidId, JSON.stringify(filtered)]);
          deleted += 1;
        }
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, deleted });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[/api/bids/:id/docs/delete]", e);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
});

router.get("/:id/history", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, event_type, payload, created_by, created_at
         FROM public.job_events
        WHERE bid_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [bidId]
    );
    const events = rows.map((row) => ({
      id: row.id,
      type: row.event_type,
      note: ensurePlainObject(row.payload).note ?? "",
      photos: ensureArray(ensurePlainObject(row.payload).photos),
      by: row.created_by ?? ensurePlainObject(row.payload).by ?? "",
      created_at: row.created_at ?? null,
    }));
    res.json({ events });
  } catch (e) {
    console.error("[/api/bids/:id/history]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/:id/docs-zip", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const docs = await gatherBidDocuments(bidId);
    if (!docs.length) {
      return res.status(404).json({ error: "no_documents" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="bid_${bidId}_documents.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("[/api/bids/:id/docs-zip] archive error", err);
      try {
        res.status(500).end();
      } catch {}
    });

    archive.pipe(res);

    let appended = 0;
    for (const doc of docs) {
      try {
        // Sequential awaits keep memory and outbound requests bounded.
        const ok = await appendDocToArchive(archive, doc);
        if (ok) appended += 1;
      } catch (e) {
        console.warn("[/api/bids/:id/docs-zip] skipping doc", doc?.url, e?.message);
      }
    }

    if (!appended) {
      archive.append(Buffer.from("No documents available"), { name: "readme.txt" });
    }

    await archive.finalize();
  } catch (e) {
    console.error("[/api/bids/:id/docs-zip]", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "server_error" });
    } else {
      res.end();
    }
  }
});

router.get("/:id/details", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const details = await loadBidDetails(bidId);
    if (!details) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json(details);
  } catch (e) {
    console.error("[/api/bids/:id/details:get]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/:id/intake", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const details = await loadBidDetails(bidId);
    if (!details) {
      return res.status(404).json({ error: "not_found" });
    }
    const onboarding = ensurePlainObject(details.onboarding);
    const intake = {
      customer_name: onboarding.customer_name ?? onboarding.homeowner ?? details.homeowner ?? null,
      customer_phone: onboarding.customer_phone ?? onboarding.phone ?? details.customer_phone ?? null,
      customer_email: onboarding.customer_email ?? details.customer_email ?? null,
      home_address: onboarding.home_address ?? onboarding.address ?? details.home_address ?? null,
      order_number: onboarding.order_number ?? onboarding.order_no ?? details.order_number ?? null,
      notes: onboarding.notes ?? details.notes ?? null,
    };
    const combined = { ...onboarding, ...intake, raw: onboarding };
    res.json(combined);
  } catch (e) {
    console.error("[/api/bids/:id/intake]", e);
    res.status(500).json({ error: "server_error" });
  }
});

// Save intake fields (enforce homeowner name/phone; persist lot_plan in onboarding)
router.post("/:id/intake", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) return res.status(400).json({ error: "invalid_bid_id" });

  const body = req.body || {};
  const homeownerName = (body.homeowner_name ?? body.homeowner ?? "").toString().trim();
  const homeownerPhone = (body.homeowner_phone ?? body.phone ?? "").toString().trim();
  const lotPlan = (body.lot_plan ?? body.lotPlan ?? "").toString();

  if (!homeownerName || !homeownerPhone) {
    return res.status(422).json({ error: "Homeowner name and phone are required." });
  }

  try {
    await pool.query(
      `UPDATE public.bids
         SET onboarding = COALESCE(onboarding, '{}'::jsonb)
                           || jsonb_build_object('homeowner', $1, 'homeowner_phone', $2)
                           || CASE WHEN $3 = '' THEN '{}'::jsonb ELSE jsonb_build_object('lot_plan', $3) END,
             updated_at = now()
       WHERE id = $4`,
      [homeownerName, homeownerPhone, lotPlan, bidId]
    );
    const details = await loadBidDetails(bidId);
    return res.json({ ok: true, details });
  } catch (e) {
    console.error("[/api/bids/:id/intake:post]", e);
    return res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id/details", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  const body = req.body || {};
  const fields = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(body, "onboarding")) {
    params.push(JSON.stringify(ensurePlainObject(body.onboarding)));
    fields.push(`onboarding = $${params.length}::jsonb`);
  }
  if (Object.prototype.hasOwnProperty.call(body, "doc_links")) {
    params.push(JSON.stringify(ensureArray(body.doc_links)));
    fields.push(`doc_links = $${params.length}::jsonb`);
  }
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    params.push(body.notes ?? null);
    fields.push(`notes = $${params.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, "sales_person") || Object.prototype.hasOwnProperty.call(body, "salesman")) {
    params.push(body.sales_person ?? body.salesman ?? null);
    fields.push(`sales_person = $${params.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, "customer_email")) {
    params.push(body.customer_email ?? null);
    fields.push(`customer_email = $${params.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, "calc_snapshot")) {
    params.push(JSON.stringify(ensurePlainObject(body.calc_snapshot)));
    fields.push(`calc_snapshot = $${params.length}::jsonb`);
  }

  if (!fields.length) {
    return res.status(400).json({ error: "no_changes" });
  }

  fields.push("updated_at = now()");
  params.push(bidId);

  try {
    const sql = `UPDATE public.bids SET ${fields.join(", ")} WHERE id = $${params.length}`;
    const result = await pool.query(sql, params);
    if (!result.rowCount) {
      return res.status(404).json({ error: "not_found" });
    }
    const updated = await loadBidDetails(bidId);
    res.json(updated);
  } catch (e) {
    console.error("[/api/bids/:id/details:patch]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/:id/model", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const model = await loadBidModel(bidId);
    if (!model) {
      return res.json({ columns: [], lines: [], cards_count: 0, units_count: 0 });
    }
    slog("MODEL", { bidId, cols: model.columns?.length || 0, lines: model.lines?.length || 0 });
    res.json({
      columns: model.columns,
      lines: model.lines,
      cards_count: model.cards_count,
      units_count: model.units_count,
      projectSnapshot: model.projectSnapshot,
    });
  } catch (e) {
    console.error("[/api/bids/:id/model]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/:id/preview", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const model = await loadBidModel(bidId);
    if (!model) return res.json([]);
    const preview = [];
    const lines = Array.isArray(model.lines) ? model.lines : [];
    for (const column of model.columns) {
      const rawColumnId = column?.column_id;
      const columnId = Number.isFinite(Number(rawColumnId)) ? Number(rawColumnId) : null;
      const units = toNumberOrZero(column?.units);
      const scopedLines = lines.filter((line) => {
        const lineColumnId = Number.isFinite(Number(line?.column_id)) ? Number(line.column_id) : null;
        if (lineColumnId === null) return true;
        if (columnId === null) return false;
        return lineColumnId === columnId;
      });

      for (const line of scopedLines) {
        const qtyTotal = toNumberOrZero(line?.qty_per_unit) * units;
        const lineTotal = toNumberOrZero(line?.unit_price) * qtyTotal;
        preview.push({
          line_id: line?.line_id,
          column_id: columnId,
          qty_total: qtyTotal,
          line_total: lineTotal,
          units,
        });
      }
    }
    slog("PREVIEW", {
      bidId,
      columns: model.columns?.length || 0,
      lines: lines.length,
      preview_rows: preview.length,
    });
    res.json(preview);
  } catch (e) {
    console.error("[/api/bids/:id/preview]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.get("/:id/totals", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }
  try {
    const totals = await loadBidTotals(bidId);
    if (!totals) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json(totals);
  } catch (e) {
    if (e?.code === "42P01") {
      console.error("[/api/bids/:id/totals] table missing bid_grand_totals");
      return res.status(500).json({ error: "table_missing" });
    }
    console.error("[/api/bids/:id/totals:get]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/:id/totals", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "invalid_bid_id" });
  }

  const body = req.body || {};
  const snapshot = {
    subtotal_after_discount: toNumberOrZero(body.subtotal_after_discount),
    subtotal_after: toNumberOrZero(body.subtotal_after ?? body.subtotal_after_discount),
    tax_rate: toNumberOrZero(body.tax_rate ?? body.tax_rate_pct),
    tax_amount: toNumberOrZero(body.tax_amount),
    cc_fee_pct: toNumberOrZero(body.cc_fee_pct),
    cc_fee: toNumberOrZero(body.cc_fee ?? body.cc_fee_amount),
    total: toNumberOrZero(body.total),
    deposit_pct: toNumberOrZero(body.deposit_pct),
    deposit_amount: toNumberOrZero(body.deposit_amount),
    remaining_amount: toNumberOrZero(body.remaining_amount),
    cc_fee_amount: toNumberOrZero(body.cc_fee_amount ?? body.cc_fee),
  };

  try {
    await pool.query(
      `INSERT INTO public.bid_grand_totals
         (bid_id, subtotal_after_discount, tax_rate, tax_amount, cc_fee_pct, cc_fee, total,
          deposit_pct, deposit_amount, remaining_amount, updated_at, subtotal_after, cc_fee_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), $11, $12)
       ON CONFLICT (bid_id)
       DO UPDATE SET subtotal_after_discount = EXCLUDED.subtotal_after_discount,
                     tax_rate = EXCLUDED.tax_rate,
                     tax_amount = EXCLUDED.tax_amount,
                     cc_fee_pct = EXCLUDED.cc_fee_pct,
                     cc_fee = EXCLUDED.cc_fee,
                     total = EXCLUDED.total,
                     deposit_pct = EXCLUDED.deposit_pct,
                     deposit_amount = EXCLUDED.deposit_amount,
                     remaining_amount = EXCLUDED.remaining_amount,
                     updated_at = now(),
                     subtotal_after = EXCLUDED.subtotal_after,
                     cc_fee_amount = EXCLUDED.cc_fee_amount`,
      [
        bidId,
        snapshot.subtotal_after_discount,
        snapshot.tax_rate,
        snapshot.tax_amount,
        snapshot.cc_fee_pct,
        snapshot.cc_fee,
        snapshot.total,
        snapshot.deposit_pct,
        snapshot.deposit_amount,
        snapshot.remaining_amount,
        snapshot.subtotal_after,
        snapshot.cc_fee_amount,
      ]
    );

    await pool.query(
      `UPDATE public.bids
          SET subtotal_after_discount = $2,
              tax_rate = $3,
              tax_amount = $4,
              cc_fee_pct = $5,
              cc_fee_amount = $6,
              total = $7,
              total_amount = $7,
              deposit_pct = $8,
              deposit_amount = $9,
              remaining_balance = $10,
              updated_at = now()
        WHERE id = $1`,
      [
        bidId,
        snapshot.subtotal_after_discount,
        snapshot.tax_rate,
        snapshot.tax_amount,
        snapshot.cc_fee_pct,
        snapshot.cc_fee_amount,
        snapshot.total,
        snapshot.deposit_pct,
        snapshot.deposit_amount,
        snapshot.remaining_amount,
      ]
    );

    const totals = await loadBidTotals(bidId);
    res.json(totals);
  } catch (e) {
    if (e?.code === "42P01") {
      console.error("[/api/bids/:id/totals:post] bid_grand_totals missing");
      return res.status(500).json({ error: "table_missing" });
    }
    console.error("[/api/bids/:id/totals:post]", e);
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/bids/:id/summary
router.get("/:id/summary", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) {
    return res.status(400).json({ error: "bad-id" });
  }

  try {
    const details = await loadBidDetails(bidId);
    if (!details) {
      return res.status(404).json({ error: "not-found" });
    }

    const totals = await loadBidTotals(bidId);
    const model = await loadBidModel(bidId);

    const info = {
      id: details.id,
      status: details.status || "draft",
      customer_name: details.homeowner || details.customer_name || null,
      customer_email: details.customer_email || null,
      project_name: details.projectSnapshot?.project_name || details.projectSnapshot?.name || details.name || null,
      builder: details.onboarding?.builder || null,
      home_address: details.home_address || null,
      lot_plan_name: details.onboarding?.lot_plan_name || null,
      sales_person: details.sales_person || null,
      tax_rate: details.tax_rate ?? null,
      deposit_pct: details.deposit_pct ?? null
    };

    const outTotals = totals
      ? {
          subtotal:
            totals.subtotal ??
            totals.subtotal_after ??
            totals.subtotal_after_discount ??
            0,
          tax: totals.tax ?? totals.tax_amount ?? 0,
          total: totals.total ?? totals.total_amount ?? 0,
          deposit_pct: totals.deposit_pct ?? info.deposit_pct ?? 0,
          deposit_amount: totals.deposit_amount ?? 0,
          remaining: totals.remaining ?? totals.remaining_amount ?? 0,
          tax_rate: totals.tax_rate ?? info.tax_rate ?? 0
        }
      : null;

    const outModel = model
      ? {
          cards_count: model.cards_count ?? 0,
          units_count: model.units_count ?? 0
        }
      : { cards_count: 0, units_count: 0 };

    res.json({ ok: true, info, totals: outTotals, model: outModel });
  } catch (err) {
    console.error("[/api/bids/:id/summary]", err);
    res.status(500).json({ error: "server_error" });
  }
});

// Manufacturer lead-time management (admin/purchasing)
router.get("/lead-times", requireAuth, requireAdminOrPurchasing, async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT manufacturer, base_days, avg_90d_days, notes, updated_at
        FROM public.manufacturer_lead_times
       ORDER BY manufacturer ASC
    `);
    res.json(rows);
  } catch (e) {
    if (e?.code === "42P01") {
      // Table missing; return empty list but surface log.
      console.warn("[lead-times] manufacturer_lead_times table missing");
      return res.json([]);
    }
    console.error("[/api/bids/lead-times:get]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/lead-times", requireAuth, requireAdminOrPurchasing, async (req, res) => {
  try {
    const body = req.body || {};
    const manufacturer = String(body.manufacturer || "").trim();
    if (!manufacturer) {
      return res.status(400).json({ error: "missing_manufacturer" });
    }
    const baseDays = Number.isFinite(Number(body.base_days)) ? Number(body.base_days) : 14;
    if (baseDays <= 0) {
      return res.status(400).json({ error: "invalid_base_days" });
    }
    const avgRaw = body.avg_90d_days;
    const avg90 = avgRaw === "" || avgRaw === null || avgRaw === undefined ? null : Number(avgRaw);
    if (avg90 !== null && !Number.isFinite(avg90)) {
      return res.status(400).json({ error: "invalid_avg_90d" });
    }
    const notes = body.notes ? String(body.notes).trim() : null;

    const { rows } = await pool.query(
      `INSERT INTO public.manufacturer_lead_times (manufacturer, base_days, avg_90d_days, notes, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (manufacturer)
       DO UPDATE SET base_days = EXCLUDED.base_days,
                     avg_90d_days = EXCLUDED.avg_90d_days,
                     notes = EXCLUDED.notes,
                     updated_at = now()
       RETURNING manufacturer, base_days, avg_90d_days, notes, updated_at`,
      [manufacturer, baseDays, avg90, notes]
    );
    res.status(200).json(rows[0]);
  } catch (e) {
    if (e?.code === "42P01") {
      console.warn("[/api/bids/lead-times:post] manufacturer_lead_times table missing");
      return res.status(500).json({ error: "table_missing" });
    }
    console.error("[/api/bids/lead-times:post]", e);
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/lead-times/:manufacturer", requireAuth, requireAdminOrPurchasing, async (req, res) => {
  try {
    const manufacturer = String(req.params.manufacturer || "").trim();
    if (!manufacturer) return res.status(400).json({ error: "missing_manufacturer" });
    const result = await pool.query(
      `DELETE FROM public.manufacturer_lead_times WHERE manufacturer ILIKE $1`,
      [manufacturer]
    );
    res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    if (e?.code === "42P01") {
      console.warn("[/api/bids/lead-times:delete] manufacturer_lead_times table missing");
      return res.json({ ok: true, deleted: 0 });
    }
    console.error("[/api/bids/lead-times:delete]", e);
    res.status(500).json({ error: "server_error" });
  }
});

// =============== COLUMN / LINE MANAGEMENT ===============

// POST /api/bids/:id/columns  → create new column
router.post("/:id/columns", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) return res.status(400).json({ error: "invalid_bid_id" });

  try {
    const { label, room = null, unit_type = null, color = null, units = 0, sort_order = 0, notes = null } = req.body || {};

    const { rows } = await pool.query(
      `INSERT INTO public.bid_columns (bid_id, label, room, unit_type, color, units, sort_order, notes, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       RETURNING id, bid_id, label, units, sort_order`,
      [bidId, label || "Column", room, unit_type, color, units, sort_order, notes]
    );

    res.json(rows[0]);
  } catch (e) {
    console.error("[POST /api/bids/:id/columns]", e);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/bids/columns/:columnId  → remove column + linked rows
router.delete("/columns/:columnId", requireAuth, async (req, res) => {
  const columnId = Number(req.params.columnId);
  if (!Number.isFinite(columnId)) return res.status(400).json({ error: "invalid_column_id" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // remove dependent rows first (ignore if tables missing)
    await client.query(`DELETE FROM public.bid_column_details WHERE column_id=$1`, [columnId]).catch(() => {});
    await client.query(`DELETE FROM public.bid_documents WHERE column_id=$1`, [columnId]).catch(() => {});
    await client.query(`DELETE FROM public.bid_line_cells WHERE bid_column_id=$1`, [columnId]).catch(() => {});
    await client.query(`DELETE FROM public.bid_lines WHERE bid_column_id=$1`, [columnId]).catch(() => {});
    const del = await client.query(`DELETE FROM public.bid_columns WHERE id=$1`, [columnId]);
    await client.query("COMMIT");
    res.json({ ok: true, deleted: del.rowCount });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[DELETE /api/bids/columns/:columnId]", e);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
});

// DELETE /api/bids/lines/:lineId  → remove individual line
router.delete("/lines/:lineId", requireAuth, async (req, res) => {
  const lineId = Number(req.params.lineId);
  if (!Number.isFinite(lineId)) return res.status(400).json({ error: "invalid_line_id" });
  try {
    const del = await pool.query(`DELETE FROM public.bid_lines WHERE id=$1`, [lineId]);
    res.json({ ok: true, deleted: del.rowCount });
  } catch (e) {
    console.error("[DELETE /api/bids/lines/:lineId]", e);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/bids/:id/reset-columns  → clear columns and dependents atomically
router.post("/:id/reset-columns", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) return res.status(400).json({ error: "invalid_bid_id" });
  try {
    await withTx(async (client) => {
      const exec = async (sql, params = []) => {
        await client.query('SAVEPOINT sp');
        try {
          await client.query(sql, params);
          await client.query('RELEASE SAVEPOINT sp');
        } catch (err) {
          if (err?.code === '42P01' || err?.code === '42703') {
            // missing table/column: rollback this statement only and continue
            await client.query('ROLLBACK TO SAVEPOINT sp');
            return;
          }
          await client.query('ROLLBACK TO SAVEPOINT sp');
          console.error('[reset-columns] root SQL error', err);
          throw err; // abort whole tx
        }
      };
      await exec(`DELETE FROM public.bid_line_cells WHERE bid_id = $1`, [bidId]);
      await exec(`DELETE FROM public.bid_column_details WHERE bid_id = $1`, [bidId]);
      await exec(`DELETE FROM public.bid_documents WHERE bid_id = $1 AND column_id IS NOT NULL`, [bidId]);
      await exec(`DELETE FROM public.bid_lines WHERE bid_id = $1`, [bidId]);
      await exec(`DELETE FROM public.bid_columns WHERE bid_id = $1`, [bidId]);
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("[/api/bids/:id/reset-columns] error", e);
    res.status(500).json({ error: "server_error", detail: e?.message });
  }
});

// CREATE a line: POST /api/bids/:id/lines
router.post("/:id/lines", requireAuth, async (req, res) => {
  const bidId = Number(req.params.id);
  if (!Number.isFinite(bidId)) return res.status(400).json({ error: "invalid_bid_id" });

  try {
    const b = req.body || {};
    const description = (b.description ?? "").toString();
    const category = b.category ?? null;
    const unit_of_measure = b.unit_of_measure ?? "ea";
    const qty_per_unit = Number(b.qty_per_unit ?? 0);
    const unit_cost = Number.isFinite(+b.unit_cost) ? +b.unit_cost : null;
    const unit_price = Number(b.unit_price ?? 0);
    const pricing_method = b.pricing_method ?? "fixed";
    const sort_order = Number.isFinite(+b.sort_order) ? +b.sort_order : 0;
    const bid_column_id = Number.isFinite(+b.bid_column_id) ? +b.bid_column_id : null;

    const columns = await getTableColumns("bid_lines");

    const fields = [];
    const placeholders = [];
    const values = [];

    const push = (name, value, { force = false, raw = false } = {}) => {
      const hasColumn = columns.includes(name);
      if (!force && !hasColumn) return;
      fields.push(name);
      if (raw) {
        placeholders.push(value);
        return;
      }
      values.push(value);
      placeholders.push(`$${values.length}`);
    };

    push("bid_id", bidId, { force: true });
    push("description", description);
    push("category", category);
    push("unit_of_measure", unit_of_measure);
    push("qty_per_unit", qty_per_unit);
    push("unit_cost", unit_cost);
    push("unit_price", unit_price);
    push("pricing_method", pricing_method);
    push("sort_order", sort_order);
    push("bid_column_id", bid_column_id);
    if (columns.includes("updated_at")) push("updated_at", "now()", { raw: true });
    if (columns.includes("created_at")) push("created_at", "now()", { raw: true });

    const returning = ["id", "bid_id"];
    [
      "description",
      "category",
      "unit_of_measure",
      "qty_per_unit",
      "unit_cost",
      "unit_price",
      "pricing_method",
      "sort_order",
      "bid_column_id",
    ].forEach((name) => {
      if (columns.includes(name)) returning.push(name);
    });

    const sql = `INSERT INTO public.bid_lines (${fields.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING ${returning.join(", ")}`;
    const { rows } = await pool.query(sql, values);
    const result = rows[0];
    slog("LINE INSERT", { bidId, in: b, out: result });
    res.json(result);
  } catch (e) {
    console.error("[POST /api/bids/:id/lines] error", e);
    res.status(500).json({ error: "server_error", detail: e?.message });
  }
});

export default router;