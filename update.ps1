Write-Host "Student OS — updating..." -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path "package.json")) {
    Write-Host "package.json not found here. Move this script into the same folder as package.json and run it again." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed - see the error above." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host "Building the app..." -ForegroundColor Yellow
npm run dist
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed - see the error above." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$installer = Get-ChildItem -Path "dist" -Filter "*.exe" | Select-Object -First 1
if ($installer) {
    Write-Host ""
    Write-Host "Done! Launching the installer..." -ForegroundColor Green
    Start-Process $installer.FullName
} else {
    Write-Host "Build finished but no installer was found in dist\ - check the output above." -ForegroundColor Red
}

Read-Host "Press Enter to close"
