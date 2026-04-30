-- ============================================================
-- Church Analytics — Primary Tag on Service Templates
-- Migration: 0009_service_primary_tag.sql
-- Generated: 2026-04-09
-- Decisions: D-042 · D-043 · D-044
-- ============================================================
-- Every service has one primary tag — its stable reporting
-- identity on the dashboard (Morning, Evening, Midweek, etc.)
-- Primary tag is required for a service to appear in T1.
--
-- Subtags (campaigns, series, etc.) remain in service_template_tags
-- (many-to-many). Primary tag is a direct FK on service_templates.
--
-- Dashboard rows = distinct primary_tag_id values across active
-- services. Click a row → audience drill-down (Main/Kids/Youth).
-- Click audience → subtag filter available.
--
-- service_template_tags now stores SUBTAGS ONLY.
-- Primary tag stored on service_templates.primary_tag_id.
--
-- F-new-11 mitigations:
--   1. Inline rename in T6 — no need to delete and recreate
--   2. Hard delete blocked when occurrences exist (N36 — existing)
--   3. Deactivation warning when service has primary tag + history
-- ============================================================


-- ============================================================
-- PART 1 — Add primary_tag_id to service_templates
-- ============================================================

ALTER TABLE service_templates
  ADD COLUMN primary_tag_id UUID REFERENCES service_tags(id) ON DELETE SET NULL;

-- Index for dashboard query: GROUP BY primary_tag_id
CREATE INDEX idx_service_templates_primary_tag
  ON service_templates (primary_tag_id)
  WHERE is_active = true;


-- ============================================================
-- PART 2 — T1 gate view
-- Active services for a church that have a primary tag set.
-- T1 only shows services where primary_tag_id IS NOT NULL.
-- ============================================================

CREATE OR REPLACE VIEW active_tagged_services WITH (security_invoker = true) AS
SELECT
  st.id                 AS template_id,
  st.church_id,
  st.display_name,
  st.location_id,
  st.sort_order,
  st.primary_tag_id,
  tag.tag_name          AS primary_tag_name,
  tag.tag_code          AS primary_tag_code
FROM service_templates st
JOIN service_tags tag ON tag.id = st.primary_tag_id
WHERE st.is_active = true
  AND st.primary_tag_id IS NOT NULL;

-- Note: P12 and P12b should JOIN through active_tagged_services
-- rather than service_templates directly to enforce the primary
-- tag gate automatically.


-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Schema now: 19 tables · 9 migrations
--             (+ 1 view: active_tagged_services)
--
-- service_templates changes:
--   + primary_tag_id (UUID FK → service_tags, nullable,
--                     SET NULL on tag delete)
--   + idx_service_templates_primary_tag
--
-- service_template_tags now stores SUBTAGS ONLY.
-- Primary tag is the direct FK — not in the junction table.
--
-- T1 gate:
--   P12 and P12b JOIN active_tagged_services (not service_templates)
--   Services without primary_tag_id never appear in T1
--
-- T6 setup:
--   primary_tag_id required — Continue button disabled without it
--   Subtags optional — add any from service_template_tags
--   Inline rename: edit display_name in place — no delete needed
--
-- Dashboard query pattern (primary tag rows):
--   SELECT primary_tag_code, SUM(attendance) ...
--   FROM service_occurrences so
--   JOIN active_tagged_services ats
--     ON ats.template_id = so.service_template_id
--   GROUP BY ats.primary_tag_code
--
-- Drill-down (audience within a primary tag):
--   + WHERE ats.primary_tag_code = $tag_code
--   + SELECT main_attendance, kids_attendance, youth_attendance
--
-- Subtag filter (after audience drill-down):
--   + JOIN service_occurrence_tags sot
--       ON sot.service_occurrence_id = so.id
--      AND sot.service_tag_id = $subtag_id
--
-- F-new-11 mitigations in T6:
--   1. Display name editable inline — no delete/recreate needed
--   2. Hard delete blocked when occurrences exist (N36 existing)
--   3. Deactivation warning: "This service has [X] weeks of
--      [primary tag name] data. Deactivating removes it from
--      future Sundays but keeps it in your dashboard history."
--
-- apply_tag_to_occurrences() unchanged — still stamps
-- service_occurrence_tags for subtag assignments.
-- Primary tag stamping not needed — queried via template FK.
-- ============================================================
