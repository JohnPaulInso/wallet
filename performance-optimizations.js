/**
 * Performance Optimizations Module
 * Non-invasive performance improvements for 60fps+ target
 * Created: 2026-07-01
 */

(function() {
    'use strict';

    // ===== 1. CHART RENDERING DEBOUNCE (200ms) =====
    let chartDebounceTimer = null;
    const originalFilterChart = window.filterChart;
    const originalDrawTrendChart = window.drawTrendChart;
    const originalDrawCashFlowChart = window.drawCashFlowChart;

    if (originalFilterChart) {
        window.filterChart = function() {
            clearTimeout(chartDebounceTimer);
            chartDebounceTimer = setTimeout(() => {
                originalFilterChart.apply(this, arguments);
            }, 200);
        };
    }

    if (originalDrawTrendChart) {
        const debouncedDrawTrend = function() {
            clearTimeout(window._trendChartTimer);
            window._trendChartTimer = setTimeout(() => {
                originalDrawTrendChart.apply(this, arguments);
            }, 200);
        };
        window.drawTrendChart = debouncedDrawTrend;
    }

    if (originalDrawCashFlowChart) {
        const debouncedDrawCashFlow = function() {
            clearTimeout(window._cashFlowTimer);
            window._cashFlowTimer = setTimeout(() => {
                originalDrawCashFlowChart.apply(this, arguments);
            }, 200);
        };
        window.drawCashFlowChart = debouncedDrawCashFlow;
    }

    // ===== 2. STATUS BAR RATE LIMITING (500ms cooldown) =====
    let lastStatusBarInit = 0;
    const STATUS_BAR_COOLDOWN = 500;

    if (window.forceNativeStatusBarDark) {
        const originalInit = window.forceNativeStatusBarDark;
        window.forceNativeStatusBarDark = async function() {
            const now = Date.now();
            if (now - lastStatusBarInit < STATUS_BAR_COOLDOWN) {
                return; // Skip if called too recently
            }
            lastStatusBarInit = now;
            return originalInit.apply(this, arguments);
        };
    }

    // ===== 3. MODAL ANIMATION FIX (setTimeout → requestAnimationFrame) =====
    const MODAL_SELECTORS = [
        '.modal-overlay',
        '.goals-modal-overlay',
        '.accounts-modal-overlay',
        '.dialog-overlay'
    ];

    const originalSetTimeout = window.setTimeout;

    // Intercept modal show transitions
    const patchModalAnimations = () => {
        MODAL_SELECTORS.forEach(selector => {
            const modals = document.querySelectorAll(selector);
            modals.forEach(modal => {
                if (modal.dataset.perfPatched === 'true') return;
                modal.dataset.perfPatched = 'true';

                // Watch for style.display changes
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                            const display = modal.style.display;
                            if (display === 'flex' || display === 'block') {
                                // Use rAF instead of setTimeout for show transition
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        modal.classList.add('show');
                                    });
                                });
                            }
                        }
                    });
                });

                observer.observe(modal, {
                    attributes: true,
                    attributeFilter: ['style']
                });
            });
        });
    };

    // Run on DOMContentLoaded and periodically (for dynamically added modals)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patchModalAnimations);
    } else {
        patchModalAnimations();
    }
    setInterval(patchModalAnimations, 5000); // Re-scan every 5s for new modals

    // ===== 4. ADD WILL-CHANGE HINTS FOR GPU ACCELERATION =====
    const addWillChangeHints = () => {
        const heavyElements = [
            '.balance-card',
            '.premium-txn',
            '.chart-card',
            '.trend-card',
            '.goals-list',
            '.calendar-grid',
            '#chart-anim-container',
            '#cashflow-bars'
        ];

        heavyElements.forEach(selector => {
            const els = document.querySelectorAll(selector);
            els.forEach(el => {
                if (!el.style.willChange) {
                    el.style.willChange = 'transform, opacity';
                }
            });
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addWillChangeHints);
    } else {
        addWillChangeHints();
    }

    // ===== 5. LAZY-LOAD CHART.JS (Only when chart element appears) =====
    let chartJsLoaded = false;
    const ensureChartJs = () => {
        if (chartJsLoaded || window.Chart) {
            chartJsLoaded = true;
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => {
                chartJsLoaded = true;
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    // Intercept Chart.js usage
    const chartContainers = [
        '#goals-monthly-chart',
        '#trendPath',
        '#trendArea'
    ];

    const observeChartContainers = () => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !chartJsLoaded) {
                    ensureChartJs();
                }
            });
        }, { rootMargin: '100px' });

        chartContainers.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) observer.observe(el);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeChartContainers);
    } else {
        observeChartContainers();
    }

    console.log('🚀 Performance optimizations loaded');
    console.log('   ✓ Chart debouncing (200ms)');
    console.log('   ✓ Status bar rate limiting (500ms)');
    console.log('   ✓ Modal animation fixes (rAF)');
    console.log('   ✓ GPU hints (will-change)');
    console.log('   ✓ Lazy Chart.js loading');

})();
