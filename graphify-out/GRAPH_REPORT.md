# Graph Report - wallet app  (2026-10-30)

## Corpus Check
- Large corpus: 203 files · ~569,123 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 902 nodes · 1608 edges · 83 communities (42 shown, 41 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 103 edges (avg confidence: 0.87)
- Token cost: 44,800 input · 10,000 output

## Community Hubs (Navigation)
- Wallet AI Assistant Core
- App UI Notification Manager
- Capacitor Android Build Config
- Android Home Screen Widgets
- App Directory Wallet AI
- Edit Goal Lifecycle Logic
- App Directory Overlays & Scanner
- BPI OCR Statement Reader
- Budget Analytics Donut Overlay
- Account Setup & BPI Fixes
- Android Splash & Launcher Icons
- Balance Card Carousel & Gestures
- Dashboard Preload & Dropdowns
- Android MainActivity Native Bridge
- Firestore Data & Bill Reminders
- Budget Threshold Notification Engine
- Bank Email Parsing & Utilities
- Encoding & Scanner Repair Scripts
- Google OAuth & Session Auth
- Cash Flow & Subscription Charts
- BPI Scanner Transaction Matching
- Budget Analysis Trend Overlay
- Dashboard HTML Snapshot Copies
- Android Unit & Instrumented Tests
- API Key Security & Templates
- Goals & Milestones UI Views
- Goals Milestone Cycle Logic
- AI Summary Documentation & Guides
- Project Report & Gmail Sync Docs
- Word Report Generator Script
- Automated Deployment Scripts
- PWA Web App Manifest
- 120fps Shimmer & Privacy Fixes
- Account Balance Cache & Loader
- Theme & Budget Widget Freeze
- Firebase Admin Guest Cleanup
- Firebase Client Configuration
- Goals Privacy & Sortable List
- Build Logs & Workspace Guides
- Brand Logo DOM Injection
- AI Summary Bugfix Reports
- Build Reports & Script Docs
- Agent Coding & Prompt Rules
- Smooth Scroll Helper
- BPI & Wise Card Assets
- Chart Exclusion Countdown Fix
- Shopping Mall Merchant Logos
- Google Brand Logo Assets
- E-Commerce Marketplace Logos
- AI Config Template
- Atome Card & Merchant Assets
- GCash & Maya Card Assets
- GoTyme & MariBank Card Assets
- Config Example Template
- Config Base Template
- Convenience & Retail Logos
- Telecom & Streaming Logos
- Fast Food Merchant Logos
- Hardware & Pharmacy Logos
- Petron & Shell Fuel Logos
- SEAOIL & TecFuel Logos
- Bank Transaction UI Screenshots
- Service Worker Asset Cache
- 7-Day Budget Trend Fix Doc
- Landscape Placeholder Image
- Traders Connect Logo

## God Nodes (most connected - your core abstractions)
1. `sendMessage()` - 22 edges
2. `Main SmartWallet SPA Shell & Dashboard (index.html)` - 20 edges
3. `repairTextArtifacts()` - 19 edges
4. `updateTripleProgressBar()` - 17 edges
5. `appendMessage()` - 17 edges
6. `renderHistoryClean()` - 15 edges
7. `log()` - 15 edges
8. `getMerchantDisplay()` - 15 edges
9. `updateBalanceCardsUI()` - 14 edges
10. `scripts` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Android Mipmap HDPI Launcher Icon` --semantically_similar_to--> `LUXE Wallet App Logo Master Graphic`  [INFERRED] [semantically similar]
  android/app/src/main/res/mipmap-hdpi/ic_launcher.png → applogo.png
- `Android Mipmap HDPI Round Launcher Icon` --semantically_similar_to--> `LUXE Wallet App Logo Master Graphic`  [INFERRED] [semantically similar]
  android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png → applogo.png
- `Android Mipmap MDPI Launcher Icon` --semantically_similar_to--> `LUXE Wallet App Logo Master Graphic`  [INFERRED] [semantically similar]
  android/app/src/main/res/mipmap-mdpi/ic_launcher.png → applogo.png
- `Android Mipmap MDPI Round Launcher Icon` --semantically_similar_to--> `LUXE Wallet App Logo Master Graphic`  [INFERRED] [semantically similar]
  android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png → applogo.png
- `Android Mipmap XHDPI Launcher Icon` --semantically_similar_to--> `LUXE Wallet App Logo Master Graphic`  [INFERRED] [semantically similar]
  android/app/src/main/res/mipmap-xhdpi/ic_launcher.png → applogo.png

## Import Cycles
- None detected.

## Communities (83 total, 41 thin omitted)

### Community 0 - "Wallet AI Assistant Core"
Cohesion: 0.11
Nodes (54): appendMessage(), askGoalQuestion(), askGoalSelection(), askTimeRange(), buildSuggestions(), buildSystemPrompt(), callGemini(), callGeminiWithAbort() (+46 more)

### Community 1 - "App UI Notification Manager"
Cohesion: 0.09
Nodes (39): BUDGET_PROGRESS_STORAGE_KEYS, collapseDailySummaryNotificationItems(), collapseGoalNotificationItems(), collapseMonthlySummaryNotificationItems(), collapseThresholdNotificationItems(), collapseTuitionReminderNotificationItems(), focusFieldWithoutPageJump(), formatNotifTimestamp() (+31 more)

### Community 2 - "Capacitor Android Build Config"
Cohesion: 0.05
Nodes (43): config, Capacitor Android APK Generation Guide, Android SHA-1 Fingerprint & google-services.json Setup, Capacitor Android Studio APK Build Process, docs/MOBILE_AUTH_SETUP.md, author, dependencies, @capacitor/android (+35 more)

### Community 3 - "Android Home Screen Widgets"
Cohesion: 0.09
Nodes (5): BudgetWidget, ChartWidget, STSWidget, WidgetPlugin, WidgetUtils

### Community 4 - "App Directory Wallet AI"
Cohesion: 0.09
Nodes (28): askTimeRange(), app/wallet-ai.css, app/wallet-ai.js, generateAndSendSummary(), goBackInSummaryFlow(), handleSummaryTypeSelection(), handleTimeRangeSelection(), hideInputBar() (+20 more)

### Community 5 - "Edit Goal Lifecycle Logic"
Cohesion: 0.11
Nodes (35): buildGoalMilestoneCycleUpdates(), cancelTxnPress(), close(), closeModals(), executeDeletion(), executeTxnDelete(), formatGoalTimestamp(), formatPeso() (+27 more)

### Community 6 - "App Directory Overlays & Scanner"
Cohesion: 0.07
Nodes (22): app/analytics-overlay.css, app/analytics-overlay.js, app/bpi-scanner.css, app/bpi-scanner.js, app/fix-chart-exclusion.js, app/gmail-scanner.js, app/index.css, app/index.html (+14 more)

### Community 7 - "BPI OCR Statement Reader"
Cohesion: 0.12
Nodes (25): acceptCard(), animateCardOut(), attachCardListeners(), attachSwipe(), buildCardHTML(), close(), closeResultsPanel(), fmtAmt() (+17 more)

### Community 8 - "Budget Analytics Donut Overlay"
Cohesion: 0.12
Nodes (29): activeCategories, BudgetAnalytics, cachedData, CATEGORY_COLORS, centerTextPlugin, closeOverlay(), createDonutChart(), createLineChart() (+21 more)

### Community 9 - "Account Setup & BPI Fixes"
Cohesion: 0.08
Nodes (21): Account Setup Firebase Auth & Firestore Init, account_setup.html (First-Time Account Setup Page), initDragAndDrop(), accounts.html (Smart Wallet Accounts Management Page), BPI OCR Scanner Fixes Checklist, BPI Scanner Card & InstaPay Fee Parsing, initCalendarSwipe(), calendar.html (Standalone Calendar & Daily Spending View) (+13 more)

### Community 10 - "Android Splash & Launcher Icons"
Cohesion: 0.07
Nodes (28): Android Drawable App Icon Foreground, Android Landscape HDPI Splash Screen, Android Landscape MDPI Splash Screen, Android Landscape XHDPI Splash Screen, Android Landscape XXHDPI Splash Screen, Android Landscape XXXHDPI Splash Screen, Android Portrait HDPI Splash Screen, Android Portrait MDPI Splash Screen (+20 more)

### Community 11 - "Balance Card Carousel & Gestures"
Cohesion: 0.14
Nodes (28): applyAccountTheme(), applyUserView(), ensureActiveBalanceCard(), getBalanceCardIndex(), getBalanceCards(), getBalanceViewport(), getCardSnapLeft(), getGestureLimitedBalanceCard() (+20 more)

### Community 12 - "Dashboard Preload & Dropdowns"
Cohesion: 0.13
Nodes (28): bridgeGlobals(), initCustomDropdowns(), upgradeSelectToCustomDropdown(), checkDailySummary(), finishInitialPreload(), getBudgetWidgetMonthContext(), getBudgetWidgetMonthOptions(), getBudgetWidgetMonthSelection() (+20 more)

### Community 14 - "Firestore Data & Bill Reminders"
Cohesion: 0.12
Nodes (6): applyPreferredDashboardFilter(), getPreferredDashboardFilterValue(), triggerAdaptiveSync(), BillReminders, db, NotificationsEngine

### Community 15 - "Budget Threshold Notification Engine"
Cohesion: 0.19
Nodes (22): clearBudgetTrigger(), consumeBudgetThresholdNotificationTrigger(), ensureBudgetThresholdLocalFallback(), ensureBudgetThresholdNotificationFromPct(), ensureBudgetThresholdNotificationFromSnapshot(), ensureSavedBudgetPctNotifications(), forceBudgetNotificationCheck(), getBudgetProgressMonthKey() (+14 more)

### Community 16 - "Bank Email Parsing & Utilities"
Cohesion: 0.15
Nodes (17): parseAtomeEmail(), parseBPIEmail(), parseMariBankEmail(), updateAISummary(), animateNumber(), CATEGORIES, cleanAIText(), formatAIAnalysisHTML() (+9 more)

### Community 17 - "Encoding & Scanner Repair Scripts"
Cohesion: 0.10
Nodes (13): content, fs, encodingFixes, files, findFilesToFix(), traverse(), fs, path (+5 more)

### Community 18 - "Google OAuth & Session Auth"
Cohesion: 0.16
Nodes (13): accessToken, handleAuthClick(), handleAuthResult(), handleSignout(), initAuth(), initGIS(), isAuthInProgress, lastTokenRefreshAttempt (+5 more)

### Community 19 - "Cash Flow & Subscription Charts"
Cohesion: 0.18
Nodes (17): detectSubscriptions(), detectTxnLogo(), drawCashFlowChart(), drawPieChart(), drawTrendChart(), filterHistoryByWeek(), getLocalFallbackNotifications(), getTxnBudgetDotHTML() (+9 more)

### Community 20 - "BPI Scanner Transaction Matching"
Cohesion: 0.21
Nodes (11): attachRealListeners(), buildTransactionCardReal(), combineInstapayTransactions(), datesMatch(), getExistingTransactions(), getMerchantInfo(), isTransactionSynced(), parseOCRTextLocal() (+3 more)

### Community 21 - "Budget Analysis Trend Overlay"
Cohesion: 0.24
Nodes (10): aggregateBudgetAnalysis(), filterTransactionsByPeriod(), forceHideTrendTooltip(), formatPeso(), getMonthCalendarWeeks(), hideTrendTooltip(), renderOverlayContent(), renderTransactionList() (+2 more)

### Community 22 - "Dashboard HTML Snapshot Copies"
Cohesion: 0.17
Nodes (13): Dashboard Snapshot Copy 2 (index copy 2.html), triggerAdaptiveSync (Copy 2), Dashboard Snapshot Copy 3 (index copy 3.html), triggerAdaptiveSync (Copy 3), Dashboard Snapshot Copy 1 (index copy.html), triggerAdaptiveSync (Copy 1), handleAuthResult, isDesktopSafeSpendMode (+5 more)

### Community 24 - "API Key Security & Templates"
Cohesion: 0.36
Nodes (8): app/ai-config.template.js, app/config.template.js, API Key Files Explained Guide, docs/API_KEY_SETUP.md, First-Time Developer Clone & API Key Onboarding, GitHub Commit Guide - Protecting API Keys, Quick Start Developer Setup Guide, README.md

### Community 25 - "Goals & Milestones UI Views"
Cohesion: 0.18
Nodes (10): loadGoalData, loadTransactionHistory, Edit Goal Page (edit-goal.html), renderMilestones, renderMonthlyChart, updateGoalForecast, updateVelocityAnalytics, Savings Goals Page (goals.html) (+2 more)

### Community 26 - "Goals Milestone Cycle Logic"
Cohesion: 0.27
Nodes (8): buildGoalMilestoneCycleUpdates(), getGoalMilestoneCycle(), getGoalMilestoneCycles(), getGoalMilestoneSequenceKey(), getGoalMilestoneSnapshotKey(), nextGoalMilestoneSequence(), readGoalMilestoneSnapshot(), writeGoalMilestoneSnapshot()

### Community 27 - "AI Summary Documentation & Guides"
Cohesion: 0.27
Nodes (9): Claude-Style Financial AI Summary, Claude-Style AI Summary Feature Guide, AI Summary Time Range Selection (Today/Week/Month/Year/All), API Key Management Documentation Index, Documentation Index (docs/README.md), Restore AI Features Guide, API Key Protection Setup Complete, AI Summary Feature Testing Checklist (+1 more)

### Community 28 - "Project Report & Gmail Sync Docs"
Cohesion: 0.22
Nodes (10): Firebase & Gmail Integration Setup Guide, Gmail OAuth & Firestore Transaction Sync, SmartWallet System Objectives & Scope, SmartWallet Project Report, Google Site Verification Token (googled6ec6ba0775bed83.html), initGIS, Workspace Permissions Config (permissions.yaml), initGIS (Auth Test) (+2 more)

### Community 29 - "Word Report Generator Script"
Cohesion: 0.27
Nodes (3): add_subtitle(), add_title(), build_docx()

### Community 30 - "Automated Deployment Scripts"
Cohesion: 0.31
Nodes (7): deploy.bat, print_step(), print_success(), print_warning(), deploy.sh script, Automated Git & Hosting Deployment Pipeline, Smart Wallet Deployment Guide

### Community 31 - "PWA Web App Manifest"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 32 - "120fps Shimmer & Privacy Fixes"
Cohesion: 0.29
Nodes (6): Session Summary (2026-07-01), Balance Card Shimmer Effect, 120fps ProMotion Performance Testing Guide, updateFPS Live Frame Counter, startRandomCardShimmers, updateBalanceCardsUI

### Community 34 - "Account Balance Cache & Loader"
Cohesion: 0.40
Nodes (6): getBody(), getCachedBalanceForAccount(), getCollectionName(), handleScan(), loadData(), normalizeLoadRequest()

### Community 35 - "Theme & Budget Widget Freeze"
Cohesion: 0.40
Nodes (5): applyTheme(), Troubleshooting Stuck Preloader & Skeleton State, holdBudgetWidgetForAccountSwitch, releaseBudgetWidgetAfterAccountSwitch, updateAccountSwitcherUI

### Community 38 - "Goals Privacy & Sortable List"
Cohesion: 0.40
Nodes (5): applyPrivacyMasking, getCachedGoals, initSortable, loadGoals, renderGoals

### Community 39 - "Build Logs & Workspace Guides"
Cohesion: 0.67
Nodes (4): Android Gradle & Capacitor Build Log, Batch Script Path Fixes Summary (g.bat & a.bat), Git Push & Secret History Cleanup Summary, Workspace Organization & Build Scripts Guide

### Community 41 - "Brand Logo DOM Injection"
Cohesion: 0.67
Nodes (3): historyContainer, injectBrandLogos(), observer

### Community 42 - "AI Summary Bugfix Reports"
Cohesion: 0.67
Nodes (4): New Chat Button During AI Summary Flow Bugfix Report, AI Summary Enhancements Completion Report, Wallet AI Financial Summary Feature, AI Summary Feature Implementation Completion Report

### Community 43 - "Build Reports & Script Docs"
Cohesion: 0.50
Nodes (3): Android Capacitor Gradle Build Report (report.txt), Scripts Directory Guide (scripts/README.md), Temporary Git Blob Hash List (temp_blob_list.txt)

### Community 46 - "BPI & Wise Card Assets"
Cohesion: 0.67
Nodes (3): BPI Bank Card Image, Wise Bank Card Image, BPI Merchant Logo

### Community 49 - "Shopping Mall Merchant Logos"
Cohesion: 0.67
Nodes (3): Ayala Malls Merchant Logo, J&L Mall Merchant Logo, SM Supermalls Merchant Logo

### Community 50 - "Google Brand Logo Assets"
Cohesion: 0.67
Nodes (3): Google Merchant Logo (PNG), Google Merchant Logo (SVG), Google Play Merchant Logo (images.png)

### Community 51 - "E-Commerce Marketplace Logos"
Cohesion: 0.67
Nodes (3): Lazada Merchant Logo, Shopee Merchant Logo, TikTok Shop Merchant Logo

## Knowledge Gaps
- **108 isolated node(s):** `@capacitor-firebase/authentication`, `@capacitor/android`, `@capacitor/app`, `@capacitor/core`, `@capacitor/local-notifications` (+103 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 323 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Main SmartWallet SPA Shell & Dashboard (index.html)` connect `Dashboard HTML Snapshot Copies` to `120fps Shimmer & Privacy Fixes`, `Wallet AI Assistant Core`, `Theme & Budget Widget Freeze`, `Build Reports & Script Docs`, `Firestore Data & Bill Reminders`, `Goals & Milestones UI Views`, `Project Report & Gmail Sync Docs`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Main SmartWallet SPA Shell & Dashboard (index.html)` (e.g. with `Dashboard Snapshot Copy 2 (index copy 2.html)` and `Dashboard Snapshot Copy 3 (index copy 3.html)`) actually correct?**
  _`Main SmartWallet SPA Shell & Dashboard (index.html)` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@capacitor-firebase/authentication`, `@capacitor/android`, `@capacitor/app` to the rest of the system?**
  _108 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Wallet AI Assistant Core` be split into smaller, more focused modules?**
  _Cohesion score 0.11447811447811448 - nodes in this community are weakly interconnected._
- **Why does `applyTheme()` connect `Theme & Budget Widget Freeze` to `120fps Shimmer & Privacy Fixes`, `App UI Notification Manager`, `Balance Card Carousel & Gestures`, `Dashboard HTML Snapshot Copies`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Should `App UI Notification Manager` be split into smaller, more focused modules?**
  _Cohesion score 0.08585858585858586 - nodes in this community are weakly interconnected._
- **Why does `switchSession()` connect `Wallet AI Assistant Core` to `AI Summary Documentation & Guides`, `Dashboard HTML Snapshot Copies`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._