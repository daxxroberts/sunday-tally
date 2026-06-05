# Church Analytics — App Context
## For any agent starting fresh on this build
## Version 2.0 | 2026-05-29 | Tag-first unified schema (Solution A)

> **v2.0 is a schema redesign.** The category-per-kind model (attendance_entries,
> volunteer_entries, response_entries, giving_entries + volunteer_categories,
> response_categories, giving_sources) is replaced by a unified, tag-first model:
> two tag axes (ministry + reporting), one `metrics` definition table, one
> `metric_entries` value table. Migration 0022 performs a **full reset** — all
> data is wiped, including churches. Re-provision via signup. See DECISION_REGISTER
> D-059 … D-070.

---

## What This Is

A multi-tenant SaaS for churches to track weekly ministry data and view
standardised dashboards. Churches log numbers every week — attendance,
volunteers, stats (decisions, baptisms, custom), and giving — and see those
numbers as comparisons over time. The dashboard ships out-of-the-box cross-cutting
metrics (volunteer-to-attendance ratio, per-capita giving, weekly average
attendance) without the church configuring anything.

Stack: Supabase (Postgres + RLS + Auth) + Next.js + Vercel.

---

## Who Uses It

Four roles. Each sees a different product.

| Role | What they do | Screens they see |
|---|---|---|
| Owner | Sets everything up, enters data, views reports | Everything |
| Admin | Enters data, views reports, invites team | Everything except owner-level role management |
| Editor | Enters data only — no reports | Sunday loop entry screens only |
| Viewer | Views reports only — magic link login, no password | Dashboard only |

**Primary use context:** An Admin opens the app on their phone at 9am Sunday. They
tap this week's service, enter the numbers for each ministry, and leave. On Monday
the pastor opens the app and sees how the numbers compare to last week, the
4-week trend, and year-over-year.

---

## The Core Loop

Everything exists to support the weekly entry flow:

```
T1 (Recent Services)
  └─ tap a service ──→ T1b (Service Hub)
                          ├─ tap a Ministry ──→ enter that ministry's metrics ──→ back to T1b
                          └─ each ministry shows its tracked reporting tags
                             (Attendance, Volunteers, Giving, Stats) as fields
```

**The shift from v1:** entry is now organised **Service → Ministry → Metrics**, not
Service → fixed-audience-columns. A service has one or more ministry tags hanging
off it (Adult Service, LifeKids, Switch/Youth). Each ministry collects whatever
reporting tags it tracks. "Kids attendance" is not a column — it is the ATTENDANCE
metric for the KIDS_MINISTRY-roled ministry tag.

**T1** shows the last 7 days of services, incomplete first. Only services whose
template has a `primary_tag_id` appear. **T1b** is the hub — it lists each ministry
under the service with completion status. Back always returns to T1b.

**The session anchor:** tapping a service in T1 writes the `service_instance_id` and
service date to context. Entry screens read this — they never re-ask for a service.

---

## The Data Model — Plain English

The model has **two independent tag axes** and **one value pipe**.

**Axis 1 — Ministry tags (`service_tags`).** The church's ministries, in a shallow
parent/child tree via `parent_tag_id` (adjacency list — D-059). Example:
`Sunday → Experience 1, Experience 2`; `LifeKids → Nursery, Elementary`; `Switch`.
Each tag carries a `tag_role` (ADULT_SERVICE · KIDS_MINISTRY · YOUTH_MINISTRY ·
OTHER) that drives audience grouping on the dashboard. Roll-ups use a recursive CTE
over the parent chain — trees are small (<30 nodes) and shallow (2–3 deep).

**Axis 2 — Reporting tags (`reporting_tags`).** The cross-cutting dimensions a
number belongs to: ATTENDANCE · VOLUNTEERS · GIVING · RESPONSE_STAT. Four are
system-seeded per church (`is_system = true`, immutable). Churches can add their
own. Reporting tags are what make out-of-the-box ratios possible: volunteers ÷
attendance, giving ÷ attendance, across any ministry.

**Services.** `service_templates` (the recurring service definition, FK
`primary_tag_id → service_tags`) and `service_instances` (one dated occurrence of a
template; `service_date`, `status`). `service_instances` is the **god node** — every
service-scoped metric value attaches here.

**The value pipe — `metrics` + `metric_entries`.**
- A `metric` is a *definition*: "this church tracks <reporting_tag> for
  <ministry_tag>." It carries `scope` ('instance' = per service, 'period' = per
  week/month), and `is_canonical` (the one metric per ministry+reporting pair that
  wide-shape imports write into).
- A `metric_entry` is a *value*: a `NUMERIC(14,2)` attached to **exactly one of**
  `service_instance_id` (service-scoped) or `period_anchor` (a Sunday-anchored date,
  for church-wide weekly numbers like total offering). `reporting_tag_code` is
  denormalized onto the row by trigger for fast dashboard filtering.

**Why this shape:** the church no longer fits into fixed MAIN/KIDS/YOUTH columns.
Any ministry, any reporting dimension, one entry path, one query path. The
dashboard's familiar audience rows are reconstructed by views, not stored as
columns.

**God node:** `service_instances`. Highest-degree table. Every service-scoped entry,
completion check, and dashboard query flows through it. The period-scoped branch
(`period_anchor`) is the only path that bypasses it, by design.

---

## Critical Rules

**Rule 1 — Filter cancelled instances.**
Always `WHERE service_instances.status = 'active'`. Cancelled services never appear
in entry flows or dashboard calculations.

**Rule 2 — `value` NULL ≠ zero.**
`NULL` means not entered. `0` means a confirmed zero. Never `COALESCE(value, 0)` in
averages — it corrupts the denominator. `is_not_applicable = true` marks a metric
that does not apply (distinct from both NULL and 0).

**Rule 3 — Group by tag codes, never display names.**
All roll-ups group by `reporting_tag_code` and by ministry `service_tags.code` /
`tag_role`. `name` / `display_name` are presentational only — never a reporting key.

**Rule 4 — Totals are calculated, never stored.**
Volunteer totals, giving totals, audience roll-ups are always `SUM(value)` over the
relevant `metric_entries`. No stored total column anywhere.

**Rule 5 — `reporting_tag_code` is trigger-denormalized. Never write or re-derive it.**
The trigger copies it from `metrics → reporting_tags` on insert/update of
`metric_entries`. Application code never sets it; queries never re-derive tag
membership at read time.

**Rule 6 — Entry attachment is XOR.**
Every `metric_entry` has **exactly one** of `service_instance_id` or
`period_anchor` set. Enforced by CHECK constraint. Service-scoped vs church-wide
weekly is decided by the metric's `scope`.

**Rule 7 — One canonical metric per (church, ministry_tag, reporting_tag).**
`is_canonical = true` is unique within that triple (partial UNIQUE index).
Wide-shape imports and the default entry screens target the canonical metric.
Non-canonical metrics are additional named breakouts.

**Rule 8 — `period_anchor` is the Sunday on or before the entry's date.**
Sunday = start of the church week. Sun Apr 26 → 2026-04-26; Mon Apr 27 →
2026-04-26. Used for all period-scoped (church-wide weekly) metrics.

---

## Configuration Flags

Per-church flags on `churches`, all default `true`. Set in Settings → What You Track.

| Flag | What it controls |
|---|---|
| `tracks_volunteers` | VOLUNTEERS reporting tag visible in entry + Volunteers row on dashboard |
| `tracks_responses` | RESPONSE_STAT visible in entry + Stats row on dashboard |
| `tracks_giving` | GIVING visible in entry + Giving row on dashboard |

> **Note (deferred):** in the tag-first model "what a church tracks" is increasingly
> expressed by which `reporting_tags` and active `metrics` exist. The boolean flags
> are retained for v2.0 as dashboard-row gates to limit blast radius. Superseding
> them with reporting-tag presence is a candidate follow-up (not in this redesign).

ATTENDANCE has no flag — attendance is always tracked.

---

## Completion Logic

Completion is evaluated per **ministry** within a service, then aggregated to the
service.

**A ministry is complete** when every active canonical metric for that ministry tag
(filtered to the church's tracked reporting tags) has a `metric_entry` for the
current `service_instance` with either a non-NULL `value` or `is_not_applicable = true`.

```javascript
// per (service_instance, ministry_tag)
const required = activeCanonicalMetrics(ministryTag)
  .filter(m => churchTracks(m.reporting_tag_code));
const complete = required.every(m =>
  entryExists(m.id, instanceId) &&
  (entry.value !== null || entry.is_not_applicable === true)
);
```

Three states per ministry: **empty** (no entries) · **in-progress** (some entries,
some required metrics still NULL) · **complete** (all required metrics satisfied).
A service is complete when all its ministries are complete.

---

## Navigation Model

Bottom tab bar, role-aware:

| Tab | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| Services | ✅ (T1 root) | ✅ | ✅ | ❌ |
| Dashboard | ✅ (D1) | ✅ (D1) | ❌ hidden | ✅ (D2) |
| Settings | ✅ | ✅ | ❌ | ❌ |

**Three sequencing gates:**
- Gate 1: No location OR no service with a primary tag → setup required, Sunday loop blocked
- Gate 2: Editor at T1 with no schedule versions → empty state, "contact admin"
- Gate 3: Viewer hits any entry URL → silent redirect to D2

---

## The Dashboard

D1 (Owner/Admin) and D2 (Viewer) share a layout: rows for ministries grouped by
`tag_role` (Adults / Kids / Youth), plus tracked metric rows (Volunteers, Stats,
Giving), across four simultaneous time columns (Current Wk · Last 4-Wk Avg ·
Current YTD Avg · Prior YTD Avg). The four standard views read from the views below,
not from raw `metric_entries`.

**Out-of-the-box cross-cutting metrics** (the reason for reporting tags):
- Volunteer-to-attendance ratio = `SUM(VOLUNTEERS) / SUM(ATTENDANCE)`
- Per-capita giving = `SUM(GIVING) / SUM(ATTENDANCE)`
- Weekly average attendance = `AVG(ATTENDANCE)` over weeks with ≥1 active instance

YTD denominator: weeks with ≥1 active instance — not calendar weeks (Rule 2 applies).

---

## Permanent Views (affordance restoration)

The unified model is queried through four views so screen code stays simple and the
old per-kind shapes are reconstructable:

| View | Reconstructs |
|---|---|
| `attendance_per_occurrence` | Per service_instance attendance pivoted by ministry tag_role (the old MAIN/KIDS/YOUTH shape) |
| `volunteers_per_occurrence` | Per service_instance volunteer totals (SUM of VOLUNTEERS metrics) |
| `giving_per_week` | Period-anchored giving totals (SUM of GIVING, by `period_anchor`) |
| `metric_entries_readable` | Every entry joined to metric name, ministry tag name, reporting tag code, service date — the human-readable firehose |

---

## What Was Dropped in v2.0

Migration 0022 (full reset) drops:
- **Entry tables:** attendance_entries · volunteer_entries · response_entries · giving_entries · church_period_giving · church_period_entries
- **Category tables:** volunteer_categories · response_categories · giving_sources
- **Unused parallel subsystem:** occurrences · instance_tags · tag_relationships · service_template_tags (all were 0-row false starts)
- **Functions:** apply_tag_to_instances · add_tag_relationship

Kept: churches · church_locations · church_memberships · church_invites ·
user_profiles · service_templates · service_instances · service_tags ·
service_schedule_versions · ai_usage_* · import_jobs · billing_events ·
notifications_sent. (Data in all kept tables is still wiped by the full reset; only
structure persists. service_templates / service_instances / service_tags are
re-modeled, not dropped.)

---

## Onboarding Sequence (New Church)

New churches sign up via SIGNUP (creates church + owner account + seeds the four
system `reporting_tags`). Gate 1 fails until a location and at least one service with
a primary tag exist.

0. **SIGNUP** — name, owner name, email, password → creates church, owner, seeds reporting tags
1. Church info (pre-filled)
2. **T-loc** — add locations (≥1 required)
3. **T6** — add services + assign primary ministry tag (required per service)
4. **T-sched** — schedule each service
5. **T9** — invite team (optional)
→ T1 unlocks

---

## Key Design Principles

1. **Sunday morning is the primary context.** Every entry screen is phone-first, one hand, mild time pressure.
2. **Service → Ministry → Metrics.** Entry follows the church's mental model, not a fixed column grid.
3. **Two axes, one pipe.** Ministry tags say *who*; reporting tags say *what dimension*; metrics/metric_entries carry the number. Nothing is special-cased by kind.
4. **Tags are stable identity.** A ministry's tag is its reporting identity across name/time/campus changes. Reporting tags make cross-ministry math work out of the box.
5. **Church language, not software language.** Services not occurrences. Ministries not categories. Stats not metrics (in UI copy).
6. **Numbers are people.** Counts represent human beings; copy reflects this.
7. **Instructions need reasons.** Every instructional string is "[what to do] — [why it matters to you]."

---

## Team Rules

**TR-01 — Graph-First on Decision Impact.**
When a decision touches more than one file/screen/query/schema element — read the
graph first, then context, then act. Applies to NOVA · ATLAS · IRIS · ORION · AXIOM
· VERA · SPAN. The god node `service_instances` and the new `metric_entries` are the
highest-blast-radius tables — touch with care.
