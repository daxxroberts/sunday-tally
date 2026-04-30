# IRIS Element Map — T6: Service Template Setup
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none — v1.1 revision applied

### Screen Purpose
Define services that appear each week. One template per service per location.
display_name is the rollup key for P3 — drives cross-location aggregation.
Step 3 of onboarding. Requires T-loc complete. T-sched follows.
F4 closure: real-time cross-campus name preview.

### Physical Context
Context C — desktop, deliberate, first-time setup.

### Data Sources
| Data | Source |
|---|---|
| Existing templates | service_templates WHERE church_id = ? AND is_active = true |
| Locations | church_locations WHERE church_id = ? AND is_active = true |

### Screen States
1. Empty — no templates, first time, prominent form
2. Templates exist — list by location, add more
3. Edit mode — tap template for inline edit
4. Multi-campus preview — name consistency warning when names differ

### Elements

**E1** — Screen Header
- Onboarding: "Step 3 of 5 — Your services"
- Settings: "Service Templates"
- Back → T-loc (onboarding) · T-settings (Settings)

**E2** — Template Form [repeating]
- **E2a** — Display Name
  - "What do you call this service? — this name appears on every Sunday screen."
  - Placeholder: "9am Service" · "Sunday Evening"
  - Inline validation: not blank, not duplicate within location
- **E2b** — Location picker [multi-campus only]
  - Required selection from church_locations
  - Single-campus: auto-assigned, hidden
- **E2c** — Sort order (up/down or drag)
- **E2d** — Delete
  - Blocked if service_occurrences reference this template
  - Shows deactivate instead of delete if occurrences exist
  - Confirmation: "Remove [name]? This service won't appear on future Sundays."

**E3** — Cross-Campus Name Preview [multi-campus, live — F4]
- Updates as E2a changes (debounced 300ms)
- Shows all templates at all locations with same/similar name
- Match state: "9am Service appears at: ✅ Main Campus ✅ North Campus"
- Warning state: "⚠️ Similar names found — these won't roll up together"
- Warning triggers on near-match: case-insensitive, strip punctuation/spaces

**E4** — Add Another Service
- "+ Add another service — for each service time you run each week."

**E5** — Continue [onboarding] → T-sched
- "Continue — set when these services run next."
- Active when ≥1 valid template

**E5b** — Save [Settings] → T-settings

### Critical Rule
display_name is the P3 rollup key. Two templates at different locations
with the same display_name = same service in dashboard aggregation.
E3 exists to prevent naming inconsistency before it becomes a data problem.

### Validation
- Name: not blank, not duplicate within same location
- Location: required (multi) or auto-assigned (single)
- Cannot delete template with existing service_occurrences
- Deactivation preferred over deletion when data exists

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N34 | E3 live query: fetch templates by church with same/similar display_name, debounced 300ms |
| N35 | Similarity check: case-insensitive, strip punctuation and spaces — "9am" vs "9:00 AM" = warning |
| N36 | E2d: check service_occurrences for template_id before showing delete. Show deactivate if data exists. |
| N37 | Single-campus: auto-assign location_id, hide E2b |

### Handoff to T-sched
T-sched reads service_templates for this church — requires at least one.
One T-sched setup per template (schedule per service).

---

## Revision 1.1 — Pressure Test Gaps 1, 2, 8 Applied (2026-04-09)

### E2e — Primary Tag Picker [REQUIRED — new element]
- Label: "Which tag best describes this service? — this groups it in your dashboard."
- Single select from church's service_tags WHERE effective_start_date IS NULL AND effective_end_date IS NULL
- Required before Continue is active (D-042, D-046)
- Seeded options shown first: Morning · Evening · Midweek
- Custom undated tags below
- "Create a new tag" shortcut → opens T-tags inline or navigates

### E2f — Subtag Multi-Select [OPTIONAL — new element]
- Label: "Add subtags (optional) — for campaigns, series, or special groupings."
- Multi-select from all church service_tags EXCEPT the selected primary tag
- Date-ranged tags included here (campaigns, series)
- Writes to service_template_tags on Save
- Calls apply_tag_to_occurrences() for each subtag assigned

### Continue Button Update
Active when: E2a (name) + E2b (location, if multi-campus) + E2e (primary tag) all filled.
Previously: active with name + location only.

### Primary Tag Picker Filter (D-046)
WHERE effective_start_date IS NULL AND effective_end_date IS NULL
Date-ranged tags never appear in E2e.
They appear only in E2f (subtag picker).

### Deactivation Warning Update (F-new-11 Mitigation 3)
"Deactivating [Service Name] removes it from future Sundays.
 It has [X] weeks of [primary tag name] data — that history stays in your dashboard."
