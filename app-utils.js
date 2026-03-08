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

// Show toast notification
export function showToast(msg) {
    const toast = document.getElementById('toast-box');
    const msgEl = document.getElementById('toast-msg');
    if (!toast || !msgEl) {
        console.log('Toast:', msg);
        return;
    }
    msgEl.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
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

// Merchant Mapping & Categorization
export function getMerchantDisplay(name = '', t = {}) {
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
        'TRADERSCONNECT': 'TRADERS CONNECT'
    };

    const finalRaw = cleaned.toUpperCase();
    if (mapping[cleaned]) display.name = mapping[cleaned];
    else if (mapping[finalRaw]) display.name = mapping[finalRaw];

    // 5. CATEGORY DETECTION
    const lowerRaw = finalRaw.toLowerCase();
    const noteLower = (t.note || '').toLowerCase();

    if (finalRaw === 'INCOME' || finalRaw.includes('SALARY') || finalRaw.includes('DIVIDEND') || finalRaw.includes('REFUND SOURCE')) {
        display.category = 'Income';
        display.icon = 'savings';
        display.catClass = 'cat-income';
    } else {
        const keywordMap = [
            { cat: 'Online shopping', key: ['shopee', 'tiktok', 'lazada', 'shein', 'temu', 'shopify', 'grabfood', 'foodpanda', 'amazon', 'ebay'] },
            { cat: 'Shopping', key: ['mall', 'supermet', 'gaisano', 'mr diy', 'watsons', 'sm store', 'sm superm', 'robinsons', 'kkv', 'miniso', 'unitop', 'h&m', 'uniqlo'] },
            { cat: 'Vehicle', key: ['tecfuel', 'tec fuel', 'shell', 'petron', 'seaoil', 'ptt', 'caltex', 'cleanfuel', 'fuel', 'gas', 'toyota', 'honda', 'mitsub', 'car wash', 'autoshop'] },
            { cat: 'Food & Drinks', key: ['jollibee', 'mcdo', 'mcdonald', 'starbucks', 'chowking', 'kfc', 'mang inasal', 'greenwich', 'ribshack', 'coffee', 'resto', 'cafe', 'tea', 'bakery', 'j.co', 'dunkin', 'boba', 'pizza'] },
            { cat: 'Service', key: ['globe', 'smart', 'pldt', 'tm', 'gomo', 'netflix', 'spotify', 'youtube', 'disney', 'prime', 'apple', 'icloud', 'google', 'subscription', 'bill', 'insurance', 'philhealth', 'sss', 'pag-ibig', 'veco', 'mcwd'] },
            { cat: 'Transportation', key: ['grab car', 'grab ride', 'taxi', 'move it', 'joyride', 'angkas', 'jeep', 'bus', 'ferry', 'pier', 'airport', 'airline'] },
            { cat: 'Education', key: ['school', 'university', 'tuition', 'book', 'udemy', 'coursera', 'skillshare', 'training'] },
            { cat: 'Life & Entertainment', key: ['cinema', 'movie', 'game', 'playstation', 'xbox', 'steam', 'valve', 'riot', 'epic', 'skating', 'zoo', 'park', 'concert', 'spotify', 'netflix'] }
        ];

        for (const map of keywordMap) {
            if (map.key.some(k => lowerRaw.includes(k) || noteLower.includes(k))) {
                const findCat = CATEGORIES.find(c => c.id === map.cat);
                if (findCat) {
                    display.category = findCat.id;
                    display.icon = findCat.icon;
                    display.catClass = findCat.cls || 'cat-financial';
                    display.autoSuggested = true; 
                    break;
                }
            }
        }

        if (finalRaw.includes('TRADERSCONNECT') || finalRaw.includes('TRADERS CONNECT')) {
            display.category = 'Trade Copier';
            display.icon = 'hub';
            display.catClass = 'cat-aqua';
        } else if (finalRaw.includes('EQUITY EDGE') || finalRaw.includes('ANALYTICS') || finalRaw.includes('TRADING') || finalRaw.includes('LEVERAGE FUND') || finalRaw.includes('MRCRMT')) {
            display.category = 'Trading Expenses';
            display.icon = 'insights';
            display.catClass = 'cat-trading';
        } else {
            if (display.category === 'Financial Expenses' || !display.category) {
                display.category = 'Financial Expenses';
                display.catClass = 'cat-financial';
            }
        }
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

// Strip HTML tags
export const stripTags = (html) => {
    if (!html) return "";
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
               .replace(/<br\s*\/?>/gi, '\n')
               .replace(/<\/p>| <\/div>|<\/tr>/gi, '\n')
               .replace(/<\/td>/gi, ' | ')
               .replace(/<[^>]*>/g, ' ')
               .replace(/[ \t]+/g, ' ')
               .replace(/\n\s+/g, '\n')
               .trim();
};
