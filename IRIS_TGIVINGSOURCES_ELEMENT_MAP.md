# IRIS Element Map — T-giving-sources: Giving Sources
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Manage the giving sources the church tracks each week.
Seeded defaults: Plate · Online.
Church can rename (pencil icon), add custom sources, deactivate.
Settings → What You Track → Giving Sources

### Data Sources
| Data | Source |
|---|---|
| Sources | giving_sources WHERE church_id = ? ORDER BY display_order |

### Screen States
1. Seeded defaults shown — Plate and Online, both active
2. Custom sources added — full list in display_order

### Elements

**E1** — Header: "Giving Sources"

**E2** — Instruction
"Add every way your church receives giving — Plate, Online, or anything
else you collect. You'll enter a total for each source every week.
Keeping sources consistent means your year-over-year giving reports stay accurate."

**E3** — Source Row [repeating]
- Source name (left) — pencil icon (✏️) for inline edit
- Drag handle — reorder by display_order
- Active/inactive toggle
- Seeded defaults: cannot delete, can rename, can deactivate
- Custom sources: can delete (confirmation if giving_entries reference this source)

**E4** — Add Source Button
- "+ Add a source — for each way your church collects giving."
- Inline input row appended below

**E5** — Delete Confirmation [custom sources only]
- "Remove [source name]? All recorded giving for this source will also be removed."
- Destructive — shown in red
- If giving_entries exist: "Deactivate instead — your recorded giving will be kept."

**E6** — Seeded Default Note [on Plate and Online rows]
- Small "Default" label
- Communicates these are pre-loaded

### Key Rules
- Seeded defaults: is_custom = false, can rename, cannot delete, can deactivate
- Custom sources: is_custom = true, can delete (with confirmation)
- Cannot delete source if giving_entries reference it — deactivate instead
- display_order written on drag end
- Auto-save on blur for name edits

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N56 | Auto-save on blur for source name — PATCH giving_sources.source_name |
| N57 | Delete blocked if giving_entries.giving_source_id references this source |
| N58 | display_order written on drag end |
| N59 | Seeded rows: hide delete option (is_custom = false), allow rename |

### Handoff Note
T5 reads active giving_sources for this church.
One currency field per source in T5 flat list.
Deactivated sources disappear from T5 immediately.
Historical giving_entries retain giving_source_id — data preserved.