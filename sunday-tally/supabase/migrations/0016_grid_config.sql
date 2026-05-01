-- ============================================================
-- Church Analytics — Grid Config Storage
-- Migration: 0016_grid_config.sql
-- Generated: 2026-04-30
-- ============================================================
-- Stores the dynamic History grid configuration per church as a
-- single JSONB document on the churches row.
--
-- Shape: GridConfig (see src/components/history-grid/grid-config-schema.ts)
--   - columns: tree of DataColumn | ColumnGroup
--   - serviceTemplates: per-template grid binding
--   - monthlyMetrics / weeklyMetrics / serviceMetrics / singleDayMetrics
--
-- Lifecycle:
--   1. New church → grid_config = NULL.
--   2. /services/history page renders. If null, derive from existing
--      schema (templates + categories + sources + tracking flags) and
--      persist back via UPDATE.
--   3. Stage B import refreshes grid_config at done.
--   4. Manual edits in Settings (T_TAGS, T6, T7, T8, T_GIVING_SOURCES)
--      may invalidate grid_config — re-derived on next History visit.
--
-- Storage choice: JSONB column (Q1 = A). Future versioning would
-- promote this to a dedicated table without changing the read path.
-- ============================================================

ALTER TABLE churches
  ADD COLUMN grid_config JSONB DEFAULT NULL;

COMMENT ON COLUMN churches.grid_config IS
  'Dynamic History grid configuration. Shape: GridConfig from src/components/history-grid/grid-config-schema.ts. NULL = derive from existing schema on next read.';
