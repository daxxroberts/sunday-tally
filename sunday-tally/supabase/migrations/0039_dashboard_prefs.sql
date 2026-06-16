-- ============================================================
-- Migration 0039 — split dashboard prefs out of grid_config
-- STATUS: APPLIED — verified in supabase_migrations.schema_migrations on 2026-06-15. (Header previously marked NEEDS-APPROVAL in error; do not re-apply.)
-- Dependencies: none. App code (P2) ships read-fallback FIRST, so
-- either DB state stays green.
-- ============================================================
-- WHY (the "History out of whack" footgun): churches.grid_config holds
-- BOTH the History grid column structure AND the dashboard prefs
-- (keyMetrics / excludedTotalMinistries). A prefs-only save produced a
-- non-null, column-less grid_config that defeated History's "re-derive
-- when empty" heuristic. Prefs move to their own column; grid_config
-- goes back to meaning ONLY the History grid.
--
-- Writes ride the churches UPDATE policy from 0031 (VERIFIED APPLIED
-- 2026-06-09 — migration 20260607022305).
-- ============================================================

ALTER TABLE churches ADD COLUMN IF NOT EXISTS dashboard_prefs JSONB;

-- Backfill: lift the three pref keys out of grid_config (only where present).
-- (keyMetrics + keyMetricTargets from the Key Metrics lane #70,
--  excludedTotalMinistries from include-in-total E-12/E-22.)
UPDATE churches
SET dashboard_prefs = jsonb_strip_nulls(jsonb_build_object(
      'keyMetrics',               grid_config->'keyMetrics',
      'keyMetricTargets',         grid_config->'keyMetricTargets',
      'excludedTotalMinistries',  grid_config->'excludedTotalMinistries'))
WHERE grid_config ?| ARRAY['keyMetrics','keyMetricTargets','excludedTotalMinistries']
  AND dashboard_prefs IS NULL;

-- Strip the pref keys from grid_config so it is columns-only again.
UPDATE churches
SET grid_config = grid_config - 'keyMetrics' - 'keyMetricTargets' - 'excludedTotalMinistries'
WHERE grid_config ?| ARRAY['keyMetrics','keyMetricTargets','excludedTotalMinistries'];

-- Normalize: a grid_config left as '{}' means "nothing stored" → NULL,
-- so History's storedHasGrid guard re-derives cleanly.
UPDATE churches SET grid_config = NULL
WHERE grid_config IS NOT NULL AND grid_config = '{}'::jsonb;

-- ============================================================
-- MIGRATION COMPLETE — prefs preserved in dashboard_prefs; grid_config
-- columns-only; no policy changes (0031 covers UPDATE).
-- ============================================================
