-- ============================================================
-- Church Analytics — Reporting Views
-- Migration: 0025_views.sql
-- Purpose: Four read-side reporting views over the unified metric
--          schema (attendance / volunteers / giving / firehose),
--          plus a supporting index on metric_entries.metric_id.
-- Decisions: D-063..D-066
-- ============================================================
-- SECURITY: Every view is created WITH (security_invoker = true) so
--   the underlying tables' RLS (church isolation) is evaluated as the
--   querying user. Without this, a view runs as its owner and would
--   leak cross-church data. (Postgres 15+.)
-- AGGREGATION RULES (baked into the SQL — do not change):
--   * Only active instances: WHERE service_instances.status = 'active'.
--   * value NULL != 0 — never COALESCE value to 0. SUM ignores NULLs;
--     a FILTER that matches no rows yields NULL (correct = "not entered").
--   * N/A rows are excluded from aggregation: me.is_not_applicable = false.
-- ============================================================


-- ============================================================
-- PART A — Supporting index (FELIX follow-up)
-- Standalone index on metric_entries.metric_id for view joins.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_metric_entries_metric
  ON metric_entries (metric_id);


-- ============================================================
-- PART B — VIEW: attendance_per_occurrence
-- Every active service_instance gets a row; attendance pivoted by
-- ministry tag_role. LEFT JOINs so instances with no attendance still
-- appear with NULLs.
-- ============================================================
CREATE OR REPLACE VIEW attendance_per_occurrence WITH (security_invoker = true) AS
SELECT
  si.id                AS service_instance_id,
  si.church_id,
  si.service_template_id,
  si.service_date,
  SUM(me.value) FILTER (WHERE st.tag_role = 'ADULT_SERVICE')  AS adults_attendance,
  SUM(me.value) FILTER (WHERE st.tag_role = 'KIDS_MINISTRY')  AS kids_attendance,
  SUM(me.value) FILTER (WHERE st.tag_role = 'YOUTH_MINISTRY') AS youth_attendance,
  SUM(me.value) FILTER (WHERE st.tag_role = 'OTHER')          AS other_attendance,
  SUM(me.value)                                               AS total_attendance
FROM service_instances si
LEFT JOIN metric_entries me
  ON me.service_instance_id = si.id
 AND me.reporting_tag_code = 'ATTENDANCE'
 AND me.is_not_applicable = false
LEFT JOIN metrics m       ON m.id = me.metric_id
LEFT JOIN service_tags st ON st.id = m.ministry_tag_id
WHERE si.status = 'active'
GROUP BY si.id, si.church_id, si.service_template_id, si.service_date;


-- ============================================================
-- PART C — VIEW: volunteers_per_occurrence
-- Total volunteers per active service_instance.
-- ============================================================
CREATE OR REPLACE VIEW volunteers_per_occurrence WITH (security_invoker = true) AS
SELECT
  si.id AS service_instance_id,
  si.church_id,
  si.service_template_id,
  si.service_date,
  SUM(me.value) AS total_volunteers
FROM service_instances si
LEFT JOIN metric_entries me
  ON me.service_instance_id = si.id
 AND me.reporting_tag_code = 'VOLUNTEERS'
 AND me.is_not_applicable = false
WHERE si.status = 'active'
GROUP BY si.id, si.church_id, si.service_template_id, si.service_date;


-- ============================================================
-- PART D — VIEW: giving_per_week
-- Weekly giving, unioning period-scoped (period_anchor) and
-- instance-scoped entries. Instance-scoped entries roll service_date
-- back to the Sunday on/before via service_date - DOW (Sunday = 0).
-- ============================================================
CREATE OR REPLACE VIEW giving_per_week WITH (security_invoker = true) AS
SELECT church_id, week_start, SUM(value) AS total_giving
FROM (
  SELECT me.church_id, me.period_anchor AS week_start, me.value
  FROM metric_entries me
  WHERE me.reporting_tag_code = 'GIVING'
    AND me.period_anchor IS NOT NULL
    AND me.is_not_applicable = false
  UNION ALL
  SELECT si.church_id,
         (si.service_date - (EXTRACT(DOW FROM si.service_date)::int))::date AS week_start,
         me.value
  FROM metric_entries me
  JOIN service_instances si ON si.id = me.service_instance_id
  WHERE me.reporting_tag_code = 'GIVING'
    AND me.service_instance_id IS NOT NULL
    AND si.status = 'active'
    AND me.is_not_applicable = false
) g
GROUP BY church_id, week_start;


-- ============================================================
-- PART E — VIEW: metric_entries_readable
-- Firehose join. Includes si.status (instance_status) so consumers
-- can filter — status is NOT filtered here.
-- ============================================================
CREATE OR REPLACE VIEW metric_entries_readable WITH (security_invoker = true) AS
SELECT
  me.id,
  me.church_id,
  m.name        AS metric_name,
  mt.name       AS ministry_tag_name,
  mt.code       AS ministry_tag_code,
  mt.tag_role,
  rt.code       AS reporting_tag_code,
  rt.name       AS reporting_tag_name,
  rt.unit_kind,
  m.scope,
  m.is_canonical,
  me.service_instance_id,
  si.service_date,
  si.status     AS instance_status,
  me.period_anchor,
  COALESCE(si.service_date, me.period_anchor) AS effective_date,
  me.value,
  me.is_not_applicable,
  me.created_at,
  me.updated_at
FROM metric_entries me
JOIN metrics m         ON m.id = me.metric_id
JOIN service_tags mt   ON mt.id = m.ministry_tag_id
JOIN reporting_tags rt ON rt.id = m.reporting_tag_id
LEFT JOIN service_instances si ON si.id = me.service_instance_id;


-- ============================================================
-- PART F — Grants
-- security_invoker views still require SELECT to be granted to the
-- API role; RLS on the underlying tables then scopes the rows.
-- ============================================================
GRANT SELECT ON attendance_per_occurrence  TO authenticated;
GRANT SELECT ON volunteers_per_occurrence  TO authenticated;
GRANT SELECT ON giving_per_week            TO authenticated;
GRANT SELECT ON metric_entries_readable    TO authenticated;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New index:
--   idx_metric_entries_metric ON metric_entries (metric_id)
-- New views (all WITH security_invoker = true):
--   attendance_per_occurrence  — active instances, attendance pivoted
--                                by tag_role (adults/kids/youth/other/total)
--   volunteers_per_occurrence  — active instances, total volunteers
--   giving_per_week            — period + instance giving, anchored to
--                                Sunday-of-week (DOW, Sunday = 0)
--   metric_entries_readable    — firehose join (includes instance_status;
--                                status NOT filtered)
-- RLS: not enabled on views (N/A) — security_invoker delegates to the
--      underlying tables' church-isolation policies.
-- ============================================================
