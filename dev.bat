@echo off
REM Quick dev script - builds project and opens Android Studio
echo.
echo ========================================
echo   BUILD AND OPEN ANDROID STUDIO
echo ========================================
echo.

echo [1/3] Running npm run build...
call npm run build

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Syncing Capacitor...
call npx cap sync android

echo.
echo [2.5/3] Fixing Java version...
call npm run fix-java

echo.
echo [3/3] Opening Android Studio...

REM Try common Android Studio installation paths
if exist "C:\Program Files\Android\Android Studio\bin\studio64.exe" (
    start "" "C:\Program Files\Android\Android Studio\bin\studio64.exe" "%cd%\android"
    goto :success
)

if exist "C:\Program Files (x86)\Android\Android Studio\bin\studio64.exe" (
    start "" "C:\Program Files (x86)\Android\Android Studio\bin\studio64.exe" "%cd%\android"
    goto :success
)

if exist "%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe" (
    start "" "%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe" "%cd%\android"
    goto :success
)

REM Fallback: try to open the android folder (will prompt to choose app)
echo Android Studio not found in common paths, opening android folder...
start "" "%cd%\android"

:success
echo.
echo ========================================
echo   DONE! Android Studio should open soon
echo ========================================
echo.
pause
