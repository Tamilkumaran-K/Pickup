@echo off
title Pickup Native Desktop Client
echo ===================================================
echo   Pickup - Cross-Platform Peer-to-Peer File Drop
echo ===================================================
echo Starting native desktop client with silent auto-save to ~/Downloads/Pickup...
echo.
cd /d "%~dp0"
call npx electron packages/desktop/dist/main.js
