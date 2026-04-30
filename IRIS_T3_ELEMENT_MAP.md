# IRIS Element Map — T3: Volunteer Entry
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Enter volunteer counts per subcategory per audience group.
Sectioned: MAIN / KIDS / YOUTH. Section-submit pattern.
Requires tracks_volunteers = true.

### Inherited
E1 Persistent Occurrence Header — from T1b.

### Data Sources
| Data | Source |
|---|---|
| Active categories | volunteer_categories WHERE church_id = ? AND is_active = true |
| Existing entries | volunteer_entries WHERE service_occurrence_id = ? |

### Gate Check
tracks_volunteers = false → screen inaccessible, T1b hides row, URL redirect to T1b.

### Screen States
1. Empty — no prior entries, MAIN section expanded
2. Pre-filled — existing values shown
3. Section complete — section collapses to summary after submit
4. No categories — church has zero active volunteer categories

### Elements

**E1** — Persistent Occurrence Header [inherited]

**E2** — Section Container [repeating — MAIN, KIDS, YOUTH]

  **E2a** — Section Header
  - "[Group] Volunteers" · Running total (real-time)
  - Tap to expand/collapse
  - Pre-filled: shows existing total immediately

  **E2b** — Category Row [repeating within section]
  - Category name (left) ← volunteer_categories.category_name
  - Count input (right) — integer ≥ 0, numeric keyboard
  - N/A toggle (far right) — is_not_applicable = true, disables + clears count
  - Empty: "–" · Pre-filled: existing count or N/A state
  - Ordered by volunteer_categories.sort_order

  **E2c** — Section Submit Button
  - "Save [MAIN/KIDS/YOUTH] Volunteers"
  - UPSERT all category rows in section — one transaction
  - Success → section collapses to E2d summary state

  **E2d** — Section Summary State [after submit]
  - "MAIN: 24 volunteers · Music 8 · Parking 6 · Greeters 10"
  - Tap to re-expand for corrections

**E3** — Empty State: No Categories
- "No volunteer categories set up yet."
- CTA (Owner/Admin only): "Add categories in Settings" → T7
- Editor: message only

**E4** — All Sections Submitted State
- All sections in summary state
- "Save and return" → T1b

**E5** — Unsaved Changes Prompt [D-028]
- On back if any section has dirty unsaved fields
- "Save before leaving? You have unsaved volunteer counts."
- "Save and leave" · "Leave without saving" · "Keep editing"

### Key Rules
- Zero vs N/A vs not entered: three distinct states, all meaningful
- Soft-delete: deactivated categories not shown (active only in entry)
- Section submit = one transaction per section
- Volunteer totals calculated from rows — never stored

### Navigation
In: from T1b Volunteers row
Out: all sections submitted + "Save and return" → T1b
     E1 back → T1b (prompt if dirty — D-028)

### Role Rules
Owner ✅ · Admin ✅ · Editor ✅ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N14 | Section UPSERT — all rows in section in one transaction |
| N15 | Category rows ordered by volunteer_categories.sort_order |
| N16 | N/A toggle: stores is_not_applicable=true, volunteer_count=0 |

### Handoff to T4
T4 uses identical section pattern — same components, different data.
E1 inherited. Back from T4 → T1b.
