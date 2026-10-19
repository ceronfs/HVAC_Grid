@echo off
rem HVAC Grid - double-click to start: local server + browser. Closing this window stops HVAC Grid.
chcp 65001 >nul
title HVAC Grid
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 이상이 필요합니다: https://nodejs.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
node tools\launch.cjs %*
if errorlevel 1 pause
