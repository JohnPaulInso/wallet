// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBHDN0xLi98qjYYjUf2RDCn5gJK0dzTk_M",
  authDomain: "atome-wallet.firebaseapp.com",
  projectId: "atome-wallet",
  storageBucket: "atome-wallet.firebasestorage.app",
  messagingSenderId: "64186651619",
  appId: "1:64186651619:web:cd7d426cfb663aab6606d6",
  measurementId: "G-2SHWJ6S3Z3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Gmail API Configuration
const GMAIL_API_KEY = firebaseConfig.apiKey;
const GMAIL_CLIENT_ID = "64186651619-YOUR_CLIENT_ID.apps.googleusercontent.com"; // You'll need to get this from Google Cloud Console
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

// Export for use in other files
export {
    app,
    auth,
    db,
    analytics,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    onAuthStateChanged,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    where,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp,
    GMAIL_API_KEY,
    GMAIL_CLIENT_ID,
    GMAIL_SCOPES
};
