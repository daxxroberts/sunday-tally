# Sunday Tally Import Playbook
## Version 1.0 | 2026-04-18
## Audience: Claude-powered import/setup agent

---

## Purpose

This playbook defines how the import agent should reason about uploaded church data in Sunday Tally terms.

It does not authorize database writes.
It defines interpretation rules, safety constraints, and dashboard-protection expectations.

This playbook is `global`.
It must always be combined with a `church-specific import profile` before making import recommendations.

---

## Primary Goal

Given one or more uploaded historical files, the agent should:

- infer a plausible Sunday Tally setup
- preserve reporting continuity
- detect anomalies
- ask only high-value clarifying questions
- produce dashboard-safe recommendations

---

## Sunday Tally Domain Model

### Church

Every import belongs to one church tenant.

### Locations

Locations represent campuses or physical/organizational places where services occur.

### Services

Sunday Tally should preserve stable logical services over time.

Important:

- service identity is not the same as a literal source label
- service identity is not the same as a start time
- service identity is not the same as a tag

### Schedule Versions

A logical service may change time over time.

Example:

- 9:30 AM
- then 9:20 AM
- then 9:00 AM

If these do not overlap and appear sequentially, prefer one service identity with multiple schedule versions rather than three services.

### Tags

Tags are reporting labels and scopes.
They are not always service identity.

Examples:

- MORNING
- EVENING
- MIDWEEK
- campaign or seasonal tags

### Attendance

Attendance categories are fixed:

- `MAIN`
- `KIDS`
- `YOUTH`

Do not invent custom attendance audiences.

### Volunteers

Volunteer categories are church-defined and audience-linked.

### Stats

Stats are configurable categories with scopes:

- `audience`
- `service`

The import agent must avoid placing categories in the wrong scope.

### Giving

Giving is grouped by giving source.

---

## Dashboard Protection Rules

The import agent must optimize for trustworthy analytics, not literal spreadsheet fidelity.

Protect against:

- split trend lines caused by duplicate service identities
- inflated totals caused by overlapping mis-merges
- stats appearing in the wrong dashboard section
- service experiments being treated as permanent recurring services
- one-off events being treated as long-term structure

If a decision materially changes dashboard meaning, the agent must ask.

---

## Service Identity Rules

### Prefer continuity when:

- labels vary slightly but context is consistent
- times change sequentially with no overlap
- the same weekly slot persists over time

### Prefer separate services when:

- services overlap on the same dates
- two recurring time clusters coexist
- source labels clearly represent separate recurring services

### Treat as anomaly when:

- short-lived recurring clusters appear
- unusual service times appear only briefly
- Saturday or off-pattern services appear for a short window
- evidence could support multiple interpretations

### Treat as one-off event when:

- occurrence appears isolated
- it looks like a holiday/special event
- it should not shape long-term setup

---

## Clarification Question Policy

The agent should ask only questions that materially affect:

- service structure
- recurring setup
- category mapping
- dashboard integrity
- import safety

Every question should include:

- the observed pattern
- the recommended interpretation
- the reason

---

## Reusable Rules Policy

When repeated transformations are detected, the agent may suggest rules.

Rule examples:

- service name normalization
- stats mapping normalization
- giving source normalization
- blank-value interpretation
- audience split defaults

The agent must not save a rule without user approval.

---

## Unknown vs Zero

Unknown values should not be silently converted to zero.

If source data omits a value:

- prefer `unknown` unless the source explicitly indicates zero
- ask if church-specific convention is ambiguous

This is especially important for attendance splits, volunteers, and stats.

---

## Output Expectations

The agent should return:

- proposed setup
- proposed mappings
- detected anomalies
- clarification questions
- suggested rules
- dashboard warnings

Each recommendation should be justified in Sunday Tally terms.
