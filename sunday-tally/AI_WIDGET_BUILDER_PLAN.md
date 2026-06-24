# AI Dashboard Builder + Widget Library — Hardening & Completion Plan

> **Status:** PLANNING (second pass, sub-agent-assisted). Ready for joint review.
> **Created:** 2026-06-20 · **Bar:** production-hardened (P0–P2) · **Owner gate:** SAGE (nothing ships without SAGE).
> **Not yet implemented** — this is the roadmap. No code changed; no migrations applied.

---

## Progress log — 2026-06-21 (branch `harden/widget-builder-p0`, not yet merged)

**Shipped to the branch, verified (161 tests green, typecheck clean):**
- ✅ WS1.1 metric-isolation guard — `RESPONSE_STAT` on `metric_entries_readable` now must isolate the stat (`metric_names` or a `metric` dimension); empty `metric_names` rejected. `VOLUNTEERS` exempt (additive total — keeps "Volunteers by ministry" starter working; **open decision resolved this way**). `7988f60`
- ✅ WS1.3 build-before-save gate — `save_widget` refuses an un-previewed or zero-row spec (closure tracks last successful preview; edits exempt). `7988f60`
- ✅ WS5 backwards custom date-range rejected. `7988f60`
- ✅ WS1.4 vanished edit target now tells the user instead of silently building fresh. `7988f60`
- ✅ WS2 senior-analyst prompt + 5-point pre-`final_answer` self-critique. `6054f48`
- ✅ WS4 per-church context pack (`churchContext.ts`) — ministry tree, what each tracks, church-wide giving, total-inclusion rule — injected into the builder prompt; derived-live, defensive. `82c541e`

**Findings (investigations):**
- 🟢 **Week-boundary: NOT a bug.** `bucketKey` + `weeklyAvg` both use `weekStartOf` (Sunday-anchored), consistent with `giving_per_week`. Only a misleading "ISO week" comment — corrected.
- 🟢 **Starter-seed: healthy.** Demo has its 5; **zero churches in prod are missing starters**.
- 🔴 **Build-gate gap was real** (now fixed) — `save_widget` previously never checked that a preview happened.
- 🔴 **Atomicity confirmed** — `save_widget` INSERTs widget then placement separately (orphan on placement failure). Deferred (see below).

**Remaining — needs you (verification / budget / approval), best done together:**
- WS6 schema-drift staleness warning · viewer permission gating · library CRUD endpoints+UI · scale guards · title collisions · bulk ops — these touch the live dashboard read path + UI; want browser verification, not blind edits.
- WS1.2 atomicity — migration `0044` RPC is a **NEEDS-APPROVAL** decision (RPC vs client-cleanup); build-gate already removes most bad-save paths, so lower urgency.
- WS7 zero-data first-run · unit formatting · mobile · timezone — UI/rendering, want live verification.
- **Live edit + new validation cycle** — needs AI budget + browser (your call to spend).

---

## 0. Context & locked decisions

**Goal (from Daxx):** validate the AI dashboard builder is solid (edit + make new); train the prompt to be an analytical senior designer; give the AI a per-church "how this church is wired" reference; widgets request required inputs + show examples so they behave correctly; all widgets dynamic; Widget Library complete & thorough.

**Locked decisions this session:**
- **Snapshot reframed (important):** NOT a weekly analytics digest. It is a **per-church structural & semantic context pack** — a roadmap so the AI understands *how each individual church is set up*: its own vocabulary (tag/metric names + synonyms), what rolls up together, what's included vs excluded from totals, and church-specific rules. So when a pastor uses their own words, the AI maps them to the right tags/metrics/rollups/total-rules for THAT church.
- **Input handling = "infer + show examples + let user correct"** — the AI makes its best guess, previews with the actual numbers, and lets the user confirm/correct (fewest round-trips).
- **Completeness bar = production-hardened (P0–P2)** — the full sweep, not just demo-solid.
- This is a **planning pass for joint review tomorrow**, produced via the sub-agent protocol so the working window keeps context.

**Deploy state:** the schedule date-range hardening (`cdb8faa` + migration `0043`) is **live in production** (ancestor of current prod tip `2456b22`, READY).

---

## 1. Reality check — the builder is already ~70% of the vision

| Goal | Current reality | Gap |
|---|---|---|
| All widgets dynamic | **Done.** Saved widgets store a *spec*, not frozen SQL. Replay (`GET /api/dashboards/[id]`) recompiles with server `now` every load → relative windows always mean "from today." | Close two edge gaps (WS5). |
| Edit + make new | **Both exist.** Edit-in-place UPDATEs the same row (not a clone); new builds save to a church/private library. | Harden trust gaps (WS1). |
| Senior-designer prompt | **Partly there** — prompt already has a "DASHBOARD DESIGN SENSE" block. Good junior designer, not yet senior analyst. | Elevate (WS2). |
| Per-church context | `list_dimensions` gives live structure per build; no persisted semantic/rules pack. | Build context pack (WS4). |
| Required inputs + examples | `build_widget` previews live; nothing *enforces* required inputs (e.g. metric isolation). | WS1 + WS3. |
| Library working & complete | Tables + RLS + placement + starter set exist. | CRUD, permissions, scale (WS6). |

**Architecture (verified):** `widgets` / `dashboards` / `dashboard_widgets` (migration 0033, RLS by church + scope). Spec compiler in `src/lib/widgets/compile.ts` (validate → resolve window → plan → run); tools in `src/lib/ai/widgetTools.ts`; builder route + system prompt in `src/app/api/ai/widget-builder/route.ts`; UI in `src/components/widgets/{DashboardCanvas,WidgetChat,ui}.tsx`. Four data views: `attendance_per_occurrence`, `volunteers_per_occurrence`, `giving_per_week`, `metric_entries_readable`.

---

## 2. Workstreams

### WS1 — Builder solidity & correctness · **P0**
A *wrong* widget is worse than none. Four real defects:

1. **Metric-isolation guard (P0).** `compile.ts`: a `RESPONSE_STAT`/`VOLUNTEERS` measure on `metric_entries_readable` with **no `metric_names` filter** silently SUMs every metric in that family (Hands Raised + Parking + Rooms…). Prompt warns; nothing enforces.
   - **Fix:** in `validateSpec()` (~line 215), hard-error when source is `metric_entries_readable` and measure is `RESPONSE_STAT`/`VOLUNTEERS` and `metric_names` is absent/empty. Also reject empty `metric_names: []`. Pre-pivoted views (`volunteers_per_occurrence` etc.) are exempt (already single-measure).
   - **Watch:** the starter widget "Volunteers by ministry" uses `VOLUNTEERS` on the firehose with a ministry *dimension* and no `metric_names` — decide if dimension-axis isolation counts as legitimate (likely yes) so the guard doesn't break the starter.
   - **Test:** add cases — RESPONSE_STAT w/o metric_names rejected; empty array rejected; pre-pivoted view allowed.

2. **Widget+placement atomicity (P0).** `save_widget` does INSERT widget then INSERT placement as two calls — a placement failure orphans a saved-but-unplaced widget; retry duplicates.
   - **Fix (preferred):** new migration `0044` adding `insert_widget_with_placement(...)` RPC (SECURITY DEFINER) so both inserts are one transaction. **Migration = NEEDS-APPROVAL (write file, don't apply).**
   - **Fallback:** client-side cleanup (delete orphan on placement failure) — not truly atomic.

3. **Build-preview-before-save gate (P0).** Confirm whether `save_widget` can run without a prior successful `build_widget`. Make a sane preview a precondition.
   - **Fix:** route tracks "a build just succeeded for this spec" (boolean flag, or spec-hash for strictness); `save_widget` rejects an un-previewed or zero-row spec unless explicitly acknowledged (`skip_build_gate` for title-only edits). Overlaps WS3.

4. **Edit-in-place silent fallback (P1→P0 for trust).** `route.ts` (~161-182): a missing/cross-church `edit_widget_id` silently becomes a fresh build with no notice.
   - **Fix:** when the widget can't be loaded, emit a `text` event "Couldn't find that widget — starting fresh" so the user knows.

### WS2 — Prompt → analytical senior designer · **P1**
Elevate the persona. Concrete additions to the system prompt (`route.ts`), on top of the existing DESIGN SENSE block:
- **Decision-first framing:** open by asking "what decision does this widget inform?" Lead with the metric that drives action.
- **Baselines mandatory (harden existing rule):** never a bare number — always pair with prior-year / trend / goal. Make it a hard default, not an offer.
- **Self-critique pass before `final_answer`:** the model checks its widget against a rubric — right viz for the question? glanceable in 5s? single metric isolated? dynamic (relative) window? comparison present? If any fail, fix before finishing.
- **Proactive diagnosis (feeds on WS4):** surface what's notable, not just what was asked, grounded in the church context pack.

### WS3 — Required inputs + examples + correctness self-check · **P0/P1**
Per "infer + show examples + let user correct":
- **Archetype input contracts:** define required params per widget type — single-stat → MUST name the metric (ties to WS1.1); ministry breakdown → MUST use `metric_entries_readable`; ratio → MUST have numerator+denominator. The compiler/guards enforce; the prompt teaches.
- **Example-grounded confirmation:** before save, the AI states the *actual* numbers it found ("Salvations: 3 last week, 47 YTD — look right?") so the church verifies behavior, not just a title.
- **Build-preview gate:** = WS1.3 (can't save an unvalidated/zero-row widget without acknowledgment).

### WS4 — Per-church structural & semantic context pack · **P1** (the reframed "snapshot")
**Design: derived-live, ~100 LOC, no new storage for v1.** Assemble per-church on each builder request and inject into the system prompt.

- **What it captures:** vocabulary (ministry/metric/service/group names + codes), ministry tree (`service_tags.parent_tag_id`), metric rollup chains (`metrics.parent_metric_id` / `mode` / `rollup_op`), total-inclusion rules (`churches.dashboard_prefs.excludedTotalMinistries`), the six hard DB rules, cadence/period defaults, active-data window.
- **Where the truth already lives:** `service_tags` (names, tree, role), `metrics` (code, scope, canonical, rollup), `service_groups`, `dashboard_prefs.excludedTotalMinistries` (+ legacy `grid_config` fallback). All live in schema → **derive on demand, no cache/staleness.**
- **Build:** new `src/lib/ai/churchContext.ts` → `buildChurchContextPack(supabase, churchId)`; ~10 indexed queries (~50-100ms). Inject a "THIS CHURCH'S STRUCTURE" section into the builder system prompt (before "THE FOUR DATA SOURCES"). **Complements** `list_dimensions` (pack = semantic understanding; tool = canonical live state) — does not replace it.
- **The one real gap → synonyms.** "Also known as" is **not stored anywhere**. Without it the AI must guess that a pastor's word maps to a tag. **Phase 2:** add `service_tags.synonyms TEXT[]` (migration, NEEDS-APPROVAL) + a Settings UI to edit aliases. For v1, the AI infers synonyms from names + context.
- **Phase 2 also:** per-reporting-tag total exclusions (today `excludedTotalMinistries` is one flat array; can't say "attendance includes all but giving excludes online").

### WS5 — Dynamic guarantee (close the gaps) · **P1**
Mostly done (replay recompiles relative windows). Finish:
- **Backwards-range validation:** `validateWindow()` — reject `custom` where `start > end` (today silently returns nothing). Also validate dashboard date-override params (`?from/&to`) the same way.
- **Custom-on-rolling guard:** strengthen the prompt + a semantic check so the AI never persists a `custom` (frozen) window for a "this/current/rolling/last-N" request. Document `windowOverride` is temporary and never persisted.

### WS6 — Library completeness (CRUD · permissions · scale) · **P1/P2**
What "complete & thorough" requires:
- **Library CRUD (P1):** new endpoints — `GET /api/widgets/[id]` (load for edit), `PUT /api/widgets/[id]` (rename/metadata), `POST /api/widgets/[id]/duplicate`, `DELETE /api/widgets/[id]` (library delete; `dashboard_widgets.widget_id` is `ON DELETE CASCADE`, so placements auto-remove — warn "removes from N dashboards" first). Today you can only place/remove a *placement* + AI edit-in-place.
- **Viewer permission polish (P1):** edit/build/delete controls are shown to viewers, who then hit 403. Gate them by role in `DashboardCanvas`/`ui.tsx` (hide affordances). Server gates already correct.
- **Schema-drift staleness (P1):** a saved widget whose metric/ministry was renamed/deleted renders a silent "No data" card. Detect + surface "this widget's data source changed — rebuild it." (replay endpoint + `ErrorState`).
- **Starter-seed verification (P1):** `seed_starter_widgets` IS called at signup (`signup/actions.ts:98`, non-fatal). **Verify it actually runs for new churches** (query `widgets WHERE is_starter` = 5) — flag if broken.
- **Scale guards (P2):** paginate `GET /api/widgets` (limit/offset + count); row cap on replay (e.g. 2000 rows/widget with "showing top N").
- **Title collisions (P2):** AI-built widgets allow duplicate titles (unique only on starters). Dedupe-suggest or warn at save.
- **Bulk + multi-dashboard (P2):** clear-all placements; move widget between dashboards.

---

### WS7 — Correctness & rendering edge cases (surfaced in goal-validation) · **P1/P2**
Things a "thorough" library must handle that the first pass under-covered:
- **Week-boundary consistency (P1, correctness).** `giving_per_week` anchors weeks on **Sunday** (`week_start`), but the compiler's `weekly_avg` SUMs within **ISO (Monday-start) weeks**. A Sunday service and its giving can land in *different* week buckets, skewing any weekly average or per-capita ratio. **Action:** confirm the week anchor is consistent across the views and the compiler; align to the church's Sunday week. This is a silent-wrong-number risk, same class as the metric-isolation bug.
- **Brand-new / zero-data church (P1).** A church building its first dashboard before any entries exist: confirm `probe_data` + `build_widget` degrade gracefully ("no data in this window yet") rather than erroring, and that the starter set + empty-state guidance make the first-run experience sensible.
- **Number formatting by unit (P1).** Giving must render as **currency**, ratios as **%** (scale), counts as integers. `reporting_tags.unit_kind` (count|currency) exists — confirm the renderers (`ui.tsx`) format by unit_kind rather than raw numbers, including the metric_card headline + prior/delta.
- **Mobile / responsive rendering (P2).** Dashboard uses react-grid-layout (12-col); confirm metric cards + charts + pivot tables are legible on a phone (a pastor checking numbers Sunday morning). Pivot/grid tables especially.
- **Timezone of "now" on replay (P2).** Relative windows resolve against server `now` (likely UTC). Confirm "this week/month/YTD" matches the church's local calendar near day boundaries.

## 3. Prioritized completeness checklist

**P0 — trust (ship before calling it "solid"):**
- [ ] Metric-isolation guard (WS1.1)
- [ ] Widget+placement atomicity / RPC migration 0044 — NEEDS-APPROVAL (WS1.2)
- [ ] Build-preview-before-save gate (WS1.3 / WS3)
- [ ] Edit-in-place "not found" notice (WS1.4)
- [ ] Schema-drift staleness warning (WS6)
- [ ] Verify starter-set seeding runs for new churches (WS6)
- [ ] Week-boundary consistency — investigate Sunday (views) vs ISO/Monday (weekly_avg) mismatch; fix if confirmed (WS7)
- [ ] Live edit + new validation cycle (prove the round-trip)

**P1 — complete the experience:**
- [ ] Senior-designer prompt + self-critique (WS2)
- [ ] Required-input contracts + example confirmation (WS3)
- [ ] Per-church context pack, derived-live (WS4)
- [ ] Backwards-range + date-override validation; custom-on-rolling guard (WS5)
- [ ] Library CRUD endpoints + UI (WS6)
- [ ] Viewer permission gating in UI (WS6)
- [ ] Zero-data / brand-new-church first-run handling (WS7)
- [ ] Number formatting by unit_kind — currency/%/count (WS7)

**P2 — scale & polish:**
- [ ] Widgets-list pagination + replay row cap (WS6)
- [ ] Mobile / responsive rendering of cards, charts, pivots (WS7)
- [ ] Timezone of "now" vs church local calendar near day boundaries (WS7)
- [ ] Title-collision handling (WS6)
- [ ] Bulk clear-all + move-between-dashboards (WS6)
- [ ] Synonyms column + Settings UI (WS4 Phase 2)
- [ ] Per-reporting-tag total exclusions (WS4 Phase 2)
- [ ] Dedicated `widget_builder` AI budget bucket (currently reuses `analytics_chat`)
- [ ] Deferred data-source gaps: filter-by-service-code, location grouping dimension, giving categorical axis (unlock more widget types)
- [ ] Spec versioning / v2 migration path

---

## 4. Suggested implementation order (post-review)
1. WS1.1 metric-isolation guard (highest impact/effort; no DB change)
2. WS1.4 edit-in-place notice + WS5 window validation (small, no DB change)
3. WS6 schema-drift messaging + viewer gating (trust + UX, no DB change)
4. WS1.3 build-preview gate (route + tools coordination)
5. WS4 context pack (new file + prompt injection; no DB change for v1)
6. WS2 senior-designer prompt + self-critique
7. WS6 library CRUD endpoints + UI
8. WS1.2 atomicity RPC (migration 0044 — needs approval)
9. P2 sweep (pagination, caps, bulk, synonyms, budget bucket)

---

## 5. Open decisions for review
- **Starter "Volunteers by ministry" vs the isolation guard** — confirm dimension-axis isolation is acceptable (so the guard doesn't reject the starter).
- **Synonyms (WS4 Phase 2)** — worth a migration + Settings UI now, or rely on AI inference for v1?
- **Build-preview gate strictness** — boolean "a build succeeded" flag vs spec-hash match (stricter, catches build→edit→save).
- **Atomicity approach** — RPC migration (clean) vs client-side cleanup (no migration).
- **Library delete UX** — hard delete with "removes from N dashboards" warning, or soft-archive?

---

## 6. Hard constraints honored in this plan
No DB mutations or migrations applied (migrations 0044 + synonyms are written-as-files/NEEDS-APPROVAL at implementation time). Read-only analysis only. Six Critical DB Rules respected throughout (status='active'; group by tag_code; volunteers calculated; NULL≠0; SUM giving; tags pre-stamped). Plan is uncommitted.
