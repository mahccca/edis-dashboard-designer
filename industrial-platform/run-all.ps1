# Startup script for Industrial Visual Platform
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$localAppData = $env:LOCALAPPDATA
$pgData = Join-Path $localAppData "ip-pgsql\data"
$pgBin = Join-Path $localAppData "ip-pgsql\pgsql\bin\postgres.exe"

# 1. Start PostgreSQL if not already running
$pgPidFile = Join-Path $pgData "postmaster.pid"
$pgRunning = $false
if (Test-Path $pgPidFile) {
    $firstLine = (Get-Content $pgPidFile -TotalCount 1).Trim()
    if ($firstLine -match "^\d+$" -and (Get-Process -Id ([int]$firstLine) -ErrorAction SilentlyContinue)) {
        $pgRunning = $true
        Write-Host "PostgreSQL is already running (PID: $firstLine)." -ForegroundColor Green
    } else {
        Remove-Item $pgPidFile -Force -ErrorAction SilentlyContinue
    }
}

if (-not $pgRunning) {
    Write-Host "Starting Portable PostgreSQL on port 55432..." -ForegroundColor Cyan
    Start-Process -FilePath $pgBin -ArgumentList "-D `"$pgData`" -p 55432" -WindowStyle Hidden
    Start-Sleep -Seconds 2
}

# 2. Start Backend
Write-Host "Starting Backend on http://127.0.0.1:8000..." -ForegroundColor Cyan
$backendDir = Join-Path $root "backend"
$pythonExe = Join-Path $root ".venv\Scripts\python.exe"
Start-Process -FilePath $pythonExe -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -WorkingDirectory $backendDir

# 3. Start Frontend
Write-Host "Starting Frontend on http://localhost:5180..." -ForegroundColor Cyan
$frontendDir = Join-Path $root "frontend"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $frontendDir

Write-Host "`nIndustrial Platform launched successfully!" -ForegroundColor Green
Write-Host "Studio:  http://localhost:5180/"
Write-Host "Runtime: http://localhost:5180/runtime.html?site=darkhoveyn&path=/plant/overview"
Write-Host "Backend: http://127.0.0.1:8000/docs"
Write-Host "Login:   admin / admin12345678"

