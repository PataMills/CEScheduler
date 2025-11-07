import { Router } from "express";
import pool from "../db.js";

const router = Router();
const allow = (_req, _res, next) => next(); // TODO: swap to your real auth guard

router.post("/api/po/submit", allow, async (req, res) => {
  const { bidId } = req.body || {};
  if (!bidId) return res.status(400).json({ error: "missing_bidId" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: [bid] } = await client.query(
      `SELECT id, job_id, name, promised_install_date::date AS promised_date
         FROM public.bids
        WHERE id = $1`,
      [bidId]
    );
    if (!bid) throw new Error("bid_not_found");

    // Create a stub PO with vendor TBD
    const { rows: [po] } = await client.query(
      `INSERT INTO public.purchase_orders (job_id, vendor, status, created_by, meta)
       VALUES ($1, $2, 'draft', $3, $4)
       RETURNING id, status`,
      [bid.job_id || null, 'TBD', 'system', { source: 'sales_review', bid_id: bid.id }]
    );

    // Optional: queue reminder ~14 days pre-install
    if (bid.promised_date) {
      const needed = new Date(bid.promised_date.valueOf() - 14 * 24 * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO public.purchase_queue (job_id, item_name, spec, needed_by, vendor, status, org_id)
         VALUES ($1, $2, $3, $4, $5, 'pending', NULL)`,
        [bid.job_id || null, "Order verification", { bid_id: bid.id }, needed, "TBD"]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, po_id: po.id, status: po.status });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[/api/po/submit]", e);
    res.status(500).json({ error: e.message || "server_error" });
  } finally {
    client.release();
  }
});

export default function registerPurchasing(app) {
  app.use(router);
}