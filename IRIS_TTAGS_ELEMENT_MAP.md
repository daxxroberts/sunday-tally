# IRIS Element Map — T-tags: Service Tag Management
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Create and manage the church's tag library.
Assign tags to services. Set date ranges. Remove with choice.
Location: Settings → What You Track → Tags

### Data Sources
| Data | Source |
|---|---|
| Tags | service_tags WHERE church_id = ? |
| Assignments | service_template_tags JOIN service_templates |
| Stamped count | COUNT service_occurrence_tags per tag |

### Elements

**E1** — Header: "Service Tags"

**E2** — Instruction Block [always visible — not collapsible]
```
Tags let you group your services for better reporting — even
when names or times change.

Think of a tag as a label you apply to services that belong
together. Your 9am service might become 9:30am next fall, or
you might rename it. Without a tag, those look like different
services in your reports. With a tag, they're always compared
together.

When would you create a tag?
• Morning — group all your morning services across campuses
  and across years
• Evening — same idea for evening services
• Building Campaign — track giving and attendance just for
  that season
• Summer Series — compare this summer to last summer
  automatically
• Spanish Service — report on your Spanish-language
  congregation separately

How it works:
Assign a tag to a service and it stamps all past and future
records. If you set a date range, only records from that
window are included — useful for campaigns or seasonal series.

You don't have to use tags to use the app. But if you ever
want to compare this year's morning attendance to last year's,
tags are what make that work.
```

**E3** — Tag List [one row per tag]
- Tag name
- Date range: "All time" or "Apr 1 – Jun 30, 2026"
- Services count: "3 services"
- Active/inactive toggle
- Tap row → E4 drawer

**E4** — Tag Detail Drawer [on row tap or E7 create]
- Name field: "What do you call this tag?"
- Date range toggle: "Limit to a date range — for campaigns or seasonal series."
  - Off: all time
  - On: start date · end date pickers
- Services assigned: list with remove option (→ E6 prompt)
- Add to a service: multi-select picker of active services (→ E5 prompt)
- Remove tag: destructive, confirmation required

**E5** — Apply to Service Prompt [on assignment]
- "Applying '[tag]' to [Service Name]"
- "This will tag [X] past records."
- "Apply" → apply_tag_to_occurrences()
- After: "Done. Tagged [X] past services."

**E6** — Remove from Service Prompt [on removal]
- "Remove '[tag]' from [Service Name]?"
- "Remove from all records — past reports will no longer include this tag" [red]
- "Keep past records tagged — only removes it going forward"

**E7** — Create New Tag
- "+ Create a tag — Morning, Evening, Building Campaign, whatever fits your church."
- Opens E4 with empty fields

**E8** — Seeded Tag Note [first load, no custom tags yet]
- "We've added Morning, Evening, and Midweek to get you started.
   Rename them or add your own."

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N41 | Apply: INSERT service_template_tags → apply_tag_to_occurrences() → return count |
| N42 | E5 count: show "Tagged [X] past services" after apply |
| N43 | Remove all: DELETE template assignment + DELETE occurrence stamps for this template |
| N44 | Keep past: DELETE template assignment only |
| N45 | Future stamping: on occurrence creation INSERT occurrence tags for all assigned tags within date range |
| N46 | Name edit: UPDATE tag_name — tag_code immutable after creation |

### Humanizer Note
E2 instruction block is non-negotiable. Tags are non-obvious.
The instruction must be present while the user configures —
not behind a help link. Passes humanizer instructional copy rule:
every instruction has a reason. Examples are concrete and specific.
