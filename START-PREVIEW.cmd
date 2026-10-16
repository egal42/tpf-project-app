@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or later, then run this file again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173/ in your browser.
echo LOCAL SIMULATION: no real login or payment. Close this window to stop.
node scripts/local-server.js --preview
pause
