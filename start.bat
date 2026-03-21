@echo off
setlocal enabledelayedexpansion

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Node.js not found. Install from: https://nodejs.org
  pause
  exit /b 1
)

cd /d "%~dp0"

if not exist .env (
  echo.
  echo [ERROR] .env file not found.
  echo.
  echo  1. Copy .env.example to .env
  echo  2. Set your DATABASE_URL in .env
  echo  3. Run start.bat again
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing packages...
  call npm install
  echo.
)

if exist data\.port del data\.port

echo Starting server...
start "Yoyaku-Server" /MIN node server.js

set PORT_URL=http://localhost:3636
for /L %%i in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  if exist data\.port (
    set /p FOUND_PORT=<data\.port
    set PORT_URL=http://localhost:!FOUND_PORT!
    goto :OPEN
  )
)

:OPEN
echo.
echo ============================
echo  Server ready: !PORT_URL!
echo ============================
echo.
start "" "!PORT_URL!"
echo Browser opened.
echo Close the "Yoyaku-Server" window to stop.
pause >nul
