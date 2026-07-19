# Sprint 5B — Advanced Reports

## Overview

Sprint 5B enhances the Reports & Analytics module delivered in Sprint 5A with advanced export capabilities, intelligent filtering, global summary cards, and native print support. All features are implemented using Electron's built-in APIs with zero new third-party dependencies. The sprint introduces three reusable components (ReportSummaryCards, ReportFilters, ReportExportBar) that standardize the reporting experience across all six report types. Existing CSV export functionality remains fully intact and backward compatible.

---

## Objectives

- Add global summary cards above the reports displaying key metrics at a glance
- Implement advanced filters (Plan, Trainer, Status, Year, Month, Date Range) across all applicable reports
- Implement PDF export using Electron's built-in `printToPDF` API (zero dependencies)
- Implement native print via hidden HTML iframe with clean isolated layout
- Create a reusable export toolbar component (CSV, PDF, Print) shared across all reports
- Create a reusable filter bar component with configurable filter visibility
- Ensure all existing CSV export functionality continues working exactly as before
- Maintain full backward compatibility with Sprint 5A IPC handlers

---

## Features Implemented

### Global Summary Cards

- 5 key metrics displayed above report tabs: Total Revenue, Pending Amount, Active Members, Expiring (7 Days), Today's Attendance
- Dedicated IPC channel (`get-report-summary`) fetches all metrics in a single batch
- Loading skeleton animation during data fetch
- Color-coded cards with icons for quick visual scanning
- Auto-updates on page load

### Advanced Filters

- **Plan Filter** — Filter by membership plan (Pending Payments, Expiring Members, Revenue, Member Growth)
- **Trainer Filter** — Filter by assigned trainer (Pending Payments, Expiring Members)
- **Status Filter** — Filter by Active/Expired status (Pending Payments)
- **Year Filter** — Filter by registration year (Revenue, Member Growth)
- **Month Filter** — Filter by specific month (Revenue)
- **Date Range Filter** — From/To date selection with Apply button (Attendance)
- All filters are optional and additive — default behavior shows all data
- Clear button resets all active filters instantly
- Filters dynamically fetch trainer/plan options from the database

### PDF Export (Electron printToPDF)

- Uses Electron's built-in `webContents.printToPDF()` — zero external dependencies
- Creates a hidden `BrowserWindow`, renders styled HTML, generates PDF
- Native save dialog for file location selection
- Professional PDF layout with title, subtitle, summary cards, data table, and footer
- A4 page size with proper margins
- Exports currently filtered data (respects active filters)

### Native Print

- Hidden HTML iframe approach — fully isolated from app UI
- Clean print layout: title, optional summary cards, formatted data table, footer
- No sidebar, tabs, or navigation in print output
- Triggers native OS print dialog (can select printer or "Save as PDF")
- Renders instantly without external dependencies

### Reusable Report Toolbar (ReportExportBar)

- Unified export toolbar shared across all 6 reports
- Three action buttons: CSV (green), PDF (red), Print (dark)
- Loading spinners during async export operations
- All buttons auto-disabled when no data is available
- Accepts report title, headers, rows, summary cards, and filenames as props

### Reusable Report Filters (ReportFilters)

- Configurable filter visibility via boolean props (`showPlan`, `showTrainer`, `showStatus`, `showYear`, `showMonth`, `showDateRange`)
- Dynamically fetches trainer list and plan options from the database
- Year dropdown (current year back to 5 years)
- Month dropdown (January–December)
- Optional explicit Apply button for date range operations
- Clear button appears only when filters are active
- Consistent styling matching SENOVA design language

### Existing CSV Export Compatibility

- CSV export continues to work exactly as in Sprint 5A
- Same IPC channel (`export-report-csv`) — unchanged
- Same UTF-8 BOM prefix, proper escaping, and dynamic filenames
- Now also accessible via the unified ReportExportBar component

---

## Components Created

| # | Component | File | Purpose |
|---|-----------|------|---------|
| 1 | `ReportSummaryCards` | `src/components/reports/ReportSummaryCards.jsx` | Global metrics overview above report tabs |
| 2 | `ReportFilters` | `src/components/reports/ReportFilters.jsx` | Reusable configurable filter bar |
| 3 | `ReportExportBar` | `src/components/reports/ReportExportBar.jsx` | Reusable export toolbar (CSV/PDF/Print) |

---

## Files Created

| # | File | Purpose |
|---|------|---------|
| 1 | `src/utils/printReport.js` | HTML iframe native print utility |
| 2 | `src/utils/exportPdf.js` | PDF export utility via Electron IPC |
| 3 | `src/components/reports/ReportSummaryCards.jsx` | Global summary cards component |
| 4 | `src/components/reports/ReportFilters.jsx` | Reusable filter bar component |
| 5 | `src/components/reports/ReportExportBar.jsx` | Reusable export toolbar component |

---

## Files Modified

| # | File | Changes |
|---|------|---------|
| 1 | `main.js` | Added `get-report-summary` IPC handler (5 aggregate queries); added `export-report-pdf` IPC handler (hidden BrowserWindow + printToPDF); extended `get-report-pending-payments` to accept optional filters (plan, trainer, status); extended `get-report-expiring-members` to accept object payload (days, plan, trainer); extended `get-report-revenue-summary` to accept filters (plan, year, month); extended `get-report-member-growth` to accept filters (year, month, plan) |
| 2 | `src/components/ReportsPage.jsx` | Added ReportSummaryCards import and rendering between header and tab selector; updated description text |
| 3 | `src/components/reports/PendingPaymentsReport.jsx` | Integrated ReportFilters (plan, trainer, status) and ReportExportBar; added filter-triggered re-fetch |
| 4 | `src/components/reports/ExpiringMembersReport.jsx` | Integrated ReportFilters (plan, trainer) and ReportExportBar; extended IPC call to pass filter object |
| 5 | `src/components/reports/AttendanceReport.jsx` | Integrated ReportFilters (date range with Apply) and ReportExportBar; replaced inline date inputs |
| 6 | `src/components/reports/RevenueReport.jsx` | Integrated ReportFilters (plan, year, month) and ReportExportBar; added filter-triggered re-fetch |
| 7 | `src/components/reports/MemberGrowthReport.jsx` | Integrated ReportFilters (year, plan) and ReportExportBar; added filter-triggered re-fetch |
| 8 | `src/components/reports/TrainerReport.jsx` | Integrated ReportExportBar (CSV/PDF/Print) |

---

## IPC Changes

### New IPC Channels

| # | Channel (Request) | Channel (Response) | Purpose |
|---|-------------------|-------------------|---------|
| 1 | `get-report-summary` | `get-report-summary-response` | Fetch 5 aggregate metrics (totalRevenue, totalPending, activeMembers, expiringMembers, todayAttendance) |
| 2 | `export-report-pdf` | `export-report-pdf-response` | Generate PDF via hidden BrowserWindow + printToPDF, save to user-selected location |

### Extended IPC Channels (Backward Compatible)

| # | Channel | Changes |
|---|---------|---------|
| 1 | `get-report-pending-payments` | Now accepts optional `{plan, trainer, status}` filter object. If undefined, behaves exactly as Sprint 5A. |
| 2 | `get-report-expiring-members` | Now accepts object `{days, plan, trainer}` or plain number (backward compatible). |
| 3 | `get-report-revenue-summary` | Now accepts optional `{plan, year, month}` filter object. If undefined, behaves exactly as Sprint 5A. |
| 4 | `get-report-member-growth` | Now accepts optional `{year, month, plan}` filter object. If undefined, behaves exactly as Sprint 5A. |

### Unchanged IPC Channels

| # | Channel | Status |
|---|---------|--------|
| 1 | `export-report-csv` / `export-report-csv-response` | Unchanged — fully backward compatible |
| 2 | `get-report-attendance-range` / `get-report-attendance-range-response` | Unchanged — already accepted date range payload |
| 3 | `get-report-trainer-load` / `get-report-trainer-load-response` | Unchanged |

---

## Database

- No schema changes
- No migrations
- No new tables
- No existing table modifications
- No new indexes
- All reports use existing `members` and `attendance` tables with read-only queries
- Extended IPC handlers add optional WHERE clause conditions only

---

## Testing Summary

| # | Test | Result |
|---|------|--------|
| 1 | Reports Page — navigation between all 6 report tabs | ✅ PASSED |
| 2 | Summary Cards — correct values displayed for all 5 metrics | ✅ PASSED |
| 3 | Advanced Filters — Plan filter works on Pending, Expiring, Revenue, Growth | ✅ PASSED |
| 4 | Advanced Filters — Trainer filter works on Pending, Expiring | ✅ PASSED |
| 5 | Advanced Filters — Status filter works on Pending Payments | ✅ PASSED |
| 6 | Advanced Filters — Year filter works on Revenue, Growth | ✅ PASSED |
| 7 | Advanced Filters — Month filter works on Revenue | ✅ PASSED |
| 8 | Combined Filters — Multiple filters applied simultaneously produce correct results | ✅ PASSED |
| 9 | Combined Filters — Clear button resets all filters and restores full dataset | ✅ PASSED |
| 10 | CSV Export — works on all 6 reports, produces correct file | ✅ PASSED |
| 11 | PDF Export — save dialog opens, PDF file generates correctly | ✅ PASSED |
| 12 | PDF Export — file contains formatted title, summary, and data table | ✅ PASSED |
| 13 | Native Print — print dialog opens with clean isolated layout | ✅ PASSED |
| 14 | Native Print — output shows only report data (no sidebar, no tabs) | ✅ PASSED |
| 15 | Search — Attendance date range filter with Apply button works | ✅ PASSED |
| 16 | Search — Expiring members day filter (7/15/30) works alongside plan/trainer filters | ✅ PASSED |
| 17 | Empty State — export/print buttons disabled when no data matches filters | ✅ PASSED |
| 18 | Empty State — graceful messages displayed for zero-result filter combinations | ✅ PASSED |
| 19 | Refresh Test — data updates correctly when members/attendance change | ✅ PASSED |
| 20 | Regression Test — Members page unaffected | ✅ PASSED |
| 21 | Regression Test — Trainer Dashboard unaffected | ✅ PASSED |
| 22 | Regression Test — Attendance page unaffected | ✅ PASSED |
| 23 | Regression Test — Dashboard/Analysis unaffected | ✅ PASSED |
| 24 | Regression Test — WhatsApp unaffected | ✅ PASSED |
| 25 | Regression Test — Settings unaffected | ✅ PASSED |
| 26 | Stress Test — no lag, freezes, or crashes observed | ✅ PASSED |
| 27 | Build Verification — `vite build` completes with 0 errors | ✅ PASSED |
| 28 | App Startup — `npm start` launches correctly | ✅ PASSED |

---

## Performance Notes

No noticeable lag, freezes, or crashes were observed during testing. All report queries execute within acceptable response times. PDF generation via hidden BrowserWindow completes in under 1 second for typical gym data volumes. Native print rendering is instantaneous. Filter operations trigger immediate re-fetch with no perceptible delay. The summary cards load independently via a single batch IPC call and do not impact individual report performance.

---

## Known Issues

No known issues.

---

## Sprint Status

**Status:** ✅ COMPLETED

**Production Ready:** YES

---

## Next Sprint

**Sprint 6 — Backup & Restore**

Planned features:

- Manual Backup
- Automatic Backup
- Restore Database
- Backup History
- Restore Validation
- Export/Import Settings
