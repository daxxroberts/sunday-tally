# IRIS Element Map — T1: Recent Services
## Version 1.1 | 2026-04-09
## Status: Complete — Ready for build
## Pending revisions: none
## Revision: D-024 applied — Today's Services → Recent Services (7 days, incomplete-first)

---

### Screen Purpose
Entry point to the Sunday loop. Shows last 7 days of services, grouped by date, incomplete first. User taps any service — from today or any day this week — to enter or complete data. Session anchor written on tap. All of T2–T4 depend on this completing.

Replaces the "Today only" model. Handles Sunday entry, Tuesday delayed entry, and corrections in a single screen without a History screen.

---

### Data Sources

| Data | Source | Query |
|---|---|---|
| Existing occurrences + completion | service_occurrences JOIN entry tables | P12 — last 7 days, active only |
| Scheduled services without occurrence | service_templates JOIN service_schedule_versions | P12b — scheduled but not yet started |
| Completion flags | attendance_entries, volunteer_entries, response_entries, giving_entries | EXISTS per occurrence (P12) |

---

### Screen States

1. **Loading** — skeleton cards in grouped layout
2. **Standard** — services grouped by date, incomplete groups first
3. **All Complete** — all services in last 7 days have full data
4. **No Services in Last 7 Days** — no schedule configured — role-aware message + CTA
5. **Setup Incomplete** — no locations or templates — progress indicator + CTA (Owner/Admin only)
6. **Offline** — cached recent list + banner (TTL 1 hour)

---

### Elements

**E1 — App Header**
- Content: Church name (left) · Settings icon (right, Owner/Admin only)
- Behaviour: Static. Does not scroll.
- Role rule: Settings icon hidden for Editor

**E9 — Section Header** *(repeating — one per day with services)*
- Content: Day + date ("Sunday, Apr 13") · E10 Completion Badge
- Sort: Incomplete days first → most recent date first → complete days below
- Behaviour: Static label — not tappable

**E10 — Completion Badge** *(on E9 section header)*
- Content: "2 of 3 complete" / "Complete" / "Not started"
- States: Not started (amber) · In progress (blue) · Complete (green)
- Calculated from P12 EXISTS flags across all services in the day

**E3 — Service Card** *(repeating — one per service per day)*
- E3a — Service name — large, primary — service_templates.display_name
- E3b — Service time — secondary — service_schedule_versions.start_time
- E3c — Location name — tertiary, multi-campus only — church_locations.name
- E3d — Completion indicator — per-service (not started / in progress / complete)
- E3e — Full-card tap target

- **Tap behaviour:**
  - Occurrence exists (P12) → load → session anchor → entry screens
  - No occurrence (P12b) → CREATE → E4 confirmation → session anchor → entry screens
  - Duplicate constraint hit (F6) → silently route to existing occurrence

- **Card order within day:** service_templates.sort_order then start_time

**E4 — Inline Creation Confirmation** *(when no occurrence exists)*
- Inline card state — not a modal
- "Starting [Service Name]..." for 500ms then navigates
- Debounced — two fast taps cannot create two occurrences (NOVA N2)

**E5 — Empty State: No Services in Last 7 Days** *(State 4)*
- Owner/Admin headline: "Set up your service schedule"
- Editor headline: "No services this week"
- Owner/Admin CTA: "Go to Settings" → T6
- Editor: message only, no CTA

**E6 — Empty State: Setup Incomplete** *(State 5 — Owner/Admin only)*
- Progress indicator: Church info · Locations · Service templates
- CTA: "Continue Setup" → next incomplete step
- Editor never reaches this — redirected at routing layer

**E7 — Offline Banner**
- Thin banner below E1
- Content: "Offline — showing services from [time] today"
- Dismissible. Cards remain tappable. Occurrence creation queued optimistically.

**E8 — Navigation Bar**
- Owner/Admin/Editor: Recent Services (active) · Settings (Owner/Admin only)
- History: hidden in V1 (not greyed — removed entirely)
- Viewer: cannot reach T1 — routing redirects to dashboard

---

### Element Relationships

```
Screen: T1 — Recent Services
│
├── E1 App Header
│     └── Settings icon → T6 (Owner/Admin only)
│
├── E9 Section Header [repeating — per day]
│     └── E10 Completion Badge ← P12 EXISTS flags (aggregated per day)
│
├── E3 Service Card [repeating — per service]
│     ├── E3a name ← service_templates.display_name
│     ├── E3b time ← service_schedule_versions.start_time
│     ├── E3c location ← church_locations.name (multi-campus only)
│     ├── E3d completion ← P12 EXISTS flags (per service)
│     └── E3e tap target
│           ├── exists (P12) → session anchor → T2
│           └── not started (P12b) → CREATE → E4 → session anchor → T2
│
├── E4 Inline confirmation (500ms, debounced, on create)
├── E5 Empty State: No Services (role-aware, CTA Owner/Admin only)
├── E6 Empty State: Setup Incomplete (Owner/Admin only)
├── E7 Offline Banner (dismissible)
└── E8 Navigation Bar (role-aware, History hidden)
```

---

### Session Anchor Write (on E3 tap)

```javascript
SundaySessionContext.set({
  occurrenceId: occurrence.id,
  serviceDisplayName: template.display_name,
  serviceDate: occurrence.service_date,  // from record — NOT device date
  locationName: location.name
})

// sessionStorage key per occurrence date — multiple dates can be active
sessionStorage.setItem(
  `sunday_session_${occurrence.service_date}`,
  JSON.stringify(SundaySessionContext.value)
)
```

Safety net: T2/T3/T4 redirect to T1 if context is empty on load.

---

### Sequencing Gates Enforced

| Gate | How T1 enforces it |
|---|---|
| Gate 1 — Setup incomplete | E6 shown, Sunday loop blocked |
| Gate 2 — Editor, no schedule | E5 shown with "contact admin" message |
| Gate 3 — Viewer containment | Routing redirects before T1 loads |

---

### Role Rules

| Element | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| E1 Settings icon | ✅ | ✅ | ❌ | N/A |
| E3e Create occurrence | ✅ | ✅ | ✅ (D-021) | N/A |
| E5 CTA to Settings | ✅ | ✅ | ❌ | N/A |
| E6 Setup Incomplete | ✅ | ✅ | ❌ | N/A |
| E8 Settings nav | ✅ | ✅ | ❌ | N/A |

---

### FAULT Mitigations

| FAULT | Resolution |
|---|---|
| F2 — No occurrence shortcut | E4 derives from P12b schedule data — not a blank form |
| F6 — Duplicate occurrence | Silent route to existing — no error shown |

---

### NOVA Open Items

| # | Requirement |
|---|---|
| N1 | P12 as single RPC — all completion flags in one round trip |
| N2 | Debounce E3 tap — prevent double-tap creating two occurrences |
| N3 | sessionStorage key: `sunday_session_[YYYY-MM-DD]` per occurrence date |
| N4 | Offline cache: localStorage, schedule + occurrence status, TTL 1 hour |
| N5 | History tab hidden (not greyed) in V1 |
| N6 | P12 sort: incomplete first, date DESC, sort_order — single RPC |

---

### Reusable Components First Identified Here

| Component | Element | Reuses in |
|---|---|---|
| App Header | E1 | Every screen |
| Section Header | E9 | T3/T4 audience group headers |
| Completion Indicator | E3d / E10 | T1, occurrence dashboard |
| Empty State | E5, E6 | All screens |
| Navigation Bar | E8 | Every screen |
| Offline Banner | E7 | Every screen |
| Service Card Shell | E3 | T1 |
| Inline Confirmation | E4 | T1, T3/T4 section submit |

---

### Handoff to T2

T2 reads occurrenceId and serviceDate from SundaySessionContext.
T2 does not re-fetch the occurrence.
If context empty on T2 load → redirect to T1.
T2 shows serviceDisplayName and serviceDate in a persistent header — user always knows which service they are entering for.

## Occurrence Creation — Server Action (D-052)

When user taps a "not started" service card (E3e — P12b state):

```
POST /api/occurrences
Body: { service_template_id, service_date, location_id, church_id }

Server:
1. Check for existing occurrence (handle concurrent creation)
2. INSERT service_occurrences (status = 'active')
3. INSERT service_occurrence_tags for all assigned tags within date range (N45)
4. Return { occurrence_id }

Client:
5. Write to SUNDAY_SESSION
6. Navigate to /services/[occurrenceId]
```

NOVA N104: Occurrence creation is server-side only.
Client never writes to service_occurrences directly.
If occurrence already exists for (template_id, service_date): return existing row.
