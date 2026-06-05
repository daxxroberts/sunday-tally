# Demo Church — Baseline Import Snapshot

**Job ID:** `6c8dbd18-3ca9-4ce1-9b01-a008a884f972`
**Snapshot taken:** 2026-05-27, after walkthrough validation
**Source data:** Google Sheets — Sunday Services / Switch (Youth) / Giving

This is the **canonical reference for verification**. If a future import or weekly-entry
screen shows a structure different from this, the regression is real.

---

## Service Structure

```
EXPERIENCE (Sundays — day_of_week = 0)
├─ Service 1 — service_code "1" (9 AM)
└─ Service 2 — service_code "2" (11 AM)
   └─ LifeKids runs in parallel inside both Experience occurrences
       (child tag, not its own service)

SWITCH (Wednesdays — day_of_week = 3)
└─ Switch — service_code "SWITCH_WED"
```

Service templates share `primary_tag: EXPERIENCE` across both Sunday services
(time differs via `start_time`, not via tag) per Rule 5a.

LifeKids has `tag_relationship { child: LIFEKIDS, parent: EXPERIENCE }`.

---

## Tags

| Tag code   | Tag name   | Role                                |
|------------|------------|-------------------------------------|
| EXPERIENCE | Experience | Sunday services parent              |
| LIFEKIDS   | LifeKids   | Child of EXPERIENCE — kids ministry |
| SWITCH     | Switch     | Wednesday youth service             |

---

## Response Categories (with primary_tag)

| Name                | scope   | primary_tag |
|---------------------|---------|-------------|
| Baptism             | service | EXPERIENCE  |
| Hands Raised        | service | EXPERIENCE  |
| Parking             | service | EXPERIENCE  |
| LifeKids Baptism    | service | LIFEKIDS    |
| LifeKids Hands Raised | service | LIFEKIDS  |
| LifeKids Rooms Open | service | LIFEKIDS    |
| Switch Hands Raised | service | SWITCH      |

---

## Volunteer Categories (with primary_tag)

| Name                          | primary_tag |
|-------------------------------|-------------|
| Band or Production            | EXPERIENCE  |
| Host Team                     | EXPERIENCE  |
| Operations                    | EXPERIENCE  |
| Other (Experience)            | EXPERIENCE  |
| LifeKids Adult Volunteers     | LIFEKIDS    |
| LifeKids Student Volunteers   | LIFEKIDS    |
| Switch Small Group Leaders    | SWITCH      |
| Switch Childcare              | SWITCH      |
| Switch Other Volunteers       | SWITCH      |

---

## Giving Sources (all `period_giving.*` — church-wide weekly totals)

- Offerings / Tithes
- App Giving
- Relief
- Places
- Switch Fund
- LifeKids Fund
- Resources
- Other Giving

---

## Tall Format — Sunday Services

- `group_type_column`: "Group Type" (values: Stats / Volunteers / Attender)
- `group_context_column`: "Group" (values: Experience / LifeKids — ministry routing)
- `metric_name_column`: "Area"
- `audience_column`: "Adult Student Kid" → maps `Adult → MAIN`, `Kid → KIDS`, `Student → YOUTH`
- 3-segment compound keys: `"GroupType / Group / Area"`

## Tall Format — Switch (Youth)

- `group_type_column`: "Group Type"
- `metric_name_column`: "Group" (different from Sunday Services!)
- `audience_column`: "Adult Student Kid"
- 2-segment compound keys: `"GroupType / Group"` (no group_context — single ministry sheet)
- `default_service_template_code`: `SWITCH_WED`

---

## Preview Sample (single date 2025-09-07)

### Service 1 (9 AM Experience)
- Adult attendance: 171
- Kids attendance (LifeKids): 47
- Volunteers: Host Team 31, Operations 4, Band/Production 13, LifeKids Adult 14, LifeKids Students 4
- Stats: Parking 132, LifeKids Hands 2, LifeKids Rooms Open 7

### Service 2 (11 AM Experience)
- Adult attendance: 121
- Kids attendance (LifeKids): 59
- Volunteers: Host Team 16, Operations 6, Band/Production 13, LifeKids Adult 13, LifeKids Students 3
- Stats: Hands Raised 3, Parking 132, LifeKids Hands 1, LifeKids Rooms Open 7

### Switch (Wednesday 2025-09-10)
- Youth attendance: 109
- Volunteers: Small Group Leaders 14, Childcare 2, Switch Other 5
- Stats: Switch Hands Raised 3

### Giving (week of 2025-09-07)
- Offerings / Tithes: $10,052
- App Giving: $5,838
- Places: $5

---

## Verification Checklist (post-import)

When the import succeeds, every one of these must hold true. If any fail, the
mapping → table translation has a bug.

### Database tables
- [ ] `service_templates` has exactly 3 rows: codes `1`, `2`, `SWITCH_WED`
- [ ] Templates 1 and 2 both have `primary_tag = EXPERIENCE`
- [ ] Templates 1 and 2 have `day_of_week = 0`; SWITCH_WED has `day_of_week = 3`
- [ ] `service_tags` includes EXPERIENCE, LIFEKIDS, SWITCH
- [ ] `tag_relationships` has one row: LIFEKIDS child of EXPERIENCE
- [ ] `service_occurrences` for 2025-09-07 has rows for templates 1 and 2 (both Sunday)
- [ ] `service_occurrences` for 2025-09-10 has one row for SWITCH_WED (Wednesday)
- [ ] `attendance_entries` for Service 1 on 9/7: main=171, kids=47, youth=null
- [ ] `attendance_entries` for Service 2 on 9/7: main=121, kids=59, youth=null
- [ ] `attendance_entries` for Switch on 9/10: youth=109
- [ ] `church_period_giving` for week-of 9/7 has rows for all 8 giving sources
- [ ] No rows in `attendance_entries` orphaned (every row has a valid `service_instance_id`)

### UI screens
- [ ] Dashboard shows 3 separate service lines (Service 1, Service 2, Switch)
- [ ] Dashboard attendance for week of 9/7: 171 + 121 = 292 main / 47 + 59 = 106 kids / 109 youth
- [ ] History grid shows each occurrence under its actual date (Switch under Wed 9/10, not Sun 9/7)
- [ ] Settings → Services lists 3 templates with correct days + (eventually) start times
- [ ] Settings → Response Categories lists 7 categories with correct primary_tag
- [ ] Settings → Volunteer Categories lists 9 categories with correct primary_tag
- [ ] Settings → Giving Sources lists 8 sources
- [ ] Weekly-entry screen: clicking Service 1 reveals EXPERIENCE attendance/volunteers/stats AND
      LifeKids attendance/volunteers/stats as two child ministries (the user's requested layout)

---

## Known issues / follow-ups

1. **Walkthrough answers were applied client-side only.** The mapping in the DB still has
   `[BLOCKING]` display_names. On the next import attempt, either re-answer the walkthrough
   or pre-fill the display_names directly.

2. **Weekly-entry screen layout is currently backwards.** Needs restructure to:
   `Service → Ministry → Metrics` (see task #36).

3. **Some clarifications had `recommended_answer` defaults** — user should review whether
   those are right (App Giving overlap, large giving outliers, Switch schedule).
