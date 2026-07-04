# 🎨 AI Summary Feature - Visual Flow Diagram

## Complete User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER OPENS SMARTWALLET AI                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Welcome Screen with Suggestions:                               │
│  [📊 Complete Summary] [How much spent?] [Top category?] ...    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │   USER TRIGGERS   │
                    └─────────┬─────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
   Click Chip          Type "summary"        Type "summarize"
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI: "What kind of summary would you like?"                  │
│  📥 Input bar HIDES                                             │
│  🔘 5 Buttons Appear:                                           │
│     [💰 Expenses Summary]                                       │
│     [📊 Category Breakdown]                                     │
│     [🎯 Needs/Wants/Savings]                                    │
│     [🎁 Goals Progress]                                         │
│     [🏪 Specific Merchant]                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │   USER SELECTS    │
                    └─────────┬─────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
    Expenses           Specific Merchant       Categories
        │                     │                     │
        │              ┌──────┴──────┐             │
        │              ↓             ↓             │
        │     🤖 AI: "Which        Input          │
        │     merchant?"          Bar Shows        │
        │              ↓                           │
        │     User types "Shopee"                  │
        │              ↓                           │
        └──────────────┼───────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│  👤 User Message: "💰 Expenses Summary" (or selected option)    │
│  🔘 Previous Buttons Disappear                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AI: "What time range?"                                      │
│  🔘 7 Buttons Appear:                                           │
│     [📅 This Month]                                             │
│     [🗓️ June]                                                   │
│     [🗓️ May]                                                    │
│     [📆 Last 3 Months]                                          │
│     [📆 Last 6 Months]                                          │
│     [📆 This Year]                                              │
│     [📆 All Time]                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    │   USER SELECTS    │
                    │  "📅 This Month"  │
                    └─────────┬─────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  👤 User Message: "📅 This Month"                               │
│  🔘 Time Range Buttons Disappear                                │
│  📥 Input Bar SHOWS                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  📤 System Constructs Prompt:                                   │
│  "Give me a detailed expense summary for this month.            │
│   Include total spent, top categories, top merchants,           │
│   and spending trends."                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  🔄 Typing Indicator Appears                                    │
│  🔴 Send Button → Stop Button (RED)                             │
│  ⏸️ User Can Click Stop to Abort                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
   User Waits         User Clicks Stop      Network Error
        │                     │                     │
        ↓                     ↓                     ↓
┌─────────────┐  ┌───────────────────┐  ┌─────────────────┐
│  AI Response│  │ "Response stopped │  │  Error Message  │
│  Generated  │  │  by user."        │  │  Shown          │
└─────────────┘  └───────────────────┘  └─────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Summary Displayed                                           │
│  🔴 Stop Button → Send Button (GREEN)                           │
│  💬 User Can Ask Follow-up Questions                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## UI State Transitions

### State 1: Welcome
```
┌─────────────────────────────────────┐
│  Welcome Screen                     │
│  ● Suggestions visible              │
│  ● Input bar visible                │
│  ● Send button enabled              │
└─────────────────────────────────────┘
```

### State 2: Summary Type Selection
```
┌─────────────────────────────────────┐
│  AI Message: Question               │
│  ● 5 emoji buttons                  │
│  ● Input bar HIDDEN                 │
│  ● Suggestions hidden               │
└─────────────────────────────────────┘
```

### State 3: Merchant Input (Special Case)
```
┌─────────────────────────────────────┐
│  AI Message: "Which merchant?"      │
│  ● Input bar VISIBLE                │
│  ● Waiting for text input           │
│  ● Send button enabled              │
└─────────────────────────────────────┘
```

### State 4: Time Range Selection
```
┌─────────────────────────────────────┐
│  AI Message: Question               │
│  ● 7 emoji buttons                  │
│  ● Input bar HIDDEN                 │
│  ● Previous selection shown         │
└─────────────────────────────────────┘
```

### State 5: Generating Response
```
┌─────────────────────────────────────┐
│  Typing indicator                   │
│  ● Input bar VISIBLE                │
│  ● STOP button (RED)                │
│  ● Input disabled                   │
└─────────────────────────────────────┘
```

### State 6: Response Complete
```
┌─────────────────────────────────────┐
│  AI Response displayed              │
│  ● Input bar visible                │
│  ● SEND button (GREEN)              │
│  ● Input enabled                    │
│  ● Ready for next question          │
└─────────────────────────────────────┘
```

---

## Button Visual Design

### Normal State
```
┌───────────────────────────────────────┐
│  💰 Expenses Summary                  │
│                                       │
│  • Background: rgba(34,197,94,0.08)  │
│  • Border: rgba(34,197,94,0.3)       │
│  • Color: #86efac                     │
└───────────────────────────────────────┘
```

### Hover State
```
┌───────────────────────────────────────┐
│  💰 Expenses Summary         ↑ 2px   │
│                                       │
│  • Background: rgba(34,197,94,0.18)  │
│  • Border: rgba(34,197,94,0.6)       │
│  • Color: #d1fae5                     │
│  • Transform: translateY(-2px)        │
└───────────────────────────────────────┘
```

### Active/Clicked State
```
┌───────────────────────────────────────┐
│  💰 Expenses Summary         ↓ 0px   │
│                                       │
│  • Opacity: 0.8                       │
│  • Transform: translateY(0)           │
│  • Then DISAPPEARS                    │
└───────────────────────────────────────┘
```

---

## Send/Stop Button States

### Send Button (Normal)
```
┌─────────┐
│    ➤    │  • Green gradient
│         │  • Clickable
└─────────┘  • Icon: send
```

### Stop Button (While AI Responds)
```
┌─────────┐
│    ■    │  • Red gradient
│         │  • Clickable
└─────────┘  • Icon: stop
```

---

## Animation Timeline

### Button Appearance (300ms)
```
0ms   ─────────────────────────────── 300ms
      opacity: 0 → 1
      translateY: 12px → 0px
      scale: 0.97 → 1
```

### Button Hover (200ms)
```
0ms   ───────────────── 200ms
      background: light → lighter
      border: thin → thick
      translateY: 0 → -2px
```

### Button Click (100ms)
```
0ms   ──────── 100ms
      opacity: 1 → 0.8
      translateY: -2px → 0
      Then: element.remove()
```

---

## Data Flow

### Information Capture
```
┌─────────────────────────────────────────┐
│  summaryData Object:                    │
│                                         │
│  {                                      │
│    type: "expenses",                    │
│    timeRange: "this_month",             │
│    specificMerchant: null               │
│  }                                      │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│  Prompt Construction:                   │
│                                         │
│  "Give me a detailed expense            │
│   summary for this month. Include       │
│   total spent, top categories, top      │
│   merchants, and spending trends."      │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│  Send to Gemini API                     │
│  with AbortController                   │
└─────────────────────────────────────────┘
```

---

## Error States

### Rate Limit Reached
```
┌─────────────────────────────────────────┐
│  ⏰ Daily Limit Reached                 │
│                                         │
│  Thank you for using SmartWallet AI!    │
│  You've reached your daily request      │
│  limit. Please come back again          │
│  tomorrow to continue our conversation. │
│                                         │
│  Resets in 4 hours                      │
└─────────────────────────────────────────┘
```

### Network Error
```
┌─────────────────────────────────────────┐
│  ⚠️ We encountered an issue:            │
│                                         │
│  Request timed out after 12 seconds.    │
│  Please check your connection and       │
│  try again.                             │
└─────────────────────────────────────────┘
```

### User Stopped
```
┌─────────────────────────────────────────┐
│  🤖 Response stopped by user.           │
└─────────────────────────────────────────┘
```

---

## Mobile Responsive Behavior

### Desktop (>768px)
```
┌──────────────────────────────────────────────┐
│  Buttons: Full width with padding           │
│  Font: 14px                                  │
│  Touch target: 48px+ height                  │
└──────────────────────────────────────────────┘
```

### Mobile (<768px)
```
┌──────────────────────────────────────────────┐
│  Buttons: Full width, stacked                │
│  Font: 14px (same)                           │
│  Touch target: 52px+ height (bigger)         │
│  Padding: 16px (more space)                  │
└──────────────────────────────────────────────┘
```

---

## Summary Types × Time Ranges Matrix

```
┌──────────────┬─────┬─────┬─────┬─────┬─────┬──────┬──────┐
│              │This │June │May  │3Mos │6Mos │Year  │All   │
│              │Month│     │     │     │     │      │Time  │
├──────────────┼─────┼─────┼─────┼─────┼─────┼──────┼──────┤
│ Expenses     │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓   │  ✓   │
│ Categories   │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓   │  ✓   │
│ Needs/Wants  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓   │  ✓   │
│ Goals        │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓   │  ✓   │
│ Merchant     │  ✓  │  ✓  │  ✓  │  ✓  │  ✓  │  ✓   │  ✓   │
└──────────────┴─────┴─────┴─────┴─────┴─────┴──────┴──────┘

Total Possible Combinations: 5 × 7 = 35 unique summaries
```

---

## Code Architecture

```
┌─────────────────────────────────────────────────────┐
│  wallet-ai.js                                       │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  State Variables                            │  │
│  │  • summaryFlowActive                        │  │
│  │  • summaryData                              │  │
│  │  • currentButtonContainer                   │  │
│  │  • abortController                          │  │
│  └─────────────────────────────────────────────┘  │
│                     ↓                               │
│  ┌─────────────────────────────────────────────┐  │
│  │  Entry Points                               │  │
│  │  • sendMessage() - keyword detection        │  │
│  │  • buildSuggestions() - chip click          │  │
│  └─────────────────────────────────────────────┘  │
│                     ↓                               │
│  ┌─────────────────────────────────────────────┐  │
│  │  Flow Functions                             │  │
│  │  • startSummaryFlow()                       │  │
│  │  • handleSummaryTypeSelection()             │  │
│  │  • askTimeRange()                           │  │
│  │  • handleTimeRangeSelection()               │  │
│  │  • generateAndSendSummary()                 │  │
│  └─────────────────────────────────────────────┘  │
│                     ↓                               │
│  ┌─────────────────────────────────────────────┐  │
│  │  UI Functions                               │  │
│  │  • showSummaryButtons()                     │  │
│  │  • hideInputBar()                           │  │
│  │  • showInputBar()                           │  │
│  └─────────────────────────────────────────────┘  │
│                     ↓                               │
│  ┌─────────────────────────────────────────────┐  │
│  │  Stop Button Functions                      │  │
│  │  • transformSendButtonToStop()              │  │
│  │  • transformStopButtonToSend()              │  │
│  │  • stopAIResponse()                         │  │
│  └─────────────────────────────────────────────┘  │
│                     ↓                               │
│  ┌─────────────────────────────────────────────┐  │
│  │  API Functions                              │  │
│  │  • callGeminiWithAbort()                    │  │
│  │  • buildSystemPrompt()                      │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

**Created**: July 4, 2026  
**Purpose**: Visual reference for understanding the complete AI summary flow  
**Status**: ✅ Complete
