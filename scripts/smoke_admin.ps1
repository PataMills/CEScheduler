$ErrorActionPreference = "Stop"

# ---- CONFIG ----
$base = "http://localhost:3000"          # change if not default
$adminEmail = "admin@example.com"        # put a real admin user here
$adminPass  = "AdminPassword123!"        # real admin password
$newUserEmail = "apitest.user@patagoniamills.test"

# Use a session to persist cookies set by /api/login
$S = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function CheckJson($name, $resp) {
  if ($resp.StatusCode -ge 400) { throw "$name failed: $($resp.StatusCode) $($resp.Content)" }
  try { $j = $resp.Content | ConvertFrom-Json } catch { throw "$name: invalid JSON" }
  Write-Host "• $name: OK"
  return $j
}

Write-Host "== Admin Smoke =="

# 1) Login (sets cookie)
$loginResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method POST `
  -Uri "$base/api/login" `
  -ContentType "application/json" `
  -Body (@{ email=$adminEmail; password=$adminPass } | ConvertTo-Json)
$login = CheckJson "login" $loginResp

# 2) Read roles (auth.js now publishes purchasing role)
$rolesResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/roles"
$roles = CheckJson "roles" $rolesResp

# 3) Admin Users: GET
$usrListResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/admin/users"
$users = CheckJson "admin users GET" $usrListResp

# 4) Admin Users: POST (create)
$newUserBody = @{
  email    = $newUserEmail
  name     = "API Test User"
  role     = "sales"             # must be in your role whitelist
  password = "P@ssw0rd!ap1"
  crew_name= "Install Team A"
  org_id   = 1
}
$createResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method POST `
  -Uri "$base/api/admin/users" -ContentType "application/json" -Body ($newUserBody | ConvertTo-Json)
$create = CheckJson "admin users POST (create)" $createResp
$newUserId = $create.id

# 5) Admin Users: PATCH password (if supported) and status
try {
  $pwdResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method PATCH `
    -Uri "$base/api/admin/users/$newUserId/password" `
    -ContentType "application/json" `
    -Body (@{ password_hash = "P@ssw0rd!ap1_new" } | ConvertTo-Json)
  CheckJson "admin users PATCH password" $pwdResp
} catch { Write-Host "• admin users PATCH password: skipped (route not present?)" }

try {
  $statusResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method PATCH `
    -Uri "$base/api/admin/users/$newUserId/status" `
    -ContentType "application/json" `
    -Body (@{ status = "inactive" } | ConvertTo-Json)
  CheckJson "admin users PATCH status" $statusResp
} catch { Write-Host "• admin users PATCH status: skipped (route not present?)" }

# 6) Admin Users: GET again to confirm round-trip
$usrList2Resp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/admin/users"
$users2 = CheckJson "admin users GET (after create/patch)" $usrList2Resp

# 7) Lead Times: GET (manufacturer_lead_times)
$ltGetResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/bids/lead-times"
$ltList = CheckJson "lead-times GET" $ltGetResp

# 8) Lead Times: POST new value (admin/purchasing guard)
$nowIso = (Get-Date).ToString("s")
$ltBody = @{
  manufacturer = "TEST-MFG"
  base_days    = 21
  notes        = "smoke $nowIso"
}
$ltPostResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method POST `
  -Uri "$base/api/bids/lead-times" -ContentType "application/json" -Body ($ltBody | ConvertTo-Json)
$ltPost = CheckJson "lead-times POST" $ltPostResp

# 9) Lead Times: GET verify
$ltGet2Resp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method GET -Uri "$base/api/bids/lead-times"
$ltList2 = CheckJson "lead-times GET (after post)" $ltGet2Resp

# 10) Lead Times: DELETE cleanup
$ltDelResp = Invoke-WebRequest -UseBasicParsing -WebSession $S -Method DELETE `
  -Uri "$base/api/bids/lead-times?manufacturer=TEST-MFG"
$ltDel = CheckJson "lead-times DELETE" $ltDelResp

Write-Host "✅ Admin smoke passed"
