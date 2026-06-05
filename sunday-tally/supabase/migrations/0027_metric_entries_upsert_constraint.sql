-- ============================================================
-- Church Analytics — metric_entries upsertable unique constraint
-- Migration: 0027_metric_entries_upsert_constraint.sql
-- Purpose: The two PARTIAL unique indexes (uq_metric_entry_instance /
--          uq_metric_entry_period) cannot be used as a PostgREST
--          .upsert({onConflict}) target — onConflict takes only column
--          names, not an index predicate — so every importer flush threw
--          "no unique or exclusion constraint matching the ON CONFLICT
--          specification" and 0 metric_entries were written.
--          Replace them with ONE non-partial UNIQUE NULLS NOT DISTINCT
--          constraint (the same pattern 0019 uses on the old entry
--          tables), which PostgREST can target.
-- Decisions: D-064
-- ============================================================
-- XOR (chk_metric_entry_attachment) still guarantees exactly one of
-- service_instance_id / period_anchor is set, so (metric_id,
-- service_instance_id, period_anchor) with NULLS NOT DISTINCT uniquely
-- identifies both the instance-scoped and period-scoped rows.
-- ============================================================

DROP INDEX IF EXISTS uq_metric_entry_instance;
DROP INDEX IF EXISTS uq_metric_entry_period;

ALTER TABLE metric_entries
  ADD CONSTRAINT uq_metric_entry
  UNIQUE NULLS NOT DISTINCT (metric_id, service_instance_id, period_anchor);

-- ============================================================
-- MIGRATION COMPLETE
-- Dropped partial indexes uq_metric_entry_instance, uq_metric_entry_period.
-- Added constraint uq_metric_entry (metric_id, service_instance_id,
--   period_anchor) NULLS NOT DISTINCT — upsert target for the importer.
-- Writer must use onConflict: 'metric_id,service_instance_id,period_anchor'.
-- ============================================================
