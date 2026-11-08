@echo off
REM Start Spotify Overlay Daemon in background
echo Starting Spotify Overlay Daemon...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$proc = Start-Process node -ArgumentList '\"%~dp0spotify-daemon.mjs\"' -WindowStyle Hidden -PassThru; if ($proc) { Write-Host 'Spotify Overlay Daemon started successfully (PID: ' $proc.Id ').' } else { Write-Error 'Failed to start daemon.' }"

pause
