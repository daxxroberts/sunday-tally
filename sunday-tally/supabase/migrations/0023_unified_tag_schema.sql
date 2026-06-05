-- ============================================================
-- Church Analytics — Unified Tag Schema
-- Migration: 0023_unified_tag_schema.sql
-- Purpose: Move to the unified tag-first model — two tag axes
--          (ministry on service_tags + reporting_tags), one metrics
--          definition table, one metric_entries value table.
-- Decisions: D-059..D-070
-- ============================================================
-- NOTE ON service_tags COLUMN NAMES (D-069):
--   service_tags historically used tag_code / tag_name (from 0008).
--   This migration RENAMES them to code / name so both tag axes
--   (service_tags + reporting_tags) share one naming convention.
--   Safe under the full reset — every old consumer is already being
--   rebuilt against the new schema.
-- ============================================================


-- ============================================================
-- PART A — tag_role enum (ministry axis classification)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tag_role') THEN
    CREATE TYPE tag_role AS ENUM ('ADULT_SERVICE','KIDS_MINISTRY','YOUTH_MINISTRY','OTHER');
  END IF;
END $$;


-- ============================================================
-- PART B — Extend service_tags (ministry axis)
-- Existing columns (0008): church_id, tag_name, tag_code, is_custom,
--   display_order, is_active, effective_start_date, effective_end_date
-- ============================================================
-- Rename to the shared tag-axis convention (D-069). Plain RENAME (no
-- IF EXISTS) matches the 0019 convention; this migration runs once.
ALTER TABLE service_tags RENAME COLUMN tag_code TO code;
ALTER TABLE service_tags RENAME COLUMN tag_name TO name;

ALTER TABLE service_tags
  ADD COLUMN IF NOT EXISTS parent_tag_id UUID REFERENCES service_tags(id) ON DELETE SET NULL;

ALTER TABLE service_tags
  ADD COLUMN IF NOT EXISTS tag_role tag_role NOT NULL DEFAULT 'OTHER';

-- Dated subtags removed in v2.
ALTER TABLE service_tags DROP COLUMN IF EXISTS effective_start_date;
ALTER TABLE service_tags DROP COLUMN IF EXISTS effective_end_date;


-- ============================================================
-- PART C — reporting_tags (reporting axis)
-- ============================================================
CREATE TABLE IF NOT EXISTS reporting_tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  code        TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  unit_kind   TEXT        NOT NULL CHECK (unit_kind IN ('count', 'currency')),
  agg_default TEXT        NOT NULL DEFAULT 'sum' CHECK (agg_default IN ('sum', 'avg')),
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_reporting_tag UNIQUE (church_id, code)
);

CREATE TRIGGER set_updated_at_reporting_tags
  BEFORE UPDATE ON reporting_tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE reporting_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reporting_tags_church_isolation"
  ON reporting_tags
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- PART D — service_templates.primary_tag_id
-- Added in 0009 — verified present. No action needed.
-- ============================================================


-- ============================================================
-- PART E — metrics (definition: ministry axis × reporting axis)
-- ============================================================
CREATE TABLE IF NOT EXISTS metrics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  ministry_tag_id UUID        NOT NULL REFERENCES service_tags(id) ON DELETE CASCADE,
  reporting_tag_id UUID       NOT NULL REFERENCES reporting_tags(id) ON DELETE RESTRICT,
  scope           TEXT        NOT NULL CHECK (scope IN ('instance', 'period')),
  is_canonical    BOOLEAN     NOT NULL DEFAULT false,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_metrics
  BEFORE UPDATE ON metrics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One canonical metric per (church, ministry, reporting) combination.
CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_canonical
  ON metrics (church_id, ministry_tag_id, reporting_tag_id)
  WHERE is_canonical;

ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metrics_church_isolation"
  ON metrics
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- PART F — metric_entries (value table)
-- Attaches to EITHER a service_instance OR a period_anchor (XOR).
-- ============================================================
CREATE TABLE IF NOT EXISTS metric_entries (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID          NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  metric_id           UUID          NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  service_instance_id UUID          REFERENCES service_instances(id) ON DELETE CASCADE,
  period_anchor       DATE,
  value               NUMERIC(14, 2),  -- NULL = not entered
  is_not_applicable   BOOLEAN       NOT NULL DEFAULT false,
  reporting_tag_code  TEXT,            -- denormalized; populated by trigger (PART G)
  created_by          UUID          REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- XOR attachment: exactly one of instance / period.
  CONSTRAINT chk_metric_entry_attachment CHECK (
    (service_instance_id IS NOT NULL AND period_anchor IS NULL) OR
    (service_instance_id IS NULL AND period_anchor IS NOT NULL)
  )
);

CREATE TRIGGER set_updated_at_metric_entries
  BEFORE UPDATE ON metric_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One entry per metric per instance / per period.
CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_entry_instance
  ON metric_entries (metric_id, service_instance_id)
  WHERE service_instance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_entry_period
  ON metric_entries (metric_id, period_anchor)
  WHERE period_anchor IS NOT NULL;

-- Helpful access indexes.
CREATE INDEX IF NOT EXISTS idx_metric_entries_church_reporting
  ON metric_entries (church_id, reporting_tag_code);

CREATE INDEX IF NOT EXISTS idx_metric_entries_instance
  ON metric_entries (service_instance_id);

ALTER TABLE metric_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metric_entries_church_isolation"
  ON metric_entries
  FOR ALL
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));


-- ============================================================
-- PART G — Denormalize reporting_tag_code onto metric_entries
-- BEFORE INSERT OR UPDATE: set NEW.reporting_tag_code from the
-- reporting_tags.code reached via metrics on NEW.metric_id.
-- ============================================================
CREATE OR REPLACE FUNCTION set_metric_entry_reporting_tag_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT rt.code
    INTO NEW.reporting_tag_code
  FROM metrics m
  JOIN reporting_tags rt ON rt.id = m.reporting_tag_id
  WHERE m.id = NEW.metric_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_metric_entry_reporting_tag_code
  BEFORE INSERT OR UPDATE ON metric_entries
  FOR EACH ROW EXECUTE FUNCTION set_metric_entry_reporting_tag_code();


-- ============================================================
-- PART H — Enforce is_system immutability on reporting_tags
-- System reporting tags cannot be edited or deleted.
-- ============================================================
CREATE OR REPLACE FUNCTION protect_system_reporting_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'System reporting tag % cannot be edited or deleted.', OLD.code
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_system_reporting_tags
  BEFORE UPDATE OR DELETE ON reporting_tags
  FOR EACH ROW EXECUTE FUNCTION protect_system_reporting_tags();


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New type:    tag_role
-- New tables:  reporting_tags, metrics, metric_entries (RLS + isolation)
-- Altered:     service_tags (rename tag_code->code, tag_name->name;
--                            + parent_tag_id, + tag_role;
--                            - effective_start_date, - effective_end_date)
-- New triggers (data):
--   set_updated_at on reporting_tags, metrics, metric_entries
--   trg_set_metric_entry_reporting_tag_code (denormalize code)
--   trg_protect_system_reporting_tags (is_system immutability)
-- New functions:
--   set_metric_entry_reporting_tag_code(), protect_system_reporting_tags()
-- Partial unique indexes:
--   uq_metric_canonical, uq_metric_entry_instance, uq_metric_entry_period
-- ============================================================
