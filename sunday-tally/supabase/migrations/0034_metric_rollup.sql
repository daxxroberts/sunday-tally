-- ============================================================
-- 0034 — Metric roll-up (explicit child→parent)  (NEEDS-APPROVAL — NOT APPLIED)
-- ============================================================
-- WHY
-- The "What we track" overhaul lets a parent node hold a ROLL-UP metric whose
-- value is the aggregate (sum/avg/max) of the matching metrics on its descendant
-- groups. Children opt in EXPLICITLY: an entry metric names the parent roll-up it
-- feeds (parent_metric_id). This avoids blind Kind-summing (you never add
-- "cars in the lot" to "baptisms") — the child points up by name/choice.
--
-- Model (Builder, confirmed 2026-06-08):
--   • mode = 'entry'  — a number typed at this node; MAY point up to a roll-up.
--   • mode = 'rollup' — lives on a parent; value computed from children that
--                       point at it; defines only an operation (rollup_op).
--   • A child may only point to a roll-up on one of its ANCESTOR nodes, of the
--     SAME Kind (reporting_tag). Those two guardrails need a parent_tag_id walk,
--     so they are enforced SERVER-SIDE in settings/track/actions.ts, NOT in SQL.
--
-- WHAT — additive only. Three nullable/defaulted columns on `metrics`:
--   • mode              TEXT NOT NULL DEFAULT 'entry'  ('entry'|'rollup')
--   • rollup_op         TEXT                            ('sum'|'avg'|'max')
--   • parent_metric_id  UUID  → metrics(id) ON DELETE SET NULL
-- Existing rows backfill to mode='entry' via the DEFAULT. No data is rewritten.
--
-- PHASE: this is Phase A (schema only). The actual roll-up SUMMATION (History,
-- dashboard, entry) is Phase B and ships in a later migration/code change.
--
-- COORDINATION: a separate chat owns 0032 (service-graph RLS, already in repo as
-- a file) and #79 (owner/admin write RLS on service_tags + metrics — NOT yet
-- written). 0034 only ALTERs metrics columns; it is independent of those RLS
-- policies. If #79 later adds a FOR-ALL owner/admin write policy on metrics, the
-- new columns are already covered (no per-column policy needed).
--
-- Idempotent (IF NOT EXISTS / drop-before-add on constraints). DOES NOT touch
-- data beyond the implicit DEFAULT backfill. Apply only after review.
-- ============================================================

ALTER TABLE metrics
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'entry',
  ADD COLUMN IF NOT EXISTS rollup_op TEXT,
  ADD COLUMN IF NOT EXISTS parent_metric_id UUID REFERENCES metrics(id) ON DELETE SET NULL;

-- mode must be one of the two known values
ALTER TABLE metrics DROP CONSTRAINT IF EXISTS chk_metric_mode;
ALTER TABLE metrics ADD CONSTRAINT chk_metric_mode
  CHECK (mode IN ('entry', 'rollup'));

-- rollup_op present iff mode='rollup'; one of sum/avg/max
ALTER TABLE metrics DROP CONSTRAINT IF EXISTS chk_metric_rollup_op;
ALTER TABLE metrics ADD CONSTRAINT chk_metric_rollup_op CHECK (
  (mode = 'rollup' AND rollup_op IN ('sum', 'avg', 'max')) OR
  (mode = 'entry'  AND rollup_op IS NULL)
);

-- only an entry metric may point up to a parent roll-up
ALTER TABLE metrics DROP CONSTRAINT IF EXISTS chk_metric_parent_entry_only;
ALTER TABLE metrics ADD CONSTRAINT chk_metric_parent_entry_only CHECK (
  parent_metric_id IS NULL OR mode = 'entry'
);

-- a metric cannot point at itself
ALTER TABLE metrics DROP CONSTRAINT IF EXISTS chk_metric_parent_not_self;
ALTER TABLE metrics ADD CONSTRAINT chk_metric_parent_not_self CHECK (
  parent_metric_id IS NULL OR parent_metric_id <> id
);

-- fast lookup of "who points at this roll-up" (unreferenced-rollup check + Phase B)
CREATE INDEX IF NOT EXISTS idx_metrics_parent_metric
  ON metrics (parent_metric_id) WHERE parent_metric_id IS NOT NULL;

-- ============================================================
-- END 0034 — review, then apply_migration. After apply: regenerate Supabase
-- types so `metrics` exposes mode / rollup_op / parent_metric_id.
-- ============================================================
