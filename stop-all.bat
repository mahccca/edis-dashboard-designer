@echo off
title Stop Industrial Visual Platform
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0industrial-platform\stop-all.ps1"
pause

