## Status: Spec — Pending build (verify/repair existing surface)
## Version: 1.0
## Pending revisions: none — page is a redesign-to-DS pass over working Stripe logic
## Last updated: 2026-06-03

# IRIS Element Map — BILLING screen (D-096 account portal · subscription)

**Owner:** IRIS · **Build lead:** NOVA · **Gate:** SAGE
**Target route (build, exists):** `/(app)/billing` (`src/app/(app)/billing/page.tsx` + `BillingActions.tsx`)
**Stripe logic (exists, working — do NOT change unless broken):** `src/lib/stripe/server.ts`, `src/app/api/stripe/{checkout,portal,webhook}/route.ts`
**Status source (exists, working):** `src/lib/billing/status.ts` (`getBillingStatus` → `{phase, daysLeft, canEdit, subscriptionStatus, trialEndsAt, currentPeriodEnd}`)
**Design decisions:** D-096 (account portal needs blueprint) · D-092 (0029 role-write RLS) · DESIGN_SYSTEM DS-1…DS-25

> This screen is the church's subscription home: it shows the current billing phase (trial / active /
> past-due / expired), days remaining, renewal date, and the one action available for the church's
> state — Subscribe (Stripe Checkout) or Manage billing (Stripe Customer Portal). Owners/admins act;
> everyone else sees read-only status. Stripe logic is verified-working against the new schema; this
> spec is a **redesign of the PAGE to DESIGN_SYSTEM** plus tightening of state rendering. No Stripe
> calls are made by IRIS/NOVA at spec/build time — keys and external setup are FLAGGED for the Builder.

---

## Purpose & Core Loop
An owner/admin opens Billing → sees their church's plan status (one of: trial countdown, active+renewal date, past-due notice, expired) → takes the single contextual action: **Subscribe** while on trial/expired (→ Stripe Checkout), or **Manage billing** while active/past-due (→ Stripe Customer Portal for card/cancel/invoices). On return, the webhook has already written the new `subscription_status`/`current_period_end`, so the refreshed page reflects reality. Editors/viewers see status only.

## Roles (church_memberships.role)
| Role | On this screen |
|---|---|
| owner / admin | Full: see status + act (E-20 Subscribe / E-21 Manage billing). **Server-enforced today** in both Stripe routes (403 if not owner/admin). |
| editor / viewer | **Read-only** — sees phase, days left, renewal; sees E-30 "Only owners and admins can manage billing." No action buttons. |

> Note: billing role-gating is **already server-side** in `api/stripe/{checkout,portal}` (re-reads membership role, returns 403) — it does NOT depend on migration 0029. 0029 only governs member/invite writes elsewhere in the portal.

## Active Context (resolved before render)
| Context | Source | Rule |
|---|---|---|
| Church | session → `church_memberships` (`.eq('user_id').eq('is_active',true).single()`) | tenant scope; no membership → redirect `/auth/login` |
| Role | `church_memberships.role` | owner/admin → actions; else read-only |
| Billing phase | `getBillingStatus(supabase, church_id)` | single source of truth — do not recompute in the page |

## Data Dependencies (all EXIST live — verified read-only; no migration needed)
- `churches.subscription_status` (Stripe raw status: `trialing`|`active`|`past_due`|`canceled`) · `churches.stripe_customer_id` · `churches.stripe_subscription_id` · `churches.trial_ends_at` · `churches.current_period_end`
- `ai_usage_periods(church_id, period_key='trial', bucket, cents_used, cap_cents)` — trial AI-budget exhaustion (forces `expired` even with calendar days left)
- `billing_events(stripe_event_id UNIQUE, church_id, event_type, payload, processed_at)` — webhook idempotency ledger (no page read)
- `church_memberships(role, church_id, user_id, is_active)` — role gate
- **All churches currently `subscription_status='trialing'`** (no live Stripe data yet — confirmed). Active/past-due states are unexercisable until Stripe is configured (FLAG E-S1).

---

## Phase → State model (drives every element)
`getBillingStatus` collapses Stripe's raw `subscription_status` into **three render phases**. The page must render four *visible* states by reading `subscriptionStatus` alongside `phase`:

| Render state | Condition (from status.ts + raw status) | canEdit | Primary action |
|---|---|---|---|
| **Trial** | `phase='trial'` (trial days valid AND AI budget not exhausted) | true | Subscribe |
| **Active** | `phase='active'` AND `subscriptionStatus='active'` | true | Manage billing |
| **Past due** | `phase='active'` AND `subscriptionStatus='past_due'` (still in `PAID_ACTIVE_STATES`, so canEdit stays true) | true | Manage billing (+ attention note) |
| **Expired** | `phase='expired'` (trial elapsed OR trial AI budget exhausted, no paid sub) | false | Subscribe |

> Verified-correct repair: the **existing page does not surface `past_due`** — it only branches on `phase` (`trial`/`active`/`expired`), so a past-due church renders identically to active with no signal to fix the card. Build adds the past-due visible state (E-12) reading `billing.subscriptionStatus`. This is the one functional gap; status.ts logic itself is sound (no change to status.ts).

---

## Element Map

### Zone A — Header
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-1 | "BILLING" eyebrow + church name | `churches.name` (read in page) | — | all |
| E-2 | Plan line ("Sunday Tally · $22 / month") | static plan copy (price is display-only; real price = Stripe `STRIPE_PRICE_ID`) | — | all |

### Zone B — Status card (the hero)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-10 | Phase indicator | `billing.phase` + `billing.subscriptionStatus` | status circle (DS-6) + **plain-text phase label** ("Trial" / "Active" / "Past due" / "Expired"), NOT a colored pill (DS-8). Trial/Active = sage complete circle; Past due/Expired = amber-outline needs circle. **NO RED** (DS-2) | all |
| E-11 | Trial countdown line | `billing.daysLeft`, `billing.trialEndsAt` | trial only: "N days left in your free trial." (singular/plural). Numerals `.font-num` (DS-4) | all |
| E-12 | Renewal / past-due line | `billing.currentPeriodEnd`, `billing.subscriptionStatus` | active: "Renews <date>." · **past_due (NEW): "Payment didn't go through — update your card to keep editing." (amber, DS-2 no red)** | all |
| E-13 | Expired explainer | `phase='expired'` | "Your trial has ended. Subscribe to keep entering and viewing data." (cadence-neutral copy, DS-24 — drop "managing services") | all |
| E-14 | Trial-budget-exhausted note | `phase='expired'` while `trialEndsAt` still in future (i.e. expiry caused by `isTrialBudgetExhausted`) | optional: "Your trial AI budget is used up." — distinguishes calendar-expiry from budget-expiry | all |

### Zone C — Actions (owner/admin only)
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-20 | **Subscribe — $22/month** button | shown when `phase ∈ {trial, expired}` OR no active sub. POST `/api/stripe/checkout` → `{url}` → `window.location.href` | idle · "Redirecting…" (busy) · disabled while any action busy. Brand-blue primary (DS-1), `focus-visible` ring (DS-19) | owner/admin |
| E-21 | **Manage billing** button | shown when active/past-due (has sub, not expired). POST `/api/stripe/portal` → `{url}` → redirect | idle · "Redirecting…" · disabled while busy. Secondary (border) button | owner/admin |
| E-22 | Action error line | client error from fetch (`body.error` or network) | inline message in **slate/amber, NOT red** (DS-2 — current `text-red-600` violates) | owner/admin |

### Zone D — Read-only notice
| E# | Element | Data binding | States | Role |
|----|---------|--------------|--------|------|
| E-30 | "Only owners and admins can manage billing." | `role ∉ {owner,admin}` | shown in place of Zone C | editor/viewer |

### Shared / DS primitives to reuse (from `@/app/(app)/entries/ui`)
| E# | Element | Behaviour |
|----|---------|-----------|
| E-40 | Status circle (`Dot`-style, DS-6) | 3 outline states: gray=not-started · amber-outline=needs/attention (past-due, expired) · solid sage check=complete (trial active, paid active). Used by E-10. Reuse `Dot`/`Ico` primitives; never emoji (DS-14). |
| E-41 | Page shell | wrap in `@/components/layouts/AppLayout`; centered single max-width (`max-w-2xl`/`max-w-3xl`, DS-5); cards `rounded-2xl border border-slate-200 shadow-sm` (DS-5). |

---

## Redesign delta (current → DS-compliant) — what NOVA changes on the PAGE
1. **DS-2 violations (NO RED):** `PhaseBadge` expired = `bg-red-100 text-red-800` → replace with status-circle + plain label (amber for attention). `BillingActions` error `text-red-600` → slate/amber.
2. **DS-8 (no pills for status):** replace `PhaseBadge` colored rounded pill with E-10 status circle + plain-text label.
3. **DS-1 palette:** Subscribe button `bg-blue-600` → brand `#4F6EF7`; generic gray/green badges → DS tokens.
4. **DS-4 numerals:** days-left + dates use `.font-num` tabular.
5. **DS-5 shape:** `rounded-lg` card → `rounded-2xl` + `shadow-sm`; mount inside `AppLayout` (page currently renders bare, no app chrome).
6. **DS-19 focus / DS-14 icons:** add `focus-visible` rings; any glyphs → inline SVG.
7. **Functional repair (only logic change):** surface **past_due** state (E-12) by reading `billing.subscriptionStatus`, since `getBillingStatus` keeps `phase='active'` for past_due. No edit to status.ts or any Stripe route.

> Everything in `status.ts`, `stripe/server.ts`, and the three `api/stripe/*` routes is verified correct against the new schema — **do not modify** beyond the one page-level past_due surfacing. Webhook is idempotent (UNIQUE `stripe_event_id`), writes `subscription_status`/`current_period_end`/customer+sub ids, owner-emails on payment failure via Resend. Checkout/portal are owner/admin-gated (403), set `client_reference_id` + `metadata.church_id`, reuse `stripe_customer_id`.

---

## NOVA Items (build tasks / risks)
- **N-1** Redesign `page.tsx` + `BillingActions.tsx` to DESIGN_SYSTEM (deltas 1–6 above). Reuse `Dot`/`Ico`/`fmt` from `@/app/(app)/entries/ui`; wrap in `AppLayout`.
- **N-2** Surface **past_due** (E-12) from `billing.subscriptionStatus` — only logic touch. Verify Subscribe vs Manage-billing visibility across all four states (trial→Subscribe, active→Manage, past_due→Manage+note, expired→Subscribe).
- **N-3** Do NOT touch `status.ts` / `stripe/server.ts` / `api/stripe/*` (verified). If a type mismatch surfaces from the pinned Stripe `apiVersion: '2026-03-25.dahlia'` vs installed SDK major, FLAG it — do not silently bump.
- **N-4** Role gate: owner/admin server-enforced in routes already; page hides Zone C for editor/viewer (E-30). No 0029 dependency for billing.
- **N-5** Copy pass (DS-24, cadence-neutral; humanizer): trial, expired, past-due lines. No "managing services" (retired term).
- **N-6** Return-from-Stripe UX: page reads `?checkout=success|cancelled` query (set by checkout route) — optional toast/confirmation; status reflects webhook write on refresh. Keep minimal.
- **N-7** `tsc --noEmit` clean after page changes.

## Query Patterns
No new SQL. All reads go through `getBillingStatus` (single `churches` row + `ai_usage_periods` filtered by `church_id, period_key='trial'`) and the membership role read in the page. Tenant-scoped by `church_id`; both are single-row / small reads (no 1000-row pagination concern).

## Open Items
- O-1 Confirm whether to show E-14 (budget-exhausted vs calendar-expiry distinction) in MVP, or keep one generic expired message.
- O-2 Return-from-checkout confirmation (N-6) — toast vs inline banner — finalize at build.
- O-3 Where Billing lives in the portal IA (D-096): standalone `/billing` vs a tab under a unified `/settings/account`. MVP keeps `/billing`; reconcile when the account-portal blueprint lands.

## Decision References
D-096 (account portal needs a blueprint pass — Billing is one surface of it) · D-092 (0029 role-write RLS — **not** required for billing; billing routes self-enforce role) · DS-1 (palette) · DS-2 (NO RED) · DS-4 (Fira Code numerals) · DS-5 (shape) · DS-6/DS-18 (status circle, color-not-only-signal) · DS-8 (plain-text not pills) · DS-14 (SVG icons) · DS-19 (focus-visible) · DS-24 (cadence-neutral naming).

## Flagged migrations
- **NONE.** Billing reads only existing live columns (`churches.subscription_status`/`stripe_*`/`trial_ends_at`/`current_period_end`, `ai_usage_periods`, `billing_events`). All confirmed present. No schema change for this screen. (Migration 0029 is unrelated to billing — billing role-gating is server-side in the Stripe routes.)

## Flagged external setup (BUILDER — not agent; no accounts/keys created by IRIS/NOVA)
- **E-S1 Stripe account + product/price:** create a Stripe account; create the $22/month recurring Price; set env `STRIPE_PRICE_ID`. Without it, `stripePriceId()` throws → Checkout 500s. (All churches are `trialing` until this exists — active/past-due states are untestable.)
- **E-S2 Stripe API keys:** set `STRIPE_SECRET_KEY` (server). `stripe()` throws "STRIPE_SECRET_KEY is not set" otherwise.
- **E-S3 Stripe webhook:** register endpoint `${NEXT_PUBLIC_APP_URL}/api/stripe/webhook` for events `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_failed`; set `STRIPE_WEBHOOK_SECRET`. Without it the webhook returns 400 ("Missing signature") and `subscription_status` never advances past `trialing`.
- **E-S4 `NEXT_PUBLIC_APP_URL`:** must be set to the prod domain. `appUrl()` defaults to `http://localhost:3000`, so checkout/portal `success_url`/`return_url` are wrong in prod if unset. (Note brand-drift: `stripe/server.ts` defaults `localhost:3000` vs `resend.ts` defaults `https://sundaytally.app` — set the env var explicitly to reconcile.)
- **E-S5 Stripe SDK version:** verify installed `stripe` SDK major matches pinned `apiVersion: '2026-03-25.dahlia'`; mismatch → type errors at build. FLAG only, do not bump blindly.
- **E-S6 Resend (payment-failed email):** the webhook's `handlePaymentFailed` sends via `lib/email/resend.ts` → needs `RESEND_API_KEY` + verified `RESEND_FROM_EMAIL` domain. Not required for the page to render; required for the past-due email to deliver.
