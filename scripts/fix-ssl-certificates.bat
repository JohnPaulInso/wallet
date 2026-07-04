@echo off
echo ========================================
echo SSL Certificate Fix for Android Build
echo ========================================
echo.

:: Find Java installation
echo Looking for Java installation...
where java
echo.

:: Stop Gradle daemon
echo Stopping Gradle daemon...
cd android
call gradlew --stop
cd ..
echo.

:: Create global gradle.properties with aggressive SSL bypass
echo Creating Gradle configuration...
if not exist "%USERPROFILE%\.gradle" mkdir "%USERPROFILE%\.gradle"

(
echo # Gradle Configuration
echo org.gradle.jvmargs=-Xmx2048m -Djavax.net.ssl.trustStore=NONE -Djavax.net.ssl.trustStoreType=NONE -Djavax.net.ssl.trustStoreProvider=NONE -Djavax.net.ssl.checkRevocation=false
echo org.gradle.daemon=true
echo org.gradle.parallel=false
echo android.useAndroidX=true
) > "%USERPROFILE%\.gradle\gradle.properties"

echo.
echo Created: %USERPROFILE%\.gradle\gradle.properties
echo.

:: Clear caches
echo Clearing Gradle caches...
if exist "%USERPROFILE%\.gradle\caches" rmdir /s /q "%USERPROFILE%\.gradle\caches"
if exist "android\.gradle" rmdir /s /q "android\.gradle"
if exist "android\build" rmdir /s /q "android\build"
if exist "android\app\build" rmdir /s /q "android\app\build"
echo.

echo ========================================
echo Fix Applied!
echo ========================================
echo.
echo If this doesn't work, the issue is with your Java installation.
echo You need to:
echo 1. Download JDK 17 from: https://adoptium.net/
echo 2. Install it
echo 3. In Android Studio: File -^> Settings -^> Build Tools -^> Gradle
echo 4. Set Gradle JDK to the newly installed JDK 17
echo.
pause
