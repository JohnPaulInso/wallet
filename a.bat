@echo off
rem (2026-07-13) Compile standalone APK and open output, prev open Studio
call npm run sync-www
call npx cap sync android
call npm run fix-java
rem (2026-07-13) Run gradlew inside android directory; prev: root directory
cd /d "%~dp0android"
call gradlew.bat :app:assembleDebug
cd /d "%~dp0"
if exist "%~dp0android\app\build\outputs\apk\debug" (
    explorer "%~dp0android\app\build\outputs\apk\debug"
)
exit /b 0
