-- ============================================================
-- Church Analytics — Period Stats
-- Migration: 0010_period_stats.sql
-- Generated: 2026-04-16
-- Adds per-day, per-week, per-month stat scope support.
-- ============================================================
-- Changes:
--   1. Extend stat_scope CHECK on response_categories
--   2. Create church_period_entries table (keyed by church + tag + category + period)
--   3. RLS policies mirroring response_entries
-- ============================================================


-- ============================================================
-- PART 1 — Extend stat_scope CHECK constraint
-- ============================================================

ALTER TABLE response_categories
  DROP CONSTRAINT chk_stat_scope;

ALTER TABLE response_categories
  ADD CONSTRAINT chk_stat_scope
  CHECK (stat_scope IN ('audience', 'service', 'day', 'week', 'month'));


-- ============================================================
-- PART 2 — Create church_period_entries
-- ============================================================
-- period_date semantics by entry_period_type:
--   'day'   → the service_date itself (YYYY-MM-DD)
--   'week'  → Monday of that ISO week (YYYY-MM-DD)
--   'month' → first day of the month (YYYY-MM-01)
--
-- service_tag_id ties entries to a tag for dashboard grouping.
-- D-050: last-write-wins — no locking needed.
-- ============================================================

CREATE TABLE church_period_entries (
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
-- PART 3 — RLS
-- ============================================================

ALTER TABLE church_period_entries ENABLE ROW LEVEL SECURITY;

-- Any active member of the church can read period entries
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

-- owner / admin / editor can write (insert, update, delete)
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
-- PART 4 — Indexes
-- ============================================================

CREATE INDEX idx_period_entries_church_tag
  ON church_period_entries (church_id, service_tag_id);

CREATE INDEX idx_period_entries_period_date
  ON church_period_entries (period_date);


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- response_categories.stat_scope now accepts: audience | service | day | week | month
-- New table: church_period_entries
--   Unique key: (church_id, service_tag_id, response_category_id, entry_period_type, period_date)
--   RLS: members read, editors write
-- ============================================================
