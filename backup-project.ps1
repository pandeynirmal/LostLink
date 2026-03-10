# Backup script for LostLink Project
# Run this from the parent directory that contains 'submission_final'

$ErrorActionPreference = "Stop"

$Source = ".\submission_final"
$BackupRoot = ".\backups"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Destination = Join-Path $BackupRoot "Project_Backup_$Timestamp"
$ZipPath = "$Destination.zip"

Write-Host "====================================="
Write-Host "LostLink Project Backup Script"
Write-Host "====================================="
Write-Host ""

if (!(Test-Path $Source)) {
    Write-Host "ERROR: Source folder not found: $Source" -ForegroundColor Red
    exit 1
}

Write-Host "Source: $Source"
Write-Host "Backup Location: $Destination"
Write-Host ""

# Ensure backup root exists
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

Write-Host "Copying project files (excluding heavy/generated files)..."
Write-Host "Excluding: node_modules, .next, venv, .git, backups, pictures, .qoder, __pycache__"
Write-Host ""

# Copy project excluding heavy/generated files
robocopy $Source $Destination /E /NFL /NDL /NJH /NJS `
    /XD node_modules .next .git venv __pycache__ submission_clean backups pictures .qoder python_service\venv `
    /XF *.log nohup.out yolov8n.pt *.tmp .DS_Store

# Robocopy exit codes: 0-7 are success/warnings, 8+ are failures
if ($LASTEXITCODE -ge 8) {
    Write-Host "ERROR: Robocopy failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host "Creating zip archive..."
if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}
Compress-Archive -Path "$Destination\*" -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "====================================="
Write-Host "✓ Backup completed successfully!" -ForegroundColor Green
Write-Host "====================================="
Write-Host ""
Write-Host "Folder backup: $Destination"
Write-Host "Zip backup:    $ZipPath"
Write-Host ""

# Show sizes
$folderSize = (Get-ChildItem $Destination -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$zipSize = (Get-Item $ZipPath).Length / 1MB

Write-Host "Backup folder size: $([math]::Round($folderSize, 2)) MB"
Write-Host "Zip file size:      $([math]::Round($zipSize, 2)) MB"
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
