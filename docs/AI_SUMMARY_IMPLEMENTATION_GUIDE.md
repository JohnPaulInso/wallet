# 🤖 AI Summary Feature - Claude-Style Conversational Flow

## What You Want

Instead of a dropdown modal, you want a **conversational question flow** like Claude/Anthropic:

1. User clicks "Summary" chip OR types keyword "summary"
2. **Chat input is replaced** with button options (like Claude's interface)
3. AI asks questions **step-by-step** with clickable buttons
4. Send button transforms into **Stop** button while AI is responding

## Implementation Steps

### Step 1: Add Summary State Variables

Add after line 38 (after rate limit variables):

```javascript
// Summary conversation flow state
let summaryFlowActive = false;
let summaryFlowStep = 0;
let summaryData = {
    type: null,      // 'expenses', 'categories', 'needs_wants_savings', 'goals', 'merchant'
    timeRange: null, // 'this_month', 'june', 'may', 'last_3_months', etc.
    specific: null   // specific category or merchant name
};
let abortController = null; // For stopping AI responses
```

### Step 2: Detect Summary Keyword

Modify the sendMessage function to detect "summary" keyword:

```javascript
async function sendMessage(text) {
    try {
        text = text.trim();
        if (!text || isWaitingForResponse) return;
        
        // Check rate limit before processing
        if (!checkRateLimit()) {
            showError('RATE_LIMIT');
            return;
        }

        // [NEW] Detect summary keyword
        if (/summary|summarize|give me a summary/i.test(text)) {
            startSummaryFlow();
            return;
        }

        // ... rest of existing sendMessage code
    }
}
```

### Step 3: Create Summary Flow Functions

Add these new functions:

```javascript
// -----------------------------------------------------------------------
// SUMMARY CONVERSATIONAL FLOW (Claude-style)
// -----------------------------------------------------------------------

function startSummaryFlow() {
    summaryFlowActive = true;
    summaryFlowStep = 1;
    summaryData = { type: null, timeRange: null, specific: null };
    
    // Hide input bar, show button options
    hideInputBar();
    
    // Show AI message asking first question
    const botMsg = "What kind of summary would you like?";
    appendMessage('bot', botMsg);
    
    // Show button options
    showSummaryButtons([
        { label: '💰 Expenses Summary', value: 'expenses' },
        { label: '📊 Category Breakdown', value: 'categories' },
        { label: '🎯 Needs/Wants/Savings', value: 'needs_wants_savings' },
        { label: '🎁 Goals Progress', value: 'goals' },
        { label: '🏪 Specific Merchant', value: 'merchant' }
    ], handleSummaryTypeSelection);
}

function handleSummaryTypeSelection(value) {
    summaryData.type = value;
    
    // Show user's selection as a message
    const labels = {
        'expenses': '💰 Expenses Summary',
        'categories': '📊 Category Breakdown',
        'needs_wants_savings': '🎯 Needs/Wants/Savings',
        'goals': '🎁 Goals Progress',
        'merchant': '🏪 Specific Merchant'
    };
    appendMessage('user', labels[value]);
    
    // Move to next step
    summaryFlowStep = 2;
    
    // If merchant selected, ask for merchant name with text input
    if (value === 'merchant') {
        appendMessage('bot', "Which merchant would you like to see?");
        showInputBar();
        // Set flag to handle next input as merchant name
        summaryFlowActive = 'awaiting_merchant';
        return;
    }
    
    // Ask for time range
    appendMessage('bot', "What time range?");
    showSummaryButtons([
        { label: '📅 This Month', value: 'this_month' },
        { label: '🗓️ June', value: 'june' },
        { label: '🗓️ May', value: 'may' },
        { label: '📆 Last 3 Months', value: 'last_3_months' },
        { label: '📆 Last 6 Months', value: 'last_6_months' },
        { label: '📆 This Year', value: 'this_year' },
        { label: '📆 All Time', value: 'all_time' }
    ], handleTimeRangeSelection);
}

function handleTimeRangeSelection(value) {
    summaryData.timeRange = value;
    
    // Show user's selection
    const labels = {
        'this_month': '📅 This Month',
        'june': '🗓️ June',
        'may': '🗓️ May',
        'last_3_months': '📆 Last 3 Months',
        'last_6_months': '📆 Last 6 Months',
        'this_year': '📆 This Year',
        'all_time': '📆 All Time'
    };
    appendMessage('user', labels[value]);
    
    // Generate and send summary
    generateAndSendSummary();
}

function generateAndSendSummary() {
    // Build the prompt based on collected data
    let prompt = `Give me a ${summaryData.type} summary for ${summaryData.timeRange}.`;
    
    if (summaryData.type === 'expenses') {
        prompt = `Give me a detailed expense summary for ${summaryData.timeRange}. Include total spent, top categories, top merchants, and spending trends.`;
    } else if (summaryData.type === 'categories') {
        prompt = `Give me a category breakdown for ${summaryData.timeRange}. Show spending by category with percentages and trends.`;
    } else if (summaryData.type === 'needs_wants_savings') {
        prompt = `Give me a needs/wants/savings analysis for ${summaryData.timeRange}. Show how much I spent on each, compare to budget, and provide recommendations.`;
    } else if (summaryData.type === 'goals') {
        prompt = `Give me my savings goals progress report. Show current progress, how much more needed, and projected completion dates.`;
    } else if (summaryData.type === 'merchant' && summaryData.specific) {
        prompt = `Give me a detailed summary of my spending at ${summaryData.specific} for ${summaryData.timeRange}.`;
    }
    
    // Reset flow state
    summaryFlowActive = false;
    summaryFlowStep = 0;
    
    // Show input bar again
    showInputBar();
    
    // Send the constructed prompt as a normal message
    appendMessage('user', prompt);
    showTyping();
    transformSendButtonToStop();
    
    isWaitingForResponse = true;
    sendBtn.disabled = true;
    
    // Call Gemini with abort controller for stop functionality
    callGeminiWithAbort(prompt);
}

function showSummaryButtons(options, callback) {
    // Hide input bar
    hideInputBar();
    
    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'ai-button-options';
    buttonContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 0 16px 12px;
        flex-shrink: 0;
    `;
    
    // Create buttons
    options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'ai-option-button';
        btn.textContent = option.label;
        btn.style.cssText = `
            padding: 14px 20px;
            border-radius: 14px;
            border: 1px solid rgba(34, 197, 94, 0.3);
            background: rgba(34, 197, 94, 0.08);
            color: #86efac;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-align: left;
        `;
        
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(34, 197, 94, 0.18)';
            btn.style.borderColor = 'rgba(34, 197, 94, 0.6)';
            btn.style.transform = 'translateY(-2px)';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'rgba(34, 197, 94, 0.08)';
            btn.style.borderColor = 'rgba(34, 197, 94, 0.3)';
            btn.style.transform = 'translateY(0)';
        });
        
        btn.addEventListener('click', () => {
            // Remove button container
            buttonContainer.remove();
            // Call callback with selected value
            callback(option.value);
        });
        
        buttonContainer.appendChild(btn);
    });
    
    // Insert before typing indicator
    messagesEl.insertBefore(buttonContainer, typingEl);
    scrollToBottom();
}

function hideInputBar() {
    const inputBar = document.querySelector('.ai-input-bar');
    if (inputBar) inputBar.style.display = 'none';
}

function showInputBar() {
    const inputBar = document.querySelector('.ai-input-bar');
    if (inputBar) inputBar.style.display = 'flex';
}

function transformSendButtonToStop() {
    sendBtn.innerHTML = '<span class="material-icons">stop</span>';
    sendBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    sendBtn.onclick = stopAIResponse;
}

function transformStopButtonToSend() {
    sendBtn.innerHTML = '<span class="material-icons">send</span>';
    sendBtn.style.background = 'linear-gradient(135deg, #16a34a, #059669)';
    sendBtn.onclick = null; // Reset to default behavior
}

function stopAIResponse() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    hideTyping();
    appendMessage('bot', '_Response stopped by user._');
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    transformStopButtonToSend();
}

async function callGeminiWithAbort(userText) {
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
    abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 120000); // 2 min timeout

    let res;
    try {
        res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abortController.signal
        });
        clearTimeout(timeoutId);
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            // User stopped the response
            transformStopButtonToSend();
            return;
        }
        throw new Error(err.message);
    }

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errorMessage = errData?.error?.message || '';
        
        if (res.status === 429 || errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('rate limit')) {
            showError('RATE_LIMIT');
            transformStopButtonToSend();
            isWaitingForResponse = false;
            sendBtn.disabled = false;
            return;
        }
        
        throw new Error(errorMessage || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';

    conversationHistory.push({ role: 'model', parts: [{ text: botText }] });
    incrementRequestCount();

    hideTyping();
    appendMessage('bot', botText);
    
    // Transform stop button back to send button
    transformStopButtonToSend();
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    
    // Show warning if approaching rate limit
    const warningMsg = getRateLimitMessage();
    if (warningMsg) {
        const warningEl = document.createElement('div');
        warningEl.className = 'ai-rate-limit-warning';
        warningEl.innerHTML = `<span class="material-icons">info</span>${warningMsg}`;
        messagesEl.insertBefore(warningEl, typingEl);
        setTimeout(() => warningEl.remove(), 5000);
    }

    saveActiveSession().catch(() => {});
    saveHistory().catch(() => {});
}
```

### Step 4: Update Suggestion Chips

Add the Summary chip to your suggestions:

```javascript
function buildSuggestions() {
    suggestionsEl.innerHTML = '';
    
    // Add "Complete Summary" button first
    const summaryBtn = document.createElement('button');
    summaryBtn.className = 'ai-chip ai-chip-summary';
    summaryBtn.innerHTML = '<span class="material-icons" style="font-size: 16px; margin-right: 4px;">summarize</span>Complete Summary';
    summaryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startSummaryFlow();
    });
    suggestionsEl.appendChild(summaryBtn);
    
    // Add other suggestion chips...
}
```

### Step 5: Add CSS for Button Options

Add to wallet-ai.css:

```css
/* Summary button chip */
.ai-chip-summary {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(16, 185, 129, 0.12));
    border: 1px solid rgba(34, 197, 94, 0.5);
    color: #6ee7b7;
    font-weight: 600;
    display: flex;
    align-items: center;
}

.ai-chip-summary:hover {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.28), rgba(16, 185, 129, 0.22));
    border-color: rgba(34, 197, 94, 0.8);
    color: #d1fae5;
}

/* Option buttons in conversation */
.ai-button-options {
    animation: ai-msg-in 0.3s cubic-bezier(0.34, 1.4, 0.64, 1) both;
}

.ai-option-button {
    font-family: inherit;
}

.ai-option-button:active {
    transform: translateY(0) !important;
    opacity: 0.8;
}
```

## Summary

This implementation gives you:
- ✅ Keyword detection for "summary"
- ✅ Claude-style button interface (no dropdowns)
- ✅ Step-by-step conversational flow
- ✅ Input bar hidden/shown dynamically
- ✅ Stop button while AI is responding
- ✅ Abort controller to actually stop the response

The flow is:
1. Click "Summary" → Buttons appear asking "What kind?"
2. Click option → Buttons appear asking "What time range?"
3. Click range → Summary is generated and sent to AI
4. While AI responds → Send button becomes Stop button
5. Click Stop → AI response is aborted

This matches the Claude/Anthropic experience you described!
