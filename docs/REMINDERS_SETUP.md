# Task Reminders & Auto-Nudge System

## Overview

The reminder system automatically monitors tasks and sends notifications when:
1. **Late Start (Nudge)**: Task is still "scheduled" X minutes after `window_start`
2. **Escalate**: Task still not "in_progress" after longer grace period
3. **Past End**: Task not "complete" after `window_end` + grace period (auto marks as HOLD)

## Configuration

Set these environment variables in your `.env` file:

```env
# Grace periods (in minutes)
NUDGE_GRACE_MIN=15          # Nudge if not started 15min after window_start
NUDGE_ESCALATE_MIN=45       # Escalate if still not in_progress 45min after start
NUDGE_PAST_END_MIN=30       # Mark HOLD if not complete 30min after window_end

# Slack webhook for notifications
N8N_OPS_STATUS_WEBHOOK=https://your-webhook-url
```

## Manual Usage

### Via Ops Day Board UI

1. **Individual Task Nudge**: Click the "Nudge" button on any task card
2. **Full Scan**: Click "🔔 Scan Now" button in toolbar

### Via API

```bash
# Scan all tasks for late/overdue status
POST http://localhost:3000/api/reminders/scan

# Manually nudge a specific task
POST http://localhost:3000/api/reminders/:taskId/nudge
```

## Automated Scanning

### Option 1: n8n Workflow

Create an n8n workflow that:
1. Triggers every 10 minutes (Schedule Trigger)
2. HTTP Request: `POST http://your-server:3000/api/reminders/scan`
3. (Optional) Parse response and send custom notifications

### Option 2: Windows Task Scheduler

Create a PowerShell script `scan-reminders.ps1`:

```powershell
$url = "http://localhost:3000/api/reminders/scan"
try {
    $result = Invoke-RestMethod -Uri $url -Method POST -ContentType "application/json"
    Write-Host "Scan complete: $($result.nudged) nudged, $($result.escalated) escalated, $($result.past_end) past end"
} catch {
    Write-Error "Scan failed: $_"
}
```

Then schedule it:
1. Open Task Scheduler
2. Create Basic Task → Name: "Cabinet Task Reminders"
3. Trigger: Daily, repeat every 10 minutes
4. Action: Start a program → `powershell.exe -File "C:\path\to\scan-reminders.ps1"`

### Option 3: cron (Linux/Mac)

```bash
# Run every 10 minutes
*/10 * * * * curl -X POST http://localhost:3000/api/reminders/scan
```

## What Gets Logged

All nudges are logged in the `job_events` table:

```sql
SELECT * FROM public.job_events 
WHERE event_type = 'nudge' 
ORDER BY created_at DESC;
```

Event payload includes:
- `reason`: "late_start", "escalate_scheduler", or "past_end"
- `grace_min`: The grace period used
- `created_by`: "system" (auto) or "manual" (button click)

## Slack Notifications

If `N8N_OPS_STATUS_WEBHOOK` is configured, notifications are sent to Slack:

- ⏰ **Nudge**: Task not started on time
- 🚨 **Escalate**: Task still not in progress - scheduler needs to intervene
- 🟥 **Past End**: Task not completed, marked as HOLD

## Troubleshooting

### No notifications sent

1. Check `.env` has `N8N_OPS_STATUS_WEBHOOK` set
2. Verify webhook URL is reachable
3. Check console logs: `[SLACK] nudge failed: ...`

### Scan returns 0 results but tasks are late

1. Verify task `status` is "scheduled" (not "in_progress" or "complete")
2. Check `window_start` is in the past
3. Confirm no "arrived" event exists in `job_events` for that task

### Too many false alerts

Increase grace periods in `.env`:
```env
NUDGE_GRACE_MIN=30          # More lenient
NUDGE_ESCALATE_MIN=90       # Wait longer before escalating
```

## Advanced: Custom Logic

Edit `routes/reminders.js` to customize:
- Grace period calculations
- Status transitions (e.g., don't auto-mark as HOLD)
- Notification content
- Additional escalation steps (email, SMS, etc.)
