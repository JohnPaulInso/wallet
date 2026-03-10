/**
 * Authentication management for the Wallet App
 */
import { auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "./firebase-config.js";
import { log, showToast } from "./app-utils.js";

// Global variables (now managed by this module)
export let tokenClient = null;
export let accessToken = null;
export let tokenRefreshInProgress = false;
export let lastTokenRefreshAttempt = 0;
export const TOKEN_REFRESH_COOLDOWN = 60000; // 1 minute
export let isAuthInProgress = false; // Guard for gate flicker
window.isAuthInProgress = false; // Expose to window for index.html

// Initialize Google Identity Services (GIS)
export function initGIS() {
    if (typeof google === 'undefined') {
        log('GIS library not loaded yet, retrying...', 'warning');
        setTimeout(initGIS, 1000);
        return;
    }
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: '64186651619-g5m873h1uim4n4iv76ovv7skv3jltv8b.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        callback: (resp) => {
            tokenRefreshInProgress = false;
            if (resp.error !== undefined) {
                log('GIS Callback Error: ' + resp.error, 'error');
                return;
            }
            accessToken = resp.access_token;
            localStorage.setItem('g_access_token', accessToken);
            log('Gmail Access Token Acquired.');
            
            // If this was a refresh, maybe resume pending task
            if (window.pendingSyncLimit) {
                if (window.handleScan) window.handleScan(window.pendingSyncLimit, window.pendingSyncManual);
                delete window.pendingSyncLimit;
                delete window.pendingSyncManual;
            }
        },
    });
    log('GIS System Initialized.');
}

// Handle Auth Click (Google Sign-In)
export async function handleAuthClick() {
    log('Starting Google Sign-In Flow...');
    
    // Zero-latency UI feedback
    const btn = event?.currentTarget || document.activeElement;
    if (btn && btn.classList && btn.classList.contains('guest-gate-btn')) {
        btn.classList.add('loading');
    }
    isAuthInProgress = true;
    window.isAuthInProgress = true;

    try {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
        
        // Mark that we just logged in — suppress automatic GIS popup after login
        window.justLoggedIn = true;
        
        // 🚀 NATIVE CAPACITOR SIGN-IN
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            log('📱 Native platform detected, using Capacitor GoogleAuth plugin');
            const { GoogleAuth } = window.Capacitor.Plugins;
            try {
                const user = await GoogleAuth.signIn();
                log('📱 Native Google Sign-In success!');
                
                const { signInWithCredential } = await import("./firebase-config.js");
                const credential = GoogleAuthProvider.credential(user.authentication.idToken);
                
                const result = await signInWithCredential(auth, credential);
                log('📱 Firebase auth with native credential success!');
                handleAuthResult(result.user);
                return;
            } catch (nativeError) {
                log('📱 Native Sign-In Error: ' + nativeError.message, 'error');
                // If it was cancelled, just stop
                if (nativeError.message?.includes('cancel') || nativeError.code === 'CHOSE_NO_ACCOUNT') {
                    throw new Error('Sign-in cancelled');
                }
                // Fallback to popup if native fails but isn't a cancellation
                log('📱 Falling back to web popup...');
            }
        }
        
        try {
            const result = await signInWithPopup(auth, provider);
            log('signInWithPopup success!');
            handleAuthResult(result.user);
        } catch (popupError) {
            if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/cancelled-popup-request') {
                log('Popup blocked. Falling back to redirect...');
                localStorage.setItem('auth_redirect_pending', 'true');
                await signInWithRedirect(auth, provider);
            } else {
                throw popupError;
            }
        }
    } catch (e) {
        window.justLoggedIn = false;
        isAuthInProgress = false;
        window.isAuthInProgress = false;
        const btn = document.querySelector('.guest-gate-btn');
        if (btn) btn.classList.remove('loading');
        
        log('Google Sign-In Error: ' + e.message, 'error');
        showToast('Login failed. Please try again.');
    } finally {
        // We don't remove loading in finally if success, because we want the spinner 
        // to stay until the gate is completely removed by handleAuthResult
    }
}

// Handle Auth Result
export function handleAuthResult(user) {
    if (!user) return;

    log('Auth Detected: ' + user.email + ' [UID: ' + user.uid + ']');
    
    // IMMEDIATELY hide guest gate and sync banner on login success
    const gate = document.getElementById('guestGate');
    if (gate) gate.style.display = 'none';
    const banner = document.getElementById('local-banner');
    if (banner) banner.style.display = 'none';
    
    // Clear progress flags
    isAuthInProgress = false;
    window.isAuthInProgress = false;
    localStorage.removeItem('auth_redirect_pending');

    if (!user.isAnonymous) {
        localStorage.setItem('wallet_auth_type', 'google');
        // ALWAYS mark session as refreshed on login — prevents GIS popup on navigation
        sessionStorage.setItem('gis_session_refreshed', Date.now().toString());
    }
    
    // Save UID for future instant loads
    localStorage.setItem('wallet_last_uid', user.uid);

    // UI Mode Status
    const dbBadge = document.getElementById('mode-status');
    const emailDisplay = document.getElementById('admin-email-display');
    if (dbBadge) {
       dbBadge.className = 'status-chip status-ready';
       if (emailDisplay) emailDisplay.innerText = `(${user.email.toUpperCase()})`;
    }

    // Update UI with full first name
    const fullName = user.displayName || 'User';
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts.length > 1 ? parts.slice(0, 2).join(' ') : parts[0];
    
    const nameEl = document.getElementById('user-display-name');
    if (nameEl) nameEl.textContent = firstName;
    localStorage.setItem('user_name', firstName);
    
    const badge = document.getElementById('profile-badge');
    const picEl = document.getElementById('user-pic');
    if (user.photoURL) {
        let photoUrl = user.photoURL;
        if (photoUrl.includes('googleusercontent.com') && !photoUrl.includes('s96-c')) {
            photoUrl = photoUrl.split('=')[0] + '=s96-c';
        }
        if (picEl) {
            picEl.src = photoUrl;
            picEl.style.display = 'block';
        }
        if (badge) badge.classList.add('has-pic');
        localStorage.setItem('user_pic', photoUrl);
    } else {
        if (badge) badge.classList.remove('has-pic');
    }

    if (user.email) localStorage.setItem('user_email', user.email);

    // Save to NavState for other pages
    if (window.NavState) {
        window.NavState.saveProfile(fullName, user.photoURL || '', user.email);
    }

    // Trigger data load & config monitoring
    if (window.loadData) window.loadData();
    if (typeof window.watchSafeToSpend === 'function') window.watchSafeToSpend();
    
    // Trigger Profile UI update
    if (typeof window.updateProfileUI === 'function') window.updateProfileUI(user);
    if (typeof window.handleLocalModeNudge === 'function') window.handleLocalModeNudge(user);
    if (typeof window.applyUserView === 'function') window.applyUserView(user);
}

// Deep Sign-Out
export async function handleSignout() {
    if (confirm('Sign out?')) {
        log('🚨 Initiating deep sign-out and data purge...');
        
        // Detach realtime listener
        if (window.unsubscribeSnapshot) {
            window.unsubscribeSnapshot();
            window.unsubscribeSnapshot = null;
        }

        localStorage.clear();
        window.allTxns = [];
        
        const historyContainer = document.getElementById('history-container');
        const logContainer = document.getElementById('log-container');
        if (historyContainer) historyContainer.innerHTML = '';
        if (logContainer) logContainer.innerHTML = '';
        
        try {
            await auth.signOut();
            window.location.href = window.location.origin + window.location.pathname + '?logout=true&t=' + Date.now();
        } catch (e) {
            log('Sign out error: ' + e.message, 'error');
        }
    }
}

// Initialize Auth Module
export function initAuth() {
    // Check for redirect result
    getRedirectResult(auth).then((result) => {
        localStorage.removeItem('auth_redirect_pending');
        if (result?.user) handleAuthResult(result.user);
    }).catch((error) => {
        localStorage.removeItem('auth_redirect_pending');
        log('Redirect Auth Error: ' + error.message, 'error');
    });

    // Auth State Listener
    let authWaitStarted = false;
    onAuthStateChanged(auth, async (user) => {
        const isRedirectPending = localStorage.getItem('auth_redirect_pending') === 'true';

        if (!user) {
            if (isRedirectPending) {
                log('Redirect pending detected. Waiting for result...');
                return;
            }

            if (isAuthInProgress) {
                log('Auth is in progress... holding gate.');
                return;
            }

            log('No active session. Showing login gate.');
            const gate = document.getElementById('guestGate');
            if (gate) gate.style.display = 'flex';
            
            // Clear any stale local state
            localStorage.removeItem('wallet_auth_type');
            return;
        }

        // If for some reason we have an anonymous user (legacy), sign them out to force Google login
        if (user.isAnonymous) {
            log('Anonymous session detected (Legacy). Signing out to enforce Google login...');
            await auth.signOut();
            return;
        }

        handleAuthResult(user);
    });

    // Initialize GIS if library is ready
    if (document.readyState === 'complete') {
        initGIS();
    } else {
        window.addEventListener('load', initGIS);
    }
}
