/**
 * Authentication management for the Wallet App
 */
import { auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signInAnonymously } from "./firebase-config.js";
import { log, showToast } from "./app-utils.js";

// Global variables (now managed by this module)
export let tokenClient = null;
export let accessToken = null;
export let tokenRefreshInProgress = false;
export let lastTokenRefreshAttempt = 0;
export const TOKEN_REFRESH_COOLDOWN = 60000; // 1 minute

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
    if (btn && btn.classList) btn.style.opacity = '0.5';

    try {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
        
        // Mark that we just logged in — suppress automatic GIS popup after login
        window.justLoggedIn = true;
        
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
        log('Google Sign-In Error: ' + e.message, 'error');
        showToast('Login failed. Please try again.');
    } finally {
        if (btn && btn.classList) btn.style.opacity = '1';
    }
}

// Handle Auth Result
export function handleAuthResult(user) {
    if (!user) return;

    log('Auth Detected: ' + (user.isAnonymous ? 'Guest' : user.email) + ' [UID: ' + user.uid + ']');
    
    // IMMEDIATELY hide guest gate and sync banner on login success
    const gate = document.getElementById('guestGate');
    if (gate) gate.style.display = 'none';
    const banner = document.getElementById('local-banner');
    if (banner) banner.style.display = 'none';

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
       dbBadge.className = 'status-chip ' + (user.isAnonymous ? 'status-local' : 'status-ready');
       if (emailDisplay) emailDisplay.innerText = user.isAnonymous ? '(UNSYNCED)' : `(${user.email.toUpperCase()})`;
    }

    // Update UI with full first name
    const fullName = user.displayName || (user.isAnonymous ? 'Guest' : 'User');
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
    if (window.NavState && !user.isAnonymous) {
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
        if (result?.user) handleAuthResult(result.user);
    }).catch((error) => {
        log('Redirect Auth Error: ' + error.message, 'error');
    });

    // Auth State Listener
    let authWaitStarted = false;
    onAuthStateChanged(auth, async (user) => {
        const isRedirectPending = localStorage.getItem('auth_redirect_pending') === 'true';
        const lastAuthType = localStorage.getItem('wallet_auth_type');

        if (!user) {
            if (isRedirectPending) {
                log('Redirect pending detected. Holding anonymous fallback...');
                return; // Wait for getRedirectResult to finish
            }

            // PERSISTENCE FIX: If we previously had a google session, wait before falling back to guest
            if (lastAuthType === 'google' && !authWaitStarted) {
                authWaitStarted = true;
                log('Waiting for persistent Google session...');
                setTimeout(() => {
                    if (!auth.currentUser) {
                        log('Google session not found after timeout. Using local fallback.');
                        signInAnonymously(auth).catch(e => log('Local session error: ' + e.message, 'error'));
                    }
                }, 12000);
                return;
            }

            log('Establishing secure local session...');
            signInAnonymously(auth).catch(e => log('Local session error: ' + e.message, 'error'));
            
            // Show guest gate after delay
            setTimeout(() => {
                const redirectActive = localStorage.getItem('auth_redirect_pending') === 'true';
                if ((!auth.currentUser || auth.currentUser.isAnonymous) && !window.justLoggedIn && !redirectActive) {
                    const gate = document.getElementById('guestGate');
                    if (gate) gate.style.display = 'flex';
                }
            }, 2000);
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
