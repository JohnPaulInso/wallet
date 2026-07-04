# 🔑 API Key Files Explained

## Visual Guide to Your File Structure

```
wallet-app/
│
├── 📄 config.template.js          ✅ SAFE TO COMMIT
│   └── Template without real keys
│
├── 🔒 config.js                   ❌ NEVER COMMIT (in .gitignore)
│   └── YOUR REAL API KEYS HERE
│
├── 📄 ai-config.template.js       ✅ SAFE TO COMMIT
│   └── Template without real keys
│
├── 🔒 ai-config.js                ❌ NEVER COMMIT (in .gitignore)
│   └── YOUR REAL API KEYS HERE
│
├── 📝 .gitignore                  ✅ SAFE TO COMMIT
│   └── Lists files to exclude
│
└── 🛡️ Safety Scripts              ✅ SAFE TO COMMIT
    ├── push.bat (checks before pushing)
    ├── check-api-safety.bat (verify setup)
    └── remove-keys-from-git.bat (fix mistakes)
```

---

## 🎯 File Purposes

### Template Files (Safe to Commit)

#### `config.template.js`
```javascript
export const CONFIG = {
    GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",  // ← Placeholder
    OPENAI_API_KEY: "YOUR_OPENAI_API_KEY_HERE",  // ← Placeholder
    FIREBASE_CONFIG: { ... }                      // ← Placeholder
};
```
**Purpose**: Shows other developers what keys they need
**Status**: ✅ Safe to commit to GitHub
**Contains**: Only placeholders, no real keys

#### `ai-config.template.js`
```javascript
export const AI_CONFIG = {
    GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",  // ← Placeholder
    PROJECT_NUMBER: "YOUR_PROJECT_NUMBER_HERE",   // ← Placeholder
    MODEL: "gemini-2.5-flash"
};
```
**Purpose**: Template for AI-specific configuration
**Status**: ✅ Safe to commit to GitHub
**Contains**: Only placeholders, no real keys

---

### Real Config Files (NEVER Commit)

#### `config.js` 
```javascript
export const CONFIG = {
    GEMINI_API_KEY: "AQ.Ab8RN6Kb41zwsibOO...",  // ← YOUR REAL KEY
    OPENAI_API_KEY: "sk-proj-xjrVTiTm3pa...",   // ← YOUR REAL KEY
    FIREBASE_CONFIG: { 
        apiKey: "AIzaSyBHDN0xLi98qjYYjUf...",   // ← YOUR REAL KEY
        // ...
    }
};
```
**Purpose**: Contains your actual API keys
**Status**: ❌ NEVER commit - protected by .gitignore
**Contains**: Real, working API keys
**Location**: Only on your computer

#### `ai-config.js`
```javascript
export const AI_CONFIG = {
    GEMINI_API_KEY: "AQ.Ab8RN6Kb41zwsibOO...",  // ← YOUR REAL KEY
    PROJECT_NUMBER: "64186651619",
    MODEL: "gemini-2.5-flash"
};
```
**Purpose**: Contains your actual Gemini API key
**Status**: ❌ NEVER commit - protected by .gitignore
**Contains**: Real, working API key
**Location**: Only on your computer

---

## 🔄 Workflow Visualization

### When You Work Locally

```
Your Computer
┌─────────────────────────────────┐
│                                 │
│  📁 wallet-app/                 │
│  ├── config.js          🔑 ✓   │ ← Has real keys
│  ├── ai-config.js       🔑 ✓   │ ← Has real keys
│  ├── config.template.js    ✓   │ ← Placeholder only
│  └── ai-config.template.js ✓   │ ← Placeholder only
│                                 │
│  APK Build uses config.js      │ ← APK works!
│                                 │
└─────────────────────────────────┘
```

### When You Push to GitHub

```
Your Computer                      GitHub Repository
┌────────────────┐                ┌────────────────────┐
│                │   git push     │                    │
│ config.js  🔑  │   ─────────X   │ (not uploaded)     │
│ ai-config.js🔑 │   ─────────X   │ (not uploaded)     │
│                │                │                    │
│ config.template│   ───────────> │ config.template ✓  │
│ ai-config.templ│   ───────────> │ ai-config.templ ✓  │
│ .gitignore     │   ───────────> │ .gitignore ✓       │
│ All other code │   ───────────> │ All other code ✓   │
│                │                │                    │
└────────────────┘                └────────────────────┘
         🔒                                📖
    Real keys stay             Only code and templates
```

### When Someone Clones Your Repo

```
GitHub Repository                 New Developer's Computer
┌────────────────────┐           ┌──────────────────────────┐
│                    │  git clone│                          │
│ config.template ✓  │ ────────> │ config.template ✓        │
│ ai-config.templ ✓  │ ────────> │ ai-config.templ ✓        │
│ .gitignore ✓       │ ────────> │ .gitignore ✓             │
│ All code ✓         │ ────────> │ All code ✓               │
│                    │           │                          │
│ (no real keys)     │           │ They need to:            │
│                    │           │ 1. Copy templates        │
│                    │           │ 2. Get their own keys    │
│                    │           │ 3. Create config.js      │
│                    │           │ 4. Create ai-config.js   │
└────────────────────┘           └──────────────────────────┘
```

---

## 🎬 Step-by-Step: What Happens When...

### Scenario 1: You Build an APK
```
1. Android Studio looks for config.js        ✓ Found (has real keys)
2. Build process includes config.js          ✓ APK has keys
3. APK runs on phone                         ✓ AI features work
4. GitHub doesn't have config.js             ✓ Keys stay private
```

### Scenario 2: You Commit to GitHub
```
1. You run: .\push.bat "My changes"
2. Script checks for config.js               ✓ Not in Git tracking
3. Script checks for ai-config.js            ✓ Not in Git tracking
4. Git adds all other files                  ✓ Safe to proceed
5. Commits and pushes                        ✓ No keys uploaded
```

### Scenario 3: New Developer Clones
```
1. They clone from GitHub                    ✓ Gets all code
2. They see config.template.js               ✓ Knows what keys needed
3. They copy: config.template.js → config.js ✓ Creates local file
4. They add their own API keys               ✓ Gets their own keys
5. They build APK                            ✓ APK works for them
```

---

## 📊 Quick Reference Table

| File | Commit to GitHub? | Has Real Keys? | Location | Purpose |
|------|-------------------|----------------|----------|---------|
| `config.js` | ❌ NO | ✅ YES | Local only | Your real API keys |
| `ai-config.js` | ❌ NO | ✅ YES | Local only | Your real Gemini key |
| `config.template.js` | ✅ YES | ❌ NO | GitHub + Local | Documentation/template |
| `ai-config.template.js` | ✅ YES | ❌ NO | GitHub + Local | Documentation/template |
| `.gitignore` | ✅ YES | ❌ NO | GitHub + Local | Protection rules |
| `push.bat` | ✅ YES | ❌ NO | GitHub + Local | Safety script |

---

## 🎓 Key Concepts

### The "Kitchen Analogy"

- **🏠 Your Kitchen (Local)**: Has all secret ingredients (real API keys)
- **📖 Recipe Book (GitHub)**: Only has the recipe (code + templates)
- **🍽️ Restaurant Dish (APK)**: Made in your kitchen with real ingredients
- **👨‍🍳 Other Chefs (Developers)**: Get the recipe, use their own ingredients

### The ".gitignore Shield"

Think of `.gitignore` as a **bouncer at a club**:
- `config.js` tries to enter → ❌ "You're on the list, stay out"
- `config.template.js` tries to enter → ✅ "Come right in!"
- Git sees the bouncer's list and respects it

---

## ✅ Verification Checklist

Run `.\check-api-safety.bat` to verify all of these:

- [ ] `.gitignore` contains `config.js`
- [ ] `.gitignore` contains `ai-config.js`
- [ ] `config.js` exists locally (with real keys)
- [ ] `ai-config.js` exists locally (with real keys)
- [ ] `config.template.js` exists (safe to commit)
- [ ] `ai-config.template.js` exists (safe to commit)
- [ ] `git status` doesn't show `config.js`
- [ ] `git status` doesn't show `ai-config.js`

---

## 🆘 Emergency Procedures

### "I Accidentally Committed API Keys!"

1. **STOP** - Don't panic
2. **RUN**: `.\remove-keys-from-git.bat`
3. **GENERATE NEW KEYS** immediately
4. **UPDATE** local `config.js` with new keys
5. **REVOKE** old keys in their platforms
6. **COMMIT**: `git commit -m "Remove sensitive files"`
7. **PUSH**: `git push`

### "Someone Else Needs Access"

1. **DON'T** send them your `config.js`
2. **DO** direct them to:
   - Clone the repo
   - Read `API_KEY_SETUP.md`
   - Create their own keys
   - Copy templates and use their keys

---

**Remember**: Template files are like instruction manuals - safe to share. Real config files are like house keys - never share! 🔐
