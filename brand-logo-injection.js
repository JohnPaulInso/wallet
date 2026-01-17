// BRAND LOGO AUTO-INJECTION SYSTEM
// Add this code to your index.html after the getMerchantDisplay function

// Function to inject brand logos into transaction icons
function injectBrandLogos() {
    // Get all transaction elements
    const transactions = document.querySelectorAll('.premium-txn');
    
    transactions.forEach(txn => {
        // Get merchant name from the transaction
        const merchantEl = txn.querySelector('.txn-merch');
        if (!merchantEl) return;
        
        const merchantName = merchantEl.textContent.toUpperCase();
        
        // Get the icon box
        const iconBox = txn.querySelector('.icon-box');
        if (!iconBox) return;
        
        // Check if badge already exists
        if (iconBox.querySelector('.brand-badge')) return;
        
        // Determine logo based on merchant name
        let logo = null;
        if (merchantName.includes('JOLLIBEE')) logo = 'logos/jollibee.png';
        else if (merchantName.includes('MCDO') || merchantName.includes('MCDONALDS')) logo = 'logos/mcdo.png';
        else if (merchantName.includes('SHELL')) logo = 'logos/shell.png';
        else if (merchantName.includes('SHOPEE')) logo = 'logos/shopee.png';
        else if (merchantName.includes('LAZADA')) logo = 'logos/lazada.jpg';
        else if (merchantName.includes('GLOBE') || merchantName.includes('GOMO')) logo = 'logos/globe.png';
        else if (merchantName.includes('SM ') || merchantName.includes('SM STORE') || merchantName.includes('SM SUPERMARKET')) logo = 'logos/sm.png';
        else if (merchantName.includes('SPOTIFY')) logo = 'logos/spotify.png';
        else if (merchantName.includes('TIKTOK')) logo = 'logos/tiktokshop.png';
        else if (merchantName.includes('TECFUEL') || merchantName.includes('TEC FUEL')) logo = 'logos/tecfuel.png';
        else if (merchantName.includes('TRADERS')) logo = 'logos/tradersconnect.png';
        else if (merchantName.includes('AYALA')) logo = 'logos/ayala.png';
        else if (merchantName.includes('J AND L') || merchantName.includes('JANL')) logo = 'logos/janl.png';
        else if (merchantName.includes('MR DIY')) logo = 'logos/mrdiy.png';
        
        // If logo found, inject badge
        if (logo) {
            const badge = document.createElement('div');
            badge.className = 'brand-badge';
            badge.innerHTML = `<img src="${logo}" alt="brand">`;
            iconBox.appendChild(badge);
        }
    });
}

// Call this function after transactions are loaded
// Add this line at the end of your loadData() function or wherever transactions are rendered:
// injectBrandLogos();

// Also call it whenever the transaction list updates
// You can use a MutationObserver to automatically detect when transactions are added:
const observer = new MutationObserver(() => {
    injectBrandLogos();
});

// Start observing the history container
const historyContainer = document.getElementById('history-container');
if (historyContainer) {
    observer.observe(historyContainer, { childList: true, subtree: true });
}

// Initial injection on page load
document.addEventListener('DOMContentLoaded', () => {
    injectBrandLogos();
});
