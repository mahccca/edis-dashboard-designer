@echo off
title Industrial Visual Platform Runner
cd /d "%~dp0"
echo ========================================================
echo   Starting Industrial Visual Platform (Postgres + Backend + Frontend)
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0industrial-platform\run-all.ps1"
pause
