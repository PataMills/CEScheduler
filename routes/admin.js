// routes/admin.js
import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

// Middleware to require admin role
function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin') {
    return res.status(403).json({ error: "admin_required" });
  }
  next();
}

const USER_ALLOWED_ROLES = ['admin','sales','ops','purchasing','installer','service','manufacturing','assembly','delivery'];
const SALT_ROUNDS = 10;

async function ensureUserSchema() {
  const statements = [
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS crew_name TEXT",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true",
    "ALTER TABLE public.users ALTER COLUMN is_active SET DEFAULT true",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT false",
    "ALTER TABLE public.users ALTER COLUMN password_reset_required SET DEFAULT false",
    "ALTER TABLE public.users ADD COLUMN IF NOT EXISTS org_id INTEGER NULL"
  ];
  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (e) {
      // Ignore duplicate column errors; surface anything else for visibility.
      if (e?.code !== '42701' && e?.code !== '42P07') {
        console.error('[ADMIN ensureUserSchema ERR]', e.message || e);
      }
    }
  }
}

const USER_SELECT_SQL = `
  SELECT id, name, email, phone, role, crew_name, is_active, created_at
    FROM public.users
   ORDER BY created_at DESC, id DESC
`;

async function listUsers() {
  try {
    const { rows } = await pool.query(USER_SELECT_SQL);
    return rows;
  } catch (e) {
    if (e?.code === '42703') {
      await ensureUserSchema();
      const { rows } = await pool.query(USER_SELECT_SQL);
      return rows;
    }
    throw e;
  }
}

if (process.env.SKIP_DB_BOOTSTRAP !== '1') {
  await ensureUserSchema();
}

// GET /api/admin/users - List all users
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const rows = await listUsers();
    res.json(rows);
  } catch (e) {
    console.error("Get users error:", e);
    res.status(500).json({ error: "failed_to_fetch_users" });
  }
});

// POST /api/admin/users - Create a new user (admin only)
router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureUserSchema();
    const { name, email, phone, role, crew_name, password } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "missing_fields" });
    }
    if (!USER_ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: "invalid_role" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await pool.query(
      `SELECT id FROM public.users WHERE lower(email) = lower($1) LIMIT 1`,
      [normalizedEmail]
    );
    if (existing.rowCount) {
      return res.status(409).json({ error: "email_in_use" });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const orgId = req.user?.org_id || null;
    const { rows } = await pool.query(
      `INSERT INTO public.users
         (name, email, phone, role, crew_name, org_id, password_hash, is_active, password_reset_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,true)
       RETURNING id, name, email, phone, role, crew_name, is_active, created_at`,
      [
        name,
        normalizedEmail,
        phone ? String(phone).trim() : null,
        role,
        crew_name ? String(crew_name).trim() : null,
        orgId,
        hash,
      ]
    );

    res.status(201).json({ ok: true, user: rows[0] });
  } catch (e) {
    console.error("Create user error:", e);
    res.status(500).json({ error: "failed_to_create_user" });
  }
});

// POST /api/admin/users/:id/activate - Activate a user
router.post("/users/:id/activate", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE users SET is_active = true WHERE id = $1`,
      [id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("Activate user error:", e);
    res.status(500).json({ error: "failed_to_activate_user" });
  }
});

// POST /api/admin/users/:id/deactivate - Deactivate a user
router.post("/users/:id/deactivate", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE users SET is_active = false WHERE id = $1`,
      [id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("Deactivate user error:", e);
    res.status(500).json({ error: "failed_to_deactivate_user" });
  }
});

// PUT /api/admin/users/:id - Update a user
router.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, role, crew_name } = req.body;
  if (role && !USER_ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: "invalid_role" });
  }
  
  try {
    await ensureUserSchema();
    const { rows } = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, phone = $3, role = $4, crew_name = $5
       WHERE id = $6
       RETURNING id, name, email, phone, role, crew_name, is_active, created_at`,
      [
        name,
        email,
        phone ? String(phone).trim() : null,
        role,
        crew_name ? String(crew_name).trim() : null,
        id,
      ]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: "user_not_found" });
    }
    
    res.json({ ok: true, user: rows[0] });
  } catch (e) {
    console.error("Update user error:", e);
    res.status(500).json({ error: "failed_to_update_user" });
  }
});

export default router;
