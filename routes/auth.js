// routes/auth.js
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { pool } from "../db.js";

const router = express.Router();

// --- ENV fallback (kept for safety; you can disable later) ---
const FALLBACK_EMAIL = process.env.AUTH_EMAIL || "";
const FALLBACK_HASH  = process.env.AUTH_HASH  || "";
const JWT_SECRET     = process.env.JWT_SECRET || "dev-secret";
const FORCE_SECURE   = !!Number(process.env.FORCE_SECURE_COOKIES || 0);

// helpers
// Choose landing page by role
function landingPathFor(user) {
  const role = (user?.role || '').toLowerCase();
  switch (role) {
    case 'service':
    case 'installer':
    case 'delivery':
      return '/myday-teams';
    case 'sales':
      return '/sales-home';
    case 'manufacturing':
    case 'assembly':
      return '/ops-dashboard';
    case 'admin':
      return '/admin';
    default:
      return '/';
  }
}
async function ensureCrewNameColumn() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS crew_name TEXT");
  } catch {
    // ignore; permissions or concurrent migration may already handle it
  }
}

async function findUserByEmail(email) {
  const q = `SELECT id, name, email, role, crew_name, org_id, password_hash, is_active, password_reset_required
           FROM users WHERE lower(email)=lower($1) LIMIT 1`;
  try {
    const { rows } = await pool.query(q, [email]);
    return rows[0] || null;
  } catch (e) {
    // Backward-compat: auto-add crew_name if missing
    if (e && e.code === '42703') {
      await ensureCrewNameColumn();
      const { rows } = await pool.query(q, [email]);
      return rows[0] || null;
    }
    throw e;
  }
}

function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("ce_jwt", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: FORCE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// API middleware (JSON 401)
export function requireAuth(req, res, next) {
  const token = req.cookies?.ce_jwt;
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

// Page middleware (redirects)
export function requireAuthPage(req, res, next) {
  const token = req.cookies?.ce_jwt;
  if (!token) return res.redirect("/login");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.redirect("/login");
  }
}

export function requireRolePage(allowedRoles = []) {
  return (req, res, next) => {
    const token = req.cookies?.ce_jwt;
    if (!token) return res.redirect("/login");
    try {
      const u = jwt.verify(token, JWT_SECRET);
      req.user = u;
      if (allowedRoles.length && !allowedRoles.includes(u.role)) {
        // simple 403 page
        return res
          .status(403)
          .type("html")
          .send(`<!doctype html><meta charset="utf-8">
<style>body{font-family:system-ui;background:#0b0c10;color:#eef2ff;display:grid;place-items:center;height:100vh}
.card{background:#111318;border:1px solid #212432;border-radius:12px;padding:24px;max-width:560px}
a{color:#9abaff}</style>
<div class="card">
  <h1>403 – Not allowed</h1>
  <p>Your account role (<b>${u.role}</b>) doesn’t have access to this page.</p>
  <p><a href="/sales-intake">Go to home</a> · <a href="/logout">Switch account</a></p>
</div>`);
      }
      next();
    } catch {
      return res.redirect("/login");
    }
  };
}

export function requireRoleApi(allowedRoles = []) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      const role = req.user?.role;
      if (allowedRoles.length && !allowedRoles.includes(role)) {
        return res.status(403).json({ error: "forbidden" });
      }
      next();
    });
  };
}


router.use(cookieParser());
router.use(express.json());

// POST /api/auth/login  -> DB first, then env fallback
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok:false, error:"missing_credentials" });

  try {
    // 1) Try DB user
    let u = await findUserByEmail(email);
    if (u && u.is_active && await bcrypt.compare(password, u.password_hash)) {
      const payload = { uid: u.id, sub: u.email, name: u.name, role: u.role, crew_name: u.crew_name || null, org_id: u.org_id || null };
      setAuthCookie(res, payload);
      const redirect = landingPathFor(payload);
      const accept = String(req.headers["accept"] || "").toLowerCase();
      const wantsJSON = accept.includes('application/json') || accept.includes('text/json') || req.xhr === true;
      if (wantsJSON) {
        return res.json({ ok: true, user: { id: u.id, email: u.email, name: u.name, role: u.role, org_id: u.org_id || null }, redirect });
      }
      return res.redirect(303, redirect);
    }

    // 2) Fallback to single env user (optional safety during transition)
    const emailOk = FALLBACK_EMAIL && (String(email).toLowerCase() === String(FALLBACK_EMAIL).toLowerCase());
    const passOk  = FALLBACK_HASH && await bcrypt.compare(password, FALLBACK_HASH);
    if (emailOk && passOk) {
      const payload = { uid: 0, sub: FALLBACK_EMAIL, name: "Admin", role: "admin", org_id: null };
      setAuthCookie(res, payload);
      const redirect = landingPathFor(payload);
      const accept = String(req.headers["accept"] || "").toLowerCase();
      const wantsJSON = accept.includes('application/json') || accept.includes('text/json') || req.xhr === true;
      if (wantsJSON) {
        return res.json({ ok: true, user: { id: 0, email: FALLBACK_EMAIL, name: "Admin", role: "admin", org_id: null }, redirect });
      }
      return res.redirect(303, redirect);
    }

    return res.status(401).json({ ok:false, error:"invalid_credentials" });
  } catch (e) {
    console.error("login error", e);
    return res.status(500).json({ ok:false, error:"login_failed" });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie("ce_jwt");
  res.json({ ok:true });
});

// POST /api/auth/register - Public registration disabled (force invite flow)
router.post("/register", (req, res) => {
  return res.status(403).json({ error: 'registration_disabled', detail: 'Use an invitation link' });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const { uid, sub, name, role, crew_name, org_id } = req.user || {};
  res.json({ ok:true, id: uid, email: sub, name: name || "User", role: role || "sales", org_id: org_id ?? null, crew_name: crew_name || null });
});

// Read-only list of roles used for privileges
router.get('/roles', (_req, res) => {
  const roles = ['admin','sales','ops','purchasing','installer','service','manufacturing','assembly','delivery'];
  res.json({ roles });
});

// POST /api/auth/accept-invite
router.post('/accept-invite', async (req, res) => {
  try {
    const { token, name, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ ok:false, error: 'missing_fields' });

    // Lookup invitation by token (must be unused)
    const invq = await pool.query(`
      SELECT id, email, role, org_id, used_at, expires_at
        FROM public.invitations
       WHERE token = $1
    `, [token]);
    if (!invq.rowCount) return res.status(404).json({ ok:false, error: 'invite_not_found' });
    const inv = invq.rows[0];
    if (inv.used_at) return res.status(400).json({ ok:false, error: 'invite_already_used' });
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ ok:false, error: 'invite_expired' });
    }

    // Prevent duplicate users
    const existing = await findUserByEmail(inv.email);
    if (existing) return res.status(409).json({ ok:false, error: 'user_exists' });

    const password_hash = await bcrypt.hash(password, 10);
    const ins = await pool.query(`
      INSERT INTO public.users (name, email, role, org_id, status, password_hash, is_active, password_reset_required)
      VALUES ($1,$2,$3,$4,'active',$5,true,false)
      RETURNING id
    `, [name || inv.email.split('@')[0], inv.email, inv.role, inv.org_id, password_hash]);

    await pool.query(`
      UPDATE public.invitations
         SET used_at = now(), status = 'accepted'
       WHERE id = $1
    `, [inv.id]);

    return res.json({ ok:true, user_id: ins.rows[0].id });
  } catch (e) {
    console.error('[accept-invite ERR]', e);
    return res.status(500).json({ ok:false, error: 'db_error', detail: e.message });
  }
});

export default router;
