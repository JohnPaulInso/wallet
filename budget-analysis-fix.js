// CRITICAL FIX: Add this to the end of budget-analysis-overlay.js
// This ensures extended time periods work correctly

// Override renderOverlayContent to hide grid and transactions for extended periods
const originalRenderOverlayContent = window.renderOverlayContent;
if (typeof originalRenderOverlayContent === 'function') {
    window.renderOverlayContent = function() {
        originalRenderOverlayContent();
        
        // Get current filter
        const filterEl = document.getElementById('chart-filter');
        const filterVal = filterEl ? filterEl.value : 'this_month';
        
        // Extended periods should hide grid and transactions
        const extendedPeriods = ['last_7_days', 'last_3_months', 'last_6_months', 'this_year', 'all_time'];
        const isExtended = extendedPeriods.includes(filterVal);
        
        // Hide/show sections
        const grid = document.querySelector('.budget-analysis-grid');
        const txnsSection = document.getElementById('budget-analysis-txns-section');
        
        if (grid) grid.style.display = isExtended ? 'none' : 'grid';
        if (txnsSection) txnsSection.style.display = isExtended ? 'none' : 'flex';
        
        console.log('Render fix applied - Filter:', filterVal, 'Extended:', isExtended);
    };
}
