-- ============================================================
-- Migration 0033 — AI widgets
-- STATUS: APPLIED — verified in supabase_migrations.schema_migrations on 2026-06-15. (Header previously marked NEEDS-APPROVAL in error; do not re-apply.)
-- ============================================================
-- Decisions D-100..D-106 (see CONCEPT_AI_WIDGETS.md).
-- Additive: 3 new tables, no god-node change (does NOT alter
--   service_instances / service_templates / metric_entries).
-- ============================================================
-- WHY
-- CONCEPT_AI_WIDGETS.md §6: the AI builds a chart/grid/metric widget,
-- saves it to a draggable dashboard grid, and on every future load the
-- stored query_spec is replayed deterministically with zero AI spend.
-- A widget is a REUSABLE library entity that can appear on multiple
-- dashboards, so its DEFINITION (widgets) is separated from its
-- PLACEMENT (dashboard_widgets). Dashboards (the canvas) may be
-- church-wide-shared OR per-user-private.
--
-- WHAT (3 new tables + RLS + 1 seed function)
--  1. widgets            — the reusable definition (the library).
--  2. dashboards         — a named canvas (church-wide or per-user).
--  3. dashboard_widgets  — placement junction (which widget sits where).
--  4. seed_starter_widgets(p_church_id) — defines (does NOT call) the
--     is_starter church-scope seed set. Apply-time/gated backfill only.
--
-- ISOLATION & ROLE MODEL (mirrors 0029 / 0032; CONCEPT §5/§6)
--  - SELECT: church-isolation (church_id IN get_user_church_ids()) AND
--    (scope='church' visible to all members OR scope='user' only the owner).
--  - WRITE (INSERT/UPDATE/DELETE): church-isolation AND
--      (scope='church' AND get_user_role(church_id) IN
--           ('owner','admin','editor'))     -- "editor+" (see FLAG below)
--    OR (scope='user' AND owner_user_id = auth.uid()).
--  - dashboard_widgets inherits the parent dashboard's visibility/edit
--    rights via EXISTS against dashboards.
--
-- Depends on get_user_church_ids() (0001), get_user_role(uuid) (0029),
-- and the shared set_updated_at() trigger fn (0001). gen_random_uuid()
-- per the 0023 convention. Every WITH CHECK re-asserts church + scope.
-- DOES NOT touch data. Apply only after review.
--
-- IDEMPOTENCY: matches the 0029/0032 convention — CREATE TABLE / INDEX /
-- TRIGGER are IF-NOT-EXISTS-guarded; policy CREATEs are first-apply-only
-- (the migration ledger prevents re-run). If ever re-run by hand, add a
-- `DROP POLICY IF EXISTS "<name>" ON <table>;` before each CREATE POLICY
-- (same residual noted for 0029 under D-098).
--
-- FLAG — church-scope WRITE ROLE (for the Builder to confirm):
--   CONCEPT §6 says managers "(editor+)" edit church dashboards, but the
--   live is_church_manager() = owner/admin ONLY. To honor "editor+" this
--   migration uses get_user_role(church_id) IN ('owner','admin','editor')
--   for church-scope writes (the same editor-and-above pattern 0032 uses
--   for service_instances / metric_entries). If church dashboards/widgets
--   should be OWNER/ADMIN-only app-config instead, swap those three
--   church-scope WITH CHECK / USING predicates to is_church_manager(church_id).
-- ============================================================


-- ============================================================
-- PART A — widgets (the reusable definition / library)
-- ============================================================
CREATE TABLE IF NOT EXISTS widgets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  scope         TEXT        NOT NULL CHECK (scope IN ('church', 'user')),
  owner_user_id UUID        REFERENCES auth.users(id),
  title         TEXT        NOT NULL,
  kind          TEXT        NOT NULL CHECK (kind IN ('line', 'bar', 'area', 'grid', 'pivot', 'metric_card')),
  query_kind    TEXT        NOT NULL DEFAULT 'spec' CHECK (query_kind IN ('spec', 'sql')),
  query_spec    JSONB       NOT NULL,
  viz_config    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  explainer     JSONB,
  is_starter    BOOLEAN     NOT NULL DEFAULT false,
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  -- scope ⇔ owner_user_id coupling: user-scope rows are owned; church-scope
  -- rows are unowned (visible to all members).
  CONSTRAINT chk_widgets_scope_owner CHECK (
    (scope = 'user'   AND owner_user_id IS NOT NULL) OR
    (scope = 'church' AND owner_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_widgets_church
  ON widgets (church_id);

CREATE INDEX IF NOT EXISTS idx_widgets_church_scope
  ON widgets (church_id, scope);

CREATE TRIGGER set_updated_at_widgets
  BEFORE UPDATE ON widgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;

-- Read: church-scope rows for any member of the church; user-scope rows
-- only for their owner.
CREATE POLICY "widgets_select" ON widgets
  FOR SELECT TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND (scope = 'church' OR owner_user_id = (SELECT auth.uid()))
  );

-- Insert: church-scope → editor+ (see FLAG); user-scope → owner only.
CREATE POLICY "widgets_insert" ON widgets
  FOR INSERT TO authenticated
  WITH CHECK (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  );

-- Update: same authority on the existing row (USING) and the new row (CHECK).
CREATE POLICY "widgets_update" ON widgets
  FOR UPDATE TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "widgets_delete" ON widgets
  FOR DELETE TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  );


-- ============================================================
-- PART B — dashboards (a named canvas)
-- ============================================================
CREATE TABLE IF NOT EXISTS dashboards (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  owner_user_id UUID        REFERENCES auth.users(id),
  name          TEXT        NOT NULL,
  scope         TEXT        NOT NULL CHECK (scope IN ('church', 'user')),
  breakpoints   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT chk_dashboards_scope_owner CHECK (
    (scope = 'user'   AND owner_user_id IS NOT NULL) OR
    (scope = 'church' AND owner_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dashboards_church
  ON dashboards (church_id);

CREATE INDEX IF NOT EXISTS idx_dashboards_church_scope
  ON dashboards (church_id, scope);

CREATE TRIGGER set_updated_at_dashboards
  BEFORE UPDATE ON dashboards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboards_select" ON dashboards
  FOR SELECT TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND (scope = 'church' OR owner_user_id = (SELECT auth.uid()))
  );

CREATE POLICY "dashboards_insert" ON dashboards
  FOR INSERT TO authenticated
  WITH CHECK (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "dashboards_update" ON dashboards
  FOR UPDATE TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "dashboards_delete" ON dashboards
  FOR DELETE TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND (
      (scope = 'church' AND get_user_role(church_id) IN ('owner', 'admin', 'editor'))
      OR
      (scope = 'user' AND owner_user_id = (SELECT auth.uid()))
    )
  );


-- ============================================================
-- PART C — dashboard_widgets (placement junction)
-- ============================================================
-- One row = one placement of a widget on a dashboard. layout holds the
-- grid cell ({ x, y, w, h } per responsive breakpoint). The same widget
-- may sit on many dashboards, each with its own layout. church_id is
-- carried for isolation symmetry; edit rights inherit from the parent
-- dashboard (EXISTS below), so dashboard_widgets has no scope of its own.
-- ============================================================
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  dashboard_id UUID        NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  widget_id    UUID        NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
  layout       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_dashboard_widget UNIQUE (dashboard_id, widget_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_church
  ON dashboard_widgets (church_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard
  ON dashboard_widgets (dashboard_id);

ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

-- Read: visible iff the parent dashboard is visible to the caller.
CREATE POLICY "dashboard_widgets_select" ON dashboard_widgets
  FOR SELECT TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND EXISTS (
      SELECT 1 FROM dashboards d
      WHERE d.id = dashboard_widgets.dashboard_id
        AND d.church_id IN (SELECT get_user_church_ids())
        AND (d.scope = 'church' OR d.owner_user_id = (SELECT auth.uid()))
    )
  );

-- Write: permitted iff the parent dashboard is WRITABLE by the caller
-- (church-scope → editor+ ; user-scope → owner). Placement inherits the
-- dashboard's edit rights (CONCEPT §6).
CREATE POLICY "dashboard_widgets_insert" ON dashboard_widgets
  FOR INSERT TO authenticated
  WITH CHECK (
    church_id IN (SELECT get_user_church_ids())
    AND EXISTS (
      SELECT 1 FROM dashboards d
      WHERE d.id = dashboard_widgets.dashboard_id
        AND d.church_id IN (SELECT get_user_church_ids())
        AND (
          (d.scope = 'church' AND get_user_role(d.church_id) IN ('owner', 'admin', 'editor'))
          OR
          (d.scope = 'user' AND d.owner_user_id = (SELECT auth.uid()))
        )
    )
  );

CREATE POLICY "dashboard_widgets_update" ON dashboard_widgets
  FOR UPDATE TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND EXISTS (
      SELECT 1 FROM dashboards d
      WHERE d.id = dashboard_widgets.dashboard_id
        AND d.church_id IN (SELECT get_user_church_ids())
        AND (
          (d.scope = 'church' AND get_user_role(d.church_id) IN ('owner', 'admin', 'editor'))
          OR
          (d.scope = 'user' AND d.owner_user_id = (SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    church_id IN (SELECT get_user_church_ids())
    AND EXISTS (
      SELECT 1 FROM dashboards d
      WHERE d.id = dashboard_widgets.dashboard_id
        AND d.church_id IN (SELECT get_user_church_ids())
        AND (
          (d.scope = 'church' AND get_user_role(d.church_id) IN ('owner', 'admin', 'editor'))
          OR
          (d.scope = 'user' AND d.owner_user_id = (SELECT auth.uid()))
        )
    )
  );

CREATE POLICY "dashboard_widgets_delete" ON dashboard_widgets
  FOR DELETE TO authenticated
  USING (
    church_id IN (SELECT get_user_church_ids())
    AND EXISTS (
      SELECT 1 FROM dashboards d
      WHERE d.id = dashboard_widgets.dashboard_id
        AND d.church_id IN (SELECT get_user_church_ids())
        AND (
          (d.scope = 'church' AND get_user_role(d.church_id) IN ('owner', 'admin', 'editor'))
          OR
          (d.scope = 'user' AND d.owner_user_id = (SELECT auth.uid()))
        )
    )
  );


-- ============================================================
-- PART D — seed_starter_widgets(p_church_id)
-- ============================================================
-- Inserts the is_starter=true, scope='church' starter library for a
-- church: attendance line, giving bar, volunteer pivot, and two KPI
-- metric_cards (avg weekly attendance; volunteers-to-attendance %).
-- Each query_spec matches the CONCEPT §3 DSL (version 1, source = an
-- existing security_invoker view, relative date windows, STABLE codes).
--
-- DEFINITION ONLY — this function is NOT called here. Backfilling
-- starter widgets for existing churches, and wiring it into signup
-- provisioning (alongside seed_system_reporting_tags), is an apply-time,
-- BOT-gated step — NOT part of this migration.
--
-- Idempotent on re-call: ON CONFLICT DO NOTHING against a partial unique
-- index on the starter set (one row per church per starter title).
-- ============================================================

-- One starter widget per (church, title). Scoped to is_starter so it
-- never constrains AI-built or user widgets.
CREATE UNIQUE INDEX IF NOT EXISTS uq_widget_starter_title
  ON widgets (church_id, title)
  WHERE is_starter;

CREATE OR REPLACE FUNCTION seed_starter_widgets(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO widgets
    (church_id, scope, owner_user_id, title, kind, query_kind, query_spec, viz_config, is_starter)
  VALUES
    -- 1) Attendance — line, trailing 12 months, monthly buckets, summed.
    (p_church_id, 'church', NULL,
     'Attendance trend', 'line', 'spec',
     jsonb_build_object(
       'version', 1,
       'source',  'attendance_per_occurrence',
       'measure', jsonb_build_object('reporting_tag_code', 'ATTENDANCE', 'agg', 'sum'),
       'dimensions', jsonb_build_array(
         jsonb_build_object('field', 'time', 'bucket', 'month')
       ),
       'filters', jsonb_build_object(
         'date', jsonb_build_object(
           'window', 'trailing', 'count', 12, 'unit', 'month', 'anchor', 'today'
         )
       ),
       'viz', jsonb_build_object(
         'kind', 'line', 'xKey', 'month', 'yKeys', jsonb_build_array('total_attendance'),
         'title', 'Attendance trend'
       )
     ),
     '{}'::jsonb, true),

    -- 2) Giving — bar, trailing 12 months, monthly buckets, summed.
    (p_church_id, 'church', NULL,
     'Giving by month', 'bar', 'spec',
     jsonb_build_object(
       'version', 1,
       'source',  'giving_per_week',
       'measure', jsonb_build_object('reporting_tag_code', 'GIVING', 'agg', 'sum'),
       'dimensions', jsonb_build_array(
         jsonb_build_object('field', 'time', 'bucket', 'month')
       ),
       'filters', jsonb_build_object(
         'date', jsonb_build_object(
           'window', 'trailing', 'count', 12, 'unit', 'month', 'anchor', 'today'
         )
       ),
       'viz', jsonb_build_object(
         'kind', 'bar', 'xKey', 'month', 'yKeys', jsonb_build_array('total_giving'),
         'title', 'Giving by month'
       )
     ),
     '{}'::jsonb, true),

    -- 3) Volunteers — pivot (two dimensions: time × ministry), trailing 12 months.
    (p_church_id, 'church', NULL,
     'Volunteers by ministry', 'pivot', 'spec',
     jsonb_build_object(
       'version', 1,
       'source',  'metric_entries_readable',
       'measure', jsonb_build_object('reporting_tag_code', 'VOLUNTEERS', 'agg', 'sum'),
       'dimensions', jsonb_build_array(
         jsonb_build_object('field', 'time', 'bucket', 'month'),
         jsonb_build_object('field', 'ministry_tag', 'by', 'code')
       ),
       'filters', jsonb_build_object(
         'date', jsonb_build_object(
           'window', 'trailing', 'count', 12, 'unit', 'month', 'anchor', 'today'
         )
       ),
       'viz', jsonb_build_object(
         'kind', 'pivot', 'xKey', 'month', 'yKeys', jsonb_build_array('total_volunteers'),
         'title', 'Volunteers by ministry'
       )
     ),
     '{}'::jsonb, true),

    -- 4) KPI — average weekly attendance (avg agg, current YTD).
    (p_church_id, 'church', NULL,
     'Avg weekly attendance', 'metric_card', 'spec',
     jsonb_build_object(
       'version', 1,
       'source',  'attendance_per_occurrence',
       'measure', jsonb_build_object('reporting_tag_code', 'ATTENDANCE', 'agg', 'weekly_avg'),
       'dimensions', jsonb_build_array(),
       'filters', jsonb_build_object(
         'date', jsonb_build_object('window', 'ytd', 'anchor', 'today')
       ),
       'viz', jsonb_build_object(
         'kind', 'metric_card', 'yKeys', jsonb_build_array('total_attendance'),
         'title', 'Avg weekly attendance'
       )
     ),
     '{}'::jsonb, true),

    -- 5) KPI — volunteers-to-attendance % (ratio measure, YTD).
    (p_church_id, 'church', NULL,
     'Volunteers to attendance', 'metric_card', 'spec',
     jsonb_build_object(
       'version', 1,
       'source',  'metric_entries_readable',
       'measure', jsonb_build_object('reporting_tag_code', 'VOLUNTEERS', 'agg', 'sum'),
       'dimensions', jsonb_build_array(),
       'filters', jsonb_build_object(
         'date', jsonb_build_object('window', 'ytd', 'anchor', 'today')
       ),
       'ratio', jsonb_build_object(
         'numerator',   jsonb_build_object('reporting_tag_code', 'VOLUNTEERS', 'agg', 'sum'),
         'denominator', jsonb_build_object('reporting_tag_code', 'ATTENDANCE', 'agg', 'sum'),
         'scale', 100
       ),
       'viz', jsonb_build_object(
         'kind', 'metric_card', 'yKeys', jsonb_build_array('ratio'),
         'title', 'Volunteers to attendance'
       )
     ),
     '{}'::jsonb, true)
  ON CONFLICT (church_id, title) WHERE is_starter DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_starter_widgets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_starter_widgets(UUID) TO authenticated;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New tables (RLS enabled; church-isolation + scope/role policies):
--   widgets            — reusable widget definitions (library)
--   dashboards         — named canvases (church-wide or per-user)
--   dashboard_widgets  — placement junction (UNIQUE(dashboard_id, widget_id))
-- New indexes:
--   idx_widgets_church, idx_widgets_church_scope,
--   idx_dashboards_church, idx_dashboards_church_scope,
--   idx_dashboard_widgets_church, idx_dashboard_widgets_dashboard,
--   uq_widget_starter_title (partial, WHERE is_starter)
-- New triggers (data): set_updated_at_widgets, set_updated_at_dashboards
--   (reuse the shared set_updated_at() fn).
-- New function: seed_starter_widgets(UUID) — DEFINED only, NOT called.
--   GRANT EXECUTE to authenticated, REVOKE from PUBLIC.
-- No god-node change; no data touched. Review, then apply_migration.
-- ============================================================
