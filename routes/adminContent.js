// routes/adminContent.js
import express from "express";
import fs from "node:fs";
import path from "node:path";

const router = express.Router();
const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "admin-content.json");

const DEFAULTS = {
  company_name: "Cabinets Express",
  company_phone: "(801) 617-1133",
  company_email: "sales@cabinetsexpress.com",
  quote_disclaimer:
    "All sales final after 24 hours. Natural wood varies in color and grain; non-warranty cosmetic variation is expected.",
  payment_terms:
    "Deposit due before ordering; remaining balance due at installation. Interest/fees may apply if late."
};

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { ...DEFAULTS }; }
}
function save(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
}

router.get("/", (_req, res) => res.json(load()));

router.put("/", express.json(), (req, res) => {
  const cur = load();
  const next = { ...cur, ...(req.body || {}) };
  save(next);
  res.json({ ok: true, saved: next });
});

export default router;
