/**
 * Goals Logic for Smart Wallet (Unified SPA - 100% Parity Version)
 * Ported from goals.html with 'goals-' prefix namespacing.
 * Summarized: Fixed Firestore fetching and design parity issues. (2026-04-03)
 */

(function(window) {
    // Firebase references - initialized inside init() to handle module race condition (2026-04-03)
    /* [MODIFIED: 2026-04-05 - Added writeBatch for atomic transactions - Antigravity] */
    let auth, db, onAuthStateChanged, collection, addDoc, getDocs, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, getDoc, increment, writeBatch;

    // Internal State
    let goals = [];
    let currentUser = null;
    let selectedGoalId = null;
    let selectedIcon = 'savings';
    let dynamicMonthlySavings = 0; // Added for dynamic forecasts (2026-04-03)
    
    const IDS = {
        listContainer: 'goals-list-container',
        listSkeleton: 'goals-list-skeleton',
        totalSummary: 'goals-total-summary',
        summaryRing: 'goals-summary-ring',
        summaryPercent: 'goals-summary-percent',
        totalBalance: 'goals-total-balance',
        summarySkeleton: 'goals-summary-skeleton',
        forecastCard: 'goals-forecast-card',
        forecastSkeleton: 'goals-forecast-skeleton',
        timeForecast: 'goals-time-forecast',
        privacyIcon: 'goals-privacy-icon',
        addModal: 'goals-add-modal',
        depositModal: 'goals-deposit-modal',
        depositTitle: 'goals-deposit-title',
        depositLabel: 'goals-deposit-label',
        depositAmount: 'goals-deposit-amount',
        depositConfirmBtn: 'goals-deposit-confirm-btn',
        contextBackdrop: 'goals-context-backdrop',
        contextOverlay: 'goals-context-overlay',
        iosMenu: 'goals-ios-menu',
        withdrawModal: 'goals-withdraw-modal',
        withdrawTitle: 'goals-withdraw-title',
        withdrawLabel: 'goals-withdraw-label',
        withdrawAmount: 'goals-withdraw-amount',
        withdrawConfirmBtn: 'goals-withdraw-confirm-btn'
    };

    const AVAILABLE_ICONS = [
        { id: 'savings', label: 'Savings', icon: 'savings', bg: '#f0fdf4', color: '#00851F' },
        { id: 'shield', label: 'Shield', icon: 'verified_user', bg: '#f0fdf4', color: '#00851F' },
        { id: 'travel', label: 'Travel', icon: 'flight', bg: '#f0f9ff', color: '#0284c7' },
        { id: 'directions_car', label: 'Vehicle', icon: 'directions_car', bg: '#f5f3ff', color: '#8b5cf6' },
        { id: 'home', label: 'Home', icon: 'home', bg: '#f0fdf4', color: '#22c55e' },
        { id: 'shopping', label: 'Shopping', icon: 'shopping_bag', bg: '#fff7ed', color: '#ea580c' },
        { id: 'favorite', label: 'Health', icon: 'favorite', bg: '#fff1f2', color: '#ef4444' },
        { id: 'education', label: 'School', icon: 'school', bg: '#eff6ff', color: '#1d4ed8' },
        { id: 'trading', label: 'Trading', icon: 'trending_up', bg: '#ecfeff', color: '#0891b2' },
        { id: 'investment', label: 'Invest', icon: 'diamond', bg: '#fefce8', color: '#facc15' },
        { id: 'wedding', label: 'Wedding', icon: 'favorite_border', bg: '#fdf2f8', color: '#ec4899' },
        { id: 'medical', label: 'Medical', icon: 'local_hospital', bg: '#fef2f2', color: '#dc2626' },
        { id: 'gaming', label: 'Gaming', icon: 'sports_esports', bg: '#f5f3ff', color: '#7c3aed' },
        { id: 'tech', label: 'Tech', icon: 'phone_iphone', bg: '#f0f9ff', color: '#0ea5e9' },
        { id: 'fitness', label: 'Fitness', icon: 'fitness_center', bg: '#fef3c7', color: '#d97706' },
        { id: 'emergency', label: 'Emergency', icon: 'emergency', bg: '#fee2e2', color: '#ef4444' }
    ];

    window.GoalsView = {
        initialized: false,
        isPrivacyActive: (localStorage.getItem('wallet_privacy_mode') ?? localStorage.getItem('balance_hidden')) === 'true',
        suppressNextTapUntil: 0,
        unsubscribeGoals: null,

        init: function() {
            if (this.initialized) return;
            console.log("🎯 Initializing Goals View (Parity Mode)...");
            
            // Extract Firebase from global window.FirebaseModule [FIXED: 2026-04-05 - Antigravity]
            const fm = window.FirebaseModule || {};
            auth = fm.auth || window.auth;
            db = fm.db || window.db;
            onAuthStateChanged = fm.onAuthStateChanged || window.onAuthStateChanged;
            collection = fm.collection || window.collection;
            addDoc = fm.addDoc || window.addDoc;
            getDocs = fm.getDocs || window.getDocs;
            query = fm.query || window.query;
            orderBy = fm.orderBy || window.orderBy;
            onSnapshot = fm.onSnapshot || window.onSnapshot;
            doc = fm.doc || window.doc;
            updateDoc = fm.updateDoc || window.updateDoc;
            deleteDoc = fm.deleteDoc || window.deleteDoc;
            serverTimestamp = fm.serverTimestamp || window.serverTimestamp;
            getDoc = fm.getDoc || window.getDoc;
            increment = fm.increment || window.increment;
            writeBatch = fm.writeBatch || window.writeBatch; /* [ADDED: 2026-04-05 - Atomic batch writes - Antigravity] */

            onAuthStateChanged(auth, (user) => {
                if (user) {
                    currentUser = user;
                    this.loadSafeSpendConfig(); // Fetch dynamic results for forecast (2026-04-03)
                    this.loadGoals();
                }
            });
            this.initPrivacyMode();
            this.setupModalBackdropClicks();
            this.initialized = true;
        },

        // --- DATA FETCHING ---
        loadGoals: function() {
            if (!currentUser || !db) return; // Guard clause for incomplete initialization
            
            const goalsRef = collection(db, `users/${currentUser.uid}/goals`);
            const q = query(goalsRef, orderBy("order", "asc"));
            if (this.unsubscribeGoals) {
                this.unsubscribeGoals();
                this.unsubscribeGoals = null;
            }

            // Real-time listener for better UX
            this.unsubscribeGoals = onSnapshot(q, (snapshot) => {
                goals = [];
                snapshot.forEach((doc) => {
                    goals.push({ id: doc.id, ...doc.data() });
                });
                
                // Fallback sorting if order is missing
                goals.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                
                this.render();
                this.hideSkeletons();
            }, (error) => {
                console.error("Error loading goals:", error);
            });
        },

        showLoadingState: function() {
            const listSkeleton = document.getElementById(IDS.listSkeleton);
            const summarySkeleton = document.getElementById(IDS.summarySkeleton);
            const forecastSkeleton = document.getElementById(IDS.forecastSkeleton);
            const container = document.getElementById(IDS.listContainer);
            const summary = document.getElementById(IDS.totalSummary);
            const forecast = document.getElementById(IDS.forecastCard);

            if (listSkeleton) listSkeleton.style.display = 'flex';
            if (summarySkeleton) summarySkeleton.style.display = 'flex';
            if (forecastSkeleton) forecastSkeleton.style.display = 'flex';
            if (container) {
                container.innerHTML = '';
                container.style.opacity = '0';
            }
            if (summary) summary.style.display = 'none';
            if (forecast) forecast.style.display = 'none';
        },

        refresh: function() {
            this.showLoadingState();
            if (!currentUser || !db) {
                this.init();
                return;
            }
            this.loadGoals();
        },

        hideSkeletons: function() {
            const listSkeleton = document.getElementById(IDS.listSkeleton);
            const summarySkeleton = document.getElementById(IDS.summarySkeleton);
            const forecastSkeleton = document.getElementById(IDS.forecastSkeleton);
            
            if (listSkeleton) listSkeleton.style.display = 'none';
            if (summarySkeleton) summarySkeleton.style.display = 'none';
            if (forecastSkeleton) forecastSkeleton.style.display = 'none';

            const container = document.getElementById(IDS.listContainer);
            const summary = document.getElementById(IDS.totalSummary);
            const forecast = document.getElementById(IDS.forecastCard);

            // [FIXED: 2026-04-05 - Added fade-in animation for premium UX - Antigravity]
            if (container) {
                container.style.opacity = '1';
                container.classList.add('fade-in-load');
            }
            if (summary) {
                summary.style.display = 'flex';
                summary.classList.add('fade-in-load');
            }
            if (forecast) {
                forecast.style.display = 'flex';
                forecast.classList.add('fade-in-load');
            }
        },

        // --- RENDERING ---
        render: function() {
            const container = document.getElementById(IDS.listContainer);
            if (!container) return;

            container.innerHTML = '';
            
            if (goals.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                        <div style="font-size: 64px; margin-bottom: 16px;">🎯</div>
                        <h3 style="color: #1e293b; margin-bottom: 8px; font-weight: 800;">No goals yet</h3>
                        <p style="font-size: 14px; line-height: 1.5; font-weight: 500;">Start your financial journey by adding your first goal.</p>
                    </div>
                `;
                this.updateSummary();
                return;
            }

            goals.forEach(goal => {
                container.appendChild(this.createGoalCard(goal));
            });

            this.updateSummary();
            this.initSortable(); // PARITY: goals.html initSortable - 2026-04-03 [Antigravity]
        },

        /* GOALS SORTING: Match goals.html exactly - 2026-04-03 [Antigravity] */
        initSortable: function() {
            const el = document.getElementById(IDS.listContainer);
            if (!window.Sortable || !el) return;
            if (el.sortable) el.sortable.destroy();
            el.sortable = new Sortable(el, {
                animation: 150,
                handle: '.goals-icon-box', // PARITY: goals.html line 1996 - 2026-04-03
                ghostClass: 'sortable-ghost',
                onEnd: async () => {
                    const items = el.querySelectorAll('.goals-card');
                    const updates = [];
                    items.forEach((item, index) => {
                        const id = item.dataset.id;
                        const goal = goals.find(g => g.id === id);
                        if (goal) {
                            goal.order = index;
                            updates.push(updateDoc(doc(db, `users/${currentUser.uid}/goals`, id), { order: index }));
                        }
                    });
                    try { 
                        await Promise.all(updates); 
                        if (window.showToast) window.showToast('New order saved'); 
                    } catch (e) { console.error("Ordering error:", e); }
                }
            });
        },

        createGoalCard: function(goal) {
            const card = document.createElement('div');
            const isExcluded = goal.isExcluded === true;

            // [RESTORED: 2026-04-05 - Fixed ReferenceError by re-defining progress vars - Antigravity]
            const percent = goal.targetAmount > 0 ? Math.round(((goal.currentAmount || 0) / goal.targetAmount) * 100) : 0;
            const clampedPercent = Math.min(100, Math.max(0, percent));
            
            // [FIXED: 2026-04-05 - Added is-finished class for premium reward styling - Antigravity]
            const isFinished = clampedPercent >= 100;
            const cardClass = `goals-card ${isExcluded ? 'excluded' : ''} ${isFinished ? 'is-finished' : ''}`;
            card.className = cardClass;
            card.dataset.id = goal.id;
            
            const iconConfig = this.getIconConfig(goal.icon || 'savings');
            // Atome Shield Logic - Parity with goals.html (2026-04-03)
            const isAtome = (goal.title || '').toUpperCase().includes('ATOME') || goal.isAtome;

            const maskedAmount = this.isPrivacyActive ? '****' : `₱${(goal.currentAmount || 0).toLocaleString()}`;
            // Simplified Masking: Percentage is now '**' if privacy is active (2026-04-03)
            const maskedSubText = this.isPrivacyActive ? '**' : `${percent}% / ₱${(goal.targetAmount || 0).toLocaleString()}`;

            // [MODIFIED: 2026-04-05 - Icon box is now clickable to change icon - Antigravity]
            card.innerHTML = `
                <div class="goals-icon-box" 
                     style="background: ${iconConfig.bg}; color: ${iconConfig.color};" 
                     onclick="GoalsView.openQuickIconPicker('${goal.id}', event)">
                    ${iconConfig.customImage 
                        ? `<img src="${iconConfig.customImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
                        : `<i class="material-icons">${iconConfig.icon}</i>`}
                </div>
                <!-- GOALS CENTER CONTENT: Clickable to view details/analytics -->
                <div class="goals-card-center" onclick="GoalsView.handleCardClick('${goal.id}', event)">
                    <div class="goals-card-title">
                        ${goal.title}
                        ${isAtome ? '<span class="goals-atome-shield-badge">Shield</span>' : ''}
                    </div>
                    <div class="goals-progress-bar-bg">
                        <div class="goals-progress-bar-fill" style="width: ${clampedPercent}%; background: ${iconConfig.color};"></div>
                    </div>
                </div>
                <!-- GOALS RIGHT CONTENT: Amount and secondary progress info -->
                <div class="goals-card-right" onclick="GoalsView.handleCardClick('${goal.id}', event)">
                    <div class="goals-card-amount">${maskedAmount}</div>
                    <div class="goals-card-percent">${maskedSubText}</div>
                </div>
            `;

            // Gesture Support (Long Press for Context Menu) - [FIXED: 2026-04-05 - Added robust cancellation & motion threshold - Antigravity]
            let pressTimer;
            let startCoord = { x: 0, y: 0 };
            let movedEnoughToCancelTap = false;
            
            const startPress = (e) => {
                if (e.type === 'mousedown' && e.button !== 0) return;
                if (e.target.closest('.goals-icon-box')) return;
                
                const touch = e.touches ? e.touches[0] : e;
                startCoord = { x: touch.clientX, y: touch.clientY };
                
                window.isLongPress = false;
                movedEnoughToCancelTap = false;
                card.classList.add('pressing');
                
                pressTimer = setTimeout(() => {
                    window.isLongPress = true;
                    card.classList.remove('pressing');
                    this.openContextMenu(e, goal.id);
                }, 500); // 500ms for better responsiveness
            };

            const movePress = (e) => {
                if (!pressTimer) return;
                const touch = e.touches ? e.touches[0] : e;
                const dx = Math.abs(touch.clientX - startCoord.x);
                const dy = Math.abs(touch.clientY - startCoord.y);
                if (dx > 10 || dy > 10) {
                    movedEnoughToCancelTap = true;
                }
                if ((dx > 10 && dx > dy) || dx > 18 || dy > 18) {
                    this.suppressNextTapUntil = Date.now() + 320;
                    endPress();
                } // Allow small finger drift without canceling the long-press
            };

            const endPress = () => {
                clearTimeout(pressTimer);
                pressTimer = null;
                card.classList.remove('pressing');
                if (movedEnoughToCancelTap) {
                    this.suppressNextTapUntil = Date.now() + 320;
                }
            };

            card.addEventListener('mousedown', startPress);
            card.addEventListener('mouseup', endPress);
            card.addEventListener('mouseleave', endPress);
            card.addEventListener('mousemove', movePress);
            card.addEventListener('touchstart', startPress, { passive: true });
            card.addEventListener('touchmove', movePress, { passive: true });
            card.addEventListener('touchend', endPress, { passive: true });
            card.addEventListener('touchcancel', endPress, { passive: true });
            card.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); return false; }; // [NEW: 2026-04-05] Suppress browser menu

            return card;
        },

        handleCardClick: function(id, event) {
            if (event) event.stopPropagation(); // Prevent bubble from icon clicks
            if (window.isLongPress) return;
            if (Date.now() < this.suppressNextTapUntil) return;
            this.openDepositModal(id);
        },

        // [NEW: 2026-04-05 - Quick Icon Picker from Main List - Antigravity]
        openQuickIconPicker: function(goalId, event) {
            if (event) event.stopPropagation();
            selectedGoalId = goalId;
            const goal = goals.find(g => g.id === goalId);
            if (!goal) return;
            
            selectedIcon = goal.icon || 'savings';
            
            const modal = document.getElementById('goals-icon-picker-modal');
            if (!modal) return;

            // Update modal title for quick pick mode
            const title = modal.querySelector('.goals-modal-title');
            if (title) title.innerText = "Select Goal Icon";

            this.renderIconGrid('goals-edit-icon-grid'); // Re-use the grid ID
            
            modal.style.display = 'flex';
            window.requestAnimationFrame(() => modal.classList.add('show'));

            if (window.NavState) window.NavState.pushModalState('goals-icon-picker-modal', () => {
                const m = document.getElementById('goals-icon-picker-modal');
                if (m) {
                    m.classList.remove('show');
                    setTimeout(() => { if (!m.classList.contains('show')) m.style.display = 'none'; }, 350);
                }
            });
        },

        updateSummary: function() {
            if (!goals || !db) return;
            
            // Filter out excluded or finished goals for calculations - [REFINED: 2026-04-05 - Antigravity]
            const includedGoals = goals.filter(g => {
                const isExcluded = g.isExcluded === true;
                const percent = g.targetAmount > 0 ? (g.currentAmount || 0) / g.targetAmount : 0;
                const isFinished = percent >= 1;
                // Exclude if manually excluded OR automatically if 100% finished
                return !isExcluded && !isFinished;
            });
            const totalSaved = includedGoals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
            const totalTarget = includedGoals.reduce((sum, g) => sum + (g.targetAmount || 0), 0);
            
            const overallPercent = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

            const balEl = document.getElementById(IDS.totalBalance);
            if (balEl) {
                // Simplified Masking: Pure **** for total balance (2026-04-03)
                if (this.isPrivacyActive) {
                    balEl.innerHTML = `****`;
                } else {
                    balEl.innerHTML = `₱${totalSaved.toLocaleString()}<span class="goals-summary-target" style="font-size: 13px; opacity: 0.4; font-weight: 700; margin-left: 2px;">/ ₱${totalTarget.toLocaleString()}</span>`;
                }
            }
            
            const pctEl = document.getElementById(IDS.summaryPercent);
            if (pctEl) {
                // Simplified Masking: Show '**' if privacy is active (2026-04-03)
                pctEl.innerText = this.isPrivacyActive ? '**' : `${overallPercent}%`;
            }
            
            const circle = document.getElementById(IDS.summaryRing);
            if (circle) {
                const radius = 36;
                const circumference = 2 * Math.PI * radius; // 226.2
                circle.style.strokeDashoffset = circumference - (Math.min(100, overallPercent) / 100 * circumference);
            }

            // Milestone Alerts & Confetti - Re-introduced for parity (2026-04-03)
            goals.filter(g => g.isExcluded !== true).forEach(g => {
                const pct = g.targetAmount > 0 ? (g.currentAmount || 0) / g.targetAmount : 0;
                if (pct >= 1) {
                    this.checkAndTriggerGoalAlert(g.id, 'Goal Completed! 🏆', `Congratulations! You've reached your ₱${g.targetAmount.toLocaleString()} goal for ${g.title}.`, 'success', '100');
                } else if (pct >= 0.5) {
                    this.checkAndTriggerGoalAlert(g.id, 'Halfway There!', `You're 50% through your goal for ${g.title}. Keep it up!`, 'success', '50');
                }
            });

            // Update Forecast with remaining amount for included goals
            const remaining = includedGoals.reduce((sum, g) => sum + Math.max(0, g.targetAmount - (g.currentAmount || 0)), 0);
            this.updateForecast(remaining);
        },

        checkAndTriggerGoalAlert: async function(goalId, title, message, type, milestone) {
            const alertKey = `goal_${goalId}_${milestone}`;
            const uid = window.auth?.currentUser?.uid;
            const notificationMeta = {
                action: 'open_goal_edit',
                goalId,
                source: 'goals',
                milestone
            };

            if (uid && window.NotificationsEngine?.hasNotified && window.NotificationsEngine?.triggerNotification) {
                const alreadySent = await window.NotificationsEngine.hasNotified(uid, alertKey);
                if (alreadySent) return;
                await window.NotificationsEngine.triggerNotification(uid, title, message, alertKey, notificationMeta);
            } else {
                const alreadySent = localStorage.getItem(alertKey);
                if (alreadySent) return;
                if (window.createNotification) window.createNotification(title, message, alertKey, null, notificationMeta);
                localStorage.setItem(alertKey, 'true');
            }

            if (milestone === '100' && window.confetti) {
                window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            }
        },

        async loadSafeSpendConfig() {
            if (!currentUser || !db) return;
            try {
                const configRef = doc(db, "users", currentUser.uid, "config", "safe_to_spend");
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    if (data.savingsAmount) {
                        dynamicMonthlySavings = parseFloat(data.savingsAmount);
                        this.updateSummary(); // Recalculate forecast once loaded
                    }
                }
            } catch (e) {
                console.error("Error loading safe_to_spend config:", e);
            }
        },

        updateForecast: function(remaining) {
            const el = document.getElementById(IDS.timeForecast);
            if (!el) return;
            
            if (remaining <= 0) {
                el.innerHTML = `<b>Congratulations!</b> You have reached all your goals! 🎉`;
                return;
            }
            
            if (dynamicMonthlySavings <= 0) {
                el.innerHTML = `Set a <b>Monthly Savings</b> goal in your dashboard to see completion forecasts.`;
                return;
            }

            const monthsToComplete = Math.ceil(remaining / dynamicMonthlySavings);
            const targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + monthsToComplete);
            el.innerHTML = `
                Based on your <b>₱${dynamicMonthlySavings.toLocaleString()}/mo</b> savings,<br>
                estimated completion is <b>${targetDate.toLocaleString('default', { month: 'long' })} ${targetDate.getFullYear()}</b>.
            `;
        },

        // --- PRIVACY MODE ---
        initPrivacyMode: function() {
            this.isPrivacyActive = (localStorage.getItem('wallet_privacy_mode') ?? localStorage.getItem('balance_hidden')) === 'true';
            const icon = document.getElementById(IDS.privacyIcon);
            if (icon) icon.innerText = this.isPrivacyActive ? 'visibility_off' : 'visibility';
        },

        togglePrivacy: function(e) {
            if (e) e.stopPropagation();
            this.isPrivacyActive = !this.isPrivacyActive;
            localStorage.setItem('wallet_privacy_mode', this.isPrivacyActive);
            localStorage.setItem('balance_hidden', this.isPrivacyActive);
            
            const icon = document.getElementById(IDS.privacyIcon);
            if (icon) icon.innerText = this.isPrivacyActive ? 'visibility_off' : 'visibility';
            
            if (navigator.vibrate) navigator.vibrate(10);
            if (typeof window.applySharedPrivacyState === 'function') {
                window.applySharedPrivacyState(this.isPrivacyActive);
                return;
            }
            this.render();
        },

        // --- MODALS ---
        openAddModal: function() {
            const modal = document.getElementById(IDS.addModal);
            if (modal) {
                // [NEW: 2026-04-05 - Navigation Isolation - Antigravity]
                document.body.classList.add('goals-add-modal-active');
                void document.body.offsetWidth; // Force instant layout sync

                modal.style.display = 'flex';
                // Trigger transition
                window.requestAnimationFrame(() => modal.classList.add('show'));
                
                selectedIcon = 'savings';
                const preview = document.getElementById('goals-custom-image-preview');
                const input = document.getElementById('goals-custom-image-input');
                if (preview) { preview.src = ''; preview.style.display = 'none'; }
                if (input) input.value = '';
                this.renderIconGrid('goals-add-icon-grid');
                if (window.NavState) window.NavState.pushModalState(IDS.addModal, () => this.closeModals());
            }
        },

        openDepositModal: function(id) {
            selectedGoalId = id;
            const goal = goals.find(g => g.id === id);
            if (!goal) return;
            this.closeContextMenu();

            const title = document.getElementById(IDS.depositTitle);
            const label = document.getElementById(IDS.depositLabel);
            const amountInput = document.getElementById(IDS.depositAmount);
            const confirmBtn = document.getElementById(IDS.depositConfirmBtn);

            if (title) title.innerText = `Deposit to ${goal.title}`;
            if (label) label.innerText = `Amount (PHP)`;
            if (confirmBtn) {
                confirmBtn.onclick = () => this.executeDeposit();
                confirmBtn.innerText = "Confirm Deposit";
            }
            if (amountInput) amountInput.value = '';

            const modal = document.getElementById(IDS.depositModal);
            if (modal) {
                /* [NEW: 2026-04-06 - Push navbars behind modal via body class - Antigravity] */
                document.body.classList.add('goals-modal-active');
                modal.style.display = 'flex';
                // Trigger transition after display change
                window.requestAnimationFrame(() => {
                    modal.classList.add('show');
                });
                if (window.NavState) window.NavState.pushModalState(IDS.depositModal, () => this.closeModals());
                if (amountInput) window.setTimeout(() => amountInput.focus(), 120);
            }
        },

        closeModals: function() {
            [IDS.addModal, IDS.depositModal, IDS.withdrawModal].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('show');
                    // Wait for CSS transition (0.35s) before display: none
                    setTimeout(() => {
                        if (!el.classList.contains('show')) el.style.display = 'none';
                        // [MODIFIED: 2026-04-06 - Remove both nav isolation classes - Antigravity]
                        document.body.classList.remove('goals-add-modal-active');
                        document.body.classList.remove('goals-modal-active');
                    }, 350);
                    if (window.NavState) window.NavState.popModalState(id);
                }
            });
        },

        /* [MODIFIED: 2026-04-06 - Expanded to ALL goal modals for universal backdrop-click-to-close - Antigravity] */
        setupModalBackdropClicks: function() {
            const allModalIds = [
                IDS.addModal, IDS.depositModal, IDS.withdrawModal,
                'goals-txn-options-modal', 'goals-txn-edit-modal', 'goals-txn-delete-modal',
                'goals-icon-picker-modal', 'goals-delete-modal'
            ];
            allModalIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && !el.dataset.clickBound) {
                    el.addEventListener('click', (e) => {
                        /* Only close if clicking the backdrop overlay itself, not the card inside */
                        if (e.target === el) {
                            this.closeModal(id);
                            /* Also try EditGoalView closeModals for txn modals */
                            if (window.EditGoalView && typeof window.EditGoalView.closeModals === 'function') {
                                window.EditGoalView.closeModals();
                            }
                        }
                    });
                    el.dataset.clickBound = "true";
                }
            });
        },

        // Modal Specific Wrappers - Bridge for index.html (2026-04-03)
        closeAddModal: function() { this.closeModals(); },
        closeDepositModal: function() { this.closeModals(); },
        closeWithdrawModal: function() { this.closeModals(); },
        closeModal: function(id) {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('show');
                setTimeout(() => {
                    if (!el.classList.contains('show')) el.style.display = 'none';
                    // [MODIFIED: 2026-04-06 - Remove both nav isolation classes - Antigravity]
                    document.body.classList.remove('goals-add-modal-active');
                    document.body.classList.remove('goals-modal-active');
                }, 350);
            }
            if (window.NavState) window.NavState.popModalState(id);
        },

        /* [REWRITTEN: 2026-04-05 - Atomic writeBatch deposit with loading state, single close, no stale refs - Antigravity] */
        executeDeposit: async function() {
            const amountInput = document.getElementById(IDS.depositAmount);
            const amountVal = amountInput.value.replace(/,/g, '');
            const amount = parseFloat(amountVal);

            if (isNaN(amount) || amount === 0) {
                if (window.showAppDialog) {
                    window.showAppDialog({ title: 'Invalid Amount', message: 'Please enter a valid amount.' });
                } else {
                    alert('Please enter a valid amount');
                }
                return;
            }

            /* --- Loading state on button --- */
            const btn = document.getElementById(IDS.depositConfirmBtn);
            const originalText = btn ? btn.innerText : 'CONFIRM DEPOSIT';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="material-icons spin" style="font-size:16px;margin-right:8px">refresh</i> SAVING...';
            }

            try {
                /* --- Atomic batch: goal balance + transaction record in one round-trip --- */
                const goalRef = doc(db, `users/${currentUser.uid}/goals`, selectedGoalId);
                const historyRef = doc(collection(db, `users/${currentUser.uid}/goals/${selectedGoalId}/transactions`));

                const batch = writeBatch(db);
                batch.update(goalRef, {
                    currentAmount: increment(amount),
                    updatedAt: serverTimestamp()
                });
                batch.set(historyRef, {
                    type: amount > 0 ? 'deposit' : 'withdrawal',
                    amount: amount,
                    timestamp: serverTimestamp(),
                    note: amount > 0 ? 'Manual Deposit' : 'Manual Withdrawal'
                });

                /* Close modal immediately for snappy UX */
                this.closeModals();

                await batch.commit();

                /* --- Success feedback --- */
                if (window.showToast) window.showToast(amount > 0 ? 'Deposit successful!' : 'Withdrawal successful!');

                /* Sync edit-overlay if it is open */
                const overlay = document.getElementById('goals-edit-overlay');
                if (overlay && overlay.classList.contains('active') && window.EditGoalView) {
                    window.EditGoalView.loadAll();
                }

                /* Confetti on deposit */
                if (amount > 0 && window.confetti) {
                    window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#00851F', '#ffffff', '#10b981'] });
                }
            } catch (e) {
                console.error('Deposit error:', e);
                if (window.showAppDialog) {
                    window.showAppDialog({ title: 'Error', message: 'Error processing deposit. Please try again.' });
                } else {
                    alert('Error processing deposit');
                }
            } finally {
                if (btn) { btn.disabled = false; btn.innerText = originalText; }
            }
        },

        // --- NEW: WITHDRAWAL LOGIC [2026-04-05 - Antigravity] ---
        openWithdrawModal: function(id) {
            selectedGoalId = id || selectedGoalId;
            const goal = goals.find(g => g.id === selectedGoalId);
            if (!goal) return;
            this.closeContextMenu();

            const title = document.getElementById(IDS.withdrawTitle);
            const amountInput = document.getElementById(IDS.withdrawAmount);
            if (title) title.innerText = `Withdraw from ${goal.title}`;
            if (amountInput) amountInput.value = '';

            const modal = document.getElementById(IDS.withdrawModal);
            if (modal) {
                /* [NEW: 2026-04-06 - Push navbars behind modal via body class - Antigravity] */
                document.body.classList.add('goals-modal-active');
                modal.style.display = 'flex';
                window.requestAnimationFrame(() => modal.classList.add('show'));
                if (window.NavState) window.NavState.pushModalState(IDS.withdrawModal, () => this.closeModals());
                if (amountInput) window.setTimeout(() => amountInput.focus(), 120);
            }
        },

        /* [REWRITTEN: 2026-04-05 - Atomic writeBatch withdrawal with loading state - Antigravity] */
        executeWithdrawal: async function() {
            const amountInput = document.getElementById(IDS.withdrawAmount);
            const amountVal = amountInput.value.replace(/,/g, '');
            const amount = parseFloat(amountVal);

            if (isNaN(amount) || amount <= 0) {
                if (window.showAppDialog) window.showAppDialog({ title: 'Invalid Amount', message: 'Enter a valid amount to withdraw.' });
                return;
            }

            const btn = document.getElementById(IDS.withdrawConfirmBtn);
            const originalText = btn ? btn.innerText : 'CONFIRM WITHDRAWAL';
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="material-icons spin" style="font-size:16px;margin-right:8px">refresh</i> PROCESSING...'; }

            try {
                const goalRef = doc(db, `users/${currentUser.uid}/goals`, selectedGoalId);
                const historyRef = doc(collection(db, `users/${currentUser.uid}/goals/${selectedGoalId}/transactions`));

                const batch = writeBatch(db);
                batch.update(goalRef, {
                    currentAmount: increment(-amount),
                    updatedAt: serverTimestamp()
                });
                batch.set(historyRef, {
                    type: 'withdrawal',
                    amount: -amount,
                    timestamp: serverTimestamp(),
                    note: 'Manual Withdrawal'
                });

                this.closeModals();
                await batch.commit();

                if (window.showToast) window.showToast('Withdrawal successful!');

                /* Sync edit-overlay if open */
                const overlay = document.getElementById('goals-edit-overlay');
                if (overlay && overlay.classList.contains('active') && window.EditGoalView) {
                    window.EditGoalView.loadAll();
                }
            } catch (e) {
                console.error('Withdrawal error:', e);
                if (window.showAppDialog) window.showAppDialog({ title: 'Error', message: 'Withdrawal failed.' });
            } finally {
                if (btn) { btn.disabled = false; btn.innerText = originalText; }
            }
        },

        setSelectedIcon: function(iconId) {
            selectedIcon = iconId;
        },

        /* [NEW: 2026-04-05 - Allow EditGoalView to sync the active goal ID for icon persistence - Antigravity] */
        setSelectedGoalId: function(goalId) {
            selectedGoalId = goalId;
        },

        // --- ICON GRID ---
        renderIconGrid: function(containerId) {
            const grid = document.getElementById(containerId);
            if (!grid) return;
            grid.innerHTML = '';
            
            // [NEW: 2026-04-05 - Sync active icon state - Antigravity]
            /* [REWRITTEN: 2026-04-05 - Icon grid with immediate DB persist and cross-view sync - Antigravity] */
            AVAILABLE_ICONS.forEach(icon => {
                const isActive = selectedIcon === icon.id;
                const item = document.createElement('div');
                item.className = `goals-icon-item ${isActive ? 'active' : ''}`;
                item.style.cursor = 'pointer';
                item.onclick = async () => {
                    selectedIcon = icon.id;
                    const addPreview = document.getElementById('goals-custom-image-preview');
                    const editPreview = document.getElementById('goals-edit-custom-image-preview');
                    if (addPreview) addPreview.style.display = 'none';
                    if (editPreview) editPreview.style.display = 'none';
                    this.renderIconGrid(containerId);

                    /* Persist icon to Firestore immediately for existing goals */
                    const goalIdToSave = selectedGoalId || (window.EditGoalView && window.EditGoalView.getCurrentGoalId ? window.EditGoalView.getCurrentGoalId() : null);
                    if (goalIdToSave) {
                        await this.saveQuickIcon(goalIdToSave, selectedIcon);
                    }

                    /* Sync the edit-overlay preview icon in real time */
                    if (window.EditGoalView && typeof window.EditGoalView.updateIconPreview === 'function') {
                        window.EditGoalView.updateIconPreview(icon.id);
                    }
                };
                item.innerHTML = `
                    <div class="goals-icon-box" style="background: ${icon.bg}; color: ${icon.color};">
                        <i class="material-icons">${icon.icon}</i>
                    </div>
                    <span class="goals-icon-item-label">${icon.label}</span>
                `;
                grid.appendChild(item);
            });
        },

        // [NEW: 2026-04-05 - Save icon change immediately - Antigravity]
        saveQuickIcon: async function(goalId, iconId) {
            if (!currentUser || !db) return;
            try {
                const goalRef = doc(db, `users/${currentUser.uid}/goals`, goalId);
                await updateDoc(goalRef, {
                    icon: iconId,
                    updatedAt: serverTimestamp()
                });
                if (window.showToast) window.showToast("Icon updated!");
            } catch (e) {
                console.error("Error saving icon:", e);
                if (window.showToast) window.showToast("Failed to update icon");
            }
        },

        // --- HELPERS ---
        getIconConfig: function(id) {
            if (id && (String(id).startsWith('data:') || String(id).startsWith('http'))) {
                return { icon: null, bg: '#f8fafc', color: '#64748b', customImage: id };
            }
            return AVAILABLE_ICONS.find(i => i.id === id) || AVAILABLE_ICONS[0];
        },

        handleImageUpload: function(event, previewId, gridId) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                selectedIcon = e.target.result;
                const preview = document.getElementById(previewId);
                if (preview) {
                    preview.src = selectedIcon;
                    preview.style.display = 'block';
                }
                this.renderIconGrid(gridId);
                if (window.EditGoalView && typeof window.EditGoalView.updateIconPreview === 'function') {
                    window.EditGoalView.updateIconPreview();
                }
            };
            reader.readAsDataURL(file);
        },

        formatCurrencyInput: function(input) {
            // [FIXED: 2026-04-05 - Permit leading minus for withdrawals - Antigravity]
            let isNeg = input.value.startsWith('-');
            let val = input.value.replace(/\D/g, '');
            if (val === '') {
                input.value = isNeg ? '-' : '';
                return;
            }
            let formatted = parseInt(val).toLocaleString();
            input.value = isNeg ? '-' + formatted : formatted;
        },

        buildGoalCardMarkup: function(goal, options = {}) {
            const percent = goal.targetAmount > 0 ? Math.round(((goal.currentAmount || 0) / goal.targetAmount) * 100) : 0;
            const clampedPercent = Math.min(100, Math.max(0, percent));
            const iconConfig = this.getIconConfig(goal.icon || 'savings');
            const isAtome = (goal.title || '').toUpperCase().includes('ATOME') || goal.isAtome;
            const maskedAmount = this.isPrivacyActive ? '****' : `₱${(goal.currentAmount || 0).toLocaleString()}`;
            const maskedTarget = this.isPrivacyActive ? '****' : `₱${(goal.targetAmount || 0).toLocaleString()}`;
            const maskedPercent = this.isPrivacyActive ? '****%' : `${percent}%`;
            const extraClass = options.preview ? ' goals-card-preview-shell' : '';

            return `
                <div class="goals-icon-box" style="background: ${iconConfig.bg}; color: ${iconConfig.color};">
                    ${iconConfig.customImage
                        ? `<img src="${iconConfig.customImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
                        : `<i class="material-icons">${iconConfig.icon}</i>`}
                </div>
                <div class="goals-card-center${extraClass}">
                    <div class="goals-card-title">
                        ${goal.title}
                        ${isAtome ? '<span class="goals-atome-shield-badge">Shield</span>' : ''}
                    </div>
                    <div class="goals-progress-bar-bg">
                        <div class="goals-progress-bar-fill" style="width: ${clampedPercent}%; background: ${iconConfig.color};"></div>
                    </div>
                </div>
                <div class="goals-card-right">
                    <div class="goals-card-amount">${maskedAmount}</div>
                    <div class="goals-card-percent">${maskedPercent} / ${maskedTarget}</div>
                </div>
            `;
        },

        // --- CONTEXT MENU ---
        openContextMenu: function(e, id) {
            // [INSTANT STACK: 2026-04-05 - Flush layout to drop z-index instantly - Antigravity]
            document.body.classList.add('context-menu-active');
            void document.body.offsetWidth; // Force synchronous layout commit

            selectedGoalId = id;
            const card = document.querySelector(`[data-id="${id}"]`);
            if (!card) return;

            document.querySelectorAll('.goals-card').forEach(c => c.classList.remove('popped'));
            card.classList.add('popped');

            const backdrop = document.getElementById(IDS.contextBackdrop);
            const overlay = document.getElementById(IDS.contextOverlay);
            const menu = document.getElementById(IDS.iosMenu);
            
            const goal = goals.find(g => g.id === id);
            const isExcluded = goal?.isExcluded === true;

            // [FIXED: 2026-04-05 - Added data-action for robust selection & fixed Exclude vs Delete collision - Antigravity]
            menu.innerHTML = `
                <div class="goals-ios-menu-item edit" data-action="edit">
                    <i class="material-icons">edit</i>
                    <span>Edit Goal</span>
                </div>
                <div class="goals-ios-menu-item toggle-state ${isExcluded ? 'active' : 'danger'}" data-action="toggle">
                    <i class="material-icons">${isExcluded ? 'check_circle_outline' : 'block'}</i>
                    <span>${isExcluded ? 'Include' : 'Exclude'}</span>
                </div>
                <!-- [NEW: 2026-04-05 - Antigravity] -->
                <div class="goals-ios-menu-item" data-action="withdraw" style="color: #ef4444;">
                    <i class="material-icons">remove_circle_outline</i>
                    <span>Withdraw</span>
                </div>
                <div class="goals-ios-menu-item danger" data-action="delete">
                    <i class="material-icons">delete</i>
                    <span>Delete</span>
                </div>
            `;

            // Attach listeners via data-action for precision (2026-04-05)
            const editBtn = menu.querySelector('[data-action="edit"]');
            const toggleBtn = menu.querySelector('[data-action="toggle"]');
            const withdrawBtn = menu.querySelector('[data-action="withdraw"]');
            const deleteBtn = menu.querySelector('[data-action="delete"]');

            if (editBtn) editBtn.onclick = () => this.openGoalEdit(id);
            if (toggleBtn) toggleBtn.onclick = () => this.toggleGoalInclusion(id);
            if (withdrawBtn) withdrawBtn.onclick = () => this.openWithdrawModal(id);
            if (deleteBtn) deleteBtn.onclick = () => this.handleDelete(id);

            // CLONING-BASED POPPING: Perfect clarity above backdrop (2026-04-03)
            const previewContainer = document.getElementById('goals-context-preview');
            const rect = card.getBoundingClientRect();
            
            if (previewContainer) {
                // MEASURE NATURALLY: Remove pressing/scaling before measurement to avoid "ears" offset (2026-04-03)
                const isPressing = card.classList.contains('pressing');
                card.classList.remove('pressing');
                const rect = card.getBoundingClientRect();
                if (isPressing) card.classList.add('pressing'); 

                const clone = card.cloneNode(true);
                clone.id = 'goals-popped-clone';
                clone.classList.remove('pressing'); 
                clone.classList.add('popped');
                
                // Position it exactly over the original
                previewContainer.innerHTML = '';
                // VIEWPORT-FIXED POSITIONING (Final Robust Fix 2026-04-03)
                clone.style.top = `${rect.top}px`;
                clone.style.left = `${rect.left}px`;
                clone.style.width = `${rect.width}px`;
                clone.style.height = `${rect.height}px`;
                
                // NO FLICKER START: Match exact visual scale at the moment of swap - 2026-04-03
                clone.style.transform = isPressing ? 'scale(0.98)' : 'scale(1)'; 
                
                previewContainer.appendChild(clone);
                previewContainer.style.display = 'block';
                
                // INSTANT SWAP: Eliminate delays and 'fade out' artifacts for perfect parity - 2026-04-03
                previewContainer.classList.add('show');
                card.classList.add('hide-completely'); 
            }

            backdrop.style.display = 'block';
            overlay.style.display = 'flex';

            if (window.NavState) {
                window.NavState.pushModalState('goals-context', () => this.closeContextMenu());
            }

            // Position context menu relative to the card [REFINED: 2026-04-05 - Moved Up - Antigravity]
            const menuWidth = 150;
            const menuHeight = 150;
            const spaceBelow = window.innerHeight - rect.bottom;

            let topPos = (spaceBelow >= menuHeight + 24) ? rect.bottom + 8 : rect.top - menuHeight - 32;
            let leftPos = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 24));

            menu.style.top = `${topPos}px`;
            menu.style.left = `${leftPos}px`;
            menu.style.width = `${menuWidth}px`;

            setTimeout(() => {
                backdrop.classList.add('show'); // PARITY: goals.html line 1522 - 2026-04-03
                overlay.classList.add('show');
                menu.classList.add('show');
            }, 10); // PARITY: 10ms delay from goals.html - 2026-04-03

            if (window.navigator.vibrate) window.navigator.vibrate(60);
        },

        toggleGoalInclusion: async function(id) {
            if (!currentUser || !db) return;
            this.closeContextMenu();
            const goal = goals.find(g => g.id === id);
            if (!goal) return;
            
            const newState = !(goal.isExcluded === true);
            try {
                await updateDoc(doc(db, `users/${currentUser.uid}/goals`, id), { isExcluded: newState });
                if (window.showToast) window.showToast(newState ? 'Goal excluded from total' : 'Goal included in total');
            } catch (e) {
                console.error("Error toggling goal exclusion:", e);
                if (window.showToast) window.showToast("Update failed");
            }
        },

        closeContextMenu: function() {
            // Restore visibility to all cards immediately
            document.querySelectorAll('.goals-card').forEach(c => {
                c.classList.remove('hide-instant');
                c.classList.remove('hide-completely'); // Ensure total visibility restored
                c.style.opacity = '';
                c.style.transition = '';
                c.classList.remove('popped');
            });

            // Remove preview clone (2026-04-03)
            const previewContainer = document.getElementById('goals-context-preview');
            if (previewContainer) {
                previewContainer.classList.remove('show');
                setTimeout(() => {
                    previewContainer.style.display = 'none';
                    previewContainer.innerHTML = '';
                    // Safety check
                    document.querySelectorAll('.goals-card').forEach(c => c.classList.remove('hide-instant'));
                }, 200);
            }

            const overlay = document.getElementById(IDS.contextOverlay);
            const backdrop = document.getElementById(IDS.contextBackdrop);
            const menu = document.getElementById(IDS.iosMenu);

            if (menu) menu.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
            if (backdrop) backdrop.classList.remove('show');

            window.setTimeout(() => {
                if (overlay) overlay.style.display = 'none'; // PARITY: goals.html line 1549 - 2026-04-03
                if (backdrop) backdrop.style.display = 'none';
                window.isLongPress = false; // BUG FIX: Reset long press state on close - 2026-04-03 [Antigravity]
            }, 300); // PARITY: 300ms delay from goals.html - 2026-04-03

            if (window.NavState) window.NavState.popModalState('goals-context');

            // [NEW: 2026-04-05 - Restore Navigation - Antigravity]
            document.body.classList.remove('nav-hidden');
            document.body.classList.remove('context-menu-active');
        },

        handleEdit: function() {
            this.closeContextMenu();
            if (window.EditGoalView) {
                window.EditGoalView.open(currentUser.uid, selectedGoalId);
            }
        },

        // Bridging Action Dropdown to EditGoalView (2026-04-03)
        openGoalEdit: function(id) {
            const finalId = id || selectedGoalId;
            if (window.showToast) window.showToast("🛠️ Initializing Edit...");

            if (!finalId) {
                if (window.showToast) window.showToast("⚠️ No goal selected");
                return;
            }
            
            // Robust UID extraction (2026-04-03)
            let currentUid = (currentUser ? currentUser.uid : (window.auth && window.auth.currentUser ? window.auth.currentUser.uid : null));
            if (!currentUid && window.auth) currentUid = window.auth.currentUser ? window.auth.currentUser.uid : null;

            if (!currentUid) {
                if (window.showToast) window.showToast("⚠️ User not ready");
                return;
            }

            console.log("🛠️ Opening Edit view for:", finalId);
            const overlay = document.getElementById('goals-edit-overlay');
            if (overlay) {
                this.closeContextMenu();
                if (window.EditGoalView) {
                    window.EditGoalView.open(currentUid, finalId);
                } else {
                    console.error("EditGoalView not found on window");
                }
            } else {
                console.error("goals-edit-overlay element NOT found in DOM");
            }
        },

        handleDelete: async function(id) {
            const finalId = id || selectedGoalId;
            if (!finalId) return;

            // [FIXED: 2026-04-05 - Replaced confirm() with premium showAppDialog - Antigravity]
            const confirmDelete = await new Promise(resolve => {
                if (window.showAppDialog) {
                    window.showAppDialog({
                        title: 'Delete Goal?',
                        message: 'Are you sure you want to delete this goal? This cannot be undone.',
                        confirm: true,
                        callback: (res) => resolve(res)
                    });
                } else {
                    resolve(confirm("Are you sure you want to delete this goal? This cannot be undone."));
                }
            });

            if (!confirmDelete) return;

            this.closeContextMenu();
            try {
                await deleteDoc(doc(db, `users/${currentUser.uid}/goals`, finalId));
                if (window.showToast) window.showToast("Goal deleted successfully");
            } catch (e) {
                console.error("Delete error:", e);
                if (window.showToast) window.showToast("Failed to delete goal");
            }
        },

        save: async function() {
            const titleInput = document.getElementById('goals-input-title');
            const targetInput = document.getElementById('goals-input-target');
            const title = titleInput.value;
            const target = parseFloat(targetInput.value.replace(/,/g, ''));

            if (!title || isNaN(target)) {
                // [FIXED: 2026-04-05 - Replaced alert with showAppDialog - Antigravity]
                if (window.showAppDialog) {
                    window.showAppDialog({ title: 'Missing Info', message: 'Please fill all fields to create a goal.' });
                } else {
                    alert("Please fill all fields");
                }
                return;
            }

            const btn = document.querySelector('#goals-add-modal .goals-modal-btn:not(.goals-ghost-btn)');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<i class="material-icons spin" style="font-size: 16px; margin-right: 8px;">refresh</i> CREATING GOAL...`;
            }

            try {
                const goalsRef = collection(db, `users/${currentUser.uid}/goals`);
                await addDoc(goalsRef, {
                    title,
                    targetAmount: target,
                    startAmount: 0,
                    currentAmount: 0,
                    icon: selectedIcon,
                    order: goals.length,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                titleInput.value = '';
                targetInput.value = '';
                this.closeModals();
                if (window.showToast) window.showToast("New goal created successfully!");
                this.loadGoals();
            } catch (e) {
                console.error("Error saving goal:", e);
                window.showToast("Error creating goal");
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = "Create Goal";
                }
            }
        }
    };

    // Auto-init with retry to handle module race condition (2026-04-05) [FIXED: 2026-04-05 - Check FirebaseModule - Antigravity]
    function tryInit() {
        if (window.FirebaseModule || (window.auth && window.db)) {
            GoalsView.init();
        } else {
            // Check again in 100ms if Firebase module isn't ready yet
            setTimeout(tryInit, 100);
        }
    }
    tryInit();

    window.loadGoals = () => {
        if (window.GoalsView && typeof window.GoalsView.refresh === 'function') {
            window.GoalsView.refresh();
        }
    };

})(window);
