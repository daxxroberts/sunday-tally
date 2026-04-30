# Church Import Profile Template
## Generated AI Context Artifact
## Version 1.0 | 2026-04-18

This document is a generated AI-facing summary of church-specific import behavior.
It is not the canonical source of truth. Canonical truth lives in structured tables.

---

## Church Overview

- Church name:
- Church id:
- First import date:
- Last import date:
- Current onboarding state:

---

## Known Locations

- Location names:
- Known aliases:
- Notes:

---

## Known Recurring Services

For each logical service:

- Preferred Sunday Tally service name
- Source labels observed
- Associated location
- Day of week
- Historical schedule versions
- Continuity notes
- Known anomalies

Example fields:

- Stable name:
- Source aliases:
- Schedule history:
- Overlap behavior:
- Merge confidence:

---

## Tag Conventions

- Known tags
- Source label aliases
- When tags should be inferred
- When the agent must ask

---

## Attendance Conventions

- Whether totals are usually explicit
- Whether kids/youth splits are usually present
- Whether blanks should be treated as unknown
- Any approved split defaults

---

## Volunteer Conventions

- Known volunteer category mappings
- Audience group expectations
- Ambiguous labels to watch

---

## Stats Conventions

- Known stat mappings
- Disallowed auto-mappings
- Audience-scoped assumptions
- Service-scoped assumptions

---

## Giving Conventions

- Known giving source mappings
- Known aliases
- Any special import behavior

---

## Import Preferences

- Blank means unknown vs zero
- Whether to aggressively merge similar service names
- Whether to prompt on short-lived service anomalies
- Preferred recommendation style

---

## Saved Rules

List saved church-specific rules in readable form.

Examples:

- `Sunday AM`, `Morning Worship`, `First Service` -> `Sunday First Service`
- blank kids/youth attendance -> unknown
- `FTD` -> `First-Time Decision`

---

## Known Anomaly Patterns

- temporary third service patterns
- holiday service patterns
- Saturday experiments
- labels that always require confirmation

---

## Dashboard Protection Notes

List church-specific dashboard risks the agent should avoid.

Examples:

- do not split first service across time changes
- do not auto-map `Salvations` to `First-Time Decision`
- ask before creating a recurring Saturday service

---

## Last Import Summary

- last import case id
- files involved
- unresolved warnings
- manual overrides applied

