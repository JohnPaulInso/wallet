@echo off
echo ========================================
echo Final Android Build Fix
echo ========================================
echo.

:: Update global gradle.properties with proper SSL handling
echo Creating optimized gradle.properties...
(
echo # Gradle Configuration
echo org.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8
echo org.gradle.daemon=true
echo org.gradle.parallel=false
echo org.gradle.caching=false
echo android.useAndroidX=true
echo android.enableJetifier=false
) > "%USERPROFILE%\.gradle\gradle.properties"
echo Created: %USERPROFILE%\.gradle\gradle.properties
echo.

:: Set JAVA_HOME to JDK 17
echo Setting JAVA_HOME to JDK 17...
setx JAVA_HOME "C:\Program Files\Java\jdk-17" >nul
set "JAVA_HOME=C:\Program Files\Java\jdk-17"
echo JAVA_HOME=%JAVA_HOME%
echo.

echo ========================================
echo Configuration Complete!
echo ========================================
echo.
echo Now:
echo 1. Open Android Studio
echo 2. File -^> Settings -^> Build Tools -^> Gradle
echo 3. Set Gradle JDK to: C:\Program Files\Java\jdk-17
echo 4. Click OK
echo 5. File -^> Sync Project with Gradle Files
echo 6. Build -^> Rebuild Project
echo.
echo If you still get SSL errors, you need to:
echo - Check your antivirus settings
echo - Check if you're behind a corporate proxy
echo - Try from a different network
echo.
pause
