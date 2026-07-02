# Implementation Plan: Budget Analytics Enhancement

## Overview

This implementation plan breaks down the Budget Analytics Enhancement feature into discrete, executable coding tasks. The feature consists of two main components: (1) automatic shimmer effect on balance cards when account selection changes, and (2) a comprehensive monthly budget analytics chart system with line/donut charts, flexible time range selection, and interactive data exploration.

**Technology Stack:**
- Vanilla JavaScript (ES6 modules)
- Chart.js for chart rendering
- Existing design system (design-rules.txt)
- Firebase Firestore (window.allTxns data source)
- localStorage for state persistence

**Implementation Approach:**
- Follow the 7-phase roadmap from the design document
- Build incrementally with validation checkpoints
- Reuse existing patterns (modals, state management, animations)
- Optimize for performance (<1000ms chart render for <1000 records)

---

## Tasks

### Phase 1: Shimmer Integration

- [x] 1. Implement balance card shimmer activation on account change
  - Create `activateBalanceCardShimmer()` function in budget-analytics.js (or inline in index.html)
  - Query all `.balance-card` elements and their `.card-shimmer` children
  - Add 'active' class to trigger existing cardShineSweep animation (1.2s duration)
  - Remove 'active' class after 1200ms using setTimeout
  - Hook into existing account switcher logic (account dropdown onclick, app-data.js loadData)
  - Verify shimmer applies to all balance card instances on account switch
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

---

### Phase 2: Chart Button & Overlay Structure

- [x] 2. Create chart button and overlay HTML structure
  - [x] 2.1 Add chart button to index.html
    - Insert button HTML left of `#budget-view-toggle` (around line 1188)
    - Use class `triple-edit-btn` for consistent styling
    - Add Material Icons 'analytics' icon
    - Set onclick handler: `window.budgetAnalytics.open()`
    - Add aria-label for accessibility
    - Apply 8px spacing gap from budget-view-toggle
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Create chart overlay HTML structure in index.html
    - Add full overlay container div with id `budget-analytics-overlay`
    - Create backdrop div with close handler
    - Build analytics-content section with header (title + close button)
    - Add analytics-controls section (placeholder for time range, filters, granularity)
    - Add analytics-charts section with two canvas elements (line-chart, donut-chart)
    - Set initial display: none
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.12_

  - [x] 2.3 Create budget-analytics.css stylesheet
    - Define .analytics-overlay with fixed positioning, z-index 100001, flexbox centering
    - Style .analytics-backdrop with blur effect (backdrop-filter: blur(12px))
    - Style .analytics-content with light theme (#ffffff), rounded corners (20px), responsive sizing
    - Add fadeIn animation for backdrop (0.2s ease)
    - Add scaleIn animation for content (0.3s cubic-bezier bouncy)
    - Add mobile responsive styles (max-width: 430px) with full-screen layout
    - Apply safe-area-inset for devices with notches
    - _Requirements: 7.2, 7.7, 7.8, 7.9, 7.10, 10.1, 10.5, 10.6_

  - [x] 2.4 Link CSS file and create module script tag in index.html
    - Add `<link rel="stylesheet" href="budget-analytics.css">` to head
    - Add `<script type="module" src="budget-analytics.js"></script>` before closing body tag
    - Use modulepreload hint for performance
    - _Requirements: 9.5, 9.7, 9.8_

---

### Phase 3: Data Processing Engine

- [x] 3. Implement core data processing functions
  - [x] 3.1 Create budget-analytics.js module with state initialization
    - Initialize `window.budgetAnalytics` state object with default values
    - Define state structure: timeRange, granularity, categories, chartType, showBudgetLimits, processedData, charts
    - Load persisted preferences from localStorage (analytics_time_range, analytics_granularity, analytics_show_limits)
    - _Requirements: 8.2, 9.1, 9.2, 9.4_

  - [x] 3.2 Implement transaction filtering by time range and account
    - Write `filterTransactions(txns, timeRange, account)` function
    - Support preset time ranges: this_month, last_3_months, last_6_months, last_12_months, all_time
    - Support custom time range with customStart/customEnd dates
    - Filter by window.currentAccount if account parameter provided
    - Exclude transactions with excluded=true or refund=true flags
    - Return filtered transaction array
    - _Requirements: 8.1, 8.3_

  - [x] 3.3 Implement transaction grouping by granularity
    - Write `groupByGranularity(txns, granularity)` function
    - Group transactions by day (YYYY-MM-DD), week (week start date), or month (YYYY-MM)
    - Categorize each transaction into needs/wants/savings using existing category mapping
    - Aggregate amounts by category for each time bucket
    - Return grouped data structure: { [dateKey]: { needs, wants, savings } }
    - _Requirements: 8.4, 8.5_

  - [x] 3.4 Implement data aggregation and formatting for charts
    - Write `aggregateTotals(groupedData)` function
    - Extract sorted labels (date keys) from grouped data
    - Map category totals to arrays aligned with labels
    - Calculate grand totals per category across all time buckets
    - Return formatted data: { labels, needs, wants, savings, totals }
    - _Requirements: 8.5_

  - [x] 3.5 Implement trend calculation for comparison mode
    - Write `calculateTrend(currentData, previousData)` function
    - Sum current period totals and previous period totals
    - Calculate percentage change
    - Return trend object: { direction: 'up'|'down'|'neutral', percentage }
    - _Requirements: 8.6, 6.2_

  - [x] 3.6 Implement chunked processing for large datasets
    - Write `processLargeDataset(txns, chunkSize)` async function
    - Split transaction array into chunks of 100 records
    - Process each chunk with yield to UI thread (setTimeout 0)
    - Aggregate results from all chunks
    - Only invoke for datasets >1000 records
    - _Requirements: 8.7, 8.8_

  - [x] 3.7 Add transaction categorization helper
    - Write `categorizeTxn(txn)` function
    - Map transaction category to needs/wants/savings based on existing Smart Wallet category system
    - Use needsCategories array: ['Food & Drinks', 'Transportation', 'Vehicle']
    - Use savingsCategories array: ['Savings', 'Income']
    - Default to 'wants' for uncategorized
    - _Requirements: 8.5_

  - [x] 3.8 Add empty state detection
    - Check if filtered transactions array is empty
    - Return early with empty data structure if no transactions found
    - Log message for debugging
    - _Requirements: 8.9_

---

### Phase 4: Chart Rendering System

- [~] 4. Implement Chart.js integration and rendering
  - [x] 4.1 Initialize Chart.js instances for line and donut charts
    - Get canvas contexts for #analytics-line-chart and #analytics-donut-chart
    - Create Chart instances with initial empty configuration
    - Store chart references in window.budgetAnalytics.charts
    - Handle case where Chart.js library not loaded (graceful degradation)
    - _Requirements: 4.7, 5.5_

  - [x] 4.2 Implement line chart rendering function
    - Write `renderLineChart(processedData, state)` function
    - Build Chart.js line chart configuration with datasets for needs/wants/savings
    - Apply category colors: needs=#3b82f6, wants=#ea580c, savings=#10b981
    - Configure smooth line curves with tension: 0.4
    - Set responsive: true, maintainAspectRatio: false
    - Configure x-axis (time labels) and y-axis (amount in ₱)
    - Add legend at top position
    - Update existing chart instance or create new one
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 4.3 Add line chart view mode support (single/combined/total)
    - Implement view switcher logic for single category, combined, and total spending modes
    - For single mode: show only selected category dataset
    - For combined mode: show all three category datasets
    - For total mode: sum needs+wants+savings into single dataset
    - Apply appropriate colors and labels for each mode
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 4.4 Configure line chart interactive tooltips
    - Set interaction mode: 'index', intersect: false
    - Format tooltip labels to display amounts as ₱{value.toLocaleString()}
    - Show date and category name in tooltip
    - Enable multi-line tooltip for combined view
    - _Requirements: 6.1_

  - [x] 4.5 Add budget limit overlay lines to line chart
    - Read budget limits from localStorage (budget_needs, budget_wants, budget_savings)
    - Use Chart.js annotation plugin to draw horizontal reference lines
    - Apply dashed line style with category colors at 50% opacity
    - Add labels showing limit values
    - Only render when showBudgetLimits state is true
    - Gracefully handle missing annotation plugin
    - _Requirements: 6.6, 6.7, 6.8, 8.2_

  - [x] 4.6 Implement donut chart rendering function
    - Write `renderDonutChart(processedData, state)` function
    - Build Chart.js doughnut configuration with category totals
    - Apply category colors: needs=#3b82f6, wants=#ea580c, savings=#10b981
    - Set cutout: 70% for donut hole
    - Configure legend at bottom position
    - Update existing chart instance or create new one
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

  - [x] 4.7 Add donut chart center text plugin
    - Implement custom Chart.js plugin with id 'centerText'
    - Calculate total spending across all categories
    - Draw total amount in center of donut hole
    - Use font: 'bold 24px Plus Jakarta Sans'
    - Center text vertically and horizontally within donut
    - _Requirements: 5.9_

  - [x] 4.8 Configure donut chart tooltips with percentages
    - Format tooltip to show: "Category: ₱{value} ({percentage}%)"
    - Calculate percentage as (value / total * 100).toFixed(1)
    - Use category name from label
    - _Requirements: 5.3, 6.1_

  - [x] 4.9 Implement chart synchronization logic
    - Write `syncDonutChart(lineChartState)` function
    - Aggregate totals from line chart's current filtered data
    - Update donut chart datasets with matching category totals
    - Filter out categories not selected in category filter
    - Call donut chart.update('active') with 200ms animation duration
    - Trigger sync on: time range change, category filter change, granularity change
    - _Requirements: 5.7, 5.8, 5.10_

---

### Phase 5: Interactive Controls

- [~] 5. Build control panel UI components
  - [x] 5.1 Create time range selector UI
    - Build preset button group in analytics-controls section
    - Add buttons: "This month", "Last 3 months", "Last 6 months", "Last 12 months", "All time"
    - Add comparison mode buttons: "This vs Last month", "Custom comparison"
    - Add "Custom" button that opens month picker
    - Apply active state styling to selected preset
    - Stack buttons vertically on mobile (max-width: 430px)
    - _Requirements: 3.1, 3.3, 3.6, 3.7, 10.2_

  - [x] 5.2 Implement custom month picker modal
    - Create month picker modal HTML structure (can be inline or separate)
    - Build month/year selector UI (dropdowns or grid)
    - Support single month selection for custom range
    - Support two-month selection for comparison mode
    - Add "Apply" and "Cancel" buttons
    - Store selected months in state (customMonths array)
    - Close modal and update charts on Apply
    - _Requirements: 3.2, 3.4_

  - [x] 5.3 Create granularity control UI
    - Build granularity button group in analytics-controls
    - Add buttons: "By day", "By week", "By month"
    - Apply active state styling to selected granularity
    - Position inline with time range selector on desktop, stacked on mobile
    - _Requirements: 3.5, 10.2_

  - [x] 5.4 Create category filter controls
    - Build category filter checkboxes/toggles in analytics-controls
    - Add three toggles: "Needs", "Wants", "Savings"
    - Apply category colors to toggle UI
    - All categories selected by default
    - Allow multiple selections (not mutually exclusive)
    - _Requirements: 7.4_

  - [x] 5.5 Create chart type switcher UI
    - Build chart type selector (tabs or buttons) in analytics-controls
    - Add options: "Single", "Combined", "Total"
    - Apply active state to selected type
    - Position near category filters
    - _Requirements: 7.5_

  - [x] 5.6 Add budget limit visibility toggle
    - Create checkbox/toggle control labeled "Show budget limits"
    - Position in analytics-controls section
    - Default to last saved state from localStorage
    - _Requirements: 6.8_

  - [x] 5.7 Wire up time range selector event handlers
    - Add click handlers to all preset buttons
    - Update window.budgetAnalytics.timeRange state on click
    - Persist selected time range to localStorage (analytics_time_range)
    - Trigger chart re-render on selection change
    - Debounce rapid changes with 200ms delay
    - _Requirements: 3.8, 9.4_

  - [x] 5.8 Wire up granularity control event handlers
    - Add click handlers to granularity buttons
    - Update window.budgetAnalytics.granularity state on click
    - Persist to localStorage (analytics_granularity)
    - Trigger data reprocessing and chart re-render
    - _Requirements: 3.8, 9.4_

  - [x] 5.9 Wire up category filter event handlers
    - Add change handlers to category toggles
    - Update window.budgetAnalytics.categories array in state
    - Trigger chart re-render (line chart updates datasets, donut syncs)
    - Maintain at least one category selected (disable last toggle)
    - _Requirements: 3.8_

  - [x] 5.10 Wire up chart type switcher event handlers
    - Add click handlers to chart type buttons
    - Update window.budgetAnalytics.chartType state on click
    - Trigger line chart view mode update
    - _Requirements: 3.8_

  - [x] 5.11 Wire up budget limit toggle event handler
    - Add change handler to budget limit checkbox
    - Update window.budgetAnalytics.showBudgetLimits state
    - Persist to localStorage (analytics_show_limits)
    - Trigger line chart re-render to show/hide limit overlays
    - _Requirements: 6.8, 9.4_

---

### Phase 6: Overlay Lifecycle & Main Integration

- [~] 6. Implement overlay open/close and main orchestration
  - [x] 6.1 Implement openChartOverlay function
    - Write `window.budgetAnalytics.open()` function
    - Set overlay display to 'flex' (from 'none')
    - Load current account and time range from state
    - Filter transactions using current state parameters
    - Process data (group by granularity, aggregate)
    - Render both line and donut charts
    - Add aria-modal attribute for accessibility
    - Trap focus within overlay for keyboard navigation
    - _Requirements: 7.2, 11.2_

  - [x] 6.2 Implement closeChartOverlay function
    - Write `window.budgetAnalytics.close()` function
    - Animate overlay exit (fadeOut)
    - Set overlay display to 'none' after animation completes
    - Remove aria-modal attribute
    - Return focus to chart button
    - Clean up event listeners if any
    - _Requirements: 7.11_

  - [x] 6.3 Add keyboard navigation support
    - Listen for Escape key to close overlay
    - Enable Tab/Shift+Tab navigation through controls
    - Add focus indicators to all interactive elements
    - Ensure close button responds to Enter/Space keys
    - _Requirements: 11.4, 11.5_

  - [x] 6.4 Add zoom and pan functionality to line chart
    - Check if Chart.js zoom plugin available
    - Enable pan: { enabled: true, mode: 'x' }
    - Enable zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
    - Add zoom reset button in chart controls
    - Log warning if plugin not available (graceful degradation)
    - _Requirements: 6.3, 6.4_

  - [x] 6.5 Implement main render orchestration function
    - Write `window.budgetAnalytics.renderCharts()` function
    - Read window.allTxns as data source
    - Apply current filters (time range, account, category)
    - Route to chunked processing if >1000 records
    - Calculate trend indicator data
    - Call renderLineChart with processed data
    - Call syncDonutChart with same processed data
    - Handle empty data state (show message, hide charts)
    - Cache processed data in state for performance
    - _Requirements: 8.1, 8.7, 8.8, 8.9_

  - [x] 6.6 Add error handling for chart rendering
    - Wrap Chart.js instantiation in try-catch blocks
    - Show user-friendly error message on failure
    - Log errors to console for debugging
    - Provide fallback empty state UI
    - Handle timeout for processing operations (3 second limit)
    - _Requirements: Error handling from design doc_

  - [x] 6.7 Add performance optimization with caching and debouncing
    - Cache processed data in window.budgetAnalytics.processedData
    - Only reprocess when time range, account, or granularity changes
    - Debounce rapid filter changes with 200ms delay
    - Use requestAnimationFrame for smooth chart updates
    - Validate render time <1000ms for <1000 records on desktop
    - _Requirements: 8.8, 10.7_

---

### Phase 7: Testing, Polish & Documentation

- [~] 7. Final testing, accessibility, and deployment prep
  - [ ] 7.1 Test with various data volumes and edge cases
    - Test with 0 transactions (empty state)
    - Test with <100 transactions (fast render)
    - Test with 1000+ transactions (chunked processing)
    - Test with single transaction
    - Test with all transactions excluded/refunded
    - Test date range edge cases (month boundaries, year transitions)
    - Verify chart render time meets performance requirements
    - _Requirements: 8.8, 8.9, 10.7_

  - [ ]* 7.2 Test responsive behavior across devices
    - Test overlay layout on mobile (iPhone SE, iPhone 15 Pro Max)
    - Test overlay layout on tablet (iPad)
    - Test overlay layout on desktop (1920x1080, 2560x1440)
    - Verify touch targets are 40x40px minimum on mobile
    - Test safe-area-inset handling on devices with notches
    - Verify control stacking on narrow viewports
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [ ]* 7.3 Test accessibility features
    - Verify chart button aria-label is present and descriptive
    - Test keyboard navigation (Tab, Enter, Escape)
    - Verify focus indicators are visible and follow design system
    - Test with screen reader (announce overlay open/close, tooltip values)
    - Verify color contrast ratios meet WCAG AA (4.5:1 minimum)
    - Test overlay close button with keyboard (Enter/Space)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ]* 7.4 Verify design system compliance
    - Check all spacing values against design-rules.txt scale
    - Verify category colors match exactly (needs=#3b82f6, wants=#ea580c, savings=#10b981)
    - Verify typography (font weights, sizes, letter-spacing)
    - Test light theme styling (overlay always #ffffff background)
    - Test dark mode app with light theme overlay contrast
    - Verify animation timing and easing curves
    - Check border radius values (20px for overlay, 14px for buttons)
    - _Requirements: 7.2, 7.7, 10.5_

  - [x] 7.5 Test account switch shimmer activation
    - Open app and switch between accounts using account dropdown
    - Verify all balance cards show shimmer effect on each switch
    - Verify shimmer duration is 1200ms (matches existing animation)
    - Test rapid account switching (shimmer should restart each time)
    - Verify shimmer uses existing .card-shimmer animation (no new code added)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 7.6 Test chart synchronization timing
    - Change time range and measure donut chart update latency
    - Toggle category filters and verify sync occurs within 200ms
    - Change granularity and verify both charts update together
    - Zoom/pan line chart and verify donut reflects visible data range (or full range depending on design)
    - _Requirements: 5.10_

  - [-] 7.7 Sync files to www folder and test in Android
    - Run `npm run sync-www` to copy files to www directory
    - Verify budget-analytics.js, budget-analytics.css, and modified index.html are synced
    - Run `npx cap sync android` to sync web assets to native project
    - Test on Android emulator: open app, tap chart button, interact with controls
    - Test native touch gestures (pinch zoom, pan)
    - Verify no console errors in Android WebView
    - _Requirements: 9.4 (deployment)_

  - [~] 7.8 Final checkpoint - Ensure all features working end-to-end
    - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional testing/validation tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation and user feedback opportunities
- Implementation follows existing Smart Wallet patterns (ES6 modules, localStorage, window globals, Chart.js)
- All code must comply with design-rules.txt (spacing, colors, typography, animations)
- Chart.js library is already loaded in index.html via CDN
- Shimmer animation already exists - no new animation code needed
- Performance targets: <1000ms render (desktop <1000 records), <1500ms (mobile), <200ms donut sync

## Implementation Context

- **Design System Reference:** `wallet app/design-rules.txt` (spacing scale, color tokens, typography, animations)
- **Existing Patterns:** Check `app-ui.js` for modal patterns, `bpi-scanner.js` for overlay examples
- **Data Source:** `window.allTxns` array synced from Firestore via `app-data.js`
- **State Management:** localStorage for persistence, window.budgetAnalytics for runtime state
- **Build Workflow:** Edit source in root → `npm run sync-www` → `npx cap sync android` → test

## Success Criteria

- Balance cards shimmer on every account change (1.2s duration)
- Chart button opens full-screen overlay with light theme
- Time range selector supports all presets and custom selection
- Line chart renders with correct data, colors, and view modes
- Donut chart synchronizes within 200ms of line chart changes
- All controls functional (time range, granularity, category filters, chart type, budget limits)
- Charts render within performance targets (<1000ms desktop, <1500ms mobile)
- Responsive layout works on mobile/tablet/desktop
- Keyboard accessible (Tab, Enter, Escape navigation)
- No console errors in browser or Android WebView
