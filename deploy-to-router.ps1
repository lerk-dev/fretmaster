$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FretMaster Router Deploy Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$RouterIP = "192.168.123.2"
$RouterUser = "root"
$RouterPass = "password"
$RemotePath = "/www/fretmaster"
$LocalDistPath = ".\dist-tauri"

Write-Host ""
Write-Host "[1/5] Checking build artifacts..." -ForegroundColor Yellow

if (-not (Test-Path $LocalDistPath)) {
    Write-Host "Error: dist directory not found. Please run 'npm run build' first." -ForegroundColor Red
    exit 1
}

$fileCount = (Get-ChildItem -Path $LocalDistPath -Recurse -File).Count
Write-Host "Found $fileCount files" -ForegroundColor Green

Write-Host ""
Write-Host "[2/5] Compressing dist directory..." -ForegroundColor Yellow
$zipPath = ".\fretmaster-deploy.zip"

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "$LocalDistPath\*" -DestinationPath $zipPath -CompressionLevel Optimal
$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "Compressed: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Green

Write-Host ""
Write-Host "[3/5] Uploading to router..." -ForegroundColor Yellow
Write-Host "Router: $RouterIP" -ForegroundColor Gray

try {
    $env:SSHPASS = $RouterPass
    sshpass -p $RouterPass scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL $zipPath "${RouterUser}@${RouterIP}:/tmp/"
    Write-Host "Upload successful" -ForegroundColor Green
} catch {
    Write-Host "Upload failed: $_" -ForegroundColor Red
    Write-Host "Please ensure:" -ForegroundColor Yellow
    Write-Host "  1. Router SSH service is enabled" -ForegroundColor Yellow
    Write-Host "  2. You can connect to router via SSH" -ForegroundColor Yellow
    Write-Host "  3. OpenSSH client is installed" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Trying alternative method with plink..." -ForegroundColor Yellow
    
    $plinkAvailable = Get-Command plink -ErrorAction SilentlyContinue
    if ($plinkAvailable) {
        echo y | plink -ssh ${RouterUser}@${RouterIP} -pw $RouterPass "mkdir -p $RemotePath"
        pscp -pw $RouterPass $zipPath "${RouterUser}@${RouterIP}:/tmp/"
        echo y | plink -ssh ${RouterUser}@${RouterIP} -pw $RouterPass "cd $RemotePath && unzip -o /tmp/fretmaster-deploy.zip && rm /tmp/fretmaster-deploy.zip && chmod -R 755 $RemotePath"
        Write-Host "Deployed successfully via plink/pscp" -ForegroundColor Green
    } else {
        Write-Host "Neither sshpass nor plink available. Please deploy manually." -ForegroundColor Red
        Write-Host "See ROUTER-DEPLOY.md for manual deployment instructions." -ForegroundColor Yellow
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

Write-Host ""
Write-Host "[4/5] Extracting on router..." -ForegroundColor Yellow

$extractCmd = "mkdir -p $RemotePath; cd $RemotePath; unzip -o /tmp/fretmaster-deploy.zip; rm /tmp/fretmaster-deploy.zip; chmod -R 755 $RemotePath"

try {
    sshpass -p $RouterPass ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=NUL ${RouterUser}@${RouterIP} $extractCmd
    Write-Host "Extraction complete" -ForegroundColor Green
} catch {
    Write-Host "Extraction failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[5/5] Cleaning up..." -ForegroundColor Yellow
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Write-Host "Cleanup complete" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deployment Successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Access URL:" -ForegroundColor Cyan
Write-Host "  HTTP:  http://${RouterIP}/fretmaster/" -ForegroundColor White
Write-Host ""
Write-Host "For microphone access, configure HTTPS (see ROUTER-DEPLOY.md)" -ForegroundColor Yellow
