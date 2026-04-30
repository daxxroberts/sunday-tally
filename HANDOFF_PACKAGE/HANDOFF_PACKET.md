# Sunday Tally Handoff Packet
## Version 1.0 | 2026-04-18

---

## What This Package Is

This folder contains the current planning and handoff docs for the next major Sunday Tally program work.

The program is intentionally split into three coordinated verticals:

1. `Platform Owner Hub`
2. `Public Website + Billing + Production Platform`
3. `AI Church Setup + Historical Import`

These are not separate products.
They are one product roadmap and should be implemented with shared platform assumptions.

---

## Core Decisions

### Vertical 1 - Platform Owner Hub

Purpose:

- internal control plane for the Sunday Tally owner/platform admins
- visibility into churches, users, auth, billing, imports, and support diagnostics

Must include:

- church status and onboarding progress
- user/invite visibility
- billing visibility
- import monitoring
- audit timeline

### Vertical 2 - Public Website + Billing + Production Platform

Purpose:

- launch Sunday Tally as a production SaaS on Vercel
- use Stripe for subscriptions and customer billing portal
- support a 45-day free trial
- enforce explicit church access states

Key architectural choices:

- Next.js on Vercel
- Supabase for auth/data
- Stripe as billing system of record
- local billing projection/access-state model in Sunday Tally

### Vertical 3 - AI Church Setup + Historical Import

Purpose:

- let churches upload one or more files
- infer setup from historical data
- ask clarifying questions only when needed
- import historical data safely
- get dashboards usable immediately

Important:

- this is primarily an onboarding accelerator
- it also becomes a repeat historical import tool later
- this intelligence is `per church`

---

## Critical AI Import Constraints

These constraints should not be relaxed during implementation:

- The AI import system is `church-specific`.
- Each church has its own:
  - import profile
  - saved rules
  - service continuity assumptions
  - mapping preferences
- One church's learned behavior must not silently become another church's default.
- The global playbook explains how Sunday Tally works.
- The church profile explains how a specific church operates.
- Structured tables are canonical truth.
- Markdown profiles are generated AI context, not the system of record.
- Claude proposes setup, mappings, questions, and rules.
- Deterministic code parses files and executes imports.
- Claude must never write directly to the production schema.
- Dashboard integrity must be protected before import execution.

---

## Recommended Build Sequence

1. `Platform foundation`
   - platform roles
   - billing state model
   - audit event model
   - Vercel/Supabase production setup

2. `Website + billing`
   - marketing site
   - Stripe checkout
   - 45-day trial
   - customer portal
   - access-state gating

3. `Platform owner hub MVP`
   - churches
   - users
   - billing
   - imports
   - event timeline

4. `AI import-first onboarding MVP`
   - import case model
   - file parsing
   - setup proposal
   - question loop
   - review flow

5. `Historical import execution + rule learning`
   - provenance
   - import execution
   - church-specific saved rules
   - regenerated church AI profile

---

## Files In This Folder

- `PROGRAM_ROADMAP.md`
- `PLATFORM_OWNER_HUB_SPEC.md`
- `WEBSITE_BILLING_SPEC.md`
- `AI_IMPORT_ARCHITECTURE.md`
- `SundayTally_Import_Playbook.md`
- `Church_Import_Profile_Template.md`
- `IMPORT_DECISION_FRAMEWORK.md`
- `IMPORT_DB_SCHEMA.md`
- `IMPORT_EVAL_SET.md`

Suggested reading order:

1. `PROGRAM_ROADMAP.md`
2. `PLATFORM_OWNER_HUB_SPEC.md`
3. `WEBSITE_BILLING_SPEC.md`
4. `AI_IMPORT_ARCHITECTURE.md`
5. `SundayTally_Import_Playbook.md`
6. `Church_Import_Profile_Template.md`
7. `IMPORT_DECISION_FRAMEWORK.md`
8. `IMPORT_DB_SCHEMA.md`
9. `IMPORT_EVAL_SET.md`

---

## Implementation Warnings

Do not:

- collapse the three verticals into one vague admin/import project
- make markdown canonical over structured tables
- let AI write directly into production entities
- treat tags as service identity by default
- silently merge anomalous service patterns without user confirmation
- optimize for literal spreadsheet fidelity over dashboard trust

Do:

- preserve stable service identity
- prefer dashboard-safe continuity
- ask targeted questions when structure is ambiguous
- keep rule learning church-scoped
- use structured audit events across auth, billing, setup, and imports

