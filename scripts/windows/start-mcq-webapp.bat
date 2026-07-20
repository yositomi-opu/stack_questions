@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"

where py >nul 2>nul
if !ERRORLEVEL! EQU 0 (
  py -3 "%SCRIPT_DIR%start-mcq-webapp.py"
  set "EXIT_CODE=!ERRORLEVEL!"
) else (
  where python >nul 2>nul
  if !ERRORLEVEL! NEQ 0 (
    echo Python 3.10 以降が見つかりません。
    echo https://www.python.org/downloads/windows/ からインストールしてください。
    set "EXIT_CODE=1"
  ) else (
    python "%SCRIPT_DIR%start-mcq-webapp.py"
    set "EXIT_CODE=!ERRORLEVEL!"
  )
)

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Enter キーを押すと終了します。
  pause >nul
)
exit /b %EXIT_CODE%
