-- ============================================================
-- Migration 0035 — expose location_id on reporting views  (APPLIED 2026-06-09)
-- ============================================================
-- WHY: the AI-widget dashboard scopes every widget to the signed-in user's
-- campus (church_memberships.default_location_id, D-088) and lets the user filter
-- by campus. The per-occurrence views + firehose did not expose location, so the
-- compiler could not filter by it.
--
-- WHAT: re-defines 3 existing security_invoker views, APPENDING location_id (a
-- new view column must go at the END so CREATE OR REPLACE is allowed — Postgres
-- cannot insert/rename mid-list. The compiler selects/filters by NAME, so the
-- column position does not matter).
--   attendance_per_occurrence  + si.location_id
--   volunteers_per_occurrence  + si.location_id
--   metric_entries_readable    + me.location_id  (denormalized per D-087)
-- giving_per_week stays church-wide (D-086) — campus does not apply to giving.
--
-- All views keep WITH (security_invoker = true); table RLS (church isolation)
-- unchanged. Applied to production iwbrzdiubrvogiamoqvx with explicit Builder
-- authorization. No tables/data changed; reversible by re-applying 0025.
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
  SUM(me.value)                                               AS total_attendance,
  si.location_id
FROM service_instances si
LEFT JOIN metric_entries me
  ON me.service_instance_id = si.id
 AND me.reporting_tag_code = 'ATTENDANCE'
 AND me.is_not_applicable = false
LEFT JOIN metrics m       ON m.id = me.metric_id
LEFT JOIN service_tags st ON st.id = m.ministry_tag_id
WHERE si.status = 'active'
GROUP BY si.id, si.church_id, si.service_template_id, si.service_date, si.location_id;

CREATE OR REPLACE VIEW volunteers_per_occurrence WITH (security_invoker = true) AS
SELECT
  si.id AS service_instance_id,
  si.church_id,
  si.service_template_id,
  si.service_date,
  SUM(me.value) AS total_volunteers,
  si.location_id
FROM service_instances si
LEFT JOIN metric_entries me
  ON me.service_instance_id = si.id
 AND me.reporting_tag_code = 'VOLUNTEERS'
 AND me.is_not_applicable = false
WHERE si.status = 'active'
GROUP BY si.id, si.church_id, si.service_template_id, si.service_date, si.location_id;

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
  me.updated_at,
  me.location_id
FROM metric_entries me
JOIN metrics m         ON m.id = me.metric_id
JOIN service_tags mt   ON mt.id = m.ministry_tag_id
JOIN reporting_tags rt ON rt.id = m.reporting_tag_id
LEFT JOIN service_instances si ON si.id = me.service_instance_id;

GRANT SELECT ON attendance_per_occurrence TO authenticated;
GRANT SELECT ON volunteers_per_occurrence TO authenticated;
GRANT SELECT ON metric_entries_readable   TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE — 3 views re-defined with appended location_id; giving
-- stays church-wide; no tables/data changed.
-- ============================================================
