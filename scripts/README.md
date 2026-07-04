# 🔧 Scripts Folder

This folder contains all build and utility scripts for the SmartWallet project.

## Main Scripts

### Development
- **dev.bat** - Start development server (`npm start`)

### API Key Safety
- **check-api-safety.bat** - Verify API keys are protected
- **remove-keys-from-git.bat** - Emergency: Remove keys from Git tracking

### Build & Deploy  
- **push.bat** - Push to GitHub with safety checks (backing `.\g` command)

### Android/Gradle Fixes
- **fix-ssl-certificates.bat**
- **fix-gradle-properties.bat**
- **auto-clean-gradle.bat**
- **final-fix.bat**
- **fix-java-certificates-final.bat**
- **fix-java-version.bat**

## Usage

From root directory:
```bash
.\scripts\dev.bat
.\scripts\check-api-safety.bat
```

## Note
The main commands `.\g` and `.\a` are in the root directory for convenience.
