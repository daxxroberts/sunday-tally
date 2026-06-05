## Status: Spec (design) — Pending build
## Version: 1.0
## Pending revisions: password-strength rule + reauth-on-change pattern (N-3) finalize at build
## Last updated: 2026-06-03

# IRIS Element Map — ACCOUNT screen (self-service profile + password, D-096)

**Owner:** IRIS · **Build lead:** NOVA · **Gate:** SAGE
**Target route (build):** `/(app)/settings/account` (linked from the Settings hub, `(app)/settings/page.tsx`)
**Design decisions:** D-088 (per-user default location), D-092 (0029 RLS), D-096 (account portal blueprint) in `SCHEMA_CUTOVER_STATUS.md` (read those first)
**Design system:** DESIGN_SYSTEM.md DS-1..DS-25 (binding)
**Format reference:** `IRIS_ENTRIES_ELEMENT_MAP.md`

> This screen is the signed-in user's *own* account surface — **role-agnostic**: every user (owner/admin/editor/viewer)
> manages their own email, display name, default campus, and password. It is NOT a team/members admin screen
> (that is the separate Members & Invitations surface under D-096 — out of scope here). No church-wide writes,
> no other-member data. All values are bound to the current session's auth user + their own membership row.

---

## Purpose & Core Loop
A signed-in user opens Settings → Account → sees their email (read-only, from auth), edits their display name,
picks their own default campus (D-088), and can change their password. Saves are explicit per-section (small,
quiet) — this is config, not high-frequency data entry, so it does NOT use the Entries autosave-on-blur loop;
it uses an InlineEditField-style save-on-action pattern. Derived/read-only context (role, church) is shown but
never editable here.

## Roles (church_memberships.role) — role-agnostic
| Role | On this screen |
|---|---|
| owner / admin / editor / viewer | **Identical.** Every user manages their OWN account: display name, default campus, password. Role + church shown read-only. No role can edit another user from this screen. |

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| User | `supabase.auth.getUser()` | identity = `auth.users.id`; email = `auth.users.email` |
| Membership | `church_memberships` WHERE `user_id = user.id` AND `is_active = true` `.single()` | yields `role`, `church_id`, `default_location_id`, `churches(*)` |
| Profile | `user_profiles` WHERE `id = user.id` (own row — RLS `profiles_own_access` permits self-read) | `full_name`, `avatar_url` |
| Campuses | `church_locations` WHERE `church_id` AND `is_active = true` ORDER BY `sort_order` | the default-campus picker options |

---

## Data Dependencies
- `auth.users` — email (read-only), `auth.updateUser({ password })` for change (E-40).
- `user_profiles(id → auth.users, full_name, avatar_url)` — display name (editable, E-20). RLS today = `profiles_own_access` (own row only) → self read+write WORKS without 0029. (0029 only adds *co-member* reads — not needed here.)
- `church_memberships(role, church_id, default_location_id)` — role/church read-only; `default_location_id` self-editable (D-088, E-30). **No 0029 dependency** for self-editing one's OWN membership row IF RLS permits a member to update their own row's `default_location_id`; **FLAG (see N-5):** verify/confirm self-update RLS on `church_memberships` — if RLS only permits owner/admin writes, self-set of default campus needs a policy (gated migration, not applied).
- `church_locations(id, name, code, is_active, sort_order)` — campus picker options.
- `churches(name)` — church name display (read-only).

---

## Layout
Single column, centered `max-w-3xl` (DS-5, mirrors Settings hub + Entries). Wrapped in `@/components/layouts/AppLayout` with the resolved `role`. Sections rendered as `Section`-style groups (`rounded-2xl border border-slate-200 shadow-sm`, reuse the Settings hub `Section` pattern). No tabs — this is a flat settings detail page.

---

## Element Map

### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | Church eyebrow + "Account" title | `churches.name` (eyebrow), static "Account" | — | all |
| E-2 | Back-to-Settings affordance | link `/settings` | — | all |

### Zone B — Profile section
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Email (read-only) | `auth.users.email` | static; muted; helper "Sign-in email — contact support to change" | all |
| E-11 | Role + church (read-only) | `membershipRoleLabel(role)` + `churches.name` | plain text, DS-8 "· role" meta style (NOT a pill) | all |
| E-20 | Display name (editable) | `user_profiles.full_name` | InlineEditField pattern: idle → editing → saving → Saved ✓ (sage); empty allowed (falls back to email locally). Error = amber retry, never red | all (self) |
| E-21 | Save display name action | upsert `user_profiles` (id=user.id, full_name) | quiet "Saved ✓" (DS-11 vocabulary, but explicit save not blur-autosave) | all (self) |

### Zone C — Default campus (D-088)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-30 | Default campus picker | `church_memberships.default_location_id`; options = active `church_locations` by `sort_order` | select; current value preselected; on change → update own membership row; "Saved ✓" | all (self) |
| E-31 | Campus helper text | — | muted: "The campus Entries opens to by default. You can switch campuses anytime." | all |
| E-32 | Single/zero-campus state | derived from options count | if 1 campus → show name read-only (no picker); if 0 active → muted "No campuses configured" + link to `/settings/locations` | all |

### Zone D — Change password (E-40 group)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-40 | Change-password subsection | `supabase.auth.updateUser({ password })` | collapsed → expand "Change password" | all (self) |
| E-41 | Current password (reauth) | `signInWithPassword({ email, password: current })` to re-verify session before change (N-3) | required; on fail → amber "Current password is incorrect" (never red) | all (self) |
| E-42 | New password | local | strength meter (E-44); min 8 chars MVP | all (self) |
| E-43 | Confirm new password | local | must equal E-42 → else amber "Passwords don't match" | all (self) |
| E-44 | Strength indicator | derived from E-42 | weak/ok/strong using **status-system vocabulary** (amber=weak/needs, sage=strong); NEVER red; shape+text not color-only (DS-18) | all (self) |
| E-45 | Save password action | `auth.updateUser({ password })` after E-41 reauth + E-42=E-43 | saving → "Password updated ✓" (sage); on auth error → amber message + retry | all (self) |
| E-46 | Magic-link-only notice | derived: if user has no password (viewers via OTP per CLAUDE.md auth) | if account is OTP/magic-link only → hide E-41 current-password; offer "Set a password" (updateUser sets first password) instead of "change" | viewer-style accounts |

### Shared component
| E# | Element | Behaviour |
|----|---------|-----------|
| E-50 | InlineEditField (existing shared, per CLAUDE.md "build once") | pencil icon (DS-15 hover chrome, `Ico.pencilFill`) + editable input + save on action. Reuse for E-20 display name. SVG icons only (DS-14), focus-visible brand ring (DS-19). |
| E-51 | Save status indicator | reuse DS-11 vocabulary: idle · saving… · "Saved ✓" (sage `#15803D`) · error→amber retry. Indicator to the LEFT of value (DS-10). Never red (DS-2). |

---

## NOVA Items (build tasks / risks)
- **N-1** Reuse primitives from `@/app/(app)/entries/ui`: `Ico` (SVG icons), `membershipRoleLabel`, `Dot` if a status circle is wanted on the password-strength row. Reuse the Settings hub `Section` group styling. Build/extract a shared `InlineEditField` (CLAUDE.md "build once" component) — used here for E-20 and reusable across T6/T-loc/T-tags etc.
- **N-2** Profile write: `user_profiles` upsert on `id = user.id` (own row). Insert-if-missing — signup may not have populated `user_profiles` (audit B-finding: signup stuffs name into `user_metadata` only). This screen should create the row on first save so member-lists later populate. **FLAG:** consider a one-time signup fix to insert `user_profiles` on account creation (separate task).
- **N-3** Password change reauth pattern: verify current password via `signInWithPassword` before `updateUser({ password })` to prevent session-hijack password change. Confirm-match + min-length (8 MVP). Handle the OTP/magic-link-only account case (E-46): no current password to verify → set-first-password flow. Finalize strength rule at build.
- **N-4** Default-campus self-update: write `church_memberships.default_location_id` for the caller's own row only. Use the **user client** (not service-role) so RLS scopes the write to the caller.
- **N-5** **RLS verification (gating):** confirm `church_memberships` RLS permits a member to UPDATE their OWN row's `default_location_id`. If current policy restricts membership writes to owner/admin (or only church-isolation without a self-update path), self-set of default campus will silently fail or be blocked → **FLAG a gated policy** (`memberships_self_default_location_update`: `auth.uid() = user_id`, column-scoped to `default_location_id`) — WRITE the migration file under `sunday-tally/supabase/migrations/00NN_*.sql`, mark **NEEDS-APPROVAL — not applied**, do NOT apply. Until confirmed/applied, gate E-30 with a graceful error (amber) and note the dependency.
- **N-6** Role-agnostic: NO owner/admin gating on this screen — every authenticated member edits their own account. Do NOT add the Settings-hub "View only" tag here.
- **N-7** All reads tenant-scoped to the caller's own ids (`user.id`, own `church_id`); single-row fetches, no pagination needed (no 1000-row exposure).
- **N-8** Add the hub link: `/settings/account` row in `(app)/settings/page.tsx` (an "Account" / "Your account" section — visible to ALL roles, unlike the owner/admin config rows). Self-service, so no write-gating on the link.
- **N-9** DESIGN_SYSTEM compliance: NO RED (DS-2) anywhere incl. password errors/strength; status vocabulary = sage/amber only; SVG icons only (DS-14); focus-visible brand rings (DS-19); reduced-motion (DS-17); Fira Sans + Fira Code numerals (DS-4); plain "· role" text not pills (DS-8). Mirror Entries/Settings visual language (DS-22..DS-25).

## Query Patterns to author (→ QUERY_PATTERNS.md)
- **QP-ACCOUNT-CONTEXT** — `auth.getUser()` → membership(`role,church_id,default_location_id,churches(name)`) self-row + `user_profiles` self-row.
- **QP-ACCOUNT-CAMPUSES** — active `church_locations` by `sort_order` (picker options; tenant-scoped).
- **QP-PROFILE-UPSERT** — `user_profiles` upsert on `id=user.id` (full_name).
- **QP-DEFAULT-CAMPUS-SET** — `church_memberships` update `default_location_id` WHERE own row (user client, RLS-scoped).
- **QP-PASSWORD-CHANGE** — reauth `signInWithPassword` → `auth.updateUser({ password })`.

## Open Items
- O-1 Password strength rule + min length — confirm at build (proposed: ≥8 chars MVP, amber<strong).
- O-2 OTP/magic-link-only account detection (E-46) — confirm how to detect "no password set" (likely user app_metadata / providers) for set-vs-change branching.
- O-3 Avatar (`user_profiles.avatar_url`) — OUT of MVP scope unless trivial; flag as fast-follow (no upload pipeline yet).
- O-4 N-5 RLS self-update path on `church_memberships` — confirm before relying on E-30.

## Decision References
D-088 (per-user default location) · D-092 (0029 RLS scope — co-member reads, NOT required here) · D-096 (account portal blueprint; this screen = the MISSING "self-service Account/Profile + password change" item).

## Flagged migrations (NOT applied — write file, mark NEEDS-APPROVAL)
- **(conditional, per N-5)** `church_memberships` self-update RLS for `default_location_id` (`auth.uid() = user_id`, column-scoped). Only if verification shows members cannot currently self-update their default campus. WRITE under `sunday-tally/supabase/migrations/00NN_*.sql`; do NOT apply.
- No other schema changes — `user_profiles` self read+write already works under existing `profiles_own_access`.

## Flagged external setup (Builder, not agent)
- **Supabase Auth:** none new required for self password change (`updateUser` uses the live session). If a "set password" email path is ever added for OTP-only users, redirect URLs would need the callback (tracked under D-096 auth callback finding, separate task).
- No Stripe/Resend dependency for this screen.
