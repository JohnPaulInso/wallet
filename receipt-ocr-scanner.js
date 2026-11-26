// (2026-07-13) Receipt & Order Screenshot OCR Scanner (Multi-engine + BBox); prev: basic regex
(function () {
    const SUB_CAT_HINTS = [
        { id: 'shipping', keys: ['shipping', 'delivery', 'home delivery', 'sf', 'freight'] },
        { id: 'drinks', keys: ['water', 'juice', 'milk', 'coffee', 'tea', 'soda', 'cola', 'coke', 'pepsi', 'pocari', 'gatorade', 'beer', 'wine', 'drink', 'yakult', 'milo', 'nescafe', 'latte'] },
        { id: 'snacks', keys: ['chip', 'snack', 'cookie', 'biscuit', 'chocolate', 'candy', 'cracker', 'cake', 'donut', 'pastry', 'bread', 'wafer', 'nuts', 'popcorn', 'ice cream', 'piattos', 'nova', 'oreo'] },
        { id: 'food', keys: ['rice', 'chicken', 'pork', 'beef', 'fish', 'egg', 'meat', 'veg', 'fruit', 'apple', 'banana', 'tomato', 'onion', 'garlic', 'noodle', 'pasta', 'sauce', 'oil', 'canned', 'tuna', 'sardine', 'hotdog', 'ham', 'cheese', 'butter', 'tofu', 'meal', 'burger', 'pizza'] },
        { id: 'essentials', keys: ['soap', 'shampoo', 'toothpaste', 'tissue', 'detergent', 'bleach', 'dishwash', 'cleaner', 'diaper', 'wipes', 'lotion', 'deodorant', 'brush', 'towel', 'battery', 'trash', 'paper', 'sponge', 'alcohol', 'sanitizer', 'medicine', 'vitamin', 'straw', 'cleaning'] },
        { id: 'gear', keys: ['bag', 'backpack', 'shoe', 'shirt', 'short', 'pant', 'jacket', 'cap', 'hat', 'sock', 'watch', 'cable', 'charger', 'case', 'phone', 'fan', 'bottle', 'tumbler', 'lamp', 'mat', 'ball', 'racket', 'toy', 'lego', 'headphone', 'earphone', 'mouse', 'keyboard', 'adapter', 'decathlon', 'quechua', 'arpenaz', 'foldable', 'wrench', 'tool'] }
    ];

    function guessSubCategory(name) {
        const low = String(name || '').toLowerCase();
        for (const group of SUB_CAT_HINTS) {
            if (group.keys.some(k => low.includes(k))) return group.id;
        }
        return 'other';
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function preprocessImageForOCR(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const scale = img.width < 1200 ? 2 : 1;
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.filter = 'contrast(1.35) grayscale(1)';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
            };
            img.onerror = () => resolve({ dataUrl, width: 1000, height: 1000 });
            img.src = dataUrl;
        });
    }

    async function extractWithGemini(dataUrl) {
        const apiKey = window.CONFIG?.GEMINI_API_KEY;
        const model = window.CONFIG?.MODEL || 'gemini-2.5-flash';
        if (!apiKey) return null;

        const base64Data = dataUrl.split(',')[1];
        const mimeType = dataUrl.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
        // (2026-07-13) Paper receipt weighted-item & lineTotal rules; prev: per-kg misread
        const prompt = `Extract all purchased items and shipping/delivery fee from this paper receipt or order screenshot. Return ONLY valid JSON:
{
  "items": [
    { "name": string, "qty": number, "unitPrice": number, "lineTotal": number, "subCategory": "food"|"drinks"|"snacks"|"essentials"|"gear"|"shipping"|"other" }
  ]
}
Rules:
- "lineTotal" MUST be the exact final price printed on the right for that item (e.g. 4.66, 1.32, 3.97).
- For weighted items (e.g. "0.778kg NET @ $5.99/kg" with line price "$4.66"): ALWAYS set "qty": 1, "unitPrice": 4.66, "lineTotal": 4.66 (use the exact charged line price, NEVER the per-kg/lb rate). You may append weight to name like "Zucchini Green (0.78kg)".
- For integer multi-qty items (e.g. "2 x 50.00 = 100.00"), set "qty": 2, "unitPrice": 50, "lineTotal": 100.
- Include shipping/delivery fee as an item named "Shipping Fee" with subCategory "shipping" if shown.
- If a strikethrough old price and a sale price appear (like Shopee), use ONLY the final sale price.
- Ignore SUBTOTAL, TOTAL, CASH, CHANGE, TAX, VAT, LOYALTY/negative discounts, "Write a review", "Chat", "View Shop", and addresses.
- Keep item names concise (max 45 chars).`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            })
        });
        if (!res.ok) throw new Error('Gemini ' + res.status);
        const json = await res.json();
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned);
    }

    async function extractWithOpenAI(dataUrl) {
        const apiKey = window.CONFIG?.OPENAI_API_KEY;
        const model = window.CONFIG?.OPENAI_MODEL || 'gpt-4o-mini';
        if (!apiKey) return null;

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                response_format: { type: 'json_object' },
                messages: [{
                    role: 'user',
                    content: [
                        // (2026-07-13) Paper receipt weighted-item & lineTotal rules; prev: per-kg misread
                        { type: 'text', text: 'Extract all purchased items and shipping/delivery fee from this paper receipt or screenshot as JSON: {"items":[{"name":string,"qty":number,"unitPrice":number,"lineTotal":number,"subCategory":"food"|"drinks"|"snacks"|"essentials"|"gear"|"shipping"|"other"}]}. For weighted items (kg/g/lb @ rate/kg), ALWAYS set qty:1 and unitPrice & lineTotal to the exact charged line price on the right, NEVER the per-kg rate. Ignore SUBTOTAL, TOTAL, CASH, CHANGE, TAX, and negative loyalty/discount lines. Use final sale price (ignore strikethrough). Keep names under 45 chars.' },
                        { type: 'image_url', image_url: { url: dataUrl } }
                    ]
                }],
                max_tokens: 700
            })
        });
        if (!res.ok) throw new Error('OpenAI ' + res.status);
        const json = await res.json();
        return JSON.parse(json?.choices?.[0]?.message?.content || '{}');
    }

    function parsePriceToken(raw) {
        const cleaned = String(raw || '').replace(/^(?:PHP|₱|P|F|R|B|£|¥|€|\$)+/i, '').replace(/,/g, '').trim();
        if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
        const val = parseFloat(cleaned);
        return (Number.isFinite(val) && val > 0 && val < 500000) ? val : null;
    }

    async function extractWithTesseract(dataUrl) {
        if (!window.Tesseract) throw new Error('OCR engine not loaded');
        const prep = await preprocessImageForOCR(dataUrl);
        const result = await window.Tesseract.recognize(prep.dataUrl, 'eng');
        const words = (result?.data?.words || []).filter(w => w && w.text && w.text.trim());
        const imgW = prep.width || 1000;

        // Group words into visual rows by vertical midpoint
        const rows = [];
        const sorted = [...words].sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2));
        for (const w of sorted) {
            const cy = (w.bbox.y0 + w.bbox.y1) / 2;
            const h = Math.max(12, w.bbox.y1 - w.bbox.y0);
            let row = rows.find(r => Math.abs(r.cy - cy) <= Math.max(14, h * 0.85));
            if (!row) {
                row = { cy, words: [] };
                rows.push(row);
            }
            row.words.push(w);
        }
        rows.forEach(r => r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0));

        const items = [];
        let pendingName = '';
        // (2026-07-13) Ignore paper receipt totals, cash, change & weight lines; prev: online only
        const ignoreRowRe = /^(products|price|quantity|total\s*price|write\s*a\s*review|chat|view\s*shop|parcel\s*has\s*been|completed|order\s*total|subtotal|sub\s*total|grand\s*total|total\b|cash\b|change\b|loyalty|discount|tax\b|vat\b|date\b|billing|payment|feedback|john\s*paul|purok|bogo\s*city|philippines|\d+(?:\.\d+)?\s*(?:kg|g|lb|oz)\b)/i;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fullText = row.words.map(w => w.text).join(' ').trim();
            if (!fullText || ignoreRowRe.test(fullText)) continue;

            const leftWords = row.words.filter(w => w.bbox.x0 < imgW * 0.56);
            const rightWords = row.words.filter(w => w.bbox.x0 >= imgW * 0.54);
            const leftText = leftWords.map(w => w.text).join(' ').replace(/[|_~]+/g, '').trim();

            // Quantity-only line (Shopee style: "x1", "x4")
            const qtyOnly = fullText.match(/^x\s*(\d{1,3})$/i);
            if (qtyOnly && items.length > 0) {
                items[items.length - 1].qty = Math.max(1, parseInt(qtyOnly[1], 10));
                continue;
            }

            // Extract numeric tokens from right side
            const rightNums = [];
            for (const rw of rightWords) {
                const tok = rw.text.trim();
                const hasCurr = /^(?:PHP|₱|P|F|R|£|¥|€|\$)/i.test(tok);
                const val = parsePriceToken(tok);
                if (val !== null) rightNums.push({ val, hasCurr, x0: rw.bbox.x0, raw: tok });
            }

            // Detect shipping / delivery row with price on the right (Decathlon Home Delivery)
            if (/delivered\s+by|home\s+delivery|delivery\s+fee|shipping\s+fee/i.test(fullText)) {
                if (rightNums.length > 0) {
                    const shipPrice = rightNums[rightNums.length - 1].val;
                    items.push({ name: 'Shipping Fee', qty: 1, unitPrice: shipPrice, subCategory: 'shipping' });
                }
                pendingName = '';
                continue;
            }

            // Shopee Variation line carries the price for the product title right above it
            if (/^variation\s*:/i.test(leftText) || /^size\s+/i.test(leftText)) {
                if (rightNums.length > 0 && pendingName) {
                    const salePrice = rightNums[rightNums.length - 1].val;
                    items.push({ name: pendingName.slice(0, 52), qty: 1, unitPrice: salePrice, subCategory: guessSubCategory(pendingName) });
                    pendingName = '';
                }
                continue;
            }

            // Decathlon / table row: product name on left + price (& optional qty & total) on right
            if (leftText.length >= 4 && rightNums.length > 0 && !/order\s*total|subtotal|grand\s*total/i.test(leftText)) {
                let unitPrice = rightNums[0].val;
                let qty = 1;
                if (rightNums.length >= 3 && rightNums[1].val <= 50 && !rightNums[1].hasCurr) {
                    qty = Math.round(rightNums[1].val);
                    unitPrice = rightNums[0].val;
                } else if (rightNums.length === 2 && rightNums[1].val < rightNums[0].val && rightNums[1].val <= 20 && !rightNums[1].hasCurr) {
                    qty = Math.round(rightNums[1].val);
                } else if (rightNums.length >= 2) {
                    // Two prices (strikethrough + sale): pick last
                    unitPrice = rightNums[rightNums.length - 1].val;
                }
                items.push({ name: leftText.slice(0, 52), qty, unitPrice, subCategory: guessSubCategory(leftText) });
                pendingName = '';
                continue;
            }

            // Otherwise, if it's a substantial product title line on the left, hold it for the next line's price
            if (leftText.length >= 8 && !/^write\s+a\s+review/i.test(leftText) && !/^\d+$/.test(leftText)) {
                pendingName = leftText;
            }
        }

        return { items };
    }

    let pendingExtracted = null;

    function ensureScannerModal() {
        if (document.getElementById('receipt-ocr-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'receipt-ocr-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:none;align-items:flex-end;justify-content:center;z-index:100025;backdrop-filter:blur(6px);background:rgba(0,0,0,0.45);';
        modal.onclick = () => window.ReceiptOCRScanner.close();
        modal.innerHTML = `
            <!-- (2026-07-13) Taller scanner sheet with receipt thumbnail preview; prev: compact -->
            <div class="custom-modal receipt-ocr-sheet" onclick="event.stopPropagation()" style="width:100%;max-width:430px;height:82vh;max-height:92vh;border-radius:28px 28px 0 0;padding:16px 20px calc(env(safe-area-inset-bottom, 20px) + 20px);background:#fff;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,0.18);">
                <div style="width:36px;height:4px;background:#cbd5e1;border-radius:2px;margin:0 auto 14px;flex-shrink:0;"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:38px;height:38px;border-radius:12px;background:#fff7ed;color:#ea580c;display:flex;align-items:center;justify-content:center;">
                            <i class="material-icons" style="font-size:20px;">receipt_long</i>
                        </div>
                        <div>
                            <div style="font-size:16px;font-weight:800;color:#0f172a;">Scan Receipt / Order</div>
                            <div style="font-size:11.5px;color:#64748b;">Extracts items, qty, prices & shipping</div>
                        </div>
                    </div>
                    <button type="button" onclick="window.ReceiptOCRScanner.close()" style="width:32px;height:32px;border-radius:10px;border:none;background:#f1f5f9;color:#64748b;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                        <i class="material-icons" style="font-size:18px;">close</i>
                    </button>
                </div>
                <input type="file" id="receipt-ocr-file-input" accept="image/*" style="display:none;">
                <div id="receipt-ocr-upload-box" onclick="document.getElementById('receipt-ocr-file-input').click()" style="border:1.5px dashed #cbd5e1;border-radius:18px;padding:42px 16px;text-align:center;background:#f8fafc;cursor:pointer;margin:auto 0;">
                    <i class="material-icons" style="font-size:36px;color:#ea580c;margin-bottom:8px;">add_photo_alternate</i>
                    <div style="font-size:14px;font-weight:700;color:#1e293b;">Tap to upload receipt or order screenshot</div>
                    <div style="font-size:11.5px;color:#64748b;margin-top:4px;">Works with Decathlon, Shopee, Lazada, Pinduoduo & grocery receipts</div>
                </div>
                <div id="receipt-ocr-loading" style="display:none;text-align:center;padding:40px 12px;margin:auto 0;">
                    <div class="done-spinner" style="width:28px;height:28px;border-width:3px;border-top-color:#ea580c;margin-bottom:10px;"></div>
                    <div id="receipt-ocr-status" style="font-size:13px;font-weight:700;color:#334155;">Reading receipt items...</div>
                </div>
                <div id="receipt-ocr-results" style="display:none;flex:1;min-height:0;flex-direction:column;">
                    <div id="receipt-ocr-thumb-wrap" style="display:none;margin-bottom:12px;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;flex-shrink:0;position:relative;height:185px;touch-action:none;cursor:grab;">
                        <img id="receipt-ocr-thumb-img" src="" alt="Uploaded receipt" draggable="false"
                            style="width:100%;height:100%;object-fit:contain;display:block;background:#f8fafc;transform-origin:center center;will-change:transform;pointer-events:none;user-select:none;">
                        <span id="receipt-ocr-zoom-badge" style="position:absolute;bottom:6px;right:8px;font-size:10px;font-weight:700;background:rgba(15,23,42,0.72);color:#fff;padding:3px 8px;border-radius:8px;pointer-events:none;">Double-tap or pinch to zoom</span>
                    </div>
                    <div id="receipt-ocr-items-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;flex:1;overflow-y:auto;min-height:0;"></div>
                    <div style="display:flex;gap:10px;flex-shrink:0;padding-top:6px;">
                        <button type="button" onclick="document.getElementById('receipt-ocr-file-input').click()" style="flex:1;height:44px;border-radius:14px;border:none;background:#f1f5f9;color:#475569;font-size:12.5px;font-weight:700;cursor:pointer;">Re-Scan</button>
                        <button type="button" onclick="window.ReceiptOCRScanner.apply()" style="flex:1.4;height:44px;border-radius:14px;border:none;background:#10b981;color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(16,185,129,0.3);">Apply to Transaction</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('receipt-ocr-file-input').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = '';
            await window.ReceiptOCRScanner.processFile(file);
        });

        // (2026-07-13) Pinch, wheel, drag & double-tap zoom like BPI scanner; prev: height toggle
        initThumbZoomHandlers();
    }

    const zoomState = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, lastTap: 0, pinchDist: 0, pinchScale: 1 };

    function applyThumbTransform(animate = false) {
        const img = document.getElementById('receipt-ocr-thumb-img');
        const badge = document.getElementById('receipt-ocr-zoom-badge');
        if (!img) return;
        if (zoomState.scale <= 1.01) { zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0; }
        img.style.transition = animate ? 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        img.style.transform = `translate3d(${zoomState.x}px, ${zoomState.y}px, 0) scale(${zoomState.scale})`;
        if (badge) {
            badge.textContent = zoomState.scale > 1.05 ? `${zoomState.scale.toFixed(1)}x • Double-tap to reset` : 'Double-tap or pinch to zoom';
        }
    }

    function initThumbZoomHandlers() {
        const wrap = document.getElementById('receipt-ocr-thumb-wrap');
        if (!wrap || wrap._zoomBound) return;
        wrap._zoomBound = true;

        const getDist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

        wrap.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (zoomState.scale > 1.1) { zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0; }
            else { zoomState.scale = 2.4; zoomState.x = 0; zoomState.y = 0; }
            applyThumbTransform(true);
        });

        wrap.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.25 : -0.25;
            zoomState.scale = Math.min(4, Math.max(1, zoomState.scale + delta));
            applyThumbTransform(false);
        }, { passive: false });

        wrap.addEventListener('mousedown', (e) => {
            if (zoomState.scale <= 1) return;
            zoomState.dragging = true;
            zoomState.startX = e.clientX - zoomState.x;
            zoomState.startY = e.clientY - zoomState.y;
            wrap.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!zoomState.dragging) return;
            zoomState.x = e.clientX - zoomState.startX;
            zoomState.y = e.clientY - zoomState.startY;
            applyThumbTransform(false);
        });
        window.addEventListener('mouseup', () => {
            if (!zoomState.dragging) return;
            zoomState.dragging = false;
            wrap.style.cursor = 'grab';
        });

        wrap.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                zoomState.pinchDist = getDist(e.touches[0], e.touches[1]);
                zoomState.pinchScale = zoomState.scale;
                zoomState.dragging = false;
            } else if (e.touches.length === 1) {
                const now = Date.now();
                if (now - zoomState.lastTap < 300) {
                    e.preventDefault();
                    if (zoomState.scale > 1.1) { zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0; }
                    else { zoomState.scale = 2.4; zoomState.x = 0; zoomState.y = 0; }
                    applyThumbTransform(true);
                    zoomState.lastTap = 0;
                    return;
                }
                zoomState.lastTap = now;
                if (zoomState.scale > 1) {
                    zoomState.dragging = true;
                    zoomState.startX = e.touches[0].clientX - zoomState.x;
                    zoomState.startY = e.touches[0].clientY - zoomState.y;
                }
            }
        }, { passive: false });

        wrap.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && zoomState.pinchDist > 0) {
                e.preventDefault();
                const ratio = getDist(e.touches[0], e.touches[1]) / zoomState.pinchDist;
                zoomState.scale = Math.min(4, Math.max(1, zoomState.pinchScale * ratio));
                applyThumbTransform(false);
            } else if (e.touches.length === 1 && zoomState.dragging) {
                e.preventDefault();
                zoomState.x = e.touches[0].clientX - zoomState.startX;
                zoomState.y = e.touches[0].clientY - zoomState.startY;
                applyThumbTransform(false);
            }
        }, { passive: false });

        wrap.addEventListener('touchend', () => {
            zoomState.dragging = false;
            zoomState.pinchDist = 0;
        });
    }

    window.ReceiptOCRScanner = {
        open() {
            ensureScannerModal();
            pendingExtracted = null;
            document.getElementById('receipt-ocr-upload-box').style.display = 'block';
            document.getElementById('receipt-ocr-loading').style.display = 'none';
            document.getElementById('receipt-ocr-results').style.display = 'none';
            const modal = document.getElementById('receipt-ocr-modal');
            modal.style.display = 'flex';
            modal.classList.add('show');
        },
        close() {
            const modal = document.getElementById('receipt-ocr-modal');
            if (!modal) return;
            modal.style.display = 'none';
            modal.classList.remove('show', 'closing');
        },
        async processFile(file) {
            const uploadBox = document.getElementById('receipt-ocr-upload-box');
            const loadingBox = document.getElementById('receipt-ocr-loading');
            const resultsBox = document.getElementById('receipt-ocr-results');
            const statusEl = document.getElementById('receipt-ocr-status');
            uploadBox.style.display = 'none';
            resultsBox.style.display = 'none';
            loadingBox.style.display = 'block';
            statusEl.textContent = 'Reading receipt items...';

            try {
                const dataUrl = await fileToBase64(file);
                let data = null;
                if (navigator.onLine && window.CONFIG?.GEMINI_API_KEY) {
                    try {
                        statusEl.textContent = 'Analyzing order screenshot...';
                        data = await extractWithGemini(dataUrl);
                    } catch (err) {
                        console.warn('[ReceiptOCR] Gemini failed, trying fallback:', err.message);
                    }
                }
                if ((!data || !Array.isArray(data.items) || data.items.length === 0) && navigator.onLine && window.CONFIG?.OPENAI_API_KEY) {
                    try {
                        statusEl.textContent = 'Analyzing with vision backup...';
                        data = await extractWithOpenAI(dataUrl);
                    } catch (err) {
                        console.warn('[ReceiptOCR] OpenAI failed, falling back to Tesseract:', err.message);
                    }
                }
                if (!data || !Array.isArray(data.items) || data.items.length === 0) {
                    statusEl.textContent = 'Scanning text layout...';
                    data = await extractWithTesseract(dataUrl);
                }

                // (2026-07-13) Normalize weighted qty & trust printed lineTotal; prev: clamped qty<1
                const items = Array.isArray(data?.items) ? data.items.map((it, idx) => {
                    const rawQty = Number(it.qty);
                    const rawUnit = Math.max(0, Number(it.unitPrice) || 0);
                    const rawLine = Math.max(0, Number(it.lineTotal) || 0);
                    let qty = 1;
                    let unitPrice = rawUnit;

                    if (Number.isFinite(rawQty) && rawQty > 0 && !Number.isInteger(rawQty)) {
                        qty = 1;
                        unitPrice = rawLine > 0 ? rawLine : Math.round(rawQty * rawUnit * 100) / 100;
                    } else {
                        qty = Math.max(1, Math.round(Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1));
                        if (rawLine > 0 && Math.abs(qty * rawUnit - rawLine) > 0.05) {
                            unitPrice = Math.round((rawLine / qty) * 100) / 100;
                        } else {
                            unitPrice = Math.round(rawUnit * 100) / 100;
                        }
                    }

                    return {
                        id: 'ocr_' + Date.now() + '_' + idx,
                        name: String(it.name || 'Item').replace(/^[\[\]|•\-_]+\s*/, '').trim(),
                        qty,
                        unitPrice,
                        subCategory: it.subCategory || guessSubCategory(it.name),
                        checked: true
                    };
                }).filter(it => it.unitPrice > 0) : [];

                // (2026-07-13) Display uploaded receipt thumbnail & reset zoom; prev: static
                const thumbWrap = document.getElementById('receipt-ocr-thumb-wrap');
                const thumbImg = document.getElementById('receipt-ocr-thumb-img');
                if (thumbImg && thumbWrap) {
                    thumbImg.src = dataUrl;
                    thumbWrap.style.display = 'block';
                    zoomState.scale = 1; zoomState.x = 0; zoomState.y = 0;
                    applyThumbTransform(false);
                }

                pendingExtracted = { items };
                this.renderResults();
                loadingBox.style.display = 'none';
                resultsBox.style.display = 'flex';
            } catch (err) {
                console.error('[ReceiptOCR] Failed:', err);
                loadingBox.style.display = 'none';
                uploadBox.style.display = 'block';
                if (window.showToast) window.showToast('Could not read receipt. Try a clearer image.');
            }
        },
        renderResults() {
            const listEl = document.getElementById('receipt-ocr-items-list');
            if (!pendingExtracted) return;

            if (pendingExtracted.items.length === 0) {
                listEl.innerHTML = `<div style="text-align:center;padding:14px;color:#64748b;font-size:12.5px;">No line items detected. Try cropping closer to the product list.</div>`;
                return;
            }

            // (2026-07-13) Custom circular checkmarks with selected card highlight; prev: native input
            listEl.innerHTML = pendingExtracted.items.map((it, i) => `
                <div onclick="window.ReceiptOCRScanner.toggleItem(${i}, ${!it.checked})"
                    style="display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:16px;border:1.5px solid ${it.checked ? '#a7f3d0' : '#e2e8f0'};background:${it.checked ? '#f0fdf4' : '#f8fafc'};cursor:pointer;transition:all 0.15s ease;">
                    <div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${it.checked ? '#10b981' : '#ffffff'};border:2px solid ${it.checked ? '#10b981' : '#cbd5e1'};box-shadow:${it.checked ? '0 3px 8px rgba(16,185,129,0.32)' : 'none'};transition:all 0.15s ease;">
                        <i class="material-icons" style="font-size:15px;color:#ffffff;opacity:${it.checked ? '1' : '0'};transform:scale(${it.checked ? '1' : '0.5'});transition:all 0.15s ease;">check</i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:${it.checked ? '#0f172a' : '#64748b'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.name}</div>
                        <div style="font-size:11px;color:#64748b;margin-top:1px;">${it.qty}x ₱${it.unitPrice.toLocaleString()} • ${it.subCategory}</div>
                    </div>
                    <div style="font-size:13.5px;font-weight:800;color:${it.checked ? '#0f172a' : '#94a3b8'};">₱${(Math.round(it.qty * it.unitPrice * 100) / 100).toLocaleString()}</div>
                </div>
            `).join('');
        },
        toggleItem(idx, checked) {
            if (pendingExtracted?.items?.[idx]) {
                pendingExtracted.items[idx].checked = checked;
                this.renderResults();
            }
        },
        toggleThumbExpand() {
            const img = document.getElementById('receipt-ocr-thumb-img');
            if (!img) return;
            const expanded = img.style.maxHeight === '48vh';
            img.style.maxHeight = expanded ? '175px' : '48vh';
            img.style.cursor = expanded ? 'zoom-in' : 'zoom-out';
        },
        apply() {
            if (!pendingExtracted) return;
            const chosen = pendingExtracted.items.filter(it => it.checked).map(({ checked, ...rest }) => rest);
            if (window.CartModule && typeof window.CartModule.applyScannedReceipt === 'function') {
                window.CartModule.applyScannedReceipt({ items: chosen });
            }
            this.close();
            if (window.showToast) window.showToast(`Applied ${chosen.length} item${chosen.length === 1 ? '' : 's'} from receipt`);
        }
    };
})();
