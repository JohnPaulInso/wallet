# 🚀 Real-Time Sync Quick Reference

## 1-Minute Copy-Paste Template

### State Setup
```javascript
yourFeature: {
    data: [],
    _firestoreUnsubscribe: null,
    _isSyncing: false,
    _pendingSaves: [],
    _isOnline: navigator.onLine,
    _syncRetryQueue: [],
}
```

### Real-Time Listener (THE KEY PART!)
```javascript
// This runs automatically when data changes on OTHER devices
window.onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
        const firestoreData = snap.data().items;
        const firestoreTimestamp = snap.data().updatedAt;
        const localTimestamp = localStorage.getItem('timestamp');
        
        // Skip if it's our own save (echo prevention)
        if (snap.data().saveId === localStorage.getItem('saveId')) {
            return; // Ignore echo
        }
        
        // Use Firestore data if newer
        if (firestoreTimestamp > localTimestamp) {
            this.data = firestoreData;
            localStorage.setItem('data', JSON.stringify(this.data));
            this.render(); // Update UI!
            
            // Notify user
            window.showToast('📱 Data updated from another device');
        }
    }
});
```

### Save Function
```javascript
saveData: async function() {
    const timestamp = Date.now();
    const saveId = `save_${timestamp}`;
    
    // 1. Save locally (instant)
    localStorage.setItem('data', JSON.stringify(this.data));
    localStorage.setItem('timestamp', timestamp);
    localStorage.setItem('saveId', saveId);
    
    // 2. Queue for Firestore
    this._pendingSaves.push({
        id: saveId,
        timestamp: timestamp,
        data: this.data,
        attempts: 0,
        maxAttempts: 5
    });
    
    // 3. Execute with retry
    await this._executePendingSaves();
    
    // 4. Update UI
    this.render();
}
```

### Network Monitoring
```javascript
window.addEventListener('online', () => {
    this._isOnline = true;
    // Retry failed saves
    if (this._syncRetryQueue.length > 0) {
        this._pendingSaves = [...this._syncRetryQueue];
        this._syncRetryQueue = [];
        this._executePendingSaves();
    }
});

window.addEventListener('offline', () => {
    this._isOnline = false;
    window.showToast('📴 Offline - will sync when reconnected');
});
```

---

## 🎯 Key Functions

| Function | Purpose |
|----------|---------|
| `onSnapshot()` | **Real-time listener** - auto-runs when Firestore changes |
| `setDoc()` | Save to Firestore |
| `localStorage` | Instant local backup |
| `_executePendingSaves()` | Retry failed saves |
| `forceSyncToFirestore()` | Manual sync trigger |
| `getSyncStatus()` | Debug info |

---

## 🔍 What is onSnapshot()?

**`onSnapshot()`** is a Firestore function that **watches** a document for changes.

```javascript
// Set up the watcher (runs once)
onSnapshot(docRef, (snap) => {
    // This callback runs EVERY TIME the document changes
    console.log('Data changed!', snap.data());
});
```

**Magic:** When Device A saves → Device B's `onSnapshot()` callback runs automatically!

---

## ✅ Implementation Checklist

1. [ ] Add state properties (\_firestoreUnsubscribe, \_pendingSaves, etc.)
2. [ ] Create `loadData()` with `onSnapshot()` listener
3. [ ] Create `saveData()` with queue and retry
4. [ ] Add network listeners (online/offline)
5. [ ] Add auth listener (login/logout)
6. [ ] Expose global helpers (forceSync, getStatus)
7. [ ] Test on multiple devices

---

## 🧪 Testing Commands

```javascript
// Check if sync is working
window.YourFeature.getSyncStatus()

// Force a sync
window.YourFeature.forceSyncToFirestore()

// Check data
console.log(window.YourFeature.data)
```

---

## 🎨 Console Emojis

- 📥 Loading from Firestore
- 📤 Saving to Firestore
- ✅ Success
- ❌ Error
- 🔄 Retrying
- ⬇️ Applying remote update
- ⬆️ Pushing local changes
- ↩️ Echo detected (skipping)
- 🌐 Device online
- 📴 Device offline
- 👤 User authenticated
- 🔍 Health check

---

Use this for **every feature** that needs cross-device sync! 🎉
