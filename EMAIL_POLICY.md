# Email & Notifications Policy — SundayTally
Version 1.0 · 2026-06-04 · canonical source of truth for **what we notify, when, and through which channel.**

This is the living registry. Every notification the product sends MUST appear here with its
trigger, channel, template, recipient, dedup, and code location. If it's not here, it should
not exist; if it exists in code but not here, that's a drift to reconcile. (Stripe research
detail lives in `STRIPE_AND_EMAIL_PLAN.md`; this doc is the authority for the rules + registry.)

---

## 1. The channel decision rule — when is it an EMAIL vs an in-app POP-UP?

Ask: **is the user in the app and able to act right now?**

- **In-app pop-up / toast / inline message** — the event happens WHILE the user is using the app
  and they can respond immediately, or it's transient feedback. (quota reached mid-import,
  validation error, save confirmation, "didn't meet?" prompts, limit/lock notices shown on the
  screen that triggered them.) No email — an email for something they're already looking at is noise.

- **Email** — reserved for events that meet at least one of these:
  1. **The user is NOT in the app** and needs to know (trial ending, payment failed).
  2. **A durable record / receipt** is expected (payment receipt, refund).
  3. **Action is required away from the current session** (reset password, accept an invite,
     update an expiring card).
  4. **The recipient may not be a user yet** (team invite to a new email).

- **Stripe-native email** — anything money/receipt that Stripe already sends well. We do NOT
  rebuild these; we enable the Dashboard toggle. (receipt, refund, failed-payment/dunning,
  card-expiring.)

- **Supabase-Auth email** — identity/credential flows Supabase owns (magic-link, password
  reset, email confirmation, its invite link). We configure the template in Supabase, not in code.

Rule of thumb: **app-sent email (Resend) is only for lifecycle nudges to someone who isn't
currently looking at the screen.** Everything in-session is a pop-up.

---

## 2. Registry — every notification

Legend: Channel = EMAIL-Resend · EMAIL-Stripe · EMAIL-Supabase · IN-APP.
Status = ✅ live · ⏳ planned · ☠ dead (template/code exists, no live trigger) · ❓ decision needed.

| # | Trigger | Channel | Template / message | Recipient | Dedup | Status | Code location |
|---|---------|---------|--------------------|-----------|-------|--------|---------------|
| 1 | Trial ends in 7 days | EMAIL-Resend | `trialEnding7d` | church owner email | `notifications_sent(church_id,'trial_7d')` | ✅ | `api/cron/trial-reminders/route.ts:74` |
| 2 | Trial ends in 1 day | EMAIL-Resend | `trialEnding1d` | church owner email | `notifications_sent(church_id,'trial_1d')` | ✅ | `api/cron/trial-reminders/route.ts:74` |
| 3 | Team member invited (existing flow) | EMAIL-Resend | `invite` (custom token link) | invitee email | n/a (manual action) | ✅ | `settings/team/actions.ts:503` |
| 4 | Payment failed / dunning | EMAIL-Stripe | Stripe native (Smart Retries) | customer email | Stripe-managed | ⏳ toggle | webhook sets `past_due` only: `api/stripe/webhook` |
| 5 | Payment receipt | EMAIL-Stripe | Stripe native | customer email | Stripe-managed | ⏳ toggle | n/a |
| 6 | Refund issued | EMAIL-Stripe | Stripe native | customer email | Stripe-managed | ⏳ toggle | n/a |
| 7 | Card expiring | EMAIL-Stripe | Stripe native | customer email | Stripe-managed | ⏳ toggle | n/a |
| 8 | Subscription recovered (past_due→active) | none (state only) | — | — | idempotent | ✅ | `api/stripe/webhook` invoice.paid handler |
| 9 | Password reset requested | EMAIL-Supabase | Supabase reset template | requester email | Supabase | ✅ (needs template enabled) | `auth/forgot/page.tsx:46` |
| 10 | Viewer login (magic link) | EMAIL-Supabase | Supabase OTP template | viewer email | Supabase | ✅ | `auth/login/actions.ts:42` |
| 11 | Editor/Admin invite (onboarding path) | EMAIL-Supabase | Supabase `inviteUserByEmail` | invitee email | Supabase | ✅ | `onboarding/invite/actions.ts:76` |
| 12 | Viewer invite (onboarding path) | EMAIL-Supabase | Supabase magic link (`generateLink`) | invitee email | Supabase | ✅ | `onboarding/invite/actions.ts:68` |
| 13 | **AI import budget exhausted (trial)** | **IN-APP** | pop-up: "You've used your free AI-import budget. Set up manually, or subscribe for a monthly AI budget." + link to /billing | the user importing | none (shown on the import screen) | ❓→IN-APP | thrown at `lib/ai/anthropic.ts:32` (`AiBudgetExhaustedError` bucket='setup'); surfaced from import routes' 402 |
| 14 | AI analytics-chat budget exhausted (trial) | IN-APP | inline message in Ask-AI: "Trial analytics budget reached — subscribe for monthly AI." | the user chatting | none | ⏳ | `lib/ai/anthropic.ts:32` bucket='analytics' |
| 15 | Welcome / first-run | ❓ decision | — | new owner | n/a | ❓ | not built |

---

## 3. Decisions captured

- **#13 `aiSetupExhausted` is IN-APP, not email (D-099).** The user is mid-import when the $1.00
  trial setup budget (covers `import_stage_a` + `import_stage_b`, see `lib/ai/budget.ts`) hits zero
  and the import returns 402. They're looking at the screen — show a pop-up with an upgrade link,
  don't email. → The Resend `aiSetupExhausted` template should be **removed** (or left dead), and
  the import UI should render the 402 as a pop-up. ("AI setup" = the AI-powered onboarding import;
  Stage A spends from this same `setup` bucket.)
- **#4 payment-failed is Stripe-native, not Resend (D-098 batch).** The Resend `paymentFailed`
  template is now **dead** (no send site). Remove it when convenient; keep the webhook's `past_due`
  DB update. Enable Stripe's native dunning toggle.
- **Two invite mechanisms exist (#3 vs #11/#12) — RECONCILE.** `settings/team` sends a custom
  Resend invite with our own token; `onboarding/invite` uses Supabase `inviteUserByEmail`/magic
  link. Decide ONE canonical invite path so invitees don't get two different experiences. (Tracks
  the D-096 "two team surfaces" note.) Until reconciled, document which surface is live.

---

## 4. Open items / to wire

- [x] #13 — DONE 2026-06-04: import 402 now renders an in-app pop-up (`BudgetExhaustedModal`, upgrade CTA → /billing) in `onboarding/import/review/page.tsx`; dead `aiSetupExhausted` template removed + dropped from the `EmailTemplate` union.
- [x] #4 — DONE: dead `paymentFailed` template + unused `daysLeft` removed. (Builder still flips the Stripe native dunning toggle.)
- [x] Invite reconciliation — DONE: single canonical path via `src/lib/invites.ts` (`createAndSendInvite` / `sendInviteEmail`, crypto-token + church_invites + Resend `invite`). Both `/settings/team` and `/onboarding/invite` call it; Supabase `inviteUserByEmail`/`generateLink` path removed. Invite TTL single-sourced from `INVITE_TTL_DAYS=14` (O-3) — email copy now derives from it (no 7-vs-14 drift).
- [ ] #14 — confirm the Ask-AI screen shows the analytics-exhausted message inline. (only the import path got the pop-up; analytics chat not yet verified)
- [ ] #15 — DECISION: build a Welcome email, or rely on the Stripe receipt + first onboarding screen? (lean: skip the email; the onboarding flow is the welcome.)
- [ ] DS: bring the remaining Resend templates (`trialEnding7d/1d`) CTA color to #4F6EF7 (currently #2563eb); only `invite` is done.
- [ ] Trivial: code comments in `invites.ts`/`onboarding/invite/actions.ts` cite "D-009" — should read **D-099** (the canonical-invite decision). Fix on next touch.

---

## 5. Where the pieces live

- **Resend templates + send fn:** `src/lib/email/resend.ts` (the `render()` switch holds the HTML).
- **Resend send sites:** cron `api/cron/trial-reminders/route.ts`, `settings/team/actions.ts`.
- **Supabase-auth triggers:** `auth/forgot`, `auth/login/actions.ts`, `onboarding/invite/actions.ts`.
- **Stripe webhook (state, not email):** `src/app/api/stripe/webhook/route.ts`.
- **AI budget (drives #13/#14):** `src/lib/ai/budget.ts` (caps), `src/lib/ai/anthropic.ts` (throws).
- **Dedup table:** `notifications_sent (church_id, kind)` UNIQUE.

To audit drift: grep `sendEmail(` (Resend), and `resetPasswordForEmail|signInWithOtp|inviteUserByEmail|generateLink` (Supabase). Every hit must match a row in §2.
