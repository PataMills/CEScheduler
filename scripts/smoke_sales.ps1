$ErrorActionPreference = "Stop"

# Update these IDs to match real records in your environment before running.
$numericJobId = 1            # public.jobs.id (integer)
$installJobId = "001863ea63ad"  # public.install_jobs.id (text)
$goodBidId = 36              # public.bids.id

if (-not (Test-Path "scripts")) {
  throw "Run this script from the project root (where package.json lives)."
}

function Check($name, $method, $url, $body = $null) {
  Write-Host "• $name => $url"
  if ($body) {
    $resp = Invoke-WebRequest -UseBasicParsing -Method $method -Uri $url -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 6)
  }
  else {
    $resp = Invoke-WebRequest -UseBasicParsing -Method $method -Uri $url
  }
  if ($resp.StatusCode -ge 400) {
    throw "$name failed: $($resp.StatusCode) $($resp.Content)"
  }
  return $resp.Content
}

$base = "http://localhost:3000"

# 1) Sales Home recent bids
Check "bids recent" "GET" "$base/api/bids/recent" | Out-Null

# 2) Bid details & totals (Sales Console/Quote rely on these)
Check "bid details" "GET" "$base/api/bids/$goodBidId/details" | Out-Null
Check "bid totals (GET)" "GET" "$base/api/bids/$goodBidId/totals" | Out-Null

# 3) Jobs API — numeric (production) and text (install) IDs
Check "job by numeric id" "GET" "$base/api/jobs/$numericJobId" | Out-Null
Check "job by install id" "GET" "$base/api/jobs/$installJobId" | Out-Null
Check "job resources" "GET" "$base/api/jobs/$numericJobId/resources" | Out-Null

# 4) Availability alias used by Sales service scheduling
$today = (Get-Date).ToString("yyyy-MM-dd")
Check "sales check-availability" "GET" "$base/api/sales/check-availability?date=$today&start=09:00&duration=120" | Out-Null

# 5) Create service task alias (forwards to /api/services)
$srBody = @{
  job_id          = $installJobId
  summary         = "Verify door alignment before install"
  files           = @()
  created_by      = "sales@patagoniamills.com"
  preferred_start = "2025-11-12T09:00:00Z"
  preferred_end   = "2025-11-12T12:00:00Z"
  contact_name    = "Jane Homeowner"
  contact_phone   = "555-123-4567"
}
Check "sales create-service-task" "POST" "$base/api/sales/create-service-task" $srBody | Out-Null

Write-Host "✅ Sales smoke passed"
