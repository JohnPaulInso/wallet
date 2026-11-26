// (2026-07-13) Clean current-merchants-only Logo & Icon customizer; prev: crowded all-in-one modal
(function () {
    const ICON_CHOICES = [
        'storefront', 'shopping_bag', 'shopping_cart', 'local_grocery_store',
        'restaurant', 'local_cafe', 'fastfood', 'local_gas_station',
        'directions_car', 'bolt', 'wifi', 'phone_android',
        'fitness_center', 'sports_basketball', 'movie', 'music_note',
        'flight', 'hotel', 'medical_services', 'school',
        'pets', 'home', 'account_balance', 'credit_card'
    ];

    const COLOR_CHOICES = [
        '#0f172a', '#2563eb', '#0284c7', '#10b981',
        '#16a34a', '#ea580c', '#dc2626', '#db2777',
        '#7c3aed', '#f59e0b', '#0d9488', '#475569'
    ];

    let editorState = {
        view: 'list',
        search: '',
        mode: 'upload',
        keyword: '',
        previewSrc: '',
        selectedIcon: 'storefront',
        selectedColor: '#2563eb'
    };

    function getStorageKey(uid) {
        const id = uid || window.currentUser?.uid || 'guest';
        return `wallet_custom_merchant_logos_${id}`;
    }

    function loadLocalLogos(uid) {
        try {
            const raw = localStorage.getItem(getStorageKey(uid));
            const parsed = raw ? JSON.parse(raw) : {};
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    window.customMerchantLogos = loadLocalLogos();

    function normalizeKey(str) {
        return String(str || '').toUpperCase().replace(/\s+/g, ' ').trim();
    }

    function compactKey(str) {
        return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    // (2026-07-13) In-memory cache for compact icon tokens + debounced single-doc Firestore flush; prev: per-save write + PNG storage
    const iconDataUrlCache = {};
    let pendingCloudTimer = null;
    let lastSyncedHash = '';

    function resolveLogoValue(val) {
        if (!val || val === 'HIDE') return null;
        if (typeof val === 'string' && val.startsWith('icon:')) {
            if (!iconDataUrlCache[val]) {
                const [, ic, hex] = val.split(':');
                iconDataUrlCache[val] = renderIconBadgeToDataUrl(ic || 'storefront', hex || '#2563eb');
            }
            return iconDataUrlCache[val];
        }
        return val;
    }

    window.resolveCustomMerchantLogo = function (merchantName) {
        const map = window.customMerchantLogos;
        if (!map || typeof map !== 'object') return undefined;
        const keys = Object.keys(map);
        if (keys.length === 0) return undefined;

        const targetNorm = normalizeKey(merchantName);
        const targetCompact = compactKey(merchantName);
        if (!targetNorm) return undefined;

        const sortedKeys = keys.sort((a, b) => b.length - a.length);
        for (const rawKey of sortedKeys) {
            const kNorm = normalizeKey(rawKey);
            const kCompact = compactKey(rawKey);
            if (!kNorm) continue;
            if (targetNorm.includes(kNorm) || (kCompact.length >= 3 && targetCompact.includes(kCompact))) {
                const val = map[rawKey];
                if (val === 'HIDE') return null;
                return resolveLogoValue(val);
            }
        }
        return undefined;
    };

    async function flushLogosToCloudNow() {
        if (pendingCloudTimer) {
            clearTimeout(pendingCloudTimer);
            pendingCloudTimer = null;
        }
        const payload = window.customMerchantLogos || {};
        const hash = JSON.stringify(payload);
        if (hash === lastSyncedHash) return;
        if (window.saveCustomMerchantLogosToCloud) {
            try {
                await window.saveCustomMerchantLogosToCloud(payload);
                lastSyncedHash = hash;
            } catch (e) {
                console.warn('[MerchantLogos] Cloud save failed:', e);
            }
        }
    }

    function persistLogos() {
        const uid = window.currentUser?.uid || 'guest';
        try {
            localStorage.setItem(getStorageKey(uid), JSON.stringify(window.customMerchantLogos || {}));
        } catch (e) {
            console.warn('[MerchantLogos] localStorage save failed:', e);
        }
        if (pendingCloudTimer) clearTimeout(pendingCloudTimer);
        pendingCloudTimer = setTimeout(() => { flushLogosToCloudNow(); }, 2500);
        refreshAppLogosUI();
    }

    window.addEventListener('pagehide', () => { flushLogosToCloudNow(); });

    function refreshAppLogosUI() {
        if (window.allTxns && typeof window.renderHistory === 'function') {
            window.renderHistory(window.allTxns);
        }
        if (typeof window.injectBrandLogos === 'function') {
            window.injectBrandLogos();
        }
    }

    // (2026-07-13) Compress uploaded logos to 64px WebP/JPEG (~1-3KB); prev: 96px 0.85
    function compressImageToBadge(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const size = 64;
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, size, size);
                    const minSide = Math.min(img.width, img.height);
                    const sx = (img.width - minSide) / 2;
                    const sy = (img.height - minSide) / 2;
                    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
                    let out = '';
                    try { out = canvas.toDataURL('image/webp', 0.72); } catch (e) {}
                    if (!out || !out.startsWith('data:image/webp')) {
                        out = canvas.toDataURL('image/jpeg', 0.72);
                    }
                    resolve(out);
                };
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function renderIconBadgeToDataUrl(iconName, bgHex) {
        const size = 96;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bgHex || '#2563eb';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '52px "Material Icons"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(iconName || 'storefront', size / 2, size / 2 + 1);
        return canvas.toDataURL('image/png');
    }

    // (2026-07-13) Gather only current merchants from user's transactions + saved custom rules; prev: all 22 builtins
    function getCurrentMerchantsList() {
        const byNorm = new Map();
        const customMap = window.customMerchantLogos || {};

        // 1. Add saved custom rules first
        Object.entries(customMap).forEach(([key, val]) => {
            const norm = normalizeKey(key);
            if (!norm) return;
            byNorm.set(norm, {
                key: norm,
                label: key,
                logo: resolveLogoValue(val),
                status: val === 'HIDE' ? 'hidden' : 'custom',
                count: 0
            });
        });

        // 2. Collect unique current merchants from loaded transactions
        const txns = Array.isArray(window.allTxns) ? window.allTxns : [];
        for (const t of txns) {
            let displayName = '';
            if (typeof window.getMerchantDisplay === 'function') {
                try {
                    const mapped = window.getMerchantDisplay(t.merchant || t.name || '', t.amount || 0, t.category || '');
                    displayName = mapped?.name || '';
                } catch (e) {}
            }
            if (!displayName) displayName = String(t.merchant || t.name || '').trim();
            const norm = normalizeKey(displayName);
            if (!norm || norm.length < 2) continue;

            if (byNorm.has(norm)) {
                byNorm.get(norm).count += 1;
                continue;
            }

            const customHit = window.resolveCustomMerchantLogo(displayName);
            const activeLogo = typeof window.detectTxnLogo === 'function' ? window.detectTxnLogo(displayName) : null;
            let status = 'none';
            if (customHit === null) status = 'hidden';
            else if (customHit !== undefined) status = 'custom';
            else if (activeLogo) status = 'default';

            byNorm.set(norm, {
                key: norm,
                label: displayName,
                logo: activeLogo,
                status,
                count: 1
            });
        }

        // Sort: custom first, then default-logo items, then by frequency
        const rank = { custom: 0, hidden: 1, default: 2, none: 3 };
        return Array.from(byNorm.values()).sort((a, b) => {
            if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
            return b.count - a.count || a.label.localeCompare(b.label);
        });
    }

    function ensureModal() {
        if (document.getElementById('merchant-logos-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'merchant-logos-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display:none;align-items:flex-end;justify-content:center;z-index:100030;backdrop-filter:blur(6px);background:rgba(15,23,42,0.42);';
        modal.onclick = () => window.MerchantLogosModule.close();
        modal.innerHTML = `
            <!-- Clean current-merchants logo customizer sheet -->
            <div class="custom-modal merchant-logos-sheet" onclick="event.stopPropagation()" style="width:100%;max-width:430px;height:80vh;max-height:88vh;border-radius:28px 28px 0 0;padding:14px 20px calc(env(safe-area-inset-bottom, 18px) + 18px);background:#f8fafc;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,0.16);">
                <div style="width:36px;height:4px;background:#cbd5e1;border-radius:2px;margin:0 auto 14px;flex-shrink:0;"></div>

                <!-- Header -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button type="button" id="ml-back-btn" onclick="window.MerchantLogosModule.showListView()" style="display:none;width:34px;height:34px;border-radius:11px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;align-items:center;justify-content:center;cursor:pointer;">
                            <i class="material-icons" style="font-size:18px;">arrow_back</i>
                        </button>
                        <div id="ml-header-icon" style="width:38px;height:38px;border-radius:12px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;">
                            <i class="material-icons" style="font-size:20px;">storefront</i>
                        </div>
                        <div>
                            <div id="ml-header-title" style="font-size:16px;font-weight:800;color:#0f172a;letter-spacing:-0.2px;">Merchant Logos</div>
                            <div id="ml-header-sub" style="font-size:11.5px;color:#64748b;">Tap a merchant to customize its badge</div>
                        </div>
                    </div>
                    <button type="button" onclick="window.MerchantLogosModule.close()" style="width:34px;height:34px;border-radius:11px;border:none;background:#e2e8f0;color:#475569;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                        <i class="material-icons" style="font-size:18px;">close</i>
                    </button>
                </div>

                <!-- LIST VIEW -->
                <div id="ml-list-view" style="display:flex;flex-direction:column;flex:1;min-height:0;">
                    <div style="display:flex;gap:8px;margin-bottom:12px;flex-shrink:0;">
                        <div style="flex:1;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:0 12px;height:40px;">
                            <i class="material-icons" style="font-size:18px;color:#94a3b8;">search</i>
                            <input id="ml-search-input" type="text" placeholder="Filter your merchants..."
                                oninput="window.MerchantLogosModule.onSearch(this.value)"
                                style="border:none;outline:none;background:transparent;font-size:13px;color:#0f172a;width:100%;">
                        </div>
                        <button type="button" onclick="window.MerchantLogosModule.openEditor('')" style="height:40px;padding:0 14px;border-radius:14px;border:none;background:#0f172a;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;gap:4px;cursor:pointer;flex-shrink:0;">
                            <i class="material-icons" style="font-size:16px;">add</i>
                            <span>New</span>
                        </button>
                    </div>
                    <div id="ml-merchants-list" style="flex:1;overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:8px;padding-bottom:6px;"></div>
                </div>

                <!-- EDITOR VIEW -->
                <div id="ml-editor-view" style="display:none;flex-direction:column;flex:1;min-height:0;">
                    <div style="flex:1;overflow-y:auto;min-height:0;">
                        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:16px;margin-bottom:12px;">
                            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
                                <div style="width:52px;height:52px;border-radius:16px;background:#f1f5f9;color:#475569;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;">
                                    <i class="material-icons" style="font-size:24px;">shopping_bag</i>
                                    <div id="ml-preview-badge" style="position:absolute;bottom:-5px;right:-5px;width:24px;height:24px;border-radius:50%;background:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.16);display:none;align-items:center;justify-content:center;overflow:hidden;">
                                        <img id="ml-preview-img" src="" alt="preview" style="width:100%;height:100%;object-fit:cover;">
                                    </div>
                                </div>
                                <div style="flex:1;min-width:0;">
                                    <label style="display:block;font-size:10px;font-weight:800;color:#94a3b8;letter-spacing:0.6px;margin-bottom:4px;">MERCHANT KEYWORD</label>
                                    <input id="ml-keyword-input" type="text" placeholder="e.g. DECATHLON, TECFUEL"
                                        oninput="window.MerchantLogosModule.onKeywordInput(this.value)"
                                        style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;font-size:13.5px;font-weight:700;color:#0f172a;outline:none;">
                                </div>
                            </div>

                            <!-- Mode Switcher -->
                            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#f1f5f9;padding:4px;border-radius:14px;margin-bottom:14px;">
                                <button type="button" id="ml-tab-upload" onclick="window.MerchantLogosModule.setMode('upload')" style="border:none;border-radius:10px;padding:8px 4px;font-size:12px;font-weight:700;cursor:pointer;">Photo</button>
                                <button type="button" id="ml-tab-icon" onclick="window.MerchantLogosModule.setMode('icon')" style="border:none;border-radius:10px;padding:8px 4px;font-size:12px;font-weight:700;cursor:pointer;">Icon</button>
                                <button type="button" id="ml-tab-url" onclick="window.MerchantLogosModule.setMode('url')" style="border:none;border-radius:10px;padding:8px 4px;font-size:12px;font-weight:700;cursor:pointer;">URL</button>
                            </div>

                            <!-- Upload Panel -->
                            <div id="ml-panel-upload">
                                <input type="file" id="ml-file-input" accept="image/*" style="display:none;">
                                <button type="button" onclick="document.getElementById('ml-file-input').click()" style="width:100%;padding:20px 14px;border-radius:16px;border:1.5px dashed #cbd5e1;background:#f8fafc;color:#334155;font-size:13px;font-weight:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
                                    <i class="material-icons" style="font-size:26px;color:#2563eb;">add_photo_alternate</i>
                                    <span>Tap to choose logo image</span>
                                </button>
                            </div>

                            <!-- Icon Panel -->
                            <div id="ml-panel-icon" style="display:none;">
                                <div id="ml-color-grid" style="display:flex;flex-wrap:wrap;gap:9px;margin-bottom:12px;justify-content:center;"></div>
                                <div id="ml-icon-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;"></div>
                            </div>

                            <!-- URL Panel -->
                            <div id="ml-panel-url" style="display:none;">
                                <input id="ml-url-input" type="url" placeholder="https://example.com/logo.png"
                                    oninput="window.MerchantLogosModule.onUrlInput(this.value)"
                                    style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12.5px;color:#0f172a;outline:none;">
                            </div>
                        </div>

                        <div style="display:flex;gap:8px;">
                            <button type="button" id="ml-reset-btn" onclick="window.MerchantLogosModule.resetCurrent()" style="display:none;flex:1;height:42px;border-radius:14px;border:1px solid #fecaca;background:#fff;color:#dc2626;font-size:12.5px;font-weight:700;cursor:pointer;">Reset Default</button>
                            <button type="button" onclick="window.MerchantLogosModule.saveHideRule()" style="flex:1;height:42px;border-radius:14px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:12.5px;font-weight:700;cursor:pointer;">Hide Badge</button>
                        </div>
                    </div>

                    <div style="padding-top:12px;flex-shrink:0;">
                        <button type="button" onclick="window.MerchantLogosModule.saveRule()" style="width:100%;height:46px;border-radius:15px;border:none;background:#0f172a;color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(15,23,42,0.18);">Save Logo</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('ml-file-input').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            e.target.value = '';
            try {
                const compressed = await compressImageToBadge(file);
                editorState.previewSrc = compressed;
                updatePreviewUI();
            } catch (err) {
                if (window.showToast) window.showToast('Could not load image');
            }
        });
    }

    function updatePreviewUI() {
        const badge = document.getElementById('ml-preview-badge');
        const img = document.getElementById('ml-preview-img');
        if (!badge || !img) return;
        if (editorState.previewSrc && editorState.previewSrc !== 'HIDE') {
            img.src = resolveLogoValue(editorState.previewSrc) || '';
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function renderIconPickers() {
        const colorEl = document.getElementById('ml-color-grid');
        const iconEl = document.getElementById('ml-icon-grid');
        if (!colorEl || !iconEl) return;

        colorEl.innerHTML = COLOR_CHOICES.map(c => `
            <button type="button" onclick="window.MerchantLogosModule.pickColor('${c}')"
                style="width:26px;height:26px;border-radius:50%;border:${editorState.selectedColor === c ? '2.5px solid #0f172a' : '2px solid #fff'};background:${c};box-shadow:0 1px 4px rgba(0,0,0,0.16);cursor:pointer;"></button>
        `).join('');

        iconEl.innerHTML = ICON_CHOICES.map(ic => {
            const active = editorState.selectedIcon === ic;
            return `
                <button type="button" onclick="window.MerchantLogosModule.pickIcon('${ic}')"
                    style="height:38px;border-radius:11px;border:${active ? '1.5px solid #2563eb' : '1px solid #e2e8f0'};background:${active ? '#eff6ff' : '#fff'};color:${active ? '#2563eb' : '#475569'};display:flex;align-items:center;justify-content:center;cursor:pointer;">
                    <i class="material-icons" style="font-size:19px;">${ic}</i>
                </button>
            `;
        }).join('');
    }

    function renderCurrentMerchantsList() {
        const listEl = document.getElementById('ml-merchants-list');
        if (!listEl) return;

        const q = normalizeKey(editorState.search);
        const all = getCurrentMerchantsList();
        const filtered = q ? all.filter(m => m.key.includes(q) || normalizeKey(m.label).includes(q)) : all;

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center;padding:34px 16px;color:#94a3b8;font-size:12.5px;">
                    ${q ? 'No matching merchants found.' : 'No merchants yet. Tap New to add one.'}
                </div>
            `;
            return;
        }

        const statusMeta = {
            custom: { text: 'Custom', bg: '#eff6ff', color: '#2563eb' },
            default: { text: 'Default', bg: '#f1f5f9', color: '#64748b' },
            hidden: { text: 'Hidden', bg: '#fef2f2', color: '#dc2626' },
            none: { text: 'No logo', bg: '#f8fafc', color: '#94a3b8' }
        };

        listEl.innerHTML = filtered.map(item => {
            const safeKey = item.key.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const st = statusMeta[item.status] || statusMeta.none;
            const thumbHTML = item.status === 'hidden'
                ? '<i class="material-icons" style="font-size:18px;color:#94a3b8;">visibility_off</i>'
                : (item.logo
                    ? `<img src="${item.logo}" alt="${safeKey}" style="width:100%;height:100%;object-fit:cover;">`
                    : '<i class="material-icons" style="font-size:18px;color:#cbd5e1;">storefront</i>');

            return `
                <div onclick="window.MerchantLogosModule.openEditor('${safeKey}')"
                    style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:18px;background:#fff;border:1px solid #e2e8f0;cursor:pointer;">
                    <div style="width:40px;height:40px;border-radius:50%;background:#f8fafc;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                        ${thumbHTML}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13.5px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.label}</div>
                        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
                            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:${st.bg};color:${st.color};">${st.text}</span>
                            ${item.count > 0 ? `<span style="font-size:10.5px;color:#94a3b8;">${item.count} txn${item.count === 1 ? '' : 's'}</span>` : ''}
                        </div>
                    </div>
                    <i class="material-icons" style="font-size:18px;color:#cbd5e1;">chevron_right</i>
                </div>
            `;
        }).join('');
    }

    function setHeaderForView(isEditor) {
        const backBtn = document.getElementById('ml-back-btn');
        const iconEl = document.getElementById('ml-header-icon');
        const titleEl = document.getElementById('ml-header-title');
        const subEl = document.getElementById('ml-header-sub');
        const listView = document.getElementById('ml-list-view');
        const editorView = document.getElementById('ml-editor-view');

        if (backBtn) backBtn.style.display = isEditor ? 'flex' : 'none';
        if (iconEl) iconEl.style.display = isEditor ? 'none' : 'flex';
        if (titleEl) titleEl.textContent = isEditor ? (editorState.keyword ? 'Customize Logo' : 'New Merchant Logo') : 'Merchant Logos';
        if (subEl) subEl.textContent = isEditor ? 'Choose a photo, icon badge, or URL' : 'Your current merchants & saved logos';
        if (listView) listView.style.display = isEditor ? 'none' : 'flex';
        if (editorView) editorView.style.display = isEditor ? 'flex' : 'none';
    }

    window.MerchantLogosModule = {
        open() {
            const dropdown = document.getElementById('profile-dropdown');
            if (dropdown) dropdown.classList.remove('show');
            ensureModal();
            editorState.search = '';
            const sInput = document.getElementById('ml-search-input');
            if (sInput) sInput.value = '';
            this.showListView();
            const modal = document.getElementById('merchant-logos-modal');
            modal.style.display = 'flex';
            modal.classList.add('show');
        },
        close() {
            // (2026-07-13) Flush batched logo edits once on modal close; prev: write every edit
            flushLogosToCloudNow();
            const modal = document.getElementById('merchant-logos-modal');
            if (!modal) return;
            modal.style.display = 'none';
            modal.classList.remove('show', 'closing');
        },
        showListView() {
            editorState.view = 'list';
            setHeaderForView(false);
            renderCurrentMerchantsList();
        },
        onSearch(val) {
            editorState.search = val;
            renderCurrentMerchantsList();
        },
        openEditor(keyword) {
            const norm = normalizeKey(keyword);
            const customVal = norm ? (window.customMerchantLogos || {})[norm] : undefined;
            const currentLogo = customVal !== undefined
                ? (customVal === 'HIDE' ? '' : customVal)
                : (norm && typeof window.detectTxnLogo === 'function' ? (window.detectTxnLogo(norm) || '') : '');

            editorState.view = 'editor';
            editorState.keyword = norm;
            editorState.previewSrc = currentLogo;
            editorState.mode = 'upload';

            const kwInput = document.getElementById('ml-keyword-input');
            const urlInput = document.getElementById('ml-url-input');
            const resetBtn = document.getElementById('ml-reset-btn');
            if (kwInput) kwInput.value = norm;
            if (urlInput) urlInput.value = (currentLogo && !currentLogo.startsWith('data:')) ? currentLogo : '';
            if (resetBtn) resetBtn.style.display = customVal !== undefined ? 'block' : 'none';

            setHeaderForView(true);
            this.setMode('upload');
            renderIconPickers();
            updatePreviewUI();
        },
        setMode(mode) {
            editorState.mode = mode;
            ['upload', 'icon', 'url'].forEach(m => {
                const tab = document.getElementById(`ml-tab-${m}`);
                const panel = document.getElementById(`ml-panel-${m}`);
                if (tab) {
                    tab.style.background = m === mode ? '#fff' : 'transparent';
                    tab.style.color = m === mode ? '#0f172a' : '#64748b';
                    tab.style.boxShadow = m === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none';
                }
                if (panel) panel.style.display = m === mode ? 'block' : 'none';
            });
            if (mode === 'icon') {
                editorState.previewSrc = `icon:${editorState.selectedIcon}:${editorState.selectedColor}`;
                updatePreviewUI();
            }
        },
        onKeywordInput(val) {
            editorState.keyword = val;
        },
        onUrlInput(val) {
            editorState.previewSrc = String(val || '').trim();
            updatePreviewUI();
        },
        pickColor(hex) {
            editorState.selectedColor = hex;
            renderIconPickers();
            editorState.previewSrc = `icon:${editorState.selectedIcon}:${editorState.selectedColor}`;
            updatePreviewUI();
        },
        pickIcon(ic) {
            editorState.selectedIcon = ic;
            renderIconPickers();
            editorState.previewSrc = `icon:${editorState.selectedIcon}:${editorState.selectedColor}`;
            updatePreviewUI();
        },
        saveRule() {
            const key = normalizeKey(document.getElementById('ml-keyword-input')?.value || editorState.keyword);
            if (!key) {
                if (window.showToast) window.showToast('Enter a merchant keyword first');
                return;
            }
            let src = editorState.previewSrc;
            if (editorState.mode === 'icon') {
                src = `icon:${editorState.selectedIcon}:${editorState.selectedColor}`;
            }
            if (!src) {
                if (window.showToast) window.showToast('Choose a photo, icon, or image URL');
                return;
            }
            window.customMerchantLogos = { ...(window.customMerchantLogos || {}), [key]: src };
            persistLogos();
            this.showListView();
            if (window.showToast) window.showToast(`Saved logo for ${key}`);
        },
        saveHideRule() {
            const key = normalizeKey(document.getElementById('ml-keyword-input')?.value || editorState.keyword);
            if (!key) {
                if (window.showToast) window.showToast('Enter a merchant keyword first');
                return;
            }
            window.customMerchantLogos = { ...(window.customMerchantLogos || {}), [key]: 'HIDE' };
            persistLogos();
            this.showListView();
            if (window.showToast) window.showToast(`Hidden logo for ${key}`);
        },
        resetCurrent() {
            const key = normalizeKey(document.getElementById('ml-keyword-input')?.value || editorState.keyword);
            if (!key) return;
            const next = { ...(window.customMerchantLogos || {}) };
            delete next[key];
            window.customMerchantLogos = next;
            persistLogos();
            this.showListView();
            if (window.showToast) window.showToast(`Reset logo for ${key}`);
        },
        hydrateFromCloud(logosObj, uid) {
            if (logosObj && typeof logosObj === 'object') {
                window.customMerchantLogos = logosObj;
                lastSyncedHash = JSON.stringify(logosObj);
                try {
                    localStorage.setItem(getStorageKey(uid), JSON.stringify(logosObj));
                } catch (e) {}
                refreshAppLogosUI();
            }
        }
    };

    window.openMerchantLogosModal = () => window.MerchantLogosModule.open();
})();
