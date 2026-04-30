# Church Analytics — Decision Register
## Final state only. No revision history.
## Version 1.1 | 2026-04-10

---

## How to Read This

Each decision has three parts:
- **What was decided** — the ruling, in one sentence
- **Why** — the reason behind it
- **Build impact** — what this means for code, schema, or UX

Superseded decisions are not listed. Only current state.

---

## Architecture

**D-001 — Stack: Supabase + Next.js + Vercel**
Multi-tenant SaaS. Supabase handles auth, RLS, Postgres. Next.js on Vercel handles frontend and server logic.
*Build impact:* All queries go through Supabase client. RLS enforces church-level data isolation — every table has `church_id` and policies using `get_user_church_ids()`.

---

## Attendance

**D-002 — Attendance categories are fixed: MAIN · KIDS · YOUTH**
Standardised categories enable cross-church benchmarking and consistent dashboards. Custom categories would fragment the data model.
*Build impact:* `attendance_entries` has three nullable integer columns — `main_attendance`, `kids_attendance`, `youth_attendance`. No dynamic category rows.

**D-003 — Attendance has no is_not_applicable flag**
Zero is meaningful for attendance (a service ran with zero youth). N/A is not a valid attendance state. NULL means not entered; 0 means confirmed zero.
*Build impact:* T2 entry field: empty = NULL, user types 0 = stored as 0. Never coerce. Display NULL as "–" not "0".

**D-029 — Audience tracking flags are UX + completion logic**
`tracks_kids_attendance` and `tracks_youth_attendance` on the `churches` table. Hide unused fields in T2. Also gate completion — a church with kids off only needs main attendance for the section to be complete.
*Build impact:* T2 conditionally renders Kids and Youth fields. Completion check excludes fields for untracked audiences. See completion logic in APP_CONTEXT.md.

**D-030 — Attendance completion = all tracked fields have a non-NULL value**
Submitted with NULLs = in-progress. All tracked fields filled = complete. Partial saves are valid — user can submit with some fields blank and return later.
*Build impact:* Three-state indicator on T1b: empty (no row) · in-progress (row exists, tracked field NULL) · complete (row exists, all tracked fields non-NULL). UPSERT allows partial saves.

---

## Volunteers

**D-004 — Volunteer totals calculated from rows, never stored**
Storing totals creates drift when categories change. Always `SUM(volunteer_count)`.
*Build impact:* No total column on any table. P4 and P5 always aggregate from `volunteer_entries` rows.

**D-005 — Volunteer categories soft-delete only, category_code immutable**
Historical entries reference category IDs. Deleting or renaming codes would corrupt historical data.
*Build impact:* `is_active = false` to deactivate. `category_code` is immutable after creation. Entry screens show active categories only; dashboards retain deactivated labels in history.

---

## Stats (formerly Responses)

**D-034 — "Responses" renamed to "Stats" in all UI labels**
"Stats" is more honest — it communicates "things you count" not just pastoral responses. Enables custom stats to feel natural.
*Build impact:* Schema names unchanged (`response_categories`, `response_entries`, `tracks_responses`). Only UI copy changes. All user-facing strings say "Stats".

**D-035 — Stats have two scopes: audience or service**
Some stats (First-Time Decisions) make sense broken down by MAIN/KIDS/YOUTH. Some (Cars in parking lot) are one number for the whole service. Scope is set at category creation and cannot be changed after data exists.
*Build impact:* `stat_scope` column on `response_categories` ('audience' | 'service'). Audience-scoped entries: one row per `(occurrence, category, audience_group_code)`. Service-level entries: one row per `(occurrence, category)`, `audience_group_code = NULL`. T4 shows audience-scoped stats inside MAIN/KIDS/YOUTH sections; service-level stats in a separate "Service Stats" section below.

**D-013 — Stats are configurable per church**
Churches can deactivate seeded defaults and add their own custom stat types.
*Build impact:* `is_custom` flag on `response_categories`. Seeded defaults: `is_custom = false`. Church-created: `is_custom = true`. T8 Settings manages the list.

---

## Giving

**D-008 — NUMERIC(12,2) for giving amounts, never FLOAT**
Financial data requires exact decimal arithmetic. FLOAT introduces rounding errors.
*Build impact:* `giving_amount NUMERIC(12,2)` on `giving_entries`. Application layer: use decimal libraries, never JavaScript floating point for giving math.

**D-036 — Giving sources are persistent church-defined categories**
A church has recurring sources (Plate, Online) not one-off entries. Sources are defined once and reused every week.
*Build impact:* `giving_sources` table — mirrors `volunteer_categories` pattern. Seeded defaults: Plate + Online. Church can rename, add, deactivate. Cannot delete source if `giving_entries` rows reference it.

**D-037 — One editable row per giving source per service**
One `giving_entries` row per `(occurrence, giving_source_id)`. UPSERT pattern — editable, not append-only.
*Build impact:* UNIQUE constraint on `(service_occurrence_id, giving_source_id)`. T5 loads existing rows on mount, pre-fills per source, UPSERTs on save. No "add entry" button — one field per source.

**D-038 — No correction entries**
Wrong amount = edit the row. No journal-entry workaround.
*Build impact:* UPSERT handles corrections naturally. No special correction UI or negative entry pattern.

---

## Tracking Configuration

**D-025 — Tracking is configurable per church**
`tracks_volunteers`, `tracks_responses`, `tracks_giving` on `churches` table. Default true. Attendance is always tracked — no flag.
*Build impact:* T1b section rows hidden when flag is false. Entry screens (T3/T4/T5) redirect to T1b if accessed directly when flag is off. Dashboard rows hidden when flag is off. T6b Settings exposes toggles.

**D-027 — Tracking configuration lives in Settings, not onboarding**
Defaults all true. Churches that never configure it get full tracking automatically. Not a required onboarding step.
*Build impact:* T6b is in Settings, not the onboarding sequence. Onboarding steps: T-loc → T6 → T-sched → T9.

---

## Authentication and Roles

**D-015 — Viewer authentication = magic link**
Pastors and board members use the product monthly or quarterly. Requiring a password creates friction and abandonment for infrequent users.
*Build impact:* T9 invite flow sends magic link for Viewer role. No password setup for Viewers. Session expiry behavior must be resolved before T9 is built (OI-07).

**D-021 — Editors can create service occurrences**
Any data entry role needs to be able to start today's service. Restricting occurrence creation to Admin/Owner creates a bottleneck on Sunday morning.
*Build impact:* T1 E3e tap → create occurrence → INSERT — permitted for Editor role via RLS.

**D-022 — Editors see entry screens only, no dashboard**
Editors are data entry staff, not ministry leaders. Dashboard access is inappropriate for this role.
*Build impact:* Dashboard tab hidden for Editor in nav bar. Dashboard URLs redirect Editor to T1.

**D-023 — Admin can invite Editor and Viewer only. Owner invites any role.**
Prevents privilege escalation — Admin cannot create another Admin or Owner.
*Build impact:* T9 invite flow: role picker scoped by inviter's role. Admin sees Editor + Viewer only.

---

## UX and Navigation

**D-016 — Occurrence creation = 1-tap from schedule**
T1 shows scheduled services that haven't started yet (P12b). Tapping one creates the occurrence from the schedule — no blank form, no date picker, no template selection.
*Build impact:* E4 inline confirmation on T1 (500ms, debounced). Occurrence created from `service_schedule_versions` data — all fields derived, not entered.

**D-017 — Sunday loop = one continuous session anchored to occurrence ID**
User selects a service once. The occurrence ID and service date are written to context. T2–T5 read from context without re-fetching.
*Build impact:* `SundaySessionContext` — written on T1 tap, read by T1b/T2/T3/T4/T5. sessionStorage keyed by occurrence date (`sunday_session_[YYYY-MM-DD]`). Restoration pointer: `sunday_last_active`. If context empty on T2 load → redirect to T1.

**D-018 — Section-submit on T3 and T4**
Phone users on Sunday can lose connectivity mid-entry. Section-submit saves progress incrementally rather than requiring the whole form to be submitted at once.
*Build impact:* T3 and T4 have a Submit button per audience section (MAIN/KIDS/YOUTH). Each submit is one transaction. Sections collapse to summary after submission. Back prompt (D-028) only triggers if current section has unsaved changes.

**D-019 — Giving entry = history-first layout**
Giving is typically entered after Sunday when online totals are finalised. Showing prior entries first prevents confusion about whether data has been entered.
*Build impact:* T5 loads and displays existing `giving_entries` rows before showing entry fields. (Superseded by D-037 — now one field per source, pre-filled from existing row.)

**D-020 — Post-submit summary after T4 is required**
When a church enters decisions and baptisms, that data deserves a moment of acknowledgment. A full-screen summary is the pastoral response — not a toast, not a snackbar.
*Build impact:* T4 E6 — full-screen green state after all sections submitted. Shows totals by stat type across all audience groups. Auto-dismisses to T1b after 2.5 seconds or tap.

**D-024 — T1 shows last 7 days of services, incomplete first**
Churches often enter Sunday data on Tuesday. A 7-day window handles delayed entry without requiring a date picker or History screen.
*Build impact:* P12 query: `service_date >= CURRENT_DATE - 7 DAYS`, sorted by completion status (incomplete first) then date DESC. Session anchor writes `service_date` from occurrence record, not device date.

**D-028 — Prompt on back if fields have unsaved changes**
Prevents accidental data loss. The prompt names the specific section with unsaved data.
*Build impact:* All entry screens (T2/T3/T4/T5) intercept back navigation when dirty. Prompt: "Save your [section] first? It won't show in your reports if you leave now." Options: Save · Discard · Keep editing.

**D-031 — After T4 post-submit summary, return to T1b**
User stays in the service context — they likely still have Giving to enter. Returning to T1 would require them to re-tap the service.
*Build impact:* T4 E6 dismiss → T1b (not T1). T1b refreshes completion status on return.

**D-032 — Navigation model = bottom tab bar**
Simple, standard mobile navigation. No home screen. T1 is the Services tab root.
*Build impact:* Three tabs: Services (Owner/Admin/Editor) · Dashboard (Owner/Admin→D1, Viewer→D2, Editor hidden) · Settings (Owner/Admin only). Back from T1 exits app.

---

## Dashboard

**D-033 — Dashboard shows four simultaneous time columns, no toggle** *(revised 2026-04-17)*
A pastor needs Current Week, recent-trend (Last 4-Wk Avg), Current YTD Avg, and Prior YTD Avg all visible at once. Hiding any behind a toggle means most users never see it. Prior YTD moved from a paired "vs prior" cell to its own column so year-over-year is first-class.
*Build impact:* D1 renders four time columns (P14a Current Wk · P14b Last 4-Wk Avg · P14c Current YTD Avg · P14d Prior YTD Avg) simultaneously. Application layer fires all four queries on dashboard load. Deltas between Col1↔Col2 and Col3↔Col4 only (see D-053). YTD denominator = weeks with ≥1 active occurrence, not calendar weeks. Supersedes the three-column model.

**D-026 — Viewer sees same comparison layout as Owner/Admin, fewer rows** *(flagged under review 2026-04-17)*
D1 v2.0 redesign (four columns, sectioned, no tag grouping) invalidates the v1.0 three-column parity. Deferred for D2 follow-up — when D1 v2.0 ships, confirm whether D2 adopts the same four-column shape or keeps v1.0.
*Build impact:* Until resolved, treat D2 as still-v1.0. Any change to D2 should reference this flag.

**D-053 — D1 deltas apply only between Col1↔Col2 and Col3↔Col4** *(new 2026-04-17)*
In the four-column model, deltas compare short-term (Current Week vs recent trend) and year-over-year (Current YTD Avg vs Prior YTD Avg). A delta between Col2 and Col3 would compare two unrelated time aggregates and mislead.
*Build impact:* D1 renders two delta badges per row — one between Col1 and Col2, one between Col3 and Col4. No delta rendered between Col2 and Col3. Formula unchanged: `((current - prior) / prior) × 100`, show "—" when prior is null or zero.

**D-054 — Summary Card metric visibility is a per-user, per-church localStorage preference** *(new 2026-04-17)*
Different roles/users on the same church care about different headline numbers. A pastor wants First-Time Decisions; a treasurer wants Giving. Making the Summary Card a pickable list keeps the card compact without forcing a single preset on every user. Per-device localStorage is sufficient for V1 — no cross-device sync needed.
*Build impact:* `src/lib/dashboardPrefs.ts` exposes `loadSummaryMetrics(userId, churchId)` and `saveSummaryMetrics(userId, churchId, flags)`. Key: `sundaytally:d1_summary_metrics:{user_id}:{church_id}`. Default: all metrics on. Tracking flags still gate visibility of Volunteers / First-Time Decisions / Giving lines regardless of user preference.

**D-055 — Dashboard totals and Prior YTD denominator conventions** *(new 2026-04-17)*
Grand Total attendance on D1 = `MAIN + KIDS + YOUTH` per occurrence, NULL-aware (NULL fields excluded from the sum, never COALESCEd to 0 in averages — Rule 4). Prior YTD Avg uses the same "weeks with ≥1 active occurrence" denominator as Current YTD (N72), but applied to the prior calendar year up to the ISO-week matching today's position.
*Build impact:* P14d query implements Prior YTD with weeks-with-occurrences denominator. Grand Total calculation happens in the application layer from the three audience columns — not a stored total.

---

## Schema Patterns

**D-010 — Service template per location, cross-location rollup by display_name**
Each location has its own template instance so schedules can differ. But "9am" means the same service across campuses — rolled up by name.
*Build impact:* Rule 2: cross-location rollup always uses `display_name`, never `service_template_id`. P3 implements this.

**D-012 — 'special' occurrence status removed from V1**
No UI path exists for a special status without additional UI. Schema and feature must ship together.
*Build impact:* Migration 0002 removes 'special' from the status CHECK constraint. V2: restore with UI (ship together).

---

## Open Items (decisions pending)

| OI | Blocking | What's needed |
|---|---|---|
| OI-01 | Dashboard build | Query pattern enforcement mechanism — how NOVA ensures P-rules are followed in all queries |
| OI-06 | T3/T4 build | Section-submit API design — endpoint structure for section-level UPSERT transactions |
| OI-07 | T9 mapping | Magic link session expiry — what happens when a Viewer's link expires, how re-auth works |

---

## Services and Tags

**D-039 — "Template" replaced by "Service" in all UI copy.**
`service_templates` table name unchanged. Every user-facing string says "service" — "Add a service," "Your services," "Set up your service times." Eliminates technical language from the product.
*Build impact:* T6 screen copy, T-settings "Your Church" group label, onboarding steps all say "services." Schema unchanged.

**D-040 — Tags are query scopes stamped onto occurrence records.**
Tags provide stable reporting identity across name/time/campus changes. When a tag is assigned to a service, `apply_tag_to_occurrences()` runs immediately — stamps all matching historical occurrences into `service_occurrence_tags`. Future occurrences stamped at creation. Optional date range on tag filters which occurrences are stamped (based on occurrence date, not assignment date).
*Build impact:* Three new tables: `service_tags` · `service_template_tags` · `service_occurrence_tags`. Function: `apply_tag_to_occurrences(tag_id, template_id)`. Dashboard queries JOIN `service_occurrence_tags` — no date arithmetic at query time. Seeded defaults: Morning · Evening · Midweek.

**D-041 — Tag is a labeling axis, not the top-level grouping key for D1** *(revised 2026-04-17)*
Rule 2 further revised. D1 v2.0 is church-wide with audience sections (Adults/Kids/Youth) as the organizing axis — tags do NOT group the top-level dashboard. Tags reappear only as inline labels inside the Other Stats section (`Parking (MORNING)` format), because `church_period_entries` need tag disambiguation. `display_name` remains a presentation-only label on T1/T1b.
*Build impact:* D1 queries aggregate church-wide across all `service_occurrences` (still joined through `service_occurrence_tags` so RLS and `active_tagged_services` filter apply — D-042). Tag column appears only in Other Stats output. P3 and the revised P14-family queries no longer GROUP BY tag at the top level.

**D-042 — Primary tag required for a service to appear in T1.**
No primary tag = service invisible to the Sunday loop. Enforces clean dashboard data from day one.
*Build impact:* `active_tagged_services` view filters `WHERE primary_tag_id IS NOT NULL`. P12 and P12b JOIN through this view. T6 Continue button disabled until primary tag selected. Gate 1 considers a service without a primary tag as incomplete.

**D-043 — Primary tag is a direct FK on service_templates. Subtags in junction table.**
`service_templates.primary_tag_id UUID REFERENCES service_tags(id) ON DELETE SET NULL`. One primary tag per service. Subtags (campaigns, series) remain many-to-many through `service_template_tags`.
*Build impact:* `primary_tag_id` column on `service_templates`. `service_template_tags` stores subtags only. Primary tag picker in T6 reads from `service_tags` filtered to undated tags (D-046). Subtag picker reads all active tags.

**D-044 — Dashboard rows = distinct primary tags. Drill-down = audience then subtag.** *(superseded by D-053/D-054/D-055, 2026-04-17)*
Original rule: Morning/Evening/Midweek as top-level rows with audience drill-down on tap. D1 v2.0 replaces this with always-visible audience sections (Adults/Kids/Youth) at the top level. Tags no longer group the top-level view (D-041 revised). Subtag drill-down removed from v2.0 scope.
*Build impact:* D1 v2.0 uses the section stack (Summary → Adults → Kids → Youth → Volunteer Breakout → Other Stats). Subtag filtering deferred. D2 unchanged pending the D-026 review.

**D-045 — Dashboard hides metric rows when tracking is off.**
`tracks_volunteers = false` → no Volunteers row. `tracks_responses = false` → no Stats row. `tracks_giving = false` → no Giving row. Historical data for hidden rows accessible via tag filter. Attendance rows always shown.
*Build impact:* Dashboard query checks church tracking flags before rendering metric rows. Row is omitted from the comparison grid entirely — not greyed, not empty, not shown. D1 and D2 both enforce this.

**D-046 — Primary tag picker shows only undated tags.**
Tags with `effective_start_date IS NULL AND effective_end_date IS NULL` only appear in the primary tag picker in T6. Date-ranged tags (campaigns, series) appear only in the subtag picker. Enforced at UI layer — no schema change.
*Build impact:* T6 E2e primary tag picker query: `WHERE effective_start_date IS NULL AND effective_end_date IS NULL AND is_active = true`. T6 E2f subtag picker has no date range filter.

---

## Tag Removal

**Tag removal from a service — UI prompts, user decides:**
- "Remove from all records" → DELETE from `service_template_tags` + DELETE from `service_occurrence_tags` for occurrences of this template
- "Keep past records tagged" → DELETE from `service_template_tags` only. `service_occurrence_tags` rows preserved.

**Tag date range edit — re-stamp prompt:**
When a tag's date range changes, UI prompts: "Update which records are tagged? This will re-stamp [Service Name] based on the new date range." Yes → delete existing stamps for this tag + this template, call `apply_tag_to_occurrences()` with new range.

---

## Team Rules

**TR-01 — Graph-First on Decision Impact.**
When a decision is made that affects other decisions, screens, queries, or schema — read the graph first. Then read context. Then act.
Sequence: Decision lands → read graph (god nodes, clusters, INFERRED edges) → cross-reference context → state full impact → write.
Applies to: NOVA · ATLAS · IRIS · ORION · AXIOM · VERA · SPAN.

---

## Open Items (updated)

| OI | Blocking | What's needed |
|---|---|---|
| OI-01 | Dashboard build | Query pattern enforcement mechanism |
| OI-06 | T3/T4 build | Section-submit API design |
| OI-07 | T9 mapping | Magic link session expiry behaviour |

---

## Viewer Session Model

**D-047 — Viewer sessions are long-lived. No expiry until removed.**
Supabase refresh tokens configured for maximum duration. Viewers stay logged in until explicitly removed by Owner or Admin. Removal revokes the session immediately — dashboard becomes inaccessible.
*Build impact:* Supabase client config sets maximum refresh token duration. Session middleware checks membership status on each request — a removed Viewer is rejected even with a valid token. No session TTL logic needed.

**D-048 — Viewer self-serves re-auth via email. No admin action needed.**
If a Viewer is ever logged out (device reset, manual sign-out, browser cleared), they enter their email on the login screen and receive a new magic link. Their `church_memberships` record still exists — they just need a fresh session token. No Owner or Admin involvement.
*Build impact:* Login screen has a single email field for Viewers. Supabase `signInWithOtp` handles the magic link. The Viewer's membership is not re-created — it already exists. The T9 E8 note on pending Viewer invites sets this expectation upfront.

---

## Sunday Loop — Section Submit and Stats

**D-049 — Section-submit is independent per audience group.**
T3 and T4 submit one section at a time (Main / Kids / Youth). One API call per section. UPSERT per category row scoped to that section only. Sections cannot overwrite each other. An Editor entering Main volunteers cannot affect Kids volunteer rows. OI-06 closed.
*Build impact:* T3 and T4 section submit buttons fire one UPSERT per category row in that audience group. No full-form submit. T1b completion status updates per section after each submit.

**D-050 — Service-level stats: last write wins, no locking.**
Any Editor can overwrite a service-level stat for any occurrence. No ownership lock, no read-only after first entry. Simple UPSERT — whoever saves last wins. F-new-7 closed.
*Build impact:* T4 service-level stat rows use standard UPSERT. No ownership check, no pre-fill read-only logic. Same pattern as audience-scoped stats.

---

## Provisioning and Occurrence Architecture

**D-051 — Provisioning uses compensation pattern, not database transaction.**
Supabase Auth createUser operates outside Postgres transactions. The provisioning sequence uses explicit cleanup on each step failure — if step N fails, steps 1 through N-1 are reversed in order. Not a Postgres rollback. Steps 2–6 use service role key (server-side only, never client-exposed) because the new user has no church_memberships row yet and RLS would block the inserts.
*Build impact:* SIGNUP server action uses Supabase Admin client (service role) for all provisioning steps. Error handling at each step triggers cleanup of all prior steps. PROVISIONING.md updated with compensation pattern.

**D-052 — Occurrence creation is an explicit server action on T1 tap.**
When a user taps a "not started" service card in T1, the server creates the occurrence and stamps it with current tag assignments before returning the occurrence_id to the client. The client never creates occurrences directly.
*Build impact:* T1 "not started" card tap → POST /api/occurrences → INSERT service_occurrences + INSERT service_occurrence_tags (for all assigned tags, N45) → return occurrence_id → write SUNDAY_SESSION → navigate to T1b. If occurrence already exists (concurrent creation), return existing occurrence_id.

---

## Weekly Inputs

**D-056 — Church-wide weekly giving uses `church_period_giving`, not `giving_entries`.**
Some churches track total weekly offering as a single church-wide number not tied to any specific service occurrence. `giving_entries.service_occurrence_id` is NOT NULL and cannot hold this. A new `church_period_giving` table (migration 0013) stores period-keyed giving amounts (week or month) scoped only to `church_id` + `giving_source_id` + period — no `service_occurrence_id` required. **Week anchor:** `period_date` is the **Sunday on or before** the entry's date (Sunday = start of the church week). Sun Apr 26 → 2026-04-26. Mon Apr 27 → 2026-04-26. This is intentionally different from `church_period_entries`, which uses Monday because it's anchored to a specific service tag's typical day.
*Build impact:* T_WEEKLY screen (`/services/weekly`) reads and writes `church_period_giving` with Sunday-anchored `period_date`. AI import will route unmatched giving entries to this table, snapping the entry's date back to the most recent Sunday. Dashboard and History do not yet aggregate this table — deferred to a follow-up task. `giving_entries` remains the source of truth for service-level giving in T5 and all existing queries.

**D-057 — `tracks_main_attendance` defaults true; toggle hides Main everywhere.**
0005 originally omitted this flag with the assumption "Main is always tracked." That assumption fails for M3 churches (parallel experiences entered per-experience, no aggregated "main") and Kids/Youth-only ministries. Migration 0015 adds `churches.tracks_main_attendance BOOLEAN NOT NULL DEFAULT true`. Default `true` preserves all existing church behavior.
*Build impact:* T2 attendance form hides the Main input when false. T1 services-card completion logic skips Main. Occurrence detail (T1B) hides the Attendance card entirely when no attendance audience is tracked, otherwise gates Main inside the summary string. T_HISTORY drops the Main sub-column. `lib/dashboard.ts` `attGrandTotal()` falls back to `kids + youth` when `tracks_main_attendance = false`. Settings/Tracking gets a third audience toggle row.

**D-058 — Weekly stats use untagged `church_period_entries` (`service_tag_id IS NULL`).**
Companion to D-056. Some stats (online viewers, hands raised, calls received) are reported once per week church-wide and don't belong to any audience or service tag. 0014 made `service_tag_id` nullable with two partial unique indexes (tagged + untagged). T_WEEKLY_STATS (`/services/weekly-stats`) reads/writes the untagged branch for `response_categories.stat_scope = 'week'`.
*Build impact:* New screen `/services/weekly-stats`. Header link added next to T_WEEKLY on T1. Save path uses select-then-update-or-insert (PostgREST cannot match `IS NULL` in an UPSERT conflict target). Empty input deletes the row (D-003). N/A toggles persist as `stat_value=NULL, is_not_applicable=true`. Documented in QUERY_PATTERNS.md as P16c (load) and P16d (save). Dashboard does not yet aggregate this — deferred to a follow-up task.
