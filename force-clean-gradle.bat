@echo off
echo ========================================
echo Force Clean Gradle (Complete Reset)
echo ========================================
echo.

echo Step 1: Close Android Studio if it's open!
echo Press any key after you've closed Android Studio...
pause
echo.

echo Step 2: Killing all Java processes...
taskkill /F /IM java.exe >nul 2>&1
taskkill /F /IM javaw.exe >nul 2>&1
timeout /t 2 >nul
echo Java processes killed.
echo.

echo Step 3: Stopping Gradle daemon...
cd android
call gradlew --stop >nul 2>&1
cd ..
echo.

echo Step 4: Waiting for file locks to release...
timeout /t 3 >nul
echo.

echo Step 5: Deleting Gradle cache...
set GRADLE_HOME=%USERPROFILE%\.gradle

if exist "%GRADLE_HOME%\caches" (
    echo Deleting %GRADLE_HOME%\caches...
    rd /s /q "%GRADLE_HOME%\caches" 2>nul
    if exist "%GRADLE_HOME%\caches" (
        echo Some files are still locked, trying alternative method...
        powershell -Command "Get-ChildItem -Path '%GRADLE_HOME%\caches' -Recurse -Force | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue"
    )
)

if exist "%GRADLE_HOME%\daemon" (
    echo Deleting %GRADLE_HOME%\daemon...
    rd /s /q "%GRADLE_HOME%\daemon" 2>nul
)

if exist "%GRADLE_HOME%\wrapper" (
    echo Deleting %GRADLE_HOME%\wrapper...
    rd /s /q "%GRADLE_HOME%\wrapper" 2>nul
)
echo.

echo Step 6: Cleaning project build directories...
if exist "android\.gradle" rd /s /q "android\.gradle" 2>nul
if exist "android\build" rd /s /q "android\build" 2>nul
if exist "android\app\build" rd /s /q "android\app\build" 2>nul
if exist "android\.idea" rd /s /q "android\.idea" 2>nul
echo.

echo ========================================
echo Cleanup Complete!
echo ========================================
echo.
echo Gradle cache has been completely cleared.
echo.
echo Next steps:
echo 1. Open Android Studio
echo 2. File -^> Sync Project with Gradle Files
echo 3. Wait for sync to complete (may take a few minutes)
echo 4. Build -^> Rebuild Project
echo.
pause
