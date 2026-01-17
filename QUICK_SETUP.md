# Quick Setup Guide - Get Gmail Scanning Working

## 🎯 Goal

Enable Google Sign-In and Gmail scanning in your SmartWallet app.

## 📋 Prerequisites

- You already have Firebase project: `atome-wallet`
- Firebase config is already in your code ✅

## 🚀 Step-by-Step Setup

### Step 1: Enable Gmail API (2 minutes)

1. **Open this link** (it will take you directly to Gmail API):

   ```
   https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=atome-wallet
   ```

2. **Click the blue "ENABLE" button**
   - If it says "MANAGE" instead, it's already enabled ✅

### Step 2: Configure OAuth Consent Screen (3 minutes)

1. **Go to OAuth consent screen**:

   ```
   https://console.cloud.google.com/apis/credentials/consent?project=atome-wallet
   ```

2. **If not configured yet**:

   - User Type: Select **"External"**
   - Click **"CREATE"**

3. **Fill in App Information**:

   - App name: `SmartWallet`
   - User support email: (your email)
   - Developer contact: (your email)
   - Click **"SAVE AND CONTINUE"**

4. **Add Scopes**:

   - Click **"ADD OR REMOVE SCOPES"**
   - Search for: `gmail.readonly`
   - Check the box for: `https://www.googleapis.com/auth/gmail.readonly`
   - Click **"UPDATE"**
   - Click **"SAVE AND CONTINUE"**

5. **Add Test Users**:

   - Click **"+ ADD USERS"**
   - Enter your Gmail address
   - Click **"ADD"**
   - Click **"SAVE AND CONTINUE"**

6. **Review and go back to dashboard**

### Step 3: Create OAuth Client ID (2 minutes)

1. **Go to Credentials**:

   ```
   https://console.cloud.google.com/apis/credentials?project=atome-wallet
   ```

2. **Create Credentials**:

   - Click **"+ CREATE CREDENTIALS"** (top of page)
   - Select **"OAuth client ID"**

3. **Configure the Client**:

   - Application type: **"Web application"**
   - Name: `SmartWallet Web Client`

4. **Add Authorized JavaScript origins** (where the app runs):
   _If you use VS Code Live Server, it's usually 5500. If you use Python/Node, it's 8000._

   ```
   http://localhost
   http://localhost:5500
   http://localhost:8000
   http://127.0.0.1:5500
   http://127.0.0.1:8000
   https://atome-wallet.firebaseapp.com
   ```

5. **Wait! THIS IS CRITICAL - Add Authorized redirect URIs**:
   _You MUST add the Firebase Auth Handler URI here for login to work._

   ```
   https://atome-wallet.firebaseapp.com/__/auth/handler
   ```

6. **Click "CREATE"**

7. **COPY YOUR CLIENT ID** - it looks like:
   ```
   64186651619-abc123xyz789def456.apps.googleusercontent.com
   ```
   ⚠️ **SAVE THIS - YOU'LL NEED IT IN THE NEXT STEP!**

### Step 4: Update Your Code (1 minute)

**I'll do this for you automatically in the next step!**

Just paste your Client ID when I ask for it.

### Step 5: Run a Local Server (1 minute)

Google OAuth doesn't work with `file://` protocol. You need to run a local server.

**Option A: Using Python** (if you have Python installed):

```bash
cd "C:\Users\Lenovo\Desktop\wallet app"
python -m http.server 8000
```

**Option B: Using Node.js** (if you have Node.js):

```bash
cd "C:\Users\Lenovo\Desktop\wallet app"
npx http-server -p 8000
```

**Option C: Using VS Code**:

- Install "Live Server" extension
- Right-click `index.html` → "Open with Live Server"

Then open: `http://localhost:8000`

---

## ✅ After Setup

Once you have your Client ID, tell me and I'll update the code for you!

Then you can:

1. Open `http://localhost:8000` in your browser
2. Click "Sign in with Google"
3. Grant permissions
4. Click your profile → "Sync Gmail"
5. Watch transactions appear automatically! 🎉

---

## 🆘 Need Help?

**Can't find the OAuth consent screen?**

- Make sure you're logged into the correct Google account
- The project must be `atome-wallet`

**Client ID not working?**

- Make sure you added `http://localhost:8000` to authorized origins
- Clear browser cache and try again

**Gmail sync not finding emails?**

- Make sure you have transaction emails in your Gmail
- Check that you granted Gmail read permission

---

## 📝 What to Tell Me

Once you complete Steps 1-3, just send me your **Client ID** and I'll update the code automatically!

It should look like:

```
64186651619-abc123xyz789def456.apps.googleusercontent.com
```
