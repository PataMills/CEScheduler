# DB Patch for install_tasks_for_day View

## What this does
- Fixes the join in `public.install_tasks_for_day` to use only the numeric portion of job IDs, making it robust to mixed text/integer job_id types.
- Adds functional indexes to speed up the join if job IDs are not purely numeric.

## How to apply
1. Open your Postgres client (psql, pgAdmin, etc.)
2. Run the SQL in `sql/patch.sql` against your database.

## Why
- Prevents errors from regex on integer columns in schedule-related endpoints.
- Ensures `/api/schedule` and `/api/myday` work for all job_id formats.

## Rollback
- To revert, restore your previous view definition (see your DB backup or dump).

---

**Node.js version:** 18.x recommended
**Start script:** `node app.js`

.env.example provided for reference.
