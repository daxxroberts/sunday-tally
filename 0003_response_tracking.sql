-- ============================================================
-- Church Analytics — Response Tracking (Salvations)
-- Migration: 0003_response_tracking.sql
-- Generated: 2026-04-09
-- Decision: Audience-grouped configurable response types.
-- Mirrors volunteer_categories / volunteer_entries pattern.
-- Scope: counts only — no individual contact capture in V1.
-- ============================================================
-- Default response types seeded per church on creation:
--   MAIN / FIRST_TIME_DECISION / First-Time Decision
--   MAIN / REDEDICATION       / Rededication
--   MAIN / BAPTISM            / Baptism
--   KIDS / FIRST_TIME_DECISION / First-Time Decision
--   KIDS / REDEDICATION       / Rededication
--   YOUTH / FIRST_TIME_DECISION / First-Time Decision
--   YOUTH / REDEDICATION       / Rededication
--   YOUTH / BAPTISM            / Baptism
-- Churches can add, rename (display only), or soft-delete types.
-- response_type_code is IMMUTABLE after insert.
-- ============================================================


-- ============================================================
-- TABLE: response_categories
-- Configurable response types per church, grouped by audience.
-- Mirrors volunteer_categories exactly.
-- ============================================================

CREATE TABLE response_categories (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  audience_group_code TEXT        NOT NULL
                        CHECK (audience_group_code IN ('MAIN', 'KIDS', 'YOUTH')),
  response_type_code  TEXT        NOT NULL,   -- IMMUTABLE after insert — app must enforce
  response_type_name  TEXT        NOT NULL,   -- mutable display label
  is_active           BOOLEAN     NOT NULL DEFAULT true,  -- soft delete only, never hard DELETE
  sort_order          INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_response_type_code
    UNIQUE (church_id, audience_group_code, response_type_code)
);

CREATE TRIGGER set_updated_at_response_categories
  BEFORE UPDATE ON response_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE response_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "response_categories_church_isolation"
  ON response_categories
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- TABLE: response_entries
-- Counts per response type per service occurrence.
-- Mirrors volunteer_entries exactly.
-- ============================================================

CREATE TABLE response_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_occurrence_id UUID        NOT NULL REFERENCES service_occurrences(id) ON DELETE RESTRICT,
  response_category_id  UUID        NOT NULL REFERENCES response_categories(id) ON DELETE RESTRICT,
  response_count        INTEGER     NOT NULL DEFAULT 0 CHECK (response_count >= 0),
  is_not_applicable     BOOLEAN     NOT NULL DEFAULT false,
  -- is_not_applicable = true  → type doesn't apply to this occurrence
  -- is_not_applicable = false + count = 0 → zero responses this week
  -- no row at all → data not yet entered
  notes                 TEXT,
  created_by            UUID        REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_response_entry
    UNIQUE (service_occurrence_id, response_category_id)
);

CREATE INDEX idx_response_entries_occurrence
  ON response_entries (service_occurrence_id);

CREATE TRIGGER set_updated_at_response_entries
  BEFORE UPDATE ON response_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE response_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "response_entries_church_isolation"
  ON response_entries
  FOR ALL
  TO authenticated
  USING (
    service_occurrence_id IN (
      SELECT id FROM service_occurrences
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );


-- ============================================================
-- SEED FUNCTION: default response categories
-- Call after a new church is created.
-- Application calls: SELECT seed_default_response_categories($church_id);
-- ============================================================

CREATE OR REPLACE FUNCTION seed_default_response_categories(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO response_categories
    (church_id, audience_group_code, response_type_code, response_type_name, sort_order)
  VALUES
    -- MAIN
    (p_church_id, 'MAIN', 'FIRST_TIME_DECISION', 'First-Time Decision', 1),
    (p_church_id, 'MAIN', 'REDEDICATION',        'Rededication',        2),
    (p_church_id, 'MAIN', 'BAPTISM',             'Baptism',             3),
    -- KIDS
    (p_church_id, 'KIDS', 'FIRST_TIME_DECISION', 'First-Time Decision', 1),
    (p_church_id, 'KIDS', 'REDEDICATION',        'Rededication',        2),
    -- YOUTH
    (p_church_id, 'YOUTH', 'FIRST_TIME_DECISION', 'First-Time Decision', 1),
    (p_church_id, 'YOUTH', 'REDEDICATION',        'Rededication',        2),
    (p_church_id, 'YOUTH', 'BAPTISM',             'Baptism',             3)
  ON CONFLICT (church_id, audience_group_code, response_type_code)
    DO NOTHING;  -- idempotent — safe to call multiple times
END;
$$;

-- Lock down seed function — service role only, not exposed via RPC
REVOKE EXECUTE ON FUNCTION seed_default_response_categories(UUID) FROM anon, public;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New tables:    2 (response_categories, response_entries)
-- New policies:  2
-- New indexes:   1
-- New triggers:  2
-- New functions: 1 (seed_default_response_categories)
-- ============================================================
-- Deferred (V2):
--   - Individual contact capture tied to responses
--   - Response follow-up workflows
--   - Response-to-baptism funnel tracking
--   - Multi-week response aggregation views
-- ============================================================
-- Schema now: 14 tables · 14 RLS policies · 7 indexes · 15 triggers
-- ============================================================
