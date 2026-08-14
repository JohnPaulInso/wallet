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
            // (2026-07-13) Connect My Cards to Firestore with onSnapshot; prev: local storage
            this.subscribeMyCards(uid);

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
                    // [FIXED: 2026-06-27] Keep window.walletAccounts in sync - Antigravity
                    this.accounts = list;
                    window.walletAccounts = list;
                    f.setDoc(configRef, { list });
                    this.render(); 
                    if (typeof window.updateOcrUploadVisibility === 'function') window.updateOcrUploadVisibility();
                } else {
                    // [FIXED: 2026-06-27] Keep window.walletAccounts in sync - Antigravity
                    this.accounts = accounts;
                    window.walletAccounts = accounts;
                    // Cache for next time
                    localStorage.setItem(`accounts_cache_${uid}`, JSON.stringify(accounts));
                    this.render();
                    if (typeof window.updateOcrUploadVisibility === 'function') window.updateOcrUploadVisibility();
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

            // (2026-07-13) Real-time listener trigger for QR sync; prev: manual getDoc
            this.initCardQrRealtimeSync();

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

                // (2026-07-13) Dynamic last4 lookup from My Cards for accounts; prev: acc.last4
                const getRealLast4 = (acc) => {
                    const myCards = this.myCards || [];
                    const match = myCards.find(c => c.issuer && c.issuer.toLowerCase() === acc.id.toLowerCase());
                    if (match && match.number) {
                        const clean = match.number.replace(/\D/g, '');
                        if (clean.length >= 4) return clean.slice(-4);
                    }
                    return acc.last4 || '0000';
                };

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
                            <span>•••• ${getRealLast4(acc)}</span>
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
            if (this.updateFuelTankWidget) this.updateFuelTankWidget();
            // (2026-07-13) Added My Cards render invocation in AccountsView.render; prev: none
            if (this.renderMyCards) this.renderMyCards();

            } catch (err) {
                console.error('CRITICAL: AccountsView.render failed', err);
                this.completeLoadingState();
                const title = document.querySelector('#view-accounts h2');
                if (title) title.innerHTML += ` <span style="color:red; font-size:10px;">(Render Error: ${err.message.substring(0,20)})</span>`;
            }
        },

        // (2026-07-13) Dynamic 12 month options starting from most recent month; prev: static option list
        setupFuelTankFilterDropdowns: function() {
            const monthSelect = document.getElementById('fuel-tank-month-select');
            const yearSelect = document.getElementById('fuel-tank-year-select');
            if (!monthSelect || !yearSelect) return;

            const now = new Date();
            const currentMonthIdx = now.getMonth();
            const currentYear = now.getFullYear();

            if (!monthSelect.dataset.initialized) {
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                monthSelect.innerHTML = '';
                for (let i = 0; i < 12; i++) {
                    const idx = (currentMonthIdx - i + 12) % 12;
                    const opt = document.createElement('option');
                    opt.value = String(idx);
                    opt.textContent = monthNames[idx];
                    monthSelect.appendChild(opt);
                }
                monthSelect.value = String(currentMonthIdx);
                monthSelect.dataset.initialized = 'true';
            }
            if (!yearSelect.dataset.initialized) {
                let hasOpt = Array.from(yearSelect.options).some(o => parseInt(o.value, 10) === currentYear);
                if (!hasOpt) {
                    const opt = document.createElement('option');
                    opt.value = currentYear;
                    opt.textContent = currentYear;
                    yearSelect.appendChild(opt);
                }
                yearSelect.value = String(currentYear);
                yearSelect.dataset.initialized = 'true';
            }
        },

        // (2026-07-30) Aggregates Vehicle fuel expenses, volume & max 10 history items using getMerchantDisplay and robust date parsing; prev: simple category check
        updateFuelTankWidget: function() {
            try {
                this.setupFuelTankFilterDropdowns();

                const spentEl = document.getElementById('fuel-tank-spent');
                const volumeEl = document.getElementById('fuel-tank-volume');
                const rateEl = document.getElementById('fuel-tank-rate');
                const gaugeFillEl = document.getElementById('fuel-tank-gauge-fill');
                const historyListEl = document.getElementById('fuel-tank-history-list');
                const historyCountEl = document.getElementById('fuel-tank-history-count');
                const monthSelect = document.getElementById('fuel-tank-month-select');
                const yearSelect = document.getElementById('fuel-tank-year-select');
                if (!spentEl) return;

                const selMonth = monthSelect ? parseInt(monthSelect.value, 10) : new Date().getMonth();
                const selYear = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear();

                let totalSpent = 0;
                let totalLiters = 0;
                let weightedPplSum = 0;
                let carSpent = 0;
                let carLiters = 0;
                let motorSpent = 0;
                let motorLiters = 0;
                const filteredTxns = [];

                const allSources = [];
                if (Array.isArray(window.allTxns)) allSources.push(...window.allTxns);
                if (window.walletTxns && typeof window.walletTxns === 'object') {
                    Object.values(window.walletTxns).forEach(arr => {
                        if (Array.isArray(arr)) allSources.push(...arr);
                    });
                }
                if (Array.isArray(window.budgetManualTxns)) allSources.push(...window.budgetManualTxns);
                if (Array.isArray(window.allTransactions)) allSources.push(...window.allTransactions);

                const seenKeys = new Set();
                allSources.forEach(t => {
                    if (!t || typeof t !== 'object') return;
                    const key = `${t.id || t._id || t.date || t.merchant || t.name || Math.random()}`;
                    if (seenKeys.has(key)) return;
                    seenKeys.add(key);

                    if (t.excluded || t.reimbursed || t.refund) return;

                    let mapped = null;
                    if (typeof window.getMerchantDisplay === 'function') {
                        mapped = window.getMerchantDisplay(t.merchant || t.name || '', t);
                    } else if (typeof getMerchantDisplay === 'function') {
                        mapped = getMerchantDisplay(t.merchant || t.name || '', t);
                    }

                    const cat = t.manualCategory || t.manualBudgetCategory || (mapped ? mapped.category : t.category) || t.category || '';
                    if (cat !== 'Vehicle') return;

                    let tDate = null;
                    const rawDate = t.date || t.createdAt;
                    if (rawDate) {
                        if (typeof rawDate === 'object' && rawDate.seconds) {
                            tDate = new Date(rawDate.seconds * 1000);
                        } else {
                            tDate = new Date(rawDate);
                        }
                    }

                    if (tDate && !isNaN(tDate.getTime())) {
                        if (tDate.getMonth() !== selMonth || tDate.getFullYear() !== selYear) {
                            return;
                        }
                    }

                    const amt = Math.abs(parseFloat(t.amount !== undefined ? t.amount : (t.manualAmount || 0)));
                    if (isNaN(amt) || amt <= 0) return;

                    totalSpent += amt;
                    const displayName = (mapped && mapped.name) ? mapped.name : (t.name || t.merchant || 'Vehicle Fuel');
                    filteredTxns.push({ ...t, computedAmt: amt, parsedDate: tDate, displayName });

                    const ppl = parseFloat(t.pricePerLiter);
                    let liters = 0;
                    if (!isNaN(ppl) && ppl > 0) {
                        liters = amt / ppl;
                        totalLiters += liters;
                        weightedPplSum += (ppl * liters);
                    }

                    // (2026-07-13) Classifies Car Refill vs Motor Refill vs Motor Refill Full Tank; prev: simple >250 check
                    const textContent = `${t.note || ''} ${t.merchant || ''} ${t.name || ''}`;
                    const refillType = (typeof window.classifyVehicleFuel === 'function') ? window.classifyVehicleFuel(amt, textContent) : (amt > 250 ? 'Car Refill' : 'Motor Refill');
                    if (refillType === 'Car Refill') {
                        carSpent += amt;
                        carLiters += liters;
                    } else {
                        motorSpent += amt;
                        motorLiters += liters;
                    }
                });

                const avgRate = totalLiters > 0 ? (weightedPplSum / totalLiters) : 0;
                const isHidden = localStorage.getItem('balance_hidden') === 'true';

                spentEl.innerText = isHidden ? '******' : `₱${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                volumeEl.innerText = `${totalLiters.toFixed(1)} L`;
                rateEl.innerText = avgRate > 0 ? `₱${avgRate.toFixed(1)}/L` : '—';

                // Update Car vs Motor Refill breakdown elements
                const carSpentEl = document.getElementById('fuel-tank-car-spent');
                const carVolEl = document.getElementById('fuel-tank-car-volume');
                const motorSpentEl = document.getElementById('fuel-tank-motor-spent');
                const motorVolEl = document.getElementById('fuel-tank-motor-volume');

                if (carSpentEl) carSpentEl.innerText = isHidden ? '******' : `₱${carSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (carVolEl) carVolEl.innerText = `${carLiters.toFixed(1)} L`;
                if (motorSpentEl) motorSpentEl.innerText = isHidden ? '******' : `₱${motorSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (motorVolEl) motorVolEl.innerText = `${motorLiters.toFixed(1)} L`;

                if (gaugeFillEl) {
                    const pct = Math.min((totalSpent / 5000) * 100, 100);
                    gaugeFillEl.style.width = `${pct}%`;
                }

                if (historyListEl) {
                    filteredTxns.sort((a, b) => (b.parsedDate ? b.parsedDate.getTime() : 0) - (a.parsedDate ? a.parsedDate.getTime() : 0));
                    

                    const totalCount = filteredTxns.length;
                    if (historyCountEl) historyCountEl.innerText = `${totalCount} logs`;

                    if (totalCount === 0) {
                        historyListEl.innerHTML = `<div class="fuel-tank-empty-state">No fuel logs recorded for this month</div>`;
                    } else {
                        // (2026-07-30) Show all items; prev: sliced to currentLimit with load-more
                        let logsHTML = filteredTxns.map(t => {
                            const nameStr = (t.displayName || t.name || t.merchant || 'Vehicle Fuel').toUpperCase();
                            // (2026-07-13) Use classifyVehicleFuel for default note string; prev: >250 check
                            const defaultNote = (typeof window.classifyVehicleFuel === 'function') ? window.classifyVehicleFuel(t.computedAmt, `${t.merchant || ''} ${t.name || ''}`) : (t.computedAmt > 250 ? 'Car Refill' : 'Motor Refill');
                            const noteStr = t.note || defaultNote;
                            // (2026-07-13) Set purple color (#7c3aed) for Car Refill and blue (#2563eb) for Motor Refill; prev: hardcoded purple
                            const noteColor = noteStr.toLowerCase().includes('motor') ? '#2563eb' : '#7c3aed';
                            const dateStr = t.parsedDate ? `${t.parsedDate.toLocaleString('default', { month: 'short' })} ${t.parsedDate.getDate()}` : '';
                            
                            let fuelBadgeHTML = '';
                            if (t.pricePerLiter) {
                                const ppl = parseFloat(t.pricePerLiter);
                                if (!isNaN(ppl) && ppl > 0 && Math.abs(Number(t.computedAmt)) > 0) {
                                    const liters = (Math.abs(Number(t.computedAmt)) / ppl).toFixed(1);
                                    fuelBadgeHTML = `<span class="vehicle-fuel-chip-badge"><span class="fuel-chip-ppl">₱${ppl.toFixed(1)}/L</span><span class="fuel-chip-dot">&bull;</span><span class="fuel-chip-liters">${liters}L</span></span>`;
                                }
                            }

                            let logoSrc = t.logoUrl || t.brandLogo || null;
                            if (!logoSrc) {
                                if (nameStr.includes('TECFUEL') || nameStr.includes('TEC FUEL')) logoSrc = 'logos/tecfuel.png';
                                else if (nameStr.includes('SHELL')) logoSrc = 'logos/shell.png';
                                else if (nameStr.includes('PETRON')) logoSrc = 'logos/petron.png';
                                else if (nameStr.includes('CALTEX')) logoSrc = 'logos/caltex.png';
                                else if (nameStr.includes('SEAOIL')) logoSrc = 'logos/seaoil.png';
                                else if (nameStr.includes('J AND L') || nameStr.includes('JANL')) logoSrc = 'logos/janl.png';
                            }

                            const brandBadgeHTML = logoSrc ? `<div class="brand-badge"><img src="${logoSrc}" alt="brand"></div>` : '';

                            // (2026-07-30) Wrap in padded row container for vertical spacing; prev: bare premium-txn, no gap
                             return `
                                <div style="padding: 2px 0; border-bottom: 1px solid #f1f5f9;">
                                <div class="premium-txn" style="display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box;">
                                    <div class="icon-box cat-vehicle" style="flex-shrink: 0;">
                                        <i class="material-icons">local_gas_station</i>
                                        ${brandBadgeHTML}
                                    </div>
                                    <div class="txn-details" style="flex: 1; min-width: 0; padding-right: 8px;">
                                        <div class="fuel-txn-merch" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; font-size: 12px; color: #1e293b;">${nameStr}</div>
                                        <div class="fuel-txn-meta" style="font-size: 8.5px; color: #64748b; font-weight: 700; white-space: nowrap;">
                                            <span>${dateStr}</span> &nbsp;&bull;&nbsp; <span>Vehicle</span>
                                            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#3b82f6;margin-left:6px;vertical-align:middle;"></span>
                                        </div>
                                        <div class="fuel-txn-note" style="color: ${noteColor}; font-size: 8.5px; margin-top:2px; display: flex; align-items: center; justify-content: flex-start; flex-wrap: nowrap; gap: 3px; overflow: hidden;">
                                            <span style="${fuelBadgeHTML ? 'max-width: 60px; flex-shrink: 0;' : 'max-width: 140px; flex-shrink: 1;'} overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle;">${noteStr}</span>
                                            ${fuelBadgeHTML}
                                        </div>
                                    </div>
                                    <div class="txn-right" style="flex-shrink: 0; text-align: right; margin-left: 4px;">
                                        <div class="fuel-txn-amount privacy-mask" style="color: #1e293b; font-weight: 800; font-size: 11px; white-space: nowrap;">
                                            ₱${t.computedAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                                </div>
                            `;
                        }).join('');
                        historyListEl.innerHTML = logsHTML;
                    }
                }
            } catch (err) {
                console.error("Error updating fuel tank widget:", err);
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
        },

        // (2026-07-13) Added My Cards carousel, 3D flip & modal handlers; prev: none
        myCards: null,

        // (2026-07-13) User-scoped storage & cyclic deck cloning for 360 peeking; prev: linear
        getStorageKey: function() {
            try {
                if (window.firebase && firebase.auth && firebase.auth().currentUser) {
                    return 'wallet_my_cards_' + firebase.auth().currentUser.uid;
                }
            } catch (e) {}
            return 'wallet_my_cards_data';
        },

        unsubscribeMyCards: null,
        subscribeMyCards: function(uid) {
            const f = getFirebase();
            if (!uid || !f.db || !f.onSnapshot || !f.doc) {
                this.initMyCards();
                this.renderMyCards();
                return;
            }
            const myCardsRef = f.doc(f.db, "users", uid, "config", "my_cards");
            if (this.unsubscribeMyCards) {
                this.unsubscribeMyCards();
                this.unsubscribeMyCards = null;
            }
            this.unsubscribeMyCards = f.onSnapshot(myCardsRef, (docSnap) => {
                if (docSnap.exists()) {
                    this.myCards = docSnap.data().list || [];
                } else {
                    const key = this.getStorageKey();
                    const saved = localStorage.getItem(key);
                    let localList = [];
                    if (saved) {
                        try { localList = JSON.parse(saved) || []; } catch(e) {}
                    }
                    this.myCards = localList;
                    if (localList.length > 0 && f.setDoc) {
                        f.setDoc(myCardsRef, { list: localList }).catch(e => console.error(e));
                    }
                }
                const key = this.getStorageKey();
                localStorage.setItem(key, JSON.stringify(this.myCards || []));
                this.renderMyCards();
            }, (err) => {
                console.warn('MyCards snapshot warn:', err);
                this.initMyCards();
                this.renderMyCards();
            });
        },

        initMyCards: function() {
            const key = this.getStorageKey();
            const saved = localStorage.getItem(key);
            if (saved) {
                try {
                    this.myCards = JSON.parse(saved);
                } catch (e) {
                    this.myCards = [];
                }
            } else {
                this.myCards = [];
            }
            // (2026-07-13) Migrate legacy gotyme.jpg image paths to png; prev: raw storage
            if (Array.isArray(this.myCards)) {
                let fixCount = 0;
                this.myCards.forEach(card => {
                    if (card && card.image && card.image.includes('gotyme.jpg')) {
                        card.image = card.image.replace('gotyme.jpg', 'gotyme.png');
                        fixCount++;
                    }
                });
                if (fixCount > 0) this.saveMyCardsToStorage();
            }
        },

        saveMyCardsToStorage: function() {
            try {
                const key = this.getStorageKey();
                localStorage.setItem(key, JSON.stringify(this.myCards || []));

                const f = getFirebase();
                const uid = f.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid');
                if (uid && f.db && f.doc && f.setDoc) {
                    const myCardsRef = f.doc(f.db, "users", uid, "config", "my_cards");
                    f.setDoc(myCardsRef, { list: this.myCards || [] }).catch(e => console.error('Firestore saveMyCards error:', e));
                }
            } catch (e) {
                console.error('Error saving my cards to storage:', e);
            }
        },

        // (2026-07-13) Cancel long press timer on touch movement; prev: static timer
        touchStartX: 0,
        touchStartY: 0,
        longPressTimer: null,
        isLongPress: false,

        handleCardTouchStart: function(cardId, el, e) {
            this.isLongPress = false;
            if (e && (e.touches || e.clientX !== undefined)) {
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                this.touchStartX = clientX;
                this.touchStartY = clientY;
            }
            if (this.longPressTimer) clearTimeout(this.longPressTimer);
            this.longPressTimer = setTimeout(() => {
                this.isLongPress = true;
                if (navigator.vibrate) navigator.vibrate(50);
                this.openEditCardModal(cardId);
            }, 500);
        },

        handleCardTouchMove: function(e) {
            if (!this.longPressTimer) return;
            if (e && (e.touches || e.clientX !== undefined)) {
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const dist = Math.hypot(clientX - this.touchStartX, clientY - this.touchStartY);
                if (dist > 8) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
        },

        handleCardTouchEnd: function(cardId, el) {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        },

        handleCardClick: function(cardId, el) {
            if (this.isLongPress) {
                this.isLongPress = false;
                return;
            }
            this.toggleCardFlip(el);
        },

        // (2026-07-13) Settle-only 360 clone alignment avoids scroll snap fights; prev: none
        renderMyCards: function() {
            this.initMyCards();
            const carousel = document.getElementById('my-cards-carousel');
            if (!carousel) return;

            const baseCards = this.myCards || [];
            let displayCards = [...baseCards];
            const isCyclic = baseCards.length > 1;

            if (isCyclic) {
                const lastClone = { ...baseCards[baseCards.length - 1], id: baseCards[baseCards.length - 1].id + '_clone_prev', _isClonePrev: true };
                const firstClone = { ...baseCards[0], id: baseCards[0].id + '_clone_next', _isCloneNext: true };
                displayCards = [lastClone, ...baseCards, firstClone];
            }

            const cardsHtml = displayCards.map(card => {
                const cleanNum = (card.number || '').replace(/\D/g, '');
                const last4 = cleanNum.length >= 4 ? cleanNum.slice(-4) : '1234';
                const formattedNum = (card.number || '•••• •••• •••• ' + last4);

                return `
                    <!-- (2026-07-13) Added data-card-id attribute to card items; prev: missing -->
                    <div class="my-card-item ${card._isClonePrev ? 'clone-prev' : ''} ${card._isCloneNext ? 'clone-next' : ''}" data-card-id="${card.id}"
                         onmousedown="AccountsView.handleCardTouchStart('${card.id}', this, event)"
                         onmousemove="AccountsView.handleCardTouchMove(event)"
                         onmouseup="AccountsView.handleCardTouchEnd('${card.id}', this)"
                         onmouseleave="AccountsView.handleCardTouchEnd('${card.id}', this)"
                         ontouchstart="AccountsView.handleCardTouchStart('${card.id}', this, event)"
                         ontouchmove="AccountsView.handleCardTouchMove(event)"
                         ontouchend="AccountsView.handleCardTouchEnd('${card.id}', this)"
                         onclick="AccountsView.handleCardClick('${card.id}', this)">
                        <div class="my-card-inner">
                            <div class="my-card-front" style="background-image: url('${card.image}');">
                                <div class="my-card-front-digits">•&bull;${last4}</div>
                            </div>
                            <div class="my-card-back ${card.theme}">
                                <div class="my-card-magnetic-strip"></div>
                                <div class="my-card-back-center-group">
                                    <!-- (2026-07-13) Revert to content_copy -->
                                    <div class="my-card-back-number-row">
                                        <div class="my-card-back-number">${formattedNum}</div>
                                        <button type="button" class="my-card-copy-btn" onclick="AccountsView.copyCardNumber('${card.number || ''}', event)" title="Copy card number">
                                            <i class="material-icons" style="font-size: 13.5px;">content_copy</i>
                                        </button>
                                    </div>
                                    <div class="my-card-back-subrow">
                                        <span class="my-card-back-expiry">EXP ${card.expiry || 'MM/YY'}</span>
                                        <div class="my-card-cvv-strip">CVV ${card.cvv || '***'}</div>
                                    </div>
                                </div>
                                <div class="my-card-back-footer">
                                    <div class="my-card-back-name" title="${card.name || ''}">${card.name || ''}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            const addCardPlaceholderHtml = `
                <div class="my-card-item my-card-add-placeholder" onclick="AccountsView.openAddCardModal()">
                    <div class="my-card-add-inner">
                        <div class="my-card-add-icon-circle">
                            <i class="material-icons" style="font-size: 22px;">add</i>
                        </div>
                        <span class="my-card-add-title">Add Card</span>
                    </div>
                </div>
            `;

            const hasCards = baseCards.length > 0;
            carousel.innerHTML = (hasCards ? cardsHtml : addCardPlaceholderHtml);
            carousel.style.justifyContent = baseCards.length <= 1 ? 'center' : 'flex-start';

            const headerAddBtn = document.getElementById('my-cards-header-add-btn');
            if (headerAddBtn) {
                headerAddBtn.style.display = hasCards ? 'flex' : 'none';
            }

            this.bindCarouselEndLoop();
            if (isCyclic) {
                setTimeout(() => {
                    const realFirst = carousel.querySelectorAll('.my-card-item')[1];
                    if (realFirst) {
                        // (2026-07-13) Instant scroll centering for first card; prev: scrollIntoView
                        const containerCenter = carousel.clientWidth / 2;
                        const itemCenter = realFirst.offsetLeft + realFirst.offsetWidth / 2;
                        carousel.scrollLeft = itemCenter - containerCenter;
                    }
                    this.updateCardStackZIndex();
                }, 50);
            } else {
                setTimeout(() => this.updateCardStackZIndex(), 50);
            }
        },

        updateCardStackZIndex: function() {
            const carousel = document.getElementById('my-cards-carousel');
            if (!carousel) return;
            const items = carousel.querySelectorAll('.my-card-item');
            if (!items.length) return;

            const containerRect = carousel.getBoundingClientRect();
            const centerPoint = containerRect.left + containerRect.width / 2;

            let activeIndex = 0;
            let minDistance = Infinity;

            items.forEach((item, index) => {
                const rect = item.getBoundingClientRect();
                const itemCenter = rect.left + rect.width / 2;
                const dist = Math.abs(centerPoint - itemCenter);
                if (dist < minDistance) {
                    minDistance = dist;
                    activeIndex = index;
                }
            });

            items.forEach((item, index) => {
                const zIndex = 100 - Math.abs(index - activeIndex);
                item.style.zIndex = zIndex;
                if (index === activeIndex) {
                    item.classList.add('is-active-card');
                } else {
                    item.classList.remove('is-active-card');
                    item.classList.remove('is-flipped');
                }
            });
            this.updateCardQrButton();
        },

        // (2026-07-13) 1x1 QR preview modal & in-place Edit QR upload; prev: instant save
        cardQrs: {},
        pendingQrCardId: null,
        pendingQrDataUrl: null,
        activeViewQrCardId: null,

        // (2026-07-13) Guaranteed card fallback for QR actions; prev: return null
        getActiveCard: function() {
            const carousel = document.getElementById('my-cards-carousel');
            const baseCards = this.myCards || [];
            if (carousel) {
                const activeEl = carousel.querySelector('.my-card-item.is-active-card') || carousel.querySelector('.my-card-item');
                if (activeEl && activeEl.dataset && activeEl.dataset.cardId) {
                    const match = baseCards.find(c => c.id === activeEl.dataset.cardId);
                    if (match) return match;
                    return { id: activeEl.dataset.cardId };
                }
            }
            if (baseCards.length) return baseCards[0];
            return { id: 'card_default' };
        },

        // (2026-07-13) Real-time snapshot delete & edit sync; prev: doc append only
        initCardQrRealtimeSync: function() {
            const f = getFirebase();
            const uid = f.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid');
            if (!uid || uid === 'guest' || !f.db || !f.collection || !f.onSnapshot) return;

            if (this._qrUnsubscribe) this._qrUnsubscribe();

            const colRef = f.collection(f.db, "users", uid, "card_qrs");
            this._qrUnsubscribe = f.onSnapshot(colRef, (snapshot) => {
                const liveDocIds = new Set();
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    const cardId = docSnap.id || data.cardId;
                    if (cardId && data.qrDataUrl) {
                        liveDocIds.add(cardId);
                        this.cardQrs[cardId] = data.qrDataUrl;
                        try {
                            localStorage.setItem(`card_qr_${uid}_${cardId}`, data.qrDataUrl);
                        } catch (e) {}
                    }
                });

                Object.keys(this.cardQrs).forEach(cardId => {
                    if (!liveDocIds.has(cardId) && this.cardQrs[cardId] !== undefined) {
                        delete this.cardQrs[cardId];
                        try {
                            localStorage.removeItem(`card_qr_${uid}_${cardId}`);
                            localStorage.removeItem(`card_qr_${cardId}`);
                            localStorage.removeItem(`card_qr_guest_${cardId}`);
                        } catch (e) {}
                    }
                });

                this.updateCardQrButton();
                if (this.activeViewQrCardId && !this.cardQrs[this.activeViewQrCardId]) {
                    this.closeViewQrModal();
                }
            }, (err) => console.error('onSnapshot card_qrs error:', err));
        },

        // (2026-07-13) Explicit null tombstone check prevents cache reload; prev: undefined
        getCardQr: function(cardId) {
            if (!cardId) return null;
            if (this.cardQrs[cardId] !== undefined) return this.cardQrs[cardId];
            const f = getFirebase();
            const uid = f.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid') || 'guest';
            const localKey = `card_qr_${uid}_${cardId}`;
            const cached = localStorage.getItem(localKey);
            if (cached) {
                this.cardQrs[cardId] = cached;
                return cached;
            }
            if (uid && uid !== 'guest' && f.db && f.doc && f.getDoc) {
                const docRef = f.doc(f.db, "users", uid, "card_qrs", cardId);
                f.getDoc(docRef).then(docSnap => {
                    if (docSnap.exists() && docSnap.data().qrDataUrl) {
                        const url = docSnap.data().qrDataUrl;
                        this.cardQrs[cardId] = url;
                        try { localStorage.setItem(localKey, url); } catch (e) {}
                        this.updateCardQrButton();
                    }
                }).catch(e => console.error('Error fetching card QR doc:', e));
            }
            return null;
        },

        updateCardQrButton: function() {
            const btn = document.getElementById('my-cards-qr-btn');
            const label = document.getElementById('my-cards-qr-btn-label');
            const bar = document.getElementById('my-cards-qr-bar');
            if (!btn || !label || !bar) return;
            const card = this.getActiveCard();
            if (!card) {
                bar.style.display = 'none';
                return;
            }
            bar.style.display = 'flex';
            const hasQr = !!this.getCardQr(card.id);
            label.textContent = hasQr ? 'View QR' : 'Add QR';
            const icon = btn.querySelector('i');
            if (icon) icon.textContent = hasQr ? 'qr_code' : 'qr_code_scanner';
        },

        handleQrButtonClick: function() {
            const card = this.getActiveCard();
            const cardId = card ? card.id : 'card_default';
            if (this.getCardQr(cardId)) {
                this.openViewQrModal(cardId);
            } else {
                this.triggerAddQr(cardId);
            }
        },

        triggerAddQr: function(cardId) {
            const id = cardId || this.getActiveCard()?.id || 'card_default';
            this.pendingQrCardId = id;
            const input = document.getElementById('card-qr-file-input');
            if (input) {
                input.value = '';
                input.click();
            }
        },

        // (2026-07-13) Added NavState push for QR confirm modal; prev: no nav state
        handleQrFileSelect: function(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const cardId = this.pendingQrCardId || this.getActiveCard()?.id;
            if (!cardId) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const rawUrl = e.target.result;
                this.pendingQrDataUrl = rawUrl;
                
                const thumb = document.getElementById('card-qr-confirm-thumb');
                const modal = document.getElementById('card-qr-confirm-modal');
                if (thumb) thumb.src = rawUrl;
                if (modal) {
                    modal.style.display = 'flex';
                    if (window.NavState) {
                        window.NavState.pushModalState('card-qr-confirm-modal', () => this.cancelQrConfirm(true));
                    }
                }
            };
            reader.readAsDataURL(file);
        },

        confirmSaveQr: function() {
            const cardId = this.pendingQrCardId || this.getActiveCard()?.id;
            const dataUrl = this.pendingQrDataUrl;
            if (!cardId || !dataUrl) return;
            
            this.saveCardQr(cardId, dataUrl);
            this.cancelQrConfirm();
            
            const galleryImg = document.getElementById('qr-gallery-image');
            const galleryModal = document.getElementById('card-qr-gallery-modal');
            if (galleryImg) galleryImg.src = dataUrl;
            if (galleryModal && galleryModal.style.display !== 'none') {
                this.openViewQrModal(cardId);
            }
        },

        cancelQrConfirm: function(isFromBack) {
            const modal = document.getElementById('card-qr-confirm-modal');
            if (modal) modal.style.display = 'none';
            this.pendingQrDataUrl = null;
            if (window.NavState) {
                window.NavState.popModalState('card-qr-confirm-modal');
            }
            if (!isFromBack && history.state && history.state.modalId === 'card-qr-confirm-modal') {
                history.back();
            }
        },

        saveCardQr: function(cardId, dataUrl) {
            if (!cardId || !dataUrl) return;
            const f = getFirebase();
            const uid = f.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid') || 'guest';
            const localKey = `card_qr_${uid}_${cardId}`;
            
            this.cardQrs[cardId] = dataUrl;
            try { localStorage.setItem(localKey, dataUrl); } catch (e) {}

            if (uid && uid !== 'guest' && f.db && f.doc && f.setDoc) {
                const qrDocRef = f.doc(f.db, "users", uid, "card_qrs", cardId);
                f.setDoc(qrDocRef, {
                    cardId: cardId,
                    qrDataUrl: dataUrl,
                    updatedAt: Date.now()
                }).catch(err => console.error('Firestore saveCardQr error:', err));
            }
            this.updateCardQrButton();
            if (window.showToast) window.showToast('QR Code saved!');
        },

        // (2026-07-13) Added NavState integration to QR viewer modal; prev: missing nav state
        openViewQrModal: function(cardId) {
            const id = cardId || this.getActiveCard()?.id;
            this.activeViewQrCardId = id;
            const dataUrl = id ? this.getCardQr(id) : null;
            const modal = document.getElementById('card-qr-gallery-modal');
            const img = document.getElementById('qr-gallery-image');
            if (img && dataUrl) img.src = dataUrl;
            if (modal) {
                modal.style.display = 'flex';
                const container = modal.querySelector('.qr-modal-container');
                if (container) container.style.transform = 'none';
                this.bindQrSwipeDownClose(modal);
                if (window.NavState) {
                    window.NavState.pushModalState('card-qr-gallery-modal', () => this.closeViewQrModal(true));
                }
            }
        },

        closeViewQrModal: function(isFromBack) {
            const modal = document.getElementById('card-qr-gallery-modal');
            if (!modal) return;
            modal.style.display = 'none';
            const container = modal.querySelector('.qr-modal-container');
            if (container) container.style.transform = 'none';
            if (window.NavState) {
                window.NavState.popModalState('card-qr-gallery-modal');
            }
            if (!isFromBack && history.state && history.state.modalId === 'card-qr-gallery-modal') {
                history.back();
            }
        },

        bindQrSwipeDownClose: function(modalEl) {
            if (!modalEl || modalEl.dataset.swipeBound) return;
            modalEl.dataset.swipeBound = "true";
            const container = modalEl.querySelector('.qr-modal-container');
            if (!container) return;

            let startY = 0;
            let currentY = 0;
            let isDragging = false;

            container.addEventListener('touchstart', (e) => {
                if (e.target.closest('button') || e.target.closest('.qr-modal-action-chip')) return;
                startY = e.touches[0].clientY;
                currentY = startY;
                isDragging = true;
                container.style.transition = 'none';
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentY = e.touches[0].clientY;
                const deltaY = currentY - startY;
                if (deltaY > 0) {
                    container.style.transform = `translateY(${deltaY}px)`;
                    modalEl.style.opacity = `${Math.max(0.2, 1 - deltaY / 350)}`;
                }
            }, { passive: true });

            container.addEventListener('touchend', () => {
                if (!isDragging) return;
                isDragging = false;
                const deltaY = currentY - startY;
                container.style.transition = '';
                modalEl.style.opacity = '';
                if (deltaY > 100) {
                    this.closeViewQrModal();
                } else {
                    container.style.transform = '';
                }
            }, { passive: true });
        },

        triggerEditQr: function() {
            const id = this.activeViewQrCardId || this.getActiveCard()?.id;
            if (id) this.triggerAddQr(id);
        },

        // (2026-07-13) Added NavState push for QR delete modal; prev: no nav state
        deleteCurrentCardQr: function() {
            const modal = document.getElementById('card-qr-delete-modal');
            if (modal) {
                modal.style.display = 'flex';
                if (window.NavState) {
                    window.NavState.pushModalState('card-qr-delete-modal', () => this.cancelDeleteQrModal(true));
                }
            }
        },

        cancelDeleteQrModal: function(isFromBack) {
            const modal = document.getElementById('card-qr-delete-modal');
            if (modal) modal.style.display = 'none';
            if (window.NavState) {
                window.NavState.popModalState('card-qr-delete-modal');
            }
            if (!isFromBack && history.state && history.state.modalId === 'card-qr-delete-modal') {
                history.back();
            }
        },

        // (2026-07-13) Set explicit null tombstone on delete; prev: delete property only
        confirmDeleteQrModal: function() {
            const cardId = this.activeViewQrCardId || this.getActiveCard()?.id;
            if (!cardId) return;
            this.cancelDeleteQrModal();

            const f = getFirebase();
            const uid = f.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid') || 'guest';

            this.cardQrs[cardId] = null;
            Object.keys(this.cardQrs).forEach(k => {
                if (k.includes(cardId) || cardId.includes(k)) {
                    this.cardQrs[k] = null;
                }
            });

            try {
                localStorage.removeItem(`card_qr_${uid}_${cardId}`);
                localStorage.removeItem(`card_qr_${cardId}`);
                localStorage.removeItem(`card_qr_guest_${cardId}`);
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('card_qr_')) {
                        if (key.includes(cardId) || (uid && key.includes(uid))) {
                            localStorage.removeItem(key);
                        }
                    }
                }
            } catch (e) {}

            if (uid && uid !== 'guest' && f.db && f.doc && f.deleteDoc) {
                const qrDocRef = f.doc(f.db, "users", uid, "card_qrs", cardId);
                f.deleteDoc(qrDocRef)
                    .then(() => console.log('Firestore deleteCardQr success for card:', cardId))
                    .catch(err => console.error('Firestore deleteCardQr error:', err));
            }

            const img = document.getElementById('qr-gallery-image');
            if (img) {
                img.src = '';
                img.removeAttribute('src');
            }
            this.activeViewQrCardId = null;

            this.closeViewQrModal();
            this.updateCardQrButton();
            if (window.showToast) window.showToast('QR Code deleted');
        },

        // (2026-07-13) Enhanced APK-compatible QR save to gallery & share; prev: web-only standard share
        downloadCurrentQr: function() {
            const cardId = this.activeViewQrCardId || this.getActiveCard()?.id;
            const dataUrl = cardId ? this.getCardQr(cardId) : null;
            if (!dataUrl) {
                if (window.showToast) window.showToast('No QR code found');
                return;
            }

            const account = this.accounts ? this.accounts.find(a => a.id === cardId) : null;
            const cardName = account?.name || 'Card';
            const filename = `${cardName.replace(/\s+/g, '-')}-QR.png`;

            if (window.showToast) window.showToast(`Downloading ${cardName} QR Code`);

            const cap = window.Capacitor;
            if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
                const plugins = cap.Plugins || {};
                if (plugins.Share) {
                    plugins.Share.share({
                        title: `${cardName} QR Code`,
                        text: `${cardName} QR Code`,
                        url: dataUrl,
                        dialogTitle: 'Save / Share QR Code'
                    }).catch(() => {});
                    return;
                }
            }

            try {
                const parts = dataUrl.split(',');
                const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
                const bstr = atob(parts[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                const blob = new Blob([u8arr], { type: mime });
                const blobUrl = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(blobUrl);
                    } catch (e) {}
                }, 1000);
            } catch (err) {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try { document.body.removeChild(a); } catch (e) {}
                }, 300);
            }
        },

        shareCurrentQr: function() {
            const cardId = this.activeViewQrCardId || this.getActiveCard()?.id;
            const dataUrl = cardId ? this.getCardQr(cardId) : null;
            if (!dataUrl) {
                if (window.showToast) window.showToast('No QR code found');
                return;
            }

            const account = this.accounts ? this.accounts.find(a => a.id === cardId) : null;
            const cardName = account?.name || 'Card';
            const cap = window.Capacitor;

            if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Share) {
                cap.Plugins.Share.share({
                    title: `${cardName} QR Code`,
                    text: `${cardName} QR Code`,
                    url: dataUrl,
                    dialogTitle: 'Share QR Code'
                }).catch(() => {});
                return;
            }

            if (navigator.share) {
                try {
                    const parts = dataUrl.split(',');
                    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
                    const bstr = atob(parts[1]);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) {
                        u8arr[n] = bstr.charCodeAt(n);
                    }
                    const blob = new Blob([u8arr], { type: mime });
                    const file = new File([blob], `${cardName.replace(/\s+/g, '-')}-QR.png`, { type: mime });

                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        navigator.share({ title: `${cardName} QR Code`, files: [file] }).catch(() => {
                            this.fallbackShareQr(dataUrl, cardName);
                        });
                    } else {
                        this.fallbackShareQr(dataUrl, cardName);
                    }
                } catch (e) {
                    this.fallbackShareQr(dataUrl, cardName);
                }
            } else {
                this.fallbackShareQr(dataUrl, cardName);
            }
        },

        fallbackShareQr: function(dataUrl, cardName) {
            if (navigator.share) {
                navigator.share({ title: `${cardName} QR Code`, text: `${cardName} QR Code` }).catch(() => {
                    this.copyQrToClipboard(dataUrl);
                });
            } else {
                this.copyQrToClipboard(dataUrl);
            }
        },

        copyQrToClipboard: function(dataUrl) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(dataUrl).then(() => {
                    if (window.showToast) window.showToast('QR code copied to clipboard');
                }).catch(() => {
                    if (window.showToast) window.showToast('Share not supported');
                });
            } else {
                if (window.showToast) window.showToast('Share not supported');
            }
        },

        bindCarouselEndLoop: function() {
            const carousel = document.getElementById('my-cards-carousel');
            if (!carousel || carousel.dataset.loopBound) return;
            carousel.dataset.loopBound = "true";

            // (2026-07-13) Seamless instant scroll reset on loop ends; prev: scrollIntoView
            const jumpToItem = (targetItem) => {
                if (!targetItem) return;
                const prevBehavior = carousel.style.scrollBehavior;
                carousel.style.scrollBehavior = 'auto';
                const containerCenter = carousel.clientWidth / 2;
                const itemCenter = targetItem.offsetLeft + targetItem.offsetWidth / 2;
                carousel.scrollLeft = itemCenter - containerCenter;
                carousel.style.scrollBehavior = prevBehavior;
                this.updateCardStackZIndex();
            };

            const checkSettleLoop = () => {
                const baseCards = this.myCards || [];
                if (baseCards.length <= 1) return;
                const items = carousel.querySelectorAll('.my-card-item');
                if (!items.length) return;

                const maxScroll = carousel.scrollWidth - carousel.clientWidth;
                if (maxScroll <= 10) return;

                if (carousel.scrollLeft >= maxScroll - 12) {
                    jumpToItem(items[1]);
                } else if (carousel.scrollLeft <= 12) {
                    jumpToItem(items[items.length - 2]);
                }
            };

            let settleTimer = null;
            carousel.addEventListener('scroll', () => {
                this.updateCardStackZIndex();
                if (settleTimer) clearTimeout(settleTimer);
                settleTimer = setTimeout(checkSettleLoop, 150);
            }, { passive: true });

            if ('onscrollend' in window) {
                carousel.addEventListener('scrollend', checkSettleLoop, { passive: true });
            }

            this.updateCardStackZIndex();
        },

        // (2026-07-13) Only flip active card; scroll unselected card into focus on tap; prev: flip any
        toggleCardFlip: function(cardItemEl) {
            if (!cardItemEl) return;
            if (cardItemEl.classList.contains('is-active-card')) {
                cardItemEl.classList.toggle('is-flipped');
            } else {
                cardItemEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        },

        // (2026-07-13) Added copyCardNumber helper method for card back; prev: none
        copyCardNumber: function(num, event) {
            if (event) event.stopPropagation();
            if (!num) return;
            const cleanNum = num.replace(/\s+/g, '');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(cleanNum);
            } else {
                const input = document.createElement('input');
                input.value = cleanNum;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
            }
            if (window.showToast) {
                window.showToast('Card number copied!');
            }
        },

        // (2026-07-13) Universal back button history pop state for card modal; prev: none
        _isModalHistoryPushed: false,
        _onPopState: null,

        pushModalHistoryState: function() {
            if (!this._isModalHistoryPushed) {
                this._isModalHistoryPushed = true;
                try { window.history.pushState({ cardModalOpen: true }, ''); } catch (e) {}
                this._onPopState = () => {
                    const modal = document.getElementById('add-card-modal');
                    if (modal && modal.style.display !== 'none') {
                        modal.classList.remove('active');
                        modal.style.display = 'none';
                    }
                    this._isModalHistoryPushed = false;
                };
                window.addEventListener('popstate', this._onPopState, { once: true });
            }
        },

        openAddCardModal: function() {
            const modal = document.getElementById('add-card-modal');
            const wrapper = document.querySelector('.mobile-wrapper') || document.body;
            if (modal) {
                if (modal.parentElement !== wrapper) {
                    wrapper.appendChild(modal);
                }
                if (!modal.dataset.outsideBound) {
                    modal.dataset.outsideBound = "true";
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            AccountsView.closeAddCardModal();
                        }
                    });
                }
                modal.classList.add('active');
                modal.style.display = 'flex';
                this.pushModalHistoryState();
            }
            const title = document.getElementById('my-card-modal-title');
            const editIdInput = document.getElementById('my-card-edit-id');
            const delBtn = document.getElementById('my-card-btn-delete');

            const nameInput = document.getElementById('my-card-input-name');
            const numberInput = document.getElementById('my-card-input-number');
            const expiryInput = document.getElementById('my-card-input-expiry');
            const cvvInput = document.getElementById('my-card-input-cvv');
            if (nameInput) nameInput.value = '';
            if (numberInput) numberInput.value = '';
            if (expiryInput) expiryInput.value = '';
            if (cvvInput) cvvInput.value = '';

            if (editIdInput) editIdInput.value = '';
            if (title) title.innerText = 'Add New Card';
            if (delBtn) delBtn.style.display = 'none';
        },

        openEditCardModal: function(cardId) {
            this.initMyCards();
            const card = (this.myCards || []).find(c => c.id === cardId);
            if (!card) return;

            this.openAddCardModal();
            this.pushModalHistoryState();

            const title = document.getElementById('my-card-modal-title');
            const editIdInput = document.getElementById('my-card-edit-id');
            const issuerInput = document.getElementById('my-card-input-issuer');
            const nameInput = document.getElementById('my-card-input-name');
            const numberInput = document.getElementById('my-card-input-number');
            const expiryInput = document.getElementById('my-card-input-expiry');
            const cvvInput = document.getElementById('my-card-input-cvv');
            const delBtn = document.getElementById('my-card-btn-delete');

            if (editIdInput) editIdInput.value = card.id;
            if (issuerInput) issuerInput.value = card.issuer || 'bpi';
            if (nameInput) nameInput.value = card.name || '';
            if (numberInput) numberInput.value = card.number || '';
            if (expiryInput) expiryInput.value = card.expiry || '';
            if (cvvInput) cvvInput.value = card.cvv || '';

            if (title) title.innerText = 'Edit Card';
            if (delBtn) delBtn.style.display = 'block';
        },

        closeAddCardModal: function() {
            const modal = document.getElementById('add-card-modal');
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
            }
            if (this._isModalHistoryPushed) {
                this._isModalHistoryPushed = false;
                if (this._onPopState) window.removeEventListener('popstate', this._onPopState);
                if (window.history.state && window.history.state.cardModalOpen) {
                    window.history.back();
                }
            }
            const nameInput = document.getElementById('my-card-input-name');
            const numberInput = document.getElementById('my-card-input-number');
            const expiryInput = document.getElementById('my-card-input-expiry');
            const cvvInput = document.getElementById('my-card-input-cvv');
            if (nameInput) nameInput.value = '';
            if (numberInput) numberInput.value = '';
            if (expiryInput) expiryInput.value = '';
            if (cvvInput) cvvInput.value = '';
        },

        deleteCurrentCard: function() {
            const editId = document.getElementById('my-card-edit-id')?.value;
            if (!editId) return;

            this.initMyCards();
            this.myCards = this.myCards.filter(c => c.id !== editId);
            this.saveMyCardsToStorage();
            this.renderMyCards();
            this.closeAddCardModal();
            if (window.showToast) window.showToast('Card deleted');
        },

        // (2026-07-13) Auto jump to next input on card number & exp completion; prev: manual
        formatCardNumberInput: function(input) {
            let val = input.value.replace(/\D/g, '').substring(0, 16);
            let formatted = val.replace(/(.{4})/g, '$1 ').trim();
            input.value = formatted;
            if (val.length === 16) {
                const nextInput = document.getElementById('my-card-input-expiry');
                if (nextInput) nextInput.focus();
            }
        },

        formatExpiryInput: function(input) {
            let val = input.value.replace(/\D/g, '').substring(0, 4);
            if (val.length >= 3) {
                input.value = val.substring(0, 2) + '/' + val.substring(2);
            } else {
                input.value = val;
            }
            if (val.length === 4) {
                const nextInput = document.getElementById('my-card-input-cvv');
                if (nextInput) nextInput.focus();
            }
        },

        saveMyCard: function(e) {
            if (e) e.preventDefault();
            const editId = document.getElementById('my-card-edit-id')?.value;
            const issuer = document.getElementById('my-card-input-issuer')?.value || 'bpi';
            const name = (document.getElementById('my-card-input-name')?.value || '').trim().toUpperCase();
            const number = (document.getElementById('my-card-input-number')?.value || '').trim();
            const expiry = (document.getElementById('my-card-input-expiry')?.value || '').trim();
            const cvv = (document.getElementById('my-card-input-cvv')?.value || '').trim();

            if (!name || !number || !expiry || !cvv) return;

            const map = {
                bpi: { image: 'bank_cards/bpi.png', theme: 'theme-bpi' },
                gcash: { image: 'bank_cards/gcash.png', theme: 'theme-gcash' },
                // (2026-07-13) Update gotyme card image extension to png (was gotyme.jpg)
                gotyme: { image: 'bank_cards/gotyme.png', theme: 'theme-gotyme' },
                maribank: { image: 'bank_cards/maribank.png', theme: 'theme-maribank' },
                maya: { image: 'bank_cards/maya.png', theme: 'theme-maya' },
                wise: { image: 'bank_cards/wise.png', theme: 'theme-wise' },
                atome: { image: 'bank_cards/atome.png', theme: 'theme-atome' }
            };

            const config = map[issuer] || map.bpi;
            this.initMyCards();

            if (editId) {
                const existing = this.myCards.find(c => c.id === editId);
                if (existing) {
                    existing.issuer = issuer;
                    existing.name = name;
                    existing.number = number;
                    existing.expiry = expiry;
                    existing.cvv = cvv;
                    existing.image = config.image;
                    existing.theme = config.theme;
                }
            } else {
                const newCard = {
                    id: 'mc_' + issuer + '_' + Date.now(),
                    issuer: issuer,
                    name: name,
                    number: number,
                    expiry: expiry,
                    cvv: cvv,
                    image: config.image,
                    theme: config.theme
                };
                this.myCards.push(newCard);
            }

            this.saveMyCardsToStorage();
            this.renderMyCards();
            this.closeAddCardModal();
            if (window.showToast) window.showToast(editId ? 'Card updated!' : 'Card added successfully!');
        }
    };

    // (2026-07-13) Explicit global window binding for Card QR methods; prev: none
    window.handleQrButtonClick = function() { if (window.AccountsView && window.AccountsView.handleQrButtonClick) window.AccountsView.handleQrButtonClick(); };
})(window);
