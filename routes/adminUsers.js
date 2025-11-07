// routes/adminUsers.js
import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "./auth.js";

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

// List users
router.get("/", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id DESC"
  );
  res.json({ ok: true, users: rows });
}));

// Create user
router.post("/", requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const { name, email, role, password } = req.body || {};
  if (!name || !email || !role || !password) return res.status(400).json({ ok:false, error:"missing_fields" });
  if (!["admin","sales","ops"].includes(role)) return res.status(400).json({ ok:false, error:"bad_role" });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users(name,email,role,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,created_at",
      [name, email.toLowerCase(), role, hash]
    );
    res.json({ ok:true, user: rows[0] });
  } catch (e) {
    const dup = e?.code === "23505";
    res.status(dup ? 409 : 500).json({ ok:false, error: dup ? "email_in_use" : "create_failed" });
  }
}));

// Reset password
router.patch("/:id/password", requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok:false, error:"missing_password" });
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "UPDATE users SET password_hash=$1, password_reset_required=true WHERE id=$2",
    [hash, id]
  );
  res.json({ ok:true });
}));

// Activate/Deactivate user
router.patch("/:id/status", requireAuth, requireAdmin, express.json(), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body || {};
  if (typeof is_active !== "boolean") return res.status(400).json({ ok:false, error:"bad_status" });
  await pool.query(
    "UPDATE users SET is_active=$1 WHERE id=$2",
    [is_active, id]
  );
  res.json({ ok:true });
}));

export default router;
