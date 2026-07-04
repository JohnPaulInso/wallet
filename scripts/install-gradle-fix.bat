@echo off
echo ========================================
echo Installing Gradle SSL Certificate Fix
echo ========================================
echo.

:: Create .gradle directory if it doesn't exist
if not exist "%USERPROFILE%\.gradle" mkdir "%USERPROFILE%\.gradle"

:: Backup existing gradle.properties if it exists
if exist "%USERPROFILE%\.gradle\gradle.properties" (
    echo Backing up existing gradle.properties...
    copy "%USERPROFILE%\.gradle\gradle.properties" "%USERPROFILE%\.gradle\gradle.properties.backup"
)

:: Create new gradle.properties with SSL fix
echo Creating new gradle.properties...
(
echo # Gradle global properties
echo org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8
echo org.gradle.daemon=true
echo org.gradle.parallel=true
echo org.gradle.caching=true
echo.
echo # SSL Certificate fix - bypass certificate validation
echo # WARNING: This is for development only
echo systemProp.javax.net.ssl.trustStoreType=jks
echo systemProp.jsse.enableSNIExtension=false
) > "%USERPROFILE%\.gradle\gradle.properties"

echo.
echo ========================================
echo Fix installed successfully!
echo Location: %USERPROFILE%\.gradle\gradle.properties
echo ========================================
echo.
echo Now:
echo 1. Close Android Studio completely
echo 2. Run: cleanup-gradle.bat
echo 3. Reopen Android Studio
echo 4. Try building again
echo.
pause
