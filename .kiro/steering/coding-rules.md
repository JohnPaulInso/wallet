# Smart Wallet - Coding Rules

These are standing preferences for how to work on code in this project. They override generic defaults to avoid verbose explanations, speculative abstractions, and unsolicited suggestions that waste time and clutter diffs.

## Output Rules

- **Return code first.** Put any explanation after the code, and only if something is non-obvious.
- **No inline prose** walking through code line by line.
- **Use comments sparingly**, only where the logic itself would be unclear from reading it.
- **No boilerplate** (README stubs, extra config, scaffolding) unless explicitly requested.

## Code Rules

- **Write the simplest solution that actually works.** Resist over-engineering.
- **Don't build an abstraction** (helper function, class, config layer) for something used exactly once.
- **Don't add speculative features**, extra parameters "in case they're needed," or "you might also want..." additions. Build what was asked for.
- **Read a file before modifying it** - never edit blind based on assumption or memory of what it probably contains.
- **Don't add docstrings or type annotations** to code that isn't otherwise being touched in this change.
- **Don't add error handling** for scenarios that structurally cannot happen given the surrounding code.
- **If three similar lines would require an abstraction to avoid, and that abstraction would only be used those three times, leave the three lines.** Premature abstraction costs more to read than it saves to write.

## Review Rules

When asked to review code:

- **State the bug. Show the fix. Stop.**
- Don't add suggestions outside the scope of what was asked to be reviewed (e.g. unrelated style nits, "while I'm here" refactors).
- Don't open or close with compliments about the code. Get straight to the findings.

## Debugging Rules

- **Never speculate about the cause of a bug without first reading the relevant code.** Guessing wastes time chasing a fix for the wrong problem.
- **State what you found, where you found it, and the fix** - in one pass, not a back-and-forth of guesses.
- If the cause genuinely isn't clear from what you've read, say so explicitly rather than presenting a guess as a diagnosis.

## Testing Rules

- **After any code change, run the relevant tests or checks yourself** before declaring the task done. Don't ask the user to verify it for you.
- If a test or check can't be run in the current environment, say that explicitly rather than silently skipping it and moving on as if it passed.
- When fixing a failing test, re-run just that test first to confirm the fix, then run the full module/suite to check for regressions before calling it done.

## Formatting

- **No em dashes, smart quotes, or decorative Unicode symbols** in code or written output.
- **Plain hyphens and straight quotes only.**
- Natural-language characters (accented letters, CJK, etc.) are fine when the content itself requires them - this rule is about decorative typography, not about restricting language.
- **Code output must be copy-paste safe**: no line numbers, no markdown fences the user would have to strip, nothing that would break if pasted directly into a file or terminal.

## Styling Rules (CSS/Design)

These apply to any CSS or component styling work in Smart Wallet:

### Design System Adherence

- **Follow `design-rules.txt` strictly** - it defines the complete design system (spacing, colors, typography, shadows, animations).
- **Use the defined spacing scale** (2px, 4px, 6px, 8px, 12px, 14px, 16px, 18px, 20px, 24px, 28px, 32px) - avoid arbitrary values.
- **Use semantic colors from the palette** - never hardcode raw hex values without system justification.
- **Maintain category color associations** - each category has predefined bg/text/icon colors.

### Color Token Usage

- **Never hardcode colors in component CSS** without referencing the design system palette.
- If a color is needed that has no existing token in design-rules.txt, add it properly (both light and dark mode definitions) rather than inlining a one-off value.
- Known, intentional exceptions (pure #fff/#000, brand gradients, splash/launcher-only one-offs) are fine - but **comment inline why the exception applies**.

### Dark Mode

- **Before declaring a styling change done, visually verify it in both light and dark mode.**
- If dark mode genuinely can't be tested in the current environment, say so explicitly instead of skipping the check silently.
- Modals ALWAYS stay light theme (#ffffff background) for readability.

### Typography

- **Use font weights from the system**: 600, 700, 800 for UI elements (avoid 400/500 for primary UI text).
- **Match font sizes to defined use cases**:
  - 9.5px - micro text (dates, meta)
  - 11px - notes
  - 13.5px - primary labels (merchant names)
  - 14px - amounts, standard body
  - 15px - button text
  - 17px - section titles
  - 18px - modal titles
- **Apply letter-spacing to uppercase text** for readability.
- **Never exceed 3 font sizes in a single component.**

### Spacing & Layout

- **Transaction card spacing**: 14px vertical, 18px horizontal padding, 14px internal gaps.
- **Icon container sizing**: 44px standard, 40px touch targets minimum.
- **Modal padding**: 28px top, 24px horizontal, 20px bottom.
- **Border radius standards**: 12px (icons), 14px (buttons), 20px (cards/modals), 28px (sheets), 50% (circles).

### Animations

- **Use cubic-bezier for refined motion**: `cubic-bezier(0.4, 0, 0.2, 1)` for standard, `cubic-bezier(0.34, 1.56, 0.64, 1)` for bouncy.
- **Keep durations under 0.4s** for UI interactions (0.15s ultra fast, 0.2s fast, 0.3s default).
- **Apply will-change for performance-critical animations.**
- **Never animate height/width directly** (use transform instead).

### Material Icons

- **Consistent icon sizes**: 20px (small), 24px (standard), 28px (medium), 32px (large), 40px (extra large).
- **Use Material Icons font** - already loaded via CDN.

## Project-Specific Patterns

### ES Module Structure

- **All core logic uses ES6 modules** with explicit import/export.
- **Avoid polluting window globals** unless cross-module communication is genuinely needed.
- **Module naming**: `app-*.js` for core, `*-logic.js` for features, `firebase-*.js` for Firebase.

### State Management

- **localStorage**: Persistent preferences (theme, hidden balances, budget rules, account selection).
- **sessionStorage**: Temporary state (GIS token refresh status).
- **window.***: Runtime state (window.allTxns, window.currentAccount, window.tokenClient).
- **Firestore**: Cloud sync for transactions, accounts, goals.

### Firebase Integration

- **Always check auth state** before Firestore operations.
- **Use realtime listeners** for transaction data (onSnapshot).
- **GIS token refresh** has 1-minute cooldown - check lastTokenRefreshAttempt.
- **Native vs Web auth**: Check `window.Capacitor.isNativePlatform()` for Capacitor GoogleAuth plugin vs web popup.

### Performance Patterns

- **Cache budget widget data** in localStorage with uid+monthKey suffix.
- **Preload critical modules** using `<link rel="modulepreload">` in index.html.
- **Skeleton screens** show cached data immediately while real data loads.
- **Debounce expensive operations** (chart rendering, Firestore writes).

### Modal/Overlay Pattern

- **Overlays use fixed positioning** with z-index hierarchy (modals: 100000, BPI scanner: 99999).
- **Backdrop blur**: `backdrop-filter: blur(12px)` for depth.
- **Bottom sheets**: 28px border-radius on top corners only, 90-95vh height.
- **Animation**: fadeIn (0.2s) for backdrop, scaleIn (0.3s bouncy) for content.

### Build & Sync Workflow

- **NEVER edit `/www/*` files directly** - always edit source in root, then run `npm run sync-www`.
- **After JS/HTML changes**: `npm run build` (syncs to www/ + fixes Java).
- **After Capacitor config changes**: `npx cap sync android`.
- **Java version must be 17** - triple-layer protection auto-fixes Java 21 issues.

### BPI Scanner

- **OCR uses Tesseract.js** - client-side, no server dependency.
- **Modal visibility**: Force-show approach with multiple CSS properties set (display, visibility, opacity, z-index).
- **Transaction cards**: Follow premium-txn spacing and styling from design-rules.txt.

### Common Gotchas

- **Java 21 build failures**: Auto-fixed by triple-layer protection (project build.gradle, variables.gradle, fix script).
- **SSL certificate errors**: Run `fix-java-certificates-final.bat` as Administrator.
- **Gradle cache corruption**: Run `auto-clean-gradle.bat` to clean.
- **GIS popup flicker**: Set `window.justLoggedIn = true` after auth, check `sessionStorage.getItem('gis_session_refreshed')`.
- **Budget cache key**: MUST include monthKey suffix: `budget_widget_cache_${uid}_${monthKey}`.
- **Status bar on mobile**: Apply safe-area-inset offsets, force dark style on resume/focus.

## File Reading Strategy

- **Read files before editing** - don't assume structure from memory.
- **For large files (index.html 18k+ lines)**: Use grepSearch to locate specific sections, then readFile with line ranges.
- **For modular code**: Read the specific module file completely - they're sized appropriately.

## Git Workflow

- **Use npm scripts**: `npm run push`, `npm run save`, `npm run sync`.
- **Commit messages**: Descriptive for features, "Quick save" for WIP.
- **Don't commit**: `config.js` (gitignored), `/www/*` (generated), `node_modules/`.

## Android Build Rules

- **Java 17 is mandatory** - Java 21 will fail.
- **Fix sequence for build issues**: SSL certs → clean Gradle → fix Java version.
- **Capacitor sync required** after changes to: plugin config, native resources, www/ assets.
- **Run builds via**: `.\a` (alias), `npm run android`, or `dev.bat`.

## Living Reference (Smart Wallet Gotchas)

This section documents hard-won, non-obvious facts about Smart Wallet that have caused issues in past sessions. Append new discoveries here.

### Discovered Gotchas

**Budget Widget Cache Key (2026-06-27)**
- Cache key MUST append monthKey: `budget_widget_cache_${uid}_${monthKey}`
- Without monthKey, cache pollutes across months
- Location: index.html inline script, app-ui.js updateBudgetWidget

**Remaining Balance Color Thresholds (2026-06-27)**
- Green: 3000+
- Yellow: 1500-2999
- Red: ≤1500
- Element: `#triple-remaining-val`
- Don't use old threshold (500)

**Hidden Balance Display (2026-07-01)**
- When `localStorage.getItem('balance_hidden') === 'true'`:
  - Show only `******` (no partial numbers)
  - Applies to: needs/wants/savings stats, remaining balance, usage sub
- Don't show `****** / ₱{limit}` - just `******`

**BPI Scanner Modal Visibility (2026-06-29)**
- Force-show approach required for APK/mobile
- Must set ALL properties: display, visibility, opacity, z-index, position, dimensions
- Inline styles override any CSS classes
- Function: `window.openBPIScannerStrict()`

**Status Bar on Native (2026-03-31)**
- Must force dark style on every resume/focus/visibility change
- StatusBar plugin calls: setBackgroundColor, setStyle, setOverlaysWebView
- Add listeners to: visibilitychange, focus, pageshow, resume, App.addListener('appStateChange')

**Java Version Auto-Fix (2026-06-29)**
- Triple-layer protection prevents Java 21 errors:
  1. android/build.gradle afterEvaluate hook
  2. android/variables.gradle javaVersion variable
  3. npm run fix-java (runs on every build)
- If somehow still failing: manually run `fix-all-java-21.bat`

**GIS Session Flicker Prevention**
- Set `sessionStorage.setItem('gis_session_refreshed', Date.now())` immediately after login
- Check this before triggering GIS refresh popup
- Prevents OAuth popup on every navigation after initial login

**Account Persistence (2026-04-03)**
- Lock account selection early: check `localStorage.getItem('wallet_current_account')` before DOM ready
- Set `window.currentAccount` in head script (not just in loadData)
- Prevents account switching flicker on page load

**Firestore Realtime Listener Detachment**
- Always call `window.unsubscribeSnapshot()` before sign-out or page unload
- Prevents memory leaks and zombie listeners
- Check if function exists before calling

### Add New Gotchas Here

When you discover a new non-obvious issue:
1. Add a descriptive heading with date
2. Explain what went wrong and why
3. Note the fix and relevant file locations
4. Keep it concise - future sessions need to scan quickly
