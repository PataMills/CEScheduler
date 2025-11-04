# Material Readiness Migration

## What it does
Creates a PostgreSQL function `job_material_ready(p_job_id)` that returns `true` when all purchase orders for a job have been received.

## How to apply

### Option 1: pgAdmin (GUI)
1. Open pgAdmin and connect to your database
2. Open Query Tool (right-click on database → Query Tool)
3. Copy and paste the contents of `migrations/2025-11-04_material_ready.sql`
4. Execute (F5 or click Execute button)

### Option 2: psql command line
```bash
# PowerShell
$env:PGPASSWORD="your_password"
psql -h your_host -U your_user -d your_database -f "migrations/2025-11-04_material_ready.sql"

# Or using DATABASE_URL from .env
psql "postgres://user:pass@host:5432/dbname" -f "migrations/2025-11-04_material_ready.sql"
```

## Verification
After applying, test with:
```sql
SELECT job_material_ready(12345); -- Replace 12345 with a real job_id
```

Should return `true` if all POs for that job are status='received', or `false` otherwise.

## Used by
- `/api/calendar/events` - includes `material_ready` flag in event `extendedProps`
- `PATCH /api/calendar/events/:id` - blocks reschedules when materials aren't ready (unless admin/ops or `force=true`)
