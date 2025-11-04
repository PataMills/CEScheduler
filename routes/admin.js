// routes/admin.js
import express from "express";
import { requireAuth } from "./auth.js";
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const router = express.Router();

// Middleware to require admin role
function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin') {
    return res.status(403).json({ error: "admin_required" });
  }
  next();
}

// GET /api/admin/users - List all users
router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, role, crew_name, is_active, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error("Get users error:", e);
    res.status(500).json({ error: "failed_to_fetch_users" });
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
  
  try {
    const { rows } = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, phone = $3, role = $4, crew_name = $5
       WHERE id = $6
       RETURNING id, name, email, phone, role, crew_name, is_active, created_at`,
      [name, email, phone || null, role, crew_name || null, id]
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
