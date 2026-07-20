# 📁 Workspace Organization Guide

## Quick Commands (Root Directory)

```bash
.\g "commit message"   # Push to GitHub (safe, no API keys)
.\a                    # Build APK (includes API keys)
```

## Folder Structure

```
wallet-app/
│
├── 📂 scripts/              # Build & utility scripts
│   ├── push.bat            # (backing .\g command)
│   ├── dev.bat             # Development server
│   ├── check-api-safety.bat # Verify API key protection
│   ├── remove-keys-from-git.bat # Emergency key removal
│   └── (other .bat files)
│
├── 📂 docs/                 # Documentation files
│   ├── QUICK_START.md       # Quick start guide
│   ├── API_KEY_SETUP.md     # API key setup instructions
│   ├── GITHUB_COMMIT_GUIDE.md # Safe commit guide
│   └── (other .md files)
│
├── g.bat                   # ⭐ GitHub push (keeps API keys safe)
├── a.bat                   # ⭐ APK build (includes API keys)
├── config.js               # 🔒 Your real API keys (not in GitHub)
├── ai-config.js            # 🔒 Your real AI keys (not in GitHub)
│
└── (your app files)

```

## Accessing Scripts

### From Root Directory:
```bash
.\scripts\dev.bat              # Run development server
.\scripts\check-api-safety.bat  # Check if keys are safe
```

### From PowerShell:
```powershell
& ".\scripts\dev.bat"
```

## Accessing Documentation

```bash
# Quick Start
Get-Content docs\QUICK_START.md

# API Key Setup
Get-Content docs\API_KEY_SETUP.md

# GitHub Guide
Get-Content docs\GITHUB_COMMIT_GUIDE.md
```

## Why This Organization?

✅ **Clean root directory** - Only essential files visible
✅ **Easy access** - Important commands (g, a) stay in root
✅ **Organized** - Scripts and docs in dedicated folders
✅ **Professional** - Standard project structure

## Your Workflow Stays The Same!

```bash
# 1. Make changes to your code
# (edit any files)

# 2. Test locally
.\scripts\dev.bat

# 3. Push to GitHub (safe!)
.\g "Added new feature"

# 4. Build APK
.\a
```

Everything works exactly as before, just cleaner! 🎉
