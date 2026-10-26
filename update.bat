<# :
@echo off
setlocal
chcp 65001 >nul
title 치지직 클린 (Chzzk Clean) 자동 업데이트

:: PowerShell 호출 (자신을 파워쉘로 실행)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([System.IO.File]::ReadAllText('%~f0', [System.Text.Encoding]::UTF8))"

:: 스크립트 종료 후 창이 바로 닫히지 않도록 일시정지
echo.
pause
exit /b %ERRORLEVEL%
#>

# ========================================================
# 치지직 클린 자동 업데이트 파워쉘 스크립트
# ========================================================
$Host.UI.RawUI.WindowTitle = "치지직 클린 자동 업데이트"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   치지직 클린 (Chzzk Clean) 자동 업데이트" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$currentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $currentDir) { $currentDir = (Get-Location).Path }
Set-Location $currentDir

# 1. 만약 현재 폴더가 git 저장소 루트라면 git pull 먼저 시도
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd -and (Test-Path (Join-Path $currentDir ".git"))) {
    Write-Host "[*] Git 저장소가 감지되었습니다. git pull을 시도합니다..." -ForegroundColor Yellow
    try {
        & git pull origin main
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "========================================================" -ForegroundColor Green
            Write-Host "  [성공] 업데이트에 성공했습니다! (Git 최신 동기화 완료)" -ForegroundColor Green
            Write-Host ""
            Write-Host "  크롬(chrome://extensions)에서" -ForegroundColor White
            Write-Host "  치지직 클린 카드의 [새로고침 🔄] 아이콘을 클릭하세요." -ForegroundColor Yellow
            Write-Host "========================================================" -ForegroundColor Green
            exit 0
        }
    } catch {
        Write-Host "[!] Git pull 실패. 웹 직접 다운로드로 진행합니다." -ForegroundColor DarkYellow
    }
}

# 2. GitHub 최신 main.zip 직접 다운로드
Write-Host "[*] GitHub에서 최신 패키지를 다운로드합니다..." -ForegroundColor Yellow
$tempZip = Join-Path $env:TEMP "chzzk_clean_update.zip"
$tempExtract = Join-Path $env:TEMP "chzzk_clean_temp"

try {
    if (Test-Path $tempZip) { Remove-Item $tempZip -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue }

    $downloadUrl = "https://github.com/Yeonjaewoo/allinone-2.0/archive/refs/heads/main.zip"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing
    Write-Host "[*] 패키지 다운로드 완료!" -ForegroundColor Cyan
} catch {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  [실패] GitHub 패키지 다운로드에 실패했습니다." -ForegroundColor Red
    Write-Host "  오류 원인: $($_.Exception.Message)" -ForegroundColor DarkRed
    Write-Host "  인터넷 연결을 확인하고 다시 실행해 주세요." -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Red
    exit 1
}

# 3. 압축 해제
Write-Host "[*] 최신 파일 압축을 푸는 중..." -ForegroundColor Yellow
try {
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
    Write-Host "[*] 압축 해제 완료!" -ForegroundColor Cyan
} catch {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  [실패] 다운로드한 파일의 압축 해제에 실패했습니다." -ForegroundColor Red
    Write-Host "  오류 원인: $($_.Exception.Message)" -ForegroundColor DarkRed
    Write-Host "========================================================" -ForegroundColor Red
    exit 1
}

$extractedRoot = Join-Path $tempExtract "allinone-2.0-main"
$extractedDist = Join-Path $extractedRoot "dist"

if (-not (Test-Path $extractedDist)) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  [실패] 다운로드된 패키지에 dist 폴더가 없습니다." -ForegroundColor Red
    Write-Host "========================================================" -ForegroundColor Red
    exit 1
}

# 4. 파일 덮어쓰기
Write-Host "[*] 최신 파일로 업데이트하는 중..." -ForegroundColor Yellow

try {
    if (Test-Path (Join-Path $currentDir "manifest.json")) {
        # 사용자가 dist 폴더를 크롬에 등록하고 그 안에서 update.bat을 실행한 경우:
        Copy-Item -Path (Join-Path $extractedDist "*") -Destination $currentDir -Recurse -Force
    } else {
        # 프로젝트 루트에서 실행한 경우:
        $targetDist = Join-Path $currentDir "dist"
        if (-not (Test-Path $targetDist)) { New-Item -ItemType Directory -Path $targetDist | Out-Null }
        Copy-Item -Path (Join-Path $extractedDist "*") -Destination $targetDist -Recurse -Force
        Copy-Item -Path (Join-Path $extractedRoot "update.bat") -Destination (Join-Path $currentDir "update.bat") -Force
    }

    # 임시 파일 정리
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  [성공] 치지직 클린 업데이트가 완료되었습니다!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  크롬(chrome://extensions) 페이지에서" -ForegroundColor White
    Write-Host "  치지직 클린 카드의 [새로고침 🔄] 아이콘을 클릭하세요." -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Green
    exit 0
} catch {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  [실패] 파일 업데이트 중 오류가 발생했습니다." -ForegroundColor Red
    Write-Host "  오류 원인: $($_.Exception.Message)" -ForegroundColor DarkRed
    Write-Host "========================================================" -ForegroundColor Red
    exit 1
}
