-- ============================================================
-- 0031 — churches write policy (manager-only UPDATE)  (NEEDS-APPROVAL — NOT APPLIED)
-- ============================================================
-- WHY
-- The churches table has RLS enabled (relrowsecurity = true) but only a
-- single SELECT policy live:
--     churches_member_read  FOR SELECT TO authenticated
--       USING (id IN (SELECT get_user_church_ids()))
-- 0016_grid_config.sql added the grid_config column but NO write policy,
-- and 0029_settings_role_rls.sql added owner/admin write policies for
-- church_memberships / church_locations / service_template_tags /
-- user_profiles / church_invites — but NOT for churches.
--
-- With RLS enabled and no permissive UPDATE/ALL policy, PostgreSQL
-- DEFAULT-DENIES every UPDATE on churches from the browser anon-key
-- client. That means these browser-client write paths are ALL silently
-- failing today, for EVERY role (owner included):
--   • src/app/(app)/dashboard/page.tsx:436   handleSavePrefs →
--       churches.update({ grid_config })   (excludedTotalMinistries,
--       task #70 Key Metrics config + targets)
--   • src/app/(app)/entries/page.tsx:400     saveGridPrefs →
--       churches.update({ grid_config })   (E-12 / N-8 include-in-total)
--   • src/app/(app)/settings/tracking/page.tsx:99  handleSave →
--       churches.update({ tracks_* flags })
-- (The 0016 "derive grid_config on first History visit and persist back"
-- step is likewise blocked; it is non-fatal — NULL just re-derives on the
-- next read — but it never caches.)
--
-- WHAT
-- Add an owner/admin-only UPDATE policy on churches, mirroring the 0029
-- manager pattern (is_church_manager(...) on USING and WITH CHECK). For
-- the churches table the primary key `id` IS the church id, so pinning
-- is_church_manager(id) in WITH CHECK keeps a manager from moving the row
-- to a church they do not manage and bars editor/viewer entirely.
--
-- A single table-wide UPDATE policy intentionally covers BOTH grid_config
-- and the tracks_* flags: church-level configuration and tracking toggles
-- are owner/admin concerns, consistent with the rest of Settings being
-- manager-only under 0029. Editors/viewers were never meant to mutate the
-- churches row; the dashboard/entries prefs they touch are church-wide
-- settings, not per-user state.
--
-- SAFETY
-- WITH CHECK re-asserts is_church_manager(id) so a manager cannot retarget
-- the row. Depends on is_church_manager(uuid) from 0029 (verified present
-- live). Idempotent (drop-if-exists). Does NOT touch data, does NOT widen
-- SELECT. Apply only after review.
-- ============================================================

DROP POLICY IF EXISTS "churches_update_manager" ON churches;

CREATE POLICY "churches_update_manager" ON churches
  FOR UPDATE TO authenticated
  USING (is_church_manager(id))
  WITH CHECK (is_church_manager(id));

-- ============================================================
-- END 0031 — review, then apply_migration.
-- ============================================================
