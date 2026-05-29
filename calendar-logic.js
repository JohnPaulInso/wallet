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
        const genericManualCategories = new Set([
            'financial expenses',
            'financial expense',
            'other',
            'uncategorized'
        ]);

        if (manualCategory && !genericManualCategories.has(normalizedManual)) {
            return manualCategory;
        }

        return autoCategory || manualCategory || 'Other';
    };

    window.CalendarView = {
        initialized: false,
        txns: [],
        currentViewDate: new Date(),
        selectedDate: new Date(),

        init: function() {
            if (this.initialized) return;
            console.log("📅 Initializing Calendar View...");
            this.initialized = true;
            this.setupListeners();
            this.render();
        },

        setupListeners: function() {
            document.addEventListener('walletDataUpdated', (e) => {
                this.txns = e.detail.txns || [];
                this.render();
            });
            // Initial data pull if available
            if (window.allTxns) {
                this.txns = window.allTxns;
                this.render();
            }
        },

        render: function() {
            const grid = document.getElementById('calendar-page-grid');
            const title = document.getElementById('calendar-page-title');
            if (!grid || !title) return;

            // Clear previous days
            const dayCells = grid.querySelectorAll('.calendar-day-cell');
            dayCells.forEach(d => d.remove());

            const year = this.currentViewDate.getFullYear();
            const month = this.currentViewDate.getMonth();
            title.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.currentViewDate);

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const daysInPrevMonth = new Date(year, month, 0).getDate();

            // Previous month padding
            for (let i = firstDay - 1; i >= 0; i--) {
                const cell = document.createElement('div');
                cell.className = 'calendar-day-cell other-month';
                cell.innerHTML = `<span class="calendar-day-num">${daysInPrevMonth - i}</span>`;
                grid.appendChild(cell);
            }

            // Current month days
            const today = new Date();
            for (let d = 1; d <= daysInMonth; d++) {
                const cellDate = new Date(year, month, d);
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                
                const cell = document.createElement('div');
                cell.className = 'calendar-day-cell';
                if (today.toDateString() === cellDate.toDateString()) cell.classList.add('today');
                
                const dayTxns = this.txns.filter(t => (t.date && t.date.split('T')[0] === dateStr) && !t.refund);
                
                let totalExp = 0, totalInc = 0;
                dayTxns.forEach(t => {
                    const amt = t.manualAmount ?? t.amount ?? 0;
                    if (t.category === 'Income' || t.manualCategory === 'Income') totalInc += amt;
                    else if (!t.excluded) totalExp += amt;
                });

                let chips = '<div class="calendar-day-amounts">';
                if (totalExp > 0) chips += `<div class="calendar-amount-chip expense">-${Math.round(totalExp).toLocaleString()}</div>`;
                if (totalInc > 0) chips += `<div class="calendar-amount-chip income">+${Math.round(totalInc).toLocaleString()}</div>`;
                chips += '</div>';

                cell.innerHTML = `<span class="calendar-day-num">${d}</span>${chips}`;
                cell.onclick = () => this.openDayModal(cellDate, dayTxns);
                grid.appendChild(cell);
            }
        },

        openDayModal: function(date, dayTxns) {
            const modal = document.getElementById('calendar-txn-modal');
            const modalBody = document.getElementById('calendar-modal-body');
            const modalTitle = document.getElementById('calendar-modal-date-title');
            const modalFooter = document.getElementById('calendar-modal-footer-summary');

            modalTitle.innerText = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
            
            if (dayTxns.length === 0) {
                modalBody.innerHTML = `<div class="calendar-no-txns" style="text-align:center; padding:40px 0; color:#94a3b8; font-weight:700;">No transactions on this day.</div>`;
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

                modalBody.innerHTML = Object.keys(categoryGroups)
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

            modal.classList.add('show');
            if (window.NavState) window.NavState.pushModalState('calendar-modal', () => this.closeModal());
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
            return `
                <div class="calendar-txn-chip ${isInc ? 'income' : 'expense'}" style="display:flex; align-items:center; gap:12px; padding:12px; background:#fff; border:1px solid #f1f5f9; border-radius:12px; margin-bottom:4px; ${t.excluded ? 'opacity:0.5' : ''}">
                    <div class="history-icon ${iconClass}" style="width:32px; height:32px; border-radius:10px; background:#f8fafc; display:flex; align-items:center; justify-content:center; color:#64748b;">
                        <i class="material-icons" style="font-size:18px;">${iconName}</i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:12px; font-weight:800; color:#1e293b;">${mapped.name || 'UNKNOWN'}</div>
                        <div style="font-size:10px; color:#94a3b8; font-weight:600;">${mapped.category || ''}</div>
                    </div>
                    <div style="font-size:13px; font-weight:900; color:${isInc ? '#10b981' : '#1e293b'};">${isInc ? '+' : '-'}₱${Math.abs(amt).toLocaleString()}</div>
                </div>
            `;
        }
    };
})(window);
