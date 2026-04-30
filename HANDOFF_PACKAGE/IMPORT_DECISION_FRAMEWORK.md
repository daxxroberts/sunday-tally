# Import Decision Framework
## Version 1.0 | 2026-04-18

---

## Purpose

This framework defines how the import system should classify source patterns into Sunday Tally structure.

Primary classifications:

- same logical service
- separate recurring service
- temporary experiment / anomaly
- one-off special occurrence
- unresolved ambiguity

---

## Decision Priority

When evaluating import structure, optimize for:

1. dashboard integrity
2. stable service identity
3. minimal unnecessary questions
4. faithfulness to real church operation
5. literal fidelity to inconsistent labels

---

## Service Classification Rules

### Classification A - Same Logical Service

Use when:

- labels are similar enough to indicate continuity
- time changes happen sequentially, not concurrently
- no overlap exists across the same recurrence window
- context suggests renaming or retiming of the same service

Output:

- one service template
- multiple schedule versions if time changed

### Classification B - Separate Recurring Service

Use when:

- recurring services overlap in time/date range
- multiple weekly services coexist
- evidence clearly supports distinct services

Output:

- separate service templates

### Classification C - Temporary Experiment / Anomaly

Use when:

- short-lived additional services appear
- unusual times appear for a short period
- Saturday or off-pattern services appear briefly
- the structure may be real, but confidence is not high enough to commit silently

Output:

- anomaly flag
- recommendation
- clarification question

### Classification D - One-Off Special Occurrence

Use when:

- isolated holiday or event pattern
- not enough recurrence to justify a template
- should be preserved in history without affecting recurring setup

Output:

- standalone occurrence handling

### Classification E - Unresolved Ambiguity

Use when:

- dashboard consequences differ significantly depending on interpretation
- evidence is mixed
- incorrect auto-merge would distort reporting

Output:

- block auto-resolution
- require question/approval

---

## Evidence Signals

Useful evidence:

- label similarity
- day-of-week consistency
- time sequence
- overlap vs handoff
- recurrence count
- lifespan of pattern
- source file agreement
- co-occurrence with known tags/locations

---

## Anomaly Detection Rules

Flag likely anomaly when:

- new recurring time appears for fewer than a threshold number of weeks
- service cluster appears only in one historical window
- Saturday or unusual weekday pattern emerges unexpectedly
- source labels are sparse and low-frequency

Suggested severities:

- `low` - can default to recommendation
- `medium` - show and ask
- `high` - block import until clarified

---

## Mapping Rules

### Stats mapping

The agent may recommend mappings, but must be conservative when source terms have pastoral meaning.

Example:

- `FTD` -> likely safe to recommend `First-Time Decision`
- `Salvations` -> ask unless church-specific rule exists

### Giving mapping

Map repeated source labels to known giving sources when confidence is high.

### Tag mapping

Use church rules and stable repeated source patterns.
Do not let tags replace service identity reasoning.

---

## Dashboard Risk Triggers

Force clarification when the proposed mapping would likely:

- split a long attendance trend line
- combine two genuinely separate recurring services
- inflate total attendance through accidental overlap
- place stats in the wrong scope
- create misleading recurring templates from special events

---

## Rule Suggestion Triggers

Suggest a reusable rule when:

- the same transformation occurs multiple times in one import
- the user confirms the same decision across multiple anomalies
- the mapping is church-specific and likely reusable

Never save a rule automatically.

