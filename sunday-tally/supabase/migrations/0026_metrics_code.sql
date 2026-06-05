-- ============================================================
-- Church Analytics — metrics.code (stable identifier)
-- Migration: 0026_metrics_code.sql
-- Purpose: Give metrics a stable per-church code so the importer can
--          upsert idempotently and resolve metric_code -> id directly,
--          instead of matching on (ministry, reporting, name).
-- Decisions: D-071
-- ============================================================

ALTER TABLE metrics ADD COLUMN IF NOT EXISTS code TEXT;

-- Safety backfill (table is empty under the full reset, but guard anyway).
UPDATE metrics SET code = id::text WHERE code IS NULL;

ALTER TABLE metrics ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_metric_code') THEN
    ALTER TABLE metrics ADD CONSTRAINT uq_metric_code UNIQUE (church_id, code);
  END IF;
END $$;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Added: metrics.code TEXT NOT NULL + UNIQUE (church_id, code)
--   Importer upserts metrics on (church_id, code) and resolves
--   metric_code -> metric.id directly. Canonical uniqueness
--   (uq_metric_canonical) is unchanged and still independent.
-- ============================================================
