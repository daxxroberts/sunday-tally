-- ============================================================
-- Church Analytics — Period Stats (idempotent fix run)
-- Migration: 0010_period_stats_fix.sql
-- Run this if 0010_period_stats.sql errored on "already exists".
-- Safe to run multiple times — all operations use IF NOT EXISTS
-- or DROP IF EXISTS guards.
-- ============================================================


-- ============================================================
-- PART 1 — Extend stat_scope CHECK constraint (idempotent)
-- ============================================================

ALTER TABLE response_categories
  DROP CONSTRAINT IF EXISTS chk_stat_scope;

ALTER TABLE response_categories
  ADD CONSTRAINT chk_stat_scope
  CHECK (stat_scope IN ('audience', 'service', 'day', 'week', 'month'));


-- ============================================================
-- PART 2 — Ensure church_period_entries exists
-- ============================================================

CREATE TABLE IF NOT EXISTS church_period_entries (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id            UUID        NOT NULL REFERENCES churches(id)            ON DELETE CASCADE,
  service_tag_id       UUID        NOT NULL REFERENCES service_tags(id)        ON DELETE CASCADE,
  response_category_id UUID        NOT NULL REFERENCES response_categories(id) ON DELETE CASCADE,
  entry_period_type    TEXT        NOT NULL,
  period_date          DATE        NOT NULL,
  stat_value           INTEGER,
  is_not_applicable    BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_period_type CHECK (entry_period_type IN ('day', 'week', 'month')),
  CONSTRAINT uq_period_entry  UNIQUE (church_id, service_tag_id, response_category_id, entry_period_type, period_date)
);


-- ============================================================
-- PART 3 — RLS (idempotent)
-- ============================================================

ALTER TABLE church_period_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "church_members_select_period_entries" ON church_period_entries;
CREATE POLICY "church_members_select_period_entries"
  ON church_period_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM church_memberships cm
      WHERE cm.church_id = church_period_entries.church_id
        AND cm.user_id   = auth.uid()
        AND cm.is_active = true
    )
  );

DROP POLICY IF EXISTS "editors_write_period_entries" ON church_period_entries;
CREATE POLICY "editors_write_period_entries"
  ON church_period_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM church_memberships cm
      WHERE cm.church_id = church_period_entries.church_id
        AND cm.user_id   = auth.uid()
        AND cm.is_active = true
        AND cm.role IN ('owner', 'admin', 'editor')
    )
  );


-- ============================================================
-- PART 4 — Indexes (idempotent)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_period_entries_church_tag
  ON church_period_entries (church_id, service_tag_id);

CREATE INDEX IF NOT EXISTS idx_period_entries_period_date
  ON church_period_entries (period_date);


-- ============================================================
-- DONE
-- response_categories.stat_scope: audience | service | day | week | month
-- church_period_entries: ready with RLS + indexes
-- ============================================================
