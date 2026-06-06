# Key Metrics — Customizable, Targeted, Per-Location — Full Plan
Owner: PRODUCT/NOVA · 2026-06-06 · status: PROPOSED (not built) · pre-compaction capture

This is the durable spec for making the Dashboard "Key Metrics" section a curated,
target-able, scope-aware feature. Written before a context compaction — it is
self-contained; read it cold to build.

---

## 0. Context — what already shipped this session (so this reads cold)
The dashboard (`src/app/(app)/dashboard/page.tsx` + `ui.tsx`, data in `src/lib/dashboard.ts`)
already got, THIS SESSION, **uncommitted on `main`, local-only** (prod not redeployed):
- Key Metrics strip moved up under the top KPI cards.
- Period column headers (`Curr Wk · Last 4-Wk · Curr YTD · Prior YTD`) rendered **inside each card** with a **portal tooltip** (full name + "weekly average" note + live date range; escapes card `overflow-hidden`).
- **All 3 comparison columns are weekly AVERAGES** (m4/ytd/priorYtd), not totals — confirmed in `fourWinFromWeekly`. Curr Wk is the single-week value.
- Totals rows relabeled to the church's **dynamic ministry names** (`{tag_name} Total`, e.g. Experience/LifeKids/Switch) with a gray "attendance" tag; falls back to generic Adults/Kids/Youth when a role has 0 or 2+ ministries.
- Key Metric footer numbers bold-black; Totals header is now **pencil + cog (icon-only)**.
- **Date anchor**: dashboard defaults to today; the header date chip re-anchors all 4 windows to a chosen past date (`fetchDashboardData(churchId, tracks, asOf?)`).
- Related plan: `DASHBOARD_DRILLDOWN_PLAN.md` (task #69) — clicking a value cell → drill-down. Separate from this.

This plan = task **#70**.

---

## 1. Goal
Let church leaders **curate which metrics are featured as Key Metric cards** (promote ANY
metric shown on the dashboard) and **set an all-time target** on each featured metric, with
configuration that is **church-wide by default and overridable per location**, editable only
by **owner/admin**.

---

## 2. Scope model — church-wide + per-location override
- The dashboard has a scope selector (currently the E-3 "All campuses" pill, locked).
  This feature makes it meaningful: **scope = "Church-wide" OR a specific location.**
- **Override model:** a church-wide config is the base. A location may define its own
  override set; if it has none, it **inherits the church-wide config**.
- The user edits at whichever scope is currently selected: editing while on "Church-wide"
  sets the base; editing while a location is selected sets that location's override.
- "Click a location → make it church-wide" = switch the scope selector to Church-wide and edit there.

> **HARD DEPENDENCY:** `dashboard.ts` is currently **church-wide only** (campus filtering is a
> flagged fast-follow, O-1/N-3 — there is no `location_id` filter on the fetch yet). Per-location
> Key Metrics that show *different numbers* per location require campus-scoped dashboard data
> first. Therefore this feature **phases** (see §8): Phase 1 ships church-wide config (works
> today); Phase 2 adds per-location overrides once campus-scoped data lands.

---

## 3. Permissions
- **Edit (pick metrics, set/clear targets):** role ∈ {owner, admin}.
- **Read-only (see featured metrics + targets, no controls):** editor, viewer.
- Gate in the UI (hide pencils/cog) AND enforce at the write (the save path already writes
  `churches.grid_config`; ensure the role check — RLS from migration 0029 makes
  `churches`/grid_config writes owner/admin via `is_church_manager`; confirm grid_config
  update is covered by a manager policy, else add one — FLAG).

---

## 4. The metric catalog (what can be promoted)
Build a client-side catalog from `DashboardData` (already has every value). Each entry:
`{ key, label, group, values: FourWin, prefix?, suffix? }`. Stable keys:

| Source | Key pattern | Example label |
|---|---|---|
| Summary grand total | `summary:grandTotal` | "Grand Total" |
| Summary audiences (dynamic names) | `summary:adults` / `:kids` / `:youth` | "Experience Total" |
| Summary volunteers / decisions / giving | `summary:volunteers` / `:firstTimeDecisions` / `:giving` | "Giving" ($) |
| Per-ministry attendance | `ministry:<tagId>:attendance` | "Experience · Attendance" |
| Per-ministry volunteers | `ministry:<tagId>:volunteers` | "LifeKids · Volunteers" |
| Per-ministry stat | `ministry:<tagId>:stat:<categoryId>` | "Experience · Salvations" |
| Other stats | `other:<key>` | "Parking" |
| Reporting ratios | `reporting:weeklyAvgAttendance` / `:volToAttendancePct` / `:perCapitaGiving` | "Per-Capita Giving" ($) |

- **Default featured set** (when no config saved): the current 3 reporting ratios
  (weeklyAvgAttendance, volToAttendancePct, perCapitaGiving).
- Featured set is an **ordered list of keys**; render order = saved order.
- KeyMetricCard is generic over `FourWin`, so any catalog entry renders as a card unchanged.

---

## 5. UX
**Key Metrics lane** (`LaneLabel "Key Metrics"`):
- If `canEdit`: a **cog/pencil** opens the **picker** — a panel listing the catalog grouped
  (Totals · Per-ministry · Ratios · Other), each with a checkbox. Optional: drag-to-reorder
  (MVP: ↑/↓ buttons or selection order). "Done" closes. Saves the ordered key list at the
  current scope.
- Shows the featured metrics as cards (current default look preserved).

**Per-card target** (Key Metric cards ONLY — targets are not allowed anywhere else):
- If `canEdit`: a **pencil top-right of each Key Metric card** → inline number input → Save / Clear.
- Stored as a number for that metric key at the current scope. **All-time, not time-based.**
- Display when set: "Target: X" + a **neutral** comparison of Curr Wk (or the chosen hero
  window) vs target — **sage** when met/above, **amber** when below. **No red** (DS-2).
- No target set → show nothing.

---

## 6. Storage (no migration — `churches.grid_config` jsonb)
Extend the existing `grid_config` (already holds `excludedTotalMinistries`):
```jsonc
grid_config: {
  excludedTotalMinistries: string[],              // existing
  keyMetrics: {
    churchWide: string[],                          // ordered metric keys
    byLocation?: { [locationId: string]: string[] }
  },
  keyMetricTargets: {
    churchWide: { [metricKey: string]: number },
    byLocation?: { [locationId: string]: { [metricKey: string]: number } }
  }
}
```
- Resolution at render: `byLocation[selectedLocationId] ?? churchWide ?? DEFAULT_KEYS`.
- Save merges into existing grid_config (reuse the page's `handleSavePrefs` pattern).
- Church-wide → no migration. If per-location config grows large or needs its own RLS, a
  dedicated `key_metric_prefs` table (church_id, location_id nullable, metric_key, target,
  position) is the Phase-2 alternative — decide at Phase 2 (FLAG).

---

## 7. Component / file changes
- `src/lib/dashboard.ts` — (Phase 2) accept `locationId?` to scope data; (Phase 1) no change.
- `src/app/(app)/dashboard/ui.tsx`:
  - `KeyMetricCard` — add `target`, `onSaveTarget`, `canEdit`, `metricKey`; pencil + inline editor + target comparison row.
  - New `KeyMetricsPicker` panel component (catalog checkboxes, grouped).
- `src/app/(app)/dashboard/page.tsx`:
  - Build the **catalog** from `data` (map every source above to `{key,label,group,values,prefix}`).
  - Resolve featured keys + targets from `grid_config` at current scope.
  - `canEdit = role==='owner' || role==='admin'`.
  - Render featured cards from catalog; wire picker + target saves through `handleSavePrefs`.
  - Wire the scope selector (Phase 2) to the E-3 toggle.
- `src/types` — add `grid_config` Key Metrics shapes to the Church type (currently `Record<string,unknown>|null`).

---

## 8. Phasing
- **Phase 1 (buildable now, church-wide):** catalog + picker + per-card targets, scope =
  church-wide only, admin-gated, stored in `grid_config.{keyMetrics.churchWide, keyMetricTargets.churchWide}`.
  Works with today's church-wide data. Ships the whole "promote any metric + target it" value.
- **Phase 2 (after campus-scoped dashboard data):** per-location overrides + the scope
  selector wired to E-3; `byLocation` storage; `fetchDashboardData(..., locationId)`.

---

## 9. Open decisions
1. **Target comparison window** — compare the target to Curr Wk, or to Curr-YTD weekly avg? (lean Curr Wk; maybe let the user pick the hero window per card later.)
2. **Reorder UX** — drag vs ↑/↓ vs selection-order (lean ↑/↓, a11y-friendly, no deps).
3. **Phase-2 storage** — keep nested `grid_config.byLocation` jsonb vs a `key_metric_prefs` table.
4. **grid_config write RLS** — confirm owner/admin-only update on `churches.grid_config` (0029); add a policy if the current one is too broad/narrow.
5. Does a metric promoted to Key also stay visible in its original section below, or move up? (lean: stays below too; Key Metrics is a *feature/pin*, not a move.)

## 10. Gate
New IRIS element-map section (Key Metrics picker + target editor E-numbers), DESIGN_SYSTEM
compliance (cog/pencil icon-only, no-red comparisons, Fira numerals), FELIX (target math +
catalog values reconcile with the cards) + LENS (render), per SUBAGENT_STANDARD if built via sub-agents.
