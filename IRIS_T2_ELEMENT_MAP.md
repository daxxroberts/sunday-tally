# IRIS Element Map — T2: Attendance Entry
## Version 1.1 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Enter MAIN, KIDS, YOUTH attendance for selected occurrence.
Three fields. One DB row. Simplest entry screen in the product.

### Inherited
E1 Persistent Occurrence Header — from T1b. Not redefined here.

### Data Sources
| Data | Source |
|---|---|
| Existing entry | attendance_entries WHERE service_occurrence_id = ? |
| Current user | auth.uid() for last_updated_by |

### Screen States
1. Empty — no prior entry, MAIN field focused, numeric keyboard open
2. Pre-filled — existing values shown, user correcting
3. Submitted — green confirmation, auto-return to T1b after 1.5s

### Elements

**E1** — Persistent Occurrence Header [inherited]

**E2** — Field: Main Attendance
- Label: "Main" above field (not placeholder)
- Numeric keyboard auto-opens on screen load
- Empty: "–" placeholder (NULL = not entered)
- Zero: "0" (confirmed zero — user typed it)
- Tab/return: advance to KIDS

**E3** — Field: Kids Attendance
- Label: "Kids" — same as E2
- Tab/return: advance to YOUTH

**E4** — Field: Youth Attendance
- Label: "Youth" — same as E2
- Tab/return: trigger submit

**E5** — Running Total
- "Total: [MAIN + KIDS + YOUTH]" — real-time, display only
- NULL fields contribute 0 to display total only
- Does not affect stored values

**E6** — Submit Button
- "Save Attendance"
- UPSERT: INSERT ON CONFLICT DO UPDATE
- Writes last_updated_by = auth.uid()
- Success → State 3
- Failure → inline error "Couldn't save. Tap to retry." — value held

**E7** — Confirmation State [State 3]
- Full-screen green momentary state
- "Attendance saved — Main [x] · Kids [x] · Youth [x]"
- Auto-dismisses to T1b after 1.5s or tap

**E8** — Unsaved Changes Prompt [D-028]
- Triggered on back if fields are dirty and unsaved
- "Save before leaving? You have unsaved attendance."
- Options: "Save and leave" · "Leave without saving" · "Keep editing"

### Key Rules
- NULL vs 0: Empty field on submit = NULL. User types 0 = stored as 0. Never coerce.
- D-003: No is_not_applicable — attendance is always meaningful
- D-028: Prompt on back if dirty fields

### Navigation
In: from T1b (session anchor written)
Out: E6 submit → State 3 → T1b
     E1 back → T1b (prompt if dirty — D-028)

### Role Rules
Owner ✅ · Admin ✅ · Editor ✅ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N11 | UPSERT must write last_updated_by — not optional |
| N12 | Numeric keyboard auto-focus MAIN field on load |
| N13 | Back with dirty fields → prompt (D-028) |

### Handoff to T3
T3 inherits E1 Persistent Occurrence Header.
Back from T3 → T1b.

---

## Revision 1.1 — D-029 + D-030 Applied

**D-030: Completion = Submitted**
attendance_entries row EXISTS = complete. Binary state only.
No "in-progress" for attendance. No field-level gate.
NULL fields in submitted row = valid data, excluded from averages per Rule 4.

**D-029: Audience group flags are UX only**
tracks_kids_attendance = false → Kids field hidden in T2
tracks_youth_attendance = false → Youth field hidden in T2
Does NOT affect completion logic — submitted = complete regardless of which fields shown.

**Updated E3d (attendance) states:**
- ⬜ Empty — no attendance_entries row for this occurrence
- ✅ Complete — attendance_entries row exists (submitted)
- (No in-progress state for attendance)

**Updated E2 / E3 / E4 field visibility:**
- Main: always shown
- Kids: shown only if tracks_kids_attendance = true
- Youth: shown only if tracks_youth_attendance = true
- Min fields shown: 1 (main only) · Max: 3 (all three)

---

## Revision 1.2 — D-030 Revised

**D-030 revised: All tracked fields required for completion.**
Submit is allowed with NULL fields (partial save valid).
Completion indicator reflects whether all tracked fields are filled.

**Updated E3d states:**
- ⬜ Empty — no attendance_entries row
- 🔵 In-progress — row exists, ≥1 tracked field is NULL
- ✅ Complete — row exists, all tracked fields non-NULL

**D-029 revised: Audience flags affect both visibility AND completion.**
tracks_kids_attendance = false → Kids hidden AND excluded from completion check.
tracks_youth_attendance = false → Youth hidden AND excluded from completion check.

**Submit behaviour:**
- User can submit with any combination of filled/empty fields
- Partial submit saves what's there, leaves rest NULL
- Indicator updates on return to T1b — shows in-progress if any tracked field NULL
- User can return to T2 and fill remaining fields at any time
