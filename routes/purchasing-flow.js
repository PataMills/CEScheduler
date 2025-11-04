// routes/purchasing-flow.js
import express from "express";
import { pool } from "../db.js";         // adjust import to your project
import { requireRoleApi } from "./auth.js"; // same pattern as requireRolePage
const router = express.Router();

// --- tiny helpers ------------------------------------------------------------
async function aiQCCheck(bidId) {
  // Stub: replace with real AI calls. Return {ok:true} or {ok:false, issues:[...]}
  // Pull any data you need: column details, hardware, render links, etc.
  const { rows } = await pool.query(
    `SELECT b.id, b.name, b.onboarding, b.doc_links,
            COALESCE(bcd.hardware, '[]'::jsonb) AS hardware,
            COALESCE(bcd.meta, '{}'::jsonb)     AS meta
       FROM bids b
       LEFT JOIN bid_column_details bcd ON bcd.bid_id = b.id
      WHERE b.id=$1`, [bidId]
  );
  if (!rows.length) return { ok:false, issues:["Bid not found"] };

  // Example rule-of-thumb checks (you'll replace with your model/agent):
  const itemList = Array.isArray(rows[0].hardware) ? rows[0].hardware : [];
  const issues = [];
  const hasPulls = itemList.some(h => /pull|handle|knob/i.test(h?.description||""));
  if (!hasPulls) issues.push("No handles/knobs found on order form.");
  // Add more: toe kick/scribe/OCM/fillers/crown; quantities vs units; colors vs layout …

  return { ok: issues.length === 0, issues, data: rows[0] };
}

function bucketizePOs(hardwareJson) {
  // Group by vendor/brand/color/category for split POs
  const items = Array.isArray(hardwareJson) ? hardwareJson : [];
  const buckets = new Map();
  for (const i of items) {
    const key = [
      (i.vendor || i.manufacturer || "").trim().toLowerCase(),
      (i.brand || "").trim().toLowerCase(),
      (i.color || "").trim().toLowerCase(),
      (i.category || "").trim().toLowerCase()
    ].join("|");
    if (!buckets.has(key)) buckets.set(key, { vendor: i.vendor || i.manufacturer || "Vendor", brand: i.brand || null, category: i.category || null, color: i.color || null, items: [] });
    buckets.get(key).items.push(i);
  }
  return [...buckets.values()].filter(b => b.items.length);
}

async function postSlack(msg) {
  // Optional: wire to your Slack webhook / bot
  try {
    console.log("[SLACK]", msg);
  } catch (e) {
    console.warn("Slack notify failed", e.message);
  }
}

// --- main endpoint -----------------------------------------------------------
router.post("/api/bids/:id/purchasing/review-submit", requireRoleApi(["admin","purchasing"]), express.json(), async (req, res) => {
  const bidId = Number(req.params.id);
  if (!bidId) return res.status(400).json({ error: "bad_request" });

  try {
    // 1) AI QC
    const qc = await aiQCCheck(bidId);
    await pool.query(
      `INSERT INTO bid_events(bid_id, event_type, meta) VALUES ($1,$2,$3)`,
      [bidId, qc.ok ? "qc_pass" : "qc_issues", qc.ok ? {note:"QC passed"} : {issues: qc.issues}]
    );
    if (!qc.ok) {
      // return issues to UI for 1.5 back-and-forth
      return res.json({ status: "needs_fix", issues: qc.issues });
    }

    // 2) Build POs from hardware/meta and create records
    // Load bid->job
    const bidRow = await pool.query(`SELECT job_id, sales_person, promised_install_date FROM bids WHERE id=$1`, [bidId]);
    if (!bidRow.rows.length) return res.status(404).json({ error:"bid_not_found" });
    const jobId = bidRow.rows[0].job_id;

    // Pull hardware list (already fetched above in aiQCCheck)
    const hw = qc.data?.hardware || [];
    const buckets = bucketizePOs(hw);
    const createdPOs = [];

    for (const b of buckets) {
      // create PO header
      const po = await pool.query(
        `INSERT INTO purchase_orders(job_id, vendor, brand, category, status, expected_date, meta)
           VALUES ($1,$2,$3,$4,'pending',
                   (SELECT CASE WHEN EXISTS (SELECT 1 FROM manufacturer_lead_times m WHERE m.manufacturer ILIKE $2) 
                                THEN CURRENT_DATE + (SELECT base_days FROM manufacturer_lead_times WHERE manufacturer ILIKE $2 LIMIT 1)
                                ELSE NULL END),
                   $5)
           RETURNING *`,
        [jobId, b.vendor, b.brand, b.category, { color: b.color }]
      );
      const poId = po.rows[0].id;

      // create items
      for (const item of b.items) {
        await pool.query(
          `INSERT INTO purchase_order_items(po_id, sku, description, unit, qty_required, qty_ordered, source)
             VALUES ($1,$2,$3,$4,COALESCE($5,0),COALESCE($6,0),$7)`,
          [poId, item.sku || null, item.description || item.label || "Item", item.unit || "ea",
           Number(item.qty || item.quantity || 0), 0,
           item] // store original json in source
        );
      }
      createdPOs.push(po.rows[0]);
    }

    // 3) Mark bid worklist status → po_sent + timestamp
    await pool.query(
      `UPDATE bids SET purchasing_status='po_sent', po_sent_at=now() WHERE id=$1`,
      [bidId]
    );

    // 4) Notify Purchasing w/ quick summary (and link to dashboard)
    await postSlack(`✅ QC passed for Bid #${bidId}. Created ${createdPOs.length} POs. Review in /purchasing-dashboard.`);

    res.json({ status: "ok", created_pos: createdPOs.length, po_ids: createdPOs.map(p=>p.id) });
  } catch (e) {
    console.error("[review-submit]", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
