# IRIS Element Map — T-loc: Location Setup
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Define physical service locations. Minimum one required — Gate 1 dependency.
Step 2 of onboarding. Also accessible via Settings at any time.
VERA principle: one location, one name, Continue in under 60 seconds.

### Physical Context
Context C — desktop/phone, deliberate, first-time setup. Not rushed.

### Data Sources
| Data | Source |
|---|---|
| Existing locations | church_locations WHERE church_id = ? |

### Screen States
1. Empty — first-time, prominent single input, single campus note shown
2. One location — shows it, offer to add more or continue
3. Multiple locations — list with drag reorder
4. Edit mode — tap existing location for inline edit

### Elements

**E1** — Screen Header
- Onboarding: "Step 2 of 5 — Your locations"
- Settings: "Locations"
- Back: onboarding → Step 1 · Settings → T-settings

**E5** — Single Campus Note [first load, onboarding only]
- "Most churches meet in one place — just add that one and you're set."

**E2** — Location Row [repeating]
- **E2a** — Name field
  - Prompt: "What do your team members call this location?"
  - Placeholder: "Main Campus", "Downtown", "North Campus"
  - Inline validation: not blank, unique within church
- **E2b** — Drag handle [multiple locations only]
  - Reorder by display_order (affects T1 service card grouping)
- **E2c** — Delete icon
  - Disabled: only one location exists
  - Disabled: service_templates reference this location
  - Confirmation: "Remove [name]? Services at this location will also be removed."

**E3** — Add Location Button
- "+ Add another location — if your church meets in more than one place."

**E4** — Continue Button [onboarding]
- "Continue — set up your service times next."
- Active: ≥1 valid location name
- Disabled: "Add at least one location to continue."
- → T6 Template Setup

**E4b** — Save Button [Settings]
- "Save changes" → T-settings

### Validation
- ≥1 location required at all times
- Names unique within church
- Cannot delete location referenced by active service_templates
- display_order written on Save, not on each drag

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N25 | Name uniqueness check within church — inline on blur |
| N26 | Delete blocked if service_templates.location_id references this — check before showing delete |
| N27 | display_order written on Save, not on drag |
| N28 | Gate 1 re-evaluated after Save — Sunday loop unlocks on first location added |

### Handoff to T6
T6 requires locations to exist — location picker reads church_locations.
