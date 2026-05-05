@echo off
REM 원클릭 로컬 개발 서버 (PowerShell npm.ps1 정책 문제 회피: cmd + npm.cmd)
cd /d "%~dp0"

REM 탐색기에서 더블클릭할 때 PATH에 Node가 없는 경우가 있어 흔한 설치 경로를 앞에 둠
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [dev] npm.cmd 을 PATH에서 찾지 못했어. Node.js LTS를 설치했는지 확인해.
  pause
  exit /b 1
)

set NEXT_DISABLE_TURBOPACK=1
echo [dev] %CD%
echo [dev] 봇 자동 틱은 .env 에 BOT_AUTO_TICK=1 일 때만 켜져 ^(선택^)
call npm.cmd run dev
