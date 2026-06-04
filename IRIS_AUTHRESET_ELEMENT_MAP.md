## Status: Spec only — Pending build (NOT implemented)
## Version: 1.0
## Pending revisions: recovery-session handshake (N-3) depends on /auth/callback route (audit B5) — finalize at build
## Last updated: 2026-06-03

# IRIS Element Map — AUTH RESET (Forgot / Reset Password)

**Owner:** IRIS · **Build lead:** NOVA · **Gate:** SAGE
**Reference style:** `sunday-tally/src/app/auth/login/page.tsx` (+ `AuthLayout`)
**Binding UI rules:** `DESIGN_SYSTEM.md` DS-1…DS-25
**Target routes (build):**
- `/(public)/auth/forgot` → `src/app/auth/forgot/page.tsx` — request a reset email
- `/(public)/auth/reset` → `src/app/auth/reset/page.tsx` — set a new password from the recovery session
**Decision refs:** D-096 (account portal — this flow is a required MISSING piece) · D-015/D-048 (existing auth: magic link / viewer re-auth) · D-051 (signup service-role pattern, unrelated but same auth surface)
**Audit linkage:** Section 3 "Password reset / forgot-password — none today"; B5 (no `/auth/callback` route — the recovery-session handshake is unverified and likely needs a callback exchange).

> Both screens are public (unauthenticated) and tenant-agnostic. No church scoping, no role.
> Supabase Auth sends the recovery email — the app never sends it (FLAG: external Auth redirect-URL config).
> Visual structure mirrors `/auth/login`: `AuthLayout` shell, single centered card, eyebrow + title, one primary button.
> Design-system correction: login currently uses `blue-600` and `red-*` error chrome (pre-DS drift). This flow uses
> brand `#4F6EF7` (DS-1) and **NO RED** (DS-2) — attention/error states render amber, success renders sage.

---

## Purpose & Core Loop
A user who forgot their password (any role — owner/admin/editor with passwords; viewers normally use magic link but the path is open) requests a reset → Supabase emails a recovery link → the link lands on `/auth/reset` carrying a recovery token that establishes a **recovery session** → the user sets a new password (with confirm + strength) → on success they are redirected to `/auth/login` to sign in with the new password.

## Roles
| Role | On these screens |
|---|---|
| (unauthenticated) | Full access — both screens are public; no membership/role read |
| any authenticated | Not the entry point; an authenticated user who wants to *change* a known password belongs in the account portal (D-096), out of scope here |

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| Origin | `window.location.origin` (client) | `redirectTo` for the recovery email = `<origin>/auth/reset` |
| Recovery session | Supabase Auth recovery token (URL hash/code) → session | `/auth/reset` requires a live recovery session; if absent/expired → show E-23 expired state, link back to E-1 forgot. **Never throw** (mirror N-3 of Entries map / SUNDAY_SESSION discipline) |
| App URL (server/email) | `NEXT_PUBLIC_APP_URL` | must be set in prod or recovery link origin is malformed (audit Section 5) |

## Data Dependencies
- **No tables, no schema, no migration.** This flow is pure Supabase Auth (`auth.users`).
- `supabase.auth.resetPasswordForEmail(email, { redirectTo })` — request (page 1)
- `supabase.auth.updateUser({ password })` — set new password under recovery session (page 2)
- Client = `createClient()` from `@/lib/supabase/client` (browser, anon key). No service-role anywhere in this flow.
- Recovery-session establishment may require `/auth/callback` `exchangeCodeForSession` (audit B5) — see N-3.

---

## Navigation
- `/auth/login` → "Forgot password?" link (E-50, NEW on login) → `/auth/forgot`
- `/auth/forgot` → submit → in-place "check your email" confirmation (E-12); secondary "Back to sign in" → `/auth/login`
- recovery email link → `/auth/reset`
- `/auth/reset` → success (E-22) → redirect `/auth/login` (with a one-time success banner/flash)
- `/auth/reset` no/expired session → E-23 → "Request a new link" → `/auth/forgot`

---

## Element Map

### Screen 1 — `/auth/forgot` (request reset)

#### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | Eyebrow "RESET PASSWORD" + title "Forgot your password?" | static | — | public |
| E-2 | Subtext ("Enter your email and we'll send a reset link.") | static | — | public |

#### Zone B — Request form
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Email field | controlled state; `email.trim().toLowerCase()` on submit (mirror login L38/48) | empty · disabled-while-pending; `<label htmlFor>`, `type=email`, `autoComplete=email` (DS-10) | public |
| E-11 | "Send reset link" primary button | calls `resetPasswordForEmail(email,{redirectTo:<origin>/auth/reset})` | enabled when email present; "Sending…" while pending; disabled+cooldown after send (DS-19 focus ring, brand `#4F6EF7`) | public |
| E-12 | Sent confirmation (in-place) | shows submitted email | "Check your email — we sent a reset link to {email}." sage/brand info panel (NOT red); **Resend** with 60s cooldown (reuse login's `startResendCooldown` pattern) | public |
| E-13 | Error/attention text | action result | **amber** text + amber-bordered panel (DS-2 NO RED); generic, enumeration-safe copy (S5): same success-style message whether or not the account exists | public |
| E-14 | "Back to sign in" secondary link | — | low-key (DS-15) → `/auth/login` | public |

> **Enumeration safety (S5):** do NOT reveal whether an email is registered. Show E-12 ("if an account exists, a link is on its way") regardless. Surface E-13 only for transport/network failures, never "no such user".

### Screen 2 — `/auth/reset` (set new password)

#### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-20 | Eyebrow "RESET PASSWORD" + title "Set a new password" | static | hidden when E-23 expired state is showing | public (recovery session) |

#### Zone B — New-password form
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-30 | New password field | controlled state | `type=password`, `autoComplete=new-password`, `<label htmlFor>` (DS-10); show/hide toggle (SVG icon only, DS-14, `aria-label`) | public |
| E-31 | Confirm password field | controlled state | mismatch → **amber** inline note (DS-2), button disabled until match | public |
| E-32 | Strength indicator | derived from E-30 value | min 8 chars (match Supabase project policy); weak→amber, strong→sage; outline/text shape not color-only (DS-18); plain text + a thin meter, no red | public |
| E-33 | "Update password" primary button | `supabase.auth.updateUser({ password })` | disabled until: valid length + confirm match + recovery session present; "Updating…" while pending; brand `#4F6EF7` | public |
| E-34 | Error/attention text | updateUser result | **amber** panel (DS-2); maps "same as old"/"weak" to friendly copy; network → generic retry | public |

#### Zone C — Terminal states
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-22 | Success state | — | sage confirmation "Password updated — sign in with your new password.", auto-redirect to `/auth/login` (short delay, respect `prefers-reduced-motion` DS-17) + manual "Go to sign in" link | public |
| E-23 | Expired/invalid-link state | no/expired recovery session | replaces the form: "This reset link has expired or was already used." + "Request a new link" → `/auth/forgot`. **Never throw** (N-3) | public |

### Shared / login change
| E# | Element | Behaviour |
|----|---------|-----------|
| E-50 | "Forgot password?" link on `/auth/login` | NEW. Place under the password field (in the `mode==='password'` form, near L117). Low-key link (DS-15), brand color, → `/auth/forgot`. Only meaningful in password mode. |

---

## Recovery-Session Handshake (N-3 — finalize at build)
Supabase's modern `@supabase/ssr` / PKCE flow typically delivers recovery via a `code` (or token hash) that must be exchanged for a session. Two build options — pick one and lock it:
- **(a) Detect on `/auth/reset`:** the supabase-js client auto-handles the `PASSWORD_RECOVERY` auth event / hash fragment on mount; gate the form on `onAuthStateChange` seeing a recovery session. Simplest, client-only.
- **(b) Callback route:** build `src/app/auth/callback/route.ts` (also needed for magic-link + invite per audit B5), `exchangeCodeForSession`, then redirect to `/auth/reset` with the cookie set server-side.
Recommendation: build **(b)** the shared `/auth/callback` route (it unblocks B5's magic-link + invite handshake too) and have the recovery email `redirectTo` point through it to `/auth/reset`. If (b) is out of scope tonight, ship (a) and FLAG the callback dependency. Either way: if no recovery session resolves within a short window → render E-23, never an error throw.

---

## NOVA Items (build tasks / risks)
- **N-1** Build `src/app/auth/forgot/page.tsx` — client component, `AuthLayout`, E-1…E-14. Reuse login's `useTransition` + `startResendCooldown` pattern. `resetPasswordForEmail(email,{ redirectTo: \`${window.location.origin}/auth/reset\` })`.
- **N-2** Build `src/app/auth/reset/page.tsx` — client component, `AuthLayout`, E-20…E-34 + E-22/E-23. `updateUser({ password })`. Strength + confirm-match gating client-side.
- **N-3** Recovery-session handshake (above). Subscribe to `onAuthStateChange('PASSWORD_RECOVERY')` or resolve via `/auth/callback`. Empty/expired → E-23, never throw.
- **N-4** Add E-50 "Forgot password?" link to `/auth/login` (password mode only). Additive — do NOT disturb the working password/magic toggle (HARD GUARDRAIL 3: no destructive changes to working auth).
- **N-5** DESIGN_SYSTEM compliance: brand `#4F6EF7` primary (DS-1), **NO RED** anywhere — error/attention = amber, success = sage (DS-2/DS-3); SVG-only show/hide icon (DS-14); `focus-visible` rings (DS-19); `prefers-reduced-motion` on the success redirect (DS-17); Fira Sans body. Do NOT copy login's `blue-600`/`red-*` chrome — correct it here.
- **N-6** Enumeration safety (S5): generic "if an account exists…" confirmation; never reveal account existence; no per-attempt error differences that leak it.
- **N-7** Server actions optional: `resetPasswordForEmail` and `updateUser` can run client-side with the anon client (consistent with login's tab UI calling server actions only for the credential exchange). If a server action is used for the request step, keep it free of any user-existence signal.
- **N-8** Email branding: Supabase Auth sends the recovery email by default (Supabase template), NOT the Resend `invite`/branded templates. Decide at build whether to keep Supabase's default recovery email or route through Resend (audit notes Resend invite template is already dead code — don't add a second un-wired template). Default: keep Supabase's built-in recovery email; FLAG brand drift (`#2563eb` Supabase default vs `#4F6EF7`).

## Query Patterns to author
- **None.** No PostgREST queries, no `metric_entries`, no tenant scope. Pure Auth API. (Nothing to add to QUERY_PATTERNS.md.)

## Open Items
- O-1 Handshake option (a) vs (b) — N-3. Recommend building the shared `/auth/callback` route (also resolves audit B5 for magic-link + invite).
- O-2 Password policy: confirm Supabase project min length / complexity so E-32 strength rule matches server enforcement (avoid client "strong" → server reject).
- O-3 Recovery email branding: Supabase default vs Resend (N-8). MVP = Supabase default.
- O-4 Whether viewers (magic-link users) should even see "Forgot password?" — harmless (they have no password to reset → Supabase still emails recovery and they can set one). Leave visible; revisit if confusing.

## Decision References
D-096 (account portal — password reset is a named MISSING piece) · D-015 (magic link for viewers) · D-048 (viewer re-auth self-serve) · D-080/N-3-style "never throw on missing session" discipline (carried from Entries map).

---

## FLAGGED — Migrations (none required)
- **No migration needed for this flow.** It touches only Supabase Auth (`auth.users`); no `public` schema change, no RLS. (Unrelated open migration 0029 from the audit is NOT a dependency of password reset.)

## FLAGGED — External setup (Builder, NOT agent — cannot be done in code)
1. **Supabase Auth redirect URLs** must whitelist `<prod-origin>/auth/reset` (and `<prod-origin>/auth/callback` if handshake option (b) is built). Without this, the recovery link will be rejected by Supabase as an invalid redirect. **This is the single blocking external step.**
2. **`NEXT_PUBLIC_APP_URL`** must be set in prod (audit Section 5) — otherwise the recovery email's redirect origin is malformed. Note the inconsistent defaults across files (`localhost:3000` vs `https://sundaytally.app`); set explicitly.
3. **Supabase Auth → Email templates → "Reset Password"** must be enabled/customized in the Supabase dashboard. If Resend is preferred over the built-in template, that is a separate Auth-SMTP / hook config decision (N-8) — not buildable in app code alone.
4. **Password policy** (min length / breached-password protection) is a Supabase Auth dashboard setting — confirm it matches E-32 (O-2).
