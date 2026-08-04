# Bills Firestore Sync Fix - Cross-Device Visibility

## Problem
Bills are not visible on mobile/APK or other devices because they're only saving to localStorage (device-specific storage) and not syncing to Firestore (cloud database).

## Root Cause
The `saveBills()` function queues Firestore saves BUT doesn't check if the user is authenticated first. When bills are saved without authentication:
- ✅ localStorage saves immediately (works offline)
- ❌ Firestore save fails silently (no user logged in)
- ❌ No warning shown to user
- ❌ Bills stay local-only

## Solution Applied (v5.8)

### 1. Authentication Check in saveBills()
Added explicit authentication check before queuing Firestore saves:

```javascript
saveBills: async function() {
    // ... localStorage save first ...
    
    // CRITICAL FIX: Check if user is authenticated
    const uid = window.auth?.currentUser?.uid;
    if (!uid) {
        console.warn('⚠️ No authenticated user - bills saved locally only');
        if (window.showToast) {
            window.showToast('⚠️ Saved locally - sign in to sync across devices');
        }
        return; // Don't queue Firestore save
    }
    
    // Only queue if authenticated
    this._pendingSaves.push(saveOperation);
    await this._executePendingSaves();
}
```

### 2. Auth State Listener for Auto-Sync
Added listener in `init()` to automatically sync local bills when user logs in:

```javascript
init: function() {
    // ... existing init code ...
    
    // NEW: Auto-sync bills when user logs in
    if (window.auth && window.auth.onAuthStateChanged) {
        window.auth.onAuthStateChanged((user) => {
            if (user && this.bills.length > 0) {
                console.log('🔐 User logged in - syncing local bills to Firestore');
                setTimeout(() => this.saveBills(), 1000);
            }
        });
    }
}
```

### 3. Enhanced Console Logging
Added detailed logging to help debug sync issues:
- `📋 [saveId] Queued for Firestore sync (authenticated as: xxx...)` - Confirms user is authenticated
- `⚠️ [saveId] No authenticated user` - Shows when saves fail due to no auth
- `📤 [saveId] Saving to Firestore...` - Shows actual Firestore operation
- `✅ [saveId] Firestore save successful` - Confirms sync worked

## How It Works Now

### Scenario 1: User is Logged In
1. User adds/edits bill
2. `saveBills()` saves to localStorage instantly
3. Checks auth → user logged in ✓
4. Queues Firestore save with user ID
5. Saves to `/users/{uid}/config/calendar_bills`
6. Bill appears on all devices via real-time listener

### Scenario 2: User is NOT Logged In
1. User adds/edits bill (guest mode)
2. `saveBills()` saves to localStorage instantly
3. Checks auth → no user ✗
4. Shows toast: "Saved locally - sign in to sync"
5. Returns early (no Firestore save attempted)
6. Bill stays on current device only

### Scenario 3: User Logs In Later
1. User was in guest mode, added bills
2. Bills saved to localStorage only
3. User signs in with Google
4. Auth state listener fires
5. Detects local bills exist
6. Automatically calls `saveBills()`
7. Now syncs to Firestore with user ID
8. Bills appear on all devices

## Testing Steps

### Test 1: Verify Firestore Sync When Logged In
1. Sign in to the app
2. Add a new bill
3. Open browser console
4. Look for: `✅ [saveId] Firestore save successful`
5. Open app on another device with same account
6. Bill should appear immediately

### Test 2: Verify Warning When Not Logged In
1. Sign out (guest mode)
2. Add a new bill
3. Should see toast: "Saved locally - sign in to sync"
4. Check console for: `⚠️ No authenticated user`

### Test 3: Verify Auto-Sync on Login
1. Start in guest mode
2. Add several bills
3. Sign in with Google
4. Check console for: `🔐 User logged in - syncing local bills`
5. Wait 2 seconds
6. Open app on another device
7. Bills should appear

## Debugging Commands

Run in browser console to check sync status:

```javascript
// Check if user is authenticated
console.log('User:', window.auth?.currentUser?.uid);

// Check bills data
console.log('Bills:', window.CalendarView.bills);

// Check sync queue
console.log('Pending saves:', window.CalendarView._pendingSaves);

// Check sync status
console.log(window.CalendarView.getSyncStatus());

// Force manual sync
window.CalendarView.forceSyncToFirestore();
```

## Related Files
- `wallet app/calendar-logic.js` (lines 107-145 init, 350-420 saveBills)
- `wallet app/.kiro/FIRESTORE_SYNC_PATTERN.md` (sync architecture)
- `wallet app/.kiro/BILLS_CARD_FIX.md` (hard refresh fix)

## Version History
- v5.6: Initial Firestore sync implementation
- v5.7: Fixed bills card disappearing on hard refresh
- v5.8: **Added auth check and auto-sync on login** (this fix)
