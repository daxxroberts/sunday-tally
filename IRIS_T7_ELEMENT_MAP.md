# IRIS Element Map — T7: Volunteer Roles
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Manage volunteer roles the church tracks each week.
Add, rename (pencil icon), reorder, deactivate.
No seeded defaults — blank slate, church creates their own.
Settings → What You Track → Volunteer Roles

### Why No Seeded Defaults
Volunteer roles are highly church-specific. Generic defaults
create clutter. A clear prompt and blank slate works better.

### Data Sources
| Data | Source |
|---|---|
| Roles | volunteer_categories WHERE church_id = ? ORDER BY sort_order |

### Screen States
1. Empty — no roles yet, prominent add prompt
2. Roles exist — list with reorder, pencil edit, deactivate

### Elements

**E1** — Header: "Volunteer Roles"

**E2** — Instruction
"Add the roles your team fills each Sunday — like Sound Tech, Greeters, or Parking. You'll enter a count for each role every week."

**E3** — Role Row [repeating]
- Role name (left) — pencil icon (✏️) for inline edit
- Drag handle (right) — reorder by sort_order
- Active/inactive toggle (far right)
- Deactivation: sets is_active = false. Historical entries preserved.
- No deletion if volunteer_entries reference this category.

**E4** — Add Role Button
- "+ Add a role — for each team you want to count each week."
- Inline input row appended below existing roles
- Saves on blur or return

**E5** — Empty State
- "No roles yet."
- "Add the teams you want to track — Sound Tech, Greeters, whatever your church counts."

**E6** — Save / Auto-save
- Changes save on blur (name edit) or on drag end (reorder)
- No explicit Save button needed — auto-save per action
- Brief "Saved." inline confirmation per action

### Key Rules
- is_active = false to deactivate (soft delete — D-005)
- category_code immutable after creation (D-005)
- sort_order written on drag end
- Deactivated roles hidden in T3 entry screen, visible in historical dashboard data

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N49 | Auto-save on blur for name edit — PATCH volunteer_categories.category_name |
| N50 | sort_order written on drag end — PATCH display_order |
| N51 | Delete blocked if volunteer_entries reference this category — show deactivate instead |

### Handoff Note
T3 entry screen reads active volunteer_categories for this church.
Deactivated roles disappear from T3 immediately after deactivation.
Historical volunteer_entries retain the category_id — data preserved.