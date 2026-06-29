@echo off
echo ========================================
echo Fixing Android Build SSL Certificate Issues
echo ========================================
echo.

echo Step 1: Stopping Gradle daemon...
cd android
call gradlew --stop
cd ..
echo.

echo Step 2: Cleaning Gradle cache...
rmdir /s /q "%USERPROFILE%\.gradle\caches" 2>nul
echo Gradle cache cleared.
echo.

echo Step 3: Cleaning Android build...
cd android
call gradlew clean
cd ..
echo.

echo Step 4: Checking Java version...
java -version
echo.

echo ========================================
echo Next steps:
echo 1. Make sure you have Java 11 or Java 17 installed
echo 2. In Android Studio, go to File > Settings > Build, Execution, Deployment > Build Tools > Gradle
echo 3. Set "Gradle JDK" to Java 11 or Java 17
echo 4. Try building again
echo ========================================
pause
