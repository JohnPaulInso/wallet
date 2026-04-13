/**
 * Navigation State Management Module
 * Handles cross-page state persistence, profile data, and navigation behavior
 */

const NavState = {
    // ===== PROFILE DATA MANAGEMENT =====
    
    /**
     * Save user profile data to localStorage
     * @param {string} name - User's display name
     * @param {string} photoUrl - User's profile picture URL
     * @param {string} email - User's email address
     */
    saveProfile(name, photoUrl, email = '') {
        if (name) localStorage.setItem('user_name', name);
        if (photoUrl) localStorage.setItem('user_pic', photoUrl);
        if (email) localStorage.setItem('user_email', email);
        console.log('💾 Profile saved:', { name, photoUrl, email });
    },
    
    /**
     * Save card color to localStorage
     * @param {string} color - Card color hex code
     */
    saveCardColor(color) {
        if (color) {
            localStorage.setItem('card_color', color);
            console.log('🎨 Card color saved:', color);
        }
    },
    
    /**
     * Load and apply card color to header
     */
    loadCardColor() {
        try {
            const color = localStorage.getItem('card_color');
            if (!color) return null;
            
            const cardIcon = document.getElementById('header-card-icon');
            if (!cardIcon) {
                console.log('⚠️ Card icon element not found yet');
                return color;
            }
            
            const rect = cardIcon.querySelector('rect');
            if (!rect) {
                console.log('⚠️ Card rect element not found');
                return color;
            }
            
            rect.setAttribute('fill', color);
            console.log('🎨 Card color applied:', color);
            return color;
        } catch (error) {
            console.error('Error loading card color:', error);
            return null;
        }
    },
    
    /**
     * Load profile data and update header elements
     */
    loadProfile() {
        try {
            const name = localStorage.getItem('user_name');
            const pic = localStorage.getItem('user_pic');
            const email = localStorage.getItem('user_email');
            
            // Extract full first name (first 2 words if available, e.g., "John Paul")
            let displayName = null;
            if (name) {
                const parts = name.trim().split(/\s+/);
                // Take first 2 words if available, otherwise just first word
                displayName = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0];
            }
            
            // Update header name if element exists
            const nameEl = document.getElementById('userName') || document.getElementById('user-display-name') || document.querySelector('.user-name');
            if (nameEl && displayName) {
                nameEl.textContent = displayName;
            }
            
            // Update profile picture if element exists
            const badge = document.getElementById('profile-badge') || document.querySelector('.profile-badge');
            const picEl = document.getElementById('userPic') || document.getElementById('user-pic') || document.querySelector('.user-pic');
            const iconEl = badge ? badge.querySelector('i.material-icons') : null;

            if (picEl && pic) {
                picEl.src = pic;
                picEl.style.display = 'block';
                if (badge) badge.classList.add('has-pic');
                if (iconEl) iconEl.style.display = 'none';
            } else if (iconEl) {
                iconEl.style.display = 'block';
            }
            
            // Update email header if element exists
            const emailEl = document.getElementById('dropdown-user-email');
            if (emailEl && email) {
                emailEl.textContent = email.toUpperCase();
            }
            
            console.log('📥 Profile loaded:', { displayName, pic, email });
            return { name: displayName, pic, email };
        } catch (error) {
            console.error('Error loading profile:', error);
            return { name: null, pic: null, email: null };
        }
    },
    
    // ===== SCROLL POSITION MANAGEMENT =====
    
    /**
     * Save scroll position for current page
     */
    saveScrollPosition(page) {
        const scrollPos = window.scrollY || document.documentElement.scrollTop;
        sessionStorage.setItem(`scroll_${page}`, scrollPos);
        console.log(`📍 Scroll saved for ${page}:`, scrollPos);
    },
    
    /**
     * Restore scroll position for page
     */
    restoreScrollPosition(page) {
        const scrollPos = sessionStorage.getItem(`scroll_${page}`);
        if (scrollPos) {
            setTimeout(() => {
                window.scrollTo(0, parseInt(scrollPos));
                console.log(`📍 Scroll restored for ${page}:`, scrollPos);
            }, 100);
        }
    },
    
    // ===== PAGE STATE CACHING =====
    
    /**
     * Save page state data to localStorage
     */
    savePageState(page, data) {
        try {
            const stateKey = `page_state_${page}`;
            const state = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(stateKey, JSON.stringify(state));
            console.log(`💾 Page state saved for ${page}`);
        } catch (e) {
            console.error('Failed to save page state:', e);
        }
    },
    
    /**
     * Load page state data from localStorage
     * Returns null if cache is older than maxAge (default 5 minutes)
     */
    loadPageState(page, maxAge = 5 * 60 * 1000) {
        try {
            const stateKey = `page_state_${page}`;
            const stateStr = localStorage.getItem(stateKey);
            if (!stateStr) return null;
            
            const state = JSON.parse(stateStr);
            const age = Date.now() - state.timestamp;
            
            if (age > maxAge) {
                console.log(`⏰ Page state for ${page} expired (${Math.round(age/1000)}s old)`);
                return null;
            }
            
            console.log(`📥 Page state loaded for ${page}`);
            return state.data;
        } catch (e) {
            console.error('Failed to load page state:', e);
            return null;
        }
    },

    getActiveSPAIndex() {
        const viewport = document.getElementById('view-viewport');
        if (!viewport) return 0;
        if (typeof this.lastSPAIndex === 'number') return this.lastSPAIndex;
        return Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1));
    },

    getActiveSPAView() {
        const viewport = document.getElementById('view-viewport');
        if (!viewport) return null;
        const views = viewport.querySelectorAll('.view-section');
        return views[this.getActiveSPAIndex()] || null;
    },

    scrollActiveSPAViewToTop() {
        const activeView = this.getActiveSPAView();
        if (!activeView || activeView.scrollTop <= 4) return false;
        activeView.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
    },
    
    // ===== NAVIGATION BEHAVIOR =====
    
    /**
     * Handle navigation tab click
     * If clicking active tab, scroll to top instead of reload
     */
    handleNavClick(targetPage, currentPage) {
        // If clicking the current page, scroll to top
        if (targetPage === currentPage) {
            return false; // Prevent navigation
        }
        
        // Save scroll position before navigating away
        this.saveScrollPosition(currentPage);
        return true; // Allow navigation
    },
    
    /**
     * Setup navigation click handlers for bottom nav
     */
    setupNavHandlers(currentPage) {
        const isSPA = currentPage === 'index.html' || currentPage === '/' || currentPage === '';

        const animateActiveViewScrollToTop = () => {
            const viewport = document.getElementById('view-viewport');
            if (!viewport) return false;
            const views = viewport.querySelectorAll('.view-section');
            const activeIndex = typeof this.lastSPAIndex === 'number'
                ? this.lastSPAIndex
                : Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1));
            const activeView = views[activeIndex];
            if (!activeView) return false;

            const startTop = activeView.scrollTop;
            if (startTop <= 2) return false;

            const duration = Math.min(360, Math.max(220, startTop * 0.35));
            const startTime = performance.now();
            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

            if (this.viewScrollTopAnimationFrame) {
                window.cancelAnimationFrame(this.viewScrollTopAnimationFrame);
                this.viewScrollTopAnimationFrame = null;
            }

            const animateStep = (now) => {
                const elapsed = now - startTime;
                const progress = Math.min(1, elapsed / duration);
                const eased = easeOutCubic(progress);
                activeView.scrollTop = startTop * (1 - eased);

                if (progress < 1) {
                    this.viewScrollTopAnimationFrame = window.requestAnimationFrame(animateStep);
                    return;
                }

                activeView.scrollTop = 0;
                this.viewScrollTopAnimationFrame = null;
            };

            this.viewScrollTopAnimationFrame = window.requestAnimationFrame(animateStep);
            if (window.triggerHaptic) window.triggerHaptic('selection');
            return true;
        };
        
        const handleBottomNavTap = (link, index, e) => {
            if (!isSPA || !link.closest('.bottom-nav')) return false;
            const now = Date.now();
            if (link._lastNavTapAt && (now - link._lastNavTapAt) < 300) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                return true;
            }
            link._lastNavTapAt = now;
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const currentIndex = typeof this.lastSPAIndex === 'number'
                ? this.lastSPAIndex
                : index;
            if (index === currentIndex) {
                animateActiveViewScrollToTop();
                return true;
            }
            if (typeof window.scrollToView === 'function') {
                window.scrollToView(index);
            }
            return true;
        };

        const bottomNavItems = Array.from(document.querySelectorAll('.bottom-nav .nav-item'));
        bottomNavItems.forEach((link, index) => {
            if (link.dataset.navBound === 'true') return;
            link.dataset.navBound = 'true';
            link.dataset.tabIndex = String(index);

            link.addEventListener('click', (e) => {
                handleBottomNavTap(link, index, e);
            });

            link.addEventListener('pointerup', (e) => {
                handleBottomNavTap(link, index, e);
            });

            link.addEventListener('touchend', (e) => {
                handleBottomNavTap(link, index, e);
            }, { passive: false });
        });

        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav && bottomNav.dataset.navDelegateBound !== 'true') {
            bottomNav.dataset.navDelegateBound = 'true';

            const delegatedTap = (e) => {
                const target = e.target && e.target.closest ? e.target.closest('.nav-item') : null;
                if (!target || !bottomNav.contains(target)) return;
                const index = Number.parseInt(target.dataset.tabIndex ?? '-1', 10);
                if (!Number.isFinite(index) || index < 0) return;
                handleBottomNavTap(target, index, e);
            };

            bottomNav.addEventListener('click', delegatedTap, true);
            bottomNav.addEventListener('pointerup', delegatedTap, true);
            bottomNav.addEventListener('touchend', delegatedTap, { passive: false, capture: true });
        }

        const navLinks = document.querySelectorAll('.nav-item a');
        navLinks.forEach((link) => {
            if (link.dataset.navBound === 'true') return;
            link.dataset.navBound = 'true';
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href') || '';
                const isActive = link.classList.contains('active');

                if (href === '#' || isActive || href === currentPage || href.includes(currentPage)) {
                    e.preventDefault();
                } else if (href && href !== 'javascript:void(0)') {
                    this.saveScrollPosition(currentPage);
                }
            });
        });
        
        if (isSPA) this.initSPAViewSync();
        console.log(`🔗 Navigation handlers setup for ${currentPage}`);
    },

    /**
     * SPA VIEWPORT SYNCHRONIZATION (Horizontal Swiping)
     * Added: 2026-04-02 for 4-tab Single Page Application experience
     */
    initSPAViewSync() {
        const viewport = document.getElementById('view-viewport');
        if (!viewport) return;
        if (this.spaViewSyncInitialized) return;
        this.spaViewSyncInitialized = true;

        // [NEW: INITIAL LOAD LOCK - 2026-04-03]
        this.isInitialLoad = true;
        setTimeout(() => { this.isInitialLoad = false; }, 1500);

        const persistActiveTab = () => {
            const liveIndex = viewport && viewport.clientWidth > 0
                ? Math.round(viewport.scrollLeft / viewport.clientWidth)
                : null;
            const index = typeof liveIndex === 'number' && Number.isFinite(liveIndex)
                ? liveIndex
                : (typeof this.lastSPAIndex === 'number' ? this.lastSPAIndex : 0);
            localStorage.setItem('spa_active_tab', index);
            localStorage.setItem('wallet_last_spa_tab', index);
        };

        console.log('🏁 Initializing SPA Viewport Sync...');

        // 1. Initial Position Restore (Persistence) - [REFINED: Added Account Restore - 2026-04-03]
        const savedTab = localStorage.getItem('wallet_last_spa_tab') ?? localStorage.getItem('spa_active_tab');
        const savedAcc = localStorage.getItem('wallet_current_account');

        if (savedAcc && typeof window.switchAccount === 'function') {
            console.log(`💳 Restoring active account: ${savedAcc}`);
            window.switchAccount(savedAcc, true); // True = silent restore
        }

        if (savedTab !== null) {
            const index = parseInt(savedTab, 10);
            console.log(`🏠 Restoring SPA tab from storage: ${index}`);
            // [REFINED: 3-Stage Re-assertion - 2026-04-03]
            // Combats layout shifts from late-loading modules/CSS
            const reAssert = () => {
                viewport.scrollLeft = viewport.clientWidth * index;
                this.updateActiveTabUI(index, true);
            };

            window.requestAnimationFrame(reAssert); // Instant
            setTimeout(reAssert, 100);  // Early boot
            setTimeout(reAssert, 500);  // Mid boot (Fast path finish)
            setTimeout(reAssert, 1500); // Late boot (Firebase/Import finish)
        }

        window.addEventListener('pagehide', persistActiveTab);
        window.addEventListener('beforeunload', persistActiveTab);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') persistActiveTab();
        });

        const settleToNearestTab = (forcedIndex = null, smooth = true) => {
            if (!viewport || viewport.clientWidth === 0) return;

            const views = document.querySelectorAll('.view-section');
            const maxIndex = Math.max(views.length - 1, 0);
            const rawIndex = forcedIndex === null
                ? Math.round(viewport.scrollLeft / viewport.clientWidth)
                : forcedIndex;
            const targetIndex = Math.max(0, Math.min(rawIndex, maxIndex));
            const targetX = viewport.clientWidth * targetIndex;
            const distance = Math.abs(viewport.scrollLeft - targetX);

            if (this.spaAnimationFrame) {
                window.cancelAnimationFrame(this.spaAnimationFrame);
                this.spaAnimationFrame = null;
            }
            if (this.spaSettleTimer) {
                window.clearTimeout(this.spaSettleTimer);
                this.spaSettleTimer = null;
            }

            const restoreSnapType = () => {
                viewport.style.scrollSnapType = 'x mandatory';
            };

            const finalize = () => {
                viewport.scrollLeft = targetX;
                this.spaAnimationFrame = null;
                this.isProgrammaticSwipe = false;
                restoreSnapType();
                this.updateActiveTabUI(targetIndex, true);
            };

            if (distance <= 1) {
                finalize();
                return;
            }

            if (!smooth) {
                this.isProgrammaticSwipe = false;
                restoreSnapType();
                finalize();
                return;
            }

            const startX = viewport.scrollLeft;
            const deltaX = targetX - startX;
            const duration = Math.min(420, Math.max(280, Math.abs(deltaX) * 0.48));
            const startTime = performance.now();
            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

            this.isProgrammaticSwipe = true;
            viewport.style.scrollSnapType = 'none';

            const animateStep = (now) => {
                const elapsed = now - startTime;
                const progress = Math.min(1, elapsed / duration);
                const eased = easeOutCubic(progress);
                viewport.scrollLeft = startX + (deltaX * eased);

                if (progress < 1) {
                    this.spaAnimationFrame = window.requestAnimationFrame(animateStep);
                    return;
                }

                finalize();
            };

            this.spaAnimationFrame = window.requestAnimationFrame(animateStep);
        };

        const playDirectionalTabTransition = (targetIndex, directionClass) => {
            const views = document.querySelectorAll('.view-section');
            const targetView = views[targetIndex];
            if (!targetView || !directionClass) return;

            const fromX = directionClass === 'tab-slide-in-from-right' ? 34 : -34;
            const keyframes = [
                { opacity: 1, transform: `translate3d(${fromX}px, 0, 0)` },
                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
            ];
            const timing = {
                duration: 320,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
                fill: 'none'
            };

            try {
                if (typeof targetView.getAnimations === 'function') {
                    targetView.getAnimations().forEach((animation) => {
                        if (animation && animation.id === 'spa-nav-slide') {
                            animation.cancel();
                        }
                    });
                }
                if (typeof targetView.animate === 'function') {
                    const animation = targetView.animate(keyframes, timing);
                    animation.id = 'spa-nav-slide';
                }
            } catch (error) {
                console.debug('Directional tab WAAPI animation fallback used:', error);
            }

            targetView.classList.remove('tab-slide-in-from-right', 'tab-slide-in-from-left', 'tab-nav-animating');
            void targetView.offsetWidth;
            targetView.classList.add('tab-nav-animating', directionClass);

            window.clearTimeout(targetView._navAnimTimer);
            targetView._navAnimTimer = window.setTimeout(() => {
                targetView.classList.remove('tab-nav-animating', directionClass);
            }, 360);
        };

        // 2. Scroll listener to update Bottom Nav active state during swipe
        let isScrolling;
        viewport.addEventListener('scroll', () => {
            // [FIX: Initial Load Reset - 2026-04-03]
            // Ignore "noisy" scroll events during the first 1.5s of boot
            if (this.isInitialLoad) return;
            if (this.isProgrammaticSwipe) return;

            window.clearTimeout(isScrolling);
            isScrolling = setTimeout(() => {
                if (viewport.clientWidth === 0) return; // Safety check
                const index = Math.round(viewport.scrollLeft / viewport.clientWidth);
                settleToNearestTab(index, false);
                this.updateActiveTabUI(index);
            }, 50); 
        }, { passive: true });

        const settleAfterGesture = () => {
            if (this.isInitialLoad || this.isProgrammaticSwipe) return;
            window.requestAnimationFrame(() => settleToNearestTab());
        };

        viewport.addEventListener('touchend', settleAfterGesture, { passive: true });
        viewport.addEventListener('touchcancel', settleAfterGesture, { passive: true });
        viewport.addEventListener('pointerup', settleAfterGesture, { passive: true });
        window.addEventListener('resize', () => settleToNearestTab(this.lastSPAIndex ?? 0, false), { passive: true });

        // 3. Global scrollToView function
        window.scrollToView = (index) => {
            const views = document.querySelectorAll('.view-section');
            const maxIndex = Math.max(views.length - 1, 0);
            const targetIndex = Math.max(0, Math.min(index, maxIndex));
            const currentIndex = typeof this.lastSPAIndex === 'number'
                ? this.lastSPAIndex
                : (viewport.clientWidth === 0 ? 0 : Math.round(viewport.scrollLeft / viewport.clientWidth));
            const targetX = viewport.clientWidth * targetIndex;
            const directionClass = targetIndex > currentIndex
                ? 'tab-slide-in-from-right'
                : targetIndex < currentIndex
                    ? 'tab-slide-in-from-left'
                    : null;

            if (targetIndex === currentIndex) {
                settleToNearestTab(targetIndex, false);
                return;
            }

            this.pendingTabAnimation = directionClass ? { targetIndex, directionClass } : null;
            settleToNearestTab(targetIndex, true);

            if (window.triggerHaptic) {
                window.triggerHaptic('selection');
            }
            
            console.log(`SPA view navigated: ${targetIndex}`);
        };
    },

    /**
     * Update Bottom Nav UI classes based on index
     */
    updateActiveTabUI(index, skipScroll = false) {
        const navItems = document.querySelectorAll('.bottom-nav .nav-item');
        const views = document.querySelectorAll('.view-section');

        localStorage.setItem('spa_active_tab', index);
        localStorage.setItem('wallet_last_spa_tab', index);

        views.forEach((view, viewIndex) => {
            if (viewIndex === index) view.classList.add('active-view');
            else view.classList.remove('active-view');
        });

        navItems.forEach((item, i) => {
            if (i === index) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        if (this.pendingTabAnimation && this.pendingTabAnimation.targetIndex === index) {
            const { directionClass } = this.pendingTabAnimation;
            this.pendingTabAnimation = null;
            window.requestAnimationFrame(() => {
                playDirectionalTabTransition(index, directionClass);
            });
        }

        const accountsView = window.AccountsView;
        const accountsNeedsLateInit = index === 2
            && accountsView
            && typeof accountsView.init === 'function'
            && !accountsView.initialized;
        if (this.lastSPAIndex === index && !accountsNeedsLateInit) return;
        this.lastSPAIndex = index;

        // [FIX: View Refresh Logic - 2026-04-03]
        // Trigger data refresh when landing on a tab (swipe or click)
        if (index === 0 && typeof window.loadData === 'function') {
            window.loadData();
        }
        if (index === 1 && typeof window.renderCalendar === 'function') {
            window.renderCalendar();
        }
        if (index === 2 && window.AccountsView && typeof window.AccountsView.init === 'function') {
            window.AccountsView.init();
        }
        if (index === 3 && typeof window.loadGoals === 'function') {
            window.loadGoals();
        }
    },

    prepareSPATabRefreshState(index) {
        if (index === 0 || index === 1) {
            const spinner = document.getElementById('loading-spinner');
            if (spinner) spinner.style.display = 'block';

            if (typeof window.updateInsightCards === 'function') {
                window.updateInsightCards(null);
            }

            const aiLoading = document.getElementById('ai-loading');
            if (aiLoading) aiLoading.style.display = 'flex';

            const statIds = ['needs-stats', 'wants-stats', 'savings-stats', 'triple-usage-sub', 'triple-remaining-val'];
            statIds.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.classList.add('skeleton');
            });

            document.querySelectorAll('#triple-bars-view .progress-bar-bg').forEach((el) => {
                el.classList.add('skeleton');
            });
        }

        if (index === 1) {
            const title = document.getElementById('calendar-page-title');
            if (title) {
                title.innerHTML = '<div class="skeleton" style="width: 120px; height: 24px; border-radius: 6px;"></div>';
            }

            const incomeTotalEl = document.getElementById('calendar-income-total');
            const expenseTotalEl = document.getElementById('calendar-expense-total');
            if (incomeTotalEl) {
                incomeTotalEl.classList.add('skeleton');
                incomeTotalEl.textContent = '₱0';
            }
            if (expenseTotalEl) {
                expenseTotalEl.classList.add('skeleton');
                expenseTotalEl.textContent = '₱0';
            }

            const grid = document.getElementById('calendar-page-grid');
            if (grid) {
                grid.querySelectorAll('.day-cell').forEach((cell) => cell.remove());
                const skeletonCell = document.createElement('div');
                skeletonCell.className = 'day-cell skeleton';
                skeletonCell.style.gridColumn = '1 / -1';
                skeletonCell.style.gridRow = '2 / 7';
                skeletonCell.style.height = '300px';
                skeletonCell.style.borderRadius = '16px';
                skeletonCell.style.marginTop = '8px';
                grid.appendChild(skeletonCell);
            }
        }

        if (index === 2 && window.AccountsView && typeof window.AccountsView.showLoadingState === 'function') {
            window.AccountsView.showLoadingState();
        }

        if (index === 3 && window.GoalsView && typeof window.GoalsView.showLoadingState === 'function') {
            window.GoalsView.showLoadingState();
        }
    },

    async refreshSPATab(index) {
        const uid = window.auth?.currentUser?.uid || localStorage.getItem('wallet_last_uid');

        this.prepareSPATabRefreshState(index);

        if (index === 0 || index === 1) {
            if (uid && typeof window.loadData === 'function') {
                await Promise.resolve(window.loadData(uid));
            } else if (index === 1 && typeof window.renderCalendar === 'function') {
                window.renderCalendar();
            }
            if (index === 0 && typeof window.triggerActiveAccountSync === 'function') {
                await Promise.resolve(window.triggerActiveAccountSync(25, true));
            }
            return;
        }

        if (index === 2) {
            if (window.AccountsView && typeof window.AccountsView.refresh === 'function') {
                await Promise.resolve(window.AccountsView.refresh());
            } else if (window.AccountsView && typeof window.AccountsView.init === 'function') {
                window.AccountsView.init();
            }
            if (typeof window.triggerActiveAccountSync === 'function') {
                await Promise.resolve(window.triggerActiveAccountSync(25, true));
            }
            return;
        }

        if (index === 3) {
            if (window.GoalsView && typeof window.GoalsView.refresh === 'function') {
                await Promise.resolve(window.GoalsView.refresh());
            } else if (window.GoalsView && typeof window.GoalsView.loadGoals === 'function') {
                window.GoalsView.loadGoals();
            }
        }
    },

    
    // ===== PULL-TO-REFRESH INTEGRATION =====
    
    /**
     * Pull-to-refresh for SPA tabs.
     */
    initPullToRefresh() {
        const viewport = document.getElementById('view-viewport');
        const wrapper = document.querySelector('.mobile-wrapper');
        if (!viewport || !wrapper) return false;
        if (this.pullToRefreshInitialized) return true;
        this.pullToRefreshInitialized = true;

        let indicator = document.getElementById('spa-pull-refresh');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'spa-pull-refresh';
            indicator.className = 'spa-pull-refresh';
            indicator.innerHTML = `
                <div class="spa-pull-refresh-ring">
                    <div class="spa-pull-refresh-ring-track"></div>
                    <div class="spa-pull-refresh-ring-fill"></div>
                </div>
            `;
            wrapper.appendChild(indicator);
        }

        const threshold = 72;
        const maxPull = 122;
        const resistance = 0.52;
        const topTolerance = 8;
        const ptr = {
            view: null,
            startX: 0,
            startY: 0,
            pull: 0,
            engaged: false,
            canceled: false
        };

        const getCurrentIndex = () => (
            typeof this.lastSPAIndex === 'number'
                ? this.lastSPAIndex
                : Math.round(viewport.scrollLeft / Math.max(viewport.clientWidth, 1))
        );

        const getActiveView = () => {
            const views = viewport.querySelectorAll('.view-section');
            const index = Math.max(0, Math.min(getCurrentIndex(), views.length - 1));
            return views[index] || null;
        };

        const isAtTop = (view) => (view ? (view.scrollTop || 0) <= topTolerance : false);

        const resetPTRGesture = () => {
            ptr.view = null;
            ptr.pull = 0;
            ptr.engaged = false;
            ptr.canceled = false;
        };

        const setIndicatorState = (pullDistance = 0, isReady = false) => {
            const clampedPull = Math.max(0, Math.min(pullDistance, maxPull));
            const progress = Math.max(0, Math.min(clampedPull / threshold, 1));
            indicator.style.setProperty('--ptr-offset', `${clampedPull}px`);
            indicator.style.setProperty('--ptr-progress', progress.toFixed(3));
            indicator.classList.toggle('visible', clampedPull > 0);
            indicator.classList.toggle('ready', isReady);
            indicator.classList.remove('refreshing');
        };

        const hideIndicator = () => {
            indicator.classList.remove('visible', 'ready', 'refreshing');
            indicator.style.setProperty('--ptr-offset', '0px');
            indicator.style.setProperty('--ptr-progress', '0');
        };

        const triggerPTR = async () => {
            if (this.isPullRefreshing) return;
            this.isPullRefreshing = true;

            const tabIndex = getCurrentIndex();
            indicator.classList.add('visible', 'refreshing');
            indicator.classList.remove('ready');
            indicator.style.setProperty('--ptr-offset', '76px');

            if (window.triggerHaptic) {
                window.triggerHaptic('medium');
            }

            const loaderSpinLeadMs = 520;
            const retractMs = 220;

            try {
                await new Promise((resolve) => window.setTimeout(resolve, loaderSpinLeadMs));
                hideIndicator();
                await new Promise((resolve) => window.setTimeout(resolve, retractMs));
                await this.refreshSPATab(tabIndex);
            } catch (error) {
                console.error('Pull-to-refresh failed:', error);
            }
            this.isPullRefreshing = false;
        };

        const onTouchStart = (e) => {
            if (this.isPullRefreshing || this.isProgrammaticSwipe || window.modalOpen) return;
            if (e.touches.length !== 1) return;

            const activeView = getActiveView();
            if (!activeView || e.currentTarget !== activeView) return;
            if (!isAtTop(activeView)) return;

            ptr.view = activeView;
            ptr.startX = e.touches[0].clientX;
            ptr.startY = e.touches[0].clientY;
            ptr.pull = 0;
            ptr.engaged = false;
            ptr.canceled = false;
        };

        const onTouchMove = (e) => {
            if (!ptr.view || ptr.canceled || this.isPullRefreshing || this.isProgrammaticSwipe) return;
            if (ptr.view !== getActiveView()) {
                resetPTRGesture();
                hideIndicator();
                return;
            }

            const touch = e.touches[0];
            const dx = touch.clientX - ptr.startX;
            const dy = touch.clientY - ptr.startY;

            if (dy <= 0 || (!ptr.engaged && !isAtTop(ptr.view))) {
                resetPTRGesture();
                hideIndicator();
                return;
            }

            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
                ptr.canceled = true;
                hideIndicator();
                return;
            }

            if (dy < 8) return;

            ptr.engaged = true;
            ptr.pull = Math.min(maxPull, dy * resistance);
            if (e.cancelable) e.preventDefault();
            setIndicatorState(ptr.pull, ptr.pull >= threshold);
        };

        const onTouchEnd = () => {
            if (!ptr.view) return;

            const shouldRefresh = ptr.engaged && ptr.pull >= threshold && !ptr.canceled;
            resetPTRGesture();

            if (shouldRefresh) {
                triggerPTR();
                return;
            }

            hideIndicator();
        };

        viewport.querySelectorAll('.view-section').forEach((view) => {
            view.addEventListener('touchstart', onTouchStart, { passive: true });
            view.addEventListener('touchmove', onTouchMove, { passive: false });
            view.addEventListener('touchend', onTouchEnd, { passive: true });
            view.addEventListener('touchcancel', onTouchEnd, { passive: true });
        });

        return true;
    },
    
    
    // ===== BACK NAVIGATION & MODAL MANAGEMENT =====
    
    modalStack: [],
    
    /**
     * Push a modal state to browser history
     * @param {string} id - Modal ID
     * @param {Function} closeFn - Callback to close the modal
     */
    pushModalState(id, closeFn) {
        this.modalStack.push({ id, closeFn });
        history.pushState({ modalId: id }, '');
        window.modalOpen = true;
        console.log(` Modal state pushed: ${id}`);
    },
    
    /**
     * Remove a modal state from history if closed via UI
     * @param {string} id - Modal ID
     */
    popModalState(id) {
        const index = this.modalStack.findIndex(m => m.id === id);
        if (index !== -1) {
            this.modalStack.splice(index, 1);
            // If the user closed it via UI, we might be ahead of history
            // but usually we just want to ensure history doesn't close it again
            // history.back() would trigger popstate, so we just manage the stack
        }
    },

    /**
     * Initialize global back button listener
     */
    initBackNavigation(currentPage) {
        const parentMap = {
            'calendar.html': 'index.html',
            'accounts.html': 'index.html',
            'goals.html': 'index.html',
            'edit-goal.html': 'goals.html'
        };

        // Standard Web History Listener
        window.addEventListener('popstate', (event) => {
            if (this.modalStack.length > 0) {
                const modal = this.modalStack.pop();
                if (modal && typeof modal.closeFn === 'function') {
                    console.log(` Back button: Closing modal ${modal.id}`);
                    modal.closeFn();
                    return;
                }
            }
            
            const isMainPage = currentPage === 'index.html' || currentPage === '/' || currentPage === '';
            if (isMainPage) {
                const activeTabIndex = this.getActiveSPAIndex();
                if (activeTabIndex > 0 && typeof window.scrollToView === 'function') {
                    console.log(` Back button: Returning to Wallet tab from SPA tab ${activeTabIndex}`);
                    window.scrollToView(0);
                    return;
                }
            }
            if (!isMainPage) {
                const target = parentMap[currentPage] || 'index.html';
                console.log(` Back button: Navigating to parent: ${target}`);
                window.location.href = target;
            }
        });

        // NATIVE CAPACITOR BACK BUTTON
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            const { App } = window.Capacitor.Plugins;
            if (App) {
                console.log('📱 App plugin found, registering backButton listener');
                let lastBackPress = 0;
                let lastPopStateHandled = 0;

                // Listen for popstate to coordinate with native listener
                window.addEventListener('popstate', () => {
                    lastPopStateHandled = Date.now();
                });

                App.addListener('backButton', ({ canGoBack }) => {
                    const now = Date.now();
                    console.log('📱 Native Back Button Pressed');
                    
                    // If popstate just fired (within 300ms), ignore this native event 
                    if (now - lastPopStateHandled < 300) {
                        console.log('📱 Ignoring native back press: already handled by popstate');
                        return;
                    }

                    // 1. Context Feature: close untouched transaction modal, save only if edited
                    const manualModal = document.getElementById('manual-txn-modal');
                    if (manualModal && manualModal.classList.contains('show')) {
                        const isPristine = typeof window.isManualTxnModalPristine === 'function'
                            ? window.isManualTxnModalPristine()
                            : false;
                        if (isPristine && window.closeModals) {
                            console.log('Back on pristine transaction modal: closing sheet');
                            window.closeModals('manual-txn-modal', true);
                            return;
                        }
                        console.log('Back on edited transaction modal: triggering saveManualTxn()');
                        if (window.saveManualTxn) {
                            window.saveManualTxn();
                            return;
                        }
                    }

                    // 2. Check Modals in Stack (managed by NavState)
                    if (this.modalStack.length > 0) {
                        const modal = this.modalStack.pop();
                        if (modal && typeof modal.closeFn === 'function') {
                            console.log(`🔙 Closing modal from stack: ${modal.id}`);
                            modal.closeFn();
                            return;
                        }
                    }


                    // 4. Check for common UI modals using global flags or .show class
                    const iosMenu = document.getElementById('ios-menu');
                    const notificationSidebar = document.querySelector('.notification-sidebar.active') || document.getElementById('notification-center');
                    const isActuallyVisible = (el) => {
                        if (!el) return false;
                        const computed = window.getComputedStyle ? window.getComputedStyle(el) : null;
                        const displayVisible = computed ? computed.display !== 'none' : true;
                        const visibilityVisible = computed ? computed.visibility !== 'hidden' : true;
                        const opacityVisible = computed ? Number.parseFloat(computed.opacity || '1') > 0.01 : true;
                        return displayVisible && visibilityVisible && opacityVisible;
                    };
                    const visibleOverlay = Array.from(
                        document.querySelectorAll('.modal-overlay, .dialog-overlay, .custom-modal, .login-modal-overlay')
                    ).find((el) => {
                        const hasOpenState = el.classList.contains('show') || el.classList.contains('active');
                        const hasVisibleDisplay = el.style.display === 'flex' || el.style.display === 'block';
                        return (hasOpenState || hasVisibleDisplay) && isActuallyVisible(el);
                    });

                    if (window.modalOpen && !visibleOverlay) {
                        window.modalOpen = false;
                    }

                    const hasVisibleModal = !!visibleOverlay ||
                                          (notificationSidebar && notificationSidebar.classList.contains('active') && isActuallyVisible(notificationSidebar)) ||
                                          (iosMenu && iosMenu.classList.contains('show') && isActuallyVisible(iosMenu));
                    
                    if (hasVisibleModal) {
                        console.log('📱 Visible modal detected via .show or window.modalOpen');
                        
                        // Handle iOS Context Menu specifically if open
                        if (iosMenu && iosMenu.classList.contains('show')) {
                            if (window.closeIOSMenu) {
                                window.closeIOSMenu(true);
                                return;
                            }
                        }

                        if (window.closeModals) {
                            window.closeModals(true); 
                            return;
                        }

                        if (window.toggleNotificationCenter && document.getElementById('notification-center')?.classList.contains('active')) {
                            window.toggleNotificationCenter();
                            return;
                        }
                    }

                    // 2.5 Check for Highlighted Transactions (Pie chart selection)
                    if (document.querySelector('.highlight-txn')) {
                        console.log('📱 Highlighted transactions detected, clearing'); // Clear highlights first // 2026-04-02
                        if (window.highlightTransactions) {
                            window.highlightTransactions(null);
                            return;
                        }
                    }

                    // 2.6 SPA Back Flow: Wallet tab first, then wallet scroll-top, then exit prompt
                    const path = window.location.pathname;
                    const isMainPage = path.endsWith('index.html') || path === '/' || path === '' || currentPage === 'index.html';
                    const activeTabIndex = isMainPage ? this.getActiveSPAIndex() : 0;

                    if (isMainPage && activeTabIndex > 0 && typeof window.scrollToView === 'function') {
                        lastBackPress = 0;
                        console.log('Returning to Wallet tab from SPA tab ' + activeTabIndex);
                        window.scrollToView(0);
                        return;
                    }

                    if (isMainPage && this.scrollActiveSPAViewToTop()) {
                        console.log('[Back to Top] Scrolling active SPA view to top before exit prompt');
                        lastBackPress = 0;
                        return;
                    }


                    // 3. Page Navigation Logic
                    if (!isMainPage) {
                        const target = parentMap[currentPage] || 'index.html';
                        console.log(`🔙 Navigating back to parent: ${target}`);
                        window.location.href = target;
                    } else {
                        // 4. Double-tap to exit logic for Home Page
                        const now = Date.now();
                        if (now - lastBackPress < 2000) {
                            console.log('📱 Exiting app');
                            App.exitApp();
                        } else {
                            lastBackPress = now;
                            const msg = 'Press back again to exit';
                            console.log(`📱 ${msg}`);
                            
                            // Try native toast first, then custom, then alert
                            if (window.Capacitor && window.Capacitor.Plugins.Toast) {
                                window.Capacitor.Plugins.Toast.show({ text: msg, duration: 'short', position: 'bottom' });
                            } else if (window.showToast) {
                                window.showToast(msg);
                            } else {
                                // Create a temporary UI toast if nothing matches
                                const toast = document.createElement('div');
                                toast.style.cssText = "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:white;padding:10px 20px;border-radius:20px;font-size:12px;z-index:99999;font-weight:700;";
                                toast.textContent = msg;
                                document.body.appendChild(toast);
                                setTimeout(() => toast.remove(), 2000);
                            }
                        }
                    }
                });
            } else {
                console.warn('⚠️ Capacitor App plugin not found in window.Capacitor.Plugins');
            }
        }
        
        console.log(` Hierarchical back navigation initialized for ${currentPage}`);
    },
    
    /**
     * Quick initialization for pages - combines all common setup
     * @param {string} pageName - Name of the current page (e.g., 'goals.html')
     * @param {Function} onRefresh - Callback function to execute on refresh
     */
    quickInit(pageName, onRefresh) {
        if (!this.quickInitPages) this.quickInitPages = new Set();
        if (this.quickInitPages.has(pageName)) {
            console.log(`NavState quick init skipped for ${pageName} (already initialized)`);
            return;
        }
        this.quickInitPages.add(pageName);

        // Load and apply profile data
        this.loadProfile();
        
        // Load and apply card color
        this.loadCardColor();
        
        // Setup navigation handlers
        this.setupNavHandlers(pageName);

        // Setup pull-to-refresh for SPA tabs if available
        this.initPullToRefresh();

        // Restore scroll position
        this.restoreScrollPosition(pageName);
        
        // Initialize hierarchical back navigation
        this.initBackNavigation(pageName);
        
        console.log(`✅ NavState quick init complete for ${pageName}`);
    }
};

// Make NavState globally available
window.NavState = NavState;


