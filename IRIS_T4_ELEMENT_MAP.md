# IRIS Element Map — T4: Response Entry (Salvations)
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none — D-050 closes F-new-7 CLOSED (D-050) (last write wins, no locking)

### Screen Purpose
Enter salvation response counts per type per audience group.
Structurally identical to T3. Section-submit pattern.
Post-submit summary required (D-020).
Requires tracks_responses = true.

### Inherited
E1 Persistent Occurrence Header — from T1b.
Section Container pattern — same component as T3, different data and typography.

### Data Sources
| Data | Source |
|---|---|
| Active response types | response_categories WHERE church_id = ? AND is_active = true |
| Existing entries | response_entries WHERE service_occurrence_id = ? |

### Gate Check
tracks_responses = false → screen inaccessible, T1b hides row, URL redirect to T1b.

### Screen States
Identical to T3 states (Empty / Pre-filled / Section complete / No categories).
State 5: Post-submit summary — unique to T4.

### Elements

**E1** — Persistent Occurrence Header [inherited]

**E2** — Section Container [repeating — MAIN, KIDS, YOUTH]
Identical structure to T3 E2 with three differences:

  **E2a** — Section Header label: "Main Responses" / "Kids Responses" / "Youth Responses"

  **E2b** — Category Row
  - Response type name — font weight one step heavier than T3 category names
    (pastoral weight — "First-Time Decision" carries meaning)
  - N/A toggle label: "Didn't apply this week" (not a plain toggle)
  - All other behaviour identical to T3 E2b

  **E2c** — Section Submit: "Save [MAIN/KIDS/YOUTH] Responses"

  **E2d** — Section Summary: "[X] total · [type breakdown]"

**E3** — Empty State: No Response Types
- Unlikely (seeded on church creation) but possible if all deactivated
- Same pattern as T3 E3

**E4** — All Sections Submitted → triggers E6 (not direct return to T1b)

**E5** — Unsaved Changes Prompt [D-028] — identical to T3

**E6** — Post-Submit Summary Screen [D-020 — REQUIRED]
- Full screen — not modal, not toast
- Green background
- Header: "This week's responses"
- Breakdown by response_type_code across all audience groups:
  "First-Time Decisions: [total across MAIN + KIDS + YOUTH]"
  "Rededications: [total]"
  "Baptisms: [total — if any > 0]"
- Combined: "Total: [X] responses"
- Auto-dismisses to T1b after 3 seconds or tap
- This moment is intentional — pastoral acknowledgment

### Key Rules
- Same zero / N/A / not-entered logic as T3
- Post-submit summary is mandatory — cannot skip
- Aggregation in E6 is by response_type_code across all groups
  (not by audience group — pastor sees total decisions, not Main vs Kids breakdown)
- Soft-delete: deactivated types not shown in entry

### Navigation
In: from T1b Responses row
Out: all sections submitted → E6 post-submit summary → T1b (auto or tap)
     E1 back → T1b (prompt if dirty — D-028)

### Role Rules
Owner ✅ · Admin ✅ · Editor ✅ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N17 | E6 aggregates by response_type_code across all groups — single totals |
| N18 | Section submit identical transaction model to T3 |
| N19 | N/A toggle label: "Didn't apply this week" — not generic toggle |

### Handoff to T5
T5 (Giving Entry) is a different physical context (desk, delayed).
E1 inherited. Different interaction model — history-first layout.
Back from T5 → T1b.
