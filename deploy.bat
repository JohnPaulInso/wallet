@echo off
REM ============================================================================
REM Smart Wallet - Automated Build & Deploy Script (Windows)
REM ============================================================================
REM This script automates the complete build, sync, and deployment process
REM Usage: deploy.bat [commit-message]
REM ============================================================================

setlocal enabledelayedexpansion

REM Get commit message from argument or use default
set "COMMIT_MESSAGE=%~1"
if "%COMMIT_MESSAGE%"=="" set "COMMIT_MESSAGE=Update: Automated deployment"

echo.
echo ============================================================================
echo   Smart Wallet - Automated Deployment
echo ============================================================================
echo.

REM Step 1: Build the project
echo [36m[STEP 1/6] Building project...[0m
call npm run build
if errorlevel 1 (
    echo [31mError: Build failed[0m
    exit /b 1
)
echo [32mBuild completed successfully[0m
echo.

REM Step 2: Sync with Capacitor Android
echo [36m[STEP 2/6] Syncing with Capacitor Android...[0m
call npx cap sync android
if errorlevel 1 (
    echo [31mError: Capacitor sync failed[0m
    exit /b 1
)
echo [32mCapacitor sync completed[0m
echo.

REM Step 3: Open Android Studio
echo [36m[STEP 3/6] Opening Android Studio...[0m
echo [33mAndroid Studio will open. You can close it after verification.[0m
start "" npx cap open android
echo [32mAndroid Studio launched[0m
echo.

REM Give user time to see Android Studio opening
timeout /t 2 /nobreak >nul

REM Step 4: Git add
echo [36m[STEP 4/6] Staging changes...[0m
git add .
if errorlevel 1 (
    echo [31mError: Git add failed[0m
    exit /b 1
)
echo [32mAll changes staged[0m
echo.

REM Step 5: Git commit
echo [36m[STEP 5/6] Committing changes...[0m
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
    echo [31mError: Git commit failed[0m
    exit /b 1
)
echo [32mChanges committed: %COMMIT_MESSAGE%[0m
echo.

REM Step 6: Git push
echo [36m[STEP 6/6] Pushing to main branch...[0m
git push origin main
if errorlevel 1 (
    echo [31mError: Git push failed[0m
    exit /b 1
)
echo [32mChanges pushed to main branch[0m
echo.

REM Step 7: EAS Update
echo [36m[STEP 7/7] Publishing EAS update...[0m
call npx eas update --branch main --message "%COMMIT_MESSAGE%"
if errorlevel 1 (
    echo [31mError: EAS update failed[0m
    exit /b 1
)
echo [32mEAS update published successfully[0m
echo.

REM Final summary
echo ============================================================================
echo [32mDEPLOYMENT COMPLETE[0m
echo ============================================================================
echo.
echo Summary:
echo   - Build: Completed
echo   - Capacitor Sync: Completed
echo   - Android Studio: Opened
echo   - Git Commit: Pushed to main
echo   - EAS Update: Published
echo.
echo Commit Message: %COMMIT_MESSAGE%
echo.
echo ============================================================================

endlocal
