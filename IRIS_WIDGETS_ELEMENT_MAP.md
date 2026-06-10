## Status: Complete (design) — Pending build (Batch-2 gate artifact, additive screens)
## Version: 1.0
## Pending revisions: SSE `grid`/`widget` event shape (N-5) + replay output contract (N-6) finalize at build
## Last updated: 2026-06-08

# IRIS Element Map — AI-WIDGETS screens (custom dashboards · widget card · builder chat)

**Owner:** IRIS · **Build lead:** NOVA · **Gate:** SAGE
**Concept (read first, full):** `CONCEPT_AI_WIDGETS.md` — esp. §3/§4 (spec + rolling windows), §6 (3-table model), §7 (AI tools), §8 (zero-AI replay), §9 (display/canvas/library), §9.1 (flip-to-explain), §9.2 (where it lives).
**Design system:** `DESIGN_SYSTEM.md` DS-1…DS-25 (BINDING — no red, status circles, Fira numerals `.font-num`, brand `#4F6EF7`, plain-dot category labels, SVG-only icons).
**Shared interface contract (already in repo — import, do not reshape):** `sunday-tally/src/lib/widgets/spec.ts` — `WidgetSpec`, `Measure`, `Dimension`, `DateWindow`, `VizConfig`, `SpecExplainer`.
**Reference look (wired + verified):** `sunday-tally/src/app/(app)/dashboard/page.tsx` + `dashboard/ui.tsx` + `entries/ui.tsx` — reuse primitives.
**Existing AI loop to extend:** `sunday-tally/src/app/api/ai/analytics/route.ts` (SSE tool loop) + `sunday-tally/src/lib/ai/anthropic.ts` (`runToolLoop`).
**Existing chat UX + recharts to reuse:** `sunday-tally/src/app/(app)/dashboard/ai/page.tsx` (`ChartBlock`, thread, composer, SSE frame parser).
**In-repo grid/pivot renderer:** `sunday-tally/src/components/shared/WebDataRocksGrid.tsx` (browser-only, `ssr:false`).
**Target routes (build):**
  - `/(app)/dashboard/custom` — **NEW** standalone page: the editable grid + library palette + dashboard switcher (Screen 1).
  - The Widget card (Screen 2) is a component on Screen 1; its flip-to-explain back panel is part of it.
  - The Builder chat (Screen 3) reuses `/(app)/dashboard/ai` in build-a-widget mode (or a focused panel on Screen 1 — see O-7).

> **ADDITIVE — nothing existing is touched.** `/(app)/dashboard` (D1) and `/(app)/dashboard/viewer` (D2) are left **completely unchanged** (CONCEPT §9.2). This map specifies a new surface that sits beside them. The four `is_starter` widgets and AI-built widgets are a **separate library** built on the new `widgets` / `dashboards` / `dashboard_widgets` tables (§6, NEEDS-APPROVAL migration N-1). No `dashboard.ts` change, no D1/D2 JSX change.
>
> Everything on these screens is schema/spec-driven — the demo values (Attendance line, Giving bar, Volunteer pivot, "trailing 12 months") are placeholders in dynamic slots. A church with different ministries/metrics/widgets renders a different grid from the same code.

---

## Purpose & Core Loop
A signed-in non-viewer opens **Custom Dashboards** → lands on a saved canvas (church-wide by default, or one of "My dashboards") → sees their widgets in a responsive snap grid. Each widget **replays its stored spec with zero AI** (CONCEPT §8). They can: drag/resize/reflow tiles; flip any widget to read its plain-language explainer; drag a library widget onto the canvas; or **Build with AI** → the builder chat previews a new widget → **Save** adds it to the library and drops it on the current dashboard. **Edit** reopens the builder seeded with the saved spec. Viewers **read** a shared church dashboard; they never build, edit, or rearrange.

```
Open Custom ─▶ grid replays saved specs (no AI) ─▶ drag/resize ─▶ persists layout
                       │                                              ▲
                       ├─ flip ⓘ → explainer (zero-AI, spec-derived)  │
                       ├─ drag from library → new placement ──────────┘
                       └─ Build with AI → preview → Save → library + placement
                                              ▲
                                              └─ Edit → builder seeded with saved spec
```

## Roles (`church_memberships.role`) — CONCEPT §6 RLS + §9.2
| Role | On these screens |
|---|---|
| owner / admin / editor | Full: build/edit **church** dashboards + widgets (scope `'church'`); create/name church dashboards; rearrange; flip-to-explain; "Ask about this". Also build their **own** private dashboards (scope `'user'`). |
| **any signed-in non-viewer** | Builds their **OWN** private dashboards/widgets (scope `'user'`, `owner_user_id = auth.uid()`) — even if not a church manager. (Per §6: church-scope writes need editor+/`is_church_manager()`; user-scope writes need owner-only.) |
| viewer | **Read-only** — sees shared **church** dashboards (replay output). No builder, no Save, no drag/resize, no create. Library palette + "Build with AI" + the ⓘ "Ask about this" / Edit affordances are **hidden**. The flip-to-explain *read* panel MAY remain (it is zero-AI and read-only) — see O-4. |

> **Manager test:** editor/admin/owner = "church manager" for church-scope writes. `viewer` is the only fully read-only role. **FLAG (O-1):** confirm whether `editor` may edit *church-wide* dashboards or only *its own* — concept says "editor+ build/edit CHURCH dashboards" (so yes) but the RLS note says church-scope INSERT/UPDATE = `is_church_manager()` OR editor+. Builder must lock the exact predicate.

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| Church | session → `church_memberships` (active, role, `church_id`) | tenant scope on every query; RLS is the real guard (CONCEPT §5) |
| User | `auth.uid()` | owns `scope='user'` dashboards/widgets |
| Current dashboard | switcher selection; default = the church-wide dashboard, else first "My dashboard" | drives which placements + layout load (`GET /api/dashboards/[id]`) |
| Breakpoint | viewport width (react-grid-layout) | `lg` (12-col) down to `xs` (1-col stacked); picks which `layout` map to read/write |
| Today | server date at replay (CONCEPT §4) | resolves every relative window; explainer "currently showing" recomputes as today moves |

## Data Dependencies (gated build migration package — N-1, NEEDS-APPROVAL, not yet applied)
- `widgets` (NEW) — reusable definition / library entity. `id, church_id, scope('church'|'user'), owner_user_id (nullable), title, kind('line'|'bar'|'area'|'grid'|'pivot'|'metric_card'), query_kind('spec'|'sql' reserved), query_spec JSONB, viz_config JSONB, explainer JSONB, is_starter BOOLEAN, created_by, created_at, updated_at` (CONCEPT §6).
- `dashboards` (NEW) — named canvas. `id, church_id, owner_user_id (nullable), name, scope('church'|'user'), breakpoints JSONB, created_by, created_at, updated_at`.
- `dashboard_widgets` (NEW) — placement junction. `id, church_id, dashboard_id (FK), widget_id (FK), layout JSONB ({x,y,w,h} per breakpoint), created_at`.
- **RLS** mirrors `0029`/`0032`: SELECT church-scope rows for all members + user-scope rows where `owner_user_id = auth.uid()`; INSERT/UPDATE/DELETE church-scope → manager/editor+, user-scope → owner; placement inherits parent dashboard edit rights.
- **Starter seed:** `is_starter=true` set per church — attendance line, giving bar, volunteer pivot, KPI card(s) (CONCEPT §9 / §10.1).
- **Existing (unchanged) views the specs replay against:** `attendance_per_occurrence`, `volunteers_per_occurrence`, `giving_per_week`, `metric_entries_readable` — all `security_invoker`.
- **Compiler (NEW module, Track D):** `src/lib/widgets/compile.ts` — `compileSpec(spec)` → safe `.from().select().eq('church_id', …)` chains (the `metrics.ts` pattern), `church_id` injected server-side. Bakes the six critical rules.

---

## Screen 1 — `/dashboard/custom` (the canvas)

A single full-width page (NOT the `max-w-3xl` of Entries/Dashboard — the grid wants room; use a wider container, e.g. `max-w-6xl`/`max-w-7xl`, and reflow to 1-col on phones). Hosts: header + dashboard switcher (Zone A), the responsive grid (Zone B), the library palette (Zone C), and the entry points to the builder (Zone D). Wrapped in `AppLayout role={role}` (reuse the existing layout; pass the resolved role).

### Zone A — Header + dashboard switcher
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | Header chrome (ST tile + eyebrow + church name) | reuse `DashHeader` from `dashboard/ui` **or** the same ST-tile/eyebrow markup; eyebrow text proposal **"CUSTOM DASHBOARDS"** (copy = Builder decision) | static | all |
| E-2 | Dashboard switcher (`<current name> ▾`) | list from `GET /api/dashboards` → `[{id,name,scope,owner_user_id}]`; grouped **Church** (scope `'church'`) vs **My dashboards** (scope `'user'`, `owner_user_id=auth.uid()`) | dropdown; selecting one loads its placements (E-10); shows a small scope tag per row (plain slate, DS-16) — "Shared" vs "Private" | all (viewer sees only Church group) |
| E-3 | New dashboard (`+ New`) | opens E-4 inline namer → `POST /api/dashboards {name, scope}` | hidden for viewer; user-scope create allowed for any non-viewer; church-scope create gated editor+ (O-1) | non-viewer |
| E-4 | Name-dashboard inline field | text input + Save/Cancel; writes `dashboards.name`, `scope` (church if manager + "make shared" chosen, else user) | empty → disabled Save; saving…; created → switches to it | non-viewer |
| E-5 | Scope toggle on create (`Private ⟷ Shared`) | sets `scope` on the new dashboard | **Shared** only offered to editor+ (church manager); default **Private** for a plain member | non-viewer |
| E-6 | "Add widget" / "Build with AI" entry buttons | see Zone D (E-40/E-41) | placed above the grid (mirrors Entries' "add service above the first card" convention) | non-viewer |

> The campus pill is **out of scope** here — a custom dashboard's specs carry their own filters; do not add an Entries-style `📍` context pill unless a spec needs it (FLAG O-6). The switcher (E-2) is the page's primary context control, not the campus.

### Zone B — The responsive snap grid (engine: react-grid-layout)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Grid canvas | `GET /api/dashboards/[id]` → per placement: `{ dashboard_widget_id, widget_id, kind, title, viz_config, layout, rows, resolved, explainerFacts, explainer }` (replay output contract, N-6) | renders one Widget card (Screen 2) per placement at its `layout` cell | all (read); rearrange = non-viewer |
| E-11 | Responsive breakpoints | `react-grid-layout` `ResponsiveGridLayout`; 12 cols at `lg`, stepping down to **1 col on phones** (CONCEPT §9 — church users are mostly mobile) | auto-reflow on resize; layout per breakpoint read from `dashboards.breakpoints` + each `dashboard_widgets.layout` | all |
| E-12 | Drag handle (reposition) | grid snaps position to the 12-col grid | grab cursor on the card header only (so inner controls stay clickable); on drop → persist new `{x,y}` for the active breakpoint (PUT layout, N-4) | non-viewer (disabled for viewer) |
| E-13 | Resize handle | resize pulls in column/row steps | bottom-right handle; on release → persist `{w,h}`; min-size per `kind` (metric_card smaller floor than pivot) | non-viewer |
| E-14 | Reflow → 1-col (mobile) | layout switches to the `xs`/`xxs` breakpoint map | **read-only stack on phones is acceptable** even for editors (rearranging a 1-col stack is low-value) — FLAG O-2 if drag must work on mobile | all |
| E-15 | Remove-from-dashboard (per card) | deletes the **placement** only (`DELETE` the `dashboard_widgets` row), never the `widgets` library row | small low-chrome control in the card's flip/menu (DS-15); confirm-on-remove proposal; the widget stays in the library | non-viewer |
| E-16 | Empty-dashboard state | placements length 0 | calm card: SVG bar-chart icon (`Ico.barChart`), proposal copy *"Nothing here yet — drag a widget from the library or build one with AI."* (DS-14/DS-23) | all (viewer variant omits the build/drag verbs → "No widgets on this dashboard yet.") |
| E-17 | No-dashboards state | `GET /api/dashboards` empty (no church-wide + no user dashboards) | first-run card prompting create (E-3) / or auto-create a default church dashboard at seed time (O-3); proposal *"Create your first dashboard to start pinning widgets."* | non-viewer |

### Zone C — Library palette (drag-to-place)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-20 | Library panel shell | `GET /api/widgets` → the church's widget library: starter (`is_starter=true`) + every AI-built widget; plus the user's own `scope='user'` widgets | left rail on desktop (collapsible), bottom sheet / drawer on mobile; `rounded-2xl border-slate-200 shadow-sm` (DS-5) | non-viewer (viewers don't place, so hidden — O-4) |
| E-21 | Starter widget tiles (×4+) | seeded set: **Attendance (line)**, **Giving (bar)**, **Volunteer (pivot)**, **KPI card(s)** | each shows a tiny type glyph (line/bar/grid/metric SVG via `Ico`) + title; draggable | non-viewer |
| E-22 | AI-built widget tiles (×n) | `widgets` where not starter, church- or user-scope visible to caller | same tile; small "AI" or sparkle marker proposal | non-viewer |
| E-23 | Drag-to-place | drop a tile on the grid → `POST` a placement (`dashboard_widgets {dashboard_id, widget_id, layout}`) at the drop cell | drag ghost; invalid drop (off-grid) snaps back; same `widget_id` may sit on many dashboards, each its own size/pos (CONCEPT §6/§9) | non-viewer |
| E-24 | Library section grouping | group **Starter** · **AI-built** · **My widgets** (scope) | plain slate group headers (DS-8/DS-16); empty group hidden | non-viewer |
| E-25 | Library empty state | only starters exist, none AI-built yet | proposal *"Your AI-built widgets show up here. Build one →"* linking to E-41 | non-viewer |
| E-26 | Widget type glyphs | line/bar/area/grid/pivot/metric_card → `Ico.barChart` / a line glyph / `Ico.grid` / `Ico.layers` / a metric glyph | SVG only (DS-14); never emoji | all |

### Zone D — Add-widget entry points
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-40 | "Add from library" affordance | opens / focuses the palette (Zone C) | non-viewer; no-op for viewer (hidden) | non-viewer |
| E-41 | "Build with AI" button | opens the Builder chat (Screen 3) in build-a-widget mode, scoped to the **current dashboard** (so Save can place it) | primary button, brand `#4F6EF7` (DS-1); hidden for viewer; disabled + AI-exhausted banner when budget is spent (reuse `AiExhaustedBanner`) | non-viewer |

---

## Screen 2 — The Widget card (renderer + flip-to-explain)

One component renders any `kind`. It has a **front** (the visualization) and a **back** (the plain-language explainer). The ⓘ/eye icon top-right flips between them (CONCEPT §9.1). All data comes from the replay output for this placement — **zero AI** on view.

### Zone E — Widget card front (the visualization)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-50 | Card shell + header | `title` (from `widgets.title` / `viz_config.title`); `rounded-2xl border border-slate-200 shadow-sm` + left accent bar (DS-5/DS-7). Header doubles as the **drag handle** (E-12) | reuse `CardHeader` from `dashboard/ui` (accent bar + title + trailing slot) | all |
| E-51 | Flip control (ⓘ / eye, top-right) | toggles front/back | low-chrome icon button, `aria-label="Explain this widget"` (DS-14/DS-15); on back, becomes ✕ to flip back (DS-17 transition-colors/opacity, respect reduced-motion) | all (read; present for viewer too if O-4 = keep) |
| E-52 | Card menu (⋯) | per-card actions: **Edit** (E-70), **Remove from dashboard** (E-15) | hidden for viewer; Edit reopens builder seeded with spec; both low-chrome | non-viewer |
| E-53 | **Line / Bar / Area** render | `kind ∈ {line,bar,area}` → reuse the recharts `ChartBlock` from `dashboard/ai/page.tsx` with `{type:kind, title, xKey:viz_config.xKey, yKeys:viz_config.yKeys, data:rows}` | responsive (`ResponsiveContainer`); fits the card's resized box; **palette must be DS-compliant — see N-9 (the existing `ChartBlock` palette uses `#ef4444` red; replace with brand/category lanes, NO RED, DS-2)** | all |
| E-54 | **Grid / Pivot** render | `kind ∈ {grid,pivot}` → `WebDataRocksGrid` with `{data:rows, columns:viz_config columns, height}`; pivot = the two-dimension case (AXIOM stress test, CONCEPT §11) | `ssr:false` (already handled in the component); height tracks the card cell; flat mode for `grid`, two-dim grouping for `pivot` | all |
| E-55 | **Metric card** render | `kind = 'metric_card'` → reuse `KpiCard` (single hero value + delta) or `KeyMetricCard` (value + 4-window footer) from `dashboard/ui`, fed from `resolved` (the single computed number + optional delta/windows) | `.font-num` numerals (DS-4); delta via `DeltaBadge` (NO RED — up sage / down amber, DS-2) | all |
| E-56 | Per-widget loading | placement present, rows not yet resolved (if replay streams) | skeleton pulse inside the card (never blank, never throw) — mirror `EmptyState`/skeleton conventions | all |
| E-57 | Per-widget error (schema drift) | replay returns a per-widget error (spec references a deleted metric/tag — CONCEPT §8/§11) | calm in-card state, **NOT red** (DS-2): proposal *"This widget couldn't load — a metric it uses may have changed. Edit to fix."* + Edit shortcut (non-viewer). Never crashes the grid | all |
| E-58 | Per-widget empty | replay returns zero rows for the resolved window | proposal *"No data in this window yet."* (calm, DS-23) | all |

### Zone F — Widget card back (flip-to-explain panel) — CONCEPT §9.1
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-60 | Back panel shell | same card footprint, flipped in-place (front hidden) | DS-17 transition; close via E-51 (✕) | all |
| E-61 | **"What this widget is"** narrative | `widgets.explainer` (the AI-written, humanized one-paragraph story, written **once at Save**, stored — zero AI on view; CONCEPT §6/§9.1) | plain body text, slate-700 (DS-21); read-only | all |
| E-62 | **"What we're summing"** | `explainerFacts.summing` (from `describeSpec(spec)` → `SpecExplainer.summing`) e.g. *"Attendance = adults + kids + youth + other, added together. Blank weeks are skipped, not counted as zero. Cancelled services are excluded."* | deterministic, spec-derived; recomputed at view (no store) | all |
| E-63 | **"How it refreshes"** | `explainerFacts.refresh` (`SpecExplainer.refresh`) e.g. *"Rolling — always the last 12 months."* (or *"Fixed: Jan–Dec 2024."* for a pinned custom window) | spec-derived | all |
| E-64 | **"What it's currently showing"** | `explainerFacts.currentlyShowing` (`SpecExplainer.currentlyShowing`) e.g. *"Right now: Jun 2025 – Jun 2026, in monthly buckets."* — **resolved at view time** against today (CONCEPT §4); updates itself as today moves | spec-derived, live; `.font-num` for the date range | all |
| E-65 | **"What's included / filtered"** | `explainerFacts.included` (`SpecExplainer.included`) — the ministries/services/locations the spec scopes to, or *"all of them"* | spec-derived | all |
| E-66 | **"Ask about this"** button | reopens the Builder/AI chat (Screen 3) **seeded** with this widget's `query_spec` + `title` (CONCEPT §9.1) — for a follow-up ("why did attendance dip in March?") or a change request, which flows into edit-via-AI. **This path spends AI** (like any chat turn) | hidden for viewer (O-4); disabled + exhausted banner when budget spent | non-viewer |

> **Explainer cost model (CONCEPT §9.1):** E-61 narrative = generated **once** by AI at build (humanizer pass, plain + short) and stored in `widgets.explainer`. E-62…E-65 = templated deterministically from the spec via `describeSpec()` (→ `SpecExplainer`). **Opening the explainer on a saved widget is zero AI.** Only E-66 ("Ask about this") spends AI.

---

## Screen 3 — The Builder chat (build / save / edit via AI)

Reuses the `/dashboard/ai` chat machinery (thread, composer, SSE frame parser, `ChartBlock`, `AiExhaustedBanner`) in **build-a-widget mode**. Adds two server tools to the loop. The only mutating tool is `save_widget`.

### Zone G — Builder flow
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-70 | Open builder | from E-41 ("Build with AI", fresh) or E-52/E-66 ("Edit"/"Ask about this", **seeded** with stored `query_spec`+`title`) | seeded mode pre-loads the spec into the first turn's context so the AI edits rather than starts over | non-viewer |
| E-71 | Composer + thread | reuse `dashboard/ai/page.tsx` composer + thread + SSE parsing | streaming text, thinking dots, follow-up chips; budget-aware (`AiExhaustedBanner` on `ai_budget_exhausted`) | non-viewer |
| E-72 | `build_widget` preview | `POST /api/ai/widget-builder` → tool `build_widget(query_spec, viz)`: server validates + `compileSpec` + runs **once** → streams a **preview** (reuse the `render_chart` SSE payload for line/bar/area; the pivot grid for grid/pivot; the metric card for metric_card). **No save yet** (CONCEPT §7) | preview renders inline in the thread using the same Screen-2 renderers (E-53/54/55); a new SSE event `widget`/`grid` carries pivot/grid + metric payloads (N-5) | non-viewer |
| E-73 | **Save** affordance | tool `save_widget(dashboard_id, title, query_spec, viz_config)` → persists the `widgets` row + writes the stored humanized `explainer` (humanizer pass), then `POST`s a placement on the **current dashboard** | primary button (brand `#4F6EF7`); on success → builder closes, the new widget appears on the grid + in the library; budget meters build/edit only (replay never bills) | non-viewer |
| E-74 | Edit-via-AI | "Edit" (E-52) reopens this chat seeded with the saved spec; a follow-up that changes the spec re-previews (E-72); Save **updates** the same widget everywhere it's placed (CONCEPT §6 — editing the definition updates all placements; layout stays local) | seeded; Save = update not insert | non-viewer |
| E-75 | DSL ceiling decline | when the AI can't phrase a request in the DSL it **says so** rather than inventing SQL (CONCEPT §2 STANCE / §11 FAULT) | a plain assistant message ("I can't build that as a widget yet — here's what I can do…"); no broken preview, no Save | non-viewer |
| E-76 | Builder entry copy / suggestions | proposal seed prompts e.g. *"Attendance, weekly, last 12 months"*, *"Giving this year vs last year"*, *"Volunteers by ministry"* (copy = Builder decision; mirror the `SUGGESTED` array pattern) | shown on empty builder thread | non-viewer |

> **Where the builder lives (CONCEPT §9.2, O-7):** simplest path = reuse the existing `/dashboard/ai` page in a build mode (a query param / state flag flips the toolset + adds the Save affordance), since it already has the chat + recharts + budget UX. Alternative = an in-page panel/drawer on `/dashboard/custom`. **FLAG O-7** — Builder picks; the element bindings above hold either way.

---

## Endpoints & tools these screens bind to
| Binding | Shape | Used by |
|---|---|---|
| `GET /api/dashboards` | list `[{id,name,scope,owner_user_id}]` (church + user, RLS-filtered) | E-2 switcher |
| `POST /api/dashboards` | create `{name, scope}` → row | E-3/E-4/E-5 |
| `GET /api/dashboards/[id]` | **replay** (zero-AI): per placement `{dashboard_widget_id, widget_id, kind, title, viz_config, layout, rows, resolved, explainerFacts, explainer}` + dashboard `breakpoints` (CONCEPT §8; contract N-6) | E-10 grid, Screen-2 cards |
| `PUT/PATCH /api/dashboards/[id]/layout` (or on the placement) | persist `{x,y,w,h}` per breakpoint to `dashboard_widgets.layout` + `dashboards.breakpoints` | E-12/E-13 (N-4) |
| `POST /api/dashboards/[id]/widgets` | create a **placement** `{widget_id, layout}` | E-23 drag-to-place, E-73 save-then-place |
| `DELETE …/widgets/[placementId]` | remove a placement (not the widget) | E-15 |
| `GET /api/widgets` | library list (starter + AI-built + own) | E-20 palette |
| `POST /api/ai/widget-builder` | SSE tool loop; tools `build_widget` (preview), `save_widget` (persist + explainer), plus reuse `probe_data`/`list_dimensions`/`run_metric`/`final_answer` (CONCEPT §7) | Screen 3 |

> Several of these (`GET /api/dashboards/[id]` replay, `GET/POST /api/dashboards`, `GET /api/widgets`) are **already under construction** in the repo's active build track — this map documents the UI contract against their output; it does not re-specify the server. `compileSpec` + the SSE event additions are the remaining server seams (N-5/N-6).

---

## NOVA Items (build tasks / risks)
- **N-1** Apply the gated migration package (3 tables `widgets`/`dashboards`/`dashboard_widgets` + RLS mirroring `0029`/`0032` + the `is_starter` seed). Written as a **FILE flagged NEEDS-APPROVAL** per CLAUDE.md — **not applied in this phase.** FELIX validates RLS/FKs/idempotent seed; SAGE gates. (CONCEPT §6/§10.1.)
- **N-2** Add **`react-grid-layout`** as the only new layout dependency (CONCEPT §9). Wire `ResponsiveGridLayout` with 12 cols at `lg` → 1 col at `xs`. Provide a width provider (the page is full-width, not `max-w-3xl`).
- **N-3** **Renderers reuse only** — do not author new chart/grid/metric components. Line/bar/area = the `ChartBlock` from `dashboard/ai/page.tsx`; grid/pivot = `WebDataRocksGrid`; metric_card = `KpiCard`/`KeyMetricCard` from `dashboard/ui`. Factor `ChartBlock` out of the page into a shared module so both the builder preview and the grid card import one copy.
- **N-4** **Layout persistence:** on drag/resize end, write the active breakpoint's `{x,y,w,h}` to `dashboard_widgets.layout` and the breakpoint map to `dashboards.breakpoints` (optimistic + async; never block the UI). Debounce rapid moves. Per-placement, so the same widget keeps independent size/pos per dashboard.
- **N-5** **SSE `widget`/`grid` event handling:** the existing parser handles `text`/`chart`/`data_review`/`final`/`error`/`done`. Add handling for a **pivot/grid + metric preview** event (the builder must preview grid/pivot/metric, not just line/bar/area). Define the event name + payload (proposal: reuse `chart` for line/bar/area; add `widget` carrying `{kind, viz_config, rows, resolved}` for the other three). **FLAG — confirm event shape with the builder route author.**
- **N-6** **Replay output contract:** finalize the per-placement object `{dashboard_widget_id, widget_id, kind, title, viz_config, layout, rows, resolved, explainerFacts, explainer}`. `rows` feeds chart/grid; `resolved` feeds metric_card; `explainerFacts` = `describeSpec(spec)` (→ `SpecExplainer`); `explainer` = stored narrative. Per-widget error field for schema drift (E-57). Reconcile against the in-flight replay endpoint.
- **N-7** **`describeSpec()` (flip-to-explain facts):** a deterministic spec→`SpecExplainer` function (summing/refresh/currentlyShowing/included), resolving the window against the **server date** at call time. Mirror the rolling-window math in `dashboard.ts`. Zero AI. (CONCEPT §9.1; types already in `spec.ts`.)
- **N-8** **Role gating:** viewer = read-only — hide library (E-20), Build-with-AI (E-41), card menu/Edit (E-52), "Ask about this" (E-66), drag/resize (E-12/E-13), create (E-3). Keep the flip *read* panel for viewers only if O-4 = keep. Church-scope writes require manager/editor+; user-scope writes require owner (CONCEPT §6).
- **N-9** **DS-2 NO RED in renderers:** the reused `ChartBlock` palette includes `#ef4444` (red) and the `dashboard/ai` `DeltaBadge` uses `bg-red-50 text-red-600`. **Both violate DS-2.** In the shared/extracted `ChartBlock`, replace the palette with DS-1 lanes (brand `#4F6EF7`, violet `#8B5CF6`, teal `#06B6D4`, sage `#22C55E`, amber `#F59E0B`) — never red; and use the DS-compliant `DeltaBadge` from `dashboard/ui` (sage/amber) for any metric delta.
- **N-10** **Zero-AI on view:** the grid load path (`GET /api/dashboards/[id]`) and opening any explainer must make **no Anthropic call** (CONCEPT §8). Only E-41/E-72/E-73/E-66/E-74 spend AI; budget meters build/edit only (`ai_usage_periods`).
- **N-11** **Schema-drift guard (E-57):** a per-widget calm error state when a spec references a deleted metric/tag — never a crash, never red (DS-2). Surface Edit to fix (non-viewer).
- **N-12** **Mobile:** reflow to 1-col on phones (E-14). Library becomes a bottom sheet/drawer, not a left rail. Decide whether drag/resize is enabled on touch (lean: read-only stack on mobile is acceptable — O-2).
- **N-13** **Additive guarantee:** do **not** import from or modify `dashboard/page.tsx` or `dashboard/viewer/page.tsx` logic; reuse only the **presentational** primitives in `dashboard/ui` + `entries/ui`. New page, new routes, new tables (CONCEPT §9.2).
- **N-14** **Nav surfacing deferred:** how `/dashboard/custom` is reached (bottom-nav tab vs a sub-tab/link off the dashboard) is **explicitly deferred until the page proves out** (CONCEPT §9.2). For build, link in minimally (e.g. a link from `/dashboard/ai` or a temporary entry) and update `NAV_MANIFEST.json`/`FLOW_REPORT.md` **only when** placement is decided. Do not invent a permanent nav slot now.

---

## Completion / empty / error states (summary)
- **Grid loading:** per-widget skeleton (E-56); never blank, never throw.
- **Empty dashboard:** E-16 (has dashboards, no widgets placed).
- **No dashboards:** E-17 (first-run; create or auto-seed a default).
- **Per-widget empty:** E-58 (zero rows this window).
- **Per-widget error / schema drift:** E-57 — calm, NOT red, Edit-to-fix.
- **AI exhausted:** builder + "Ask about this" disabled with `AiExhaustedBanner`; **replay/grid/explainer keep working** (zero-AI).
- **Viewer:** read-only grid of the shared church dashboard; no library, no builder, no rearrange, no Edit; flip-read panel per O-4.

---

## DS compliance checklist (BINDING — DESIGN_SYSTEM.md)
- **DS-2 NO RED** anywhere — deltas/errors/empties use sage/amber/slate (audit the reused `ChartBlock` palette + `DeltaBadge`, N-9).
- **DS-4** all numerals `.font-num` (Fira Code, `tabular-nums`) — metric cards, axis values, explainer date ranges.
- **DS-1/DS-3** brand `#4F6EF7` for interactive/primary; ministry lanes (blue/violet/teal) for category only; slate for metadata; never cross lanes.
- **DS-5/DS-7** cards `rounded-2xl border-slate-200 shadow-sm` + left accent bar; header row = accent + title + trailing control.
- **DS-8/DS-16** category/scope labels = plain text + leading middle-dot or neutral slate tag, **never colored pills**.
- **DS-14** icons SVG only (reuse the `Ico` set: `barChart`, `grid`, `layers`, `plus`, `gear`, `pencilFill`, `check`, `chevron`); **never emoji/unicode glyphs** (the ⓘ flip icon must be an SVG, not the `ⓘ` character).
- **DS-15** secondary controls (flip ⓘ, card ⋯, remove) low-chrome — no background until hover.
- **DS-17/DS-18/DS-19** flip transition 150–300ms (respect reduced-motion); status never color-only; visible brand focus ring; touch targets ≥44px.
- **DS-23** declutter — no redundant total card, no loud "summed" pills, no status-legend card on the canvas.

---

## Open Items (decisions for the Builder — copy/role/UI)
- **O-1 (role):** Does `editor` edit **church-wide** dashboards/widgets, or only its **own**? Concept says "editor+ build/edit CHURCH dashboards" (yes) but the RLS note pairs church-scope writes with `is_church_manager()` OR editor+. Lock the exact predicate before wiring N-8.
- **O-2 (UX):** Drag/resize on **mobile/touch**, or read-only 1-col stack on phones? Lean: read-only stack (rearranging a 1-col list is low value).
- **O-3 (seed):** Does a new church **auto-get** a default church-wide dashboard (so the grid is never empty), and what is the **default starter widget set**? (CONCEPT §11 lists this as open.) Affects E-17 vs E-16.
- **O-4 (role):** Do **viewers** get the flip-to-explain **read** panel (E-60…E-65, zero-AI, read-only) on shared widgets, or no flip at all? Lean: keep the read panel (it's safe + helpful), hide only "Ask about this" (E-66).
- **O-5 (UX/product):** Can a per-user (`scope='user'`) widget/dashboard be **promoted** to church-wide? (CONCEPT §11 open.) If yes, where's the control (a manager-only "Make shared" on E-2/the card)?
- **O-6 (UX):** Does the custom page need a **campus context** control at all, or do specs carry their own location filters? Lean: no page-level campus pill; filtering lives in the spec.
- **O-7 (architecture/UX):** Builder **lives where** — reuse `/dashboard/ai` in build mode (simplest, reuses chat+recharts+budget) vs an in-page panel/drawer on `/dashboard/custom`? Bindings hold either way.
- **O-8 (copy):** All UI strings here are **proposals** — eyebrow ("CUSTOM DASHBOARDS"), empty/error/builder copy, "Build with AI"/"Ask about this"/"Make shared" labels, seed prompts. Copy is a Builder decision (humanizer pass).
- **O-9 (UX, pivot):** Confirm the **two-dimension pivot** renders correctly via `WebDataRocksGrid` before the spec shape freezes (AXIOM stress case, CONCEPT §11) — affects E-54.

## Concept References
CONCEPT §1 (pin the answer) · §2 (spec not SQL; `query_kind` reserved) · §3 (DSL shape — measure×dimension×time) · §4 (rolling windows live, resolved at replay) · §5 (RLS isolation, not query-dependent) · §6 (3-table model + RLS) · §7 (AI tools: `build_widget`/`save_widget`) · §8 (zero-AI replay + schema-drift guard) · §9 (canvas + library) · §9.1 (flip-to-explain + cost model + "Ask about this") · §9.2 (standalone `/dashboard/custom`; D1/D2 untouched; nav deferred) · §11 (risks/open items). Spec types: `src/lib/widgets/spec.ts`. DS: DESIGN_SYSTEM DS-1…DS-25.
