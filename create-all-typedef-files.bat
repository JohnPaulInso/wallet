@echo off
echo Creating all missing typedefs.txt files...
echo.

mkdir "android\capacitor-cordova-android-plugins\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations" 2>nul
echo. > "android\capacitor-cordova-android-plugins\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations\typedefs.txt"

mkdir "node_modules\@capacitor\local-notifications\android\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations" 2>nul
echo. > "node_modules\@capacitor\local-notifications\android\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations\typedefs.txt"

mkdir "node_modules\@capacitor\status-bar\android\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations" 2>nul
echo. > "node_modules\@capacitor\status-bar\android\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations\typedefs.txt"

mkdir "node_modules\@codetrix-studio\capacitor-google-auth\android\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations" 2>nul
echo. > "node_modules\@codetrix-studio\capacitor-google-auth\android\build\intermediates\annotations_typedef_file\debug\extractDebugAnnotations\typedefs.txt"

echo.
echo All typedefs.txt files created!
echo Now try building
pause
