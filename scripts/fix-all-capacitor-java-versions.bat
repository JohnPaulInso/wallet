@echo off
echo Fixing all Capacitor modules to use Java 17...
echo.

powershell -Command "(Get-Content 'node_modules/@capacitor/app/android/build.gradle') -replace 'JavaVersion.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'node_modules/@capacitor/app/android/build.gradle'"

powershell -Command "(Get-Content 'node_modules/@capacitor/local-notifications/android/build.gradle') -replace 'JavaVersion.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'node_modules/@capacitor/local-notifications/android/build.gradle'"

powershell -Command "(Get-Content 'node_modules/@capacitor/status-bar/android/build.gradle') -replace 'JavaVersion.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'node_modules/@capacitor/status-bar/android/build.gradle'"

powershell -Command "(Get-Content 'node_modules/@codetrix-studio/capacitor-google-auth/android/build.gradle') -replace 'JavaVersion.VERSION_21', 'JavaVersion.VERSION_17' | Set-Content 'node_modules/@codetrix-studio/capacitor-google-auth/android/build.gradle'"

echo.
echo All Capacitor modules fixed!
echo Now try building again in Android Studio
pause
