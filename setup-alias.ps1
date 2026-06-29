# PowerShell alias setup for quick commands
# Run this once: .\setup-alias.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SETTING UP QUICK ALIASES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create profile if it doesn't exist
if (!(Test-Path -Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force
    Write-Host "Created PowerShell profile at: $PROFILE" -ForegroundColor Green
}

# Add aliases to profile
$aliasContent = @"

# Wallet App Quick Aliases (Added by setup-alias.ps1)
function dev-android { & '.\dev.bat' }
Set-Alias -Name a -Value dev-android -Description "Build and open Android Studio"
Set-Alias -Name dev -Value dev-android -Description "Build and open Android Studio"

"@

# Check if aliases already exist
$profileContent = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
if ($profileContent -notlike "*dev-android*") {
    Add-Content -Path $PROFILE -Value $aliasContent
    Write-Host "✓ Added aliases to PowerShell profile" -ForegroundColor Green
} else {
    Write-Host "! Aliases already exist in profile" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SETUP COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Restart PowerShell or run:" -ForegroundColor Yellow
Write-Host "  . `$PROFILE" -ForegroundColor White
Write-Host ""
Write-Host "Then you can use:" -ForegroundColor Yellow
Write-Host "  a      - Build and open Android Studio" -ForegroundColor White
Write-Host "  dev    - Build and open Android Studio" -ForegroundColor White
Write-Host ""
