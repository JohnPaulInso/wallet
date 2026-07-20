@echo off
REM API Key Safety Verification Script
REM Run this before committing to GitHub to ensure no API keys will be exposed
REM [FIXED] Works correctly when called from scripts/ folder

echo.
echo ========================================
echo   API KEY SAFETY CHECK
echo ========================================
echo.

REM Change to project root directory (parent of scripts folder)
cd /d "%~dp0.."

REM Check if .gitignore exists
if not exist ".gitignore" (
    echo [ERROR] .gitignore file not found!
    echo Create a .gitignore file first.
    pause
    exit /b 1
)

REM Check if config files are in .gitignore
echo Checking .gitignore configuration...
findstr /i "config.js" .gitignore > nul
if %errorlevel% neq 0 (
    echo [WARNING] config.js not found in .gitignore!
    echo Add it to .gitignore to protect your API keys.
) else (
    echo [OK] config.js is in .gitignore
)

findstr /i "ai-config.js" .gitignore > nul
if %errorlevel% neq 0 (
    echo [WARNING] ai-config.js not found in .gitignore!
    echo Add it to .gitignore to protect your API keys.
) else (
    echo [OK] ai-config.js is in .gitignore
)

findstr /i "service-account.json" .gitignore > nul
if %errorlevel% neq 0 (
    echo [WARNING] service-account.json not found in .gitignore!
) else (
    echo [OK] service-account.json is in .gitignore
)

echo.
REM (2026-07-13) exact file match for sensitive check; prev: loose substring match
git ls-files | findstr /i /r /c:"^config\.js$" /c:"^ai-config\.js$" /c:"^service-account\.json$" > nul
if %errorlevel% equ 0 (
    echo.
    echo [ERROR] SENSITIVE FILES ARE BEING TRACKED!
    echo.
    echo The following files contain API keys and are being tracked:
    git ls-files | findstr /i /r /c:"^config\.js$" /c:"^ai-config\.js$" /c:"^service-account\.json$"
    echo.
    echo To remove them from Git tracking (but keep local files):
    echo   git rm --cached config.js
    echo   git rm --cached ai-config.js
    echo   git rm --cached service-account.json
    echo   git commit -m "Remove sensitive files from tracking"
    echo.
) else (
    echo [OK] No sensitive files are being tracked by Git
)

echo.
echo Checking if config files exist locally...
if exist "config.js" (
    echo [OK] config.js exists locally
) else (
    echo [WARNING] config.js not found - copy from config.template.js
)

if exist "ai-config.js" (
    echo [OK] ai-config.js exists locally
) else (
    echo [WARNING] ai-config.js not found - copy from ai-config.template.js
)

echo.
echo Checking if template files exist...
if exist "config.template.js" (
    echo [OK] config.template.js exists (safe to commit)
) else (
    echo [WARNING] config.template.js not found - should exist for documentation
)

if exist "ai-config.template.js" (
    echo [OK] ai-config.template.js exists (safe to commit)
) else (
    echo [WARNING] ai-config.template.js not found - should exist for documentation
)

echo.
echo ========================================
echo   VERIFICATION COMPLETE
echo ========================================
echo.
echo Run this check before every commit to GitHub!
echo.
pause
