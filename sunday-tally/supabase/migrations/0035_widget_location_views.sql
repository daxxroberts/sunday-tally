-- ============================================================
-- Migration 0035 — expose location_id on reporting views  (NEEDS-APPROVAL)
-- ============================================================
-- WHY: the AI-widget dashboard scopes every widget to the signed-in user's
-- campus (church_memberships.default_location_id, D-088), and lets the user
-- filter by campus. The per-occurrence views and the firehose did not expose
-- location, so the compiler could not filter by it. This adds location_id —
-- additive, CREATE OR REPLACE only (no data change, no new tables).
--
-- WHAT (re-defines 3 existing security_invoker views, adds one column each):
--   attendance_per_occurrence  + si.location_id  (the occurrence's campus)
--   volunteers_per_occurrence  + si.location_id
--   metric_entries_readable    + me.location_id  (denormalized per D-087:
--      instance entries get si.location_id via trigger; period entries set it
--      explicitly or NULL = church-wide)
-- giving_per_week is intentionally left church-wide (D-086: church-wide period
--   giving has no campus axis) — campus filtering does not apply to giving.
--
-- All views keep WITH (security_invoker = true); RLS on the underlying tables
-- (church isolation) is unchanged. SELECT grants persist across REPLACE.
-- ============================================================

-- ---------- attendance_per_occurrence (+ location_id) ----------
CREATE OR REPLACE VIEW attendance_per_occurrence WITH (security_invoker = true) AS
SELECT
  si.id                AS service_instance_id,
  si.church_id,
  si.location_id,
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
GROUP BY si.id, si.church_id, si.location_id, si.service_template_id, si.service_date;

-- ---------- volunteers_per_occurrence (+ location_id) ----------
CREATE OR REPLACE VIEW volunteers_per_occurrence WITH (security_invoker = true) AS
SELECT
  si.id AS service_instance_id,
  si.church_id,
  si.location_id,
  si.service_template_id,
  si.service_date,
  SUM(me.value) AS total_volunteers
FROM service_instances si
LEFT JOIN metric_entries me
  ON me.service_instance_id = si.id
 AND me.reporting_tag_code = 'VOLUNTEERS'
 AND me.is_not_applicable = false
WHERE si.status = 'active'
GROUP BY si.id, si.church_id, si.location_id, si.service_template_id, si.service_date;

-- ---------- metric_entries_readable (+ location_id) ----------
CREATE OR REPLACE VIEW metric_entries_readable WITH (security_invoker = true) AS
SELECT
  me.id,
  me.church_id,
  me.location_id,
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

-- security_invoker views: re-grant SELECT (REPLACE preserves grants, but be explicit).
GRANT SELECT ON attendance_per_occurrence TO authenticated;
GRANT SELECT ON volunteers_per_occurrence TO authenticated;
GRANT SELECT ON metric_entries_readable   TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE — 3 views re-defined with location_id; giving stays
-- church-wide; no tables/data changed. Review, then apply_migration.
-- ============================================================
