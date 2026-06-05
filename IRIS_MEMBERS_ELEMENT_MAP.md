## Status: Spec (design) — Pending build
## Version: 1.0
## Pending revisions: server-side write enforcement finalizes when migration 0029 lands (N-1)
## Last updated: 2026-06-03

# IRIS Element Map — MEMBERS screen (Members & Invitations — account-portal, D-096)

**Owner:** IRIS · **Build lead:** NOVA · **Gate:** SAGE
**Target route (build):** `/(app)/settings/team` (the existing T9_SETTINGS route is **promoted to canonical** and fully redesigned — D-096 reconciliation)
**Reconciles:** the two divergent team surfaces — `settings/team/page.tsx` (Surface 1, invite form, broken `auth.users` join, red pills) AND the Team zone inside `settings/locations/page.tsx` (Surface 2, role/default-campus/deactivate, DS-compliant). **This screen becomes the single source of truth; Locations sheds its Team zone and links here.**
**Design decisions:** D-096 (account portal), D-088 (default_location_id), D-092 (0029 RLS gating), D-085/86/87 (campus = dimension) in `SCHEMA_CUTOVER_STATUS.md` (read those first).
**Design system:** binding — `DESIGN_SYSTEM.md` DS-1..DS-25. Mirror the Entries aesthetic; reuse `@/app/(app)/entries/ui` primitives (`Ico`, `Dot`, `membershipRoleLabel`).

> This screen is the church's people hub: who has access today (active members) and who has been
> invited but not yet joined (pending/expired invitations). Everything is schema-driven — names,
> roles, campuses, and invite statuses all come from the church's own data. Owner/admin manage;
> editor/viewer read.

---

## Purpose & Core Loop
An owner or admin opens Members → sees every **active member** (name, email, role, default campus, a You badge on their own row) and every **pending/expired invitation** (email, role, status, expiry) → can **change a member's role**, **set a member's default campus**, **deactivate** a member, **invite a new member** (email + role), and **resend** or **revoke** a pending invite. Editor/viewer see the same lists read-only with no write controls. All writes are owner/admin-gated in the UI; **DB-level enforcement of role-restricted writes depends on migration 0029 (NOT applied — N-1).**

## Roles (church_memberships.role)
| Role | On this screen |
|---|---|
| owner | Full read + write. May change any role incl. promote/demote to owner; invite admin/editor/viewer; deactivate anyone except the last owner and self. |
| admin | Full read + write **except** cannot set role to `owner` and cannot modify an `owner` row (role/campus/deactivate). Invite editor/viewer only. |
| editor / viewer | **Read-only** — sees member list + invitations; all controls hidden/disabled. May still set **their own** default campus on the Locations screen (not duplicated here — DS-23 declutter). |

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| Church | session → `church_memberships` (active, single) | tenant scope (`church_id`) on every query |
| My role | that membership's `role` | drives all write-gating; re-asserted server-side in every mutation action |
| Self | `auth.getUser().id` | You badge (E-21); never deactivate/demote self into lockout |

## Data Dependencies
- `church_memberships(id, church_id, user_id, role, is_active, default_location_id, invited_by, invited_at, accepted_at)` — active members list
- `church_invites(id, church_id, email, role, token, status['pending'|'accepted'|'expired'|'cancelled'], expires_at, accepted_at, invited_by, created_at)` — invitations list. **`status` + `expires_at` columns exist but are currently unused by code — this screen makes them load-bearing.**
- `church_locations(id, name, code, is_active, sort_order)` — default-campus picker options (active only)
- `user_profiles(id, full_name)` — member name resolution. **RLS: only `profiles_own_access` today; co-member names require `profiles_comember_read` (migration 0029 — N-1). Until applied, teammate rows fall back to `Member · <id4>` (same pattern as Surface 2).**
- `lib/email/resend.ts` — `sendEmail(to, 'invite', { inviteUrl, inviterName, role, churchName })`. **Invite template exists but is never sent today (dead code) — this screen wires it (N-3).**
- Supabase Auth admin (service-role) — invite email delivery + member session revoke on deactivate.

---

## Layout (one page, `max-w-3xl`, mirrors Locations/Entries)
Header (Zone A) → **Members** section (Zone B) → **Invitations** section (Zone C) → **Invite a member** form (Zone D). Sections are `rounded-2xl border border-slate-200 bg-white shadow-sm` with `divide-y divide-slate-100` rows (DS-5/DS-7). No tabs (single scroll; lighter than Entries).

---

## Element Map

### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | Back-to-Settings button | — | hover; `focus-visible` ring brand blue | all |
| E-2 | Church eyebrow + "Members & Invitations" title | `churches.name` eyebrow (`#3D5BD4`), title slate-900 extrabold | — | all |
| E-3 | Counts subline | derived: "N members · M pending" (M = invites with status `pending`) | plain text (DS-6, no pills) | all |

### Zone B — Members (active `church_memberships`)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Section label "Members" + users glyph | — | — | all |
| E-11 | Member row (×N) | one active membership; ordered by `created_at` asc | `busy` while a row write is in flight; `opacity` muted if last-owner-locked | all |
| E-12 | Name | `user_profiles.full_name` by `user_id`; fallback `You` (self) / `Member · <id4>` (teammate, pre-0029 — N-1) | — | all |
| E-13 | Email | resolved via service-role read (see N-5) where available; else hidden (no `auth.users` PostgREST join — that was the Surface 1 bug) | — | all |
| E-14 | Role meta / role picker | `church_memberships.role` | read-only `· <Role>` (viewer/editor) **or** `<select>` (owner/admin); admin select omits `owner`; **last-owner guard** disables demoting the only owner; **self-demote guard** | picker = owner/admin |
| E-15 | Default-campus picker | `church_memberships.default_location_id`; options = active `church_locations` by sort_order; "First active campus" = null | `<select>`; disabled when no active campuses; admin cannot edit an owner's | owner/admin (others read-only label) |
| E-16 | Remove (soft deactivate) | sets `is_active=false` + global session revoke (N-6) | hidden for self, last owner, and (for admin) owner rows; confirm before write | owner/admin |
| E-21 | You badge | `user_id === self` | brand-tinted pill (`#4F6EF7/10`, text `#3D5BD4`) — the one legit pill (DS-8 exception, true status) | all |
| E-22 | Empty / single-member state | members.length ≤ 1 | "Just you for now." | all |

### Zone C — Invitations (`church_invites`)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-30 | Section label "Invitations" | — | — | all |
| E-31 | Invite row (×M) | invites where `status IN ('pending','expired')` (hide accepted/cancelled); ordered `created_at` desc | `busy` during resend/revoke | all |
| E-32 | Email | `church_invites.email` | — | all |
| E-33 | Role meta | `church_invites.role` | `· <Role>` plain text (DS-8) | all |
| E-34 | Status + expiry | derived: `status` + `expires_at`. **pending & not past expiry → Dot `needs` (orange outline) "Pending"**; **past `expires_at` OR status `expired` → Dot `empty` (gray) "Expired"** (DS-6 circles, NO RED for expired — DS-2) | reflects `status`/`expires_at` | all |
| E-35 | Expires-in hint | `expires_at` relative ("expires in 5 days" / "expired 2 days ago") | quiet slate meta | all |
| E-36 | Resend | re-issues invite email via Resend (N-3); for expired, also refresh `token`/`expires_at` and set `status='pending'` | hidden read-only; cooldown after send ("Sent ✓") | owner/admin |
| E-37 | Revoke / Cancel | sets `status='cancelled'` (soft — keeps audit row, NOT hard DELETE — fixes Surface 1) | confirm; hidden read-only | owner/admin |
| E-38 | Empty state | no pending/expired invites | "No open invitations." | all |

### Zone D — Invite a member (owner/admin only; hidden for editor/viewer)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-40 | Section label "Invite a member" | — | — | owner/admin |
| E-41 | Email input | controlled; lowercased+trimmed on submit; `type=email` | `focus-visible` brand ring | owner/admin |
| E-42 | Role radio group | role options scoped by caller: owner → admin/editor/viewer; admin → editor/viewer (mirrors `onboarding/invite/page.tsx`) | selected = brand-bordered card | owner/admin |
| E-43 | Role description helper | static copy per role | — | owner/admin |
| E-44 | Send invite button | creates `church_invites` row (`status='pending'`, `expires_at`, `token`) + sends email (N-3); viewer → magic-link path, others → password-setup path (preserve existing dual delivery) | disabled until valid email; "Sending…"; success reassurance | owner/admin |
| E-45 | Duplicate guard note | if email already an active member or has a pending invite → inline message, no insert | shows on collision | owner/admin |

### Shared components / states
| E# | Element | Behaviour |
|----|---------|-----------|
| E-50 | Status circle | E-34 reuses the **exact** `Dot` from `entries/ui` (DS-6): gray outline = expired/inert · orange outline = pending · (sage check unused here — no "complete" invite state in the open list). |
| E-51 | Row write feedback | optimistic update + revert-on-error (mirror Locations Zone C pattern); no red — errors surface as quiet retry/inline text (DS-2/DS-10). |

---

## Reconciliation actions (the core task)
1. **Promote `settings/team` to canonical** and redesign it fully to DS-1..DS-25 (kill the purple/green/red `RoleBadge` pills, the `hover:text-red-500`, `text-red-600` errors, `focus:ring-blue-500` → `#4F6EF7`).
2. **Port** role picker + default-campus picker + soft-deactivate + last-owner/self guards **from Surface 2 (Locations Zone C)** into this canonical screen.
3. **Add** the Invitations list with **status/expiry/resend/revoke** (new — neither surface has it).
4. **Strip the Team zone from `settings/locations/page.tsx`** (E-60..E-66 there) and replace its `Invite a member` link/zone with a single link to `/settings/team`. Locations keeps **Campuses only** (Zone B) — they stop being two team surfaces.
5. **Drop the broken `auth.users` embed** in `getTeamData` entirely; resolve names via `user_profiles` and emails via a service-role read keyed to this church's member `user_id`s (N-5).
6. **Fix invite lifecycle to use the `status` column**: insert `status='pending'` + `expires_at`; revoke = `status='cancelled'` (not DELETE); list filters on `status`, not `accepted_at IS NULL`.

---

## NOVA Items (build tasks / risks)
- **N-1 — 0029 dependency (gating).** Role-restricted **writes** (role change, deactivate, invite, resend, revoke) are owner/admin-gated in UI **only** until migration 0029 adds role-aware RLS write policies on `church_memberships`/`church_invites`. **Every mutation server action MUST also re-assert the caller's role server-side** (re-read caller membership, verify owner/admin, verify target not last-owner) because the actions run through the service-role client which bypasses RLS (S1/S3 from audit). 0029 also adds `profiles_comember_read` → member names resolve; pre-0029 they fall back to `Member · <id4>`. **FLAG — 0029 not applied; do not apply.**
- **N-2 — Pagination.** Members and invites both paginate past the 1000-row PostgREST cap (range+loop, same pattern as Locations Zone C). Tenant + `church_id` filter on every query.
- **N-3 — Wire the Resend `invite` template.** `sendInviteAction` currently delivers only via Supabase Auth `generateLink`/`inviteUserByEmail` and never calls `sendEmail(...,'invite',...)`. Decide one delivery path: either (a) send the branded Resend invite carrying the `${NEXT_PUBLIC_APP_URL}/auth/invite/<token>` link, or (b) keep Supabase delivery and drop the unused template. **Spec recommends (a)** so the token link in `/auth/invite/[token]` actually reaches the invitee. If `RESEND_API_KEY`/domain unset → **flag, don't fail**; still create the invite row and surface "email not configured."
- **N-4 — Invite lifecycle on the `status` column.** Insert `status='pending'` + `expires_at` (e.g. now + 14 days); resend refreshes `token`+`expires_at`+`status='pending'`; revoke sets `status='cancelled'`; accepted invites set `status='accepted'` (handled in the separate invite-accept rebuild — cross-ref D-096). List = `status IN ('pending','expired')` with client-side expiry derivation from `expires_at`.
- **N-5 — Email + name resolution.** Names: `user_profiles.full_name` by `user_id`. Emails: NOT via PostgREST `auth.users` embed (that was the break). Read emails through a **server action using the service-role admin client** (`admin.auth.admin` listUsers/getUserById, church-scoped to this church's member ids only). Minimize service-role surface; never return other churches' data.
- **N-6 — Deactivate = soft + revoke.** `is_active=false` + `admin.auth.admin.signOut(user_id, 'global')` (preserve existing `removeMemberAction` behavior). Last-owner guard + self-guard server-side.
- **N-7 — Server-side caller-role assertion in all actions.** New/updated actions (`setMemberRoleAction`, `setMemberDefaultCampusAction`, `deactivateMemberAction`, `sendInviteAction`, `resendInviteAction`, `revokeInviteAction`) each: re-read caller membership server-side, assert owner/admin (and admin≠owner-target), tenant-scope target to caller's `church_id`. Fixes audit S1/S2/S3.
- **N-8 — Default-campus on invite (optional, D-088).** `sendInviteAction` may carry a default `default_location_id` to stamp on the membership at accept time; MVP may omit (accept falls back to first active campus). Flag as fast-follow.
- **N-9 — Role gating.** editor/viewer: Zone D hidden; E-14 role picker → read-only label; E-15 campus picker → read-only; E-16/E-36/E-37 hidden. admin: cannot target owner rows or assign owner.

## Query Patterns to author (→ QUERY_PATTERNS.md, N-2)
QP-MEMBERS-ACTIVE (active memberships by church, paginated, order created_at) · QP-MEMBER-PROFILES (user_profiles by user_id IN, post-0029) · QP-MEMBER-EMAILS (service-role admin, church-scoped) · QP-INVITES-OPEN (church_invites where status IN pending/expired, paginated) · QP-MEMBER-ROLE-UPDATE (caller-role-checked) · QP-MEMBER-CAMPUS-UPDATE · QP-MEMBER-DEACTIVATE (soft + last-owner guard) · QP-INVITE-CREATE (status=pending + expires_at + token) · QP-INVITE-RESEND (refresh token/expiry) · QP-INVITE-REVOKE (status=cancelled). All: tenant + church_id, paginated past 1000-row cap.

## Open Items
- O-1 Resend-vs-Supabase invite delivery (N-3) — confirm single path (recommend Resend branded).
- O-2 Email exposure: confirm showing teammate emails to owner/admin via service-role read is acceptable (church-scoped); editor/viewer see names only, no email.
- O-3 `expires_at` window length (proposed 14 days) — confirm.
- O-4 Whether editors may view the member list at all, or only owner/admin (spec: all roles read; writes owner/admin). Confirm.
- O-5 Default-campus-on-invite (N-8) — MVP omit vs include.

## Flagged migrations (NOT applied — guardrail)
- **0029** (D-092) — role-aware RLS write policies on `church_memberships` + `church_invites`, and `profiles_comember_read` on `user_profiles`. **Required for server-side enforcement + teammate name resolution. NEEDS-APPROVAL — not applied.** Until then: UI-gated + server-action caller-role checks only; names fall back to `Member · <id4>`.
- No new migration introduced by this screen — it uses columns that already exist (`church_invites.status`, `expires_at`; `church_memberships.default_location_id`). If review wants a defaulted `expires_at` (DB default) that would be a new migration file — **flag, don't apply.**

## External setup to flag (Builder, not agent)
- **Resend:** `RESEND_API_KEY` + verified sending domain for `RESEND_FROM_EMAIL` (default `Sunday Tally <noreply@sundaytally.app>`). Without it, invite emails can't send — screen still creates the invite row and surfaces "email not configured."
- **`NEXT_PUBLIC_APP_URL`:** must be set in prod (invite URL = `${NEXT_PUBLIC_APP_URL}/auth/invite/<token>`; empty origin produces a malformed link). Inconsistent defaults across files (`localhost:3000` vs `https://sundaytally.app`) — set explicitly.
- **Supabase Auth redirect URLs:** must whitelist `${NEXT_PUBLIC_APP_URL}/auth/invite/*` (and `/auth/callback` once that route lands — separate D-096 invite-accept rebuild) for the generateLink/inviteUserByEmail flows.

## Decision References
D-096 (account portal blueprint) · D-088 (per-user default location) · D-092 (0029 role RLS, Settings conditional) · D-085/86/87 (campus = church-wide dimension) · D-009 (invite token = crypto.randomBytes(32)). Audit findings grounded: B1/B3 (auth.users embed broken → user_profiles + service-role), B6 (status/expires_at unused → now load-bearing), S1/S2/S3 (server-side caller-role assertion), Email finding (Resend invite template was dead code → wired in N-3), Reconciliation (two team surfaces → one canonical `settings/team`).
