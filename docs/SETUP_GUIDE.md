# Firebase & Gmail Integration Setup Guide

## 🎯 What's Been Implemented

Your SmartWallet app now has:

- ✅ **Google Sign-In** with Firebase Authentication
- ✅ **Firestore Database** for cloud storage of transactions
- ✅ **Gmail API Integration** to scan transaction emails
- ✅ **Automatic Transaction Extraction** from emails
- ✅ **Real-time Sync** across devices

## 🔧 One More Step Required

To enable Gmail scanning, you need to get an **OAuth 2.0 Client ID** from Google Cloud Console.

### Steps to Get OAuth Client ID:

1. **Go to Google Cloud Console**

   - Visit: https://console.cloud.google.com/apis/credentials?project=atome-wallet

2. **Create OAuth 2.0 Client ID**
   - Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
   - Application type: **Web application**
   - Name: `SmartWallet Web Client`
3. **Configure Authorized Origins**

   - Add: `http://localhost`
   - Add: `http://127.0.0.1`
   - Add any other domains where you'll host the app

4. **Configure Authorized Redirect URIs**

   - Add: `http://localhost`
   - Add: `https://atome-wallet.firebaseapp.com`

5. **Copy the Client ID**

   - After creating, copy the **Client ID** (looks like: `64186651619-xxxxxxxxxx.apps.googleusercontent.com`)

6. **Update the Code**
   - Open `index.html`
   - Find line ~3760: `client_id: '64186651619-YOUR_CLIENT_ID.apps.googleusercontent.com'`
   - Replace `YOUR_CLIENT_ID` with your actual client ID

## 🚀 How to Use

### 1. Sign In

- Open `index.html` in your browser
- Click **"Sign in with Google"**
- Grant permissions for Gmail access

### 2. Sync Gmail

- Click your profile picture (top right)
- Click **"Sync Gmail"**
- The app will scan your emails for transactions

### 3. View Transactions

- Transactions from Gmail will appear automatically
- They're also saved to Firestore for persistence

### 4. Manual Transactions

- Click the **+** button to add manual transactions
- These are also synced to Firestore

## 📊 Database Structure

Your data is stored in Firestore:

```
users/{userId}/
  ├── email
  ├── displayName
  ├── photoURL
  ├── lastSync
  └── transactions/{transactionId}/
      ├── name
      ├── amount
      ├── category
      ├── date
      ├── source (gmail or manual)
      └── timestamp
```

## 🔍 Email Scanning

The app scans for emails containing:

- Subject: "transaction", "payment", "purchase", "atome"
- From: "atome", "bank", "payment"

It automatically categorizes based on keywords:

- **Shopping**: mall, shopee, lazada, etc.
- **Fuel**: shell, petron, seaoil, etc.
- **Food**: jollibee, mcdo, restaurants, etc.
- **Service**: globe, smart, pldt, bills, etc.

## 🛡️ Security

- All authentication is handled by Firebase
- Your Gmail is accessed read-only
- Data is stored securely in Firestore
- Only you can access your data

## 🐛 Troubleshooting

**Login doesn't work?**

- Make sure you've enabled Google Authentication in Firebase Console
- Check browser console for errors

**Gmail sync fails?**

- Make sure you've added the OAuth Client ID
- Grant Gmail permissions when prompted

**Transactions not showing?**

- Check Firestore rules allow read/write for authenticated users
- Open browser console to see any errors

## 📱 Next Steps

1. Get the OAuth Client ID (see above)
2. Test the sign-in flow
3. Try syncing Gmail
4. Check Firestore Console to see your data

Enjoy your AI-powered finance tracker! 🎉
