# IRIS Element Map — T-settings: Settings Hub
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none

### Screen Purpose
Root of the Settings tab. Three groups — not a flat list.
VERA principle: labelled by what they govern, not database names.
Every settings screen reachable from here.

### Elements

**E1** — Header: "Settings"

**E2** — Group: Your Church
- "Locations — where your services meet" → T-loc
- "Service Templates — the services that appear each Sunday" → T6

**E3** — Group: Your Team
- "Members — who has access and what they can do" → member list
- "Invite someone — add a new team member" → T9

**E4** — Group: What You Track
- "Tracking — turn audiences and modules on or off" → T6b
- "Volunteer Roles — the roles you track each week" → T7
- "Stats — decisions, baptisms, and anything else you count" → T8
- "Giving Sources — Plate, Online, and any other sources you track" → T-giving-sources

### Copy Rule
Every item: name — one-line reason why (humanizer instructional rule).

### Element Relationships

```
T-settings
│
├── E2 Your Church
│     ├── Locations → T-loc
│     └── Service Templates → T6
│
├── E3 Your Team
│     ├── Members → member list
│     └── Invite someone → T9
│
└── E4 What You Track
      ├── Tracking → T6b
      ├── Volunteer Roles → T7
      ├── Stats → T8
      └── Giving Sources → T-giving-sources
```

### Role Rules
Owner ✅ all · Admin ✅ all (limited in Members) · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N32 | Settings tab root — no back stack from T-settings |
| N33 | Editor/Viewer redirected at routing layer before T-settings loads |
