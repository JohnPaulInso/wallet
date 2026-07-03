/**
 * Wants, Needs, and Savings Budget Analysis Overlay JS
 * [CREATED: 2026-07-03]
 * Provides direct values from monthly budget, interactive SVG donut chart, and transaction filtering.
 */

(function () {
    // Module State
    let activeFilter = 'all'; // 'all', 'needs', 'wants', 'savings'
    let budgetData = {
        totals: { needs: 0, wants: 0, savings: 0, total: 0 },
        limits: { needs: 0, wants: 0, savings: 0, total: 0 },
        counts: { needs: 0, wants: 0, savings: 0, total: 0 },
        transactions: { all: [], needs: [], wants: [], savings: [] }
    };

    // Color definitions matching CSS (Wants is Gold #f59e0b)
    const COLORS = {
        needs: '#3b82f6',
        wants: '#f59e0b',
        savings: '#10b981'
    };

    /**
     * Format number as Peso currency without decimal points
     */
    function formatPeso(val) {
        if (val === null || val === undefined || isNaN(val)) return '₱0';
        return `₱${Math.round(val).toLocaleString('en-US')}`;
    }

    /**
     * Collect and aggregate budget analysis data from all workspace transaction sources
     */
    function aggregateBudgetAnalysis() {
        try {
            // [FIXED: 2026-07-03] Fetch active month filter and reference date exactly as showBudgetTransactions does - Antigravity
            const monthContext = window.getBudgetWidgetMonthContext
                ? window.getBudgetWidgetMonthContext()
                : (window.getDashboardMonthContext ? window.getDashboardMonthContext() : null);
            const filterEl = document.getElementById('chart-filter');
            const filterVal = monthContext?.filterValue || (filterEl ? filterEl.value : 'this_month');
            const referenceDate = monthContext?.referenceDate ? new Date(monthContext.referenceDate) : new Date();

            // Reset data structures
            budgetData.totals = { needs: 0, wants: 0, savings: 0, total: 0 };
            budgetData.counts = { needs: 0, wants: 0, savings: 0, total: 0 };
            budgetData.transactions = { all: [], needs: [], wants: [], savings: [] };

            // Fetch salary target, budget rule & weights
            const budgetProfile = typeof window.getMonthlyBudgetProfile === 'function'
                ? window.getMonthlyBudgetProfile(window.safeToSpendConfig || {}, monthContext?.monthKey)
                : null;
            const salaryTarget = parseFloat(
                budgetProfile?.budgetSalaryTarget ?? localStorage.getItem('monthly_salary_target') ?? '17600'
            );
            const budgetRule = budgetProfile?.budgetRule || localStorage.getItem('budget_rule') || '50/30/20';

            let weights = { needs: 0.50, wants: 0.30, savings: 0.20 };
            if (budgetRule === '40/30/30') {
                weights = { needs: 0.40, wants: 0.30, savings: 0.30 };
            } else if (budgetRule === '50/20/30') {
                weights = { needs: 0.50, wants: 0.20, savings: 0.30 };
            } else if (budgetRule === 'custom') {
                const customWeights = budgetProfile?.customRuleWeights || {};
                weights = {
                    needs: (parseInt(customWeights.needs ?? localStorage.getItem('custom_rule_needs')) || 50) / 100,
                    wants: (parseInt(customWeights.wants ?? localStorage.getItem('custom_rule_wants')) || 30) / 100,
                    savings: (parseInt(customWeights.savings ?? localStorage.getItem('custom_rule_savings')) || 20) / 100
                };
            }

            let scalingFactor = 1.0;
            if (filterVal === 'today') scalingFactor = 1 / 31;
            else if (filterVal === 'this_week' || filterVal === 'last_week' || filterVal === 'last_7_days') scalingFactor = 7 / 31;
            else if (filterVal === 'first_15' || filterVal === 'last_15') scalingFactor = 15 / 31;
            else if (filterVal === 'last_6_months') scalingFactor = 6;
            else if (filterVal === 'this_year') scalingFactor = 12;

            budgetData.limits = {
                needs: salaryTarget * weights.needs * scalingFactor,
                wants: salaryTarget * weights.wants * scalingFactor,
                savings: salaryTarget * weights.savings * scalingFactor,
                total: salaryTarget * scalingFactor
            };

            // Collect transactions using identical categorization and mapping loops as showBudgetTransactions
            const seenAllTxnKeys = new Set();
            const buckets = ['needs', 'wants', 'savings'];

            buckets.forEach((type) => {
                const seenBudgetTxnKeys = new Set();

                const collectFromBucket = (txns, account) => {
                    (txns || []).forEach((t) => {
                        if (!t || typeof t !== 'object') return;
                        
                        const txnKey = `${account || 'source'}:${t.id || t._id || t.date || t.merchant || t.name || ''}`;
                        if (seenBudgetTxnKeys.has(txnKey)) return;
                        seenBudgetTxnKeys.add(txnKey);

                        if (t.excluded || t.reimbursed || t.refund) return;
                        if (window.checkPeriod && !window.checkPeriod(t, filterVal, 0, referenceDate)) return;

                        const display = window.getMerchantDisplay
                            ? window.getMerchantDisplay(t.name || t.merchant, t)
                            : { name: t.name || t.merchant || '', category: '' };
                        
                        const totalAmt = Math.abs(t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));

                        // Handle Split Logic
                        let effectiveAmt = totalAmt;
                        let isSplit = false;
                        if (t.budgetSplit && (t.budgetSplit.needs > 0 || t.budgetSplit.wants > 0 || t.budgetSplit.savings > 0 || t.budgetSplit.na > 0)) {
                            isSplit = true;
                            effectiveAmt = (type === 'needs' ? (t.budgetSplit.needs || 0) :
                                (type === 'wants' ? (t.budgetSplit.wants || 0) :
                                    (type === 'savings' ? (t.budgetSplit.savings || 0) : 0)));
                            if (effectiveAmt <= 0) return;
                        }

                        let match = false;
                        const manualBudgetCategory = String(t.manualBudgetCategory || '').trim().toLowerCase();
                        const mappedCategory = String(display.category || t.manualCategory || t.category || '').trim().toLowerCase();

                        if (manualBudgetCategory === 'n/a') return;

                        if (window.getTxnBudgetAllocations) {
                            const allocations = window.getTxnBudgetAllocations(t, display);
                            const alloc = allocations.find(a => a.bucket === type);
                            if (alloc) {
                                match = true;
                                effectiveAmt = alloc.amount;
                            }
                        } else {
                            if (isSplit) {
                                match = true;
                            } else if (manualBudgetCategory) {
                                if (manualBudgetCategory === type) match = true;
                            } else if (type === 'needs') {
                                const needsCats = ['education', 'service', 'vehicle', 'transportation', 'travel', 'financial expenses', 'financial expense'];
                                if (needsCats.includes(mappedCategory)) match = true;
                            } else if (type === 'wants') {
                                const wantsCats = ['shopping', 'online shopping', 'food & drinks', 'life & entertainment', 'sport'];
                                if (wantsCats.includes(mappedCategory)) match = true;
                            } else if (type === 'savings') {
                                const savingsCats = ['savings', 'investments'];
                                if (savingsCats.includes(mappedCategory)) match = true;
                            }
                        }

                        if (match) {
                            const dateObj = t.date?.seconds
                                ? new Date(t.date.seconds * 1000)
                                : (typeof t.date === 'string' ? new Date(t.date) : new Date());

                            const structuredTxn = {
                                id: t.id || t._id || String(dateObj.getTime()),
                                name: display?.name || t.name || t.merchant || 'Unknown',
                                category: display?.category || t.category || 'General',
                                amount: effectiveAmt,
                                isExpense: (t.amount || 0) < 0 || t.account === 'budget_manual' || account === 'atome',
                                dateStr: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                                timestamp: dateObj.getTime(),
                                account: account,
                                accountLabel: account === 'budget_manual'
                                    ? 'Wallet'
                                    : (account === 'atome'
                                        ? 'Atome'
                                        : (account === 'bpi'
                                            ? 'BPI'
                                            : 'Wallet')),
                                bucket: type,
                                raw: t,
                                display: display
                            };

                            budgetData.totals[type] += effectiveAmt;
                            budgetData.counts[type] += 1;
                            budgetData.transactions[type].push(structuredTxn);
                            
                            const allTxnKey = `${type}:${txnKey}`;
                            if (!seenAllTxnKeys.has(allTxnKey)) {
                                seenAllTxnKeys.add(allTxnKey);
                                budgetData.transactions.all.push(structuredTxn);
                            }
                        }
                    });
                };

                const collectBucket = (txns, account) => {
                    collectFromBucket(txns, account);
                };

                if (window.walletTxns && typeof window.walletTxns === 'object') {
                    Object.entries(window.walletTxns).forEach(([account, txns]) => {
                        collectBucket(txns, account);
                    });
                }

                if (window.currentAccount && !['atome', 'bpi', 'budget_manual'].includes(window.currentAccount)) {
                    collectBucket(window.allTxns || [], window.currentAccount);
                } else if (!window.walletTxns) {
                    collectBucket(window.allTxns || [], window.currentAccount);
                }

                collectBucket(window.budgetManualTxns || [], 'budget_manual');
            });

            // Calculate combined totals
            budgetData.totals.total = budgetData.totals.needs + budgetData.totals.wants + budgetData.totals.savings;
            budgetData.counts.total = budgetData.transactions.all.length;

            // Sort transaction arrays descending by date/timestamp
            Object.keys(budgetData.transactions).forEach(key => {
                budgetData.transactions[key].sort((a, b) => b.timestamp - a.timestamp);
            });

            // Calculate weekly aggregates for trends line chart
            const trends = {
                all: new Array(5).fill(0),
                needs: new Array(5).fill(0),
                wants: new Array(5).fill(0),
                savings: new Array(5).fill(0)
            };

            budgetData.transactions.all.forEach(t => {
                const dateObj = new Date(t.timestamp);
                const day = dateObj.getDate();
                const weekIdx = Math.floor((day - 1) / 7);
                if (weekIdx >= 0 && weekIdx < 5) {
                    trends.all[weekIdx] += t.amount;
                    if (t.bucket === 'needs') trends.needs[weekIdx] += t.amount;
                    if (t.bucket === 'wants') trends.wants[weekIdx] += t.amount;
                    if (t.bucket === 'savings') trends.savings[weekIdx] += t.amount;
                }
            });
            budgetData.trends = trends;
        } catch (err) {
            console.error('Error during aggregateBudgetAnalysis:', err);
        }
    }

    /**
     * Render the dynamic content inside the overlay
     */
    function renderOverlayContent() {
        try {
            const totalSpent = budgetData.totals.total;
            const needsSpent = budgetData.totals.needs;
            const wantsSpent = budgetData.totals.wants;
            const savingsSpent = budgetData.totals.savings;

            // --- Donut Chart Generation ---
            const donutSvg = document.getElementById('budget-analysis-donut-svg');
            if (donutSvg) {
                const circumference = 2 * Math.PI * 35; // R = 35, C = 219.91
                let html = `<circle cx="50" cy="50" r="35" fill="none" stroke="#f1f5f9" stroke-width="20" opacity="1" class="donut-track" />`;

                const leftColor = document.body.classList.contains('dark-mode') ? '#334155' : '#e2e8f0';
                let segments = [];
                let totalForDonut = 0;

                if (activeFilter === 'all') {
                    const limitTotal = budgetData.limits.needs + budgetData.limits.wants + budgetData.limits.savings;
                    if (totalSpent < limitTotal && limitTotal > 0) {
                        totalForDonut = limitTotal;
                        const left = limitTotal - totalSpent;
                        segments = [
                            { key: 'needs', val: needsSpent, color: COLORS.needs },
                            { key: 'wants', val: wantsSpent, color: COLORS.wants },
                            { key: 'savings', val: savingsSpent, color: COLORS.savings },
                            { key: 'left', val: left, color: leftColor }
                        ];
                    } else {
                        totalForDonut = totalSpent;
                        segments = [
                            { key: 'needs', val: needsSpent, color: COLORS.needs },
                            { key: 'wants', val: wantsSpent, color: COLORS.wants },
                            { key: 'savings', val: savingsSpent, color: COLORS.savings }
                        ];
                    }
                } else {
                    const spent = budgetData.totals[activeFilter];
                    const limit = budgetData.limits[activeFilter];
                    if (spent < limit && limit > 0) {
                        totalForDonut = limit;
                        const left = limit - spent;
                        segments = [
                            { key: activeFilter, val: spent, color: COLORS[activeFilter] },
                            { key: 'left', val: left, color: leftColor }
                        ];
                    } else {
                        totalForDonut = spent;
                        segments = [
                            { key: activeFilter, val: spent, color: COLORS[activeFilter] }
                        ];
                    }
                }

                let offset = 0;
                // Render slices
                segments.forEach((seg) => {
                    if (totalForDonut === 0 || seg.val === 0) return;
                    const pct = seg.val / totalForDonut;
                    const dash = Math.max(1.5, pct * circumference);
                    const strokeDasharray = `${dash} ${circumference}`;
                    const strokeDashoffset = `${-offset}`;
                    offset += dash;

                    const isInactive = activeFilter !== 'all' && seg.key !== 'left' && activeFilter !== seg.key;
                    const isActive = activeFilter === seg.key;

                    const clickHandler = seg.key === 'left' ? '' : `onclick="window.setBudgetAnalysisFilter('${seg.key}')"`;
                    const cursorStyle = seg.key === 'left' ? 'style="cursor: default;"' : '';

                    html += `
                        <circle 
                            class="budget-analysis-donut-slice ${isInactive ? 'inactive' : ''} ${isActive ? 'active' : ''}" 
                            cx="50" 
                            cy="50" 
                            r="35" 
                            fill="none" 
                            stroke="${seg.color}" 
                            stroke-width="20" 
                            stroke-linecap="butt" 
                            stroke-dasharray="${strokeDasharray}" 
                            stroke-dashoffset="${strokeDashoffset}"
                            style="transform-origin: 50px 50px;"
                            ${cursorStyle}
                            ${clickHandler}
                        ></circle>
                    `;
                });
                donutSvg.innerHTML = html;
            }

            // --- Donut Center Text ---
            const labelEl = document.getElementById('budget-analysis-donut-label');
            const amountEl = document.getElementById('budget-analysis-donut-amount');
            const pctEl = document.getElementById('budget-analysis-donut-pct');

            if (labelEl && amountEl && pctEl) {
                if (activeFilter === 'all') {
                    labelEl.innerText = 'TOTAL SPENT';
                    amountEl.innerText = formatPeso(totalSpent);
                    
                    const limitTotal = budgetData.limits.needs + budgetData.limits.wants + budgetData.limits.savings;
                    const combinedPct = limitTotal > 0 ? Math.round((totalSpent / limitTotal) * 100) : 0;
                    const leftVal = limitTotal - totalSpent;
                    
                    let leftText = '';
                    if (limitTotal > 0) {
                        if (leftVal > 0) {
                            leftText = `<br><span style="color: #10b981; font-weight: 800;">Left: ${formatPeso(leftVal)}</span>`;
                        } else if (leftVal < 0) {
                            leftText = `<br><span style="color: #ef4444; font-weight: 800;">Overspent: ${formatPeso(Math.abs(leftVal))}</span>`;
                        } else {
                            leftText = `<br><span style="font-weight: 800; color: #64748b;">Fully Spent</span>`;
                        }
                    }
                    
                    pctEl.innerHTML = `${combinedPct}% of total budget${leftText}`;
                    pctEl.style.color = '#64748b';
                } else {
                    const titleMap = { needs: 'NEEDS', wants: 'WANTS', savings: 'SAVINGS' };
                    const spent = budgetData.totals[activeFilter];
                    const limit = budgetData.limits[activeFilter];
                    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                    const leftVal = limit - spent;
                    
                    let leftText = '';
                    if (limit > 0) {
                        if (activeFilter === 'savings') {
                            if (leftVal > 0) {
                                leftText = `<br><span style="color: #64748b; font-weight: 800;">To Goal: ${formatPeso(leftVal)}</span>`;
                            } else if (leftVal < 0) {
                                leftText = `<br><span style="color: #10b981; font-weight: 800;">Goal Exceeded: +${formatPeso(Math.abs(leftVal))}</span>`;
                            } else {
                                leftText = `<br><span style="color: #10b981; font-weight: 800;">Goal Met</span>`;
                            }
                        } else {
                            if (leftVal > 0) {
                                leftText = `<br><span style="color: #10b981; font-weight: 800;">Left: ${formatPeso(leftVal)}</span>`;
                            } else if (leftVal < 0) {
                                leftText = `<br><span style="color: #ef4444; font-weight: 800;">Overspent: ${formatPeso(Math.abs(leftVal))}</span>`;
                            } else {
                                leftText = `<br><span style="font-weight: 800; color: #64748b;">Fully Spent</span>`;
                            }
                        }
                    }

                    labelEl.innerText = titleMap[activeFilter];
                    amountEl.innerText = formatPeso(spent);
                    pctEl.innerHTML = `${pct}% of limit${leftText}`;
                    pctEl.style.color = COLORS[activeFilter];
                }
            }

            // --- Categories Cards Grid ---
            const renderCard = (id, key, title, accentColor) => {
                const card = document.getElementById(id);
                if (!card) return;

                const spent = budgetData.totals[key];
                const limit = budgetData.limits[key];
                const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                const count = budgetData.counts[key];

                card.style.color = accentColor;
                card.className = `budget-analysis-cat-card ${activeFilter === key ? 'active' : ''}`;
                
                card.innerHTML = `
                    <div class="budget-analysis-cat-header">
                        <span class="budget-analysis-dot" style="background: ${accentColor};"></span>
                        <span class="budget-analysis-cat-title">${title}</span>
                    </div>
                    <div class="budget-analysis-cat-amount">${formatPeso(spent)}</div>
                    <div class="budget-analysis-cat-subtext">${pct}% of ${formatPeso(limit)}</div>
                    <div class="budget-analysis-cat-count">${count} transaction${count === 1 ? '' : 's'}</div>
                `;
            };

            renderCard('analysis-card-needs', 'needs', 'Needs', COLORS.needs);
            renderCard('analysis-card-wants', 'wants', 'Wants', COLORS.wants);
            renderCard('analysis-card-savings', 'savings', 'Savings', COLORS.savings);

            // --- Transaction List Rendering (Matches showBudgetTransactions Row Visuals) ---
            const listEl = document.getElementById('budget-analysis-txn-list');
            const listCountEl = document.getElementById('budget-analysis-txn-count');
            const listTitleEl = document.getElementById('budget-analysis-list-title');

            if (listEl) {
                const txns = budgetData.transactions[activeFilter];
                const count = txns.length;

                if (listCountEl) {
                    listCountEl.innerText = `${count} transaction${count === 1 ? '' : 's'}`;
                }

                if (listTitleEl) {
                    const titleMap = { all: 'All Transactions', needs: 'Needs Details', wants: 'Wants Details', savings: 'Savings Details' };
                    listTitleEl.innerText = titleMap[activeFilter];
                }

                if (count === 0) {
                    listEl.innerHTML = `
                        <div class="budget-analysis-empty">
                            <i class="material-icons">bar_chart</i>
                            <div>No transactions found.</div>
                        </div>
                    `;
                } else {
                    let html = '';
                    txns.forEach((t) => {
                        const isEditable = t.account === 'budget_manual';
                        const displayName = t.display?.name || t.name || 'Unknown';
                        
                        // Determine font size by length safely
                        const nameLen = displayName.length;
                        let fontSize = '11.2px';
                        if (nameLen > 25) fontSize = '9.2px';
                        else if (nameLen > 20) fontSize = '10.2px';

                        // Get logo image
                        const logo = window.detectTxnLogo ? window.detectTxnLogo(displayName) : null;
                        const logoHTML = logo ? `<div class="brand-badge" style="display: ${window.showLogos !== false ? 'flex' : 'none'}"><img src="${logo}" alt="brand"></div>` : '';

                        // Note text and note color logic
                        const isRefund = t.raw?.refund || false;
                        const isReimbursed = t.raw?.reimbursed || false;
                        const budgetNoteColors = {
                            'Online shopping': '#ea580c', 'Vehicle': '#7c3aed', 'Shopping': '#2563eb',
                            'Service': '#c026d3', 'Food & Drinks': '#ca8a04', 'Life & Entertainment': '#059669',
                            'Trading Expenses': '#dc2626', 'Trade Copier': '#0e7490', 'Financial Expenses': '#dc2626',
                            'Transportation': '#7c3aed', 'Education': '#1e3a8a',
                            'Sport': '#059669', 'Savings': '#16a34a', 'Income': '#16a34a',
                            'Financial Expenses': '#ef4444'
                        }; 
                        const txnCategory = t.display?.category || 'General';
                        const noteColor = (txnCategory === 'Savings' || txnCategory === 'Income' || txnCategory === 'Life & Entertainment' || txnCategory === 'Sport') ? '#16a34a' : (isRefund || isReimbursed ? '#f59e0b' : (budgetNoteColors[txnCategory] || '#475569'));

                        let displayNote = t.raw?.note || '';
                        if (!displayNote && txnCategory === 'Vehicle') {
                            displayNote = (t.amount > 250) ? 'Car Refill' : 'Motor Refill';
                        }

                        // Budget dot next to transaction name
                        const dotColor = COLORS[t.bucket] || '#64748b';
                        const dotHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin-left:6px;vertical-align:middle;"></span>`;
                        const txnIcon = t.display?.icon || 'payments';

                        // Generate complete row markup matching showBudgetTransactions exactly
                        html += `
                            <div class="analysis-txn-item" style="display: flex; align-items: center; padding: 12px 16px; padding-right: 20px; background: #ffffff; border-radius: 16px; margin-bottom: 12px; border: 1px solid #f1f5f9; position: relative;">
                                <div class="icon-box ${t.display?.catClass || ''}" style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 14px; flex-shrink: 0; position: relative; overflow: visible;">
                                    <i class="material-icons" style="font-size: 18px;">${txnIcon}</i>
                                    ${logoHTML}
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div class="line-clamp-3" style="font-size: ${fontSize}; font-weight: 800; color: #1e293b; margin-bottom: 1px; letter-spacing: 0.2px; text-transform: uppercase; line-height: 1.3;">
                                        ${displayName} ${dotHTML}
                                    </div>
                                    <div style="font-size: 8px; color: #64748b; font-weight: 700; text-transform: uppercase;">
                                        ${t.dateStr} &bull; ${txnCategory} &bull; ${t.accountLabel}${isEditable ? ' &bull; CASH LOG' : ''}
                                    </div>
                                    ${displayNote ? `<div style="font-size: 8.5px; font-weight: 700; color: ${noteColor}; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${displayNote}</div>` : ''}
                                </div>
                                <div style="text-align: right; display: flex; align-items: center; gap: 8px; margin-left: 12px; flex-shrink: 0;">
                                    <div style="text-align: right;">
                                        <div style="font-size: 12.5px; font-weight: 800; color: #1e293b; white-space: nowrap;">
                                            &#x20B1;${t.amount.toLocaleString()}
                                        </div>
                                    </div>
                                    ${isEditable ? `
                                    <div style="display: flex; padding: 2px; gap: 2px;">
                                        <i class="material-icons" onclick="event.stopPropagation(); window.openBudgetManualEditModal(\`${JSON.stringify({ ...t.raw, name: displayName }).replace(/"/g, '&quot;')}\`)" style="font-size: 16px; color: #3b82f6; cursor: pointer; padding: 4px; margin-right: 2px;">edit</i>
                                        <i class="material-icons" onclick="event.stopPropagation(); window.deleteBudgetManualTxn('${t.id}')" style="font-size: 16px; color: #ef4444; cursor: pointer; padding: 4px;">delete</i>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    });
                    listEl.innerHTML = html;
                }
            }
        } catch (err) {
            console.error('Error during renderOverlayContent:', err);
        }
    }

    /**
     * Filter active category details view
     */
    window.setBudgetAnalysisFilter = function (filter) {
        try {
            if (window.triggerHaptic) window.triggerHaptic('light');

            if (activeFilter === filter) {
                activeFilter = 'all'; // Toggle off back to all
            } else {
                activeFilter = filter;
            }

            renderOverlayContent();
        } catch (err) {
            console.error('Error in setBudgetAnalysisFilter:', err);
        }
    };

    /**
     * Open full screen overlay instantly with slide animation
     */
    window.openBudgetAnalysisOverlay = function () {
        try {
            if (window.triggerHaptic) window.triggerHaptic('medium');

            const overlay = document.getElementById('budget-analysis-overlay');
            if (!overlay) return;

            // Reset filter
            activeFilter = 'all';

            // Load data
            aggregateBudgetAnalysis();
            renderOverlayContent();

            // Reveal overlay
            overlay.style.display = 'flex';
            
            // Force flow restart for animation
            void overlay.offsetHeight;
            overlay.classList.add('show');

            // Disable background scrolling
            document.body.style.overflow = 'hidden';

            // Push state for back button handling
            if (window.NavState && !window.NavState.modalStack.some(m => m.id === 'budget-analysis-overlay')) {
                window.NavState.pushModalState('budget-analysis-overlay', () => window.closeBudgetAnalysisOverlay(true));
            }
        } catch (err) {
            console.error('Error opening budget analysis overlay:', err);
        }
    };

    /**
     * Close full screen overlay with slide down animation
     */
    window.closeBudgetAnalysisOverlay = function (isFromNavState = false) {
        try {
            if (window.triggerHaptic) window.triggerHaptic('light');

            const overlay = document.getElementById('budget-analysis-overlay');
            if (!overlay) return;

            overlay.classList.remove('show');
            document.body.style.overflow = '';

            // pop NavState if not popped yet
            if (!isFromNavState && window.NavState) {
                window.NavState.popModalState('budget-analysis-overlay');
            }

            // Wait for CSS slide down animation to finish before display none
            setTimeout(() => {
                if (!overlay.classList.contains('show')) {
                    overlay.style.display = 'none';
                }
            }, 350);
        } catch (err) {
            console.error('Error closing budget analysis overlay:', err);
        }
    };

    // ESC key closes overlay
    document.addEventListener('keydown', (e) => {
        try {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('budget-analysis-overlay');
                if (overlay && overlay.classList.contains('show')) {
                    window.closeBudgetAnalysisOverlay();
                }
            }
        } catch (err) {
            console.error('Error handling escape key:', err);
        }
    });

    console.log('✅ Wants, Needs, Savings Budget Analysis Module loaded');
})();


