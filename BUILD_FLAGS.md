# BUILD_FLAGS.md
## Open items requiring human decision before proceeding

Format: [SCREEN or FILE] — [what is ambiguous] — [what you need to proceed]

---

## Active Flags

- **[migrations 0046 + 0047 trial lifecycle]** — ✅ APPLIED to prod DB 2026-06-26 (via Supabase MCP). 0046 = `churches.expired_at/deleted_at/widget_retention_at` + functions `_wipe_church_content`, `reset_church_data` (owner-checked RPC), `purge_church` (service-role), `delete_dropped_ai_widgets`. **0047 = corrective:** `reporting_tags` has a `trg_protect_system_reporting_tags` BEFORE DELETE trigger that RAISES on `is_system=true` — so the original wipe would have FAILED reset/purge on every real church. 0047 redefines `_wipe_church_content` to disable that trigger for the scoped wipe only. Verified live: columns+functions present; `reset_church_data` rejects non-owner (C3); full `purge_church` on a synthetic church with a system tag deletes everything cleanly (rtags=0). **Cron `/api/cron/lifecycle` NOT yet deployed** — first prod run will mark expired_at on all calendar-expired churches + soft-delete any >30d past trial + email owners (639 churches, many old test signups) — decide cleanup before deploying.

- **[D1 Full Dashboard]** — in-flight revision from v1.0 to v2.0 (four-column sectioned layout, church-wide, tag grouping removed except inside Other Stats) — **blocks any D1 code change until Owner signs off on the revised `IRIS_D1_ELEMENT_MAP.md`, `DECISION_REGISTER.md` (D-033/D-041/D-044 revisions + D-053/D-054/D-055 additions), and `QUERY_PATTERNS.md` P14d–P14g additions.** Plan: `C:\Users\daxxr\.claude\plans\inherited-enchanting-tome.md`.

- **[D2 Viewer Summary]** — D-026 says viewer mirrors Owner/Admin comparison layout. D1 v2.0 redesign invalidates that for now. **D2 follow-up decision deferred** — when D1 v2.0 ships, confirm whether D2 adopts the same four-column shape or keeps v1.0. Interim: D2 received a lightweight adapter (2026-04-17) to consume the new `DashboardData` shape from `dashboard.ts` so the app compiles. Current D2 renders: KPI tiles (attendance + giving, no volunteers per D-026), plus one Summary card with Grand Total · Adults · Kids · Youth · First-Time Decisions · Giving in the 4-column grid. Audience sections, Volunteer Breakout, Other Stats are **not** rendered on D2. Needs owner review before this becomes the permanent D2.

- **[T_HISTORY]** — ✅ RESOLVED 2026-04-26. Screen built and deployed. Race condition fix (setChurch ordering) applied.

- **[T_WEEKLY]** — New screen added 2026-04-26. Full new-screen protocol applied: IRIS_TWEEKLY_ELEMENT_MAP.md created, NAV_MANIFEST updated, FLOW_REPORT updated, P16a/P16b added to QUERY_PATTERNS.md, D-056 added to DECISION_REGISTER.md, migration 0013_period_giving.sql written. **Ready to build.** Route: `/services/weekly`. Roles: O, A, E. Requires migration 0013 to be run in Supabase before the page is live.

- **[MAIN tracking toggle]** — Built 2026-04-24. Migration 0015_main_attendance_toggle.sql adds `tracks_main_attendance BOOLEAN DEFAULT true` to `churches`. UI changes propagated through `src/types/index.ts`, `settings/tracking/page.tsx` (new toggle row), `services/page.tsx` (cards completion logic), `services/[occurrenceId]/page.tsx` (cards visibility + summary), `services/[occurrenceId]/attendance/page.tsx` (Main field hidden when false), `services/history/page.tsx` (Main sub-column conditional), `lib/dashboard.ts` (grand-total signature accepts `tracks_main_attendance`, fall-back logic when MAIN is untracked). **Migration 0015 must be run in Supabase before this code is deployed.**

- **[T_WEEKLY_STATS]** — Built 2026-04-24. Route: `/services/weekly-stats`. Reads/writes `church_period_entries` with `service_tag_id IS NULL` for `stat_scope='week'` response_categories. Mirrors `/services/weekly` UI conventions (Sunday-anchored week navigator, save/clear/N/A states). Header link added to `/services` next to Weekly. Relies on migration 0014 (already applied). **No new migration required.** Pending docs: NAV_MANIFEST, FLOW_REPORT, QUERY_PATTERNS P16c/P16d, IRIS_TWEEKLYSTATS_ELEMENT_MAP.md.

- **[M3 service entry reversal]** — DEFERRED. Reverses the service-occurrence detail screen from process-organized cards (Attendance · Volunteers · Stats · Giving) to audience-organized cards (Adults · Kids · Students) when church operates in M3 mode. Blockers before any code change: (1) decide where `structural_meaning` (M1/M2/M3) is persisted on `churches` — likely a new column populated from Q-PAT-1 during import finalization; (2) a new IRIS map for the M3-shape detail screen; (3) decide whether existing per-process screens become per-audience entry surfaces or remain reachable via secondary nav. **Needs owner sign-off on architecture before code lands.**

### Services / What-We-Track Restructure — round started 2026-06-09 (plan approved; migrations 0036–0039 are FILES ONLY, NEEDS-APPROVAL)

- **[Church-wide services · campus-filter semantics]** — `service_templates.location_id IS NULL` = church-wide (0036). DECIDED default: campus-filtered reporting (AI-widget `?campus=`, future per-campus views) **EXCLUDES** church-wide rows; they appear only under "All campuses". This needs zero compiler change (`.in('location_id', ids)` never matches NULL). **Override path if Owner reverses:** swap the widget location filter to `.or('location_id.in.(…),location_id.is.null')` in `src/lib/widgets/compile.ts` (one line) — flag before changing.
- **[Reporting groups · dashboard + history]** — `service_groups` (0037) + widgets dimension land this round; **grouping the main Dashboard cards / History columns by reporting group is DEFERRED**. Decide after morning/evening widgets prove the shape.
- **[Life Groups remodel · data script caveat]** — `scripts/data-fixes/life_groups_remodel.sql` repoints old "Tabors Life Group" instances to the new church-wide "Life Groups" template and NULLs their location. Church totals/History identical (baselines in-script); **campus-filtered widgets stop seeing Tabors history** (by design per the semantics above). Run manually AFTER 0036; explicit per-script approval required.
- **[Giving conversion]** — demo "Giving" metric is mis-stamped (RESPONSE_STAT, scope='instance', no service → unreachable; never feeds `giving_per_week`). DECIDED (Daxx 2026-06-09): **convert, never link** — scope='period' weekly + GIVING reporting kind via `scripts/data-fixes/giving_to_weekly.sql`. "You wouldn't think 'I need to add Giving to services'."
- **[P5/P6 merge gates]** — entries `show_in_entries` filter + church-wide `.or()` code must NOT merge to main before **0036** applies (column/null semantics); widgets `service_group` dimension must NOT merge before **0037+0038** apply.

### AI Widgets (CONCEPT_AI_WIDGETS.md) — SHIPPED to production 2026-06-09 (0033+0035 applied; flags below kept for the open decisions)

- **[AI Widgets · 0033 write role]** — church-scope writes use `get_user_role(church_id) IN ('owner','admin','editor')` (editor+, matching 0032), per CONCEPT "editor+". Live `is_church_manager()` = owner/admin only. **Confirm editor+ vs owner/admin-only** before applying 0033; if owner/admin-only, swap the three church-scope predicates to `is_church_manager(church_id)`.
- **[AI Widgets · starter seed specs]** — `seed_starter_widgets()` is defined-not-called. Before it's called/applied, fix: starter **#3 "Volunteers by ministry" (pivot)** and **#5 "Volunteers to attendance" (ratio)** must source `metric_entries_readable` — `volunteers_per_occurrence` cannot group by `ministry_tag` and lacks ATTENDANCE for the cross-source ratio (compiler returns a graceful error otherwise). Starter **#4 "Avg weekly attendance"** is a 0-dim avg = average per *occurrence*, not per *week* (Builder's defined metric = AVG over weeks); reconcile the semantics or rename.
- **[AI Widgets · dimension coverage]** — the views expose only `service_template` (by UUID) for attendance/volunteers; **no `location` grouping**, and `service_template` "by code" needs a UUID→code resolution or a view column; giving has no categorical axis. Decide whether to extend the views or cap widget dimensions to what's supported. Compiler declines unsupported combos gracefully (no wrong numbers).
- **[AI Widgets · AI budget bucket]** — `/api/ai/widget-builder` spend currently draws the **analytics** cap (kind `analytics_chat`). Decide whether to add a dedicated `widget_builder` bucket (edits `lib/ai/budget.ts` + pricing/types).
- **[AI Widgets · Batch 2 screens]** — GATED on: (a) approve `react-grid-layout` dependency; (b) apply 0033 (per-action auth); (c) approve `IRIS_WIDGETS_ELEMENT_MAP.md`; (d) DS-2 NO-RED fix in the reused `ChartBlock` palette (`#ef4444`) + page-local `DeltaBadge` (red) before they back widget renderers; (e) resolve IRIS open items O-1…O-9 (editor/viewer roles, viewer flip-to-explain, mobile drag vs read-only, promote user→church, page copy).

---

## Resolved Flags

_(move resolved flags here with resolution note)_
