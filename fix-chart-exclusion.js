/**
 * Fix for pie chart exclusion showing ₱0 instead of remaining total
 * This patches the toggleExpensesChartCategory function
 * Bug: When clicking a slice then long-pressing to exclude it, 
 * center shows ₱0 instead of sum of remaining categories
 * 
 * VERSION 2 - Updated 2026-07-01
 * Changes:
 * - Fixed complete function override (not just wrapping)
 * - Added proper console logging for debugging
 * - Fixed animateElementValueCountdown backward compatibility
 * - Properly exposes both functions globally with window. prefix
 * - Fixed timeout and state management to match original implementation
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
                        .reduce((sum, s) => sum + (Number(s.value) || 0), 0);

                    const startPct = fallbackTotal > 0 ? (seg.value / fallbackTotal) * 100 : 0;
                    const endPct = fallbackTotal > 0 ? (remainingTotal / fallbackTotal) * 100 : 0;

                    console.log('[Fix] Excluding:', categoryName, 'Remaining total:', remainingTotal, 'Segments:', segments.length);

                    // Animate from current slice to remaining total
                    window.animateElementValueCountdown(
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
                window.prevSelectedCategoryName = window.selectedCategoryName;
                
                if (isCurrentlyExcluded) {
                    exclusions.delete(categoryName);
                } else {
                    exclusions.add(categoryName);
                }
                
                if (window.selectedCategoryName === categoryName && exclusions.has(categoryName)) {
                    window.selectedCategoryName = null;
                }
                
                delete window.__expensesChartTransitions[viewKey];
                
                // Calculate final remaining total after exclusion
                const remainingTotal = segments.reduce((sum, seg) => 
                    exclusions.has(seg.name) ? sum : sum + (Number(seg.value) || 0), 0
                );
                
                // Final redraw with correct total
                if (window.drawPieChart) {
                    window.drawPieChart(segments, remainingTotal > 0 ? remainingTotal : fallbackTotal, true);
                }
            }, 450);
        };

        /**
         * Enhanced animation helper that supports animating to a target value
         * instead of always counting down to 0
         * 
         * New signature (9 params): (labelEl, valEl, pctEl, categoryName, startAmt, startPct, endAmt, endPct, duration)
         * Old signature (7 params): (labelEl, valEl, pctEl, categoryName, startAmt, startPct, duration)
         */
        function animateElementValueCountdown(labelEl, valEl, pctEl, categoryName, startAmt, startPct, endAmt, endPct, duration) {
            // Handle backward compatibility with old 7-parameter signature
            if (arguments.length === 7) {
                // Old signature: endAmt parameter is actually the duration
                duration = endAmt; // 7th param is duration in old signature
                endAmt = 0;
                endPct = 0;
            } else if (typeof endAmt !== 'number') {
                endAmt = 0;
                endPct = 0;
            }

            if (labelEl) labelEl.innerText = categoryName;
            const startTime = performance.now();

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

        // Expose the enhanced animator globally - this will override the original
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
