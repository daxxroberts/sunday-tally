-- ============================================================
-- Migration 0036 — church-wide services + entries visibility
-- STATUS: APPLIED — verified in supabase_migrations.schema_migrations on 2026-06-15. (Header previously marked NEEDS-APPROVAL in error; do not re-apply.)
-- Dependencies: none (first of the 0036–0039 restructure set).
-- Spec: IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md · BUILD_FLAGS
--       "Services / What-We-Track Restructure".
-- ============================================================
-- WHY: (1) Some gatherings are not campus things — Life Groups are
-- tracked once for the whole church, weekly, regardless of where or
-- when groups meet. Modeling them as a campus-owned service made them
-- invisible at every other campus (Entries is campus-filtered).
-- `location_id IS NULL` = church-wide: one shared occurrence per date,
-- visible and editable from every campus.
-- (2) Churches need to control WHICH services appear on entry screens
-- without deactivating them → `show_in_entries`.
--
-- SEMANTICS (decided 2026-06-09, BUILD_FLAGS records the override path):
-- campus-filtered reporting EXCLUDES church-wide rows (they appear under
-- "All campuses" only). The AI-widget compiler needs no change for this:
-- `.in('location_id', ids)` never matches NULL.
--
-- NULL-safety: the existing UNIQUE constraints
--   uq (church_id, location_id, service_code)        ON service_templates
--   uq (church_id, location_id, template, date)      ON service_instances
-- treat NULLs as distinct, so they stop deduping church-wide rows.
-- Partial unique indexes below restore dedup for the NULL case.
-- ============================================================

-- 1. Allow church-wide (NULL location) templates + instances.
ALTER TABLE service_templates ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE service_instances ALTER COLUMN location_id DROP NOT NULL;

-- 2. Dedup for church-wide rows (plain UNIQUE ignores NULL rows).
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_code_churchwide
  ON service_templates (church_id, service_code)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_instance_churchwide
  ON service_instances (church_id, service_template_id, service_date)
  WHERE location_id IS NULL;

-- 3. Entries visibility toggle. Explicit boolean (NOT schedule-derived):
--    an unscheduled service must still be enterable ad hoc, and hiding a
--    service from Entries must never hide its History (History/dashboards
--    never read this column).
ALTER TABLE service_templates
  ADD COLUMN IF NOT EXISTS show_in_entries BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- MIGRATION COMPLETE — no data changed; all existing rows keep their
-- campus and remain visible in Entries (DEFAULT true).
-- Reversal: re-add NOT NULLs only after deleting/repointing NULL rows;
-- DROP INDEX uq_service_code_churchwide, uq_service_instance_churchwide;
-- ALTER TABLE service_templates DROP COLUMN show_in_entries.
-- ============================================================
