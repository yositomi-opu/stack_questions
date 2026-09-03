@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%..\.."
set "COMMAND=%~1"
if "%COMMAND%"=="" set "COMMAND=status"

where py >nul 2>nul
if !ERRORLEVEL! EQU 0 (
  py -3 "%REPO_ROOT%\scripts\mcq-webapp.py" "%COMMAND%"
  exit /b !ERRORLEVEL!
)
where python >nul 2>nul
if !ERRORLEVEL! EQU 0 (
  python "%REPO_ROOT%\scripts\mcq-webapp.py" "%COMMAND%"
  exit /b !ERRORLEVEL!
)
echo Python 3.10 以降が見つかりません。
exit /b 1
