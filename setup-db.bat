@echo off
setlocal enabledelayedexpansion

set PSQL=D:\postgre\bin\psql.exe

echo.
echo ================================
echo  PostgreSQL DB Setup
echo ================================
echo.

set /p PGPASSWORD=PostgreSQL password (postgres user):

echo.
echo Creating database "yoyaku"...

set PGPASSWORD=!PGPASSWORD!
"!PSQL!" -U postgres -c "CREATE DATABASE yoyaku;" 2>&1

if %ERRORLEVEL% EQU 0 (
  echo [OK] Database created.
) else (
  echo [INFO] Already exists or check password.
)

echo.
echo Creating .env file...
(
  echo DATABASE_URL=postgresql://postgres:!PGPASSWORD!@localhost:5432/yoyaku
  echo PORT=3636
) > .env

echo [OK] .env created.
echo.
echo ================================
echo  Done! Run start.bat next.
echo ================================
echo.
pause
