@echo off
REM Fixes Java version from 21 to 17 in all Capacitor build.gradle files
REM Run this after "npx cap sync android" if you get Java 21 errors

echo.
echo ========================================
echo   FIX JAVA VERSION 21 TO 17
echo ========================================
echo.

echo Fixing android/capacitor-cordova-android-plugins/build.gradle...
powershell -Command "(Get-Content 'android/capacitor-cordova-android-plugins/build.gradle' -Raw) -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'android/capacitor-cordova-android-plugins/build.gradle'" 2>nul

if exist "android\capacitor-cordova-android-plugins\build.gradle" (
    echo Done! Java version set to 17
) else (
    echo Warning: File not found, might not be needed yet
)

echo.
echo ========================================
echo   COMPLETE
echo ========================================
echo.
