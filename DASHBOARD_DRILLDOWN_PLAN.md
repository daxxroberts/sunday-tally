# Dashboard Drill-Down — Plan (not yet built)
Owner: PRODUCT/NOVA · 2026-06-06 · status: PROPOSED (separate from the tooltip + totals work, which shipped)

## Goal
Make every value cell in the 4-column dashboard **clickable**, opening a focused drill-down for
exactly the metric the user clicked. The cell clicked determines the selection:
**which ministry/audience × which reporting metric (attendance/volunteers/giving/stat) × which window.**

Two drill-down shapes, by column:

### A. "Last 4-Wk" cell → 4-week detail grid
- Click e.g. **Experience → Attendance → Last 4-Wk** → drawer showing the **last 4 weeks**, each week broken into its **individual sittings** (e.g. First Experience 9:00 + Second Experience 10:30), plus the week total and the running 4-week average (the number they clicked).
- Confirms *what made up the average* — both services per week, all four weeks.

### B. "Curr YTD" / "Prior YTD" cell → line chart + weekly grid
- Click a **YTD** value → top: a **line chart** with two lines from Jan 1 — **current YTD** and **prior YTD** — for that metric.
- Below the chart: a **grid of weekly values** (current-YTD weekly series) for that metric, week by week.
- Drill is metric-specific: clicking Experience-attendance YTD charts that; clicking the grand-total or a different ministry charts that instead.

(Curr Wk and Prior-YTD click targets: Curr Wk could open the same 4-week grid centered on the current week; Prior YTD opens the same chart as Curr YTD. Decide in Phase 1.)

## What a "selector" carries
Each clickable cell emits: `{ scope: 'ministry'|'audience'|'grandTotal'|'volunteers'|'stat'|'giving', tagId?, reportingTagCode?, statCategoryId?, label, window: 'w'|'m4'|'ytd'|'priorYtd', prefix? }`.
The drill-down fetch resolves that to the right `metric_entries` slice.

## Data layer (new)
`fetchMetricSeries(churchId, selector, { grain, range, asOf })`:
- **grain `'sitting'`** (4-week view): per service_instance (occurrence) values within the 4-week range → week → sittings. Honors the 6 critical rules (status='active', NULL≠0, SUM giving per occurrence, etc.).
- **grain `'weekly'`** (YTD view): weekly-summed series Jan 1→now for current and prior year (two arrays for the chart) + the weekly grid rows.
- Reuses the existing weekly-map builders in `dashboard.ts` (`buildWeeklyFrom`, `weekOf`, boundaries) so numbers reconcile exactly with the cards. Anchored by the same `asOf` date the dashboard uses.

## UI
- **Make `FourColRow` cells buttons** (each value cell) carrying its selector; only render as a button when a drill exists for that scope/window. Keyboard + aria.
- **Drawer/Modal** component (right-side drawer on desktop, bottom sheet on mobile). DS-compliant (#4F6EF7, no red, Fira numerals, status circles).
- **4-week grid**: weeks (rows) × sittings (cols) + week total + the avg.
- **YTD view**: line chart (current vs prior, legend, hover readout) + weekly grid below.
- **Chart approach — DECISION NEEDED:** hand-rolled SVG line chart (no dep, full DS control) vs a light lib (e.g. recharts). Lean hand-rolled SVG for one two-line chart to avoid a dependency; revisit if more chart types are needed (ties to the ui-ux-pro-max chart set).

## Phasing
1. Selector plumbing + make cells clickable (no-op drawer) — proves the click→selector path.
2. `fetchMetricSeries` (both grains) + reconcile against card numbers (FELIX).
3. 4-week drawer grid (shape A).
4. YTD chart + weekly grid (shape B).
5. Polish: empty/È loading states, mobile sheet, a11y, the Curr-Wk/Prior-YTD click behaviors.

## Gate / artifacts
- New IRIS element map section for the drawer (E-numbers), DESIGN_SYSTEM compliance, FELIX (numbers reconcile with cards) + LENS (render) before ship. Per SUBAGENT_STANDARD if built via sub-agents.

## Open questions
- Drawer vs dedicated `/dashboard/metric/[...]` route (shareable URL)?
- Should Curr Wk be clickable (→ this week's sittings)?
- Mobile: bottom sheet vs full screen?
- Chart library decision (above).
