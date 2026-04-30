# IRIS Element Map — T1b: Occurrence Dashboard
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

---

### Screen Purpose
Hub between T1 and T2–T5. Reached after tapping a service card in T1.
Shows all tracked sections for the selected occurrence with completion status.
User taps any section to enter or correct data. Returns here after each section.
Makes the T1 completion indicator (E3d) meaningful.

Two equal use cases: Sunday morning (all empty, fill in order) and
Tuesday delayed entry (some complete, tap the missing section).

---

### Data Sources

| Data | Source |
|---|---|
| Occurrence identity | SundaySessionContext (never re-fetched) |
| Completion status | P12 EXISTS flags per section |
| Church tracking flags | churches.tracks_volunteers/responses/giving |
| Section summaries | P13 — single round-trip query |

---

### Screen States
1. All incomplete — new occurrence, entry prompts prominent
2. Partially complete — done sections show data, incomplete sections still prominent
3. All complete — celebratory state, correction note shown
4. Single-section church — only attendance tracked, clean not sparse
5. Cancelled occurrence — read-only, entry disabled

---

### Elements

**E1 — Persistent Occurrence Header** [fixed top — NEW COMPONENT]
- Service name · Date · Location (multi-campus only)
- Source: SundaySessionContext
- Back chevron → T1
- Reused unchanged on T2, T3, T4, T5

**E2 — All-Complete Banner** [State 3 only]
- "All done for [Service Name]" · Green
- Dismissible → T1
- Does not block sections — correction still possible

**E3 — Section Row** [repeating — one per tracked section]
- E3a — Icon (people / hands / heart / currency per section type)
- E3b — Section name (Attendance / Volunteers / Responses / Giving)
- E3c — Section summary
  - Complete: "Main 240 · Kids 48 · Youth 31" / "24 total · 3 teams" / "7 decisions · 2 rededications" / "$4,200"
  - Empty: "Tap to enter [section name]"
- E3d — Completion indicator (empty ⬜ / in-progress 🔵 / complete ✅)
- E3e — Full-row tap → section entry screen

- Section order: Attendance · Volunteers · Responses · Giving
- Tracking rule: row hidden if tracks_[section] = false
- Attendance: always shown

**E4 — Section Dividers** [between rows]

**E5 — Correction Note** [State 3 only]
- "Need to correct something? Tap any section."
- Below all complete sections

**E6 — Back to Services Link** [bottom]
- "← Back to services" → T1
- Also available via E1 back chevron

**E7 — Cancelled Occurrence Banner** [if status = cancelled]
- "This service was cancelled"
- Sections visible but entry disabled — read-only

---

### Element Relationships

```
T1b — Occurrence Dashboard
│
├── E1 Occurrence Header [fixed]
│     └── Back → T1
│
├── E7 Cancelled Banner [if cancelled]
│
├── E2 All-Complete Banner [State 3]
│     └── Dismiss → T1
│
├── E3 Attendance [always]
│     └── E3e Tap → T2
│
├── E3 Volunteers [tracks_volunteers = true]
│     └── E3e Tap → T3
│
├── E3 Responses [tracks_responses = true]
│     └── E3e Tap → T4
│
├── E3 Giving [tracks_giving = true]
│     └── E3e Tap → T5
│
├── E4 Dividers
├── E5 Correction Note [State 3]
└── E6 Back to Services → T1
```

---

### P13 — Occurrence Section Summaries (new query)

```sql
SELECT
  ae.main_attendance,
  ae.kids_attendance,
  ae.youth_attendance,
  (SELECT SUM(ve.volunteer_count)
   FROM volunteer_entries ve
   JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
   WHERE ve.service_occurrence_id = $1
     AND ve.is_not_applicable = false) AS total_volunteers,
  (SELECT COUNT(DISTINCT vc.audience_group_code)
   FROM volunteer_entries ve
   JOIN volunteer_categories vc ON ve.volunteer_category_id = vc.id
   WHERE ve.service_occurrence_id = $1
     AND ve.is_not_applicable = false
     AND ve.volunteer_count > 0) AS active_groups,
  (SELECT SUM(re.response_count)
   FROM response_entries re
   WHERE re.service_occurrence_id = $1
     AND re.is_not_applicable = false) AS total_responses,
  (SELECT SUM(ge.giving_amount)
   FROM giving_entries ge
   WHERE ge.service_occurrence_id = $1) AS total_giving
FROM service_occurrences so
LEFT JOIN attendance_entries ae ON ae.service_occurrence_id = so.id
WHERE so.id = $1;
```

Single round trip. Returns all four section summaries.

---

### Completion Logic (D-025)

```javascript
const trackedSections = sections.filter(s => s.tracked)
const allComplete = trackedSections.every(s => s.entered)
const anyStarted  = trackedSections.some(s => s.entered)
// State 1: !anyStarted
// State 2: anyStarted && !allComplete
// State 3: allComplete
```

Tracking flags sourced from church record.
Attendance always tracked — no flag.

---

### Navigation

Into T1b: from T1 E3e tap (session anchor written)
Fallback: occurrenceId in URL param `/occurrence/[id]`

Out of T1b:
- Attendance row → T2
- Volunteers row → T3 (if tracked)
- Responses row → T4 (if tracked)
- Giving row → T5 (if tracked)
- E1 back / E6 back link → T1

Return from T2–T5: back to T1b
T1b refreshes completion on return (lightweight P12 re-check, single occurrence)

---

### Role Rules

| Element | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| All elements | ✅ | ✅ | ✅ | ❌ (routing gate) |
| E3e entry tap (cancelled) | read-only | read-only | read-only | ❌ |

---

### FAULT Mitigations

| # | Resolution |
|---|---|
| F17 | This screen — fully mapped |
| F7 | Summaries use aggregate counts only — no category names, no deactivated label risk |
| F11 | T1b shows current DB state on load — last-write-wins known limitation, documented |

---

### NOVA Open Items

| # | Requirement |
|---|---|
| N7 | P13 as single RPC — one round trip for all section summaries |
| N8 | URL param fallback: `/occurrence/[id]` for session restoration |
| N9 | On return from T2–T5: re-check P12 for single occurrence, update without page reload |
| N10 | Cancelled state: section rows render read-only, E3e tap disabled |

---

### New Components

| Component | Element | Reuses in |
|---|---|---|
| Persistent Occurrence Header | E1 | T2, T3, T4, T5 (unchanged) |
| Section Row | E3 | T1b only in this form |
| Cancelled Banner | E7 | Any screen showing cancelled occurrence data |

---

### Handoff to T2

E1 Persistent Occurrence Header is an inherited component — T2 does not redefine it.
Back from T2 → T1b (not T1).
T1b refreshes completion on return.
T2 entry screen begins below E1.
