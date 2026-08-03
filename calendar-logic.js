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
        // (2026-07-13) Added Savings category to CATEGORIES array; prev: absent
        { id: 'Savings', icon: 'savings', label: 'Savings', cls: 'cat-investments' },
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
        const merchantName = String(txn.merchant || txn.name || '').toUpperCase();
        
        // [FIXED: 2026-07-01] BALANCING is Income (money received to balance account)
        if (merchantName.includes('BALANCING')) {
            return 'Income';
        }
        
        // [FIXED: 2026-07-01] Payment transactions should always be Financial Expenses
        if (merchantName.includes('PAYMENT') || merchantName.includes('INSTAPAY') || merchantName.includes('TRANSFER')) {
            return 'Financial Expenses';
        }
        
        // [FIXED: 2026-07-01] Don't treat "Financial Expenses" as generic - it's a valid category
        // Only treat truly generic categories as fallbacks
        const genericManualCategories = new Set([
            'other',
            'uncategorized'
        ]);

        // [FIXED: 2026-07-01] Always respect manualCategory if set, except for truly generic ones
        if (manualCategory && !genericManualCategories.has(normalizedManual)) {
            return manualCategory;
        }

        return autoCategory || manualCategory || 'Other';
    };

    // (2026-07-13) Enhanced CalendarView with Bill Reminders, day cell bill chips, and upcoming bills card; prev: basic transactions only
    window.CalendarView = {
        initialized: false,
        txns: [],
        bills: [],
        activeTab: 'today',
        currentViewDate: new Date(),
        selectedDate: new Date(),

        init: function() {
            if (this.initialized) return;
            console.log("📅 [v5.6] CALENDAR: Initializing CalendarView with Bills & Reminders");
            this.initialized = true;
            this.loadBills();
            this.setupListeners();
            this.render();
        },

        loadBills: function() {
            try {
                const stored = localStorage.getItem('wallet_calendar_bills');
                if (stored) {
                    this.bills = JSON.parse(stored);
                } else {
                    this.bills = [];
            } catch (e) {
                this.bills = [];
            }
        },

        saveBills: function() {
            try {
                localStorage.setItem('wallet_calendar_bills', JSON.stringify(this.bills || []));
            } catch (e) {}
            if (typeof this.render === 'function') this.render();
            if (typeof this.renderUpcomingBillsCard === 'function') this.renderUpcomingBillsCard();
        },

        getBillsForDate: function(dateStr) {
            if (!this.bills || !Array.isArray(this.bills)) return [];
            const targetDate = new Date(dateStr + 'T00:00:00');
            const targetDay = targetDate.getDate();
            const targetMonth = targetDate.getMonth();

            return this.bills.filter(b => {
                if (!b.date) return false;
                if (dateStr < b.date) return false; // Bill hasn't started yet
                if (b.endDate && dateStr >= b.endDate) return false; // Deleted for target date and future

                const repeat = b.repeat || 'monthly';
                if (repeat === 'this_month' || repeat === 'none') {
                    return b.date === dateStr;
                } else if (repeat === 'monthly') {
                    return targetDay === new Date(b.date + 'T00:00:00').getDate();
                } else if (repeat === 'yearly') {
                    const bDate = new Date(b.date + 'T00:00:00');
                    return targetDay === bDate.getDate() && targetMonth === bDate.getMonth();
                }
                return b.date === dateStr;
            });
        },

        addBill: function(billData) {
            const repeatVal = billData.repeat || document.getElementById('bill-input-repeat')?.value || 'monthly';
            const newBill = {
                id: 'bill_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                title: billData.title || 'Untitled Bill',
                amount: parseFloat(billData.amount) || 0,
                date: billData.date || new Date().toISOString().split('T')[0],
                color: billData.color || '#3b82f6',
                icon: billData.icon || 'receipt_long',
                paid: false,
                repeat: repeatVal,
                endDate: null
            };
            this.bills.push(newBill);
            this.saveBills();
        },

        deleteBill: function(id, targetDateStr) {
            const idx = this.bills.findIndex(b => b.id === id);
            if (idx > -1) {
                const bill = this.bills[idx];
                const repeat = bill.repeat || 'monthly';
                if ((repeat === 'monthly' || repeat === 'yearly') && targetDateStr) {
                    bill.endDate = targetDateStr; // Only future instances are affected!
                } else {
                    this.bills.splice(idx, 1);
                }
                this.saveBills();
            }
        },

        toggleBillPaid: function(id) {
            const idx = this.bills.findIndex(b => b.id === id);
            if (idx > -1) {
                this.bills[idx].paid = !this.bills[idx].paid;
                this.saveBills();
            }
        },

        setBillTab: function(tabName) {
            this.activeTab = tabName;
            document.querySelectorAll('.bill-tab-btn').forEach(btn => {
                const isMatch = btn.dataset.tab === tabName;
                btn.classList.toggle('active', isMatch);
                btn.style.background = isMatch ? '#ffffff' : 'transparent';
                btn.style.color = isMatch ? '#1e293b' : '#64748b';
                btn.style.boxShadow = isMatch ? '0 2px 6px rgba(0,0,0,0.05)' : 'none';
            });
            this.renderUpcomingBillsCard();
        },

        setupListeners: function() {
            document.addEventListener('walletDataUpdated', (e) => {
                this.txns = e.detail.txns || [];
                this.render();
            });
            if (window.allTxns) {
                this.txns = window.allTxns;
                this.render();
            }
        },

        render: function() {
            const grid = document.getElementById('calendar-page-grid');
            const title = document.getElementById('calendar-page-title');
            if (!grid || !title) return;

            const dayCells = grid.querySelectorAll('.calendar-day-cell');
            dayCells.forEach(d => d.remove());

            const year = this.currentViewDate.getFullYear();
            const month = this.currentViewDate.getMonth();
            title.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.currentViewDate);

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const daysInPrevMonth = new Date(year, month, 0).getDate();

            for (let i = firstDay - 1; i >= 0; i--) {
                const cell = document.createElement('div');
                cell.className = 'calendar-day-cell other-month';
                cell.innerHTML = `<span class="calendar-day-num">${daysInPrevMonth - i}</span>`;
                grid.appendChild(cell);
            }

            const today = new Date();
            for (let d = 1; d <= daysInMonth; d++) {
                const cellDate = new Date(year, month, d);
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                
                const cell = document.createElement('div');
                cell.className = 'calendar-day-cell';
                if (today.toDateString() === cellDate.toDateString()) cell.classList.add('today');
                
                const dayTxns = this.txns.filter(t => (t.date && t.date.split('T')[0] === dateStr) && !t.refund);
                const dayBills = this.getBillsForDate(dateStr);
                
                let totalExp = 0, totalInc = 0;
                dayTxns.forEach(t => {
                    const amt = t.manualAmount ?? t.amount ?? 0;
                    if (t.category === 'Income' || t.manualCategory === 'Income') totalInc += amt;
                    else if (!t.excluded) totalExp += amt;
                });

                // (2026-07-13) Render compact dot indicators to prevent grid expansion; prev: full text chip
                let billChipsHtml = '';
                if (dayBills.length > 0) {
                    billChipsHtml = `<div class="calendar-day-bills" style="display:flex; gap:3px; margin-bottom:2px; justify-content:center; align-items:center;">` +
                        dayBills.map(b => `
                            <span class="calendar-bill-dot ${b.paid ? 'paid' : ''}" style="width:6px; height:6px; border-radius:50%; background:${b.color || '#3b82f6'}; display:inline-block; ${b.paid ? 'opacity:0.4;' : ''}" title="${b.title}${b.amount ? ': ₱' + b.amount.toLocaleString() : ''}"></span>
                        `).join('') +
                        `</div>`;
                }

                let chips = '<div class="calendar-day-amounts">';
                if (totalExp > 0) chips += `<div class="calendar-amount-chip expense">-${Math.round(totalExp).toLocaleString()}</div>`;
                if (totalInc > 0) chips += `<div class="calendar-amount-chip income">+${Math.round(totalInc).toLocaleString()}</div>`;
                chips += '</div>';

                cell.innerHTML = `<span class="calendar-day-num">${d}</span>${billChipsHtml}${chips}`;
                cell.onclick = () => this.openDayModal(cellDate, dayTxns);
                grid.appendChild(cell);
            }

            this.renderUpcomingBillsCard();
        },

        renderUpcomingBillsCard: function() {
            const listEl = document.getElementById('calendar-bills-card-list');
            if (!listEl) return;

            const todayObj = new Date();
            const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
            
            const in7DaysObj = new Date(todayObj.getTime() + 7 * 86400000);
            const in7DaysStr = `${in7DaysObj.getFullYear()}-${String(in7DaysObj.getMonth() + 1).padStart(2, '0')}-${String(in7DaysObj.getDate()).padStart(2, '0')}`;

            const todayBills = (this.getBillsForDate ? this.getBillsForDate(todayStr) : this.bills.filter(b => b.date === todayStr)).filter(b => !b.paid);
            
            const weekBills = [];
            const upcomingBills = [];

            (this.bills || []).forEach(b => {
                const bDateStr = b.date;
                if (bDateStr > todayStr && bDateStr <= in7DaysStr && !b.paid) {
                    if (!weekBills.some(x => x.id === b.id)) weekBills.push(b);
                } else if (bDateStr > in7DaysStr && !b.paid) {
                    if (!upcomingBills.some(x => x.id === b.id)) upcomingBills.push(b);
                }
            });

            const renderBillItem = (b) => `
                <div class="bill-card-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; transition: all 0.2s; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 38px; height: 38px; border-radius: 12px; background: ${b.color || '#3b82f6'}; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.12); flex-shrink: 0;">
                            <i class="material-icons" style="font-size: 18px;">${b.icon || 'receipt_long'}</i>
                        </div>
                        <div>
                            <div style="font-size: 13px; font-weight: 800; color: #1e293b; text-transform: capitalize;">${b.title}</div>
                            <div style="font-size: 10px; font-weight: 700; color: #64748b; margin-top: 2px;">
                                Due: ${b.date} ${b.repeat && b.repeat !== 'none' ? '• Repeat ' + b.repeat : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="text-align: right;">
                            <div style="font-size: 13px; font-weight: 900; color: #1e293b;">${b.amount ? '₱' + b.amount.toLocaleString() : 'No amount'}</div>
                            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 6px; display: inline-block; margin-top: 2px; ${b.paid ? 'background: #dcfce7; color: #15803d;' : 'background: #fee2e2; color: #b91c1c;'}">${b.paid ? 'Paid' : 'Pending'}</span>
                        </div>
                        <button onclick="window.CalendarView.toggleBillPaid('${b.id}')" title="Toggle Paid Status" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${b.paid ? '#10b981' : '#64748b'}; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                            <i class="material-icons" style="font-size: 18px;">${b.paid ? 'check_circle' : 'radio_button_unchecked'}</i>
                        </button>
                    </div>
                </div>
            `;

            let cardHtml = '';
            // (2026-07-13) Auto-hide empty sections; prev: fixed tab filter list
            if (todayBills.length > 0) {
                cardHtml += `<div class="bill-section" style="margin-bottom: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: #2563eb; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="material-icons" style="font-size: 14px;">today</i>
                        <span>Due Today (${todayBills.length})</span>
                    </div>
                    ${todayBills.map(renderBillItem).join('')}
                </div>`;
            }

            if (weekBills.length > 0) {
                cardHtml += `<div class="bill-section" style="margin-bottom: 12px;">
                    <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="material-icons" style="font-size: 14px;">date_range</i>
                        <span>This Week (${weekBills.length})</span>
                    </div>
                    ${weekBills.map(renderBillItem).join('')}
                </div>`;
            }

            if (upcomingBills.length > 0) {
                cardHtml += `<div class="bill-section">
                    <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        <i class="material-icons" style="font-size: 14px;">upcoming</i>
                        <span>Upcoming (${upcomingBills.length})</span>
                    </div>
                    ${upcomingBills.map(renderBillItem).join('')}
                </div>`;
            }

            if (!cardHtml) {
                cardHtml = `<div style="text-align: center; padding: 24px 0; color: #94a3b8; font-size: 12px; font-weight: 700;">No upcoming bills to pay.</div>`;
            }

            listEl.innerHTML = cardHtml;
        },

        // (2026-07-13) Inline row popover editor used instead of openAddBillPrompt; prev: JS prompt popups

        openDayModal: function(date, dayTxns) {
            const modal = document.getElementById('calendar-txn-modal');
            const modalBody = document.getElementById('calendar-modal-body');
            const modalTitle = document.getElementById('calendar-modal-date-title');
            const modalFooter = document.getElementById('calendar-modal-footer-summary');

            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            modalTitle.innerText = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
            
            const dayBills = this.getBillsForDate ? this.getBillsForDate(dateStr) : this.bills.filter(b => b.date === dateStr);

            // (2026-07-13) Modal trigger for Add Bill or Reminder without arrow icon; prev: arrow icon included
            let billsSectionHtml = `
                <div class="calendar-top-add-bill-row" onclick="window.CalendarView.openAddBillModal('${dateStr}')" style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#f8fafc; border:1.5px dashed #cbd5e1; border-radius:16px; margin-bottom:16px; cursor:pointer; user-select:none; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:32px; height:32px; border-radius:10px; background:#ebf5ff; color:#2563eb; display:flex; align-items:center; justify-content:center;">
                            <i class="material-icons" style="font-size:18px;">add</i>
                        </div>
                        <div>
                            <div style="font-size:11.8px; font-weight:800; color:#1e293b; text-transform:uppercase; letter-spacing:-0.2px;">+ Add Bill or Reminder</div>
                            <div style="font-size:8.6px; font-weight:700; color:#64748b;">Set electricity, water, rent, or recurring billers</div>
                        </div>
                    </div>
                </div>
                ${dayBills.length > 0 ? `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:16px;">` + dayBills.map(b => `
                    <div style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border-radius:12px; padding:10px 12px; border:1px solid #dbeafe; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <div style="width:30px; height:30px; border-radius:8px; background:${b.color || '#3b82f6'}; color:#fff; display:flex; align-items:center; justify-content:center;">
                                <i class="material-icons" style="font-size:16px;">${b.icon || 'receipt_long'}</i>
                            </div>
                            <div>
                                <div style="font-size:11.8px; font-weight:800; color:#1e293b;">${b.title}</div>
                                <div style="font-size:9px; font-weight:700; color:#64748b;">${b.amount ? '₱' + b.amount.toLocaleString() : 'No amount'}</div>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <button onclick="window.CalendarView.toggleBillPaid('${b.id}'); window.CalendarView.openDayModal(new Date('${dateStr}'), window.CalendarView.txns.filter(t => t.date && t.date.split('T')[0] === '${dateStr}'));" style="background:${b.paid ? '#dcfce7' : '#f1f5f9'}; color:${b.paid ? '#15803d' : '#475569'}; border:none; border-radius:6px; padding:4px 8px; font-size:9px; font-weight:800; cursor:pointer;">${b.paid ? 'Paid' : 'Pending'}</button>
                            <button onclick="window.CalendarView.deleteBill('${b.id}'); window.CalendarView.openDayModal(new Date('${dateStr}'), window.CalendarView.txns.filter(t => t.date && t.date.split('T')[0] === '${dateStr}'));" style="background:transparent; color:#ef4444; border:none; cursor:pointer; padding:2px;"><i class="material-icons" style="font-size:16px;">delete</i></button>
                        </div>
                    </div>
                `).join('') + `</div>` : ''}
            `;

            let txnsHtml = '';
            if (dayTxns.length === 0) {
                txnsHtml = `<div class="calendar-no-txns" style="text-align:center; padding:20px 0; color:#94a3b8; font-weight:700;">No transactions on this day.</div>`;
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

                txnsHtml = Object.keys(categoryGroups)
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

            modalBody.innerHTML = billsSectionHtml + txnsHtml;

            modal.classList.add('show');
            if (window.NavState) window.NavState.pushModalState('calendar-modal', () => this.closeModal());
        },

        selectedBillColor: '#3b82f6',
        selectedBillIcon: 'bolt',

        currentBillModalDate: null,
        selectedModalBillColor: '#3b82f6',
        selectedModalBillIcon: 'bolt',
        selectedModalBillRepeat: 'monthly',

        // (2026-07-13) Dynamic body injection & top z-index 2147483647; prev: query existing
        ensureAddBillModalExists: function() {
            let modal = document.getElementById('add-bill-modal');
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = 'add-bill-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                    <div style="background:#ffffff; border-radius:24px; padding:20px; width:100%; max-width:400px; box-shadow:0 20px 40px rgba(0,0,0,0.3); border:1px solid #cbd5e1; position:relative; z-index:2147483647;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="width:34px; height:34px; border-radius:10px; background:#ebf5ff; color:#2563eb; display:flex; align-items:center; justify-content:center;">
                                    <i class="material-icons" style="font-size:20px;">event_note</i>
                                </div>
                                <div>
                                    <div style="font-size:14px; font-weight:800; color:#1e293b;">New Bill / Reminder</div>
                                    <div style="font-size:10px; font-weight:600; color:#64748b;" id="add-bill-modal-date-subtitle">Set recurring or one-time biller</div>
                                </div>
                            </div>
                            <i class="material-icons" onclick="window.CalendarView && window.CalendarView.closeAddBillModal()" style="font-size:20px; color:#94a3b8; cursor:pointer; padding:4px;">close</i>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; display:block; margin-bottom:4px;">Biller Name</label>
                            <input type="text" id="bill-modal-input-title" placeholder="e.g. Meralco, Maynilad, Netflix, Atome" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; outline:none; background:#f8fafc;" />
                        </div>
                        <div style="display:flex; gap:10px; margin-bottom:12px;">
                            <div style="flex:1;">
                                <label style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; display:block; margin-bottom:4px;">Amount (₱)</label>
                                <input type="number" id="bill-modal-input-amount" placeholder="0.00" style="width:100%; padding:10px 12px; border-radius:12px; border:1px solid #cbd5e1; font-size:12px; font-weight:700; outline:none; background:#f8fafc;" />
                            </div>
                            <div style="flex:1;">
                                <label style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; display:block; margin-bottom:4px;">Category Icon</label>
                                <div class="custom-bill-icon-dropdown" style="position:relative;">
                                    <div id="bill-modal-icon-trigger" onclick="window.CalendarView && window.CalendarView.toggleBillIconDropdownModal()" style="display:flex; align-items:center; justify-content:space-between; padding:9px 10px; border-radius:12px; border:1px solid #cbd5e1; font-size:11px; font-weight:700; background:#f8fafc; cursor:pointer;">
                                        <div style="display:flex; align-items:center; gap:6px; overflow:hidden;" id="selected-bill-modal-icon-display">
                                            <i class="material-icons" style="font-size:16px; color:#2563eb; flex-shrink:0;">bolt</i>
                                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Electricity</span>
                                        </div>
                                        <i class="material-icons" style="font-size:16px; color:#94a3b8;">unfold_more</i>
                                    </div>
                                    <div id="bill-modal-icon-dropdown-menu" style="display:none; position:absolute; top:calc(100% + 4px); left:0; right:0; max-height:180px; overflow-y:auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.18); z-index:2147483647 !important; padding:4px;">
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('bolt', 'Electricity')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#3b82f6;">bolt</i><span>Electricity</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('water_drop', 'Water')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#06b6d4;">water_drop</i><span>Water</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('wifi', 'Internet / Wifi')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#3b82f6;">wifi</i><span>Internet / Wifi</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('house', 'Rent / Housing')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#f59e0b;">house</i><span>Rent / Housing</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('credit_card', 'Credit Card')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#ef4444;">credit_card</i><span>Credit Card</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('subscriptions', 'Streaming Services')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#8b5cf6;">subscriptions</i><span>Streaming Services</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('smartphone', 'Phone / Mobile')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#10b981;">smartphone</i><span>Phone / Mobile</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('security', 'Insurance')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#3b82f6;">security</i><span>Insurance</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('local_hospital', 'Medical / Health')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#ef4444;">local_hospital</i><span>Medical / Health</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('fitness_center', 'Gym / Fitness')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#f59e0b;">fitness_center</i><span>Gym / Fitness</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('school', 'Tuition / Education')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#8b5cf6;">school</i><span>Tuition / Education</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('account_balance', 'Loan / Mortgage')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#10b981;">account_balance</i><span>Loan / Mortgage</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('directions_car', 'Vehicle / Auto')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#06b6d4;">directions_car</i><span>Vehicle / Auto</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('card_membership', 'Subscription')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#8b5cf6;">card_membership</i><span>Subscription</span></div>
                                        <div class="bill-icon-option" onclick="window.CalendarView.selectBillIconModal('receipt_long', 'Generic Bill')" style="display:flex; align-items:center; gap:8px; padding:7px 9px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;"><i class="material-icons" style="font-size:16px; color:#64748b;">receipt_long</i><span>Generic Bill</span></div>
                                    </div>
                                    <input type="hidden" id="bill-modal-input-icon" value="bolt" />
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase; display:block; margin-bottom:4px;">Repeat Frequency</label>
                            <div class="custom-bill-repeat-dropdown" style="position:relative;">
                                <div id="bill-modal-repeat-trigger" onclick="window.CalendarView && window.CalendarView.toggleBillRepeatDropdownModal()" style="display:flex; align-items:center; justify-content:space-between; padding:9px 10px; border-radius:12px; border:1px solid #cbd5e1; font-size:11px; font-weight:700; background:#f8fafc; cursor:pointer;">
                                    <span id="selected-bill-modal-repeat-display">Every Month</span>
                                    <i class="material-icons" style="font-size:16px; color:#94a3b8;">keyboard_arrow_down</i>
                                </div>
                                <div id="bill-modal-repeat-dropdown-menu" style="display:none; position:absolute; top:calc(100% + 4px); left:0; right:0; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.18); z-index:2147483647 !important; padding:4px;">
                                    <div class="bill-repeat-option" onclick="window.CalendarView.selectBillRepeatModal('monthly', 'Every Month')" style="padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;">Every Month</div>
                                    <div class="bill-repeat-option" onclick="window.CalendarView.selectBillRepeatModal('this_month', 'This Month Only')" style="padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;">This Month Only</div>
                                    <div class="bill-repeat-option" onclick="window.CalendarView.selectBillRepeatModal('yearly', 'Every Year')" style="padding:8px 10px; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1e293b;">Every Year</div>
                                </div>
                                <input type="hidden" id="bill-modal-input-repeat" value="monthly" />
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; background:#f8fafc; padding:10px 12px; border-radius:12px; border:1px solid #e2e8f0;">
                            <span style="font-size:10px; font-weight:800; color:#64748b; text-transform:uppercase;">Color Tag:</span>
                            <div style="display:flex; gap:8px;">
                                <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#3b82f6')" class="bill-modal-color-swatch active" data-color="#3b82f6" style="width:24px; height:24px; border-radius:50%; background:#3b82f6; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                                <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#ef4444')" class="bill-modal-color-swatch" data-color="#ef4444" style="width:24px; height:24px; border-radius:50%; background:#ef4444; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                                <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#10b981')" class="bill-modal-color-swatch" data-color="#10b981" style="width:24px; height:24px; border-radius:50%; background:#10b981; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                                <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#f59e0b')" class="bill-modal-color-swatch" data-color="#f59e0b" style="width:24px; height:24px; border-radius:50%; background:#f59e0b; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                                <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#8b5cf6')" class="bill-modal-color-swatch" data-color="#8b5cf6" style="width:24px; height:24px; border-radius:50%; background:#8b5cf6; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                                <span onclick="window.CalendarView && window.CalendarView.selectBillColorModal('#06b6d4')" class="bill-modal-color-swatch" data-color="#06b6d4" style="width:24px; height:24px; border-radius:50%; background:#06b6d4; cursor:pointer; display:inline-block; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                            </div>
                        </div>
                        <button id="btn-submit-modal-bill" onclick="window.CalendarView && window.CalendarView.submitModalBill()" style="width:100%; background:#2563eb; color:#fff; border:none; border-radius:12px; padding:12px; font-size:12px; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.3); transition:all 0.2s;">Save Bill Reminder</button>
                    </div>
                `;
                document.body.appendChild(modal);
            }
            return modal;
        },

        openAddBillModal: function(dateStr) {
            this.currentBillModalDate = dateStr || new Date().toISOString().split('T')[0];
            const modal = this.ensureAddBillModalExists();
            const subtitle = document.getElementById('add-bill-modal-date-subtitle');
            if (subtitle) subtitle.innerText = `Due Date: ${this.currentBillModalDate}`;
            if (modal) {
                modal.style.cssText = "display: flex !important; position: fixed !important; inset: 0 !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(15,23,42,0.75) !important; backdrop-filter: blur(6px) !important; z-index: 2147483647 !important; align-items: center !important; justify-content: center !important; padding: 16px !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;";
                modal.classList.add('show');
            }
            if (window.NavState) window.NavState.pushModalState('add-bill-modal', () => this.closeAddBillModal());
        },

        closeAddBillModal: function() {
            const modal = document.getElementById('add-bill-modal');
            if (modal) {
                modal.classList.remove('show');
                modal.style.cssText = "display: none !important;";
            }
            if (window.NavState) window.NavState.popModalState('add-bill-modal');
        },

        toggleBillIconDropdownModal: function() {
            const menu = document.getElementById('bill-modal-icon-dropdown-menu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || !menu.style.display;
                menu.style.display = isHidden ? 'block' : 'none';
            }
        },

        selectBillIconModal: function(iconName, label) {
            this.selectedModalBillIcon = iconName;
            const hiddenInput = document.getElementById('bill-modal-input-icon');
            if (hiddenInput) hiddenInput.value = iconName;

            const displayContainer = document.getElementById('selected-bill-modal-icon-display');
            if (displayContainer) {
                displayContainer.innerHTML = `<i class="material-icons" style="font-size:16px; color:#2563eb; flex-shrink:0;">${iconName}</i><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${label}</span>`;
            }
            const menu = document.getElementById('bill-modal-icon-dropdown-menu');
            if (menu) menu.style.display = 'none';
        },

        toggleBillRepeatDropdownModal: function() {
            const menu = document.getElementById('bill-modal-repeat-dropdown-menu');
            if (menu) {
                const isHidden = menu.style.display === 'none' || !menu.style.display;
                menu.style.display = isHidden ? 'block' : 'none';
            }
        },

        selectBillRepeatModal: function(repeatVal, label) {
            this.selectedModalBillRepeat = repeatVal;
            const hiddenInput = document.getElementById('bill-modal-input-repeat');
            if (hiddenInput) hiddenInput.value = repeatVal;

            const displayEl = document.getElementById('selected-bill-modal-repeat-display');
            if (displayEl) displayEl.innerText = label;

            const menu = document.getElementById('bill-modal-repeat-dropdown-menu');
            if (menu) menu.style.display = 'none';
        },

        selectBillColorModal: function(hex) {
            this.selectedModalBillColor = hex;
            document.querySelectorAll('.bill-modal-color-swatch').forEach(sw => {
                const isMatch = sw.dataset.color === hex;
                sw.style.border = isMatch ? '2px solid #1e293b' : '2px solid #fff';
                sw.classList.toggle('active', isMatch);
            });
        },

        submitModalBill: function() {
            const titleInput = document.getElementById('bill-modal-input-title');
            const amtInput = document.getElementById('bill-modal-input-amount');
            const iconInput = document.getElementById('bill-modal-input-icon');
            const repeatInput = document.getElementById('bill-modal-input-repeat');
            const submitBtn = document.getElementById('btn-submit-modal-bill');

            if (!titleInput || !titleInput.value.trim()) {
                if (window.showToast) window.showToast('Please enter a biller name');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="material-icons spin" style="font-size:14px; animation: spin 0.8s linear infinite; vertical-align:middle; margin-right:4px;">sync</i> Saving...`;
            }

            const targetDateStr = this.currentBillModalDate || new Date().toISOString().split('T')[0];

            this.addBill({
                title: titleInput.value.trim(),
                amount: parseFloat(amtInput?.value) || 0,
                date: targetDateStr,
                icon: iconInput?.value || this.selectedModalBillIcon || 'receipt_long',
                color: this.selectedModalBillColor || '#3b82f6',
                repeat: repeatInput?.value || this.selectedModalBillRepeat || 'monthly'
            });

            if (window.showToast) window.showToast('Bill reminder saved successfully!');

            setTimeout(() => {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `Save Bill Reminder`;
                }
                titleInput.value = '';
                if (amtInput) amtInput.value = '';
                this.closeAddBillModal();

                if (typeof window.openCalendarModal === 'function') {
                    window.openCalendarModal(new Date(targetDateStr));
                } else {
                    const dayTxns = (this.txns || []).filter(t => t.date && t.date.split('T')[0] === targetDateStr);
                    this.openDayModal(new Date(targetDateStr), dayTxns);
                }
            }, 300);
        },

        // (2026-07-13) Redirect toggleInlineBillForm to openAddBillModal; prev: inline sliding form toggle
        toggleInlineBillForm: function(dateStr) {
            this.openAddBillModal(dateStr);
        },

        submitInlineBill: function(dateStr, btnEl) {
            const titleInput = document.getElementById('bill-input-title');
            const amtInput = document.getElementById('bill-input-amount');
            const iconInput = document.getElementById('bill-input-icon');
            const repeatInput = document.getElementById('bill-input-repeat');
            if (!titleInput || !titleInput.value.trim()) {
                if (window.showToast) window.showToast('Please enter a biller name');
                return;
            }

            const targetBtn = btnEl || event?.currentTarget || document.querySelector('#day-modal-bill-form button');
            if (targetBtn) {
                targetBtn.disabled = true;
                targetBtn.innerHTML = `<i class="material-icons spin" style="font-size:14px; animation: spin 0.8s linear infinite; vertical-align:middle; margin-right:4px;">sync</i> Saving...`;
            }

            this.addBill({
                title: titleInput.value.trim(),
                amount: parseFloat(amtInput?.value) || 0,
                date: dateStr,
                icon: iconInput?.value || this.selectedBillIcon || 'receipt_long',
                color: this.selectedBillColor || '#3b82f6',
                repeat: repeatInput?.value || this.selectedBillRepeat || 'monthly'
            });

            if (window.showToast) window.showToast('Bill reminder saved successfully!');

            setTimeout(() => {
                if (typeof window.openCalendarModal === 'function') {
                    window.openCalendarModal(new Date(dateStr));
                } else {
                    const dayTxns = this.txns.filter(t => t.date && t.date.split('T')[0] === dateStr);
                    this.openDayModal(new Date(dateStr), dayTxns);
                }
            }, 250);
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
            
            // [FIXED: 2026-07-01] Format date as "June 4" instead of "2026-06-04"
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                console.log('🗓️ Formatting date:', dateStr); // DEBUG
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                // [FIX: Handle both "2026-06-04" and "2026-06-04T00:00:00" formats
                const dateOnly = String(dateStr).split('T')[0].trim();
                const parts = dateOnly.split('-');
                console.log('🗓️ Date parts:', parts); // DEBUG
                if (parts.length === 3) {
                    const year = parseInt(parts[0], 10);
                    const monthNum = parseInt(parts[1], 10) - 1;
                    const day = parseInt(parts[2], 10);
                    console.log('🗓️ Parsed:', { year, monthNum, day }); // DEBUG
                    if (monthNum >= 0 && monthNum < 12 && day > 0 && day <= 31) {
                        const formatted = `${months[monthNum]} ${day}`;
                        console.log('🗓️ Formatted:', formatted); // DEBUG
                        return formatted;
                    }
                }
                console.log('🗓️ Format failed, returning original:', dateStr); // DEBUG
                return dateStr;
            };
            
            // [ADDED: 2026-07-01] Get account logo badge
            const account = t.account || window.currentAccount || 'atome';
            const accountBadge = account === 'bpi' 
                ? '<div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.12); border: 2px solid #fff; overflow: hidden; padding: 1.5px; z-index: 2;"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/BPI_logo.svg/320px-BPI_logo.svg.png" alt="BPI" style="width: 100%; height: 100%; object-fit: contain;"></div>'
                : '<div style="position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.12); border: 2px solid #fff; overflow: hidden; padding: 1.5px; z-index: 2;"><img src="https://asset.brandfetch.io/idv-ndb21F/id65dSTrJP.png" alt="Atome" style="width: 100%; height: 100%; object-fit: contain;"></div>';
            
            // [ADDED: 2026-07-01] Build meta info string with date and category
            const dateFormatted = formatDate(t.date);
            const metaText = `${dateFormatted} • ${mapped.category || ''}`;
            
            // [ADDED: 2026-07-01] Include note if available
            const noteHtml = (t.note && t.note.trim()) 
                ? `<div style="font-size: 9.03px; font-weight: 700; color: #7c3aed; margin-top: 1px; white-space: nowrap; overflow: hidden; mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); font-family: 'Plus Jakarta Sans', sans-serif !important;">${t.note}</div>` 
                : '';
            
            return `
                <div class="calendar-txn-chip ${isInc ? 'income' : 'expense'}" style="display:flex; align-items:center; gap:14px; padding:12px 16px; background:#fff; border:1px solid #f1f5f9; border-radius:16px; margin-bottom:12px; ${t.excluded ? 'opacity:0.5' : ''}; font-family: 'Plus Jakarta Sans', sans-serif !important;">
                    <div class="history-icon ${iconClass}" style="width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; position:relative;">
                        <i class="material-icons" style="font-size:20px;">${iconName}</i>
                        ${accountBadge}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size: 10.91px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 1px; letter-spacing: -0.3px; line-height: 1.3; white-space: nowrap; overflow: hidden; position: relative; mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); font-family: 'Plus Jakarta Sans', sans-serif !important;">${mapped.name || 'UNKNOWN'}</div>
                        <div style="font-size: 8.64px; font-weight: 700; color: #475569; text-transform: uppercase; white-space: nowrap; overflow: hidden; mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); font-family: 'Plus Jakarta Sans', sans-serif !important;">${metaText}</div>
                        ${noteHtml}
                    </div>
                    <div style="font-size: 11.8px; font-weight: 800; text-align: right; white-space: nowrap; color: ${isInc ? '#10b981' : '#f43f5e'}; font-family: 'Plus Jakarta Sans', sans-serif !important;">${isInc ? '+' : '-'}₱${Math.abs(amt).toLocaleString()}</div>
                </div>
            `;
        }
    };

    // (2026-07-13) Expose window.openAddBillModal directly for inline handlers; prev: window.CalendarView only
    window.openAddBillModal = function(dateStr) {
        if (window.CalendarView && typeof window.CalendarView.openAddBillModal === 'function') {
            window.CalendarView.openAddBillModal(dateStr);
        }
    };
})(window);
