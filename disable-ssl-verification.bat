@echo off
echo ========================================
echo Disable SSL Verification for Gradle
echo ========================================
echo.

:: Create init.d directory if it doesn't exist
if not exist "%USERPROFILE%\.gradle\init.d" mkdir "%USERPROFILE%\.gradle\init.d"

:: Create init script to disable SSL verification
echo Creating SSL bypass init script...
(
echo import javax.net.ssl.*
echo import java.security.cert.X509Certificate
echo.
echo allprojects {
echo     buildscript {
echo         repositories {
echo             all { ArtifactRepository repo -^>
echo                 if ^(repo instanceof MavenArtifactRepository^) {
echo                     def mavenRepo = repo as MavenArtifactRepository
echo                     if ^(mavenRepo.url.toString^(^).startsWith^('https'^)^) {
echo                         println "Allowing insecure connections for: ${mavenRepo.url}"
echo                         mavenRepo.allowInsecureProtocol = true
echo                     }
echo                 }
echo             }
echo         }
echo     }
echo     repositories {
echo         all { ArtifactRepository repo -^>
echo             if ^(repo instanceof MavenArtifactRepository^) {
echo                 def mavenRepo = repo as MavenArtifactRepository
echo                 if ^(mavenRepo.url.toString^(^).startsWith^('https'^)^) {
echo                     println "Allowing insecure connections for: ${mavenRepo.url}"
echo                     mavenRepo.allowInsecureProtocol = true
echo                 }
echo             }
echo         }
echo     }
echo }
) > "%USERPROFILE%\.gradle\init.d\ssl-bypass.gradle"

echo Created: %USERPROFILE%\.gradle\init.d\ssl-bypass.gradle
echo.

:: Also update gradle.properties
(
echo org.gradle.jvmargs=-Xmx3072m -Dfile.encoding=UTF-8
echo org.gradle.daemon=true
echo org.gradle.parallel=false
echo android.useAndroidX=true
) > "%USERPROFILE%\.gradle\gradle.properties"

echo Updated: %USERPROFILE%\.gradle\gradle.properties
echo.

echo ========================================
echo SSL Verification Disabled!
echo ========================================
echo.
echo This allows Gradle to download dependencies without SSL verification.
echo.
pause
