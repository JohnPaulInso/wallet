(function () {
    'use strict';

    /* ── helpers ── */
    const $ = (id) => document.getElementById(id);

    function fmtAmt(n) {
        return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function normalizeAmt(n) {
        return Math.round(parseFloat(n) * 100); // cents, integer compare
    }

    /* ── collect all BPI txn amounts already in the app ── */
    function getLocalBpiAmounts() {
        const amounts = new Set();
        const src = (window.walletTxns && window.walletTxns.bpi)
            ? window.walletTxns.bpi
            : (window.allTxns || []);
        src.forEach(t => {
            const raw = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
            amounts.add(normalizeAmt(raw));
        });
        return amounts;
    }

    /* ── fuzzy match a scanned txn against local records ── */
    function isAlreadySynced(scannedAmt, localAmounts) {
        return localAmounts.has(normalizeAmt(scannedAmt));
    }

    // Uses Gemini Vision — works with plain fetch (no CORS issues unlike OpenAI direct calls)
    /* ══════════════════════════════════════════════════════════
       TESSERACT.JS OCR - FREE CLIENT-SIDE TEXT EXTRACTION
       No API keys, no quota, runs entirely in browser
       ══════════════════════════════════════════════════════════ */

    async function runTesseractOCR(base64Image, mimeType) {
        console.log('[BPI Scanner] Starting Tesseract OCR...');

        if (!window.Tesseract) {
            console.error('[BPI Scanner] Tesseract.js not loaded!');
            throw new Error('Tesseract.js not loaded. Check CDN script.');
        }

        console.log('[BPI Scanner] Tesseract loaded, creating worker...');
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        setStatusText('Initializing OCR engine…');

        try {
            const { data: { text } } = await Tesseract.recognize(
                dataUrl,
                'eng',
                {
                    logger: m => {
                        console.log('[Tesseract]', m.status, m.progress);
                        if (m.status === 'recognizing text') {
                            const pct = Math.round(m.progress * 100);
                            setStatusText(`Reading text... ${pct}%`);
                        } else if (m.status === 'loading tesseract core') {
                            setStatusText('Loading OCR engine...');
                        } else if (m.status === 'initializing tesseract') {
                            setStatusText('Initializing OCR...');
                        } else if (m.status === 'initializing api') {
                            setStatusText('Preparing to scan...');
                        } else if (m.status === 'loading language traineddata') {
                            setStatusText('Loading language data...');
                        }
                    }
                }
            );

            console.log('[BPI Scanner] OCR complete, text length:', text.length);
            console.log('[BPI Scanner] First 200 chars:', text.substring(0, 200));
            return text;
        } catch (err) {
            console.error('[BPI Scanner] Tesseract error:', err);
            throw err;
        }
    }

    /* ── parse OCR text into structured transaction data ── */
    function parseOCRText(rawText) {
        console.log('[BPI Scanner] Parsing OCR text, length:', rawText.length);
        console.log('[BPI Scanner] Raw OCR output:', rawText.substring(0, 1000));

        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        console.log('[BPI Scanner] Total lines:', lines.length);

        // Extract available balance
        let availableBalance = null;
        const balanceMatch = rawText.match(/(?:Available.*?balance|PHP|₱|P)\s*([\d,]+\.?\d*)/i);
        if (balanceMatch) {
            availableBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
            console.log('[BPI Scanner] Found balance:', availableBalance);
        }

        const transactions = [];
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const year = new Date().getFullYear();

        // Try multiple parsing strategies

        // Strategy 1: Look for PHP amounts and work backwards to find merchant
        const amountLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Find lines with amounts: "PHP 215.50" or "- PHP 215.50" or "215.50"
            const amountMatch = line.match(/[-−]?\s*(?:PHP|₱|P)?\s*([\d,]+\.\d{2})/i);
            if (amountMatch) {
                const amount = parseFloat(amountMatch[0].replace(/[PHP₱P\s,−-]/g, ''));
                if (amount > 0) {
                    amountLines.push({ lineIdx: i, amount: amount, line: line, hasNegative: /^[-−]/.test(line.trim()) || line.includes('- PHP') });
                }
            }
        }

        console.log('[BPI Scanner] Found', amountLines.length, 'amount lines');

        // For each amount, look backwards for merchant and date
        for (const amtInfo of amountLines) {
            let merchant = '';
            let date = '';
            let note = '';

            // Look backwards up to 5 lines for merchant name
            for (let j = amtInfo.lineIdx - 1; j >= Math.max(0, amtInfo.lineIdx - 5); j--) {
                const candidateLine = lines[j];

                // Skip certain keywords
                if (/transaction history|recent transaction|amount|available|balance|account number/i.test(candidateLine)) continue;

                // Check if line has meaningful text (not just dates/numbers)
                if (candidateLine.length >= 3 && /[a-zA-Z]{3,}/.test(candidateLine)) {
                    // Date pattern: "JUN 25"
                    const dateMatch = candidateLine.match(/\b([A-Z]{3})\s*(\d{1,2})\b/i);
                    if (dateMatch && !date) {
                        const monthIdx = months.findIndex(m => m === dateMatch[1].toUpperCase());
                        if (monthIdx >= 0) {
                            const day = dateMatch[2].padStart(2, '0');
                            const month = String(monthIdx + 1).padStart(2, '0');
                            date = `${year}-${month}-${day}`;
                        }
                    }

                    // Detect "TRANSFER TO OTHER BANK" note
                    if (/transfer to other bank/i.test(candidateLine)) {
                        note = 'Transfer to other bank';
                    }

                    // If not a date line, could be merchant
                    if (!dateMatch && !merchant && candidateLine.length >= 3) {
                        merchant = candidateLine;
                    }
                }
            }

            if (!merchant) {
                // Check forward too (sometimes merchant is after amount)
                for (let j = amtInfo.lineIdx + 1; j < Math.min(lines.length, amtInfo.lineIdx + 3); j++) {
                    const candidateLine = lines[j];

                    // Detect "TRANSFER TO OTHER BANK" note
                    if (/transfer to other bank/i.test(candidateLine)) {
                        note = 'Transfer to other bank';
                    }

                    if (candidateLine.length >= 3 && /[a-zA-Z]{3,}/.test(candidateLine) && !merchant) {
                        merchant = candidateLine;
                        break;
                    }
                }
            }

            if (merchant || amtInfo.amount > 0) {
                // Clean merchant name
                merchant = (merchant || 'Unknown')
                    .replace(/^(Purchase-BN @|Purchase - BN @|Partner Merchant|Cash In|Fund Transfer|TO:)/i, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                transactions.push({
                    merchant: merchant || 'Transaction',
                    date: date || `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
                    amount: amtInfo.amount,
                    type: amtInfo.hasNegative ? 'debit' : 'credit',
                    note: note
                });
            }
        }

        // Combine InstaPay Transfer + Fee transactions
        for (let i = 0; i < transactions.length - 1; i++) {
            const current = transactions[i];
            const next = transactions[i + 1];

            // Check if current is InstaPay Transfer and next is InstaPay Transfer Fee
            const isInstaPayTransfer = /instapay\s*transfer/i.test(current.merchant);
            const isInstaPayFee = /instapay\s*transfer\s*fee/i.test(next.merchant);

            if (isInstaPayTransfer && isInstaPayFee && current.date === next.date) {
                // Combine them: main amount + fee
                current.amount = current.amount + next.amount;
                current.merchant = 'INSTAPAY TRANSFER';
                current.note = current.note || 'Transfer to other bank';

                // Remove the fee transaction
                transactions.splice(i + 1, 1);

                console.log('[BPI Scanner] Combined InstaPay Transfer + Fee:', current.amount);
            }
        }

        console.log('[BPI Scanner] Parsed', transactions.length, 'transactions');
        transactions.forEach((t, i) => {
            console.log(`  [${i}]`, t.merchant, '|', t.date, '|', t.amount, '|', t.type, '|', t.note || '');
        });

        return {
            availableBalance,
            transactions
        };
    }

    /* ── parseAIResponse alias — kept for runScan compatibility ── */
    function parseAIResponse(ocrResult) {
        return ocrResult;
    }

    function cleanMerchant(raw) {
        return raw
            .replace(/^[-–•*·]+/, '')          // leading dashes/bullets
            .replace(/\s{2,}/g, ' ')            // collapse spaces
            .replace(/[^\x20-\x7E]/g, '')       // strip non-ASCII OCR artifacts
            .trim()
            .toUpperCase()
            .substring(0, 50);
    }

    /* ── normalise date string ── */
    function normaliseDate(rawDate) {
        if (!rawDate) return window.formatLocalDate ? window.formatLocalDate(new Date()) : new Date().toISOString().split('T')[0];
        // already ISO
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
        // "JUN 25" style
        const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
        const m = rawDate.toUpperCase().match(/([A-Z]+)\s+(\d+)/);
        if (m && months[m[1]] !== undefined) {
            const d = new Date();
            d.setMonth(months[m[1]]);
            d.setDate(parseInt(m[2]));
            return window.formatLocalDate ? window.formatLocalDate(d) : d.toISOString().split('T')[0];
        }
        return rawDate;
    }

    /* ── push a single approved txn to BPI ledger ── */
    async function pushToBPI(txn) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) throw new Error('Not logged in');

        const merchant = txn.merchant || 'BPI Transaction';
        const display = typeof window.getMerchantDisplay === 'function'
            ? window.getMerchantDisplay(merchant, txn)
            : { category: 'Other', icon: 'receipt' };

        const data = {
            merchant: merchant,
            name: merchant,
            amount: txn.type === 'credit' ? txn.amount : -Math.abs(txn.amount),
            manualAmount: Math.abs(txn.amount),
            date: normaliseDate(txn.date),
            category: display.category || 'Other',
            manualCategory: display.category || 'Other',
            manualBudgetCategory: 'n/a',
            source: 'bpi_ocr_scan',
            createdAt: window.serverTimestamp ? window.serverTimestamp() : new Date().toISOString()
        };

        const colRef = window.collection
            ? window.collection(window.db, 'users', uid, 'bpi_transactions')
            : null;

        if (!colRef) throw new Error('Firestore not ready');
        await window.addDoc(colRef, data);

        // optimistic local push
        if (window.walletTxns && Array.isArray(window.walletTxns.bpi)) {
            window.walletTxns.bpi.unshift({ id: `ocr_${Date.now()}`, ...data });
        }
        if (window.updateTripleProgressBar) window.updateTripleProgressBar();
    }

    /* ══════════════════════════════════════════════════════════
       SCANNER STATE
    ══════════════════════════════════════════════════════════ */
    let _imageDataUrl = '';
    let _scanResults = [];   // { merchant, date, amount, type, synced, dismissed }
    let _availBal = null;

    /* ── render the results list ── */
    function renderResults() {
        const scroll = $('bpi-scan-results-scroll');
        const title = $('bpi-scan-results-title');
        const meta = $('bpi-scan-results-meta');

        const unsyncedItems = _scanResults.filter(r => !r.synced && !r.dismissed);
        const syncedItems = _scanResults.filter(r => r.synced);

        title.textContent = `${unsyncedItems.length} Missing · ${syncedItems.length} Already Synced`;
        meta.textContent = unsyncedItems.length ? 'Swipe → to add  ·  Swipe ← to skip' : 'All transactions accounted for';

        let html = '';

        // Balance row
        if (_availBal !== null) {
            html += `<div class="bpi-scan-balance-row">
                <i class="material-icons">account_balance</i>
                <div>
                    <div class="bpi-scan-balance-label">Screenshot Balance</div>
                    <div class="bpi-scan-balance-val">${fmtAmt(_availBal)}</div>
                    <div class="bpi-scan-balance-match">Extracted from screenshot header</div>
                </div>
            </div>`;
        }

        // Summary chips
        html += `<div class="bpi-scan-summary-chips">
            <span class="bpi-scan-chip bpi-scan-chip-new">${unsyncedItems.length} New</span>
            <span class="bpi-scan-chip bpi-scan-chip-synced">${syncedItems.length} Synced</span>
            ${_availBal ? `<span class="bpi-scan-chip bpi-scan-chip-balance">${fmtAmt(_availBal)}</span>` : ''}
        </div>`;

        // Unsynced (actionable)
        if (unsyncedItems.length) {
            html += `<div class="bpi-scan-section-label">🔴 Missing — Tap ✓ to add</div>`;
            unsyncedItems.forEach(r => {
                html += buildCardHTML(r);
            });
        }

        // All done state
        if (!unsyncedItems.length && _scanResults.length > 0) {
            html += `<div class="bpi-scan-all-done">
                <i class="material-icons">check_circle</i>
                <div class="bpi-scan-all-done-title">All Caught Up!</div>
                <div class="bpi-scan-all-done-sub">Every transaction in this screenshot is already in your wallet.</div>
            </div>`;
        }

        // Already synced (dimmed)
        if (syncedItems.length) {
            html += `<div class="bpi-scan-section-label">✅ Already in Wallet</div>`;
            syncedItems.forEach(r => { html += buildCardHTML(r); });
        }

        scroll.innerHTML = html;
        attachCardListeners();
    }

    function buildCardHTML(r) {
        const isSynced = r.synced;
        const dateDisplay = r.date ? String(r.date).replace(/^\d{4}-/, '').replace('-', '/') : '—';
        return `
        <div class="bpi-scan-txn-card ${isSynced ? 'bpi-card-synced' : ''}"
             data-id="${r._id}"
             ${!isSynced ? 'data-swipeable="1"' : ''}>
            <div class="bpi-scan-swipe-hint bpi-scan-swipe-hint-accept">✓</div>
            <div class="bpi-scan-swipe-hint bpi-scan-swipe-hint-reject">✕</div>
            <div class="bpi-scan-card-icon ${isSynced ? 'synced-icon' : ''}">
                <i class="material-icons">${isSynced ? 'check_circle' : (r.type === 'credit' ? 'arrow_downward' : 'arrow_upward')}</i>
            </div>
            <div class="bpi-scan-card-info">
                <div class="bpi-scan-card-name">${r.merchant}</div>
                <div class="bpi-scan-card-meta">${dateDisplay} · ${r.type === 'credit' ? 'Credit' : 'Debit'}</div>
                ${isSynced ? '<span class="bpi-scan-card-synced-badge"><i class="material-icons" style="font-size:10px">check</i> Already Synced</span>' : ''}
            </div>
            <div class="bpi-scan-card-right">
                <div class="bpi-scan-card-amount">${fmtAmt(r.amount)}</div>
                ${!isSynced ? `
                <div class="bpi-scan-action-btns">
                    <button class="bpi-scan-btn-accept" data-action="accept" data-id="${r._id}" aria-label="Add transaction">
                        <i class="material-icons">check</i>
                    </button>
                    <button class="bpi-scan-btn-reject" data-action="reject" data-id="${r._id}" aria-label="Skip transaction">
                        <i class="material-icons">close</i>
                    </button>
                </div>` : ''}
            </div>
        </div>`;
    }

    /* ── attach button + swipe listeners ── */
    function attachCardListeners() {
        const scroll = $('bpi-scan-results-scroll');

        // Button clicks
        scroll.querySelectorAll('[data-action="accept"]').forEach(btn => {
            btn.addEventListener('click', () => acceptCard(btn.dataset.id));
        });
        scroll.querySelectorAll('[data-action="reject"]').forEach(btn => {
            btn.addEventListener('click', () => rejectCard(btn.dataset.id));
        });

        // Swipe listeners on each swipeable card
        scroll.querySelectorAll('[data-swipeable="1"]').forEach(card => {
            attachSwipe(card);
        });
    }

    function attachSwipe(card) {
        let startX = 0, startY = 0, currentX = 0;
        let isSwiping = false;
        const THRESHOLD = 80;
        const id = card.dataset.id;
        const acceptHint = card.querySelector('.bpi-scan-swipe-hint-accept');
        const rejectHint = card.querySelector('.bpi-scan-swipe-hint-reject');

        card.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            currentX = 0;
            isSwiping = false;
            card.style.transition = 'none';
        }, { passive: true });

        card.addEventListener('touchmove', e => {
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (!isSwiping && Math.abs(dy) > Math.abs(dx) + 5) return; // vertical scroll wins
            isSwiping = true;
            currentX = dx;
            card.style.transform = `translateX(${dx}px)`;
            const ratio = Math.min(Math.abs(dx) / THRESHOLD, 1);
            if (dx > 0) {
                card.classList.add('bpi-card-swiping-right');
                card.classList.remove('bpi-card-swiping-left');
                if (acceptHint) acceptHint.style.opacity = ratio;
                if (rejectHint) rejectHint.style.opacity = 0;
            } else {
                card.classList.add('bpi-card-swiping-left');
                card.classList.remove('bpi-card-swiping-right');
                if (rejectHint) rejectHint.style.opacity = ratio;
                if (acceptHint) acceptHint.style.opacity = 0;
            }
        }, { passive: true });

        card.addEventListener('touchend', () => {
            if (!isSwiping) return;
            card.style.transition = '';
            if (currentX > THRESHOLD) {
                animateCardOut(card, 'right', () => acceptCard(id));
            } else if (currentX < -THRESHOLD) {
                animateCardOut(card, 'left', () => rejectCard(id));
            } else {
                // snap back
                card.style.transform = '';
                card.classList.remove('bpi-card-swiping-right', 'bpi-card-swiping-left');
                if (acceptHint) acceptHint.style.opacity = 0;
                if (rejectHint) rejectHint.style.opacity = 0;
            }
        }, { passive: true });
    }

    function animateCardOut(card, dir, callback) {
        card.style.transition = 'transform 0.28s ease, opacity 0.28s ease';
        card.style.transform = dir === 'right' ? 'translateX(110%)' : 'translateX(-110%)';
        card.style.opacity = '0';
        setTimeout(callback, 300);
    }

    async function acceptCard(id) {
        const r = _scanResults.find(x => x._id === id);
        if (!r || r.synced || r.dismissed) return;
        try {
            await pushToBPI(r);
            r.synced = true;
            if (typeof showToast === 'function') showToast(`Added: ${r.merchant}`);
        } catch (e) {
            console.error('[BPIScanner] push failed', e);
            if (typeof showToast === 'function') showToast('Failed to add transaction');
        }
        renderResults();
    }

    function rejectCard(id) {
        const r = _scanResults.find(x => x._id === id);
        if (!r) return;
        r.dismissed = true;
        renderResults();
    }

    /* ── scanner UI state helpers ── */
    function setStatusText(text) {
        const el = $('bpi-scan-status-text');
        if (el) el.textContent = text;
    }
    function setTopbarSub(text) {
        const el = $('bpi-scan-topbar-sub');
        if (el) el.textContent = text;
    }
    function showStatusPill(show) {
        const el = $('bpi-scan-status-pill');
        if (el) el.style.display = show ? '' : 'none';
    }
    function showLaser(show) {
        const el = $('bpi-scan-laser');
        if (el) el.classList.toggle('bpi-scan-laser-hidden', !show);
    }
    function openResultsPanel() {
        const panel = $('bpi-scan-results-panel');
        if (panel) {
            requestAnimationFrame(() => panel.classList.add('bpi-results-open'));
        }
    }
    function closeResultsPanel() {
        const panel = $('bpi-scan-results-panel');
        if (panel) panel.classList.remove('bpi-results-open');
    }

    /* ── Manual Review Mode ── */
    function showManualReviewMode() {
        const scroll = $('bpi-scan-results-scroll');
        if (!scroll) return;

        const existingTxns = (window.walletTxns && window.walletTxns.bpi) ? window.walletTxns.bpi : (window.allTxns || []);

        function formatDateNice(dateStr) {
            if (!dateStr) return '';
            const d = new Date(dateStr);
            if (isNaN(d)) return dateStr;
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            return `${months[d.getMonth()]} ${d.getDate()}`;
        }

        function getMerchantInfo(t) {
            if (typeof window.getMerchantDisplay === 'function') {
                return window.getMerchantDisplay(t.merchant, t);
            }
            return {
                display: t.merchant || 'Unknown',
                category: 'Shopping',
                icon: 'shopping_bag',
                color: '#3b82f6',
                logo: null
            };
        }

        scroll.innerHTML = `
            <div style="padding: 16px 16px 8px; text-align: center;">
                <button onclick="window.BPIScanner.close(); setTimeout(() => window.openBudgetManual(), 100);" style="
                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 14px 24px;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    width: 100%;
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
                ">
                    <i class="material-icons" style="vertical-align: middle; font-size: 18px; margin-right: 6px;">add_circle</i>
                    Add Transaction from Screenshot
                </button>
            </div>
            
            <div style="padding: 16px; background: #f8fafc;">
                <div style="
                    font-size: 11px;
                    font-weight: 800;
                    color: #64748b;
                    margin-bottom: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                ">YOUR BPI TRANSACTIONS (${existingTxns.length})</div>
                
                ${existingTxns.slice(0, 10).map(t => {
                            const merchant = getMerchantInfo(t);
                            const amt = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
                            const dateNice = formatDateNice(t.date);

                            return `
                        <div class="premium-txn" style="
                            background: white;
                            border-radius: 12px;
                            padding: 12px;
                            margin-bottom: 8px;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
                        ">
                            ${merchant.logo ? `
                                <div style="
                                    width: 42px;
                                    height: 42px;
                                    border-radius: 10px;
                                    background: ${merchant.color || '#f1f5f9'};
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    flex-shrink: 0;
                                    overflow: hidden;
                                ">
                                    <img src="${merchant.logo}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                    <i class="material-icons" style="display: none; font-size: 22px; color: white;">${merchant.icon || 'shopping_bag'}</i>
                                </div>
                            ` : `
                                <div style="
                                    width: 42px;
                                    height: 42px;
                                    border-radius: 10px;
                                    background: ${merchant.color || '#3b82f6'};
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    flex-shrink: 0;
                                ">
                                    <i class="material-icons" style="font-size: 22px; color: white;">${merchant.icon || 'shopping_bag'}</i>
                                </div>
                            `}
                            
                            <div style="flex: 1; min-width: 0; overflow: hidden;">
                                <div style="
                                    font-size: 13px;
                                    font-weight: 700;
                                    color: #1e293b;
                                    margin-bottom: 2px;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    white-space: nowrap;
                                    max-width: 100%;
                                ">${merchant.display || 'Unknown'}</div>
                                <div style="
                                    font-size: 11px;
                                    color: #64748b;
                                    font-weight: 500;
                                    overflow: hidden;
                                    text-overflow: ellipsis;
                                    white-space: nowrap;
                                ">${dateNice} • ${merchant.category || 'Uncategorized'}</div>
                            </div>
                            
                            <div style="
                                font-size: 15px;
                                font-weight: 800;
                                color: #ef4444;
                                white-space: nowrap;
                                margin-left: 8px;
                            ">${fmtAmt(amt)}</div>
                        </div>
                    `;
                        }).join('')}
                
                ${existingTxns.length === 0 ? `
                    <div style="
                        text-align: center;
                        padding: 40px 20px;
                        color: #94a3b8;
                        font-size: 13px;
                    ">
                        <i class="material-icons" style="font-size: 48px; opacity: 0.3; margin-bottom: 8px;">inbox</i>
                        <div>No BPI transactions yet</div>
                    </div>
                ` : ''}
            </div>
        `;

        $('bpi-scan-results-title').textContent = 'Review Screenshot';
        $('bpi-scan-results-meta').textContent = 'Compare and add missing';
        openResultsPanel();
    }

    async function runScan(base64Image, mimeType) {
        console.log('[BPI Scanner] runScan DISABLED - using manual review');
        showManualReviewMode();
        return;
    }

    /* ── PUBLIC API ── */
    window.BPIScanner = {
        handleFileUpload(event) {
            console.log('[BPI Scanner] File upload started');

            const file = event.target.files?.[0];
            event.target.value = '';

            if (!file) return;
            if (!file.type.startsWith('image/')) {
                if (typeof showToast === 'function') showToast('Please select an image file');
                return;
            }

            const overlay = $('bpi-scanner-overlay');
            if (!overlay) {
                console.error('[BPI Scanner] Overlay not found');
                return;
            }

            overlay.classList.add('bpi-scan-visible');
            closeResultsPanel();
            showLaser(false); 
            showStatusPill(true);
            setStatusText('Loading screenshot...');
            setTopbarSub('Review BPI transactions below');

            if (window.NavState) {
                window.NavState.pushModalState('bpi-scanner-overlay', () => window.BPIScanner.close());
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                _imageDataUrl = dataUrl;

                const img = $('bpi-scan-preview-img');
                if (img) {
                    img.src = dataUrl;
                    img.classList.add('bpi-scan-done'); 
                }

                setStatusText('Screenshot loaded - Review transactions below');
                showStatusPill(false);

                showManualReviewMode();
            };
            reader.readAsDataURL(file);
        },

        close() {
            const overlay = $('bpi-scanner-overlay');
            overlay.classList.remove('bpi-scan-visible');
            closeResultsPanel();
            showLaser(false);
            showStatusPill(false);
            _scanResults = [];
            _availBal = null;
            const img = $('bpi-scan-preview-img');
            if (img) { img.src = ''; img.classList.remove('bpi-scan-done'); }
            if (window.NavState) window.NavState.popModalState('bpi-scanner-overlay');
        },

        updateButtonVisibility() {
            const bpiScanRow = document.getElementById('bpi-scan-upload-row');
            if (bpiScanRow) {
                bpiScanRow.style.display = (window.currentAccount === 'bpi') ? 'block' : 'none';
            }
        },

        showQuickAddForm() {
            this.close();
            setTimeout(() => {
                if (typeof window.openBudgetManual === 'function') {
                    window.openBudgetManual();
                }
            }, 300);
        }
    };

    // Attach file input handler
    console.log('[BPI Scanner] Initializing file input handler...');

    const fileInput = document.getElementById('bpi-scan-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            window.BPIScanner.handleFileUpload(event);
        });
    } else {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                const input = document.getElementById('bpi-scan-file-input');
                if (input) {
                    input.addEventListener('change', (event) => {
                        window.BPIScanner.handleFileUpload(event);
                    });
                }
            });
        }
    }
})();
