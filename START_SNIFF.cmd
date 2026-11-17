@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\create-shortcuts.ps1" -OpenApp
if errorlevel 1 (pause) else (timeout /t 15)
endlocal
