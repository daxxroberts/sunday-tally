# BUILD_PROGRESS.md
## Session state tracker — read this at the start of every new session

Last updated: 2026-04-15
Last session ended at: Phase 5 COMPLETE — all screens built
Next session starts at: VERIFICATION + INTEGRATION TESTING

---

## ✅ ALL PHASES COMPLETE

---

## Phase 1 — Foundation ✅

| Task | Status |
|------|--------|
| Next.js scaffold (App Router, TypeScript, Tailwind) | COMPLETE |
| Supabase client (browser + server + service role) | COMPLETE |
| Middleware (auth + all gate checks) | COMPLETE |
| AuthLayout | COMPLETE |
| OnboardingLayout | COMPLETE |
| AppLayout (role-aware tab bar) | COMPLETE |
| SundaySessionContext | COMPLETE |
| InlineEditField (shared component) | COMPLETE |
| TrackingGate (shared component) | COMPLETE |
| Types (index.ts) | COMPLETE |
| All route stubs → real pages | COMPLETE |
| Root page → redirect /auth/login | COMPLETE |

**App location:** `SundayTally/sunday-tally/`

---

## Phase 2 — Auth + Onboarding ✅

| Screen | File | Status |
|--------|------|--------|
| SIGNUP `/signup` | `src/app/signup/page.tsx` + `actions.ts` | COMPLETE |
| AUTH `/auth/login` | `src/app/auth/login/page.tsx` + `actions.ts` | COMPLETE |
| INVITE_ACCEPT `/auth/invite/[token]` | `src/app/auth/invite/[token]/page.tsx` + `actions.ts` | COMPLETE |
| ONBOARDING_CHURCH `/onboarding/church` | `src/app/onboarding/church/page.tsx` | COMPLETE |
| T_LOC `/onboarding/locations` | `src/app/onboarding/locations/page.tsx` + `actions.ts` | COMPLETE |
| T6 `/onboarding/services` | `src/app/onboarding/services/page.tsx` + `actions.ts` | COMPLETE |
| T_SCHED `/onboarding/schedule` | `src/app/onboarding/schedule/page.tsx` + `actions.ts` | COMPLETE |
| T9 `/onboarding/invite` | `src/app/onboarding/invite/page.tsx` + `actions.ts` | COMPLETE |
| POST `/api/occurrences` | `src/app/api/occurrences/route.ts` | COMPLETE |

---

## Phase 3 — Sunday Loop ✅

| Screen | File | Status |
|--------|------|--------|
| T1 `/services` | `src/app/(app)/services/page.tsx` | COMPLETE |
| T1B `/services/[occurrenceId]` | `src/app/(app)/services/[occurrenceId]/page.tsx` | COMPLETE |
| T2 `/services/[occurrenceId]/attendance` | `.../attendance/page.tsx` | COMPLETE |
| T3 `/services/[occurrenceId]/volunteers` | `.../volunteers/page.tsx` | COMPLETE |
| T4 `/services/[occurrenceId]/stats` | `.../stats/page.tsx` | COMPLETE |
| T4_SUMMARY (within T4) | Green full-screen state in T4 | COMPLETE |
| T5 `/services/[occurrenceId]/giving` | `.../giving/page.tsx` | COMPLETE |

---

## Phase 4 — Dashboard ✅

| Screen | File | Status |
|--------|------|--------|
| D1 `/dashboard` | `src/app/(app)/dashboard/page.tsx` | COMPLETE |
| D2 `/dashboard/viewer` | `src/app/(app)/dashboard/viewer/page.tsx` | COMPLETE |
| Dashboard lib (P14a/b/c) | `src/lib/dashboard.ts` | COMPLETE |

---

## Phase 5 — Settings ✅

| Screen | File | Status |
|--------|------|--------|
| T_SETTINGS `/settings` | `src/app/(app)/settings/page.tsx` | COMPLETE |
| T_LOC_SETTINGS `/settings/locations` | `.../locations/page.tsx` | COMPLETE |
| T6_SETTINGS `/settings/services` | `.../services/page.tsx` | COMPLETE |
| T_SCHED_SETTINGS `/settings/services/[templateId]/schedule` | `.../schedule/page.tsx` | COMPLETE |
| T6B `/settings/tracking` | `.../tracking/page.tsx` | COMPLETE |
| T7 `/settings/volunteer-roles` | `.../volunteer-roles/page.tsx` | COMPLETE |
| T8 `/settings/stats` | `.../stats/page.tsx` | COMPLETE |
| T_GIVING_SOURCES `/settings/giving-sources` | `.../giving-sources/page.tsx` | COMPLETE |
| T_TAGS `/settings/tags` | `.../tags/page.tsx` | COMPLETE |
| T9_SETTINGS `/settings/team` | `.../team/page.tsx` | COMPLETE |

---

## Shared Components ✅

| Component | File | Status |
|-----------|------|--------|
| InlineEditField | `src/components/shared/InlineEditField.tsx` | COMPLETE |
| TrackingGate | `src/components/shared/TrackingGate.tsx` | COMPLETE |
| SundaySessionContext | `src/contexts/SundaySessionContext.tsx` | COMPLETE |
| AuthLayout | `src/components/layouts/AuthLayout.tsx` | COMPLETE |
| OnboardingLayout | `src/components/layouts/OnboardingLayout.tsx` | COMPLETE |
| AppLayout | `src/components/layouts/AppLayout.tsx` | COMPLETE |

---

## What a New Session Should Do Next

### Before writing any code:
1. Read `HANDOFF_BRIEF.md` and `DECISION_REGISTER.md` (quick refresh)
2. Read `BUILD_FLAGS.md` for any open blockers
3. Read this file to confirm current state

### Remaining work for production readiness:

**Integration:**
- [ ] Run migrations 0001–0009 against Supabase
- [ ] Create `.env.local` from `.env.local.example` with real Supabase keys
- [ ] Set `NEXT_PUBLIC_APP_URL` for invite links
- [ ] Verify `seed_all_defaults` RPC exists in migrations (SIGNUP action calls it — may need individual calls to `seed_default_service_tags`, `seed_default_stat_categories`, `seed_default_giving_sources`)
- [ ] Configure Supabase auth email templates for invite + magic link

**Known gaps flagged during build:**
- [ ] Gate 1 check not enforced in middleware yet — needs query against DB to check locations + service + schedule exist
- [ ] T4_SUMMARY auto-dismiss is 3s (IRIS says 2.5s) — minor fix
- [ ] Dashboard audience drill-down (E7, D1) shows placeholder — full P14a/b/c per audience needs additional query
- [ ] D1/D2 tag filter (E2) not yet implemented — shows all tags by default
- [ ] Offline banner (T1 E7) not implemented — low priority for V1
- [ ] InlineEditField used in settings — `apply_tag_to_occurrences` RPC must be verified in migration

**Supabase seed functions to verify exist:**
- `seed_all_defaults(p_church_id)` — called in SIGNUP action
- OR individual: `seed_default_service_tags`, `seed_default_stat_categories`, `seed_default_giving_sources`
- `apply_tag_to_occurrences(p_tag_id, p_template_id)` — called on tag assignment

---

## Migration Notes (MUST DO BEFORE TESTING)

```bash
# Run in Supabase SQL editor in order:
# 0001_initial_schema.sql
# 0002_remove_special_status.sql
# 0003_response_tracking.sql
# 0004_indexes_and_tracking_flags.sql
# 0005_audience_tracking_flags.sql
# 0006_stats_schema.sql
# 0007_giving_sources.sql
# 0008_service_tags.sql
# 0009_service_primary_tag.sql
```
