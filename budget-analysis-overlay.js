/**
 * Wants, Needs, and Savings Budget Analysis Overlay JS
 * [CREATED: 2026-07-03]
 * Provides direct values from monthly budget, interactive SVG donut chart, and transaction filtering.
 */

(function () {
    // Module State
    let activeFilter = 'all'; // 'all', 'needs', 'wants', 'savings'
    let currentTimeFilter = 'this_month'; // Track the active time filter
    let selectedPeriodIndex = null; // Track which period segment is selected for filtering
    let transactionLoadLimit = 20; // Number of transactions to load initially
    let transactionsLoaded = 0; // Track how many transactions are currently displayed
    let budgetData = {
        totals: { needs: 0, wants: 0, savings: 0, total: 0 },
        limits: { needs: 0, wants: 0, savings: 0, total: 0 },
        counts: { needs: 0, wants: 0, savings: 0, total: 0 },
        transactions: { all: [], needs: [], wants: [], savings: [] },
        periodSegments: [] // Store period time ranges for click filtering
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
    function aggregateBudgetAnalysis(forceFilterValue = null) {
        try {
            // Use forced filter value if provided, otherwise read from context
            const monthContext = window.getBudgetWidgetMonthContext
                ? window.getBudgetWidgetMonthContext()
                : (window.getDashboardMonthContext ? window.getDashboardMonthContext() : null);
            const filterEl = document.getElementById('chart-filter');
            const filterVal = forceFilterValue || monthContext?.filterValue || (filterEl ? filterEl.value : 'this_month');
            
            // For extended time periods, ALWAYS use current date as reference, not the context date
            const extendedPeriods = ['last_7_days', 'last_3_months', 'last_6_months', 'this_year', 'all_time'];
            const referenceDate = extendedPeriods.includes(filterVal) 
                ? new Date() 
                : (monthContext?.referenceDate ? new Date(monthContext.referenceDate) : new Date());

            console.log('Budget Analysis - Filter:', filterVal, 'Reference Date:', referenceDate, 'Forced:', !!forceFilterValue);

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
            else if (filterVal === 'last_3_months') scalingFactor = 3;
            else if (filterVal === 'last_6_months') scalingFactor = 6;
            else if (filterVal === 'this_year') scalingFactor = 12;
            else if (filterVal === 'all_time') scalingFactor = 12; // Use annual average for all time

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
                        
                        // Parse transaction date properly
                        let txnDate;
                        if (t.date) {
                            if (t.date.seconds) {
                                txnDate = new Date(t.date.seconds * 1000);
                            } else if (t.date instanceof Date) {
                                txnDate = t.date;
                            } else {
                                txnDate = new Date(t.date);
                            }
                        } else {
                            txnDate = new Date();
                        }
                        
                        // Custom period checking for extended time ranges
                        let inPeriod = true;
                        if (filterVal === 'last_7_days') {
                            const sevenDaysAgo = new Date(referenceDate);
                            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                            inPeriod = txnDate >= sevenDaysAgo && txnDate <= referenceDate;
                            if (inPeriod) console.log('Last 7 days match:', t.name, txnDate);
                        } else if (filterVal === 'last_3_months') {
                            const threeMonthsAgo = new Date(referenceDate);
                            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                            inPeriod = txnDate >= threeMonthsAgo && txnDate <= referenceDate;
                            if (inPeriod) console.log('Last 3 months match:', t.name, txnDate);
                        } else if (filterVal === 'last_6_months') {
                            const sixMonthsAgo = new Date(referenceDate);
                            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                            inPeriod = txnDate >= sixMonthsAgo && txnDate <= referenceDate;
                            if (inPeriod) console.log('Last 6 months match:', t.name, txnDate);
                        } else if (filterVal === 'this_year') {
                            const yearStart = new Date(referenceDate.getFullYear(), 0, 1);
                            inPeriod = txnDate >= yearStart && txnDate <= referenceDate;
                            if (inPeriod) console.log('This year match:', t.name, txnDate);
                        } else if (filterVal === 'all_time') {
                            inPeriod = true; // Include all transactions
                        } else {
                            // Use checkPeriod for standard filters
                            inPeriod = !window.checkPeriod || window.checkPeriod(t, filterVal, 0, referenceDate);
                        }
                        
                        if (!inPeriod) return;

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
                            let dateObj;
                            if (t.date) {
                                if (t.date.seconds) {
                                    dateObj = new Date(t.date.seconds * 1000);
                                } else if (t.date instanceof Date) {
                                    dateObj = t.date;
                                } else {
                                    dateObj = new Date(t.date);
                                }
                            } else {
                                dateObj = new Date();
                            }
                            if (isNaN(dateObj.getTime())) {
                                dateObj = new Date();
                            }

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

            // Calculate aggregates for trends line chart based on time period
            // Different periods get different segment types (days, weeks, months)
            
            // Determine number of data points based on time period
            // [FIX: 2026-07-04] - Antigravity
            // Adjusted dynamically calculated points to exclude future weeks/months that haven't passed or been live yet.
            let numPoints = 5; // default
            if (filterVal === 'last_7_days') {
                numPoints = 7;
            } else if (filterVal === 'last_3_months') {
                // Calculate weeks that have started up to referenceDate
                let count = 0;
                const today = new Date(referenceDate);
                for (let m = 2; m >= 0; m--) {
                    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
                    const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
                    for (let weekNum = 1; weekNum <= 4; weekNum++) {
                        const startDay = (weekNum - 1) * 7 + 1;
                        const startTime = new Date(monthDate.getFullYear(), monthDate.getMonth(), startDay, 0, 0, 0).getTime();
                        if (startTime <= referenceDate.getTime()) {
                            count++;
                        }
                    }
                }
                numPoints = count;
            } else if (filterVal === 'last_6_months') {
                numPoints = 6;
            } else if (filterVal === 'this_year') {
                numPoints = referenceDate.getMonth() + 1;
            }

            const trends = {
                all: new Array(numPoints).fill(0),
                needs: new Array(numPoints).fill(0),
                wants: new Array(numPoints).fill(0),
                savings: new Array(numPoints).fill(0)
            };

            // Store labels for the x-axis
            const trendLabels = [];

            if (budgetData.transactions.all.length > 0) {
                // Determine segmentation based on filter type
                if (filterVal === 'last_7_days') {
                    // Last 7 days: show day names starting from Sunday
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const today = new Date(); // Always use current date for last 7 days
                    const last7Days = [];
                    
                    // Find the most recent Sunday
                    const mostRecentSunday = new Date(today);
                    mostRecentSunday.setDate(today.getDate() - today.getDay());
                    
                    // Create 7 days starting from that Sunday
                    for (let i = 0; i < 7; i++) {
                        const d = new Date(mostRecentSunday);
                        d.setDate(mostRecentSunday.getDate() + i);
                        const startTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
                        const endTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
                        
                        last7Days.push({
                            date: d,
                            label: dayNames[d.getDay()],
                            startTime: startTime.getTime(),
                            endTime: endTime.getTime()
                        });
                    }
                    
                    // Use all 7 days
                    for (let i = 0; i < 7; i++) {
                        trendLabels.push(last7Days[i].label);
                    }
                    
                    budgetData.transactions.all.forEach(t => {
                        for (let i = 0; i < 7; i++) {
                            const day = last7Days[i];
                            if (t.timestamp >= day.startTime && t.timestamp <= day.endTime) {
                                trends.all[i] += t.amount;
                                if (t.bucket === 'needs') trends.needs[i] += t.amount;
                                if (t.bucket === 'wants') trends.wants[i] += t.amount;
                                if (t.bucket === 'savings') trends.savings[i] += t.amount;
                                break;
                            }
                        }
                    });
                    
                    // Store period info for click filtering
                    budgetData.periodSegments = last7Days;
                } else if (filterVal === 'last_3_months' || filterVal === 'last_6_months') {
                    // Last 3 Months: show 12 weekly points like "Apr W1", "Apr W2", "May W1"
                    // Last 6 Months: show 6 monthly points like "Jan", "Feb", "Mar", "Apr", "May", "Jun"
                    
                    if (filterVal === 'last_3_months') {
                        // Weekly points for the past 3 months (excluding future weeks of the current month)
                        const monthsBack = 3;
                        const today = new Date(referenceDate);
                        const weeks = [];
                        
                        // Generate week ranges for the past 3 months
                        // [FIX: 2026-07-04] - Antigravity
                        // Modified to only include weeks that have already started/passed up to the current date.
                        for (let m = monthsBack - 1; m >= 0; m--) {
                            const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
                            const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
                            const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
                            
                            // Create 4 weeks per month
                            for (let weekNum = 1; weekNum <= 4; weekNum++) {
                                const startDay = (weekNum - 1) * 7 + 1;
                                const endDay = Math.min(weekNum * 7, lastDay);
                                const startTime = new Date(monthDate.getFullYear(), monthDate.getMonth(), startDay, 0, 0, 0).getTime();
                                const endTime = new Date(monthDate.getFullYear(), monthDate.getMonth(), endDay, 23, 59, 59).getTime();
                                
                                if (startTime <= referenceDate.getTime()) {
                                    weeks.push({
                                        label: `${monthName} W${weekNum}`,
                                        startTime: startTime,
                                        endTime: endTime
                                    });
                                }
                            }
                        }
                        
                        // Fill points
                        for (let i = 0; i < weeks.length; i++) {
                            trendLabels.push(weeks[i].label);
                            
                            budgetData.transactions.all.forEach(t => {
                                if (t.timestamp >= weeks[i].startTime && t.timestamp <= weeks[i].endTime) {
                                    trends.all[i] += t.amount;
                                    if (t.bucket === 'needs') trends.needs[i] += t.amount;
                                    if (t.bucket === 'wants') trends.wants[i] += t.amount;
                                    if (t.bucket === 'savings') trends.savings[i] += t.amount;
                                }
                            });
                        }
                        
                        // Store period info for click filtering
                        budgetData.periodSegments = weeks;
                    } else {
                        // 6 monthly points for 6 months
                        const monthsBack = 6;
                        const today = new Date(referenceDate);
                        const months = [];
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        
                        for (let m = monthsBack - 1; m >= 0; m--) {
                            const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
                            months.push({
                                label: monthNames[monthDate.getMonth()],
                                startTime: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0).getTime(),
                                endTime: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59).getTime()
                            });
                        }
                        
                        // Fill all 6 points
                        for (let i = 0; i < 6 && i < months.length; i++) {
                            trendLabels.push(months[i].label);
                            
                            budgetData.transactions.all.forEach(t => {
                                if (t.timestamp >= months[i].startTime && t.timestamp <= months[i].endTime) {
                                    trends.all[i] += t.amount;
                                    if (t.bucket === 'needs') trends.needs[i] += t.amount;
                                    if (t.bucket === 'wants') trends.wants[i] += t.amount;
                                    if (t.bucket === 'savings') trends.savings[i] += t.amount;
                                }
                            });
                        }
                        
                        // Store period info for click filtering
                        budgetData.periodSegments = months;
                    }
                } else if (filterVal === 'this_year' || filterVal === 'all_time') {
                    // Entire Year: show 12 monthly points (Jan-Dec)
                    // Entire Lifetime: show quarterly increments (Q1 2024, Q2 2024, etc.)
                    
                    if (filterVal === 'this_year') {
                        // Monthly points for the current year up to the current month
                        // [FIX: 2026-07-04] - Antigravity
                        // Modified to exclude future months that haven't been live yet.
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const currentYear = referenceDate.getFullYear();
                        const currentMonthIdx = referenceDate.getMonth();
                        const months = [];
                        
                        for (let month = 0; month <= currentMonthIdx; month++) {
                            const startTime = new Date(currentYear, month, 1, 0, 0, 0).getTime();
                            const endTime = new Date(currentYear, month + 1, 0, 23, 59, 59).getTime();
                            
                            months.push({
                                label: monthNames[month],
                                startTime: startTime,
                                endTime: endTime
                            });
                            
                            trendLabels.push(monthNames[month]);
                            
                            budgetData.transactions.all.forEach(t => {
                                if (t.timestamp >= startTime && t.timestamp <= endTime) {
                                    trends.all[month] += t.amount;
                                    if (t.bucket === 'needs') trends.needs[month] += t.amount;
                                    if (t.bucket === 'wants') trends.wants[month] += t.amount;
                                    if (t.bucket === 'savings') trends.savings[month] += t.amount;
                                }
                            });
                        }
                        
                        // Store period info for click filtering
                        budgetData.periodSegments = months;
                    } else {
                        // Quarterly increments for all time - START FROM EARLIEST TRANSACTION EVER DETECTED
                        // [FIX: 2026-07-04] - Antigravity
                        // Modified to search across all raw transactions (all accounts) to find the absolute earliest transaction.
                        let earliestTimestamp = null;
                        const findEarliest = (t) => {
                            if (!t) return;
                            let dObj;
                            if (t.date) {
                                if (t.date.seconds) dObj = new Date(t.date.seconds * 1000);
                                else if (t.date instanceof Date) dObj = t.date;
                                else dObj = new Date(t.date);
                            }
                            if (dObj && !isNaN(dObj.getTime())) {
                                const ts = dObj.getTime();
                                if (earliestTimestamp === null || ts < earliestTimestamp) {
                                    earliestTimestamp = ts;
                                }
                            }
                        };
                        
                        if (window.walletTxns && typeof window.walletTxns === 'object') {
                            Object.values(window.walletTxns).forEach(txns => {
                                (txns || []).forEach(findEarliest);
                            });
                        }
                        if (Array.isArray(window.allTxns)) {
                            window.allTxns.forEach(findEarliest);
                        }
                        if (Array.isArray(window.budgetManualTxns)) {
                            window.budgetManualTxns.forEach(findEarliest);
                        }
                        
                        // Fallback to budgetData.transactions.all if needed
                        const sortedTxns = [...budgetData.transactions.all].sort((a, b) => a.timestamp - b.timestamp);
                        if (earliestTimestamp === null && sortedTxns.length > 0) {
                            earliestTimestamp = sortedTxns[0].timestamp;
                        }
                        
                        if (earliestTimestamp !== null) {
                            const minDate = new Date(earliestTimestamp);
                            const maxDate = new Date(); // Use current date as end point
                            
                            const quarters = [];
                            let currentDate = new Date(minDate.getFullYear(), Math.floor(minDate.getMonth() / 3) * 3, 1);
                            const endDate = new Date(maxDate.getFullYear(), Math.floor(maxDate.getMonth() / 3) * 3, 1);
                            
                            while (currentDate <= endDate) {
                                const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
                                quarters.push({
                                    label: `Q${quarter} ${currentDate.getFullYear()}`,
                                    startTime: new Date(currentDate.getFullYear(), (quarter - 1) * 3, 1, 0, 0, 0).getTime(),
                                    endTime: new Date(currentDate.getFullYear(), quarter * 3, 0, 23, 59, 59).getTime()
                                });
                                currentDate.setMonth(currentDate.getMonth() + 3);
                            }
                            
                            // Distribute quarters evenly into 5 segments (or use all if ≤5)
                            if (quarters.length <= 5) {
                                // Resize trend arrays to match quarters length
                                numPoints = quarters.length;
                                trends.all = new Array(numPoints).fill(0);
                                trends.needs = new Array(numPoints).fill(0);
                                trends.wants = new Array(numPoints).fill(0);
                                trends.savings = new Array(numPoints).fill(0);
                                
                                for (let i = 0; i < quarters.length; i++) {
                                    trendLabels.push(quarters[i].label);
                                    
                                    budgetData.transactions.all.forEach(t => {
                                        if (t.timestamp >= quarters[i].startTime && t.timestamp <= quarters[i].endTime) {
                                            trends.all[i] += t.amount;
                                            if (t.bucket === 'needs') trends.needs[i] += t.amount;
                                            if (t.bucket === 'wants') trends.wants[i] += t.amount;
                                            if (t.bucket === 'savings') trends.savings[i] += t.amount;
                                        }
                                    });
                                }
                                // Store period info for click filtering
                                budgetData.periodSegments = quarters;
                            } else {
                                const segmentSize = Math.ceil(quarters.length / 5);
                                const aggregatedSegments = [];
                                
                                for (let i = 0; i < 5; i++) {
                                    const startIdx = i * segmentSize;
                                    const endIdx = Math.min((i + 1) * segmentSize, quarters.length);
                                    
                                    if (startIdx < quarters.length) {
                                        trendLabels.push(quarters[startIdx].label);
                                        
                                        const segmentStart = quarters[startIdx].startTime;
                                        const segmentEnd = quarters[endIdx - 1].endTime;
                                        
                                        aggregatedSegments.push({
                                            label: quarters[startIdx].label,
                                            startTime: segmentStart,
                                            endTime: segmentEnd
                                        });
                                        
                                        budgetData.transactions.all.forEach(t => {
                                            if (t.timestamp >= segmentStart && t.timestamp <= segmentEnd) {
                                                trends.all[i] += t.amount;
                                                if (t.bucket === 'needs') trends.needs[i] += t.amount;
                                                if (t.bucket === 'wants') trends.wants[i] += t.amount;
                                                if (t.bucket === 'savings') trends.savings[i] += t.amount;
                                            }
                                        });
                                    }
                                }
                                
                                // Store period info for click filtering
                                budgetData.periodSegments = aggregatedSegments;
                            }
                        }
                    }
                } else {
                    // Default: This Month and specific months - show weeks (W1-W5)
                    const sortedTxns = [...budgetData.transactions.all].sort((a, b) => a.timestamp - b.timestamp);
                    
                    if (sortedTxns.length > 0) {
                        const minTime = sortedTxns[0].timestamp;
                        const maxTime = sortedTxns[sortedTxns.length - 1].timestamp;
                        const timeRange = maxTime - minTime;
                        const segmentDuration = timeRange / 5;

                        // Store period segments for click filtering
                        const weekSegments = [];
                        
                        for (let i = 0; i < 5; i++) {
                            trendLabels.push(`W${i + 1}`);
                            
                            // Calculate time range for this week segment
                            const segmentStart = minTime + (segmentDuration * i);
                            const segmentEnd = (i === 4) ? maxTime : (minTime + (segmentDuration * (i + 1)) - 1);
                            
                            weekSegments.push({
                                label: `W${i + 1}`,
                                startTime: segmentStart,
                                endTime: segmentEnd
                            });
                        }
                        
                        // Store period info for click filtering
                        budgetData.periodSegments = weekSegments;

                        budgetData.transactions.all.forEach(t => {
                            const segmentIdx = Math.min(4, Math.floor((t.timestamp - minTime) / segmentDuration));
                            
                            if (segmentIdx >= 0 && segmentIdx < 5) {
                                trends.all[segmentIdx] += t.amount;
                                if (t.bucket === 'needs') trends.needs[segmentIdx] += t.amount;
                                if (t.bucket === 'wants') trends.wants[segmentIdx] += t.amount;
                                if (t.bucket === 'savings') trends.savings[segmentIdx] += t.amount;
                            }
                        });
                    } else {
                        // No transactions, just set default labels
                        for (let i = 0; i < 5; i++) {
                            trendLabels.push(`W${i + 1}`);
                        }
                        budgetData.periodSegments = [];
                    }
                }
            }
            
            budgetData.trends = trends;
            budgetData.trendLabels = trendLabels.length > 0 ? trendLabels : ['W1', 'W2', 'W3', 'W4', 'W5'];
            
            console.log('Budget Analysis Complete:', {
                filter: filterVal,
                totalTransactions: budgetData.transactions.all.length,
                totals: budgetData.totals,
                trends: budgetData.trends,
                labels: budgetData.trendLabels
            });
        } catch (err) {
            console.error('Error during aggregateBudgetAnalysis:', err);
        }
    }

    /**
     * Render the dynamic content inside the overlay
     */
    function renderOverlayContent(forceFilterValue = null) {
        try {
            // Use forced filter value if provided, otherwise use stored value
            const filterVal = forceFilterValue || currentTimeFilter;
            
            // --- Sync Trend Time Dropdown ---
            const trendTimeDropdown = document.getElementById('trend-time-dropdown');
            if (trendTimeDropdown) {
                if (trendTimeDropdown.children.length === 0) {
                    let html = `<option value="this_month">This Month</option>`;
                    
                    // Generate dynamic previous 3 months after "This Month"
                    const today = new Date();
                    for (let i = 1; i <= 3; i++) {
                        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                        html += `<option value="${key}">${label}</option>`;
                    }

                    html += `
                        <option value="last_7_days">Last 7 Days</option>
                        <option value="last_3_months">Last 3 Months</option>
                        <option value="last_6_months">Last 6 Months</option>
                        <option value="this_year">Entire Year</option>
                        <option value="all_time">Entire Lifetime</option>
                    `;
                    trendTimeDropdown.innerHTML = html;
                }
                trendTimeDropdown.value = filterVal;
            }

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
            
            // Hide grid cards for extended time periods
            const gridEl = document.querySelector('.budget-analysis-grid');
            const extendedPeriodsForGrid = ['last_7_days', 'last_3_months', 'last_6_months', 'this_year', 'all_time'];
            const isExtendedPeriodForGrid = extendedPeriodsForGrid.includes(filterVal);
            
            if (gridEl) {
                gridEl.style.display = isExtendedPeriodForGrid ? 'none' : 'grid';
            }

            // --- Transaction List Rendering with Lazy Loading ---
            const txnsSection = document.getElementById('budget-analysis-txns-section');
            
            // Show transactions section for extended time periods when a period is selected
            const extendedPeriods = ['last_7_days', 'last_3_months', 'last_6_months', 'this_year', 'all_time'];
            const isExtendedPeriod = extendedPeriods.includes(filterVal);
            
            if (txnsSection) {
                // Show if not extended period, OR if extended period and a specific period is selected
                txnsSection.style.display = (!isExtendedPeriod || selectedPeriodIndex !== null) ? 'flex' : 'none';
            }

            // Render transaction list with lazy loading
            renderTransactionList();
            
            // --- Render Trend Line Chart ---
            renderTrendChart();

        } catch (err) {
            console.error('Error during renderOverlayContent:', err);
        }
    }

    /**
     * Render transaction list with lazy loading (20 items at a time)
     */
    function renderTransactionList() {
        const listEl = document.getElementById('budget-analysis-txn-list');
        const listCountEl = document.getElementById('budget-analysis-txn-count');
        const listTitleEl = document.getElementById('budget-analysis-list-title');
        
        if (!listEl) return;
        
        // Get transactions based on activeTrendFilter (the line chart filter - needs/wants/savings/all)
        let txns = budgetData.transactions[activeTrendFilter] || [];
        
        // Filter by selected period if a chart point was clicked
        if (selectedPeriodIndex !== null && budgetData.periodSegments && budgetData.periodSegments[selectedPeriodIndex]) {
            const segment = budgetData.periodSegments[selectedPeriodIndex];
            txns = txns.filter(t => t.timestamp >= segment.startTime && t.timestamp <= segment.endTime);
        }
        
        const totalCount = txns.length;
        
        // Update count label
        if (listCountEl) {
            const periodLabel = selectedPeriodIndex !== null && budgetData.trendLabels && budgetData.trendLabels[selectedPeriodIndex]
                ? ` (${budgetData.trendLabels[selectedPeriodIndex]})`
                : '';
            listCountEl.innerText = `${totalCount} transaction${totalCount === 1 ? '' : 's'}${periodLabel}`;
        }
        
        // Update title
        if (listTitleEl) {
            const titleMap = { all: 'All Transactions', needs: 'Needs Details', wants: 'Wants Details', savings: 'Savings Details' };
            listTitleEl.innerText = titleMap[activeTrendFilter] || 'All Transactions';
        }
        
        // Empty state
        if (totalCount === 0) {
            listEl.innerHTML = `
                <div class="budget-analysis-empty">
                    <i class="material-icons">bar_chart</i>
                    <div>No transactions found.</div>
                </div>
            `;
            transactionsLoaded = 0;
            return;
        }
        
        // Load initial 20 transactions
        transactionsLoaded = Math.min(transactionLoadLimit, totalCount);
        
        let html = '';
        const txnsToShow = txns.slice(0, transactionsLoaded);
        
        txnsToShow.forEach((t) => {
            const isEditable = t.account === 'budget_manual';
            const displayName = t.display?.name || t.name || 'Unknown';
            
            // Determine font size by length
            const nameLen = displayName.length;
            let fontSize = '11.2px';
            if (nameLen > 25) fontSize = '9.2px';
            else if (nameLen > 20) fontSize = '10.2px';

            // Get logo
            const logo = window.detectTxnLogo ? window.detectTxnLogo(displayName) : null;
            const logoHTML = logo ? `<div class="brand-badge" style="display: ${window.showLogos !== false ? 'flex' : 'none'}"><img src="${logo}" alt="brand"></div>` : '';

            // Category colors and notes
            const isRefund = t.raw?.refund || false;
            const isReimbursed = t.raw?.reimbursed || false;
            const txnCategory = t.display?.category || t.category || 'General';
            
            const budgetNoteColors = {
                'Online shopping': '#ea580c', 'Vehicle': '#7c3aed', 'Shopping': '#2563eb',
                'Service': '#c026d3', 'Food & Drinks': '#ca8a04', 'Life & Entertainment': '#059669',
                'Trading Expenses': '#dc2626', 'Trade Copier': '#0e7490', 'Financial Expenses': '#ef4444',
                'Transportation': '#7c3aed', 'Education': '#1e3a8a', 'Sport': '#059669',
                'Savings': '#16a34a', 'Income': '#16a34a'
            };
            
            const noteColor = (txnCategory === 'Savings' || txnCategory === 'Income' || txnCategory === 'Life & Entertainment' || txnCategory === 'Sport') 
                ? '#16a34a' 
                : (isRefund || isReimbursed ? '#f59e0b' : (budgetNoteColors[txnCategory] || '#475569'));

            let displayNote = t.raw?.note || '';
            if (!displayNote && txnCategory === 'Vehicle') {
                displayNote = (t.amount > 250) ? 'Car Refill' : 'Motor Refill';
            }

            // Budget category dot color (blue/gold/green)
            const dotColor = COLORS[t.bucket] || '#64748b';
            const txnIcon = t.display?.icon || 'payments';

            html += `
                <div class="analysis-txn-item" style="display: flex; align-items: center; padding: 12px 16px; padding-right: 20px; background: #ffffff; border-radius: 16px; margin-bottom: 12px; border: 1px solid #f1f5f9; position: relative;">
                    <div class="icon-box ${t.display?.catClass || ''}" style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 14px; flex-shrink: 0; position: relative; overflow: visible;">
                        <i class="material-icons" style="font-size: 18px;">${txnIcon}</i>
                        ${logoHTML}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div class="line-clamp-3" style="font-size: ${fontSize}; font-weight: 800; color: #1e293b; margin-bottom: 1px; letter-spacing: 0.2px; text-transform: uppercase; line-height: 1.3;">
                            ${displayName}
                        </div>
                        <div style="font-size: 8px; color: #64748b; font-weight: 700; text-transform: uppercase;">
                            ${t.dateStr} &bull; ${txnCategory} &bull; ${t.accountLabel}${isEditable ? ' &bull; CASH LOG' : ''} <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin-left:4px;vertical-align:middle;"></span>
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
        
        // Add load more button if there are more transactions
        if (transactionsLoaded < totalCount) {
            html += `
                <button id="load-more-btn" onclick="window.loadMoreTransactions()" style="width: 100%; padding: 14px; margin-top: 12px; background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 16px; color: #64748b; font-size: 12px; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s;">
                    Load More (${totalCount - transactionsLoaded} remaining)
                </button>
            `;
        }
        
        listEl.innerHTML = html;
        
        // Store for lazy loading
        listEl.dataset.allTxns = JSON.stringify(txns);
        listEl.dataset.totalCount = totalCount;
    }
    
    /**
     * Load more transactions button handler
     */
    window.loadMoreTransactions = function() {
        const listEl = document.getElementById('budget-analysis-txn-list');
        if (!listEl || !listEl.dataset.allTxns) return;
        
        const allTxns = JSON.parse(listEl.dataset.allTxns);
        const totalCount = parseInt(listEl.dataset.totalCount);
        
        if (transactionsLoaded >= totalCount) return;
        
        // Load 20 more transactions
        const newLimit = Math.min(transactionsLoaded + 20, totalCount);
        const newTxns = allTxns.slice(transactionsLoaded, newLimit);
        
        if (newTxns.length > 0) {
            const loadMoreBtn = document.getElementById('load-more-btn');
            
            // Remove load more button
            if (loadMoreBtn) {
                loadMoreBtn.remove();
            }
            
            // Append new transactions
            let html = '';
            newTxns.forEach(t => {
                const isEditable = t.account === 'budget_manual';
                const displayName = t.display?.name || t.name || 'Unknown';
                
                const nameLen = displayName.length;
                let fontSize = '11.2px';
                if (nameLen > 25) fontSize = '9.2px';
                else if (nameLen > 20) fontSize = '10.2px';

                const logo = window.detectTxnLogo ? window.detectTxnLogo(displayName) : null;
                const logoHTML = logo ? `<div class="brand-badge" style="display: ${window.showLogos !== false ? 'flex' : 'none'}"><img src="${logo}" alt="brand"></div>` : '';

                const isRefund = t.raw?.refund || false;
                const isReimbursed = t.raw?.reimbursed || false;
                const txnCategory = t.display?.category || t.category || 'General';
                
                const budgetNoteColors = {
                    'Online shopping': '#ea580c', 'Vehicle': '#7c3aed', 'Shopping': '#2563eb',
                    'Service': '#c026d3', 'Food & Drinks': '#ca8a04', 'Life & Entertainment': '#059669',
                    'Trading Expenses': '#dc2626', 'Trade Copier': '#0e7490', 'Financial Expenses': '#ef4444',
                    'Transportation': '#7c3aed', 'Education': '#1e3a8a', 'Sport': '#059669',
                    'Savings': '#16a34a', 'Income': '#16a34a'
                };
                
                const noteColor = (txnCategory === 'Savings' || txnCategory === 'Income' || txnCategory === 'Life & Entertainment' || txnCategory === 'Sport') 
                    ? '#16a34a' 
                    : (isRefund || isReimbursed ? '#f59e0b' : (budgetNoteColors[txnCategory] || '#475569'));

                let displayNote = t.raw?.note || '';
                if (!displayNote && txnCategory === 'Vehicle') {
                    displayNote = (t.amount > 250) ? 'Car Refill' : 'Motor Refill';
                }

                // Budget category dot color (blue/gold/green)
                const dotColor = COLORS[t.bucket] || '#64748b';
                const txnIcon = t.display?.icon || 'payments';

                html += `
                    <div class="analysis-txn-item" style="display: flex; align-items: center; padding: 12px 16px; padding-right: 20px; background: #ffffff; border-radius: 16px; margin-bottom: 12px; border: 1px solid #f1f5f9; position: relative;">
                        <div class="icon-box ${t.display?.catClass || ''}" style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 14px; flex-shrink: 0; position: relative; overflow: visible;">
                            <i class="material-icons" style="font-size: 18px;">${txnIcon}</i>
                            ${logoHTML}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div class="line-clamp-3" style="font-size: ${fontSize}; font-weight: 800; color: #1e293b; margin-bottom: 1px; letter-spacing: 0.2px; text-transform: uppercase; line-height: 1.3;">
                                ${displayName}
                            </div>
                            <div style="font-size: 8px; color: #64748b; font-weight: 700; text-transform: uppercase;">
                                ${t.dateStr} &bull; ${txnCategory} &bull; ${t.accountLabel}${isEditable ? ' &bull; CASH LOG' : ''} <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};margin-left:4px;vertical-align:middle;"></span>
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
            
            // Add load more button again if needed
            if (newLimit < totalCount) {
                html += `
                    <button id="load-more-btn" onclick="window.loadMoreTransactions()" style="width: 100%; padding: 14px; margin-top: 12px; background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 16px; color: #64748b; font-size: 12px; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s;">
                        Load More (${totalCount - newLimit} remaining)
                    </button>
                `;
            }
            
            listEl.insertAdjacentHTML('beforeend', html);
            transactionsLoaded = newLimit;
            
            console.log(`Loaded ${newTxns.length} more transactions (${transactionsLoaded}/${totalCount})`);
        }
    };

    /**
     * Setup lazy loading scroll listener (now disabled in favor of Load More button)
     */
    function setupLazyLoading() {
        // No longer needed - using button instead
    }
    
    /**
     * Handle scroll for lazy loading (now disabled)
     */
    function handleLazyScroll(e) {
        // No longer needed - using button instead
    }

    /**
     * Filter transactions by selected period from line chart click
     * If periodIndex is null, show all transactions (deselected state)
     * Also filters by activeTrendFilter (needs/wants/savings/all)
     */
    function filterTransactionsByPeriod(periodIndex) {
        selectedPeriodIndex = periodIndex;
        renderTransactionList();
        
        // Also update transaction section visibility
        const txnsSection = document.getElementById('budget-analysis-txns-section');
        const extendedPeriods = ['last_7_days', 'last_3_months', 'last_6_months', 'this_year', 'all_time'];
        const isExtendedPeriod = extendedPeriods.includes(currentTimeFilter);
        
        if (txnsSection) {
            // Show if not extended period, OR if extended period and a specific period is selected
            txnsSection.style.display = (!isExtendedPeriod || selectedPeriodIndex !== null) ? 'flex' : 'none';
        }
    }

    // --- Trend Line Chart State ---
    let activeTrendFilter = 'all';
    let showAllAsTotal = false; // Toggle between 3 lines or single black line for "all"
    let lastTapTime = 0; // For double-tap detection
    let lastTappedIndex = null; // Track which index was last tapped

    /**
     * [ADD: 2026-07-03] Render the weekly spending trend line chart with smooth curves - Antigravity
     * Draws SVG paths for the selected filter with Y-axis labels, grid lines, and interactive dots
     */
    function renderTrendChart() {
        const svg = document.getElementById('budget-analysis-line-svg');
        const yAxis = document.getElementById('trend-y-axis');
        const totalLabel = document.getElementById('trend-total-label');
        const totalValue = document.getElementById('trend-total-value');
        const xAxisLabels = document.getElementById('trend-x-axis-labels');
        
        if (!svg || !budgetData.trends) {
            console.warn('renderTrendChart: Missing SVG or trends data');
            return;
        }

        const TREND_COLORS = {
            all: '#0f172a',
            needs: '#3b82f6',
            wants: '#f59e0b',
            savings: '#10b981'
        };

        const trends = budgetData.trends;
        const filter = activeTrendFilter;

        // Ensure all trend arrays exist and have correct length
        if (!trends.all || !trends.needs || !trends.wants || !trends.savings) {
            console.warn('renderTrendChart: Invalid trends data structure');
            return;
        }

        // Determine which series to draw
        const seriesToDraw = filter === 'all'
            ? (showAllAsTotal 
                ? [{ key: 'all', data: trends.all, color: TREND_COLORS.all, width: 3 }]
                : [
                    { key: 'needs', data: trends.needs, color: TREND_COLORS.needs, width: 3 },
                    { key: 'wants', data: trends.wants, color: TREND_COLORS.wants, width: 3 },
                    { key: 'savings', data: trends.savings, color: TREND_COLORS.savings, width: 3 }
                  ])
            : [{ key: filter, data: trends[filter], color: TREND_COLORS[filter], width: 3 }];

        // Calculate max across all visible series
        let globalMax = 500;
        seriesToDraw.forEach(s => {
            const sMax = Math.max(...s.data);
            if (sMax > globalMax) globalMax = sMax;
        });
        globalMax = globalMax * 1.2; // 20% headroom

        // Clear SVG dynamic elements
        const gridGroup = document.getElementById('trend-grid-lines');
        const pointsGroup = document.getElementById('trend-points-group');
        if (gridGroup) gridGroup.innerHTML = '';
        if (pointsGroup) pointsGroup.innerHTML = '';

        // Remove old dynamic paths
        svg.querySelectorAll('.trend-dynamic-path, .trend-dynamic-area').forEach(el => el.remove());

        const viewW = 320, viewH = 135, bottomPad = 20, topPad = 10;
        const chartH = viewH - bottomPad - topPad;
        const numWeeks = budgetData.trendLabels ? budgetData.trendLabels.length : 5;
        const padX = 10;
        const step = (viewW - padX * 2) / (numWeeks - 1);

        // Draw horizontal grid lines (4 lines)
        if (gridGroup) {
            for (let i = 0; i <= 3; i++) {
                const y = topPad + (chartH / 3) * i;
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', padX);
                line.setAttribute('x2', viewW - padX);
                line.setAttribute('y1', y);
                line.setAttribute('y2', y);
                line.setAttribute('stroke', '#e2e8f0');
                line.setAttribute('stroke-width', '0.5');
                line.setAttribute('stroke-dasharray', '4 3');
                gridGroup.appendChild(line);
            }
        }

        // Y-Axis labels
        if (yAxis) {
            yAxis.innerHTML = '';
            for (let i = 0; i <= 3; i++) {
                const val = globalMax - (globalMax / 3) * i;
                const span = document.createElement('span');
                if (val >= 1000) {
                    span.textContent = (val / 1000).toFixed(1) + 'k';
                } else {
                    span.textContent = Math.round(val).toLocaleString();
                }
                yAxis.appendChild(span);
            }
        }

        // Helper to build smooth cubic bezier path
        function buildSmoothPath(data) {
            const points = [];
            for (let i = 0; i < numWeeks; i++) {
                const x = padX + i * step;
                const y = topPad + chartH - (data[i] / globalMax) * chartH;
                points.push({ x, y });
            }

            if (points.length < 2) return { line: '', area: '', points };

            let d = `M ${points[0].x} ${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
                const cpy1 = prev.y;
                const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
                const cpy2 = curr.y;
                d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
            }

            const areaD = d + ` L ${points[points.length - 1].x} ${viewH - bottomPad} L ${points[0].x} ${viewH - bottomPad} Z`;
            return { line: d, area: areaD, points };
        }

        // Store all series data for later hit area creation
        const allSeriesData = [];
        
        // Draw each series (lines and areas)
        seriesToDraw.forEach(series => {
            const { line, area, points } = buildSmoothPath(series.data);
            
            // Store for hit area creation later
            allSeriesData.push({ series, points });

            // Area fill (only when single series is active, not for 'all' multi-line view)
            if ((filter !== 'all' && series.key === filter) || (filter === 'all' && showAllAsTotal && series.key === 'all')) {
                const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                areaPath.setAttribute('d', area);
                areaPath.setAttribute('fill', `url(#trend-grad-${series.key})`);
                areaPath.classList.add('trend-dynamic-area');
                areaPath.style.opacity = '1';
                // Insert before points group
                svg.insertBefore(areaPath, pointsGroup);
            }

            // Line path
            const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            linePath.setAttribute('d', line);
            linePath.setAttribute('fill', 'none');
            linePath.setAttribute('stroke', series.color);
            linePath.setAttribute('stroke-width', series.width);
            linePath.setAttribute('stroke-linecap', 'round');
            linePath.setAttribute('stroke-linejoin', 'round');
            linePath.classList.add('trend-dynamic-path');
            linePath.style.opacity = '1';
            svg.insertBefore(linePath, pointsGroup);
        });
        
        // Draw selection indicator dots if a period is selected
        if (selectedPeriodIndex !== null) {
            allSeriesData.forEach(({ series, points }) => {
                if (points[selectedPeriodIndex]) {
                    const pt = points[selectedPeriodIndex];
                    
                    // [FIX: 2026-07-04] - Antigravity
                    // Labeled the dynamic outerRing and innerDot SVG elements with additional specific classes for clarity and trackability.
                    // Draw white outer ring
                    const outerRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    outerRing.setAttribute('cx', pt.x);
                    outerRing.setAttribute('cy', pt.y);
                    outerRing.setAttribute('r', '6');
                    outerRing.setAttribute('fill', '#ffffff');
                    outerRing.setAttribute('stroke', 'none');
                    outerRing.classList.add('trend-selection-indicator', 'trend-selection-indicator-outer');
                    pointsGroup.appendChild(outerRing);
                    
                    // Draw colored inner dot
                    const innerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    innerDot.setAttribute('cx', pt.x);
                    innerDot.setAttribute('cy', pt.y);
                    innerDot.setAttribute('r', '4');
                    innerDot.setAttribute('fill', series.color);
                    innerDot.setAttribute('stroke', 'none');
                    innerDot.classList.add('trend-selection-indicator', 'trend-selection-indicator-inner');
                    pointsGroup.appendChild(innerDot);
                }
            });
        }
        
        // Create hit areas in REVERSE order so topmost line (needs) gets priority over lower lines
        // This prevents savings from stealing clicks when all 3 lines are shown
        const reversedSeriesData = [...allSeriesData].reverse();
        
        // Track which columns already have hit areas to prevent duplicates
        const columnsWithHitAreas = new Set();
        
        // Calculate proper column widths to cover entire chart with no gaps
        const chartWidth = viewW - padX * 2; // Total usable width
        const columnWidth = chartWidth / numWeeks; // Divide evenly among all weeks
        
        reversedSeriesData.forEach(({ series, points }) => {
            points.forEach((pt, idx) => {
                // Create unique key for this column to prevent duplicate hit areas
                const columnKey = `col-${idx}`;
                
                // Skip if this column already has a hit area (prevents flickering from overlapping handlers)
                if (columnsWithHitAreas.has(columnKey)) {
                    return;
                }
                columnsWithHitAreas.add(columnKey);
                
                // Calculate column boundaries to cover entire space with NO GAPS
                // Each column starts at its proportional position and extends to fill the space
                const columnStart = padX + (idx * columnWidth);
                
                // [LABEL: 2026-07-04] - Antigravity
                // Labeled the dynamic week hit-area rect element with 'trend-chart-week-hit-area' class for easier reference/debugging.
                const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                hitArea.classList.add('trend-chart-week-hit-area');
                hitArea.setAttribute('x', columnStart);
                hitArea.setAttribute('y', 0); // Full height from very top
                hitArea.setAttribute('width', columnWidth);
                hitArea.setAttribute('height', viewH); // Entire SVG height
                hitArea.setAttribute('fill', 'transparent');
                hitArea.style.cursor = 'pointer';
                
                // Debug: Uncomment to see clickable areas
                // hitArea.setAttribute('fill', 'rgba(255,0,0,0.1)');
                // hitArea.setAttribute('stroke', 'red');
                // hitArea.setAttribute('stroke-width', '1');
                
                // Add dataset to track which series this belongs to
                hitArea.dataset.seriesKey = series.key;
                hitArea.dataset.periodIdx = idx;

                hitArea.addEventListener('mouseenter', () => {
                    if (!tooltipPersistent && !isDragging) {
                        showTrendTooltip(pt.x, pt.y, series.data[idx], idx, series.color);
                    }
                });
                hitArea.addEventListener('mouseleave', () => {
                    if (!isDragging) {
                        hideTrendTooltip();
                    }
                });

                // Track dragging and selection state for this column hit area
                let startX = 0;
                let startY = 0;
                let isDragging = false;
                let longPressTimer = null;
                let activeDragSeriesKey = null;
                let activeDragWeekIdx = idx;
                let wasAlreadySelected = false;

                const pointerDownHandler = (e) => {
                    if (e.button !== 0 && e.pointerType === 'mouse') return;

                    startX = e.clientX;
                    startY = e.clientY;
                    isDragging = false;
                    activeDragSeriesKey = null;
                    activeDragWeekIdx = idx;
                    wasAlreadySelected = (selectedPeriodIndex === idx);

                    const isMultiLine = (filter === 'all' && !showAllAsTotal);
                    if (isMultiLine) {
                        hitArea.setPointerCapture(e.pointerId);

                        longPressTimer = setTimeout(() => {
                            isDragging = true;
                            if (window.triggerHaptic) window.triggerHaptic('medium');
                            
                            // Highlight the week immediately when the long press activates
                            selectedPeriodIndex = idx;
                            updateDragSelection(e.clientX, e.clientY);
                        }, 250); // 250ms long press delay
                    }
                };

                const pointerMoveHandler = (e) => {
                    if (filter !== 'all' || showAllAsTotal) return;
                    if (!hitArea.hasPointerCapture(e.pointerId)) return;

                    if (!isDragging) {
                        // [FIX: 2026-07-04] - Antigravity
                        // Only cancel long-press if the user's initial motion is MOSTLY VERTICAL
                        // (i.e. a page scroll intent). Horizontal movement should NOT cancel the gesture
                        // so the user can press and immediately slide across weeks before 250ms fires.
                        const dx = Math.abs(e.clientX - startX);
                        const dy = Math.abs(e.clientY - startY);
                        const moveDist = Math.hypot(dx, dy);
                        if (moveDist > 10 && dy > dx) {
                            // Dominant vertical movement → cancel long press, let page scroll
                            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                            hitArea.releasePointerCapture(e.pointerId);
                        }
                        return;
                    }

                    updateDragSelection(e.clientX, e.clientY);
                };

                // [FIX: 2026-07-04] - Antigravity
                // updateDragSelection: supports BOTH horizontal (week) and vertical (series) scrubbing.
                // - X: maps clientX → nearest week column index via padX + i * step in viewBox space,
                //   converted to screen space using the same "xMidYMid meet" scale/offsetX math.
                // - Y: maps clientY → nearest series line dot in real screen coordinates.
                // Never calls pointsGroup.innerHTML='' to avoid destroying hitArea <rect> elements.
                const updateDragSelection = (clientX, clientY) => {
                    const svgRect = svg.getBoundingClientRect();

                    // viewBox is 320×160, SVG uses "xMidYMid meet" → smaller scale wins, content is centered
                    const scale = Math.min(svgRect.width / 320, svgRect.height / 160);
                    const offsetX = (svgRect.width  - 320 * scale) / 2;
                    const offsetY = (svgRect.height - 160 * scale) / 2;

                    // --- HORIZONTAL: find nearest week column from clientX ---
                    // viewBox formula: x = padX + i * step  →  i = (viewBoxX - padX) / step
                    const viewBoxX = (clientX - svgRect.left - offsetX) / scale;
                    let activeWeekIdx = Math.round((viewBoxX - padX) / step);
                    activeWeekIdx = Math.max(0, Math.min(numWeeks - 1, activeWeekIdx));
                    activeDragWeekIdx = activeWeekIdx;

                    // --- VERTICAL: find closest series line by real screen Y distance ---
                    let closestSeries = null;
                    let minDist = Infinity;
                    allSeriesData.forEach(({ series, points }) => {
                        const dotPt = points[activeWeekIdx];
                        if (!dotPt) return;
                        const screenDotY = svgRect.top + offsetY + dotPt.y * scale;
                        const dist = Math.abs(clientY - screenDotY);
                        if (dist < minDist) { minDist = dist; closestSeries = { series, pt: dotPt }; }
                    });

                    if (!closestSeries) return;
                    activeDragSeriesKey = closestSeries.series.key;

                    // Update indicator circles IN-PLACE using data-drag-id (never wipe pointsGroup)
                    allSeriesData.forEach(({ series, points }) => {
                        const dotPt = points[activeWeekIdx];
                        if (!dotPt) return;
                        const isCurrent = series.key === closestSeries.series.key;
                        const outerKey = `drag-outer-${series.key}`;
                        const innerKey = `drag-inner-${series.key}`;

                        let outerRing = pointsGroup.querySelector(`[data-drag-id="${outerKey}"]`);
                        if (!outerRing) {
                            outerRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                            outerRing.setAttribute('data-drag-id', outerKey);
                            outerRing.classList.add('trend-selection-indicator', 'trend-selection-indicator-outer');
                            pointsGroup.appendChild(outerRing);
                        }
                        outerRing.setAttribute('cx', dotPt.x);
                        outerRing.setAttribute('cy', dotPt.y);
                        outerRing.setAttribute('r', isCurrent ? '7' : '4');
                        outerRing.setAttribute('fill', '#ffffff');
                        outerRing.setAttribute('stroke', isCurrent ? series.color : 'none');
                        outerRing.setAttribute('stroke-width', isCurrent ? '1.5' : '0');

                        let innerDot = pointsGroup.querySelector(`[data-drag-id="${innerKey}"]`);
                        if (!innerDot) {
                            innerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                            innerDot.setAttribute('data-drag-id', innerKey);
                            innerDot.classList.add('trend-selection-indicator', 'trend-selection-indicator-inner');
                            pointsGroup.appendChild(innerDot);
                        }
                        innerDot.setAttribute('cx', dotPt.x);
                        innerDot.setAttribute('cy', dotPt.y);
                        innerDot.setAttribute('r', isCurrent ? '4.5' : '2.5');
                        innerDot.setAttribute('fill', series.color);
                        innerDot.setAttribute('stroke', 'none');
                        innerDot.style.opacity = isCurrent ? '1' : '0.4';
                    });

                    // Dim non-active paths
                    svg.querySelectorAll('.trend-dynamic-path').forEach(path => {
                        const isActive = path.getAttribute('stroke') === closestSeries.series.color;
                        path.style.opacity = isActive ? '1' : '0.15';
                        path.setAttribute('stroke-width', isActive ? '4.5' : '1.5');
                    });

                    // Update tooltip
                    tooltipPersistent = true;
                    showTrendTooltip(
                        closestSeries.pt.x, closestSeries.pt.y,
                        closestSeries.series.data[activeWeekIdx], activeWeekIdx,
                        closestSeries.series.color,
                        closestSeries.series.key.toUpperCase()
                    );
                };

                // Remove only the drag indicator circles, not the hitArea rects
                const cleanupDragIndicators = () => {
                    pointsGroup.querySelectorAll('[data-drag-id]').forEach(el => el.remove());
                    svg.querySelectorAll('.trend-dynamic-path').forEach(path => {
                        path.style.opacity = '1';
                        path.setAttribute('stroke-width', '3');
                    });
                };

                const pointerUpHandler = (e) => {
                    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                    if (hitArea.hasPointerCapture(e.pointerId)) hitArea.releasePointerCapture(e.pointerId);

                    if (isDragging) {
                        isDragging = false;
                        cleanupDragIndicators();

                        if (activeDragSeriesKey) {
                            if (window.triggerHaptic) window.triggerHaptic('medium');
                            // Lift finger → open the selected category filter chart
                            window.setTrendFilter(activeDragSeriesKey);
                            selectedPeriodIndex = activeDragWeekIdx;
                            renderTransactionList();
                            setTimeout(() => renderTrendChart(), 10);
                        }
                    } else {
                        // Quick tap (lifted before 250ms long-press fired)
                        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
                        if (dist <= 12) {
                            if (window.triggerHaptic) window.triggerHaptic('light');
                            tooltipPersistent = true;

                            if (wasAlreadySelected) {
                                selectedPeriodIndex = null;
                                forceHideTrendTooltip();
                                renderTransactionList();
                            } else {
                                selectedPeriodIndex = idx;
                                if (activeTrendFilter === 'all') {
                                    const needsSeries = allSeriesData.find(s => s.series.key === 'needs');
                                    const tooltipPt = (needsSeries && needsSeries.points[idx]) || pt;
                                    showTrendTooltip(tooltipPt.x, tooltipPt.y, budgetData.trends.all[idx], idx, '#0f172a', 'TOTAL');
                                } else {
                                    showTrendTooltip(pt.x, pt.y, series.data[idx], idx, series.color);
                                }
                                setTimeout(() => renderTrendChart(), 10);
                                renderTransactionList();
                            }
                        }
                    }
                };

                const pointerCancelHandler = (e) => {
                    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                    if (hitArea.hasPointerCapture(e.pointerId)) hitArea.releasePointerCapture(e.pointerId);
                    isDragging = false;
                    cleanupDragIndicators();
                };

                // Prevent page scroll on mobile during drag (non-passive so e.preventDefault works)
                hitArea.addEventListener('touchmove', (e) => { if (isDragging) e.preventDefault(); }, { passive: false });

                hitArea.style.touchAction = 'none';
                hitArea.addEventListener('pointerdown', pointerDownHandler);
                hitArea.addEventListener('pointermove', pointerMoveHandler);
                hitArea.addEventListener('pointerup', pointerUpHandler);
                hitArea.addEventListener('pointercancel', pointerCancelHandler);

                pointsGroup.appendChild(hitArea);
            });
        });

        // Update x-axis labels
        if (xAxisLabels && budgetData.trendLabels) {
            const labels = budgetData.trendLabels;
            xAxisLabels.innerHTML = labels.map(label => `<span>${label}</span>`).join('');
        }

        // Update total
        if (totalLabel && totalValue) {
            const labelMap = { all: 'TOTAL SPENT', needs: 'NEEDS TOTAL', wants: 'WANTS TOTAL', savings: 'SAVINGS TOTAL' };
            totalLabel.textContent = labelMap[filter];
            const sum = trends[filter].reduce((a, b) => a + b, 0);
            totalValue.textContent = formatPeso(sum);
        }
    }

    /**
     * [ADD: 2026-07-03] Show tooltip near a dot on the trend chart - Antigravity
     */
    let tooltipPersistent = false;
    let scrollContainer = null;

    // [FIX: 2026-07-04] - Antigravity
    // Modified showTrendTooltip to support a category label parameter for multi-line dragging selections.
    function showTrendTooltip(svgX, svgY, value, weekIdx, color, categoryLabel = '') {
        const tooltip = document.getElementById('trend-tooltip');
        if (!tooltip) return;

        const svgEl = document.getElementById('budget-analysis-line-svg');
        if (!svgEl) return;

        const rect = svgEl.getBoundingClientRect();
        const xPct = svgX / 320;
        const yPct = svgY / 160;

        tooltip.style.display = 'block';
        tooltip.style.left = (xPct * rect.width) + 'px';
        tooltip.style.top = (yPct * rect.height - 10) + 'px';
        tooltip.style.background = color;
        
        // Use dynamic label if available
        const label = budgetData.trendLabels && budgetData.trendLabels[weekIdx] 
            ? budgetData.trendLabels[weekIdx] 
            : `W${weekIdx + 1}`;
        const categorySuffix = categoryLabel ? ` ${categoryLabel}` : '';
        tooltip.innerHTML = `${label}${categorySuffix}: ${formatPeso(value)}`;
    }

    function hideTrendTooltip() {
        if (!tooltipPersistent) {
            const tooltip = document.getElementById('trend-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        }
    }

    function forceHideTrendTooltip() {
        tooltipPersistent = false;
        selectedPeriodIndex = null; // Clear selection when hiding tooltip
        const tooltip = document.getElementById('trend-tooltip');
        if (tooltip) tooltip.style.display = 'none';
        // Re-render chart to remove selection indicators
        renderTrendChart();
    }

    // Set up scroll listener to hide tooltip on scroll
    function setupScrollListener() {
        if (!scrollContainer) {
            scrollContainer = document.querySelector('.budget-analysis-scroll-area');
            if (scrollContainer) {
                scrollContainer.addEventListener('scroll', () => {
                    // Only hide the tooltip on scroll, but KEEP the period selection
                    tooltipPersistent = false;
                    const tooltip = document.getElementById('trend-tooltip');
                    if (tooltip) tooltip.style.display = 'none';
                    // DON'T reset selectedPeriodIndex - keep the filter active
                    // DON'T call renderTransactionList - keep showing filtered transactions
                });
            }
        }
    }

    /**
     * [ADD: 2026-07-03] Handle trend badge filter toggle - Antigravity
     * Switches the active filter badge and re-renders the trend line chart
     * Pressing "ALL" when already active toggles between 3-line view and single black total line
     */
    window.setTrendFilter = function (filter) {
        if (window.triggerHaptic) window.triggerHaptic('light');
        
        // Handle toggle for "ALL" when it's already active
        // [FIX: 2026-07-04] - Antigravity
        // Handler for setTrendFilter. Modified to handle re-clicking the active filter badge (e.g. 'savings' or 'all') to toggle/deselect the active week.
        if (filter === 'all' && activeTrendFilter === 'all') {
            // Toggle between 3 lines and single black line
            showAllAsTotal = !showAllAsTotal;
            // Reset period selection when toggling "All"
            selectedPeriodIndex = null;
            forceHideTrendTooltip();
        } else if (filter === activeTrendFilter) {
            // Re-clicking the currently active filter badge untoggles the active week
            if (selectedPeriodIndex !== null) {
                selectedPeriodIndex = null;
                forceHideTrendTooltip();
            }
        } else {
            // Switching to a different filter
            activeTrendFilter = filter;
            if (filter === 'all') {
                showAllAsTotal = false; // Default to 3-line view (white) when coming from other filters
                // Reset period selection when clicking "All"
                selectedPeriodIndex = null;
                forceHideTrendTooltip();
            }
        }

        // Update activeTrendFilter if it wasn't "all" before
        if (activeTrendFilter !== 'all' || filter !== 'all') {
            activeTrendFilter = filter;
        }

        // Toggle active badge class
        document.querySelectorAll('.trend-filter-badge').forEach(btn => {
            const isActive = btn.dataset.type === filter;
            btn.classList.toggle('active', isActive);
            
            // Reset all badges to default color first
            btn.style.color = '';
        });

        // Animate the slider to the active button
        const activeBtn = document.querySelector(`.trend-filter-badge[data-type="${filter}"]`);
        const slider = document.getElementById('trend-filter-slider');
        const container = document.getElementById('trend-filter-container');
        
        if (activeBtn && slider && container) {
            const containerRect = container.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            
            // Calculate position relative to container
            const left = btnRect.left - containerRect.left;
            const width = btnRect.width;
            
            slider.style.left = `${left}px`;
            slider.style.width = `${width}px`;
            
            // Change slider color based on filter
            const colorMap = {
                'all': showAllAsTotal ? '#0f172a' : '#ffffff', // Black for single line, white for 3 lines
                'needs': '#3b82f6',
                'wants': '#f59e0b',
                'savings': '#10b981'
            };
            
            const darkColorMap = {
                'all': showAllAsTotal ? '#0f172a' : '#1e293b', // Black for single line, dark gray for 3 lines
                'needs': '#3b82f6',
                'wants': '#f59e0b',
                'savings': '#10b981'
            };
            
            const isDark = document.body.classList.contains('dark-mode');
            slider.style.background = isDark ? darkColorMap[filter] : colorMap[filter];
            
            // Update text color for better contrast when on colored backgrounds
            if (filter !== 'all') {
                activeBtn.style.color = '#ffffff';
            } else {
                // White text when showing single black line, dark text when showing 3 lines
                if (showAllAsTotal) {
                    activeBtn.style.color = '#ffffff';
                } else {
                    activeBtn.style.color = isDark ? '#f8fafc' : '#0f172a';
                }
            }
        }

        renderTrendChart();
        
        // Re-render transaction list with the new filter
        renderTransactionList();
    };

    /**
     * [ADD: 2026-07-03] Handle trend time range filter select dropdown - Antigravity
     * Syncs with the dashboard filter and updates all budget aggregates in the overlay
     */
    window.setTrendTimeRange = function (value) {
        if (window.triggerHaptic) window.triggerHaptic('light');

        console.log('setTrendTimeRange called with:', value);
        
        // Store the current filter value
        currentTimeFilter = value;

        const chartFilter = document.getElementById('chart-filter');
        if (chartFilter) {
            // Ensure option exists in main dashboard dropdown
            if (!chartFilter.querySelector(`option[value="${value}"]`)) {
                const opt = document.createElement('option');
                opt.value = value;
                if (/^\d{4}-\d{2}$/.test(value)) {
                    const ctx = window.getDashboardMonthContext ? window.getDashboardMonthContext(value) : null;
                    opt.textContent = ctx?.labelTitle || value;
                } else {
                    const labelMap = {
                        this_month: 'This Month',
                        last_7_days: 'Last 7 Days',
                        last_3_months: 'Last 3 Months',
                        last_6_months: 'Last 6 Months',
                        this_year: 'This Year',
                        all_time: 'All Time'
                    };
                    opt.textContent = labelMap[value] || value;
                }
                const insertBeforeEl = chartFilter.querySelector('option[value="last_6_months"]') || null;
                chartFilter.insertBefore(opt, insertBeforeEl);
            }
            chartFilter.value = value;

            // Trigger dashboard filter chart logic
            if (window.filterChart) {
                window.filterChart();
            }
        }
        
        // Update the dropdown display
        const trendDropdown = document.getElementById('trend-time-dropdown');
        if (trendDropdown) {
            trendDropdown.value = value;
        }

        // Re-run aggregation & rendering with the new value directly passed as parameter
        aggregateBudgetAnalysis(value);
        renderOverlayContent(value);
    };

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
            activeTrendFilter = 'all';
            showAllAsTotal = false;

            // Load data
            aggregateBudgetAnalysis();
            renderOverlayContent();

            // Reveal overlay
            overlay.style.display = 'flex';
            
            // Force flow restart for animation
            void overlay.offsetHeight;
            overlay.classList.add('show');

            // Initialize slider position after a brief delay to ensure layout is calculated
            setTimeout(() => {
                window.setTrendFilter('all');
                setupScrollListener(); // Set up scroll listener for tooltip hiding
            }, 50);

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