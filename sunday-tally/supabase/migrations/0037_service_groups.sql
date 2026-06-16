-- ============================================================
-- Migration 0037 — reporting groups for services
-- STATUS: APPLIED — verified in supabase_migrations.schema_migrations on 2026-06-15. (Header previously marked NEEDS-APPROVAL in error; do not re-apply.)
-- Dependencies: none (0038 depends on THIS).
-- Spec: IRIS_SERVICES_RESTRUCTURE_ELEMENT_MAP.md §5 · CONCEPT_AI_WIDGETS
--       Addendum 2.
-- ============================================================
-- WHY: how a church TRACKS (per service, per campus) is not how it
-- REPORTS ("all our morning services together", across campuses).
-- A reporting group is a label on the service — purely a reporting
-- axis. Setup never requires it; ungrouped services keep working and
-- bucket as "—" in grouped widgets.
--
-- RLS modeled on the APPLIED patterns (0029 helpers + 0033 style).
-- 0032 is NOT applied — intentionally not referenced.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_service_group_code UNIQUE (church_id, code)
);

CREATE INDEX IF NOT EXISTS idx_service_groups_church ON service_groups (church_id);

ALTER TABLE service_groups ENABLE ROW LEVEL SECURITY;

-- Read: any member of the church (mirrors service_templates visibility).
DROP POLICY IF EXISTS service_groups_select ON service_groups;
CREATE POLICY service_groups_select ON service_groups
  FOR SELECT USING (church_id IN (SELECT get_user_church_ids()));

-- Writes: owner/admin (service settings are owner/admin surfaces).
DROP POLICY IF EXISTS service_groups_insert ON service_groups;
CREATE POLICY service_groups_insert ON service_groups
  FOR INSERT WITH CHECK (is_church_manager(church_id));

DROP POLICY IF EXISTS service_groups_update ON service_groups;
CREATE POLICY service_groups_update ON service_groups
  FOR UPDATE USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

DROP POLICY IF EXISTS service_groups_delete ON service_groups;
CREATE POLICY service_groups_delete ON service_groups
  FOR DELETE USING (is_church_manager(church_id));

-- The service → group link. ON DELETE SET NULL: removing a group never
-- breaks a service; it just becomes ungrouped.
ALTER TABLE service_templates
  ADD COLUMN IF NOT EXISTS reporting_group_id UUID
  REFERENCES service_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_templates_reporting_group
  ON service_templates (reporting_group_id) WHERE reporting_group_id IS NOT NULL;

-- ============================================================
-- MIGRATION COMPLETE — additive only; no data changed; no view changed
-- (0038 exposes service_group_code on the reporting views).
-- ============================================================
