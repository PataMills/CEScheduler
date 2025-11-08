$ErrorActionPreference = "Stop"

# ---- CONFIG ----
$base = "http://localhost:3000"
$salesEmail = "wgminter@hotmail.com"        # real sales or admin user
$salesPass  = "12345678"        # real password

# IDs from your DB
$numericJobId   = 1
$installJobId   = "001863ea63ad"
$goodBidId      = 36

# Session to persist cookies
$S = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function CheckJson($name, $resp) {
  if ($resp.StatusCode -ge 400) { throw "$name failed: $($resp.StatusCode) $($resp.Content)" }
  try { $j = $resp.Content | ConvertFrom-Json } catch { throw "${name}: invalid JSON" }
  Write-Host "• ${name}: OK"
  return $j
}

Write-Host "== Sales Smoke =="

# 1) Login
$loginResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method POST `
  -Uri "$base/api/auth/login" `
  -Headers @{ Accept = "application/json"; "X-Requested-With" = "XMLHttpRequest" } `
  -ContentType "application/json" `
  -Body (@{ email=$salesEmail; password=$salesPass } | ConvertTo-Json)
CheckJson "login" $loginResp | Out-Null

# 2) Sales Home recent bids
$recentResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/bids/recent"
CheckJson "bids recent" $recentResp | Out-Null

# 3) Bid details & totals
$detailsResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/bids/$goodBidId/details"
CheckJson "bid details" $detailsResp | Out-Null

$totalsResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/bids/$goodBidId/totals"
CheckJson "bid totals" $totalsResp | Out-Null

# 4) Jobs API — numeric and text IDs
$jobNumResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/jobs/$numericJobId"
CheckJson "job by numeric id" $jobNumResp | Out-Null

$jobInstallResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/jobs/$installJobId"
CheckJson "job by install id" $jobInstallResp | Out-Null

$resResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/jobs/$numericJobId/resources"
CheckJson "job resources" $resResp | Out-Null

# 5) Availability alias
$today = (Get-Date).ToString("yyyy-MM-dd")
$availResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET `
  -Uri "$base/api/sales/check-availability?date=$today&start=09:00&duration=120"
CheckJson "sales check-availability" $availResp | Out-Null

# 6) Create service task alias
$srBody = @{
  job_id         = $installJobId
  summary        = "Verify door alignment before install"
  files          = @()
  created_by     = $salesEmail
  preferred_start= "2025-11-12T09:00:00Z"
  preferred_end  = "2025-11-12T12:00:00Z"
  contact_name   = "Jane Homeowner"
  contact_phone  = "555-123-4567"
}
$createResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method POST `
  -Uri "$base/api/sales/create-service-task" `
  -ContentType "application/json" `
  -Body ($srBody | ConvertTo-Json)
CheckJson "sales create-service-task" $createResp | Out-Null

Write-Host "✅ Sales smoke passed"
