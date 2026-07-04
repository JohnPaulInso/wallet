@echo off
REM Quick push script - adds all files, commits, and pushes to GitHub
REM Added safety checks for API keys
echo.
echo ========================================
echo   QUICK GIT PUSH (with API Key Safety)
echo ========================================
echo.

REM Check if sensitive files are being tracked
echo Checking for sensitive files...
git ls-files | findstr /i "config.js ai-config.js service-account.json" > nul
if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo   WARNING: SENSITIVE FILES DETECTED!
    echo ============================================
    echo.
    echo The following files contain API keys and
    echo should NOT be committed to GitHub:
    echo   - config.js
    echo   - ai-config.js
    echo   - service-account.json
    echo.
    echo These files are being tracked by Git!
    echo.
    echo To fix this, run:
    echo   git rm --cached config.js
    echo   git rm --cached ai-config.js
    echo   git rm --cached service-account.json
    echo   git commit -m "Remove sensitive files"
    echo.
    echo PUSH ABORTED FOR YOUR SAFETY!
    echo ============================================
    pause
    exit /b 1
)

echo No sensitive files detected - safe to proceed!
echo.

REM Check if a custom commit message was provided
if "%~1"=="" (
    set "commit_msg=Update"
) else (
    set "commit_msg=%*"
)

echo Adding all changes...
git add .

echo.
echo Committing with message: "%commit_msg%"
git commit -m "%commit_msg%"

echo.
echo Pushing to GitHub...
git push

echo.
echo ========================================
echo   DONE! Changes pushed to GitHub
echo ========================================
echo.
pause
