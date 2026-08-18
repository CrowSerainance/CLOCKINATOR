# Starts the local-first Clockinator web app and opens the browser.
# Double-click: "Start Clockinator.bat" in the repo root or C:\Clockify.

$ErrorActionPreference = "Stop"
$Port = 5173
$Url = "http://localhost:$Port"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WebRoot = Join-Path $RepoRoot "apps\web"

function Test-LocalPort([int] $PortNumber) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $PortNumber, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(400)
    if ($ok -and $client.Connected) {
      $client.EndConnect($async)
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

$host.UI.RawUI.WindowTitle = "Clockinator"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed."
  Write-Host "Install LTS from https://nodejs.org then double-click this launcher again."
  exit 1
}

if (-not (Test-Path (Join-Path $WebRoot "package.json"))) {
  Write-Host "Could not find apps\web. Expected: $WebRoot"
  exit 1
}

Set-Location $WebRoot

if (-not (Test-Path "node_modules")) {
  Write-Host "First run: installing packages..."
  cmd /c "npm install"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (Test-LocalPort $Port) {
  Write-Host "Clockinator is already running. Opening $Url"
  Start-Process $Url
  exit 0
}

Write-Host "Starting Clockinator at $Url"
Write-Host "Leave this window open. Close it or press Ctrl+C to stop."
cmd /c "npm run start"
exit $LASTEXITCODE
