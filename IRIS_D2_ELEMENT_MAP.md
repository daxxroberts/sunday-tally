## Status: Complete
## Version: 1.0
## Pending revisions: none
## Last updated: 2026-04-10

# IRIS Element Map — D2: Viewer Summary
## Version 1.0 | 2026-04-10
## Status: Complete — Ready for build

### Screen Purpose
Simplified dashboard for Viewers only.
Same three-column comparison as D1.
Attendance + Stats + Giving — no Volunteers (D-026).
No drill-down. Read-only. No settings access.
Decisions: D-026 · D-033 · D-045 · D-047 · D-048

### Data Sources
Same as D1 — P14a/b/c. No separate query set needed.

### Elements

**E1** — Header: "Dashboard"

**E2** — Tag Filter [same as D1 — Viewers can filter]
- Same dropdown, same default
- Filter only — no configuration access

**E3** — Primary Tag Rows [same structure as D1]
- No tap drill-down — audience expansion not available to Viewers

**E4** — Metric Sub-rows
| Metric | Shown when |
|---|---|
| Attendance | Always |
| Stats | tracks_responses = true |
| Giving | tracks_giving = true |
| Volunteers | ❌ Never — D2 never shows Volunteers (D-026) |

**E5** — Comparison Columns [identical to D1]

**E6** — Empty State [identical to D1]

**E7** — Re-auth Note [bottom of screen, low prominence]
- "Need a new link? Enter your email on the login screen."
- Implements D-048 — Viewer self-serves without admin action
- Shown only to Viewers

### Role Rules
Viewer ✅ only
Owner/Admin → D1 · Editor → no dashboard

### NOVA Items
| # | Requirement |
|---|---|
| N75 | D2 uses same P14a/b/c queries as D1 — no separate query set |
| N76 | Volunteers row never rendered — absent entirely, not conditional on flag |
| N77 | No drill-down controls — E7 audience expansion removed for Viewer |
| N78 | E7 re-auth note: role = viewer only, bottom of screen, low prominence |
| N79 | Gate 3: /dashboard/viewer → Viewer only. Owner/Admin → redirect to /dashboard |
