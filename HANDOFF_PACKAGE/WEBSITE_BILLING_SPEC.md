# Website and Billing Spec
## Version 1.0 | 2026-04-18

---

## Purpose

Launch Sunday Tally as a production SaaS on Vercel with:

- a public-facing website
- a clear signup path
- Stripe subscriptions
- a 45-day free trial
- church access-state gating

---

## Core Principles

- one Next.js codebase
- one Supabase project per environment
- Stripe is the billing system of record
- Sunday Tally stores local billing projection state for product logic
- access should be enforced from explicit app state, not ad hoc webhook checks

---

## Route Surface

### Public site

- `/`
- `/features`
- `/pricing`
- `/security`
- `/contact`

### Auth

- `/signup`
- `/auth/login`
- `/auth/reset-password`
- `/auth/invite/[token]`

### App

- `/services`
- `/dashboard`
- `/settings`

### Platform owner hub

- `/platform/*`

---

## Deployment Model

### Hosting

- Next.js on Vercel
- Supabase for auth and data
- Stripe for subscriptions and billing portal

### Environments

- development
- preview
- production

Each environment needs:

- its own Vercel env vars
- correct Supabase redirect URLs
- correct Stripe keys and webhook secrets

---

## Billing Model

### Trial

- 45-day free trial
- recommended V1: no card required up front
- trial starts on church creation / successful signup completion

### Access states

Suggested `access_state` values:

- `trialing`
- `active`
- `past_due`
- `grace_period`
- `read_only`
- `canceled`
- `suspended`

These should be used for product gating.

### Plan model

Suggested initial plan simplicity:

- one paid plan
- one optional annual plan later

Do not start with many plan tiers unless a real pricing strategy exists.

---

## Stripe Requirements

### Needed features

- Stripe Checkout for subscription start
- Stripe Customer Portal for self-serve billing
- webhook handling for subscription lifecycle changes

### Local projection fields

On a billing projection table or church billing table:

- `church_id`
- `stripe_customer_id`
- `stripe_subscription_id`
- `plan_code`
- `trial_started_at`
- `trial_ends_at`
- `subscription_status`
- `access_state`
- `current_period_end`
- `cancel_at_period_end`
- `last_webhook_at`

---

## Lifecycle Rules

### Signup

At signup completion:

- create church
- create owner membership
- start trial
- set `access_state = trialing`

### Trial reminders

Recommended email cadence:

- day 30
- day 37
- day 42
- day 44

### Trial end behavior

Recommended V1:

- if no active subscription at trial end, move to `read_only`
- dashboard remains visible
- new data entry is blocked
- settings remain limited

This preserves visibility without letting unpaid churches continue full use.

### Payment failure behavior

Recommended:

- mark `past_due`
- allow short grace period
- then move to `read_only`

---

## Public Website MVP

### Home

Explain:

- what Sunday Tally is
- why churches should use it
- setup speed
- dashboard value
- AI-assisted import story

### Features

Feature blocks:

- Sunday data entry flow
- dashboard and trends
- church team roles
- historical import and AI setup
- security and auditability

### Pricing

Need:

- 45-day free trial
- what happens after trial
- self-serve billing
- CTA into signup

### Security

Need:

- tenant isolation
- role-based access
- auditability
- backup/ops posture

### Contact

Need:

- support path
- sales/demo path

---

## Church Access Gating

Church-side app behavior must read `access_state`.

Suggested rules:

- `trialing` - full access
- `active` - full access
- `past_due` - full access with warning, short-lived
- `grace_period` - limited warning state
- `read_only` - dashboard visible, data entry blocked
- `canceled` - likely read-only
- `suspended` - restricted

This should be enforced at a central middleware/service layer, not ad hoc on each page.

---

## Events Needed

- checkout_started
- checkout_completed
- trial_started
- trial_reminder_sent
- trial_expired
- payment_failed
- subscription_activated
- subscription_canceled
- customer_portal_opened
- access_state_changed

These should be written into `platform_audit_events`.

