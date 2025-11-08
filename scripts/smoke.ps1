$ErrorActionPreference = "Stop"

function Check($name, $url) {
  Write-Host "• $name => $url"
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url
  if ($response.StatusCode -ge 400) {
    throw "$name failed: $($response.StatusCode)"
  }
}

$base = "http://localhost:3000"

Check "health"          "$base/api/health"
Check "db health"       "$base/api/health/db"
Check "calendar events" "$base/api/calendar/events?timeMin=$(Get-Date).ToString('s')&timeMax=$(Get-Date).AddDays(1).ToString('s')"
Check "myday"           "$base/api/myday?date=$(Get-Date -Format yyyy-MM-dd)&crew=1"
Check "invitations"     "$base/api/admin/invitations"

Write-Host "✅ Smoke OK"
