# IRIS Element Map — T6b: Tracking Configuration
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Five toggles controlling what this church tracks. All default true.
Lives in Settings (D-027) — not a required onboarding step.
Every toggle: label + reason (humanizer instructional copy rule).

### Data Sources
| Data | Source |
|---|---|
| Current flags | churches WHERE id = ? (five tracking columns) |
| Existing data check | COUNT of entries per type (for E5 impact note) |

### Elements

**E1** — Header: "Tracking — turn audiences and modules on or off"

**E2** — Audience Group Section: "Which audiences do you track?"
| Toggle | Label | Reason |
|---|---|---|
| tracks_kids_attendance | "Kids" | "Track your kids ministry attendance separately from main." |
| tracks_youth_attendance | "Youth" | "Track your youth ministry attendance separately from main." |

Main attendance: always tracked, no toggle shown.

**E3** — Modules Section: "What do you track each week?"
| Toggle | Label | Reason |
|---|---|---|
| tracks_volunteers | "Volunteers" | "Track who's serving each week." |
| tracks_responses | "Stats" | "Log decisions, baptisms, and anything else you count." |
| tracks_giving | "Giving" | "Record your weekly offering totals." |

**E4** — Save Button
- "Save — your Sunday screens will update to match."
- All five flags in one transaction
- Inline "Saved." confirmation — no full-screen state

**E5** — Impact Note [when turning something off with existing data]
- Inline below the toggle being disabled
- "Turning this off hides the section from entry screens. Your existing data is kept."

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N38 | All five flags in one transaction on Save |
| N39 | E5: only show if existing entries exist for this flag's data type |
| N40 | After Save: T1b section rows update without page reload |
