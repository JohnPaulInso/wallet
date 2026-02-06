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
    
    // ===== NAVIGATION BEHAVIOR =====
    
    /**
     * Handle navigation tab click
     * If clicking active tab, scroll to top instead of reload
     */
    handleNavClick(targetPage, currentPage) {
        // If clicking the current page, scroll to top
        if (targetPage === currentPage) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            console.log('📜 Scrolling to top (already on this page)');
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
        const navMap = {
            'index.html': 'wallet',
            'calendar.html': 'calendar',
            'accounts.html': 'accounts',
            'goals.html': 'goals'
        };
        
        // Find all navigation links
        const navLinks = document.querySelectorAll('.bottom-nav a, .nav-item a');
        
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                const isActive = link.classList.contains('active');
                
                // Check if this is the current page or an active tab placeholder
                if (href === '#' || isActive || href === currentPage || href.includes(currentPage)) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    console.log('📜 Scrolling to top (clicked active tab)');
                } else if (href && href !== 'javascript:void(0)') {
                    // Save scroll before navigating
                    this.saveScrollPosition(currentPage);
                }
            });
        });
        
        console.log(`🔗 Navigation handlers setup for ${currentPage}`);
    },
    
    // ===== PULL-TO-REFRESH INTEGRATION =====
    
    /**
     * Initialize pull-to-refresh for a page
     */
    initPullToRefresh(onRefresh) {
        let startY = 0;
        let currentY = 0;
        let isPulling = false;
        const threshold = 80;
        
        const wrapper = document.querySelector('.mobile-wrapper') || document.body;
        const spinner = document.getElementById('pullRefreshSpinner');
        
        wrapper.addEventListener('touchstart', (e) => {
            if (wrapper.scrollTop === 0) {
                startY = e.touches[0].pageY;
                isPulling = true;
            }
        }, { passive: true });
        
        wrapper.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            
            currentY = e.touches[0].pageY;
            const pullDistance = currentY - startY;
            
            if (pullDistance > 0 && wrapper.scrollTop === 0) {
                const progress = Math.min(pullDistance / threshold, 1);
                if (spinner) {
                    spinner.style.opacity = progress;
                    spinner.style.transform = `translateY(${pullDistance * 0.5}px) rotate(${progress * 360}deg)`;
                }
            }
        }, { passive: true });
        
        wrapper.addEventListener('touchend', async () => {
            if (!isPulling) return;
            
            const pullDistance = currentY - startY;
            isPulling = false;
            
            if (pullDistance > threshold) {
                console.log('🔄 Pull-to-refresh triggered');
                if (spinner) {
                    spinner.style.opacity = '1';
                    spinner.classList.add('spinning');
                }
                
                // Call the refresh callback
                if (onRefresh) {
                    await onRefresh();
                }
                
                // Reset spinner
                setTimeout(() => {
                    if (spinner) {
                        spinner.style.opacity = '0';
                        spinner.style.transform = 'translateY(0) rotate(0)';
                        spinner.classList.remove('spinning');
                    }
                }, 500);
            } else {
                // Reset spinner
                if (spinner) {
                    spinner.style.opacity = '0';
                    spinner.style.transform = 'translateY(0) rotate(0)';
                }
            }
            
            startY = 0;
            currentY = 0;
        }, { passive: true });
        
        console.log('🔄 Pull-to-refresh initialized');
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
        window.addEventListener('popstate', (event) => {
            // 1. Check if a modal is open
            if (this.modalStack.length > 0) {
                const modal = this.modalStack.pop();
                if (modal && typeof modal.closeFn === 'function') {
                    console.log(` Back button: Closing modal ${modal.id}`);
                    modal.closeFn();
                    return;
                }
            }
            
            // 2. Hierarchical Navigation: If not on index.html, go to index.html
            const isMainPage = currentPage === 'index.html' || currentPage === '/' || currentPage === '';
            if (!isMainPage) {
                console.log(` Back button: Navigating to Wallet (index.html)`);
                window.location.href = 'index.html';
            } else {
                console.log(' Back button: At Wallet page, default behavior');
            }
        });
        
        console.log(` Hierarchical back navigation initialized for ${currentPage}`);
    },
    
    /**
     * Quick initialization for pages - combines all common setup
     * @param {string} pageName - Name of the current page (e.g., 'goals.html')
     * @param {Function} onRefresh - Callback function to execute on refresh
     */
    quickInit(pageName, onRefresh) {
        // Load and apply profile data
        this.loadProfile();
        
        // Load and apply card color
        this.loadCardColor();
        
        // Setup navigation handlers
        this.setupNavHandlers(pageName);
        
        // Restore scroll position
        this.restoreScrollPosition(pageName);
        
        // Initialize pull-to-refresh
        this.initPullToRefresh(onRefresh);
        
        // Initialize hierarchical back navigation
        this.initBackNavigation(pageName);
        
        console.log(`✅ NavState quick init complete for ${pageName}`);
    }
};

// Make NavState globally available
window.NavState = NavState;
