# IRIS Element Map — T_WEEKLY_STATS: Weekly Stats Inputs
## Version 1.0 | 2026-04-24
## Status: Built

### Screen Purpose
Owner/Admin/Editor screen for entering church-wide week-scope stats that are not tied to any specific service occurrence — companion to T_WEEKLY (giving). One entry per `response_categories` row (where `stat_scope = 'week'`) per week, stored as untagged (`service_tag_id IS NULL`) in `church_period_entries`.

**Week anchor (D-056):** `period_date` is the **Sunday on or before** the date in question, identical to T_WEEKLY.

Route: `/services/weekly-stats`
Access: Owner ✅ · Admin ✅ · Editor ✅ · Viewer ❌
Gate: gate_1_setup
Layout: AppLayout
Tab: services

Decisions: D-003 (NULL ≠ 0 — empty input deletes existing row) · 0014 migration (nullable `service_tag_id` allows untagged church-wide period entries)

---

### Data Sources

| Data | Source |
|---|---|
| Week-scope stat categories | `response_categories` WHERE `is_active = true AND stat_scope = 'week'` ORDER BY `display_order` |
| Existing untagged values for selected week | P16c — `church_period_entries` WHERE `entry_period_type = 'week' AND period_date = $weekSunday AND service_tag_id IS NULL` |
| Save/clear per category | P16d — select-then-update-or-insert (PostgREST cannot match conflict target on a NULLable column) |

---

### Layout

```
┌─ ← Weekly Stats ──────────────────────────────────────────────┐
│   Church Name                                                  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ‹   Week of Apr 21, 2026   ›                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  WEEKLY STATS                                                  │
│  ─────────────────────────────────────                         │
│  Online viewers                            ____      [N/A]     │
│  Hands raised                              ____      [N/A]     │
│  ─────────────────────────────────────                         │
│                                                                │
│              [ Save Weekly Stats ]                             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### Elements

#### E1 — Page Header
- Back arrow → `/services`
- Title: "Weekly Stats"
- Subtitle: church name
- Role: Owner · Admin · Editor
- Sticky — same pattern as T_WEEKLY

#### E2 — Week Navigator
- Identical to T_WEEKLY E2 (Sunday-anchored, prev/next, current week is right-bound)

#### E3 — Stat Rows
- One row per active week-scope `response_categories`, ordered by `display_order`
- Label: `category_name` (left)
- Input: integer count (right), `type="number"` `inputMode="numeric"`, right-aligned, `min=0`
- N/A toggle pill on the right of the input
- Pre-filled from P16c; both `stat_value` and `is_not_applicable` round-trip

#### E4 — N/A Toggle
- Pill button per row; toggling ON hides the input and shows "N/A" italic
- Persists `is_not_applicable = true` with `stat_value = NULL`
- Toggling OFF restores the previous value (state-preserved during the session)

#### E5 — Save Button
- Label: "Save Weekly Stats"
- Tap → iterate categories:
  - Cleared (empty + not N/A): DELETE existing untagged row if one existed
  - Numeric entered: UPDATE existing untagged row, else INSERT a new untagged row
  - N/A toggled on: UPDATE/INSERT with `stat_value=NULL, is_not_applicable=true`
  - Unchanged: skip
- After save: "Saved ✓" for 2s → idle
- Error: "Error — try again", red

#### E6 — Empty State (no week-scope categories)
- Shown when: `response_categories` returns 0 rows for `stat_scope='week'`
- Message: "No weekly stats configured."
- Sub-message: "Add a stat with a Weekly scope in Settings first."
- Link: → `/settings/stats`

#### E7 — Loading Skeleton
- Same pattern as T_WEEKLY E7 (rows + nav)

---

### Role Rules

| Role | Access | Can Save |
|---|---|---|
| Owner | ✅ Full access | ✅ |
| Admin | ✅ Full access | ✅ |
| Editor | ✅ Full access | ✅ |
| Viewer | ❌ Redirect to D2 | ❌ |

---

### Save Pattern Reference (P16d)

| Action | Table | Pattern |
|---|---|---|
| Enter / update value | `church_period_entries` | SELECT id WHERE …`service_tag_id IS NULL` → UPDATE; else INSERT |
| Toggle N/A | `church_period_entries` | Same as above; `stat_value=NULL, is_not_applicable=true` |
| Clear value | `church_period_entries` | DELETE WHERE …`service_tag_id IS NULL` |

UPSERT cannot be used because PostgREST/Postgres do not match a `NULL` value via standard unique constraint logic in `ON CONFLICT`. The partial unique index `uq_period_entry_untagged` (added in 0014) still protects the table from duplicates.

---

### Navigation

| Trigger | Target | Condition |
|---|---|---|
| Back arrow / browser back | T1 (`/services`) | — |
| Link in E6 empty state | T_STATS (`/settings/stats`) | No week-scope stats configured |
