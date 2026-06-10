# SundayTally — AI-Built Dashboard Widgets (Concept Spec)

Status: **CONCEPT — agreed in BOT review 2026-06-07. No code written.** Handoff doc for whichever chat builds it.
Owner voices: NOVA (engineering lead) · STRUCTURE/SCHEMA/STRATA (data) · CIRCUIT (AI loop) · PRODUCT (UX) · VERA (simplicity) · SAGE (gate). Pressure-tested by AXIOM + FAULT.

> Goal: let the AI **build a chart/grid/metric widget**, **save it** to a draggable dashboard grid, and on every future load **replay the stored query with zero AI spend.** Turns one-off AI answers into a durable, self-serve BI layer — built on the machinery we already have.

---

## 1. The big idea — pin the AI's answer

Today the only flexible analytics surface is the `/dashboard/ai` chat: you ask a question, the AI renders a
chart, and it vanishes when the conversation ends. Every view costs AI tokens; nothing persists.

The concept: the AI builds a **widget** (line/bar/area graph, flat grid, pivot grid, or metric card), you
**save it** to a grid, and it **replays itself for free** forever after. Editing a widget reopens the AI
conversation, seeded with what it already built.

```
Ask AI ─▶ AI builds widget ─▶ Save ─▶ lives on the grid ─▶ reloads run the stored query (no AI)
                                          ▲
                                          └─ Edit ▶ reopens the AI chat, seeded with the saved widget
```

This is largely an **extension of what exists** — not a greenfield build. We reuse the AI tool loop, the chat
UI, the budget meter, the per-occurrence views, recharts, and the in-repo pivot grid.

---

## 2. The decision — structured query spec, not raw SQL

**Each widget stores a structured query spec (JSON), not a SQL string.** The AI emits a constrained descriptor;
a deterministic server compiler turns it into the **existing safe query builders** (the `src/lib/ai/metrics.ts`
pattern) against the `security_invoker` views. Replay = compile + execute, zero AI.

| Option | Verdict | Why |
|---|---|---|
| **A — Structured query spec** | ✅ **Adopted (v1)** | Inherits our RLS isolation for free; covers all four widget types; deterministic free replay; fits the existing architecture and budget model. |
| B — Raw stored SQL | ❌ Rejected | Rebuilds multi-tenant safety we already have; new attack surface (statement validation, forced `church_id`, locked-down DB role) for negative ROI in this domain. |
| C — Hybrid (spec + raw SQL escape hatch) | 🅿️ Deferred, not adopted | Widget record carries a `query_kind` discriminator from day one so raw read-only SQL can be added in v2 **with no migration rewrite.** Trigger to revisit: the first real church question the DSL can't phrase. |

**Held under STANCE:** FAULT accepts an expressiveness ceiling — when the AI can't phrase a request in the DSL,
it **says so** rather than inventing SQL. AXIOM flags the pivot (two-dimension grouping) as the stress case to
confirm before the spec shape is frozen.

---

## 3. The widget query spec (DSL shape)

The church-analytics domain reduces to **measure × dimension × time-bucket**, which covers all four widget types.

```jsonc
{
  "version": 1,
  "source": "attendance_per_occurrence" | "volunteers_per_occurrence" |
            "giving_per_week" | "metric_entries_readable",   // existing views only
  "measure": { "reporting_tag_code": "ATTENDANCE|VOLUNTEERS|GIVING|RESPONSE_STAT",
               "agg": "sum|avg" },
  "dimensions": [                                             // 0..2 — 2 enables pivots
    { "field": "time", "bucket": "week|month|year" },
    { "field": "ministry_tag" | "service_template" | "location" | "metric",
      "by": "code" }                                          // STABLE codes, never display_name
  ],
  "filters": {
    "date": {                                                 // RELATIVE by default — resolved at replay, never frozen
      "window": "trailing|current|ytd|prior_year|custom",
      "count": 12, "unit": "week|month|year",                 // for "trailing" (e.g. trailing 12 months)
      "anchor": "today",                                      // resolves to the server's current date at run time
      "start": "YYYY-MM-DD", "end": "YYYY-MM-DD"              // ONLY when window="custom" (a pinned fixed period)
    },
    "ministry_tag_codes": ["..."],
    "service_template_codes": ["..."]
  },
  "ratio": { "numerator": {...measure}, "denominator": {...measure}, "scale": 100 }, // optional (e.g. vol/att %)
  "viz": { "kind": "line|bar|area|grid|pivot|metric_card",
           "xKey": "...", "yKeys": ["..."], "title": "..." }
}
```

**Critical-rule compliance is baked into the compiler:** `status='active'` only (via the views), `NULL ≠ 0`
(filtered, never coalesced), giving = `SUM` per occurrence, group by `tag_code` not display name, NULL-skipping
averages. These mirror the guarantees already enforced in `src/lib/ai/metrics.ts` and `src/lib/dashboard.ts`.

---

## 4. Live data, not snapshots — rolling windows are first-class

A widget stores a **relative window**, never a frozen date range (unless you explicitly pin one). At replay the
compiler resolves the window against the **server's current date**, so the widget always shows live data:

| User asks for | Stored in spec | Resolves each load to |
|---|---|---|
| "last 12 months, weekly avg, in month buckets" | `window:trailing, count:12, unit:month` + `bucket:month, agg:avg` | first day 11 months ago → today, re-bucketed monthly |
| "this month so far" | `window:current, unit:month` | 1st of current month → today |
| "year to date" | `window:ytd` | Jan 1 this year → today |
| "vs same period last year" | `window:prior_year` (paired measure) | the mirrored prior-year range |
| "2024" (a fixed period) | `window:custom, start:2024-01-01, end:2024-12-31` | exactly that range, every time |

So **tomorrow becomes the new today and next month becomes the new current month automatically** — no AI, no
re-save. The AI is prompted to think like an analyst: phrase a window relatively ("last…", "this…", "YTD") →
store it relative; only pin absolute dates when the user names a fixed period. The `bucket` (week/month/year) is
independent of the window — that's exactly the "weekly average in month buckets" case. This generalizes the
rolling-window math already in `dashboard.ts`'s four-window logic.

---

## 5. Cross-church safety — structural, not query-dependent

Isolation does **not** rely on a stored query remembering the right `church_id`. Two independent layers:

1. **Postgres RLS is the real guard.** Every source view is `security_invoker` and every table policy is
   `church_id IN (SELECT get_user_church_ids())`, evaluated by the database under the logged-in user's
   `auth.uid()` on every read. Other churches' rows are filtered **before the query returns** — even if a spec
   omitted `church_id` or carried a wrong one, no other church's data is returnable.
2. **Server-injected `church_id` (defense in depth).** The compiler still adds the caller's `church_id` from the
   session — never from the AI or the stored spec — as a second barrier and for query performance.

There is no single field a user (or a tampered spec) could flip to reach another church's data. The guarantee
lives in the database, not in the saved query.

---

## 6. Data model (new — NEEDS-APPROVAL migration)

**Three** tables — because a widget is a **reusable library entity** that can appear on multiple dashboards, so
its *definition* is separated from its *placement*. Supports **both** church-wide shared and per-user private
dashboards.

**`widgets`** — the reusable definition (the library)
`id, church_id (FK), scope ('church'|'user'), owner_user_id (FK, NULLABLE), title, kind
('line'|'bar'|'area'|'grid'|'pivot'|'metric_card'), query_kind ('spec'|'sql' reserved), query_spec JSONB,
viz_config JSONB, explainer JSONB, is_starter BOOLEAN, created_by, created_at, updated_at`
- One row = one reusable widget; can be dropped onto many dashboards.
- `explainer` = the humanized narrative the AI writes **once at save time** (stored → zero-AI on view). The live
  "currently showing…" and "what's included" lines are derived from `query_spec` at view time, not stored.
- `query_kind` reserved discriminator → "C-ready" raw-SQL path with no future migration churn.
- `is_starter=true` for the seeded set (attendance line, giving bar, volunteer pivot, KPI cards).

**`dashboards`** — a named canvas
`id, church_id (FK), owner_user_id (FK, NULLABLE), name, scope ('church'|'user'), breakpoints JSONB, created_by,
created_at, updated_at`
- `scope='church'` → `owner_user_id IS NULL`, visible to all members; managers (editor+) edit.
- `scope='user'` → `owner_user_id = auth.uid()`, private to that user.

**`dashboard_widgets`** — placement junction (which widget sits where on which dashboard)
`id, church_id (FK), dashboard_id (FK), widget_id (FK), layout JSONB, created_at`
- `layout` = the grid cell for this placement: `{ x, y, w, h }` per responsive breakpoint.
- Same `widget_id` on multiple dashboards, each with its own size/position. Editing the widget's query updates it
  everywhere; moving/resizing a placement is local to that dashboard.

**RLS** (mirror the `0029`/`0032` patterns; the views already isolate by church):
- SELECT: church-scope rows for all members; user-scope rows only where `owner_user_id = auth.uid()`.
- INSERT/UPDATE/DELETE: church-scope → `is_church_manager()` or editor+; user-scope → owner only. Placement rows
  inherit the parent dashboard's edit rights.

Migration is written as a **FILE flagged NEEDS-APPROVAL** per CLAUDE.md — not applied in this concept phase.

---

## 7. AI tool design (extend the existing loop)

Reuse `runToolLoop` (`src/lib/ai/anthropic.ts`) and the analytics route pattern
(`src/app/api/ai/analytics/route.ts`). Add to the tool set:

- **`build_widget(query_spec, viz)`** — server validates the spec, compiles it, runs it once, streams a
  **preview** back (reuses the `render_chart` SSE payload + the in-repo pivot grid for grid/pivot). No save yet.
- **`save_widget(dashboard_id, title, query_spec, viz_config)`** — persists the record and writes the stored
  humanized `explainer` (humanizer pass). The only mutating tool.
- Keep `probe_data`, `list_dimensions`, `run_metric`, `final_answer`.

The compiler is one new module (`src/lib/widgets/compile.ts`) — a `switch` over `source`/dimensions that emits
the same `.from().select().eq('church_id', …)` chains as `metrics.ts`. `church_id` is injected server-side, never
from the AI. Validation rejects unknown sources/fields before any query runs.

**Budget:** unchanged — `ai_usage_periods` meters build/edit only. Replay never calls Claude.

---

## 8. Replay path (zero AI)

`GET /api/dashboards/[id]` → load placements → for each, `compileSpec(spec)` + execute under the user's RLS →
return tidy rows. No Anthropic call. Graceful per-widget error state when a spec references a deleted metric/tag
(schema-drift guard). This is the path that runs on every normal dashboard load.

---

## 9. Display, canvas & widget library

**The canvas — responsive 12-column snap grid.** Widgets snap to a 12-col grid; the drag-handle snaps position,
resize pulls in column/row steps, and the layout auto-reflows to a single stacked column on phones (church users
are mostly mobile). Proven BI pattern (Metabase / Grafana / Looker), multi-user safe. Engine:
**`react-grid-layout`** — the only new layout dependency.

```
Desktop (12 cols, snap)            Phone (auto-stacks 1-col)
┌────────┬────────┬────┐           ┌──────┐
│ Attend │ Giving │ KPI│           │Attend│
│ (line) │ (bar)  │card│           ├──────┤
├────────┴────────┬────┤           │Giving│
│ Volunteers grid │ KPI│           ├──────┤
│ (pivot)         │card│           │ KPI  │
└────────────────┴────┘           └──────┘
```

**The widget library (left palette).** A gallery you drag from onto the canvas:
- **Starter set** seeded per church (`is_starter=true`): attendance line, giving bar, volunteer pivot, KPI cards.
- **AI-built widgets** — every widget the AI creates joins the church's library automatically.
- Drag any library widget onto a dashboard → creates a placement. The same widget can sit on multiple dashboards,
  each with its own size/position.

**Renderers (all reuse what's in the repo):** recharts (installed) for line/bar/area; the in-repo
`WebDataRocksGrid` for grid/pivot; a `MetricCard` reusing `KpiCard`/`KeyMetricCard` from
`src/app/(app)/dashboard/ui.tsx`.

### 9.1 Widget explainer — flip-to-explain (every widget)

Every widget carries a small **ⓘ / eye icon top-right.** Click it and the widget **flips** — the chart is
replaced in-place by a plain-language panel (a "back of the card"). Click again (or ✕) to flip back. The panel
answers, in humanized language:

- **What this widget is** — the friendly one-paragraph narrative (AI-written once at save, stored in `explainer`).
- **What the data is / what we're summing** — derived from the spec: e.g. *"Attendance = adults + kids + youth +
  other, added together. Blank weeks are skipped, not counted as zero. Cancelled services are excluded."*
- **How it refreshes** — the rolling window in plain words: *"Rolling — always the last 12 months."*
- **What it's currently showing** — the live resolved range, computed at view time: *"Right now: Jun 2025 – Jun
  2026, in monthly buckets."* (Updates itself as today moves.)
- **What's included / filtered** — the ministries, services, or locations the spec scopes to (or "all of them").

**Cost model:** the narrative is generated **once** by AI at build (humanizer pass — plain and short) and stored;
everything else is templated deterministically from the spec. Opening the explainer on a saved widget is
**zero AI.**

**Ask-about-this-widget → jump to AI.** The panel has an **"Ask about this"** button that reopens the
`/dashboard/ai` chat seeded with this widget's spec + title — for a follow-up ("why did attendance dip in
March?") or a change request, which flows into the edit-via-AI loop. (This path *does* spend AI, like any chat
turn.)

### 9.2 Where it lives

- **For now — a standalone page** (`/dashboard/custom`) so we can build, see, and visualize the grid in
  isolation. The existing `/dashboard` (D1) and `/dashboard/viewer` (D2) are **left completely untouched** — this
  is purely additive. Nav wiring stays minimal at this stage; how it's surfaced in the bottom nav / sub-tabs is
  deferred until the page proves out.
- The page hosts the editable grid + library palette, with a dashboard switcher (church-wide ↔ "My dashboards")
  that also creates/names new dashboards.
- **Add widget:** drag a library widget on, **or** "Build with AI" → the `/dashboard/ai` chat in build-a-widget
  mode → preview → Save.
- **Edit widget:** reopens the same chat seeded with the saved spec + title.
- Follow the established design system (Fira Sans, accent bars, `.font-num`, `rounded-2xl`, no-red deltas per DS-2).

---

## 10. Build phases (for the eventual build — not this doc)

1. **Foundation** — migration FILE (the 3 tables + RLS + starter-widget seed, NEEDS-APPROVAL); `query_spec`
   TypeScript types; `compileSpec()` with critical-rule guarantees + unit coverage reconciling against known
   `dashboard.ts` numbers.
2. **AI build loop** — `build_widget` / `save_widget` tools (save adds to library + writes the stored explainer);
   preview streaming; budget wiring.
3. **Replay + grid** — `/api/dashboards/[id]` replay endpoint; `react-grid-layout` responsive grid; library
   palette with drag-to-place; widget renderers; the flip-to-explain panel.
4. **Edit + ownership** — edit-via-AI seeding; dashboard switcher (church-wide vs per-user); reuse a widget across
   dashboards; manager/owner gates.
5. **IRIS pass** — element maps for the new screens before any of the above ships (per The One Rule).

---

## 11. Risks & open items

- **Expressiveness ceiling (FAULT):** the DSL can't phrase every exotic query. v1 the AI declines; v2 adds the
  reserved `query_kind='sql'` escape hatch behind a read-only role. Trigger: first unphraseable real request.
- **Pivot stress case (AXIOM):** confirm two-dimension grouping renders correctly via the in-repo pivot grid
  before freezing the spec shape.
- **Schema drift:** stored specs referencing deleted metrics/tags → graceful per-widget error, never a crash.
- **Open for build phase:** final route placement (`/dashboard/custom` vs a tab); whether per-user widgets can be
  "promoted" to church-wide; the default starter widget set for a new church.
- **Parked (chat entry point):** a "Create dashboard widget / element" button inside the AI chat as a second
  entry point into the builder. Whether it's gated, and how it ties to paid tiers / monthly billing, is
  **undecided** — recorded only.
- **Parked (post-proof):** this engine (spec → compile → grid → library → explainer, zero-AI replay) is
  domain-agnostic and could later be extracted as an embeddable product behind a per-app data-source adapter.
  Build inside SundayTally first as the proving ground; keep the engine/adapter seam clean so extraction stays
  cheap. **Not in scope now.**

---

## 12. What this doc is — and isn't

This is a **concept spec only.** No code, no migration applied, no dependency installed. "Done" = this file
exists and is reviewable alongside `MINISTRY_METRIC_TREE_CONCEPT.md`. The build-phase verification — compiler
unit tests reconciling against `dashboard.ts` numbers, RLS isolation tests, and an end-to-end
build → save → replay-with-zero-AI check — is specified for when Phase 1 begins.

---

## Addendum — prototyped + Builder-confirmed directions (2026-06-09)

The foundation is now BUILT (compiler, AI build/save tools + guidelines, migration `0033` FILE, IRIS map) and
prototyped in throwaway mockups (`/mockup/widgets`, `/mockup/tremor`) on demo data. Builder-confirmed updates:

- **Lives INSIDE the existing Ask-AI chat (`/dashboard/ai`).** The custom dashboard is a feature *within* the
  chat we already have — build/edit widgets in the chat, they pin to a dashboard view there; the chat stays a
  general Q&A surface too. Supersedes the standalone `/dashboard/custom` placement (which was the prototype shell).
- **Global dashboard filter (date + campus).** One top-level control re-scopes EVERY widget by date range and
  campus/location; the AI can also add **filter widgets** and is given dashboard context to "understand" it.
  Requires `location` wired into the compiler (per D-086/087 `metric_entries.location_id`) + a dashboard-filter
  layer that overrides each widget's window/scope at read time.
- **Renderers = the Tremor look.** `@tremor/react` npm targets Tailwind v3; the app is Tailwind v4 → use Tremor's
  copy-paste / Recharts design layer (PARSE Option A). Fully AI-decoupled — still just `VizConfig.kind` + rows,
  so the renderer choice never touches the AI/compiler. `react-grid-layout` adopted for the grid.
- **`weekly_avg` is the house metric.** Added `measure.agg='weekly_avg'` — SUM within each ISO week, then AVERAGE
  the weeks (NULL weeks don't drag it down). Headline numbers default to weekly averages, not raw totals. The
  **4-window frame** (current week · last-4-wk avg · YTD weekly avg · prior-YTD weekly avg) is the comparison standard.
- **AI behavior:** always OFFER a prior-year comparison after building; SUGGEST 1–2 drill-downs (by ministry / service).
- **Remove + edit widgets** — ✕ removes; ✎ edits via the AI (re-opens the chat seeded with the widget).
- **Query proof + dynamic guardrail** — every widget shows its equivalent SQL (relative `CURRENT_DATE`-based for
  rolling windows) and a **Live / Fixed** badge so a pinned (static) widget is always identified.
- **Save scope:** per church (0033) + **per campus/location** (the open add). Widgets/dashboards already church-
  and user-scoped.

**Next (real build):** apply `0033` (gated); fix starter-seed specs (BUILD_FLAGS); wire `location` into the
compiler; build the in-chat dashboard surface + global date/campus filter; adopt Tremor renderers; add a
`compare: prior_year` spec capability for true 4-window comparison widgets.

---

## Addendum 2 — Services restructure hooks (2026-06-09, approved plan)

The Services/What-We-Track restructure adds two compiler-visible concepts (spec: `IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md` §5):

- **`service_group` dimension + `service_group_codes` filter** — reporting groups (e.g. Morning / Evening,
  cross-location) live in `service_groups` (0037) and surface on the three occurrence/firehose views as
  `service_group_code` (0038, appended column). "Attendance by service group, weekly" becomes a first-class
  widget. Ungrouped services bucket as `—`.
- **Church-wide services (`location_id IS NULL`, 0036)** — campus-filtered widgets (`?campus=`) EXCLUDE
  church-wide rows; they count under "All campuses" only. Override = one-line `.or()` flip in
  `compile.ts` (BUILD_FLAGS records it). Giving stays church-wide as before (D-086).
