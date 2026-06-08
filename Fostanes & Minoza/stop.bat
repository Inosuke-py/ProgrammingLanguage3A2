@echo off
title Lexara - Stopping Servers
echo.
echo  ========================================
echo     LEXARA - Stopping All Servers
echo  ========================================
echo.

taskkill /F /FI "WINDOWTITLE eq Lexara Backend" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Lexara Frontend" >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo  All servers stopped.
echo.
timeout /t 2 /nobreak >nul
