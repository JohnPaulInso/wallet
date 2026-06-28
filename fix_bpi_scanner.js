// Script to fix BPI Scanner issues
const fs = require('fs');

let content = fs.readFileSync('index.html', 'utf8');

// Fix 1: Update buildCardHTML to use "June 24" format and show note
const oldBuildCard = `function buildCardHTML(r) {
                        const isSynced = r.synced;
                        const dateDisplay = r.date ? String(r.date).replace(/^\\d{4}-/, '').replace('-', '/') : 'â€"';`;

const newBuildCard = `function buildCardHTML(r) {
                        const isSynced = r.synced;
                        
                        // Format date as "June 24" instead of "06/24"
                        let dateDisplay = 'â€"';
                        if (r.date) {
                            const d = new Date(r.date);
                            if (!isNaN(d)) {
                                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                                dateDisplay = \`\${months[d.getMonth()]} \${d.getDate()}\`;
                            }
                        }
                        const noteOrType = r.note ? r.note : (r.type === 'credit' ? 'Credit' : 'Debit');`;

content = content.replace(oldBuildCard, newBuildCard);

// Fix 2: Update the meta line to show note instead of type
const oldMeta = `<div class="bpi-scan-card-meta">\${dateDisplay} Â· \${r.type === 'credit' ? 'Credit' : 'Debit'}</div>`;
const newMeta = `<div class="bpi-scan-card-meta">\${dateDisplay} Â· \${noteOrType}</div>`;

content = content.replace(oldMeta, newMeta);

// Fix 3: Update acceptCard to show better toast messages with count tracking
const oldAcceptCard = `async function acceptCard(id) {
                        const r = _scanResults.find(x => x._id === id);
                        if (!r || r.synced || r.dismissed) return;
                        try {
                            await pushToBPI(r);
                            r.synced = true;
                            if (typeof showToast === 'function') showToast(\`Added: \${r.merchant}\`);
                        } catch (e) {
                            console.error('[BPIScanner] push failed', e);
                            if (typeof showToast === 'function') showToast('Failed to add transaction');
                        }
                        renderResults();
                    }`;

const newAcceptCard = `// Track accepted transactions count
                    let _acceptedCount = 0;
                    let _acceptTimer = null;

                    async function acceptCard(id) {
                        const r = _scanResults.find(x => x._id === id);
                        if (!r || r.synced || r.dismissed) return;
                        
                        // Show loading animation on card
                        const card = document.querySelector(\`[data-id="\${id}"]\`);
                        if (card) {
                            card.style.transition = 'transform 0.3s ease, opacity 0.3s ease, filter 0.3s ease';
                            card.style.transform = 'scale(0.95)';
                            card.style.filter = 'brightness(1.1)';
                        }
                        
                        try {
                            await pushToBPI(r);
                            r.synced = true;
                            
                            // Increment accepted count
                            _acceptedCount++;
                            
                            // Clear existing timer
                            if (_acceptTimer) clearTimeout(_acceptTimer);
                            
                            // Show toast after a brief delay to collect multiple adds
                            _acceptTimer = setTimeout(() => {
                                const msg = _acceptedCount === 1 
                                    ? 'Added 1 transaction' 
                                    : \`Added \${_acceptedCount} transactions\`;
                                if (typeof showToast === 'function') showToast(msg);
                                _acceptedCount = 0;
                            }, 800);
                            
                        } catch (e) {
                            console.error('[BPIScanner] push failed', e);
                            if (typeof showToast === 'function') showToast('Failed to add transaction');
                        }
                        renderResults();
                    }`;

content = content.replace(oldAcceptCard, newAcceptCard);

fs.writeFileSync('index.html', content, 'utf8');
console.log('BPI Scanner fixes applied!');
