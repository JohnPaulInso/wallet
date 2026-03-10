# How to Generate an APK for Wallet App

This guide will walk you through the final steps to create a real APK from your project.

## Prerequisites

- **Android Studio** must be installed on your computer.
- **Java JDK 17+** must be installed.

## Step 1: Open Project in Android Studio

Run the following command in your project folder to open the Android project:

```powershell
npx cap open android
```

Alternatively, open Android Studio and choose "Open" then select the `android` folder in your project directory.

## Step 2: Build the APK

Once Android Studio has finished "Syncing" (check the progress bar at the bottom):

1. Go to the top menu and select **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
2. Android Studio will start building your APK.
3. Once finished, a notification will appear at the bottom right. Click **locate** to find your `app-debug.apk`.

## Step 3: Retaining the "Real APK" feel

To make it feel like a professional app:

- **App Name & Icon**: These are already configured. You can change the icon in `android/app/src/main/res/drawable`.
- **Splash Screen**: Capacitor automatically generates a default splash screen.

## Step 4: Installation

Copy the `app-debug.apk` to your Android phone and open it to install.

---

### Important Notes

- **Updating Code**: If you change your HTML/JS/CSS files, you **must** copy them to the `www` folder and then run:
  ```powershell
  npx cap sync
  ```
- **Authentication**: For Google Login to work on Android, follow the steps in [MOBILE_AUTH_SETUP.md](file:///c:/Users/Lenovo/Desktop/wallet%20app/MOBILE_AUTH_SETUP.md).
- **Production Build**: For a production-ready APK (to upload to Play Store), go to **Build** > **Generate Signed Bundle / APK**.
