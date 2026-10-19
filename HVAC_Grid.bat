@echo off
rem HVAC Grid - double-click to start. Opens in its own window like a desktop program; closing the window stops it.
rem   HVAC_Grid.bat [port]            normal start (no console window)
rem   HVAC_Grid.bat console [port]    with a console window that shows what happens (for checking problems)
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 이상이 필요합니다: https://nodejs.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
if /i "%~1"=="console" (
  title HVAC Grid
  node tools\launch.cjs %2 --console
  pause
  exit /b
)
start "" wscript //nologo //B "%~dp0tools\start-hidden.vbs" %*
exit /b
