# Quick Start: Testing Incomplete Jobs Feature

## 🚀 Fastest Way to Test (5 minutes)

### Step 1: Fix app.js manually

Open `app.js` and find around line 57-58 where you see:
```javascript
import remindersRouter from "./routes/reminders.js";`nimport incompleteRouter from "./routes/incomplete.js";
import incompleteRouter from "./routes/incomplete.js";
```

**Replace with:**
```javascript
import remindersRouter from "./routes/reminders.js";
import incompleteRouter from "./routes/incomplete.js";
import registerIncompletePage from "./pages/incomplete.js";
```

### Step 2: Register the page

Find around line 191 where you see:
```javascript
registerSchedulePage(app);
```

**Add right after it:**
```javascript
registerIncompletePage(app);
```

### Step 3: Fix the router mount (if needed)

Find around line 133 where you see router mounts. Make sure you have:
```javascript
app.use("/api/reminders", remindersRouter);
app.use("/api/incomplete", incompleteRouter);
```

(Remove any backtick-n characters if you see them)

### Step 4: Restart server

```powershell
cd "C:\Users\wgmin\Scheduler Project\cabinet-manufacturing-api"
npm start
```

### Step 5: Test the API (No integration needed yet!)

Open PowerShell and run:

```powershell
# Test 1: Check if API endpoint works
Invoke-RestMethod -Uri "http://localhost:3000/api/incomplete"
```

**Expected:** Empty array `[]` or existing incomplete jobs

```powershell
# Test 2: Access the UI
Start-Process "http://localhost:3000/incomplete"
```

**Expected:** Page opens showing "No incomplete jobs" or existing jobs

---

## 📝 Simple Manual Test (Without modifying tasks.js)

You can test the system by directly calling the incomplete detection functions:

### PowerShell Test Script:

```powershell
$baseUrl = "http://localhost:3000"

# Directly create a test incomplete event (bypassing task completion)
# This simulates what would happen when the integration is added

$testJobId = 1  # Use any valid job ID from your database

# Create test data
$testData = @{
    needs = @(
        @{ item_name = "Cabinet Door B36"; reason = "reported_missing" },
        @{ item_name = "Shelf for upper"; reason = "reported_missing" },
        @{ item_name = "3 pieces of scribe"; reason = "reported_missing" }
    )
    note = "Missing: Cabinet Door B36, Shelf for upper, 3 pieces of scribe"
}

Write-Host "Creating test incomplete job..." -ForegroundColor Cyan

# Insert directly into database (requires SQL access) OR
# Just check the UI to see structure

# Check the incomplete API
try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/incomplete"
    Write-Host "Found $($result.Count) incomplete job(s)" -ForegroundColor Green
    $result | ForEach-Object {
        Write-Host "  Job #$($_.job_id): $($_.customer_name)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}

# Open UI
Start-Process "$baseUrl/incomplete"
Write-Host "`nOpened /incomplete page in browser" -ForegroundColor Green
```

---

## 🎯 What You Should See

### In the Browser (`/incomplete`):

**If there are NO incomplete jobs yet:**
```
Incomplete Jobs
Jobs marked complete but with missing or defective items

[ 🔄 Refresh button ]

✓ No incomplete jobs. All tasks completed successfully!
```

**If there ARE incomplete jobs:**
```
Incomplete Jobs
Jobs marked complete but with missing or defective items

╔══════════════════════════════════════════╗
║ John Doe - Job #123                      ║
║ Last reported: Oct 21, 2:30 PM           ║
║                                           ║
║ Missing/Needed Items (3):                ║
║ • Cabinet Door B36                       ║
║ • Shelf for upper cabinet                ║
║ • 3 pieces of scribe                     ║
║                                           ║
║ Purchase Queue (3):                      ║
║ Cabinet Door B36    [Pending]            ║
║ Shelf for upper     [Pending]            ║
║ 3 pieces of scribe  [Pending]            ║
║                                           ║
║ Service Tasks (1):                       ║
║ Service – Missing Items  [Hold]          ║
║                                           ║
║         [View Details] [✓ Resolve]       ║
╚══════════════════════════════════════════╝
```

---

## 🔌 Next Step: Full Integration

Once you verify the UI and API work, you'll add ONE line to integrate with task completion:

### File: `routes/tasks.js`

**Find the completion endpoint** (around line 380-430):
```javascript
router.post("/:id/complete", async (req, res) => {
  // ... existing code ...
  const out = await writeEventAndStatus(id, "complete", "complete", payload, "tech");
  console.log("[COMPLETE OK]", out);
  
  // ADD THIS BLOCK HERE:
  // --- Auto-detect incomplete items ---
  try {
    const { extractNeeds, processIncompleteItems, notifyIncomplete } = await import("../utils/incompleteDetector.js");
    const needs = extractNeeds(note);
    if (needs.length > 0) {
      const result = await processIncompleteItems(id, out.job_id, note, needs);
      await notifyIncomplete(id, out.job_id, out.customer_name, needs, result.service_task_id);
      console.log('[COMPLETE] Detected', needs.length, 'incomplete items');
    }
  } catch (e) {
    console.error('[COMPLETE] Incomplete detection failed:', e);
  }
  
  // ---- Forward to n8n for Slack #ops-status
  try {
    // ... rest of existing code ...
```

---

## 📊 Quick Verification Checklist

- [ ] Server starts without errors
- [ ] `/incomplete` page loads
- [ ] API endpoint `/api/incomplete` returns JSON
- [ ] No console errors in browser
- [ ] Can click View Details button (opens new tab)
- [ ] Can click Resolve button (shows prompt)

Once all checked, you're ready to add the task completion integration!

---

## 🆘 Troubleshooting

### Error: "Cannot find module './pages/incomplete.js'"
→ Check that `pages/incomplete.js` file exists
→ Verify import path is correct

### Error: "registerIncompletePage is not a function"
→ Check that you added `import registerIncompletePage` line
→ Verify the function is exported in `pages/incomplete.js`

### Page shows "Error loading incomplete jobs"
→ Check console in browser (F12)
→ Check server logs for API errors
→ Verify database tables exist (job_events, purchase_queue, install_tasks)

### Empty page (no incomplete jobs)
→ This is normal if no jobs have been marked incomplete yet!
→ System only shows jobs where completion notes mentioned missing items

---

## 📞 Need More Help?

Check the full testing guide: `docs/TESTING_INCOMPLETE_JOBS.md`

Or create a test incomplete job manually in the database:
```sql
-- Create test incomplete event
INSERT INTO public.job_events (job_id, event_type, payload, created_by)
VALUES (1, 'incomplete', '{"needs":[{"item_name":"Test Item"}],"note":"Test"}', 'system');
```

Then refresh `/incomplete` page!
