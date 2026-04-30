-- ============================================================
-- Church Analytics — Giving Sources
-- Migration: 0007_giving_sources.sql
-- Generated: 2026-04-09
-- Decisions: D-036 · D-037 · D-038
-- ============================================================
-- Context:
--   Giving is now tracked per persistent church-defined source
--   (Plate, Online, etc.) not as freeform append-only entries.
--   One row per (occurrence, source) — editable, UPSERT pattern.
--   Correction entries removed (D-038) — edit the row instead.
--   giving_sources mirrors pattern of volunteer_categories and
--   response_categories — seeded defaults + church can add more.
-- ============================================================


-- ============================================================
-- PART 1 — Create giving_sources table
-- ============================================================

CREATE TABLE giving_sources (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     UUID        NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  source_name   TEXT        NOT NULL,
  source_code   TEXT        NOT NULL,
  is_custom     BOOLEAN     NOT NULL DEFAULT false,
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_giving_source UNIQUE (church_id, source_code)
);

CREATE TRIGGER set_giving_sources_updated_at
  BEFORE UPDATE ON giving_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_giving_sources_church
  ON giving_sources (church_id)
  WHERE is_active = true;


-- ============================================================
-- PART 2 — RLS on giving_sources
-- ============================================================

ALTER TABLE giving_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "giving_sources_select" ON giving_sources
  FOR SELECT TO authenticated
  USING (church_id = ANY(get_user_church_ids()));

CREATE POLICY "giving_sources_insert" ON giving_sources
  FOR INSERT TO authenticated
  WITH CHECK (church_id = ANY(get_user_church_ids()));

CREATE POLICY "giving_sources_update" ON giving_sources
  FOR UPDATE TO authenticated
  USING (church_id = ANY(get_user_church_ids()));


-- ============================================================
-- PART 3 — Restructure giving_entries
-- ============================================================

-- Add giving_source_id
ALTER TABLE giving_entries
  ADD COLUMN giving_source_id UUID REFERENCES giving_sources(id) ON DELETE RESTRICT;

-- Drop freeform source note — replaced by giving_source_id
ALTER TABLE giving_entries
  DROP COLUMN IF EXISTS source_note;

-- Drop old unique constraint
ALTER TABLE giving_entries
  DROP CONSTRAINT IF EXISTS uq_giving_entry;

-- One row per (occurrence, source) — UPSERT pattern
ALTER TABLE giving_entries
  ADD CONSTRAINT uq_giving_entry
  UNIQUE (service_occurrence_id, giving_source_id);


-- ============================================================
-- PART 4 — Seed function
-- ============================================================

CREATE OR REPLACE FUNCTION seed_default_giving_sources(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO giving_sources
    (church_id, source_name, source_code, is_custom, display_order, is_active)
  VALUES
    (p_church_id, 'Plate',  'PLATE',  false, 1, true),
    (p_church_id, 'Online', 'ONLINE', false, 2, true)
  ON CONFLICT (church_id, source_code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_default_giving_sources(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_default_giving_sources(UUID) TO authenticated;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Schema now: 15 tables · 7 migrations
-- New table: giving_sources (mirrors volunteer_categories pattern)
-- giving_entries: giving_source_id added · source_note dropped
--   unique constraint: (service_occurrence_id, giving_source_id)
--   UPSERT pattern — one editable row per source per occurrence
--
-- Seeded defaults: Plate (display_order 1) · Online (display_order 2)
-- Church can rename, add custom sources, deactivate.
-- No deletion if giving_entries data exists for that source.
--
-- T5 entry screen changes (D-036/D-037/D-038):
--   One currency field per active giving source (flat list)
--   UPSERT on save — not INSERT
--   Prior entries editable directly in T5
--   No "add entry" button — no history list
--   No correction entries
--
-- Rule 5 still holds:
--   Dashboard SUMs all giving_entries rows per occurrence
--   Now one row per source, not one row per entry event
--
-- T5 settings screen (new — mirrors T7/T8):
--   Manage giving sources: rename, add, deactivate
--   Cannot delete source if giving_entries rows exist for it
--
-- P6 (giving total) unchanged in logic — SUM still correct
-- P7 (giving per attendee) unchanged
-- P14a/b/c giving row — SUM still correct
-- ============================================================
