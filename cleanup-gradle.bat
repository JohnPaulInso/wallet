@echo off
echo ========================================
echo Cleaning Gradle Build System
echo ========================================
echo.

echo 1. Stopping all Gradle daemons...
cd android
call gradlew --stop
cd ..
echo Done.
echo.

echo 2. Clearing Gradle cache...
if exist "%USERPROFILE%\.gradle\caches" (
    echo Removing %USERPROFILE%\.gradle\caches...
    rmdir /s /q "%USERPROFILE%\.gradle\caches"
    echo Cache cleared.
) else (
    echo No cache found.
)
echo.

echo 3. Cleaning Android build directories...
if exist "android\build" rmdir /s /q "android\build"
if exist "android\app\build" rmdir /s /q "android\app\build"
if exist "android\.gradle" rmdir /s /q "android\.gradle"
echo Build directories cleaned.
echo.

echo ========================================
echo Cleanup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Make sure Android Studio is closed
echo 2. Reopen Android Studio
echo 3. Let it sync the project
echo 4. Build -^> Rebuild Project
echo.
pause
