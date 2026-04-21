@echo off
REM ─────────────────────────────────────────────────────────
REM  AI Error Monitor — Windows startup script
REM ─────────────────────────────────────────────────────────
title AI Error Monitor

echo.
echo   ◈ AI Error Monitor
echo   ───────────────────
echo.

SET SCRIPT_DIR=%~dp0
SET BACKEND=%SCRIPT_DIR%backend
SET FRONTEND=%SCRIPT_DIR%frontend

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Python not found. Install from https://python.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo   OK: %%i

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo   OK: Node %%i

echo.

REM Install Python deps
echo   Installing Python dependencies...
cd /d "%BACKEND%"
pip install -r requirements.txt -q
echo   OK: Python dependencies installed

REM Build frontend if needed
if not exist "%BACKEND%\static\index.html" (
    echo   Building React frontend...
    cd /d "%FRONTEND%"
    call npm install -q
    call npm run build
    echo   OK: Frontend built
) else (
    echo   OK: Frontend already built
)

REM Create .env if not exists
cd /d "%BACKEND%"
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo   OK: Created .env from .env.example
    )
)

echo.
echo   Starting server on http://localhost:8000
echo   Open http://localhost:8000 in your browser.
echo   Press Ctrl+C to stop.
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 8000
pause
