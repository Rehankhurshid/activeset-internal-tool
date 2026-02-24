$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host ""
Write-Host "ActiveSet Local Screenshot Runner Installer"
Write-Host "-------------------------------------------"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required (v20+). Install it first: https://nodejs.org/"
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required. Install Node.js with npm included."
}

$nodeVersion = node -p "process.versions.node"
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) {
  throw "Node.js v20+ is required. Current: v$nodeVersion"
}

Write-Host "Installing dependencies..."
npm install

$userBin = Join-Path $HOME ".activeset\bin"
New-Item -ItemType Directory -Path $userBin -Force | Out-Null

$launcherCmd = Join-Path $userBin "activeset-capture.cmd"
$launcherPs1 = Join-Path $userBin "activeset-capture.ps1"

$cmdContent = @"
@echo off
cd /d "$ScriptDir"
npm run capture:wizard -- %*
"@
Set-Content -Path $launcherCmd -Value $cmdContent -Encoding ASCII

$ps1Content = @"
Set-Location "$ScriptDir"
npm run capture:wizard -- `$args
"@
Set-Content -Path $launcherPs1 -Value $ps1Content -Encoding UTF8

$currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $currentUserPath) {
  $currentUserPath = ""
}

if ($currentUserPath -notlike "*$userBin*") {
  $newPath = if ([string]::IsNullOrWhiteSpace($currentUserPath)) { $userBin } else { "$currentUserPath;$userBin" }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Write-Host "Added $userBin to User PATH."
}

Write-Host ""
Write-Host "Installed."
Write-Host ""
Write-Host "Next steps:"
Write-Host "1) Open a new PowerShell terminal"
Write-Host "2) Run: activeset-capture"
Write-Host ""
Write-Host "If command is not recognized, run directly:"
Write-Host "  & '$launcherPs1'"
