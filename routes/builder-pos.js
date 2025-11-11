import express from 'express';
import pool from '../db.js';
import autoSchedule from '../services/autoSchedule.js';

const router = express.Router();

// Ingest a builder-issued PO and create/update a bid, then auto-schedule an install task
// POST /api/builder-pos/ingest
// Body: { builder_id, contract_id, po_number, lots:[], items:[] }
router.post('/ingest', async (req, res) => {
  const { builder_id = null, contract_id = null, po_number, lots = [], items = [] } = req.body || {};
  if (!po_number) return res.status(400).json({ error: 'missing_po_number' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for existing bid by PO number
    const existing = await client.query(
      'SELECT id FROM public.bids WHERE po_number = $1 LIMIT 1',
      [po_number]
    ).catch(() => ({ rows: [] }));

    let bidId;
    if (existing.rows && existing.rows.length) {
      bidId = existing.rows[0].id;
      await client.query(
        `UPDATE public.bids
            SET po_received_at = now(),
                stage = $2,
                updated_at = now()
          WHERE id = $1`,
        [bidId, 'accepted']
      ).catch(() => {});
    } else {
      // Insert a new bid row with basic PO metadata; tolerate schema drift
      const ins = await client.query(
        `INSERT INTO public.bids (builder_id, contract_id, po_number, is_contract, stage, created_at, updated_at)
         VALUES ($1, $2, $3, TRUE, 'accepted', now(), now())
         RETURNING id`,
        [builder_id, contract_id, po_number]
      ).catch(async (e) => {
        // Fallback for minimal schema (no is_contract/contract_id)
        if (String(e?.message || '').includes('does not exist')) {
          const alt = await client.query(
            `INSERT INTO public.bids (builder_id, po_number, stage, created_at, updated_at)
             VALUES ($1, $2, 'accepted', now(), now()) RETURNING id`,
            [builder_id, po_number]
          );
          return alt;
        }
        throw e;
      });
      bidId = ins.rows[0].id;
    }

    await client.query('COMMIT');

    // Fire-and-forget auto-schedule for this bid
    const task = await autoSchedule(bidId).catch((e) => {
      console.warn('[builder-pos] autoSchedule failed:', e?.message || e);
      return null;
    });

    res.json({ ok: true, bidId, task, lots_count: Array.isArray(lots) ? lots.length : 0, items_count: Array.isArray(items) ? items.length : 0 });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[builder-pos] ingest error:', err);
    res.status(500).json({ error: err.message || String(err) });
  } finally {
    client.release();
  }
});

export default router;
