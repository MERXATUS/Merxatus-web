param(
  [int]$IntervalSeconds = 120,
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$WebDir = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

Set-Location $WebDir

# `.env`를 읽어서 ADMIN_TOKEN을 주입 (node --env-file 의존 제거)
$envPath = Join-Path $WebDir ".env"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    if ($line -notmatch "^(?<k>[A-Za-z_][A-Za-z0-9_]*)=(?<v>.*)$") { return }
    $k = $Matches["k"]
    $v = $Matches["v"].Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
  }
}

[System.Environment]::SetEnvironmentVariable("BOT_TICK_BASE_URL", $BaseUrl, "Process")

$logDir = Join-Path $WebDir "logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir ("bot-tick-" + (Get-Date -Format "yyyyMMdd") + ".log")

Add-Content $logFile ("=== bot tick loop start " + (Get-Date).ToString("s") + " interval=" + $IntervalSeconds + "s base=" + $BaseUrl + " ===")

while ($true) {
  $ts = Get-Date -Format "s"
  try {
    $out = node ".\scripts\bot-tick-once.mjs" 2>&1
    Add-Content $logFile ("[$ts] " + ($out -join " "))
  } catch {
    Add-Content $logFile ("[$ts] ERROR " + $_.Exception.Message)
  }
  Start-Sleep -Seconds $IntervalSeconds
}

