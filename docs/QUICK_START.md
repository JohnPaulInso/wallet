# 🚀 Quick Start - First Time Setup

## For New Developers Cloning This Repo

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/wallet-app.git
cd wallet-app
```

### 2. Set Up API Keys (REQUIRED)
```bash
# Copy template files
copy config.template.js config.js
copy ai-config.template.js ai-config.js

# Edit with your API keys
notepad config.js
notepad ai-config.js
```

**Get your API keys from:**
- 🤖 Gemini: https://makersuite.google.com/app/apikey
- 🔥 Firebase: https://console.firebase.google.com/
- 💬 OpenAI (optional): https://platform.openai.com/api-keys

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Development Server
```bash
.\dev.bat
# Or: npm start
```

### 5. Build APK
```bash
npm run build
npx cap sync
npx cap open android
# Build APK in Android Studio
```

---

## For the Original Developer (You!)

### Commit to GitHub Safely
```bash
# Method 1: Use the safe push script
.\push.bat "Your commit message"

# Method 2: Verify then commit
.\check-api-safety.bat
git add .
git commit -m "Your message"
git push
```

### Your Files Status
- ✅ `config.js` - HAS your real keys (stays local)
- ✅ `ai-config.js` - HAS your real keys (stays local)
- ✅ `config.template.js` - NO keys (safe to commit)
- ✅ `ai-config.template.js` - NO keys (safe to commit)

### What Happens When You Push?
1. ❌ `config.js` and `ai-config.js` - Ignored by Git (not uploaded)
2. ✅ Template files - Uploaded to GitHub
3. ✅ All other code - Uploaded to GitHub
4. 🔒 Your API keys - Stay safe on your computer
5. 📱 APK - Built with your local files (includes keys)

---

## ⚡ Common Commands

```bash
# Check if API keys are safe
.\check-api-safety.bat

# Safe commit and push
.\push.bat "Update features"

# Run development server
.\dev.bat

# Verify Git status (config.js should NOT appear)
git status

# Build for production
npm run build
npx cap sync
```

---

## 🆘 Troubleshooting

### "AI features don't work"
→ Make sure `config.js` and `ai-config.js` exist with real API keys

### "Git wants to commit config.js"
→ Run: `git rm --cached config.js ai-config.js`
→ Check: `.gitignore` includes these files

### "I accidentally committed API keys"
→ Read: `GITHUB_COMMIT_GUIDE.md` section "If You Already Committed API Keys"
→ Generate new keys immediately!

---

## 📚 More Information

- **Full setup guide**: `API_KEY_SETUP.md`
- **Safe commits**: `GITHUB_COMMIT_GUIDE.md`
- **Project docs**: `README.md`

**You're all set! Start coding! 🎉**
