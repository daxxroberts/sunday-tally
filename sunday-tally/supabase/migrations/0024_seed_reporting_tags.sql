-- ============================================================
-- Church Analytics — Seed System Reporting Tags
-- Migration: 0024_seed_reporting_tags.sql
-- Purpose: Function that inserts the four system reporting tags for
--          a church, idempotently. Called by provisioning at signup.
--          No church data is inserted in this migration — only the
--          function definition.
-- Decisions: D-059..D-070
-- ============================================================


-- ============================================================
-- PART 1 — seed_system_reporting_tags(p_church_id)
-- ============================================================
CREATE OR REPLACE FUNCTION seed_system_reporting_tags(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO reporting_tags
    (church_id, code, name, unit_kind, agg_default, is_system)
  VALUES
    (p_church_id, 'ATTENDANCE',    'Attendance', 'count',    'avg', true),
    (p_church_id, 'VOLUNTEERS',    'Volunteers', 'count',    'sum', true),
    (p_church_id, 'GIVING',        'Giving',     'currency', 'sum', true),
    (p_church_id, 'RESPONSE_STAT', 'Stats',      'count',    'sum', true)
  ON CONFLICT (church_id, code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_system_reporting_tags(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_system_reporting_tags(UUID) TO authenticated;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New function: seed_system_reporting_tags(UUID)
--   Inserts 4 system reporting tags (idempotent):
--     ATTENDANCE (count/avg), VOLUNTEERS (count/sum),
--     GIVING (currency/sum), RESPONSE_STAT (count/sum)
--   GRANT EXECUTE to authenticated, REVOKE from PUBLIC.
--   No church-specific data inserted here — provisioning calls it.
-- ============================================================
