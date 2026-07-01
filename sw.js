// [UPDATED: 2026-07-01] Bumped cache version to v7.18 - Performance optimizations for 120fps
// PERF: Removed box-shadow from transitions, added translateZ(0), contain property, backface-visibility
// PERF: Optimized shimmer with will-change, GPU layers
// Privacy: Shows only ****** when hidden
// Shimmer: 10-20s interval, smooth synchronized dual-layer
const CACHE_NAME = 'smartwallet-v7.18';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './index.js',
    './app-data.js',
    './app-ui.js',
    './app-utils.js',
    './notifications-engine.js',
    './accounts-logic.js',
    './goals-logic.js',
    './calendar-logic.js',
    './local-ai.js',
    './config.js',
    './calendar.html',
    './accounts.html',
    './goals.html',
    './edit-goal.html',
    './nav-state.js',
    './brand-logo-injection.js',
    './firebase-config.js',
    './manifest.json',
    './applogo.png',
    // External CDN assets
    'https://cdn.muicss.com/mui-0.10.3/css/mui.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.googleapis.com/css2?family=Lexend:wght@700;800;900&display=swap',
    'https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap',
    'https://fonts.cdnfonts.com/css/lemon-milk',
    // Firebase SDK
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
];

// Install — pre-cache all core assets
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim())
    );
});

// Fetch — Network-first for HTML pages, Cache-first for assets
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Skip non-GET requests and Google auth/API calls
    if (e.request.method !== 'GET') return;
    if (url.hostname.includes('googleapis.com') && !url.pathname.includes('/css')) return;
    if (url.hostname.includes('accounts.google.com')) return;
    if (url.hostname.includes('firebaseapp.com')) return;
    if (url.hostname.includes('firebasestorage.app')) return;

    // HTML pages: Network-first (fresh when online, cached when offline)
    if (e.request.mode === 'navigate' || e.request.destination === 'document') {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                    return response;
                })
                .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
        );
        return;
    }

    // All other assets: Cache-first (fast), update cache in background
    e.respondWith(
        caches.match(e.request).then((cached) => {
            const fetchPromise = fetch(e.request).then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
