# 📱 Mobile Google Auth Setup Guide

To make Google Login work inside your Android APK, you must register your Android app in Firebase with a **SHA-1 certificate fingerprint**. This is a security requirement from Google.

## Step 1: Find your SHA-1 Fingerprint

**Method A: Using the Terminal (Fastest)**

1. Open a terminal in your project's `android` folder.
2. Run: `./gradlew signingReport`
3. Scroll up to find the **SHA-1** under `Variant: debug`.

**Method B: Using Android Studio Gradle Tab**

1. If the list is empty (shows "Task list not built"):
   - Go to **File > Settings > Experimental**.
   - **Uncheck** "Do not build Gradle task list during Gradle sync".
   - Click **Sync Project with Gradle Files** (elephant icon).
2. Now go to the **Gradle** tab on the right.
3. Navigate to: `android` > `app` > `Tasks` > `android` > `signingReport`.
4. Double-click it and copy the **SHA-1** value.

## Step 2: Add Android App to Firebase

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click the **Project Overview** (gear icon) > **Project settings**.
3. Under **Your apps**, click **Add app** and select the **Android** icon.
4. **Android package name**: `com.johnpaulinso.wallet` (must match `capacitor.config.ts`).
5. **App nickname**: `Wallet Android`.
6. **Debug signing certificate SHA-1**: Paste the SHA-1 you copied in Step 1.
7. Click **Register app**.

## Step 3: Download and Place config file

1. Download the `google-services.json` file provided by Firebase.
2. Place it in your project folder under: `android/app/google-services.json`.

## Step 4: Sync and Build

1. Run this command in your project folder:
   ```powershell
   npx cap sync android
   ```
2. In Android Studio, click **Sync Project with Gradle Files** (elephant icon in top toolbar).
3. Build your APK again (**Build > Build APK(s)**).

---

### 💡 Why this is better

By using this native method, the app won't open Chrome anymore. It will show the official Android Google account picker, which is faster and more secure!
