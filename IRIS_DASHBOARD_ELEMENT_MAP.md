## Status: Complete (design) — Pending build (redesign of an already-wired screen)
## Version: 1.0
## Pending revisions: location roll-up control (N-3) + per-ministry rollup model (N-5) + cadence-aware reporting metrics (N-7) finalize at build
## Last updated: 2026-06-03

# IRIS Element Map — DASHBOARD screen (#62 D1 full dashboard + D2 viewer summary)

**Owner:** IRIS · **Build lead:** NOVA/PIXEL · **Gate:** SAGE
**Reference look (wired + verified):** `sunday-tally/src/app/(app)/entries/page.tsx` + `entries/ui.tsx` (reuse primitives)
**Target routes (build):** `/(app)/dashboard` (D1, editor/admin/owner) · `/(app)/dashboard/viewer` (D2, viewer)
**Existing data layer (DO NOT break):** `sunday-tally/src/lib/dashboard.ts` (`fetchDashboardData`) + `sunday-tally/src/lib/dashboardPrefs.ts` (summary-metric visibility)
**Design system:** `DESIGN_SYSTEM.md` DS-1…DS-25 (this is a *redesign to the Entries look*, not a rebuild)
**Design decisions:** D-053, D-055, D-062, D-074, D-077, D-081, D-082, D-083, D-085, D-086, D-087, D-088 in `SCHEMA_CUTOVER_STATUS.md` (read those first)

> This screen is the church's read-only overview. It is the mirror of Entries: Entries *captures* per-ministry
> atoms; Dashboard *rolls them up* across time windows. Everything is schema/config-driven — the demo values
> (Experience/LifeKids/Switch, 1,264, etc.) are placeholders in dynamic slots. A church with different
> ministries/metrics/campuses renders a different dashboard from the same code. **This is a visual + context
> redesign over the existing `dashboard.ts` data layer — the 4-window math and `DashboardData` shape are preserved.**

---

## Purpose & Core Loop
A user signs in → lands on their church + their **default campus** (D-088) → sees the headline KPIs (this week vs prior),
a calm 4-window comparison table (this week / last-4-wk / curr-YTD / prior-YTD), a Key Metrics strip of out-of-box
reporting ratios, and per-ministry breakdown cards. Everything is **derived, never editable** (DS-9). The only writes on
the page are the church-wide *include-in-total* preference (`churches.grid_config`, D-083) and the per-user *which-summary-
metrics-to-show* preference (`dashboardPrefs`, localStorage). No metric_entries are ever written here.

## Roles (church_memberships.role)
| Role | On this screen |
|---|---|
| owner / admin / editor | Full D1: all KPIs, 4-window table, Key Metrics, per-ministry cards, Volunteer breakout, include-in-total edit (E-22) |
| viewer | D2 (`/dashboard/viewer`) — **no Volunteers anywhere** (D-026), no include-in-total edit, no per-user customize; attendance + giving + decisions only. Re-auth note at foot (D-048) |

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| Church | session → `church_memberships` | tenant scope on every query (`church_id`) |
| Campus | `church_memberships.default_location_id` (D-088); fallback = first active `church_locations` by sort_order | header pill is **context only** — campus is switched on the Locations page, NOT inline (DS-13). Plus an **"All campuses" roll-up** toggle is allowed here because a dashboard naturally spans campuses (D-086). See N-3 |
| Today | browser `new Date()` | drives the window boundaries in `buildBoundaries` (D-053/D-055) |
| Tracks flags | `churches.tracks_volunteers / tracks_responses / tracks_giving` | gate which rows/cards/KPIs render |

---

## The 4 windows (preserve — D-053 / D-055)
`dashboard.ts` already computes every metric as a `FourWin`:
`w` = current week · `m4` = avg of last-4 completed weeks · `ytd` = avg of weeks this year through this week ·
`priorYtd` = avg of same span last year · `delta_w_m4` (w vs 4-wk %) · `delta_ytd_prior` (YTD vs prior-YTD %).
Column headers on the comparison table: **Curr Wk · Last 4-Wk · Curr YTD · Prior YTD**. NULL ≠ 0 (a week with only-null rows
is excluded from its average — never coalesced). **Comparisons hide until ≥2 weeks of data** (`weeksWithData < 2` → `hideComparisons`).

---

## Out-of-box reporting metrics (Key Metrics strip — D-085 reporting tags, #62 Builder request)
Already produced by `dashboard.ts.reportingMetrics` as three `FourWin`s, each null-safe (denominator null/0 → null, no divide-by-COALESCE-0):
- **Avg Weekly Attendance** = avg total attendance over weeks with ≥1 active instance (`weeklyAvgAttendance`).
- **Volunteers / Attendance %** = SUM(VOLUNTEERS)/SUM(ATTENDANCE)×100 (`volToAttendancePct`) — **gated on tracks_volunteers; never on D2**.
- **Per-Capita Giving** = SUM(GIVING)/SUM(ATTENDANCE) currency (`perCapitaGiving`) — gated on tracks_giving.

---

## Element Map

### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | Brand mark + "DASHBOARD" eyebrow + church name | `churches.name`; "ST" tile (#4F6EF7) like Entries header | — | all |
| E-2 | Campus pill (`📍 <name>`) | active campus name (resolved per N-2) | **context indicator** (title="Campus is selected on the Locations page"); click → Locations page. NOT a live dropdown (DS-13) | all |
| E-3 | Campus scope toggle (`This campus ▾ / All campuses`) | active campus vs church-wide | switches the dashboard between the active campus and an all-campuses roll-up (D-086). Re-runs the fetch with/without a campus filter. **Distinct from E-2** (E-2 = which campus; E-3 = whether to roll up) | all |
| E-4 | Today chip (`Tue, Jun 3`) | `new Date()` | static; neutral slate metadata tag (DS-16) | all |

### Zone B — Highlight KPI cards (current vs prior week)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Attendance KPI | `data.highlights.attendance` {current, prior} | big `font-num` number + delta vs prior week; top accent bar brand-blue (DS-5) | all |
| E-11 | Giving KPI | `data.highlights.giving` (prefix `$`) | accent emerald-as-sage; hidden if `!tracks_giving` | all (incl. viewer) |
| E-12 | Serving KPI | `data.highlights.volunteers` | accent violet (kids/category lane); hidden if `!tracks_volunteers`. **Never on D2** (D-026) | **editor+ only** |
| E-13 | Highlight delta | `highlightDelta(h)` = (current−prior)/prior×100 | up/down **arrow + sign + %**; **NO RED** — up = sage, down = amber, null = muted dash (DS-2/DS-18). Pair arrow shape with color | all |

### Zone C — Comparison column headers
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-20 | 4-col header row (Curr Wk · Last 4-Wk · Curr YTD · Prior YTD) | static labels | sticky/leading the table cards; right-aligned `font-num` columns | all |

### Zone D — Summary card (4-window, customizable)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-30 | Summary card shell | — | accent bar brand-blue, `rounded-2xl border-slate-200 shadow-sm` (DS-5) | all |
| E-31 | Summary metric rows (×visible) | `data.summary.{grandTotal,adults,kids,youth,volunteers,firstTimeDecisions,giving}` each a `FourWin` | per row: w bold + `delta_w_m4` badge, m4, ytd + `delta_ytd_prior` badge, priorYtd. `hideComparisons` → only `w`, rest dash | all |
| E-32 | Customize control (gear, "Customize"/"Done") | `dashboardPrefs.loadSummaryMetrics(userId, churchId)` | opens E-33; per-user localStorage | **editor+** (D2 has a fixed row set, no customize) |
| E-33 | Visibility checkboxes (×metric) | `SUMMARY_METRIC_ORDER` + `SUMMARY_METRIC_LABELS`; writes `saveSummaryMetrics` | a metric disabled (greyed "(tracking off)") when its tracks_* flag is false; toggling persists to localStorage | editor+ |

`effectivelyHidden(k)`: hide volunteers if `!tracks_volunteers`; firstTimeDecisions if `!tracks_responses`; giving if `!tracks_giving`; else honour the per-user flag.

### Zone E — Key Metrics strip (reporting-tag ratios, D-085)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-40 | Key Metrics section header | static; accent teal lane | label "Key Metrics" (DS-7) | all |
| E-41 | Avg Weekly Attendance card | `reportingMetrics.weeklyAvgAttendance` | big `w` + delta; small `4-wk / YTD / Prior` foot | all |
| E-42 | Volunteers / Attendance % card | `reportingMetrics.volToAttendancePct` (suffix `%`) | null → dash; gated tracks_volunteers; **never on D2** | editor+ |
| E-43 | Per-Capita Giving card | `reportingMetrics.perCapitaGiving` (prefix `$`) | null → dash; gated tracks_giving | all |

### Zone F — Per-ministry breakdown (tag_role rollup model — D-074/081/082)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-50 | Ministry section card (×`data.tagSections`) | `service_tags` grouped (`dashboard.ts` builds `TagSection[]`), one per ministry tag, ordered by `display_order` | accent bar by `tag_role` via **`accentForRole`** (Adults blue · Kids violet · Youth teal); name bold + "· <role>" muted via **`roleLabel`** (DS-8) | all |
| E-51 | Attendance row | `section.attendance` (a `FourWin`; the `attendanceForRole` pivot — adults/kids/youth/other weekly) | 4-window row | all |
| E-52 | Volunteers row | `section.volunteers` | gated tracks_volunteers; **never on D2** | editor+ |
| E-53 | Other-stat rows (×`section.stats`) | each `OtherStatRow` (RESPONSE_STAT metrics tagged to this ministry) | gated tracks_responses; label = metric name | all |
| E-54 | "Not in total" muted marker | ministry tag_id ∈ `churches.grid_config.excludedTotalMinistries` (D-083) | excluded ministry card → `opacity-60` + small slate "Not in total" tag (matches Entries Totals). **Affects only the grandTotal headline, never the ministry's own numbers** | all (edit via E-22) |
| E-55 | Unassigned section ("General (No Tag)") | `tag_id === 'UNASSIGNED'` section (stats/volunteers whose metric has no ministry tag) | only rendered if it has rows | all |

### Zone G — Volunteer breakout (editor+, D1 only)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-60 | Volunteer breakout card | `data.volunteerBreakout` {total, rows} | accent violet | **editor+ only**; gated tracks_volunteers; **absent on D2** (D-026) |
| E-61 | Breakout total row | `breakout.total` (`FourWin`) | derived = SUM of rows (DS-9, never stored) | editor+ |
| E-62 | Breakout per-metric rows | `breakout.rows[]` (one per VOLUNTEERS metric) | indented; label = `<Assigned/General> · <metric name>` | editor+ |

### Zone H — Other stats (church-wide remainder, D1)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-70 | Other Stats card | `data.otherStats` (unassigned RESPONSE_STAT remainder) | accent amber-as-attention lane is **forbidden** for category — use neutral slate or a non-status category color; empty → "No other stats tracked." | all; gated tracks_responses |

### Zone I — Include-in-total preference (editor+, D-083)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-22 | Edit-total affordance + panel | `churches.grid_config.excludedTotalMinistries` (read + write) | hover-only filled pencil on the grand-total / summary header (DS-15); opens inline checkbox-per-ministry panel; live-recompute grandTotal as toggled; **Save** persists church-wide; "Saved for the church · doesn't change entered numbers". Mirror the Entries `TotalsView` panel exactly | **editor+ only** (hidden for viewer) |

### Shared states
| E# | Element | Behaviour |
|----|---------|-----------|
| E-80 | Loading skeleton | `loading` → pulse blocks (3 KPI + 2 table) — never throw, never flash empty |
| E-81 | Empty state | `!data.hasAnyData` → calmly "No data yet · Data appears here after your first Sunday entry." (SVG bar-chart icon, DS-14) |
| E-82 | Comparisons-pending note | `hideComparisons` (weeksWithData < 2) → "Comparisons appear after two weeks of data." footer |
| E-83 | Delta badge | reusable: up = sage (`#22C55E`/`#15803D`), down = **amber (`#F59E0B`/`#B45309`) NOT red**, null = muted dash. Arrow + sign + % so color isn't the only signal (DS-2/DS-18) |

> **DS NOTE — current `dashboard/page.tsx` violates the design system and must change in the redesign:** it uses `bg-red-50 text-red-600` for negative deltas (breaks **DS-2 NO RED**), `bg-pink-500 / bg-orange-500` category accents instead of the DS-1 ministry lanes, `font-black` + ad-hoc `tabular-nums` instead of `.font-num` (Fira Code), and emerald/teal/violet section accents picked by `name.length % …` (non-deterministic, ignores `tag_role`). The redesign binds accents to `accentForRole(tag_role)`, deltas to E-83 (sage/amber), numerals to `.font-num`, and reuses Entries' `Dot`/`Ico`/`fmt`.

---

## Reuse contract (Entries primitives)
Import from `@/app/(app)/entries/ui`:
- **`fmt`** — number formatting (replaces local `fmtNum`'s number branch).
- **`Ico`** — all SVG icons (gear/pencilFill/check/pin/chevron) — drop the inline `<svg>` literals (DS-14).
- **`accentForRole(tag_role)`** — ministry accent bar color (E-50; replaces the `name.length % colors` hack).
- **`roleLabel(tag_role)`** — "Adults/Kids/Youth/Other" muted suffix (E-50, DS-8).
- **`Dot` / `Stat`** — only if a status circle is surfaced (e.g. a future "this week complete?" indicator); not required for the core read view.
- Header chrome (ST tile, eyebrow, campus pin, `font-num` style block, reduced-motion CSS) mirrors `entries/page.tsx`.
If any of these need to be shared more widely than Entries+Dashboard, factor them into a tiny `@/components/ui/data-primitives` and update the Entries import — otherwise import directly (per task guardrail #2).

---

## NOVA Items (build tasks / risks)
- **N-1** **Visual redesign only — DO NOT touch `dashboard.ts` or `dashboardPrefs.ts`.** Rewire `dashboard/page.tsx` + `dashboard/viewer/page.tsx` JSX to DS-1…DS-25, reusing Entries primitives. The `fetchDashboardData` call, the `tracks` plumbing, and the `DashboardData`/`FourWin` shapes stay identical.
- **N-2** **Active-campus resolution (D-088):** add `default_location_id` to the membership select (currently absent in `dashboard/page.tsx`), resolve campus exactly like Entries (`default_location_id` → fallback first active `church_locations` by sort_order). Render the context pill (E-2).
- **N-3** **Campus scope (E-3, D-086) — OPEN:** `dashboard.ts` is currently **church-wide** (no campus filter; views are church-scoped). To make it campus-aware the fetch must accept an optional `locationId` and filter the views + `metric_entries` by it (instance entries carry `location_id`; period/giving entries are church-wide null per D-087/O-3). **This is a `dashboard.ts` *signature* change (additive optional param) — flag for SAGE since the guardrail says don't break the data layer.** MVP fallback if not built: keep church-wide and label the scope pill "All campuses" (honest, no code change). Decide at build.
- **N-4** **Role split stays:** D1 (`/dashboard`) for editor+; D2 (`/dashboard/viewer`) for viewer — viewer passes `tracks_volunteers:false` so volunteers vanish everywhere (D-026). Keep the two routes; redesign both to the same look.
- **N-5** **Per-ministry rollup model:** keep `dashboard.ts`'s `tagSections` (tag_role attendance pivot + per-tag volunteers/stats). Bind accent to `accentForRole`, label to `roleLabel`. Honor `excludedTotalMinistries` for the *headline grandTotal only* (E-54), never for the ministry's own attendance row.
- **N-6** **Include-in-total (E-22, D-083 / N-8 from Entries):** read/write `churches.grid_config.excludedTotalMinistries`; live-recompute the displayed grandTotal client-side; never mutate `metric_entries`. Reuse the Entries `TotalsView` inline-panel pattern. Editor+ only.
- **N-7** **Reporting metrics (E-41/42/43):** render `reportingMetrics` as-is. **OPEN:** whether per-capita/vol% should themselves be campus-scoped follows N-3. Currency formatting for per-capita giving (Intl, 0–2 dp) — confirm at build.
- **N-8** **Pagination already handled** in `dashboard.ts` (`fetchEntriesPaged`, PAGE=1000) — the redesign must not introduce any new un-paginated reads (History bug, D-063).
- **N-9** **Delta polarity & color (E-83):** replace the existing **red** down-delta with **amber** (DS-2). Audit `DeltaBadge` in both `page.tsx` and `viewer/page.tsx`.
- **N-10** **`weeksWithData < 2` → hideComparisons** preserved; show E-82 note.
- **N-11** **No new schema needed.** If campus-scoped period stats are ever wanted, `metric_entries.location_id` already exists (D-087) — additive at the query layer, no migration. **No migration is required for this screen.**

## Query Patterns (already implemented in `dashboard.ts` — document, don't re-author)
QP-DASH-TAGS (`service_tags` church-scoped, active, by display_order) · QP-DASH-METRICS (`metrics` defs) ·
QP-DASH-ATTENDANCE (`attendance_per_occurrence` view, [lastYearStart, today]) · QP-DASH-VOLUNTEERS (`volunteers_per_occurrence`) ·
QP-DASH-GIVING-WEEK (`giving_per_week`) · QP-DASH-ENTRIES (`metric_entries` instance breakouts, paged, scoped to in-range occurrence ids) ·
QP-DASH-PERIOD-GIVING (`metric_entries` period_anchor giving, paged). **NEW if N-3 built:** add `location_id` filter to the view/entry selects (church-wide period rows stay null). All: tenant + date-range filters, paginated past 1000.

## Completion / empty / loading states
- **Loading (E-80):** skeleton pulse, never blank.
- **Empty (E-81):** `!hasAnyData` → friendly no-data card; no comparison chrome.
- **Sparse (E-82):** `weeksWithData < 2` → comparisons dashed + footer note.
- **Tracking-off:** rows/cards/KPIs for an untracked reporting tag are simply absent (not greyed) on the read view; greyed only in the E-33 customize list.
- **Viewer (D2):** no volunteers (E-12/E-42/E-52/E-60), no customize (E-32), no include-in-total (E-22); foot re-auth note (D-048): "Need a new link? Enter your email on the login screen."

## Open Items
- **O-1** Campus scope (N-3): build campus filtering into `dashboard.ts` (signature change, SAGE-gated) **or** ship church-wide MVP with an honest "All campuses" label. Recommend MVP church-wide first, campus filter as a fast-follow.
- **O-2** Per-capita giving display precision + currency symbol source (hardcoded `$` vs church locale) — confirm at build.
- **O-3** Should the grandTotal headline get a dedicated hero (like Entries Totals) on D1, or stay as the `grandTotal` row inside the Summary card? Lean: keep it a Summary row to avoid the "redundant total card" anti-pattern (DS-23), but expose E-22 edit on that row.
- **O-4** D2 customize: viewer currently gets a fixed metric set; confirm no per-user customize for viewers (lean: none — keep D2 dead simple).

## Decision References
D-026 (no volunteers on D2) · D-048 (viewer re-auth note) · D-053/D-055 (4-window + delta math) · D-062 (two tag axes: ministry + reporting) · D-063 (paginate past 1000) · D-074 (occurrence/total derived, never stored) · D-077 (rollup = dashboard display preference) · D-081 (day total by template+date; per-ministry summary cards) · D-082 (grand total = SUM all ministries × sittings, derived) · D-083 (include-in-total saved pref, `grid_config`) · D-085 (reporting-tag out-of-box metrics + cadence-neutral IA) · D-086 (locations = dimension; all-campuses roll-up is a UI add) · D-087 (`metric_entries.location_id`; period stats church-wide) · D-088 (per-user default location) · D-089 (DESIGN_SYSTEM DS-1…DS-25).
