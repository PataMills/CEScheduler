# Testing Guide: Incomplete Jobs Detection System

## Prerequisites

Before testing, ensure:
1. Server is running: `npm start`
2. Database is accessible
3. You have at least one test job in the system
4. (Optional) Slack webhook configured for notifications

## Step-by-Step Testing Guide

### Phase 1: Manual API Testing (No UI needed)

#### Test 1: Create a Test Job with Missing Items

**1. Complete a task with missing items in the note:**

```powershell
# PowerShell command to mark a task complete with missing items
$taskId = 123  # Replace with actual task ID from your database
$body = @{
    note = @"
Missing:
B36 Shelf
B34 Shelf
RW36 Shelf
4 pieces of scribe needed
Hardware, all drilled
W40 Door
BSFHD36 Door
The lazy susan doors don't work, they're too big
Lazy susan is not banded
"@
    when = (Get-Date).ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tasks/$taskId/complete" -Method POST -Body $body -ContentType "application/json"
```

**Expected Response:**
```json
{
  "task_id": 123,
  "job_id": 456,
  "customer_name": "John Doe",
  "status": "complete",
  ...
}
```

**What Happens Behind the Scenes:**
- System detects 9 missing items
- Creates 9 purchase_queue entries
- Creates 1 service task (status: HOLD)
- Logs 1 'incomplete' event in job_events
- Sends Slack notification (if webhook configured)

**2. Verify the detection worked:**

```powershell
# Check job events
Invoke-RestMethod -Uri "http://localhost:3000/api/incomplete" | ConvertTo-Json -Depth 5
```

**Expected Response:**
```json
[
  {
    "job_id": 456,
    "customer_name": "John Doe",
    "last_ts": "2025-10-21T15:30:00Z",
    "needs_list": [
      {
        "needs": [
          {"item_name": "B36 Shelf", "reason": "reported_missing"},
          {"item_name": "B34 Shelf", "reason": "reported_missing"},
          ...
        ],
        "note": "Missing:\nB36 Shelf...",
        "created_at": "2025-10-21T15:30:00Z"
      }
    ],
    "purchasing": [
      {"id": 1, "item_name": "B36 Shelf", "status": "pending"},
      ...
    ],
    "service_tasks": [
      {"task_id": 789, "name": "Service – Missing Items Follow-up", "status": "hold"}
    ]
  }
]
```

#### Test 2: Verify Purchase Queue Entries

```powershell
# Check purchase queue directly (requires SQL access)
# Or use the incomplete API which includes purchase status
Invoke-RestMethod -Uri "http://localhost:3000/api/incomplete/456"  # Use actual job_id
```

**Expected:** See all 9 items with status "pending"

#### Test 3: Verify Service Task Created

```powershell
# Check if service task was created
Invoke-RestMethod -Uri "http://localhost:3000/api/tasks" | ConvertTo-Json -Depth 3
```

**Expected:** Find a task with:
- Type: "service"
- Status: "hold"
- Name: "Service – Missing Items Follow-up"
- Notes: "Auto-created from task 123 completion..."

---

### Phase 2: UI Testing (Register Page First)

#### Setup: Register the Incomplete Page

**1. Add to app.js** (add these lines):

```javascript
// Near the top with other page imports
import registerIncompletePage from "./pages/incomplete.js";

// Near the bottom with other page registrations (around line 190)
registerIncompletePage(app);
```

**2. Restart server:**
```powershell
npm start
```

**3. Navigate to incomplete page:**
- Open browser: `http://localhost:3000/incomplete`
- Login if needed

#### Test 4: View Incomplete Jobs UI

**What You Should See:**

1. **Page Header:**
   - Title: "Incomplete Jobs"
   - Subtitle: "Jobs marked complete but with missing or defective items"
   - Refresh button

2. **Job Cards** (one per incomplete job):
   - Customer name (clickable link to bid)
   - Job number
   - Last reported timestamp
   - List of missing items (9 items from our test)
   - Purchase queue section showing pending items
   - Service tasks section showing HOLD task
   - Two buttons: "View Details" and "✓ Resolve"

3. **If No Incomplete Jobs:**
   - Should show: "✓ No incomplete jobs. All tasks completed successfully!"

#### Test 5: Test UI Actions

**A. View Details Button:**
```
Click "View Details" on a job card
→ Opens bid page in new tab
```

**B. Resolve Button:**
```
1. Click "✓ Resolve" on a job card
2. Enter resolution note in prompt: "All items received and installed"
3. Click OK
→ Job disappears from list
→ Purchase items marked as 'resolved'
→ Service tasks marked as 'complete'
```

---

### Phase 3: Integration Testing

#### Test 6: Integrate Detection into Task Completion

**1. Add detection to routes/tasks.js:**

Find the `router.post("/:id/complete"` endpoint and add this after `writeEventAndStatus`:

```javascript
// Add at top of file
import { extractNeeds, processIncompleteItems, notifyIncomplete } from "../utils/incompleteDetector.js";

// Inside router.post("/:id/complete") after writeEventAndStatus and before Slack notification:
const needs = extractNeeds(note);
if (needs.length > 0) {
  try {
    const result = await processIncompleteItems(id, out.job_id, note, needs);
    await notifyIncomplete(id, out.job_id, out.customer_name, needs, result.service_task_id);
    console.log('[COMPLETE] Detected and processed', needs.length, 'incomplete items');
  } catch (e) {
    console.error('[COMPLETE] Failed to process incomplete items:', e);
  }
}
```

**2. Test end-to-end:**

Now when ANY tech completes a task via:
- Mobile app
- Team task page
- API call

The system will automatically detect missing items.

#### Test 7: Real-World Scenario

**Scenario:** Installer completes kitchen install but notes missing items

1. **Installer marks task complete** with note:
   ```
   Installation completed except:
   Missing 2 cabinet doors for island
   Hardware for wall cabinets not delivered
   Countertop has a scratch, needs replacement
   ```

2. **System automatically:**
   - Detects 3 items
   - Creates purchase entries
   - Creates service task
   - Sends Slack alert

3. **Purchaser:**
   - Goes to `/purchasing` (or `/incomplete`)
   - Sees pending items
   - Orders replacement doors and hardware
   - Marks as "ordered"

4. **When parts arrive:**
   - Marks as "received"
   - (Optional: Auto-trigger service task)

5. **Scheduler:**
   - Goes to `/schedule` or `/incomplete`
   - Sees service task (HOLD)
   - Reschedules for next available slot

6. **Service tech:**
   - Installs missing items
   - Marks service task complete

7. **Office staff:**
   - Goes to `/incomplete`
   - Clicks "✓ Resolve"
   - Job removed from incomplete list

---

### Phase 4: Edge Case Testing

#### Test 8: Notes WITHOUT Missing Items

```powershell
$body = @{
    note = "Everything looks great! Customer is happy. All cabinets installed perfectly."
    when = (Get-Date).ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tasks/$taskId/complete" -Method POST -Body $body -ContentType "application/json"
```

**Expected:** 
- No incomplete event created
- No purchase entries
- No service task
- Job does NOT appear in `/incomplete`

#### Test 9: Ambiguous Notes

```powershell
$body = @{
    note = "Need to schedule follow-up visit for customer training"
    when = (Get-Date).ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/tasks/$taskId/complete" -Method POST -Body $body -ContentType "application/json"
```

**Expected:** 
- Should NOT trigger (no item keywords like "door", "shelf", etc.)
- Or might create 1 vague entry - this is acceptable, can be resolved manually

#### Test 10: Multiple Incomplete Events for Same Job

```powershell
# Complete task 1 with missing items
# Complete task 2 (same job) with different missing items

# Check /api/incomplete
```

**Expected:**
- Job appears once
- Both sets of items listed
- Multiple purchase entries
- Multiple service tasks possible

---

## What to Expect: Quick Reference

### ✅ Success Indicators

**In Console/Logs:**
```
[COMPLETE OK] { task_id: 123, ... }
[COMPLETE] Detected incomplete items: 9
[COMPLETE] Incomplete items processed: 9 purchase items, 1 service task created
```

**In Database:**
```sql
-- Check job_events
SELECT * FROM job_events WHERE event_type = 'incomplete' ORDER BY created_at DESC;

-- Check purchase_queue
SELECT * FROM purchase_queue WHERE status = 'pending' ORDER BY created_at DESC;

-- Check service tasks
SELECT * FROM install_tasks WHERE type = 'service' AND status = 'hold' ORDER BY created_at DESC;
```

**In UI:**
- `/incomplete` page shows job card
- Purchase items visible with "Pending" chips
- Service task visible with "Hold" chip

**In Slack:** (if webhook configured)
```
🔴 Incomplete: Task 123 (John Doe) - 9 items needed
Service task #789 created
```

### ❌ Failure Indicators

**Console Errors:**
```
[COMPLETE] Failed to process incomplete items: ...
[INCOMPLETE] Slack notification failed: ...
```

**Missing Data:**
- Job doesn't appear in `/incomplete`
- No purchase_queue entries
- No service task created

**Common Issues:**
- Import statement missing in tasks.js
- Database table doesn't exist (purchase_queue, install_tasks)
- Webhook URL invalid

---

## Quick Test Script

Run this complete test in PowerShell:

```powershell
# Complete test script
$baseUrl = "http://localhost:3000"
$taskId = 123  # Change to actual task ID

# 1. Complete task with missing items
Write-Host "Test 1: Completing task with missing items..." -ForegroundColor Cyan
$completeBody = @{
    note = @"
Missing:
- Cabinet door B36
- Shelf for upper cabinet
- 3 pieces of scribe
Hardware not delivered
"@
    when = (Get-Date).ToString("o")
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/tasks/$taskId/complete" -Method POST -Body $completeBody -ContentType "application/json"
    Write-Host "✓ Task completed: $($result.task_id)" -ForegroundColor Green
    $jobId = $result.job_id
} catch {
    Write-Host "✗ Failed to complete task: $_" -ForegroundColor Red
    exit
}

Start-Sleep -Seconds 2

# 2. Check incomplete jobs
Write-Host "`nTest 2: Checking incomplete jobs..." -ForegroundColor Cyan
try {
    $incomplete = Invoke-RestMethod -Uri "$baseUrl/api/incomplete"
    $jobCount = $incomplete.Count
    Write-Host "✓ Found $jobCount incomplete job(s)" -ForegroundColor Green
    
    if ($jobCount -gt 0) {
        $job = $incomplete[0]
        Write-Host "  - Job: $($job.customer_name) (#$($job.job_id))" -ForegroundColor Yellow
        Write-Host "  - Needs: $($job.needs_list.Count) event(s)" -ForegroundColor Yellow
        Write-Host "  - Purchasing: $($job.purchasing.Count) item(s)" -ForegroundColor Yellow
        Write-Host "  - Service tasks: $($job.service_tasks.Count)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Failed to get incomplete jobs: $_" -ForegroundColor Red
}

# 3. Test UI (open browser)
Write-Host "`nTest 3: Opening UI in browser..." -ForegroundColor Cyan
Start-Process "$baseUrl/incomplete"
Write-Host "✓ Browser opened to /incomplete page" -ForegroundColor Green

Write-Host "`n=== Test Complete ===" -ForegroundColor Green
Write-Host "Check the browser for the incomplete jobs UI"
Write-Host "Expected: Job card with missing items listed"
```

---

## Next Steps After Testing

1. **If Everything Works:**
   - Add link to admin navigation
   - Train staff on using `/incomplete` page
   - Set up automated Slack notifications
   - Document workflow in team handbook

2. **If Issues Found:**
   - Check console logs for errors
   - Verify database tables exist
   - Confirm imports in app.js and tasks.js
   - Test with simpler notes first

3. **Enhancements:**
   - Add auto-scheduling when parts received
   - Improve keyword detection
   - Add customer notifications
   - Create reports/analytics

Need help with any specific test? Let me know!
