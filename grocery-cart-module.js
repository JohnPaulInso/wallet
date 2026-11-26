// (2026-07-13) Itemized Cart, Grocery Donut Chart, Checklist & Price Tracker; prev: absent
(function () {
    const SUB_CATEGORIES = [
        { id: 'food', label: 'Food', icon: 'lunch_dining', bg: '#ecfdf5', color: '#10b981' },
        { id: 'drinks', label: 'Drinks', icon: 'local_cafe', bg: '#f0f9ff', color: '#0284c7' },
        { id: 'snacks', label: 'Snacks', icon: 'cookie', bg: '#fef9c3', color: '#eab308' },
        { id: 'essentials', label: 'Essentials', icon: 'cleaning_services', bg: '#f5f3ff', color: '#8b5cf6' },
        { id: 'gear', label: 'Gear', icon: 'backpack', bg: '#fff7ed', color: '#ea580c' },
        { id: 'shipping', label: 'Shipping', icon: 'local_shipping', bg: '#f1f5f9', color: '#64748b' },
        { id: 'other', label: 'Other', icon: 'inventory_2', bg: '#f8fafc', color: '#475569' }
    ];

    const AUTO_SHOW_CATS = ['online shopping', 'shopping', 'food & drinks', 'sport'];
    const CHECKLIST_STORAGE_PREFIX = 'wallet_shopping_checklist_';

    let cartItems = [];
    let cartShipping = 0;
    let cartDiscount = 0;
    let cartOrderId = '';
    let cartDeliveryDate = '';
    let cartDeliveryStatus = null;
    let cartExpanded = false;
    let cartForceShown = false;
    let activeModalTab = 'breakdown';
    let activeSubFilter = null;
    let activeSourceFilter = 'all';
    let groceryDonutChart = null;
    let checklistItems = [];
    let pendingClearChecklistIds = [];

    function getSubMeta(id) {
        return SUB_CATEGORIES.find(s => s.id === id) || SUB_CATEGORIES[SUB_CATEGORIES.length - 1];
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function getAllTxnsPool() {
        const map = new Map();
        const addList = (list) => {
            if (!Array.isArray(list)) return;
            list.forEach(t => { if (t && t.id && !t.deleted) map.set(t.id, t); });
        };
        addList(window.allTxns);
        if (window.walletTxns) {
            Object.values(window.walletTxns).forEach(addList);
        }
        return Array.from(map.values());
    }

    function buildPriceHistoryIndex(excludeTxnId = null) {
        const index = {};
        const pool = getAllTxnsPool();
        pool.forEach(t => {
            if (!Array.isArray(t.items) || t.id === excludeTxnId) return;
            const dateStr = t.date || '';
            t.items.forEach(it => {
                const key = String(it.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const price = Number(it.unitPrice) || 0;
                if (key.length < 3 || price <= 0) return;
                if (!index[key]) index[key] = { name: it.name, subCategory: it.subCategory || 'other', entries: [] };
                if (it.subCategory && it.subCategory !== 'other') index[key].subCategory = it.subCategory;
                index[key].entries.push({ price, date: dateStr, merchant: t.merchant || 'Store' });
            });
        });
        Object.values(index).forEach(rec => {
            rec.entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            rec.latest = rec.entries[0];
            rec.lowest = rec.entries.reduce((min, cur) => cur.price < min.price ? cur : min, rec.entries[0]);
        });
        return index;
    }

    function computeCartTotal() {
        const sub = cartItems.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.unitPrice) || 0)), 0);
        return Math.max(0, Math.round((sub + (Number(cartShipping) || 0) - (Number(cartDiscount) || 0)) * 100) / 100);
    }

    function isBankSyncedEditing() {
        const id = window.editingTxnId;
        if (!id) return false;
        return /^(bpi_|txn_|sync_|mari_)/i.test(id);
    }

    function buildAutoSummaryNote() {
        if (cartItems.length === 0) return '';
        const names = cartItems.map(it => {
            const short = String(it.name || '').trim().split(/\s+/).slice(0, 3).join(' ');
            return (it.qty > 1 ? `${it.qty}x ` : '') + short;
        }).filter(Boolean);
        let summary = `${cartItems.length} item${cartItems.length > 1 ? 's' : ''}: ${names.slice(0, 2).join(', ')}`;
        if (names.length > 2) summary += ` +${names.length - 2}`;
        if (cartShipping > 0) summary += ` +₱${cartShipping} ship`;
        return summary.slice(0, 64);
    }

    function syncAmountAndNote() {
        const total = computeCartTotal();
        const amtInput = document.getElementById('manual-amt');
        const syncBtn = document.getElementById('cart-sync-total-btn');
        const totalEl = document.getElementById('cart-computed-total');
        if (totalEl) totalEl.textContent = `₱${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const hasData = cartItems.length > 0 || cartShipping > 0 || cartDiscount > 0;
        if (amtInput && hasData) {
            const curAmt = parseFloat(amtInput.value) || 0;
            if (!isBankSyncedEditing()) {
                if (total > 0) {
                    amtInput.value = total.toFixed(2);
                    if (typeof window.checkSplitTrigger === 'function') window.checkSplitTrigger();
                }
                if (syncBtn) syncBtn.style.display = 'none';
            } else {
                if (syncBtn) {
                    const diff = Math.abs(curAmt - total) > 0.01 && total > 0;
                    syncBtn.style.display = diff ? 'inline-flex' : 'none';
                    syncBtn.textContent = `Sync Total (₱${total.toLocaleString()})`;
                }
            }
        } else if (syncBtn) {
            syncBtn.style.display = 'none';
        }

        const noteInput = document.getElementById('manual-note');
        if (noteInput && cartItems.length > 0) {
            const autoNote = buildAutoSummaryNote();
            if (!noteInput.dataset.userEdited || !noteInput.value.trim()) {
                noteInput.value = autoNote;
            }
        }
    }

    function renderCartRows() {
        const listEl = document.getElementById('manual-cart-items-list');
        const badgeEl = document.getElementById('manual-cart-summary-badge');
        if (!listEl) return;

        const total = computeCartTotal();
        if (badgeEl) {
            if (cartItems.length === 0 && !cartOrderId && cartShipping === 0) {
                badgeEl.textContent = 'Add items or scan receipt';
            } else {
                const parts = [];
                if (cartItems.length > 0) parts.push(`${cartItems.length} item${cartItems.length > 1 ? 's' : ''}`);
                if (cartShipping > 0) parts.push(`+₱${cartShipping} ship`);
                if (total > 0) parts.push(`₱${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                badgeEl.textContent = parts.join(' • ');
            }
        }

        const priceIdx = buildPriceHistoryIndex(window.editingTxnId);

        if (cartItems.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;padding:12px 8px;color:#94a3b8;font-size:12px;">No items listed yet. Tap <b>Scan Receipt</b> or <b>+ Add Item</b>.</div>`;
        } else {
            listEl.innerHTML = cartItems.map((it, idx) => {
                const sm = getSubMeta(it.subCategory);
                const lineTotal = (Number(it.qty) || 1) * (Number(it.unitPrice) || 0);
                const pKey = String(it.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                let pricePill = '';
                if (pKey.length >= 3 && priceIdx[pKey] && Number(it.unitPrice) > 0) {
                    const prevPrice = priceIdx[pKey].latest.price;
                    const diff = Math.round((Number(it.unitPrice) - prevPrice) * 100) / 100;
                    if (diff > 0.01) {
                        pricePill = `<span style="font-size:9.5px;font-weight:800;background:#fee2e2;color:#dc2626;padding:2px 6px;border-radius:6px;">↑ ₱${diff.toLocaleString()}</span>`;
                    } else if (diff < -0.01) {
                        pricePill = `<span style="font-size:9.5px;font-weight:800;background:#ecfdf5;color:#059669;padding:2px 6px;border-radius:6px;">↓ ₱${Math.abs(diff).toLocaleString()}</span>`;
                    }
                }
                return `
                    <!-- (2026-07-13) Right-align qty & price, drop duplicate total; prev: dup price -->
                    <div class="cart-item-row" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
                        <button type="button" title="Cycle sub-category: ${sm.label}" onclick="window.CartModule.cycleItemSubCat(${idx})"
                            style="width:32px;height:32px;border-radius:10px;border:none;background:${sm.bg};color:${sm.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;">
                            <i class="material-icons" style="font-size:17px;">${sm.icon}</i>
                        </button>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <input type="text" value="${escapeHtml(it.name)}" placeholder="Item name..."
                                    oninput="window.CartModule.updateItem(${idx}, 'name', this.value)"
                                    style="width:100%;border:none;outline:none;background:transparent;font-size:12.5px;font-weight:700;color:#1e293b;padding:0;">
                                ${pricePill}
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                                <span style="font-size:10px;font-weight:700;color:${sm.color};white-space:nowrap;">${sm.label}</span>
                                <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
                                    <div style="display:flex;align-items:center;gap:3px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:1px 4px;">
                                        <button type="button" onclick="window.CartModule.stepQty(${idx}, -1)" style="border:none;background:transparent;color:#64748b;font-weight:800;cursor:pointer;padding:0 3px;">-</button>
                                        <span style="font-size:11px;font-weight:800;color:#0f172a;">${it.qty}x</span>
                                        <button type="button" onclick="window.CartModule.stepQty(${idx}, 1)" style="border:none;background:transparent;color:#64748b;font-weight:800;cursor:pointer;padding:0 3px;">+</button>
                                    </div>
                                    <div style="display:flex;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:2px 6px;width:76px;">
                                        <span style="font-size:11px;color:#94a3b8;font-weight:700;margin-right:2px;">₱</span>
                                        <input type="number" step="0.01" min="0" value="${it.unitPrice || ''}" placeholder="0"
                                            oninput="window.CartModule.updateItem(${idx}, 'unitPrice', this.value)"
                                            style="width:100%;border:none;outline:none;background:transparent;font-size:11.5px;font-weight:700;color:#0f172a;padding:0;text-align:right;">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <button type="button" onclick="window.CartModule.removeItem(${idx})" style="border:none;background:transparent;color:#94a3b8;cursor:pointer;padding:4px;flex-shrink:0;">
                            <i class="material-icons" style="font-size:17px;">close</i>
                        </button>
                    </div>
                `;
            }).join('');
        }

        const shipEl = document.getElementById('cart-shipping-input');
        const discEl = document.getElementById('cart-discount-input');
        const ordEl = document.getElementById('cart-order-id-input');
        const delEl = document.getElementById('cart-delivery-date-input');
        if (shipEl && document.activeElement !== shipEl) shipEl.value = cartShipping || '';
        if (discEl && document.activeElement !== discEl) discEl.value = cartDiscount || '';
        if (ordEl && document.activeElement !== ordEl) ordEl.value = cartOrderId || '';
        if (delEl && document.activeElement !== delEl) delEl.value = cartDeliveryDate || '';

        syncAmountAndNote();
    }

    function updateVisibilityForCategory(catId) {
        const card = document.getElementById('manual-cart-card');
        const addToggle = document.getElementById('manual-cart-show-toggle');
        const body = document.getElementById('manual-cart-body');
        const chev = document.getElementById('manual-cart-chevron');
        if (!card) return;

        const isAuto = AUTO_SHOW_CATS.includes(String(catId || '').toLowerCase());
        const hasData = cartItems.length > 0 || cartShipping > 0 || cartDiscount > 0 || !!cartOrderId;
        const showCard = isAuto || hasData || cartForceShown;

        card.style.display = showCard ? 'block' : 'none';
        if (addToggle) addToggle.style.display = showCard ? 'none' : 'inline-flex';
        if (body) body.style.display = cartExpanded ? 'block' : 'none';
        if (chev) chev.style.transform = cartExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    function loadChecklistLocal() {
        const uid = window.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid') || 'guest';
        try {
            checklistItems = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_PREFIX + uid) || '[]');
        } catch (e) { checklistItems = []; }
    }

    async function persistChecklist() {
        const uid = window.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid') || 'guest';
        localStorage.setItem(CHECKLIST_STORAGE_PREFIX + uid, JSON.stringify(checklistItems));
        if (window.auth?.currentUser && window.db && window.doc && window.setDoc) {
            try {
                await window.setDoc(window.doc(window.db, 'users', window.auth.currentUser.uid, 'config', 'shopping_checklist'), {
                    items: checklistItems,
                    updatedAt: Date.now()
                }, { merge: true });
            } catch (e) { console.warn('[CartModule] Checklist save failed:', e); }
        }
        window.CartModule.refreshDashboardWidget();
    }

    function renderGroceriesModalContent() {
        const tabBtns = ['breakdown', 'checklist', 'deliveries'];
        tabBtns.forEach(t => {
            const btn = document.getElementById('gc-tab-' + t);
            const pane = document.getElementById('gc-pane-' + t);
            if (btn) {
                btn.style.background = activeModalTab === t ? '#0f172a' : 'transparent';
                btn.style.color = activeModalTab === t ? '#ffffff' : '#64748b';
            }
            if (pane) pane.style.display = activeModalTab === t ? 'block' : 'none';
        });

        if (activeModalTab === 'breakdown') renderBreakdownTab();
        else if (activeModalTab === 'checklist') renderChecklistTab();
        else renderDeliveriesAndPricesTab();
    }

    function renderBreakdownTab() {
        const pool = getAllTxnsPool();
        const now = new Date();
        const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthSel = document.getElementById('gc-month-filter');
        const selectedMonth = monthSel ? monthSel.value : curMonthKey;

        const totals = {};
        SUB_CATEGORIES.forEach(s => { totals[s.id] = 0; });
        const matchedItems = [];

        pool.forEach(t => {
            if (!Array.isArray(t.items) || t.items.length === 0) return;
            if (selectedMonth !== 'all' && !String(t.date || '').startsWith(selectedMonth)) return;
            const catLow = String(t.manualCategory || t.category || '').toLowerCase();
            if (activeSourceFilter === 'groceries' && !['shopping', 'food & drinks'].includes(catLow)) return;
            if (activeSourceFilter === 'online' && catLow !== 'online shopping') return;

            t.items.forEach(it => {
                const amt = (Number(it.qty) || 1) * (Number(it.unitPrice) || 0);
                const sub = totals[it.subCategory] !== undefined ? it.subCategory : 'other';
                totals[sub] += amt;
                matchedItems.push({ ...it, subCategory: sub, lineTotal: amt, merchant: t.merchant, date: t.date, txnId: t.id });
            });
            if (Number(t.shippingFee) > 0) {
                totals.shipping += Number(t.shippingFee);
                matchedItems.push({ name: `Shipping (${t.merchant || 'Order'})`, qty: 1, unitPrice: Number(t.shippingFee), subCategory: 'shipping', lineTotal: Number(t.shippingFee), merchant: t.merchant, date: t.date, txnId: t.id });
            }
        });

        const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
        const centerVal = document.getElementById('gc-donut-total');
        if (centerVal) centerVal.textContent = `₱${grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

        const activeCats = SUB_CATEGORIES.filter(s => totals[s.id] > 0);
        const canvas = document.getElementById('gc-donut-canvas');
        if (canvas && window.Chart) {
            if (groceryDonutChart) groceryDonutChart.destroy();
            groceryDonutChart = new window.Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: activeCats.length ? activeCats.map(s => s.label) : ['No Items'],
                    datasets: [{
                        data: activeCats.length ? activeCats.map(s => totals[s.id]) : [1],
                        backgroundColor: activeCats.length ? activeCats.map(s => s.color) : ['#e2e8f0'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    // (2026-07-13) Thicker donut chart ring; prev: 72% cutout
                    cutout: '56%',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { enabled: activeCats.length > 0 } },
                    onClick: (_, els) => {
                        if (!els.length || !activeCats.length) return;
                        const clickedId = activeCats[els[0].index].id;
                        activeSubFilter = activeSubFilter === clickedId ? null : clickedId;
                        renderBreakdownTab();
                    }
                }
            });
        }

        const legendEl = document.getElementById('gc-donut-legend');
        if (legendEl) {
            legendEl.innerHTML = activeCats.length === 0
                ? `<div style="text-align:center;color:#94a3b8;font-size:12px;grid-column:1/-1;">Add items to transactions or scan a receipt to see your breakdown.</div>`
                : activeCats.map(s => {
                    const pct = grandTotal > 0 ? Math.round((totals[s.id] / grandTotal) * 100) : 0;
                    const isSel = activeSubFilter === s.id;
                    return `
                        <button type="button" onclick="window.CartModule.toggleSubFilter('${s.id}')"
                            style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;border:1.5px solid ${isSel ? s.color : '#e2e8f0'};background:${isSel ? s.bg : '#fff'};cursor:pointer;text-align:left;">
                            <div style="width:26px;height:26px;border-radius:8px;background:${s.bg};color:${s.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="material-icons" style="font-size:15px;">${s.icon}</i>
                            </div>
                            <div style="min-width:0;flex:1;">
                                <div style="font-size:11.5px;font-weight:700;color:#1e293b;">${s.label} <span style="color:#94a3b8;">${pct}%</span></div>
                                <div style="font-size:11px;font-weight:800;color:${s.color};">₱${totals[s.id].toLocaleString()}</div>
                            </div>
                        </button>
                    `;
                }).join('');
        }

        const itemsEl = document.getElementById('gc-breakdown-items');
        if (itemsEl) {
            const visible = activeSubFilter ? matchedItems.filter(it => it.subCategory === activeSubFilter) : matchedItems;
            visible.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            // (2026-07-13) Style Purchased Items cards like native txn cards; prev: gray boxes
            itemsEl.innerHTML = visible.length === 0
                ? `<div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">No itemized purchases for this filter.</div>`
                : visible.map(it => {
                    const sm = getSubMeta(it.subCategory);
                    const shortDate = it.date ? new Date(it.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : '';
                    return `
                        <div style="display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:20px;background:#ffffff;border:1px solid #f1f5f9;box-shadow:0 2px 10px rgba(15,23,42,0.03);">
                            <div style="width:42px;height:42px;border-radius:14px;background:${sm.bg};color:${sm.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="material-icons" style="font-size:20px;">${sm.icon}</i>
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:13px;font-weight:800;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.2px;">${escapeHtml(it.name)}</div>
                                <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;margin-top:2px;">${shortDate ? shortDate + ' • ' : ''}${sm.label} • ${it.qty}x ₱${Number(it.unitPrice).toLocaleString()}</div>
                                ${it.merchant ? `<div style="font-size:11px;font-weight:700;color:${sm.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${escapeHtml(it.merchant)}</div>` : ''}
                            </div>
                            <div style="font-size:14.5px;font-weight:800;color:#1e293b;flex-shrink:0;">₱${it.lineTotal.toLocaleString()}</div>
                        </div>
                    `;
                }).join('');
        }
    }

    function renderChecklistTab() {
        const listEl = document.getElementById('gc-checklist-items');
        const convertBar = document.getElementById('gc-checklist-convert-bar');
        const checkedSummary = document.getElementById('gc-checklist-checked-summary');
        if (!listEl) return;

        if (checklistItems.length === 0) {
            listEl.innerHTML = `<div style="text-align:center;padding:22px 12px;color:#94a3b8;font-size:12.5px;">Your shopping notepad is empty. Add items above to build a checklist before shopping.</div>`;
        } else {
            listEl.innerHTML = checklistItems.map((it, idx) => {
                const sm = getSubMeta(it.subCategory);
                const est = (Number(it.qty) || 1) * (Number(it.estPrice) || 0);
                return `
                    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid ${it.checked ? '#bbf7d0' : '#e2e8f0'};background:${it.checked ? '#f0fdf4' : '#fff'};">
                        <input type="checkbox" ${it.checked ? 'checked' : ''} onchange="window.CartModule.toggleChecklistItem(${idx}, this.checked)"
                            style="width:19px;height:19px;accent-color:#10b981;cursor:pointer;">
                        <div style="width:28px;height:28px;border-radius:8px;background:${sm.bg};color:${sm.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="material-icons" style="font-size:15px;">${sm.icon}</i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:700;color:#1e293b;text-decoration:${it.checked ? 'line-through' : 'none'};opacity:${it.checked ? '0.65' : '1'};">${escapeHtml(it.name)}</div>
                            <div style="font-size:11px;color:#64748b;">${it.qty || 1}x ${it.estPrice > 0 ? '₱' + Number(it.estPrice).toLocaleString() : 'No est. price'} • ${sm.label}</div>
                        </div>
                        ${est > 0 ? `<span style="font-size:12.5px;font-weight:800;color:#0f172a;">₱${est.toLocaleString()}</span>` : ''}
                        <button type="button" onclick="window.CartModule.removeChecklistItem(${idx})" style="border:none;background:transparent;color:#94a3b8;cursor:pointer;padding:2px;">
                            <i class="material-icons" style="font-size:17px;">delete_outline</i>
                        </button>
                    </div>
                `;
            }).join('');
        }

        const checked = checklistItems.filter(it => it.checked);
        const estTotal = checked.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.estPrice) || 0)), 0);
        if (convertBar) convertBar.style.display = checked.length > 0 ? 'flex' : 'none';
        if (checkedSummary) checkedSummary.textContent = `${checked.length} checked • Est. ₱${estTotal.toLocaleString()}`;
    }

    function renderDeliveriesAndPricesTab() {
        const delEl = document.getElementById('gc-deliveries-list');
        const priceEl = document.getElementById('gc-price-watch-list');
        const query = (document.getElementById('gc-price-search')?.value || '').trim().toLowerCase();
        const pool = getAllTxnsPool();

        if (delEl) {
            const pending = pool.filter(t => (t.orderId || t.deliveryDate) && t.deliveryStatus !== 'delivered');
            delEl.innerHTML = pending.length === 0
                ? `<div style="padding:12px;border-radius:14px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center;">No pending deliveries right now.</div>`
                : pending.map(t => `
                    <div style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:16px;background:#fff7ed;border:1px solid #fed7aa;">
                        <div style="width:36px;height:36px;border-radius:10px;background:#fff;color:#ea580c;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="material-icons" style="font-size:19px;">local_shipping</i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:12.5px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.merchant || 'Order')}</div>
                            <div style="font-size:11px;color:#9a3412;font-weight:600;">${t.orderId ? '#' + escapeHtml(t.orderId) : 'Parcel'}${t.deliveryDate ? ' • Est. ' + t.deliveryDate : ''}</div>
                        </div>
                        <button type="button" onclick="window.CartModule.markDelivered('${t.id}', '${t.account || window.currentAccount}')"
                            style="padding:6px 10px;border-radius:10px;border:none;background:#10b981;color:#fff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">Delivered</button>
                    </div>
                `).join('');
        }

        if (priceEl) {
            const idx = buildPriceHistoryIndex();
            const rows = Object.values(idx).filter(r => !query || r.name.toLowerCase().includes(query)).slice(0, 25);
            priceEl.innerHTML = rows.length === 0
                ? `<div style="padding:14px;color:#94a3b8;font-size:12px;text-align:center;">No tracked item prices yet.</div>`
                : rows.map(r => {
                    const trend = r.entries.length > 1 ? r.latest.price - r.entries[1].price : 0;
                    const badge = trend > 0.01
                        ? `<span style="font-size:10px;font-weight:800;background:#fee2e2;color:#dc2626;padding:2px 6px;border-radius:6px;">↑ ₱${trend.toLocaleString()}</span>`
                        : trend < -0.01
                            ? `<span style="font-size:10px;font-weight:800;background:#ecfdf5;color:#059669;padding:2px 6px;border-radius:6px;">↓ ₱${Math.abs(trend).toLocaleString()}</span>`
                            : `<span style="font-size:10px;font-weight:700;background:#f1f5f9;color:#64748b;padding:2px 6px;border-radius:6px;">${r.entries.length}x</span>`;
                    const sm = getSubMeta(r.subCategory);
                    // (2026-07-13) Style Price History cards like native txn cards; prev: compact gray
                    return `
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 16px;border-radius:20px;background:#ffffff;border:1px solid #f1f5f9;box-shadow:0 2px 10px rgba(15,23,42,0.03);">
                            <div style="width:42px;height:42px;border-radius:14px;background:${sm.bg};color:${sm.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="material-icons" style="font-size:20px;">${sm.icon}</i>
                            </div>
                            <div style="min-width:0;flex:1;">
                                <div style="font-size:13px;font-weight:800;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.2px;">${escapeHtml(r.name)}</div>
                                <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;margin-top:2px;">LOWEST ₱${r.lowest.price.toLocaleString()} • ${sm.label}</div>
                                <div style="font-size:11px;font-weight:700;color:${sm.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${escapeHtml(r.lowest.merchant)}</div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                                ${badge}
                                <span style="font-size:14.5px;font-weight:800;color:#1e293b;">₱${r.latest.price.toLocaleString()}</span>
                            </div>
                        </div>
                    `;
                }).join('');
        }
    }

    window.CartModule = {
        init() {
            loadChecklistLocal();
            const noteInput = document.getElementById('manual-note');
            if (noteInput && !noteInput._cartNoteListener) {
                noteInput.addEventListener('input', () => { noteInput.dataset.userEdited = '1'; });
                noteInput._cartNoteListener = true;
            }
            this.refreshDashboardWidget();
        },
        syncChecklistFromCloud(uid) {
            if (!uid || !window.db || !window.doc || !window.onSnapshot) return;
            loadChecklistLocal();
            window.onSnapshot(window.doc(window.db, 'users', uid, 'config', 'shopping_checklist'), (snap) => {
                if (snap.exists() && Array.isArray(snap.data()?.items)) {
                    checklistItems = snap.data().items;
                    localStorage.setItem(CHECKLIST_STORAGE_PREFIX + uid, JSON.stringify(checklistItems));
                    this.refreshDashboardWidget();
                    if (activeModalTab === 'checklist') renderChecklistTab();
                }
            });
        },
        resetForNew(catId) {
            cartItems = [];
            cartShipping = 0;
            cartDiscount = 0;
            cartOrderId = '';
            cartDeliveryDate = '';
            cartDeliveryStatus = null;
            cartExpanded = false;
            cartForceShown = false;
            pendingClearChecklistIds = [];
            const noteInput = document.getElementById('manual-note');
            if (noteInput) delete noteInput.dataset.userEdited;
            updateVisibilityForCategory(catId);
            renderCartRows();
        },
        loadFromTxn(txn, catId) {
            cartItems = Array.isArray(txn?.items) ? txn.items.map(it => ({ ...it })) : [];
            cartShipping = Number(txn?.shippingFee) || 0;
            cartDiscount = Number(txn?.discount) || 0;
            cartOrderId = txn?.orderId || '';
            cartDeliveryDate = txn?.deliveryDate || '';
            cartDeliveryStatus = txn?.deliveryStatus || null;
            cartExpanded = cartItems.length > 0 || !!cartOrderId;
            cartForceShown = cartExpanded;
            pendingClearChecklistIds = [];
            const noteInput = document.getElementById('manual-note');
            if (noteInput) {
                if (txn?.note) noteInput.dataset.userEdited = '1';
                else delete noteInput.dataset.userEdited;
            }
            updateVisibilityForCategory(catId);
            renderCartRows();
        },
        onCategoryChanged(catId) {
            updateVisibilityForCategory(catId);
        },
        forceShowCard() {
            cartForceShown = true;
            cartExpanded = true;
            updateVisibilityForCategory('');
            renderCartRows();
        },
        toggleExpand() {
            cartExpanded = !cartExpanded;
            const body = document.getElementById('manual-cart-body');
            const chev = document.getElementById('manual-cart-chevron');
            if (body) body.style.display = cartExpanded ? 'block' : 'none';
            if (chev) chev.style.transform = cartExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        },
        addItem(preset) {
            cartExpanded = true;
            cartForceShown = true;
            // (2026-07-13) Inherit previous item sub-category; prev: hardcoded food
            const prevSubCat = cartItems.length > 0 ? cartItems[cartItems.length - 1].subCategory : 'food';
            cartItems.push({
                id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                name: preset?.name || '',
                qty: Math.max(1, Number(preset?.qty) || 1),
                unitPrice: Number(preset?.unitPrice) || 0,
                subCategory: preset?.subCategory || prevSubCat
            });
            updateVisibilityForCategory('');
            renderCartRows();
        },
        updateItem(idx, field, val) {
            if (!cartItems[idx]) return;
            if (field === 'unitPrice') cartItems[idx].unitPrice = parseFloat(val) || 0;
            else cartItems[idx][field] = val;
            syncAmountAndNote();
            if (field === 'unitPrice') {
                const row = document.querySelectorAll('#manual-cart-items-list .cart-item-row')[idx];
                const totSpan = row?.querySelector('span[style*="margin-left:auto"]');
                if (totSpan) totSpan.textContent = `₱${((Number(cartItems[idx].qty) || 1) * (Number(cartItems[idx].unitPrice) || 0)).toLocaleString()}`;
            }
        },
        stepQty(idx, delta) {
            if (!cartItems[idx]) return;
            cartItems[idx].qty = Math.max(1, (Number(cartItems[idx].qty) || 1) + delta);
            renderCartRows();
        },
        cycleItemSubCat(idx) {
            if (!cartItems[idx]) return;
            const cur = SUB_CATEGORIES.findIndex(s => s.id === cartItems[idx].subCategory);
            const next = (cur + 1) % SUB_CATEGORIES.length;
            cartItems[idx].subCategory = SUB_CATEGORIES[next].id;
            renderCartRows();
        },
        removeItem(idx) {
            cartItems.splice(idx, 1);
            renderCartRows();
        },
        updateMeta(field, val) {
            if (field === 'shippingFee') cartShipping = parseFloat(val) || 0;
            else if (field === 'discount') cartDiscount = parseFloat(val) || 0;
            else if (field === 'orderId') cartOrderId = String(val || '').trim();
            else if (field === 'deliveryDate') {
                cartDeliveryDate = val || '';
                if (cartDeliveryDate && !cartDeliveryStatus) cartDeliveryStatus = 'pending';
            }
            syncAmountAndNote();
        },
        forceSyncTotalToAmount() {
            const total = computeCartTotal();
            const amtInput = document.getElementById('manual-amt');
            if (amtInput && total > 0) {
                amtInput.value = total.toFixed(2);
                if (typeof window.checkSplitTrigger === 'function') window.checkSplitTrigger();
            }
            const syncBtn = document.getElementById('cart-sync-total-btn');
            if (syncBtn) syncBtn.style.display = 'none';
        },
        applyScannedReceipt(payload) {
            cartExpanded = true;
            cartForceShown = true;
            if (payload.orderId) cartOrderId = payload.orderId;
            if (payload.deliveryDate) {
                cartDeliveryDate = payload.deliveryDate;
                cartDeliveryStatus = 'pending';
            }
            if (payload.shippingFee > 0) cartShipping = payload.shippingFee;
            if (payload.discount > 0) cartDiscount = payload.discount;
            if (Array.isArray(payload.items) && payload.items.length > 0) {
                cartItems = payload.items;
            }
            const noteInput = document.getElementById('manual-note');
            if (noteInput) delete noteInput.dataset.userEdited;
            updateVisibilityForCategory('');
            renderCartRows();
        },
        getPayloadForSave() {
            const cleanItems = cartItems.filter(it => String(it.name || '').trim().length > 0 || Number(it.unitPrice) > 0).map(it => ({
                id: it.id,
                name: String(it.name || 'Item').trim(),
                qty: Math.max(1, Number(it.qty) || 1),
                unitPrice: Math.max(0, Number(it.unitPrice) || 0),
                subCategory: it.subCategory || 'other'
            }));
            return {
                items: cleanItems,
                shippingFee: Math.max(0, Number(cartShipping) || 0),
                discount: Math.max(0, Number(cartDiscount) || 0),
                orderId: cartOrderId || null,
                deliveryDate: cartDeliveryDate || null,
                deliveryStatus: (cartOrderId || cartDeliveryDate) ? (cartDeliveryStatus || 'pending') : null
            };
        },
        onTransactionSaved() {
            if (pendingClearChecklistIds.length > 0) {
                const removeSet = new Set(pendingClearChecklistIds);
                checklistItems = checklistItems.filter(it => !removeSet.has(it.id));
                pendingClearChecklistIds = [];
                persistChecklist();
            }
            this.refreshDashboardWidget();
        },
        refreshDashboardWidget() {
            const totalEl = document.getElementById('gc-widget-month-total');
            const barEl = document.getElementById('gc-widget-mini-bar');
            const pillsEl = document.getElementById('gc-widget-pills');
            if (!totalEl) return;

            const pool = getAllTxnsPool();
            const now = new Date();
            const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const totals = {};
            SUB_CATEGORIES.forEach(s => { totals[s.id] = 0; });
            let pendingDeliveries = 0;

            pool.forEach(t => {
                if ((t.orderId || t.deliveryDate) && t.deliveryStatus !== 'delivered') pendingDeliveries++;
                if (!Array.isArray(t.items) || !String(t.date || '').startsWith(curMonth)) return;
                t.items.forEach(it => {
                    const sub = totals[it.subCategory] !== undefined ? it.subCategory : 'other';
                    totals[sub] += (Number(it.qty) || 1) * (Number(it.unitPrice) || 0);
                });
                if (Number(t.shippingFee) > 0) totals.shipping += Number(t.shippingFee);
            });

            const grand = Object.values(totals).reduce((a, b) => a + b, 0);
            totalEl.textContent = `₱${grand.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

            if (barEl) {
                const active = SUB_CATEGORIES.filter(s => totals[s.id] > 0).sort((a, b) => totals[b.id] - totals[a.id]);
                if (active.length === 0) {
                    barEl.innerHTML = `<div style="width:100%;height:100%;background:#f1f5f9;"></div>`;
                } else {
                    barEl.innerHTML = active.map(s => `<div style="width:${(totals[s.id] / grand) * 100}%;height:100%;background:${s.color};"></div>`).join('');
                }
            }

            if (pillsEl) {
                const unchecked = checklistItems.filter(i => !i.checked).length;
                const chips = [];
                if (pendingDeliveries > 0) {
                    chips.push(`<span style="font-size:10.5px;font-weight:700;background:#fff7ed;color:#ea580c;padding:3px 8px;border-radius:8px;">${pendingDeliveries} Pending Parcel${pendingDeliveries > 1 ? 's' : ''}</span>`);
                }
                chips.push(`<span style="font-size:10.5px;font-weight:700;background:#f0f9ff;color:#0284c7;padding:3px 8px;border-radius:8px;">${unchecked} To Buy</span>`);
                pillsEl.innerHTML = chips.join('');
            }
        },
        openGroceriesModal(tab = 'breakdown') {
            activeModalTab = tab;
            activeSubFilter = null;
            const modal = document.getElementById('groceries-carts-modal');
            if (!modal) return;
            const monthSel = document.getElementById('gc-month-filter');
            if (monthSel && monthSel.options.length <= 1) {
                const now = new Date();
                for (let i = 0; i < 6; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = label;
                    monthSel.appendChild(opt);
                }
                monthSel.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
            modal.style.display = 'flex';
            modal.classList.add('show');
            renderGroceriesModalContent();
        },
        closeGroceriesModal() {
            const modal = document.getElementById('groceries-carts-modal');
            if (!modal) return;
            modal.style.display = 'none';
            modal.classList.remove('show', 'closing');
        },
        switchTab(tab) {
            activeModalTab = tab;
            renderGroceriesModalContent();
        },
        setSourceFilter(src) {
            activeSourceFilter = src;
            ['all', 'groceries', 'online'].forEach(k => {
                const b = document.getElementById('gc-src-' + k);
                if (b) {
                    b.style.background = src === k ? '#eff6ff' : '#f8fafc';
                    b.style.color = src === k ? '#2563eb' : '#64748b';
                    b.style.borderColor = src === k ? '#93c5fd' : '#e2e8f0';
                }
            });
            renderBreakdownTab();
        },
        toggleSubFilter(subId) {
            activeSubFilter = activeSubFilter === subId ? null : subId;
            renderBreakdownTab();
        },
        addChecklistItem() {
            const nameEl = document.getElementById('gc-check-name');
            const qtyEl = document.getElementById('gc-check-qty');
            const priceEl = document.getElementById('gc-check-price');
            const catEl = document.getElementById('gc-check-cat');
            const name = (nameEl?.value || '').trim();
            if (!name) return;
            checklistItems.unshift({
                id: 'chk_' + Date.now(),
                name,
                qty: Math.max(1, parseInt(qtyEl?.value, 10) || 1),
                estPrice: Math.max(0, parseFloat(priceEl?.value) || 0),
                subCategory: catEl?.value || 'food',
                checked: false,
                addedAt: Date.now()
            });
            if (nameEl) nameEl.value = '';
            if (qtyEl) qtyEl.value = '1';
            if (priceEl) priceEl.value = '';
            persistChecklist();
            renderChecklistTab();
        },
        toggleChecklistItem(idx, checked) {
            if (!checklistItems[idx]) return;
            checklistItems[idx].checked = checked;
            persistChecklist();
            renderChecklistTab();
        },
        removeChecklistItem(idx) {
            checklistItems.splice(idx, 1);
            persistChecklist();
            renderChecklistTab();
        },
        convertCheckedToTransaction() {
            const checked = checklistItems.filter(it => it.checked);
            if (checked.length === 0) return;
            this.closeGroceriesModal();
            if (typeof window.openManualModal === 'function') window.openManualModal();
            else if (typeof window.openManualTxnModal === 'function') window.openManualTxnModal();

            pendingClearChecklistIds = checked.map(it => it.id);
            cartItems = checked.map(it => ({
                id: 'it_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
                name: it.name,
                qty: it.qty || 1,
                unitPrice: it.estPrice || 0,
                subCategory: it.subCategory || 'food'
            }));
            cartExpanded = true;
            cartForceShown = true;
            const noteInput = document.getElementById('manual-note');
            if (noteInput) delete noteInput.dataset.userEdited;
            updateVisibilityForCategory('Shopping');
            renderCartRows();
        },
        async markDelivered(txnId, accId) {
            const pool = getAllTxnsPool();
            const target = pool.find(t => t.id === txnId);
            if (target) target.deliveryStatus = 'delivered';
            if (window.auth?.currentUser && window.db && window.doc && window.updateDoc && typeof window.getCollectionName === 'function') {
                const col = window.getCollectionName(accId || window.currentAccount);
                try {
                    await window.updateDoc(window.doc(window.db, 'users', window.auth.currentUser.uid, col, txnId), { deliveryStatus: 'delivered' });
                } catch (e) { console.warn('[CartModule] markDelivered error:', e); }
            }
            if (window.showToast) window.showToast('Marked as delivered!');
            this.refreshDashboardWidget();
            renderDeliveriesAndPricesTab();
        },
        renderDeliveriesAndPricesTab
    };
})();
