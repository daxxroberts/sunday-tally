-- ============================================================
-- Migration 0038 — expose service_group_code on reporting views
-- STATUS: NEEDS-APPROVAL — file only, NOT applied. Apply requires
-- explicit per-file Builder authorization.
-- Dependencies: REQUIRES 0037 (service_groups + reporting_group_id).
-- Spec: IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §5 W1.
-- ============================================================
-- WHY: the AI-widget compiler can only group/filter by columns the
-- views carry. Re-defines the 3 views from the 0035 text, APPENDING
-- service_group_code at the END (CREATE OR REPLACE VIEW only allows
-- appended columns — the compiler selects by NAME, position is moot).
-- JOIN-in-view (not denormalized): group membership is editable and
-- history must follow the CURRENT grouping.
-- giving_per_week stays church-wide (D-086) — no group axis.
-- All views keep WITH (security_invoker = true); table RLS unchanged.
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
  si.location_id,
  sg.code              AS service_group_code
FROM service_instances si
LEFT JOIN metric_entries me
  ON me.service_instance_id = si.id
 AND me.reporting_tag_code = 'ATTENDANCE'
 AND me.is_not_applicable = false
LEFT JOIN metrics m        ON m.id = me.metric_id
LEFT JOIN service_tags st  ON st.id = m.ministry_tag_id
LEFT JOIN service_templates stp ON stp.id = si.service_template_id
LEFT JOIN service_groups sg     ON sg.id = stp.reporting_group_id
WHERE si.status = 'active'
GROUP BY si.id, si.church_id, si.service_template_id, si.service_date, si.location_id, sg.code;

CREATE OR REPLACE VIEW volunteers_per_occurrence WITH (security_invoker = true) AS
SELECT
  si.id AS service_instance_id,
  si.church_id,
  si.service_template_id,
  si.service_date,
  SUM(me.value) AS total_volunteers,
  si.location_id,
  sg.code AS service_group_code
FROM service_instances si
LEFT JOIN metric_entries me
  ON me.service_instance_id = si.id
 AND me.reporting_tag_code = 'VOLUNTEERS'
 AND me.is_not_applicable = false
LEFT JOIN service_templates stp ON stp.id = si.service_template_id
LEFT JOIN service_groups sg     ON sg.id = stp.reporting_group_id
WHERE si.status = 'active'
GROUP BY si.id, si.church_id, si.service_template_id, si.service_date, si.location_id, sg.code;

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
  me.location_id,
  sg.code       AS service_group_code
FROM metric_entries me
JOIN metrics m         ON m.id = me.metric_id
JOIN service_tags mt   ON mt.id = m.ministry_tag_id
JOIN reporting_tags rt ON rt.id = m.reporting_tag_id
LEFT JOIN service_instances si  ON si.id = me.service_instance_id
LEFT JOIN service_templates stp ON stp.id = si.service_template_id
LEFT JOIN service_groups sg     ON sg.id = stp.reporting_group_id;

GRANT SELECT ON attendance_per_occurrence TO authenticated;
GRANT SELECT ON volunteers_per_occurrence TO authenticated;
GRANT SELECT ON metric_entries_readable   TO authenticated;

-- ============================================================
-- MIGRATION COMPLETE — 3 views re-defined with appended
-- service_group_code (NULL when the service is ungrouped or the entry
-- is period-scoped). No tables/data changed; reversible by re-applying
-- 0035 only AFTER dropping the compiler's service_group dimension.
-- ============================================================
