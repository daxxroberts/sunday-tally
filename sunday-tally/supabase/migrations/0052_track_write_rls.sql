-- ============================================================
-- 0052 — role-gate "What we track" writes + depth-2 trigger
-- STATUS: NEEDS-APPROVAL — FILE ONLY. Do NOT apply until Daxx gives an
--         explicit per-action go. This CHANGES who may write to `metrics` and
--         `service_tags`; apply it in the SAME phase that confirms/gates the
--         importer (see IMPORTER note below) so role-gating the anon client
--         can't strand a half-built import.
-- Branch: feat/track-mirrored-metrics
-- Plan:   ~/.claude/plans/i-need-to-think-wobbly-lecun.md
--         (blast-radius item 6 — the pre-existing RLS hole this feature leans on;
--          decision 2 — depth cap = 2 enforced by a DB trigger.)
-- ============================================================
-- WHY
--   Track mutations run on the ANON client, so RLS is the only authority. Today
--   `metrics` and `service_tags` carry isolation-ONLY policies (no role gate,
--   no WITH CHECK), and `service_tags` has NO DELETE policy at all — so any
--   viewer/editor could mutate the church's ministry model straight through the
--   SDK. This is the open #79 hole. We split both tables' write paths into:
--     • SELECT  — church isolation (EVERY member must still read: dashboards,
--                 entry screen, History, and the AI context all need it).
--     • INSERT / UPDATE / DELETE — gated by is_church_manager(church_id)
--                 (+ WITH CHECK on INSERT/UPDATE), matching the 0037 / 0042
--                 manager-write pattern.
--
--   is_church_manager(uuid) — LIVE-VERIFIED just now: SQL, STABLE, SECURITY
--   DEFINER, body `SELECT get_user_role(p_church_id) IN ('owner','admin')`.
--   Because service_tags/metrics are church-wide (no location_id today), this
--   gate effectively means owner + church-wide admin — the intended editors of
--   the church-wide ministry tree. Location-scoped restriction lives on the
--   DATA tables (0042), not on these definition tables.
--
--   SEED FUNCTIONS UNAFFECTED — LIVE-VERIFIED: seed_starter_church_setup,
--   seed_template2_church_setup, and seed_default_service_tags are all
--   SECURITY DEFINER, so they bypass RLS; onboarding seeding keeps working
--   under the new gate.
--
--   IMPORTER — the onboarding importer (src/lib/import/writers.ts via
--   /api/onboarding/import) writes BOTH tables. Its route is already
--   owner/admin-gated, so this RLS gate will not break a legitimate import;
--   but the import must run as an owner/admin (or via the service-role client)
--   or a mid-import write will be REJECTED. This is called out in the plan as a
--   same-phase must-fix (blast-radius item 1); it is a CODE change, not part of
--   this migration.
--
--   DEPTH CAP = 2 (decision 2). Server-action checks alone are bypassable (the
--   importer proved it), so the cap is enforced by a trigger on service_tags:
--   a tag may have a parent, but that parent may not itself have a parent
--   (max nesting depth 2: a group can't hold groups). The trigger fires only on
--   INSERT/UPDATE, so existing rows are grandfathered — LIVE-VERIFIED there are
--   ZERO depth-3 trees today, so nothing legacy trips it.
--
-- Idempotent: DROP POLICY / DROP TRIGGER IF EXISTS before every CREATE;
-- CREATE OR REPLACE FUNCTION. No data is touched.
-- ============================================================


-- ------------------------------------------------------------
-- 1. metrics — split the FOR-ALL isolation policy into read + manager writes.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "metrics_church_isolation" ON metrics;
DROP POLICY IF EXISTS "metrics_select"           ON metrics;
DROP POLICY IF EXISTS "metrics_insert_manager"   ON metrics;
DROP POLICY IF EXISTS "metrics_update_manager"   ON metrics;
DROP POLICY IF EXISTS "metrics_delete_manager"   ON metrics;

-- Read: any member of the church (dashboards / entries / History / AI all read).
CREATE POLICY "metrics_select" ON metrics
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "metrics_insert_manager" ON metrics
  FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "metrics_update_manager" ON metrics
  FOR UPDATE TO authenticated
  USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "metrics_delete_manager" ON metrics
  FOR DELETE TO authenticated
  USING (is_church_manager(church_id));


-- ------------------------------------------------------------
-- 2. service_tags — split the three isolation policies into read + manager
--    writes, and ADD the previously-missing DELETE policy.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "service_tags_select"          ON service_tags;
DROP POLICY IF EXISTS "service_tags_insert"          ON service_tags;
DROP POLICY IF EXISTS "service_tags_update"          ON service_tags;
DROP POLICY IF EXISTS "service_tags_insert_manager"  ON service_tags;
DROP POLICY IF EXISTS "service_tags_update_manager"  ON service_tags;
DROP POLICY IF EXISTS "service_tags_delete_manager"  ON service_tags;

-- Read: any member of the church (MUST stay church-isolation for all members —
-- the dashboard, entry screen and AI context all read the ministry tree).
CREATE POLICY "service_tags_select" ON service_tags
  FOR SELECT TO authenticated
  USING (church_id IN (SELECT get_user_church_ids()));

CREATE POLICY "service_tags_insert_manager" ON service_tags
  FOR INSERT TO authenticated
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "service_tags_update_manager" ON service_tags
  FOR UPDATE TO authenticated
  USING (is_church_manager(church_id))
  WITH CHECK (is_church_manager(church_id));

CREATE POLICY "service_tags_delete_manager" ON service_tags
  FOR DELETE TO authenticated
  USING (is_church_manager(church_id));


-- ------------------------------------------------------------
-- 3. Depth-2 trigger on service_tags (decision 2).
--    A tag may point at a parent, but that parent may not itself have a parent.
--    Enforced for the editor, the importer, and any future writer in one place.
--    SECURITY DEFINER so the parent lookup isn't itself RLS-filtered; the
--    lookup is scoped to NEW.parent_tag_id only, so it leaks nothing.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_service_tag_depth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_has_parent boolean;
BEGIN
  IF NEW.parent_tag_id IS NOT NULL THEN
    SELECT (p.parent_tag_id IS NOT NULL)
      INTO v_parent_has_parent
      FROM service_tags p
     WHERE p.id = NEW.parent_tag_id;

    IF COALESCE(v_parent_has_parent, false) THEN
      RAISE EXCEPTION
        'Groups can only be nested one level deep — a group cannot contain other groups.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_service_tag_depth ON service_tags;
CREATE TRIGGER trg_enforce_service_tag_depth
  BEFORE INSERT OR UPDATE ON service_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_service_tag_depth();


-- ============================================================
-- END 0052 — review, then apply_migration. No type regen needed (policies +
-- trigger only). REMINDER: gate/route the importer to owner/admin (or the
-- service-role client) in the SAME phase, and re-verify a church reset/wipe
-- (_wipe_church_content, 0047) still succeeds under the new write policies —
-- the wipe runs SECURITY DEFINER so it bypasses these policies, but confirm in
-- the end-to-end pass.
-- ============================================================
