# IRIS Element Map — T_WEEKLY: Weekly Inputs
## Version 1.0 | 2026-04-26
## Status: Ready for build

### Screen Purpose
Owner/Admin/Editor screen for entering church-wide weekly giving that is not tied to any specific service occurrence. One entry per giving source per week, stored in `church_period_giving`. The user picks a week with prev/next navigation; amounts are pre-filled when data already exists for that period.

**Week anchor (D-056):** `period_date` is the **Sunday on or before** the date in question (Sunday = start of the church week). Sun Apr 26 → 2026-04-26. Mon Apr 27 → 2026-04-26. Sat May 02 → 2026-04-26.

Route: `/services/weekly`
Access: Owner ✅ · Admin ✅ · Editor ✅ · Viewer ❌
Gate: gate_1_setup
Layout: AppLayout
Tab: services

Decisions: D-056 (period giving uses church_period_giving) · Rule 5 (SUM giving — one row per source per period) · D-003 (NULL ≠ 0 — empty input deletes existing row)

---

### Data Sources

| Data | Source |
|---|---|
| Giving sources list | `giving_sources` WHERE `is_active = true` ORDER BY `display_order` |
| Existing weekly amounts for selected week | P16a — `church_period_giving` WHERE `entry_period_type = 'week'` AND `period_date = $weekSunday` |
| Save/clear per source | P16b — UPSERT on `(church_id, giving_source_id, entry_period_type, period_date)` |

---

### Layout

```
┌─ ← Weekly ────────────────────────────────────────────────────┐
│   Church Name                                                  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ‹   Week of Apr 21, 2026   ›                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  GIVING                                                        │
│  ─────────────────────────────────────                         │
│  Cash                               $ ________                 │
│  Online                             $ ________                 │
│  Check                              $ ________                 │
│  ─────────────────────────────────────                         │
│  Total                              $  4,200.00                │
│                                                                │
│              [ Save Weekly Giving ]                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### Elements

#### E1 — Page Header
- Back arrow → `/services` (browser back also works)
- Title: "Weekly"
- Subtitle: church name
- Role: Owner · Admin · Editor
- Sticky top — same pattern as T_HISTORY header

#### E2 — Week Navigator
- Left arrow ‹ steps back one week; right arrow › steps forward one week
- Label: "Week of [Sun, Mon DD, YYYY]" — Sunday on or before the selected date
- Default on load: current week (Sunday on or before today)
- Cannot navigate past this week (right arrow disabled when at the current Sunday-anchor)
- On week change: re-fetch P16a amounts for new period_date
- Week start calculation: Sunday (D-056 — church week starts Sunday). Helper subtracts `getDay()` days.

#### E3 — Giving Rows
- One row per active giving source, ordered by `display_order`
- Label: `source_name` (left)
- Input: dollar amount (right), `type="text"` `inputMode="decimal"`, right-aligned
- Pre-filled from P16a result; empty if no existing entry for that source + week
- On blur: format value to 2 decimal places if non-empty (e.g. "100" → "100.00")
- Clear/empty input = will delete that source's row on save (D-003 — NULL ≠ 0)

#### E4 — Running Total
- Sum of all non-empty inputs, updated live on keystroke
- Label: "Total" (left), formatted amount (right): "$4,200.00" or "$0.00"
- Shown below the last giving row, separated by a hairline

#### E5 — Save Button
- Label: "Save Weekly Giving"
- Tap → iterate over all giving sources:
  - Amount entered and changed: UPSERT `church_period_giving`
  - Amount cleared (empty): DELETE existing row if one exists
  - Amount unchanged: skip (no write)
- After save: button changes to "Saved ✓" for 2 seconds, then returns to normal
- Saving state: button disabled + label "Saving…"
- Error state: button label "Error — try again" in red, re-enabled

#### E6 — Empty State (no giving sources)
- Shown when: `giving_sources` returns 0 rows
- Message: "No giving sources set up yet."
- Sub-message: "Add them in Settings first."
- Link: → `/settings/giving-sources`
- No save button shown

#### E7 — Loading Skeleton
- Shown during initial load and week navigation changes
- Skeleton rows match row height (source name + input)
- Week navigator remains visible during re-fetch

---

### Role Rules

| Role | Access | Can Save |
|---|---|---|
| Owner | ✅ Full access | ✅ |
| Admin | ✅ Full access | ✅ |
| Editor | ✅ Full access | ✅ |
| Viewer | ❌ Redirect to D2 | ❌ |

---

### Save Pattern Reference

| Action | Table | Pattern |
|---|---|---|
| Enter/update amount | `church_period_giving` | UPSERT ON CONFLICT `(church_id, giving_source_id, entry_period_type, period_date)` |
| Clear amount (empty) | `church_period_giving` | DELETE WHERE `church_id = ? AND giving_source_id = ? AND entry_period_type = 'week' AND period_date = ?` |

`period_date` is always the Sunday of the selected week (ISO: YYYY-MM-DD) — D-056.

---

### Navigation

| Trigger | Target | Condition |
|---|---|---|
| Back arrow / browser back | T1 (`/services`) | — |
| Link in E6 empty state | T_GIVING_SOURCES (`/settings/giving-sources`) | No sources configured |
