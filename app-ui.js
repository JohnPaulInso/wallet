/**
 * UI Rendering and Management for the Wallet App
 */
import { db, auth, doc, setDoc, onSnapshot } from "./firebase-config.js";
import { CATEGORIES, getMerchantDisplay, displayCategoryName, formatLocalDate, showToast, log } from "./app-utils.js";
import { handleAuthClick } from "./app-auth.js";

let switchSyncTimer = null;

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
    
    const visibleEntries = entries.slice(0, window.historyLimit || 6);

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
                <span class="month-total privacy-mask" data-raw="₱${data.total.toLocaleString(undefined, {minimumFractionDigits:2})}">
                    ${isHidden ? '******' : '₱' + data.total.toLocaleString(undefined, {minimumFractionDigits:2})}
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
            
            const mUpper = mapped.name.toUpperCase();
            let logo = null;
            if (mUpper.includes('JOLLIBEE')) logo = 'logos/jollibee.png';
            else if (mUpper.includes('MCDO') || mUpper.includes('MCDONALDS')) logo = 'logos/mcdo.png';
            else if (mUpper.includes('SHELL')) logo = 'logos/shell.png';
            else if (mUpper.includes('SHOPEE')) logo = 'logos/shopee.png';
            else if (mUpper.includes('LAZADA')) logo = 'logos/lazada.jpg';
            else if (mUpper.includes('GLOBE') || mUpper.includes('GOMO')) logo = 'logos/globe.png';
            else if (mUpper.includes('SM') || mUpper.includes('SM STORE')) logo = 'logos/sm.png';
            else if (mUpper.includes('SPOTIFY')) logo = 'logos/spotify.png';
            else if (mUpper.includes('TIKTOK')) logo = 'logos/tiktokshop.png';
            else if (mUpper.includes('TECFUEL')) logo = 'logos/tecfuel.png';
            else if (mUpper.includes('MR DIY')) logo = 'logos/mrdiy.png';
            else if (mUpper.includes('METRO')) logo = 'logos/supermetro.png';
            else if (mUpper.includes('7 11')) logo = 'logos/711.png';
            else if (mUpper.includes('7/11')) logo = 'logos/711.png';
            else if (mUpper.includes('WATSONS')) logo = 'logos/watsons.png';
            else if (mUpper.includes('J AND L')) logo = 'logos/jandlmall.png';
            else if (mUpper.includes('TRADERSCONNECT')) logo = 'logos/tradersconnect.png';
            
            const logoHTML = logo ? `<div class="brand-badge" style="display: ${window.showLogos ? 'flex' : 'none'}"><img src="${logo}"></div>` : '';

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
                                <span>${shortDate}</span> • <span>${displayCategoryName(mapped.category)}</span>
                            </div>
                            ${displayNote ? `<div class="txn-note" style="color: ${window.categoryConfig && window.categoryConfig[mapped.category]?.darkColor || '#475569'}; font-size: 11px; margin-top:2px;">${displayNote}</div>` : ''}
                        </div>
                        <div class="txn-right">
                            <div class="txn-amount privacy-mask ${Math.abs(amount) >= 1000 ? 'large' : ''}" style="${displayAmtColor}" data-raw="${(!isIncome && !isRefund && !isReimbursed && window.currentAccount !== 'atome') ? '-' : ''}₱${Math.abs(amount).toLocaleString(undefined, {minimumFractionDigits:2})}">
                                ${isHidden ? '******' : ((!isIncome && !isRefund && !isReimbursed && window.currentAccount !== 'atome') ? '-' : '') + '₱' + Math.abs(amount).toLocaleString(undefined, {minimumFractionDigits:2})}
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
    if (entries.length > (window.historyLimit || 6)) {
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
                window.historyLimit = (window.historyLimit || 6) + 6;
                renderHistory(window.allTxns);
            }, 400);
        };
        
        btn.onmouseenter = () => { btn.style.background = '#dbeafe'; btn.style.transform = 'translateY(-1px)'; };
        btn.onmouseleave = () => { btn.style.background = '#ebf5ff'; btn.style.transform = 'translateY(0)'; };
        
        loadMoreWrap.appendChild(btn);
        container.appendChild(loadMoreWrap);
    }

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
    const data = window.allTxns || [];
    const config = window.safeToSpendConfig || { savingsAmount: 3000, obligations: [] };
    const monthlySalary = parseFloat(localStorage.getItem('monthly_salary_target') || '0');
    
    if (!monthlySalary) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    let totalSpent = 0;
    data.forEach(t => {
        const d = new Date(t.date);
        if (d.getFullYear() === year && d.getMonth() === month && !t.excluded && !t.refund && !t.reimbursed) {
            const mapped = getMerchantDisplay(t.merchant, t);
            if (mapped.category !== 'Income') {
                totalSpent += Math.abs(t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));
            }
        }
    });

    const totalObligations = (config.obligations || []).reduce((sum, ob) => sum + (ob.amount || 0), 0);
    const savings = config.savingsAmount || 0;

    // Progress 1: Obligations (Fixed overhead)
    const prog1 = document.getElementById('triple-progress-1');
    const label1 = document.getElementById('triple-label-1');
    if (prog1 && label1) {
        const pct = Math.min((totalObligations / monthlySalary) * 100, 100);
        prog1.style.width = pct + '%';
        label1.innerText = `OBLIGATIONS: ₱${totalObligations.toLocaleString()}`;
    }

    // Progress 2: Savings Target
    const prog2 = document.getElementById('triple-progress-2');
    const label2 = document.getElementById('triple-label-2');
    if (prog2 && label2) {
        const pct = Math.min((savings / monthlySalary) * 100, 100);
        prog2.style.width = pct + '%';
        prog2.style.left = (parseFloat(prog1?.style.width || 0)) + '%';
        label2.innerText = `SAVINGS: ₱${savings.toLocaleString()}`;
    }

    // Progress 3: Variable Spending
    const prog3 = document.getElementById('triple-progress-3');
    const label3 = document.getElementById('triple-label-3');
    if (prog3 && label3) {
        const remainingForSpend = monthlySalary - totalObligations - savings;
        const pct = Math.min((totalSpent / monthlySalary) * 100, 100);
        prog3.style.width = pct + '%';
        prog3.style.left = (parseFloat(prog1?.style.width || 0) + parseFloat(prog2?.style.width || 0)) + '%';
        label3.innerText = `SPENT: ₱${Math.round(totalSpent).toLocaleString()}`;
        
        // Color warning if overspend
        if (totalSpent > (remainingForSpend > 0 ? remainingForSpend : 0)) {
            prog3.style.backgroundColor = '#ef4444';
        } else {
            prog3.style.backgroundColor = '#3b82f6';
        }
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
    
    const totalFormatted = total > 0 ? `₱${Math.round(total).toLocaleString()}` : "₱0";

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
                const valText = `₱${Math.round(seg.value).toLocaleString()}`;
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
}

// Insight and AI Summary
export async function updateAISummary(txns) {
    const summaryEl = document.getElementById('ai-summary-text');
    if (!summaryEl) return;
    
    const cacheKey = `ai_summary_${window.currentAccount}_${new Date().getMonth()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        summaryEl.innerText = cached;
        return;
    }

    summaryEl.innerText = 'Analyzing your spending patterns...';
    summaryEl.innerText = 'Restoring AI insights. Please sync your transactions to refresh analysis.';
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
                        spent += Math.abs(t.amount || 0);
                    }
                }
            });
        }

        const percent = Math.min((spent / limit) * 100, 100);
        return `
            <div class="cat-budget-item">
                <div class="cat-budget-label"><span>${displayCategoryName(cat)}</span> <span>₱${Math.round(spent).toLocaleString()} / ₱${limit.toLocaleString()}</span></div>
                <div class="cat-budget-bar-wrap"><div class="cat-budget-bar" style="width: ${percent}%; background: ${percent > 90 ? '#ef4444' : '#3b82f6'};"></div></div>
            </div>
        `;
    }).join('');
    listContainer.innerHTML = itemsHTML;
}

// Profile UI Management
export function updateProfileUI(user) {
    const dropdown = document.getElementById('profile-dropdown');
    if (!dropdown) return;

    if (user.isAnonymous) {
        dropdown.innerHTML = `
            <div class="dropdown-header">Guest Session</div>
            <div class="dropdown-item" onclick="toggleDarkMode()">
                <i class="material-icons" id="theme-icon">dark_mode</i>
                <span id="theme-text">Dark Mode</span>
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
            <div class="dropdown-header">${user.email}</div>
            <div class="dropdown-item" onclick="toggleDarkMode()">
                <i class="material-icons" id="theme-icon">dark_mode</i>
                <span id="theme-text">Dark Mode</span>
            </div>
            <div class="dropdown-item" onclick="handleAuthClick()">
                <i class="material-icons">swap_horiz</i>
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
        console.log('⏭️ Skipping auto-sync: just logged in.');
        return;
    }

    const id = window.currentAccount;
    if (id !== 'atome' && id !== 'bpi') return;

    const token = localStorage.getItem('g_access_token');

    if (token) {
        console.log(`🔄 Auto-syncing ${id} on load (10 emails)...`);
        const { handleScan } = import('./app-data.js').then(m => {
            setTimeout(() => m.handleScan(10, false), 1500);
        });
    } else {
        console.log(`⏭️ No Gmail token found for ${id}. Use manual Sync to authenticate.`);
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

// Balance Cards Management
export function updateBalanceCardsUI(accounts) {
    const container = document.getElementById('dynamic-balance-cards');
    if (!container) return;

    const isHidden = localStorage.getItem('balance_hidden') === 'true';

    container.innerHTML = accounts.map(acc => {
        const isAtome = acc.id === 'atome';
        const isBPI = acc.id === 'bpi';
        const cardClass = `balance-card ${acc.id === window.currentAccount ? 'active' : ''} ${isAtome ? 'atome-card' : ''} ${isBPI ? 'bpi-card' : ''}`;
        
        return `
        <div class="${cardClass}" id="${acc.id}Card" data-account="${acc.id}" style="${!isBPI ? 'background: ' + acc.color + ';' : ''}">
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
                    <div class="card-number" style="letter-spacing: ${isBPI ? '4px' : '2px'}; font-size: ${isBPI ? '14.5px' : '13.5px'};">${isBPI ? '0099 096727' : '•••• •••• •••• ' + acc.last4}</div>
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
    
    if (window.setupAccountSwitcher) window.setupAccountSwitcher(); // Re-bind observer to new cards
}

// Scroll to Active Card
export function scrollToActiveCard(accId) {
    const card = document.querySelector(`.balance-card[data-account="${accId}"]`);
    if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}
// Account Switcher Management
export function switchAccount(id) {
    localStorage.setItem('wallet_current_account', id);
    window.currentAccount = id;
    if (window.walletAccounts) applyAccountTheme(id, window.walletAccounts);
    
    // Toggle Safe to Spend Widget Visibility
    const safeSpendWidget = document.getElementById('safe-spend-widget');
    if (safeSpendWidget) {
        const isAdmin = auth.currentUser && auth.currentUser.email === 'johnpaulinso123@gmail.com';
        // USER REQUEST: Only visible for BPI wallet
        safeSpendWidget.style.display = (id === 'bpi' && isAdmin) ? 'block' : 'none';
        if (id === 'bpi' && isAdmin) updateSafeSpendUI();
    }

    // Auto-sync if token is fresh
    if (id === 'atome' || id === 'bpi') {
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
    
    const cardBg = document.getElementById('card-bg');
    if (cardBg) cardBg.setAttribute('fill', acc.color);
    
    const label = document.getElementById('wallet-label');
    if (label) label.innerText = acc.name.toUpperCase();
}

// User View Application
export function applyUserView(user) {
    if (!user) return;
    const isBPI = window.currentAccount === 'bpi';
    const isAdmin = !user.isAnonymous && user.email === 'johnpaulinso123@gmail.com';
    
    const safeSpendWidget = document.getElementById('safe-spend-widget');
    if (safeSpendWidget) {
        safeSpendWidget.style.display = (isBPI && isAdmin) ? 'block' : 'none';
    }
}

// Balance and Insight
export function updateBPIInsight(totalSpentThisMonth) {
    const insightEl = document.getElementById('bpi-remaining-insight');
    if (!insightEl) return;
    
    const config = window.safeToSpendConfig || { savingsAmount: 3000 };
    const monthlySalary = parseFloat(localStorage.getItem('monthly_salary_target') || '0');
    
    const remaining = monthlySalary - totalSpentThisMonth - config.savingsAmount;
    const isHidden = localStorage.getItem('balance_hidden') === 'true';
    
    if (isHidden) {
        insightEl.innerText = 'PHP ****** (******)';
        return;
    }
    
    const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
    insightEl.innerHTML = `REMAINING: <span style="color:${remaining < 0 ? '#ef4444' : '#fff'}">${currency.format(remaining)}</span> 
        <span style="opacity:0.6; font-weight:400;">(Budget: ${currency.format(monthlySalary)})</span>`;
}

export function updateSafeSpendUI() {
    const container = document.getElementById('safe-spend-obligations');
    if (!container) return;
    
    const config = window.safeToSpendConfig || { obligations: [] };
    container.innerHTML = config.obligations.map(ob => `
        <div class="obligation-item">
            <span>${ob.title}</span>
            <span class="privacy-mask">${formatLocalDate(ob.date)}: PHP ${ob.amount.toLocaleString()}</span>
        </div>
    `).join('');
}

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
    const cards = document.querySelectorAll('.balance-card');
    if (!viewport || cards.length === 0) return;

    let isDown = false;
    let startX;
    let scrollLeft;
    let hasDragged = false;

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
        viewport.style.scrollSnapType = 'x mandatory';
    });

    viewport.addEventListener('mouseup', () => {
        if (!isDown) return;
        isDown = false;
        viewport.style.cursor = 'grab';
        viewport.style.scrollSnapType = 'x mandatory';
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
    });
}

export function updateHeaderIcon(account) {
    const cardBg = document.getElementById('card-bg');
    if (cardBg) {
        const isAdmin = auth.currentUser && auth.currentUser.email === 'johnpaulinso123@gmail.com';
        if (account === 'bpi' && isAdmin) {
            cardBg.setAttribute('fill', '#8b0000'); // BPI red
        } else {
            cardBg.setAttribute('fill', '#1a1a1a'); // Atome black (Default)
        }
    }
}

export function updateBalanceToThisMonth(txns, targetAccount) {
    let incomeTotal = 0;
    let expenseTotal = 0;

    txns.forEach(t => {
        if (t.excluded || t.refund) return;
        const amt = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
        const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : { category: 'Other' };
        
        if (mapped.category === 'Income') {
            incomeTotal += amt;
        } else {
            expenseTotal += amt;
        }
    });

    const acc = targetAccount || window.currentAccount;
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
    updateInsightCards(txns);
}

export function updateInsightCards(txns) {
    if (!txns || txns.length === 0) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const dayOfMonth = now.getDate();

    const getAmt = t => t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);

    const thisMonthTxns = txns.filter(t => {
        if (t.excluded || t.refund || t.reimbursed) return false;
        const d = new Date(t.date);
        if (d.getFullYear() !== year || d.getMonth() !== month) return false;
        const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : { category: 'Other' };
        return mapped.category !== 'Income';
    });

    const lmDate = new Date(year, month - 1, 1);
    const lastMonthTxns = txns.filter(t => {
        if (t.excluded || t.refund || t.reimbursed) return false;
        const d = new Date(t.date);
        if (d.getFullYear() !== lmDate.getFullYear() || d.getMonth() !== lmDate.getMonth()) return false;
        const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : { category: 'Other' };
        return mapped.category !== 'Income';
    });

    const isHidden = localStorage.getItem('balance_hidden') === 'true';
    const thisMonthTotal = thisMonthTxns.reduce((s, t) => s + getAmt(t), 0);
    const dailyAvg = dayOfMonth > 0 ? thisMonthTotal / dayOfMonth : 0;
    
    const dailyAvgEl = document.getElementById('daily-avg-val');
    if (dailyAvgEl) {
        const formatted = '₱' + dailyAvg.toLocaleString(undefined, { maximumFractionDigits: 0 });
        dailyAvgEl.dataset.raw = formatted;
        dailyAvgEl.textContent = isHidden ? '******' : formatted;
    }

    const lastMonthTotal = lastMonthTxns.reduce((s, t) => s + getAmt(t), 0);
    const daysInLM = new Date(lmDate.getFullYear(), lmDate.getMonth() + 1, 0).getDate();
    const lastDailyAvg = daysInLM > 0 ? lastMonthTotal / daysInLM : 0;
    const dailyAvgSub = document.getElementById('daily-avg-sub');
    if (dailyAvgSub) {
        if (lastDailyAvg > 0) {
            const pct = ((dailyAvg - lastDailyAvg) / lastDailyAvg) * 100;
            dailyAvgSub.textContent = `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}% vs last month`;
            dailyAvgSub.className = 'insight-sub ' + (pct > 0 ? 'up' : 'down');
        } else {
            dailyAvgSub.textContent = 'this month';
            dailyAvgSub.className = 'insight-sub neutral';
        }
    }

    let biggestAmt = 0;
    let biggestName = '—';
    thisMonthTxns.forEach(t => {
        const amt = getAmt(t);
        if (amt > biggestAmt) {
            biggestAmt = amt;
            const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : null;
            biggestName = mapped?.name || t.merchant || t.note || 'Unknown';
        }
    });

    const bigVal = document.getElementById('biggest-txn-val');
    if (bigVal) {
        const formatted = '₱' + biggestAmt.toLocaleString(undefined, { maximumFractionDigits: 0 });
        bigVal.dataset.raw = formatted;
        bigVal.textContent = isHidden ? '******' : formatted;
    }
    const bigSub = document.getElementById('biggest-txn-sub');
    if (bigSub) bigSub.textContent = biggestName.toUpperCase();

    const summaryTotal = document.getElementById('summary-total');
    if (summaryTotal) {
        const formatted = '₱' + thisMonthTotal.toLocaleString(undefined, { minimumFractionDigits: 2 });
        summaryTotal.dataset.raw = formatted;
        summaryTotal.textContent = isHidden ? '******' : formatted;
    }
    const summaryCount = document.getElementById('summary-txn-count');
    if (summaryCount) summaryCount.textContent = thisMonthTxns.length;

    const summaryChange = document.getElementById('summary-change');
    if (summaryChange) {
        if (lastMonthTotal > 0) {
            const pct = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
            summaryChange.textContent = `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}%`;
            summaryChange.className = 's-value ' + (pct > 0 ? 'red' : 'green');
        } else {
            summaryChange.textContent = '—';
        }
    }

    const summaryTopCat = document.getElementById('summary-top-cat');
    if (summaryTopCat) {
        const catTotals = {};
        thisMonthTxns.forEach(t => {
            const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : { category: 'Other' };
            const cat = t.manualCategory || mapped.category || 'Other';
            catTotals[cat] = (catTotals[cat] || 0) + getAmt(t);
        });
        const top = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
        summaryTopCat.textContent = top ? (window.displayCategoryName ? window.displayCategoryName(top[0]) : top[0]) : '—';
    }

    if (window.updateAISummary) window.updateAISummary(thisMonthTxns);
}

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
            const mapped = window.getMerchantDisplay ? window.getMerchantDisplay(t.merchant, t) : { category: 'Other' };
            const amt = Math.abs(t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0));
            if (!t.excluded && !t.refund && !t.reimbursed) {
                if (mapped.category === 'Income') months[mIdx].income += amt;
                else months[mIdx].expense += amt;
            }
        }
    });

    const maxVal = Math.max(...months.map(m => Math.max(m.income, m.expense)), 1000);
    
    container.innerHTML = months.map(m => {
        const iH = (m.income / maxVal) * 100;
        const eH = (m.expense / maxVal) * 100;
        return `
            <div class="cashflow-col">
                <div class="bars-container">
                    <div class="bar bar-income" style="height: ${iH}%"></div>
                    <div class="bar bar-expense" style="height: ${eH}%"></div>
                </div>
                <span class="bar-label">${m.name}</span>
            </div>
        `;
    }).join('');
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
                    <div class="sub-label">AVG ₱${Math.round(g.averageSpend).toLocaleString()}</div>
                </div>
                <div class="sub-val" style="color: ${statusColor}">
                    ₱${Math.round(g.currentMonthSpend).toLocaleString()}
                </div>
            </div>
        `;
    }).join('');
}

// Global UI Initialization
export function initUI() {
    log('Initializing UI Engine...');
    
    // Bridging for legacy onclick handlers
    window.updateAccountSwitcherUI = updateAccountSwitcherUI;
    window.updateBalanceCardsUI = updateBalanceCardsUI;
    window.scrollToActiveCard = scrollToActiveCard;
    window.updateProfileUI = updateProfileUI;
    window.handleLocalModeNudge = handleLocalModeNudge;
    window.switchAccount = switchAccount;
    window.applyAccountTheme = applyAccountTheme;
    window.applyUserView = applyUserView;
    window.updateBPIInsight = updateBPIInsight;
    window.updateSafeSpendUI = updateSafeSpendUI;
    window.applyTheme = applyTheme;
    window.setupAccountSwitcher = setupAccountSwitcher;
    window.updateHeaderIcon = updateHeaderIcon;
    window.updateBalanceToThisMonth = updateBalanceToThisMonth;
    window.updateInsightCards = updateInsightCards;
    window.initPrivacyLock = initPrivacyLock;
    window.tryBiometricUnlock = tryBiometricUnlock;
    window.drawCashFlowChart = drawCashFlowChart;
    window.detectSubscriptions = detectSubscriptions;
    
    // 1. Restore Profile from Cache (Instant UI)
    if (window.NavState) {
        window.NavState.loadProfile();
    }

    // 2. Populate Previous 3 Months in filter
    populateMonthFilter();

    // 3. Setup Fast Path rendering if possible
    setupFastPath();
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
        console.log('⚡ Fast Path: Rendering from cache...');
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
            
            const { loadData } = import('./app-data.js').then(m => {
                window.fastPathTriggered = true;
                m.loadData(lastUid);
            });
        } catch(e) { console.warn('Fast path failed', e); }
    }
}

function log(msg, type = 'info') {
    if (window.log) window.log(msg, type);
    else console.log(`[UI] ${type.toUpperCase()}: ${msg}`);
}
