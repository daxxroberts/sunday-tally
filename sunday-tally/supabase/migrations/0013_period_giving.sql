-- ============================================================
-- Church Analytics — Period-Level Giving
-- Migration: 0013_period_giving.sql
-- Generated: 2026-04-26
-- Purpose: Stores church-wide weekly (or monthly) giving totals
--          that are NOT tied to any specific service occurrence.
--          Mirrors church_period_entries structure but holds
--          NUMERIC(12,2) amounts instead of INTEGER stat values.
-- ============================================================

CREATE TABLE church_period_giving (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id         UUID           NOT NULL REFERENCES churches(id)       ON DELETE RESTRICT,
  giving_source_id  UUID           NOT NULL REFERENCES giving_sources(id)  ON DELETE RESTRICT,
  entry_period_type TEXT           NOT NULL
                      CHECK (entry_period_type IN ('week', 'month')),
  period_date       DATE           NOT NULL,   -- Sunday of week or 1st of month (D-056)
  giving_amount     NUMERIC(12,2)  NOT NULL CHECK (giving_amount >= 0),
  submitted_by      UUID           REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT uq_period_giving
    UNIQUE (church_id, giving_source_id, entry_period_type, period_date)
);

CREATE TRIGGER set_updated_at_church_period_giving
  BEFORE UPDATE ON church_period_giving
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Primary access index: all queries filter by church + period type + date
CREATE INDEX idx_period_giving_church_period
  ON church_period_giving (church_id, entry_period_type, period_date);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE church_period_giving ENABLE ROW LEVEL SECURITY;

-- Any active church member can read their church's period giving
CREATE POLICY "period_giving_read"
  ON church_period_giving
  FOR SELECT
  TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

-- Owner / Admin / Editor can insert, update, delete
CREATE POLICY "period_giving_write"
  ON church_period_giving
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM church_memberships cm
      WHERE cm.user_id   = (SELECT auth.uid())
        AND cm.church_id = church_period_giving.church_id
        AND cm.is_active = true
        AND cm.role IN ('owner', 'admin', 'editor')
    )
  );
