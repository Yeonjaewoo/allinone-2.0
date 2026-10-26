@echo off
chcp 65001 >nul
setlocal
title 치지직 클린 자동 업데이트
cd /d "%~dp0"

echo ========================================================
echo   치지직 클린 (Chzzk Clean) 자동 업데이트
echo ========================================================
echo.

if not exist "update.ps1" (
    echo [*] 업데이트 스크립트를 다운로드하는 중...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/Yeonjaewoo/allinone-2.0/main/update.ps1', 'update.ps1')"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "update.ps1"

echo.
pause
