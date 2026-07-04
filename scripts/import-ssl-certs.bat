@echo off
setlocal enabledelayedexpansion

echo ========================================
echo Import SSL Certificates to Java
echo ========================================
echo.

:: Set Java home to JDK 17
set "JAVA_HOME=C:\Program Files\Java\jdk-17"
set "KEYTOOL=%JAVA_HOME%\bin\keytool.exe"
set "CACERTS=%JAVA_HOME%\lib\security\cacerts"

echo Using Java: %JAVA_HOME%
echo Keytool: %KEYTOOL%
echo Cacerts: %CACERTS%
echo.

:: Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ========================================
    echo ERROR: This script must be run as Administrator
    echo ========================================
    echo Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

echo Running as Administrator - Good!
echo.

:: Backup existing cacerts
echo Creating backup of cacerts...
copy "%CACERTS%" "%CACERTS%.backup" >nul 2>&1
echo Backup created: %CACERTS%.backup
echo.

:: Import Google certificates
echo Importing certificates for Google/Maven repositories...

:: Download and import dl.google.com certificate
echo Importing dl.google.com certificate...
powershell -Command "$cert = [System.Net.ServicePointManager]::ServerCertificate = $null; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; $webRequest = [System.Net.WebRequest]::Create('https://dl.google.com'); try { $webRequest.GetResponse() | Out-Null } catch {}; $cert = $webRequest.ServicePoint.Certificate; if ($cert) { $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert); [System.IO.File]::WriteAllBytes('google-dl.cer', $bytes) }"

if exist "google-dl.cer" (
    "%KEYTOOL%" -import -trustcacerts -alias google-dl -file "google-dl.cer" -keystore "%CACERTS%" -storepass changeit -noprompt
    del "google-dl.cer"
    echo Google DL certificate imported successfully
) else (
    echo Could not download Google DL certificate
)
echo.

:: Import Maven Central certificates
echo Importing repo1.maven.org certificate...
powershell -Command "$cert = [System.Net.ServicePointManager]::ServerCertificate = $null; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12; $webRequest = [System.Net.WebRequest]::Create('https://repo1.maven.org'); try { $webRequest.GetResponse() | Out-Null } catch {}; $cert = $webRequest.ServicePoint.Certificate; if ($cert) { $bytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert); [System.IO.File]::WriteAllBytes('maven-central.cer', $bytes) }"

if exist "maven-central.cer" (
    "%KEYTOOL%" -import -trustcacerts -alias maven-central -file "maven-central.cer" -keystore "%CACERTS%" -storepass changeit -noprompt
    del "maven-central.cer"
    echo Maven Central certificate imported successfully
) else (
    echo Could not download Maven Central certificate
)
echo.

echo ========================================
echo Certificate Import Complete!
echo ========================================
echo.
echo Now:
echo 1. Close Android Studio completely
echo 2. Reopen Android Studio
echo 3. Make sure it's using JDK 17
echo 4. Try building again
echo.
pause
