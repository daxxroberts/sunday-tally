# IRIS Element Map — Services / What-We-Track Restructure
## Version 1.0 | 2026-06-09
## Status: Approved plan → build requirement (The One Rule applies)
## Covers: Services list v2 (T6 revision) · Service Edit (T6C, new) · What-we-track additions (TTRACK rev) · Entries church-wide additions (T2 rev) · AI-widget service_group dimension (WIDGETS rev)

### Concept (one breath)
Two surfaces, one job each. **What we track** = WHAT you count (ministry tree + metrics + roll-ups).
**Services** = WHEN & WHERE you gather (location, schedule) + which counted things appear there.
Anything counted has exactly two doors: **at a service** (per-gathering count) or **weekly/monthly church-wide**
(no service; lives in Stat Entries). A service may be church-wide (`location_id IS NULL`) — one shared
occurrence per date visible at every campus. Reporting groups (morning/evening) are a REPORTING concept,
set on the service, consumed by widgets — never required for setup.

---

## Screen 1 — Services list v2 (`/settings/services`) — revises IRIS_T6

### Purpose
Answer "when and where do we gather, and what do we count there?" at a glance. Group by location.

### Elements
**S1** — Header: title **"Services"**; subtitle **"When and where you gather — each service creates the weekly occurrences you log in Entries."** Back → /settings.
**S2** — Orphan banner [conditional, editors+]: amber, appears when ≥1 orphan ministry exists (see TK4). Copy: "⚠ {N} {ministry|ministries} aren't counted anywhere yet — {names}. " + button **"Fix"** → opens TK5 picker for the first orphan.
**S3** — Location groups [repeating]: one section per active `church_locations` row that has ≥1 active service, header = location name; PLUS a final **"Church-wide"** section when NULL-location services exist (subtitle: "Counted once for the whole church — visible at every campus."). Single-campus church: no location headers, flat list (+ Church-wide section when present).
**S4** — Service card [repeating, within S3]: existing T6 card (name · cadence badge · "Unscheduled" amber · status circle · ministry rows + add-ministry) PLUS:
  - **S4a** — Edit button (pencil, owner/admin) → `/settings/services/[templateId]/edit` (Screen 2).
  - **S4b** — Reporting-group chip [conditional]: slate pill with group name when `reporting_group_id` set.
  - **S4c** — Hidden-from-entries chip [conditional]: slate pill "Hidden from Entries" when `show_in_entries=false`.
**S5** — Add service → `/settings/services/new` (gains church-wide option, Screen 2b).

### Role rules
Viewer: no access (settings). Editor: view + add/remove ministries (existing). Owner/Admin: everything incl. edit/deactivate/schedule.

---

## Screen 2 — Service Edit (`/settings/services/[templateId]/edit`) — NEW (T6C)

### Purpose
The missing edit surface: rename, retag, regroup, hide, retire. NOT for schedules (existing schedule page) and NOT for ministry composition (cards on Screen 1 own that).

### Elements
**SE1** — Header: "Edit service" + service name subtitle. Back → /settings/services.
**SE2** — Display name input (required; inline validation: not blank).
**SE3** — Location [see states]:
  - No instances yet → select: each active location + **"Church-wide (one shared count for the whole church)"** (NULL). (Church-wide option only after 0036 applies.)
  - Instances exist → read-only row + note: "This service has {N} recorded {week|weeks} — its campus can't change. Create a new service at the other campus instead."
**SE4** — Primary ministry select (required; options = active service_tags). Changing it ALSO upserts the `service_template_tags` junction row (D-076 invariance — primary is always linked).
**SE5** — Reporting group select (optional): "None" + active `service_groups` + inline **"+ New group"** (name → code slug). [Renders only after 0037 applies; hidden otherwise.]
**SE6** — Show in Entries toggle: label "Show in Entries"; help: "Off = entry screens skip this service. History and dashboards keep all its data." [After 0036.]
**SE7** — Save (primary) → updateServiceAction → back to list with the card updated.
**SE8** — Danger zone — Deactivate: typed-confirm ("type the service name"); copy: "This service stops appearing in Entries and Services. Everything already logged stays in History and Dashboards." Junction rows are KEPT. Owner/Admin only.

### Screen 2b — Add service (`/new`) revision
**SN1** — Location step gains third option **"Church-wide — one shared count for the whole church (no campus)"**, distinct from the existing "create at every campus" duplicator. [After 0036.]

---

## Screen 3 — What we track additions (`/settings/track`) — revises TTRACK

### Elements
**TK1** — (existing tree unchanged)
**TK2** — Orphan chip [per node, conditional]: amber pill **"Not counted anywhere"** on any active node that owns ≥1 active canonical `mode='entry'` `scope='instance'` metric and has zero `service_template_tags` links to an active template. Rollup-only nodes and period-scoped metrics never flag. Click → TK5.
**TK3** — Create-ministry wizard, final step **"Where is this counted?"** — two doors, plain labels:
  - **Door A** — "At a service — each gathering gets its own count." → checkbox list of active services, PRE-CHECKED from the nearest linked ancestor's services (auto-link); top-level nodes default unchecked with amber note "Won't appear in Entries until it's counted at a service."
  - **Door B** — "Just weekly or monthly, church-wide — no service. Shows in the Stat Entries tab." → cadence select (weekly/monthly) → metrics created `scope='period'`.
  - Skippable ("Decide later") → node simply flags TK2 until resolved.
**TK4** — Orphan detection source: shared helper `src/lib/ministryLinks.ts → getOrphanMinistries()` (same source feeds S2).
**TK5** — "Where is this counted?" picker (modal): same two doors as TK3 for an EXISTING node — Door A writes junction rows; Door B converts the node's instance-scoped entry metrics to `scope='period'` + cadence (guard: blocked with explanation if the metric already has instance-bound entries; show count).

---

## Screen 4 — Entries additions (T2 rev)

**EN1** — Occurrence tabs include church-wide services' occurrences at EVERY campus, after the campus's own, separated by a **"Church-wide"** divider label. Same instance row shared across campuses (one value, any campus edits it).
**EN2** — Services with `show_in_entries=false` produce no tabs/virtual occurrences (filter at template fetch). History unaffected.
**EN3** — Entry writes against church-wide instances store `location_id = NULL` (instance + metric_entries).

---

## Screen 5 — AI-widget builder additions (WIDGETS rev)

**W1** — New dimension `service_group` (categorical, by code) valid on `attendance_per_occurrence` + `volunteers_per_occurrence` + `metric_entries_readable` (views expose `service_group_code` after 0038). New filter `filters.service_group_codes`.
**W2** — Builder prompt teaches: "morning vs evening services" → dimension/filter `service_group`; ungrouped services bucket as "—".
**W3** — Campus semantics: church-wide (NULL-location) rows are excluded from single-campus-filtered widgets, included under "All campuses" (BUILD_FLAGS records the one-line override).

---

## Out of scope this round (recorded in BUILD_FLAGS)
Dashboard cards / History columns grouped by reporting group · per-campus period entries · M3 reversal interplay.
