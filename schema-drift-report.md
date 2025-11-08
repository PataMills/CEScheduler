# Schema Drift Report

_Environment: cabinet-manufacturing-api • Generated: 2025-11-08_

> **Important:** The requested source-of-truth schema file (`backup.sql`, dated 2025‑11‑08) is not present in the repository. All findings below are inferred from application code only. Please supply the backup dump to enable definitive validation.

| Table | Field | Used In | In DB?* | Status | Fix Recommendation |
|-------|-------|---------|---------|--------|--------------------|
| users | phone | routes/admin.js (`SELECT … phone …`) | Unknown | ⚠️ | Confirm `phone` exists (`ALTER TABLE users ADD COLUMN phone TEXT;`) or remove from select.
| users | is_active | routes/admin.js, routes/adminUsers.js | Unknown | ⚠️ | Ensure column exists and defaults true; otherwise add migration (`BOOLEAN DEFAULT TRUE`).
| users | password_reset_required | routes/adminUsers.js | Unknown | ⚠️ | Add column if missing (`BOOLEAN DEFAULT FALSE`).
| users | password_hash | routes/adminUsers.js, routes/auth.js | Unknown | ⚠️ | Confirm column present; add `TEXT` column if absent.
| users | crew_name | routes/auth.js | Unknown (guarded by migration `add_crew_name_to_users.sql`) | ✅* | Migration adds column; apply if not in dump.
| users | status | routes/auth.js (`INSERT … status`) | Unknown | ⚠️ | Verify `status` column exists; otherwise add `TEXT DEFAULT 'active'`.
| users | org_id | routes/auth.js | Unknown | ⚠️ | Ensure `org_id` column + FK to `organizations` exists or adjust inserts.
| bids | customer_email | routes/search.js (fallback) | Unknown | ⚠️ | Confirm column; otherwise adjust search filter.
| bids | doc_links | app.js (`/api/files`) | Unknown | ⚠️ | Add JSON/ARRAY column or guard nulls.
| bids | sales_person / salesman | routes/salesExtra.js, routes/purchasing-flow.js | Unknown | ⚠️ | Validate presence; align naming.
| bids | promised_install_date, deposit_amount, deposit_received_at, po_number, total_amount | routes/sales.js | Unknown | ⚠️ | Confirm numeric/date columns exist; create migration if absent.
| quote_ack_tokens | token, expires_at, used_at | pages/quoteAck.js | Missing | ❌ | Create table per usage (`token TEXT UNIQUE, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ`).
| service_requests | job_id, summary, files, created_by | routes/sales.js | Missing | ❌ | Add table or guard optional insert block.
| task_reschedule_requests | task_id, requested_by, new_start, … | routes/sales.js | Missing | ❌ | Define table per insert expectations.
| option_sets | key, label | routes/options.js | Unknown | ⚠️ | Ensure exists with unique constraint on `key`.
| option_values | value_text, value_num, sort_order, is_active | routes/options.js | Unknown | ⚠️ | Confirm schema; add composite unique + `set_id` FK.
| options_kv | group_key, value, sort, meta | app.js (`/api/options/*`) | Missing | ❌ | Add table or update code to use `option_values` exclusively.
| install_tasks_for_day (view) | task_id, resource_name, … | sql/patch.sql | Unknown | ⚠️ | Apply latest view definition from repo if backup differs.
| purchase_order_docs | file_path, file_name, kind | routes/po.js | Unknown | ⚠️ | Validate table + columns; migrations not present.
| purchase_queue | qty_required, qty_received | routes/material.js | Unknown | ⚠️ | Confirm numeric fields exist.
| manufacturer_lead_times | manufacturer, base_days | routes/purchasing-flow.js | Unknown | ⚠️ | Ensure table exists to avoid `NULL` lead times.
| job_events | event_type, meta | routes/teamTasks.js, routes/reminders.js | Unknown | ⚠️ | Verify audit table aligns with inserts.

\*“In DB?” reflects absence of `backup.sql`; entries marked ✅ rely on migrations present in repo that add/alter the column.

## Required Actions
1. Provide or restore `backup.sql` (2025-11-08) so automated comparison can be rerun.
2. Run `psql < backup.sql` in a throwaway database and execute the SQL audit script (see Appendix) to confirm each field.
3. For ❌ items, prepare migrations immediately to prevent runtime failures when code paths execute.

## Appendix – Suggested Audit Query
```sql
SELECT table_name,
       column_name,
       data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('users','bids','option_sets','option_values','options_kv',
                      'quote_ack_tokens','service_requests','task_reschedule_requests',
                      'purchase_queue','purchase_order_docs','manufacturer_lead_times',
                      'job_events');
```

If you can share `backup.sql`, rerun Phase 4 to produce a definitive comparison.
