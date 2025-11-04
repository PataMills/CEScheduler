# Cabinet Manufacturing Scheduler - AI Agent Guide

## Architecture Overview

This is a **monolithic Express.js API** serving both API routes and server-rendered HTML pages for a cabinet manufacturing scheduling system. The app coordinates sales intake, manufacturing phases, purchasing, and field operations across multiple teams.

### Core Components

1. **`app.js`**: Central Express server that orchestrates all routes and page registrations
2. **`routes/`**: REST API endpoints (e.g., `/api/tasks`, `/api/schedule`, `/api/myday`)
3. **`pages/`**: Server-side rendered HTML pages using string templates (no framework like EJS/Pug)
4. **`db.js`**: PostgreSQL connection pool (`pg` library); exports both `pool` and `query` helper
5. **`static/`**: Client-side JS and CSS served from `/static/*` URL path

### Key Data Models

- **`install_jobs`** / **`jobs`**: Customer projects with metadata (customer_name, address, lat/lng)
- **`install_tasks`**: Individual work items tied to jobs (manufacturing, assembly, delivery, install, service)
- **`install_tasks_for_day`** (VIEW): Denormalized view joining tasks → jobs → resources for scheduling
- **`resources`**: Teams/crews (e.g., "Install Team A") with daily capacity in minutes
- **`purchase_orders`**, **`purchase_queue`**: Material procurement tracking
- **`job_events`**: Audit log for task lifecycle events (arrived, wip, complete, nudge)

## Critical Conventions

### 1. Page Registration Pattern

Pages are **NOT** route handlers; they're HTML-generating functions registered in `app.js`:

```javascript
// pages/myPage.js
export default function registerMyPage(app) {
  app.get("/my-page", (req, res) => {
    res.type("html").send(`<!doctype html>...`);
  });
}

// app.js
import registerMyPage from "./pages/myPage.js";
registerMyPage(app);
```

**Always** use this pattern for new pages. Import and call the registration function in `app.js` after `const app = express();`.

### 2. Shared Layout System

Use **`pages/_layout.js`** helpers for consistent dark theme styling:

```javascript
import { headCommon, footCommon } from "./_layout.js";

app.get("/my-page", (req, res) => {
  res.type("html").send(headCommon('Page Title') + `
    <div class="wrap">
      <!-- Page content -->
    </div>
  ` + footCommon());
});
```

- `headCommon()` includes `/static/appbar.css?v=3`, `/static/calendar.css?v=3`, FullCalendar CSS, and sets `<body class="theme-dark">`
- `footCommon()` includes `/static/appbar.js?v=3` for navigation
- **DO NOT** inline CSS that duplicates theme styles; use shared utility classes (`.wrap`, `.card`, `.btn`, `.badge`, `.muted`)

### 3. Authentication & Authorization

Three middleware functions from `routes/auth.js`:

- **`requireAuth`**: API middleware (returns JSON 401 if unauthorized)
- **`requireAuthPage`**: Page middleware (redirects to `/login` if unauthorized)
- **`requireRolePage(["admin", "sales"])`**: Role-based page access (returns 403 HTML if role not allowed)

**Apply auth BEFORE** mounting page routes:

```javascript
app.use("/sales-intake", requireRolePage(["admin", "sales"]));
registerSalesIntakePage(app);
```

User data available in `req.user` (decoded JWT): `{ uid, sub, name, role, crew_name, org_id }`.

### 4. Database Query Pattern

Always use **parameterized queries** to prevent SQL injection:

```javascript
import { pool } from "../db.js";

const { rows } = await pool.query(
  `SELECT * FROM install_tasks WHERE job_id = $1 AND status = $2`,
  [jobId, "scheduled"]
);
```

For transactions, acquire a client:

```javascript
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("INSERT ...", [params]);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
}
```

### 5. Task Lifecycle & Status Flow

Tasks move through states: `scheduled` → `in_progress` (via `/arrived` or `/wip`) → `complete`.

**Key endpoints** (in `routes/teamTasks.js`):
- `POST /api/tasks/:id/ontheway` → Logs "on_the_way" event
- `POST /api/tasks/:id/arrived` → Sets status `in_progress`, logs "arrived" event
- `POST /api/tasks/:id/wip` → Sets status `in_progress` (work-in-progress)
- `POST /api/tasks/:id/complete` → Sets status `complete`, logs "complete" event with optional photos

All status changes create entries in `job_events` table for audit trail.

### 6. Slack Integration

Use `slack.js` exports for notifications:

```javascript
import { slack, SLACK_CHANNEL } from "./slack.js";

if (slack && SLACK_CHANNEL) {
  await slack.chat.postMessage({
    channel: SLACK_CHANNEL,
    text: "Fallback text",
    blocks: [/* Block Kit JSON */]
  });
}
```

**Always check** `if (slack && SLACK_CHANNEL)` before posting to avoid crashes when Slack is not configured.

## Developer Workflows

### Starting the App

```bash
npm install
npm start  # or npm run dev (both run app.js via Node)
```

App listens on `PORT` (default 3000). Access at `http://localhost:3000`.

### Environment Variables

Create `.env` file (required):

```env
DATABASE_URL=postgres://user:pass@host:5432/dbname
JWT_SECRET=your-secret-key
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_CHANNEL=#ops-status
QBO_CLIENT_ID=your-quickbooks-client-id
QBO_CLIENT_SECRET=your-quickbooks-secret
QBO_REFRESH_TOKEN=your-refresh-token
QBO_REALM_ID=your-company-id
NUDGE_GRACE_MIN=15
NUDGE_ESCALATE_MIN=45
```

### Database Migrations

No migration framework. Apply changes manually:

```bash
psql $DATABASE_URL -f sql/patch.sql
```

Or run SQL directly in `migrations/*.sql` files. Coordinate with team before altering production schema.

### Testing Pages Locally

1. **Login**: Navigate to `/login`, use a test account from `users` table
2. **Check role access**: Ensure your test user has the correct role for the page you're testing
3. **Hard refresh**: Press `Ctrl+Shift+R` (Windows) to bypass service worker cache

### Common Issues

**CSS not loading**: Increment version in `_layout.js` (`?v=3` → `?v=4`) and hard refresh.

**"Unauthorized" on page load**: JWT expired or missing. Clear cookies and re-login.

**Task not showing in schedule**: Check `install_tasks_for_day` view returns the task; verify `window_start` date and `resource_id` assignment.

**Slack notifications not sending**: Verify `.env` has `SLACK_BOT_TOKEN` and `SLACK_CHANNEL` set; check console for `[SLACK]` errors.

## Integration Points

### QuickBooks Online (QBO)

**`services/qbo.js`** handles OAuth token refresh and API calls. Key function:

```javascript
export async function qbFetch(path, options) { /* ... */ }
```

Used for syncing invoices, deposits, and payments. Requires `QBO_*` env vars.

### FullCalendar

Client-side calendar library loaded via CDN in `headCommon()`. Custom event rendering in `/static/calendar.js`:

- Event types (manufacturing, paint, assembly, delivery, install, service) have distinct colors
- Events show status badges (scheduled, in_progress, complete) via `extendedProps`

### Material Readiness Logic

`purchase_queue` table tracks material orders per job. The `install_tasks_for_day` view joins with a CTE to compute `material_ready` flag (all items received or status = 'received').

## File Organization Rationale

- **`pages/`**: HTML generation logic, one function per route
- **`routes/`**: JSON API handlers, grouped by domain (tasks, schedule, purchasing, etc.)
- **`static/`**: Client-side scripts (`calendar.js`, `appbar.js`, etc.) served at `/static/*`
- **`middleware/`**: Custom middleware (currently only `authz.js`)
- **`services/`**: External integrations (QBO, future: email, SMS)

## Common Patterns

### Adding a New Page

1. Create `pages/myPage.js` with `export default function registerMyPage(app) { ... }`
2. Import and call in `app.js`: `registerMyPage(app);`
3. Apply auth middleware if needed: `app.use("/my-page", requireRolePage(["admin"]));`
4. Use `headCommon()` / `footCommon()` for consistent styling

### Adding a New API Endpoint

1. Create or edit `routes/myDomain.js`
2. Define route: `router.get("/my-endpoint", async (req, res) => { ... });`
3. Mount in `app.js`: `app.use("/api/my-domain", myDomainRouter);`
4. Add auth middleware if needed: `router.use(requireAuth);` (for entire router) or per-route

### Updating Task Status

Use existing endpoints in `routes/teamTasks.js` rather than direct DB updates. Always log events to `job_events` for traceability.

### Querying by Date

Tasks use `window_start` (timestamp with time zone). **Always** use Mountain Time (`America/Denver`) for date comparisons:

```sql
WHERE DATE(window_start AT TIME ZONE 'America/Denver') = '2025-11-05'
```

## Key Views & Queries

**`install_tasks_for_day`**: Primary view for scheduling UI. Joins tasks → jobs → resources with address, lat/lng, phone.

**Capacity calculation**: Sum `duration_min` per resource, compare to `resources.capacity_min_per_day` (default 450 min = 7.5 hrs).

**Auto-scheduling**: `POST /api/tasks/auto-schedule` creates task backlog from install date (delivery → assembly → manufacturing → purchasing with offset days).

## Security Notes

- **NEVER** expose raw SQL errors to client; log them server-side
- **Always** use parameterized queries (`$1`, `$2`, etc.)
- JWT cookies are `httpOnly`, `sameSite: lax`, `secure` in production (controlled by `FORCE_SECURE_COOKIES` env var)
- Role checks happen at route level; **DO NOT** rely on client-side role validation

## Reminders & Automation

**`routes/reminders.js`**: Auto-nudge system scans tasks and sends Slack alerts if:

- Task still "scheduled" X minutes after `window_start` (late start)
- Task not "in_progress" after escalation period (scheduler intervention needed)
- Task not "complete" after `window_end` + grace (auto marks as HOLD)

**Trigger**: `POST /api/reminders/scan` (configure cron job, n8n workflow, or Windows Task Scheduler to call every 10 minutes).

## Cache Busting Strategy

All static assets use query param versioning (`?v=3`). Increment version in `_layout.js` when CSS/JS changes to force browser reload.

Service worker caching may interfere; instruct users to hard refresh or clear application cache in DevTools.

## Testing Guidance

No automated test suite currently. Test manually:

1. **API endpoints**: Use Postman/Thunder Client with JWT in `ce_jwt` cookie
2. **Pages**: Login as user with appropriate role, navigate to page
3. **Status transitions**: Use "My Day" or "Ops Day Board" UI to trigger task lifecycle events
4. **Slack notifications**: Check `#ops-status` channel after status changes

## Future Considerations

- Migrate to TypeScript for better type safety
- Add automated tests (Jest + Supertest for API, Playwright for pages)
- Extract repeated inline HTML/CSS patterns into reusable components (consider a template engine)
- Implement proper migration tool (e.g., `node-pg-migrate`)
