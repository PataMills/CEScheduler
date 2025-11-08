import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "./auth.js";

const router = Router();
const allow = (_req, _res, next) => next(); // TODO: swap to your real auth guard

const DETAILS_SQL = `
  SELECT id, job_id, builder_id, name, status, notes,
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

function mapTotalsRow(row, source) {
  if (!row) return null;
  const subtotalAfter = toNumberOrNull(row.subtotal_after ?? row.subtotal_after_discount);
  const ccFeeAmount = toNumberOrNull(row.cc_fee_amount ?? row.cc_fee);
  return {
    bid_id: row.bid_id ?? row.id ?? null,
    subtotal_after_discount: toNumberOrNull(row.subtotal_after_discount ?? row.subtotal_after ?? subtotalAfter),
    subtotal_after: subtotalAfter,
    tax_rate: toNumberOrNull(row.tax_rate ?? row.tax_rate_pct),
    tax_amount: toNumberOrNull(row.tax_amount),
    cc_fee_pct: toNumberOrNull(row.cc_fee_pct),
    cc_fee: toNumberOrNull(row.cc_fee ?? ccFeeAmount),
    cc_fee_amount: ccFeeAmount,
    total: toNumberOrNull(row.total ?? row.total_amount),
    deposit_pct: toNumberOrNull(row.deposit_pct),
    deposit_amount: toNumberOrNull(row.deposit_amount),
    remaining_amount: toNumberOrNull(row.remaining_amount ?? row.remaining_balance),
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
  const orderNo = onboarding.order_number ?? onboarding.order_no ?? null;

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
  const { rows } = await pool.query(TOTALS_SQL, [bidId]);
  if (rows.length) {
    return mapTotalsRow(rows[0], "grand_totals");
  }
  const fallback = await pool.query(
    `SELECT id AS bid_id, subtotal_after_discount, tax_rate, tax_rate_pct,
            tax_amount, cc_fee_pct, cc_fee_amount, total, total_amount, deposit_pct,
            deposit_amount, remaining_balance
       FROM public.bids WHERE id = $1`,
    [bidId]
  );
  if (!fallback.rows.length) return null;
  const shaped = mapTotalsRow(fallback.rows[0], "bids");
  return shaped;
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

// Basic columns for a bid
router.get("/:id/columns", allow, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, bid_id, label, room, unit_type, color, units, sort_order
         FROM public.bid_columns
        WHERE bid_id = $1
        ORDER BY sort_order, id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error("[/api/bids/:id/columns]", e);
    res.status(500).json({ error: "server_error" });
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

// Bid-level documents for Review page
router.get("/:id/documents", allow, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, bid_id, kind, name, url, uploaded_at
         FROM public.bid_documents
        WHERE bid_id = $1
        ORDER BY uploaded_at DESC, id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error("[/api/bids/:id/documents]", e);
    res.status(500).json({ error: "server_error" });
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

export default router;