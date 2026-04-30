# IRIS Element Map — T8: Stats
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Manage the stats the church tracks each week — decisions, baptisms,
and any custom metrics they want to count.
Seeded defaults: First-Time Decision · Rededication · Baptism (audience-scoped).
Church can add custom stats (audience-scoped or service-level).
Settings → What You Track → Stats

### Data Sources
| Data | Source |
|---|---|
| Stats | response_categories WHERE church_id = ? ORDER BY display_order |

### Screen States
1. Seeded defaults shown — three rows, all active
2. Custom stats added — seeded + custom in display_order
3. Stat detail open — scope and name editing

### Elements

**E1** — Header: "Stats"

**E2** — Instruction
"Stats are the things you count beyond attendance — decisions, baptisms,
and anything else that matters to your church. We've added the most common
ones to start. Add your own or rename these to fit how your church talks."

**E3** — Stat Row [repeating]
- Stat name (left) — pencil icon (✏️) for inline edit
- Scope badge: "Per audience" or "Per service" (read-only after data exists)
- Active/inactive toggle
- Seeded defaults: cannot delete, can deactivate
- Custom stats: can delete (confirmation if stat_value entries exist)

**E4** — Add Stat Button
- "+ Add a stat — decisions, parking lot count, online viewers, anything you track."
- Opens E5 creation form

**E5** — Stat Creation Form [on E4 tap]
- Name field: "What do you call this stat?"
- Scope picker:
  - "Per audience — enter separately for Main, Kids, and Youth"
  - "Per service — one number for the whole service"
  - Helper: "Use per audience for decisions or baptisms.
             Use per service for parking lot count or online viewers."
- Save → INSERT response_categories with chosen stat_scope

**E6** — Seeded Default Badge
- Small "Default" label on First-Time Decision, Rededication, Baptism rows
- Communicates these are pre-loaded, not created by the church

**E7** — Delete Confirmation [custom stats only]
- "Remove [stat name]? This will also remove all recorded values for this stat."
- Destructive — shown in red
- Blocked with explanation if stat_value entries exist and church wants to keep history:
  "Deactivate instead — your recorded data will be kept."

### Key Rules
- Seeded defaults: is_custom = false, cannot delete, can deactivate
- Custom stats: is_custom = true, can delete (with confirmation)
- stat_scope immutable after first stat_value entry exists
- display_order: seeded first (1/2/3), custom appended

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N52 | E5 scope picker: INSERT response_categories with stat_scope = 'audience' or 'service' |
| N53 | stat_scope immutable check: if response_entries exist for this category, disable scope edit |
| N54 | Delete blocked if response_entries.stat_value entries exist — show deactivate option instead |
| N55 | Seeded rows: hide delete option entirely (is_custom = false) |

### Handoff Note
T4 reads active response_categories for this church.
Audience-scoped stats appear inside MAIN/KIDS/YOUTH sections in T4.
Service-level stats appear in the Service Stats section below.
F-new-7: service-level stat entered by one Editor pre-fills read-only for others.