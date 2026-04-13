import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence, signInWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, getDocs, onSnapshot, query, orderBy, where, updateDoc, deleteDoc, deleteField, enableIndexedDbPersistence, writeBatch, increment, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CONFIG } from "./config.js";

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

