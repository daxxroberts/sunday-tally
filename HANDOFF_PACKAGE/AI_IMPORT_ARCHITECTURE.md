# AI Import Architecture
## Version 1.0 | 2026-04-18
## Provider: Claude-first

---

## Purpose

Enable import-first onboarding and historical data import by combining deterministic parsing with Claude-guided setup inference.

The system must:

- accept multiple files
- infer church setup from historical data
- ask only high-value clarifying questions
- protect dashboard quality
- import history safely into Sunday Tally

---

## Core Principle

This is not "AI import."
This is a structured import system with a Claude reasoning layer inside it.

Claude proposes.
The system executes.

This system is also explicitly `church-scoped`.
Every import case should run against:

- the global Sunday Tally playbook
- the specific church's saved profile and rules
- the current import case data

The agent should learn per church, not globally by accident.

---

## Primary Use Cases

- new church uploads historical spreadsheets before configuring Sunday Tally
- church wants AI to infer services, tags, categories, and schedule patterns
- church imports historical data to get dashboard trends immediately
- church returns later with more files and wants prior approved rules reused

Important:

- the import agent must treat each church as its own operating environment
- repeated approved patterns should become reusable only within that church unless a platform owner explicitly promotes them to a global pattern

---

## Architectural Layers

### Layer 1 - File Ingestion

Responsibilities:

- accept one or more files
- store original files
- record file metadata
- create an `import_case`

Supported V1 file types:

- CSV
- XLSX

Deferred:

- PDF
- image OCR

### Layer 2 - Deterministic Parsing

Responsibilities:

- sheet discovery
- row extraction
- header detection
- date parsing
- numeric parsing
- source row provenance
- duplicate detection

No Claude required for normal row parsing.

### Layer 3 - Sunday Tally Candidate Builder

Responsibilities:

- detect service candidates
- detect time clusters
- detect likely locations
- detect likely tags
- detect attendance/giving/stats columns
- detect candidate stat mappings
- build candidate entities in Sunday Tally terms

### Layer 4 - Claude Reasoning Layer

Responsibilities:

- infer stable service identities from unstable labels
- distinguish same-service continuity vs new service vs anomaly
- propose setup
- propose mappings
- detect ambiguous structure
- generate clarification questions
- recommend reusable rules
- explain dashboard consequences

### Layer 5 - Review and Approval

Responsibilities:

- show proposed setup
- show proposed mappings
- show anomalies
- show dashboard sanity preview
- collect user clarifications
- collect approval for reusable rules

### Layer 6 - Import Execution

Responsibilities:

- create or update Sunday Tally setup
- import historical occurrences and entry rows
- record provenance
- record execution result
- support idempotent reruns

---

## Claude Responsibilities

Claude should be treated as a domain-specific Sunday Tally setup and import agent.

Claude must understand:

- service templates
- schedule versions
- tags vs service identity
- attendance audiences
- volunteer categories
- stats scopes
- giving sources
- tracking flags
- dashboard aggregation expectations

Claude should decide:

- which source labels refer to the same logical service
- when a time shift looks like continuity
- when a short-lived pattern is anomalous
- how likely a stats mapping is
- which questions are high value

Claude should not decide:

- file parsing
- direct database writes
- row deduplication execution
- transaction logic
- idempotency
- rollback behavior

---

## Import Flow

1. Create `import_case`
2. Upload files
3. Parse files deterministically
4. Build candidate entities
5. Assemble Claude prompt context from:
   - `SundayTally_Import_Playbook.md`
   - church import profile, if present
   - import case summary
   - candidate entities
6. Claude returns:
   - `proposed_setup`
   - `proposed_mappings`
   - `anomalies`
   - `clarification_questions`
   - `suggested_rules`
7. User answers questions
8. Claude refreshes proposal if needed
9. User reviews setup + dashboard preview
10. Import executes
11. Structured rules and church profile update

---

## Multi-File Rules

An import should be modeled as a case, not as a file.

One case may include:

- attendance spreadsheet
- giving spreadsheet
- volunteer spreadsheet
- old export from another system
- newer manually maintained file

The system must merge evidence across files and ask only when files disagree in meaningful ways.

---

## Safety Model

### Hard rules

- no direct DB write from Claude output
- no silent destructive merge of service identity
- no automatic saving of reusable rules without user approval
- no hidden coercion of unknown values to zero
- no import execution without a reviewable proposal

### Confidence handling

Claude outputs should include confidence bands such as:

- `high`
- `medium`
- `low`

Suggested policy:

- high confidence + low dashboard risk: can default to recommendation
- medium confidence: ask or show in review
- low confidence: ask explicitly

---

## Dashboard Sanity Layer

Before import execution, run sanity checks on the proposed structure.

Examples:

- duplicate service identities likely splitting attendance history
- short-lived service treated as recurring when it looks experimental
- service-level stats mapped as audience stats
- large amount of unmapped rows
- implausible attendance splits
- overlapping services collapsed incorrectly

Import should pause when the dashboard would become misleading.

---

## Rule Learning

The system should detect repeated mappings and ask whether they should become rules.

Approval scopes:

- this import only
- church-wide rule
- always ask

Examples:

- service name normalization
- stat label mapping
- tag mapping
- giving source mapping
- blank value interpretation
- audience split preferences

---

## Output Contracts

Claude should return structured payloads, not freeform prose only.

Core output objects:

- `proposed_setup`
- `proposed_mappings`
- `anomalies`
- `clarification_questions`
- `suggested_rules`
- `dashboard_warnings`

Each object should carry explanation text for the UI.

---

## Relationship to Church AI Profiles

Church-specific context should improve over time.

After approved imports or setup changes:

- structured rules are saved
- church profile is regenerated
- future Claude prompts include that profile

This makes repeat imports faster and safer.

The intended memory boundary is:

- global: Sunday Tally schema and safety rules
- church: service continuity, mappings, import preferences, approved rules
- import case: uploaded files, anomalies, unresolved questions, proposed setup
