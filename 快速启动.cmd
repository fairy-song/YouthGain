@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-youthgain.ps1" %*
set "START_RESULT=%ERRORLEVEL%"
if not "%START_RESULT%"=="0" if "%~1"=="" pause
exit /b %START_RESULT%
