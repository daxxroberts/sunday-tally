# Church Analytics — Claude Code Instructions
Version: 1.0 | 2026-04-10

---

## What You Are Building

Multi-tenant SaaS for churches to log weekly ministry data and view
standardised dashboards. Churches track attendance, volunteers, stats,
and giving. Pastors compare numbers week over week, month over month,
and year over year.

Stack: Next.js (App Router) · TypeScript · Supabase · Vercel · Tailwind CSS

---

## Read These Before Writing Any Code

In this order. Confirm each one before moving to the next.

1. `HANDOFF_BRIEF.md` — full brief, reading order, build phases
2. `APP_CONTEXT.md` — data model, 6 critical rules, tag system
3. `DECISION_REGISTER.md` — 50 locked decisions with build impact
4. `flow/FLOW_REPORT.md` — routes, role journeys, gates, shared state
5. `flow/NAV_MANIFEST.json` — machine-readable route and layout spec
6. `migrations/*.sql` — run against Supabase in order 0001→0009 before any code
7. `QUERY_PATTERNS.md` — 17 query patterns, read before any database query
8. `IRIS_[SCREEN]_ELEMENT_MAP.md` — read the relevant map before each screen
9. `graphify-out/graph.html` — knowledge graph, open now and keep accessible

---

## Session Start Protocol

At the start of every new session, state these three things before doing anything:

1. Which build phase am I in?
2. Which screen am I currently building?
3. What is open in BUILD_FLAGS.md?

Do not write code until confirmed.

---

## The One Rule

**Nothing ships without matching the IRIS element maps.**

Every element (E-number), every state, every role rule in the IRIS maps
is a build requirement — not a suggestion. Read the map. Build the map.
If something is not in a map, it does not exist yet — flag it.

## TR-01 — Graph First on Decision Impact

Before any decision that touches more than one file — read the graph.

Open `graphify-out/graph.html`. Search for the node you are working on.
Look at what connects to it. Understand the blast radius before you write.

This applies when:
- Adding or changing a query
- Changing a component used in multiple screens
- Adding navigation between screens
- Changing any schema-touching logic
- Anything that feels like it might affect more than one thing

The graph shows what the documents cannot — how everything connects.
God nodes (highest degree) are the most dangerous to change: service_occurrences,
service_templates, attendance_entries. Touch these with extra care.

---

## What You Cannot Decide Alone

Add to `BUILD_FLAGS.md` and stop if any of these come up:

- **Folder structure** — follow route table in FLOW_REPORT.md exactly
- **Schema** — 9 migrations are final, no column changes
- **Role permissions** — role matrix in FLOW_REPORT.md is the authority
- **Navigation** — NAV_MANIFEST.json specifies every route, no new routes
- **UI copy** — every label and instruction comes from the IRIS element maps
- **Query logic** — QUERY_PATTERNS.md specifies queries, no ad-hoc SQL
- **Component architecture** — if not in an IRIS map, flag it

BUILD_FLAGS.md format:
`[SCREEN or FILE] — [what is ambiguous] — [what you need to proceed]`

---

## Six Critical Rules (never violate these)

1. Always `WHERE status = 'active'` — never include cancelled occurrences
2. Dashboard groups by `tag_code` — never by `display_name`
3. Volunteer totals are always calculated — never stored
4. `NULL` ≠ zero attendance — never `COALESCE(attendance, 0)` in averages
5. Always `SUM` giving_entries per occurrence — multiple rows per source
6. Tags are pre-stamped in `service_occurrence_tags` — never re-derive at query time

---

## Key Architecture Facts

**The god node:** `service_occurrences` — everything connects through it

**T1 gate:** P12 and P12b JOIN `active_tagged_services` VIEW — not
`service_templates` directly. Services without a primary tag never appear in T1.

**SUNDAY_SESSION state:**
- Key: `sunday_session_[YYYY-MM-DD]`
- Restoration pointer: `sunday_last_active`
- If empty on T2–T5 load: redirect to T1, do not throw error
- Scope: React Context wrapping T1B, T2, T3, T4, T4_SUMMARY, T5

**Auth:**
- Viewers: `signInWithOtp` — magic link, no password, long-lived session
- Editors/Admins/Owners: `signInWithPassword`
- Viewer re-auth: `signInWithOtp` again — membership exists, restores session
- Invite token: `crypto.randomBytes(32).toString('hex')` — not Supabase built-in

**Shared component — build once:**
`InlineEditField` — pencil icon + editable input + save on blur
Used in: T6, T-loc, T-tags, T7, T8, T-giving-sources

---

## Build Phase Order

Phase 1 — Foundation
  Supabase setup · migrations 0001–0009 · Next.js scaffold · auth layer · layouts

Phase 2 — Onboarding
  AUTH · INVITE_ACCEPT · ONBOARDING_CHURCH → T_LOC → T6 → T_SCHED → T9

Phase 3 — Sunday Loop
  T1 → T1B → T2 → T3 → T4 → T5

Phase 4 — Dashboard
  D1 (Full Dashboard) · D2 (Viewer Summary)

Phase 5 — Settings
  T_SETTINGS → T6B · T7 · T8 · T_GIVING_SOURCES · T_TAGS · T9_SETTINGS
  Settings versions: T_LOC_SETTINGS · T6_SETTINGS · T_SCHED_SETTINGS

---

## Screen → IRIS Map Reference

| Screen | Map file |
|---|---|
| AUTH | IRIS_AUTH_ELEMENT_MAP.md |
| INVITE_ACCEPT | IRIS_INVITEACCEPT_ELEMENT_MAP.md |
| T_LOC (onboarding) | IRIS_TLOC_ELEMENT_MAP.md |
| T6 (service setup) | IRIS_T6_ELEMENT_MAP.md |
| T_SCHED | IRIS_TSCHED_ELEMENT_MAP.md |
| T9 (invite) | IRIS_T9_ELEMENT_MAP.md |
| T1 | IRIS_T1_ELEMENT_MAP.md |
| T1B | IRIS_T1B_ELEMENT_MAP.md |
| T2 | IRIS_T2_ELEMENT_MAP.md |
| T3 | IRIS_T3_ELEMENT_MAP.md |
| T4 | IRIS_T4_ELEMENT_MAP.md |
| T5 | IRIS_T5_ELEMENT_MAP.md |
| D1 | IRIS_D1_ELEMENT_MAP.md |
| D2 | IRIS_D2_ELEMENT_MAP.md |
| T_SETTINGS | IRIS_TSETTINGS_ELEMENT_MAP.md |
| T6B | IRIS_T6B_ELEMENT_MAP.md |
| T7 | IRIS_T7_ELEMENT_MAP.md |
| T8 | IRIS_T8_ELEMENT_MAP.md |
| T_GIVING_SOURCES | IRIS_TGIVINGSOURCES_ELEMENT_MAP.md |
| T_TAGS | IRIS_TTAGS_ELEMENT_MAP.md |
