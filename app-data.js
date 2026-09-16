/**
 * Data management and synchronization for the Wallet App
 */
import { db, auth, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, getDocs, onSnapshot, query, orderBy, updateDoc, writeBatch } from "./firebase-config.js";
import { log, showToast, getMerchantDisplay, formatLocalDate, stripTags, triggerHaptic } from "./app-utils.js";

// Global data state
// Modified 2026-03-27: Initialize to null instead of [] to prevent hasLiveData truthy flickering
window.allTxns = null; 
window.hasBudgetLiveData = false; // Modified 2026-03-27: Prevent cache from triggering bar build-up
window.isSyncing = false;
window.unsubscribeSnapshot = null;
// (2026-07-13) Preserve safeToSpendConfig on import; prev: wiped to defaults
window.safeToSpendConfig = window.safeToSpendConfig || (typeof window.restoreSafeSpendConfigFromCache === 'function' ? window.restoreSafeSpendConfigFromCache() : null) || {
    savingsAmount: 3000,
    obligations: [],
    receipts: []
};

// (2026-07-13) Add maribank collection name; prev: atome and bpi only
export function getCollectionName(accId) {
    if (accId === 'atome') return 'transactions';
    if (accId === 'bpi') return 'bpi_transactions';
    if (accId === 'maribank') return 'maribank_transactions';
    if (accId === 'default_wallet') return 'transactions_default';
    return `txns_${accId}`;
}

function getCachedBalanceForAccount(accId) {
    try {
        const balances = JSON.parse(localStorage.getItem('wallet_cached_balances') || '{}');
        return typeof balances[accId] === 'number' ? balances[accId] : null;
    } catch (e) {
        return null;
    }
}

function getPreferredDashboardFilterValue() {
    const preferred = window.getStoredDashboardMonthSelection?.() || 'this_month';
    return typeof preferred === 'string' && preferred.trim() ? preferred : 'this_month';
}

function applyPreferredDashboardFilter() {
    const filterEl = document.getElementById('chart-filter');
    if (!filterEl) return;
    const preferred = getPreferredDashboardFilterValue();
    if (/^\d{4}-\d{2}$/.test(preferred) && !filterEl.querySelector(`option[value="${preferred}"]`)) {
        const context = window.getDashboardMonthContext?.(preferred);
        const option = document.createElement('option');
        option.value = preferred;
        option.textContent = context?.labelTitle || preferred;
        const insertBeforeEl = filterEl.querySelector('option[value="last_6_months"]') || null;
        filterEl.insertBefore(option, insertBeforeEl);
    }
    filterEl.value = filterEl.querySelector(`option[value="${preferred}"]`) ? preferred : 'this_month';
    if (window.filterChart) window.filterChart();
    try { if (window.updateInsightCards) window.updateInsightCards(window.allTxns || []); } catch (error) { console.warn('updateInsightCards rehydrate failed:', error); }
    // (2026-07-13) Rehydrate triple budget progress bar on dashboard filter apply; prev: missing
    try { if (window.updateTripleProgressBar) window.updateTripleProgressBar(); } catch (error) { console.warn('updateTripleProgressBar rehydrate failed:', error); }
    try { if (window.refreshTrendChart) window.refreshTrendChart(); } catch (error) { console.warn('refreshTrendChart rehydrate failed:', error); }
    try { if (window.drawCashFlowChart) window.drawCashFlowChart(); } catch (error) { console.warn('drawCashFlowChart rehydrate failed:', error); }
    try { if (window.detectSubscriptions) window.detectSubscriptions(); } catch (error) { console.warn('detectSubscriptions rehydrate failed:', error); }
    try { if (window.updateCategoryBudgetsUI) window.updateCategoryBudgetsUI(); } catch (error) { console.warn('updateCategoryBudgetsUI rehydrate failed:', error); }
}

// Load Data with Real-time Listeners
window.unsubscribeSnapshot = null;
window.isDataLoading = false; 
function normalizeLoadRequest(providedUidOrOptions = null, maybeOptions = null) {
    let providedUid = null;
    let options = {};

    if (typeof providedUidOrOptions === 'string') {
        providedUid = providedUidOrOptions;
    } else if (providedUidOrOptions && typeof providedUidOrOptions === 'object' && !Array.isArray(providedUidOrOptions)) {
        options = { ...providedUidOrOptions };
    }

    if (maybeOptions && typeof maybeOptions === 'object' && !Array.isArray(maybeOptions)) {
        options = { ...options, ...maybeOptions };
    }

    if (!providedUid && typeof options.uid === 'string') {
        providedUid = options.uid;
    }

    return { providedUid, options };
}

export async function loadData(providedUidOrOptions = null, maybeOptions = null) {
    const { providedUid, options } = normalizeLoadRequest(providedUidOrOptions, maybeOptions);
    const uid = providedUid || auth.currentUser?.uid;
    if (!uid) return;
    const preserveBudgetWidget = Boolean(options.preserveBudgetWidget);
    const preserveViewState = Boolean(options.preserveViewState);
    const reason = typeof options.reason === 'string' ? options.reason : '';
    const fastAccountSwitch = reason === 'account_switch' || reason === 'desktop_swipe_observer';
    const hasSharedBudgetBuckets =
        !!window.walletTxns
        && window.walletTxns.atome !== undefined
        && window.walletTxns.bpi !== undefined
        && window.budgetManualTxns !== undefined;
    if (preserveBudgetWidget) {
        if (typeof window.holdBudgetWidgetForAccountSwitch === 'function') {
            window.holdBudgetWidgetForAccountSwitch();
        } else {
            window.__skipBudgetRefreshOnNextChartFilter = true;
            window.__freezeBudgetWidgetUI = true;
            window.__preserveBudgetWidgetVisuals = true;
            window.__suspendBudgetWidgetRefresh = true;
        }
        if (hasSharedBudgetBuckets) {
            window.hasBudgetLiveData = true;
            window.budgetLoadStartTime = Date.now() - 3000;
        }
    } else {
        window.__preserveBudgetWidgetVisuals = false;
        window.__suspendBudgetWidgetRefresh = false;
    }

    // PREVENT REDUNDANT CALLS: Early exit if already loading this specific account
    const loadKey = `${uid}_${window.currentAccount}`;
    if (window.lastLoadKey === loadKey && window.isDataLoading) {
        console.log('⏳ Load already in progress for:', loadKey);
        return;
    }
    window.lastLoadKey = loadKey;
    window.isDataLoading = true;
    window.walletDataPrimedLoadKey = null;
    window.historyLimit = 4; 
    const container = document.getElementById('history-container');
    const spinner = document.getElementById('loading-spinner');
    
    if (!preserveViewState) {
        window.allTxns = null;
    }

    if (!preserveBudgetWidget) {
        // Keep shared budget buckets warm across account switches.
        // The widget can still show a skeleton via `hasBudgetLiveData = false`,
        // but we avoid stranding accounts like `default_wallet` while waiting for
        // background watchers that already have valid shared data.
        if (typeof window.walletTxns === 'undefined') window.walletTxns = null;
        if (typeof window.budgetManualTxns === 'undefined') window.budgetManualTxns = [];
        window.hasBudgetLiveData = false;
        window.budgetLoadStartTime = Date.now();
        window.clearTimeout(window.__budgetWidgetFallbackKickTimer);
        window.__budgetWidgetFallbackKickTimer = window.setTimeout(() => {
            if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
            else if (window.updateTripleProgressBar) window.updateTripleProgressBar();
        }, 2600);
        
        if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
        else if (window.updateTripleProgressBar) window.updateTripleProgressBar();
    }
    
    // Clear existing listener if any
    if (window.unsubscribeSnapshot) {
        window.unsubscribeSnapshot();
        window.unsubscribeSnapshot = null;
    }

    // SNAPSHOT LOCK: Prevent stale snapshot data from overwriting new account data
    const currentSyncId = Date.now() + Math.random();
    window.activeSyncId = currentSyncId;

    // INSTANT CACHE LOAD for seamless switching
    const cacheKey = `wallet_cache_${uid}_${window.currentAccount}`;
    const cachedData = localStorage.getItem(cacheKey);
    let hasValidCache = false;

    if (cachedData) {
        try {
            const cache = JSON.parse(cachedData);
            const now = Date.now();
            // 24 hour expiry (86400000 ms)
            if (cache.txns && (now - cache.timestamp < 86400000)) {
                window.allTxns = cache.txns;
                if (window.renderHistory) window.renderHistory(cache.txns);
                if (window.updateBalanceToThisMonth && !(Array.isArray(cache.txns) && cache.txns.length === 0 && getCachedBalanceForAccount(window.currentAccount) !== null)) {
                    window.updateBalanceToThisMonth(cache.txns);
                }
                if (window.updateInsightCards) window.updateInsightCards(cache.txns);
                if (window.renderCalendar) window.renderCalendar();
                if (!preserveBudgetWidget) {
                    if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
                    else if (window.updateTripleProgressBar) window.updateTripleProgressBar();
                }
                hasValidCache = true;

                const kickChartFilter = () => {
                    applyPreferredDashboardFilter();
                    if (preserveBudgetWidget) {
                        if (typeof window.releaseBudgetWidgetAfterAccountSwitch === 'function') {
                            window.releaseBudgetWidgetAfterAccountSwitch();
                        } else {
                            window.__freezeBudgetWidgetUI = false;
                            window.__suspendBudgetWidgetRefresh = false;
                        }
                    }
                };
                if (fastAccountSwitch) {
                    requestAnimationFrame(() => requestAnimationFrame(kickChartFilter));
                } else {
                    setTimeout(kickChartFilter, 30);
                }

                if (spinner) spinner.style.display = 'none';
            }
        } catch(e) { console.warn("Cache error", e); }
    }

    // SPINNER LOGIC: Only show if no cache is valid, or show with short delay
    if (spinner) {
        if (!hasValidCache) {
            spinner.style.display = 'block';
        } else {
            // Cache exists: Only show spinner if data still takes a while
            clearTimeout(window.spinnerTimeout);
            window.spinnerTimeout = setTimeout(() => {
                if (window.isDataLoading && spinner) {
                    spinner.style.display = 'block';
                    log('Cloud sync taking longer than expected...');
                }
            }, 220);
        }
    }

    try {
        const isAnon = Boolean(auth.currentUser?.isAnonymous);
        
        const syncStatusText = document.querySelectorAll('.syncStatusText');
        syncStatusText.forEach(el => el.innerText = isAnon ? 'Local' : 'Live Sync');
        
        // MULTI-ACCOUNT COLLECTION SELECTION
        const collectionName = getCollectionName(window.currentAccount);
        let q = query(collection(db, "users", uid, collectionName), orderBy("date", "desc"));
        
        // DATA ISOLATION: Query ONLY the current account's path.
        const syncAccount = window.currentAccount; // Capture for closure check
        window.unsubscribeSnapshot = onSnapshot(q, (snap) => {
            // STALE CHECK: If user switched accounts while this listener was active
            if (window.activeSyncId !== currentSyncId || syncAccount !== window.currentAccount) {
                return;
            }
            let txns = [];

            // 1. QUICK COMPARISON (Check if first 5 IDs match and length matches)
            const prevTxns = window.allTxns || [];
            
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.deleted) return; 
                
                // PRE-CALCULATE SORT KEYS for performance
                const dateVal = new Date(data.date).getTime() || 0;
                const createVal = data.createdAt ? 
                    (data.createdAt.toMillis ? data.createdAt.toMillis() : new Date(data.createdAt).getTime()) : 0;
                
                txns.push({ 
                    id: d.id, 
                    _sortKey: dateVal, 
                    _createKey: createVal, 
                    ...data 
                });
            });

            // Sort locally - Optimized (O(N log N) with fewer object creations)
            txns.sort((a, b) => {
                if (b._sortKey !== a._sortKey) return b._sortKey - a._sortKey;
                return b._createKey - a._createKey;
            });

            // (2026-07-13) Prevent Atome duplicates across devices; prev: ID check only
            const seenIds = new Set();
            const seenRefs = new Set();
            const seenAtomeKeys = new Set();
            txns = txns.filter(t => {
                if (!t || !t.id) return Boolean(t);
                if (seenIds.has(t.id)) return false;
                seenIds.add(t.id);
                const isAtomeAcc = syncAccount === 'atome' || window.currentAccount === 'atome';
                const isSyncedOrAuto = t.isAutoGenerated || t.duplicatedFromAccount ||
                    (t.note && (t.note.includes('Synced from') || t.note.includes('BPI Sync'))) ||
                    (t.merchant && t.merchant.toUpperCase().includes('ATOME'));
                if (isAtomeAcc || isSyncedOrAuto) {
                    const amt = Math.abs(Number(t.manualAmount !== undefined && t.manualAmount !== null ? t.manualAmount : (t.amount || 0))).toFixed(2);
                    const refMatch = (t.note || '').match(/Ref No:\s*([A-Z0-9]+)/i);
                    const refKey = refMatch ? refMatch[1].trim() : (t.refNumber || (t.duplicatedFrom ? String(t.duplicatedFrom).replace(/^bpi_/, '') : ''));
                    if (refKey && refKey.length >= 4) {
                        const refUniqueKey = `ref_${refKey}_${amt}`;
                        if (seenRefs.has(refUniqueKey)) {
                            if (uid && t.id && (t.id.startsWith('atome_') || t.id.startsWith('auto_'))) {
                                const delDoc = window.deleteDoc;
                                if (delDoc) try { delDoc(doc(db, 'users', uid, 'transactions', t.id)).catch(() => {}); } catch(e) {}
                            }
                            return false;
                        }
                        seenRefs.add(refUniqueKey);
                    }
                    const rawDate = t.date ? new Date(t.date) : null;
                    const isoDate = rawDate && !isNaN(rawDate.getTime())
                        ? `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`
                        : (t.date ? String(t.date).slice(0, 10) : '');
                    if (isSyncedOrAuto && isoDate) {
                        const dateAmtKey = `${isoDate}_${amt}`;
                        if (seenAtomeKeys.has(dateAmtKey)) {
                            if (uid && t.id && (t.id.startsWith('atome_') || t.id.startsWith('auto_'))) {
                                const delDoc = window.deleteDoc;
                                if (delDoc) try { delDoc(doc(db, 'users', uid, 'transactions', t.id)).catch(() => {}); } catch(e) {}
                            }
                            return false;
                        }
                        seenAtomeKeys.add(dateAmtKey);
                    }
                }
                return true;
            });

            const hasRealtimeAddedTxn = prevTxns.length > 0 && snap.docChanges().some(change => change.type === 'added');
            if (hasRealtimeAddedTxn && window.queueBudgetThresholdNotificationTrigger) {
                window.queueBudgetThresholdNotificationTrigger(uid, null, 'realtime_snapshot');
            }

            // (2026-07-13) Include reimbursement fields in isSame check; prev: skipped
            const isSame = prevTxns.length === txns.length && 
                           txns.every((t, i) => 
                               prevTxns[i] && 
                               prevTxns[i].id === t.id && 
                               prevTxns[i].note === t.note && 
                               prevTxns[i].manualCategory === t.manualCategory &&
                               prevTxns[i].category === t.category &&
                               prevTxns[i].merchant === t.merchant &&
                               prevTxns[i].date === t.date &&
                               prevTxns[i].manualAmount === t.manualAmount &&
                               prevTxns[i].excluded === t.excluded &&
                               prevTxns[i].refund === t.refund &&
                               prevTxns[i].reimbursed === t.reimbursed &&
                               prevTxns[i].reimbursementAmount === t.reimbursementAmount &&
                               prevTxns[i].reimbursementType === t.reimbursementType &&
                               prevTxns[i].reimbursementAllocationCategory === t.reimbursementAllocationCategory
                           );

            if (isSame && document.getElementById('history-container').children.length > 0) {
                log(`Snapshot matches cache for ${syncAccount}. Render skipped.`);
                window.walletDataPrimedLoadKey = loadKey;

                if (window.updateBalanceToThisMonth) window.updateBalanceToThisMonth(txns, syncAccount);
                if (window.updateInsightCards) window.updateInsightCards(txns);
                if (window.renderCalendar) window.renderCalendar();
                if (!preserveBudgetWidget) {
                    if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
                    else if (window.updateTripleProgressBar) window.updateTripleProgressBar();
                }
                
                // Always rehydrate the chart stack after cache/snapshot reuse.
                // Skeleton placeholders do not equal "0", so text-based gating can strand the charts.
                applyPreferredDashboardFilter();
                if (preserveBudgetWidget) {
                    if (typeof window.releaseBudgetWidgetAfterAccountSwitch === 'function') {
                        window.releaseBudgetWidgetAfterAccountSwitch();
                    } else {
                        window.__freezeBudgetWidgetUI = false;
                        window.__suspendBudgetWidgetRefresh = false;
                    }
                }

                if (spinner) spinner.style.display = 'none';
                return;
            }
            
            // Store globally & Cache with timestamp
            window.allTxns = txns;
            window.walletDataPrimedLoadKey = loadKey;
            const currentAccCacheKey = `wallet_cache_${uid}_${syncAccount}`;
            
            // Cleanup internal sort keys before caching
            const cacheTxns = txns.map(({_sortKey, _createKey, ...t}) => t);
            
            localStorage.setItem(currentAccCacheKey, JSON.stringify({
                txns: cacheTxns,
                timestamp: Date.now()
            }));
            
            // Reset loading state as data has arrived
            window.isDataLoading = false;
            clearTimeout(window.spinnerTimeout);
            if (spinner) spinner.style.display = 'none';
            
            if (window.updateBalanceToThisMonth) window.updateBalanceToThisMonth(txns, syncAccount); 
            if (window.updateInsightCards) window.updateInsightCards(txns);
            if (window.renderCalendar) window.renderCalendar();
            
            if (!preserveBudgetWidget) {
                // Modified 2026-03-27: Signal that we have live data for the budget widget
                window.hasBudgetLiveData = true;
                if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
                else if (window.updateTripleProgressBar) window.updateTripleProgressBar();
            }

            if (txns.length === 0) {
                // EMPTY STATE
                const expTotal = document.getElementById('expenses-total-summary');
                if (expTotal) expTotal.innerText = 'PHP 0.00';
                const trendTotal = document.getElementById('trend-period-total');
                if (trendTotal) trendTotal.innerText = 'PHP 0.00';
                const chartVal = document.getElementById('chart-total-val');
                if (chartVal) chartVal.innerText = '0';
                const cachedBalance = getCachedBalanceForAccount(window.currentAccount);
                const balanceEl = document.querySelector(`.balance-card[data-account="${window.currentAccount}"] .balance-amount`) || document.getElementById(`${window.currentAccount}-balance`);
                if (balanceEl && cachedBalance === null) {
                    balanceEl.innerText = 'PHP 0.00';
                    balanceEl.dataset.raw = 'PHP 0.00';
                }
                
                if (window.drawPieChart) window.drawPieChart([], 0);
                if (window.drawTrendChart) window.drawTrendChart([]);

                if (container) {
                    container.innerHTML = `
                        <div style="text-align:center; padding:60px 20px; color:#64748b; background: white; border-radius: 12px; border: 1px dashed #cbd5e1;">
                            <i class="material-icons" style="font-size: 48px; margin-bottom: 10px; opacity: 0.5;">inbox</i>
                            <p style="margin:0; font-weight: 500;">No transactions found.</p>
                            <p style="font-size: 13px; margin: 10px 0 0;">Click "Scan Gmail" to sync your Atome payments.</p>
                        </div>`;
                }
            } else {
                if (window.renderHistory) window.renderHistory(txns);
                
                // Apply active category filter
                if (window.filterTxnList) window.filterTxnList();

                // Always default chart filter to 'this_month' on fresh data load/page return
                setTimeout(() => applyPreferredDashboardFilter(), 50);
                if (preserveBudgetWidget) {
                    setTimeout(() => {
                        if (typeof window.releaseBudgetWidgetAfterAccountSwitch === 'function') {
                            window.releaseBudgetWidgetAfterAccountSwitch();
                        } else {
                            window.__freezeBudgetWidgetUI = false;
                            window.__suspendBudgetWidgetRefresh = false;
                        }
                    }, 60);
                }
            }
            if (!preserveBudgetWidget && window.syncWidgets) window.syncWidgets();
        }, (error) => {
            log('Snapshot Error: ' + error.message, 'error');
            window.isDataLoading = false;
            if (spinner) spinner.style.display = 'none';
            clearTimeout(window.spinnerTimeout);
        });

        if (!hasValidCache) {
            getDocs(q).then((snap) => {
                if (window.activeSyncId !== currentSyncId || syncAccount !== window.currentAccount) return;
                if (window.walletDataPrimedLoadKey === loadKey) return;
                let txns = [];
                snap.docs.forEach((d) => {
                    const data = d.data();
                    if (data.deleted) return;
                    const dateVal = new Date(data.date).getTime() || 0;
                    const createVal = data.createdAt ?
                        (data.createdAt.toMillis ? data.createdAt.toMillis() : new Date(data.createdAt).getTime()) : 0;
                    txns.push({ id: d.id, _sortKey: dateVal, _createKey: createVal, ...data });
                });
                txns.sort((a, b) => {
                    if (b._sortKey !== a._sortKey) return b._sortKey - a._sortKey;
                    return b._createKey - a._createKey;
                });
                window.walletDataPrimedLoadKey = loadKey;
                window.allTxns = txns;
                const currentAccCacheKey = `wallet_cache_${uid}_${syncAccount}`;
                const cacheTxns = txns.map(({ _sortKey, _createKey, ...t }) => t);
                localStorage.setItem(currentAccCacheKey, JSON.stringify({ txns: cacheTxns, timestamp: Date.now() }));
                window.isDataLoading = false;
                clearTimeout(window.spinnerTimeout);
                if (spinner) spinner.style.display = 'none';
                if (window.updateBalanceToThisMonth) window.updateBalanceToThisMonth(txns, syncAccount);
                if (window.updateInsightCards) window.updateInsightCards(txns);
                if (window.renderCalendar) window.renderCalendar();
                if (!preserveBudgetWidget) {
                    window.hasBudgetLiveData = true;
                    if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
                    else if (window.updateTripleProgressBar) window.updateTripleProgressBar();
                }
                if (txns.length === 0) {
                    const expTotal = document.getElementById('expenses-total-summary');
                    if (expTotal) expTotal.innerText = 'PHP 0.00';
                    const trendTotal = document.getElementById('trend-period-total');
                    if (trendTotal) trendTotal.innerText = 'PHP 0.00';
                    const chartVal = document.getElementById('chart-total-val');
                    if (chartVal) chartVal.innerText = '0';
                    const cachedBalance = getCachedBalanceForAccount(window.currentAccount);
                    const balanceEl = document.querySelector(`.balance-card[data-account="${window.currentAccount}"] .balance-amount`) || document.getElementById(`${window.currentAccount}-balance`);
                    if (balanceEl && cachedBalance === null) {
                        balanceEl.innerText = 'PHP 0.00';
                        balanceEl.dataset.raw = 'PHP 0.00';
                    }
                    if (window.drawPieChart) window.drawPieChart([], 0);
                    if (window.drawTrendChart) window.drawTrendChart([]);
                    if (container) {
                        container.innerHTML = `
                        <div style="text-align:center; padding:60px 20px; color:#64748b; background: white; border-radius: 12px; border: 1px dashed #cbd5e1;">
                            <i class="material-icons" style="font-size: 48px; margin-bottom: 10px; opacity: 0.5;">inbox</i>
                            <p style="margin:0; font-weight: 500;">No transactions found.</p>
                            <p style="font-size: 13px; margin: 10px 0 0;">Click "Scan Gmail" to sync your Atome payments.</p>
                        </div>`;
                    }
                } else {
                    if (window.renderHistory) window.renderHistory(txns);
                    if (window.filterTxnList) window.filterTxnList();
                    requestAnimationFrame(() => {
                        applyPreferredDashboardFilter();
                        if (preserveBudgetWidget) {
                            if (typeof window.releaseBudgetWidgetAfterAccountSwitch === 'function') {
                                window.releaseBudgetWidgetAfterAccountSwitch();
                            } else {
                                window.__freezeBudgetWidgetUI = false;
                                window.__suspendBudgetWidgetRefresh = false;
                            }
                        }
                    });
                }
                if (!preserveBudgetWidget && window.syncWidgets) window.syncWidgets();
            }).catch((e) => log('getDocs prime failed: ' + (e && e.message), 'warn'));
        }

        // Clear loading state after listener is successfully attached
        setTimeout(() => { 
            window.isDataLoading = false; 
            clearTimeout(window.spinnerTimeout);
            if (spinner) spinner.style.display = 'none';
        }, 1000); // 1s safety margin for initial sync

    } catch (e) { 
        log('Failed to load history: ' + e.message, 'error');
        window.isDataLoading = false;
        clearTimeout(window.spinnerTimeout);
        if (spinner) spinner.style.display = 'none';
    }
}

// Watch Safe to Spend Config
export function watchSafeToSpend() {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const safeSpendRef = doc(db, "users", uid, "config", "safe_to_spend");

    if (window.unsubscribeSafeSpend) {
        window.unsubscribeSafeSpend();
    }

    window.unsubscribeSafeSpend = onSnapshot(safeSpendRef, (docSnap) => {
        let data = docSnap.exists() ? docSnap.data() : {
            savingsAmount: 3000,
            obligations: []
        };
        
        // Migration path for older single-obligation data
        if (data.obligationsAmount !== undefined && !data.obligations) {
            data.obligations = [{ 
                id: Date.now().toString(),
                title: data.obligationsTitle || 'Upcoming Bills',
                amount: data.obligationsAmount 
            }];
        }
        // (2026-07-13) Preserve cached obligations & toggles in watcher; prev: wiped
        const cached = window.safeToSpendConfig || (typeof window.restoreSafeSpendConfigFromCache === 'function' ? window.restoreSafeSpendConfigFromCache() : null);
        if (!data.obligations || data.obligations.length === 0) {
            if (cached?.obligations?.length > 0) {
                data.obligations = cached.obligations;
            } else {
                data.obligations = [];
            }
        }
        window.safeToSpendConfig = { ...(cached || {}), ...data };
        if (window.cacheSafeSpendConfig) window.cacheSafeSpendConfig(window.safeToSpendConfig);
        
        // Sync salary targets and rule to localStorage for speed
        const resolvedBudgetProfile = window.getMonthlyBudgetProfile
            ? window.getMonthlyBudgetProfile(data)
            : {
                budgetSalaryTarget: data.budgetSalaryTarget ?? data.salaryAmount ?? 17600,
                budgetRule: data.budgetRule || '50/30/20',
                customRuleWeights: data.customRuleWeights || null
            };
        if (window.applyBudgetProfileToLocalStorage) {
            window.applyBudgetProfileToLocalStorage(resolvedBudgetProfile);
        } else {
            localStorage.setItem('monthly_salary_target', resolvedBudgetProfile.budgetSalaryTarget);
            localStorage.setItem('budget_rule', resolvedBudgetProfile.budgetRule);
            if (resolvedBudgetProfile.budgetRule === 'custom' && resolvedBudgetProfile.customRuleWeights) {
                localStorage.setItem('custom_rule_needs', resolvedBudgetProfile.customRuleWeights.needs);
                localStorage.setItem('custom_rule_wants', resolvedBudgetProfile.customRuleWeights.wants);
                localStorage.setItem('custom_rule_savings', resolvedBudgetProfile.customRuleWeights.savings);
            }
        }
        
        if (window.updateSafeSpendUI) window.updateSafeSpendUI();
        if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
    else if (window.updateTripleProgressBar) window.updateTripleProgressBar();
        if (window.updateReceiptsUI) window.updateReceiptsUI(); // Hook for persistence
    });
}

// Gmail Scan / Sync Logic
export async function handleScan(limit, manualTrigger = false) {
    if (window.isSyncing) {
        console.log('🔄 Sync already in progress. Skipping...');
        return;
    }
    
    const syncAccount = window.currentAccount;
    // (2026-07-13) Add maribank sync query; prev: bpi and atome only
    const allowedSyncAccounts = ['bpi', 'atome', 'maribank'];
    
    if (!allowedSyncAccounts.includes(syncAccount)) {
        if (manualTrigger) {
            showToast('Email sync is only available for BPI, Atome, and MariBank accounts');
        }
        return;
    }

    const accessToken = localStorage.getItem('g_access_token');
    // (2026-09-16) Atome skips Gmail entirely; token not required for cross-sync
    if (!accessToken && syncAccount !== 'atome') {
        if (manualTrigger && window.tokenClient) {
            window.pendingSyncLimit = limit;
            window.pendingSyncManual = manualTrigger;
            window.tokenClient.requestAccessToken({ prompt: '' });
        }
        return;
    }

    window.isSyncing = true;
    
    const activeCard = document.querySelector(`.balance-card[data-account="${syncAccount}"]`);
    const btn = activeCard ? activeCard.querySelector('.scan-btn') : null;
    const statusText = activeCard ? activeCard.querySelector('.syncStatusText') : null;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="material-icons spin" style="font-size:12px;">sync</i>';
    }
    if (statusText) statusText.innerText = 'Syncing';
    
    try {
        log(`Syncing ${syncAccount.toUpperCase()}...`);
        
        // Multi-Account Query
        let gmailQuery = '';
        if (syncAccount === 'atome') {
            gmailQuery = `(subject:"Transaction Confirmation" OR subject:"payment confirmation" OR subject:"Atome Card") (from:Atome OR from:no-reply@atome.ph OR from:noreply@atome.ph)`;
        } else if (syncAccount === 'maribank') {
            gmailQuery = `(from:alerts@maribank.com.ph OR from:maribank.com.ph OR from:MariBank) (subject:"Successful Debit Card Transaction" OR subject:"Transfer Notification" OR subject:"MariBank")`;
        } else {
            gmailQuery = `(subject:"Funds Transfer" OR subject:"Fund Transfer" OR subject:"Interbank" OR subject:"Pay via QR" OR from:bpi_online@bpi.com.ph OR from:onlinebanking@bpi.com.ph OR from:bpiinstapay@bpi.com.ph OR from:BPI)`;
        }
        
        log(`Scanning Gmail (Target Limit: ${limit})...`);
        
        let savedCount = 0;
        let pageToken = '';
        let totalProcessed = 0;
        // (2026-09-16) Atome uses cross-sync only; skip Gmail scan entirely
        if (syncAccount === 'atome') totalProcessed = limit;

        while (totalProcessed < limit) {
            const maxResults = Math.min(500, limit - totalProcessed);
            let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(gmailQuery)}`;
            if (pageToken) url += `&pageToken=${pageToken}`;

            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` }});
            
            if (res.status === 401) {
                console.warn('🚫 Gmail Token expired.');
                window.isSyncing = false;
                localStorage.removeItem('g_access_token');
                
                // (2026-07-13) Refresh via SocialLogin; prev: GoogleAuth.refresh()
                if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                    log('📱 Attempting native token refresh...');
                    try {
                        const SocialLogin = window.Capacitor.Plugins?.SocialLogin;
                        const authRes = await SocialLogin?.refresh({ provider: 'google' });
                        const token = authRes?.result?.accessToken?.token || authRes?.accessToken;
                        if (token) {
                            localStorage.setItem('g_access_token', typeof token === 'string' ? token : token?.token);
                            log('📱 Native token refreshed. Retrying sync...');
                            // Recursively retry the scan with the new token
                            return handleScan(limit, manualTrigger);
                        }
                    } catch (refreshErr) {
                        log('📱 Native refresh failed: ' + refreshErr.message, 'warning');
                        
                        // FALLBACK: If silent refresh failed and it's a manual trigger, prompt for full login
                        if (manualTrigger) {
                            window.pendingSyncLimit = limit;
                            window.pendingSyncManual = manualTrigger;
                            window.refreshTriggeredBy401 = true;
                            log('🔄 Session expired. Triggering full re-authentication...');
                            // Automatically open login without confirming
                            if (typeof window.handleAuthClick === 'function') window.handleAuthClick();
                        }
                    }
                }
                
                // 🌐 WEB FALLBACK: Request fresh token
                if (window.tokenClient) {
                    window.pendingSyncLimit = limit;
                    window.pendingSyncManual = manualTrigger;
                    log('Refreshing session... Please wait.');
                    window.tokenClient.requestAccessToken({ prompt: '' });
                }
                throw new Error('Unauthorized - Refresh triggered');
            }
            
            const data = await res.json();
            const msgs = data.messages || [];
            pageToken = data.nextPageToken;

            if (msgs.length === 0) break;

            const fetchBatchSize = 10;
            for (let i = 0; i < msgs.length; i += fetchBatchSize) {
                const batch = msgs.slice(i, i + fetchBatchSize);
                
                const fetchPromises = batch.map(async (m) => {
                    try {
                        const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
                        const d = await detailRes.json();
                        
                        let txn = null;
                        const fullBody = getBody(d.payload);
                        const cleanText = stripTags(fullBody) || d.snippet;

                        // (2026-07-13) Dispatch MariBank parser; prev: BPI fallback only
                        if (syncAccount === 'atome') {
                            txn = parseAtomeEmail(cleanText, d.internalDate);
                        } else if (syncAccount === 'maribank') {
                            const subjectHeader = d.payload.headers.find(h => h.name.toLowerCase() === 'subject');
                            const subject = subjectHeader ? subjectHeader.value : '';
                            txn = parseMariBankEmail(cleanText, d.internalDate, subject);
                        } else {
                            const subjectHeader = d.payload.headers.find(h => h.name.toLowerCase() === 'subject');
                            const subject = subjectHeader ? subjectHeader.value : '';
                            txn = parseBPIEmail(cleanText, d.internalDate, subject);
                        }

                        if (txn) {
                            const uid = auth.currentUser.uid;
                            const colName = getCollectionName(syncAccount);
                            const docRef = doc(db, "users", uid, colName, txn.id);
                            
                            const snap = await getDoc(docRef);
                            // (2026-07-13) Allow updating existing txns on resync; prev: return null
                            if (!snap.exists()) {
                                return { txn, docRef, uid };
                            } else {
                                const existing = snap.data();
                                const oldCat = (existing?.manualCategory || '').toLowerCase();
                                const newCat = (txn.manualCategory || '').toLowerCase();
                                if ((syncAccount === 'maribank' && (oldCat === 'financial expenses' || !existing?.manualCategory)) || (oldCat === 'financial expenses' && newCat && newCat !== 'financial expenses') || (syncAccount === 'maribank' && newCat && oldCat !== newCat)) {
                                    return { txn, docRef, uid, isUpdate: true };
                                }
                            }
                        }
                    } catch (err) { return null; }
                    return null;
                });
                
                const results = await Promise.all(fetchPromises);
                const validTxns = results.filter(Boolean);
                
                if (validTxns.length > 0) {
                    const firestoreBatch = writeBatch(db);
                    const uid = validTxns[0].uid;
                    
                    // (2026-07-13) Support batch merge update on resync; prev: insert set only
                    for (const {txn, docRef, isUpdate} of validTxns) {
                        if (isUpdate) {
                            firestoreBatch.set(docRef, { ...txn, updatedAt: serverTimestamp() }, { merge: true });
                        } else {
                            firestoreBatch.set(docRef, { ...txn, deleted: false, createdAt: serverTimestamp() });
                        }
                        
                        // Auto-duplicate BPI "Atome Payment" to Atome wallet
                        const isAtomePayment = txn.merchant === 'ATOME PAYMENT' || 
                                              (txn.merchant && txn.merchant.toUpperCase().includes('ATOME')) ||
                                              (txn.manualCategory === 'Credit Card Payment'); // simplified check // 2026-04-02

                        // (2026-07-13) Prevent Atome duplicates across devices; prev: ID check only
                        if (syncAccount === 'bpi' && isAtomePayment) {
                            const atomeCol = getCollectionName('atome');
                            const cleanId = txn.id.replace('bpi_', '');
                            const atomeTxnId = 'atome_auto_' + cleanId;
                            const possibleIds = [
                                atomeTxnId,
                                'auto_' + txn.id,
                                'atome_cs_bpi_' + txn.id,
                                'atome_auto_bpi_' + txn.id
                            ];
                            const checkSnaps = await Promise.all(possibleIds.map(id => getDoc(doc(db, "users", uid, atomeCol, id))));
                            const alreadyExists = checkSnaps.some(s => s.exists() && !s.data()?.deleted);

                            if (!alreadyExists) {
                                log(`Auto-duplicating ${txn.merchant} to Atome wallet...`);
                                const atomeDocRef = doc(db, "users", uid, atomeCol, atomeTxnId);
                                const atomeTxn = {
                                    ...txn,
                                    id: atomeTxnId,
                                    merchant: 'ATOME PAYMENT', // Standardize name
                                    amount: Math.abs(txn.amount || 0), // Atome payment is income for that wallet
                                    manualAmount: txn.manualAmount !== undefined ? Math.abs(txn.manualAmount) : undefined,
                                    manualCategory: 'Income', // Fixed as income // 2026-04-02
                                    note: (txn.note || '') + ' (Synced from BPI)',
                                    date: txn.date, // Match the date exactly
                                    duplicatedFrom: txn.id,
                                    duplicatedFromAccount: 'bpi',
                                    isAutoGenerated: true // Mark as auto // 2026-04-02
                                };
                                firestoreBatch.set(atomeDocRef, { ...atomeTxn, deleted: false, createdAt: serverTimestamp() });
                            }
                        }
                    }
                    
                    await firestoreBatch.commit();
                    savedCount += validTxns.length;
                }
            }
            
            totalProcessed += msgs.length;
            if (!pageToken) break; 
        }

        // (2026-09-16) On Atome sync, pull CC payments from BPI/MariBank into Atome as income;
        // prev: only ran on BPI sync side
        if (syncAccount === 'atome' && auth.currentUser) {
            const uid = auth.currentUser.uid;
            const atomeCol = getCollectionName('atome');
            const sourceAccounts = ['bpi', 'maribank'];
            let crossSyncCount = 0;

            const existingAtomeSnap = await getDocs(query(collection(db, 'users', uid, atomeCol), orderBy('date', 'desc'), limit(100)));
            const existingAtome = existingAtomeSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            for (const srcAcc of sourceAccounts) {
                try {
                    const srcCol = getCollectionName(srcAcc);
                    const srcQuery = query(
                        collection(db, 'users', uid, srcCol),
                        orderBy('date', 'desc')
                    );
                    const srcSnap = await getDocs(srcQuery);
                    const crossBatch = writeBatch(db);
                    let batchHasWrites = false;

                    for (const srcDoc of srcSnap.docs) {
                        const srcData = srcDoc.data();
                        if (srcData.deleted) continue;
                        // (2026-07-13) Limit BPI sync to past 2 days & prevent dups; prev: this month
                        const txnDate = srcData.date ? new Date(srcData.date) : null;
                        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
                        if (!txnDate || txnDate < twoDaysAgo) continue;
                        // (2026-09-16) Match CC payment to Atome from source account
                        const isAtomePmt =
                            srcData.manualCategory === 'Credit Card Payment' ||
                            (srcData.merchant && srcData.merchant.toUpperCase().includes('ATOME'));
                        if (!isAtomePmt) continue;

                        const srcCleanId = srcDoc.id.replace(/^(bpi|maribank)_/, '');
                        const dupId = `atome_auto_${srcAcc}_${srcCleanId}`;
                        const candidateAmt = Math.abs(srcData.amount || 0);
                        let candidateDateIso = '';
                        if (srcData.date) {
                            const pd = new Date(srcData.date);
                            candidateDateIso = !isNaN(pd.getTime()) ? pd.toISOString().slice(0, 10) : String(srcData.date).slice(0, 10);
                        }
                        const refMatch = (srcData.note || '').match(/Ref No:\s*([A-Z0-9]+)/i);
                        const srcRef = refMatch ? refMatch[1].trim() : (srcData.refNumber || '');

                        // (2026-07-13) Prevent Atome cross-sync duplicates; prev: raw doc ID keying
                        const alreadyExists = existingAtome.some(at => {
                            if (at.deleted) return false;
                            if (at.id === dupId || at.id === `auto_${srcDoc.id}` || at.id === `atome_auto_${srcCleanId}` || at.id === `atome_auto_${srcAcc}_${srcDoc.id}` || at.id === `atome_cs_${srcAcc}_${srcDoc.id}` || at.id === `atome_cs_bpi_${srcDoc.id}`) return true;
                            if (at.duplicatedFrom === srcDoc.id || at.duplicatedFrom === srcCleanId) return true;
                            const atAmt = Math.abs(Number(at.amount || at.manualAmount || 0));
                            let atDateIso = '';
                            if (at.date) {
                                const pd = new Date(at.date);
                                atDateIso = !isNaN(pd.getTime()) ? pd.toISOString().slice(0, 10) : String(at.date).slice(0, 10);
                            }
                            if (srcRef && (at.note || '').includes(srcRef) && Math.abs(atAmt - candidateAmt) < 0.01) return true;
                            if (candidateDateIso && atDateIso === candidateDateIso && Math.abs(atAmt - candidateAmt) < 0.01) {
                                if (at.isAutoGenerated || at.duplicatedFromAccount || (at.note || '').includes('Synced from') || (at.note || '').includes('BPI Sync') || (at.merchant || '').toUpperCase().includes('ATOME')) return true;
                            }
                            return false;
                        });
                        if (alreadyExists) continue;

                        const atomeDocRef = doc(db, 'users', uid, atomeCol, dupId);
                        const atomeSnap = await getDoc(atomeDocRef);
                        const dataOld = atomeSnap.exists() ? atomeSnap.data() : null;
                        if (dataOld && !dataOld.deleted) continue;

                        log(`Cross-syncing ${srcData.merchant} (${srcAcc}) → Atome wallet...`);
                        const dupTxn = {
                            ...srcData,
                            id: dupId,
                            merchant: 'ATOME PAYMENT',
                            amount: Math.abs(srcData.amount || 0),
                            type: 'income',
                            category: 'Income',
                            manualCategory: 'Income',
                            manualBudgetCategory: 'n/a',
                            note: ((srcData.note || '') +
                                ` (Synced from ${srcAcc.toUpperCase()})`).trim(),
                            duplicatedFrom: srcDoc.id,
                            duplicatedFromAccount: srcAcc,
                            isAutoGenerated: true,
                            deleted: false
                        };
                        if (srcData.manualAmount !== undefined && srcData.manualAmount !== null) {
                            dupTxn.manualAmount = Math.abs(srcData.manualAmount);
                        } else {
                            delete dupTxn.manualAmount;
                        }
                        Object.keys(dupTxn).forEach(k => dupTxn[k] === undefined && delete dupTxn[k]);
                        crossBatch.set(atomeDocRef, { ...dupTxn, createdAt: serverTimestamp() });
                        existingAtome.push(dupTxn);
                        batchHasWrites = true;
                        crossSyncCount++;
                    }

                    if (batchHasWrites) await crossBatch.commit();
                } catch (crossErr) {
                    log(`Cross-sync from ${srcAcc} failed: ${crossErr.message}`, 'warn');
                }
            }

            if (crossSyncCount > 0) {
                savedCount += crossSyncCount;
                log(`Cross-sync: +${crossSyncCount} payment(s) mirrored to Atome.`, 'success');
            }
        }

        if (savedCount > 0) {
            const now = Date.now();
            localStorage.setItem(`last_quick_sync_${syncAccount}`, now);
            if (limit >= 400) localStorage.setItem(`last_deep_sync_${syncAccount}`, now);
            
            log(`Sync complete! +${savedCount} transactions found.`, 'success');
            triggerHaptic('success');
            await loadData();
        } else {
            log('Sync complete. No new transactions found.');
        }
    } catch (e) { 
        log('Scan error: ' + e.message, 'error'); 
    } finally {
        window.isSyncing = false;
        const finalCard = document.querySelector(`.balance-card[data-account="${syncAccount}"]`);
        const finalBtn = finalCard ? finalCard.querySelector('.scan-btn') : null;
        const finalStatusText = finalCard ? finalCard.querySelector('.syncStatusText') : null;

        if (finalBtn) {
            finalBtn.disabled = false;
            finalBtn.innerHTML = '<i class="material-icons">sync</i>';
        }
        if (finalStatusText) finalStatusText.innerText = 'Synced';
    }
}

// Private Email Parsers
function getBody(payload) {
    let body = "";
    if (payload.body && payload.body.data) {
        const b64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
        try {
            body = decodeURIComponent(escape(atob(b64)));
        } catch(e) { body = atob(b64); }
    } else if (payload.parts) {
        payload.parts.forEach(part => { body += getBody(part); });
    }
    return body;
}

function parseAtomeEmail(text, ts) {
    const amtMatch = text.match(/payment\s+of[^\d]*([\d,]+\.?\d*)/i) || text.match(/amount[^\d]*([\d,]+\.?\d*)/i);
    const merchMatch = text.match(/for\s+([^,]+?)\s+using/i) || text.match(/at\s+([^,]+?)\s+(?:using|on)/i);
    if (!amtMatch) return null;
    const merchant = merchMatch ? merchMatch[1].trim() : "Atome Transaction";
    const inferred = getMerchantDisplay(merchant, {});
    return {
        id: 'txn_' + ts,
        amount: parseFloat(amtMatch[1].replace(/,/g, '')),
        merchant,
        date: formatLocalDate(parseInt(ts)),
        manualCategory: inferred.category
    };
}

// (2026-07-13) Add MariBank email parser; prev: absent
function parseMariBankEmail(text, ts, subject) {
    let amount = 0;
    let merchant = "MariBank";
    let note = "";
    let isIncome = false;
    let category = "Financial Expenses";
    let dateVal = formatLocalDate(parseInt(ts));

    const tLower = text.toLowerCase();
    const sLower = (subject || '').toLowerCase();

    // 1. Transaction Time from body if present
    const timeMatch = text.match(/Transaction time\s*:\s*([^\n\r|]+)/i);
    if (timeMatch) {
        const parsedDate = new Date(timeMatch[1].trim());
        if (!isNaN(parsedDate)) dateVal = formatLocalDate(parsedDate);
    }

    // 2. Reference Number if present
    const refMatch = text.match(/Reference No\s*:\s*([A-Za-z0-9]+)/i);
    const refNo = refMatch ? refMatch[1].trim() : '';

    // 3. Detect Transaction Type
    if (sLower.includes("successful debit card") || tLower.includes("maricard debit transaction was successful")) {
        // Debit Card Purchase (e.g. TECFUEL BOGO)
        const amtMatch = text.match(/(?:Transaction Amount|Amount)\s*:\s*(?:PHP|₱)?\s*([\d,]+\.?\d*)/i);
        if (amtMatch) amount = parseFloat(amtMatch[1].replace(/,/g, ''));

        const merchMatch = text.match(/Merchant\s*:\s*([^\n\r|]+)/i);
        if (merchMatch) {
            merchant = merchMatch[1].trim();
        } else {
            merchant = "MariCard Purchase";
        }
        isIncome = false;
        note = "MariCard Debit - " + merchant;
        // (2026-07-13) Set inferred category from merchant; prev: fixed financial
        if (typeof getMerchantDisplay === 'function') {
            const inferred = getMerchantDisplay(merchant, { note });
            if (inferred && inferred.category) {
                category = inferred.category;
            }
        }
        if (!category) category = 'Financial Expenses';
    } else if (sLower.includes("transfer notification") || tLower.includes("received a funds transfer") || tLower.includes("transfer from")) {
        // Funds Transfer Received (Income: BPI, GCash, etc.)
        const amtMatch = text.match(/(?:Transfer amount|Amount)\s*:\s*(?:PHP|₱)?\s*([\d,]+\.?\d*)/i);
        if (amtMatch) amount = parseFloat(amtMatch[1].replace(/,/g, ''));

        const fromMatch = text.match(/Transfer from\s*:\s*([^\n\r|]+)/i);
        const transferFrom = fromMatch ? fromMatch[1].trim() : '';

        isIncome = true;
        merchant = "INCOME";
        category = "Income";
        note = transferFrom ? ("FROM " + transferFrom.toUpperCase()) : "FUNDS RECEIVED";
        if (refNo) note += " (Ref: " + refNo + ")";
    } else {
        // Fallback amount matching
        const amtMatch = text.match(/(?:Amount|PHP|₱)\s*[:|]?\s*(?:PHP|₱)?\s*([\d,]+\.\d{2})/i);
        if (amtMatch) amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    }

    if (!amount || amount <= 0) return null;

    return {
        id: refNo ? ('mb_' + refNo) : ('mb_' + ts),
        amount: amount,
        merchant: merchant,
        note: note,
        date: dateVal,
        manualCategory: category,
        manualBudgetCategory: 'n/a'
    };
}

function parseBPIEmail(text, ts, subject) {
    let amount = 0;
    let merchant = "BPI Transfer";
    let note = "";
    let isIncome = false;
    let category = "Financial Expenses";
    let dateVal = formatLocalDate(parseInt(ts));

    const tLower = text.toLowerCase();
    const sLower = subject.toLowerCase();

    if (tLower.includes("never ask for your bank details") && !tLower.includes("confirmation number")) return null;

    let fee = 0;
    const feeMatch = text.match(/(?:Service Fee|Fee)\s*\|\s*PHP\s*([\d,]+\.\d{2})/i) || 
                     text.match(/(?:Service Fee|Fee):\s*₱?([\d,]+\.\d{2})/i);
    if (feeMatch) fee = parseFloat(feeMatch[1].replace(/,/g, ''));

    const totalAmtMatch = text.match(/Total Amount\s*\|\s*PHP\s*([\d,]+\.\d{2})/i) ||
                          text.match(/Total Amount:\s*₱?([\d,]+\.\d{2})/i);
    
    const baseAmtMatch = text.match(/(?:Transfer Amount|Amount)\s*\|\s*PHP\s*([\d,]+\.\d{2})/i) ||
                         text.match(/(?:Transfer Amount|Amount):\s*₱?([\d,]+\.\d{2})/i) ||
                         text.match(/(?:PHP|PHP\s|P|₱)\s?([\d,]+\.\d{2})/i);

    if (totalAmtMatch) {
        amount = parseFloat(totalAmtMatch[1].replace(/,/g, ''));
    } else if (baseAmtMatch) {
        amount = parseFloat(baseAmtMatch[1].replace(/,/g, ''));
        if (fee > 0 && !text.includes("Total Amount")) amount += fee;
    }

    if (amount === 0) return null;

    const dateMatch = text.match(/Transaction Date and Time\s+(?:\|\s*)?([^;\n\r|]+)/i) || 
                      text.match(/Date and Time\s+(?:\|\s*)?([^;\n\r|]+)/i);
    if (dateMatch) {
        const parsedDate = new Date(dateMatch[1].trim());
        if (!isNaN(parsedDate)) dateVal = formatLocalDate(parsedDate);
    }

    const payToMatch = text.match(/Pay To\s*\|\s*([^|\n\r]+)/i) || text.match(/To\s*\|\s*([^|\n\r]+)/i);
    const bankNameMatch = text.match(/Bank Name\s*\|\s*([^|\n\r]+)/i) || text.match(/Bank\s*\|\s*([^|\n\r]+)/i);
    const refNoMatch = text.match(/Transaction Ref No\.\s*\|\s*([A-Z0-9]+)/i);

    const isAtome = (payToMatch && payToMatch[1].toLowerCase().includes("atome")) || 
                    (sLower.includes("pay atome")) ||
                    (bankNameMatch && (
                        bankNameMatch[1].toLowerCase().includes("aub") || 
                        bankNameMatch[1].toLowerCase().includes("asia united bank")
                    ));

    if (isAtome) {
        merchant = "ATOME PAYMENT";
        category = "Credit Card Payment";
        if (refNoMatch) note = "Ref No: " + refNoMatch[1].trim();
    } else if (sLower.includes("incoming") || tLower.includes("received a transfer") || tLower.includes("balancing")) {
        // [FIX 2026-07-01] BALANCING is Income (money received to balance account)
        isIncome = true;
        merchant = tLower.includes("balancing") ? "BALANCING" : "INCOME"; 
        category = "Income";
        const bankMatch = bankNameMatch || text.match(/Transfer From\s*(?:\|\s*)?([^|\n\r]+)/i);
        if (bankMatch) note = "FROM " + bankMatch[1].trim().toUpperCase();
    } else {
        merchant = payToMatch ? payToMatch[1].trim() : "PAYMENT";
        let bank = bankNameMatch ? bankNameMatch[1].trim() : "";
        note = bank ? "TO " + bank.toUpperCase() : "TO BPI";
        
        // [FIX 2026-07-01] Force Financial Expenses for payment/withdrawal transactions (NOT balancing)
        const merchantLower = merchant.toLowerCase();
        const noteLower = note.toLowerCase();
        const isFinancialTransaction = 
            merchantLower.includes("payment") ||
            merchantLower.includes("withdrawal") ||
            merchantLower.includes("withdraw") ||
            merchantLower.includes("instapay") ||
            merchantLower.includes("transfer") ||
            noteLower.includes("payment") ||
            noteLower.includes("withdrawal") ||
            noteLower.includes("instapay") ||
            noteLower.includes("transfer");
        
        if (isFinancialTransaction) {
            // Always categorize financial transactions as Financial Expenses
            category = "Financial Expenses";
        } else {
            // Only use merchant inference for non-financial transactions
            const inferred = getMerchantDisplay(merchant, { note });
            if (inferred.category && inferred.category !== 'Financial Expenses') {
                category = inferred.category;
                merchant = inferred.name || merchant;
            } else {
                category = "Financial Expenses";
            }
        }
    }

    return { id: 'bpi_' + ts, amount, merchant, note, date: dateVal, manualCategory: category };
}
