# IRIS Element Map — T5: Giving Entry
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Log weekly offering total. History-first — shows prior entries before the entry field.
Multiple rows per occurrence allowed (Rule 5 — always SUM giving_entries).
Physical context: desk or phone, delayed entry, not Sunday morning rush.
Requires tracks_giving = true.

### Inherited
E1 Persistent Occurrence Header — from T1b.

### Data Sources
| Data | Source |
|---|---|
| Existing entries | giving_entries WHERE service_occurrence_id = ? |
| Running total | SUM(giving_amount) — application layer |
| Entered by | user_profiles.display_name via auth.uid() |

### Gate Check
tracks_giving = false → screen inaccessible, T1b hides row, URL redirect to T1b.

### Screen States
1. No prior entries — empty history hidden, entry field prominent
2. Prior entries exist — history shown first, total displayed, entry field below
3. Submitted — confirmation, auto-return T1b after 1.5s
4. Not tracked — inaccessible (gate check)

### Elements

**E1** — Persistent Occurrence Header [inherited]

**E2** — Giving History [if prior entries exist]
- One row per giving_entries record: amount · source · timestamp · entered by
- "Total so far: $[SUM]" below list
- Read-only — no edit or delete in V1
- Hidden entirely when no prior entries (not shown as empty list)

**E3** — Entry Field
- Label: "Add giving amount — log each source separately if needed."
- Amount: currency field, numeric keyboard, $ prefix, decimal allowed
- Source note: optional text field below ("e.g. plate, online, special")
- F10 sanitization: strip non-numeric, no negatives, no leading zeros, 2dp on blur

**E4** — Running Total [if prior entries exist]
- "Total after this entry: $[existing SUM + current field value]"
- Real-time, hides when no prior entries

**E5** — Submit Button
- "Save — your giving total will update in the dashboard."
- INSERT new row — never UPSERT, never overwrite
- Failure: "Couldn't save. Tap to try again — your amount is still here."

**E6** — Confirmation State [State 3]
- "Saved. Total giving this service: $[new running total]"
- Auto-dismisses to T1b after 1.5s or tap

**E7** — Duplicate Warning [F9]
- Triggered: new amount exactly matches existing entry
- Inline above E5 — not a blocker
- "Heads up — you already logged $[amount] for this service. Adding again?"
- "Yes, add it" · "Cancel"

**E8** — Unsaved Changes Prompt [D-028]
- Triggered: back tap with unsaved value in E3
- "Save your giving entry first? It won't be included in your total if you leave now."
- "Save" · "Discard" · "Keep editing"

### Element Relationships

```
T5 — Giving Entry
│
├── E1 Occurrence Header [inherited]
├── E2 Giving History [prior entries exist]
│     └── Read-only rows + running total
├── E3 Entry Field (amount + optional source)
├── E4 Running Total [prior entries exist]
├── E7 Duplicate Warning [amount matches existing]
├── E5 Submit → INSERT → E6 → T1b
└── E8 Unsaved Prompt [D-028]
```

### Key Rules
- Rule 5: Always SUM — INSERT only, never overwrite
- No edit/delete of prior entries in V1
- Completion = giving_entries row EXISTS (binary — same as D-030 pattern)
- Correcting wrong entry: add a new entry with note (e.g. "correction -$200")

### Navigation
In: T1b Giving row
Out: E5 → E6 → T1b (1.5s auto or tap)
Back: → T1b (D-028 prompt if E3 has unsaved value)

### Role Rules
Owner ✅ · Admin ✅ · Editor ✅ · Viewer ❌

### FAULT Closed

| # | Resolution |
|---|---|
| F3 | History-first layout + "Add giving amount" label — additive model clear |
| F9 | E7 duplicate warning — inline, non-blocking |
| F10 | E3 input sanitization — strip, format, prevent negatives |

### NOVA Items

| # | Requirement |
|---|---|
| N20 | INSERT only on giving_entries — no UPSERT |
| N21 | E3 sanitization: strip non-numeric on change, 2dp on blur, no negatives, no $0.00 submit |
| N22 | E7 check: compare new amount against all existing rows before submit |
| N23 | E4 running total: load existing SUM on mount, add live field value in real time |

### New Components
- Currency Input Field (E3) — reuse in dashboard giving display
- History List Row (E2) — pattern for append-only data display

### Handoff Note
F3, F9, F10 all closed. Sunday loop entry screens complete.
T1 → T1b → T2 → T3 → T4 → T5 → T1b — all mapped.

---

## Revision 1.1 — D-036, D-037, D-038 Applied

**D-036:** Giving sources are persistent church-defined categories. giving_sources table. Seeded: Plate + Online. Church can rename, add, deactivate.

**D-037:** One amount per source per service — one editable row. UPSERT pattern. Not append-only.

**D-038:** Correction entries removed. Wrong amount = edit the row.

### T5 Entry Model — Revised

No "add entry" button. No history list of multiple rows. No freeform source note.

Flat list of active giving sources. One currency field per source. UPSERT on save.

```
Plate    [$3,400  ]
Online   [$1,200  ]
[+ Add source → T-giving-sources in Settings]

Total: $4,600
Save — your giving total will update in the dashboard.
```

### Element Map Changes

**E2 (Giving History) — removed.**
Replaced by: flat list of giving sources with pre-filled amounts (if prior entry exists for this occurrence).

**E3 (Entry Field) — revised.**
Now: one currency field per active giving_source. Pre-filled if UPSERT row exists.
Label per row: source_name (e.g. "Plate", "Online").
Add source CTA below list → Settings (T-giving-sources).

**E5 (Submit) — revised.**
UPSERT all source rows in one transaction (same pattern as T3/T4 section submit).
"Save — your giving total will update in the dashboard."

**E7 (Duplicate Warning) — removed.**
No longer needed. One row per source per service — no duplicate risk.

**Rule 5 still holds:**
Dashboard SUMs all giving_entries rows for the occurrence.
Now one row per source, not per entry event. SUM produces the same total.

### NOVA Items Updated

| # | Requirement |
|---|---|
| N20 | UPSERT giving_entries per source — not INSERT only (revised from v1.0) |
| N21 | E3 sanitization: strip non-numeric, 2dp on blur, no negatives — per field |
| N22 | Removed — no duplicate risk in new model |
| N23 | Total: SUM of all source fields in real time (application layer) |
| N24 | Load existing giving_entries on mount — pre-fill per giving_source_id |

### New Settings Screen
T-giving-sources: manage giving sources (rename, add, deactivate).
Cannot delete source if giving_entries data exists.
Mirrors T7 (volunteer categories) and T8 (stats) pattern.
