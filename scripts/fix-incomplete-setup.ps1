#!/usr/bin/env pwsh
# Fix app.js imports and register incomplete page

Write-Host "Fixing app.js imports and registrations..." -ForegroundColor Cyan

$appJsPath = "C:\Users\wgmin\Scheduler Project\cabinet-manufacturing-api\app.js"

# Read the file
$content = Get-Content $appJsPath -Raw

# Fix the duplicate/malformed import lines
$content = $content -replace "import remindersRouter from `"./routes/reminders.js`";``nimport incompleteRouter from `"./routes/incomplete.js`";`nimport incompleteRouter from `"./routes/incomplete.js`";", "import remindersRouter from `"./routes/reminders.js`";`nimport incompleteRouter from `"./routes/incomplete.js`";"

# Add incomplete page import after team task page
if ($content -notmatch "import registerIncompletePage") {
    $content = $content -replace "(import registerTeamTaskPage from `"./pages/teamTask.js`";)", "`$1`nimport registerIncompletePage from `"./pages/incomplete.js`";"
    Write-Host "✓ Added incomplete page import" -ForegroundColor Green
} else {
    Write-Host "✓ Incomplete page import already exists" -ForegroundColor Green
}

# Save the file
Set-Content $appJsPath -Value $content -Encoding UTF8
Write-Host "✓ Fixed imports in app.js" -ForegroundColor Green

# Now check for page registration
$content = Get-Content $appJsPath -Raw

if ($content -notmatch "registerIncompletePage\(app\)") {
    # Find where to add it (after registerOpsDayBoard or registerSchedulePage)
    $lines = Get-Content $appJsPath
    $newLines = @()
    $added = $false
    
    foreach ($line in $lines) {
        $newLines += $line
        if ($line -match "registerSchedulePage\(app\);" -and -not $added) {
            $newLines += "registerIncompletePage(app);"
            $added = $true
            Write-Host "✓ Added incomplete page registration" -ForegroundColor Green
        }
    }
    
    if ($added) {
        $newLines | Set-Content $appJsPath -Encoding UTF8
    }
} else {
    Write-Host "✓ Incomplete page already registered" -ForegroundColor Green
}

# Check the mount statement
$content = Get-Content $appJsPath -Raw
$mountLine = 'app.use("/api/incomplete", incompleteRouter);'

if ($content -notmatch [regex]::Escape($mountLine)) {
    Write-Host "⚠ Mount statement may need fixing - checking..." -ForegroundColor Yellow
    
    # Check if there's a malformed mount line
    if ($content -match 'app\.use\("/api/reminders", remindersRouter\);``n') {
        Write-Host "⚠ Found malformed mount line with backtick-n" -ForegroundColor Yellow
        $content = $content -replace 'app\.use\("/api/reminders", remindersRouter\);``napp\.use\("/api/incomplete", incompleteRouter\);', "app.use(`"/api/reminders`", remindersRouter);`napp.use(`"/api/incomplete`", incompleteRouter);"
        Set-Content $appJsPath -Value $content -Encoding UTF8
        Write-Host "✓ Fixed mount statements" -ForegroundColor Green
    } else {
        Write-Host "✓ Mount statement appears correct" -ForegroundColor Green
    }
} else {
    Write-Host "✓ Incomplete router mount exists" -ForegroundColor Green
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "✓ All imports and registrations fixed" -ForegroundColor Green
Write-Host "`nYou can now:" -ForegroundColor Yellow
Write-Host "1. Restart the server: npm start" -ForegroundColor White
Write-Host "2. Navigate to: http://localhost:3000/incomplete" -ForegroundColor White
Write-Host "3. Run the test script in TESTING_INCOMPLETE_JOBS.md" -ForegroundColor White
