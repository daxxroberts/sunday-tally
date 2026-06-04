# SundayTally — Stripe & Email Plan

Version: 1.0 | 2026-06-03 | Research/synthesis only — no code changes made.

Stack: Next.js (App Router) on Vercel · Supabase · Stripe (subscription $22/mo, 45-day trial) · Resend (transactional) · Supabase Auth (auth emails).

This doc reconciles a Stripe billing/email briefing with an audit of the app's
own Resend + webhook wiring. The headline: **let Stripe own transactional money
emails, let Resend own lifecycle/product emails, delete the one duplicate, and
add one missing webhook handler (`invoice.paid`).**

---

## 1. Email Inventory

Every email the product needs — app-sent (Resend), Stripe-native, and Supabase Auth.

| Email | Trigger / Event | Sender | Automation | Status | Notes |
|---|---|---|---|---|---|
| Payment receipt | Subscription invoice / charge succeeds | Stripe native | Stripe automatic (toggle) | **Missing (toggle OFF until enabled)** | No Resend template exists; itemized via hosted invoice page. Enable "Successful payments". |
| Refund notification | A refund is issued (customer email on file) | Stripe native | Stripe automatic (toggle) | **Missing (toggle)** | Enable "Refunds" under Customer emails. |
| Failed payment / dunning | Each failed charge attempt during retry window | Stripe native **and** Resend `paymentFailed` (CURRENT — duplicate) | Stripe automatic + app `invoice.payment_failed` webhook | **Conflict — both fire** | Resolve: turn Stripe ON, retire the Resend send. Stripe deep-links to Portal + repeats per retry. |
| Card expiring soon | ~1 month before default card expiry | Stripe native | Stripe automatic (toggle) | **Missing (toggle)** | Enable "Send emails about expiring cards". No build. |
| Upcoming renewal (optional) | Configurable days before renewal | Stripe native | Stripe automatic (toggle) | **Optional / off** | Nice-to-have; not required. |
| Trial ending — 7 days | 7 days before `churches.trial_ends_at` | Resend `trialEnding7d` | Vercel cron `/api/cron/trial-reminders` (daily 14:00 UTC) | **Built + wired** | App-managed trial (no Stripe sub during trial) → Stripe's native trial email will NOT fire. Resend is correct, non-dup. |
| Trial ending — 1 day | 1 day before `trial_ends_at` | Resend `trialEnding1d` | Same cron | **Built + wired** | Same cron route, offset 1. |
| AI quota exhausted (trial) | Trial AI budget hit (`ai_usage_periods` used≥cap) | Resend `aiSetupExhausted` | Should be inline at the budget-exhausted code path | **Built — NOT wired (dead code)** | Template authored; `getBillingStatus` computes `budgetExhausted` but never sends. No call site in `src`. |
| Team invite | Owner/admin invites teammate | Resend `invite` | Inline in `deliverInvite()` (team/actions.ts:495) | **Built + wired** | App token `/auth/invite/{token}`, NOT Supabase invite. If `RESEND_API_KEY` unset, invite row still created but no email. |
| Welcome / onboarding | Signup / church creation | (none) | — | **Missing entirely** | No template, no sender. Optional add (Resend). |
| Password reset | User requests reset | Supabase Auth | Supabase native (template + redirect) | **Missing — not configured** | D-097: no `resetPasswordForEmail` anywhere. Enable Supabase template + whitelist `/auth/reset`. |
| Magic link / OTP (viewer auth) | Viewer `signInWithOtp` | Supabase Auth | Supabase native | **Untested (D-097)** | Sent by Supabase, not Resend. Needs redirect config + verified sender. |
| Email confirmation (signup) | New account signup | Supabase Auth | Supabase native | **Untested (D-097)** | Supabase-managed. |
| Subscription confirmation | After first checkout success | (none — Stripe receipt only) | `checkout.session.completed` sets state silently | **Missing (covered by receipt)** | Stripe receipt is the only confirmation; acceptable. Optional Resend welcome could double here. |

---

## 2. Automation Workflows per Email

Exact source → action chains. "App sends nothing" means Stripe/Supabase owns the email.

- **Payment receipt** — Stripe invoice/charge succeeds → Stripe sends receipt automatically (if "Successful payments" toggle ON). App sends nothing. App separately receives `invoice.paid` (to be added) to flip `past_due`→`active`.
- **Refund notification** — Refund issued in Stripe → Stripe sends refund email automatically (if "Refunds" toggle ON + customer email on file). App sends nothing; no refund webhook handled today.
- **Failed payment / dunning** — `invoice.payment_failed` webhook → app sets `subscription_status='past_due'` (gating stays editable per `status.ts`) → **Stripe sends dunning email automatically per retry** (if toggle ON). **TARGET STATE: app sends nothing** (retire the Resend `paymentFailed` send; keep the DB update). Stripe Smart Retries handle cadence; Stripe email deep-links to Portal.
- **Card expiring** — Stripe detects upcoming card expiry → Stripe sends email automatically (toggle ON). App sends nothing.
- **Trial ending 7d / 1d** — Vercel cron hits `/api/cron/trial-reminders` daily 14:00 UTC (requires `Bearer CRON_SECRET`) → query churches with trial ending at offset 7 and 1 (filter `subscription_status='trialing'`) → resolve owner via `church_memberships` role=owner → `auth.admin.getUserById` → Resend `trialEnding7d`/`trialEnding1d` → dedupe via `notifications_sent (church_id, kind)` UNIQUE. **Stripe sends nothing** (trial is app-managed, no Stripe sub during trial).
- **AI quota exhausted** — (TARGET) when `getBillingStatus`/AI path detects trial budget exhausted → send Resend `aiSetupExhausted` inline to owner/admin → dedupe via `notifications_sent`. **Currently no chain exists** — template orphaned.
- **Team invite** — Owner/admin submits invite → `church_invites` row created with `crypto.randomBytes(32)` token → `deliverInvite()` calls Resend `invite` with `/auth/invite/{token}`. If `RESEND_API_KEY` unset: row created, no email, caller surfaces "email not configured."
- **Password reset / magic link / email confirmation** — User action → Supabase Auth sends natively using Supabase templates + configured redirect URLs. App's Resend layer is not involved. (All untested per D-097.)
- **Checkout success** — `checkout.session.completed` webhook → app sets `stripe_customer_id`, `stripe_subscription_id`, `subscription_status='active'`. No app email; Stripe receipt covers confirmation.

---

## 3. Stripe Research Briefing

### 3.1 Built-in customer emails (two Dashboard locations)
- **Receipts/refunds**: Settings → Customer emails (`dashboard.stripe.com/settings/emails`).
- **Subscription/dunning**: Settings → Billing → Automatic collection / Email notifications (`dashboard.stripe.com/settings/billing/automatic`) and Billing → Revenue recovery → Emails/Retries (`dashboard.stripe.com/revenue_recovery/emails`).

| Email | Fires when | Exact toggle |
|---|---|---|
| Payment receipt | Charge/invoice succeeds | "Successful payments" (Customer emails) |
| Refund | Refund issued, email on file | "Refunds" (Customer emails) |
| Failed payment | After each failed charge attempt | "Send emails when card payments fail" (Revenue recovery → Emails) |
| Card expiring | ~1 mo before card expiry | "Send emails about expiring cards" |
| Upcoming renewal | Configurable days pre-renewal | "Send emails about upcoming renewals" (Billing → Email notifications) |
| Trial ending | 7 days before trial ends (fixed) | "Send a reminder email 7 days before a free trial ends" |
| Canceled / credit note / finalized invoice | On event | Individual toggles, same Billing panel |

Receipts need only the toggle + a stored email (not the Portal). In **test mode** Stripe only sends receipts to the account owner / verified test users.

### 3.2 Dunning / Smart Retries
- **Smart Retries** (default): AI-timed, ~8 attempts over a configurable window (1wk–2mo). Config at Billing → Revenue recovery → Retries.
- **Custom schedule**: up to 3 fixed-interval retries.
- **Status transitions**: first failure → `past_due`; Stripe retries; after window expires the failure-recovery setting decides terminal state — Cancel → `canceled`, Mark unpaid → `unpaid`, Leave past-due → stays `past_due`.
- **Hard declines** (`lost_card`, `stolen_card`, `authentication_required`) are NOT retried.
- Stripe automatically retries, increments `attempt_count`, sets `next_payment_attempt`, emits `invoice.payment_failed`, transitions status, and sends failed-payment + card-expiry emails (if toggles on). There is no separate "automatic collection" toggle — the retry schedule IS the automatic collection mechanism.

### 3.3 Customer Portal (`billing.portal.sessions`)
No-build self-service: update/add payment method, billing info & tax IDs, change/upgrade plan (≤10 products), cancel (now or period end) + reactivate, view/download/pay invoices & receipts, optional cancellation deflection. Configured at `dashboard.stripe.com/settings/billing/portal`. **The Portal sends no emails** — emails still come from the receipt/billing toggles. Sessions expire after 5 min idle / 1 hr active. Already implemented at `src/app/api/stripe/portal/route.ts`. Single $22/mo price → no multi-product limitation.

### 3.4 Hosted Checkout & hosted invoice/receipt
- **Hosted Checkout** (`checkout.sessions`): redirect to `session.url`, return via `success_url`/`cancel_url`. Don't grant access on redirect — confirm via `checkout.session.completed` webhook (app does this). Auto-sends receipt if "Successful payments" on.
- **Hosted invoice page**: every subscription invoice gets `invoice.hosted_invoice_page` with itemized downloadable PDF. **Receipt links expire after 30 days**; customer re-enters email for a fresh one. No build.

### 3.5 Sources
- Automate customer emails: https://docs.stripe.com/billing/revenue-recovery/customer-emails
- Receipts: https://docs.stripe.com/receipts · https://docs.stripe.com/payments/checkout/receipts
- Smart Retries: https://docs.stripe.com/billing/revenue-recovery/smart-retries
- Customer management / Portal: https://docs.stripe.com/customer-management
- Refunds: https://docs.stripe.com/refunds
- Webhooks: https://docs.stripe.com/webhooks
- Account email notifications: https://support.stripe.com/questions/set-up-account-email-notifications
- Vercel/Next.js raw-body: https://github.com/vercel/next.js/discussions/48885 · https://webhooks.cc/blog/nextjs-app-router-webhook-handler

---

## 4. Stripe-on-Vercel Fit

**Recommended architecture** — serverless route handlers (already in place):
- Raw body for signature: `await req.text()` → `constructEvent`. Never `req.json()` first. **Already correct.**
- Force Node runtime: `export const runtime = 'nodejs'`. **Already set** (Edge re-encodes body → #1 webhook failure).
- Return 2xx fast, then do DB work (Stripe retries non-2xx). Keep work under function timeout.
- Exempt `/api/stripe/webhook` from auth middleware (Stripe is unauthenticated → would 401 otherwise).
- Separate `sk_test_`/`sk_live_` keys and **separate `whsec_` signing secret per endpoint**. Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Idempotency: persist `event.id`, short-circuit replays. **Already done** via `billing_events` UNIQUE on `stripe_event_id` (23505 → short-circuit).

**Already wired (verified in code):**
- `checkout.session.completed` → set customer/sub IDs, `subscription_status='active'`.
- `customer.subscription.created`/`updated` → raw Stripe status + `current_period_end`.
- `customer.subscription.deleted` → `canceled`, null sub ID.
- `invoice.payment_failed` → `past_due` + (currently) Resend email.
- Portal session creation; Checkout session creation.

**To configure (external, no code):**
- Dashboard email toggles (§6).
- Smart Retries window + failure-recovery terminal state.
- Customer Portal feature config + branding.
- Webhook endpoint registration + signing secret in env.

**To build (small code deltas):**
- Add `invoice.paid` handler → flip `past_due`→`active` on recovery (otherwise a recovered church stays stuck `past_due` until a later `subscription.updated`).
- Retire the Resend `paymentFailed` send (keep DB update).
- Wire the orphaned `aiSetupExhausted` send.

---

## 5. Recommendation — Built-in vs Build (no duplicates)

**Let Stripe send natively (toggles ON, build nothing):**
- Successful payments (receipts) — required; no Resend receipt template exists anyway.
- Refunds — required; same reason.
- Failed payment — Stripe deep-links to Portal and fires per retry; better dunning than a one-shot Resend.
- Card expiring soon — Stripe handles it; building in Resend is wasted effort.

**Send via Resend (app-specific; Stripe cannot produce these):**
- `trialEnding7d` / `trialEnding1d` (app-managed trial — Stripe's native trial email will NOT fire because there's no Stripe trial sub).
- `aiSetupExhausted` (AI budget — product-specific).
- `invite` (team invites).
- Welcome (optional new template).

**Supabase Auth owns:** password reset, magic link/OTP, email confirmation. Not Resend.

**The one conflict — failed-payment double email.** Today `handlePaymentFailed` sends Resend `paymentFailed` AND Stripe will too once its toggle is on.
- **Recommended:** turn ON Stripe's failed-payment + card-expiring emails; **remove the Resend `paymentFailed` send** (keep the `past_due` DB update). Stripe repeats per retry and links to the Portal.
- Alternative (full branding control): keep Resend, leave Stripe's toggle OFF — but then you lose Stripe's per-retry cadence and must replicate it. Not recommended.

**Trial-ending overlap:** none in practice. Stripe's native 7-day trial email only fires for a Stripe `trialing` sub with a payment method collected at signup. SundayTally's trial lives in `churches.trial_ends_at` with no Stripe sub during trial → Stripe won't send it. Keep Stripe's trial toggle OFF/irrelevant; Resend trial reminders are correct and non-duplicative.

**Add `invoice.paid` handling** so a recovered payment flips `subscription_status` back to `active`.

**Minimal correct =** Stripe owns transactional money emails (receipt, refund, failed-payment, card-expiry) + the Portal for self-service; Resend owns lifecycle/product emails (trial, AI budget, invites, optional welcome); Supabase Auth owns auth emails; delete the duplicate Resend failed-payment send; add `invoice.paid`.

---

## 6. Builder Decisions + External Setup

### 6.1 Stripe Dashboard toggles
- Settings → Customer emails: **Successful payments = ON**, **Refunds = ON**.
- Revenue recovery → Emails: **Send emails when card payments fail = ON**, **Send emails about expiring cards = ON**.
- Billing → Email notifications: **Trial-ending = OFF/irrelevant** (app-managed). Upcoming renewal = optional.
- Revenue recovery → Retries: enable **Smart Retries**, pick a window, set failure-recovery terminal state (Cancel vs Mark unpaid vs Leave past-due) — decide product policy.
- Settings → Billing → Customer Portal: enable update payment method, change/cancel plan, invoice history; set branding + return URL.

### 6.2 Env vars
- `STRIPE_SECRET_KEY` (`sk_test_`/`sk_live_`), `STRIPE_WEBHOOK_SECRET` (`whsec_`, per endpoint), Stripe `$22/mo` price ID.
- `RESEND_API_KEY` + verified sending domain; `RESEND_FROM_EMAIL` (defaults `Sunday Tally <noreply@sundaytally.app>`).
- `NEXT_PUBLIC_APP_URL` — make consistent (`resend.ts` and team/actions.ts default `https://sundaytally.app`); confirm no stale alternates.
- `CRON_SECRET` — required or `/api/cron/trial-reminders` 401s; Vercel cron must be enabled on deploy.
- Supabase: enable reset-password template; whitelist `/auth/reset` (and invite/magic-link redirect URLs).

### 6.3 Webhook events to register
- Currently handled: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- **Add:** `invoice.paid` (recovery → `active`).
- Optional/consider: `customer.updated` (default PM/email changes), `checkout.session.expired`, refund/dispute events (`charge.refunded`) for in-app reconciliation. Card-expiry warnings via `customer.source.expiring` only if you want in-app banners (Stripe emails it natively regardless).

### 6.4 Code deltas (flagged, not done — research-only)
- `src/app/api/stripe/webhook/route.ts`: add `invoice.paid` case → set `subscription_status='active'`; resolve failed-payment email duplication at the Resend send (~lines 174–175).
- `src/lib/email/resend.ts`: retire `paymentFailed` template send; wire `aiSetupExhausted` to the budget-exhausted path; `daysLeft` field is vestigial (unused).
- Verify signup writes `subscription_status='trialing'` explicitly — the cron's `.eq('subscription_status','trialing')` skips NULL rows, so 7d/1d reminders silently never match NULL-status churches even though `getBillingStatus` treats NULL as trialing.

### 6.5 Open product decisions for the builder
1. Failure-recovery terminal state after retries exhaust (Cancel / Mark unpaid / Leave past-due)?
2. Add a Welcome email (Resend) on signup, or rely on Stripe receipt + in-app onboarding?
3. Smart Retries window length (1wk–2mo)?
4. Per D-097: Account/Auth/Billing portal still needs a blueprint pass (password reset, self-service password change, Account/Profile page, Members & Invitations status screen with resend/revoke). Out of scope for email wiring but blocks auth-email testing.
