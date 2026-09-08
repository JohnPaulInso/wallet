@echo off
REM Comprehensive Java 21 to 17 fix for ALL Capacitor files
REM This fixes the issue permanently wherever it appears

echo.
echo ========================================
echo   COMPREHENSIVE JAVA VERSION FIX
echo   VERSION_21 =^> VERSION_17
echo ========================================
echo.

set "fixed_count=0"

REM Fix 1: android/capacitor-cordova-android-plugins/build.gradle
if exist "android\capacitor-cordova-android-plugins\build.gradle" (
    echo [1] Checking android/capacitor-cordova-android-plugins/build.gradle...
    powershell -Command "$content = Get-Content 'android/capacitor-cordova-android-plugins/build.gradle' -Raw; if ($content -match 'VERSION_21') { $content -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'android/capacitor-cordova-android-plugins/build.gradle'; Write-Host '    FIXED!' -ForegroundColor Green; exit 1 } else { Write-Host '    Already VERSION_17' -ForegroundColor Gray; exit 0 }"
    if errorlevel 1 set /a fixed_count+=1
)

REM Fix 2: android/app/build.gradle
if exist "android\app\build.gradle" (
    echo [2] Checking android/app/build.gradle...
    powershell -Command "$content = Get-Content 'android/app/build.gradle' -Raw; if ($content -match 'VERSION_21') { $content -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'android/app/build.gradle'; Write-Host '    FIXED!' -ForegroundColor Green; exit 1 } else { Write-Host '    Already VERSION_17' -ForegroundColor Gray; exit 0 }"
    if errorlevel 1 set /a fixed_count+=1
)

REM Fix 3: android/app/capacitor.build.gradle  
if exist "android\app\capacitor.build.gradle" (
    echo [3] Checking android/app/capacitor.build.gradle...
    powershell -Command "$content = Get-Content 'android/app/capacitor.build.gradle' -Raw; if ($content -match 'VERSION_21') { $content -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'android/app/capacitor.build.gradle'; Write-Host '    FIXED!' -ForegroundColor Green; exit 1 } else { Write-Host '    Already VERSION_17' -ForegroundColor Gray; exit 0 }"
    if errorlevel 1 set /a fixed_count+=1
)

REM Fix 4: ALL node_modules Capacitor build.gradle files
echo [4] Checking ALL node_modules/@capacitor/*/android/build.gradle...
powershell -Command "Get-ChildItem 'node_modules/@capacitor' -Directory | ForEach-Object { $buildGradle = Join-Path $_.FullName 'android\build.gradle'; if (Test-Path $buildGradle) { $content = Get-Content $buildGradle -Raw; if ($content -match 'VERSION_21') { $content -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content $buildGradle; Write-Host \"    FIXED: $($_.Name)\" -ForegroundColor Green; $global:fixed = $true } } }; if ($global:fixed) { exit 1 } else { Write-Host '    All already VERSION_17' -ForegroundColor Gray; exit 0 }"
if errorlevel 1 set /a fixed_count+=1

REM Fix 5: node_modules/@capacitor/android/capacitor/build.gradle (core)
if exist "node_modules\@capacitor\android\capacitor\build.gradle" (
    echo [5] Checking node_modules/@capacitor/android/capacitor/build.gradle...
    powershell -Command "$content = Get-Content 'node_modules/@capacitor/android/capacitor/build.gradle' -Raw; if ($content -match 'VERSION_21') { $content -replace 'JavaVersion\.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'node_modules/@capacitor/android/capacitor/build.gradle'; Write-Host '    FIXED!' -ForegroundColor Green; exit 1 } else { Write-Host '    Already VERSION_17' -ForegroundColor Gray; exit 0 }"
    if errorlevel 1 set /a fixed_count+=1
)

REM (2026-07-13) Pin play-services-auth 18.1.0; prev: dynamic 18.+
if exist "node_modules\@codetrix-studio\capacitor-google-auth\android\build.gradle" (
    powershell -Command "$content = Get-Content 'node_modules\@codetrix-studio\capacitor-google-auth\android\build.gradle' -Raw; if ($content -match 'play-services-auth:18\.\+') { $content -replace 'play-services-auth:18\.\+', 'play-services-auth:18.1.0' | Set-Content 'node_modules\@codetrix-studio\capacitor-google-auth\android\build.gradle'; Write-Host '    FIXED google-auth dynamic version' -ForegroundColor Green }"
)

REM (2026-07-13) Patch Capawesome to use GetGoogleIdOption; prev: GetSignIn
set "CAP_HANDLER=node_modules\@capacitor-firebase\authentication\android\src\main\java\io\capawesome\capacitorjs\plugins\firebase\authentication\handlers\GoogleAuthProviderHandler.java"
if exist "%CAP_HANDLER%" (
    powershell -Command "$c = Get-Content $env:CAP_HANDLER -Raw; if ($c -match 'GetSignInWithGoogleOption') { $c = $c -replace 'import com\.google\.android\.libraries\.identity\.googleid\.GetSignInWithGoogleOption;', 'import com.google.android.libraries.identity.googleid.GetGoogleIdOption;'; $target = 'GetSignInWithGoogleOption googleSignInOption = createSignInWithGoogleOptionBuilder\([\s\S]*?\)\.build\(\);[\s\S]*?GetCredentialRequest request = new GetCredentialRequest\.Builder\(\)\.addCredentialOption\(googleSignInOption\)\.build\(\);'; $replacement = 'GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder().setServerClientId(pluginImplementation.getPlugin().getContext().getString(R.string.default_web_client_id)).setFilterByAuthorizedAccounts(false).setAutoSelectEnabled(false).build();`r`n            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(googleIdOption).build();'; $c = $c -replace $target, $replacement; [IO.File]::WriteAllText($env:CAP_HANDLER, $c); Write-Host '    PATCHED Capawesome GoogleAuthProviderHandler to GetGoogleIdOption' -ForegroundColor Green }"
)

echo.
echo ========================================
if %fixed_count% GTR 0 (
    echo   FIXED %fixed_count% FILE(S^)
    echo   Java version is now VERSION_17
) else (
    echo   ALL FILES ALREADY CORRECT
    echo   No fixes needed
)
echo ========================================
echo.
