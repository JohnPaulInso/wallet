# API Key Setup Guide

## 🔐 Keeping Your API Keys Safe

This project uses multiple APIs (Gemini, OpenAI, Firebase) for various features. To keep your API keys secure:

### For Local Development & APK Builds

#### Setup config.js (Main Configuration)

1. **Copy the template file:**
   ```bash
   copy config.template.js config.js
   ```
   
   Or on Mac/Linux:
   ```bash
   cp config.template.js config.js
   ```

2. **Edit `config.js` and add your actual API keys:**
   ```javascript
   export const CONFIG = {
       GEMINI_API_KEY: "YOUR_ACTUAL_GEMINI_KEY",
       OPENAI_API_KEY: "YOUR_ACTUAL_OPENAI_KEY",
       FIREBASE_CONFIG: {
           apiKey: "YOUR_FIREBASE_KEY",
           // ... other Firebase settings
       }
   };
   ```

#### Setup ai-config.js (AI-Specific Configuration)

1. **Copy the template file:**
   ```bash
   copy ai-config.template.js ai-config.js
   ```
   
   Or on Mac/Linux:
   ```bash
   cp ai-config.template.js ai-config.js
   ```

2. **Edit `ai-config.js` and add your Gemini API key:**
   ```javascript
   export const AI_CONFIG = {
       GEMINI_API_KEY: "YOUR_ACTUAL_API_KEY_HERE",
       PROJECT_NUMBER: "64186651619",
       MODEL: "gemini-2.5-flash"
   };
   ```

3. **Both files are already in `.gitignore`** so they won't be committed to GitHub.

### Files Structure

- `config.template.js` - **SAFE TO COMMIT** - Template without real keys
- `config.js` - **NEVER COMMIT** - Your actual keys (already in .gitignore)
- `ai-config.template.js` - **SAFE TO COMMIT** - Template without real keys
- `ai-config.js` - **NEVER COMMIT** - Your actual keys (already in .gitignore)

### What Gets Committed to GitHub?

✅ **Safe to commit:**
- `config.template.js` (template without keys)
- `ai-config.template.js` (template without keys)
- All other code files
- `.gitignore` (which excludes config.js and ai-config.js)

❌ **Never committed (protected by .gitignore):**
- `config.js` (your actual API keys)
- `ai-config.js` (your actual API key)
- `service-account.json`

### For APK Builds

When building your APK:
1. Make sure both `config.js` and `ai-config.js` exist locally with your real API keys
2. Build your APK normally - it will include the keys
3. The APK will work with all features (AI, Firebase, etc.)
4. GitHub repository remains secure without the keys

### How to Get API Keys

#### Gemini API Key
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Get API Key"
4. Copy the key and paste it into both `config.js` and `ai-config.js`

#### OpenAI API Key (Optional)
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Create a new API key
4. Copy the key and paste it into `config.js`

#### Firebase Configuration
1. Visit [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > General
4. Scroll to "Your apps" section
5. Copy the config object and paste it into `config.js`

### Troubleshooting

**Problem:** AI features don't work
- ✅ Check that `config.js` and `ai-config.js` exist (not just the templates)
- ✅ Verify your API keys are correct
- ✅ Ensure the keys have no extra spaces or quotes
- ✅ Check that you copied the template files correctly

**Problem:** Firebase authentication doesn't work
- ✅ Verify `config.js` has the correct Firebase configuration
- ✅ Check that your Firebase project is active
- ✅ Ensure the Firebase API key is valid

**Problem:** API key showed up in GitHub
- ⚠️ If you accidentally committed it, immediately:
  1. Generate new API keys from the respective platforms
  2. Update your local `config.js` and `ai-config.js` with the new keys
  3. Revoke the old keys in their respective platforms (Google AI Studio, OpenAI, Firebase)
  4. Contact GitHub support to remove the commit from history
  5. Consider using `git filter-branch` or `BFG Repo-Cleaner` to remove sensitive data from history

**Problem:** Git is trying to commit config.js
- ✅ Make sure `.gitignore` includes `config.js` and `ai-config.js`
- ✅ If already tracked, remove from Git cache:
  ```bash
  git rm --cached config.js
  git rm --cached ai-config.js
  git commit -m "Remove config files from tracking"
  ```

### Security Best Practices

- ✅ Never share your `config.js` or `ai-config.js` files
- ✅ Never screenshot or paste your API keys in public places
- ✅ Keep your API keys separate from your codebase in production
- ✅ Regularly rotate your API keys
- ✅ Monitor your API usage in respective consoles (Google Cloud, OpenAI, Firebase)
- ✅ Use environment-specific configurations for production deployments
- ✅ Enable API key restrictions in Google Cloud Console (restrict by IP, referrer, or app)
- ✅ Set up billing alerts to detect unusual API usage
- ✅ Review GitHub commits before pushing to ensure no keys are included

## Quick Start Commands

### Initial Setup
```bash
# Copy template files
copy config.template.js config.js
copy ai-config.template.js ai-config.js

# Edit the files with your actual keys (use notepad, VSCode, etc.)
notepad config.js
notepad ai-config.js
```

### Before Committing to GitHub
```bash
# Verify these files are NOT being tracked
git status

# You should NOT see config.js or ai-config.js in the list
# If you do, they're not properly ignored!

# Safe commit (without keys)
git add .
git commit -m "Your commit message"
git push
```

### Verify .gitignore is Working
```bash
# This should show config.js and ai-config.js are ignored
git check-ignore config.js ai-config.js

# If it returns nothing, add them to .gitignore manually
```
