# BPI Scanner Fixes - June 29, 2026

## Issues Fixed

### 1. ✅ InstaPay Transfer + Fee Combination
- **Problem**: InstaPay Transfer (₱1,000) and InstaPay Transfer Fee (₱10) were showing as separate transactions
- **Solution**: Added logic in `parseOCRText()` to detect and combine these transactions automatically
- **Result**: Shows single transaction "INSTAPAY TRANSFER" for ₱1,010.00

### 2. ✅ Merchant Name Display
- **Problem**: Merchant name was showing generic text or dates
- **Solution**: When InstaPay transfer + fee detected, merchant name is set to "INSTAPAY TRANSFER"
- **Result**: Clean, consistent naming for InstaPay transactions

### 3. ✅ Transaction Note Field
- **Problem**: Meta line only showed "Debit" or "Credit"
- **Solution**: Added `note` field to transactions, shows "Transfer to other bank" when detected
- **Result**: More descriptive information: "June 24 · Transfer to other bank"

### 4. ✅ Date Format
- **Problem**: Date showing as "06/24" (MM/DD format)
- **Solution**: Updated `buildCardHTML()` to format dates as "June 24" using month names
- **Result**: More readable date format matching BPI app style

### 5. ✅ Long Merchant Name Handling
- **Problem**: Long merchant names were breaking layout or being cut off
- **Solution**: Added CSS for `.bpi-scan-card-name` with overflow ellipsis
- **Result**: Names truncate gracefully with "..." when too long

### 6. ✅ Spacing Improvements
- **Problem**: Large gaps above/below "All Caught Up" message
- **Solution**: Added CSS to reduce margins and padding
- **Result**: Tighter, more compact layout

### 7. ✅ Better Accept Animation
- **Problem**: No visual feedback when adding transactions
- **Solution**: Added scale animation and transition effects to cards
- **Result**: Card scales up slightly and shows visual confirmation

### 8. ✅ Smart Toast Messages
- **Problem**: Individual toasts for each transaction ("Added: MERCHANT NAME")
- **Solution**: Batch counting system with delayed toast
- **Result**: 
  - "Added 1 transaction" (singular)
  - "Added 3 transactions" (plural)
  - Collects multiple adds within 600ms window

## Technical Changes

### Files Modified

#### `index.html`
1. **parseOCRText()** (line ~16840):
   - Added `note` field extraction
   - Added InstaPay Transfer + Fee detection and combination logic
   - Detects "TRANSFER TO OTHER BANK" text and stores as note

2. **buildCardHTML()** (line ~17315):
   - Changed date formatting from "MM/DD" to "Month Day"
   - Updated meta line to show note when available
   - Falls back to "Credit"/"Debit" if no note

3. **acceptCard()** (line ~17424):
   - Added `_acceptedCount` and `_acceptTimer` tracking variables
   - Added card scale animation on accept
   - Implemented batch toast system with 600ms delay
   - Shows plural/singular message based on count

#### `bpi-scanner.css`
1. **New Classes** (appended):
   - `.bpi-scan-card-name`: Handles merchant name overflow with ellipsis
   - `.bpi-scan-card-info`: Ensures proper flex behavior with min-width: 0
   - `.bpi-scan-card-meta`: Handles meta line overflow
   - `.bpi-scan-all-done`: Reduced margins (8px instead of default)
   - `.bpi-scan-txn-card.accepting`: Animation class for accepted cards
   - `@keyframes cardAccept`: Scale and brightness animation

## How It Works

### InstaPay Detection Flow
1. OCR reads screenshot text
2. `parseOCRText()` identifies lines with amounts
3. For each transaction, looks for merchant name and date
4. Detects "TRANSFER TO OTHER BANK" → stores as note
5. After all transactions parsed, loops through to find consecutive InstaPay Transfer + Fee with same date
6. Combines amounts (1000 + 10 = 1010)
7. Sets merchant to "INSTAPAY TRANSFER"
8. Removes fee transaction from array

### Date Format Conversion
```javascript
// Old: "2026-06-24" → "06/24"
const dateDisplay = r.date ? String(r.date).replace(/^\d{4}-/, '').replace('-', '/') : '—';

// New: "2026-06-24" → "June 24"
let dateDisplay = '—';
if (r.date) {
    const d = new Date(r.date);
    if (!isNaN(d)) {
        const months = ['January', 'February', ...];
        dateDisplay = `${months[d.getMonth()]} ${d.getDate()}`;
    }
}
```

### Toast Batching
```javascript
_acceptedCount++;  // Increment counter

clearTimeout(_acceptTimer);  // Reset timer

_acceptTimer = setTimeout(() => {
    const msg = _acceptedCount === 1 
        ? 'Added 1 transaction' 
        : `Added ${_acceptedCount} transactions`;
    showToast(msg);
    _acceptedCount = 0;
}, 600);  // Wait 600ms to collect more
```

## Testing Checklist

- [ ] Upload screenshot with InstaPay Transfer + Fee
- [ ] Verify they combine into single ₱1,010 transaction
- [ ] Verify merchant shows "INSTAPAY TRANSFER"
- [ ] Verify date shows as "June 24" not "06/24"
- [ ] Verify meta shows "Transfer to other bank"
- [ ] Test long merchant name truncates properly
- [ ] Add multiple transactions quickly - should see "Added X transactions"
- [ ] Verify layout is compact with no excessive spacing

## Known Limitations

1. OCR accuracy depends on screenshot quality
2. InstaPay combination only works if both transactions have same date
3. "TRANSFER TO OTHER BANK" text must be detected in OCR output
4. Date format assumes current year if year not in screenshot

## Future Improvements

1. Add visual dividers between different transaction dates
2. Improve OCR preprocessing for better text extraction
3. Add manual amount adjustment before accepting
4. Support more transfer types (PESONet, etc.)
5. Add transaction categorization suggestions
