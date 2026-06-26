/**
 * Core utility functions for the Wallet App
 */

// Logging utility for admin/debug info
export function log(msg, type = 'info') {
    const container = document.getElementById('log-container');
    if (!container) {
        console.log(`[${type.toUpperCase()}] ${msg}`);
        return;
    }
    const div = document.createElement('div');
    div.className = `log-entry ${type === 'error' ? 'log-error' : ''}`;
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Format date to YYYY-MM-DD
export function formatLocalDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const TEXT_ARTIFACT_REPLACEMENTS = [
    ['????????????????????????????????', '\u20B1'],
    ['????????????????????????????????', '\u2022'],
    ['????', '\u00F7'],
    ['?????', '\u00D7'],
    ['???????', '\u2212'],
    ['??????????', '\uD83D\uDD14'],
    ['??????????????????????????????????????????????????????????????????????', '\u20B1'],
    ['???????', '\u20B1'],
    ['???', '\u20B1'],
    ['??????????????????????????????????????????????????????????????????????', '\u2022'],
    ['???????', '\u2022'],
    ['???????????', '\u2022'],
    ['????', '\u2022'],
    ['??', '']
];

/* [FIX 2026-06-26: Modified repairTextArtifacts to accept an optional shouldTrim parameter (defaults to true) to prevent removing spaces around inline tags inside text nodes. Modified repairDomArtifacts to pass false for shouldTrim on text nodes.] */
export function repairTextArtifacts(text, shouldTrim = true) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') return text;

    let repaired = text;
    TEXT_ARTIFACT_REPLACEMENTS.forEach(([bad, good]) => {
        repaired = repaired.split(bad).join(good);
    });

    const processed = repaired
        .replace(/â‚±/g, '\u20B1')
        .replace(/Ã¢â€šÂ±|ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â±|Ã‚â‚±/g, '\u20B1')
        .replace(/Ã¢â‚¬Â¢|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢/g, '\u2022')
        .replace(/Ã¢Ë†â€™|ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“/g, '\u2212')
        .replace(/Ãƒâ€”/g, '\u00D7')
        .replace(/ÃƒÂ·/g, '\u00F7')
        .replace(/\uFFFD+/g, '')
        .replace(/\s{2,}/g, ' ');

    return shouldTrim ? processed.trim() : processed;
}

export function repairDomArtifacts(root = document.body) {
    if (!root || typeof document === 'undefined') return;

    const target = root.nodeType === Node.DOCUMENT_NODE ? root.documentElement : root;
    if (!target) return;

    const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
    const textWalker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];

    while (textWalker.nextNode()) {
        textNodes.push(textWalker.currentNode);
    }

    textNodes.forEach((node) => {
        const parent = node.parentElement;
        if (!parent || skipTags.has(parent.tagName)) return;
        /* [FIX 2026-06-26: Pass false to shouldTrim for text nodes to avoid stripping spaces adjacent to inline HTML tags] */
        const repaired = repairTextArtifacts(node.nodeValue || '', false);
        if (repaired !== node.nodeValue) node.nodeValue = repaired;
    });

    if (target.querySelectorAll) {
        const attrNames = ['data-raw', 'title', 'aria-label', 'placeholder'];
        target.querySelectorAll(attrNames.map((name) => '[' + name + ']').join(',')).forEach((el) => {
            attrNames.forEach((attr) => {
                if (!el.hasAttribute(attr)) return;
                const current = el.getAttribute(attr);
                if (current === null) return;
                const repaired = repairTextArtifacts(current);
                if (repaired !== current) el.setAttribute(attr, repaired);
            });
        });
    }
}

let domArtifactRepairTimer = null;
export function scheduleDomArtifactRepair(root = document.body) {
    if (typeof window === 'undefined') return;
    window.clearTimeout(domArtifactRepairTimer);
    domArtifactRepairTimer = window.setTimeout(() => repairDomArtifacts(root), 0);
}

export function repairNotificationTextArtifacts(text, title = '') {
    const repairedTitle = repairTextArtifacts(String(title || ''));
    let repaired = repairTextArtifacts(text);
    if (/^daily summary$/i.test(repairedTitle) || /^yesterday you spent/i.test(repaired)) {
        repaired = repaired.replace(/(Yesterday you spent)\s+[^0-9A-Za-z]{1,24}(?=\d)/i, '$1 \u20B1');
    }
    return repaired;
}

if (typeof window !== 'undefined') {
    window.repairTextArtifacts = repairTextArtifacts;
    window.repairDomArtifacts = repairDomArtifacts;
    window.scheduleDomArtifactRepair = scheduleDomArtifactRepair;

    const initDomArtifactRepairObserver = () => {
        if (window.__domArtifactRepairObserver || typeof MutationObserver === 'undefined') return;
        const root = document.body || document.documentElement;
        if (!root) return;
        window.__domArtifactRepairObserver = new MutationObserver(() => scheduleDomArtifactRepair(root));
        window.__domArtifactRepairObserver.observe(root, { childList: true, subtree: true, characterData: true });
        scheduleDomArtifactRepair(root);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDomArtifactRepairObserver, { once: true });
    } else {
        initDomArtifactRepairObserver();
    }
}

// Show toast notification
export function showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast-box');
    const msgEl = document.getElementById('toast-msg');
    const safeMessage = repairTextArtifacts(String(msg || ''));
    
    if (!toast || !msgEl) {
        console.log('Toast:', safeMessage);
        return;
    }
    msgEl.innerText = safeMessage;
    toast.classList.add('show');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// Category Configuration (Shared across UI and helper logic)
export const CATEGORIES = [
    { id: 'Online shopping', icon: 'shopping_bag', label: 'Online Shopping', cls: 'cat-online' },
    { id: 'Shopping', icon: 'shopping_cart', label: 'Shopping', cls: 'cat-shopping' },
    { id: 'Vehicle', icon: 'local_gas_station', label: 'Vehicle', cls: 'cat-vehicle' },
    { id: 'Food & Drinks', icon: 'restaurant', label: 'Food & Drinks', cls: 'cat-food' },
    { id: 'Service', icon: 'settings_cell', label: 'Service', cls: 'cat-service-magenta' },
    { id: 'Trade Copier', icon: 'hub', label: 'Trade Copier', cls: 'cat-aqua' },
    { id: 'Trading Expenses', icon: 'insights', label: 'Trading Expenses', cls: 'cat-trading' },
    { id: 'Life & Entertainment', icon: 'confirmation_number', label: 'Life & Ent.', cls: 'cat-life' },
    { id: 'Financial Expenses', icon: 'payments', label: 'Financial Expenses', cls: 'cat-financial' },
    { id: 'Credit Card Payment', icon: 'credit_card', label: 'Credit Card', cls: 'cat-credit-card' },
    { id: 'Transportation', icon: 'directions_bus', label: 'Transportation', cls: 'cat-vehicle' },
    { id: 'Travel', icon: 'flight', label: 'Travel', cls: 'cat-aqua' },
    { id: 'Education', icon: 'school', label: 'Education', cls: 'cat-education' },
    { id: 'Sport', icon: 'fitness_center', label: 'Sport', cls: 'cat-life' },
    { id: 'Savings', icon: 'account_balance', label: 'Savings', cls: 'cat-investments' },
    { id: 'Income', icon: 'savings', label: 'Income', cls: 'cat-income' }
];

// Display category name from ID
export function displayCategoryName(id) {
    const cat = CATEGORIES.find(c => c.id === id);
    return cat ? cat.label : id;
}

function normalizeMerchantText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function inferMerchantCategory(name = '', note = '') {
    const combined = normalizeMerchantText(`${name} ${note}`).toUpperCase();
    const defaultMeta = { category: 'Financial Expenses', icon: 'payments', catClass: 'cat-financial', autoSuggested: false };
    if (!combined) return defaultMeta;

    if (combined === 'INCOME' || combined.includes('SALARY') || combined.includes('DIVIDEND') || combined.includes('REFUND SOURCE')) {
        return { category: 'Income', icon: 'savings', catClass: 'cat-income', autoSuggested: true };
    }

    if (combined.includes('TRADERSCONNECT') || combined.includes('TRADERS CONNECT')) {
        return { category: 'Trade Copier', icon: 'hub', catClass: 'cat-aqua', autoSuggested: true };
    }

    if (combined.includes('EQUITY EDGE') || combined.includes('ANALYTICS') || combined.includes('TRADING') || combined.includes('LEVERAGE FUND') || combined.includes('MRCRMT')) {
        return { category: 'Trading Expenses', icon: 'insights', catClass: 'cat-trading', autoSuggested: true };
    }

    if (combined.includes('LOCQ')) {
        return { category: 'Vehicle', icon: 'local_gas_station', catClass: 'cat-vehicle', autoSuggested: true };
    }

    if (/\bSM\b/.test(combined) || combined.startsWith('SM ') || combined.includes('SM STORE') || combined.includes('SM SUPERMARKET')) {
        return { category: 'Shopping', icon: 'shopping_cart', catClass: 'cat-shopping', autoSuggested: true };
    }

    if (combined.includes('J AND L MALL') || combined.includes('J & L MALL') || combined.includes('J AND L SHOPPING') || combined.includes('J & L')) {
        return { category: 'Shopping', icon: 'shopping_cart', catClass: 'cat-shopping', autoSuggested: true };
    }

    const keywordMatches = (terms) => terms.some(term => combined.includes(term));

    const keywordMap = [
        { cat: 'Online shopping', key: ['shopee', 'tiktok', 'lazada', 'shein', 'temu', 'zalora', 'shopify', 'amazon', 'ebay', 'shein', 'carousell'] },
        { cat: 'Shopping', key: [
            'mall', 'supermet', 'gaisano', 'mr diy', 'mr. diy', 'watsons', 'sm store', 'sm superm', 'sm supermarket',
            'sm city', 'sm mall', 'sm hypermarket', 'robinsons', 'robinsons', 'kkv', 'miniso', 'unitop', 'h&m',
            'uniqlo', 'puregold', 'landmark', 'daiso', 'national bookstore', 'fully booked', 'landers', 's&r',
            's and r', 'waltermart', 'shopwise', 'ace hardware', 'handyman', 'wilcon', 'true value', 'octagon',
            'mercury drug', 'generika', 'southstar drug', 'rose pharmacy'
        ] },
        { cat: 'Vehicle', key: [
            'locq', 'tecfuel', 'tec fuel', 'shell', 'petron', 'seaoil', 'ptt', 'caltex', 'cleanfuel', 'unioil',
            'phoenix', 'total', 'flying v', 'fuel', 'gas station', 'gas', 'toyota', 'honda', 'mitsub', 'car wash',
            'autoshop', 'parking', 'tire', 'auto supply'
        ] },
        { cat: 'Food & Drinks', key: [
            'jollibee', 'mcdo', 'mcdonald', 'burger king', 'starbucks', 'chowking', 'kfc', 'mang inasal', 'greenwich',
            'ribshack', 'coffee', 'resto', 'cafe', 'tea', 'bakery', 'j.co', 'dunkin', 'boba', 'pizza',
            '7-eleven', 'seven eleven', '7 11', '7/11', 'alfamart', 'familymart', 'ministop', 'lawson',
            'pickup coffee', 'bo s coffee', "bo's coffee", 'bonchon', 'pizzahut', "pizza hut", 'shakey', 'conti',
            'yellow cab', 'potato corner'
        ] },
        { cat: 'Service', key: [
            'globe', 'smart', 'pldt', 'converge', 'tm', 'gomo', 'dito', 'netflix', 'spotify', 'youtube', 'disney',
            'prime', 'apple', 'icloud', 'google', 'canva', 'paypal', 'gcash', 'maya', 'paymaya', 'subscription',
            'bill', 'insurance', 'philhealth', 'sss', 'pag-ibig', 'veco', 'mcwd', 'meralco', 'bayad', 'water bill',
            'internet', 'load', 'top up', 'streaming'
        ] },
        { cat: 'Transportation', key: ['grab car', 'grab ride', 'grab', 'taxi', 'move it', 'joyride', 'angkas', 'jeep', 'bus', 'ferry', 'pier', 'airport', 'airline', 'beep'] },
        { cat: 'Education', key: ['school', 'university', 'tuition', 'book', 'udemy', 'coursera', 'skillshare', 'training', 'review center', 'college'] },
        { cat: 'Life & Entertainment', key: ['cinema', 'movie', 'game', 'playstation', 'xbox', 'steam', 'valve', 'riot', 'epic', 'skating', 'zoo', 'park', 'concert', 'amusement', 'theater'] }
    ];

    for (const map of keywordMap) {
        if (keywordMatches(map.key)) {
            const userCat = CATEGORIES.find(c => c.id === map.cat);
            if (userCat) {
                return { category: userCat.id, icon: userCat.icon, catClass: userCat.cls || 'cat-financial', autoSuggested: true };
            }
        }
    }

    return defaultMeta;
}

// Merchant Mapping & Categorization
export function getMerchantDisplay(name = '', t = {}) {
    if (typeof window !== 'undefined' && typeof window.__inlineGetMerchantDisplay === 'function' && window.__inlineGetMerchantDisplay !== getMerchantDisplay) {
        return window.__inlineGetMerchantDisplay(name, t);
    }

    let raw = name.toUpperCase();
    
    // 1. GENERAL CLEANUP
    let cleaned = name
        .replace(/\s+PHL$/i, '')
        .replace(/\s+CEBU\s+CITY\s+PHL$/i, '')
        .replace(/\s+CEBU\s+CITY$/i, '')
        .replace(/\s+DUBAI\s+ARE$/i, '')
        .replace(/\s+LONDON\s+GBR$/i, '')
        .replace(/\s+PH\s+PHL$/i, '')
        .replace(/\s+PH$/i, '')
        .trim();
    
    // 2. PATTERN REPLACEMENT
    if (cleaned.toUpperCase().includes('GADC') || cleaned.toUpperCase().includes('MCDONALDS') || cleaned.toUpperCase().includes('MCDO')) {
        let u = cleaned.toUpperCase();
        if (u.includes('SOUTHCBU') || u.includes('325CLN')) {
            cleaned = 'MCDONALDS SOUTH CEBU';
        } else {
            cleaned = cleaned.replace(/(GADC|MCDONALDS|MCDO)/i, 'MCDONALDS').trim();
            cleaned = cleaned.replace(/MCDONALDS\s+\d+[A-Z]*/i, 'MCDONALDS').trim();
        }
    }
    
    if (cleaned.toUpperCase().includes('JOLLIBEE')) {
        cleaned = cleaned.replace(/JB\d+\s+\w+/i, '').trim();
    }

    if (cleaned.toUpperCase().includes('RIBSHACK')) {
         cleaned = cleaned.replace(/PH\d+/i, '').trim();
    }

    if (cleaned.toUpperCase().includes('SHOPEE')) {
        cleaned = 'SHOPEE PH';
    }

    if (cleaned.toUpperCase().includes('TRADERSCONNECT')) {
        cleaned = 'TRADERS CONNECT';
    }

    if (cleaned.toUpperCase().includes('TIKTOK SHOP')) {
        cleaned = 'TIKTOK SHOP';
    }

    if (cleaned.toUpperCase().includes('SPOTIFY')) {
        cleaned = 'SPOTIFY';
    }

    let display = { name: cleaned, category: 'Financial Expenses', icon: 'payments', catClass: 'cat-financial' };

    // 3. MANUAL OVERRIDE (USER CHOICE)
    if (t.manualCategory) {
        const userCat = CATEGORIES.find(c => c.id === t.manualCategory);
        if (userCat) {
            display.category = userCat.id;
            display.icon = userCat.icon;
            const catMap = {
                'Online shopping': 'cat-online',
                'Shopping': 'cat-shopping',
                'Vehicle': 'cat-vehicle',
                'Trade Copier': 'cat-aqua',
                'Trading Expenses': 'cat-trading',
                'Service': 'cat-service-magenta',
                'Food & Drinks': 'cat-food',
                'Life & Entertainment': 'cat-life',
                'Financial Expenses': 'cat-financial',
                'Credit Card Payment': 'cat-credit-card',
                'Transportation': 'cat-vehicle',
                'Travel': 'cat-aqua',
                'Education': 'cat-education',
                'Sport': 'cat-life',
                'Income': 'cat-income'
            };
            display.catClass = userCat.cls || catMap[userCat.id] || 'cat-financial';
            return display;
        }
    }

    // 4. EXACT OVERRIDES
    const mapping = {
        'MR DIY BGCC BOGO': 'MR DIY BOGO',
        'MR DIY ZBOG BOGO': 'MR DIY BOGO',
        'TEC FUEL SAN REMIGIO': 'TECFUEL SAN REMIGIO',
        'J AND L SHOPPING BOGO': 'J AND L MALL BOGO',
        'TECFUEL BOGO CEBU': 'TECFUEL BOGO',
        'KKV SM J Mall Cebu': 'KKV SM J MALL CEBU',
        'SM STORE-CEBU': 'SM STORE - CEBU CITY',
        'GLOBE-BILLSPAY PH': 'GLOBE / GOMO LOAD',
        'SHELL FILLWISE BOGO CEBU': 'SHELL BOGO CEBU',
        'GLOBE WEBLOADING EC PH': 'GLOBE / GOMO LOAD',
        'WATSONS HISOLER BLDG B': 'WATSONS HISOLER BLDG BOGO',
        'SUPER METRO S/M-BOGO': 'SUPER METRO BOGO',
        'SM SUPERMARKET SM SRP CEBU': 'SM SUPERMARKET SRP',
        'OCTAGON AYALA CENTRAL CEBU': 'OCTAGON AYALA CENTRAL CEBU',
        'STARBUCKS 540 CENTRAL CEBU CITY': 'STARBUCKS 540 CENTRAL CEBU CITY',
        'ICE SKATING SM SRP CEB': 'ICE SKATING SM SRP CEBU',
        'TAP SURE LEVERAGE FUND': 'TAP SURE LEVERAGE FUND',
        'MRCRMT': 'MRCRMT',
        'TRADERSCONNECT.COM': 'TRADERS CONNECT',
        'TRADERSCONNECT': 'TRADERS CONNECT',
        'SM CITY CEBU': 'SM CITY CEBU',
        'SM SEASIDE CITY CEBU': 'SM SEASIDE CITY CEBU',
        'ROBINSONS GALLERIA': 'ROBINSONS GALLERIA',
        'ROBINSONS CYBERGATE': 'ROBINSONS CYBERGATE',
        'LANDERS SUPERCENTER': 'LANDERS SUPERCENTER',
        'PUREGOLD': 'PUREGOLD',
        'WALTERMART': 'WALTERMART',
        'ACE HARDWARE': 'ACE HARDWARE',
        'MERCURY DRUG': 'MERCURY DRUG',
        '7-ELEVEN': '7-ELEVEN',
        '7 11': '7-ELEVEN',
        'FAMILYMART': 'FAMILYMART',
        'LAWSON': 'LAWSON',
        'MINISTOP': 'MINISTOP',
        'JCO': 'J.CO',
        'MANG INASAL': 'MANG INASAL',
        'PIZZA HUT': 'PIZZA HUT',
        'BONCHON': 'BONCHON'
    };

    const finalRaw = cleaned.toUpperCase();
    if (mapping[cleaned]) display.name = mapping[cleaned];
    else if (mapping[finalRaw]) display.name = mapping[finalRaw];

    // 5. CATEGORY DETECTION
    const lowerRaw = finalRaw.toLowerCase();
    const noteLower = (t.note || '').toLowerCase();

    const detected = inferMerchantCategory(finalRaw, t.note || noteLower);
    if (detected.category !== 'Financial Expenses' || detected.autoSuggested) {
        display.category = detected.category;
        display.icon = detected.icon;
        display.catClass = detected.catClass;
        display.autoSuggested = detected.autoSuggested;
    }

    return display;
}

/**
 * Identify if a merchant is a recurring subscription
 * @param {string} merchantName 
 * @returns {boolean}
 */
export function isSubscriptionMerchant(merchantName) {
    const name = merchantName.toUpperCase();
    const subs = [
        'SPOTIFY', 'NETFLIX', 'YOUTUBE', 'DISNEY', 'APPLE.COM/BILL', 
        'GOOGLE *', 'ICLOUD', 'PRIME VIDEO', 'ADOBE', 'MICROSOFT',
        'CANVA', 'TIKTOK', 'TRADERS CONNECT', 'EQUITY EDGE'
    ];
    return subs.some(s => name.includes(s));
}

// Haptic Feedback Utility
export function triggerHaptic(type = 'light') {
    if (!navigator.vibrate) return;
    
    switch(type) {
        case 'light':
            navigator.vibrate(10);
            break;
        case 'medium':
            navigator.vibrate(30);
            break;
        case 'success':
            navigator.vibrate([10, 30, 10]);
            break;
        case 'error':
            navigator.vibrate([50, 100, 50]);
            break;
        case 'bump':
            navigator.vibrate(15);
            break;
    }
}

/**
 * Create and store a notification locally
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - 'info', 'warning', 'success', 'error'
 * @param {object} action - Optional action object { label, callback }
 * @param {object} meta - Optional metadata persisted with the notification
 */
export function createNotification(title, message, type = 'info', action = null, meta = null) {
    const notifications = JSON.parse(localStorage.getItem('smartwallet_notifications') || '[]');
    const safeMeta = meta && typeof meta === 'object' ? JSON.parse(JSON.stringify(meta)) : null;
    const safeTitle = repairTextArtifacts(String(title || 'Notification'));
    const safeMessage = repairTextArtifacts(String(message || ''));
    const hasExact = notifications.some((item) => {
        const itemMeta = item?.meta || null;
        if (
            safeMeta?.notificationKey
            && itemMeta?.notificationKey
            && String(itemMeta.notificationKey) === String(safeMeta.notificationKey)
        ) {
            return true;
        }
        if (
            safeMeta?.goalId
            && itemMeta?.goalId
            && String(itemMeta.goalId) === String(safeMeta.goalId)
            && String(itemMeta.milestone || '') === String(safeMeta.milestone || '')
            && Number(itemMeta.cycle || 0) === Number(safeMeta.cycle || 0)
        ) {
            return true;
        }
        if (String(item?.type || 'info') !== String(type || 'info')) return false;

        if (safeMeta && itemMeta) {
            const sameThresholdMeta =
                String(itemMeta.category || '') === String(safeMeta.category || '')
                && String(itemMeta.monthKey || '') === String(safeMeta.monthKey || '')
                && Number(itemMeta.thresholdPct || 0) === Number(safeMeta.thresholdPct || 0)
                && Number(itemMeta.cycle || 0) === Number(safeMeta.cycle || 0)
                && String(itemMeta.notificationKey || '') === String(safeMeta.notificationKey || '');
            if (sameThresholdMeta) return true;
        }

        return String(item?.title || '') === safeTitle
            && String(item?.message || '') === safeMessage;
    });

    if (hasExact) return false;

    const createdAtMs = Date.now();
    const newNotif = {
        id: createdAtMs,
        title: safeTitle,
        message: safeMessage,
        type,
        time: new Date().toISOString(),
        createdAtMs,
        unread: true,
        action: action ? { label: action.label, callbackString: action.callbackString } : null,
        meta: safeMeta,
        remoteId: null,
        remoteSynced: false
    };

    notifications.unshift(newNotif);
    
    localStorage.setItem('smartwallet_notifications', JSON.stringify(notifications));

    // Update unread count and UI if event listeners are active
    if (typeof window.updateUnreadCount === 'function') {
        try {
            window.updateUnreadCount();
        } catch (e) {
            console.warn('Immediate unread update failed:', e);
        }
    }
    window.dispatchEvent(new CustomEvent('notification-created', { detail: newNotif }));

    const syncUid = window.auth?.currentUser?.isAnonymous ? null : window.auth?.currentUser?.uid;
    if (syncUid && window.NotificationsEngine?.syncStoredNotificationToFirestore) {
        window.NotificationsEngine.syncStoredNotificationToFirestore(syncUid, newNotif).catch((e) => {
            console.warn('Failed to sync local notification to Firestore:', e);
        });
    }
    
    // Also show a toast for immediate feedback if it's high priority
    if (type === 'warning' || type === 'error') {
        showToast(`🔔 ${title}`);
    }
}

/**
 * Clean AI-generated text by stripping markdown and extra formatting
 * @param {string} text 
 * @returns {string}
 */
export function cleanAIText(text) {
    if (!text) return '';
    
    let cleaned = repairTextArtifacts(text)
        .replace(/###/g, '')
        .replace(/#{1,6}\s?/g, '')
        .replace(/`/g, '')
        .replace(/(^|[\n])\s*[-*]\s+/g, '$1')
        .replace(/\r\n/g, '\n')
        .replace(/\n+/g, ' ')
        .trim();
    
    cleaned = cleaned
        .replace(/\s+/g, ' ')
        .replace(/\s([.,!?;:])/g, '$1')
        .trim();
    
    cleaned = cleaned.replace(/(\u20B1?\s?)(\d{1,3})(\d{3,})(?!\d)/g, (match, p1, p2, p3) => {
        const fullNum = p2 + p3;
        const formatted = parseInt(fullNum, 10).toLocaleString('en-US');
        return p1 + formatted;
    });

    cleaned = cleaned.replace(/(\u20B1?\s?)(\d{1,3})(\d{3,})(?!\d)/g, (match, p1, p2, p3) => {
        const fullNum = p2 + p3;
        const formatted = parseInt(fullNum, 10).toLocaleString('en-US');
        return p1 + formatted;
    });

    cleaned = cleaned
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        .replace(/(^|\s)(Recommendation:)/gi, '$1<span class="ai-summary-highlight">$2</span>')
        .replace(/(^|\s)(Tip:)/gi, '$1<span class="ai-summary-highlight">$2</span>')
        .replace(/\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    return cleaned;
}

export function formatAIAnalysisHTML(text) {
    if (!text) return '';

    const highlightPhrases = [
        'higher than your recent average',
        'daily average',
        'major budget driver',
        'by month-end',
        'save you around',
        'recurring spending',
        'leading expense',
        'top merchant',
        'top category',
        'small daily purchases',
        'specific promo days',
        'loyalty card'
    ];

    let formatted = cleanAIText(text)
        .replace(/\s*(?:<span class="ai-summary-highlight">)?(?:<strong>)?Recommendation:(?:<\/strong>)?(?:<\/span>)?\s*/gi, '<br><br><strong><span class="ai-summary-highlight">Recommendation:</span></strong> ')
        .replace(/\s*(?:<span class="ai-summary-highlight">)?(?:<strong>)?Tip:(?:<\/strong>)?(?:<\/span>)?\s*/gi, '<br><br><strong><span class="ai-summary-highlight">Tip:</span></strong> ')
        .replace(/^(?:<br><br>\s*)+/, '')
        .replace(/(?:₱|PHP)\s?[\d,]+(?:\.\d+)?/g, '<strong>$&</strong>')
        .replace(/\b\d+(?:\.\d+)?%/g, '<strong>$&</strong>')
        .replace(/\b(with|at|on|for|to|around)\s+([A-Z0-9][A-Z0-9&./-]*(?:\s+[A-Z0-9][A-Z0-9&./-]*){1,5})\b/g, '$1 <strong>$2</strong>');

    highlightPhrases.forEach((phrase) => {
        const phraseRegex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        formatted = formatted.replace(phraseRegex, '<span class="ai-summary-highlight">$&</span>');
    });

    return formatted.trim();
}

/**
 * Strip HTML tags from email/Gmail body text (matches inline index.html helper).
 * @param {string} html
 * @returns {string}
 */
export function stripTags(html) {
    if (!html) return '';
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/(^|[\n])\s*[-*]\s+/g, '$1')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>| <\/div>|<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, ' | ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .trim();
}

/**
 * Animate a number from start to end over a duration
 * @param {HTMLElement} el - Element to update
 * @param {number} start - Starting value
 * @param {number} end - Ending value
 * @param {number} duration - Animation duration in ms
 * @param {function} formatFn - Optional formatter (e.g. (v) => `₱${v.toLocaleString()}`)
 */
export function animateNumber(el, start, end, duration = 100, formatFn = null) {
    if (!el) return;
    
    // Quick escape for first render or if values are same
    if (Math.abs(start - end) < 0.01) {
        el.innerText = formatFn ? formatFn(end) : end;
        return;
    }

    const startTime = performance.now();
    
    const update = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out quad
        const easedProgress = progress * (2 - progress);
        const current = start + (end - start) * easedProgress;
        
        const displayVal = formatFn ? formatFn(current) : Math.floor(current);
        
        // Only update if text actually changed to save DOM cycles
        if (el.innerText !== displayVal) {
            el.innerText = displayVal;
        }
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // Final snap to exact value
            el.innerText = formatFn ? formatFn(end) : end;
        }
    };
    
    requestAnimationFrame(update);
}

