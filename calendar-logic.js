/**
 * Calendar Logic for Smart Wallet (Unified SPA)
 * Fix: Ported 1:1 from calendar.html including grouped transaction modal (2026-04-02)
 * Summarized: Added namespacing and responsive grid rendering.
 */

(function(window) {
    const CATEGORIES = [
        { id: 'Online shopping', icon: 'shopping_bag', label: 'Online Shopping', cls: 'cat-online' },
        { id: 'Shopping', icon: 'shopping_cart', label: 'Shopping', cls: 'cat-shopping' },
        { id: 'Vehicle', icon: 'local_gas_station', label: 'Vehicle', cls: 'cat-vehicle' },
        { id: 'Food & Drinks', icon: 'restaurant', label: 'Food & Drinks', cls: 'cat-food' },
        { id: 'Service', icon: 'settings_cell', label: 'Service', cls: 'cat-service-magenta' },
        { id: 'Trade Copier', icon: 'hub', label: 'Trade Copier', cls: 'cat-aqua' },
        { id: 'Trading Expenses', icon: 'insights', label: 'Trading Expenses', cls: 'cat-trading' },
        { id: 'Life & Entertainment', icon: 'confirmation_number', label: 'Life & Ent.', cls: 'cat-life' },
        { id: 'Financial Expenses', icon: 'payments', label: 'Financial Expenses', cls: 'cat-financial' },
        { id: 'Transportation', icon: 'directions_bus', label: 'Vehicle', cls: 'cat-vehicle' },
        { id: 'Travel', icon: 'flight', label: 'Travel', cls: 'cat-aqua' },
        { id: 'Education', icon: 'school', label: 'Education', cls: 'cat-education' },
        { id: 'Sport', icon: 'fitness_center', label: 'Life', cls: 'cat-life' },
        // (2026-07-13) Added Savings category to CATEGORIES array; prev: absent
        { id: 'Savings', icon: 'savings', label: 'Savings', cls: 'cat-investments' },
        { id: 'Income', icon: 'savings', label: 'Income', cls: 'cat-income' }
    ];

    const CALENDAR_CATEGORY_ORDER = [
        'Income',
        'Food & Drinks',
        'Vehicle',
        'Transportation',
        'Shopping',
        'Online shopping',
        'Service',
        'Education',
        'Life & Entertainment',
        'Trade Copier',
        'Trading Expenses',
        'Financial Expenses',
        'Savings'
    ];

    const getCalendarCategorySortIndex = (categoryName = '') => {
        const index = CALENDAR_CATEGORY_ORDER.indexOf(categoryName);
        return index >= 0 ? index : CALENDAR_CATEGORY_ORDER.length;
    };

    const getCalendarMerchantDisplay = (txn = {}) => {
        const rawName = txn.merchant || txn.name || txn.note || 'Unknown';
        const autoTxn = { ...txn };
        delete autoTxn.manualCategory;
        delete autoTxn.manualBudgetCategory;
        const mapped = typeof window.getMerchantDisplay === 'function'
            ? window.getMerchantDisplay(rawName, autoTxn)
            : { name: rawName, category: 'Other', icon: 'receipt_long', catClass: 'cat-financial' };
        return {
            ...mapped,
            name: String(mapped.name || rawName || 'Unknown').toUpperCase()
        };
    };

    const getCalendarTxnCategory = (txn = {}, mapped = null) => {
        const manualCategory = String(txn.manualCategory || '').trim();
        const normalizedManual = manualCategory.toLowerCase();
        const autoCategory = String(mapped?.category || '').trim();
        const merchantName = String(txn.merchant || txn.name || '').toUpperCase();
        
        // [FIXED: 2026-07-01] BALANCING is Income (money received to balance account)
        if (merchantName.includes('BALANCING')) {
            return 'Income';
        }
        
        // [FIXED: 2026-07-01] Payment transactions should always be Financial Expenses
        if (merchantName.includes('PAYMENT') || merchantName.includes('INSTAPAY') || merchantName.includes('TRANSFER')) {
            return 'Financial Expenses';
        }
        
        // [FIXED: 2026-07-01] Don't treat "Financial Expenses" as generic - it's a valid category
        // Only treat truly generic categories as fallbacks
        const genericManualCategories = new Set([
            'other',
            'uncategorized'
        ]);

        // [FIXED: 2026-07-01] Always respect manualCategory if set, except for truly generic ones
        if (manualCategory && !genericManualCategories.has(normalizedManual)) {
            return manualCategory;
        }

        return autoCategory || manualCategory || 'Other';
    };

    // (2026-07-13) Enhanced CalendarView with Bill Reminders, day cell bill chips, and upcoming bills card; prev: basic transactions only
    window.CalendarView = {
        initialized: false,
        txns: [],
        bills: [],
        activeTab: 'today',
        currentViewDate: new Date(),
        selectedDate: new Date(),
        _firestoreUnsubscribe: null,
        _isSyncing: false,
        _pendingSaves: [],
        _isOnline: navigator.onLine,
        _syncRetryQueue: [],

        init: function() {
            if (this.initialized) return;
            console.log("📅 [v5.6] CALENDAR: Initializing CalendarView with Bills & Reminders");
            this.initialized = true;
            
            // Wait for Firebase auth before loading bills
            if (window.auth && window.auth.currentUser) {
                this.loadBills();
            } else {
                console.log('⏳ Waiting for Firebase auth...');
                // Retry when auth is ready
                const checkAuth = setInterval(() => {
                    if (window.auth && window.auth.currentUser) {
                        clearInterval(checkAuth);
                        console.log('✓ Auth ready, loading bills');
                        this.loadBills();
                    }
                }, 100);
                
                // Timeout after 5 seconds
                setTimeout(() => clearInterval(checkAuth), 5000);
            }
            
            // CRITICAL FIX: Create Bills & Reminders card HTML FIRST (before any rendering)
            this.ensureBillsCardExists();
            
            this.setupListeners();
            this.render();
        },

        // Ensure Bills & Reminders card HTML exists in the DOM
        ensureBillsCardExists: function() {
            // Check if element already exists
            if (document.getElementById('calendar-bills-card-list')) {
                console.log('Bills card element already exists');
                return;
            }
            
            console.log('Creating Bills & Reminders card HTML...');
            
            // Find a suitable container
            let container = document.querySelector('.dashboard-content') || 
                          document.querySelector('.page-content') || 
                          document.querySelector('main') || 
                          document.querySelector('#app') ||
                          document.body;
            
            if (!container) {
                console.warn('Could not find container for Bills card');
                return;
            }
            
            // Create the Bills & Reminders card
            const billsCard = document.createElement('div');
            billsCard.id = 'calendar-bills-card';
            billsCard.style.cssText = 'margin: 20px; background: white; border-radius: 20px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);';
            billsCard.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: #dbeafe; display: flex; align-items: center; justify-content: center;">
                        <i class="material-icons" style="font-size: 24px; color: #2563eb;">event_note</i>
                    </div>
                    <div>
                        <div style="font-size: 18px; font-weight: 900; color: #1e293b; letter-spacing: -0.5px;">Bills & Reminders</div>
                        <div style="font-size: 13px; color: #64748b; font-weight: 600;">Track upcoming due dates, recurring utilities, and bill status.</div>
                    </div>
                </div>
                <div id="calendar-bills-card-list"></div>
            `;
            
            // Insert at the beginning of container
            container.insertBefore(billsCard, container.firstChild);
            
            console.log('Bills card created successfully');
        },

        // (2026-07-13) Firestore real-time persistence & local storage sync; prev: localStorage only
        // (2026-07-13) Robust reload persistence & auto-sync local bills to Firestore; prev: empty snap reset
        // (2026-07-13) Dual-tier persistence (instant localStorage + Firestore config sync); prev: empty snap reset
        // ENHANCED: Real-time cross-device sync with automatic retry and conflict resolution
        loadBills: function() {
            console.log('📥 Loading bills...');
            
            // Load from localStorage first (instant display)
            try {
                const stored = localStorage.getItem('wallet_calendar_bills');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.bills = parsed;
                        console.log('✓ Loaded', this.bills.length, 'bills from localStorage');
                        // CRITICAL: Render immediately after loading
                        this.renderUpcomingBillsCard();
                    }
                }
                if (!this.bills) this.bills = [];
            } catch (e) {
                console.error('❌ localStorage load failed:', e);
                if (!this.bills) this.bills = [];
            }

            // Setup Firestore real-time sync with retry mechanism
            const setupFirestoreSync = () => {
                try {
                    const uid = window.auth?.currentUser?.uid;
                    
                    if (!uid) {
                        console.warn('⚠️ No authenticated user - bills will only save locally');
                        return false;
                    }
                    
                    if (!window.db || !window.doc || !window.onSnapshot) {
                        console.warn('⚠️ Firestore SDK not loaded - retrying...');
                        return false;
                    }
                    
                    console.log('📡 Setting up Firestore real-time sync for user:', uid);
                    const billDocRef = window.doc(window.db, 'users', uid, 'config', 'calendar_bills');
                    
                    // Detach previous listener if exists
                    if (this._firestoreUnsubscribe) {
                        this._firestoreUnsubscribe();
                    }
                    
                    // Setup real-time listener with enhanced conflict resolution
                    this._firestoreUnsubscribe = window.onSnapshot(
                        billDocRef, 
                        (snap) => {
                            console.log('🔄 Firestore snapshot received');
                            
                            if (snap.exists()) {
                                const data = snap.data();
                                if (data && Array.isArray(data.bills)) {
                                    const firestoreBills = data.bills;
                                    const firestoreTimestamp = data.updatedAt || 0;
                                    const firestoreSaveId = data.saveId || '';
                                    const localTimestamp = parseInt(localStorage.getItem('wallet_calendar_bills_timestamp') || '0');
                                    const localSaveId = localStorage.getItem('wallet_calendar_bills_lastSaveId') || '';
                                    
                                    console.log('📊 Firestore:', firestoreBills.length, 'bills, timestamp:', firestoreTimestamp, 'saveId:', firestoreSaveId);
                                    console.log('📊 Local:', this.bills.length, 'bills, timestamp:', localTimestamp, 'saveId:', localSaveId);
                                    
                                    // Skip if this is our own save (echo prevention)
                                    if (firestoreSaveId === localSaveId && firestoreTimestamp === localTimestamp) {
                                        console.log('↩️ Echo detected, skipping update (this is our own save)');
                                        return;
                                    }
                                    
                                    // Use Firestore data if:
                                    // 1. Firestore timestamp is newer
                                    // 2. OR timestamps match but Firestore has different data (concurrent edit)
                                    const shouldUpdate = firestoreTimestamp > localTimestamp || 
                                                       (firestoreTimestamp === localTimestamp && 
                                                        JSON.stringify(firestoreBills) !== JSON.stringify(this.bills));
                                    
                                    if (shouldUpdate) {
                                        console.log('⬇️ Applying Firestore update (remote changes detected)');
                                        
                                        // Check if there are pending local changes
                                        if (this._pendingSaves.length > 0) {
                                            console.warn('⚠️ Pending saves exist, may need merge');
                                        }
                                        
                                        this.bills = firestoreBills;
                                        
                                        // Update localStorage to match Firestore
                                        try { 
                                            localStorage.setItem('wallet_calendar_bills', JSON.stringify(this.bills));
                                            localStorage.setItem('wallet_calendar_bills_timestamp', firestoreTimestamp.toString());
                                            localStorage.setItem('wallet_calendar_bills_lastSaveId', firestoreSaveId);
                                            console.log('✓ Synced to localStorage');
                                        } catch(e){
                                            console.error('❌ Failed to sync to localStorage:', e);
                                        }
                                        
                                        // Update UI with remote changes
                                        if (typeof window.renderCalendar === 'function') window.renderCalendar();
                                        if (typeof this.renderUpcomingBillsCard === 'function') this.renderUpcomingBillsCard();
                                        
                                        // Show notification for remote updates
                                        if (window.showToast && firestoreTimestamp > localTimestamp + 5000) {
                                            window.showToast('📱 Bills updated from another device');
                                        }
                                        
                                    } else if (localTimestamp > firestoreTimestamp && this.bills.length > 0) {
                                        console.log('⬆️ Local data is newer - will push to Firestore');
                                        // Don't push immediately, let pending saves handle it
                                        if (this._pendingSaves.length === 0) {
                                            this.saveBills();
                                        }
                                    } else {
                                        console.log('✓ Data already in sync');
                                    }
                                } else if (this.bills.length > 0) {
                                    console.log('⬆️ Firestore has no bills array but local has data - pushing to Firestore');
                                    this.saveBills();
                                }
                            } else {
                                // Document doesn't exist
                                if (this.bills.length > 0) {
                                    console.log('⬆️ Firestore document missing - creating with local bills');
                                    this.saveBills();
                                } else {
                                    console.log('ℹ️ No bills in Firestore or localStorage');
                                }
                            }
                        },
                        (error) => {
                            console.error('❌ Firestore snapshot error:', error);
                            
                            // Don't show toast for every error, only critical ones
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
                // Retry after a delay if initial setup fails
                let retryCount = 0;
                const maxRetries = 10;
                
                const retrySync = setInterval(() => {
                    retryCount++;
                    console.log(`🔄 Retrying Firestore sync (${retryCount}/${maxRetries})...`);
                    
                    if (setupFirestoreSync() || retryCount >= maxRetries) {
                        clearInterval(retrySync);
                        if (retryCount >= maxRetries) {
                            console.warn('⚠️ Max retries reached. Bills will only save locally.');
                        }
                    }
                }, 1000);
            }
        },

        saveBills: async function() {
            const timestamp = Date.now();
            const saveId = `save_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
            
            console.log(`💾 [${saveId}] Initiating bill save:`, this.bills?.length || 0, 'bills');
            
            // STEP 1: Save to localStorage IMMEDIATELY (instant backup)
            try {
                const billsData = JSON.stringify(this.bills || []);
                localStorage.setItem('wallet_calendar_bills', billsData);
                localStorage.setItem('wallet_calendar_bills_timestamp', timestamp.toString());
                localStorage.setItem('wallet_calendar_bills_lastSaveId', saveId);
                console.log(`✓ [${saveId}] localStorage saved`);
            } catch (e) {
                console.error(`❌ [${saveId}] localStorage failed:`, e);
            }

            // CRITICAL FIX: Check if user is authenticated before queuing Firestore save
            const uid = window.auth?.currentUser?.uid;
            if (!uid) {
                console.warn(`⚠️ [${saveId}] No authenticated user - bills saved locally only`);
                console.warn('💡 Bills will sync to Firestore after sign-in');
                
                // Show toast to user if available
                if (window.showToast) {
                    window.showToast('⚠️ Saved locally - sign in to sync across devices');
                }
                
                // Still render UI
                if (typeof this.render === 'function') this.render();
                if (typeof this.renderUpcomingBillsCard === 'function') this.renderUpcomingBillsCard();
                return;
            }

            // STEP 2: Queue for Firestore save with guaranteed delivery
            const saveOperation = {
                id: saveId,
                timestamp: timestamp,
                data: this.bills || [],
                attempts: 0,
                maxAttempts: 5
            };
            
            this._pendingSaves.push(saveOperation);
            console.log(`📋 [${saveId}] Queued for Firestore sync (authenticated as: ${uid.substring(0, 8)}...)`);
            
            // STEP 3: Execute Firestore save with aggressive retry
            await this._executePendingSaves();

            // STEP 4: Update UI immediately (optimistic update)
            if (typeof this.render === 'function') this.render();
            if (typeof this.renderUpcomingBillsCard === 'function') this.renderUpcomingBillsCard();
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
                    // Remove from queue on success
                    this._pendingSaves.shift();
                    console.log(`✅ [${operation.id}] Successfully synced to Firestore`);
                } else {
                    operation.attempts++;
                    
                    if (operation.attempts >= operation.maxAttempts) {
                        console.error(`❌ [${operation.id}] Max retry attempts reached, removing from queue`);
                        this._pendingSaves.shift();
                        
                        // Store failed save for later retry
                        this._syncRetryQueue.push(operation);
                        
                        if (window.showToast) {
                            window.showToast('⚠️ Sync delayed. Will retry when connection improves.');
                        }
                    } else {
                        // Wait before retry (exponential backoff)
                        const delay = Math.min(1000 * Math.pow(2, operation.attempts), 10000);
                        console.log(`🔄 [${operation.id}] Retry ${operation.attempts}/${operation.maxAttempts} in ${delay}ms`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            this._isSyncing = false;

            // Check if there are failed operations to retry
            if (this._syncRetryQueue.length > 0 && this._isOnline) {
                console.log(`🔄 Retrying ${this._syncRetryQueue.length} failed operations...`);
                this._pendingSaves = [...this._syncRetryQueue];
                this._syncRetryQueue = [];
                setTimeout(() => this._executePendingSaves(), 2000);
            }
        },

        _saveToFirestore: async function(operation) {
            try {
                // Validate Firebase is ready
                if (!window.db || !window.doc || !window.setDoc) {
                    console.warn(`⚠️ [${operation.id}] Firestore SDK not available`);
                    return false;
                }

                const uid = window.auth?.currentUser?.uid;
                if (!uid) {
                    console.warn(`⚠️ [${operation.id}] No authenticated user`);
                    // Don't fail, will retry when user logs in
                    return false;
                }

                if (!this._isOnline) {
                    console.warn(`⚠️ [${operation.id}] Device offline`);
                    return false;
                }

                console.log(`📤 [${operation.id}] Saving to Firestore...`);
                
                const billDocRef = window.doc(window.db, 'users', uid, 'config', 'calendar_bills');
                
                // Use Firestore with merge to avoid overwriting concurrent updates
                await window.setDoc(billDocRef, { 
                    bills: operation.data,
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
                console.error(`❌ [${operation.id}] Firestore save error:`, error.code || error.message);
                
                // Check if it's a permanent error (don't retry)
                const permanentErrors = ['permission-denied', 'unauthenticated'];
                if (error.code && permanentErrors.includes(error.code)) {
                    console.error(`❌ [${operation.id}] Permanent error, giving up`);
                    return true; // Remove from queue
                }
                
                return false;
            }
        },

        // Force sync bills to Firestore (manual trigger) - ENHANCED
        forceSyncToFirestore: async function() {
            console.log('🔄 Force sync initiated by user');
            
            if (!window.auth?.currentUser) {
                if (window.showToast) {
                    window.showToast('⚠️ Please sign in to sync bills');
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
                window.showToast('🔄 Force syncing bills...');
            }
            
            // Create a new save operation
            const timestamp = Date.now();
            const saveId = `force_sync_${timestamp}`;
            
            const saveOperation = {
                id: saveId,
                timestamp: timestamp,
                data: this.bills || [],
                attempts: 0,
                maxAttempts: 3
            };
            
            // Add to queue and process
            this._pendingSaves.unshift(saveOperation); // Add to front of queue
            
            try {
                await this._executePendingSaves();
                
                if (window.showToast) {
                    window.showToast('✅ Bills synced successfully!');
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
                billsCount: this.bills.length,
                lastSaveId: localStorage.getItem('wallet_calendar_bills_lastSaveId'),
                timestamp: localStorage.getItem('wallet_calendar_bills_timestamp')
            };
        },

        // (2026-07-13) Auto-initialize CalendarView on access; prev: uninitialized bills array on load
        getBillsForDate: function(dateStr) {
            if (!this.initialized) this.init();
            if (!this.bills || !Array.isArray(this.bills)) return [];
            const targetDate = new Date(dateStr + 'T00:00:00');
            const targetDay = targetDate.getDate();
            const targetMonth = targetDate.getMonth();

            return this.bills.filter(b => {
                if (!b.date) return false;
                if (dateStr < b.date) return false; // Bill hasn't started yet

                const repeat = b.repeat || 'monthly';
                if (repeat === 'this_month' || repeat === 'none') {
                    return b.date === dateStr;
                } else if (repeat === 'monthly') {
                    return targetDay === new Date(b.date + 'T00:00:00').getDate();
                } else if (repeat === 'yearly') {
                    const bDate = new Date(b.date + 'T00:00:00');
                    return targetDay === bDate.getDate() && targetMonth === bDate.getMonth();
                }
                return b.date === dateStr;
            });
        },

        addBill: function(billData) {
            const repeatVal = billData.repeat || document.getElementById('bill-input-repeat')?.value || 'monthly';
            const newBill = {
                id: 'bill_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                title: billData.title || 'Untitled Bill',
                amount: parseFloat(billData.amount) || 0,
                date: billData.date || new Date().toISOString().split('T')[0],
                color: billData.color || '#3b82f6',
                icon: billData.icon || 'receipt_long',
                paid: false,
                repeat: repeatVal,
                endDate: null
            };
            this.bills.push(newBill);
            this.saveBills();
        },

        deleteBill: function(id, targetDateStr) {
            const idx = this.bills.findIndex(b => b.id === id);
            if (idx > -1) {
                // Always completely remove the bill when user clicks delete
                this.bills.splice(idx, 1);
                this.saveBills();
            }
        },

        toggleBillPaid: function(id) {
            const idx = this.bills.findIndex(b => b.id === id);
            if (idx > -1) {
                const wasPaid = this.bills[idx].paid;
                this.bills[idx].paid = !this.bills[idx].paid;
                
                // Add celebration animation when marking as paid
                if (!wasPaid && this.bills[idx].paid) {
                    // Find the bill card element
                    const billCards = document.querySelectorAll('.bill-card-item');
                    billCards.forEach(card => {
                        const cardHtml = card.innerHTML;
                        if (cardHtml.includes(id)) {
                            // Trigger haptic feedback if available
                            if (window.triggerHaptic) window.triggerHaptic('impactMedium');
                            
                            // Add bounce and fade animation
                            card.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                            card.style.transform = 'scale(1.05)';
                            
                            setTimeout(() => {
                                card.style.transform = 'scale(1)';
                            }, 200);
                            
                            // Create confetti-like checkmark effect
                            const icon = card.querySelector('.material-icons');
                            if (icon && icon.textContent === 'radio_button_unchecked') {
                                // Animate the icon change
                                icon.style.transition = 'all 0.3s ease';
                                icon.style.transform = 'rotate(360deg) scale(1.3)';
                                setTimeout(() => {
                                    icon.style.transform = 'rotate(0deg) scale(1)';
                                }, 300);
                            }
                        }
                    });
                    
                    // Show toast message
                    if (window.showToast) {
                        window.showToast('✓ Bill marked as paid!');
                    }
                }
                
                this.saveBills();
            }
        },

        setBillTab: function(tabName) {
            this.activeTab = tabName;
            document.querySelectorAll('.bill-tab-btn').forEach(btn => {
                const isMatch = btn.dataset.tab === tabName;
                btn.classList.toggle('active', isMatch);
                btn.style.background = isMatch ? '#ffffff' : 'transparent';
                btn.style.color = isMatch ? '#1e293b' : '#64748b';
                btn.style.boxShadow = isMatch ? '0 2px 6px rgba(0,0,0,0.05)' : 'none';
            });
            this.renderUpcomingBillsCard();
        },

        // (2026-07-13) Re-sync loadBills when Firebase auth initializes; prev: single init load only
        setupListeners: function() {
            document.addEventListener('walletDataUpdated', (e) => {
                this.txns = e.detail.txns || [];
                this.render();
            });
            
            // Monitor online/offline status for reliable sync
            window.addEventListener('online', () => {
                console.log('🌐 Device back online');
                this._isOnline = true;
                
                if (window.showToast) {
                    window.showToast('📡 Connected - syncing bills...');
                }
                
                // Retry failed saves when coming back online
                if (this._syncRetryQueue.length > 0) {
                    console.log(`🔄 Retrying ${this._syncRetryQueue.length} failed saves...`);
                    this._pendingSaves = [...this._syncRetryQueue];
                    this._syncRetryQueue = [];
                    this._executePendingSaves();
                } else {
                    // Force sync to ensure we're up to date
                    this.loadBills();
                }
            });
            
            window.addEventListener('offline', () => {
                console.log('📴 Device offline');
                this._isOnline = false;
                
                if (window.showToast) {
                    window.showToast('📴 Offline - bills will sync when reconnected');
                }
            });
            
            // Enhanced auth listener with Firestore re-sync
            if (window.onAuthStateChanged && window.auth) {
                window.onAuthStateChanged(window.auth, (user) => {
                    if (user) {
                        console.log('👤 User authenticated:', user.uid);
                        
                        // Store UID for offline access
                        try {
                            localStorage.setItem('wallet_last_uid', user.uid);
                        } catch (e) {}
                        
                        // Re-initialize bills sync with new user
                        setTimeout(() => {
                            console.log('🔄 Re-syncing bills for authenticated user...');
                            this.loadBills();
                            
                            // Process any pending saves
                            if (this._pendingSaves.length > 0 || this._syncRetryQueue.length > 0) {
                                console.log('🔄 Processing pending saves after auth...');
                                this._executePendingSaves();
                            }
                        }, 500);
                    } else {
                        console.log('👤 User signed out');
                        // Detach Firestore listener
                        if (this._firestoreUnsubscribe) {
                            this._firestoreUnsubscribe();
                            this._firestoreUnsubscribe = null;
                        }
                        
                        // Clear pending saves (can't save without auth)
                        if (this._pendingSaves.length > 0) {
                            console.warn('⚠️ Clearing pending saves - user signed out');
                            this._pendingSaves = [];
                        }
                    }
                });
            } else {
                // Fallback: wait for auth to be ready
                window.addEventListener('load', () => {
                    setTimeout(() => {
                        if (window.auth?.currentUser) {
                            console.log('🔄 Auth ready on page load, syncing bills...');
                            this.loadBills();
                        }
                    }, 600);
                });
            }
            
            // Load initial transaction data
            if (window.allTxns) {
                this.txns = window.allTxns;
                this.render();
            }
            
            // Listen for when Firestore becomes available
            if (!window.db && typeof window.addEventListener === 'function') {
                const checkFirestore = setInterval(() => {
                    if (window.db && window.auth?.currentUser) {
                        clearInterval(checkFirestore);
                        console.log('🔥 Firestore detected, re-initializing sync...');
                        this.loadBills();
                    }
                }, 500);
                
                // Stop checking after 10 seconds
                setTimeout(() => clearInterval(checkFirestore), 10000);
            }
            
            // Periodic sync health check (every 30 seconds)
            setInterval(() => {
                if (this._isOnline && window.auth?.currentUser && this._pendingSaves.length > 0) {
                    console.log('🔍 Sync health check: Processing pending saves...');
                    this._executePendingSaves();
                }
            }, 30000);
        },

        // (2026-07-13) Unified render calling native window.renderCalendar; prev: custom second grid creation
        render: function() {
            if (typeof window.renderCalendar === 'function') {
                window.renderCalendar();
            }
            this.renderUpcomingBillsCard();
        },

        renderUpcomingBillsCard: function() {
            console.log('?? renderUpcomingBillsCard called');
            console.log('?? Bills array:', this.bills);
            
            // CRITICAL: Ensure the card element exists before rendering
            this.ensureBillsCardExists();
            
            const listEl = document.getElementById('calendar-bills-card-list');
            console.log('?? Target element:', listEl);
            
            if (!listEl) {
                console.error('?? calendar-bills-card-list element STILL not found after ensureBillsCardExists!');
                return;
            }

            const todayObj = new Date();
            const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
            
            console.log('?? Today:', todayStr);
            
            const in7DaysObj = new Date(todayObj.getTime() + 7 * 86400000);
            const in7DaysStr = `${in7DaysObj.getFullYear()}-${String(in7DaysObj.getMonth() + 1).padStart(2, '0')}-${String(in7DaysObj.getDate()).padStart(2, '0')}`;

            // Get bills due TODAY (unpaid only)
            const todayBills = (this.getBillsForDate ? this.getBillsForDate(todayStr) : this.bills.filter(b => b.date === todayStr)).filter(b => !b.paid);
            
            console.log('?? Today bills:', todayBills);
            
            const weekBills = [];
            const upcomingBills = [];

            // Generate dates for the next 7 days (excluding today)
            const nextDates = [];
            for (let i = 1; i <= 7; i++) {
                const d = new Date(todayObj.getTime() + i * 86400000);
                nextDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
            }

            // Check each date in the next 7 days for bills (EXCLUDE bills already in todayBills)
            nextDates.forEach(dateStr => {
                const dateBills = this.getBillsForDate(dateStr).filter(b => !b.paid);
                dateBills.forEach(b => {
                    // Only add if not already in todayBills or weekBills
                    if (!todayBills.some(x => x.id === b.id) && !weekBills.some(x => x.id === b.id)) {
                        weekBills.push(b);
                    }
                });
            });
            
            // Sort weekBills by date (earliest first)
            weekBills.sort((a, b) => {
                const dateA = new Date(a.date + 'T00:00:00');
                const dateB = new Date(b.date + 'T00:00:00');
                return dateA - dateB;
            });

            // For upcoming bills (beyond 7 days), check bills with future dates
            (this.bills || []).forEach(b => {
                const bDateStr = b.date;
                const repeat = b.repeat || 'monthly';
                
                // Skip if already in todayBills or weekBills
                if (todayBills.some(x => x.id === b.id) || weekBills.some(x => x.id === b.id)) {
                    return;
                }
                
                // For non-recurring bills, just check the date
                if (repeat === 'none' || repeat === 'this_month') {
                    if (bDateStr > in7DaysStr && !b.paid) {
                        if (!upcomingBills.some(x => x.id === b.id)) upcomingBills.push(b);
                    }
                } else {
                    // For recurring bills, they're always "upcoming" unless paid or already in other sections
                    if (!b.paid) {
                        if (!upcomingBills.some(x => x.id === b.id)) upcomingBills.push(b);
                    }
                }
            });
            
            // Sort upcomingBills by date (earliest first)
            upcomingBills.sort((a, b) => {
                const dateA = new Date(a.date + 'T00:00:00');
                const dateB = new Date(b.date + 'T00:00:00');
                return dateA - dateB;
            });

            const paidBills = (this.bills || []).filter(b => b.paid);
            
            // Sort paidBills by date (most recent first)
            paidBills.sort((a, b) => {
                const dateA = new Date(a.date + 'T00:00:00');
                const dateB = new Date(b.date + 'T00:00:00');
                return dateB - dateA;
            });

            const renderBillItem = (b) => `
                <!-- (2026-07-13) Compact padding (8px 10px) & reduced gap (8px); prev: padding 12px 14px, gap 12px -->
                <div class="bill-card-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: ${b.paid ? '#f1f5f9' : '#f8fafc'}; border: 1px solid ${b.paid ? '#e2e8f0' : '#f1f5f9'}; border-radius: 14px; transition: all 0.2s; margin-bottom: 6px; cursor: pointer; ${b.paid ? 'opacity: 0.75;' : ''}" oncontextmenu="event.preventDefault(); window.CalendarView && window.CalendarView.openEditBillModal('${b.id}');" onclick="if(!event.target.closest('button')) { event.stopPropagation(); window.CalendarView && window.CalendarView.openEditBillModal('${b.id}'); }">
                    <div style="display: flex; align-items: center; gap: 8px; pointer-events: none;">
                        <div style="width: 32px; height: 32px; border-radius: 10px; background: ${b.color || '#3b82f6'}; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); flex-shrink: 0; ${b.paid ? 'filter: grayscale(40%);' : ''}">
                            <i class="material-icons" style="font-size: 16px;">${b.icon || 'receipt_long'}</i>
                        </div>
                        <div>
                            <div style="font-size: 12.5px; font-weight: 800; color: ${b.paid ? '#64748b' : '#1e293b'}; text-transform: capitalize; line-height: 1.2; ${b.paid ? 'text-decoration: line-through;' : ''}">${b.title}</div>
                            <div style="font-size: 9.5px; font-weight: 700; margin-top: 1px; line-height: 1.25; color: #334155;">
                                Due: ${new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; pointer-events: auto;">
                        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                            <div style="font-size: 12.5px; font-weight: 900; color: ${b.paid ? '#64748b' : '#1e293b'};">${b.amount ? '₱' + b.amount.toLocaleString() : 'No amount'}</div>
                            <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; padding: 1.5px 5px; border-radius: 5px; display: inline-block; ${b.paid ? 'background: #dcfce7; color: #15803d;' : 'background: #fef3c7; color: #d97706;'}">${b.paid ? 'Paid' : 'Pending'}</span>
                        </div>
                        <button onclick="event.stopPropagation(); window.CalendarView.toggleBillPaid('${b.id}')" title="Toggle Paid Status" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${b.paid ? '#10b981' : '#64748b'}; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <i class="material-icons" style="font-size: 16px;">${b.paid ? 'check_circle' : 'radio_button_unchecked'}</i>
                        </button>
                    </div>
                </div>
            `;

            let cardHtml = '';
            if (todayBills.length > 0) {
                cardHtml += `<div class="bill-section" style="margin-bottom: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="material-icons" style="font-size: 14px;">today</i>
                        <span>Due Today (${todayBills.length})</span>
                    </div>
                    ${todayBills.map(renderBillItem).join('')}
                </div>`;
            }

            if (weekBills.length > 0) {
                cardHtml += `<div class="bill-section" style="margin-bottom: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="material-icons" style="font-size: 14px;">date_range</i>
                        <span>This Week (${weekBills.length})</span>
                    </div>
                    ${weekBills.map(renderBillItem).join('')}
                </div>`;
            }

            if (upcomingBills.length > 0) {
                cardHtml += `<div class="bill-section" style="margin-bottom: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="material-icons" style="font-size: 14px;">upcoming</i>
                        <span>Upcoming (${upcomingBills.length})</span>
                    </div>
                    ${upcomingBills.map(renderBillItem).join('')}
                </div>`;
            }

            // (2026-07-13) Grayed-out PAID section at bottom; prev: hidden paid bills
            if (paidBills.length > 0) {
                cardHtml += `<div class="bill-section" style="margin-top: 14px; opacity: 0.65;">
                    <div style="font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="material-icons" style="font-size: 14px; color: #10b981;">check_circle</i>
                        <span>Paid (${paidBills.length})</span>
                    </div>
                    ${paidBills.map(renderBillItem).join('')}
                </div>`;
            }

            if (!cardHtml) {
                cardHtml = `<div style="text-align: center; padding: 24px 0; color: #94a3b8; font-size: 12px; font-weight: 700;">No upcoming bills to pay.</div>`;
            }

            console.log('?? Final counts - Today:', todayBills.length, 'Week:', weekBills.length, 'Upcoming:', upcomingBills.length, 'Paid:', paidBills.length);
            console.log('? Rendering card HTML');
            
            listEl.innerHTML = cardHtml;
        },

        // (2026-07-13) Inline row popover editor used instead of openAddBillPrompt; prev: JS prompt popups

        openDayModal: function(date, dayTxns) {
            const modal = document.getElementById('calendar-txn-modal');
            const modalBody = document.getElementById('calendar-modal-body');
            const modalTitle = document.getElementById('calendar-modal-date-title');
            const modalFooter = document.getElementById('calendar-modal-footer-summary');

            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            modalTitle.innerText = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
            
            const dayBills = this.getBillsForDate ? this.getBillsForDate(dateStr) : this.bills.filter(b => b.date === dateStr);

            // (2026-07-13) Semantic button element for add bill row in openDayModal; prev: div element
            let billsSectionHtml = `
                <button type="button" class="calendar-top-add-bill-row" data-date="${dateStr}" onclick="window.openAddBillModal('${dateStr}')" style="width:100%; display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:16px; margin-bottom:16px; cursor:pointer; user-select:none; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.02); text-align:left; font-family:inherit;">
                    <div style="display:flex; align-items:center; gap:10px; pointer-events:none;">
                        <div style="width:32px; height:32px; border-radius:10px; background:#ebf5ff; color:#2563eb; display:flex; align-items:center; justify-content:center;">
                            <i class="material-icons" style="font-size:18px;">add</i>
                        </div>
                        <div>
                            <div style="font-size:11.8px; font-weight:800; color:#1e293b; text-transform:uppercase; letter-spacing:-0.2px;">+ Add Bill or Reminder</div>
                            <div style="font-size:8.6px; font-weight:700; color:#64748b;">Set electricity, water, rent, or recurring billers</div>
                        </div>
                    </div>
                </button>
                ${dayBills.length > 0 ? `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:16px;">` + dayBills.map(b => `
                    <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border-radius:12px; padding:10px 12px; border:1px solid #dbeafe; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:30px; height:30px; border-radius:8px; background:${b.color || '#3b82f6'}; color:#fff; display:flex; align-items:center; justify-content:center;">
                                <i class="material-icons" style="font-size:16px;">${b.icon || 'receipt_long'}</i>
                            </div>
                            <div>
                                <div style="font-size:11.8px; font-weight:800; color:#1e293b;">${b.title}</div>
                                <div style="font-size:9px; font-weight:700; color:#64748b;">${b.amount ? '₱' + b.amount.toLocaleString() : 'No amount'}</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <button onclick="window.CalendarView.toggleBillPaid('${b.id}'); window.CalendarView.openDayModal(new Date('${dateStr}'), window.CalendarView.txns.filter(t => t.date && t.date.split('T')[0] === '${dateStr}'));" style="background:${b.paid ? '#dcfce7' : '#f1f5f9'}; color:${b.paid ? '#15803d' : '#475569'}; border:none; border-radius:6px; padding:4px 8px; font-size:9px; font-weight:800; cursor:pointer;">${b.paid ? 'Paid' : 'Pending'}</button>
                            <button onclick="window.CalendarView.deleteBill('${b.id}'); window.CalendarView.openDayModal(new Date('${dateStr}'), window.CalendarView.txns.filter(t => t.date && t.date.split('T')[0] === '${dateStr}'));" style="background:transparent; color:#ef4444; border:none; cursor:pointer; padding:2px;"><i class="material-icons" style="font-size:16px;">delete</i></button>
                        </div>
                    </div>
                `).join('') + `</div>` : ''}
            `;

            let txnsHtml = '';
            if (dayTxns.length === 0) {
                txnsHtml = `<div class="calendar-no-txns" style="text-align:center; padding:20px 0; color:#94a3b8; font-weight:700;">No transactions on this day.</div>`;
                modalFooter.innerHTML = '';
            } else {
                const categoryGroups = {};
                let totalExp = 0, totalInc = 0;

                dayTxns.forEach(t => {
                    const mapped = getCalendarMerchantDisplay(t);
                    const cat = getCalendarTxnCategory(t, mapped);
                    const displayMapped = { ...mapped, category: cat };
                    const amt = t.manualAmount ?? t.amount ?? 0;
                    const isInc = cat === 'Income';

                    if (!categoryGroups[cat]) {
                        const info = CATEGORIES.find(c => c.id === cat) || { label: cat, icon: 'receipt_long', cls: 'cat-financial' };
                        categoryGroups[cat] = { label: info.label, icon: info.icon, cls: info.cls, txns: [], isInc };
                    }
                    categoryGroups[cat].txns.push({ ...t, mapped: displayMapped });
                    if (isInc) totalInc += amt; else if (!t.excluded) totalExp += amt;
                });

                txnsHtml = Object.keys(categoryGroups)
                    .sort((left, right) => getCalendarCategorySortIndex(left) - getCalendarCategorySortIndex(right) || left.localeCompare(right))
                    .map(catName => {
                        const group = categoryGroups[catName];
                        return `
                    <div class="modal-category-group" style="margin-bottom:20px;">
                        <div class="modal-category-header" style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                            <div class="modal-category-icon ${group.cls}" style="width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center;">
                                <i class="material-icons" style="font-size:14px;">${group.icon}</i>
                            </div>
                            <span style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">${group.label}</span>
                        </div>
                        <div class="modal-cat-txns">
                            ${group.txns.map(t => this.createTxnChip(t)).join('')}
                        </div>
                    </div>
                `;
                    }).join('');

                modalFooter.innerHTML = `
                    <div class="modal-summary" style="background:#f8fafc; border-radius:16px; padding:16px; margin:0 4px 4px;">
                        <div class="modal-summary-row" style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase;">Spent</span>
                            <span style="font-size:12px; font-weight:900; color:#ef4444;">- ₱${totalExp.toLocaleString()}</span>
                        </div>
                        <div class="modal-summary-row" style="display:flex; justify-content:space-between; border-top:1px solid #e2e8f0; padding-top:8px;">
                            <span style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase;">Net Balance</span>
                            <span style="font-size:13px; font-weight:900; color:${totalInc - totalExp >= 0 ? '#10b981' : '#ef4444'};">₱${(totalInc - totalExp).toLocaleString()}</span>
                        </div>
                    </div>
                `;
            }

            modalBody.innerHTML = billsSectionHtml + txnsHtml;

            modal.classList.add('show');
            if (window.NavState) window.NavState.pushModalState('calendar-modal', () => this.closeModal());
        },

        selectedBillColor: '#3b82f6',
        selectedBillIcon: 'bolt',

        currentBillModalDate: null,
        selectedModalBillColor: '#3b82f6',
        selectedModalBillIcon: 'bolt',
        selectedModalBillRepeat: 'monthly',

        // (2026-07-13) Centered bill modal layout & premium input styling; prev: uncentered card
        ensureAddBillModalExists: function() {
            let existingModal = document.getElementById('add-bill-modal');
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.id = 'add-bill-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div style="background:#ffffff; border-radius:24px; padding:22px; width:calc(100% - 32px); max-width:380px; box-shadow:0 25px 50px -12px rgba(15,23,42,0.35), 0 0 0 1px rgba(0,0,0,0.05); margin:auto !important; position:relative; z-index:2147483647; font-family:'Plus Jakarta Sans', system-ui, sans-serif;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; border-bottom:1px solid #f1f5f9; padding-bottom:14px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:38px; height:38px; border-radius:12px; background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#ffffff; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(37,99,235,0.3);">
                                <i class="material-icons" style="font-size:20px;">event_note</i>
                            </div>
                            <div>
                                <div style="font-size:15px; font-weight:800; color:#0f172a; letter-spacing:-0.3px;">New Bill / Reminder</div>
                                <div style="font-size:10.5px; font-weight:600; color:#64748b; margin-top:1px;" id="add-bill-modal-date-subtitle">Set recurring or one-time biller</div>
                            </div>
                        </div>
                        <button type="button" onclick="window.CalendarView && window.CalendarView.closeAddBillModal()" style="background:#f1f5f9; border:none; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#64748b; transition:all 0.2s;">
                            <i class="material-icons" style="font-size:18px;">close</i>
                        </button>
                    </div>

                    <div style="margin-bottom:14px;">
                        <label style="font-size:10px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">Biller Name</label>
                        <div style="position:relative; display:flex; align-items:center;">
                            <i class="material-icons" style="position:absolute; left:12px; font-size:18px; color:#94a3b8; pointer-events:none;">edit_note</i>
                            <!-- (2026-07-13) Uppercase biller title input; prev: standard mixed case -->
                            <input type="text" id="bill-modal-input-title" placeholder="E.G. MERALCO, MAYNILAD, NETFLIX, ATOME" style="width:100%; padding:11px 14px 11px 38px; border-radius:12px; border:1.5px solid #cbd5e1; font-size:12px; font-weight:700; color:#0f172a; outline:none; background:#f8fafc; text-transform:uppercase; transition:all 0.2s;" oninput="this.value = this.value.toUpperCase()" onfocus="this.style.borderColor='#2563eb'; this.style.background='#fff';" onblur="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc';" />
                        </div>
                    </div>

                    <div style="display:flex; gap:10px; margin-bottom:14px;">
                        <div style="flex:1; min-width:0;">
                            <label style="font-size:10px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">Amount</label>
                            <div style="position:relative; display:flex; align-items:center;">
                                <span style="position:absolute; left:12px; font-size:13px; font-weight:800; color:#94a3b8; pointer-events:none;">₱</span>
                                <input type="number" id="bill-modal-input-amount" placeholder="0.00" style="width:100%; padding:11px 14px 11px 30px; border-radius:12px; border:1.5px solid #cbd5e1; font-size:12px; font-weight:700; color:#0f172a; outline:none; background:#f8fafc; transition:all 0.2s;" onfocus="this.style.borderColor='#2563eb'; this.style.background='#fff';" onblur="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc';" />
                            </div>
                        </div>
                        <div style="flex:1; min-width:0;">
                            <label style="font-size:10px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">Category Icon</label>
                            <div class="custom-bill-icon-dropdown" style="position:relative;">
                                <div id="bill-modal-icon-trigger" onclick="window.CalendarView && window.CalendarView.toggleBillIconDropdownModal()" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; border:1.5px solid #cbd5e1; font-size:11.5px; font-weight:700; background:#f8fafc; cursor:pointer; transition:all 0.2s;">
                                    <div style="display:flex; align-items:center; gap:6px; overflow:hidden;" id="selected-bill-modal-icon-display">
                                        <i class="material-icons" style="font-size:16px; color:#2563eb; flex-shrink:0;">bolt</i>
                                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#0f172a;">Electricity</span>
                                    </div>
                                    <i class="material-icons" style="font-size:16px; color:#94a3b8;">unfold_more</i>
                                </div>
                                <!-- (2026-07-13) Vertical scrollbar for icon dropdown menu; prev: default overflow -->
                                <div id="bill-modal-icon-dropdown-menu" style="display:none; position:absolute; top:calc(100% + 4px); left:0; right:0; max-height:180px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#cbd5e1 #f1f5f9; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 12px 28px rgba(0,0,0,0.18); z-index:2147483647 !important; padding:6px;">
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('bolt', 'Electricity')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#3b82f6;">bolt</i><span>Electricity</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('water_drop', 'Water')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#06b6d4;">water_drop</i><span>Water</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('wifi', 'Internet / Wifi')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#3b82f6;">wifi</i><span>Internet / Wifi</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('house', 'Rent / Housing')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#f59e0b;">house</i><span>Rent / Housing</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('credit_card', 'Credit Card')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#ef4444;">credit_card</i><span>Credit Card</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('subscriptions', 'Streaming Services')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#8b5cf6;">subscriptions</i><span>Streaming Services</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('smartphone', 'Phone / Mobile')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#10b981;">smartphone</i><span>Phone / Mobile</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('security', 'Insurance')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#3b82f6;">security</i><span>Insurance</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('local_hospital', 'Medical / Health')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#ef4444;">local_hospital</i><span>Medical / Health</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('fitness_center', 'Gym / Fitness')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#f59e0b;">fitness_center</i><span>Gym / Fitness</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('school', 'Tuition / Education')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#8b5cf6;">school</i><span>Tuition / Education</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('account_balance', 'Loan / Mortgage')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#10b981;">account_balance</i><span>Loan / Mortgage</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('directions_car', 'Vehicle / Auto')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#06b6d4;">directions_car</i><span>Vehicle / Auto</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('card_membership', 'Subscription')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#8b5cf6;">card_membership</i><span>Subscription</span></div>
                                    <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('receipt_long', 'Generic Bill')" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#64748b;">receipt_long</i><span>Generic Bill</span></div>
                                </div>
                                <input type="hidden" id="bill-modal-input-icon" value="bolt" />
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom:14px;">
                        <label style="font-size:10px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">Repeat Frequency</label>
                        <div class="custom-bill-repeat-dropdown" style="position:relative;">
                            <div id="bill-modal-repeat-trigger" onclick="window.CalendarView && window.CalendarView.toggleBillRepeatDropdownModal()" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; border:1.5px solid #cbd5e1; font-size:11.5px; font-weight:700; background:#f8fafc; cursor:pointer; transition:all 0.2s;">
                                <span id="selected-bill-modal-repeat-display" style="color:#0f172a;">Every Month</span>
                                <i class="material-icons" style="font-size:16px; color:#94a3b8;">keyboard_arrow_down</i>
                            </div>
                            <div id="bill-modal-repeat-dropdown-menu" style="display:none; position:absolute; top:calc(100% + 4px); left:0; right:0; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 12px 28px rgba(0,0,0,0.18); z-index:2147483647 !important; padding:6px;">
                                <div class="bill-repeat-option" onclick="window.CalendarView.selectBillRepeatModal('monthly', 'Every Month')" style="padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;">Every Month</div>
                                <div class="bill-repeat-option" onclick="window.CalendarView.selectBillRepeatModal('this_month', 'This Month Only')" style="padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;">This Month Only</div>
                                <div class="bill-repeat-option" onclick="window.CalendarView.selectBillRepeatModal('yearly', 'Every Year')" style="padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;">Every Year</div>
                            </div>
                            <input type="hidden" id="bill-modal-input-repeat" value="monthly" />
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; background:#f8fafc; padding:10px 14px; border-radius:14px; border:1px solid #e2e8f0;">
                        <span style="font-size:10px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.5px;">Color Tag:</span>
                        <div style="display:flex; gap:8px;">
                            <!-- (2026-07-13) Swatches style managed dynamically by selectBillColorModal; prev: hardcoded blue ring -->
                            <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#3b82f6')" class="bill-modal-color-swatch active" data-color="#3b82f6" style="width:24px; height:24px; border-radius:50%; background:#3b82f6; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 0 0 2px #2563eb;"></span>
                            <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#ef4444')" class="bill-modal-color-swatch" data-color="#ef4444" style="width:24px; height:24px; border-radius:50%; background:#ef4444; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.15);"></span>
                            <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#10b981')" class="bill-modal-color-swatch" data-color="#10b981" style="width:24px; height:24px; border-radius:50%; background:#10b981; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.15);"></span>
                            <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#f59e0b')" class="bill-modal-color-swatch" data-color="#f59e0b" style="width:24px; height:24px; border-radius:50%; background:#f59e0b; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.15);"></span>
                            <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#8b5cf6')" class="bill-modal-color-swatch" data-color="#8b5cf6" style="width:24px; height:24px; border-radius:50%; background:#8b5cf6; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.15);"></span>
                            <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#06b6d4')" class="bill-modal-color-swatch" data-color="#06b6d4" style="width:24px; height:24px; border-radius:50%; background:#06b6d4; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.15);"></span>
                        </div>
                    </div>

                    <button id="btn-submit-modal-bill" onclick="window.CalendarView && window.CalendarView.submitModalBill()" style="width:100%; background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#ffffff; border:none; border-radius:14px; padding:13px; font-size:13px; font-weight:800; cursor:pointer; box-shadow:0 8px 20px -4px rgba(37,99,235,0.4); transition:all 0.2s;" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 12px 24px -4px rgba(37,99,235,0.5)'" onmouseout="this.style.transform=''; this.style.boxShadow='0 8px 20px -4px rgba(37,99,235,0.4)'">Save Bill Reminder</button>
                    <!-- Component for bill modal delete action -->
                    <button id="btn-delete-modal-bill" onclick="window.CalendarView && window.CalendarView.deleteCurrentModalBill()" style="display:none; width:100%; background:#fef2f2; color:#ef4444; border:1px solid #fee2e2; border-radius:14px; padding:11px; font-size:12.5px; font-weight:800; cursor:pointer; margin-top:10px; transition:all 0.2s; align-items:center; justify-content:center; gap:6px;" onmouseover="this.style.background='#fee2e2'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='#fef2f2'; this.style.transform=''">
                        <i class="material-icons" style="font-size:16px;">delete</i> Delete Bill Reminder
                    </button>
                    <!-- Component for adding bill to budget calculation -->
                    <button id="btn-add-to-calc-modal-bill" onclick="window.CalendarView && window.CalendarView.addBillToCalculation()" style="width:100%; background:#f0f9ff; color:#0369a1; border:1.5px solid #bae6fd; border-radius:14px; padding:11px; font-size:12.5px; font-weight:800; cursor:pointer; margin-top:10px; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px;" onmouseover="this.style.background='#e0f2fe'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='#f0f9ff'; this.style.transform=''">
                        <i class="material-icons" style="font-size:16px;">calculate</i> Add to Calculation
                    </button>
                </div>
            `;
            // (2026-07-13) Backdrop click listener to close add/edit bill modal; prev: no click outside
            modal.onclick = function(e) {
                if (e.target === modal) window.CalendarView && window.CalendarView.closeAddBillModal();
            };
            document.body.appendChild(modal);
            return modal;
        },

        // Auto-save draft data when user types
        saveBillDraft: function() {
            const titleInput = document.getElementById('bill-modal-input-title');
            const amtInput = document.getElementById('bill-modal-input-amount');
            const iconInput = document.getElementById('bill-modal-input-icon');
            const repeatInput = document.getElementById('bill-modal-input-repeat');
            
            if (!titleInput) return;
            
            const draft = {
                title: titleInput.value || '',
                amount: amtInput ? amtInput.value : '',
                icon: iconInput ? iconInput.value : 'bolt',
                repeat: repeatInput ? repeatInput.value : 'monthly',
                color: this.selectedModalBillColor || '#3b82f6',
                date: this.currentBillModalDate,
                timestamp: Date.now()
            };
            
            try {
                localStorage.setItem('wallet_bill_draft', JSON.stringify(draft));
            } catch (e) {
                console.error('Failed to save bill draft', e);
            }
        },

        loadBillDraft: function() {
            try {
                const stored = localStorage.getItem('wallet_bill_draft');
                if (!stored) return null;
                
                const draft = JSON.parse(stored);
                // Only load draft if it's less than 24 hours old
                if (draft.timestamp && (Date.now() - draft.timestamp) < 86400000) {
                    return draft;
                }
            } catch (e) {
                console.error('Failed to load bill draft', e);
            }
            return null;
        },

        clearBillDraft: function() {
            try {
                localStorage.removeItem('wallet_bill_draft');
            } catch (e) {
                console.error('Failed to clear bill draft', e);
            }
        },

        setupBillDraftAutoSave: function() {
            const titleInput = document.getElementById('bill-modal-input-title');
            const amtInput = document.getElementById('bill-modal-input-amount');
            
            if (titleInput) {
                titleInput.addEventListener('input', () => this.saveBillDraft());
            }
            if (amtInput) {
                amtInput.addEventListener('input', () => this.saveBillDraft());
            }
        },

        // (2026-07-13) Smooth fade in/out animation & click outside close; prev: direct display toggle
        openAddBillModal: function(dateStr) {
            this.editingBillId = null;
            this.currentBillModalDate = dateStr || new Date().toISOString().split('T')[0];
            const modal = this.ensureAddBillModalExists();
            const subtitle = document.getElementById('add-bill-modal-date-subtitle');
            if (subtitle) subtitle.innerText = `Due Date: ${new Date(this.currentBillModalDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            const delBtn = document.getElementById('btn-delete-modal-bill');
            if (delBtn) delBtn.style.display = 'none';
            
            // Hide "Add to Calculation" button for new bills
            const addToCalcBtn = document.getElementById('btn-add-to-calc-modal-bill');
            if (addToCalcBtn) addToCalcBtn.style.display = 'none';

            // Try to restore draft
            const draft = this.loadBillDraft();
            const titleInput = document.getElementById('bill-modal-input-title');
            const amtInput = document.getElementById('bill-modal-input-amount');
            
            if (draft && titleInput && amtInput) {
                titleInput.value = draft.title || '';
                amtInput.value = draft.amount || '';
                
                if (draft.icon) {
                    this.selectBillIconModal(draft.icon, draft.icon.toUpperCase());
                }
                if (draft.repeat) {
                    const repeatLabel = draft.repeat === 'monthly' ? 'Every Month' : (draft.repeat === 'yearly' ? 'Every Year' : 'This Month Only');
                    this.selectBillRepeatModal(draft.repeat, repeatLabel);
                }
                if (draft.color) {
                    this.selectBillColorModal(draft.color);
                }
            }
            
            // Setup auto-save listeners
            setTimeout(() => this.setupBillDraftAutoSave(), 100);

            if (modal) {
                modal.style.cssText = "display: flex !important; position: fixed !important; top: 0 !important; left: 50% !important; transform: translateX(-50%) !important; width: 100% !important; max-width: 430px !important; height: 100% !important; background: rgba(15,23,42,0.75) !important; backdrop-filter: blur(8px) !important; z-index: 2147483647 !important; align-items: center !important; justify-content: center !important; padding: 16px !important; opacity: 0 !important; visibility: visible !important; pointer-events: auto !important; box-sizing: border-box !important; transition: opacity 0.25s ease;";
                setTimeout(() => {
                    modal.style.opacity = '1';
                    modal.classList.add('show');
                }, 10);
            }
            if (window.NavState) window.NavState.pushModalState('add-bill-modal', () => this.closeAddBillModal());
        },

        // Map icon names to display labels
        getIconLabel: function(iconName) {
            const iconMap = {
                'bolt': 'Electricity',
                'water_drop': 'Water',
                'wifi': 'Internet / Wifi',
                'house': 'Rent / Housing',
                'credit_card': 'Credit Card',
                'subscriptions': 'Streaming Services',
                'smartphone': 'Phone / Mobile',
                'security': 'Insurance',
                'local_hospital': 'Medical / Health',
                'fitness_center': 'Gym / Fitness',
                'school': 'Tuition / Education',
                'account_balance': 'Loan / Mortgage',
                'directions_car': 'Vehicle / Auto',
                'card_membership': 'Subscription',
                'receipt_long': 'Generic Bill'
            };
            return iconMap[iconName] || iconName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        },

        openEditBillModal: function(billId) {
            const bill = (this.bills || []).find(b => b.id === billId);
            if (!bill) return;

            this.editingBillId = billId;
            this.currentBillModalDate = bill.date;
            this.selectedModalBillIcon = bill.icon || 'receipt_long';
            this.selectedModalBillColor = bill.color || '#3b82f6';
            this.selectedModalBillRepeat = bill.repeat || 'monthly';

            const modal = this.ensureAddBillModalExists();
            
            // Change title to "Edit Bill"
            const titleHeader = modal ? modal.querySelector('div[style*="font-size:15px"]') : null;
            if (titleHeader && titleHeader.textContent.includes('Bill')) {
                titleHeader.innerText = 'Edit Bill';
            }

            const subtitle = document.getElementById('add-bill-modal-date-subtitle');
            if (subtitle) subtitle.innerText = `Due Date: ${new Date(bill.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

            const titleInput = document.getElementById('bill-modal-input-title');
            const amtInput = document.getElementById('bill-modal-input-amount');
            const submitBtn = document.getElementById('btn-submit-modal-bill');
            const delBtn = document.getElementById('btn-delete-modal-bill');

            if (titleInput) titleInput.value = (bill.title || '').toUpperCase();
            if (amtInput) amtInput.value = bill.amount || '';
            if (submitBtn) submitBtn.innerText = 'Update Bill Reminder';
            if (delBtn) delBtn.style.display = 'flex';
            
            // Show "Add to Calculation" button when editing
            const addToCalcBtn = document.getElementById('btn-add-to-calc-modal-bill');
            if (addToCalcBtn) addToCalcBtn.style.display = 'flex';

            this.selectBillIconModal(this.selectedModalBillIcon, this.getIconLabel(this.selectedModalBillIcon));
            this.selectBillRepeatModal(this.selectedModalBillRepeat, this.selectedModalBillRepeat === 'none' ? 'One-time (This date only)' : (this.selectedModalBillRepeat === 'monthly' ? 'Every Month' : 'Every Year'));
            this.selectBillColorModal(this.selectedModalBillColor);

            if (modal) {
                modal.style.cssText = "display: flex !important; position: fixed !important; top: 0 !important; left: 50% !important; transform: translateX(-50%) !important; width: 100% !important; max-width: 430px !important; height: 100% !important; background: rgba(15,23,42,0.75) !important; backdrop-filter: blur(8px) !important; z-index: 2147483647 !important; align-items: center !important; justify-content: center !important; padding: 16px !important; opacity: 0 !important; visibility: visible !important; pointer-events: auto !important; box-sizing: border-box !important; transition: opacity 0.25s ease;";
                setTimeout(() => {
                    modal.style.opacity = '1';
                    modal.classList.add('show');
                }, 10);
            }
            if (window.NavState) window.NavState.pushModalState('add-bill-modal', () => this.closeAddBillModal());
        },

        deleteCurrentModalBill: function() {
            if (!this.editingBillId) return;
            const targetId = this.editingBillId;
            const targetDateStr = this.currentBillModalDate;

            this.deleteBill(targetId, targetDateStr);
            if (window.showToast) window.showToast('Bill reminder deleted successfully!');

            this.editingBillId = null;
            this.closeAddBillModal();
            
            // Don't reopen calendar modal, just refresh the bills list
            this.renderUpcomingBillsCard();
        },

        addBillToCalculation: async function() {
            console.log('Add to Calculation clicked');
            
            // Disable button immediately to prevent double-click
            const addToCalcBtn = document.getElementById('btn-add-to-calc-modal-bill');
            if (addToCalcBtn) {
                addToCalcBtn.disabled = true;
                addToCalcBtn.style.opacity = '0.5';
                addToCalcBtn.style.cursor = 'not-allowed';
                addToCalcBtn.innerHTML = '<i class="material-icons spin" style="font-size:16px; animation: spin 0.8s linear infinite;">sync</i> Adding...';
            }
            
            const titleInput = document.getElementById('bill-modal-input-title');
            const amtInput = document.getElementById('bill-modal-input-amount');
            
            const billTitle = titleInput ? titleInput.value.trim().toUpperCase() : '';
            const billAmount = amtInput ? parseFloat(amtInput.value) || 0 : 0;
            
            console.log('Bill data:', billTitle, billAmount);
            
            if (!billTitle) {
                if (window.showToast) window.showToast('Please enter a biller name first');
                // Re-enable button
                if (addToCalcBtn) {
                    addToCalcBtn.disabled = false;
                    addToCalcBtn.style.opacity = '1';
                    addToCalcBtn.style.cursor = 'pointer';
                    addToCalcBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">calculate</i> Add to Calculation';
                }
                return;
            }
            
            if (!billAmount || billAmount <= 0) {
                if (window.showToast) window.showToast('Please enter a bill amount to add to calculation');
                // Re-enable button
                if (addToCalcBtn) {
                    addToCalcBtn.disabled = false;
                    addToCalcBtn.style.opacity = '1';
                    addToCalcBtn.style.cursor = 'pointer';
                    addToCalcBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">calculate</i> Add to Calculation';
                }
                return;
            }
            
            try {
                // Get auth and config from window
                const auth = window.auth;
                const config = window.safeToSpendConfig || {};
                const db = window.db;
                const doc = window.doc;
                const setDoc = window.setDoc;
                
                console.log('Auth check:', !!auth, !!auth?.currentUser);
                
                if (!auth || !auth.currentUser) {
                    if (window.showToast) window.showToast('Please sign in to add obligations');
                    // Re-enable button
                    if (addToCalcBtn) {
                        addToCalcBtn.disabled = false;
                        addToCalcBtn.style.opacity = '1';
                        addToCalcBtn.style.cursor = 'pointer';
                        addToCalcBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">calculate</i> Add to Calculation';
                    }
                    return;
                }
                
                const uid = auth.currentUser.uid;
                const newObligation = {
                    id: Date.now().toString(),
                    title: billTitle,
                    amount: billAmount
                };
                
                console.log('New obligation:', newObligation);
                
                const updatedObligations = [...(config.obligations || []), newObligation];
                
                console.log('Saving to Firestore...');
                await setDoc(doc(db, "users", uid, "config", "safe_to_spend"), {
                    ...config,
                    obligations: updatedObligations
                }, { merge: true });
                
                console.log('Saved successfully!');
                
                // Synchronize local state
                window.safeToSpendConfig = { ...config, obligations: updatedObligations };
                
                // Update UI
                if (typeof window.updateSafeSpendUI === 'function') {
                    window.updateSafeSpendUI();
                }
                
                // Show success feedback
                if (window.triggerHaptic) window.triggerHaptic('impactMedium');
                
                // Show toast notification with high z-index to appear above modals
                console.log('Showing toast...');
                
                // Set z-index on toast element BEFORE showing
                const toastEl = document.getElementById('toast-box');
                if (toastEl) {
                    toastEl.style.zIndex = '2147483648'; // Higher than modal z-index (2147483647)
                    console.log('Toast z-index set to:', toastEl.style.zIndex);
                }
                
                if (window.showToast) {
                    window.showToast(`${billTitle} added to budget calculation!`);
                }
                
                // Close the bill modal
                this.closeAddBillModal();
                
            } catch (error) {
                console.error('Error adding bill to calculation:', error);
                if (window.showToast) {
                    window.showToast('Failed to add to calculation. Please try again.');
                }
                // Re-enable button on error
                if (addToCalcBtn) {
                    addToCalcBtn.disabled = false;
                    addToCalcBtn.style.opacity = '1';
                    addToCalcBtn.style.cursor = 'pointer';
                    addToCalcBtn.innerHTML = '<i class="material-icons" style="font-size:16px;">calculate</i> Add to Calculation';
                }
            }
        },

        closeAddBillModal: function() {
            const modal = document.getElementById('add-bill-modal');
            if (modal) {
                modal.style.opacity = '0';
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.style.cssText = "display: none !important;";
                }, 250);
            }
            if (window.NavState) window.NavState.popModalState('add-bill-modal');
        },

        toggleBillIconDropdownModal: function() {
            const menu = document.getElementById('bill-modal-icon-dropdown-menu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || !menu.style.display;
                menu.style.display = isHidden ? 'block' : 'none';
            }
        },

        selectBillIconModal: function(iconName, label) {
            this.selectedModalBillIcon = iconName;
            const hiddenInput = document.getElementById('bill-modal-input-icon');
            if (hiddenInput) hiddenInput.value = iconName;

            const displayContainer = document.getElementById('selected-bill-modal-icon-display');
            if (displayContainer) {
                displayContainer.innerHTML = `<i class="material-icons" style="font-size:16px; color:#2563eb; flex-shrink:0;">${iconName}</i><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${label}</span>`;
            }
            const menu = document.getElementById('bill-modal-icon-dropdown-menu');
            if (menu) menu.style.display = 'none';
            
            // Auto-save draft when icon changes
            this.saveBillDraft();
        },

        toggleBillRepeatDropdownModal: function() {
            const menu = document.getElementById('bill-modal-repeat-dropdown-menu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || !menu.style.display;
                menu.style.display = isHidden ? 'block' : 'none';
            }
        },

        selectBillRepeatModal: function(repeatVal, label) {
            this.selectedModalBillRepeat = repeatVal;
            const hiddenInput = document.getElementById('bill-modal-input-repeat');
            if (hiddenInput) hiddenInput.value = repeatVal;

            const displayEl = document.getElementById('selected-bill-modal-repeat-display');
            if (displayEl) displayEl.innerText = label;

            const menu = document.getElementById('bill-modal-repeat-dropdown-menu');
            if (menu) menu.style.display = 'none';
            
            // Auto-save draft when repeat changes
            this.saveBillDraft();
        },

        // (2026-07-13) Dynamic box-shadow ring for selected color swatch; prev: hardcoded blue ring
        selectBillColorModal: function(hex) {
            this.selectedModalBillColor = hex || '#3b82f6';
            document.querySelectorAll('.bill-modal-color-swatch').forEach(sw => {
                const isMatch = sw.dataset.color === this.selectedModalBillColor;
                sw.style.border = isMatch ? '2px solid #ffffff' : '2px solid #ffffff';
                sw.style.boxShadow = isMatch ? '0 0 0 2px ' + this.selectedModalBillColor : '0 1px 3px rgba(0,0,0,0.15)';
                sw.classList.toggle('active', isMatch);
            });
            
            // Auto-save draft when color changes
            this.saveBillDraft();
        },

        // (2026-07-13) Enhanced submitModalBill with input validation & loading spinner; prev: title check only
        submitModalBill: function() {
            const titleInput = document.getElementById('bill-modal-input-title');
            const amtInput = document.getElementById('bill-modal-input-amount');
            const iconInput = document.getElementById('bill-modal-input-icon');
            const repeatInput = document.getElementById('bill-modal-input-repeat');
            const submitBtn = document.getElementById('btn-submit-modal-bill');

            // Reset error states
            if (titleInput) { titleInput.style.borderColor = '#cbd5e1'; titleInput.style.background = '#f8fafc'; }
            if (amtInput) { amtInput.style.borderColor = '#cbd5e1'; amtInput.style.background = '#f8fafc'; }

            const rawTitle = titleInput ? titleInput.value.trim() : '';
            const rawAmt = amtInput ? parseFloat(amtInput.value) : 0;

            if (!rawTitle) {
                if (titleInput) {
                    titleInput.style.borderColor = '#ef4444';
                    titleInput.style.background = '#fef2f2';
                    titleInput.focus();
                }
                if (window.showToast) window.showToast('Please enter a biller name');
                return;
            }

            // Allow amount to be 0 or empty (optional field)
            const finalAmount = (rawAmt && !isNaN(rawAmt) && rawAmt > 0) ? rawAmt : 0;

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="material-icons spin" style="font-size:16px; animation: spin 0.8s linear infinite; vertical-align:middle; margin-right:6px;">sync</i> Saving...`;
            }

            const targetDateStr = this.currentBillModalDate || new Date().toISOString().split('T')[0];

            if (this.editingBillId) {
                const idx = (this.bills || []).findIndex(b => b.id === this.editingBillId);
                if (idx > -1) {
                    this.bills[idx].title = rawTitle.toUpperCase();
                    this.bills[idx].amount = finalAmount;
                    this.bills[idx].date = targetDateStr;
                    this.bills[idx].icon = iconInput?.value || this.selectedModalBillIcon || 'receipt_long';
                    this.bills[idx].color = this.selectedModalBillColor || '#3b82f6';
                    this.bills[idx].repeat = repeatInput?.value || this.selectedModalBillRepeat || 'monthly';
                }
                this.editingBillId = null;
                this.saveBills();
            } else {
                this.addBill({
                    title: rawTitle.toUpperCase(),
                    amount: finalAmount,
                    date: targetDateStr,
                    icon: iconInput?.value || this.selectedModalBillIcon || 'receipt_long',
                    color: this.selectedModalBillColor || '#3b82f6',
                    repeat: repeatInput?.value || this.selectedModalBillRepeat || 'monthly'
                });
            }

            if (window.showToast) window.showToast('Bill reminder saved successfully!');
            
            // Clear the draft after successful save
            this.clearBillDraft();

            setTimeout(() => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `Save Bill Reminder`;
                }
                if (titleInput) titleInput.value = '';
                if (amtInput) amtInput.value = '';
                this.editingBillId = null;
                this.closeAddBillModal();

                if (typeof window.openCalendarModal === 'function') {
                    window.openCalendarModal(new Date(targetDateStr));
                } else {
                    const dayTxns = (this.txns || []).filter(t => t.date && t.date.split('T')[0] === targetDateStr);
                    this.openDayModal(new Date(targetDateStr), dayTxns);
                }
            }, 400);
        },

        // (2026-07-13) Redirect toggleInlineBillForm to openAddBillModal; prev: inline sliding form toggle
        toggleInlineBillForm: function(dateStr) {
            this.openAddBillModal(dateStr);
        },

        submitInlineBill: function(dateStr, btnEl) {
            const titleInput = document.getElementById('bill-input-title');
            const amtInput = document.getElementById('bill-input-amount');
            const iconInput = document.getElementById('bill-input-icon');
            const repeatInput = document.getElementById('bill-input-repeat');
            if (!titleInput || !titleInput.value.trim()) {
                if (window.showToast) window.showToast('Please enter a biller name');
                return;
            }

            const targetBtn = btnEl || event?.currentTarget || document.querySelector('#day-modal-bill-form button');
            if (targetBtn) {
                targetBtn.disabled = true;
                targetBtn.innerHTML = `<i class="material-icons spin" style="font-size:14px; animation: spin 0.8s linear infinite; vertical-align:middle; margin-right:4px;">sync</i> Saving...`;
            }

            this.addBill({
                title: titleInput.value.trim(),
                amount: parseFloat(amtInput?.value) || 0,
                date: dateStr,
                icon: iconInput?.value || this.selectedBillIcon || 'receipt_long',
                color: this.selectedBillColor || '#3b82f6',
                repeat: repeatInput?.value || this.selectedBillRepeat || 'monthly'
            });

            if (window.showToast) window.showToast('Bill reminder saved successfully!');

            setTimeout(() => {
                if (typeof window.openCalendarModal === 'function') {
                    window.openCalendarModal(new Date(dateStr));
                } else {
                    const dayTxns = this.txns.filter(t => t.date && t.date.split('T')[0] === dateStr);
                    this.openDayModal(new Date(dateStr), dayTxns);
                }
            }, 250);
        },

        closeModal: function() {
            const modal = document.getElementById('calendar-txn-modal');
            if (modal) modal.classList.remove('show');
            if (window.NavState) window.NavState.popModalState('calendar-modal');
        },

        createTxnChip: function(t) {
            const amt = t.manualAmount ?? t.amount ?? 0;
            const mapped = t.mapped || getCalendarMerchantDisplay(t);
            const merchantUpper = String(t.merchant || t.name || mapped.name || '').toUpperCase();
            const isInc = mapped.category === 'Income';
            const isAtomePayment = merchantUpper.includes('ATOME PAYMENT');
            const iconName = isAtomePayment ? 'savings' : (mapped.icon || 'receipt_long');
            const iconClass = isAtomePayment ? 'cat-income' : (mapped.catClass || '');
            
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const dateOnly = String(dateStr).split('T')[0].trim();
                const parts = dateOnly.split('-');
                if (parts.length === 3) {
                    const monthNum = parseInt(parts[1], 10) - 1;
                    const day = parseInt(parts[2], 10);
                    if (monthNum >= 0 && monthNum < 12 && day > 0 && day <= 31) {
                        return `${months[monthNum]} ${day}`;
                    }
                }
                return dateStr;
            };
            
            const account = t.account || window.currentAccount || 'atome';
            const accountBadge = account === 'bpi' 
                ? '<div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.12); border: 2px solid #fff; overflow: hidden; padding: 1.5px; z-index: 2;"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/BPI_logo.svg/320px-BPI_logo.svg.png" alt="BPI" style="width: 100%; height: 100%; object-fit: contain;"></div>'
                : '<div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.12); border: 2px solid #fff; overflow: hidden; padding: 1.5px; z-index: 2;"><img src="https://asset.brandfetch.io/idv-ndb21F/id65dSTrJP.png" alt="Atome" style="width: 100%; height: 100%; object-fit: contain;"></div>';
            
            const dateFormatted = formatDate(t.date);
            const metaText = `${dateFormatted} � ${mapped.category || ''}`;
            
            const noteHtml = (t.note && t.note.trim()) 
                ? `<div style="font-size: 9.03px; font-weight: 700; color: #7c3aed; margin-top: 1px; white-space: nowrap; overflow: hidden; mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); font-family: 'Plus Jakarta Sans', sans-serif !important;">${t.note}</div>` 
                : '';
            
            return `
                <div class="calendar-txn-chip ${isInc ? 'income' : 'expense'}" style="display:flex; align-items:center; gap:14px; padding:12px 16px; background:#fff; border:1px solid #f1f5f9; border-radius:16px; margin-bottom:12px; ${t.excluded ? 'opacity:0.5' : ''}; font-family: 'Plus Jakarta Sans', sans-serif !important;">
                    <div class="history-icon ${iconClass}" style="width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; position:relative;">
                        <i class="material-icons" style="font-size:20px;">${iconName}</i>
                        ${accountBadge}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size: 10.91px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 1px; letter-spacing: -0.3px; line-height: 1.3; white-space: nowrap; overflow: hidden; position: relative; mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); font-family: 'Plus Jakarta Sans', sans-serif !important;">${mapped.name || 'UNKNOWN'}</div>
                        <div style="font-size: 8.64px; font-weight: 700; color: #475569; text-transform: uppercase; white-space: nowrap; overflow: hidden; mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); font-family: 'Plus Jakarta Sans', sans-serif !important;">${metaText}</div>
                        ${noteHtml}
                    </div>
                    <div style="font-size: 11.8px; font-weight: 800; text-align: right; white-space: nowrap; color: ${isInc ? '#10b981' : '#f43f5e'}; font-family: 'Plus Jakarta Sans', sans-serif !important;">${isInc ? '+' : '-'}?${Math.abs(amt).toLocaleString()}</div>
                </div>
            `;
        }
    };

    // Expose global helper functions
    window.openAddBillModal = function(dateStr) {
        if (window.CalendarView && typeof window.CalendarView.openAddBillModal === 'function') {
            window.CalendarView.openAddBillModal(dateStr);
        }
    };

    // Expose force sync function for manual triggering
    window.forceSyncBillsToFirestore = function() {
        if (window.CalendarView && typeof window.CalendarView.forceSyncToFirestore === 'function') {
            window.CalendarView.forceSyncToFirestore();
        } else {
            console.warn('CalendarView not initialized');
        }
    };
    
    // Expose sync status for debugging
    window.getBillsSyncStatus = function() {
        if (window.CalendarView && typeof window.CalendarView.getSyncStatus === 'function') {
            const status = window.CalendarView.getSyncStatus();
            console.table(status);
            return status;
        } else {
            console.warn('CalendarView not initialized');
            return null;
        }
    };

    // Auto-initialize CalendarView on script execution
    if (window.CalendarView && typeof window.CalendarView.init === 'function') {
        window.CalendarView.init();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (window.CalendarView && typeof window.CalendarView.init === 'function') {
                window.CalendarView.init();
            }
        });
    }

    // Event delegation for add bill button clicks
    document.addEventListener('click', function(e) {
        const btn = e.target && e.target.closest && e.target.closest('.calendar-top-add-bill-row');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            const dateStr = btn.getAttribute('data-date') || window.CalendarView?.currentBillModalDate || new Date().toISOString().split('T')[0];
            window.openAddBillModal(dateStr);
        }
    }, true);
})(window);
