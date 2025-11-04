// routes/invitations.js
import express from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import bcryptjs from 'bcryptjs';
import { pool } from '../db.js';
import { PUBLIC_BASE_URL } from '../slack.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Parse cookies and verify JWT for all routes
router.use(cookieParser());
router.use((req, res, next) => {
  const token = req.cookies?.ce_jwt;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {}
  }
  next();
});

// Admin middleware
function requireAdmin(req, res, next) {
  if (String(process.env.INVITE_DEV_ALLOW || '') === '1') return next();
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'forbidden' });
}

// --- simple mailer: uses SMTP env vars if available; falls back to console
let _mailer = null;
async function getMailer() {
  if (_mailer !== null) return _mailer;
  try {
    const nodemailer = (await import('nodemailer')).default;
    if (process.env.SMTP_HOST) {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: !!Number(process.env.SMTP_SECURE || 0),
        auth: process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      _mailer = {
        async send(to, subject, html) {
          await transport.sendMail({
            from: process.env.SMTP_FROM || 'no-reply@cabinetsexpress.local',
            to, subject, html,
          });
        }
      };
    } else {
      _mailer = {
        async send(to, subject, html) {
          console.log('[INVITE EMAIL]', { to, subject, html });
        }
      };
    }
  } catch (e) {
    console.error('[MAIL INIT ERR]', e);
    _mailer = { async send(to, subject, html) { console.log('[INVITE EMAIL]', { to, subject, html }); } };
  }
  return _mailer;
}

// Allowed roles must match app-wide role set
const ALLOWED_ROLES = ['admin','sales','installer','service','manufacturing','assembly','delivery'];

// Ensure schema on startup
async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.organizations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.invitations (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        token TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        org_id INTEGER NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
        created_by INTEGER NULL,
        status TEXT DEFAULT 'pending',
        used_at TIMESTAMPTZ NULL,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'employee';`);
    await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS org_id INTEGER NULL REFERENCES public.organizations(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';`);
    await client.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[INVITES ensureSchema ERR]', e);
  } finally {
    client.release();
  }
}

// Run schema setup immediately (skip during test)
if (process.env.NODE_ENV !== 'test') {
  await ensureSchema();
}

// GET admin list of invites - matches actual schema
router.get('/', requireAdmin, async (req, res) => {
  try {
    const org_id = req.user?.org_id || null;
    const r = await pool.query(
      `SELECT id, email, role, expires_at, used_at, created_at, status
         FROM public.invitations
        WHERE (org_id = $1 OR (org_id IS NULL AND $1 IS NULL))
        ORDER BY created_at DESC
        LIMIT 500`,
      [org_id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[INVITES list ERR]', e);
    res.status(500).json({ error: 'db_error', detail: e.message || String(e) });
  }
});

// Alias for /pending (back-compat): GET /api/admin/invitations/pending
router.get('/pending', requireAdmin, async (req, res) => {
  try {
    const org_id = req.user?.org_id || null;
    const r = await pool.query(
      `SELECT id, email, role, expires_at, used_at, created_at, status
         FROM public.invitations
        WHERE (org_id = $1 OR (org_id IS NULL AND $1 IS NULL))
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 500`,
      [org_id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error('[INVITES list ERR]', e);
    res.status(500).json({ error: 'db_error', detail: e.message || String(e) });
  }
});

// GET invite by id for admin (copy link)
router.get('/:id', requireAdmin, async (req, res) => {
  const org_id = req.user?.org_id;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_id' });
  const q = await pool.query(`
    SELECT id, email, role, token, expires_at, used_at, created_at
      FROM public.invitations
     WHERE id=$1 AND (org_id=$2 OR (org_id IS NULL AND $2 IS NULL))
  `, [id, org_id]);
  if (!q.rowCount) return res.status(404).json({ error:'not_found' });
  res.json(q.rows[0]);
});

// POST create invitation - matches actual schema (token is NOT NULL, created_by is int)
router.post('/', requireAdmin, express.json(), async (req, res) => {
  try {
    const { email, role, expires_in_days = 14 } = req.body || {};
    if (!email || !role) return res.status(400).json({ error: 'missing_fields' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'invalid_role' });

    const org_id = req.user?.org_id || null;
    const creator_id = req.user?.uid || null;

    // Close out stale expired invites for this org/email
    await pool.query(`
      UPDATE public.invitations
         SET used_at = now(), status = 'expired'
       WHERE (org_id = $1 OR (org_id IS NULL AND $1 IS NULL))
         AND LOWER(email) = LOWER($2)
         AND used_at IS NULL
         AND (expires_at IS NOT NULL AND expires_at <= now())
    `, [org_id, email]);

    // Generate token
    const token = crypto.randomBytes(24).toString('hex');
    const token_hash = crypto.createHash('sha256').update(token).digest('hex');
    const expires_at = new Date(Date.now() + (Number(expires_in_days) || 14) * 86400 * 1000);

    // Insert (token is required, created_by is int)
    await pool.query(`
      INSERT INTO public.invitations (email, role, token, token_hash, org_id, created_by, expires_at, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
    `, [email.toLowerCase(), role, token, token_hash, org_id, creator_id, expires_at]);

    // Send email
    const link = `${PUBLIC_BASE_URL || 'http://localhost:3000'}/invite/${token}`;
    const subject = `You're invited to Cabinets Express`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif">
        <p>You have been invited to join with role <b>${role}</b>.</p>
        <p><a href="${link}">Click here to accept your invitation</a></p>
        <p>This link expires on ${expires_at.toISOString()}.</p>
      </div>`.trim();

    const mailer = await getMailer();
    await mailer.send(email, subject, html);

    res.json({ ok: true });
  } catch (e) {
    console.error('[INVITES create ERR]', e);
    if ((e.message || '').includes('invitations_org_email_open_idx') || (e.message || '').includes('duplicate key')) {
      return res.status(409).json({ error: 'open_invite_exists' });
    }
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

// POST accept invitation - use actual token column
router.post('/accept/:token', express.json(), async (req, res) => {
  try {
    const { name, password } = req.body || {};
    if (!name || !password) return res.status(400).json({ error: 'missing_fields' });

    const result = await pool.query(`
      SELECT id, email, role, org_id, used_at, expires_at
        FROM public.invitations
       WHERE token = $1
    `, [req.params.token]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'invite_not_found' });

    const invite = result.rows[0];
    if (invite.used_at) return res.status(400).json({ error: 'invite_already_used' });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'invite_expired' });
    }

    const password_hash = await bcryptjs.hash(password, 10);
    await pool.query(`
      INSERT INTO public.users (name, email, role, org_id, password_hash, status)
      VALUES ($1,$2,$3,$4,$5,'active')
    `, [name, invite.email, invite.role, invite.org_id, password_hash]);

    await pool.query(`
      UPDATE public.invitations
         SET used_at = now(), status = 'accepted'
       WHERE id = $1
    `, [invite.id]);

    res.json({ ok: true, email: invite.email });
  } catch (e) {
    console.error('[INVITES accept ERR]', e);
    res.status(500).json({ error: 'db_error', detail: e.message });
  }
});

// Revoke an open invite
router.post('/:id/revoke', requireAdmin, async (req, res) => {
  try {
    const org_id = req.user?.org_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });

    const upd = await pool.query(`
      UPDATE public.invitations
         SET used_at = now(), status = 'revoked'
       WHERE id=$1 AND (org_id=$2 OR (org_id IS NULL AND $2 IS NULL)) AND used_at IS NULL
      RETURNING id
    `, [id, org_id || null]);
    if (!upd.rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[INVITES revoke ERR]', e);
    res.status(500).json({ error: 'db_error' });
  }
});

// Resend invitation (extends expiry and sends new email)
router.post('/:id/resend', requireAdmin, async (req, res) => {
  try {
    const org_id = req.user?.org_id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });

    const invq = await pool.query(`
      SELECT * FROM public.invitations
       WHERE id=$1 AND (org_id=$2 OR (org_id IS NULL AND $2 IS NULL)) AND used_at IS NULL
    `, [id, org_id || null]);
    const inv = invq.rows[0];
    if (!inv) return res.status(404).json({ error: 'not_found' });

    // Extend expiry and generate new token
    const new_expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const newToken = crypto.randomBytes(24).toString('hex');
    const new_token_hash = crypto.createHash('sha256').update(newToken).digest('hex');
    
    await pool.query(`
      UPDATE public.invitations
         SET token=$1, token_hash=$2, expires_at=$3
       WHERE id=$4
    `, [newToken, new_token_hash, new_expires, id]);

    const link = `${PUBLIC_BASE_URL || 'http://localhost:3000'}/invite/${newToken}`;
    const subject = `You're invited to Cabinets Express`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif">
        <p>You have been invited to join with role <b>${inv.role}</b>.</p>
        <p><a href="${link}">Click here to accept your invitation</a></p>
        <p>This link expires on ${new_expires.toISOString()}.</p>
      </div>`.trim();

    const mailer = await getMailer();
    await mailer.send(inv.email, subject, html);

    res.json({ ok: true });
  } catch (e) {
    console.error('[INVITES resend ERR]', e);
    res.status(500).json({ error: 'db_error' });
  }
});

export default router;
