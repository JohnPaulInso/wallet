import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, getDocs, onSnapshot, query, orderBy, where, updateDoc, deleteDoc, deleteField, enableIndexedDbPersistence, writeBatch, increment, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// (2026-07-13) Fallback Firebase config when config.js missing; prev: static import
const CONFIG = await import("./config.js").then(m => m.CONFIG).catch(() => ({
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyBHDN0xLi98qjYYjUf2RDCn5gJK0dzTk_M",
        authDomain: "atome-wallet.firebaseapp.com",
        projectId: "atome-wallet",
        storageBucket: "atome-wallet.firebasestorage.app",
        messagingSenderId: "64186651619",
        appId: "1:64186651619:web:cd7d426cfb663aab6606d6",
        measurementId: "G-2SHWJ6S3Z3"
    }
}));
export { CONFIG };

// FIREBASE CONFIG
const firebaseConfig = CONFIG.FIREBASE_CONFIG;

// Initialize Firebase only if no apps exist
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// Pre-set persistence
// browserLocalPersistence is default in Capacitor, but setting explicitly for clarity
setPersistence(auth, browserLocalPersistence).catch(e => console.error("Persistence error", e));

// Export core instances
export { app, auth, db };

// [NEW: GLOBAL BRIDGE - 2026-04-03]
// Expose modules to window for non-module scripts like accounts-logic.js
window.FirebaseModule = {
    app, auth, db,
    doc, getDoc, setDoc, addDoc, collection, serverTimestamp, 
    getDocs, onSnapshot, query, orderBy, where, updateDoc, 
    deleteDoc, deleteField, enableIndexedDbPersistence, writeBatch, increment, limit,
    GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signInWithCredential
};

export { 
    doc, getDoc, setDoc, addDoc, collection, serverTimestamp, getDocs, onSnapshot, query, orderBy, where, updateDoc, deleteDoc, deleteField, enableIndexedDbPersistence, writeBatch, increment, limit,
    GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signInWithCredential
};

