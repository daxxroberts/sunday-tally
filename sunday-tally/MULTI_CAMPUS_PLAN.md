> **STATUS: PARKED / OPEN FEATURE — approved direction, NOT yet built (parked 2026-06-30).**
> Nothing in this document is implemented. It is a decided blueprint to return to later.
> Migrations are described as **FILES flagged NEEDS-APPROVAL** — do not apply schema from this doc
> without Daxx's explicit go-ahead.
>
> **Locked decisions (the three forks settled at planning time):**
> 1. **Deliverable** = design blueprint + phased roadmap (this doc), not an immediate full build.
> 2. **Giving** = per-campus that **rolls up** to a church-wide total — **this REVISES locked decision D-086.**
> 3. **History** = church-wide **weekly roll-up** + per-campus **occurrence grid**.

# Multi-Campus for Sunday Tally — Architecture Blueprint & Roadmap

## Context

Sunday Tally today leads every church into a single **church-wide** standard dashboard; campuses
exist as data (`church_locations`) but there is no way to *see* a campus on its own, and no way for
a campus to track anything the church-wide setup didn't define. Daxx wants a model where:

- A **church-wide setup** defines high-level, ministry-based "requests" (~70% of what every campus
  tracks) — the parent/network layer.
- Each **campus** automatically inherits those church-wide requests (shown locked), and can **extend**
  them: add per-campus *breakouts* of a church-wide metric, add its own *occurrences/service times*,
  and add **campus-unique ministries** that do **not** roll up to church-wide.
- The **dashboard** stays church-wide by default but gains a **per-campus filter**, with church-wide
  leaning on a reporting/comparison view.
- The **History** tab reads as a **weekly roll-up** church-wide and a **per-occurrence grid** per campus.
- Eventually each campus gets its own **Tally AI** screen scoped to its metrics.

**Intended outcome:** a coherent model Daxx can react to and refine, plus a phased build sequence —
not an immediate full build. The good news from exploration: **~80% of the plumbing already exists.**

---

## How Sunday Tally works today (the parts that matter here)

**Occurrences are already per-location.** `service_instances` (renamed from `service_occurrences` in
migration 0019; the god node) carries `location_id`, inherited from `service_templates.location_id` at
get-or-create time (`src/app/api/occurrences/route.ts`). `service_templates.location_id` is
**nullable — NULL = church-wide** (migration 0036). So Daxx's example (South 9/10:30am, North
10/11/3pm) is *already* expressible: per-campus templates → per-campus occurrences.

**Entries are already per-location.** `metric_entries.location_id` is backfilled from the occurrence.
The aggregation views `attendance_per_occurrence` and `volunteers_per_occurrence` (migration 0045)
**already project `si.location_id`** — so campus filtering is "add a WHERE", not "rebuild the view."

**RLS is already location-aware.** Migration 0042 added `church_memberships.location_scope`
('all' | 'restricted'), a `church_membership_locations` junction, and `user_can_see_location()`.
Crucially: **NULL location_id is visible to everyone = "church-wide".** A guardrail trigger keeps at
least one all-campus owner.

**But ministries are church-wide ONLY.** `service_tags` (the ministry tree: `tag_role`, `parent_tag_id`,
`color`, `display_order`) has `church_id` and **no `location_id`** — confirmed across every migration.
One tree, seen identically at every campus. **This is the central gap.**

**Roll-ups are computed on read in TypeScript**, not SQL:
- `fetchDashboardData(churchId, tracks, asOf?)` (`src/lib/dashboard.ts:309`) — **no location param.**
- `computeRollups(supabase, churchId, from, to)` (`src/lib/rollups.ts:68`) — walks the
  `metrics.parent_metric_id` tree, applies `rollup_op` (sum/avg/max). **No location filter.**
- The dashboard renders a **locked "All campuses" toggle (E-3)** with a "coming soon" tooltip — UI real
  estate already reserved.

**Giving is locked church-wide** (decision D-086): `giving_per_week` is the one view with **no**
`location_id`. The decision above changes that.

**Setup** is a tabbed workspace at `/settings/setup` (`?tab=services|locations|track|totals`, lazy-mount +
keep-alive). "What we track" = the ministry editor at `src/app/(app)/settings/track/page.tsx`
(two-panel tree + metric detail).

---

## The model

### One central schema change: location-scoped ministries

Add a nullable `location_id` to `service_tags` (FK → `church_locations`, **NULL = church-wide**) — the
*exact* pattern already proven on `service_templates`. Every tag's locality, and a tag's kind, follow from this:

| Kind | `location_id` | `parent_tag_id` | Behavior |
|---|---|---|---|
| **Church-wide ministry** | NULL | NULL or another NULL tag | Defined once; inherited (locked) at every campus; church-wide total = SUM across campuses. |
| **Campus breakout** | = campus | a **church-wide** tag | Shows only at that campus; its metric points at the church-wide parent's rollup, so it **rolls up into** the church-wide total. |
| **Campus-unique ministry** | = campus | NULL or a campus tag | Shows only at that campus; linked to no church-wide rollup, so **excluded** from church-wide totals. |

**Metrics need no `location_id`.** A metric belongs to a `ministry_tag_id`; it inherits the tag's locality.
A church-wide metric is entered at every campus (per occurrence) and already produces per-campus data via
`metric_entries.location_id`. A campus-specific metric on a shared ministry is modeled as a **breakout**,
not a location-scoped metric — keeps the model clean.

### The elegant consequence: church-wide vs per-campus is mostly a read-time filter

- **Per-campus read** = filter `metric_entries.location_id = <campus>`. Naturally includes that campus's
  slice of church-wide ministries + its breakouts + its unique ministries.
- **Church-wide read** = no location filter; the per-ministry **card list** = NULL-location tags only.
  Campus-unique roots are absent (nothing links them up); breakouts are summed into their parents, not
  shown as separate church-wide lines.
- **Card list per campus** = NULL-location tags (inherited, locked) **+** that campus's location-scoped tags.

Breakout roll-up reuses existing wiring: `createMinistry()` already calls `inheritRollupsFromParent()` /
`autoLinkToNearestAncestorServices()`, so a breakout created under a church-wide parent auto-links its
metric into the parent's rollup.

### Giving: per-campus, rolls up to church-wide (revises D-086)

- Attribute giving to a campus: instance-scoped giving already carries location via the occurrence;
  **add `location_id` to period (weekly) giving entries** (nullable; NULL = church-wide/unallocated).
- Build a **location-aware giving view** (`giving_per_week` gains `location_id`, or a sibling
  `giving_per_week_by_location`). Church-wide giving = SUM across campuses (rolls up); per-campus = filter.
- **This revisits locked decision D-086** → requires a `DECISION_REGISTER.md` entry and the SAGE/GROVE gate.

### Occurrences & schedules: no schema change

Already per-location. The South/North different-times example works today. Setup just needs to *surface*
each campus's services under that campus.

---

## What each surface looks like

### Setup — church-wide vs per-campus "What we track"

Add a **campus context switcher** to the Setup workspace (URL `?campus=all|<id>`, mirroring `?tab=`):

- **All campuses (church-wide)** → today's editor. Defines the church-wide ministry tree + metrics =
  the "requests" every campus must answer.
- **A specific campus** →
  - Church-wide nodes render **grayed/locked** with a chip like *"Counted at every campus"* — not
    renamable, not removable (it's the church-wide request).
  - **"Add a breakout"** under a church-wide node → campus-scoped child that rolls up.
  - **"Add a ministry just for [Campus]"** → campus-scoped root that does **not** roll up.
  - Services/schedules tab filtered to that campus (already per-location).

`track/actions.ts` gains location-aware `createMinistry`/`addCount` (stamp `location_id`; breakouts
inherit parent rollup wiring). New UI states (locked rows, switcher, add-breakout) **need IRIS element-map
additions** — flag, can't author copy/architecture alone.

### Dashboard — church-wide default + per-campus filter

- Unlock **E-3**: "All campuses" + each active campus.
- Thread a `locationId?` through `fetchDashboardData()` and `computeRollups()` (church-wide when
  undefined → fully backward-compatible). Views already project `location_id`; add the filter.
- `fetchActiveServiceTags` becomes location-aware (church-wide: `location_id IS NULL`; per-campus:
  `IS NULL OR = <campus>`).
- Per-campus customization: the summary-card metric selection is already per-user localStorage keyed
  `{user_id}:{church_id}` — **extend the key to include `location_id`** so each campus view is customized
  independently.
- **Church-wide leans on reporting:** a later cross-campus comparison surface (campus A vs B vs C
  columns) is the natural home for `ReportingMetrics` (ratios already computed, no UI yet).

### History — weekly roll-up church-wide, occurrence grid per campus

- **Church-wide** = a **weekly roll-up grid**: one row per week (Sunday anchor), columns = church-wide
  ministries (breakouts summed in), values = totals across all campuses. **Read-only** (you edit at the
  campus/occurrence level). This is a new `derive_grid_config` variant.
- **Per-campus** = today's **occurrence grid** filtered to `service_instances.location_id = <campus>`,
  columns = that campus's services + inherited + unique ministries. **Editable** (data entry happens here).
- Campus switcher mirrors the dashboard.

### Tally AI — per campus (later)

Migration 0035 already added `widget_location_views` (prior art for location-scoped widget data). A
per-campus AI screen = the per-church context pack (see `AI_WIDGET_BUILDER_PLAN.md`) **scoped to a
location**: that campus's ministries (inherited + unique), services, occurrences, and entries. Church-wide
AI keeps the full roll-up context. Rides on the location-aware read path from earlier phases.

---

## Roll-up semantics (the precise rules)

1. **Church-wide ministry** (tag `location_id` NULL): inherited & locked everywhere; church-wide total =
   SUM of all campuses' entries.
2. **Campus breakout** (tag `location_id` = campus, parent = church-wide tag): shows only at that campus;
   rolls up into the church-wide parent via `parent_metric_id`.
3. **Campus-unique ministry** (tag `location_id` = campus, no church-wide ancestor): shows only at that
   campus; never in church-wide totals.
4. **Per-campus read** = `metric_entries.location_id = campus`. **Church-wide read** = no location filter;
   card list = NULL-location tags only.
5. **NULL ≠ 0 still holds** — a campus with no service in a given week must be *absent* from that week's
   average, never averaged as 0 (Critical Rule 4). This is the single highest-risk correctness point for
   per-campus averages.

---

## Phased roadmap

**Phase 0 — Schema + read-path foundation (no visible UI change).**
- Migration: `service_tags.location_id` (nullable, FK, NULL = church-wide); backfill existing tags to NULL
  (zero behavior change); partial-unique `code` indexes per (church, location) following the 0036 pattern;
  extend the 0042-style SELECT policy to `service_tags` so restricted members see church-wide + their campus.
- Migration: giving `location_id` on period entries + location-aware giving view (rolls up). Revises D-086.
- Thread `locationId?` (default church-wide) through `fetchDashboardData`, `computeRollups`,
  `fetchActiveServiceTags`. Pure plumbing; existing single-campus churches render identically.

**Phase 1 — Dashboard per-campus filter (quick, high-value win).** Unlock E-3; wire campus → `locationId`;
per-campus card list; per-campus summary customization.

**Phase 2 — Setup: church-wide vs per-campus "What we track".** Campus switcher; locked church-wide rows;
add-breakout / add-campus-ministry; location-aware `track/actions.ts`. (IRIS map additions required.)

**Phase 3 — History: weekly roll-up + per-campus grid.** New `derive_grid_config` weekly variant; branch
`loadData()`; campus switcher.

**Phase 4 — Per-campus Tally AI + church-wide Reporting/comparison surface.**

Phases 0→1 deliver a usable per-campus dashboard fast. The genuinely new architecture (inheritance) lands
in Phase 2.

---

## Critical files

| File | Change |
|---|---|
| `supabase/migrations/00XX_ministry_location_scope.sql` *(new, NEEDS-APPROVAL)* | `service_tags.location_id` + backfill + unique indexes + RLS. |
| `supabase/migrations/00XX_giving_per_campus.sql` *(new, NEEDS-APPROVAL)* | period-giving `location_id` + location-aware giving view (revises D-086). |
| `src/lib/dashboard.ts` | `fetchDashboardData` + `fetchActiveServiceTags` gain `locationId?`; location filters on view/entry queries. |
| `src/lib/rollups.ts` | `computeRollups` filters descendant-entry fetch by `location_id`. |
| `src/app/(app)/dashboard/page.tsx` | Unlock E-3; pass campus → `locationId`; per-campus card list + summary key. |
| `src/app/(app)/settings/setup/page.tsx` | Campus switcher (`?campus=`). |
| `src/app/(app)/settings/track/page.tsx` + `track/actions.ts` + `track/components/*` | Locked church-wide rows; add-breakout / add-campus-ministry; location-aware writes. |
| `src/app/(app)/history/page.tsx` + `src/lib/history/derive_grid_config.ts` | Weekly roll-up vs per-campus grid + campus switcher. |
| IRIS maps (D1, T_TRACK/T_TAGS, History, T_LOC) | Extend for new states *(needs authoring — flag in BUILD_FLAGS).* |

Reuse what exists: the `service_templates.location_id` NULL=church-wide pattern (0036), `user_can_see_location()`
(0042), the `?tab=` deep-link convention, `InlineEditField`, and the `inheritRollupsFromParent()` wiring.

---

## Risks & guardrails to honor

- **TR-01 / blast radius:** `service_tags` is a near-god node — open `graphify-out/graph.html` and check
  what connects before changing it.
- **6 Critical Rules**, especially NULL ≠ 0 in per-campus averages (rule 4 above), `status='active'`,
  group by `tag_code`, SUM giving per occurrence.
- **Backward compatibility:** single-campus churches must be unaffected — NULL-location everything = today.
  Hide campus switchers when only one active location exists.
- **RLS:** restricted members must see church-wide (NULL) + their campus tags; preserve the all-campus-owner
  guardrail.
- **Process gates:** giving change → `DECISION_REGISTER.md` (D-086 revision) + SAGE gate; new UI copy →
  GROVE humanizer; new screens/states → IRIS maps before build; migrations stay **files + NEEDS-APPROVAL**,
  never applied from here.

---

## Verification (per phase, end-to-end)

Use the existing demo church + add a **second campus** with different service times.

- **Phase 0:** existing church renders identically (NULL-location). Unit-test `fetchDashboardData`
  with/without `locationId` on a seeded two-campus church; build green.
- **Phase 1:** seed two campuses with different attendance → church-wide = sum; per-campus = slice; a
  campus dark one week is **not** averaged as 0.
- **Phase 2:** create a breakout under a church-wide ministry at South → rolls into church-wide parent
  total **and** shows only at South; create a campus-unique ministry → never appears church-wide.
- **Phase 3:** church-wide History = weekly totals (read-only); per-campus = editable occurrence grid.
- Verify in the live preview (dashboard, Setup, History) with the preview tools; confirm build + types green.
