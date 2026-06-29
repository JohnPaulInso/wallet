@echo off
echo ========================================
echo Auto Clean Gradle (No Interaction)
echo ========================================
echo.

echo Killing all Java processes...
taskkill /F /IM java.exe >nul 2>&1
taskkill /F /IM javaw.exe >nul 2>&1
taskkill /F /IM studio64.exe >nul 2>&1
echo Done.
echo.

echo Waiting for processes to terminate...
timeout /t 5 /nobreak >nul
echo.

echo Deleting Gradle cache with PowerShell...
powershell -Command "if (Test-Path '%USERPROFILE%\.gradle\caches') { Remove-Item -Path '%USERPROFILE%\.gradle\caches' -Recurse -Force -ErrorAction SilentlyContinue }"
powershell -Command "if (Test-Path '%USERPROFILE%\.gradle\daemon') { Remove-Item -Path '%USERPROFILE%\.gradle\daemon' -Recurse -Force -ErrorAction SilentlyContinue }"
powershell -Command "if (Test-Path '%USERPROFILE%\.gradle\wrapper') { Remove-Item -Path '%USERPROFILE%\.gradle\wrapper' -Recurse -Force -ErrorAction SilentlyContinue }"
echo.

echo Cleaning project directories...
if exist "android\.gradle" rd /s /q "android\.gradle" >nul 2>&1
if exist "android\build" rd /s /q "android\build" >nul 2>&1
if exist "android\app\build" rd /s /q "android\app\build" >nul 2>&1
echo.

echo ========================================
echo Cleanup Complete!
echo ========================================
echo You can now open Android Studio and build
