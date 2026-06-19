-- ============================================================
-- Migration 0043 — schedule version date-range integrity
-- STATUS: APPLIED — to prod 2026-06-19 via Supabase apply_migration; verified in
-- supabase_migrations.schema_migrations (recorded version 20260619213555) and the
-- CHECK constraint confirmed live. Idempotent (DROP IF EXISTS + ADD) so re-running
-- through the repo migration sequence is safe.
-- ============================================================
-- WHY: a service can carry more than one schedule version over time. When a
-- new version supersedes an old one, the app stamps the old row's
-- effective_end_date. A bug let that end date land BEFORE the row's own
-- effective_start_date (e.g. superseding a future-dated version), producing
-- impossible ranges like start 2026-06-14 / end 2026-06-07. These rows are
-- inactive junk but they corrupt the audit trail and confuse any date-window
-- reader. The app fix (saveScheduleAction + import writer now end a prior
-- version at GREATEST(its start, the new start)) stops new ones; this migration
-- heals the existing rows and forbids it at the database level for good.
--
-- WHAT:
--   1. Clamp any existing end < start up to the row's own start (zero-length,
--      still inactive — preserves the row, makes the range valid).
--   2. Add a CHECK so no code path can ever write a backwards range again.
--
-- SAFE: the UPDATE only touches already-invalid rows; the CHECK is additive and
-- allows NULL end dates (open-ended current versions). Reversible by dropping
-- the constraint.
-- ============================================================

-- 1. Heal existing invalid rows
UPDATE service_schedule_versions
  SET effective_end_date = effective_start_date
  WHERE effective_end_date IS NOT NULL
    AND effective_end_date < effective_start_date;

-- 2. Forbid backwards ranges going forward
ALTER TABLE service_schedule_versions
  DROP CONSTRAINT IF EXISTS service_schedule_versions_date_range_check;

ALTER TABLE service_schedule_versions
  ADD CONSTRAINT service_schedule_versions_date_range_check
  CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date);

-- ============================================================
-- MIGRATION COMPLETE — invalid ranges healed; end >= start enforced.
-- ============================================================
