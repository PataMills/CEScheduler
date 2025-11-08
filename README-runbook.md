# API Runbook

## Start the API

```
npm install
npm start
```

## Configure environment

Create a `.env` file in the repository root:

```
DATABASE_URL=postgres://<user>:<pass>@<host>:5432/<db>
# Optional: PGSSLMODE=require (or omit to disable SSL)
```

## Health checks (manual)

- Server: `http://localhost:3000/api/health` → `{ ok: true, uptime: <seconds> }`
- DB: `http://localhost:3000/api/health/db` → `{ ok: true }`

## Smoke test (PowerShell)

In a second terminal:

```
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
```

Expected output: `✅ Smoke OK`

## Troubleshooting

- **500 error** → global handler returns `{ error: "…" }`. Copy the message to Slack/dev chat and fix the referenced file/line.
- **401/403** → endpoint requires auth. Remove it from smoke or add a public read-only variant.
- **ECONNREFUSED** → DB unreachable. From your dev machine:
  ```
  Test-NetConnection <host> -Port 5432
  ```
  Fix firewall/`pg_hba.conf`/`listen_addresses` and confirm credentials.

## Dev tips

- One shared pool only: all DB calls must import `pool` from `./db.js`.
- ESM only: use `import`/`export`, no `require`/`module.exports`.
- App order matters: define `const app = express()` before any `app.use()`/`app.get()`.
- Use `asyncHandler(fn)` to avoid missing `try/catch`.

## Optional extras

Add an npm script for smoke checks in `package.json`:

```
"scripts": {
  "start": "node app.js",
  "smoke": "powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1"
}
```

Then run:

```
npm start
# in another terminal
npm run smoke
```

VS Code tip: Settings → “GitHub Copilot Chat: Continue Running Timeout” → set `3600` (or `0`).
