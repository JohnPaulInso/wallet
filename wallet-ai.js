/* ==========================================================
   wallet-ai.js — SmartWallet AI Engine
   Provides a fullscreen chat experience powered by Gemini 2.5 Flash.
   Features:
   - Direct Firebase auth/firestore sync for sessions & memories
   - ChatGPT-style sidebar for listing & switching past conversations
   - Long-term memory vault ("save on memory" trigger)
   - Dynamic 3-month detailed transaction snapshot feed
   - Marked.js markdown rendering support
   - DOM optimizations (collapses messages beyond last 15)
   - 4-line height auto-resizing textarea
   ========================================================== */

(function () {
    // -----------------------------------------------------------------------
    // CONSTANTS & PARAMS
    // -----------------------------------------------------------------------
    const MESSAGES_LIMIT     = 15;  // Hide messages older than this
    const MAX_HISTORY_STORED = 80;  // Max messages per session doc
    const MAX_HISTORY_SENT   = 30;  // Context history window sent to Gemini

    // -----------------------------------------------------------------------
    // STATE
    // -----------------------------------------------------------------------
    let currentSessionId = '';    // Active chat session ID
    let conversationHistory = []; // Active conversation messages: { role: 'user'|'model', parts: [{text}] }
    let sessionsList = [];        // Loaded past chat session logs
    let memoryList = [];          // Long-term user preferences & facts
    let notebookList = [];        // Archived Q&A notes
    let isWaitingForResponse = false;
    let dataLoaded = false;
    
    // Rate limiting
    let requestCount = 0;
    let rateLimitResetTime = null;
    const MAX_REQUESTS_PER_DAY = 50; // Adjust based on your needs
    const RATE_LIMIT_KEY = 'smartwallet_ai_rate_limit';
    const RATE_LIMIT_COUNT_KEY = 'smartwallet_ai_request_count';

    // -----------------------------------------------------------------------
    // DOM REFS
    // -----------------------------------------------------------------------
    let overlay, messagesEl, typingEl, inputEl, sendBtn, suggestionsEl, sidebarListEl, sidebarEl;

    // Helper: generate unique session ID
    function generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Helper: get Gemini API request URL
    function getGeminiUrl() {
        const apiKey = window.CONFIG?.GEMINI_API_KEY || window.AI_CONFIG?.GEMINI_API_KEY;
        const model = window.CONFIG?.MODEL || 'gemini-2.5-flash';
        return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    }
    
    // Rate Limiting Functions
    function initRateLimit() {
        const stored = localStorage.getItem(RATE_LIMIT_KEY);
        const storedCount = localStorage.getItem(RATE_LIMIT_COUNT_KEY);
        
        if (stored) {
            rateLimitResetTime = new Date(stored);
            const now = new Date();
            
            // Reset if it's a new day
            if (now > rateLimitResetTime) {
                requestCount = 0;
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(0, 0, 0, 0);
                rateLimitResetTime = tomorrow;
                localStorage.setItem(RATE_LIMIT_KEY, rateLimitResetTime.toISOString());
                localStorage.setItem(RATE_LIMIT_COUNT_KEY, '0');
            } else {
                requestCount = parseInt(storedCount || '0', 10);
            }
        } else {
            // Initialize for the first time
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            rateLimitResetTime = tomorrow;
            requestCount = 0;
            localStorage.setItem(RATE_LIMIT_KEY, rateLimitResetTime.toISOString());
            localStorage.setItem(RATE_LIMIT_COUNT_KEY, '0');
        }
    }
    
    function checkRateLimit() {
        initRateLimit();
        return requestCount < MAX_REQUESTS_PER_DAY;
    }
    
    function incrementRequestCount() {
        requestCount++;
        localStorage.setItem(RATE_LIMIT_COUNT_KEY, requestCount.toString());
    }
    
    function getRateLimitMessage() {
        const remaining = MAX_REQUESTS_PER_DAY - requestCount;
        if (remaining <= 5 && remaining > 0) {
            return `You have ${remaining} request${remaining === 1 ? '' : 's'} remaining today.`;
        }
        return null;
    }
    
    function formatResetTime() {
        if (!rateLimitResetTime) return 'tomorrow';
        const now = new Date();
        const diff = rateLimitResetTime - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `in ${hours} hour${hours === 1 ? '' : 's'}`;
        } else if (minutes > 0) {
            return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
        } else {
            return 'soon';
        }
    }

    // -----------------------------------------------------------------------
    // FINANCIAL DATA SNAPSHOT
    // -----------------------------------------------------------------------
    function buildSystemPrompt() {
        const user = window.auth?.currentUser;
        const userName = user?.displayName || 'User';
        const userEmail = user?.email || '';
        const now = new Date();

        // 1. Get Dashboard Month Context
        const monthContext = window.getDashboardMonthContext ? window.getDashboardMonthContext() : null;
        const currentYear = monthContext ? monthContext.year : now.getFullYear();
        const currentMonthIdx = monthContext ? monthContext.monthIndex : now.getMonth();
        const currentMonthLabel = monthContext ? monthContext.labelTitle : now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

        // 2. Sort all transactions newest first
        // [FIX 2026-07-04] Exclude Atome payments and income from expense context - Antigravity
        const isAtomePayment = (t) => /atome/i.test(t.merchant || t.description || '');
        const isIncomeTransaction = (t) => {
            const amt = t.manualAmount !== undefined ? t.manualAmount : (t.amount || 0);
            const cat = t.category || t.manualCategory || '';
            return t.type === 'income' || t.isIncome || cat === 'Income' || amt < 0;
        };
        const sortedAllTxns = [...(window.allTxns || [])]
            .filter(t => !isAtomePayment(t)) // Exclude Atome credit repayments
            .sort((a, b) => {
                const da = new Date(a.date || a.transactionDate || 0);
                const db = new Date(b.date || b.transactionDate || 0);
                return db - da;
            });

        // 3. Filter active transactions (selected month) and compile past 3 months
        const activeMonthTxns = sortedAllTxns.filter(t => {
            const d = new Date(t.date || t.transactionDate);
            return d.getFullYear() === currentYear && d.getMonth() === currentMonthIdx;
        });

        const threeMonthsAgo = new Date(currentYear, currentMonthIdx - 3, 1);
        const detailedTxns = sortedAllTxns.filter(t => {
            const d = new Date(t.date || t.transactionDate);
            return d >= threeMonthsAgo;
        }).slice(0, 150);

        const otherTxns = sortedAllTxns.filter(t => {
            const d = new Date(t.date || t.transactionDate);
            return d < threeMonthsAgo;
        });

        // 4. Construct summaries
        let activeMonthSummary = 'No transactions recorded for this month.';
        if (activeMonthTxns.length > 0) {
            let totalSpent = 0;
            let totalIncome = 0;
            activeMonthTxns.forEach(t => {
                const amt = t.manualAmount || t.amount || 0;
                const isInc = t.type === 'income' || t.isIncome || amt < 0;
                if (isInc) totalIncome += Math.abs(amt);
                else totalSpent += Math.abs(amt);
            });
            activeMonthSummary = `Spent (Expenses): ₱${totalSpent.toLocaleString('en-PH', { maximumFractionDigits: 0 })} | Income: ₱${totalIncome.toLocaleString('en-PH', { maximumFractionDigits: 0 })} | Count: ${activeMonthTxns.length}`;
        }

        let detailedSummary = 'No recent transactions found.';
        if (detailedTxns.length > 0) {
            let totalSpent = 0;
            let totalIncome = 0;
            const byCat = {};
            const byMer = {};
            const itemLines = [];

            detailedTxns.forEach(t => {
                const amt = t.manualAmount || t.amount || 0;
                const isInc = t.type === 'income' || t.isIncome || amt < 0;
                const absAmt = Math.abs(amt);

                // Resolve category and merchant display name
                const resolved = (typeof window.getMerchantDisplay === 'function')
                    ? window.getMerchantDisplay(t.merchant || t.description || '', t)
                    : null;
                const cat = t.category || t.manualCategory || resolved?.category || 'Uncategorized';
                const mer = resolved?.name || t.merchant || t.description || 'Unknown';

                if (isInc) {
                    totalIncome += absAmt;
                } else {
                    totalSpent += absAmt;
                    byCat[cat] = (byCat[cat] || 0) + absAmt;
                    byMer[mer] = (byMer[mer] || 0) + absAmt;
                }

                const date = t.date || t.transactionDate || '';
                itemLines.push(`  * ${date} | ${mer} [${cat}] -> ₱${absAmt.toLocaleString('en-PH', { maximumFractionDigits: 0 })} (${isInc ? 'Income' : 'Expense'})`);
            });

            const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8)
                .map(([k, v]) => `  * ${k}: ₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`).join('\n');
            const topMers = Object.entries(byMer).sort((a, b) => b[1] - a[1]).slice(0, 8)
                .map(([k, v]) => `  * ${k}: ₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`).join('\n');

            detailedSummary = `Total Spent (Expenses): ₱${totalSpent.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
Total Income: ₱${totalIncome.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
Transactions count: ${detailedTxns.length}

TOP SPENDING CATEGORIES:
${topCats}

TOP SPENDING MERCHANTS:
${topMers}

FULL RECENT TRANSACTION LOG (sorted newest first):
${itemLines.join('\n')}`;
        }

        let historySummary = 'No older month data found.';
        if (otherTxns.length > 0) {
            const byMonth = {};
            otherTxns.forEach(t => {
                const amt = Math.abs(t.manualAmount || t.amount || 0);
                const isInc = t.type === 'income' || t.isIncome || (t.manualAmount || t.amount || 0) < 0;
                if (isInc) return;
                const d = new Date(t.date || t.transactionDate);
                const monthKey = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                byMonth[monthKey] = (byMonth[monthKey] || 0) + amt;
            });
            historySummary = Object.entries(byMonth).slice(0, 6)
                .map(([k, v]) => `  * ${k}: Spent ₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`).join('\n');
        }

        const cfg = window.safeToSpendConfig || {};
        const needsBudget   = cfg.needsBudget   || cfg.needs_budget   || 0;
        const wantsBudget   = cfg.wantsBudget   || cfg.wants_budget   || 0;
        const savingsBudget = cfg.savingsBudget || cfg.savings_budget || 0;
        const safeToSpend   = cfg.safeToSpend   || cfg.safe_to_spend  || 0;
        const monthlyIncome = cfg.monthlyIncome || cfg.income         || 0;

        let trendSummary = 'No trend data available.';
        if (window.budgetData && window.budgetData.trends) {
            const t = window.budgetData.trends;
            const labels = window.budgetData.trendLabels || [];
            const lines = labels.map((lbl, i) => {
                const n = t.needs?.[i] || 0;
                const w = t.wants?.[i] || 0;
                const s = t.savings?.[i] || 0;
                return `  ${lbl}: Needs ₱${n.toFixed(0)} | Wants ₱${w.toFixed(0)} | Savings ₱${s.toFixed(0)}`;
            });
            trendSummary = lines.join('\n');
        }

        let goalsSummary = 'No goals data available.';
        try {
            const goalsData = window.GoalsView?.goalsList || window._goalsCache || [];
            if (goalsData.length > 0) {
                goalsSummary = goalsData.slice(0, 8).map(g => {
                    const target = g.targetAmount || g.target || 0;
                    const current = g.currentAmount || g.saved || 0;
                    const pct = target > 0 ? Math.round((current / target) * 100) : 0;
                    return `  "${g.name || g.goalName || 'Goal'}": ₱${current.toLocaleString('en-PH', { maximumFractionDigits: 0 })} / ₱${target.toLocaleString('en-PH', { maximumFractionDigits: 0 })} (${pct}%)`;
                }).join('\n');
            }
        } catch (e) { }

        let notebookSummary = 'No previous notebook memory recorded yet.';
        if (notebookList.length > 0) {
            notebookSummary = notebookList.map(entry => `  * ${entry.replace(/\n/g, ' ')}`).join('\n');
        }

        let memorySummary = 'No long-term memories saved yet.';
        if (memoryList.length > 0) {
            memorySummary = memoryList.map(fact => `  * ${fact}`).join('\n');
        }

        return `You are SmartWallet AI — a smart, friendly, and deeply knowledgeable personal finance assistant embedded directly inside the SmartWallet app used by ${userName}.

You have FULL ACCESS to the user's real financial data (provided below). Always use this data when answering. Reference specific transactions, merchants, categories, amounts, or dates when relevant. Do NOT make up numbers.

=== USER PROFILE ===
Name: ${userName}
Email: ${userEmail}
Date/Time: ${now.toLocaleString('en-PH')}

=== USER LONG-TERM MEMORY (Facts & Preferences) ===
These are facts, preferences, or rules the user explicitly asked you to remember. Respect and prioritize these in your answers:
${memorySummary}

=== SAVED KNOWLEDGE NOTEBOOK (From past chats) ===
The user has asked these questions and resolved these topics in previous chat sessions. Use this as extra context to personalize your answers and recall past discussions:
${notebookSummary}

=== SELECTED MONTH OVERVIEW: ${currentMonthLabel.toUpperCase()} ===
${activeMonthSummary}

=== RECENT DETAILED TRANSACTIONS (Last 3 Months) ===
${detailedSummary}

=== PREVIOUS MONTHS HISTORICAL SPENDING (for comparison) ===
${historySummary}

=== BUDGET SETTINGS ===
Monthly Income: ₱${monthlyIncome.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
Needs Budget:   ₱${needsBudget.toLocaleString('en-PH', { maximumFractionDigits: 0 })} / month
Wants Budget:   ₱${wantsBudget.toLocaleString('en-PH', { maximumFractionDigits: 0 })} / month
Savings Target: ₱${savingsBudget.toLocaleString('en-PH', { maximumFractionDigits: 0 })} / month
Safe to Spend:  ₱${safeToSpend.toLocaleString('en-PH', { maximumFractionDigits: 0 })} remaining

=== SPENDING TRENDS (week-by-week) ===
${trendSummary}

=== SAVINGS GOALS ===
${goalsSummary}

=== YOUR RULES ===
- Always respond in a warm, friendly, conversational tone — you are a helpful financial coach, not a robot.
- Use Philippine Peso (₱) for all amounts.
- Be specific: reference real merchants, categories, amounts, and dates from the data above.
- Give forward-looking, actionable tips — not just summaries. Highlight areas where they can prevent overspending.
- Keep responses concise but thorough. Use bullet lists for steps.
- When asked for tips, give at least 3 concrete, personalised suggestions based on the actual data.
- If the user's question cannot be answered from the data (e.g. a future prediction), be honest and explain your reasoning.
- Do NOT say "I don't have access to your data" — you DO have it above.`;
    }

    // -----------------------------------------------------------------------
    // FIREBASE PERSISTENCE & LOADING
    // -----------------------------------------------------------------------
    async function loadAllData() {
        try {
            const uid = window.auth?.currentUser?.uid;
            if (!uid || !window.db) return;

            // 1. Load active chat history (legacy fallback)
            const ref = window.doc(window.db, `users/${uid}/ai_data/chat_history`);
            const snap = await window.getDoc(ref);
            if (snap.exists()) {
                const data = snap.data();
                conversationHistory = data.messages || [];
            }

            // 2. Load notebook memory
            const notebookRef = window.doc(window.db, `users/${uid}/ai_data/chat_notebook`);
            const notebookSnap = await window.getDoc(notebookRef);
            if (notebookSnap.exists()) {
                const data = notebookSnap.data();
                notebookList = data.notebook || [];
            }

            // 3. Load long-term memory vault
            const memoryRef = window.doc(window.db, `users/${uid}/ai_data/chat_memory`);
            const memorySnap = await window.getDoc(memoryRef);
            if (memorySnap.exists()) {
                const data = memorySnap.data();
                memoryList = data.memory || [];
            }

            // 4. Load multiple sessions (ChatGPT style list)
            const sessionsColl = window.collection(window.db, `users/${uid}/ai_sessions`);
            const sessionsSnap = await window.getDocs(sessionsColl);
            sessionsList = [];
            sessionsSnap.forEach(doc => {
                sessionsList.push(doc.data());
            });
            sessionsList.sort((a, b) => b.updatedAt - a.updatedAt);

            // Auto-select latest active session or create new
            if (sessionsList.length > 0) {
                const latest = sessionsList[0];
                currentSessionId = latest.id;
                conversationHistory = latest.messages || [];
            } else {
                currentSessionId = generateSessionId();
                conversationHistory = [];
            }

            dataLoaded = true;
            renderSidebar();
            restoreHistoryUI();
        } catch (e) {
            console.warn('[SmartWalletAI] Error loading database assets:', e.message);
        }
    }

    async function saveActiveSession() {
        try {
            const uid = window.auth?.currentUser?.uid;
            if (!uid || !window.db || !currentSessionId) return;

            if (conversationHistory.length === 0) return;

            // Generate title from first user query
            let title = 'New Conversation';
            const firstUserMsg = conversationHistory.find(m => m.role === 'user');
            if (firstUserMsg) {
                const text = firstUserMsg.parts?.[0]?.text || '';
                title = text.length > 25 ? text.substring(0, 22) + '...' : text;
            }

            const docRef = window.doc(window.db, `users/${uid}/ai_sessions/${currentSessionId}`);
            const data = {
                id: currentSessionId,
                title: title,
                messages: conversationHistory.slice(-MAX_HISTORY_STORED),
                updatedAt: Date.now()
            };
            await window.setDoc(docRef, data);

            // Update local memory list copy & sidebar
            const idx = sessionsList.findIndex(s => s.id === currentSessionId);
            if (idx > -1) {
                sessionsList[idx] = data;
            } else {
                sessionsList.push(data);
            }
            sessionsList.sort((a, b) => b.updatedAt - a.updatedAt);
            renderSidebar();
        } catch (e) {
            console.warn('[SmartWalletAI] Error saving active session:', e.message);
        }
    }

    // Save active text history legacy doc (non-blocking fallback)
    async function saveHistory() {
        try {
            const uid = window.auth?.currentUser?.uid;
            if (!uid || !window.db) return;
            const ref = window.doc(window.db, `users/${uid}/ai_data/chat_history`);
            await window.setDoc(ref, { messages: conversationHistory.slice(-MAX_HISTORY_STORED), updatedAt: Date.now() });
        } catch (e) { }
    }

    async function saveMemory(newFacts) {
        try {
            const uid = window.auth?.currentUser?.uid;
            if (!uid || !window.db) return;
            const ref = window.doc(window.db, `users/${uid}/ai_data/chat_memory`);
            memoryList = [...memoryList, ...newFacts].slice(-50);
            await window.setDoc(ref, { memory: memoryList, updatedAt: Date.now() });
        } catch (e) {
            console.warn('[SmartWalletAI] Error updating long-term memory:', e.message);
        }
    }

    // -----------------------------------------------------------------------
    // GREETING & LONG-TERM MEMORY EXTRACT ENGINE
    // -----------------------------------------------------------------------
    async function extractAndSaveMemory(userText) {
        // Build extract payload
        const promptText = `Extract the key personal facts, budget goals, or financial rules/preferences from this statement to store in user's long-term memory: "${userText}".
Return ONLY a raw list of bullet points starting with a hyphen (e.g. "- Loves saving"). Do NOT include intro or wrap text. If there are no concrete facts to remember, reply with ONLY "No facts found."`;

        const geminiUrl = getGeminiUrl();
        const payload = {
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 200 }
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        try {
            const res = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) return null;
            const data = await res.json();
            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (reply.includes('No facts found')) return null;

            // Extract facts from bullet points
            const facts = reply.split('\n')
                .map(line => line.replace(/^[\s\-*•]+/, '').trim())
                .filter(line => line.length > 2);

            if (facts.length > 0) {
                await saveMemory(facts);
                return facts;
            }
        } catch (e) {
            clearTimeout(timeoutId);
            console.warn('[SmartWalletAI] Memory extract failed:', e);
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // GEMINI CALL CORE
    // -----------------------------------------------------------------------
    async function callGemini(userText) {
        conversationHistory.push({ role: 'user', parts: [{ text: userText }] });

        const systemPrompt = buildSystemPrompt();
        const recentHistory = conversationHistory.slice(-MAX_HISTORY_SENT);

        const payload = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: recentHistory,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
                topP: 0.9,
            }
        };

        const geminiUrl = getGeminiUrl();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        let res;
        try {
            res = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (err) {
            clearTimeout(timeoutId);
            throw new Error(err.name === 'AbortError' ? 'Request timed out after 12 seconds' : err.message);
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const errorMessage = errData?.error?.message || '';
            
            // Handle rate limit errors professionally
            if (res.status === 429 || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit')) {
                throw new Error('RATE_LIMIT');
            }
            
            throw new Error(errorMessage || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';

        conversationHistory.push({ role: 'model', parts: [{ text: botText }] });

        // Increment request count after successful response
        incrementRequestCount();

        // Save active session & history (non-blocking)
        saveActiveSession().catch(() => {});
        saveHistory().catch(() => {});

        return botText;
    }

    // -----------------------------------------------------------------------
    // MARKDOWN COMPILER
    // -----------------------------------------------------------------------
    function renderMarkdown(text) {
        if (window.marked && typeof window.marked.parse === 'function') {
            try {
                window.marked.setOptions({ breaks: true, gfm: true });
                return window.marked.parse(text);
            } catch (e) {
                console.warn('[SmartWalletAI] marked.js failed, falling back:', e);
            }
        }
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^[\-•]\s(.+)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
            .replace(/\n{2,}/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^(?!<[uo]l)(.+)/, '<p>$1</p>');
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function hideSuggestions() {
        if (suggestionsEl) suggestionsEl.style.display = 'none';
    }

    // -----------------------------------------------------------------------
    // UI MANAGEMENT
    // -----------------------------------------------------------------------
    function appendMessage(role, text) {
        const welcome = messagesEl.querySelector('.ai-welcome');
        if (welcome) welcome.remove();
        hideSuggestions();

        const wrapper = document.createElement('div');
        wrapper.className = `ai-message ${role}`;

        if (role === 'bot') {
            const avatar = document.createElement('div');
            avatar.className = 'ai-avatar';
            avatar.innerHTML = '<span class="material-icons">eco</span>';
            wrapper.appendChild(avatar);
        }

        const bubble = document.createElement('div');
        bubble.className = 'ai-bubble';
        bubble.innerHTML = role === 'bot' ? renderMarkdown(text) : escapeHtml(text);
        wrapper.appendChild(bubble);

        // Insert before typing indicator so it stays at the very bottom
        messagesEl.insertBefore(wrapper, typingEl);
        scrollToBottom();

        // Perform DOM optimization (limit rendered list size)
        optimizeDOMMessages();
    }

    function showTyping() {
        typingEl.classList.add('visible');
        scrollToBottom();
    }

    function hideTyping() {
        typingEl.classList.remove('visible');
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });
    }

    function showError(msg) {
        hideTyping();
        
        // Check if it's a rate limit error
        if (msg.includes('RATE_LIMIT') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit')) {
            const el = document.createElement('div');
            el.className = 'ai-error-bubble ai-rate-limit-bubble';
            el.innerHTML = `
                <div class="ai-rate-limit-icon">
                    <span class="material-icons">schedule</span>
                </div>
                <div class="ai-rate-limit-content">
                    <div class="ai-rate-limit-title">Daily Limit Reached</div>
                    <div class="ai-rate-limit-message">Thank you for using SmartWallet AI! You've reached your daily request limit. Please come back again tomorrow to continue our conversation.</div>
                    <div class="ai-rate-limit-reset">Resets ${formatResetTime()}</div>
                </div>
            `;
            messagesEl.insertBefore(el, typingEl);
        } else {
            const el = document.createElement('div');
            el.className = 'ai-error-bubble';
            el.innerHTML = `<span class="material-icons">error_outline</span><span>${escapeHtml(msg)}</span>`;
            messagesEl.insertBefore(el, typingEl);
        }
        
        scrollToBottom();
    }

    // DOM Optimization: collapse older messages behind a click accordion button
    function optimizeDOMMessages() {
        const msgElems = messagesEl.querySelectorAll('.ai-message');
        if (msgElems.length <= MESSAGES_LIMIT) return;

        let showOlderBtn = messagesEl.querySelector('.ai-show-older-btn');
        if (!showOlderBtn) {
            showOlderBtn = document.createElement('button');
            showOlderBtn.className = 'ai-show-older-btn';
            showOlderBtn.innerHTML = '<span class="material-icons">history</span> Show older messages';
            showOlderBtn.addEventListener('click', () => {
                const hidden = messagesEl.querySelectorAll('.ai-message.ai-msg-hidden');
                hidden.forEach(el => el.classList.remove('ai-msg-hidden'));
                showOlderBtn.remove();
                scrollToBottom();
            });

            // Insert after welcome screen, or as first child
            const welcome = messagesEl.querySelector('.ai-welcome');
            if (welcome) {
                messagesEl.insertBefore(showOlderBtn, welcome.nextSibling);
            } else {
                messagesEl.insertBefore(showOlderBtn, messagesEl.firstChild);
            }
        }

        // Apply hidden class to older messages
        for (let i = 0; i < msgElems.length - MESSAGES_LIMIT; i++) {
            msgElems[i].classList.add('ai-msg-hidden');
        }
    }

    // Render ChatGPT-style Sidebar sessions
    function renderSidebar() {
        if (!sidebarListEl) return;
        sidebarListEl.innerHTML = '';

        if (sessionsList.length === 0) {
            sidebarListEl.innerHTML = `<div style="padding: 16px; font-size: 12.5px; color: rgba(167,243,208,0.4); text-align: center;">No past conversations.</div>`;
            return;
        }

        sessionsList.forEach(session => {
            const btn = document.createElement('button');
            btn.className = `sidebar-item ${session.id === currentSessionId ? 'active' : ''}`;
            btn.innerHTML = `<span class="material-icons">chat_bubble_outline</span><span>${escapeHtml(session.title)}</span>`;
            btn.addEventListener('click', () => switchSession(session.id));
            sidebarListEl.appendChild(btn);
        });
    }

    // Switch active conversation session
    async function switchSession(sessionId) {
        if (sessionId === currentSessionId) return;

        // Save current session before switching
        await saveActiveSession();

        currentSessionId = sessionId;
        const selected = sessionsList.find(s => s.id === sessionId);
        conversationHistory = selected ? (selected.messages || []) : [];

        // Reset UI message board
        const existingMsgs = messagesEl.querySelectorAll('.ai-message, .ai-time-divider, .ai-error-bubble, .ai-show-older-btn');
        existingMsgs.forEach(m => m.remove());

        if (conversationHistory.length > 0) {
            restoreHistoryUI();
        } else {
            // Re-render empty welcome screen
            clearUIPanel();
        }

        renderSidebar();

        // Close sidebar slide on mobile if open
        if (sidebarEl) sidebarEl.classList.remove('sidebar-open');
    }

    function clearUIPanel() {
        const welcomeHTML = `
          <div class="ai-welcome">
            <div class="ai-welcome-icon"><span class="material-icons">eco</span></div>
            <h2>SmartWallet AI</h2>
            <p>I know your transactions, budget, goals, and spending trends. Ask me anything about your finances.</p>
            <div class="ai-welcome-chips-label">Try asking me</div>
          </div>`;
        
        const welcome = messagesEl.querySelector('.ai-welcome');
        if (!welcome) {
            messagesEl.insertAdjacentHTML('afterbegin', welcomeHTML);
        }
        suggestionsEl.style.display = '';
        buildSuggestions();
        scrollToBottom();
    }

    // Start a fresh chat
    async function startNewSession() {
        if (conversationHistory.length > 0) {
            await saveActiveSession();
        }
        currentSessionId = generateSessionId();
        conversationHistory = [];

        // Reset UI panel
        const existingMsgs = messagesEl.querySelectorAll('.ai-message, .ai-time-divider, .ai-error-bubble, .ai-show-older-btn');
        existingMsgs.forEach(m => m.remove());
        clearUIPanel();
        renderSidebar();

        if (sidebarEl) sidebarEl.classList.remove('sidebar-open');
    }

    // -----------------------------------------------------------------------
    // SUGGESTED QUESTIONS
    // -----------------------------------------------------------------------
    const SUGGESTIONS = [
        'How much did I spend this month?',
        'What\'s my top spending category?',
        'Am I on track with my budget?',
        'Where am I spending the most?',
        'Give me 3 tips to save more this month',
        'Show my weekly spending trend',
        'How much is safe for me to spend?',
        'Which merchant am I spending the most on?',
    ];

    function buildSuggestions() {
        suggestionsEl.innerHTML = '';
        
        // Add "Complete Summary" button first
        const summaryBtn = document.createElement('button');
        summaryBtn.className = 'ai-chip ai-chip-summary';
        summaryBtn.innerHTML = '<span class="material-icons" style="font-size: 16px; margin-right: 4px;">summarize</span>Complete Summary';
        summaryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showSummaryOptions();
        });
        suggestionsEl.appendChild(summaryBtn);
        
        // Add other suggestion chips
        SUGGESTIONS.forEach(q => {
            const chip = document.createElement('button');
            chip.className = 'ai-chip';
            chip.textContent = q;
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                sendMessage(q);
            });
            suggestionsEl.appendChild(chip);
        });
    }
    
    // Show summary customization options
    function showSummaryOptions() {
        const modal = document.createElement('div');
        modal.className = 'ai-summary-modal';
        modal.innerHTML = `
            <div class="ai-summary-modal-content">
                <div class="ai-summary-modal-header">
                    <h3><span class="material-icons">summarize</span> Complete Summary Options</h3>
                    <button class="ai-summary-close" aria-label="Close">&times;</button>
                </div>
                <div class="ai-summary-modal-body">
                    <div class="ai-summary-option">
                        <label>
                            <span class="material-icons">category</span>
                            <span>Category</span>
                        </label>
                        <select id="summary-category">
                            <option value="all">All Categories</option>
                            <option value="Food & Drinks">Food & Drinks</option>
                            <option value="Shopping">Shopping</option>
                            <option value="Transportation">Transportation</option>
                            <option value="Life & Entertainment">Life & Entertainment</option>
                            <option value="Service">Service</option>
                            <option value="Education">Education</option>
                            <option value="Financial Expenses">Financial Expenses</option>
                            <option value="Online Shopping">Online Shopping</option>
                        </select>
                    </div>
                    <div class="ai-summary-option">
                        <label>
                            <span class="material-icons">account_balance_wallet</span>
                            <span>Budget Type</span>
                        </label>
                        <select id="summary-budget-type">
                            <option value="all">All</option>
                            <option value="wants">Wants</option>
                            <option value="needs">Needs</option>
                            <option value="savings">Savings</option>
                        </select>
                    </div>
                    <div class="ai-summary-option">
                        <label>
                            <span class="material-icons">calendar_today</span>
                            <span>Time Period</span>
                        </label>
                        <select id="summary-timeframe">
                            <option value="this_month">This Month</option>
                            <option value="last_7_days">Last 7 Days</option>
                            <option value="last_3_months">Last 3 Months</option>
                            <option value="last_6_months">Last 6 Months</option>
                            <option value="this_year">This Year</option>
                            <option value="all_time">All Time</option>
                        </select>
                    </div>
                    <div class="ai-summary-option">
                        <label>
                            <span class="material-icons">description</span>
                            <span>Additional Details</span>
                        </label>
                        <textarea id="summary-details" placeholder="e.g., Focus on online shopping trends, compare with last month..." rows="3" maxlength="200"></textarea>
                    </div>
                </div>
                <div class="ai-summary-modal-footer">
                    <button class="ai-summary-cancel">Cancel</button>
                    <button class="ai-summary-generate"><span class="material-icons">auto_awesome</span> Generate Summary</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Fade in animation
        requestAnimationFrame(() => {
            modal.classList.add('ai-summary-modal-visible');
        });
        
        // Close handlers
        const closeModal = () => {
            modal.classList.remove('ai-summary-modal-visible');
            setTimeout(() => modal.remove(), 300);
        };
        
        modal.querySelector('.ai-summary-close').addEventListener('click', closeModal);
        modal.querySelector('.ai-summary-cancel').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // Generate handler
        modal.querySelector('.ai-summary-generate').addEventListener('click', () => {
            const category = document.getElementById('summary-category').value;
            const budgetType = document.getElementById('summary-budget-type').value;
            const timeframe = document.getElementById('summary-timeframe').value;
            const details = document.getElementById('summary-details').value.trim();
            
            closeModal();
            generateSummary(category, budgetType, timeframe, details);
        });
    }
    
    // Generate complete summary based on user selections
    function generateSummary(category, budgetType, timeframe, details) {
        let prompt = 'Give me a complete financial summary';
        
        const timeLabels = {
            'this_month': 'this month',
            'last_7_days': 'the last 7 days',
            'last_3_months': 'the last 3 months',
            'last_6_months': 'the last 6 months',
            'this_year': 'this year',
            'all_time': 'all time'
        };
        
        if (timeframe !== 'this_month') {
            prompt += ` for ${timeLabels[timeframe]}`;
        }
        
        if (budgetType !== 'all') {
            prompt += `, focusing on ${budgetType}`;
        }
        
        if (category !== 'all') {
            prompt += `, specifically for ${category} category`;
        }
        
        if (details) {
            prompt += `. ${details}`;
        }
        
        prompt += '. Include total spending, top merchants, trends, and actionable recommendations.';
        
        sendMessage(prompt);
    }

    // -----------------------------------------------------------------------
    // RESTORE HISTORY INTO UI
    // -----------------------------------------------------------------------
    function restoreHistoryUI() {
        if (conversationHistory.length === 0) return;

        const welcome = messagesEl.querySelector('.ai-welcome');
        if (welcome) welcome.remove();
        hideSuggestions();

        const existingMsgs = messagesEl.querySelectorAll('.ai-message, .ai-time-divider, .ai-error-bubble, .ai-show-older-btn');
        existingMsgs.forEach(m => m.remove());

        // Add a time divider
        const divider = document.createElement('div');
        divider.className = 'ai-time-divider';
        divider.textContent = 'Conversation History';
        messagesEl.insertBefore(divider, typingEl);

        conversationHistory.forEach(msg => {
            const role = msg.role === 'user' ? 'user' : 'bot';
            const text = msg.parts?.[0]?.text || '';
            if (text) {
                // Inline render without calling optimizeDOMMessages inside loop
                const wrapper = document.createElement('div');
                wrapper.className = `ai-message ${role}`;

                if (role === 'bot') {
                    const avatar = document.createElement('div');
                    avatar.className = 'ai-avatar';
                    avatar.innerHTML = '<span class="material-icons">eco</span>';
                    wrapper.appendChild(avatar);
                }

                const bubble = document.createElement('div');
                bubble.className = 'ai-bubble';
                bubble.innerHTML = role === 'bot' ? renderMarkdown(text) : escapeHtml(text);
                wrapper.appendChild(bubble);

                messagesEl.insertBefore(wrapper, typingEl);
            }
        });

        optimizeDOMMessages();
        scrollToBottom();
    }

    // Restore archived notebook to active view
    async function restoreNotebookToHistory() {
        if (notebookList.length === 0) {
            alert("No saved notebook history found yet!");
            return;
        }

        const restoredHistory = [];
        notebookList.forEach(entry => {
            const parts = entry.split('\nA: ');
            if (parts.length === 2) {
                const question = parts[0].replace(/^Q:\s*/, '');
                const answer = parts[1];
                restoredHistory.push({ role: 'user', parts: [{ text: question }] });
                restoredHistory.push({ role: 'model', parts: [{ text: answer }] });
            }
        });

        if (restoredHistory.length > 0) {
            conversationHistory = restoredHistory;
            restoreHistoryUI();
            await saveHistory();
            await saveActiveSession();
        }
    }

    // -----------------------------------------------------------------------
    // SEND MESSAGE FLOW
    // -----------------------------------------------------------------------
    async function sendMessage(text) {
        try {
            text = text.trim();
            if (!text || isWaitingForResponse) return;
            
            // Check rate limit before processing
            if (!checkRateLimit()) {
                showError('RATE_LIMIT');
                return;
            }

            const isGreeting = /^(hey|hello|hi|yo|good\s+morning|good\s+afternoon|good\s+evening|greeting|whats\s+up|sup)\b/i.test(text);
            const isSaveMemory = /save\s+(on|to)\s+memory/i.test(text);

            inputEl.value = '';
            inputEl.style.height = '';
            sendBtn.disabled = true;
            isWaitingForResponse = true;

            appendMessage('user', text);
            showTyping();

            if (isSaveMemory) {
                // Memory vault routine
                const facts = await extractAndSaveMemory(text);
                hideTyping();
                if (facts && facts.length > 0) {
                    const factsList = facts.map(f => `* ${f}`).join('\n');
                    appendMessage('bot', `Done! I've saved the following statement to my memory folder. I will remember this in our future chats:\n\n${factsList}`);
                } else {
                    appendMessage('bot', `I've registered your request to update my memory, but couldn't extract any specific financial preferences or facts from that statement. Could you please specify exactly what you'd like me to remember?`);
                }
            } else {
                // Regular Gemini Response
                const reply = await callGemini(text);
                hideTyping();
                appendMessage('bot', reply);

                if (isGreeting) {
                    suggestionsEl.style.display = 'flex';
                    buildSuggestions();
                }
                
                // Show warning if approaching rate limit
                const warningMsg = getRateLimitMessage();
                if (warningMsg) {
                    const warningEl = document.createElement('div');
                    warningEl.className = 'ai-rate-limit-warning';
                    warningEl.innerHTML = `<span class="material-icons">info</span>${warningMsg}`;
                    messagesEl.insertBefore(warningEl, typingEl);
                    setTimeout(() => warningEl.remove(), 5000);
                }
            }
        } catch (err) {
            console.error('[SmartWalletAI] Error sending message:', err);
            
            if (err.message === 'RATE_LIMIT') {
                showError('RATE_LIMIT');
            } else {
                showError(`We encountered an issue: ${err.message}. Please check your connection and try again.`);
            }
        } finally {
            sendBtn.disabled = false;
            isWaitingForResponse = false;
            inputEl.focus();
        }
    }

    // -----------------------------------------------------------------------
    // OPEN / CLOSE OVERLAY
    // -----------------------------------------------------------------------
    async function openChat() {
        overlay.classList.add('ai-open');
        document.body.style.overflow = 'hidden';
        inputEl.focus();

        if (!dataLoaded) {
            await loadAllData();
        }
        scrollToBottom();
    }

    function closeChat() {
        overlay.classList.remove('ai-open');
        document.body.style.overflow = '';
    }

    // -----------------------------------------------------------------------
    // INJECT HTML
    // -----------------------------------------------------------------------
    function injectHTML() {
        // AI Trigger Button
        const notifTrigger = document.getElementById('notification-bell');
        if (notifTrigger && notifTrigger.parentElement) {
            const btn = document.createElement('button');
            btn.id = 'smartwallet-ai-btn';
            btn.title = 'SmartWallet AI';
            btn.innerHTML = '<span class="material-icons">eco</span>';
            btn.addEventListener('click', openChat);
            notifTrigger.parentElement.insertBefore(btn, notifTrigger);
        }

        // Fullscreen Chat Overlay
        const overlayHTML = `
<div id="smartwallet-ai-overlay" role="dialog" aria-modal="true" aria-label="SmartWallet AI Chatbot">
  <div class="ai-overlay-content">

    <!-- ChatGPT-Style Sidebar -->
    <div class="ai-sidebar" id="ai-sidebar">
      <div class="ai-sidebar-header">
        <span class="material-icons">eco</span>
        <h3>SmartWallet AI</h3>
        <button id="sidebar-close-btn" class="sidebar-close-btn" aria-label="Close sidebar">
          <span class="material-icons">chevron_left</span>
        </button>
      </div>
      <button id="sidebar-new-chat-btn" class="sidebar-action-btn">
        <span class="material-icons">add</span> New Chat
      </button>
      <div class="sidebar-list-title">Recent Chats</div>
      <div class="sidebar-list" id="sidebar-sessions-list">
        <!-- populated dynamically -->
      </div>
    </div>

    <!-- Main Chat Panel -->
    <div class="ai-chat-panel">
      <!-- Header -->
      <div class="ai-chat-header">
        <button id="ai-history-menu-btn" title="Toggle Chat History">
          <span class="material-icons">menu</span>
        </button>
        <div class="ai-header-icon" title="Load Past Conversation History">
          <span class="material-icons">eco</span>
        </div>
        <div class="ai-header-text">
          <div class="ai-header-title">
            <span class="material-icons" style="color: #22c55e; font-size: 20px; display: inline-flex; align-items: center; vertical-align: middle;">eco</span>
            SmartWallet AI
            <span class="ai-online-dot" title="AI Online"></span>
          </div>
          <div class="ai-header-subtitle">Powered by Gemini 2.5 Flash</div>
        </div>
        <div class="ai-context-tag">
          <span class="material-icons">insights</span>
          Live Data
        </div>
        <button id="ai-new-chat-btn" title="Start New Chat" aria-label="New chat">
          <span class="material-icons">add</span>
        </button>
        <button id="ai-close-btn" aria-label="Close chat">
          <span class="material-icons">close</span>
        </button>
      </div>

      <!-- Messages -->
      <div id="ai-messages">
        <!-- Welcome screen -->
        <div class="ai-welcome">
          <div class="ai-welcome-icon"><span class="material-icons">eco</span></div>
          <h2>SmartWallet AI</h2>
          <p>I know your transactions, budget, goals, and spending trends. Ask me anything about your finances.</p>
          <div class="ai-welcome-chips-label">Try asking me</div>
        </div>

        <!-- Typing indicator -->
        <div id="ai-typing">
          <div class="ai-avatar"><span class="material-icons">eco</span></div>
          <div class="ai-typing-dots">
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
            <div class="ai-typing-dot"></div>
          </div>
        </div>
      </div>

      <!-- Suggested question chips -->
      <div id="ai-suggestions"></div>

      <!-- Input bar -->
      <div class="ai-input-bar">
        <textarea id="ai-input" placeholder="Ask me anything about your finances…" rows="1" maxlength="2000"></textarea>
        <button id="ai-send-btn" aria-label="Send message">
          <span class="material-icons">send</span>
        </button>
      </div>
    </div>

  </div>
</div>`;

        document.body.insertAdjacentHTML('beforeend', overlayHTML);
    }

    // -----------------------------------------------------------------------
    // INIT
    // -----------------------------------------------------------------------
    function init() {
        injectHTML();

        // Cache DOM refs
        overlay       = document.getElementById('smartwallet-ai-overlay');
        messagesEl    = document.getElementById('ai-messages');
        typingEl      = document.getElementById('ai-typing');
        inputEl       = document.getElementById('ai-input');
        sendBtn       = document.getElementById('ai-send-btn');
        suggestionsEl = document.getElementById('ai-suggestions');
        sidebarListEl = document.getElementById('sidebar-sessions-list');
        sidebarEl     = document.getElementById('ai-sidebar');

        buildSuggestions();

        // Bind Sidebar button
        document.getElementById('sidebar-new-chat-btn').addEventListener('click', startNewSession);

        // Bind Header buttons
        document.getElementById('ai-new-chat-btn').addEventListener('click', startNewSession);
        document.getElementById('ai-close-btn').addEventListener('click', closeChat);

        // Mobile Menu Trigger Button
        document.getElementById('ai-history-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            sidebarEl.classList.toggle('sidebar-open');
        });

        // Mobile Close Sidebar Button [FIX: 2026-07-04] - Antigravity
        document.getElementById('sidebar-close-btn').addEventListener('click', () => {
            sidebarEl.classList.remove('sidebar-open');
        });

        // Close sidebar when clicking main chat panel on mobile
        document.querySelector('.ai-chat-panel').addEventListener('click', (e) => {
            if (sidebarEl.classList.contains('sidebar-open') && !e.target.closest('#ai-history-menu-btn') && !e.target.closest('#ai-sidebar')) {
                sidebarEl.classList.remove('sidebar-open');
            }
        });

        // Click header icon to restore conversation from notebook list
        const headerIcon = document.querySelector('.ai-chat-header .ai-header-icon');
        if (headerIcon) {
            headerIcon.addEventListener('click', restoreNotebookToHistory);
        }

        // Close on overlay click outside panel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeChat();
        });

        // Escape closes overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('ai-open')) closeChat();
        });

        // Send triggers
        sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(inputEl.value);
            }
        });

        // Auto-resize textarea constrained to exactly 4 lines (90px)
        inputEl.addEventListener('input', () => {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 90) + 'px';
        });

        window.SmartWalletAI = { open: openChat, close: closeChat, clearHistory: startNewSession };
    }

    // Bootstrap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
