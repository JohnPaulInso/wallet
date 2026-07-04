@echo off
REM Script to remove API key files from Git tracking
REM This keeps your local files but stops tracking them in Git

echo.
echo ========================================
echo   REMOVE API KEYS FROM GIT TRACKING
echo ========================================
echo.
echo This script will:
echo   1. Remove config.js from Git tracking
echo   2. Remove ai-config.js from Git tracking
echo   3. Remove service-account.json from Git tracking
echo.
echo Your local files will NOT be deleted!
echo They just won't be tracked by Git anymore.
echo.
pause

echo.
echo Checking which files are currently tracked...
git ls-files | findstr /i "config.js ai-config.js service-account.json"

echo.
echo Removing from Git tracking...
git rm --cached config.js 2>nul
if %errorlevel% equ 0 (
    echo [OK] config.js removed from tracking
) else (
    echo [INFO] config.js was not being tracked
)

git rm --cached ai-config.js 2>nul
if %errorlevel% equ 0 (
    echo [OK] ai-config.js removed from tracking
) else (
    echo [INFO] ai-config.js was not being tracked
)

git rm --cached service-account.json 2>nul
if %errorlevel% equ 0 (
    echo [OK] service-account.json removed from tracking
) else (
    echo [INFO] service-account.json was not being tracked
)

echo.
echo Verifying .gitignore includes these files...
findstr /i "config.js" .gitignore > nul
if %errorlevel% neq 0 (
    echo [WARNING] Adding config.js to .gitignore...
    echo config.js >> .gitignore
)

findstr /i "ai-config.js" .gitignore > nul
if %errorlevel% neq 0 (
    echo [WARNING] Adding ai-config.js to .gitignore...
    echo ai-config.js >> .gitignore
)

findstr /i "service-account.json" .gitignore > nul
if %errorlevel% neq 0 (
    echo [WARNING] Adding service-account.json to .gitignore...
    echo service-account.json >> .gitignore
)

echo.
echo ========================================
echo   NEXT STEPS
echo ========================================
echo.
echo 1. Verify your local files still exist:
echo    - config.js
echo    - ai-config.js
echo.
echo 2. Commit the changes:
echo    git commit -m "Remove sensitive files from tracking"
echo.
echo 3. Push to GitHub:
echo    git push
echo.
echo 4. IMPORTANT: Generate NEW API keys!
echo    - Your old keys were exposed in Git history
echo    - Visit Google AI Studio, Firebase Console, etc.
echo    - Generate new keys and update your local files
echo    - Revoke the old keys
echo.
echo ========================================
echo   DONE!
echo ========================================
echo.
pause
