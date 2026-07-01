# Smart Wallet - Tech Stack

## Core Technologies

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3
- **Mobile**: Capacitor 8.2.0 (Cordova bridge for native Android)
- **Authentication**: Firebase Auth + Google Identity Services (GIS)
- **Database**: Cloud Firestore (real-time sync)
- **UI Framework**: Material UI CSS (mui-0.10.3) + Material Icons
- **Build System**: npm scripts + Capacitor CLI
- **OCR**: Tesseract.js 5.x (client-side)
- **Charts**: Chart.js
- **Service Worker**: Custom PWA implementation (sw.js)

## Project Structure

- Entry point: `index.html` (single-page app)
- Modular JS: ES modules for auth, data, UI, utilities
- Native bridge: `android/` folder with Gradle build system
- Deployment target: `www/` folder (Capacitor web directory)

## Common Commands

### Development
```bash
npm run dev              # Opens dev.bat (Android Studio + emulator)
dev.bat                  # Direct batch file execution
.\a                      # Alias for build + sync + open
```

### Build & Sync
```bash
npm run build            # Sync files to www/ + fix Java version
npm run sync-www         # Robocopy files to www/ (excludes node_modules, android, .git)
npx cap sync android     # Sync web assets to Android project
```

### Android Fixes (Critical for builds)
```bash
npm run fix-java         # Fix Java 21→17 version issues (triple-layer protection)
fix-all-java-21.bat      # Manual Java version fix for all Gradle files
auto-clean-gradle.bat    # Clean Gradle cache and build artifacts
fix-java-certificates-final.bat  # Import SSL certs to Java truststore
```

### Git Workflow
```bash
npm run push             # git add . && commit && push
npm run save             # Quick save with "Quick save" message
npm run sync             # Pull, add, commit "Sync", push
npm run commit           # Stage all, commit (manual message)
```

### Deployment
```bash
npm run deploy           # Runs deploy.bat (production build)
npm run deploy:unix      # Runs deploy.sh (Unix systems)
```

## Build System Notes

### Capacitor Configuration
- Config: `capacitor.config.ts`
- App ID: `smart.wallet1`
- Web directory: `www/`
- Plugins: StatusBar, GoogleAuth, LocalNotifications

### Android Build (Gradle)
- **Java Version**: MUST be Java 17 (not 21)
- **Triple-layer protection** against Java 21 errors:
  1. `android/build.gradle` - project-wide force to VERSION_17
  2. `android/variables.gradle` - global javaVersion setting
  3. Automatic fix script runs on every build
- Common issues: SSL certificate errors, Gradle cache corruption
- Fix sequence: certificates → clean cache → fix Java version

### File Sync (robocopy)
- Source: Project root
- Target: `www/`
- Includes: `*.html`, `*.css`, `*.js`, `*.json`, `*.png`
- Excludes: `node_modules`, `android`, `.git`, `.vscode`, `.gemini`, `www`
- Flags: `/S` (subdirs), `/XD` (exclude dirs), `/NFL /NDL /NJH /NJS /nc /ns /np` (minimal output)

## Dependencies

### Core Capacitor Plugins
- `@capacitor/android` ^8.2.0
- `@capacitor/app` ^8.0.1
- `@capacitor/core` ^8.2.0
- `@capacitor/local-notifications` ^8.0.2
- `@capacitor/status-bar` ^8.0.2
- `@codetrix-studio/capacitor-google-auth` ^3.4.0-rc.4

### External Libraries (CDN)
- Material UI CSS: `mui-0.10.3`
- Chart.js (latest)
- Sortable.js 1.15.0
- Canvas Confetti 1.6.0
- Tesseract.js 5.x
- Firebase 10.7.1 (app, auth, firestore)

## Font Stack
- Primary: Plus Jakarta Sans (weights: 300-800)
- Display: Lexend (weights: 700-900)
- Monospace: Montserrat (weights: 300-900)
- Brand: Lemon Milk (logo text)

## Environment Requirements

- **Node.js**: Any recent version
- **Java**: JDK 17 (NOT 21) for Android builds
- **Android Studio**: Required for native builds
- **Windows**: Batch scripts optimized for Windows (bash shell)
- **uv/uvx**: Not applicable (no Python package management)
