# SundayTally — Launch-Readiness Status (BOT review)
Owner: KEEPER · Reviewed by SAGE · 2026-06-04

**One line:** The app is **LIVE in production at https://sundaytally.church** (valid SSL, auto-deploy from `main`). Core product (auth, entries, dashboard, history, settings, account portal) is built, schema cutover is complete and applied, and the codebase is committed/merged to `main`. **Email (Resend) and billing (Stripe) are not yet activated**, and a short security-hardening list is open before real churches onboard.

---

## 1. Infrastructure / deployment (NOVA)
| Piece | State |
|---|---|
| Production URL | ✅ `https://sundaytally.church` serving the app, valid cert |
| Vercel project | ✅ `sunday-tally` (team `sunday-tally-s-projects`), Next.js, Node 24 |
| Auto-deploy | ✅ push to `main` → production deploy; latest deployment `READY` |
| Custom domain | ✅ `sundaytally.church` attached + SSL issued (apex; `www` redirect recommended) |
| `.vercel.app` aliases | ✅ `sunday-tally.vercel.app` live |
| Cron | ✅ `vercel.json` → `/api/cron/trial-reminders` daily 14:00 UTC |
| Git | ✅ merged to `main` (`f0eac63`), GitHub `daxxroberts/sunday-tally` |

## 2. Database (STRATA / SCHEMA)
| Piece | State |
|---|---|
| Supabase project | ✅ `iwbrzdiubrvogiamoqvx`, healthy |
| Schema cutover | ✅ tag-first (migrations 0022–0029 applied) |
| Role-aware RLS (0029) | ✅ applied; viewer self-promotion empirically blocked (D-098) |
| Demo church data | ✅ 5,494 metric_entries, proven import |

## 3. Capability readiness scorecard (SAGE gate per capability)
| Capability | Status | Gate |
|---|---|---|
| Site renders on custom domain | ✅ LIVE | SHIPPED |
| Auth (login, magic-link, reset, invite) — code | ✅ built; canonical invite (D-099) | SHIPPED (code); ⚠ email delivery untested |
| Entries / Dashboard / History / Settings / Account | ✅ built, FELIX/LENS verified | SHIPPED |
| Email delivery (Resend) | ⛔ not activated — no key, domain unverified | GATED |
| Billing (Stripe) | ⛔ not activated — no keys, no price, no webhook | GATED |
| Security hardening | ⚠ open items (see §4) | GATED for multi-tenant GA |

**SAGE verdict:** *Conditional GO for "soft live."* The product is publicly reachable and the core loop works against Supabase. **NOT yet GO for paid customer onboarding** until: (a) Resend verified + the leaked key rotated, (b) Stripe wired, (c) the §4 security items cleared. These are activation/config gates, not build gaps.

## 4. Security posture (STRATA — Supabase advisors, 2026-06-04)
- ⛔ **Leaked-password protection OFF** — enable in Supabase → Auth (1 click). P0.
- ⛔ **Rotate the Resend key** pasted in chat (`re_4hr7…`) — revoke + reissue. P0.
- ⚠ **SECURITY DEFINER view** `active_tagged_services` (linter ERROR) — confirm it can't leak across churches; fix via migration FILE (FELIX-gated). P1.
- ⚠ **Anon-executable SECURITY DEFINER functions** (seed_*, protect_*, set_metric_entry_reporting_tag_code) — revoke EXECUTE from `anon`. P1.
- ⚠ `function_search_path_mutable` on `check_last_owner`, `set_updated_at`; `btree_gist` in public schema. P2 hardening.

## 5. Punch list (prioritized)
**P0 — before any real church:**
1. Rotate leaked Resend key.
2. Enable Supabase leaked-password protection.
3. Resend: verify `mail.sundaytally.church` (SPF/DKIM) → scoped key → set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in Vercel → redeploy.
4. Verify email delivery end-to-end (invite + reset).

**P1 — before charging:**
5. Stripe: $22/mo price + webhook → `https://sundaytally.church/api/stripe/webhook` (events incl. `invoice.paid`) → `STRIPE_*` env → verify checkout/portal/dunning/recovery.
6. Set `NEXT_PUBLIC_APP_URL=https://sundaytally.church` in Vercel env (code already falls back to it).
7. Security: revoke anon EXECUTE on seed/protect functions; review the SECURITY DEFINER view for tenant isolation (migration FILE → FELIX → apply).

**P2 — polish / cleanup:**
8. `#14` analytics-chat exhausted inline message; `#15` Welcome email decision (lean: skip).
9. DS: `trialEnding7d/1d` CTAs → #4F6EF7. Docs: `D-009`→`D-099` comment typo; IRIS-map `.app`→`.church` mentions; dedup empty "Main" location (DB write, needs approval).
10. `www` redirect to apex in Vercel.

## 6. Where the detail lives
- `SCHEMA_CUTOVER_STATUS.md` (D-072…D-099) · `EMAIL_POLICY.md` · `STRIPE_AND_EMAIL_PLAN.md` · `SUBAGENT_STANDARD.md` · `DESIGN_SYSTEM.md` · `SESSION_HANDOFF_2026-06-03.md` · `IRIS_*_ELEMENT_MAP.md`.
