# Church Analytics — App Context
## For any agent starting fresh on this build
## Version 1.2 | 2026-04-10

---

## What This Is

A multi-tenant SaaS for churches to track weekly ministry data and view standardised dashboards. Churches log attendance, volunteer counts, stats (decisions, baptisms, custom metrics), and giving every week. They see those numbers as comparisons over time in a dashboard grouped by service tag.

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

**The typical Sunday flow:** An Admin opens the app on their phone at 9am. They tap this week's service. They enter attendance, volunteer counts, stats, and giving. They go home. On Monday the pastor opens the app and sees how the numbers compare to last week.

---

## The Sunday Loop — Core Product

Everything in the product exists to support this flow:

```
T1 (Recent Services)
  └─ tap a service ──→ T1b (Occurrence Dashboard)
                           ├─ tap Attendance ──→ T2 ──→ back to T1b
                           ├─ tap Volunteers ──→ T3 ──→ back to T1b
                           ├─ tap Stats ──────→ T4 ──→ summary ──→ T1b
                           └─ tap Giving ─────→ T5 ──→ back to T1b
```

**T1** shows the last 7 days of services, incomplete first. A church admin on Tuesday can enter data from Sunday without any special flow. Only services with a primary tag set appear in T1 — services without a primary tag are invisible to the Sunday loop.

**T1b** is the hub. It shows four sections (Attendance · Volunteers · Stats · Giving) with completion status per section. The user taps any section to enter or correct data. Back always returns to T1b, not T1.

**The session anchor:** When a user taps a service in T1, the occurrence ID and service date are written to context. T2–T5 read this context — they never ask the user to re-select a service.

---

## The Data Model — Plain English

**One occurrence per service per date.** Every Sunday at 9am generates one `service_occurrences` row. All entry tables hang off this row.

**Entry tables:** `attendance_entries` · `volunteer_entries` · `response_entries` · `giving_entries`. Each has a foreign key to `service_occurrences`.

**Category tables (three parallel patterns):**
- `volunteer_categories` — the roles a church tracks (Parking Team, Greeters, etc.)
- `response_categories` — the stats a church tracks (First-Time Decisions, Rededications, Baptisms, custom). UI calls this "Stats."
- `giving_sources` — where giving comes from (Plate, Online, custom)

All three follow the same pattern: seeded defaults + church can add custom + soft delete via `is_active`.

**Tag tables:**
- `service_tags` — the church's tag library (Morning, Evening, Midweek, custom). Optional date range for time-bounded tags (campaigns, series).
- `service_template_tags` — subtag assignments (many-to-many, junction table)
- `service_occurrence_tags` — tags stamped onto occurrence records at assignment time. This is the reporting table — queries JOIN here, no date arithmetic needed.

**`service_occurrences` is the god node.** Degree 36 in the knowledge graph. Every entry, every query, every completion check flows through it. Do not design anything that bypasses it.

**`service_templates` is degree 26.** Every service in the Sunday loop flows through it. The `primary_tag_id` FK on this table gates T1 — no primary tag = no entry in the Sunday loop.

---

## Six Critical Rules

**Rule 1 — Filter cancelled occurrences.**
Always `WHERE status = 'active'`. Cancelled services never appear in entry flows or dashboard calculations.

**Rule 2 — Dashboard groups by primary tag, not display_name.**
`service_templates.primary_tag_id` → `service_tags.tag_code` is the grouping key for all dashboard rows (P3, P14a/b/c). `display_name` is presentational only — it appears on T1 service cards and T1b headers, never as a reporting key.

**Rule 3 — Volunteer totals are calculated, never stored.**
Always `SUM(volunteer_count)` from `volunteer_entries`. Never store a total.

**Rule 4 — NULL ≠ zero attendance.**
`NULL` means not entered. `0` means confirmed zero. Never `COALESCE(attendance, 0)` in averages — it corrupts the denominator. A church with no kids ministry has NULL kids attendance, not zero.

**Rule 5 — Always SUM giving entries.**
`giving_entries` has one row per `(occurrence, giving_source)`. Always sum across sources to get a service total.

**Rule 6 — Tags are pre-stamped. Never derive at query time.**
`service_occurrence_tags` holds the pre-stamped tag assignments. Dashboard queries JOIN this table. Never re-derive tag membership from `service_template_tags` + date logic at query time — that work is done upfront by `apply_tag_to_occurrences()`.

---

## Five Tracking Flags on the Churches Table

These flags control what a church tracks. All default `true`. Changes made in Settings → What You Track → Tracking.

| Flag | What it controls |
|---|---|
| `tracks_kids_attendance` | Kids field visible in T2 + required for attendance completion |
| `tracks_youth_attendance` | Youth field visible in T2 + required for attendance completion |
| `tracks_volunteers` | Volunteers section shown in T1b + T3 accessible + Volunteers row on dashboard |
| `tracks_responses` | Stats section shown in T1b + T4 accessible + Stats row on dashboard |
| `tracks_giving` | Giving section shown in T1b + T5 accessible + Giving row on dashboard |

**Attendance is always tracked.** `tracks_main_attendance` does not exist.

**Dashboard rows are hidden when tracking is off.** `tracks_volunteers = false` → no Volunteers row on D1/D2. Historical data accessible via tag filter.

---

## Completion Logic

**Attendance (T2):**
```javascript
const complete = row !== null
  && row.main_attendance !== null
  && (!church.tracks_kids_attendance  || row.kids_attendance  !== null)
  && (!church.tracks_youth_attendance || row.youth_attendance !== null)
```
Three states: empty (no row) · in-progress (row exists, tracked field NULL) · complete (all tracked fields filled).

**Volunteers / Stats / Giving:**
EXISTS check — any entry = complete for that section. Binary: exists or doesn't.

---

## UPSERT Everywhere — Except Giving History

Every entry screen uses UPSERT (INSERT ON CONFLICT DO UPDATE). Giving uses one row per `(occurrence, giving_source)` with UPSERT — one editable row per source, not append-only.

---

## Service Tags — How They Work

Tags are the stable reporting identity for services. A service might change its name from "9am Service" to "Contemporary Service" — but if both have the Morning tag, the dashboard treats them as the same service across time.

**Primary tag (one per service, required):**
- Set in T6 service setup. Required before the service appears in T1.
- Only undated tags (no `effective_start_date` or `effective_end_date`) can be primary.
- Drives dashboard rows: Morning row, Evening row, Midweek row.

**Subtags (many per service, optional):**
- Set in T6 or T-tags. Campaigns, series, special groupings.
- Can have date ranges — only stamps occurrences within that date window.
- Used for dashboard drill-down filters after primary tag row is selected.

**Stamping:** When a tag is assigned to a service, `apply_tag_to_occurrences()` runs immediately — stamps all matching historical occurrences into `service_occurrence_tags`. Future occurrences are stamped at creation time.

**Removal:** UI prompts — "Remove from all records" (deletes stamps) or "Keep past records tagged" (preserves stamps, removes assignment only).

**`active_tagged_services` view** gates T1 — P12 and P12b JOIN through it. Services without `primary_tag_id` never appear.

---

## Navigation Model

Bottom tab bar, role-aware:

| Tab | Owner | Admin | Editor | Viewer |
|---|---|---|---|---|
| Services | ✅ (T1 root) | ✅ | ✅ | ❌ |
| Dashboard | ✅ (D1) | ✅ (D1) | ❌ hidden | ✅ (D2) |
| Settings | ✅ | ✅ | ❌ | ❌ |

**Three sequencing gates:**
- Gate 1: No location OR no service without primary tag → setup required, Sunday loop blocked
- Gate 2: Editor at T1, no schedule versions → empty state, "contact admin"
- Gate 3: Viewer hits any entry URL → silent redirect to D2

---

## The Dashboard

D1 (Owner/Admin) and D2 (Viewer) use the same layout:

```
                  This Wk / Last Wk    4-Wk Avg / Prior    YTD / Prior YTD
Morning           312 / 287  ▲9%       298 / 271  ▲10%     305 / 289  ▲6%
Evening            98 / 91   ▲8%       ...                  ...
[Volunteers]       24 / 21   ▲14%      ...                  ...  ← hidden if tracks_volunteers=false
[Stats]             7 / 4    ▲75%      ...                  ...  ← hidden if tracks_responses=false
[Giving]       $5,247/$4,800 ▲9%       ...                  ...  ← hidden if tracks_giving=false
```

**Rows** = active primary tags (Morning, Evening, Midweek) + tracked metrics below.
**Columns** = three comparison periods shown simultaneously, no toggle.
**Drill-down** = click primary tag row → audience breakdown (Main/Kids/Youth) → subtag filter.

D2 (Viewer) shows Attendance rows + Stats + Giving only. No Volunteers row.

YTD denominator: weeks with at least one active occurrence — not calendar weeks.

---

## Onboarding Sequence (New Church)

New churches sign up via the SIGNUP screen (creates church + owner account + seeds defaults).
Gate 1 fails until Steps 2, 3, 4 complete and at least one service has a primary tag.

0. **SIGNUP** — new church creates account (name, owner name, email, password)
1. Church info (name — pre-filled from SIGNUP)
2. **T-loc** — add locations (at least one required)
3. **T6** — add services + assign primary tag (required per service)
4. **T-sched** — set schedule for each service (loops until all services scheduled)
5. **T9** — invite team (optional)
→ T1 unlocks

---

## Settings Structure

Three groups in T-settings:
- **Your Church** — Locations (T-loc) · Services (T6)
- **Your Team** — Members · Invite someone (T9)
- **What You Track** — Tracking (T6b) · Volunteer Roles (T7) · Stats (T8) · Giving Sources (T-giving-sources) · Tags (T-tags)

---

## Stats — The Renamed "Responses"

What was "Responses" in the schema is called "Stats" in the UI. Schema names unchanged (`response_categories`, `response_entries`, `tracks_responses`).

Stats have two scopes set at creation:
- **Audience-scoped** — entered per MAIN/KIDS/YOUTH in T4 sections. Seeded defaults are audience-scoped.
- **Service-level** — one number for the whole service. Custom stats can be either scope.

---

## Team Rules

**TR-01 — Graph-First on Decision Impact.**
When a decision is made that affects other decisions, screens, queries, or schema — read the graph first. Then read context. Then act. Applies to: NOVA · ATLAS · IRIS · ORION · AXIOM · VERA · SPAN.

---

## Key Design Principles

1. **Sunday morning is the primary context.** Every entry screen is designed for phone, one hand, mild time pressure.
2. **Pastoral moments are not transactional.** The T4 post-submit summary is a full-screen green moment of acknowledgment.
3. **Instructions need reasons.** Every instructional copy string includes a plain-English reason why. Format: "[what to do] — [why it matters to you]."
4. **Church language, not software language.** Services not occurrences. Roles not categories. Stats not metrics. Decisions not conversions.
5. **Numbers are people.** Attendance counts and decision counts represent human beings. Copy reflects this.
6. **Tags are stable identity.** A service's primary tag is its reporting identity across time. Name changes, time changes, campus additions — the tag is what makes year-over-year comparison work.
