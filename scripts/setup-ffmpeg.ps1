# Downloads FFmpeg + ffprobe (Gyan.dev essentials build), extracts them,
# and renames to Tauri 2 sidecar convention. Required before building from source.
#
# Usage:
#   pwsh scripts/setup-ffmpeg.ps1
#   or
#   powershell -ExecutionPolicy Bypass -File scripts/setup-ffmpeg.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $repoRoot "src-tauri\binaries"
$triple = "x86_64-pc-windows-msvc"
$ffmpegDest = Join-Path $binDir "ffmpeg-$triple.exe"
$ffprobeDest = Join-Path $binDir "ffprobe-$triple.exe"

if ((Test-Path $ffmpegDest) -and (Test-Path $ffprobeDest)) {
    Write-Host "FFmpeg sidecars already present at:" -ForegroundColor Green
    Write-Host "  $ffmpegDest"
    Write-Host "  $ffprobeDest"
    Write-Host "Remove them first if you want to refresh."
    exit 0
}

New-Item -ItemType Directory -Path $binDir -Force | Out-Null

$tempDir = Join-Path $env:TEMP "shorts-maker-ffmpeg-setup"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$zipPath = Join-Path $tempDir "ffmpeg.zip"

Write-Host "Downloading FFmpeg essentials from gyan.dev (~100 MB)..." -ForegroundColor Cyan
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "Downloaded $sizeMB MB" -ForegroundColor Green

Write-Host "Extracting..." -ForegroundColor Cyan
Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force

$extractedBin = Get-ChildItem -Path $tempDir -Directory |
    Where-Object { $_.Name -like "ffmpeg-*" } |
    Select-Object -First 1 |
    ForEach-Object { Join-Path $_.FullName "bin" }

if (-not (Test-Path $extractedBin)) {
    Write-Error "Could not find extracted bin directory inside $tempDir"
    exit 1
}

Copy-Item (Join-Path $extractedBin "ffmpeg.exe") $ffmpegDest -Force
Copy-Item (Join-Path $extractedBin "ffprobe.exe") $ffprobeDest -Force

Remove-Item $tempDir -Recurse -Force

Write-Host ""
Write-Host "Done. FFmpeg sidecars ready:" -ForegroundColor Green
Write-Host "  $ffmpegDest"
Write-Host "  $ffprobeDest"
Write-Host ""
Write-Host "You can now run: pnpm tauri dev" -ForegroundColor Cyan
