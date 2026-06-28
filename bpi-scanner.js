// BPI Scanner - Pull-down sheet with scanning animation and smart matching
// This extends the existing window.BPIScanner object

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    // Store original methods
    const originalHandleUpload = window.BPIScanner?.handleFileUpload;
    const originalClose = window.BPIScanner?.close;

    // Helper to extract month and day for robust date comparison with up to 4-day tolerance
    // FIX DATE: 2026-06-28
    // FIX SPEC: Allow up to 4 days difference for matching (posting vs trans dates / ocr date shifts)
    function datesMatch(dateStr1, dateStr2) {
        if (!dateStr1 || !dateStr2) return false;

        const parseToDate = (str) => {
            // Try standard Date parsing first (e.g. YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
                const parts = str.split('-');
                return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            }

            let d = new Date(str);
            if (!isNaN(d.getTime())) return d;

            // Clean and parse manually
            const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            const clean = String(str).toLowerCase().replace(/[^a-z0-9]/g, ' ');
            const parts = clean.split(/\s+/).filter(Boolean);

            let month = -1;
            let day = -1;
            let year = new Date().getFullYear();

            for (const part of parts) {
                const num = parseInt(part, 10);
                if (!isNaN(num)) {
                    if (num > 31 && num < 9999) {
                        year = num;
                    } else if (num > 0 && num <= 31) {
                        day = num;
                    }
                } else {
                    const idx = months.findIndex(m => part.startsWith(m));
                    if (idx !== -1) {
                        month = idx;
                    }
                }
            }

            if (month !== -1 && day !== -1) {
                return new Date(year, month, day);
            }
            return null;
        };

        const d1 = parseToDate(dateStr1);
        const d2 = parseToDate(dateStr2);

        if (!d1 || !d2) {
            // Fallback to substring matching if manual parsing fails
            return String(dateStr1).includes(String(dateStr2)) || String(dateStr2).includes(String(dateStr1));
        }

        // Compare absolute difference in days
        const diffTime = Math.abs(d1.getTime() - d2.getTime());
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return diffDays <= 4.1; // [FIXED: 2026-06-28] Increased tolerance to 4 days to robustly handle OCR date reading/magnifier offsets
    }


    // Helper to match merchant names leniently by word sharing or substring
    // FIX DATE: 2026-06-28
    function merchantsMatch(m1, m2) {
        const norm1 = String(m1).toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
        const norm2 = String(m2).toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();

        if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

        // Split into words and check if they share any significant word (length >= 3)
        const words1 = norm1.split(/\s+/).filter(w => w.length >= 3);
        const words2 = norm2.split(/\s+/).filter(w => w.length >= 3);

        for (const w1 of words1) {
            if (words2.includes(w1)) return true;
        }

        // Check if they share the first 5 characters (e.g. "MR DIY Z" vs "MR DIY BOGO")
        const prefix1 = norm1.substring(0, 5);
        const prefix2 = norm2.substring(0, 5);
        if (prefix1.length >= 5 && prefix1 === prefix2) return true;

        return false;
    }

    // Helper to get existing transactions from wallet with DOM scraping & allTxns fallback
    // FIX DATE: 2026-06-28
    function getExistingTransactions() {
        const transactions = [];

        // 1. Scraping directly from DOM premium transaction items (.premium-txn)
        const domTxns = document.querySelectorAll('.premium-txn');
        if (domTxns.length > 0) {
            domTxns.forEach(el => {
                const manual = el.getAttribute('data-manual-amount');
                const amtAttr = el.getAttribute('data-amount');
                const amount = Math.abs(parseFloat(manual || amtAttr || '0'));

                transactions.push({
                    merchant: (el.getAttribute('data-merchant') || '').toUpperCase(),
                    amount: Math.round(amount * 100) / 100,
                    date: el.getAttribute('data-date') || ''
                });
            });
            console.log(`[BPI Scanner] Scraping matched ${transactions.length} transactions from DOM (.premium-txn)`);
        }

        // 2. Fallback to cached window data lists if DOM is empty
        if (transactions.length === 0) {
            let src = [];
            if (window.walletTxns && Array.isArray(window.walletTxns.bpi)) {
                src = window.walletTxns.bpi;
            } else if (window.currentAccount === 'bpi' && Array.isArray(window.allTxns)) {
                src = window.allTxns;
            }

            src.forEach(txn => {
                const amount = Math.abs(txn.manualAmount !== undefined ? txn.manualAmount : (txn.amount || 0));
                transactions.push({
                    merchant: (txn.merchant || txn.name || '').toUpperCase(),
                    amount: Math.round(amount * 100) / 100, // Round to 2 decimals
                    date: txn.date
                });
            });
            console.log(`[BPI Scanner] Fallback matched ${transactions.length} transactions from window cache`);
        }

        return transactions;
    }

    // Check if transaction already exists
    // FIX DATE: 2026-06-28
    // FIX SPEC: Lenient matching for amount (up to 1.00 discrepancy and 10.00 InstaPay fee), 
    // and date values (up to 4 days range) to allow robust matching regardless of OCR merchant noise.
    function isTransactionSynced(merchant, amount, date, existingTxns) {
        const normalizedMerchant = merchant.toUpperCase().trim();
        const normalizedAmount = Math.round(amount * 100) / 100;

        return existingTxns.some(txn => {
            // Check amount match:
            // - Within 1.01 discrepancy (e.g. 215.50 scanned vs 215.00 wallet) OR
            // - Within 10.00 + 1.01 discrepancy (e.g. 1000.00 scanned vs 1010.00 wallet for InstaPay fee)
            const diffAmount = Math.abs(txn.amount - normalizedAmount);
            const amountMatch = (diffAmount <= 1.01) || (Math.abs(diffAmount - 10.00) <= 1.01);
            if (!amountMatch) return false;

            // Check date match (up to 4 days difference)
            const dateMatch = datesMatch(txn.date, date);
            if (!dateMatch) return false;

            // Amount and date match on the active account in this range is highly unique,
            // so we consider it synced immediately regardless of statement description noise.
            return true;
        });
    }

    // Combine InstaPay transfers with their fees
    // FIX DATE: 2026-06-28
    // FIX SPEC: Combined InstaPay Transfer and Fee logic and normalizations
    // - Normalized merchant name to "INSTAPAY TRANSFER"
    // - Normalized note to lowercase "transfer to other bank"
    function combineInstapayTransactions(transactions) {
        const combined = [];
        const processed = new Set();

        console.log('[BPI Scanner] Starting InstaPay combining, transactions:', transactions.length);

        for (let i = 0; i < transactions.length; i++) {
            if (processed.has(i)) continue;

            const txn = transactions[i];
            const merchantUpper = txn.merchant.toUpperCase();

            console.log(`[BPI Scanner] Processing [${i}]:`, merchantUpper, '₱' + txn.amount);

            // Check if it's an InstaPay Transfer (not the fee)
            if (/instapay\s*transfer(?!\s*fee)/i.test(merchantUpper)) {
                console.log(`[BPI Scanner] Found InstaPay Transfer at [${i}], searching for fee...`);

                // Look for corresponding fee in next few transactions (check both before and after)
                let feeAmount = 0;
                let feeIndex = -1;

                const isFeeMatch = (m, amt) => {
                    const cleanM = String(m).toUpperCase();
                    return (amt === 10) &&
                        (/FEE|INSTAPAY|TRANSFER|CHARGE|PAY/i.test(cleanM) ||
                            /\b\d{1,2}:\d{2}\b/.test(cleanM) ||
                            /\b\d{1,3}%\b/.test(cleanM));
                };

                // Search forward first
                for (let j = i + 1; j <= Math.min(i + 5, transactions.length - 1); j++) {
                    const nextMerchant = transactions[j].merchant;
                    const nextAmount = transactions[j].amount;
                    console.log(`[BPI Scanner]   Checking forward [${j}]:`, nextMerchant, '₱' + nextAmount);

                    if (isFeeMatch(nextMerchant, nextAmount)) {
                        feeAmount = nextAmount;
                        feeIndex = j;
                        console.log(`[BPI Scanner]   ✓ Found fee at [${j}]: ₱${feeAmount}`);
                        break;
                    }
                }

                // If not found forward, search backward
                if (feeIndex === -1) {
                    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                        const prevMerchant = transactions[j].merchant;
                        const prevAmount = transactions[j].amount;
                        console.log(`[BPI Scanner]   Checking backward [${j}]:`, prevMerchant, '₱' + prevAmount);

                        if (isFeeMatch(prevMerchant, prevAmount)) {
                            feeAmount = prevAmount;
                            feeIndex = j;
                            console.log(`[BPI Scanner]   ✓ Found fee at [${j}]: ₱${feeAmount}`);
                            break;
                        }
                    }
                }

                if (feeIndex !== -1) {
                    processed.add(feeIndex);
                    console.log(`[BPI Scanner] ✓ Combining: ₱${txn.amount} + ₱${feeAmount} = ₱${txn.amount + feeAmount}`);
                }

                // Create combined transaction with normalized note (uppercase)
                // FIX DATE: 2026-06-28
                // FIX SPEC: Capitalized note and corrected category icon to payments / cat-financial
                // [FIXED: 2026-06-29] Preserve the original transaction date from OCR parsing
                const originalNote = (txn.note || 'TRANSFER TO OTHER BANK').toUpperCase().trim();
                combined.push({
                    merchant: 'INSTAPAY TRANSFER',
                    amount: txn.amount + feeAmount,
                    date: txn.date, // Preserve the date from OCR
                    type: txn.type || 'debit',
                    category: 'Financial Expenses',
                    icon: 'payments',
                    iconClass: 'cat-financial',
                    note: originalNote
                });
                processed.add(i);
            }
            // Skip standalone InstaPay fees (should be already processed)
            else if (/instapay\s*transfer\s*fee/i.test(merchantUpper)) {
                if (!processed.has(i)) {
                    console.log(`[BPI Scanner] Warning: Standalone InstaPay fee at [${i}], skipping: ₱${txn.amount}`);
                    processed.add(i);
                }
            }
            // Regular transaction
            else {
                console.log(`[BPI Scanner] Adding regular transaction [${i}]:`, merchantUpper);
                combined.push(txn);
                processed.add(i);
            }
        }

        console.log('[BPI Scanner] Combined result:', combined.length, 'transactions');
        return combined;
    }

    // Get merchant display info with strict categories
    // FIX DATE: 2026-06-28
    // FIX SPEC: Mapped merchant names to standard category names, icons, and styling classes
    function getMerchantInfo(merchant) {
        const merchantUpper = merchant.toUpperCase();

        // Specific merchant mappings - standardized to match the CATEGORIES config
        if (merchantUpper.includes('ROSE') && merchantUpper.includes('PHARMA')) {
            return { category: 'Shopping', icon: 'shopping_cart', class: 'cat-shopping' };
        }
        if (merchantUpper.includes('MR') && (merchantUpper.includes('DIY') || merchantUpper.includes('D.I.Y'))) {
            return { category: 'Shopping', icon: 'shopping_cart', class: 'cat-shopping' };
        }
        if (merchantUpper.includes('SHOPEE')) {
            return { category: 'Online shopping', icon: 'shopping_bag', class: 'cat-online' };
        }
        if (merchantUpper.includes('CAVE')) {
            return { category: 'Food & Drinks', icon: 'restaurant', class: 'cat-food' };
        }
        if (merchantUpper.includes('PAYMENT') || merchantUpper.includes('INSTAPAY') || merchantUpper.includes('TRANSFER')) {
            return { category: 'Financial Expenses', icon: 'payments', class: 'cat-financial' };
        }
        if (merchantUpper.includes('SHELL') || merchantUpper.includes('PETRON') || merchantUpper.includes('CALTEX') || merchantUpper.includes('GAS')) {
            return { category: 'Transportation', icon: 'directions_bus', class: 'cat-vehicle' };
        }

        // Strict category rules - no "Other"
        if (merchantUpper.includes('FOOD') || merchantUpper.includes('RESTAURANT') || merchantUpper.includes('CAFE') || merchantUpper.includes('COFFEE')) {
            return { category: 'Food & Drinks', icon: 'restaurant', class: 'cat-food' };
        }
        if (merchantUpper.includes('SHOP') || merchantUpper.includes('STORE') || merchantUpper.includes('MARKET') || merchantUpper.includes('PHARMACY')) {
            return { category: 'Shopping', icon: 'shopping_cart', class: 'cat-shopping' };
        }
        if (merchantUpper.includes('BILL') || merchantUpper.includes('UTILITY') || merchantUpper.includes('ELECTRIC') || merchantUpper.includes('WATER')) {
            return { category: 'Service', icon: 'settings_cell', class: 'cat-service-magenta' };
        }
        if (merchantUpper.includes('HEALTH') || merchantUpper.includes('HOSPITAL') || merchantUpper.includes('CLINIC') || merchantUpper.includes('MEDICAL')) {
            return { category: 'Service', icon: 'settings_cell', class: 'cat-service-magenta' };
        }
        if (merchantUpper.includes('EDU') || merchantUpper.includes('SCHOOL') || merchantUpper.includes('UNIVERSITY')) {
            return { category: 'Education', icon: 'school', class: 'cat-education' };
        }
        if (merchantUpper.includes('ENTERTAINMENT') || merchantUpper.includes('MOVIE') || merchantUpper.includes('CINEMA')) {
            return { category: 'Life & Entertainment', icon: 'confirmation_number', class: 'cat-life' };
        }

        // Default to Shopping if no match
        return { category: 'Shopping', icon: 'shopping_cart', class: 'cat-shopping' };
    }

    // Override handleFileUpload
    if (window.BPIScanner) {
        window.BPIScanner.handleFileUpload = async function (event) {
            console.log('[BPI Scanner Enhanced] File upload started');

            const file = event.target.files?.[0];
            event.target.value = '';

            if (!file) return;
            if (!file.type.startsWith('image/')) {
                if (typeof showToast === 'function') showToast('Please select an image file');
                return;
            }

            // Open pull-down sheet
            const overlay = $('bpi-scanner-overlay');
            if (!overlay) {
                console.error('[BPI Scanner] Overlay not found');
                return;
            }

            overlay.classList.add('bpi-scan-visible');

            // Update subtitle
            const subtitle = $('bpi-scan-status-text');
            if (subtitle) subtitle.textContent = 'Loading image...';

            // Push to NavState for back button
            if (window.NavState) {
                window.NavState.pushModalState('bpi-scanner-overlay', () => window.BPIScanner.close());
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const dataUrl = e.target.result;

                    // Show preview section
                    const previewSection = $('bpi-scan-preview-section');
                    if (previewSection) previewSection.style.display = 'block';

                    // Show preview image
                    const img = $('bpi-scan-preview-img');
                    if (img) {
                        img.src = dataUrl;
                        img.classList.add('bpi-scan-done'); // [FIXED: 2026-06-28] Added class bpi-scan-done to unblur image on file load
                    }

                    // Show scanning animation
                    const animOverlay = $('bpi-scan-animation-overlay');
                    if (animOverlay) animOverlay.style.display = 'flex';

                    // [FIXED: 2026-06-29] Render shimmer skeleton loaders in results panel while scanning
                    showSkeletonLoader();

                    // Update status
                    if (subtitle) subtitle.textContent = 'Analyzing screenshot...';

                    // Perform actual OCR scan
                    await performRealScan(dataUrl);

                } catch (err) {
                    console.error('[BPI Scanner] Error:', err);
                    if (subtitle) subtitle.textContent = 'Error processing image';
                }
            };
            reader.readAsDataURL(file);
        };

        // New function to perform real OCR scan
        async function performRealScan(dataUrl) {
            const progressPath = $('bpi-scan-progress-path');
            const progressText = $('bpi-scan-progress-text');
            const progressLabel = $('bpi-scan-progress-label');
            const subtitle = $('bpi-scan-status-text');

            try {
                // Update progress
                const updateProgress = (pct, label) => {
                    if (progressPath) progressPath.setAttribute('stroke-dasharray', `${pct}, 100`);
                    if (progressText) progressText.textContent = `${Math.round(pct)}%`;
                    if (progressLabel) progressLabel.textContent = label;
                };

                updateProgress(10, 'Starting OCR...');
                if (subtitle) subtitle.textContent = 'Reading text from image...';

                // Extract base64 from dataUrl
                const [header, base64] = dataUrl.split(',');
                const mimeType = header.match(/:(.*?);/)[1];

                // Check if Tesseract is available
                if (!window.Tesseract) {
                    console.error('[BPI Scanner] Tesseract.js not loaded');
                    throw new Error('OCR engine not available');
                }

                // Run Tesseract OCR
                updateProgress(20, 'Initializing...');
                const { data: { text } } = await window.Tesseract.recognize(
                    dataUrl,
                    'eng',
                    {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                const pct = 20 + Math.round(m.progress * 50);
                                updateProgress(pct, 'Reading text...');
                            }
                        }
                    }
                );

                console.log('[BPI Scanner] OCR Text:', text);

                updateProgress(75, 'Parsing...');
                if (subtitle) subtitle.textContent = 'Extracting transactions...';

                // Parse the OCR text using the local parser which strips headers and extracts balance
                const parsed = parseOCRTextLocal(text);
                window._bpiScanBalance = parsed.availableBalance || null;

                updateProgress(85, 'Matching...');
                if (subtitle) subtitle.textContent = 'Checking for duplicates...';

                // Get existing transactions
                const existingTxns = getExistingTransactions();

                // Combine InstaPay transactions with fees
                let transactions = combineInstapayTransactions(parsed.transactions || []);

                // Add merchant info and check sync status
                transactions = transactions.map(txn => {
                    const merchantInfo = getMerchantInfo(txn.merchant);
                    const synced = isTransactionSynced(txn.merchant, txn.amount, txn.date, existingTxns);

                    return {
                        _id: `scan_${Date.now()}_${Math.random()}`,
                        merchant: txn.merchant,
                        date: txn.date || new Date().toISOString().split('T')[0],
                        amount: txn.amount,
                        type: txn.type || 'debit',
                        synced: synced,
                        dismissed: false,
                        category: txn.category || merchantInfo.category,
                        icon: txn.icon || merchantInfo.icon,
                        iconClass: merchantInfo.class,
                        note: txn.note
                    };
                });

                // Store results
                window._bpiScanResults = transactions;

                updateProgress(100, 'Complete!');
                const newCount = transactions.filter(t => !t.synced).length;
                if (subtitle) {
                    subtitle.textContent = `Found ${transactions.length} transactions · ${newCount} new`;
                }

                // Hide animation
                setTimeout(() => {
                    const animOverlay = $('bpi-scan-animation-overlay');
                    if (animOverlay) animOverlay.style.display = 'none';
                }, 800);

                // Render results
                renderRealResults(transactions);

            } catch (err) {
                console.error('[BPI Scanner] Scan error:', err);
                if (subtitle) subtitle.textContent = 'Scan failed - ' + err.message;

                // Hide animation
                setTimeout(() => {
                    const animOverlay = $('bpi-scan-animation-overlay');
                    if (animOverlay) animOverlay.style.display = 'none';
                }, 500);
            }
        }

        // Enhanced OCR parser - distinguishes title from subtitle using block-based parsing
        // FIX DATE: 2026-06-29
        // FIX SPEC: Switched to block-based parser. Each block represents a transaction card, 
        // ending with the Amount line. This prevents text bleeding across different transactions.
        // It also prints the segmented blocks with dividers in the console for readability.
        // It detects and extracts the Savings Account available balance and strips header noise lines.
        // [FIXED: 2026-06-29] Enhanced to skip standalone date headers that should not become transactions
        function parseOCRTextLocal(text) {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            const transactions = [];
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            let currentDate = null;
            let availableBalance = null;

            // Extract savings account balance from raw text block
            const balMatch = text.match(/(?:SAVINGS\s*ACCOUNT|Available\s*balance)\s*[-−]?\s*(?:PHP|₱|P)?\s*([\d,]+\.\d{2})/i);
            if (balMatch) {
                availableBalance = parseFloat(balMatch[1].replace(/,/g, ''));
                console.log('[BPI Scanner] Extracted available balance:', availableBalance);
            }

            let accumulatedLines = [];
            const dividerLog = [];

            console.log('[BPI Scanner] Starting block-based OCR parsing on lines:', lines.length);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Skip status bar noise (e.g. times "11:55", battery "93%", signals "LTE", "VoLTE", network symbols)
                if (/\b\d{1,2}:\d{2}\b/.test(line) ||
                    /\b\d{1,3}%\b/.test(line) ||
                    /\b(?:LTE|VoLTE|WiFi|4G|5G|AM|PM)\b/i.test(line) ||
                    // Skip general navigation text, headers, and account number lines
                    /deposit\s*accounts|savings\s*account|available\s*balance|transaction\s*history|show\s*running\s*balance|recent\s*transactions|balance|^\d{8,12}$/i.test(line)) {
                    continue;
                }

                // [FIXED: 2026-06-29] Check if the line is a date header (e.g., "JUN 24", "JUL 01", "Jul 01", "JUL O01")
                // These are visual dividers in the BPI app and should NOT become transaction merchants
                // Also handle OCR errors like "O" instead of "0" in dates
                const dateMatch = line.match(/^([A-Z]{3})\s+([O0]\d{1}|\d{1,2})$/i);
                if (dateMatch) {
                    const monthStr = dateMatch[1].toUpperCase();
                    const monthIdx = months.indexOf(monthStr);
                    if (monthIdx >= 0) {
                        // Fix OCR error: replace O with 0 in day number
                        let dayStr = dateMatch[2].replace(/O/gi, '0');
                        const year = new Date().getFullYear();
                        const month = String(monthIdx + 1).padStart(2, '0');
                        const day = String(parseInt(dayStr, 10)).padStart(2, '0');
                        currentDate = `${year}-${month}-${day}`;
                        console.log('[BPI Scanner] Updated current date header:', currentDate, '- skipping from transaction content');
                        
                        // Clear any accumulated lines since date headers start a new section
                        accumulatedLines = [];
                        continue; // Skip date header from being accumulated in transaction content
                    }
                }

                // Check if this line is an amount line or starts with "Amount"
                const amountMatch = line.match(/[-−]?\s*(?:PHP|₱|P)\s*([\d,]+\.\d{2})/i);

                let isAmountLine = false;
                let parsedAmount = null;

                if (amountMatch) {
                    parsedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                    isAmountLine = true;
                } else if (/^amount$/i.test(line)) {
                    isAmountLine = true;
                    if (i + 1 < lines.length) {
                        const nextLine = lines[i + 1];
                        const nextAmountMatch = nextLine.match(/[-−]?\s*(?:PHP|₱|P)?\s*([\d,]+\.\d{2})/i);
                        if (nextAmountMatch) {
                            parsedAmount = parseFloat(nextAmountMatch[1].replace(/,/g, ''));
                            i++; // consume next line containing the value
                        }
                    }
                }

                if (isAmountLine) {
                    // Process accumulated block lines
                    if (parsedAmount !== null && parsedAmount > 0 && parsedAmount < 100000) {
                        // Skip if this parsed amount is actually the Savings Account balance header
                        if (availableBalance !== null && Math.abs(parsedAmount - availableBalance) < 0.01) {
                            console.log('[BPI Scanner] Skipping transaction because it matches available balance:', parsedAmount);
                            accumulatedLines = [];
                            continue;
                        }

                        // Clean noise lines
                        const cleanAccumulated = accumulatedLines.filter(l => {
                            if (/^(amount|balance|php|total|₱|p|debit|credit|available|current)$/i.test(l)) return false;
                            if (l.length < 2) return false;
                            if (/^\d+$/.test(l)) return false;
                            // [FIXED: 2026-06-29] Filter out malformed date strings like "JUL O01", "JUN 28", etc.
                            if (/^[A-Z]{3}\s+[O0]?\d{1,2}$/i.test(l)) return false;
                            return true;
                        });

                        let merchant = 'Transaction';
                        let note = null;

                        if (cleanAccumulated.length > 0) {
                            merchant = cleanAccumulated[0];
                            if (cleanAccumulated.length > 1) {
                                note = cleanAccumulated.slice(1).join(' ');
                            }
                        }

                        // Keep InstaPay text distinct for combiner logic.
                        // For purchases, clean up "Purchase - BN @MR DIY Z" to "MR DIY Z"
                        let cleanMerchant = merchant;
                        if (/^PURCHASE\s*-?\s*(BN\s*@)?/i.test(cleanMerchant)) {
                            cleanMerchant = cleanMerchant.replace(/^PURCHASE\s*-?\s*(BN\s*@)?/i, '').trim();
                        }

                        transactions.push({
                            merchant: cleanMerchant,
                            amount: parsedAmount,
                            date: currentDate || new Date().toISOString().split('T')[0],
                            type: 'debit',
                            note: note ? note.trim() : null
                        });

                        // Push log representation with dividers as requested
                        dividerLog.push(cleanMerchant);
                        if (note) dividerLog.push(note.trim());
                        dividerLog.push(`Amount    -${parsedAmount}`);
                        dividerLog.push('---------------------');
                    }
                    // Reset accumulated lines for next block
                    accumulatedLines = [];
                } else {
                    accumulatedLines.push(line);
                }
            }

            // Print the segmented blocks with dividers
            if (dividerLog.length > 0) {
                console.log('[BPI Scanner Agent Log]\n' + dividerLog.join('\n'));
            }

            console.log('[BPI Scanner] Total parsed transactions:', transactions.length);
            return { transactions, availableBalance };
        }

        // Render actual scanned results
        // [FIXED: 2026-06-29] Added date dividers between transactions with different dates
        function renderRealResults(transactions) {
            const resultsList = $('bpi-scan-results-list');
            const resultsTitle = $('bpi-scan-results-title');
            const resultsSubtitle = $('bpi-scan-results-subtitle');

            if (!resultsList) return;

            const unsyncedItems = transactions.filter(t => !t.synced && !t.dismissed);
            const syncedItems = transactions.filter(t => t.synced);

            // Update header
            if (resultsTitle) resultsTitle.textContent = `${unsyncedItems.length} New · ${syncedItems.length} Synced`;
            if (resultsSubtitle) resultsSubtitle.textContent = unsyncedItems.length ? 'Tap ✓ to add transaction' : 'All transactions synced';

            let html = '';

            // Render available balance divider banner with wallet comparison insight
            // FIX DATE: 2026-06-29
            // FIX SPEC: Shows scanned BPI balance vs Smart Wallet tracked balance with color-coded difference
            if (window._bpiScanBalance !== null && window._bpiScanBalance !== undefined) {
                const scannedBal = window._bpiScanBalance;
                const scannedBalFormatted = scannedBal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // [FIXED: 2026-06-29] Read Smart Wallet BPI balance from DOM element data-raw attribute
                let walletBal = null;
                const walletBalEl = document.querySelector('.balance-card[data-account="bpi"] .balance-amount');
                if (walletBalEl) {
                    const rawText = walletBalEl.getAttribute('data-raw') || walletBalEl.textContent;
                    const numMatch = rawText.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
                    walletBal = parseFloat(numMatch);
                    if (isNaN(walletBal)) walletBal = null;
                }

                // Build insight row comparing balances
                let insightHTML = '';
                if (walletBal !== null) {
                    const walletBalFormatted = walletBal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const diff = scannedBal - walletBal;
                    const absDiff = Math.abs(diff);
                    const diffFormatted = absDiff.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    let diffIcon, diffColor, diffLabel;
                    if (absDiff < 1) {
                        // Balances match
                        diffIcon = 'check_circle';
                        diffColor = '#16a34a';
                        diffLabel = 'Balances match';
                    } else if (diff > 0) {
                        // BPI has more than wallet tracks (unrecorded income?)
                        diffIcon = 'arrow_upward';
                        diffColor = '#16a34a';
                        diffLabel = `+₱${diffFormatted} above wallet`;
                    } else {
                        // BPI has less than wallet tracks (unrecorded expense?)
                        diffIcon = 'arrow_downward';
                        diffColor = '#dc2626';
                        diffLabel = `-₱${diffFormatted} below wallet`;
                    }

                    insightHTML = `
                        <div class="bpi-balance-insight-row">
                            <div class="bpi-balance-insight-item">
                                <span class="bpi-balance-insight-label">Smart Wallet</span>
                                <span class="bpi-balance-insight-value">₱${walletBalFormatted}</span>
                            </div>
                            <div class="bpi-balance-insight-diff" style="color: ${diffColor};">
                                <i class="material-icons" style="font-size: 14px;">${diffIcon}</i>
                                <span>${diffLabel}</span>
                            </div>
                        </div>
                    `;
                }

                html += `
                    <div class="bpi-scan-balance-divider">
                        <div class="bpi-balance-header-row">
                            <span class="bpi-balance-label"><i class="material-icons" style="font-size: 14px; vertical-align: middle;">account_balance</i> BPI ACCOUNT BALANCE</span>
                            <span class="bpi-scan-divider-val">₱${scannedBalFormatted}</span>
                        </div>
                        ${insightHTML}
                    </div>
                `;
            }

            // All synced message
            if (unsyncedItems.length === 0 && transactions.length > 0) {
                html += `
                    <div class="bpi-scan-all-synced">
                        <i class="material-icons">check_circle</i>
                        <div class="bpi-scan-all-synced-title">All Synced!</div>
                        <div class="bpi-scan-all-synced-subtitle">Every transaction is already in your wallet</div>
                    </div>
                `;
            }

            // [FIXED: 2026-06-29] Group transactions by date and add date dividers
            const renderTransactionsWithDividers = (txnList, isSynced) => {
                let lastDate = null;
                txnList.forEach(txn => {
                    const txnDate = txn.date;
                    
                    // Add date divider if date changed
                    if (txnDate !== lastDate) {
                        const dateDisplay = formatDateDivider(txnDate);
                        html += `
                            <div class="bpi-date-divider">
                                <span class="bpi-date-divider-text">${dateDisplay}</span>
                            </div>
                        `;
                        lastDate = txnDate;
                    }
                    
                    html += buildTransactionCardReal(txn, isSynced);
                });
            };

            // Helper to format date divider text (e.g., "JULY 01")
            const formatDateDivider = (dateStr) => {
                if (!dateStr) return 'UNKNOWN DATE';
                
                const monthNames = [
                    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
                    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
                ];
                
                // Parse YYYY-MM-DD format
                const parts = String(dateStr).split('-');
                if (parts.length === 3) {
                    const monthNum = parseInt(parts[1], 10);
                    const dayNum = parseInt(parts[2], 10);
                    if (monthNum >= 1 && monthNum <= 12) {
                        return `${monthNames[monthNum - 1]} ${String(dayNum).padStart(2, '0')}`;
                    }
                }
                
                return dateStr.toUpperCase();
            };

            // Render new transactions with date dividers
            renderTransactionsWithDividers(unsyncedItems, false);

            // Render synced transactions with date dividers
            renderTransactionsWithDividers(syncedItems, true);

            // Empty state
            if (transactions.length === 0) {
                html = `
                    <div class="bpi-scan-empty">
                        <i class="material-icons">receipt_long</i>
                        <div class="bpi-scan-empty-title">No transactions found</div>
                        <div class="bpi-scan-empty-subtitle">Try a clearer screenshot</div>
                    </div>
                `;
            }
            resultsList.innerHTML = html;
            attachRealListeners();
        }

        // Render shimmer skeleton loader in results panel while OCR is running
        // FIX DATE: 2026-06-29
        // FIX SPEC: Renders pulsing skeleton layout for balance header and transaction list cards
        function showSkeletonLoader() {
            const resultsList = $('bpi-scan-results-list');
            const resultsTitle = $('bpi-scan-results-title');
            const resultsSubtitle = $('bpi-scan-results-subtitle');

            if (resultsTitle) resultsTitle.textContent = 'Scanning...';
            if (resultsSubtitle) resultsSubtitle.textContent = 'Analyzing screenshot';

            if (!resultsList) return;

            resultsList.innerHTML = `
                <!-- Skeleton Balance Card -->
                <div class="bpi-skeleton-card bpi-skeleton-balance">
                    <div class="bpi-skeleton-icon-wrapper">
                        <div class="bpi-skeleton-icon"></div>
                    </div>
                    <div class="bpi-skeleton-info">
                        <div class="bpi-skeleton-line short"></div>
                    </div>
                    <div class="bpi-skeleton-amount"></div>
                </div>
                
                <!-- Skeleton Transaction Cards -->
                <div class="bpi-skeleton-card">
                    <div class="bpi-skeleton-avatar"></div>
                    <div class="bpi-skeleton-info">
                        <div class="bpi-skeleton-line medium"></div>
                        <div class="bpi-skeleton-line short"></div>
                    </div>
                    <div class="bpi-skeleton-amount"></div>
                </div>
                <div class="bpi-skeleton-card">
                    <div class="bpi-skeleton-avatar"></div>
                    <div class="bpi-skeleton-info">
                        <div class="bpi-skeleton-line long"></div>
                        <div class="bpi-skeleton-line short"></div>
                    </div>
                    <div class="bpi-skeleton-amount"></div>
                </div>
                <div class="bpi-skeleton-card">
                    <div class="bpi-skeleton-avatar"></div>
                    <div class="bpi-skeleton-info">
                        <div class="bpi-skeleton-line medium"></div>
                        <div class="bpi-skeleton-line short"></div>
                    </div>
                    <div class="bpi-skeleton-amount"></div>
                </div>
            `;
        }

        // Build transaction card HTML
        // FIX DATE: 2026-06-28
        // FIX SPEC: Reformatted date display using month name (e.g. "June 24"), and structured elements
        function buildTransactionCardReal(txn, isSynced) {
            const formatTransactionDate = (dateStr) => {
                if (!dateStr) return '—';

                // Replace dots with slashes for standard parsing
                let cleanStr = String(dateStr).replace(/\./g, '/');
                const monthNames = [
                    "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                ];

                // Format 1: YYYY-MM-DD
                const partsYMD = cleanStr.split('-');
                if (partsYMD.length === 3) {
                    const monthNum = parseInt(partsYMD[1], 10);
                    const dayNum = parseInt(partsYMD[2], 10);
                    if (monthNum >= 1 && monthNum <= 12) {
                        return `${monthNames[monthNum - 1]} ${dayNum}`;
                    }
                }

                // Format 2: MM/DD
                const partsMD = cleanStr.split('/');
                if (partsMD.length === 2) {
                    const monthNum = parseInt(partsMD[0], 10);
                    const dayNum = parseInt(partsMD[1], 10);
                    if (monthNum >= 1 && monthNum <= 12) {
                        return `${monthNames[monthNum - 1]} ${dayNum}`;
                    }
                }

                // Fallback to JS Date object
                const d = new Date(cleanStr);
                if (!isNaN(d)) {
                    return `${monthNames[d.getMonth()]} ${d.getDate()}`;
                }

                return dateStr;
            };

            const dateDisplay = formatTransactionDate(txn.date);
            const statusClass = isSynced ? 'synced' : 'new';
            const isRecentlyAdded = txn.recentlyAdded === true;

            return `
                <div class="bpi-txn-card ${statusClass}" data-id="${txn._id}">
                    <div class="bpi-txn-icon ${txn.iconClass || ''}">
                        <i class="material-icons">${txn.icon}</i>
                    </div>
                    <div class="bpi-txn-info">
                        <div class="bpi-txn-merchant">${txn.merchant}</div>
                        <div class="bpi-txn-meta">
                            <span>${dateDisplay}</span>
                            <span class="bpi-txn-category">${txn.category}</span>
                        </div>
                        ${txn.note ? `<div class="bpi-txn-note" style="color: ${window.getTxnNoteColor ? window.getTxnNoteColor(txn.category) : '#64748b'};">${txn.note}</div>` : ''}
                    </div>
                    <div class="bpi-txn-amount">₱${txn.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    ${!isSynced ? `
                        <div class="bpi-txn-actions">
                            <button class="bpi-txn-btn bpi-txn-btn-check" data-action="accept" data-id="${txn._id}">
                                <i class="material-icons">check</i>
                            </button>
                            <button class="bpi-txn-btn bpi-txn-btn-x" data-action="reject" data-id="${txn._id}">
                                <i class="material-icons">close</i>
                            </button>
                        </div>
                    ` : `
                        <div class="bpi-txn-status ${isRecentlyAdded ? 'undoable' : ''}" data-action="${isRecentlyAdded ? 'undo' : ''}" data-id="${txn._id}">
                            <i class="material-icons">check</i>
                            SYNCED
                        </div>
                    `}
                </div>
            `;
        }

        // Track number of transactions being added simultaneously
        let pendingAddCount = 0;

        // Attach event listeners
        function attachRealListeners() {
            const resultsList = $('bpi-scan-results-list');
            if (!resultsList) return;

            // Accept buttons
            // [FIXED: 2026-06-28] Wrapped the Firestore accept logic inside the correct querySelectorAll loop to resolve reference/syntax crash
            // [FIXED: 2026-06-29] Added animation and toast notifications when adding transactions
            // [FIXED: 2026-06-29] Added card color fade animation to green
            resultsList.querySelectorAll('[data-action="accept"]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const txn = window._bpiScanResults?.find(t => t._id === id);
                    if (!txn) return;

                    // Get the card element
                    const card = btn.closest('.bpi-txn-card');
                    if (card) {
                        card.classList.add('accepting');
                    }

                    // [FIXED: 2026-06-28] Added transaction saving to Firestore bpi_transactions collection with local optimistic updates
                    console.log('[BPI Scanner] Syncing accepted transaction:', txn);

                    try {
                        const fm = window.FirebaseModule || {};
                        const db = fm.db || window.db;
                        const auth = fm.auth || window.auth;
                        const addDoc = fm.addDoc || window.addDoc;
                        const collection = fm.collection || window.collection;
                        const serverTimestamp = fm.serverTimestamp || window.serverTimestamp;

                        if (!auth || !auth.currentUser) {
                            if (typeof showToast === 'function') showToast('Please sign in to save transactions');
                            if (card) card.classList.remove('accepting');
                            return;
                        }
                        const uid = auth.currentUser.uid;

                        // Add animation to the button
                        btn.classList.add('adding');
                        btn.disabled = true;

                        // Increment pending count
                        pendingAddCount++;

                        const data = {
                            amount: txn.amount,
                            manualAmount: txn.amount,
                            merchant: txn.merchant,
                            category: txn.category || 'Shopping',
                            manualCategory: txn.category || 'Shopping',
                            date: txn.date,
                            type: 'debit',
                            note: txn.note || '',
                            excluded: false,
                            manualBudgetCategory: 'n/a',
                            budgetSplit: null
                        };

                        // Add to Firestore
                        const newDocRef = await addDoc(collection(db, "users", uid, "bpi_transactions"), {
                            ...data,
                            createdAt: serverTimestamp()
                        });

                        console.log('[BPI Scanner] Transaction saved to Firestore with ID:', newDocRef.id);

                        // Optimistic local state update
                        const txnRecord = {
                            id: newDocRef.id,
                            ...data,
                            createdAtMs: Date.now()
                        };

                        const upsertTxn = (items, tRecord) => {
                            const list = Array.isArray(items) ? [...items] : [];
                            const idx = list.findIndex(item => item.id === tRecord.id);
                            if (idx >= 0) list[idx] = { ...list[idx], ...tRecord };
                            else list.unshift(tRecord);
                            return list.sort((a, b) => new Date(b.date) - new Date(a.date));
                        };

                        if (window.walletTxns) {
                            window.walletTxns.bpi = upsertTxn(window.walletTxns.bpi || [], txnRecord);
                        }

                        if (window.currentAccount === 'bpi') {
                            window.allTxns = upsertTxn(window.allTxns || [], txnRecord);
                            if (window.renderHistory) window.renderHistory(window.allTxns);
                            if (window.filterTxnList) window.filterTxnList();
                            if (window.updateBalanceToThisMonth) window.updateBalanceToThisMonth(window.allTxns, 'bpi');
                            if (window.updateInsightCards) window.updateInsightCards(window.allTxns);
                            if (window.renderCalendar) window.renderCalendar();
                        }

                        txn.synced = true;
                        txn.recentlyAdded = true; // Mark as recently added so it can be undone
                        txn.firestoreId = newDocRef.id; // Store Firestore ID for undo

                        // Wait for animation to complete before re-rendering
                        await new Promise(resolve => setTimeout(resolve, 600));

                        renderRealResults(window._bpiScanResults);

                        // Decrement pending count and show appropriate toast
                        pendingAddCount--;
                        if (pendingAddCount === 0) {
                            // Show toast based on how many transactions were added
                            const totalAdded = window._bpiScanResults?.filter(t => t.synced).length || 0;
                            const recentlyAdded = totalAdded; // In this context, all synced are recently added
                            
                            if (recentlyAdded === 1) {
                                if (typeof showToast === 'function') showToast('✓ Added 1 transaction');
                            } else if (recentlyAdded > 1) {
                                if (typeof showToast === 'function') showToast(`✓ Added ${recentlyAdded} transactions`);
                            }
                        }

                        if (window.updateTripleProgressBar) window.updateTripleProgressBar();
                        if (window.syncWidgets) window.syncWidgets();
                        if (window.quickReloadAccordions) window.quickReloadAccordions();

                    } catch (e) {
                        console.error('[BPI Scanner] Sync error:', e);
                        if (typeof showToast === 'function') showToast('Failed to sync transaction');
                        btn.disabled = false;
                        btn.classList.remove('adding');
                        if (card) card.classList.remove('accepting');
                        pendingAddCount = Math.max(0, pendingAddCount - 1);
                    }
                });
            });

            // Reject buttons
            // [FIXED: 2026-06-29] Added card color fade animation to red
            resultsList.querySelectorAll('[data-action="reject"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    const txn = window._bpiScanResults?.find(t => t._id === id);
                    if (txn) {
                        // Get the card element and add rejecting animation
                        const card = btn.closest('.bpi-txn-card');
                        if (card) {
                            card.classList.add('rejecting');
                        }

                        txn.dismissed = true;
                        
                        // Wait for animation to complete before re-rendering
                        setTimeout(() => {
                            renderRealResults(window._bpiScanResults);
                        }, 600);
                    }
                });
            });

            // Undo buttons for recently added transactions
            // [FIXED: 2026-06-29] Added undo functionality for recently synced transactions
            resultsList.querySelectorAll('.bpi-txn-status.undoable').forEach(statusBtn => {
                statusBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const id = statusBtn.dataset.id;
                    console.log('[BPI Scanner] Undo clicked for transaction ID:', id);
                    
                    const txn = window._bpiScanResults?.find(t => t._id === id);
                    if (!txn) {
                        console.error('[BPI Scanner] Transaction not found:', id);
                        return;
                    }
                    
                    if (!txn.recentlyAdded) {
                        console.error('[BPI Scanner] Transaction not marked as recently added');
                        return;
                    }

                    console.log('[BPI Scanner] Found transaction to undo:', txn);

                    // Confirm undo with modal
                    const confirmed = await window.showConfirmationModal(
                        'Undo Transaction',
                        'Undo this transaction? It will be removed from your wallet.'
                    );
                    
                    if (!confirmed) {
                        return;
                    }

                    try {
                        const fm = window.FirebaseModule || {};
                        const db = fm.db || window.db;
                        const auth = fm.auth || window.auth;
                        const deleteDoc = fm.deleteDoc || window.deleteDoc;
                        const doc = fm.doc || window.doc;

                        if (!auth || !auth.currentUser) {
                            if (typeof showToast === 'function') showToast('Please sign in');
                            return;
                        }
                        const uid = auth.currentUser.uid;

                        // Get the Firestore document ID from the transaction
                        const firestoreId = txn.firestoreId;
                        
                        if (!firestoreId) {
                            console.error('[BPI Scanner] No Firestore ID found on transaction');
                            if (typeof showToast === 'function') showToast('Cannot undo: Transaction ID not found');
                            return;
                        }

                        console.log('[BPI Scanner] Deleting Firestore document:', firestoreId);

                        // Delete from Firestore
                        await deleteDoc(doc(db, "users", uid, "bpi_transactions", firestoreId));

                        console.log('[BPI Scanner] Successfully deleted from Firestore');

                        // Remove from local state
                        if (window.walletTxns && window.walletTxns.bpi) {
                            window.walletTxns.bpi = window.walletTxns.bpi.filter(t => t.id !== firestoreId);
                            console.log('[BPI Scanner] Removed from walletTxns.bpi');
                        }

                        if (window.currentAccount === 'bpi' && window.allTxns) {
                            window.allTxns = window.allTxns.filter(t => t.id !== firestoreId);
                            console.log('[BPI Scanner] Removed from allTxns');
                            
                            if (window.renderHistory) window.renderHistory(window.allTxns);
                            if (window.filterTxnList) window.filterTxnList();
                            if (window.updateBalanceToThisMonth) window.updateBalanceToThisMonth(window.allTxns, 'bpi');
                            if (window.updateInsightCards) window.updateInsightCards(window.allTxns);
                            if (window.renderCalendar) window.renderCalendar();
                        }

                        // Mark as unsynced in scanner results
                        txn.synced = false;
                        txn.recentlyAdded = false;
                        delete txn.firestoreId;

                        console.log('[BPI Scanner] Rendering updated results');
                        renderRealResults(window._bpiScanResults);

                        if (typeof showToast === 'function') showToast('✓ Transaction removed');
                        if (window.updateTripleProgressBar) window.updateTripleProgressBar();
                        if (window.syncWidgets) window.syncWidgets();
                        if (window.quickReloadAccordions) window.quickReloadAccordions();

                    } catch (e) {
                        console.error('[BPI Scanner] Undo error:', e);
                        if (typeof showToast === 'function') showToast('Failed to undo: ' + e.message);
                    }
                });
            });
        }

        // Override close
        // FIX DATE: 2026-06-28
        // FIX SPEC: Reset stylesheet transform properties on close
        window.BPIScanner.close = function () {
            const overlay = $('bpi-scanner-overlay');
            if (overlay) overlay.classList.remove('bpi-scan-visible');

            const sheetContent = document.querySelector('.bpi-scanner-content');
            if (sheetContent) sheetContent.style.transform = '';

            // Clear image
            const img = $('bpi-scan-preview-img');
            if (img) {
                img.src = '';
                img.classList.remove('bpi-scan-done'); // [FIXED: 2026-06-28] Remove blur filter class on reset/close
                img.style.transform = ''; // [FIXED: 2026-06-28] Reset pinch-to-zoom translation/scale values
            }

            // Hide preview section
            const previewSection = $('bpi-scan-preview-section');
            if (previewSection) previewSection.style.display = 'none';

            // Hide animation
            const animOverlay = $('bpi-scan-animation-overlay');
            if (animOverlay) animOverlay.style.display = 'none';

            // Clear results
            const resultsList = $('bpi-scan-results-list');
            if (resultsList) resultsList.innerHTML = '';

            // Clear stored results
            window._bpiScanResults = null;

            if (window.NavState) window.NavState.popModalState('bpi-scanner-overlay');
        };
    }

    // Drag-down gesture logic to pull down and close the sheet
    // FIX DATE: 2026-06-28
    // FIX SPEC: Enabled mouse/touch drag handlers on the top handle area
    function initDragToClose() {
        const handleArea = document.querySelector('.bpi-sheet-handle-area');
        const sheetContent = document.querySelector('.bpi-scanner-content');
        if (!handleArea || !sheetContent) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const onStart = (e) => {
            startY = e.touches ? e.touches[0].clientY : e.clientY;
            isDragging = true;
            sheetContent.style.transition = 'none'; // Disable animations during manual drag
        };

        const onMove = (e) => {
            if (!isDragging) return;
            currentY = e.touches ? e.touches[0].clientY : e.clientY;
            const diffY = currentY - startY;
            if (diffY > 0) {
                sheetContent.style.transform = `translateY(${diffY}px)`;
            }
        };

        const onEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            const diffY = currentY - startY;

            sheetContent.style.transition = 'transform 0.3s cubic-bezier(0.32, 1.08, 0.58, 1)';

            if (diffY > 120) {
                // If pulled down far enough, close the scanner
                window.BPIScanner.close();
            } else {
                // Otherwise rebound/bounce back to top
                sheetContent.style.transform = 'translateY(0)';
            }
        };

        // Mouse bindings
        handleArea.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        // Touch bindings for mobile devices
        handleArea.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
    }

    // Pinch-to-zoom, drag-to-pan, and double-tap zoom for BPI screenshot preview image
    // FIX DATE: 2026-06-29
    // FIX SPEC: Consolidated all touch handlers into one coherent state machine.
    // Double-tap detection uses a 300ms window and defers isDragging until confirmed not a double-tap.
    // Pinch gestures scale 1x–4x. Drag pans within bounds when zoomed. Double-tap toggles 1x↔2.5x.
    function initPreviewInteractivity() {
        const container = $('bpi-scan-preview-container');
        const img = $('bpi-scan-preview-img');
        if (!container || !img) return;

        let scale = 1;
        let startX = 0, startY = 0;
        let translateX = 0, translateY = 0;
        let isDragging = false;
        let touchStartDist = 0;
        let startScale = 1;

        // Double-tap state tracking
        let lastTapTime = 0;
        let lastTapX = 0, lastTapY = 0;
        let tapTimeout = null;
        let pendingDragTouch = null; // [FIXED: 2026-06-29] Deferred drag start to avoid eating double-tap

        const updateTransform = () => {
            img.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
        };

        const getDistance = (t1, t2) => {
            return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        };

        const clampTranslation = () => {
            const parentRect = container.getBoundingClientRect();
            const maxW = (parentRect.width * (scale - 1)) / 2;
            const maxH = (parentRect.height * (scale - 1)) / 2;
            if (scale > 1) {
                translateX = Math.min(Math.max(translateX, -maxW), maxW);
                translateY = Math.min(Math.max(translateY, -maxH), maxH);
            } else {
                translateX = 0;
                translateY = 0;
            }
        };

        // ── DOUBLE TAP ZOOM HANDLER ──
        // [FIXED: 2026-06-29] Zooms to tapped coordinate with smooth CSS transition
        const doDoubleTapZoom = (tapX, tapY) => {
            if (scale === 1) {
                scale = 2.5;

                // Compute offset to center the tapped point
                const rect = container.getBoundingClientRect();
                const dx = (rect.width / 2 - tapX) * (scale - 1);
                const dy = (rect.height / 2 - tapY) * (scale - 1);
                const maxW = (rect.width * (scale - 1)) / 2;
                const maxH = (rect.height * (scale - 1)) / 2;
                translateX = Math.min(Math.max(dx, -maxW), maxW);
                translateY = Math.min(Math.max(dy, -maxH), maxH);
            } else {
                scale = 1;
                translateX = 0;
                translateY = 0;
            }

            // Animate the zoom transition smoothly
            img.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            updateTransform();

            // Clear transition after animation to keep drag snappy
            setTimeout(() => { img.style.transition = ''; }, 280);
        };

        // ── SINGLE touchstart: detect double-tap OR start drag ──
        const startDrag = (clientX, clientY) => {
            isDragging = true;
            startX = clientX - translateX;
            startY = clientY - translateY;
        };

        container.addEventListener('touchstart', (e) => {
            // Two-finger pinch start
            if (e.touches.length === 2) {
                if (tapTimeout) { clearTimeout(tapTimeout); tapTimeout = null; }
                touchStartDist = getDistance(e.touches[0], e.touches[1]);
                startScale = scale;
                isDragging = false;
                pendingDragTouch = null;
                return;
            }

            // Single finger
            if (e.touches.length === 1) {
                const now = Date.now();
                const touch = e.touches[0];
                const tapX = touch.clientX - container.getBoundingClientRect().left;
                const tapY = touch.clientY - container.getBoundingClientRect().top;

                // Check for double-tap (two taps within 300ms and 50px proximity)
                if (now - lastTapTime < 300 &&
                    Math.abs(tapX - lastTapX) < 50 &&
                    Math.abs(tapY - lastTapY) < 50) {
                    // It's a double tap!
                    e.preventDefault(); // Block native browser double-tap zoom
                    if (tapTimeout) { clearTimeout(tapTimeout); tapTimeout = null; }
                    pendingDragTouch = null;
                    isDragging = false;
                    lastTapTime = 0; // Reset so triple-tap doesn't re-trigger
                    doDoubleTapZoom(tapX, tapY);
                    return;
                }

                // Record this tap
                lastTapTime = now;
                lastTapX = tapX;
                lastTapY = tapY;

                // Defer drag start by a tiny amount so double-tap has priority
                // But if already zoomed in, start dragging immediately for responsiveness
                if (scale > 1) {
                    startDrag(touch.clientX, touch.clientY);
                    pendingDragTouch = null;
                } else {
                    pendingDragTouch = { clientX: touch.clientX, clientY: touch.clientY };
                    isDragging = false;
                }
            }
        }, { passive: false }); // [FIXED: 2026-06-29] passive:false needed for e.preventDefault on double-tap

        // ── touchmove: pinch-zoom or pan ──
        container.addEventListener('touchmove', (e) => {
            // Two-finger pinch zoom
            if (e.touches.length === 2 && touchStartDist > 0) {
                if (e.cancelable) e.preventDefault();
                const dist = getDistance(e.touches[0], e.touches[1]);
                const ratio = dist / touchStartDist;
                scale = Math.min(Math.max(startScale * ratio, 1), 4);
                clampTranslation();
                updateTransform();
                return;
            }

            // Single finger drag/pan
            if (e.touches.length === 1) {
                // If we had a pending drag (deferred from touchstart), activate it now on first move
                if (pendingDragTouch && !isDragging) {
                    startDrag(pendingDragTouch.clientX, pendingDragTouch.clientY);
                    pendingDragTouch = null;
                }

                if (!isDragging) return;

                if (scale > 1 && e.cancelable) {
                    e.preventDefault(); // Lock parent sheet scroll while panning zoomed image
                }

                translateX = e.touches[0].clientX - startX;
                translateY = e.touches[0].clientY - startY;
                clampTranslation();
                updateTransform();
            }
        }, { passive: false });

        // ── touchend ──
        container.addEventListener('touchend', () => {
            isDragging = false;
            touchStartDist = 0;
            pendingDragTouch = null;
        });

        // ── Mouse events for desktop/simulator ──
        container.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
            img.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            clampTranslation();
            updateTransform();
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            img.style.cursor = 'grab';
        });

        // ── Desktop double-click to zoom ──
        let lastClickTime = 0;
        container.addEventListener('click', (e) => {
            const now = Date.now();
            if (now - lastClickTime < 300) {
                const rect = container.getBoundingClientRect();
                doDoubleTapZoom(e.clientX - rect.left, e.clientY - rect.top);
            }
            lastClickTime = now;
        });
    }

    // Drag-down gesture logic to pull down and close the sheet
    // FIX DATE: 2026-06-28
    // FIX SPEC: Enabled mouse/touch drag handlers on the top handle area
    function initDragToClose() {
        const handleArea = document.querySelector('.bpi-sheet-handle-area');
        const sheetContent = document.querySelector('.bpi-scanner-content');
        if (!handleArea || !sheetContent) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const onStart = (e) => {
            startY = e.touches ? e.touches[0].clientY : e.clientY;
            isDragging = true;
            sheetContent.style.transition = 'none'; // Disable animations during manual drag
        };

        const onMove = (e) => {
            if (!isDragging) return;
            currentY = e.touches ? e.touches[0].clientY : e.clientY;
            const diffY = currentY - startY;
            if (diffY > 0) {
                sheetContent.style.transform = `translateY(${diffY}px)`;
            }
        };

        const onEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            const diffY = currentY - startY;

            sheetContent.style.transition = 'transform 0.3s cubic-bezier(0.32, 1.08, 0.58, 1)';

            if (diffY > 120) {
                // If pulled down far enough, close the scanner
                window.BPIScanner.close();
            } else {
                // Otherwise rebound/bounce back to top
                sheetContent.style.transform = 'translateY(0)';
            }
        };

        // Mouse bindings
        handleArea.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        // Touch bindings for mobile devices
        handleArea.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
    }

    // Initialize gesture and preview interactivity listeners
    // FIX DATE: 2026-06-28
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initDragToClose();
            initPreviewInteractivity();
        });
    } else {
        initDragToClose();
        initPreviewInteractivity();
    }

    console.log('[BPI Scanner Enhanced] Loaded - Real OCR, Interactivity and Swipe-to-Close enabled');
})();
