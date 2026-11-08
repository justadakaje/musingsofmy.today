@echo off
REM Stop Spotify Overlay Daemon
echo Stopping Spotify Overlay Daemon...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$killed = 0; Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | ForEach-Object { if ($_.CommandLine -match 'spotify-daemon') { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Stopped Spotify Daemon PID:' $_.ProcessId; $killed++ } }; if ($killed -eq 0) { Write-Host 'No running Spotify Overlay Daemon found.' }"

pause
