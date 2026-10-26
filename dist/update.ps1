[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Stop'

$currentDir = $PSScriptRoot
if (-not $currentDir) { $currentDir = (Get-Location).Path }

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   치지직 클린 (Chzzk Clean) 자동 업데이트" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[*] GitHub에서 최신 패키지를 다운로드합니다..." -ForegroundColor Yellow

$zipPath = Join-Path $env:TEMP "chzzk_clean_update.zip"
$tempFolder = Join-Path $env:TEMP "chzzk_clean_temp"

try {
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tempFolder) { Remove-Item $tempFolder -Recurse -Force -ErrorAction SilentlyContinue }

    $downloadUrl = "https://github.com/Yeonjaewoo/allinone-2.0/archive/refs/heads/main.zip"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
    Write-Host "[*] 다운로드 완료. 압축을 해제합니다..." -ForegroundColor Cyan

    Expand-Archive -Path $zipPath -DestinationPath $tempFolder -Force
    $extractedDist = Join-Path $tempFolder "allinone-2.0-main\dist"

    if (-not (Test-Path $extractedDist)) {
        throw "다운로드된 패키지 안에 dist 폴더가 없습니다."
    }

    Write-Host "[*] 최신 파일로 동기화하는 중..." -ForegroundColor Yellow

    if (Test-Path (Join-Path $currentDir "manifest.json")) {
        # dist 폴더 안에서 실행한 경우
        Copy-Item -Path (Join-Path $extractedDist "*") -Destination $currentDir -Recurse -Force
    } else {
        # 프로젝트 루트에서 실행한 경우
        $targetDist = Join-Path $currentDir "dist"
        if (-not (Test-Path $targetDist)) { New-Item -ItemType Directory -Path $targetDist | Out-Null }
        Copy-Item -Path (Join-Path $extractedDist "*") -Destination $targetDist -Recurse -Force
        Copy-Item -Path (Join-Path $tempFolder "allinone-2.0-main\update.bat") -Destination (Join-Path $currentDir "update.bat") -Force
        Copy-Item -Path (Join-Path $tempFolder "allinone-2.0-main\update.ps1") -Destination (Join-Path $currentDir "update.ps1") -Force
    }

    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $tempFolder -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  [성공] 치지직 클린 최신 버전 업데이트가 완료되었습니다!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  크롬(chrome://extensions) 페이지에서" -ForegroundColor White
    Write-Host "  치지직 클린 카드의 [새로고침 🔄] 아이콘을 클릭하세요." -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  [실패] 업데이트 중 오류가 발생했습니다." -ForegroundColor Red
    Write-Host "  원인: $($_.Exception.Message)" -ForegroundColor DarkRed
    Write-Host "  인터넷 연결을 확인하고 다시 실행해 주세요." -ForegroundColor Yellow
    Write-Host "========================================================" -ForegroundColor Red
}
