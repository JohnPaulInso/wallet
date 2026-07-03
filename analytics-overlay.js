/**
 * Budget Analytics Overlay Component
 * Displays transaction analytics using Chart.js with interactive charts
 */

// Configuration Constants
const TIME_FILTERS = {
    last_7_days: 'Last 7 Days',
    this_month: 'This Month',
    last_month: 'Last Month',
    last_last_month: 'Last Last Month',
    '3_months_ago': '3 Months Ago',
    last_3_months: 'Last 3 Months',
    last_6_months: 'Last 6 Months',
    last_year: 'Last Year',
    lifetime: 'Entire Lifetime'
};

const CATEGORY_COLORS = {
    needs: '#4d94ff',
    wants: '#ffc107',
    savings: '#10b981',
    combined: '#0f172a'
};

const DONUT_COLORS = ['#ff8533', '#c74dff', '#4d94ff'];

// Module State
let lineChartInstance = null;
let donutChartInstance = null;
let currentTimeFilter = 'this_month';
let activeCategories = new Set(['needs', 'wants', 'savings']);
let cachedData = {
    timeFilter: null,
    transactionsRef: null,
    weeklyData: null,
    categoryTotals: null
};

/**
 * Format number as peso amount
 * @param {number} value 
 * @returns {string} Formatted string like "₱1,234"
 */
function formatPeso(value) {
    if (value === null || value === undefined || isNaN(value)) return '₱0';
    return `₱${Math.round(value).toLocaleString()}`;
}

/**
 * Log error with context
 * @param {string} context 
 * @param {Error} error 
 * @param {object} data 
 */
function logError(context, error, data = {}) {
    console.error(`[BudgetAnalytics:${context}]`, error, data);
    if (window.logError) {
        window.logError(`analytics:${context}`, error.message, data);
    }
}

// ========================================
// DATA PROCESSING MODULE
// ========================================

const DataProcessor = {
    /**
     * Filter transactions by time range
     * @param {Array} transactions 
     * @param {string} timeFilter 
     * @returns {Array} Filtered transactions
     */
    filterByTimeRange(transactions, timeFilter) {
        if (!transactions || transactions.length === 0) return [];
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let startDate, endDate;

        switch (timeFilter) {
            case 'last_7_days':
                startDate = new Date(today);
                startDate.setDate(today.getDate() - 6);
                endDate = today;
                break;
            
            case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            
            case 'last_last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                endDate = new Date(now.getFullYear(), now.getMonth() - 1, 0);
                break;
            
            case '3_months_ago':
                startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
                endDate = new Date(now.getFullYear(), now.getMonth() - 2, 0);
                break;
            
            case 'last_3_months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            
            case 'last_6_months':
                startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            
            case 'last_year':
                startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            
            case 'lifetime':
            default:
                return transactions;
        }

        return transactions.filter(txn => {
            if (!txn.date) return false;
            const txnDate = new Date(txn.date);
            return txnDate >= startDate && txnDate <= endDate;
        });
    },

    /**
     * Categorize transaction into Needs/Wants/Savings
     * @param {object} txn 
     * @returns {string} Category ('needs', 'wants', 'savings', or 'other')
     */
    categorizeTransaction(txn) {
        if (!txn) return 'other';
        
        // Use budgetRule if explicitly set
        if (txn.budgetRule) {
            return txn.budgetRule.toLowerCase();
        }

        // Fallback to category-based mapping
        const category = (txn.category || '').toLowerCase();
        const needsCategories = ['food & drinks', 'transportation', 'vehicle', 'service', 'financial expenses'];
        const wantsCategories = ['shopping', 'online shopping', 'life & entertainment', 'travel', 'sport'];
        const savingsCategories = ['savings', 'income'];

        if (needsCategories.includes(category)) return 'needs';
        if (wantsCategories.includes(category)) return 'wants';
        if (savingsCategories.includes(category)) return 'savings';
        
        // Default for expenses
        return txn.amount < 0 ? 'wants' : 'savings';
    },

    /**
     * Aggregate transactions by category
     * @param {Array} transactions 
     * @returns {object} Category totals
     */
    aggregateByCategory(transactions) {
        const totals = {
            needs: 0,
            wants: 0,
            savings: 0,
            total: 0
        };

        if (!transactions || transactions.length === 0) return totals;

        transactions.forEach(txn => {
            if (!txn || typeof txn.amount !== 'number') return;
            
            const absAmount = Math.abs(txn.amount);
            const category = this.categorizeTransaction(txn);
            
            if (category === 'needs' || category === 'wants' || category === 'savings') {
                totals[category] += absAmount;
            }
            totals.total += absAmount;
        });

        return totals;
    },

    /**
     * Generate weekly breakdown data
     * @param {Array} transactions 
     * @param {Date} startDate 
     * @param {Date} endDate 
     * @returns {Array} Weekly data array
     */
    generateWeeklyData(transactions, startDate, endDate) {
        if (!transactions || transactions.length === 0) return [];

        const weeks = [];
        let weekStart = new Date(startDate);
        let weekNum = 1;

        while (weekStart <= endDate) {
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            const finalEnd = weekEnd > endDate ? endDate : weekEnd;
            
            const weekTxns = transactions.filter(txn => {
                if (!txn.date) return false;
                const txnDate = new Date(txn.date);
                return txnDate >= weekStart && txnDate <= finalEnd;
            });

            const weekData = {
                weekLabel: `W${weekNum}`,
                startDate: weekStart.toISOString().split('T')[0],
                endDate: finalEnd.toISOString().split('T')[0],
                needs: 0,
                wants: 0,
                savings: 0,
                total: 0
            };

            weekTxns.forEach(txn => {
                if (!txn || typeof txn.amount !== 'number') return;
                
                const absAmount = Math.abs(txn.amount);
                const category = this.categorizeTransaction(txn);
                
                if (category === 'needs') weekData.needs += absAmount;
                else if (category === 'wants') weekData.wants += absAmount;
                else if (category === 'savings') weekData.savings += absAmount;
                
                weekData.total += absAmount;
            });

            weeks.push(weekData);
            
            weekStart = new Date(finalEnd);
            weekStart.setDate(weekStart.getDate() + 1);
            weekNum++;
        }

        return weeks;
    },

    /**
     * Format weekly data for line chart
     * @param {Array} weeklyData 
     * @param {Set} activeCategories 
     * @returns {object} Chart.js data structure
     */
    formatForLineChart(weeklyData, activeCategories) {
        if (!weeklyData || weeklyData.length === 0) {
            return {
                labels: [],
                datasets: []
            };
        }

        const labels = weeklyData.map(w => w.weekLabel);
        const datasets = [];

        const isCombined = activeCategories.has('combined');

        if (isCombined) {
            datasets.push({
                label: 'Total',
                data: weeklyData.map(w => w.total),
                borderColor: CATEGORY_COLORS.combined,
                backgroundColor: 'rgba(15, 23, 42, 0.08)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 6
            });
        } else {
            if (activeCategories.has('needs')) {
                datasets.push({
                    label: 'Needs',
                    data: weeklyData.map(w => w.needs),
                    borderColor: CATEGORY_COLORS.needs,
                    backgroundColor: 'rgba(77, 148, 255, 0.08)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 6
                });
            }

            if (activeCategories.has('wants')) {
                datasets.push({
                    label: 'Wants',
                    data: weeklyData.map(w => w.wants),
                    borderColor: CATEGORY_COLORS.wants,
                    backgroundColor: 'rgba(255, 193, 7, 0.08)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 6
                });
            }

            if (activeCategories.has('savings')) {
                datasets.push({
                    label: 'Savings',
                    data: weeklyData.map(w => w.savings),
                    borderColor: CATEGORY_COLORS.savings,
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 6
                });
            }
        }

        return {
            labels,
            datasets
        };
    },

    /**
     * Format category totals for donut chart
     * @param {object} categoryTotals 
     * @returns {object} Chart.js data structure
     */
    formatForDonutChart(categoryTotals) {
        const data = [
            categoryTotals.needs || 0,
            categoryTotals.wants || 0,
            categoryTotals.savings || 0
        ];

        return {
            labels: ['Needs', 'Wants', 'Savings'],
            datasets: [{
                data: data,
                backgroundColor: DONUT_COLORS,
                borderWidth: 0,
                hoverOffset: 8
            }]
        };
    }
};

// ========================================
// CHART.JS CENTER TEXT PLUGIN
// ========================================

const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
        if (chart.config.type !== 'doughnut') return;
        
        const ctx = chart.ctx;
        const { width, height } = chart;
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // TOTAL label
        ctx.font = '700 13px Montserrat, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.letterSpacing = '2px';
        ctx.fillText('TOTAL', width / 2, height / 2 - 20);
        
        // Amount
        ctx.font = '900 32px Montserrat, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(formatPeso(total), width / 2, height / 2 + 15);
        
        ctx.restore();
    }
};

// Register plugin
if (typeof Chart !== 'undefined') {
    Chart.register(centerTextPlugin);
}

// ========================================
// CHART MANAGEMENT
// ========================================

/**
 * Create line chart
 * @param {HTMLCanvasElement} canvas 
 * @param {object} data 
 * @returns {Chart} Chart instance
 */
function createLineChart(canvas, data) {
    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    padding: 16,
                    bodyFont: {
                        family: 'Montserrat, sans-serif',
                        size: 14,
                        weight: '600'
                    },
                    titleFont: {
                        family: 'Montserrat, sans-serif',
                        size: 12,
                        weight: '700'
                    },
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const value = formatPeso(context.parsed.y);
                            return `${label}: ${value}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { 
                        display: true,
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        font: {
                            family: 'Montserrat, sans-serif',
                            size: 11,
                            weight: '700'
                        },
                        color: 'rgba(255, 255, 255, 0.5)'
                    }
                },
                y: {
                    display: true,
                    grid: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        font: {
                            family: 'Montserrat, sans-serif',
                            size: 11,
                            weight: '600'
                        },
                        color: 'rgba(255, 255, 255, 0.4)',
                        callback: function(value) {
                            return '₱' + (value >= 1000 ? (value/1000).toFixed(0) + 'k' : value);
                        }
                    },
                    beginAtZero: true
                }
            },
            animation: { duration: 400 },
            interaction: {
                mode: 'index',
                intersect: false
            }
        }
    };

    return new Chart(canvas, config);
}

/**
 * Create donut chart
 * @param {HTMLCanvasElement} canvas 
 * @param {object} data 
 * @returns {Chart} Chart instance
 */
function createDonutChart(canvas, data) {
    const config = {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1,
                    padding: 16,
                    bodyFont: {
                        family: 'Montserrat, sans-serif',
                        size: 15,
                        weight: '700'
                    },
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = formatPeso(context.parsed);
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${pct}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: false,
                duration: 600,
                easing: 'easeInOutQuart'
            }
        }
    };

    return new Chart(canvas, config);
}

/**
 * Destroy chart instances to free memory
 */
function destroyCharts() {
    if (lineChartInstance) {
        lineChartInstance.destroy();
        lineChartInstance = null;
    }
    if (donutChartInstance) {
        donutChartInstance.destroy();
        donutChartInstance = null;
    }
}

/**
 * Update charts with new data
 * @param {string} timeFilter 
 * @param {Set} categories 
 */
function updateCharts(timeFilter, categories) {
    const transactions = getTransactions();
    
    // Check if data needs reprocessing
    const needsReprocess = !cachedData.transactionsRef ||
        cachedData.transactionsRef !== window.allTxns ||
        cachedData.timeFilter !== timeFilter;

    if (needsReprocess) {
        const filtered = DataProcessor.filterByTimeRange(transactions, timeFilter);
        
        if (filtered.length === 0) {
            showEmptyState();
            return;
        }

        hideEmptyState();

        // Calculate date range for weekly bucketing
        const dates = filtered.map(t => new Date(t.date)).sort((a, b) => a - b);
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];

        cachedData = {
            timeFilter: timeFilter,
            transactionsRef: window.allTxns,
            weeklyData: DataProcessor.generateWeeklyData(filtered, startDate, endDate),
            categoryTotals: DataProcessor.aggregateByCategory(filtered)
        };
    }

    // Update period label and total
    updatePeriodDisplay(timeFilter);

    // Update line chart
    const lineCanvas = document.getElementById('analytics-line-chart');
    const lineData = DataProcessor.formatForLineChart(cachedData.weeklyData, categories);
    
    if (lineChartInstance) {
        lineChartInstance.data = lineData;
        lineChartInstance.update();
    } else if (lineCanvas) {
        try {
            lineChartInstance = createLineChart(lineCanvas, lineData);
        } catch (error) {
            logError('createLineChart', error);
            showToastIfAvailable('Unable to render line chart');
        }
    }

    // Update donut chart
    const donutCanvas = document.getElementById('analytics-donut-chart');
    const donutData = DataProcessor.formatForDonutChart(cachedData.categoryTotals);
    
    if (donutChartInstance) {
        donutChartInstance.data = donutData;
        donutChartInstance.update();
    } else if (donutCanvas) {
        try {
            donutChartInstance = createDonutChart(donutCanvas, donutData);
        } catch (error) {
            logError('createDonutChart', error);
            showToastIfAvailable('Unable to render donut chart');
        }
    }
}

/**
 * Update period label and total amount display
 * @param {string} timeFilter 
 */
function updatePeriodDisplay(timeFilter) {
    const labelEl = document.getElementById('analytics-period-label');
    const totalEl = document.getElementById('analytics-period-total');
    
    if (!labelEl || !totalEl || !cachedData.categoryTotals) return;

    // Generate period label
    const now = new Date();
    let periodLabel = TIME_FILTERS[timeFilter] || 'Unknown Period';
    
    if (timeFilter === 'this_month' || timeFilter === 'last_month' || timeFilter === 'last_last_month' || timeFilter === '3_months_ago') {
        const monthOffset = {
            'this_month': 0,
            'last_month': -1,
            'last_last_month': -2,
            '3_months_ago': -3
        }[timeFilter];
        
        const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        const monthName = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
        periodLabel = monthName;
    }
    
    labelEl.textContent = periodLabel;
    totalEl.textContent = formatPeso(cachedData.categoryTotals.total);
}

// ========================================
// UI MANAGEMENT
// ========================================

/**
 * Get transactions from window.allTxns
 * @returns {Array} Transactions array
 */
function getTransactions() {
    if (!window.allTxns || !Array.isArray(window.allTxns)) {
        return [];
    }
    return window.allTxns.filter(txn => txn && typeof txn.amount === 'number' && txn.date);
}

/**
 * Show empty state message
 */
function showEmptyState() {
    const emptyState = document.getElementById('analytics-empty-state');
    const chartsGrid = document.querySelector('.analytics-charts-grid');
    
    if (emptyState) emptyState.style.display = 'flex';
    if (chartsGrid) chartsGrid.style.display = 'none';
}

/**
 * Hide empty state message
 */
function hideEmptyState() {
    const emptyState = document.getElementById('analytics-empty-state');
    const chartsGrid = document.querySelector('.analytics-charts-grid');
    
    if (emptyState) emptyState.style.display = 'none';
    if (chartsGrid) chartsGrid.style.display = 'grid';
}

/**
 * Show toast if available
 * @param {string} message 
 */
function showToastIfAvailable(message) {
    if (typeof window.showToast === 'function') {
        window.showToast(message);
    } else {
        console.log('Toast:', message);
    }
}

/**
 * Open overlay
 */
function openOverlay() {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        logError('openOverlay', new Error('Chart.js not loaded'));
        showToastIfAvailable('Chart library not available');
        return;
    }

    const overlay = document.getElementById('analytics-overlay');
    if (!overlay) {
        logError('openOverlay', new Error('Overlay element not found'));
        return;
    }

    // Load saved time filter
    const saved = localStorage.getItem('analytics_time_filter');
    if (saved && TIME_FILTERS[saved]) {
        currentTimeFilter = saved;
    }

    const filterSelect = document.getElementById('analytics-time-filter');
    if (filterSelect) {
        filterSelect.value = currentTimeFilter;
    }

    // Show overlay
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Update charts
    updateCharts(currentTimeFilter, activeCategories);

    // Focus first control
    setTimeout(() => {
        if (filterSelect) filterSelect.focus();
    }, 100);
}

/**
 * Close overlay
 */
function closeOverlay() {
    const overlay = document.getElementById('analytics-overlay');
    if (!overlay) return;

    overlay.style.display = 'none';
    document.body.style.overflow = '';

    // Destroy charts after animation
    setTimeout(destroyCharts, 300);

    // Return focus to trigger button
    const btn = document.getElementById('budget-analytics-btn');
    if (btn) btn.focus();
}

/**
 * Handle time filter change
 * @param {Event} event 
 */
let filterChangeTimeout = null;
function handleTimeFilterChange(event) {
    clearTimeout(filterChangeTimeout);
    
    filterChangeTimeout = setTimeout(() => {
        currentTimeFilter = event.target.value;
        localStorage.setItem('analytics_time_filter', currentTimeFilter);
        
        // Invalidate cache
        cachedData.timeFilter = null;
        
        updateCharts(currentTimeFilter, activeCategories);
    }, 200);
}

/**
 * Handle line toggle change
 * @param {Event} event 
 */
function handleLineToggle(event) {
    const checkbox = event.target;
    const category = checkbox.dataset.category;
    
    if (category === 'combined') {
        if (checkbox.checked) {
            // Enable combined, disable others
            activeCategories.clear();
            activeCategories.add('combined');
            
            document.querySelectorAll('.analytics-line-toggles input[type="checkbox"]').forEach(cb => {
                if (cb.dataset.category !== 'combined') {
                    cb.checked = false;
                }
            });
        } else {
            // Disable combined, enable all individual
            activeCategories.delete('combined');
            activeCategories.add('needs');
            activeCategories.add('wants');
            activeCategories.add('savings');
            
            document.querySelectorAll('.analytics-line-toggles input[type="checkbox"]').forEach(cb => {
                if (cb.dataset.category !== 'combined') {
                    cb.checked = true;
                }
            });
        }
    } else {
        // Individual toggle
        const combinedCheckbox = document.querySelector('input[data-category="combined"]');
        if (combinedCheckbox) combinedCheckbox.checked = false;
        activeCategories.delete('combined');
        
        if (checkbox.checked) {
            activeCategories.add(category);
        } else {
            activeCategories.delete(category);
        }
    }

    updateCharts(currentTimeFilter, activeCategories);
}

/**
 * Handle window resize
 */
let resizeTimeout = null;
function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (lineChartInstance) lineChartInstance.resize();
        if (donutChartInstance) donutChartInstance.resize();
    }, 150);
}

/**
 * Handle ESC key
 * @param {KeyboardEvent} event 
 */
function handleKeyDown(event) {
    if (event.key === 'Escape') {
        const overlay = document.getElementById('analytics-overlay');
        if (overlay && overlay.style.display === 'flex') {
            closeOverlay();
        }
    }
}

/**
 * Initialize module
 */
function init() {
    const closeBtn = document.getElementById('analytics-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeOverlay);
    }

    const backdrop = document.querySelector('.analytics-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeOverlay);
    }

    const filterSelect = document.getElementById('analytics-time-filter');
    if (filterSelect) {
        filterSelect.addEventListener('change', handleTimeFilterChange);
    }

    const toggles = document.querySelectorAll('.analytics-line-toggles input[type="checkbox"]');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', handleLineToggle);
    });

    window.addEventListener('resize', handleResize);
    document.addEventListener('keydown', handleKeyDown);

    console.log('[BudgetAnalytics] Initialized');
}

// Auto-initialize if Chart.js is loaded
if (typeof Chart !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else if (typeof Chart !== 'undefined') {
    init();
}

// Public API (available globally via window.budgetAnalytics)
const BudgetAnalytics = {
    open: openOverlay,
    close: closeOverlay,
    init
};

// Make globally available
if (typeof window !== 'undefined') {
    window.budgetAnalytics = BudgetAnalytics;
}
