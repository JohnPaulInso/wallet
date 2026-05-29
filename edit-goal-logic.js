/**
 * SmartWallet SPA - Edit Goal Analytics Logic (High Fidelity)
 * Final Stability Refactoring: Removed IIFE for absolute initialization certainty (2026-04-03)
 */

console.log("💎 edit-goal-logic.js: Script START.");

// Firebase references [GLOBAL SCOPE: 2026-04-03]
/* [MODIFIED: 2026-04-05 - Added writeBatch for atomic operations - Antigravity] */
let db, doc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, serverTimestamp, writeBatch;

let currentGoalId = null;
let currentUser = null;
let currentGoalData = null;
let lastTransactions = [];
let myChart = null;
let selectedIcon = 'savings';
let dynamicMonthlySavings = 5000;
let activeTxnId = null;
let txnPressTimer = null;
const PESO_SYMBOL = '\u20B1';
const GOAL_NOTIFICATION_MILESTONES = [50, 100];

function toFiniteAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
}

function getGoalMilestoneCycles(goal) {
    if (!goal || typeof goal !== 'object' || !goal.milestoneCycles || typeof goal.milestoneCycles !== 'object') {
        return {};
    }
    return goal.milestoneCycles;
}

function buildGoalMilestoneCycleUpdates(goal, nextAmount) {
    const safeGoal = goal || {};
    const targetAmount = Number(safeGoal.targetAmount || 0);
    if (!(targetAmount > 0)) return null;

    const previousAmount = Number(safeGoal.currentAmount || 0);
    const nextValue = Number(nextAmount || 0);
    const previousPct = (previousAmount / targetAmount) * 100;
    const nextPct = (nextValue / targetAmount) * 100;
    const currentCycles = getGoalMilestoneCycles(safeGoal);
    const updates = {};
    let changed = false;

    GOAL_NOTIFICATION_MILESTONES.forEach((milestone) => {
        if (previousPct < milestone && nextPct >= milestone) {
            updates[`milestoneCycles.${milestone}`] = Number(currentCycles?.[String(milestone)] || 0) + 1;
            changed = true;
        }
    });

    return changed ? updates : null;
}

async function notifyGoalMilestonesFromUpdates(goal, goalId, milestoneCycleUpdates = null) {
    if (!goal || !goalId || !milestoneCycleUpdates || typeof milestoneCycleUpdates !== 'object') return;

    const completedCycle = Number(milestoneCycleUpdates['milestoneCycles.100'] || 0);
    const halfwayCycle = Number(milestoneCycleUpdates['milestoneCycles.50'] || 0);
    const uid = currentUser?.uid;
    const engine = window.NotificationsEngine;

    const triggerGoalAlert = async (title, message, milestone, cycle) => {
        const cycleNumber = Number(cycle || 0);
        if (!(cycleNumber > 0)) return;
        const alertKey = `goal_${goalId}_${milestone}_cycle_${cycleNumber}`;
        const notificationMeta = {
            action: 'open_goal_edit',
            goalId,
            source: 'goals',
            milestone,
            cycle: cycleNumber,
            notificationKey: alertKey
        };

        if (uid && engine?.hasNotified && engine?.triggerNotification) {
            const alreadySent = await engine.hasNotified(uid, alertKey, notificationMeta);
            if (alreadySent) return;
            await engine.triggerNotification(uid, title, message, alertKey, notificationMeta);
            return;
        }

        const alreadySent = localStorage.getItem(alertKey);
        if (alreadySent) return;
        if (window.createNotification) window.createNotification(title, message, alertKey, null, notificationMeta);
        localStorage.setItem(alertKey, 'true');
    };

    if (completedCycle > 0) {
        await triggerGoalAlert(
            'Goal Completed! 🏆',
            `Congratulations! You've reached your ₱${toFiniteAmount(goal.targetAmount).toLocaleString()} goal for ${goal.title}.`,
            '100',
            completedCycle
        );
        return;
    }

    if (halfwayCycle > 0) {
        await triggerGoalAlert(
            'Halfway There!',
            `You're 50% through your goal for ${goal.title}. Keep it up!`,
            '50',
            halfwayCycle
        );
    }
}

function formatPeso(value) {
    return `${PESO_SYMBOL}${toFiniteAmount(value).toLocaleString()}`;
}

function formatGoalTimestamp(value) {
    const date = value?.toDate ? value.toDate() : (value instanceof Date ? value : (value ? new Date(value) : null));
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Pending';

    const datePart = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    const timePart = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).replace(' ', '');

    return `${datePart} ${timePart}`;
}

window.EditGoalView = {
    async open(uid, goalId) {
        try {
            // Extract from global window.FirebaseModule [FIXED: 2026-04-05 - Antigravity]
            const fm = window.FirebaseModule || {};
            db = fm.db || window.db; 
            doc = fm.doc || window.doc;
            getDoc = fm.getDoc || window.getDoc; 
            updateDoc = fm.updateDoc || window.updateDoc;
            deleteDoc = fm.deleteDoc || window.deleteDoc; 
            collection = fm.collection || window.collection;
            getDocs = fm.getDocs || window.getDocs; 
            query = fm.query || window.query;
            orderBy = fm.orderBy || window.orderBy; 
            serverTimestamp = fm.serverTimestamp || window.serverTimestamp;
            const increment = fm.increment || window.increment;
            writeBatch = fm.writeBatch || window.writeBatch; /* [ADDED: 2026-04-05 - Atomic batch writes - Antigravity] */

            console.log("🛠️ EditGoalView.open() initializing...", { uid, goalId });
            
            currentUser = { uid };
            currentGoalId = goalId;
            
            const overlay = document.getElementById('goals-edit-overlay');
            if (overlay) {
                if (window.showToast) window.showToast("🚀 Opening Analytics...");
                overlay.style.display = 'flex'; // Force visibility
                overlay.style.pointerEvents = 'auto';
                // zIndex is now managed in index.css (2500) to allow modals/context-menu on top - 2026-04-03
                window.requestAnimationFrame(() => overlay.classList.add('active'));
                overlay.scrollTop = 0;

                // [NEW: 2026-04-05 - Navigation Isolation (Deep View) - Antigravity]
                document.body.classList.add('edit-view-active');

                // Show skeleton initially - 2026-04-03 [Antigravity]
                const content = overlay.querySelector('.goals-edit-content');
                if (content) content.classList.add('loading');
            } else {
                console.error("🛠️ goals-edit-overlay NOT found!");
            }
            
            if (window.NavState) {
                try { window.NavState.pushModalState('goals-edit-overlay', () => this.close()); } catch(e) {}
            }

            // Show skeletons/loading state if needed
            const titlePreview = document.getElementById('goals-edit-preview-title');
            if (titlePreview) titlePreview.innerText = "Loading...";

            await this.loadAll();
        } catch (err) {
            console.error("Critical error in EditGoalView.open():", err);
        }
    },

    /* [NEW: 2026-04-05 - Expose currentGoalId for cross-module icon sync - Antigravity] */
    getCurrentGoalId() {
        return currentGoalId;
    },

    close(forceHide = false, afterClose = null) {
        const overlay = document.getElementById('goals-edit-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.style.pointerEvents = 'none';
            if (forceHide) {
                overlay.style.display = 'none';
                if (typeof afterClose === 'function') afterClose();
            } else {
                setTimeout(() => {
                    if (!overlay.classList.contains('active')) {
                        overlay.style.display = 'none';
                        if (typeof afterClose === 'function') afterClose();
                    }
                }, 420);
            }
            /* [MODIFIED: 2026-04-05 - Restore Navigation & cleanup body classes - Antigravity] */
            document.body.classList.remove('nav-hidden');
            document.body.classList.remove('edit-view-active');
        }
        if (window.NavState) window.NavState.popModalState('goals-edit-overlay');
        
        // Ensure all history items are visible (Safety cleanup - 2026-04-03)
        document.querySelectorAll('.goals-history-item').forEach(el => el.style.opacity = '1');
        
        // Cleanup any active context preview
        const previewContainer = document.getElementById('goals-context-preview');
        if (previewContainer) {
            previewContainer.classList.remove('show');
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
        }
    },

    async loadAll() {
        await this.loadSafeSpendConfig();
        await this.loadGoalData();
        await this.loadTransactionHistory();

        // Reveal content - 2026-04-03 [Antigravity]
        const overlay = document.getElementById('goals-edit-overlay');
        if (overlay) {
            const content = overlay.querySelector('.goals-edit-content');
            if (content) content.classList.remove('loading');
        }
    },

    async loadSafeSpendConfig() {
        try {
            const configRef = doc(db, "users", currentUser.uid, "config", "safe_to_spend");
            const configSnap = await getDoc(configRef);
            if (configSnap.exists()) {
                const data = configSnap.data();
                if (data.savingsAmount) {
                    dynamicMonthlySavings = parseFloat(data.savingsAmount);
                }
            }
        } catch (e) { console.error("Error loading config:", e); }
    },

    async loadGoalData() {
        try {
            const goalRef = doc(db, `users/${currentUser.uid}/goals`, currentGoalId);
            const goalSnap = await getDoc(goalRef);
            if (goalSnap.exists()) {
                currentGoalData = goalSnap.data();
                this.updateUI();
            }
        } catch (e) { console.error("Error loading goal:", e); }
    },

    async loadTransactionHistory() {
        try {
            const historyRef = collection(db, `users/${currentUser.uid}/goals/${currentGoalId}/transactions`);
            const q = query(historyRef, orderBy('timestamp', 'desc'));
            const snap = await getDocs(q);
            
            lastTransactions = snap.docs.map(d => {
                const data = d.data();
                const dateObj = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : new Date();
                return { id: d.id, ...data, amount: toFiniteAmount(data.amount), date: dateObj };
            }).filter(t => t.deleted !== true);

            await this.reconcileGoalAmountFromHistory();

            this.renderHistory();
            this.updateAnalytics();
        } catch (e) { console.error("Error loading history:", e); }
    },

    async reconcileGoalAmountFromHistory() {
        if (!currentGoalData || !currentUser?.uid || !currentGoalId) return;

        const baseAmount = toFiniteAmount(currentGoalData.startAmount);
        const historyAmount = lastTransactions.reduce((sum, t) => sum + toFiniteAmount(t.amount), 0);
        const computedAmount = baseAmount + historyAmount;
        const storedAmount = toFiniteAmount(currentGoalData.currentAmount);

        currentGoalData.currentAmount = computedAmount;
        this.updateUI();

        if (Math.abs(storedAmount - computedAmount) < 0.01) return;

        try {
            await updateDoc(doc(db, `users/${currentUser.uid}/goals`, currentGoalId), {
                currentAmount: computedAmount,
                updatedAt: serverTimestamp()
            });

            if (window.GoalsView && typeof window.GoalsView.loadGoals === 'function') {
                window.GoalsView.loadGoals();
            }
        } catch (err) {
            console.error("Error reconciling goal amount:", err);
        }
    },

    updateUI() {
        if (!currentGoalData) return;
        
        const isPrivacy = window.GoalsView && window.GoalsView.isPrivacyActive;
        
        const pageTitle = document.getElementById('goals-edit-page-title');
        if (pageTitle) pageTitle.innerText = `Edit ${currentGoalData.title}`;
        
        const previewTitle = document.getElementById('goals-edit-preview-title');
        if (previewTitle) previewTitle.innerText = currentGoalData.title;
        
        const currentAmount = toFiniteAmount(currentGoalData.currentAmount);
        const targetAmount = toFiniteAmount(currentGoalData.targetAmount);

        const previewAmount = document.getElementById('goals-edit-preview-amount');
        if (previewAmount) {
            previewAmount.innerText = isPrivacy ? '****' : `₱${(currentGoalData.currentAmount || 0).toLocaleString()}`;
        }
        
        const previewTarget = document.getElementById('goals-edit-preview-target');
        if (previewTarget) {
            previewTarget.innerText = isPrivacy ? '****' : `of ₱${(currentGoalData.targetAmount || 0).toLocaleString()} target`;
        }

        if (!isPrivacy) {
            const previewAmountEl = document.getElementById('goals-edit-preview-amount');
            const previewTargetEl = document.getElementById('goals-edit-preview-target');
            if (previewAmountEl) previewAmountEl.innerText = `â‚±${currentAmount.toLocaleString()}`;
            if (previewTargetEl) previewTargetEl.innerText = `of â‚±${targetAmount.toLocaleString()} target`;
        }

        if (!isPrivacy) {
            const previewAmountEl = document.getElementById('goals-edit-preview-amount');
            const previewTargetEl = document.getElementById('goals-edit-preview-target');
            if (previewAmountEl) previewAmountEl.innerText = formatPeso(currentAmount);
            if (previewTargetEl) previewTargetEl.innerText = `of ${formatPeso(targetAmount)} target`;
        }

        const percent = Math.min(100, Math.round((currentAmount / (targetAmount || 1)) * 100)) || 0;
        const progressBar = document.getElementById('goals-edit-progress-bar');
        if (progressBar) progressBar.style.width = `${percent}%`;
        
        const labelReached = document.getElementById('goals-edit-label-reached');
        if (labelReached) labelReached.innerText = isPrivacy ? '**' : `${percent}% Reached`;
        
        const labelRemaining = document.getElementById('goals-edit-label-remaining');
        if (labelRemaining) labelRemaining.innerText = isPrivacy ? '**' : `${Math.max(0, 100 - percent)}% Remaining`;

        const titleInput = document.getElementById('goals-edit-title-input');
        if (titleInput) titleInput.value = currentGoalData.title;
        
        const targetInput = document.getElementById('goals-edit-target-input');
        if (targetInput) targetInput.value = (currentGoalData.targetAmount || 0).toLocaleString();

        selectedIcon = currentGoalData.icon || 'savings';
        this.updateIconPreview();
        
        // Sync page title with header
        const headerTitle = document.getElementById('goals-edit-page-title');
        if (headerTitle) headerTitle.innerText = `Edit ${currentGoalData.title}`;
    },

    /* [MODIFIED: 2026-04-06 - Shows completed badge when goal is 100%, syncs currentGoalData.icon locally - Antigravity] */
    updateIconPreview(newIcon = null) {
        if (newIcon) {
            selectedIcon = newIcon;
            /* Sync local goal data so reopening icon picker shows the latest icon */
            if (currentGoalData) currentGoalData.icon = newIcon;
        }
        const config = window.GoalsView ? window.GoalsView.getIconConfig(selectedIcon) : { icon: 'savings', bg: '#f1f5f9', color: '#1e293b' };
        const iconBox = document.getElementById('goals-edit-preview-icon');
        if (iconBox) {
            iconBox.style.background = config.bg;
            iconBox.style.color = config.color;

            /* Build icon content */
            iconBox.innerHTML = config.customImage
                ? `<img src="${config.customImage}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`
                : `<i class="material-icons">${config.icon}</i>`;
        }

        /* [FIXED: 2026-04-06 - Badge on the wrapper (goals-edit-icon-wrap), not inside the icon box which clips - Antigravity] */
        const iconWrap = iconBox?.closest('.goals-edit-icon-wrap');
        if (iconWrap) {
            /* Remove any old badge */
            const oldBadge = iconWrap.querySelector('.goals-completed-badge');
            if (oldBadge) oldBadge.remove();

            const isCompleted = currentGoalData && currentGoalData.currentAmount >= currentGoalData.targetAmount;
            if (isCompleted) {
                iconWrap.style.position = 'relative';
                const badge = document.createElement('div');
                badge.className = 'goals-completed-badge';
                badge.style.cssText = 'position:absolute;bottom:20px;right:2px;width:28px;height:28px;background:#00851F;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;z-index:5;box-shadow:0 2px 6px rgba(0,0,0,0.15);';
                badge.innerHTML = '<i class="material-icons" style="font-size:16px;color:#fff;">check</i>';
                iconWrap.appendChild(badge);
            }
        }
    },

    changeIcon() {
        const modal = document.getElementById('goals-icon-picker-modal');
        if (!modal) return;

        /* [FIXED: 2026-04-06 - Read selectedIcon (already updated by grid click) instead of stale currentGoalData.icon - Antigravity] */
        if (window.GoalsView) {
            window.GoalsView.setSelectedIcon(selectedIcon || currentGoalData?.icon || 'savings');
            if (typeof window.GoalsView.setSelectedGoalId === 'function') {
                window.GoalsView.setSelectedGoalId(currentGoalId);
            }
        }

        modal.style.display = 'flex';
        setTimeout(() => { modal.classList.add('show'); }, 10);
        
        // Defer grid rendering slightly to ensure the modal animation starts instantly
        setTimeout(() => {
            const preview = document.getElementById('goals-edit-custom-image-preview');
            const input = document.getElementById('goals-edit-custom-image-input');
            
            /* Use selectedIcon which is always current, not stale currentGoalData.icon */
            const currentIcon = selectedIcon || currentGoalData?.icon || 'savings';
            const isBase64 = String(currentIcon).startsWith('data:');
            const isURL = String(currentIcon).startsWith('http');

            if (preview && (isBase64 || isURL)) {
                preview.src = currentIcon;
                preview.style.display = 'block';
            } else if (preview) {
                preview.style.display = 'none';
            }
            if (input) input.value = '';
            
            if (window.GoalsView && typeof window.GoalsView.renderIconGrid === 'function') {
                window.GoalsView.renderIconGrid('goals-edit-icon-grid');
            }
        }, 10);

        if (window.NavState) window.NavState.pushModalState('goals-icon-picker-modal', () => {
            const m = document.getElementById('goals-icon-picker-modal');
            if (m) {
                m.classList.remove('show');
                setTimeout(() => m.style.display = 'none', 300);
            }
        });
    },

    updateAnalytics() {
        if (!currentGoalData) return;
        
        // Calculate Velocity [HIGH-FIDELITY]
        const now = new Date();
        const last30Days = lastTransactions.filter(t => (now - t.date) < (30 * 24 * 60 * 60 * 1000));
        const monthlySavingValue = last30Days.reduce((sum, t) => sum + toFiniteAmount(t.amount), 0);
        const currentAmount = toFiniteAmount(currentGoalData.currentAmount);
        const targetAmount = toFiniteAmount(currentGoalData.targetAmount);
        
        const paceEl = document.getElementById('goals-edit-v-pace');
        if (paceEl) paceEl.innerText = `₱${monthlySavingValue.toLocaleString()}`;
        
        const paceSubEl = document.getElementById('goals-edit-v-pace-sub');
        if (paceSubEl) {
            const percent = Math.min(100, Math.round((currentAmount / (targetAmount || 1)) * 100)) || 0;
            
            if (percent >= 100) {
                // [REFINED: 2026-04-05 - Show success badge for finished goals - Antigravity]
                paceSubEl.innerText = "Goal Achieved";
                paceSubEl.style.color = '#019600'; // Final Brand Green
            } else {
                const diff = (monthlySavingValue - dynamicMonthlySavings);
                if (diff >= 0) {
                    paceSubEl.innerText = `+₱${diff.toLocaleString()} above target`;
                    paceSubEl.style.color = '#019600';
                } else {
                    paceSubEl.innerText = `₱${Math.abs(diff).toLocaleString()} below target`;
                    paceSubEl.style.color = '#ef4444';
                }
            }
        }

        const timeEl = document.getElementById('goals-edit-v-time');
        const timeSubEl = document.getElementById('goals-edit-v-time-sub');
        const remaining = targetAmount - currentAmount;

        if (remaining <= 0) {
            if (timeEl) timeEl.innerText = "DONE!";
            if (timeSubEl) timeSubEl.innerText = "Goal Achieved";
        } else if (monthlySavingValue <= 0) {
            if (timeEl) timeEl.innerText = "---";
            if (timeSubEl) timeSubEl.innerText = "Increase saving pace";
        } else {
            const monthsLeft = Math.ceil(remaining / monthlySavingValue);
            if (timeEl) timeEl.innerText = monthsLeft > 12 ? `${Math.round(monthsLeft/12*10)/10} Years` : `${monthsLeft} Months`;
            
            const targetDate = new Date();
            targetDate.setMonth(targetDate.getMonth() + monthsLeft);
            if (timeSubEl) timeSubEl.innerText = `by ${targetDate.toLocaleString('default', { month: 'short', year: 'numeric' })}`;
        }

        this.renderMilestones(lastTransactions, currentAmount, targetAmount);
        this.renderChart();
    },

    /* [FIXED: 2026-04-06 - Milestones must show the actual date reached, never 'Pending...' when isDone - Antigravity] */
    renderMilestones(txns, currentAmount, targetAmount) {
        const list = document.getElementById('goals-edit-milestone-timeline');
        if (!list) return;

        const sortedTxns = [...txns].sort((a,b) => a.date - b.date);

        /* Find the date when cumulative deposits first crossed a threshold */
        function getDateForAmount(tx, threshold) {
            let total = currentGoalData.startAmount || 0;
            const creationDate = currentGoalData.createdAt?.toDate?.() || new Date();
            
            /* If startAmount already met the threshold, milestone was reached at creation */
            if (total >= threshold) return creationDate;
            
            for (const t of tx) {
                total += toFiniteAmount(t.amount);
                if (total >= threshold) return t.date;
            }
            return null; /* Not reached via transaction history */
        }

        /* Fallback date: last transaction date or today */
        const fallbackDate = sortedTxns.length > 0 
            ? sortedTxns[sortedTxns.length - 1].date 
            : new Date();

        const milestones = [
            { name: "Goal Started", threshold: 1, date: currentGoalData.createdAt?.toDate?.() || new Date() },
            { name: "10% Milestone", threshold: targetAmount * 0.1, date: getDateForAmount(sortedTxns, targetAmount * 0.1) },
            { name: "50% Halfway Mark", threshold: targetAmount * 0.5, date: getDateForAmount(sortedTxns, targetAmount * 0.5) },
            { name: "90% Almost There", threshold: targetAmount * 0.9, date: getDateForAmount(sortedTxns, targetAmount * 0.9) },
            { name: "Goal Fully Achieved", threshold: targetAmount, date: getDateForAmount(sortedTxns, targetAmount) }
        ].filter(m => m.threshold <= targetAmount);

        list.innerHTML = milestones.map(m => {
            const isDone = currentAmount >= m.threshold;

            /* [KEY FIX: 2026-04-06] If milestone IS reached but date is null, use fallback date instead of 'Pending...' */
            let dateStr;
            if (isDone) {
                const resolvedDate = m.date || fallbackDate;
                dateStr = resolvedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } else {
                dateStr = 'Pending...';
            }

            return `
                <div class="t-item ${isDone ? 'completed' : ''}">
                    <div class="t-check"><i class="material-icons">check</i></div>
                    <div class="t-content">
                        <div class="t-name">${m.name}</div>
                        <div class="t-date">${dateStr}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderChart() {
        const canvas = document.getElementById('goals-monthly-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const now = new Date();
        const labels = [], actualData = [], targetData = [];
        const targetPace = dynamicMonthlySavings || 5000;

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short' }).toUpperCase());
            const monthTotal = lastTransactions
                .filter(t => t.date.getMonth() === d.getMonth() && t.date.getFullYear() === d.getFullYear() && toFiniteAmount(t.amount) > 0)
                .reduce((sum, t) => sum + toFiniteAmount(t.amount), 0);
            actualData.push(monthTotal);
            targetData.push(targetPace);
        }

        if (myChart) myChart.destroy();
        if (window.Chart) {
            myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: 'ACTUAL', data: actualData, backgroundColor: '#00851F', borderRadius: 4, barThickness: 12 },
                        { label: 'TARGET', data: targetData, backgroundColor: 'rgba(226, 232, 240, 0.8)', borderRadius: 4, barThickness: 12 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { 
                        y: { display: false, beginAtZero: true },
                        x: { grid: { display: false }, ticks: { font: { size: 9, weight: '800' }, color: '#94a3b8' } }
                    }
                }
            });
        }
    },

    renderHistory() {
        const container = document.getElementById('goals-edit-history-list');
        if (!container) return;
        
        const isPrivacy = window.GoalsView && window.GoalsView.isPrivacyActive;

        // [REFINED: 2026-04-05 - Always show Goal Created as the starting point - Antigravity]
        let entriesHtml = lastTransactions.map(t => {
            const isNeg = (t.amount || 0) < 0;
            const displayAmt = isPrivacy ? '****' : formatPeso(Math.abs(toFiniteAmount(t.amount)));
            const tDate = formatGoalTimestamp(t.date);
            return `
                <div class="goals-history-item" 
                     data-txn-id="${t.id}"
                     onmousedown="EditGoalView.startTxnPress(event, '${t.id}')"
                     ontouchstart="EditGoalView.startTxnPress(event, '${t.id}')"
                     onmouseup="EditGoalView.cancelTxnPress()"
                     ontouchend="EditGoalView.cancelTxnPress()"
                     onmouseleave="EditGoalView.cancelTxnPress()">
                    <div class="goals-icon-box" style="background: ${isNeg ? '#fee2e2' : '#f0fdf4'}; color: ${isNeg ? '#ef4444' : '#019600'};">
                        <i class="material-icons">${isNeg ? 'remove' : 'add'}</i>
                    </div>
                    <div class="goals-history-info">
                        <div class="goals-card-title">${isNeg ? 'Withdrawal' : 'Deposit'}</div>
                        <div class="goals-history-date">${tDate}</div>
                    </div>
                    <div class="goals-card-amount" style="color: ${isNeg ? '#ef4444' : '#019600'}; font-weight: 900;">${isNeg ? '-' : '+'}${displayAmt}</div>
                </div>
            `;
        }).join('');

        // Prepend "Goal Created" as the very first event (at the bottom of the list)
        if (currentGoalData) {
            const startAmtRaw = (currentGoalData.startAmount || 0);
            const startAmt = isPrivacy ? '****' : formatPeso(startAmtRaw);
            const startDate = currentGoalData.createdAt?.toDate?.() || new Date();
            
            // [REFINED: 2026-04-05 - Hide +₱0 for clean look - Antigravity]
            const showAmt = startAmtRaw > 0;

            const creationHtml = `
                <div class="goals-history-item" style="opacity: 0.85; border-top: 1px dashed #e2e8f0; margin-top: 8px; padding-top: 12px;">
                    <div class="goals-icon-box" style="background: #f0fdf4; color: #019600;">
                        <i class="material-icons">flag</i>
                    </div>
                    <div class="goals-history-info">
                        <div class="goals-card-title">Goal Created</div>
                        <div class="goals-history-date">${formatGoalTimestamp(startDate)}</div>
                    </div>
                    ${showAmt ? `<div class="goals-card-amount">+${startAmt}</div>` : ''}
                </div>
            `;
            entriesHtml += creationHtml;
        }

        if (!entriesHtml) {
            container.innerHTML = `<div style="text-align:center; padding:50px; color:#94a3b8; font-weight:800; font-size:12.5px; letter-spacing:0.3px;">NO HISTORY FOUND</div>`;
        } else {
            container.innerHTML = entriesHtml;
        }
    },

    startTxnPress(e, id) {
        const item = e.currentTarget;
        item.classList.add('pressing');
        
        txnPressTimer = setTimeout(() => {
            const previewContainer = document.getElementById('goals-context-preview');
            if (previewContainer) {
                // MEASURE NATURALLY: Match stable measurement from goals-logic.js - 2026-04-03
                const isPressing = item.classList.contains('pressing');
                item.classList.remove('pressing');
                const rect = item.getBoundingClientRect();
                if (isPressing) item.classList.add('pressing');

                const clone = item.cloneNode(true);
                clone.id = 'goals-popped-txn-clone';
                clone.classList.remove('pressing');
                clone.classList.add('popped');
                
                previewContainer.innerHTML = '';
                clone.style.top = `${rect.top}px`;
                clone.style.left = `${rect.left}px`;
                clone.style.width = `${rect.width}px`;
                clone.style.height = `${rect.height}px`;
                
                // NO FLICKER START: Match exact visual scale at the moment of swap - 2026-04-03
                clone.style.transform = isPressing ? 'scale(0.98)' : 'scale(1)'; 
                
                previewContainer.appendChild(clone);
                
                // [FIXED: 2026-04-05 - Activate parent containers for visibility - Antigravity]
                const overlay = document.getElementById('goals-context-overlay');
                const backdrop = document.getElementById('goals-context-backdrop');
                if (overlay) overlay.style.display = 'block';
                if (backdrop) {
                    backdrop.style.display = 'block';
                    setTimeout(() => { backdrop.classList.add('show'); }, 10);
                }

                previewContainer.style.display = 'block';
                previewContainer.classList.add('show');
                item.classList.add('hide-completely'); 
            }

            if (window.navigator.vibrate) window.navigator.vibrate(60);
            this.openTxnOptions(id);
        }, 600);
    },

    cancelTxnPress() {
        clearTimeout(txnPressTimer);
        document.querySelectorAll('.goals-history-item').forEach(el => {
            el.classList.remove('pressing');
            el.classList.remove('popped');
            el.classList.remove('hide-instant');
            el.classList.remove('hide-completely'); // [FIX: Restoration - 2026-04-03]
            el.style.opacity = '';
            el.style.transition = '';
        });
        
        const previewContainer = document.getElementById('goals-context-preview');
        const overlay = document.getElementById('goals-context-overlay');
        const backdrop = document.getElementById('goals-context-backdrop');

        if (previewContainer && previewContainer.style.display !== 'none') {
             previewContainer.classList.remove('show');
             if (backdrop) backdrop.classList.remove('show');
             
             setTimeout(() => {
                 previewContainer.style.display = 'none';
                 if (overlay) overlay.style.display = 'none';
                 if (backdrop) backdrop.style.display = 'none';
                 previewContainer.innerHTML = '';
                 document.querySelectorAll('.goals-history-item').forEach(el => {
                     el.classList.remove('hide-instant');
                     el.classList.remove('hide-completely'); 
                 });
             }, 200);
        }
    },

    openDepositModal() {
        if (window.GoalsView && currentGoalId) {
            window.GoalsView.openDepositModal(currentGoalId);
        }
    },

    openTxnOptions(id) {
        activeTxnId = id;
        const modal = document.getElementById('goals-txn-options-modal');
        if (modal) {
            /* [NEW: 2026-04-06 - Push navbars behind modal - Antigravity] */
            document.body.classList.add('goals-modal-active');
            modal.style.display = 'flex';
            // [HARDENED: 2026-04-05 - Use setTimeout for reliable transition trigger - Antigravity]
            setTimeout(() => { modal.classList.add('show'); }, 10);
            
            if (!modal.dataset.clickBound) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) this.closeModals();
                });
                modal.dataset.clickBound = "true";
            }

            if (window.NavState) window.NavState.pushModalState('goals-txn-options-modal', () => {
                const m = document.getElementById('goals-txn-options-modal');
                if (m) {
                    m.classList.remove('show');
                    setTimeout(() => {
                        if (!m.classList.contains('show')) m.style.display = 'none';
                    }, 350);
                }
                // [FIX: 2026-04-03] Ensure item visibility is restored when modal closes via back button or swipe
                this.cancelTxnPress();
            });
        }
    },

    openTxnEdit() {
        const optionsModal = document.getElementById('goals-txn-options-modal');
        if (optionsModal) {
            optionsModal.classList.remove('show');
            setTimeout(() => {
                if (!optionsModal.classList.contains('show')) optionsModal.style.display = 'none';
            }, 350);
            if (window.NavState) window.NavState.popModalState('goals-txn-options-modal');
        }

        const txn = lastTransactions.find(t => t.id === activeTxnId);
        if (!txn) return;

        const input = document.getElementById('goals-txn-edit-input');
        if (input) input.value = (txn.amount || 0).toLocaleString();

        const modal = document.getElementById('goals-txn-edit-modal');
        if (modal) {
            /* [NEW: 2026-04-06 - Push navbars behind modal - Antigravity] */
            document.body.classList.add('goals-modal-active');
            modal.style.display = 'flex';
            // [HARDENED: 2026-04-05 - Use setTimeout for reliable transition trigger - Antigravity]
            setTimeout(() => { modal.classList.add('show'); }, 10);

            if (!modal.dataset.clickBound) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) this.closeModals();
                });
                modal.dataset.clickBound = "true";
            }

            if (window.NavState) window.NavState.pushModalState('goals-txn-edit-modal', () => {
                const m = document.getElementById('goals-txn-edit-modal');
                if (m) {
                    m.classList.remove('show');
                    setTimeout(() => {
                        if (!m.classList.contains('show')) m.style.display = 'none';
                    }, 350);
                }
            });
        }
    },

    /* [REWRITTEN: 2026-04-06 - Atomic writeBatch edit with loading state and success toast - Antigravity] */
    async saveTxnEdit() {
        const input = document.getElementById('goals-txn-edit-input');
        const newAmount = parseFloat(input.value.replace(/,/g, ''));
        if (isNaN(newAmount)) return window.showToast('Invalid amount');

        const txn = lastTransactions.find(t => t.id === activeTxnId);
        if (!txn) return window.showToast('Transaction not found');
        const diff = newAmount - (txn.amount || 0);
        const nextGoalAmount = Math.max(0, toFiniteAmount(currentGoalData?.currentAmount) + diff);
        const milestoneCycleUpdates = buildGoalMilestoneCycleUpdates(currentGoalData, nextGoalAmount);

        /* Loading state on save button */
        const btn = document.querySelector('#goals-txn-edit-modal .goals-modal-btn.goals-primary-btn');
        const originalText = btn ? btn.innerText : 'Save Changes';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="material-icons spin" style="font-size:16px;margin-right:8px">refresh</i> SAVING...';
        }

        try {
            const fm = window.FirebaseModule || {};
            const incrementFn = fm.increment || window.increment;

            const txnRef = doc(db, `users/${currentUser.uid}/goals/${currentGoalId}/transactions/${activeTxnId}`);
            const goalRef = doc(db, `users/${currentUser.uid}/goals`, currentGoalId);

            /* Atomic batch: update txn amount + adjust goal balance in one round-trip */
            const batch = writeBatch(db);
            batch.update(txnRef, {
                amount: newAmount,
                updatedAt: serverTimestamp()
            });
            batch.update(goalRef, {
                currentAmount: incrementFn(diff),
                updatedAt: serverTimestamp(),
                ...(milestoneCycleUpdates || {})
            });

            this.closeModals();
            await batch.commit();

            currentGoalData.currentAmount = nextGoalAmount;
            if (milestoneCycleUpdates) {
                if (!currentGoalData.milestoneCycles || typeof currentGoalData.milestoneCycles !== 'object') {
                    currentGoalData.milestoneCycles = {};
                }
                Object.entries(milestoneCycleUpdates).forEach(([path, value]) => {
                    const match = String(path || '').match(/^milestoneCycles\.(.+)$/);
                    if (!match) return;
                    currentGoalData.milestoneCycles[match[1]] = Number(value || 0);
                });
            }
            await notifyGoalMilestonesFromUpdates(currentGoalData, currentGoalId, milestoneCycleUpdates);

            if (window.showToast) window.showToast('Transaction updated!');
            await this.loadAll();
        } catch (e) {
            console.error('saveTxnEdit error:', e);
            if (window.showToast) window.showToast('Error updating record');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
        }
    },

    openTxnDelete() {
        const optionsModal = document.getElementById('goals-txn-options-modal');
        if (optionsModal) optionsModal.style.display = 'none';
        if (window.NavState) window.NavState.popModalState('goals-txn-options-modal');

        const modal = document.getElementById('goals-txn-delete-modal');
        if (modal) {
            this.resetDeleteModalState();
            /* [NEW: 2026-04-06 - Push navbars behind modal - Antigravity] */
            document.body.classList.add('goals-modal-active');
            modal.style.display = 'flex';
            // [HARDENED: 2026-04-05 - Use setTimeout for reliable transition trigger - Antigravity]
            setTimeout(() => { modal.classList.add('show'); }, 10);
            
            if (window.NavState) window.NavState.pushModalState('goals-txn-delete-modal', () => {
                const m = document.getElementById('goals-txn-delete-modal');
                if (m) {
                    m.classList.remove('show');
                    setTimeout(() => { if (!m.classList.contains('show')) m.style.display = 'none'; }, 350);
                }
            });
        }
    },

    /* [REWRITTEN: 2026-04-05 - Atomic writeBatch deletion with loading state and success toast - Antigravity] */
    async executeTxnDelete(e) {
        const btn = document.querySelector('#goals-txn-delete-modal .goals-modal-btn:not(.goals-ghost-btn)');
        const originalText = btn ? btn.innerText : 'Confirm Delete';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="material-icons spin" style="font-size:16px;margin-right:8px">refresh</i> DELETING...';
        }

        const txn = lastTransactions.find(t => t.id === activeTxnId);
        if (!txn) {
            if (window.showToast) window.showToast('Transaction not found');
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
            return;
        }
        const amtToSubtract = txn.amount || 0;

        try {
            const fm = window.FirebaseModule || {};
            const incrementFn = fm.increment || window.increment;
            const txnRef = doc(db, `users/${currentUser.uid}/goals/${currentGoalId}/transactions/${activeTxnId}`);
            const goalRef = doc(db, `users/${currentUser.uid}/goals`, currentGoalId);

            /* Atomic batch: delete txn + update balance in one round-trip */
            const batch = writeBatch(db);
            batch.delete(txnRef);
            batch.update(goalRef, {
                currentAmount: incrementFn(-amtToSubtract),
                updatedAt: serverTimestamp()
            });

            /* Close modal immediately for snappy UX */
            this.closeModals();

            await batch.commit();

            if (window.showToast) window.showToast('Transaction removed successfully!');
            await this.loadAll();
        } catch (err) {
            console.error('Transaction delete error:', err);
            if (window.showToast) window.showToast('Error deleting record');
        } finally {
            this.resetDeleteModalState(originalText);
        }
    },

    resetDeleteModalState(label = 'Confirm Delete') {
        const btn = document.querySelector('#goals-txn-delete-modal .goals-modal-btn:not(.goals-ghost-btn)');
        if (!btn) return;
        btn.disabled = false;
        btn.innerText = label;
    },

    /* [MODIFIED: 2026-04-05 - Added goals-delete-modal to the close list - Antigravity] */
    closeModals() {
        const ids = ['goals-txn-options-modal', 'goals-txn-edit-modal', 'goals-txn-delete-modal', 'goals-delete-modal'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('show');
                /* Allow CSS transition before hiding */
                setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 350);
            }
            if (window.NavState) window.NavState.popModalState(id);
        });
        /* Global cleanup for interaction state */
        this.resetDeleteModalState();
        this.cancelTxnPress();
        /* [NEW: 2026-04-06 - Remove modal nav isolation class - Antigravity] */
        document.body.classList.remove('goals-modal-active');
    },

    /* [FIXED: 2026-04-06 - saveChanges always re-enables button via finally block - Antigravity] */
    async saveChanges() {
        const btn = document.querySelector('#goals-edit-overlay .goals-save-btn') || document.querySelector('#goals-edit-overlay .accounts-save-btn');
        const originalText = btn ? btn.innerText : 'Save Changes';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="material-icons spin" style="font-size: 16px; margin-right: 8px;">refresh</i> SAVING...`;
        }

        const titleField = document.getElementById('goals-edit-title-input');
        const targetField = document.getElementById('goals-edit-target-input');
        const titleInput = (titleField?.value || '').trim();
        const targetInput = (targetField?.value || '').replace(/,/g, '');
        const target = parseFloat(targetInput);

        if (!titleInput || isNaN(target)) {
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
            return window.showToast("Please fill all fields");
        }

        try {
            const fm = window.FirebaseModule || {};
            const activeDb = db || fm.db || window.db;
            const activeDoc = doc || fm.doc || window.doc;
            const activeUpdateDoc = updateDoc || fm.updateDoc || window.updateDoc;
            const activeServerTimestamp = serverTimestamp || fm.serverTimestamp || window.serverTimestamp;
            const activeUid = currentUser?.uid || window.auth?.currentUser?.uid || null;

            if (!activeDb || !activeDoc || !activeUpdateDoc || !activeServerTimestamp || !activeUid || !currentGoalId) {
                throw new Error('EditGoalView.saveChanges missing Firestore dependencies or goal context');
            }

            await activeUpdateDoc(activeDoc(activeDb, `users/${activeUid}/goals`, currentGoalId), {
                title: titleInput, 
                targetAmount: target, 
                icon: selectedIcon,
                updatedAt: activeServerTimestamp()
            });

            if (currentGoalData) {
                currentGoalData.title = titleInput;
                currentGoalData.targetAmount = target;
                currentGoalData.icon = selectedIcon;
            }

            this.close(false, () => {
                if (typeof window.scrollToView === 'function') {
                    window.scrollToView(3);
                }
            });

            window.showToast("Goal updated successfully!");
            if (window.GoalsView && typeof window.GoalsView.loadGoals === 'function') {
                setTimeout(() => {
                    try { window.GoalsView.loadGoals(); } catch (refreshErr) { console.warn('Goals refresh after save failed:', refreshErr); }
                }, 0);
            }
        } catch (e) {
            console.error(e);
            window.showToast("Error updating goal");
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
        }
    },

    handleCustomImage(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            const preview = document.getElementById('goals-edit-custom-image-preview');
            if (preview) {
                preview.src = base64;
                preview.style.display = 'block';
            }
            
            // [NEW: 2026-04-05 - Save custom image instantly - Antigravity]
            selectedIcon = base64;
            this.updateIconPreview();
            
            if (window.GoalsView && typeof window.GoalsView.saveQuickIcon === 'function') {
                await window.GoalsView.saveQuickIcon(currentGoalId, base64);
            }
        };
        reader.readAsDataURL(file);
    },

    /* [FIXED: 2026-04-06 - Opens delete confirmation modal with proper transition - Antigravity] */
    confirmDelete() {
        const modal = document.getElementById('goals-delete-modal');
        if (!modal) return;

        /* [NEW: 2026-04-06 - Push navbars behind modal - Antigravity] */
        document.body.classList.add('goals-modal-active');
        
        /* Show modal with CSS animation */
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        /* Re-enable button in case it was disabled from a prior failed attempt */
        const btn = modal.querySelector('.accounts-save-btn');
        if (btn) { btn.disabled = false; btn.innerText = 'DELETE PERMANENTLY'; }

        if (window.NavState) window.NavState.pushModalState('goals-delete-modal', () => {
            const m = document.getElementById('goals-delete-modal');
            if (m) {
                m.classList.remove('show');
                setTimeout(() => { m.style.display = 'none'; }, 350);
            }
        });
    },

    /* [REWRITTEN: 2026-04-05 - Delete Permanently with instant feedback, loader, toast - Antigravity] */
    async executeDeletion() {
        /* Target the first accounts-save-btn inside the modal (the DELETE PERMANENTLY button) */
        const btn = document.querySelector('#goals-delete-modal .accounts-save-btn');
        const originalText = btn ? btn.innerText : 'DELETE PERMANENTLY';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="material-icons spin" style="font-size:16px;margin-right:8px">refresh</i> DELETING GOAL...';
        }

        try {
            const goalRef = doc(db, `users/${currentUser.uid}/goals`, currentGoalId);
            await deleteDoc(goalRef);

            if (window.showToast) window.showToast('Goal deleted permanently!');

            /* Close the delete-confirmation modal immediately */
            const modal = document.getElementById('goals-delete-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => { modal.style.display = 'none'; }, 350);
            }
            if (window.NavState) window.NavState.popModalState('goals-delete-modal');

            /* Close the edit overlay after a brief moment so user sees the toast */
            setTimeout(() => {
                this.close();
            }, 600);
        } catch (e) {
            console.error('Delete goal error:', e);
            if (window.showToast) window.showToast('Error deleting goal');
            if (btn) {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        }
    }
};

console.log("💎 edit-goal-logic.js: Script END.");

