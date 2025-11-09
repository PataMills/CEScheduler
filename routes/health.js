import { Router } from "express";
import pool from "../db.js";

const router = Router();

async function tableExists(name) {
  if (!name) return false;
  try {
    const { rows } = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
        LIMIT 1`,
      [name]
    );
    return rows.length > 0;
  } catch (e) {
    console.warn("[health] tableExists error", e?.message || e);
    return false;
  }
}

async function columnExists(table, column) {
  if (!table || !column) return false;
  try {
    const { rows } = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1`,
      [table, column]
    );
    return rows.length > 0;
  } catch (e) {
    console.warn("[health] columnExists error", e?.message || e);
    return false;
  }
}

export default function registerHealth(app) {
  router.get("/__health", async (_req, res) => {
    try {
      const org = await pool
        .query(`SELECT current_setting('app.current_org_id', true) AS org`)
        .then((r) => r.rows?.[0]?.org ?? null)
        .catch(() => null);

      const hasBidColumns = await tableExists("bid_columns");
      const hasBidLines = await tableExists("bid_lines");
      const hasBidColumnDetails = await tableExists("bid_column_details");
      const hasBidQuoteTotals = await tableExists("bid_quote_totals");

      let viewSubtotalOk = false;
      if (hasBidQuoteTotals) {
        viewSubtotalOk =
          (await columnExists("bid_quote_totals", "subtotal")) ||
          (await columnExists("bid_quote_totals", "subtotal_after")) ||
          (await columnExists("bid_quote_totals", "subtotal_after_discount"));
      }

      const endpoints = {
        post_columns: true,
        post_lines: true,
        del_column: true,
        del_line: true,
        customer_info: true,
        summary: true,
        model: true,
        preview: true,
        totals: true,
      };

      res.json({
        ok: true,
        org_context: org,
        endpoints,
        db: {
          bid_columns: hasBidColumns,
          bid_lines: hasBidLines,
          bid_column_details: hasBidColumnDetails,
          bid_quote_totals_exists: hasBidQuoteTotals,
          bid_quote_totals_has_subtotal_like: viewSubtotalOk,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  app.use("/api", router);
}
