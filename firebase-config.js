import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, getDocs, onSnapshot, query, orderBy, updateDoc, deleteDoc, deleteField, enableIndexedDbPersistence, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyBHDN0xLi98qjYYjUf2RDCn5gJK0dzTk_M",
    authDomain: "atome-wallet.firebaseapp.com",
    projectId: "atome-wallet",
    storageBucket: "atome-wallet.firebasestorage.app",
    messagingSenderId: "64186651619",
    appId: "1:64186651619:web:cd7d426cfb663aab6606d6",
    measurementId: "G-2SHWJ6S3Z3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Pre-set persistence
setPersistence(auth, browserLocalPersistence).catch(e => console.error("Persistence error", e));

// Export core instances
export { app, auth, db };

// Re-export Firebase methods for convenience in other modules
export { 
    doc, getDoc, setDoc, addDoc, collection, serverTimestamp, getDocs, onSnapshot, query, orderBy, updateDoc, deleteDoc, deleteField, enableIndexedDbPersistence, writeBatch,
    signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged
};
