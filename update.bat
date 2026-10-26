@echo off
setlocal
cd /d "%~dp0"

if not exist "update.ps1" (
    echo [*] Downloading update script...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/Yeonjaewoo/allinone-2.0/main/update.ps1', 'update.ps1')"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "update.ps1"

echo.
pause
