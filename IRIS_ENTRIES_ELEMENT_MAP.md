## Status: Complete (design) — Pending build
## Version: 1.0
## Pending revisions: cadence-aware input controls (N-4) + completion rule (N-6) finalize at build
## Last updated: 2026-06-02

# IRIS Element Map — ENTRIES screen (#36 weekly/period data entry)

**Owner:** IRIS · **Build lead:** NOVA · **Gate:** SAGE
**Reference mockup (NOT wired):** `sunday-tally/src/app/mockup/weekly-entry/page.tsx` (route `/mockup/weekly-entry`)
**Target route (build):** `/(app)/entries` (replaces old `/services` list + per-service T1–T5 entry — D-085)
**Design decisions:** D-072 … D-088 in `SCHEMA_CUTOVER_STATUS.md` (read those first)

> This screen is the church's weekly data-entry hub. Everything on it is schema/config-driven —
> the demo values (Experience/LifeKids/Switch, 420, etc.) are placeholders in dynamic slots.
> A church with different services/ministries/metrics renders a different screen from the same code.

---

## Purpose & Core Loop
An editor signs in → lands on their church + their **default campus** (D-088) → the current **week** is selected → they enter each occurrence's per-ministry numbers and the week's church-wide stat entries. Save is per-field autosave. Totals are derived, never stored.

## Roles (church_memberships.role)
| Role | On this screen |
|---|---|
| owner / admin / editor | Full read + write (enter/edit values, toggle N/A, edit include-in-total) |
| viewer | **Read-only** — sees values & totals; all inputs disabled, no autosave, no toggles |

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| Church | session → `church_memberships` | tenant scope on every query (`church_id`) |
| Campus | `church_memberships.default_location_id` (D-088) | fallback = first active `church_locations` by sort_order. **Switched on the Locations page, NOT inline here** (header pill is context only) |
| Week | `sunday_last_active` restore pointer; else current week | week anchor = that week's **Sunday** (D-080) |

## Data Dependencies (gated build migration package — N-1, not yet applied)
- `service_template_tags` (NEW, migration 0028) — service↔ministry composition (D-073)
- `metric_entries.location_id` (NEW, nullable FK→church_locations, null=church-wide) (D-087)
- `church_memberships.default_location_id` (NEW, nullable FK→church_locations) (D-088)
- `metrics` cadence attribute (NEW: DAY|WEEK|MONTH enum, MVP) (D-085)
- Existing: `service_templates`(+location_id), `service_instances`(+location_id), `service_tags`(tag_role,parent_tag_id), `reporting_tags`, `metrics`(ministry×reporting×scope,is_canonical,code), `metric_entries`(value, XOR service_instance_id/period_anchor, is_not_applicable, reporting_tag_code), `churches.grid_config`(jsonb prefs)
- Views: `attendance_per_occurrence`, `volunteers_per_occurrence`, `giving_per_week`, `metric_entries_readable`

---

## Navigation — Tabs (one control)
`[Totals] [<occurrence 1>] [<occurrence 2>] … [Stat Entries]`
- **Occurrence tabs** = that week's `service_instances` for the active campus (count is dynamic). Label = service time / name.
- **Totals** = read rollup view (leading tab).
- **Stat Entries** = period/church-wide entry (trailing tab).
- Each tab carries a **status circle** (E-50) reflecting that section's completeness.

---

## Element Map

### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | Church name + "ENTRIES" eyebrow | `churches.name` | — | all |
| E-2 | Campus pill (`📍 <name> ▾`) | active campus name | static context; click → Locations page (not a live dropdown here) | all |
| E-3 | Week navigator (`‹ Week of <date> ›`) | selected week | prev/next shifts week; updates `sunday_last_active` | all |

### Zone B — Completion strip
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-4 | "N of M complete" text | derived: M = # sections (occurrences + Stat Entries); N = # sections complete (see Completion Logic) | dynamic count | all |

### Zone C — Tabs
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-5 | Totals tab | — | active/inactive | all |
| E-6 | Occurrence tab (×N) | `service_instances` (week, campus) | active/inactive + status circle E-50 | all |
| E-7 | Stat Entries tab | church period metrics exist | active/inactive + status circle E-50 | all |

### Zone D — Totals view (E-5 active) — all derived, never stored
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Grand-total hero (attendance) | SUM(metric_entries.value) WHERE reporting=ATTENDANCE, week, campus, **ministry included per grid_config** (D-082/083) | live recompute | all |
| E-11 | Edit-totals round pencil | opens E-12 | hover-only circle | **editor+** (hidden/disabled for viewer) |
| E-12 | Include-in-total panel | per-ministry checkbox; **persists to `churches.grid_config`** (D-083) | open/closed; saving; "Saved for the church" | editor+ |
| E-13 | Ministry summary cards (×ministry) | per-ministry rollups across week's sittings (D-081): attendance summed (e.g. 9:00+10:30), + that ministry's other canonical metrics | excluded ministry → muted + "Not in total" | all |

### Zone E — Occurrence view (E-6 active) — ministry-first (D-078)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-20 | Ministry card (×ministry) | ministries tagged to this occurrence's template via `service_template_tags` (D-073); equal peers (D-076); ordered by `sort_order` | met / "didn't meet"(N/A) | all |
| E-21 | Role label (`· Adults/Kids/Youth`) | `service_tags.tag_role` | — | all |
| E-22 | Metric field (instance) | this ministry's **canonical** `metrics` (scope='instance'); only its own metrics show (D-079) | see E-40 states | editor+ writes |
| E-23 | Volunteers group + calculated subtotal | multiple VOLUNTEERS-tagged metrics; subtotal = SUM (calculated, never stored — rule #3, D-079) | collapsed/expanded | editor+ |
| E-24 | "Didn't meet?" toggle | sets all this ministry's entries `is_not_applicable=true` (rule #4: NULL≠0≠N/A) | met / N/A | editor+ (hidden for viewer) |
| E-25 | Card status circle | E-50, per-card completeness | — | all |

### Zone F — Stat Entries view (E-7 active) — period/church-wide (D-078)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-30 | "period totals · church-wide" header | — | — | all |
| E-31 | Stat field (period) | church period `metrics` (scope='period'); writes `metric_entries.period_anchor` (+location per D-087 if per-campus, else null=church-wide) | see E-40 | editor+ |
| E-32 | Cadence indicator (DAILY/WEEKLY/MONTHLY) | `metrics` cadence attr (D-085, MVP enum) | read-only tag | all |

### Shared component
| E# | Element | Behaviour |
|----|---------|-----------|
| E-40 | Autosave Field | input right-aligned, tabular numerals; **status indicator to the LEFT of the input** (boxes align); states: **empty**, **needs entry**(amber, when required+empty), **saving…**, **Saved ✓**(sage). Autosave on blur = one idempotent upsert (uq_metric_entry). Perf contract N-2. |
| E-50 | Status circle | 3 states, outline style: **gray outline**=not started · **orange outline**=needs entries · **green check**=complete (D-084). Used on tabs (E-6/E-7), cards (E-25), completion logic. |

---

## Completion Logic (N-6 — finalize at build; proposed)
- A **ministry card** is *complete* when every canonical instance-metric for it has a `metric_entries` row for this occurrence (a row with `is_not_applicable=true` counts as done).
- An **occurrence** is complete when all its ministry cards are complete (or marked N/A).
- **Stat Entries** complete when every church period metric has an entry for the current period.
- E-4 count: M = occurrences + 1 (Stat Entries); N = complete sections.

## Cadence-aware inputs (N-4 — OPEN, finalize at build)
Stat field control adapts to `metrics` cadence (D-085): **WEEKLY** = 1 box/week · **DAILY** = 7 per-day boxes (Mon–Sun) for selected week · **MONTHLY** = 1 box spanning the month (locks to the month the week falls in; doesn't reset weekly). Mock shows single boxes for all three. Monthly canonical anchor + weekly-grid rendering still to lock (see D-085 open conventions).

---

## NOVA Items (build tasks / risks)
- **N-1** Apply gated migration package: `service_template_tags` (0028) + `metric_entries.location_id` + `church_memberships.default_location_id` + `metrics` cadence enum. FELIX validates (RLS, FKs, idempotent backfill from `service_templates.primary_tag_id`); SAGE gates. **TR-01: `service_templates` is a god node — read graph for blast radius first.**
- **N-2** Autosave: optimistic + async, one row upsert on `uq_metric_entry`, per-field debounced on blur, inline error+retry preserves value. **Perf contract: commit p95 < ~300ms, UI never blocks, every save shows confirmed/failed** (D-080). If unmet → fallback explicit Save-week.
- **N-3** Week-scoped session: anchor = week's Sunday; restore via `sunday_last_active`; empty/expired session on a sub-tab → redirect to week/Totals, never throw.
- **N-4** Cadence-aware input controls (daily 7-box / weekly 1 / monthly month-span) — design + build.
- **N-5** Active-campus resolution: `church_memberships.default_location_id` → fallback first active `church_locations`. Campus switch lives on Locations page. Scope ALL queries by campus.
- **N-6** Implement completion logic (above) + drive E-50 + E-4.
- **N-7** All rollups via views + `metric_entries`; **filter by church_id + campus + date/period range + paginate past the 1000-row PostgREST cap** (the History bug, D-063 — do not repeat).
- **N-8** Include-in-total preference: read/write `churches.grid_config`; never mutates `metric_entries` (D-083).
- **N-9** Role gating: viewer = read-only (inputs disabled, E-11/E-12/E-24 hidden).
- **N-10** Retire old `/services` + T2–T5 routes; update `NAV_MANIFEST.json` / `FLOW_REPORT.md` (Dashboard · Entries · History · Settings).

## Query Patterns to author (→ QUERY_PATTERNS.md, N-7)
QP-ENTRIES-WEEK (week's instances by church+campus) · QP-ENTRIES-MINISTRIES (ministries via service_template_tags) · QP-ENTRIES-CANONICAL-METRICS (per ministry, scope=instance) · QP-ENTRY-UPSERT (uq_metric_entry) · QP-OCC-TOTAL · QP-DAY-TOTAL (group by template+date) · QP-GRAND-TOTAL (included ministries per grid_config) · QP-MINISTRY-ROLLUP · QP-STAT-ENTRIES (period, cadence-aware, +location) · QP-COMPLETION. All: tenant + campus + range filters, paginated.

## Open Items
- O-1 Completion rule (N-6) — confirm proposed definition.
- O-2 Cadence input behaviour (N-4) + monthly canonical anchor + History rendering per cadence (D-085).
- O-3 Per-campus vs church-wide period stats default (D-087) — MVP = church-wide.
- O-4 Demo data: duplicate empty "Main" `church_locations` row — clean up (D-086).

## Decision References
D-072 (no is-ministry flag) · D-073 (service_template_tags) · D-074 (occurrence total derived) · D-075 (template-level composition) · D-076 (equal-peer ministries) · D-077 (rollup = reporting pref) · D-078 (ministry-first, two-zone) · D-079 (per-ministry metrics/volunteers/N-A) · D-080 (week session + autosave) · D-081 (day total by template+date) · D-082 (grand total summed) · D-083 (include-in-total saved pref) · D-084 (UI↔schema binding, design lock) · D-085 (cadence Day/Week/Month + backlog) · D-086 (locations = dimension, church-wide schema) · D-087 (location_id on metric_entries) · D-088 (per-user default location).
