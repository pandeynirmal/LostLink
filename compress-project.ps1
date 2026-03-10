# Quick Compression Script for LostLink Project
# Run this from the parent directory that contains 'submission_final'

$ErrorActionPreference = "Stop"

Write-Host "====================================="
Write-Host "LostLink Project Compression"
Write-Host "====================================="
Write-Host ""

$Source = ".\submission_final"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$ZipPath = ".\LostLink_Project_$Timestamp.zip"

if (!(Test-Path $Source)) {
    Write-Host "ERROR: Source folder not found: $Source" -ForegroundColor Red
    exit 1
}

Write-Host "Compressing: $Source"
Write-Host "Output:      $ZipPath"
Write-Host ""

Write-Host "Creating zip archive..."
Compress-Archive -Path $Source -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "====================================="
Write-Host "✓ Compression completed!" -ForegroundColor Green
Write-Host "====================================="
Write-Host ""

# Show zip size
$zipSize = (Get-Item $ZipPath).Length / 1MB
Write-Host "Zip file size: $([math]::Round($zipSize, 2)) MB"
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
