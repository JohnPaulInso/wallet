/**
 * Accounts Logic for Smart Wallet (Unified SPA)
 * Prefix: Updated with "accounts-" for all IDs, classes, and UI functions (2026-04-03)
 */

(function(window) {
    // [NEW: ROBUST CORE BRIDGE - 2026-04-03]
    const getFirebase = () => {
        // [FIXED: 2026-04-05] Defensive Bridge: Explicitly check window globals to avoid ReferenceError
        const m = window.FirebaseModule || {};
        return {
            auth: m.auth || window.auth,
            db: m.db || window.db,
            doc: m.doc || window.doc,
            getDoc: m.getDoc || window.getDoc,
            updateDoc: m.updateDoc || window.updateDoc,
            onAuthStateChanged: m.onAuthStateChanged || window.onAuthStateChanged,
            setDoc: m.setDoc || window.setDoc,
            onSnapshot: m.onSnapshot || window.onSnapshot
        };
    };

    window.AccountsView = {
        initialized: false,
        accounts: [],
        unsubscribeAccounts: null,
        authStateUnsubscribe: null,
        pendingGuestModeTimer: null,
        loadingFailsafeTimer: null,
        loadingSnapshotTimeoutMs: 2200,

        init: function() {
            try {
                // [FIXED: 2026-04-05] Standardized UID Key: Using "wallet_last_uid" consistently across SPA
                const lastUid = localStorage.getItem('wallet_last_uid');
                if (lastUid && !this.initialized) {
                    console.log("⚡ [Accounts] Performing early cache load for fast transition...");
                    this.loadCachedAccounts(lastUid);
                }

                if (this.initialized) {
                    this.render(); // Always refresh if switching back to tab
                    return;
                }
                
                // [FIXED: 2026-04-05] Resilient Boot: Track entry time for failsafe
                if (!this.bootStartTime) this.bootStartTime = Date.now();
                const bootElapsed = Date.now() - this.bootStartTime;

                // Wait for Firebase globals to be ready - 2026-04-03
                if (!window.auth || !window.db) {
                    // Failsafe: If waiting > 2.5s, reveal whatever we have (even if empty)
                    if (bootElapsed > 2500) {
                        console.warn("⚠️ [Accounts] Firebase init timeout - forcing UI reveal");
                        this.render(); // This will reveal the "Add Account" placeholder at least
                        this.initialized = true;
                        return;
                    }
                    console.log(`⏳ [Accounts]: Waiting for Firebase... (${bootElapsed}ms)`);
                    setTimeout(() => this.init(), 100);
                    return;
                }

                console.log("💳 [Accounts] Initializing Accounts Live Live Listeners...");
                this.initialized = true;
                this.setupListeners();
            } catch (err) {
                console.error('CRITICAL: AccountsView.init failed', err);
                this.completeLoadingState();
                const title = document.querySelector('#view-accounts h2');
                if (title) title.innerHTML += ` <span style="color:red; font-size:10px;">(Error: ${err.message.substring(0,20)})</span>`;
            }
        },

        scheduleLoadingFailsafe: function(reason = 'accounts-load') {
            if (this.loadingFailsafeTimer) {
                clearTimeout(this.loadingFailsafeTimer);
            }
            this.loadingFailsafeTimer = setTimeout(() => {
                console.warn(`⚠️ [Accounts] Loading failsafe triggered (${reason}) - revealing UI`);
                this.render();
            }, this.loadingSnapshotTimeoutMs);
        },

        completeLoadingState: function() {
            if (this.loadingFailsafeTimer) {
                clearTimeout(this.loadingFailsafeTimer);
                this.loadingFailsafeTimer = null;
            }
            const view = document.getElementById('view-accounts');
            if (view) view.classList.add('accounts-loaded');
        },

        setGuestGateVisible: function(isVisible) {
            const gate = document.getElementById('accounts-guest-gate');
            if (gate) gate.classList.toggle('visible', !!isVisible);
        },

        clearPendingGuestMode: function() {
            if (this.pendingGuestModeTimer) {
                clearTimeout(this.pendingGuestModeTimer);
                this.pendingGuestModeTimer = null;
            }
        },

        setupListeners: function() {
            const { auth, onAuthStateChanged } = getFirebase();
            if (onAuthStateChanged && auth) {
                if (this.authStateUnsubscribe) return;
                this.authStateUnsubscribe = onAuthStateChanged(auth, (user) => {
                    if (user) {
                        this.clearPendingGuestMode();
                        this.setGuestGateVisible(false);
                        // [FIXED: 2026-04-05] Persistence: Standardized key to "wallet_last_uid"
                        localStorage.setItem('wallet_last_uid', user.uid);
                        this.loadCachedAccounts(user.uid);
                        this.loadAccounts(user.uid);
                    } else {
                        this.clearPendingGuestMode();
                        this.pendingGuestModeTimer = setTimeout(() => {
                            this.pendingGuestModeTimer = null;
                            this.handleGuestMode();
                        }, 650);
                    }
                });
            }
        },

        loadCachedAccounts: function(uid) {
            const cacheKey = `accounts_cache_${uid}`;
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                try {
                    const accounts = JSON.parse(cachedData);
                    this.accounts = accounts;
                    this.render(); // [FIXED: 2026-04-05] Render now handles its own visibility reveal
                    console.log("📦 [Accounts] Loaded from cache");
                } catch (e) { console.error("Cache load error", e); }
            }
        },

        async loadAccounts(uid) {
            const f = getFirebase();
            if (!f.db || !f.onSnapshot) {
                console.warn("⚠️ [Accounts] Firebase listener unavailable - revealing current UI");
                this.render();
                return;
            }

            this.scheduleLoadingFailsafe('accounts-snapshot');

            const configRef = f.doc(f.db, "users", uid, "config", "accounts");
            if (this.unsubscribeAccounts) {
                this.unsubscribeAccounts();
                this.unsubscribeAccounts = null;
            }
            
            this.unsubscribeAccounts = f.onSnapshot(configRef, (docSnap) => {
                const accounts = docSnap.exists() ? (docSnap.data().list || []) : [];
                const isAdmin = f.auth?.currentUser?.email === 'johnpaulinso123@gmail.com';
                
                // [NEW: ADMIN INITIALIZATION - Feature Parity with accounts.html]
                if (accounts.length === 0 || (isAdmin && !accounts.some(a => a.id === 'atome'))) {
                    console.log("🚀 [Accounts] Performing Admin/Initial setup...");
                    let list = [];
                    if (isAdmin) {
                        list = [
                            { id: 'atome', name: 'Atome Card', balance: 0, last4: '7312', color: '#121212', type: 'credit', isDefault: true, isBuiltIn: true, createdAt: 1700000000000 },
                            { id: 'bpi', name: 'BPI Card', balance: 0, last4: '6727', color: '#931B1B', type: 'debit', isDefault: false, isBuiltIn: true, createdAt: 1700000000100 },
                            { id: 'default_wallet', name: 'My Wallet', balance: 0, last4: '0000', color: '#121212', type: 'wallet', isDefault: false, isBuiltIn: true, createdAt: 1700000000200 }
                        ];
                    } else {
                        list = [
                            { id: 'default_wallet', name: 'My Wallet', balance: 0, last4: '0000', color: '#121212', type: 'wallet', isDefault: true, isBuiltIn: true, createdAt: Date.now() }
                        ];
                    }
                    // [FIXED: 2026-04-05] Immediate Local Sync for First-Time Users
                    this.accounts = list;
                    f.setDoc(configRef, { list });
                    this.render(); 
                } else {
                    this.accounts = accounts;
                    // Cache for next time
                    localStorage.setItem(`accounts_cache_${uid}`, JSON.stringify(accounts));
                    this.render();
                }
            }, (error) => {
                console.error("❌ [Accounts] Snapshot listener failed", error);
                this.render();
            });
        },

        showLoadingState: function(forceSkeleton = false) {
            const view = document.getElementById('view-accounts');
            const container = document.getElementById('accounts-dynamic-cards');
            const hasVisibleContent = this.accounts.length > 0 || !!container?.querySelector('.accounts-card');
            if (view && (forceSkeleton || !hasVisibleContent)) {
                view.classList.remove('accounts-loaded');
                this.scheduleLoadingFailsafe('accounts-loading-state');
                return;
            }
            this.completeLoadingState();
        },

        refresh: function() {
            const { auth } = getFirebase();
            const uid = auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid');
            this.showLoadingState();
            if (!uid) {
                this.init();
                return;
            }
            this.loadAccounts(uid);
        },

        handleGuestMode: function() {
            this.clearPendingGuestMode();
            this.completeLoadingState();
            this.setGuestGateVisible(true);
            const view = document.getElementById('view-accounts');
            if (view) view.classList.remove('accounts-loaded');
        },

        applyAccountTheme: function(accId) {
            const cardBg = document.getElementById('header-card-bg');
            if (!cardBg) return;
            
            const acc = this.accounts.find(a => a.id === accId);
            const color = acc ? (acc.color || '#121212') : '#121212';
            cardBg.setAttribute('fill', color);
            
            if (window.NavState && window.NavState.saveCardColor) {
                window.NavState.saveCardColor(color);
            }
        },

        render: function() {
            this.clearPendingGuestMode();
            this.completeLoadingState();
            this.setGuestGateVisible(false);
            // [FIXED: 2026-04-05] UNIFIED VISIBILITY: Reveal view early with fade-in animation - Antigravity
            const view = document.getElementById('view-accounts');
            if (view) {
                view.classList.add('accounts-loaded');
                view.classList.add('fade-in-load');
            }

            const container = document.getElementById('accounts-dynamic-cards');
            if (!container) return;
            // Apply premium entrance to the card container
            container.classList.add('fade-in-load');

            const getAccentClass = (name) => {
                const low = (name || '').toLowerCase();
                if (low.includes('atome')) return 'accounts-accent-atome';
                if (low.includes('bpi')) return 'accounts-accent-bpi';
                if (low.includes('gcash')) return 'accounts-accent-gcash';
                if (low.includes('maya')) return 'accounts-accent-maya';
                return 'accounts-accent-bank';
            };

            try {
                const def = this.accounts.find(a => a.isDefault);
                const activeAccountId = window.currentAccount && this.accounts.some(a => a.id === window.currentAccount)
                    ? window.currentAccount
                    : (def ? def.id : this.accounts[0]?.id);
                if (activeAccountId) {
                    window.currentAccount = activeAccountId;
                    localStorage.setItem('wallet_current_account', activeAccountId);
                    this.applyAccountTheme(activeAccountId);
                }

                container.innerHTML = this.accounts.map((acc, index) => `
                <!-- [FIXED: 2026-04-05 - Added explicit ID tracking for robust mapping - Antigravity] -->
                <div class="accounts-card ${getAccentClass(acc.name)}" 
                     id="acc-card-${acc.id}"
                     data-id="${acc.id}" 
                     data-index="${index}">
                    <div class="accounts-icon" style="background: ${acc.color || '#1e293b'};">
                        <i class="material-icons">${this.getIconForType(acc.type)}</i>
                    </div>
                    <div class="accounts-info">
                        <div class="accounts-name-row">
                            <div class="accounts-name">${acc.name}</div>
                            ${acc.isDefault ? '<span class="accounts-status-chip accounts-status-active">DEFAULT</span>' : ''}
                        </div>
                        <div class="accounts-type-row">
                            <span>${(acc.type || 'bank').toUpperCase()}</span>
                            <span style="opacity: 0.3;">•</span>
                            <span>•••• ${acc.last4 || '0000'}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${acc.id === activeAccountId ? `
                            <div class="accounts-status-active" style="color: #10b981; display: flex; align-items: center; gap: 4px;">
                                <i class="material-icons" style="font-size: 16px;">check_circle</i>
                                <span class="accounts-status-chip">ACTIVE</span>
                            </div>
                        ` : acc.isDefault ? `
                            <span class="accounts-status-chip accounts-status-active" style="opacity: 0.72;">DEFAULT</span>
                        ` : `
                            <button class="accounts-set-default-btn" onclick="AccountsView.handleSetDefault('${acc.id}', event)">SET DEFAULT</button>
                        `}
                        ${!acc.isBuiltIn ? `
                            <button onclick="AccountsView.deleteAccount('${acc.id}')" style="background: transparent; border: none; color: #ef4444; padding: 4px; cursor: pointer;">
                                <i class="material-icons" style="font-size: 18px;">delete_outline</i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('');

            if (this.initSortable) this.initSortable();
            if (this.renderPlaceholder) this.renderPlaceholder();

            } catch (err) {
                console.error('CRITICAL: AccountsView.render failed', err);
                this.completeLoadingState();
                const title = document.querySelector('#view-accounts h2');
                if (title) title.innerHTML += ` <span style="color:red; font-size:10px;">(Render Error: ${err.message.substring(0,20)})</span>`;
            }
        },

        getIconForType: function(type) {
            switch(type) {
                case 'credit': return 'credit_card';
                case 'debit': return 'account_balance';
                case 'wallet': return 'account_balance_wallet';
                default: return 'account_balance';
            }
        },

        initSortable: function() {
            const container = document.getElementById('accounts-dynamic-cards');
            if (!container || !window.Sortable) return;

            Sortable.create(container, {
                animation: 150,
                draggable: '.accounts-card',
                ghostClass: 'dragging',
                delay: 200,
                delayOnTouchOnly: true,
                onEnd: () => this.saveNewOrder()
            });
        },

        async saveNewOrder() {
            const { auth, db, doc, updateDoc } = getFirebase();
            const user = auth?.currentUser;
            if (!user) return;
            
            const cards = [...document.querySelectorAll('#accounts-dynamic-cards .accounts-card')];
            const newOrderIds = cards.map(c => c.dataset.id);
            const newList = newOrderIds.map(id => this.accounts.find(a => a.id === id)).filter(Boolean);
            
            try {
                const configRef = doc(db, "users", user.uid, "config", "accounts");
                await updateDoc(configRef, { list: newList });
                this.accounts = newList;
                console.log('📦 [Accounts] New order saved');
            } catch (e) { console.error(e); }
        },

        // [MODIFIED: 2026-04-05 - Unified Sync Fix - Antigravity]
        handleSetDefault: function(accId, event) {
            if (event) event.stopPropagation();
            this.setDefault(accId);
        },

        async setDefault(accId) {
            const f = getFirebase();
            const user = f.auth?.currentUser || window.auth?.currentUser;
            if (!user) return;
            
            console.log(`💳 [Accounts] Setting default to: ${accId}`);
            try {
                const configRef = f.doc(f.db, "users", user.uid, "config", "accounts");
                const newList = this.accounts.map(a => ({ ...a, isDefault: a.id === accId }));
                localStorage.setItem('wallet_current_account', accId);
                window.currentAccount = accId;
                
                await f.updateDoc(configRef, { list: newList });
                this.accounts = newList;
                window.walletAccounts = newList;
                localStorage.setItem(`accounts_cache_${user.uid}`, JSON.stringify(newList));
                localStorage.setItem('wallet_accounts', JSON.stringify(newList));
                
                if (typeof window.switchAccount === 'function') {
                    window.switchAccount(accId, false, true);
                } else {
                    if (typeof window.applyAccountTheme === 'function' && window.walletAccounts) {
                        window.applyAccountTheme(accId, window.walletAccounts);
                    }
                    if (typeof window.loadData === 'function') {
                        window.loadData();
                    }
                }

                this.render();
                if (window.showToast) window.showToast("Default account updated");
            } catch (e) { 
                console.error("SetDefault error:", e); 
                if (window.showToast) window.showToast("Failed to update default");
            }
        },

        async deleteAccount(accId) {
            if (!confirm('Are you sure you want to delete this account?')) return;
            const f = getFirebase();
            const user = f.auth?.currentUser || window.auth?.currentUser;
            if (!user) return;
            try {
                const configRef = doc(db, "users", user.uid, "config", "accounts");
                let newList = this.accounts.filter(a => a.id !== accId);
                if (newList.length > 0 && !newList.some(a => a.isDefault)) {
                    newList[0].isDefault = true;
                }
                await updateDoc(configRef, { list: newList });
                this.accounts = newList;
                this.render();
                if (window.showToast) window.showToast("Account removed");
            } catch (e) { console.error(e); }
        },

        // [FIXED: 2026-04-05 - PERFORMANCE - Decoupled rendering for instant modal appearance - Antigravity]
        openAddModal: function() {
            const modal = document.getElementById('accounts-add-modal');
            if (!modal) return;

            // Reset inputs first (low cost)
            const nameInput = document.getElementById('accounts-input-name');
            const balInput = document.getElementById('accounts-input-balance');
            const l4Input = document.getElementById('accounts-input-last4');
            const typeInput = document.getElementById('accounts-input-type');
            
            if (nameInput) nameInput.value = '';
            if (balInput) balInput.value = '';
            if (l4Input) l4Input.value = '';
            if (typeInput) typeInput.value = 'bank';
            this.selectedColor = '#1e293b';

            // Instant reveal
            modal.classList.add('visible');
            
            // Defer heavy UI updates to next frame
            window.requestAnimationFrame(() => {
                this.updatePreview();
                if (window.NavState) window.NavState.pushModalState('accounts-add-modal', () => this.closeAddModal());
            });
        },

        closeAddModal: function() {
            const modal = document.getElementById('accounts-add-modal');
            if (modal) {
                modal.classList.remove('visible');
                if (window.NavState) window.NavState.popModalState('accounts-add-modal');
            }
        },

        selectColor: function(el) {
            document.querySelectorAll('.accounts-color-option').forEach(c => c.classList.remove('selected'));
            el.classList.add('selected');
            this.selectedColor = el.dataset.color;
            this.updatePreview();
        },

        updatePreview: function() {
            const name = document.getElementById('accounts-input-name').value || 'YOUR CARD';
            const typeValue = document.getElementById('accounts-input-type').value;
            const balance = parseFloat(document.getElementById('accounts-input-balance').value) || 0;
            const last4 = document.getElementById('accounts-input-last4').value || '1234';
            
            // Map type for cleaner display
            const typeMap = { 'bank': 'Bank Account', 'credit': 'Credit Card', 'gcash': 'E-Wallet', 'maya': 'Digital Wallet' };
            const typeLabel = typeMap[typeValue] || 'Account';
            
            const typeEl = document.getElementById('accounts-preview-type');
            if (typeEl) typeEl.innerText = typeLabel.toUpperCase() + ' • ' + name.toUpperCase();
            
            const amountEl = document.getElementById('accounts-preview-amount');
            if (amountEl) amountEl.innerText = '₱' + balance.toLocaleString(undefined, {minimumFractionDigits: 2});
            
            const digitsEl = document.getElementById('accounts-preview-digits');
            if (digitsEl) digitsEl.innerText = '•••• •••• •••• ' + (last4.slice(-4).padStart(4, '0'));
            
            const card = document.getElementById('accounts-preview-card');
            if (card) {
                card.style.background = `linear-gradient(135deg, ${this.selectedColor} 0%, #0f172a 100%)`;
            }
        },

        async saveAccount() {
            const f = getFirebase();
            const user = f.auth?.currentUser || window.auth?.currentUser;
            if (!user) return;

            const name = document.getElementById('accounts-input-name').value.trim();
            const balance = parseFloat(document.getElementById('accounts-input-balance').value) || 0;
            const last4 = document.getElementById('accounts-input-last4').value.trim() || '0000';
            const type = document.getElementById('accounts-input-type').value;
            
            if(!name) { 
                if (window.showToast) window.showToast("Please enter account name");
                return; 
            }
            
            const btn = document.querySelector('.accounts-save-btn');
            const originalText = btn.innerText;
            btn.innerText = 'SAVING...';
            btn.disabled = true;

            try {
                const configRef = doc(db, "users", user.uid, "config", "accounts");
                const newAccount = {
                    id: 'acc_' + Date.now(),
                    name: name,
                    balance: balance,
                    last4: last4,
                    color: this.selectedColor || '#121212',
                    type: type,
                    isDefault: false,
                    isBuiltIn: false,
                    createdAt: Date.now()
                };

                const newList = [...this.accounts, newAccount];
                await updateDoc(configRef, { list: newList });
                
                this.accounts = newList;
                this.render();
                this.closeAddModal();
                if (window.showToast) window.showToast("Account added successfully!");
            } catch (e) {
                console.error(e);
                if (window.showToast) window.showToast("Error saving account");
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        },

        renderPlaceholder: function() {
            const placeholder = document.getElementById('accounts-add-account-placeholder');
            if (placeholder) {
                if (this.accounts.length < 7) {
                    placeholder.innerHTML = `
                        <div class="accounts-add-account-card" onclick="AccountsView.openAddModal()">
                            <div class="accounts-add-account-icon-box" style="background:#f1f5f9; width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center;">
                                <i class="material-icons" style="font-size: 20px; color:#64748b;">add</i>
                            </div>
                            <span class="accounts-add-account-title" style="font-size:12px; font-weight:800; color:#64748b; margin-left:12px;">Link New Bank or Card</span>
                        </div>
                    `;
                } else {
                    placeholder.innerHTML = '';
                }
            }
        }
    };
})(window);
