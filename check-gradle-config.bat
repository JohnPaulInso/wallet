@echo off
echo Checking Gradle configuration...
echo.
echo ========================================
echo 1. Java Version:
echo ========================================
java -version
echo.
echo ========================================
echo 2. JAVA_HOME:
echo ========================================
echo %JAVA_HOME%
echo.
echo ========================================
echo 3. Checking user gradle.properties:
echo ========================================
if exist "%USERPROFILE%\.gradle\gradle.properties" (
    echo Found user gradle.properties at: %USERPROFILE%\.gradle\gradle.properties
    type "%USERPROFILE%\.gradle\gradle.properties"
) else (
    echo No user gradle.properties found
)
echo.
echo ========================================
echo 4. Checking project gradle.properties:
echo ========================================
if exist "android\gradle.properties" (
    type "android\gradle.properties"
) else (
    echo No project gradle.properties found
)
echo.
pause
