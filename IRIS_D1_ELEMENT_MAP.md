## Status: In revision — awaiting Owner sign-off
## Version: 2.0 (draft, 2026-04-17)
## Supersedes: v1.0 (2026-04-10, status was "Complete — Ready for build")
## Plan: C:\Users\daxxr\.claude\plans\inherited-enchanting-tome.md

# IRIS Element Map — D1: Full Dashboard
## Version 2.0 | 2026-04-17
## Status: Draft — Awaiting Owner sign-off before build

### Screen Purpose
Primary reporting screen for Owner and Admin.
**Four simultaneous time columns** — Current Week · Last 4-Wk Avg · Current YTD Avg · Prior YTD Avg.
**Church-wide, sectioned layout** — no tag grouping at top level.
Each column stacks the same sections top-to-bottom: KPI cards (cross-column) → Summary Card → Adults → Kids → Youth → Volunteer Breakout → Other Stats.
Tags appear only as inline labels inside Other Stats (e.g., `Parking (MORNING)`).
Decisions: D-033 (revised) · D-041 (revised) · D-044 (superseded) · D-045 · D-053 · D-054 · D-055 · D-002 · D-029

### Data Sources
| Data | Source |
|---|---|
| Time-window totals (attendance, vols, stats, giving) | P14a + P14b + P14c + P14d |
| Audience breakdowns | P14e |
| Volunteer category breakouts | P14f |
| Other Stats (service-scope + period entries) | P14g |
| Tracking flags | `churches.tracks_volunteers` · `tracks_responses` · `tracks_giving` |
| Summary Card metric visibility prefs | `localStorage` — `sundaytally:d1_summary_metrics:{user_id}:{church_id}` |

### Layout
```
┌─ Dashboard ─────────────────────────────────────────────────── {date} ──┐
│ [ KPI Highlight Cards — spans full width, cross-column ]               │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                                   │
│ │ Attend. │ │ Giving  │ │ Volunt. │                                   │
│ └─────────┘ └─────────┘ └─────────┘                                   │
│                                                                         │
│                 Curr Wk    Last 4-Wk   Curr YTD    Prior YTD          │
│                 ═══════    ═════════   ════════    ═════════          │
│ SUMMARY                                                                │
│   Grand Total    1,247  Δ  1,182    |   1,110  Δ  1,063               │
│   Adults           892  Δ    855    |     800  Δ    770               │
│   Kids             205  Δ    180    |     185  Δ    170               │
│   Youth            150  Δ    147    |     125  Δ    123               │
│   Volunteers        47  Δ     45    |      44  Δ     42               │
│   First-Time         6  Δ      4    |       5  Δ      3               │
│   Giving      $12,480  Δ $11,200    |  $10,800 Δ $ 9,500              │
│   [⚙ customize]                                                        │
│                                                                         │
│ ADULTS                                                                 │
│   Attendance       892 …          …         …        …                │
│   Volunteers        28 …          …         …        …                │
│   First-Time         4 …          …         …        …                │
│   Rededication       2 …          …         …        …                │
│                                                                         │
│ KIDS                                                                   │
│   Attendance       205 …          …         …        …                │
│   Volunteers        12 …          …         …        …                │
│   First-Time         1 …          …         …        …                │
│                                                                         │
│ YOUTH                                                                  │
│   Students         150 …          …         …        …                │
│   Volunteers         7 …          …         …        …                │
│   First-Time         1 …          …         …        …                │
│                                                                         │
│ VOLUNTEER BREAKOUT                                                     │
│   Total             47 …          …         …        …                │
│   Adults · Music    10 …          …         …        …                │
│   Adults · Parking   8 …          …         …        …                │
│   Kids · Teachers    6 …          …         …        …                │
│   Youth · Leaders    4 …          …         …        …                │
│                                                                         │
│ OTHER STATS                                                            │
│   Parking (MORNING)      45 …     …         …        …                │
│   Parking (EVENING)      30 …     …         …        …                │
│   Coffee cups (MORNING)  12 …     …         …        …                │
└─────────────────────────────────────────────────────────────────────────┘
```
Δ = delta badge ▲/▼% applied ONLY between Col1↔Col2 and Col3↔Col4. No delta Col2↔Col3.

### Elements

**E1** — Header: "Dashboard"
- Sticky top, church name sub-label, today label chip on right. Unchanged from v1.0.

**E2** — KPI Highlight Cards [above the 4-column grid]
- Three church-wide tiles: Attendance, Giving, Volunteers. Unchanged from v1.0.
- Each tile: big current-week number, delta ▲▼% vs last week, "vs N last week" sub-label.
- Giving tile hidden when `tracks_giving = false`.
- Volunteers tile hidden when `tracks_volunteers = false`.

**E3** — Summary Card [§2 — top of the 4-column grid stack]
- One Summary Card per column. Default metrics shown (all on):
  - **Grand Total** — MAIN + KIDS + YOUTH attendance
  - **Adults** — MAIN attendance
  - **Kids** — KIDS attendance
  - **Youth** — YOUTH attendance
  - **Total Volunteers** — sum of `volunteer_entries.volunteer_count WHERE is_not_applicable = false`
  - **First-Time Decisions** — sum of `response_entries.stat_value` where `response_categories.category_code = 'FIRST_TIME_DECISION'`
  - **Giving** — sum of `giving_entries.giving_amount` (only when `tracks_giving`)
- Tap ⚙ gear icon → reveals inline checkbox list. User toggles which metrics render. Persisted to `localStorage` under `sundaytally:d1_summary_metrics:{user_id}:{church_id}`.
- Each metric line renders across all four columns with deltas Col1↔Col2 and Col3↔Col4.
- First-Time Decisions line hidden when `tracks_responses = false`. Giving line hidden when `tracks_giving = false`. Total Volunteers line hidden when `tracks_volunteers = false`.

**E4** — Adults Section [§3 — MAIN audience breakdown]
- Section label: "ADULTS"
- Rows:
  - Attendance (MAIN)
  - Volunteers (sum of `volunteer_entries` joined to `volunteer_categories` where `audience_group_code = 'MAIN'`, `is_not_applicable = false`). Hidden when `tracks_volunteers = false`.
  - One row per active `response_categories` where `stat_scope = 'audience'`. Shows the MAIN-scoped `response_entries.stat_value` per time window. Hidden when `tracks_responses = false`.

**E5** — Kids Section [§4 — KIDS audience breakdown]
- Same shape as E4, filtered to KIDS audience.
- Entire section hidden when church has no KIDS data AND (per D-029 precedent) audience attendance tracking is off — but default is visible since MAIN/KIDS/YOUTH are the fixed audience set (D-002).

**E6** — Youth Section [§5 — YOUTH audience breakdown]
- Same shape as E4, filtered to YOUTH audience.
- Attendance row labeled "Students" (per Owner wording).

**E7** — Volunteer Breakout [§6 — cross-audience detail]
- Section label: "VOLUNTEER BREAKOUT"
- Rows:
  - Total — all volunteers across all audiences and categories
  - One row per active `volunteer_categories`, labeled `{audience} · {category_name}` (e.g., `Adults · Music`, `Kids · Teachers`). Sorted by audience (MAIN → KIDS → YOUTH) then by `sort_order`.
- Entire section hidden when `tracks_volunteers = false`.

**E8** — Other Stats [§7 — flat list, tag-labeled]
- Section label: "OTHER STATS"
- Rows:
  - Every active `response_categories` entry where `stat_scope = 'service'` — show `response_entries.stat_value` summed per time window. No tag label needed (one value per service).
  - Every `church_period_entries` aggregate — label format: `{category_name} ({tag_code})`, e.g., `Parking (MORNING)`. One row per `(response_category_id, service_tag_id)` pair.
- Sorted alphabetically by `category_name` then by `tag_code`.
- **First-Time Decisions / Salvations do NOT appear here.** They belong to the Summary Card and the per-audience sections only.
- Entire section hidden when `tracks_responses = false`.

**E9** — Empty State
- "No data yet — data appears here after your first Sunday entry."

**E10** — One Week State (carries N97 from v1.0)
- When church has only one week of data:
  - Current Week column shows values.
  - Last 4-Wk Avg / Current YTD Avg / Prior YTD Avg cells show "—".
  - Deltas show "—".
  - Below the grid: "Comparisons appear after two weeks of data."

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌ (Viewer redirected to D2 by middleware — unchanged from v1.0)

### NOVA Items

| # | Requirement |
|---|---|
| N75 | Four time columns always rendered simultaneously (D-033 revised). No toggle. |
| N76 | Summary Card metric visibility read from `localStorage` on mount; defaults all on if key missing. Write-through on every checkbox change. |
| N77 | Deltas between Col1↔Col2 and Col3↔Col4 only. Formula: `((current - prior) / prior) × 100`, "—" when prior is null or zero (D-053). |
| N78 | Grand Total attendance = `MAIN + KIDS + YOUTH`, with NULL-aware summation. NULL fields excluded from the average's denominator (Rule 4 in CLAUDE.md) (D-055). |
| N79 | Prior YTD Avg denominator = weeks with ≥1 active occurrence in the prior calendar year, same week window as Current YTD (N72 carry-over, D-055). |
| N80 | Audience rows (E4/E5/E6) read `attendance_entries.main_attendance` / `kids_attendance` / `youth_attendance` respectively. Volunteer rows join `volunteer_categories.audience_group_code`. Stats rows join `response_categories.stat_scope = 'audience'`. |
| N81 | Volunteer Breakout (E7) joins `volunteer_categories` and lists every active category grouped by `audience_group_code`, sort by `audience_group_code, sort_order`. |
| N82 | Other Stats (E8) UNIONs `response_entries WHERE response_categories.stat_scope = 'service'` and `church_period_entries`. Tag label only shown for period entries (service-scope stats have no tag binding). |
| N83 | Tracking flags (`tracks_volunteers`, `tracks_responses`, `tracks_giving`) hide corresponding rows in Summary Card AND their full sections AND KPI cards (D-045). |
| N84 | Viewer → `/dashboard` → middleware redirect to `/dashboard/viewer` (unchanged from v1.0 N74). |

### What Changed from v1.0

| v1.0 element | v2.0 treatment |
|---|---|
| E2 Tag Filter | **Removed.** Tags are no longer the top-level grouping axis. |
| E3 Primary Tag Rows | **Removed.** Replaced by Summary Card (E3) + audience sections (E4/E5/E6). |
| E4 Metric Sub-rows | **Removed.** Metric rows now live inside their semantic section (audience or Volunteer Breakout or Other Stats). |
| E5 Comparison Columns (3) | **Replaced** by four columns with Prior YTD as explicit Col 4. |
| E7 Audience Drill-Down (tap to expand) | **Removed.** Audience is always visible as E4/E5/E6 sections. |
| E8 Subtag Filter | **Removed.** Deferred — subtag filtering not in D1 v2.0 scope. |
| E9 Per-Service Breakdown | **Removed.** Deferred — per-service breakdown not in D1 v2.0 scope. |
| KPI Highlight Cards | **Kept as E2**, unchanged. |
| Empty State | **Kept as E9**, unchanged copy. |
| One Week State (N97) | **Kept as E10**, identical behavior. |

### Build Order (matches plan)

1. Revise DECISION_REGISTER.md (D-033, D-041, D-044, + new D-053/54/55).
2. Append P14d–P14g to QUERY_PATTERNS.md.
3. Owner signs off on these three authority docs.
4. Rewrite `src/lib/dashboard.ts` to new `DashboardData` shape.
5. Rewrite `src/app/(app)/dashboard/page.tsx` using new sectioned components.
6. Create `src/lib/dashboardPrefs.ts` for localStorage.
7. Verify per the 9-point checklist in the plan file.
8. Resolve D1 entry in BUILD_FLAGS.md. Commit + push.
