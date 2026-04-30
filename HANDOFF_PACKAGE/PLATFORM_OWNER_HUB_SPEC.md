# Platform Owner Hub Spec
## Version 1.0 | 2026-04-18

---

## Purpose

The Platform Owner Hub is a Sunday Tally internal-only area for the product owner and designated platform admins.

It is not a church-facing settings area.
It is the operational control plane for:

- church lifecycle
- user lifecycle
- billing state
- imports
- support diagnostics
- audit review

---

## Goals

- answer support questions quickly
- diagnose broken onboarding, auth, billing, and import flows
- monitor trial/subscription state
- inspect what changed, by whom, and when
- provide safe internal actions without direct database edits

---

## Access Model

### Platform roles

- `platform_owner`
- `platform_admin`
- optional later: `platform_support`

These roles must be separate from church membership roles.
Do not overload `church_memberships.role` for platform access.

Suggested model:

- `platform_admins` table
- explicit allowlist by user id
- middleware route gate for `/platform/*`

---

## Route Surface

- `/platform`
- `/platform/churches`
- `/platform/churches/[churchId]`
- `/platform/users`
- `/platform/billing`
- `/platform/imports`
- `/platform/events`
- `/platform/support`

---

## Core Screens

### 1. Churches List

Columns:

- church name
- created date
- owner email
- onboarding status
- trial/subscription status
- access state
- last activity
- latest import status

Filters:

- trialing
- active subscription
- payment failed
- read-only
- onboarding incomplete
- import failed

### 2. Church Detail

Sections:

- church profile
- billing summary
- onboarding progress
- active services / locations summary
- latest dashboard activity
- import history
- audit timeline
- support actions

Support actions:

- resend invite
- resend password reset guidance
- inspect import case
- inspect latest setup proposal
- view church AI profile

### 3. Users View

Columns:

- email
- church
- role
- active membership
- pending invite
- last sign-in
- auth method usage

Useful states:

- never signed in
- invited not accepted
- removed
- viewer magic-link user
- password-reset recent

### 4. Billing View

Columns:

- church
- Stripe customer
- plan
- trial start
- trial end
- subscription status
- access state
- last invoice state

Actions:

- open customer portal link
- view webhook event history
- mark manual review

### 5. Imports View

Columns:

- import case id
- church
- uploaded files count
- current stage
- anomaly count
- unresolved questions
- execution result
- created by
- created at

Actions:

- inspect proposed setup
- inspect proposed mappings
- inspect anomalies
- inspect row failures

### 6. Audit Events View

Searchable timeline for:

- auth events
- onboarding events
- settings changes
- billing events
- import events
- execution failures

Filters:

- church
- user
- event type
- date range
- severity

---

## Event Model

The owner hub is only as good as the events it can read.

The minimum event families:

### Auth events

- signup_started
- signup_completed
- login_succeeded
- login_failed
- magic_link_sent
- magic_link_used
- password_reset_requested
- password_reset_completed
- invite_sent
- invite_accepted

### Onboarding/setup events

- church_created
- location_created
- service_created
- service_schedule_changed
- tag_created
- tracking_flags_changed

### Sunday loop data events

- occurrence_created
- attendance_saved
- volunteers_saved
- stats_saved
- giving_saved

### Billing events

- trial_started
- trial_ending_soon
- checkout_started
- checkout_completed
- subscription_active
- payment_failed
- subscription_canceled
- portal_opened

### Import events

- import_case_created
- import_file_uploaded
- import_parsed
- setup_proposed
- anomaly_detected
- clarification_answered
- import_rule_saved
- import_executed
- import_row_failed
- import_completed

### Operational/system events

- webhook_failed
- rpc_failed
- server_action_failed
- email_send_failed
- schema_mismatch_detected

---

## Diagnostics and Breadcrumbs

The following breadcrumbs are especially valuable for support:

- first successful sign-in after invite
- last successful sign-in
- latest access-state change
- latest failed Stripe webhook
- latest import anomaly
- latest unresolved question in an import case
- last dashboard fetch failure
- last settings mutation

These should appear on church detail pages without requiring raw SQL inspection.

---

## Data Requirements

Needed canonical tables:

- `platform_admins`
- `platform_audit_events`
- `import_cases`
- `import_files`
- `import_anomalies`
- `import_questions`
- `import_executions`
- `church_billing_status`

Optional later:

- `support_notes`
- `support_flags`
- `support_saved_views`

---

## Non-Goals for V1

- direct raw SQL editing UI
- arbitrary mutation of church data
- impersonation
- customer messaging center
- AI inside the owner hub itself

V1 should be observability + safe actions, not unrestricted super-admin editing.

