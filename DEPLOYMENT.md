# Smart Wallet - Deployment Guide

## Quick Deployment

### Automated Deployment (Recommended)

#### Windows Users
```bash
# Run the deployment script with a custom commit message
deploy.bat "Your commit message here"

# Or run with default message
deploy.bat
```

#### Linux/Mac Users
```bash
# Make script executable (first time only)
chmod +x deploy.sh

# Run the deployment script with a custom commit message
./deploy.sh "Your commit message here"

# Or run with default message
./deploy.sh
```

#### Using npm script (Cross-platform)
```bash
# Run with default commit message
npm run deploy

# Note: To use custom commit message, use the platform-specific script above
```

---

## What the Deployment Script Does

The automated deployment script performs all these steps in sequence:

1. **Build** - Runs `npm run build` to sync files to www folder
2. **Capacitor Sync** - Runs `npx cap sync android` to sync with native Android
3. **Android Studio** - Opens Android Studio for verification (optional)
4. **Git Add** - Stages all changes with `git add .`
5. **Git Commit** - Commits changes with your message
6. **Git Push** - Pushes to main branch
7. **EAS Update** - Publishes update with `npx eas update --branch main`

---

## Manual Deployment Steps

If you prefer to run commands manually:

```bash
# 1. Build the project
npm run build

# 2. Sync with Capacitor
npx cap sync android

# 3. (Optional) Open Android Studio
npx cap open android

# 4. Stage changes
git add .

# 5. Commit changes
git commit -m "Your commit message"

# 6. Push to main branch
git push origin main

# 7. Publish EAS update
npx eas update --branch main --message "Your update message"
```

---

## Important Notes

### Before Running Deployment

- Ensure all your changes are complete and tested
- Make sure you're on the `main` branch
- Verify you have proper git credentials configured

### Command Verification

The correct sequence ensures:
- ✅ `npm run build` copies files to www folder (via robocopy)
- ✅ `npx cap sync android` syncs www to Android assets
- ✅ `npx cap open android` opens project in Android Studio
- ✅ All changes are committed and pushed
- ✅ EAS update publishes to users

### Troubleshooting

**If build fails:**
- Check that all files are saved
- Verify npm is installed correctly
- Check for syntax errors in code

**If Capacitor sync fails:**
- Ensure Capacitor CLI is installed: `npm install -g @capacitor/cli`
- Check that android folder exists

**If git push fails:**
- Verify you have push access to the repository
- Check your git credentials
- Ensure you're on the correct branch

**If EAS update fails:**
- Verify EAS CLI is installed: `npm install -g eas-cli`
- Check that you're logged in: `eas login`
- Verify project is configured for EAS updates

---

## Design System Documentation

For comprehensive design guidelines, see **design-rules.txt**:
- Complete spacing system
- Typography hierarchy
- Color palette
- Modal design patterns
- Animation specifications
- Button variants
- And much more...

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Sync files to www folder |
| `npm run deploy` | Run full deployment (Windows .bat automatically) |
| `deploy.bat` | Windows automated deployment |
| `./deploy.sh` | Linux/Mac automated deployment |
| `npx cap sync android` | Sync to Android native |
| `npx cap open android` | Open in Android Studio |
| `npx eas update` | Publish over-the-air update |

---

**Last Updated:** 2026-06-29
