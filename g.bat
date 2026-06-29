@echo off
REM Quick git push script - just type .\g
echo.
echo ========================================
echo   QUICK GIT PUSH
echo ========================================
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
