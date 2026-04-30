# FLOW_REPORT — Church Analytics
Generated: 2026-04-22 | Screens: 28 | Gates: 6

---

## Application Flow Diagram

```mermaid
flowchart TD
  subgraph Auth
    AUTH["Login / Magic Link"]
    INVITE_ACCEPT["Invite Acceptance"]
  end
  subgraph Onboarding
    ONBOARDING_CHURCH["Church Info (Step 1)"]
    T_LOC["Location Setup"]
    T6["Service Setup"]
    T_SCHED["Schedule Setup"]
    T9["Invite + Onboard"]
  end
  subgraph SundayLoop
    T1["Recent Services"]
    T1B["Occurrence Dashboard"]
    T2["Attendance Entry"]
    T3["Volunteer Entry"]
    T4["Stats Entry"]
    T4_SUMMARY["Stats Post-Submit Summary"]
    T5["Giving Entry"]
    T_HISTORY["Historical Data Review"]
    T_WEEKLY["Weekly Inputs"]
    T_WEEKLY_STATS["Weekly Stats Inputs"]
  end
  subgraph Dashboard
    D1["Full Dashboard"]
    D2["Viewer Summary"]
  end
  subgraph Settings
    T_SETTINGS["Settings Hub"]
    T_LOC_SETTINGS["Location Setup (Settings)"]
    T6_SETTINGS["Service Setup (Settings)"]
    T_SCHED_SETTINGS["Schedule Setup (Settings)"]
    T6B["Tracking Configuration"]
    T7["Volunteer Roles"]
    T8["Stats"]
    T_GIVING_SOURCES["Giving Sources"]
    T_TAGS["Service Tags"]
    T9_SETTINGS["Team (Settings)"]
  end
  AUTH -->|"login_success [role_is_owner_or_admin]"| GATE_1
  AUTH -->|"login_success [role_is_viewer]"| GATE_3
  AUTH -->|"login_success [role_is_editor]"| T1
  AUTH -->|"create_new_church"| SIGNUP
  INVITE_ACCEPT -->|"accept_success"| T1
  INVITE_ACCEPT -->|"accept_success"| D2
  ONBOARDING_CHURCH -->|"continue"| T_LOC
  T_LOC -->|"continue [at_least_one_location]"| T6
  T_LOC -. "back" .-> ONBOARDING_CHURCH
  T6 -->|"continue [at_least_one_service_with_primary_tag]"| T_SCHED
  T6 -. "back" .-> T_LOC
  T_SCHED -->|"schedule_saved_more_pending [unscheduled_templates_remain]"| T_SCHED
  T_SCHED -->|"continue [all_templates_scheduled]"| T9
  T_SCHED -. "back" .-> T6
  T9 -->|"done_or_skip"| T1
  T9 -. "back" .-> T_SCHED
  T1 -->|"tap_service [occurrence_exists_or_create]"| T1B
  T1 -->|"tap_history"| T_HISTORY
  T1 -->|"tap_weekly"| T_WEEKLY
  T1 -->|"tap_weekly_stats"| T_WEEKLY_STATS
  T_HISTORY -->|"tap_occurrence_link"| T1B
  T_HISTORY -. "back" .-> T1
  T_WEEKLY -. "back" .-> T1
  T_WEEKLY_STATS -. "back" .-> T1
  T1B -->|"tap_attendance"| T2
  T1B -->|"tap_volunteers [tracks_volunteers]"| T3
  T1B -->|"tap_stats [tracks_responses]"| T4
  T1B -->|"tap_giving [tracks_giving]"| T5
  T1B -. "back" .-> T1
  T2 -->|"submit"| T1B
  T2 -. "back dirty?" .-> T1B
  T3 -->|"all_sections_submitted"| T1B
  T3 -. "back dirty?" .-> T1B
  T4 -->|"all_sections_submitted"| T4_SUMMARY
  T4 -. "back dirty?" .-> T1B
  T4_SUMMARY -->|"dismiss_or_auto_2500ms"| T1B
  T5 -->|"submit"| T1B
  T5 -. "back dirty?" .-> T1B
  T_SETTINGS -->|"tap_locations"| T_LOC_SETTINGS
  T_SETTINGS -->|"tap_services"| T6_SETTINGS
  T_SETTINGS -->|"tap_tracking"| T6B
  T_SETTINGS -->|"tap_volunteer_roles"| T7
  T_SETTINGS -->|"tap_stats"| T8
  T_SETTINGS -->|"tap_giving_sources"| T_GIVING_SOURCES
  T_SETTINGS -->|"tap_tags"| T_TAGS
  T_SETTINGS -->|"tap_invite"| T9_SETTINGS
  T_LOC_SETTINGS -. "back dirty?" .-> T_SETTINGS
  T6_SETTINGS -->|"tap_schedule_for_service"| T_SCHED_SETTINGS
  T6_SETTINGS -. "back dirty?" .-> T_SETTINGS
  T_SCHED_SETTINGS -. "back dirty?" .-> T6_SETTINGS
  T6B -. "back dirty?" .-> T_SETTINGS
  T7 -. "back" .-> T_SETTINGS
  T8 -. "back" .-> T_SETTINGS
  T_GIVING_SOURCES -. "back" .-> T_SETTINGS
  T_TAGS -. "back" .-> T_SETTINGS
  T9_SETTINGS -. "back" .-> T_SETTINGS
  SIGNUP -->|"provisioning_success"| ONBOARDING_CHURCH
  SIGNUP -. "back" .-> AUTH
```

---

## Route Table

| Screen ID | Name | Route | Layout | Tab | Root | Roles | Gates |
|-----------|------|-------|--------|-----|------|-------|-------|
| AUTH | Login / Magic Link | `/auth/login` | AuthLayout | — |  | O,A,E,V | — |
| INVITE_ACCEPT | Invite Acceptance | `/auth/invite/[token]` | AuthLayout | — |  | O,A,E,V | — |
| ONBOARDING_CHURCH | Church Info (Step 1) | `/onboarding/church` | OnboardingLayout | — |  | O | — |
| T_LOC | Location Setup | `/onboarding/locations` | OnboardingLayout | — |  | O,A | — |
| T6 | Service Setup | `/onboarding/services` | OnboardingLayout | — |  | O,A | — |
| T_SCHED | Schedule Setup | `/onboarding/schedule` | OnboardingLayout | — |  | O,A | — |
| T9 | Invite + Onboard | `/onboarding/invite` | OnboardingLayout | — |  | O,A | — |
| T1 | Recent Services | `/services` | AppLayout | services | ✓ | O,A,E | gate_1_setup |
| T1B | Occurrence Dashboard | `/services/[occurrenceId]` | AppLayout | services |  | O,A,E | — |
| T_HISTORY | Historical Data Review | `/services/history` | AppLayout | services |  | O,A,E | gate_1_setup |
| T_WEEKLY | Weekly Inputs | `/services/weekly` | AppLayout | services |  | O,A,E | gate_1_setup |
| T_WEEKLY_STATS | Weekly Stats Inputs | `/services/weekly-stats` | AppLayout | services |  | O,A,E | gate_1_setup |
| T2 | Attendance Entry | `/services/[occurrenceId]/attendance` | AppLayout | services |  | O,A,E | — |
| T3 | Volunteer Entry | `/services/[occurrenceId]/volunteers` | AppLayout | services |  | O,A,E | gate_tracks_volunteers |
| T4 | Stats Entry | `/services/[occurrenceId]/stats` | AppLayout | services |  | O,A,E | gate_tracks_responses |
| T4_SUMMARY | Stats Post-Submit Summary | `/services/[occurrenceId]/stats/summary` | AppLayout | services |  | O,A,E | — |
| T5 | Giving Entry | `/services/[occurrenceId]/giving` | AppLayout | services |  | O,A,E | gate_tracks_giving |
| D1 | Full Dashboard | `/dashboard` | AppLayout | dashboard | ✓ | O,A | gate_1_setup |
| D2 | Viewer Summary | `/dashboard/viewer` | AppLayout | dashboard | ✓ | V | gate_3_viewer |
| T_SETTINGS | Settings Hub | `/settings` | AppLayout | settings | ✓ | O,A | gate_role_settings |
| T_LOC_SETTINGS | Location Setup (Settings) | `/settings/locations` | AppLayout | settings |  | O,A | — |
| T6_SETTINGS | Service Setup (Settings) | `/settings/services` | AppLayout | settings |  | O,A | — |
| T_SCHED_SETTINGS | Schedule Setup (Settings) | `/settings/services/[templateId]/schedule` | AppLayout | settings |  | O,A | — |
| T6B | Tracking Configuration | `/settings/tracking` | AppLayout | settings |  | O,A | — |
| T7 | Volunteer Roles | `/settings/volunteer-roles` | AppLayout | settings |  | O,A | — |
| T8 | Stats | `/settings/stats` | AppLayout | settings |  | O,A | — |
| T_GIVING_SOURCES | Giving Sources | `/settings/giving-sources` | AppLayout | settings |  | O,A | — |
| T_TAGS | Service Tags | `/settings/tags` | AppLayout | settings |  | O,A | — |
| T9_SETTINGS | Team (Settings) | `/settings/team` | AppLayout | settings |  | O,A | — |
| SIGNUP | New Church Signup | `/signup` | AuthLayout | — |  |  | — |

---

## Per-Role Journeys

### Owner
```mermaid
flowchart TD
  AUTH["Login / Magic Link"]
  D1["Full Dashboard"]
  INVITE_ACCEPT["Invite Acceptance"]
  ONBOARDING_CHURCH["Church Info (Step 1)"]
  T1["Recent Services"]
  T1B["Occurrence Dashboard"]
  T2["Attendance Entry"]
  T3["Volunteer Entry"]
  T4["Stats Entry"]
  T4_SUMMARY["Stats Post-Submit Summary"]
  T5["Giving Entry"]
  T6["Service Setup"]
  T6B["Tracking Configuration"]
  T6_SETTINGS["Service Setup (Settings)"]
  T7["Volunteer Roles"]
  T8["Stats"]
  T9["Invite + Onboard"]
  T9_SETTINGS["Team (Settings)"]
  T_GIVING_SOURCES["Giving Sources"]
  T_HISTORY["Historical Data Review"]
  T_LOC["Location Setup"]
  T_LOC_SETTINGS["Location Setup (Settings)"]
  T_SCHED["Schedule Setup"]
  T_SCHED_SETTINGS["Schedule Setup (Settings)"]
  T_SETTINGS["Settings Hub"]
  T_TAGS["Service Tags"]
  T6 --> T_SCHED
  T1 --> T1B
  T1 --> T_HISTORY
  T_HISTORY --> T1B
  T2 --> T1B
  T9 --> T1
  ONBOARDING_CHURCH --> T_LOC
  T4 --> T4_SUMMARY
  INVITE_ACCEPT --> T1
  T1B --> T2
  T1B --> T3
  T1B --> T4
  T1B --> T5
  T6_SETTINGS --> T_SCHED_SETTINGS
  T_LOC --> T6
  T_SETTINGS --> T_LOC_SETTINGS
  T_SETTINGS --> T6_SETTINGS
  T_SETTINGS --> T6B
  T_SETTINGS --> T7
  T_SETTINGS --> T8
  T_SETTINGS --> T_GIVING_SOURCES
  T_SETTINGS --> T_TAGS
  T_SETTINGS --> T9_SETTINGS
  T4_SUMMARY --> T1B
  T3 --> T1B
  T5 --> T1B
  T_SCHED --> T_SCHED
  T_SCHED --> T9
```

### Admin
```mermaid
flowchart TD
  AUTH["Login / Magic Link"]
  D1["Full Dashboard"]
  INVITE_ACCEPT["Invite Acceptance"]
  T1["Recent Services"]
  T1B["Occurrence Dashboard"]
  T2["Attendance Entry"]
  T3["Volunteer Entry"]
  T4["Stats Entry"]
  T4_SUMMARY["Stats Post-Submit Summary"]
  T5["Giving Entry"]
  T6["Service Setup"]
  T6B["Tracking Configuration"]
  T6_SETTINGS["Service Setup (Settings)"]
  T7["Volunteer Roles"]
  T8["Stats"]
  T9["Invite + Onboard"]
  T9_SETTINGS["Team (Settings)"]
  T_GIVING_SOURCES["Giving Sources"]
  T_HISTORY["Historical Data Review"]
  T_LOC["Location Setup"]
  T_LOC_SETTINGS["Location Setup (Settings)"]
  T_SCHED["Schedule Setup"]
  T_SCHED_SETTINGS["Schedule Setup (Settings)"]
  T_SETTINGS["Settings Hub"]
  T_TAGS["Service Tags"]
  T6 --> T_SCHED
  T1 --> T1B
  T1 --> T_HISTORY
  T_HISTORY --> T1B
  T2 --> T1B
  T9 --> T1
  T4 --> T4_SUMMARY
  INVITE_ACCEPT --> T1
  T1B --> T2
  T1B --> T3
  T1B --> T4
  T1B --> T5
  T6_SETTINGS --> T_SCHED_SETTINGS
  T_LOC --> T6
  T_SETTINGS --> T_LOC_SETTINGS
  T_SETTINGS --> T6_SETTINGS
  T_SETTINGS --> T6B
  T_SETTINGS --> T7
  T_SETTINGS --> T8
  T_SETTINGS --> T_GIVING_SOURCES
  T_SETTINGS --> T_TAGS
  T_SETTINGS --> T9_SETTINGS
  T4_SUMMARY --> T1B
  T3 --> T1B
  T5 --> T1B
  T_SCHED --> T_SCHED
  T_SCHED --> T9
```

### Editor
```mermaid
flowchart TD
  AUTH["Login / Magic Link"]
  INVITE_ACCEPT["Invite Acceptance"]
  T1["Recent Services"]
  T1B["Occurrence Dashboard"]
  T2["Attendance Entry"]
  T3["Volunteer Entry"]
  T4["Stats Entry"]
  T4_SUMMARY["Stats Post-Submit Summary"]
  T5["Giving Entry"]
  T_HISTORY["Historical Data Review"]
  T1 --> T1B
  T1 --> T_HISTORY
  T_HISTORY --> T1B
  AUTH --> T1
  T3 --> T1B
  T2 --> T1B
  T4_SUMMARY --> T1B
  T5 --> T1B
  T4 --> T4_SUMMARY
  INVITE_ACCEPT --> T1
  T1B --> T2
  T1B --> T3
  T1B --> T4
  T1B --> T5
```

### Viewer
```mermaid
flowchart TD
  AUTH["Login / Magic Link"]
  D2["Viewer Summary"]
  INVITE_ACCEPT["Invite Acceptance"]
  INVITE_ACCEPT --> D2
```

---

## Gate Map

| Gate ID | Name | Condition | Fail Redirect | Roles |
|---------|------|-----------|---------------|-------|
| gate_1_setup | Gate 1 — Setup Completion | Church has at least one location AND at least one service with a primary tag AND at least one active schedule version | ONBOARDING_CHURCH | O,A,E |
| gate_3_viewer | Gate 3 — Viewer Containment | Role is viewer | D2 | V |
| gate_role_settings | Settings Role Gate | Role is owner or admin | T1 | E,V |
| gate_tracks_volunteers | Volunteer Tracking Gate | church.tracks_volunteers = true | T1B | O,A,E |
| gate_tracks_responses | Stats Tracking Gate | church.tracks_responses = true | T1B | O,A,E |
| gate_tracks_giving | Giving Tracking Gate | church.tracks_giving = true | T1B | O,A,E |

---

## Shared State Map

| State | Scope | Used By |
|-------|-------|---------|
| SUNDAY_SESSION | session | T1B, T2, T3, T4, T4_SUMMARY, T5 |

SUNDAY_SESSION: Occurrence context (occurrenceId, serviceDisplayName, serviceDate, locationName).
Written on T1 tap. Read by T1b, T2, T3, T4, T4_SUMMARY, T5.
Keyed by date in sessionStorage: sunday_session_[YYYY-MM-DD].
Restoration pointer: sunday_last_active.
If empty on T2+ load: redirect to T1.

---

## AppFlow Findings

### Orphaned Routes (no inbound — unreachable)
- D1

### Dead Ends (no outbound, not declared terminal)
— None found.

### Missing Back Navigation (non-root screens with no back)
- ONBOARDING_CHURCH

### Screens Pending IRIS Map
- D1 (Full Dashboard) — routes defined, element map pending
- D2 (Viewer Summary) — routes defined, element map pending

### Settings Dual-Route Note
T_LOC, T6, T_SCHED, T9 each have two routes:
- Onboarding route (OnboardingLayout, no tab bar)
- Settings route (AppLayout, tab bar)
These are separate screen entries in the manifest (T_LOC vs T_LOC_SETTINGS etc.)
NOVA must implement both routes in Next.js with shared underlying components.
