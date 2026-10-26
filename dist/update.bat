@echo off
chcp 65001 > nul
title 치지직 클린 확장프로그램 자동 업데이트

echo ========================================================
echo   치지직 클린 (Chzzk Clean) 자동 업데이트
echo ========================================================
echo.

:: 현재 스크립트가 위치한 폴더로 이동
cd /d "%~dp0"

:: 1. Git이 설치되어 있는 경우 (git pull 시도)
where git >nul 2>&1
if %errorlevel% equ 0 (
    if exist ".git" (
        echo [*] Git을 감지했습니다. 최신 버전을 동기화합니다...
        git pull origin main
        if %errorlevel% equ 0 (
            goto SUCCESS
        ) else (
            echo [!] Git pull 실패. 웹 직접 다운로드 방식으로 전환합니다...
            echo.
        )
    )
)

:: 2. Git이 없거나 pull 실패 시 GitHub ZIP 직접 다운로드
echo [*] GitHub에서 최신 패키지를 다운로드합니다...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
  "$ProgressPreference = 'SilentlyContinue'; " ^
  "try { " ^
  "  Invoke-WebRequest -Uri 'https://github.com/Yeonjaewoo/allinone-2.0/archive/refs/heads/main.zip' -OutFile '%TEMP%\chzzk_update.zip'; " ^
  "  Write-Host '[*] 다운로드 완료' -ForegroundColor Cyan; " ^
  "} catch { " ^
  "  Write-Host '[!] 다운로드 실패: ' $_.Exception.Message -ForegroundColor Red; " ^
  "  exit 1; " ^
  "}"

if not exist "%TEMP%\chzzk_update.zip" (
    goto FAILED_DOWNLOAD
)

echo [*] 압축을 풀고 파일을 업데이트합니다...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProgressPreference = 'SilentlyContinue'; " ^
  "try { " ^
  "  Expand-Archive -Path '%TEMP%\chzzk_update.zip' -DestinationPath '%TEMP%\chzzk_temp' -Force; " ^
  "  Write-Host '[*] 압축 해제 완료' -ForegroundColor Cyan; " ^
  "} catch { " ^
  "  Write-Host '[!] 압축 해제 실패: ' $_.Exception.Message -ForegroundColor Red; " ^
  "  exit 1; " ^
  "}"

if not exist "%TEMP%\chzzk_temp\allinone-2.0-main" (
    goto FAILED_EXTRACT
)

:: dist 폴더 복사
xcopy /E /Y /Q "%TEMP%\chzzk_temp\allinone-2.0-main\dist\*" ".\dist\" > nul
xcopy /E /Y /Q "%TEMP%\chzzk_temp\allinone-2.0-main\update.bat" ".\update.bat*" > nul 2>&1

:: 임시 파일 정리
rmdir /S /Q "%TEMP%\chzzk_temp" > nul 2>&1
del /F /Q "%TEMP%\chzzk_update.zip" > nul 2>&1

:SUCCESS
echo.
echo ========================================================
echo   [성공] 업데이트에 성공했습니다!
echo.
echo   크롬(chrome://extensions) 페이지에서
echo   치지직 클린 카드의 [새로고침 🔄] 아이콘을 클릭하세요.
echo ========================================================
echo.
pause
exit /b 0

:FAILED_DOWNLOAD
echo.
echo ========================================================
echo   [실패] GitHub에서 패키지 다운로드에 실패했습니다.
echo   인터넷 연결을 확인해 주세요.
echo ========================================================
echo.
pause
exit /b 1

:FAILED_EXTRACT
echo.
echo ========================================================
echo   [실패] 다운로드한 파일의 압축을 해제하지 못했습니다.
echo ========================================================
echo.
pause
exit /b 1
