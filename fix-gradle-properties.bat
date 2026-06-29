@echo off
echo ========================================
echo Fixing Gradle Properties
echo ========================================
echo.

:: Create correct gradle.properties without invalid SSL settings
(
echo # Gradle Configuration
echo org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8
echo org.gradle.daemon=true
echo org.gradle.parallel=true
echo org.gradle.caching=true
echo android.useAndroidX=true
) > "%USERPROFILE%\.gradle\gradle.properties"

echo Created correct gradle.properties
echo Location: %USERPROFILE%\.gradle\gradle.properties
echo.

:: Clear caches
echo Clearing caches...
if exist "%USERPROFILE%\.gradle\caches" rmdir /s /q "%USERPROFILE%\.gradle\caches"
if exist "android\.gradle" rmdir /s /q "android\.gradle"
if exist "android\build" rmdir /s /q "android\build"
if exist "android\app\build" rmdir /s /q "android\app\build"

echo.
echo ========================================
echo Done! Now:
echo 1. Make sure Android Studio is using JDK 17
echo 2. File -^> Invalidate Caches -^> Invalidate and Restart
echo 3. After restart, try building again
echo ========================================
pause
