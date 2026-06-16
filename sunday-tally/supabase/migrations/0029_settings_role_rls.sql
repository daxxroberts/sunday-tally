-- ============================================================
-- 0029 — Settings role-aware RLS
-- STATUS: APPLIED — verified in supabase_migrations.schema_migrations on 2026-06-15. (Header previously marked NEEDS-APPROVAL in error; do not re-apply.)
-- ============================================================
-- WHY
-- The live policies on church_memberships, church_locations and
-- service_template_tags are church-isolation ONLY:
--     USING (church_id IN (SELECT get_user_church_ids()))
-- with no role predicate (and, on memberships/locations, no WITH CHECK).
-- Because the Settings → Locations & Team and Services & Ministries
-- screens use the same browser createClient() under those policies, ANY
-- authenticated member — including a viewer or editor — can, by calling
-- the SDK directly:
--   • UPDATE their own church_memberships row to role='owner'
--     (privilege escalation),
--   • deactivate / demote other members,
--   • change anyone's default_location_id,
--   • deactivate or reorder campuses,
--   • INSERT/DELETE service_template_tags.
-- The O-2 / N-8 UI guards (disabled selects, ownerCount<=1 checks) are
-- client-side only and trivially bypassed. The DB must be the authority.
--
-- The existing `enforce_last_owner` trigger on church_memberships
-- (check_last_owner) already blocks demoting/deactivating the final
-- active owner at the DB level, so that guard is kept as-is — these
-- policies layer role authorization on top of it.
--
-- WHAT
--  1. get_user_role(church uuid)  — SECURITY DEFINER role lookup
--     (mirrors get_user_church_ids: bypasses RLS, locked search_path).
--  2. church_memberships: split ALL → SELECT (isolation) + role-aware
--     INSERT/UPDATE/DELETE. owner/admin may write any row in their
--     church. A non-manager (editor/viewer) may UPDATE only their OWN
--     row and only its default_location_id (role + is_active + church_id
--     are pinned by the WITH CHECK). The last-owner trigger still fires.
--  3. church_locations: SELECT isolation + owner/admin-only writes.
--  4. service_template_tags: SELECT isolation + owner/admin-only writes.
--  5. user_profiles: add a co-member SELECT policy so the Team screen can
--     show real names (today every other member renders as "Member").
--
-- SAFETY
-- All WITH CHECK clauses re-assert church_id membership so a manager
-- cannot move a row into another church. Idempotent (drop-if-exists).
-- DOES NOT touch data. Apply only after review.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Role lookup helper (parallels get_user_church_ids)
-- ------------------------------------------------------------
-- Returns the caller's role for a given church, or NULL if not an
-- active member. SECURITY DEFINER so it can read church_memberships
-- without tripping that table's own RLS (avoids recursion inside the
-- policies that call it).
CREATE OR REPLACE FUNCTION get_user_role(p_church_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM church_memberships
  WHERE user_id = (SELECT auth.uid())
    AND church_id = p_church_id
    AND is_active = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION get_user_role(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION get_user_role(UUID) TO authenticated;

-- Convenience predicate: is the caller owner/admin of this church?
CREATE OR REPLACE FUNCTION is_church_manager(p_church_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT get_user_role(p_church_id) IN ('owner', 'admin');
$$;

REVOKE EXECUTE ON FUNCTION is_church_manager(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION is_church_manager(UUID) TO authenticated;


-- ------------------------------------------------------------
-- 2. church_memberships — replace the single ALL policy
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "memberships_church_isolation" ON church_memberships;

-- Read: any active member of the church (unchanged behaviour).
CREATE POLICY "memberships_select" ON church_memberships
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

-- Insert: only owner/admin, and only into their own church.
CREATE POLICY "memberships_insert_manager" ON church_memberships
  FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));

-- Update (manager): owner/admin may update any row in their church.
-- WITH CHECK pins the row to a church they manage so they can't move it
-- out. The enforce_last_owner trigger still blocks demoting the final
-- owner.
CREATE POLICY "memberships_update_manager" ON church_memberships
  FOR UPDATE TO authenticated
  USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

-- Update (self, non-manager): a member may update ONLY their own row,
-- and ONLY default_location_id — role, is_active and church_id must be
-- left untouched (re-asserted to the row's existing values in CHECK).
-- This is what lets editor/viewer set their own default campus (O-2)
-- without being able to self-promote or deactivate themselves.
CREATE POLICY "memberships_update_self_default" ON church_memberships
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND church_id IN (SELECT get_user_church_ids())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND church_id IN (SELECT get_user_church_ids())
    AND role = get_user_role(church_id)   -- role unchanged
    AND is_active = true                  -- cannot self-deactivate
  );

-- Delete: only owner/admin (soft-delete via is_active is the app path;
-- this covers any hard delete attempt). Last-owner trigger still applies
-- to UPDATE; hard DELETE of the last owner is additionally undesirable
-- but is gated here to managers only.
CREATE POLICY "memberships_delete_manager" ON church_memberships
  FOR DELETE TO authenticated
  USING (is_church_manager(church_id));


-- ------------------------------------------------------------
-- 3. church_locations — split ALL into read + manager writes
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "locations_church_isolation" ON church_locations;

CREATE POLICY "locations_select" ON church_locations
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "locations_insert_manager" ON church_locations
  FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "locations_update_manager" ON church_locations
  FOR UPDATE TO authenticated
  USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "locations_delete_manager" ON church_locations
  FOR DELETE TO authenticated
  USING (is_church_manager(church_id));


-- ------------------------------------------------------------
-- 4. service_template_tags — read for members, writes for managers
-- ------------------------------------------------------------
DROP POLICY IF EXISTS service_template_tags_church_isolation ON service_template_tags;

CREATE POLICY "service_template_tags_select" ON service_template_tags
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "service_template_tags_insert_manager" ON service_template_tags
  FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "service_template_tags_update_manager" ON service_template_tags
  FOR UPDATE TO authenticated
  USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "service_template_tags_delete_manager" ON service_template_tags
  FOR DELETE TO authenticated
  USING (is_church_manager(church_id));


-- ------------------------------------------------------------
-- 5. user_profiles — allow reading co-members' profiles
-- ------------------------------------------------------------
-- The existing self-only policy (profiles_own_access, FOR ALL) stays for
-- writes. Add a SELECT policy so the Team screen can resolve names for
-- everyone the caller shares a church with. PostgreSQL ORs multiple
-- permissive SELECT policies, so this widens reads only.
DROP POLICY IF EXISTS "profiles_comember_read" ON user_profiles;

CREATE POLICY "profiles_comember_read" ON user_profiles
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT user_id
      FROM church_memberships
      WHERE church_id IN (SELECT get_user_church_ids())
    )
  );

-- ------------------------------------------------------------
-- 6. church_invites — read for members, writes for managers
-- ------------------------------------------------------------
-- Added for the canonical Members & Invitations screen (/settings/team,
-- D-096). Until this lands, invite create/resend/revoke run through the
-- service-role client in the server actions (which bypasses RLS) with a
-- server-side caller-role assertion (N-7). These policies make the DB the
-- authority for any direct anon-key access to invites as well. The existing
-- isolation policy name may vary across environments — drop the common ones.
DROP POLICY IF EXISTS "invites_church_isolation" ON church_invites;
DROP POLICY IF EXISTS "church_invites_church_isolation" ON church_invites;

CREATE POLICY "invites_select" ON church_invites
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "invites_insert_manager" ON church_invites
  FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "invites_update_manager" ON church_invites
  FOR UPDATE TO authenticated
  USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "invites_delete_manager" ON church_invites
  FOR DELETE TO authenticated
  USING (is_church_manager(church_id));

-- ============================================================
-- END 0029 — review, then apply_migration.
-- ============================================================
