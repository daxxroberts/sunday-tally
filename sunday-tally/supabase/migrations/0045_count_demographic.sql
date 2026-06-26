-- ============================================================
-- Church Analytics — Per-count demographic ("who is counted")
-- Migration: 0045_count_demographic.sql
-- Applied: 2026-06-25 (via Supabase MCP).
-- ============================================================
-- WHY: A ministry already carries an audience (service_tags.tag_role:
--   ADULT_SERVICE / KIDS_MINISTRY / YOUTH_MINISTRY / OTHER). That stays —
--   it is the ministry's INTENTION ("who this ministry is for").
--   This adds a SECOND, independent axis on the COUNT: who is actually
--   being counted. Both are kept. This lets churches answer e.g.
--     • "How many KIDS volunteer in the ADULT ministry?"
--     • "How many ADULTS volunteer in the KIDS ministry?"
--
-- SCOPE (locked with Builder 2026-06-25): demographic applies to
--   ATTENDANCE and VOLUNTEERS only — both always count people. STATS and
--   GIVING do not get a demographic (enforced in the UI, not here).
--
-- MODEL: nullable column on `metrics`. NULL = inherit the ministry's
--   tag_role (the default). A non-null value is the explicit demographic
--   for that count. Resolution everywhere is:
--       COALESCE(metrics.counted_demographic, service_tags.tag_role)
--   No backfill; existing counts keep inheriting their ministry. Reuses
--   the existing tag_role enum — no new type, no lookup table.
--
-- NOTE: the three views are rebuilt from their CURRENT live definitions
--   (which already carry location_id + service_group_code from 0038/0042),
--   not the 0025 baseline. New columns are APPENDED (CREATE OR REPLACE
--   VIEW cannot reorder/drop columns).
-- ============================================================


-- ── PART A — the column ─────────────────────────────────────
ALTER TABLE metrics
  ADD COLUMN IF NOT EXISTS counted_demographic tag_role;  -- NULL = inherit ministry tag_role

COMMENT ON COLUMN metrics.counted_demographic IS
  'Who this count actually counts (independent of the ministry it lives under). NULL = inherit service_tags.tag_role. UI exposes it for ATTENDANCE and VOLUNTEERS counts only.';


-- ── PART B — attendance view honors the count demographic ───
-- Only change vs live: the four FILTERs pivot on COALESCE(count, ministry).
CREATE OR REPLACE VIEW attendance_per_occurrence WITH (security_invoker = true) AS
SELECT si.id AS service_instance_id,
    si.church_id,
    si.service_template_id,
    si.service_date,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'ADULT_SERVICE'::tag_role)  AS adults_attendance,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'KIDS_MINISTRY'::tag_role)  AS kids_attendance,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'YOUTH_MINISTRY'::tag_role) AS youth_attendance,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'OTHER'::tag_role)          AS other_attendance,
    sum(me.value) AS total_attendance,
    si.location_id,
    sg.code AS service_group_code
   FROM service_instances si
     LEFT JOIN metric_entries me ON me.service_instance_id = si.id AND me.reporting_tag_code = 'ATTENDANCE'::text AND me.is_not_applicable = false
     LEFT JOIN metrics m ON m.id = me.metric_id
     LEFT JOIN service_tags st ON st.id = m.ministry_tag_id
     LEFT JOIN service_templates stp ON stp.id = si.service_template_id
     LEFT JOIN service_groups sg ON sg.id = stp.reporting_group_id
  WHERE si.status = 'active'::text
  GROUP BY si.id, si.church_id, si.service_template_id, si.service_date, si.location_id, sg.code;


-- ── PART C — volunteers view gains a demographic pivot ──────
-- total_volunteers + location_id + service_group_code stay in place; the
-- four demographic columns are APPENDED. Adds the m + st joins (absent before).
CREATE OR REPLACE VIEW volunteers_per_occurrence WITH (security_invoker = true) AS
SELECT si.id AS service_instance_id,
    si.church_id,
    si.service_template_id,
    si.service_date,
    sum(me.value) AS total_volunteers,
    si.location_id,
    sg.code AS service_group_code,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'ADULT_SERVICE'::tag_role)  AS adults_volunteers,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'KIDS_MINISTRY'::tag_role)  AS kids_volunteers,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'YOUTH_MINISTRY'::tag_role) AS youth_volunteers,
    sum(me.value) FILTER (WHERE COALESCE(m.counted_demographic, st.tag_role) = 'OTHER'::tag_role)          AS other_volunteers
   FROM service_instances si
     LEFT JOIN metric_entries me ON me.service_instance_id = si.id AND me.reporting_tag_code = 'VOLUNTEERS'::text AND me.is_not_applicable = false
     LEFT JOIN metrics m ON m.id = me.metric_id
     LEFT JOIN service_tags st ON st.id = m.ministry_tag_id
     LEFT JOIN service_templates stp ON stp.id = si.service_template_id
     LEFT JOIN service_groups sg ON sg.id = stp.reporting_group_id
  WHERE si.status = 'active'::text
  GROUP BY si.id, si.church_id, si.service_template_id, si.service_date, si.location_id, sg.code;


-- ── PART D — firehose exposes both axes (ministry AND demographic) ──
-- counted_demographic APPENDED at the very end.
CREATE OR REPLACE VIEW metric_entries_readable WITH (security_invoker = true) AS
SELECT me.id,
    me.church_id,
    m.name AS metric_name,
    mt.name AS ministry_tag_name,
    mt.code AS ministry_tag_code,
    mt.tag_role,
    rt.code AS reporting_tag_code,
    rt.name AS reporting_tag_name,
    rt.unit_kind,
    m.scope,
    m.is_canonical,
    me.service_instance_id,
    si.service_date,
    si.status AS instance_status,
    me.period_anchor,
    COALESCE(si.service_date, me.period_anchor) AS effective_date,
    me.value,
    me.is_not_applicable,
    me.created_at,
    me.updated_at,
    me.location_id,
    sg.code AS service_group_code,
    COALESCE(m.counted_demographic, mt.tag_role) AS counted_demographic
   FROM metric_entries me
     JOIN metrics m ON m.id = me.metric_id
     JOIN service_tags mt ON mt.id = m.ministry_tag_id
     JOIN reporting_tags rt ON rt.id = m.reporting_tag_id
     LEFT JOIN service_instances si ON si.id = me.service_instance_id
     LEFT JOIN service_templates stp ON stp.id = si.service_template_id
     LEFT JOIN service_groups sg ON sg.id = stp.reporting_group_id;


-- ── PART E — re-grant (CREATE OR REPLACE preserves; belt-and-suspenders) ──
GRANT SELECT ON attendance_per_occurrence  TO authenticated;
GRANT SELECT ON volunteers_per_occurrence  TO authenticated;
GRANT SELECT ON metric_entries_readable    TO authenticated;


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New column:
--   metrics.counted_demographic tag_role NULL  (NULL = inherit ministry)
-- Views changed:
--   attendance_per_occurrence  — pivot now COALESCE(counted_demographic, tag_role)
--   volunteers_per_occurrence  — NEW demographic pivot columns appended
--                                (adults/kids/youth/other_volunteers)
--   metric_entries_readable    — counted_demographic (resolved) appended
-- Backward compatible: no column dropped/renamed; existing columns + order kept.
-- ============================================================
