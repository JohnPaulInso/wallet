# Troubleshooting: Stuck at Preloader / Skeleton State

## Overview
When the application dashboard or individual cards remain stuck with glowing skeleton loaders (preloader placeholders) on components like Needs, Wants, Savings, Daily Average, Biggest Expense, or Monthly Summary, it indicates that a JavaScript execution error interrupted the rendering pipeline before skeleton classes (`.skeleton`) could be removed or skeleton innerHTML replaced.

---

## Common Root Causes & How to Fix

### 1. Uncaught ReferenceError in Dashboard / UI Functions
- **Symptom:** UI skeleton placeholders remain visible even though account balance and cards load.
- **Cause:** A function like `updateInsightCards()` or `updateBudgetBars()` throws a `ReferenceError` (e.g. referencing an undeclared variable like `activeValue` or missing helper function) during card aggregation.
- **Fix:**
  - Open Browser DevTools Console (`F12` -> Console tab).
  - Locate the exact file and line number throwing `Uncaught ReferenceError`.
  - Fix the variable scope or missing function reference in `app-ui.js` / `app-data.js`.

### 2. Invalid CSS Comment Syntax in Stylesheets
- **Symptom:** Styles or highlight classes break silently, causing layout distortion or preloader animation failure.
- **Cause:** Using JavaScript single-line comment syntax `//` inside `.css` files (e.g., `index.css`), which invalidates subsequent CSS rules.
- **Fix:**
  - Ensure all CSS comments use standard block syntax `/* comment */`.

### 3. Asynchronous Data Gating & Freeze Lock (`__freezeBudgetWidgetUI`)
- **Symptom:** Preloaders remain active indefinitely when opening the app offline or on fresh page loads.
- **Cause:**
  - `window.__freezeBudgetWidgetUI` or `window.__suspendBudgetWidgetRefresh` remains `true` after an account/data switch, blocking `updateTripleProgressBar()` from executing and clearing skeleton classes.
  - SPA tab navigation (`prepareSPATabRefreshState`) re-injects `.skeleton` classes even when data (`window.allTxns`) is already fully loaded in memory.
  - `updateInsightCards(null)` overwrote loaded cards with skeleton HTML.
- **Fix:**
  - Automatically clear `window.__freezeBudgetWidgetUI` in `updateTripleProgressBar()` as soon as `window.allTxns` or live data is present.
  - Only apply `.skeleton` classes during tab refresh if `window.allTxns` is not yet available in memory.
  - Fallback to `window.allTxns` inside `updateInsightCards()` when `txns` argument is null.
