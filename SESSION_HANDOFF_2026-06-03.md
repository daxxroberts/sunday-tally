# SundayTally — Session Handoff (2026-06-03) — read with SCHEMA_CUTOVER_STATUS.md (D-072…D-097)

Compaction anchor. Full decision detail in `SCHEMA_CUTOVER_STATUS.md`; design rules in `DESIGN_SYSTEM.md`; build specs in `IRIS_*_ELEMENT_MAP.md`; Stripe/email plan in `STRIPE_AND_EMAIL_PLAN.md`; sub-agent rules in `SUBAGENT_STANDARD.md`.

## ✅ BATCH LANDED 2026-06-04 — commit `118163c` (one commit, NOT pushed; branch design/entries-spec-and-mockup)
Ran a 4-track sub-agent batch under SUBAGENT_STANDARD.md (FELIX-validated each, SAGE-ratified, authoritative `tsc` + `next build` both green). Then committed the FULL uncommitted backlog (140 files, +21,351/−8,136) as ONE commit per Builder choice. **Not pushed — Builder pushes when ready.**
- **0029 role RLS** applied earlier (D-098) — already in this commit.
- **Email/billing deltas DONE:** invoice.paid webhook handler (past_due→active, idempotent); removed duplicate Resend paymentFailed send (kept past_due update); trial-reminders cron now includes NULL subscription_status.
- **Route retirement DONE:** legacy /services T1–T5 deleted; History relocated to `/history`; role-aware `/services*` middleware redirect; Entries link repointed. (NAV_MANIFEST.json absent → used handoff item 8 as authority.)
- **Polish DONE:** nav + auth DS pass (#4F6EF7, no red, Fira numerals, aria-live on auth errors); invite email CTA recolored; `grid_config` typed on Church; duplicate-invite guard paginates listUsers.
- **STILL OPEN (flagged, need Builder decision):** `aiSetupExhausted` wiring (ambiguous trigger — which AI bucket/trial-phase) and **Welcome email** (no template + signup doesn't write status where expected) — both need a Builder call, not invented. Other 4 email-template CTAs still #2563eb (only invite was in scope) — DS-align if desired. Test-artifact files (playwright-report, test-screenshots/*.png) got committed — consider gitignoring next pass.

## ✅ COMPLETED THIS SESSION (all UNCOMMITTED on disk; branch `design/entries-spec-and-mockup`)
- **Schema cutover live** (migrations 0022–0028 applied to main `iwbrzdiubrvogiamoqvx`). **0028** added `service_template_tags`, `metric_entries.location_id`, `church_memberships.default_location_id`, `metrics.cadence` — FELIX/SAGE ratified (D-090).
- **Entries screen** (`/entries`) — BUILT + wired + verified read/write (D-091). Ministry-first, two-zone (occurrences + Stat Entries), Totals w/ grand-total + include/exclude (grid_config), autosave to metric_entries. Design decisions D-072…D-085. Mockup ref `/mockup/weekly-entry`. Build spec `IRIS_ENTRIES_ELEMENT_MAP.md`.
- **Dashboard** redesigned + wired (D-092) — 4-window deltas, Key Metrics (vol/attendance 28%, per-capita giving, avg attendance), per-ministry, Customize. FELIX+LENS PASS.
- **Settings** — hub + Services&Ministries (service_template_tags mgmt, mirrors Entries) + Locations&Team (D-092). Tags (#61) prior.
- **Account Portal** (D-097) — `auth/forgot`+`auth/reset`+`auth/callback` (PKCE), `settings/account` (name/default-campus/change-password), unified `settings/team` Members&Invitations, `billing` redesigned. Plus pre-existing-auth remediation: invite-accept fixed (service-role token read), all `/services` dead-ends → role-aware `/entries`|`/dashboard/viewer`, middleware↔nav reconciled, invite privilege binding, global `.font-num`+Fira in globals.css. LENS-verified all routes render, owner access intact.
- **Design system hardened** → `DESIGN_SYSTEM.md` (DS-1…DS-25): AccessSync blue #4F6EF7, Fira numerals, status circles, NO RED, etc. (D-089).
- **Data fixes:** LifeKids un-parented (parallel, not under Experience); services renamed/retimed → **First Experience @ 9:00 (code 1), Second Experience @ 10:30 (code 2)** (D-095). Entries fields now show ALL active metrics (not just canonical) — volunteer areas + stats visible (D-093). History grid horizontal scroll fixed (D-094). Nav repointed Services→Entries.
- **Root-cause win:** Stage A import worked; bad "9 AM/11 AM" names came from confirm-step auto-filling a `[BLOCKING]` field (D-095 import-flow bug to fix).

## ⛔ NOT COMPLETED — scope still to build (full detail)
### A. Needs Builder (external — agents cannot do; no account/credential creation by AI)
1. **Stripe**: create account + `STRIPE_SECRET_KEY` + $22/mo recurring `STRIPE_PRICE_ID` + webhook endpoint `${APP_URL}/api/stripe/webhook` + `STRIPE_WEBHOOK_SECRET` (events: checkout.session.completed, customer.subscription.{created,updated,deleted}, invoice.payment_failed/paid). Until then checkout/portal 500 and status stays 'trialing'.
2. **Resend**: `RESEND_API_KEY` + verified sending domain for `RESEND_FROM_EMAIL`.
3. **`NEXT_PUBLIC_APP_URL`** — set in prod (inconsistent defaults localhost vs sundaytally.app across files; invite/email/redirect links depend on it).
4. **Supabase Auth** — whitelist redirect URLs (`/auth/callback`, `/auth/reset`, `/auth/invite/*`); enable reset-password email template; confirm password min-length = 8.
5. ~~Apply migration `0029_settings_role_rls.sql`~~ — **DONE 2026-06-03 (D-098).** Applied to production via BOT gate (FELIX PASS-WITH-NOTES → empirical viewer-impersonation test proving self-promotion BLOCKED[42501] while default-campus write succeeds, 0 leftover rows → SAGE RATIFIED). Teammate names now resolve; member/invite/role/location writes DB-enforced. Residual non-blocking follow-ups in D-098 (FK-scope `default_location_id`, header idempotency wording, confirm no other self-editable sensitive membership columns).

### B. Build follow-ups (agents can do; queued)
6. **Email flows END-TO-END UNTESTED** (reset, magic-link, invite) — blocked on #1–#4 config; manual + LENS pass after setup.
7. **Email system** — DONE: see `STRIPE_AND_EMAIL_PLAN.md` (13-email inventory + automation per email + built-vs-buy). **Split:** Stripe owns money emails (receipt, refund, **failed-payment/dunning**, card-expiring — enable via Dashboard toggles, build nothing); Resend owns lifecycle (trialEnding7d/1d wired-via-cron, invite wired, aiSetupExhausted=DEAD CODE wire-or-drop, Welcome=missing); Supabase Auth owns reset/magic-link/confirm. **CODE DELTAS to apply (flagged, not done):** (a) **add `invoice.paid` webhook handler** so past_due→active on recovery (currently stuck past_due); (b) **remove Resend `paymentFailed` send** in handlePaymentFailed (keep the past_due DB update) — else DOUBLE failed-payment email once Stripe's native toggle is on; (c) **wire `aiSetupExhausted`** (defined, never called); (d) fix trial-reminder cron — `.eq('trialing')` skips NULL `subscription_status` rows → verify signup writes 'trialing'; (e) add Welcome email (optional). **Stripe-on-Vercel = already correct** (webhook raw-body+signature+idempotent; Portal+Checkout wired). Builder Stripe-Dashboard: flip 4 customer-email toggles ON + native trial-email OFF (trial is app-managed so no conflict), set Smart Retries window + terminal state, enable Portal features, register `invoice.paid` event + signing secret.
8. **Retire old `/services` + T2–T5 routes** — carefully PRESERVE `/services/history` → move to `/history` (it's the working History page). Internal `/services/*` self-nav still references dropped tables.
9. **Import-flow `[BLOCKING]` bug (D-095)** — a `[BLOCKING]` field must hard-require user answer in confirm, never auto-fill placeholder.
10. **#60** attendance routing durable verify (fresh import emits "Attender" verbatim). **#64** Haiku validation pass over deterministic import. **#52** docs (DECISION_REGISTER D-059…D-097, QUERY_PATTERNS, HANDOFF_BRIEF).
11. **Giving import** (gid 181499763) → lights up Stat Entries + per-capita giving (church has 0 period metrics now).
12. **Daily 7-box cadence control (N-4)**; monthly canonical anchor + History per-cadence rendering (D-085).

### C. Polish
13. Dashboard live campus toggle (needs locationId param on dashboard.ts); partial same-role exclusion precision; dedup duplicate empty "Main" location; grid_config concurrency (Entries+Dashboard same key); add grid_config to Church type; nav active color blue-600→#4F6EF7; login/AuthLayout DS pass; invite email CTA #2563eb→#4F6EF7; aria-live on a few error nodes; listUsers pagination in duplicate-invite guard.

### D. The BIG one — COMMIT
14. **Large pre-existing UNCOMMITTED backlog**: the entire prior #52–#63 cutover + migration files 0017–0028 + scripts + package.json deps (all 2026-06-01) were NEVER committed; this session's Entries/Dashboard/Settings/Account-portal work sits on top, also uncommitted. Only clean isolated commits made: entries+0028 (aabecac), nav (a2cc8a5), docs/mockup (7bad398) on branch. **Builder must decide commit strategy for the whole tree.**

## Demo church
`4037051e-52f5-4c22-a0f1-32e7b45aaff4` · demochurch@example.com / DemoChurch2026! · campus "Main Campus" 7d223bf2 (+ dup empty "Main") · ministries Experience(ADULT)+LifeKids(KIDS) · 5,494 metric_entries · import job 21e4a4aa.
