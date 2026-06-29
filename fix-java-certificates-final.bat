@echo off
echo ========================================
echo Fix Java 17 SSL Certificates - FINAL SOLUTION
echo ========================================
echo.

:: Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This must be run as Administrator!
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

set "JAVA_HOME=C:\Program Files\Java\jdk-17"
set "KEYTOOL=%JAVA_HOME%\bin\keytool.exe"
set "CACERTS=%JAVA_HOME%\lib\security\cacerts"

echo Java Home: %JAVA_HOME%
echo Cacerts: %CACERTS%
echo.

:: Backup cacerts
echo Creating backup...
copy "%CACERTS%" "%CACERTS%.backup" >nul
echo.

:: The default password for cacerts is "changeit"
set "STOREPASS=changeit"

:: Delete potentially corrupted certificates and re-import
echo Removing old certificates (if any)...
"%KEYTOOL%" -delete -alias google-dl -keystore "%CACERTS%" -storepass %STOREPASS% -noprompt 2>nul
"%KEYTOOL%" -delete -alias maven-central -keystore "%CACERTS%" -storepass %STOREPASS% -noprompt 2>nul
echo.

:: Import root CA certificates from Windows
echo Importing root CA certificates from Windows certificate store...
echo This may take 1-2 minutes...
powershell -ExecutionPolicy Bypass -Command "$certs = Get-ChildItem -Path Cert:\LocalMachine\Root; $count = 0; foreach ($cert in $certs) { try { $bytes = $cert.Export('Cert'); $file = 'temp_cert_' + $count + '.cer'; [System.IO.File]::WriteAllBytes($file, $bytes); $alias = 'root-ca-' + $count; & '%KEYTOOL%' -import -trustcacerts -alias $alias -file $file -keystore '%CACERTS%' -storepass %STOREPASS% -noprompt 2>$null; Remove-Item $file -Force; $count++ } catch {}  }; Write-Host \"Total certificates imported: $count\""
echo.

echo ========================================
echo Certificate Import Complete!
echo ========================================
echo.
echo Now:
echo 1. Close Android Studio completely
echo 2. Run: auto-clean-gradle.bat
echo 3. Reopen Android Studio
echo 4. Make sure Gradle JDK is set to JDK 17
echo 5. Sync and build
echo.
pause
