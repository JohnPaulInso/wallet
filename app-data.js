/**
 * Data management and synchronization for the Wallet App
 */
import { db, auth, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, getDocs, onSnapshot, query, orderBy, updateDoc, writeBatch } from "./firebase-config.js";
import { log, showToast, getMerchantDisplay, formatLocalDate, stripTags } from "./app-utils.js";

// Global data state
window.allTxns = [];
window.isSyncing = false;
window.unsubscribeSnapshot = null;
window.unsubscribeSafeSpend = null;
window.safeToSpendConfig = {
    savingsAmount: 3000,
    obligations: []
};

// Helper to get collection name from account ID
export function getCollectionName(accId) {
    if (accId === 'bpi') return 'transactions_bpi';
    if (accId === 'atome') return 'transactions_atome';
    if (accId === 'default_wallet') return 'transactions_default';
    return `transactions_${accId}`;
}

// Load Data with Real-time Listeners
window.unsubscribeSnapshot = null;
window.isDataLoading = false; 

export async function loadData(providedUid = null) {
    const uid = providedUid || auth.currentUser?.uid;
    if (!uid) return;

    // PREVENT REDUNDANT CALLS: Early exit if already loading this specific account
    const loadKey = `${uid}_${window.currentAccount}`;
    if (window.lastLoadKey === loadKey && window.isDataLoading) {
        console.log('⏳ Load already in progress for:', loadKey);
        return;
    }
    window.lastLoadKey = loadKey;
    window.isDataLoading = true;

    window.historyLimit = 6; 
    const container = document.getElementById('history-container');
    const spinner = document.getElementById('loading-spinner');
    
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
                if (window.updateBalanceToThisMonth) window.updateBalanceToThisMonth(cache.txns);
                hasValidCache = true;
                
                // Robust Chart Initialization with slight delay to ensure DOM readiness
                setTimeout(() => {
                    const filterEl = document.getElementById('chart-filter');
                    if (filterEl) {
                        filterEl.value = 'this_month';
                        if (window.filterChart) window.filterChart();
                    }
                }, 100);
                
                if (spinner) spinner.style.display = 'none'; 
            }
        } catch(e) { console.warn("Cache error", e); }
    }

    // SPINNER LOGIC: Only show if no cache is valid, or show with short delay
    if (spinner) {
        if (!hasValidCache) {
            spinner.style.display = 'block';
        } else {
            // Cache exists: Only show spinner if data takes >500ms to arrive
            clearTimeout(window.spinnerTimeout);
            window.spinnerTimeout = setTimeout(() => {
                if (window.isDataLoading && spinner) {
                    spinner.style.display = 'block';
                    log('Cloud sync taking longer than expected...');
                }
            }, 500);
        }
    }

    try {
        const isAnon = auth.currentUser.isAnonymous;
        
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

            const isSame = prevTxns.length === txns.length && 
                           txns.every((t, i) => 
                               prevTxns[i] && 
                               prevTxns[i].id === t.id && 
                               prevTxns[i].note === t.note && 
                               prevTxns[i].manualCategory === t.manualCategory &&
                               prevTxns[i].manualAmount === t.manualAmount &&
                               prevTxns[i].excluded === t.excluded &&
                               prevTxns[i].refund === t.refund
                           );

            if (isSame && document.getElementById('history-container').children.length > 0) {
                log(`Snapshot matches cache for ${syncAccount}. Render skipped.`);
                
                // Ensure chart is still rendered if it's currently empty
                const filterEl = document.getElementById('chart-filter');
                const chartVal = document.getElementById('chart-total-val');
                if (filterEl && (filterEl.value !== 'this_month' || (chartVal && chartVal.innerText === '0'))) {
                   filterEl.value = 'this_month';
                   if (window.filterChart) window.filterChart();
                }

                if (spinner) spinner.style.display = 'none';
                return;
            }
            
            // Store globally & Cache with timestamp
            window.allTxns = txns;
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

            if (txns.length === 0) {
                // EMPTY STATE
                const expTotal = document.getElementById('expenses-total-summary');
                if (expTotal) expTotal.innerText = 'PHP 0.00';
                const trendTotal = document.getElementById('trend-period-total');
                if (trendTotal) trendTotal.innerText = 'PHP 0.00';
                const chartVal = document.getElementById('chart-total-val');
                if (chartVal) chartVal.innerText = '0';
                
                const balanceEl = document.querySelector(`.balance-card[data-account="${syncAccount}"] .balance-amount`);
                if (balanceEl) {
                    balanceEl.innerText = 'PHP 0.00';
                    balanceEl.dataset.raw = 'PHP 0.00';
                    balanceEl.classList.add('privacy-mask');
                    if(localStorage.getItem('balance_hidden') === 'true') balanceEl.innerText = '******';
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
                const defaultFilter = 'this_month';
                const filterEl = document.getElementById('chart-filter');
                if (filterEl) {
                   filterEl.value = defaultFilter;
                   // Use a small delay if coming from fresh load to ensure components are ready
                   setTimeout(() => { if (window.filterChart) window.filterChart(); }, 50);
                }
            }
        }, (error) => {
            log('Snapshot Error: ' + error.message, 'error');
            window.isDataLoading = false;
            if (spinner) spinner.style.display = 'none';
            clearTimeout(window.spinnerTimeout);
        });

        // Clear loading state after listener is successfully attached
        setTimeout(() => { 
            window.isDataLoading = false; 
            clearTimeout(window.spinnerTimeout);
            if (spinner) spinner.style.display = 'none';
        }, 1000); // 1s safety margin for initial sync

    } catch (e) { 
        log('Failed to load history: ' + e.message, 'error');
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
        } else if (!data.obligations) {
            data.obligations = [];
        }
        window.safeToSpendConfig = data;
        
        // Sync salary targets and rule to localStorage for speed
        if (data.budgetSalaryTarget !== undefined) {
            localStorage.setItem('monthly_salary_target', data.budgetSalaryTarget);
        } else if (data.salaryAmount !== undefined) {
            localStorage.setItem('monthly_salary_target', data.salaryAmount);
        }
        
        if (data.budgetRule !== undefined) {
            localStorage.setItem('budget_rule', data.budgetRule);
        }
        
        if (window.updateSafeSpendUI) window.updateSafeSpendUI();
        if (window.updateTripleProgressBar) window.updateTripleProgressBar();
    });
}

// Gmail Scan / Sync Logic
export async function handleScan(limit, manualTrigger = false) {
    if (window.isSyncing) {
        console.log('🔄 Sync already in progress. Skipping...');
        return;
    }
    
    const syncAccount = window.currentAccount;
    const allowedSyncAccounts = ['bpi', 'atome'];
    
    if (!allowedSyncAccounts.includes(syncAccount)) {
        if (manualTrigger) {
            showToast('Email sync is only available for BPI and Atome accounts');
        }
        return;
    }

    const accessToken = localStorage.getItem('g_access_token');
    if (!accessToken) {
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
        } else {
            gmailQuery = `(subject:"Funds Transfer" OR subject:"Fund Transfer" OR subject:"Interbank" OR subject:"Pay via QR" OR from:bpi_online@bpi.com.ph OR from:onlinebanking@bpi.com.ph OR from:bpiinstapay@bpi.com.ph OR from:BPI)`;
        }
        
        log(`Scanning Gmail (Target Limit: ${limit})...`);
        
        let savedCount = 0;
        let pageToken = '';
        let totalProcessed = 0;

        while (totalProcessed < limit) {
            const maxResults = Math.min(500, limit - totalProcessed);
            let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(gmailQuery)}`;
            if (pageToken) url += `&pageToken=${pageToken}`;

            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` }});
            
            if (res.status === 401) {
                console.warn('🚫 Gmail Token expired.');
                window.isSyncing = false;
                localStorage.removeItem('g_access_token');
                
                if (window.tokenClient) {
                    window.pendingSyncLimit = limit;
                    window.pendingSyncManual = manualTrigger;
                    window.tokenClient.requestAccessToken({ prompt: 'none' });
                }
                throw new Error('Unauthorized - Silent refresh attempted');
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

                        if (syncAccount === 'atome') {
                            txn = parseAtomeEmail(cleanText, d.internalDate);
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
                            if (!snap.exists()) {
                                return { txn, docRef, uid };
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
                    
                    for (const {txn, docRef} of validTxns) {
                        firestoreBatch.set(docRef, { ...txn, deleted: false, createdAt: serverTimestamp() });
                        
                        // Auto-duplicate BPI "Atome Payment" to Atome wallet
                        const merchantLower = txn.merchant?.toLowerCase() || '';
                        const categoryLower = txn.manualCategory?.toLowerCase() || '';
                        const isAtomePayment = merchantLower.includes('atome') || categoryLower.includes('credit card payment');

                        if (syncAccount === 'bpi' && isAtomePayment) {
                            const atomeCol = getCollectionName('atome');
                            const atomeTxnId = 'auto_' + txn.id;
                            const atomeDocRef = doc(db, "users", uid, atomeCol, atomeTxnId);

                            const atomeSnap = await getDoc(atomeDocRef);
                            if (!atomeSnap.exists()) {
                                log(`Auto-duplicating ${txn.merchant} to Atome wallet...`);
                                const atomeTxn = {
                                    ...txn,
                                    id: atomeTxnId,
                                    amount: Math.abs(txn.amount),
                                    manualAmount: txn.manualAmount !== undefined ? Math.abs(txn.manualAmount) : undefined,
                                    manualCategory: 'Income',
                                    note: (txn.note || '') + ' (BPI Sync)',
                                    duplicatedFrom: txn.id,
                                    duplicatedFromAccount: 'bpi'
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
        
        if (savedCount > 0) {
            const now = Date.now();
            localStorage.setItem(`last_quick_sync_${syncAccount}`, now);
            if (limit >= 400) localStorage.setItem(`last_deep_sync_${syncAccount}`, now);
            
            log(`Sync complete! +${savedCount} transactions found.`, 'success');
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
    return {
        id: 'txn_' + ts,
        amount: parseFloat(amtMatch[1].replace(/,/g, '')),
        merchant: merchMatch ? merchMatch[1].trim() : "Atome Transaction",
        date: formatLocalDate(parseInt(ts))
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
    } else if (sLower.includes("incoming") || tLower.includes("received a transfer")) {
        isIncome = true;
        merchant = "INCOME"; 
        category = "Income";
        const bankMatch = bankNameMatch || text.match(/Transfer From\s*(?:\|\s*)?([^|\n\r]+)/i);
        if (bankMatch) note = "FROM " + bankMatch[1].trim().toUpperCase();
    } else {
        merchant = "PAYMENT";
        category = "Financial Expenses";
        let bank = bankNameMatch ? bankNameMatch[1].trim() : "";
        note = bank ? "TO " + bank.toUpperCase() : "TO BPI";
    }

    return { id: 'bpi_' + ts, amount, merchant, note, date: dateVal, manualCategory: category };
}
