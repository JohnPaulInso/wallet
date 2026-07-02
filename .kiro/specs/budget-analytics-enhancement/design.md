# Design Document: Budget Analytics Enhancement

## Overview

The Budget Analytics Enhancement introduces two key improvements to the Smart Wallet application: (1) automatic shimmer effect activation on balance cards when account selection changes, and (2) a comprehensive monthly budget analytics chart system. The feature enables users to visualize spending patterns across categories (Needs, Wants, Savings) with flexible time range selection, multiple chart types (line and donut), and interactive data exploration tools.

**Design Goals:**
- Provide immediate visual feedback when account data changes
- Enable detailed spending pattern analysis across flexible time periods
- Maintain high performance (charts render <500ms for <1000 records)
- Follow existing design system standards (design-rules.txt)
- Integrate seamlessly with existing codebase patterns (ES6 modules, Chart.js, localStorage, Firestore)

**Key User Benefits:**
- Visual confirmation of data updates through shimmer effect
- Multi-dimensional spending analysis (time, category, granularity)
- Comparison between different time periods
- Interactive exploration with tooltips, zoom, pan
- Full-screen distraction-free analytics interface

## Architecture

### High-Level Component Structure

```
Budget Analytics System
│
├── Shimmer Activation Module
│   ├── Account Change Listener
│   └── Shimmer Trigger (reuses existing .card-shimmer)
│
├── Chart Overlay Manager
│   ├── Overlay Lifecycle (open, close, render)
│   ├── State Management (time range, filters, granularity)
│   └── Event Handlers (user interactions)
│
├── Data Processing Engine
│   ├── Transaction Filtering (time range, account)
│   ├── Data Aggregation (grouping by granularity)
│   ├── Calculation Engine (totals, percentages, trends)
│   └── Chunked Processing (>1000 records)
│
├── Chart Rendering System
│   ├── Line Chart Renderer (Chart.js wrapper)
│   ├── Donut Chart Renderer (Chart.js wrapper)
│   └── Chart Synchronization (200ms sync between charts)
│
└── UI Components
    ├── Chart Button (next to budget-view-toggle)
    ├── Time Range Selector (presets + custom)
    ├── Category Filter Controls
    ├── Granularity Controls (day, week, month)
    └── Interactive Features (tooltips, zoom, pan)
```

### Module Files

**budget-analytics.js** (ES6 module)
- Core analytics logic and state management
- Chart rendering orchestration
- Data processing and aggregation
- Export functions: `openChartOverlay()`, `closeChartOverlay()`, `renderCharts()`, `processTransactionData()`

**budget-analytics.css** (stylesheet)
- Chart overlay styling
- Control panel layout
- Responsive breakpoints
- Animation definitions

**index.html** (modifications)
- Chart button injection (left of budget-view-toggle)
- Chart overlay HTML structure
- Module script tag
- CSS link tag

### Data Flow

```
User Action → Event Handler → State Update → Data Processing → Chart Render → UI Update
     ↓                                             ↓
Account Change → Shimmer Trigger          window.allTxns → Filter by time/account
     ↓                                             ↓
Balance Cards Shimmer                      Group by granularity → Aggregate
                                                   ↓
                                            Chart.js update → Donut sync (200ms)
```

### State Management

**Runtime State (window.budgetAnalytics)**
```javascript
{
  timeRange: 'this_month' | 'last_3_months' | 'custom' | 'comparison',
  customMonths: [startMonth, endMonth],
  granularity: 'day' | 'week' | 'month',
  categories: ['needs', 'wants', 'savings'],
  chartType: 'line' | 'donut' | 'combined',
  showBudgetLimits: boolean,
  processedData: { /* cached aggregated data */ },
  charts: { line: Chart, donut: Chart }
}
```

**Persistent State (localStorage)**
- Last selected time range: `analytics_time_range`
- Last selected granularity: `analytics_granularity`
- Budget limit visibility: `analytics_show_limits`

**Data Sources**
- Transaction data: `window.allTxns` (Firestore synced array)
- Budget limits: `localStorage.getItem('budget_needs')`, `budget_wants`, `budget_savings`
- Current account: `window.currentAccount`

## Components and Interfaces

### 1. Shimmer Activation Component

**Purpose:** Trigger shimmer effect on balance cards when account selection changes.

**Interface:**
```javascript
// Listen for account change events
function activateBalanceCardShimmer() {
  const cards = document.querySelectorAll('.balance-card');
  cards.forEach(card => {
    const shimmer = card.querySelector('.card-shimmer');
    if (shimmer) {
      shimmer.classList.add('active');
      setTimeout(() => shimmer.classList.remove('active'), 1200);
    }
  });
}

// Hook into existing account change logic
// Called from: app-data.js loadData(), account switcher onclick
```

**Integration Points:**
- Hook into existing account switcher in index.html
- Reuse existing `.card-shimmer` CSS class and animation (1.2s cardShineSweep)
- No new animation code required

**CSS (existing):**
```css
.card-shimmer.active {
  opacity: 1 !important;
}
.card-shimmer.active::before,
.card-shimmer.active::after {
  animation: cardShineSweep 1.2s ease-out forwards !important;
}
```

### 2. Chart Button Component

**Purpose:** Entry point to analytics overlay, positioned left of budget-view-toggle.

**HTML Structure:**
```html
<button class="triple-edit-btn" id="budget-analytics-btn" 
        aria-label="Open budget analytics"
        onclick="window.budgetAnalytics.open()">
  <i class="material-icons">analytics</i>
</button>
```

**Styling:**
- Matches existing `.triple-edit-btn` class styling
- Size: 40x40px minimum touch target
- Icon: Material Icons "analytics" or "insights"
- Gap: 8px spacing from budget-view-toggle
- Colors: Follow design-rules.txt button standards

**Location:** In index.html, line ~1188, before `#budget-view-toggle`

### 3. Chart Overlay Container

**Purpose:** Full-screen modal interface for analytics display.

**HTML Structure:**
```html
<div id="budget-analytics-overlay" class="analytics-overlay" style="display: none;">
  <div class="analytics-backdrop" onclick="window.budgetAnalytics.close()"></div>
  <div class="analytics-content">
    <div class="analytics-header">
      <h2 class="analytics-title">Budget Analytics</h2>
      <button class="analytics-close-btn" 
              onclick="window.budgetAnalytics.close()"
              aria-label="Close analytics">
        <i class="material-icons">close</i>
      </button>
    </div>
    
    <div class="analytics-controls">
      <!-- Time Range Selector -->
      <!-- Category Filter -->
      <!-- Granularity Controls -->
      <!-- Chart Type Switcher -->
    </div>
    
    <div class="analytics-charts">
      <div class="analytics-chart-section">
        <canvas id="analytics-line-chart"></canvas>
      </div>
      <div class="analytics-chart-section">
        <canvas id="analytics-donut-chart"></canvas>
      </div>
    </div>
  </div>
</div>
```

**CSS Architecture:**
```css
.analytics-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 100001; /* Above modals */
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.analytics-backdrop {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(12px);
}

.analytics-content {
  position: relative;
  background: #ffffff; /* Always light theme */
  border-radius: 20px;
  max-width: 95vw;
  max-height: 90vh;
  padding: 28px 24px 20px;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@media (max-width: 430px) {
  .analytics-content {
    max-width: 100vw;
    max-height: 100vh;
    border-radius: 0;
    padding: calc(env(safe-area-inset-top, 24px) + 16px) 20px 20px;
  }
}
```

### 4. Time Range Selector Component

**Purpose:** Allow users to select preset or custom time ranges.

**Interface:**
```javascript
class TimeRangeSelector {
  constructor(container) {
    this.container = container;
    this.value = 'this_month';
    this.customStart = null;
    this.customEnd = null;
  }
  
  render() {
    // Render preset buttons + custom month picker
  }
  
  getValue() {
    return {
      type: this.value,
      customStart: this.customStart,
      customEnd: this.customEnd
    };
  }
  
  onChange(callback) {
    this.callback = callback;
  }
}
```

**Preset Options:**
- "This month"
- "Last 3 months"
- "Last 6 months"
- "Last 12 months"
- "All time"
- "This vs Last month" (comparison mode)
- "Custom" (opens month picker)

**UI Pattern:**
- Button group for presets (horizontal on desktop, stacked on mobile)
- Month picker modal for custom selection
- Display current selection as text label

### 5. Line Chart Renderer

**Purpose:** Render spending trends over time using Chart.js.

**Chart Configuration:**
```javascript
{
  type: 'line',
  data: {
    labels: ['Jan 1', 'Jan 2', ...], // Based on granularity
    datasets: [
      {
        label: 'Needs',
        data: [1200, 1350, ...],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4, // Smooth curves
        fill: false
      },
      // ... wants, savings
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) => `₱${context.parsed.y.toLocaleString()}`
        }
      },
      legend: {
        display: true,
        position: 'top'
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Date' }
      },
      y: {
        title: { display: true, text: 'Amount (₱)' },
        ticks: {
          callback: (value) => `₱${value.toLocaleString()}`
        }
      }
    }
  }
}
```

**View Modes:**
- Single category: Show only needs, wants, OR savings
- Combined: Show all three categories as separate lines
- Total spending: Show needs + wants + savings as single line

**Budget Limit Overlay:**
```javascript
// Horizontal reference lines
annotation: {
  annotations: {
    needsLimit: {
      type: 'line',
      yMin: needsBudget,
      yMax: needsBudget,
      borderColor: 'rgba(59, 130, 246, 0.5)',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        content: `Needs Budget: ₱${needsBudget}`,
        enabled: true
      }
    }
    // ... wants, savings limits
  }
}
```

### 6. Donut Chart Renderer

**Purpose:** Show proportional category breakdown synchronized with line chart.

**Chart Configuration:**
```javascript
{
  type: 'doughnut',
  data: {
    labels: ['Needs', 'Wants', 'Savings'],
    datasets: [{
      data: [5000, 3000, 2000],
      backgroundColor: ['#3b82f6', '#ea580c', '#10b981'],
      borderWidth: 0
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const pct = ((value / total) * 100).toFixed(1);
            return `${context.label}: ₱${value.toLocaleString()} (${pct}%)`;
          }
        }
      },
      legend: {
        display: true,
        position: 'bottom'
      }
    },
    cutout: '70%' // Donut hole for center text
  },
  plugins: [{
    id: 'centerText',
    afterDatasetsDraw: (chart) => {
      const ctx = chart.ctx;
      const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
      ctx.save();
      ctx.font = 'bold 24px Plus Jakarta Sans';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
      const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;
      ctx.fillText(`₱${total.toLocaleString()}`, centerX, centerY);
      ctx.restore();
    }
  }]
}
```

**Synchronization Logic:**
```javascript
function syncDonutChart(lineChartState) {
  const { timeRange, categories, processedData } = lineChartState;
  
  // Aggregate totals from line chart data
  const totals = {
    needs: processedData.needs.reduce((sum, val) => sum + val, 0),
    wants: processedData.wants.reduce((sum, val) => sum + val, 0),
    savings: processedData.savings.reduce((sum, val) => sum + val, 0)
  };
  
  // Update donut chart data
  donutChart.data.datasets[0].data = [
    categories.includes('needs') ? totals.needs : 0,
    categories.includes('wants') ? totals.wants : 0,
    categories.includes('savings') ? totals.savings : 0
  ];
  
  // Animate update (200ms)
  donutChart.update('active');
}
```

**Sync Triggers:**
- Time range change
- Category filter change
- Granularity change
- Line chart zoom/pan

### 7. Data Processing Engine

**Purpose:** Filter, aggregate, and transform transaction data for chart rendering.

**Core Functions:**

```javascript
// Filter transactions by time range and account
function filterTransactions(txns, timeRange, account) {
  const now = new Date();
  let startDate, endDate;
  
  switch (timeRange.type) {
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last_3_months':
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    // ... other cases
    case 'custom':
      startDate = timeRange.customStart;
      endDate = timeRange.customEnd;
      break;
  }
  
  return txns.filter(t => {
    if (account && t.account !== account) return false;
    if (t.excluded || t.refund) return false;
    const tDate = new Date(t.date);
    return tDate >= startDate && tDate <= endDate;
  });
}

// Group transactions by granularity (day, week, month)
function groupByGranularity(txns, granularity) {
  const groups = {};
  
  txns.forEach(t => {
    const date = new Date(t.date);
    let key;
    
    switch (granularity) {
      case 'day':
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
        break;
      case 'week':
        const weekStart = getWeekStart(date);
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
    }
    
    if (!groups[key]) groups[key] = { needs: 0, wants: 0, savings: 0 };
    
    // Categorize transaction
    const category = categorizeTxn(t);
    groups[key][category] += Math.abs(t.amount || 0);
  });
  
  return groups;
}

// Aggregate totals by category
function aggregateTotals(groupedData) {
  const labels = Object.keys(groupedData).sort();
  const needs = labels.map(key => groupedData[key].needs);
  const wants = labels.map(key => groupedData[key].wants);
  const savings = labels.map(key => groupedData[key].savings);
  
  return { labels, needs, wants, savings };
}

// Chunked processing for large datasets (>1000 records)
async function processLargeDataset(txns, chunkSize = 100) {
  const chunks = [];
  for (let i = 0; i < txns.length; i += chunkSize) {
    chunks.push(txns.slice(i, i + chunkSize));
  }
  
  const results = [];
  for (const chunk of chunks) {
    results.push(...processChunk(chunk));
    await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI thread
  }
  
  return results;
}

// Calculate trend indicator (percentage change vs previous period)
function calculateTrend(currentData, previousData) {
  const currentTotal = currentData.reduce((sum, val) => sum + val, 0);
  const previousTotal = previousData.reduce((sum, val) => sum + val, 0);
  
  if (previousTotal === 0) return { direction: 'neutral', percentage: 0 };
  
  const change = ((currentTotal - previousTotal) / previousTotal) * 100;
  return {
    direction: change > 0 ? 'up' : 'down',
    percentage: Math.abs(change).toFixed(1)
  };
}

// Categorize transaction (needs, wants, savings)
function categorizeTxn(txn) {
  // Use existing category mapping from Smart Wallet
  const needsCategories = ['Food & Drinks', 'Transportation', 'Vehicle'];
  const savingsCategories = ['Savings', 'Income'];
  
  if (needsCategories.includes(txn.category)) return 'needs';
  if (savingsCategories.includes(txn.category)) return 'savings';
  return 'wants';
}
```

**Performance Optimization:**
- Cache processed data in `window.budgetAnalytics.processedData`
- Only reprocess when time range, account, or granularity changes
- Use debouncing for rapid filter changes (200ms)
- Chunked processing for datasets >1000 records

## Data Models

### Transaction Record (window.allTxns)
```javascript
{
  id: string,              // Firestore document ID
  date: string,            // ISO date string
  amount: number,          // Transaction amount (negative for expenses)
  category: string,        // Category name
  merchant: string,        // Merchant/description
  account: string,         // Account ID ('bpi', 'atome', etc.)
  excluded: boolean,       // Excluded from budget calculations
  refund: boolean,         // Refund transaction flag
  note: string             // User notes
}
```

### Processed Chart Data
```javascript
{
  labels: string[],        // Time axis labels ['Jan 1', 'Jan 2', ...]
  needs: number[],         // Needs spending per label
  wants: number[],         // Wants spending per label
  savings: number[],       // Savings per label
  totals: {
    needs: number,
    wants: number,
    savings: number
  },
  trend: {
    direction: 'up' | 'down' | 'neutral',
    percentage: number
  }
}
```

### Analytics State
```javascript
{
  timeRange: {
    type: 'this_month' | 'last_3_months' | 'custom' | 'comparison',
    customStart: Date | null,
    customEnd: Date | null
  },
  granularity: 'day' | 'week' | 'month',
  categories: string[],    // ['needs', 'wants', 'savings']
  chartType: 'line' | 'combined' | 'total',
  showBudgetLimits: boolean,
  overlayVisible: boolean
}
```

### Budget Limits (localStorage)
```javascript
{
  budget_needs: number,    // Monthly needs budget limit
  budget_wants: number,    // Monthly wants budget limit
  budget_savings: number   // Monthly savings budget limit
}
```

## Error Handling

### Empty Data State
```javascript
if (filteredTxns.length === 0) {
  showEmptyState('No transactions found for the selected period.');
  hideCharts();
  return;
}

function showEmptyState(message) {
  const emptyEl = document.querySelector('.analytics-empty-state');
  emptyEl.textContent = message;
  emptyEl.style.display = 'block';
}
```

### Chart Rendering Failures
```javascript
try {
  lineChart = new Chart(ctx, config);
} catch (error) {
  console.error('[Budget Analytics] Line chart render failed:', error);
  showErrorState('Unable to render chart. Please try again.');
  logErrorToFirestore(error);
}
```

### Data Processing Errors
```javascript
try {
  const processed = processTransactionData(window.allTxns, state);
} catch (error) {
  console.error('[Budget Analytics] Data processing failed:', error);
  showErrorState('Unable to process transaction data.');
  // Fall back to empty state
  return { labels: [], needs: [], wants: [], savings: [] };
}
```

### Performance Timeouts
```javascript
const PROCESSING_TIMEOUT = 3000; // 3 seconds

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT)
);

const processingPromise = processLargeDataset(txns);

try {
  const result = await Promise.race([processingPromise, timeoutPromise]);
} catch (error) {
  console.error('[Budget Analytics] Processing timeout:', error);
  showErrorState('Processing is taking too long. Try selecting a shorter time range.');
}
```

### Chart.js Plugin Errors
```javascript
// Graceful degradation if zoom plugin unavailable
if (typeof Chart.Zoom !== 'undefined') {
  chartOptions.plugins.zoom = { /* config */ };
} else {
  console.warn('[Budget Analytics] Chart.js zoom plugin not loaded. Zoom/pan disabled.');
}
```

## Testing Strategy

### Unit Tests
- Data filtering logic (time ranges, account filters)
- Data aggregation (grouping by granularity)
- Transaction categorization (needs/wants/savings)
- Trend calculation (percentage change logic)
- Empty state detection
- Edge cases: zero transactions, single transaction, all excluded

### Integration Tests
- Chart rendering with real data
- Time range selector interactions
- Category filter toggling
- Granularity switching
- Donut chart synchronization timing
- Budget limit overlay rendering

### E2E Tests
- Open chart overlay from button
- Select different time ranges (verify chart updates)
- Toggle categories (verify donut sync)
- Zoom and pan line chart
- Close overlay (verify cleanup)
- Account switch triggers shimmer

### Performance Tests
- Chart render time with <1000 records (<1000ms)
- Chart render time with >1000 records (<1500ms on mobile)
- Donut sync latency (<200ms)
- Chunked processing for large datasets (no UI blocking)
- Memory usage (no leaks after multiple open/close cycles)

### Accessibility Tests
- Keyboard navigation (Tab through controls, Enter/Space to activate)
- Screen reader announcements (aria-live for tooltips)
- Focus indicators visible
- Color contrast ratios (4.5:1 minimum)
- Touch targets (40x40px minimum)

### Visual Regression Tests
- Overlay appearance (light theme on all viewports)
- Responsive layout (mobile vs desktop)
- Chart animations (smooth transitions)
- Empty state display
- Error state display

**Testing Framework:** Leverage existing Smart Wallet patterns (manual testing + Capacitor native testing)

---

## Implementation Roadmap

### Phase 1: Shimmer Integration
1. Add account change listener
2. Hook shimmer activation to account switcher
3. Test shimmer timing (10-20s as specified)
4. Verify all balance cards respond

### Phase 2: Chart Button & Overlay Structure
1. Add chart button HTML (left of budget-view-toggle)
2. Create overlay HTML structure
3. Implement open/close animations
4. Add CSS styling (responsive, light theme)
5. Wire up button onclick handler

### Phase 3: Data Processing Engine
1. Implement transaction filtering
2. Implement granularity grouping
3. Implement aggregation logic
4. Add trend calculation
5. Add chunked processing for large datasets

### Phase 4: Chart Rendering
1. Initialize Chart.js instances
2. Implement line chart renderer
3. Implement donut chart renderer
4. Add chart synchronization logic
5. Add budget limit overlays
6. Configure tooltips and legends

### Phase 5: Interactive Controls
1. Build time range selector UI
2. Build category filter controls
3. Build granularity controls
4. Build chart type switcher
5. Wire up all event handlers
6. Implement state persistence (localStorage)

### Phase 6: Testing & Optimization
1. Test with various data volumes
2. Optimize performance (caching, debouncing)
3. Test responsive behavior
4. Test accessibility features
5. Fix bugs and polish UI

### Phase 7: Documentation & Deployment
1. Update README/docs
2. Sync to www/ folder
3. Test on Android native
4. Deploy to production

---

**Document Status:** Ready for review  
**Last Updated:** 2026-07-01  
**Next Phase:** Task creation after design approval
