@echo off
title Lexara - Starting Servers
echo.
echo  ========================================
echo     LEXARA - Starting All Servers
echo  ========================================
echo.

echo [1/2] Starting Backend Server (port 3000)...
start "Lexara Backend" cmd /k "cd /d %~dp0server && node src/index.js"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Client (port 5173)...
start "Lexara Frontend" cmd /k "cd /d %~dp0client && npx vite --port 5173"

echo.
echo  ========================================
echo     Both servers are starting!
echo     Backend:  http://localhost:3000
echo     Frontend: http://localhost:5173
echo  ========================================
echo.
timeout /t 3 /nobreak >nul
