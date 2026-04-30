# Church Analytics — Build Handoff Brief
Version: 1.3 | Date: 2026-04-10 | Prepared by: QUILL
Status: APPROVED — All five phases ready to build.

---

## What You Are Building

A multi-tenant SaaS for churches to log weekly ministry data and view standardised dashboards. Churches track attendance, volunteers, stats, and giving — and compare numbers week over week, month over month, and year over year through a tag-grouped dashboard.

## Stack

- **Frontend:** Next.js (App Router) — TypeScript
- **Backend/DB:** Supabase — Postgres + Row Level Security + Auth
- **Deployment:** Vercel
- **Styling:** Tailwind CSS

## Read These Files In This Order

Do not write any code until you have confirmed reading each file in this sequence:

1. **This brief** — you are here. Read fully.
2. **`APP_CONTEXT.md`** — what the product is, the data model, the 6 critical rules, the tag system, tracking flags, completion logic. The rules in this file override any assumption you might make.
3. **`DECISION_REGISTER.md`** — 50 decisions in final state, each with build impact. If you're unsure about anything, the answer is here.
4. **`flow/FLOW_REPORT.md`** — the route table, per-role journeys, gate map, and shared state map. Read fully before writing any routing or middleware.
5. **`flow/NAV_MANIFEST.json`** — machine-readable route spec. Reference when building the Next.js folder structure and middleware.
6. **`graphify-out/graph.html`** — knowledge graph. Open now. Read before any decision touching more than one file. TR-01.
7. **`migrations/*.sql`** — run against Supabase in numerical order (0001 through 0009) before writing any application code. The schema is final. Do not modify it.
8. **`IRIS_[SCREEN].md`** — read the relevant screen map before building each screen. Every element, state, role rule, and NOVA requirement is a build requirement.
9. **`QUERY_PATTERNS.md`** — read before writing any database query. 17 patterns specified. Use them.

## What You Cannot Decide On Your Own

Stop and add to `BUILD_FLAGS.md` if any of these come up:

- **Folder structure** — route table in `flow/FLOW_REPORT.md` specifies this. Follow it exactly.
- **Schema** — 9 migrations are complete and final. Do not add, remove, or rename columns.
- **Role permissions** — role matrix in `flow/FLOW_REPORT.md` is the authority. No exceptions.
- **Navigation** — `flow/NAV_MANIFEST.json` specifies every route. Do not invent routes.
- **UI copy** — every label, button, instruction, placeholder comes from IRIS element maps. Do not write new copy.
- **Query logic** — `QUERY_PATTERNS.md` specifies the queries. Do not write ad-hoc queries.
- **Component architecture** — if the IRIS map doesn't specify it, flag it before building it.

## If You Are Unsure

1. Do not guess. Do not proceed on assumption.
2. Create `BUILD_FLAGS.md` if it doesn't exist.
3. Append: `[SCREEN or DECISION] — [what is ambiguous] — [what you need to proceed]`
4. Move to a different screen or task that is unambiguous.
5. Resume the flagged item only when clarification arrives.

Example BUILD_FLAGS.md entry:
```
T3 — Section submit API shape unclear (OI-06) — need: endpoint spec before building T3 submit handler
```

## The One Rule

**Nothing ships without matching the IRIS element maps.**
Every element, state, and role rule in the IRIS maps is a build requirement — not a suggestion. If an IRIS map says E2e is required, it is required. If something is not in an IRIS map, it does not exist yet. Flag it and wait.

## Current Build Status

| Area | Status |
|---|---|
| Schema | 9 migrations, FELIX validated ✅ |
| Screens mapped | 21 of 21 ✅ |
| Decisions locked | D-001 through D-050 ✅ |
| Church provisioning | Self-serve signup — SIGNUP screen mapped ✅ |
| Blocking open items | None ✅ |
| Non-blocking open items | OI-01 (query enforcement · Phase 2 item) |
| Pending IRIS revisions | None ✅ |

## V2 Backlog
Explicitly out of scope for V1. Nothing is forgotten — everything unbuilt has a status.

| Feature | Status | Trigger to build |
|---|---|---|
| Super-admin dashboard | V2 | When church count exceeds 20 |
| Payment / billing gate integration | V2 | When charging churches requires automation |
| Payment / billing gate | V2 or manual billing | Decision pending — manual billing scales to ~10 churches |
| Marketing site | Separate project | Parallel to V1 build |
| Mobile app (native) | V2 | After web app validated with first cohort |
| API / third-party integrations | V2 | After core product stable |

## Build Order

**Phase 1 — Foundation**
1. Supabase project setup — run migrations 0001 through 0009 in order
2. Next.js scaffold — App Router, TypeScript, Tailwind
3. Auth layer — Supabase Auth, middleware, role-based route protection
4. Layout components — AuthLayout · OnboardingLayout · AppLayout (tab bar, role-aware)

**Phase 2 — Auth + Onboarding**
5. SIGNUP (new church) · AUTH (returning user) · INVITE_ACCEPT (team member)
6. ONBOARDING_CHURCH → T_LOC → T6 → T_SCHED → T9 (5-step linear sequence)
7. Gate 1 logic — redirect to onboarding if setup incomplete

**Phase 3 — Sunday Loop**
7. T1 → T1B → T2 → T3 → T4 → T5
8. SUNDAY_SESSION context — sessionStorage keyed by date, restored from URL param
9. Section-submit is independent per audience group (D-049) — one API call per section, UPSERT per category row

**Phase 4 — Dashboard**
10. D1 (Full Dashboard) — Owner/Admin. Primary tag rows, three comparison columns, audience drill-down.
11. D2 (Viewer Summary) — Viewer only. Same structure, no Volunteers, no drill-down, re-auth note.

**Phase 5 — Settings**
10. T_SETTINGS hub → T6B · T7 · T8 · T_GIVING_SOURCES · T_TAGS · T9_SETTINGS
11. Settings versions of T_LOC · T6 · T_SCHED (share components with onboarding versions)

## Stack-Specific Notes

**Auth:**
- Editors and Admins: `inviteUserByEmail` — standard password setup
- Viewers: `signInWithOtp` — magic link, no password (D-015)
- Viewer sessions: maximum refresh token duration — no expiry until removed (D-047)
- Viewer re-auth: `signInWithOtp` on login screen — no admin action needed (D-048)
- Invite tokens: `crypto.randomBytes(32).toString('hex')` — not Supabase gen_random_bytes() (D-009)

**RLS — critical:**
- Never bypass with service role key in client code
- `get_user_church_ids()` helper defined in migration 0001 — use in all policies

**Tags — critical:**
- `service_occurrence_tags` is the reporting table — all dashboard queries JOIN here
- Never re-derive tag membership from `service_template_tags` at query time (Rule 6)
- `apply_tag_to_occurrences()` runs at assignment time only
- `active_tagged_services` view gates T1 — P12 and P12b JOIN through it, not `service_templates` directly

**Attendance — critical:**
- NULL means not entered. 0 means confirmed zero.
- Never `COALESCE(attendance, 0)` in averages — corrupts the denominator (Rule 4)

**SUNDAY_SESSION state:**
- Key: `sunday_session_[YYYY-MM-DD]`
- Restoration pointer: `sunday_last_active`
- If empty on T2–T5 load: redirect to T1. Do not throw an error.
- Scope: React Context wrapping T1B, T2, T3, T4, T4_SUMMARY, T5

**Shared components — build once:**
- `InlineEditField` — pencil icon + editable input + save on blur. Used in T6, T-loc, T-tags, T7, T8, T-giving-sources.
- `TrackingGate` — checks church tracking flags before rendering a section. Used in T1B, T3, T4, T5, D1, D2.

---
*What changed in v1.3 from v1.2: All phases APPROVED. 21 screens mapped. D-049/D-050 close OI-06 and F-new-7. SIGNUP/AUTH/INVITE_ACCEPT added to Phase 2. Graph added to reading order. Build status fully current. Date corrected to 2026-04-10.*
