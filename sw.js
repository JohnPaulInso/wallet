const CACHE_NAME = 'smartwallet-v2.0';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './index.js',
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
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://fonts.googleapis.com/css2?family=Lexend:wght@700;800;900&display=swap',
    'https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap',
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
