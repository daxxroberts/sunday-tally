# BUILD_FLAGS.md
## Open items requiring human decision before proceeding

Format: [SCREEN or FILE] — [what is ambiguous] — [what you need to proceed]

---

## Active Flags

- **[D1 Full Dashboard]** — in-flight revision from v1.0 to v2.0 (four-column sectioned layout, church-wide, tag grouping removed except inside Other Stats) — **blocks any D1 code change until Owner signs off on the revised `IRIS_D1_ELEMENT_MAP.md`, `DECISION_REGISTER.md` (D-033/D-041/D-044 revisions + D-053/D-054/D-055 additions), and `QUERY_PATTERNS.md` P14d–P14g additions.** Plan: `C:\Users\daxxr\.claude\plans\inherited-enchanting-tome.md`.

- **[D2 Viewer Summary]** — D-026 says viewer mirrors Owner/Admin comparison layout. D1 v2.0 redesign invalidates that for now. **D2 follow-up decision deferred** — when D1 v2.0 ships, confirm whether D2 adopts the same four-column shape or keeps v1.0. Interim: D2 received a lightweight adapter (2026-04-17) to consume the new `DashboardData` shape from `dashboard.ts` so the app compiles. Current D2 renders: KPI tiles (attendance + giving, no volunteers per D-026), plus one Summary card with Grand Total · Adults · Kids · Youth · First-Time Decisions · Giving in the 4-column grid. Audience sections, Volunteer Breakout, Other Stats are **not** rendered on D2. Needs owner review before this becomes the permanent D2.

- **[T_HISTORY]** — ✅ RESOLVED 2026-04-26. Screen built and deployed. Race condition fix (setChurch ordering) applied.

- **[T_WEEKLY]** — New screen added 2026-04-26. Full new-screen protocol applied: IRIS_TWEEKLY_ELEMENT_MAP.md created, NAV_MANIFEST updated, FLOW_REPORT updated, P16a/P16b added to QUERY_PATTERNS.md, D-056 added to DECISION_REGISTER.md, migration 0013_period_giving.sql written. **Ready to build.** Route: `/services/weekly`. Roles: O, A, E. Requires migration 0013 to be run in Supabase before the page is live.

- **[MAIN tracking toggle]** — Built 2026-04-24. Migration 0015_main_attendance_toggle.sql adds `tracks_main_attendance BOOLEAN DEFAULT true` to `churches`. UI changes propagated through `src/types/index.ts`, `settings/tracking/page.tsx` (new toggle row), `services/page.tsx` (cards completion logic), `services/[occurrenceId]/page.tsx` (cards visibility + summary), `services/[occurrenceId]/attendance/page.tsx` (Main field hidden when false), `services/history/page.tsx` (Main sub-column conditional), `lib/dashboard.ts` (grand-total signature accepts `tracks_main_attendance`, fall-back logic when MAIN is untracked). **Migration 0015 must be run in Supabase before this code is deployed.**

- **[T_WEEKLY_STATS]** — Built 2026-04-24. Route: `/services/weekly-stats`. Reads/writes `church_period_entries` with `service_tag_id IS NULL` for `stat_scope='week'` response_categories. Mirrors `/services/weekly` UI conventions (Sunday-anchored week navigator, save/clear/N/A states). Header link added to `/services` next to Weekly. Relies on migration 0014 (already applied). **No new migration required.** Pending docs: NAV_MANIFEST, FLOW_REPORT, QUERY_PATTERNS P16c/P16d, IRIS_TWEEKLYSTATS_ELEMENT_MAP.md.

- **[M3 service entry reversal]** — DEFERRED. Reverses the service-occurrence detail screen from process-organized cards (Attendance · Volunteers · Stats · Giving) to audience-organized cards (Adults · Kids · Students) when church operates in M3 mode. Blockers before any code change: (1) decide where `structural_meaning` (M1/M2/M3) is persisted on `churches` — likely a new column populated from Q-PAT-1 during import finalization; (2) a new IRIS map for the M3-shape detail screen; (3) decide whether existing per-process screens become per-audience entry surfaces or remain reachable via secondary nav. **Needs owner sign-off on architecture before code lands.**

---

## Resolved Flags

_(move resolved flags here with resolution note)_
