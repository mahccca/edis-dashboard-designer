# Stop script for Industrial Visual Platform
$ports = @(55432, 8000, 5180)
foreach ($port in $ports) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns.OwningProcess | Select-Object -Unique
            foreach ($p in $pids) {
                if ($p -gt 4) {
                    Write-Host "Stopping process PID $p on port $port..." -ForegroundColor Yellow
                    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } catch {}
}

# Clean postgres pid file if exists
$localAppData = $env:LOCALAPPDATA
$pgPidFile = Join-Path $localAppData "ip-pgsql\data\postmaster.pid"
if (Test-Path $pgPidFile) {
    Remove-Item $pgPidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "All Industrial Platform services stopped successfully." -ForegroundColor Green
