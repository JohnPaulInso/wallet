/**
 * UI Rendering and Management for the Wallet App
 */
import { db, auth, doc, setDoc, onSnapshot, getDoc, serverTimestamp } from "./firebase-config.js";
import { CATEGORIES, getMerchantDisplay, displayCategoryName, formatLocalDate, showToast, log, triggerHaptic, createNotification, cleanAIText, animateNumber } from "./app-utils.js";
import { CONFIG } from "./config.js";
import { LocalAI } from "./local-ai.js";

let switchSyncTimer = null;
let keyboardViewportBridgeInitialized = false;

function resolveFocusableTarget(targetOrId) {
    if (typeof targetOrId === 'string') {
        return document.getElementById(targetOrId);
    }
    return targetOrId instanceof HTMLElement ? targetOrId : null;
}

function getModalScrollHost(target) {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest('.custom-modal, .dialog-card, .goals-modal-card, .accounts-modal-content, .calendar-modal-content');
}

function keepFieldVisibleInModal(target, behavior = 'smooth') {
    if (!(target instanceof HTMLElement)) return;
    if (!target.matches('input, textarea, select, [contenteditable="true"]')) return;

    const modal = target.closest('.modal-overlay.show, .dialog-overlay.show, .goals-modal-overlay.show, .accounts-modal-overlay.visible');
    if (!modal) return;

    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    const viewportBottom = viewportTop + viewportHeight;
    const keyboardLift = Math.max(0, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-keyboard-lift')) || 0);
    const targetRect = target.getBoundingClientRect();
    const visibleTop = viewportTop + Math.max(14, keyboardLift > 0 ? 10 : 24);
    const visibleBottom = viewportBottom - Math.max(14, keyboardLift > 0 ? 18 : 24);
    const scrollHost = getModalScrollHost(target);

    if (scrollHost instanceof HTMLElement) {
        const hostRect = scrollHost.getBoundingClientRect();
        const hostTopLimit = Math.max(hostRect.top + 16, visibleTop);
        const hostBottomLimit = Math.min(hostRect.bottom - 16, visibleBottom);
        let delta = 0;

        if (targetRect.bottom > hostBottomLimit) {
            delta = targetRect.bottom - hostBottomLimit;
        } else if (targetRect.top < hostTopLimit) {
            delta = targetRect.top - hostTopLimit;
        }

        if (Math.abs(delta) > 1) {
            scrollHost.scrollTo({
                top: Math.max(0, scrollHost.scrollTop + delta),
                behavior
            });
        }
        return;
    }

    if (targetRect.top < visibleTop || targetRect.bottom > visibleBottom) {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
    }
}

function focusFieldWithoutPageJump(targetOrId, delay = 0) {
    const runFocus = () => {
        const target = resolveFocusableTarget(targetOrId);
        if (!(target instanceof HTMLElement)) return;

        try {
            target.focus({ preventScroll: true });
        } catch (error) {
            target.focus();
        }

        window.setTimeout(() => keepFieldVisibleInModal(target, 'smooth'), 40);
        window.setTimeout(() => keepFieldVisibleInModal(target, 'smooth'), 220);
    };

    if (delay > 0) {
        window.setTimeout(runFocus, delay);
        return;
    }

    runFocus();
}

window.focusFieldWithoutPageJump = focusFieldWithoutPageJump;
window.keepFieldVisibleInModal = keepFieldVisibleInModal;

function triggerSoftFadeInElement(el) {
    if (!el) return;
    el.classList.remove('fade-in-soft');
    void el.offsetWidth;
    el.classList.add('fade-in-soft');
    window.clearTimeout(el._fadeInSoftTimer);
    el._fadeInSoftTimer = window.setTimeout(() => {
        el.classList.remove('fade-in-soft');
    }, 320);
}

function shouldShowTxnLogos() {
    return window.showLogos !== false;
}

function detectTxnLogo(mappedName = "") {
    const mUpper = String(mappedName || "").toUpperCase();
    if (mUpper.includes('JOLLIBEE')) return 'logos/jollibee.png';
    if (mUpper.includes('MCDO') || mUpper.includes('MCDONALDS')) return 'logos/mcdo.png';
    if (mUpper.includes('SHELL')) return 'logos/shell.png';
    if (mUpper.includes('SHOPEE')) return 'logos/shopee.png';
    if (mUpper.includes('LAZADA')) return 'logos/lazada.jpg';
    if (mUpper.includes('GLOBE') || mUpper.includes('GOMO')) return 'logos/globe.png';
    if (mUpper.includes('SM') || mUpper.includes('SM STORE')) return 'logos/sm.png';
    if (mUpper.includes('SPOTIFY')) return 'logos/spotify.png';
    if (mUpper.includes('TIKTOK')) return 'logos/tiktokshop.png';
    if (mUpper.includes('TECFUEL')) return 'logos/tecfuel.png';
    if (mUpper.includes('MR DIY')) return 'logos/mrdiy.png';
    if (mUpper.includes('METRO')) return 'logos/supermetro.png';
    if (mUpper.includes('7 11') || mUpper.includes('7/11')) return 'logos/711.png';
    if (mUpper.includes('WATSONS')) return 'logos/watsons.png';
    if (mUpper.includes('J AND L')) return 'logos/jandlmall.png';
    if (mUpper.includes('TRADERSCONNECT')) return 'logos/tradersconnect.png';
    return null;
}

function getTxnNoteColor(mappedCategory, isRefund, isReimbursed) {
    if (mappedCategory === 'Savings' || mappedCategory === 'Income' || mappedCategory === 'Life & Entertainment' || mappedCategory === 'Sport') {
        return '#16a34a';
    }
    if (isRefund || isReimbursed) return '#f59e0b';
    return (window.categoryConfig && window.categoryConfig[mappedCategory]?.darkColor) || '#475569';
}

function getTxnBudgetDotHTML(t, mapped, isIncome, isRefund, isReimbursed) {
    if (t.excluded || isIncome || isRefund || isReimbursed || mapped.category === 'Credit Card Payment') return '';

    const manualBCat = t.manualBudgetCategory;
    let detectedBudget = '';
    if (manualBCat && manualBCat !== 'n/a') {
        detectedBudget = manualBCat;
    } else if (manualBCat !== 'n/a') {
        const needsCats = ['Education', 'Service', 'Vehicle', 'Transportation'];
        const wantsCats = ['Shopping', 'Online shopping', 'Food & Drinks', 'Life & Entertainment', 'Sport', 'Financial expenses', 'Financial Expenses'];
        const savingsCats = ['Savings', 'Investments'];
        if (needsCats.includes(mapped.category)) detectedBudget = 'needs';
        else if (wantsCats.includes(mapped.category)) detectedBudget = 'wants';
        else if (savingsCats.includes(mapped.category)) detectedBudget = 'savings';
    }

    const dotColors = { needs: '#3b82f6', wants: '#F5BE27', savings: '#22c55e' };
    if (!detectedBudget || !dotColors[detectedBudget]) return '';
    return `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColors[detectedBudget]};margin-left:6px;vertical-align:middle;"></span>`;
}

function initKeyboardViewportBridge() {
    if (keyboardViewportBridgeInitialized || typeof document === 'undefined') return;
    keyboardViewportBridgeInitialized = true;

    const root = document.documentElement;
    const updateMetrics = () => {
        const viewport = window.visualViewport;
        const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const visualHeight = viewport?.height || layoutHeight;
        const offsetTop = viewport?.offsetTop || 0;
        const rawLift = Math.max(0, Math.round(layoutHeight - visualHeight - offsetTop));
        const keyboardLift = rawLift > 90 ? rawLift : 0;

        root.style.setProperty('--app-visual-height', `${Math.round(visualHeight)}px`);
        root.style.setProperty('--app-visual-offset-top', `${Math.round(offsetTop)}px`);
        root.style.setProperty('--app-keyboard-lift', `${keyboardLift}px`);
        document.body?.classList.toggle('keyboard-active', keyboardLift > 0);

        const activeField = document.activeElement;
        if (activeField instanceof HTMLElement) {
            window.requestAnimationFrame(() => keepFieldVisibleInModal(activeField, 'smooth'));
        }
    };

    const centerFocusedField = (target) => {
        if (!(target instanceof HTMLElement)) return;
        if (!target.matches('input, textarea, select, [contenteditable="true"]')) return;
        const modal = target.closest('.modal-overlay.show, .dialog-overlay.show, .goals-modal-overlay.show, .accounts-modal-overlay.visible');
        if (!modal) return;
        window.setTimeout(() => {
            try {
                keepFieldVisibleInModal(target, 'smooth');
            } catch (e) {}
        }, 140);
        window.setTimeout(() => keepFieldVisibleInModal(target, 'smooth'), 260);
    };

    const viewport = window.visualViewport;
    if (viewport) {
        viewport.addEventListener('resize', updateMetrics, { passive: true });
        viewport.addEventListener('scroll', updateMetrics, { passive: true });
    }

    window.addEventListener('resize', updateMetrics, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(updateMetrics, 120), { passive: true });
    document.addEventListener('focusin', (event) => {
        updateMetrics();
        centerFocusedField(event.target);
    });
    document.addEventListener('focusout', () => window.setTimeout(updateMetrics, 80));

    updateMetrics();
}

// Render Transaction History
export function renderHistory(txns) {
    const container = document.getElementById('history-container');
    const fragment = document.createDocumentFragment();
    
    // Check visibility state ONCE at the start for consistency
    const isHidden = localStorage.getItem('balance_hidden') === 'true';
    
    if (window.drawTrendChart) window.drawTrendChart(txns);

    const groups = {};
    txns.forEach(t => {
        const d = new Date(t.date);
        if (isNaN(d)) return;
        const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = { items: [], total: 0 };
        
        groups[key].items.push(t);
        const mappedSumCheck = getMerchantDisplay(t.merchant, t);
        if (!t.excluded && !t.refund && !t.reimbursed && mappedSumCheck.category !== 'Income') {
            const amt = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
            groups[key].total += amt;
        }
    });

    const entries = Object.entries(groups);
    // Ensure chronological order (descending)
    entries.sort((a, b) => new Date(b[1].items[0].date) - new Date(a[1].items[0].date));
    
    const visibleEntries = entries.slice(0, window.historyLimit || 4);

    visibleEntries.forEach(([month, data], index) => {
        const accordion = document.createElement('div');
        accordion.className = 'month-accordion';
        
        const savedState = localStorage.getItem(`accordion_${month}`);
        const isCollapsed = savedState === 'collapsed' || (savedState === null && index !== 0);
        
        const header = document.createElement('div');
        header.className = `month-header ${isCollapsed ? 'collapsed' : ''}`;
        header.innerHTML = `
            <span class="month-title">${month}</span>
            <div style="display:flex; align-items:center; gap:12px;">
                <span class="month-total privacy-mask" data-raw="ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${data.total.toLocaleString(undefined, {minimumFractionDigits:2})}">
                    ${isHidden ? '******' : 'ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±' + data.total.toLocaleString(undefined, {minimumFractionDigits:2})}
                </span>
                <i class="material-icons expand-icon">expand_more</i>
            </div>
        `;

        
        const content = document.createElement('div');
        content.className = `month-content ${isCollapsed ? 'collapsed' : ''}`;
        
        let contentHTML = '';
        data.items.forEach(t => {
            const mapped = getMerchantDisplay(t.merchant, t);
            const isIncome = mapped.category === 'Income';
            const isRefund = t.refund || false;
            const isReimbursed = t.reimbursed || false;
            const excludedClass = t.excluded ? 'txn-excluded' : '';
            
            const d = new Date(t.date);
            const shortDate = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
            const amount = (t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));
            
            let displayNote = t.note || '';
            if (!displayNote && mapped.category === 'Vehicle') {
                displayNote = (amount > 250) ? "Car Refill" : "Motor Refill";
            }
            
            let displayAmtColor = '';
            let displayTitleColor = '';

            if (isIncome) {
                displayAmtColor = 'color: #16a34a;';
                displayTitleColor = 'color: #16a34a;';
            } else if (isRefund || isReimbursed) {
                displayAmtColor = 'color: #f59e0b;';
                displayTitleColor = 'color: #f59e0b;';
            } else if (mapped.category === 'Credit Card Payment') {
                displayAmtColor = 'color: #f59e0b;'; 
                displayTitleColor = 'color: #f59e0b;';
            } else {
                if (mapped.category === 'Savings') {
                    displayTitleColor = 'color: #16a34a;';
                } else if (Math.abs(amount) >= 1000) {
                    displayAmtColor = 'color: #ef4444;';
                } else if (window.currentAccount === 'bpi') {
                    displayAmtColor = 'color: #991b1b;';
                }
            }
            let displayName = mapped.name;
            if (mapped.category === 'Credit Card Payment') displayName = 'ATOME PAYMENT';
            
            let refundChip = isRefund ? '<span class="refund-badge" style="display: inline-block; background: #fef3c7; color: #d97706; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; letter-spacing: 0.3px;">REFUNDED</span>' : '';
            let reimbursedChip = isReimbursed ? '<span class="reimbursed-badge">REIMBURSED</span>' : '';
            
            const isPaymentDuplicate = t.duplicatedFromAccount === 'bpi' && window.currentAccount === 'atome' && mapped.name.toUpperCase().includes('ATOME PAYMENT');
            const paymentChip = isPaymentDuplicate ? '<span class="payment-badge" style="display: inline-block; background: #d1fae5; color: #059669; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; letter-spacing: 0.3px;">PAYMENT</span>' : '';
            
            const logo = detectTxnLogo(mapped.name);
            const logoHTML = logo ? `<div class="brand-badge" style="display: ${shouldShowTxnLogos() ? 'flex' : 'none'}"><img src="${logo}"></div>` : '';

            const budgetDotHTML = getTxnBudgetDotHTML(t, mapped, isIncome, isRefund, isReimbursed);
            const noteSafe = (t.note || '').replace(/"/g, '&quot;');
            contentHTML += `
                <div class="txn-swipe-wrapper">
                    <div class="txn-swipe-bg left">DELETE</div>
                    <div class="txn-swipe-bg right" style="${t.excluded ? 'background: #3b82f6;' : 'background: #f59e0b;'}">${t.excluded ? 'INCLUDE' : 'EXCLUDE'}</div>
                    <div class="premium-txn ${excludedClass}" 
                         data-txn-id="${t.id}" 
                         data-merchant="${mapped.name.replace(/'/g, "\\'")}" 
                         data-amount="${amount}"
                         data-date="${t.date}"
                         data-manual-amount="${t.manualAmount !== undefined ? t.manualAmount : ''}"
                         data-category="${mapped.category}"
                         data-manual-budget-category="${t.manualBudgetCategory || ''}"
                         data-note="${noteSafe}"
                         data-excluded="${t.excluded || false}"
                         data-refund="${t.refund || false}"
                         data-reimbursed="${t.reimbursed || false}">
                        <div class="icon-box ${mapped.catClass}">
                            <i class="material-icons">${mapped.icon}</i>
                            ${logoHTML}
                        </div>
                        <div class="txn-details">
                            <div class="txn-merch" style="${displayTitleColor}">${displayName}${refundChip}${reimbursedChip}${paymentChip}</div>
                            <div class="txn-sub">
                                <span>${shortDate}</span> ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ <span>${displayCategoryName(mapped.category)}</span>${budgetDotHTML}
                            </div>
                            ${displayNote ? `<div class="txn-note" style="color: ${getTxnNoteColor(mapped.category, isRefund, isReimbursed)}; font-size: 11px; margin-top:2px;">${displayNote}</div>` : ''}
                        </div>
                        <div class="txn-right">
                            <div class="txn-amount privacy-mask ${Math.abs(amount) >= 1000 ? 'large' : ''}" style="${displayAmtColor}" data-raw="${(!isIncome && !isRefund && !isReimbursed && window.currentAccount !== 'atome') ? '-' : ''}ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.abs(amount).toLocaleString(undefined, {minimumFractionDigits:2})}">
                                ${isHidden ? '******' : ((!isIncome && !isRefund && !isReimbursed && window.currentAccount !== 'atome') ? '-' : '') + 'ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±' + Math.abs(amount).toLocaleString(undefined, {minimumFractionDigits:2})}
                            </div>
                        </div>
                    </div>
                </div>`;
        });
        
        content.innerHTML = contentHTML;
        header.onclick = () => {
            const isNowCollapsed = content.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isNowCollapsed);
            localStorage.setItem(`accordion_${month}`, isNowCollapsed ? 'collapsed' : 'expanded');
        };
        
        accordion.appendChild(header);
        accordion.appendChild(content);
        fragment.appendChild(accordion);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);

    // Load More Button
    if (entries.length > (window.historyLimit || 4)) {
        const loadMoreWrap = document.createElement('div');
        loadMoreWrap.style.cssText = 'padding: 10px 0 40px; text-align: center;';
        const btn = document.createElement('button');
        btn.className = 'load-more-btn';
        btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: #000; font-weight: 800; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; background: #ebf5ff; border: none; border-radius: 25px; padding: 12px 32px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(29, 78, 216, 0.08);';
        btn.innerHTML = '<span>Load More</span><i class="material-icons" style="font-size: 20px;">keyboard_arrow_down</i>';
        
        btn.onclick = () => {
            btn.innerHTML = '<i class="material-icons spin" style="font-size: 20px;">sync</i>';
            btn.style.opacity = '0.7';
            btn.style.pointerEvents = 'none';
            setTimeout(() => {
                window.historyLimit = (window.historyLimit || 4) + 2;
                renderHistory(window.allTxns);
            }, 400);
        };
        
        btn.onmouseenter = () => { btn.style.background = '#dbeafe'; btn.style.transform = 'translateY(-1px)'; };
        btn.onmouseleave = () => { btn.style.background = '#ebf5ff'; btn.style.transform = 'translateY(0)'; };
        
        loadMoreWrap.appendChild(btn);
        container.appendChild(loadMoreWrap);
    }

    setTimeout(() => {
        if (typeof window.setupLongPressHandlers === 'function') window.setupLongPressHandlers();
        if (typeof window.setupBalanceLongPress === 'function') window.setupBalanceLongPress();
    }, 50);

    if (isHidden) {
        setTimeout(() => {
            const maskedElements = document.querySelectorAll('.privacy-mask');
            maskedElements.forEach(el => {
                if (!el.dataset.raw) el.dataset.raw = el.innerText;
                el.innerText = '******';
            });
        }, 10);
    }
}

function renderHistoryClean(txns) {
    const container = document.getElementById('history-container');
    const fragment = document.createDocumentFragment();
    const isHidden = localStorage.getItem('balance_hidden') === 'true';
    const peso = '\u20B1';
    const bullet = '&bull;';

    if (window.drawTrendChart) window.drawTrendChart(txns);

    const groups = {};
    txns.forEach(t => {
        const d = new Date(t.date);
        if (isNaN(d)) return;
        const key = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = { items: [], total: 0 };

        groups[key].items.push(t);
        const mappedSumCheck = getMerchantDisplay(t.merchant, t);
        if (!t.excluded && !t.refund && !t.reimbursed && mappedSumCheck.category !== 'Income') {
            const amt = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
            groups[key].total += amt;
        }
    });

    const entries = Object.entries(groups);
    entries.sort((a, b) => new Date(b[1].items[0].date) - new Date(a[1].items[0].date));

    const visibleEntries = entries.slice(0, window.historyLimit || 4);

    visibleEntries.forEach(([month, data], index) => {
        const accordion = document.createElement('div');
        accordion.className = 'month-accordion';

        const savedState = localStorage.getItem(`accordion_${month}`);
        const isCollapsed = savedState === 'collapsed' || (savedState === null && index !== 0);
        const monthTotalText = `${peso}${data.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        const header = document.createElement('div');
        header.className = `month-header ${isCollapsed ? 'collapsed' : ''}`;
        header.innerHTML = `
            <span class="month-title">${month}</span>
            <div style="display:flex; align-items:center; gap:12px;">
                <span class="month-total privacy-mask" data-raw="${monthTotalText}">
                    ${isHidden ? '******' : monthTotalText}
                </span>
                <i class="material-icons expand-icon">expand_more</i>
            </div>
        `;

        const content = document.createElement('div');
        content.className = `month-content ${isCollapsed ? 'collapsed' : ''}`;

        let contentHTML = '';
        data.items.forEach(t => {
            const mapped = getMerchantDisplay(t.merchant, t);
            const isIncome = mapped.category === 'Income';
            const isRefund = t.refund || false;
            const isReimbursed = t.reimbursed || false;
            const excludedClass = t.excluded ? 'txn-excluded' : '';

            const d = new Date(t.date);
            const shortDate = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
            const amount = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);

            let displayNote = t.note || '';
            if (!displayNote && mapped.category === 'Vehicle') {
                displayNote = amount > 250 ? 'Car Refill' : 'Motor Refill';
            }

            let displayAmtColor = '';
            let displayTitleColor = '';

            if (isIncome) {
                displayAmtColor = 'color: #16a34a;';
                displayTitleColor = 'color: #16a34a;';
            } else if (isRefund || isReimbursed) {
                displayAmtColor = 'color: #f59e0b;';
                displayTitleColor = 'color: #f59e0b;';
            } else if (mapped.category === 'Credit Card Payment') {
                displayAmtColor = 'color: #f59e0b;';
                displayTitleColor = 'color: #f59e0b;';
            } else {
                if (mapped.category === 'Savings') {
                    displayTitleColor = 'color: #16a34a;';
                } else if (Math.abs(amount) >= 1000) {
                    displayAmtColor = 'color: #ef4444;';
                } else if (window.currentAccount === 'bpi') {
                    displayAmtColor = 'color: #991b1b;';
                }
            }

            let displayName = mapped.name;
            if (mapped.category === 'Credit Card Payment') displayName = 'ATOME PAYMENT';

            const refundChip = isRefund ? '<span class="refund-badge" style="display: inline-block; background: #fef3c7; color: #d97706; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; letter-spacing: 0.3px;">REFUNDED</span>' : '';
            const reimbursedChip = isReimbursed ? '<span class="reimbursed-badge">REIMBURSED</span>' : '';

            const isPaymentDuplicate = t.duplicatedFromAccount === 'bpi' && window.currentAccount === 'atome' && mapped.name.toUpperCase().includes('ATOME PAYMENT');
            const paymentChip = isPaymentDuplicate ? '<span class="payment-badge" style="display: inline-block; background: #d1fae5; color: #059669; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; letter-spacing: 0.3px;">PAYMENT</span>' : '';

            const logo = detectTxnLogo(mapped.name);
            const logoHTML = logo ? `<div class="brand-badge" style="display: ${shouldShowTxnLogos() ? 'flex' : 'none'}"><img src="${logo}"></div>` : '';
            const budgetDotHTML = getTxnBudgetDotHTML(t, mapped, isIncome, isRefund, isReimbursed);

            const noteSafe = (t.note || '').replace(/"/g, '&quot;');
            const amountPrefix = (!isIncome && !isRefund && !isReimbursed && window.currentAccount !== 'atome') ? '-' : '';
            const amountText = `${amountPrefix}${peso}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

            contentHTML += `
                <div class="txn-swipe-wrapper">
                    <div class="txn-swipe-bg left">DELETE</div>
                    <div class="txn-swipe-bg right" style="${t.excluded ? 'background: #3b82f6;' : 'background: #f59e0b;'}">${t.excluded ? 'INCLUDE' : 'EXCLUDE'}</div>
                    <div class="premium-txn ${excludedClass}"
                         data-txn-id="${t.id}"
                         data-merchant="${mapped.name.replace(/'/g, "\\'")}"
                         data-amount="${amount}"
                         data-date="${t.date}"
                         data-manual-amount="${t.manualAmount !== undefined ? t.manualAmount : ''}"
                         data-category="${mapped.category}"
                         data-manual-budget-category="${t.manualBudgetCategory || ''}"
                         data-note="${noteSafe}"
                         data-excluded="${t.excluded || false}"
                         data-refund="${t.refund || false}"
                         data-reimbursed="${t.reimbursed || false}">
                        <div class="icon-box ${mapped.catClass}">
                            <i class="material-icons">${mapped.icon}</i>
                            ${logoHTML}
                        </div>
                        <div class="txn-details">
                            <div class="txn-merch" style="${displayTitleColor}">${displayName}${refundChip}${reimbursedChip}${paymentChip}</div>
                            <div class="txn-sub">
                                <span>${shortDate}</span> ${bullet} <span>${displayCategoryName(mapped.category)}</span>${budgetDotHTML}
                            </div>
                            ${displayNote ? `<div class="txn-note" style="color: ${getTxnNoteColor(mapped.category, isRefund, isReimbursed)}; font-size: 11px; margin-top:2px;">${displayNote}</div>` : ''}
                        </div>
                        <div class="txn-right">
                            <div class="txn-amount privacy-mask ${Math.abs(amount) >= 1000 ? 'large' : ''}" style="${displayAmtColor}" data-raw="${amountText}">
                                ${isHidden ? '******' : amountText}
                            </div>
                        </div>
                    </div>
                </div>`;
        });

        content.innerHTML = contentHTML;
        header.onclick = () => {
            const isNowCollapsed = content.classList.toggle('collapsed');
            header.classList.toggle('collapsed', isNowCollapsed);
            localStorage.setItem(`accordion_${month}`, isNowCollapsed ? 'collapsed' : 'expanded');
        };

        accordion.appendChild(header);
        accordion.appendChild(content);
        fragment.appendChild(accordion);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    if (entries.length > (window.historyLimit || 4)) {
        const loadMoreWrap = document.createElement('div');
        loadMoreWrap.style.cssText = 'padding: 10px 0 40px; text-align: center;';
        const btn = document.createElement('button');
        btn.className = 'load-more-btn';
        btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: #000; font-weight: 800; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; background: #ebf5ff; border: none; border-radius: 25px; padding: 12px 32px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(29, 78, 216, 0.08);';
        btn.innerHTML = '<span>Load More</span><i class="material-icons" style="font-size: 20px;">keyboard_arrow_down</i>';

        btn.onclick = () => {
            btn.innerHTML = '<i class="material-icons spin" style="font-size: 20px;">sync</i>';
            btn.style.opacity = '0.7';
            btn.style.pointerEvents = 'none';
            setTimeout(() => {
                window.historyLimit = (window.historyLimit || 4) + 2;
                renderHistoryClean(window.allTxns);
            }, 400);
        };

        btn.onmouseenter = () => { btn.style.background = '#dbeafe'; btn.style.transform = 'translateY(-1px)'; };
        btn.onmouseleave = () => { btn.style.background = '#ebf5ff'; btn.style.transform = 'translateY(0)'; };

        loadMoreWrap.appendChild(btn);
        container.appendChild(loadMoreWrap);
    }

    setTimeout(() => {
        if (typeof window.setupLongPressHandlers === 'function') window.setupLongPressHandlers();
        if (typeof window.setupBalanceLongPress === 'function') window.setupBalanceLongPress();
    }, 50);

    if (isHidden) {
        setTimeout(() => {
            const maskedElements = document.querySelectorAll('.privacy-mask');
            maskedElements.forEach(el => {
                if (!el.dataset.raw) el.dataset.raw = el.innerText;
                el.innerText = '******';
            });
        }, 10);
    }
}

// Update Triple Progress Bar
export function updateTripleProgressBar() {
    const user = auth.currentUser;
    const widget = document.getElementById('triple-progress-widget');
    if (!widget) return;
    
    // Always show widget by default (as per user request for instant load)
    widget.style.display = 'block';

    let needsTotal = 0;
    let wantsTotal = 0;
    let savingsTotal = 0;
    let savingsSpent = 0; // [NEW: 2026-04-03] Track budget "theft" from savings
    let todayNeeds = 0;
    let todayWants = 0;
    let wantsCategoryMap = {};

    // --- INSTANT LOAD CACHE ---
    const cacheKey = `budget_widget_cache_${user?.uid || 'guest'}`;
    const cachedDataStr = localStorage.getItem(cacheKey);
    let parsedCache = null;
    try { if (cachedDataStr) parsedCache = JSON.parse(cachedDataStr); } catch (e) { }

    // DATA READINESS (Modified 2026-03-27: Wait for ALL sources to prevent flicker)
    const isMultiWallet = !!window.walletTxns;
    const isCurrentAccountBucketSeparate = Boolean(
        isMultiWallet
        && window.currentAccount
        && !['atome', 'bpi', 'budget_manual'].includes(window.currentAccount)
    );
    const atomeReady = isMultiWallet ? (window.walletTxns.atome !== undefined) : (window.allTxns !== null);
    const bpiReady = isMultiWallet ? (window.walletTxns.bpi !== undefined) : (window.allTxns !== null);
    const currentReady = isCurrentAccountBucketSeparate ? Array.isArray(window.allTxns) : true;
    const manualReady = (window.budgetManualTxns !== undefined);

    // Categories are only "Live Ready" if ALL their possible sources are loaded (Atomic Readiness)
    // Modified 2026-03-27: Consolidate to a single ready flag to prevent partial updates/flickers
    // Added window.hasBudgetLiveData check to ensure we wait for a LIVE sync, not just cache
    const isAggregatedReady = window.hasBudgetLiveData && atomeReady && bpiReady && manualReady && currentReady;
    
    // Safety Fallback: Allow cache rendering if live takes > 2.5s
    if (!window.budgetLoadStartTime) {
        window.budgetLoadStartTime = Date.now();
        // Modified 2026-03-27: Fail-safe trigger to ensure reveal even if data is stagnant
        setTimeout(() => {
            if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
        }, 2600);
    }
    const isTimeoutFallback = (Date.now() - window.budgetLoadStartTime > 2500);

    const canUseLiveNeeds = isAggregatedReady; 
    const canUseLiveWants = isAggregatedReady; 
    const canUseLiveSavings = isAggregatedReady;

    if (canUseLiveNeeds || canUseLiveWants || canUseLiveSavings) {
        // Live aggregation
        const now = new Date();
        const filterEl = document.getElementById('chart-filter');
        const currentFilter = filterEl ? filterEl.value : 'this_month';

        const aggregateFrom = (txns, account) => {
            txns.forEach(t => {
                if (t.excluded || t.reimbursed || t.refund) return;
                if (window.checkPeriod && !window.checkPeriod(t, currentFilter, 0, now)) return;

                const display = getMerchantDisplay(t.name || t.merchant, t);
                const amt = Math.abs(t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));
                const manualCat = t.manualBudgetCategory;
                
                // Track today's specific velocity
                const isToday = window.checkPeriod && window.checkPeriod(t, 'today', 0, now);

                // [NEW: 2026-04-03] Multi-Category Split Logic
                if (t.budgetSplit && (t.budgetSplit.needs > 0 || t.budgetSplit.wants > 0 || t.budgetSplit.savings > 0 || t.budgetSplit.na > 0)) {
                    const split = t.budgetSplit;
                    
                    // Add to Needs
                    if (split.needs > 0) {
                        needsTotal += split.needs;
                        if (isToday) todayNeeds += split.needs;
                    }
                    
                    // Add to Wants
                    if (split.wants > 0) {
                        wantsTotal += split.wants;
                        if (isToday) todayWants += split.wants;
                        wantsCategoryMap['Split Wants'] = (wantsCategoryMap['Split Wants'] || 0) + split.wants;
                    }
                    
                    // Add to Savings (Spent or Total depending on account)
                    if (split.savings > 0) {
                        const sourceAcc = t.account || account;
                        if (sourceAcc === 'atome') {
                            savingsSpent += split.savings;
                        } else {
                            savingsTotal += split.savings;
                        }
                    }
                    
                    return; // Done with this split transaction
                }

                if (manualCat) {
                    if (manualCat === 'needs') {
                        needsTotal += amt;
                        if (isToday) todayNeeds += amt;
                    } else if (manualCat === 'wants') {
                        wantsTotal += amt;
                        if (isToday) todayWants += amt;
                    } else if (manualCat === 'savings') {
                        // [REFINED: 2026-04-03] Manual Savings Split: Detect account from txn object if available
                        const sourceAcc = t.account || account;
                        if (sourceAcc === 'atome') {
                            savingsSpent += amt;
                        } else {
                            savingsTotal += amt;
                        }
                    }
                } else if (account === 'atome') {
                    if (display.category === 'Education' || display.category === 'Service' || display.category === 'Vehicle' || display.category === 'Transportation') {
                        needsTotal += amt;
                        if (isToday) todayNeeds += amt;
                    } else if (display.category === 'Shopping' || display.category === 'Online shopping' || display.category === 'Food & Drinks' || display.category === 'Life & Entertainment' || display.category === 'Sport' || display.category === 'Financial expenses' || display.category === 'Financial Expenses') {
                        wantsTotal += amt;
                        if (isToday) todayWants += amt;
                        wantsCategoryMap[display.category] = (wantsCategoryMap[display.category] || 0) + amt;
                    } else if (display.category === 'Savings') {
                        // [NEW: 2026-04-03] Atome Expense tagged Savings = Spent Savings (Olive)
                        savingsSpent += amt;
                    }
                } else if (account === 'bpi') {
                    if (display.category === 'Savings' || (t.name && t.name.toUpperCase().includes('SAVINGS'))) {
                        savingsTotal += amt;
                    } else if (display.category === 'Vehicle' || (t.name && (t.name.includes('Withdrawal') || t.name.includes('withdraw:')))) {
                        needsTotal += amt;
                        if (isToday) todayNeeds += amt;
                    }
                } else if (account === 'budget_manual') {
                    if (display.category === 'Education' || display.category === 'Service' || display.category === 'Vehicle' || display.category === 'Transportation') {
                        needsTotal += amt;
                        if (isToday) todayNeeds += amt;
                    } else if (display.category === 'Shopping' || display.category === 'Online shopping' || display.category === 'Food & Drinks' || display.category === 'Life & Entertainment' || display.category === 'Sport' || display.category === 'Financial expenses' || display.category === 'Financial Expenses') {
                        wantsTotal += amt;
                        if (isToday) todayWants += amt;
                        wantsCategoryMap[display.category] = (wantsCategoryMap[display.category] || 0) + amt;
                    } else if (display.category === 'Savings') {
                        // Manual savings usually count as accumulated unless specified
                        savingsTotal += amt;
                    }
                }
            });
        };

        if (window.walletTxns) {
            const aggregatedAccounts = new Set();
            const aggregateBucket = (txns, account) => {
                if (!account || aggregatedAccounts.has(account)) return;
                aggregatedAccounts.add(account);
                aggregateFrom(txns || [], account);
            };

            Object.entries(window.walletTxns).forEach(([account, txns]) => {
                aggregateBucket(txns, account);
            });

            if (isCurrentAccountBucketSeparate) {
                aggregateBucket(window.allTxns || [], window.currentAccount);
            }

            aggregateBucket(window.budgetManualTxns || [], 'budget_manual');
        } else {
            aggregateFrom(window.allTxns || [], window.currentAccount);
        }
    }

    // FALLBACK TO CACHE FOR SPECIFIC CATEGORIES (Modified 2026-03-27)
    // If a category source isn't ready, use its cached value instead of 0
    if (parsedCache) {
        if (!canUseLiveNeeds) needsTotal = parsedCache.needs || 0;
        if (!canUseLiveWants) wantsTotal = parsedCache.wants || 0;
        if (!canUseLiveSavings) {
            savingsTotal = parsedCache.savings || 0;
            savingsSpent = parsedCache.savingsSpent || 0;
        }
    }
    // --------------------------

    // Salary Target & Rules from LocalStorage (single declaration)
    const salaryTarget = parseFloat(localStorage.getItem('monthly_salary_target') || '17600');
    const budgetRule = localStorage.getItem('budget_rule') || '50/30/20';

    let weights = { needs: 0.50, wants: 0.30, savings: 0.20 };
    if (budgetRule === '40/30/30') {
        weights = { needs: 0.40, wants: 0.30, savings: 0.30 };
    } else if (budgetRule === '50/20/30') {
        weights = { needs: 0.50, wants: 0.20, savings: 0.30 };
    } else if (budgetRule === 'custom') {
        weights = {
            needs: (parseInt(localStorage.getItem('custom_rule_needs')) || 50) / 100,
            wants: (parseInt(localStorage.getItem('custom_rule_wants')) || 30) / 100,
            savings: (parseInt(localStorage.getItem('custom_rule_savings')) || 20) / 100
        };
    }

    const filterEl = document.getElementById('chart-filter');
    const filterVal = filterEl ? filterEl.value : 'this_month';
    const now = new Date();
    
    // Monthly Budget Label Update (Modified 2026-03-27)
    const monthDisplay = document.getElementById('triple-month-display');
    if (monthDisplay) {
        const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
        const currentMonthName = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();

        if (filterVal === 'this_month') monthDisplay.innerText = `${currentMonthName} ${currentYear}`;
        else if (filterVal === 'today') monthDisplay.innerText = `TODAY, ${currentMonthName.slice(0,3)} ${now.getDate()}`;
        else if (filterVal === 'this_week' || filterVal === 'last_week' || filterVal === 'last_7_days') monthDisplay.innerText = `WEEKLY BUDGET`;
        else if (filterVal === 'first_15' || filterVal === 'last_15') monthDisplay.innerText = `15-DAY BUDGET`;
        else if (filterVal === 'last_6_months') monthDisplay.innerText = `6-MONTH BUDGET`;
        else if (filterVal === 'this_year') monthDisplay.innerText = `YEARLY BUDGET`;
    }

    // SCALING LOGIC (Modified 2026-03-27)
    let scalingFactor = 1.0;
    if (filterVal === 'today') scalingFactor = 1 / 31;
    else if (filterVal === 'this_week' || filterVal === 'last_week' || filterVal === 'last_7_days') scalingFactor = 7 / 31;
    else if (filterVal === 'first_15' || filterVal === 'last_15') scalingFactor = 15 / 31;
    else if (filterVal === 'last_6_months') scalingFactor = 6;
    else if (filterVal === 'this_year') scalingFactor = 12;

    const needsLimit = salaryTarget * weights.needs * scalingFactor;
    const wantsLimit = salaryTarget * weights.wants * scalingFactor;
    const savingsLimit = salaryTarget * weights.savings * scalingFactor;

    const needsPct = Math.min((needsTotal / needsLimit) * 100, 100);
    const wantsPct = (wantsTotal / wantsLimit) * 100;
    
    // [REFINED: 2026-04-03] Savings Dual-Segment Logic
    const savingsAccumPct = Math.min((savingsTotal / savingsLimit) * 100, 100);
    const savingsSpentPct = Math.min((savingsSpent / savingsLimit) * 100, 100);
    const totalSavingsPct = Math.min(((savingsTotal + savingsSpent) / savingsLimit) * 100, 100);

        const isHidden = localStorage.getItem('balance_hidden') === 'true';
        const isRemainingMode = localStorage.getItem('budget_stats_mode') === 'remaining';
        
        const needsReadyToDisplay = canUseLiveNeeds || (parsedCache && parsedCache.needs !== undefined);
        const wantsReadyToDisplay = canUseLiveWants || (parsedCache && parsedCache.wants !== undefined);
        const savingsReadyToDisplay = canUseLiveSavings || (parsedCache && parsedCache.savings !== undefined);
        const allReadyToDisplay = needsReadyToDisplay && wantsReadyToDisplay && savingsReadyToDisplay;

        window.lastBudgetNotificationSnapshot = {
            uid: user?.uid || null,
            filterVal,
            needsReadyToDisplay,
            wantsReadyToDisplay,
            savingsReadyToDisplay,
            needsTotal,
            wantsTotal,
            savingsThresholdTotal: savingsTotal + savingsSpent,
            needsPct,
            wantsPct,
            savingsPct: totalSavingsPct,
            needsLimit,
            wantsLimit,
            savingsLimit,
            todayNeeds,
            todayWants,
            fullNeedsLimit: salaryTarget * weights.needs,
            fullWantsLimit: salaryTarget * weights.wants
        };

        const budgetNotifUid = user?.uid || localStorage.getItem('wallet_last_uid');
        const canRunBudgetNotifications = Boolean(
            budgetNotifUid
            && filterVal === 'this_month'
            && window.NotificationsEngine
        );

        if (allReadyToDisplay && !canRunBudgetNotifications) {
            persistBudgetProgress(budgetNotifUid || null, getBudgetProgressMonthKey(), filterVal, {
                needs: needsPct,
                wants: wantsPct,
                savings: totalSavingsPct
            }).catch(err => console.warn('Budget progress save failed:', err));
        }

        // Fire threshold notifications per category as soon as that visible total is ready.
        if (canRunBudgetNotifications) {
            const uid = budgetNotifUid;
            if (allReadyToDisplay) {
                syncBudgetThresholdTransitionNotifications(uid, {
                    ...window.lastBudgetNotificationSnapshot,
                    uid
                }).catch(err => console.warn('Budget threshold transition sync failed:', err));
            }

            const fullWantsLimit = salaryTarget * weights.wants;
            const fullNeedsLimit = salaryTarget * weights.needs;
            if (wantsReadyToDisplay && Number.isFinite(fullWantsLimit) && fullWantsLimit > 0) {
                window.NotificationsEngine.checkVelocity(uid, 'Wants', todayWants, fullWantsLimit);
            }
            if (needsReadyToDisplay && Number.isFinite(fullNeedsLimit) && fullNeedsLimit > 0) {
                window.NotificationsEngine.checkVelocity(uid, 'Needs', todayNeeds, fullNeedsLimit);
            }
        }

        const peso = '\u20B1';
        const triggerFadeIn = (el) => {
            if (!el) return;
            el.classList.remove('fade-in-load');
            void el.offsetWidth;
            el.classList.add('fade-in-load');
            window.clearTimeout(el._fadeInLoadTimer);
            el._fadeInLoadTimer = window.setTimeout(() => {
                el.classList.remove('fade-in-load');
            }, 420);
        };
        const formatStat = (current, limit) => {
            const formatInt = (num) => Math.floor(num).toLocaleString('en-US');

            if (isRemainingMode) {
                const left = Math.max(0, limit - current);
                const leftStr = `${peso}${formatDec(left)} LEFT`;
                return { raw: leftStr, display: isHidden ? `****** LEFT` : leftStr };
            } else {
                const raw = `${peso}${formatInt(current)} / ${peso}${formatInt(limit)}`;
                return { raw, display: isHidden ? `****** / ${peso}${formatInt(limit)}` : raw };
            }
        };

        const needsEl = document.getElementById('needs-stats');
        const needsPctEl = document.getElementById('needs-pct');
        if (needsEl) {
            const shouldReveal = (isAggregatedReady || isTimeoutFallback) && allReadyToDisplay; // Unified Gate
            
            if (shouldReveal) {
                const needsHadSkeleton = needsEl.classList.contains('skeleton');
                needsEl.classList.remove('skeleton');
                if (needsHadSkeleton) triggerFadeIn(needsEl);
                if (needsPctEl) {
                    const needsPctWasHidden = needsPctEl.style.visibility !== 'visible';
                    needsPctEl.innerText = `${Math.round((needsTotal / (needsLimit || 1)) * 100)}%`;
                    needsPctEl.style.opacity = '1';
                    needsPctEl.style.visibility = 'visible';
                    if (needsPctWasHidden) triggerFadeIn(needsPctEl);
                }
                if (needsReadyToDisplay) {
                    const diff = needsLimit - needsTotal;
                    const label = diff < 0 ? 'OVER' : 'LEFT'; 
                    const absDiff = Math.abs(Math.round(diff)); 

                    const statsVal = isRemainingMode ? 
                        (diff < 0 ? `${peso}-${absDiff.toLocaleString()} ${label}` : `${peso}${absDiff.toLocaleString()} ${label}`) :
                        `${peso}${Math.floor(needsTotal).toLocaleString()} / ${peso}${Math.floor(needsLimit).toLocaleString()}`;
                    needsEl.innerText = isHidden ? (isRemainingMode ? `****** ${label}` : `****** / ${peso}${Math.floor(needsLimit).toLocaleString()}`) : statsVal;
                    needsEl.dataset.raw = statsVal;
                }
            } else {
                needsEl.classList.add('skeleton');
                if (needsPctEl) {
                    needsPctEl.style.opacity = '0';
                    needsPctEl.style.visibility = 'hidden';
                }
            }
        }
        // --- Needs Bar Render ---
        const needsBar = document.getElementById('needs-bar');
        if (needsBar) {
            const bg = needsBar.closest('.progress-bar-bg');
            // Modified 2026-03-27: Bars only reveal when FULLY aggregated OR timeout fallback
            const shouldReveal = isAggregatedReady || isTimeoutFallback;

            if (bg && shouldReveal && needsReadyToDisplay) {
                if (bg.classList.contains('skeleton')) {
                    bg.classList.remove('skeleton');
                    triggerFadeIn(bg);
                    needsBar.style.width = '0%';
                    setTimeout(() => {
                        needsBar.style.width = `${needsPct}%`;
                    }, 150); 
                } else {
                    needsBar.style.width = `${needsPct}%`;
                }
            } else if (!shouldReveal) {
                // Keep in skeleton or reset to hidden while waiting
                if (bg) bg.classList.add('skeleton');
                needsBar.style.width = '0%';
            }
        }

        const wantsEl = document.getElementById('wants-stats');
        const wantsPctEl = document.getElementById('wants-pct');
        if (wantsEl) {
            const shouldReveal = (isAggregatedReady || isTimeoutFallback) && allReadyToDisplay;

            if (shouldReveal) {
                const wantsHadSkeleton = wantsEl.classList.contains('skeleton');
                wantsEl.classList.remove('skeleton');
                if (wantsHadSkeleton) triggerFadeIn(wantsEl);
                if (wantsPctEl) {
                    const wantsPctWasHidden = wantsPctEl.style.visibility !== 'visible';
                    wantsPctEl.innerText = `${Math.round((wantsTotal / (wantsLimit || 1)) * 100)}%`;
                    wantsPctEl.style.opacity = '1';
                    wantsPctEl.style.visibility = 'visible';
                    if (wantsPctWasHidden) triggerFadeIn(wantsPctEl);
                }
                if (wantsReadyToDisplay) {
                    const diff = wantsLimit - wantsTotal;
                    const label = diff < 0 ? 'OVER' : 'LEFT'; 
                    const absDiff = Math.abs(Math.round(diff));

                    const statsVal = isRemainingMode ?
                        (diff < 0 ? `${peso}-${absDiff.toLocaleString()} ${label}` : `${peso}${absDiff.toLocaleString()} ${label}`) :
                        `${peso}${Math.floor(wantsTotal).toLocaleString()} / ${peso}${Math.floor(wantsLimit).toLocaleString()}`;
                    wantsEl.innerText = isHidden ? (isRemainingMode ? `****** ${label}` : `****** / ${peso}${Math.floor(wantsLimit).toLocaleString()}`) : statsVal;
                    wantsEl.dataset.raw = statsVal;
                }
            } else {
                wantsEl.classList.add('skeleton');
                if (wantsPctEl) {
                    wantsPctEl.style.opacity = '0';
                    wantsPctEl.style.visibility = 'hidden';
                }
            }
        }
        // --- Wants Bar Render ---
        const wantsBar = document.getElementById('wants-bar');
        if (wantsBar) {
            const bg = wantsBar.closest('.progress-bar-bg');
            const shouldReveal = isAggregatedReady || isTimeoutFallback;

            if (bg && shouldReveal && wantsReadyToDisplay) {
                if (bg.classList.contains('skeleton')) {
                    bg.classList.remove('skeleton');
                    triggerFadeIn(bg);
                    wantsBar.style.width = '0%';
                    setTimeout(() => {
                        wantsBar.style.width = `${Math.min(wantsPct, 100)}%`;
                    }, 300); 
                } else {
                    wantsBar.style.width = `${Math.min(wantsPct, 100)}%`;
                }
            } else if (!shouldReveal) {
                if (bg) bg.classList.add('skeleton');
                wantsBar.style.width = '0%';
            }
            
    // Wants uses the updated gold tone as the base color
    let wantsColor = '#ED9326';
            if (wantsPct >= 70) {
                const ratio = Math.min((wantsPct - 70) / 30, 1);
                const h = 16 - (16 * ratio);
                const s = 100 - (16 * ratio);
                const l = 56 + (4 * ratio);
                wantsColor = `hsl(${h}, ${s}%, ${l}%)`;
            }
            wantsBar.style.backgroundColor = wantsColor;
            wantsBar.style.boxShadow = `0 0 12px ${wantsColor}44`;
        }
        
        const wantsOver = Math.max(0, wantsTotal - wantsLimit);
        const wantsMsg = document.getElementById('wants-depleted-msg');
        if (wantsMsg) {
            // Modified 2026-03-27: Gate message with Unified Reveal (Atomic Readiness)
            const shouldReveal = (isAggregatedReady || isTimeoutFallback) && allReadyToDisplay;
            if (shouldReveal) {
                if (wantsPct >= 100) {
                    wantsMsg.style.display = 'flex';
                    wantsMsg.className = 'overspending-msg critical';
                    wantsMsg.innerHTML = `<i class="material-icons" style="font-size: 16px; margin-right: 6px;">error_outline</i>
                                        <span>Wants depleted! Excess spent: ${peso}${wantsOver.toLocaleString()}</span>`;
                } else if (wantsPct >= 80) {
                    // SUGGESTION LOGIC (Modified 2026-03-27)
                    wantsMsg.style.display = 'flex';
                    wantsMsg.className = 'overspending-msg warning';
                    
                    // Find top category to suggest cutting
                    let topCat = "luxuries";
                    let maxVal = 0;
                    for (const [cat, val] of Object.entries(wantsCategoryMap)) {
                        if (val > maxVal) { maxVal = val; topCat = cat; }
                    }
                    
                    wantsMsg.innerHTML = `<i class="material-icons" style="font-size: 16px; margin-right: 6px;">lightbulb_outline</i>
                                        <span>Wants almost depleted! Consider cutting down on <b>${topCat}</b>.</span>`;
                } else {
                    wantsMsg.style.display = 'none';
                }
            } else {
                wantsMsg.style.display = 'none'; // Hide message if not ready
            }
        }

        const savingsEl = document.getElementById('savings-stats');
        const savingsPctEl = document.getElementById('savings-pct');
        if (savingsEl) {
            const shouldReveal = (isAggregatedReady || isTimeoutFallback) && allReadyToDisplay; // Unified Gate
            if (shouldReveal) {
                const savingsHadSkeleton = savingsEl.classList.contains('skeleton');
                savingsEl.classList.remove('skeleton');
                if (savingsHadSkeleton) triggerFadeIn(savingsEl);
                if (savingsPctEl) {
                    const savingsPctWasHidden = savingsPctEl.style.visibility !== 'visible';
                    const combinedPercentage = Math.round(((savingsTotal + savingsSpent) / (savingsLimit || 1)) * 100);
                    savingsPctEl.innerText = `${combinedPercentage}%`;
                    savingsPctEl.style.opacity = '1';
                    savingsPctEl.style.visibility = 'visible';
                    if (savingsPctWasHidden) triggerFadeIn(savingsPctEl);
                }
                if (savingsReadyToDisplay) {
                    const combinedSavings = savingsTotal + savingsSpent;
                    const diff = savingsLimit - combinedSavings;
                    const label = diff < 0 ? 'OVER' : 'LEFT'; 
                    const absDiff = Math.abs(Math.round(diff)); 

                    const statsVal = isRemainingMode ? 
                        (diff < 0 ? `${peso}-${absDiff.toLocaleString()} ${label}` : `${peso}${absDiff.toLocaleString()} ${label}`) :
                        `${peso}${Math.floor(combinedSavings).toLocaleString()} / ${peso}${Math.floor(savingsLimit).toLocaleString()}`;
                    savingsEl.innerText = isHidden ? (isRemainingMode ? `****** ${label}` : `****** / ${peso}${Math.floor(savingsLimit).toLocaleString()}`) : statsVal;
                    savingsEl.dataset.raw = statsVal;
                }
            } else {
                savingsEl.classList.add('skeleton');
                if (savingsPctEl) {
                    savingsPctEl.style.opacity = '0';
                    savingsPctEl.style.visibility = 'hidden';
                }
            }
        }
        // --- Savings Bar Render ---
        // [REFINED: Dual-Segment Rendering (Olive First) - 2026-04-03]
        const savingsBar = document.getElementById('savings-bar'); // Green
        const savingsBarSpent = document.getElementById('savings-bar-spent'); // Olive
        if (savingsBar) {
            const bg = savingsBar.closest('.progress-bar-bg');
            const shouldReveal = isAggregatedReady || isTimeoutFallback;

            if (bg && shouldReveal && savingsReadyToDisplay) {
                if (bg.classList.contains('skeleton')) {
                    bg.classList.remove('skeleton');
                    triggerFadeIn(bg);
                    savingsBar.style.width = '0%';
                    if (savingsBarSpent) savingsBarSpent.style.width = '0%';
                    
                    setTimeout(() => {
                        // Order in HTML: Spent (Olive) then Accumulated (Green)
                        if (savingsBarSpent) {
                            savingsBarSpent.style.width = `${savingsSpentPct}%`;
                        }
                        savingsBar.style.width = `${savingsAccumPct}%`;
                    }, 450); 
                } else {
                    if (savingsBarSpent) {
                        savingsBarSpent.style.width = `${savingsSpentPct}%`;
                    }
                    savingsBar.style.width = `${savingsAccumPct}%`;
                }
            } else if (!shouldReveal) {
                if (bg) bg.classList.add('skeleton');
                savingsBar.style.width = '0%';
                if (savingsBarSpent) {
                    savingsBarSpent.style.width = '0%';
                }
            }
        }


        const stats = [needsEl, wantsEl, savingsEl];
        stats.forEach((el, idx) => {
            if (el && allReadyToDisplay) {
                const skel = el.querySelector('.skeleton');
                if (skel) skel.remove();
            }
        });

        // Final Summary Calculations (Scaled)
        const totalSpendingLimit = needsLimit + wantsLimit;
        const totalSpendingActual = needsTotal + wantsTotal;
        const remaining = totalSpendingLimit - totalSpendingActual;
        
        const totalSpent = needsTotal + wantsTotal + (savingsTotal + savingsSpent); // Gross Monthly Use
        const totalBudget = (needsLimit + wantsLimit + savingsLimit) || 1;
        const usedPct = (totalSpent / totalBudget) * 100;
        const remainingPct = (remaining / (needsLimit + wantsLimit)) * 100; // Relative to spending buckets

        const statusKey = remaining <= 0 ? 'negative' : (remainingPct < 15 ? 'warning' : 'remaining');
        
        // [FIXED: 2026-04-05] Visual Fidelity: Restore footer class for background/value coloring
        const footer = document.getElementById('triple-summary-footer');
        if (footer) footer.className = `triple-summary-footer status-${statusKey}`;
        
        const displayVal = remaining; 
        const remainingRaw = remaining < 0 ? 
            `${peso}-${Math.abs(displayVal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
            `${peso}${displayVal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const totalSpentText = `${peso}${totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const remainingEl = document.getElementById('triple-remaining-val');
        const remainingLabel = document.getElementById('triple-remaining-label');
        if (remainingLabel) {
            remainingLabel.innerText = isRemainingMode ? 'Available Balance' : 'Total Spent';
        }

        if (remainingEl) {
            const shouldReveal = (isAggregatedReady || isTimeoutFallback) && allReadyToDisplay; // Modified 2026-03-27: Combined Reveal Gate
            remainingEl.dataset.raw = remainingRaw;
            remainingEl.className = `triple-summary-value privacy-mask ${statusKey}`;
            remainingEl.style.display = '';
            
            if (shouldReveal) {
                remainingEl.classList.remove('skeleton');
                remainingEl.innerText = isHidden ? '******' : remainingRaw;
            } else {
                // Modified 2026-03-27: Apply skeleton directly to element
                remainingEl.classList.add('skeleton');
                remainingEl.innerText = isHidden ? '******' : remainingRaw;
            }
        }

        // --- Fix 2026-03-28: Donut Chart View Logic ---
        const viewMode = localStorage.getItem('budget_view_mode') || 'bars';
        const barsView = document.getElementById('triple-bars-view');
        const donutView = document.getElementById('triple-donut-view');
        const viewIcon = document.getElementById('budget-view-icon');
        
        if (barsView && donutView) {
            if (viewMode === 'donut') {
                barsView.style.display = 'none';
                donutView.style.display = 'flex';
                if (viewIcon) viewIcon.innerText = 'view_sidebar';
                
                // Update Donut Rings
                const updateRing = (id, pct, circum) => {
                    const ring = document.getElementById(id);
                    if (ring) {
                        const offset = circum - (Math.min(pct, 100) / 100 * circum);
                        ring.style.strokeDasharray = `${circum - offset} ${circum}`;
                    }
                };
                
                // [FIXED: 2026-04-05] Visual Sync: Correct Donut Ring variable names and overflow capping
                updateRing('donut-needs', needsPct, 251.2);
                const wantsDonutPct = wantsLimit > 0 ? Math.min((wantsTotal / wantsLimit) * 100, 100) : 0;
                updateRing('donut-wants', wantsDonutPct, 188.4);
                
                // [FIXED: 2026-04-05] Savings Dual-Ring Logic: Render Spent portion and offset the Accumulated portion
                const savingsCircum = 125.6;
                updateRing('donut-savings-spent', savingsSpentPct, savingsCircum);
                const savingsSpentRing = document.getElementById('donut-savings-spent');
                if (savingsSpentRing) {
                    savingsSpentRing.style.opacity = savingsSpentPct > 0.25 ? '1' : '0';
                    savingsSpentRing.style.strokeLinecap = savingsSpentPct > 0.25 ? 'round' : 'butt';
                }
                
                const savingsRing = document.getElementById('donut-savings');
                if (savingsRing) {
                    const offset = -(savingsSpentPct / 100 * savingsCircum);
                    savingsRing.style.strokeDashoffset = offset;
                    const dashLen = (Math.min(savingsAccumPct, 100) / 100 * savingsCircum);
                    savingsRing.style.strokeDasharray = `${dashLen} ${savingsCircum}`;
                    savingsRing.style.opacity = dashLen > 0.25 ? '1' : '0';
                    savingsRing.style.strokeLinecap = dashLen > 0.25 ? 'round' : 'butt';
                }
                
                // Update Center Percentage (Weighted Average of Spending)
                const donutPctEl = document.getElementById('donut-pct');
                if (donutPctEl) {
                    const totalLimit = needsLimit + wantsLimit; 
                    const currentSpent = needsTotal + wantsTotal;
                    const avgPct = totalLimit > 0 ? Math.min((currentSpent / totalLimit) * 100, 100) : 0;
                    donutPctEl.innerText = `${Math.round(avgPct)}%`;
                }
            } else {
                barsView.style.display = 'block';
                donutView.style.display = 'none';
                if (viewIcon) viewIcon.innerText = 'donut_large';
            }
        }

        const usageSub = document.getElementById('triple-usage-sub');
        if (usageSub) {
            const shouldReveal = (isAggregatedReady || isTimeoutFallback) && allReadyToDisplay; // Modified 2026-03-27: Combined Reveal Gate
            if (shouldReveal) {
                const usageSubHadSkeleton = usageSub.classList.contains('skeleton');
                usageSub.classList.remove('skeleton');
                const totalBudgetText = `${peso}${totalBudget.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                usageSub.innerText = isHidden ? '******' : (isRemainingMode ? totalBudgetText : totalSpentText);
                if (usageSubHadSkeleton) triggerFadeIn(usageSub);
            } else {
                // Modified 2026-03-27: Apply skeleton directly to element
                usageSub.classList.add('skeleton');
            }
        }

        if (window.syncWidgets) window.syncWidgets();

        // --- SAVE TO CACHE ---
        if (canUseLiveNeeds && canUseLiveWants && canUseLiveSavings) {
            localStorage.setItem(cacheKey, JSON.stringify({
                needs: needsTotal,
                wants: wantsTotal,
                savings: savingsTotal,
                savingsSpent: savingsSpent,
                lastUpdate: Date.now()
            }));
        }
}

function checkAndTriggerAlert(alertKey, title, message, type) {
    const today = new Date().toDateString();
    const lastAlert = localStorage.getItem(`alert_${alertKey}_last`);
    
    // Only trigger once per day to avoid spamming
    if (lastAlert !== today) {
        createNotification(title, message, type);
        localStorage.setItem(`alert_${alertKey}_last`, today);
    }
}


// Charting Functions
export function drawPieChart(segments, total, isUpdate = false) {
    const svgGroup = document.getElementById('pieContent');
    const legend = document.getElementById('chart-legend');
    const totalVal = document.getElementById('chart-total-val');
    const totalLabel = document.getElementById('chart-total-label');
    const totalPct = document.getElementById('chart-total-pct');
    
    if (!svgGroup || !legend || !totalVal) return;

    svgGroup.innerHTML = '';
    legend.innerHTML = '';

    const centerX = 120; 
    const centerY = 120;
    const radius = 90; 
    const strokeWidth = 40; 
    const circumference = 2 * Math.PI * radius;
    
    const totalFormatted = total > 0 ? `ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.round(total).toLocaleString()}` : "ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±0";

    // State-based Label Logic
    if (totalLabel && totalVal) {
        if (!window.selectedCategoryName) {
            totalLabel.innerText = 'TOTAL';
            totalVal.innerText = localStorage.getItem('balance_hidden') === 'true' ? '******' : totalFormatted;
            totalVal.dataset.raw = totalFormatted;
            if (totalPct) totalPct.innerText = '';
        } else {
            const seg = segments.find(s => s.name === window.selectedCategoryName);
            if (seg) {
                totalLabel.innerText = seg.name;
                const valText = `ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.round(seg.value).toLocaleString()}`;
                totalVal.dataset.raw = valText;
                totalVal.innerText = localStorage.getItem('balance_hidden') === 'true' ? '******' : valText;
                if (totalPct) {
                    const pct = total > 0 ? ((seg.value / total) * 100).toFixed(2) : "0.00";
                    totalPct.innerText = parseFloat(pct) > 0 ? `${pct}%` : '';
                    totalPct.style.color = seg.color || '#10b981';
                }
            } else {
                window.selectedCategoryName = null;
                totalLabel.innerText = 'TOTAL';
                totalVal.innerText = localStorage.getItem('balance_hidden') === 'true' ? '******' : totalFormatted;
                totalVal.dataset.raw = totalFormatted;
                if (totalPct) totalPct.innerText = '';
            }
        }
    }

    const bgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgLayer.setAttribute('cx', centerX);
    bgLayer.setAttribute('cy', centerY);
    bgLayer.setAttribute('r', 120);
    bgLayer.setAttribute('fill', 'transparent');
    bgLayer.style.cursor = 'default';
    bgLayer.onclick = () => resetSelection();
    svgGroup.appendChild(bgLayer);

    const isDarkMode = document.body.classList.contains('dark-mode');

    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', centerX);
    track.setAttribute('cy', centerY);
    track.setAttribute('r', radius);
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', isDarkMode ? '#262626' : '#f1f5f9');
    track.setAttribute('stroke-width', strokeWidth);
    svgGroup.appendChild(track);

    const centerBtn = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerBtn.setAttribute('cx', centerX);
    centerBtn.setAttribute('cy', centerY);
    centerBtn.setAttribute('r', radius - strokeWidth/2);
    centerBtn.setAttribute('fill', 'transparent');
    centerBtn.style.cursor = 'pointer';
    centerBtn.onclick = (e) => {
        e.stopPropagation();
        resetSelection();
    };
    svgGroup.appendChild(centerBtn);
    
    if (segments.length === 0 || total === 0) {
        legend.innerHTML = `<div style="font-size:12px; color:#94a3b8; font-weight:600; grid-column: span 2; text-align:center;">No data</div>`;
        return;
    }

    let currentAngle = -90;

    function resetSelection() {
        window.selectedCategoryName = null;
        drawPieChart(segments, total, true); 
        if (window.highlightTransactions) window.highlightTransactions(null);
    }

    segments.forEach((seg, index) => {
        const percent = seg.value / total;
        const arcLength = percent * circumference;
        const isSelected = window.selectedCategoryName === seg.name;
        const dimOpacity = window.selectedCategoryName && !isSelected ? 0.2 : 1;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', centerX);
        circle.setAttribute('cy', centerY);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', seg.color);
        circle.setAttribute('stroke-width', isSelected ? strokeWidth + 6 : strokeWidth);
        if (window.selectedCategoryName && !isSelected) circle.setAttribute('opacity', '0.2');
        
        circle.setAttribute('stroke-dasharray', `${arcLength} ${circumference}`);
        circle.setAttribute('transform', `rotate(${currentAngle} ${centerX} ${centerY})`);
        circle.style.opacity = dimOpacity;
        circle.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        circle.style.cursor = 'pointer';
        
        const handleInteraction = (e) => {
            if(e) e.stopPropagation();
            window.selectedCategoryName = (window.selectedCategoryName === seg.name) ? null : seg.name;
            drawPieChart(segments, total, true);
            if (window.highlightTransactions) window.highlightTransactions(window.selectedCategoryName, seg.color);
        };

        circle.onclick = handleInteraction;
        svgGroup.appendChild(circle);
        currentAngle += (percent * 360);
        
        const lItem = document.createElement('div');
        lItem.className = `legend-item ${isSelected ? 'active' : ''}`;
        lItem.style.opacity = dimOpacity;
        lItem.innerHTML = `<div class="legend-color" style="background: ${seg.color}"></div><span>${seg.name}</span>`;
        lItem.onclick = handleInteraction;
        legend.appendChild(lItem);
    });
}

export function drawTrendChart(txns) {
    const path = document.getElementById('trendPath');
    const area = document.getElementById('trendArea');
    const totalEl = document.getElementById('trend-period-total');
    if (!path || txns.length === 0) return;

    // Simplified Trend Chart Implementation
    const dataPoints = new Array(4).fill(0);
    const now = new Date();
    txns.forEach(t => {
        const d = new Date(t.date);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && !t.excluded) {
            const week = Math.floor((d.getDate() - 1) / 7);
            if (week >= 0 && week < 4) {
                 dataPoints[week] += Math.abs(t.amount || 0);
            }
        }
    });

    const max = Math.max(...dataPoints, 500) * 1.2;
    const w = 400, h = 130, padding = 20;
    const chartW = w - (padding * 2);
    const step = chartW / (dataPoints.length - 1 || 1);

    let d = "", areaD = "";
    for (let i = 0; i < dataPoints.length; i++) {
        const x = padding + (i * step);
        const y = h - (dataPoints[i] / max) * h;
        if (i === 0) {
            d += `M ${x} ${y}`;
            areaD += `M ${x} ${h} L ${x} ${y}`;
        } else {
            d += ` L ${x} ${y}`;
            areaD += ` L ${x} ${y}`;
        }
    }
    areaD += ` L ${padding + ((dataPoints.length-1) * step)} ${h} Z`;
    area.setAttribute('d', areaD);
    path.setAttribute('d', d);

    // Add Interactive Data Points
    const pointsContainer = document.getElementById('trendPoints') || document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (!document.getElementById('trendPoints')) {
        pointsContainer.id = 'trendPoints';
        path.parentNode.appendChild(pointsContainer);
    }
    pointsContainer.innerHTML = '';

    for (let i = 0; i < dataPoints.length; i++) {
        const x = padding + (i * step);
        const y = h - (dataPoints[i] / max) * h;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#3b82f6');
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '2');
        circle.style.cursor = 'pointer';
        circle.style.transition = 'all 0.2s';

        circle.onclick = (e) => {
            e.stopPropagation();
            triggerHaptic('light');
            filterHistoryByWeek(i);
        };
        pointsContainer.appendChild(circle);
    }
}

function filterHistoryByWeek(weekIndex) {
    const txns = window.allTxns || [];
    const now = new Date();
    const filtered = txns.filter(t => {
        const d = new Date(t.date);
        const week = Math.floor((d.getDate() - 1) / 7);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && week === weekIndex;
    });
    
    // Temporarily override renderHistory to show only this week
    const container = document.getElementById('history-container');
    const originalContent = container.innerHTML;
    
    renderHistoryClean(filtered);
    
    // Add a "Clear Filter" floating pill if it doesn't exist
    let clearBtn = document.getElementById('clear-week-filter');
    if (!clearBtn) {
        clearBtn = document.createElement('div');
        clearBtn.id = 'clear-week-filter';
        clearBtn.innerHTML = `<span>Week ${weekIndex + 1} Filtered</span> <i class="material-icons" style="font-size:14px;">close</i>`;
        clearBtn.style.cssText = 'position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: #1e293b; color: #fff; padding: 10px 20px; border-radius: 30px; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 20px rgba(0,0,0,0.2); z-index: 2000; cursor: pointer;';
        clearBtn.onclick = () => {
            renderHistoryClean(window.allTxns);
            clearBtn.remove();
            triggerHaptic('light');
        };
        document.body.appendChild(clearBtn);
    }
}

// Insight and AI Summary
export async function updateAISummary(txns, force = false) {
    const boxEl = document.getElementById('ai-insight-box');
    const toggleEl = document.getElementById('summary-toggle');
    const summaryEl = document.getElementById('ai-summary-text') || document.getElementById('ai-summary-container');
    if (!summaryEl) return;
    const formatAISummaryHTML = (text) => {
        if (!text) return '';
        return text
            .replace(/(^|<br><br>)(Recommendation:)/gi, '$1<strong>$2</strong>')
            .replace(/(^|<br><br>)(Tip:)/gi, '$1<strong>$2</strong>')
            .replace(/(^|>|<br><br>)([^<]+?) is your leading expense/gi, '$1<strong>$2</strong> is your leading expense')
            .replace(/(?:₱|PHP)\s?[\d,]+(?:\.\d+)?/g, '<strong>$&</strong>')
            .replace(/\b\d+(?:\.\d+)?%/g, '<strong>$&</strong>')
            .replace(/\b(leading expense|track to spend|by month-end|daily average|save you|major budget driver)\b/gi, '<span class="ai-summary-highlight">$1</span>');
    };

    if (boxEl) {
        boxEl.style.display = 'block';
        boxEl.classList.remove('collapsed');
    }
    if (toggleEl) toggleEl.classList.remove('collapsed');
    localStorage.removeItem('wallet_ai_box_hidden');

    if (!Array.isArray(txns) || txns.length === 0) {
        summaryEl.innerText = 'AI insights will appear here after this month has enough spending data.';
        return;
    }
    
    const cacheKey = `ai_summary_${window.currentAccount}_${new Date().getMonth()}`;
    const cached = localStorage.getItem(cacheKey);
    if (!force && cached) {
        summaryEl.innerHTML = formatAISummaryHTML(cleanAIText(cached));
        return;
    }

    const backoffUntil = localStorage.getItem('ai_ratelimit_backoff');
    if (backoffUntil && Date.now() < parseInt(backoffUntil)) {
        const localText = LocalAI.analyze(txns);
        const badgeColor = '#64748b';
        summaryEl.innerHTML = `<span style="font-size: 8px; font-weight: 800; text-transform: uppercase; color: ${badgeColor}; border: 1px solid ${badgeColor}; padding: 1px 3px; border-radius: 3px; margin-right: 6px; vertical-align: middle; display: inline-flex; align-items: center; letter-spacing: 0.5px;">Edge AI</span>${formatAISummaryHTML(cleanAIText(localText))}`;
        return;
    }

    summaryEl.innerText = 'Analyzing your spending patterns...';
    
    const fetchInsights = async () => {
        const recentTxns = txns.slice(0, 50).map(t => ({
            merchant: t.merchant,
            amount: t.manualAmount || t.amount,
            category: getMerchantDisplay(t.merchant, t).category,
            date: t.date
        }));

        const prompt = `Quickly analyze these transactions: ${JSON.stringify(recentTxns)}. 
Provide a short, forward-looking financial insight (2 sentences) in BASIC ENGLISH. Focus on FORECASTING and future spending predictions (e.g., "At this rate, you will spend X by month-end"). Predict how much can be saved if spending in their top category is reduced by 20%. Put them in ONE PARAGRAPH.

Use DOUBLE LINE BREAKS to highlight these:
Recommendation: Concrete action to cut costs next month.
Tip: Predictive savings tip specific to the top merchant or category (e.g., if fuel/Seaoil, suggest promo days; if shopping, suggest loyalty points; if services/subs, suggest auditing).

Use plain text only. Do NOT use markdown, bold text, bullets, or asterisks. Do NOT line break between sentences. Only use line breaks for Recommendation and Tip. Avoid spaces before periods or commas.`;
        const preferredEngine = localStorage.getItem('ai_preferred_model') || 'auto';

        // --- TRY OPENAI ---
        if (preferredEngine === 'auto' || preferredEngine === 'ChatGPT') {
            try {
                const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: CONFIG.OPENAI_MODEL,
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 150
                    })
                });
                const openAIData = await openAIResponse.json();
                if (openAIData.choices?.[0]?.message?.content) {
                    return { text: openAIData.choices[0].message.content.trim(), engine: 'ChatGPT' };
                }
                if (preferredEngine === 'ChatGPT') throw new Error('OpenAI unavailable');
            } catch (err) { 
                console.error('OpenAI Error:', err);
                if (preferredEngine === 'ChatGPT') throw err;
            }
        }

        // --- TRY GEMINI ---
        if (preferredEngine === 'auto' || preferredEngine === 'Gemini') {
            try {
                const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });

                const geminiData = await geminiResponse.json();
                if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return { text: geminiData.candidates[0].content.parts[0].text.trim(), engine: 'Gemini' };
                }
                if (geminiData.error?.status === 'RESOURCE_EXHAUSTED' || geminiData.error?.code === 429) {
                    localStorage.setItem('ai_ratelimit_backoff', Date.now() + 15 * 60 * 1000);
                }
                if (preferredEngine === 'Gemini') throw new Error('Gemini unavailable');
            } catch (err) { 
                console.error('Gemini Error:', err);
                if (preferredEngine === 'Gemini') throw err;
            }
        }

        // --- FALLBACK ---
        const { LocalAI } = await import('./local-ai.js');
        return { text: LocalAI.analyze(txns), engine: 'Edge AI' };
    };

    try {
        let { text, engine } = await fetchInsights();
        text = cleanAIText(text);
        const badgeColor = engine === 'ChatGPT' ? '#10a37f' : (engine === 'Gemini' ? '#3b82f6' : '#64748b');
        summaryEl.innerHTML = `<span style="font-size: 8px; font-weight: 800; text-transform: uppercase; color: ${badgeColor}; border: 1px solid ${badgeColor}; padding: 1px 3px; border-radius: 3px; margin-right: 6px; vertical-align: middle; display: inline-flex; align-items: center; letter-spacing: 0.5px;">${engine}</span>${formatAISummaryHTML(text)}`;
        localStorage.setItem(cacheKey, text);
    } catch (err) {
        console.error("Master AI Error:", err);
        summaryEl.innerText = 'Restoring AI insights. Please sync your transactions to refresh analysis.';
    }
}


// Budget UI
export async function updateCategoryBudgetsUI() {
    const widget = document.getElementById('cat-budget-widget');
    const listContainer = document.getElementById('cat-budget-list');
    const account = window.currentAccount;
    const uid = auth.currentUser?.uid;

    if (!uid || !widget || !listContainer) return;

    const visibleAccounts = ['atome', 'bpi', 'default_wallet'];
    if (!visibleAccounts.includes(account)) {
        widget.style.display = 'none';
        return;
    }
    widget.style.display = 'block';

    const budgetRef = doc(db, "users", uid, "config", `budgets_${account}`);
    const docSnap = await getDoc(budgetRef).catch(() => null);
    let budgets = (docSnap && docSnap.exists()) ? docSnap.data().categories : null;

    if (!budgets) {
        listContainer.innerHTML = '<div style="text-align:center; padding:30px 20px; color:#94a3b8; font-size:12px;">No limits set.</div>';
        return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const itemsHTML = Object.entries(budgets).map(([cat, limit]) => {
        let spent = 0;
        if (window.allTxns) {
            window.allTxns.forEach(t => {
                const d = new Date(t.date);
                if (d.getFullYear() === year && d.getMonth() === month && !t.excluded) {
                    const mapped = getMerchantDisplay(t.merchant, t);
                    if (mapped.category === cat) {
                        spent += Math.abs(t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));
                    }
                }
            });
        }
        
        const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
        
        // Category Alert Triggers
        if (limit > 0) {
            const catLabel = displayCategoryName(cat);
            if (pct >= 100) {
                checkAndTriggerAlert(`cat_budget_${cat}_100`, `${catLabel} Limit Reached`, `You've maxed out your ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${limit.toLocaleString()} budget for ${catLabel}.`, 'error');
            } else if (pct >= 80) {
                checkAndTriggerAlert(`cat_budget_${cat}_80`, `${catLabel} Warning`, `You've used 80% of your ${catLabel} budget.`, 'warning');
            }
        }
        return `
            <div class="cat-budget-item">
                <div class="cat-budget-label"><span>${displayCategoryName(cat)}</span> <span>ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.round(spent).toLocaleString()} / ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${limit.toLocaleString()}</span></div>
                <div class="cat-budget-bar-wrap"><div class="cat-budget-bar" style="width: ${pct}%; background: ${pct > 90 ? '#ef4444' : '#3b82f6'};"></div></div>
            </div>
        `;
    }).join('');
    listContainer.innerHTML = itemsHTML;
}

// Profile UI Management
export function updateProfileUI(user) {
    const dropdown = document.getElementById('profile-dropdown');
    if (!dropdown) return;

    // Greeting Name Skeleton
    const nameEl = document.getElementById('user-display-name');
    if (!user && nameEl) {
        nameEl.innerHTML = '<div class="skeleton skeleton-text" style="width: 80px; height: 18px; margin-top: 4px;"></div>';
        return;
    }

    if (user.isAnonymous) {
        dropdown.innerHTML = `
            <div class="dropdown-header">Guest Session</div>
            <div class="dropdown-item" onclick="toggleDarkMode()">
                <i class="material-icons" id="theme-icon">dark_mode</i>
                <span id="theme-text">Dark Mode</span>
            </div>
            <div class="dropdown-item" onclick="window.toggleWidgetDarkMode()">
                <i class="material-icons" id="widget-dark-mode-icon">brightness_4</i>
                <span id="widget-dark-mode-text">Widget Dark Mode</span>
            </div>
            <div class="dropdown-item" onclick="handleAuthClick()">
                <i class="material-icons">cloud_upload</i>
                <span>Sign in with Google</span>
            </div>
        `;
        const nameEl = document.getElementById('user-display-name');
        if (nameEl) nameEl.innerText = 'Guest';
        const badge = document.getElementById('profile-badge');
        if (badge) badge.classList.remove('has-pic');
    } else {
        dropdown.innerHTML = `
            <div class="dropdown-header" id="dropdown-user-email">${user.email.toUpperCase()}</div>
            <div class="dropdown-item" onclick="toggleDarkMode()">
                <i class="material-icons" id="dark-mode-icon">dark_mode</i>
                <span id="dark-mode-text">Dark Mode</span>
            </div>
            <div class="dropdown-item" onclick="window.toggleWidgetDarkMode()">
                <i class="material-icons" id="widget-dark-mode-icon">brightness_4</i>
                <span id="widget-dark-mode-text">Widget Dark Mode</span>
            </div>
            <div class="dropdown-item" onclick="handleAuthClick()">
                <i class="material-icons">sync</i>
                <span>Switch Account</span>
            </div>
            <div class="dropdown-item" id="biometric-menu-item" onclick="toggleBiometricSetting()">
                <i class="material-icons">fingerprint</i>
                <span>Biometric Login</span>
                <div class="biometric-status-dot" id="biometric-status-dot"></div>
            </div>
            <div class="dropdown-item" onclick="promptSetPin()">
                <i class="material-icons">lock</i>
                <span>Privacy PIN</span>
            </div>
            <div class="dropdown-item logout" onclick="handleSignout()">
                <i class="material-icons">logout</i>
                <span>Log Out</span>
            </div>
        `;
         
         // Initial status update
         setTimeout(() => { if (typeof window.updateBiometricStatus === 'function') window.updateBiometricStatus(); }, 10);
         
         const parts = user.displayName?.split(' ') || [];
         const firstName = parts.length > 1 ? parts.slice(0, 2).join(' ') : (parts[0] || 'User');
         const nameEl = document.getElementById('user-display-name');
         if (nameEl) nameEl.innerText = firstName;
         localStorage.setItem('user_name', firstName);
         
         if (user.photoURL) {
             const picEl = document.getElementById('user-pic');
             let photoUrl = user.photoURL;
             if (photoUrl.includes('googleusercontent.com') && !photoUrl.includes('s96-c')) {
                 photoUrl = photoUrl.split('=')[0] + '=s96-c';
             }
             if (picEl) {
                 picEl.src = photoUrl;
                 picEl.style.display = 'block';
             }
             const badge = document.getElementById('profile-badge');
             if (badge) badge.classList.add('has-pic');
             localStorage.setItem('user_pic', photoUrl);
         }
    }
}

// Local Mode Nudge
export function handleLocalModeNudge(user) {
    if (window.justLoggedIn) return;
    if (user.isAnonymous) {
         const profileBadge = document.getElementById('profile-badge');
         if (profileBadge) {
             profileBadge.style.border = '2px solid #f59e0b';
             profileBadge.classList.add('local-nudge');
         }
         
         let banner = document.getElementById('local-banner');
         if (!banner) {
             banner = document.createElement('div');
             banner.id = 'local-banner';
             banner.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="material-icons" style="color:#f59e0b; font-size:20px;">cloud_off</i>
                    <span style="font-size:12px; font-weight:800; color:#1e293b; letter-spacing:0.2px;">SYNC YOUR DATA</span>
                </div>
                <button onclick="handleAuthClick()" class="banner-pill-btn">SIGN IN</button>
             `;
             banner.className = 'sticky-banner';
             const viewport = document.getElementById('cardViewport');
             if (viewport) viewport.after(banner);
             else document.body.prepend(banner);
         }
         banner.style.display = 'flex';
    } else {
         const badge = document.getElementById('profile-badge');
         if (badge) {
             badge.style.border = 'none';
             badge.classList.remove('local-nudge');
         }
         const banner = document.getElementById('local-banner');
         if (banner) banner.style.display = 'none';
    }
}

// Adaptive Sync Trigger
export function triggerAdaptiveSync() {
    const isAdmin = auth.currentUser && auth.currentUser.email === 'johnpaulinso123@gmail.com';
    if (!isAdmin || window.isSyncing) return;
    
    if (window.justLoggedIn) {
        console.log('ÃƒÂ¢Ã‚ÂÃ‚Â­ÃƒÂ¯Ã‚Â¸Ã‚Â Skipping auto-sync: just logged in.');
        return;
    }

    const id = window.currentAccount;
    if (id !== 'atome' && id !== 'bpi') return;

    const token = localStorage.getItem('g_access_token');

    if (token) {
        console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å¾ Auto-syncing ${id} on load (10 emails)...`);
        import('./app-data.js').then(m => {
            if (m.handleScan) {
                setTimeout(() => m.handleScan(10, false), 1500);
            }
        });
    } else {
        console.log(`ÃƒÂ¢Ã‚ÂÃ‚Â­ÃƒÂ¯Ã‚Â¸Ã‚Â No Gmail token found for ${id}. Use manual Sync to authenticate.`);
    }
}

// Account Switcher Management
export function updateAccountSwitcherUI(accounts) {
    const switcher = document.getElementById('account-switcher');
    if (!switcher) return;
    
    switcher.innerHTML = accounts.map(acc => `
        <div class="sw-slide" data-id="${acc.id}" onclick="switchAccount('${acc.id}')">
            <div class="sw-card" style="background: ${acc.color};">
                <div class="sw-card-label">${acc.type.toUpperCase()}</div>
                <div class="sw-card-name">${acc.name}</div>
            </div>
        </div>
    `).join('');
}

function resolveActiveAccountId(accounts, preferredId = null) {
    const list = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    if (!list.length) {
        return preferredId || window.currentAccount || localStorage.getItem('wallet_current_account') || 'default_wallet';
    }

    const desired = preferredId || window.currentAccount || localStorage.getItem('wallet_current_account');
    if (desired && list.some(acc => acc.id === desired)) return desired;

    const defaultAcc = list.find(acc => acc.isDefault);
    return defaultAcc ? defaultAcc.id : list[0].id;
}

function ensureActiveBalanceCard(accId) {
    const cards = Array.from(document.querySelectorAll('.balance-card'));
    if (!cards.length) return null;

    const target = cards.find(card => card.dataset.account === accId) || cards[0];
    cards.forEach(card => card.classList.toggle('active', card === target));
    return target;
}

function getBalanceCards() {
    return Array.from(document.querySelectorAll('.balance-card[data-account]'));
}

function getBalanceViewport() {
    return document.getElementById('cardCarouselScroll');
}

function getCardSnapLeft(card, viewport = getBalanceViewport()) {
    if (!card || !viewport) return 0;
    const rawLeft = card.offsetLeft - ((viewport.clientWidth - card.offsetWidth) / 2);
    const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    return Math.max(0, Math.min(rawLeft, maxLeft));
}

function getNearestBalanceCard(viewport = getBalanceViewport()) {
    const cards = getBalanceCards();
    if (!viewport || !cards.length) return null;

    const viewportCenter = viewport.scrollLeft + (viewport.clientWidth / 2);
    let closest = cards[0];
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card) => {
        const cardCenter = card.offsetLeft + (card.offsetWidth / 2);
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < closestDistance) {
            closest = card;
            closestDistance = distance;
        }
    });

    return closest;
}

function syncActiveAccountChrome(accId, accounts = window.walletAccounts || []) {
    if (!accId) return;
    window.currentAccount = accId;
    localStorage.setItem('wallet_current_account', accId);
    ensureActiveBalanceCard(accId);
    updateHeaderIcon(accId);
    applyAccountTheme(accId, accounts);
}

function snapToBalanceCard(card, behavior = 'smooth') {
    const viewport = getBalanceViewport();
    if (!viewport || !card) return;
    viewport.scrollTo({ left: getCardSnapLeft(card, viewport), behavior });
}

function settleToNearestBalanceCard(behavior = 'smooth', options = {}) {
    const card = getNearestBalanceCard();
    if (!card) return;
    snapToBalanceCard(card, behavior);
    syncActiveAccountChrome(card.dataset.account, window.walletAccounts || []);
    if (options.skipReload || window.__lastSettledWalletAccount === card.dataset.account) return;
    window.__lastSettledWalletAccount = card.dataset.account;
    import('./app-data.js').then((m) => m.loadData());
}

function releaseInstantActiveCards(container) {
    if (!container) return;
    window.requestAnimationFrame(() => {
        container.querySelectorAll('.balance-card.instant-active').forEach((card) => {
            card.classList.remove('instant-active');
        });
    });
}

function settleBalanceCards() {
    const viewport = document.getElementById('cardCarouselScroll');
    if (!viewport) return;
    viewport.classList.add('cards-settling');
    window.clearTimeout(viewport._cardsSettlingTimer);
    viewport._cardsSettlingTimer = window.setTimeout(() => {
        viewport.classList.remove('cards-settling');
    }, 320);
}

// Balance Cards Management - updated 2026-03-27 - added shimmer effect - 2026-03-27
export function updateBalanceCardsUI(accounts) {
    const container = document.getElementById('dynamic-balance-cards');
    if (!container) return;

    if (window.accountCardObserver?.disconnect) {
        try { window.accountCardObserver.disconnect(); } catch (e) {}
        window.accountCardObserver = null;
    }

    // SKELETON STATE: If accounts is null or empty, show 2 skeleton cards
    if (!accounts || accounts.length === 0) {
        container.innerHTML = `
            <div class="balance-card active instant-active atome-card wallet-card-skeleton skeleton-card skeleton-card-atome">
                <div class="skeleton-card-inner">
                    <div class="skeleton skeleton-title" style="opacity: 0.4;"></div>
                    <div class="skeleton skeleton-balance" style="opacity: 0.4;"></div>
                    <div class="skeleton skeleton-number" style="margin-top: auto; opacity: 0.4;"></div>
                    <i class="material-icons" style="position: absolute; bottom: 24px; right: 24px; color: rgba(255,255,255,0.08); font-size: 20px;">sync</i>
                </div>
            </div>
        `;
        return;
    }

    const activeAccountId = resolveActiveAccountId(accounts);
    syncActiveAccountChrome(activeAccountId, accounts);
    window.__lastSettledWalletAccount = activeAccountId;
    settleBalanceCards();

    const isHidden = localStorage.getItem('balance_hidden') === 'true';

    container.innerHTML = accounts.map(acc => {
        const isAtome = acc.id === 'atome';
        const isBPI = acc.id === 'bpi';
        const isActiveCard = acc.id === activeAccountId;
        const cardClass = `balance-card ${isActiveCard ? 'active instant-active' : ''} ${isAtome ? 'atome-card' : ''} ${isBPI ? 'bpi-card' : ''}`;
        
        return `
        <div class="${cardClass}" id="${acc.id}Card" data-account="${acc.id}" style="${!isBPI ? 'background: ' + acc.color + ';' : ''}">
            <div class="card-shimmer"></div> <!-- .card-shimmer - Added 2026-03-27 - subtle intermittent shimmer effect -->
            ${isAtome ? '<div class="card-brand-logo atome-brand-logo">A</div>' : ''}
            ${isBPI ? '<div class="bpi-rays"></div>' : ''}
            
            <div class="card-header-row">
                <div style="display: flex; align-items: baseline; gap: 6px;">
                    <div class="card-label" style="text-transform: uppercase;">${acc.name}</div>
                    ${isBPI ? '<div class="card-type-label" style="text-transform: lowercase; opacity: 0.5;">debit</div>' : ''}
                </div>
                ${acc.id !== 'default_wallet' ? `
                <div class="card-sync-status-chip">
                    <div class="dot syncDot"></div>
                    <span class="status-text syncStatusText">Ready</span>
                </div>
                ` : ''}
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px;">
                 <div class="balance-amount privacy-mask" data-raw="PHP ${acc.balance.toLocaleString(undefined, {minimumFractionDigits:2})}">${isHidden ? '******' : 'PHP ' + acc.balance.toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                 <button onclick="toggleBalanceVisibility(event)" class="visibility-btn" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; padding:4px; display:flex; align-items:center;">
                    <i class="material-icons" style="font-size:16px;">visibility</i>
                 </button>
            </div>

            ${isBPI ? `<div id="bpi-remaining-insight" class="privacy-mask" style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: -8px; margin-bottom: 20px; font-weight: 700; opacity: 1; transition: opacity 0.3s; position: relative; z-index: 2; letter-spacing: 0.3px;">${isHidden ? '******' : 'PHP 0.00 (0.00)'}</div>` : ''}
            
            <div class="card-footer">
                <div class="card-number-box">
                    <div class="card-number-label" style="text-transform: uppercase;">Account Number</div>
                    <div class="card-number" style="letter-spacing: ${isBPI ? '4px' : '2px'}; font-size: ${isBPI ? '14.5px' : '13.5px'};">${isBPI ? '0099 096727' : 'ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ' + acc.last4}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${(isAtome || isBPI) ? `
                    <button class="sync-icon-btn scan-btn" onclick="handleScan(100, true)" title="Sync Account">
                        <i class="material-icons">sync</i>
                    </button>
                    ` : ''}
                    ${acc.id !== 'default_wallet' ? `
                    <div class="mastercard-circles">
                        <div class="circle circle-1" style="${!isBPI && acc.color !== '#121212' ? 'background: #fff; opacity:0.8;' : ''}"></div>
                        <div class="circle circle-2" style="${!isBPI && acc.color !== '#121212' ? 'background: #fff; opacity:0.4;' : ''}"></div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');

    const renderedCards = container.querySelectorAll('.balance-card');
    renderedCards.forEach((card) => {
        window.requestAnimationFrame(() => triggerSoftFadeInElement(card));
    });
    
    if (window.setupAccountSwitcher) window.setupAccountSwitcher(); // Re-bind observer to new cards
    ensureActiveBalanceCard(activeAccountId);
    scrollToActiveCard(activeAccountId, 'auto');
    releaseInstantActiveCards(container);
}

// Scroll to Active Card
export function scrollToActiveCard(accId, behavior = 'smooth') {
    const card = ensureActiveBalanceCard(accId);
    if (card) {
        snapToBalanceCard(card, behavior);
    }
}
// Account Switcher Management
export function switchAccount(id, silentRestore = false, forceReload = false) {
    const resolvedId = resolveActiveAccountId(window.walletAccounts, id);
    if (resolvedId === window.currentAccount && !forceReload) return;
    syncActiveAccountChrome(resolvedId, window.walletAccounts || []);
    window.__lastSettledWalletAccount = resolvedId;
    scrollToActiveCard(resolvedId);
    if (!silentRestore) triggerHaptic('bump');
    
    // Toggle Safe to Spend Widget Visibility
    const safeSpendWidget = document.getElementById('safe-spend-widget');
    if (safeSpendWidget) {
        // Safe to Spend is specifically for BPI account
        safeSpendWidget.style.display = (resolvedId === 'bpi') ? 'block' : 'none';
        if (resolvedId === 'bpi') updateSafeSpendUI();
    }

    // Trigger data reload for the new account
    import('./app-data.js').then(m => m.loadData());

    // Auto-sync if token is fresh
    if (!silentRestore && (resolvedId === 'atome' || resolvedId === 'bpi')) {
        const token = localStorage.getItem('g_access_token');
        const tokenIssuedAt = parseInt(localStorage.getItem('g_token_issued_at') || '0');
        const tokenAge = Date.now() - tokenIssuedAt;
        const TOKEN_MAX_AGE = 50 * 60 * 1000;
        if (token && tokenAge < TOKEN_MAX_AGE) {
            import('./app-data.js').then(m => m.handleScan(25, false));
        }
    }
}

// Theme Management
export function applyAccountTheme(accId, accounts) {
    const acc = accounts.find(a => a.id === accId);
    if (!acc) return;
    
    document.documentElement.style.setProperty('--wallet-card-bg', acc.color);
    document.documentElement.style.setProperty('--dynamic-button-color', acc.color);
    
    ['header-card-bg', 'card-bg'].forEach((id) => {
        const cardBg = document.getElementById(id);
        if (cardBg) cardBg.setAttribute('fill', acc.color);
    });
    
    const label = document.getElementById('wallet-label');
    if (label) label.innerText = acc.name.toUpperCase();
}

// User View Application
export function applyUserView(user) {
    if (!user) return;
    const isBPI = window.currentAccount === 'bpi';
    
    const safeSpendWidget = document.getElementById('safe-spend-widget');
    if (safeSpendWidget) {
        safeSpendWidget.style.display = isBPI ? 'block' : 'none';
    }
}

// Balance and Insight


// Theme Applicator
export function applyTheme(accountOrColor) {
    let primaryColor = '#121212';
    
    if (accountOrColor.startsWith('#')) {
        primaryColor = accountOrColor;
    } else {
        const acc = (window.walletAccounts || []).find(a => a.id === accountOrColor);
        if (acc) primaryColor = acc.color;
    }

    const theme = {
        primary: primaryColor,
        nav: primaryColor,
        trend: primaryColor,
        light: primaryColor + 'cc'
    };
    
    window.currentThemeTrend = theme.trend; 
    
    const fab = document.querySelector('.fab');
    if(fab) {
        fab.style.backgroundColor = theme.primary;
        fab.style.transition = 'background-color 0.4s ease'; 
    }
    
    const activeNav = document.querySelector('.nav-item.active');
    if(activeNav) {
        activeNav.style.color = theme.nav;
        activeNav.style.transition = 'color 0.4s ease';
    }

    const trendPath = document.getElementById('trendPath');
    if(trendPath) {
        trendPath.setAttribute('stroke', theme.trend);
        trendPath.style.transition = 'stroke 0.5s ease';
    }
    
    const trendTotal = document.getElementById('trend-period-total');
    if(trendTotal) {
        trendTotal.style.color = theme.trend;
        trendTotal.style.transition = 'color 0.4s ease';
    }

    const stop1 = document.querySelector('#trendGradient stop[offset="0%"]');
    const stop2 = document.querySelector('#trendGradient stop[offset="100%"]');
    if(stop1) {
        stop1.style.stopColor = theme.trend;
        stop1.setAttribute('stop-color', theme.trend);
    }
    if(stop2) {
        stop2.style.stopColor = theme.trend;
        stop2.setAttribute('stop-color', theme.trend);
    }
    
    const logoIcon = document.getElementById('logo-toggle-icon');
    if(logoIcon && logoIcon.innerText === 'visibility') {
         logoIcon.style.color = theme.trend;
    }
}

// Carousel Swipe Logic
export function setupAccountSwitcher() {
    const viewport = document.getElementById('cardCarouselScroll');
    const cards = getBalanceCards();
    if (!viewport || cards.length === 0) return;

    if (viewport.__walletAccountSwitcherBound) {
        settleToNearestBalanceCard('auto', { skipReload: true });
        return;
    }

    let isDown = false;
    let startX;
    let scrollLeft;
    let hasDragged = false;
    const queueSettle = (behavior = 'smooth') => {
        window.clearTimeout(viewport.__walletSettleTimer);
        viewport.__walletSettleTimer = window.setTimeout(() => {
            viewport.style.scrollSnapType = 'x mandatory';
            settleToNearestBalanceCard(behavior);
        }, 110);
    };

    viewport.addEventListener('mousedown', (e) => {
        isDown = true;
        viewport.style.cursor = 'grabbing';
        viewport.style.scrollSnapType = 'none';
        startX = e.pageX - viewport.offsetLeft;
        scrollLeft = viewport.scrollLeft;
        hasDragged = false;
    });

    viewport.addEventListener('mouseleave', () => {
        if (!isDown) return;
        isDown = false;
        viewport.style.cursor = 'grab';
        queueSettle();
    });

    viewport.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        viewport.style.cursor = 'grab';
        queueSettle();
    });

    viewport.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 5) hasDragged = true;
        viewport.scrollLeft = scrollLeft - walk;
    });

    viewport.addEventListener('touchstart', (e) => {
        startX = e.touches[0].pageX - viewport.offsetLeft;
        scrollLeft = viewport.scrollLeft;
        isDown = true;
        hasDragged = false;
        viewport.style.scrollSnapType = 'none';
    }, { passive: true });

    viewport.addEventListener('touchmove', (e) => {
        if (!isDown) return;
        const x = e.touches[0].pageX - viewport.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 5) hasDragged = true;
        viewport.scrollLeft = scrollLeft - walk;
    }, { passive: true });

    viewport.addEventListener('touchend', () => {
        isDown = false;
        queueSettle();
    }, { passive: true });

    viewport.addEventListener('scroll', () => {
        if (isDown) return;
        queueSettle('smooth');
    }, { passive: true });

    viewport.__walletAccountSwitcherBound = true;
    settleToNearestBalanceCard('auto', { skipReload: true });
}

export function updateHeaderIcon(account) {
    const color = account === 'bpi' ? '#8b0000' : '#1a1a1a';
    ['header-card-bg', 'card-bg'].forEach((id) => {
        const cardBg = document.getElementById(id);
        if (cardBg) cardBg.setAttribute('fill', color);
    });
}

export function updateBalanceToThisMonth(txns, targetAccount) {
    // Modified 2026-04-02: Use ALL transactions for pinpoint accuracy if available, else use current batch
    const sourceTxns = (window.allTxns && window.allTxns.length > 0) ? window.allTxns : txns;
    
    let incomeTotal = 0;
    let expenseTotal = 0;
    const acc = targetAccount || window.currentAccount;

    sourceTxns.forEach(t => {
        // Filter by account if we are using the global pool
        if (targetAccount && t.account && t.account !== targetAccount) return;
        // Basic sync accounts usually don't have account field in txn object if loaded directly, 
        // but loadData ensures window.allTxns is correct for currentAccount.
        
        if (t.excluded || t.refund) return;
        const amt = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
        const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : { category: 'Other' };
        
        if (mapped.category === 'Income') {
            incomeTotal += amt;
        } else {
            expenseTotal += amt;
        }
    });

    const balanceEl = document.querySelector(`.balance-card[data-account="${acc}"] .balance-amount`) || document.getElementById(`${acc}-balance`);
    if (balanceEl) {
        const balance = incomeTotal - expenseTotal;
        const formatted = `PHP ${balance.toLocaleString(undefined, {minimumFractionDigits:2})}`;
        balanceEl.dataset.raw = formatted;
        balanceEl.classList.add('privacy-mask');
        
        const isHidden = localStorage.getItem('balance_hidden') === 'true';
        balanceEl.innerText = isHidden ? '******' : formatted;
        
        if (acc === 'atome') window.atomeBalanceVal = balance;
        if (acc === 'bpi') window.bpiBalanceVal = balance;
        if (window.updateBPIInsight) window.updateBPIInsight();
    }
    // Update insights using the specific view transactions (usually this month)
    updateInsightCards(txns);
}

export function updateInsightCards(txns) {
    const dailyAvgEl = document.getElementById('daily-avg-val');
    const bigVal = document.getElementById('biggest-txn-val');
    const summaryTotal = document.getElementById('summary-total');
    const dailyAvgSub = document.getElementById('daily-avg-sub');
    const bigSub = document.getElementById('biggest-txn-sub');
    const summaryChange = document.getElementById('summary-change');
    const summaryTopCat = document.getElementById('summary-top-cat');
    const summaryCount = document.getElementById('summary-txn-count');

    const rawTxns = Array.isArray(txns) ? txns.filter(t => t && typeof t === 'object') : null;

    if (!rawTxns) {
        if (dailyAvgEl) dailyAvgEl.innerHTML = '<div class="skeleton skeleton-insight-val"></div>';
        if (dailyAvgSub) dailyAvgSub.innerHTML = '<div class="skeleton skeleton-insight-sub"></div>';
        if (bigVal) bigVal.innerHTML = '<div class="skeleton skeleton-insight-val"></div>';
        if (bigSub) bigSub.innerHTML = '<div class="skeleton skeleton-insight-sub"></div>';
        if (summaryTotal) summaryTotal.innerHTML = '<div class="skeleton skeleton-text md" style="width: 100px;"></div>';
        if (summaryChange) summaryChange.innerHTML = '<div class="skeleton skeleton-text xs" style="width: 40px;"></div>';
        if (summaryTopCat) summaryTopCat.innerHTML = '<div class="skeleton skeleton-text xs" style="width: 60px;"></div>';
        if (summaryCount) summaryCount.innerHTML = '<div class="skeleton skeleton-text xs" style="width: 20px;"></div>';
        return;
    }

    const isHidden = localStorage.getItem('balance_hidden') === 'true';
    const peso = '\u20B1';
    const emDash = '\u2014';
    const arrowUp = '\u2191';
    const arrowDown = '\u2193';

    const setZeroState = () => {
        if (dailyAvgEl) {
            dailyAvgEl.dataset.raw = `${peso}0`;
            dailyAvgEl.textContent = isHidden ? '******' : `${peso}0`;
            triggerSoftFadeInElement(dailyAvgEl);
        }
        if (dailyAvgSub) {
            dailyAvgSub.textContent = 'BASED ON 0 DAYS';
            dailyAvgSub.className = 'insight-sub neutral';
            triggerSoftFadeInElement(dailyAvgSub);
        }
        if (bigVal) {
            bigVal.dataset.raw = `${peso}0`;
            bigVal.textContent = isHidden ? '******' : `${peso}0`;
            triggerSoftFadeInElement(bigVal);
        }
        if (bigSub) {
            bigSub.textContent = emDash;
            triggerSoftFadeInElement(bigSub);
        }
        if (summaryTotal) {
            summaryTotal.dataset.raw = `${peso}0.00`;
            summaryTotal.textContent = isHidden ? '******' : `${peso}0.00`;
            triggerSoftFadeInElement(summaryTotal);
        }
        if (summaryCount) {
            summaryCount.textContent = '0';
            triggerSoftFadeInElement(summaryCount);
        }
        if (summaryChange) {
            summaryChange.textContent = emDash;
            summaryChange.className = 's-value';
            triggerSoftFadeInElement(summaryChange);
        }
        if (summaryTopCat) {
            summaryTopCat.textContent = emDash;
            triggerSoftFadeInElement(summaryTopCat);
        }
        window.thisMonthTxns = [];
    };

    const parseTxnDate = (value) => {
        if (!value) return null;

        let parsed = null;
        if (value instanceof Date) parsed = value;
        else if (typeof value.toDate === 'function') parsed = value.toDate();
        else if (typeof value.toMillis === 'function') parsed = new Date(value.toMillis());
        else if (typeof value.seconds === 'number') parsed = new Date(value.seconds * 1000);
        else if (typeof value === 'number') parsed = new Date(value < 1e12 ? value * 1000 : value);
        else if (typeof value === 'string') {
            parsed = new Date(value);
            if (Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                parsed = new Date(`${value}T12:00:00`);
            }
        } else {
            parsed = new Date(value);
        }

        return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    };

    const getAmt = (t) => {
        const raw = t.manualAmount !== undefined ? t.manualAmount : (t.amount ?? 0);
        const amount = Number(raw);
        return Number.isFinite(amount) ? Math.abs(amount) : 0;
    };

    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const filterExpenseTxn = (targetYear, targetMonth) => rawTxns.filter((t) => {
            if (!t || t.deleted || t.excluded || t.refund || t.reimbursed) return false;
            const d = parseTxnDate(t.date || t.createdAt);
            if (!d || d.getFullYear() !== targetYear || d.getMonth() !== targetMonth) return false;
            const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : { category: 'Other' };
            return mapped.category !== 'Income';
        });

        const thisMonthTxns = filterExpenseTxn(year, month);
        const lmDate = new Date(year, month - 1, 1);
        const lastMonthTxns = filterExpenseTxn(lmDate.getFullYear(), lmDate.getMonth());

        const thisMonthTotal = thisMonthTxns.reduce((sum, t) => sum + getAmt(t), 0);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyAvg = daysInMonth > 0 ? thisMonthTotal / daysInMonth : 0;

        if (dailyAvgEl) {
            const formatted = `${peso}${dailyAvg.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            dailyAvgEl.dataset.raw = formatted;
            dailyAvgEl.textContent = isHidden ? '******' : formatted;
            triggerSoftFadeInElement(dailyAvgEl);
        }

        const lastMonthTotal = lastMonthTxns.reduce((sum, t) => sum + getAmt(t), 0);
        const daysInLM = new Date(lmDate.getFullYear(), lmDate.getMonth() + 1, 0).getDate();
        const lastDailyAvg = daysInLM > 0 ? lastMonthTotal / daysInLM : 0;

        if (dailyAvgSub) {
            if (lastDailyAvg > 0) {
                const pct = ((dailyAvg - lastDailyAvg) / lastDailyAvg) * 100;
                dailyAvgSub.textContent = `${pct > 0 ? arrowUp : arrowDown} ${Math.abs(pct).toFixed(0)}% vs last month`;
                dailyAvgSub.className = `insight-sub ${pct > 0 ? 'up' : 'down'}`;
            } else {
                dailyAvgSub.textContent = `BASED ON ${daysInMonth} DAYS`;
                dailyAvgSub.className = 'insight-sub neutral';
            }
            triggerSoftFadeInElement(dailyAvgSub);
        }

        let biggestAmt = 0;
        let biggestName = emDash;
        thisMonthTxns.forEach((t) => {
            const amt = getAmt(t);
            if (amt > biggestAmt) {
                biggestAmt = amt;
                const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : null;
                biggestName = mapped?.name || t.merchant || t.note || 'Unknown';
            }
        });

        if (bigVal) {
            const formatted = `${peso}${biggestAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            bigVal.dataset.raw = formatted;
            bigVal.textContent = isHidden ? '******' : formatted;
            triggerSoftFadeInElement(bigVal);
        }
        if (bigSub) {
            bigSub.textContent = String(biggestName || emDash).toUpperCase();
            triggerSoftFadeInElement(bigSub);
        }

        if (summaryTotal) {
            const formatted = `${peso}${thisMonthTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            summaryTotal.dataset.raw = formatted;
            summaryTotal.textContent = isHidden ? '******' : formatted;
            triggerSoftFadeInElement(summaryTotal);
        }
        if (summaryCount) {
            summaryCount.textContent = String(thisMonthTxns.length);
            triggerSoftFadeInElement(summaryCount);
        }

        if (summaryChange) {
            if (lastMonthTotal > 0) {
                const pct = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
                summaryChange.textContent = `${pct > 0 ? arrowUp : arrowDown} ${Math.abs(pct).toFixed(0)}%`;
                summaryChange.className = `s-value ${pct > 0 ? 'red' : 'green'}`;
            } else {
                summaryChange.textContent = emDash;
                summaryChange.className = 's-value';
            }
            triggerSoftFadeInElement(summaryChange);
        }

        if (summaryTopCat) {
            const catTotals = {};
            thisMonthTxns.forEach((t) => {
                const mapped = getMerchantDisplay(t.merchant, t);
                const cat = t.manualCategory || mapped.category || 'Uncategorized';
                const label = typeof displayCategoryName === 'function' ? displayCategoryName(cat) : cat;
                catTotals[label] = (catTotals[label] || 0) + getAmt(t);
            });
            const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
            summaryTopCat.textContent = topCat ? topCat[0] : emDash;
            triggerSoftFadeInElement(summaryTopCat);
        }

        window.thisMonthTxns = thisMonthTxns;
        if (typeof window.updateAISummary === 'function') {
            clearTimeout(window.aiSummaryTimeout);
            window.aiSummaryTimeout = setTimeout(() => {
                window.updateAISummary(thisMonthTxns);
            }, 2000);
        }

        if (window.syncWidgets) window.syncWidgets();
    } catch (error) {
        console.warn('updateInsightCards fallback triggered', error);
        setZeroState();
    }
}
window.updateInsightCards = updateInsightCards;

export function initPrivacyLock() {
    const pin = localStorage.getItem('wallet_privacy_pin');
    const isUnlocked = sessionStorage.getItem('wallet_unlocked') === 'true';
    if (pin && !isUnlocked) {
        const lockEl = document.getElementById('privacy-lock');
        if (lockEl) lockEl.style.display = 'flex';
        if (window.PublicKeyCredential) {
            const bioBtn = document.getElementById('bio-btn');
            if (bioBtn) bioBtn.style.display = 'flex';
        }
    }
}

export async function tryBiometricUnlock() {
    const confirmed = await window.showAppDialog({
        title: 'Biometric Unlock',
        message: 'Authenticate using FaceID / Fingerprint?',
        confirm: true
    });
    if (confirmed) {
        const lockEl = document.getElementById('privacy-lock');
        if (lockEl) lockEl.style.display = 'none';
        sessionStorage.setItem('wallet_unlocked', 'true');
        if (window.showToast) window.showToast('Authenticated via Biometrics');
    }
}

export function drawCashFlowChart() {
    const container = document.getElementById('cashflow-bars');
    if (!container || !window.allTxns) return;

    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        months.push({
            name: d.toLocaleDateString('en-US', { month: 'short' }),
            month: d.getMonth(),
            year: d.getFullYear(),
            income: 0,
            expense: 0
        });
    }

    window.allTxns.forEach(t => {
        const d = new Date(t.date);
        const mIdx = months.findIndex(m => m.month === d.getMonth() && m.year === d.getFullYear());
        if (mIdx > -1) {
            const mapped = getMerchantDisplay(t.merchant, t);
            const amt = Math.abs(t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));
            if (!t.excluded && !t.refund && !t.reimbursed) {
                if (mapped.category === 'Income') months[mIdx].income += amt;
                else months[mIdx].expense += amt;
            }
        }
    });

    const maxVal = Math.max(...months.map(m => Math.max(m.income, m.expense)), 1000);
    
    let html = '';
    months.forEach(m => {
        const incH = (m.income / maxVal) * 80;
        const expH = (m.expense / maxVal) * 80;
        html += `
            <div class="bar-group">
                <div class="bars-pair">
                    <div class="bar bar-income" style="height: ${incH}px;" title="Income: ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${m.income.toLocaleString()}"></div>
                    <div class="bar bar-expense" style="height: ${expH}px;" title="Expense: ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${m.expense.toLocaleString()}"></div>
                </div>
                <div class="bar-label">${m.name}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function checkDailySummary() {
    const lastSummary = localStorage.getItem('last_daily_summary_date');
    const today = new Date().toDateString();
    
    if (lastSummary === today || !window.allTxns) return;
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toDateString();
    
    let ySpent = 0;
    window.allTxns.forEach(t => {
        const d = new Date(t.date);
        if (d.toDateString() === yStr && !t.excluded && !t.refund) {
            ySpent += Math.abs(t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));
        }
    });
    
    if (ySpent > 0) {
        createNotification('Daily Summary', `Yesterday you spent ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.round(ySpent).toLocaleString()}. Check your trends to see how you're doing!`, 'info');
        localStorage.setItem('last_daily_summary_date', today);
    }
}

export function detectSubscriptions() {
    const container = document.getElementById('subscription-grid');
    const section = document.getElementById('subscription-insights');
    if (!container || !section || !window.allTxns) return;

    const now = new Date();
    const targetMonth = now.getMonth();
    const targetYear = now.getFullYear();

    const merchantMap = {};

    window.allTxns.forEach(t => {
        if (t.excluded || t.refund || t.reimbursed) return;
        const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : null;
        if (!mapped || mapped.category === 'Income') return;
        
        const name = mapped.name || t.merchant;
        if (!merchantMap[name]) merchantMap[name] = { name, icon: mapped.icon, cat: mapped.category, monthlySpend: {} };
        const d = new Date(t.date);
        const key = `${d.getMonth()}-${d.getFullYear()}`;
        const amt = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
        merchantMap[name].monthlySpend[key] = (merchantMap[name].monthlySpend[key] || 0) + amt;
    });

    const subs = [];
    Object.values(merchantMap).forEach(m => {
        const monthKeys = Object.keys(m.monthlySpend);
        if (monthKeys.length < 2) return;

        const sortedKeys = monthKeys.sort((a,b) => {
            const [ma, ya] = a.split('-').map(Number);
            const [mb, yb] = b.split('-').map(Number);
            return ya === yb ? ma - mb : ya - yb;
        });

        let maxConsecutive = 0;
        let currentConsecutive = 0;
        let lastMonthIndex = -1;

        sortedKeys.forEach(k => {
            const [mon, yr] = k.split('-').map(Number);
            const monthIndex = yr * 12 + mon;
            if (lastMonthIndex === -1 || monthIndex === lastMonthIndex + 1) {
                currentConsecutive++;
            } else {
                currentConsecutive = 1;
            }
            lastMonthIndex = monthIndex;
            if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
        });

        const mName = m.name.toLowerCase();
        const isWhitelisted = mName.includes('spotify') || mName.includes('traders connect') ||
                              mName.includes('mr diy') || mName.includes('mrdiy') ||
                              mName.includes('tecfuel') || mName.includes('tec fuel') ||
                              mName.includes('jollibee') || mName.includes('shell') ||
                              mName.includes('petron') || mName.includes('globe') || mName.includes('gomo');
        
        const last4Months = [];
        for (let i = 0; i < 4; i++) {
            const d = new Date(targetYear, targetMonth - i, 1);
            last4Months.push(`${d.getMonth()}-${d.getFullYear()}`);
        }
        const presentInLast4 = last4Months.filter(k => m.monthlySpend[k]).length;
        
        if (isWhitelisted) {
            if (presentInLast4 < 2) return;
        } else if (maxConsecutive < 4) return;

        const currentKey = `${targetMonth}-${targetYear}`;
        m.currentMonthSpend = m.monthlySpend[currentKey] || 0;

        let historicalSum = 0;
        let historicalCount = 0;
        monthKeys.forEach(k => {
            if (k !== currentKey) {
                historicalSum += m.monthlySpend[k];
                historicalCount++;
            }
        });
        m.averageSpend = historicalCount > 0 ? (historicalSum / historicalCount) : m.currentMonthSpend;
        subs.push(m);
    });

    if (subs.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = subs.sort((a,b) => b.currentMonthSpend - a.currentMonthSpend).map(g => {
        const perc = g.averageSpend > 0 ? (g.currentMonthSpend / g.averageSpend) * 100 : 0;
        const statusColor = g.currentMonthSpend > g.averageSpend ? '#ef4444' : '#10b981';
        return `
            <div class="sub-item">
                <div class="sub-icon-box">
                    <i class="material-icons">${g.icon || 'star'}</i>
                </div>
                <div class="sub-info">
                    <div class="sub-name">${g.name}</div>
                    <div class="sub-label">AVG ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.round(g.averageSpend).toLocaleString()}</div>
                </div>
                <div class="sub-val" style="color: ${statusColor}">
                    ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.round(g.currentMonthSpend).toLocaleString()}
                </div>
            </div>
        `;
    }).join('');

    // Subscription Reminder Trigger
    subs.forEach(s => {
        if (s.currentMonthSpend === 0 && s.averageSpend > 0) {
            // Predict if due soon (heuristic: if middle of month and not paid)
            const day = new Date().getDate();
            if (day >= 10 && day <= 25) {
                checkAndTriggerAlert(`sub_${s.name.replace(/\s+/g, '_')}`, 'Upcoming Bill', `${s.name} is usually paid around this time (Avg: ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±${Math.round(s.averageSpend).toLocaleString()}).`, 'info');
            }
        }
    });
}

// Profile Dropdown Management
export function toggleProfileDropdown(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
        const isActive = dropdown.classList.toggle('active');
        if (isActive) {
            triggerHaptic('light');
            if (window.NavState) {
                window.NavState.pushModalState('profile-dropdown', () => {
                    dropdown.classList.remove('active');
                });
            }
        } else {
            if (window.NavState) window.NavState.popModalState('profile-dropdown');
        }
    }
}

// Notification Center Management
export function toggleNotificationCenter(e) {
    if (e) e.stopPropagation();
    const sidebar = document.getElementById('notification-center');
    console.log('ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Â toggleNotificationCenter called. Sidebar found:', !!sidebar);
    
    if (!sidebar) {
        console.error('ÃƒÂ¢Ã‚ÂÃ…â€™ Notification sidebar element (#notification-center) NOT FOUND in DOM');
        return;
    }
    
    const isActive = sidebar.classList.toggle('active');
    
    if (isActive) {
        renderNotifications();
        triggerHaptic('light');
        
        // Push modal state for universal back button
        if (window.NavState) {
            window.NavState.pushModalState('notification-center', () => {
                sidebar.classList.remove('active');
            });
        }
    } else {
        if (window.NavState) {
            window.NavState.popModalState('notification-center');
        }
    }
}

function seedBudgetThresholdNotificationsFromSnapshot() {
    const snapshot = window.lastBudgetNotificationSnapshot;
    const engine = window.NotificationsEngine;
    const uid = snapshot?.uid || window.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid');
    if (!snapshot || snapshot.filterVal !== 'this_month' || !uid || !engine?.ensureBudgetThresholdInApp) return;

    ensureBudgetThresholdLocalFallback('Needs', snapshot.needsTotal, snapshot.needsLimit);
    ensureBudgetThresholdLocalFallback('Wants', snapshot.wantsTotal, snapshot.wantsLimit);
    ensureBudgetThresholdLocalFallback('Savings', snapshot.savingsThresholdTotal, snapshot.savingsLimit);
    ensureBudgetThresholdNotificationFromSnapshot(uid, snapshot);

    if (snapshot.needsReadyToDisplay && Number.isFinite(snapshot.needsLimit) && snapshot.needsLimit > 0) {
        engine.ensureBudgetThresholdInApp(uid, 'Needs', snapshot.needsTotal, snapshot.needsLimit);
    }
    if (snapshot.wantsReadyToDisplay && Number.isFinite(snapshot.wantsLimit) && snapshot.wantsLimit > 0) {
        engine.ensureBudgetThresholdInApp(uid, 'Wants', snapshot.wantsTotal, snapshot.wantsLimit);
    }
    if (snapshot.savingsReadyToDisplay && Number.isFinite(snapshot.savingsLimit) && snapshot.savingsLimit > 0) {
        engine.ensureBudgetThresholdInApp(uid, 'Savings', snapshot.savingsThresholdTotal, snapshot.savingsLimit);
    }
}

export async function forceBudgetNotificationCheck() {
    if (typeof window.updateTripleProgressBar === 'function') {
        window.updateTripleProgressBar();
    }

    const snapshot = window.lastBudgetNotificationSnapshot;
    const uid = snapshot?.uid || window.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid');
    if (!snapshot || snapshot.filterVal !== 'this_month' || !uid || !window.NotificationsEngine) return;

    seedBudgetThresholdNotificationsFromSnapshot();

    const jobs = [];
    ensureBudgetThresholdNotificationFromSnapshot(uid, snapshot);
    if (snapshot.needsReadyToDisplay && Number.isFinite(snapshot.needsLimit) && snapshot.needsLimit > 0) {
        if (window.NotificationsEngine.ensureBudgetThresholdInApp) {
            window.NotificationsEngine.ensureBudgetThresholdInApp(uid, 'Needs', snapshot.needsTotal, snapshot.needsLimit);
        }
        jobs.push(window.NotificationsEngine.checkBudgetThresholds(uid, 'Needs', snapshot.needsTotal, snapshot.needsLimit));
        jobs.push(window.NotificationsEngine.checkVelocity(uid, 'Needs', snapshot.todayNeeds, snapshot.fullNeedsLimit));
    }
    if (snapshot.wantsReadyToDisplay && Number.isFinite(snapshot.wantsLimit) && snapshot.wantsLimit > 0) {
        if (window.NotificationsEngine.ensureBudgetThresholdInApp) {
            window.NotificationsEngine.ensureBudgetThresholdInApp(uid, 'Wants', snapshot.wantsTotal, snapshot.wantsLimit);
        }
        jobs.push(window.NotificationsEngine.checkBudgetThresholds(uid, 'Wants', snapshot.wantsTotal, snapshot.wantsLimit));
        jobs.push(window.NotificationsEngine.checkVelocity(uid, 'Wants', snapshot.todayWants, snapshot.fullWantsLimit));
    }
    if (snapshot.savingsReadyToDisplay && Number.isFinite(snapshot.savingsLimit) && snapshot.savingsLimit > 0) {
        if (window.NotificationsEngine.ensureBudgetThresholdInApp) {
            window.NotificationsEngine.ensureBudgetThresholdInApp(uid, 'Savings', snapshot.savingsThresholdTotal, snapshot.savingsLimit);
        }
        jobs.push(window.NotificationsEngine.checkBudgetThresholds(uid, 'Savings', snapshot.savingsThresholdTotal, snapshot.savingsLimit));
    }

    if (!jobs.length) return;
    await Promise.allSettled(jobs);
}

function getLocalFallbackNotifications() {
    try {
        const raw = getStoredLocalFallbackNotificationsRaw();
        if (!Array.isArray(raw)) return [];
        return raw.map(item => ({
            id: `local-${item.id}`,
            title: item.title || 'Notification',
            body: item.message || '',
            type: item.type || 'general',
            isRead: item.unread === false,
            createdAtMs: Number(new Date(item.time).getTime()) || Date.now(),
            isLocalFallback: true,
            action: item.action || null,
            meta: item.meta || null
        }));
    } catch (e) {
        return [];
    }
}

function getStoredLocalFallbackNotificationsRaw() {
    try {
        const raw = JSON.parse(localStorage.getItem('smartwallet_notifications') || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch (e) {
        return [];
    }
}

function writeLocalFallbackNotifications(items) {
    try {
        localStorage.setItem('smartwallet_notifications', JSON.stringify(items));
    } catch (e) {
        console.warn('Failed to persist local fallback notifications:', e);
    }
}

function ensureBudgetThresholdLocalFallback(category, current, limitAmount) {
    if (!Number.isFinite(current) || !Number.isFinite(limitAmount) || limitAmount <= 0) return false;

    const pct = (current / limitAmount) * 100;
    const monthKey = window.NotificationsEngine?.getCurrentMonthKey
        ? window.NotificationsEngine.getCurrentMonthKey()
        : (() => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        })();
    const categoryKey = window.NotificationsEngine?.normalizeCategoryKey
        ? window.NotificationsEngine.normalizeCategoryKey(category)
        : String(category || 'general').trim().toLowerCase();

    let tier = null;
    if (pct >= 100) {
        tier = {
            pct: 100,
            title: 'Limit Reached',
            body: `Red Alert: You've hit 100% of your ${category} budget!`
        };
    } else if (pct >= 90) {
        tier = {
            pct: 90,
            title: 'Orange Alert',
            body: `Critical Level: Only P${Math.floor(limitAmount - current).toLocaleString()} left for ${category}.`
        };
    } else if (pct >= 70) {
        tier = {
            pct: 70,
            title: 'Heads up',
            body: `Heads up: You've used 70% of your ${category} budget.`
        };
    }

    if (!tier) return false;

    const type = `threshold_${categoryKey}_${tier.pct}_${monthKey}`;
    const meta = {
        action: 'open_budget_overview',
        category: categoryKey,
        thresholdPct: tier.pct,
        monthKey
    };

    const existing = getStoredLocalFallbackNotificationsRaw().some(item =>
        item?.type === type
        || (
            item?.meta?.category === meta.category
            && String(item?.meta?.monthKey || '') === String(meta.monthKey)
            && Number(item?.meta?.thresholdPct || 0) === Number(meta.thresholdPct)
        )
    );

    if (existing) return false;

    const uid = window.auth?.currentUser?.isAnonymous
        ? null
        : (window.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid'));
    if (uid && window.NotificationsEngine?.triggerNotification) {
        window.NotificationsEngine.triggerNotification(uid, tier.title, tier.body, type, meta)
            .catch(err => console.warn('Budget threshold Firestore save failed:', err));
        return true;
    }

    createNotification(tier.title, tier.body, type, null, meta);
    return true;
}

function getThresholdNotifMeta(item) {
    const meta = item?.meta || null;
    const type = String(item?.type || '');
    if (meta?.category && meta?.monthKey && Number(meta?.thresholdPct || 0) > 0) {
        return {
            category: String(meta.category),
            monthKey: String(meta.monthKey),
            thresholdPct: Number(meta.thresholdPct || 0),
            cycle: Number(meta.cycle || 0)
        };
    }
    const match = type.match(/^threshold_([^_]+)_(70|90|100)_(\d{4}-\d{2})(?:_cycle_(\d+))?$/);
    if (!match) return null;
    return {
        category: match[1],
        thresholdPct: Number(match[2]),
        monthKey: match[3],
        cycle: Number(match[4] || 0)
    };
}

function collapseThresholdNotificationItems(items) {
    const passthrough = [];
    const grouped = new Map();

    for (const item of items || []) {
        const meta = getThresholdNotifMeta(item);
        if (!meta) {
            passthrough.push(item);
            continue;
        }
        const groupKey = `${meta.category}|${meta.monthKey}|${Number(meta.cycle || 0)}`;
        const currentScore = Number(meta.thresholdPct || 0);
        const currentTime = Number(item?.createdAtMs || new Date(item?.time || 0).getTime() || 0);
        const existing = grouped.get(groupKey);
        if (!existing) {
            grouped.set(groupKey, { item, meta, score: currentScore, time: currentTime });
            continue;
        }
        const currentIsRemote = !item?.isLocalFallback;
        const existingIsRemote = !existing.item?.isLocalFallback;
        if (
            currentScore > existing.score
            || (
                currentScore === existing.score
                && currentIsRemote
                && !existingIsRemote
            )
            || (
                currentScore === existing.score
                && currentIsRemote === existingIsRemote
                && currentTime > 0
                && (existing.time <= 0 || currentTime < existing.time)
            )
        ) {
            grouped.set(groupKey, { item, meta, score: currentScore, time: currentTime });
        }
    }

    return [...passthrough, ...[...grouped.values()].map(entry => entry.item)];
}

function selectBudgetThresholdCandidate(uid, pctMap) {
    const trigger = readBudgetTrigger(uid);
    if (!trigger) return null;

    const allowedCategories = Array.isArray(trigger.categories) && trigger.categories.length
        ? trigger.categories
        : Object.keys(pctMap || {});

    const candidates = allowedCategories
        .map(categoryKey => {
            const info = pctMap?.[categoryKey];
            if (!info) return null;
            const pct = roundBudgetPct(info.pct);
            const threshold = [100, 90, 70].find(level => pct >= level);
            if (!threshold) return null;
            return { ...info, categoryKey, pct, threshold };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (b.threshold !== a.threshold) return b.threshold - a.threshold;
            if (b.pct !== a.pct) return b.pct - a.pct;
            return 0;
        });

    return candidates[0] || null;
}

function ensureSavedBudgetPctNotifications() {
    const monthKey = localStorage.getItem(BUDGET_PROGRESS_MONTH_KEY) || getBudgetProgressMonthKey();
    const uid = localStorage.getItem(BUDGET_PROGRESS_UID_KEY) || localStorage.getItem('wallet_last_uid') || 'guest';
    const filterVal = localStorage.getItem(BUDGET_PROGRESS_FILTER_KEY) || 'this_month';
    if (filterVal !== 'this_month') return false;
    const trigger = readBudgetTrigger(uid);
    if (!trigger) return false;

    const items = getStoredLocalFallbackNotificationsRaw();
    const pctMap = {
        needs: {
            label: 'Needs',
            pct: roundBudgetPct(localStorage.getItem(BUDGET_PROGRESS_STORAGE_KEYS.needs))
        },
        wants: {
            label: 'Wants',
            pct: roundBudgetPct(localStorage.getItem(BUDGET_PROGRESS_STORAGE_KEYS.wants))
        },
        savings: {
            label: 'Savings',
            pct: roundBudgetPct(localStorage.getItem(BUDGET_PROGRESS_STORAGE_KEYS.savings))
        }
    };
    const candidate = selectBudgetThresholdCandidate(uid, pctMap);
    if (!candidate) return false;

    const notifType = `threshold_${candidate.categoryKey}_${candidate.threshold}_${monthKey}`;
    const meta = {
        action: 'open_budget_overview',
        category: candidate.categoryKey,
        thresholdPct: candidate.threshold,
        monthKey,
        notificationKey: notifType
    };
    if (window.NotificationsEngine?.hasStoredInAppNotification?.(notifType, meta)) {
        consumeBudgetThresholdNotificationTrigger(uid, candidate.categoryKey);
        return false;
    }

    let title = 'Heads up';
    let body = `Heads up: You've used 70% of your ${candidate.label} budget.`;
    if (candidate.threshold >= 100) {
        title = 'Limit Reached';
        body = `Red Alert: You've hit 100% of your ${candidate.label} budget!`;
    } else if (candidate.threshold >= 90) {
        title = 'Orange Alert';
        body = `Critical Level: Your ${candidate.label} budget is already at ${Math.floor(candidate.pct)}%.`;
    }

    console.log('[BudgetProgress] seeded from saved pct', { uid, categoryKey: candidate.categoryKey, threshold: candidate.threshold, pct: candidate.pct });
    if (uid && window.NotificationsEngine?.triggerNotification) {
        window.NotificationsEngine.triggerNotification(uid, title, body, notifType, meta)
            .then(() => consumeBudgetThresholdNotificationTrigger(uid, candidate.categoryKey))
            .catch(err => console.warn('Saved pct notification sync failed:', err));
        return true;
    }

    createNotification(title, body, notifType, null, meta);
    consumeBudgetThresholdNotificationTrigger(uid, candidate.categoryKey);
    return true;
}

function ensureBudgetThresholdNotificationFromPct(uid, categoryKey, label, pct, current, limitAmount) {
    const numericPct = roundBudgetPct(pct);
    if (!Number.isFinite(numericPct)) return false;
    const trigger = readBudgetTrigger(uid);
    if (!trigger) return false;
    const candidate = selectBudgetThresholdCandidate(uid, {
        [categoryKey]: { label, pct: numericPct, current, limit: limitAmount }
    });
    if (!candidate || candidate.categoryKey !== categoryKey) {
        return false;
    }

    const threshold = candidate.threshold;
    if (!threshold) return false;

    const monthKey = getBudgetProgressMonthKey();
    const notifType = `threshold_${categoryKey}_${threshold}_${monthKey}`;
    const meta = {
        action: 'open_budget_overview',
        category: categoryKey,
        thresholdPct: threshold,
        monthKey,
        notificationKey: notifType
    };

    if (window.NotificationsEngine?.hasStoredInAppNotification?.(notifType, meta)) {
        consumeBudgetThresholdNotificationTrigger(uid, categoryKey);
        return false;
    }

    let title = 'Heads up';
    let body = `Heads up: You've used 70% of your ${label} budget.`;
    if (threshold >= 100) {
        title = 'Limit Reached';
        body = `Red Alert: You've hit 100% of your ${label} budget!`;
    } else if (threshold >= 90) {
        title = 'Orange Alert';
        body = `Critical Level: Only P${Math.floor(limitAmount - current).toLocaleString()} left for ${label}.`;
    }

    console.log('[BudgetProgress] force ensure notif', { uid, categoryKey, threshold, pct: numericPct });

    if (uid && window.NotificationsEngine?.triggerNotification) {
        window.NotificationsEngine.triggerNotification(uid, title, body, notifType, meta)
            .then(() => consumeBudgetThresholdNotificationTrigger(uid, categoryKey))
            .catch(err => console.warn('Forced threshold notification failed:', err));
        return true;
    }

    if (window.NotificationsEngine?.ensureStoredInAppNotification) {
        const created = window.NotificationsEngine.ensureStoredInAppNotification(title, body, notifType, meta);
        if (created) consumeBudgetThresholdNotificationTrigger(uid, categoryKey);
        return created;
    }

    createNotification(title, body, notifType, null, meta);
    consumeBudgetThresholdNotificationTrigger(uid, categoryKey);
    return true;
}

function ensureBudgetThresholdNotificationFromSnapshot(uid, snapshot) {
    if (!uid || !snapshot) return false;
    const pctMap = {
        needs: {
            label: 'Needs',
            pct: snapshot.needsPct,
            current: snapshot.needsTotal,
            limit: snapshot.needsLimit
        },
        wants: {
            label: 'Wants',
            pct: snapshot.wantsPct,
            current: snapshot.wantsTotal,
            limit: snapshot.wantsLimit
        },
        savings: {
            label: 'Savings',
            pct: snapshot.savingsPct,
            current: snapshot.savingsThresholdTotal,
            limit: snapshot.savingsLimit
        }
    };
    const candidate = selectBudgetThresholdCandidate(uid, pctMap);
    if (!candidate) return false;
    return ensureBudgetThresholdNotificationFromPct(
        uid,
        candidate.categoryKey,
        candidate.label,
        candidate.pct,
        candidate.current,
        candidate.limit
    );
}

const BUDGET_PROGRESS_STORAGE_KEYS = {
    needs: 'needs-pct',
    wants: 'wants-pct',
    savings: 'savings-pct'
};
const BUDGET_PROGRESS_MONTH_KEY = 'budget-pct-month-key';
const BUDGET_PROGRESS_UID_KEY = 'budget-pct-owner';
const BUDGET_PROGRESS_FILTER_KEY = 'budget-pct-filter';
const BUDGET_PROGRESS_DOC_ID = 'budget_progress_tracker';
const BUDGET_TRIGGER_PREFIX = 'smartwallet_budget_threshold_trigger_';
const BUDGET_THRESHOLD_CYCLE_PREFIX = 'smartwallet_budget_threshold_cycle_';

function roundBudgetPct(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
}

function getBudgetProgressMonthKey() {
    if (window.NotificationsEngine?.getCurrentMonthKey) {
        return window.NotificationsEngine.getCurrentMonthKey();
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getBudgetTriggerKey(uid) {
    return `${BUDGET_TRIGGER_PREFIX}${uid || 'guest'}`;
}

function getBudgetThresholdCycleKey(uid, categoryKey, monthKey, thresholdPct) {
    return `${BUDGET_THRESHOLD_CYCLE_PREFIX}${uid || 'guest'}_${categoryKey}_${monthKey}_${thresholdPct}`;
}

function readBudgetThresholdCycle(uid, categoryKey, monthKey, thresholdPct) {
    const stored = Number(localStorage.getItem(getBudgetThresholdCycleKey(uid, categoryKey, monthKey, thresholdPct)) || '0');
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
}

function nextBudgetThresholdCycle(uid, categoryKey, monthKey, thresholdPct) {
    const next = readBudgetThresholdCycle(uid, categoryKey, monthKey, thresholdPct) + 1;
    try {
        localStorage.setItem(getBudgetThresholdCycleKey(uid, categoryKey, monthKey, thresholdPct), String(next));
    } catch (e) {
        console.warn('Failed to persist budget threshold cycle:', e);
    }
    return next;
}

function readBudgetTrigger(uid) {
    try {
        const raw = JSON.parse(localStorage.getItem(getBudgetTriggerKey(uid)) || 'null');
        if (!raw || typeof raw !== 'object') return null;
        const currentMonthKey = getBudgetProgressMonthKey();
        if (raw.monthKey !== currentMonthKey) return null;
        if (!raw.pending) return null;
        if (Date.now() - Number(raw.at || 0) > 10 * 60 * 1000) return null;
        return raw;
    } catch (e) {
        return null;
    }
}

function writeBudgetTrigger(uid, payload) {
    try {
        localStorage.setItem(getBudgetTriggerKey(uid), JSON.stringify(payload));
    } catch (e) {
        console.warn('Failed to persist budget trigger:', e);
    }
}

function clearBudgetTrigger(uid) {
    try {
        localStorage.removeItem(getBudgetTriggerKey(uid));
    } catch (e) {
        console.warn('Failed to clear budget trigger:', e);
    }
}

function queueBudgetThresholdNotificationTrigger(uid, categories = null, source = 'transaction') {
    const normalizedUid = uid || localStorage.getItem('wallet_last_uid') || 'guest';
    const monthKey = getBudgetProgressMonthKey();
    const next = {
        uid: normalizedUid,
        monthKey,
        filterVal: 'this_month',
        pending: true,
        at: Date.now(),
        source,
        categories: Array.isArray(categories) ? [...new Set(categories.map(item => String(item || '').toLowerCase()).filter(Boolean))] : []
    };
    console.log('[BudgetProgress] queued trigger', next);
    writeBudgetTrigger(normalizedUid, next);
}

function consumeBudgetThresholdNotificationTrigger(uid, categoryKey = null) {
    const trigger = readBudgetTrigger(uid);
    if (!trigger) return false;

    if (Array.isArray(trigger.categories) && trigger.categories.length && categoryKey) {
        if (!trigger.categories.includes(categoryKey)) return false;
        const remaining = trigger.categories.filter(item => item !== categoryKey);
        if (!remaining.length) {
            clearBudgetTrigger(uid);
        } else {
            writeBudgetTrigger(uid, { ...trigger, categories: remaining, at: Date.now() });
        }
        return true;
    }

    clearBudgetTrigger(uid);
    return true;
}

function readStoredBudgetProgress(uid, monthKey) {
    const savedUid = localStorage.getItem(BUDGET_PROGRESS_UID_KEY) || 'guest';
    const savedMonthKey = localStorage.getItem(BUDGET_PROGRESS_MONTH_KEY) || '';
    if ((uid || 'guest') !== savedUid || monthKey !== savedMonthKey) {
        return {
            needs: 0,
            wants: 0,
            savings: 0
        };
    }

    return {
        needs: roundBudgetPct(localStorage.getItem(BUDGET_PROGRESS_STORAGE_KEYS.needs)),
        wants: roundBudgetPct(localStorage.getItem(BUDGET_PROGRESS_STORAGE_KEYS.wants)),
        savings: roundBudgetPct(localStorage.getItem(BUDGET_PROGRESS_STORAGE_KEYS.savings))
    };
}

async function persistBudgetProgress(uid, monthKey, filterVal, snapshot) {
    const payload = {
        needs: roundBudgetPct(snapshot.needs),
        wants: roundBudgetPct(snapshot.wants),
        savings: roundBudgetPct(snapshot.savings)
    };
    const previous = readStoredBudgetProgress(uid, monthKey);
    const previousUid = localStorage.getItem(BUDGET_PROGRESS_UID_KEY) || 'guest';
    const previousMonthKey = localStorage.getItem(BUDGET_PROGRESS_MONTH_KEY) || '';
    const previousFilterVal = localStorage.getItem(BUDGET_PROGRESS_FILTER_KEY) || '';
    const localChanged = previousUid !== (uid || 'guest')
        || previousMonthKey !== monthKey
        || previousFilterVal !== (filterVal || 'this_month')
        || Math.abs(previous.needs - payload.needs) > 0.01
        || Math.abs(previous.wants - payload.wants) > 0.01
        || Math.abs(previous.savings - payload.savings) > 0.01;

    try {
        localStorage.setItem(BUDGET_PROGRESS_STORAGE_KEYS.needs, String(payload.needs));
        localStorage.setItem(BUDGET_PROGRESS_STORAGE_KEYS.wants, String(payload.wants));
        localStorage.setItem(BUDGET_PROGRESS_STORAGE_KEYS.savings, String(payload.savings));
        localStorage.setItem(BUDGET_PROGRESS_UID_KEY, uid || 'guest');
        localStorage.setItem(BUDGET_PROGRESS_MONTH_KEY, monthKey);
        localStorage.setItem(BUDGET_PROGRESS_FILTER_KEY, filterVal || 'this_month');
        console.log('[BudgetProgress] saved', { uid, monthKey, filterVal, payload });
    } catch (e) {
        console.warn('Failed to persist budget progress locally:', e);
    }

    if (!uid || !localChanged) return;

    try {
        await setDoc(doc(db, 'users', uid, 'config', BUDGET_PROGRESS_DOC_ID), {
            'needs-pct': payload.needs,
            'wants-pct': payload.wants,
            'savings-pct': payload.savings,
            monthKey,
            filterVal: filterVal || 'this_month',
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn('Failed to sync budget progress to Firestore:', e);
    }
}

async function syncBudgetThresholdTransitionNotifications(uid, snapshot) {
    if (!snapshot) return;

    const monthKey = getBudgetProgressMonthKey();
    const current = {
        needs: roundBudgetPct(snapshot.needsPct),
        wants: roundBudgetPct(snapshot.wantsPct),
        savings: roundBudgetPct(snapshot.savingsPct)
    };
    const previous = readStoredBudgetProgress(uid, monthKey);

    console.log('[BudgetProgress] compare', { uid, monthKey, previous, current });

    const categoryMap = {
        needs: { label: 'Needs', current: snapshot.needsTotal, limit: snapshot.needsLimit },
        wants: { label: 'Wants', current: snapshot.wantsTotal, limit: snapshot.wantsLimit },
        savings: { label: 'Savings', current: snapshot.savingsThresholdTotal, limit: snapshot.savingsLimit }
    };

    for (const [key, info] of Object.entries(categoryMap)) {
        const prevPct = Number(previous[key] || 0);
        const nextPct = Number(current[key] || 0);
        const threshold = [100, 90, 70].find(level => prevPct < level && nextPct >= level);
        if (!threshold) continue;

        const notificationKey = `threshold_${key}_${threshold}_${monthKey}`;
        const notifType = notificationKey;
        const meta = {
            action: 'open_budget_overview',
            category: key,
            thresholdPct: threshold,
            monthKey,
            notificationKey
        };

        let title = 'Heads up';
        let body = `Heads up: You've used 70% of your ${info.label} budget.`;
        if (threshold >= 100) {
            title = 'Limit Reached';
            body = `Red Alert: You've hit 100% of your ${info.label} budget!`;
        } else if (threshold >= 90) {
            title = 'Orange Alert';
            body = `Critical Level: Only P${Math.floor(info.limit - info.current).toLocaleString()} left for ${info.label}.`;
        }

        if (window.NotificationsEngine?.triggerNotification && uid) {
            await window.NotificationsEngine.triggerNotification(uid, title, body, notifType, meta);
        } else if (window.NotificationsEngine?.ensureStoredInAppNotification) {
            window.NotificationsEngine.ensureStoredInAppNotification(title, body, notifType, meta);
        }
    }

    await persistBudgetProgress(uid, monthKey, snapshot.filterVal, current);
}

function getNotifDedupKey(item = {}) {
    return `${item.type || 'general'}|${item.title || ''}|${item.body || item.message || ''}`;
}

function getLimitedNotificationItems(items = [], limitCount = 10) {
    return collapseThresholdNotificationItems(items)
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
        .slice(0, limitCount);
}

function formatNotifTimestamp(createdAtMs) {
    return new Date(createdAtMs).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

export async function renderNotifications() {
    const list = document.getElementById('notification-list');
    if (!list) return;
    const localFallbacks = getLocalFallbackNotifications();

    if (!window.db || !window.auth.currentUser) {
        if (localFallbacks.length) {
            window.__notificationActionMap = {};
            list.innerHTML = getLimitedNotificationItems(localFallbacks)
                .map(data => {
                    window.__notificationActionMap[data.id] = {
                        action: data.action || null,
                        meta: data.meta || null,
                        isLocalFallback: true
                    };
                    return `
                    <div class="notif-item ${!data.isRead ? 'unread' : ''}" onclick="window.handleNotificationClick('${data.id}')">
                        <div class="notif-icon ${getNotifTone(data)}">
                            <i class="material-icons">${getNotifIcon(data)}</i>
                        </div>
                        <div class="notif-content">
                            <div class="notif-title">${data.title}</div>
                            <div class="notif-body">${data.body}</div>
                            <div class="notif-date">${formatNotifTimestamp(data.createdAtMs)}</div>
                        </div>
                        <div class="notif-actions" onclick="window.toggleNotifDropdown(event, '${data.id}')">
                            <i class="material-icons">more_vert</i>
                        </div>
                        <div class="notif-dropdown" id="notif-dropdown-${data.id}" onclick="event.stopPropagation()">
                            <div class="notif-dropdown-item" onclick="window.markNotifUnread('${data.id}')">
                                <i class="material-icons">mark_as_unread</i> Mark as Unread
                            </div>
                            <div class="notif-dropdown-item delete" onclick="window.deleteNotif('${data.id}')">
                                <i class="material-icons">delete_outline</i> Delete Alert
                            </div>
                        </div>
                    </div>
                `;
                }).join('');
            return;
        }
        list.innerHTML = `
            <div class="empty-notifications">
                <i class="material-icons" style="font-size: 48px; color: #e2e8f0; margin-bottom: 12px;">cloud_off</i>
                <p>Not signed in. Connect to see notifications.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = `
        <div class="notifications-loading">
            <div class="notifications-loading-spinner" aria-hidden="true"></div>
        </div>
    `;

    try {
        const { collection, getDocs, query, orderBy, limit } = window;
        const uid = window.auth.currentUser.uid;
        if (window.NotificationsEngine?.syncStoredInAppNotifications) {
            await window.NotificationsEngine.syncStoredInAppNotifications(uid);
        }
        if (window.NotificationsEngine?.backfillNotificationsFromState) {
            await window.NotificationsEngine.backfillNotificationsFromState(uid);
        }
        const notifRef = collection(window.db, `users/${uid}/notifications`);
        let snap = null;
        try {
            const q = query(notifRef, orderBy('createdAt', 'desc'), limit(100));
            snap = await getDocs(q);
        } catch (orderedErr) {
            console.warn('Ordered notification fetch failed, retrying basic fetch:', orderedErr);
            snap = await getDocs(notifRef);
        }
        window.__notificationActionMap = {};

        const items = [];
        const remoteKeys = new Set();

        snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            const createdAtMs = Number(data.createdAtMs || 0) || (data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0) || Date.now();
            const key = getNotifDedupKey(data);
            remoteKeys.add(key);
            items.push({
                id: docSnap.id,
                title: data.title || 'Notification',
                body: data.body || '',
                type: data.type || 'general',
                isRead: Boolean(data.isRead),
                createdAtMs,
                isLocalFallback: false,
                action: data.action || null,
                meta: data.meta || null
            });
        });

        localFallbacks.forEach(item => {
            const key = getNotifDedupKey(item);
            if (!remoteKeys.has(key)) items.push(item);
        });

        if (items.length === 0) {
            list.innerHTML = `
                <div class="empty-notifications">
                    <i class="material-icons" style="font-size: 48px; color: #e2e8f0; margin-bottom: 12px;">notifications_none</i>
                    <p>Everything is up to date!</p>
                </div>
            `;
            return;
        }

        let html = '';
        getLimitedNotificationItems(items).forEach(data => {
            const id = data.id;
            const date = data.createdAtMs ? formatNotifTimestamp(data.createdAtMs) : 'Just now';
            const isUnread = !data.isRead;
            window.__notificationActionMap[id] = {
                action: data.action || null,
                meta: data.meta || null,
                isLocalFallback: Boolean(data.isLocalFallback)
            };

            html += `
                <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="window.handleNotificationClick('${id}')">
                    <div class="notif-icon ${getNotifTone(data)}">
                        <i class="material-icons">${getNotifIcon(data)}</i>
                    </div>
                    <div class="notif-content">
                        <div class="notif-title">${data.title}</div>
                        <div class="notif-body">${data.body}</div>
                        <div class="notif-date">${date}</div>
                    </div>
                    
                    <div class="notif-actions" onclick="window.toggleNotifDropdown(event, '${id}')">
                        <i class="material-icons">more_vert</i>
                    </div>
                    
                    <div class="notif-dropdown" id="notif-dropdown-${id}" onclick="event.stopPropagation()">
                        <div class="notif-dropdown-item" onclick="window.markNotifUnread('${id}')">
                            <i class="material-icons">mark_as_unread</i> Mark as Unread
                        </div>
                        <div class="notif-dropdown-item delete" onclick="window.deleteNotif('${id}')">
                            <i class="material-icons">delete_outline</i> Delete Alert
                        </div>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;

    } catch (e) {
        console.error('Failed to fetch notifications from Firestore:', e);
        const fallbackItems = getLocalFallbackNotifications();
        if (!fallbackItems.length) return;
        window.__notificationActionMap = {};
        list.innerHTML = getLimitedNotificationItems(fallbackItems)
            .map(data => {
                window.__notificationActionMap[data.id] = {
                    action: data.action || null,
                    meta: data.meta || null,
                    isLocalFallback: true
                };
                return `
                <div class="notif-item ${!data.isRead ? 'unread' : ''}" onclick="window.handleNotificationClick('${data.id}')">
                    <div class="notif-icon ${getNotifTone(data)}">
                        <i class="material-icons">${getNotifIcon(data)}</i>
                    </div>
                    <div class="notif-content">
                        <div class="notif-title">${data.title}</div>
                        <div class="notif-body">${data.body}</div>
                        <div class="notif-date">${formatNotifTimestamp(data.createdAtMs)}</div>
                    </div>
                    <div class="notif-actions" onclick="window.toggleNotifDropdown(event, '${data.id}')">
                        <i class="material-icons">more_vert</i>
                    </div>
                    <div class="notif-dropdown" id="notif-dropdown-${data.id}" onclick="event.stopPropagation()">
                        <div class="notif-dropdown-item" onclick="window.markNotifUnread('${data.id}')">
                            <i class="material-icons">mark_as_unread</i> Mark as Unread
                        </div>
                        <div class="notif-dropdown-item delete" onclick="window.deleteNotif('${data.id}')">
                            <i class="material-icons">delete_outline</i> Delete Alert
                        </div>
                    </div>
                </div>
            `;
            }).join('');
    }
}

function getNotifThresholdPct(data) {
    const metaPct = Number(data?.meta?.thresholdPct || 0);
    if (Number.isFinite(metaPct) && metaPct > 0) return metaPct;
    const title = String(data?.title || '').toLowerCase();
    const body = String(data?.body || data?.message || '').toLowerCase();
    if (title.includes('limit reached') || body.includes('100%')) return 100;
    if (title.includes('orange alert') || body.includes('critical level')) return 90;
    if (title.includes('heads up') || body.includes('70%')) return 70;
    return 0;
}

function getNotifIcon(dataOrType) {
    const data = (dataOrType && typeof dataOrType === 'object')
        ? dataOrType
        : { type: dataOrType };
    const thresholdPct = getNotifThresholdPct(data);
    if (thresholdPct >= 100) return 'error';
    const normalized = String(data?.type || '').toLowerCase();
    if (!normalized) return 'notifications';
    if (normalized.includes('goal') || normalized.includes('success')) return 'check_circle';
    if (normalized.includes('threshold') || normalized.includes('warning')) return 'warning';
    if (normalized.includes('velocity')) return 'speed';
    if (normalized.includes('recurring')) return 'event';
    if (normalized.includes('error')) return 'error';
    return 'notifications';
}

function getNotifTone(dataOrType) {
    const data = (dataOrType && typeof dataOrType === 'object')
        ? dataOrType
        : { type: dataOrType };
    const thresholdPct = getNotifThresholdPct(data);
    if (thresholdPct >= 100) return 'error';
    const normalized = String(data?.type || '').toLowerCase();
    if (!normalized) return 'general';
    if (normalized.includes('goal') || normalized.includes('success')) return 'success';
    if (normalized.includes('threshold') || normalized.includes('warning')) return 'warning';
    if (normalized.includes('error')) return 'error';
    if (normalized.includes('velocity') || normalized.includes('recurring') || normalized.includes('info') || normalized.includes('monthly')) return 'info';
    return 'general';
}

export function updateUnreadCount(markRead = false) {
    const badge = document.getElementById('unread-count');
    if (!badge) return;

    const localUnread = getLocalFallbackNotifications().filter(item => !item.isRead);
    const paintBadge = (count) => {
        badge.innerText = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    };

    // Paint local unread immediately so the red badge appears without waiting on Firestore.
    paintBadge(localUnread.length);

    if (!window.db || !window.auth?.currentUser || !window.collection || !window.getDocs || !window.query) {
        return;
    }

    (async () => {
        try {
            const uid = window.auth.currentUser.uid;
            
            // [FIX: 2026-04-10] REMOVED backfillNotificationsFromState call from here to prevent infinite recursion loop - Antigravity
            // Backfilling is now exclusively handled during initial load or when opening the notification center.
            /* 
            if (window.NotificationsEngine?.backfillNotificationsFromState) {
                await window.NotificationsEngine.backfillNotificationsFromState(uid);
            }
            */

            const notifRef = window.collection(window.db, `users/${uid}/notifications`);
            const snap = await window.getDocs(window.query(notifRef, window.orderBy('createdAt', 'desc'), window.limit(30)));
            const remoteItems = [];
            snap.forEach(docSnap => {
                const data = docSnap.data() || {};
                remoteItems.push({
                    id: docSnap.id,
                    title: data.title || 'Notification',
                    body: data.body || '',
                    type: data.type || 'general',
                    isRead: Boolean(data.isRead),
                    createdAtMs: Number(data.createdAtMs || 0) || (data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0) || Date.now(),
                    meta: data.meta || null
                });
            });

            const collapsedRemoteItems = getLimitedNotificationItems(remoteItems, 1000);
            const remoteUnread = collapsedRemoteItems.filter(item => !item.isRead).length;
            const remoteKeys = new Set(collapsedRemoteItems.map(item => getNotifDedupKey(item)));
            const uniqueLocalUnread = localUnread.filter(item => !remoteKeys.has(getNotifDedupKey(item))).length;
            const unreadCount = remoteUnread + uniqueLocalUnread;
            paintBadge(unreadCount);
        } catch (e) {
            paintBadge(localUnread.length);
        }
    })();
}

export function clearAllNotifications() {
    const clearTask = async () => {
        writeLocalFallbackNotifications([]);

        if (window.auth?.currentUser && window.db && window.collection && window.getDocs && window.deleteDoc && window.doc) {
            try {
                const uid = window.auth.currentUser.uid;
                const notifRef = window.collection(window.db, `users/${uid}/notifications`);
                const snap = await window.getDocs(notifRef);
                const deletes = [];
                snap.forEach(docSnap => {
                    deletes.push(window.deleteDoc(window.doc(window.db, `users/${uid}/notifications`, docSnap.id)));
                });
                if (deletes.length) await Promise.allSettled(deletes);
            } catch (e) {
                console.error('Error clearing notifications', e);
            }
        }

        updateUnreadCount();
        if (document.getElementById('notification-center')?.classList.contains('active')) {
            renderNotifications();
        }
    };

    clearTask();
}

window.handleNotificationClick = async function(id) {
    await window.markNotifRead(id);
    toggleNotificationCenter();

    const notifMeta = window.__notificationActionMap?.[id] || {};
    const meta = notifMeta.meta || {};
    const action = meta.action || notifMeta.action?.type || notifMeta.action?.label || null;

    if (action === 'open_goal_edit' && meta.goalId) {
        const uid = window.auth?.currentUser?.uid;
        const openGoal = () => {
            if (window.GoalsView && typeof window.GoalsView.openGoalEdit === 'function') {
                window.GoalsView.openGoalEdit(meta.goalId);
                return;
            }
            if (uid && window.EditGoalView && typeof window.EditGoalView.open === 'function') {
                window.EditGoalView.open(uid, meta.goalId);
            }
        };

        if (typeof window.scrollToView === 'function') {
            window.scrollToView(3);
            window.setTimeout(openGoal, 360);
        } else {
            openGoal();
        }
    }
};

// Global Handlers
window.toggleNotifDropdown = (e, id) => {
    e.stopPropagation();
    document.querySelectorAll('.notif-dropdown.active').forEach(d => {
        if (d.id !== `notif-dropdown-${id}`) d.classList.remove('active');
    });
    const dropdown = document.getElementById(`notif-dropdown-${id}`);
    if (dropdown) dropdown.classList.toggle('active');
};

window.markNotifRead = async (id) => {
    if (String(id).startsWith('local-')) {
        const targetId = String(id).replace('local-', '');
        const items = getStoredLocalFallbackNotificationsRaw();
        writeLocalFallbackNotifications(items.map(item => String(item.id) === targetId ? { ...item, unread: false } : item));
        updateUnreadCount();
        if (document.getElementById('notification-center')?.classList.contains('active')) renderNotifications();
        return;
    }
    if (!window.auth.currentUser || !window.db) return;
    try {
        const uid = window.auth.currentUser.uid;
        const ref = window.doc(window.db, `users/${uid}/notifications`, id);
        await window.updateDoc(ref, { isRead: true });
        updateUnreadCount();
    } catch (e) { console.error("Error marking as read", e); }
};

window.markNotifUnread = async (id) => {
    if (String(id).startsWith('local-')) {
        const targetId = String(id).replace('local-', '');
        const items = getStoredLocalFallbackNotificationsRaw();
        writeLocalFallbackNotifications(items.map(item => String(item.id) === targetId ? { ...item, unread: true } : item));
        updateUnreadCount();
        if (document.getElementById('notification-center')?.classList.contains('active')) renderNotifications();
        window.closeAllNotifMenus();
        return;
    }
    if (!window.auth.currentUser || !window.db) return;
    try {
        const uid = window.auth.currentUser.uid;
        const ref = window.doc(window.db, `users/${uid}/notifications`, id);
        await window.updateDoc(ref, { isRead: false });
        window.closeAllNotifMenus();
        updateUnreadCount();
    } catch (e) { console.error("Error marking as unread", e); }
};

window.markAllNotificationsRead = async () => {
    const localItems = getStoredLocalFallbackNotificationsRaw();
    const hasLocalUnread = localItems.some(item => item?.unread !== false);
    if (hasLocalUnread) {
        writeLocalFallbackNotifications(localItems.map(item => ({ ...item, unread: false })));
    }

    if (window.auth?.currentUser && window.db && window.collection && window.getDocs && window.query && window.orderBy && window.limit && window.updateDoc && window.doc) {
        try {
            const uid = window.auth.currentUser.uid;
            const notifRef = window.collection(window.db, `users/${uid}/notifications`);
            const snap = await window.getDocs(window.query(notifRef, window.orderBy('createdAt', 'desc'), window.limit(100)));
            const unreadIds = [];
            snap.forEach(docSnap => {
                const data = docSnap.data() || {};
                if (!data.isRead) unreadIds.push(docSnap.id);
            });
            if (unreadIds.length) {
                await Promise.all(unreadIds.map(id => {
                    const ref = window.doc(window.db, `users/${uid}/notifications`, id);
                    return window.updateDoc(ref, { isRead: true });
                }));
            }
        } catch (e) {
            console.error("Error marking all notifications as read", e);
        }
    }

    updateUnreadCount();
    if (document.getElementById('notification-center')?.classList.contains('active')) {
        renderNotifications();
    }
};

window.deleteNotif = async (id) => {
    if (String(id).startsWith('local-')) {
        const targetId = String(id).replace('local-', '');
        const items = getStoredLocalFallbackNotificationsRaw().filter(item => String(item.id) !== targetId);
        writeLocalFallbackNotifications(items);
        updateUnreadCount();
        if (document.getElementById('notification-center')?.classList.contains('active')) renderNotifications();
        window.closeAllNotifMenus();
        return;
    }
    if (!window.auth.currentUser || !window.db) return;
    try {
        const uid = window.auth.currentUser.uid;
        const ref = window.doc(window.db, `users/${uid}/notifications`, id);
        await window.deleteDoc(ref);
        window.closeAllNotifMenus();
        updateUnreadCount();
    } catch (e) { console.error("Error deleting notification", e); }
};

window.closeAllNotifMenus = () => {
    document.querySelectorAll('.notif-dropdown.active').forEach(d => d.classList.remove('active'));
};

// INITIAL LOADING STATE: Prevent JS from overwriting skeletons too early
window.isInitialLoading = true;

export function initUI() {
    log('Initializing UI Engine...');
    initKeyboardViewportBridge();
    
    // Initial Skeleton States
    updateProfileUI(null);
    updateBalanceCardsUI(null);
    updateInsightCards(null);

    // Notifications Bridging (Internal - initUI still handles some setup)
    updateUnreadCount();

    // Listen for new notifications
    window.addEventListener('notification-created', () => {
        updateUnreadCount();
        const syncUid = window.auth?.currentUser?.isAnonymous
            ? null
            : (window.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid'));
        if (syncUid && window.NotificationsEngine?.syncStoredInAppNotifications) {
            window.NotificationsEngine.syncStoredInAppNotifications(syncUid).catch((err) => {
                console.warn('Deferred notification sync failed:', err);
            });
        }
        if (document.getElementById('notification-center')?.classList.contains('active')) {
            window.requestAnimationFrame(() => {
                renderNotifications();
            });
            window.setTimeout(() => {
                if (document.getElementById('notification-center')?.classList.contains('active')) {
                    renderNotifications();
                }
            }, 80);
        }
        const bell = document.getElementById('notification-bell');
        if (bell) {
            bell.style.animation = 'none';
            void bell.offsetWidth; 
            bell.style.animation = 'ptrSpin 0.5s ease'; // Quick scale/viggle
        }
    });

    // Initial unread check
    updateUnreadCount();

    // Check Daily Summary
    checkDailySummary();

    // 1. Restore Profile from Cache (Instant UI)
    if (window.NavState) {
        window.NavState.loadProfile();
    }

    // 2. Populate Previous 3 Months in filter
    populateMonthFilter();

    // 3. Setup Fast Path rendering if possible (Delayed for skeleton visibility)
    setTimeout(() => {
        window.isInitialLoading = false;
        setupFastPath();
        
        // Force refresh UI after loading gate
        if (window.updateTripleProgressBar) window.updateTripleProgressBar();
        
        // IMPORTANT: Trigger dashboard refresh once gate is open
        if (Array.isArray(window.allTxns)) {
            console.log('Loading Gate Open: Refreshing Dashboard...');
            if (window.updateBalanceToThisMonth) window.updateBalanceToThisMonth(window.allTxns);
            if (window.updateInsightCards) {
                window.updateInsightCards(window.allTxns);
                requestAnimationFrame(() => {
                    const summaryTotalEl = document.getElementById('summary-total');
                    if (summaryTotalEl && summaryTotalEl.querySelector('.skeleton')) {
                        window.updateInsightCards(window.allTxns);
                    }
                });
            }
        }
    }, 200);
}

function populateMonthFilter() {
    const chartFilter = document.getElementById('chart-filter');
    if (chartFilter) {
        const now = new Date();
        const last15Option = chartFilter.querySelector('option[value="last_15"]');
        if (!last15Option) return;

        // Generate previous 3 months
        for (let i = 3; i >= 1; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            // Avoid duplicates
            if (chartFilter.querySelector(`option[value="${monthValue}"]`)) continue;

            const option = document.createElement('option');
            option.value = monthValue;
            option.textContent = monthName;
            last15Option.insertAdjacentElement('afterend', option);
        }
    }
}

function setupFastPath() {
    const lastUid = localStorage.getItem('wallet_last_uid');
    const cachedAccounts = localStorage.getItem('wallet_accounts');
    const cachedCurrent = localStorage.getItem('wallet_current_account');
    const cachedBalances = localStorage.getItem('wallet_cached_balances');
    
    if (lastUid && cachedAccounts && cachedCurrent) {
        console.log('ÃƒÂ¢Ã…Â¡Ã‚Â¡ Fast Path: Rendering from cache...');
        try {
            const accounts = JSON.parse(cachedAccounts);
            
            if (cachedBalances) {
                try {
                    const balances = JSON.parse(cachedBalances);
                    accounts.forEach(acc => {
                        if (balances[acc.id] !== undefined) {
                            acc.balance = balances[acc.id];
                        }
                    });
                } catch(e) { console.warn('Balance cache error', e); }
            }
            
            window.walletAccounts = accounts;
            window.currentAccount = cachedCurrent;
            
            if (window.updateAccountSwitcherUI) window.updateAccountSwitcherUI(accounts);
            if (window.updateBalanceCardsUI) window.updateBalanceCardsUI(accounts);
            if (window.applyAccountTheme) window.applyAccountTheme(cachedCurrent, accounts);
            
            import('./app-data.js').then(m => {
                window.fastPathTriggered = true;
                if (m.loadData) m.loadData(lastUid);
            });
        } catch(e) { console.warn('Fast path failed', e); }
    }
}

// LEGACY BRIDGING (Final Export to Global Scope)
function bridgeGlobals() {
    console.log('ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â Bridging exports to global scope...');
    window.updateAccountSwitcherUI = updateAccountSwitcherUI;
    window.updateBalanceCardsUI = updateBalanceCardsUI;
    window.scrollToActiveCard = scrollToActiveCard;
    window.updateProfileUI = updateProfileUI;
    window.updateBalanceToThisMonth = updateBalanceToThisMonth;
    window.updateInsightCards = updateInsightCards;
    window.handleLocalModeNudge = handleLocalModeNudge;
    window.switchAccount = switchAccount;
    window.updateUnreadCount = updateUnreadCount;
    window.toggleNotificationCenter = toggleNotificationCenter;
    window.clearAllNotifications = clearAllNotifications;
    window.applyAccountTheme = applyAccountTheme;
    window.applyUserView = applyUserView;
    window.applyTheme = applyTheme;
    window.setupAccountSwitcher = setupAccountSwitcher;
    window.updateHeaderIcon = updateHeaderIcon;
    window.updateBalanceToThisMonth = updateBalanceToThisMonth;
    window.updateInsightCards = updateInsightCards;
    window.initPrivacyLock = initPrivacyLock;
    window.tryBiometricUnlock = tryBiometricUnlock;
    window.drawCashFlowChart = drawCashFlowChart;
    window.toggleProfileDropdown = toggleProfileDropdown;
    window.getMerchantDisplay = getMerchantDisplay;
    window.displayCategoryName = displayCategoryName;
    window.renderHistory = renderHistoryClean;
    window.drawPieChart = drawPieChart;
    window.updateAISummary = updateAISummary;
    window.updateTripleProgressBar = updateTripleProgressBar;
window.toggleBudgetView = function() {
        const current = localStorage.getItem('budget_view_mode') || 'bars';
        const next = current === 'bars' ? 'donut' : 'bars';
        localStorage.setItem('budget_view_mode', next);
        updateTripleProgressBar();
        triggerHaptic('medium');
};
window.forceBudgetNotificationCheck = forceBudgetNotificationCheck;
window.queueBudgetThresholdNotificationTrigger = queueBudgetThresholdNotificationTrigger;
 
    window.animateNumber = animateNumber;
    console.log('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Global bridge complete.');
    // If cached/live txns landed before app-ui finished wiring globals, paint the dashboard now.
    if (Array.isArray(window.allTxns)) {
        updateBalanceToThisMonth(window.allTxns, window.currentAccount);
        updateInsightCards(window.allTxns);
        if (window.debouncedUpdateBudget) window.debouncedUpdateBudget();
        else updateTripleProgressBar();
    }
}

// Run bridging immediately
bridgeGlobals();

