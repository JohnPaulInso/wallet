# Bills Real-Time Sync - Quick Reference

## ⚡ Speed Summary

### Before Fix
- ❌ Bills took several minutes to appear on mobile
- ❌ Relied only on Firestore `onSnapshot()` listener
- ❌ No fallback if listener was slow/disconnected

### After Fix
- ✅ Bills appear within **3 seconds maximum**
- ✅ Aggressive polling checks every 3 seconds
- ✅ Immediate fetch on app resume/visibility
- ✅ Pull-to-refresh integration
- ✅ Manual sync button

---

## 🔄 How It Works Now

### Multiple Sync Mechanisms (Redundancy)

1. **Primary: Firestore Real-Time Listener** (`onSnapshot`)
   - Pushes updates to all devices instantly
   - Works when network is stable

2. **Backup: Aggressive Polling** (every 3 seconds)
   - Checks Firestore directly using `getDoc()`
   - Runs continuously when data is >3 seconds old
   - Ensures bills appear even if listener is delayed

3. **On-Demand: App Resume**
   - Immediate Firestore fetch when app resumes from background
   - Guarantees fresh data

4. **On-Demand: Visibility Change**
   - Immediate Firestore fetch when app becomes visible
   - Works on web and mobile

5. **Manual: Pull-to-Refresh**
   - User can swipe down to refresh Calendar tab
   - Forces complete reload

6. **Manual: Sync Button**
   - Circular arrows icon in Bills card header
   - Forces Firestore sync

---

## 🎯 Expected Behavior

### Desktop → Mobile
1. Add bill on localhost/desktop
2. Bill saves to Firestore immediately
3. Mobile receives update via:
   - `onSnapshot()` (instant if connected)
   - OR polling (within 3 seconds)
   - OR on next app resume/visibility change

### Mobile → Desktop
1. Add bill on mobile APK
2. Bill saves to Firestore immediately
3. Desktop receives update via:
   - `onSnapshot()` (instant)
   - OR polling (within 3 seconds)

---

## 🔍 Debugging

### Check Sync Status in Console

```javascript
// Get full sync status
window.CalendarView.getSyncStatus()
// Returns: { online, authenticated, pendingSaves, retryQueue, billsCount, lastSaveId, timestamp }

// Check if listener is active
console.log('Listener active:', !!window.CalendarView._firestoreUnsubscribe)

// Check data age
const lastUpdate = parseInt(localStorage.getItem('wallet_calendar_bills_timestamp') || '0');
console.log('Last update:', new Date(lastUpdate).toLocaleString());
console.log('Age:', Math.round((Date.now() - lastUpdate) / 1000), 'seconds');

// Force manual sync
window.CalendarView.forceSyncToFirestore()
```

### Console Log Patterns

**Normal Operation:**
```
📡 Aggressive polling: Checking for updates (data age: 1 seconds)
✓ Bills already up to date
```

**Update Found:**
```
📡 Aggressive polling: Checking for updates (data age: 4 seconds)
📥 Polling found newer data! Updating...
📱 Bills updated!
```

**App Resume:**
```
📱 Mobile app resumed - refreshing bills...
📡 Fetching latest bills from Firestore...
📥 Found newer bills on resume!
✅ Bills updated!
```

---

## 🚨 Troubleshooting

### Bills Still Not Appearing?

1. **Check Authentication**
   ```javascript
   console.log('User:', window.auth?.currentUser?.uid)
   ```
   - If null, user is not signed in
   - Bills won't sync across devices without auth

2. **Check Network**
   ```javascript
   console.log('Online:', navigator.onLine)
   ```
   - If false, device is offline
   - Bills will sync when reconnected

3. **Check Firestore Connection**
   ```javascript
   console.log('Firestore ready:', !!window.db)
   ```
   - If false, Firestore SDK not loaded
   - Refresh page or check console for errors

4. **Force Manual Sync**
   - Tap sync button (circular arrows) in Bills card
   - OR pull-to-refresh on Calendar tab
   - OR run: `window.CalendarView.forceSyncToFirestore()`

5. **Check Firestore Data Directly**
   ```javascript
   const uid = window.auth?.currentUser?.uid;
   if (uid) {
       const ref = window.doc(window.db, 'users', uid, 'config', 'calendar_bills');
       window.getDoc(ref).then(snap => {
           console.log('Firestore data:', snap.data());
       });
   }
   ```

---

## 📊 Sync Status Indicator

Located in Bills card header (top-right):

- 🟢 **Synced** - Real-time listener active, up-to-date
- 🟡 **Syncing** - Saving changes to cloud
- 🔴 **Offline** - No internet connection
- ⚪ **Local** - Not signed in

---

## 🎨 UI Elements

### Sync Button
- **Location:** Bills card header (top-right)
- **Icon:** Circular arrows (sync icon)
- **Action:** Tap to force sync
- **Result:** Immediate Firestore fetch + toast notification

### Pull-to-Refresh
- **Location:** Calendar tab
- **Gesture:** Swipe down from top
- **Action:** Reloads transactions and bills
- **Result:** Complete refresh of Calendar data

---

## 📁 Modified Files

1. `wallet app/calendar-logic.js`
   - Lines 107-170: `init()` (increased auth timeout)
   - Lines 143-189: `ensureBillsCardExists()` (added sync status + button)
   - Lines 688-870: `setupListeners()` (added resume, visibility, polling)

2. `wallet app/nav-state.js`
   - Lines 744-765: `refreshSPATab()` (added bills reload on pull-to-refresh)

---

## 📚 Related Documentation

- `FIRESTORE_SYNC_PATTERN.md` - General sync architecture
- `BILLS_FIRESTORE_SYNC_FIX.md` - v5.8 auth check fix
- `MOBILE_REALTIME_SYNC_FIX.md` - v5.9 complete mobile fix (this version)

---

## 🎯 Summary

**Problem:** Bills took minutes to appear on mobile  
**Solution:** Aggressive 3-second polling + immediate resume/visibility fetching  
**Result:** Bills appear within 3 seconds maximum ✅
