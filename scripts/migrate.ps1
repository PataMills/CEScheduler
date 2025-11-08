$ErrorActionPreference = "Stop"

# Load .env
$envPath = Join-Path (Get-Location) ".env"
if (-not (Test-Path $envPath)) {
  throw ".env file not found at $envPath"
}

$envVars = Get-Content $envPath | Where-Object { $_ -and $_ -notmatch "^#" }
foreach ($line in $envVars) {
  $pair = $line -split "=", 2
  if ($pair.Length -eq 2) {
    $key = $pair[0].Trim()
    $val = $pair[1].Trim()
    [System.Environment]::SetEnvironmentVariable($key, $val)
  }
}

if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL not set in .env"
}

Get-ChildItem -Path "migrations" -Filter "*.sql" | Sort-Object Name | ForEach-Object {
  Write-Host "↳ Running $($_.Name)"
  & psql "$env:DATABASE_URL" -v "ON_ERROR_STOP=1" -f $_.FullName
}

Write-Host "✅ Migrations complete"
