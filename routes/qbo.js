// routes/qbo.js
import express from 'express';
import crypto from 'crypto';
import { ensureDepositItemId, qbFetch } from '../services/qbo.js';
import { pool } from '../db.js';

export default function registerQboRoutes(app) {
  const router = express.Router();

  // TEMP check: verify we can resolve Deposit item Id
  router.get('/check', async (_req, res) => {
    try {
      const id = await ensureDepositItemId();
      res.json({ ok: true, depositItemId: id });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  // Webhook must receive RAW body to verify signature
  app.use('/qbo/webhook', express.raw({ type: '*/*' }));
  app.post('/qbo/webhook', async (req, res) => {
    try {
      const sig = req.header('intuit-signature');
      const key = process.env.QBO_CLIENT_SECRET || '';
      if (!sig || !key) return res.sendStatus(401);
      const mac = crypto.createHmac('sha256', key).update(req.body).digest('base64');
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac))) {
        return res.sendStatus(401);
      }

      const payload = JSON.parse(req.body.toString('utf8'));
      for (const n of payload.eventNotifications || []) {
        for (const e of n.dataChangeEvent?.entities || []) {
          const { name, id, operation } = e; // Payment|Invoice
          if ((name === 'Payment' && (operation === 'Create' || operation === 'Update')) ||
              (name === 'Invoice' && operation === 'Update')) {
            try {
              const realm = process.env.QBO_REALM_ID;
              const invRes = await qbFetch(`/v3/company/${encodeURIComponent(realm)}/invoice/${id}?minorversion=75`);
              const inv = invRes?.Invoice;
              if (!inv) continue;

              // Extract Bid # from PrivateNote
              const m = String(inv.PrivateNote || '').match(/Bid\s+#(\d+)/i);
              const bidId = m ? Number(m[1]) : null;
              if (!bidId) continue;

              const balance = Number(inv.Balance || 0);
              if (balance === 0) {
                // mark deposit received (first time only)
                await pool.query(
                  `UPDATE bids SET deposit_received_at = COALESCE(deposit_received_at, now())
                   WHERE id = $1`,
                  [bidId]
                );
              }
            } catch (err) {
              console.error('QBO webhook handler error:', err?.message || err);
            }
          }
        }
      }
      res.sendStatus(200);
    } catch (err) {
      console.error('QBO webhook error:', err?.message || err);
      res.sendStatus(200);
    }
  });

  app.use('/qbo', router);
}
