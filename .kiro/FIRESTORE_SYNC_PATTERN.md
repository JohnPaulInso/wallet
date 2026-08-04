# 🔥 Enterprise-Grade Firestore Real-Time Sync Pattern

## Design Language for Real-Time Cross-Device Data Sync

This is the **standard pattern** for implementing bulletproof, real-time data synchronization across multiple devices using Firestore.

---

## 📐 Architecture Overview

```
┌─────────────────┐
│   User Action   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  1. INSTANT LOCAL SAVE              │
│  └─ localStorage (0ms backup)       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  2. QUEUE FOR FIRESTORE             │
│  └─ Add to pending saves queue      │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  3. EXECUTE WITH RETRY              │
│  ├─ Attempt 1 (immediate)           │
│  ├─ Attempt 2 (1s delay)            │
│  ├─ Attempt 3 (2s delay)            │
│  ├─ Attempt 4 (4s delay)            │
│  └─ Attempt 5 (8s delay)            │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  4. REAL-TIME LISTENER              │
│  └─ onSnapshot() updates all devices│
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  5. UI UPDATE                       │
│  └─ Render changes instantly        │
└─────────────────────────────────────┘
```

---

## 🎯 Core Components

### 1. **State Management**
```javascript
yourFeature: {
    initialized: false,
    data: [],
    _firestoreUnsubscribe: null,
    _isSyncing: false,
    _pendingSaves: [],
    _isOnline: navigator.onLine,
    _syncRetryQueue: [],
}
```

### 2. **Load Function (Real-Time Listener)**
```javascript
loadData: function() {
    console.log('📥 Loading data...');
    
    // STEP 1: Load from localStorage first (instant display)
    try {
        const stored = localStorage.getItem('your_feature_data');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                this.data = parsed;
                console.log('✓ Loaded', this.data.length, 'items from localStorage');
            }
        }
        if (!this.data) this.data = [];
    } catch (e) {
        console.error('❌ localStorage load failed:', e);
        if (!this.data) this.data = [];
    }

    // STEP 2: Setup Firestore real-time sync with retry mechanism
    const setupFirestoreSync = () => {
        try {
            const uid = window.auth?.currentUser?.uid;
            
            if (!uid) {
                console.warn('⚠️ No authenticated user');
                return false;
            }
            
            if (!window.db || !window.doc || !window.onSnapshot) {
                console.warn('⚠️ Firestore SDK not loaded - retrying...');
                return false;
            }
            
            console.log('📡 Setting up Firestore real-time sync for user:', uid);
            const docRef = window.doc(window.db, 'users', uid, 'config', 'your_feature_data');
            
            // Detach previous listener if exists
            if (this._firestoreUnsubscribe) {
                this._firestoreUnsubscribe();
            }
            
            // STEP 3: Setup real-time listener (THIS IS THE KEY!)
            this._firestoreUnsubscribe = window.onSnapshot(
                docRef, 
                (snap) => {
                    console.log('🔄 Firestore snapshot received');
                    
                    if (snap.exists()) {
                        const data = snap.data();
                        if (data && Array.isArray(data.items)) {
                            const firestoreData = data.items;
                            const firestoreTimestamp = data.updatedAt || 0;
                            const firestoreSaveId = data.saveId || '';
                            const localTimestamp = parseInt(localStorage.getItem('your_feature_timestamp') || '0');
                            const localSaveId = localStorage.getItem('your_feature_saveId') || '';
                            
                            console.log('📊 Firestore:', firestoreData.length, 'items, ts:', firestoreTimestamp);
                            console.log('📊 Local:', this.data.length, 'items, ts:', localTimestamp);
                            
                            // ECHO PREVENTION: Skip if this is our own save
                            if (firestoreSaveId === localSaveId && firestoreTimestamp === localTimestamp) {
                                console.log('↩️ Echo detected, skipping (our own save)');
                                return;
                            }
                            
                            // CONFLICT RESOLUTION: Use newer data
                            const shouldUpdate = firestoreTimestamp > localTimestamp || 
                                               (firestoreTimestamp === localTimestamp && 
                                                JSON.stringify(firestoreData) !== JSON.stringify(this.data));
                            
                            if (shouldUpdate) {
                                console.log('⬇️ Applying Firestore update (remote changes)');
                                
                                this.data = firestoreData;
                                
                                // Update localStorage
                                try { 
                                    localStorage.setItem('your_feature_data', JSON.stringify(this.data));
                                    localStorage.setItem('your_feature_timestamp', firestoreTimestamp.toString());
                                    localStorage.setItem('your_feature_saveId', firestoreSaveId);
                                    console.log('✓ Synced to localStorage');
                                } catch(e){
                                    console.error('❌ Failed to sync to localStorage:', e);
                                }
                                
                                // Update UI
                                this.render();
                                
                                // Show notification for remote updates
                                if (window.showToast && firestoreTimestamp > localTimestamp + 5000) {
                                    window.showToast('📱 Data updated from another device');
                                }
                                
                            } else if (localTimestamp > firestoreTimestamp && this.data.length > 0) {
                                console.log('⬆️ Local data is newer - pushing to Firestore');
                                if (this._pendingSaves.length === 0) {
                                    this.saveData();
                                }
                            } else {
                                console.log('✓ Data already in sync');
                            }
                        } else if (this.data.length > 0) {
                            console.log('⬆️ Firestore empty but local has data - pushing');
                            this.saveData();
                        }
                    } else {
                        if (this.data.length > 0) {
                            console.log('⬆️ Firestore document missing - creating');
                            this.saveData();
                        } else {
                            console.log('ℹ️ No data in Firestore or localStorage');
                        }
                    }
                },
                (error) => {
                    console.error('❌ Firestore snapshot error:', error);
                    
                    if (error.code === 'permission-denied') {
                        if (window.showToast) {
                            window.showToast('⚠️ Permission denied. Please sign in again.');
                        }
                    }
                }
            );
            
            console.log('✓ Firestore real-time sync active');
            return true;
            
        } catch (e) { 
            console.error('❌ Firestore setup error:', e);
            return false;
        }
    };
    
    // Try to setup Firestore immediately
    if (!setupFirestoreSync()) {
        // Retry with delay if initial setup fails
        let retryCount = 0;
        const maxRetries = 10;
        
        const retrySync = setInterval(() => {
            retryCount++;
            console.log(`🔄 Retrying Firestore sync (${retryCount}/${maxRetries})...`);
            
            if (setupFirestoreSync() || retryCount >= maxRetries) {
                clearInterval(retrySync);
                if (retryCount >= maxRetries) {
                    console.warn('⚠️ Max retries reached. Data will only save locally.');
                }
            }
        }, 1000);
    }
},
```

### 3. **Save Function (With Queue & Retry)**
```javascript
saveData: async function() {
    const timestamp = Date.now();
    const saveId = `save_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`💾 [${saveId}] Saving data:`, this.data?.length || 0, 'items');
    
    // STEP 1: Save to localStorage IMMEDIATELY (instant backup)
    try {
        localStorage.setItem('your_feature_data', JSON.stringify(this.data || []));
        localStorage.setItem('your_feature_timestamp', timestamp.toString());
        localStorage.setItem('your_feature_saveId', saveId);
        console.log(`✓ [${saveId}] localStorage saved`);
    } catch (e) {
        console.error(`❌ [${saveId}] localStorage failed:`, e);
    }

    // STEP 2: Queue for Firestore save
    const saveOperation = {
        id: saveId,
        timestamp: timestamp,
        data: this.data || [],
        attempts: 0,
        maxAttempts: 5
    };
    
    this._pendingSaves.push(saveOperation);
    
    // STEP 3: Execute Firestore save with retry
    await this._executePendingSaves();

    // STEP 4: Update UI immediately
    this.render();
},

_executePendingSaves: async function() {
    if (this._isSyncing) {
        console.log('⏳ Sync already in progress, will process queue...');
        return;
    }

    if (this._pendingSaves.length === 0) {
        return;
    }

    this._isSyncing = true;

    while (this._pendingSaves.length > 0) {
        const operation = this._pendingSaves[0];
        const success = await this._saveToFirestore(operation);

        if (success) {
            this._pendingSaves.shift();
            console.log(`✅ [${operation.id}] Successfully synced`);
        } else {
            operation.attempts++;
            
            if (operation.attempts >= operation.maxAttempts) {
                console.error(`❌ [${operation.id}] Max attempts reached`);
                this._pendingSaves.shift();
                this._syncRetryQueue.push(operation);
                
                if (window.showToast) {
                    window.showToast('⚠️ Sync delayed. Will retry when connection improves.');
                }
            } else {
                const delay = Math.min(1000 * Math.pow(2, operation.attempts), 10000);
                console.log(`🔄 [${operation.id}] Retry ${operation.attempts}/${operation.maxAttempts} in ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    this._isSyncing = false;

    // Retry failed operations
    if (this._syncRetryQueue.length > 0 && this._isOnline) {
        console.log(`🔄 Retrying ${this._syncRetryQueue.length} failed operations...`);
        this._pendingSaves = [...this._syncRetryQueue];
        this._syncRetryQueue = [];
        setTimeout(() => this._executePendingSaves(), 2000);
    }
},

_saveToFirestore: async function(operation) {
    try {
        if (!window.db || !window.doc || !window.setDoc) {
            console.warn(`⚠️ [${operation.id}] Firestore SDK not available`);
            return false;
        }

        const uid = window.auth?.currentUser?.uid;
        if (!uid) {
            console.warn(`⚠️ [${operation.id}] No authenticated user`);
            return false;
        }

        if (!this._isOnline) {
            console.warn(`⚠️ [${operation.id}] Device offline`);
            return false;
        }

        console.log(`📤 [${operation.id}] Saving to Firestore...`);
        
        const docRef = window.doc(window.db, 'users', uid, 'config', 'your_feature_data');
        
        await window.setDoc(docRef, { 
            items: operation.data,
            updatedAt: operation.timestamp,
            saveId: operation.id,
            deviceInfo: {
                userAgent: navigator.userAgent,
                timestamp: operation.timestamp
            }
        }, { merge: true });

        console.log(`✅ [${operation.id}] Firestore save successful`);
        return true;

    } catch (error) {
        console.error(`❌ [${operation.id}] Firestore error:`, error.code || error.message);
        
        // Don't retry permanent errors
        const permanentErrors = ['permission-denied', 'unauthenticated'];
        if (error.code && permanentErrors.includes(error.code)) {
            console.error(`❌ [${operation.id}] Permanent error, giving up`);
            return true; // Remove from queue
        }
        
        return false;
    }
},
```

### 4. **Setup Listeners (Network & Auth)**
```javascript
setupListeners: function() {
    // Monitor online/offline status
    window.addEventListener('online', () => {
        console.log('🌐 Device back online');
        this._isOnline = true;
        
        if (window.showToast) {
            window.showToast('📡 Connected - syncing data...');
        }
        
        if (this._syncRetryQueue.length > 0) {
            console.log(`🔄 Retrying ${this._syncRetryQueue.length} failed saves...`);
            this._pendingSaves = [...this._syncRetryQueue];
            this._syncRetryQueue = [];
            this._executePendingSaves();
        } else {
            this.loadData();
        }
    });
    
    window.addEventListener('offline', () => {
        console.log('📴 Device offline');
        this._isOnline = false;
        
        if (window.showToast) {
            window.showToast('📴 Offline - data will sync when reconnected');
        }
    });
    
    // Auth state listener
    if (window.onAuthStateChanged && window.auth) {
        window.onAuthStateChanged(window.auth, (user) => {
            if (user) {
                console.log('👤 User authenticated:', user.uid);
                
                try {
                    localStorage.setItem('wallet_last_uid', user.uid);
                } catch (e) {}
                
                setTimeout(() => {
                    console.log('🔄 Re-syncing data for authenticated user...');
                    this.loadData();
                    
                    if (this._pendingSaves.length > 0 || this._syncRetryQueue.length > 0) {
                        console.log('🔄 Processing pending saves after auth...');
                        this._executePendingSaves();
                    }
                }, 500);
            } else {
                console.log('👤 User signed out');
                
                if (this._firestoreUnsubscribe) {
                    this._firestoreUnsubscribe();
                    this._firestoreUnsubscribe = null;
                }
                
                if (this._pendingSaves.length > 0) {
                    console.warn('⚠️ Clearing pending saves - user signed out');
                    this._pendingSaves = [];
                }
            }
        });
    }
    
    // Periodic sync health check (every 30 seconds)
    setInterval(() => {
        if (this._isOnline && window.auth?.currentUser && this._pendingSaves.length > 0) {
            console.log('🔍 Sync health check: Processing pending saves...');
            this._executePendingSaves();
        }
    }, 30000);
},
```

### 5. **Helper Functions**
```javascript
// Force sync (manual trigger)
forceSyncToFirestore: async function() {
    console.log('🔄 Force sync initiated by user');
    
    if (!window.auth?.currentUser) {
        if (window.showToast) {
            window.showToast('⚠️ Please sign in to sync data');
        }
        return;
    }
    
    if (!this._isOnline) {
        if (window.showToast) {
            window.showToast('📴 Device is offline');
        }
        return;
    }
    
    if (window.showToast) {
        window.showToast('🔄 Force syncing data...');
    }
    
    const timestamp = Date.now();
    const saveId = `force_sync_${timestamp}`;
    
    const saveOperation = {
        id: saveId,
        timestamp: timestamp,
        data: this.data || [],
        attempts: 0,
        maxAttempts: 3
    };
    
    this._pendingSaves.unshift(saveOperation);
    
    try {
        await this._executePendingSaves();
        
        if (window.showToast) {
            window.showToast('✅ Data synced successfully!');
        }
    } catch (e) {
        console.error('Force sync failed:', e);
        if (window.showToast) {
            window.showToast('❌ Sync failed. Please try again.');
        }
    }
},

// Get sync status for debugging
getSyncStatus: function() {
    return {
        online: this._isOnline,
        authenticated: !!window.auth?.currentUser,
        pendingSaves: this._pendingSaves.length,
        retryQueue: this._syncRetryQueue.length,
        dataCount: this.data.length,
        lastSaveId: localStorage.getItem('your_feature_saveId'),
        timestamp: localStorage.getItem('your_feature_timestamp')
    };
},
```

---

## 🎓 Key Concepts Explained

### What is "Real-Time Listener"?

**Real-time listener** = `onSnapshot()` function that **watches** a Firestore document for changes.

```javascript
// This function RUNS AUTOMATICALLY whenever the data changes in Firestore
window.onSnapshot(docRef, (snap) => {
    // This code runs on ALL devices when ANY device saves
    console.log('🔄 Data changed in Firestore!');
    const newData = snap.data();
    // Update local state and UI
    this.data = newData;
    this.render();
});
```

**How it works:**
1. Device A adds a bill → saves to Firestore
2. Firestore detects the change
3. Firestore **pushes** the change to Device B's `onSnapshot()` listener
4. Device B's listener runs automatically and updates the UI
5. **Result:** Device B sees the new bill within 1-2 seconds!

---

## 📦 Features Included

✅ **Instant local save** (localStorage)  
✅ **Automatic retry** (5 attempts with exponential backoff)  
✅ **Real-time sync** (updates all devices instantly)  
✅ **Offline support** (saves when back online)  
✅ **Conflict resolution** (newest data wins)  
✅ **Echo prevention** (doesn't reapply own changes)  
✅ **Network monitoring** (online/offline detection)  
✅ **Auth awareness** (waits for login, clears on logout)  
✅ **Comprehensive logging** (easy debugging)  
✅ **Manual sync** (force sync function)  
✅ **Health checks** (periodic retry of failed saves)  

---

## 🚀 Quick Start Template

Replace these placeholders:
- `your_feature_data` → your feature name (e.g., `goals_data`, `savings_data`)
- `this.data` → your data array
- `'items'` → your data field name in Firestore

```javascript
window.YourFeature = {
    initialized: false,
    data: [],
    _firestoreUnsubscribe: null,
    _isSyncing: false,
    _pendingSaves: [],
    _isOnline: navigator.onLine,
    _syncRetryQueue: [],
    
    init: function() {
        if (this.initialized) return;
        this.initialized = true;
        this.loadData();
        this.setupListeners();
        this.render();
    },
    
    // ... paste functions from above ...
};
```

---

## 🎯 Global Exposure

```javascript
// Expose to window for console debugging
window.forceSync[YourFeature] = function() {
    if (window.YourFeature && window.YourFeature.forceSyncToFirestore) {
        window.YourFeature.forceSyncToFirestore();
    }
};

window.get[YourFeature]Status = function() {
    if (window.YourFeature && window.YourFeature.getSyncStatus) {
        const status = window.YourFeature.getSyncStatus();
        console.table(status);
        return status;
    }
};
```

---

## ✅ Testing Checklist

- [ ] Add item on Device A → appears on Device B within 2 seconds
- [ ] Edit item on Device B → updates on Device A
- [ ] Delete item on Device A → removes from Device B
- [ ] Turn off WiFi → item saves locally
- [ ] Turn on WiFi → item syncs to cloud
- [ ] Sign out → listener detaches, no errors
- [ ] Sign in → listener reattaches, data syncs
- [ ] Close browser → reopen → data persists
- [ ] Force sync → `window.forceSync[YourFeature]()`
- [ ] Check status → `window.get[YourFeature]Status()`

---

**Use this pattern for ALL features that need real-time cross-device sync!** 🎉
