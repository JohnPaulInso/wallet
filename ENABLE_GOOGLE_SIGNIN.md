# 🔧 CRITICAL: Enable Google Sign-In in Firebase

## ⚠️ Why Sign-In Isn't Working

Your code is correct, but **Google Sign-In is not enabled** in your Firebase project. You need to enable it in Firebase Console.

## 🚀 Quick Fix (2 minutes)

### Step 1: Enable Google Authentication

1. **Open Firebase Console Authentication**:

   ```
   https://console.firebase.google.com/project/atome-wallet/authentication/providers
   ```

2. **Click on "Google" in the Sign-in providers list**

3. **Toggle "Enable" to ON**

4. **Add your OAuth Client ID**:

   - Project support email: (select your email)
   - Web SDK configuration:
     - Web client ID: `64186651619-3eb9ki680f4c8q2g2mese3c8hhfur23b.apps.googleusercontent.com`
     - Web client secret: (get this from Google Cloud Console)

5. **Click "Save"**

### Step 2: Get Web Client Secret

1. **Go to Google Cloud Credentials**:

   ```
   https://console.cloud.google.com/apis/credentials?project=atome-wallet
   ```

2. **Click on your OAuth client**: `SmartWallet Web Client`

3. **Copy the "Client secret"** (it's shown next to Client ID)

4. **Go back to Firebase** and paste it in the "Web client secret" field

5. **Click "Save"**

### Step 3: Add Authorized Domain

1. **In Firebase Console, go to Authentication → Settings**:

   ```
   https://console.firebase.google.com/project/atome-wallet/authentication/settings
   ```

2. **Scroll to "Authorized domains"**

3. **Click "Add domain"**

4. **Add**: `localhost`

5. **Click "Add"**

---

## ✅ After Enabling

1. **Refresh your browser** at `http://localhost:5500`
2. **Open browser console** (F12)
3. **Click "Sign in with Google"**
4. **You should see**:
   - Console log: "Sign in button clicked"
   - Console log: "Starting sign in with popup..."
   - Google sign-in popup window opens

---

## 🐛 If You See Errors

### Error: "auth/operation-not-allowed"

✅ **Fix**: Enable Google provider in Firebase Console (Step 1 above)

### Error: "auth/unauthorized-domain"

✅ **Fix**: Add `localhost` to authorized domains (Step 3 above)

### Error: "auth/popup-blocked"

✅ **Fix**: Allow popups in your browser for localhost:5500

### Error: "Error 400: redirect_uri_mismatch"

_(This occurs when your local URL or Firebase URL isn't authorized in Google Cloud)_

✅ **Fix**:

1. Go to [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials?project=atome-wallet).
2. Click the pen icon to edit your **OAuth 2.0 Client ID** (e.g., `SmartWallet Web Client`).
3. Under **Authorized JavaScript origins**, add:
   - **`http://127.0.0.1:5500`** (Your current error specifically mentions this one!)
   - `http://localhost:5500`
   - `https://atome-wallet.firebaseapp.com`
4. Under **Authorized redirect URIs**, add:
   - `https://atome-wallet.firebaseapp.com/__/auth/handler`
5. Click **SAVE** and wait 5 minutes before trying again.

---

## 📋 Complete Checklist

- [ ] Enable Google Sign-in provider in Firebase
- [ ] Add OAuth Client ID to Firebase
- [ ] Add OAuth Client Secret to Firebase
- [ ] Add `localhost` to authorized domains
- [ ] Refresh browser page
- [ ] Click "Sign in with Google"
- [ ] Google popup should appear!

---

## 🎯 What Happens After Sign-In

Once you successfully sign in:

1. ✅ Login screen disappears
2. ✅ Your name and photo appear in header
3. ✅ Transactions load from Firestore
4. ✅ You can click profile → "Sync Gmail" to scan emails
5. ✅ All data syncs to cloud automatically

---

## 🆘 Still Not Working?

**Check browser console** (F12) and look for error messages. The enhanced error handling I just added will show you exactly what's wrong!

Common console messages:

- "Sign in button clicked" → Button works ✅
- "Starting sign in with popup..." → Firebase is trying to sign in ✅
- "Sign in successful: your@email.com" → IT WORKS! 🎉

If you see an error, copy it and send it to me!
