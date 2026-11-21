# بارگذاری متغیرهای .env برای اجرای دستورات محلی در PowerShell
$envFile = Join-Path (Join-Path $PSScriptRoot '..') '.env'
if (-not (Test-Path $envFile)) { throw ".env not found" }
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#') -or $line -notmatch '^([A-Z0-9_]+)=(.*)$') { return }
  $name = $matches[1]
  $value = $matches[2].Trim()
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
