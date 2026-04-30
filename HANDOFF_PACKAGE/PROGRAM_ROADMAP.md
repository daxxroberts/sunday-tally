# Sunday Tally Program Roadmap
## Version 1.0 | 2026-04-18
## Scope: Platform Owner Hub + Public Website/Billing + AI Church Setup/Historical Import

---

## Purpose

This roadmap consolidates the three next major product verticals into one delivery program:

- `Vertical 1` - Platform Owner Hub
- `Vertical 2` - Public Website + Billing + Production Platform
- `Vertical 3` - AI Church Setup + Historical Import

These verticals are intentionally planned together. The public website and billing create the customer-facing SaaS shell. The platform owner hub gives Sunday Tally internal control and support visibility. The AI import system shortens time-to-value for new churches and improves retention.

---

## Product Outcome

Sunday Tally should evolve from a church-side data entry app into a production SaaS platform with:

- a public website and pricing funnel
- paid subscriptions with a 45-day free trial
- an internal platform owner/admin area
- import-first onboarding that can set up a church from historical data
- historical imports that protect dashboard quality

---

## Vertical Summary

### Vertical 1 - Platform Owner Hub

Goal:
Give the Sunday Tally owner operational visibility across all churches, users, billing states, imports, and support events.

Core outcomes:

- church-level oversight
- user and invite oversight
- billing oversight
- import oversight
- support diagnostics and event timelines
- safe internal admin tooling

### Vertical 2 - Public Website + Billing + Production Platform

Goal:
Launch Sunday Tally as a production SaaS on Vercel with Stripe billing and clear access-state gating.

Core outcomes:

- public marketing site
- production deployment and environment model
- signup/login/reset flow
- Stripe subscriptions + customer portal
- 45-day free trial handling
- church access-state enforcement

### Vertical 3 - AI Church Setup + Historical Import

Goal:
Allow churches to upload one or more historical data files, have Claude infer their structure, ask targeted questions, propose Sunday Tally setup, and import history in a dashboard-safe way.

Important scope note:

- this intelligence is `per church`
- each church builds its own saved rules, service continuity assumptions, mapping preferences, and AI profile over time
- one church's learned behavior must not silently become another church's default behavior

Core outcomes:

- multi-file import
- deterministic parsing
- Claude-guided setup proposal
- anomaly detection
- dashboard sanity review
- structured import execution
- saved import rules and church profiles

---

## Delivery Sequence

### Phase 1 - Platform Foundation

Primary focus:

- Vercel production deployment
- Supabase redirect and environment cleanup
- platform role model
- Stripe billing foundation
- church `access_state`
- platform audit event model

Why first:

- billing and production gating affect every user
- platform owner tools need structured events and statuses
- the AI import system should write into a stable production model, not invent one

### Phase 2 - Public Website + Billing Launch

Primary focus:

- home / features / pricing / security / contact
- church signup entry point
- Stripe checkout
- 45-day trial lifecycle
- customer portal
- webhook processing
- read-only / suspended access behavior

Why second:

- gives Sunday Tally a customer acquisition surface
- creates the revenue model needed before scaling onboarding work

### Phase 3 - Platform Owner Hub MVP

Primary focus:

- church list and health indicators
- user and membership views
- billing state views
- audit timeline
- import job monitoring
- support actions

Why third:

- once customers can sign up and be billed, support tooling becomes necessary
- import-first onboarding should ship with internal observability in place

### Phase 4 - AI Import-First Onboarding MVP

Primary focus:

- import case model
- file upload + parsing
- proposed setup
- question loop
- historical import
- provenance and audit trail

Why fourth:

- depends on stable platform roles, billing gating, and production environment
- benefits from platform audit visibility for support/debugging

### Phase 5 - Learning and Scale Improvements

Primary focus:

- saved church-specific import rules
- regenerated church AI profiles
- dashboard sanity scoring improvements
- advanced anomaly handling
- richer platform support actions

---

## Key Architecture Decisions

### A. One Product, Not Three Separate Apps

Use one Next.js codebase with separated route surfaces:

- public website: `/`, `/features`, `/pricing`, `/security`
- auth: `/auth/*`
- church app: `/services`, `/dashboard`, `/settings`
- platform owner hub: `/platform/*`

### B. One Supabase Project Per Environment

Use Supabase as:

- auth provider
- tenant data store
- RLS enforcement
- import/audit/billing metadata store

Production and preview should not share data.

### C. Stripe Is the Billing System of Record

Sunday Tally stores billing projection state locally, but Stripe remains canonical for:

- subscriptions
- invoices
- payment methods
- cancellation and reactivation
- customer billing portal

### D. Claude Is the Import Reasoning Layer, Not the Import Engine

Claude should:

- infer church setup from files
- detect ambiguities and anomalies
- propose mappings and rules
- explain dashboard consequences

Claude should not:

- write directly to the database
- execute imports
- become the system of record

### E. Structured Tables Stay Canonical

Use markdown context artifacts for AI, but canonical truth stays in tables.

### F. AI Import Intelligence Is Church-Specific

The import system is not a generic global memory.
It is a church-scoped intelligence layer:

- global playbook explains how Sunday Tally works
- church profile explains how a specific church operates
- church rules are saved and reused only for that church
- import cases are evaluated in that church context

---

## Cross-Vertical Dependencies

### Platform Owner Hub depends on:

- billing states from Vertical 2
- audit events from all verticals
- import jobs and anomalies from Vertical 3

### Public Website + Billing depends on:

- auth flow stability
- access-state model
- support visibility from Platform Owner Hub

### AI Import depends on:

- stable auth and access-state model
- stable core schema and dashboard behavior
- support visibility in Platform Owner Hub

---

## Recommended Milestones

### Milestone 1 - Production SaaS Shell

Includes:

- Vercel production deployment
- env model
- marketing site skeleton
- Stripe integration foundation
- church access-state gating

Success criteria:

- a new church can sign up, log in, and enter a 45-day trial
- billing states are visible in the database

### Milestone 2 - Internal Platform Control

Includes:

- `/platform` role model
- church/user/billing list views
- audit event timeline

Success criteria:

- platform owner can answer: who signed up, what their status is, and why a church is blocked

### Milestone 3 - AI Setup Proposal

Includes:

- import case
- multi-file upload
- deterministic parsing
- Claude setup proposal
- targeted question flow

Success criteria:

- a church can upload historical files and receive a setup proposal before any data is written

### Milestone 4 - Historical Import Execution

Includes:

- final mapping review
- dashboard sanity preview
- import execution
- provenance and audit trail

Success criteria:

- historical data lands in Sunday Tally correctly enough that dashboard output is trusted

### Milestone 5 - Rule Learning

Includes:

- church-specific rule storage
- church AI profile generation
- future import reuse

Success criteria:

- second import for the same church is materially faster and asks fewer questions

---

## Risks

### Risk 1 - AI creates dashboard-breaking structure

Mitigation:

- dashboard sanity checks before import
- anomaly review layer
- user approval before execution

### Risk 2 - Billing and access logic drift apart

Mitigation:

- explicit `access_state`
- Stripe webhook projection model
- single access-gating service

### Risk 3 - Platform owner hub becomes a shallow table browser

Mitigation:

- design event model first
- define support actions and diagnostic views before polishing UI

### Risk 4 - Markdown AI context becomes canonical by accident

Mitigation:

- structured tables are always canonical
- markdown profiles are generated artifacts only

---

## Immediate Next Specs

The following documents implement this roadmap:

- `PLATFORM_OWNER_HUB_SPEC.md`
- `WEBSITE_BILLING_SPEC.md`
- `AI_IMPORT_ARCHITECTURE.md`
- `SundayTally_Import_Playbook.md`
- `Church_Import_Profile_Template.md`
- `IMPORT_DECISION_FRAMEWORK.md`
- `IMPORT_DB_SCHEMA.md`
- `IMPORT_EVAL_SET.md`
