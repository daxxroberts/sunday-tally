-- ============================================================
-- Migration 0041 — schedule frequency (cadence on the occurrence)
-- STATUS: NEEDS-APPROVAL — not yet applied.
-- ============================================================
-- WHY: cadence is a property of the OCCURRENCE, not the metric. A service
-- schedule is now one of three cadences set on the Services and Occurrences
-- screen, instead of always a specific day + time:
--   'specific' — a set day_of_week + start_time (a gathering; the existing case)
--   'weekly'   — counted once a week, no clock (e.g. giving)
--   'monthly'  — counted once a month, no clock
-- This is what lets a giving (period) occurrence live on the Services screen,
-- and removes the need for a separate cadence picker in "What we track".
--
-- WHAT: add `frequency` to service_schedule_versions, defaulting to 'specific'
-- so every existing row keeps its current meaning. day_of_week + start_time
-- stay NOT NULL; for weekly/monthly the app writes harmless placeholders the
-- cadence makes the reader ignore (no nullability change = smaller blast radius).
--
-- SAFE: additive column with a default + CHECK; backfills implicitly via the
-- default. No data rewrite, no view changes. Reversible by dropping the column.
-- ============================================================

ALTER TABLE service_schedule_versions
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'specific';

ALTER TABLE service_schedule_versions
  DROP CONSTRAINT IF EXISTS service_schedule_versions_frequency_check;

ALTER TABLE service_schedule_versions
  ADD CONSTRAINT service_schedule_versions_frequency_check
  CHECK (frequency IN ('specific', 'weekly', 'monthly'));

-- ============================================================
-- MIGRATION COMPLETE — service_schedule_versions.frequency added
-- (default 'specific', CHECK specific|weekly|monthly). No data changed.
-- ============================================================
