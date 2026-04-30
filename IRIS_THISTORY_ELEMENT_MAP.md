# IRIS Element Map — T_HISTORY: Historical Data Review
## Version 1.0 | 2026-04-22
## Status: Ready for build

### Screen Purpose
Admin/Editor screen for reviewing and inline-correcting all historical service data.
One row per `service_date`. Column groups = one per active service template (ordered by `sort_order`). Each group has sub-columns for every tracked data type (attendance fields, giving total, volunteer total, service-scope stats). Cells are directly editable — saves fire per-cell on blur/enter using the same upsert patterns as T2/T3/T4/T5.

Route: `/services/history`
Access: Owner ✅ · Admin ✅ · Editor ✅ · Viewer ❌
Gate: gate_1_setup
Layout: AppLayout
Tab: services

Decisions: D-003 (NULL≠0) · D-025 (tracking flags) · D-050 (last-write-wins) · Rule 1 (status=active) · Rule 3 (volunteers calculated) · Rule 4 (NULL≠0 in attendance) · Rule 5 (SUM giving) · Rule 6 (tags pre-stamped)

---

### Data Sources

| Data | Source |
|---|---|
| Occurrence rows with attendance and totals | P15a |
| Service-scope stat values per occurrence | P15b |
| Per-source giving breakdown (E6 popover) | `giving_entries` JOIN `giving_sources` WHERE `service_occurrence_id = $occ` |
| Per-category volunteer breakdown (E7 popover) | `volunteer_entries` JOIN `volunteer_categories` WHERE `service_occurrence_id = $occ` |
| Column group definitions | `service_templates` WHERE `is_active AND primary_tag_id IS NOT NULL` ORDER BY `sort_order` |
| Stat sub-column definitions | `response_categories` WHERE `is_active AND stat_scope = 'service'` ORDER BY `display_order` |
| Giving source definitions (E6) | `giving_sources` WHERE `is_active` ORDER BY `display_order` |
| Volunteer category definitions (E7) | `volunteer_categories` WHERE `is_active` ORDER BY `audience_group_code, display_order` |
| Tracking flags | `churches.tracks_kids_attendance · tracks_youth_attendance · tracks_volunteers · tracks_responses · tracks_giving` |

---

### Layout

```
┌─ History ─────────────────────────────────────── [ From: _____ To: _____ ] ─┐
│                                                                               │
│  ┌── DATE ──┬────── Morning Service ───────────────┬───── Evening Service ──┐ │
│  │          │ Main  Kids  Youth  Giving  Vols  [S1]│ Main  Kids  Giving ... │ │
│  ├──────────┼───────────────────────────────────────┼───────────────────────┤ │
│  │ Apr 20   │  245    88     30  [4,200] [ 47]  [6] │   98    —   [1,100]   │ │
│  │ Apr 13   │  230    75     —   [3,900] [ 42]  [4] │   88    22  [980]     │ │
│  │ Apr 06   │  218    70     28  [3,700] [ 40]  [3] │   —     —    —        │ │
│  │ Mar 30   │  201    65     25  [3,200] [ 38]  [5] │   75    18  [840]     │ │
│  └──────────┴───────────────────────────────────────┴───────────────────────┘ │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

- `[ ]` = cells that open a popover (giving, volunteers)
- Plain integers = inline editable directly in cell
- `—` = NULL / no data entered (still editable — clicking activates input)
- Column groups scroll horizontally if screen is narrow; date column is sticky left

---

### Elements

#### E1 — Page Header
- Title: "History"
- Subtitle: church name
- Role: Owner · Admin · Editor
- No back button (accessed from T1 via link; browser back works naturally)

#### E2 — Date Range Filter
- Two date inputs: "From" and "To"
- Default range: 12 months back from today to today
- On change: re-fetch P15a + P15b for new range
- Placement: top-right of header row

#### E3 — Column Group Header Row (row 1 of sticky header)
- One cell per active service template, spanning its sub-columns
- Label: `service_templates.display_name`
- For multi-location churches: append location name if two templates share the same `display_name`
- Ordered by `service_templates.sort_order` ASC
- First cell spans the date column (label: "Date")
- Background: slightly elevated (distinguishes from data)

#### E4 — Sub-Column Header Row (row 2 of sticky header)
Sub-columns per service group, shown only when the relevant tracking flag is true:

| Sub-column | Label | Condition | Type |
|---|---|---|---|
| Main attendance | "Main" | always | inline edit |
| Kids attendance | "Kids" | `tracks_kids_attendance` | inline edit |
| Youth attendance | "Youth" | `tracks_youth_attendance` | inline edit |
| Giving total | "Giving" | `tracks_giving` | popover |
| Volunteer total | "Vols" | `tracks_volunteers` | popover |
| [stat category name] | category_name | `tracks_responses` — one per active service-scope category | inline edit |

Sub-columns appear in the order listed above. Stat sub-columns appear in `response_categories.display_order`.

#### E5 — Data Row (one per unique `service_date`)
- Ordered by `service_date` DESC (most recent at top)
- First cell: formatted date (e.g., "Apr 20" for current year, "Apr 20, 2025" for prior year)
- Date cell links to the relevant occurrence detail page (E9) — if multiple occurrences on that date, link to the first one by `sort_order`
- Remaining cells: one per sub-column per service group
- A service group with no occurrence on this date: all its cells are `—` (non-editable, grey)
- A service group with an occurrence but no data entered: all cells show `—` but ARE editable

#### E5a — Inline Edit Cell (attendance, stats)
- Display state: shows value right-aligned, or `—` if NULL
- Clicking/tapping cell activates edit mode: replaces display with a number input, value pre-filled
- Input: `type="text"` `inputMode="numeric"` — same as T2/T4
- NULL distinction: empty input saves NULL (not zero) — Rule 4
- Enter or blur: saves immediately; cell returns to display state
- Escape: cancel, restore original value
- Saving: spinner overlay on cell (no full-page block)
- Error: red outline on cell, value restored, toast message
- Save target: UPSERT `attendance_entries` (attendance) or DELETE+INSERT `response_entries` (stats, service-scope, audience_group_code = NULL)

#### E5b — Popover Cell (giving, volunteers)
- Display state: shows formatted total right-aligned (e.g., "$4,200" or "47"), or `—` if no data
- Clicking/tapping cell opens E6 (giving) or E7 (volunteers) popover anchored to the cell
- Popover closes on outside click or "Done" button
- After popover closes, cell total updates to reflect any changes

#### E6 — Giving Popover
- Triggered by: clicking a Giving cell (E5b)
- Title: service name + date (e.g., "Morning · Apr 20")
- Content: one row per active giving source
  - Source name (left)
  - Dollar amount input (right), formatted to 2 decimals
  - Clear/empty = delete that source row from DB (same as T5)
- Running total shown at bottom of popover
- "Done" button: saves all changes (UPSERT per source), closes popover
- Save pattern: UPSERT `giving_entries` ON CONFLICT `(service_occurrence_id, giving_source_id)`
- Empty source input on save: DELETE that row (same as T5 clear behavior)

#### E7 — Volunteer Popover
- Triggered by: clicking a Volunteer cell (E5b)
- Title: service name + date
- Content: rows grouped by audience_group_code (MAIN, KIDS, YOUTH), then by category
  - Category name (left)
  - Count input (right)
  - "N/A" toggle button per row (same as T3)
- Group totals shown per section
- Grand total shown at bottom
- "Done" button: saves all changes (UPSERT per category), closes popover
- Save pattern: UPSERT `volunteer_entries` ON CONFLICT `(service_occurrence_id, volunteer_category_id)`
- Rule 3: totals are calculated from entries — never stored

#### E8 — Empty State
- Shown when: no occurrences exist in the selected date range
- Message: "No services found for this period."
- Sub-message: "Adjust the date range or check that services have been created."
- No action buttons

#### E9 — Loading Skeleton
- Shown during initial data fetch and date range changes
- Skeleton rows match expected row height
- Column group headers remain visible during re-fetch

#### E10 — Occurrence Link
- The date cell in each row (E5) is a link to `/services/[occurrenceId]`
- If multiple occurrences exist on that date: link to the one with the lowest `service_templates.sort_order`
- Link navigates away from T_HISTORY (browser back returns to T_HISTORY)
- Styled: date text with subtle underline on hover

---

### Role Rules

| Role | Access | Can Edit |
|---|---|---|
| Owner | ✅ Full access | ✅ All cells |
| Admin | ✅ Full access | ✅ All cells |
| Editor | ✅ Full access | ✅ All cells |
| Viewer | ❌ Redirect to D2 | ❌ — |

---

### Save Patterns Reference

| Cell type | Table | Pattern |
|---|---|---|
| Main / Kids / Youth attendance | `attendance_entries` | UPSERT on `(service_occurrence_id)` |
| Stats (service-scope) | `response_entries` | DELETE + INSERT for `(occ_id, category_id, audience_group_code IS NULL)` |
| Giving per source (E6) | `giving_entries` | UPSERT on `(service_occurrence_id, giving_source_id)` |
| Volunteers per category (E7) | `volunteer_entries` | UPSERT on `(service_occurrence_id, volunteer_category_id)` |

NULL field → do not insert / delete existing row (same as T5 clear behavior for giving; same as T2 NULL handling for attendance).

---

### Navigation

| Trigger | Target | Condition |
|---|---|---|
| Tap date cell / occurrence link | T1B (`/services/[occurrenceId]`) | occurrence exists |
| Browser back | T1 (`/services`) | — |
