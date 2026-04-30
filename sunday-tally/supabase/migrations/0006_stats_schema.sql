-- ============================================================
-- Church Analytics — Stats Schema
-- Migration: 0006_stats_schema.sql
-- Generated: 2026-04-09 (revised after D-035 scope model)
-- Decisions: D-034 · D-035 revised
-- ============================================================
-- Stats have two scopes:
--   'audience' — entered per MAIN/KIDS/YOUTH (seeded defaults)
--   'service'  — single value for the whole service (custom stats, optionally audience too)
--
-- UI label "Responses" → "Stats" everywhere (D-034).
-- Schema table names unchanged.
-- Pre-launch only — clean migration, no live data to preserve.
-- ============================================================


-- ============================================================
-- PART 0 — Reconcile column names from 0003
-- 0003 created response_type_code/response_type_name on categories
-- and did NOT add audience_group_code to response_entries.
-- 0006 onward expects category_code/category_name on categories
-- and audience_group_code on response_entries. Bring the schema
-- to the expected starting point before the rest of this migration.
-- ============================================================

ALTER TABLE response_categories
  RENAME COLUMN response_type_code TO category_code;

ALTER TABLE response_categories
  RENAME COLUMN response_type_name TO category_name;

-- 0003 created uq_response_type_code on (church_id, audience_group_code, response_type_code).
-- It will be replaced below; drop here so the audience_group_code drop can succeed.
ALTER TABLE response_categories
  DROP CONSTRAINT IF EXISTS uq_response_type_code;

-- Add audience_group_code to response_entries with a temporary default so the
-- NOT NULL add succeeds on existing rows; the NOT NULL is dropped in PART 2.
ALTER TABLE response_entries
  ADD COLUMN audience_group_code TEXT NOT NULL DEFAULT 'MAIN'
    CHECK (audience_group_code IN ('MAIN', 'KIDS', 'YOUTH'));

ALTER TABLE response_entries
  ALTER COLUMN audience_group_code DROP DEFAULT;


-- ============================================================
-- PART 1 — Update response_categories
-- ============================================================

ALTER TABLE response_categories
  ADD COLUMN is_custom     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN stat_scope    TEXT    NOT NULL DEFAULT 'audience'
    CONSTRAINT chk_stat_scope CHECK (stat_scope IN ('audience', 'service'));

-- audience_group_code no longer belongs on the category —
-- scope is now a category-level attribute, not a per-row key.
-- Rows for each audience group are driven by stat_scope at entry time.
ALTER TABLE response_categories
  DROP COLUMN IF EXISTS audience_group_code;

-- Update unique constraint: one category_code per church (scope is category-level)
ALTER TABLE response_categories
  DROP CONSTRAINT IF EXISTS uq_response_category;

ALTER TABLE response_categories
  ADD CONSTRAINT uq_response_category
  UNIQUE (church_id, category_code);


-- ============================================================
-- PART 2 — Update response_entries
-- ============================================================

-- response_count renamed to stat_value
ALTER TABLE response_entries
  RENAME COLUMN response_count TO stat_value;

-- audience_group_code is now nullable:
--   audience-scoped stats: populated (MAIN / KIDS / YOUTH)
--   service-level stats:   NULL
ALTER TABLE response_entries
  ALTER COLUMN audience_group_code DROP NOT NULL;

-- Update unique constraint to handle both scopes cleanly
ALTER TABLE response_entries
  DROP CONSTRAINT IF EXISTS uq_response_entry;

ALTER TABLE response_entries
  ADD CONSTRAINT uq_response_entry
  UNIQUE (service_occurrence_id, response_category_id, audience_group_code);
-- Note: audience_group_code = NULL for service-level stats.
-- Postgres treats NULLs as distinct in unique constraints by default.
-- Use a partial index to enforce single row for service-level stats:

CREATE UNIQUE INDEX uq_response_entry_service_level
  ON response_entries (service_occurrence_id, response_category_id)
  WHERE audience_group_code IS NULL;


-- ============================================================
-- PART 3 — Reseed default stat categories
-- ============================================================

DROP FUNCTION IF EXISTS seed_default_response_categories(UUID);

CREATE OR REPLACE FUNCTION seed_default_stat_categories(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO response_categories
    (church_id, category_name, category_code, is_custom, stat_scope, display_order, is_active)
  VALUES
    (p_church_id, 'First-Time Decision', 'FIRST_TIME_DECISION', false, 'audience', 1, true),
    (p_church_id, 'Rededication',        'REDEDICATION',        false, 'audience', 2, true),
    (p_church_id, 'Baptism',             'BAPTISM',             false, 'audience', 3, true)
  ON CONFLICT (church_id, category_code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_default_stat_categories(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_default_stat_categories(UUID) TO authenticated;


-- ============================================================
-- PART 4 — Indexes
-- ============================================================

DROP INDEX IF EXISTS idx_response_entries_occurrence;

CREATE INDEX idx_response_entries_occurrence
  ON response_entries (service_occurrence_id);

CREATE INDEX idx_response_entries_category
  ON response_entries (response_category_id);


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Schema now: 14 tables · 6 migrations
--
-- response_categories changes:
--   + is_custom     (false = seeded default, true = church-defined)
--   + display_order (seeded: 1/2/3, custom: set at creation)
--   + stat_scope    ('audience' | 'service')
--   - audience_group_code (removed — scope is category-level)
--
-- response_entries changes:
--   ~ response_count → stat_value
--   ~ audience_group_code now nullable (NULL for service-level stats)
--   + partial unique index for service-level stats
--
-- seed_default_response_categories() → seed_default_stat_categories()
--
-- T4 entry screen (D-035 revised):
--   Audience-scoped stats → appear inside MAIN/KIDS/YOUTH sections (unchanged)
--   Service-level stats   → appear in a separate "Service Stats" section below
--   Sections preserved — no flat list
--
-- T8 settings — custom stat creation requires:
--   stat name + stat_scope choice (audience or service)
--   Cannot change scope after data exists for that stat
--
-- UI label changes (D-034):
--   "Responses" → "Stats" everywhere in UI
--   Schema names unchanged
-- ============================================================
