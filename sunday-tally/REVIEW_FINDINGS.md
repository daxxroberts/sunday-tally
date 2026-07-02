# Code Review — feat/track-mirrored-metrics + app-wide sweep

Date: 2026-07-01 · Opus 4.8 orchestration + 6 Sonnet 5 fix agents (disjoint file scopes) + hand-verification.

> The original multi-agent workflow adversarial verify pass did NOT run (hit the Claude monthly spend limit). Every FIXED/REFUTED/FLAGGED item below was verified against real code before action. All highs have been addressed (fixed, resolved-by-another-fix, or refuted); remaining FLAGGED items are display-layer or product/design decisions.

**Gates (combined tree): `tsc --noEmit` clean · `next build` success · `vitest` 52/52 pass.**
New migrations (NEEDS-APPROVAL, unapplied): `0054_review_security_fixes.sql`, `0055_mirror_uniqueness.sql`.

Disposition counts: **FIXED 53 · PARTIAL 1 · FLAGGED 7 · REFUTED 4 · DEFERRED 0** (some FIXED items also carry a FLAG — see text).

## CRITICAL (1)

| # | File:Line | Summary | Disposition |
|---|---|---|---|
| 1 | `src/app/onboarding/invite/actions.ts:66` | The onboarding sendInviteAction creates an invite for a CLIENT-SUPPLIED churchId and role with no membership or role che | FIXED — onboarding sendInviteAction gated (resolveMember+isOwnerAdmin+allowedInviteRoles); sibling removeMember/cancelInvite too |

## HIGH (20)

| # | File:Line | Summary | Disposition |
|---|---|---|---|
| 2 | `src/app/(app)/settings/track/actions.ts:720` | deactivateMinistry's hard-delete gate only probes entries on is_active=true metrics, but deleting the tag CASCADE-delete | FIXED — delete probe now counts inactive metrics (no cascade wipe) |
| 3 | `src/app/(app)/settings/track/actions.ts:997` | FREE MOVE ministry_only→template double-counts the flip week: a legacy ministry-level entry already logged for the curre | FIXED — rollups.ts descendants supersede own entry per occurrence |
| 4 | `supabase/migrations/0052_track_write_rls.sql:132` | The depth-2 trigger only checks the NEW parent's parent — reparenting a node that itself HAS children deterministically  | FIXED — 0054 trigger rejects reparenting node-with-children + FOR UPDATE; app has-children guard |
| 5 | `src/app/(app)/settings/track/actions.ts:630` | updateMinistry's mirror-strand guard only runs when the new parent is NON-null — moving a group carrying mirrors to top  | PARTIAL — has-children guard added; null-move mirror-role stranding FLAGGED (decision 7) |
| 6 | `supabase/migrations/0052_track_write_rls.sql:20` | 0052 role-gates metrics and service_tags but leaves service_template_tags — which the Track actions also write — on its  | REFUTED — service_template_tags already role-gated in migration 0029 |
| 7 | `src/lib/rollups.ts:117` | The no-double-count invariant behind sumById (template's own legacy entries + subgroup mirrors) is enforced nowhere; a p | FIXED — per-occurrence supersede in computeRollups |
| 8 | `src/app/(app)/dashboard/page.tsx:816` | grandTotalOverride subtracts each excluded section's volunteers FourWin independently, but under mirrored metrics a pare | FIXED — ancestor-aware volunteer subtraction (volunteersIsRollup); no double-subtract of parent+child in Grand Total |
| 9 | `src/lib/dashboard.ts:376` | rollupByTagKind takes the FIRST rollup metric per (ministry, kind) from an unordered, archived_at-blind metrics fetch, s | FLAGGED — take-first rollup ordering/archived hardening (design: prefer canonical?) |
| 10 | `src/app/(app)/entries/page.tsx:478` | A stale entry screen keeps writing metric_entries against a metric that was converted to a template (mode='rollup') in a | ACCEPTED — low-prob cross-tab stale write, mitigated by rollups per-occurrence supersede; display-layer |
| 11 | `src/app/(app)/entries/page.tsx:608` | The entry screen's Week totals sum only the fetched enterable metrics, so a template's own legacy entries (kept by the F | FLAGGED — entry Week-totals card doesn't roll subgroups into parent (display only; dashboard/History totals correct). Fix = mirror-aware entry totals (design) |
| 12 | `src/lib/history/derive_grid_config.ts:423` | The ministry roll-up total column's computedFrom lists only the mirror children's leaf ids and omits the template metric | FIXED — computedFrom includes template's own leaf; pre-split weeks no longer dropped from History total |
| 13 | `src/components/history-grid/HistoryGrid.tsx:563` | The READ_ONLY computed-cell branch coerces missing mirror values to 0 (String(undefined ?? '') -> Number('') === 0, whic | PARTIAL/FLAGGED — missing→0 fine for sum; op-ignored (avg/max summed) is a follow-up (plumb rollup_op to HistoryGrid) |
| 14 | `src/lib/widgets/compile.ts:878` | Container-ministry expansion folds group_only subgroup entries into a parent-ministry total, contradicting the branch's  | RESOLVED by #45 — resolveMinistryFilter passes metrics to planMinistryFilter (excludes group_only from parent expansion) |
| 15 | `src/lib/email/churchEmailData.ts:52` | church_email_stats is a SECURITY DEFINER RPC with no caller-membership check, granted EXECUTE to all authenticated users | FIXED — 0054 revokes church_email_stats EXECUTE from authenticated |
| 16 | `src/lib/email/templates.ts:155` | The new automated marketing drip (welcome + 4 nurture steps + win-back) ships with no unsubscribe link, no List-Unsubscr | FLAGGED — no unsubscribe/List-Unsubscribe; CAN-SPAM blocker (cron scheduled) |
| 17 | `src/lib/email/churchEmailData.ts:75` | church_email_stats violates Rule 1 (WHERE status='active'): weeksTracked counts service_instances of every status includ | FIXED — 0054 adds status=active to weeksTracked (Rule 1) |
| 18 | `src/lib/ai/metrics.ts:138` | attendanceByWeek's tag filter re-derives tag→occurrence association from service_templates.primary_tag_id at query time  | REFUTED — Rule 6 is pre-0022; unified schema uses primary_tag_id |
| 19 | `src/app/(app)/entries/page.tsx:320` | After a free move to template, all previously-entered weeks show blank fields and 'Attendance 0' in Week totals for that | FLAGGED — post-move blank fields on entry (same root as #11; display only) |
| 20 | `src/app/(app)/settings/locations/actions.ts:153` | checkLocationDataAction runs service-role (RLS-bypassing) count queries filtered only by the client-supplied locationId, | FIXED — target scoped to caller church before service-role probe |
| 21 | `src/app/(app)/settings/track/actions.ts:992` | FREE MOVE (ministry_only → template) leaves legacy ministry-level entries on the template while the entry screen offers  | FIXED — rollups supersede (paired with #3) |

## MEDIUM (27)

| # | File:Line | Summary | Disposition |
|---|---|---|---|
| 22 | `src/app/(app)/settings/track/actions.ts:211` | assertDepthOk treats 'parent not found in this church' as success, so createMinistry and updateMinistry accept a parent_ | FIXED — assertDepthOk errors when parent not found in-church |
| 23 | `src/app/(app)/settings/track/actions.ts:882` | addCount never verifies that ministryId belongs to the caller's church — the tag lookup silently falls back to code 'MIN | FIXED — addCount verifies ministryId belongs to church |
| 24 | `src/app/(app)/settings/track/actions.ts:733` | Every hard-delete path is check-then-delete with metric_entries ON DELETE CASCADE — an entry saved between the zero-entr | FLAGGED — hard-delete TOCTOU; needs SECURITY DEFINER RPC (design/urgency call) |
| 25 | `src/app/(app)/settings/track/actions.ts:290` | Mirror creation is check-then-insert with NO DB uniqueness on (parent_metric_id, ministry_tag_id) — concurrent setCountS | FIXED — 0055 partial unique index + insertMirror 23505 handling |
| 26 | `src/app/(app)/settings/track/actions.ts:1347` | deactivateCount's template hard-delete path re-promotes a canonical only for the MINISTRY node, not for each group whose | FIXED — per-group canonical re-promote on template hard-delete |
| 27 | `src/lib/dashboard.ts:642` | After a FREE MOVE of a RESPONSE_STAT count with data, the ministry card renders the same metric twice: the rolled-up tem | FIXED — ministry card no longer double-renders metric after free move |
| 28 | `src/app/(app)/entries/page.tsx:580` | toggleDidntMeet discards the upsert result: on failure the optimistic 'N/A this week' state, green dot, and completion t | FIXED — toggleDidntMeet reverts + alerts on failure |
| 29 | `src/app/(app)/entries/page.tsx:385` | Every loadWeek query ignores .error — a failed metric_entries prefill (or a mid-pagination failure, which the loop treat | FIXED — loadWeek surfaces load-error banner instead of silent blanks |
| 30 | `src/app/(app)/entries/page.tsx:625` | Once a ministry's attendance is mirrored to subgroups, the Week totals card for the parent ministry unconditionally show | FLAGGED — paired with #11 (entry Week-totals mirror-awareness; display only) |
| 31 | `src/app/(app)/entries/page.tsx:600` | The persisted Ministries filter silently reshapes the truth surfaces: '2 of 2 complete' can read done while hidden minis | FIXED — completion strip counts all ministries regardless of filter |
| 32 | `src/lib/history/derive_grid_config.ts:169` | The metrics fetch has no ORDER BY, so column order within each ministry group/dimension — and the position of the new ro | FIXED — deterministic ORDER BY on metrics query |
| 33 | `src/lib/history/derive_grid_config.ts:429` | Expanded mirror columns are labeled with the metric's bare name, and every mirror is created with the template's exact n | FIXED — expanded mirror columns labeled by subgroup name |
| 34 | `src/lib/widgets/compile.ts:949` | The empty-container hint (and the system prompt) tell the model to fetch the ministry TOTAL's metric name "from list_dim | FIXED — tightened container-ministry hint (name+tag pairing) |
| 35 | `src/lib/widgets/compile.ts:889` | Saved-widget replay has no drift detection for renamed or moved metrics: metric_entries_readable derives metric_name and | FIXED — schema-drift detection on empty result (reuses UI drift badge) |
| 36 | `src/lib/ai/widgetTools.ts:183` | The mirrored-count contract aggregates by NAME string, but metric names are not unique per church — two ministries' temp | FIXED — resolve by id/tag-pairing not bare name (collision-safe) |
| 37 | `src/app/api/ai/widget-builder/route.ts:60` | The prompt still recommends `dimension ministry_tag` for "attendance by ministry", but under mirrored metrics that dimen | FLAGGED — prompt caveat added; container roll-up grouping mechanism (near reserved #14) |
| 38 | `src/app/api/cron/nurture-sequence/route.ts:88` | sendOnce's dedup is check-then-send-then-insert, not atomic: two overlapping runs both pass the `prior` check, both send | FIXED — atomic claim-first dedup (0054 unique index) |
| 39 | `src/app/api/cron/nurture-sequence/route.ts:103` | Every send is gated on an exact single-UTC-day window with no catch-up and no per-church error isolation, so one missed  | FIXED — per-church try/catch isolation |
| 40 | `src/lib/email/templates.ts:164` | renderEmail interpolates user-controlled strings (churchName, firstName, inviterName) into email HTML with no escaping — | FIXED — escapeHtml on churchName/firstName/inviterName |
| 41 | `src/app/(app)/settings/track/page.tsx:87` | The track editor's ministry fetch never filters service_tags.archived_at, so a data-bearing ministry the pastor 'removed | FIXED — archived ministries hidden from Track editor (childrenOf), palette intact |
| 42 | `src/app/(app)/settings/track/components/DetailPanel.tsx:335` | Template counts are only rendered when the ministry currently has subgroups (hasGroups), so removing the last subgroup m | FIXED — template counts render even when last subgroup removed |
| 43 | `src/app/(app)/settings/track/page.tsx:265` | handleRenameMinistry and handleRoleChange apply the change to local state without checking the server action's result.ok | FIXED — rename/role revert + alert on server failure |
| 44 | `src/app/(app)/settings/track/page.tsx:277` | Archive vs delete is indistinguishable to the user and there is no restore path anywhere — the confirm copy says 'cannot | FIXED (copy) + FLAGGED — archive/delete confirm rewritten; restore-path is a product gap |
| 45 | `src/lib/widgets/compile.ts:1141` | planMinistryFilter expands a parent-ministry widget filter to ALL child-group tag codes regardless of metric role, so gr | FIXED — planMinistryFilter excludes group_only children from parent rollup |
| 46 | `src/app/api/ai/analytics/route.ts:220` | The Ask-AI analytics route's list_dimensions handler was not updated for 0051: it lists every mirror as a separate volun | FIXED — list_dimensions collapses mirrors under template |
| 47 | `src/app/(app)/dashboard/page.tsx:422` | For ministry cards whose values are per-tag or roll-up driven, the attendance drill still opens the CHURCH-WIDE role piv | FIXED (stopgap: drill disabled) + FLAGGED — proper fix needs dashboardDrilldown selector kind |
| 48 | `src/app/(app)/settings/track/actions.ts:338` | insertMirror swallows insert errors (returns null) and every caller reports success — a subgroup can silently end up wit | FIXED — insertMirror propagates errors; callers report partial failure |

## LOW (20)

| # | File:Line | Summary | Disposition |
|---|---|---|---|
| 49 | `src/app/(app)/settings/track/actions.ts:1111` | setMetricMode's entry→rollup branch now always violates chk_metric_role_mode (it flips mode while metric_role stays mini | FIXED — setMetricMode rejects mode=rollup (chk_metric_role_mode) |
| 50 | `supabase/migrations/0051_metric_role.sql:80` | The backfill classifies EVERY pre-existing entry-with-parent_metric_id row as 'mirror', converting old free-form rollup  | REFUTED — backfill mirror-classification is semantically correct (an entry with parent_metric_id IS a mirror) |
| 51 | `src/app/(app)/settings/track/actions.ts:968` | setCountSection's archived-count refusal tells the user to 'Restore it before moving it', but no restore/unarchive actio | FIXED (copy) + FLAGGED — overpromise copy fixed; restore feature is a product decision |
| 52 | `src/lib/dashboard.ts:198` | buildBoundaries mixes a UTC 'today' with local-midnight-derived week keys, so churches in UTC-positive timezones don't s | FIXED — buildBoundaries uses isoDay() consistent basis (timezone) |
| 53 | `src/app/(app)/entries/page.tsx:174` | Archived ministries (delete-with-data archives the whole tag subtree, archived_at=now, is_active stays true) still appea | FIXED — archived ministries dropped from entries filter dropdown (palette intact) |
| 54 | `src/app/(app)/history/page.tsx:274` | The occurrence query orders by service_date only, so same-date services (9 AM / 11 AM) render in nondeterministic order  | FIXED — stable same-date occurrence sort (start_datetime, template_id) |
| 55 | `src/lib/ai/churchContext.ts:93` | Church-controlled metric and ministry names are interpolated raw and undelimited into the builder system prompt (context | FIXED — sanitizeChurchText + data-not-instructions framing (prompt injection) |
| 56 | `src/app/api/ai/widget-builder/route.ts:296` | Raw internal error text is streamed to the client: the loop catch sends err.message (Anthropic SDK/API errors), fetchPag | FIXED — generic client error, detail logged server-side |
| 57 | `src/lib/ai/widgetTools.ts:328` | WidgetToolDeps.widgetCap doc says "Infinity = pro (unlimited)" but entitlements now make pro a HARD 120 cap; the field a | FIXED — widgetCap doc corrected (pro = hard 120 cap) |
| 58 | `src/lib/email/templates.ts:338` | trialLapsedWinback copy says "'s trial ended" but the cron's win-back candidates include formerly PAYING churches whose  | FIXED (copy) + FLAGGED — neutral access-paused; GROVE tone pass |
| 59 | `next.config.ts:14` | The removed 6 lines were only the `/contact` → `/` redirect (no security headers or other redirects were dropped), but i | REFUTED — removed lines were only the /contact redirect; no security headers |
| 60 | `src/app/(app)/settings/track/components/MetricRowItem.tsx:14` | Three in-file comments still describe the pre-FREE-MOVE contract and contradict the shipped behavior, and the 'Move to M | FIXED — stale pre-free-move comments updated |
| 61 | `src/app/(app)/settings/track/components/AddMetricControl.tsx:41` | A failed add clears the typed name and closes the form (the user must reopen and retype), and there is no try/finally ar | FIXED — failed add keeps input + inline error |
| 62 | `src/app/(app)/settings/track/components/MetricRowItem.tsx:52` | The abbreviated kind pill's full word is exposed only via a hover/focus Tooltip on a non-focusable span, so keyboard and | FIXED — Kind pill focusable + aria-label |
| 63 | `src/components/shared/InlineEditField.tsx:89` | InlineEditField's pencil button keeps hardcoded text-gray-400 hover:text-gray-700 while the span now inherits color — on | FIXED — pencil follows inherited color |
| 64 | `src/app/(app)/entries/components/TotalsView.tsx:160` | Week totals still colors ministry cards by tag_role (accentForRole) instead of the church-chosen ministry color used by  | FIXED — Week totals use church ministry color (colorForNode) |
| 65 | `src/app/(app)/settings/track/page.tsx:414` | Read-only users (editor/viewer) at a church with zero ministries see 'Add your first ministry. Use the button above to g | FIXED — role-aware empty-state copy |
| 66 | `src/app/(app)/entries/components/MinistryFilterButton.tsx:27` | The Ministries filter popover cannot be dismissed with Escape and manages no focus — keyboard users can open it (Enter)  | FIXED — filter popover Escape + focus + roles |
| 67 | `src/components/shared/Tooltip.tsx:28` | The new Tooltip has no Escape-dismiss (WCAG 1.4.13), no aria-describedby link to its trigger, and its content is unreach | FIXED — Tooltip Escape dismiss + aria-describedby |
| 68 | `src/app/(app)/settings/track/actions.ts:1070` | Vocabulary is split between 'group' and 'subgroup' across server error copy, editor UI, and the dashboard cue, plus seve | FIXED — group to subgroup vocab aligned (DB-verbatim msgs kept) |

## Flagged for the Builder (decisions, not guessed)

- **#16** nurture drip has no unsubscribe / List-Unsubscribe — CAN-SPAM blocker; cron IS scheduled in vercel.json (ships on deploy). Build the flow or remove the cron until built.
- **#24** deactivateMinistry hard-delete TOCTOU — needs a SECURITY DEFINER RPC; accept as low-frequency gap or build it.
- **#44/#51** no restore/unarchive path for archived ministries/counts — product decision (needs an Archived surface).
- **#37** dimension ministry_tag: should it roll up container subgroups? — grouping mechanism next to reserved #14.
- **#47** ministry-scoped attendance drill — needs a new selector kind in dashboardDrilldown.ts (currently disabled, not misleading).
- **#5** moving a mirror-carrying group to top-level leaves metric_role=mirror with parent_metric_id=null — decision 7.
- **#58** access-paused win-back copy — GROVE tone pass.
- **#9 / #50** dashboard rollup take-first ordering; 0051 backfill mirror-classification — verify during Opus pass.

## Highs — resolved (Opus pass)

- **#8** FIXED — dashboard Grand Total now subtracts volunteers ancestor-aware (no parent+child double-subtract); added `volunteersIsRollup` to TagSection.
- **#12** FIXED — History ministry roll-up total now folds in the template’s own legacy leaf (pre-split weeks no longer vanish).
- **#14** RESOLVED (by the #45 pass) — container expansion excludes group_only children.
- **#50** REFUTED — the 0051 mirror backfill is semantically correct.
- **#13** PARTIAL — the sum path is correct; op-awareness (avg/max History totals) is a small follow-up.
- **#10 / #11 / #19 / #30** display-layer only (entry-screen convenience card + cross-tab TOCTOU); authoritative dashboard/History numbers are correct. Flagged for a mirror-aware entry-totals pass.
