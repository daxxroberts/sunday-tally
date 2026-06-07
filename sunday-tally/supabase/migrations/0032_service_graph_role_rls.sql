-- ============================================================
-- 0032 — Service-graph role-aware RLS  (NEEDS-APPROVAL — NOT APPLIED)
-- ============================================================
-- WHY
-- The service-graph tables each carry a single church-isolation ALL policy
-- for `authenticated` with no role predicate:
--     service_templates        → service_templates_church_isolation
--     service_schedule_versions → schedule_versions_church_isolation
--     service_instances         → service_occurrences_church_isolation
--     metric_entries            → metric_entries_church_isolation
-- So ANY active member — including a viewer — can create/edit/delete services,
-- schedules, occurrences, and write metric values via the browser SDK.
--
-- Role model (Builder, confirmed 2026-06-07):
--   • Owner / Admin (multiple admins allowed) — set up & update the app:
--     services, schedules, ministries, tags, locations, members, config.
--   • Editor — enters the week's data. This INCLUDES creating the occurrence
--     that entry requires (materialize-on-entry + the History grid). Editors
--     do NOT do app setup/config.
--   • Viewer — read-only (dashboards).
--
-- WHAT
--  1. service_templates / service_schedule_versions: SELECT for all members +
--     OWNER/ADMIN-only writes (is_church_manager) — these are app config.
--     schedule_versions has no church_id, so it is scoped through its template.
--  2. service_instances: SELECT for all members + EDITOR-AND-ABOVE writes
--     (owner/admin/editor) — creating an occurrence is part of entering data.
--  3. metric_entries: SELECT for all members + EDITOR-AND-ABOVE writes.
--
-- Depends on get_user_church_ids(), is_church_manager(uuid), get_user_role(uuid)
-- from 0001/0029 (all verified present live). Mirrors the 0029/0031 pattern.
-- Every WITH CHECK re-asserts the church/role. Idempotent (drop-if-exists).
-- DOES NOT touch data. Apply only after review.
-- ============================================================


-- ------------------------------------------------------------
-- 1. service_templates — isolation read + owner/admin writes (app config)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "service_templates_church_isolation" ON service_templates;

CREATE POLICY "service_templates_select" ON service_templates
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "service_templates_insert_manager" ON service_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "service_templates_update_manager" ON service_templates
  FOR UPDATE TO authenticated
  USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "service_templates_delete_manager" ON service_templates
  FOR DELETE TO authenticated
  USING (is_church_manager(church_id));


-- ------------------------------------------------------------
-- 2. service_schedule_versions — scoped through parent template (app config)
-- ------------------------------------------------------------
-- No church_id column; isolation and role both resolve via the owning template.
DROP POLICY IF EXISTS "schedule_versions_church_isolation" ON service_schedule_versions;

CREATE POLICY "schedule_versions_select" ON service_schedule_versions
  FOR SELECT TO authenticated
  USING (
    service_template_id IN (
      SELECT id FROM service_templates
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );

CREATE POLICY "schedule_versions_insert_manager" ON service_schedule_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    service_template_id IN (
      SELECT id FROM service_templates WHERE is_church_manager(church_id)
    )
  );

CREATE POLICY "schedule_versions_update_manager" ON service_schedule_versions
  FOR UPDATE TO authenticated
  USING (
    service_template_id IN (
      SELECT id FROM service_templates WHERE is_church_manager(church_id)
    )
  )
  WITH CHECK (
    service_template_id IN (
      SELECT id FROM service_templates WHERE is_church_manager(church_id)
    )
  );

CREATE POLICY "schedule_versions_delete_manager" ON service_schedule_versions
  FOR DELETE TO authenticated
  USING (
    service_template_id IN (
      SELECT id FROM service_templates WHERE is_church_manager(church_id)
    )
  );


-- ------------------------------------------------------------
-- 3. service_instances (the god node) — isolation read + editor+ writes
-- ------------------------------------------------------------
-- Editors create occurrences: materializing the occurrence is part of entering
-- the week's data (the editor's core job), so writes are allowed for
-- owner/admin/editor. Viewers are read-only. The lazy materialize path and the
-- History grid both create occurrences through this; both are editor-facing.
DROP POLICY IF EXISTS "service_occurrences_church_isolation" ON service_instances;

CREATE POLICY "service_instances_select" ON service_instances
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "service_instances_insert_editor" ON service_instances
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role(church_id) IN ('owner', 'admin', 'editor'));

CREATE POLICY "service_instances_update_editor" ON service_instances
  FOR UPDATE TO authenticated
  USING (get_user_role(church_id) IN ('owner', 'admin', 'editor'))
  WITH CHECK (get_user_role(church_id) IN ('owner', 'admin', 'editor'));

CREATE POLICY "service_instances_delete_editor" ON service_instances
  FOR DELETE TO authenticated
  USING (get_user_role(church_id) IN ('owner', 'admin', 'editor'));


-- ------------------------------------------------------------
-- 4. metric_entries — isolation read + editor+ writes
-- ------------------------------------------------------------
-- Editors log data. Writes allowed for owner/admin/editor; viewers read only.
DROP POLICY IF EXISTS "metric_entries_church_isolation" ON metric_entries;

CREATE POLICY "metric_entries_select" ON metric_entries
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "metric_entries_insert_editor" ON metric_entries
  FOR INSERT TO authenticated
  WITH CHECK (get_user_role(church_id) IN ('owner', 'admin', 'editor'));

CREATE POLICY "metric_entries_update_editor" ON metric_entries
  FOR UPDATE TO authenticated
  USING (get_user_role(church_id) IN ('owner', 'admin', 'editor'))
  WITH CHECK (get_user_role(church_id) IN ('owner', 'admin', 'editor'));

CREATE POLICY "metric_entries_delete_editor" ON metric_entries
  FOR DELETE TO authenticated
  USING (get_user_role(church_id) IN ('owner', 'admin', 'editor'));

-- ============================================================
-- END 0032 — review, then apply_migration.
-- ============================================================
