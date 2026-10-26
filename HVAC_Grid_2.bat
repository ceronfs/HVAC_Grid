@echo off
rem HVAC Grid 2.0 (development version, app2/) - double-click to start. The 1.x program is HVAC_Grid.bat.
rem Opens in its own window like a desktop program; closing the window stops it.
rem   HVAC_Grid_2.bat [port]            normal start (no console window)
rem   HVAC_Grid_2.bat console [port]    with a console window that shows what happens (for checking problems)
rem Node.js: runtime\node.exe next to this file when there is one (the copy for a closed network), else node on PATH.
chcp 65001 >nul
cd /d "%~dp0"
set "HG_NODE=node"
if exist "%~dp0runtime\node.exe" set "HG_NODE=%~dp0runtime\node.exe"
if exist "%~dp0runtime\node.exe" goto run
where node >nul 2>nul
if not errorlevel 1 goto run
echo Node.js 20 이상이 필요합니다: https://nodejs.org 에서 설치한 뒤 다시 실행하세요.
pause
exit /b 1
:run
if /i not "%~1"=="console" goto hidden
title HVAC Grid 2.0
"%HG_NODE%" tools\launch.cjs %2 --console --v2
pause
exit /b
:hidden
start "" wscript //nologo //B "%~dp0tools\start-hidden.vbs" %* --v2
exit /b
