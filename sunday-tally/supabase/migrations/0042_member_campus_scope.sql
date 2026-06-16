-- ============================================================
-- 0042 — Per-campus member restriction (RLS-enforced)
-- STATUS: APPLIED — verified in supabase_migrations.schema_migrations on 2026-06-15. (Header previously marked NEEDS-APPROVAL in error; do not re-apply.)
-- ============================================================
-- WHY: a church member could see ALL campuses' data. RLS was church-level only
-- (church_id membership), `default_location_id` is just a view preference, and
-- `?campus=` overrides let anyone switch. Owner requirement: a member can be
-- locked to specific campuses and must NOT see others unless set to all-campuses.
-- Role (what you can do) and campus-scope (which campus's data you see) are
-- orthogonal — anyone, including owners/admins, can be restricted. RLS is the
-- hard boundary; the app's campus switcher is just UX.
--
-- This migration ALSO folds in the role-aware service-graph writes that the
-- never-applied 0032 intended (the live tables still carry the old single
-- `*_church_isolation` ALL policies that let any member write). 0032 is neutered
-- in the same change so it can't regress these policies later.
--
-- WHAT
--  1. Schema: church_memberships.location_scope ('all'|'restricted', DEFAULT
--     'all' = every existing member keeps full access, zero backfill) +
--     church_membership_locations junction (allowed campuses) + the same scope
--     staged on church_invites (copied to the junction at acceptance).
--  2. Helper user_can_see_location(church, location): member of church AND
--     (scope='all' OR location IS NULL OR location in their junction). INVARIANT:
--     NULL location = church-wide / period giving = ALWAYS visible to everyone.
--  3. Gate SELECT by location on the location-bearing tables (church_locations,
--     service_templates, service_instances, metric_entries, and
--     service_schedule_versions via its template). Definition tables
--     (service_tags, metrics, reporting_tags, service_groups, service_template_tags)
--     stay church-level so restricted members can still render the UI. Editor
--     writes on instances/entries get the same gate; config writes (templates,
--     locations, schedules) are manager-only by role (role governs config).
--  4. Guardrail trigger: the last active all-campus owner can't be restricted /
--     demoted / deactivated (church must always keep someone who sees everything).
--
-- Depends on get_user_church_ids(), is_church_manager(uuid), get_user_role(uuid)
-- (all live). Idempotent. Reversible by dropping the column/table/policies.
-- ============================================================


-- ------------------------------------------------------------
-- 1. SCHEMA
-- ------------------------------------------------------------
ALTER TABLE church_memberships
  ADD COLUMN IF NOT EXISTS location_scope text NOT NULL DEFAULT 'all';
ALTER TABLE church_memberships DROP CONSTRAINT IF EXISTS church_memberships_location_scope_check;
ALTER TABLE church_memberships ADD CONSTRAINT church_memberships_location_scope_check
  CHECK (location_scope IN ('all','restricted'));

CREATE TABLE IF NOT EXISTS church_membership_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES church_memberships(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES church_locations(id)   ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_membership_location UNIQUE (membership_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_mloc_membership ON church_membership_locations (membership_id);
CREATE INDEX IF NOT EXISTS idx_mloc_location   ON church_membership_locations (location_id);
ALTER TABLE church_membership_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mloc_select" ON church_membership_locations;
CREATE POLICY "mloc_select" ON church_membership_locations FOR SELECT TO authenticated
  USING (membership_id IN (SELECT id FROM church_memberships
                           WHERE church_id IN (SELECT get_user_church_ids())));
DROP POLICY IF EXISTS "mloc_write_manager" ON church_membership_locations;
CREATE POLICY "mloc_write_manager" ON church_membership_locations FOR ALL TO authenticated
  USING      (membership_id IN (SELECT id FROM church_memberships WHERE is_church_manager(church_id)))
  WITH CHECK (membership_id IN (SELECT id FROM church_memberships WHERE is_church_manager(church_id)));

ALTER TABLE church_invites
  ADD COLUMN IF NOT EXISTS location_scope text   NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS location_ids   uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE church_invites DROP CONSTRAINT IF EXISTS church_invites_location_scope_check;
ALTER TABLE church_invites ADD CONSTRAINT church_invites_location_scope_check
  CHECK (location_scope IN ('all','restricted'));


-- ------------------------------------------------------------
-- 2. HELPER — user_can_see_location  (NULL location is always visible)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION user_can_see_location(p_church_id uuid, p_location_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM church_memberships cm
    WHERE cm.user_id   = (SELECT auth.uid())
      AND cm.church_id = p_church_id
      AND cm.is_active = true
      AND ( cm.location_scope = 'all'
            OR p_location_id IS NULL                       -- church-wide / period giving
            OR EXISTS (SELECT 1 FROM church_membership_locations ml
                       WHERE ml.membership_id = cm.id
                         AND ml.location_id   = p_location_id) ) );
$$;
REVOKE ALL ON FUNCTION user_can_see_location(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION user_can_see_location(uuid, uuid) TO authenticated;


-- ------------------------------------------------------------
-- 3. RLS — location-gated SELECT + role-aware writes (folds 0032)
-- ------------------------------------------------------------

-- church_locations: gate SELECT by the location's own id; 0029 manager writes stay.
DROP POLICY IF EXISTS "locations_select" ON church_locations;
CREATE POLICY "locations_select" ON church_locations FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids())
         AND user_can_see_location(church_id, id));

-- service_templates: SELECT gated by location; writes manager-only (config = role).
DROP POLICY IF EXISTS "service_templates_church_isolation" ON service_templates;
DROP POLICY IF EXISTS "service_templates_select"          ON service_templates;
DROP POLICY IF EXISTS "service_templates_insert_manager"  ON service_templates;
DROP POLICY IF EXISTS "service_templates_update_manager"  ON service_templates;
DROP POLICY IF EXISTS "service_templates_delete_manager"  ON service_templates;
CREATE POLICY "service_templates_select" ON service_templates FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids())
         AND user_can_see_location(church_id, location_id));
CREATE POLICY "service_templates_insert_manager" ON service_templates FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));
CREATE POLICY "service_templates_update_manager" ON service_templates FOR UPDATE TO authenticated
  USING (is_church_manager(church_id)) WITH CHECK (is_church_manager(church_id));
CREATE POLICY "service_templates_delete_manager" ON service_templates FOR DELETE TO authenticated
  USING (is_church_manager(church_id));

-- service_schedule_versions: SELECT gated via its template's location; manager writes.
DROP POLICY IF EXISTS "schedule_versions_church_isolation" ON service_schedule_versions;
DROP POLICY IF EXISTS "schedule_versions_select"          ON service_schedule_versions;
DROP POLICY IF EXISTS "schedule_versions_insert_manager"  ON service_schedule_versions;
DROP POLICY IF EXISTS "schedule_versions_update_manager"  ON service_schedule_versions;
DROP POLICY IF EXISTS "schedule_versions_delete_manager"  ON service_schedule_versions;
CREATE POLICY "schedule_versions_select" ON service_schedule_versions FOR SELECT TO authenticated
  USING (service_template_id IN (
    SELECT id FROM service_templates st
    WHERE st.church_id IN (SELECT get_user_church_ids())
      AND user_can_see_location(st.church_id, st.location_id)));
CREATE POLICY "schedule_versions_insert_manager" ON service_schedule_versions FOR INSERT TO authenticated
  WITH CHECK (service_template_id IN (SELECT id FROM service_templates WHERE is_church_manager(church_id)));
CREATE POLICY "schedule_versions_update_manager" ON service_schedule_versions FOR UPDATE TO authenticated
  USING      (service_template_id IN (SELECT id FROM service_templates WHERE is_church_manager(church_id)))
  WITH CHECK (service_template_id IN (SELECT id FROM service_templates WHERE is_church_manager(church_id)));
CREATE POLICY "schedule_versions_delete_manager" ON service_schedule_versions FOR DELETE TO authenticated
  USING (service_template_id IN (SELECT id FROM service_templates WHERE is_church_manager(church_id)));

-- service_instances: SELECT + editor writes, both location-gated.
DROP POLICY IF EXISTS "service_occurrences_church_isolation" ON service_instances;
DROP POLICY IF EXISTS "service_instances_select"        ON service_instances;
DROP POLICY IF EXISTS "service_instances_insert_editor" ON service_instances;
DROP POLICY IF EXISTS "service_instances_update_editor" ON service_instances;
DROP POLICY IF EXISTS "service_instances_delete_editor" ON service_instances;
CREATE POLICY "service_instances_select" ON service_instances FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids())
         AND user_can_see_location(church_id, location_id));
CREATE POLICY "service_instances_insert_editor" ON service_instances FOR INSERT TO authenticated
  WITH CHECK (get_user_role(church_id) IN ('owner','admin','editor')
              AND user_can_see_location(church_id, location_id));
CREATE POLICY "service_instances_update_editor" ON service_instances FOR UPDATE TO authenticated
  USING      (get_user_role(church_id) IN ('owner','admin','editor') AND user_can_see_location(church_id, location_id))
  WITH CHECK (get_user_role(church_id) IN ('owner','admin','editor') AND user_can_see_location(church_id, location_id));
CREATE POLICY "service_instances_delete_editor" ON service_instances FOR DELETE TO authenticated
  USING (get_user_role(church_id) IN ('owner','admin','editor') AND user_can_see_location(church_id, location_id));

-- metric_entries: SELECT + editor writes, both location-gated.
DROP POLICY IF EXISTS "metric_entries_church_isolation" ON metric_entries;
DROP POLICY IF EXISTS "metric_entries_select"        ON metric_entries;
DROP POLICY IF EXISTS "metric_entries_insert_editor" ON metric_entries;
DROP POLICY IF EXISTS "metric_entries_update_editor" ON metric_entries;
DROP POLICY IF EXISTS "metric_entries_delete_editor" ON metric_entries;
CREATE POLICY "metric_entries_select" ON metric_entries FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids())
         AND user_can_see_location(church_id, location_id));
CREATE POLICY "metric_entries_insert_editor" ON metric_entries FOR INSERT TO authenticated
  WITH CHECK (get_user_role(church_id) IN ('owner','admin','editor')
              AND user_can_see_location(church_id, location_id));
CREATE POLICY "metric_entries_update_editor" ON metric_entries FOR UPDATE TO authenticated
  USING      (get_user_role(church_id) IN ('owner','admin','editor') AND user_can_see_location(church_id, location_id))
  WITH CHECK (get_user_role(church_id) IN ('owner','admin','editor') AND user_can_see_location(church_id, location_id));
CREATE POLICY "metric_entries_delete_editor" ON metric_entries FOR DELETE TO authenticated
  USING (get_user_role(church_id) IN ('owner','admin','editor') AND user_can_see_location(church_id, location_id));


-- ------------------------------------------------------------
-- 4. GUARDRAIL — never lock the church out of all-campus access
-- ------------------------------------------------------------
-- A church must always keep at least one active owner with location_scope='all'.
-- Block restricting / demoting / deactivating the last such owner. (The
-- service-role client bypasses RLS, so the server action re-checks too; this
-- trigger is the DB-level backstop, alongside 0001's check_last_owner.)
CREATE OR REPLACE FUNCTION check_last_all_campus_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'owner' AND OLD.is_active AND OLD.location_scope = 'all'
     AND (NEW.location_scope <> 'all' OR NEW.is_active = false OR NEW.role <> 'owner') THEN
    IF (SELECT count(*) FROM church_memberships
        WHERE church_id = OLD.church_id
          AND role = 'owner' AND is_active AND location_scope = 'all'
          AND id <> OLD.id) = 0 THEN
      RAISE EXCEPTION 'Cannot restrict or remove the last all-campus owner of this church.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_last_all_campus_owner ON church_memberships;
CREATE TRIGGER enforce_last_all_campus_owner
  BEFORE UPDATE ON church_memberships
  FOR EACH ROW EXECUTE FUNCTION check_last_all_campus_owner();

-- ============================================================
-- END 0042 — review, then apply_migration. After apply, optionally backfill
-- metric_entries.location_id from the occurrence (see header gotcha) so legacy
-- NULL instance entries don't leak to restricted members.
-- ============================================================
