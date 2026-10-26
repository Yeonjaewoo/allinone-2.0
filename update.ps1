[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Stop'

$currentDir = $PSScriptRoot
if (-not $currentDir) { $currentDir = (Get-Location).Path }

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   치지직 클린 (Chzzk Clean) 자동 업데이트" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 로컬 버전 확인
$localVersion = "알 수 없음"
$manifestPath = if (Test-Path (Join-Path $currentDir "manifest.json")) {
    Join-Path $currentDir "manifest.json"
} elseif (Test-Path (Join-Path $currentDir "dist\manifest.json")) {
    Join-Path $currentDir "dist\manifest.json"
} else {
    $null
}

if ($manifestPath) {
    try {
        $json = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($json.version) { $localVersion = $json.version }
    } catch {}
}

Write-Host "[*] 현재 설치된 버전: v$localVersion" -ForegroundColor White
Write-Host "[*] GitHub에서 최신 버전 정보를 확인하는 중..." -ForegroundColor Yellow

# 2. 원격 최신 버전 확인 (raw manifest.json)
$remoteVersion = $null
try {
    $remoteManifestUrl = "https://raw.githubusercontent.com/Yeonjaewoo/allinone-2.0/main/dist/manifest.json"
    $remoteJsonRaw = (New-Object System.Net.WebClient).DownloadString($remoteManifestUrl)
    $remoteJson = $remoteJsonRaw | ConvertFrom-Json
    if ($remoteJson.version) {
        $remoteVersion = $remoteJson.version
    }
} catch {}

# 3. 버전 비교 검사
if ($remoteVersion) {
    Write-Host "[*] 최신 릴리즈 버전: v$remoteVersion" -ForegroundColor White
    
    if ($localVersion -ne "알 수 없음" -and $localVersion -eq $remoteVersion) {
        Write-Host ""
        Write-Host "========================================================" -ForegroundColor Green
        Write-Host "  [*] 현재 이미 최신 버전(v$localVersion)을 사용 중입니다!" -ForegroundColor Green
        Write-Host "      새로운 업데이트가 없습니다." -ForegroundColor White
        Write-Host "========================================================" -ForegroundColor Green
        exit 0
    } else {
        Write-Host ""
        Write-Host "[!] 새로운 업데이트(v$remoteVersion)를 발견했습니다!" -ForegroundColor Cyan
        Write-Host "[*] 최신 패키지를 다운로드합니다..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[*] 버전 확인 불가. 최신 패키지 다운로드를 시도합니다..." -ForegroundColor Yellow
}

# 4. 최신 패키지 다운로드 및 압축 해제
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

    $finalVersion = if ($remoteVersion) { $remoteVersion } else { "최신" }
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  [성공] 치지직 클린 v$finalVersion 업데이트가 완료되었습니다!" -ForegroundColor Green
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
    exit 1
}
