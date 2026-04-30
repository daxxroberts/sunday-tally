# Import DB Schema
## Version 1.0 | 2026-04-18
## Purpose: Canonical structured storage behind AI import/setup

---

## Principles

- structured tables are canonical
- markdown AI profiles are generated artifacts
- imports are modeled as cases
- every recommendation and write should be traceable

---

## Core Tables

### import_cases

One onboarding/import session.

Suggested columns:

- `id UUID PK`
- `church_id UUID NULL` - nullable until church is provisionally identified if needed
- `created_by UUID`
- `status TEXT`
- `stage TEXT`
- `source_context TEXT` - onboarding, historical import, support import
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### import_files

Uploaded files belonging to an import case.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `storage_path TEXT`
- `file_name TEXT`
- `mime_type TEXT`
- `file_size_bytes BIGINT`
- `parse_status TEXT`
- `created_at TIMESTAMPTZ`

### import_parsed_rows

Normalized extracted row store with provenance.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `import_file_id UUID FK`
- `sheet_name TEXT NULL`
- `source_row_number INTEGER`
- `raw_payload JSONB`
- `normalized_payload JSONB`
- `row_hash TEXT`
- `created_at TIMESTAMPTZ`

### import_service_candidates

Candidate service identities derived from parsed rows.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `candidate_name TEXT`
- `source_aliases JSONB`
- `location_candidate TEXT NULL`
- `evidence_payload JSONB`
- `classification TEXT`
- `confidence TEXT`
- `created_at TIMESTAMPTZ`

### import_anomalies

Detected structural anomalies requiring review.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `kind TEXT`
- `severity TEXT`
- `subject_ref JSONB`
- `recommendation JSONB`
- `status TEXT`
- `created_at TIMESTAMPTZ`

### import_questions

Clarification questions shown to the user.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `question_text TEXT`
- `recommendation_text TEXT NULL`
- `context_payload JSONB`
- `answer_payload JSONB NULL`
- `status TEXT`
- `created_at TIMESTAMPTZ`

### import_proposed_setups

Versioned proposed setup drafts.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `version INTEGER`
- `setup_payload JSONB`
- `generated_by TEXT`
- `created_at TIMESTAMPTZ`

### import_proposed_mappings

Versioned mapping suggestions.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `version INTEGER`
- `mapping_payload JSONB`
- `created_at TIMESTAMPTZ`

### church_import_rules

Approved reusable church-specific rules.

Suggested columns:

- `id UUID PK`
- `church_id UUID FK`
- `rule_type TEXT`
- `rule_scope TEXT`
- `rule_payload JSONB`
- `created_by UUID`
- `is_active BOOLEAN`
- `created_at TIMESTAMPTZ`

### church_service_profiles

Canonical church service continuity and service identity data used by imports.

Suggested columns:

- `id UUID PK`
- `church_id UUID FK`
- `service_template_id UUID NULL`
- `profile_payload JSONB`
- `updated_at TIMESTAMPTZ`

### church_mapping_profiles

Canonical church-level mapping preferences outside raw rule rows.

Suggested columns:

- `id UUID PK`
- `church_id UUID FK`
- `profile_payload JSONB`
- `updated_at TIMESTAMPTZ`

### church_ai_profiles

Generated AI-facing profile artifact.

Suggested columns:

- `id UUID PK`
- `church_id UUID FK`
- `version INTEGER`
- `profile_markdown TEXT`
- `profile_json JSONB NULL`
- `generated_from_version TEXT`
- `created_at TIMESTAMPTZ`

### import_executions

Represents an applied import run.

Suggested columns:

- `id UUID PK`
- `import_case_id UUID FK`
- `status TEXT`
- `execution_payload JSONB`
- `started_at TIMESTAMPTZ`
- `completed_at TIMESTAMPTZ NULL`

### import_execution_rows

Row-level result/provenance for final writes.

Suggested columns:

- `id UUID PK`
- `import_execution_id UUID FK`
- `parsed_row_id UUID FK`
- `result_status TEXT`
- `target_ref JSONB`
- `provenance_payload JSONB`
- `error_message TEXT NULL`

### platform_audit_events

Unified internal audit/event stream.

Suggested columns:

- `id UUID PK`
- `church_id UUID NULL`
- `user_id UUID NULL`
- `event_type TEXT`
- `severity TEXT`
- `entity_type TEXT NULL`
- `entity_id UUID NULL`
- `payload JSONB`
- `created_at TIMESTAMPTZ`

### church_billing_status

Billing/access projection table.

Suggested columns:

- `church_id UUID PK`
- `stripe_customer_id TEXT NULL`
- `stripe_subscription_id TEXT NULL`
- `plan_code TEXT NULL`
- `subscription_status TEXT`
- `access_state TEXT`
- `trial_started_at TIMESTAMPTZ NULL`
- `trial_ends_at TIMESTAMPTZ NULL`
- `current_period_end TIMESTAMPTZ NULL`
- `updated_at TIMESTAMPTZ`

---

## Notes

- `JSONB` is appropriate for payload-heavy recommendation objects
- keep canonical Sunday Tally entities in their existing domain tables
- import tables should record interpretation and provenance, not replace core schema

