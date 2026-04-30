# IRIS Element Map — T-sched: Schedule Version Setup
## Version 1.0 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none — v1.1 revision applied

### Screen Purpose
Define recurring schedule for a service template (day + time + effective date).
Drives P12b — which services are expected each week.
Without a schedule, T1 shows nothing. Step 4 of onboarding.

### Physical Context
Context C — desktop, deliberate. Reached from T6 template setup.

### Schema Key Facts
service_schedule_versions: day_of_week (0=Sun–6=Sat) · start_time · effective_start_date · effective_end_date
Append-only: schedule changes create a new version, never edit the old one.

### Elements

**E1** — Screen Header
- Onboarding: "Step 4 of 5 — When do you meet?"
- Settings: "Schedule" (under template name)
- Back → T6 (onboarding) or T6 template detail (Settings)

**E2** — Day of Week Selector
- "Which day does this service run?"
- 7-button row: Sun Mon Tue Wed Thu Fri Sat
- Sunday pre-selected
- Single select

**E3** — Start Time Picker
- "What time does it start?"
- Native time picker — no end time in V1

**E4** — Effective Start Date
- "When does this schedule start? — so we know which weeks to expect data."
- Date picker, defaults to next occurrence of selected day
- Cannot be in the past for new schedules

**E5** — Continue / Save
- Onboarding: "Continue — invite your team next." → T9
- Settings: "Save schedule" → T6 template detail
- Active when E2 + E3 + E4 all filled

**E6** — Current Schedule [Settings only, when schedule exists]
- "Sunday · 9:00am · started Apr 6, 2026"
- "Change schedule" link → new version flow

**E7** — Schedule Change Warning [Settings, changing existing]
- "Starting a new schedule — what date does the change take effect?"
- Creates new service_schedule_versions row
- Sets effective_end_date on prior version
- Historical occurrence data unaffected

### Validation
- Day + time + effective_start_date all required
- Effective start date: not before today for new versions
- One active schedule version per template (effective_end_date IS NULL = active)

### V1 Known Limitation (F16)
P12b assumes weekly cadence — bi-weekly/monthly services show incorrect cards.
Documented. No fix in V1.

### Role Rules
Owner ✅ · Admin ✅ · Editor ❌ · Viewer ❌

### NOVA Items
| # | Requirement |
|---|---|
| N29 | New version: set effective_end_date on prior active version on Save |
| N30 | P12b re-evaluated after save — T1 updates immediately |
| N31 | Default effective_start_date = next occurrence of selected day from today |

---

## Revision 1.1 — Pressure Test Gap 4 Applied (2026-04-09)

### Multi-Template Loop — Critical Gap Closed

T-sched must iterate through ALL service templates that have no active
schedule version. A church with two Sunday services needs two schedule
setups before the onboarding advances to T9.

### E6 — Multi-Template Progress [ONBOARDING ONLY — new element]
- Shown after saving a schedule when other templates still need scheduling
- "Done — [Service Name] is scheduled for Sundays at 9:00am."
- "You have [X] more service(s) to schedule:"
- List of remaining unscheduled templates (name only)
- "Schedule next service →" advances to next template's schedule form
- When ALL templates have active schedules → Continue → T9

### Continue Button Update
Onboarding: Active only when ALL service_templates for this church
have at least one active service_schedule_versions row.
Previously: active after one schedule saved.

### Settings Context
No loop needed — accessed per-template from T6 template detail.
E6 not shown in Settings context.

### NOVA Items Added
| # | Requirement |
|---|---|
| N31b | On T-sched Save: query remaining templates with no active schedule. If any → show E6. If none → enable Continue to T9. |
