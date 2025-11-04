# Incomplete Jobs Detection & Management

## Overview

This system automatically detects when a job is marked "complete" but has missing, damaged, or incorrect items mentioned in the completion notes. It then:

1. **Parses completion notes** for keywords indicating problems
2. **Creates purchase queue entries** for each missing item
3. **Generates a service task** (on HOLD) for follow-up
4. **Sends Slack notifications** to ops/scheduler
5. **Provides a dedicated UI** for tracking incomplete jobs

## How It Works

### 1. Auto-Detection on Task Completion

When a tech marks a task complete (via `/api/tasks/:id/complete`), the system scans the completion note for:

**Problem Keywords:**
- missing, need, needs
- don't work, doesn't work
- not banded, too big, too small
- wrong, incorrect, damaged, broken, defective

**Item Keywords:**
- door, shelf, scribe, toekick
- hardware, lazy susan, cabinet, drawer
- hinge, handle, knob, panel, trim
- molding, crown, countertop, etc.

If both types of keywords appear in a line, it's flagged as a needed item.

### 2. Automatic Actions

For each incomplete job detected:

**A. Job Event Logged:**
```sql
INSERT INTO job_events (task_id, job_id, event_type, payload)
VALUES (?, ?, 'incomplete', {needs, note, detected_at})
```

**B. Purchase Queue Entries:**
```sql
INSERT INTO purchase_queue (job_id, item_name, spec, status)
VALUES (?, ?, {source, task_id}, 'pending')
```

**C. Service Task Created:**
```sql
INSERT INTO install_tasks (job_id, type, name, status, duration_min, notes)
VALUES (?, 'service', 'Service – Missing Items Follow-up', 'hold', 90, ...)
```

**D. Slack Notification:**
- Posts to #ops-status via `N8N_OPS_STATUS_WEBHOOK`
- Includes job ID, customer, item count, and service task ID

### 3. Viewing Incomplete Jobs

**Web UI:** `/incomplete`
- Shows all jobs with incomplete events
- Lists missing items per job
- Displays purchase queue status
- Shows related service tasks
- Allows manual resolution

**API Endpoint:** `GET /api/incomplete`
- Returns all incomplete jobs with details
- Includes needs list, purchase items, service tasks

## API Reference

### GET /api/incomplete
List all incomplete jobs

**Response:**
```json
[
  {
    "job_id": 123,
    "customer_name": "John Doe",
    "last_ts": "2025-10-21T14:30:00Z",
    "needs_list": [
      {
        "needs": [{...}],
        "note": "...",
        "created_at": "..."
      }
    ],
    "purchasing": [{...}],
    "service_tasks": [{...}]
  }
]
```

### GET /api/incomplete/:jobId
Get detailed information for a specific incomplete job

**Response:**
```json
{
  "id": 123,
  "customer_name": "John Doe",
  "incomplete_events": [{...}],
  "purchase_items": [{...}],
  "service_tasks": [{...}]
}
```

### POST /api/incomplete/:jobId/resolve
Mark an incomplete job as resolved

**Request:**
```json
{
  "resolution_note": "All items received and installed"
}
```

**Actions:**
- Updates purchase_queue items to 'resolved'
- Logs 'incomplete_resolved' event
- Completes related service tasks

## Workflow Examples

### Example 1: Missing Doors Detected

**Tech's Completion Note:**
```
Missing:
- W40 Door
- BSFHD36 Door
- Lazy susan doors don't work, they're too big
```

**System Actions:**
1. Creates 3 purchase_queue entries
2. Creates service task "Service – Missing Items Follow-up" (HOLD)
3. Posts to Slack: "🔴 Incomplete: Job #123 (John Doe) - 3 items needed"

**Purchasing Workflow:**
1. Purchaser sees items in `/purchasing` queue
2. Orders items, marks as 'ordered'
3. When items arrive, marks as 'received'
4. (Optional) Auto-triggers service task from HOLD → scheduled

**Scheduler Sees:**
- `/incomplete` page lists the job
- Service task appears in schedule (HOLD status)
- When parts ready, reschedules service task

### Example 2: Quality Issues

**Tech's Note:**
```
Lazy susan is not banded
Lazy susan shelf is not banded
4 pieces of scribe needed
```

**System Actions:**
- 3 items flagged
- Service task created for rework
- Notification sent

## Manual Operations

### Via Incomplete Jobs Page

**Resolve Job:**
```javascript
// Click "✓ Resolve" button
// Enter resolution note
// System marks purchase items resolved & completes service tasks
```

**View Details:**
```javascript
// Click "View Details"
// Opens bid/job page in new tab
```

### Via API

**Manually trigger incomplete processing:**
```javascript
// After modifying a completion note
POST /api/tasks/:id/reprocess-incomplete
```

## Integration Points

### With Purchasing Module
- Items auto-populate in purchase queue
- Status flow: pending → ordered → received
- Optional: trigger service task when all items received

### With Scheduling
- Service tasks created on HOLD
- Scheduler can reschedule when parts ready
- Critical path adjustments apply

### With Slack/Notifications
- Real-time alerts to #ops-status
- Includes job details and item count
- Links to job and service task

## Configuration

### Environment Variables

```env
# Required: Slack webhook for notifications
N8N_OPS_STATUS_WEBHOOK=https://your-webhook-url

# Optional: Auto-schedule service when parts ready
AUTO_SCHEDULE_SERVICE_TASKS=true
```

### Customizing Detection

Edit `utils/incompleteDetector.js`:

```javascript
// Add more keywords
const problemKeywords = /missing|need|custom_keyword/i;
const itemKeywords = /door|shelf|custom_item/i;

// Adjust detection logic
if (customLogic(line)) {
  items.push({...});
}
```

## Database Schema Requirements

### Required Tables

**job_events:**
- Stores 'incomplete' and 'incomplete_resolved' events
- Payload includes needs array and original note

**purchase_queue:**
- Stores items to be purchased
- Fields: job_id, item_name, spec, status, created_by

**install_tasks:**
- Stores service tasks
- Type: 'service', Status: 'hold' initially

## Troubleshooting

### Items Not Detected

**Check:**
1. Note contains both problem + item keywords
2. Keywords match patterns in `incompleteDetector.js`
3. No DB errors in console

**Debug:**
```javascript
const needs = extractNeeds(note);
console.log('Detected needs:', needs);
```

### Service Task Not Created

**Check:**
1. `install_tasks` table exists
2. Foreign key constraints allow service tasks
3. Console logs: `[COMPLETE] Incomplete items processed`

**Verify:**
```sql
SELECT * FROM install_tasks 
WHERE type = 'service' 
AND status = 'hold' 
ORDER BY created_at DESC;
```

### No Slack Notification

**Check:**
1. `.env` has `N8N_OPS_STATUS_WEBHOOK` set
2. Webhook URL is accessible
3. Console: `[INCOMPLETE] Slack notification failed`

## Best Practices

1. **Train Techs:** Encourage clear, structured completion notes
2. **Review Regularly:** Check `/incomplete` page daily
3. **Fast Purchasing:** Process pending items quickly
4. **Reschedule Promptly:** Move service tasks from HOLD when parts arrive
5. **Close Loop:** Always resolve incomplete jobs when done

## Future Enhancements

- [ ] AI-powered item detection (GPT/Claude API)
- [ ] Auto-match items to catalog/inventory
- [ ] Customer notification when parts on order
- [ ] SLA tracking for incomplete job resolution
- [ ] Analytics: most common missing items
