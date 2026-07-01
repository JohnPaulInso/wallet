/**
 * Fix for pie chart exclusion showing ₱0 instead of remaining total
 * This patches the toggleExpensesChartCategory function
 * Bug: When clicking a slice then long-pressing to exclude it, 
 * center shows ₱0 instead of sum of remaining categories
 */

(function() {
    'use strict';

    // Wait for DOM and ensure the original function exists
    const patchChartExclusion = () => {
        // Find the original toggle function in the global scope
        const originalToggle = window.toggleExpensesChartCategory;
        
        if (!originalToggle) {
            console.warn('[Fix] toggleExpensesChartCategory not found yet, will retry...');
            return false;
        }

        console.log('[Fix] Patching toggleExpensesChartCategory...');

        window.toggleExpensesChartCategory = function(viewKey, categoryName, segments, fallbackTotal) {
            if (!viewKey || !categoryName) return;
            
            const exclusions = window.getExpensesChartExclusions ? window.getExpensesChartExclusions(viewKey) : new Set();
            const isCurrentlyExcluded = exclusions.has(categoryName);
            const nextMode = isCurrentlyExcluded ? 'include' : 'exclude';

            // Set up transition state
            window.prevSelectedCategoryName = window.selectedCategoryName;
            window.__expensesChartTransitions = window.__expensesChartTransitions || {};
            window.__expensesChartTransitions[viewKey] = { 
                categoryName, 
                mode: nextMode, 
                startedAt: Date.now() 
            };

            // Redraw chart with transition state
            if (window.drawPieChart) {
                window.drawPieChart(segments, fallbackTotal, true);
            }

            if (nextMode === 'exclude') {
                const seg = segments.find(s => s.name === categoryName);
                if (seg) {
                    const totalVal = document.getElementById('chart-total-val');
                    const totalLabel = document.getElementById('chart-total-label');
                    const totalPct = document.getElementById('chart-total-pct');

                    // **FIX: Calculate remaining total from non-excluded categories**
                    const futureExclusions = new Set(exclusions);
                    futureExclusions.add(categoryName);
                    
                    const remainingTotal = segments
                        .filter(s => !futureExclusions.has(s.name))
                        .reduce((sum, s) => sum + s.value, 0);

                    const startPct = fallbackTotal > 0 ? (seg.value / fallbackTotal) * 100 : 0;
                    const endPct = fallbackTotal > 0 ? (remainingTotal / fallbackTotal) * 100 : 0;

                    // Animate from current slice to remaining total
                    animateElementValueCountdown(
                        totalLabel, 
                        totalVal, 
                        totalPct, 
                        'TOTAL', // Show "TOTAL" instead of excluded category name
                        seg.value,  // Start value
                        startPct,   // Start percentage
                        remainingTotal, // End value (FIX: use remaining total, not 0)
                        endPct,     // End percentage
                        450         // Duration
                    );
                }
            }

            // Finalize exclusion after transition
            clearTimeout(window.__expensesChartTransitionTimers?.[viewKey]);
            window.__expensesChartTransitionTimers = window.__expensesChartTransitionTimers || {};
            window.__expensesChartTransitionTimers[viewKey] = setTimeout(() => {
                window.prevSelectedCategoryName = null;
                
                if (nextMode === 'exclude') {
                    exclusions.add(categoryName);
                    window.selectedCategoryName = null;
                } else {
                    exclusions.delete(categoryName);
                    window.selectedCategoryName = categoryName;
                }

                // Final redraw without transition
                if (window.drawPieChart) {
                    window.drawPieChart(segments, fallbackTotal, false);
                }
            }, 470);
        };

        /**
         * Enhanced animation helper that supports animating to a target value
         * instead of always counting down to 0
         */
        function animateElementValueCountdown(labelEl, valEl, pctEl, categoryName, startAmt, startPct, endAmt, endPct, duration) {
            if (labelEl) labelEl.innerText = categoryName;
            const startTime = performance.now();

            // If endAmt is not provided, default to 0 (backward compatibility)
            if (typeof endAmt === 'number' && typeof endPct !== 'number') {
                // Old signature: (labelEl, valEl, pctEl, categoryName, startAmt, startPct, duration)
                duration = endAmt;
                endAmt = 0;
                endPct = 0;
            } else if (typeof endAmt !== 'number') {
                endAmt = 0;
                endPct = 0;
            }

            function update(now) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

                const currentPct = startPct + (endPct - startPct) * easeProgress;
                const currentAmt = startAmt + (endAmt - startAmt) * easeProgress;

                if (pctEl) {
                    pctEl.innerText = `${currentPct.toFixed(1)}%`;
                }
                if (valEl) {
                    const formatted = `₱${Math.round(currentAmt).toLocaleString()}`;
                    valEl.innerText = localStorage.getItem('balance_hidden') === 'true' ? '******' : formatted;
                    valEl.dataset.raw = formatted;
                }

                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    // Final values
                    if (pctEl) pctEl.innerText = `${endPct.toFixed(1)}%`;
                    if (valEl) {
                        const finalFormatted = `₱${Math.round(endAmt).toLocaleString()}`;
                        valEl.innerText = localStorage.getItem('balance_hidden') === 'true' ? '******' : finalFormatted;
                        valEl.dataset.raw = finalFormatted;
                    }
                }
            }
            requestAnimationFrame(update);
        }

        // Expose the enhanced animator globally
        window.animateElementValueCountdown = animateElementValueCountdown;

        console.log('[Fix] ✓ Chart exclusion fix applied');
        return true;
    };

    // Try patching immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            let attempts = 0;
            const tryPatch = () => {
                if (patchChartExclusion() || attempts++ > 20) {
                    return; // Success or max retries
                }
                setTimeout(tryPatch, 200);
            };
            tryPatch();
        });
    } else {
        let attempts = 0;
        const tryPatch = () => {
            if (patchChartExclusion() || attempts++ > 20) {
                return;
            }
            setTimeout(tryPatch, 200);
        };
        tryPatch();
    }

})();
