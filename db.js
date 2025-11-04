// db.js — compatible with both default and named imports
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // If you need SSL (common on hosted DBs), set PGSSLMODE=require in .env
  ssl: process.env.PGSSLMODE ? { rejectUnauthorized: false } : false,
  max: 10,
});

// convenience helper
function query(text, params) {
  return pool.query(text, params);
}

// Default export (for: import db from "../db.js")
const db = { query, pool };
export default db;

// Named exports (for: import { pool } from "../db.js")
export { pool, query };
