// routes/tasksSearch.js
import express from "express";
import pool from "../db.js";

const router = express.Router();

/** Aliases used in the SQL below */
const ALIAS = { bids: "b", jobs: "j", install_jobs: "ij" };

/** Candidate customer columns per table */
const CANDIDATES = {
  bids: ["customer_name", "customer", "client_name", "name"],
  jobs: ["customer_name", "customer", "client_name", "name"],
  install_jobs: ["customer_name", "customer", "client_name", "name"],
};

let CUSTOMER_EXPR = null; // cached COALESCE(...) string

async function columnsFor(table) {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return new Set(rows.map(r => r.column_name));
}

/** Build and cache a COALESCE(...) using only columns that actually exist. */
async function detectCustomerExpr() {
  if (CUSTOMER_EXPR) return CUSTOMER_EXPR;

  const parts = [];
  for (const [table, fields] of Object.entries(CANDIDATES)) {
    const have = await columnsFor(table);
    const alias = ALIAS[table]; // 'b', 'j', or 'ij'
    for (const f of fields) {
      if (have.has(f)) parts.push(`${alias}.${f}`);
    }
  }
  CUSTOMER_EXPR = parts.length ? `COALESCE(${parts.join(", ")})` : `''`;
  return CUSTOMER_EXPR;
}

/**
 * GET /api/tasks/search?q=... [&from=YYYY-MM-DD&to=YYYY-MM-DD]
 * Matches by id, job_id, task name/type, crew name, and detected customer field(s).
 */
router.get("/api/tasks/search", async (req, res) => {
  const qRaw = (req.query.q || "").trim();
  const from = (req.query.from || "").trim();
  const to   = (req.query.to   || "").trim();
  if (!qRaw) return res.json([]);

  const isNum = /^\d+$/.test(qRaw);
  const likeQ = `%${qRaw}%`;

  try {
    const customerExpr = await detectCustomerExpr();

    // Build WHERE with stable param positions
    const params = [];
    let where = `
      (
        ${isNum ? "it.id = $1" : "false"}
        OR it.job_id ILIKE $2
        OR it.name   ILIKE $2
        OR it.type   ILIKE $2
        OR c.name    ILIKE $2
        OR ${customerExpr} ILIKE $2
      )
    `;

    if (isNum) {
      params.push(Number(qRaw)); // $1
      params.push(likeQ);        // $2
    } else {
      params.push(0);            // $1 (dummy to keep positions stable)
      params.push(likeQ);        // $2
    }
    if (from) { params.push(from); where += ` AND it.window_start >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND it.window_start <= $${params.length}`; }

    const sql = `
      SELECT it.id,
             it.job_id,
             it.type,
             it.name,
             it.status,
             it.window_start,
             it.window_end,
             c.name AS crew,
             ${customerExpr} AS customer_name
      FROM public.install_tasks it
      LEFT JOIN public.crews         c  ON c.id        = it.resource_id
      LEFT JOIN public.bids          b  ON b.id::text  = it.job_id::text
      LEFT JOIN public.jobs          j  ON j.id::text  = it.job_id::text
      LEFT JOIN public.install_jobs  ij ON ij.id::text = it.job_id::text
      WHERE ${where}
      ORDER BY it.window_start DESC NULLS LAST
      LIMIT 50
    `.replace(/\s+\n/g, "\n"); // tidy whitespace (optional)

    const { rows } = await pool.query(sql, params);

    const data = rows.map(r => ({
      id: r.id,
      job_id: r.job_id,
      title: [r.type, r.name].filter(Boolean).join(" — "),
      customer_name: r.customer_name || "",
      window_start: r.window_start,
      window_end: r.window_end,
      crew: r.crew || "",
      status: r.status || ""
    }));

    res.json(data);
  } catch (e) {
    console.error("[/api/tasks/search]", e.message);
    res.status(500).json([]);
  }
});

export default router;
