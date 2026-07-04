@echo off
echo Disabling lint tasks in all Capacitor modules...
echo.

echo Adding lint disable code to all modules...

REM Add lint disable to capacitor-app
powershell -Command "$file = 'node_modules/@capacitor/app/android/build.gradle'; $content = Get-Content $file -Raw; if ($content -notmatch 'tasks\.whenTaskAdded') { $content = $content -replace '(repositories\s*\{)', 'tasks.whenTaskAdded { task -> if (task.name.contains(\"lint\") ^|^| task.name.contains(\"Lint\") ^|^| task.name.contains(\"Annotations\")) { task.enabled = false } }' + [Environment]::NewLine + [Environment]::NewLine + '$1'; Set-Content $file $content }"

REM Add lint disable to capacitor-local-notifications
powershell -Command "$file = 'node_modules/@capacitor/local-notifications/android/build.gradle'; $content = Get-Content $file -Raw; if ($content -notmatch 'tasks\.whenTaskAdded') { $content = $content -replace '(repositories\s*\{)', 'tasks.whenTaskAdded { task -> if (task.name.contains(\"lint\") ^|^| task.name.contains(\"Lint\") ^|^| task.name.contains(\"Annotations\")) { task.enabled = false } }' + [Environment]::NewLine + [Environment]::NewLine + '$1'; Set-Content $file $content }"

REM Add lint disable to capacitor-status-bar
powershell -Command "$file = 'node_modules/@capacitor/status-bar/android/build.gradle'; $content = Get-Content $file -Raw; if ($content -notmatch 'tasks\.whenTaskAdded') { $content = $content -replace '(repositories\s*\{)', 'tasks.whenTaskAdded { task -> if (task.name.contains(\"lint\") ^|^| task.name.contains(\"Lint\") ^|^| task.name.contains(\"Annotations\")) { task.enabled = false } }' + [Environment]::NewLine + [Environment]::NewLine + '$1'; Set-Content $file $content }"

REM Add lint disable to google-auth
powershell -Command "$file = 'node_modules/@codetrix-studio/capacitor-google-auth/android/build.gradle'; $content = Get-Content $file -Raw; if ($content -notmatch 'tasks\.whenTaskAdded') { $content = $content -replace '(repositories\s*\{)', 'tasks.whenTaskAdded { task -> if (task.name.contains(\"lint\") ^|^| task.name.contains(\"Lint\") ^|^| task.name.contains(\"Annotations\")) { task.enabled = false } }' + [Environment]::NewLine + [Environment]::NewLine + '$1'; Set-Content $file $content }"

echo.
echo All lint tasks disabled!
echo Now try building again
pause
